# 实施切片（交便宜模型逐片开发）

每片一个独立 brief：**给它本片的条目 + design.md 引用的章节 + 对应概念图文件**，不给全量上下文。每片结束必须过「通用验收」，再做本片验收。开工前跑 `trellis-before-dev`；一片一提交。

## 通用验收（每片都跑）

```bash
cd dsh-qqbot-brain && npm run typecheck && npm test && npm run build
node --experimental-strip-types ../demo/serve-demo.ts   # http://127.0.0.1:4099/brain
```
- 浏览器控制台零报错；`?ui=legacy` 旧页仍完整可用（P4 前）。
- 不新增 npm 依赖；不新增 LLM 调用；不改 `/api/state` 现有字段含义。

## 切片

| 片 | 内容 | 参照 | 本片验收 | 上线点 |
|---|---|---|---|---|
| S0 | **demo 数据扩充**：`demo/generate_demo_export.py` 增加 whale/ye-shunguang/firefly 三人设（characterId 齐全）与 ≥350 条记忆（含自我轨、derived 边来源、各情绪、fading）；保留原 38 条小集为 `--small` | design §3 规模、§8 | demo 起来后旧页正常；三人设可切 | — |
| S1 | **B1 人设 meta 字段**（store 类型、create/save 透传、校验、export/import） | §6 B1 | 单测：透传/清除/非法色值 400/traits 越界 400/导入导出往返 | P1 |
| S2 | **壳层骨架**：web/ 目录、http 静态服务+白名单+免口令+宿主 register、build 拷贝、`?ui=legacy`、core/{api,store,router,ui,theme}.js、顶栏（人设/导航/皮肤按钮/查看人设/统计条/搜索框），皮肤占位；管理导航跳旧页 | §1 §2 §4 | http.test 补静态用例；theme.js 单测（三级解析、默认皮肤规则、localStorage 键按角色） | P1 |
| S3 | **vm.js + 测试迁移**：helper 从 page.html 迁到 core/vm.js（旧 page.html 保留自身副本不动），`buildMapVM` 按 §3 映射表；page.test.ts 的 helper 用例改为 import vm.js（新文件 test/web-vm.test.ts），旧 page.test 保留到 P4 | §3 | 旧断言全过；新增：自我轨按角色过滤、七日心情空日为「—」、即将隐没天数公式、截断按比例分配 | P1 |
| S4 | **cortex 迁移**：page.html 展示区（舞台/侧栏/卡片）迁成 skins/cortex.{js,css}，立绘落 assets/；接皮肤接口；非大肥鱼人设适配 | §5.1 | whale 截图与 `?ui=legacy` 并排无差异（vault 除外）；ye/firefly 下无「大肥鱼」字样，单字头像+人设色；信号/漂浮开关与缩放仍生效 | **P1 部署** |
| S5 | **nocturne 皮肤** | §5.3 + `b-nocturne.html` | `?skin=nocturne&still=1` × 三人设截图与概念同参对照；`?sel=`；150 星上限；切人设颜色补间；hidden 时 rAF 停 | P2 |
| S6 | **dossier 皮肤** | §5.2 + `a-dossier.html` | `?skin=dossier` × 三人设截图对照；60 点上限；索引表「查看全部」跳管理端 | **P2 部署** |
| S7 | **B2–B5 后端** | §6 | 每个接口单测+http 测；`/api/ops?limit=` 旧调用不变；dedup 无 dry 行为不变 | P3 |
| S8 | admin 壳 + **记忆库** | d-admin `#memories`（打开开发标注截图） | 9 项筛选/排序/分页走 B2；抽屉新增编辑；批量走 B4；删除二次确认；编辑态暂停刷新；**旧页「域内待放行」队列（/api/release-candidates）保留为筛选项** | P3 |
| S9 | **流水** | d-admin `#ops` | 分页/类型/时间走 B3；展开原始 op JSON；关联记忆跳转 | P3 |
| S10 | **人设** | d-admin `#personas` | 编辑 name/characterId/text/moods + meta（配色实时预览、情绪色、特质滑块、mono/en/tagline）；导入 .md/另存/删除；「设为当前」二次确认；未保存离开提示 | P3 |
| S11 | **画像** | d-admin `#profiles` | 编辑/合并/重新生成/删除；**旧页会话可见域设置（/api/sessions/domain）迁到此页** | P3 |
| S12 | **备份迁移** | d-admin `#backup` | 导出/合并导入/覆盖导入（输入「覆盖」）/去重预估→确认（B5）/按时段删、按人设删（预览数量）/记忆重置（输入确认） | P3 |
| S13 | **概览 + 关联图** | d-admin `#overview` `#graph` | 四大数字口径同 d-admin；关联图 40 条按比例截断 | **P3 部署**：管理导航不再跳旧页 |
| S14 | **收尾**：删 page.html、`?ui=legacy`、旧 page.test；补 `.trellis/spec/frontend/`（目录结构、皮肤接口、token 集、VM 口径）；MAP.md / README 同步；CHANGES 广播 | — | 全量测试；生产走查三皮肤 × 实际人设 | **P4 部署** |

