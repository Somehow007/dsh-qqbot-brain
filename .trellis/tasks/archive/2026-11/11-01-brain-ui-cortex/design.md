# Design · 鲸脑皮层重构

## 边界

- 只改 `dsh-qqbot-brain/src/server/page.html`（+ `test/page.test.ts`）；后端、API、数据结构不动。
- 页面分三块：`<style>`、body markup、`<script>`。脚本内部按"纯函数 → 渲染 → 交互 → 事件绑定"分段，测试按标记截取纯函数段（现有锚点 `const ngrams=` … `function bindMapNode`、`function personaDirty()` … `// ── 事件绑定`），新纯函数必须放进可截取区间。

## 页面骨架

```
header        头像 + DAFEIYU · CORTEX + 状态（人格在线 / 记忆数 / 关联数 / 当前心情）
.wrap
  main.stage  标题区 · <svg id="brain" viewBox="0 0 1000 620"> · 图例 · 控件（信号开关/复位/检索框）
  aside       .persona（Smile 横幅 + 气泡）· #panel 检查器
section.vault 现有页签（视觉换色板）
```

SVG 分层：`#anatomy`（轮廓/沟回/区域柔光）→ `#sparks`（星点）→ `#labels`（脑区标注）→ `#edges` → `#pulses` → `#nodes`。解剖几何（`smooth()` 的 Catmull-Rom 控制点、沟回路径、引线坐标）直接移植自 `mockup-mind-cortex.html`。

## 数据流

```
load() ─ /state, /ops?limit=500, /personas … ─▶ buildCortex(state, ops, persona)
   ├─ notes        → 按 kind 分组、按 retention 排序、截断到区容量 → 记忆节点
   ├─ computeRelations(notes)                      → 记忆↔记忆边（既有）
   ├─ emotionBuckets(ops) + matchEmotion(note,ops) → 情绪节点 + 记忆→情绪边（新）
   └─ personaFacets(text) + matchFacet(note,facets)→ 人格节点 + 记忆→人格边（新）
render() 只负责把 CORTEX 模型画到固定槽位；select(id) 只切 class 与发脉冲。
```

新增纯函数（可单测）：

| 函数 | 输入 → 输出 | 规则 |
|---|---|---|
| `emotionBucket(state)` | PAD → `joy/calm/curious/pout/huff` | v≥.25&a≥.5 开心；v≥.25 平静；v≤-.25&a≥.5 炸毛；v≤-.25 委屈；其余 好奇 |
| `matchEmotion(note, emoOps)` | → `{bucket,label,t}` 或 `null` | 同 `sessionId`，`t ∈ [createdAt, createdAt+10min]` 取最近 |
| `personaFacets(text)` | 人设全文 → `[{id,title,body}]` ≤6 | 按 `^## ` 切；无小节时返回单个"人格内核"节点 |
| `matchFacet(note, facets)` | → `{facet,score}` 或 `null` | 复用 `ngrams` 重合，分数 ≥ 阈值（初值 3 个 2-gram，测试固定） |
| `layoutSlots(region, n)` | 区域椭圆 + 数量 → 坐标数组 | 区内向日葵螺旋 + 最小间距校验；记忆标签在右、人格/情绪标签在下 |

## 布局与容量

区域（viewBox 坐标，沿用概念）：前额叶·人格 (300,250)、新皮层·语义 (590,180)、顶叶·态度 (720,300)、杏仁核·情绪 (395,400)、海马体·情景 (580,415)。容量初值：情景 12、语义 10、态度 8（合计 ≤30），人格 ≤6，情绪 5。槽位随数量确定性生成，刷新时同一 id 位置不变（按 id 稳定排序后再分配）。溢出时在区内放 "+N" 小标，点击切到记忆库并按 kind 过滤。

## 交互与动效

- `select(id)`：`svg.dim` + `.lit/.sel`；边着色取对端颜色；首跳脉冲沿全部关联边，第二跳只沿记忆邻居的记忆↔记忆边（延迟 ~500ms）。
- 脉冲：rAF 仅在有脉冲时运行；空闲每 650ms 随机发一个（选中时只在选中节点的边上发）；`document.hidden`、开关关闭、reduced-motion 时不发。
- 检索：命中节点 `.qlit`，在命中节点之间的边发脉冲；结果列表复用现有逻辑。
- 15s 刷新：重建模型但保留 `SELECTED`；若选中 id 已不存在则复位。人设草稿保护逻辑不动。

## 兼容与风险

- 推断质量：老记忆早于 ops 日志窗口时无情绪连线；人设小节与记忆的重合可能很少 → 检查器写明"推断"，空关联时给出说明文案，不硬连。
- 测试锚点：重排脚本时若移动 `ngrams`/`bindMapNode`/`personaDirty`/`事件绑定` 标记，需同步更新 `page.test.ts` 截取规则。
- 体积：两张内联立绘约 84KB，保留；概念的星点由脚本生成，不增加体积。
- 回滚：`page.html` 单文件，git 回退即可；HEAD 版本为上线前状态。
