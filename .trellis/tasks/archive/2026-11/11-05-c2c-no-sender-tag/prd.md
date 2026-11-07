# 私聊记忆白纸：C2C会话无发言人tag导致身份断链

## Goal

排查「群聊里大肥鱼记得记忆，私聊完全是白纸、重新积累」的 bug——走查云服务器数据定位根因。

## Requirements

- 走查线上 brain 数据（快照 + jsonl 流水），确认私聊会话的记忆/画像/情绪落点
- 定位私聊身份断链的代码根因
- 给出修复方向供用户决策

## 排查记录（2026-11-05）

### 线上数据（ubuntu@124.222.65.169 `~/brain-data`）

| session | notes | actors | 判定 |
| --- | --- | --- | --- |
| `17429483` | 93 | `demo (FEFE…)` `花咲蝶舞 (5AD8…)` 全 tag | 宿舍群 |
| `1fbd1c03` | 71 | `demo (FEFE…)` 全 tag | demo 的小群（有 tag → 群） |
| `832f1a89` | 21 | `demo (99449CA8…)` ⚠ 另一 openid | 另一群（member_openid 按群不同） |
| `dbf7162a` | 新增中 | actor=`'demo'` 裸昵称，无 tag | **demo 的 C2C 私聊** |
| `96fe6849` / `f7485370` | 各 2 | actor=`'用户'`/`'大肥鱼'` | 早期 C2C 私聊 |

画像键：`u:5AD8…`(花咲蝶舞) `u:FEFE…`(demo) `u:35D9…`(开心假日) + 4 个 `sess:` 兜底键。
`dbf7162a` 今天写入：note actor=`'demo'`；profile → `sess:dbf7162a`（demo 是角色的主人…）。

### 根因链

1. **宿主不打 tag**：`@tencent-connect/dsh-qqbot` `dist/transport/inbound.js:128` —
   `buildUserMessage` 对 `!isGroup` 直接返回 `quotePart+userContent`，无 `[昵称 (openid)]`。
   → `parseSenderTag`（capture/events.ts）拿不到 actor；`lastActor` 永不写入。
2. **读路径三断**（`brain.assemble`）：speaker=undefined →
   - `mergedUserProfile` 跳过（需 openid 或 nick）→ `u:FEFE` 画像不进 prompt
   - 态度按昵称保底跳过；xpool 跨会话召回跳过（需 `sp.openid||sp.nick`）
   - 检索池本来就按 `n.sessionId===sessionId||GLOBAL` 隔离 → 群聊 189 条记忆全不可见
   - 结果：只有 persona + 本 session 的 sess 画像/记忆/情绪 → 「白纸」
3. **写路径断**：`endOfTurn` actors=[undefined] →
   - `existingProfiles` 只有 sess 画像 → 蒸馏修订看不见 u: 画像
   - `resolveProfileTarget`：LLM 写 actor='demo'，但 speakers 注册表里 'demo' 对应
     FEFE + 99449CA8 两个 openid → 昵称歧义 → `sess:` 兜底 → 画像碎片化加重
   - `resolveActorTag('demo',[undefined])` 无法回填 tag → note.actor 永远裸昵称
4. **身份不可恢复（插件层）**：sessionKey=`qqbot:appId:c2c:<user_openid>` →
   sessionId=SHA-256 不可逆；且 C2C `user_openid` 与群 `member_openid` 不同命名空间
   （同一人 demo 已有 FEFE/99449CA8 两个群 openid，C2C 是第三个值）。
   `session/event` 的 session 对象不含 senderId/nick。

### 修复方向（用户已选 B）

- A. 会话内发言人推断：私聊 session 无 tag 时，用该 session 主导 actor 昵称作 speaker
  （nick 级匹配即可点亮画像/态度/xpool 读路径；写路径 sess: 兜底保持不变，语义保守正确）
- **B. 手动绑定：脑图页「会话→人」绑定（sess 画像 merge 到 u: 键 / 存 sessionId→nick 映射）✅ 已选**
- C. 宿主侧补 tag：patch dsh-qqbot inbound 让 C2C 也带 `[nick (user_openid)]`
  （拿真实昵称，但 openid 又多一碎片；改 node_modules 脆弱，需提上游）

