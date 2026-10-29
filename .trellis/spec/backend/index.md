# dsh-qqbot-brain 后端约定

- TypeScript ESM，零运行时依赖（2C2G 服务器约束）；相对导入带 `.ts` 扩展名。
- 类型导入必须 `import type`（Node strip-types 模式兼容）。
- 禁用构造器参数属性（`constructor(private x)`）——Node 类型擦除不支持。
- 宿主交互用结构化投影接口（仿官方插件），不硬依赖 cordis 类型。
- 测试：`node --test test/brain.test.ts`（Node 原生跑 TS）；构建 `npx tsc -p tsconfig.json`。
- 记忆算法与调研实验一致：char 2-3gram TF-IDF + score=α·cos+β·R+γ·imp；R=e^(-t/S)。
- 蒸馏/LLM 调用必须可注入 fetch、可配置关闭、失败静默不阻塞回复。
