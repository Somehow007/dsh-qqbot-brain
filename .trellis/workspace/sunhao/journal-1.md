# Journal - sunhao (Part 1)

> AI development session journal
> Started: 2026-10-29

---



## Session 1: 态度记忆层（kind=attitude）
<!-- trellis-session: v=2 fp=7b07d0f116806cee -->

**Date**: 2026-10-30
**Task**: 态度记忆层（kind=attitude）
**Branch**: `main`

### Summary

问题：人格内核静态无自我更新→回复死板。评估 A(态度笔记)/B(自我文档)/C(内核漂移) 后落地 A：蒸馏产出「对<对象>：<立场>」attitude 记忆，双通道唤起（topK 检索 + 发言人昵称保底≤3），注入【当前立场】order 83。拆出 commit 027eb6c(发言人+情绪WIP) 与 b074657(态度层)。page.html 的 attitude UI 支持未提交，留给 brain-ui-polish 任务。

### Git Commits

| Hash | Message |
|------|---------|
| `b074657` | P3: 态度记忆层——人格内核不变，立场可被对话塑造 |

### Status

[OK] **Completed**


## Session 2: 会话画像排查 → 画像按人建模（u:openid）
<!-- trellis-session: v=2 fp=4fdf324e379c4a08 -->

**Date**: 2026-10-30
**Task**: 会话画像排查 → 画像按人建模（u:openid）
**Branch**: `main`

### Summary

问题：画像页只见 3 条、疑被截断。排查：页面无截断、持久化链路健康（写盘/compact 往返/重启恢复均验证过），根因是数据没进 ~/brain-data——qqbot-test 链接了已删除的插件副本、dataDir 相对路径按 cwd 解析、多实例共享文件时 compact 会互冲。顺带发现画像按 sessionId 存导致人的维度分裂。设计：dsh sessionKey=qqbot:{appId}:{scope}:{peerId}，sessionId 确定性派生（私聊=用户 openid，群聊=群 openid），发言人 tag 仅群聊带 openid → 画像改 u:<openid> 主键+sess: 兜底，ProfileEntry{text,name,sessions,updatedAt}，蒸馏输出结构化 profiles[]，注入按发言人 openid，attitude 唤起扩到跨会话，页面 PERSON 卡+/api/profiles。验证：40/40 测试+typecheck+build+真实数据迁移无损。后续：多实例文件锁、dataDir 启动日志、私聊 openid 归并、画像编辑入口。待办：重启 dsh 生效；旧 3 张画像保留为 sess: 卡。

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**
