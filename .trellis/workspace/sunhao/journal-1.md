# Journal - sunhao (Part 1)

> AI development session journal
> Started: 2026-10-29

---



## Session 1: 态度记忆层（kind=attitude）
<!-- trellis-session: v=2 fp=7b07d0f116806cee -->

**Date**: 2026-10-30
**Task**: 态度记忆层（kind=attitude）
**Branch**: `main`

### Summary

问题：人格内核静态无自我更新→回复死板。评估 A(态度笔记)/B(自我文档)/C(内核漂移) 后落地 A：蒸馏产出「对<对象>：<立场>」attitude 记忆，双通道唤起（topK 检索 + 发言人昵称保底≤3），注入【当前立场】order 83。拆出 commit 027eb6c(发言人+情绪WIP) 与 b074657(态度层)。page.html 的 attitude UI 支持未提交，留给 brain-ui-polish 任务。

### Git Commits

| Hash | Message |
|------|---------|
| `b074657` | P3: 态度记忆层——人格内核不变，立场可被对话塑造 |

### Status

[OK] **Completed**


## Session 2: 会话画像排查 → 画像按人建模（u:openid）
<!-- trellis-session: v=2 fp=4fdf324e379c4a08 -->

**Date**: 2026-10-30
**Task**: 会话画像排查 → 画像按人建模（u:openid）
**Branch**: `main`

### Summary

问题：画像页只见 3 条、疑被截断。排查：页面无截断、持久化链路健康（写盘/compact 往返/重启恢复均验证过），根因是数据没进 ~/brain-data——qqbot-test 链接了已删除的插件副本、dataDir 相对路径按 cwd 解析、多实例共享文件时 compact 会互冲。顺带发现画像按 sessionId 存导致人的维度分裂。设计：dsh sessionKey=qqbot:{appId}:{scope}:{peerId}，sessionId 确定性派生（私聊=用户 openid，群聊=群 openid），发言人 tag 仅群聊带 openid → 画像改 u:<openid> 主键+sess: 兜底，ProfileEntry{text,name,sessions,updatedAt}，蒸馏输出结构化 profiles[]，注入按发言人 openid，attitude 唤起扩到跨会话，页面 PERSON 卡+/api/profiles。验证：40/40 测试+typecheck+build+真实数据迁移无损。后续：多实例文件锁、dataDir 启动日志、私聊 openid 归并、画像编辑入口。待办：重启 dsh 生效；旧 3 张画像保留为 sess: 卡。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 3: 上云部署就绪评估
<!-- trellis-session: v=2 fp=ee44fb55e695eb97 -->

**Date**: 2026-10-30
**Task**: 上云部署就绪评估
**Branch**: `main`

### Summary

问题：能否上云第一轮使用。排查：核对 M0-M4 里程碑、实跑 typecheck+40/40 测试+build 全绿、审查 http 路由/鉴权与 patch 默认配置、复查 journal 遗留坑。结论：可上云，先收端口——默认 0.0.0.0+空 token 会暴露脑图及全部写 API，改 127.0.0.1+SSH 隧道或安全组限 IP；token 与页面不兼容不可依赖。前置：dsh 宿主+qqbot profile+Node≥20+绝对路径 BRAIN_DATA_DIR+单实例独占数据目录。迁移：拷 ~/brain-data 或 export/import API。后续：页面 token 感知、文件锁、systemd 绝对路径。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 4: 第一轮上云准备实施
<!-- trellis-session: v=2 fp=8a5a353385dd3364 -->

**Date**: 2026-10-30
**Task**: 第一轮上云准备实施
**Branch**: `main`

### Summary

需求：列出第一轮上云待办并评估设计。产出 P0-P3 清单（task first-round-deploy-prep）：P0=端口收敛+dataDir 日志+runbook，P1=页面 token 感知+迁移+备份+unit。用户决策：SSH 隧道为主，P0+P1 全做。实施：patch/config host→127.0.0.1；page.html fapi 包装 17 处 fetch 透传 token（sessionStorage 续命）；启动日志加数据目录绝对路径；README runbook 含 unit/迁移/验证/备份/回滚。验证：typecheck+41/41 测试+build 全绿。后续：服务器侧部署执行后归档 task。

