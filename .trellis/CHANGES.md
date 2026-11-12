# CHANGES · 跨会话广播位

> **这是什么**：多会话并行时的「最近发生了啥」速览。每个会话开工先 `tail -30` 本文件；做到四类事件时顺手在**文件尾部**追加一行。约定全文见 `AGENTS.md`「跨会话广播位」。
>
> **旧会话恢复 / 跨时段继续**：不必全读——往回读到条目时间戳早于你最后活跃时点为止，只补这些增量即可（几天前的会话同样适用）。

## 记什么（四类触发，落地即记，不等会话结束）

1. 定了优化方案 / 设计方向（plan/design 敲定，哪怕还没写代码）
2. 完成一项改动 / 功能 / 部署
3. 定了后续发展方向（roadmap、下一步决策）
4. 项目状态 / 结论性认知变化（评估结论、线上状态、阶段判断）

## 条目格式

```
- YYYY-MM-DD HH:MM | 事件一句话 | → 指针（task 目录 / journal #N / commit / 文件路径）
```

- 一行一条，**只写索引不写细节**；细节永远以 task prd.md / journal 为准。
- 指针至少给一个，让后来者能顺藤摸瓜。
- 只留最近 ~100 条，超出删旧（细节不丢，在 `.trellis/tasks/` 与 `workspace/*/journal-*.md`）。
- 追加时撞车了（并行会话同时写）重试即可；条目随正常提交走，不必单独 commit。

---

<!-- 种子条目：从 journal #83-#92 与未提交任务目录回填，日期精度到天 -->

