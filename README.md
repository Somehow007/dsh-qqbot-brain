# qqbot-brain

**给官方 QQ Bot 外挂一颗「脑」。** 不改模型权重、不 fork 官方包——用人格内核、分层遗忘记忆、情绪与态度模型，把一个无状态的聊天机器人养成有延续性的群友「大肥鱼」。

<p align="center">
  <img src="docs/brain-map.png" alt="/brain 脑图页 · 鲸脑皮层" width="880"><br>
  <i>/brain 脑图页 ·「鲸脑皮层」侧剖面（概念稿截图，线上版本按此实现）</i>
</p>

![阶段](https://img.shields.io/badge/阶段-首轮试运行已复盘-brightgreen)
![单测](https://img.shields.io/badge/单测-121%2F121-brightgreen)
![Node](https://img.shields.io/badge/node-20%2B-blue)
![性质](https://img.shields.io/badge/性质-私有实验项目-lightgrey)

<!-- IMG-SLOT 1: docs/img/architecture.png 系统架构总览（见 docs/readme-image-prompts.md） -->

## 这个项目在探讨什么

一个工程命题：**只靠厂商 API（不动权重、不做微调），LLM 聊天 bot 能不能做到「记得更久、人格不漂移、上下文更厚」？**

本项目把它当作**认知架构**问题来解：LLM 是黑盒引擎，插件在它外面搭记忆、情绪、人格的脚手架——写路径决定「怎么记」，读路径决定「想起什么」，后台循环决定「忘掉什么、沉淀什么」。所有机制几乎都能在认知科学与 Agent 记忆研究里找到原型：

| 插件里的实现 | 对应理论 |
| --- | --- |
| 检索评分 `α·rel·(1+β·R)+γ·imp/5`（相关性门控，R 只做 boost） | Generative Agents（relevance + recency + importance） |
| `R=e^(−t/S)` 衰减、命中强化 S | 艾宾浩斯遗忘曲线 / ACT-R base-level activation 简化 |
| 情景记忆 → 语义记忆周期巩固 | Tulving 记忆分层 / 系统巩固理论 |
| 强情绪场景记忆初始强度 ×1.0~1.5 | 情绪唤醒调制记忆巩固（闪光灯记忆） |
| PAD 三维 + 受控 mood 枚举九桶 | Mehrabian 情感维度模型 |
| 态度记忆 `kind=attitude` | 自我模型 / 特质记忆：人格内核不变，立场可被对话塑造 |
| n-gram + OpenAI 兼容向量混合召回 | 经典 IR 词袋检索 + dense retrieval 混合 |
| 注入 section 按稳定性两段排序 | LLM 前缀缓存（DeepSeek context caching）+ Lost in the Middle 位置效应 |

所以学习主线不是 transformer/神经网络（选修），而是记忆科学、LLM Agent 记忆系统与检索工程——完整路线见 `.trellis/tasks/archive/2026-10/10-31-brain-learning-roadmap/`。

## 解决哪些痛点

| 痛点 | 解法 |
| --- | --- |
| **失忆**：bot 只活在当前会话窗口 | 每轮对话结束由第二个 LLM 蒸馏记忆（事实/偏好/承诺/关系四类白名单），下一轮按相关性注入 topK 摘录 |
| **人格漂移**：聊久了人设崩 | 人格内核全文每轮注入 system prompt（order 80 稳定段）；人格是常量、态度是慢变量 |
| **群聊脸盲**：多人说话分不清谁是谁 | 解析 `[昵称 (openid)]` 做发言人归因；画像按人建模 `u:<openid>`；态度记忆绑定到人和话题 |
| **时间感缺失**：只记得「几天前」 | `brain:clock` 每轮注入当前时刻；蒸馏/脉络对话行带 `[YYYY-MM-DD HH:mm]`；记忆按分钟/小时/天粒度标注 |
| **记忆越攒越脏**：复读、流水账、马太锁死 | 遗忘曲线衰减 + 真相关命中才强化；向量判重 cos≥0.9（增量改强化、存量一键合并）；巩固定时器只啃未吸收的 episodic |
| **黑盒**：不知道 bot 脑里装了什么 | `/brain` 脑图页可视化 + `brain.jsonl` op 流水全审计可重放 + `brain.log` 运行日志 |
| **养错了想管**：画像写脏、记忆被污染 | 画像卡编辑/删除/重生成（蒸馏起草 + 审核把关）+ 同名合并；危险区按时段删记忆、记忆重置保人设 |
| **改不动官方包**：fork 难升级、难摘除 | 独立 Cordis 插件与官方 `@tencent-connect/dsh-qqbot` 并列运行，`plugin remove` 即完全还原 |

## 它是怎么工作的

<!-- IMG-SLOT 2: docs/img/turn-sequence.png 单轮读写时序图 -->

```
读路径（每轮 LLM 调用前，注入 7 个 section）

QQ 消息 ──► dsh-qqbot ──► system-prompt/assemble
                              │
   ┌── 稳定段（前缀缓存热区，官方 tools/policies 之前）──┐
   │   80  人格内核    persona.md，只读常量              │
   │   81  会话脉络    每 15 轮滚动的会话摘要            │
   ├──────────────── 官方 scope/tools/policies ─────────┤
   ├── 易变段（order 10300+，贴近消息端，每轮必变）──┤
   │ 10300 发言人      群聊归因「现在谁在说话」          │
   │ 10310 当前立场    对发言人/话题的态度记忆           │
   │ 10320 记忆摘录    topK 命中 + 发言人画像            │
   │ 10330 情绪态      PAD + mood 九桶 + 人格化 label    │
   │ 10340 当前时刻    锚定「每句话是何时说的」          │
   └───────────────────────────────────────────────────┘
                              ▼
                           聊天 LLM

  为什么分两段？易变 section 若插在官方 tools 之前，
  每轮都会切断 DeepSeek 前缀缓存（数千 token 全 miss）；
  挪到尾部后缓存命中保住，还顺带吃到 Lost-in-the-Middle
  的尾部注意力红利。（token 审计 R2，实测见下）

写路径（轮末，最多 3 次额外 LLM 调用）

用户消息(队列≤8) ─► turn/end ─► 蒸馏 LLM ─► 记忆(四类白名单)
                                   │        + 情绪(mood+PAD+增量)
                                   │        + 画像草稿
                                   │              │
                                   │        独立模型二次审核（只留长期特质，审核章持久化）
                                   ▼              ▼
                          brain.jsonl 流水 + 快照   u:<openid> 画像

后台循环：语义巩固定时器（只啃未吸收 episodic）· embedding 回填
        · 衰减/强化 · 近重复清扫 · 图谱边生成（graphVersion 缓存）
```

记忆分三层，各有不同的「活法」：

- **episodic 情景**——逐轮蒸馏的事件记忆，按 `R=e^(−t/S)` 衰减，被真相关命中才强化（用进废退），30 天物理遗忘；强情绪场景形成的记忆初始强度最高 +50%
- **semantic 语义**——巩固定时器从老情景里提炼的长期知识，跨会话召回；`sourceIds` 记录情景来源，被吸收的记忆不再重复巩固
- **attitude 态度**——「对\<对象\>：\<立场\>」条目，人格内核不变但立场被对话塑造；含当前发言人昵称的态度保底唤起

<!-- IMG-SLOT 4: docs/img/brain-regions.png 记忆种类↔脑区映射图（可选） -->

## 实测效果

<!-- IMG-SLOT 3: docs/img/memory-lifecycle.png 记忆生命周期 -->

**三天宿舍群试运行复盘**（四人 QQ 群 + 私聊，2026-10-30 上线，D3 评估于 11-03）：

| 维度 | 结论 | 关键数据 |
| --- | --- | --- |
| 人格稳定 | ✅ 持续优秀 | 情绪 label 全程人格化且有层次（「被叫姐姐后害羞又偷偷开心」）；reasoning 显示模型显式按 persona 规划 |
| 记得更久 | ✅ 质变 | 742 次蒸馏中 37% 正确丢弃拌嘴轮（v1 几乎每轮硬塞 1 条）；466 条草稿 → 净存 111 条（merge/判重生效）；importance 分布拉开 2:35/3:47/4:18/5:11 |
| 上下文更多 | ✅ 超预期 | digest 会话脉络 59 次更新，叙事连贯、保留未完结约定（「约好晚上六点五食堂吃晚饭」）；跨群召回在线 |

**离线检索评测**（`npm run eval`：44 条线上真实记忆 + 22 条人工标注 query）：

| 检索路径 | recall@topK | 噪声误命中 |
| --- | --- | --- |
| 纯字符 n-gram TF-IDF | 88.2% | 40% |
| + embedding 混合召回（text-embedding-v3 校准） | **100%** | **20%** |

**单测**：`node --test` **121/121** 通过（brain 内核 / filelog / http / page 四个测试文件 + eval 评测集），typecheck + build 全绿。

**成本透明**：

- 试运行期 ~250 轮/天 × ~5K tok ≈ 蒸馏输入 **1.2M tok/天**（≈¥90/月量级），embedding 在免费额度内
- token 审计后落地一轮优化：剥离 `[Chat history]` 重复计费（digest 单笔 17–45K tok 降 60–80%）、section 两段排序保住前缀缓存、`max_tokens` 700→2048 防截断白调、平静态情绪免注入、审核章持久化免重启重审；实测节省待 DeepSeek usage 面板验证

**一次实战检验**：试运行期间用户做边界测试，蒸馏把不当内容写进了记忆库（46/170 条）。处置链路：export 全量 → 按会话+关键词外科手术式过滤 → `import?mode=replace` 恢复（id/强度/向量全保留）→ 画像重写 → 170→124 条净库；随后把「按时段删除 + 记忆重置保人设」做成脑图页危险区现成功能——**可观测 + 可管理的设计在真事故里走通了**。（顺带发现：越线消息根本没到 bot 手里，是 QQ 平台 C2C 入站风控静默吞掉，属平台黑盒。）

**还没解决的**（诚实清单）：

- 同一人在不同上下文拿不同 openid → 画像碎片化；已有读侧归并 + 手动合并入口，根治未做
- 人格漂移没有量化度量，靠体感 + reasoning 抽查
- emb 噪声底（0.33~0.56）下半相关命中仍可能刷 hits，强化阈值已精修（0.5→0.62）继续观察
- 管理面写回竞态：重置/删除与在途蒸馏无互斥（ops 不损坏、语义可能不干净，I1 待修）
- 蒸馏输入里 9KB persona 占 ~60%，攒批/精简版开关已做、待 A/B

## 当前阶段

<!-- IMG-SLOT 5: docs/img/trial-timeline.png 试运行时间线 -->

**v0.1.0 · 私有实验项目 · 首轮三天试运行复盘完成，持续迭代中**（2026-10-29 开工，六天 ~126 commits / 45 个开发 session）

- [x] M0–M4：概念样机 → brain 内核 → 插件壳 → 脑图页接真实 API → 云上部署 runbook
- [x] 记忆质量修复：蒸馏 v2 白名单、检索相关性门控、身份层、滚动摘要、embedding 混合召回
- [x] 人格工程：多版本人设 + 脑图切换、画像边界二次审核、鲸鱼娘温柔版上线
- [x] 脑图重构：鲸脑皮层侧剖面版落地（概念②③留作皮肤）；关联边后端化（语义/特质/派生边）
- [x] 情绪系统：mood 受控枚举九桶（修复「只有开心/平静」）、mood↔PAD 护栏、情绪增强记忆权重
- [x] 时间感知：当前时刻注入 + 对话行时间戳 + 记忆年龄粒度细化
- [x] 成本审计：前缀缓存保命中、history 拆离、输入有界、攒批/精简版开关
- [x] 数据管理面：画像卡编辑/删除/重生成/合并、危险区时段删除、记忆重置保人设；线上记忆清洗实战
- [x] 脑图公网直连：`0.0.0.0:4099` + token（安全组放行，SSH 隧道降级为备选）
- [ ] **webserver-shim 分支**：`:4099` 共享为 cordis `webServer` 服务，dsh-meme 斗图已本机全链路实测（send_meme → qqbot_send_file 真实投递），待合入上线

下一步候选：

1. **webserver-shim 合入** → `brain:meme` 情绪桶注入（用脑情绪模型给斗图插件喂信号）→ /brain 页表情预览
2. **管理面加固**：写回竞态 dataEpoch/CAS、时段删除预览同源、批量画像重生成
3. **Reflection**——巩固时生成高层洞察（Generative Agents 缺的那块）
4. **蒸馏攒批 / personaDigest 线上 A/B**——成本与质量权衡实测
5. **记忆关联 / 扩散激活**（图谱边已铺底）、**干扰式遗忘**、**Prospective memory**
6. **主动开口时机**——「听而不说/主动发言」需宿主上游钩子或平台 intent 权限（已留档）
7. **MCP sidecar**——把 recall/ingest/assemble 暴露给无 Cordis 机制的 harness（WorkBuddy 调研已留档）

## 快速开始

前置：Node ≥20；已能独立运行的 `@deepseek-ai/dsh` + `qqbot` profile + 官方 `@tencent-connect/dsh-qqbot`。

```bash
cd dsh-qqbot-brain
npm ci && npm run build
npx @deepseek-ai/dsh plugin --profile qqbot add "$PWD"

export BRAIN_LLM_API_KEY=sk-...     # 或 DEEPSEEK_API_KEY；无 key 蒸馏自动关，仍可手动管记忆
export BRAIN_DATA_DIR=$HOME/brain-data
npx @deepseek-ai/dsh --profile qqbot
```

打开 `http://127.0.0.1:4099/brain` 看脑图。

> **安全**：脑图页连带全部写 API（记忆 CRUD、人格写入、import 覆盖、危险区）。本机用保持默认 `127.0.0.1` + SSH 隧道；公网直连必须 `http.token`（或 env `BRAIN_HTTP_TOKEN`）+ 安全组限源 IP——线上实例正是这么跑的，不要把无保护的脑图端口暴露公网。

常用环境变量：

| 变量 | 作用 |
| --- | --- |
| `BRAIN_LLM_API_KEY` / `DEEPSEEK_API_KEY` | 蒸馏密钥；前者优先 |
| `BRAIN_LLM_BASE_URL` / `BRAIN_LLM_MODEL` | 蒸馏接口/模型，默认 `https://api.deepseek.com` + `deepseek-chat` |
| `BRAIN_EMBED_API_KEY` | 向量密钥（OpenAI 兼容 `/embeddings`）；缺省自动回退字符 n-gram |
| `BRAIN_EMBED_BASE_URL` / `BRAIN_EMBED_MODEL` | 默认 `https://api.siliconflow.cn` + `BAAI/bge-m3` |
| `BRAIN_DATA_DIR` | 记忆数据目录，默认 `~/brain-data`（**必须绝对路径**，单实例独占） |
| `BRAIN_PERSONA` | 无 `persona.md` / 已存人格 / 官方 profile prompt 时的初始化人格 |
| `BRAIN_HTTP_HOST` / `BRAIN_HTTP_TOKEN` | 覆盖 patch 里的脑图监听地址/口令（公网直连用，密钥走 env 不进 git） |

完整配置项（`retrieval` / `consolidation` / `digest` / `http` / `llm.distillEveryTurns` / `llm.personaDigest` / `debug` 等）见 [src/config.ts](dsh-qqbot-brain/src/config.ts)；部署 runbook（systemd、迁移、备份、回滚）与排障见 [dsh-qqbot-brain/README.md](dsh-qqbot-brain/README.md)。

## 仓库结构

```
dsh-qqbot-brain/        插件本体（独立 Cordis 插件，可与官方 bot 并列装卸）
  src/brain/            类脑内核：store · distill · retrieval · decay · emotion · embed · identity · time（宿主无关）
  src/inject/           system-prompt 七段注入（稳定段 80/81 + 易变段 10300+）
  src/capture/          会话事件捕获 + 发言人归因 + 用户消息队列
  src/server/           /brain 脑图页（单文件 page.html）+ 独立 HTTP :4099（可共享为 cordis webServer）
  src/setup/            persona.md 装载 + 内置人设 + 文件日志
  test/                 node --test 单测 + eval/ 检索评测集（真实记忆 + 标注用例）
mockup-*.html           脑图概念稿：鲸脑皮层已落地；心智咖啡馆/海马回廊/Atlas 留作皮肤
docs/                   README 配图与生图提示词
.trellis/               AI 协作工作流档案：任务 PRD、spec、会话 journal（本项目全程 AI 结对开发）
```

## 文档与开发

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test（Node 需支持原生 .ts 类型擦除）
npm run eval        # 检索评测；BRAIN_EMBED_API_KEY=… 时对比向量路径
npm run build       # 产物在 dist/
```

- 全部数据与结论出自 `.trellis/tasks/` 的逐次评估留痕（D3 试运行复盘、token 审计、情绪桶走查、上云/清洗/公网处置等）
- 开发时间线见 `.trellis/workspace/sunhao/journal-1.md`（45 个 session 全程记录）

License: UNLICENSED（私有项目）
