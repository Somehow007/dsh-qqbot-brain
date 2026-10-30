# 上云部署就绪评估

> 存档约定：纯评估讨论也存档——记录「遇到了什么问题 / 怎么解决的 / 什么时候干的」。

## 问题存档

- **时间**：2026-10-30
- **问题**：当前 dsh-qqbot-brain 插件是否可以放到云服务器上跑、开始第一轮真实使用？

## 评估方法

- 核对里程碑（brain-plugin prd.md M0–M4 全部勾选，含 M4 部署文档）
- 实跑验证：`npm run typecheck` 无错、`npm test` 40/40 全绿、`npm run build` 产物齐全
- 审查部署面：`cordis.patch.yml` 默认配置、`src/server/http.ts` 路由与鉴权、`src/config.ts` 默认值、`.gitignore`（dist 不入库）
- 复查 journal 遗留问题：dataDir 相对路径按 cwd 解析、多实例共享数据目录 compact 互冲（无文件锁）

## 结论

**可以上云，但有一个必须先处理的安全项**：脑图 HTTP 默认 `host: 0.0.0.0` + `token: ''`，`/brain` 页面与全部读写 API（含 `POST /api/import?mode=replace` 可整体覆盖记忆、notes CRUD、persona 写入）会裸奔公网。上云前必须二选一：

- 改 patch 为 `http.host: 127.0.0.1`，SSH 隧道访问（推荐，README 也这么建议）
- 或安全组/防火墙只放行自己 IP 访问 4099

注意：`http.token` 设了会让页面自身 API 请求 401（页面 JS 不带 token），不能作为页面的唯一保护手段。

## 部署前置条件

- 插件非独立服务：需服务器上先有 `@deepseek-ai/dsh` 宿主 + qqbot profile（QQ bot 凭据）+ 官方 `@tencent-connect/dsh-qqbot` 正常运行
- Node ≥20；`npm ci && npm run build`（dist 不入库，需服务器构建或本地构建后拷贝 dist+cordis.patch.yml+package.json）
- `DEEPSEEK_API_KEY`/`BRAIN_LLM_API_KEY`（无 key 时蒸馏自动关闭，仍可手动管记忆）
- `BRAIN_DATA_DIR` 必须设**绝对路径**（journal-1 Session 2 记录过相对路径按 cwd 解析的坑）
- 单实例独占数据目录：store 无文件锁，两个 dsh 进程共享同一 dataDir 会 compact 互冲

## 数据迁移

两条路（都已验证过）：

- 直接拷贝 `~/brain-data/`（brain.jsonl + persona.md + brain.snapshot.json）
- 或 `/api/export` → `/api/import?mode=replace`（export/import 任务已落地）

## 遗留风险（非阻塞）

- 无访问口令的脑图页（设计上接受，靠网络层保护）
- 无文件锁、私聊 openid 归并、画像编辑入口——journal 已列后续方向
- systemd 示例用 `npx`，建议换绝对路径 binary 更稳

## Resolution（2026-10-30）

### 遇到了什么问题

评估「能否上云第一轮使用」。整体就绪，但发现默认 `host: 0.0.0.0` + 空 token 会把含会话/记忆/画像的脑图及全部写 API 暴露公网，且 `http.token` 与页面自身请求不兼容，不能依赖它兜底。

### 怎么解决的

不改代码：部署时在网络层收敛（patch 改 `host: 127.0.0.1` + SSH 隧道，或安全组限 IP）。明确部署前置条件（dsh 宿主、qqbot profile、Node≥20、绝对路径 BRAIN_DATA_DIR、单实例独占数据目录）与两条数据迁移路径。

### 后续优化方向

- 脑图页 token 感知（页面 fetch 自动带 token），使口令可作为正式保护手段
- store 文件锁/单实例守卫
- systemd 示例改绝对路径 binary
- 私聊 openid 归并、画像编辑入口（延续 journal 已列方向）

### 什么时候干的

2026-10-30，本会话：实跑 typecheck/test/build 全绿后做的评估。

### Key Decisions

- 上云判定为「可上，先收端口」；安全项走部署配置而非代码改动
- 页面保护优先用本机监听/网络层，而非 `http.token`

### 验证结论

`npm run typecheck` 无错；`npm test` 40/40 全绿；dist 构建产物齐全；工作树干净（main，最新 commit dec79a4）。
