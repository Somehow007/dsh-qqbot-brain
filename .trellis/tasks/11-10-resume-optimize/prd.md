# 简历优化：删工作经历、换 qqbot-brain 项目

## 需求（2026-11-10）

用户给出现有 `~/Documents/简历/Java简历.pdf`，要求：

1. 删掉「工作经历」段（优课达 2025-07~09 实习，AI 语音问答平台三个模块），换成 qqbot-brain 项目；
2. 整体再优化、欠缺处重构。

## 产出

`~/Documents/简历/Java简历-优化版.pdf`（单页 A4，HTML→Chrome headless 打印；源文件 `resume-v2.html` 可改字重打）+ `Java简历-优化版.md`（同内容 md）：

- 结构：头部（求职意向+联系方式）→ 教育经历 → 项目经历（① qqbot-brain ② PromoFlow）→ 专业技能；
- qqbot-brain 条目：面向 Java 岗受众命名「LLM 聊天机器人长期记忆与人格引擎」，bullet 取自 `求职材料/01-简历条目.md` 通用版+B方向，含事件溯源↔binlog/RDB 类比（Java 面试官友好）；
- PromoFlow bullet 措辞微调，日期留 `2025.XX` 占位待用户填；
- 专业技能重排：Java→Redis→RocketMQ→LLM应用开发→计网/OS→AI 工具，新增「LLM 应用开发」一条承接项目。

## 关键事实

- 项目日期 2026.10-29 起、259 commits（git log 实测，材料中"10天229"已过时为12天259）；
- 删除优课达实习为用户明确要求；已在回复中提示「真实实习通常值得保留」的取舍，便于反悔加回。

## Resolution（2026-11-10）

**遇到了什么问题**：PDF 无法直接编辑（read 工具不支持），且源简历「工作经历」要整段替换；项目 bullet 要在「Java 简历」语境下既保 AI 差异化又让后端面试官看得懂。

**怎么解决的**：用 macOS 自带 `swift + PDFKit` 提取 PDF 全文；基于 `求职材料/` 已有裁剪版 bullet 重组，新增 binlog/RDB 类比；产出 Markdown 版而非改 PDF。

**后续优化方向**：用户可能想保留优课达实习（可移至「实习经历」或并入项目经历）；PromoFlow 日期待补；投 Agent 岗时可另出一版把 AI 相关 bullet 提前。

**什么时候干的**：2026-11-10，单次 session 完成。
