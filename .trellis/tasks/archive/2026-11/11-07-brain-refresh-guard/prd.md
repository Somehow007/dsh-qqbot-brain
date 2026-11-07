# 15 秒定时刷新破坏编辑态

## Goal

`setInterval(load,15000)` 无条件全量重绘，画像卡编辑/详情面板失焦草稿被销毁；方案待用户拍板

## 现状（代码事实）

- `page.html` 底部 `setInterval(load,15000)`：15s 一轮，无 `document.hidden` 检查，后台标签页也打 5 个 API
- `load()` = 拉取 state/ops/sessions/profiles/personas → `showPersonas` + `render` + `renderLibrary` + `renderSessions` + `renderOps` + `renderPurgePersona` + `panel(SELECTED)`
- 已有防御（部分）：`showPersonas` 用 `personaDirty()` 保草稿；`panel()` 重建前查 `activeElement.closest('#info-detail')`
- 漏网受害者：
  - **画像卡编辑**（`renderSessions` 的 `.prof-edit` textarea）：**正在打字也会被杀**——guard 只查 `#info-detail`
  - **详情面板记忆编辑**（`ne-content` 等）：失焦后下一轮刷新照样重建 → 草稿丢
  - 新增记忆表单/筛选器/人设编辑器均安全（静态 DOM 或已有 dirty 保护）

## 候选方案

### A（推荐）编辑感知跳过 + 失焦/保存后补刷

tick 时 `isEditing()` 为真则整轮跳过并置 `pendingRefresh`；编辑结束立即补一次 load()。

`isEditing()` = `personaDirty()` ∨ `#sessGrid` 内有 `.prof-edit` 且脏 ∨ `#info-detail` 内输入脏 ∨ 新增表单有内容。

脏标记用事件委托：`$('sessGrid')`/`$('info-detail')` 各挂 `input` 监听置 flag，`renderSessions`/`panel` 重建或保存/取消时清零。约 40 行，行为可预期。

### B 分区刷新

数据照拉，编辑态时只重绘 SVG 图谱 + ops + 统计，跳过 `renderSessions`/`panel`/人设区。图谱始终鲜活，但数据与编辑区短暂不一致，分支多。

### C 拉长周期 + 手动刷新

15s → 60s+，加「刷新」按钮与「N 分钟前更新」角标。最简单但仍会周期性杀伤编辑（除非叠加 A）。

### D SSE/WebSocket 推送

overkill，单文件页不值。

## 附带项（无论选哪个都建议做）

- `document.hidden` 检查：后台标签页不刷（省电 + 少无效请求）
- 周期 15s 是否放宽到 30s：待用户拍板
- 服务端并发编辑冲突策略：现状无版本字段，若编辑期间服务端数据变更，保存即覆盖——方案 A 下表现为「编辑期间不感知」，是否加 updatedAt 比对另议

## Resolution（2025-11-07）

**拍板**：用户选方案 A，周期保持 15s，待定项 2（冲突检测）由助手评估后决定不做。

**实现**（`src/server/page.html`）：

- `isEditing()` 判定编辑中：①焦点在任何 `.pane` 或 `#info-detail` 的 input/textarea/select；②`detailDirty`（详情面板输入过未保存）；③`#sessGrid .prof-edit` 存在（画像卡编辑框开着，未输入也算意图）
- `detailDirty` 用 `#info-detail` 事件委托置位，`panel()` 重渲染/`ne-save`/`ne-reinf`/`ne-del` 提交点清零
- tick：`document.hidden || isEditing()` → 整轮跳过；否则 `load()`。后台标签页不再打 API
- load() 内 `panel()` 守卫扩展为 `detailDirty || 焦点在面板`——手动 load（如记忆库点「强化」）也不再杀失焦草稿
- 新增 `#refreshStat` 徽标（tabs 栏右侧，金色）：编辑中显示「编辑中 · 自动刷新已暂停」，由 focusin/focusout/tick/load() 驱动更新

**待定项 2 决策**：不做版本化冲突检测。依据：notes/profiles 已有 `updatedAt`，但真实并发写需两个管理端同时改同一实体——bot 只新增记忆/强化，不自动改写 content/text/人设；单人看板做版本检测是空转成本。演进路径：若出现多管理端，profiles/notes 的 updatedAt 现成可比对。

**验证**：`npm test` 153/153；headless 实测——详情编辑输入后等 16s load 未跑草稿保留徽标显示；ne-save 后立即补刷 lc+1；聚焦 libQ 暂停失焦恢复；画像编辑框开着跳过一轮且表单保留；空闲恢复 15s 正常刷。已部署 md5 `e575f711`。

**后续优化方向**：保存/取消后徽标最长滞后一个 tick 才消失（cosmetic）；若将来要「编辑中图谱仍更新」可升级到分区刷新（方案 B）。
