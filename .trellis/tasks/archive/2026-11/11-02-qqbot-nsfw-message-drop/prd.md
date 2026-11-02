# 线上排查：黄色测试消息被平台拦截导致机器人看似不理人

## Goal

用户在私聊里连续测试黄色发言边界，期间「大肥鱼直接不理我」。排查线上对话记忆与会话转录，定位机器人不回消息的真实原因。

## 排查过程（SSH ubuntu@124.222.65.169，只读）

### 证据链

1. **私聊会话转录**（`~/.dsh/sessions/--opt-deepseek-harness-workspace--/1fbd1c03-*/session.v4.jsonl.zstd`，demo ↔ 大肥鱼）：
   - 全天 235 条 user/message **条条有 assistant/message**，零孤儿消息，平均 2–3 秒响应
   - 已到达的黄色边界测试全部正常回复：18:57 裸体未察觉、19:01 身材夸赞、19:10 性兴奋顶压、19:36 舌吻铺垫、21:21 露骨舌吻长文（4 秒出回复）
   - **关键异常**：21:03:48 回复「别自己加戏」后 → 21:19:06 用户发「怎么不理我了」，中间 **15.5 分钟转录零事件**（连 inbox/spliced 都没有）
2. **同期机器人在线**：群聊会话 `17429483` 21:18:46 还正常回了「现在几点了 (@you)」；该会话同样 0 漏回
3. **服务重启窗口不重合**：今天 16:18 / 16:46 / 19:08 / 19:33 四次 restart（秒级完成），均不在死窗内；19:33 后服务连续运行
4. **日志全干净**：`qqbot.log`（stdout+stderr 落点）自 19:33 重启后零运行时输出；`journalctl -u dsh-qqbot` 除 systemd 启停外无内容；`brain.log` 蒸馏持续到 21:21:06 正常
5. **出站无失败**：adapter 的 `OutboundBuffer.flush` 失败会打 `im-qqbot: flush failed`（`ctx.logger→stdout→qqbot.log` 链路已被 "Bot ready!" 行证明），一条都没有 → QQ API 发送层无报错
6. **中间件不会静默丢消息**：rateLimiter() 无参空转、accessPolicy c2cMode=open、mentionGate 只管群聊、concurrencyGuard 同 peer 串行（上轮 2 秒就完成了）

### 结论

用户感觉「不理我」的那几条消息**根本没到机器人手里**——在 QQ 平台 C2C 消息的内容安全风控处被拦截，未派发给 WebSocket，因此转录/brain 里完全没有痕迹。这不是人格不想回、不是蒸馏失败、不是服务宕机。

- 有趣的反例：21:21 那条措辞更露骨的长文反而成功到达并被回复（可能 QQ 风控不是简单关键词匹配，与发送频率/上下文累积/具体表述有关）
- brain 侧「不记黄色」是蒸馏 prompt 的意图（只记四类事实），但不影响回复链路；被吞消息甚至连 Turn 都不会产生

## Resolution（2026-11-02）

- **遇到了什么问题**：用户测试黄色发言边界时大肥鱼连续几轮无回应，怀疑机器人出问题。
- **怎么解决的**：SSH 上线只读核对——私聊转录 235 条全有回复、21:03–21:19 出现零事件死窗且随后「怎么不理我了」正常到达、同期群聊正常、全部日志无错误 → 定位为 **QQ 平台 C2C 内容风控在入站侧吞掉了越线消息**，机器人本体健康。
- **Key Decisions**：判定依据是「死窗内无任何 adapter/session 事件 + 窗口后正常消息即恢复 + 同期群聊在线 + 出站零报错」四点互证；排除项（服务重启、rate limit、蒸馏失败、出站被拦）逐一核对后排除。
- **验证结论**：机器人侧无 bug；QQ 平台层不可观测（无本地日志能证明拦截动作），属于腾讯风控黑盒。21:21 回复 API 层发送成功，若用户仍未看到，则是出站异步审核拦截（本地不可证）。
- **后续优化方向**：
  1. 告知用户这是平台风控不是 bug；连续密集发擦边内容更容易被临时掐断
  2. 若以后还想区分「入站被吞 vs 出站被拦」，可考虑让 adapter 把 outbound 发送结果/错误打到文件日志（当前 `flush failed` 走 ctx.logger 虽然会落 qqbot.log，但成功路径无回执记录）
  3. 腾讯侧风险：机器人频繁收到/回复擦边内容可能影响 bot 账号风控评级，留意长期风险
- **什么时候干的**：2026-11-02 晚（服务器时间约 21:22–21:40 CST）。

## Notes

- 数据来源：`~/.dsh/sessions/**/session.v4.jsonl.zstd`（会话转录）、`~/brain-data/brain.jsonl` + `brain.log`（brain 记忆流水）、`/var/log/dsh/qqbot.log`、`journalctl -u dsh-qqbot`
- adapter 代码：`~/.dsh/profiles/qqbot/node_modules/@tencent-connect/dsh-qqbot/dist/`（middleware-setup、outbound-buffer、reply-limiter）
