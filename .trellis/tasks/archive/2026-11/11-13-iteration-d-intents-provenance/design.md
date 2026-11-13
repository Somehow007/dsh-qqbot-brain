# 迭代D 设计：standing intents + provenance/session-kind

> 上游：`11-09-iteration-upgrade-plan/iteration-plan.md` §5。本文件定稿实现口径，
> 与 plan 的出入处（fireAt/dailyAt 互斥、ingest 顺带 tick、source 继承规则）在 §7 记录。

## 1. 总体结构

```
写路径（已有）                          新增 intents 通路
SessionCapture.turn/end                 Brain.ingest(sessionId, turn)
  └─ brain.ingest(turn)        ──→       ├─ event 型：matchEventIntents（via=user 才评估）
  └─ brain.endOfTurn(session)            ├─ time 型：tickIntents(now) 顺带评估
                                         └─ 返回本轮 fired IntentEntry[]（dsh 只 log，壳层消费）

插件定时器（src/index.ts）                tickIntents(now)
  └─ setInterval 60s unref    ──→         └─ time 型到期判定 + 全 pending 过期/maxFires 清扫
```

分层理由：intent 是「内核原语」——存储/判定/生命周期全在 Brain+BrainStore，
壳层（dsh 插件 / 未来 companion）只负责「何时喂 turn、拿 fired 列表后生成消息」。
触发评估确定性零 LLM；消息生成是壳层职责（1 次 chat 调用/次触发，预算由
cooldownMs/maxFires/expiresAt 在内核强制）。

## 2. schema（types.ts）

```ts
export type IntentKind = 'event' | 'time';
export type IntentStatus = 'pending' | 'fired' | 'expired' | 'cancelled';
export type TurnVia = 'user' | 'agent' | 'system';
export type MemorySource = 'user' | 'agent' | 'manual' | 'import';
export const MEMORY_SOURCES = ['user', 'agent', 'manual', 'import'] as const;

export interface IntentMatch {
  /** 入站正文匹配：子串（大小写不敏感）或 /正则/flags；与 actor 同给按 AND */
  text?: string;
  /** 发言人匹配：actor tag「昵称 (openid)」子串或 /正则/ */
  actor?: string;
}

export interface IntentEntry {
  id: string;
  kind: IntentKind;
  /** 意图描述（人读 + 壳层生成消息的语义输入），≤200 字 */
  text: string;
  status: IntentStatus;
  createdAt: number;
  /** time 一次性触发时刻 ms epoch；与 dailyAt 互斥（存在即一次性，触发→fired 终态） */
  fireAt?: number;
  /** time 每日复发 'HH:mm'（cfg.timeZone 口径） */
  dailyAt?: string;
  /** event 匹配器：text/actor 至少其一非空 */
  match?: IntentMatch;
  /** 触发后冷却时长 ms（防刷屏；缺省=无冷却） */
  cooldownMs?: number;
  /** 冷却截止（内核在 fire 时写=lastFiredAt+cooldownMs；读侧判定用） */
  cooldownUntil?: number;
  /** 触发次数上限：firedCount 达到→status='fired' 终态；缺省不限 */
  maxFires?: number;
  firedCount: number;
  lastFiredAt?: number;
  /** 失效时刻 ms epoch：pending 过此点→expired（每日型=停止复发窗口） */
  expiresAt?: number;
  /** 创建时活动人设 id（标签/壳层路由用；不参与触发判定） */
  personaId?: string;
  /** event 匹配范围限定：缺省=任意会话的入站 turn 都可触发 */
  sessionId?: string;
}

/** 创建/更新入参（Brain 层校验归一后落库） */
export interface IntentDraft {
  kind: IntentKind;
  text: string;
  match?: IntentMatch;
  fireAt?: number;
  dailyAt?: string;
  cooldownMs?: number;
  maxFires?: number;
  expiresAt?: number;
  personaId?: string;
  sessionId?: string;
}
```

`MemoryNote.source?: MemorySource`、`NoteDraft.source?: MemorySource`、`Turn.via?: TurnVia` 同文件追加。

## 3. store 层（store.ts）

**Op 联合追加**：

```ts
| { op: 'intent-add'; intent: IntentEntry }
| { op: 'intent-update'; id: string; patch: IntentUpdatePatch }
| { op: 'intent-fire'; id: string; at: number; firedCount: number; cooldownUntil: number | null; status: IntentStatus }
| { op: 'intent-del'; id: string }
```

`IntentUpdatePatch` = 可变配置字段（text/match/fireAt/dailyAt/cooldownMs/maxFires/expiresAt/sessionId/personaId，值 `null`=清除）+ 内部 `status?: IntentStatus`（终态转移专用，公开 updateIntent 不暴露）。apply 逐键：`undefined` 跳过、`null` 清除、其余赋值——与 note update 的 self 三态同款「存在性判断」口径。

