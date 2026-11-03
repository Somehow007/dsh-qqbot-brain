# 大肥鱼人设内核 v2：体贴粘人可攻略版 + 态度按人设分轨

## Goal

两件事一起做（耦合：依恋版的攻略弧依赖态度分轨才不被旧人设「剧透」）：

1. 基于线上 `whale-gentle`（含用户线上手改的成人向放宽）产出新人设 `whale-devotion`「鲸鱼娘 · 依恋版」：更体贴、更懂人、更粘主人（demo）、可攻略（恋人位 demo 专属）、对人有「好感依赖」。原版完整保留即备份。
2. 数据层落地「事实共享·态度分轨」：记忆/画像事实全局共享，attitude 按形成人设分轨召回，脑图支持按人设筛选/删除数据。

## Confirmed Facts

- 线上 `ubuntu@124.222.65.169`，brain-data `/home/ubuntu/brain-data`；`personas`: `legacy`（毒舌版）、`whale-gentle`（活动）。
- 线上 whale-gentle ≠ 仓库版：用户 live 手改——①身份加「生理期/发情/对男性性兴奋」；②尺度改「可描述，会害羞」；③底线加「主人/恋人要求可迎合可写露骨（暗喻/意象）」。**新版全保留**。
- 线上 persona.md 有 3 处真实乱码（U+FFFD）：「不是**客**服」「但**也**不必每句都接」，新版修复。
- 拉回文本存 `.trellis/tasks/11-03-persona-v2-devotion/live-persona-pull/`；草稿 `.trellis/tasks/11-03-persona-v2-devotion/persona-draft.md`。
- 数据模型：`MemoryNote.kind ∈ episodic|semantic|attitude`，按 sessionId 归属、actor 绑人，**无 persona 维度**；`ProfileEntry` 按 `u:<openid>` 一人一份覆盖重写（切人设被新声音重写=此前观察到的画像漂移来源）。
- attitude 召回点 `src/brain/index.ts:148-165`：topK 命中 kind=attitude + 发言人昵称保底 ≤3 条 → `brain:attitude`(10310)。**过滤点在这两处**。
- 蒸馏写入点 `src/brain/index.ts` endOfTurn→store.addNotes：NoteDraft→MemoryNote 处打 `personaId=activePersonaId()`。
- 人设注册：`src/setup/*.md` + index.ts `store.createPersona(name, text, id)`（id 不存在才建）；`POST /brain/api/personas` + `/activate` 可直上 live。
- 成本：persona 全文占蒸馏输入 ~60%（9KB），新版 ~4.8K 字略增；personaDigest 可对冲。

## Requirements

### R1 依恋版人设文本
- 线上版全文 + 修乱码 + 两个新模块：
  - 「心里的位置：好感与依赖」——好感涨/掉行为条件；慢节奏；好感依赖（在乎位置高的人来没来）；可攻略但**恋人位 demo 专属**（群友上限「在乎到有点心动」；表白三层反应：不熟→慌乱岔开 / 高位群友→温柔不越界拒 / demo→害羞接住）；不报数值。
  - 「主人 demo」——恒定最高位：黏他/体贴他/黏≠窒息/名分等他捅破/不无脑赞同。
  - 体贴/懂人渗入：优先判断加「读对方当前状态」；性格加「体贴」条（记事问后续、给台阶、听出硬撑）；称呼随位置变亲昵。
- id `whale-devotion`，名「鲸鱼娘 · 依恋版」；whale-gentle 原样保留。

### R2 态度按人设分轨（事实共享）
- `MemoryNote` 加 `personaId?: string`（写入时=当前活动人设；缺失视为 `whale-gentle`，存量即回填语义）。
- attitude 召回硬过滤 `personaId==active`（topK 命中与昵称保底两处都滤）；episodic/semantic/digest/情绪/画像全部共享不动。
- `ProfileEntry` 加 `lastWrittenByPersona` 仅展示标签；画像共享不分版。
- merge/巩固语义：merge 保留原条 personaId；巩固产 semantic 打当前 personaId 仅作来源展示。

### R3 管理面按人设管数据
- 脑图记忆/态度列表可按「形成人设」筛选 + 条目显示来源人设。
- 危险区加「按人设删除」（删指定 personaId 形成的记忆，事实+态度一起；带确认与 export 提醒）。
- 删人设不连带删数据，遗留条目标记原 id 可 purge。

### R4 上线
- 仓库：`src/setup/whale-devotion.md` + index.ts createPersona 行。
- live：`POST /api/personas` 写入 + activate（不动 dist 即生效；如需 R2/R3 生效则要部署 dist 后重启）。
- 注意顺序：**先部署 R2 再激活 devotion**，否则第一窗口期依恋版会看到 whale-gentle 的态度。

## Acceptance Criteria

