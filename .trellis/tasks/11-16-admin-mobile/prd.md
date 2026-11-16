# 管理端移动端适配

## Goal

D-admin 七管理页（概览/记忆库/人设/画像/流水/关联图/备份）补移动端适配：手机宽度（≤900px）下可正常浏览与操作，不横向撑破、不遮挡。

## 背景与问题

- 展示页三皮肤已有移动断点（dossier/nocturne 900px、cortex 1000/640/480px），管理端只有 `@media(max-width:1100px)` 一档栅格折叠。
- 现存 ≤1100px 规则里导航收成 64px 图标栏，但 `.nl a` 的中文标签是裸文本节点（CSS 只藏 `a span`），`.np` 人设下拉在 64px 栏内不可用——该断点实际是坏的。
- `.pgrid`（人设页 236px 列表+编辑器双栏）漏在折叠清单外，窄屏直接挤爆。
- 记忆库/流水两张 `<table>` 无横向滚动容器，列多必溢出。
- `.frow`/`.drow` 表单双列、`.traits .tr` 特质行、`.toolbar` 十个筛选项、`.adm-top` 品牌+rstat 在 ≤375px 会溢出/拥挤。

## 方案

纯 CSS 为主 + 两处小 JS：

1. **断点重构**（admin.css）：
   - `≤1100px`：保留栅格折叠（bgrid/cols2/gwrap/pcards/nums→2列），**移除导航收栏规则**（204px 侧栏在 900–1100px 完全够用），补 `.pgrid` 入折叠清单（连同 `.plist` 边框/最小高适配）。
   - `≤900px`（手机）：`.adm` 改纵向——左导航变顶栏（brand/nfoot 隐藏；`.np` 人设块压成 色板+下拉 一行；`.nl` 七页链接横向滚动、激活态改底部下划线）；`.adm-scroll`/`.adm-top` padding 收窄；`.phead` 允许换行、h1 缩字号；`.frow`/`.drow`/`.traits .tr` 单列化；`.nums b` 缩字号；`.toolbar .fld` 两列网格化、搜索框全宽；`.batchbar` 允许换行；`.drawer` 全宽。
   - `≤640px`：顶栏 brand 副标题隐藏、`.who` 文字隐藏只留色板、traits 行进一步压缩。
2. **shell.js**：`.nl a` 中文标签包 `<span>`（让既有 `.nl a span` 规则真正生效），`<a>` 加 `title` 兜底。
3. **表格横滚**：memories.js / ops.js 的 `<table>` 外包 `.adm-tscroll{overflow-x:auto}`（桌面端无副作用）。

不做：展示页皮肤适配（已有断点）、卡片式重构记忆行、汉堡菜单（顶栏横滚已够用）、任何后端改动。

## Acceptance Criteria

- [x] 375px / 768px 视口下 `#/admin/*` 七页全部可渲染、无整页横向溢出（表格除外——表格在自身容器内横滚）
- [x] 移动端可完成核心操作（走查覆盖：七页路由渲染/导航点击/筛选控件均在位，交互代码路径未改动）：切页导航、人设下拉切换、记忆筛选/翻页/打开抽屉编辑、备份页表单填写
- [x] 桌面端（≥1100px）视觉与交互零回退（1440px CDP 走查：nav=column、零溢出）
- [x] typecheck + test + build 全绿（276/276）
- [x] headless Chrome 375/768/1440px CDP 走查七页零 console 报错、无元素越出视口（表格在 .adm-tscroll 内横滚）

## Notes

- 上游任务：`11-13-brain-ui-redesign`（P3 管理端落地时移动端明确留作「≤900px 单列不崩」档，本任务做实质适配）。
- 验证方式：本地 `npm run build` 后 headless Chrome 以 375×812 视口走查；生产实证待部署后登记 acceptance（若需）。
