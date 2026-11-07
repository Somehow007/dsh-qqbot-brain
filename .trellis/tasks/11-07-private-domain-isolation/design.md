# 私密域隔离 · 技术设计

口径已定（用户 2026-11-07）：**硬隔离**——私域内容在公开会话 prompt 中零存在，不做降级提示行。

## 模型：具名私域 + 作用域派生

每条 note 有一个**生效作用域**（读侧派生，不写时盖章）：

```
sessionDomain: Map<sessionId, domainName>     // 如 'demo'；无标记=公开会话
note.private?: string                          // 手动覆盖：domain名 / 某sessionId / 'public'；undefined=派生
noteScope(n)   = n.private ?? sessionDomain.get(n.sessionId)     // undefined→公开
targetKey(T)   = sessionDomain.get(T) ?? T
visible(n, T)  = !scope || scope === 'public' || scope === domainOf(T) || scope === T
```

- 私域会话产出的 note：**自动**生效域作用域（派生自 n.sessionId，蒸馏/巩固/写路径零改动）。
- `n.private` 只作手动覆盖：私域良性事实标 `'public'` 放行；公开会话敏感条标 `sessionId`「原地私密」；手写照旧。
- 域标记 = 「当前受众断言」，改域/撤域立即作用于全部历史 note——**存量零回填**。
- 具名 domain 而非 boolean：今天只有 `demo`；未来第二个人的私域换新 domain 名即天然隔离。
- `domain` 名与 sessionId 共用同一键空间：sessionId 是宿主派生 hex 串，域名是人读单词；保留字 `'public'` 禁作域名（校验拦）。

## 改动点

### 1. 存储（store.ts / types.ts）

- `MemoryNote.private?: string`；`NoteDraft.private?: string`；`sanitizeNote`/`importData` 透传。
- `sessionDomains: Map<string,string>` + op `{op:'sess-domain', sessionId, domain}`（空域=删除回公开）；快照持久化（缺省兼容）；**该 op 必须 bump `graphVersion`**——检索器按 graphVersion 缓存池，不 bump 则标域后旧索引仍放回私域条。
- `updateNote` patch 白名单加 `private`；apply 用 `'private' in op.patch` 存在性判断（区分「不改」与「清除」），`''`/`'public'` 归一为清除。
- `mergeNotes` patch 加 `private: keep.private ?? drop.private`（任一覆盖则结果取覆盖，取严）。
- `exportData` 带 `sessionDomains`；`importData` 回放。
- `BrainStore.sessionDomainOf(id)`、`setSessionDomain(id,domain)`、`isPrivateSession(id)`。

### 2. 注入过滤（assemble）

```ts
// 私钥匹配：note 生效作用域须与目标会话域相同（或为该会话本身）
const visible = this.store.allNotes().filter((n) =>
  this.attitudeVisible(n) && !n.absorbedAt && this.scopeVisible(n, sessionId));
```

一行管住：主检索池 topK、attitude 昵称保底、xpool 跨群召回、reinforce 副作用——四路同口径。

**同步要改的旁路**：
- `endOfTurn` 的 `existing` merge 候选列表同款过滤（否则 GLOBAL 私密手写条进公开会话蒸馏 prompt，且 mergeIndex 可让公开会话改写私域条）。
- `preview()` 检索模拟器同样过滤（顺便变成干跑验证工具）；输出带 `n.private` 便于核对。
- `graph()` 节点输出带 `private`/生效域徽标。

### 3. 画像 `〔私〕` 分段标记

- 约定：句首 `〔私〕` 到句末（`。`/换行/文末）为私域内容。
- `stripPrivateSegments(text)`：`/〔私〕[^。\n]*(。|\n|$)/g` 剥句 + 空白收束；私域会话注入时反向只去标记符保内容。
- `mergedUserProfile`/`profileOf` 加 `includePrivate` 形参；assemble 按 `isPrivateSession(sessionId)` 决定（扁平信任域：任何已标域会话可见私段——见风险节）。
- distill 四 prompt 各加约定：写侧「私密内容写成〔私〕开头独立句」；review 侧「保留已有〔私〕标记」。
- **选行内标记而非拆 `privateText` 字段**：画像单卡单文本，审核/合并/重生成/手编全链路零分叉；脑图页可见可手改。
- **保标记监控**：review 输出 `〔私〕` 计数少于 previous 时打 warning（掉标 fail-open，日志可见即可人工纠）。

### 4. 判重/合并边界

- `findNearDup`：候选生效域与写入侧不一致即跳过（endOfTurn/consolidate 同覆盖）——同义事实公私各存一条，语义正确。
- `sweepNearDups`：聚类先生效域分组，不跨组并。
- `findAttitudeSameObject` 本会话内查，天然不越域。
- `existingProfiles` 喂蒸馏的画像含 `〔私〕` 原文（内部 prompt，需原文才能保留标记）。

### 5. API / 脑图页

- `POST /api/sessions/domain {sessionId, domain}`；`GET /api/sessions` 每项带 `domain`。
- `POST /api/notes`、`PATCH /api/notes/<id>` 接 `private`（`''`/`'public'`=强制公开）。
- 脑图页：会话卡私域标记编辑 + note 私域字段 + 图谱私域徽标（可后置，先用 curl/API）。

## 备选方案与取舍

