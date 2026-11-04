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

## 线上数据验证（2026-11-04，ubuntu@124.222.65.169 只读）

快照 `~/brain-data/brain.snapshot.json`：**189 条 = 128 episodic + 46 semantic + 15 attitude**，向量覆盖 189/189，巩固自 10-31 起已跑 10+ 次（与本地「semantic 空转」相反——线上三层都活了）。

**但边界在真实数据里依然不存在，且比预想更糟：**

1. **attitude 错标率 13/15**：现存态度绝大多数是用户事实/事件——「确诊急性咽炎用药」「王者主玩对抗路」「答应明天交作品」，均未写 `对X：` 格式。仅 2 条合规（对花咲蝶舞的吐槽立场）。
2. **semantic 里混着立场**：「不粉馆长嫌他吼」「对荤梗装傻转移」「对『由不得你』回怼」——按设计这些才是 attitude。kind 标签在两条生产线上都打偏了，方向相反。
3. **同一事实跨 kind 重复**：「不粉馆长」同文共存 4 条（1 episodic hits=203 + 3 semantic，其中 2 条逐字相同）。原因：① `markAbsorbed`（退池打戳）今天 15:45 才随 `567529f` 部署，历史 500 个 sourceIds 的源条全部仍在检索池（`absorbed=0`）；② `consolidate()` 入库路径**不判重**（不走 `findNearDup`），多次巩固产出逐字重复的 semantic；③ 11-03 purge 删过一批源条 → 14 个 sourceId 悬空。
4. **态度层今日起整体不可见**：15 条 attitude 全部无 personaId → 归 `whale-gentle` 轨；devotion 于 ~16:08 被激活（jsonl 里 `persona-activate` op）→ `attitudeVisible` 全滤掉 → 【当前立场】段自此为空（分轨按设计工作，「可攻略玩法不被旧人设剧透」的代价是旧轨态度全灭）。
5. **历史遗留**：旧 semantic 的源 episodic 不会被追认退池——`markAbsorbed` 只打当次巩固喂入的源，存量 486 条 live 引用需一次性迁移/清扫才能退池，否则重复永远存在。

### 修正后的结论

三层差异在**代码机制上真实存在**（注入分区、保底唤起、跨群通道、分轨、退池），但在**这份数据上**用户感觉没区别是对的：kind 标签被两条 LLM 流水线按各自的理解乱打（蒸馏把事实标成 attitude、巩固把立场写成 semantic）、同一事实多 kind 重复共存、且态度轨刚整体下线。差异存在于机制，不存在于内容。

### 可选优化方向（未实施）

- 蒸馏端 attitude `对X：` 格式硬校验，不合格降级回 episodic（可治 13/15 错标）
- `consolidate()` 入库走 `findNearDup` 判重（可治逐字重复 semantic）
- 一次性迁移：把所有现存 sourceIds 指向的 episodic 补打 `absorbedAt`（或跑 `sweepNearDups` 合并跨 kind 同文）
- 语义巩固 prompt 明示「立场/看法写 attitude 或不写」，减少把 stance 固化成 semantic

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
