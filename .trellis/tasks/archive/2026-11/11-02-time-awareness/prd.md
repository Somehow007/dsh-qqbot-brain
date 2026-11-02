# 让大肥鱼知道每句话是什么时候说的

## Goal

落地「时间归因层」：让大肥鱼（含聊天模型与蒸馏/脉络/巩固三条写路径 LLM）看得到消息是何时说的。
发言时机（听而不说/主动开口）明确不做，留作上游依赖项。

## Requirements

- `Turn.at` 已存在但从不渲染：蒸馏/脉络 prompt 的 convo 行加 `[YYYY-MM-DD HH:mm]` 时间戳，并附「当前时间」行供相对时间锚定。
- 一轮内多条用户消息（pendingUser 队列）保留逐条时间：turn/end 拼 userText 时 >1 条则逐行嵌 `[HH:mm]`。
- 记忆行从 `今天/N天前` 细化为 `N分钟前/N小时前/N天前`（同一 `ageLabel` 助手函数，巩固列表同用）。
- 注入侧新增 `brain:clock` section（order 85，`【当前时刻】日期+星期+时刻`），配置开关 `injectClock`（默认开）。
- 时区可配：`timeZone` 配置项（默认 `Asia/Shanghai`），插件 cfg → BrainConfig 显式接线（spec 教训：cfg.retrieval 曾漏接）。
- `[Chat history]` 行时间戳在官方包渲染层丢弃，插件侧无法补——不动，记入缺口。
- 时区非法输入降级为系统时区，不抛错。

## Acceptance Criteria

- [ ] `npm test` 全绿（含新增时间用例：formatClock/formatStamp/ageLabel、clock 注入、convo 时间戳、多消息 `[HH:mm]` 拼接、巩固列表年龄标注）
- [ ] `npm run typecheck` + `npm run build` 通过
- [ ] 蒸馏 prompt 中每行 convo 形如 `[YYYY-MM-DD HH:mm] 发言人：内容`，末尾有 `当前时间：…` 行
- [ ] assemble 的 BrainContext 带 `clock` 字段；`brain:clock` section 出现在注入列表
- [ ] 记忆行同日不再显示 `今天`，显示 `N小时前/N分钟前`

## 边界声明（不做）

- 不做 requireMention / 沉默 / 主动开口任何改动（上游依赖项，见 11-02-when-to-speak-review）
- 不改官方包（`[Chat history]` 无时间戳保持现状）
- 不动记忆结构/JSONL op（纯展示与 prompt 层变更，无 schema 迁移）

## Resolution（2026-11-02）

- **遇到了什么问题**：「谁说了什么」闭环后，大肥鱼不知道每句话是什么时候说的——时间戳只存在于内部字段，渲染层全丢。
- **怎么解决的**：
  - 新增 `src/brain/time.ts`：`formatStamp`（convo 行 `[YYYY-MM-DD HH:mm]`）、`formatShort`（轮内多消息 `[HH:mm]`）、`formatClock`（当前时刻行含星期与时区标签）、`ageLabel`（`N分钟前/N小时前/N天前`）；非法时区降级系统时区。
  - 注入侧：`brain:clock` section（order 85，【当前时刻】日期+星期+时刻），`injectClock` 开关默认开；记忆行由 `今天/N天前` 细化为分钟/小时/天粒度（本群+跨群召回两处同改）。
  - 写路径：蒸馏/脉络 convo 行带轮级时间戳并附「当前时间」锚点行；一轮内多条用户消息在 userText 逐条嵌 `[HH:mm]`；巩固列表与「已有记忆」列表带 `[N天前]` 形成时间标注。
  - 配置：`timeZone`（默认 `Asia/Shanghai`，`DEFAULT_TIME_ZONE` 单一出处）从 plugin config → `BrainConfig` 显式接线；`SessionCapture` 第 5 参接时区。
- **后续优化方向**：`[Chat history]` 行时间戳需官方包渲染层保留（上游）；「听而不说/主动开口」为独立上游依赖项（见 when-to-speak-review）。
- **什么时候干的**：2026-11-02。
- **Key Decisions**：时间渲染全部收敛到 `brain/time.ts` + `DEFAULT_TIME_ZONE` 单一出处，避免四处字面量漂移；轮内多消息时间嵌入 userText 而非扩展 Turn schema（无迁移成本）；`brain:clock` 放 order 85——记忆之后、发言人之前。
- **验证结论**：`npm test` 102/102（新增 4 个时间用例：助手函数渲染、clock 注入、convo 时间戳+锚点行、巩固列表标注；多消息断言更新为 `[HH:mm]` 逐条格式）；`typecheck` + `build` 全绿。spec 已同步 time.ts 约定（`.trellis/spec/backend/index.md`）。
