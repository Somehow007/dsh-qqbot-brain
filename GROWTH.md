# GROWTH · 个人成长手册

> **这份文件是给「我」用的，不是给 AI 用的开发文档。**
>
> 四个用途：**面试投简历 · 学习理解业务 · 提升设计水平 · 深入理解 Agent 开发与 brain 项目设计思想**。
>
> **分工**：`求职材料/` = 对外成品（可直接贴简历 / 面试讲）；`.trellis/tasks/` = 过程档案（问题→排查→方案→验证）；`README.md` / `MAP.md` = 项目门面与导航；**本文件 = 认知沉淀**——把分散在各处的「为什么这么定、学到了什么、还想搞懂什么」收敛成一张为自己服务的地图。

## 〇、当前阶段全景（2026-11-20 快照）

**阶段判断**：首轮核心能力建设已验证——迭代 A–E6 + 脑图 UI 重构 + 声口工程四轮修复全部上线，实证验收台账 ACC-01~16 在册。项目处于「加固收尾 × 选择第二曲线」的交界，问题收敛于**身份、边界、评测**三条线。

**四条在讨论的方向**（2026-11-19 全景梳理）：

| 方向 | 内容 | 依赖 / 状态 |
| --- | --- | --- |
| 在途收尾与排序 | 身份层战役 → webserver-shim 合入 → 管理面 CAS | 身份层是其余两线的共同前置 |
| 认知深化 | Reflection、扩散激活、双时态、干扰式遗忘、dreaming pass | 卡在评测缺口（人格漂移/注入质量无系统度量） |
| 跳出 dsh | HostAdapter 显式化 → /api/ingest+assemble → @brain/core → HTTP sidecar → MCP 薄壳 | 路线已定（11-03），dsh 永远 first-class |
| 陪伴形态 | engram 壳层 → 主动开口 → 一脑多身 → 第二宿主 | engram 已 bootstrap、slice1 代码完成未部署 |

**建议节奏**：先完成已验证事项的收尾 → 打身份层战役 → Reflection 或 HostAdapter 二选一开主战役；meme 情绪桶 / 管理面 CAS / 成本 A/B 作穿插小任务；主动开口与多宿主暂列远期。

指针：`.trellis/tasks/11-09-iteration-upgrade-plan/iteration-plan.md` · `engram/` · `.trellis/acceptance.md`

---

## 一、项目叙事主线（面试 30 秒 → 深聊版）

### 1.1 一句话定位

> 给官方 QQ Bot 外挂一颗「脑」：不改模型权重、不 fork 官方包，用人格内核 + 分层遗忘记忆 + 情绪/态度模型，把一个无状态的聊天机器人养成有延续性的群友。

### 1.2 核心命题（这个项目在验证什么）

**只靠厂商 API（不动权重、不做微调），LLM 聊天 bot 能不能做到「记得更久、人格不漂移、上下文更厚」？**

定位是**认知架构问题**而非深度学习问题：LLM 是黑盒引擎，插件在它外面搭记忆、情绪、人格的脚手架。所有机制几乎都能在认知科学与 Agent 记忆研究里找到原型——这既是设计依据，也是面试时「你的方案有什么理论支撑」的现成答案。

### 1.3 差异化论点（为什么这个项目不一样）

市面 Agent 项目大多停在「调 LangChain 搭 demo」。本项目的稀缺性来自四个「真」：

1. **真生产**：腾讯云真实运行三周+，真实 QQ 群（最难的多发言人归因场景），~250 轮/天；
2. **真复盘**：三天试运行复盘、token 审计、记忆污染事故处置——每个迭代都由真实数据驱动，不是拍脑袋；
3. **真理论**：记忆分层 / 遗忘曲线 / 检索评分全部有认知科学原型，不是凭感觉调参；
4. **真可观测**：op 流水全审计可重放 + 脑图可视化 + eval 评测集——「它怎么记住你」本身就是产品功能。

第二 deployment（`engram/`）把「宿主无关内核」从架构论证变成了事实：同一份 `src/brain/` 源码，dsh 插件和 Web 陪伴壳层两个平级 deployment——角色由宿主决定，不由代码决定。

### 1.4 叙事弧线（从插件到基础设施）

