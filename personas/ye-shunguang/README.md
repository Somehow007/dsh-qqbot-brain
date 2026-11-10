# 叶瞬光 · 人设包（persona pack）

绝区零「叶瞬光」的陪伴型人格资产。独立于 dsh-qqbot-brain 插件——**不注册、不接线**，等 brain 通用化（脱离 dsh）后可直接复用，也可以现在就塞进一个全新实例试跑。

## 文件

| 文件 | 作用 |
| --- | --- |
| `persona.md` | 人格内核（常量层）：身份、性格演出规则、说话风格、边界、情境示例 |
| `seed-export.json` | 初始化记忆（生成产物）：BrainExport v1 格式，含 persona + 人设条目（含 `moods` 情绪词表）+ 28 条种子记忆 |
| `generate_seed.py` | 种子生成器：改完 `NOTES`/`PERSONA_MOODS` 后 `python3 generate_seed.py` 重新出 JSON |

## 用法

- **全新 brain 一键初始化**：`POST /brain/api/import?mode=replace`，body 为 `seed-export.json`。会写入人格内核、注册并激活人设 `ye-shunguang`、灌入全部种子记忆（`sessionId='manual'` 全局域，所有会话可见）。
- **加进已有实例（推荐）**：`POST /brain/api/import?mode=merge`，body 同上。幂等（已存在的 note id 跳过）；不清空现有数据、不抢占已激活人设——导入后再 `POST /api/personas/activate {"id":"ye-shunguang"}` 显式切换。迭代B 已在生产 whale 实例验证：首导 notes:28 → 复导 notes:0 skipped:28。
- **只换人格**：`persona.md` 放进 `BRAIN_DATA_DIR/persona.md`（重启语义下的权威源），或走脑图页/ persona API 写入。
- **注意**：merge 只在「人设不存在」时创建——之后改 `PERSONA_MOODS`/种子重导**不会更新**已存在的人设条目与已入库记忆；要更新 moods 用 `PATCH /api/personas`，记忆走手动 API 修。

## 设计要点

- **常量 vs 活层**：核心设定（身世、性格、演出规则）全在 `persona.md`，每轮注入、不变；种子记忆是「她的活过去」，像普通记忆一样衰减——被真相关命中才强化，没人提起的会自然淡去。这不是缺陷：想永远在场的设定请写进 persona.md，记忆负责的是「她突然想起往事」这种瞬间。
- **第一人称**：种子全部用「我」行文，注入记忆摘录时读起来是她自己的回忆，不是档案腔。
- **分轨**：全部 `personaId='ye-shunguang'`；非 attitude 种子显式 `self:true`——迭代A 三轨模型下自我轨按 `characterId`（=ye-shunguang 自身）隔离，whale 激活时她的记忆全部不可见，反之亦然；`attitude` 类同理由 kind 自带自我轨。
- **情绪词表**：`personas[0].moods` 给蒸馏配了她自己的 10 词枚举（平静/开心/害羞/心疼/坚定/寂寞/委屈/难过/想念/释然），替代全局 whale 词表——whale 的「炸毛/记仇」不进她的蒸馏 prompt。
- **attitude 格式**：`对<对象>：<立场>`，同对象立场日后会被蒸馏 merge 演化——这些只是起点，不是钉死的立场。
- **情绪快照**：episodic 条带 PAD+mood 形成时情绪，强情绪记忆初始权重更高（闪回记忆效应）。

## 资料口径

依据 2.5 主线「微光引灯时」+ 信赖事件 + 影画文案，多源比对存档见 `.trellis/tasks/11-07-ye-shunguang-persona/prd.md`。2.6+ 若补完剑的反噬与她的后续剧情，记得回来校订 `persona.md` 和种子。
