# 执行计划

1. 先在 `test/brain.test.ts` 和必要的 HTTP/页面测试中写失败回归：旧 store/文件迁移、预置加载且不自动激活、编辑/切换/重启/快照、注入、旧版与新版备份的 merge/replace、无效输入与前端草稿。
2. 在 `src/brain/store.ts` 实现多版本状态与事件/快照兼容，`src/brain/index.ts` 提供管理入口；确认 `persona()` 和已有注入始终指向活动项。
3. 纳入温柔版 Markdown，调整 `src/index.ts` 启动回退及 `persona.md` 同步，构建/打包包括预置文件；测试旧文件优先级和重启行为。
4. 在 `src/server/http.ts` 加人设列表、编辑与激活 API，保护 token 并注册宿主路由；导入后同步活动文本。
5. 在 `src/server/page.html` 加下拉、活动标记、新增/编辑/保存/切换，避免 15 秒刷新覆盖未保存内容；改备份导出使用服务端全量格式，保留旧备份导入。
6. 执行 `npm test`、`npm run typecheck`、`npm run build`（工作目录 `dsh-qqbot-brain`），审查跨层数据流、差异及 git 状态；按 Trellis 质量检查与用户要求完成归档、日志。

## Review Points

- 存储状态与旧 `persona` 字段同时存在时，以活动指针所指的记录为准；`persona.md` 外部编辑只改活动版本，不生成莫名其妙的新版本。
- 在清空/覆盖模式导入前完成基本校验；失败不应清空现有库。备份页面不再只导出当前人设。
- 新增预置不影响当前活动项；活动项切换只改变人设，不改变记忆、态度和画像。
- 不纳入启动前已有暂存文件。
