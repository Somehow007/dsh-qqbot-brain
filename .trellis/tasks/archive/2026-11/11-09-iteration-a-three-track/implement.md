# 迭代A 实施清单

> 顺序执行；每步可独立验证。验证命令：`cd dsh-qqbot-brain && npm run typecheck && npm test`。

## Step 1 — types.ts（schema + 判定原语）

- [ ] `MemoryNote.self?: boolean`、`NoteEmotion` 不动、`EmotionState.personaId?: string`、`NoteDraft.self?: boolean`、`Turn.personaId?: string`
- [ ] `WHALE_PERSONA_IDS` / `WHALE_CHARACTER_ID` 常量
- [ ] `isSelfContent` / `resolveSelfFlag` 导出函数
- [ ] 验证：`npm run typecheck`

## Step 2 — store.ts（持久层）

- [ ] `PersonaEntry` +`characterId?/moods?`；`createPersona`/`savePersona` 扩展签名（extra/patch，缺省键保留 prev）
- [ ] `apply` persona op 保留附加字段；update op patch+apply 加 'self' 三态
- [ ] `addNote` self 归一（resolveSelfFlag）；`sanitizeNote` self 透传+启发式；`sanitizeEmotion` personaId 透传
- [ ] `importData` personas 放行并写入 characterId/moods
- [ ] `personaEntry(id)` 访问器
- [ ] 验证：typecheck + 现有 store/persona 测试不回退

## Step 3 — emotion.ts + distill.ts

- [ ] `apply` 加 personaId 参；`describeState` 拆出
- [ ] PROMPT 加 self 说明+模板字段；`parseDistillOutput` 解析 self
- [ ] 验证：typecheck + parseDistillOutput 相关测试

## Step 4 — brain/index.ts（核心）

- [ ] characterOf/trackVisible/trackKeyOf 原语；attitudeVisible→trackVisible 全调用点（assemble/existing/findNearDup→trackKey）
- [ ] ingest 批次戳 + batchPersonaId + endOfTurn 全量替换（existing/归并/戳/情绪/profile writer/forget 范围）
- [ ] emotionFor/emotionStamp personaId 化；assemble/endOfTurn/consolidate/addNote 接入
- [ ] findAttitudeSameObject character 口径；sweepNearDups trackKey 守卫；findNearDup 草稿签名
- [ ] consolidate：eps+sessionsNeedingConsolidation 过 trackVisible；srcPersona 角色众数→组内 personaId 众数；notePid 规则（attitude|self→srcPersona）
- [ ] regenerateProfile evidence 过 trackVisible
- [ ] migrateTracks() 三步迁移
- [ ] graph() notes 带 self
- [ ] 验证：typecheck + `npm test`（预期个别旧测试需按新口径更新——先跑看哪些挂）

## Step 5 — http.ts + page.html + src/index.ts

- [ ] personas POST/PATCH body 新字段（PATCH 键存在才传 patch）；notes POST/PATCH self
- [ ] page.html 自我徽标 + `.badge.self` CSS；graph notes.self 已在 Step4
- [ ] src/index.ts apply() 调 `brain.migrateTracks()` + 启动日志
- [ ] 验证：typecheck + `npm test`

## Step 6 — 测试补齐（brain.test.ts + eval）

- [ ] design.md §8 清单逐项落测试；eval cases.json/run.ts 支持 personas+activePersonaId 与隔离用例
- [ ] 验证：`npm test` 全绿 + `npm run eval`（无 key 也跑 lexical）

## Step 7 — 全量验证 + 构建

- [ ] `npm run typecheck && npm test && npm run build && npm run eval`
- [ ] `git diff` 自查一遍（重点：trackVisible 四路口径、迁移幂等、成本零新增 LLM）

## Step 8 — 部署 + 云端走查（iteration-plan §2.5）

- [ ] 本地全绿后：成对备份（`~/backups/pre-A-*.tgz` plugin+brain-data）+ `/api/export` 基线快照
- [ ] `npm run build` → rsync `dist`（不带尾斜杠）+`package.json` → `sudo systemctl restart dsh-qqbot`
- [ ] 走查 7 步：启动日志迁移计数 → /api/ops 审计 → whale 轨不回归 → gentle↔devotion attitude 互通（角色级证据）→ self 隔离（assemble 注入口径）→ 情绪跨角色中性 → 回滚预案确认
- [ ] 走查结果记入本 task journal/prd Resolution

## Step 9 — 收尾

- [ ] spec 更新（backend/index.md 三轨口径）+ MAP.md/README.md 保鲜核对
- [ ] `.trellis/CHANGES.md` 追加广播行
- [ ] `task.py archive`（补 Resolution 四段）+ `add_session.py` journal
