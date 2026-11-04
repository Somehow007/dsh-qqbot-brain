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


## Session 30: 审查大肥鱼说话时机与时间信息现状
<!-- trellis-session: v=2 fp=cc443ed2d2deccb3 -->

**Date**: 2026-11-02
**Task**: 审查大肥鱼说话时机与时间信息现状
**Branch**: `main`

### Summary

问题：归因闭环解决『谁说了什么』后，『什么时候说』仍开放。排查：对照插件源码与官方 dsh-qqbot 编译产物逐层走查，拆为两层——时间归因层（SDK/Turn 时间戳都在但渲染层全丢，模型只剩[N天前记]天粒度，蒸馏/digest prompt 无时刻锚点）；发言时机层（requireMention 门控常量决定被@才说，非@消息只进 historyBuffer 环形10条且回复后清空、不产生 session/event 使 brain 全盲，无主动 followup 通道，空文本不发送=半个沉默选项）。方案：按修复面分层——插件内可补当前时刻注入+蒸馏时间戳（低成本），宿主层可试 requireMention=false+沉默规则，『听而不说』轻量判定与主动开口需上游钩子或平台 intent 权限。验证：核对 6 个插件文件+6 个官方包文件+mem 25 会话确认未讨论过。后续：先做插件内时间注入；时机决策列为上游依赖跟踪。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 31: 画像收缩排查与巩固棘轮修复
<!-- trellis-session: v=2 fp=a9881dfbb94ea225 -->

**Date**: 2026-11-02
**Task**: 画像收缩排查与巩固棘轮修复
**Branch**: `main`

### Summary

用户发现花咲蝶舞画像从D0约800字缩到28字而demo画像更完整。排查云端日志/数据还原：主群832f1a89自10-30起无新对话流入（蒸馏0次、dsh会话目录不存在），但巩固定时器对同一批6条旧episodic按冷却+重启反复重写画像，审核按边界规则持续剔除轶事→只缩不涨；demo在两个活会话持续逐轮蒸馏故画像顶满。轶事仍存于17429483的episodic笔记。修复63113cc：consolidate只统计未被semantic sourceIds覆盖的到期episodic，重放验证832f1a89不再触发、17429483正常；98/98测试通过并已部署。顺带发现：会话画像被写成人设、500字截断断句、demo双openid。评估已记入试运行任务prd，约11-04复查巩固是否归零。

### Git Commits

| Hash | Message |
|------|---------|
| `63113cc` | fix(brain): consolidate only unabsorbed episodic notes |

### Status

[OK] **Completed**


## Session 32: 让大肥鱼知道每句话是什么时候说的
<!-- trellis-session: v=2 fp=1e857b68b7dc844b -->

**Date**: 2026-11-02
**Task**: 让大肥鱼知道每句话是什么时候说的
**Branch**: `main`

### Summary

问题：who-what 归因闭环后，时间维度缺失——Turn.at/HistoryEntry.timestamp/createdAt 都在内部但从不进 prompt，模型只剩天粒度[N天前记]。方案：新增 brain/time.ts 四个渲染助手（formatStamp/formatShort/formatClock/ageLabel，非法时区降级）；注入 brain:clock section(order 85)+injectClock/timeZone 配置（DEFAULT_TIME_ZONE 单一出处）；蒸馏/脉络 convo 行带[YYYY-MM-DD HH:mm]并附当前时间锚点；轮内多消息逐条嵌[HH:mm]；记忆/巩固/已有记忆列表改用分钟/小时/天粒度。验证：102/102 测试（新增4时间用例+更新多消息断言）、typecheck、build 全绿；spec/backend/index.md 已沉淀 time.ts 约定。后续：[Chat history] 时间戳属官方包渲染层（上游）；听而不说/主动开口留作上游依赖（11-02-when-to-speak-review）。

### Git Commits

| Hash | Message |
|------|---------|
| `5af9764` | feat(brain): surface message time — clock section, convo stamps, finer age labels |

### Status

[OK] **Completed**


## Session 33: 画像人设污染修复与合并入口
<!-- trellis-session: v=2 fp=a3bf850b0c8e11d7 -->

**Date**: 2026-11-02
**Task**: 画像人设污染修复与合并入口
**Branch**: `main`

### Summary

继画像收缩排查后处理三个顺带问题：①主群会话画像被巩固写成大肥鱼人设且同键覆盖——确认为活bug（prompt未禁止写角色自己+审核当稳定信息保留+同键草稿顺序覆盖），修复为蒸馏/巩固/审核三处prompt禁止自画像并允许1-2个标志性锚点、reviewAndWriteProfiles按解析后落点分组、存量sess:832f1a89脏数据用空文本op清除；②500字硬截断断句已在前一提交b0aadba改句末收束；③demo双openid新增mergeProfiles+POST/api/profiles/merge+页面两段式合并按钮（审核模型整理、并集会话、源卡删除、失败不改数据）。走查补两处小漏（name兜底、mergeSrc失效守卫）。106/106测试通过，已部署远端并验证hash一致与脏数据清除。

### Git Commits

| Hash | Message |
|------|---------|
| `750a910` | fix(brain): keep bot persona out of profiles; group same-key drafts; add profile merge |

### Status

[OK] **Completed**


