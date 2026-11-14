# CHANGES · 跨会话广播位

> **这是什么**：多会话并行时的「最近发生了啥」速览。每个会话开工先 `tail -30` 本文件；做到四类事件时顺手在**文件尾部**追加一行。约定全文见 `AGENTS.md`「跨会话广播位」。
>
> **旧会话恢复 / 跨时段继续**：不必全读——往回读到条目时间戳早于你最后活跃时点为止，只补这些增量即可（几天前的会话同样适用）。

## 记什么（四类触发，落地即记，不等会话结束）

1. 定了优化方案 / 设计方向（plan/design 敲定，哪怕还没写代码）
2. 完成一项改动 / 功能 / 部署
3. 定了后续发展方向（roadmap、下一步决策）
4. 项目状态 / 结论性认知变化（评估结论、线上状态、阶段判断）

## 条目格式

```
- YYYY-MM-DD HH:MM | 事件一句话 | → 指针（task 目录 / journal #N / commit / 文件路径）
```

- 一行一条，**只写索引不写细节**；细节永远以 task prd.md / journal 为准。
- 指针至少给一个，让后来者能顺藤摸瓜。
- 只留最近 ~100 条，超出删旧（细节不丢，在 `.trellis/tasks/` 与 `workspace/*/journal-*.md`）。
- 追加时撞车了（并行会话同时写）重试即可；条目随正常提交走，不必单独 commit。

---

<!-- 种子条目：从 journal #83-#92 与未提交任务目录回填，日期精度到天 -->

