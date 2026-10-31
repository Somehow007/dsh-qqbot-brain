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
