# MAP · 项目地图

> **README 讲这个项目是什么、做得怎么样；本文件讲东西都在哪、按什么顺序看。**
> 服务四类人：想**学习**这个项目的、想**规划**下一步的、想**动手改代码**的、想学「这个项目是怎么被开发出来的」。

## 一、按意图找地方

| 我想… | 先看 | 然后 |
| --- | --- | --- |
| 30 分钟看懂项目 | `README.md`（叙事版总览）+ `docs/img/architecture.png` | `demo/` 起本地脑图点一点 |
| 学「类脑记忆」领域知识 | `.trellis/tasks/archive/2026-10/10-31-brain-learning-roadmap/`（理论↔代码对照表 + 六阶段路线） | README「这个项目在探讨什么」 |
| 按顺序读源码 | 下文「源码阅读顺序」 | `.trellis/spec/backend/index.md` 对照约定 |
| 动手改代码 / 写进项目 | `AGENTS.md` 项目约定 + `.trellis/spec/backend/index.md` | `.trellis/workflow.md` 走 Trellis 流程 |
| 想要一套可复用的 AI 驱动开发工作法 | `~/dev/code/vibe-coding/ai-workflow/`（PRINCIPLES 原则 → kit 可复制机制 → playbooks 场景手册） | 本仓库 `AI-WORKFLOW.md` 是参考实例（落点/实证/backlog），`.trellis/` 是证据 |
| 看范式健康度 | `scripts/workflow-health.py`（记账占比/变更失败率/验收陈龄/backlog/事件流/规则体积） | 开工卡片自动注入越线项 |
| 安全面 / 注入与投毒 | `docs/threat-model.md` | prompt eval `--case inject` / `--case poison` |
| 规划新功能/任务 | `.trellis/workflow.md` + `tasks/` 里主题相近的旧任务 prd.md | `task.py create` |
| 查「当时为什么这么定」 | `.trellis/tasks/archive/` 按目录名搜主题，读 prd.md | `workspace/sunhao/journal-1.md` 按日期还原 session |
| 开工前看别的会话改了啥 | `.trellis/CHANGES.md`（新会话全读 / 恢复会话增量；SessionStart 开工卡片会提示） | 顺条目指针读对应 task/journal |
| 部署 / 运维 / 排障 | `dsh-qqbot-brain/README.md` 部署 runbook + `AGENTS.md`「线上数据在哪」 | `docs/brain-backup-restore.md` |
| 不带 bot 只玩脑图 | `demo/serve-demo.ts`（`node --experimental-strip-types`，即起即抛） | `demo/README.md` 演示数据解读表 |
| 对外讲这个项目 | `求职材料/README.md`（简历条目 + 面试聊点 + 数字速查） | `参赛材料/`（gitignored）、`demo/` |
| 想系统提升自己 / 面试准备 / 回顾设计思想 | `GROWTH.md`（个人成长手册：面试弹药 + 领域地图 + 设计思想 + 待深入论题池） | `求职材料/`、`.trellis/tasks/` 指针 |

## 二、仓库结构（代码层 vs 档案层）

