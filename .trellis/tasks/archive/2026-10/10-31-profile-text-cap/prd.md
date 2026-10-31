# 画像文本上限

## Goal

防止单条画像随修订式重写无限膨胀。

## 遇到了什么问题

用户问「单个画像是否有上限、会不会无限膨胀」。排查：存储层对画像文本**无任何截断**（notes 有 200 字 cap，profiles 没有）；「在旧画像上修订：保留要点、融入新信息」的 prompt 鼓励 LLM 每轮留住旧内容再往上加 → 单调膨胀倾向。唯一隐含天花板是蒸馏 max_tokens=700（同时挤占 memories 产出空间）。注入侧仅 mergedUserProfile 归并时切 400 字，单条画像无截断。

## 怎么解决的

双保险（commit `36a3586`）：
- **硬上限**：`store.ts` 新增 `PROFILE_TEXT_CAP=500`，在 `apply()` 的 profile 分支统一 `text.trim().slice(0,500)`——写入/JSONL 重放/备份导入全覆盖。
- **软约束**：`distill.ts` 主蒸馏 prompt 的 profiles 规则补「每条 text 控制在 300 字以内：聊得越久越要压缩过时细节与已被取代的判断，画像求精不求长」。

## 验证

61/61 测试（含新增截断用例）、typecheck、build 通过；dist 已 rsync 至云服务器并重启 dsh-qqbot.service 生效。

## 什么时候干的

2026-10-31，诊断→实现→部署→提交单会话完成。

## 后续优化方向

- 归并注入 mergedUserProfile 已限 400 字；若画像仍偏长可调 PROFILE_TEXT_CAP（一处常量）。
- 画像内容边界（「什么该进画像」）是另一个问题，见 10-31-profile-scope 任务。
