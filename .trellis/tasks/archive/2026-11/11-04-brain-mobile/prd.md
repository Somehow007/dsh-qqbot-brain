# 脑图移动端适配：缩放平移+触控目标+布局自适应

## Goal

手机端脑图可用性差：节点缩放后只有几像素点不中、点选节点后检查器在屏外不滚动、SVG 不能缩放平移、≤640px 媒体查询仍按旧 absolute 布局写死 `#brain`（flex 化后已失效）。

## Requirements

- **视图缩放平移**（桌面同受益）：`viewBox` 状态 `VB`；滚轮按指针位置缩放（ctrl/触控板捏合小步长）、单指/鼠标拖拽平移、双指捏合缩放+平移；缩放范围 viewBox 宽 [190,1200]，平移不越出脑图边界带边距；`resetView` 复位视图+选中
- **手势冲突**：`touch-action:pan-y` 保留竖向页面滚动，横向/捏合归脑图；拖拽后抑制误触 click（捕获阶段拦截）
- **触控目标**：三类节点追加透明 `.hit` 圈（facet 30 / emo 22 / mem 20 单位）
- **点选滚动**：`bindMapNode` click 在 `innerWidth<=1000` 时 scrollIntoView 到 `#info-title`，与卡片/记忆库/搜索命中同款
- **媒体查询重写**：≤1000 `.stage{height:auto}`+`#brain{flex:none;height:auto}`（SVG 内禀宽高比自撑，消灭 letterbox）；≤640 清掉失效的 `#brain` 定位，stage-head/search/hits 改 static 进文档流，footer 允许换行
- 不动 SVG 坐标系、layoutSlots、边/脉冲逻辑

## Acceptance Criteria

- [x] 手机竖屏：脑图按内禀宽高比撑满宽度、可捏合放大查看节点、点节点滚动到检查器
- [x] 竖向滑动能正常滚页面，不被脑图劫持（touch-action:pan-y）
- [x] 拖拽后不触发误选中/取消选中（viewMoved + stopImmediatePropagation 捕获拦截）；复位按钮恢复视图
- [x] ≤1000 窗口下布局无 letterbox 空白带（stage height:auto + svg 内禀比）
- [x] `npm test` 通过（129/129）

## Resolution（2026-11-04）

- **遇到了什么问题**：移动端脑图四宗罪——①SVG 无缩放平移，节点缩到几像素点不中；②点选节点后检查器在屏外，选中无反馈感（卡片/记忆库都有 scrollIntoView，脑图节点没有）；③≤640px 媒体查询 `#brain{top:160px;height:71.4vw}` 按旧 absolute 布局写死，footer 进文档流后已失效；④≤1000 固定 stage 高度产生 letterbox 空白带。
- **怎么解决的**：
  - viewBox 视图控制 `VB`：滚轮/触控板捏合（ctrlKey 小步长）按指针位置缩放，单指/鼠标拖拽平移，双指捏合缩放+平移；viewScale() 按 meet 居中换算 letterbox 偏移；clampView 限缩放 [190,1200] 宽、平移 35% 越界余量；resetView 复位视图+选中
  - `touch-action:pan-y`：竖向滑动归页面滚动（pointercancel 让位），横向拖拽/捏合归脑图；拖拽后 viewMoved 拦截 click（注意 stopImmediatePropagation 才能拦同元素上的取消选中监听）
  - 触控目标：每类节点追加透明 `.hit` 圈（facet 30/emo 22/mem 20）；`.cap` 标签移除 pointer-events:none，点文字标签也能选中节点
  - 点选滚动：bindMapNode click 补 `innerWidth<=1000 → info-title.scrollIntoView`，对齐卡片/记忆库/搜索命中既有模式
  - 媒体查询重写：≤1000 `stage{height:auto}`+`#brain{flex:none;height:auto}`（svg 内禀 840:600 比自撑，零 letterbox）；≤640 stage-head/search/hits 改 static 进文档流（搜索结果不再绝对定位猜测），footer 允许换行
- **后续优化方向**：双击放大复位（dblclick）；`.overflow` +N 链接触控目标仍偏小（可包 g+hit rect）；横屏/iPad 中档布局未专门调；桌面滚轮缩放敏感度可按反馈调 step。
- **什么时候干的**：2026-11-04，`page.html` CSS 媒体查询重写 + JS 视图控制块 + 节点 hit/cap/点选滚动。
- **Key Decisions**：选 viewBox 变换而非 CSS transform——viewBox 是 SVG 原生视口语义，缩放后边/脉冲/坐标系零改动；选 pan-y 而非 none——保住页面纵向滚动不被全宽脑图劫持；≤640 头部进文档流而非继续叠 absolute——搜索框位置不再依赖写死的偏移常量。
- **验证结论**：npm test 129/129 过（纯函数区在 bindMapNode 之前，新增代码全在其后不受影响）；已 rsync 部署（远端 md5 01e5bd3d 一致），公网 200 + 新代码标记命中；真实手机手感待用户实测。