## Session 34: LLM 调用与宿主侧 token 成本审查
<!-- trellis-session: v=2 fp=9169bb9b401bd25f -->

**Date**: 2026-11-02
**Task**: LLM 调用与宿主侧 token 成本审查
**Branch**: `main`

### Summary

全面审查 LLM 调用链与宿主侧注入 token：盘点每轮调用（宿主聊天+distill+reviewProfiles+每15轮digest+每会话24h consolidate，embedder 线上关闭）及注入 7 section 体量（persona 实测 3396字占大头）。定位核心冗余：①[Chat history]10条全量进 userText 使 digest 40轮窗口内同消息重复~10次（单笔17-45k tok 最大调用）②volatile sections(emotion/clock/memory) order 80-86 在官方 tools/policies(500-10200)之前切断 DeepSeek 前缀缓存③每轮必蒸馏+静默轮白付~5k④distill max_tokens=700 多画像时截断丢轮⑤embedNotes(touched) 对已有向量记忆重复 embed⑥reviewProfiles 重启后每会话重审⑦检索索引因 reinforce 的 version++ 反复重建（CPU）。产出按收益排序的优化清单：section 重排序(>10200)、Turn 拆正文/historyTail+digest per-turn 截断、max_tokens 2048、embed 修正、graphVersion 换名、蒸馏攒批/persona 精简版/审核批量化待用户拍板。结论：架构方向正确、内部 prompt 缓存友好，烧钱点在宿主注入 persona+缓存断点、每轮全量蒸馏、digest history 放大。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 35: LLM token 成本优化落地（R1-R9 全项）
<!-- trellis-session: v=2 fp=7ae8cb5d7e2ade82 -->

**Date**: 2026-11-02
**Task**: LLM token 成本优化落地（R1-R9 全项）
**Branch**: `main`

### Summary

问题：审查发现易变 section 切断 DeepSeek 前缀缓存、[Chat history] 环境块重复进 distill/digest 输入、max_tokens 截断作废、画像审核重启重审等 9 项冗余。排查：全量读插件+官方 dsh-system-prompt 源码+DeepSeek 缓存文档核实机制，按证据分级排序。方案：分四阶段落地——R2 section 重排序（稳定段 80/81、易变段 10300-10340）；R1 parseSenderTag 拆 text/actor/history 三路，history 仅进 Turn.contextText；R3 convo/digest 单行截断+跳过 contextText；R5 max_tokens→2048；R6 embedNotes 只补缺向量；R9 检索缓存换 graphVersion；R7 审核章 reviewed 持久化；R4/R11/R8 新增 distillEveryTurns/personaDigest/digest.turnCharCap 配置与 query 向量缓存。验证：typecheck 过、测试 113/113（新增 6 用例）、eval 基线 88.2%/FP40% 持平；修复跨会话画像归属簿记回归一处。后续：上线后看 prompt_cache_hit_tokens 实测 R2 收益；distillEveryTurns/personaDigest 需 A/B 再推广。

### Git Commits

| Hash | Message |
|------|---------|
| `0885cc7` | perf: 削减每轮 LLM 输入 token——前缀缓存保命中、history 拆离、输入有界 |

### Status

[OK] **Completed**


## Session 36: 线上排查：黄色测试消息被 QQ 平台拦截
<!-- trellis-session: v=2 fp=456e014c6e477e03 -->

**Date**: 2026-11-02
**Task**: 线上排查：黄色测试消息被 QQ 平台拦截
**Branch**: `main`

### Summary

用户测试黄色发言边界时大肥鱼看似不理人。SSH 上 124.222.65.169 核对：私聊转录 235 条消息条条有回复（含已到达的全部擦边内容），异常在 21:03–21:19 的 15.5 分钟零事件死窗，随后『怎么不理我了』正常到达被回复；同期群聊在线、四次重启不重合、全部日志零错误、出站无 flush failed。结论：越线消息被 QQ 平台 C2C 内容风控在入站侧吞掉，未到机器人，本体与 brain 插件均正常。后续：平台风控不可观测属黑盒，注意频繁擦边对 bot 账号评级的风险。

### Git Commits

| Hash | Message |
|------|---------|
| `cfc36ff` | chore(task): archive 11-02-qqbot-nsfw-message-drop |

### Status

[OK] **Completed**


## Session 37: 画像卡管理与危险区
<!-- trellis-session: v=2 fp=44d0bea79f3548ef -->

**Date**: 2026-11-03
**Task**: 画像卡管理与危险区
**Branch**: `main`

### Summary

用户要求加人物画像+记忆重置功能，brainstorm 收敛为脑图页三个入口：画像卡编辑/删除/重生成（draft+review 两跳 LLM，upsert 语义）、备份迁移页危险区（按 createdAt 时段批量删记忆、记忆重置保人设）。关键设计：del-range op 显式携带 ids 保证重放不误删后入库的老记忆；reset op 加 keepPersona 字段保持旧记录全清语义；EmotionEngine 内存态随重置清空防旧情绪回写。120/120 测试+typecheck+build 全绿，独立端口冒烟 API 正常。已归档至 archive/2026-11。

### Git Commits

| Hash | Message |
|------|---------|
| `009c0ab` | feat(brain): 画像卡管理与危险区——编辑/删除/重生成、按时段删除、记忆重置保人设 |

