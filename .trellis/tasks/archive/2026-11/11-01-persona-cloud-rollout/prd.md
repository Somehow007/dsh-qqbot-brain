# 云端部署脑图人设切换

## Goal

将本地已验证的多人设版本 `36ca91c` 部署到既有云服务器，使正在运行的脑图和机器人都使用最新版，并保护服务器现有人设与记忆。

## Confirmed Facts

- 2026-11-01 用户确认“上传吧，保证线上是最新的”；此前明确确认先备份插件和 `brain-data`，仅上传 `dist` 与 `package.json`，不覆盖远端 `cordis.patch.yml`，然后重启并验证。
- 已只读核对服务器 `ubuntu@124.222.65.169`：`/home/ubuntu/dsh-qqbot-brain` 是插件目录，profile 中 `@local/dsh-qqbot-brain` 指向该目录；`dsh-qqbot.service` 处于 active，脑图本机端口 4099 返回 HTTP 200；数据目录为 `/home/ubuntu/brain-data`，有 `persona.md` 和既有备份。
- 本地 `npm test` 72/72、`npm run typecheck`、`npm run build`、`npm pack --dry-run` 已通过，内置 Markdown 与用户原文件字节相同；本地仍有其他任务的已暂存档案，与本次部署无关。

## Requirements

- R1 在任何覆盖和服务重启前生成可用于回滚的插件及脑数据备份，不删除现有备份或远端配置。
- R2 只同步本地 `dist` 与 `package.json` 到 `/home/ubuntu/dsh-qqbot-brain`，保持远端插件 link、`cordis.patch.yml`、`brain-data` 和凭据不变。
- R3 重启 `dsh-qqbot.service` 让新 dist 生效；核对服务健康、线上页面/人设接口、新预置可见但旧活动人设仍保持原文。
- R4 一旦验证不通过，先停止扩大操作并说明故障；若需回滚，再用此次备份恢复并重新验证。

## Acceptance Criteria

- [x] 新插件与数据备份文件都存在，名称可定位本次部署，远端现有人设/记忆未直接覆盖。
- [x] 远端关键构建文件（包括 `dist/setup/whale-gentle.md`、`dist/server/page.html`）与本地一致，`cordis.patch.yml` 未修改。
- [x] 服务重启后 active，脑图/JSON API 可用，`GET /brain/api/personas` 有 `legacy` 与 `whale-gentle`，仍以旧人设为当前活动项。
- [x] 无失败需回滚；回滚所需的插件和数据归档均已保存，未宣称执行真实 QQ 聊天验证。

## Out of Scope

- 不改服务器配置、凭据、防火墙或 QQ Bot 用户数据；不主动发送真实聊天消息，不切换当前人设。

## Key Decisions

- 用户已批准有备份的上传与重启；先在服务器留可回滚副本，再覆盖插件构建产物。

## Resolution（2026-11-01）

- **遇到了什么问题**：本地多人设代码和预置已经提交并通过测试，但线上机器人仍使用旧构建，无法在脑图切换人设。
- **怎么解决的**：在 `ubuntu@124.222.65.169` 先备份远端插件目录和 `brain-data`，只上传 `dist` 与 `package.json` 到 `/home/ubuntu/dsh-qqbot-brain/`，不覆盖 `cordis.patch.yml`；随后重启 `dsh-qqbot.service`。
- **后续优化方向**：可增加机器人实际对话端到端验收和自动部署流水线；本次不主动向真实 QQ 发送消息。
- **什么时候干的**：2026-11-01（远端备份名使用 UTC 时间 `20261031T162854Z`）。
- **Key Decisions**：插件和脑数据成对备份，不删旧文件；线上仍保持 `legacy` 活动，只增 `whale-gentle` 可选版本。
- **验证结论**：本地 `npm test` 72/72、typecheck、build、npm pack 校验已通过；`rsync -acn` 无内容差异，服务器 `dist/index.js`、`dist/server/http.js`、`dist/server/page.html`、`dist/setup/whale-gentle.md` 与本地 SHA-256 相同；远端配置哈希 `22f1ef29...` 与旧 `persona.md` 哈希 `6b310c4e...` 前后相同。`dsh-qqbot.service` active / Result=success / NRestarts=0，脑图 API 返回 `activeId=legacy` 和 `legacy, whale-gentle`，活动文本与 `persona.md` 相同；`/api/state` 可读取 97 条记忆，页面有切换入口，宿主近期日志出现 `Bot ready!` 且无 FATAL 标记。
- **回滚入口**：远端 `/home/ubuntu/backups/plugin-before-20261031T162854Z-persona-36ca91c.tgz` 与 `/home/ubuntu/backups/brain-before-20261031T162854Z-persona-36ca91c.tgz`，均已通过 `tar -tzf` 检验。若需回滚，先停止服务，再将两份归档恢复至原 `/home/ubuntu` 对应目录并启动服务；恢复涉及覆盖线上内容，必须另行确认后操作。
