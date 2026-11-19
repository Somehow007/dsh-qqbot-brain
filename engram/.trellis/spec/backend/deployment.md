# 部署约束

生产：腾讯云 `124.222.65.169`，与 dsh-qqbot-brain 同机。详细 runbook 见 `docs/deploy.md`；此处只钉**不可违反的硬约束**。

## 兄弟布局（不可妥协）

```
~/engram-workspace/
  engram/src/**          ← 本仓库 engram/ 原样（type stripping 直跑，无 dist）
  dsh-qqbot-brain/src/** ← 插件 src 也要在（brain.ts shim 直引 .ts 源码）
```

- shim `../../dsh-qqbot-brain/src/...` 相对路径要求两目录平级。**部署 = rsync 两个 src 目录**，不是只发 engram。
- 插件 dist/ 与 cordis.patch.yml 不需要上 engram 目录——engram 不消费它们。

## 运行时

- Node ≥22.18（生产 `/opt/node-v24/bin/node`）；`node src/main.ts` 直跑，无构建步骤——**服务器不需要 tsc**。
- 零运行时依赖（package.json 无 dependencies）——不需要 `npm install --omit=dev`，只需 @types/node+typescript 在本地 typecheck。

## 服务与数据

- `engram.service`（systemd）：`EnvironmentFile=~/.engram/engram.env`（600），`Restart=always`，`WorkingDirectory=~/engram-workspace/engram`。
- 数据目录 `~/engram-data/`：brain store（op 流水+快照）、chat-log.jsonl、persona.md、proactive-state.json、engram.log——**与 `~/brain-data/` 完全隔离**，两边记忆互不污染是有意的（engram 是独立人格实例）。
- 端口：chat `:4100`（0.0.0.0 公网）；brain admin `127.0.0.1:4101`（仅反代可达）；`:4099` 是 dsh 侧 brain，不动。

## env 文件（服务器 `~/.engram/engram.env`）

必设：`ENGRAM_DATA_DIR`、`ENGRAM_SEED_DIR`、`ENGRAM_HTTP_TOKEN`、`ENGRAM_BRAIN_TOKEN`、`DEEPSEEK_API_KEY`（或拆 CHAT_/BRAIN_/EMBED_ 前缀）。`PROACTIVE_ENABLED` slice2 再开。**密钥不进仓库、不进对话**。

## 验证（部署后）

```bash
systemctl status engram
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/api/config   # 期望 401
curl -s -H "x-engram-token: $TOKEN" http://127.0.0.1:4100/api/config       # 期望 {"ok":true,...}
# 公网: http://124.222.65.169:4100/?token=... 首跳换 cookie
# 脑图: http://124.222.65.169:4100/brain/（经反代，或直连 127.0.0.1:4101 仅本机）
```
