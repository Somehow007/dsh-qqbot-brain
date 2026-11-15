# eval lexical 基线四FAIL定性：修 or 豁免（ACC-08）

## 背景

`.trellis/acceptance.md` ACC-08：`npm run eval` lexical 路径 q08/q15 召回漏中 + n01/n03 噪声误中，连续多次走查基线 FAIL，需定性「修 or 正式豁免」。

## 诊断结论（2026-11-15）

**根因分层**：

1. **lexical 路径（char 1-3gram TF-IDF，无 embedding key 时的回退）**
   - q08「他老叫你什么外号」→ 傻福 note 会话域 rel=0.0254 < minCosine 0.04：query 与 note 表面 n-gram 几乎不相交（外号↔傻福 语义相关但字面无交集）——char-ngram 固有盲区
   - q15「我上次夸过你什么」→ 嘴甜哥 note rel=0.0174，同上
   - n01「量子力学好难」→ 吃肚子 note rel=0.0517：仅共享单字「子」，小会话池 IDF 放大后过 0.04 门槛
   - n03「比特币现在什么价」→ 货品 note rel=0.0530：共享高频 bigram「什么」+「在」
   - 同病例中弱噪声（rel 0.040-0.047）与真目标（0.017-0.025）分数带重叠，**无阈值可分**

2. **embedding 路径（生产实际配置：dashscope text-embedding-v3，embedMinCos=0.47）**
   - 用生产 key 实测：**recall=100%，noiseFP=20%**——q08/q15/n01/n03 全部修复
   - 新暴露 n02「微积分作业写不完了」→ 6 条噪声注入（emb rel 0.46-0.56）：注入条目是「学校生活抱怨/互怼」主题簇，embedding 视角确实话题相邻——**话题相似≠情景相关**的模型固有局限
   - n02 噪声带（0.46-0.56）与 q08/q15 真目标（0.48-0.49）完全重叠，**embedMinCos 无可分点**

3. **混合门原型失败**：尝试「emb≥0.60 直通 / emb≥0.47 需公共字符锚」——中文单字稀疏度下锚定失效（q08/q15 真目标仅 1 公共字被误杀，n02 仍漏 1 条）。字符级锚对中文不可靠。

## 结论

- lexical 4 FAIL = char-ngram 固有局限，生产 embedding 路径已全部覆盖；lexical 仅是 embed API 故障时的降级回退
- embedding n02 = 话题相邻注入，companion 语境下「用户抱怨作业→注入同域生活记忆」边际有用而非有害；eval expectNone 口径偏严
- **无干净修复路径**：调阈值必然牺牲 recall；22 例小样本上继续调参=过拟合

## 待用户拍板

- [x] **A. 正式豁免（2026-11-15 用户拍板：「豁免，但是留痕，这是一个问题，后面再说」）**
  - acceptance ACC-08 → 已通过（豁免），实测数字与遗留问题记入第三节索引
  - spec/backend/index.md 补 eval 两路径口径说明
  - **留痕待议**：话题相似≠情景相关的分离（n02 型话题相邻注入）/ embedding 模型选型——属后续迭代级，本档案即复盘入口

## Resolution（2026-11-15）

### 遇到了什么问题

ACC-08：eval lexical 路径 q08/q15 召回漏中 + n01/n03 噪声误中，连续走查基线 FAIL，需定性修 or 豁免。

### 怎么解决的

逐层诊断：会话域 rel 实测——真目标 q08=0.0254/q15=0.0174 低于 minCosine 0.04（外号↔傻福、夸过↔嘴甜哥字面无交集）；噪声 n01=0.0517/n03=0.0530 由单字「子」/高频 bigram「什么」IDF 放大过阈。分数带重叠无阈值可分。用生产 embedding 配置（dashscope text-embedding-v3 + embedMinCos=0.47）实测：recall=100%/noiseFP=20%，lexical 四例全修，新暴露 n02 话题相邻注入（0.46-0.56 与真目标 0.48-0.49 重叠）。混合门原型（emb 强直通+弱需字符锚）因中文单字稀疏失效。**结论：无干净修复路径**。

### Key Decisions

- 用户拍板**豁免但留痕**：「这是一个问题，后面再说」——acceptance ACC-08 记已通过（豁免），遗留「话题相似≠情景相关」分离信号/模型选型为后续迭代级，本档案为复盘入口。
- eval 使用纪律写进 spec：无 key 跑 lexical 的 4 FAIL 是预期基线；emb 段缺 key 静默退化勿误判。

### 验证

- 生产 key 实测 embedding 路径全量 eval（recall/noiseFP 数字如上）；lexical 基线数字多次走查一致。
- 文档：acceptance.md（ACC-08 移第三节+留痕）、spec/backend/index.md（eval 两路径口径）、CHANGES.md 广播。

### 什么时候干的

2026-11-15 走查会话内完成诊断→实测→拍板→留痕全流程。