### Git Commits

| Hash | Message |
|------|---------|
| `13332d0` | feat: 第一轮上云准备——脑图默认绑本机 + 页面 token 感知 + 部署 runbook |

### Status

[OK] **Completed**


## Session 5: 上云部署执行
<!-- trellis-session: v=2 fp=a913dbadb0be2f15 -->

**Date**: 2026-10-30
**Task**: 上云部署执行
**Branch**: `main`

### Summary

部署到 ubuntu@124.222.65.169（已有 dsh qqbot 服务）。rsync dist+patch+package.json→~/dsh-qqbot-brain，dsh plugin add 以 link 依赖装入 profile；~/brain-data 整目录迁移（12 notes/5 profiles/persona）；从 .credentials.yaml 提取 DEEPSEEK_API_KEY→~/.dsh/brain.env（600），drop-in EnvironmentFile 注入；脑图 127.0.0.1:4099 SSH 隧道端到端验证；ubuntu cron 每日备份。坑：ctx.logger 不进 qqbot.log，观测靠 API；dsh 命令需 PATH=/opt/node-v24/bin。待办：首轮对话验证蒸馏产出。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 6: 插件文件日志
<!-- trellis-session: v=2 fp=30ac367c3fc22a9a -->

**Date**: 2026-10-30
**Task**: 插件文件日志
**Branch**: `main`

### Summary

问题：服务器上 ctx.logger 不进 qqbot.log，插件运行状态不可观测。方案：makeFileLogger 写 dataDir/brain.log（ISO 时间戳、1MB 轮转 .old、失败静默）；Brain.log 常开拿蒸馏摘要；蒸馏失败去 debug 门控。验证：44/44 测试+部署后 brain.log 输出蒸馏 on+数据目录。观测入口定为 brain.log，README 同步。

### Git Commits

| Hash | Message |
|------|---------|
| `7959cb3` | feat: 插件文件日志 <dataDir>/brain.log——ctx.logger 不落盘环境的观测兜底 |

### Status

[OK] **Completed**


## Session 7: 脑图检索算法优化（lexical 修复）
<!-- trellis-session: v=2 fp=66ea1458c68a0def -->

**Date**: 2026-10-31
**Task**: 脑图检索算法优化（lexical 修复）
**Branch**: `main`

### Summary

用户反馈脑图检索模拟检不到有效信息。排查：topK 无门槛致新鲜记忆靠 R+imp 凑数、n-gram 不去标点切断 bigram（橘猫，名叫年糕 对 猫叫什么 cos=0）、单字查询空向量、复述匹配弱；另发现 cfg.retrieval 漏接 Brain。方案：归一化+n=[1,2,3]+minCosine=0.04（19 条数据离线校准：噪声≤0.034、最弱相关 0.042+），接通配置，两 mockup 同步。验证：47/47 测试+tsc+build 过，3 条新检索测试。后续：分词/embedding 留待评估，BM25 暂缓。

### Git Commits

| Hash | Message |
|------|---------|
| `a337230` | feat: 检索相关性修复——归一化 n-gram + minCosine 门槛，接通 retrieval 配置 |

### Status

[OK] **Completed**


## Session 8: 跨 harness 可移植性评估
<!-- trellis-session: v=2 fp=a8f6dbddcfd798fe -->

**Date**: 2026-10-31
**Task**: 跨 harness 可移植性评估
**Branch**: `main`

### Summary

用户问 qqbot 改接 workbuddy/其他 agent/harness 提供方时插件是否可用 → 逐文件审查 index/capture/inject/server/persona-loader/distill，把耦合面拆三层：插件壳层绑定 Cordis 协议（system-prompt/assemble waterfall、session/event 事件流、cordis.patch.yml 安装）不可移植；QQ 适配约定（[昵称 (openid)] 标签、Chat history/Current message 锚点）绑定官方 dsh-qqbot、换适配器时优雅降级；src/brain/ 内核宿主无关、蒸馏走 OpenAI 兼容 env 可配 → 结论：Cordis 系宿主直接可用，有 hook 的 JS harness 需重写约 300 行 glue，无插件机制者走 sidecar（补 /api/ingest+/api/assemble），无扩展点者不可用；验证基于源码审查，未实测其他宿主；后续方向：sidecar 端点、发言人格式可配置、蒸馏 provider 抽象

