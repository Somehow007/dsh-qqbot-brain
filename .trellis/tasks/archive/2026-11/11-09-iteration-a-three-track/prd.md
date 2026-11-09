# 迭代A：人设切换地基（角色→人设两级三轨）

> 方案来源：`tasks/11-09-iteration-upgrade-plan/iteration-plan.md` §2（已定稿）+ `tasks/11-08-persona-switch-design/prd.md`（P0 定案 + 走查修正点）。本任务是其落地。

## 问题存档

- **时间**：2026-11-09
- **需求**：把「事实共享 · 态度分轨」升级为「世界轨共享 · 自我轨按角色隔离」——换角色（大肥鱼↔叶瞬光）时自我内容双向不泄漏；同角色换版本（gentle↔devotion）共享自我轨。消除 iteration B（叶瞬光接入）的前置阻塞。
- **怎么解决的**：三轨模型落地——`MemoryNote.self` 标记第一人称/自我内容，与 `kind=attitude` 同属自我轨；`PersonaEntry.characterId` 把人设归并到角色；可见性/归并/判重全部改 character 口径；情绪按角色隔离；蒸馏批次戳修切换窗口；启动迁移幂等回填。

## Requirements

- **schema**：`MemoryNote.self?: boolean`（true=自我轨；false=显式世界轨，手动修正用）；`NoteDraft.self?`；`EmotionState.personaId?`；`Turn.personaId?`；`PersonaEntry.characterId?/moods?`（moods 仅透传预留，行为在迭代 B）。
- **trackVisible**：`kind=attitude || self===true` 的条目仅当 `characterOf(notePersonaId(n)) === characterOf(activePid)` 可见；无活动人设全可见（兼容）。characterOf = `personaEntries.get(pid)?.characterId ?? pid`（人设被删→回落自身=安全隔离；空 pid→PRE_TAG）。
- **character 口径替换**：`findAttitudeSameObject`、consolidate `srcPersona`、`sweepNearDups` 簇守卫、`findNearDup` 判重全部从 personaId 口径改 character 口径；trackKey = `att:<char>` / `self:<char>` / `world`，不同 trackKey 不互并/不互判重。
- **self 标记双路**：`store.addNote` 统一兜底启发式（引号外含「我」→ self:true，LLM `self` 字段优先、显式 false 优先于启发式）；蒸馏 prompt 增可选 `"self":true` 输出 + `parseDistillOutput` 解析；`importData`/`sanitizeNote` 同规则透传（显式 false 保留）。
- **批次戳**：`Brain.ingest` 给 Turn 钉 `personaId=activePersonaId()`；`endOfTurn` 批次人设=批内众数（并列取较晚，缺省回落 activeId）；existing 列表/态度归并/记忆戳/情绪 apply+stamp/profile lastWrittenByPersona/forget 删除范围全部用批次人设。
- **情绪隔离**：`emotion.apply` 带 personaId；`assemble`/`endOfTurn`/`emotionStamp` 读侧按 character 不符→中性（NEUTRAL_EMOTION，describe 空串不注入）；存量无 personaId 视作 PRE_TAG（whale）角色，自愈于下次 apply。
- **启动迁移**（Brain.migrateTracks，幂等）：① whale-gentle/whale-devotion/legacy 补 `characterId:'whale'`；② attitude 同 session+character+「对X」对象跨版本归并（保 lastAccessAt/strength 较新较强，merge op 可重放）；③ 存量非 attitude 且 `self==null` 命中启发式 → `self:true`（update op），显式 false 不覆盖。
- **透传**：`update` op patch 加 `'self'`；`sanitizeNote/sanitizeEmotion` 透传 self/personaId；`importData` personas 校验放行 characterId/moods 并写入；`persona` op 保留附加字段；`/api/notes` POST/PATCH 与 `/api/personas` POST/PATCH 接受新字段；`/api/state` notes 带 `self`；page.html 自我条徽标（小改）。
- **同口径延伸**（防跨轨泄漏，一并处理）：consolidate 的 eps 输入与 `sessionsNeedingConsolidation` 计数过 trackVisible；consolidate 产出 self 草稿的 personaId 随 srcPersona（源角色）而非 activePid；endOfTurn forget 子串删除限 trackVisible 范围；regenerateProfile 证据过 trackVisible。

## Acceptance Criteria