```
dsh-qqbot-brain/            ▶ 代码层：插件本体（TypeScript ESM，零运行时依赖，~5k 行 src）
  src/brain/                  类脑内核，宿主无关可独立测——store/distill/retrieval/decay/emotion/embed/identity/time；Brain.search 主动召回原语 + assemble 深挖门控（迭代C）+ standing intents 前瞻记忆与 via/source 出处（迭代D）
  src/inject/prompt.ts        读路径：system-prompt 九段注入组装（稳定段保前缀缓存；brain:style 渠道表达口径压宿主 markdown 引用指令）
  src/capture/events.ts       写路径入口：会话事件捕获 + 发言人归因
  src/server/                 /brain 前端：http.ts（API）+ web/（ES modules 新前端：三皮肤脑图 + 七页管理端）+ page.html（旧单文件页，?ui=legacy 兼容中）
  src/setup/                  persona.md 装载 + 内置人设 + 文件日志
  src/index.ts · config.ts    Cordis 插件装配入口 + 全部配置旋钮
  test/                       node --test 四件套（brain/filelog/http/page）+ eval/ 检索评测集 + prompt-eval/ 人设·口径回归黄金集（付费 key，不进 npm test/CI）
  scripts/reply-style-audit.py 走查工具：宿主转录按「人设×是否联网」统计回复活人感指标（链接/免责/口吻/均长）
  scripts/deploy.sh           一键部署：门禁（拒脏工作区）→ 远端成对备份 → rsync → restart → 探活 → 失败自动回滚插件；落 .trellis/deploy-log.tsv
  scripts/install-hooks.sh    把 .githooks/ 软链进 .git/hooks（pre-commit：密钥扫描 + 代码改动跑 typecheck/test）
  README.md                   部署 runbook：rsync（dist 不带尾斜杠）· systemd · 公网直连 · 排障

docs/                       README 配图（img/，含 src/ 手绘 SVG 源）· 备份恢复手册 · 威胁模型 · 生图提示词
demo/                       虚构演示数据集 + serve-demo.ts（免 dsh 直接开 /brain，公开安全）
mockup-*.html / *.js        脑图概念稿群：鲸脑皮层已落地为线上版，咖啡馆/回廊/Atlas 留作皮肤
personas/                     独立人设包群（第二人格资产：persona.md + 种子导出 + 生成器）
  ye-shunguang/ · firefly/    绝区零叶瞬光 · 崩铁流萤——同构模板，可并存分轨
求职材料/                   简历条目 / 面试聊点手册 / 岗位匹配（对外叙事口径）
参赛材料/                   比赛申报材料（gitignored，不进库）

.trellis/                   ▶ 档案层：开发过程全留痕（见「四、学开发思路」）
.githooks/ · .github/workflows/ci.yml   机器化门禁：pre-commit 与 CI（typecheck/test/build/eval）
.devin/hooks.v1.json · prod-hosts      agent 护栏：PreToolUse 拦高危/生产写命令（scripts/agent-guard.sh）+ SessionStart 开工卡片（scripts/session-card.sh）
scripts/                    范式工具（拷自 ai-workflow/kit）：workflow-health.py 体检 · changes.py 事件流记账 · wrap-up.sh 一条命令收工
AGENTS.md                   项目约定：线上数据位置、部署要点、归档流程——动手前必读
AI-WORKFLOW.md              工作范式实例层：原则落点表 / 本项目实证 / backlog（通用原则在 ai-workflow/PRINCIPLES.md）
GROWTH.md                    个人成长手册（用户向）：面试弹药 · 领域地图 · 设计思想 · 待深入论题池——认知沉淀，非开发文档
brain-data/                 线上记忆导出的本地备份（gitignored）
.dsh/ · .agents/ · .devin/  Trellis 在各 AI 平台的适配（DSH.md 讲 dsh 侧；skills/workflows 自动生成，一般不用手改）
```

## 三、源码阅读顺序（src ~4.5k 行）

按「数据模型 → 落盘 → 编排 → 读路径 → 写路径 → 外围」走，每一步都有对应 spec 约定可查：

