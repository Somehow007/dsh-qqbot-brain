# 画像按人建模（openid 主键 + 会话兜底）

## Goal

把「会话画像」从按 sessionId 存储改为按人存储：群里同一个发言人（openid）在不同会话间共享同一份画像；脑图页按人展示卡片。

## Background

- 现状：`profiles: Map<sessionId, string>`，画像绑在 dsh 会话上；群聊多人挤进一张卡，同一人跨会话分裂。
- 已查证：dsh-qqbot 的 sessionKey=`qqbot:{appId}:{scope}:{peerId}`（c2c peerId=用户 openid，group peerId=群 openid），sessionId 由 key SHA-256 派生、重启稳定。私聊 session 本身即"某个人"。
- 发言人 tag `[昵称 (openid)]` 只在群聊消息出现（inbound.js buildUserMessage 私聊不加 tag）；私聊拿不到 openid，退回 sess: 键，行为与现状一致。
- 工作区有大量未提交改动（attitude kind、exportData/importData、备份 UI、页面 polish），必须在其上增量修改。

## Requirements

- R1 身份主键：profiles 键为 `u:<openid>`（有发言人 tag）或 `sess:<sessionId>`（兜底）。存储条目含 text/name/sessions/updatedAt。
- R2 蒸馏结构化：prompt 改 `profiles: [{actor?, text}]`；actor 带 openid → u: 键（name=昵称），无 actor → 会话级 sess: 键；兼容旧 `profile` 字符串解析。
- R3 注入：assemble 按发言人 openid 取个人画像置顶，会话级画像次之；无发言人时维持现状（sess 画像）。
- R4 数据兼容：旧 snapshot/jsonl 的 profile 记录自动迁移为 `sess:` 键，旧卡片不丢；exportData/importData 同步适配。
- R5 页面：画像卡按人展示（昵称+openid 短码+出现会话），会话级画像保留展示；`/api/profiles` 提供数据。
- R6 态度保底唤起扩到跨会话（"对人的记忆跟人走"）：发言人匹配不再限本 session。

## Out of Scope

- 不改普通情景/语义记忆的会话隔离检索；不引入新依赖；不改 dsh host。
- 不强行拆分旧群画像文本行（自然淘汰，不做文本解析迁移）。

## Acceptance Criteria

- [ ] AC1 群聊蒸馏产出 `profiles:[{actor:"昵称 (openid)",text}]` 后，store 以 `u:` 键存画像；同一 openid 换会话再蒸馏仍写同一键。
- [ ] AC2 私聊/无 actor 时画像写 `sess:` 键；旧数据重启后仍在页面可见。
- [ ] AC3 assemble 发言人=张三时，memoryLines 置顶行为张三个人画像；无画像的会话不受影响。
- [ ] AC4 页面画像卡按人展示且含昵称/openid/会话信息；npm test 全绿（含新用例），typecheck 通过。

## Notes（实现记录 10-30）

- 已落地：identity.ts（splitActor + u:/sess: 键）、store ProfileEntry{Text,name,sessions,updatedAt}+迁移、distill profiles 数组、assemble 发言人注入、跨会话 attitude 唤起、/api/profiles、页面人物卡+导出改走 /profiles、tab 更名「画像」。
- 关键查证：dsh-qqbot sessionKey=qqbot:{appId}:{scope}:{peerId}，sessionId 由 key SHA-256 确定性派生；私聊 peerId=用户 openid（sess 键天然=人），群聊 peerId=群 openid；发言人 tag 仅群聊注入。
- 验证：40/40 测试、typecheck、build、真实 ~/brain-data 迁移读取正常、端到端 /api/profiles 200。

## Resolution（2026-10-30）

### 遇到了什么问题

1. 用户反馈「会话画像页面只显示三条，先前的看不到」——怀疑页面有显示上限。
2. 排查发现页面无截断逻辑（`renderSessions` 全量渲染），store 里确实只有 3 个会话且全部产生于当天；画像/情绪落盘后永不删除（compact 只 evict 记忆笔记），所以"旧会话自己消失"只有一种可能：数据没写进这份 store。
3. 根因：dataDir 相关坑——`qqbot-test` profile 链接的是另一份已删除的插件副本（`Documents/campus/...`），残留 `~/.dsh/profiles/brain-data/` 空目录；`dataDir` 相对路径按进程 cwd 解析会写到启动目录；多实例共享同一 brain.jsonl 时 compact（写快照→清空 jsonl）会冲掉另一进程的 op。
4. 进一步发现模型问题：画像按 sessionId 存，"人"的维度分裂——同一人跨会话/跨群多张卡，群里多人挤一张卡。

### 怎么解决的

- 持久化排查：实测 API 写入立即落盘、compact 快照+jsonl 重放往返无损、18 项测试通过 → 确认存储链路本身健康，问题是数据位置而非丢失。
- 查证 dsh-qqbot 源码：`sessionKey=qqbot:{appId}:{scope}:{peerId}`（c2c peerId=用户 openid，group peerId=群 openid），sessionId 由 key SHA-256 确定性派生、重启稳定；发言人 tag `[昵称 (openid)]` 仅群聊注入。
- 设计落地（见上方 Notes）：画像改按 `u:<openid>` 主键存储，`sess:<sessionId>` 兜底；蒸馏输出结构化 `profiles[]`；注入按发言人 openid 取个人画像；attitude 保底唤起扩到跨会话；页面画像卡按人展示。

### Key Decisions

- 私聊不打 u: 键：私聊 sessionId 已由用户 openid 确定性派生，`sess:` 键天然=那个人；群聊才需要 openid 拆开。
- 旧数据不强行迁移：旧 session 画像归一为 `sess:` 条目自然展示，群内分人旧文本不逐行拆（解析脆弱），随新蒸馏自然迭代。
- 会话级画像保留：LLM 可输出无 actor 的条目更新 sess: 键，作为"群整体印象"层存在。

### 后续优化方向

- **多实例防护**：两个 dsh 进程共享同一 dataDir 时 compact 会丢数据——考虑加文件锁/实例指纹，或启动时检测 brain.jsonl 被外部截断。
- **dataDir 启动日志**：启动时打印解析后的绝对路径，避免相对路径写到意外目录。
- **私聊 u: 归并**：若 host 侧能拿到 peer openid（session 对象/replyTarget），私聊也可并入 u: 键实现全链路人维聚合。
- **普通人记忆按人召回**：目前只有 attitude 跨会话唤起，episodic 也可考虑对 actor=当前发言人的条目做跨会话兜底。
- **画像手工编辑/遗忘入口**：页面目前画像只读，可补「编辑画像」「忘记这个人」操作。

### 什么时候干的

2026-10-30，单会话完成「排查→设计→实现→验证」；40/40 测试 + typecheck + build + 真实数据迁移验证通过。dsh 实例需重启生效。
