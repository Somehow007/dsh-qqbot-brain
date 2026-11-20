# engram 开发计划

> 2026-11-19 立项。设计依据：根任务 `.trellis/tasks/11-12-companion-mvp-design/`（design.md/implement.md/prd.md）。
> engram 治理独立（本目录 .trellis/），与根项目任务体系并行——跨项目事项（如内核缺能力）回根 `.trellis/tasks/` 立项。

## 定位

brain 内核第二 deployment：Web 1-on-1 自用陪伴，单 persona（流萤），记忆可观测为差异化。dogfooding 优先，朋友/网友后置。

## Slice 1 — Reactive MVP（当前）

| 项 | 状态 | 说明 |
|---|---|---|
| 代码骨架（config/brain shim/persona/chat/web/main） | ✅ 完成 | 21 tests 绿，typecheck 净 |
| persona.md 群聊→私聊适配 | ✅ 完成 | personas/firefly/ 双语境改写（群聊语境清除）+ seed 重出；pack README 已注明勿回灌群聊实例 |
| 本地真实对话验证 | ✅ 完成 | 2026-11-20：temp dataDir + DeepSeek 冒烟 6 轮——声口/此刻感/情境参考/记忆命中（hits 1-6）/蒸馏（情绪+画像）全过，usage ~4.1-4.6k/轮 |
| 生产部署 | ✅ 完成 | 2026-11-20：engram.service active，:4100 chat + :4101 brain；种子+28/persona.md 自举/向量 on/蒸馏 on；公网访问待安全组放行 4100（当前走 SSH tunnel dogfood） |
| 验收 ACC-E01~E04 + E06~E08 | 🔄 进行中 | E01/E04/E06/E07 已通过；E03 失败轮半项通过（proactive 半项随 slice2）；E02/E08 观察中（dogfooding ≥1 周 + ≥20 样本） |

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
