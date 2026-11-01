# 类脑架构注入/蒸馏链路确认

## Goal

用户确认当前类脑架构是否为「人格内核一份 + 记忆/情绪/画像追加注入宿主侧，宿主回复后蒸馏写记忆」。纯讨论留痕，无代码变更。

## Requirements

- 回答应基于 `dsh-qqbot-brain/src/` 实际代码，不以 README 描述为准。

## Resolution（2026-11-01）

- **遇到了什么问题**：用户对架构的心智模型是「4 块注入（人格/记忆/情绪/画像）+ 回复后蒸馏写记忆」，需确认与实际实现是否一致。
- **怎么解决的**：对照代码确认大方向正确、细节有出入：
  - 注入侧走 `system-prompt/assemble` waterfall（`src/inject/prompt.ts`），最多 **6 块** section：`brain:persona`(80) 人格内核、`brain:digest`(81) 会话脉络滚动摘要、`brain:emotion`(82) 情绪态一行、`brain:attitude`(83) 当前立场、`brain:memory`(84) top-k 记忆摘录、`brain:speaker`(86) 当前发言人；均早于官方 `qqbot:scope-prompt`(90)。
  - **画像不是独立 section**：个人画像/会话画像以 `[画像]`/`[会话画像]` 行挂在 `brain:memory` 摘录头部（`Brain.assemble`）；含当前发言人昵称的 attitude 条目跨会话保底唤起（≤3 条），另有 ≤2 条 `[跨群]` 召回。
  - 写回侧走 `session/event`：`user/message`→暂存（兼作检索 query 与 actor），`assistant/message`→收集回复，`turn/end`→`Brain.endOfTurn()`。
  - **轮末一次蒸馏调用同时产出** memories（episodic + kind=attitude，支持 merge 指回更新、forget 意图遗忘）、emotion 增量（label+VAD）、profiles 画像草稿；画像草稿须再过 `reviewProfiles` 独立审核调用（剔除时效信息）才落盘，审核失败保持原画像。
  - 之后给新/改记忆补 embedding；每累计 `digestEveryTurns`(15) 轮触发一次会话脉络摘要更新。
  - 非每轮的还有：语义巩固定时器（episodic→semantic + 重写画像，tick 60min/cooldown 24h）、embedding 回填、艾宾浩斯衰减 `R=e^(-t/S)` 与命中强化。
- **后续优化方向**：暂无（纯确认讨论）。
- **什么时候干的**：2026-11-01。
- **Key Decisions**：本轮仅核对实现、留档；不改代码。
- **验证结论**：核对文件 `src/inject/prompt.ts`、`src/capture/events.ts`、`src/brain/index.ts`、`src/brain/distill.ts`、`src/config.ts`，结论与用户模型一致（需补充 digest/attitude/speaker 三块及画像挂载位置）。
