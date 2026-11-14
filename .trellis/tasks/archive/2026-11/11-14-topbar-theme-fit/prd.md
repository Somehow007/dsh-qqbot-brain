# 顶栏（顶导航栏）主题适配与版式迭代

起因：用户反馈 /brain 顶部导航栏「样式有些死板，而且和其他主题格格不入」。

## 问题

- `src/server/web/index.html` 的 `.topbar`（品牌/脑图·管理导航/皮肤按钮/搜索/查看人设/统计条）样式在 `app.css` 里写死 `:root` 深蓝 token（--txt/--dim/--acc/--line），任何皮肤下都是同一条深蓝玻璃条——墨刊（纸面亮色）上尤其突兀，星图（夜空金线衬线刊头）上也对不上视觉语言。
- 管理端已有先例：`applyTokens()` 把 `skin.tokens` + 人设 a/a2 写到 `.adm`，版式随皮肤+人设换色。顶栏是这套机制的漏网之鱼。
- 版式死板：导航/皮肤按钮全是雷同圆角胶囊，无皮肤性格。

## 方案

1. `app.js` 新增 `paintChrome()`：复用 `applyTokens(document.body, {skin, theme})` 写皮肤 tokens + 人设 accent 到 body，并写 `body.dataset.skin` 供 CSS 差异化；接入 boot / store 'data' / 查看人设切换 / 皮肤按钮点击。
2. `app.css`：
   - `:root` 补 token 别名（--ink/--ink2/--accent/--accent2/--font-head/--mono，--txt/--dim/--bg2 别名指向 token 名）——JS 未写前回落鲸脑默认，写后 toast/modal/drawer/通用控件自动跟随皮肤；
   - `.topbar` 及子元素全部改用 token：导航改下划线激活态、皮肤按钮改分段控件、搜索框 focus 用人设色环；
   - `body[data-skin]` 差异化：墨刊=刊头双线墨规+方角+宋体刊名+黑白反选皮肤段；星图=衬线刊名+宽字距导航+金发丝线；鲸脑=保留深海玻璃渐变。
3. 顺带 token 化：toast、.btn.primary、input focus、.hits hover 等小处换色（不改 DOM 结构）。

## 不做

- index.html DOM 结构不动；皮肤内部（.cx/.dsr/.noc）、admin.css、后端不动。

## 验收标准

- 代码验收：typecheck + `npm test` + build 全绿；headless 走查三皮肤（cortex/dossier/nocturne）顶栏渲染零报错、token 正确下发（墨刊亮色/星图夜空/鲸脑深海）、legacy 页不受影响。
- 实证验收：无（纯本地 UI 迭代，部署随 P4 批次）。

## Resolution（2026-11-14）

- **遇到了什么问题**：/brain 顶栏写死 `:root` 深蓝 token（--txt/--dim/--acc），任何皮肤下都是同一条深蓝玻璃条——墨刊纸面上完全格格不入，星图上也接不住金线衬线刊头；且导航/皮肤按钮全是雷同胶囊，版式死板。根因是管理端的 `applyTokens`（skin.tokens + 人设 accent → 容器）机制从未应用到壳层。
- **怎么解决的**：`app.js` 新增 `paintChrome()`——复用 `applyTokens(document.body, {skin, theme})` 写皮肤 tokens + 人设 accent，并写 `body.dataset.skin`；接入 boot / 'data' / 切查看人设 / 皮肤按钮点击（点皮肤即时换色不等视图重挂）。`app.css`：`:root` 补 token 名与别名转发（--txt/--dim/--bg2 → --ink/--ink2/--panel），JS 未写前回落鲸脑默认、写后 toast/modal/drawer/通用控件零改动自动跟随；顶栏全 token 化重写——导航改 scaleX 下划线激活态、皮肤按钮改分段控件、搜索 focus 用人设色环、统计条/查看人设改 mono；尾部 `body[data-skin]` 差异化——墨刊=3px 双线墨规+方角+宋体刊名+皮肤段黑白反选+mono 导航，星图=衬线刊名宽字距+金发丝线，鲸脑=深海渐变（基样式即原生氛围）；`color-scheme` 随皮肤 light/dark、墨刊 --warn 调深。
- **验证结论**：typecheck + 274 tests + build 全绿；headless Chrome 三皮肤（?skin=cortex/dossier/nocturne）+ admin×2 截图确认顶栏与皮肤/人设一致（dump-dom 实证 body 上 tokens+data-skin 正确下发，流萤绿 accent 覆盖皮肤默认）；?ui=legacy 不受影响（独立 page.html）。
- **后续优化方向**：无阻塞项；若新皮肤落地，只需在其 tokens 里补同一组键，顶栏自动获得基础配色，差异化版式按需加 [data-skin] 覆盖块。部署随 brain-ui-redesign P4 批次。
- **Key Decisions**：token 写 body 而非 .topbar——让 toast/modal/drawer/通用控件经 --txt/--dim/--bg2 别名零改动跟随；DOM 结构不动，差异化全走 CSS。
- **什么时候干的**：2026-11-14，单会话完成（未部署，随 P4 同批上线）。
