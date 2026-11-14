# 情景蒸馏主体错配：讨论第三人身份被记成发言人本人

线上走查发现的蒸馏归因缺陷。起因：用户发现蒸馏产物把「被讨论的人物」的身份配给了群里的发言人。

## 线上实证（2026-11-14 排查）

**会话**：群 `8ECEE11B10A2B931116A350F37DFA550` → session `17429483-8ca6-415a-b27b-a354756810a8`（宿主原文 `~/.dsh/sessions/**/session.v4.jsonl.zstd`）。

**原文**（11-14）：

- 16:00 花咲蝶舞（五笑）发图 + 「这个人cos的很好看对不对」
- 16:02 「这人是某211研究生，职业是上海某厂程序员，28岁，」
- 16:03 「核动力兼职百万粉coser，平时上六，周末框框出片」

「这个人/这人」= 图中 coser **@琳汐汐吖o**（名字只出现在 15:59 角色回复里：「account @琳汐汐吖o」）。

**蒸馏产物**（`~/brain-data/brain.jsonl` add ops）：

- `bc091a78` episodic / world轨 / `花咲蝶舞（五笑）：是211研究生，在上海某厂做程序员，28岁`（imp 4）
- `436c508f` episodic / world轨 / `花咲蝶舞（五笑）：是兼职百万粉coser，平时上六（一周六天班/课），周末集中出片。`（imp 3）

两条都把第三方 coser 的身份写成了发言人花咲蝶舞的事实，且 actor 字段同错。world 轨对所有人设可见，已在注入池；花咲画像尚未污染（最后 profile op 早于这两条），但 consolidate/后续蒸馏有扩散风险。

## 根因（三层叠加）

1. **指代无解时默认归发言人**：`distillEveryTurns=1` 基本一轮一蒸，convo 只含当轮。16:02 轮的全部输入 = 「这人是某211研究生…(@you)」+ 角色回复（同样只用「她/这个人」无名指代）。「这人」指代对象（图中 coser）既不在文本也不在当轮窗口 → 模型按「某昵称：事实」格式把唯一可见人名（发言人）填进主语。
2. **图片内容蒸馏器永远看不到**：`[Reference attachments]` 块在 `parseSenderTag` 中被整体丢弃（只保留 `[Chat history]` 段与 `[Quoted message]` 内文）；`[引用][image: xxx.jpg]` 只剩文件名占位。发言人讨论图片人物时，蒸馏器连「这条消息附了图」都不知道（本例恰好有 `[引用][image:]` 残留，但无语义）。
3. **prompt 无兜底规则**：distill prompt 只说「content 用第三人称『某昵称：事实』」「转述他人事实 actor 写被转述者」，没有覆盖「指代对象不明/第三方（照片、视频、博主）非发言人本人」的情形，也没有「主体不明时不记或事件化表述」的出口。

## 爆炸半径排查（全量 session 扫描）

- 三个活跃 session 共扫「这人/这个人/那个人/她是/他是/图里/照片/合影/coser/本人」等指代模式：群会话 19 条命中，私聊两 session 0 命中。
- 逐条对照蒸馏产物：**确认错配仅上述 2 条**（琳汐汐吖o 身份→花咲蝶舞）。其余指代消息要么正确归因（如 11-09 demo 问「他是什么样的人」→ 正确产出 `赵子翔：好奇心重…`，当批多轮积累含上下文）、要么未产记忆（「拿不准就不记」生效）。
- 旁证：`赵子翔 = 花咲蝶舞（五笑）` 同一人（demo 11-01 明示「赵子翔就是花咲蝶舞」），因此 subject=赵子翔 的条目不是错配而是**别名分裂**——同一人的事实分散在两个名字下（另案，画像已用「赵子翔（花咲蝶舞）」合并表述）。
- 附带发现：content 主语与 actor 字段不一致的 episodic 有 ~46 条（多为 actor 指错人），actor 主要用于注入行 `[actor]` 前缀与画像归集，污染画像的风险次于 content 主语错误但需留意。

## 修复方向（待拍板）

- **P0 prompt 护栏**（distill.ts `distillPrompt`）：✅ 已落地（2026-11-14）——actor 规则后新增「归属铁律」段：事实主体须能在本轮对话（含角色回复）明确对应；「这人/TA/图里的人/博主/UP主」等指代或省略主语描述无法确定所指时不得默认归发言人；带「[附图]」「[附件]」标记的消息里「这个人」优先指附件中人物；主体不明宁可不记或写「群友/对方讨论某事：…」事件式表述（actor 写讨论发言人）。成本：prompt +~150 字/轮。
- **P1 capture 保真**（events.ts `parseSenderTag`）：✅ 已落地（2026-11-14）——`extractAttachments` 从 raw 剥出 `[Reference attachments]` 块（条目 `- Type: path`），折算标记入 text：含 Image→`[附图]`、含其他类型或不可解析→`[附件]`、混合→`[附图][附件]`；引用块内 `[image: x]`/`[video: x]` 等媒体占位（QUOTED_MEDIA_RE）剥除不再当噪声 `[引用]`；附件块不再漏进 history 伪装成 `[Chat history]`（原实现会把它包进假 Chat history 标记进 contextText，且只在当轮/500 字尾段内偶然可见）。无标签裸文本路径同样折算。线上实测格式：Image/File/Video 三类、单条最多 12 图、附件消息必带 `[Quoted message]` 媒体占位。
- **P2 指代上下文**（可选，成本需评估）：蒸馏时附最近 1-3 轮的 `[时间] 发言人：摘要` 作指代锚点（不进记忆提取，只供消解），或扩大 contextText 覆盖。注意成本一线。**暂缓**——先观察 P0+P1 效果。
- **数据修复**：2 条错配 note 删除或改写为事件化表述（如「群友讨论一位 coser（琳汐汐吖o）：211研究生、上海程序员、28岁、兼职百万粉coser」）。删除走既有 op 可重放；改写用 update op。画像暂不受影响，处理越早越好。**待授权**（生产写入）。
- **验证**：单测 ✅——parseSenderTag 5 例（附图标记/视频文件/混合/引用并存/history 共存/无标签）+ buildDistillPrompt 护栏断言；typecheck+274 tests+build 全绿。线上走查待部署后观察后续图片讨论轮的蒸馏产物。

## 相关

- 蒸馏链路：`capture/events.ts parseSenderTag` → `brain/index.ts ingest/endOfTurn`（distillEveryTurns=1）→ `brain/distill.ts buildDistillPrompt/convoLines` → store addNote。
- 同类历史问题：F5 世界轨错批（`11-13-consolidate-view-mismatch`）、sess:dbf7162a 画像混写——均已修，本案是**蒸馏归因**层的新问题。
