# 记忆强度通胀：校准集与调参方案

## Goal

检索唤起强化机制存在结构性通胀：无冷却、不按 importance 缩放、hits>0 即永不物理遗忘。琐事笔记 hits 刷到 200+、strength 顶格 10，持续挤占 topK=6 的注入位。本任务沉淀基线数据与离线校准/调参设计；参数实调延后到校准证据就绪。

## 问题与证据

- 群聊 fixture（test/eval/cases.json 存量用例）里琐事已顶格：「赛博大肉棒荤段」hits 202、「由不得你」hits 196、「李信纠正」hits 45，strength 全 10。
- 恋人线 live 走查（11-07 review）：50 条里约 20 条 strength≥9.5，「已回到宿舍」「到楼下了」与初夜同级；语义位被一次性事件占满。
- 后果：`score = alpha·rel·(1+0.5·R) + 0.2·imp/5` 中 R≈1 的琐事拿满 1.5× 相关分 boost，且 rel 门槛 lex 0.04 极低——高热度低价值条目稳定挤掉低频实质记忆。

## 机制分析（为什么会必然通胀）

`assemble()` 每轮：topK(6) 内所有 `rel ≥ reinforceMinCos`(lex 0.15 / emb 0.62) 的命中一律 `strength += reinforceStep(1)` 并刷 `lastAccessAt`——

1. **无单轮/窗口去重**：同一话题连聊 10 轮，同一条琐事就顶格 strengthCap=10；群聊里 hits 200+ 即此路径。
2. **衰减时钟每次命中归零**：lastAccessAt 刷新 → R=e^(-t/S)≈1 → 拿满 boost → 更稳进 topK → 正反馈自锁。
3. **不按 importance 缩放**：imp 2 的流水账与 imp 5 的关系承诺同速强化、同顶同帽。
4. **hits>0 永不物理遗忘**：evictAfterDays=30 的谓词要求 hits=0，被强化过一次的条目只进不出。
5. **emb 路径同理**：reinforceMinEmbedCos=0.62 卡的是"清晰相关带下沿"，命中即 +1，无差别。

## Key Decisions

### D1 备份当前数据 —— 需要，已落地（2026-11-07）

- API export → 本地 `brain-data/brain-export-private-2026-11-07-postcleanup.json`（255 notes / 3 personas / 7 profiles / 3 digests，gitignored）。
- 服务器 `~/backups/brain-export-20261107-postcleanup.json` + `~/brain-data.bak-1107-postcleanup`（对齐既有 `.bak-*` 目录惯例）。
- **新约定**：凡检索/衰减/强化参数调整，部署前必先导出快照——回滚单元 = import replace + revert config。

### D2 校准数据 —— 需要，框架已有，缺三块

已有基建：`test/eval/run.ts` + `cases.json`——fixture notes 灌入临时 BrainStore，逐 case 跑 `assemble()`，度量 recall@topK 与 expectNone 噪声 FP 率，lex/emb 双路对比（`BRAIN_EMBED_API_KEY` 有值即跑 emb）。

缺口与补法：

1. **fixture 过时**（10-31 数据）→ 写 `test/eval/build-fixture.ts`：`/api/export` 快照 → `MemoryNote[]` 直出 cases.json 的 notes 段；`NOW` 由硬编码改为读 fixture 的 `exportedAt`。
2. **用例类型不覆盖通胀**：
   - 现有 `expect`（应命中）/`expectNone`（无关不命中）之外，加 **`expectAbsent: string[]`**——query 同时沾边琐事与实质记忆时，断言实质在 hits、琐事不在 hits（排序断言）。
   - 加 **replay 场景**：`{replay: N}` 对同一 query 连续 assemble N 轮，断言琐事强度增量有界、且小于实质记忆增量（直接验证通胀修复）。
3. **无参数扫描** → `runEval(cfgPatch)` 接受 BrainConfig 覆写（CLI `--cfg '{"reinforceMinCos":0.2}'`），网格跑基线对照。

