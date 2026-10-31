# 记忆/上下文/人格稳定性 实现现状调研评估

> 来源：2026-10-31 用户提问「LLM 权重不修改、只调厂商 API 的前提下，如何让 AI 聊天上下文更多、记得更久、人格不漂移」。本次为纯调研评估，无代码变更。数据取自云服务器 `ubuntu@124.222.65.169` 线上运行约 1.7 天的真实数据。

## 一、当前架构分层（现状）

| 层 | 归属 | 机制 | 容量/时效 |
|---|---|---|---|
| 工作记忆 | dsh 宿主 | session transcript 全量回放（`session.v4.jsonl.zstd` 事件溯源），`contextWindow=1M`（deepseek-flash）；群聊氛围另给 `[Chat history]` 最近 10 条 | 无压缩/截断记录；30min 闲置回收内存 Agent，磁盘会话仍在 |
| 长期记忆 | brain 插件 | 每轮 `turn/end` 蒸馏 → `MemoryNote`（episodic/semantic/attitude），`R=e^(-t/S)` 衰减 + 命中强化 | JSONL+快照，44 条/5 会话 |
| 检索注入 | brain 插件 | char n-gram TF-IDF：`score=0.6·cos+0.4·R+0.2·imp/5`，topK=6，minCosine=0.04，session 内召回 | 注入 ~6-10 行 |
| 画像 | brain 插件 | 蒸馏重写，`u:<openid>`/`sess:<sid>` 键，发言人画像置顶注入 | 8 条 |
| 情绪 | brain 插件 | PAD 三维 + 自然语言 label，随时间向中性回归，按 session 存 | 6 会话 |
| 人格内核 | brain 插件 | `persona.md`（9.2KB）只读文本，每轮注入 system prompt 尾部（order 80，先于官方 scope-prompt 90） | 静态 |

## 二、线上实证数据（snapshot 2026-10-31 10:44）

- **记忆量**：44 条（episodic 29 / attitude 11 / semantic 4），5 个会话；最老 1.65 天。
- **蒸馏节奏**：`brain.log` 123 行，每轮蒸馏产出恰好 1 条记忆（偶尔 0）；画像更新率 ~70%。
- **语义巩固**：上线以来仅触发 1 次（10-30T12:10Z，session 832f，产出 4 条 semantic）。
- **情绪 label**：全部人格贴合（「嘴硬逗人但尾巴在晃」等）。
- **实际回复**：reasoning block 显示模型以「Persona: 嘴硬+耍赖」式显式规划后输出，正文人格一致、口语化达标——**人格锚定目前是三项里效果最好的**。

## 三、实测发现的问题（按严重度排序）

### P0-1 检索被「热度」主导，相关性沦为次要项

快照复算（复刻 retrieval.ts 逻辑，session 17429483）：

| query | 命中情况 |
|---|---|
| 「你是不是又胖了」 | 命中李信纠正/尾巴梗/梦泪梗（cos 0.05~0.09，仅略过 0.04 门槛），相关度低 |
| 「馆长直播好看吗」 | 只命中 1 条无关记忆（真答案在另一会话，被 session 隔离挡掉） |
| 「我生日是哪天」 | 2 条无关命中 |
| 「上次说的游戏叫什么」 | 1 条无关命中 |

原因：composite score ≈ 0.5 中 `β·R` 贡献 0.4，cos 仅贡献 ~0.05——**只要一条记忆够热，它就能压住相关性差异进 topK**。上一轮 lexical 修复解决的是「能不能召回」，没解决「召回排序被 R 主导」。

### P0-2 命中-强化正反馈锁死（马太效应）

- hits 分布：max=266，22/44 条 strength 已到 cap=10；TOP5 被反复命中的原因不是相关，而是**内容含高频词**（「demo」「群」「角色」unigram）+ 发言人保底唤起。
- 发言人 attitude 保底（含昵称即补满 3 条）每轮都触发 reinforce → 这些条目 R 恒 1.00、永不衰减 → 占住 topK 名额挤出真正相关的冷记忆。
- 后果：注入的「记忆库摘录」趋同，长期看同一批水词记忆循环刷屏。

### P0-3 蒸馏产物是「对话流水」而非「长期事实」

- 典型 note：「demo 用『嘻嘻』@角色，被角色追问『嘻嘻什么 你输了吧』」「花咲蝶舞在群里@角色并说『人偶』，角色没听懂」——记录的是**一次性拌嘴片段，含角色自己的回话**，不是用户事实/偏好/承诺。
- importance 分布 34/44 为 2 分，区分度失效；S 初值=importance → 大量 S=2 的快衰减条目。
- 叙事人称不一致（「角色」与「我」混用），且 actor 字段时而填发言人昵称时而填「用户」。

### P1-1 会话隔离：记忆不跨 session

