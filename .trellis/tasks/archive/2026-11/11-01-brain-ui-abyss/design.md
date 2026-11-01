# 脑图深海粒子版 UI 改造 — 技术设计

## Boundary

- 改动面：`dsh-qqbot-brain/src/server/page.html`（单文件，HTML/CSS/JS 内联）+ `dsh-qqbot-brain/test/page.test.ts`。
- 不改：`http.ts` 路由、`brain/index.ts` graph() 返回结构、存储与检索。API 契约不变。
- 参考：`mockup-atlas-b.html`（选定方向，深海全息）、`mockup-atlas-engine.js`（关系/粒子/缩放参考实现，示例数据不可照搬进产品页）。

## 视觉体系（对齐 B 概念）

- 色板：`--bg:#040c18` 页底、`--panel:#071a2a` 卡片、`--line:#2b516a` 描边、`--accent:#6cdbf1` 主高亮、`--glow:#5ff1c2` 在线态。kind 配色沿用 B：episodic 紫 `#bbaaff`、semantic 青 `#77dbf3`、attitude 粉 `#f19bcf`。
- 字体：`-apple-system / PingFang SC` 正文 + monospace 小标签（替换宋体标本感）；保留现有信息层级（eyebrow/h1/metrics/footer）。
- 装饰：地图区网格底纹 + 同心声呐环（纯 CSS/SVG，静态）；漂浮粒子 canvas 层。

## 地图区结构

```
.map (dark panel)
 ├─ canvas#particles   绝对定位，pointer-events:none，低于 SVG
 ├─ svg#brain (viewBox 0 0 900 570, touch-action:none)
 │   ├─ 静态层：defs、声呐环、区域标签、中央人格徽标组、情绪节点
 │   └─ g#viewport.dyn  ← translate(pan) scale(zoom)，内含
 │        ├─ g#edges.dyn   推断关系线
 │        └─ g#nodes.dyn   记忆节点
 ├─ 顶部 metrics / 中部 spotlight（保留）
 └─ 底部：图例（3 类关系 + 节点大小=重要度 + 明暗=保持率）+ 粒子开关 + 缩放控件
```

- 解剖脑轮廓 path 移除，改为声呐环 + 分区标签；中央人格徽标为 SVG 鲸鱼剪影/圆环（沿用 B 中 core-mark 思路），可点击 `panel('core')`。情绪节点保留，`panel('emotion')` 不变。
- `positions()` 沿用"区域锚点 + 黄金角螺旋"，REGION 坐标/半径按新 viewBox 扩大；节点上限 `slice(0,30)`；节点 label 仍默认隐藏（hover/focus/selected 显示）。

## 关系计算 `computeRelations(notes)`

纯前端推断，输出 `{a,b,reasons:Set,score}`：

| 关系 | 判定 | 样式 |
|---|---|---|
| 相似话题 | ngram 重合计数 ≥3（沿用现阈值），score=重合数 | 虚线 `#5bbdd2` |
| 同一会话 | `a.sessionId===b.sessionId` | 细实线、更淡 |
| 同一发言人 | `a.actor && a.actor===b.actor` | 细实线、更淡（可与上者同色区分 dash） |

- 边总量上限 ~24（按 score 排序截断），防全连接糊图；选中节点时相邻边 `.active`，其余 `.dim`；无选中时恢复透明度。
- 理由文案进详情面板："共享话题词「xx」/ 同一会话 / 同一发言人 张三"。

## 详情面板「关联记忆」区

`panel(key)` 中、decayChart 之后、编辑 details 之前插入 `relationsBlock(note)`：列出邻居按钮（短标签 + 理由），`onclick→panel(other.id)`。无邻居显示"暂无可推断关联"。`mapSummary` 不变。

## 交互

- **Pan/zoom**：svg pointerdown（忽略 .map-node 起点）→ capture → pan 更新 `viewport` transform；`zoomIn/Out`（±0.15，clamp 0.75–1.9）+ `zoomReset`。transform 存模块级变量，`render()` 重建 dyn 层时保留。
- **粒子**：`#particles` canvas 慢速漂移（~60 点，低透明）；`#particleToggle` 按钮切换，状态写 `localStorage('brain-particles')`；`matchMedia('(prefers-reduced-motion: reduce)')` 时默认关。粒子动画独立于 `load()` 刷新。
- **检索高亮**：现有 query 监听里把 `.pathway` 选择器换成新边 class 即可，行为不变。
- 选中态传播沿用 `panel()` 末尾的 classList toggle 模式（map-node/card/result-hit/tr.data）。

## 数据流与兼容

`Brain.graph()` → `/api/state` → `STATE.notes` → `positions()` / `computeRelations()` / nodes → `panel()` 详情+邻居。15s `load()` 重建 dyn 层时：保留 SELECTED、pan/zoom、粒子开关、编辑中输入（现有 `editing` guard 与人设 `personaDirty` 保护原样保留）。`content` 永不截断写回（沿用 spec 约定）。

## 测试与风险

- `page.test.ts`：helper 提取锚点（`cleanText`→`bindMapNode` 区间）需随重构更新；新增 `computeRelations` 用例（相似/同会话/同发言人理由、无 actor 不连、上限截断）。语法与 token 用例保持。
- 风险：① 单文件大改易回归 → 按 implement.md 分步，先骨架后交互，每步 `node --check`；② 30 节点 + 24 边的密度 → 以真实数据目测调参，标签默认隐藏兜底；③ 暗色下表单/表格可读性 → 沿用 B 色板统一调；④ 触摸拖拽误点 → `touch-action:none` + click 阈值（拖动>4px 不触发 select）；⑤ 粒子性能 → 60 点 + rAF，页面不可见时 `document.hidden` 暂停。

## 验证

`cd dsh-qqbot-brain && npm test && npm run typecheck && npm run build`；手动冒烟：本地起插件页 → CRUD/强化/检索/15s 刷新/窄屏/空数据/30+ 节点。
