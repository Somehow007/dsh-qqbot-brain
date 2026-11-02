# 脑图管理面并发与体验遗留

## Goal

画像卡管理与危险区（task `11-02-profile-admin-memory-reset`，commit `009c0ab`/`6aa2d89`/`e6155a5`）两轮走查后遗留的问题池。逐项独立，**适合攒一起做一次「管理面加固」**，不建议单独开任务。

## Background / 遗留问题清单

### I1 — 写回竞态（P2，两轮走查均确认，最重要）

脑图页管理操作与在途 LLM 调用之间没有互斥：

- **重置 vs 在途蒸馏**：`resetMemory()` 清了 turnBuffer/historyBuffer/EmotionEngine，但如果点重置瞬间恰有一轮 `distill()` 在飞，它完成后的 writeback（新记忆/画像/情绪）会把**重置前** turns 的结果写回 store。ops 流水仍一致可重放，但「重置」语义不干净。
- **按时段删除 vs 在途蒸馏**：`del-range` 删完后，在途蒸馏产出的新记忆是从删除前的 turns 提炼的——语义上属于「已删时段」的内容重新入库。
- **画像删除/编辑 vs 在途重生成**：`regenerateProfile()` 两跳 LLM（draft→review）期间，用户又删了该画像或手动改了它，review 返回后无条件 `setProfileEntry` 覆盖。

ops 追加模型保证数据不损坏，竞态只影响语义正确性，故降为 P3。

**修法方向**（届时再定）：
- 版本戳：store 维护 `dataEpoch`，reset/purge 时递增；distill/regenerate 调用前取快照 epoch，writeback 前比对，不一致则丢弃结果。改动小、覆盖全。
- 或互斥标志：管理操作期间 `distilling` 中则在途结果作废；管理操作排队等 in-flight 结束。实现略繁。
- regenerate 写回前复查 `profileEntry` 的 `updatedAt` 是否变过（读时快照 vs 写时对比，CAS 语义）。

### I2 — 时段删除预览快照滞后（P5，提示级）

`purgeRange()` 预览数基于上次 `load()` 的 `STATE.notes` 客户端快照；预览后新入库且落入区间的记忆会被多删而预览不体现。当前靠接口返回真实 `deleted` 兜底展示。

**修法方向**：预览按钮改为调服务端 `POST /api/notes/purge?dry=1`（或 GET 计数端点），用服务端实时计数；删除响应已返回真实值，只需让预览同源。

### I3 — 批量「全部重建」画像入口

`regenerateProfile` 目前单卡单调。若画像体系 prompt 大改或需全量刷新，只能逐卡点。可加 `POST /api/profiles/regenerate-all`（遍历有佐证的画像键逐个走 draft→review），注意限流与失败汇总。

### I4 — 按会话/按人粒度重置

`resetMemory` 现只有「全清保人设」一档。可选增强：`DELETE /api/notes?sessionId=`、`POST /api/reset?sessionId=` 或 `?person=`，需设计会话级 op（`del-range` 已示范显式 ids 模式，可复用思路：`sess-purge{sessionId, ids[]}`）。

### I5 — QQ 聊天指令面（明确暂缓）

管理操作目前只在脑图页。若以后要在群/私聊里做 `/画像`、`/忘了我` 类指令，需先设计管理员鉴权与群安全边界——这是 11-02 任务讨论时明确 out-of-scope 的。

## Acceptance Criteria

- [ ] I1：重置/时段删除后，在途蒸馏的写回不复活已清数据（版本戳或互斥任一方案）；regenerate 与并发编辑/删除按 CAS 语义，后到者不静默覆盖
- [ ] I2：预览数与实删数同源（服务端实时计数）
- [ ] I3（可选）：批量重生成可用且有失败汇总
- [ ] I4（可选）：会话/人粒度重置可用，op 可重放
- [ ] `npm test` + typecheck + build 全绿

## Notes

- 本任务是问题池/停车场的定位：开工时可再拆分，不要求一次全做完。
- 11-02 的两轮走查结论见其 prd.md Resolution 与 journal Session 37/39/后续。
