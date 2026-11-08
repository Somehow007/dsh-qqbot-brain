# 根目录项目地图 MAP.md

> 存档约定：每次问题探讨都存档为 task——记录「遇到了什么问题 / 怎么解决的 / 什么时候干的」。本文件即本次工作的存档。

## 问题存档

- **时间**：2026-11-08
- **需求**：给当前项目写一个目录文件放在根目录下，重点服务于学习、规划项目、写进项目、学习开发思路。
- **定位**：README 是门面（讲 what & why），MAP.md 是索引（讲 where & how）——按意图把读者路由到正确的文件/目录/档案，不复述 README 已有内容。

## Requirements

- 按「我想…」意图导航：看懂项目 / 学类脑架构 / 读源码 / 改代码 / 规划任务 / 查历史决策 / 部署运维 / 对外展示。
- 给出 `dsh-qqbot-brain/src` 的源码阅读顺序（数据模型 → 持久化 → 读路径 → 写路径 → 外围）。
- 解释 `.trellis/` 四件套（workflow / spec / tasks / workspace）各自角色，作为「学开发思路」的入口；点出一批值得精读的代表性 task 档案。
- 附命令速查与红线约定（密钥不落 git、brain-data/参赛材料 gitignored、spec 同步点、部署要点）。

## Acceptance Criteria

- [x] MAP.md 位于仓库根目录，中文撰写，风格与 README 一致。
- [x] 覆盖学习 / 规划 / 开发 / 开发思路四类用途。
- [x] 文中引用的路径在仓库中真实存在。

## Resolution（2026-11-08）

- **遇到了什么问题**：仓库内容分两层——代码（dsh-qqbot-brain 插件）与开发档案（.trellis 体系），新人/未来的自己不知道从哪进；README 已覆盖 what & why 但不承担路由职能。
- **怎么解决的**：新增根目录 `MAP.md`，按意图表格 + 带注释的仓库结构 + 源码阅读顺序 + .trellis 开发思路导览 + 命令速查 + 红线约定组织；实施中发现 `task.py create` 在 `git remote show origin`（GitHub 不可达）处无限挂起，用 `--base-branch main` 参数绕过 origin/HEAD 网络探测完成建任务。
- **什么时候干的**：2026-11-08 单次会话完成。

## Key Decisions

- 文件名定为 `MAP.md`（用户从 MAP/GUIDE/INDEX 中选择）。
- 不写重复 README 的叙事内容；MAP 只做路由、顺序与约定索引，保证两份文档长期不打架。
- 顺手留档的坑：`task.py` 的 `resolve_default_branch` 在 GitHub 不可达时会挂在 `git remote show origin`（无超时）；create/archive 等命令遇网络挂起可试 `--base-branch` / `--skip-branch-validation` 绕过。

## 验证

- `ls` 逐一核对文中引用路径（源码各文件、demo/serve-demo.ts、docs 配图、.trellis 子目录、任务档案路径）。
