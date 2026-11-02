# LLM 调用与宿主侧输入 token 成本审查（2026-11-02）

## 背景

再次审查整体架构，聚焦每一次 LLM 调用的输入构成与冗余，目标是降低长期聊天成本。
审查对象：`dsh-qqbot-brain` 全部源码 + 官方 `@tencent-connect/dsh-qqbot` /
`@deepseek-ai/dsh-system-prompt` 关键路径 + 线上数据（~/brain-data）。

## 调用全景（每轮 用户消息 → bot 回复）

### 宿主侧（官方 dsh-qqbot → deepseek-chat，每轮 1 次，最大头）

输入 = 官方 system prompt + transcript 全量（至 compaction）+ 群聊消息
（user 文本内嵌 `[Chat history]` 最近 10 条 + `[Current message]` 当前正文）。

我们经 `system-prompt/assemble` 注入 7 个 section（order 80–86，在官方 tools/policies
500–10200 之前）：

| section | 体量（实测/上限） | 变化频率 |
|---|---|---|
| brain:persona | persona.md 实测 **3396 字** | 极少变 |
| brain:digest | ≤250 字 | 每 15 轮 |
| brain:emotion | ~25 字 | 几乎每轮（衰减浮点） |
| brain:attitude | ≤3+ 行 | 随发言人/检索 |
| brain:memory | topK≤6 + 跨群≤2 + 画像≤2 行（画像各≤500/400 字） | 每轮可能变 |
| brain:clock | ~25 字 | **每轮必变** |
| brain:speaker | ~20 字 | 随发言人 |

注入合计 ≈ **3–4.5k tok/轮**，其中 persona 占 ~75%。

### 插件侧（Distiller → DeepSeek，全部走同一个 deepseek-chat）

| 调用 | 触发 | 输入构成 | 量级 |
|---|---|---|---|
| distill | **每轮末 1 次** | PROMPT 2039字 + persona 3396字（前缀≈5.4k字可缓存）+ convo（**含 history 10条** + 回复）+ 现有画像≤1.5k字 + 情绪~40字 + 已有记忆≤8×200字 + 时间 | ~4.5–8k tok in / ≤700 out |
| reviewProfiles | 画像候选变化 **或进程内未审** | REVIEW 400字 + items(previous+candidate 各≤500字×N) | ~0.7–2.5k in / ≤2048 out |
| digest | 每 15 轮 | 模板219字 + persona 3396字 + 旧摘要 + **40 轮 transcript（每轮含 history 块）** | **17–45k tok in（全系统最大单笔）** / ≤500 out |
| consolidate | 每会话冷却 24h，tick 每小时 | 模板532字 + persona + 画像 + 老 episodic 列表 | ~4–8k in / ≤700 out |
| Embedder | 当前线上 **关闭**（无 apiKey，回退 lexical） | 若开：每 assemble 一次 query + 蒸馏后取向量 + 启动回填 | BGE-M3 免费档但占用网络往返 |

DeepSeek context caching 自动开启（cache hit ≈ 0.1× 价）：distill/digest/consolidate
模板+persona 已放在 prompt 前部，**插件侧前缀缓存结构已正确**，主要吃 miss 部分。

## 冗余与优化清单（按收益排序）

### R1【高·插件侧】[Chat history] 全量进 userText → 同一条消息被重复计费 ~10 次

`parseSenderTag` 保留 `[Chat history begins…ends]` 整段（test/brain.test.ts:486 断言在案）。
后果：
- 每轮 distill convo 多付 ~300–600 字；
- digest 40 轮窗口里，同一条群消息最多重复出现 ~10 次（当轮正文 + 后续 ~9 轮 history），
  digest 单笔 17–45k tok 里估 ~60–80% 是重复 history。

注意 history 不是纯废：它兜住「没触发 bot 的环境消息」（pendingUser 只收触发轮）。
修法：`Turn` 拆 `userText`（正文）与 `historyTail`（末 2–3 条上下文）；digest convo、
检索 query、embedding query 只用正文+短尾。预期 digest 输入降 60–80%，distill 每轮省数百字。

### R2【高·宿主侧】section 顺序切断 DeepSeek 前缀缓存

