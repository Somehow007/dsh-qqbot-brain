# 记忆/人格迭代升级方案

> 2026-11-09 设计稿。输入：两轮调研合并借鉴清单（`archive/2026-11/11-09-memory-persona-arch-research/persona-companion-survey.md` §C.3，10 条）+ 人设切换设计（`tasks/11-08-persona-switch-design`，P0-P3 + 走查修正点）+ 叶瞬光人设包（`personas/ye-shunguang/`，已就绪）+ companion 评估（`tasks/11-09-companion-agent-eval`）。
>
> 定位：**方案文档**，不是实现任务。每个迭代落地时另建/续用对应 task 走 Trellis 流程。

## 0. 总原则

- **稳步 = 小步上线**：每迭代走「本地验证（typecheck/test/build/eval）→ 成对备份 → rsync+restart → 云端数据走查 → 用户自测 → 归档」闭环，不攒大版本。
- **地基先行**：人设切换正确性（迭代 A）是叶瞬光接入与 companion 双方的共同前置——先不修，自我内容双向泄漏，后面所有「按角色隔离」的设计都建在沙上。
- **成本一线**：每个新增 LLM 调用/注入段先过成本评估（输入有界、可关、失败静默）；确定性机制优先于 LLM 机制（触发判定、门控、去重能用规则就不用模型）。
- **不为 hypothetical 铺面**：companion 专属能力只落内核原语（library 级 API + JSONL op + HTTP 面），壳层与发送路径另立任务；dsh 插件侧不加用不上的 tool 注册。
- **dsh first-class**：新机制仍先在 dsh 侧验证；例外是 companion 原生机制（主动开口发送、agent-initiated provenance），它们本来就没有 dsh 侧对应物。

## 1. 迭代路线图

```
A 人设切换地基（三轨模型 + 情绪隔离 + 批次戳）
  └→ B 叶瞬光接入 + 云端自测          ← 用户最早能「玩到」的里程碑
       ├→ C 主动召回 brain_search     ← companion 前置①（内核原语，dsh 侧顺带受益）
       ├→ D prospective memory + provenance ← companion 前置②③
       └→ E 记忆质量深化（储备项，按 eval/走查信号逐个取用，可与 C/D 穿插）
F companion 壳层 MVP                  ← 另立任务，消费 C/D 能力（见 11-09-companion-agent-eval）
G 体验层/通用化小项                   ← 穿插在各迭代间隙做，不单独排期
```

| 迭代 | 内容 | 对应借鉴条目 | 量级 | 前置 |
| --- | --- | --- | --- | --- |
| A | 角色→人设两级三轨：`MemoryNote.self` + `characterId` + 情绪按角色 + 蒸馏批次戳 | 人设切换 P0（11-08 定案） | 中（schema+检索+迁移） | 无 |
| B | 叶瞬光 seed self 标记 + merge 导入 + 激活冒烟 + 云端走查 | 人设包就绪 | 小 | A |
| C | `Brain.search` 主动召回原语 + recall-intent 门控设计 | 清单 #1 | 小-中 | 无（建议 A 后） |
| D | standing intents（prospective memory）+ Turn provenance/session-kind | 清单 #2 #6 | 中 | 无（companion 前置） |
| E | entity boost / BFS-lite / 双时态 / dreaming pass / USER.md 式用户模型 | 清单 #3 #4 #5 #7 | 各小-中，逐个取 | 按需 |
| F | companion 壳层 MVP（web 1-on-1 + chat loop + 主动开口 + Diary） | 清单 #10 + companion 评估 | 中（另立任务） | C、D |
| G | 品牌跟人设 / pack 导入 API / 播种通用化 / per-session 展望 | 清单 #9 + P1-P3 | 小，穿插 | 各自独立 |

---

## 2. 迭代 A：人设切换地基（角色→人设两级三轨）

### 2.1 目标

把「事实共享 · 态度分轨」升级为「世界轨共享 · 自我轨按角色隔离」，消除换角色（大肥鱼↔叶瞬光）时的双向泄漏；同角色换版本（gentle↔devotion）共享自我轨。依据 `11-08-persona-switch-design` 已定案 + 走查修正点。

### 2.2 改动清单（file 锚点）

**schema / store 层**

