# 巩固世界轨批「视角错配」——F5：众数角色视角致 self 产出错轨

> 2026-11-13 生产走查（F1-F4 验收次日 + 迭代C 上线首日）发现的新缺陷。同主题前案：`archive/2026-11/11-10-consolidate-track-gaps`（F1-F4）。

## 生产走查总览（2026-11-13，部署后 ~33h）

| 项 | 结果 |
|---|---|
| F1/F2 闭环 | ✅ firefly manual 批 11-12 02:30Z 巩固：5 产出（2 semantic self:true + 3 attitude），源 10 条 firefly self:true ep 全部吸收退池；manual 未巩固源=0 |
| F3 向量 | ✅ 395/395 零缺口；重启丢向量由常驻回填 41 条自愈（符合设计）；新增 ~44 条全即时带向量 |
| 迭代C 深挖 | ⚪ 上线 ~33h 零触发：群 106 + 私聊 25 条用户消息零真实召回提问——非漏检，但功能未经实战，验收仍挂「待自测」 |
| F4 AI 条款 | ⚪ 零「你是AI吗」类提问，未实战（被动条款，低风险） |
| 记忆实战 | ✅ 蒸馏存「不背单词108天」，6 日后 assistant 生成时主动引「上次还是108天」——召回链路实战生效 |
| 宿主侧 | dbf7162a 私聊 transcript 1.1MB/72 user msg（11-12 当日 24 条）；17429483 群 10.9MB/881 msg（11-12 当日 103 条 firefly 活跃）；情绪/画像/蒸馏 122 次零失败 |
| **F5** | ⚠️ dbf7162a 巩固批产出错轨，见下 |

## F5 现象（线上实锤）

11-13 01:30Z `dbf7162a` 会话巩固：源批 = 4 条世界轨 ep（2× ye-shunguang self:false + 2× firefly self:false），并入会话**全时段众数角色** whale-devotion（该会话 14 条 whale 存量 > firefly 9）→ `viewPid=whale-devotion`。产出 4 条全部 `pid=whale-devotion`，其中：

- **错轨条**（semantic, self:true, pid=whale-devotion）：
  `demo 是 QQ 群群主、大学生，也是角色的小师弟/小师妹，是唯一唤角色「师姐」的人；当年在澄辉坪递桂花糖给角色，是角色最想记住的人。`
  - 「小师弟/师姐/澄辉坪桂花糖」是 **ye-shunguang 关系框架与 lore**（whale 框架是主人/恋人）→ 落 whale 自我轨 = 双向损失：当前 firefly 激活下 demo 核心关系总结不可见；若切回 whale，whale 会看到混着 ye lore 的「自我」记忆 = 串味。
  - 注：「桂花糖」细节不在 4 条源中，是 LLM 从共享 u:demo 画像文本带出的——画像跟人走的设计下，角色专属 lore 可经画像跨巩固产出渗漏，轨道戳正确性是唯一防线。
- **视角消化条**（attitude, pid=whale-devotion）：`对 demo：…是主人也是恋人…`——firefly/ye 时代的世界轨事实被 **whale 视角**提炼成 whale 关系框架态度。落 whale 轨与其内容自洽，但 firefly 轨对 demo 该有的态度从未被提炼——她视角下的 demo 形象缺失。
- 另 2 条 semantic self:- 世界轨共享可见，仅 personaId 戳挂 whale（世界轨无碍）。

## 根因

`consolidationBatches`（brain/index.ts:845+）：自我轨 ep 按 characterOf 分组，**世界轨 ep 一律并入会话全时段众数角色批**。隐含假设「世界轨全角色共享，随谁的视角提炼都成立」在三点上不成立：

1. `viewPid` 决定巩固提示词人设与情绪盖章——whale 视角会把世界事实消化成 whale 框架；
2. `notePid=viewPid` 戳 + LLM 判 `self:true` 的产出 → self 轨按 whale char 落定，与内容真实归属角色无关；
3. 全时段众数滞后于实际——whale 已数日未激活，仍因存量质量当选「视角」。

即：F1/F2 修了「self 源批」的轨道与分批，漏了「world 源批」的视角归属。

