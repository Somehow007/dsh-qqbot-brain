# 迭代C 设计：Brain.search 原语 + recall-intent 深挖门控

> 上游：`11-09-iteration-upgrade-plan/iteration-plan.md` §4。本文件定稿实现口径，
> 与 plan 的出入处（search opts 形状、深挖地板策略）在 §6 记录。

## 1. 总体结构

```
assemble(sessionId, query, speaker, queryVec)          ← 现有 lane-1（不动）
  ├─ retriever.query(visible∩session+global, topK=6)   ← lane-1 topK 被动截断
  ├─ attitude 保底 / 跨群 xpool / 画像                  ← 现有
  └─ maybeDeepRecall(...)  ← 新增：意图∧弱命中 → Brain.search 深挖 → deepRecallLines

Brain.search(sessionId, query, opts?, queryVec?)       ← 新公共原语（纯检索）
  └─ retriever.query(可见池, opts) → ScoredNote[]      ← companion 壳层将来直接消费
```

分层理由：门控放 `Brain.assemble` 内——BrainContext 一处产出全部注入行，
injector 只负责渲染 section；companion 侧可复用 `assemble`（白得深挖）
或直接调 `search`（tool 语义更纯）。

## 2. `Brain.search` 原语

```ts
export interface BrainSearchOptions {
  limit?: number;        // 返回上限，默认 cfg.topK；仍受 candidatePool 粗排帽
  kinds?: readonly MemoryNote['kind'][];  // 默认全部
  crossSession?: boolean;                // 默认 false=本会话+全局域
  minCos?: number;       // 覆盖 cfg.minCosine（lex 路径地板）
  minEmbedCos?: number;  // 覆盖 cfg.embedMinCos（emb 路径地板）
}
search(sessionId: string, query: string, opts?: BrainSearchOptions, queryVec?: number[]): ScoredNote[]
```

**可见池口径（与 assemble 逐字一致）**：
`allNotes().filter(n => trackVisible(n) && !n.absorbedAt && scopeVisible(n, sessionId))`
——三轨按当前活动人设、私域按目标会话、absorbed 退池，全部读时判定。

**池→索引的两种形态**（Retriever.indexFor 按 indexKey+version 缓存，
不同池形态必须用不同 key，否则命中旧池索引静默串味）：

| 形态 | retriever 入参 | indexKey |
| --- | --- | --- |
| 默认（无 kinds 无 crossSession） | `query(visible, sessionId, …)` 不传 pool | `undefined`→sessionId（与 assemble 共享索引缓存） |
| 变体（kinds 或 crossSession 任一） | `query(visible, sessionId, …, {pool, indexKey})` | `__search__${cross?'x':'s'}:${sessionId}:${kindTag}` |

- crossSession=false 的变体：pool = visible ∩ (sessionId===sid || GLOBAL) ∩ kinds
- crossSession=true：pool = visible ∩ kinds（全会话，scopeVisible 已按目标会话过滤私域）

**纯检索无副作用**：不 reinforce/hits/strength——「被唤起」语义由调用方
决定（assemble 深挖路径自己按 rel 阈值 reinforce；companion tool 后续自行定夺）。
理由：eval/走查需要可重放的确定性查询；reinforce 属写路径不属于检索原语。

**Retriever.query opts 扩展**：`{pool?, indexKey?, limit?, minCos?, minEmbedCos?}`
- `limit` 替换 `Math.min(topK, candidatePool)` 的 topK 位（仍受 candidatePool 帽）
- `minCos`/`minEmbedCos` 替换 cfg.minCosine/embedMinCos 两道相关性地板
  （emb 路径只对带向量条目生效；无向量条目走 lex 分支吃 minCos——与现状一致）

## 3. recall-intent 门控（assemble 内）

### 3.1 触发条件（双门，全过才深挖）

1. `cfg.deepRecall.enabled`（默认 true）
2. `RECALL_INTENT_RE.test(queryText)` —— types.ts 导出，词表：
   `还记得|记得吗|记不记得|记得不|之前(说|提|聊|讲)|以前(说|提|聊|讲)|
   上次(说|提|聊|讲)|去年|当时|什么来着|咱们(之前|上次|聊过|说过)|
   你忘了|忘了没|do you remember|remember when`（i 标志）
   - queryText = lastUserText（已剥 tag/引用/history，干净单条用户消息）
3. **弱命中**：`scored` 中 rel ≥ 路径强化阈（emb→reinforceMinEmbedCos / lex→reinforceMinCos）
   的条数 `< cfg.deepRecall.weakRelHits`（默认 2）
   - 用「真相关」口径而非 hits.length：lane-1 可能凑满 6 条但全是擦边弱命中，
     对「你还记得…」这类考问仍属召回失败

### 3.2 深挖执行

```ts
const deep = this.search(sessionId, queryText, {
  limit: cfg.deepRecall.candidates,      // 候选深度（默认 12）
  crossSession: cfg.deepRecall.crossSession, // 默认 true
  minCos: cfg.deepRecall.minCos,         // 默认 0.07（严于 lane-1 的 0.04）
  minEmbedCos: cfg.deepRecall.minEmbedCos // 默认 0.55（介于 0.47/0.62 之间）
}, queryVec);
```