官方 section 段位：identity -1000 → persona-prefix 0 → **brain 80–86** → qqbot:scope 90 →
policies 500–900 → **tools 1000–3100** → … → persona-suffix 10200。
前缀缓存断在第一个变动 section——目前是 emotion(82)，即官方 tools/policies 数千 tok
每轮全部 cache miss。

修法：稳定者留原位（persona 80、digest 81），易变者移到 **>10200**（system prompt 末尾）：
speaker → attitude → memory → emotion → clock（按稳定性递增）。语义上时刻/发言人贴近
消息体反而合理。改动 = 几个 order 数字，**宿主侧最大杠杆**。

待验证：DeepSeek 账单/usage 的 `prompt_cache_hit_tokens` 确认命中比例。

### R3【高·插件侧】digest 40 轮窗口 × 双向全文

即便剥掉 history，40 轮 user+assistant 全文仍是最大单笔。digest 只要主线脉络：
- per-turn 截断：userText/assistantText 各截 ~150 字（conv 构建处统一处理）；
- 或 `digest.windowTurns` 40 → 20–25；
- 或 `digest.everyTurns` 15 → 30（调用减半，摘要略滞后）。
更结构化的方向：digest 合并进 distill（让蒸馏顺带产出脉络增量），省掉整条调用与大窗口重读——改动大，列为后续。

### R4【中·插件侧】每轮必蒸馏，静默轮白付 ~5k tok

水聊/纯表情轮也走完整蒸馏调用。选项（需权衡情绪更新粒度）：
- `llm.distillEveryTurns`：攒批 N 轮再蒸（turnBuffer 本就按批设计，情绪=窗口净效应，语义不亏）；
- `llm.minChars`：本轮 user+assistant 总字 < 阈值且情绪平静时跳过；
- 蒸馏换免费小模型（llm.baseUrl 可配，prompt 已高度结构化，7B 档可试）。

### R5【中·正确性=省钱】distill `max_tokens: 700` 截断风险

群聊多画像（≤300字×N）+ memories×5 + emotion 的 JSON 轻松超 700 tok → 输出截断 →
`parseDistillOutput` 返回空 → **整轮蒸馏白调**。改 1500–2048（对齐 reviewProfiles 的 2048）。

### R6【中·功能冗余】embedNotes(touched) 重复取向量

endOfTurn：新 note 已 `setEmbedding(vec)`，dup 命中者向量仍有效，只有 merge target
（content 被 updateNote 改写）需要重算——当前对全部 touched 再 embed 一遍。
修：只收集「content 变化的 merge target + vec 缺失的新 note」进 embedNotes。
（线上 embedder 现关闭，属储备修复；backfill 每次启动 30s×5 条正常。）

### R7【中】画像审核重启后每会话重审

`reviewedProfiles` 是内存 map，重启清空 → 每会话首轮蒸馏把存量画像全送 review
（分散 N 次调用，模板费各付一次）。修法二选一：
- 启动时把所有画像打成一个 batch 一次 review（模板只付一次），回填 reviewedProfiles；
- 或把「已审 previous 的 hash」持久化到 ProfileEntry，重启不再重审。

### R8【低】queryEmbedding：无缓存 + 用含 history 整包做 query

每条用户消息一次 embedding 调用且在 assemble 同步路径（timeout 10s 偏长）。
剥 history 后取向量（同时提升检索质量）；加 last-query 小缓存；超时收紧到 ~3s。
（embedder 关闭时无成本，储备优化。）

### R9【低·CPU】检索索引被 reinforce 反复重建

`store.persist` 任何写都 `version++` → 命中强化（高频）也重建全量 ngram 索引。
索引只依赖 content/embedding：`retriever.query` 三处调用点把 `store.version` 换成
`store.graphVersion`（add/update/del/merge/reset/embed 才递增）即可，一行×3。

### R10【低】注入微调

- 平静态 emotion 让 `describe` 返回空，省 ~20 tok/轮；
- sess 画像（≤500字/轮恒定注入）可改为仅无 u: 命中时兜底；
- 同 actor 连续记忆行可合并 actor 前缀（每条省 ~10 tok，低优先）。

