# 迭代D·prospective memory + provenance（companion 前置②③）

## Goal

按 `11-09-iteration-upgrade-plan` §5 落地「主动开口」的内核前置两件套：

- **D1 standing intents（prospective memory）**：会记得在未来触发的意图。`event` 型对入站文本/发言人做确定性匹配，`time` 型按时间戳或每日 HH:mm 到点判定；生命周期 pending→fired/expired/cancelled，冷却/次数上限/过期内核强制。dsh 侧只做可观测（brain.log + /api/ops + /api/intents），不做发送——诚实降级，不装作能主动开口。
- **D2 provenance / session-kind**：`Turn.via` 三态标注轮次来源；agent/system 批次跳过蒸馏（bot 自己的主动消息+心跳不产记忆/画像/情绪）；convo 行按 via 标注防错归因；`MemoryNote.source` 轻量来源戳。

companion 壳层（迭代F）将消费：intents 存储/tick/触发评估 + via 标注口径 + `Brain.search`（迭代C 已落地）。本迭代**先开发不部署**——部署等 CHANGES.md 广播明确放行 D 后再走。

## Requirements

### D1 intents

- `IntentEntry { id, kind:'event'|'time', text, status:'pending'|'fired'|'expired'|'cancelled', createdAt, fireAt?, dailyAt?, match?, cooldownMs?, cooldownUntil?, maxFires?, firedCount, lastFiredAt?, expiresAt?, personaId?, sessionId? }`；`match={text?,actor?}` 子串（大小写不敏感）或 `/正则/flags`，双字段同给按 AND 判定。
- `time` 型二选一：`fireAt`（一次性 epoch ms，触发即终态 fired）或 `dailyAt`（'HH:mm' 按 `cfg.timeZone` 每日复发，场次晚于 createdAt 才补触发，expiresAt 封顶复发窗口，maxFires 封顶总次数）。
- store：新 op `intent-add/intent-update/intent-fire/intent-del` + 快照 `intents` 数组；JSONL 可重放、/api/ops 天然审计；`reset` 清 intents；export/import 往返保留（merge 按 id 去重）。不用 SQLite。
- Brain API：`addIntent/updateIntent/cancelIntent/deleteIntent/listIntents/tickIntents`；`Brain.ingest` 对 event 型做确定性匹配并对 time 型顺带 tick，返回本轮 fired 列表。触发评估**零 LLM**；冷却/预算/expiry 内核强制。
- HTTP：`/api/intents` GET list（status/kind/sessionId 过滤）+ POST create + `/api/intents/<id>` PATCH/DELETE + `/<id>/cancel` + `/tick` 手动评估（走查用）。
- dsh 侧：intent 可建可查可审计；触发时 brain.log 记 `intent fired`；插件挂 60s 常驻 tick 定时器（unref）；不注入消息。
- aspiration 型（长程意向+复审期）不做——二期，先 event+time（决策点 #5 已定）。

### D2 provenance

- `Turn.via?: 'user'|'agent'|'system'`（缺省=user 兼容存量）；`Brain.ingest` 透传（spread 天然保留）。
- 蒸馏口径：`buildDistillPrompt`/`buildDigestPrompt` convo 行按 via 渲染——agent 行作「角色（主动开口）」、system 行作「系统」，均不作为用户发言归因；prompt 加一句口径说明。
- **整批无 user 轮次 → endOfTurn 跳过蒸馏**（不产记忆/情绪/画像；digest 同批跳过，historyBuffer 仍累积供下批窗口）。
- `MemoryNote.source?: 'user'|'agent'|'manual'|'import'`：endOfTurn 蒸馏产出='user'；巩固产出=源同质继承/混合归 'user'；`Brain.addNote`（脑图/API）='manual'（NoteDraft.source 可覆盖，companion 壳层将来传 'agent'）；importData 缺省补 'import'（备份自带 source 者保留）。来源戳不可经 update op 修改。
- `withBoundSpeaker` 只给 user 轮次补绑定昵称，不给 agent/system 轮次乱标发言人。
- companion 壳层职责（F 阶段）：自己的 proactive turn 标 `via:'agent'`、cron/心跳会话标 `via:'system'`——本迭代只交付内核口径。

## Acceptance Criteria

- [x] intent 生命周期单测全路径：add→event 命中/time 到点→fire→cooldown 内不重复→maxFires/expiresAt 边界→cancel；快照重启恢复；op 重放一致；/api/ops 可见 intent ops
- [x] tickIntents 确定性：同 now 同输入同输出；零 LLM 调用（mock fetch 断言零调用）；dailyAt 场次口径（创建后首个场次才触发、昨日场次不补打、次日复发、expiresAt 封顶）
- [x] event 匹配单测：text 子串/正则、actor 匹配、双字段 AND、sessionId 作用域、via=agent/system 轮次不触发
- [x] provenance 单测：via=agent/system 批次跳过蒸馏（fetch 零调用、零记忆/情绪/画像）；混合批次 prompt 含 via 标注行且 agent 文本不被当用户事实（prompt 快照断言）；MemoryNote.source 各路径落库正确且快照往返保留
- [x] `npm run typecheck` + `npm test` + `npm run build` + `npm run eval` 全绿
- [x] **不部署**：本地验证完成即停，等 CHANGES.md 广播放行 D 后再走部署 runbook + 云端走查（§5.5：手动建 event+time 测试 intent 观察 brain.log//api/ops，验完清理）
- [x] spec/backend/index.md 同步新约定；CHANGES.md 追加（注明已开发未部署）；归档含 Resolution

