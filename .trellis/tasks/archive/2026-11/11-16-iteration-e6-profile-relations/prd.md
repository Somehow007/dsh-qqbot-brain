# 迭代 E6：画像关系事实角色隔离

## 背景与触发

- 触发证据：`11-15-private-chat-persona-voice` 实证——流萤激活时共享画像仍写「demo 与鲸鱼娘是恋人关系」，把 demo 锚到鲸鱼娘身上，私聊声口漂移。
- 立项出处：`11-09-iteration-upgrade-plan/iteration-plan.md` E6 行——「蒸馏写画像时给关系事实打 characterId/拆 persona 作用域，assemble 按激活角色过滤」。

## 问题

画像按人共享（世界轨），对所有角色注入。其中「X 与角色 Y 是恋人/亲属/师徒」类事实是 **persona-relative** 的：对 Y 有意义，对其他角色是噪声甚至锚定干扰。现有 `PROFILE_RELATION_RULE` 只要求点名角色，点名≠过滤——事实仍会注入给所有人。

## 方案（标记制，仿 `〔私〕` 先例）

画像句级标记 `〔角·角色名〕`：蒸馏/巩固/撰稿把「与角色的关系」句写成 `〔角·鲸鱼娘〕demo 与鲸鱼娘是恋人关系。`；assemble 注入时按激活 characterId 过滤：

- 标记名命中**本角色**人设（name 包含/被包含，或人设正文含该名）→ 保留并去标记；
- 只命中**他角色** → 整句剥除；
- 命中多个角色（重名/正文提及）或无人设命中 → 保留去标记（未知不误删，等价现状）；
- 无标记句 = 世界共享事实，不受影响。

与 `〔私〕` 复合：私域句可同时带角色标记（`〔私〕〔角·X〕…` 或 `〔角·X〕〔私〕…` 均按整句处理——私域剥离先行，角色过滤后行，外角色连私域关系句也看不到）。

## 改动边界

- `src/brain/store.ts`：新增 `scopeProfileChars(text, isForeignChar)` 纯函数 + 正则（句界口径与 `stripPrivateSegments` 一致：`。/\n/文末`）。
- `src/brain/index.ts`：`profileCharScope()` 由 `listPersonas()`+`characterOf()` 构造判定器；assemble 中对 `personProfile`/`sessProfile` 各过一次。
- `src/brain/distill.ts`：`PROFILE_RELATION_RULE` 增加标记要求（三处引用自动生效）；`PROFILE_REVIEW_PROMPT` 增标记保留条款。
- `test/brain.test.ts`：过滤函数单测 + assemble 级验证。
- **不做**：ProfileEntry schema 变更、存量画像迁移（无标记=现状安全）、page.html 展示层（标记对管理端透明可见，后续再议）。

## 成本

零新增 LLM 调用；prompt 常量微涨；assemble 每轮一次小字符串正则（人设≤10 个）。失败静默：过滤函数纯同步无异常路径。

## 验收

- 代码：`npm run typecheck && npm test && npm run build && npm run eval` 全绿；单测覆盖 外角色剥除/本角色保留去标记/未知名保留/〔私〕复合/多句混合。
- 实证（登记 acceptance）：流萤私聊走查，注入画像不再含鲸鱼娘关系句；鲸鱼娘侧不受影响（标记句保留）。

## Resolution (2026-11-15)

**遇到了什么问题**：画像按人共享对所有角色注入，「demo 与鲸鱼娘是恋人关系」类 persona-relative 事实在流萤/叶瞬光激活时把 demo 锚到鲸鱼娘身上，私聊声口漂移（11-15-private-chat-persona-voice 实证 R2/R4）。

**怎么解决的**：句级标记制（仿〔私〕先例），零 schema 变更——
- 蒸馏/巩固/撰稿三路经 `PROFILE_RELATION_RULE` 把关系句写成 `〔角·角色名〕` 开头；审核路保标记与角色名；
- `store.scopeProfileChars(text, isForeignChar)` 纯函数按句界（。/\n/文末，同 stripPrivateSegments）过滤；
- `Brain.profileCharScope()` 由 listPersonas+characterOf 构造判定器：标记名命中本角色人设（name 归一化互相包含/短边≥2字，或人设正文含该名）→保留去标记；只命中他角色→整句剥除；多角色/无人设命中→保留去标记（未知不误删）；
- assemble 对 personProfile/sessProfile 各过滤一次；与〔私〕复合兼容（私域剥离先行，外角色连私域关系句也看不到）。

**什么时候干的**：2026-11-15 19:31 CST 部署生产（备份 pre-e6-{plugin,data}-20261115T113053Z.tgz，rsync dist+package.json，restart active，启动日志全特性 on，/brain 401=存活需 token）。

**Key Decisions**：
- 选标记制而非 ProfileEntry schema 拆分：复用〔私〕成熟模式，存量无标记画像天然兼容=零迁移；
- 未知标记名默认保留（等价标记前行为）而非剥除——关系事实非隐私数据，宁可漏过滤不可误删；
- 标记名匹配用「人设 name 包含 + 人设正文 includes」双通道，兼容人设显示名≠ fiction 角色名的情况；
- page.html 管理端展示保留原始标记（透明可见），未做展示层美化。

**验证**：typecheck+276 test+build+eval 绿（eval 4 FAIL=ACC-08 豁免基线）；新增 scopeProfileChars 单测（外角色剥除/本角色去标记/未知名保留/〔私〕双序复合）+ assemble 级双角色过滤测试。实证验收登记 ACC-11（待触发）：新蒸馏画像出现〔角·〕标记 + 他角色注入核对。

**后续方向**：ACC-11 走查；若 LLM 标记遵从率低，考虑 review 路强化或 fallback 启发式；管理端可选标记可视化。
