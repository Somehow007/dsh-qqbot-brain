<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## 项目约定

- **问题存档**：每次探讨过的问题都要在 `.trellis/tasks/` 存档——记清楚「遇到了什么问题 / 怎么解决的 / 什么时候干的」。哪怕是纯讨论、没写代码，也要建 task 写 prd.md 留痕。

### 归档流程（两层）

1. **任务档案**：`python3 ./.trellis/scripts/task.py archive <任务名>` 把任务目录移到 `.trellis/tasks/archive/<年-月>/`。归档前在 prd.md 补 `## Resolution（YYYY-MM-DD）` 段，按用户要求覆盖四块：**遇到了什么问题 / 怎么解决的 / 后续优化方向 / 什么时候干的**，外加 Key Decisions 与验证结论。若任务直接在 main 上做（无 PR），archive 需加 `--skip-branch-validation`。
2. **会话日志**：`python3 ./.trellis/scripts/add_session.py --title "<标题>" --commit <hash或-> --summary "<摘要>"` 追加到 `.trellis/workspace/<dev>/journal-N.md`（摘要含问题→排查→方案→验证→后续的完整一段），并自动更新 index.md、auto-commit journal 文件。无提交产出时 `--commit -`。

完成后向用户说明两层落点的区别（archive=任务级细节，journal=时间线索引）。
