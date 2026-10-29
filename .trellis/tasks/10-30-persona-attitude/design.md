# 技术设计：态度记忆层（kind='attitude'）

## A/B/C 评估

| 方案 | 机制 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A 态度笔记 | 新 kind 的记忆条目，走检索注入 | 复用检索/衰减/merge/forget/ops/UI 全链路；按相关性唤起=对不同对象反应不同；不被唤起的旧看法自然淡化 | 态度散落为条目，一致性靠检索质量 | **采用** |
| B 自我文档 | 巩固期全量重写 self doc，无条件注入 | 单文档连贯 | 无相关性（无关场景也占 token）；全量重写易丢旧立场；需新持久化槽位+API+UI | 不采用 |
| C 内核漂移 | persona 追加有界演化段 | 最贴近"人格会变" | 被群友注入污染风险（"你以后要…"）；需跨会话证据+人工门禁 | 留作长期方向 |

A 的关键洞察：态度本来就是**情境性唤起**的——人不会对无关话题表达立场。"按检索相关性出现"恰好是正确行为而非缺陷。

## 数据流

```
对话轮次 → distill（新 kind=attitude 条目，merge 指回旧条目更新）
        → BrainStore（与 episodic/semantic 同套持久化/衰减/遗忘）
用户消息 → PromptInjector（lastActor 取发言人昵称）
        → assemble(query, speakerNick)
        → topK 检索命中 + 昵称命中的 attitude 保底唤起（上限 3 条）
        → hits 按 kind 拆分：attitude → attitudeLines，其余 → memoryLines
        → 【当前立场】section (order 83) 注入 system prompt
```

## 改动边界

| 文件 | 改动 |
|---|---|
| `src/brain/types.ts` | `MemoryNote.kind` / `NoteDraft.kind` 加 `'attitude'`；`BrainContext` 加 `attitudeLines: string[]` |
| `src/brain/distill.ts` | PROMPT 说明 attitude 条目写法（「对<对象>：<立场>」+ merge 更新）；`parseDistillOutput` 解析 kind |
| `src/brain/index.ts` | `assemble(sessionId, queryText, speakerNick?)`：昵称保底唤起 attitude（≤3）；hits 按 kind 拆分输出 `attitudeLines` |
| `src/inject/prompt.ts` | 从 actor（`昵称 (openid)`）提取昵称传入 assemble；新增 `brain:attitude` section（order 83，`injectAttitude` 开关） |
| `src/config.ts` + `src/index.ts` | `injectAttitude` 配置项（默认 true）+ 启动日志 |
| `src/server/http.ts` | POST/PATCH notes 的 kind 类型联合加 `'attitude'` |
| `src/server/page.html` | kindLabel 映射（消掉 5 处三元表达式）、`.badge.attitude` 颜色、REGION.attitude 脑区锚点、node 字形「态」、libKind/addform/ne-kind 三个 select 加选项、panel 标题「态度立场」 |
| `test/brain.test.ts` | 新增用例 |

## 关键决策

1. **不加 `subject` 字段**。态度条目 content 规范为「对<对象>：<立场>」自带对象名；发言人匹配直接 `content.includes(nick)`。减少 schema 膨胀。
2. **双通道唤起**：话题型态度走 topK 检索（按相关性出现）；「对当前发言人」的态度走昵称确定性保底（上限 3 条）——对正在说话的人的态度是恒定上下文，不应被检索分数挤掉。保底条目同样计入唤起强化。
3. **态度不进巩固输入**：consolidate 只过滤 `kind==='episodic'`，天然排除——态度本身就是稳定态，不需要再被提炼成语义记忆。
4. **发言人昵称提取**：actor 格式 `昵称 (openid)`，取 `' ('` 之前部分；昵称可能含括号（`小鱼 (夜猫子) (openid)`），取最后 ` (hex)` 组前的全部。
5. **merge 时同步 kind**：updateNote patch 已支持 kind，merge 到旧条目时若 LLM 标了 attitude 则一并更新。

## 明确不做

- persona 内核自更新（方案 C）——本任务只加态度层
- 态度的单独遗忘策略/强度参数——复用现有衰减
- 语义巩固对态度的再提炼
