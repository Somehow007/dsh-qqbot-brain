# 11-05-competition-materials-polish

## Goal

继续完善星光杯初审参赛材料：从 `.trellis` 归档择优补充亮点、隐私脱敏、
产出材料清单并走查已有材料。基于 `archive/2026-11/11-04-competition-submission-package`
已打好的包做增量优化（截止 11-05 20:00）。

## Resolution（2026-11-05）

### 遇到了什么问题

1. 说明书「实现情况与验证」只有一句话，归档里最硬的佐证（D3 试运行量化数据、
   检索评测、token 审计、成本不发散分析、记忆污染实战处置）全部没进评审主材料。
2. 包内数据自相矛盾：说明书/附录写 143 项测试，shipped README 徽章与时间线图
   仍写 123/123（实际 `node --test` 现为 143/143）。
3. 隐私面遗漏：eval cases.json 带 3 个真实会话 UUID；distill.ts 提示词示例与
   test fixture 含真实群友昵称（上一轮仅评估了「玩笑级昵称」维度）；
   附录把 `.trellis/`（已刻意排除的开发痕迹）列进了代码包说明。
4. 演示步骤缺 Node 版本门槛说明（`--experimental-strip-types` 需 ≥22.6）。

### 怎么解决的

- 说明书 docx（python-docx 原位插入）：
  - 新增 4.6「机制设计的理论原型」表——8 行实现↔理论映射
    （Generative Agents / ACT-R / Tulving / PAD / Lost in the Middle 等）；
  - 第六节扩写：试运行三维达标表（742 次蒸馏 37% 丢弃、466→111 净存、
    digest 59 次、跨群召回）+ 检索评测表（88.2%/40% → 100%/20%）
    + 成本工程段（前缀缓存两段排序、history 剥离降 60~80%、长期不发散）
    + 记忆污染实战处置段（170→124，固化为危险区功能）；
  - 创新点 +1：面向长期运行的成本工程；
  - 附录代码包说明改为实际 zip 内容；演示节补 Node ≥22.6 与免 npm install。
- 报名表 docx：作品简介末尾补一句试运行量化佐证。
- 数据统一：repo README 徽章与正文 123→143；trial-timeline.svg 改字后
  headless Chrome 重渲 PNG，同步进材料/06。
- 隐私脱敏（仅 shipped 副本，repo 不动）：eval cases.json 三个真实会话 UUID
  → uuid5 伪名（`npm run eval` 复跑仍 88.2%/40% 与文档一致）；
  distill.ts 示例昵称与 test fixture 判定为低敏（玩笑级网名）保留并留档。
- 重建：rsync 同口径刷新源码包（69 文件、无 .trellis/无痕迹/无真实数据），
  shipped README 重新做 .trellis 引用剥离；外层 zip 重打。

### 验证结论

- docx 文本回抽核对：4.6 表、两张数据表、创新点 5、附录修正全部落位；
- eval 在脱敏包内复跑通过、数值与文档一致；
- 隐私 grep（真实昵称/会话 ID/服务器 IP/NSFW 词）对两份 docx 全 clean；
- 6 张配图逐张目检：全部为虚构 demo 数据或手绘架构图，无真实信息。

### Key Decisions

- 只改 shipped 副本不脱敏 repo：repo 私有且测试依赖真实评测集；
  会话 UUID 属生产标识 → 伪名化；玩笑级昵称沿用上一轮判定保留。
- 「记忆污染处置」用中性措辞（「越界测试对话」）写入说明书——
  可管理性实战是强佐证，但 NSFW 细节一律不出现。
- AI 结对开发经历未写进材料（随 .trellis 一并排除的决定维持不变）。

### 后续优化方向 / 待用户完成

- zip 文件名「序号」占位 → 按信息汇总表实际序号重命名；
- 报名表队长/指导教师信息、手写签名（或供图插入）；
- 可选加分项：录制一段 /brain 脑图页演示视频（章程允许附件）；
- 可选：把「全程 AI 结对开发」作为创作思路的一句话卖点（需用户拍板）。

## Resolution ②（2026-11-05 下午）

### 遇到了什么问题（用户追加要求）

1. 脑图页立绘偏性感（`PERSONA_BANNER` 内嵌吊带裙立绘），要求换可爱款；
   参赛截图与说明书内嵌图同步替换。
2. 源码包要去掉 mock/概念稿类内容，只留核心+文档。
3. 走查新发现：`src/setup/whale-gentle.md` / `whale-devotion.md` 两个内置人设
   含露骨向设定（发情/性兴奋/可描述性行为/「主人 demo」直呼用户 QQ 名）——
   既不适宜评审场景，也把用户昵称绑定在敏感语境里。
