# 归档大扫除（archive hygiene sweep）

## Goal

清理 `.trellis` 归档信息中的重复、冗杂、无用处：通读全部 68 份归档 prd + 14 个进行中任务，修复坏档、关闭失真状态、标注过期内容。

## 体检结论（2026-11-09）

归档整体质量高，真问题集中在四类：

1. **空目录垃圾**：`tasks/11-08-11-08-framework-vs-selfbuild`（与 archive 中同名任务重复且为空）。
2. **坏档**：`archive/2026-11/11-04-p2` 无标题、目录名为占位符（实为 commit `567529f` 巩固增强的存档）；`llm-token-audit`/`brain-refresh-guard`/`brain-scroll-zoom` 三处 Resolution 年份误写 2025；`dedup-sweep`/`backend-relations`/`readme-refresh`/`p2` 四档缺 `task.json`。
3. **过期未标**：`11-01-11-01-cloud-mem-check` 内存数字为当日快照、演示方案已被 `11-02-brain-public-access` 取代。
4. **进行中列表失真**：7 个任务已完成/被取代但仍挂 in_progress/planning：`00-bootstrap-guidelines`、`10-30-brain-ui-polish`（被 cortex 链取代）、`10-30-first-round-deploy-prep`、`10-30-persona-attitude`、`11-02-emotion-bucket-coverage-eval`、`11-04-memory-kind-boundary`、`11-07-host-brain-audit`。

## 已评估但决策「不动」的项

- **README 更新链 5 份**（redesign→refresh→images→data-refresh→freshness-refresh）：同题多档但各自是独立事件的合法存档；后四份的「过期-刷新」轨迹本身就是催生 11-09 保鲜约定的证据，删了反而丢决策史。保留。
- **低残留项**：`cloud-mem-check` 保留并加时点标注；`brain-ui-abyss` 已自我标注被取代，保留作 UI 演进史。
- **prd 内部冗余**（Resolution 复述正文 ~30-40%）：属约定格式要求的留痕粒度，逐份瘦身损失取证细节，不动。
- **MAP.md**：档案导航职责已被其「按目录名搜主题」覆盖，不另建 INDEX。

## Resolution（2026-11-09）

### 遇到了什么问题

`.trellis` 归档层积累的重复/冗杂/无用信息需要一次大扫除；用户授权按工程规范自行处置。

### 怎么解决的

- 删除空目录 `tasks/11-08-11-08-framework-vs-selfbuild`。
- `11-04-p2` → `git mv` 改名 `11-04-consolidation-absorb-merge`，补标题/Goal/task.json。
- 3 处年份 typo（2025→2026）修正。
- 补 4 个 `task.json` 桩（meta 标记 `taskJsonBackfilled`）。
- `cloud-mem-check` prd 头部加时点快照+被取代标注。
- 7 个陈旧进行中任务逐个补「Resolution（2026-11-09 补录）」后 `task.py archive --no-commit --skip-branch-validation` 归档至 `archive/2026-11/`。

### 后续优化方向

- 新写 prd 时注意 Resolution 不复述正文的纪律（约定只要求覆盖四块，不要求重复）。
- 进行中任务完成时随手归档，避免再次积累失真。
- 若归档目录继续膨胀到导航困难，再考虑按主题建 INDEX（目前 MAP.md 的意图路由仍够用）。

### 什么时候干的

2026-11-09 单会话完成：通读 68 份归档 prd + 14 进行中任务 → 体检分类 → 用户授权 → 执行修复与归档。

### 验证结论

- `find .trellis/tasks -type d -empty` 无残留空目录；归档目录全部含 prd.md + task.json（本次补齐后）。
- `task.py archive` 7 次全部成功，进行中列表只剩真实活跃任务。
- 引用检查：`11-04-p2` 旧名无外部引用，改名安全。