### Git Commits

| Hash | Message |
|------|---------|
| `7dc559e` | chore(task): archive 10-31-harness-portability |

### Status

[OK] **Completed**


## Session 9: WorkBuddy 接入可行性调研
<!-- trellis-session: v=2 fp=a5c48fbbe979d585 -->

**Date**: 2026-10-31
**Task**: WorkBuddy 接入可行性调研
**Branch**: `main`

### Summary

用户给出 workbuddy QQ 接入文档要求评估 → 查 QQ-Guide/连接器/记忆文档确认：WorkBuddy 为腾讯 CodeBuddy 闭源桌面 agent，QQ 集成是 App 内置功能（AppID/AppSecret 直连 QQ 平台 WS/URL 回调），定位远程任务派发（群聊@触发），无 prompt hook/事件流/插件 API；可用扩展点仅自定义连接器（文档明确 MCP+CLI 标准化协议）与 Skills 指令包；其自带记忆功能与 brain 重叠但无分人归因/情绪/人格/衰减 → 落档第 3 档：Cordis 插件不可跑，brain 可 MCP 化 sidecar 经连接器接入+Skill 约定驱动，代价为记忆退化为按需调用；建议若要多 harness 复用优先做 src/mcp 入口（recall/ingest/assemble）+发言人格式参数化，但 WorkBuddy 场景撑不起群聊陪伴 bot 定位；调研结论已补进 archive/2026-10/10-31-harness-portability/prd.md Addendum

### Git Commits

| Hash | Message |
|------|---------|
| `1bc466c` | chore(task): harness-portability 补充 WorkBuddy 调研结论 |

### Status

[OK] **Completed**


## Session 10: 检索修复部署上云 + runbook 尾斜杠修正
<!-- trellis-session: v=2 fp=2b9387645a9870c1 -->

**Date**: 2026-10-31
**Task**: 检索修复部署上云 + runbook 尾斜杠修正
**Branch**: `main`

### Summary

把检索修复构建产物部署到 ubuntu@124.222.65.169:~/dsh-qqbot-brain/ 并重启 dsh-qqbot 生效（验证：minCosine 在 dist、/api/state 23 notes/5 sessions、brain.log 正常启动）。过程中发现 runbook rsync 'dist/'（带尾斜杠）会把编译产物撒到插件根目录而非 dist/——首部署已留过同样残渣，本次清理根目录散落文件、按正确路径重传、README 加注释修正。数据与 persona 不受影响（服务重启前已在跑、数据目录独立）。

### Git Commits

| Hash | Message |
|------|---------|
| `d1c22e5` | docs: 修正部署 runbook 的 rsync 尾斜杠——dist/ 会把产物撒到插件根目录 |

### Status

[OK] **Completed**


## Session 11: 类脑架构学习路线探讨
<!-- trellis-session: v=2 fp=7a7cd84d91b8b3af -->

**Date**: 2026-10-31
**Task**: 类脑架构学习路线探讨
**Branch**: `main`

### Summary

用户问提升类脑架构需学什么→定位项目为LLM之上的认知架构而非神经网络，transformer为选修→梳理已有设计与正式理论对应（检索公式=Generative Agents、strength=ACT-R简化、巩固=系统巩固理论、PAD=Mehrabian）→给出六阶段路线：记忆科学→Agent记忆论文→检索工程→情感计算→评测→NN选修，及评测先行→embedding混合检索→reflection→记忆关联→干扰式遗忘→prospective memory→OCC的迭代顺序

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 12: 记忆/上下文/人格现状调研 + 记忆质量修复实施
<!-- trellis-session: v=2 fp=ce1d41aa46f13f22 -->

**Date**: 2026-10-31
**Task**: 记忆/上下文/人格现状调研 + 记忆质量修复实施
**Branch**: `main`

### Summary