- `types.ts`：`MemoryNote.self?: boolean`（第一人称/自我内容标记）；`EmotionState.personaId?: string`（情绪归属人设标签）；`NoteDraft.self?`；`Turn.personaId?`（ingest 时钉形成时人设）。
- `store.ts`：
  - `PersonaEntry`（store.ts:36）加 `characterId?: string`（缺省=自身 id）、`moods?: string[]`（预留，B/G 用）；`persona-save` op 携带整对象，snapshot/export 自动透传。
  - `sanitizeNote` 透传 `self`；`sanitizeEmotion` 透传 `personaId`；`importData` 的 personas 校验放行 `characterId/moods` 并写入（现走 `createPersona(name,text,id)` 会丢附加字段，需扩展签名或直建条目）。
  - `update` op patch 联合类型加 `'self'`（脑图手动修正 + 迁移回填用）。
- `emotion.ts`：`apply()` 签名带 personaId（或 Brain 落盘前补戳）；`get()` 保持纯衰减，角色不符判定放 Brain 层（engine 不认识人设）。

**Brain 层（index.ts）**

- `attitudeVisible`（index.ts:371）泛化为 `trackVisible(n)`：`kind==='attitude' || n.self===true` 的条目仅当 `characterOf(notePersonaId(n)) === characterOf(activePersonaId)` 时可见；无人设期全可见（兼容）。character 解析：`personaEntries.get(pid)?.characterId ?? pid`（人设被删后其条目 character 回落 personaId 本身=安全隔离）。
- 同步替换全部调用点：assemble 可见池（:143）、endOfTurn existing 列表（:262）、findNearDup（:988）；xpool 跨会话召回吃 `visible` 已过滤池，口径自动一致。
- `findAttitudeSameObject`（:362）与 consolidate `srcPersona`（:746-755）从 personaId 口径改 character 口径——**同对象归并/立場合并按角色不按版本**。
- `sweepNearDups`（:872-901）：簇内合并守卫从「attitude 不互并 + attitude 同 personaId」泛化为 **trackKey**：`att:<char>` / `self:<char>` / `world`，trackKey 不同不互并（防 self 事实被 world 事实吸收丢失轨道信息）。
- `findNearDup`（:979）：同上加 trackKey 判定（draft 侧 self 用同一启发式预判）。
- self 标记双路：`store.addNote` 统一兜底——非 attitude 且 content 命中自我判定（`我`/角色名开头等，规则实现时定稿）→ `self:true`；蒸馏 prompt 增 `"self":true` 可选输出作补充（distill.ts PROMPT + parseDistillOutput），LLM 标注优先、启发式兜底。
- ingest 批次戳：`Brain.ingest` 给每个 Turn 钉 `personaId=activePersonaId()`；`endOfTurn` 批次人设取批内众数（缺省回落 activeId），替换现 `activePid` 用法（:251）——修「切换瞬间在途批次归新人设」窗口。
- 情绪隔离：`emotionStamp/apply` 带批次 personaId；`assemble` 的 emotion section 读时校验 `state.personaId` 的 character 与当前 active character 不符 → 返回中性（`NEUTRAL_EMOTION` 口径，describe 空串=不注入，天然省 token）。存量 emotion 无 personaId → 视作 PRE_TAG（whale）角色，自愈于下次 apply。
- 启动迁移（index.ts，与 absorbCovered 同模式幂等）：
  1. whale 系三人设（whale-gentle/whale-devotion/legacy）补 `characterId:'whale'`；
  2. attitude 同对象跨版本归并：同 session+character+「对X」对象多轨并存时保留较新/较强一条（op 可重放）；
  3. self 回填扫描：存量非 attitude 条命中自我判定 → `self:true`（update op），日志报条数。

**其余**

- `http.ts`：personas API 返回值自动带新字段；`/api/notes` POST/PATCH 透传 `self`（可选，脑图手改用）。
- `page.html`：self 条可选加徽标（小改，不阻塞）；`notePid` 兜底逻辑不变。
- `config.ts`：预计零新增旋钮。

### 2.3 已定决策（2026-11-09 用户拍板）

**attitude 归属：角色级 ✅**

- 立场属于灵魂不属于衣服。whale-gentle/devotion/legacy 三轨 attitude 合并为一条 whale 轨（需一次同对象去重迁移，保较新/较强）；切 gentle↔devotion 立场连续，切叶瞬光归零——符合「版本=衣服」模型。self 轨同理由角色级承载，模型一致。
- 走查可观测差异：gentle↔devotion 切换 attitude 互通（旧行为各自独立），作为迭代 A 走查第 4 步的验证点。

