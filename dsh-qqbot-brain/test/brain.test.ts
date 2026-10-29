import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../src/brain/index.ts';
import { BrainStore } from '../src/brain/store.ts';
import { Distiller, buildDistillPrompt, parseDistillOutput } from '../src/brain/distill.ts';
import { SessionCapture, parseSenderTag } from '../src/capture/events.ts';
import type { PromptInjector } from '../src/inject/prompt.ts';
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

test('parseDistillOutput: kind=attitude 被保留，非法 kind 回落情景', () => {
  const r = parseDistillOutput(JSON.stringify({
    memories: [
      { content: '对张三：嘴上嫌弃其实信任', importance: 4, kind: 'attitude' },
      { content: '用户买了新车', kind: 'bogus' },
    ],
  }));
  assert.equal(r.memories[0]!.kind, 'attitude');
  assert.equal(r.memories[1]!.kind, undefined);
});

test('endOfTurn: attitude 条目按 kind=attitude 入库', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [{ content: '对内卷：被说服后没那么反感了', importance: 3, kind: 'attitude' }],
    }),
  });
  brain.ingest('s1', { userText: '其实内卷也有道理', assistantText: '咕嘟…有点道理', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes()[0]!.kind, 'attitude');
});

// ── 态度立场注入 ──
test('assemble: attitude 命中进 attitudeLines 而非 memoryLines', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '对张三：嘴上嫌弃其实信任', importance: 4, kind: 'attitude' }, NOW);
  store.addNote('s1', { content: '张三上周请客吃了烤鱼', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '张三 烤鱼');
  assert.ok(ctx.attitudeLines.some((l) => l.includes('对张三')));
  assert.ok(!ctx.memoryLines.some((l) => l.includes('嫌弃')));
});

test('assemble: 发言人昵称保底唤起「对该人」的态度，且被强化', () => {
  const { store } = tmpStore();
  // 6 条高分填充记忆把 topK=6 占满：无昵称时态度轮不上检索分
  for (let i = 0; i < 6; i++) {
    store.addNote('g1', { content: `今晚吃啥大伙商量着定了第${i}家烧烤`, importance: 5 }, NOW);
  }
  store.addNote('g1', { content: '对张三：嘴上嫌弃其实信任', importance: 4, kind: 'attitude' }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // 别人发言：态度进不了 topK
  const ctx0 = brain.assemble('g1', '今晚吃啥', '李四');
  assert.equal(ctx0.attitudeLines.length, 0);
  // 张三发言：保底唤起且计入强化
  const ctx = brain.assemble('g1', '今晚吃啥', '张三');
  assert.ok(ctx.attitudeLines.some((l) => l.includes('对张三')));
  assert.equal(store.allNotes().find((n) => n.kind === 'attitude')!.hits, 1);
});

test('endOfTurn: merge 指向已有 attitude 条目时原位更新而非新增', async () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '对内卷：极度反感', importance: 4, kind: 'attitude' }, NOW - 3 * DAY);
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [{ content: '对内卷：被说服后没那么反感了', importance: 4, kind: 'attitude', merge: 0 }],
    }),
  });
  brain.ingest('s1', { userText: '其实内卷也有道理', assistantText: '咕嘟…有点道理', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes().length, 1);
  assert.equal(store.allNotes()[0]!.content, '对内卷：被说服后没那么反感了');
  assert.equal(store.allNotes()[0]!.kind, 'attitude');
});

