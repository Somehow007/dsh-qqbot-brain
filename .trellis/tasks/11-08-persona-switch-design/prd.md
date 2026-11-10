# 多人设切换能力评估与设计

> 存档约定：每次问题探讨都存档为 task——记录「遇到了什么问题 / 怎么解决的 / 什么时候干的」。本文件即本次探讨的存档。

## 问题存档

- **时间**：2026-11-08
- **需求**：线上已有大肥鱼多版本人设（legacy / whale-gentle / whale-devotion，当前 active=whale-devotion），本地已有叶瞬光独立人设包 `personas/ye-shunguang/`（未接线未实测）。项目进入调优与展望阶段，用户想知道：当前设计能否在大肥鱼之外的「不同角色」间完美切换？有哪些可优化方向？
- **怎么解决的**：走查 brain 全层源码（types/store/retrieval/distill/emotion/inject/capture/http/page/config/index）+ 线上 snapshot 实测 + 叶瞬光种子包结构核对，按「切换时各层行为」逐层评估，定位耦合点并给出三轨模型与分级优化清单。

## 线上实测基线（2026-11-08，snapshot 回放口径）

- 人设 3 条：legacy（原有人设）/ whale-gentle / whale-devotion（active）
- 记忆 254 条（episodic 200 / semantic 48 / attitude 6）；personaId 分布：`<none>` 159（按 PRE_TAG_PERSONA_ID 归 whale-gentle）/ devotion 64 / gentle 31
- 画像 7 张（4 sess + 3 u:）；`personaDigest` 未配置 → 内部 prompt 用全量人设，无过期 digest 问题
- observe.log 多日轨迹证实：devotion 态度轨 0→3 自然破零；画像 lastWrittenByPersona 随驻留人设轮换（共享画像谁驻留谁写）

## 结论：能切换，但不完美

切换机制本身（文本热换、态度分轨、持久化、API、脑图 UI、导入导出）完整且即时生效。
真正的问题在**共享边界**：当前二轨模型「事实全共享 · 态度全分轨」对两类切换都不完美拟合——

- **换角色（大肥鱼 ↔ 叶瞬光）隔离不足**：角色的「自我记忆」（第一人称前史、"我答应…"承诺、人设口吻重的 episodic）没有轨道概念，落在共享池 → 双向泄漏。叶瞬光 18 条非态度种子全部第一人称（"我叫叶瞬光…"），merge 灌入现有库后，大肥鱼激活时也可能被当自己的记忆召回（种子无 embedding，先走 lexical 低门槛，backfill 补向量后才走 emb 门槛）。
- **换版本（gentle ↔ devotion）隔离过度**：attitude 严格按 personaId 分轨，同角色换装后立场从零长起。此为 10-30 任务刻意设计 + 11-05 观察任务已接受的权衡（驻留↔态度沉淀假设），不是 bug，但说明「同角色版本」与「不同角色」缺少区分维度。

## 逐层切换行为

| 层 | 切换时行为 | 评估 |
| --- | --- | --- |
| 人格内核文本 | persona-activate op → 下次 assemble 即换新（order 80 注入） | ✅ 干净 |
| persona.md 文件 | onPersonaSet 同步写 → 重启权威源跟随 | ✅ |
| 检索索引 | graphVersion bump → 自动重建 | ✅ |
| attitude 立场 | personaId 分轨，他人设不可见 | ✅ 严格隔离 |
| attitude merge/归并/去重 | 同轨限定（findAttitudeSameObject / sweepNearDups） | ✅ |
| 用户/群画像 | 共享，lastWrittenByPersona 仅展示标签 | ⚠️ 被当前人设文笔重写（已在观测） |
| episodic/semantic 用户事实 | 共享 | ✅ 合理（认识谁不该丢） |
| episodic/semantic 角色自我内容 | 共享 | ❌ 泄漏点（见上） |
| 情绪态 | 按 sessionId 存取，不随人设切换 | ⚠️ 残留旧情绪 + MOODS 大肥鱼味 |
| 会话脉络 digest | 共享，当前人设口吻滚动重写 | ⚠️ 可接受，留意 |
| 页面品牌 | 标题/头像/立绘写死大肥鱼 | ⚠️ 观感 |
| personaDigest 配置 | 全局单值 | ⚠️ 一旦配置只对单个人设正确（线上未配 = OK） |
| 会话级人设 | 无——激活全局生效，所有会话同切 | ➖ 展望 |
| 蒸馏批次归属 | 读「蒸馏时刻」的 activeId | ⚠️ 切换瞬间在途批次归新人设（小窗口） |

