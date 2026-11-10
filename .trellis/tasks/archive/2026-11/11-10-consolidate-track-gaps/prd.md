# 人设包走查遗留问题集：巩固轨继承 / modal 单视角 / 导入向量

## 问题存档

- **时间**：2026-11-10
- **来源**：流萤人设包上线后用户要求多角度评估（新会话抖搂/问什么答什么/入戏深度/自我记忆衰减/长期质量），核查注入链路、衰减、巩固、导入代码与腾讯云线上数据后发现。
- **归属判定**：主体是**迭代A（人设三轨地基）遗留**——三轨改造覆盖了 distill/检索/判重路径，但漏了语义巩固产出侧的 self 轨继承与多包并存下的 modal 视角盲区；附带**迭代B（叶瞬光接入）带出的方法层缺口**——import 通道为备份恢复设计，从未考虑人设种子导入后的向量回填。

## 发现清单

### F1【bug·时效】语义巩固产出无 self 轨继承 —— 迭代A 遗留

- `CONSOLIDATE_PROMPT`（`distill.ts:129-135`）输出 schema **没有 self 字段**，解析层 `self` 恒为 undefined。
- 产出轨归属落到 `resolveSelfFlag → isSelfContent` 的「我」字启发式（`types.ts:103`）：LLM 把第一人称种子改写成「流萤与开拓者…」式无「我」表述时 → `self:undefined` → **世界轨 → 全角色可见 → 跨人设串味**。
- 触发时点：种子 `createdAt`=导入时刻，`consolidateMinAgeDays=1` → **导入次日** episodic 满足 `minNotes=4` 即被 `sessionsNeedingConsolidation` 捞起，tick 60min/cooldown 24h 自动执行（`index.ts:131-145`）。生产 distiller 已启用（BRAIN_LLM_API_KEY 在），必然触发。
- 影响面：所有人设包的 episodic 种子，不止 firefly；whale 存量会话 episodic 同样走此路径（其内容多为「我」字第一人称，侥幸自洽，但非保证）。
- 附带损失：巩固产出 `emotion` 用巩固时戳覆盖，种子精心设计的 PAD+ mood 情绪快照随 episodic `absorbedAt` 退出检索池。

### F2【涌现不对称】'manual' 会话 modal 众数 → 单包 episodic 永不巩固

- 叶瞬光 28 + 流萤 28 种子同在 `sessionId='manual'`，`modalPersonaId` 计数 28v28 打平取「较晚出现者」→ firefly（后导入，`index.ts:425-441`）。
- `consolidate('manual')` 的 `viewPid='firefly'` → 喂料过滤 `trackVisible(n,'firefly')` → **只有 firefly 的 10 条 episodic 可见可喂**；叶瞬光的 10 条 episodic 对 firefly viewer 不可见、永不 covered、永不巩固——她的 episodic 种子反而永久保留 vividness。
- 不对称本身对叶瞬光是好事，但机制上是「会话级单视角」的盲区：modal 只产出一个 viewPid，一次巩固只能服务一个角色的自我轨。第三包导入或 manual 区新增手写条目会让众数漂移，归属随之漂。

### F3【方法层缺口】import 不补向量 + backfill 一次性自清 —— 迭代B 带出

- `brain.importData`（`index.ts:1176`）直通 `store.importData`，不触发 `embedNotes`——导入条目无向量。
- 向量回填靠启动时 `setInterval(30s)` 跑 `backfillEmbeddings(5)`，`n===0` 即 `clearInterval` 永久自清（`index.ts:147-154`）——**清盘后导入的条目永远等不到回填，只能等下次重启**。
- 线上实证：firefly 28 种子当前 **0 embedding**（导入于清盘后）；叶瞬光 28 种子有向量（导入时机赶上回填窗口/重启）。
- 后果：检索退化为字符 n-gram（`minCosine 0.04`），改写/同义查询召回偏弱（「你最好的朋友」难召回「对开拓者」种子）；`findNearDup`/巩固判重也因无向量跳过这些条目。
- 附带好消息：巩固产出与蒸馏新记忆都会即时 embed——时间站在巩固这边，但种子期（头几天）的召回质量是实打实的降级。