- 2026-11-05 | 私聊记忆白纸修复上线：C2C 发言人绑定 | → journal #75
- 2026-11-07 | 私密域隔离完成设计→实现→部署→验收 | → `tasks/archive/2026-11/11-07-private-domain-isolation` + journal #83
- 2026-11-07 | 15s 自动刷新编辑保护（方案A）落地 | → `tasks/archive/2026-11/11-07-brain-refresh-guard` + journal #81
- 2026-11-08 | MAP.md 项目地图建立（where&how 导航） | → `tasks/archive/2026-11/11-08-project-map` + journal #89
- 2026-11-09 | 导览文档保鲜约定入 AGENTS.md（MAP+README） | → `tasks/archive/2026-11/11-09-map-freshness-rule`、`11-09-readme-freshness-refresh` + journal #90-#91
- 2026-11-09 | 成本一线约定入 AGENTS.md | → `tasks/archive/2026-11/11-09-cost-first-convention` + journal #92
- 2026-11-09 | 进行中未提交：叶瞬光人设包 `tasks/11-07-ye-shunguang-persona`、多人设切换设计 `tasks/11-08-persona-switch-design`、`personas/`、`求职材料/` | → 对应 task 目录 prd.md
- 2026-11-09 | 跨会话广播位约定落地：新增本文件 + AGENTS.md 硬约定（开工先 tail） | → `tasks/archive/2026-11/11-09-cross-session-changes`
- 2026-11-09 | 广播位约定补充：「开工」定义扩到旧会话恢复/跨时段继续，时间戳增量补课 | → `tasks/archive/2026-11/11-09-cross-session-changes`
- 2026-11-09 | 陪伴型 Agent 方向评估：可行，建议 web 1-on-1 先行（library import 内核），定位为简历「第二 deployment」证据而非独立项目 | → tasks/11-09-companion-agent-eval
- 2026-11-09 | 归档大扫除：删空目录、11-04-p2→consolidation-absorb-merge 改名补档、3处年份typo、补4个task.json、7个陈旧进行中任务归档 | → `tasks/archive/2026-11/11-09-archive-hygiene-sweep`
- 2026-11-09 | 记忆架构调研首轮完成：Letta/Mem0/Zep 对照报告，结论=不整体引入、6条思想级借鉴（brain_search主动召回/dreaming重组/双时态/entity boost/图扩散） | → `tasks/archive/2026-11/11-09-memory-persona-arch-research/memory-arch-survey.md`
- 2026-11-09 | 记忆架构调研第二轮完成：人格方案+陪伴产品形态（OpenClaw为最近表亲），合并借鉴清单10条，调研范围全部完成 | → `tasks/archive/2026-11/11-09-memory-persona-arch-research/persona-companion-survey.md`
- 2026-11-09 | 记忆/人格架构调研任务归档（两轮报告+Resolution），journal #95 | → `tasks/archive/2026-11/11-09-memory-persona-arch-research` + commit 56c4ee7
- 2026-11-09 | 迭代升级方案定稿：七迭代路线图 A-G（人设三轨地基→叶瞬光接入→主动召回→prospective memory→储备项→companion壳层→体验层），每迭代带验收+云端数据走查；决策点已列（attitude粒度已定角色级，余4项随方案评审） | → `tasks/11-09-iteration-upgrade-plan/iteration-plan.md`
- 2026-11-09 | 迭代A·人设三轨地基开发完成并部署上线：角色→人设两级、自我轨按 characterId 隔离、批次戳、存量迁移；线上 whale 三人设归并验证通过 | → `tasks/archive/2026-11/11-09-iteration-a-three-track` + journal #96
- 2026-11-09 | 迭代A 走查补修上线：self 三态 API 透传、情绪盖章/蒸馏提示词按批次角色口径、modalPersonaId 并列取较晚、strength 地板幂等、noteChar whale 回落 | → `tasks/archive/2026-11/11-09-iteration-a-three-track` prd 走查补修节
- 2026-11-09 | 迭代A前端补全上线：记忆库新增「角色」「轨道」筛选（审计三轨隔离用），人设下拉同角色多版本标注 ·characterId | → commit 085d828
- 2026-11-09 | 迭代A 走查补修 journal #97 | → `tasks/archive/2026-11/11-09-iteration-a-three-track` prd 走查补修节
- 2026-11-10 | 简历优化版产出：删工作经历换 qqbot-brain 项目，Java 向 bullet 重构 | → `tasks/11-10-resume-optimize` + `~/Documents/简历/Java简历-优化版.md`
- 2026-11-10 | 迭代B·叶瞬光接入上线：种子28条全落自我轨+merge幂等导入+per-persona MOODS（10词表）接线，生产已激活 ye-shunguang 待用户自测 | → `tasks/archive/2026-11/11-09-iteration-b-ye-shunguang` + journal #98
- 2026-11-10 | 流萤人设包产出：`personas/firefly/` 与 ye-shunguang 同构（persona.md+28条种子+生成器+README），多源比对完成未接线 | → `tasks/11-10-firefly-persona/prd.md`
- 2026-11-10 | 流萤人设包走查通过：BrainStore.importData 实测 merge 幂等+分轨+不抢占激活，修订4处表述（娇小/起爆开关歧义/地名） | → `tasks/11-10-firefly-persona/prd.md`
- 2026-11-10 | 流萤人设包内容走查（串味/死板/合适性）：修「开拓者」称呼专属化+荤梗关系例外收紧（露骨不展开），种子不动；机制层三轨隔离复核无串味 | → `tasks/11-10-firefly-persona/prd.md` 内容走查节
- 2026-11-10 | 流萤人设包已导入生产实例：merge 导入 28 种子+人设注册（幂等口径实测一致），ye-shunguang 保持激活未被抢占；导入前已落 ~/backups 预导出 | → `tasks/11-10-firefly-persona/prd.md`
- 2026-11-10 | 人设包走查发现迭代遗留问题集：F1语义巩固产出无self轨继承（迭代A遗留，种子次日即触发或致串味）+F2 manual会话modal单视角致叶瞬光episodic永不巩固；F3 import不补向量+backfill一次性自清（迭代B方法层缺口，firefly 28种子当前0向量）；F4人设包缺AI身份条款 → `tasks/11-10-consolidate-track-gaps`
- 2026-11-11 | 迭代节奏定调：维持串行小步上线（做完→部署→观察窗→修好→下一个），观察窗信号驱动非固定天数；开发可流水线但部署串行，F1-F4 先于迭代C部署 | → `tasks/11-11-iteration-cadence/prd.md`
- 2026-11-11 | AI 驱动开发工作范式成文：AI-WORKFLOW.md 落地仓库根（六原则/质量防线/成本两条线/差距自检+backlog），AGENTS.md 首条指针+MAP.md 三处同步 | → `AI-WORKFLOW.md` + `tasks/11-11-ai-dev-workflow/prd.md`
- 2026-11-11 | 人设包走查遗留问题集 F1-F4 全部修复上线：巩固按角色分批+全自我轨源继承 self、importData 即时补向量+回填常驻自愈、两包补 AI 身份条款并同步生产；firefly 28 种子向量 0→29/29 补齐 | → `tasks/archive/2026-11/11-10-consolidate-track-gaps` + journal
- 2026-11-12 | 陪伴 Agent 架构定位讨论：brain=核心 library（角色由宿主决定）、业务切分=内核护城河+壳层新建、Java 可行但内核不重写（Java 位置=移植 kata） | → `tasks/11-12-companion-arch-java-eval`
- 2026-11-12 | companion 推进顺序确认：套壳层=迭代F、C/D是其前置（D provenance 不落地则主动消息污染记忆）；Java复写=末尾模块级kata无需完整移植设计；F节奏拍板=先做MVP设计、两种排期写进design.md后定 | → `tasks/11-12-companion-arch-java-eval`
- 2026-11-12 | F1-F4 生产走查验收全过：manual首巩固产出4条self轨semantic（源10叶瞬光ep全吸收）、向量351/351零缺口、两包AI身份条款在产；firefly批因种子未满1天+会话冷却预计今日补上；观察=whale系仍含旧式"不自称AI"条款待决 | → `tasks/archive/2026-11/11-10-consolidate-track-gaps` prd 生产走查验收节
- 2026-11-12 | 存量AI项目接管翻新playbook定调：四阶段（摸底→立约→安全网→小步翻新），首会话只读产出三件套，git基线先行，翻新按风险×收益排序；开口模板已给 | → `tasks/11-12-brownfield-takeover/prd.md`
- 2026-11-12 | AI工作范式手册库建立：~/dev/code/vibe-coding/ai-workflow/（README+playbooks/含_template），首批入库 brownfield-takeover+iteration-cadence 两册；AI-WORKFLOW.md 加分工指针 | → `~/dev/code/vibe-coding/ai-workflow/` + `tasks/11-12-brownfield-takeover/prd.md`
- 2026-11-12 | 迭代C·主动召回上线：Brain.search 检索原语（assemble 同口径可见池+ScoredNote[]）+ recall-intent 双门深挖注入段（brain:deeprecall，零 LLM 成本）；深挖地板严于 lane-1（lex0.07/emb0.55，eval 驱动）；eval 深挖子集 100%/0% 噪声；已部署生产，待用户自测 | → `tasks/archive/2026-11/11-12-iteration-c-proactive-recall` + journal #105
- 2026-11-13 | 迭代C上线次日走查：firefly manual批已闭环(5产出源10全吸收)、向量395/395、深挖零触发=零真实提问非漏检；新发现F5=世界轨源并入全时段众数角色whale批→self:true产出错轨(ye lore落whale轨/whale视角消化世界事实)，修法候选待拍板 | → `tasks/11-13-consolidate-view-mismatch`
- 2026-11-13 | F5 方案定：a世界轨按源角色分批+F5b画像关系必须点名角色(画像是第二泄漏通道，sess:dbf7162a 混写主人/师姐)，待确认实施；活人感问题确认=集中于信息模式回合，根因宿主markdown引用指令+二手摘要+新人设缺信息模式口径，方案L1 channel-style段/L2人设包补节/L3走查指标 | → `tasks/11-13-consolidate-view-mismatch`、`tasks/11-13-search-reply-liveliness`
- 2026-11-13 | F5+活人感 L1-L3 同批上线：巩固全按源角色分批、画像关系点名（PROFILE_RELATION_RULE）、brain:style 渠道口径段（10250，压宿主 markdown 引用）、四人设补信息模式节并 PATCH 生产、reply-style-audit.py 落基线；存量错轨条+sess:dbf7162a 画像已清洗；进入观察窗 | → `tasks/11-13-consolidate-view-mismatch`、`tasks/11-13-search-reply-liveliness`
- 2026-11-13 | 迭代D本地开发完成（未部署）：D1 standing intents（event/time 双型+确定性零LLM触发+intent-fire op自带结果态重放确定+HTTP /api/intents CRUD/tick+插件60s定时器）、D2 provenance（Turn.via三态+agent/system批次跳蒸馏+混合批注标注非用户事实+MemoryNote.source四值贯穿蒸馏/导入/巩固/快照）；typecheck+test 220/220+build 全绿，eval 四处FAIL为HEAD基线既有（与本次无关）；部署等广播授权 | → `tasks/archive/2026-11/11-13-iteration-d-intents-provenance` + journal #109
- 2026-11-13 | 脑图通用皮肤（多IP人设）概念图定稿：做 A墨刊（档案/展示页）+ B夜航星图（招牌视觉：鎏金星盘+星云夜空+时间指针/彗星/流星动效+星历六块）+ D-admin（管理端），C 花序弃用；人设=主题参数（name/mono/pal四色/traits/moods/say）+自我轨/世界轨可视；概念图在 concepts/{a-dossier,b-nocturne,d-admin}.html，旧稿 v1/ | → `tasks/11-13-brain-generic-skin-concepts`
- 2026-11-13 | 管理端规格稿 d-admin 定稿归档：7页（概览/记忆库/人设/画像/流水/关联图/备份）+分页筛选排序+记忆与人设CRUD+可折叠开发标注（真实API/字段口径）+9项需后端新增+按页开发建议 | → `tasks/archive/2026-11/11-13-brain-admin-spec`
- 2026-11-13 | 后续方向：/brain 按 A+B+D-admin 重构（待开任务）——先补后端：记忆/流水服务端分页、人设 theme{a,a2,soft,deep}/情绪词颜色/traits 字段、批量接口、画像分页、dedup 预估；前端按页拆任务、以概念图+开发标注截图为规格交便宜模型还原，展示页 A/B 共用同一数据接口 | → `tasks/archive/2026-11/11-13-brain-admin-spec` prd「需后端新增」「开发建议」
- 2026-11-13 16:00 | /brain UI 重构设计定稿待批：三皮肤（鲸脑保留/墨刊/星图，默认跟人设、鲸脑通用）+ D-admin 管理端只换 token；拆 web/ 原生 ESM 多文件；后端 B1 人设 meta+B2–B5 分页/批量/去重预估；S0–S14 切片、P1–P4 上线点 | → `tasks/11-13-brain-ui-redesign/{design,implement}.md`
- 2026-11-14 00:38 | brain-ui-redesign S0 完成：demo 数据扩充为双数据集——大集 379 条（whale×2/ye-shunguang/firefly 四 persona 条目含 characterId/moods，世界轨 226/自我轨 153，43 absorbed+56 sourceIds derived 链，64 维合成 embedding，fading~110 覆盖保留率光谱）+ --small 保留原 38 条校园小集；serve-demo.ts 支持选文件；typecheck+test 220/220+build 全绿，serve-demo 实测 4 人设可切/456 边/nearDup 0 | → commit 2f0ec40，`demo/{generate_demo_export.py,serve-demo.ts,README.md}`
- 2026-11-14 09:11 | brain-ui-redesign S2 壳层落地：src/server/web/ 原生 ESM 骨架（core/{api,store,router,ui,theme}+skins 占位+views/map+顶栏），http.ts 加 /web/* 白名单静态服务（免口令仅限白名单、?ui=legacy 分流旧页、宿主 register 逐文件）、build 拷 web/；theme.js 三级解析+按角色皮肤键单测 12 例、http 静态用例全绿 234/234 | → `tasks/11-13-brain-ui-redesign` S2
- 2026-11-14 09:28 | brain-ui-redesign S4 cortex 迁移落地：page.html 展示区→skins/cortex.js（933行：解剖层/槽位布局/三类节点/连线/聚焦/信号脉冲/漂浮/缩放平移/检查器+编辑/记忆切片），vault 迁出走 #/admin/*；立绘 base64→assets/；theme 加 title 角色名、vm 加 mood.d/emotionSession、mapCtx 加 ops/sessions/actions+减动效默认；鲸脑视觉零回退（#8fb4ff/WHALE CORTEX/大肥鱼），非鲸换 accent+a2+mono 头像 | → commit 待定，`dsh-qqbot-brain/src/server/web/`
- 2026-11-14 10:04 | brain-ui-redesign **P1 完成**：S0–S4 全落——demo 双数据集、人设 meta、web/ 原生 ESM 壳层、vm.js+26 用例、cortex 皮肤零回退迁移；headless Chrome 端到端走查（firefly 默认 nocturne→cortex 回落、whale 旧视觉、?sel=/搜索/管理跳旧页、?ui=legacy 完好），261 tests+typecheck+build 全绿；三修：modal 遮罩吞点击/漂移节流/首帧品牌重挂 | → commits 2f0ec40/1427dbc/42005bf/a93ed00/15fc7e3/44eb9b5/aac62e1/8f341aa，下一步 P2 墨刊+星图
- 2026-11-14 13:35 | brain-ui-redesign **P2 完成**：S5 星图（星盘/银河canvas/时间指针/彗星流星/补间/星历六块，150星·24标·200边，?still=1 零rAF、hidden暂停、?sel=含LOD外）+ S6 墨刊（刊头/sqrt时间地层/巩固弧/专栏全文/索引前50→#/admin/memories，60点·24标·80边）落地，skins/index 注册三个、顶栏按钮全启用；三修：hex2rgb g通道slice错位（补间写错色）、PRESETS 加 ye-shunguang 别名（characterId=完整人设id命中预设）、首数据到达后重解皮肤（非whale人设不再卡 cortex）；typecheck+261test+build 全绿，headless 三人设两皮肤+legacy 零报错 | → commits ce1df1b/3d808c4/a5d78b0，下一步 P3 后端 B2–B5 + D-admin 七页（S7 起）
- 2026-11-14 14:20 | brain-ui-redesign P2 走查+性能优化：卡顿三处根因——_frame 每帧 150 星×2 SVG 属性写（~300次/帧，稳态 k=0 纯空转）、_drawSky 每帧 480 arc 重画、彗星 getPointAtLength×11/帧；修法=辉光写门控+静态星烘焙离屏 canvas+彗星路径预采样 160 点；另 store.refresh 加 payload 指纹（emotion PAD 衰减量化 .2f、retention 量化整数百分比=UI 精度）跳过无变化 rebuildVM，实测 30s 指纹稳定，真实跨百分比/新数据仍触发；dossier 补品牌键重挂；261test+build 全绿，截图无损 | → commit 232f9e2
- 2026-11-14 15:41 | brain 星图点击卡顿优化：select 路径 class 差分写入（_syncCls 缓存，只写变化元素）+ relations 邻接表（_neighbors O度）+ 边 stroke/draw 仅 on 翻转时写 + 同星点击跳过侧栏重建；commit 645886c，实测 ?sel= 状态正确零报错 | → dsh-qqbot-brain/src/server/web/skins/nocturne.js
- 2026-11-14 | brain-ui-redesign S7 后端 B2–B5 落地：GET /api/notes 分页查询（9类筛选+4种排序+20/50/100，字段同 graph() 投影）、/api/ops 分页模式（type/from/to，旧 limit 兼容）、POST /api/notes/batch（≤200 ids 白名单 patch/delete 互斥，逐条走既有 op 可重放）、/api/dedup?dry=1 预估（dedupePlan 与 sweep 共享模拟放行零写入）；268 tests+typecheck+build 全绿 | → `tasks/11-13-brain-ui-redesign` S7
- 2026-11-14 | brain-ui-redesign **P3 管理端落地（S8–S13）**：`src/server/web/admin/` 九模块——common（ctx/记忆口径/分页器/pauseEditing/leaveGuards/mutRefresh）、admin.css（D-admin token 化版式随皮肤+人设换色）、shell（#/admin* 原生路由替代旧页跳转+人设激活下拉）、七页全真实 API：overview（/api/state 统计+巩固）、memories（B2 九筛选+排序分页+B4 批量+抽屉 CRUD+self/可见域三态+放行队列+跨页定位）、personas（全字段+meta 四色实时预览+traits/moods/.md 导入导出+激活二次确认+脏检查）、profiles（编辑/合并/重生成/删除+会话域迁移）、ops（B3 分页+类型/时间+展开原始 JSON+跳记忆库）、graph（弧线图 40 截断+详情面板）、backup（导出/导入 merge·replace/去重 dry→exec/时段删/人设删/重置全确认词）；三修：mutRefresh 先 blur 再 refresh（按钮焦点会让 editing>0 静默跳过刷新）、personas 响应即全量落 store 防闪旧值、nav 选中态跟随 activeId；headless Chrome 七页全渲染零报错（379 记忆/13 画像/414 流水真实数据，graph 40 节点截断生效，三皮肤 token 正确下发）| → commit d9c6395，`tasks/11-13-brain-ui-redesign` S8–S13
- 2026-11-14 | F5+活人感走查验收归档：dbf7162a 部署后首巩固产出3条全firefly轨道正确、跨人设污染0、画像关系全点名；搜索回合 link 38→0/hedge 50→0（N=1样本薄，指标继续抽查）→ `tasks/archive/2026-11/11-13-consolidate-view-mismatch`、`11-13-search-reply-liveliness`
- 2026-11-14 | 迭代D+brain-ui-redesign P1–P3 整体部署生产（用户拍板一起上）：standing intents/provenance + 新/brain 皮肤×3+D-admin 管理端七页+B2–B5 后端上线，?ui=legacy 兜底；备份 pre-DUI-*；启动日志全特性on、/api/intents 200、/api/notes 分页通、新 UI壳已服务 | → `tasks/archive/2026-11/11-13-iteration-d-intents-provenance` + `tasks/11-13-brain-ui-redesign`（P4 收尾待续）