### R11【低】persona 在蒸馏侧全量重复

三个内部 prompt 各带 3396 字。蒸馏只需「角色是谁」做情绪/态度参照，可配
`llm.personaDigest`（~500 字精简版）→ 蒸馏每轮省 ~2k tok（miss 段变短）。
若确认 DeepSeek 前缀命中良好，此项可降级——缓存段本身已 0.1× 价。
人设本体瘦身是内容决策，不动。

### R12【观察】宿主 transcript 全量回放（官方行为，不可控）

官方 contextWindow=1M、~80% 阈值自动 compaction + `/compact` + tool-result pruner。
transcript 是宿主输入真正的大头且随时间线性增长；我们的 memory/digest 正是为
compact 后兜底——架构互补合理。可确认线上 compaction 阈值是否符合预期。

## 结论

架构方向正确：分层注入、判重、衰减、巩固各司其职；内部 prompt 稳定内容前置、缓存友好。
真正烧钱的三处：**宿主侧每轮注入（persona 主导 + section 顺序切断缓存）**、
**每轮一次的全量蒸馏**、**digest 的 40 轮窗口（history 重复放大 ~10 倍）**。

建议落地顺序：
1. R2 section 重排序（几行改动，宿主每轮受益）；
2. R1+R3 history 剥离 + digest 截断（插件侧最大单笔立减 60–80%）；
3. R5 max_tokens 2048（防白调）+ R6 embed 修正 + R9 graphVersion 换名（小改）；
4. R4 蒸馏攒批 / R7 审核批量化 / R11 persona 精简版（需用户拍板 trade-off）；
5. 验证：DeepSeek usage 面板看 cache hit 比例 + brain.log 蒸馏条数。

## 证据等级映射（用户追问「有无论文/行业验证」后补录）

**一档·厂商文档/行业标准（硬证据）**
- R2：DeepSeek Context Caching 官方文档（api-docs.deepseek.com/guides/kv_cache）——
  仅认「从第 0 个 token 起的相同前缀」，命中条件为完整匹配一个持久化缓存单元
  （单元 64 tok，在请求边界/公共前缀检测/固定间隔处持久化）；cache hit 价≈miss 价 1/10
  （新闻稿口径；现定价页比例更大）；`usage.prompt_cache_hit_tokens` 可验证。
  Anthropic/OpenAI prompt caching 文档同口径：stable content first。

**二档·学术论文对齐的设计模式（中强证据）**
- 检索评分公式 ≈ Generative Agents（Park et al., UIST 2023）
  `α·recency+α·importance+α·relevance` 的变体（rel 改硬门槛更保守）；
  其 reflection 为 importance 阈值触发（非每轮）→ 支撑 R4 攒批。
- `R=e^(-t/S)`+命中强化 ≈ Ebbinghaus 曲线 + ACT-R（Anderson & Schooler 1991）；
  MemoryBank（Zhong et al., AAAI 2024）同款曲线用于陪伴型 AI——场景同构。
- episodic→semantic 分层巩固 ≈ MemGPT（2023）/A-MEM（2025）主流 agent memory 范式。
- R1/R3 去冗余+截断 ≈ Lost in the Middle（Liu et al., TACL 2024）U 型注意力：
  冗余中段既浪费又掉点；关键信息置首/尾最优——同时支撑 R2 的语义合理性。
- dedupeEmbedCos ≈ SemDeDup（Abbas et al., 2023）语义级判重。
- emotionBoost ≈ 情绪唤醒调制记忆巩固（McGaugh 系研究）——验证已有设计。

**三档·工程卫生/启发式（无/弱文献）**
- R5/R6/R9 为代码级事实结论；R7 批量摊薄；150 字截断、windowTurns、order 值、
  distillEveryTurns 具体数值为启发式起点需实测调参；R11 persona 精简版有质量
  风险需 A/B，非定论。

## Resolution（2025-11-02）

### 遇到了什么问题

