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


## Session 96: 迭代A·人设三轨地基：角色→人设两级模型落地并上线
<!-- trellis-session: v=2 fp=06253ce418ccaa04 -->

**Date**: 2026-11-09
**Task**: 迭代A·人设三轨地基：角色→人设两级模型落地并上线
**Branch**: `main`

### Summary

按 iteration-plan §2 把记忆可见性从「事实共享·态度按人设分轨」升级为三轨：世界轨（非 attitude 且 self≠true）全角色共享，自我轨（attitude+self:true）与情绪按 characterId 隔离，同角色人设版本共享、跨角色互不可见且切换不删数据。实现：types 加 self 三态/characterId/WHALE 常量/isSelfContent 启发式（引号外含「我」，显式 false 优先）；store 三态 sanitize+op patch+import/export 透传+persona-save/delete 触发 graphVersion 失效；Brain 收口 characterOf/trackVisible/trackKeyOf，判重/归并/巩固喂料/forget/regenerate 全过轨道守卫，emotionFor 角色不符读 NEUTRAL；endOfTurn 在 ingest 钉批次人设（批内众数）防运行中切换错乱；distill prompt 加可选 self 字段；http/page 透传并加轨道徽标/所属角色框；migrateTracks 幂等迁移（whale 三版本归 whale+启发式补标存量）。排查插曲：resolveSelfFlag 初版让启发式覆盖显式 false 已修；page.test mock DOM 缺字段已补；eval/单测查询词与内容不相关导致的假失败换词后通过；部署踩坑 rsync 目的路径写成 dist/ 造成 dist/dist 嵌套、服务仍跑旧代码，rm 后按 runbook 改 rsync 到插件根才生效。验证：typecheck 0 错、node --test 173/173、eval 人设隔离 100%/0%、build 通过；生产备份后部署，/api/personas 三人设 characterId=whale、/api/state 283 notes 含 4 self:true（whale-devotion 第一人称正确入轨）+9 attitude 全归 whale、emotion 回落 whale、启动日志迁移行确认、journalctl 无 error。文档同步：spec/backend 三轨约定、MAP/README（根+插件）机制层与阶段清单、任务归档 archive/2026-11/11-09-iteration-a-three-track。后续：迭代B 接叶瞬光实战验证跨角色隔离；self 启发式误标率待线上抽查；digest/profiles 仍共享不分轨（设计使然）。

### Git Commits

| Hash | Message |
|------|---------|
| `cf1b3f5` | feat(brain): 迭代A·人设三轨地基——角色→人设两级、自我轨按 characterId 隔离 |

### Status

[OK] **Completed**