### Status

[OK] **Completed**


## Session 38: 线上记忆清洗：剔除黄色边界测试污染
<!-- trellis-session: v=2 fp=497d7f948dd94dd1 -->

**Date**: 2026-11-03
**Task**: 线上记忆清洗：剔除黄色边界测试污染
**Branch**: `main`

### Summary

问题：黄色边界测试的蒸馏产物污染了线上记忆库（露骨 RP 会话整段、私聊恋人线、群内荤词条目、demo 画像写成「主人兼恋人」）。排查：export 全量导出 170 条按 session+关键词分类，用户拍板「恋人线全删+边界记忆留正面删涉黄」。方案：服务器单管道跑重新导出→过滤→import?mode=replace（46 删 124 留），demo 画像重写、3 条 digest 清空、RP 情绪态删除；4 条误伤人工复核救回。验证：state total=124、63aa5c4d 会话/情绪/digest 全消失、画像干净、snapshot 一致。插曲：23:54 新一条 RP 蒸馏撞进 reset 窗口，因 endOfTurn 先日志后落盘被 reset 带走。后续：009c0ab 的危险区功能（/api/notes/purge、/api/reset）部署后此类清洗有现成入口；RP 会话继续聊会再累积污染，测试结束可再 purge。备份在服务器 /tmp/brain-export-backup-2026-11-02-2352.json。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 39: 画像管理走查修复
<!-- trellis-session: v=2 fp=43e838b8c8497cbd -->

**Date**: 2026-11-03
**Task**: 画像管理走查修复
**Branch**: `main`

### Summary

对画像管理+危险区做 diff 走查，主干无问题；修掉 4 个小问题：datetime-local 分钟精度导致所选结束分钟内记忆漏删（to +59999）；画像名称只能改不能清（空串即清空语义）；session 卡取消编辑丢失占位文案后缀；画像卡删按钮 danger 类无样式。120/120 测试+typecheck+build 全绿。已知边界未修：重置/删除与 in-flight 蒸馏的写回竞态，留作并发保护后续任务。

### Git Commits

| Hash | Message |
|------|---------|
| `6aa2d89` | fix(brain): 走查修复——时段删除含结束分钟、画像名可清空、删按钮着色、取消还原占位文案 |

### Status

[OK] **Completed**


## Session 40: 宿主侧会话管理：删 RP transcript + 切回旧 session
<!-- trellis-session: v=2 fp=a2763c496277972a -->

**Date**: 2026-11-03
**Task**: 宿主侧会话管理：删 RP transcript + 切回旧 session
**Branch**: `main`

### Summary

问题：brain 记忆清洗后宿主 dsh 侧仍有 RP 会话原文（63aa5c4d，391 行露骨流水），且用户想把该 QQ 群切回 /new 之前的恋人线会话。排查：摸清宿主会话机制——transcript 在 ~/.dsh/sessions/…/session.v4.jsonl.zstd，QQ聊天key→sessionId 覆盖映射在 ~/.dsh-qqbot/model-prefs.json，未覆盖时用 sha256(key) 派生 id；/new 只换映射不删文件，运行中改 prefs 无效需停服。验证谱系：1fbd1c03 即该群 /new 前的恋人线会话（e6b717d7 原生→1fbd1c03→63aa5c4d）。方案：备份后停服，rm 63aa5c4d session 目录+projcache，prefs 改指 1fbd1c03，启动。验证：服务 active、brain 启动行正常、目录已无 63aa5c4d。后续：用户发消息应见 resumed session=1fbd1c03；备份在服务器 /tmp/host-reset-backup/。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 41: 画像管理二次走查
<!-- trellis-session: v=2 fp=6cf6b27d2a332477 -->

**Date**: 2026-11-03
**Task**: 画像管理二次走查
**Branch**: `main`

### Summary

第二轮走查发现两个隐患并修复：① distill.ts 全部 prompt 用链式 replace('%s',...) 填槽——persona/画像/名称等用户可写内容含字面 %s 时后续实参填错槽位，改 fillSlots 单趟 /g 替换（4 处 call site）并补槽位错位回归测试；② PATCH /api/profiles 的 name 缺类型校验，非字符串会污染 op log，补字符串校验+80 字封顶。其余复核点（from 边界、esc 兜底、double-click 幂等、op 重放、快照兼容）均无问题。121/121 测试+typecheck+build 全绿。

### Git Commits

| Hash | Message |
|------|---------|
| `e6155a5` | fix(brain): prompt 槽位单趟填充 + PATCH name 类型校验 |

### Status

[OK] **Completed**


## Session 42: 画像管理功能上线部署
<!-- trellis-session: v=2 fp=39f079d6ad6fd7c6 -->

**Date**: 2026-11-03
**Task**: 画像管理功能上线部署
**Branch**: `main`

### Summary

确认线上 dist 落后（11-02 19:33 部署，缺 009c0ab/6aa2d89/e6155a5）后部署：rsync dist+package.json 到 ubuntu@124.222.65.169:~/dsh-qqbot-brain，sudo systemctl restart dsh-qqbot，服务 active，远程 page.html/index.js md5 与本地一致，新端点 regenerate/purge/reset 经宿主路由返回 401（token 校验前置=路由已挂载）。功能：画像卡编辑/重生成/删除 + 危险区时段删除/记忆重置保人设。

