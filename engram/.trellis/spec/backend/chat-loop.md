# chat loop 不变量

`src/chat/loop.ts` `ChatLoop.handleUserMessage` 是唯一对话入口。以下不变量是记忆正确性与成本纪律的交集，改动前先读懂再动。

## 串行化

- 所有消息经 `this.chain` promise 串行执行——Turn 配对假设 user/assistant 严格交替，并发会交错污染 ingest 批次。**不要**为「提速」并行化 chat 调用。

## 单轮管线（顺序不可换）

```
history.append(user)          ← 真实发生的对话先落盘
→ queryEmbedding(缓存) + assemble
→ buildSystemPrompt(ctx) + history.toMessages()
→ llm.chat [+ tool loop ≤2 轮，仅 brain_search]
→ history.append(assistant, usage)
→ brain.ingest(Turn via:'user') → fired intents
→ void brain.endOfTurn        ← 后台蒸馏
→ proactive.consume(fired)    ← 异步，不阻塞回复
```

## 失败语义（最重要的一条）

- `llm.chat` 返回空/undefined → 返回降级文案（流萤腔，不暴露错误），**不写 assistant history、不 ingest**。用户消息已在 history（真实发生），但该轮不进 brain——**失败轮不污染记忆**。
- `assemble` 抛异常 → 降级裸聊（空 BrainContext）继续回复，log 记录。
- `ingest`/`endOfTurn` 抛异常 → 仅 log，回复照常返回（消息已送达用户，记忆侧让位）。

## history 边界（成本一线）

- `chat-log.jsonl` 追加写持久化；内存视图 `maxTurns`/`maxChars` 截头保尾。
- `toMessages()` 把 `proactive` 归并为 assistant role——LLM 看到的是「她说过的话」，与 UI 三角色展示解耦。
- system prompt 稳定段在前（人格内核/脉络/表达口径），易变段贴尾（发言人/立场/记忆/情绪/时刻）——前缀缓存友好，**不要**把易变内容提到稳定段前。

## tool loop

- 仅 `brain_search` 一个工具，`cfg.tools.brainSearch` 默认 false。
- 上限 `TOOL_MAX_ROUNDS=2`；未知工具回「未知工具」tool 消息让模型收敛。
- tool 结果 topK≤5、截断注入，见 `src/chat/tools.ts`。
