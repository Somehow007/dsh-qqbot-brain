# 验收登记处（Acceptance Registry）— engram

> 实证验收项的唯一台账。规则同根项目 `.trellis/acceptance.md`：部署 ≠ 验收；登记 ≠ 通过；状态机 `待触发→观察中→已通过/打回`。
> engram 独立治理：本表只管 engram 项；brain 内核侧验收仍归根台账。

## 一、待验收实证项

| ID | 验收项 | 来源 | 验证方法 | 证据阈值 | 触发 | 状态 | 最近走查 |
|---|---|---|---|---|---|---|---|
| ACC-E01 | 首次部署自举：种子幂等导入 + persona.md 落盘 + 双服务起活 | dev-plan Slice1 | `journalctl -u engram` 看「种子导入 +N / persona.md 自举 / 已启动」；`curl /api/config` 401→token→200；`/brain/` 反代 200 | 事件：部署完成 ×1 | 事件 | 待触发 | — |
| ACC-E02 | 真实对话声口+记忆命中：私聊若干轮后，assemble 注入的记忆/态度与回复匹配度人工判读 | dev-plan Slice1 | `/api/history` 拉对话；`/brain/` 脑图看新笔记蒸馏归属（personaId=firefly、session 关联）；usage token 数合理（6–9k 输入档） | 样本：≥5 轮真实对话 | 样本 | 待触发 | — |
| ACC-E03 | 记忆不污染：LLM 失败轮不产生 brain 笔记；proactive 消息（slice2）不产生 user 归属事实 | chat-loop/proactive spec | 构造 LLM 失败（断 key/超时）发消息 → `/brain` 导出查该时段笔记数不增；via:'agent' 轮次蒸馏产出=0 | 事件：×1 失败轮 + ×1 proactive 轮 | 事件 | 待触发 | — |
| ACC-E04 | 重启持久化：chat-log/proactive-state/brain store 重启不丢；种子重复 importData 不重复（uuid5 幂等） | brain-integration spec | `systemctl restart engram` 前后对比 `/api/history` 条数、`~/engram-data/` 文件、brain 导出笔记数 | 事件：×1 重启 | 事件 | 待触发 | — |
| ACC-E05 | 主动开口质量（slice2）：中档预算下开口时机自然、被回复率可接受、「别发」率低 | dev-plan Slice2 | `proactive-state.json` dayCount/deferred；chat-log proactive 条目 vs 后续 user 回复间隔；每周人工走查 | 样本：≥10 条 proactive 消息或 2 周 | 样本 | 待触发 | — |

## 二、持续观察项

| 项 | 观察点 | 最近记录 |
|---|---|---|
| 单轮成本 | `/api/chat` usage.totalTokens 分布；日累计 vs 预算模型（6–9k in / 200–500 out） | 未部署 |
| history/记忆增长 | chat-log.jsonl 体积、memoryLines 注入条数长期趋势 | 未部署 |
| persona.md 生效 | `/brain` 人格卡文本 = dataDir/persona.md；声口抽查像流萤 | 未部署 |
| SSE 推送 | proactive 发送时在线客户端即时收到（无刷新） | 未部署 |

## 三、已通过项

- 本地冒烟（2026-11-19）：种子 +28 记忆导入、persona.md 自举、chat :4100 鉴权 401/200、brain :4101 反代 200、SIGTERM 优雅停机——**代码级验证，非生产实证**。