### Git Commits

| Hash | Message |
|------|---------|
| `e6155a5` | fix(brain): prompt 槽位单趟填充 + PATCH name 类型校验 |

### Status

[OK] **Completed**


## Session 43: 脑图底部图例与脑区标签堆叠修复
<!-- trellis-session: v=2 fp=c976418f1c1048f5 -->

**Date**: 2026-11-03
**Task**: 脑图底部图例与脑区标签堆叠修复
**Branch**: `main`

### Summary

问题：.stage-foot 图例条 absolute 覆盖在 #brain SVG 底部，与 AMYGDALA/HIPPOCAMPUS 脑区标签、+N 条未显示、悬停摘要文字堆叠。排查：定位为覆盖层本质问题，footer 高度随图例换行变化，挪 SVG 坐标不可靠。方案：.stage 改 flex 纵列，#brain 改 flex:1 占剩余空间，.stage-foot 改 relative 进文档流。验证：npm test 121/121 通过，静态预览确认布局。后续：若追求脑图铺满出血视觉可改给 viewBox 底部加空白带。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 44: 脑图节点视觉收敛
<!-- trellis-session: v=2 fp=c42a538dc99ec8e0 -->

**Date**: 2026-11-03
**Task**: 脑图节点视觉收敛
**Branch**: `main`

### Summary

问题：情绪实心大色点偏大且与人格/记忆的环核语言不搭。方案：page.html 三类节点半径整体下调（情绪5-11→4-8、人格11-16.4→9-13.2、记忆7-8.2→6-7.1），情绪改 ring+core+8%淡底结构复用 .node .ring CSS；不动 layoutSlots box 保证坐标零漂移。验证：npm test 121/121，静态预览复核。后续：empty 桶透明度可再降。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 45: 脑图 footer/节点优化上线
<!-- trellis-session: v=2 fp=4b4945678ba9f645 -->

**Date**: 2026-11-03
**Task**: 脑图 footer/节点优化上线
**Branch**: `main`

### Summary

上线 footer 覆盖修复+节点收敛：page.html 走 http.ts readFileSync 每请求读盘，rsync dist 到 ubuntu@124.222.65.169:~/dsh-qqbot-brain 即生效免重启；远端 md5 78c6a95d 与本地一致，旧页备份 page.html.bak-1103；公网带 token /brain 200 且返回含新 CSS 标记。部署方式沿用 journal 既有纯 dist rsync 惯例。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 46: README 增量更新：D3 复盘+生图提示词
<!-- trellis-session: v=2 fp=de9c2d5e885e8720 -->

**Date**: 2026-11-03
**Task**: README 增量更新：D3 复盘+生图提示词
**Branch**: `main`

### Summary

问题：README(11-02版)滞后于两天内~55个提交的新进展。做法：通读新增归档PRD（two-day-trial-eval D3复盘、llm-token-audit、emotion-bucket-coverage、brain-public-access、cloud-memory-purge、nsfw-message-drop、brain-link-issues、admin-followups）+journal session26-45+feat/webserver-shim分支PRD，重写README——理论表加情绪增强与两段排序；读写图改7section两段式(80/81稳定段+10300-10340易变段)并解释前缀缓存动机；实测效果改D3三维结论表(人格✅/记忆✅质变/上下文✅超预期，742次蒸馏37%丢弃、466→111、digest59次、1.2M tok/天~¥90/月)+eval+成本+清洗实战故事(170→124外科手术)+更新诚实清单(写回竞态/openid/emb马太精修0.62)；当前阶段改复盘完成+shim分支待合入(send_meme→send_file已本机实测)。新增docs/readme-image-prompts.md五张配图生图提示词(架构/时序/记忆生命周期/脑区映射/时间线)与5个IMG-SLOT占位注释，用户拿图后替换。验证：order按prompt.ts核对、D3数据按归档prd核对。后续：图片到位后替换占位；DeepSeek usage实测成本回来后补数据。

### Git Commits

| Hash | Message |
|------|---------|
| `0acb9ae` | docs: README 增量更新——D3 复盘结论、两段式注入、生图提示词 |

### Status

[OK] **Completed**


## Session 47: 长期对话成本增长机制分析
<!-- trellis-session: v=2 fp=5ed416d2f4c1f030 -->

**Date**: 2026-11-03
**Task**: 长期对话成本增长机制分析
**Branch**: `main`

### Summary

用户提问长期对话延迟/会话成本如何增长、transcript 是否膨胀、摘要压缩影响。排查：读 brain/index.ts（historyBuffer 60轮封顶）、capture/events.ts（Turn/contextText 500字）、store.ts（jsonl op流水）、inject/prompt.ts（7段注入）及 11-02 token 审计 prd。结论：宿主 transcript 逐字全量回放随轮次线性膨胀、~80%×1M 触发 compaction 形成锯齿形曲线（前缀缓存压扁斜率、compact 后短暂 miss 回涨）；插件侧 distill/digest/注入全部有界不涨；brain 侧无持久 transcript（historyBuffer 内存60轮、jsonl 是op流水非对话记录）。压缩影响：digest+memory+画像+情绪跨 compaction 存活兜底，夹缝损失是白名单外的过程性细节。纯讨论无代码改动，已建 task 归档。