- `intent-fire` apply：`firedCount/lastFiredAt(=at)/cooldownUntil(null→undefined)/status` 直赋——op 自带结果态，重放确定性。
- snapshot `intents: IntentEntry[]`（体量小用数组，与 notes/personas 同构）；load 经 `sanitizeIntent` 清洗。
- `reset` op 清 intents（记忆重置=全脑重置；importData replace 依赖此语义）。
- export `intents` 字段；importData merge 按 id 去重（重备份幂等）、replace 经 reset+add 重放；`ImportResult.intents` 计数。
- 版本号：intent op 只 `version++`，**不进 graphVersion 名单**——不影响记忆边集/检索索引。

## 4. Brain 层（index.ts）

### 4.1 公共 API

```ts
addIntent(draft: IntentDraft): IntentEntry          // 校验+归一，personaId 缺省=活动人设
updateIntent(id, patch: IntentConfigPatch): IntentEntry | undefined  // 仅配置字段；非法 throw
cancelIntent(id): boolean                            // pending→cancelled
deleteIntent(id): boolean                            // 硬删（intent-del）
listIntents(filter?: { status?; kind?; sessionId? }): IntentEntry[]
tickIntents(now = this.now()): IntentEntry[]         // 返回本轮新 fired
```

校验（add/update 共用 `normalizeIntentDraft`）：kind 枚举；text 非空 ≤200；event 必须 match.text|actor 非空且 `/…/flags` 形式可编译（编译失败 throw）；time 必须 fireAt|dailyAt 恰好其一（create 双给→throw；update 设一清另一，patch 后两空→throw）；dailyAt 归一 'HH:mm'（`/^([01]?\d|2[0-3]):[0-5]\d$/` 补零）；cooldownMs≥0、maxFires≥1 整数、expiresAt>now。

正则缓存：`Map<pattern, RegExp>`（上限 200，超限清空）——matchPattern 编译一次复用；存储层只存原始字符串，op/快照保持 JSON 纯数据。

### 4.2 触发评估（确定性，零 LLM）

```ts
private intentGate(it, now): boolean   // pending 前置已由调用方判；过期→expired、maxFires 达→fired（终态落 op），返回是否可评估
private intentCooling(it, now): boolean // now < cooldownUntil
private fireIntent(it, now): IntentEntry // firedCount+1、cooldownUntil=now+cooldownMs、终态判定、log「intent fired」
```

终态规则：`firedCount+1 >= maxFires` → fired；`kind='time' && fireAt!=null` → fired（一次性）；dailyAt 复发与 event 常规保持 pending 续 firing。

- **event**（`matchEventIntents`，ingest 内调用）：`via` 非 user → 整批跳过；`it.sessionId` 限定会话不符 → 跳过；`match.text` 测 `turn.userText`（不含 contextText 环境消息——旁观消息不该喂意图）、`match.actor` 测 `turn.actor`，双给按 AND。命中→fireIntent。
- **time**（`timeIntentDue`，tickIntents/ingest 共用）：
  - `fireAt`：`firedCount===0 && now>=fireAt`（建时已过期→下个 tick 立即触发，记为 fire-ASAP 语义）。
  - `dailyAt`：`occ=dailyOccurrenceMs(dailyAt, now, cfg.timeZone)`（time.ts 新增：时区当日 HH:mm→epoch，Intl 不动点迭代收敛）；due ⟺ `occ>createdAt && occ<=now && (lastFiredAt==null || lastFiredAt<occ)`——创建于场次后的当天不补打，次日自然复发。
- `tickIntents(now)`：先对**全部 pending** 过 intentGate（event 型过期/maxFires 也在此落定，不依赖消息到达），再评估 time due+cooling→fire。ingest 内顺带调一次同函数——有消息流量时 time intent 立即触发，不等 60s 空闲 tick；幂等（已 fired 的状态自然跳过）。

### 4.3 ingest 改造

```ts
ingest(sessionId, turn): IntentEntry[] {
  // …现有 stamped/buffer/counter 不变…
  const now = this.now();
  return [...this.matchEventIntents(sessionId, stamped, now), ...this.tickIntents(now)];
}
```

返回值对 SessionCapture 无感（忽略返回）；companion 壳层拿 fired 列表生成消息。dsh 侧 fireIntent 内已 `log('intent fired …')`→brain.log 落盘。

### 4.4 provenance（D2）

- `Turn.via` 透传：ingest 的 stamped spread 天然保留；`withBoundSpeaker` 改为只给 `!via || via==='user'` 的轮次补绑定 actor（agent/system 不标发言人）。
- endOfTurn 在 buffer 清空+distilling 入集后、`const now` 前加门禁：

