# 设计：记忆质量修复（蒸馏v2 + 检索纠偏 + 评测集 + 身份层 + 滚动摘要 + embedding）

> 依据：`.trellis/tasks/10-31-memory-context-persona-eval/prd.md` 调研结论；用户决策 P0+P1 全排 + 引入第二家 embedding API。

## D1 检索评分纠偏（retrieval.ts / types.ts / index.ts）

### 现状问题

`score = α·cos + β·R + γ·imp/5`：β·R 基线 0.4 与 minCosine 门槛配合后，热度主导排名；保底态度条目每轮 reinforce → hits 虚高、R 恒 1、锁死 topK。

### 方案：相关性门控评分

```
rel   = 相关性分（embedding 可用时=embCos，否则=lexCos）
score = α·rel·(1 + β·R) + γ·imp/5
```

- rel 是硬门槛（minCosine 不变），R 退化为对「相关命中」的 ≤(1+β) 倍 boost，无关记忆拿不到 R 的分
- imp 保留小权重加分（Generative Agents 式先验），但量级压不倒 rel 差异
- BrainConfig 默认值改为 `alpha=1.0, beta=0.5, gamma=0.2`；新增 `reinforceMinCos=0.15`：只对 rel≥该阈值的命中做 reinforce
- `Retriever.query` 返回 `ScoredNote {note, rel, score}[]`；`preview`/`assemble` 调用方适配
- 发言人保底 attitude：单独数组进 `attitudeLines`，不计 hits、不 reinforce（恒驻上下文，无需用进废退）

## D2 蒸馏 prompt v2（distill.ts）

- memories 白名单四类：①用户事实（身份/经历/拥有物）②稳定偏好/厌恶 ③承诺与约定 ④关系/互动模式变化
- 黑名单：一次性拌嘴/玩梗/寒暄；角色自己的回话（角色做出的承诺除外，记为「我答应某人…」）
- importance 锚点：5=承诺或重要个人信息，4=稳定偏好，3=关系变化，2=一般事实，1=琐碎（默认不写 1 分条目——不值得记）
- 统一第三人称（「某用户/某人：事实」），actor 填发言人昵称
- merge/forget/kind=attitude 机制与输出 schema 不变，保证 parser 不动

## D3 Embedding 接入（新 brain/embed.ts + store/retrieval/config/index）

- `Embedder`：OpenAI 兼容 `POST {baseUrl}/embeddings`，body `{model, input:[texts]}`；env `BRAIN_EMBED_API_KEY`/`BRAIN_EMBED_BASE_URL`/`BRAIN_EMBED_MODEL`；无 key → enabled=false → 全链路回退 lexical（D1 的 lexCos）
- 写路径：`endOfTurn` 蒸馏落库后对新/改记忆批量 embed，op `'embed' {id, vector}` 持久化到 note.embedding（快照随带）；启动时对缺 embedding 的旧记忆后台补算（每 tick 限 5 条）
- 读路径：`PromptInjector` 在 assemble 前 `await embedder.embed([query])`（失败静默回退）；`Brain.assemble` 增参 `queryVec?`，retriever 有 vec 的条目用 embCos（门槛 `embedMinCos`，默认 0.25），无 vec 条目仍用 lexCos
- 维度：模型输出维度不自适应限制；JSON 存全精度（~7KB/条，规模可接受）

## D4 身份层：跨会话召回 + 画像归并（brain/index.ts / store.ts / identity.ts）

- 跨会话召回：发言人带 openid 或 nick 时，检索其他会话中 `actor` 匹配该人且 kind∈{attitude,semantic} 的条目，rel/R 排序取 ≤2 条，注入 `[跨群记忆]` 前缀行；episodic 不跨群（防流水外溢）
- 画像归并（读侧）：`name` 完全相同的 `u:` 条目在注入与 `people()` 展示时合并为一份（text 取最近更新者为主、其他要点拼接或简单取最新）；不动写侧、不迁移数据——昵称碰撞的误并风险可接受，后续再引入确认机制
- `MemoryNote.actor` 里 openid 已可解析（`splitActor`），跨会话匹配用 openid 优先、昵称兜底

## D5 会话滚动摘要 + 注入扩容（新 digest 机制）

- Brain 内 `historyBuffer: Map<sid, Turn[]>`（ingest 时追加，cap 60 条）：摘要输入不依赖宿主 transcript
- 触发：`endOfTurn` 中累计轮数 ≥ `digestEveryTurns`（默认 15）→ `distiller.digest(recent ≤40 turns, priorDigest, persona)` → op `'digest' {sessionId, text, uptoTurn}` 持久化
- 注入：新增 section `【会话脉络】` order 81（persona 80 与 emotion 82 之间）
- prompt：滚动摘要 250 字内——「最近这段时间在聊什么、谁的什么事、有无未完结话题/承诺」，合并旧摘要而非另起
- 注入预算：digest ~300 字 + 记忆 topK6 + 跨群 ≤2 + 画像 ≤2 + 情绪/立场/发言人 ≈ 1.5-2.5K 字符，仍远小于窗口

## D6 迷你评测集（test/eval/）

- `test/eval/cases.json`：基于线上 44 条真实记忆（快照导出裁剪）构造 ~20 用例，字段 `{query, sessionId, expectHit: [noteId], expectNone?: bool}`
- `test/eval/run.ts`（npm script `eval`）：加载 fixture → Retriever + assemble 路径 → 输出 recall@6、误命中数、逐用例明细；lexical 路径离线可跑，embedding 路径有 key 时自动启用对比
- 常规 `npm test` 不跑 eval（fixture 依赖真实数据形态），仅作手动尺子

## 接口与配置变更汇总

- `BrainConfig`：alpha/beta 语义重定义 + `reinforceMinCos`、`embedMinCos`、`digestEveryTurns`、digest cap 常量
- `MemoryNote`：`embedding?: number[]`
- 新 op：`{op:'embed', id, vector}`、`{op:'digest', sessionId, text}`
- `BrainPluginConfig`：`embed{enabled,baseUrl,apiKey,model,timeoutMs}`、`digest{enabled,everyTurns}`
- `Brain.assemble(sessionId, query, speaker?, queryVec?)`、`BrainContext.digest?: string`
- `store`：`setDigest/digestOf`、`setEmbedding`
- `people()`/注入画像读侧按 name 合并

## 测试计划

- 更新：保底态度不再 reinforce 的断言；`query` 返回 ScoredNote 的适配
- 新增：评分门控（无关高热记忆不进 topK）；reinforceMinCos；跨会话召回限 kind；画像同名合并；digest 触发与注入；embed op 持久化与回退；蒸馏 v2 prompt 文本断言
- `npm test` / `npm run typecheck` / `npm run build` 全绿
