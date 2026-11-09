# 市面记忆架构调研报告：Letta(MemGPT) · Mem0 · Zep vs qqbot-brain

> 调研日期：2026-11-09。基准 = 本项目设计基线（见 prd.md「设计基线」节）。
> 评估口径：同构/差异 → 可借鉴点 → 引入价值（落点：内核改造 / companion deployment / 不引入）。

## 0. TL;DR

- 三家解决同一问题（LLM 无持久记忆）的不同切面：**Letta = agent 运行时 + 记忆管理范式**；**Mem0 = 记忆即服务**（事实抽取 + 检索 API）；**Zep = 时序知识图谱引擎**（Graphiti 开源内核 + 企业云）。
- 公认 benchmark（LoCoMo / LongMemEval / DMR）衡量的是**事实问答召回**，Mem0 v3（LoCoMo 91.6）与 Zep（LongMemEval +18.5%、延迟 -90%）领先；但这些分数**不预测陪伴质量**。2026 年陪伴专评（REMP / LifeSide / ZifaMem / "Best Friends, Not Forever"）一致显示瓶颈在**情绪一致性、人格稳定、关系连续性**——三家产品形态都不直接覆盖（Mem0/Zep 是纯事实层；Letta 有 persona/human 常驻块但无情绪/态度概念）。
- 对陪伴型 agent，本项目在「关系性记忆」维度已比三家都深（attitude/emotion/persona 三轨是它们都没有的）；差距在三个具体点：**agent 主动召回工具、后台整体重组（dreaming 式）、时序有效性建模**。
- **结论：不整体引入任何一家**；值得抄的思想 6 条（§6），均为内核小改或 companion 壳层设计，不破坏可审计/成本纪律。

## 1. 三家架构速览

### 1.1 Letta（前身 MemGPT）

- **渊源**：MemGPT 论文（2023, arXiv:2310.08560）把 LLM context window 当 OS 内存管理：core memory（in-context、agent 自编辑的 memory blocks）+ recall memory（会话历史外存）+ archival memory（语义搜索外存）。OS 类比 = RAM / swap / disk。
- **演进·sleep-time compute**（2025-04, arXiv:2504.13171）：双 agent 架构——primary 负责对话但**不能编辑 core memory**；sleep-time agent 在空闲期重写两个 agent 的 memory blocks，把 raw context 蒸馏成 learned context。数学 benchmark 上 Pareto 改进（把延迟敏感的推理挪到空闲期）。
- **2026 现状（Agent SDK + MemFS）**：记忆 = **git 仓库投影成的 markdown 文件树**。根目录文件每轮进 system prompt（≈core blocks）；子目录挂 `MEMORY.md` 索引、按需文件工具深读（≈文件式 recall）；可选 memfs-search mod 提供 keyword/semantic/hybrid 搜索。**Dreaming** = 后台 subagent（trigger: step-count / compaction-event；behavior: reminder / auto-launch），定期复盘近期对话、巩固记忆、重组层级（memory doctor 用 git worktree 并发改不阻塞主 agent）。**Shared memory repositories** = 多 agent 共享 git 记忆库。
- 产品形态：Letta Cloud + 自托管 local backend；Letta Code（编码 agent 产品）；模型无关。记忆编辑依赖 agent 自觉 tool call。

### 1.2 Mem0

- **论文版**（arXiv:2504.19413, 2025-04）：两阶段 pipeline——**extraction**（新消息对 + 会话 summary + 近 10 条窗口 → LLM 抽候选事实）→ **update**（每条候选事实 vs top-10 相似记忆 → LLM tool-call 四选一 ADD/UPDATE/DELETE/NOOP）。Mem0g 变体加图记忆（实体节点 + 关系三元组，Neo4j；冲突边标 invalid 而非物理删）。
- **2026 现状（Platform v3 / SDK v3）**：转向 **单遍 ADD-only 抽取**（一次 LLM 调用，不再 UPDATE/DELETE——新旧事实并存、靠检索时序消歧）；**图记忆内建于 Platform**（OSS 反而移除了外部图存储集成，Neo4j/Memgraph/Kuzu/AGE/Neptune 驱动全删）；**hybrid retrieval**（semantic + BM25 + entity boost + temporal reasoning）；agent 说的话也一等公民入记忆；user profile 聚合 API。
- 自报分数：LoCoMo **91.6**（+20）、LongMemEval **93.4**（+26）、BEAM(1M tok) 64.1；检索 <7K tokens。
- 产品形态：Mem0 Platform（托管 SaaS）+ OSS 自托管（Python/TS SDK + server）。**已有官方 `@mem0/deepseek-plugin`——同为 Cordis/dsh 宿主插件**，给宿主两个记忆工具。
- 注意：v3 图记忆只在 Platform；OSS = 抽取 + 向量 + hybrid，无图。分数为自报口径。

