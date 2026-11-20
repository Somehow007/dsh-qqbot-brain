# engram 部署 runbook

> 生产：`124.222.65.169`（SSH `ubuntu@` 人用/deploy；agent 走查用 `brain-ro@` 只读）。
> 与 dsh-qqbot-brain 同机；brain 内核消费**源码直引**，无构建产物。

## 拓扑

```
公网 ──→ :4100 engram chat UI + /api/* + /brain/* 反代
              └─→ 127.0.0.1:4101 BrainHttpServer（brain admin，仅本机+反代）
systemd: engram.service（Restart=always，EnvironmentFile=~/.engram/engram.env）
数据:    ~/engram-data/（与 ~/brain-data/ 完全隔离）
代码:    ~/engram-workspace/{engram,dsh-qqbot-brain}/（平级，src 直引）
```

## 首次部署

```bash
# 1) 本地准备（仓库根）
cd /Users/somehow/dev/code/vibe-coding/qqbot-brain

# 2) 服务器建目录 + env（ubuntu@，只做一次）
ssh ubuntu@124.222.65.169
mkdir -p ~/engram-workspace ~/engram-data ~/.engram
# 写 ~/.engram/engram.env（600）：见下
# systemd unit 放 /etc/systemd/system/engram.service（sudo）

# 3) rsync 两个 src（保持平级！engram 的 brain.ts shim 依赖 ../../dsh-qqbot-brain/src）
rsync -avz --delete engram/ ubuntu@124.222.65.169:~/engram-workspace/engram/ \
  --exclude node_modules --exclude .trellis --exclude docs
rsync -avz dsh-qqbot-brain/src ubuntu@124.222.65.169:~/engram-workspace/dsh-qqbot-brain/src
rsync -avz dsh-qqbot-brain/package.json ubuntu@124.222.65.169:~/engram-workspace/dsh-qqbot-brain/
# persona 包（火种子在根仓库 personas/，engram 默认 SEED_DIR 指向 ../personas/firefly
# ——若服务器无 personas/ 目录，改 rsync personas/firefly 或设 ENGRAM_SEED_DIR）
rsync -avz personas/firefly ubuntu@124.222.65.169:~/engram-workspace/personas-firefly-tmp  # 或调整 SEED_DIR

# 4) 起服务
ssh ubuntu@124.222.65.169 'sudo systemctl daemon-reload && sudo systemctl enable --now engram'
```

> **简化路径（推荐首版）**：`ENGRAM_SEED_DIR` 直接指到 `~/engram-workspace/personas/firefly`，把 `personas/firefly/` 也 rsync 成 `~/engram-workspace/personas/firefly/`——三目录平级，布局最直白。

## engram.env 模板（`~/.engram/engram.env`，chmod 600）

```bash
ENGRAM_DATA_DIR=/home/ubuntu/engram-data
ENGRAM_SEED_DIR=/home/ubuntu/engram-workspace/personas/firefly
ENGRAM_HTTP_TOKEN=<强口令>
BRAIN_HTTP_TOKEN=<强口令，brain 管理端专用，建议与 HTTP 不同>
USER_NICK=开拓者
DEEPSEEK_API_KEY=<key>          # chat+蒸馏共用（CHAT_LLM_API_KEY/BRAIN_LLM_API_KEY 回落到此）
# BRAIN_EMBED_API_KEY=<key>    # embedding 独立配（如 siliconflow bge-m3）；不设则向量关闭、检索退化纯 lexical
# PROACTIVE_ENABLED=0           # slice2 再开
# TOOLS_BRAIN_SEARCH=0
```

## systemd unit（`/etc/systemd/system/engram.service`）

```ini
[Unit]
Description=engram companion agent
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/engram-workspace/engram
EnvironmentFile=/home/ubuntu/.engram/engram.env
ExecStart=/opt/node-v24/bin/node src/main.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 日常更新

```bash
# 本地 typecheck+test 先过
cd engram && npm run typecheck && npm test
# persona 包有改动必须先重跑生成器（persona.md 是源、seed-export.json 是生成物）
python3 personas/firefly/generate_seed.py   # 改了 personas/firefly/persona.md 时
# rsync 同首次部署第 3 步（src 变了才需要；brain 侧变了也要重发 dsh-qqbot-brain/src；
#   personas/firefly 变了也要重发对应目录）
ssh ubuntu@124.222.65.169 'sudo systemctl restart engram'
```

**brain 内核更新会自动流入**（直引源码）——改 `dsh-qqbot-brain/src/brain/` 后两边都要重发 src，插件走 dist 构建、engram 走源码直跑，部署节奏不同步是有意的。

## 验证清单

```bash
ssh ubuntu@124.222.65.169 'systemctl is-active engram && tail -20 ~/engram-data/engram.log'
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4100/api/config           # 401
curl -s -H "x-engram-token: <tok>" http://127.0.0.1:4100/api/config                 # {"ok":true,...}
curl -s -H "x-engram-token: <tok>" http://127.0.0.1:4100/api/history                # {"entries":[...]}
# 浏览器: http://124.222.65.169:4100/?token=<tok>  → cookie 后直连 /
# 鉴权边界：无凭证访问 /brain/ 必须 401（反代在 authed 之后，proxyBrain 注入口令）
curl -s -o /dev/null -w '%{http_code}\n' http://124.222.65.169:4100/brain/        # 期望 401
# 脑图:   http://124.222.65.169:4100/brain/  → 三皮肤页（engram cookie 已过鉴权后反代注入 token）
```

## 备份

- `~/engram-data/` 加入每日备份 cron（与 `~/brain-data/` 并列，独立成对）。
- 本地 `brain-data/*.json` 导出模式可复用：`/brain/api/export` → `engram-data-export.json` 落盘 gitignore。

## 排障

| 症状 | 查 |
|---|---|
| 起不来 | `journalctl -u engram -n 50`；多半是 env 缺 key 或兄弟布局断 |
| chat 500 | `~/engram-data/engram.log`；LLM 超时降级不该 500 |
| 脑图 502 | `127.0.0.1:4101` 是否活；`BRAIN_HTTP_TOKEN`（engram.env 里 brain 管理端口令）与 brain 侧校验一致性 |
| 记忆没更新 | `ingest` 失败会 log；`endOfTurn` 后台蒸馏需 `BRAIN_LLM_*`/`DEEPSEEK_API_KEY` |