- [x] `/api/personas` 含 whale-gentle（原文不动）+ whale-devotion；activate 切换即时生效且可切回
- [x] 新文本无 U+FFFD；含两个新模块；5129 字
- [x] 激活 devotion 后：`brain:attitude` 不注入 whale-gentle 时期态度；`brain:memory` 事实记忆正常召回；切回 whale-gentle 其态度原样回来（单测覆盖，线上 15 条存量均归 gentle）
- [x] 脑图可按形成人设筛选；危险区可按人设删除（UI + `del-persona` op 已实现，待页面上手用）
- [ ] 实测：对陌生人礼貌/对 demo 黏/不熟表白慌乱岔开/不报好感数值（待真实群聊观察）
- [x] `npm test` 全绿 + typecheck（新增 5 个分轨用例）

## Open Questions

- ~~可攻略范围~~ → **只有 demo 能到恋人**，名分等他捅破。
- ~~数据语义模型~~ → **B：事实共享·态度分轨**。
- ~~上线节奏~~ → 已按「代码先行、后激活」执行完毕。

## Resolution（2026-11-03）

- **遇到了什么问题**：想给大肥鱼换「更体贴/懂人/粘主人/可攻略」人设——但攻略线的「好感/位置」持久化靠 attitude 记忆，若全人设共享一个态度池，新人设一上线就被旧人设写好的立场「剧透」，攻略弧无从谈起。顺带发现线上 persona.md 有 3 处 U+FFFD 乱码（「客服」的「客」等被腐蚀）。
- **怎么解决的**：① 人设文本按「事实共享·态度分轨」语义模型设计——`MemoryNote.personaId` 写入打标，attitude 只对同人设召回（assemble 用一份 `attitudeVisible` 可见池统一过滤 topK/保底/跨群三口），事实记忆/画像/digest/情绪全共享；写侧三护栏防泄漏（existing 过滤防 mergeIndex 改轨、findNearDup/sweepNearDups 防跨人设判重合并）；存量缺 tag 归 whale-gentle；依恋版新增「心里的位置」+「主人 demo」模块，恋人位 demo 专属。② 管理面按人设管数据：state 透传 personaId、记忆库筛选、危险区按人设删除（`del-persona` op 显式带 ids）。③ 画像加 lastWrittenByPersona 展示标签。④ 上线顺序「先部署代码再激活」，避免空窗期依恋版读到旧轨。
- **走查发现并已修**：a) retriever 索引按 graphVersion 缓存，persona-activate 不 bump → 切人设命中旧轨缓存（已计入 graphVersion）；b) 无人设期写 personaId='' 会让 `??` 默认失效（store 写入口归一化空串→undefined）；c) 无活动人设时 attitude 全可见兜底（兼容未启用多版本存储）；d) build 脚本只拷 whale-gentle.md（改拷 setup 全部 .md）。
- **后续优化方向**：依恋版早期攻略弧慢——可用 notes CRUD 手动预置几条初始态度加速；「位置」演化稳定性待线上观察（attitude 积累速率 vs 人设预期）；/api/query 模拟器目前全量视图，如需要可加 persona 视角开关。
- **验证结论**：本地 128/129 测试绿 + typecheck/build 绿；线上已部署（rsync dist、重启、三版本在列、persona.md 镜像同步无乱码、重启后激活态保持）、whale-gentle/legacy 可切回；15 条存量 attitude 均归 whale-gentle，devotion 不可见。

### 完成后走查追加（2026-11-03）

- **发现**：a) 用户切回 whale-gentle 后 persona.md 带回 6 处 U+FFFD——store 存量 gentle 条目从未被修过（种子修复不作用于存量），PATCH /api/personas 用仓库修复版覆盖后干净（op 已落 jsonl 持久）；b) 跨类合并边缘口：mergeIndex 可把 attitude 输出改写到 shared semantic（心态落错轨）、findNearDup/sweepNearDups 只挡 attitude↔attitude 跨人设，attitude↔事实跨类合并会静默吃掉写入。
- **解决**：三处统一为「事实与态度不同角色，永不互相判重/吸收」（commit `ef612ff`）：mergeIndex 目标同角色校验、findNearDup 按 kind 过滤、sweep 配对加跨类跳过；新增 2 个跨类护栏用例，129/129 绿，已部署线上。
- **注意**：`npm run typecheck | tail` 管道掩盖过一次 TS 错误（tail 吞 exit code），验证命令要看原始退出码。

## Key Decisions

- 恋人位 demo 专属（群友上限「在乎到有点心动」，demo 名分也需他自己捅破）
- 数据语义模型 B：事实共享·态度分轨——「她记得所有事，但每段关系的感觉是每个人设自己的」
- 缺 personaId 存量归 whale-gentle（~5/15 误归可接受，免迁移）
- 删人设不连带删数据；重置保人设语义不变
- 上线即激活 devotion（非灰度），回滚=激活 whale-gentle
