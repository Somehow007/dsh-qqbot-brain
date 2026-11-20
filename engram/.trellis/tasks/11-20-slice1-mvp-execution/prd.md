# Slice1 MVP 执行：persona 私聊化 + 本地验证 + 部署 + dogfood 启动

## 背景

承接 `11-20-mvp-review-acceptance` 遗留（F10）：slice1 代码骨架已完成（21 tests 绿），剩余 = persona 双语境改写 → seed 重出 → 本地真实对话验证 → 生产部署 → ACC-E01~E08 实证走查。Slice1 门槛 = E01~E04+E06~E08 全过且 dogfooding ≥1 周（acceptance.md §四.6）。

设计依据：根任务 `.trellis/tasks/11-12-companion-mvp-design/design.md` §6（persona 方案）+ `implement.md` Phase 1-4。

## 工作项

- [x] `personas/firefly/persona.md` 群聊→私聊改写（design §6 清单：身份行/「群聊与称呼」整节→「私聊与称呼」/~6 条群友情境参考）
- [x] `python3 personas/firefly/generate_seed.py` 重出 seed-export.json（persona 文本内嵌于导出，必跑）
- [x] `npm run typecheck && npm test` 绿
- [x] 本地真实对话验证：temp `ENGRAM_DATA_DIR` + `DEEPSEEK_API_KEY` 跑几轮，核声口/记忆命中/usage（embedding 本地无 key 时 lexical 回退可接受）
- [x] 生产部署：rsync 三目录平级布局 + `~/.engram/engram.env` + `engram.service` + 冒烟（deploy.md runbook）
- [ ] 验收走查：E01 部署自举+鉴权边界、E04 重启持久化、E06 数据隔离、E07 persona 双侧生效当日可实证；E02 声口/记忆命中、E08 成本基线随 dogfooding 累计
- [ ] dev-plan.md 状态同步 + CHANGES 广播（engram+根）

## 已知风险/边界

- **共享包语境漂移**：`personas/firefly/` 是根仓共享 persona 包，改成私聊版后，未来若有人把它重新 import 进 dsh 群聊实例会拿到私聊口径——dsh 生产已导入的群聊版 persona 卡不受影响（存于 `~/brain-data`），git 历史可回退；pack README 补一条语境说明。
- **embedding**：本地无 `BRAIN_EMBED_API_KEY` → 本地验证走 lexical；生产 env 需配（deploy.md 模板已列）。
- **dogfooding ≥1 周**：本任务不归档，台账项跨任务存活；E02/E08 样本随使用累计。

## Acceptance Criteria

- [x] persona.md 私聊版落地 + seed 重出 + 测试绿
- [x] 本地真实对话跑通（声口像流萤、usage 在 6-9k 档）
- [x] 生产部署完成 + E01/E04/E06/E07 实证记录进 acceptance.md
- [ ] dev-plan Slice1 状态更新 + CHANGES 广播

## Out of Scope

slice2（proactive/tools 开启）、渠道扩展、多 persona UI、F5 tool loop 改造

## Resolution

（待填）
