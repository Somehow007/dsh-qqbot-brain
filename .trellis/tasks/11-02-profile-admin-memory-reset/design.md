# Design — 人物画像管理与记忆重置

## 改动边界

| 层 | 文件 | 改什么 |
|---|---|---|
| store | `src/brain/store.ts` | `reset` op 加 `keepPersona`；新 `del-range` op；`resetMemory()`/`deleteNotesInRange()`/`hasProfile()`/`profileEntry()` |
| 情绪 | `src/brain/emotion.ts` | `EmotionEngine.reset()` 清内存 states |
| 蒸馏 | `src/brain/distill.ts` | `draftProfile(subject, notes, persona, ctx)` —— 复用 `call()`，输出 `{"profile":"..."}` 走 `parseDistillOutput.profile` |
| Brain | `src/brain/index.ts` | `updateProfile`/`deleteProfile`/`regenerateProfile`/`purgeNotesInRange`/`resetMemory` |
| HTTP | `src/server/http.ts` | `PATCH /api/profiles`、`DELETE /api/profiles?id=`、`POST /api/profiles/regenerate`、`POST /api/notes/purge`、`POST /api/reset`；webServer.register 列表补 3 条 |
| 页面 | `src/server/page.html` | 画像卡三按钮（编辑/重生成/删除）；备份迁移页「危险区」（时段删除+记忆重置）；OP_CN/opDesc 补 del-range |
| 测试 | `test/*.test.ts` | store 重放兼容、del-range 语义、http 端点、regenerate 成功/失败（注入 fetchImpl） |

## Op 设计（可重放是硬约束）

```ts
| { op: 'reset'; keepPersona?: boolean }                       // 旧记录无字段=全清（语义不变）
| { op: 'del-range'; from: number; to: number; ids: string[] } // ids 必带：区间谓词重放不确定
```

`del-range` 不能只存 from/to：重放时按区间重算会把「该 op 之后才入库、但 createdAt 落在区间内」的记忆误删（典型：先按时段删除、再导入备份）。带 ids 后 apply 只删显式集合，新旧语义各自确定。

`persist()` 的 graphVersion 递增条件加 `del-range`（`reset` 已在列）。

## Brain 新 API 语义

- `resetMemory()` → 计数 → `store.resetMemory()`（persist `reset{keepPersona:true}`）→ `emotion.reset()` + 清 turnBuffer/historyBuffer/turnCounter → 返回各类清空数量。distilling/digesting 不动（在飞任务写完即落库属正常竞态）。
- `purgeNotesInRange(from, to)` → `store.deleteNotesInRange`（`createdAt` 含双端点；空集不落 op）→ 返回删除数。
- `updateProfile(key, {name?, text})` → key 不存在 404 语义；`setProfileEntry(key, text, {name, sessionId: 首session, reviewed: text})`——人工改=已审，但不锁定蒸馏修订。sessions 由 apply 里 prev.sessions 并集保底。
- `deleteProfile(key)` → 不存在 false；否则 `setProfileEntry(key,'')`。
- `regenerateProfile(key)`：
  1. `distiller.enabled` 否则 `{ok:false,'蒸馏服务不可用'}`；`profileEntry` 无 → `'画像不存在'`
  2. 归集证据：`u:` 键 → `splitActor(n.actor).openid === key.slice(2)`；`sess:` 键 → `n.sessionId === key.slice(5)`；按 createdAt 升序取末 60 条；空 → `'该对象暂无记忆'`
  3. `draftProfile(subject, notes, personaForPrompts(), ctx)`：`u:` → `用户「${name}」`；`sess:` → `本会话群聊整体`；prompt 规则与 PROFILE_REVIEW_PROMPT 同口径（只留稳定信息、禁角色自身、可留 1-2 锚点）
  4. `reviewProfiles([{actor:name, previous:entry.text, candidate:draft}])` → undefined=调用失败；''=审核判无稳定信息 → 均不改数据、返回原因
  5. 命中 → `setProfileEntry(key, text, {name, sessionId: sessions[0], sessions, reviewed:text})`

## HTTP 契约

| 端点 | 入 | 出 |
|---|---|---|
| `PATCH /api/profiles` | `{key, name?, text}` 非空 text | 200 `{ok, profiles}` / 400 / 404 |
| `DELETE /api/profiles?id=` | key | 200 `{ok, profiles}` / 404 |
| `POST /api/profiles/regenerate` | `{key}` | 200 `{ok, text, profiles}` / 409 `{error}` |
| `POST /api/notes/purge` | `{from, to}` 有限数且 from≤to | 200 `{ok, deleted}` / 400 |
| `POST /api/reset` | — | 200 `{ok, cleared:{notes,profiles,emotions,digests}}` |

均要求既有 token 校验链路；webServer.register 白名单补 `/api/profiles/regenerate`、`/api/notes/purge`、`/api/reset`（`/api/profiles`、`/api/notes` 已注册）。

## 页面

- 画像卡（renderSessions 的 person/session 卡）：`.sid` 行追加 编辑/重生成/删除 小按钮（合并按钮保留）。编辑=把 `.prof` 换成 textarea+name input+保存/取消；重生成/删除走 `confirm()`；regenerate 失败 `alert(error)`，与现有 merge 报错风格一致。
- 备份迁移页末尾加「危险区」：
  - 时段删除：两个 `datetime-local` + [预览数量]（客户端数 `STATE.notes` 的 createdAt，无需新 API）+ [删除] confirm 带数量 → POST purge → alert 结果 → `load()`
  - 记忆重置：[重置记忆] → confirm 文案列明清什么保什么 → POST /api/reset → alert → `load()`
- `OP_CN` 加 `del-range:'按时段删除'`；`opDesc` 对应分支 `删除 N 条（起 ~ 止）`。

## 测试计划

- store：`reset{keepPersona}` 保人设清其余；旧格式 reset 重放仍全清；`del-range` 只删 ids 且重放后导入老 createdAt 记忆不被误删（核心回归）。
- brain：`regenerateProfile` 三路（mock fetchImpl 成功改写 / 审核空串不写 / distiller disabled 409 语义）；`resetMemory` 后 `emotion.get` 回中立、`assemble` 无旧画像行。
- http：PATCH/DELETE profiles 200/404；purge 400（from>to）与 deleted 计数；reset 后 personas 仍在。
- 既有 `node --test` 全套 + typecheck + build。

## 风险

- regenerate 调 LLM：超时由 distiller.cfg.timeoutMs 兜底；按钮点击间页面无锁，连续点击产生多次调用——UI 侧按钮 disable 到响应返回。
- 手动编辑与下一轮蒸馏的覆盖：属预期行为（PRD Out of Scope 已声明不锁定）。