```
dsh 插件（reference deployment / 试验田）
  → brain-as-a-library（宿主无关内核；价值排序 lib > HTTP sidecar > MCP）
  → 一脑多身（多 persona / 多群 / 多端 namespace 隔离）
  → 有延续性的数字存在（陪伴形态泛化）
```

演进决策全文：`.trellis/tasks/archive/2026-11/11-03-brain-roadmap-beyond-dsh/prd.md`

---

## 二、业务与领域地图（学习理解业务）

### 2.1 认知科学 ↔ 代码对照表

| 插件里的实现 | 对应理论 |
| --- | --- |
| 检索评分 `α·rel·(1+β·R)+γ·imp/5` | Generative Agents（relevance + recency + importance） |
| `R=e^(−t/S)` 衰减、命中强化 S | 艾宾浩斯遗忘曲线 / ACT-R base-level activation 简化 |
| 情景记忆 → 语义记忆周期巩固 | Tulving 记忆分层 / 系统巩固理论 |
| 强情绪场景记忆初始强度 ×1.0~1.5 | 情绪唤醒调制记忆巩固（闪光灯记忆） |
| PAD 三维 + mood 受控枚举九桶 | Mehrabian 情感维度模型 |
| `kind=attitude` 态度记忆 | 自我模型 / 特质记忆：人格内核不变，立场可被对话塑造 |
| n-gram + OpenAI 兼容向量混合召回 | 经典 IR 词袋检索 + dense retrieval 混合 |
| 注入 section 按稳定性两段排序 | LLM 前缀缓存 + Lost in the Middle 位置效应 |

### 2.2 Agent 记忆系统格局（2026-11 调研）

| 方案 | 是什么 | 对我们的价值 |
| --- | --- | --- |
| **Letta**（前 MemGPT） | agent 运行时 + 记忆范式；MemFS 文件树 + dreaming 后台巩固 | 思想借鉴最多：dreaming 重组 pass、按需深读、shared memory repos 印证 world/self 分轨 |
| **Mem0** | 记忆即服务：ADD-only 抽取 + hybrid 检索（LoCoMo 91.6） | 事实召回标杆；不引入（无人格/情绪/态度/私域）；entity boost 检索小点可抄 |
| **Zep/Graphiti** | 时序知识图谱：episode→entity→community 三层 + 双时态 | 双时态 valid 区间、BFS 图扩散可抄；整体过重（Python + 图库 + 每轮 4-6 次 LLM） |
| **OpenClaw** | 个人常驻 agent，最近的开源「表亲」 | 借鉴清单最丰富：standing intents、dreaming 信号门禁、provenance 分级、USER.md |

**关键判断**：「关系性记忆（attitude）+ 情绪轨 + 人格内核 + 私域隔离 + 可审计 op 流水 + 成本纪律」的组合市面无人覆盖——这正是陪伴型 agent 的真需求区。**不需要换架构，按借鉴清单补 6-8 个小机制**（10 条清单全部有落点，见 iteration-plan §11）。

**陪伴专评冷水**：REMP / LifeSide / ZifaMem / "Best Friends Not Forever" 一致显示长期陪伴的瓶颈在**情绪一致性、人格稳定、关系连续性**，没有任何现成架构能可靠解决；「结构化」比「选哪家」更重要（ZifaMem：结构化记忆 +11.4%，与 Mem0 统计等效）。

调研全文：`.trellis/tasks/archive/2026-11/11-09-memory-persona-arch-research/`（两份报告）

### 2.3 陪伴产品格局

| 产品 | 形态 | 对我们的启示 |
| --- | --- | --- |
| Replika | 1-on-1 深度陪伴 | Diary 记忆叙事化、Memory tab 可见可编辑、等级成长；recency-only segmented 是反面教材（老用户反馈旧记忆变淡） |
| Character.AI | UGC 角色平台 | 人格结构化 schema 六段（Identity/Personality/Voice/Behavioral rules/Backstory/Relationships）+ dialogue examples + 星级反馈训练 |
| 星野 | UGC 创作社区 | 记忆结晶（记忆情感资产化）；「7 天全量 + 永久关键」≈ 我们的 episodic 窗口 + semantic |
| 猫箱 | PGC 内容消费 | 主动开口是头部产品标配 |
| OpenClaw | 个人常驻 agent | SOUL.md 文件人格（agent 可自演化——与我们只读内核的核心分歧） |

