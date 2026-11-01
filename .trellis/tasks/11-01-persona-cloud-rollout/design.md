# 部署设计

## Boundary

本任务只变更服务器 `/home/ubuntu/dsh-qqbot-brain/dist` 与 `package.json`，不变更源仓库产品代码或远端 `cordis.patch.yml`。`dsh-qqbot.service` 从 qqbot profile 的符号链接读取该插件目录，故上传后重启即可加载新构建。数据 `~/brain-data` 留原地，首次新版本启动只迁移单份人设和新增未激活预置。

## Transfer and Rollback

- 对远端插件目录和数据目录各创建一次加时间戳的 tar 归档（保留权限），置于远端 `~/backups`，校验归档可读及内容；不要覆盖已有备份。
- `rsync -av dist package.json` 同步本机构建到目标（`dist` 无尾斜杠），不使用 `--delete`，不上传本地配置；比对相应 SHA-256 及确认远端配置 hash 未变化。
- 重启 `dsh-qqbot.service` 后核查状态、最近启动日志、HTTP 端口及实际 JSON 返回；使用 Node 解析 JSON 仅输出活动 ID、列表 ID 和布尔比较，不打印完整人设/密钥/聊天历史。
- 若失败，保留备份与现状供诊断；回滚需用插件包和数据包成对恢复，避免旧代码读取新格式中间态。未获具体确认前不执行额外清除/强制操作。

## Operational Risks

- 服务重启会短暂中断 QQ Bot；已有备份保障回退。不能用系统 Node 18 运行 dsh，服务自身配置为 Node 24；不修改 systemd 单元、环境变量或访问控制。
- `persona.md` 是活动人设权威来源，验证前后只读对比文件内容哈希；健康检查不改变任何线上选择或记忆。
