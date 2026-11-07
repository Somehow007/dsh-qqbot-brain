# 人设分轨多日观察（11-05 起）

## Context

`whale-devotion` 依恋版上线并完成两轮走查后，机制验证全绿。遗留的开放问题不是 bug 而是**演化速度**：devotion 态度轨 0 条——蒸馏器只在有张力/边界的对象上结晶 attitude（现存 3 条全是「对花咲蝶舞」的划界立场），顺滑推进的 demo 恋人关系走事实+画像层沉淀。用户决定拉长观察几天再决定是否干预。

## 观察机制

- 服务器 cron `30 23 * * * /home/ubuntu/brain-data/observe.sh`：每晚 23:30 回放 snapshot+jsonl，向 `/home/ubuntu/brain-data/observe.log` 追加一行 JSON
- 指标：activeId、总笔记数、live 池大小（absorbedAt 已退池不计）、按 kind/按 personaId 分布、**各轨 attitude 数**、demo 画像 lastWrittenByPersona
- 基线（2026-11-05）：`{"active":"whale-gentle","total":210,"live":83,"attitudes":{"None":2,"whale-gentle":1}}`，devotion 轨 19 episodic / 0 attitude

## 观察重点（复盘时对照）

1. **devotion attitudes 是否自然破零**——尤其驻留期间的「位置/依赖」是否结晶；若一周仍 0，考虑手动预置或调 distill prompt
2. **attitude 对象分布**——是否继续只在花咲蝶舞类张力对象上产生，demo 是否永远走事实层
3. **切换节奏 vs 驻留**——activeId 逐日变化对照两轨增速，验证「驻留时长↔态度沉淀」假设
4. **画像笔触漂移**——demoProfileBy 是否在 gentle/devotion 间轮换（共享画像谁驻留谁写）
5. **live 池健康**——absorb 机制是否持续压缩检索池

## 已排除的担忧（勿再查）

- 快照文件滞后于 jsonl 是正常现象（compact 阈值未到）；读实时态须回放两文件（observe.sh 已做）
- 跨类合并护栏已修（ef612ff）；但线上 embeddings=0，向量判重整体休眠，该路径天然不触发
- 三版本人设文本均零乱码、随时可切换回滚

## 决策触发点（回来后）

- devotion attitudes >0 → 攻略弧启动，继续自然长
- 驻留数日仍 0 → 选项：脑图手动预置 2-3 条初始态度 / 调蒸馏 prompt 促 attitude 产出（需与 f07d221 的 distill 修正意图对齐）