调研发现：蒸馏写的是拌嘴流水而非事实、检索被 R 热度主导+保底唤起刷 hits 锁死、记忆不跨会话且同人多 openid 画像割裂、注入带宽仅~10行。实施修复：蒸馏 prompt v2（四类白名单+流水黑名单+importance锚点）、检索评分改相关性门控 rel·(1+β·R)+reinforceMinCos、发言人保底不 reinforce、跨会话召回 attitude/semantic、同名 u: 画像读侧归并、会话滚动摘要【会话脉络】order 81 注入、OpenAI 兼容 embedding 接入（无 key 回退 lexical）+启动回填、评测集（44条真实记忆+22用例，lexical 基线 recall 88.2%/噪声FP 40%）。typecheck/test(59)/build 全绿。待办：服务器更新 dist 重启、提供 BRAIN_EMBED_API_KEY 后跑 eval 对比。

### Git Commits

| Hash | Message |
|------|---------|
| `1ce36bc78b77216aace1a80d21da33a30f14ff73` | feat(brain): 记忆质量修复——蒸馏提质、检索纠偏、身份层、滚动摘要、embedding |

### Status

[OK] **Completed**


## Session 13: 百炼 embedding 接入校准 + 线上部署验证
<!-- trellis-session: v=2 fp=ecd721c9ef207009 -->

**Date**: 2026-10-31
**Task**: 百炼 embedding 接入校准 + 线上部署验证
**Branch**: `main`

### Summary

用户提供百炼 key 接入 embedding。接入发现两个坑：①百炼批上限10条/请求致整批静默失败，改自动分块；②其 v3 余弦分布压缩（相关0.48~0.84/噪声底0.33~0.56），embedMinCos 校准 0.47，并新增 reinforceMinEmbedCos=0.5 与 lexical 分源判强化，防噪声命中刷 hits 换皮回归。评测：lexical recall88.2%/FP40% → embedding混合 recall100%/FP20%（n02微积分蹭满课记忆为语义相邻边界）。已部署线上：rsync dist+重启，brain.env 写 BRAIN_EMBED_*（chmod600），启动行确认脉络on/向量on，回填tick正常。两任务（调研评估+质量修复）已按两层流程归档。

### Git Commits

| Hash | Message |
|------|---------|
| `b145a3f` | fix(brain): 百炼 embedding 校准——分块请求、阈值校准、强化阈值分源 |

### Status

[OK] **Completed**


## Session 14: 画像文本上限（500字硬截断）
<!-- trellis-session: v=2 fp=2b967144fbacd685 -->

**Date**: 2026-10-31
**Task**: 画像文本上限（500字硬截断）
**Branch**: `main`

### Summary

问题：单条画像无硬上限，修订式重写鼓励 LLM 保留全部旧要点→单调膨胀，唯一约束是蒸馏 max_tokens=700 会挤占 memories 产出。解决：apply() 统一 PROFILE_TEXT_CAP=500 截断（写入/重放/导入全覆盖）+ prompt 补「每条 300 字、求精不求长」。验证：61/61 测试+typecheck+build，远端已部署。

### Git Commits

| Hash | Message |
|------|---------|
| `36a3586` | fix(brain): 画像文本上限 500 字——防修订式重写单调膨胀 |

### Status

[OK] **Completed**


## Session 15: 画像内容边界——时效信息归记忆
<!-- trellis-session: v=2 fp=9d8aa6eaab04921f -->

**Date**: 2026-10-31
**Task**: 画像内容边界——时效信息归记忆
**Branch**: `main`

### Summary

问题：画像被「最近课表」等时效内容污染，根因是蒸馏 prompt 只规定格式没定义「什么配进画像」。解决：主蒸馏与巩固 prompt 补边界——画像只写性格/身份/关系/稳定偏好，时效信息（课表、当下事务、一次性安排）进 memories。验证：62/62 测试+typecheck+build，远端已部署生效；存量画像不做迁移，随修订自然代谢。

### Git Commits

| Hash | Message |
|------|---------|
| `1e85bdf` | fix(brain): 画像内容边界——时效信息进记忆，画像只留长期判断 |

### Status

[OK] **Completed**


