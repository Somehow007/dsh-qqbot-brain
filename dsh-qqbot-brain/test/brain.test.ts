import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../src/brain/index.ts';
import { BrainStore } from '../src/brain/store.ts';
import { Distiller, parseDistillOutput } from '../src/brain/distill.ts';
import { retention } from '../src/brain/decay.ts';
import { EmotionEngine } from '../src/brain/emotion.ts';
import { DAY_MS, DEFAULT_BRAIN_CONFIG } from '../src/brain/types.ts';

const DAY = DAY_MS;
let NOW = Date.parse('2026-03-24T12:00:00Z');
const now = () => NOW;

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'brain-'));
  return { dir, store: new BrainStore(dir) };
}

function mockDistiller(result: object) {
  return new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }),
    }),
  );
}

// ── 衰减 ──
test('retention: 强度越大衰减越慢，随时间单调下降', () => {
  const { store } = tmpStore();
  const weak = store.addNote('s1', { content: '小事', importance: 1 }, NOW - 10 * DAY);
  const strong = store.addNote('s1', { content: '大事', importance: 5 }, NOW - 10 * DAY);
  assert.ok(retention(weak, NOW) < retention(strong, NOW));
  assert.ok(retention(strong, NOW) < 1);
  assert.ok(retention(strong, NOW + 10 * DAY) < retention(strong, NOW));
});

// ── 存储 ──
test('store: 写入后重载可恢复', () => {
  const { dir, store } = tmpStore();
  store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 4 }, NOW);
  store.setProfile('s1', '阿澈：软件工程大二');
  store.setPersona('大肥鱼人设');
  store.flush();
  const store2 = new BrainStore(dir);
  assert.equal(store2.allNotes().length, 1);
  assert.equal(store2.allNotes()[0]!.content, '用户养了一只橘猫叫年糕');
  assert.equal(store2.profileOf('s1'), '阿澈：软件工程大二');
  assert.equal(store2.persona(), '大肥鱼人设');
  rmSync(dir, { recursive: true });
});

// ── 检索 ──
test('retrieval: 相关记忆被命中并强化', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store,
    distiller: mockDistiller({ memories: [] }),
    defaultPersona: '大肥鱼人设',
    now,
  });
  store.addNote('s1', { content: '用户讨厌香菜', importance: 3 }, NOW - 3 * DAY);
  store.addNote('s1', { content: '用户计划五一去青岛看海', importance: 4 }, NOW - 7 * DAY);

  const ctx = brain.assemble('s1', '我最讨厌吃什么菜？');
  assert.equal(ctx.hits.length > 0, true);
  assert.match(ctx.memoryLines.join('\n'), /香菜/);
  const hit = ctx.hits[0]!;
  assert.equal(hit.hits, 1);
  assert.ok(hit.strength >= 4); // 3 + reinforceStep
});

test('retrieval: 只检索本 session 的记忆', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '用户讨厌香菜', importance: 3 }, NOW);
  store.addNote('s2', { content: '用户喜欢榴莲', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '讨厌什么');
  assert.ok(ctx.hits.every((n) => n.sessionId === 's1'));
});

// ── 蒸馏 ──
test('parseDistillOutput: 解析 JSON / 容忍噪声', () => {
  const r = parseDistillOutput('```json\n{"memories":[{"content":"x","importance":4}],"emotion":{"label":"开心","v":0.7,"a":0.6,"d":0.2},"profile":"p"}\n```');
  assert.equal(r.memories.length, 1);
  assert.equal(r.emotion?.label, '开心');
  assert.equal(r.profile, 'p');
  assert.deepEqual(parseDistillOutput('not json'), { memories: [] });
});

test('endOfTurn: 蒸馏结果写入记忆/情绪/画像', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store,
    now,
    distiller: mockDistiller({
      memories: [{ content: '用户决定戒熬夜开始晨跑', importance: 4 }],
      emotion: { label: '得意', v: 0.6, a: 0.5, d: 0.2 },
      profile: '阿澈：开始晨跑的软件工程学生',
    }),
  });
  brain.ingest('s1', { userText: '我决定晨跑了', assistantText: '好耶咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes().length, 1);
  assert.equal(store.allNotes()[0]!.content, '用户决定戒熬夜开始晨跑');
  assert.equal(store.emotionOf('s1')?.label, '得意');
  assert.equal(store.profileOf('s1'), '阿澈：开始晨跑的软件工程学生');
  // 缓冲区已清空，再次 endOfTurn 不产生新记忆
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes().length, 1);
});

// ── 情绪 ──
test('emotion: 应用增量后随时间向中性回归', () => {
  const eng = new EmotionEngine(DEFAULT_BRAIN_CONFIG);
  eng.apply('s1', { label: '得意', v: 0.8, a: 0.9, d: 0.5 }, NOW);
  const soon = eng.get('s1', NOW + 0.2 * DAY);
  assert.ok(soon.v > 0.6);
  const later = eng.get('s1', NOW + 10 * DAY);
  assert.ok(later.v < 0.1);
  assert.equal(later.label, '平静');
});

// ── 组装 ──
test('assemble: 画像置顶 + 人格与情绪注入', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '用户喜欢告五人', importance: 3 }, NOW - DAY);
  store.setProfile('s1', '阿澈画像');
  const brain = new Brain({ store, distiller: mockDistiller({}), defaultPersona: '大肥鱼人设', now });
  const ctx = brain.assemble('s1', '推荐首歌');
  assert.equal(ctx.persona, '大肥鱼人设');
  assert.match(ctx.emotion, /当前情绪/);
  assert.ok(ctx.memoryLines[0]!.startsWith('- [画像]'));
});

// ── 可视化数据 ──
test('graph: 返回节点统计与遗忘标记', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '老记忆', importance: 1 }, NOW - 30 * DAY);
  store.addNote('s1', { content: '新记忆', importance: 5 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const g = brain.graph('s1');
  assert.equal(g.stats.total, 2);
  assert.equal(g.stats.fading >= 1, true);
});
