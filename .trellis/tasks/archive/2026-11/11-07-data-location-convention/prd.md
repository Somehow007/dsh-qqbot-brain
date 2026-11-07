# 11-07-data-location-convention

## Goal

把「生产数据在哪、怎么上去的」固化进 `AGENTS.md` 项目约定——线上数据全在云服务器，
但此前服务器地址、数据路径、部署方式只散落在 journal 与归档任务里，新会话无从知晓。

## Requirements

- 在 `AGENTS.md` 项目约定区新增一条「线上数据在哪」约定，覆盖：服务器、插件目录、
  脑数据目录、宿主会话/映射文件、脑图入口与口令存放、备份落点、runbook 指针
- 内容以线上实况为准（journal + 归档任务取证），不写占位符

## Acceptance Criteria

- [x] `AGENTS.md` 项目约定含完整数据位置条目，后续会话仅凭 AGENTS.md 即可定位线上数据

## Resolution（2026-11-07）

- **遇到了什么问题**：用户要求加项目级约定记录数据位置——此前「数据在云服务器」是事实，
  但服务器 IP、路径、部署惯例分散在 journal-1.md 与多个归档任务里，没有单一入口。
- **怎么解决的**：翻 `journal-1.md`（部署/迁移/清洗/公网直连记录）、归档任务
  `11-01-persona-cloud-rollout`、`11-02-brain-public-access`、`11-03-cloud-memory-purge`、
  `dsh-qqbot-brain/README.md` runbook 与 `docs/brain-backup-restore.md`，汇总线上实况后
  写入 `AGENTS.md` 项目约定第二条「线上数据在哪」。
- **线上实况（取证结论）**：
  - 服务器 `ubuntu@124.222.65.169`（腾讯云，SSH 直连无别名；node/dsh 在 `PATH=/opt/node-v24/bin`）
  - 插件 `~/dsh-qqbot-brain/`（rsync dist+package.json，不动远端 cordis.patch.yml），
    `sudo systemctl restart dsh-qqbot` 生效
  - 脑数据 `~/brain-data/`（BRAIN_DATA_DIR：persona.md、op 流水、brain.log）；
    会话原文 `~/.dsh/sessions/**/session.v4.jsonl.zstd`；sessionId 映射 `~/.dsh-qqbot/model-prefs.json`
  - 脑图 `http://124.222.65.169:4099/brain?token=<口令>`（0.0.0.0 公网直连，安全组放行 TCP 4099）；
    口令在服务器 cordis.patch.yml + ~/.dsh/brain.env 两处同值，不落 git
  - 备份：`~/backups/*.tgz`（部署前插件+数据成对）+ 每日 cron + 本地 `brain-data/*.json`（gitignored）
- **Key Decisions**：约定直接写进 AGENTS.md（always-on，新会话必读）而非 spec 文件
  （spec 只在写对应层代码时才被加载，发现性差）；口令等密钥只记存放位置不记值。
- **后续优化方向**：runbook 里 `/opt/dsh-qqbot-brain`、`/var/lib/dsh-brain` 等示例路径与
  线上实际（`~/dsh-qqbot-brain`、`~/brain-data`）不一致，可在下次文档整理时统一；
  cron 备份的实际落盘路径可补录（`crontab -l`）。
- **什么时候干的**：2026-11-07。
