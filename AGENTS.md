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
- **导览文档保鲜**：`MAP.md`（where & how 导航）与 `README.md`（what & why 门面）都不能过时——更新项目、添加功能、大幅改动时都要想一下是否要同步：
  - MAP：新目录/新入口/新机制层/命令或部署方式变化 → 必改；
  - README：痛点/解法新增、机制层变化、实测数字或阶段结论过期 → 必改。README 按需求漏斗组织（定位 → 痛点解法映射 → 机制 → 证据 → 阶段 → 上手），易腐数字/结论集中在「实测效果/当前阶段」并注明评估时点；
  - 两份都不复述实现细节（以源文件为准）。动手前用 MAP 定位，归档 task 前顺手核对两份文档。
- **成本一线**：AI 服务按 token 计费，成本是设计约束不是事后指标。新增 LLM 调用 / 注入 section / 记忆或画像字段时先过成本评估：输入有界（截断/配额/攒批）、前缀缓存友好（稳定段在前、易变段贴尾）、可配置关闭、失败静默不阻塞回复；成本实测数字随评估刷新进 README「成本透明」，长期增长项要能建模说明不发散（范式见 `archive/2026-11/11-03-cost-growth-analysis`）。
- **线上数据在哪**：生产数据全在腾讯云 `ubuntu@124.222.65.169`（SSH 直连，无别名），本仓库不含真实数据。
  - 插件目录 `~/dsh-qqbot-brain/`——部署 = 本地 `npm run build` 后 `rsync` `dist`（不带尾斜杠）+`package.json` 上去（不动远端 `cordis.patch.yml`），`sudo systemctl restart dsh-qqbot` 生效；服务器 dsh/node 在 `PATH=/opt/node-v24/bin`。
  - 脑数据目录 `~/brain-data/`（BRAIN_DATA_DIR：persona.md、op 流水、brain.log）；宿主会话原文 `~/.dsh/sessions/**/session.v4.jsonl.zstd`，QQ key→sessionId 映射 `~/.dsh-qqbot/model-prefs.json`。
  - 脑图公网直连 `http://124.222.65.169:4099/brain?token=<口令>`；口令/密钥在服务器 `~/dsh-qqbot-brain/cordis.patch.yml` 与 `~/.dsh/brain.env`（600），不落 git。
  - 备份：服务器 `~/backups/*.tgz`（部署前插件+数据成对备份）+ 每日 cron + 本地 `brain-data/*.json`（`/brain/api/export` 落盘，gitignored）。
  - 细节见 `dsh-qqbot-brain/README.md`「部署 runbook」与 `docs/brain-backup-restore.md`；历次线上操作存档搜 `.trellis/tasks/archive/` 里的 `124.222`。

### 归档流程（两层）

1. **任务档案**：`python3 ./.trellis/scripts/task.py archive <任务名>` 把任务目录移到 `.trellis/tasks/archive/<年-月>/`。归档前在 prd.md 补 `## Resolution（YYYY-MM-DD）` 段，按用户要求覆盖四块：**遇到了什么问题 / 怎么解决的 / 后续优化方向 / 什么时候干的**，外加 Key Decisions 与验证结论。若任务直接在 main 上做（无 PR），archive 需加 `--skip-branch-validation`。
2. **会话日志**：`python3 ./.trellis/scripts/add_session.py --title "<标题>" --commit <hash或-> --summary "<摘要>"` 追加到 `.trellis/workspace/<dev>/journal-N.md`（摘要含问题→排查→方案→验证→后续的完整一段），并自动更新 index.md、auto-commit journal 文件。无提交产出时 `--commit -`。

完成后向用户说明两层落点的区别（archive=任务级细节，journal=时间线索引）。
