# 为什么自研认知层而不用 LangGraph/Dify 等框架

## 问题存档

- **时间**：2026-11-08
- **需求**：用户提问「为什么不用框架而用自研？和 LangGraph/Dify 有什么关系？」——承接 11-08-resume-kit 的后续项（面试被问「为什么不用现成框架」时如何答）。纯讨论任务，不改代码。
- **怎么解决的**：核对代码事实（cordis/dsh 插件壳、src/brain 零宿主引用、注入分段与 prompt 缓存策略、零运行时依赖）+ 复用 archive/2026-11/11-03-brain-roadmap-beyond-dsh 的宿主无关演进结论，给出分层对比与面试话术。

## 结论

### 前提澄清：并非「不用框架」

项目本身就长在框架上：dsh/cordis 提供插件生命周期、事件总线（`session/event`/`turn/end`/`system-prompt/assemble`）、DI（`inject`）、webServer 挂载。自研的只是框架不给的认知层 `src/brain/`（~2.8k 行，零 ctx 引用）。「自研 vs 框架」的正确问法是：认知/记忆层为什么不站在 LangGraph/Dify 上。

### 层次定位：LangGraph/Dify 解决的不是这件事

- **LangGraph = Agent 编排层**：组织 plan→tool→observe 状态图。本项目无 agent loop 要编排（调用时机归宿主 dsh），brain 管的是「调之前往 context 放什么」——正交。
- **Dify = 低代码应用平台**：用它等于放弃 QQ/dsh 宿主生态整体重建；其 memory 为会话变量+知识库，无遗忘曲线/多 persona/群聊发言人归因。
- **真正同层的对标**是 mem0、MemGPT/Letta、LangMem 等 memory 框架——面试对齐它们而非 LangGraph。差异化：①遗忘曲线 `R=e^(-t/S)`+命中强化 S+1；②群聊发言人归因+态度记忆；③ops jsonl 可重放+脑图可观测；④真实群聊生产数据验证。

### 自研理由

1. **评分公式与注入粒度是产品本身**：prompt 前缀缓存优化要求按稳定性分段，易变段刻意排在官方 persona-suffix 10200 之后保缓存命中（README 原理节）——逐字节控制 prompt，框架会抽象掉。
2. **工程约束**：`dsh plugin add` 装进宿主进程，零运行时依赖 = 无版本冲突、rsync 部署轻、攻击面小。
3. **算法体量小**：hybrid retrieval / decay / event sourcing 各几十到几百行，引 LangChain 属杀鸡用牛刀。
4. **可审计性是卖点**：ops 可重放、export/import 配对迁移——自研存储才给得出。
5. **演进方向宿主无关**（11-03 roadmap）：`src/brain/` 零 ctx 引用，将来做成 library/sidecar 时框架依赖反而是包袱。

### 与 LangGraph/Dify 的关系：互补，不是竞争

LangGraph/Dify 管「怎么调模型、按什么流程调」，brain 管「调用时模型看见什么」。可叠用：LangGraph 某 node 内调 `brain.assemble()`，brain 即该 node 的记忆供给方；roadmap 规划的 `/api/ingest`+`/api/assemble` 端点与 MCP 薄壳即为「被任何框架消费」准备的形态。

### 面试 30 秒话术

> 「这项目不是不用框架——它本身就是 dsh/cordis 插件，框架负责宿主生命周期。自研的是框架不给的记忆认知层：遗忘曲线、发言人归因、prompt 注入粒度，这些就是产品本身，且要求零依赖装进宿主进程。LangGraph/Dify 解决的是 agent 编排，和我这层正交；同层对标是 mem0/MemGPT，差异在审计可重放和群聊归因。将来也可做成 sidecar 被 LangGraph 节点消费。」

诚实弱点（聊点手册已有对应讲法）：无生态集成、embedding/检索手写无向量库、规模未经压测。

## Resolution（2026-11-08）

**遇到了什么问题**：需要回答「为什么自研而不用 LangGraph/Dify、三者什么关系」——本质是厘清项目的层次定位，给面试「为什么不用现成框架」备好有依据的答案。

**怎么解决的**：先纠偏前提（项目长在 cordis/dsh 框架上，自研的只是认知层）；再按「编排层 vs 记忆认知层」划界——LangGraph/Dify 解决的是调用编排/应用搭建，与 brain 正交，真正同层对标是 mem0/MemGPT 类；归纳五条自研理由（注入粒度即产品、零依赖插件约束、算法体量小、审计可重放、宿主无关演进）；给出互补关系（可被 LangGraph node / sidecar / MCP 消费）与 30 秒面试话术。

**后续优化方向**：如 11-08-resume-kit 所记，可补 LangGraph/Dify 实际上手体验（搭个小 demo），把「我了解过」落到实处；若将来做 `/api/ingest`+`/api/assemble` 端点，「被 LangGraph 消费」从话术变成实证。

**什么时候干的**：2026-11-08，单会话讨论留档。

**Key Decisions**：① 面试对齐对象定为 mem0/MemGPT 类 memory 框架而非 LangGraph（层次不同）；② 与 LangGraph/Dify 的关系定为互补可叠用，不自陷「二选一」话术；③ 保留「框架负责宿主、自研负责认知层」这一核心叙事。
