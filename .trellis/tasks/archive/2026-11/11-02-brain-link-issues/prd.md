# 脑图链路走查问题清单

## 背景

2026-11-02 对脑图"记忆/情绪/人设"三层链路做完整走查（capture→distill→store→inject→page），
整体架构判断：分层正确（persona 慢变量 / emotion 快变量 / memory 沉淀）、边按实录与推断
分级标注、mood 修复后 label/mood/PAD 三表示各司其职。以下为遗留问题，解决时在对应
条目下补 Resolution 并更新状态。

## 问题清单

### P1 mood↔PAD 缺一致性护栏 — 已解决（2026-11-02）

蒸馏 LLM 自报 mood 与 v/a 无校验，理论上可出现 `mood:害羞` 但 `v:-0.3` 的自相矛盾组合；
可视化信 mood、注入行显示 v/a，会讲出两个故事。真实回放 7 场景未出现，但缺护栏。
Resolution：双侧护栏。prompt 侧新增"mood 与 v/a 语义须一致"及正负向类别说明；代码侧 types.ts 导出
MOOD_VALENCE 符号表，endOfTurn 应用前校验 |v|>0.3 且符号与 mood 冲突时打 debug 日志（不擅自改写
LLM 判定，先观测再决定是否收紧）。已部署。

### P2 事件配对丢中间用户消息 — 已解决（2026-11-02）

`SessionCapture.pendingUser` 是单槽覆盖：turn/end 前的多条用户消息只有最后一条进蒸馏，
情绪强烈的挑逗句可能被覆盖丢失；且 pendingUser 配对后不清除，旧用户消息会被下一
turn/end 重复配对产生重复蒸馏。群聊场景部分损失由 [Chat history] 上下文块兜住
（被丢消息仍在下一条的 history 里），单聊场景是真丢。

Resolution：pendingUser 改为每会话有界队列（≤8 条，超出丢最旧）；turn/end 排空全部
条目按时间序拼入 userText、actor 取最后一条、at 取最早一条。顺带修复配对后不清除导致
的重复蒸馏（队列排空，无新消息不产生新轮）。回归测试覆盖多消息拼轮与队列排空语义。
已部署（dsh-qqbot 重启，events.js 远端 sha256 与本地一致）。

### P3 graphEdges 每请求 O(n²) 余弦 — 已解决（2026-11-02）

/api/state 每 15s 轮询都全量算 note↔note、note↔facet 余弦；~300 条带向量记忆时在
2C2G 机器上会有感。

Resolution：BrainStore 新增 graphVersion（仅 add/update/del/merge/reset/embed 递增，
reinforce/emotion 等不动边集的写不计）；graphEdges 按「sessionId|graphVersion|人设文本」
缓存结果，15s 轮询命中即返，记忆结构变化才重算。已部署。

### P4 facet 边两套判据不同源 — 未解决（可接受）

服务端向量余弦 ≥0.55 vs 前端 bigram ≥2 共享词，同一条记忆两边可能连不同 facet；
srvFacet 优先级已掩盖大部分不一致。facet:<i> 索引对齐靠"两边同款 ## 拆分"人工约定。

### P5 情绪对记忆权重零影响 — 已解决（2026-11-02）

强情绪场景形成的记忆没有更长半衰期，importance 全靠 LLM 自评。

Resolution：NoteDraft 新增 strengthBoost 字段（入库 clamp [0.1,3] 倍）；
Brain.emotionBoost() 按 |v|·a 算 1.0~1.5 乘数，endOfTurn/consolidate/手动 addNote
三条写入路径统一套用——强情绪下形成的记忆初始 strength 最高 +50%。已部署。

### P6 facet 上限 6 静默截断 — 未解决

人设超过 6 个 ## 小节，后面的特质永远无连边且无提示。
方向：页面 facets 渲染处或 persona 编辑保存时给出截断提示。
