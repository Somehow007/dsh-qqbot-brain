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