**产品共识三条**：① 记忆可见、可编辑、可纠正（透明度=信任功能）；② 记忆要叙事化呈现（Diary/结晶——内核原料已备，缺产品层）；③ 主动开口是陪伴标配（engram slice2 的方向）。

### 2.4 人格方案的核心分歧：「人格可否自演化」

OpenClaw / c.ai 允许人格成长（SOUL.md 可改、反馈塑形）；我们 `persona.md` 只读——但 attitude/emotion 轨承担了「可变的关系性自我」。**内核稳定 + 关系可变**的分工在陪伴场景更抗漂移（对应 persona collapse 研究风险）。c.ai 的结构化 definition 可作为人设包写作模板升级，不动内核。

---

## 三、设计思想（思想层：这些原则是可以带走的）

### 3.1 贯穿性原则

| 原则 | 一句话 | 出处 / 落点 |
| --- | --- | --- |
| 成本是一线约束 | 成本是设计约束不是事后指标；新增 LLM 调用/注入段先过成本评估（有界/缓存友好/可关/失败静默） | `AGENTS.md`「成本一线」· README「成本透明」 |
| 评测先行 | 没有尺子不改架构；改参数/架构前先有可测量基线 | `test/eval/` · `npm run eval:prompt` 黄金集 |
| 确定性优先于 LLM | 触发判定/门控/去重能用规则就不用模型（standing intents 触发零 LLM） | 迭代 D |
| 不为 hypothetical 铺面 | companion 专属能力只落内核原语；aspiration 型 intent 二期不做；per-session persona 不排期 | iteration-plan §0 |
| dsh first-class | 新机制先在 dsh 验证再下沉；第二 deployment 是「多一个宿主」不是「迁移」 | 11-03 / 11-09 路线 |
| 可观测 + 可管理 | 不是在 PPT 上，是在真事故里走通的（记忆污染 → 清洗链 → 固化成产品功能） | README「一次实战检验」 |
| 前缀缓存友好 | 稳定段在前、易变段贴尾——缓存命中约 1/10 价 + 吃到尾部注意力红利 | `inject/prompt.ts` 两段排序 |
| 降级矩阵 | 每个外部依赖（LLM/embedding/webServer）都有 fallback；脑图挂了 bot 照聊 | README 痛点表 |
| 角色由宿主决定 | 同一份 `src/brain/` 在 dsh=插件、在 engram=核心模块——「宿主无关」的实证方式 | `11-12-companion-arch-java-eval` |
| 记忆可观测即产品 | 脑图/ops 流水从内部工具变差异化卖点（市面陪伴产品记忆是黑盒） | `11-09-companion-agent-eval` |
| 场景筛查 | 每接一个宿主先问：该宿主上的 bot 是不是「常驻陪伴」形态？（WorkBuddy 教训：场景 > 技术） | 11-03 roadmap 诚实约束 |
| 价值在决策不在代码 | spec 约定是踩坑沉淀；重写=重踩坑或靠测试兜行为漂移；「看不懂 TS」顾虑被高估 | `11-12-companion-arch-java-eval` |
| 部署 ≠ 验收 | 代码验收随提交关闭，生产数据才能证明的项登记台账、带证据阈值、跨走查存活 | `.trellis/acceptance.md` |

### 3.2 「不做」清单（否决理由同样值钱）

- **不整体引入 Mem0 / Zep / Letta**：它们解决的是事实召回 / 时序图 / agent 运行时，不是关系性记忆；接了 = 丢全部差异化；
- **不重写内核用 Java**：价值在决策资产 + 内核是移动靶 + 破坏「同一内核两 deployment」叙事 + 时间成本；Java 的正确位置 = 学习性移植 kata；
- **不为接 QQ 而接 QQ**：QQ 接入只是可选拓展，「QQ+腾讯官方背书」卖点已吃完；竞品存在、不比新颖——价值在学习载体+设计发扬+谈资；
- **不把陪伴 agent 写成独立简历条目**：陪伴 agent 是最泛滥的 demo 品类；它的价值是给主项目叙事补「claim → evidence」+ 面试官可体验；
- **不做 persona.md 自演化**（暂）：赌稳定性不赌成长感；可变部分由 attitude/emotion 轨承担；
- **不追 LoCoMo 式事实召回 SOTA**：陪伴场景不按事实问答评分，按关系连续性评分；
- **不提前铺面**：per-session persona、aspiration intent、MCP 壳、第二宿主都排在真实需求出现之后。

