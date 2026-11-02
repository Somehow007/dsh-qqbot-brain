# 宿主侧会话管理：删 RP transcript + 会话切回旧 session

> 存档约定：纯检查/讨论也存档——记录「遇到了什么问题 / 怎么解决的 / 什么时候干的」。

## Goal

清空宿主 dsh 侧的 RP 测试会话原文（`63aa5c4d`，含 391 行露骨对话流水），并把该 QQ 群的 sessionId 切回 `/new` 之前的「恋人线+正常事实」会话 `1fbd1c03`，恢复对话连续性。

## 宿主会话存储机制（调研结论，服务器 ubuntu@124.222.65.169）

- `~/.dsh/sessions/--opt-deepseek-harness-workspace--/<sessionId>/session.v4.jsonl.zstd`：逐轮完整流水（消息+回复+工具调用）；`session.lock` 为锁文件
- `~/.dsh/storages/session_projcache/sessions/<id>.json`：投影缓存（标题等派生数据，可删）
- `~/.dsh-qqbot/model-prefs.json`：`sessionIds` 存 **QQ聊天key → sessionId 覆盖映射**；key 形如 `qqbot:<appId>:<scope>:<peerId>`
- `session-manager.js`：`currentSessionId(key) = prefs.getSessionId(key) ?? deriveSessionId(key)`；`deriveSessionId` = sha256(key) 截断成 UUID——**未 /new 过的会话用确定性派生 id**
- `/new`（别名 `/reset` `/clear`）：`remove()` → `setSessionId(key, randomUUID())` 写覆盖 + 丢内存记录；**不删盘上 transcript**
- `/compact`：LLM 摘要原地压缩历史，保留 sessionId——会把剧情浓缩保留，不适合清污染
- **切回旧会话**：停服 → 把 sessionIds[key] 改指旧 sessionId → 启动；下条消息 `agents.resume` 重放旧 transcript。运行中改文件无效（prefs 在内存）
- 附件在 `~/.dsh/attachments/v1/objects` 与 `cache/attachments/request-images`，按 hash 存不与 sessionId 关联

## 会话谱系（已验证）

- RP群 `group:CB2555C5…`：`e6b717d7`(原生10-27) → `1fbd1c03`(new于10-28，恋人线至11-02 23:15) → `63aa5c4d`(new于11-02 23:26，RP剧情至23:54)
- 宿舍群 `group:8ECEE11B…`：`a7c9ce4f`(原生) → `17429483`(new，当前活跃)
- demo 私聊 `c2c:FEFE…`：`dbf7162a`（派生，无覆盖）
- 旁证：`1fbd1c03` 语义记忆自述「demo 是鲸鱼娘的主人，也是 QQ 群熟人」；`63aa5c4d` 开场即续恋人线——证明即使 /new，brain 长期记忆仍会注入旧关系（即用户最初抱怨的污染路径）

## Resolution（2026-11-03）

- **遇到了什么问题**：brain 记忆清洗后，宿主 transcript 仍存 RP 原文；且用户想删 RP 会话、把群切回恋人线会话。
- **怎么解决的**：停服 → rm `63aa5c4d` session 目录 + projcache → `model-prefs.json` 中 `group:CB2555C5` 改指 `1fbd1c03` → 启动。RP transcript 无 attachment 引用（纯文字）无需清图片。
- **验证**：`is-active=active`；brain 启动行「人格内核(persona.md) on / 蒸馏 on / 脑图 0.0.0.0:4099 / 数据目录 /home/ubuntu/brain-data」；session 目录列表已无 `63aa5c4d`。
- **后续优化方向**：用户在测试群发消息后，`journalctl -u dsh-qqbot` 应见 `resumed session: key=… sessionId=1fbd1c03`；若再 /new 想回滚，同法改映射即可，旧目录不删就能回。
- **备份**：服务器 `/tmp/host-reset-backup/`（model-prefs.json + session-63aa5c4d.tgz 原始 transcript）。
- **什么时候干的**：2026-11-03 00:18 CST。