```ts
if (!turns.some((t) => !t.via || t.via === 'user')) {
  this.log?.(`蒸馏跳过 ${sessionId.slice(0,8)}…：批次无用户轮次（agent/system）`);
  return;   // finally 照常清 distilling；maybeDigest 同批跳过
}
```

- `actors`/`existing`/`queryText` 天然兼容：agent 轮 userText='' 不贡献检索 query；actor 经 withBoundSpeaker 修正后不串。
- distill 写库 `source`：endOfTurn addNote `source:'user'`；consolidateBatch `source = eps 同质继承（全 agent→'agent'，其余→'user'）`——统一规则：`new Set(eps.map(n=>n.source??'user')).size===1 ? 该值 : 'user'`。
- `Brain.addNote`（脑图/API 入口）：`source: draft.source ?? 'manual'`。
- sanitizeNote 透传合法 source（MEMORY_SOURCES 校验），旧数据缺省=undefined（视同 user 系）。

### 4.5 distill.ts prompt

抽出共享 `convoLines(turns, cap, ctx)`（distill/digest 两处复用，替换各自内联 map）：

```ts
if (t.via === 'agent')  → `[stamp] 角色（主动开口）：${capText(t.assistantText || t.userText, cap)}`
if (t.via === 'system') → `[stamp] 系统：${capText(t.userText || t.assistantText, cap)}`
else                    → 现有「[stamp] actor：userText\n角色：assistantText」
```

agent/system 行取「有内容的那侧」兜底（assistantText||userText / 反向），兼容壳层两种填法。distillPrompt 在「对话每行形如…」段后补口径：

> 标「角色（主动开口）」的是角色自己主动发起的消息、标「系统」的是系统事件——它们不是用户发言：不作为用户事实/画像/情绪变化的依据，只在用户后续回应时作为上下文理解。

DIGEST_PROMPT 补一句同类说明（脉络如实记录但不当用户发言）。

## 5. HTTP（http.ts）

| 路由 | 说明 |
| --- | --- |
| `GET /api/intents?status=&kind=&sessionId=` | listIntents 过滤 |
| `POST /api/intents` | body=IntentDraft → addIntent；校验错 400 |
| `PATCH /api/intents/<id>` | IntentConfigPatch → updateIntent；404/400 |
| `POST /api/intents/<id>/cancel` | cancelIntent；404 |
| `DELETE /api/intents/<id>` | deleteIntent；404 |
| `POST /api/intents/tick` | tickIntents() 手动评估，返回 fired（走查/调试口） |

`/api/intents/tick` 先于 `<id>` 动态匹配显式判断（'tick' 不是合法 uuid 但显式优先更稳）。webServer.register 列表加 `/api/intents`。

`graph()` 返回加 `intents` 字段（全量，体量小）——/api/state 顺带可见，为后续脑图页只读列表留口。

## 6. 插件装配（index.ts）

```ts
// standing intents 定时评估：time 型到点触发（event 型在 ingest 路径即时评估）
const intentTick = setInterval(() => {
  const fired = brain.tickIntents();
  if (fired.length) log(`intent tick：${fired.length} 条到期触发`);
}, 60_000);
intentTick.unref();
```

零配置旋钮：intent 只在显式创建后存在，评估确定性零成本；dsh 无发送路径故只落日志。

## 7. 与 plan 的出入

| plan 表述 | 本设计 | 理由 |
| --- | --- | --- |
| fireAt? 与 dailyAt? 并列可选 | 互斥恰好其一 | 双给语义歧义（先一次性还是每日？）；update 设一清另一，create 双给报错 |
| 「ingest 路径对 event 型做确定性匹配、定时器对 time 型到点判定」 | ingest 顺带调 tickIntents | 有流量时 time intent 立即触发不等空闲 tick；幂等无副作用 |
| cooldownUntil 字段 | 存储字段=fire 时写入的 lastFiredAt+cooldownMs | 快照/ops 自含结果态，重放无需重算 |
| MemoryNote.source 四值 | 同四值 + 继承规则（巩固同质继承/混合归 user） | 源头可追溯且不发散 |
| 脑图页「可先只读列表」 | 本迭代不动 page.html | UI 明确后置；graph() 已带 intents 字段备好数据口 |

## 8. 成本与风险

- **成本**：intent 评估=内存 Map 遍历+子串/正则匹配，零 LLM 零 embedding；tick 60s 一次、pending 量级个位数。蒸馏跳过反而省调用（agent-only 批次不再白调 LLM）。
- **风险**：正则 match 用户可控 → 创建/更新时编译校验+匹配 try/catch 兜底；ReDoS 面=自托管单人工具可接受，词表文档注明。intent-fire op 携带结果态保证重放确定。dailyAt 时区换算用 Intl 不动点迭代，Asia/Shanghai 无 DST 精确。
