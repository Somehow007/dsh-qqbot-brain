# 执行计划：态度记忆层

## 顺序

1. `src/brain/types.ts` — kind 联合加 'attitude'，BrainContext 加 attitudeLines
2. `src/brain/distill.ts` — PROMPT 增加 attitude 条目规范；parseDistillOutput 解析 kind
3. `src/brain/index.ts` — assemble 第三参 speakerNick，query 拼接；hits 按 kind 拆分 attitudeLines/memoryLines
4. `src/inject/prompt.ts` — actor→昵称提取；assemble 传 nick；brain:attitude section (order 83)
5. `src/config.ts` / `src/index.ts` — injectAttitude 开关 + 日志
6. `src/server/http.ts` — kind 类型联合放宽
7. `src/server/page.html` — kindLabel、badge、REGION、字形、三个 select、panel 标题
8. `test/brain.test.ts` — 新用例

## 验证

```bash
cd dsh-qqbot-brain
node --test test/brain.test.ts
npx tsc -p tsconfig.json --noEmit
```

## 回滚点

- 每文件编辑独立可回退；page.html 的 UI 改动不阻塞后端（kind 映射有 ?? 兜底到 episodic 渲染分支需手动确认）
