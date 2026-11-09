# 设计：第一轮上云准备

## D1 脑图访问收敛（P0）

### 现状

- `http.ts` route() 在路由前统一校验 token（L58-61）：页面 HTML 与 API 同等保护
- 页面自身 `const API = location.pathname...`（page.html L338），fetch 不携带任何凭据 → token 设了页面会 401，因此现状 token 不可用
- 默认 `host: 0.0.0.0` / `token: ''`（config.ts L104，cordis.patch.yml）
- CLI profile 模式走内置 node:http（绑定 host/port 有效）；web 模式挂宿主 webServer（host/port 被绕过，只能靠 token 或宿主侧控制）

### 方案对比

| 方案 | 改动 | 访问体验 | 安全性 | 结论 |
|------|------|----------|--------|------|
| A. patch 改 `host: 127.0.0.1` + SSH 隧道 | 1 行 | 桌面端 `ssh -L 4099:127.0.0.1:4099`，手机不便 | 最强（端口根本不出网卡） | **做，作为仓库默认** |
| B. 页面 token 感知 + `http.token` + 安全组限 IP | ~15 行 JS | `http://ip:4099/brain?token=x` 直连，手机可用 | 中（token 在 URL/日志里可见，HTTP 明文） | **做，低成本解锁直连** |
| C. nginx 反代 + HTTPS + Basic Auth | 服务器配置 | 最好 | 高 | 第一轮不引入，写入 runbook 备选 |

推荐组合：A 改仓库默认（本地用也走 127.0.0.1，无损），B 顺手做掉——两者叠加后 SSH 隧道、限 IP 直连、未来反代三种访问模式都可用。

注意：web 模式（宿主提供 webServer）下 A 不生效，README runbook 需注明该模式靠 B/宿主侧控制。

## D2 页面 token 感知（P1，若选直连则升 P0）

page.html 脚本头部（L338 附近）：

```js
const TOKEN = new URLSearchParams(location.search).get('token')
  || sessionStorage.getItem('brain-token') || '';
if (TOKEN) sessionStorage.setItem('brain-token', TOKEN);
const fapi = (u, o) => fetch(u + (TOKEN ? (u.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN) : ''), o);
```

随后把页面内全部 `fetch(`（约 12 处，含 state/ops/sessions/profiles/notes/persona/export/import/query）改为 `fapi(`。token 走 query 而非 header，与服务端现有 `url.searchParams.get('token')` 检查吻合，无需改 http.ts。

测试：page.test.ts 新增断言——脚本包含 token 透传包装且语法有效；可选模拟带 token 的 URL 验证拼接。

README 更新：删除「设置口令会导致脑图页面无法加载数据」的旧警告，改为「页面经 `?token=` 首次带入后由 sessionStorage 续命」。

## D3 dataDir 启动日志（P0）

index.ts 启动日志行（L112-114 附近）追加 `数据目录 ${dataDir}`（dataDir 已经过 `resolve()`，打印即绝对路径）。同时考虑：env 传入相对路径时打一条 warn——非必须，第一轮只做日志。

## D4 部署 runbook（P0，写进 dsh-qqbot-brain/README.md）

结构：

1. **前置**：服务器规格（≥1C2G）、Node≥20、dsh qqbot profile 可用、DeepSeek key、出网
2. **构建安装**：本地 `npm ci && npm run build` → rsync `dist/ cordis.patch.yml package.json`（或服务器 clone+build）→ `dsh plugin --profile qqbot add <路径>`
3. **配置**：patch `host: 127.0.0.1`（隧道）或 `host: 0.0.0.0 + token`（限 IP 直连）；env `BRAIN_DATA_DIR=/var/lib/dsh-brain`（绝对路径）
4. **systemd unit 完整版**：

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
ExecStart=/home/dsh/.nvm/versions/node/vX.Y.Z/bin/npx @deepseek-ai/dsh --profile qqbot
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

5. **数据迁移**：`rsync -av ~/brain-data/ server:/var/lib/dsh-brain/`（停服后拷，保留 op 流水）；或 `/api/export` → `POST /api/import?mode=replace`（只带状态）
6. **验证清单**：启动日志应含「数据目录 /var/...」「蒸馏 on」「已启动：人格内核(persona.md)…」；发 3 轮消息 → `curl 127.0.0.1:4099/brain/api/state` notes 增长 → 隧道打开页面看 persona/attitude/记忆
7. **备份**：cron `0 4 * * * tar czf /var/backups/brain-$(date +\%F).tgz -C /var/lib/dsh-brain . && ls -t /var/backups/brain-*.tgz | tail -n +8 | xargs rm -f`
8. **回滚**：`dsh plugin --profile qqbot remove qqbot-brain` → 还原官方行为，数据目录保留
9. **安全组**：只放 22；选直连时 4099 限自己 IP

## 工作量合计

代码改动 <40 行（patch 1 行 + 日志 ~3 行 + page ~15 行 + 测试 ~10 行）+ README runbook ~80 行。
