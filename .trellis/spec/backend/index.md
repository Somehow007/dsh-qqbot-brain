# dsh-qqbot-brain 后端约定

- TypeScript ESM，零运行时依赖（2C2G 服务器约束）；相对导入带 `.ts` 扩展名。
- 类型导入必须 `import type`（Node strip-types 模式兼容）。
- 禁用构造器参数属性（`constructor(private x)`）——Node 类型擦除不支持。
- 宿主交互用结构化投影接口（仿官方插件），不硬依赖 cordis 类型。
- 测试：`node --test test/brain.test.ts`（Node 原生跑 TS）；构建 `npx tsc -p tsconfig.json`。
- 记忆检索算法：char 1-3gram TF-IDF cosine（文本先归一化：小写化 + `[^\p{L}\p{N}]` 全去掉——标点不去会把 bigram 切断，如「橘猫，名叫年糕」对「猫叫什么」cos=0）；命中先过 `minCosine` 门槛（默认 0.04，0=不过滤，离线校准值见 tasks/10-31-retrieval-lexical-fix），再按 score=α·cos+β·R+γ·imp/5 排 topK，不足不凑数（可返回空）；R=e^(-t/S)。
- `Brain` 的 `config` 是 `Partial<BrainConfig>`：插件侧改检索/巩固参数时必须显式并入（`config: { ...cfg.retrieval, consolidateMinAgeDays, consolidateMinNotes }`）——`cfg.retrieval` 曾漏接导致配了不生效，新增 BrainConfig 字段时同步检查 src/index.ts 装配与 src/config.ts 的 RetrievalConfig/DEFAULT_CONFIG。
- 记忆 kind 三型：episodic 情景 / semantic 语义 / attitude 态度（角色对人·事·话题的立场，content 规范「对<对象>：<立场>」）。attitude 不进语义巩固输入；含当前发言人昵称的 attitude 在 assemble 中保底唤起（≤3 条），不占 topK。
- 新增记忆 kind 或 JSONL op 时同步改：types.ts 联合、distill 解析、http.ts 入参、page.html 的 kindLabel/KIND_GLYPH/REGION/三个 kind select。
- 画像按人存储：键 `u:<openid>`（发言人 tag 带 openid）/ `sess:<sessionId>`（兜底，私聊 sessionId 即用户派生）。主键/actor 拆分走 `src/brain/identity.ts`；store 兼容旧裸 sessionId 键与字符串值（load/apply 时迁移）；蒸馏 `profiles:[{actor?,text}]` 结构化输出，旧 `profile` 字符串字段仍解析为会话级。注入时发言人 openid 取个人画像置顶，sess 画像标「会话画像」次之；attitude 保底唤起不限本会话（对人记忆跟人走）。页面 `/api/profiles` 按人出卡，sess 卡由 `/api/sessions` 出。
- 蒸馏/LLM 调用必须可注入 fetch、可配置关闭、失败静默不阻塞回复。