### 2.4 验收标准

- [ ] `npm run typecheck` + `npm test` + `npm run build` 全绿；`npm run eval` 22 例不回退（检索口径变化需补人设隔离用例）
- [ ] 单测覆盖：characterOf 映射（缺省/显式/人设已删回落）；trackVisible 四路口径一致（assemble/existing/nearDup/xpool）；self 启发式命中与不命中边界；批次跨切换时 personaId 取众数；emotion 角色不符读中性、符则正常；import/export 往返保留 self/characterId/emotion.personaId
- [ ] 迁移幂等：重复启动不重复归并/回填（op 重放安全）
- [ ] 线上走查全过（见 2.5）

### 2.5 数据走查（云端，部署后执行）

```bash
# 部署前（成对备份惯例）
ssh ubuntu@124.222.65.169 'tar czf ~/backups/pre-A-$(date +%F-%H%M).tgz -C ~ dsh-qqbot-brain/brain-data 2>/dev/null; tar czf ~/backups/pre-A-plugin-$(date +%F-%H%M).tgz -C ~ dsh-qqbot-brain'
curl -s 'http://124.222.65.169:4099/brain/api/export?token=<口令>' -o /tmp/brain-before-A.json
# 统计基线：notes by kind / by personaId / attitudes by personaId
```

部署后（`systemctl restart dsh-qqbot` 生效）：

1. **启动日志**：brain.log 无异常；迁移日志可见（characterId 补写、attitude 归并 N 条、self 回填 N 条）。
2. **op 审计**：`GET /api/ops?limit=300` 可见 persona-save（characterId）、update（self）、归并 merge/del 类 op；`/api/state` 快照字段完整。
3. **whale 轨不回归**：激活态 whale-devotion 下 `/api/state?session=<真实群session>`——attitude 区仍有 whale 立场行；`/api/query?q=<已知事实>` 命中不变。
4. **角色级生效的直接证据**：脑图切 whale-gentle → attitude 区与 devotion 相同对象立场**互通**（旧行为是各自独立）→ 切回 devotion 验证。
5. **self 隔离预演**：导出快照数 `"self":true` 条目并抽查确为第一人称；whale 激活下 self 条不进 memoryLines（`/api/query` 对 self 内容 query 应不命中——注意 query 走 preview 未过滤 trackVisible，走查以 assemble 注入为准，可用真实会话发一条测试消息看回复或查 debug 日志命中列表）。
6. **情绪**：切换人设后 emotion section 不再带旧角色情绪词（whale→gentle 同角色保留；跨角色中性）。
7. **回滚预案**：恢复 `~/backups/pre-A-*.tgz` 的 brain-data + rsync 回旧 dist + restart。

### 2.6 成本与风险

- **成本**：零新增常驻 LLM 调用；迁移为确定性 op；distill prompt 加 self 字段仅增少量输出 token（可选，失败静默）。
- **风险**：attitude 归并是生产数据改写 → 成对备份 + 归并规则「保较新/较强」+ op 可重放可审计；self 启发式误标 → update op 可手动修，脑图可见。

---

## 3. 迭代 B：叶瞬光接入 + 云端自测

### 3.1 目标

`personas/ye-shunguang/` 人设包灌进生产 brain，激活后用户自测陪伴体验；种子全部正确落 self 轨，双向不泄漏。

### 3.2 改动清单

- `personas/ye-shunguang/generate_seed.py`：非 attitude 种子（semantic 8 + episodic 10）凡第一人称行文加 `"self": true`；attitude 10 条不动（kind 已自带 self 轨）。重新生成 `seed-export.json`（uuid5 确定性 id 不变，幂等）。
- 可选（若顺手）：`POST /api/personas/import-pack` 一等公民入口 `{persona:{name,text,characterId?,moods?}, notes:[...], activate?:boolean}`——把「传文件→merge 导入→激活」三步收成一个调用；B 阶段用现有 `/api/import?mode=merge` 已够，pack API 可放 G。
- `PersonaEntry.moods`（若采纳 3.4 决策）：distill prompt 情绪枚举按 active persona 注入并集；`buildDistillPrompt`/`parseDistillOutput` 签名带允许集合；page.html `EMO_BUCKETS` 对未知 mood 回退 v/a 推断（已有机制）。

