# 线上情绪只有开心/平静的走查与评估

## 背景

用户反馈：线上跑下来情绪只有「开心」与「平静」两个桶有记录，害羞/兴奋/委屈/炸毛等从未触发；一些本该是强情绪的场景也落在「平静」。上一轮已修：脑图 graph 不再硬编码中性值、情绪重启恢复、蒸馏 prompt 带当前情绪并允许省略、label 要求贴合人设。本任务针对「仍然只有开心/平静」做端到端走查。

## 走查结论（双层根因）

### 显示层：脑图 PAD→固定 5 桶，label 不参与（主因）

`page.html` `emotionBucket()` 只用 v/a 数值分桶，分进固定 5 类：开心/平静/好奇/委屈/炸毛。

- v≥0.25：a≥0.5→开心，否则→平静
- v≤-0.25：a≥0.5→炸毛，否则→委屈
- |v|<0.25：a≥0.5→好奇，否则→平静

盲区：
- 「害羞」「兴奋」「记仇」根本不在 5 桶里；害羞=正效价+中低唤醒→必然落平静/开心
- 好奇桶要 |v|<0.25 且 a≥0.5，temp0 的 DeepSeek 几乎不吐这种组合
- 委屈/炸毛要 v≤-0.25；傲娇人设被逗被夸时模型判正效价，负半区不可达
- 结论：5 桶中实际可达只有开心（v高a高）与平静（其余正/中性组合）

### 生成层：蒸馏判定保守

- temperature=0 + 「无明显变化就省略 emotion」→ 大量轮次判「未变」，旧状态黏住
- 「明显变化」无判定锚点（没说什么刺激该对应什么情绪）
- 判定证据主要来自角色自己的回复文本；回复是在【情绪态】平静注入下生成 → 平淡回复 → 判平静，冷启动负反馈环
- apply() 是绝对覆盖，LLM 给温和值（v≈0.4 a≈0.4）→ 落平静桶
- max_tokens 700 截断时尾部字段（emotion 之后）丢失风险存在但非主因

### 捕获层（次要）

只有「用户消息+机器人回复」配对的轮次进蒸馏（events.ts turn/end）；群里未被回复的挑逗/夸奖消息不产生情绪更新。多条用户消息间只保留最后一条进 pendingUser。

## 证据

- 本地 brain.jsonl 唯一 emotion op label=「嘴硬嫌弃但尾巴偷偷晃」——人设化 label 机制本身能出活，问题在数值分桶与判定保守
- 线上数据在服务器（ubuntu@124.222.65.169），本机无法直接取证 ops 分布

## 修复方向（评估）

1. 蒸馏 emotion 增加受控 mood 枚举（平静/开心/兴奋/害羞/好奇/委屈/炸毛/记仇/难过），自由 label 保留给注入；脑图按 mood 上色、无 mood 回退 v/a 推断（兼容旧数据）
2. 蒸馏 prompt 给刺激→情绪锚点（被夸/被撩→害羞；被挑衅→炸毛/记仇；被冷落→委屈；段子→开心；八卦→好奇），并明确傲娇时按内心真实感受给效价
3. 判定对象改为「这轮对话对角色的情绪刺激」，弱化从回复语气反推，打破平静→平淡→平静循环
4. 或退一步：扩充/重定义桶并在 bucket 映射时纳入 label 关键词

## 状态

走查完成，待用户确认修复方案。

## 实施与评估结果（2026-11-02）

### 已实施

- types.ts：`MOODS` 受控枚举（平静/开心/兴奋/害羞/好奇/委屈/炸毛/记仇/难过），EmotionState/NoteEmotion/DistillResult 加可选 `mood`
- distill.ts：prompt 增加 mood 字段 + 刺激→情绪锚点表 + "判定用户刺激而非回复语气"；parse 白名单校验
- emotion.ts：apply 存 mood，>1 天衰减时 mood 随 label 复位平静
- index.ts/store.ts：stamp、sanitizeNoteEmotion、sanitizeEmotion 全链路透传
- page.html：EMO_BUCKETS 扩为 9 桶，emotionBucket mood 优先 + v/a 兜底，ops/详情文案更新
- spec：backend/index.md + frontend/quality-guidelines.md 记录 MOODS↔桶表同名约定

### 线上数据取证（124.222.65.169 brain.jsonl/brain.log）

- 16 条 emotion op，label 全部人设化且丰富（「被叫姐姐后害羞又偷偷开心」「嘴硬但心里美滋滋」等）——**生成端本来就活跃**
- 旧 5 桶映射下：14/16 → 平静，2/16 → 开心。害羞类 label 的 v≈0.5-0.7、a≈0.2-0.5 全部被吃进平静桶，实证诊断

### 真实模型回放验证（服务器上跑 deepseek-chat 实测 7 场景）

被撩→害羞 / 被夸→害羞 / 挑衅→炸毛 / 冷落→委屈 / 八卦→好奇 / 寒暄→平静 / 晚安关心→害羞。
7/7 mood 为合法枚举、finish_reason=stop 无截断。旧映射下同组场景只会出 开心×2/平静×2/炸毛×1/委屈×1。

### 验证

typecheck + 92 tests + build 全过；9 节点槽位经 layoutSlots 复算确认现有情绪区放得下。

### 待办

- 部署到服务器并重启 dsh-qqbot；之后聊几轮看 /brain 情绪桶分布是否拉开
- 旧 emotion op 无 mood，页面仍按 v/a 兜底显示（符合预期，不回填）

### 部署记录（2026-11-02 11:14 CST）

- 备份：`~/backups/brain-dist-before-mood-20261102T1114.tgz`
- 全量 dist 同步 → `sudo systemctl restart dsh-qqbot`，active(running) PID 1493023
- 启动行 `蒸馏 on / 向量 on` 正常；`/brain/api/state`、`/brain/` 均 200
- distill.js / emotion.js / page.html 远端 SHA256 与本地一致
- 待观察：后续几轮对话的 /brain 情绪桶分布与 ops 中 mood 字段

### 部署后插曲（2026-11-02）

- 现象：用户聊出「害羞」op 后脑图仍不显示害羞。排查：/api/state 已正确返回 mood=害羞、ops 带 mood，链路正常；页面响应无 Cache-Control，用户标签页运行的是部署前旧 JS（旧版仅 5 桶、无害羞节点）。
- 修复：http.ts 页面与 JSON API 响应统一加 `Cache-Control: no-cache`，已随 dist 再次部署并验证响应头生效。
- 认知更新：数据是每轮蒸馏即写（非攒批），页面 15s 轮询；显示滞后的唯一来源是旧页面/缓存。
