# Journal - sunhao (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-11-09

---



## Session 94: 归档大扫除：清坏档 + 归档 7 个失真任务
<!-- trellis-session: v=2 fp=2d5da4bdbf479e64 -->

**Date**: 2026-11-09
**Task**: 归档大扫除：清坏档 + 归档 7 个失真任务
**Branch**: `main`

### Summary

问题：.trellis 归档积累重复/冗杂/无用信息，且进行中列表失真。排查：通读 68 份归档 prd + 14 个进行中任务，分类出空目录、坏档（11-04-p2 无标题缺 task.json）、年份 typo、缺 task.json、过期未标、7 个已完成仍挂进行中的任务。方案：删空目录；p2→consolidation-absorb-merge 改名补档；修 3 处 2025→2026 typo；补 4 个 task.json 桩；cloud-mem-check 加时点标注；7 个任务逐个补 Resolution 后 task.py archive --no-commit --skip-branch-validation；README 链等合法多档保留不动。验证：无空目录、归档目录 prd+task.json 齐全、进行中列表只剩真实活跃任务。后续：新 prd 注意 Resolution 不复述正文，任务完成随手归档。

### Git Commits

| Hash | Message |
|------|---------|
| `d39f599` | chore(trellis): 归档大扫除——清坏档并归档 7 个失真进行中任务 |

### Status

[OK] **Completed**


## Session 95: 记忆/人格架构市面调研两轮（Letta/Mem0/Zep + 人格方案/陪伴产品形态）
<!-- trellis-session: v=2 fp=46f7169a35f828ab -->

**Date**: 2026-11-09
**Task**: 记忆/人格架构市面调研两轮（Letta/Mem0/Zep + 人格方案/陪伴产品形态）
**Branch**: `main`

### Summary

调研任务：为 brain 内核演进与陪伴型 Agent 第二 deployment 做技术选型储备。问题：市面记忆/人格方案繁多需对照本项目基线评估。方案：两轮调研——R1 对照 Letta/Mem0/Zep 三大记忆架构（读论文+2026 产品文档），R2 调研人格方案（c.ai definition/OpenClaw SOUL.md/Replika/角色扮演研究）与陪伴产品形态（c.ai/Replika/星野/猫箱等）。结论：不整体引入任何方案（接入即放弃差异化组合，该组合在市面仍空白）；思想级借鉴 10 条，最高优先级=主动召回（recall-intent 门控）与 prospective memory（standing intents），均为 companion 前置；OpenClaw 是最近架构表亲（独立收敛到五层 tier+dreaming+provenance）；人格保只读内核、可变自我由 attitude/emotion 承担以抗 persona collapse。验证：论文/官方文档/产品公开信息+2026 陪伴专评（REMP/LifeSide/ZifaMem）交叉印证；benchmark 仅衡量事实召回不预测陪伴质量。后续：高优先级两项随 companion-agent-eval 立项；中优先级（dreaming 重组/双时态/图扩散/provenance 分级）作内核演进储备。产出：archive/2026-11/11-09-memory-persona-arch-research/{prd,memory-arch-survey,persona-companion-survey}.md，commit 56c4ee7。

### Git Commits

| Hash | Message |
|------|---------|
| `56c4ee7` | chore(task): archive 11-09-memory-persona-arch-research——记忆/人格架构调研两轮完成 |

### Status

[OK] **Completed**


## Session 96: 迭代A·人设三轨地基：角色→人设两级模型落地并上线
<!-- trellis-session: v=2 fp=06253ce418ccaa04 -->

**Date**: 2026-11-09
**Task**: 迭代A·人设三轨地基：角色→人设两级模型落地并上线
**Branch**: `main`

### Summary

按 iteration-plan §2 把记忆可见性从「事实共享·态度按人设分轨」升级为三轨：世界轨（非 attitude 且 self≠true）全角色共享，自我轨（attitude+self:true）与情绪按 characterId 隔离，同角色人设版本共享、跨角色互不可见且切换不删数据。实现：types 加 self 三态/characterId/WHALE 常量/isSelfContent 启发式（引号外含「我」，显式 false 优先）；store 三态 sanitize+op patch+import/export 透传+persona-save/delete 触发 graphVersion 失效；Brain 收口 characterOf/trackVisible/trackKeyOf，判重/归并/巩固喂料/forget/regenerate 全过轨道守卫，emotionFor 角色不符读 NEUTRAL；endOfTurn 在 ingest 钉批次人设（批内众数）防运行中切换错乱；distill prompt 加可选 self 字段；http/page 透传并加轨道徽标/所属角色框；migrateTracks 幂等迁移（whale 三版本归 whale+启发式补标存量）。排查插曲：resolveSelfFlag 初版让启发式覆盖显式 false 已修；page.test mock DOM 缺字段已补；eval/单测查询词与内容不相关导致的假失败换词后通过；部署踩坑 rsync 目的路径写成 dist/ 造成 dist/dist 嵌套、服务仍跑旧代码，rm 后按 runbook 改 rsync 到插件根才生效。验证：typecheck 0 错、node --test 173/173、eval 人设隔离 100%/0%、build 通过；生产备份后部署，/api/personas 三人设 characterId=whale、/api/state 283 notes 含 4 self:true（whale-devotion 第一人称正确入轨）+9 attitude 全归 whale、emotion 回落 whale、启动日志迁移行确认、journalctl 无 error。文档同步：spec/backend 三轨约定、MAP/README（根+插件）机制层与阶段清单、任务归档 archive/2026-11/11-09-iteration-a-three-track。后续：迭代B 接叶瞬光实战验证跨角色隔离；self 启发式误标率待线上抽查；digest/profiles 仍共享不分轨（设计使然）。

