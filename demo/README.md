# 虚构演示数据集

`brain-export.demo.json` — 全虚构的 `BrainExport` 备份文件，用于公开演示与参赛材料。
人物、会话、openid 均为编造，内容公开安全（动漫社学园祭场景），不含任何真实数据。

## 数据概况

- **38 条记忆**：28 episodic / 6 semantic / 4 attitude，其中 10 条已被巩固吸收（`absorbedAt`）
- **3 个人设**：legacy / 晴天·明快版 / 雨天·慵懒版（active = cozy）
- **2 条会话**：动漫社群（学园祭筹备线）+ 林小满私聊（备考陪伴线）
- **5 份画像**（3 人 + 2 会话）、**2 条 digest**、**2 份情绪态**、1 条 `manual` 全局记忆
- 时间线 2026-10-21 ~ 11-04；strength/hits/lastAccessAt 有自然散布，演示衰减与强化

## 展示点

| 机制 | 看哪 |
|---|---|
| 语义巩固 | `g-s01/s02/s03` 的 `sourceIds` → 对应 `g-e*` 已打 `absorbedAt`，退出检索池但链可查 |
| 人设分轨 | `g-a01`/`p-a01` 属 `campus-bright`，`g-a02`/`p-a02` 属 `campus-cozy`——切人设只切 attitude，事实共享 |
| 会话作用域 | 群聊记忆只在群会话检索池；`m-01`（sessionId=manual）全局可见 |
| 画像分层 | `u:<openid>` 跟人走，`sess:<id>` 会话级 |
| 情绪快照 | 部分 note 带 `emotion`（PAD + mood 桶），会话级 `emotions` 持续态 |

## 加载方式

```bash
curl -X POST "http://<host>:4099/brain/api/import?mode=replace" \
  -H "Content-Type: application/json" --data-binary @brain-export.demo.json
```

`replace` 会清空目标大脑现有数据（先导出真实数据备份）。恢复/迁移细节见
[docs/brain-backup-restore.md](../docs/brain-backup-restore.md)。

## 再生成

```bash
python3 generate_demo_export.py   # 重写出 brain-export.demo.json（确定性 id/时间戳）
```
