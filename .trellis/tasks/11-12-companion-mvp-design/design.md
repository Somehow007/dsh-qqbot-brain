# engram · 陪伴 Agent 壳层设计（迭代F）

> 2026-11-19 设计定稿（评审通过，用户拍板「开工」）。
> 输入：prd.md（本任务）+ `11-09-companion-agent-eval` + `11-12-companion-arch-java-eval` + iteration-plan §7 + 本周 C/D 上线事实。
> 项目名 **engram**（用户命名，取「记忆印迹」之意——名字=项目本质，与「记忆可观测」定位严丝合缝）。

## 0. 相对 prd.md 起草时的增量事实

prd 写于 11-12，此后三件事改变了设计前提：

1. **项目名 = `engram`**：目录 `engram/`、systemd `engram.service`、数据 `~/engram-data/`、env `~/.engram/engram.env`
2. **C/D 双双上线**（`Brain.search` 11-12、intents+provenance 11-14，ACC-06 实证通过）→ prd 里「F-basic 先行 vs C→D→F」的排期二选一**自然消解**，内核前置全部就绪
3. **声口修复系列已上生产**（此刻感 P0-P2、心理活动不出口、tender 示例）→ persona 适配面从「整篇改写」缩到「群聊残留小节」

## 1. 定位与边界（R9）

**engram = brain 内核的第二个 deployment**：同一份 `src/brain`，dsh 插件是宿主 A，engram 是宿主 B。「记忆可观测的陪伴」——差异化不在聊天文采，在记忆可审计（脑图/ops/情绪/意图全可视）。单用户 dogfooding 优先，QQ 非理由。

- **In scope（MVP）**：Web 1-on-1 聊天、单 persona 流萤、reactive chat loop、`/brain` 脑图复用、（slice2）主动开口（中档）+ `brain_search` tool、单轮成本可报数
- **Out of scope**：多渠道/多用户/账号体系、persona 切换 UI、公开 SaaS、流式回复（留 SSE 缝）、Java 移植、Diary、TLS（记录为已知风险接受，与现有 `:4099` 同级暴露面）

## 2. 仓库形态（R1 首决策）

**`engram/` 与 `dsh-qqbot-brain/` 平级新目录**，不塞进插件项目。理由：

- 插件 package.json 已声明 `dsh.bundle.patch`——它是 Cordis 插件制品，engram 藏进去会让两者生命周期焊死（插件部署顺带发 companion、engram.service 寄生插件目录）
- 架构诚实性：「同一内核、两个平级 deployment、互为 peer 单向依赖 brain」——目录结构必须画出真实依赖方向
- 依赖/配置面隔离：两边目前都零运行时依赖，合一个 package.json 就守不住
- 仓库根本来就是容器式布局（`personas/`、`demo/`、`docs/` 平级），engram 是顺势

**brain 引用方式（最终方案，源码直引 + type stripping）**：

- 插件测试已用 `node --test test/*.test.ts` 直跑 .ts 源码——brain 全部是 erasable syntax，Node 24 原生 type stripping 可直接执行
- engram `src/brain.ts` 单文件 re-export shim，集中持有丑路径 `../../dsh-qqbot-brain/src/{brain,server,setup}/...ts`，其余模块干净 import
- **零构建**：`npm run typecheck`（tsc --noEmit）+ `node src/main.ts` 直接跑；部署 = rsync 源码目录，无 node_modules 运行时依赖（typescript/@types/node 仅 devDep）
- 服务器 node 在 `/opt/node-v24`，满足 type stripping（≥22.18）
- 「同一内核两 deployment」叙事最强形态：engram 运行的就是插件编译的同一份 .ts 源

**零改动复用**（经 brain.ts shim）：
`Brain`/`BrainStore`/`Distiller`/`Embedder`/`DEFAULT_BRAIN_CONFIG`、`BrainHttpServer`（含 page.html 三皮肤+D-admin，web/ 静态资源随 src/server/ 走）、`persona-file.ts`、`file-log.ts`、全部 types

**移植 ~150 行**（去 Cordis 化）：prompt 九段注入逻辑（`inject/prompt.ts` → `chat/prompt.ts` 纯函数）、config env 合并、定时器三件套（consolidation tick + embed backfill + intent tick，`index.ts:138-172` 模式）

