# 脑图公网直连（弃 SSH 隧道）

## Goal

云服务器（ubuntu@124.222.65.169）上的 `/brain` 脑图不再走 SSH 隧道，改为
`0.0.0.0:4099` + 访问口令公网直连，浏览器直接开 `http://<ip>:4099/brain?token=xxx`。

## 背景 / 问题

- 原方案（first-round-deploy-prep 定的收敛策略）：`host: 127.0.0.1` + `ssh -L 4099` 隧道。
- 用户反馈：隧道太麻烦，且本地起隧道会占用 4099，与本地调试端口冲突。
- 脑图页连带全部写 API（记忆 CRUD / 人格写入 / import 覆盖），裸开公网不行 → 必须 token。

## Requirements

- 服务器 bundle patch（`~/dsh-qqbot-brain/cordis.patch.yml`）`host: 0.0.0.0` + 随机 token
- `index.ts` 新增 `BRAIN_HTTP_HOST` / `BRAIN_HTTP_TOKEN` env 覆盖（与 BRAIN_LLM_API_KEY 同模式），
  口令进 `~/.dsh/brain.env`（600）而非 patch 文件；rsync 覆盖部署后直连配置不丢
- 腾讯云安全组放行 TCP 4099（控制台操作，agent 无法代办）
- README（root + 插件 runbook）同步新姿势

## Acceptance Criteria

- [x] `ss -tln` 见 `0.0.0.0:4099`
- [x] 无 token → 401；`?token=` → 200；页面 200
- [ ] 公网可达（待用户开安全组后验证）

## Resolution（2026-11-02）

### 遇到了什么问题

脑图绑在 `127.0.0.1:4099`，只能靠 `ssh -L` 隧道访问；隧道操作繁琐且本地占用 4099 端口，
与本地调试冲突。用户要求直接公网开放。

### 怎么解决的

1. 服务器 bundle patch `~/dsh-qqbot-brain/cordis.patch.yml`：`host 127.0.0.1→0.0.0.0`、
   `token ''→随机口令`（`openssl rand -hex 12`，sed 就地改，原文件 .bak 备份）
2. `sudo systemctl restart dsh-qqbot` —— 重启后约 4s 插件才起监听，首次验证踩了
   「服务 active 但端口未起」的时间差
3. `index.ts` apply() 增加 `BRAIN_HTTP_HOST`/`BRAIN_HTTP_TOKEN` env 覆盖；
   服务器 `~/.dsh/brain.env` 追加同值 —— 当前 dist 不认识 env 走 patch，
   未来部署新 dist 走 env，两条路都通且 rsync 不会把配置打回隧道模式
4. 文档：插件 runbook 公网直连条目补 env 写法；root README 安全提示补 `BRAIN_HTTP_TOKEN`

### Key Decisions

- **保留 token 而非裸开**：脑图页含写 API，README 原安全策略即要求公网直连必须 token；
  页面 fapi 会从 `?token=` 存 sessionStorage，体验上只需输一次
- **token 不进 git**：服务器 patch 文件内联一份（当前 dist 用），brain.env 一份（未来 dist 用），
  仓库 patch 保持 `token: ''` 安全默认
- **不重部署 dist**：服务器跑的是 webserver-shim 之前的稳定构建；本次只改配置即生效，
  避免顺带发布未实测的 shareAsWebServer
- env 只加 host/token 两项（port/prefix 无远端差异化需求）

### 验证结论

- `ss -tln` → `0.0.0.0:4099` LISTEN ✔
- `curl 127.0.0.1:4099/brain/api/state` → 401；带 token → 200；`/brain` 页面 → 200 ✔
- brain.log 启动行确认 `脑图 http://0.0.0.0:4099/brain` ✔
- 本机 curl 公网 → 000 超时：腾讯云安全组未放 4099（控制台待用户操作）⏳
- 本地 typecheck + 98/98 单测全绿 ✔

### 后续优化方向

- 安全组入站建议限定自家出口 IP 而非 `0.0.0.0/0`（token 是第二道防线）
- 下次 dist 部署后，服务器 patch 里的内联 token 可清空，改由 brain.env 单点管理
- 若多人要看脑图，考虑只读视图或路径级鉴权（当前 token 是全权限）
