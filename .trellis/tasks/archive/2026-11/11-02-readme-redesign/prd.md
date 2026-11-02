# 根 README 重设计：项目叙事版

## Goal

把根 README 从纯安装手册重设计为项目叙事文档，面向新读者回答四件事：这是什么/探讨什么、解决哪些痛点、测试效果如何、当前阶段与路线。

## Requirements

- 重写给访客看的根 README.md；安装/部署细节收敛为速查，完整 runbook 仍指向 `dsh-qqbot-brain/README.md`
- 所有结论性表述必须有 `.trellis/tasks/` 评估留痕或源码依据，不虚构指标
- 配头图（/brain 鲸脑皮层概念稿截图）并如实标注是概念稿
- 包含诚实清单：已验证有效的与尚未解决的并列

## Acceptance Criteria

- [x] 覆盖「探讨命题（认知架构+理论映射）/ 痛点-解法 / 工作机制 / 实测效果 / 当前阶段 / 快速开始 / 仓库结构」
- [x] 数据可溯源：eval 88.2%/40%→100%/20%、单测 90/90、试运行 44→150→119 条、~280 语义边、RSS≈194MiB
- [x] 检索公式与判重口径按 `src/brain/retrieval.ts` 核对后修正

## Resolution（2026-11-02）

- **遇到了什么问题**：根 README 只讲安装使用，看不出项目「在探讨什么认知架构问题、实测有没有效、进行到哪一步」。
- **怎么解决的**：通读 `.trellis/tasks/` 全部评估留痕 + journal-1（25 session）+ 源码核对，重组为叙事 README——工程命题开头（只调 API 能否记得更久/人格不漂移/上下文更厚）→ 理论映射表 → 痛点-解法表 → 读写路径 ASCII 图 → 实测数据表 → 阶段路线图 → 浓缩快速开始。headless Chrome 截 mockup-mind-cortex 作头图。
- **后续优化方向**：试运行复盘后可更新「当前阶段」；若接 dsh-meme/换 harness，快速开始段落需同步。
- **什么时候干的**：2026-11-02。

### Key Decisions

- 保留并浓缩安装内容而非删除：README 仍需让读者能跑起来，深度 runbook 指向插件内 README
- 头图用概念稿截图并在图注注明「概念稿，线上版本按此实现」，不伪装成线上实拍
- 「还没解决的」单独列四条（openid 碎片化、无漂移度量、巩固偏保守、判重灰带），如实呈现阶段

### 验证结论

- 检索评分公式按 retrieval.ts 实际实现修正为 `α·rel·(1+β·R)+γ·imp/5`
- eval 用例数按 cases.json 核实：44 notes + 22 cases
- 试运行阶段描述按 10-31-two-day-trial-eval / 11-02-brain-dedup-sweep 留痕复核
