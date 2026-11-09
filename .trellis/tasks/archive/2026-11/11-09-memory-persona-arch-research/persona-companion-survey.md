# 人格方案与陪伴产品形态调研（第二轮）+ 总体对比总结

> 调研日期：2026-11-09。基准 = 本项目设计基线（见 prd.md「设计基线」节）；记忆架构三家对照见 `memory-arch-survey.md`。
> 评估口径同上：是什么 → 同构/差异 → 可借鉴点 → 引入价值判定。

## A. 人格方案（persona / personality）

### A.1 Character.AI —— 结构化角色定义 + 反馈训练

- **角色定义 schema**（创建表单）：tagline / description（角色口吻写的 500 字简介）/ greeting（开场白兼场景设定，≤4096 字符）/ Character Definition 六段——Identity（名字/角色/世界/独特性）、Personality（**具体细节而非形容词**：怎么思考、沟通、反应）、Voice and speech patterns（语域/俚语/节奏/口癖）、**Behavioral rules**（always/never/consistently avoids 清单）、Backstory（2-3 个塑造性事件，非 biography）、Relationships（与他人/阵营/用户的关键关系）、**Dialogue examples**（2-3 段跨语域对话示例，few-shot）。
- **影响响应的四层**：Character Attributes + Character Training（对话中星级反馈持续塑形）+ 用户侧 **Personas**（用户自设人设：称呼/偏好等描述）+ 当前对话上下文。
- 工程侧：Prompt Poet——把 prompt 当代码管理的规模化方案（blog.character.ai）。

**对照本项目**：我们的 `persona.md` 是自由文本只读内核；c.ai 的 definition 是**结构化 schema + 对话示例 few-shot**。差异点：
- 他们把「人格」拆成 Identity/Personality/Voice/Behavioral rules/Backstory/Relationships 六个字段——可机读、可校验、可版本化程度更高；
- Dialogue examples 是我们没有的：persona.md 只有描述没有示范；
- 用户侧 Personas ≈ 我们计划中的 world/self 分轨里「用户侧」的对应物——我们的 profiles 记用户事实，但没有「用户希望被怎么对待」这种**指令性用户人设**（指向借鉴点 4）；
- Character Training（星级反馈塑形）≈ 我们没有的在线反馈回路——我们的画像靠蒸馏自动积累，无显式 thumbs-up/down 信号。dsh 侧宿主不一定有反馈入口，companion 壳层可以加。

### A.2 OpenClaw —— 文件即灵魂（SOUL.md 系）

- workspace 根文件即人格层：`SOUL.md`（persona/边界/语气——"Be genuinely helpful, not performatively helpful"、"Have opinions"、"Earn trust through competence"、"Remember you're a guest"）、`IDENTITY.md`（名字/vibe/emoji）、`AGENTS.md`（操作指令）、`USER.md`（用户模型）、`MEMORY.md`（长期记忆）。全部明文 markdown，agent 可读写。
- **关键设计分歧**：SOUL.md 写明 "This file is yours to evolve. As you learn who you are, update it."——**人格文件 agent 可自演化**；而我们的 `persona.md` 是**只读常量**（防人格漂移是刻意设计）。两条路线：他们赌「成长感」，我们赌「稳定性」；我们的 attitude/emotion 轨实际上承担了「可变的关系性自我」的角色，persona.md 只管「不变的内核」——这个分工在陪伴场景更抗漂移。
- 注入预算：bootstrap 文件单文件 ≤20000 字符、总预算 60000，可配。

### A.3 Replika —— backstory + 等级成长 + Diary

- **Backstory** = 人格规格，第三人称肯定句（"Catrina loves hiking" 而非 "I love hiking"——LLM 对第三人称归属解析更好；否定句会让 AI 困惑，官方明确劝用正面表述）；可随关系演化更新。
- **等级系统**（1→50）：等级越高个性化越深——官方文档直言 10-30 级在试探兴趣、30 级起「明显更懂你」、50 级人格基本定型。**把记忆深度做成可感知的成长机制**，是产品化手段。
- **Diary**：每次会话后 Replika 以**第一人称**写日记式反思，用户可读可编辑——记忆被叙事化呈现，不只是事实列表。
- **Memory tab**：抽取的事实条目用户可见可删可手动添加；2026 rebuild 转向 segmented memory、偏重近期会话（老用户反馈旧记忆变淡——**纯 recency 加权的反面教材**，我们的衰减+巩固双轨正好治这个）。

