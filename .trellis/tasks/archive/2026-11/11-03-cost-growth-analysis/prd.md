# 长期对话成本增长机制分析：transcript 膨胀与摘要压缩影响

## Goal

纯讨论存档（未写代码）：用户提问——长期来看对话延迟、会话成本怎么增加？是不是 transcript 膨胀？transcript 里存的都是什么？摘要压缩有什么影响？

## Requirements

- 基于现有代码与 11-02 token 审计留痕作答，不改代码
- 分清宿主侧 transcript 与插件侧各调用的增长曲线

## Acceptance Criteria

- [x] 给出每类 LLM 调用的输入构成与增长形状
- [x] 说明 transcript 各层实际存了什么
- [x] 说明摘要压缩（宿主 compaction / brain digest）的收益与损失

## Resolution（2026-11-03）

### 遇到了什么问题

概念性问题：长期运行后每轮 LLM 调用的输入从哪里来、随时间怎么涨。

### 怎么解决的（结论）

**两条线的增长形状不同：**

1. **宿主侧 transcript = 锯齿形增长，是唯一大头。** 官方 dsh-qqbot → deepseek-chat
   每轮输入 = 官方 system prompt + transcript 全量回放 + 群聊消息（内嵌
   `[Chat history]` 最近 10 条 + `[Current message]`）。contextWindow=1M、~80%
   触发自动 compaction（11-02 审计 R12 在案）。阈值前 transcript 随轮次线性
   膨胀 → prefill/TTFT 与单轮计费线性上升；compaction 后骤降重爬。DeepSeek
   前缀缓存（hit≈0.1×价）压扁斜率不改形状；compact 后前缀全变 → 短暂 miss
   期单价回涨。长期成本 ≈ 轮数 × 锯齿均值，不发散。
2. **插件侧全部有界。** assemble 注入恒定 ~3–4.5k tok/轮（persona ~75%，
   topK≤6、画像 500 字 cap）；distill 攒批 + 已有记忆只带 top-8；digest 受
   `digestWindowTurns` × `turnCharCap` 限制；consolidate 随未吸收 episodic
   缓涨可回落。

**「transcript」在本项目要分清三层：**

- 宿主 transcript：逐字全量（每轮 user 复合块含环境消息+发送者 tag+正文、
  assistant 全文、tool call/result），无筛选直到 compaction。
- brain `historyBuffer`：Turn{userText, assistantText, actor, at,
  contextText≤500} 每会话内存 60 轮封顶、重启即失——只是 digest 原料窗。
- `brain.jsonl`：不是 transcript，是 op 流水（脑子的变更日志），200 op
  快照截断，审计重放用、不进 LLM 输入。

**摘要压缩的影响：**

- 收益：输入骤降 → 延迟/成本回落；代价：compaction 自身一次 LLM 调用 +
  前缀缓存失效几轮。
- 兜底：digest(250字)+memory+画像+情绪在 system prompt 每轮重放，跨
  compaction 存活——这正是架构设计意图（审计 R12："compact 后兜底，架构互补"）。
- 夹缝损失：不够格进四类白名单、但仍在演进的过程性细节被双层压缩丢弃——
  bot 表现为"记得主线、忘了细节"，问原话只能答语义。

**唯一单调增长项**：记忆条数（三天净存 111 条），被 topK 注入上限 + 30 天
物理遗忘 + 衰减/判重 merge 兜住——涨的是库规模（本地检索 CPU、consolidate
输入），不是每轮 token。

### 后续优化方向

- 宿主 compaction 阈值/行为属官方黑盒，可实测线上会话确认触发点是否符合预期
- 过程性细节保留若成为痛点，可考虑放宽白名单或给 digest 加"未完结话题清单"字段

### Key Decisions

- 无代码改动；结论引用 11-02-llm-token-audit 审计数据与 brain 源码（index.ts
  historyBuffer 60 轮封顶、events.ts contextText 500 字、store.ts op 流水）。
