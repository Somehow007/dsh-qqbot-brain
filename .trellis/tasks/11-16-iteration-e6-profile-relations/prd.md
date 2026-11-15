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