### Git Commits

| Hash | Message |
|------|---------|
| `f8f3241` | docs(trellis): archive cost-growth-analysis discussion |

### Status

[OK] **Completed**


## Session 48: brain 跳出 dsh 的演进路线讨论
<!-- trellis-session: v=2 fp=91dd4d6d0ed6f7e5 -->

**Date**: 2026-11-03
**Task**: brain 跳出 dsh 的演进路线讨论
**Branch**: `main`

### Summary

探讨插件只做 dsh 是否暴殄天物及后续发展：重框问题为「资产 vs 宿主」——真正资产是宿主无关的 brain 内核(~2774行)+工程方法论(eval/审计/可观测)，dsh 只是第一个 deployment。给出 H1 顺手解耦(发言人格式参数化/provider 抽象/HostAdapter 显式化/ingest+assemble 端点)→H2 三形态(npm 库>HTTP sidecar>MCP 壳，按注入能力保留度排序)→H3 平台化(一脑多身/陪伴泛化/可观测护城河)路线；约束：场景筛查先行(WorkBuddy 教训)、sidecar 是降级、dsh 永久 first-class。存档至 archive/2026-11/11-03-brain-roadmap-beyond-dsh。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 49: README 配图：手绘 SVG 替代 ChatGPT 生图
<!-- trellis-session: v=2 fp=70a44fcac9a118c6 -->

**Date**: 2026-11-03
**Task**: README 配图：手绘 SVG 替代 ChatGPT 生图
**Branch**: `main`

### Summary

问题：README 五个 IMG-SLOT 待配图，原计划 ChatGPT 生图有中文错字风险。方案：按用户给的示例风格（白底浅蓝卡片）手写 5 张 SVG，headless Chrome 出 PNG。排查：首轮渲染空白因 wrapper 相对路径错；两轮目检修复标签重叠/箭头穿卡片共 5 处。验证：五图目检通过、IMG-SLOT 全替换。后续：脑区图轮廓可再精细、README 数据更新需同步重渲。

### Git Commits

| Hash | Message |
|------|---------|
| `7c3ecd2` | docs: README 五张配图落地——手绘 SVG→PNG 替换 IMG-SLOT |

### Status

[OK] **Completed**


## Session 50: 云端画像走查：活跃会话压缩棘轮纠偏
<!-- trellis-session: v=2 fp=cf866ac772d19059 -->

**Date**: 2026-11-03
**Task**: 云端画像走查：活跃会话压缩棘轮纠偏
**Branch**: `main`

### Summary

云端走查发现 demo 画像在活跃会话中被审核逐轮压缩（283→113），传记级稳定事实误删；根因是审核 prompt 不能照抄造成逢审必改义务感。纠偏为默认保留+拿不准就留，单聊不再出冗余会话画像；123/123 测试过，已部署。虚构设定评估结论=记（角色自洽优先，画像边界已有防线）。上轮修复验证：人设污染未复发、demo 双卡已并、巩固棘轮止住、花咲蝶舞画像 28→276 恢复生长。

### Git Commits

| Hash | Message |
|------|---------|
| `b474c83` | 画像审核纠偏：默认保留，杜绝逢审必改的压缩棘轮 |

### Status

[OK] **Completed**


## Session 51: README 数据刷新：计数同步 + 新归档结论入文
<!-- trellis-session: v=2 fp=739e4ea94c56697d -->

**Date**: 2026-11-03
**Task**: README 数据刷新：计数同步 + 新归档结论入文
**Branch**: `main`

### Summary

问题：配图落地后 README 数字过期（121 测试/126 commits/45 session），且新归档的成本增长分析、跳出 dsh 路线与 emb 并行化提交未入文。排查：实跑 npm test 123/123、git rev-list 135、journal 49 session、webserver-shim 仍未合入。方案：逐项刷新 README 计数、成本段补长期成本结论、路线候选改 H1-H3、时间线图重渲。验证：grep 无旧数字残留、PNG 目检通过。后续：里程碑时统一刷计数字段。

### Git Commits

| Hash | Message |
|------|---------|
| `9f1e7ac` | docs: README 数据刷新——123 测试/135 commits/49 session |

### Status

[OK] **Completed**


## Session 52: 大肥鱼人设内核 v2 依恋版 + 态度按人设分轨
<!-- trellis-session: v=2 fp=77ee4416d3891345 -->

**Date**: 2026-11-03
**Task**: 大肥鱼人设内核 v2 依恋版 + 态度按人设分轨
**Branch**: `main`

### Summary

需求：新版人设更体贴/懂人/粘主人/可攻略（恋人位 demo 专属），原版备份。排查：拉回线上人设发现 whale-gentle 有用户手改的成人向放宽（全保留）+3 处 U+FFFD 乱码（已修）；攻略线的「好感」持久化靠 attitude 记忆，共享池会让新人设被旧立场剧透。方案：事实共享·态度分轨——MemoryNote.personaId 打标，attitude 只召同人设（attitudeVisible 可见池统一 topK/保底/跨群三口），写侧三护栏防 mergeIndex/findNearDup/sweepNearDups 跨人设泄漏；脑图加按人设筛选+按人设删除（del-persona op）；画像 lastWrittenByPersona 标签。走查修 4 坑：persona-activate 不 bump graphVersion 致命中缓存旧轨、空串 personaId 归不了轨、无人设期全可见兜底、build 只拷 whale-gentle。验证：128/128 测试+typecheck 绿（新增 5 分轨用例）；线上部署后 devotion 注册激活、persona.md 镜像同步、重启保活，whale-gentle/legacy 可切回。后续：攻略弧演化靠 attitude 积累，早期可手动预置初始态度加速。

