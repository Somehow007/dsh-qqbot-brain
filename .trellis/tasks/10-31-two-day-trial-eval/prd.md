# 两天宿舍群试运行评估

## 背景

memory-quality-fix（蒸馏v2/检索纠偏/身份层/滚动摘要）+ 百炼 embedding + 流水瘦身已于 2026-10-31 15:37 CST 全部上线（dsh-qqbot 重启，启动行 `脉络 on / 向量 on`）。用户决定在四人宿舍群（session 17429483）跑约两天，再按日志评估效果。

## D0 基线（2026-10-31 15:37 CST，baseline/snapshot-D0.json）

- notes 44（episodic 29 / attitude 11 / semantic 4），全部来自 v1 蒸馏（流水风格）
- 向量回填完成：56 embed ops（旧数据），新格式后向量入内存+快照(base64)
- digests 0（每会话满 15 轮才出第一条）
- 评测基线：lexical recall 88.2%/FP40%；embedding 混合 recall 100%/FP20%
- 早期信号：v2 上线后已出现「蒸馏…记忆 0 条」（拌嘴轮次被丢弃，符合预期）

## 两天后评估清单

1. **蒸馏质量**：新 notes 是否以四类白名单为主（事实/偏好/承诺/关系），importance 分布是否拉开；「记忆 0 条」占比（v1 时几乎每轮 1 条）
2. **检索效果**：注入命中的相关性体感；hits/R 是否还出现虚高锁死；跨群召回有没有触发过
3. **会话脉络**：digest 是否产出、内容质量、更新节奏（15 轮/次是否合适）
4. **人格稳定**：情绪 label 与回复风格是否持续贴合
5. **成本**：蒸馏调用次数 vs 有效产出比；embedding 调用量
6. **数据健康**：jsonl 体积（embed op 清除后增速）、快照向量覆盖率、画像归并后同名合并情况
7. 跑 `npm run eval`（如需用新数据扩评测集）

## 评估方式

- ssh ubuntu@124.222.65.169 取 brain.log / brain.jsonl / brain.snapshot.json 对比 D0
- 必要的话看 dsh transcript 里注入 section 的实际形态
