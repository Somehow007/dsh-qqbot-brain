# 迭代A 技术设计：角色→人设两级三轨

> 实现依据。所有行号锚点基于 2026-11-09 main（c10c96f）。

## 1. 概念模型

```
character（角色=灵魂，自我轨所有者）
  └── persona（人设=版本/衣服，prompt 文本）
        PersonaEntry.characterId?: string   // 缺省=自身 id

记忆三轨（trackKey 决定归并/判重边界）：
  att:<char>   kind='attitude'
  self:<char>  kind≠attitude 且 self===true
  world        其余（用户事实/群事件/画像/digest，全角色共享）

可见性：自我轨条目仅当 characterOf(条目personaId) === characterOf(活动personaId)；
        无活动人设（activeId=''）全可见——兼容分轨前行为。
```

- `characterOf(pid)`：`personaEntries.get(pid)?.characterId ?? pid`；`pid` 空/undefined → `PRE_TAG_PERSONA_ID`（'whale-gentle'）。人设被删后条目回落 personaId 本身=安全隔离（plan §2.2 原文口径）。
- `notePersonaId(n)` 沿用：`n.personaId ?? PRE_TAG_PERSONA_ID`。

## 2. types.ts

- `MemoryNote.self?: boolean`：true=自我轨；false=显式标世界轨（手动修正语义，导出/导入/迁移均尊重，不被启发式覆盖）。
- `NoteDraft.self?: boolean`：蒸馏 LLM 可选输出。
- `EmotionState.personaId?: string`：形成该情绪时的人设 id。
- `Turn.personaId?: string`：ingest 时钉「形成时人设」。
- `PRE_TAG_PERSONA_ID` 旁加迁移常量：
  ```ts
  export const WHALE_PERSONA_IDS = ['whale-gentle', 'whale-devotion', 'legacy'] as const;
  export const WHALE_CHARACTER_ID = 'whale';
  ```
- 自我判定（单一出处，store/index/test 共用）：
  ```ts
  const QUOTED_RE = /[「『“"'][\s\S]*?[」』”"']/g;
  /** 自我轨启发式：剥掉引号转述后含「我」→ 角色自我内容。
      「角色」不判（「X 对角色说Y」是用户事实高频句式）；引号内「我」是他人原话不算。 */
  export function isSelfContent(content: string): boolean {
    return /我/.test(content.replace(QUOTED_RE, ''));
  }
  /** 草稿 self 归一：attitude 恒自我轨不写 self；其余 LLM self 优先、启发式兜底；
      只产出 true|undefined（false 语义=未标，由读侧按世界轨处理） */
  export function resolveSelfFlag(kind: string | undefined, self: boolean | undefined, content: string): true | undefined {
    if (kind === 'attitude') return undefined;
    return (self ?? isSelfContent(content)) === true ? true : undefined;
  }
  ```
  实测校准（线上 export 255 条）：命中「我怼回去」「我照办」「鲸鱼娘（我）：…」等真自我条；不误伤「我种植物他铲植物」类引号内游戏名、「由不得我」类引号内回怼词。

## 3. store.ts

- `PersonaEntry` 加 `characterId?: string; moods?: string[]`（moods 仅透传预留）。
- `persona-save` op 已携整对象 → snapshot/export/`listPersonas` 自动透传；要修的是写入侧：
  - `createPersona(name, text, id?, extra?: { characterId?: string; moods?: string[] })`
  - `savePersona(id, name, text, patch?: { characterId?: string | null; moods?: string[] | null })`：patch 缺省键保留 prev 值；`null`/空串清除。**PATCH 不带 characterId 不得清掉已有值**（http 层只在 body 出现该键时传入）。
  - `validPersona` 仍只产 {id,name,text}，附加字段由 create/save 拼装。
