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
