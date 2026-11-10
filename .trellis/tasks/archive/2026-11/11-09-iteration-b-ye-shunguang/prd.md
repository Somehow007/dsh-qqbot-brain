# 迭代B：叶瞬光接入 + 云端自测

> 方案来源：`tasks/11-09-iteration-upgrade-plan/iteration-plan.md` §3（已定稿）。迭代 A（三轨地基）已上线，本任务是其首次实战消费。

## 问题存档

- **时间**：2026-11-10 开工（方案 2026-11-09 定稿）
- **需求**：`personas/ye-shunguang/` 人设包灌进生产 brain 并激活，让用户自测陪伴体验；种子全部正确落自我轨，跨角色双向不泄漏。
- **前置**：迭代 A 已上线（self/characterId/批次戳/情绪按角色隔离），`PersonaEntry.moods` 字段已透传预留待本迭代接线。

## Requirements

### R1 种子 self 标记 + 重新生成

- `personas/ye-shunguang/generate_seed.py`：非 attitude 种子（semantic 8 + episodic 10，共 18 条，全部第一人称行文）加 `"self": true`；attitude 10 条不动（kind 已自带自我轨）。
- `personas` 条目带 `moods` 字段（见 R2 词表），`importData` 已放行透传。
- 重新生成 `seed-export.json`（uuid5 确定性 id 不变，重跑幂等）。

### R2 per-persona MOODS（决策点 #3：采纳推荐方案）

- **决策**：`PersonaEntry.moods` 按人设注入蒸馏情绪枚举——whale 的「炸毛/记仇」嘴硬系不贴叶瞬光，按人设给词表。
- **叶瞬光 moods**：`['平静','开心','害羞','心疼','坚定','寂寞','委屈','难过','想念','释然']`（10 词；与全局 MOODS 重叠 5 词享页面分桶，其余走 v/a 回退——已有机制）。
- **distill.ts**：`buildDistillPrompt`/`parseDistillOutput`/`Distiller.distill`/`call` 签名带允许集合；人设未配 moods → 全局 MOODS 行为不变（零回归）。自定义 moods 时锚点/效价指引换通用文案（不套 whale 嘴硬系锚点）。
- **index.ts**：`endOfTurn` 用批次人设（batchPid）的 `personaEntry.moods` 传入——与批次戳/提示词人设同口径。
- **types.ts**：`MOOD_VALENCE` 补新词条目（心疼/寂寞=-1，释然=1；想念/坚定歧义不收，与平静/好奇先例一致）；`EmotionState.mood`/`NoteEmotion.mood` 注释口径更新为「MOODS 或人设 moods」。
- **page.html**：零改动（未知 mood 已有 v/a 回退；`page.test.ts` 只断言全局 MOODS 九桶同步，不受影响）。

### R3 部署与云端走查

- 本地验证：`npm run typecheck` + `npm test` + `npm run build` 全绿；`npm run eval` 不回退。
- 云端：成对备份（插件+brain-data）→ rsync dist（不带尾斜杠）+package.json → restart → export 基线快照 → `POST /api/import?mode=merge` 灌 seed → 验证计数与幂等 → `POST /api/personas/activate {id:'ye-shunguang'}`。
- 冒烟清单（plan §3.3）：state persona 区=叶 persona.md 全文、attitude 只剩 ye 轨、whale self/第一人称不进 memoryLines、ye 种子可被 query 唤起（桂花糖/小师弟/练剑/青溟剑/日记）、情绪中性、真实会话后新蒸馏 `personaId='ye-shunguang'`+第一人称 `self:true`+attitude 落 ye 轨、画像 `lastWrittenByPersona` 更新、世界轨用户事实两角色共享、反向切回 whale-devotion 无泄漏恢复、清理路径确认（purge+delete 不实际执行）。
- 自测期观察项进 journal：影子面语气频率、种子衰减表现、蒸馏 self 标记准确率。

## Acceptance Criteria

- [ ] seed-export.json 重新生成，28 条结构合规（18 条非 attitude 带 self:true、personaId='ye-shunguang'、personas[0].moods 就位）
- [ ] 单测：buildDistillPrompt 自定义 moods 注入枚举+通用指引、默认路径逐字不变；parseDistillOutput 允许集校验（收自定义/拒表外）；endOfTurn 按批次人设 moods 传入；seed-export.json 结构回归测试
- [ ] `npm run typecheck`/`npm test`/`npm run build`/`npm run eval` 全绿
- [ ] 云端 merge 导入计数正确且幂等（首导 notes:28→复导 notes:0 skipped:28）；whale 数据零损失（快照 diff 总增量恰 +28）
- [ ] 冒烟清单全过；双向切换无泄漏
- [ ] 文档保鲜：MAP.md「mood 九桶」口径、README 实测/阶段段、personas/ye-shunguang/README.md（merge 用法+self/moods 说明）、iteration-plan.md 决策点 #3 标已定
- [ ] 归档：prd Resolution 四块 + journal + CHANGES.md 广播行

