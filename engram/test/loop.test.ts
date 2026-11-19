import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatLoop } from '../src/chat/loop.ts';
import { ChatHistory } from '../src/chat/history.ts';
import type { ChatLlm, ChatMessage, ChatResult } from '../src/chat/llm.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';

/** 假 LLM：固定回复，可控失败 */
function fakeLlm(reply = '回复内容', fail = false): ChatLlm {
  return {
    enabled: true,
    async chat(messages: ChatMessage[]): Promise<ChatResult | undefined> {
      if (fail) return undefined;
      return { content: `${reply}[看到${messages.length}条]`, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
  } as ChatLlm;
}

/** 假 brain：只实现 ChatLoop 用到的方法 */
function fakeBrain() {
  const ingested: { sid: string; turn: unknown }[] = [];
  const brain = {
    async queryEmbedding() { return undefined; },
    assemble() {
      return { persona: '人设', emotion: '', digest: '', clock: '现在', memoryLines: [], attitudeLines: [], deepRecallLines: [], hits: [] };
    },
    ingest(sid: string, turn: unknown) { ingested.push({ sid, turn }); return []; },
    async endOfTurn() {},
  };
  return { brain: brain as never, ingested };
}

test('正常路径：reply/usage/hits 返回 + ingest+endOfTurn 调用', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-loop-'));
  const { brain, ingested } = fakeBrain();
  const loop = new ChatLoop(brain, fakeLlm('哈喽'), new ChatHistory(dir, DEFAULT_CONFIG.history, () => {}), DEFAULT_CONFIG, () => {});
  const r = await loop.handleUserMessage('你好');
  assert.equal(r.degraded, false);
  assert.ok(r.reply.includes('哈喽'));
  assert.equal(r.usage?.totalTokens, 15);
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0]!.sid, 'main');
  assert.equal((ingested[0]!.turn as { via?: string }).via, 'user');
});

test('LLM 失败：降级文案 + 不 ingest（不污染记忆）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-loop-'));
  const { brain, ingested } = fakeBrain();
  const loop = new ChatLoop(brain, fakeLlm('x', true), new ChatHistory(dir, DEFAULT_CONFIG.history, () => {}), DEFAULT_CONFIG, () => {});
  const r = await loop.handleUserMessage('你好');
  assert.equal(r.degraded, true);
  assert.ok(r.reply.includes('卡了一下'));
  assert.equal(ingested.length, 0); // 关键：失败轮不写 Turn
});

test('空消息不消耗 LLM', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-loop-'));
  const { brain } = fakeBrain();
  let called = false;
  const llm = { enabled: true, async chat() { called = true; return { content: 'x' }; } } as unknown as ChatLlm;
  const loop = new ChatLoop(brain, llm, new ChatHistory(dir, DEFAULT_CONFIG.history, () => {}), DEFAULT_CONFIG, () => {});
  const r = await loop.handleUserMessage('   ');
  assert.equal(r.reply, '');
  assert.equal(called, false);
});

test('assemble 抛异常降级裸聊仍能回复', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-loop-'));
  const { ingested } = fakeBrain();
  const brain = {
    async queryEmbedding() { return undefined; },
    assemble() { throw new Error('boom'); },
    ingest(sid: string, turn: unknown) { ingested.push({ sid, turn }); return []; },
    async endOfTurn() {},
  } as never;
  const loop = new ChatLoop(brain, fakeLlm('我在'), new ChatHistory(dir, DEFAULT_CONFIG.history, () => {}), DEFAULT_CONFIG, () => {});
  const r = await loop.handleUserMessage('在吗');
  assert.equal(r.degraded, false);
  assert.ok(r.reply.includes('我在'));
});