### 1.3 Zep / Graphiti

- **论文版**（arXiv:2501.13956, 2025-01）：时序知识图谱。三层子图：**episode**（非损耗原始消息，带 actor+时间戳）→ **semantic entity**（实体节点 + 事实边）→ **community**（label propagation 聚类 + map-reduce 摘要）。
- 关键机制：
  - **双时态**：`valid/invalid`（事实在真实世界的有效期）+ `created/expired`（系统事务时间）。新边与旧边矛盾时把旧边 `invalid_at` 设为新边 `valid_at`——保留历史而非覆盖。
  - 实体消歧：embedding top-k + 全文检索 + LLM entity resolution；speaker 自动作为实体。
  - 每条 episode 摄入约 4-6 次 LLM 调用（实体抽取→消歧→事实抽取→边消歧→时间抽取），**成本三家最高**。
  - 检索三路：cosine + BM25 + BFS 图遍历 → reranker（RRF/MMR/提及频次/图距离/cross-encoder 可选）→ 拼 context string（facts 带日期区间 + entity summaries）。
  - Community 节点支持「全局性问题」，动态扩展避免全量重算。
- **2026 现状**：Graphiti OSS 非常活跃（v0.30/0.31，2026-09/10）：combined extraction 省一次 LLM 调用、**Saga nodes**（跨 episode 叙事滚动摘要）、自定义 ontology、FalkorDB 后端、MCP server。Zep 公司本体转向企业「context layer」（Konig 图数据库服务 + 治理），Graphiti 是其开源内核。
- 自报分数：DMR 94.8%（gpt-4-turbo；作者自承 DMR 太简单，全上下文都能 94.4%）；LongMemEval gpt-4o **71.2%** vs 全上下文 60.2%，延迟 -90%，注入上下文 1.6k vs 115k tokens。
- 产品形态：Python 框架（自带 LLM/embedder/图库三件套）+ Zep Cloud 企业服务。

## 2. 与本项目基线对照

| 维度 | 本项目 | Letta | Mem0 | Zep/Graphiti |
| --- | --- | --- | --- | --- |
| 分层 | working(宿主) + episodic + semantic + attitude + digest + persona | core blocks(in-context) + recall + archival；2026 起 MemFS 文件树 | 单层 memory store（+平台内建图） | episode→entity→community 三层时序图 |
| 写入 | 轮末一次蒸馏（记忆+情绪+画像+遗忘意图），三路判重 | agent/睡眠 agent 自编辑 blocks；文件提交=记忆 | v3 单遍 ADD-only；旧版 ADD/UPDATE/DELETE/NOOP | 每 episode 多次 LLM：抽取→消歧→事实→时间→社区 |
| 检索 | **被动注入** topK（n-gram TF-IDF+embedding 混合，相关性门控） | agent 工具自查（文件读+可选搜索 mod）+ core blocks 常驻 | search API/工具（hybrid: 语义+BM25+实体+时序） | search API（cosine+BM25+BFS→rerank→context） |
| 遗忘/巩固 | R=e^−t/S 衰减 + 30 天物理遗忘；定时巩固 episodic→semantic（谱系） | dreaming 后台 subagent 巩固+重组（memory doctor） | ADD-only 不删，靠检索时序消歧；无显式遗忘 | 边 invalid_at 失效（软删）；episode 永久保留 |
| 态度/自我 | attitude 立场轨 + persona.md 内核 + 情绪 PAD + self/world 分轨（设计中） | persona/human 块=常驻自我/用户模型；**无情绪/态度** | 无（仅 user/agent/run 三维 scope） | 无（实体/事实中性） |
| 画像 | u:/sess: profile，LLM 起草+独立模型二审+幻觉校验 | human.md 块（agent 自维护） | user profile API（平台聚合） | 实体节点 summary（随新信息演化） |
| 私域/多主体 | sessionDomains + private 硬隔离 + 人工放行 | 无内建（靠 prompt 纪律） | user_id/agent_id/run_id scope | group_id 多租户 |
| 可观测/审计 | op 流水全量可重放；脑图可视化 | git 历史（MemFS 天然版本化） | history API + 平台审计日志 | 图可查，推理过程黑盒多 |
| 成本纪律 | 输入有界/可关/失败静默；~¥90/月蒸馏 | dreaming 烧后台 token；cloud 计费 | 平台按量；OSS 自担三件套 | 每 episode ~4-6 次 LLM，最贵 |
| 发言人归因 | 群聊 tag 解析 + 私聊绑定 + openid 校验 | actor=episode/speaker 实体 | user_id scope（外部给） | speaker 自动实体化 |

