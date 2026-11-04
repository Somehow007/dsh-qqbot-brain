# 记忆三类边界加固：追溯退池 + attitude 格式校验 + 巩固判重

## Goal

补上 11-04 线上数据走查发现的三个机制缺口，让 episodic/semantic/attitude 的 kind 边界在生产端真实成立（机制已有但防不住 LLM 乱打标、也不追溯存量）。

## 背景（已完成的存量标齐 · 2026-11-04）

线上 189 条取证（ubuntu@124.222.65.169）：attitude 13/15 错标为用户事实、semantic 混入立场文案、同一事实跨 kind 重复（「不粉馆长」同文 4 条）、`absorbed=0`（markAbsorbed 当日 15:45 才随 567529f 部署）。

已用现有机制标齐：

- `PATCH /api/notes/<id>`：13 条错标 attitude → `episodic`（副作用收益：这些用户事实脱离 whale-gentle 态度轨，对 devotion 恢复可见）
- `POST /api/dedup`：13 簇并 17 条 → `stats.nearDup` 归零
- 结果：189 → 172 条 = 133 episodic / 37 semantic / 2 attitude（均为合规 `对X：` 立场）

## Requirements（三个缺口）

- [ ] **R1 追溯退池**：现存 ~486 个 live sourceId 指向的 episodic 仍在检索池。`markAbsorbed` 只打当次巩固的源，历史巩固（10-31~11-03 共 10+ 次、38 条带 sourceIds 的 semantic）的源条永不退池 → 源与摘要在检索池永久重复。需要一次性机制：`Brain.absorbCovered()`（扫描全部 semantic.sourceIds，对存活且未吸收的源打戳）+ 触发入口（`/api/dedup` 顺带、独立端点、或启动时幂等执行均可，需可审计）。
- [ ] **R2 蒸馏 attitude 格式硬校验**：`endOfTurn` 入库前校验 `kind='attitude'` 且 content 不匹配 `^对.{1,24}[：:]` → 降级为 `episodic`（或要求蒸馏修正）。错标率实测 13/15，不堵源头标齐会再脏。
- [ ] **R3 巩固入库判重**：`consolidate()` 的 `addNote` 路径不走 `findNearDup` → 多轮巩固产出逐字重复 semantic（实测「不粉馆长」逐字 ×2 + 近义 ×1）。入库前对 result.memories 走同款 embedding 判重，cos≥`dedupeEmbedCos` 转 `reinforce` 而非新增。
- [ ] （可选 R4）巩固 prompt 补一句「对人/事/话题的立场看法不要写成 semantic 事实」，减少 stance 固化进 semantic（本次线上 semantic 里「不粉馆长」「对由不得你回怼」等）。

## Acceptance Criteria

- [ ] `POST` 触发或启动幂等执行后，所有被 semantic.sourceIds 覆盖的存活 episodic 带 `absorbedAt`；检索池不再同时返回源条与摘要
- [ ] 蒸馏产出不合规 attitude 时 kind 落库为 `episodic` 并有日志
- [ ] 巩固产出与库内 cos≥0.9 的条目不再新增，转为强化旧条
- [ ] `npm test` + typecheck 通过；新增用例覆盖三条路径

## Notes

- 相关档案：`11-04-memory-kinds-explained`（走查取证全文）、`11-02-brain-dedup-sweep`（dedup/mergeNotes 设施）、`567529f`（markAbsorbed + 同对象归并，当日已部署）
- 数据安全：R1 只加 `absorbedAt` 戳不删数据，op 流水可审计可重放
