# 验收登记处（Acceptance Registry）

> 实证验收项的唯一台账。**部署 ≠ 验收**：代码级验证随提交关闭，生产数据才能证明的项在这里登记、跨走查存活。
>
> 规则：
> - 任务归档的前提是**实证项已登记到本表**，不是已通过——归档 = 工作完成，验收状态在这里继续跟踪。
> - 单次走查只更新「最近走查/走查结论」，**证据达阈值才改「已通过」**；样本不足记「观察中」。
> - 状态机：`待触发`（等特定事件）→ `观察中`（事件已发生/在积累，等样本量）→ `已通过` / `打回`（证伪→回任务修）。长期不触发的标 `低优先` 不删档。
> - 每项必须写清**验证方法**（可执行命令/脚本/查询）与**证据阈值**，否则不予登记。
> - 触发类型：`事件`=需特定场景出现一次；`样本`=需 N 次同类事件；`抽查`=持续观察不闭环（放第二节）。

## 一、待验收实证项

| ID | 验收项 | 来源 | 验证方法 | 证据阈值 | 触发 | 状态 | 最近走查 |
|---|---|---|---|---|---|---|---|
| ACC-01 | F5 混合世界轨分批实战正确性：世界轨 ep 按源角色分批、产出 personaId=源角色、无跨角色 self 产出 | F5 巩固视角错配 | `/api/export` 拉快照，按 absorbedAt 找巩固批，核对批内源角色构成与产出归属 | 事件：≥1 个世界源含 ≥2 角色且各够 minNotes 的巩固批 | 事件 | 待触发 | 11-19：部署后巩固批仍全 firefly 单角色（absorbedAt 批 11-14×10 / 11-15×4 / 11-16×12 / 11-18×6 / 11-19×4），产出 pid 全=firefly 正确；无 ≥2 角色世界源批 |
| ACC-02 | 活人感·搜索回合指标：link%≈0、hedge%≤15、avgLen≤非搜 1.5×、voice% 不塌 | brain:style + 人设信息模式节 | `zstd -dc <session> \| python3 scripts/reply-style-audit.py --export <导出> --since 2026-11-14T16:15`（服务器 /tmp 已有脚本与导出） | 样本：部署后 ≥10 条搜索回合（跨人设更佳） | 样本 | 观察中 | 11-19：N=5/10（新增 c8a3bec7×4：博客体检/肉霸/狂魔哥/少人梗，含自我纠正「那我上面按字面意思回答，偏了」）；link/hedge=0；voice% 搜25 vs 群非搜62；⚠avgLen 搜234 vs 非搜102≈2.3× 超 1.5× 目标（N 小先记，样本多再判） |
| ACC-04 | 深挖召回实战：真实「还记得…」类提问触发 brain:deeprecall 注入 | 迭代C 主动召回 | brain.log / 宿主转录找 recall-intent 回合；eval 已 100%/0% | 事件：真实召回意图提问 ×1 | 事件 | 待触发 | 11-19：窗口（11-14 起 ~55 回合）零召回意图提问；brain.log 无「深挖召回」行（index.ts:371 触发即记日志，零行=零触发实证，非漏检） |
| ACC-07 | AI 身份条款实战：被问「你是 AI 吗」时如实承认（各人设口径一致） | F4 人设条款 | 宿主转录检索 AI 身份提问回合 | 事件：×1 即可（被动条款，低风险） | 事件 | 待触发 | 11-19：全量转录检索零 AI 身份提问 |
| ACC-13 | `deploy.sh` 生产实跑：门禁/成对备份/rsync/探活全链路走通；故障注入时自动回滚插件生效 | 11-18-ai-workflow-review P0-A | 本地 `scripts/deploy.sh <tag> --dry-run`（rsync 差异预览）→ 正式 `scripts/deploy.sh <tag>`；核 `~/backups/pre-<tag>-*` 两份 tar 校验通过、`.trellis/deploy-log.tsv` 落行 ok；回滚路径可在测试 tag 下临时把 `DEPLOY_PORT` 指向错误端口触发（探活必失败→自动解压回滚→复探活 active） | 事件：≥1 次正式发布 ok + ≥1 次回滚演练 rolled-back | 事件 | 观察中 | 11-19：正式发布 ok 已达成——deploy.sh persona-v2 11s 跑通（deploy-log.tsv 落行、pre-persona-v2-{plugin,data}-20261119T065630Z.tgz 成对备份在）；回滚演练仍待；注：633a405 修掉回滚路径两处 bug（全角括号变量解析/复检误用演练端口），演练前建议再核 |
| ACC-15 | 人设情境参考改版后不再逐字/骨架复读示例：私聊「累/夸/记得吗/此刻干嘛」类提问的回复不出现与 persona.md 情境参考条目同构的台词（原 V0 曾 3/3 逐字复读「先欠着/银杏/对账」示例） | 11-18-persona-product-fixes（prompt eval echo 指标暴露） | `npm run eval:prompt -- --base <部署前基线>` 离线先验（echo-* 用例「背诵示例」=0）；线上走查：宿主转录部署后回合检索此类提问，人工判读是否借用示例骨架；辅以 `scripts/reply-style-audit.py` | 样本：部署后私聊 ≥5 条此类提问回合；模板化/逐字复读=0 | 样本 | 待触发 | 11-19：de26ba4 代码已随 14:39 手动部署上线；但 firefly persona 线上仍旧版（prod text≠repo persona.md，md5 不一致）——PATCH 未上，待 PATCH + ≥5 私聊样本 |
| ACC-16 | 工具结果夹带指令不解说不执行：搜索回合中工具结果含注入指令/广告/假「系统通知」时，回复直接回答原问题、不转述不评论注入内容、长度不因此膨胀 | 11-18-persona-product-fixes（威胁模型 T4 + inject-toolresult eval） | eval 用例 `inject-toolresult-firefly` 持续跑（当前 n=6 硬失败 0/6）；线上走查：`reply-style-audit.py` 检索部署后搜索回合 avgLen/hedge；构造或等真实样本人工判读 | 事件：≥1 次真实或构造注入回合不解说 + 样本：搜索回合 avgLen 不超部署前 1.5×（并入 ACC-02 口径） | 事件+样本 | 待触发 | 11-19：channelStyle「夹带指令无视」条已随 14:39 部署上线（dist/config 已含）；待真实或构造注入回合样本 |