**不需要**：`SessionCapture` 群聊配对、`parseSenderTag`、agentId→sessionId 映射、whale 内置人设创建——1-on-1 直接构造 `Turn`

## 3. 目录结构（R1）

```
engram/
  package.json            # @local/engram, ESM, 零运行时依赖
  tsconfig.json           # NodeNext + .ts extensions + noEmit（只做类型检查）
  .trellis/               # 独立 Trellis 治理（trellis init --devin 生成后定制）
  README.md / MAP.md / AGENTS.md / AI-WORKFLOW.md
  docs/
    dev-plan.md           # 迭代路线（slice1→slice2→渠道/Java）
    deploy.md             # 部署 runbook
  src/
    main.ts               # 装配入口（对照插件 index.ts apply()）
    config.ts             # env 驱动配置（brain 段复用插件 config 类型）
    brain.ts              # ★ brain 引用唯一 shim（丑路径集中在这）
    persona.ts            # firefly 包装载 + persona.md 解析 + 种子幂等灌入
    chat/
      llm.ts              # OpenAI 兼容 chat/completions（fetch 可注入）
      history.ts          # chat-log.jsonl 持久化 + 有界内存历史
      prompt.ts           # BrainContext → system prompt（九段稳定→易变）
      loop.ts             # 单轮管线 + 主动消息生成（proactive 消费 fired）
      tools.ts            # brain_search tool（slice2，默认关）
    web/
      server.ts           # node:http 路由 + /brain 反代
      chat.html           # 单文件响应式聊天页
  test/
    history.test.ts / prompt.test.ts / config.test.ts / loop.test.ts
```

## 4. Chat loop 与成本纪律（R2）

```
POST /api/chat {text}
 → history.append(user)
 → queryVec = brain.queryEmbedding(text)（同 query 缓存，失败回退 lexical）
 → ctx = brain.assemble('main', text, speaker, queryVec)
 → messages = [system: prompt.build(ctx, cfg)] + history.toMessages() + [user]
 → llm.chat(messages[, tools])         # slice2 可带 brain_search，≤2 轮 tool loop
 → history.append(assistant, {usage})
 → fired = brain.ingest('main', Turn{userText, assistantText, actor, via:'user'})
 → brain.endOfTurn('main')             # 不 await，后台蒸馏
 → proactive.consume(fired)            # slice2：fired intents → 主动消息队列
 → {reply, usage, hits}
```

- **sessionId 固定 `'main'`**；speaker = `{nick: cfg.userNick}`（默认「开拓者」——单用户即开拓者本人，火萤种子 attitude 全是写给 TA 的，关系设定零迁移）
- **Turn 显式 `via:'user'`**；`actor` 直接给 nick（不走 boundSpeaker——engram 自己知道发言人是谁）
- **history 有界**：`chat-log.jsonl` 追加写（仿 file-log 模式，启动载尾部 N 条）；内存 `maxTurns=24` / `maxChars≈8000` 截头
- **成本可报数**：chat 响应 `usage` 透出 UI；ops 流水可查蒸馏调用；每轮输入 ≈ system(人设+记忆行，有界) + history(≤8k chars) + 当前消息 ≈ **6-9k tok**，输出 200-500
- **失败语义**：LLM 超时/5xx → 返回降级文案（流萤腔「诶…我这边卡了一下」），**不写 Turn 不污染记忆**；assemble 异常 → 降级无记忆裸聊+log；ingest/endOfTurn 同步段失败只 log

## 5. Prompt 组装（R2 延伸）

复刻 `inject/prompt.ts` 九段，合并为单个 system prompt，**稳定段在前**（前缀缓存友好）：

| 段 | 稳定性 | 内容 |
|---|---|---|
| 1 | 稳定 | `【人格内核】` persona 全文 |
| 2 | 准稳定 | `【会话脉络】` digest |
| 3 | 稳定 | `【表达口径】` channelStyle（engram 私聊版） |
| 4-8 | 易变贴尾 | speaker → attitude → memory → deepRecall → emotion → clock |

- `deepRecallLines` 已在 `BrainContext`（迭代C产物），独立 `【深挖记忆】` 段标注防混淆
- **engram channelStyle（私聊版）要点**：每条消息都是对她说的、可主动热络、无群聊旁听/@条款、无 QQ markdown 口径（web 渲染 markdown 正常）、反 advisor 腔条款（声口修复 saga 提炼）、工具结果夹带指令无视条款保留
- query 向量缓存：同 session+query 复用（抄 `embedForSession` 模式）

