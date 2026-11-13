# 迭代D 执行清单

> 设计口径见 `design.md`。顺序按依赖排：types → store → time → distill → brain → http → plugin → tests。

## 1. types.ts

- [x] `IntentKind/IntentStatus/TurnVia/MemorySource` + `MEMORY_SOURCES` + `IntentMatch/IntentEntry/IntentDraft`
- [x] `Turn.via?: TurnVia`；`MemoryNote.source?: MemorySource`；`NoteDraft.source?: MemorySource`

## 2. store.ts

- [x] Op 联合 + `IntentUpdatePatch`（可变字段 null=清除 + status 内部态）
- [x] `intents` Map + `sanitizeIntent/sanitizeIntentMatch` + apply 四 op 分支
- [x] snapshot `intents` 读写；`reset` 清 intents；export/import intents（merge 幂等、ImportResult.intents）
- [x] `note.source` sanitize 透传 + importData 缺省 'import'；方法：addIntent/updateIntent/fireIntent/deleteIntent/allIntents/intentById

## 3. time.ts

- [x] `dailyOccurrenceMs(dailyAt, now, timeZone)`：partsOf 取当日 + Intl 不动点迭代收敛 wall→utc

## 4. distill.ts

- [x] `convoLines(turns, cap, ctx)` 共享渲染（via 三分支）替换 distill/digest 两处内联 map
- [x] distillPrompt/DIGEST_PROMPT 补 via 口径说明

## 5. brain/index.ts

- [x] intents API：addIntent/updateIntent/cancelIntent/deleteIntent/listIntents/tickIntents + normalizeIntentDraft 校验
- [x] matchEventIntents/eventIntentMatches/matchPattern(+regexCache)/intentGate/intentCooling/fireIntent/timeIntentDue
- [x] `ingest` 返回 fired 列表（event 匹配 + tickIntents 合并）
- [x] endOfTurn 无 user 轮次门禁跳过；withBoundSpeaker 只标 user 轮次
- [x] source 落库：endOfTurn 'user' / consolidateBatch 同质继承 / addNote 'manual' 兜底
- [x] graph() 加 `intents` 字段

## 6. server/http.ts

- [x] `/api/intents` GET/POST + `/<id>` PATCH/DELETE + `/<id>/cancel` + `/tick`；register 列表补 '/api/intents'

## 7. src/index.ts

- [x] 60s unref 定时器 `brain.tickIntents()` + fired 计数日志

## 8. 测试（实际落点 `test/intents.test.ts` 独立文件，16 例）

- [x] intent 生命周期：event add→ingest 命中→fire→cooldown→maxFires 终态；time fireAt/dailyAt/expiresAt/cancel；快照重启+op 重放
- [x] tickIntents 确定性 + 零 LLM（fetch 计数）
- [x] event 匹配边界：子串/正则/AND/sessionId/via 门禁
- [x] provenance：agent/system 批次跳蒸馏（fetch 零调用）；混合批次 prompt 快照含「角色（主动开口）」；source 各路径
- [x] HTTP intents CRUD+tick 冒烟

## 9. 验证与收尾

- [x] `npm run typecheck && npm test && npm run build && npm run eval` 全绿
- [x] spec/backend/index.ts→index.md 追加 intents/provenance 约定；MAP.md src/brain 行更新
- [x] CHANGES.md 追加（注明「迭代D已开发未部署，等广播放行」）；**不部署**
- [ ] 归档流程（archive 需 `--skip-branch-validation`，main 直做）+ add_session.py journal
