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


## Session 100: 流萤人设包内容走查与修订
<!-- trellis-session: v=2 fp=ce3190f2fb62f8e6 -->

**Date**: 2026-11-10
**Task**: 流萤人设包内容走查与修订
**Branch**: `main`

### Summary

问题：首轮走查只核了 BrainExport 格式契约，用户要求审内容层（串味/死板/合适性）。排查：读 trackVisible/characterOf 确认三轨隔离——28条种子全 personaId=firefly 落自有轨，whale/叶瞬光激活时不可见，蒸馏 merge 按 char:firefly 判轨；种子零世界轨最保守。内容审出两处修订：persona.md「默认唤对方开拓者」群聊语境含糊→改为失忆前后旧事对象的专属称呼；荤梗关系例外收紧——她外形偏小年龄未明且自带纯真童心特质，原允许恋人下配合性描写过宽，改为亲密可不躲但露骨一律不展开（底线节同步），与叶瞬光包在此点刻意不对称。种子28条不动：前史占比半数可接受（相关性门控+不卖惨兜底）。验证：重生成 seed-export.json（persona 4693字），静态校验全过，BrainStore.importData 实测 merge 幂等 {28,0}→{0,28} 全落自我轨。后续：灌实例试跑观察兵器回声触发频率；3.x/4.x剧情推进后校订。落点：personas/firefly/persona.md+seed-export.json+prd.md 内容走查节+CHANGES.md。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 101: 人设包走查遗留问题集归档
<!-- trellis-session: v=2 fp=9ec048ac57768987 -->

**Date**: 2026-11-10
**Task**: 人设包走查遗留问题集归档
**Branch**: `main`

### Summary

问题：用户要求从用户体验/工程/长期质量多角度评估人设包当前做法。排查：核对注入链路（persona全量注入+种子相关性召回）、衰减（retention只排序不删除）、巩固（minAgeDays=1自动压缩episodic）、导入（不补向量）与线上 export 数据。发现：F1语义巩固产出无self字段靠我字启发式判轨，或致世界轨串味（迭代A遗留，种子次日即触发）；F2 manual会话modal众数28v28取firefly，叶瞬光episodic永不巩固；F3 import不embed+backfill interval清盘后自杀，firefly 28种子0向量（叶瞬光有向量纯属时机）；F4人设包缺AI身份条款。已排除：抖搂/问什么答什么/记忆彻底丢失均非问题，端到端已验证（线上已有1条firefly戳demo记忆正确落世界轨）。方案：归档 tasks/11-10-consolidate-track-gaps（P1，F1有明日时效），修法建议=巩固按源轨继承self+importData补embedNotes+两包补AI条款。验证：代码行号锚点+两次线上export快照对照。后续：明天巩固触发后拉export核对产出轨归属。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 102: 人设包走查遗留问题集 F1-F4 修复上线
<!-- trellis-session: v=2 fp=a9239040c26e692b -->

**Date**: 2026-11-11
**Task**: 人设包走查遗留问题集 F1-F4 修复上线
**Branch**: `main`

### Summary

修复流萤人设包走查发现的四个迭代遗留缺口。F1 语义巩固产出无 self 轨继承（迭代A漏改巩固产出侧）：CONSOLIDATE_PROMPT schema 补 self 字段+判定说明，consolidateBatch 加确定性兜底——全自我轨源批次产出缺省继承 self:true，LLM 显式 self 含 false 优先。F2 manual 会话 modal 单视角致非众数角色 episodic 永不巩固：consolidate 重构为 consolidationBatches 按 characterOf 分批各跑一次（世界轨并入众数角色批），sessionsNeedingConsolidation 同口径，单角色会话零回归。F3 importData 不补向量+backfill 一次性自清：Brain.importData 导入后对无向量条目 fire-and-forget embedNotes，回填 interval 删 n===0 自清改常驻清扫。F4 两包 persona.md 补 AI 身份条款并 PATCH 同步生产（顺带对齐 firefly 包走查后的 persona.md 修订）。验证：单测+5 共 188/188 绿、typecheck/build 0 错、eval 人设隔离 100%/0%（lexical 段存量 FAIL 经 stash 验证与本次无关）；部署前成对备份，rsync+restart 干净，生产验证 firefly 向量 0→29/29、回填日志 5条/30s 节奏正常、personas PATCH ok active 保持 firefly。排查插曲：测试 mock JSON.stringify 括号少一层已修；git stash 验证 eval 基线时连同其他会话未提交档案一起暂存，pop 后确认完好。后续：观察 'manual' 会话下一轮巩固产出轨归属；whale persona.md 同缺 AI 条款未修（超出两包范围）；求职材料/ 目录保持未跟踪。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 103: 陪伴 Agent 架构定位与 Java 可行性讨论
<!-- trellis-session: v=2 fp=d4d47ad43304ed55 -->

