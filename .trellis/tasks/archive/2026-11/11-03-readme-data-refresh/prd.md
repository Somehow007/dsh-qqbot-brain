# README 数据刷新

## Goal

配图落地后 README 内多处数字与结论已过期（单测数、commit/session 计数），且当天新增两份归档讨论（成本增长分析、跳出 dsh 路线）与一个性能提交（emb 取向量并行化）值得写入。

## Requirements

- 同步计数：单测 121→123、commits ~126→~135、session 45→49（正文与时间线图两处）
- 成本透明段补「长期成本不发散」结论（transcript 锯齿 + 插件有界 + 唯一增长项被兜住）
- 已落地清单补 emb 并行化；下一步候选第 7 条改写为跳出 dsh 的 H1–H3 路线
- 时间线 SVG 数字同步后重渲 PNG

## Acceptance Criteria

- [x] README 无 121/126/45-session 残留
- [x] trial-timeline.png 重渲且数字正确
- [x] `npm test` 123/123 通过作为引用依据

## Resolution（2026-11-03）

### 遇到了什么问题

用户要求再更新 README。核查发现：上一轮更新（`0acb9ae`）后又落了 emb 并行化提交、两份归档讨论，单测涨到 123，计数全面过期。

### 怎么解决的

逐项核实真实数据（`git rev-list --count`、journal session 数、`npm test` 实跑 123/123），写入 README；时间线图 SVG 改字后 headless Chrome 重渲。

### 后续优化方向

计数类字段（commits/session/test）每次发版或里程碑时统一刷一遍，避免零散过期。

### 什么时候干的

2026-11-03，接在 readme-images 任务之后同会话完成。

### Key Decisions

- 「长期成本不发散」用一句话摘要进成本段，细节指回 `11-03-cost-growth-analysis` 档案而非全文搬运。
- 跳出 dsh 路线按档案结论写「库导出 > HTTP sidecar > MCP」的优先级排序，保留 dsh first-class 的前提。

### 验证结论

`npm test` 123/123 绿；`git rev-list --count` 135；journal session 49；grep 确认 README 与 SVG 无旧数字残留。
