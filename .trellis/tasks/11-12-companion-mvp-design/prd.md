# 陪伴 Agent 壳层 MVP 设计（迭代F）→ engram

## Goal

产出并落地 companion 壳层 MVP：`engram/` 独立项目目录，brain 内核第二 deployment，Web 1-on-1 自用陪伴（流萤人设），记忆可观测为差异化。**设计已定稿并获批开工**；实现按 implement.md 分 Phase 推进。

## 背景与已确认事实（源码核对）

### 内核可复用面（零重写）

- `Brain` 门面：`assemble(sessionId, query, speaker?, queryVec?) → BrainContext`（persona/emotion/digest/clock/memoryLines/attitudeLines/deepRecallLines/hits）、`ingest(sessionId, Turn) → IntentEntry[]`（返回 fired intents——源码注释明写给 companion 壳层消费，index.ts:379）、`endOfTurn`、`search`（迭代C 纯召回原语）、`tickIntents`、intents CRUD、`importData(merge|replace)`（personas[]+activePersonaId 生效；merge 对已存在 entry 跳过更新 store.ts:1259）、personas CRUD/activate、`boundSpeaker(Nick)`、`queryEmbedding`/`backfillEmbeddings`/`consolidate`/`sessionsNeedingConsolidation`/`preview`/`graph`/`exportData`/`flush`/`migrateTracks`/`absorbCovered`
- `BrainStore`/`Distiller`/`Embedder` 构造即用（fetch 可注入、AbortController+timeout、失败静默——distill.ts 模式）；`BrainHttpServer` 含 page.html 三皮肤+D-admin，`start(undefined)` 独立端口回退
- `setup/persona-file.ts`（persona.md 读写）、`setup/file-log.ts` 可复用；`setup/persona-loader.ts` 是 dsh 专属不需要
- Turn.via provenance：'user'/'agent'/'system'；agent/system 批次蒸馏跳过、event intent 不匹配、boundSpeaker 不补发言人——proactive 记忆零污染全靠壳层标对 via

### 壳层新建（design.md §3 已定模块划分）

- chat loop / history / llm client / prompt 九段 / web server+chat.html / persona 装载 / timers / proactive+tools（slice2）
- brain 引用：`engram/src/brain.ts` shim 直引 `dsh-qqbot-brain/src/**.ts` 源码，Node 24 type stripping 零构建（brain 测试已同路径直跑 .ts，erasable syntax 已验证）

### 人设包现状

- `personas/firefly/` 选定（D1）：persona.md 已含全部声口修复（此刻感/心理活动不出口/tender 示例），残留群聊语境待双语境改写（群聊与称呼节+~6 条群友情境+身份行）
- seed-export.json 已旧（有「此刻和日常」、无 E1+E2）——改完 persona.md 跑 `generate_seed.py` 重出（生成器读 persona.md，workflow 本就如此）
- 种子 `sessionId='manual'` 全局域、28 条、uuid5 确定性 id、personaId='firefly'、moods 10 词表
- 单用户=开拓者：火萤种子 attitude 全部写给开拓者，关系设定零迁移

### 排期事实（更新）

- C（Brain.search）11-12 上线、D（intents+provenance）11-14 上线 ACC-06 实证通过 → **F 前置全部就绪**，prd 原「F-basic vs C→D→F」二选一消解为**单案两 slice**（design §11）

## Requirements（design.md/implement.md 已覆盖）

- R1 壳层架构与 brain 引用方式 → design §2-3（sibling 目录 + src 直引 + shim）
- R2 chat loop 与成本纪律 → design §4-5（~6-9k tok/轮、history≤8k chars、usage 透出）
- R3 persona 方案 → design §6（流萤+双语境改写+setPersona 同步+幂等灌入）
- R4 主动开口 → design §7（中档已拍板：maxPerDay=4/quietHours 23-8/minInterval 120min）
- R5 brain_search tool → design §8（默认关，≤2 轮 tool loop）
- R6 陪伴质量 eval → design §10（命中率/采纳率/持续性/成本+主观走查）
- R7 排期 → design §11（单案两 slice）
- R8 部署形态 → design §9（双端口+反代+systemd+env+备份）
- R9 MVP 边界 → design §1（In/Out 清单）

## Acceptance Criteria

- [x] design.md 覆盖 R1-R9 全部条目（§13 核对表）
- [x] 排期单案两 slice 可执行（前置已就绪）
- [x] 模块依赖与复用/移植清单明确（design §2）
- [x] 成本评估有数（design §4/§12）
- [x] 无未决用户决策（见下）

## Out of Scope

实现完美度、部署实操、C/D 迭代本身、Java 移植、QQ/TG 渠道、TLS、多 persona UI、流式回复

## 已定决策

| # | 决策 | 结论 | 时间 |
|---|---|---|---|
| D1 | persona 选型 | 流萤 `personas/firefly/` | 11-12 |
| D2 | 项目命名 | **engram**（记忆印迹；中性物种名不绑人设） | 11-19 |
| D3 | 仓库形态 | `engram/` 与插件平级 sibling（package.json dsh.bundle 身份+架构诚实性+零依赖隔离） | 11-19 |
| D4 | brain 引用 | src 直引 + Node type stripping 零构建（单文件 shim） | 11-19 |
| D5 | 排期 | 单案两 slice（C/D 已上线，旧二选一消解） | 11-19 |
| D6 | 主动程度 | **中档**：intent+每日问候+心情关心，maxPerDay=4 | 11-19 |
| D7 | chat 模型 | 默认与 distill 同档 DeepSeek 兼容（deepseek-chat），config 可换 | 11-19（设计默认，评审可否决） |
| D8 | 用户标识 | USER_NICK 默认「开拓者」 | 11-19（设计默认） |

## Open Questions

无阻塞项。全部决策已锁定（D1-D8）。

## Resolution（2026-11-19）

- **遇到了什么问题**：companion 壳层 MVP 需要设计定稿——模块划分、persona 适配、主动开口机制、排期、部署形态全部待定；prd 起草后 C/D 上线、声口修复落地、命名确定，设计前提被更新事实改变
- **怎么解决的**：源码级证据核查（Brain API/store op/importData/prompt 注入/http server/intent provenance）→ design.md 全量设计 → 用户评审通过 → implement.md 分 Phase → 本会话直接开工初始化 engram/ 项目（含独立 Trellis 治理）
- **关键验证结论**：`ingest()` 返回 fired intents 是内核为 companion 预留的消费面；`via:'agent'` provenance 使主动消息零记忆污染无需内核改动；`setPersona` 在 activeId 下同步活跃卡文本使 persona.md 成为双侧唯一事实源；`importData merge` 不更新已存在 personas[]（store.ts:1259）已用 setPersona 绕过
- **后续优化方向**：persona.md 1-on-1 适配改写质量依赖 dogfooding 迭代；slice2 主动开口中档参数起步可调；brain 若出现第三消费方或开源决定再评估抽 `brain/` 独立包
- **什么时候干的**：2026-11-19 设计定稿+开工初始化