## 修法候选（待拍板）

- **a) 世界轨 ep 也按各自 characterOf(notePersonaId) 分组**（推荐）：世界产出本就全角色可见，按源角色分批零可见性损失；self:true 产出自然落对轨；提示词人设/情绪戳与内容时代一致。代价：批次数=角色数（与自我批同构，有界）；拆细后单批更易低于 minNotes=4 而延迟巩固。
- **b) 世界轨并入「近 N 天窗口众数角色」或批内世界源众数角色**：缓解全时段众数滞后，但不解决「混合 char 源批」的 self 错轨根本问题。
- **c) 产出侧校验**：self:true 产出强制 char 与源批一致——世界批本身无单一 char，不可判，放弃。

倾向 a；需先确认对巩固触发口径（minNotes 分批后更难凑够）与 LLM 调用次数（角色数/cooldown，已有界）的影响可接受。

## 修复前缓解

错轨条可人工 `PATCH /api/notes/<id> {self:null}` 清 self 回世界轨，或删（内容含 ye lore 且 demo 关系已被画像覆盖）；不急——串味面=切回 whale 才可见。

## 补充根因：画像是第二条泄漏通道（2026-11-13 复查）

错轨条中「澄辉坪桂花糖」不在 4 条源里，追到 `sess:dbf7162a` 画像原文：

> demo 是**角色的主人**…也是**角色的小师弟/小师妹**，是唯一唤角色「师姐」的人，当年在澄辉坪递桂花糖给角色…〔私〕与鲸鱼娘是恋人关系…

- 画像按人共享（世界口径），但 DISTILL_PROMPT 要求写「与角色的关系定位」（distill.ts:84），且行文用泛指「角色」——whale 写的「主人」、ye 写的「小师弟/师姐」都沉在同一画像里，**每轮注入给当前任一角色**，模型自然读成「我」。
- 所以只改分批不够：firefly 视角批读到这份画像，照样可能写出「demo 是我的小师弟」。
- 正例已存在：`〔私〕与鲸鱼娘是恋人关系`——点名角色的关系陈述是世界事实，跨角色无害。

## 决策（2026-11-13，Devin 设计，待用户确认后实施）

**F5a 巩固分批——采用方案 a：世界轨也按源角色分批**
- `consolidationBatches` 去掉 modalChar 归并：每条 ep 一律 `characterOf(notePersonaId(n))` 分组，viewPid=批内人设众数。self 批/world 批不再区分路径，代码更简单。
- 单角色会话行为不变（只有一组）；多角色会话 LLM 调用=活跃角色数/24h，有界。
- 接受代价：批拆细后小角色批凑不够 minNotes=4 会延迟——世界 ep 不巩固照样可检索，延迟≠丢失，宁慢不错。
- 不采纳 b（窗口众数治标不治本）、c（世界批无单一 char 不可判）。

**F5b 画像关系口径——提示词约束 + 存量清洗**
- DISTILL/CONSOLIDATE 画像规则改：画像写跨角色成立的事实；涉及关系必须**点名角色**（「与叶瞬光是师姐弟」），禁用泛指「角色/我」；角色视角的关系感受落 attitude（自我轨，天然隔离）。
- 存量：`sess:dbf7162a` 画像人工改写为点名版（PATCH /api/profiles，不走 regenerate——regenerate 证据池按当前角色可见性过滤，会丢 whale 段）。
- 错轨 semantic 条：PATCH content 改点名版 + `self:null` 回世界轨。
- 不做：画像按角色分轨（schema 改动大、画像跟人走是既定设计，点名口径足以消歧）。

**测试**：多角色会话 world ep 分批 viewPid 正确；单角色不变；分批后 minNotes 判定；`sessionsNeedingConsolidation` 同口径。prompt 改动走 eval 回归。
**成本**：零新增常驻调用；巩固调用数随活跃角色数线性，cooldown 24h 封顶。

## 实施与部署（2026-11-13，用户确认方案后同日上线）