**同构点**（殊途同归，说明方向正确）：
- 「常驻小状态 + 外挂大记忆」：Letta core blocks ≈ 我们的 persona+attitude+emotion+digest 注入段 ≈ Mem0/Zep 的注入 context string。
- 「后台巩固」：Letta dreaming/sleep-time ≈ 我们的巩固定时器 + digest ≈ Mem0 异步 summary。
- 「非损耗底账」：Zep episode 层 ≈ 我们的 op 流水 + transcript ≈ Mem0 的 ADD-only。

**差异点**：
- 我们独有：情绪轨、态度轨、私域硬隔离、人工放行、op 可重放审计、成本一线纪律、中文 n-gram 检索（免 embedding 也能跑）。
- 他们独有：agent 主动召回工具、dreaming 式整体重组、Zep 双时态、Mem0 实体增强检索、Letta 多 agent 共享记忆库。

## 3. 逐家价值评估

### 3.1 Letta —— 不引入产品，引入思想

- 是什么：完整 agent 运行时（ADE）+ 记忆范式。MemFS 把「记忆」从抽象 block 变成 agent 可用文件工具直接读写的 git 仓库——2026 方向是 context repositories + dreaming subagents。
- 与我们的关系：**哲学最接近**（有界常驻态 + 后台巩固 + agent 可编辑），但写路径是「对话中随时改」而非我们「轮末批量蒸馏」；记忆操作靠 agent 自觉 tool call，质量控制弱于我们的蒸馏管线（判重三路 + 二审 + 私域）。
- 可借鉴：
  1. **Dreaming / memory doctor 的「整体重组」pass**——我们的巩固是 episodic→semantic 单向吸收 + 近重复清扫，没有 LLM 驱动的「审视全池、合并/降级/重写」步。
  2. **按需深读**——我们的检索是一次性 topK 注入；Letta 让 agent 用文件工具自己下钻。对应我们可加 `brain_search` 工具。
  3. 共享记忆库设计**印证**我们「world 共享 + self 分轨」的既定方向（他们叫 shared memory repositories）。
- 不值得借鉴：整体采用 Letta 运行时（它是 agent 产品不是组件）；无中文场景验证；cloud 依赖或自托管重。

### 3.2 Mem0 —— 不引入；抄两个检索小点

- 是什么：记忆即服务——抽取 pipeline + 向量/图存储 + 检索 API。工程化程度最高，市场声量最大（Platform v3、SDK、dsh 插件、profiles）。
- 与我们的关系：我们的蒸馏 + 判重比它旧版四操作更细（多产情绪/画像/态度耦合）；它 v3 的 ADD-only + 时序消歧 vs 我们的衰减 + 归并，是两种「记忆更新哲学」——它「只增不删靠检索排序」，我们「主动衰减 + 物理遗忘」。LoCoMo 91.6 证明事实召回路线已被做透。
- 可借鉴：
  1. **实体增强检索**（entity boost：query 与 memory 共享实体加权）——我们的图谱边已铺底（derived/semantic/facet），可把「与当前发言人/话题实体共现」做成轻量 boost。
  2. **时序信号进排序**——「上周/最近/将来」类查询我们有年龄标注，排序未必用时序先验（R 项或已部分覆盖，需验证）。
  3. agent 说的话一等公民——我们的蒸馏白名单已含「承诺约定/关系变化」，基本覆盖。
