# dsh-qqbot-brain

大肥鱼"类脑架构"插件：人格内核 + 分层遗忘记忆 + 情绪插件 + /brain 脑图页。
与官方 `@tencent-connect/dsh-qqbot` **并存运行**（不 fork、可独立摘除）。

## 原理

- 每轮 LLM 调用前，经 `system-prompt/assemble` 注入三个 section：
  `brain:persona`(人格内核, order 80) / `brain:emotion`(情绪态, 82) / `brain:memory`(top-k 记忆, 84)
- 经 `session/event` 捕获 user/assistant 轮次，`turn/end` 调 LLM 蒸馏为记忆笔记
- 记忆按艾宾浩斯曲线 `R=e^(-t/S)` 衰减，被检索命中时 S+1 强化（用进废退）

## 安装（2C2G 服务器）

```bash
# 1. 拉取并构建（本地先 pnpm/npm build，或直接传 src 依赖 dsh 的 ts 运行时）
git clone <本目录> && cd dsh-qqbot-brain && npm i && npm run build

# 2. 与官方插件并列安装到 qqbot profile
npx @deepseek-ai/dsh plugin --profile qqbot add /path/to/dsh-qqbot-brain

# 3. 配置（二选一）
#  a) cordis.patch.yml 追加：
#    - id: qqbot-brain
#      name: '@local/dsh-qqbot-brain'
#      config:
#        personaCore: "大肥鱼人设全文…"
#        http: { port: 4099 }
#  b) 环境变量（更省事的默认路径）：
export DEEPSEEK_API_KEY=sk-xxx        # 蒸馏用，或 BRAIN_LLM_API_KEY
export BRAIN_DATA_DIR=/var/lib/dsh-brain   # 可选，默认 ./brain-data
npx @deepseek-ai/dsh --profile qqbot
```

脑图页：`http://<服务器>:4099/brain`（CLI profile 走内置 node:http；
web 模式自动改挂宿主 webServer 同端口）。

## systemd（可选常驻）

```ini
[Service]
Environment=DEEPSEEK_API_KEY=sk-xxx
Environment=BRAIN_DATA_DIR=/var/lib/dsh-brain
ExecStart=/usr/bin/npx @deepseek-ai/dsh --profile qqbot
Restart=always
```

## 排障

- `蒸馏 off(无apiKey)`：设 `BRAIN_LLM_API_KEY` 或 `DEEPSEEK_API_KEY`
- 记忆不涨：确认事件含 user/message；`debug: true` 看日志
- 摘除插件即还原官方行为：`dsh plugin --profile qqbot remove qqbot-brain`
