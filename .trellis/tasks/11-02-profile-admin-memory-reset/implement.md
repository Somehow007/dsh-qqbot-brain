# Implement — 人物画像管理与记忆重置

## 顺序

1. `src/brain/store.ts`：`reset` op 加 `keepPersona`；新 `del-range` op；`resetMemory()`、`deleteNotesInRange()`、`hasProfile()`、`profileEntry()`；`persist()` graphVersion 条件加 `del-range`；OpRecord/BrainExport 相关类型同步
2. `src/brain/emotion.ts`：`EmotionEngine.reset()`
3. `src/brain/distill.ts`：`PROFILE_DRAFT_PROMPT` + `draftProfile()`
4. `src/brain/index.ts`：五个新方法（`updateProfile`/`deleteProfile`/`regenerateProfile`/`purgeNotesInRange`/`resetMemory`）
5. `src/server/http.ts`：五个端点 + register 白名单补 3 条
6. `src/server/page.html`：画像卡三按钮 + 危险区 + OP_CN/opDesc
7. 测试：store/brain/http 各补用例
8. 验证：`npm test && npm run typecheck && npm run build`

## 验证命令

```bash
cd dsh-qqbot-brain
npm test            # node --test
npm run typecheck   # tsc --noEmit
npm run build
```

## 风险点 / 回滚

- `del-range` ids 语义是全任务最易错处（重放确定性）——测试必须先写
- page.html 无构建步骤，改完直接刷页面验证；逻辑错误靠 page.test.ts 里现有断言兜底 + 手动走查
- 回滚 = revert 本任务提交；新 op 若已落 jsonl，旧代码 apply 遇未知 op 走 switch default 忽略（确认 store apply 无 default throw——switch 是穷尽 union，旧版没有该 op 会落到无匹配 default，安全跳过）
