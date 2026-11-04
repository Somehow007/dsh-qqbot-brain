# 画像重生成裸昵称actor归集失败

## Goal

脑图页用户画像点重生成报「该对象暂无可用的记忆」：regenerateProfile 对 u: 键只按 openid 过滤记忆，但蒸馏落库的 actor 多为裸昵称

## Requirements

- `regenerateProfile` 对 `u:` 键的佐证记忆归集须覆盖裸昵称 actor 的记忆（真实蒸馏输出格式）
- 匹配口径与 `assemble()` / `mergedUserProfile()` 一致：openid 或昵称双口径命中

## Acceptance Criteria

- [x] 裸昵称 actor 的记忆能被归集为画像重生成的佐证（新测试覆盖）
- [x] 带 `昵称 (openid)` 全 tag 的记忆照常命中（原测试保持）
- [x] typecheck + 全部测试通过

## Resolution（2026-11-04）

### 遇到了什么问题

用户在脑图页对「用户画像」卡（u: 键）点「重生成」后弹窗报错：`重生成未完成：该对象暂无可用的记忆`。

### 怎么解决的

排查链路：前端 `POST /api/profiles/regenerate` → `brain.regenerateProfile(key)`（index.ts:537）。对 `u:` 键，佐证记忆过滤条件是 `splitActor(n.actor).openid === k.slice(2)`——只认 `昵称 (openid)` 全 tag。但蒸馏 prompt（distill.ts:56）明确指示 `memories.actor 写该发言人昵称`，真实落库数据（~/brain-data/brain.jsonl）里 9 条记忆仅 1 条带全 tag，其余全是裸昵称（`demo`、`花咲蝶舞（五笑）`、`大肥鱼` 等），`splitActor` 拆出 `openid: undefined` → 全部漏掉 → evidence 为空 → 409。

修复：`src/brain/index.ts` `regenerateProfile` 改为 openid 或昵称双口径归集——昵称取 `entry?.name || speakers().get(openid)`，与 `assemble()`（index.ts:176）和 `mergedUserProfile()`（store.ts:646）的既有口径一致。

### Key Decisions

- 昵称精确匹配而非模糊匹配：`花咲蝶舞（五笑）` 这类带全角括号昵称依靠 entry.name 精确对齐，不引入 contains 级别的误命中
- 同名不同人的 over-match 风险接受：与 assemble/mergedUserProfile 是同一权衡，不单独收紧
- 测试新增「裸昵称 actor 归集」用例，沿用既有 mock distiller 写法（区分撰稿/审核 prompt）

### 验证结论

- `npm run typecheck` 干净；`npm test` 130/130 通过（含新增用例）
- 用真实数据推演：`u:B24EA87B…`（花咲蝶舞）修复前 evidence=0 必报 409，修复后命中 2 条裸昵称记忆

### 后续优化方向

- 蒸馏落库时能否把 `turn.actor` 的全 tag 回填到 note.actor（而非只留昵称），从数据源头统一身份格式——属破坏性迁移，需另议
- `蒸馏调用失败` reason 实际也覆盖「模型成功但输出空 profile」的情况，错误语义可再细分

### 什么时候干的

2026-11-04 定位、修复、补测试并验证，直接改在 main 工作区。
