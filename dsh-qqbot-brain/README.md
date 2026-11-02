# dsh-qqbot-brain

大肥鱼"类脑架构"插件：人格内核 + 分层遗忘记忆 + 情绪插件 + /brain 脑图页。
与官方 `@tencent-connect/dsh-qqbot` **并存运行**（不 fork、可独立摘除）。

## 原理

- 每轮 LLM 调用前，经 `system-prompt/assemble` 注入五个 section：
  `brain:persona`(人格内核, order 80) / `brain:emotion`(情绪态, 82) / `brain:attitude`(当前立场, 83) / `brain:memory`(top-k 记忆, 84) / `brain:speaker`(当前发言人, 86)
- 群聊发言人归因：捕获 `user/message` 时解析宿主打的 `[昵称 (openid)]` 标签写入
  `Turn.actor`，蒸馏出的记忆带发言人，注入的记忆摘录行显示 `[发言人]` 前缀
- 态度记忆（kind=attitude）：蒸馏产出角色对人/事/话题的「对<对象>：<立场>」条目，
  人格内核不变但立场可被对话塑造；含当前发言人昵称的态度保底唤起（≤3 条），
  话题型态度随 topK 检索按相关性出现
- 经 `session/event` 捕获 user/assistant 轮次，`turn/end` 调 LLM 蒸馏为记忆笔记
- 记忆按艾宾浩斯曲线 `R=e^(-t/S)` 衰减，被检索命中时 S+1 强化（用进废退）

## 部署 runbook（云服务器第一轮）

### 前置

- 服务器 ≥1C2G，Node ≥20，出网可达 api.deepseek.com 与 QQ 平台
- dsh qqbot profile 已配置且官方 `@tencent-connect/dsh-qqbot` 能独立跑通
- DeepSeek API key（没有也能跑，蒸馏自动关闭）

### 构建与安装

```bash
# 本地构建后上传（dist 不入库）
npm ci && npm run build
# 注意：dist 不带尾斜杠——`dist/`（带斜杠）会把编译产物撒到插件根目录而非 dist/ 子目录
rsync -av dist cordis.patch.yml package.json server:/opt/dsh-qqbot-brain/

# 或服务器上 clone + npm ci && npm run build

# 与官方插件并列安装到 qqbot profile
npx @deepseek-ai/dsh plugin --profile qqbot add /opt/dsh-qqbot-brain
```

### 访问收敛（二选一）

- **SSH 隧道（推荐）**：保持默认 `host: 127.0.0.1`，安全组只放 22。
  本机 `ssh -L 4099:127.0.0.1:4099 user@server`，浏览器开 `http://127.0.0.1:4099/brain`。
- **公网直连**：patch 改 `host: 0.0.0.0` 且 `token: '<随机口令>'`，安全组 4099 只放自己 IP。
  浏览器开 `http://<服务器>:4099/brain?token=<口令>`（口令存入会话存储，后续刷新免带）。
  也可用环境变量 `BRAIN_HTTP_HOST` / `BRAIN_HTTP_TOKEN`（写进 brain.env 这类
  EnvironmentFile）：口令不进 patch 文件，rsync 覆盖部署后公网直连配置仍保留。
- webServer 挂载模式下 `http.host` 不生效，只能靠 token 或宿主侧控制。

### systemd 常驻

`/etc/systemd/system/dsh.service`：

```ini
[Unit]
Description=dsh qqbot (+brain)
After=network-online.target

[Service]
Type=simple
User=dsh
WorkingDirectory=/var/lib/dsh
Environment=BRAIN_LLM_API_KEY=sk-xxx
Environment=BRAIN_DATA_DIR=/var/lib/dsh-brain
ExecStart=/abs/path/to/node /abs/path/to/dsh --profile qqbot
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`BRAIN_DATA_DIR` 必须给绝对路径。插件日志写 `<数据目录>/brain.log`（含启动行、每轮蒸馏摘要、蒸馏失败；超 1MB 轮转为 brain.log.old），宿主日志 `journalctl -u dsh -f` 或 /var/log/dsh/qqbot.log。

### 数据迁移（可选）

- 保完整 op 流水：停服后 `rsync -av ~/brain-data/ server:/var/lib/dsh-brain/`
- 只带状态：`GET /brain/api/export` → `POST /brain/api/import?mode=replace`

### 验证清单

1. `tail ~/brain-data/brain.log` 启动行含「数据目录 <绝对路径>」「蒸馏 on」「脑图 127.0.0.1:4099/brain」
2. 与机器人聊 3 轮以上
3. `curl 127.0.0.1:4099/brain/api/state` → notes 数增长；`/brain/api/ops` 有 add 流水
4. 隧道打开 `/brain`：人格内核、态度、记忆、画像、情绪均有数据

### 备份

```cron
0 4 * * * tar czf /var/backups/brain-$(date +\%F).tgz -C /var/lib/dsh-brain . && ls -t /var/backups/brain-*.tgz | tail -n +8 | xargs rm -f
```

### 回滚

`dsh plugin --profile qqbot remove qqbot-brain` → 还原官方行为，`BRAIN_DATA_DIR` 数据保留。

## 排障

- `蒸馏 off(无apiKey)`：设 `BRAIN_LLM_API_KEY` 或 `DEEPSEEK_API_KEY`
- 记忆不涨：看 `brain.log`——有「蒸馏失败」查 key/网络；无蒸馏行确认事件含 user/message；`debug: true` 加详细日志
- 数据写到别处：看启动日志的「数据目录 <绝对路径>」，env 相对路径按 cwd 解析
- 页面 401：确认 URL 带 `?token=` 或宿主侧未拦截
- 摘除插件即还原官方行为：`dsh plugin --profile qqbot remove qqbot-brain`