---

## 四、关键决策档案（思想 → 实际决策）

> 每条：问题 → 备选 → 结论 → 核心理由 → 指针。**否决项保留**——面试讲「为什么不选 X」比讲「选了 Y」更见功力。

| # | 决策 | 备选 | 结论 | 核心理由 | 指针 |
| --- | --- | --- | --- | --- | --- |
| 1 | 项目本质定位 | 神经网络/深度学习项目 | 认知架构（LLM 之上的脚手架） | LLM 是黑盒引擎；所有改动都在 prompt 组装/记忆流水/检索策略层，主线是认知科学不是 ML | `10-31-brain-learning-roadmap` |
| 2 | 记忆分层 | 单一事实列表 / 对话历史拼接 | episodic/semantic/attitude 三轨 + 世界/自我可见性分轨 | Tulving 分层原型；「用进废退」比堆历史干净；v1 每轮硬塞 1 条 → v2 37% 正确丢弃 | README 机制节 |
| 3 | 检索方案 | 向量数据库 / 纯 LLM 总结 / LangChain | n-gram TF-IDF + embedding 混合 + 相关性硬门控 | 中文免分词；百条级线性扫描够快；零依赖可分发；两路阈值量纲分开判 | 面试聊点 §2 · `test/eval/` |
| 4 | 注入排序 | 全部按重要性/时间排 | 按稳定性两段排序保前缀缓存 | DeepSeek context caching 按前缀命中；易变段插中间 = 每轮数千 token 全 miss；尾部还有 Lost-in-the-Middle 红利 | token 审计 R2 · `inject/prompt.ts` |
| 5 | 存储 | SQLite / 向量库 | append-only JSONL op 流水 + 快照原子重放 | 写入即审计、可重放、零依赖；体量小不需要 DB；compact tmp+rename 防半写 | 面试聊点 §6 |
| 6 | 态度归属粒度 | 版本级（gentle/devotion 各一轨） | 角色级（whale 三版本共享立场轨） | 「立场属于灵魂不属于衣服」；版本=衣服；需一次同对象去重迁移 | iteration-plan §2.3 |
| 7 | 世界轨巩固分批 | 全时段众数角色一批 | 按源角色分批 + 画像关系句点名角色 | F5 串味实证：ye lore 落 whale 轨、sess 画像混写主人/师姐——画像是第二泄漏通道 | `11-13-consolidate-view-mismatch` |
| 8 | 跳出 dsh 形态 | MCP 优先（生态最广） | 价值排序 lib > HTTP sidecar > MCP | MCP 退化为模型按需工具调用，丢人格/情绪/归因——降级形态放最后 | `11-03-brain-roadmap-beyond-dsh` |
| 9 | 陪伴 agent 定位 | 独立第二项目 / 从 dsh 迁移 | 内核第二 deployment（engram），dsh 仍 first-class | claim→evidence；「不是玩具」= 要 dogfooding 真实使用，日活=自用 | `11-09-companion-agent-eval` |
| 10 | Java 重写内核 | Java 内核 / Java 壳+Node sidecar / 不写 | 不重写；Java = 模块级移植 kata | 四条理由：决策资产/移动靶/叙事支点/时间成本；「看不懂」顾虑被高估（零依赖+中文注释+types.ts 即文档） | `11-12-companion-arch-java-eval` |
| 11 | 范式治理 | 纪律靠散文自觉 | 机器化：hooks/CI/deploy.sh/eval:prompt | 11-18 评估：2/3 提交是记账、无 CI、prompt 改动无离线回归 → 两个 P0 落地 | `11-18-ai-workflow-review` |
| 12 | 验收模型 | 部署即验收 | 三级验收（代码/部署/实证）+ acceptance 台账 | 多个修复上线后无样本可证 → 实证项带证据阈值、状态机、跨走查存活 | `11-14-acceptance-registry` |
| 13 | 声口工程路径 | 改推理层/换模型 | prompt 层四轮迭代（声口示例→channelStyle→此刻感→表态公式） | N1 推理层顾问模式暂缓待拍板；prompt 层能治的先治，每轮部署+验收闭环 | `11-15/11-17-private-chat-persona-voice` |
| 14 | 蒸馏归因 | 指代/省略主语默认归发言人 | 归属铁律：指代不明不默认归发言人 + [附图]标记 + 主体不明宁可不记 | 线上实证：群友讨论 coser 身份错记到发言人头上（bc091a78/436c508f） | `11-14-distill-attribution` |