### Git Commits

| Hash | Message |
|------|---------|
| `cf1b3f5` | feat(brain): 迭代A·人设三轨地基——角色→人设两级、自我轨按 characterId 隔离 |

### Status

[OK] **Completed**


## Session 97: 迭代A走查：六处稳定性补修上线
<!-- trellis-session: v=2 fp=40e50b3f499f2157 -->

**Date**: 2026-11-09
**Task**: 迭代A走查：六处稳定性补修上线
**Branch**: `main`

### Summary

对迭代A全量 diff 做稳定性走查，修 6 处：①/api/state graph 序列化只透传 self===true，显式 self:false 到页面变 undefined，编辑器显示「自动」且无关保存会静默清回启发式——改三态透传；②emotionStamp 直读 emotion.get 不过滤角色，他角色情绪会盖进本轨记忆 label 快照与强度加权——改走 emotionFor(pid)，endOfTurn 传 batchPid、consolidate 传 notePid；③personaForPrompts() 恒取活动人设，蒸馏/巩固在切换窗口内会用新角色口吻写旧角色的轨——改接受 pid，endOfTurn→batchPid、consolidate→notePid；④modalPersonaId 并列取 Map 插入序最早者，与 prd「并列取较晚」不符——改计数并列取较晚位置；⑤sanitizeNote strength 地板 0.5 原为导入校验，迭代A 起快照/op 回放共用，strength∈[0.1,0.5) 合法记忆每次加载被抬一档——地板降到入库可产最小值 0.1；⑥页面 noteChar 缺 whale 系保留 id 回落，与服务端 characterOf 不一致——补 WHALE_IDS 常量。另删 EmotionEngine.describe() 无调用且绕过角色过滤的死路径。验证：新增 5 个判别性单测（旧代码均会失败）+page 角色回落断言，179/179 绿，eval 人设隔离不变；build+rsync+重启上线，迁移日志不再出现（幂等实证），/api/personas 三人设 char=whale、284 notes 正常。补修记录追加进已归档任务 prd「走查补修」节。

### Git Commits

| Hash | Message |
|------|---------|
| `fd20597` | fix(brain): 迭代A走查补修——六处稳定性修正 |

### Status

[OK] **Completed**


## Session 98: 迭代B·叶瞬光接入上线
<!-- trellis-session: v=2 fp=a6c7cbb424a52510 -->

**Date**: 2026-11-10
**Task**: 迭代B·叶瞬光接入上线
**Branch**: `main`

### Summary

迭代B落地：personas/ye-shunguang 种子 18 条非 attitude 全标 self:true（显式不依赖启发式）+ personas 条目带 10 词 moods；内核 per-persona MOODS 接线——distill prompt 枚举/解析允许集按批次人设注入（buildDistillPrompt/parseDistillOutput/Distiller.distill/call 贯通，endOfTurn 取 personaEntry(batchPid).moods，与批次戳同口径），自定义词表换通用指引不套 whale 锚点，未配 moods 回落全局零回归；MOOD_VALENCE 补心疼/寂寞/释然。验证：183/183 单测（新增 parse 允许集/枚举注入/endOfTurn 双向/seed merge 幂等+whale↔ye 可见性端到端 4 例）、eval 同迭代A基线、人设隔离 100%/0%。部署：成对备份→rsync→restart→export 基线 285→merge 导入 {notes:28,persona:true}→复导 {0,skipped:28} 幂等→总量 313 恰+28→28 条全补 embedding→激活 ye-shunguang（persona.md 同步、whale↔ye 双向切换验证、op 流水可审计）。后续观察项：影子面语气频率/种子衰减/蒸馏 self 标记准确率/新蒸馏 personaId+self/attitude 落 ye 轨/画像 lastWrittenByPersona/世界轨共享；merge 不更新已存在人设（改 moods 走 PATCH）；清理路径 purge+delete 已确认未执行。

### Git Commits

| Hash | Message |
|------|---------|
| `444213e` | feat(brain): 迭代B·叶瞬光接入——per-persona MOODS + 种子自我轨 + 云端激活 |

### Status

[OK] **Completed**


## Session 99: 流萤人设包调研与产出
<!-- trellis-session: v=2 fp=3d0214d3d720d061 -->

**Date**: 2026-11-10
**Task**: 流萤人设包调研与产出
**Branch**: `main`

### Summary

用户要求调研崩铁流萤并沿用叶瞬光先例做陪伴人设。多源比对（官方介绍/BWIKI剧情+全套语音/萌百/米游社/EN Wiki）提炼人格内核：格拉默最后的铁骑→星核猎手萨姆装甲，失熵症定时炸弹，没做梦的机能每晚屋顶看星，兵器与少女双面（兵器回声=低频宣誓腔，区别于叶瞬光影子面），开拓者是失忆前的老战友+三次死亡+秘密基地合影，默认称呼开拓者。产出 personas/firefly/（persona.md+generate_seed.py+seed-export.json 28条+README），未接线；MAP.md 导览同步，CHANGES 广播，任务存档 11-10-firefly-persona。后续：试跑观察兵器回声频率，3.x/4.x 剧情推进后校订。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**