**地板策略（与 plan 出入，见 §6；eval 驱动二次修正）**：
初版按「不放宽地板」实现（缺省吃 cfg.minCosine/embedMinCos），eval 深挖噪声用例
d04（「你还记得我去年冬天滑雪摔断腿的事吗」）实测注入了 rel=0.057 的擦边噪声——
深挖行以「[深挖·跨群·N天前记]」权威口径呈现，误召比漏召伤害大。
fixture 校准：lex 噪声顶 ~0.066、真命中底 ~0.084 → `minCos` 默认 **0.07**
（严于 lane-1 候选地板 0.04，松于强化阈 0.15）；emb 取 **0.55**
（embedMinCos=0.47 与 reinforceMinEmbedCos=0.62 的中值，emb 噪声底~0.56——
本地无 embed key 未实测，线上观察后可调）。两值均可经
`retrieval.deepRecall.{minCos,minEmbedCos}` 覆盖，0=不限。

**去重**：exclude = lane-1 scored ids ∪ attitude 保底 extras ids ∪ xpool ids
（凡已注入的都不重复）；取前 `deepRecall.limit`（默认 3）条。

**强化**：picked 条目按 lane-1 同规则 reinforce（rel≥路径阈才刷）——
深挖命中是真实唤起，参与衰减语义；未 picked 的候选不强化（只注入的算唤起）。

### 3.3 输出

`BrainContext.deepRecallLines: string[]`（恒在，空数组=未触发）：
```
- [深挖·{ageLabel}记] [actor] content           // 本会话/全局域
- [深挖·跨群·{ageLabel}记] [actor] content      // 其他会话（scopeVisible 已过滤私域）
```
injector 新 section `brain:deeprecall` order=10325（memory 10320 与 emotion 10330 之间，
同属易变尾段，不影响前缀缓存分段），文案 `【深挖记忆】\n…`，
`config.injectDeepRecall && lines.length` 双门；debug 时 log 命中数。

## 4. 配置面

```ts
// types.ts BrainConfig += 
interface DeepRecallConfig {
  enabled: boolean;        // false=整路关闭（成本纪律）
  crossSession: boolean;   // 深挖池是否跨会话（默认 true）
  weakRelHits: number;     // lane-1 真相关命中 < 此值才触发（默认 2）
  limit: number;           // 注入条数上限（默认 3）
  candidates: number;      // 深挖候选深度（默认 12）
  minCos: number;          // 深挖 lex 地板，默认 0.07（0=不限）
  minEmbedCos: number;     // 深挖 emb 地板，默认 0.55（0=不限）
}
```

DEFAULT_BRAIN_CONFIG.deepRecall 全字段给默认值。
Brain 构造器显式深合并：`deepRecall: {...DEFAULT.deepRecall, ...(opts.config?.deepRecall ?? {})}`
——BrainConfig 是 Partial 平铺风格，嵌套对象必须防半覆盖。

插件侧：`RetrievalConfig.deepRecall?: Partial<DeepRecallConfig>`；
src/index.ts 装配 `deepRecall: {...DEFAULT_BRAIN_CONFIG.deepRecall, ...(cfg.retrieval.deepRecall ?? {})}`。
`BrainPluginConfig.injectDeepRecall: boolean` 默认 true（cordis.patch.yml 可关）。

## 5. HTTP / eval / 测试

- `GET /api/query?session=&q=&depth=1`：走 `Brain.search` 深挖参数
  （crossSession+ candidates 深度），返回 `{hits:[{id,content,importance,retention,hits,rel,score,relSrc}]}`。
- eval：`cases.json` 增 `deepCases`（意图词+旧弱记忆用例）与噪声用例；
  run.ts 对深挖用例统计 lane-1/deep 归属（rescued=lane-1 未中深挖救回），
  主用例 expectNone 计入 deepRecallLines（深挖行同属注入面），
  深挖用例 expectNone 只计 deepPool（隔离迭代C增量，lane-1 噪声由主用例度量）。
- 单测（brain.test.ts 追加）：search 口径矩阵、门控四态、去重、私域/三轨隔离、
  RECALL_INTENT_RE 边界。

## 6. 与 plan §4 的出入记录

| plan 原文 | 本设计 | 理由 |
| --- | --- | --- |
| opts 含 `minRel` | 拆为 `minCos`/`minEmbedCos` | lex/emb 是不同分布的余弦，单一下限无法分路径表达；retriever 本就分两道地板 |
| 深挖「召回」未明说地板 | **默认严于 lane-1**（lex 0.07 / emb 0.55），eval 驱动 | 初版沿用 lane-1 地板，eval 噪声用例实测注入 rel=0.057 擦边噪声；深挖行权威口径呈现，宁缺毋滥。增量仍来自深度 6→12 + 跨会话池 |
| search 返回 ScoredNote[] | 同，且**纯检索不 reinforce** | 原语可重放；唤起语义归调用方（深挖路径自理） |
| ——（实现期新增） | `injectDeepRecall=false` 时 `deepRecall.enabled` 一并置 false | 成本一线：不为不注入的 section 白付深挖检索 |

## 7. 风险与成本

- **成本**：零新增 LLM 调用；深挖仅在「意图词∧弱命中」时多一次 retriever.query
  （lexical 纯本地计算；queryVec 复用 injector 已取的缓存向量，**不重复调 embed API**）。
  注入增量 ≤3 行/次触发。`injectDeepRecall=false` 或 `deepRecall.enabled=false` 全关。
- **噪声风险**：意图词误命中（「去年」「当时」较宽）→ 由弱命中门 + 深挖专属地板
  （lex 0.07 / emb 0.55，严于 lane-1）+ ≤3 条上限三重收敛；eval 噪声用例已验证
  （d04 深挖噪声=0），线上观察窗继续盯误触发率，不行则收紧词表/提高 weakRelHits/抬地板。
- **索引缓存**：变体池用独立 indexKey 命名空间，不污染 assemble 索引；
  indexFor 按 version 失效，persona 切换/写入已 bump graphVersion（迭代A 已修）。
- **并发**：assemble 同步路径，search 纯读——无新异步面。