1. **`src/brain/types.ts`**（~300 行）——单一出处：三类记忆 kind（episodic/semantic/attitude）、三轨模型（世界轨共享 / 自我轨 `self:true`+attitude 按 `characterId` 隔离 / 情绪按角色）、Note/PAD 情绪/mood 枚举（全局九桶默认，人设可用 `PersonaEntry.moods` 换词表）、BrainConfig 全字段。先知道「脑里装了什么」。
2. **`src/brain/store.ts`**（~900 行）——持久化：JSONL op 流水 + 快照，一切写操作都是可重放的 op。
3. **`src/brain/index.ts`**（~1.5k 行，最大文件）——Brain 门面：`endOfTurn`/`assemble`/`search`/`consolidate` 的编排中枢；`search` 是可复用检索原语（companion 壳层 `brain_search` tool 的底座），assemble 内 `maybeDeepRecall` 做召回意图深挖。
4. **读路径 `src/inject/prompt.ts`**（~160 行）——八段注入；两段排序为什么保 DeepSeek 前缀缓存（README 有图）。
5. **写路径 `src/capture/events.ts`（~180 行）→ `src/brain/distill.ts`（~430 行）**——发言人归因 → 蒸馏 prompt/解析/画像二审。
6. **记忆三件套** `retrieval.ts`（n-gram TF-IDF + embedding 混合 + 评分公式）· `decay.ts`（R=e^(−t/S)）· `embed.ts`（向量召回）。
7. **`src/server/http.ts` + `web/`**——/brain API 契约；`web/` 为浏览器原生 ES modules（core=store/router/theme/vm/api/ui，skins=cortex/dossier/nocturne，admin=七页管理端壳），`page.html` 为迁移期旧页（`?ui=legacy`）。
8. **`src/index.ts` + `src/config.ts`**——Cordis 插件怎么把上面一切装配起来；全部可调旋钮。

配套读法：`test/` 单测当规格看（204 个用例覆盖了大部分边界）；`test/eval/` 是「评测先行」方法论的落地（44 条真实记忆 + 22 条标注 query + 5 条深挖召回子集）。

## 四、这个项目是怎么被开发出来的（学开发思路入口）

全程 **AI 结对 + Trellis 工作流**：10 天 ~230 commits、88 个开发 session 全部留痕。`.trellis/` 不是脚手架，是这个项目另一半的价值所在——它把「为什么这么写」变成了可查的档案。

| 目录 | 角色 | 怎么用 |
| --- | --- | --- |
| `workflow.md` | 流程定义：Plan → Execute → Finish | 读前 ~200 行即懂全貌（后面的 breadcrumb 契约可跳过） |
| `spec/` | 沉淀的编码约定（按 backend/frontend/guides 分层） | **每条约定都是踩过的坑**：n-gram 归一化、画像 openid 幻觉校验、mood 枚举同步点……读 `spec/backend/index.md` 等于读一份排雷实录 |
| `tasks/` | 任务档案：每个问题一个目录，prd.md 记「遇到什么问题/怎么解决/什么时候干的」 | `tasks/` 是进行中的，`tasks/archive/2026-XX/` 是完结的；按目录名搜主题 |
| `workspace/sunhao/journal-1.md` | 会话时间线（88 条，含 commit hash） | 按日期还原「某天做了什么、为什么」；`index.md` 是目录 |
| `CHANGES.md` | 跨会话广播位：四类事件一行一条（约定见 AGENTS.md） | **每个会话开工先 `tail -30`**；并行会话靠它互相同步 |
| `scripts/` | task.py / add_session.py / get_context.py | 见「命令速查」 |

**值得精读的代表性档案**（看「问题→排查→方案→验证」的完整回路）：

| 档案 | 能看到什么 |
| --- | --- |
| `tasks/brain-plugin/prd.md` | 最初 PRD：从「人格+记忆+情绪插件」一句话到现在的全部取舍起点 |
| `archive/2026-10/10-31-brain-learning-roadmap/` | 学习路线本身：认知科学/Agent 记忆/检索工程怎么映射到代码模块 |
| `archive/2026-11/11-02-llm-token-audit/` | 成本审计方法论：前缀缓存命中、history 拆离、输入有界——九项优化怎么来的 |
| `archive/2026-11/11-03-cost-growth-analysis/` | 长期成本建模：为什么 token 不发散、唯一增长项是什么 |
| `archive/2026-11/11-02-qqbot-nsfw-message-drop/` | 黑盒排查范例：QQ 平台 C2C 风控静默吞消息，怎么用「零事件死窗」定性 |
| `archive/2026-11/11-03-brain-roadmap-beyond-dsh/` | 演进路线决策：为什么先 HostAdapter 显式化、库导出优先于 MCP |
| `tasks/11-08-persona-switch-design/`（设计评估，进行中）+ `tasks/archive/2026-11/11-09-iteration-a-three-track/`（迭代A三轨落地） | 多人设切换：角色→人设两级、自我轨按 characterId 隔离、批次戳防切换错乱（看机制怎么定、怎么验的） |
| `archive/2026-11/10-31-two-day-trial-eval/` | 三天试运行复盘：实测数据怎么回流成迭代项 |

