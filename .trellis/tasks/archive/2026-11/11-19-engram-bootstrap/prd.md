# engram 陪伴 Agent 壳层 MVP 骨架 + 项目治理初始化

## 背景

承接 `11-12-companion-mvp-design`（design/implement/prd 已定稿）：engram = brain 内核第二 deployment，Web 1-on-1 自用陪伴（流萤人设），记忆可观测为差异化。用户要求「以长期迭代维护的新项目为主题」完整立项：代码骨架 + Trellis 治理 + 规范文档 + 开发计划 + 验收/部署文档一次建齐。

## 做了什么

- `engram/` 平级新项目（不入插件包）：config / brain shim / persona / chat(llm,history,prompt,loop,proactive,tools) / web(server+chat.html) / main 装配
- brain 消费方式定稿：**Node≥22.18 type stripping 直引 `dsh-qqbot-brain/src/**/*.ts` 源码**（零构建、签名漂移 typecheck 即暴露），经 `src/brain.ts` shim 唯一入口；兄弟布局为硬约束
- 关键不变量落地：proactive `Turn{userText:'',via:'agent'}`、LLM 失败不写 Turn、chat promise-chain 串行化、history 有界截断、双 LLM 面（chat/brain 独立配置）
- `trellis init --devin` 全量治理：`.trellis/spec/backend/` 七篇**源码级**契约（brain-integration/chat-loop/cost-config/web-server/proactive/testing/deployment）、`.trellis/acceptance.md`（ACC-E01~E05）、`docs/dev-plan.md`（slice1/2 排期）、`docs/deploy.md`（systemd/env/rsync 兄弟布局 runbook）、AGENTS.md 项目约定、README/MAP
- 测试：21 用例 node:test 全绿；typecheck 净；本地冒烟（种子+28 记忆、:4100 鉴权、:4101 反代、SIGTERM 停机）通过

## Resolution（2026-11-19）

- **问题**：如何把 companion 壳层立项为长期项目而非一次性脚本？brain 引用方式（dist vs 源码直引）？治理文件清单？
- **解决**：兄弟目录 + type stripping 直引源码（比 dist 更简：无构建、源码即产物、typecheck 兜底签名漂移）；trellis init 生成脚手架后按 engram 实际结构重写 spec（frontend 模板不适用→backend 七篇）；acceptance/dev-plan/deploy 三件套按根项目格式适配。
- **踩坑记录**：① `ProfileEntry`/`EmotionState` 在 types.ts 非 index 出口——shim 按真实归属导出；② proactive↔web↔loop 构造期循环引用→闭包延迟绑定 onDeliver；③ history 测试 `await import` 在非 async 回调语法错；④ prompt 测试按子串断言被 channelStyle 文本里的「人格内核」字样误伤→改断节标题 `【】`；⑤ IntentEntry 真实字段（text/status/firedCount）与设想不同→按 types.ts 校准。
- **后续优化**：persona.md 群聊→私聊适配 + `generate_seed.py` 重出 seed（slice1 下一步）；生产部署走 docs/deploy.md；proactive/brain_search 待声口基线。
- **验证结论**：代码级全绿+冒烟通过；**未部署生产**——ACC-E01~E05 全部「待触发」，实证验收在 engram/.trellis/acceptance.md 跟踪。
