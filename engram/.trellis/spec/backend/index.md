# Backend Guidelines — engram

engram 是零运行时依赖的 Node/TypeScript ESM 应用（Node ≥22.18 原生 type stripping 直跑 `.ts`，无构建步骤）。所有规范以 `src/` 现有实现为准；改架构先改这里。

| 文件 | 覆盖 |
|------|------|
| [brain-integration.md](./brain-integration.md) | brain 内核消费契约：shim、via/provenance、sessionId、种子导入 |
| [chat-loop.md](./chat-loop.md) | 单轮管线不变量：串行化、失败语义、history 边界、tool loop |
| [cost-config.md](./cost-config.md) | env 配置面 + 成本一线纪律 |
| [web-server.md](./web-server.md) | HTTP/SSE/鉴权/脑图反代契约 |
| [proactive.md](./proactive.md) | 主动开口预算闸门与投递语义 |
| [testing.md](./testing.md) | node:test 约定与 fake-deps 模式 |
| [deployment.md](./deployment.md) | systemd/env/数据目录/兄弟布局硬约束 |
