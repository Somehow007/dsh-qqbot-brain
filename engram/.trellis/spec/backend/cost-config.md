# 成本一线 + env 配置面

成本是设计约束不是事后指标（继承根项目 AI-WORKFLOW 成本纪律）。新增 LLM 调用/注入段/记忆字段前先过评估：输入有界、前缀缓存友好、可配置关闭、失败静默不阻塞。

## env 配置面（`src/config.ts`，全部可选，默认值即生产基线）

| env | 默认 | 说明 |
|---|---|---|
| `ENGRAM_DATA_DIR` | `./engram-data` | 数据目录（brain store + chat-log + persona.md + 日志） |
| `ENGRAM_SEED_DIR` | `../personas/firefly` | persona 包目录 |
| `USER_NICK` | `开拓者` | 发言人/actor |
| `SESSION_ID` | `main` | brain 会话 id |
| `CHAT_LLM_*` | — | chat 模型 endpoint/key/model（`CHAT_LLM_API_KEY` 缺省回落 `DEEPSEEK_API_KEY`） |
| `BRAIN_LLM_*` | — | 蒸馏/画像模型（同回落） |
| `EMBED_*` | — | embedding（`EMBED_API_KEY` 回落 `DEEPSEEK_API_KEY`） |
| `ENGRAM_HTTP_TOKEN` | 空=无鉴权 | chat API 鉴权口令（生产必设） |
| `ENGRAM_BRAIN_TOKEN` | 回落 http.token | brain admin 口令 |
| `PROACTIVE_*` | enabled=false, maxPerDay=4, quiet 23:00-08:00, minInterval=120m | 主动开口预算 |
| `TOOLS_BRAIN_SEARCH` | `0` | brain_search tool 开关 |
| `CONSOLIDATION_*`/`DIGEST_*`/`RETRIEVAL_*` | 见 config.ts | 内核行为旋钮（透传 BrainConfig） |

**双 LLM 面是有意的**：chat（回复质量/声口）与 brain（蒸馏/画像，后台批处理）可用不同模型/档位——chat 求声口、distill 求成本，配置分离不互相绑架。

## 成本模型（design.md §11 实测基线）

- reactive 每轮输入 ≈ 6–9k tok（人设+digest+记忆≤6+态度+情绪+时刻+deepRecall+history≤8k chars），输出 200–500。
- 蒸馏攒批后台跑；embedding 回填 30s 低频清扫限 5 条。
- 主动消息每条 ~2–3k tok，`maxPerDay` 封顶 + quietHours + minInterval 三重闸门（见 proactive.md）。
- **增长项要能建模**：单 session 长跑 → history/记忆检索有界截断兜底，不依赖人工清理。

## 配置纪律

- 新增旋钮先进 `EngramConfig` 接口 + `DEFAULT_CONFIG` + `loadConfig` env 解析 + `.trellis/spec` 本文件登记——四处齐了才算配置项。
- 默认值必须是「生产安全值」：贵的功能默认关（proactive、tools），危险的默认有界（maxPerDay、quietHours）。
