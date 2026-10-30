# qqbot-brain

为官方 `@tencent-connect/dsh-qqbot` 增加人格、记忆与情绪能力的独立 Cordis 插件。插件与官方 QQ Bot 并列运行，不需要修改官方包；`/brain` 页面可查看脑图、会话与记忆，并管理记忆和人格。

插件代码位于 [`dsh-qqbot-brain/`](./dsh-qqbot-brain/)，目录中的 [`README.md`](./dsh-qqbot-brain/README.md) 另有简要架构说明。根目录的 `mockup-brain*.html` 是界面样稿，不是运行入口。

## 准备工作

- Node.js 20 或更新版本，以及 npm。
- 已配置好 QQ Bot 的 `dsh` `qqbot` profile，并能正常运行官方 `@tencent-connect/dsh-qqbot`。
- 如需从聊天中自动提炼记忆和情绪，准备 DeepSeek 或兼容 OpenAI Chat Completions API 的密钥；没有密钥时蒸馏会自动关闭，仍可手动管理记忆。

## 安装与启动

在仓库根目录执行：

```bash
cd dsh-qqbot-brain
npm ci
npm run build
npx @deepseek-ai/dsh plugin --profile qqbot add "$PWD"
```

插件包通过 `cordis.patch.yml` 注册 `qqbot-brain`，并与官方插件一起加载。若你的 profile 不叫 `qqbot`，将上述命令及下方启动命令中的 `qqbot` 换成实际 profile 名称。

启动前设置蒸馏密钥（不要将密钥写入仓库），以及可选的数据目录：

```bash
export DEEPSEEK_API_KEY='你的 API 密钥'
export BRAIN_DATA_DIR="$HOME/brain-data"
npx @deepseek-ai/dsh --profile qqbot
```

默认内置脑图服务监听 `127.0.0.1:4099`，本机访问 `http://127.0.0.1:4099/brain`。若宿主提供 `webServer`，页面会改为挂载到宿主的 `/brain` 路径，使用宿主的地址和端口；启动日志会显示实际挂载方式。

> 默认 HTTP 配置只监听本机、无访问口令。部署到服务器时保持默认并通过 SSH 隧道（`ssh -L 4099:127.0.0.1:4099`）访问；如需公网直连，请同时设置 `http.token` 并用安全组/防火墙限制来源 IP，不要把无保护的脑图端口暴露到公网。webServer 挂载模式下 `http.host` 不生效，需靠 `http.token` 或宿主侧访问控制。

## 使用脑图

打开 `/brain` 后，可以查看人格、会话情绪、画像、记忆和操作记录；选择会话查看对应记忆，也可以检索、手动新增、编辑、强化或删除记忆。聊天轮次结束后，已配置密钥时插件会自动蒸馏记忆与情绪；旧的情景记忆也可在满足条件后巩固为语义记忆。

人格内核可通过脑图页面编辑，也可修改数据目录下的 `persona.md` 并重启。启动时若 `persona.md` 存在，它优先于已保存的人格和配置；首次启动时插件会自动创建该文件。默认数据目录为 `~/brain-data`，其中保存人格文件、`brain.jsonl` 和定期生成的 `brain.snapshot.json`。请备份该目录以保留数据。

## 自定义配置

安装前可修改 [`dsh-qqbot-brain/cordis.patch.yml`](./dsh-qqbot-brain/cordis.patch.yml) 中现有的 `config.http`，例如只允许本机访问：

```yaml
- insert:
    - id: qqbot-brain
      name: '@local/dsh-qqbot-brain'
      config:
        http:
          enabled: true
          host: 127.0.0.1
          port: 4099
          prefix: /brain
          token: ''
```

设置 `http.token` 后，浏览器经 `http://<host>:4099/brain?token=<口令>` 打开页面，口令会存进会话存储并自动附带到所有 API 请求；纯 API 访问可传 `?token=` 或 `X-Brain-Token` 请求头。不要在仓库中保存真实口令。修改安装来源的 patch 后需重新安装插件并重启宿主使配置生效。

常用环境变量：

| 变量 | 作用 |
| --- | --- |
| `BRAIN_LLM_API_KEY` / `DEEPSEEK_API_KEY` | 蒸馏所用密钥；前者优先 |
| `BRAIN_LLM_BASE_URL` | 兼容接口的基础地址，默认 `https://api.deepseek.com` |
| `BRAIN_LLM_MODEL` | 蒸馏模型，默认 `deepseek-chat` |
| `BRAIN_DATA_DIR` | 记忆数据目录，默认 `~/brain-data` |
| `BRAIN_PERSONA` | 没有 `persona.md`、已保存人格或官方 profile 中 `groupPrompt` / `directPrompt` 时，用于初始化人格的文本 |

其余可配置项（如 `injectPersona`、`injectEmotion`、`injectMemory`、`injectSpeaker`、`llm`、`retrieval`、`consolidation`、`http` 和 `debug`）见 [`src/config.ts`](./dsh-qqbot-brain/src/config.ts)。环境变量中的 LLM 配置和数据目录优先于 patch 中的对应配置。

## 开发与排障

```bash
cd dsh-qqbot-brain
npm ci
npm run typecheck
npm test
npm run build
```

`npm test` 使用 Node 原生 TypeScript 测试运行能力；若当前 Node 版本不能直接运行 `.ts` 测试文件，请使用支持原生类型擦除的较新 Node 版本。构建产物在 `dist/`。

- 日志显示 `蒸馏 off(无apiKey)`：检查 `BRAIN_LLM_API_KEY` 或 `DEEPSEEK_API_KEY` 是否传入启动进程。
- 脑图打不开：查看启动日志是 `host:/brain` 还是独立 HTTP 地址，并检查端口、监听地址和防火墙。
- 人格修改后重启没有生效：检查数据目录中的 `persona.md`；它是启动时的优先来源。
- 不再需要插件时，可执行 `npx @deepseek-ai/dsh plugin --profile qqbot remove qqbot-brain`；已有记忆数据仍保存在数据目录中。
