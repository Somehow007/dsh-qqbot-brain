# README 半月刷新（11-03 → 11-18）

## Goal

上次 README 数据刷新在 11-03，此后 15 天落了 ~225 commits（迭代 A–E6、UI 重构、声口工程、管理端移动端、验收登记处实证走查）。本次同步 README 到当前真实状态。

## 变更点

- **计数**：单测 167(badge)/199(正文) → 276/276（实跑 `npm test` 验证）；commits ~237 → ~360；session 90 → 93
- **痛点表 +1 行**：AI 腔/说明文腔 → 声口工程解法（情境示例 + channelStyle + 此刻感 + 表态公式）
- **当前阶段**：阶段描述改「迭代 A–E6 + 管理端 UI 重构落地，多角色陪伴实战中」；checklist 补管理端移动端适配、私聊声口工程两条；验收登记处 ACC-01~11 → ACC-01~12（ACC-03/06 已通过）
- **下一步候选**：新增声口工程·N1 探讨项；迭代E 条目更新（E6+回填闭环、companion 设计已立项）；编号顺延
- **诚实清单**：emb 噪声条目补 ACC-08 定性（话题相邻注入阈值不可分，迭代级遗留）

## 依据来源

- `.trellis/CHANGES.md` 11-15~11-17 部署记录（声口四轮、管理端移动端、走查结论）
- `.trellis/acceptance.md` 当前台账（12 实证项 + 5 观察项）
- `tasks/11-09-iteration-upgrade-plan/iteration-plan.md` 进度锚点表（A–D 完成、E 储备、F 另立任务）
- `git rev-list --count` 360、journal 93 session、`npm test` 276/276 实测

## Acceptance Criteria

- [x] README 无 167/199/237/90-session 旧数字残留
- [x] 新增内容均可回溯到 CHANGES/acceptance/task 档案
- [x] 未提交的他人改动（distill.ts 脱敏、役所素材/、进行中任务目录）不被卷入

## Resolution（2026-11-18）

### 遇到了什么问题

README 距上次刷新 15 天，期间迭代 A–E6 全部落地、UI 重构 P1–P3 上线、声口工程四轮修复、管理端移动端适配、验收登记处建立并跑过两轮走查——README 停留在 11-03 数据刷新后的状态，多个关键进展未入文。

### 怎么解决的

按 CHANGES.md 事件流 + acceptance.md 台账 + iteration-plan 进度锚点三源交叉核对，把 11-16 之后的实质落地（声口工程、管理端移动端）补进 checklist，把实证验收机制的进展（ACC-03/06 通过）写实，把声口工程作为新痛点行入表，计数全面刷新。

### 后续优化方向

- 声口工程 N1（推理层顾问模式）待用户拍板——若确认是根因，可能需要宿主侧 reasoningEffort 配置探索
- companion 壳层 MVP 设计（迭代F）已立项待开工，落地后 README 需要新增「多宿主」叙事
- 计数类字段建议在里程碑（迭代归档/部署批次）时统一刷新

### 什么时候干的

2026-11-18。

### Key Decisions

- 声口工程单列痛点行而非并入「人格漂移」——它是独立的可观测失败模式（AI 腔/说明文腔），有独立的修复方法论（声口示例 + channelStyle 条款）
- 验收登记处进展写「在册数 + 已通过数」而非逐项罗列——台账细节留在 acceptance.md
- distill.ts 未提交改动（prompt 例子脱敏 花咲蝶舞→demo）不纳入本次提交，属他人在途工作

### 验证结论

`npm test` 276/276 绿；`git rev-list --count` 360；journal 93 session；grep 确认 README 无旧计数残留；diff 仅含预期 README 改动。