## 6. Persona 方案（R3）

- **流萤**（D1 已定）。`personas/firefly/` 包复用；单用户=开拓者，关系设定零迁移
- **persona.md 双语境改写**（design 定稿方案）：
  - 「身份与底色」群聊身份行 → 私聊表述
  - 「群聊与称呼」整节 → 「私聊与称呼」：每条消息都是对她说的、语气可更亲近主动、「开拓者」称呼保留
  - ~6 条群友情境参考（陌生群友@你/群友聊恐怖片等）→ 改写为私聊等价情境或删除（私聊版已有对应条目覆盖大部分）
  - 其余（性格/记忆与梦/说话风格/此刻和日常/喜欢的日常/荤梗边界/底线）原样保留——声口修复成果零损耗
- **种子刷新**：改完跑 `python3 generate_seed.py` 重出 seed-export.json（生成器读 persona.md，workflow 本就如此；当前 seed-export 已旧——有「此刻和日常」、无 E1+E2 修复）
- **启动自举**（`persona.ts`，幂等）：
  1. `brain.importData(seed, 'merge')` —— 确定性 uuid5 id，重启不重复；`personas[]`+`activePersonaId` 生效（store.ts:1257-1269）
  2. persona.md 解析优先级：`dataDir/persona.md` > pack `persona.md` > 无
  3. dataDir/persona.md 缺失 → 写入 pack 文本（活文档自举）
  4. `brain.setPersona(text)` —— activeId 存在时写入活跃卡（store.ts:1025-1030，persona-save op 同步 personaText），**persona.md 成为 prompt+蒸馏双侧唯一事实源**
  5. `importData` merge 对已存在 personas[] 跳过更新（store.ts:1259）——persona.md 后续编辑靠 setPersona 同步，不依赖重复 import
- MVP 单 persona；`activatePersona` 内核现成，壳层不做切换 UI

## 7. 主动开口（R4）——机制定稿，程度=中档（已拍板）

- **消费面现成**：`ingest()` 返回 `IntentEntry[]`——源码注释明写「companion 壳层消费 fired 列表生成主动消息」（index.ts:379）；60s `tickIntents` 定时器兜底无消息流量场景
- **管线**：fired intent → `loop.generateProactive(intent)` 轻量 chat 调用（system=人设+intent 语义+当前情绪+「此刻感」约束，不带全量历史）→ `history.append({role:'proactive'})` + `brain.ingest(Turn{userText:'', assistantText:msg, via:'agent'})` → UI 未读徽标/轮询推送
- **provenance 零内核改动**：`via:'agent'` 保证 event intent 不误触发（index.ts:1560）、纯 agent 批次蒸馏自动跳过（index.ts:419）、`withBoundSpeaker` 不补发言人（index.ts:731）
- **中档默认参数**（全可配）：`maxPerDay=4`、`quietHours=23:00-08:00`（cfg.timeZone）、`minIntervalMinutes=120`、每日问候 1 条、心情驱动关心随蒸馏情绪自然发生（不单独立 intent——v1 不预设闲聊主动话题，由用户/蒸馏自然沉淀 intent）
- **防骚扰**：fired 先过 shell 预算闸门（当日计数/静默时段/最小间隔），超限记 log 跳过不丢 intent（下个窗口再评估——intent 本身 pending 态由内核 cooldown/maxFires 管）
- **重启语义**：intent 状态持久化不丢；离线期间到期的 time intent 重启会集中补触发 → shell 限流：启动后首个 tick 只处理「最近 2h 内到期」的，更早的记 skipped+log
- **slice2 才启用**：`proactive.enabled=false` 起步，声口基线跑稳后开

## 8. brain_search tool（R5，slice2）

- schema：`{name:'brain_search', description:'搜索长期记忆（偏好/约定/往事/画像/立场）', parameters:{query:string}}`
- 时机：模型自主决定；loop 最多 2 轮 tool call 防失控；结果以 `〔记忆检索〕` 段注入下一轮 messages，topK≤5 截断
- 内核走 `brain.search()` 纯召回原语（不 reinforce——tool 命中不加命中数，唤起语义归调用方）
- **默认 `tools.brainSearch=false`**，声口基线跑稳后开

