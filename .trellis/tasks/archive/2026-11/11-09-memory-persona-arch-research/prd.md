# 记忆与人格架构组件调研（市面方案对标）

> 调研专用会话存档。起点：以 qqbot-brain 现有记忆/人格设计为基准，调研市面架构组件（记忆框架、人格方案、陪伴产品形态），评估引入价值。

## 问题存档

- **时间**：2026-11-09 起（进行中）
- **需求**：调研市面记忆/人格架构组件，对照本项目设计评估价值——为「陪伴型 Agent 第二 deployment」（见 `11-09-companion-agent-eval`）与 brain 内核演进做技术选型储备。
- **怎么解决的**：首轮先完整读出本项目设计基线（源码 + 演进决策），形成对照基准；后续逐组件调研、逐条对照评估。

## 设计基线（本项目现状，作为对照基准）

### 记忆分层（types.ts）

- **working**：宿主 dsh 会话历史，插件不重复实现。
- **episodic**：轮末蒸馏的情景笔记 `MemoryNote`，按 `R=e^(−t/S)` 衰减（S=strength 天），真相关命中强化（reinforceStep, cap 10d），30 天物理遗忘（hits=0 ∧ R<0.2 ∧ age≥30d）。
- **semantic**：巩固定时器从老 episodic（age≥1d、≥4条/会话、未被吸收）提炼的长期知识；`sourceIds` 谱系记录「沉淀自」，源条 `absorbedAt` 退检索池；含时效锚点（明天/某月某日）的候选强制降级回 episodic。
- **attitude**：「对\<对象\>：\<立场\>」规范格式，按对象唯一（同对象原位改写）；含当前发言人昵称的条目跨检索保底唤起（≤3 条，不占 topK）。

### 检索（retrieval.ts）

- 中文免分词 char n-gram(1-3) TF-IDF 余弦 + OpenAI 兼容 embedding（可选）混合召回。
- 评分 `α·rel·(1+β·R) + γ·imp/5`——相关性是硬门槛（lex minCosine 0.04 / emb embedMinCos 0.47），R 只 boost；强化阈值与检索阈值分开（0.15 / 0.62），弱相关命中不刷 hits。
- 检索池：会话记忆 + 全局域（manual）；跨会话只召 attitude/semantic（≤2 条，标 [跨群]），episodic 不跨群。

### 写入与质量控制（index.ts endOfTurn / distill.ts）

- 轮末一次蒸馏 LLM 同时产出：memories（四类白名单：用户事实/稳定偏好/承诺约定/关系变化，「拿不准不记」）+ emotion（PAD+受控 mood）+ profiles + forget 意图。
- 判重三路：mergeIndex 指回（蒸馏附 top-8 已有记忆编号）→ attitude 同对象归并 → 向量 cos≥0.9 强化旧条；事实与态度不互并。
- 画像：u:\<openid\>（跨会话）/ sess:\<sessionId\>（兜底+私聊发言人绑定）；LLM 起草 → 独立模型 temperature=0 二次审核（reviewed 持久化，重启免重审）；openid 幻觉校验——只信真实发言人注册表，不信任 LLM 输出身份；300 字上限、〔私〕分段标记。
- 私域：sessionDomains + note.private 覆盖，生效域**派生**（标域即作用于全部存量）；硬隔离于检索四路；佐证放行（公开池已见事实确定性放行）+ 待放行人工队列（私密线索词启发式降噪，决策永远是人）。

### 人格（persona + 情绪 + 身份 + 时间）

- **人格内核** persona.md：只读常量、每轮全文注入 order 80（稳定段，保 DeepSeek 前缀缓存）；多人设 PersonaEntry{id,name,text}+activePersonaId 存 op 流水，脑图可切换。
- **二轨模型**（现状）：事实共享 · 态度分轨（attitude.personaId 只对同人设召回）。
- **已定演进**（11-08 定案）：→ 「角色→人设」两级三轨：world（用户事实/画像/digest 共享）+ self（第一人称记忆+attitude+情绪，按 characterId 隔离）；`MemoryNote.self` 标记 + `PersonaEntry.characterId`。
- **情绪**：PAD 三维（v/a/d）+ 受控 MOODS 九桶（MOOD_VALENCE 极性护栏）+ 自由 label；按 sessionId 存、e^−0.35d 向中性回归、平静态不注入省 token；蒸馏情绪快照钉在每条记忆上（情绪唤醒调制：|v|·a → 初始强度 ×1.0~1.5）。
- **身份归因**：群聊 `[昵称 (openid)]` tag 解析；私聊 sess 画像卡 name 人工绑定发言人。
- **时间**：`brain:clock` 当前时刻行 + convo 行级时间戳 + 记忆年龄标注（分钟/小时/天粒度）。

### 读写路径与成本纪律

- 读路径：system-prompt/assemble waterfall 注入 7 section——稳定段（persona 80 / digest 81）保前缀缓存，易变段（speaker/attitude/memory/emotion/clock 10300+）贴消息端吃 U 型注意力尾部红利。
- 写路径：session/event 捕获（用户消息队列 ≤8 配对 turn/end）→ ingest → endOfTurn 异步蒸馏（防重入、失败静默）。
- 后台循环：巩固定时器、embedding 回填、衰减/强化、近重复清扫、图谱边实时推导（derived/semantic/facet 三类，graphVersion 缓存）。
- 成本一线：全部 LLM 调用输入有界（单行截断/攒批/窗口）、可配置开关、失败不阻塞回复；滚动摘要 digest 是 transcript 与 note 之间的中间层（每 15 轮、40 轮窗口、250 字）。
- 存储：brain.jsonl op 流水 + 快照，全审计可重放；persona.md 文件为重启权威源。

