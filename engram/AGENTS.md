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

## 项目约定（engram）

- **定位**：brain 内核（`../dsh-qqbot-brain/src/brain/`）的第二个 deployment——同一份源码、平级兄弟目录、零构建（Node ≥22.18 type stripping 直跑 `.ts`）。engram 是独立项目不是插件功能。
- **动手前必读**：`.trellis/spec/backend/` 七篇契约（brain-integration / chat-loop / cost-config / web-server / proactive / testing / deployment）——它们是从 `src/` 现状提炼的硬约束，不是建议。
- **不可违反**：① 主动消息 `Turn{userText:'',via:'agent'}`；② LLM 失败轮不写 Turn；③ chat 串行化不并行；④ 内核 API 只从 `src/brain.ts` shim 取；⑤ 零运行时依赖；⑥ 兄弟布局 `engram/`‖`dsh-qqbot-brain/` 不可拆。
- **成本一线**：新增 LLM 调用/注入段先评估（有界/缓存友好/可关/失败静默）；默认值=生产安全值（贵的默认关）。
- **验证**：`npm run typecheck && npm test` 必过；改不变量要配测试；部署后按 `.trellis/acceptance.md` 走查。
- **跨会话广播位**：`.trellis/CHANGES.md`——`python3 scripts/changes.py add "<事件>" "<指针>"`（cwd=engram/）。新会话全文读、恢复会话增量读；只管 engram 事件，内核/根项目事件看根 `.trellis/CHANGES.md`。
- **治理**：任务在 `.trellis/tasks/`；实证验收登记 `.trellis/acceptance.md`；计划 `docs/dev-plan.md`；部署 `docs/deploy.md`；导航 `MAP.md`；收工 journal 用 `.trellis/scripts/add_session.py`（cwd=engram/）。
- **跨项目事项**（内核缺能力/根仓库 personas 改动）回根 `.trellis/tasks/` 立项，不在 engram 里 hack 内核或复制代码。
