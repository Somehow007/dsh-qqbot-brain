# CHANGES 读法事故修复：读法分级 + 状态锚点 + 权威序

## 背景：事故实录（2026-11-15，trellis mem 取证）

新会话（devin `obsidian-porter`，从 11-09 旧线程续作）用户问「当前迭代到哪里了？可以继续开迭代嘛？可以的话就开工吧」。Agent 执行 `tail -30 .trellis/CHANGES.md`——当时文件 102 行，tail 只覆盖 11-14 09:11 之后条目；迭代 A/B/C 的完成广播在第 44–67 行（11-09~11-13），**全部在截断线以上**。叠加 parent_session_context 里 11-09 的旧摘要（白纸黑字「迭代 A 实施尚未开始」），Agent 得出「A/B/C 未完成、D 已部署」的错误结论，列出 10 项迭代 A 重做 todo 并准备调用 trellis-before-dev 开工。用户当场纠正后才重读纠正。

**爆炸半径：零**——未写任何代码、未建多余 task、git 树干净。todo 仅第 1 项「读代码」在进行。

**次生缺陷**：会话中途 compaction 一次，压缩 summary 里已写明「A-D 均已完成、须停止不要改代码」，但压缩后的 Agent 面对重复的「开工吧」又从 tail -30 + 旧摘要重新推导出错误结论——**纠正只存在于对话上下文，压缩即失忆**。

## 根因（三层）

1. **读法缺陷**：`tail -30` 被当成通用开工动作。它本意是「旧会话恢复的增量补课」（CHANGES.md 头注释原文：「往回读到条目时间戳早于你最后活跃时点为止」），但对新会话「最后活跃时点」不存在，tail -N 静默退化为截断读。讽刺的是文件有 ~100 条上限兜底，全读成本本就有界。
2. **用途混淆**：CHANGES.md 是**事件流**（回答「最近发生了什么」），被当成**状态源**（回答「迭代到哪了」）。状态问题的正确入口是计划文档/台账/git log；而 `iteration-plan.md` 恰好没有进度段——**状态源缺位，事件流被迫扛超出能力的查询**。
3. **权威序缺失**：parent_session_context / 压缩 summary 是历史快照，只作线索；但没有明文规定「与仓库证据冲突时谁说了算」。Agent 把 6 天前的快照和仓库现状等量齐观。

## 方案（调研走查后定稿，含否决项）

四层修复各司其职：

### L1 读法分级（防「读不全」）

- CHANGES.md 头注释改写：**新会话 / 无法确定最后活跃时点 → 全文读**（~100 条上限使全读成本有界）；**旧会话恢复 → 从最后活跃时点增量补课**，tail -30 只是起点、不够就继续往前翻。
- 同步点：AGENTS.md「跨会话广播位·读」条款、acceptance.md 走查协议第 1 条。
- 跨仓库同病：study-journey（CHANGES 29 行暂不疼但规则同源）、mysite（CHANGES 56 行且条目长，tail -30 已不到一半）——各自 AGENTS.md + CHANGES.md 头注释同步。

### L2 状态锚点（防「查错源」）

- `iteration-plan.md` 顶部加「当前进度」段：逐迭代一行（状态 + 完成日期 + 指针）。
- 维护规则：迭代归档时同步更新进度段（归档本就强制 Resolution，顺手勾一行）。写进本任务 Resolution 与 AGENTS.md 归档流程提一句。
- 旁证：study-journey `docs/roadmap.md` 里程碑表已内嵌 ✅ 状态标注——同一模式在用户生态里已被验证可行。

### L3 权威序纪律（防「信错源」）

- AI-WORKFLOW.md「日常循环」开工三步修订为分级读法；新增纪律：**会话摘要类材料（parent_session_context / 压缩 summary / journal 转述）是历史快照只作线索；状态判断权威序 = git log/代码 → 任务档案/验收台账 → 计划文档 → CHANGES 事件流 → 会话摘要**。
- AGENTS.md 项目约定补一句最小指针。

### L4 范式沉淀（防「别的项目再踩」）

- `~/dev/code/vibe-coding/ai-workflow/playbooks/` 新建 `session-resume.md`：跨会话开工补课手册——事件流 vs 状态源心智模型、读法分级协议、状态源清单、权威序、开工对话词、检查清单、本次事故为「常见坑」实证；README 目录同步。
- 原则层与手册层分工不变：AI-WORKFLOW.md 管原则，playbook 管可复制过程。

## 调研走查记录（方案压力测试）

