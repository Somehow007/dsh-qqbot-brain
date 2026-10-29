# dsh-qqbot-brain：大肥鱼类脑架构插件

## 目标
为官方 dsh-qqbot 增加"人格内核+分层遗忘记忆+情绪插件"，并提供 /brain 脑图可视化页。

## 架构
独立 Cordis 插件，不 fork 官方包：
- 注入：system-prompt/assemble 追加 brain:persona/emotion/memory 三个 section（order 80/82/84）
- 捕获：ctx.on('session/event') 配对 user/assistant message，turn/end 触发蒸馏
- 存储：JSONL+快照（store.ts）；检索：n-gram TF-IDF + 艾宾浩斯衰减（retrieval/decay）
- 可视化：node:http 兜底端口 + ctx.webServer 路由，页面风格=大脑剖面（mockup-brain-v2.html）

## 里程碑
- [x] M0 概念样机（v2 剖面版，已认可）
- [x] M1 brain 核心 + 9 项单测 + 真实 API 冒烟
- [x] M2 插件壳（config/inject/capture/index）+ tsc 构建
- [x] M3 脑图页接真实 API
- [x] M4 服务器部署文档
