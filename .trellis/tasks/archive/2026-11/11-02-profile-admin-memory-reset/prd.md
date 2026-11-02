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

- [x] AC1 (R1/R2)：页面画像卡有 编辑/删除 按钮；编辑保存后卡片文本更新、jsonl 有 profile op；删除确认后卡片消失、jsonl 有空文本 profile op。
- [x] AC2 (R3)：person 卡点「重生成」→ 蒸馏+审核后画像文本更新且 `reviewed` 落库；蒸馏关闭时返回失败提示且数据不变。
- [x] AC3 (R4)：选定时间区间预览数与实删数一致；区间外记忆不受影响；jsonl 只有一条 `del-range` op 且含全部删除 id。
- [x] AC4 (R5)：点「记忆重置」确认后 notes/profiles/emotions/digests 全空，personas 与当前人设不变；重置后 assemble() 不再注入旧情绪（内存态已清）。
- [x] AC5 (R6/R7)：`del-range` 与 `reset{keepPersona}` 经 flush+重放结果一致；旧格式 reset op 重放仍全清。
- [x] AC6：`npm test`（120/120）、`npm run typecheck`、`npm run build` 全绿。

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

## Resolution（2026-11-02）

**遇到了什么问题**：画像卡在脑图页只读，脏画像（如 sess:832f1a89 被写成 bot 人设）只能靠手写 profile op 清理；记忆重置没有独立入口，唯一等价路径是「先导出备份再覆盖导入」；用户还需要按指定时间段删记忆的能力。

**怎么解决的**（commit `009c0ab`，main 直接开发无 PR）：
- store：`reset` op 加 `keepPersona` 字段（旧记录无字段重放仍全清）；新 `del-range` op **显式携带删除 ids**——区间谓词重放不确定，后入库的老 createdAt 记忆会被误删；新增 `resetMemory`/`deleteNotesInRange`/`hasProfile`/`profileEntry`。
- Brain：`updateProfile`/`deleteProfile`/`regenerateProfile`（draftProfile 新 prompt 起草 → reviewProfiles 审核把关）/`purgeNotesInRange`/`resetMemory`（同时清 EmotionEngine 内存态与轮次缓冲，防旧数据回写）。
- HTTP：PATCH/DELETE `/api/profiles`、POST `/api/profiles/regenerate`、POST `/api/notes/purge`、POST `/api/reset`；宿主 webServer 白名单补齐（顺带补上此前漏注册的 `/api/profiles/merge`）。
- 页面：画像卡三按钮（person+session 卡通用，编辑/重生成为 upsert，未知键 404 防幽灵画像）；备份迁移页加「危险区」（datetime-local 区间 + 客户端预览数 + confirm）；事件流水补 `del-range` 中文名与 `reset{keepPersona}` 文案。

**Key Decisions**：见上文 Key Decisions 节；实现中追加——① 编辑/重生成放宽为 upsert（「画像未生成」卡也能用），以「记忆佐证/已知会话」判对象真实性；② draft prompt 首句改为「人物画像撰稿模块」，避开测试 mock 按「长期人物画像的编辑」匹配审核 prompt 的冲突。

**验证结论**：`node --test` 120/120（新增 6 个用例：del-range 重放不吞后入库记忆、resetMemory 保人设+旧 op 全清、profile upsert 门禁、regenerate 三路、重置后 assemble 无旧情绪、http 全端点）；typecheck/build 绿；独立端口实例冒烟 `/api/state|profiles|regenerate|notes/purge` 全部符合预期。

**后续优化方向**：重置/时段删除暂不支持按会话或按人粒度（需要会话级 op 设计）；重生成目前单卡单调，如需批量「全部重建」可再加批处理入口；QQ 聊天指令面仍是空白（本次明确不做）。

**什么时候干的**：2026-11-02，brainstorm 收敛（三轮用户决策：入口=脑图页、重置保人设、时段删=笔记粒度、画像含重生成）后一次实现完成。
