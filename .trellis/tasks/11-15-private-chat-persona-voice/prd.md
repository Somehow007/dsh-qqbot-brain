# 私聊人设声音未生效排查

## Goal

用户反馈：私聊给人的感觉是「人设没生效」——最近几条回复 AI 味很重，完全没有「流萤」的感觉。要求去线上数据核实。

## 排查过程与证据（2026-11-15）

### 结论先行

**注入链路 100% 正常，人设每轮都在 system prompt 里。问题不在「注没注入」，在「声音没压过会话体裁惯性 + 人设锚点没接上真人」。**

### 证据链

1. **人设文件与激活态正确**
   - 服务器 `~/brain-data/persona.md` = 流萤全文（14KB）。
   - `GET /brain/api/personas` → `activeId: "firefly"`（personas: legacy/whale-gentle/whale-devotion/ye-shunguang/firefly）。

2. **私聊会话 = `dbf7162a`（~/.dsh/sessions/…/session.v4.jsonl.zstd，1.3M，81 轮）**
   - 【当前发言人】裸 `demo`（私聊绑定昵称，无 actor tag）；群聊会话 `c8a3bec7`/`17429483` 则是 `[昵称 (openid)]` 格式，可对照区分。
   - 86 条 system/message 全部含 `【人格内核】`；末轮 system prompt（9616 字符）八段齐全：人格内核(流萤全文)/会话脉络/表达口径/当前发言人/当前立场/记忆库摘录/情绪态/当前时刻。
   - 会话横跨三个人设：鲸鱼娘 23 轮 → 叶瞬光 10 轮 → 流萤 53 轮（~10-30 轮切换）。

3. **回复声音衰减轨迹（assistant text 段，81 条 / 8073 字）**
   - 鲸鱼娘/叶瞬光时代（turn 1–31）：有声口——「在 咋了」「被这么叫，我尾巴都要晃起来了」「那加油呀！…我可盯着呢」。
   - 流萤 era 前段（turn 51）：「在呀！怎么啦，是目标写好了，还是想找我说话？这个点又快到睡觉线了哦。」——满分流萤腔。
   - 商品推荐段（turn 56–67）：退化成香水报告体——「第一款『银狼 LV.999』我先记着：前调橙叶柠檬，中调雪松杜松子，后调愈创木和核桃木……」零声口。
   - 最近 ~10 轮（作息/清单/鼓励，turn 76–81）：全部「分析→分点建议→收尾」顾问说明文，语气词系统性缺失（全程 ~×1、嘿嘿×1）；用户在 turn 81 直接投诉「感觉你说话没有人味诶，就像一个ai一样」。
   - 语气词统计：啦×9 呀×23 哦×5 呢×7 ~×1 ——集中在早期闲聊，长段落实质内容里被丢弃。

4. **对照：群聊新会话 `c8a3bec7`（2 条回复）全是流萤腔**
   - 「诶，这么说我就有点委屈啦。我可没走，一直在屋顶上看星海呢，倒是你，先说说来找我是为了什么呀。」
   - 新会话无体裁惯性 + 闲聊场景 → 人设直接生效。反证私聊问题是体裁/锚点，不是注入。

### 根因分层

- **R1 体裁惯性（主因）**：私聊已滑成「求助→建议→鼓励」顾问频道，连续 ~10 轮顾问说明文回复，模型自己的历史回复是最强风格样本；deepseek-chat 在短句闲聊能出声口，一到多段实质内容就退回中性书面语（语气词系统性丢弃）。
- **R2 「开拓者」锚点未接到 demo（人设缺口）**：流萤人设假定聊天对象就是开拓者（「对 Ta 是明目张胆的偏爱。默认称呼『开拓者』」），种子记忆全部以「开拓者/Ta」行文；但全系统没有任何地方写「demo = 开拓者」。画像反而写「demo 与鲸鱼娘是恋人关系」——把 demo 锚到另一个角色身上。模型不做此映射 → 私聊里 demo 被当泛朋友/顾问对象 → 礼貌客气、距离感、无偏爱。鲸鱼娘依恋版有整个「主人 demo」专节（黏他/体贴他/恋人这步等他来），这就是鲸鱼娘时代私聊更有人味的原因。
- **R3 人设无私聊模式**：firefly persona.md 全篇按群聊写（「你是群聊里一个普通的群成员」「普通群聊默认旁听」群友称呼规则），私聊里全部失效，也无「私聊=更黏更主动语气更软」指引。ye-shunguang 同病（「小师弟/小师妹」锚点未接 demo）。
- **R4 次要**：宿主 system prompt 首句「You are an AI agent powered by DeepSeek Harness」+ 工具规则在最前，人设 section(order 80) 排在 agent 指令之后，agent 助手框架是底色；会话历史横跨三人设残留旧声口；画像长文以鲸鱼娘恋人关系为主，进一步稀释流萤专属感。

