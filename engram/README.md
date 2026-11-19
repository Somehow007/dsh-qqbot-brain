# engram — 记忆可观测的陪伴 Agent

brain 内核的第二个 deployment：dsh-qqbot-brain 插件是宿主 A（QQ 群聊），engram 是宿主 B（Web 1-on-1 自用陪伴）。**同一份 brain 源码，两个平级壳层**——这是「宿主无关内核」从论证变成事实的方式。

差异化不在聊天文采，在**记忆可审计**：蒸馏/遗忘/巩固/画像/VAD 情绪全部可观测，`/brain` 脑图三皮肤+D-admin 直接复用。

## 快速开始

```bash
cd engram
npm install          # 仅 devDeps（typescript/@types/node），零运行时依赖
npm run typecheck    # tsc 严格模式
npm test             # node --test，21 用例

# 本地跑（需 API key；不设也能起，LLM 面自动 disabled 降级）
ENGRAM_DATA_DIR=/tmp/engram-dev ENGRAM_HTTP_TOKEN=dev node src/main.ts
# → chat http://localhost:4100/?token=dev
# → brain http://127.0.0.1:4101/brain（仅本机）
```

## 结构

```
src/
  main.ts          装配入口：Brain→persona自举→timers三件套→双服务→优雅停机
  config.ts        env 配置面（ EngramConfig，全部可选）
  brain.ts         内核 shim：唯一 import 入口，直引 dsh-qqbot-brain/src/**/*.ts
  persona.ts       persona 包装载 + 种子幂等导入 + persona.md 同步
  chat/
    llm.ts         OpenAI 兼容 chat/completions 客户端（含 tool_calls）
    history.ts     chat-log.jsonl 持久化 + 有界内存历史
    prompt.ts      BrainContext → system prompt（稳定段→易变段）
    loop.ts        单轮管线（串行化/失败语义/ingest/endOfTurn）
    proactive.ts   主动开口（预算闸门+via:'agent' 投递）
    tools.ts       brain_search tool（默认关）
  web/
    server.ts      node:http 路由 + SSE + /brain 反代 + token→cookie 鉴权
    chat.html      单文件聊天页（三角色渲染+usage 透出）
test/              node:test（纯逻辑+fake-deps 管线）
.trellis/          Trellis 治理（spec/backend 七篇源码级规范）
docs/              dev-plan.md / deploy.md
```

详见 [MAP.md](./MAP.md)。

## 关键不变量（改代码前必读）

- **provenance**：主动消息 `Turn{userText:'', via:'agent'}`；LLM 失败轮**不写 Turn**——记忆不污染靠这两条。
- **串行化**：chat 请求经 promise chain 串行，Turn 配对假设 user/assistant 交替。
- **成本一线**：history 有界截断、embedding 同 query 缓存、endOfTurn 后台蒸馏、proactive 三重预算闸。
- **零依赖**：不引入运行时 npm 包；brain 直引 `.ts` 源码靠 Node ≥22.18 type stripping，服务器**无构建步骤**。
- **兄弟布局**：`engram/` 与 `dsh-qqbot-brain/` 必须平级（shim 相对路径），本地与服务器同构。

完整契约在 [`.trellis/spec/backend/`](./.trellis/spec/backend/index.md)。

## 状态

- **Slice 1（reactive MVP）**：代码骨架完成，本地冒烟通过（种子 +28 记忆、双服务、鉴权、反代）——**未部署生产**。
- **Slice 2（proactive + brain_search）**：机制已实现默认关，待声口基线跑稳后开。
- 排期与验收见 [docs/dev-plan.md](./docs/dev-plan.md)、[.trellis/acceptance.md](./.trellis/acceptance.md)。
