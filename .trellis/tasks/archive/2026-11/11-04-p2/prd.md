
## Resolution（2026-11-04）

**问题**：语义巩固后源 episodic 仍留检索池持续稀释 topK；attitude 同对象越攒越多（LLM mergeIndex 覆盖不全）；蒸馏 prompt 对 attitude 格式约束不够硬。

**解决**：
1. `MemoryNote.absorbedAt` + `absorb` op——consolidate 产出 semantic 后给源条打戳，assemble/existing/findNearDup/preview 四处检索入口统一排除（保留存档可查），快照+流水双持久化；
2. 「对X：」规范格式 attitude 同对象自动原位更新——LLM mergeIndex 之外的确定性兜底；存量裸「X：」人物事实条不折叠（防误伤）；
3. 蒸馏 prompt 收紧：attitude 必须「对<对象>：」格式 + 同对象只留一条。

**验证**：typecheck + 133 测试全绿（新增 3 用例：退池命中、absorb 重放持久化、同对象归并/非对格式不折叠）；build 通过；dist 已部署、dsh-qqbot 重启 active。

**Key Decisions**：吸收=喂入即消耗（与现有 consolidatedIds 语义一致）；只认「对」前缀归并——生产数据显示 attitude 实际混有「X：」式人物事实，折叠会丢信息；commit `567529f` 顺带提交了并行会话已完成的 GLOBAL_SESSION_ID 全局记忆域、actor 归集修正、脑图页 UI（已同批上线）。

**后续**：观察新巩固轮次后 episodic 退池的实际效果（检索池大小变化）；「X：」存量 attitude 的定性（事实or立场）可待下一轮数据再定是否迁移归并。
