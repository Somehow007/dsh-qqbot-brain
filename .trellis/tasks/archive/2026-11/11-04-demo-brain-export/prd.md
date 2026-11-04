# 11-04-demo-brain-export

## Goal

参赛材料需要一份公开安全的数据集：线上真实数据（恋人线/真人隐私）不可公开，
需要一份全虚构的 BrainExport JSON，能直接 import 展示系统全部机制。

## Requirements

- 全虚构：人物/会话/openid/内容均编造，零真实隐私
- 覆盖展示面：episodic/semantic/attitude 三类、absorbedAt+sourceIds 巩固链、
  双人设分轨、u:/sess: 画像、情绪态、digest、manual 全局记忆
- 时间/强度散布自然（约两周），能演示衰减与强化
- 可被真实 importData 干净往返；可复现再生成

## Acceptance Criteria

- [x] `demo/brain-export.demo.json` 生成并通过 `BrainStore.importData` replace 往返验证
- [x] `demo/generate_demo_export.py` 确定性生成器入库
- [x] `demo/README.md` 说明数据概况/展示点/加载方式
- [x] 根 README 仓库结构挂 demo/ 条目

## Resolution (2026-11-04)

**问题**：参赛材料需要可公开的数据展示系统机制，真实数据过于露骨私密不可用。

**怎么解决的**：手写确定性生成器（uuid5 定 id、固定时刻表）构造「动漫社学园祭」场景——
群聊筹备线（分工/砍价/迟到梗/营业额破千）+ 私聊陪伴线（线代备考/四格漫画约定），
38 条记忆（28e/6s/4a）、10 条 absorbed 带 sourceIds、3 人设（active=cozy）、
5 画像 2 digest 2 情绪 1 manual。`BrainStore.importData` replace 往返验证：
38/0 skipped、personaId 轨保留、画像/digest/情绪全入。commit 7fd31b5。

**关键决策**：手写构造而非跑真实管线——可控、能设计戏剧性（评委一眼看到
三类记忆边界/巩固链/分轨），且零隐私风险；生成器确定性输出便于复现修改。

**后续优化方向**：本机起实例灌 demo 截图脑图页做参赛配图；如需更大体量可扩生成器；
脑图 UI 加导出/导入按钮仍是可选加分项。

**什么时候干的**：2026-11-04 晚。
