# 情景/语义/态度三类记忆的区别与生效方式

## Goal

纯讨论存档（无代码改动）：用户问「当前存的情景、语义、态度具体有什么不同？为什么总感觉没区别？各自怎么生效？」——基于源码与 `~/brain-data` 实际数据给出解答。

## 讨论结论（2026-11-04）

### 设计分工（`src/brain/types.ts` 头注释）

| kind | 语义 | 生产者 |
|---|---|---|
| `episodic` 情景 | 「发生过什么」——一句话事实/事件 | 轮末蒸馏 LLM，默认类型（省略 kind 即 episodic） |
| `semantic` 语义 | 「什么长期成立」——稳定事实/偏好/关系结论 | **仅后台巩固 `Brain.consolidate()` 产**，蒸馏不产 |
| `attitude` 态度 | 「角色怎么想」——对人/事/话题的立场 | 蒸馏 LLM 判定角色形成/更新看法时打 `kind=attitude`，要求 `对<对象>：<立场>` 格式 |

semantic 生产路径独立：定时器（`src/index.ts` consolidation tick）发现某会话有 ≥`consolidateMinNotes`(4) 条、age≥`consolidateMinAgeDays`(1) 天、未被吸收的 episodic 时，巩固 LLM 压缩成 ≤5 条语义记忆，源 episodic 打 `absorbedAt` 退池。

### 生效方式（检索 → 注入）

- **检索同池同公式**：`score = alpha·rel·(1+beta·R) + gamma·imp/5`，kind 不进公式，衰减/强化规则一致（`retrieval.ts`）。
- **命中后分流**（`Brain.assemble`）：
  - attitude → `attitudeLines` → 【当前立场】section（order 10310），无时间/actor 前缀
  - episodic + semantic → `memoryLines` → 【记忆库摘录】section（order 10320），`[x天前记] [actor]` 前缀
- **attitude 三条特权**：
  1. 保底唤起：发言人昵称出现在态度文本里即补入立场区（上限 3 条），不占 topK
  2. 跨群召回：attitude/semantic 可跨会话召回 ≤2 条标 `[跨群]`；episodic 不跨群
  3. 人设分轨（`attitudeVisible` 按 personaId 过滤）+ `对X：` 格式同对象归并
- **判重隔离**：attitude 与事实类互不 merge/判重（endOfTurn mergeIndex 过滤、`findNearDup`、`sweepNearDups` 三处）。

### 为什么观感没区别——四个真实原因

1. **库里 0 条 semantic**：`~/brain-data` 快照 12 条 = 10 episodic + 2 attitude。巩固门槛（≥4 条且 ≥1 天的未吸收 episodic）新库达不到，这层空转。
2. **现存 2 条 attitude 是错标的事件**（"demo问玩没玩过消逝的光芒"、"梦鸡的泪巴谐音梗"），均未写 `对X：` 格式——蒸馏模型把 attitude 当「值得记的互动」用了。副作用：`findAttitudeSameObject` 只认 `^对(.{1,24}?)：` 开头，格式不对则同对象归并不生效，立场区会越攒越杂。
3. **检索评分对 kind 无感**：同池同公式同衰减，kind 只决定命中后放哪个 section。
4. **注入形态几乎一样**：【当前立场】与【记忆库摘录】相邻，行格式仅差时间前缀。

### 结论

意图是「事件流水 / 沉淀常识 / 角色立场」三层；现实是 semantic 空转、attitude 被当 episodic 用、episodic 与 semantic 注入无差别。要让差异真实生效，杠杆在**生产端**（蒸馏 prompt 的 attitude 判定 + 巩固触发率），不在检索端。

### 可选优化方向（未实施）

- 蒸馏端对 attitude 做 `对X：` 格式硬校验，不合格降级回 episodic
- semantic 注入给不同前缀（如 `[常识]`）或更高保留率/不衰减
- 检查线上 consolidation 定时器是否实际在跑（`consolidation.enabled` + 数据是否达门槛）

## Key Files

- `dsh-qqbot-brain/src/brain/types.ts` — MemoryNote.kind 三枚举与分层注释
- `dsh-qqbot-brain/src/brain/index.ts` — assemble() 分流/保底/跨群、consolidate()、findAttitudeSameObject
- `dsh-qqbot-brain/src/brain/retrieval.ts` — 统一评分公式（kind 无感）
- `dsh-qqbot-brain/src/brain/distill.ts` — 蒸馏/巩固 prompt（attitude 判定仅一小段）
- `dsh-qqbot-brain/src/inject/prompt.ts` — 【当前立场】/【记忆库摘录】两个 section

## Acceptance Criteria

- [x] 解答已交付；纯讨论留痕，无代码改动

## Resolution（2026-11-04）

- **遇到了什么问题**：用户感觉存储中的情景/语义/态度三类记忆没有区别，不清楚各自如何生效。
- **怎么解决的**：通读 `types.ts`/`index.ts`/`retrieval.ts`/`distill.ts`/`inject/prompt.ts` 并对照 `~/brain-data` 实际快照，确认三层在检索评分上同构（kind 不进公式），差异集中在生产端（蒸馏默认 episodic、仅巩固产 semantic、蒸馏打标产 attitude）与注入端（attitude 独立【当前立场】区 + 保底/跨群/分轨特权）。观感无差别的根因：semantic 空转（0 条）、现存 attitude 实为错标事件、注入形态几乎相同。
- **后续优化方向**：蒸馏端 `对X：` 格式硬校验防 attitude 错标；检查线上 consolidation 触发率；如需拉开 episodic/semantic 注入观感差异可给 semantic 换前缀。
- **什么时候干的**：2026-11-04，纯讨论无代码改动，无 PR。