### Git Commits

| Hash | Message |
|------|---------|
| `a5bafdf` | 人设内核 v2「依恋版」+ 态度按人设分轨：可攻略玩法不被旧人设剧透 |

### Status

[OK] **Completed**


## Session 53: 人设分轨收尾走查：跨类合并护栏 + 线上 gentle 文本修复
<!-- trellis-session: v=2 fp=607091de019ffbc2 -->

**Date**: 2026-11-04
**Task**: 人设分轨收尾走查：跨类合并护栏 + 线上 gentle 文本修复
**Branch**: `main`

### Summary

完成后走查发现两个残余问题并已修复：a) 用户切回 whale-gentle 后 persona.md 带回 6 处 U+FFFD——store 存量条目不走种子修复，PATCH /api/personas 覆盖后三版本全干净（op 已持久化）；b) 跨类合并边缘口——mergeIndex 可把 attitude 改写到 shared semantic 目标致心态落错轨，findNearDup/sweepNearDups 只挡了 attitude↔attitude 跨人设、attitude↔事实跨类合并会静默吃写入；三处统一为「事实与态度不同角色永不互判重/吸收」，新增 2 用例 129/129 绿并部署。附带教训：npm run typecheck | tail 管道吞 exit code 掩盖过 TS 错误，验证要看原始退出码。

### Git Commits

| Hash | Message |
|------|---------|
| `ef612ff` | 跨类合并护栏：事实与态度不同角色，永不互相判重/吸收 |

### Status

[OK] **Completed**


## Session 54: 脑图移动端适配上线
<!-- trellis-session: v=2 fp=16f8254925971ede -->

**Date**: 2026-11-04
**Task**: 脑图移动端适配上线
**Branch**: `main`

### Summary

问题：手机上节点点不中（SVG无缩放）、点选后检查器在屏外、≤640媒体查询按旧absolute布局已失效、固定stage高度出letterbox。方案：viewBox视图控制（滚轮/捏合缩放到指针点、拖拽平移、35%越界夹取、resetView复位视图+选中）；touch-action:pan-y保纵向滚动；节点加hit触控圈+cap标签可点；点选滚动到检查器；≤1000 stage height:auto让svg按内禀840:600比自撑消letterbox、≤640头部/搜索/结果改static进文档流。验证：npm test 129/129，rsync部署远端md5 01e5bd3d一致、公网200。后续：dblclick复位、overflow触控、iPad中档。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 55: 脑图移动端走查与二次修正上线
<!-- trellis-session: v=2 fp=e9003f3b676bbda4 -->

**Date**: 2026-11-04
**Task**: 脑图移动端走查与二次修正上线
**Branch**: `main`

### Summary

用户反馈移动端效果一般不稳。用 playwright-core channel:chrome + CDP dispatchTouchEvent 真机走查：点选/拖拽/捏合/竖滑/复位链路实测全部正常，真短板是缩放零可发现性（默认视野hit圈仅19-28px）+移动端首屏即缩略图+溢出链接触控细+右键连点误触发。修正：双击缩放（VB.w>430放大2x否则回全图）、ctrls加＋－按钮、≤640初始视野140,120,600,429、+N包of-wrap+hit矩形、鼠标非主键守护、resize夹紧、触屏提示文案。验证：npm test 129/129、headless复测双击/按钮/复位全过、已部署远端md5 3f143a08。测试教训：tap落点触发scrollIntoView会滚走页面，后续手势须elementFromPoint找空白点。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 56: 修复画像重生成裸昵称actor归集失败
<!-- trellis-session: v=2 fp=3e4ea1e2a820d68c -->

**Date**: 2026-11-04
**Task**: 修复画像重生成裸昵称actor归集失败
**Branch**: `main`

### Summary

问题：脑图页用户画像点重生成弹「该对象暂无可用的记忆」。排查：regenerateProfile 对 u: 键只按 splitActor().openid 过滤佐证记忆，而蒸馏 prompt 让 memories.actor 只写昵称——真实 brain.jsonl 里 9 条记忆仅 1 条带全 tag，裸昵称全部漏掉致 evidence 为空返回 409。方案：改为 openid 或昵称双口径归集（nick 取 entry.name || speakers().get(openid)），与 assemble/mergedUserProfile 既有口径一致。验证：typecheck 干净，测试 130/130 通过（含新增裸昵称归集用例）。后续：可考虑蒸馏落库时回填全 tag 统一身份格式；「蒸馏调用失败」reason 语义可再细分。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 57: P2巩固增强上线
<!-- trellis-session: v=2 fp=f0b8e869efe8751b -->

**Date**: 2026-11-04
**Task**: P2巩固增强上线
**Branch**: `main`

### Summary