## Resolution（2026-11-05）

### 问题

私聊里大肥鱼「一张白纸」：重新积累 sess 画像和记忆，完全调用不到群聊沉淀的 `u:` 画像/态度/跨群记忆。

### 怎么解决的

选 B（人工真值绑定，不用 LLM 推断身份）。**sess 画像卡的 `name` 字段兼作「私聊发言人绑定」**——schema/API 零新增：

- `Brain.boundSpeakerNick(sessionId)`：读 sess 画像 name，空=未绑定行为不变
- `assemble()`：显式非空 speaker 优先；无 tag 会话回退绑定昵称 → 点亮
  `mergedUserProfile`（u: 画像）、态度昵称保底、xpool 跨会话召回（attitude/semantic）
- `endOfTurn`/`maybeDigest`：`withBoundSpeaker` 在**整批无 tag**时把发言人视图渲染成绑定昵称
  （convo 行/actors 归集/existingProfiles 同口径；批内有一条真 tag 就不注入——群聊不串人）
- `existingProfiles`：裸昵称按画像 name 精确匹配收全部可见 `u:` 画像（同名归并口径），
  合成全 tag 供种回键位；草稿落键仍走 `resolveProfileTarget`——昵称歧义→`sess:` 兜底不造幽灵
- PromptInjector：无 actor 时用绑定昵称驱动 assemble + `brain:speaker` section
- 管理面：`store.sessions()` 返回 `profileName`；画像卡编辑放开会话卡 name 输入
  （placeholder 明示「发言人绑定昵称」）

episodic 流水维持会话隔离不动——修好的是「认识这个人」，不是「记得群里每句话」。

### 验证

- `node --test` 148/148 通过（新增 4 例：绑定读路径三点亮+episodic 不跨、显式 speaker 优先、
  蒸馏可见 u: 画像+歧义落 sess、convo 行绑定昵称）；typecheck + build 全绿
- 测试数据坑：模拟 openid 必须是 hex（`[0-9A-Fa-f-]{8,64}`），`OID_DEMO` 之类下划线 id
  会让 `splitActor` 解析失败

### 部署指引

1. `cd dsh-qqbot-brain && npm run build`，dist 部署到服务器（流程见 `.trellis/tasks/archive/*/部署*`）
2. 脑图页会话卡找到 `dbf7162a-e07d-d5cf-e6df-bd2915f54ab3`（demo 的私聊），
   编辑画像 → 名称填 `demo` → 保存（等价 `PATCH /api/profiles {key:'sess:dbf7162a…',name:'demo'}`）
3. 私聊发消息验证：`brain:speaker` 注入 `demo`，memoryLines 首行 `u:FEFE…` 画像
4. sessionId 被 `/session` 重置换新后需重新绑一次（c2c peerId 稳定，正常不重绑）

### 后续优化方向

- ~~会话卡列表可加「已绑定→demo」角标~~ ✅ 同日补做：SESSION 卡头部渲染
  `.badge bound`「→ demo」，title 提示绑定语义与解绑入口，已随 page.html 部署
- openid 三分片（FEFE/99449CA8/C2C）归一仍待画像合并人工收束，绑定只解决读路径
- 若官方宿主将来给 C2C 补 sender 字段，可升级为自动绑定（届时真值>人工值）

## Acceptance Criteria

- [x] 线上走查确认私聊 session 数据落点（sess: 键、裸 actor、独立检索池）
- [x] 根因定位到具体代码行（宿主 inbound + 插件 read/write 路径）
- [x] 修复方案经用户确认后实现（B：sess 画像卡 name 绑定）
- [x] 服务器部署 + `sess:dbf7162a` 绑 `demo` 后线上验证
  （rsync dist → 重启 dsh-qqbot → PATCH name=demo → 服务器端 assemble 实测：
  `[画像]` 注入 `u:FEFE` 群主画像 + `[跨群·3天前记]` 跨会话语义召回，episodic 仍隔离）

## Notes

- 相关既有档案：`11-04-actor`、`11-04-actor-tag-reason`（actor 回填链路）、
  README「还没解决的」openid 碎片化条目