- [ ] `npm run typecheck` + `npm test` + `npm run build` 全绿；`npm run eval` 22 例不回退 + 人设隔离新用例
- [ ] 单测覆盖：characterOf 映射（缺省/显式/人设已删回落）；trackVisible 四路口径一致（assemble/existing/nearDup/xpool）；self 启发式命中与不命中边界（含引号内「我」不命中）；批次跨切换取众数；emotion 角色不符读中性、符则正常、无戳按 PRE_TAG；import/export 往返保留 self/characterId/emotion.personaId；迁移幂等（重复跑零改动、attitude 归并保新）
- [ ] 迁移幂等：重复启动不重复归并/回填（op 重放安全）
- [ ] 成本：零新增常驻 LLM 调用；distill prompt 仅加 self 可选字段（少量输出 token）；迁移为确定性 op
- [ ] 云端走查全过（iteration-plan §2.5 七步）——部署后执行，本任务含部署步骤

## Key Decisions

- **attitude/self 归属粒度=角色级**（2026-11-09 用户拍板）：立场属于灵魂不属于衣服；whale 三版本合并一条 whale 轨，需一次同对象去重迁移。
- **self 启发式=引号外含「我」**：蒸馏约定事实第三人称、承诺写「我…」；「角色」不作标记（「对角色说」是用户事实高频句式，误伤世界轨）；LLM self 字段与显式 false 优先。
- **trackKey 分轨防吸收**：self 事实不能被 world 事实吸收丢轨道信息；world 跨人设可互并（同一世界事实去重是特性）。
- **情绪免迁移**：EmotionState 加 personaId 标签读时判定（自愈），不换复合键。
- **批次戳修在途窗口**：ingest 时钉「形成时人设」，endOfTurn 取众数——切换瞬间在途批次不归新人设。

## Resolution（2026-11-09）

- **遇到了什么问题**：① `resolveSelfFlag` 初版让启发式覆盖显式 `self:false`，手动「世界轨」修正会被翻回自我轨——改为显式 true/false 优先于启发式；② persona 隔离单测初跑失败是查询词与记忆内容不相关的检索落空，非可见性谓词错误，换语义相关词后通过；③ `page.test.ts` mock DOM 缺新人设草稿字段元素报 `Cannot set properties of undefined`，补 fixture 并顺带修「刷新不覆盖未保存 name/text 草稿」；④ eval 人设隔离用例同样卡在查询词，修正后 recall 100% / noiseFP 0%；⑤ **部署踩坑**：`rsync -az dist host:~/dsh-qqbot-brain/dist`（带 dist 目的路径）把产物嵌套成 `dist/dist/`，服务重启后仍跑旧代码、迁移未触发——远端 `rm -rf dist/dist` 后改用 runbook 写法 `rsync -az --delete dist host:~/dsh-qqbot-brain/`（dist 不带尾斜杠、目的=插件根）才真正生效，启动日志出现「三轨迁移：人设归属角色 whale ← legacy, whale-gentle, whale-devotion」。
- **怎么解决的**：按 design.md 三轨方案落地——types 单一出处加 `self`/`characterId`/常量；store 三态 sanitize + op patch + import/export 透传 + graphVersion 失效；Brain 层 `characterOf/trackVisible/trackKeyOf/modalPersonaId/batchPersonaId/emotionFor/migrateTracks` 收口全部可见性与归属判定；distill prompt 加可选 `self` 字段、endOfTurn 批首钉批次人设；http/page 透传 self 与 characterId、加轨道徽标与所属角色输入框。
- **后续优化方向**：① self 启发式靠「我」字，昵称指代/转述边界仍可能误标——迭代 B 接入叶瞬光后需抽查真实误标率，必要时上 LLM 复核或收紧蒸馏 prompt；② digest/profiles 仍按会话共享不分轨（设计使然），跨角色切换时旧会话摘要可能带前角色语气，观察是否需要轨道过滤；③ 立场归并迁移已做 attitude 同对象归并，后续若加「自我事实」级联可考虑同法；④ 迭代 B 起每个新角色激活时验证批次戳与跨角色中性情绪的线上表现。
- **什么时候干的**：2026-11-09 当天完成实现→测试→eval→build→备份→部署→线上数据走查全流程。
- **Key Decisions**：attitude/self 归属=角色级（用户拍板）；self 启发式=引号外含「我」；trackKey 分轨防吸收；情绪免迁移读时判定；批次戳在 ingest 钉住防在途切换错乱。
- **验证结论**：`npm run typecheck` 0 错；`node --test` 全量 173/173 通过（brain 145 + http/page/eval 其余）；`npm run eval` 人设三轨隔离用例 100% recall / 0% noise（词表基线 q08/q15/n01/n03 为存量问题未动）；`npm run build` 通过；生产部署后 `/api/personas` 三人设 `characterId=whale`、`/api/state` 283 notes 中 4 条 self:true（2 条 whale-devotion 第一人称自我记忆正确入轨）+ 9 条 attitude 全归 whale、emotion personaId 回落 whale、启动日志迁移行确认、journalctl 无 error。部署路径事故已修正并记入本档案。