## Session 16: 画像长期边界写前复核
<!-- trellis-session: v=2 fp=c67f01085a17db4c -->

**Date**: 2026-10-31
**Task**: 画像长期边界写前复核
**Branch**: `main`

### Summary

2026-10-31：此前仅靠蒸馏 prompt 限制画像内容，旧画像仍随每轮重喂，时效事实如最近课表反复被继承。修复：轮末与语义巩固的画像草稿进入独立模型审核，逐条对比旧画像/草稿，只保留稳定信息，旧画像首次涉及也审核；返回空可删除时效污染画像，审核失败维持原画像。67/67 测试、typecheck、build 通过。未部署云服务器、未触碰线上数据；二次调用有成本，需监控并抽样评测画像纯度。

### Git Commits

| Hash | Message |
|------|---------|
| `98430ae` | fix(brain): review profile updates before persisting long-term traits |

### Status

[OK] **Completed**


## Session 17: 脑图人设切换与鲸鱼娘温柔版
<!-- trellis-session: v=2 fp=a6b4bd4a8c836d09 -->

**Date**: 2026-11-01
**Task**: 脑图人设切换与鲸鱼娘温柔版
**Branch**: `main`

### Summary

问题：脑图原先只能覆盖单份人设，无法在现有版本与温柔版间切换。排查：定位 store/persona.md 启动优先级、HTTP API、页面定时刷新与备份链路。方案：新增多版本持久化和活动指针、内置温柔版、脑图新增编辑切换与全量备份，保留旧单份数据与文件镜像；用户确认多版本交互。验证：72/72 测试、类型检查、构建和 npm 包预置文件检查通过，未触碰用户原有暂存文件。后续：云端部署和在线验证按用户新要求继续。

### Git Commits

| Hash | Message |
|------|---------|
| `36ca91c` | feat(brain): preserve personas across switches and restarts |
| `55a5322` | chore: archive persona switching decision and verification |

### Status

[OK] **Completed**


## Session 18: 人设切换体验优化与云端再部署
<!-- trellis-session: v=2 fp=a48d691349b2a6e7 -->

**Date**: 2026-11-01
**Task**: 人设切换体验优化与云端再部署
**Branch**: `main`

### Summary

问题：用户视角走查人设切换发现六项缺陷——旧 POST /api/persona 会把缺 text 的 JSON 原文当人设写入；/api/personas 单接口失败拖垮整页刷新；切换无确认一点即改全局人格；人设只能增不能删；.md 人设文件只能复制粘贴导入；字数提示丢失。方案：收紧旧接口 JSON 校验为 400；personas 接口改容错加载；切换加带目标名的确认框；新增 persona-delete op + DELETE /api/personas?id=（当前人设拒绝删除）；页面加从文件导入/另存副本/删除按钮并恢复字数显示。验证：73/73 测试 + typecheck + build 全绿；随后备份远端插件与数据、rsync 上传 dist+package.json、重启 dsh-qqbot 验证 /api/personas 与新控件就位，cordis.patch.yml 未变；发现线上活动人设已被用户自行切换为 whale-gentle，persona.md 同步一致。后续：部署已确认线上最新，真实 QQ 对话回归可另行观察。

### Git Commits

| Hash | Message |
|------|---------|
| `e2396cd` | feat(brain): harden persona editor UX and deletion |
| `5eef267` | chore: record persona cloud rollout |

### Status

[OK] **Completed**


## Session 19: 类脑架构注入/蒸馏链路确认
<!-- trellis-session: v=2 fp=8337961c427bbc76 -->

**Date**: 2026-11-01
**Task**: 类脑架构注入/蒸馏链路确认
**Branch**: `main`

### Summary

问题：用户确认类脑架构是否为人格内核+记忆/情绪/画像注入、回复后蒸馏写记忆。排查：核对 src/inject/prompt.ts、src/capture/events.ts、src/brain/index.ts、src/brain/distill.ts。结论：方向正确，但注入实为最多 6 块 section（persona/digest/emotion/attitude/memory/speaker），画像挂在 memory 摘录头部而非独立块；轮末一次蒸馏同产记忆+情绪增量+画像草稿，画像另过 reviewProfiles 审核落盘；另有语义巩固定时器与 embedding 回填。无代码变更，建 11-01-brain-arch-confirm 留痕并归档。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 20: 人格/记忆架构图说明
<!-- trellis-session: v=2 fp=f5a17cec0d48391b -->

