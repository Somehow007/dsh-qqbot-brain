# 存量近重复记忆清理

> 存档约定：记清「遇到了什么问题 / 怎么解决的 / 什么时候干的」。

## 背景问题

上一轮关联后端化（`87cdff6`）实现了写入判重 `dedupeEmbedCos=0.9`，只挡**增量**。
线上 150 条记忆里已有 59 对 cos≥0.9 的近重复（「馆长不粉」同句存 6 遍、「荤段子装傻」5 遍、
「P图当菜」系列等），是 mergeIndex 与字面判重的漏网存量，需要一次性清理。

## 方案

- `Brain.sweepNearDups()`：并查集聚类（向量余弦 ≥ `dedupeEmbedCos` 归同簇），
  每簇保留信息量最大的一条（长文案 > 重要度 > 命中 > 更早创建），其余并入后删除。
- `BrainStore.mergeNotes(keepId, dropId, cap)` + 新 op `merge`：保留者收
  强度 max+min×0.5（封顶）、hits 求和、importance 取大、createdAt 取早、
  lastAccessAt 取新、actor/emotion 补缺、sourceIds 并集；op 落流水可审计、可重放。
- 触发入口：`POST /brain/api/dedup`（经运行中进程串行写库，不动数据目录文件锁）；
  页面「备份迁移」页签加「合并近重复记忆」按钮 + `stats.nearDup` 计数展示。
- 悬垂引用：其他记忆的 sourceIds 若引用被删 id，图谱边生成时按存活集过滤，安全降级。

## 验证

- `npm test` 90/90、typecheck、build ✓（新增 merge/replay/sweep 用例；
  顺带发现 compact 物理遗忘按真实时间计龄，测试用 fake NOW 需防踩坑）
- 生产副本 dry-run：150→119，9 簇 31 条，抽查被并条目均为同事实复读体
- 线上实跑：POST /api/dedup 返回同 dry-run；`stats.nearDup` 归零；
  brain.log 9 行合并摘要；检查器仍显示健康语义边（「语义相似 76%」）

## Resolution（2026-11-02）

### 问题
写入判重只挡增量，库内存量 59 对 cos≥0.9 近重复待清。

### 怎么解决的
一次性合并而非提示式处理（存量复读没有决策价值，逐条确认只会打扰用户）：
sweepNearDups 并查集聚类 → mergeNotes 收编字段 → merge op 落流水可审计重放；
入口走运行中进程的 POST /api/dedup + 页面备份区按钮（含 stats.nearDup 实时计数）。

### Key Decisions
- 保留者按信息量排：长文案 > 重要度 > 命中 > 更早 createdAt（合并后强度/hits 已并入，
  保留者选择应只看内容信息量）
- 强度合并 max+min×0.5 封顶：复读次数该体现在强度里，但不该等于简单相加
- 悬垂 sourceIds 不做引用重写：图谱边按存活集过滤天然降级，重写要再引入一类 op
- 阈值与写入判重共用 dedupeEmbedCos=0.9：≥0.9 语义上即同一事实，两处口径一致

### 验证结论
90/90 测试、typecheck、build；生产副本 dry-run 150→119（9 簇 31 条，明细抽查无独信息丢失）；
线上实跑一致，nearDup 归零，合并摘要入 brain.log。副作用坑：compact 物理遗忘按真实
Date.now() 计龄，测试 fake NOW 的数据会"变老"被清——测试用例需给无关记忆一次强化保命。

### 后续优化
- 若 distill 判重继续漏（mergeIndex 命中率、0.85-0.9 灰带），可再降阈值或加"疑似重复"展示位
- merge op 已在事件流水显示，但导入导出未验证 merge op 的跨实例重放（同实例已验证）
