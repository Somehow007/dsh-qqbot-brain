# 陪伴 Agent 架构定位与 Java 可行性讨论

## 问题存档

- **时间**：2026-11-12
- **用户提问**：做成跑在云服务器上的陪伴型 Agent 后，当前 brain 项目应作为什么模块插入——插件还是核心模块？业务角度怎么设计？用 Java 是否可行（用户技术栈是 Java，能更容易看懂项目，网上学习的项目也是 Java）？
- **前置档案**：`tasks/11-09-companion-agent-eval/prd.md`（方向评估已收敛：standalone companion = brain 内核第二 deployment，web 1-on-1 先行，dogfooding 保证真实使用）、`archive/2026-11/11-03-brain-roadmap-beyond-dsh`（lib > HTTP sidecar > MCP 价值排序）

## 已确认事实（源码核对）

- `src/brain/` ~3,665 行 TS，**零运行时依赖**（package.json 仅 typescript devDep）
- Node API 面仅限 `store.ts` 的 `node:fs/path/crypto` 同步文件操作
- LLM/embedding 全走**可注入 fetch** 的 OpenAI 兼容接口（`distill.ts`/`embed.ts`），无 SDK 绑定
- 零 Cordis/ctx 引用；插件性只存在于装配层（`src/index.ts` + `inject/prompt.ts` + `capture/events.ts` + `server/http.ts`）
- 测试资产：153 单测 + `test/eval/` 44 条真实记忆检索评测集，可作移植 oracle

## 结论一：brain 在 companion 中是核心模块（library），不是插件

**这不是新决定，是代码现状。** 同一份 `src/brain/`：

- 在 dsh 部署里被 Cordis 插件 import → 角色是「插件」
- 在 companion 部署里被壳层 import → 角色是「核心模块」

**角色由宿主决定，不由代码决定**——这正是「宿主无关内核」从口号变 fact 的方式，是本项目最强架构叙事。

为什么必须是核心模块：companion 产品定义 = 「记忆可观测的陪伴」，记忆是产品本体不是可选扩展；插件语义（可选扩展点+宿主生命周期）在此不适用。单进程应用不需要插件系统，需要 library。

仓库形态：保持现仓库，新增 `companion/` 目录经 file/workspace 依赖引用 `src/brain`——**不复制代码、不合并**（合并会让 dsh 插件失去内核来源）。公开时再拆仓库。

## 结论二：业务视角设计（非商业产品：学习载体 + 简历证据 + 每日自用）

能力地图：记忆生命周期/人格三轨/情绪/脑图可观测 = 内核已有零重写；**新建量集中在壳层**——chat loop + session 管理 + 主动开口（companion 原生能力，dsh 侧因需宿主 intent 权限反而难做，standalone 自有发送路径更容易）+ web 渠道 + per-turn 成本账本。

五条设计原则：

1. **单用户假设到底**：不做多租户/账号/复杂鉴权；群聊多发言人能力闲置但保留
2. **记忆质量 > 对话 UI**：迭代资源投记忆 eval 与主动开口策略，不投聊天页美化
3. **可观测即产品**：脑图/ops 流水是卖点非内部工具；低成本增强 = assemble 时 retrieve 命中透传成「这条回复用了哪些记忆」trace 视图
4. **成本一线照旧**：单轮成本可报数是 portfolio 卖点；蒸馏攒批/闲时跑
5. **persona 是内容包**：人设切换沿用三轨架构，companion 只需 persona 选择器，不需新机制

MVP 边界（承接上轮评估）：web 1-on-1 + 单 persona + 主动开口 cron + 脑图页复用；channel 接口留缝不实现。

## 结论三：Java 可行但不建议重写内核

**技术可行性：完全可行。** 逐块映射：持久化（JSONL+快照）/检索（n-gram TF-IDF+余弦，158 行）/衰减（17 行）/LLM 调用（OpenAI 兼容 HTTP）全部平凡对应；唯一语义密度高的是 `distill.ts`（465 行 prompt+解析+画像二审+幻觉校验）；153 单测 + 44 条评测集可当 oracle。

**不建议重写的四条理由（按重要性）：**

