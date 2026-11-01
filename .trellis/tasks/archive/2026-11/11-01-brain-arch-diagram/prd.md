# 人格/记忆架构图说明

## Goal

用户要求把当前人格与记忆架构画成图说明（承接 11-01-brain-arch-confirm 的链路确认）。纯讨论留痕，无代码变更。

## Resolution（2026-11-01）

- **遇到了什么问题**：需要一张架构总览图讲清「脑里装了什么」与「每轮怎么读/怎么写」。
- **怎么解决的**：输出两张 ASCII 图——
  1. 存储层：`BrainStore` 内存态（personas 多版本 + notes 三种 kind：episodic/semantic/attitude + profiles u:/sess: + emotions PAD + digests）落在 `persona.md`/`brain.jsonl`/`brain.snapshot.json`；
  2. 运行时：读路径 `system-prompt/assemble`→`Brain.assemble`→6 section；写路径 `session/event`→`endOfTurn`→一次蒸馏产 memories+emotion+profiles，画像再过 `reviewProfiles` 审核；后台巩固/episodic→semantic、embed 回填、衰减强化与 evict。
- **关键易错点**：人格内核只读（attitude 才是慢变量）；画像挂在 memory section 且需二次审核；每轮末最多 3 次 LLM（distill→review→digest）；working memory 在宿主侧不在插件。
- **后续优化方向**：暂无。
- **什么时候干的**：2026-11-01。
- **验证结论**：图示与 `src/brain/store.ts`、`src/brain/types.ts`、`src/inject/prompt.ts`、`src/brain/index.ts` 一致。