**Date**: 2026-11-01
**Task**: 人格/记忆架构图说明
**Branch**: `main`

### Summary

需求：把当前人格与记忆架构画图说明。做法：核对 brain/types.ts 与 store.ts 数据结构后输出两张 ASCII 图——存储层（BrainStore：personas 多版本、notes 三 kind、profiles u:/sess:、emotions PAD、digests；落 persona.md/jsonl/snapshot）+ 运行时链路（assemble 6 section 读路径；endOfTurn 蒸馏写路径含画像二次审核；后台巩固与回填）。易错点：人格只读 attitude 是慢变量、画像挂 memory 内、每轮末最多 3 次 LLM。无代码变更，建 11-01-brain-arch-diagram 归档（commit 7323dd4）。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 21: 脑图中attitude的表现形式确认
<!-- trellis-session: v=2 fp=0d5dfecfcd4d2e9a -->

**Date**: 2026-11-01
**Task**: 脑图中attitude的表现形式确认
**Branch**: `main`

### Summary

问题：attitude 在 /brain 脑图页具体如何呈现。结论：非独立板块，是记忆第三种 kind 复用展示管线——脑图有专属「态度立场/STANCES」脑区（态字节点、随保持率变暗）、详情面板提示「人格不变立场会被塑造」且可改 kind、记忆库有紫色态度 badge/筛选/手写入口、检索模拟命中同样列出；人格内核 tab 与画像 tab 均不含，事件流水走通用 op。无代码变更，建 11-01-attitude-in-brainmap 归档。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 22: 脑图概念图重设计三版（①鲸脑皮层 ②心智咖啡馆 ③海马回廊）
<!-- trellis-session: v=2 fp=5ccc694b9712144e -->

**Date**: 2026-11-01
**Task**: 脑图概念图重设计三版（①鲸脑皮层 ②心智咖啡馆 ③海马回廊）
**Branch**: `main`

### Summary

问题：前几轮脑图 UI（A/B/C 概念及基于 B 的产品页实现）用户不满意——杂乱拥挤、节点乱漂、缺乏类脑结构、情绪人格未进入关联网络。排查：上几轮都在旧骨架上换皮，没有从'类脑+跨层关联+大肥鱼风格'出发设计。方案：重做三版独立概念——①大脑侧剖面按脑区分层、信号脉冲沿关联流动；②大肥鱼头像为人格内核的三层环；③时间轴+情绪潮汐+巩固弧线；节点固定、跨层连线选中才显示。验证：headless Chrome 截图自查默认/选中态并修正布局问题，三版存档于仓库根 mockup-mind-*。后续：用户选定①为重构基准，新建 brain-ui-cortex 任务制定实施计划；②③留作个性化皮肤。

### Git Commits

| Hash | Message |
|------|---------|
| `aaa9c41` | docs(mockup): save three brain mind-map concepts (cortex / cafe / tide) |
| `fda6e82` | docs(mockup): add persona reference images used by mind concepts |

### Status

[OK] **Completed**


## Session 23: 脑图重构：鲸脑皮层（概念①）落地
<!-- trellis-session: v=2 fp=41dd51db273fe8e2 -->

**Date**: 2026-11-01
**Task**: 脑图重构：鲸脑皮层（概念①）落地
**Branch**: `main`

### Summary

问题：/brain 脑图被反复反馈杂而乱、不像类脑、无美感。方案：按概念①（鲸脑皮层侧剖面）整页重构——脑区分层固定槽位（前额叶=人格、杏仁核=情绪、新皮层=语义、顶叶=态度、海马体=情景）；情绪/人格关联纯前端推断（同会话±10min情绪op→5桶；##小节→bigram匹配）并明示非因果；交互含选中聚焦+两跳脉冲+分组关联检查器；动效为粒子+节点微漂+信号脉冲（统一开关、reduced-motion默认关）；节点改淡晕细胞球并按方案A缩35%；立绘换用户供图（裁字+压色）；修复立绘拉伸/图表过宽/搜索遮挡/溢出标签压图例。验证：82/82测试、typecheck、build、dist同步；jsdom冒烟33+空库5全过；5种宽度截图走查无溢出无报错。归档：archive/2026-11/11-01-brain-ui-cortex。后续：真实数据下若情绪/人格边稀疏另开后端任务；概念②③留作皮肤。