### F4【模板层小缺口】人设包无 AI 身份条款 —— 两包共有

- persona.md 全沉浸框架，无「被问是否为 AI/真实存在时如实说明」条款；「诚实回答真实能力、知识来源」能兜住能力问题，兜不住身份问题——「你是AI吗」的反应不可控（坦白 or 回避均可能）。
- 修法：两包 persona.md 各补一句，或在 pack 模板约定里固化。

## 已排除的疑似问题（核查结论）

- **抖搂风险**：persona.md 全量注入每轮（`brain:persona` order 80 稳定前缀），但种子只按相关性进 topK=6，不主动倾倒；「不主动解释设定」约束在。可接受。
- **自我记忆彻底丢失**：不会。retention 只影响排序不删除；semantic/attitude 永不巩固；episodic 被巩固是压缩非删除；persona.md 常量层永不衰减。长期看真实对话在 `char:<persona>` 轨累积新 episodic，种子=脚手架，记忆会"活"成角色自己的史——设计达成。
- **问什么答什么**：四层优先判断+尺度+诚实条款兜底，不无脑附和。
- **无活动人设全可见**：`trackVisible` 兼容路径，生产恒有 activeId，非问题。
- **端到端已验证**：线上已有 1 条 firefly 戳的真实蒸馏 episodic（demo 会话 11-10 23:40，`self:false` 正确落世界轨=用户事实，已带向量），firefly 当前即激活人设。

## 后续优化方向

- **F1 修法（推荐）**：巩固产出按源轨继承——本批源全为同 `characterOf` 自我轨时，产出条目强制 `self:true`（或 `personaId+char` 一致性校验兜底）；备选：CONSOLIDATE_PROMPT schema 加 `self` 字段让 LLM 标。改动点：`index.ts consolidate()` 入库段 + `distill.ts` prompt/parse。
- **F2 修法（可选）**：`sessionsNeedingConsolidation`/`consolidate` 支持多 viewPid 分批（按 char 分组各跑一次），或接受现状（单视角=先到先得，余下 episodic 留存反而保生动度）并文档化。
- **F3 修法（推荐）**：`brain.importData` 导入成功后对新增条目 `embedNotes`（有界：单次导入量级）；或把 backfill interval 改为「有缺向量条目时常驻低频」而非一次性自清。成本：每次导入 ≤N 条 embed 调用，一次性。
- **F4 修法**：两包 persona.md 补 AI 身份条款；若后续出第三包，沉淀进 pack 模板。
- **验证计划**：F1/F3 修复部署后，观察 'manual' 会话下一轮巩固产出（拉 export 核对新 semantic 的 self/personaId/embedding）；F3 修复后核对 firefly 种子向量数=28。
- **时效提醒**：F1 明天（种子满 1 天）即在生产触发，修复窗口就是现在——不修则明天起每个有人设包的 'manual' 会话都会走一遍含风险的巩固。

## Key Decisions

- **归为迭代遗留而非新任务**：F1/F2 根因在迭代A 三轨改造的覆盖盲区（distill 已改、consolidate 产出侧漏改）；F3 是迭代B 首次规模化使用 import 通道暴露的方法层缺口。三者同属「人设多角色化」主题，合并存档便于按迭代线索回溯。
- **不改包文件绕过**：F1/F2 是引擎缺陷，种子内容本身无错（第一人称行文是对的），不应为迁就 bug 修改人格资产。

## 验证结论（2026-11-10）

- 代码走查：`trackVisible`/`modalPersonaId`/`consolidate`/`importData`/`backfillEmbeddings` 全链路核对，行号锚点见上。
- 线上数据走查：`/api/export` 两次快照——导入前 315 条（manual=叶瞬光 28 种子全带向量）→ 导入后 344 条（firefly 29 条=28 种子+1 条 demo 蒸馏 episodic；种子向量 0/28）。
- 时序确认：firefly 导入（~20:10）晚于 backfill 清盘（备份时 315/315 已带向量）→ 印证 F3。