---

## 五、brain 内核精读笔记（深入理解 Agent 开发）

### 5.1 架构速记

**三层记忆，各有不同的「活法」**：

- **episodic 情景**——逐轮蒸馏的事件记忆，`R=e^(−t/S)` 衰减，被真相关命中才强化（用进废退），30 天物理遗忘；强情绪场景初始强度最高 +50%；
- **semantic 语义**——巩固定时器从老情景提炼的长期知识，`sourceIds` 记录情景来源，被吸收的记忆退池但保留追溯链、不重复巩固；
- **attitude 态度**——「对\<对象\>：\<立场\>」条目，人格内核不变但立场被对话塑造；含发言人昵称的态度保底唤起。

**轨道（可见性）**：世界轨共享 / 自我轨（`self:true` + attitude）按 `characterId` 隔离 / 情绪按角色。**切换人设只过滤读取，存储不删不换**——「角色=灵魂，版本=衣服」。

**读路径**（每轮 LLM 调用前注入 ≤9 段）：稳定段（人格内核 order 80、会话脉络 81）在官方 tools 之前保前缀缓存 → 易变段整体 order 10300+ 贴尾（发言人/当前立场/记忆摘录/深挖/情绪态/当前时刻）。

**写路径**（轮末 ≤3 次额外 LLM 调用）：蒸馏一笔产五件（记忆四类白名单 + 情绪 mood/PAD + 画像草稿 + forget 意图）→ 画像独立模型二审（审核章持久化）→ JSONL op 流水 + 快照。

**后台循环**：语义巩固（只啃未吸收 episodic）、embedding 回填、衰减/强化、近重复清扫、图谱边生成（graphVersion 缓存）。

### 5.2 已知短板（诚实清单 = 论题池素材）

- 同一人不同上下文拿不同 openid → 画像碎片化（读侧归并+手动合并已做，根治=actor 归一化/真名注册表，身份层战役）；
- 人格漂移没有量化度量，靠体感 + reasoning 抽查（最大 eval 缺口）；
- emb 噪声底下半相关命中仍可能刷 hits（ACC-08 定性豁免：话题相邻注入与真命中阈值不可分）；
- 管理面写回竞态：重置/删除与在途蒸馏无互斥（dataEpoch/CAS 方案已定未做，I1）；
- 蒸馏输入里 persona 占 ~60%，攒批/精简版开关已做待 A/B；
- prompt 风险：情境示例被逐字背诵（eval:prompt 首跑暴露）、群聊记忆投毒当场接受（威胁模型已建、防护改动待拍板）。

### 5.3 演进路线

- **迭代 A–G**（记忆/人格深化）：A 三轨地基✅ B 叶瞬光✅ C 主动召回✅ D intents+provenance✅ E 记忆质量深化（E6✅、E1–E5 按信号储备）F companion 壳层=engram G 体验层穿插；
- **跳出 dsh**（H1–H3）：HostAdapter 显式化 + ingest/assemble 端点 → @brain/core 库导出 / HTTP sidecar → MCP 薄壳 → 一脑多身。

精读顺序见 `MAP.md`「源码阅读顺序」；`test/` 单测当规格看（276 用例覆盖大部分边界）；`test/eval/` 是「评测先行」方法论的落地。

---

## 六、待深入论题池（值得记录和探讨的问题）

> **用法**：新论题先进本池；探讨出结论后，把「值得带走的认知」提炼进对应章节（叙事/领域地图/设计思想/决策档案/内核笔记），本池条目更新状态或移除。

### 6.1 身份层战役（当前最优先的共同前置）