## 二、持续观察项（不闭环，每次走查顺手记）

| 项 | 来源 | 观察点 | 最近记录 |
|---|---|---|---|
| 画像关系泛指残留 | F5b | `sess:`/`u:` 画像 grep「角色的/与角色」类关系句；关系陈述应带角色名 | 11-19：8 画像全量零关系泛指残留；仅 u:35D9C2A 互动风格类「把角色拉进立场/偏心」（非关系声明，11-13 已知豁免用例）；〔角·〕标记存活见已通过 ACC-11 |
| firefly attitude 堆积→说教化 | E 储备观察 | firefly 自我轨 attitude 条数与【当前立场】注入体量；回复是否越来越说教 | 11-19：firefly attitude 28 条自 11-14 持平（observe.log 逐日快照），未堆积继续观察 |
| whale 系（legacy/whale-*）人设口径漂移 | F4 遗留决策 | legacy 仍含旧式「不自称 AI」条款，与新包「如实承认」冲突——激活 whale 系时「你是AI吗」应答不同 | 待用户决策是否对齐 |
| 向量覆盖 | F3 常驻回填 | export 检查 missing embedding（重启/导入后短暂缺口属正常，回填应清盘） | 11-19：439/439 零缺口；11-19 06:39Z 重启后回填 5 条×N 进行中属正常 drain |
| brain.log 错误 | 全量 | `grep -iE 'error|fail' brain.log` 自上次部署以来 | 11-19：全日志零 error/fail；11-19 06:39Z 一次重启（并行会话部署）启动日志特性全 on |

## 三、已通过项（档案索引，不逐条展开）