方法论要点（从档案里能读出来的开发思路）：**评测先行**（没有尺子不改架构）→ **小步上线**（每轮走查→部署→复盘）→ **一切皆档案**（讨论也存 prd）→ **约定沉淀回 spec**（踩过的坑写成下一条 spec 约定）。通用工作法见 `~/dev/code/vibe-coding/ai-workflow/PRINCIPLES.md`，本项目落点见根目录 `AI-WORKFLOW.md`。

## 五、命令速查

```bash
# 开发（在 dsh-qqbot-brain/ 下）
npm run typecheck     # tsc --noEmit
npm test              # node --test 单测
npm run eval          # 检索评测（BRAIN_EMBED_API_KEY=… 时对比向量路径）
npm run eval:prompt   # 人设/表达口径回归：工作区 vs HEAD（--base <ref> / --all / --case / --n），改 persona 或 channelStyle 后、部署前跑
npm run build         # 产物在 dist/（dist 不入库）

# 免 bot 预览脑图
node --experimental-strip-types demo/serve-demo.ts   # → http://127.0.0.1:4099/brain

# 部署（详见插件 README runbook）
scripts/deploy.sh <tag> [--dry-run]   # 门禁+成对备份+rsync+restart+探活+失败回滚（人设 PATCH 不含在内）
scripts/install-hooks.sh              # 新 clone 后装一次 pre-commit

# Trellis 档案
tail -30 .trellis/CHANGES.md                                    # 开工先扫：别的会话最近干了啥
python3 ./.trellis/scripts/task.py create "<标题>" --slug <名> -d "<描述>"
python3 ./.trellis/scripts/task.py archive <任务名>          # main 上直接做的加 --skip-branch-validation
python3 ./.trellis/scripts/add_session.py --title "<标题>" --commit <hash或-> --summary "<摘要>"
```

## 六、红线与约定

- **密钥不落 git**：`BRAIN_*` 环境变量、服务器 `cordis.patch.yml`、`~/.dsh/brain.env`（600）；`brain-data/` 与 `参赛材料/` 已 gitignore。
- **本仓库无真实数据**：生产全在 `ubuntu@124.222.65.169`（插件 `~/dsh-qqbot-brain/`、数据 `~/brain-data/`）；`demo/` 数据全虚构可公开。
- **改这些必须同步**（详见 `spec/backend/index.md`）：新增记忆 kind / JSONL op → types + distill + http + page 四处；改 mood 枚举 → prompt 文案 + page 桶表 + 测试；影响边集的 op → `graphVersion` 集合。
- **成本是一线约束**（详见 `AGENTS.md`「成本一线」）：新增 LLM 调用/注入 section 先过成本评估——输入有界、前缀缓存友好、可关闭、失败静默。
- **部署只动三样**：`dist`（不带尾斜杠）+ `package.json`（+ 首次 `cordis.patch.yml`），远端 patch 不覆盖；线上口令走 env。
- **脑图=全部写 API**：公网直连必须 token + 安全组限源 IP，不要裸奔。

---

*MAP 维护约定（见 AGENTS.md「MAP.md 保鲜」）：更新项目/添加功能/大幅改动时评估是否需同步本文件——新目录、新入口、新机制层、命令或部署方式变化必改；实现细节以源文件为准，MAP 不复述。*