| 论题 | 为什么值得 | 状态 / 指针 |
| --- | --- | --- |
| self 分轨 P0（bot 侧角色→人设） | 「角色=灵魂版本=衣服」模型的最后一块地基；跨角色自我内容双向泄漏的根治；认知深化与跨宿主的共同前置 | 已定案未实现；iteration-plan 迭代 A 后续 |
| actor 归一化 / 真名注册表（user 侧） | openid 碎片化根治；同一实体多标识归并（与「一脑多身」同构） | 与 self 分轨同属身份层；`host-brain-audit` 残留 |
| merge createdAt 修复 | 数据正确性细节，身份归一化的配套 | 待排期 |
| 群画像误归因修复 | 画像是第二泄漏通道（F5b 实证 sess:dbf7162a 混写主人/师姐）；关系句点名已修，根治待身份层 | 部分已修；`11-13-consolidate-view-mismatch` |

### 6.2 认知深化（迭代 E 储备 + Reflection）

| 论题 | 为什么值得 | 状态 / 指针 |
| --- | --- | --- |
| **Reflection**：巩固时生成高层洞察 | Generative Agents 缺的那块；记忆从「事实堆」变「认知」的关键一步；也是人格漂移度量的候选载体 | README 下一步候选 #5；需先补评测 |
| 扩散激活 / BFS-lite（E2） | 图谱边已铺底；Zep 思想；治「扩散激活仅有图谱边」短板 | 储备，触发信号未到 |
| 双时态 valid 区间（E3） | 「他以前住 X 现在住 Y」类问答；Zep bi-temporal 思想 | 储备 |
| 干扰式遗忘 | 前摄/倒摄干扰理论；比纯时间衰减更接近人类遗忘 | 10-31 路线第 5 步 |
| dreaming pass（E4） | 低频全池审视重组（合并漂移画像/重写过时 semantic/清孤儿 attitude）；规则信号门禁 + 有界 LLM + pre-image 评审面 | 储备，最慎重最后做 |
| USER.md 指令用户模型（E5） | Always/Never/Prefer 指令抽取，防旧偏好残留 | 储备，先评估与 attitude 重叠度 |
| entity boost（E1） | 检索分加「与当前发言人/话题实体共现」项 | 储备 |

### 6.3 跳出 dsh 与多宿主

| 论题 | 为什么值得 | 状态 / 指针 |
| --- | --- | --- |
| HostAdapter 显式化 | ~300 行胶水从隐式边界变显式契约；第二宿主的落点 | 11-03 H1 四小事之一，未做 |
| `/api/ingest` + `/api/assemble` | 任何能发 HTTP 的 harness 可接；一石二鸟强制 HostAdapter | 11-03 H1，未做 |
| `@brain/core` 库导出 | 「宿主无关」价值保留最高的形态；engram 已验证可行性（src 直引 + type stripping 零构建） | 11-03 H2；engram D4 |
| HTTP sidecar / MCP 薄壳 | 语言无关降级形态；MCP 放最后 | 11-03 H2 |
| 一脑多身 | 多 persona/多群/多端 namespace 隔离；与 openid 碎片化同构 | 11-03 H3，远期 |
| 第二宿主筛查 | 「常驻陪伴场景」规则；Discord/TG 天然候选（发言人字段结构化，不用 parseSenderTag 抠文本） | 每接一宿主先过筛 |

### 6.4 陪伴形态（engram 相关）

| 论题 | 为什么值得 | 状态 / 指针 |
| --- | --- | --- |
| engram 部署 + dogfooding | 「不是玩具」的检验：日活从哪来；自用是成本最低的真实使用来源，也契合「陪伴自己」的产品定义 | 已 bootstrap 未部署；`engram/docs/dev-plan.md` |
| 主动开口策略 | 陪伴标配能力；中档已定（maxPerDay=4 / quietHours 23-8 / minInterval 120min）可调 | engram slice2，默认关待声口基线 |
| `brain_search` tool | companion 原生 tool（迭代 C 原语的消费面）；≤2 轮 tool loop | engram 已实现默认关 |
| Diary / 记忆叙事化 | Replika Diary / 星野结晶；记忆从召回素材变关系证据和分享素材；内核原料（digest/emotion/op 流水）已备 | 远期产品层 |
| 用户侧记忆可见可编辑入口 | Replika Memory tab 共识；/brain 偏开发者向，用户侧纠错入口缺 | 远期 |
| 声口在 1-on-1 的迁移 | firefly persona.md 双语境改写（群聊语境残留待清）；声口工程四轮经验是否迁移 | `engram/src/persona.ts` |

### 6.5 工程范式与个人成长

