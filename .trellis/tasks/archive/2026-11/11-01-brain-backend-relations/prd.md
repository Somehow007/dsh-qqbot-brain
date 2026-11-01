# 脑图关联后端化评估

> 存档约定：讨论存档——记清「遇到了什么问题 / 怎么解决的 / 什么时候干的」。

## 背景问题

脑图重构后，点击节点展示的关联（记忆↔记忆 / 记忆→情绪 / 记忆→人格）全部在前端推断：

- 记忆↔记忆：字符 bigram 重叠 ≥3 + 同会话 + 同发言人 → 只认字面重合
- 记忆→情绪：`/ops?limit=500` 里找同会话 ±10min 情绪 op → 覆盖窄
- 记忆→人格：`##` 小节与记忆 bigram 重叠 → 字面匹配

用户问：后端是否可做、能否提升效果。

## 后端基础盘点

- `MemoryNote.embedding` 已存在（`embed` op 持久化，snapshot 以 `e` base64 存）；线上百炼 key 已配，「向量 on」。
- `vecCosine` 现成（embed.ts）；`graph()` 组装 `/api/state`，加 `edges` 字段无 schema 改动。
- consolidate() 会从情景记忆产出语义记忆 → 真实「派生」关系存在于管线里但没记录。
- JSONL op 追加 + snapshot 压缩；新增字段 replay 兼容即可。

## 线上数据验证（2026-11-01，ubuntu@124.222.65.169 快照）

脚本 `/tmp/rel-eval.mjs` + `/tmp/rel-eval2.mjs`（服务器直跑，复用 dist 的 Embedder/vecCosine）。

### 记忆↔记忆语义边

- 129/129 条记忆全有向量（百炼 v3）。余弦分布整体偏高：cos≥0.5 有 5620/8256 对。
- **top-k 剪枝可行**：每节点 top-3 且 cos≥0.65 → 去重 288 边，仅 3 个孤立节点；top-3 @0.7 → 237 边 15 孤立。
- 邻域质量抽查：同一话题/同一人的记忆聚成连贯簇（梗图系列、demo↔鲸鱼娘互动、山姆会员店）✓；0.55–0.60 边缘带约半数噪声，**阈值下限建议 0.65**。
- 推荐参数：`topK=3, floor=0.65`，graph() 实时 O(n²) 即可。

### 附带发现：蒸馏判重漏网

- cos≥0.85 的近重复记忆对有 **91 对**——同一事实被蒸馏/巩固重复写入（最重的记了 4+ 遍）。
- 对关联边的影响：节点 top-3 会被自己的复读体占满。**实现时应把 cos≥~0.9 的对排除或单列「近重复」**。
- 判重本身是另一个任务的问题（mergeIndex 没拦住），先记录。

### 记忆→情绪

- **0/129 可匹配**：brain.jsonl 只剩 31 行（最近 compact 过），情绪 op 存活仅 3 条。
- 结论修正：情绪 op 历史**不过 compact**——snapshot 只留各会话最新态。服务端"全量历史"优势不存在；**唯一解是写入时把情绪快照存进 note 字段**（`note.emotion={v,a,d,label}`），存量 129 条无法回填。
- 若想要存量覆盖，只能从 dsh transcript 重放蒸馏情绪，成本高，不建议本期做。

### 记忆→人格 facet

- `##` 拆出 6 个 facet，取向量后与记忆求 max 余弦：≥0.55 覆盖 58/129、≥0.6 覆盖 29/129。
- 抽查匹配合理（"送女仆裙"→身份底色、"日语骂人"→说话风格）✓。建议阈值 **0.55**，facet 向量按 persona id 缓存。
- 人设切换时 facet 内容变 → 边不持久化，graph() 时现算。

### 坑

- snapshot 的 `e` 字段解码要用 `Buffer.readFloatLE`（Buffer.from 的 .buffer 是小对象共享池，直接读会拿错偏移）。

## 实施建议（修订后）

1. `/api/state` 加 `edges`：记忆相似边（top3 @0.65，cos≥0.9 记为 dup 类或不收）+ facet 边（0.55，facet 向量按 persona 缓存）。前端优先用服务端边、ngram 降级。页面照旧标"推断"。
2. `add`/`consolidate` 写入时把当时情绪快照写进 `note.emotion`——唯一能救情绪关联的做法；存量放弃。
3. `sourceIds` 派生边（consolidate episodic→semantic）值得做，独立小改。
4. 蒸馏判重漏网（91 对近重复）另开任务评估。
5. 不做：LLM 关系抽取（支持/矛盾，成本与可靠性不划算）；持久化通用边表（实时算就是最新最优）。

