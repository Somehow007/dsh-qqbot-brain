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

- [ ] `Brain.search` 单测：track/scope/absorbed 过滤与 assemble 同口径；kinds/crossSession/limit 选项正确；minCos/minEmbedCos 覆盖生效；lex/emb 双路径
- [ ] 深挖门控单测：意图词命中/不命中边界；意图∧弱命中→追加；意图∧强命中→不追加；enabled=false→不追加；去重不重复注入 lane-1 条目；crossSession 受私域/三轨过滤
- [ ] eval recall-intent 子集：深挖相对 lane-1 有可测 recall 提升；expectNone（含意图词的噪声用例）不误中
- [ ] `npm run typecheck` + `npm test` + `npm run build` + `npm run eval` 全绿
- [ ] 部署后云端走查：真实「你还记得…」类提问观察 brain.log/注入段出现 `[深挖]` 行；`/api/query?depth=1` 可用
- [ ] spec/backend/index.md 同步新约定；CHANGES.md 追加；task 归档含 Resolution

## Notes

- 设计稿：`design.md`；执行清单：`implement.md`。
- 上游方案：`.trellis/tasks/11-09-iteration-upgrade-plan/iteration-plan.md` §4（已定稿路线图）。
- 关联：companion 前置①（F 阶段消费 `Brain.search` 包装 `brain_search` tool）；迭代D 的 provenance 不依赖本迭代。