| 候选 | 结论 | 理由 |
|---|---|---|
| CHANGES 头部钉「当前状态」段 | **否决** | 手维护第二真相源 = 新的漂移源，破坏 append-only 事件日志设计；状态应活在计划文档里（L2） |
| 状态问答脚本一键输出 | 暂缓 | 文档修复先跑通；脚本是锦上添花，待规则验证后再议（AI-WORKFLOW backlog 可立条） |
| trellis mem 当状态源 | 否决 | mem 搜对话原文，答「讨论过吗」可以，答「做没做」不行——代码/git 才是权威 |
| hook 强制注入全文 | 暂缓 | .trellis 基础设施会被 trellis update 覆盖；项目级钩子脆弱，文档规则先行 |

## 顺带发现（记入相关，不在本任务范围）

- `task.py list` 显示 18 个 active tasks 多为陈旧 planning/in_progress（11-03、11-07 等早已完结未归档）——task 状态本身也会漂移，状态源清单须注明「list 只是索引，status 以 task.json + 目录内容为准」。任务卫生问题另案。

## 验收标准

- [ ] CHANGES.md 头注释 + AGENTS.md + acceptance.md 读法条款改为分级读法
- [ ] iteration-plan.md 顶部有「当前进度」段且与实际状态一致（A✅11-09 / B✅11-10 / C✅11-12 / D✅11-14 / E6✅11-15 / E1-E5 储备 / F 另立 / G 穿插）
- [ ] AI-WORKFLOW.md 日常循环修订 + 权威序纪律成文
- [ ] ai-workflow/playbooks/session-resume.md 建册 + README 目录更新
- [ ] study-journey、mysite 的 AGENTS.md/CHANGES.md 头注释同步读法分级
- [ ] 无代码改动；纯文档任务，验证=人工复读 diff

## Resolution（2026-11-16）

**遇到了什么问题**：2026-11-15 新会话（devin obsidian-porter，从 11-09 旧线程续作）被问「迭代到哪了可以开工吗」，Agent 只 `tail -30 CHANGES.md`（截断线以上恰好是迭代 A/B/C 完成记录）+ 采信 6 天前的 parent summary「迭代 A 未开始」，误判 A/B/C 未完成并列出 10 项重做 todo；用户当场纠正。爆炸半径为零（未写代码），但 compaction 后纠正曾失忆二次犯错——纠正只存于对话上下文。

**怎么解决的**：四层修复全部落地——
- L1 读法分级：CHANGES.md 头注释 + AGENTS.md + acceptance.md 改为「新会话/无活跃时点→全文读（~100 条上限兜底）；恢复会话→从最后活跃时点增量补，tail -30 只是起点」；
- L2 状态锚点：`iteration-plan.md` 新增「当前进度」表（A–G 逐迭代状态+日期+指针），AGENTS.md 归档流程加「迭代类任务归档时同步更新进度段」；
- L3 权威序：AGENTS.md 新增「上下文权威序」条款 + AI-WORKFLOW.md 日常循环修订——摘要类材料只作线索，采信序 git/代码→档案台账→计划文档→CHANGES→摘要；
- L4 范式沉淀：`ai-workflow/playbooks/session-resume.md` 新册（事件流 vs 状态源心智模型 + 读法分级 + 状态源清单 + 权威序 + 开工对话词 + 本次事故为常见坑实证），README 目录同步；
- 跨仓库同病同步：study-journey（AGENTS.md §0.1 + CHANGES 头）、mysite（AGENTS.md §4 + CHANGES 头）同步读法分级——mysite CHANGES 已 56 行且条目长，tail -30 不足一半，属同级隐患。

**后续优化方向**：状态问答一键脚本（暂缓，文档规则先跑通）；CHANGES.md 若条目变长导致全文读成本上升，届时由进度锚点分担状态问答、事件流回归纯增量；task.py list 陈旧 active 任务卫生另案（18 个 planning/in_progress 多为完结未归档）。

**什么时候干的**：2026-11-16——事故取证（trellis mem extract obsidian-porter/wakeful-mitten/wiggly-period 还原会话链）→ 方案压力测试（否决状态段钉头/mem 当状态源/hook 强注）→ 四层修复 + 三仓库同步 → 本档案。

**Key Decisions**：状态活在计划文档不钉事件日志头（防第二真相源漂移）；全文读可行性靠 ~100 条上限兜底；权威序写进 AGENTS.md（always-on）而非只进 AI-WORKFLOW（需主动读）；playbook 记过程不记项目事实。

**验证结论**：纯文档改动无代码验证项；逐文件复读 diff 确认条款一致；iteration-plan 进度表与 archive 目录逐一核对路径存在。规则有效性待下个新会话实战检验（可观察点：新会话开工是否全文读 CHANGES、状态问题是否先查进度段）。