## 耦合点清单（代码级）

- `MOODS` / `MOOD_VALENCE`（types.ts:24-30）+ 蒸馏情绪锚点（distill.ts:52-54）：「炸毛/记仇/害羞/委屈」是大肥鱼情绪谱，叶瞬光（温软/坚毅/孤独/影子腹黑）映射不全
- 情绪键 = sessionId（emotion.ts），切人设继承旧情绪几轮
- `personaDigest`（config.ts:24）全局单值
- 启动硬编码播种 whale-gentle / whale-devotion（index.ts:103-108）
- `DEFAULT_PERSONA` 鲸文案兜底（config.ts:120-125）
- `PRE_TAG_PERSONA_ID='whale-gentle'`（types.ts:82）存量归属，合理保留
- page.html 品牌写死：标题 / brand / base64 双立绘（PERSONA_IMG、PERSONA_BANNER）/ notePid 默认 'whale-gentle'（page.html:6,326-381,500-502,1157）
- endOfTurn 读蒸馏时刻 activeId（brain/index.ts:251），在途批次窗口

## 核心设计建议：二轨 → 三轨（自我轨）

把「事实共享 · 态度分轨」升级为按**内容归属**的三轨：

1. **世界轨 world**：用户事实、群事件、画像、digest —— 全人设共享（维持现状）
2. **自我轨 self**：角色第一人称内容（我的前史、我的承诺、我的情绪快照）+ attitude —— 按 personaId（或 persona family）隔离
3. **版本继承（可选增强）**：`PersonaEntry.familyId`——同 family（如 whale-gentle/devotion）可选择继承 attitude 轨；跨 family 全隔离。原设计刻意严格分轨，family 是可选项不是必须项。

最小实现：`MemoryNote.self?: boolean`（或 `track: 'world'|'self'`）——
- 写入：distill prompt 让模型标「关于角色自己」的条目；确定性兜底——`对X:` 天然 self，「我…」开头的非 attitude 条标 self
- 检索：`attitudeVisible` 泛化为 `selfVisible`（self 条只对同 persona/family 可见）
- 种子：persona pack 生成器给第一人称种子打 `self:true`
- 迁移：存量 attitude 全视作 self；存量 episodic/semantic 中第一人称/角色自述条可一次性启发式回填

## 叶瞬光接入路径（现状已可行，无需改代码）

```bash
# 1. 部署前成对备份（插件 + brain-data，runbook 惯例）
# 2. seed-export.json 传服务器后 merge 导入：
curl -X POST 'http://127.0.0.1:4099/brain/api/import?mode=merge' \
  -H 'X-Brain-Token: <口令>' --data @seed-export.json
# 效果：注册 ye-shunguang 人设 + 灌 28 条种子（personaId/确定性 id 保留，
# 已有 activeId 故不抢占激活态；重复导入按 id skip 幂等）
# 3. 脑图页或 /api/personas/activate 激活
```

- ⚠️ merge 即可，**不要用 replace**（清库丢大肥鱼全部积累）
- ⚠️ 自我种子泄漏风险：建议先落 self 分轨再灌；或接受低概率 lexical 命中（桂花糕/练剑/哥哥类话题可能撞上）
- ✅ 种子含 10 条 attitude → 激活即有立场在场，冷启动体验优于 devotion 从零长态度

## 优化方向（分级）

**P0 切换正确性**
1. self 分轨：`MemoryNote.self` + `selfVisible` 过滤 + 种子打标（解双向泄漏）
2. 情绪按人设隔离：EmotionEngine key → `{personaId}:{sessionId}`；或激活时各会话情绪中性化
3. 蒸馏批次打「形成时」personaId 戳（ingest 时记 pid，不读蒸馏时 activeId）