| 论题 | 为什么值得 | 状态 / 指针 |
| --- | --- | --- |
| N1 推理层顾问模式 | reasoningEffort=high 致规划腔；prompt 层四轮修复已上线但根因可能在推理层 | 暂缓待拍板；`11-15-private-chat-persona-voice` |
| prompt 资产系统化 | prompt-inventory 全量盘点完成；eval:prompt 黄金集 25 例；示例背诵问题待修 | `11-16-prompt-inventory` |
| 人格漂移量化度量 | 「靠体感」是最大 eval 缺口；候选 = eval 方法论 / LongMemEval / LoCoMo / drift 指标 | `11-05-self-improvement` 路线映射 |
| Java 移植 kata | retrieval.ts / decay.ts 用 Java 重写拿 eval 集验证等价性；零生产风险 + 面试谈资 | `11-12-companion-arch-java-eval` 定位 |
| B-11 理解债自测 | 按 comprehension-check 考一次蒸馏写路径并存档错题；「让 AI 考自己」改固定产物 | `AI-WORKFLOW.md` backlog |
| 攒批 / personaDigest A/B | 蒸馏输入 persona 占 ~60%；最简实验设计（对照组/单变量/样本量直觉） | README 下一步候选 #6 |

---

## 七、学习路线与资源

### 7.1 领域知识（10-31 六阶段，按回报速度排序）

1. **记忆科学基础**（最对口）：Anderson《认知心理学及其启示》；干扰理论（前摄/倒摄）、编码特异性、间隔效应；ACT-R base-level activation `B = ln(Σ t_k^−d)` 是 strength 机制的正规版本；
2. **LLM Agent 记忆论文**：Generative Agents → MemoryBank → MemGPT/Letta → A-MEM → Zep/Graphiti；综述 "A Survey on the Memory Mechanism of LLM-based Agents"；
3. **检索工程**：dense embedding → BM25+embedding 混合（RRF）→ rerank → recall@k/MRR；数学只需向量/内积/余弦；
4. **情感计算**：PAD → OCC 评价理论（情绪=对事件的评价结果）→ 情绪调节；
5. **评测先行**：LongMemEval、LoCoMo 基准；自建小评测集方法论（对话历史→该唤起哪条记忆→命中率）；
6. **选修**：神经网络内功（Karpathy《Neural Networks: Zero to Hero》）——微调 embedding / 理解 LLM 遗忘幻觉时才需要。

### 7.2 指挥 AI 的元能力（11-05，按不对称原则）

**学判断所需的广度，不学实现所需的深度**——指挥 AI 的瓶颈在评审与验收，不在编码。

1. **设计评审能力**：每个 diff 看三处——接口签名、不变量（什么必须恒真）、失败模式（什么输入会炸）。Ousterhout《A Philosophy of Software Design》（薄，几天读完）；
2. **验收标准先行**：把 eval 习惯推广到每个任务——动工前先写可量化验收清单（数值指标 + 测试全过 + 边界行为）；
3. **失败模式三连问**：「什么输入会出错？」「并发/重启/脏数据时会怎样？」「不做的代价是什么？」；
4. **懂边界、敢托管**：必须懂的层 = 接口契约/数据流向/记忆语义；可托管的层 = TS 语法/构建配置/CSS。**单点最高杠杆 = 通读 `src/brain/` 全部**——读自己的核心资产比读十篇论文更能提升指挥质量；
5. **日常三动作**：开工一句话说清要验证什么假设 → 先写验收再动手 → 收工让 AI 自列改动失败模式并审一遍。

### 7.3 信息摄入（节流不追热点）

固定三个源：Anthropic engineering blog（"Building effective agents"、"Effective context engineering" 必读——与注入/前缀缓存直接同构）；Hamel Husain 的 evals 写作；论文**按需读不预读**（开 Reflection 前读 GA §4.2，开扩散激活前读 A-MEM）。

### 7.4 不学清单

- transformer / 训练 / 微调：选修定位不变；
- 「怎么手写本项目代码」：杠杆在判断层不在实现层；
- MCP / 多宿主细节：等真实需求出现，不为 hypothetical 宿主提前铺面。

---

## 八、面试弹药补充（求职材料 11-08 后的新证据）

求职材料三件套写于 2026-11-08，此后项目又长出这些可讲点：