`Retriever.query` 先 `filter(n.sessionId===sessionId)`——群 A 里建立的关于某人的记忆，在群 B/私聊永远唤不起。实测「馆长」答案在 832f，17429483 查不到。画像是唯一跨会话通道（u: 键），但……

### P1-2 画像按 openid 碎片化

QQ 的 openid 按上下文不同而不同：demo 有 `u:99449CA8...`（群主人）与 `u:FEFE5282...`（群友）两份画像，花咲蝶舞同样两份。**同一人多画像 → 信息割裂、称呼/态度不一致的隐患**。昵称可做弱归并键。

### P1-3 语义巩固几乎空转

- 触发 1 次、产出 4 条（`minAgeDays=1` + `minNotes=4` + cooldown 24h 偏保守）。
- episodic 源记忆巩固后不删除不标记 → 流水记忆持续堆积，稀释检索池。
- attitude 不参与巩固/归并，11 条态度里同对象表述已现重复（「由不得你」冲突记了 2 条）。

### P1-4 注入预算与可用上下文严重不匹配

- 实测 system prompt 6.4K 字符：persona ~3.4K + 情绪 1 行 + 立场/记忆 ~10 行 ≈ **400-800 字符有效记忆载荷**。
- 而宿主 transcript 已累积 ~100K 字符对话（230 轮）且 1M 窗口根本用不满——**瓶颈不是窗口，是我们只往里面放 10 行**。会话摘要、跨会话关联、多路召回都有巨大余量。

### P2-1 人格不漂移的现状与隐患

- 现状良好：9.2KB persona 每轮注入 system prompt 尾部，reasoning 显示模型显式按 persona 规划；情绪 label 全员人格化。
- 隐患：① transcript 无限增长稀释 persona 占比（当前 ~3.4% 且在降）；② 蒸馏 LLM（deepseek-chat）与聊天 LLM（deepseek-flash）不是同一模型，蒸馏对 persona 的理解偏「角色扮演模板」；③ 无漂移度量手段，全靠人肉体感。

### P2-2 其他观察

- `pendingUser` 只存每轮最后一条用户消息，群聊多人连发时蒸馏只看尾部（但 userText 内含 10 条 Chat history，部分弥补）。
- 蒸馏每轮 1 次 LLM 调用（temp=0, max_tokens=700），成本可控；失败静默。
- `forget` 意图删除、merge 更新机制已有且在运转（jsonl 中 update 14 次）。
- 物理遗忘 `evictAfterDays=30` 尚未到观察窗口。

## 四、初步结论

**「人格不漂移」**：当前方案有效，9KB persona 尾部注入 + 蒸馏侧情绪人格化是正确路径；主要风险是长 transcript 稀释与无度量。

**「记得更久」**：机制骨架完整（分层、衰减、强化、巩固、意图遗忘），但实测三个断点——① 蒸馏写入的是流水而非事实；② 检索排序被热度主导 + 马太锁死，相关记忆唤不起；③ 会话隔离 + 画像碎片化导致「记了但用不上」。

**「上下文更多」**：宿主 1M 窗口 + 全量 transcript 回放，容量不是瓶颈；真正瓶颈在**注入侧**——10 行记忆的带宽太窄，且缺会话级滚动摘要作为 transcript 之外的第二时间轴。

## 五、候选迭代方向（待与用户讨论后定优先级）

1. 蒸馏提质：prompt 改为「只记用户事实/偏好/承诺/关系变化，不记拌嘴流水」；importance 校准；统一人称。
2. 检索纠偏：score 中 R 降权或改乘性（relevance-gated recency）；reinforce 只对 cos>某阈值的命中生效；发言人保底条目不参与 hits 计数。
3. 记忆跨会话：按 actor openid 建二级索引，检索池=会话池∪同发言人跨会话条目。
4. 画像归并：昵称相似度/用户确认做 u: 键合并；或蒸馏时按昵称路由到已有画像。
5. 会话滚动摘要：每 N 轮或 transcript 超阈值时生成 session digest 注入，作为 transcript 与 note 之间的中间层。
6. 注入扩容：topK 分池（事实池/态度池/相关人池），总注入预算放宽到 ~2-4K 字符。
7. 评测基线：用已沉淀的真实对话建「该唤起哪条」评测集（呼应 roadmap 的"评测先行"）。
8. 巩固增强：巩固后标记/清理已吸收的 episodic；attitude 按对象归并。

## 六、修复优先级（2026-10-31 定，经用户确认「蒸馏+检索都需要修复」）

排序逻辑：先修 write-path（蒸馏写入垃圾则下游全废），同步修 read-path（评分纠偏让已有记忆能用），评测集作为尺子穿插；身份层与摘要层是「记得更久」的体感放大器；embedding 留到最后由评测结果裁决。

### P0（质量杠杆最大、改动小、无新依赖）