1. **价值在决策不在代码**：每条 spec 约定都是踩过的坑（MAP 原话），重写 = 重踩坑或靠测试兜行为漂移
2. **内核是移动靶**：迭代 C–G 未做，移植期内核每次改动需双份实现，第二维护面无限期放大
3. **破坏核心叙事**：简历支点是「同一内核两 deployment」；Java 版是第二个内核，「宿主无关」claim 消失
4. **延迟真正目标**：TS 壳层天级 vs Java 移植周级+，而目标是尽快有每天用的 companion

**「看不懂」顾虑被高估**：内核零依赖+中文注释+`types.ts` 即文档；作者（AI 结对）理解的是设计不是语法；该项目 TS 无装饰器/元编程/复杂泛型，门槛约等于零；壳层是新代码，只需读 assemble/ingest/endOfTurn 三个签名。

**Java 的正确位置**：

- ❌ 重写 brain 内核
- ❌ Java 壳 + Node sidecar 调 brain HTTP（MVP 多一跳不值；HTTP 端点本就是 roadmap 降级形态）
- ✅ **学习性移植 kata**：挑 retrieval.ts/decay.ts 用 Java 重写，拿 eval 集验证等价性——零生产风险，还能成面试谈资
- ✅ Java 职业目标由现有路径服务：简历已将 TS 项目写成 Java 视角 bullet；系统设计能力比语言更打动 Java 面试官

## 追问：推进顺序确认（2026-11-12 同日）

**用户提问**：后续推进 = 先设计 MVP（Java 复写留到项目成型稳定再做学习性复写）→ 把套壳层做好 → 最后做完迭代各项和观察窗 → 最后完整设计移植、开发 Agent？

**修正点**：

1. 「套壳层」不是排在迭代之前——它就是迭代 F（`11-09-iteration-upgrade-plan` §7），且 **C/D 是其前置**（`Brain.search` 原语 + intents/provenance）；尤其 D 的 provenance 不落地，bot 主动消息会被当用户事实蒸馏污染记忆。
2. Java 复写不需要「完整移植设计」——学习目的下是模块级 kata（retrieval→decay→…），拿 eval 集验证等价性；完整移植设计只在真做第二内核时才需要（已否决）。
3. 修正后顺序：MVP 设计 → C → D → F → E/G 穿插（信号驱动）→ Java kata 最后。

**岔路与用户拍板**：F 是否分期（F-basic reactive chat 零内核前置可先行 dogfooding，C/D 落地后补 brain_search tool + 主动开口）vs 按路线图 C→D→F 整体？
**用户选择**：**先只做设计，排期后定**——MVP 设计任务把两种排期都写进 design.md，等 C/D 估时更清楚后再定 F 开工点。

## Resolution（2026-11-12）

- **遇到的问题**：companion agent 落地前的架构定位三连问——brain 是插件还是核心模块、业务上怎么切模块、要不要为 Java 技术栈重写
- **怎么解决的**：纯讨论评估，无代码改动。结论：brain 在 companion 中是核心 library（角色由宿主决定，同一代码两 deployment）；业务上记忆内核=护城河、壳层=会话+主动开口+web 渠道、单用户假设到底、可观测即产品；Java 完全可行但内核不重写（价值在决策/移动靶/叙事支点/时间成本四条理由），Java 成分的正确位置是学习性移植 kata 而非生产代码
- **后续优化方向**：若启动 companion MVP，另建实现任务细化壳层结构/persona 选型/主动开口策略/陪伴质量 eval（承接 `11-09-companion-agent-eval` 的后续约定）；Java kata 可作独立小练习
- **什么时候干的**：2026-11-12，纯讨论存档

## Key Decisions

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| brain 在 companion 中的角色 | 核心模块（library） | 记忆是产品本体；角色由宿主决定是「宿主无关」的实证 |
| 代码组织 | companion/ 独立目录引用 src/brain | 不复制不合并，保住两 deployment 共享内核 |
| Java 重写内核 | 否决 | 决策资产/移动靶/叙事支点/时间成本 |
| Java 的使用位置 | 移植 kata（retrieval/decay） | 学习价值+零风险+可验证等价性 |

## 验证结论

- 源码核对确认内核零运行时依赖、零 Cordis 引用、fetch 可注入（见「已确认事实」）
- 纯讨论任务，无代码验证项