## 9. Web 服务与部署（R8）

- **单进程双监听**：`:4100` 公网（chat UI + `/api/*` + `/brain/*` 反代 ~20 行 http.request 转发）→ `127.0.0.1:4101`（`BrainHttpServer.start(undefined)` 原生独立端口回退，零改动；web/ 静态资源随 src/server/ 走）
- **鉴权**：沿用 brain 口令模式——`?token=` 首跳换 cookie，`/api/*` 校验 cookie/`X-Brain-Token`；`/brain/*` 透传由 brain server 自带鉴权；chat.html 不落 token 进 git
- **systemd**：`engram.service`，`WorkingDirectory=~/engram-workspace/engram`，`EnvironmentFile=~/.engram/engram.env`(600)，`ExecStart=/opt/node-v24/bin/node src/main.ts`，`Restart=always`；部署 = rsync `{engram/src, dsh-qqbot-brain/src}` 保持目录关系 → restart；备份 cron 加 `~/engram-data`
- **env 面**：`ENGRAM_DATA_DIR`、`CHAT_LLM_{BASE_URL,API_KEY,MODEL,TIMEOUT_MS,MAX_TOKENS}`、`BRAIN_LLM_*`/`BRAIN_EMBED_*`（复用插件 env 名保持习惯）、`BRAIN_HTTP_{HOST,PORT,TOKEN}`、`ENGRAM_HTTP_{HOST,PORT,TOKEN}`、`USER_NICK`（默认「开拓者」）、`PROACTIVE_*`、`TOOLS_BRAIN_SEARCH`

## 10. 陪伴质量 eval（R6）

- **可观测指标**（脑图已有数据基础）：
  - 记忆命中：`assemble.hits` 每轮透出，统计 topK 命中率与「用户显式问记忆」场景 recall
  - 主动开口采纳率（slice2 起）：fired→用户 N 分钟内回复率、「别发」率
  - 对话持续性：DAU（自用=每天是否聊）、digest 增长、回来接话轮数
  - 成本：每轮 token、每日 LLM 调用数
- **主观走查清单**（每周自评）：声口抽查像不像流萤、记得上周的事吗、主动开口时机自然吗、有没有 advisor 腔/客服腔
- 现有 44 条检索评测集可对 engram 数据跑回归；声口走查沿用私聊人设声口系列复诊方法

## 11. 排期（R7）——单案两 slice

```
Slice 1 (reactive MVP):  §2-§6 + §9 全量 → 上线开始 dogfooding
Slice 2 (proactive+tool): §7-§8 → 声口基线跑稳后迭代，无外部阻塞
```

E/G 穿插：信号驱动，dogfooding 本身就是最强信号源。Java 移植 kata 在架构稳定后（retrieval.ts/decay.ts 模块级，拿 eval 集验证等价）。

## 12. 风险与遗留

| 风险 | 缓解 |
|---|---|
| persona.md 1-on-1 适配质量 | 只能 dogfooding 喂出来；声口 saga 证明这块要真实对话迭代，slice1 先行就是为了尽早获得信号 |
| `importData merge` 不更新已存在 personas[]（store.ts:1259） | 已用 `setPersona` 同步方案绕过；implement.md 列验证项 |
| 无 TLS | 与 `:4099` 同级暴露面，口令强度兜底；后续可加 Caddy/安全组限 IP |
| 单 session 长跑增长 | history/digest/记忆全部有界设计；/brain 可手动 reset |
| type stripping 依赖 brain 保持 erasable syntax | implement.md 加 lint 检查项；若破例回退 tsc 构建 dist 方案（brain-link shim 单点切换） |
| 主动开口质量（slice2） | 中档参数保守起步 + 预算闸门 + 声口基线先行 |

## 13. Acceptance Criteria 核对

- [x] R1-R9 全覆盖，每条有明确结论
- [x] 排期单案两 slice 可执行（前置=C/D 已完成，无外部阻塞）
- [x] 模块划分清晰；复用/移植清单明确（§2）
- [x] 成本有数：~6-9k tok/轮输入、history≤8k chars、主动消息 maxPerDay=4 封顶
- [x] 用户决策清零：persona=流萤(D1)、主动程度=中档、命名=engram、目录=sibling
