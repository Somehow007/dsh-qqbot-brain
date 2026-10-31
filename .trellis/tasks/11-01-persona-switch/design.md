# 人设切换设计

## Change Boundary

当前只有一个可编辑 `persona` 字符串，保存即替换；目标是在不丢失原文的前提下支持多个人设和一个全局活动指针。所有选取和持久化在 `BrainStore`/`Brain`，而不是由页面本地保存或仅在注入器中替换。影响 `src/brain/store.ts`、`src/brain/index.ts`、`src/setup/persona-file.ts`、`src/index.ts`、`src/server/http.ts`、`src/server/page.html`、预置 Markdown、构建脚本与相应测试。`src/inject/prompt.ts` 继续消费 `brain.persona()`，不修改记忆/画像和自动发言逻辑。

## Data Model and Migration

- 用稳定 ID（非名称）标识人设：保留 `legacy` 给迁移来的现有内核，预置 `whale-gentle` 给用户提供的温柔版，自定义人设分配随机 ID。状态为 `personas: [{id,name,text}]` 与 `activePersonaId`，所有记录在现有 JSONL 事件及快照中持久化；新增、修改和切换均可重放。沿用老 `persona` op/快照字段读取，首次升级时生成 `legacy`，不修改现有文案；预置仅在缺少时补入，不抢活动指针。避免预置版本每次重启覆盖用户已编辑版本。
- 继续把活动人设全文镜像到 `persona.md` 供现有手工编辑与外部读取：启动时若文件内容与当前持久化活动项不同，按原“文件权威”语义写回活动项；API 切换、活动项保存、备份导入均同步镜像文件。非活动项修改不写这个文件。旧配置/默认人设仍走原回退链。
- `Brain.persona()` 始终返回活动项文本，`Brain.graph()` 和 `GET /api/persona` 的旧 `persona`/`text` 字段继续表示活动全文。

## API and UI

- 新增 `GET /api/personas` 返回完整列表和 `activeId`（页面编辑需要全文）；`POST /api/personas` 新增名称/全文；`PATCH /api/personas` 携 `id` 修改名称/全文；`POST /api/personas/activate` 携 `id` 切换活动项。固定路径适配宿主 webServer 的精确路由注册。验证名称、非空文本、唯一 ID；无效 ID 返回 404，非法输入 400。旧 `POST /api/persona` 继续修改当前活动项；已有口令保护和宿主 webServer 挂载同样覆盖新路由。
- “人格内核”页签显示活动项与下拉选项，提供新增人设、编辑名称/全文、保存与明确的“设为当前人设”动作；未保存改动在切换选择时确认，定时刷新不重置草稿。页头/脑图内核详情显示当前名称。默认显示旧版为活动，温柔版为非活动。
- 预置内容从用户提供的 Markdown 原样纳入仓库，构建时复制到 dist，以便 npm 打包部署也可用；不依赖开发者本机 `/Users/...` 路径。

## Backup and Compatibility

- 保留 v1 `persona` 活动全文字段，增加可选 `personas`/`activePersonaId`；旧备份只有 `persona` 时按“旧活动内核”处理。新备份的 replace 恢复列表与活动指针；merge 不覆盖同 ID 已有自定义内容或当前活动选择，冲突可跳过且提示。页面导出改为消费服务端现有 `/api/export`，避免手工组装漏掉人设列表与摘要；导入展示明确成功/失败。
- 导入在验证数据后再执行 replace；导入完成通过插件回调同步 `persona.md`，避免重启被旧文件内容覆盖。升级、快照压缩、重复启动、备份恢复均需回归测试。

## Risks and Deferred

- 既有仓库已有暂存的其他任务档案，不纳入本任务修改。切换是全局行为，当前正在生成的回复不保证切换中途重写；只保证后续组装使用新内核。
- 删除人设、按群独立切换、在页面直接上传本机 Markdown 文件留待后续。若需手工回退，保留原 `persona.md`/旧版备份与旧活动内核条目，页面可一键切回。
