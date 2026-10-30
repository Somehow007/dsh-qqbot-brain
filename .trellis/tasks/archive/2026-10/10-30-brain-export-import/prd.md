# 脑图页导出导入

## Goal

在脑图页（`/brain`，dsh-qqbot-brain/src/server/page.html）加导出/导入功能，便于把记忆、人格内核、会话画像、情绪状态整体迁移到另一个实例（换部署 / 换机器 / 备份）。

## Confirmed Facts

- 存储层 `BrainStore`（src/brain/store.ts）的快照格式即 `{notes, emotions, profiles, persona}`（`compact()` L111-129），可直接作为导出格式；JSONL 追加写，新增 op 需在 `Op` union 与 `apply()` 中登记。
- HTTP API 在 src/server/http.ts；新端点除 `route()` 外，还要在 `start()` 的 `webServer.register` 子路径列表（L166-168）登记。
- `readBody` 默认上限 64KB（http.ts L24-31），导入需要放宽（笔记全量可能远超 64KB）。
- 前端数据区是 tab 结构：记忆库 / 会话画像 / 事件流水 / 人格内核（page.html L277-314）。
- 测试用 node:test + tmpdir 的 BrainStore（test/brain.test.ts L20-23）。

## Requirements

- **导出**：`GET /api/export` 返回 `{version, exportedAt, persona, notes, emotions, profiles}`，`Content-Disposition` 附件下载 `brain-export-<date>.json`。
- **导入**：`POST /api/import?mode=merge|replace`，body 为导出 JSON（上限放宽到 ~10MB）。
  - `merge`：按 note id 去重 upsert，保留现有数据，可重复导入；persona/profiles/emotions 被导入值覆盖（若存在）。
  - `replace`：先写一条新 op `reset` 清空全部 maps（事件流水留痕），再整包回放。
  - 导入的 note 走 `add` op，保留原 id / createdAt / strength / lastAccessAt / hits → 衰减保持率在迁移后不重置。
- **前端**：数据区新增「备份迁移」页签：导出按钮、文件选择、合并/覆盖单选、覆盖时二次确认。
- `Brain` facade 增加 `exportData()` / `importData(data, mode)`。

## Acceptance Criteria

- [x] `npm run typecheck` 通过
- [x] `npm test` 通过（32 pass），含新增 store 层测试：export→import 往返一致、merge 幂等去重、replace 清空后恢复、脏数据清洗
- [x] 页面上可下载导出文件；导入后记忆/人格/画像/情绪即刻可见（走 op 写入，事件流水可见 reset/add/persona 记录）
- [x] `npm run build` 通过（page.html 已拷入 dist）

## Resolution（2026-10-30）

已实现：
- `src/brain/store.ts`：`Op` 新增 `reset`；`BrainExport` / `ImportResult` 类型；`exportData(now)`、`importData(raw, mode, now)`；`sanitizeNote` / `sanitizeEmotion` 清洗。
- `src/brain/index.ts`：`Brain.exportData()` / `Brain.importData(data, mode)`。
- `src/server/http.ts`：`GET /api/export`（Content-Disposition 附件）、`POST /api/import?mode=merge|replace`（body 上限 10MB），已注册进 webServer 子路径列表。
- `src/server/page.html`：新增「备份迁移」页签（导出链接 + 文件选择 + 合并/覆盖单选 + 覆盖二次确认）；`OP_CN`/`opDesc`/`.ok-ind` 支持 `reset`。
- `test/brain.test.ts`：4 个新测试全部通过。

## Key Decisions

- 导入提供合并 / 覆盖两种模式（用户选定），覆盖需前端二次确认。
- 导出全量（persona + notes + profiles + emotions），不做字段挑选——迁移场景要的是完整转移。
- 导入走 op 持久化（add/persona/profile/emotion/reset），保证 JSONL 与事件流水一致、可审计。

## Out of Scope

- 加密/脱敏、选择性导出（按会话/类型过滤）、自动定期备份。

## Post-fix（2026-10-30）

导出改为前端组装：`page.html` 每次请求实时读盘，但 `http.js` 需重启生效——重建未重启时新页面 + 旧 API 会导致导出 404 下到错误文本。现用已有的 `/api/state` + `/api/sessions` 拼全量包、Blob 本地生成 `brain-export-YYYY-MM-DD.json` 下载，服务端 `/api/export` 仍保留供 curl 使用；导入依赖 `/api/import`，需重启插件生效。
