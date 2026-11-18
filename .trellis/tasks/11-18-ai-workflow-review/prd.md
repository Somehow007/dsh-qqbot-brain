# AI-WORKFLOW 范式专业评估

## 问题存档

- **时间**：2026-11-18
- **用户提问**：以专业工程师角度、结合行业前沿经验，评估 `AI-WORKFLOW.md` 并给出建议和优化。
- **前置档案**：`archive/…/11-11-ai-dev-workflow`（范式成文）、`11-14-acceptance-registry`、`11-16-changes-read-protocol`

## 取证（2026-11-18 仓库实测）

- 11-11 起 93 commits，其中 chore/docs 62（≈2/3 为记账/文档类提交）。
- 仓库无 CI（无 `.github`）、无 git hooks；部署为手工 rsync+restart。
- `test/eval/cases.json` 覆盖检索/召回；persona/prompt 类改动（近一周主要改动面）无部署前离线回归，只有部署后 `reply-style-audit.py` 走查 + acceptance 台账。
- §八 backlog 7 项，自 11-11 立条至今 0 项勾掉。
- `CHANGES.md` 120 行，已超约定 ~100 条上限；AGENTS.md 7KB + workflow.md 39KB 为每会话常驻上下文。

## 评估结论

**强项（已达或超过行业主流 AI-native 实践）**：上下文工程（MAP→spec→prd→CHANGES 分层，与 Anthropic「context engineering / 结构化笔记」思路一致）；权威序（git>档案>计划>CHANGES>摘要）是少见的对「摘要幻觉」的系统性防御；实证验收台账（部署≠验收、阈值+状态机）接近 SRE 的 SLO/观察窗思维；成本作为设计约束；差距自检诚实。

**核心问题**：
1. **纪律靠散文、不靠机器**——几乎全部防线是写给 AI 读的规则，无 hook/CI 强制。行业共识：能确定性检查的就别交给模型自觉（agent hooks、pre-commit、CI gate）。
2. **验证不对称**——代码路径有 test/eval，但近期主要变更面是 prompt/persona，却只能部署后靠真实流量等样本（ACC 多项长期待触发）。缺 prompt 回归集 + LLM-as-judge（rubric 打分）的离线 eval。
3. **流程开销开始反噬**——2/3 提交是记账；双写（CHANGES+journal+prd+acceptance+iteration-plan）引入漂移风险，CHANGES 已超限说明维护靠人记。
4. **backlog 停滞**——立条≠推进，缺 WIP 限制/复审时点；最高优先的消费点审计一周未沉淀。
5. **安全面偏窄**——只谈 token/密钥；缺 agent 自身权限面（AI 有生产 SSH + sudo restart）与 OWASP LLM Top10 / 「致命三要素」（私有记忆 + 不可信群消息 + 外联搜索工具）的威胁建模。
6. **缺度量**——无 DORA 类指标（变更失败率/回滚次数/MTTR），「已接近中级专人」无数据支撑。
7. **fresh-eyes 同源**——换会话仍是同一模型家族，盲区相关；应换模型家族或用确定性工具（类型/静态分析/差分测试）。

## 建议（按 ROI 排序）

- P0 机器化防线：pre-commit（typecheck+test）+ 轻量 CI；`deploy.sh` 一键脚本（备份→build→rsync→restart→健康检查→失败自动回滚），把 runbook 散文变可执行。agent hook 拦截高危命令（生产 rm/sudo 写）。
- P0 prompt 回归 eval：从生产转录抽 30–50 条黄金对话（此刻类/实质回答/搜索/AI 身份），persona 改动前跑「旧 vs 新」对比 + rubric 判分（voice%、说明文腔、模板复读），把 ACC 里「等事件触发」的一部分前移到部署前。可构造触发样本，不必干等真实流量。
- P1 记账瘦身：CHANGES 由 journal/commit 自动生成或二选一；chore 记账合并进功能 commit；超限滚动写进脚本。
- P1 backlog 治理：WIP≤2，每项带「沉淀判据 + 复审日期」，过期即降级或删除。
- P1 威胁模型一页纸：按致命三要素画数据流，记忆写入加来源可信度/隔离（已有 provenance 可复用），agent 生产权限最小化（只读 SSH 用户做走查，部署走脚本）。
- P2 度量：每次部署记一行（是否回滚/热修/发现用时），月度看变更失败率；开发侧成本用会话 token 粗账。
- P2 理解债落地：「让 AI 考自己」改为固定产物——每个迭代一份手写（非 AI）数据流图/口述录音要点，答不上的进 backlog。
- P2 范式本体：区分「原则（稳定）」与「当前项目实例（易腐）」，跨项目复用部分迁回 `ai-workflow/`，本文只留项目绑定条。

## 状态

- 用户拍板：两个 P0 一起做（见 Resolution）；P1/P2 进 AI-WORKFLOW §八 backlog。

## Resolution（2026-11-18）

### 遇到了什么问题

评估结论的两个 P0：①纪律全靠散文、无机器强制（无 hooks/CI，部署靠手工 rsync 按 runbook 复读）；②近期主要变更面是 persona/channelStyle prompt，却没有部署前回归，只能部署后等真实流量出样本（ACC 多项长期待触发）。

