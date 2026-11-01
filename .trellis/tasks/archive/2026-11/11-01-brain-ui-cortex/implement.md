# Implement · 鲸脑皮层重构

## 开工前

1. `python3 ./.trellis/scripts/task.py start 11-01-brain-ui-cortex`；调用 `trellis-before-dev` 读 `.trellis/spec/frontend/`。
2. 给 `11-01-brain-ui-abyss` 补 Resolution（"被 brain-ui-cortex 取代，B 版代码作为起点并入"）后归档。
3. 记录起点：`git diff --stat` 快照，确认 76 个测试在当前工作区为绿。

## 步骤（每步结束跑 `npm test`）

1. **纯函数 + 测试**：在 `ngrams` 段内加入 `emotionBucket`、`matchEmotion`、`personaFacets`、`matchFacet`、`layoutSlots`；`page.test.ts` 扩展截取并新增用例（AC3：命中/超时/跨会话/无小节/低于阈值/槽位最小间距与 id 稳定）。
2. **CSS 重写**：以概念 ① 色板与组件（header、stage、legend、ctrl、persona、bubble、sec、rel、meter、svg 类）替换 `<style>`；保留并换色 vault 页签、表格、表单、图表、媒体查询（≤900px 侧栏下沉）。
3. **Markup 重写**：header / stage（`#brain` 六个分层 g）/ aside（`.persona` 用 `PERSONA_BANNER`、`#panel`）/ vault；保留 JS 依赖的 id（`query`、`results`、`count`、`detail`、`personaImg`、`brandAvatar`、页签与人设控件等），删除的 id 同步删 JS。
4. **解剖层**：移植 `smooth()`、大脑/小脑/脑干、沟回、区域柔光、星点取样（`Path2D`+`isPointInPath`，固定随机种子）、外侧标注。
5. **模型与渲染**：`buildCortex()` 组装节点/边；`render()` 按槽位画三种节点、四类边（隐藏类默认透明）、"+N" 溢出标；删除 `SIM`、粒子、平移缩放、拖拽及其事件绑定。
6. **选择与脉冲**：`select()`、两跳脉冲、信号开关（localStorage + reduced-motion）、Esc/空白复位、键盘可达。
7. **检查器**：气泡文案；记忆详情 + 分组关联（推断理由）+ 原有编辑/强化/删除；情绪/人格节点详情（反查记忆）；未选中时人格光谱 + 情绪读数（复用 `emotionChart()`）。
8. **检索与刷新**：`/query` 命中高亮 + 脉冲；`/ops?limit=500`；15s 刷新保持选中。
9. **收尾**：空数据/无人设/无情绪/长文本/窄屏走查；删死代码与无用 CSS。

## 验证

```bash
cd dsh-qqbot-brain
npm test            # 含新增推断/布局用例
npm run typecheck
npm run build       # 同步 dist/server/page.html
```

- jsdom 冒烟：更新 `/tmp/brain-stub/smoke.mjs`（stub 增加 `op:'emotion'` 记录与带 `##` 的人设），断言节点数/形状、选中后 lit/dim 计数、三类关联在检查器出现、CRUD 按钮、检索命中、空库无报错。
- 视觉：`/tmp/brain-stub/server.mjs` 起服务，headless Chrome 截图（默认 / 选中记忆 / 选中人格 / 30 条记忆 / 空库 / 900px 宽）与 `mockup-mind-cortex.html` 对照。
- 手动：真实插件环境下打开 `/brain` 过一遍 CRUD、人设草稿、导入导出。

## 风险点 / 回滚

- 测试截取锚点移动 → 第 1 步先固定锚点位置。
- 大块替换 `<style>`/markup 用脚本按标记替换，避免几十个易碎 `old_string`。
- 回滚：`git checkout -- dsh-qqbot-brain/src/server/page.html`（需先确认，会丢弃工作区改动）。

## 完成后

- prd 补 `## Resolution（YYYY-MM-DD）`，`task.py archive 11-01-brain-ui-cortex --skip-branch-validation`，`add_session.py` 记日志。
- 若推断连线效果不足，另开"后端记录记忆级情绪 / 结构化人格特质"任务。

## 进度（2026-11-01）

- [x] 开工前：任务 start；`11-01-brain-ui-abyss` 补 Resolution 并归档（`523a386`），A/B/C 概念稿提交（`ed3a823`）
- [x] 1 纯函数 + 测试（`emotionBucket/emotionOps/matchEmotion/personaFacets/matchFacet/layoutSlots/mapLabel/companionLine`，+6 用例，82/82）
- [x] 2-3 CSS / markup 按概念 ① 重写（脚本化组装：`/tmp/cortex/assemble.py`，旧记忆库/人设/备份代码原样复用）
- [x] 4-8 解剖层、固定槽位、选择与两跳脉冲、检查器分组关联、检索高亮、15s 刷新保持选中
- [x] 9 空库 / 窄屏（≤1000 侧栏下沉、≤640 搜索下移）/ reduced-motion 走查；死代码清理
- [x] 验证：`npm test` 82/82、typecheck、build（dist 同步）；jsdom 冒烟 25 项 + 空库 5 项全过；headless Chrome 截图（1440/1280/900、选中记忆/情绪/人格、空库）
- [ ] 用户在浏览器验收（真实插件环境 CRUD / 人设草稿 / 导入导出）→ 归档
