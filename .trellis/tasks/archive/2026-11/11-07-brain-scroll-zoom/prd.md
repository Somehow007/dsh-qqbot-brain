# 脑图滚轮劫持页面滚动

## Goal

桌面滚轮在脑图上滚动页面被劫持为缩放；另补鼠标双击缩放缺失

## Requirements

- 普通滚轮/触控板双指滑动 → 页面正常滚动，脑图 viewBox 不动
- 触控板捏合（ctrl+wheel）→ 脑图缩放
- 鼠标双击 → 放大/复位，与触屏双触行为一致

## Acceptance Criteria

- [x] 鼠标置于脑图上滚轮 → 页面 scrollY 变化、viewBox 不变
- [x] ctrl+滚轮 → viewBox 缩放
- [x] 鼠标双击 → 放大 2x / 复位
- [x] 触屏双触不重复触发 dblclick（dblGuard 去重）

## Resolution（2025-11-07）

**遇到了什么问题**：`wheel` 监听对 svg 上所有滚轮事件 `preventDefault`+缩放——桌面下想滚页看记忆库，指针一旦停在脑图上就变成缩放，页面根本滚不动。移动端 `touch-action:pan-y` 不受影响，问题集中在桌面滚轮/触控板双指滑动。另发现双击缩放只在触屏 pointerup 路径实现，鼠标 `ev.pointerType==='mouse'` 直接 return，桌面双击缩放从未生效。

**怎么解决的**：wheel 只在 `ctrlKey`（触控板捏合手势）时 preventDefault 缩放，普通滚轮放行给页面滚动；新增 `dblclick` 监听实现鼠标双击缩放，`dblGuard` 时间戳去重防触屏双触二次触发；提示文案改为「⌃滚轮/双击缩放」。

**后续优化方向**：若用户反馈想保留无修饰滚轮缩放，可加「指针悬停脑图 300ms 后才接管滚轮」的地图式方案；或在 ctrls 加滚轮模式开关。

**什么时候干的**：2025-11-07，随「图谱手势+刷新」反馈一并处理。

## Key Decisions

- 滚轮缩放收敛为 ctrl+wheel（触控板捏合），对齐 Google Maps 嵌入地图惯例——嵌入图不应抢宿主页面滚动
- 缩放入口保留四个：捏合/⌃滚轮、双击、＋/－按钮、拖拽平移——可发现性不靠滚轮

## 验证

- `npm test` 153/153；headless Chrome 实测：普通滚轮 scrollY 0→600 且 viewBox 不变；ctrl+wheel w 840→800；双击 w 800→400
- 已部署远端 md5 `abf9b5a2` 与本地一致