## Key Decisions

- **MOODS=per-persona 注入**（计划推荐，用户「继续」默认采纳）：字段迭代 A 已透传，本迭代接线；词表选项=替换枚举（并集会让 LLM 仍选出 whale 词，违背目的）。
- **叶瞬光 moods 词表**（10 词）：覆盖中性/正向/负向/酸甜并存；歧义词（想念/坚定）不进 MOOD_VALENCE 与「平静/好奇」先例一致。
- **种子全落自我轨**：18 条非 attitude 全是「我」的经历/事实，无世界轨内容；whale 激活时全部不可见=正确隔离。
- **merge 导入不激活**：`importData` 仅 `!activeId` 时激活——生产 whale 在位，激活走独立 API 显式控制。

## Notes

- 风险：激活即线上生效（bot 立刻以叶瞬光口吻回复）——属里程碑本意，走查含切回验证；seed 是「活的经历层」会自然衰减，核心设定永驻 persona.md。
- 后续：观察蒸馏 self 标记准确率（迭代 A 遗留观察项）；pack 导入 API `import-pack` 归 G。

## Resolution（2026-11-10）

- **遇到了什么问题**：① MOODS 决策点用户打断提问后回「继续」——按计划推荐项 `PersonaEntry.moods` 直接落地，词表取 10 词（覆盖中性/正向/负向/酸甜并存，歧义词不进 MOOD_VALENCE）；② distill PROMPT 原是模块级模板常量且 mood 锚点硬编码 whale 词表——改为 `distillPrompt(moods)` 函数，枚举与指引按人设分叉（内容与全局 MOODS 相同视为未自定义，仍走默认锚点）；③ README「下一步候选」删项后序号需顺移，首改时误复制 webserver-shim 行已修正。
- **怎么解决的**：种子侧 `generate_seed.py` 非 attitude 条统一 `self:true`（18 条全第一人称）+ `personas[0].moods` 下发；内核侧 `buildDistillPrompt`/`parseDistillOutput`/`Distiller.distill`/`call` 贯通允许集，`endOfTurn` 按批次人设 `personaEntry(batchPid).moods` 传入（与批次戳/提示词人设同口径）；生产走「成对备份 → rsync dist+package.json → restart → export 基线 285 条 → merge 导入 → 激活」：首导 `{notes:28,persona:true}`、复导 `{notes:0,skipped:28}` 幂等、总量 285→313 恰 +28、ye 28 条 self/attitude 分布正确、28 条全部补齐 embedding、whale 数据零损失；激活后 `/api/state` persona=叶 persona.md 全文、persona.md 文件同步、whale↔ye 双向切换验证通过、op 流水 persona-activate×3 可审计。
- **后续优化方向**：① 自测期观察项（记录进 journal #98）：影子面语气频率、种子衰减表现、蒸馏 self 标记准确率、新蒸馏 `personaId='ye-shunguang'`+attitude 落 ye 轨、画像 `lastWrittenByPersona` 更新、世界轨用户事实两角色共享；② merge 导入不更新已存在人设条目——改 moods/种子要走 PATCH API 或删了重导（README 已注明）；③ distill label 示例仍是 whale 味（「嘴硬开心」「记仇」）——自定义 moods 时未换，自测若觉违和再参数化；④ 清理路径已确认未执行：`POST /api/notes/purge {"personaId":"ye-shunguang"}` + `DELETE /api/personas?id=ye-shunguang`。
- **什么时候干的**：2026-11-10 当天完成实现→测试→build→eval→备份→部署→导入→激活→API 级走查全流程；真实会话级冒烟项留待用户自测期观察。
- **Key Decisions**：MOODS=per-persona 注入（计划推荐，用户「继续」默认采纳）；叶瞬光 moods 10 词表随 seed personas 条目下发；种子全落自我轨（无世界轨内容）；merge 导入不激活（`!activeId` 才激活，激活走独立 API）。
- **验证结论**：`npm run typecheck` 0 错；`node --test` 183/183 通过（新增 4 例：parse 允许集、buildDistillPrompt 自定义枚举+通用指引+默认不变、endOfTurn 批次 moods 双向、seed-export merge 导入+幂等+whale/ye 可见性端到端）；`npm run build` 通过；`npm run eval` 与迭代A 同基线（q08/q15/n01/n03 存量失败未动，人设三轨隔离 100%/0%）；生产 export diff 恰 +28、复导幂等、双向激活切换 persona 文本正确。