- 不值得借鉴：整体接入（无人格/情绪/态度/私域概念，接了等于把内核降级成通用 fact store；v3 图记忆锁 Platform；embedding-only 检索对中文短聊不如我们的 n-gram+embedding 混合）。
- 引入价值判定：它是「组件」不是「架构」，最适合作为对照证明我们蒸馏管线不落后。

### 3.3 Zep/Graphiti —— 不引入产品，引入两个思想

- 是什么：时序知识图谱框架 + 企业记忆云。最重、最「真·知识图谱」的一家。
- 与我们的关系：我们的 semantic 层 + 图谱边是它的极简版（无双时态、无实体消歧、无社区层、无 BFS 检索）；它 episode 层 = 我们的 transcript + op 流水（都是非损耗底账）。
- 可借鉴：
  1. **双时态有效期**（valid_at/invalid_at）——「他以前住 X 现在住 Y」类问题我们靠归并更新处理，但语义层事实没有显式失效窗口；可在 semantic note 加 optional validity 字段。
  2. **图谱一跳扩散召回**——正对我们「记忆扩散激活仅有图谱边铺底」的短板；我们图谱边是内存推导的、量级小，直接遍历可行。
  3. community 级摘要对应我们 digest，但跨会话主题聚类对我们体量暂不需要。
- 不值得借鉴：整体接入——Python 生态（我们 TS 零依赖）、图数据库运维、每 episode 多次 LLM 调用的成本结构（~4-6 次/轮 vs 我们 1 次蒸馏）、企业向 ontology 对 250 轮/天的体量是杀鸡用牛刀；其优势场景（跨业务系统实体对齐、合规审计）与陪伴聊天不匹配。

## 4. 陪伴型智能体专项：哪种架构实际效果可能更好

**先泼冷水**：2026 年陪伴专评的结论是**没有任何现成架构能可靠解决长期陪伴连续性**——

- REMP（EMNLP'26 Findings）：role-playing 长程评测，记忆完整性 + 情绪一致性是主要瓶颈；
- "Best Friends, Not Forever"（arXiv:2607.28818）：2,008 段对话审计，轨迹准确率均值仅 **44.4%**，用户状态召回接近随机，无模型/配置可靠保持 persona；
- LifeSide（arXiv:2606.04660）：终身陪伴 benchmark，情感陪伴分普遍 <37%；
- ZifaMem（arXiv:2607.17564）：结构化记忆（会话摘要 + 情景 + 用户模型）比裸历史 +11.4%，与 Mem0 统计等效——**「结构化」比「选哪家」更重要**；多轮信息有用（+39% 偏好），情绪状态机无增益。

在此前提下排序（针对陪伴场景）：

1. **Letta 范式（常驻关系态 + 后台巩固 + agent 可编辑记忆）——结构上最对路**。陪伴的本质是「关系状态」：用户是谁、我们什么关系、今天心情如何、上次聊到哪——需要每轮都在场的小状态（≈core blocks/persona+human）+ 空闲时反思巩固（≈dreaming）。直接对应陪伴失败模式里的 persona/emotion/relational continuity。缺点：写路径靠 agent 自觉，质量控制弱于我们的蒸馏管线；无中文验证。
2. **本项目架构——已是「Letta 范式 + 更强写路径」的超集**。常驻注入段（persona/attitude/emotion/digest）≈ core blocks；轮末蒸馏 ≈ Mem0 抽取但多产情绪/画像/遗忘意图；衰减遗忘 ≈ 三家都没有的主动遗忘；私域 + 审计 + 成本纪律是三家都没有的。差距只在：无 agent 主动召回工具、无整体重组 pass、无双时态。
3. **Mem0——事实层标杆，但不是陪伴架构**。它回答「你还记得我说过什么」很好（LoCoMo SOTA），但「你是什么样的朋友」「我现在心情如何」它没有概念。可作为 companion 壳层的 fact-recall 组件候选，但接它 = 丢掉全部差异化。
4. **Zep——时序/企业向，陪伴场景性价比最低**。双时态对「关系演变史」（「我们是什么时候变熟的」）有想象空间，但为此付每轮 4-6 次 LLM 调用 + 图数据库运维不划算；社区层对 1v1 陪伴无意义。

