# 记忆/人格迭代升级方案设计

> 方案设计存档。交付物 = `iteration-plan.md`（分迭代路线图 + 验收标准 + 数据走查）。

## 问题存档

- **时间**：2026-11-09
- **需求**：两轮调研（记忆架构三家 + 人格方案/陪伴形态）完成后，用户要一份「合理稳步推进」的迭代升级方案——整合调研借鉴清单、人设切换设计（11-08）、叶瞬光人设包（11-07）、companion 评估（11-09）；方案要带验收标准与数据走查测试；人设切换+叶瞬光若可行应纳入，落地后部署云服务器供用户自测。
- **怎么解决的**：通读两轮调研报告全文 + 11-08/11-09-companion 两份进行中设计 + 全量内核源码走查（types/store/retrieval/distill/emotion/index/http/config/inject/prompt，~4.3k 行）→ 按「地基先行、companion 前置能力靠后、小步可回滚」原则产出七迭代路线图（A-G），每迭代含改动锚点、验收标准、云端数据走查命令、成本与回滚。

## 输入档案

- `archive/2026-11/11-09-memory-persona-arch-research/`：memory-arch-survey.md + persona-companion-survey.md（合并借鉴清单 10 条，最高优先=主动召回+prospective memory）
- `tasks/11-08-persona-switch-design`：P0-P3 分级 + 走查修正点 7 条 + 待确认 A/B（attitude 角色级 vs 人设级）
- `tasks/11-07-ye-shunguang-persona` + `personas/ye-shunguang/`：人设包就绪（persona.md + seed-export.json 28 条 + 生成器）
- `tasks/11-09-companion-agent-eval`：companion MVP 形态已定（web 1-on-1、天级壳层、第二 deployment）

## 方案要点（详见 iteration-plan.md）

- **迭代 A**：人设切换地基——`MemoryNote.self` + `PersonaEntry.characterId` 两级三轨、情绪按角色隔离、蒸馏批次戳、attitude 角色级归并迁移
- **迭代 B**：叶瞬光接入——种子 self 标记 + merge 导入 + 激活冒烟 + 云端走查（用户最早可自测的里程碑）
- **迭代 C**：`Brain.search` 主动召回原语 + recall-intent 门控（companion 前置①）
- **迭代 D**：standing intents（prospective memory）+ Turn provenance/session-kind（companion 前置②③）
- **迭代 E**：五个储备小项（entity boost/BFS-lite/双时态/dreaming/USER.md），按 eval 信号取用不预做
- **迭代 F**：companion 壳层 MVP——另立任务，本方案只标依赖
- **迭代 G**：体验层/通用化小项（品牌跟人设、pack API、播种通用化等），穿插不排期

## Acceptance Criteria

- [x] 方案覆盖调研借鉴清单全部 10 条（每条有明确落点迭代）
- [x] 人设切换 P0 与叶瞬光接入纳入且排序合理（A→B 依赖关系正确：self 轨先于种子灌入）
- [x] 每迭代含验收标准 + 可执行的数据走查（curl/命令级，非「看起来对」）
- [x] 遵守成本一线与不为 hypothetical 铺面（LLM 新增逐项过成本；companion 能力只落内核原语）
- [x] 待用户决策点显式列出（attitude 粒度、迭代顺序、MOODS 方案、companion 排期、aspiration 取舍）
- [x] attitude 粒度已由用户拍板：**角色级**（2026-11-09，方案 §2.3/§10 已更新）

## Resolution（YYYY-MM-DD 待归档时补）

## Key Decisions

- **方案形态**：单文档路线图而非多 task 预建——每迭代落地时另建 task 走 Trellis 流程，本任务只交付方案本身。
- **排序逻辑**：A（地基）→B（可玩里程碑）→C/D（companion 前置，互不阻塞可随后）→E（储备按需）→F（另立任务）。用户自测价值最早在 B 兑现。