**P1 接入体验**
4. persona pack 一等公民：`POST /api/personas/import-pack`（persona+notes+可选 moods/avatar）+ UI 入口；至少补 merge 导入指引文档
5. 激活前预览：assemble dry-run（?personaId=X 模拟注入）或切换确认显示「将继承 N 条共享事实 / M 条本轨态度」
6. MOODS 可扩展：`PersonaEntry.moods?: string[]`（蒸馏注入并集）；或先加通用词（坚定/怀念/慵懒/警觉）

**P2 通用化（配合 brain 脱离 dsh 的路线）**
7. 页面品牌跟人设走：PersonaEntry.avatar/banner，品牌文案读 activeId
8. 内置播种通用化：扫 `src/setup/*.md` 播种（约定优于配置）或内置人设迁出插件
9. `DEFAULT_PERSONA` 中性化

**P3 展望**
10. per-session persona：sessionPersona 覆盖层（一群一人设/私聊专属），assemble/蒸馏/情绪全走 effectivePersonaId
11. 人设自演化：persona.md 作慢变量（10-30 任务方案 C 遗产）
12. eval 用例补「人设隔离」断言（自我不串轨、事实共享正确）

## 切换冒烟清单（灌入后立即验证）

- `/api/state` 或日志：persona section = 新文本；attitudeLines 只剩本轨
- 情绪行是否残留大肥鱼情绪（现状会残留）
- 几轮后新记忆 personaId=ye-shunguang；画像 lastWrittenByPersona 更新
- 「你还记得桂花糖吗」类 query 命中种子
- 反向：切回 whale 后确认叶瞬光 self/attitude 不可见、whale 轨恢复

## 第二轮：用户定案与设计修正（2026-11-08）

### 已定

- **self 分轨：做**。
- **层级模型：采纳「角色 → 人设」两级**（用户提出，替代初稿的 family 标签）。
  - 角色（character）= 灵魂：拥有自我轨（self 记忆 + attitude + 情绪）；跨角色 = 新的起点。
  - 人设（persona）= 版本/衣服：仅拥有 prompt 文本（whale-gentle/devotion/legacy 是大肥鱼的三个版本）。
  - 世界轨 = 用户事实/画像/digest，全角色共享（换角色不失忆「谁是群友」）。
- **叶瞬光：不着急**；就算灌也是测试性质，事后可清理（现成路径：purge-by-persona + persona-delete）。

### 走查修正点

1. **attitude 归属：推荐角色级**（立场属于灵魂不属于衣服；whale 三轨合并需一次同对象去重，保留较新/较强）。备选=保持人设级（模型不一致，不推荐）。
2. **自我标记确定性判定**：蒸馏本就规定事实第三人称、承诺写「我…」——`addNote` 对「我/角色」开头的非 attitude 条打 `self:true` 即可覆盖蒸馏/种子/存量三路；LLM `self` 输出字段作补充。
3. **情绪免迁移**：`EmotionState` 加 personaId 标签，读时角色不符→中性（自愈，优于复合键）。
4. **导入白名单**：sanitizeNote/persona 校验须透传 `self`/`characterId`/`moods`。
5. **commitments 语义自洽**：鲸鱼承诺归 whale 自我轨，叶瞬光不记得符合其「忘记坦诚说」设定。
6. **avatar/banner 走文件**（`BRAIN_DATA_DIR/personas/<id>.png`），不进 op 流水/快照。
7. **画像/digest 共享但可加「中性第三人称」prompt 防口吻漂移**（顺手小改）。

### 实现要点（P0）

- `PersonaEntry.characterId?`（缺省=自身 id）+ `characterOf()`；whale 系三人设归 `'whale'`
- `MemoryNote.self?`；`attitudeVisible`→`trackVisible`（attitude/self 按角色过滤），检索四路同步
- attitude 相关匹配全改 character：findAttitudeSameObject / sweepNearDups / endOfTurn existing 过滤 / consolidate srcPersona
- `EmotionState.personaId` 标签 + 不符读中性
- ingest 钉形成时 personaId（修在途批次归属）
- 迁移：存量 attitude/self 归 whale 角色；同对象 attitude 归并

## Key Decisions

- **self 分轨：做**（换角色正确性底线）
- **角色→人设两级**：采纳用户模型；attitude 建议随自我轨升角色级（待用户确认 A/B）
- **叶瞬光**：P0 后 merge 灌入试跑，purge-by-persona 可清理
