# Design：记忆三类边界加固

> 评审结论：可行且正面。全部用已有 op 类型与设施（markAbsorbed/findNearDup/mergeNotes/reviewProfiles），无新 op、无存储格式变更、无 API 破坏。

## 行为差距（smallest behavior gap）

- 现状：历史巩固写了 sourceIds 但源条未退池（markAbsorbed 2026-11-04 才部署）→ 源与摘要在检索池永久重复；蒸馏/巩固两条 LLM 流水线的 kind 打标无校验 → 畸形条目入库后再无法被机制区分。
- 目标：被覆盖源条退池存档；不合规 kind 在入库边界被纠正；巩固不再产重复/串类条目。

## 改动点（行为实际所在处）

### R1 追溯退池 — `brain/index.ts` + `brain/index.ts` 装配 + `server/http.ts`

- `Brain.absorbCovered()`：扫 `allNotes()` 中 `kind='semantic'` 的 `sourceIds` 并集 → 对存活且 `!absorbedAt` 的源 `store.markAbsorbed(ids, now)`，返回打戳条数。幂等。
- 触发：插件 init 时调用一次（自愈「写了 sourceIds 没打戳」的任何残留态）+ `POST /brain/api/absorb-covered`（手动重跑，返回 `{ok, absorbed}`）。
- **退池一致性同修（评审发现，不修会留洞）**：
  - `sweepNearDups()` 候选加 `!n.absorbedAt`——否则已退池源可能与活摘要成簇且 keep 选中退池条，活摘要被并进存档静默丢失。
  - `consolidate()` 的 eps 过滤与 `sessionsNeedingConsolidation()` 的 eligible 统计加 `!n.absorbedAt`——防御性（正常路径源必带戳，但脏数据不该再进候选）。
  - `graph()` notes 输出加 `absorbed: !!n.absorbedAt`——退池可观测性（本次验收就靠它）。
- graphVersion：absorb 不改边集结构，不进 bump 列表（与现状一致）。

### R2 attitude 格式硬校验 — `brain/index.ts` + `types.ts`

- `types.ts` 导出 `ATTITUDE_OBJECT_RE = /^对(.{1,24}?)[：:]/`（现 `findAttitudeSameObject` 内联正则上提共享）。
- `endOfTurn()` 记忆入库循环：`m.kind === 'attitude' && !ATTITUDE_OBJECT_RE.test(m.content)` → `kind='episodic'` + `log('态度格式不符降级')`。**不自动补「对」前缀**——`X：确诊咽炎` 补前缀会伪造立场。
- 降级后走原有事实路径：mergeIndex 跨类护栏（`cand.kind==='attitude') !== (m.kind==='attitude')`）天然阻止错并到旧态度；`findNearDup`/`findAttitudeSameObject` 均不受影响。
- 手动入口（`/api/notes` POST/PATCH 改 kind）**不校验**——用户显式选择，且脑图 kind 编辑器是已交付功能。

### R3 巩固入库判重 — `brain/index.ts`

- `consolidate()`：对 `result.memories` 先批量 `embedder.embed(contents)`（未启用→null→跳过判重，与写路径一致）→ 逐条 `findNearDup(vec, m.kind ?? 'semantic')` → 命中：`reinforce(dup)` + `updateNote(dup.id, {sourceIds: 并集})`（巩固来源指针并入旧条，不丢「沉淀自」谱系）→ 不新增。
- **无论命中与否，当批源仍 `markAbsorbed`**：覆盖关系由「本批喂入」事实成立，与产出是否重复无关。
- 原 `void this.embedNotes(added)` 改为 upfront 向量直接 `setEmbedding`，避免二次调用。

### R4 巩固可产 attitude — `brain/distill.ts` + `brain/index.ts`

- `CONSOLIDATE_PROMPT` 补一条规则：若某条内容是角色对人/事/话题的**立场看法**（非客观事实），写 `"kind":"attitude"` 且 content 必须 `对<对象>：<立场>`；解析层 `parseDistillOutput` 已认 kind 字段，零改动。
- `consolidate()` 入库：`kind` 从硬编码 `'semantic'` 改为 `m.kind === 'attitude' && ATTITUDE_OBJECT_RE.test(content) ? 'attitude' : 'semantic'`（不走格式→语义，同一护栏逻辑）。
- `personaId`：attitude 项取**源条众数人设** `mode(eps.map(notePersonaId))`——立场归属形成它的那个人设轨（whale-gentle 期源巩固出的态度不该记到 devotion 头上）；semantic 项仍记 activePid（provenance，不参与可见性）。
- spec 注「attitude 不进语义巩固输入」是输入侧约束（eps 过滤已保证 kind==='episodic' 喂入），本项是输出侧，不冲突。

## 不做的事（scope fence）

- 不动检索评分/衰减公式；不动蒸馏 prompt 主文案；不处理画像审核链路。
- 不给存量 semantic 里的立场文案改 kind（「不粉馆长」作为事实陈述留在 semantic 无害；devotion 的立场由新数据重新形成）。
- 不做 page.html 的 absorbed 可视化（只暴露字段）。
- 不改 `attitudeVisible` 分轨语义。

## 测试计划（`test/brain.test.ts` 追加）

- R2：注入 fetch 返回 kind=attitude 畸形 content → `endOfTurn` 后库内为 episodic；合规 `对X：` → attitude。同法测 mergeIndex 指向旧态度的畸形项不错并。
- R1：造 semantic（带 sourceIds）+ 源 episodic → `absorbCovered()` 后源带 absorbedAt、`assemble` 不再返回、`sweepNearDups` 不触碰、重复调用幂等。
- R3：巩固产出与库内既有 semantic cos≥0.9 → 不新增、旧条 hits+1、sourceIds 并入、源仍被吸收。
- R4：巩固输出含合规 kind=attitude → 落 attitude 且 personaId=源众数；畸形 → semantic。
- 跑 `node --test test/brain.test.ts` + `npx tsc -p tsconfig.json`。

## 部署与验证

`npm run build` → `rsync -av dist ubuntu@124.222.65.169:/home/ubuntu/dsh-qqbot-brain/` → `sudo systemctl restart dsh-qqbot` → 看 brain.log 启动行 + 「追溯退池 N 条」→ `/api/state` 验 absorbed 计数与 nearDup=0 保持。

## 影响评估

- **检索池**：~486 条被覆盖源退出 topK 候选 → 注入【记忆库摘录】变短、以摘要为主（预期变化，非退化）；保底/跨群/分轨通道不变。
- **源条**：hits/R 冻结、不再参与检索与巩固候选，仍存档、export 包含、脑图 derived 边保留；`regenerateProfile` 仍能以它们为证据（archive 价值）。
- **可逆性**：absorbedAt 仅为时间戳字段，数据手术可清；op 流水逐条可审计。
- **风险**：若某条 semantic 摘要质量差，其源退池后细节只能从 archive 查——这是巩固机制的既定取舍，不在本次扩大。