审查发现三条真烧钱的冗余：①易变 section（emotion 等 order 82-86）插在官方
tools/policies 之前，每轮切断 DeepSeek 前缀缓存，数千 token 稳定前缀全 miss；
②`[Chat history]` 环境块全量进 userText——每轮 distill 多付数百字，且同一批
环境消息在 digest 40 轮窗口内被重复计费近 10 次；③若干工程卫生问题：
`max_tokens:700` 截断群聊 JSON 致整轮蒸馏作废、merge/dup 记忆重复取向量、
画像审核状态只在内存中（重启全量重审）、reinforce 也触发 ngram 索引重建。

### 怎么解决的（本轮全部落地，9 文件 +353/-70）

- **R2 section 重排序**：persona(80)/digest(81) 留稳定段；speaker/attitude/
  memory/emotion/clock 移 10300-10340（官方 persona-suffix 之后、贴消息端，
  同获 Lost-in-the-Middle 位置收益）。零风险，改 order 数字。
- **R1 history 拆离**：`parseSenderTag` 拆三路——text（正文+引用块提出并入）/
  actor/history（末段≤500 字保留标记）。history 只进 `Turn.contextText` 供蒸馏
  读背景；检索 query、digest、embedding 一律不读。
- **R3 输入有界**：distill convo 单行截 800 字、contextText 只取末块（单块已含
  最近环境消息）；digest 单行截 `digest.turnCharCap`（默认 300）且完全跳过
  contextText——digest 单笔最大头消除。
- **R5 max_tokens**：蒸馏 700→2048，防群聊多画像 JSON 截断白调。
- **R6 embed 去重**：`embedNotes(touched)`→`(forEmbed)`——只有 merge 改写目标与
  取向量失败的新记忆重 embed；dup 命中、已 setEmbedding 的不再重复调。
- **R9 索引版本**：retriever.query 换 `store.graphVersion`（reinforce 只 bump
  version 不再重建 ngram 索引）；`setEmbedding` 补 graphVersion++（漏点修复）。
- **R7 审核章持久化**：`ProfileEntry.reviewed` 记上次审核产出文本，随 JSONL
  profile op 落盘；重启/换会话不再重审存量画像。附带修复：已审画像在新会话
  首次出现时直接补会话归属（纯簿记不走审核 LLM）。
- **R4 攒批开关**：`llm.distillEveryTurns`（默认 1=行为不变），>1 时攒批蒸馏，
  30 轮兜底防积压；情绪更新粒度同步变粗——配置即权衡，默认保守。
- **R11 人设精简版**：`llm.personaDigest`（默认空=用全量内核），配置后蒸馏/
  脉络/巩固三个内部 prompt 用精简人设；宿主注入段不受影响。
- **R8 query 向量缓存**：injector 按 (sessionId,query) 复用上条查询向量，
  宿主重试 assemble/复读不再重复调 embedding API。

### 验证结论

`npm run typecheck` 通过；`npm test` 113/113 通过（新增 6 用例覆盖：history
拆分+界内裁切、contextText 进蒸馏、digest 截断、攒批、审核章跨重启、embed
去重两路径）；`npm run build` 通过；`npm run eval` lexical recall 88.2%/FP40%
与记录基线完全一致——行为等价无回归。实现中修复 1 个回归（跨会话画像归属
簿记被持久化审核章跳过）+1 个测试断言转义遗漏。

### Key Decisions

- `distillEveryTurns`/`personaDigest` 做成配置而非默认行为：省 token 与情绪
  粒度/蒸馏质量的权衡交给部署方，默认保持现有行为可灰度切换。
- history 保留标记并界内截 500 字：蒸馏仍需「背景里有环境消息」的语境，
  完全删除会损失发言人归因的上下文。
- reviewed 存文本而非 hash：文本即指纹，免哈希实现且可审计。

### 后续优化方向

- 跑起来看 DeepSeek usage 的 `prompt_cache_hit_tokens` 实测命中率，验证 R2
  收益量级（文档口径 hit≈1/10 价）。
- `distillEveryTurns>1` 与 `personaDigest` 需线上 A/B：观察蒸馏质量/情绪
  曲线是否劣化再推广。
- 远期：digest 合并进 distill 单次调用（省整条调用链）、蒸馏换小模型、
  profile review 跨会话批处理。