## Notes

- 设计稿：`design.md`；执行清单：`implement.md`。
- 上游方案：`.trellis/tasks/11-09-iteration-upgrade-plan/iteration-plan.md` §5（已定稿路线图）。
- 关联：companion 前置②③（F 阶段消费 intents + via 口径）；迭代C 的 `Brain.search` 已是 F 的前置①。
- 节奏约定（11-11 定调）：做完→部署→观察窗串行；本迭代例外——开发完成但**暂不部署**，等广播放行（多会话并行时可能有其他迭代在观察窗）。

## Resolution（2026-11-13）

### 遇到了什么问题

按 `11-09-iteration-upgrade-plan` §5 落地 companion 前置②③：内核需要「记得未来要做某事」的前瞻记忆（standing intents），以及轮次/记忆出处标注（provenance），否则 companion 壳层的主动消息会把 bot 自己的话蒸馏成用户事实。

### 怎么解决的

- **D1**：`IntentEntry` 两型（event=match.text/actor 子串或 `/正则/` 双给 AND；time=fireAt 一次性 XOR dailyAt 每日复发）。四个新 op（`intent-add/update/fire/del`），其中 `intent-fire` **op 自带结果态**（firedCount/cooldownUntil/status）保证 JSONL 重放确定性、不重算；快照/导出/导入/reset 全链路覆盖。触发评估零 LLM：event 在 `Brain.ingest` 内对 `via==='user'` 轮次即时匹配，time 由 `tickIntents` 评估（ingest 顺带 + 插件 60s unref 定时器兜底）；`ingest` 返回 fired 列表交壳层消费，dsh 侧只 brain.log 观测不发送。HTTP `/api/intents` 六路由全 CRUD+tick。
- **D2**：`Turn.via` 三态（user 缺省兼容存量）；整批无 user 轮次→endOfTurn 跳过蒸馏+摘要（纯 agent/system 内容不产记忆/画像/情绪，反而省 LLM 调用）；混合批次经共享 `convoLines` 渲染「角色（主动开口）/系统」标注行+prompt 口径声明非用户事实；`MemoryNote.source` 四值（user/agent/manual/import）贯穿蒸馏、addNote、importData（缺省 import）、巩固同质继承/混合归 user、快照与 op 重放，sanitizeNote 白名单校验不可经 update 修改。
- **实现中修掉的坑**：测试共享假时钟被前序用例污染（dailyAt 触发语义依赖 createdAt<场次）；`compact()` 物理遗忘用真实 Date.now() 会清掉假时钟记忆（测试配置 evictAfterDays:0）；digestEveryTurns 污染蒸馏调用计数（测试关 digest）；`/tick` 必须先于 `/<id>` 动态匹配显式判断。

### Key Decisions

- firedCount/cooldownUntil/status 随 `intent-fire` op 持久化而非重放重算——重放确定性优先于存储紧凑（同 consolidateBatch 戳人设思路）。
- agent/system 批次**整批跳过**蒸馏而非仅标注——既防错归因又省 LLM 成本；digest 同批跳过但 historyBuffer 继续累积。
- source 混合批次巩固归 'user' 而非丢弃来源信息——巩固产出语义上仍是「关于用户的世界知识」，保守归 user。
- intents 不进 `graphVersion`（不影响记忆边集/检索索引），只 bump `version`。
- dsh 侧触发只观测不发送——主动消息是 companion 壳层（迭代F）职责，本迭代诚实降级。

### 后续优化方向

- aspiration 型长程意向+复审期（二期，路线图已注明）；intents 的脑图页可视化（graph() 已带 intents 字段，UI 未做）；触发后的消息生成/节流策略归壳层设计。

### 什么时候干的

2026-11-13 本地开发完成并验证；**未部署**——按用户要求等 CHANGES.md 广播明确放行迭代D 后再走部署 runbook + 云端走查（prd §5.5：手动建 event+time 测试 intent 观察 brain.log//api/ops，验完清理）。

### 验证结论

- `npm run typecheck` ✅；`npm test` 220/220 ✅（新增 `test/intents.test.ts` 16 例覆盖生命周期/确定性/边界/出处/HTTP）；`npm run build` ✅；`npm run eval` 与 HEAD 基线完全一致（q08/q15/n01/n03 四处 FAIL 为既有检索质量基线，与本次改动无关——已用 git worktree 基线对照确认）。
- 文档同步：spec/backend/index.md（intents+provenance 两条约定）、MAP.md、README.md（根+插件，含 /api/intents 路由表）、CHANGES.md 广播（注明未部署）。