- 2026-11-05 | 私聊记忆白纸修复上线：C2C 发言人绑定 | → journal #75
- 2026-11-07 | 私密域隔离完成设计→实现→部署→验收 | → `tasks/archive/2026-11/11-07-private-domain-isolation` + journal #83
- 2026-11-07 | 15s 自动刷新编辑保护（方案A）落地 | → `tasks/archive/2026-11/11-07-brain-refresh-guard` + journal #81
- 2026-11-08 | MAP.md 项目地图建立（where&how 导航） | → `tasks/archive/2026-11/11-08-project-map` + journal #89
- 2026-11-09 | 导览文档保鲜约定入 AGENTS.md（MAP+README） | → `tasks/archive/2026-11/11-09-map-freshness-rule`、`11-09-readme-freshness-refresh` + journal #90-#91
- 2026-11-09 | 成本一线约定入 AGENTS.md | → `tasks/archive/2026-11/11-09-cost-first-convention` + journal #92
- 2026-11-09 | 进行中未提交：叶瞬光人设包 `tasks/11-07-ye-shunguang-persona`、多人设切换设计 `tasks/11-08-persona-switch-design`、`personas/`、`求职材料/` | → 对应 task 目录 prd.md
- 2026-11-09 | 跨会话广播位约定落地：新增本文件 + AGENTS.md 硬约定（开工先 tail） | → `tasks/archive/2026-11/11-09-cross-session-changes`
- 2026-11-09 | 广播位约定补充：「开工」定义扩到旧会话恢复/跨时段继续，时间戳增量补课 | → `tasks/archive/2026-11/11-09-cross-session-changes`
- 2026-11-09 | 陪伴型 Agent 方向评估：可行，建议 web 1-on-1 先行（library import 内核），定位为简历「第二 deployment」证据而非独立项目 | → tasks/11-09-companion-agent-eval
- 2026-11-09 | 归档大扫除：删空目录、11-04-p2→consolidation-absorb-merge 改名补档、3处年份typo、补4个task.json、7个陈旧进行中任务归档 | → `tasks/archive/2026-11/11-09-archive-hygiene-sweep`
- 2026-11-09 | 记忆架构调研首轮完成：Letta/Mem0/Zep 对照报告，结论=不整体引入、6条思想级借鉴（brain_search主动召回/dreaming重组/双时态/entity boost/图扩散） | → `tasks/archive/2026-11/11-09-memory-persona-arch-research/memory-arch-survey.md`
- 2026-11-09 | 记忆架构调研第二轮完成：人格方案+陪伴产品形态（OpenClaw为最近表亲），合并借鉴清单10条，调研范围全部完成 | → `tasks/archive/2026-11/11-09-memory-persona-arch-research/persona-companion-survey.md`
- 2026-11-09 | 记忆/人格架构调研任务归档（两轮报告+Resolution），journal #95 | → `tasks/archive/2026-11/11-09-memory-persona-arch-research` + commit 56c4ee7
- 2026-11-09 | 迭代升级方案定稿：七迭代路线图 A-G（人设三轨地基→叶瞬光接入→主动召回→prospective memory→储备项→companion壳层→体验层），每迭代带验收+云端数据走查；决策点已列（attitude粒度已定角色级，余4项随方案评审） | → `tasks/11-09-iteration-upgrade-plan/iteration-plan.md`
- 2026-11-09 | 迭代A·人设三轨地基开发完成并部署上线：角色→人设两级、自我轨按 characterId 隔离、批次戳、存量迁移；线上 whale 三人设归并验证通过 | → `tasks/archive/2026-11/11-09-iteration-a-three-track` + journal #96
- 2026-11-09 | 迭代A 走查补修上线：self 三态 API 透传、情绪盖章/蒸馏提示词按批次角色口径、modalPersonaId 并列取较晚、strength 地板幂等、noteChar whale 回落 | → `tasks/archive/2026-11/11-09-iteration-a-three-track` prd 走查补修节
- 2026-11-09 | 迭代A前端补全上线：记忆库新增「角色」「轨道」筛选（审计三轨隔离用），人设下拉同角色多版本标注 ·characterId | → commit 085d828
- 2026-11-09 | 迭代A 走查补修 journal #97 | → `tasks/archive/2026-11/11-09-iteration-a-three-track` prd 走查补修节
- 2026-11-10 | 简历优化版产出：删工作经历换 qqbot-brain 项目，Java 向 bullet 重构 | → `tasks/11-10-resume-optimize` + `~/Documents/简历/Java简历-优化版.md`
- 2026-11-10 | 迭代B·叶瞬光接入上线：种子28条全落自我轨+merge幂等导入+per-persona MOODS（10词表）接线，生产已激活 ye-shunguang 待用户自测 | → `tasks/archive/2026-11/11-09-iteration-b-ye-shunguang` + journal #98
- 2026-11-10 | 流萤人设包产出：`personas/firefly/` 与 ye-shunguang 同构（persona.md+28条种子+生成器+README），多源比对完成未接线 | → `tasks/11-10-firefly-persona/prd.md`
- 2026-11-10 | 流萤人设包走查通过：BrainStore.importData 实测 merge 幂等+分轨+不抢占激活，修订4处表述（娇小/起爆开关歧义/地名） | → `tasks/11-10-firefly-persona/prd.md`
- 2026-11-10 | 流萤人设包内容走查（串味/死板/合适性）：修「开拓者」称呼专属化+荤梗关系例外收紧（露骨不展开），种子不动；机制层三轨隔离复核无串味 | → `tasks/11-10-firefly-persona/prd.md` 内容走查节
- 2026-11-10 | 流萤人设包已导入生产实例：merge 导入 28 种子+人设注册（幂等口径实测一致），ye-shunguang 保持激活未被抢占；导入前已落 ~/backups 预导出 | → `tasks/11-10-firefly-persona/prd.md`
- 2026-11-10 | 人设包走查发现迭代遗留问题集：F1语义巩固产出无self轨继承（迭代A遗留，种子次日即触发或致串味）+F2 manual会话modal单视角致叶瞬光episodic永不巩固；F3 import不补向量+backfill一次性自清（迭代B方法层缺口，firefly 28种子当前0向量）；F4人设包缺AI身份条款 → `tasks/11-10-consolidate-track-gaps`
- 2026-11-11 | 迭代节奏定调：维持串行小步上线（做完→部署→观察窗→修好→下一个），观察窗信号驱动非固定天数；开发可流水线但部署串行，F1-F4 先于迭代C部署 | → `tasks/11-11-iteration-cadence/prd.md`
- 2026-11-11 | AI 驱动开发工作范式成文：AI-WORKFLOW.md 落地仓库根（六原则/质量防线/成本两条线/差距自检+backlog），AGENTS.md 首条指针+MAP.md 三处同步 | → `AI-WORKFLOW.md` + `tasks/11-11-ai-dev-workflow/prd.md`
- 2026-11-11 | 人设包走查遗留问题集 F1-F4 全部修复上线：巩固按角色分批+全自我轨源继承 self、importData 即时补向量+回填常驻自愈、两包补 AI 身份条款并同步生产；firefly 28 种子向量 0→29/29 补齐 | → `tasks/archive/2026-11/11-10-consolidate-track-gaps` + journal
- 2026-11-12 | 陪伴 Agent 架构定位讨论：brain=核心 library（角色由宿主决定）、业务切分=内核护城河+壳层新建、Java 可行但内核不重写（Java 位置=移植 kata） | → `tasks/11-12-companion-arch-java-eval`
