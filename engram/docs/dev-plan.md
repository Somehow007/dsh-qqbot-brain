# engram 开发计划

> 2026-11-19 立项。设计依据：根任务 `.trellis/tasks/11-12-companion-mvp-design/`（design.md/implement.md/prd.md）。
> engram 治理独立（本目录 .trellis/），与根项目任务体系并行——跨项目事项（如内核缺能力）回根 `.trellis/tasks/` 立项。

## 定位

brain 内核第二 deployment：Web 1-on-1 自用陪伴，单 persona（流萤），记忆可观测为差异化。dogfooding 优先，朋友/网友后置。

## Slice 1 — Reactive MVP（当前）

| 项 | 状态 | 说明 |
|---|---|---|
| 代码骨架（config/brain shim/persona/chat/web/main） | ✅ 完成 | 21 tests 绿，typecheck 净 |
| persona.md 群聊→私聊适配 | ⬜ 待做 | personas/firefly/ 双语境改写 + `generate_seed.py` 重出 seed |
| 本地真实对话验证 | ⬜ 待做 | 需 API key 跑几轮，看声口/记忆命中 |
| 生产部署 | ⬜ 待做 | docs/deploy.md runbook；engram.service + ~/engram-data/ |
| 验收 ACC-E01~E04 | ⬜ 待做 | 见 .trellis/acceptance.md |

## Slice 2 — Proactive + brain_search

| 项 | 状态 | 说明 |
|---|---|---|
| 主动开口机制 | ✅ 已实现默认关 | intent 消费+定时问候+预算闸门+via:'agent' |
| brain_search tool | ✅ 已实现默认关 | topK≤5 注入，loop≤2 轮 |
| 声口基线观察窗 | ⬜ | slice1 上线后跑稳再开（PROACTIVE_ENABLED=1 / TOOLS_BRAIN_SEARCH=1） |
| 主动开口质量验收 | ⬜ | ACC-E05：fired→回复采纳率、「别发」率 |

## 穿插项（信号驱动，不排期）

- SSE 已就绪；流式回复留缝未做（设计 Out of Scope）
- 多 persona 切换 UI（内核 activatePersona 现成，壳层不做）
- 渠道扩展（QQ/TG）：chat loop 已渠道无关，接入=新增 delivery 适配器
- Java 移植 kata：项目稳定后模块级练习（retrieval.ts→decay.ts），不重写内核

## 依赖与风险

- **内核零改动**是前提：缺能力→回根项目提需求，不在 engram 里 hack 内核。
- `importData merge` 对 personas[] 更新语义已按 setPersona 兜底；persona.md 实际编辑效果需 dogfooding 验证。
- 无 TLS 为已接受风险（口令强度兜底）；单 session 增长有界设计兜底。

## 验收节奏

每 slice 走「实现→typecheck/test→本地冒烟→（生产）部署→acceptance 台账逐项走查→归档」。代码验收=提交即关；实证验收=台账跨任务存活。