### A.4 角色扮演研究线

- **RoleLLM / RoleBench**（arXiv:2310.00746）：100 角色 profile 构建 → Context-Instruct（角色知识抽取）→ RoleGPT（风格模仿 prompt）→ RoCIT 微调。结论：角色扮演需要专门的 profile + few-shot +（对开源模型）指令微调，通用 prompt 不够。
- **CharacterEval**（ACL'24）：中文 RPCA benchmark，77 角色 11,376 例，13 指标 4 维度 + CharacterRM 奖励模型；中文 LLM 在中文角色扮演上可超 GPT-4。
- **Role-consistency 综述**（EMNLP'26 Findings）：把角色一致性拆成六维——K 知识一致 / E 表达风格 / P 心理人格保真 / M 记忆与时序连续 / R 角色推理决策 / B 抗漂移边界。**记忆只是六维之一**——支持我们「persona 内核 + attitude + emotion + memory」多轨设计，而非单一 persona prompt 打天下。
- REMP（EMNLP'26，见 survey §4）：长程 role-playing 的记忆完整性与情绪一致性是主要瓶颈。

## B. 陪伴产品形态

| 产品 | 形态 | 记忆/人格做法（公开信息） | 对我们的启示 |
| --- | --- | --- | --- |
| **Character.AI** | UGC 角色平台（定义驱动） | 结构化 character definition + 用户 Personas + 星级训练反馈；群聊/Stories；记忆架构未公开 | 人格 schema 化 + 反馈回路；多角色社区形态对应我们计划的 characterId 分轨 |
| **Replika** | 1-on-1 深度陪伴 | Memory tab（事实可见可编）+ Diary（第一人称反思）+ backstory + 等级成长；2026 segmented memory 偏重近期 | 记忆可见可编辑是表标；Diary=记忆叙事化 UX；recency-only 是反面教材 |
| **星野**（MiniMax） | UGC 创作社区 | **记忆结晶**：对话自动转 3D 碎片/AR 投射——记忆作为情感资产可分享；7 天全量记忆 + 永久关键记忆；群聊多角色；深夜陪伴模式 | 记忆的「情感资产化」呈现；分层保留策略（7d 全量+永久关键）≈ 我们的 episodic 窗口+semantic 永久 |
| **猫箱**（ByteDance） | PGC 内容消费 | 云雀 LLM；**主动发起话题**；剧情连载解锁；轻 UGC | 主动开口是头部产品标配——我们已知缺口；内容消费型不需要深记忆 |
| **wow**（美团）/ **文小言**（百度）/ **Talkie** | 社交/动态陪伴 | 29 人设预设 / 动态表情 / 自然对话 | 人设预设库形态（对应我们 personas/ 人设包） |
| **OpenClaw** | 个人常驻 agent（非纯陪伴但是最近似的开源形态） | workspace 文件即灵魂 + 五层记忆 tier + dreaming 巩固 + standing intents + provenance 安全 | 见 C 节——架构上是我们最近的「表亲」 |
| **SoulLink** 等新玩家 | 1-on-1 | 记忆为卖点、Journal 流水、记忆不 paywall | 记忆透明化正在成差异化卖点 |

**产品形态层的共识**（从头部产品反推记忆系统的产品要求）：