### 3.3 部署与走查（云端）

```bash
# 本地：python3 personas/ye-shunguang/generate_seed.py 重新生成；结构校验 self/personaId/kind
# 服务器：成对备份 → rsync dist+package.json → restart
scp personas/ye-shunguang/seed-export.json ubuntu@124.222.65.169:/tmp/
ssh ubuntu@124.222.65.169 "curl -X POST 'http://127.0.0.1:4099/brain/api/import?mode=merge' \
  -H 'X-Brain-Token: <口令>' --data @/tmp/seed-export.json"
# 期望：{ok:true, mode:'merge', notes:28, skipped:0, profiles:0, emotions:0, persona:true}
# 重复导入幂等：notes:0, skipped:28
# 激活：POST /api/personas/activate {id:'ye-shunguang'} 或脑图页切换
```

**冒烟清单**（11-08 走查清单 + 人设包 README）：

- [ ] `/api/state` persona 区 = 叶瞬光 persona.md 全文；attitude 区只剩 ye-shunguang 轨（whale 立场不可见）
- [ ] memoryLines 中 whale self/第一人称条不出现；ye-shunguang 种子可被相关 query 唤起（桂花糖/小师弟/练剑/青溟剑/日记）
- [ ] 情绪行中性（切换瞬间不残留 whale 情绪）
- [ ] 真实会话几轮后：新蒸馏记忆 `personaId='ye-shunguang'`、第一人称条 `self:true`、attitude 落 ye 轨
- [ ] 画像 `lastWrittenByPersona` 随驻留更新；世界轨用户事实两角色共享可见
- [ ] 反向切回 whale-devotion：ye attitude/self 不可见、whale 轨恢复、情绪中性→重新积累
- [ ] 清理路径确认（不实际执行）：`POST /api/notes/purge {"personaId":"ye-shunguang"}` + `DELETE /api/personas?id=ye-shunguang`

### 3.4 决策点

- **MOODS 方案**：推荐 `PersonaEntry.moods?: string[]` 按人设注入蒸馏枚举（叶瞬光需要 温软/坚毅/孤独/影子感 词表，whale 的 炸毛/记仇 不贴）。备选=MOODS 全局加通用词（改动小但两角色共用词表，叶瞬光仍不准）。page 对未知 mood 已有 v/a 回退，风险低。
- **pack 导入 API**：B 用 `/api/import?mode=merge` 已可行；若计划多上人设包，G 提前做 `import-pack`。

### 3.5 验收标准

- [ ] seed-export.json 重新生成，28 条结构合规（self 标记正确、personaId='ye-shunguang'、attitude 格式「对X：…」）
- [ ] 云端 merge 导入计数正确且幂等；whale 数据零损失（总 note 增量恰为 +28，personaId 分布可核对）
- [ ] 冒烟清单全过；双向切换无泄漏
- [ ] 自测期观察项记录进 task journal：影子面语气频率、种子衰减表现、蒸馏 self 标记准确率

---

## 4. 迭代 C：主动召回 brain_search（companion 前置①）

### 4.1 目标

每轮注入 topK 是「被动截断」；陪伴对话常需深挖（「你还记得我去年说的那个…」）。落地**内核检索原语 + recall-intent 门控**，companion 壳层将其包装为 agent tool；dsh 侧零改动（注入路径已覆盖）。

### 4.2 设计

- **内核原语** `Brain.search(sessionId, query, opts?)`：复用 `Retriever.query` + 与 assemble 完全同口径的可见池（trackVisible + scopeVisible + absorbed 过滤）；`opts = { limit?: number; kinds?: ('episodic'|'semantic'|'attitude')[]; crossSession?: boolean; minRel?: number }`。返回 `ScoredNote[]`（含 rel/score/relSrc），供调用方自行格式化。queryVec 走 `queryEmbedding` 缓存同款。
- **recall-intent 门控**（两层，可单用可叠加）：
  1. **确定性预检（零成本）**：召回意图启发式（「还记得/你还记得/之前说过/上次/去年/当时/那个…吗/什么来着」类模式）∧ lane-1 注入命中数 < 阈值 → 自动追加一次深召回段进注入（限 2-3 条、标 [深挖]）。dsh 侧即可用，收益直接。
  2. **agent-initiated tool（companion）**：壳层暴露 `brain_search` tool，模型自判调用；tool 描述写明「注入记忆不足以回答往事细节时用」。每次调用 = 1 次检索（embedding 有缓存），零 LLM 成本。
