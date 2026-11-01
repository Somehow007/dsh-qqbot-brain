# 脑图中 attitude 的表现形式确认

## Goal

用户问「人格的 attitude 具体在脑图里表现为什么」。纯讨论留痕，无代码变更。

## Resolution（2026-11-01）

- **遇到了什么问题**：需说明 attitude（kind='attitude' 态度立场）在 /brain 脑图页中的具体呈现。
- **怎么解决的**：核对 `src/server/page.html` 后确认——attitude 不是独立 UI 板块，而是记忆条目的第三种 kind，复用记忆展示管线，出现于 4 处：
  1. 脑图 SVG 专属脑区「态度立场 / STANCES」（锚点 505,290），节点内显「态」字，透明度随保持率衰减；脑图仅渲染 top-10 节点。
  2. 详情面板标题「态度立场」、hint「人格不变，立场会被他人塑造」；可编辑 kind（普通记忆↔态度互转）、强化、删除。
  3. 记忆库 tab：紫色「态度」badge + 类型筛选 + 手动新增可选 kind=attitude。
  4. 检索模拟：/api/query 命中同样列出，图上连线高亮。
  - 不在：人格内核 tab（persona 编辑）与画像 tab（profiles）；事件流水走通用 op。
  - 设计表达：人格文本只读，attitude 是可被塑造的慢变量，故住记忆区。
- **后续优化方向**：暂无。
- **什么时候干的**：2026-11-01。
- **验证结论**：与 page.html 的 REGION/KIND/badge/ops 实现一致。
