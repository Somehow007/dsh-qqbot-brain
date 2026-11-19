# engram · 实施清单（迭代F）

> 配套 design.md。Slice 1 = reactive MVP；Slice 2 = proactive+tool（声口基线后）。
> 验证命令约定：仓库根执行；engram 内命令注明 `cd engram`。

## Slice 1 — reactive MVP

### Phase 0 · 项目初始化（本次开工范围）

- [x] `engram/` 目录 + package.json / tsconfig.json（零运行时依赖、type stripping 直跑）
- [x] `src/brain.ts` shim + `src/config.ts` + `src/main.ts` 装配骨架
- [x] `src/chat/{llm,history,prompt,loop}.ts` + `src/web/{server.ts,chat.html}` + `src/persona.ts`
- [x] `test/` 单测（history/prompt/config/loop）
- [x] `trellis init --devin` + 治理文档（README/MAP/AGENTS/AI-WORKFLOW/docs/*）
- [ ] `cd engram && npm install`（typescript + @types/node devDep）
- [ ] `cd engram && npm run typecheck` 通过
- [ ] `cd engram && npm test` 通过
- [ ] `cd dsh-qqbot-brain && npm run build`（确认 brain dist 仍可构建；engram 走 src 直引不依赖 dist，但保持产物新鲜）

### Phase 1 · persona 适配与种子（首个功能里程碑）

- [ ] `personas/firefly/persona.md` 双语境改写（群聊→私聊，design §6 清单）
- [ ] `python3 personas/firefly/generate_seed.py` 重出 seed-export.json
- [ ] `engram/src/persona.ts` 实现：importData merge 幂等 + persona.md 优先级 + setPersona 同步
- [ ] **验证项 V1**：`importData merge` 对已存在 personas[] 跳过更新（store.ts:1259）——确认 setPersona 同步路径下 prompt/distill 双侧拿到新文本
- [ ] **验证项 V2**：fresh `~/engram-data` 启动 → import 28 种子 + activeId=firefly + persona.md 自举写入
- [ ] **验证项 V3**：二次启动幂等（notes/personas 不重复，ops 流水无异常增长）

### Phase 2 · chat loop 端到端（本地跑通）

- [ ] `ENGRAM_DATA_DIR=$(mktemp -d)` + `CHAT_LLM_*`/`BRAIN_LLM_*`/`BRAIN_EMBED_*` 指向真实 API key（本地 `~/.engram/engram.env` 或 shell env）
- [ ] `node src/main.ts` 启动 → 日志确认：人格内核(firefly) / 蒸馏 on / 向量 on / 脑图 4101 / chat 4100
- [ ] `curl -X POST localhost:4100/api/chat -d '{"text":"你好"}'` → 得流萤腔回复
- [ ] **验证项 V4**：chat-log.jsonl 追加 + brain ops 流水有 ingest 记录 + distill 攒批触发（多轮后）
- [ ] **验证项 V5**：断网/错 API key → 回复降级文案、不写 Turn、brain.log 有记录
- [ ] **验证项 V6**：`/brain` 脑图页（4101 或反代 4100/brain）能看到 engram 会话记忆/情绪/画像

### Phase 3 · 部署上云

- [ ] 服务器建 `~/engram-workspace/{engram,dsh-qqbot-brain}/src` 布局 + `~/.engram/engram.env`(600) + `~/engram-data/`
- [ ] rsync 源码（engram/src + 必要 engram 根文件 + dsh-qqbot-brain/src）→ `systemctl` 写 `engram.service`
- [ ] `docs/deploy.md` runbook 定稿（备份 cron 加 engram-data、回滚=停服务+恢复数据目录）
- [ ] 冒烟：公网 `http://124.222.65.169:4100/?token=` 开 chat、发消息、`/brain` 图可见
- [ ] **验证项 V7**：重启服务后会话/记忆/intent 状态完整恢复

### Phase 4 · dogfooding 启动

- [ ] 每日真实使用 ≥1 周；声口走查清单每周自评（design §10）
- [ ] 成本核对：每轮 token usage vs 预算模型（~6-9k tok 输入）
- [ ] 记忆质量抽查：/brain 图上 episodic→semantic 巩固是否正常推进

## Slice 2 — proactive + brain_search（声口基线后）

- [ ] `src/chat/tools.ts`：brain_search schema + `brain.search()` 执行 + 结果段注入；`tools.brainSearch` 默认 false，基线稳后开
- [ ] `loop.generateProactive()`：轻量 prompt（人设+intent+情绪+此刻感）→ `via:'agent'` Turn ingest
- [ ] shell 预算闸门：maxPerDay=4 / quietHours 23-8 / minInterval=120min；重启限流（只处理近 2h 到期 intent）
- [ ] chat.html 未读徽标 + 主动消息渲染区分（proactive 样式）
- [ ] **验证项 V8**：造一条 time intent → 到点触发 → 消息入 chat-log + via:'agent' 蒸馏跳过验证（ops 流水无 user 归因污染）
- [ ] **验证项 V9**：quietHours/maxPerDay 超限时不发送、log 可见、intent 不丢

## 风险文件与回退点

| 文件 | 风险 | 回退 |
|---|---|---|
| `personas/firefly/persona.md` | 改坏声口 | git 历史即回退；dsh 侧 pack 不受影响（engram 用自己的 dataDir persona.md） |
| `engram/src/brain.ts` shim | brain 内部 API 变动 | 单点切换：改 shim 或回退 dist import 方案 |
| `engram/src/chat/loop.ts` | Turn 构造错（via/actor）→ 记忆污染 | V8 专项验证；错即修 via 标注 |
| 服务器 `~/engram-data/` | 数据损坏 | 部署前备份 tar；`importData replace` 可从 seed 重建初始态 |
| `dsh-qqbot-brain/src/` | engram 直引源文件，brain 改动影响两 deployment | brain 改动本就该两边一起验；engram typecheck 会立刻暴露签名漂移 |

## 明确不做（本任务边界）

实现代码中除 skeleton 外不追求完美——persona 改写、部署、dogfooding 迭代是后续任务；Java 移植、渠道适配、多 persona UI 均不在 engram MVP。