1. **蒸馏 prompt v2**（write-path，~2h）
   - 指令改为「只记可长期复用信息」：用户事实/偏好/承诺/关系变化/约定；明确不记一次性拌嘴、角色自己的回话（角色承诺除外）
   - importance 锚点校准：5=承诺/重要个人信息，4=稳定偏好，3=关系变化，2=一般事实，1=琐碎
   - 统一第三人称叙事；actor 规范填写；merge/forget 机制保留
2. **检索评分纠偏**（read-path，~1h）
   - 相关性门控：cos 主导排序，R 只做乘性 boost（`score=cos·(1+β·R)+γ·imp` 形态），R 不再独立撑起排名
   - reinforce 只对 cos>reinforceThreshold 的真相关命中生效
   - 发言人保底 attitude 不计 hits、不 reinforce（恒驻上下文不需要用进废退）
3. **迷你评测集**（measurement，~1h）
   - 现有 44 条真实记忆 + transcript 造 ~20 个「query→应命中/不应命中」用例
   - 算 recall@6 / 噪声条数，作为后续所有改动的尺子；不引依赖

### P1（用户可感知的「记得更久」）

4. **身份层**：检索池=本会话 ∪ 发言人 openid 的跨会话条目（限 attitude/semantic/画像）；u: 键按昵称归并同人多画像（~3-4h）
5. **会话滚动摘要 + 注入扩容**：每 N 轮/超阈值触发 LLM digest，新增注入 section；记忆分池（事实/态度/画像），预算放到 2-4K 字符（~4-6h）

### P2（后续）

6. **巩固增强**：已吸收 episodic 标记退出检索池；attitude 按对象归并；巩固触发调频

### 用户决策（2026-10-31）

- 实施范围：**P0+P1 五项全排**（蒸馏v2 / 检索纠偏 / 评测集 / 身份层 / 滚动摘要+注入扩容）
- 语义检索：**引入第二家 embedding API**（OpenAI 兼容 `/embeddings` 端点，泛化设计；推荐 SiliconFlow BGE-M3 中文友好且有免费额度，OpenAI text-embedding-3-small 亦可），需用户提供 key；无 key 时自动回退现有 lexical 路径
- 蒸馏保持每轮一次，不改批量

### 风险与注意

- 蒸馏 v2 上线后新旧记忆风格混合期，靠衰减自然淘汰，不迁移旧数据
- 评分纠偏会让 22 条 hits 虚高的热记忆作废——这是目的不是 bug
- 跨会话召回限制在发言人相关 + attitude/semantic，避免 A 群的事在 B 群被无端提起
- 蒸馏改批量（每 N 轮一次）评估过：能省调用+给 LLM 更大上下文，但延迟记忆形成、增加复杂度，本轮不做，保持每轮

## Acceptance Criteria

- [x] 代码侧机制梳理（inject/capture/distill/retrieval/consolidation/persona）
- [x] 线上 brain-data 定量分析（notes/profiles/emotions/ops/log）
- [x] 线上 transcript 侧验证（system prompt 实际装配、窗口、回放）
- [x] 输出按严重度分级的问题清单与候选方向，供用户过目定后续

## Resolution（2026-10-31）

**遇到了什么问题**：用户体感「上下文/记忆/人格」效果不够好，要求评估现状。调研确诊四个断点——蒸馏写拌嘴流水而非长期事实（importance 34/44 条为 2 分失效）；检索被 R 热度主导且保底唤起刷 hits 马太锁死（单条 hits=266）；记忆不跨会话 + 同人多 openid 画像割裂；注入带宽仅 ~10 行、1M 窗口利用率 <10%。人格稳定性反而是三项中最好的（reasoning block 证实模型显式按 persona 规划）。

**怎么解决的**：形成本调研报告并按 ROI 排定修复优先级；经用户确认范围 P0+P1 全排、引入第二家 embedding API（后定为百炼 text-embedding-v3）。全部落进 `10-31-memory-quality-fix` 任务实施。

**后续优化方向**：巩固增强（已吸收 episodic 退出检索池、attitude 归并、触发调频）；评测集持续扩充用例；漂移度量手段；蒸馏改批量的再评估。

**什么时候干的**：2026-10-31 单会话完成「代码梳理 → 线上 brain-data/transcript 定量分析 → 问题分级 → 优先级评定」。

### Key Decisions

- 蒸馏保持每轮一次（批量蒸馏省调用但延迟记忆形成，本轮不做）
- embedding 走 OpenAI 兼容 `/embeddings` 泛化设计，无 key 全链路回退 lexical
- 跨会话召回只放 attitude/semantic，episodic 流水不外溢
- 画像同名归并做读侧合并，不迁移写侧数据

### 验证结论

- 快照复算证实评分被 R 项主导（cos 贡献仅 ~0.05 vs R 0.4）
- transcript 侧证实 system prompt 尾部注入生效、contextWindow=1M、reasoning 按 persona 规划