## Resolution（2026-11-11）

### 遇到了什么问题

流萤人设包上线走查发现四个迭代遗留缺口：F1 语义巩固产出无 self 轨继承（迭代A漏改巩固产出侧，种子满 1 天即在生产触发，第一人称被 LLM 改写成第三人称后「我」字启发式漏标→世界轨→跨角色串味）；F2 'manual' 会话 modal 单视角致非众数角色的 episodic 永不巩固；F3 importData 不补向量 + 向量回填一次性自清（firefly 28 种子上线时 0 向量，只能等重启）；F4 两个人设包缺 AI 身份条款。

### 怎么解决的

- **F1 双层修**：`CONSOLIDATE_PROMPT` 输出 schema 补 `"self": true` 可选字段+判定说明（解析层 parseDistillOutput 本就透传 self，零改动）；`consolidateBatch` 加确定性兜底——本批源全为 `self:true` episodic 时产出缺省继承自我轨，LLM 显式 self（含 false）优先于继承。混合源批次不启用继承，走原启发式。
- **F2 分批巩固**：`consolidate()` 重构为 `consolidationBatches()` 分批——自我轨 episodic 按 `characterOf` 分组各跑一次（批内视角=批内人设众数），世界轨并入会话众数角色批；`sessionsNeedingConsolidation` 改用同一分批口径，任一批次够量即触发。单角色会话行为与旧版完全一致；多角色会话 LLM 调用次数=角色数/24h cooldown，有界。
- **F3 导入补向量+回填常驻**：`Brain.importData` 导入成功后对全部无向量条目 fire-and-forget `embedNotes`（Embedder 内部已按 10 条/批分块，失败静默留给回填）；`src/index.ts` 向量回填 interval 删除 `n===0` 一次性自清，改为常驻低频清扫——无待补条目时仅本地数组扫描零 API 成本，embed 瞬时失败自愈。
- **F4 模板条款**：两包 persona.md「始终守住的底线」各补一条——被问是否 AI/机器人/真实存在时如实承认是 AI 驱动的数字伙伴，不否认不编造，用自己语气自然带过。生产实例经 PATCH /api/personas 同步。

### 什么时候干的

2026-11-11，部署前完成（迭代节奏定调要求 F1-F4 先于迭代C上线；F1 修复窗口在种子满 1 天触发巩固之前）。

### Key Decisions

- **继承规则取「全自我轨源批次」而非逐条源映射**：巩固输出不记逐条来源对应，批级判定足够——全自我轨源批产出必是该角色自我沉淀；混合批交给 LLM self 字段+启发式。显式 self:false 不被继承翻回（LLM 判断优先于确定性兜底）。
- **世界轨并入众数角色批而非独立批**：世界轨全角色共享，随谁视角提炼都成立；独立成批会多一次 LLM 调用且产出归属无意义。
- **importData 嵌入全部无向量条目而非仅本次新增**：replace 恢复/幂等合并下 id diff 不可靠；无向量条目本来就需要向量，顺手补上与回填语义一致，且 Embedder 分块有界。
- **回填 interval 常驻而非退避自清**：30s 本地扫描成本可忽略；embed API 仅在有待补条目时才调用，正确性优先于省一个 timer。

### 验证结论

- 单测 +5（全自我轨继承/显式 false 优先/多角色分批/混合源不启用/importData 补向量）：188/188 绿（本文件 159+其余套件）。
- typecheck/build 0 错；eval 人设三轨隔离 recall=100%/noiseFP=0% 不变（lexical 段 q08/q15/n01/n03 FAIL 为存量基线问题，与本次改动无关——stash 验证 HEAD 同样 FAIL）。
- 生产验证：部署后向量回填清扫应在数分钟内为 firefly 28 种子补齐 embedding（此前 0/28）；'manual' 会话巩固按角色分批，产出 self 轨归属正确。