- `apply` `case 'persona'`：重建条目时带上 `old?.characterId/moods`（旧逻辑丢附加字段）。
- `Op update.patch` 联合类型加 `'self'`；`apply` 加 `if ('self' in op.patch) n.self = op.patch.self === true ? true : op.patch.self === false ? false : undefined`（'self' in patch 已判存在性；值域 true/false/undefined 三态都正确落位——true 标自我、false 显式世界、undefined 清除）。`updateNote` 签名同步。
- `addNote`：`self: resolveSelfFlag(draft.kind, draft.self, note.content)`（在 content trim 后判定）。
- `sanitizeNote`：透传 `self`——`n.self===true→true`、`n.self===false→false`、缺省→`isSelfContent(content)?true:undefined`（attitude 恒 undefined）。导入旧备份的第一人称条自动归位；显式 false 保留。
- `sanitizeEmotion`：透传 `personaId`（非空字符串）。
- `importData` personas：校验处放行 characterId（string）/moods（string[]），写入走 `createPersona(p.name,p.text,p.id,{characterId,moods})`；merge 对已存在 id 仍跳过（本地优先，既有语义）。
- 新增 `personaEntry(id): PersonaEntry | undefined`（返回拷贝）供 characterOf 解析。
- `deleteNotesByPersona` 维持 personaId 口径（按人设删除是溯源清理，不是轨道隔离）。

## 4. emotion.ts

- `EmotionState.personaId` 随 state 持久化（emotion op 整对象落盘，自动带）。
- `apply(sessionId, e, now, personaId?)`：签名加第 4 参，`personaId: personaId || undefined` 写入 state。
- `get()` 保持纯衰减不动；角色判定全部在 Brain 层（engine 不认识人设）。
- `describe(sessionId, now)` 拆出纯格式化 `describeState(s: EmotionState): string`，`describe` 改为 `describeState(this.get(...))` 的薄封装——Brain 用 describeState 配合过滤后的 state。

## 5. distill.ts

- PROMPT memories 条目加可选 `"self": true` + 一句说明（放在 kind=attitude 段后）：
  「与角色自己相关的条目（角色的前史、承诺、感受、立场素材）加 "self": true；用户事实与群体事件不标。」
- `parseDistillOutput` memories.map 加 `self: typeof x.self === 'boolean' ? x.self : undefined`（consolidate 共用此解析，LLM 若输出同样生效）。
- CONSOLIDATE_PROMPT 不动（自我语义由启发式兜底；走查若见漏标再补）。

## 6. brain/index.ts（Brain 层）

### 6.1 character/track 原语

```ts
private characterOf(pid: string | undefined): string {
  const id = pid || PRE_TAG_PERSONA_ID;
  return this.store.personaEntry(id)?.characterId ?? id;
}
private trackVisible(n: MemoryNote, pid?: string): boolean {
  if (n.kind !== 'attitude' && n.self !== true) return true;
  const active = pid ?? this.store.activePersonaId();
  return !active || this.characterOf(n.personaId) === this.characterOf(active);
}
private trackKeyOf(n: { kind: MemoryNote['kind']; self?: boolean; personaId?: string }): string {
  const char = this.characterOf(n.personaId);
  if (n.kind === 'attitude') return `att:${char}`;
  if (n.self === true) return `self:${char}`;
  return 'world';
}
```

- `attitudeVisible` 删除，由 trackVisible 替代；调用点：assemble 可见池（:143，默认 active）、endOfTurn existing（:262，传 batchPid）、findNearDup（改 trackKey 判定）。
- xpool 跨会话召回吃 `visible` 已过滤池，自动同口径。

### 6.2 批次戳

- `ingest`：`const stamped = { ...turn, personaId: turn.personaId || this.store.activePersonaId() || undefined }`，turnBuffer/historyBuffer 都存 stamped。
- `batchPersonaId(turns)`：批内 personaId 计数取众数，并列取较晚出现者；无戳回落 `activePersonaId()`（可为 ''）。
- `endOfTurn`：`const batchPid = this.batchPersonaId(turns)` 替换 `activePid`；existing 过滤 `trackVisible(n, batchPid)`；`findAttitudeSameObject(..., batchPid)`；`addNote` `personaId: batchPid`；`emotion.apply(sessionId, e, now, batchPid)`；`emotionStamp(sessionId, now, batchPid)`；`reviewAndWriteProfiles(..., batchPid)`（新增第 4 参 writerPid，缺省回落 activeId——手工路径 mergeProfiles/updateProfile/regenerateProfile 不传=现状）。
- forget 子串删除加 `this.trackVisible(n, batchPid)` 前置（编号 forget 的 existing 本就已过滤）。

