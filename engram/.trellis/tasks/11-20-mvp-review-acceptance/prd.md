# MVP 走查与验收标准定制

## 背景

用户要求：再次审核和走查 engram 的开发设计与项目结构，随后定制 MVP 验收标准。

范围：`docs/dev-plan.md`、`docs/deploy.md`、`.trellis/spec/backend/` 七篇、`src/` 全部实现、`.trellis/acceptance.md` 现状，对照根任务 `11-12-companion-mvp-design`（design.md/implement.md）。

## 走查发现（2026-11-20，源码级核对）

### 严重

- **F1 `/brain/*` 反代未鉴权 + 无条件注入 `x-brain-token`**：`web/server.ts` 路由顺序把 `/brain` 代理放在 `authed()` 之前，`proxyBrain` 对所有请求注入 brain 口令头；BrainHttpServer 认该头（插件 http.ts:103）→ 部署后 `http://…:4100/brain/` 公网裸奔完整管理端（记忆 CRUD/人设写入/import/reset）。与 spec「brain server 自带鉴权是边界」矛盾——注入后 brain 侧永远通过。

### 中等

- **F2 `inQuietHours` '24:xx' 边界**：Intl `hour12:false` 部分环境午夜输出 '24:00'，`cur=1440+` 会让 `quietStart='00:00'` 类窗口误判；默认 23:00-08:00 碰巧仍正确，属潜伏 bug。
- **F3 spec/deploy 文档与代码不符**：cost-config spec 写「`EMBED_API_KEY` 回落 `DEEPSEEK_API_KEY`」——代码实为 `BRAIN_EMBED_API_KEY` 且无回落（合理，DeepSeek 无 embedding）；deploy.md 注释「DEEPSEEK_API_KEY chat+蒸馏+embedding 共用」误导——只设它时 embedding 静默关闭、检索退化纯 lexical。
- **F4 MAP.md「七段 prompt」** vs 实际九段（prompt.ts 9 个 block）。
- **F5 tool loop 第三轮空 content 误降级**：模型连用 2 轮 tool 后第 3 次调用若仍只回 toolCalls 无 content → 判失败走降级文案，浪费已执行的 tool 结果。边缘情况。

### 轻微/观察

- F6 `makeEngramLogger` 与 shim `makeFileLogger` 重复（本地版多 TAG 前缀）——可不改
- F7 `history.countProactiveSince` 无调用方——死 API 无害
- F8 `CHAT_LLM_TEMPERATURE=0` 无法生效（`Number()||default` 吞 0）
- F9 consolidation `lastRun` 内存态重启重置——与插件同模式
- F10 slice1 剩余工作（persona 适配/部署/dogfood）在根任务 implement.md 跟踪，engram 本地 `.trellis/tasks/` 为空——按本项目治理应在 engram 立项执行任务
- F11 `web/server.ts` 零路由级测试——auth bypass 正是此类测试可抓；e2e 只有手工冒烟约定

## 处置

- F1：修复——`/brain/*` 移到 `authed()` 之后（engram token 单点门禁，SSO 不变）
- F2：`hourCycle:'h23'` 修正
- F3/F4：spec/deploy/MAP 文档对齐代码事实
- F5：记录为已知边界（tool 默认关、影响小），不改代码
- F8：顺手修（isFinite 判断）
- F10：engram 本地任务承接 slice1 执行（本任务即起点）
- F11：验收标准补「/brain/* 无凭证不返回管理内容」实证断言

## MVP 验收标准定制

现有 ACC-E01~E05 + 观察项基础上，对照 implement.md V1-V9 与走查发现扩充：

- ACC-E01 扩写：部署自举 + 鉴权边界实证（/api/* 与 /brain/* 无凭证均拒）
- ACC-E06 新增：engram-data ⊥ brain-data 数据隔离
- ACC-E07 新增：persona 双侧生效（=implement V1-V3：fresh 首启种子/二次幂等/setPersona 同步）
- ACC-E08 新增：成本基线（首周 usage 分布 vs 6-9k 模型，超阈值打回）
- ACC-E03/E04/E05 保留原样（覆盖 implement V4-V9 的实证面）

## Acceptance Criteria

- [x] F1 修复 + typecheck/test 绿（21/21）
- [x] F2/F8 代码小修（quietHours hourCycle h23；temperature isFinite——quietHours 边界用例未单独加，proactive.test 已有窗口用例覆盖主路径）
- [x] F3/F4 文档对齐（cost-config spec / deploy.md / MAP.md / web-server spec）
- [x] acceptance.md MVP 验收集定制完成（E01 扩写 + E05 并入 V8/V9 + 新增 E06/E07/E08 + Slice 门槛条款）
- [x] dev-plan.md 状态同步
- [x] CHANGES 广播（engram + 根）——已于 2026-11-20 随走查完成追加

## Out of Scope

slice1 功能推进本身（persona 改写/部署/dogfood）、slice2 实现、F5 tool loop 改造、渠道扩展

## Resolution（2026-11-20）

- **遇到了什么问题**：slice1 代码骨架完成后未部署，需走查设计/结构/spec/实现一致性并定制 MVP 验收标准
- **怎么解决的**：通读 design.md/implement.md/dev-plan/spec 七篇/src 全部 ~1.9k 行/现有 acceptance，对照根任务 implement.md V1-V9 逐项核对；发现并修复 F1 鉴权顺序漏洞（部署前拦截）、F2/F8 代码边界、F3/F4 文档漂移；acceptance.md 扩为 E01-E08 + Slice 门槛
- **关键验证结论**：typecheck 净、21 tests 绿；F1 为部署阻断级（公网裸奔管理端），已修
- **后续优化方向**：slice1 剩余 = persona 双语境改写 + generate_seed 重出 + 本地真实对话验证 + 部署 + dogfood ≥1 周（ACC-E01~E08 全过为 Slice1 门槛）；web/server.ts 路由级单测留作后续（F11）；tool loop 第三轮边界观察
- **什么时候干的**：2026-11-20，单会话走查+修复+验收定制
