# CHANGES — engram 事件流（跨会话广播位）

> 用法同根项目：`python3 scripts/changes.py add "<事件>" "<指针>"`（cwd=engram/，写本文件，超 100 条自动滚动到 CHANGES-archive.md）。
> **读法分级**：新会话/不确定活跃时点→全文读；恢复会话→从最后活跃时点增量补。指针必填，细节在任务档案/journal。
> 本文件只管 engram；brain 内核与根项目事件仍看根 `.trellis/CHANGES.md`。

- 2026-11-19 17:00 | engram 项目立项：brain 第二 deployment 壳层骨架+Trellis 治理建齐（spec/backend 七篇+acceptance+dev-plan+deploy），21 tests 绿，本地冒烟通过未部署 | → .trellis/tasks 见根仓 11-19-engram-bootstrap（已归档）；engram/docs/dev-plan.md
- 2026-11-20 09:28 | MVP 走查：F1 /brain 反代鉴权顺序修复（公网裸奔管理端，部署阻断级）+quietHours h23/temperature 边界修复+spec/deploy/MAP 对齐；acceptance.md 定制 E01-E08+Slice 门槛 | → .trellis/tasks/11-20-mvp-review-acceptance
- 2026-11-20 15:02 | slice1 执行：persona.md 群聊→私聊双语境改写+seed 重出；生产部署 engram.service 上线（chat :4100/brain :4101，向量+蒸馏 on，种子+28 自举）；E01/E04/E06/E07 生产实证通过，E02/E08 观察中（dogfooding≥1周）；公网 4100 待安全组放行，现走 SSH tunnel | → .trellis/tasks/11-20-slice1-mvp-execution + .trellis/acceptance.md
- 2026-11-20 16:04 | E03 失败轮半项实证通过：CHAT_LLM_API_KEY=invalid 注入→degraded:true+流萤腔降级、history 只进 user 无 assistant Turn、notes 31→31 零污染、log 留痕；proactive 半项待 slice2。同日 dogfooding 9 轮 usage 4.3-5.0k；公网 4100 待 SG 放行（0.0.0.0 已监听） | → .trellis/acceptance.md ACC-E03