test('buildDistillPrompt: 含态度条目写法说明', () => {
  const p = buildDistillPrompt(
    [{ userText: '你好', assistantText: '咕嘟', at: NOW }], '大肥鱼', 5,
  );
  assert.match(p, /kind": "attitude"/);
  assert.match(p, /对<对象>/);
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

test('emotion: 持久化状态在 Brain 构造时恢复，graph 无 session 显示最新', () => {
  const { store } = tmpStore();
  store.setEmotion('s1', { v: 0.7, a: 0.8, d: 0.3, label: '得意', updatedAt: NOW });
  store.setEmotion('s2', { v: -0.5, a: 0.4, d: -0.2, label: '委屈', updatedAt: NOW + 1000 });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // 无 session 的全局视图回退到最近更新的情绪（s2），并标注来源会话
  assert.equal(brain.graph().emotion.label, '委屈');
  assert.equal(brain.graph().emotionSession, 's2');
  assert.equal(brain.graph('s1').emotion.label, '得意');
  // 注入路径同样能拿到恢复的情绪
  assert.match(brain.assemble('s1', 'hi').emotion, /得意/);
});

test('buildDistillPrompt: 附当前情绪供"无变化省略"判断', () => {
  const p = buildDistillPrompt(
    [{ userText: '你好', assistantText: '咕嘟', at: NOW }],
    '大肥鱼',
    5,
    undefined,
    { v: 0.5, a: 0.6, d: 0.1, label: '得意', updatedAt: NOW },
  );
  assert.match(p, /角色当前情绪：得意/);
  assert.match(p, /省略 emotion 字段/);
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

// ── 发言人解析（群聊发送者标签） ──
test('parseSenderTag: 行首标签 → actor + 剥标签正文', () => {
  const r = parseSenderTag('[张三 (ABCDEF1234567890)] 今晚吃鱼');
  assert.equal(r.actor, '张三 (ABCDEF1234567890)');
  assert.equal(r.text, '今晚吃鱼');
});

test('parseSenderTag: 带 [Chat history]+[Current message] 锚点取最后的发言人', () => {
  const raw = [
    '[Chat history begins]',
    '[李四 (11111111AAAA)] 早点睡',
    '[王五 (22222222BBBB)] 好的',
    '',
    '[Chat history ends]',
    '[Current message]',
    '[张三 (ABCDEF1234567890)] 收到 (@you)',
  ].join('\n');
  const r = parseSenderTag(raw);
  assert.equal(r.actor, '张三 (ABCDEF1234567890)');
  assert.match(r.text, /Chat history begins/);
  assert.match(r.text, /收到 \(@you\)/);
  assert.ok(!r.text.includes('张三 (ABCDEF1234567890)]'));
});

test('parseSenderTag: 昵称含括号也能取到最后 (id) 组', () => {
  const r = parseSenderTag('[小鱼 (夜猫子) (ABCDEF1234567890)] 在吗');
  assert.equal(r.actor, '小鱼 (夜猫子) (ABCDEF1234567890)');
  assert.equal(r.text, '在吗');
});

test('parseSenderTag: 单聊裸文本 / 引用块无标签 → 无 actor 且原文不动', () => {
  const plain = parseSenderTag('今晚吃鱼');
  assert.equal(plain.actor, undefined);
  assert.equal(plain.text, '今晚吃鱼');
  const quoted = parseSenderTag('[Quoted message begins]\nx\n[Quoted message ends]\n[Current message]\n裸文本');
  assert.equal(quoted.actor, undefined);
  assert.equal(quoted.text.includes('裸文本'), true);
});

test('capture: 群聊事件把 actor 接进 Turn，检索 query 用剥标签正文', async () => {
  const { store } = tmpStore();
  const ingested: Array<{ userText: string; actor?: string }> = [];
  const brain = {
    ingest: (_s: string, t: { userText: string; actor?: string }) => { ingested.push(t); },
    endOfTurn: async () => {},
  };
  const notes: Array<{ text: string; actor?: string }> = [];
  const injector = {
    noteAgentSession: () => {},
    noteUserText: (_s: string, text: string, actor?: string) => { notes.push({ text, actor }); },
  } as unknown as PromptInjector;
  let handler: (session: unknown, ev: unknown) => void = () => {};
  const ctx = { on: (_e: string, h: typeof handler) => { handler = h; } };
  const cap = new SessionCapture(brain as unknown as Brain, injector, () => {}, false);
  cap.register(ctx);

  const s = { id: 'g1' };
  handler(s, { type: 'user/message', data: { message: '[张三 (ABCDEF1234567890)] 今晚吃鱼' } });
  handler(s, { type: 'assistant/message', data: { message: '咕嘟～' } });
  handler(s, { type: 'turn/end', data: {} });
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0]!.actor, '张三 (ABCDEF1234567890)');
  assert.equal(ingested[0]!.userText, '今晚吃鱼');
  assert.equal(notes[0]!.actor, '张三 (ABCDEF1234567890)');
  assert.equal(notes[0]!.text, '今晚吃鱼');
});

test('buildDistillPrompt: actor 作为发言人标签渲染', () => {
  const p = buildDistillPrompt(
    [{ userText: '今晚吃鱼', assistantText: '咕嘟', actor: '张三 (ABCDEF1234567890)', at: NOW }],
    '大肥鱼',
    5,
  );
  assert.match(p, /张三 \(ABCDEF1234567890\)：今晚吃鱼/);
});

test('assemble: 记忆行带发言人前缀', () => {
  const { store } = tmpStore();
  store.addNote('g1', { content: '今晚聚餐定了海底捞', importance: 3, actor: '张三 (ABCDEF1234567890)' }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('g1', '聚餐');
  assert.match(ctx.memoryLines.join('\n'), /\[张三 \(ABCDEF1234567890\)\] 今晚聚餐/);
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
