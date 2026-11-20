# Web 服务契约

`src/web/server.ts` `EngramServer`：node:http 单文件服务，无框架依赖。

## 端口与路由

| 路由 | 鉴权 | 说明 |
|---|---|---|
| `GET /` `/index.html` | 公开 shell | chat.html 单文件（内嵌 JS/CSS，无构建） |
| `GET /api/config` | cookie/token | userNick、proactive 开关、脑图入口 |
| `GET /api/history` | 同上 | 最近 80 条 history |
| `POST /api/chat` | 同上 | `{text}` → `{reply, usage, hits, degraded}` |
| `GET /api/events` | 同上 | SSE：proactive/system 消息推送，25s 心跳 |
| `/brain/*` | 须过 engram 鉴权（与 `/api/*` 同闸）后反代注入 `x-brain-token` | → `127.0.0.1:4101` BrainHttpServer（三皮肤+D-admin 整套复用）；**反代必须在 authed 之后**——proxyBrain 无条件注入口令，无凭证直通=公网裸奔管理端 |

## 鉴权模式（沿用 brain 口令制）

- `?token=` 首跳 → `Set-Cookie: engram_token=...; HttpOnly; SameSite=Lax` → 302 回 `/`——token 不进地址栏历史。
- API 校验顺序：`x-engram-token` header → cookie。`ENGRAM_HTTP_TOKEN` 为空 = 无鉴权（仅限本机调试，main.ts 启动 warn）。
- **单用户假设到底**：无多租户、无账号体系、无速率限制——别为 hypothetical 用户加复杂度。

## SSE

- `broadcast(entry)` 由 ProactiveService.onDeliver 回调驱动（main.ts 闭包延迟绑定解构造期循环：loop→proactive→broadcast→web→loop）。
- 客户端断线自动清理；写失败静默——SSE 是便利通道，history.jsonl 才是事实源，UI 重连走 `/api/history` 回填。

## chat.html 约定

- 单文件、无构建、移动端 viewport 适配。消息渲染三角色：user（右）/assistant（左）/proactive（居中虚线+「想起了什么」标记）。
- `usage.totalTokens` 透出在 assistant 消息 meta 行——成本可见性是产品特性不是调试信息。
- 401 → 显示口令框 → `/?token=` 重跳。**token 不落 localStorage**（HttpOnly cookie 已够）。

## 已知接受风险

- 无 TLS（与现有 `:4099` 同级暴露面，口令强度兜底）——后续可加 Caddy/安全组，不在 MVP。
- `/brain/*` 与 `/api/*` 共用 engram 鉴权闸门（cookie/`x-engram-token`），通过后反代注入 `x-brain-token` 透传 brain server。**顺序不可换**：proxyBrain 无条件注入口令头，若放在 authed 之前则公网无凭证可达全部管理 API。
