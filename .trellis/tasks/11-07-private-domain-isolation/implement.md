# 实施清单

按依赖序执行；每步可独立验证。

## 1. 数据模型与存储

- [x] `types.ts`：`MemoryNote.private?: string`；`NoteDraft.private?: string`；注释三态（undefined=派生 / domain名 / sessionId=原地私密 / 'public'=强制公开）。
- [x] `store.ts`：
  - `sessionDomains = new Map<string,string>` + op `{op:'sess-domain', sessionId, domain}`（空域=删除）；Op union / apply / 快照持久化（`sessionDomains`，缺省兼容）。
  - **`sess-domain` 进 graphVersion bump 列表**（检索器池缓存依赖它，不 bump 标域不生效）。
  - `sessionDomainOf(id)` / `setSessionDomain(id,domain)`（拒收 `'public'` 作域名）/ `isPrivateSession(id)`。
  - `sanitizeNote` 透传 `private`；`updateNote` patch 加 `private`，apply 用 `'private' in op.patch`（`''`/`'public'`→清除为派生态）。
  - `mergeNotes` patch 加 `private: keep.private ?? drop.private`。
  - `exportData`/`importData` 带 `sessionDomains`。
- [x] `Brain`：`noteScope(n)`（=`n.private ?? sessionDomainOf(n.sessionId)`）、`scopeVisible(n, sessionId)`、`setSessionDomain`、`isPrivateSession` 门面。**addNote 不需要动**（域是派生的）。

## 2. 注入过滤

- [x] `assemble`：`visible` 加 `this.scopeVisible(n, sessionId)`——topK/attitude保底/xpool/reinforce 四路同口径。
- [x] `endOfTurn` 的 `existing` merge 候选列表同样加 `scopeVisible`。
- [x] `preview()` 加同款过滤（成为验证工具）；返回命中带 `private` 字段。
- [x] `graph()` 节点输出加 `private`/生效域。

## 3. 画像 `〔私〕`

- [x] `store.ts`：`stripPrivateSegments(text)` + `stripPrivateMarks(text)`（私域显示去标记符）；`mergedUserProfile`/`profileOf` 加 `includePrivate`。
- [x] `assemble`：画像两路按 `isPrivateSession(sessionId)` 调 includePrivate。
- [x] `distill.ts` 四 prompt 各加 `〔私〕` 约定一句；review 侧加「保留已有标记」。
- [x] `reviewAndWriteProfiles`：review 输出 `〔私〕` 计数 < previous 时打 warning 日志。

## 4. 判重/合并边界

- [x] `findNearDup`：候选 `noteScope` 与写入侧不一致即跳过。
- [x] `sweepNearDups`：聚类先按 `noteScope` 分组。

## 5. API / 脑图页

- [x] `http.ts`：`POST /api/sessions/domain`；`/api/sessions` 带 `domain`；`/api/notes` POST/PATCH 接 `private`。
- [ ] 脑图页：会话卡私域编辑 + note 私域字段 + 图谱徽标（**后置**——本期 API/graph 徽标字段已就位，UI 下轮补）。

## 6. 测试（test/brain.test.ts 沿用 mockDistiller/tmpStore）

- [x] 域标记 → 私域 note 对公开会话 assemble 三路零出现；对同域会话可见。
- [x] sessionId 私钥条仅原会话可见；`'public'` 覆盖放行。
- [x] 画像 `〔私〕` 剥句双向（公开剥句、私域去标记保文）。
- [x] findNearDup/sweepNearDups 跨域不并；mergeNotes 取严。
- [x] sess-domain op 重放与快照往返；export/import 保 domain+private。
- [x] 标域后 assemble 立即生效（graphVersion 缓存回归测试）。

## 7. 部署与迁移（顺序敏感）

1. `npm run build` + `node --test test/` 全绿。
2. 部署：rsync `dist`+`package.json` → `sudo systemctl restart dsh-qqbot`（runbook 见 AGENTS.md）。**此刻起 `〔私〕` 剥句已生效，先标画像再标域也无窗口期**。
3. 预起草的 u:demo 带标记画像 PATCH 上去（目标句：恋人关系/亲密约定/防护约定；文本在部署前准备好）。
4. 标域（`POST /api/sessions/domain`，逐个）：`dbf7162a`、`1fbd1c03`、`832f1a89`、`f7485370`、`96fe6849`、`a7c9ce4f`、`e6b717d7` → `demo`。**派生模型无回填步骤——标完即收敛**。
5. 验证：`/api/query?session=17429483` 或直接跑 assemble(speaker=demo)，grep `恋人|亲密|约定|防护|吹头发` 零命中；私域会话里确认仍在。
6. 顺手（可选）：sess:17429483 误归因群画像清空或重写（P0-2 的临时缓解，正式修另立项）。

## 回滚

- 数据回滚：清 `sessionDomains`（删标记 op 或快照直改）→ 全部回公开；note.private 手动覆盖残留=各条自身域，无扩散。
- 代码回滚：旧代码忽略新字段与新 op（apply 未知字段跳过），无破坏性；`〔私〕` 标记变明文残余（化妆品相）。