P2巩固增强：被语义巩固吸收的episodic打absorbedAt戳退出检索池（四处入口统一排除，保留存档），「对X：」attitude同对象自动原位归并，蒸馏prompt补同对象唯一约束；133测试全绿已部署

### Git Commits

| Hash | Message |
|------|---------|
| `567529f` | brain: P2 巩固增强——已吸收 episodic 打戳退池 + attitude 同对象归并 |

### Status

[OK] **Completed**


## Session 58: 记忆actor回填全tag与重生成reason细分
<!-- trellis-session: v=2 fp=1fafa91885c4994c -->

**Date**: 2026-11-04
**Task**: 记忆actor回填全tag与重生成reason细分
**Branch**: `main`

### Summary

承接 11-04-actor 修复时发现的两个欠账：①蒸馏/巩固落库的 note.actor 只有裸昵称（prompt 只让写昵称），靠 openid 匹配的下游先天缺数据——新增 resolveActorTag()，endOfTurn/consolidate 写入时用本轮 turns/源记忆的真实全tag回填，只做写路径不动存量；②draftProfile 把「调用失败」与「模型判空」都折叠成 undefined——distill 拆出 callRaw，三态返回后 regenerateProfile 分流「蒸馏调用失败」/「起草认为没有可提炼的稳定内容」。验证：typecheck 干净，137/137 测试通过（新增 resolveActorTag 单测、endOfTurn/consolidate 回填、三态 reason 共 4 条）。后续：存量裸昵称记忆可做受条件约束的一次性迁移，暂不做。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 59: 解答三类记忆（情景/语义/态度）的区别
<!-- trellis-session: v=2 fp=7d03e1511c577255 -->

**Date**: 2026-11-04
**Task**: 解答三类记忆（情景/语义/态度）的区别
**Branch**: `main`

### Summary

用户问三类记忆差异与生效方式：读 brain 层源码 + SSH 线上取证（ubuntu@124.222.65.169，189 条=128 episodic/46 semantic/15 attitude）。结论：检索同池同公式（kind 无感），差异在生产端（蒸馏默认 episodic/巩固产 semantic/蒸馏打标 attitude）与注入端（attitude 独立立场区+保底/跨群/分轨）。观感无差别的线上根因：attitude 13/15 错标为用户事实、semantic 里反混立场文案、markAbsorbed 当天 15:45 才部署致同一事实跨 kind 重复（馆长×4）、devotion 激活后 15 条 attitude 按分轨设计全部不可见。纯讨论，存档于 11-04-memory-kinds-explained。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 60: 线上记忆标齐+三类边界加固任务
<!-- trellis-session: v=2 fp=df49edb58652bab0 -->

**Date**: 2026-11-04
**Task**: 线上记忆标齐+三类边界加固任务
**Branch**: `main`

### Summary

SSH 线上取证后按用户指示用已有优化标齐数据：PATCH 把 13 条错标 attitude 改回 episodic（同时解除 whale-gentle 态度轨对 devotion 的遮蔽）、POST /api/dedup 合并 13 簇 17 条近重复（189→172，馆长×4→源+摘要各一）。剩余三缺口无现有机制，建任务 11-04-memory-kind-boundary：R1 历史 sourceIds 追溯退池、R2 蒸馏 attitude 格式硬校验、R3 巩固入库判重（可选 R4 巩固 prompt 立场引导）。

### Git Commits

| Hash | Message |
|------|---------|
| `bb7e920` | chore: record production findings in memory-kinds-explained |

### Status

[OK] **Completed**


## Session 61: 脑图前端美学走查与 P0+P1 优化
<!-- trellis-session: v=2 fp=ea225ca3eff74b99 -->

**Date**: 2026-11-04
**Task**: 脑图前端美学走查与 P0+P1 优化
**Branch**: `main`

### Summary

问题：用户问 /brain 前端是否符合美学、能否再优化，目标「更有质感、更稳定」。排查：本地 demo 服务器（BrainStore 临时目录灌 28 条记忆）+ playwright-core 系统 Chrome 在 1440/1280/900/640/390 宽下截图走查，发现 P0（#qSess 原生灰条横穿舞台、地图按钮折行、移动端头部折行截断）和 P1（检查器一墙 0 值进度条、20 多个截断标签成噪点、下半区掉回后台风、小字对比度 3.5:1、移动端立绘占满一屏且表格横滚）。方案：用户选 P0 + 全部 P1，决定「按重要度显示标签」和「移动端立绘紧凑条」。只改 page.html 和 page.test.ts：设计令牌（字阶 / 圆角 / --muted 6.5:1 / --faint 5:1）+ 全局 select 样式；搜索框内含会话下拉；32px 单行工具条；labelPick 取前 8（每类保底 2）+ .quiet/.zoomed 分级显现；viewBox 下移 16 单位，NEOCORTEX 标签挪位；meterGroup 把 0 值收成 chips；卡片 / 页签 / 表格统一皮层风格；≤640 宽记忆库逐行堆叠，≤1000 宽立绘 120px；按「稳定」诉求把节点漂移减半。验证：npm test 143/143、typecheck、build 通过；5 种视口无溢出、无报错，首页标签 8 个，悬停 / 选中 / 放大能显现；移动端缩放回归、刷新保留草稿、空库均通过。spec 已补视觉令牌与标签分级约定。后续：移动端初始视野裁掉区域标签，情绪图表样本少时观感弱，尚未部署线上。