依赖：S0 → S1/S2/S3 → S4 → (S5, S6 可并行) ；S7 → S8–S13（可并行，但同改 admin/shell.js 的只能串行）→ S14。

## 功能对齐清单（旧页能力 → 新位置，P3 前逐项打勾）

| 旧页（page.html） | 新位置 |
|---|---|
| 搜索唤起 + 模拟会话下拉（/api/query） | 顶栏搜索 → `skin.highlight()` |
| 鲸脑图谱 / Inspector / TOP RETENTION | skins/cortex |
| 记忆库 9 筛选 + 手动写入 + 域内待放行 | admin/memories |
| 画像编辑/合并/重新生成 + 会话可见域 | admin/profiles |
| 事件流水 | admin/ops |
| 人格内核（人设版本 CRUD/角色/情绪词/激活） | admin/personas |
| 备份/导入/去重/按时段删/按人设删/重置 | admin/backup |

## 风险点 / 回滚点

- `http.ts` 口令前置判断改动：免口令只能命中 `${prefix}/web/` 白名单文件，测试必须覆盖「`/brain/api/state` 无口令仍 401」。
- cortex 迁移最容易丢细节（缩放、LOD 标签、信号脉冲），S4 必须并排截图。
- 回滚：每个 P 点部署前按 runbook 成对备份；B1 字段旧代码可忽略，无需回滚数据。

## start 前检查

- [x] 用户批准最终规划摘要
- [x] 本任务为 inline 工作流（无 jsonl 门禁），开发时每片先跑 trellis-before-dev

## 进度记录

- **S0–S6（P1+P2）**：demo 数据 / B1 meta / web 壳层 / vm / cortex 迁移 / nocturne / dossier —— 已上线。
- **S7（P3 后端）**：B2 notes 分页、B3 ops 分页+筛选、B4 notes/batch、B5 dedup?dry=1 —— 已提交（268 测试全绿）。
- **S8–S13（P3 管理端）**：`src/server/web/admin/` 九个模块落地——common（ctx/口径/分页器/编辑暂停/离开守卫/mutRefresh）、admin.css（token 化 D-admin 版式）、shell（七页路由+人设切换+刷新状态）、overview、memories（9 筛选+B4 批量+抽屉 CRUD+放行队列+跨页定位）、personas（全字段+meta 预览+导入导出+.md）、profiles（CRUD/合并/重生成+会话域）、ops（B3 分页+类型/时间+展开 JSON+跳记忆库）、graph（弧线图 40 截断+详情面板）、backup（导出/导入/去重预估/危险区三操作）。`#/admin*` 路由由旧页跳转改为原生 adminView；顶栏「管理」进 `#/admin`。