**结论**：陪伴型记忆的实际效果排序 ≈ Letta 范式 ≈ 本项目 > Mem0 > Zep。我们不需要换架构，需要补三个点（§6 清单 1-3）：

- **主动召回工具** `brain_search`：每轮注入是 topK 截断，陪伴对话常需「深挖」（「你还记得我去年说的那个…」）；
- **回顾重组 pass**（dreaming 式低频全池审视：合并漂移画像、重写过时 semantic、清理孤儿 attitude）；
- **双时态字段**（semantic/attitude 加 valid 区间，支持「以前…现在…」问答）。

三条都是内核小改，不碰宿主，成本可控（攒批/低频/可关）。

## 5. 前景评估

- **Letta**：公司重心已转向 agent 产品（Letta Code / ADE）与 context repositories；记忆范式影响力仍在（sleep-time compute 被广泛引用），但它不是可引用的库而是平台；MemFS + dreaming 思想会持续外溢。
- **Mem0**：商业化最激进（Platform v3、SDK、dsh 插件、profiles），benchmark 自报提升最大。风险：平台图记忆闭源、OSS 与 Platform 分叉加大、分数口径自家评测。它定义了「记忆 API」品类的市场预期（ADD-only + hybrid）；我们的蒸馏管线在事实召回上大概率打不过它的规模化调优——但陪伴场景不按 LoCoMo 评分。
- **Zep/Graphiti**：OSS 框架生命力最强（高频 release、MCP、FalkorDB、多后端），企业叙事清晰；对个人/陪伴场景过重。Graphiti 若继续演化，「episode→entity→community」三层可能成为通用范式。
- **本项目**：差异化不在「记忆召回 SOTA」（不追 LoCoMo），在「关系性记忆 + 可审计 + 成本纪律」的组合——恰是陪伴场景的真需求与三家都没做的交集。前景取决于 companion deployment 能否把 attitude/emotion 价值兑现成可感知体验。

## 6. 值得引入的清单（落点标注）

| # | 思想来源 | 内容 | 落点 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | 三家共有（主动召回） | `brain_search` 按需深挖工具：注入 topK 之上的 agent-initiated 检索 | 内核检索暴露 + companion 壳层 tool | **高**（companion 必需） |
| 2 | Letta dreaming | 低频「回顾重组」pass：全池审视、合并/降级/重写 | 内核后台循环（攒批可关） | 中 |
| 3 | Zep bi-temporal | semantic/attitude 加 valid 区间，时序问答 | 内核 schema 小改 | 中 |
| 4 | Mem0 entity boost | 检索分加「与当前发言人/话题实体共现」项 | 内核 retrieval 小改 | 低-中 |
| 5 | Zep BFS 扩散 | 以命中 note 图谱邻居一跳补召回（治「扩散激活」短板） | 内核 retrieval 小改 | 中 |
| 6 | Letta shared repos | world/self 分轨的共享-隔离结构（已定案设计的外部印证） | 11-08 设计直接采纳 | 已定 |

**不引入**：Mem0 平台/OSS 整体、Zep/Graphiti 整体、Letta 运行时。

## 7. 参考源

- MemGPT: arXiv:2310.08560；Letta sleep-time compute: arXiv:2504.13171 / letta.one/blog/sleep-time-compute；docs.letta.com（memory-blocks / archival-memory / agent-sdk/memory / concepts/memfs）
- Mem0: arXiv:2504.19413；docs.mem0.ai（migration/platform-v2-to-v3、oss-v2-to-v3、platform-vs-oss、changelog）
- Zep: arXiv:2501.13956；github.com/getzep/graphiti releases（v0.29-v0.31）；getzep.com
- 陪伴专评：REMP（EMNLP'26 Findings 602）、arXiv:2607.28818（persona collapse）、arXiv:2606.04660（LifeSide）、arXiv:2607.17564（ZifaMem）、EMNLP'26 PGMem
