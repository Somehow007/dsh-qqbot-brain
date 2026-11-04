# 11-04-brain-backup-restore-runbook

## Goal

参赛前置的数据安全处置：线上私密数据（恋人线 + 真人画像，不适合公开）全量备份回本机；
产出一份可独立操作的备份/恢复/新 profile 迁移手册，保证日后新开 dsh profile 能恢复恋人线记忆；
线上数据原封不动，本机后续换虚构数据。

## Requirements

- 线上 `GET /brain/api/export` 全量导出，校验落盘到本机 gitignored 位置
- 手册覆盖：BrainExport 结构、export/import API、merge/replace 语义、
  记忆可见性规则（sessionId 作用域）、新 profile 换 sessionId 恢复 SOP、坑清单
- 手册位置 docs/，README 挂指针
- 顺手核实并修复导入往返丢字段问题

## Acceptance Criteria

- [x] 备份文件 `brain-data/brain-export-private-2026-11-04.json` 存在且 notes 数 = 187
- [x] `docs/brain-backup-restore.md` 含完整 SOP（含 sessionId 改写脚本）
- [x] `dsh-qqbot-brain/README.md` 数据迁移节挂了手册指针
- [x] 导入往返保留 personaId/absorbedAt（测试覆盖）
- [x] 线上数据零改动

## Resolution (2026-11-04)

**问题**：参赛材料需要公开安全的数据，线上真实数据（恋人线 + 真人隐私）不能进材料；
但恋人线要私留且日后新 profile 可恢复。需要：备份落地 + 可独立执行的恢复手册。

**怎么解决的**：
1. 线上 export → 本机 `brain-data/brain-export-private-2026-11-04.json`
   （187 notes / 3 personas / active=whale-devotion，JSON 校验通过；brain-data/ 已 gitignore）
2. 核实导出往返保真度时发现 **`sanitizeNote` 丢 `personaId`**——导入会把 persona 轨记忆
   误归旧人设轨；`absorbedAt` 已保留。修 store.ts + 扩展往返测试（personaId/absorbedAt 断言），143 全绿
3. 核实记忆可见性模型并写进手册：**主检索池按 sessionId 过滤**，新 profile 新会话默认
   只能靠跨会话 actor 通道零星召回 → 手册给出 sessionId 改写的 python SOP
4. `docs/brain-backup-restore.md` 手册 + `dsh-qqbot-brain/README.md` 指针（commit 01b49cf）

**关键结论**：
- 备份含 persona 全集+激活态、全部记忆（含 absorbed/向量）、情绪、画像、digest；
  不含会话原文（~/.dsh/sessions/*.zstd）、ops 环形流水、brain.log
- 恢复分两级：直接 import → u:画像+跨会话语义召回；改 sessionId 后 import → 完整恋人线状态
- replace 前必先对目标 export；openid 稳定性依赖同一 QQ bot AppID

**后续优化方向**：虚构演示数据集（下一步任务）；脑图 UI 加导出/导入按钮；
会话级选择性导出；`task.py create` 名称不要自带日期前缀（脚本会自动加）。

**什么时候干的**：2026-11-04 晚，导出+手册+修复同轮完成。