### 实测基线（D3 复盘 + 离线评测）

- 蒸馏弃写率 37%（拌嘴轮正确丢弃）；importance 分布拉开；混合召回 recall 100% / 噪声 20%（纯 n-gram 88%/40%）。
- 蒸馏输入 ~1.2M tok/天 ≈ ¥90/月量级；长期成本不发散（唯一增长项=记忆条数，被 topK+遗忘兜住）。

### 已知短板/开放项（对标时的参照点）

- Reflection（高层洞察）未做；记忆关联/扩散激活仅图谱边铺底；干扰式遗忘、Prospective memory 未做。
- openid 碎片化未根治（读侧归并+手动合并兜底）；人格漂移无量化度量；主动开口需宿主钩子或自有发送路径。
- 自我轨（self 分轨）已设计未实现；会话级人设（per-session persona）展望中。

## 调研范围（待逐轮展开）

- 市面记忆框架/组件（类型 TBD）对照本基线的：分层模型、写入策略（蒸馏 vs 直存）、检索评分、遗忘/巩固、态度/自我概念、画像、私域、可观测性、成本纪律。
- 每个组件输出：是什么 → 与本设计的同构/差异 → 可借鉴点 → 不值得借鉴点 → 引入价值判定（适配哪个 deployment：dsh 插件 / companion agent / brain 内核本身）。
- 评估口径：能不能解决「已知短板」、是否保住「记忆可观测+可审计+成本可控」三大差异化。
- **首轮已完成**：Letta(MemGPT) / Mem0 / Zep(Graphiti) 三家对照 → `memory-arch-survey.md`（含陪伴型专项结论与引入清单）。
- **第二轮已完成**：人格方案（c.ai definition / OpenClaw SOUL.md / Replika backstory+Diary / 角色扮演研究线）+ 陪伴产品形态（c.ai/Replika/星野/猫箱/wow/文小言/Talkie/OpenClaw）→ `persona-companion-survey.md`（含跨轮总体对比总结 C 节与合并借鉴清单）。调研范围全部完成。

## Acceptance Criteria

- [x] 每个调研对象有结构化对照结论（同构点/差异点/借鉴判定）——首轮三家已完成，见 survey §2-3
- [x] 最终给出「值得引入的组件/思想」清单及其落点（内核改造 vs 新 deployment）——survey §6（不整体引入任何家，6 条思想级借鉴）
- [x] 全程遵守成本一线与「不为 hypothetical 需求铺面」的纪律——所有借鉴点均为攒批/低频/可关的小改
- [x] 人格方案 / 陪伴产品形态类调研对象——第二轮完成，见 `persona-companion-survey.md`

## Resolution（2026-11-09）

- **遇到了什么问题**：为 brain 内核演进与「陪伴型 Agent 第二 deployment」做技术选型储备——市面记忆/人格方案繁多，需要对照本项目基线逐一评估引入价值，而非凭印象选型。
- **怎么解决的**：两轮调研。第一轮对照三大记忆架构（Letta/MemGPT、Mem0、Zep/Graphiti，读论文原文 arXiv:2310.08560/2504.19413/2501.13956 + 2026 最新产品文档）→ `memory-arch-survey.md`；第二轮调研人格方案（Character.AI definition、OpenClaw SOUL.md 系、Replika backstory/Diary、角色扮演研究线）与陪伴产品形态（c.ai/Replika/星野/猫箱/wow/文小言/Talkie/OpenClaw）→ `persona-companion-survey.md`。两份报告均含与本项目基线的逐维对照表、借鉴判定与参考源。
- **Key Decisions**：
  - **不整体引入任何市面方案**——Mem0/Zep/Letta/OpenClaw 均为完整运行时或服务，接入即放弃「关系性记忆+情绪+态度+私域+审计+成本纪律」的差异化组合；该组合在市面上仍是空白，恰是陪伴场景真需求。
  - **思想级借鉴 10 条**（详见 persona-companion-survey.md §C.3），最高优先级两个：主动召回（recall-intent 门控深挖）与 prospective memory（standing intents）——均为 companion deployment 前置能力。
  - **人格分歧点定调**：persona.md 保持只读内核（抗 persona collapse），可变关系性自我由 attitude/emotion 轨承担；c.ai 六段式 definition 降级为人设包写作模板，不动内核。
  - **OpenClaw 是最近的架构表亲**——独立收敛到五层 tier + dreaming 双门禁巩固 + provenance 分级，作为最强外部验证，其机制逐条拆借。
- **验证结论**：结论基于论文/官方文档/产品公开信息与 2026 陪伴专评（REMP、LifeSide、ZifaMem、"Best Friends Not Forever"）交叉印证；benchmark 分数（LoCoMo/LongMemEval）仅衡量事实召回，不预测陪伴质量，报告中已显式标注此口径差异。
- **后续优化方向**：高优先级两项（主动召回 + prospective memory）在 companion deployment 设计（`11-09-companion-agent-eval`）时一并立项；中优先级项（dreaming 重组 pass、双时态、图扩散、provenance 分级）可作内核演进储备；人设包写作模板升级随 `11-07-ye-shunguang-persona` / `11-08-persona-switch-design` 推进时参考。
- **什么时候干的**：2026-11-09，一次会话内两轮调研完成并归档。
