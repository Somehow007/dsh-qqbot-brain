# 审查大肥鱼说话时机与时间信息现状

## Goal

「谁说了什么」的归因闭环（`[昵称 (openid)]` 解析 → actor → `u:` 画像 / attitude 绑人）成立后，
审查「什么时候说」的现状。该问题拆两层：

- **时间归因层**（谁、什么时候、说了什么里的 when）：模型是否看得到「消息是何时说的」
- **发言时机层**（bot 什么时候开口）：什么时候触发一轮、能不能主动说、能不能选择沉默

纯讨论留痕，无代码变更。

## Requirements

- 结论基于 `dsh-qqbot-brain/src/` 与官方包 `@tencent-connect/dsh-qqbot`（`~/.dsh/profiles/qqbot/node_modules/`）
  的实际代码，不以 README 为准。
- 区分「插件内可做 / 宿主配置可做 / 上游或平台层才可行」三个修复面。

## Resolution（2026-11-02）

- **遇到了什么问题**：归因闭环解决「谁说了什么」后，「什么时候说」仍开放。审查发现它实际是两个独立缺口。

- **现状（证据链）**：

  ### A. 时间归因层 —— 抓得到、看不到（半盲）
  - 底层时间戳都存在：`Turn.at`（`src/capture/events.ts`，捕获时 `Date.now()`）、SDK `HistoryEntry.timestamp`
    （`qqbot-nodejs/dist/middleware/history-buffer.js`，`Date.parse(ctx.message.timestamp)`）、`MemoryNote.createdAt`、情绪 `updatedAt`。
  - 但到达模型的只剩天粒度：记忆行 `[今天记]`/`[N天前记]`（`src/brain/index.ts` assemble，`floor(ageInDays)`），
    同一天早/晚不分，跨午夜失真。
  - 蒸馏/digest prompt 渲染为 `发言人：内容 / 角色：内容`，**不带任何时间戳**（`src/brain/distill.ts`
    `buildDistillPrompt`/`buildDigestPrompt`）→ 蒸馏 LLM 没有时间锚点，「明天/下周」类相对时间无法锚定。
  - 宿主 `[Chat history]` 渲染为 `[name (id)] content`（`dsh-qqbot/dist/transport/inbound.js`
    `buildAgentBody`）：SDK 明明存了 timestamp，渲染层丢弃。官方 `qqbot:scope-prompt`(order 90)
    只是用户 groupPrompt 静态文本（`session-manager.js`），也不含动态时间。
  - 后果：无法回答「他今早说的还是昨晚说的」、无法感知消息间隔/沉默时长、承诺类记忆的时间词漂移。

  ### B. 发言时机层 —— 宿主一刀切、脑没份（全盲 + 无手）
  - 触发链：QQ 事件 → 中间件链 → `mentionGate(requireMention)` → `agent.followup` → turn。
    `requireMention` 默认 `true`（`dsh-qqbot/dist/config.js`），qqbot profile patch 未覆盖 → 「被 @ 才说」是
    中间件常量，不是任何模型的决策。
  - 非 @ 群消息：`historyBuffer(recordOnSkip)` 写入共享 `MemoryHistoryStore`（环形 `historyLimit=10`）→
    仅当下次 @ 时以 `[Chat history]` 文本拼进 agentBody → 回复后 `clearGroupHistory` 清空。
    **不产生 session/event → brain 完全不可见** → 记忆里没有「没被 @ 的那段时间」。
  - 主动开口：无通道。出站有三级兜底（`reply-target.js`：msgId → 缓存候选 → 无候选降级主动推送），
    但只在 agent 已决定说话时兜底；插件两个钩子（`session/event`、`system-prompt/assemble`）都活在
    已决定的 turn 内部，拿不到 `SessionManager` 无法自发 followup；脑内定时器只碰记忆不碰会话。
  - 沉默选项：半个。`outbound.js onMessage` 对空文本不发送（`!fullText.trim() return`）→「被 @ 但沉默」
    物理可行，但无 prompt 引导，且已烧一轮 LLM 成本。
  - 平台层未知：非 @ 群消息能否到达取决于 QQ 开放平台 intent 权限（公域消息权限）；若只推
    GROUP_AT_MESSAGE_CREATE，连 historyBuffer 都只有 @ 消息，「听见了没说」这层物理上不存在——需确认。

- **怎么解决的**：对照插件源码（capture/inject/brain/distill）+ 官方包编译产物
  （inbound/outbound/middleware-setup/history-buffer/session-manager/config）逐层走查，得出：
  「谁说了什么」之所以成立，是因为宿主把归因信息喂进了 turn、插件再加工；「什么时候说」没解决，
  是因为宿主在渲染层丢时间、门控层砍输入、出站层无回路——数据到过中间件手里，到模型眼前都被剥掉了。

- **可行方向（按修复面分层）**：
  - 插件内可做（低成本）：注入「当前时刻」行（新 section 或并入 emotion 行，含日期/星期/时刻）；
    蒸馏与 digest 的 convo 行渲染 `Turn.at`；记忆行今天内细化到「N 小时前」。
  - 宿主配置可做：`requireMention=false` 听全量（前提平台推全量消息），但必须配套「选择性沉默」
    （prompt 引导空回复可行，代价是每条消息一轮 LLM）；可先在 groupPrompt 写沉默规则试探。
  - 上游/平台层：「听而不说」的轻量判定钩子、程序化 followup（主动开口）、`[Chat history]` 保留
    timestamp——均需官方包/SDK 变更或平台 intent 权限，当前架构无解。

- **后续优化方向**：先落地插件内时间注入（小改）；把「时机决策」列为上游依赖项跟踪；
  确认 QQ 侧 intent 权限后再评估 requireMention=false 的成本/价值。

- **什么时候干的**：2026-11-02。

- **Key Decisions**：本轮仅审查留档，不改代码；「什么时候说」拆为「时间归因」+「发言时机」两条线分别定性。

- **验证结论**：核对文件 `src/capture/events.ts`、`src/inject/prompt.ts`、`src/brain/index.ts`、
  `src/brain/distill.ts`、`src/config.ts`，及官方包 `dist/transport/inbound.js`、`dist/transport/outbound.js`、
  `dist/gateway/middleware-setup.js`、`dist/session/session-manager.js`、`dist/config.js`、
  SDK `dist/middleware/history-buffer.js`；并检索 trellis mem 全部 25 个历史会话确认该问题此前未被讨论。
