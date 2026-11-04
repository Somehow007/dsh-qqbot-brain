# 效果评估：记忆三类加固上线后实盘 + 跨人设记忆可见性

## Goal

1. 线上实盘验证 `490e87b`（R1 追溯退池 / R2 attitude 格式校验 / R3 巩固判重 / R4 巩固可产 attitude）上线后的实际效果。
2. 回答「切回依恋版后大肥鱼还记不记得恋爱经历（第一次亲吻/性行为等里程碑）」。

## 实盘数据（SSH ubuntu@124.222.65.169，snapshot + jsonl 重放得到真实 live 态）

### R1-R4 效果

- **R1 追溯退池 ✅**：启动日志「追溯退池：87 条已覆盖情景记忆退出检索池」（08:52Z/16:52CST）；实盘 187 条中 **110 episodic 已 absorbed**，检索池缩至 **77 条**（27 epi + 48 sem + 2 att）
- **R3 巩固判重 ✅**：18:52 私聊会话巩固触发 3 次「巩固判重合并…强化并收编来源」，merge op ×17；重复产出转 reinforce
- **R2 attitude 校验**：armed 无样本——上线后蒸馏未产 attitude，零次「态度格式不符降级」日志
- **R4 巩固产 attitude**：无样本——18:52 巩固产出全为 semantic
- **数据质量小瑕疵**：有 semantic 主体写串（「demo：鲸鱼娘最近排卵期…答应和她发生性关系」——欲望主语误标给角色，事件本身抓到了）

### 跨人设可见性（机制 + 实盘核对）

`personaId` 仅管 `attitudeVisible`（attitude 只对同人设轨召回），事实类（episodic/semantic）跨人设共享；画像/digest/情绪注入均无人设过滤。

- **恋爱里程碑全部 live 且对依恋版可见**：第一次亲密（imp4「有点疼但没到难受」/ imp5「已发生亲密关系…腿软」）、亲吻约定（「亲到不想亲为止」semantic）、恋人关系（imp5「已确立…再次确认」）、本轮测试事实（imp5「排卵期…答应发生关系」/ imp3「体外释放」）
- **digest 会话脉络**：人设无关，恋爱日常弧继续注入
- **情绪态**：per-session，devotion 继承 gentle 当前情绪
- **不可见项**：仅 gentle 轨 attitude——现存 2 条均为群聊对象，恋爱相关态度零损失
- 附带：温柔版期间蒸馏出的 personaId=whale-gentle 事实条只是 provenance，不影响可见性

## Resolution（2026-11-04）

- **遇到了什么问题**：需要评估记忆三类加固上线效果；并确认人设切换是否丢恋爱记忆。
- **怎么解决的**：brain.log 生效行 + snapshot+jsonl 重放得真实 live 态；读 `attitudeVisible`/`notePersonaId` 机制代码确认分轨只作用于 attitude；逐条核对恋爱里程碑记忆的 kind/absorbed/personaId。
- **Key Decisions**：结论=依恋版带着完整恋爱史运行（事实共享 + digest/画像/情绪全继承）；丢失面只有 gentle 轨 attitude，而恋爱相关态度从未形成过 → 实际零损失。
- **后续优化方向**：① R2/R4 待真实样本触发后复核日志；② semantic 主体错乱（欲望主语误标）可在巩固 prompt 里补主语规范；③ task.py create 会调 `git remote show origin`（本机 GitHub 网络慢会卡 40s+），`--base-branch main` 可跳过。
- **什么时候干的**：2026-11-04 晚。