1. **记忆可见、可编辑、可纠正**——Replika Memory tab、OpenClaw 明文文件、我们的 /brain 脑图都踩在这条上；用户对「TA 记住了什么」的控制欲是真实需求，透明度本身是信任功能。
2. **记忆要叙事化/情感化呈现**——Replika Diary、星野记忆结晶：记忆不只是召回素材，还是关系证据和分享素材。我们的 digest/op 流水已是原材料，缺的是面向用户的「日记/结晶」产品层。
3. **主动开口是陪伴标配**——猫箱主动话题、OpenClaw cron/standing intents；纯被动响应做不成「陪伴」，这正是我们已知缺口（需宿主钩子或自有发送路径，companion 壳层反而更容易做）。
4. **分层保留策略产品化**——星野「7 天全量 + 永久关键」、Replika segmented（有缺陷但方向对）、我们 episodic/semantic——业界都在收敛到「近期全量 + 长期精选」。
5. **多角色 vs 1-on-1 是两种记忆问题**——c.ai/星野的社区形态需要 per-character 隔离（我们已设计 characterId self 分轨）；Replika 的 1-on-1 需要单一深关系（我们当前二轨已够）。

## C. 跨轮总体对比总结

### C.1 全景定位

| 方案 | 类型 | 记忆架构 | 人格方案 | 陪伴适配度 | 对我们的价值 |
| --- | --- | --- | --- | --- | --- |
| **本项目** | 内核+插件 | episodic/semantic/attitude 四轨 + 衰减遗忘 + 混合检索注入 | persona.md 只读内核 + 情绪 PAD + 态度轨 + 画像二审 | 高（为群聊多发言人设计，companion 是第二 deployment） | — |
| **Letta** | agent 运行时 | core blocks + recall + archival；MemFS 文件树 + dreaming | persona/human 常驻块（agent 可编辑） | 中（理念对路，产品是编码 agent） | 思想借鉴（dreaming/按需深读） |
| **Mem0** | 记忆 API 服务 | ADD-only 抽取 + 向量/内建图 + hybrid 检索 | 无 | 低（纯事实层） | 组件候选不推荐；检索小点可抄 |
| **Zep/Graphiti** | 图谱框架+企业云 | 三层时序图 + 双时态 + 多路检索 | 无 | 低（企业向过重） | 双时态/图扩散思想 |
| **OpenClaw** | 个人 agent 产品 | 五层 tier + dreaming 双门禁巩固 + 两级召回 + standing intents | SOUL.md/IDENTITY.md 文件人格（可自演化） | **高（最近的开源表亲）** | **借鉴清单最丰富** |
| **Character.AI** | UGC 平台 | 未公开（推测检索增强） | 结构化 definition 六段 + few-shot + 反馈训练 | 中（多角色社区向） | 人格 schema + 反馈回路 |
| **Replika** | 1-on-1 产品 | Memory tab + Diary + segmented | backstory 第三人称 + 等级成长 | 高（形态最贴陪伴） | Diary/记忆可见性 UX + recency 反面教材 |
| **星野/猫箱** | 国内陪伴产品 | 7d 全量+永久关键 / 未公开 | UGC 创作 / PGC 角色 | 中 | 记忆结晶、主动开口标配 |

### C.2 最终判断

1. **没有市面方案覆盖我们的组合**：关系性记忆（attitude）+ 情绪轨 + 人格内核 + 私域隔离 + 可审计 op 流水 + 成本纪律——逐家拆都只覆盖一两个维度。OpenClaw 是唯一在架构层面与我们同构的（独立收敛到几乎相同的设计），反而是最强的外部验证。

2. **OpenClaw 值得最高优先级细读**——它把我们「已知短板」里的两个（Prospective memory、记忆扩散/主动召回）做成了工程化机制，且其巩固门禁的信号设计（recall frequency / query diversity / multi-day recurrence）比我们的 hits+R 更精细。详见借鉴清单。

3. **人格方案的分歧点是「人格可否自演化」**：OpenClaw/c.ai 允许人格成长（SOUL.md 可改、Training 反馈塑形），我们 persona.md 只读——但我们的 attitude/emotion 轨承担了可变部分，内核稳定+关系可变的分工在陪伴场景更抗漂移（对应 "Best Friends Not Forever" 揭示的 persona collapse 风险）。c.ai 的结构化 definition（behavioral rules / dialogue examples / backstory）可作为我们人设包（personas/）的**写作模板升级**，不动内核。

