import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProactiveService } from '../src/chat/proactive.ts';
import { ChatHistory } from '../src/chat/history.ts';
import { DEFAULT_CONFIG, type EngramConfig } from '../src/config.ts';
import type { IntentEntry, Turn } from '../src/brain.ts';

function cfg(patch: Partial<EngramConfig['proactive']> = {}): EngramConfig {
  return { ...DEFAULT_CONFIG, proactive: { ...DEFAULT_CONFIG.proactive, ...patch } };
}

/** cfg.timeZone 口径下 now±offsetMin 的 HH:mm（测试不依赖墙钟） */
function hhmm(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60_000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DEFAULT_CONFIG.timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('hour')}:${g('minute')}`;
}

/** 覆盖当前时刻的静默窗（now-30m ~ now+30m）→ inQuietHours 恒 true */
const QUIET_NOW = { quietStart: hhmm(-30), quietEnd: hhmm(30) };
/** 远离当前时刻的静默窗（now+120m ~ now+180m）→ inQuietHours 恒 false */
const QUIET_AWAY = { quietStart: hhmm(120), quietEnd: hhmm(180) };

const intent = (patch: Partial<IntentEntry> = {}): IntentEntry => ({
  id: 'i1', kind: 'time', text: '该问候了', status: 'pending',
  createdAt: Date.now() - 2000, fireAt: Date.now() - 1000,
  firedCount: 0, lastFiredAt: Date.now() - 1000,
  ...patch,
});

function fakeDeps(opts: { intents?: IntentEntry[]; chatReply?: string } = {}) {
  const ingested: Turn[] = [];
  const brain = {
    intents: opts.intents ?? [],
    async queryEmbedding() { return undefined; },
    assemble() { return { persona: '人设', emotion: '', digest: '', clock: '现在', memoryLines: [], attitudeLines: [], deepRecallLines: [], hits: [] }; },
    emotionOf() { return { label: '平静' }; },
    ingest(_sid: string, turn: Turn) { ingested.push(turn); return []; },
    async endOfTurn() {},
  } as never;
  const llm = {
    enabled: true,
    async chat() { return { content: opts.chatReply ?? '主动发消息内容' }; },
  } as never;
  return { brain, llm, ingested };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

test('proactive.enabled=false 时 consume/onTick 全不动作', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-pro-'));
  const { brain, llm, ingested } = fakeDeps({ intents: [intent()] });
  const h = new ChatHistory(dir, DEFAULT_CONFIG.history, () => {});
  const svc = new ProactiveService(brain, llm, h, cfg({ enabled: false, ...QUIET_AWAY }), () => {});
  svc.consume([intent()]);
  svc.onTick([intent()]);
  await settle();
  assert.equal(ingested.length, 0);
});

test('quietHours 内不投递', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-pro-'));
  const { brain, llm, ingested } = fakeDeps({ intents: [intent()] });
  const h = new ChatHistory(dir, DEFAULT_CONFIG.history, () => {});
  const c = cfg({ enabled: true, minIntervalMinutes: 0, ...QUIET_NOW });
  const svc = new ProactiveService(brain, llm, h, c, () => {});
  svc.consume([intent()]);
  svc.onTick([intent()]); // deferred 也不该在静默窗内放行
  await settle();
  assert.equal(ingested.length, 0);
});

test('maxPerDay 封顶', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-pro-'));
  const { brain, llm, ingested } = fakeDeps({ intents: [intent()] });
  const h = new ChatHistory(dir, DEFAULT_CONFIG.history, () => {});
  const c = cfg({ enabled: true, maxPerDay: 0, minIntervalMinutes: 0, ...QUIET_AWAY });
  const svc = new ProactiveService(brain, llm, h, c, () => {});
  svc.consume([intent()]);
  await settle();
  assert.equal(ingested.length, 0);
});

test('正常投递：via=agent 写入 history + brain ingest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engram-pro-'));
  const { brain, llm, ingested } = fakeDeps({ intents: [intent()] });
  const h = new ChatHistory(dir, DEFAULT_CONFIG.history, () => {});
  const c = cfg({ enabled: true, maxPerDay: 4, minIntervalMinutes: 0, ...QUIET_AWAY });
  const svc = new ProactiveService(brain, llm, h, c, () => {});
  svc.consume([intent()]);
  await settle();
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0]!.via, 'agent'); // provenance 关键断言
  assert.equal(ingested[0]!.userText, ''); // via:'agent' 无用户发言配对
  const recent = h.recent(10);
  assert.equal(recent[recent.length - 1]!.role, 'proactive');
});