**Date**: 2026-11-12
**Task**: 陪伴 Agent 架构定位与 Java 可行性讨论
**Branch**: `main`

### Summary

用户问 companion agent 落地后三个架构问题：brain 是插件还是核心模块、业务怎么设计、Java 重写是否可行。源码核对确认 src/brain ~3.7k 行零运行时依赖、零 Cordis 引用、fetch 可注入。结论：brain 在 companion 中是核心 library——插件性只在装配层，同一代码在 dsh 是插件、在 companion 是库，角色由宿主决定，这正是宿主无关内核的实证；业务上记忆内核=护城河零重写，新建量集中在壳层（chat loop/session/主动开口/web 渠道/成本账本），单用户假设到底、可观测即产品；Java 完全可行（持久化/检索/衰减/LLM 调用均平凡映射，distill.ts 465 行是唯一密集处，有 153 单测+44 条评测集当 oracle），但内核不重写——价值在决策不在代码、内核是迭代 C-G 未完的移动靶、Java 版会破坏「同一内核两 deployment」的简历支点、且 TS 壳层天级 vs 移植周级延迟真正目标；Java 的正确位置是学习性移植 kata（retrieval.ts/decay.ts + eval 集验证等价性）。纯讨论无代码改动，存档 tasks/11-12-companion-arch-java-eval。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 104: F1-F4 修复生产走查验收
<!-- trellis-session: v=2 fp=26d6c9b3e7d049a1 -->

**Date**: 2026-11-12
**Task**: F1-F4 修复生产走查验收
**Branch**: `main`

### Summary

对 11-11 上线的 F1-F4 修复做部署后 ~32h 生产走查：拉 /api/export 快照(351 notes)+brain.log 逐项核对。F1✅ manual 会话 11-11 09:23Z 首次巩固，产出4条 semantic 全 self:true+personaId=ye-shunguang（第三人称行文正是旧启发式必漏形态），源批10条叶瞬光self轨ep全吸收退池，第5候选判重收编；F2✅ 非众数角色批首次可达；F3✅ 351/351全向量零缺口，常驻回填3分钟drain 29条；F4✅ 两包AI身份条款在产。零错误。预期内延迟：firefly 10条种子11-11 11:54Z才满minAge而manual冷却锁到11-12~09:23Z，预计今日tick补上。待决观察：whale legacy人设仍含'不要自称AI'旧条款与新包口径相反。验收节追加至归档prd，广播+本journal同步。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 105: 迭代C·主动召回 brain_search 上线
<!-- trellis-session: v=2 fp=bbb28f9d5fab3c16 -->

**Date**: 2026-11-12
**Task**: 迭代C·主动召回 brain_search 上线
**Branch**: `main`

### Summary

按 11-09 路线图 §4 落地迭代C：Brain.search 纯检索原语（可见池与 assemble 逐字同口径 trackVisible+scopeVisible+absorbed，返回 ScoredNote[],opts 支持 limit/kinds/crossSession/minCos/minEmbedCos，变体池独立 indexKey 防索引串味）+ assemble 内 maybeDeepRecall 确定性门控（RECALL_INTENT_RE 意图词∧lane-1 真相关命中<2 双门，跨会话深挖≤3条进 deepRecallLines→brain:deeprecall section order 10325，去重+按 lane-1 规则强化，零新增 LLM）。eval 驱动关键修正：初版沿用 lane-1 地板实测注入 rel=0.057 噪声，深挖行权威口径宁缺毋滥，fixture 校准默认 minCos=0.07/minEmbedCos=0.55。验证：199 tests 全绿；eval 深挖子集 d01-d05 lexical recall=100%（3/4 lane-1 未中救回）噪声=0，主集 88.2%/40% 持平。部署插曲：rsync 源目录漏尾斜杠把新 dist 写进 dist/dist/ 嵌套，线上跑的仍是旧码，纠正为 dist/→dist/ 同步+清理嵌套后重启确认「深挖 on」。云端走查：/api/query?depth=1 跨会话 scored 结果正常；活动人设 firefly 下 whale/ye 自我轨按三轨隔离正确不可见（深挖空结果=隔离生效佐证）；向量回填运行中。待用户自测真实「你还记得」提问观察 brain.log 深挖召回行。companion 壳层（迭代F）将包装 Brain.search 为 brain_search tool。

### Git Commits

| Hash | Message |
|------|---------|
| `ac1f906` | feat(brain): 迭代C 主动召回——Brain.search 原语 + recall-intent 深挖门控 |

### Status

[OK] **Completed**


## Session 106: F1-F4次日+迭代C首日联合走查：发现F5视角错配
<!-- trellis-session: v=2 fp=3cecef775038c42e -->

**Date**: 2026-11-13
**Task**: F1-F4次日+迭代C首日联合走查：发现F5视角错配
**Branch**: `main`

### Summary

