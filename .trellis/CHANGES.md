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
- 2026-11-14 | 星图分布规则排查存档：角度=√(ageDays)顺时针/半径=kind/quotaPick按imp×ret不看时间；生产导出实测 407条中237条(58%)为absorbed存档且84/150画面星是存档（web全皮肤不消费absorbed字段），是「一周前情景记忆」主因；附带发现ang()在~39.5天回绕隐患 | → `tasks/11-14-nocturne-star-layout/prd.md`
- 2026-11-14 | 墨刊地层图节点富集问题分析定案：三根因=ageDays整数天同x+quotaPick按imp×ret随recency单调+碰撞仅y向30px固定且k<14后叠放/跨带不查；方案P0连续年龄x+二维真实半径碰撞、P1 LOD时间配额+标签AABB、P2 32d+尾巴，全前端可落 → `tasks/11-14-dossier-node-cluster/prd.md`
- 2026-11-14 | 蒸馏归因缺陷线上实证：群友讨论图片中 coser（琳汐汐吖o）身份，产出「花咲蝶舞：是211研究生/程序员/coser」两条 world 轨错配（bc091a78/436c508f，画像暂未污染）；根因=distillEveryTurns=1 单轮蒸馏指代无解默认归发言人+[Reference attachments] 被 parseSenderTag 丢弃+prompt 无第三方兜底；全量扫描确认错配仅此 2 条，另发现 ~46 条 content主语/actor不一致；修复方向 P0 prompt 护栏/P1 附图标记/P2 指代锚点（成本评估）/数据修复待拍板 | → `tasks/11-14-distill-attribution/prd.md`
- 2026-11-14 | 验收登记处机制立项：三级验收模型（代码/部署/实证）——部署≠验收，实证项带证据阈值（事件/样本/抽查）跨走查存活；`.trellis/acceptance.md` 首批登记 8 实证项（ACC-01~08）+5 持续观察项，AGENTS.md 归档流程补「登记≠通过」前提，AI-WORKFLOW backlog 立条待沉淀 spec | → `tasks/11-14-acceptance-registry` + `.trellis/acceptance.md`
- 2026-11-14 | 墨刊方案复审修订：弃碰撞补丁改「数据诚实+cell聚合」——absorbed存档条退出绘制集（星图实测58%是存档）、(kind×天)cell≤K点+'+N'密度标记点击侧栏展开、两级LOD保60cap、>32d自然成尾cell；第一期~120行dossier.js待拍板absorbed口径
- 2026-11-14 | 星图 absorbed/密度修复落地（未部署）：活星改 !absorbed+按环容配额{24,38,52}=114；absorbed 降级为外带 r=302 存档星尘≤40（优先 derived 引用者，可点选、侧栏标存档）；巩固弧活星→星尘保留、相似/会话边限活星间；ang() 改渐近饱和 330°·d/(d+8) 根治 ~39.5 天回绕；vm.js 零改动其他皮肤不受影响；typecheck+268test+build 绿、headless demo 实测 106星+40尘零报错 | → `tasks/11-14-nocturne-star-layout/prd.md`
- 2026-11-14 16:49 | 蒸馏归因缺陷 P0+P1 落地（未部署）：distill prompt 新增「归属铁律」段——指代/省略主语无法确定所指不得默认归发言人、[附图][附件]标记提示附件中人物、主体不明宁可不记或事件式表述；parseSenderTag 新增 extractAttachments 把 [Reference attachments] 块折算成 [附图]/[附件] 标记入 text（原实现漏进 history 伪装成 Chat history），引用块 [image:x] 媒体占位剥除；单测+6 例、274 tests+typecheck+build 全绿；P2 指代锚点暂缓、线上 2 条错记待授权修复 | → `tasks/11-14-distill-attribution/prd.md`
- 2026-11-14 | 星图「今夜区出现老星」根因修复：旧碰撞消解单向 +0.045×60 无界推挤，密集格星顶满 k=60 → +154.7° 偏移把 day11-18 甩进顶部（DOM 实测 dev 恰=60×0.045rad）；改 _place 候选式落位（真实角→双向±12°→径向±8/15，全撞取净空最大），活星 thr30/尘 thr10；重测 max dev=11.5° 顶区只剩 day2-5；274 tests+build 绿（未部署） | → `tasks/11-14-nocturne-star-layout/prd.md`
- 2026-11-14 | 星图修复归档：absorbed星尘层+环容配额114+ang()渐近饱和+_place有界落位（max dev 154.7°→11.5°）两轮验证全绿，commits 9ae132e/a3b6c4f，未部署待其他会话同批上线 → `tasks/archive/2026-11/11-14-nocturne-star-layout` + journal #116
- 2026-11-14 | 墨刊 cell 聚合重构落地（未部署）：absorbed 退出绘制集+刊头存档计数、(kind×天)cell≤4点+'+N'带缝标记侧栏roster、三级配额 allocBudget 保60cap全轴覆盖、连续年龄x+碰撞pass零重叠、标签AABB；headless 实测 60节点/46标记零重叠零互压，274tests+build 绿 → commit 3ef7b8a，`tasks/archive/2026-11/11-14-dossier-node-cluster`
- 2026-11-14 | 墨刊二轮复查修复（未部署）：无处可放节点降级进「+N」（解饱和压叠）、pin标签双锚位+x微移+圆-矩形真距防叠救回24满额、情景带「+N」错峰双行、边端点收束到圆边+similar配额20；headless实测 60节点0重叠/45标记0互叠/24标签0越界0压面，274tests绿 | → `tasks/archive/2026-11/11-14-dossier-node-cluster`
- 2026-11-14 | 墨刊三轮交互打磨（未部署）：索引表50行直出改30/页页脚翻页、杀.node focus蓝边框改用halo环做sel/near可见态、删_select的scrollIntoView强制滚底；实测30行/页·第1/10页·286条，274tests绿 → commit 6df9ed3，`tasks/archive/2026-11/11-14-dossier-node-cluster`
- 2026-11-14 | /brain 顶栏主题适配+版式迭代：app.js paintChrome() 把皮肤 tokens+人设 accent 写到 body+data-skin（复用管理端 applyTokens），app.css 顶栏全 token 化+body[data-skin] 三皮肤差异化（墨刊刊头双线墨规方角/星图衬线金线/鲸脑深海保留），--txt/--dim/--bg2 别名转发使 toast/modal/通用控件自动跟随；导航改下划线激活、皮肤键改分段控件；typecheck+274test+build 绿，headless 三皮肤+admin 截图实证（未部署，随 P4 批） | → commit ad97a79，`tasks/archive/2026-11/11-14-topbar-theme-fit`
- 2026-11-14 20:10 | 部署生产（用户拍板）：顶栏主题适配 ad97a79 + 同批未部署项一并上线——星图星尘/落位修复 9ae132e·a3b6c4f、墨刊聚合三轮 3ef7b8a·59c1fb0·6df9ed3、蒸馏归因P0P1 1d3a763；备份 pre-topbar-{plugin,data}-20261114T120617Z.tgz（~/backups），rsync dist+package.json 后 restart active、启动日志全特性 on、/api/state 200、远端 paintChrome/data-skin 实证新壳服务 | → `tasks/archive/2026-11/11-14-topbar-theme-fit`
- 2026-11-14 23:40 | 蒸馏归因任务收尾：线上 2 条错记（bc091a78/436c508f）经 DELETE /api/notes 删除（del op 可重放），传播扫描零命中画像未污染；实证验收登记 ACC-09（≥3 个部署后附件/指代轮次错配=0）；任务归档，P2 指代锚点待 ACC-09 观察后再议 | → `tasks/archive/2026-11/11-14-distill-attribution` + `.trellis/acceptance.md` ACC-09
- 2026-11-15 | 走查：ACC-06 intents 生命周期首个实证通过（CRUD/校验/cancel/tick/手动+60s定时器双路径fire/op审计/清理全通，测试intent已删）；其余实证项受周日低流量卡样本——ACC-02 N=1/10、ACC-03 N=25/30、ACC-05 N=1/20、ACC-09零合格轮、ACC-01/04/07待触发；持续项：向量407/407、画像零泛指、brain.log零错误；ACC-08 eval基线4FAIL仍待决 | → `.trellis/acceptance.md`
- 2026-11-15 | ACC-08 定性豁免（用户拍板留痕）：lexical 4FAIL=char-ngram 固有盲区，生产 embedding(dashscope v3) 实测 recall100%/noiseFP20% 全修；emb n02 话题相邻注入阈值不可分、companion 语境边际有用；遗留=话题/情景分离信号或换模型，后续迭代级 | → `tasks/11-15-eval-baseline-fails` + `.trellis/acceptance.md`
- 2026-11-15 | 私聊人设排查定案：注入链路正常（persona.md/activeId=firefly/每轮八段齐全），AI味根因=顾问体裁惯性+「开拓者」锚点未接demo+人设无私聊模式；对照群聊新会话满分流萤腔反证；修复方向P0人设补锚点待拍板 | → `tasks/11-15-private-chat-persona-voice/prd.md`
- 2026-11-15 | 私聊人设修复方向拍板：否决 demo=开拓者硬映射与画像 dismiss 补丁（多用户场景/治标不治本）；通过 A 人设说话风格补实质回合声口示例+B channelStyle 反说明文腔（均通用）；画像关系事实按 characterId 隔离立项为迭代E6；prompt 层有效性未证实，A+B 实测不佳再查宿主框架底色 | → `tasks/11-15-private-chat-persona-voice/prd.md` + `tasks/11-09-iteration-upgrade-plan` E6
- 2026-11-15 19:15 | 私聊人设声口 A+B 实施并部署生产：四人设说话风格收紧+情境参考补实质回答示例（firefly/ye 改 personas 包重生成 seed，whale 系改 bundled md），channelStyle 加反说明文腔条目；顺手回填 whale 系 11-13 生产 PATCH 的知识题口径到仓库（消除漂移）；commit 6da9671，rsync+restart 19:09 active，四人设 PATCH 上线（legacy 冻结未动），persona.md 镜像同步；实证验收登记 ACC-10（私聊≥120字实质回答 voice% 恢复，audit 脚本加 --min-len） | → `tasks/11-15-private-chat-persona-voice/prd.md` + `.trellis/acceptance.md` ACC-10
- 2026-11-15 | 迭代E6 实施完成待部署：画像关系事实角色隔离——蒸馏/巩固/撰稿关系句加〔角·角色名〕标记（PROFILE_RELATION_RULE 三路引用+审核路保标记），assemble 经 scopeProfileChars/profileCharScope 按激活 characterId 过滤（本角色保留去标记/他角色剥句/未知名保留不误删），与〔私〕复合兼容；零 schema 变更零新增 LLM 调用，存量无标记画像天然兼容；typecheck+276test+build+eval 绿（4 FAIL 为 ACC-08 豁免基线）；实证验收登记 ACC-11 | → `tasks/11-16-iteration-e6-profile-relations` + `.trellis/acceptance.md` ACC-11，commit 37cbd1c
- 2026-11-15 19:31 | 迭代E6 部署生产：备份 pre-e6-{plugin,data}-20261115T113053Z.tgz，rsync dist+package.json，restart active 全特性 on，dist 三文件含 scopeProfileChars/〔角·〕实证新码上线，/brain 401 存活；任务归档 archive/2026-11/11-16-iteration-e6-profile-relations，ACC-11 待触发 | → `.trellis/acceptance.md` ACC-11
- 2026-11-15 23:50 | 迭代E 本轮：E6 存量回填完成 + E1–E5 首轮信号取证——3 画像补 14 处〔角·〕标记（u:FEFE5282×5/sess:dbf7162a×6/sess:manual×3，PATCH /api/profiles 落 op 可重放，真实 scopeProfileChars 逐角色模拟验证过滤正确；插曲：标记后超 PROFILE_TEXT_CAP=500 截断丢末句，瘦身重 PATCH 修复）；E1–E5 五项触发信号均未触发继续储备，顺带发现 per-persona 世界事实 semantic 重复对（E4 候选素材）与 LLM 标记遵从率 N=1 未遵从（ACC-11 改按标记存活率判定） | → `tasks/11-15-iteration-e-backfill-signals` + `.trellis/acceptance.md` ACC-11
- 2026-11-15 | 流萤人设「此刻类问题」走查定案：根因=persona.md 只有习惯（每晚屋顶/每天蛋糕卷）没有此刻，白天空白+绝对化频率词+缺「结合【当前时刻】现场编」规则+屋顶锚点5处+种子放大+历史自我强化；生产实证两晚「在干嘛」答案逐字雷同（屋顶+半个蛋糕卷），whale 对照组答案多样有生活场景；同类问题清单7项，修复方向 P0此刻感条款+情境示例待拍板 | → `tasks/11-15-firefly-persona-now-moment/prd.md`
- 2026-11-15 23:59 | 私聊人设声口复诊：A+B部署后私聊仅2条短闲聊样本，实质回答/搜索回合零样本未证；群聊搜索N=2干净；新根因N1推理层顾问式规划(reasoningEffort=high)+N2工具结果cite链接指令与channelStyle冲突+N3人设缺朋友式帮忙程序+N5搜索只回裸URL；交付层排除；方向D1-D5待拍板 | → `tasks/11-15-private-chat-persona-voice/prd.md` 复诊评估段
- 2026-11-16 00:30 | 私聊声口复诊 D1+D2 实施并部署生产：channelStyle 加「工具结果叫引链接也按QQ口径」冲突消解条（N2）+四人设情境参考补「任务清单求助」朋友式帮忙示例（N3，seed-export重生成）；commit 7ed37f7，rsync+restart active，四人设 PATCH 上线零漂移、firefly 镜像 md5 同步；N1 推理层顾问模式用户拍板暂缓已留痕待探讨 | → `tasks/11-15-private-chat-persona-voice/prd.md`
