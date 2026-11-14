# 脑图管理端可交互规格稿（d-admin）

## Goal

脑图要走向多 IP 人设的通用场景，管理端必须能承担完整的运维职责。本任务产出一份**可交互的管理端规格稿**，作为后续开发（包括交给便宜模型照着实现）的参照：页面结构、交互状态、字段口径和接口映射都以它为准。

## 来源

由 `11-13-brain-generic-skin-concepts` 第三轮分出：用户认可 D（瑞士网格）的视觉，但指出 D-swiss 只是一张看板，担不起管理端（流水显示不全、记忆没分页、没有人设切换/编辑/新增、没有记忆 CRUD）。

## 产物

- `d-admin.html`：本目录下的**冻结定稿**（单文件，mock 数据内置；`data.js` 只是同目录兼容副本）。工作副本在 `11-13-brain-generic-skin-concepts/concepts/d-admin.html`，预览用 `cd <那个目录> && python3 -m http.server 50311`，或直接在本目录起服务。
- URL 参数：`?notes=1` 打开开发标注；`?drawer=new` / `?drawer=edit:<id>` 直接打开记忆抽屉；`?selftest=1` 跑 20 项自检（会改动内存 mock，含清空）。

## 页面清单（hash 路由）

| 页 | 内容 |
|---|---|
| #overview | 4 个大数字（记忆 / 均存 / 自我:世界 / 将遗忘）、类型与轨道分布、最近唤起、最近 5 条流水 |
| #memories | 搜索 + 9 项筛选 + 排序（字段 + 升/降，表头可点）+ 每页 20/50/100 + 分页器；勾选后出批量条；新增/编辑走右侧抽屉（content ≤200 字计数、kind、importance、会话、可见域、self 三态、角色、actor）；删除二次确认；toast |
| #personas | 人设列表 + 编辑器：name / characterId / version、配色 a/a2/soft/deep（实时预览）、情绪词表（带色 chip）、特质滑块、persona.md 大文本；新增 / 导入 .md / 另存副本 / 删除 / 设为当前；未保存离开时提示 |
| #profiles | 画像卡片网格 + 分页；编辑、合并、重新生成、删除 |
| #ops | 流水表格 + 事件类型/时间筛选 + 分页，点行展开原始 op JSON，关联记忆可跳转 |
| #graph | 弧线图（沿用 d-swiss）：按类型/轨道过滤，截断 40 条时三类按比例分配名额，点选看详情 |
| #backup | 导出、导入（合并 / 覆盖，覆盖需输入「覆盖」）、近重复合并（预估→确认）、危险区重置（输入确认） |

## 通用交互约定（标注里写明，开发必须遵守）

- 15s 轮询 `/api/state`；处于编辑态（抽屉、人设编辑器、画像编辑）时跳过刷新，顶栏显示「编辑中 · 自动刷新已暂停」。
- content 永远不截断写回（展示可以截断，提交必须用原文）。
- 删除、覆盖、重置一律二次确认；失败用 toast 提示，不阻塞页面。

## 后续开发提醒：需后端新增（已在各页标注中标「需后端新增」）

1. **记忆服务端分页 / 筛选**：`GET /api/notes?page=&size=&q=&kind=&track=&scope=&status=&sort=`。目前 `/api/state` 一次返回全部 notes，数据量上来后不可行。
2. **流水分页 / 过滤**：`/api/ops` 目前只有 `limit`（1–500），而且是 500 条环形缓冲（OPS_LOG_CAP）。需要 page / 类型 / 时间范围参数；若要 recall/decay 这类独立事件，还要新增事件落盘（现在 decay 是实时计算、没有 op，recall 只留 reinforce 痕迹）。规格稿里的「事件类型」只是展示层归类。
3. **批量接口**：例如 `POST /api/notes/batch {ids[], patch | delete:true}`。现在只能逐条 PATCH/DELETE，或用 `POST /api/notes/purge` 按时段/人设删。
4. **记忆手动指定 characterId / personaId**：现在恒为写入时的活动人设。
5. **人设主题字段**：PersonaEntry 目前是 `{id, name, text, characterId?, moods?}`，没有配色。方案 ① 加 `theme:{a,a2,soft,deep}`（规格稿按此演示）；② 前端按 characterId 哈希派生（零后端改动，但不能自定义）。
6. **情绪词颜色**：moods 现在是字符串数组；可以加颜色，或前端按词名哈希派生。注意：词表变更会影响蒸馏 prompt 和可视化分桶。
7. **特质 traits**：PersonaEntry 没有这个字段，可挂 `meta:{traits:[{name,v}]}`。
8. **画像分页参数**。
9. **近重复合并 dry-run / preview**：现在 `/api/dedup` 直接执行、没有估算；前端可先用 `stats.nearDup` 近似。

## 开发建议

- 按页拆小任务，每个任务把 d-admin 对应页面 + 打开标注后的截图一起交给开发模型，要求「按规格稿还原 + 接真实 API」。顺序建议：记忆库 → 流水 → 人设 → 画像 → 备份 → 概览 → 关联图。
- 后端需要新增的接口先做（尤其 1、2、5），否则前端只能先用全量数据在本地分页过渡。
- mock 里的字段名已对齐真实 note 字段（`id content importance kind actor sessionId createdAt strength lastAccessAt ageDays retention hits fading emotion personaId self absorbed private scope`）。保持率口径为 `R = e^(-t/S)`（t = 距 lastAccessAt 的天数，S = strength），遗忘线是 `config.forgetThreshold`（0.2）。

## Resolution（2026-11-13）

**遇到了什么问题**：通用皮肤概念第二轮的 D-swiss 只有看板，没有管理能力：流水显示不全、记忆没分页、没有人设和记忆的 CRUD，无法引导后续开发。

**怎么解决的**：在 D 的瑞士网格视觉上做了可交互的管理端规格稿 d-admin：7 页 hash 路由，mock 137 条记忆 / 约 260 条流水 / 14 个画像 / 3 个人设，CRUD 在内存中真实生效；「开发标注」可折叠，逐模块标出真实路由（以 `src/server/http.ts` 为准）、字段口径，以及「需后端新增」项。走查修了：mock 保持率分布、排序方向反了、抽屉参数无效、关联图截断丢了情景类且标签过长、标注块过大、概览「45:92」被误读成小数。

**Key Decisions**
- 规格稿用 mock 数据、不连后端：先把交互和状态定死，接口差距显式标出，开发时逐项补。
- 现有接口不支持的能力不在前端假装支持，统一标「需后端新增」，并给出过渡替代方案。
- 视觉沿用 d-swiss（白底黑字、粗分隔、人设色只做强调），保证换人设时只换强调色。

**验证**：7 页截图走查；dump-dom 无 JS 报错；`?selftest=1` 20/20 通过（排序、抽屉新增/编辑、记忆增删改、画像合并/重新生成/删除、关联图三类与点选、去重、合并导入、按时段/人设清理、重置）。未覆盖：文件选择器（导入 .json / .md）无法自动化，只验证了导入后的处理逻辑和「输入确认」的拦截代码。

**后续优化方向**：见上方「需后端新增」9 项与「开发建议」；正式实现时还要做移动端适配（规格稿以桌面为主）。

**什么时候干的**：2026-11-13。
