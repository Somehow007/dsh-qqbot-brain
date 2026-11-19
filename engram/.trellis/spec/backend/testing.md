# 测试约定

`node --test test/*.test.ts`（Node 24 原生 TS type stripping 直跑，无构建无框架）。

## 分层

| 层 | 文件 | 依赖 |
|---|---|---|
| 纯逻辑 | `history.test.ts` `prompt.test.ts` `config.test.ts` | 仅 node:fs/tmpdir，无网络无 brain |
| 管线 | `loop.test.ts` `proactive.test.ts` | fake deps（见下） |

## fake-deps 模式（loop/proactive 共用）

- brain/llm 用对象字面量 + `as never`/`as unknown as` 断言——**只实现被测路径用到的方法**（`assemble`/`ingest`/`endOfTurn`/`queryEmbedding`/`emotionOf`/`chat`），不 mock 整个类。
- 断言重点是**不变量**不是实现细节：
  - loop：失败轮 `ingested.length===0`（不污染记忆）、via:'user' 显式、串行顺序；
  - proactive：四道闸各自独立验证（enabled/quietHours/minInterval/maxPerDay）、`via:'agent'`+`userText===''` provenance 断言。
- **时间相关测试不依赖墙钟**：quietHours 用 `hhmm(±offset)` 按 `cfg.timeZone` 动态生成窗口（`QUIET_NOW`/`QUIET_AWAY` 常量），任何时刻跑都确定。

## 纪律

- 新增模块配套测试；改不变量（串行化/失败语义/via 标注/预算闸门）必须有测试钉住。
- 不引入 vitest/jest——node:test 够用，零依赖是项目纯净度的一部分。
- 集成测试（真 Brain+临时 dataDir）允许但保持少量；e2e HTTP 冒烟手工跑（见 deployment.md）。
