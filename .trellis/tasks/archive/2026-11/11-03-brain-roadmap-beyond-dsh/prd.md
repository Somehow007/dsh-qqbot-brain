# brain 跳出 dsh 的演进路线讨论

## 背景 / 问题

用户提问：当前插件只做 dsh 未免暴殄天物；现在继续服务 dsh 并迭代调优，那以后怎么发展？

纯讨论任务，不改代码。前置档案：`archive/2026-10/10-31-harness-portability`（耦合面分层 + 四档移植判断 + WorkBuddy 调研 + MCP sidecar 结论）。

## 问题重框：资产 vs 宿主

「dsh 插件」只是形态，项目真正沉淀的是三层可迁移资产：

1. **认知架构内核**——`src/brain/` ~2774 行（store/distill/retrieval/decay/emotion/embed/identity/time），零 ctx/Cordis 引用，宿主无关；已被真实数据验证（recall@topK 100%、D3 试运行复盘）
2. **工程方法论**——eval 评测集、token 审计方法、brain.jsonl ops 流水可审计重放、脑图可观测 + 管理面（线上清洗实战验证过「可观测+可管理」）
3. **dsh 是第一个 deployment**——角色应是「参考宿主 / 试验田」：新机制先在 dsh 验证，再下沉 core

结论框架：演进方向 = 从「dsh 的插件」变成「dsh 是 brain 的宿主之一」。

## 分阶段路线

### H1 现在—近期：dsh 迭代照旧，解耦动作顺手做

日常候选不变（webserver-shim 合入、管理面 CAS、Reflection、攒批/personaDigest A/B、扩散激活、主动开口）。把四件解耦小事融进日常迭代，不另立项目：

- `parseSenderTag` 发言人格式参数化（换适配器前提；已记档为后续方向）
- 蒸馏 fetch → provider 接口抽象（接非 OpenAI 形态 API 前提）
- capture/inject 收束成显式 HostAdapter 接口——现在「~300 行胶水」是隐式边界，变成显式契约后第二宿主才有落点
- 补 `/api/ingest` + `/api/assemble` 两端点——HTTP API 面已很全（query/notes/profiles/persona/export/import/ops/dedup/consolidate），就差这对；补上后任何能发 HTTP 的 harness 可接

### H2 中期：brain 三种脱离 dsh 的形态

共享同一组 API 语义（recall / ingest / assemble），三种封装：

| 形态 | 价值保留 | 成本 | 判断 |
| --- | --- | --- | --- |
| HTTP sidecar | 中——注入文本由宿主塞 prompt，能保住人格/情绪若宿主配合 | 低（补两端点即成） | 最通用、语言无关，建议先做 |
| npm 库 `@brain/core` | **高**——宿主内嵌调用 assemble，完整保留注入能力 | 中（包切分+发布） | 「暴殄天物」最直接的解；src/brain 本就零耦合 |
| MCP 壳 | 低——退化为模型按需工具调用，人格/情绪/归因基本丢 | 低（薄封装 HTTP 语义） | 生态最广（WorkBuddy/Claude Code/一切 MCP harness），但已知是降级；放最后 |

### H3 远期：平台与场景

- **一脑多身**：一个 brain 实例服务多 persona/多群/多端，记忆 namespace 隔离——与现有 openid 碎片化问题同构（同一实体多标识归并）
- **陪伴形态泛化**：prospective memory + reflection + 主动开口补齐后，产品形态从「QQ bot」变「有延续性的数字存在」→ Discord/Telegram/语音陪伴等；Discord/TG 天然更适配（发言人字段结构化，不需 parseSenderTag 抠文本）
- **可观测性是差异化护城河**：脑图 + ops 重放 + eval 组合，市面 memory 方案（mem0/MemGPT 类）大多没有；开源/对外时这是卖点而非 QQ 对接
- **若开源**：定位不是「又一个 memory 插件」，是「认知架构 + 可审计 + 中文群聊实战数据」

## 诚实约束（别只画饼）

- **场景 > 技术**：WorkBuddy 教训——「@才触发的任务派发 agent」撑不起常驻陪伴场景，brain 价值折半。每接一个宿主先过场景筛查：该宿主上的 bot 是不是「常驻群友」形态？
- **sidecar 是降级不是等价**：prompt 注入是灵魂；MCP 工具召回版会失去「人格不漂移」核心卖点。价值排序：库模式 > HTTP sidecar > MCP。
- **dsh 始终 first-class**：新机制先在 dsh 验证再下沉；core API 未稳前不铺第二宿主，否则维护面翻倍收益减半。
- **生态依赖成本**：dsh/官方适配器自身在演进（host-session-reset 已踩坑），多宿主 = 多套适配层跟上游。

## 建议顺序

1. 解耦四小事融进 dsh 日常迭代（零额外项目）
2. 补 `/api/ingest` + `/api/assemble` → brain 获得「任何 HTTP harness 可接」形态，同时强制 HostAdapter 显式化（一石二鸟）
3. 库导出 → MCP 薄壳；至此「dsh 插件」→「dsh 是 brain 的参考宿主」
4. 远期按场景选宿主：哪里有常驻陪伴需求接哪里，Discord/Telegram 是天然候选

一句话：**dsh 插件 → brain-as-a-library/sidecar（宿主无关的记忆人格内核）→ 一脑多身的陪伴基础设施；dsh 从唯一宿主变成 reference deployment。**

## Resolution（2026-11-03）

**遇到了什么问题**：需要回答「插件只做 dsh 是否局限、后续怎么发展」——本质是把项目资产与 dsh 宿主形态解绑，给出可执行的演进路径。

**怎么解决的**：复用 10-31-harness-portability 的耦合面结论（插件壳层不可移植 / 适配层约定可参数化 / brain 内核宿主无关），核对当前 HTTP API 面（已有 query/notes/profiles 等 15+ 端点，缺 ingest/assemble），按「资产→形态→场景」三层展开：先框定真正资产是认知架构+工程方法论而非插件形态，再给出 H1 顺手解耦→H2 三形态→H3 平台化的路线，并列出场景筛查、sidecar 退化、dsh first-class、生态依赖四条诚实约束。

**后续优化方向**：H1 四件解耦小事可拆成独立任务落地（发言人格式参数化、provider 抽象、HostAdapter 显式化、ingest/assemble 端点）；H2 形态选择取决于「下一个真实需求出现在哪个宿主」——不要为 hypothetical 宿主提前铺面。

**什么时候干的**：2026-11-03，单会话讨论留档。

**Key Decisions**：① 价值排序定为 库模式 > HTTP sidecar > MCP（按注入能力保留度排序，不按接入便利性）；② 演进前提是 HostAdapter 显式化——把隐式的 ~300 行胶水边界变成契约；③ dsh 永久 first-class，多宿主建立在 core API 稳定之后；④ 每接一个宿主先过「常驻陪伴场景」筛查，继承 WorkBuddy 调研教训。