### 6.3 情绪隔离

```ts
private emotionFor(sessionId: string, personaId: string, now: number): EmotionState {
  const s = this.emotion.get(sessionId, now);
  const pid = personaId || this.store.activePersonaId();
  if (!pid) return s;
  return this.characterOf(s.personaId) === this.characterOf(pid) ? s : NEUTRAL_EMOTION;
}
private emotionStamp(sessionId: string, now: number, personaId?: string): NoteEmotion {
  const e = this.emotionFor(sessionId, personaId ?? this.store.activePersonaId(), now);
  return { v: e.v, a: e.a, d: e.d, label: e.label, mood: e.mood };
}
```

- `s.personaId` undefined → characterOf→PRE_TAG→'whale'（prod）——存量情绪自愈于下次 apply。
- assemble：`emotion: this.emotion.describeState(this.emotionFor(sessionId, this.store.activePersonaId(), now))`。
- endOfTurn distill `currentEmotion` 参数改 `emotionFor(sessionId, batchPid, now)`（跨角色给中性，防 whale 情绪词漏进 ye 蒸馏）。
- consolidate：eps 循环内 `emotion: this.emotionStamp(sessionId, now, notePid)` + `emotionBoost(stamp)` 按 notePid 逐条算（attitude→srcPersona、self 草稿→srcPersona、其余→activePid）；见 §6.5。
- `Brain.addNote`（手动）：`const pid = draft.personaId ?? this.store.activePersonaId()`；stamp/boost/personaId 全用 pid。
- `emotionOf()`/`graph()`/`latest()` 维持原始读（脑图是管理视图，看真值）。

### 6.4 归并/判重 character 口径

- `findAttitudeSameObject(sessionId, content, pid)`：`(!pid || this.characterOf(notePersonaId(n)) === this.characterOf(pid))`——pid='' 走 !pid 兼容（无人设世界全 PRE_TAG）；有人设时按角色归并（gentle↔devotion 同对象互相更新=角色级定案）。
- `sweepNearDups`：簇前预计算 `keys = Map(id→trackKeyOf)`，pairwise 守卫改 `keys.get(a.id) !== keys.get(b.id) → continue`（替换原 attitude/personaId 两判），私域 scope 判定保留。
- `findNearDup(vec, draft:{kind,self?,personaId?}, scope?)`：签名改收草稿字段；内部 `dkey=trackKeyOf(draft)`，候选 `trackKeyOf(n)!==dkey → skip`（替换 kind-attitude 互斥+attitudeVisible 两判）；scope 判定保留。
  - endOfTurn 调用：`{ kind: m.kind ?? 'episodic', self: resolveSelfFlag(m.kind, m.self, m.content), personaId: batchPid }`。
  - consolidate 调用：`{ kind, self: resolveSelfFlag(kind, m.self, m.content), personaId: notePid }`。

### 6.5 consolidate

- eps 过滤加 `&& this.trackVisible(n)`（防跨角色 self episodic 混入产出泄漏到世界轨）；`sessionsNeedingConsolidation` 计数同步加（口径一致防空转）。
- `srcPersona`：源条先按 `characterOf(notePersonaId(e))` 分组取角色众数，再组内取 `notePersonaId` 众数得具体 personaId（溯源仍落真人设 id，characterOf 解析回正确角色）。
- notePid 规则改：`kind==='attitude' || draftSelf ? srcPersona : activePid`——self 语义记忆继承源角色轨（否则 whale-self 源在 ye 激活期巩固会把自我内容盖到 ye 戳上=双向错）。world semantic 维持 activePid provenance。

### 6.6 其他读侧同口径

- `regenerateProfile` evidence 过滤加 `this.trackVisible(n)`（sess 画像不吃他角色 self 证据）。
- `preview()`（/api/query）不加 trackVisible——原始检索调试视图，走查以 assemble 为准（plan §2.5 注）。

### 6.7 启动迁移 `Brain.migrateTracks()`

