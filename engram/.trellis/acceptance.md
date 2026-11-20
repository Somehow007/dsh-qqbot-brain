# 验收登记处（Acceptance Registry）— engram

> 实证验收项的唯一台账。规则同根项目 `.trellis/acceptance.md`：部署 ≠ 验收；登记 ≠ 通过；状态机 `待触发→观察中→已通过/打回`。
> engram 独立治理：本表只管 engram 项；brain 内核侧验收仍归根台账。
>
> MVP 验收集（2026-11-20 走查定制）：Slice1 实证项 ACC-E01~E04 + E06~E08；Slice2 实证项 ACC-E05。
> 代码级验证（typecheck/test/冒烟）随提交关闭，不在此表。

## 一、待验收实证项

| ID | 验收项 | 来源 | 验证方法 | 证据阈值 | 触发 | 状态 | 最近走查 |
|---|---|---|---|---|---|---|---|
| ACC-E01 | 首次部署自举 + 鉴权边界：种子幂等导入 + persona.md 落盘 + 双服务起活；**/api/* 与 /brain/* 无凭证均拒** | dev-plan Slice1 + 11-20 走查 F1 | `journalctl -u engram` 看「种子导入 +N / persona.md 自举 / 已启动」；`curl /api/config` 401→token→200；`curl /api/history` 同口径；**`curl /brain/` 无 cookie/token → 401（反代在 authed 之后的实证）**；登录后 `/brain/` 200 三皮肤可渲染 | 事件：部署完成 ×1 | 事件 | **已通过** | 2026-11-20 生产实证：种子+28/persona.md自举/双服务起活；/api/config 与 /api/history 无凭证 401→token 200；/brain/ 无凭证 401、带 token 200（F1 修复生效） |
| ACC-E02 | 真实对话声口+记忆命中：私聊若干轮后，assemble 注入的记忆/态度与回复匹配度人工判读 | dev-plan Slice1 | `/api/history` 拉对话；`/brain/` 脑图看新笔记蒸馏归属（personaId=firefly、session 关联）；usage token 数合理（6–9k 输入档） | 样本：≥5 轮真实对话 | 样本 | 观察中 | 2026-11-20：生产 9 轮 assistant（冒烟 ~6 + 用户 dogfood ~3，hits 稳定在 6，蒸馏产出 actor=开拓者 sessionId=main）；待用户人工判读声口质量 |
| ACC-E03 | 记忆不污染：LLM 失败轮不产生 brain 笔记；proactive 消息（slice2）不产生 user 归属事实 | chat-loop/proactive spec | 构造 LLM 失败（断 key/超时）发消息 → `/brain` 导出查该时段笔记数不增；via:'agent' 轮次蒸馏产出=0 | 事件：×1 失败轮 + ×1 proactive 轮 | 事件 | 观察中 | 2026-11-20 **失败轮半项通过**：追加 `CHAT_LLM_API_KEY=invalid` 注入失败（BRAIN_LLM/EMBED 保持正常）→ `/api/chat` 返回 `degraded:true`+流萤腔降级文案、history 16→17 只进 user 条无 assistant Turn、导出 notes 31→31 零新增、engram.log 记「chat LLM 失败/空回复」；恢复后正常轮 verified（usage 5034/hits 6）。**proactive 半项待 slice2 开启** |
| ACC-E04 | 重启持久化：chat-log/proactive-state/brain store 重启不丢；种子重复 importData 不重复（uuid5 幂等） | brain-integration spec | `systemctl restart engram` 前后对比 `/api/history` 条数、`~/engram-data/` 文件、brain 导出笔记数 | 事件：×1 重启 | 事件 | **已通过** | 2026-11-20：restart×3——chat-log/brain.jsonl 保留、导出笔记数稳定 29、种子「+0 跳过 28」幂等、persona.md 人格内核生效 |
| ACC-E05 | 主动开口质量（slice2）：中档预算下开口时机自然、被回复率可接受、「别发」率低；**预算闸门实证：quietHours/maxPerDay 超限不发送、log 可见、intent 进 deferred 不丢**（=implement V8/V9） | dev-plan Slice2 + proactive spec | `proactive-state.json` dayCount/deferred；chat-log proactive 条目 vs 后续 user 回复间隔；构造/等待静默窗与超限场景核对不发送记录；每周人工走查 | 样本：≥10 条 proactive 消息或 2 周；事件：×1 超限不发实证 | 样本+事件 | 待触发 | — |
| ACC-E06 | 数据隔离：engram-data 与 brain-data（dsh 侧）互不串——engram 会话笔记不出现在 dsh `/brain`（:4099），dsh 群聊记忆不进 engram `/brain` | deployment spec「两 deployment 隔离是有意的」 | 双侧 `/brain/api/export` 各拉一份：engram 导出 sessionId 集合应只有 `main`（+manual 种子），dsh 导出应无 `main`；抽查 engram 笔记 actor=开拓者、无群友 openid | 事件：部署后首次导出对比 ×1 | 事件 | **已通过** | 2026-11-20：engram 导出 sessions={main,manual} actors={开拓者} notes=29；dsh :4099 导出 8 sessions 无 `main`——双向隔离成立 |
| ACC-E07 | persona 双侧生效（=implement V1-V3）：fresh dataDir 首启 → 种子 +28 + activeId=firefly + persona.md 自举落盘；二次启动幂等不重复；**persona.md 编辑 → 重启 → /brain 人格卡文本与 assemble 注入 persona 同步更新**（setPersona 路径实证，非仅文件落盘） | persona.ts / brain-integration spec | 首启日志「种子导入 +28 / persona.md 自举」；二次启动 ops 无重复 add；编辑 dataDir/persona.md 一处标记词→restart→`/brain/api/state` 或导出 personas[] 文本含标记词 | 事件：×1 首启 + ×1 编辑重启 | 事件 | **已通过** | 2026-11-20：首启 +28/persona.md 自举/activeId=firefly；restart 幂等「跳过 28」；标记词注入 persona.md→restart→导出 personas[0].text 含标记（setPersona 同步实证），已还原 |
| ACC-E08 | 成本基线：部署后真实使用的每轮 token 与 LLM 调用数落在模型带内，无注入膨胀回归 | design §10 成本模型（~6-9k in / 200-500 out） | `/api/history` assistant 条目 usage.totalTokens 分布统计（≥20 样本）；`/brain` ops 流水数蒸馏调用频率；对照 history.maxChars=8000 上限 | 样本：部署后 ≥7 天且 ≥20 轮；阈值：totalTokens 中位 ≤15k（模型 ~9.5k+余量），单轮 >30k 记异常 | 样本 | 观察中 | 2026-11-20：生产首日 9 轮 usage 样本 totalTokens 4342-5034，均值 ~4.7k、中位 ~4.8k，零超 15k（history 尚浅注入膨胀未显现）；待 ≥20 样本/≥7 天 |

## 二、持续观察项（不闭环，每次走查顺手记）

| 项 | 观察点 | 最近记录 |
|---|---|---|
| 单轮成本 | `/api/chat` usage.totalTokens 分布；日累计 vs 预算模型（6–9k in / 200–500 out）——ACC-E08 达标前的日常粒度 | 2026-11-20 部署首日：9 样本 4.3-5.0k/轮，均值 ~4.7k |
| history/记忆增长 | chat-log.jsonl 体积、memoryLines 注入条数长期趋势 | 2026-11-20：notes=29（28 种子+1 蒸馏），chat-log 6 轮 |
| persona.md 生效 | `/brain` 人格卡文本 = dataDir/persona.md；声口抽查像流萤——ACC-E07 通过后转为抽查 | 2026-11-20：E07 已通过（标记词同步实证）；声口冒烟 6 轮合格 |
| SSE 推送 | proactive 发送时在线客户端即时收到（无刷新） | 未部署 |
| persona 包漂移 | `personas/firefly/persona.md` 改动后 `seed-export.json` 是否已重跑 `generate_seed.py`（部署 checklist 已加；走查时抽查两文件生成时序） | 未部署 |
| tool loop 边界 | TOOLS_BRAIN_SEARCH 开启后：模型连用 2 轮 tool 仍要第 3 次时可能拿到空 content 走降级文案（已知边界 F5，默认关影响小） | 未部署 |

## 三、已通过项

- 本地冒烟（2026-11-19）：种子 +28 记忆导入、persona.md 自举、chat :4100 鉴权 401/200、brain :4101 反代 200、SIGTERM 优雅停机——**代码级验证，非生产实证**。
- ACC-E01 部署自举+鉴权边界（2026-11-20 生产）：种子+28/persona.md自举/双服务起活；/api/* 与 /brain/* 无凭证 401、带 token 200。
- ACC-E04 重启持久化（2026-11-20）：restart×3，chat-log/brain store 不丢、种子幂等「跳过 28」、persona.md 人格内核生效。
- ACC-E06 数据隔离（2026-11-20）：engram 导出 sessions={main,manual}/actor=开拓者；dsh :4099 导出无 `main`——双向隔离。
- ACC-E07 persona 双侧生效（2026-11-20）：首启+28/activeId=firefly/persona.md 自举；restart 幂等；标记词注入→restart→人设卡同步（setPersona 路径实证）。

## 四、走查协议

1. **开工**：先按 CHANGES.md 读法补课；本次若是「走查」，以本表为清单逐项跑验证方法，更新「最近走查/走查结论/状态」。
2. **单次走查只记情况**：样本不够写「观察中 + 已见现象」，不改通过；证据达阈值才改「已通过」并在备注指向证据。
3. **新条目登记时机**：任务 prd「验收标准」分两层——代码验收（test/eval，提交即关）与实证验收（生产数据，部署时登记本表）；归档任务前检查本表无遗漏。
4. **广播**：走查有结论性变化（通过/打回/新发现问题）才在 CHANGES.md 追加一行；例行「仍观察中」不必广播。
5. **关闭**：实证项「已通过」后移入第三节档案索引一行，ID 保留可追溯。
6. **Slice 门槛**：Slice1 完成 = ACC-E01~E04 + E06~E08 全部「已通过」且 dogfooding ≥1 周；Slice2 启用（PROACTIVE_ENABLED=1 / TOOLS_BRAIN_SEARCH=1）前置 = 声口基线跑稳（E02 多轮判读无打回）+ E01~E08 无未决打回。

## 五、2026-11-20 走查修订记录

- F1 `/brain/*` 反代鉴权顺序修复（auticed 后置）→ E01 验证方法新增 `/brain/` 无凭证 401 断言
- F2 quietHours `hourCycle:'h23'`（'24:xx' 边界）、F8 `CHAT_LLM_TEMPERATURE=0` 生效修复
- F3 cost-config spec env 名/回落描述对齐代码（`BRAIN_EMBED_API_KEY` 无 DEEPSEEK 回落）；deploy.md env 注释修正 + 验证清单补鉴权断言 + persona 生成器检查
- F4 MAP.md 七段→九段；web-server spec 鉴权顺序写死
- 新增 E06 数据隔离 / E07 persona 双侧生效 / E08 成本基线；E05 并入 implement V8/V9 超限实证
- F5 tool loop 第三轮空 content 边界记录为观察项（不改码）
- F10 slice1 执行在 engram 本地任务体系承接（本任务起点）
- F11 路由级测试缺口 → 验收断言补位（E01），路由单测留作后续
<|close|>argument<|sep|><|close|>call<|sep|><|close|>tools<|sep|><|end_message|><|message_model|>exec<|content_invoke_tool_json|>{