| 新素材 | 一句话讲法 | 指针 |
| --- | --- | --- |
| engram 第二 deployment | 「宿主无关内核」从架构论证变成事实：同一份 brain 源码跑两个壳层（dsh 插件 + Web 陪伴），零构建直引 .ts 源码 | `engram/` · `11-19-engram-bootstrap` |
| AI 结对开发范式 | 全程 ~360 commits / 93 sessions 留档；.trellis 档案体系（workflow/spec/tasks/journal/CHANGES）本身就是「工程过程可审计」的证据 | `MAP.md` §四 · `AI-WORKFLOW.md` |
| 机器化质量门禁 | pre-commit 密钥扫描 + typecheck/test、CI、deploy.sh 一键发布（成对备份/探活/失败自动回滚/deploy-log DORA 雏形） | `scripts/` · `11-18-ai-workflow-review` |
| prompt 回归 eval | 25 条黄金用例（源自生产事故与台账）、base vs head 双版本、硬检查 + LLM rubric + 噪声边际、~¥0.4/次；离线复现过「表态公式」修复前版本 | `test/prompt-eval/` |
| 实证验收台账 | 「部署 ≠ 验收」三级模型；ACC-01~16 实证项带证据阈值、状态机、跨走查存活 | `.trellis/acceptance.md` |
| 威胁模型 | 致命三要素分析（私有记忆+不可信群消息+外联工具）；agent-guard hook 拦高危命令；brain-ro 只读账号 | `docs/threat-model.md` |
| 声口工程四轮 | 私聊 AI 腔排查 → 声口示例 + channelStyle → 此刻感 → 表态公式；prompt eval 驱动、每轮部署 + 验收闭环 | `11-15/11-17-private-chat-persona-voice` |
| 脑图 UI 重构 | 三皮肤（鲸脑皮层/墨刊/星图）+ D-admin 七页管理端真实 API + 移动端适配 | `11-13-brain-ui-redesign` · `11-16-admin-mobile` |
| 蒸馏归因实战 | 线上错配实证 → 归属铁律 + 附件标记修复 → ACC-09 验收闭环 | `11-14-distill-attribution` |
| eval 首跑暴露三问题 | 情境示例被逐字背诵 / E1 表态修复泛化未证 / 群聊记忆投毒当场接受——「评测本身也是产品」 | `11-18-ai-workflow-review` Resolution |

**新增弱点/诚实项**（面试被问「不足」时的更新版）：

- 身份层未完成：self 分轨 P0 已定案未实现、actor 归一化未做——「知道怎么修、排期没到」；
- 人格漂移无量化度量；prompt 示例背诵问题待修；记忆投毒防护待拍板；
- engram slice1 代码完成但未部署生产——「第二 deployment」目前是骨架证据不是线上证据。

---

## 九、维护约定

**何时写**：探讨出值得记录的问题、论题、决策逻辑、学习心得时——设计方向敲定、重要决策（含否决）、认知突破、面试新素材、读完论文/文档的要点。判断标准一句话：**一年后的我会不会想翻出来？**

**怎么写**：注明日期（YYYY-MM-DD）+ 论题 + 要点 + 指针（task 目录 / journal / commit / 外部 URL）。新论题先进 §六论题池；探讨出结论后把「值得带走的认知」提炼进对应章节，本池条目更新状态或移除。

**分工边界**：

- 本文件 ≠ 开发文档：不写实现细节（以源文件为准）、不写过程流水账（在 task prd）；
- 本文件 ≠ 求职材料：求职材料是对外成品（可直接贴简历/面试讲），本文件是内功（理解 + 论题池 + 弹药库）；
- 本文件 ≠ CHANGES.md：CHANGES 记「发生了什么」（一行事件流），本文件记「值得带走的认知」（成段沉淀）；
- 本文件是 pull 资源：不需要每会话读；用户做面试准备、方向复盘、学习规划，或明确要求「沉淀一下 / 记进 GROWTH」时使用。

**与 MAP/README 的关系**：本文件是个人向文档，不进 README 门面叙事；`MAP.md` 已加导航行，`AGENTS.md` 项目约定有维护条款。

---

*首版建立：2026-11-20。素材来源：README / MAP / iteration-plan / companion 三评估 / 跳出 dsh 路线 / 两轮记忆人格调研 / learning-roadmap / self-improvement / ai-workflow-review / prompt-inventory / 求职材料 / acceptance 台账 / CHANGES 全文。*