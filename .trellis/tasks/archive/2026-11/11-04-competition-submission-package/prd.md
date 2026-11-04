# 11-04-competition-submission-package

## Goal

按赛方最新要求整理星光杯初审提交材料：报名表 + 作品材料打包，
命名「信息汇总表序号--计算机学院--作品名称」，11-05 20:00 截止。

## Requirements

- 报名表沿用旧版内容：勾选团队参赛、原创承诺日期=填表日期、审核意见日期=2026-11-10；
  队长信息留空手签，指导教师待用户给信息
- 作品说明书（产品创作说明书）为评审主材料：需求/架构/机制/可视化/验证/复现/创新点
- 实跑截图佐证：本机独立起脑图页灌 demo 数据集截图
- 代码包不含开发痕迹（用户明确要求）：排除 .trellis/.devin/.agents/.dsh/AGENTS.md/brain-data/dotfiles
- 全部进 `参赛材料/`（gitignored）并打最终提交 zip

## Acceptance Criteria

- [x] 报名表勾团队参赛、两日期到位、创新点补三型分治+分轨+可视化
- [x] 作品说明书 docx：10 节 + 6 张配图
- [x] demo/serve-demo.ts 独立预览脚本 + 2 张实跑截图
- [x] 源码 zip 84 文件无开发痕迹无隐私（真人数据全排除）
- [x] 提交压缩包按命名规则打包（序号占位待重命名）

## Resolution (2026-11-04)

**问题**：参赛初审材料需整合报名表、说明书、佐证截图、数据与源码，
且要求不含开发痕迹、不含真实隐私数据。

**怎么解决的**：
1. python-docx 编辑报名表：☑团队参赛、原创承诺 2026-11-05、审核意见 2026-11-10，
   创新点文案升级（三型分治/人设分轨/脑图可视化）
2. `demo/serve-demo.ts`：BrainStore+Brain+BrainHttpServer 脱离 dsh 独立起页，
   启动即 import demo 数据集 → headless Chrome 截脑图全景与记忆库（含保持率/人设轨）
3. python-docx 生成说明书：10 节结构嵌 6 图（架构/时序/生命周期/脑图×2/试运行时间线）
4. 源码包 rsync 过滤：.git/.trellis/.devin/.agents/.dsh/AGENTS.md/brain-data/dotfiles 全排，
   shipped README 同步去掉 .trellis 引用；验证 eval fixture 仅玩笑级昵称内容可进包
5. `参赛材料/`（gitignore）组装：报名表+说明书+材料/{6图,demo.json,源码.zip,README}
   → 最终 zip「序号--计算机学院--大肥鱼的海马体.zip」序号占位待用户重命名

**关键决策**：.trellis 隐私面评估（nsfw 任务/真人 persona/服务器 IP/baseline）→
用户拍板整体不带开发痕迹；说明书评审导向（对应评分权重：场景30/AI深度30/完成度25/展示15）。

**待办**：序号重命名 zip；指导教师信息；队长手写签名（打印签或供图插入）。

**什么时候干的**：2026-11-04 晚。
