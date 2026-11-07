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

1. ✅ `npm run build` + `node --test test/` 全绿（162/162）。
2. ✅ 部署：备份 `backups/dsh-qqbot-brain-pre-v0.2.0-20261107-2254.tgz` → rsync dist+package.json → restart active（2026-11-07 14:54 UTC 启动日志确认）。
3. ✅ u:demo 画像 PATCH：5 个〔私〕段（恋人关系/昵称/互动/坦诚与约定）—公开核保留群主/考研/菠萝/宿舍。
4. ✅ 标域 demo：`dbf7162a`/`1fbd1c03`/`832f1a89`/`f7485370`/`96fe6849`（`a7c9ce4f`/`e6b717d7` 已无数据不在会话表，无需标）。
5. ✅ 验证：线上数据副本跑 assemble——群(demo发言/花发言)私密关键词 0 命中；私域一会话画像私段+同域跨群召回正常。
6. 顺手（可选）：sess:17429483 误归因群画像清空或重写（P0-2 的临时缓解，正式修另立项）。

### 迁移补录（2026-11-08，扫描补标）

域标记只按会话收池，**管不到「私话写进群会话池」的散兵**。全量扫描未标域会话的私密关键词命中 4 条，其中 1 条误报（花「比试约定」=打赌），3 条 PATCH `private:'demo'` 归域：

- `74a652ec` semantic「demo 与鲸鱼娘是恋人关系…亲密约定」← 历史泄漏主源本体
- `1d9f4578` semantic「小余昵称+送裙子」
- `d39072d4` episodic「小余/鲸鲸/じんじん昵称轮换」

**经验**：域迁移后应跑一次「未标域会话 × 私词」散兵扫描补标（本条已补入流程）。复验：群主动搜私词 0 命中；3 条在私域内以 `[跨群]` 正常召回（note 物理留群池、scope=demo 控可见）。

## 回滚

- 数据回滚：清 `sessionDomains`（删标记 op 或快照直改）→ 全部回公开；note.private 手动覆盖残留=各条自身域，无扩散。
- 代码回滚：旧代码忽略新字段与新 op（apply 未知字段跳过），无破坏性；`〔私〕` 标记变明文残余（化妆品相）。
