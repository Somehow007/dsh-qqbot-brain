# 迭代C 执行清单

## Phase 1 · 内核原语

- [x] `src/brain/types.ts`：`RECALL_INTENT_RE`、`DeepRecallConfig`、`BrainConfig.deepRecall`、`DEFAULT_BRAIN_CONFIG.deepRecall`、`BrainContext.deepRecallLines`、`BrainSearchOptions` 类型
- [x] `src/brain/retrieval.ts`：`query` opts 增 `limit/minCos/minEmbedCos`
- [x] `src/brain/index.ts`：`Brain.search()`（可见池同 assemble 口径 + 两种 indexKey 形态 + 纯检索）；构造器 deepRecall 深合并

## Phase 2 · 门控与注入

- [x] `src/brain/index.ts` assemble：收集已注入 id 集（scored+attitude extras+xpool）→ `maybeDeepRecall`（意图∧弱命中双门 → search 深挖 → 去重 → picked reinforce → deepRecallLines）
- [x] `src/config.ts`：`RetrievalConfig.deepRecall?`、`BrainPluginConfig.injectDeepRecall`、DEFAULT_CONFIG
- [x] `src/index.ts`：装配 `deepRecall`（含 injectDeepRecall=false 时整路关闭的成本纪律）
- [x] `src/inject/prompt.ts`：`brain:deeprecall` section（order 10325）+ debug log
- [x] `src/server/http.ts`：`/api/query?depth=1` 深挖参数透传

## Phase 3 · 测试与评测

- [x] `test/brain.test.ts`：search 口径矩阵 / 门控四态 / 去重 / 隔离 / RECALL_INTENT_RE 边界（+9 用例）
- [x] `test/eval/cases.json` + `run.ts`：deepCases 子集（d01-d05）+ lane 归属统计 + expectNone 扩展
- [x] 本地验证：`npm run typecheck && npm test && npm run build && npm run eval` 全绿（199 tests；eval 深挖 recall=100%/noiseFP=0%，主集 88.2%/40% 与基线持平）
- [x] eval 驱动修正：深挖地板默认严于 lane-1（minCos 0.07 / minEmbedCos 0.55），d04 噪声用例归零

## Phase 4 · 上线与归档

- [ ] 云端走查（部署后）：`/api/query?depth=1` 实测、真实「你还记得…」观察 `[深挖]` 注入、brain.log debug
- [ ] spec/backend/index.md 同步约定；MAP.md/README.md 按保鲜约定评估
- [ ] CHANGES.md 追加；prd.md 补 Resolution；`task.py archive --skip-branch-validation`（main 直做）；`add_session.py` journal

## 回滚点

- 代码：`git revert` + 重部署旧 dist；配置：`cordis.patch.yml` 关 `injectDeepRecall`/`deepRecall.enabled`（零数据迁移，纯读路径新增——无 schema/op 变更，回滚零成本）
