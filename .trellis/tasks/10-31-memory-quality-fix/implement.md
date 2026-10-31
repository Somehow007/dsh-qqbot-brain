# 实施记录：记忆质量修复

## 已落地（对照 design.md）

### D1 检索评分纠偏 — `retrieval.ts` `types.ts`

- 评分改为 `score = α·rel·(1 + β·R) + γ·imp/5`，默认 `α=1.0 β=0.5 γ=0.2`；rel 是硬门槛（lex 走 `minCosine=0.04`、emb 走 `embedMinCos=0.25`）
- `Retriever.query` 返回 `ScoredNote{note,rel,score}`；新增 `reinforceMinCos=0.15`，只有真相关命中才 `store.reinforce`
- 发言人保底 attitude：改走独立数组进 `attitudeLines`，不进 hits、不 reinforce——hits 虚高/R 锁死链断掉
- 跨会话召回：发言人 openid/nick 匹配的其他会话 `attitude|semantic` 条目独立池查询，≤2 条以 `[跨群·N天前]` 前缀入 `memoryLines`；episodic 不外溢

### D2 蒸馏 prompt v2 — `distill.ts`

- memories 白名单四类（用户事实/稳定偏好/承诺约定/关系变化）+ 黑名单（一次性拌嘴、角色俏皮话、寒暄）+「拿不准就不记」
- importance 锚点（5=承诺/重要个人信息…1=琐碎不值得记）；统一第三人称陈述
- JSON schema 未变，`parseDistillOutput` 零改动

### D3 Embedding — 新 `embed.ts` + 全链路

- `Embedder`：OpenAI 兼容 `POST /embeddings`，无 key → enabled=false → 全链路回退 lexical
- 写路径：`endOfTurn` 落库后对新/改记忆批量取向量 → op `'embed'` 持久化；页编辑 addNote/updateNote 同步补；consolidate 产出也补
- 读路径：`PromptInjector` assemble 前取 queryVec（失败静默回退）；带向量的条目用 embCos
- 启动回填：30s tick、每批 5 条、补完自清定时器
- env：`BRAIN_EMBED_API_KEY`/`BRAIN_EMBED_BASE_URL`/`BRAIN_EMBED_MODEL`（默认 SiliconFlow bge-m3）

### D4 身份层

- `store.mergedUserProfile({openid,nick})`：openid 精确 + name 完全相同的 u: 条目读侧归并（≤400字），assemble 注入 `mergedUserProfile` 替代单键 `profileOf`
- demo/花咲蝶舞 双 openid 画像在注入时合一；写侧不动、无数据迁移

### D5 会话滚动摘要 — `distill.ts` digest + `brain/index.ts` + `inject/prompt.ts`

- `historyBuffer`（每会话 cap 60 轮）+ `turnCounter`（重启从 digest.uptoTurn 续算）
- 满 `digestEveryTurns`（默认 15）→ `distiller.digest(最近≤40轮, 旧摘要, persona)` → op `'digest'` 持久化
- 注入新 section `【会话脉络】` order 81；`injectDigest` 开关；`/api/state` 含 digest

### D6 评测集 — `test/eval/`

- `cases.json`：线上 44 条真实记忆 + 22 个标注用例（17 应命中 + 5 不应命中）
- `npm run eval`：recall@topK + 噪声误报率；`BRAIN_EMBED_API_KEY` 存在时自动加跑 embedding 路径对比

## 评测结果（2026-10-31，44 条线上真实记忆 + 22 用例）

| 路径 | recall | 噪声FP |
|---|---|---|
| lexical | 88.2%（15/17） | 40%（2/5） |
| embedding（百炼 v3）+lex 兜底 | **100%（17/17）** | **20%（1/5）** |

百炼 text-embedding-v3 实测：批上限 10 条/请求（embed 已自动分块）；余弦分布压缩——相关带 0.48~0.84、噪声底 0.33~0.56，校准 `embedMinCos=0.47`、新增 `reinforceMinEmbedCos=0.5`（emb/lex 分开判强化，防噪声命中刷 hits）。n02「微积分作业」与「满课早八」记忆语义相邻，可接受的边界漏网。

- FAIL q08「他老叫你什么外号」→ 期望「傻福」：复述型语义鸿沟，lexical 天花板
- FAIL q15「我上次夸过你什么」→ 期望「嘴甜哥」：同上
- FAIL n01/n03：单 unigram（子/什么）弱匹配漏过 0.04 门槛——embedding 的主要收益点

## 验证

- `npm run typecheck` / `npm test`（59 全过）/ `npm run build` / `npm run eval` 全绿
- 更新测试：保底态度不再计入强化（断言 hits=0）；新增 9 个覆盖新行为

## 待办（部署侧）

- 服务器更新 dist 并重启 `dsh-qqbot`；回填定时器自动补旧记忆向量
- 提供 `BRAIN_EMBED_API_KEY`（写入 `~/.dsh/brain.env`）开启语义检索后跑 `npm run eval` 对比
- 蒸馏 v2 上线后新旧记忆风格混合期，靠衰减自然淘汰；22 条虚高热记忆随评分纠偏自然沉底
