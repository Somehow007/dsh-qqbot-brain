# 跨 harness 可移植性评估

## 背景 / 问题

用户提问：当前 qqbot-brain 是「QQ 群聊接入 dsh」的 Cordis 插件、为 dsh 服务；如果 qqbot 改接 workbuddy 或其他 agent/harness 提供方，本插件是否可用？

纯讨论任务，不改代码；目标是摸清插件对 dsh 的真实耦合面，给出移植判断标准。

## 耦合面分析

代码实际分三层，绑定程度不同：

**1. 插件壳层（dsh 专属，不可移植）**

- `apply(ctx, config)` + `cordis.patch.yml`：Cordis 插件协议，`dsh plugin add` 安装，宿主必须是 Cordis 运行时
- `ctx.on('system-prompt/assemble')`：dsh waterfall hook，产出 `{sections:[{name,order,text}]}` 结构（`src/inject/prompt.ts`）
- `ctx.on('session/event')`：依赖 `user/message`/`assistant/message`/`turn/end` 事件协议（`src/capture/events.ts`）
- `ctx.get('webServer')`：可选挂载点，拿不到时降级自起 `node:http`
- `findProfileDir()`：向上找 `cordis.patch.yml` 做 persona 迁移，找不到降级到 env/config
- `src/index.ts` 里 `ctx` 全程 `unknown` 鸭子类型，无 dsh 包 import，但事件名/装配协议写死

**2. QQ 适配层约定（绑定 `@tencent-connect/dsh-qqbot`，非 dsh 核心）**

- `parseSenderTag` 认 `[昵称 (openid)]` 标签与 `[Chat history]`/`[Current message]` 锚点——这是官方 QQ 适配器的消息格式约定
- 换 QQ 适配器（不换 harness）也会使发言人归因静默失效；但优雅降级：actor 为空 → 分人画像/态度/【当前发言人】不注入，基础记忆照常

**3. Brain 内核层（宿主无关，可直接搬走）**

- `src/brain/`（Brain、BrainStore JSONL、Distiller、retrieval、emotion、decay、identity）无任何 ctx/Cordis 引用
- `src/server/http.ts` 为裸 `node:http`
- 蒸馏走 OpenAI 兼容接口，`BRAIN_LLM_BASE_URL`/`MODEL`/`API_KEY` env 可配——agent 提供方侧本就解耦；非 OpenAI 形态 API 只需改 `distill.ts` 一处 fetch

## 移植判断（按目标宿主分四档）

| 目标 | 可行性 | 要做的 |
| --- | --- | --- |
| Cordis 系宿主（另一 dsh profile / Cordis harness） | 直接可用 | 零改动；换 QQ 适配器时调 `parseSenderTag` |
| 有 hook 的 JS/TS harness | 可移植 | 重写 SessionCapture(~150行)+PromptInjector(~120行)+apply，brain 不动 |
| 无 JS 插件机制但有 webhook/tool/hook | sidecar 模式 | 现有 `/api/query` 可召回；需补 `/api/ingest`（喂 turn）+`/api/assemble`（取注入文本块），harness 推理前后各调一次 |
| 完全无扩展点 | 不可用 | 只能退化为工具召回（行为模式改变）或前置代理改写 system prompt |

## 宿主能力清单（能否复用同一设计的判据）

1. 推理前改 system prompt 的钩子——人格/情绪/记忆注入的前提
2. 轮次级事件流——`(sessionId, user 文本, assistant 回复)` → `brain.ingest` + `brain.endOfTurn`
3. 群聊发言人标识（可选）——结构化字段或文本标签；缺失只损失分人画像/态度归因
4. 能跑 Node ≥20 进程（插件模式或 sidecar 模式）

## Resolution（2026-10-31）

**遇到了什么问题**：需要回答「qqbot 改接 workbuddy/其他 harness 提供方时本插件是否可用」——本质是摸清插件对 dsh 的耦合面。

**怎么解决的**：通读 `src/index.ts`/`capture/events.ts`/`inject/prompt.ts`/`server/http.ts`/`setup/persona-loader.ts`/`brain/distill.ts`，把耦合面拆成「插件壳层 / QQ 适配约定 / brain 内核」三层评估。结论：插件包本体只能在 Cordis/dsh 系宿主跑（system-prompt/assemble 与 session/event 是 dsh 私有协议，非行业标准）；`src/brain/` 内核宿主无关可整体复用，换宿主成本≈重写约 300 行胶水层；蒸馏 LLM 提供方本就经 env 解耦。对 workbuddy 的判断取决于其是否 Cordis 系及是否暴露 prompt-injection hook 与轮次事件流。

**后续优化方向**：若真要支持非 dsh 宿主，优先 sidecar 化——补 `/api/ingest` 与 `/api/assemble` 两个端点后任何能发 HTTP 的 harness 都可接入；`parseSenderTag` 的发言人格式应抽成可配置项以适配不同群聊适配器；蒸馏器 fetch 点可抽象 provider 接口以接非 OpenAI 形态 API。

**什么时候干的**：2026-10-31，单会话完成源码审查→分层评估→结论输出→任务归档。

**Key Decisions**：判定「不可移植」的边界画在 Cordis 插件协议与 dsh 事件/装配协议上，而非代码 import——`ctx` 虽为鸭子类型，事件名即私有协议；发言人归因归入「适配层约定」而非核心耦合，因其缺失时优雅降级。

**验证结论**：纯分析任务，无代码改动；结论基于逐文件源码审查（事件名、正则、fetch 调用点均可定位到具体行），未在真实非 dsh 宿主上验证。