### Git Commits

| Hash | Message |
|------|---------|
| `d08288c` | feat(brain): rebuild /brain as whale-cortex side-section map |

### Status

[OK] **Completed**


## Session 24: 脑图关联后端化：语义/特质/派生边 + 情绪快照 + 写入判重
<!-- trellis-session: v=2 fp=c1d30384e3f06501 -->

**Date**: 2026-11-02
**Task**: 脑图关联后端化：语义/特质/派生边 + 情绪快照 + 写入判重
**Branch**: `main`

### Summary

脑图关联原本全部前端推断（bigram 字面重合、ops 情绪流水被 compact 清空、人格字面稀疏）。先用线上 129 条记忆验证可行性：向量全覆盖、top3@0.65 剪枝出 288 条真关联边、发现 91 对近重复漏网、情绪 op 不过 compact（0/129 可匹配）。随后实施四项：1) graphEdges 语义边 top3@[0.65,0.9) + facet 边 @0.55（facet 向量按人设缓存）；2) 写入时 emotionStamp 钉情绪快照（distill/巩固/手动三处）；3) sourceIds 派生边（巩固时记录情景来源，全图唯一实录关系）；4) dedupeEmbedCos=0.9 写入判重（强化旧记忆而非新增）。前端 buildRelations 合并服务端边与本地理由、快照/服务端 facet 优先并全量回退。验证：89/89 测试、typecheck、build、smoke 33 项；生产数据副本实测 135 条→279 语义+60 特质边+nearDup 59；已部署线上（备份→rsync→restart→验证），检查器显示「语义相似 73%」、人格光谱关联计数从近全 0 变 21/9/13/0/13/38。后续：存量 59 对近重复清理另开任务；存量情绪回填不值（需 transcript 重放）。

### Git Commits

| Hash | Message |
|------|---------|
| `87cdff6` | feat(brain): serve real graph edges & stamp note emotion/sources |

### Status

[OK] **Completed**


## Session 25: 存量近重复记忆清理：merge op + 一次清扫
<!-- trellis-session: v=2 fp=329b42a9a17dd7ad -->

**Date**: 2026-11-02
**Task**: 存量近重复记忆清理：merge op + 一次清扫
**Branch**: `main`

### Summary

关联后端化上线后发现存量 59 对 cos≥0.9 近重复（写入判重只挡增量）。实现一次性清理：sweepNearDups 并查集聚类→mergeNotes 收编字段（强度 max+min×0.5、hits 求和、createdAt 取早、actor/emotion/sourceIds 补缺）→merge op 落流水可重放；入口 POST /api/dedup + 备份页按钮带 nearDup 计数。验证：90/90 测试、副本 dry-run 150→119 九簇三十一条明细抽查无损、线上实跑 nearDup 归零。坑：compact 物理遗忘按真实时间计龄，fake NOW 的测试数据会变老被清，无关记忆需强化保命。

### Git Commits

| Hash | Message |
|------|---------|
| `2792245` | feat(brain): sweep near-duplicate memories via merge op |

### Status

[OK] **Completed**


## Session 26: 根 README 重设计：项目叙事版
<!-- trellis-session: v=2 fp=9df0a212900c9191 -->

**Date**: 2026-11-02
**Task**: 根 README 重设计：项目叙事版
**Branch**: `main`

### Summary

