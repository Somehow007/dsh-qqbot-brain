# 人物画像管理与记忆重置

## Goal

在 /brain 脑图页补齐缺失的数据管理面：画像卡可编辑/删除/重生成；记忆可按指定时间段批量删除；提供保留人设的记忆重置入口。

## Background

- 「画像」tab 目前只读（person `u:<openid>` + session `sess:<id>` 卡 + 合并按钮），脏画像只能手写 profile op 清理（11-02 清 `sess:832f1a89` 的实际操作路径）。
- store 层 `reset` op 存在但只被覆盖导入间接触发，且连人设一起清。
- 用户决策（2026-11-02）：入口=脑图页（不做 QQ 指令）；重置保留人设；时间段删除只删记忆笔记；画像功能含重生成（复用 reviewProfiles 审核通道）。

## Requirements

- R1 画像编辑：画像卡可修改文本与名称，保存即落库（`setProfileEntry`，标记已审），500 字上限沿用 `truncateProfileText`。
- R2 画像删除：单卡删除（person 与 session 卡均可），带确认；空文本 profile op 语义即删除。
- R3 画像重生成：按 key 归集该对象的记忆（`u:`→actor openid 匹配；`sess:`→sessionId 匹配），蒸馏模型出草稿 → `reviewProfiles` 审核 → 写回；蒸馏不可用/无记忆/审核判空时不改数据并报原因。
- R4 按时间段删除记忆：给定起止时间（含端点，按 `createdAt`），一键删除区间内全部记忆笔记；前端先预览数量、确认后执行。
- R5 记忆重置：清空笔记+画像+情绪+摘要，**保留人设**（personaText/personas/activeId 不动）；同时清 Brain 内存态（EmotionEngine states、turn/history buffer、轮数计数），防旧数据回写。
- R6 可审计：删除与重置走 op 流水（事件流水页可见）；`del-range` op 显式携带删除 id 列表——区间谓词重放不确定（后导入的老 createdAt 记忆不该被误删）。
- R7 兼容：旧 jsonl 中无 `keepPersona` 字段的 `reset` op 重放仍为全清，语义不变。

## Acceptance Criteria

- [ ] AC1 (R1/R2)：页面画像卡有 编辑/删除 按钮；编辑保存后卡片文本更新、jsonl 有 profile op；删除确认后卡片消失、jsonl 有空文本 profile op。
- [ ] AC2 (R3)：person 卡点「重生成」→ 蒸馏+审核后画像文本更新且 `reviewed` 落库；蒸馏关闭时返回失败提示且数据不变。
- [ ] AC3 (R4)：选定时间区间预览数与实删数一致；区间外记忆不受影响；jsonl 只有一条 `del-range` op 且含全部删除 id。
- [ ] AC4 (R5)：点「记忆重置」确认后 notes/profiles/emotions/digests 全空，personas 与当前人设不变；重置后 assemble() 不再注入旧情绪（内存态已清）。
- [ ] AC5 (R6/R7)：`del-range` 与 `reset{keepPersona}` 经 flush+重放结果一致；旧格式 reset op 重放仍全清。
- [ ] AC6：`npm test`、`npm run typecheck`、`npm run build` 全绿。

## Out of Scope

- QQ 聊天指令面（已明确不做）
- 重置连人设一起清（如需清人设走「人格内核」页删除，已有入口）
- 按会话/按人的记忆局部重置；时间段删除扩展到画像/情绪/摘要
- 画像编辑锁定（手动编辑不阻止后续蒸馏修订，符合画像由蒸馏产出的设计）

## Key Decisions

1. `del-range` op 携带显式 ids：replay 确定性优先于 jsonl 体积（见 R6）。
2. 重生成 = 新 `distiller.draftProfile` 草稿 + 既有 `reviewProfiles` 审核，两跳都失败才报错，审核判空不写。
3. 手动编辑画像置 `reviewed=text`（人工即审），不锁定后续蒸馏修订。
4. 重置 API 只做「保人设」一种语义，不暴露全清选项（全清=覆盖导入已有等价路径）。

## Open Questions

无阻塞项。
