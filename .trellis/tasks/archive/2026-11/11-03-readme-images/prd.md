# README 配图 SVG 自绘

## Goal

上一轮 README 刷新时预留了 5 个 `<!-- IMG-SLOT -->` 占位，原计划让用户拿 `docs/readme-image-prompts.md` 去 ChatGPT 生图。用户给出风格示例（白底、浅蓝圆角卡片、细线图标、中文标签）后改为本地手绘 SVG → headless Chrome 出 PNG，文字完全可控，避免 AI 生图的中文错字问题。

## Requirements

- 五张图，内容与 `docs/readme-image-prompts.md` 的设计稿一一对应：
  1. `docs/img/architecture.png` — 系统架构总览（QQ ↔ dsh-qqbot ↔ brain 插件 ↔ LLM/embedding/brain-data）
  2. `docs/img/turn-sequence.png` — 单轮读写时序（读路径 ①–⑥ / 写路径 ⑦–⑪）
  3. `docs/img/memory-lifecycle.png` — 记忆生命周期（蒸馏→episodic→巩固/遗忘→semantic→检索→注入闭环）
  4. `docs/img/brain-regions.png` — 五类数据 ↔ 脑区映射（呼应鲸脑皮层 UI）
  5. `docs/img/trial-timeline.png` — 10-29→11-03 试运行时间线
- 风格：白底、`#E8F1FC` 卡片、`#3B82F6` 主线、`#D97706` 写路径点缀、PingFang SC 中文标签
- SVG 源码保留在 `docs/img/src/`，PNG 用 headless Chrome 1600×900 截图产出
- README 五个 IMG-SLOT 注释替换为 `<img>` 标签
- `docs/readme-image-prompts.md` 头部更新为「设计稿留档」说明

## Acceptance Criteria

- [x] 五个 SVG 无标签重叠、箭头不穿卡片
- [x] PNG 非空（100–160KB），逐张目检通过
- [x] README 无残留 IMG-SLOT 注释
- [x] readme-image-prompts.md 更新为现状说明

## Resolution（2026-11-03）

### 遇到了什么问题

1. **首轮渲染全部空白**：wrapper HTML 放在 /tmp，`src/*.svg` 相对路径解析失败，五张 PNG 都只有 ~7KB。
2. **标签/图形重叠**：生命周期图两处箭头穿过「遗忘」「semantic」卡片；架构图两条竖直箭头的标签在 y=428 同行相撞；架构图云图标压住「聊天/蒸馏 LLM」首字；时序图序号圈 ③⑦ 压字；时间线「下一步」卡片盖住 11-03 徽章。

### 怎么解决的

- wrapper 移到 `docs/img/` 内截图，相对路径生效，PNG 涨到 100–160KB。
- 生命周期图改走线绕开卡片；架构图标签左右分置、LLM 卡片标题右移；时序图 ③⑦ 序号圈移到行尾；时间线「下一步」下移到 y=700 避让徽章。
- 逐张 `read` 目检两轮，确认无残留重叠后替换 README 占位。

### 后续优化方向

- brain-regions 的脑轮廓是程序化贝塞尔，形准一般，可换更精细的脑剖面路径。
- 时间线留白偏大，可补一张横向更紧凑的变体。
- 若 README 数据更新（如 session 数、成本），需同步改 SVG 重渲。

### 什么时候干的

2026-11-03，本会话内一轮绘制 + 两轮修正。

### Key Decisions

- **手绘 SVG 而非 AI 生图**：中文标签零错字、可精确修版、源码留档可迭代。
- **PNG 而非直接嵌 SVG**：GitHub README 对 SVG 渲染和字体的支持不可控，PNG 保真。
- **保留 prompts 文档**：作为构图设计稿留档，注明现状与重绘建议。

### 验证结论

五张 PNG 逐张目检通过；`git status` 仅含预期改动（5 PNG + 5 SVG + README + prompts + 本任务目录）；README 五个 IMG-SLOT 全部替换。
