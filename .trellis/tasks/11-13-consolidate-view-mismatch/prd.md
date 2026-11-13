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
