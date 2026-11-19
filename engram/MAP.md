# MAP — engram 导航

where & how：先按层定位，再进文件。实现细节以源文件为准；本文件只维护「有什么/在哪/为什么这样分」。

## 分层地图

```
config.ts ──→ main.ts ──→ { chat/* , web/* }
                │
                ├─→ brain.ts (shim) ──→ ../../dsh-qqbot-brain/src/{brain,server,setup,config}
                ├─→ persona.ts ──→ personas/firefly/ + importData + persona.md
                └─→ timers（内联 main.ts）：consolidation / embedding回填 / tickIntents
```

## 模块表

| 模块 | 职责 | 关键不变量 | spec |
|---|---|---|---|
| `src/config.ts` | env→EngramConfig，双 LLM 面 | 默认值=生产安全值；新旋钮四处登记 | cost-config |
| `src/brain.ts` | 内核 re-export 唯一入口 | 禁止绕过；直引 .ts 源码 | brain-integration |
| `src/persona.ts` | 种子导入+persona.md 同步 | merge 不更新已有 personas[]→靠 setPersona | brain-integration |
| `src/main.ts` | 装配+timers+停机 | 镜像插件 apply()；endOfTurn 不 await | deployment |
| `chat/llm.ts` | OpenAI 兼容 client | 失败返 undefined 不抛；usage 透出 | cost-config |
| `chat/history.ts` | jsonl 持久化+有界视图 | 截头保尾；坏行跳过 | chat-loop |
| `chat/prompt.ts` | 七段 prompt | 稳定段在前；空段不产出 | chat-loop |
| `chat/loop.ts` | 单轮管线 | 串行化；失败不写 Turn；via:'user' | chat-loop |
| `chat/proactive.ts` | 主动开口 | 四道闸；via:'agent'+userText:'' | proactive |
| `chat/tools.ts` | brain_search | topK≤5；默认关 | chat-loop |
| `web/server.ts` | HTTP+SSE+反代+鉴权 | token→cookie；/brain 注入 header | web-server |
| `web/chat.html` | 单文件聊天页 | 无构建；三角色；usage 可见 | web-server |

## 数据流（一次对话）

```
POST /api/chat → loop.handleUserMessage（串行）
  → history.append(user) → assemble(+queryVec缓存) → prompt → llm.chat(±tools≤2轮)
  → history.append(assistant,usage) → ingest(Turn via:'user') → fired?
  → endOfTurn(后台) → proactive.consume(fired) → SSE broadcast
响应 {reply,usage,hits,degraded}
```

## 与外部世界的边界

- **内核**：只经 `src/brain.ts`；不改 `dsh-qqbot-brain/` 源码（缺能力先提到根项目任务）。
- **persona 包**：`personas/firefly/` 是内容包（根仓库共享），persona.md 改后必跑 `generate_seed.py`。
- **部署**：`docs/deploy.md`；硬约束在 spec/backend/deployment.md。

## 治理入口

- 任务/流程：`.trellis/workflow.md` + `.trellis/tasks/`
- 规范：`.trellis/spec/backend/`（七篇）+ `.trellis/spec/guides/`
- 验收台账：`.trellis/acceptance.md`
- 开发计划：`docs/dev-plan.md`
