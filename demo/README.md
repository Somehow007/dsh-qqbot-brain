# 虚构演示数据集

`demo/` 下两个 `BrainExport` 备份文件，均为全虚构数据，用于公开演示与 UI 开发。
人物、会话、openid 均为编造，内容公开安全，不含任何真实数据。

## 两套数据集

| 文件 | 规模 | 适用场景 |
|---|---|---|
| `brain-export.demo.json` | **大集**：~380 条记忆、4 个人设（whale 系×2 + 叶瞬光 + 流萤）、6 条会话 | UI 重构开发、皮肤走查、管理端分页/筛选压测 |
| `brain-export.demo.small.json` | **小集**：原 38 条校园数据、3 个人设、2 条会话 | 快速冒烟、旧截图基线对比 |

### 大集内容结构

- **人设**：`whale-gentle`/`whale-devotion`（characterId=`whale`，同一角色两版）、
  `ye-shunguang`、`firefly`——覆盖「同角色多版本 vs 独立角色」的分轨口径；
  active = `firefly`，ye/firefly 带各自 10 词情绪表。
- **会话**：夜航茶话会主群（战队/电影夜/新番/阿棠生日等 9 条事件弧）、
  数码发烧友群（硬件向轻弧）、4 条私聊 + 1 条私域 inner-circle。
- **记忆分布**：~260 episodic / ~75 semantic / ~42 attitude；
  自我轨（self/attitude）按人设隔离，世界轨跨角色共享；
  `sourceIds` → derived 边、`absorbedAt` → 已吸收存档、`emotion` PAD+mood、
  全部带 64 维合成 embedding（簇内余弦 0.65–0.88，跨簇 <0.5，无近重复）。
- **衰减光谱**：fading（retention<0.2）约两成，含「深 fading」与「临界将隐没」
  两档；semantic/attitude 核心事实保持高唤起率不衰减。
- **画像/情绪/意图**：8 份用户画像 + 6 份会话画像、6 份会话情绪态、
  6 条 digest、3 条 standing intents、`sessionDomains` 私域标记。

### 小集（原版，保留作基线）

- 38 条记忆：28 episodic / 6 semantic / 4 attitude，10 条已吸收
- 3 个人设：legacy / 晴天·明快版 / 雨天·慵懒版（active = cozy）
- 2 条会话：动漫社群（学园祭筹备线）+ 林小满私聊（备考陪伴线）
- 5 份画像、2 条 digest、2 份情绪态、1 条 `manual` 全局记忆
- 展示点：`g-s01/s02/s03` 的 `sourceIds` → derived 边；人设分轨只切
  attitude、事实共享；群聊/私聊/manual 三层作用域；画像 `u:`/`sess:` 分层

## 加载方式

独立预览（无需 dsh，临时数据目录，每次启动新鲜状态）：

```bash
node --experimental-strip-types demo/serve-demo.ts            # 大集 → http://127.0.0.1:4099/brain
node --experimental-strip-types demo/serve-demo.ts --small    # 小集
node --experimental-strip-types demo/serve-demo.ts path/to.json  # 任意导出文件
```

或灌入任意运行实例：

```bash
curl -X POST "http://<host>:4099/brain/api/import?mode=replace" \
  -H "Content-Type: application/json" --data-binary @brain-export.demo.json
```

`replace` 会清空目标大脑现有数据（先导出真实数据备份）。恢复/迁移细节见
[docs/brain-backup-restore.md](../docs/brain-backup-restore.md)。

`screenshots/` 为灌入 demo 数据后的脑图实跑截图。

## 再生成

```bash
python3 generate_demo_export.py          # 重写大集 brain-export.demo.json
python3 generate_demo_export.py --small  # 重写小集 brain-export.demo.small.json
```

生成器为纯 Python 标准库、无 LLM 调用、无第三方依赖；内容/id 全确定性
（固定随机种子 + uuid5），时间戳相对当前时间生成——每次重跑数据始终
「新鲜」，适合演示时间轴/衰减等相对时间 UI。人设文本直接读取仓库内
`personas/` 与 `src/setup/` 的真实文件。
