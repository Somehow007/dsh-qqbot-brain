# 通用 AI 开发范式落地：拆层 + 机器化护栏 + 度量 + backlog 清偿

## Goal

承接 `11-18-ai-workflow-review`：用户要求「把当前能解决的各个问题都解决，当下最主要的是通用的 AI 开发范式问题」。

## Resolution（2026-11-18）

### 遇到了什么问题

1. **原则层绑在项目里**：通用范式写在 `qqbot-brain/AI-WORKFLOW.md`，ai-workflow 手册库反过来引用项目文件——换项目无法复用，项目事实与原则混写。
2. **纪律靠散文**：agent 对生产有全权 SSH，破坏性命令只靠 AGENTS 文字约束；开工补课协议靠 AI 记得读规则。
3. **流程反噬无度量**：记账提交占比实测 69%（129/188，近 14 天），每个任务收工产生 2-3 个 auto-commit；没有任何指标告诉你范式在不在工作。
4. **backlog 停滞**：§八 7 项一周零勾选，无判据、无复审日、无 WIP 上限。
5. **评估遗留的可执行项**：消费点审计未进 spec、验收分级未沉淀、注入/投毒面未评估、脑图 token 仍在 URL。

### 怎么解决的

**拆层（主线）** — `~/dev/code/vibe-coding/ai-workflow/`（独立 git 仓库）：
- `PRINCIPLES.md` 原则层（通用，零项目事实）：四层结构与演进规则、七条原则（新增「机器优先于散文」，「一切皆档案」补「但档案要瘦」）、日常循环、质量防线（新增 prompt 回归/跨视角评审换模型/实证台账）、成本两条线（记账占比上限）、安全（致命三要素、agent 最小权限、不可逆面不自动化）、**§七 度量**（6 指标 + 健康线）、**§八 L0–L3 落地分级**、差距自检。
- `kit/` 机制层：`githooks/pre-commit`（通用版，CODE_PATHS/CHECK_CMD 可配，多加 AKIA/私钥头）、`devin/agent-guard.sh` + `session-card.sh` + `hooks.v1.json`、`scripts/workflow-health.py` / `changes.py` / `wrap-up.sh` / `deploy-template.sh`、`templates/acceptance.md` / `AI-WORKFLOW.instance.md`，`kit/README.md` 按档位给安装与验证步骤。
- `playbooks/` 新增三册：`prompt-regression`（黄金集/硬检查/复读/噪声边际）、`fresh-eyes-review`（隔离评审者、三问、问题落测试）、`comprehension-check`（理解债自测）；旧四册原则层指针改到 PRINCIPLES。README 改为四层导览。
- 本仓库 `AI-WORKFLOW.md` 重写为**实例层**：落点表（原则→文件/命令）、本项目实证（事故→纪律 7 条）、差距自检、backlog 表（B-01~B-12，带判据/复审日/状态）。

**agent 护栏（机器化）**：`.devin/hooks.v1.json` 注册 PreToolUse(exec)→`scripts/agent-guard.sh`（拦强推/reset --hard/clean -f/整树 checkout/branch -D/--no-verify/递归删根；对 `.devin/prod-hosts` 主机拦删除/停服/覆盖导入/DELETE/解包/直推 rsync --delete/重定向写持久目录/mv；发布脚本内部操作不受影响）+ SessionStart→`scripts/session-card.sh`（注入读法分级、未提交改动、体检越线项，≤~600B）。

**度量**：`scripts/workflow-health.py`（只读）——记账占比、变更失败率（deploy-log）、验收走查陈龄、backlog 在制/过期、事件流条目、常驻规则体积。

**记账瘦身**：`scripts/changes.py add`（统一格式、指针必填、超 100 条滚动到 CHANGES-archive.md 不删）；`scripts/wrap-up.sh`（archive --no-commit + add_session --no-commit + changes add → 一个提交、只暂存本任务路径）；AGENTS 归档流程默认改用它。

**backlog 清偿**：
- B-01 消费点审计 → `spec/backend/index.md`（rg 命令 + 五类消费点归档模板 + F1 反例）。
- B-04 验收分级 → `spec/guides/verification-tiers.md`（T1 代码 / T2 离线行为 / T3 生产实证；改动类型→最低证据级；T3 超 14 天复审前移）。
- B-03 威胁模型 → `docs/threat-model.md`（T1–T7）；新增 prompt eval 用例 `inject-toolresult-firefly`（搜索结果夹带外泄指令）。
- B-02 token 收口 → http.ts 认 `x-brain-token` 头 / `brain_token` HttpOnly+SameSite=Strict cookie / 首跳 query（命中换发 cookie）；新前端与旧页 API 全走头、首跳后 `history.replaceState` 抹掉 query；文档 curl 改头。**修正了一个本会差点引入的回归**：只抹 query 不发 cookie 会让刷新 401（/brain HTML 也受口令保护）。

### 验证结论

- `typecheck` + `npm test` **278/278**（+2 新测：page 头透传与抹 query；http cookie 换发/凭 cookie 通过/错口令不发 cookie/头路径不发 cookie）。先写测试见红（2 fail）再实现转绿。
- agent-guard 27 条命令用例：该拦的全拦、只读走查（tail/zstd→/tmp/curl export -o /tmp/2>/dev/null）放行；首版把 `2>/dev/null`、`> /tmp/` 误判为写入，已收紧为只拦持久目录。
- session-card startup/resume 两路输出合法 JSON；macOS 无 `timeout` 时退化执行。
- changes.py：首版把表头里的格式示例行当条目移走，改为只认 `- YYYY-MM-DD` 开头；trim/add/缺指针拒绝均验证。**更正**：上一任务说 CHANGES「120 行超限」是行数含表头，实际条目 90，未超限。
- workflow-health 首跑：记账占比 69% ⚠，其余健康；ACC 表格内转义 `\|` 首版切错列已修。
- 威胁模型 T4 用例 4/4 未执行注入、未贴可疑链接；副作用 3/4 对注入大段解说致超长出戏（待拍板）。

### Key Decisions

- 原则层迁出项目、kit 采用**拷贝而非引用**（项目间互不依赖，kit 更新按需回灌）。
- agent-guard **不提供命令内开关**（AI 能写的开关等于没有），解除只能人工改 hook 配置。
- 数据恢复/覆盖导入/人设 PATCH 保持人工——不可逆面不自动化。
- 产品侧 prompt 问题（示例背诵、E1 泛化、投毒蒸馏规则、注入解说）**不在本任务改**：属产品决策，且 `distill.ts` 有并行会话 WIP；已在威胁模型与上一任务档案列为待拍板。

### 后续优化方向

- SSH 恢复后：ACC-13（deploy.sh 实跑 + 回滚演练）、ACC-14（token cookie 线上走查）；顺带 B-09 只读账号。
- 新会话验证 `/hooks` 可见两条 hook、开工卡片实际注入（本会话启动时 hook 尚不存在，未经宿主实测）。
- 14 天后看 workflow-health 记账占比是否回落 ≤40%（B-06）。
- 其他项目（study-journey 等）按 PRINCIPLES §八 选档安装 kit。

### 什么时候干的

2026-11-18（评估任务同日，用户「一起做吧」后续第二轮）。