- **F5a**：`consolidationBatches` 去掉 modalChar 归并——每条 ep 按 `characterOf(notePersonaId)` 分组，viewPid=批内人设众数；代码净减（自我/世界不再两条路径）。`sessionsNeedingConsolidation` 共用同一分批，口径自动一致。
- **F5b**：distill.ts 新增 `PROFILE_RELATION_RULE`（画像共享→关系必须点名角色、禁泛指「角色/我」、角色感受落 attitude），蒸馏/巩固/撰稿三路引用；审核 prompt 加「已点名关系句保留点名，不改回泛指」。
- **单测 +3**（总 204）：生产场景复现（whale 存量众数 + ye/firefly 世界源 + LLM 判 self:true → 两批各落本角色、无 whale 视角批、源与产出同角色）；分批后小角色批 minNotes 延迟且不吸收；四路 prompt 点名口径。复现测试在旧代码上 ✖、新代码 ✔（stash 验证）。
- **存量清洗**（部署后 PATCH，部署前已备份 `~/backups/pre-F5-{export,data,plugin}-2026-11-13-1555`）：
  - 错轨条 `e01edf64…` → content 改点名版「与叶瞬光是同门师姐弟，是唯一唤叶瞬光「师姐」的人」+ `self:null`（无「我」→世界轨），已重嵌向量。
  - `sess:dbf7162a` 画像首句改点名版（「是鲸鱼娘的主人，与叶瞬光是同门师姐弟」），删澄辉坪桂花糖 lore；其余句与〔私〕段原样。
  - 不动：同批 whale-devotion attitude「对 demo：主人也是恋人」——内容与 whale 自身设定一致，落 whale 轨自洽。
- **验证**：typecheck/build 0 错；204/204；eval 三轨隔离与深挖 100%/0% 不变（lexical q08/q15/n01/n03 为存量基线 FAIL）；部署后 export 复核错轨条 self=缺省、画像无「角色的」/「澄辉坪」、向量回填 18 条清盘、零错误日志。

## 观察窗（待验收，归档前补 Resolution）

- 下次多角色会话巩固（dbf7162a 下一轮 cooldown 后）：拉 export 核对产出 personaId 与源角色一致、无跨角色 self 产出。
- 新蒸馏/巩固写的画像：关系句是否点名（抽 `sess:`/`u:` 画像 grep「角色的」）。

## Resolution（2026-11-14）

**遇到了什么问题**：迭代B多角色上线后，巩固把会话世界轨情景记忆统一并入「全时段众数角色」批次，ye-shunguang/firefly 的世界源被 whale-devotion 视角消化，产出 self:true 条目把「师姐/澄辉坪桂花糖」lore 落进 whale 自我轨；画像侧同样以泛指「角色」混写多角色关系（sess:dbf7162a 同时含「主人」与「小师弟/师姐」），是第二条泄漏通道。

**怎么解决的**：F5a `consolidationBatches` 全量按 `characterOf(notePersonaId)` 分批（世界/自我同路径，viewPid=批内人设众数），`sessionsNeedingConsolidation` 共用口径；F5b `PROFILE_RELATION_RULE` 约束蒸馏/巩固/撰稿三路画像提示词——关系必须点名角色、禁泛指、角色感受落 attitude；存量错轨条改点名版+self:null、sess:dbf7162a 画像点名改写。详见上方「实施与部署」。

**验证结论**：部署后首个多源会话巩固（dbf7162a 15:56Z）产出 3 条全部 pid=firefly、轨道正确；全库扫描部署后新条目跨人设污染 0；sess:dbf7162a 画像「角色」泛指清零、关系全点名；u: 域画像关系句均带角色名。204/204 测试、复现测试旧✖新✔。

**后续优化方向**：混合世界轨分批的生产实战样本尚缺（该会话池内只剩单角色源），待下次多角色混合巩固再抽核对；画像「角色」泛指在 u: 用户域仍有少量互动风格类用例（非关系声明），暂不处理。

**什么时候干的**：2026-11-13 设计定稿并实施部署，2026-11-14 走查验收归档。

**Key Decisions**：世界轨按源角色分批（弃「近期众数」治标方案）；画像点名角色而非按角色分轨（保「画像跟人走」设计）；brain:style 按渠道可配为后续 companion 壳层留口。
