# AI-WORKFLOW · qqbot-brain 实例层

> **原则不在这里复述**：通用范式（七条原则 / 质量防线 / 成本 / 安全 / 度量 / 落地分级）见 `~/dev/code/vibe-coding/ai-workflow/PRINCIPLES.md`，可复制机制见同目录 `kit/`，场景手册见 `playbooks/`。
>
> 本文只记三件事：原则在本项目的**落点**、本项目的**实证**（事故 → 长出的纪律）、**待补 backlog**。新纪律先在 §四 立条，跑通后通用部分上提到 `ai-workflow/`，项目部分沉淀进 `.trellis/spec/`。
>
> 体检：`scripts/workflow-health.py`（开工卡片自动带越线项）。

## 一、落点表（档位 L3）

| 原则 / 防线 | 本项目落点 | 档 |
| --- | --- | --- |
| 上下文工程 · 权威序 | `MAP.md` → `.trellis/spec/` → task prd → `.trellis/CHANGES.md`；开工卡片（SessionStart hook）注入读法 | L0 |
| 档案要瘦 | `scripts/changes.py add`（统一格式 + 超 100 条滚动归档）；`scripts/wrap-up.sh`（归档 + journal + 事件流 = 一个提交） | L0 |
| 门禁机器化 | `.githooks/pre-commit`（密钥扫描 + 插件改动跑 typecheck/test）· `.github/workflows/ci.yml` | L1 |
| agent 最小权限 | `.devin/hooks.v1.json` → `scripts/agent-guard.sh`（主机表 `.devin/prod-hosts`） | L1 |
| 发布走脚本 | `dsh-qqbot-brain/scripts/deploy.sh`（拒脏工作区 / 成对备份 / 探活 / 自动回滚）→ `.trellis/deploy-log.tsv` | L2 |
| 部署 ≠ 验收 | `.trellis/acceptance.md`；分级口径 `.trellis/spec/guides/verification-tiers.md` | L2 |
| eval 先行 | `npm run eval`（检索，零成本，进 CI） | L3 |
| prompt 回归 | `npm run eval:prompt`（人设 / 口径，付费 key，部署前手动） | L3 |
| 消费点审计 | `.trellis/spec/backend/index.md`「消费点审计」 | L3 |
| 外部输入信任边界 | `docs/threat-model.md` | L3 |
| 成本一线（运行时） | `AGENTS.md`「成本一线」+ README「成本透明」 | — |

## 二、本项目实证（事故 → 纪律）

- **11-10 消费点漏传导**：迭代 A 加 `self` 轨，语义巩固这条消费路径没跟上 → F1 跨轨污染风险 → 「消费点审计」（`tasks/archive/2026-11/11-10-consolidate-track-gaps`）。
- **11-15 事件流截断误判**：新会话凭旧摘要 + `tail -30` 误判迭代 A 未做，险些重做 → 读法分级 + 上下文权威序；11-18 起由开工卡片自动提示（`tasks/archive/2026-11/11-16-changes-read-protocol`）。
- **11-14 部署 ≠ 验收**：多个修复上线后无样本可证 → 实证验收台账（`tasks/11-14-acceptance-registry`）。
- **真实流量抓污染**：群友日常聊天抓出蒸馏主体错配、画像串角色等合成测试覆盖不了的问题 → 真实信号走查常态化。
- **11-18 流程反噬**：近 14 天记账类提交 69%（129/188）；无 CI/hook；发布靠复读 runbook → 机器化门禁 + 记账合并（`tasks/archive/2026-11/11-18-ai-workflow-review`）。
- **11-18 prompt 回归首跑**：离线复现 11-17 修复前的「这句话我记下了」；暴露情境示例被逐字背诵、E1 修复泛化未证、群聊记忆投毒被当场接受 → 用例问句不抄示例、噪声边际、威胁模型（同上 + `docs/threat-model.md`）。
- **11-18 并行会话 WIP**：发布门禁实测拦下另一会话未提交的 `distill.ts` → 发布脚本默认拒脏工作区；开工卡片列出未提交改动。

## 三、差距自检（本项目）

| 维度 | 现状 | 差距 |
| --- | --- | --- |
| 产出纪律 | 门禁 / 发布脚本 / 回滚 / ops 审计 / 成本核算 | 发布脚本未在生产实跑（ACC-13） |
| 第一手理解深度 | AI 产出为主 | 理解债自测未跑过（B-11） |
| 团队尺度经验 | 单人项目 | 被人 review、on-call、跨人 API 契约——无样本 |
| 长时维护 | 项目两月余 | 依赖升级 / CVE 响应——无样本 |

## 四、待补纪律 backlog

> 治理：进行中 ≤ 2；每项有沉淀判据与复审日；过复审日未推进 → 删除、降级或重排期。`scripts/workflow-health.py` 按本表计数。

| ID | 条目 | 沉淀判据 | 复审日 | 状态 |
| --- | --- | --- | --- | --- |
| B-01 | 消费点审计进 spec | 写入 `spec/backend/index.md` 并给出可执行清单 | 2026-11-18 | 已完成（11-18） |
| B-02 | 脑图 token 收口 header | API 全走 `x-brain-token`；首跳 `?token=` 读后抹掉；文档 curl 改 header | 2026-11-18 | 已完成（11-18，待随下次发布上线） |
| B-03 | 注入 / 记忆投毒面评估 | 出威胁模型 + 至少 2 条 prompt eval 安全用例 | 2026-11-18 | 已完成（11-18，`docs/threat-model.md`；防护改动待拍板） |
| B-04 | 验收证据分级沉淀 | 台账跑满 ≥4 次走查后写成 spec 指南 | 2026-11-18 | 已完成（11-18，`spec/guides/verification-tiers.md`） |
| B-05 | 人设「此刻感」条款沉淀 | ACC-12 通过后推广 ye/whale 并写 spec | 2026-12-02 | 进行中 |
| B-06 | 记账瘦身见效 | 改用 `wrap-up.sh` 后近 14 天记账占比 ≤ 40% | 2026-12-02 | 进行中 |
| B-07 | 机器化门禁与 prompt 回归沉淀 spec | 3 次真实发布走 deploy.sh、2 次 prompt 改动跑过 eval:prompt | 2026-12-09 | 进行中（11-19：deploy ok+rolled-back 各 1、eval:prompt 已跑 4 轮；ACC-13 已通过） |
| B-08 | 跨视角评审节奏 | 下个迭代上线前按 `playbooks/fresh-eyes-review.md` 跑一次并存档 | 2026-12-09 | 待办 |
| B-09 | agent 生产只读账号 | 走查改用只读 SSH 用户；写操作只剩 deploy.sh | 2026-12-09 | 已完成（11-19，`brain-ro@` 已建并实测只读；走查约定进 AGENTS.md） |
| B-10 | 开发侧 token 成本粗账 | 连续 5 个会话记录用量，按任务类型给出量级 | 2026-12-09 | 待办 |
| B-11 | 理解债自测 | 按 `playbooks/comprehension-check.md` 考一次蒸馏写路径并存档错题 | 2026-12-02 | 待办 |
| B-12 | 常驻规则体积预算 | `AGENTS.md` + `workflow.md` ≤ 50KB 持续不越线（11-18：45KB） | 2026-12-16 | 待办 |
