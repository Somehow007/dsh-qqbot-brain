# Journal - sunhao (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-11-09

---



## Session 94: 归档大扫除：清坏档 + 归档 7 个失真任务
<!-- trellis-session: v=2 fp=2d5da4bdbf479e64 -->

**Date**: 2026-11-09
**Task**: 归档大扫除：清坏档 + 归档 7 个失真任务
**Branch**: `main`

### Summary

问题：.trellis 归档积累重复/冗杂/无用信息，且进行中列表失真。排查：通读 68 份归档 prd + 14 个进行中任务，分类出空目录、坏档（11-04-p2 无标题缺 task.json）、年份 typo、缺 task.json、过期未标、7 个已完成仍挂进行中的任务。方案：删空目录；p2→consolidation-absorb-merge 改名补档；修 3 处 2025→2026 typo；补 4 个 task.json 桩；cloud-mem-check 加时点标注；7 个任务逐个补 Resolution 后 task.py archive --no-commit --skip-branch-validation；README 链等合法多档保留不动。验证：无空目录、归档目录 prd+task.json 齐全、进行中列表只剩真实活跃任务。后续：新 prd 注意 Resolution 不复述正文，任务完成随手归档。

### Git Commits

| Hash | Message |
|------|---------|
| `d39f599` | chore(trellis): 归档大扫除——清坏档并归档 7 个失真进行中任务 |

### Status

[OK] **Completed**


## Session 95: 记忆/人格架构市面调研两轮（Letta/Mem0/Zep + 人格方案/陪伴产品形态）
<!-- trellis-session: v=2 fp=46f7169a35f828ab -->

**Date**: 2026-11-09
**Task**: 记忆/人格架构市面调研两轮（Letta/Mem0/Zep + 人格方案/陪伴产品形态）
**Branch**: `main`

### Summary

调研任务：为 brain 内核演进与陪伴型 Agent 第二 deployment 做技术选型储备。问题：市面记忆/人格方案繁多需对照本项目基线评估。方案：两轮调研——R1 对照 Letta/Mem0/Zep 三大记忆架构（读论文+2026 产品文档），R2 调研人格方案（c.ai definition/OpenClaw SOUL.md/Replika/角色扮演研究）与陪伴产品形态（c.ai/Replika/星野/猫箱等）。结论：不整体引入任何方案（接入即放弃差异化组合，该组合在市面仍空白）；思想级借鉴 10 条，最高优先级=主动召回（recall-intent 门控）与 prospective memory（standing intents），均为 companion 前置；OpenClaw 是最近架构表亲（独立收敛到五层 tier+dreaming+provenance）；人格保只读内核、可变自我由 attitude/emotion 承担以抗 persona collapse。验证：论文/官方文档/产品公开信息+2026 陪伴专评（REMP/LifeSide/ZifaMem）交叉印证；benchmark 仅衡量事实召回不预测陪伴质量。后续：高优先级两项随 companion-agent-eval 立项；中优先级（dreaming 重组/双时态/图扩散/provenance 分级）作内核演进储备。产出：archive/2026-11/11-09-memory-persona-arch-research/{prd,memory-arch-survey,persona-companion-survey}.md，commit 56c4ee7。

### Git Commits

| Hash | Message |
|------|---------|
| `56c4ee7` | chore(task): archive 11-09-memory-persona-arch-research——记忆/人格架构调研两轮完成 |

### Status

[OK] **Completed**
