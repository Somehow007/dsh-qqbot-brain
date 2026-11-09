# 跨会话鲜活性约定：CHANGES.md 广播位

## Goal

多会话并行开发同一项目时，让任意会话能实时感知其他会话的变动（定了方案 / 完成改动 / 定了方向 / 项目状态变化），保证每个会话开工时的认知是新鲜的——不同会话负责的模块/功能区域可能不同，但必须知道彼此动了什么。

## 背景与问题

现有留痕机制（task 归档 + journal + index.md 会话表）都是**会话结束才落笔**：

- `add_session.py` 在 finish-work 阶段才写 journal/index——并行会话 A 进行中时，会话 B 看不到 A 已经定了方案或改了代码；
- `get_context.py` 只给 git status / 近 5 条 commit / 任务列表，不含「别的会话最近干了什么」的语义层；
- 最关键的缺口：**没有任何约定要求会话开工时主动去扫一眼别人干了什么**。index.md 会话表客观上是个 changelog，但读侧无约定 = 形同虚设。

## Requirements

- **广播位**：新增 `.trellis/CHANGES.md`，追加式一行一条，四类事件落地即记：
  1. 定了优化方案/设计方向（plan/design 敲定，哪怕还没写代码）
  2. 完成一项改动/功能/部署
  3. 定了后续发展方向（roadmap、下一步决策）
  4. 项目状态/结论性认知变化（评估结论、线上状态、阶段判断）
- 条目格式：`- YYYY-MM-DD HH:MM | 事件一句话 | → 指针（task 目录 / journal session 号 / commit）`；只写索引不写细节，细节永远以 task prd/journal 为准。
- **读侧硬约定**：每个会话开工（接到第一个实际需求）前先 `tail -30 .trellis/CHANGES.md`，扫到自己不掌握的条目就顺指针读对应档案，再动手。
- 有界：文件只留最近 ~100 条，超出删旧（细节不丢，在 task/journal/index.md）。
- 不替代现有机制：「问题存档」「归档两层流程」「journal」照旧，CHANGES.md 只是广播位/目录。
- 同 checkout 并行会话文件即时可见；条目随正常提交走，跨分支合并后也有痕。

## Acceptance Criteria

- [x] `.trellis/CHANGES.md` 存在，有格式说明头 + 种子条目（最近几次 session 回填）
- [x] AGENTS.md「项目约定」新增硬约定条款（写侧四类触发 + 读侧 tail 扫描）
- [x] MAP.md 同步新入口（意图表 + 档案层表）
- [x] 本任务自身成为 CHANGES.md 的第一条实战条目（dogfood）

## Notes

- 评估时点 2026-11-09：当时 92 个 session 全部单开发者（sunhao）、同 checkout、main 分支直推；并行会话是同机同目录的多个 AI 会话，文件级改动天然即时可见，缺的只是「去哪看」的约定。
- 若未来上 worktree/多分支并行，CHANGES.md 靠提交合并传播，读侧约定不变。
