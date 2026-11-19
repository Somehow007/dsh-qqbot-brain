import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatHistory } from '../src/chat/history.ts';
import type { HistoryConfig } from '../src/config.ts';

const CFG: HistoryConfig = { maxTurns: 6, maxChars: 200 };
const noop = () => {};

test('append + recent + toMessages 基本流', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-hist-'));
  const h = new ChatHistory(dir, CFG, noop);
  h.append('user', '你好');
  h.append('assistant', '你好呀');
  h.append('proactive', '想起你了', { via: 'agent' });
  const msgs = h.toMessages();
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0]!.role, 'user');
  assert.equal(msgs[1]!.role, 'assistant');
  assert.equal(msgs[2]!.role, 'assistant'); // proactive 归并为 assistant
  assert.ok(existsSync(join(dir, 'chat-log.jsonl')));
});

test('重启加载：jsonl 持久化可恢复', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-hist-'));
  const h1 = new ChatHistory(dir, CFG, noop);
  h1.append('user', '第一条');
  h1.append('assistant', '回复一');
  const h2 = new ChatHistory(dir, CFG, noop);
  const recent = h2.recent(10);
  assert.equal(recent.length, 2);
  assert.equal(recent[0]!.text, '第一条');
  assert.equal(recent[1]!.text, '回复一');
});

test('maxTurns 截断：内存视图只留尾部', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-hist-'));
  const h = new ChatHistory(dir, { maxTurns: 3, maxChars: 100000 }, noop);
  for (let i = 0; i < 10; i++) h.append('user', `msg${i}`);
  const msgs = h.toMessages();
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0]!.content, 'msg7');
  assert.equal(msgs[2]!.content, 'msg9');
});

test('maxChars 截头保尾', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-hist-'));
  const h = new ChatHistory(dir, { maxTurns: 24, maxChars: 30 }, noop);
  h.append('user', 'aaaa'); // 4
  h.append('assistant', 'bbbb'); // 4
  h.append('user', 'cccccccccccccccccccccccccccccc'); // 30 → 超了，截头剩最后一条
  const msgs = h.toMessages();
  assert.ok(msgs.length <= 2);
  assert.equal(msgs[msgs.length - 1]!.content.length, 30);
});

test('坏行跳过不污染', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-hist-'));
  const file = join(dir, 'chat-log.jsonl');
  writeFileSync(file, 'not json\n{"role":"user","text":"好","at":1}\n{"role":"bogus","text":"x","at":2}\n');
  const h = new ChatHistory(dir, CFG, noop);
  assert.equal(h.recent(10).length, 1);
});

test('countProactiveSince / lastProactiveAt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-hist-'));
  const h = new ChatHistory(dir, CFG, noop);
  const t0 = Date.now() - 100000;
  h.append('user', 'u', {});
  h.append('proactive', 'p1', { via: 'agent' });
  h.append('proactive', 'p2', { via: 'agent' });
  assert.equal(h.countProactiveSince(t0), 2);
  assert.ok(h.lastProactiveAt()! > t0);
});