| 方案 | 取舍 |
|---|---|
| 写时盖章 `n.private=domain` + 存量回填 | 弃用——读侧派生同效且零回填、撤域自动生效；盖章还把「当时的域」固化成不可变，运维更绕 |
| 纯内容判定（distill 标 private） | 弃用——非确定、漏标即泄，且救不了画像路径 |
| 画像拆 `privateText` 字段 | 弃用——审核/合并/重生成三路分叉维护 |
| 参与者数自动推导私域 | 弃用——「单人群」随第二人发言翻转有泄漏窗口；域标记即「受众断言」，人工显式更诚实 |
| 域标记存 config(patch.yml) | 弃用——改域要 redeploy；store+op 与画像/人设同模型，即时生效 |

## 风险与边界

- **域标记=受众断言，非发言人过滤**：私域会话里若有域外人发言，其 prompt 也能看到域内内容——但该会话 transcript 本身对他就可见，QQ 层边界已破，脑侧再做发言人级过滤是剧场。标记时确认「能在此会话发言的都属该域」。
- **扁平信任域**：私段画像在任何已标域会话可见。多域并存时若想要「demo 私段只在 demo 域」，后续把 `〔私〕` 升级 `〔私:demo〕`——本期单域无此需求。
- **fail 方向**：误标域=群里「失忆」（安全）；域数据丢失=回公开（泄漏）——与全部脑数据同寿命（op 流水+快照双写）。
- **良性事实困私域**：私聊里的普通事实群召回不到——fail-closed 取舍，`private:'public'` 可手动放行。
- **掉标风险**：画像重写丢 `〔私〕` = fail-open；warning 日志 + 干跑 grep 周期核对兜底。
- **不覆盖的面**：demo 自己在群里说私密内容（本就是公开）；模型从当前消息推断；第三方 LLM 处理 transcript（系统固有问题）。

## 验证

- 单测（test/brain.test.ts 同款 mockDistiller）：域派生可见性、三路过滤、画像剥句双向、判重边界、private 覆盖三态、导入导出/op 重放一致。
- 干跑：`/api/query?session=17429483&q=...`（过滤后等价 assemble 池）或直接脚本跑 assemble，grep `恋人|亲密|约定|防护|吹头发` 应零命中。

## 完成后效果推演（2026-11-07 自评补记）

### 各场景注入结果

- **demo 在群 17429483 发言**：`[画像]` 只剩公开段（大学生/镇江/不吃菠萝…）；attitude 保底只剩公开立场（`对demo：亲密节奏…` 域外）；xpool 只剩公开条目——顺带修好 P2-10：死会话 832f 标 demo 后，其 15 条残留 sem（梗图×3 等）不再占群跨群召回槽位。
- **demo 私聊/恋人线群**：全量画像（含私段，标记符剥掉）；demo 域内全部 note 互通——私聊与恋人线群共享同一记忆池（同一受众，预期行为）。
- **花在群发言**：u:花 画像（本无私段）+ 她的公开记忆；demo 域内容零可达。
- **新出现的群**：默认公开→私域内容 fail-closed 不可达；其产出默认公开。
- **花在私域会话发言**（假设）：可见 demo 域内容——「域=受众断言」边界的既定取舍，QQ 层 transcript 对她本就可见。

### 记忆池走向：自然分层为双轨

1. **公开池**（群+manual）与 **demo 域池**（私聊+恋人线+死会话残留）各自独立演化；判重按域分片 → 同一事实两处各说一遍会各存一条，各自衰减/强化，语义正确。
2. **巩固继承域**：私域 episodic→semantic 全程带域，恋人线沉淀不出域。
3. **强化不对称**：私域条只在私域会话被唤起强化→在群里不再刷 hits/R；死会话残留只在 demo 域内可被唤起，噪声自然沉底。
4. **evict 注意点**：私域条唤起机会变少，hits=0 且久未唤起的私域条 30d+ 可能物理遗忘——对高 imp 私密事实，衰减前没被聊到就会丢。本来就存在的机制，域化后概率略增，值得知晓不阻塞。
5. **态度轨双滤**：人设轨×域两层过滤——群里看到的立场=对群友的立场，私域的恋人立场不出域；人设一致性反而变好。
6. **恢复旧备份不再泄**：scope 派生自会话标记而非 note 字段，导入旧数据后只要会话标了域即自动收域（派生模型的隐含红利）。

### 画像走向：u:demo 变两层结构

- **公开核**（两边会话的蒸馏都会重写）+ **私尾**（`〔私〕` 段，主要由私域会话的证据修订）。
- 群侧重写时私段靠「review 保标记」传递：群侧没有私密证据，正常路径不会新增私段，也不会改写私段内容——风险只剩掉标（warning 日志兜底，建议每周 grep 一次 u:demo 画像核私句）。
- u:花/u:开心 全公开；sess:17429483 误归因画像建议部署时顺手清（P0-2 临时缓解）。
- 手动通道兜底演化意外：`private` 三态覆盖（放行/密化/原会话钉死）+ 画像手编。

### 残余真实风险排序（投产后盯这些）

1. `〔私〕` 掉标（fail-open，慢漂移）→ warning 日志 + 定期 grep。
2. 域标错对象（把真公开群标成 demo）→ op 流水可审计 `sess-domain` 记录。
3. sessionId 轮换 → 新会话回公开=失忆（fail-closed，重新标域即可）。
4. 私域高 imp 事实久未唤起被 evict → 必要时手动 reinforce。