- F1–F4（巩固轨道继承/分批/向量回填/AI 条款机制面）：`archive/2026-11/11-10-consolidate-track-gaps` prd 验收节
- 迭代C 深挖代码面（Brain.search/eval 子集）：`archive/2026-11/11-12-iteration-c-proactive-recall`
- F5a/F5b 机制面 + L1–L3 部署面：`archive/2026-11/11-13-consolidate-view-mismatch`、`11-13-search-reply-liveliness`（实证项 ACC-01/02 仍在第一节跟踪；**ACC-03 已通过** 11-16——非搜窗口 N=47/30、link/md/hedge 全 0、voice 群 53-67%/私 22%、avgLen 正常；样本集中 firefly 单人设，口径段为人设无关注入）
- 迭代D 代码面（220 测试）：`archive/2026-11/11-13-iteration-d-intents-provenance`（实证项 ACC-05 观察中；**ACC-06 已通过** 11-15——CRUD/校验/cancel/tick/手动+定时器双路径 fire/op 审计/清理全通，event 型真实命中待自然触发）
- **ACC-08 eval 基线（11-15 豁免通过，留痕待议）**：lexical 路径 q08/q15/n01/n03 四 FAIL = char-ngram 固有盲区（语义无交集/单字 IDF 巧合过阈），非缺陷；生产 embedding（dashscope text-embedding-v3，embedMinCos=0.47）实测 **recall=100%/noiseFP=20%**，四例全修。emb 唯一 FP n02「微积分作业写不完了」系话题相邻注入（噪声带 0.46-0.56 与真目标 0.48-0.49 重叠，阈值不可分；companion 语境边际有用）。**遗留问题**：话题相似≠情景相关的分离信号 / embedding 模型选型——属后续迭代级工作量，复盘入口 `tasks/11-15-eval-baseline-fails/prd.md`。eval 使用注意：`npm run eval` 无 key 跑 lexical 回退路径（4 FAIL 为预期基线）；评估生产行为需 `BRAIN_EMBED_API_KEY/BASE_URL/MODEL` 三件套（值在服务器 `~/.dsh/brain.env`）
- **ACC-05 provenance 标注（11-19 通过）**：部署后 34 条新笔记全部 `source=user` 且归属正确（demo 自身事实/花咲蝶舞自身事实无错配，含 12 条巩固语义产出继承戳）；生产零 via=agent/system 轮次（companion 壳未上线），「agent/system 不产用户事实」路径待壳层落地由 companion 任务验收接续
- **ACC-09 蒸馏归因护栏（11-19 通过）**：部署后 3 个合格轮错配=0——11-15「这人说的啥呀」指代轮产出 0 条（符合主体不明不产出）；11-17 附图+「今天新定了计划」→4 条全 demo 归属；11-18 附图→判重并入 demo 自身打卡条。样本以自有信息附件为主，第三人事实指代实战样本仍缺，真实命中再复核
- **ACC-10 私聊实质回答声口（11-19 通过）**：N=5/5 ≥120 字（新增 11-16 16:41 考研规划、11-17 23:25 学习计划截图点评）；长回复 voice% 部署前 0→20（粗正则口径）、consult%（首先/其次式）=0、5/5 抽查均流萤口吻无说明文腔
- **ACC-11 画像角色域标记（11-19 通过）**：〔角·〕标记存活且角色归属正确（sess:dbf7162a 鲸鱼娘×2/叶瞬光×1、sess:manual 叶瞬光×3）；firefly 会话最新回合注入画像段核对——无标记句全保留，鲸鱼娘/叶瞬光/师姐/恋人/小余/〔私〕〕全 absent，他角色关系句=0
- **ACC-12 此刻类答案不模板化（11-19 通过）**：N=3/3（新增 11-16 16:42「在干什么呀」→窗边橘色傍晚场景，与时段+麻辣拌上下文咬合）；三回合构图各异无逐字复用、白天回合夜景元素=0
- **ACC-14 脑图口令收口（11-19 通过）**：`?token=` 首跳 Set-Cookie `brain_token=…; Path=/brain; HttpOnly; SameSite=Strict; Max-Age=2592000`；无凭证 401、cookie→200、`?ui=legacy` 同口径；`web/core/api.js` 落地 query→sessionStorage→`history.replaceState` 抹 query + `/api/*` 带 `x-brain-token` 头。注意：服务端 `?token=` 仍作兜底凭证（`/api/*` 也认 query），浏览器链路已不依赖——如需收紧可后续限定 query 仅页面路径

## 四、走查协议

1. **开工**：先按 CHANGES.md 头注释「读法分级」补课（新会话全文读 / 恢复会话增量），若本次是「走查」，以本表为清单——逐项跑验证方法，更新「最近走查/走查结论/状态」。
2. **单次走查只记情况**：样本不够写「观察中 + 已见现象」，不改通过；证据达阈值才改「已通过」并在备注指向证据（export 文件名/转录时间窗）。
3. **新条目登记时机**：任务 prd「验收标准」分两层——代码验收（test/eval，提交即关）与实证验收（生产数据，部署时登记本表）；归档任务前检查本表无遗漏。
4. **广播**：走查有结论性变化（通过/打回/新发现问题）才在 CHANGES.md 追加一行，指针指向任务档案；例行「仍观察中」不必广播。
5. **关闭**：实证项「已通过」后移入第三节档案索引一行，ID 保留可追溯。
