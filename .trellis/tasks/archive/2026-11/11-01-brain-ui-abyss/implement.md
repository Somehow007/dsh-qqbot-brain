# 实施计划 — 脑图深海粒子版 UI 改造

## Ordered Checklist

1. ~~概念稿存档~~（done：`mockup-atlas-{a,b,c}.html`、`mockup-atlas-engine.js`、`mockup-atlas-persona-*.png`）
2. **主题与骨架**：page.html CSS 变量换深海色板；整页暗色化（shell/top/intro/layout/inspector/cards/vault/表单控件/滚动条）；去掉大脑剖面 path 与 fold 装饰，换声呐环 + 区域标签 + 人格徽标。DOM id 尽量不变，减少 JS 改动面。
3. **地图区重构**：`.map` 内加 `<canvas id="particles">`；SVG 改 viewBox 900×570，静态层外新增 `g#viewport` 包 `g#edges`+`g#nodes`（class=dyn 保持现有清除模式）。
4. **布局与关系**：`positions()` 区域参数适配新 viewBox、节点上限 10→30；新增 `computeRelations()`（相似话题/同会话/同发言人 + score 排序 + 上限 24）；`render()` 画边。
5. **聚焦交互**：`panel(key)` 选中时给相邻边 `.active`/其余 `.dim`、无关节点 `.muted`；详情面板插「关联记忆」按钮列表。
6. **平移缩放 + 粒子**：svg 拖拽 pan（click 阈值防误选）、zoomIn/Out/Reset 按钮；粒子 rAF 动画 + 开关（localStorage + prefers-reduced-motion + document.hidden 暂停）。
7. **联动对齐**：query 监听的 `.pathway` 选择器换成新边 class；`.map-node` 选择器若改名同步 panel() 末尾 toggle 列表；卡片/库表/检索命中选中态样式适配暗色。
8. **测试**：更新 `page.test.ts` helper 锚点；加 `computeRelations` 用例（三类理由、actor 缺省、上限截断、SELECTED 聚焦 class）。
9. **验证**：`npm test`、`npm run typecheck`、`npm run build`；手动冒烟（见 design.md）。
10. commit 由用户确认后执行；不 push。

## Validation Commands

```bash
cd dsh-qqbot-brain
npm test && npm run typecheck && npm run build
```

手动验收（需插件运行实例）：`/brain` 页面 → 选节点看聚焦+邻居跳转 → 拖拽/缩放/复位 → 粒子开关 → 检索高亮 → 新增/编辑/强化/删除 → 15s 刷新不丢编辑 → 窄屏无横向溢出。

## Risky Points / Rollback

- page.html 为单文件大改：分步提交前用 `node --check`（提取 script）+ `npm test` 逐段验证；任何一步失败回退该步。
- `panel()`/`render()` 的 `.dyn` 清除与 `.map-node` 选择器是现有回归测试隐含依赖，改名必须同步测试锚点。
- 保留未提交工作区改动（`git status` 里 `11-01-11-01-cloud-mem-check` 等与本任务无关的文件不动）。