## 状态

- [x] 评估 + 线上验证
- [x] 实施 1+2+3+4（commit `87cdff6`，已部署线上）

## Resolution（2026-11-01）

### 问题

脑图节点关联全部前端推断：bigram 只认字面重合（语义相关连不上）、情绪关联被 ops 流水 compact 清空（0/129 可匹配）、人格关联字面稀疏。

### 怎么解决的

按线上数据校准后实施了全部四项（commit `87cdff6`）：

1. **语义边**（`graphEdges`）：`MemoryNote.embedding` 两两余弦，每节点 top-3 且 ∈[0.65,0.9) 去重封顶 400 条；**≥0.9 判为近重复不连**（与评估结论一致），并顺手把近重复对数计入 `stats.nearDup` 作观测指标。
2. **情绪快照**：`NoteDraft.emotion`/`MemoryNote.emotion`（`NoteEmotion={v,a,d,label}`）新增可选字段；`endOfTurn` 里情绪 apply **前移**到记忆入库前（新记忆钉上本轮最新情绪而非上轮残留），distill/consolidate/手动 addNote 三处写入点统一 `emotionStamp()` 盖章。存量 129 条放弃回填（transcript 重放成本高）。
3. **facet 边**：`personaFacetTexts()`（与前端 `personaFacets` 同款 `##` 拆分、facet id 对齐）取向量，记忆 vs facet max 余弦 ≥0.55 出边；向量按 persona 文本缓存，人设切换自动重算，`/api/state` 轮询零成本。
4. **derived 边**：`MemoryNote.sourceIds`（可选字段）记录巩固时喂入的情景记忆 id——全图唯一「实录非推断」的关系；`sanitizeNote`/`addNote` 透传，replay/导出导入兼容。
5. **写入判重**：`dedupeEmbedCos=0.9`（config 可调）——distill 新草稿先取向量，`findNearDup` 全库扫描，≥0.9 则 `reinforce` 旧记忆 + 记日志而非新增。直接回应评估发现的 91 对近重复漏网。consolidate/手动 add 路径不判重（巩固本来就重写事实，手写是用户本意）。
6. **前端**：`buildRelations(notes, edges)` 以服务端边为骨架、ngram/session/actor 作本地附加理由（同对并边、理由取并集，primary 按 derived>semantic>topic>session>actor）；note.emotion 快照直接进 `emoOf`、服务端 facet 边进 `facetOf`，缺边条目全部回退原推断；检查器理由显示「语义相似 73%」「沉淀为这条语义记忆」；图例更新（新增沉淀巩固实线类）。

### 验证结论

- `npm test` 89/89、typecheck、build ✓；smoke 33 项 ✓（stub 补了 edges/emotion/derived 数据走新路径）
- **线上数据副本实测**：135 条记忆 → 279 语义边（top 样本全是真话题簇：五笑梗图系列/demo↔鲸鱼娘/山姆）+ 60 facet 边（荤段子→边界、嘴硬→风格，合理）+ `nearDup:59` 存量近重复对
- **已部署**（备份 → rsync dist → restart → 验证）：线上 `/api/state` 返回 339 边，隧道截图确认检查器显示「语义相似 73% · 相似话题 · 同一会话」，人格光谱关联计数从近全 0 变为 21/9/13/0/13/38
- emoNotes:0 属预期——快照只对新写入记忆生效；derived:0 同理（下次巩固跑过才出）

### 后续优化方向

- **存量近重复清理**：59 对 ≥0.9 已在库里，写时判重只挡增量。可考虑一次性合并脚本（保留 hits/strength 最大者、文案取较长者）或页面「疑似重复」提示——另开任务评估。
- **存量情绪回填**：若真需要，只能 transcript 重放；暂不值。
- 语义边阈值/top-k 若上线后嫌密/嫌稀，调 `graphEdges` 常量即可（未做成 config，避免配置面膨胀）。
- LLM 关系抽取（支持/矛盾/因果）依旧不做：成本与可靠性不划算。