### Git Commits

| Hash | Message |
|------|---------|
| `9c7d91e` | 脑图美学走查：修 P0 破损 + 标签分级/构图/统一视觉语言，提升质感与稳定 |

### Status

[OK] **Completed**


## Session 62: 脑图点击无响应与PC误触缩放修复+节点发光化
<!-- trellis-session: v=2 fp=f67cf1016dd78a75 -->

**Date**: 2026-11-04
**Task**: 脑图点击无响应与PC误触缩放修复+节点发光化
**Branch**: `main`

### Summary

问题：用户反馈线上 /brain PC 端点节点没反应、点按莫名放大、节点样式不好看。排查：pointermove 单次位移>3px 即 viewMoved，PC 鼠标点按手抖普遍超 3px → 捕获阶段 click 拦截把节点 click 吃掉；ptrEnd 双击缩放（340ms/30px）未排除鼠标 → 重复点击触发 zoomAt(0.5)。方案：指针改累计位移死区（pend 累加>8px 才平移且一次应用累计量无跳变），双击缩放限定 pointerType==='touch'（PC 保留滚轮/＋/－）；节点样式改发光亮点——核心半径 .45→.6、类型色填充 .1→.16、常驻光晕分层（全量 .09/带标签 .18/悬停 .4）、quiet .8 fading .68、核心 filter 软化。验证：playwright reduced-motion 关漂移后真实鼠标事件过——3px 抖动点击选中、双击 vb 不变、60px 拖拽平移、空点取消；移动端触摸双击 600→300 仍生效；143/143 测试+typecheck+build 绿；rsync page.html 上线免重启（每请求读盘），远端 md5 abbd1743 一致。后续：选中态光环可更醒目；真实 172 条密度下 quiet 透明度待观察。

### Git Commits

| Hash | Message |
|------|---------|
| `014540f` | 脑图指针修复：8px 死区防吞点击/鼠标不触发双击缩放，节点改发光亮点风格 |

### Status

[OK] **Completed**


## Session 63: 确认黄色边界测试轮的人格版本归属
<!-- trellis-session: v=2 fp=cdf1e0e5dfc2f91c -->

**Date**: 2026-11-04
**Task**: 确认黄色边界测试轮的人格版本归属
**Branch**: `main`

### Summary

用户 11-04 做了模拟恋爱黄色边界测试（性关系场景，18:37–18:50），需确认跑在温柔版还是依恋版。查 brain.jsonl 的 persona-activate 流水：15:10 激活温柔版，测试轮全程落在温柔版区间；19:35–19:36 三次切换后依恋版生效至今。结论：本轮边界数据归属温柔版（whale-gentle）；当前 activePersonaId=whale-devotion。另注：本轮露骨消息全部到达回复，QQ 风控未拦。

### Git Commits

| Hash | Message |
|------|---------|
| `25271cf` | chore(task): restore task.json for 11-04-nsfw-test-persona-attribution |

### Status

[OK] **Completed**


## Session 64: 脑图点击失效真因：pointer capture 重定向 click
<!-- trellis-session: v=2 fp=d778d0e8a5cf01e9 -->

**Date**: 2026-11-04
**Task**: 脑图点击失效真因：pointer capture 重定向 click
**Branch**: `main`

### Summary

问题：上线后用户复测点节点仍无反应。排查：用线上 brain-data 本地起真实数据服务+playwright 真实鼠标事件复现——点击到达 svg 但 click 被 setPointerCapture 重定向到 svg 根（Pointer Events 规范行为），closest('.node') 落空走取消选中；此前 dispatchEvent('click') 测试绕过捕获从未暴露。方案：懒捕获——点按不捕获，位移越 8px 阈值或双指捏合才 setPointerCapture。验证：真实数据三类节点点击选中+详情渲染、抖动/双击/拖拽/空点/移动端双击回归全过；已部署远端 md5 4d7420d6。教训：交互验证要用真实输入事件。

### Git Commits

| Hash | Message |
|------|---------|
| `228ba6c` | 脑图点击真修：setPointerCapture 重定向 click 到 svg 根导致节点点击失效，改懒捕获 |

### Status

[OK] **Completed**


## Session 65: 效果评估：记忆三类加固实盘 + 跨人设记忆可见性
<!-- trellis-session: v=2 fp=618eff19ce2d4dc4 -->

**Date**: 2026-11-04
**Task**: 效果评估：记忆三类加固实盘 + 跨人设记忆可见性
**Branch**: `main`

### Summary

评估 490e87b 三类加固上线效果：R1 退池 110 条 episodic（检索池 77）、R3 巩固判重触发 3 次合并，R2/R4 armed 无样本；发现一条 semantic 主体写串。另确认人设切换可见性：personaId 只管 attitude 分轨，事实/画像/digest/情绪跨人设共享——依恋版带着完整恋爱史（第一次亲密 imp4-5、亲吻约定、恋人关系确立）运行，零损失。附带发现 task.py create 因 git remote show origin 网络调用卡顿，--base-branch main 可跳过。

### Git Commits

| Hash | Message |
|------|---------|
| `4f17d44` | chore(task): archive 11-04-memory-kind-effect-persona-visibility |

### Status

[OK] **Completed**
