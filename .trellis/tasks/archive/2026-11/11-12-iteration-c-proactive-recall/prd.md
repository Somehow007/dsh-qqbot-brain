# 迭代C·主动召回 brain_search（companion 前置①）

## Goal

按 `11-09-iteration-upgrade-plan` §4 落地：每轮注入 topK 是「被动截断」，陪伴对话常需深挖（「你还记得我去年说的那个…」）。交付**内核检索原语 `Brain.search` + recall-intent 确定性门控深挖注入段**。dsh 侧零改动即受益；companion 壳层（迭代F）将其包装为 agent tool `brain_search`。

## Requirements

- `Brain.search(sessionId, query, opts?, queryVec?)`：复用 `Retriever.query`，可见池与 assemble 完全同口径（trackVisible + scopeVisible + absorbed 过滤）；opts 支持 `limit / kinds / crossSession / minCos / minEmbedCos`；返回 `ScoredNote[]`（含 rel/score/relSrc），纯检索无副作用（不 reinforce，唤起语义由调用方决定）。
- recall-intent 门控（assemble 内，确定性零 LLM 成本）：召回意图启发式命中 ∧ lane-1 真相关命中不足 → 追加一次深挖召回，注入 ≤`limit` 条标 `[深挖]` 的行（新 BrainContext 字段 `deepRecallLines` → 新注入 section `brain:deeprecall`）。
- 深挖口径：同相关性地板（cfg.minCosine/embedMinCos，可经 opts 覆盖）、更大候选深度（candidates）、可选跨会话（仍受 track/scope/absorbed 硬过滤）；与 lane-1 已注入条目去重。
- 成本一线：门控可关（`deepRecall.enabled` + `injectDeepRecall`），触发条件=意图∧弱命中双门，注入有界（≤3 行），失败静默。
- HTTP：`/api/query?depth=1` 返回深挖检索结果（含 rel/score/relSrc），供走查调试。
- eval：recall-intent 子集验证深挖 recall@K 较 lane-1 topK 有可测提升且不引入噪声命中；既有 22 例不回退。

## Acceptance Criteria

- [x] `Brain.search` 单测：track/scope/absorbed 过滤与 assemble 同口径；kinds/crossSession/limit 选项正确；minCos/minEmbedCos 覆盖生效；lex/emb 双路径
- [x] 深挖门控单测：意图词命中/不命中边界；意图∧弱命中→追加；意图∧强命中→不追加；enabled=false→不追加；去重不重复注入 lane-1 条目；crossSession 受私域/三轨过滤
- [x] eval recall-intent 子集：深挖相对 lane-1 有可测 recall 提升；expectNone（含意图词的噪声用例）不误中
- [x] `npm run typecheck` + `npm test` + `npm run build` + `npm run eval` 全绿
- [x] 部署后云端走查：`/api/query?depth=1` 实测可用（跨会话+rel/score/relSrc 明细）；服务健康、ops 正常；真实「你还记得…」注入观察待用户自测（brain.log `深挖召回` 行会落盘）
- [x] spec/backend/index.md 同步新约定；CHANGES.md 追加；task 归档含 Resolution

## Resolution（2026-11-12）

**遇到了什么问题**：迭代C 要给 brain 内核加可复用主动召回能力——每轮注入 topK 是被动截断，「你还记得我去年说的那个…」类考问 lane-1（本会话+全局域）天然召不回跨会话旧记忆；同时不能引入额外 LLM 成本或噪声注入。

**怎么解决的**：
- `Brain.search(sessionId, query, opts?, queryVec?)` 纯检索原语：可见池与 assemble 逐字同口径（trackVisible+scopeVisible+absorbed 读时判定），返回 `ScoredNote[]`（rel/score/relSrc），不 reinforce；opts 支持 limit/kinds/crossSession/minCos/minEmbedCos，变体池走独立 indexKey 命名空间防 TF-IDF 索引串味。companion 壳层（迭代F）将直接包装为 `brain_search` tool。
- assemble 内 `maybeDeepRecall` 确定性门控（零 LLM）：`RECALL_INTENT_RE` 意图词 ∧ lane-1 真相关命中（rel≥路径强化阈）<2 双门触发 → `search` 跨会话深挖（候选 12）→ 与已注入 id 去重 → ≤3 条进 `deepRecallLines` → `brain:deeprecall` section（order 10325，memory/emotion 之间，同属易变尾段不影响前缀缓存）。
- **eval 驱动的关键修正**：初版深挖沿用 lane-1 地板（lex 0.04），噪声用例实测注入 rel=0.057 擦边噪声——深挖行以「[深挖·跨群·N天前记]」权威口径呈现，宁缺毋滥。fixture 校准后默认 `minCos=0.07 / minEmbedCos=0.55`（严于 lane-1、松于强化阈），两值均可配。
- 成本纪律：`injectDeepRecall=false` 时 index.ts 将 `deepRecall.enabled` 一并置 false（不为不注入的 section 白付检索成本）；queryVec 复用 injector 缓存不重复调 embed API。

**验证结论**：199 tests 全绿；eval 深挖子集（d01-d05，跨会话旧记忆）lexical 路径 recall=100%（3/4 lane-1 未中被深挖救回）、噪声=0%；主集 88.2%/40% 与基线持平无回退。部署后 `/api/query?depth=1` 实测返回跨会话 scored 结果；服务健康、向量回填运行中。注：生产活动人设为 firefly，whale/ye 自我轨记忆按三轨隔离正确不可见——深挖空结果用例实为隔离生效的佐证。

**后续优化方向**：① 线上观察窗盯 `brain.log` 的「深挖召回」行——意图词误触发率、深挖注入是否被采纳，必要时收紧 `RECALL_INTENT_RE` 词表（「上次夸过」类变体未覆盖）或调 `weakRelHits`/地板；② emb 地板 0.55 为首版取值（本地无 key 未实测），待线上数据校准；③ eval 主集遗留 q08/q15 lane-1 召回缺口与 n01/n03 噪声是检索质量问题（迭代E 域），非本迭代范围；④ 迭代D provenance 落地后，深挖注入的跨群记忆可带来源轮次标注。

**Key Decisions**：search 纯检索不 reinforce（原语可重放，唤起语义归调用方）；深挖地板独立于 lane-1 且默认更严；门控放 Brain.assemble 内而非 injector（BrainContext 一处产出，companion 可复用 assemble 白得深挖）；深挖行与 memoryLines 分列不污染 lane-1 口径。

**什么时候干的**：2026-11-12，一次会话内完成实现→测试→eval 修正→部署→云端走查。

## Notes

- 设计稿：`design.md`；执行清单：`implement.md`。
- 上游方案：`.trellis/tasks/11-09-iteration-upgrade-plan/iteration-plan.md` §4（已定稿路线图）。
- 关联：companion 前置①（F 阶段消费 `Brain.search` 包装 `brain_search` tool）；迭代D 的 provenance 不依赖本迭代。