4. `材料/` 下发现用户解压出的 `dsh-qqbot-brain-project/` 目录副本，
   外层打包需显式排除。

### 怎么解决的

- 立绘：`mockup-atlas-persona-chibi.png`（Q 版问号女仆装）裁去顶部文字带、
  铺白底转 JPEG（530×365）→ 替换 `page.html` 的 `PERSONA_BANNER`；
  本地起 serve-demo（4100 端口避开线上 4099）headless Chrome 重截
  1680×1050 → 新 `01-脑图总览.png`；docx 内 `word/media/image4.png`
  （总览）与 `image6.png`（时间线）原位替换。
- 源码包瘦身（69→50 文件）：删全部 `mockup-*`（10 个概念稿/立绘）、
  `demo/generate_demo_export.py`、`demo/screenshots/`、旧 `local-*.tgz`；
  demo/ 保留 serve-demo.ts + 虚构数据集（用户拍板：演示路径保留）；
  shipped demo/README 与顶层 README 同步去掉 mockup/生成器引用；
  说明书「七」「附录」同步改写。
- 人设文件脱敏（仅 shipped 副本，repo 不动）：两份 persona 去除
  发情/性兴奋/露骨许可/主人-恋人框架/「demo」直呼，保留温柔/依恋
  性格主线与边界处理（越界要求不配合）；`npm test` 包内复跑 143/143 绿
  （http.test 对 gentle 的断言是「等于文件内容」而非固定文本，不受影响）。
- 外层 zip 重建时 `-x` 排除 `材料/dsh-qqbot-brain-project/` 与 `.DS_Store`。

### 验证结论

- 新截图目检：右栏立绘已是 Q 版可爱款，speech bubble/人设标签正常；
- docx 媒体表确认 image4=新总览图、image6=新时间线；文本回抽无 mockup/生成器残留；
- 源码包 50 文件清单干净；shipped 包 `npm test` 143/143；
- 隐私复扫：露骨词/真实昵称/会话 ID/服务器 IP 在 docx 与包内源码全 clean
  （仅 test fixture 玩笑级昵称保留，前轮已判定）。

### Key Decisions

- 立绘选 chibi 而非 smile 版：smile 是 Blend-S 梗图带第三方动画元素+英文文案，
  不适宜正式材料；chibi 与既有小头像同款，风格统一。
- 人设文件「脱敏不改 repo」：repo 是私有项目真实人设，shipped 副本面向评审；
  保 id/文件名不变（whale-gentle/whale-devotion 在 index.ts 硬编码 + 测试引用），
  只净化内容，避免破坏多版本人设功能面。
- repo 的 `demo/screenshots/`（旧立绘截图）保留未动——非交付物；
  若要一并更新可重跑截图脚本。

## Resolution ③（2026-11-05 下午，用户追加）

### 问题与处理

1. **人设进一步净化**（仅 shipped 副本）：whale-gentle 去掉全部「荤梗/暧昧/撩/露骨」
   表述与解剖术语示例（健康问答换成布洛芬示例）；whale-devotion **整体改写为
   毒舌版**（`whale-sharp.md`：损行为不损人、一针见血、不记仇、偶尔自损，
   尺度硬边界），`index.ts` 播种名同步为「鲸鱼娘 · 毒舌版」，全包
   `whale-devotion→whale-sharp`、`依恋版→毒舌版` 重命名（id/文件名/测试断言一致）。
2. **eval 夹带清理**：cases.json 两条含荤段子原文的真实记忆（无任何 case 引用）
   改写为「过线玩笑」表述；复跑 recall=88.2%/noiseFP=40.0% 不变。
3. **docs/ 去留评估**：保留——`docs/brain-backup-restore.md` 被说明书「七」
   直接引用、`docs/img/*.png`+`brain-map.png` 被 shipped README 内嵌；
   仅删 `readme-image-prompts.md`（生图过程稿，非产品文档，与 generator 同类）。
4. 包内复跑 `npm test` 143/143 绿；隐私复扫 persona/eval 全 clean；
   源码包重建为 63 条目（~49 文件）。

### Key Decisions

- 改 id 而非仅改内容：index.ts 硬编码文件名+persona id，整体重命名保持
  代码自洽（测试断言 `whale-devotion`→`whale-sharp` 同步改，fixture 不受影响）。
- docs 保留判断标准：被说明书/README 引用的留，纯过程稿的删。
