# 记忆actor回填全tag与重生成reason细分

## Goal

两个优化：1) 蒸馏/巩固落库时把 LLM 裸昵称 actor 用真实全tag回填，从源头统一身份格式；2) regenerateProfile 区分「蒸馏调用失败」与「起草判空」两种 reason

## Requirements

- 蒸馏（endOfTurn）与语义巩固（consolidate）写入 note.actor 时，裸昵称按可信来源（本轮 turns actor / 源记忆 actor）回填为「昵称 (openid)」全 tag
- 已是全 tag 或查无对应发言人时原样保留，不造幽灵身份
- `draftProfile` 返回三态：undefined=调用失败/输出无法解析；''=模型判定无可提炼稳定内容；非空=草稿
- `regenerateProfile` 对应给出「蒸馏调用失败」/「起草认为没有可提炼的稳定内容，未改动」两种 reason

## Acceptance Criteria

- [x] 裸昵称记忆落库为全 tag（endOfTurn + consolidate 各一条测试）
- [x] `resolveActorTag` 单测：回填/已带tag/查无此人/空白四种分支
- [x] 起草判空 vs 调用失败 vs 输出无法解析 三种 reason 测试
- [x] typecheck + 全部测试通过

## Resolution（2026-11-04）

### 遇到了什么问题

上一任务（11-04-actor）修复 `regenerateProfile` 时暴露两个上游欠账：①蒸馏 prompt 让 `memories.actor` 只写昵称，note.actor 永远落不成全 tag，靠 openid 匹配的所有下游（重生成、跨群召回、speakers 注册表）先天缺数据；②`draftProfile` 把「调用失败」和「模型判空」都折叠成 undefined，页面一律报「蒸馏调用失败」，语义错误。

### 怎么解决的

- 新增 `identity.ts` `resolveActorTag(actor, tags)`：裸昵称按可信 tag 源（本轮 turns / 巩固源记忆的 actor）回填全 tag；已带 openid 或查无此人原样返回；纯空白归一 undefined
- `endOfTurn` 落记忆时 `actor: resolveActorTag(m.actor, actors)`；`consolidate` 语义记忆同理沿用源记忆全 tag；`turns.map(t=>t.actor)` 顺手提为 `actors` 复用
- `distill.ts` 拆 `call` 为 `callRaw`（返回原文/undefined）+ `call`（+parseDistillOutput），`draftProfile` 改用 `callRaw` 实现三态返回
- `regenerateProfile` 按三态分流 reason，判空时跳过审核不再误报「调用失败」

### Key Decisions

- 只做写路径回填，不动存量数据：旧裸昵称条目由双口径匹配（上一任务）兜底，迁移存量有同名歧义风险，收益小
- 回填映射只认「真实出现过的 actor」为源，不信任 LLM 自报 openid——与 resolveProfileTarget 的身份校正同一原则
- 解析不出 JSON 的草稿输出按「调用失败」论，不新增第三类 reason（页面只需知道「没成，可重试」）

### 验证结论

- `npm run typecheck` 干净；`npm test` 137/137 通过（新增 4 条用例）
- 真实数据推演：今后蒸馏的 `demo` → `demo (99449CA8…)`，speakers 注册表会积累真实 openid，重生成 openid 口径命中率回升

### 后续优化方向

- 存量裸昵称记忆可选做一次性迁移（仅当昵称在 speakers/u:画像名中唯一时回填），收益边际，暂不做
- `note.actor` 双轨（nick + openid 字段分列）是更彻底的方案，动 schema 面大，先看回填效果

### 什么时候干的

2026-11-04 实现、补测试并验证，直接改在 main 工作区。
