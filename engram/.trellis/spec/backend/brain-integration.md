# brain 内核消费契约

engram = brain 内核（`dsh-qqbot-brain/src/brain/`）的第二个 deployment。**内核是 library，不是插件；engram 侧不复制、不改内核源码、不绕过 shim 直接 import 内核路径。**

## 唯一入口：`src/brain.ts` shim

- 所有内核 API（`Brain`/`BrainStore`/`Distiller`/`Embedder`/`BrainHttpServer`/`readPersonaFile`/类型）**只从 `src/brain.ts` re-export**。
- shim 直引 `../../dsh-qqbot-brain/src/**/*.ts` 源码（Node type stripping），不是 dist——brain 源码即产物，签名漂移在 `npm run typecheck` 即暴露。
- 新增内核 API 需求 → 先在 shim 登记，再在使用处 import。禁止在业务文件里写 `../../dsh-qqbot-brain/` 路径。

## 部署布局硬约束

- `engram/` 与 `dsh-qqbot-brain/` 必须**保持平级兄弟目录**（本地与服务器同构），否则 shim 相对路径断裂。服务器部署目录：`~/engram-workspace/{engram,dsh-qqbot-brain}/`。
- brain 零运行时依赖是这套直引成立的前提；若内核将来引入依赖或非 erasable 语法（enum/namespace/参数属性/装饰器），type stripping 会在运行时炸——改内核前先跑 `node src/main.ts` 冒烟。

## 会话与发言人

- 单用户单会话：`sessionId` 固定 `'main'`（`cfg.sessionId`），发言人 `actor = cfg.userNick`。
- **不要**引入 SessionCapture/agentId→sessionId 映射/parseSenderTag——那是 dsh 群聊宿主的职责。
- speaker 视图用 `{ nick: cfg.userNick }` 传给 `assemble()`；长期绑定走内核 `boundSpeakerNick` 机制，不在壳层自造。

## Turn / provenance（记忆不污染的命门）

- 用户轮：`Turn{ userText, assistantText, actor: userNick, at, via:'user' }`——缺省即 user，但**显式写 via:'user'** 防未来默认值漂移。
- 主动消息轮：`Turn{ userText:'', assistantText, at, via:'agent' }`——`userText` 必填字段给空串。via:'agent' 保证：event intent 不误触发、纯 agent 批次蒸馏自动跳过、`withBoundSpeaker` 不补发言人。
- **LLM 失败的轮次不写 Turn**（见 chat-loop.md）——宁可少记不可错记。

## 种子与 persona

- 启动自举顺序（`src/persona.ts ensurePersona`）：`importData(seed,'merge')` 幂等灌入 → `persona.md` 优先级解析（`dataDir/persona.md` > pack 内嵌）→ `setPersona(resolved)` 同步活跃卡。
- `importData merge` 对已存在 `personas[]` **跳过更新**（store.ts）——persona.md 后续编辑靠 `setPersona`，不要指望重复 import 生效。
- persona 包 = `personas/firefly/`（persona.md + seed-export.json + generate_seed.py）。改 persona.md 后必须重跑 `generate_seed.py` 再部署——seed-export 是生成物不是手维护。
- 脑图编辑 persona.md 的回调已接 `writePersonaFile`（main.ts），与 dsh 侧同语义。

## 成本相关内核调用

- `assemble()` 每轮必调；`queryEmbedding()` 结果按 query 文本缓存（loop.ts `queryVecCache`），同 query 不重复 embedding。
- `endOfTurn()` 一律 `void` 不 await——蒸馏攒批后台跑，绝不阻塞回复。
- `brain.search()` 是纯召回不强化记忆；tool 结果截断 topK≤5 注入。