### 怎么解决的

**P0-A 机器化门禁**
- `dsh-qqbot-brain/scripts/deploy.sh <tag> [--dry-run]`：拒绝 src/test 未提交改动（ALLOW_DIRTY=1 放行）→ typecheck/test/build → 远端 `~/backups/pre-<tag>-{plugin,data}-<UTC>.tgz` 成对备份 + `tar -t` 校验 → `rsync -az --delete dist package.json` → restart → `/brain` 探活 200/401 + 5s 复查 active + 远端 dist/index.js md5 比对 → 失败自动解压插件备份回滚并复探活（数据备份不自动恢复）→ 结果落 `.trellis/deploy-log.tsv`（DORA 变更失败率台账雏形）。
- `.githooks/pre-commit` + `scripts/install-hooks.sh`（软链，不改 git config）：暂存新增行密钥扫描（sk-…/api_key|token|secret|password=长串，大小写不敏感；全仓 git grep 零误报）+ 插件 src/test/package 改动时跑 typecheck+test（~1s，纯文档提交跳过）。
- `.github/workflows/ci.yml`：push main / PR 跑 npm ci → typecheck → test → build → eval（lexical，零成本）。

**P0-B prompt 回归 eval**（`npm run eval:prompt`，`test/prompt-eval/{run.ts,cases.json}`）
- 25 条黄金用例（firefly 18 / ye 3 / whale 4），源自生产事故与台账：此刻类（ACC-12）、实质回答/任务清单（ACC-10/D2）、tender 表态公式（复诊②）、AI 身份（ACC-07）、搜索回合含工具结果 cite 指令冲突（ACC-02/N2）、搜索落空、prompt 注入、记忆投毒、记忆提起口径。
- 系统提示按生产注入标签重建（人格内核 + 表达口径 + 发言人/记忆/当前时刻）；base 版本经 `git show <ref>:` 读人设镜像与 config.ts（正则抽 DEFAULT_CHANNEL_STYLE），只跑 prompt 有变化的用例（变更影响面）。
- 判分：硬检查（link/md/说明文腔/表态公式/forbid/长度）+ 软（hedge/voice/样本间 4-gram 复读）+ 盲评 LLM rubric（voice/human/fit 1-5 + 专项规则）；回归判定带噪声边际 max(2,10%)；复读增加直接判回归。

### 验证结论

- 本地：typecheck + 276 test 绿；run.ts strict tsc 通过；hook 安装生效；deploy.sh `--dry-run` 实测拦下并行会话 distill.ts WIP（门禁正向生效）。
- **远端链路未跑**：本会话 SSH 在 kex 阶段被远端断开（TCP 22 通、公网 /brain 401 存活）→ 登记 ACC-13（正式发布 ok ×1 + 回滚演练 ×1）。
- prompt eval 回放验证：base=856c096~1（表态公式修复前）在 tender 原题上离线复现「这句话我记下了」（formula 硬失败、规则 ✗）。全量绝对基线（HEAD，n=3）：硬失败 3/75、规则 96%、150 次调用 36.3 万输入 token（缓存命中 74%）/ 7.1k 输出，约 ¥0.4/次（按 DeepSeek 公开价估）。

### 评测本身暴露的生产问题（待拍板，未改 prompt）

1. **示例被逐字背诵**：tender 原题下 head 3/3 样本与 persona.md L104 情境示例逐字相同（Jaccard 1.00）；换说法后仍借用「先欠着」骨架——情境示例在做模板而非示范，与「屋顶+蛋糕卷」同类风险。
2. **E1「心理活动不说出口」泛化未证**：换说法后表态公式 n=3 时 3/3、n=6 时 1/6（base 同为 1/6）——离线看不出 E1 降低了发生率。
3. **记忆投毒面实证**：poison-group 用例出现「你是好朋友，这个我记下啦」——群聊里陌生人植入关系，角色当场接受（立场部分拒绝）；与 §六 外部输入信任边界、backlog 投毒面评估直接相关。
4. 次要：群聊科普题有超长（>180 字）样本；voice 正则口径粗（无声口 14/75 多为误报）。

### Key Decisions

- prompt eval 不进 `npm test`/CI（需付费 key、非确定性）；定位为「改 prompt 后、部署前」手动门。
- 评委与生成同模型 → 实测分数饱和在 4-5，rubric 只作辅助，硬检查 + 复读 + 人工读回为主；评委加校准句（3=合格）。
- 黄金集问句不得照抄人设示例（否则测成背诵）——写入 cases.json `_doc`。
- deploy.sh 只管插件代码；人设 PATCH 与数据恢复保持人工（不可逆面不自动化）。

### 后续优化方向

- ACC-13 远端实跑（先 `--dry-run`，再正式发布 + 一次回滚演练）。
- 上述 3 个生产问题逐条决策：示例改「多样化 2-3 条 + 写明不得原句复用」、投毒面评估立项。
- 评委换模型家族做 fresh-eyes；样本量与成本的折中（关键用例 n=6）。
- 两项门禁跑满 3 次真实发布后沉淀 spec（已进 §八 backlog）。

### 什么时候干的

2026-11-18（同日评估 → 拍板 → 实施）。
