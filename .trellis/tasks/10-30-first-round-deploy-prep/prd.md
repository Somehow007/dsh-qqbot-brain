# 第一轮上云使用：准备清单 + 评估 + 设计

> 来源：2026-10-30 上云就绪评估（archive/2026-10/10-30-cloud-deploy-eval）结论「可上，先收端口」后的落地清单。

## Goal

让 dsh-qqbot-brain 随 dsh 宿主在云服务器上跑起来，完成第一轮真实使用：机器人正常应答、记忆/情绪/态度随对话积累、`/brain` 可安全访问、数据可备份可迁移。

## 工作清单与评估

### P0 — 上云前必须完成

| # | 事项 | 评估 | 方案 |
|---|------|------|------|
| 1 | 脑图访问收敛 | 不改=会话/记忆/画像+全部写 API 裸奔公网，唯一阻塞项 | 推荐「默认改 127.0.0.1 + 页面 token 感知」双保险，见 design.md D1 |
| 2 | dataDir 启动日志 | ~3 行；journal-1 记录过相对路径按 cwd 解析导致数据写错目录的坑 | index.ts 启动行追加解析后的绝对路径 |
| 3 | 部署 runbook | 现 README 只有骨架，缺 unit 完整版/验证清单/备份/回滚 | 扩展 dsh-qqbot-brain/README.md 的部署段 |

### P1 — 第一轮强烈建议

| # | 事项 | 评估 | 方案 |
|---|------|------|------|
| 4 | 页面 token 感知 | ~15 行 JS + 1 条测试；做完 token 才成为有效保护，支持手机/无隧道直连 | design.md D2 |
| 5 | 数据迁移定型 | 本地已有真实 brain-data，需决定带不带上去 | rsync 整目录优先（保留 op 流水），export/import 备选 |
| 6 | 备份策略 | brain-data 是唯一状态，无副本=单点 | systemd unit + cron 每日 tgz，保留 7 份 |
| 7 | systemd 常驻完善 | 示例用 npx 不稳；缺 User/WorkingDirectory/日志查看 | 完整 unit + journalctl 命令写进 runbook |

### P2 — 第一轮使用期的验证手段（设计进 runbook，不写新代码）

| # | 事项 | 方案 |
|---|------|------|
| 8 | 健康检查清单 | 启动日志关键词（人格内核来源/蒸馏 on-off/数据目录绝对路径）；聊 3 轮后 `GET /api/state` notes>0、`/api/ops` 有 add 流水；页面看到 attitude/persona |
| 9 | 蒸馏可用性监控 | `journalctl -u dsh -f` 看「蒸馏 …：记忆 N 条」；N 持续为 0 或无日志 → 查 key/baseUrl/网络 |

### P3 — 明确延后（第一轮不做）

- store 文件锁/多实例守卫（靠 systemd 单实例保证）
- 私聊画像 openid 归并、画像编辑入口（沿用 journal 后续方向）
- 蒸馏 prompt 调优（第一轮先收集真实表现数据）
- 反代 HTTPS（无分享需求前不做）

## 部署前置（用户侧准备，非代码）

- 云服务器：建议 ≥1C2G（插件本身轻量，dsh+官方 qqbot 是大头）、Node ≥20、出网可访问 api.deepseek.com 与 QQ 平台
- dsh qqbot profile 已配置（QQ Bot 凭据在服务器侧），官方 `@tencent-connect/dsh-qqbot` 可独立跑通
- DeepSeek API key
- 决策点：脑图访问方式 = SSH 隧道（P0#1 即可）还是公网直连（还需 P1#4）

## Acceptance Criteria

- [x] patch 默认 `http.host: 127.0.0.1`；公网直连场景下 `?token=` 打开页面后所有 API 请求带 token
- [x] 启动日志输出解析后的数据目录绝对路径
- [x] README 含完整部署 runbook：unit、迁移、验证清单、备份、回滚
- [x] `npm run typecheck` + `npm test` 全绿（含 token 透传用例）

## 用户决策（2026-10-30）

- 脑图访问方式：SSH 隧道为主；token 感知仍落地（保留直连/webServer 模式选项）
- 实施范围：P0+P1 全部做掉

## 剩余项（服务器侧执行，非代码）

- 实际部署、数据迁移、安全组配置、systemd 启用——按 README runbook 执行，第一轮验证通过后归档本任务
