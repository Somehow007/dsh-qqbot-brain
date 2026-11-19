# 主动开口（proactive）契约

`src/chat/proactive.ts` `ProactiveService`：slice2 能力，消费内核 intents + 定时问候。**默认 `enabled=false`**，声口基线跑稳后开。

## 触发源（两个，汇进同一 `consume()`）

1. `ChatLoop` ingest 返回的 `fired IntentEntry[]`（event/time intent 触发）
2. `main.ts` 60s `tickIntents()` 定时器 + deferred 队列重试（`onTick`）

内核侧 intent 自身已有 cooldown/maxFires/expiry 约束；壳层预算是**第二道闸**，两层都要过。

## 预算闸门（`gate()`，顺序固定）

```
enabled → quietHours(静默窗) → minInterval(最小间隔) → maxPerDay(日上限)
```

- 不通过 → intent 进 `deferred` 队列（state 持久化 `proactive-state.json`），下个 tick 重试——**静默窗结束后补发比丢弃好**，但 `restartCatchupHours`（默认 2h）外的离线补触发直接跳过（丢的是时机不是内容）。
- 跨零点静默窗（23:00–08:00）按 `cur >= start || cur < end` 判定；`cfg.timeZone` 口径。

## 投递语义（`deliver()`，provenance 命门）

1. `history.append('proactive', text, {via:'agent'})` → SSE broadcast
2. `brain.ingest(sid, Turn{userText:'', assistantText:text, via:'agent'})` → `void endOfTurn`
3. `dayCount++/lastSentAt/state 持久化`

via:'agent' 是**记忆不污染的唯一保障**——绝不能用 via:'user' 或缺省发主动消息（会把 bot 的话当用户事实蒸馏）。

## 生成方式（成本一线）

- 轻量 prompt：人设 + intent.text + 情绪行 + 时刻，**不带全量 history**（~2–3k tok/条）。
- `buildProactivePrompt` 在 prompt.ts；生成失败 → 记 log 不重试风暴（deferred 只在预算恢复时自然重试）。

## 状态文件

`proactive-state.json`：`{dayKey, dayCount, lastSentAt, deferred[]}`——重启不丢日预算与队列。损坏时按空状态启动（宁可多发不可炸）。