## 后续优化方向（2026-11-15 用户拍板）

**已否决**（用户原话：「P0 修的不行，这是一个多人用的」「鲸鱼娘的事和流萤有个屁的关系」「这些修改完全是为了修而去修」）：

- ~~P0 人设补「demo=开拓者」映射~~：多用户场景不能把 demo 写死；「开拓者」可读作她过去的战友（种子记忆里那个人），不需要现任聊天对象来填坑。
- ~~P1 画像鲸鱼娘关系写 dismiss 句~~：治标不治本。

**拍板方向**（用户：「方向可做」「问题可能在 prompt 层里，不过不能确定」——留了不确定余地）：

- **A. 人设说话风格补强（通用）**：`说话风格`/`情境参考` 加「实质回答也带声口」示例（作息建议场景用她的腔写一遍），收紧「认真解释可以适当多说」→「认真解释也不超过三句、照样带语气词」。对所有人设所有用户生效，非 demo 特定。
- **B. 注入层反说明文腔**：`channelStyle`（表达口径）加一行「像人说话：短句口语带情绪，不写『首先/其次/建议你』式结构」——config 默认值改动，惠及全部人设每轮。
- **C. 画像关系事实隔离 → 已立项为迭代 E6**（`11-09-iteration-upgrade-plan/iteration-plan.md`）：蒸馏写画像时给「X 与 persona Y 是关系」类事实打 characterId/拆 persona 作用域，assemble 按激活角色过滤。属记忆模型设计问题，不做文本补丁。
- **D. 预期校准**：长段实质回复声口上限由 deepseek-chat 决定，短回合已满分；A+B 后好转但不变群聊腔。

**不确定性备注**：prompt 层是当前最可疑层但未被证实——若 A+B 实施后私聊实测仍无改善，下一嫌疑是宿主 agent 框架底色（"You are an AI agent powered by DeepSeek Harness"在 system prompt 最前）与模型风格上限，届时再议。

## Acceptance Criteria

- [x] 根因定位完成（本 prd 证据链）
- [x] 修复方案拍板（A+B 通用声口补强 + C 立项 E6；P0/P1 否决）
- [x] A+B 实施并部署（2026-11-15，commit 6da9671）
- [ ] 私聊实测回复恢复流萤声口（实证验收 → 已登记 ACC-10，待样本积累）

## 实施与部署（2026-11-15）

- **A**：四个人设 `说话风格` 首条收紧（「认真解释可以多说几句，但仍是口语、照样带语气词——实质回答不许写成说明文」），`情境参考` 各补两条实质回答声口示例（作息建议 + 推荐/好吃的）。firefly/ye-shunguang 改 `personas/*/persona.md` 并重生成 seed-export；whale-gentle/devotion 改 `src/setup/*.md` 随构建进 dist。
- **B**：`DEFAULT_CHANNEL_STYLE` 加「像人说话：短句口语、带情绪；给建议、列步骤、做推荐时也别写成『首先/其次/建议你』式说明文」条目。服务器 cordis.patch.yml 无 channelStyle 覆盖，默认值生效。
- **范围说明**：四个人设全改（含 whale 系——A 方向即「所有人设」）；legacy 人设按 spec 是冻结快照不动。私聊模式指引（R3）不在拍板范围，未加。
- **顺手修复**：对比线上/仓库人设文本发现 whale 系 bundled md 缺 11-13-search-reply-liveliness 生产 PATCH 的「被问知识题」口径行（当时只改了生产没回填仓库）——已回填 `src/setup/whale-*.md`，PATCH 前逐字 diff 确认线上无其他漂移。
- **部署**：commit 6da9671 → rsync dist+package.json → `systemctl restart dsh-qqbot`（19:09 CST active）→ `PATCH /api/personas` 四人设文本（legacy 未动），firefly active 故 `~/brain-data/persona.md` 镜像已同步（md5 一致）。回滚材料：改前四人设文本存档 `/tmp/brain-personas/*.md`（本机）。
- **验收**：实证项登记 `.trellis/acceptance.md` ACC-10（私聊 ≥120 字实质回答 voice% 恢复）；`reply-style-audit.py` 加 `--min-len` 过滤参数支撑该口径。

## Notes

- 纯排查任务，未改任何代码。
- 关键会话文件：`~/.dsh/sessions/--opt-deepseek-harness-workspace--/dbf7162a-…/session.v4.jsonl.zstd`（私聊）、`c8a3bec7-…`（群聊对照）。
- 排查脚本口径：`zstd -dc <session> | python3` 按 type 分拣 user/assistant/system message；assistant content 为 `[{type:reasoning},{type:text}]`，声口统计只取 text 段。