- HTTP 面：`/api/query` 已有 preview 可作深召回调试入口；如需可加 `depth=1` 参数区分（可选，不阻塞）。

### 4.3 验收标准

- [ ] `Brain.search` 单测：track/scope/absorbed 过滤与 assemble 同口径；kinds/crossSession/limit 选项正确；无 queryVec 时 lexical、带时 emb 双路径
- [ ] eval 新增 recall-intent 子集（从线上 export 抽「旧而弱」记忆构造用例）：深召回 recall@K 较 lane-1 topK 有可测提升，且不引入噪声命中（expectNone 用例不误中）
- [ ] 门控启发式单测：意图词命中/不命中边界；命中但 lane-1 已足够时不追加（成本纪律）
- [ ] 成本核算：深召回仅在意图∧弱命中时触发，输入为 ≤3 行摘录，失败静默

### 4.4 数据走查

- 本地 eval 前后对比报告（recall/误命中率）；线上 export 落 fixture 跑 search 回归；部署后真实会话中「你还记得…」类提问观察注入段是否出现 [深挖] 行（debug 日志）。

---

## 5. 迭代 D：prospective memory + provenance（companion 前置②③）

### 5.1 目标

补齐「主动开口」的内核前置：**standing intents**（会记得在未来触发的意图）与 **provenance/session-kind**（bot 自己说的话不被当用户事实蒸馏）。两者都是 companion 壳层的地基，dsh 侧只做可观测不做发送。

### 5.2 D1 standing intents（prospective memory）

- **schema**：`IntentEntry { id, kind:'event'|'time', text, status:'pending'|'fired'|'expired'|'cancelled', createdAt, fireAt?, lastFiredAt?, cooldownUntil?, maxFires?, firedCount, expiresAt?, personaId?, sessionId? }`
  - `event`：关键词/正则匹配入站文本或 actor，命中→触发；带冷却与次数上限
  - `time`：`fireAt` 时间戳或每日 HH:mm（cron-lite），到点触发
  - aspiration（长程意向+复审期）列为二期，不进首版（OpenClaw 有，我们体量暂不需要——不为 hypothetical 铺面）
- **store**：新 op `intent-add/intent-update/intent-fire/intent-del` + snapshot `intents` Map；JSONL 可重放、审计可见（/api/ops 天然覆盖）。不用 SQLite——体量小，JSONL 一致性优先。
- **Brain API**：`addIntent/updateIntent/cancelIntent/listIntents` + `tickIntents(now)`——ingest 路径对 event 型做确定性匹配、定时器对 time 型到点判定；返回 fired 列表（冷却/预算/expiry 内核强制）。触发评估**零 LLM**；消息生成由壳层决定（1 次 chat 调用/次触发，有 budget 上限）。
- **HTTP**：`/api/intents` CRUD + list（脑图页可先只读列表，UI 后置）。
- **dsh 侧**：intent 可建可查可审计；触发时 brain.log 记 `intent fired`（dsh 无发送路径，不注入消息——诚实降级，不装作能主动开口）。

### 5.3 D2 provenance / session-kind

- `Turn.via?: 'user'|'agent'|'system'`（缺省=user，兼容存量）；`Brain.ingest` 透传。
- **蒸馏口径**：convo 行按 via 标注（agent-proactive/system 行不作为用户发言归因）；**整批无 user 轮次 → 跳过蒸馏**（bot 自己的主动消息+心跳不产记忆/画像/情绪——OpenClaw session-kind 门禁的等价物）。
- `MemoryNote.source?: 'user'|'agent'|'manual'|'import'` 轻量来源戳（可选字段；agent 产出的记忆将来可降权/单独审计）。
- companion 壳层职责（F 阶段实现）：自己的 proactive turn 标 `via:'agent'`，cron/心跳会话标 `via:'system'`。

### 5.4 验收标准

