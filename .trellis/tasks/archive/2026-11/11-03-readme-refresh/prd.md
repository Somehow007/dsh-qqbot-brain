# README 增量更新：D3 复盘 + 生图提示词

## Goal

按 11-02/11-03 两天的密集迭代更新根 README，并产出可直接喂给 ChatGPT 的配图生图提示词，待用户拿回图片后替换进 README。

## Requirements

- 新进展全部落进 README：D3 试运行复盘、token 审计两段式注入（80/81 + 10300+）、mood 九桶与情绪增强、时间感知、画像管理面/危险区、记忆清洗实战、公网直连、webserver-shim 分支实测
- 内容更丰富更吸引人：D3 三维结论表格化、成本透明、实战检验故事
- 生图提示词成文 `docs/readme-image-prompts.md`，每张图标明 README 槽位（IMG-SLOT 注释）
- 数据必须可溯源到 tasks 留痕或源码

## Resolution（2026-11-03）

- **遇到了什么问题**：README（11-02 版）已滞后——两天内落了 ~55 个提交（复盘评估、token 优化、情绪系统、管理面、公网、清洗实战、shim 分支）。
- **怎么解决的**：通读新增归档 PRD（two-day-trial-eval D3、llm-token-audit、emotion-bucket-coverage、brain-public-access、cloud-memory-purge、nsfw-message-drop、brain-link-issues、admin-followups）+ journal session 26-45 + feat/webserver-shim 分支 PRD，重写 README：理论表加情绪增强与两段排序两行；读写路径图改 7 section 两段式并解释前缀缓存原因；实测效果改为 D3 三维结论表 + eval + 成本 + 清洗实战故事 + 更新后诚实清单；当前阶段改为复盘完成 + 10 项已落地 + shim 待合入；新增 5 条生图提示词与 5 个 IMG-SLOT 占位注释。
- **后续优化方向**：用户拿图后替换 IMG-SLOT；shim 合入/管理面加固后同步当前阶段；DeepSeek usage 实测成本数据回来后可补进成本段。
- **什么时候干的**：2026-11-03。

### Key Decisions

- 注入图改为「稳定段 + 易变段」两段式并点明前缀缓存动机——这是本轮最有信息量的架构变化
- 边界测试污染写成「实战检验」正面呈现：可观测+可管理设计在真事故里走通，措辞从简不展开内容
- 生图提示词统一深色科技风（#0B1B33 + cyan），与鲸脑皮层头图一致；中文标签长度限制写明，防 GPT 渲染错字
- webserver-shim 标「待合入」而非完成——分支实测已通（send_meme→send_file 真实投递），但未合 main 未上线

### 验证结论

- section order 按 inject/prompt.ts 核对：80/81 + 10300/10310/10320/10330/10340
- D3 数据按 10-31-two-day-trial-eval 归档版核对：742 次蒸馏 37% 丢弃、466→111、importance 2:35/3:47/4:18/5:11、digest 59 次、1.2M tok/天 ~¥90/月
- 清洗数据按 11-03-cloud-memory-purge：170→124（46 删）、4 误伤救回
