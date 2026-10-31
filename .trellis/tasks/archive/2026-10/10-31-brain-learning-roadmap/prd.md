# brain-learning-roadmap

> 存档约定：每次问题探讨都存档为 task——记录「遇到了什么问题 / 怎么解决的 / 什么时候干的」。本文件即本次探讨的存档。

## 问题存档

- **时间**：2026-10-31
- **遇到的问题**：想继续提升当前类脑架构并迭代，需要确定学习路线——是否需要学 transformer、神经网络等，以及其他没听过的学问。
- **本质定位**：本项目是 LLM 之上的**认知架构（cognitive architecture）/ Agent 记忆系统**，不是神经网络本身。LLM 是黑盒引擎，插件在它外面搭记忆/情绪/人格脚手架。因此 transformer/深度学习是选修，认知心理学、Agent 记忆系统、检索工程才是主线。

## 已有设计与正式理论的对应关系

| 现有实现 | 对应理论 |
|---|---|
| `score = α·cos + β·R + γ·imp` | Generative Agents (Park et al. 2023) 检索公式 relevance + recency + importance |
| `R = e^(-t/S)`、命中加 strength | 艾宾浩斯遗忘曲线 + ACT-R base-level activation 简化版 |
| episodic → semantic 巩固 | Tulving 记忆分层 + 系统巩固理论（complementary learning systems） |
| PAD 情绪三维 | 情感计算 Mehrabian 维度模型 |
| `kind='attitude'` 态度层 | 自我模型 / 特质记忆 |
| 字符 n-gram TF-IDF | 经典 IR 词袋检索 |

## Resolution（2026-10-31）

- **怎么解决的**：给出六阶段学习路线（按回报速度排序），纯讨论无代码变更。
- **什么时候干的**：2026-10-31 单次会话完成。

### 学习路线

1. **记忆科学基础**（最对口）：Anderson《认知心理学及其启示》；干扰理论（遗忘不只是衰减，还有前摄/倒摄干扰）、编码特异性、间隔效应；ACT-R base-level activation `B = ln(Σ t_k^(-d))` 是 strength 机制的正规版本
2. **LLM Agent 记忆论文**：Generative Agents（reflection/planning 是缺口）→ MemoryBank → MemGPT/Letta（分层记忆、自编辑）→ A-MEM（记忆关联网络/扩散激活）→ Zep/Graphiti（时序知识图谱）；综述 "A Survey on the Memory Mechanism of LLM-based Agents"
3. **检索工程**（retrieval.ts 升级路径）：dense embedding（字面→语义匹配，性价比最高的单点升级）→ BM25+embedding 混合检索（RRF）→ rerank → recall@k/MRR 指标；数学只需向量/内积/余弦（3Blue1Brown 线代本质）
4. **情感计算**（emotion.ts 升级路径）：PAD → OCC 评价理论（情绪=对事件的评价结果，解释"为什么"而非只描述"是什么"）→ 情绪调节
5. **评测先行**：LongMemEval、LoCoMo 基准；自建小评测集（对话历史→该唤起哪条记忆→命中率），没有尺子不改架构
6. **选修**：神经网络内功（微调 embedding / 理解 LLM 遗忘幻觉时才需要）——Karpathy《Neural Networks: Zero to Hero》

### 建议迭代顺序

1. 先建评测基线 → 2. 检索升级（TF-IDF→embedding 混合）→ 3. Reflection（巩固时生成高层洞察）→ 4. 记忆关联/扩散激活 → 5. 干扰式遗忘替代纯时间衰减 → 6. Prospective memory（承诺/提醒类新 kind）→ 7. OCC 情绪

## Key Decisions

- transformer/神经网络训练**不是**当前迭代的前置要求——架构改动发生在 prompt 组装、记忆流水、检索策略层，全部在 LLM 之外。
- 评测先行：改参数/改架构前先有可测量的命中率基线，否则迭代无据。

## Acceptance Criteria

- [x] 路线覆盖记忆科学、Agent 记忆系统、检索工程、情感计算、评测、NN 选修六个方向
- [x] 每个方向映射到具体代码模块与可落地的迭代点
