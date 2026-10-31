# 记忆质量修复：蒸馏v2+检索纠偏+评测集+身份层+滚动摘要+embedding

## Goal

按 10-31-memory-context-persona-eval 调研结论修复：蒸馏prompt提质、检索评分纠偏、迷你评测集、跨会话召回与画像归并、会话滚动摘要与注入扩容、embedding语义检索接入

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.

## Resolution（2026-10-31）

**遇到了什么问题**：线上 44 条真实记忆证实——蒸馏写流水不记事实、检索热度主导+马太锁死、记忆不跨会话、画像割裂、注入带宽过窄。另在接入百炼时发现：其 embedding 批上限 10 条/请求导致整批静默失败；余弦分布压缩（噪声底 0.33~0.56）使默认门槛失效、强化阈值形同虚设。

**怎么解决的**：按 design.md 六项落地——蒸馏 prompt v2（白名单四类+流水黑名单+importance 锚点）；检索改相关性门控 `rel·(1+β·R)` 且保底不 reinforce（`reinforceMinCos`）；发言人跨会话召回 attitude/semantic + 同名 u: 画像读侧归并；每 15 轮滚动摘要注入【会话脉络】；OpenAI 兼容 embedding 接入（百炼 v3，分块请求，`embedMinCos=0.47`/`reinforceMinEmbedCos=0.5` 按实测分布校准，无 key 回退 lexical）+ 启动回填；44 条真实记忆评测集定基线。

**后续优化方向**：巩固增强（已吸收 episodic 退出检索池、attitude 按对象归并、触发调频）；蒸馏 v2 上线后新旧记忆混合期靠衰减自然淘汰；跑两天后拿新 brain.log 评估蒸馏质量与会话脉络体感；embedding 阈值可随记忆规模再校准。

**什么时候干的**：2026-10-31 单会话完成「设计 → 六项实现 → 评测校准 → 部署线上验证」。

### Key Decisions

- 百炼 text-embedding-v3 为首发 embedding 提供方（免费额度），OpenAI 兼容接口保证可换 SiliconFlow/OpenAI
- emb 与 lex 余弦量纲不同，reinforce 阈值必须分源（`reinforceMinCos` vs `reinforceMinEmbedCos`）
- 保底态度是恒驻上下文，不计 hits 不做强化——这是断马太效应的关键一刀

### 验证结论

- typecheck / 60 tests / build 全绿
- 评测集：lexical recall 88.2%·FP40% → embedding 混合 recall 100%·FP20%
- 线上验证：dist rsync + 重启后启动行 `脉络 on / 向量 on`，回填 tick 正常出 5 条/批