```ts
migrateTracks(): { characterIds: number; attitudeMerged: number; selfMarked: number }
```

1. `characterIds`：WHALE_PERSONA_IDS ∩ 存在且无 characterId → `savePersona(id, name, text, {characterId:'whale'})`。
2. `attitudeMerged`：attitude 且 !absorbedAt，按 `对X`对象提取（无对象跳过），key=`sessionId|character|object` 分组；组内>1 按 `lastAccessAt↓ → strength↓ → createdAt↓` 排序保首条，余者 `mergeNotes(keep, drop, cap)`。merge op 可重放、天然幂等。
3. `selfMarked`：`kind!=='attitude' && n.self == null && isSelfContent(n.content)` → `updateNote(id,{self:true})`；`self===false` 显式不覆盖。

调用点：`src/index.ts` apply() 内 absorbCovered 块旁：
```ts
const mig = brain.migrateTracks();
if (mig.characterIds || mig.attitudeMerged || mig.selfMarked)
  log(`三轨迁移：characterId×${mig.characterIds} 态度归并×${mig.attitudeMerged} self回填×${mig.selfMarked}`);
```

## 7. http.ts / page.html

- `POST/PATCH /api/personas`：body 接受 `characterId?: string|null`、`moods?: string[]`；PATCH 仅在键存在时进 patch（防误清）。GET 自动带新字段。
- `POST /api/notes`：body 加 `self?: boolean` → NoteDraft。
- `PATCH /api/notes/<id>`：body 加 `self?: boolean` → updateNote patch（脑图手动修正路径）。
- `graph()` notes 映射加 `self: n.self || undefined`（page 徽标数据源）。
- page.html：记忆库行徽标在 attitude 人设徽标旁加 `${n.self?' <span class="badge self">自我</span>':''}`；CSS 加 `.badge.self`（区别于 attitude 紫，用青绿系）。不改编辑表单（self 修正走 PATCH API/curl）。

## 8. 测试计划（test/brain.test.ts 追加 + eval）

- characterOf 行为经 trackVisible/assemble 断言（私有方法不直测）：同 characterId 两人设互见自我轨；无 characterId 两人设互不见；删人设后其 self 条自隔离；无活动人设全可见。
- self 启发式：`isSelfContent` 单测（「我…」中/首命中、「「我…」」引号内不命中、「鲸鱼娘（我）：…」命中、普通用户事实不命中）；addNote 落 self:true；LLM self:false 覆盖启发式。
- 批次戳：ingest 两轮间 activatePersona 切换 → endOfTurn 产出 personaId=多数派；existing/attitude 归并按批次角色。
- 情绪：apply 带 personaId→落盘→assemble 跨角色 describe=''；同角色正常；无 personaId 存量按 PRE_TAG。
- 迁移：造 gentle/devotion/legacy+双轨 attitude+我字记忆 → migrateTracks → characterId 写入、同对象归并留新、self 回填；再跑一次全 0。
- import/export 往返：self/characterId/emotion.personaId/moods 保留；显式 self:false 往返不被启发式改回。
- eval cases.json：fixture 加 `personas`+`activePersonaId` 支持（run.ts 透传 importData）；新增用例——他角色 self/attitude expectNone、同角色 self 命中、world 事实跨角色仍命中。

## 9. 不做的事（边界）

- 不做 per-persona MOODS 注入（迭代 B 决策点）、不做 pack 导入 API（G）、不做 persona.avatar/banner（G1）。
- 不动 digest/画像共享语义（世界轨）；不动 preview() 过滤口径；不动 page 编辑表单。
- 不为 companion 铺 Turn.via/provenance（迭代 D）。

## 10. 风险与回滚

- attitude 归并改写生产数据 → 部署前成对备份（plugin+brain-data）；merge op 可重放审计；回滚=恢复 brain-data 备份 + rsync 旧 dist。
- self 启发式误标 → update op `self:false` 手动修，脑图可见（PATCH 已透传）；迁移只标 `self==null` 不碰显式值。
- characterId 误分组 → savePersona patch 可改/清；删除人设后其条目自隔离不外泄。