- [ ] intent 生命周期单测全路径：add→（event 命中/time 到点）→fire→cooldown 内不重复→maxFires/expiresAt 边界→cancel；快照重启恢复；op 重放一致
- [ ] tickIntents 确定性：同 now 同输入同输出；无 LLM 调用（mock fetch 断言零调用）
- [ ] provenance 单测：via=agent/system 批次跳过蒸馏；混合批次 prompt 中 agent 行不被当用户事实（distill prompt 快照断言）；MemoryNote.source 落库正确
- [ ] 成本：intent 评估零成本；触发后壳层生成有 budget/cooldown 上限；失败静默

### 5.5 数据走查

- 云端手动 `POST /api/intents` 建一条 event 型测试 intent（关键词=冷门词）+ 一条 time 型（10 分钟后）；观察 brain.log tick 记录与 /api/ops intent ops；验完 cancel/delete 清理。
- 构造 via 标注的 ingest 用例走查 distill 跳过逻辑（单测为主，线上等 companion 壳层落地后真实验证）。

---

## 6. 迭代 E：记忆质量深化（储备项，按信号取用）

五个独立小项，**不排期、不预做**——各自先用 eval/走查证明需求存在再动工（纪律：不为 hypothetical 铺面）。每项完成标准=单测+eval 不回退+走查。

| # | 项 | 借鉴来源 | 触发信号（何时该做） | 量级 |
| --- | --- | --- | --- | --- |
| E1 | **entity boost**：检索分加「与当前发言人/话题实体共现」项 | Mem0 | eval 显示「同实体不同话题」召回弱；companion 上线后用户反馈「TA 不记得我提过的 X」 | 小（retrieval.ts 评分公式 +1 项） |
| E2 | **BFS-lite 图扩散**：topK 命中后沿图谱边一跳补召回（≤2 条标 [相关]） | Zep | 「记忆扩散激活仅有图谱边铺底」短板被走查证实；graphEdges 缓存可复用 | 小-中 |
| E3 | **双时态 valid 区间**：semantic/attitude 加 validFrom/To，「以前…现在…」问答 | Zep | 出现「他以前住X现在住Y」类 query eval 失败 | 中（schema+prompt+page） |
| E4 | **dreaming 回顾重组 pass**：低频全池审视（合并漂移画像/重写过时 semantic/清孤儿 attitude），规则信号门禁+有界 LLM+pre-image 评审面 | Letta/OpenClaw | 记忆池膨胀导致检索噪声上升；画像漂移被走查发现 | 中-大（最慎重，最后做） |
| E5 | **USER.md 式指令用户模型**：「Always/Never/Prefer」指令抽取进画像/attitude，supersede-in-place | OpenClaw | 蒸馏产出「旧偏好残留」类问题被走查发现 | 小-中（先评估与 attitude 重叠度） |
| E6 | **关系事实角色隔离**：画像（世界轨共享）中的「X 与 persona Y 是恋人/亲属」类关系事实是 persona-relative 的，跨角色注入=噪声甚至锚定干扰（实证：流萤激活时画像仍在讲 demo 与鲸鱼娘恋情，`11-15-private-chat-persona-voice`）；候选=蒸馏写画像时给关系事实打 characterId/拆 persona 作用域，assemble 按激活角色过滤 | 本项目三轨模型延伸 | 多角色并存走查发现「A 角色读到 B 角色关系状况」干扰；或私聊人设走查复现 | 中（distill prompt + profile schema + assemble 过滤） |

---

## 7. 迭代 F：companion 壳层 MVP（另立任务，本方案只标依赖）

承接 `tasks/11-09-companion-agent-eval` 已定 MVP：独立目录 companion/、web 1-on-1 自用 dogfooding、单固定 persona+全新 brain-data、chat loop（assemble→chat LLM→reply→ingest/endOfTurn）、主动开口（消费 D 的 tickIntents + 自有发送路径）、`brain_search` tool（消费 C）、Diary 叙事化（清单 #10，产品层）。

**本方案对 F 的承诺**：C 提供 `Brain.search` 原语与门控参考实现；D 提供 intents 存储/tick/触发评估与 via 标注口径；A/B 保证多角色隔离正确。F 立项时把这三块当既成事实消费，不重造。

---

## 8. 迭代 G：体验层/通用化小项（穿插）

不单独排期，见缝插针；每项 ≤ 半天量级：