4. **陪伴产品形态给内核的三条产品要求**：记忆可见可编辑（已有脑图，差用户侧纠错入口）、记忆叙事化（Diary/结晶——产品层，内核原料已备）、主动开口（shell 层，内核 prospective memory 可先补）。

### C.3 合并借鉴清单（两轮汇总，按优先级）

| # | 来源 | 内容 | 落点 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | OpenClaw lane-2 + 三家共有 | **主动召回**：recall-intent 门控的深挖（比全量 tool 更省——只在「显式回忆意图 + lane1 弱命中」时升级） | 内核检索 + companion 壳层 | **高** |
| 2 | OpenClaw standing intents | **Prospective memory**：事件型 intent（SQLite 可机检触发字段+冷却/预算/ expiry）+ 时间型转 cron + aspiration 带复审期 | 内核新 tier + companion 壳层 | **高**（治「主动开口」前置） |
| 3 | OpenClaw dreaming | **回顾重组 pass**：规则信号门禁（recall 次数/查询多样性/多日复现/新近度）→ 有界 LLM 重写 + pre-image 评审面 | 内核后台循环（攒批可关） | 中 |
| 4 | Zep bi-temporal | semantic/attitude 加 valid 区间 | 内核 schema 小改 | 中 |
| 5 | Zep BFS-lite | 命中 note 图谱邻居一跳补召回（治「扩散激活」短板） | 内核 retrieval 小改 | 中 |
| 6 | OpenClaw provenance | **来源分级** owner/agent/untrusted/system + session-kind 门禁（cron/心跳会话不产记忆）+ taint 传播——比我们〔私〕标记更细；companion 主动消息轮次不应被当用户发言蒸馏 | 内核写路径（companion deployment 前置） | 中 |
| 7 | OpenClaw USER.md | **指令式用户模型**（Always/Never/Prefer）+ supersede-in-place——防「旧偏好残留」；可映射到 attitude/画像写法 | 内核蒸馏 prompt / attitude 格式 | 低-中 |
| 8 | Mem0 entity boost | 检索分加实体共现项 | 内核 retrieval 小改 | 低-中 |
| 9 | c.ai definition | 人格 schema 模板（behavioral rules/dialogue examples/backstory）用于人设包写作 | personas/ 文档层 | 低 |
| 10 | Replika Diary/星野结晶 | 记忆叙事化呈现（产品层功能，内核 digest/emotion 已是原料） | companion 壳层 | 产品层 |

**不引入**：Mem0 平台/OSS、Zep/Graphiti、Letta 运行时、OpenClaw 整体（它是完整个人 agent 产品；其 memory-core 思想已逐条拆借）。

### C.4 一句话总结

市面把「记忆」做成了工程品（Mem0）、把「时序」做成了图（Zep）、把「自我」做成了文件（Letta/OpenClaw），但**「关系性记忆 + 情绪 + 态度 + 可审计 + 成本纪律」的组合仍是空白**——这正是陪伴型 agent 的真需求区。我们不需要换架构，需要按清单补 6-8 个小机制，其中优先级最高的两个（主动召回、prospective memory）恰好都是 companion deployment 的前置能力。

## 参考源（第二轮新增）

- OpenClaw docs：concepts/memory、memory-architecture、dreaming、active-memory、user-model、standing-intents、reference/templates/SOUL.md
- Character.AI：book.character.ai character-guide（attributes/greeting/dialog-definitions）、support.character.ai templates、blog.character.ai prompt-design
- Replika：help.replika.com（memory work / backstory / leveling）、aicompanionpick.com 2026 记忆机制分析、blog.soullink.io 对比
- 星野/猫箱/wow/文小言/Talkie：10100.com 竞品分析、woshipm.com 竞品分析
- 研究：Generative Agents arXiv:2304.03442；RoleLLM arXiv:2310.00746；CharacterEval ACL'24；Role-consistency survey EMNLP'26 Findings 625