### D3 调参方向（按 风险×收益 排序，均需校准集先验证）

| # | 方案 | 机制 | 改动面 | 风险 |
|---|------|------|--------|------|
| 1 | **reinforce 冷却** | `now - lastAccessAt < cooldownMs` 则跳过——零新增状态字段，复用现有时间戳；同话题连聊时每条每窗口最多 +1 | assemble 强化分支 | 低；窗口建议 6–12h，待扫参 |
| 2 | **step/cap 按 importance 缩放** | `step_eff = step×(imp/5)`、`cap_eff = cap×(0.4+0.6×imp/5)`：imp2 琐事 ~25 次才顶 6.4 格，imp5 实质 10 次顶满 | reinforce 调用点 | 中低；importance 是写入期 LLM 判断，标低会连带压速 |
| 3 | **evict 谓词修正** | `R<forgetThreshold && age≥evictAfterDays && (hits==0 || imp≤2)`——顶格琐事到期可淘汰（或走 absorb 存档而非物理删） | snapshot evict 分支 | 中；误删风险靠校准回归挡 |
| 4 | **reinforceMinCos 上调** | lex 0.15 → 0.2–0.25 | config 一行 | 高；可能压死正当召回，必须先在校准集上看 rel 分布再定 |
| 5 | score 端不动 | `1+0.5·R` boost 上限 1.5× 已有界；备选是给 imp<3 的 topK 命中降权 | retrieval.ts | 中 |

约束：全部改动保持通用规则（同 11-07 走查口径），不做任何会话/内容特判。

## 执行计划（后续会话）

- **P1 基建**：build-fixture.ts + cases schema 扩展（expectAbsent/replay）+ NOW 参数化 + cfg 覆写扫描。产出可重复校准流水线。
- **P2 校准集**：以 11-07 快照重建 fixture，人工标 20–30 用例（恋人线 + 群聊线 + 跨会话），其中 ≥5 排序用例、≥2 强化回归场景。基线指标存档。
- **P3 实施 D3-1/2**（冷却 + importance 缩放）：校准集网格扫参 → 选定 → 改 `DEFAULT_BRAIN_CONFIG` → 部署观察。
- **P4 实施 D3-3** evict 修正；一周后复查 hits/strength 分布。

## Acceptance Criteria

- [x] 基线快照已落两地（本地 brain-data/ + 服务器 backups/ + brain-data.bak 目录）
- [x] 校准与调参方案成文（本文件）
- [ ] P1 校准流水线可用：`npm run eval` 支持 fixture 重建、expectAbsent、replay、cfg 覆写
- [ ] P2 校准集 ≥20 用例入库，基线指标存档
- [ ] 任何参数改动附校准集前后对比；recall 不降、expectAbsent 全过、琐事强度增速 < 实质记忆

## Resolution（2026-11-07）

- **遇到了什么问题**：检索唤起强化通胀——琐事 hits 200+/strength 顶格，挤占 topK；恋人线走查与群聊 fixture 双侧证据吻合。
- **怎么解决的**：本期不动参数（无离线校准证据，怕回归）。完成：①机制归因（无冷却+无 importance 缩放+时钟归零正反馈+hits>0 永生）；②基线数据双备份（本地+服务器）；③复用 test/eval 框架的校准流水线设计；④五个调参方向按风险排序。
- **后续优化方向**：P1–P4 执行计划见上；触发条件=下次动 retrieval/reinforce/decay 参数前先做 P1+P2。
- **什么时候干的**：2026-11-07，随恋人线走查修复（commit 369b6bc）同日归档；服务器代码已部署（dsh-qqbot.service 15:13 重启，新 prompt 规则与 DELETE /api/digests 生效）。
- **验证结论**：部署后 /api/state 200、数据 255 条完好、新路由在线；本任务仅设计，无代码改动可验证。