- **G1 页面品牌跟人设走**：`PersonaEntry.avatar/banner`（文件存 `BRAIN_DATA_DIR/personas/<id>.{png,jpg}`，不进 op 流水——11-08 走查修正点 #6）；page.html 标题/头像/立绘读 active persona；人设包可携带资源文件。
- **G2 persona pack 导入 API**：`POST /api/personas/import-pack`（见 3.2）；配套 `personas/` 目录约定文档化。
- **G3 内置播种通用化**：`src/setup/*.md` 扫描播种或内置人设迁出插件；`DEFAULT_PERSONA`（config.ts:120 鲸文案）中性化。
- **G4 MOODS 收尾**：若 B 未做 per-persona moods，此处补；page 桶表对动态 mood 的兜底。
- **G5 per-session persona（P3 展望）**：sessionPersona 覆盖层——**明确不排期**，等「一群一人设/私聊专属」真实需求出现再启动。

---

## 9. 通用数据走查工具箱（每迭代复用）

```bash
# ── 云端健康与审计 ──
ssh ubuntu@124.222.65.169 'systemctl status dsh-qqbot --no-pager | head -5; tail -30 ~/brain-data/brain.log'
curl -s 'http://124.222.65.169:4099/brain/api/state?token=<口令>&session=<sid>' | python3 -m json.tool | head -50
curl -s 'http://124.222.65.169:4099/brain/api/ops?token=<口令>&limit=200'   # op 流水审计
curl -s 'http://124.222.65.169:4099/brain/api/export?token=<口令>' -o snap.json  # 全量快照 diff

# ── 快照统计（python 一行流）──
python3 -c "import json,collections; d=json.load(open('snap.json')); \
print(collections.Counter((n['kind'],n.get('personaId','-'),bool(n.get('self'))) for n in d['notes']))"

# ── 检索走查 ──
curl -s 'http://124.222.65.169:4099/brain/api/query?token=<口令>&session=<sid>&q=<urlencoded>'

# ── 本地验证 ──
cd dsh-qqbot-brain && npm run typecheck && npm test && npm run build && npm run eval

# ── 部署（runbook 惯例）──
# 成对备份 → rsync -av dist cordis.patch.yml package.json ubuntu@124.222.65.169:~/dsh-qqbot-brain/（dist 不带尾斜杠）
# → ssh ... 'sudo systemctl restart dsh-qqbot'
```

**走查三原则**（沿用项目方法论）：快照前后 diff 说话（不凭印象）；op 流水可重放即审计；每个「应该」都要有一条可执行的 curl/命令或单测对应，不接受「看起来对」。

---

## 10. 决策点汇总（待用户确认）

| # | 决策 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | attitude 归属粒度（迭代 A 核心） | **已定：角色级**（2026-11-09） | whale 三版本共享立场轨，需一次同对象去重迁移 |
| 2 | 迭代顺序 | 推荐 A→B→C→D→E | 若 companion 近期要动工，C/D 提前与 B 并行也成立（互不阻塞） |
| 3 | MOODS 方案（迭代 B 内） | **已定：`PersonaEntry.moods` 按人设注入**（2026-11-10 迭代B落地） | 叶瞬光 10 词表随 seed personas 条目下发；未知 mood 页面 v/a 回退 |
| 4 | companion 壳层排期（迭代 F） | 推荐另立任务，等 C/D 内核原语落地 | 若近期就要，C/D 需提前——壳层 MVP 本身也是天级工作量 |
| 5 | aspiration 型 intent | 推荐二期不做（event+time 先行） | 一步到位做三型：体量小但无真实需求验证 |

## 11. 与现有任务的关系

- `11-08-persona-switch-design`：迭代 A 即其 P0 落地；P1-P3 中 pack 导入/激活预览/品牌跟人设分别落 B/G；P3 展望（per-session/自演化/eval 用例）挂 G5 与各迭代验收。
- `11-07-ye-shunguang-persona`：人设包资产已就绪，迭代 B 消费；2.6+ 剧情校订 persona.md 与种子是独立小维护。
- `11-09-companion-agent-eval`：方向已定稿；迭代 C/D 是其内核前置，F 是其实现承接。
- `11-09-memory-persona-arch-research`：借鉴清单 10 条全部有落点（#1→C、#2→D、#3-5→E、#6→D、#7→E5、#8→E1、#9→G/B、#10→F）。