迭代C上线次日生产走查（export 395条+brain.log+宿主transcript）。预期项全绿：firefly manual批11-12 02:30Z闭环(5产出/源10条firefly self轨ep全吸收/manual未巩固源=0)；向量395/395零缺口重启回填41条自愈；新增44条全即时带向量；蒸馏122次零失败；记忆实战生效(assistant引用'上次还是108天'打卡记录)。深挖~33h零触发=群106+私聊25条消息零真实召回提问，非漏检但未经实战；AI身份条款同未实战。新发现F5：dbf7162a批4条世界轨源(2ye+2firefly)并入全时段众数whale-devotion→LLM判self:true产出落whale自我轨(内容=ye师姐/澄辉坪桂花糖lore，firefly不可见+whale串味)，世界事实被whale视角消化成主人/恋人态度而firefly轨缺态度。根因=consolidationBatches世界轨并入全时段modalChar。候选修法a世界轨按源角色分批(推荐)/b近期窗口众数/c产出校验(不可行)，待拍板。建任务11-13-consolidate-view-mismatch+广播。

### Git Commits

| Hash | Message |
|------|---------|
| `d940d76` | chore: 走查发现 F5——巩固世界轨批视角错配致 self 产出错轨 |

### Status

[OK] **Completed**


## Session 107: F5 设计决策 + 信息模式活人感分析
<!-- trellis-session: v=2 fp=4cd25ad3446ea047 -->

**Date**: 2026-11-13
**Task**: F5 设计决策 + 信息模式活人感分析
**Branch**: `main`

### Summary

F5：复查发现画像是第二泄漏通道——sess:dbf7162a 画像混写 whale『主人』与 ye『小师弟/师姐/澄辉坪桂花糖』，泛指『角色』行文每轮注入任一角色；只改分批不够。决策 F5a 世界轨也按源角色分批（单角色会话不变，宁慢不错）+F5b 画像关系必须点名角色、角色视角感受落 attitude，存量画像与错轨条人工 PATCH。活人感：解析宿主 transcript 群881+私聊72轮，按人设×搜/非搜统计——搜索回合跨人设共享『结论+markdown链接+免责』骨架，均长2-4×，链接38-86%；legacy 有『嫌麻烦→搜→锐评』口径保住79%口吻，whale-gentle/devotion 0%，firefly 免责50%；知识密集追问不调工具也百科腔（加粗分节/编号）；人设相关怪问题口吻正常。根因：dsh-tool-web 注入 cite as markdown links（QQ不渲染，order 2100 在 persona 后）、搜索返回二手摘要、新人设缺信息模式口径；观察项 firefly 一天22条道德立场 attitude 或致说教自强化。方案 L1 brain:channel-style 静态段 order~10250 / L2 人设包补信息模式节 / L3 走查指标固化。两任务均待用户确认实施。

### Git Commits

| Hash | Message |
|------|---------|
| `d598835` | chore: F5 设计决策 + 信息模式活人感问题分析存档 |

### Status

[OK] **Completed**


## Session 108: F5 修复 + 信息模式活人感 L1-L3 上线
<!-- trellis-session: v=2 fp=55a9fd5b0158a043 -->

**Date**: 2026-11-13
**Task**: F5 修复 + 信息模式活人感 L1-L3 上线
**Branch**: `main`

### Summary

用户确认方案后同日实施部署。归属判定：F5a/F5b 属迭代A遗留（F2 修复覆盖盲区+画像路径未纳入三轨审查），活人感属 G 体验层（宿主 markdown 指令自 legacy 时代即存在+迭代B 人设包缺口）；后续 C/D/E 均不覆盖，须现修，D 开发可与观察窗并行。F5a consolidationBatches 统一按 characterOf(notePersonaId) 分组（代码净减），复现测试旧✖新✔；F5b PROFILE_RELATION_RULE 四路 prompt。L1 brain:style order 10250（宿主 tool:web_fetch 2100/persona-suffix 10200 之后、易变段之前）+injectChannelStyle/channelStyle 可按渠道配；L2 firefly/ye persona.md 与生产 whale-gentle/devotion 补信息模式交付口径（PATCH 保留 characterId/moods）；L3 scripts/reply-style-audit.py 落部署前基线（firefly 搜索 link38/hedge50，whale 搜索 link83）。验证 204/204、typecheck/build、eval 隔离与深挖 100/0 不变。部署前成对备份 pre-F5-*；存量错轨条改点名版+self:null、sess:dbf7162a 画像首句点名改写，复核无残留、回填 18 条清盘、零错误。两任务进入观察窗，待复跑审计与下次多角色巩固核对后补 Resolution 归档。

### Git Commits

| Hash | Message |
|------|---------|
| `18e2dbc` | fix(brain): F5 巩固按源角色分批+画像关系点名；brain:style 渠道表达口径与人设信息模式节 |

### Status

[OK] **Completed**