问题：根 README 只是安装手册，看不出项目探讨什么、效果如何、到哪一步。做法：通读 .trellis/tasks 全部评估留痕+journal-1(25 session)+源码核对，重组为叙事 README——工程命题(只调API能否记得更久/人格不漂移)+理论映射表+痛点解法表+读写路径ASCII图+实测数据(eval 88.2%/40%→100%/20%、单测90/90、试运行44→150→119条、~280语义边、RSS≈194MiB)+诚实清单+阶段路线+浓缩快速开始；headless Chrome 截鲸脑皮层概念稿作头图(docs/brain-map.png)并标注概念稿。验证：检索公式按 retrieval.ts 修正为 α·rel·(1+β·R)+γ·imp/5、判重口径改为增量强化+存量合并、eval 用例数按 cases.json 核实。后续：试运行复盘后更新当前阶段；接 dsh-meme 或换 harness 时同步快速开始段。

### Git Commits

| Hash | Message |
|------|---------|
| `1b1b99c` | docs: 重设计根 README——认知架构叙事版 |

### Status

[OK] **Completed**


## Session 27: 情绪桶覆盖走查：mood 受控枚举修复
<!-- trellis-session: v=2 fp=e8c2857d47c13853 -->

**Date**: 2026-11-02
**Task**: 情绪桶覆盖走查：mood 受控枚举修复
**Branch**: `main`

### Summary

问题：线上情绪只有开心/平静两桶有记录，害羞兴奋等不触发。排查：双线取证——page.html emotionBucket 只用 v/a 压进固定 5 桶（害羞/兴奋无桶、负半区不可达），蒸馏判定又偏保守；线上 16 条 op label 全丰富但 14/16 被映射成平静。方案：蒸馏输出加受控 mood 枚举 + 刺激→情绪锚点 + 判定对象改为用户刺激；脑图扩 9 桶 mood 优先 v/a 兜底。验证：typecheck/92 tests/build 全过；服务器上真实 deepseek 回放 7 场景全部命中预期 mood（被撩→害羞、挑衅→炸毛、八卦→好奇等）。后续：待部署观察新 op 的桶分布，旧数据不回填。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 28: 脑图公网直连：弃 SSH 隧道
<!-- trellis-session: v=2 fp=7b45d294a7e73ff0 -->

**Date**: 2026-11-02
**Task**: 脑图公网直连：弃 SSH 隧道
**Branch**: `feat/webserver-shim`

### Summary

用户反馈云服务器脑图走 SSH 隧道太麻烦且本地占 4099 端口，要求公网直连浏览器直达。排查：服务器 bundle patch 定 host/token，系统防火墙全通、闸门在腾讯云安全组；page.html 已有 ?token→sessionStorage 透传机制。方案：patch 改 0.0.0.0+随机 token 并重启 dsh-qqbot，index.ts 新增 BRAIN_HTTP_HOST/BRAIN_HTTP_TOKEN env 覆盖并写入 brain.env（rsync 部署不回退、密钥不进 git），文档同步。验证：0.0.0.0:4099 监听、无 token 401/带 token 200/页面 200、typecheck+98/98 测试绿；公网 curl 超时=安全组未放，待控制台放行 TCP 4099。后续：安全组可限自家 IP；新 dist 部署后 patch 内联 token 可清空改由 env 单点管理。

### Git Commits

| Hash | Message |
|------|---------|
| `45580ea` | feat(server): BRAIN_HTTP_HOST/BRAIN_HTTP_TOKEN env overrides |

### Status

[OK] **Completed**


## Session 29: 脑图公网直连：安全组放行后验证闭环
<!-- trellis-session: v=2 fp=d283064fe524de06 -->

**Date**: 2026-11-02
**Task**: 脑图公网直连：安全组放行后验证闭环
**Branch**: `feat/webserver-shim`

### Summary

用户在腾讯云控制台放行 TCP 4099 后回报，本机复测公网：/brain?token 页面 200、无 token API 401，端到端闭环。向用户交付访问入口（带 token 的完整 URL，sessionStorage 免二次输入）与自助查/换口令路径（服务器 cordis.patch.yml 与 brain.env 两处同值，改后重启 dsh-qqbot）。口令属密钥不落 git，仅在归档 prd 记录存放位置与查询命令；任务验收三项全部打勾，brain-public-access 正式收官。

### Git Commits

| Hash | Message |
|------|---------|
| `3c4d2f8` | docs(trellis): close out brain-public-access verification + access notes |

### Status

[OK] **Completed**
