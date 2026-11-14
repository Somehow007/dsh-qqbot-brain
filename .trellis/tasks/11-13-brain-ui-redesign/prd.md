# 脑图页 UI 重构设计（多主题 + 管理端）

## Goal

dsh 插件 `/brain` 脑图页从「绑死大肥鱼的单文件页」升级为**多 IP 人设通用**的页面：展示区三套皮肤可切换（保留现有鲸脑皮层），管理端换成 D-admin 七页结构。产出一份可切片的设计，交给便宜模型逐片还原。后续可扩展为陪伴型 Agent 页面，本次只留路由扩展位。

## Background（2026-11-13）

- 概念图拍板：A 墨刊 + B 夜航星图 + D-admin，C 弃用 → `tasks/11-13-brain-generic-skin-concepts/concepts/`、`archive/2026-11/11-13-brain-admin-spec/`。
- 代码现状：前端是单文件 `dsh-qqbot-brain/src/server/page.html`（1734 行，零依赖），`http.ts` 只服务 HTML + 白名单 API；大肥鱼硬编码在 page.html:6,326-338,380-382,1103，立绘为 base64 常量（:503-504），`WHALE_IDS` 回落（:1170）；`test/page.test.ts` 正则抠脚本跑 helper；PersonaEntry 仅 `{id,name,text,characterId?,moods?}`（store.ts:48）；notes/ops 无服务端分页；demo 仅 38 条、无 ye/firefly 人设。

## Requirements

- R1 展示区三皮肤：**鲸脑皮层 cortex / 墨刊 dossier / 夜航星图 nocturne**，顶栏按钮三选一（用户拍板）。
- R2 默认皮肤跟人设走：大肥鱼系 → 鲸脑，其他 → 星图；手动切换按角色存本地；鲸脑对其他人设通用（换名字/主色/单字头像，无立绘，脑形不变）（用户拍板）。
- R3 大肥鱼 + 鲸脑与现页视觉一致（vault 区移到管理端除外）。
- R4 管理端统一 D-admin 结构，只随皮肤换配色 token；旧页全部管理能力都要有新位置（对齐清单见 implement.md）。
- R5 「查看人设」只改前端视角；「设为当前人设」只在管理端、二次确认。
- R6 概念图里的随机/虚构数据一律换真实口径，无数据的块删掉（映射表 design §3）。
- R7 不加 npm 依赖、不加 LLM 调用；后端新增 B1–B5 见 design §6。
- R8 每个上线点功能不回退：过渡期 `?ui=legacy` 保留旧页，管理导航先跳旧页。

## Acceptance Criteria

- 三皮肤 × 三人设（whale / ye-shunguang / firefly）在 demo 上 `?still=1` 截图与概念图同参对照通过；cortex+大肥鱼与 `?ui=legacy` 并排无差异。
- 皮肤默认/记忆规则符合 R2（theme.js 单测覆盖）。
- admin 七页覆盖对齐清单全部项；删除/覆盖/重置/激活人设均需确认。
- `/brain/api/*` 无口令仍 401；`/brain/web/*` 仅白名单文件可取。
- typecheck + test + build 全绿；P1–P4 每点生产走查通过。

## Out of Scope

- 陪伴型 Agent 页面（仅留 `#/companion/*` 路由位）；C 花序；intents 管理页；画像分页、记忆手动指定 characterId、recall/decay 事件落盘；移动端精调（≤900px 单列不崩即可）。

## Artifacts

- `design.md`：架构、文件布局、皮肤接口、VM 映射、主题、后端契约、迁移回滚、测试口径。
- `implement.md`：S0–S14 切片、上线点 P1–P4、功能对齐清单、风险点。
