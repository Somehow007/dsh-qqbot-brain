import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../src/brain/index.ts';
import { BrainStore } from '../src/brain/store.ts';
import { Distiller, buildDistillPrompt, buildConsolidatePrompt, buildProfileReviewPrompt, parseDistillOutput } from '../src/brain/distill.ts';
import { ageLabel, formatClock, formatShort, formatStamp } from '../src/brain/time.ts';
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
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      let content = JSON.stringify(result);
      if (prompt.includes('长期人物画像的编辑')) {
        const raw = prompt.slice(prompt.indexOf('待整理画像') + '待整理画像（actor 仅用于区分人物，不得修改身份）：'.length).trim();
        const items = JSON.parse(raw) as { index: number; candidate: string }[];
        content = JSON.stringify({ profiles: items.map((item) => ({ index: item.index, text: item.candidate })) });
      }
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content } }] }),
      };
    },
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

test('personas: legacy 内容、命名版本和活动选择跨快照重启保留', () => {
  const { dir, store } = tmpStore();
  store.setPersona('旧人设');
  assert.equal(store.activePersonaId(), 'legacy');
  const added = store.createPersona('鲸鱼娘温柔版', '温柔内容');
  assert.equal(store.persona(), '旧人设');
  store.activatePersona(added.id);
  store.savePersona(added.id, '鲸鱼娘温柔版', '新版内容');
  assert.equal(store.persona(), '新版内容');
  store.flush();
  const restored = new BrainStore(dir);
  assert.equal(restored.persona(), '新版内容');
  assert.equal(restored.activePersonaId(), added.id);
  restored.activatePersona('legacy');
  assert.equal(restored.persona(), '旧人设');
  rmSync(dir, { recursive: true });
});

test('personas: 备份恢复列表、旧版字段与错误输入不改变活动版本', () => {
  const { store } = tmpStore();
  store.setPersona('旧版');
  const added = store.createPersona('新版本', '新文案');
  store.activatePersona(added.id);
  const dump = store.exportData(NOW);
  const { store: restored } = tmpStore();
  restored.importData(dump, 'replace', NOW);
  assert.equal(restored.persona(), '新文案');
  assert.equal(restored.listPersonas().length, 2);
  restored.importData({ persona: '外部旧备份' }, 'merge', NOW);
  assert.equal(restored.persona(), '新文案');
  assert.throws(() => restored.activatePersona('missing'));
  assert.throws(() => restored.savePersona(added.id, '', 'bad'));
  assert.throws(() => restored.importData({ personas: [{ id: '', name: 'bad', text: 'bad' }] }, 'replace', NOW));
  assert.equal(restored.persona(), '新文案');
  const { store: legacy } = tmpStore();
  legacy.importData({ persona: '外部旧备份' }, 'replace', NOW);
  assert.equal(legacy.persona(), '外部旧备份');
});

test('personas: 只能删除非当前人设，删除后跨重启不复活', () => {
  const { dir, store } = tmpStore();
  store.setPersona('原版');
  const dead = store.createPersona('试用', '试用内容');
  assert.throws(() => store.deletePersona(store.activePersonaId()));
  assert.throws(() => store.deletePersona('missing'));
  store.deletePersona(dead.id);
  assert.equal(store.listPersonas().length, 1);
  store.flush();
  const restored = new BrainStore(dir);
  assert.equal(restored.listPersonas().length, 1);
  assert.equal(restored.persona(), '原版');
  rmSync(dir, { recursive: true });
});

// ── 导出 / 导入 ──
test('export/import: 整包往返一致，衰减字段保留', () => {
  const { store } = tmpStore();
  const note = store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 4 }, NOW - 5 * DAY);
  store.reinforceById(note.id, 1, 10, NOW - DAY);
  store.setProfile('s1', '阿澈：软件工程大二');
  store.setPersona('大肥鱼人设');
  const dump = JSON.parse(JSON.stringify(store.exportData(NOW)));

  const { store: target } = tmpStore();
  const r = target.importData(dump, 'merge', NOW);
  assert.equal(r.notes, 1);
  const got = target.noteById(note.id)!;
  assert.equal(got.content, '用户养了一只橘猫叫年糕');
  assert.equal(got.strength, store.noteById(note.id)!.strength);
  assert.equal(got.lastAccessAt, store.noteById(note.id)!.lastAccessAt);
  assert.equal(target.profileOf('s1'), '阿澈：软件工程大二');
  assert.equal(target.persona(), '大肥鱼人设');
});

test('import merge: 已存在的 id 跳过，重复导入幂等', () => {
  const { store } = tmpStore();
  const note = store.addNote('s1', { content: '原版内容', importance: 3 }, NOW);
  const dump = store.exportData(NOW);
  // 本地改过内容后合并，本地优先不被覆盖
  store.updateNote(note.id, { content: '本地改过的内容' });
  const r1 = store.importData(dump, 'merge', NOW);
  assert.equal(r1.notes, 0);
  assert.equal(r1.skipped, 1);
  assert.equal(store.noteById(note.id)!.content, '本地改过的内容');
  assert.equal(store.allNotes().length, 1);
});

test('import replace: 清库后整包恢复，事件流水留痕', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '要被清掉的记忆', importance: 3 }, NOW);
  const dump = store.exportData(NOW);
  store.addNote('s2', { content: '后来新增的记忆', importance: 3 }, NOW);

  const r = store.importData(dump, 'replace', NOW);
  assert.equal(r.notes, 1);
  assert.equal(store.allNotes().length, 1);
  assert.equal(store.allNotes()[0]!.content, '要被清掉的记忆');
  assert.ok(store.recentOps(10).some((o) => o.op.op === 'reset'));
});

test('import: 坏文件与脏数据不报导入成功', () => {
  const { store } = tmpStore();
  assert.throws(() => store.importData('not json obj', 'merge', NOW));
  assert.throws(() => store.importData({ notes: 'x' }, 'merge', NOW));
  const r = store.importData({ notes: [{ id: '', content: '' }, { id: 'ok', content: '有效记忆' }] }, 'merge', NOW);
  assert.equal(r.notes, 1);
  assert.equal(r.skipped, 1);
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

test('retrieval: 标点切断的句子经归一化仍可命中', () => {
  const { store } = tmpStore();
  // 「橘猫，名叫年糕」归一化前 bigram 为 猫，名，查询的 猫叫/猫名 永远对不上
  store.addNote('s1', { content: '用户阿澈养了一只橘猫，名叫年糕', importance: 4 }, NOW - 20 * DAY);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '我家猫叫什么');
  assert.ok(ctx.hits.some((n) => n.content.includes('年糕')));
});

test('retrieval: 相关性门槛过滤零余弦噪声，不再让新鲜记忆凑满 topK', () => {
  const { store } = tmpStore();
  // 6 条高重要度新鲜记忆——旧行为下它们靠 R+imp 基线分占满 topK=6
  for (let i = 0; i < 6; i++) {
    store.addNote('s1', { content: `今晚吃啥大伙商量着定了第${i}家烧烤`, importance: 5 }, NOW);
  }
  store.addNote('s1', { content: '用户阿澈养了一只橘猫，名叫年糕', importance: 4 }, NOW - 20 * DAY);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '我家猫叫什么');
  assert.equal(ctx.hits.length, 1);
  assert.match(ctx.hits[0]!.content, /年糕/);
});

test('retrieval: 完全无关的查询返回空，单字查询经 unigram 命中', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 4 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  assert.equal(brain.assemble('s1', '量子力学好难').hits.length, 0);
  assert.equal(brain.assemble('s1', '猫').hits.length, 1);
});

// ── 蒸馏 ──
test('parseDistillOutput: 解析 JSON / 容忍噪声', () => {
  const r = parseDistillOutput('```json\n{"memories":[{"content":"x","importance":4}],"emotion":{"label":"开心","mood":"开心","v":0.7,"a":0.6,"d":0.2},"profile":"p"}\n```');
  assert.equal(r.memories.length, 1);
  assert.equal(r.emotion?.label, '开心');
  assert.equal(r.emotion?.mood, '开心');
  assert.equal(r.profile, 'p');
  assert.deepEqual(parseDistillOutput('not json'), { memories: [] });
});

test('parseDistillOutput: mood 只收受控类别，非法值丢弃', () => {
  const r = parseDistillOutput(JSON.stringify({
    memories: [],
    emotion: { label: '气得鼓鼓的', mood: '愤怒MAX', v: -0.5, a: 0.8, d: 0.1 },
  }));
  assert.equal(r.emotion?.label, '气得鼓鼓的');
  assert.equal(r.emotion?.mood, undefined);
  const r2 = parseDistillOutput(JSON.stringify({
    memories: [],
    emotion: { label: '害羞偷笑', mood: '害羞', v: 0.5, a: 0.4, d: -0.1 },
  }));
  assert.equal(r2.emotion?.mood, '害羞');
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

test('assemble: 发言人昵称保底唤起「对该人」的态度，但不计入强化', () => {
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
  // 张三发言：保底唤起进立场区，但恒驻上下文不刷 hits（防 R 锁死）
  const ctx = brain.assemble('g1', '今晚吃啥', '张三');
  assert.ok(ctx.attitudeLines.some((l) => l.includes('对张三')));
  assert.equal(store.allNotes().find((n) => n.kind === 'attitude')!.hits, 0);
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
      emotion: { label: '得意', mood: '开心', v: 0.6, a: 0.5, d: 0.2 },
      profile: '阿澈：开始晨跑的软件工程学生',
    }),
  });
  brain.ingest('s1', { userText: '我决定晨跑了', assistantText: '好耶咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes().length, 1);
  assert.equal(store.allNotes()[0]!.content, '用户决定戒熬夜开始晨跑');
  assert.equal(store.emotionOf('s1')?.label, '得意');
  assert.equal(store.emotionOf('s1')?.mood, '开心');
  assert.equal(store.allNotes()[0]!.emotion?.mood, '开心');
  assert.equal(store.profileOf('s1'), '阿澈：开始晨跑的软件工程学生');
  // 缓冲区已清空，再次 endOfTurn 不产生新记忆
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes().length, 1);
});

// ── 情绪 ──
test('emotion: 应用增量后随时间向中性回归', () => {
  const eng = new EmotionEngine(DEFAULT_BRAIN_CONFIG);
  eng.apply('s1', { label: '得意', mood: '开心', v: 0.8, a: 0.9, d: 0.5 }, NOW);
  const soon = eng.get('s1', NOW + 0.2 * DAY);
  assert.ok(soon.v > 0.6);
  assert.equal(soon.mood, '开心');
  const later = eng.get('s1', NOW + 10 * DAY);
  assert.ok(later.v < 0.1);
  assert.equal(later.label, '平静');
  assert.equal(later.mood, '平静');
});

test('emotion: 持久化状态在 Brain 构造时恢复，graph 无 session 显示最新', async () => {
  const { store } = tmpStore();
  store.setEmotion('s1', { v: 0.7, a: 0.8, d: 0.3, label: '得意', updatedAt: NOW });
  store.setEmotion('s2', { v: -0.5, a: 0.4, d: -0.2, label: '委屈', updatedAt: NOW + 1000 });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // 无 session 的全局视图回退到最近更新的情绪（s2），并标注来源会话
  assert.equal((await brain.graph()).emotion.label, '委屈');
  assert.equal((await brain.graph()).emotionSession, 's2');
  assert.equal((await brain.graph('s1')).emotion.label, '得意');
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

test('buildDistillPrompt: mood 枚举与刺激锚点约束情绪判定', () => {
  const p = buildDistillPrompt(
    [{ userText: '你好', assistantText: '咕嘟', at: NOW }], '大肥鱼', 5,
  );
  assert.match(p, /mood.*平静\/开心\/兴奋\/害羞\/好奇\/委屈\/炸毛\/记仇\/难过/s);
  assert.match(p, /被夸\/被撩\/被关心→害羞/);
  assert.match(p, /不要只按角色回复的语气反推/);
  assert.match(p, /负向类别（委屈\/炸毛\/记仇\/难过）v 为负/);
});

test('endOfTurn: mood 与 v 符号矛盾时记 debug 日志', async () => {
  const { store } = tmpStore();
  const logs: string[] = [];
  const brain = new Brain({
    store,
    now,
    log: (m) => logs.push(m),
    distiller: mockDistiller({
      memories: [],
      emotion: { label: '心里委屈但装没事', mood: '委屈', v: 0.8, a: 0.5, d: -0.1 },
    }),
  });
  brain.ingest('s1', { userText: '随便你吧', assistantText: '哼，没事', at: NOW });
  await brain.endOfTurn('s1');
  assert.ok(logs.some((l) => l.includes('情绪矛盾') && l.includes('委屈')));
});

test('endOfTurn: 强情绪形成的记忆强度获得加权', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store,
    now,
    distiller: mockDistiller({
      memories: [{ content: '用户当众表白了大肥鱼', importance: 3 }],
      emotion: { label: '害羞到把脸埋进被子', mood: '害羞', v: 0.8, a: 0.8, d: -0.2 },
    }),
  });
  brain.ingest('s1', { userText: '我喜欢你', assistantText: '诶？！', at: NOW });
  await brain.endOfTurn('s1');
  // importance=3 → 基准 strength=3，|v|·a=0.64 → ×1.32
  assert.ok(store.allNotes()[0]!.strength > 3.9, `strength=${store.allNotes()[0]!.strength}`);

  const { store: store2 } = tmpStore();
  const brain2 = new Brain({
    store: store2,
    now,
    distiller: mockDistiller({
      memories: [{ content: '用户随口问了句天气', importance: 3 }],
      emotion: { label: '平静', mood: '平静', v: 0, a: 0.2, d: 0 },
    }),
  });
  brain2.ingest('s1', { userText: '今天天气咋样', assistantText: '还行', at: NOW });
  await brain2.endOfTurn('s1');
  assert.ok(store2.allNotes()[0]!.strength <= 3.1, `strength=${store2.allNotes()[0]!.strength}`);
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

test('capture: turn/end 前的多条用户消息入队拼成一轮，配对后队列排空', async () => {
  const ingested: Array<{ userText: string; assistantText: string; actor?: string }> = [];
  const brain = { ingest: (_s: string, t: never) => { ingested.push(t); }, endOfTurn: async () => {} };
  const injector = { noteAgentSession: () => {}, noteUserText: () => {} } as unknown as PromptInjector;
  let handler: (session: unknown, ev: unknown) => void = () => {};
  const ctx = { on: (_e: string, h: typeof handler) => { handler = h; } };
  const cap = new SessionCapture(brain as unknown as Brain, injector, () => {}, false);
  cap.register(ctx);

  const s = { id: 'g1' };
  // 连发两条（不同发言人），机器人只回一轮 → 两条都应进蒸馏且 actor 取最后一条
  handler(s, { type: 'user/message', data: { message: '[张三 (ABCDEF1234567890)] 你这只咸鱼' } });
  handler(s, { type: 'user/message', data: { message: '[李四 (ABCDEF1234567891)] 别骂了别骂了' } });
  handler(s, { type: 'assistant/message', data: { message: '谁是咸鱼！' } });
  handler(s, { type: 'turn/end', data: {} });
  assert.equal(ingested.length, 1);
  // 多条消息逐条带 [HH:mm]，保住每条是啥时候说的
  assert.match(ingested[0]!.userText, /\[\d{2}:\d{2}\] 你这只咸鱼\n\[\d{2}:\d{2}\] 别骂了别骂了/);
  assert.equal(ingested[0]!.actor, '李四 (ABCDEF1234567891)');
  // 队列已排空：下一轮没有新用户消息，旧消息不重复配对
  handler(s, { type: 'assistant/message', data: { message: '哼' } });
  handler(s, { type: 'turn/end', data: {} });
  assert.equal(ingested.length, 1);
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

// ── 时间归因（「什么时候说」的时间层）──

test('time: formatStamp/formatShort/formatClock/ageLabel 按配置时区渲染', () => {
  // NOW = 2026-03-24T12:00Z → Asia/Shanghai 2026-03-24 20:00 周二
  assert.equal(formatStamp(NOW, 'Asia/Shanghai'), '2026-03-24 20:00');
  assert.equal(formatShort(NOW, 'Asia/Shanghai'), '20:00');
  assert.equal(formatClock(NOW, 'Asia/Shanghai'), '2026年3月24日 周二 20:00（Asia/Shanghai）');
  assert.equal(ageLabel(NOW - 30 * 60_000, NOW), '30分钟前');
  assert.equal(ageLabel(NOW - 3 * 3_600_000, NOW), '3小时前');
  assert.equal(ageLabel(NOW - 3 * DAY, NOW), '3天前');
  // 未来时间钳底，非法时区降级不抛
  assert.equal(ageLabel(NOW + 60_000, NOW), '1分钟前');
  assert.doesNotThrow(() => formatClock(NOW, 'Mars/Olympus'));
});

test('assemble: clock 注入当前时刻，记忆行同日细化到小时', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '两小时前说的那条烤鱼的事', importance: 3 }, NOW - 2 * 3_600_000);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '烤鱼');
  assert.equal(ctx.clock, '2026年3月24日 周二 20:00（Asia/Shanghai）');
  assert.match(ctx.memoryLines.join('\n'), /\[2小时前记\] 两小时前说的那条烤鱼的事/);
});

test('buildDistillPrompt: convo 行带时间戳、已有记忆带形成时间、末尾锚定当前时间', () => {
  const ctx = { now: NOW, timeZone: 'Asia/Shanghai' };
  const existing = [{
    id: 'n1', sessionId: 's1', content: '旧记忆一条', importance: 3,
    kind: 'episodic' as const, createdAt: NOW - 2 * DAY, strength: 1, hits: 0, lastAccessAt: NOW - 2 * DAY,
  }];
  const p = buildDistillPrompt(
    [{ userText: '今晚吃鱼', assistantText: '咕嘟', actor: '张三 (ABCDEF1234567890)', at: NOW }],
    '大肥鱼', 5, existing, undefined, undefined, ctx,
  );
  assert.match(p, /\[2026-03-24 20:00\] 张三 \(ABCDEF1234567890\)：今晚吃鱼/);
  assert.match(p, /0\. \[2天前\] 旧记忆一条/);
  assert.match(p, /当前时间：2026年3月24日 周二 20:00（Asia\/Shanghai）/);
});

test('buildConsolidatePrompt: 情景记忆列表带形成时间标注', () => {
  const notes = [{
    id: 'n1', sessionId: 's1', content: '张三爱民谣', importance: 3,
    kind: 'episodic' as const, createdAt: NOW - 3 * DAY, strength: 1, hits: 0, lastAccessAt: NOW - 3 * DAY,
  }];
  const p = buildConsolidatePrompt(notes, '', '大肥鱼', { now: NOW, timeZone: 'Asia/Shanghai' });
  assert.match(p, /- \[3天前\] 张三爱民谣/);
});

// ── 可视化数据 ──
test('graph: 返回节点统计与遗忘标记', async () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '老记忆', importance: 1 }, NOW - 30 * DAY);
  store.addNote('s1', { content: '新记忆', importance: 5 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const g = await brain.graph('s1');
  assert.equal(g.stats.total, 2);
  assert.equal(g.stats.fading >= 1, true);
});

test('graph: 记忆写入时钉上情绪快照', async () => {
  const { store } = tmpStore();
  store.setEmotion('s1', { v: 0.7, a: 0.8, d: 0.3, label: '得意', updatedAt: NOW });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const n = brain.addNote('s1', { content: '手写记忆', importance: 3 });
  assert.ok(n.emotion, '写入时应带情绪快照');
  assert.equal(n.emotion!.label, '得意');
  assert.equal((await brain.graph('s1')).notes[0]!.emotion!.label, '得意');
});

test('graph: 边集按 graphVersion 缓存，记忆结构变化后失效重算', async () => {
  const { store } = tmpStore();
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const g1 = await brain.graph('s1');
  const g2 = await brain.graph('s1');
  assert.equal(g1.edges, g2.edges, '记忆未变时应命中边集缓存');
  brain.addNote('s1', { content: '新记忆触发失效', importance: 3 });
  const g3 = await brain.graph('s1');
  assert.notEqual(g3.edges, g1.edges, 'add 后应重算边集');
  // reinforce 等不动边集的写操作不应失效缓存
  const n = store.allNotes()[0]!;
  brain.reinforceNote(n.id);
  const g4 = await brain.graph('s1');
  assert.equal(g4.edges, g3.edges, 'reinforce 不应使边集缓存失效');
});

test('graph edges: 语义边取向量余弦 top-k，近重复不连', async () => {
  const { store } = tmpStore();
  const a = store.addNote('s1', { content: 'a', importance: 3 }, NOW);
  const b = store.addNote('s1', { content: 'b', importance: 3 }, NOW);
  const c = store.addNote('s1', { content: 'c', importance: 3 }, NOW);
  const d = store.addNote('s1', { content: 'd', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // a-b cos≈0.89（边）、a-c cos≈1.0（近重复不连）、其他对 cos<0.65（低于门槛）
  store.setEmbedding(a.id, [1, 0, 0, 0]);
  store.setEmbedding(b.id, [0.8, 0.4, 0, 0]);
  store.setEmbedding(c.id, [0.99, 0.05, 0, 0]);
  store.setEmbedding(d.id, [0, 0.9, 0.5, 0]);
  const g = await brain.graph('s1');
  const sem = g.edges!.filter((e) => e.kind === 'semantic');
  assert.equal(sem.length, 1);
  assert.deepEqual([sem[0]!.a, sem[0]!.b].sort(), [a.id, b.id].sort());
  assert.ok(sem[0]!.score >= 0.65 && sem[0]!.score < 0.9);
});

test('sweepNearDups: 近重复簇合并为信息量最大的一条，重载后保持', () => {
  const { dir, store } = tmpStore();
  const a = store.addNote('s1', { content: '短', importance: 2, actor: '张三' }, NOW - 2 * DAY);
  const b = store.addNote('s1', { content: '长文案：用户反复强调自己对花生严重过敏这件事', importance: 4 }, NOW - DAY);
  const c = store.addNote('s1', { content: '中等长度的同类记录', importance: 3 }, NOW);
  const d = store.addNote('s1', { content: '完全无关的另一条记忆', importance: 3 }, NOW);
  store.setEmbedding(a.id, [1, 0, 0]);
  store.setEmbedding(b.id, [0.99, 0.05, 0]);
  store.setEmbedding(c.id, [0.98, 0.1, 0]);
  store.setEmbedding(d.id, [0, 1, 0]);
  store.reinforce(a, 1, 10, NOW);
  store.reinforce(b, 1, 10, NOW);
  store.reinforce(d, 1, 10, NOW); // d 也要活过 compact 的物理遗忘（其内部按真实时间计龄）
  const sBefore = store.noteById(b.id)!.strength;
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const r = brain.sweepNearDups();
  assert.equal(r.merged, 2);
  assert.equal(r.clusters, 1);
  const rest = store.allNotes();
  assert.equal(rest.length, 2);
  const keep = rest.find((n) => n.content.startsWith('长文案'))!;
  assert.equal(keep.id, b.id, '保留信息量最大的');
  assert.equal(keep.hits, 2, 'a/b 各一次命中并入保留者');
  assert.equal(keep.importance, 4);
  assert.equal(keep.createdAt, NOW - 2 * DAY, 'createdAt 取最早');
  assert.equal(keep.actor, '张三', '保留者缺 actor 时由被并者补');
  assert.ok(keep.strength > sBefore, '强度应并入提升');
  store.flush();
  const store2 = new BrainStore(dir);
  assert.equal(store2.allNotes().length, 2, 'merge op 重放后仍为 2 条');
  assert.equal(store2.noteById(b.id)!.hits, 2);
});

test('graph edges: sourceIds 产出 derived 边，指向不存在节点被过滤', async () => {
  const { store } = tmpStore();
  const e = store.addNote('s1', { content: '情景记忆', importance: 3 }, NOW);
  const s = store.addNote('s1', { content: '语义记忆', kind: 'semantic', sourceIds: [e.id, 'ghost'] }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const g = await brain.graph('s1');
  const de = g.edges!.filter((x) => x.kind === 'derived');
  assert.equal(de.length, 1);
  assert.equal(de[0]!.a, s.id);
  assert.equal(de[0]!.b, e.id);
});

test('distill 写入判重：cos≥0.9 的新记忆强化旧记忆而非新增', async () => {
  const { store } = tmpStore();
  const old = store.addNote('s1', { content: '用户喜欢猫', importance: 3 }, NOW);
  store.setEmbedding(old.id, [1, 0, 0]);
  const fake = {
    enabled: true,
    embed: async (texts: string[]) => texts.map(() => [0.99, 0.05, 0]),
    embedOne: async () => null,
  };
  const brain = new Brain({
    store,
    distiller: mockDistiller({ memories: [{ content: '用户其实很喜欢猫咪', importance: 3 }] }),
    embedder: fake as never,
    now,
  });
  brain.ingest('s1', { userText: 'hi', assistantText: 'yo', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes().length, 1, '近重复应合并而非新增');
  assert.equal(store.noteById(old.id)!.hits, 1, '旧记忆应被强化命中');
});

test('graph edges: 无向量时为空数组，facet 边经 embedder 匹配', async () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '没向量的记忆', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  assert.deepEqual((await brain.graph('s1')).edges, []);
  // 有 embedder 时人格小节向量与记忆向量匹配出 facet 边
  const fake = {
    enabled: true,
    embed: async (texts: string[]) => texts.map((t) => (t.includes('风格') ? [0, 0, 1] : [1, 0, 0])),
    embedOne: async () => null,
  };
  store.setPersona('## 身份\n是大肥鱼\n## 说话风格\n嘴硬傲娇');
  const n2 = store.addNote('s1', { content: '她说了一句口是心非的话', importance: 3 }, NOW);
  store.setEmbedding(n2.id, [0, 0.05, 0.99]);
  const brain2 = new Brain({ store, distiller: mockDistiller({}), embedder: fake as never, now });
  const g2 = await brain2.graph('s1');
  const fe = g2.edges!.filter((e) => e.kind === 'facet');
  assert.equal(fe.length, 1);
  assert.equal(fe[0]!.b, 'facet:1');
});

// ── 画像按人建模 ──
import { splitActor, userProfileKey } from '../src/brain/identity.ts';
import { writeFileSync } from 'node:fs';

test('splitActor: 拆出昵称与 openid，昵称含括号也能取到末尾 id 组', () => {
  assert.deepEqual(splitActor('张三 (ABCDEF1234567890)'), { nick: '张三', openid: 'ABCDEF1234567890' });
  assert.deepEqual(splitActor('小鱼 (夜猫子) (ABCDEF1234567890)'), { nick: '小鱼 (夜猫子)', openid: 'ABCDEF1234567890' });
  assert.deepEqual(splitActor('裸昵称'), { nick: '裸昵称', openid: undefined });
});

test('store: 画像按 u:/sess: 键存取，people() 区分人与会话', () => {
  const { store } = tmpStore();
  store.setProfile('s1', '会话级画像');                                  // 旧接口 → sess:s1
  store.setProfileEntry(userProfileKey('OID123'), '张三的画像', { sessionId: 's1', name: '张三' });
  store.setProfileEntry(userProfileKey('OID123'), '张三的画像v2', { sessionId: 's2', name: '张三' });
  assert.equal(store.profileOf('s1'), '会话级画像');
  assert.equal(store.profileOf(userProfileKey('OID123')), '张三的画像v2');
  const people = store.people();
  const person = people.find((p) => p.kind === 'person')!;
  assert.equal(person.openid, 'OID123');
  assert.equal(person.name, '张三');
  assert.deepEqual([...person.sessions].sort(), ['s1', 's2']); // 同一人跨会话画像合并
  // u: 键不制造会话卡片，sess 键仍并入会话并集
  assert.deepEqual(store.sessions().map((s) => s.sessionId), ['s1']);
});

test('store: 旧 jsonl 的裸 profile op 重放自动迁移为 sess: 键', () => {
  const { dir } = tmpStore();
  writeFileSync(join(dir, 'brain.jsonl'),
    JSON.stringify({ t: NOW, op: 'profile', sessionId: 's1', text: '老会话画像' }) + '\n');
  const store = new BrainStore(dir);
  assert.equal(store.profileOf('s1'), '老会话画像');
  assert.equal(store.people()[0]!.kind, 'session');
  rmSync(dir, { recursive: true });
});

test('parseDistillOutput: profiles 数组解析，旧 profile 字段兼容', () => {
  const r = parseDistillOutput(JSON.stringify({
    memories: [],
    profiles: [
      { actor: '张三 (ABCDEF1234567890)', text: '嘴甜会夸人' },
      { text: '会话整体画像' },
      { actor: '李四', text: '' }, // 空 text 过滤
    ],
  }));
  assert.equal(r.profiles!.length, 2);
  assert.equal(r.profiles![0]!.actor, '张三 (ABCDEF1234567890)');
  assert.equal(r.profiles![1]!.actor, undefined);
  const legacy = parseDistillOutput('{"profile":"p","memories":[]}');
  assert.equal(legacy.profile, 'p');
  assert.equal(legacy.profiles, undefined);
});

test('endOfTurn: 群聊画像按发言人 openid 入 u: 键，跨会话归并', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [],
      profiles: [{ actor: '张三 (ABCDEF1234567890)', text: '张三：嘴甜会夸人' }],
    }),
  });
  brain.ingest('g1', { userText: '鱼鱼真可爱', assistantText: '咕嘟', actor: '张三 (ABCDEF1234567890)', at: NOW });
  await brain.endOfTurn('g1');
  brain.ingest('g2', { userText: '又见面了', assistantText: '咕嘟', actor: '张三 (ABCDEF1234567890)', at: NOW });
  await brain.endOfTurn('g2');
  const person = store.people().find((p) => p.kind === 'person')!;
  assert.equal(person.openid, 'ABCDEF1234567890');
  assert.equal(person.name, '张三');
  assert.deepEqual([...person.sessions].sort(), ['g1', 'g2']);
  assert.equal(store.people().filter((p) => p.kind === 'session').length, 0); // 无会话级画像
});

test('assemble: 发言人带 openid 时注入个人画像，会话画像降格为「会话画像」', () => {
  const { store } = tmpStore();
  store.setProfile('g1', '这个群很欢乐');
  store.setProfileEntry(userProfileKey('OID_ZS'), '张三画像', { sessionId: 'g1', name: '张三' });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('g1', 'hi', { nick: '张三', openid: 'OID_ZS' });
  assert.match(ctx.memoryLines[0]!, /^- \[画像\] 张三画像/);
  assert.match(ctx.memoryLines[1]!, /^- \[会话画像\] 这个群很欢乐/);
  // 其他发言人只看会话画像
  const ctx2 = brain.assemble('g1', 'hi', { nick: '李四', openid: 'OID_LS' });
  assert.match(ctx2.memoryLines[0]!, /^- \[画像\] 这个群很欢乐/);
});

test('assemble: 「对该人」的态度跨会话保底唤起', () => {
  const { store } = tmpStore();
  store.addNote('g1', { content: '对张三：嘴上嫌弃其实信任', importance: 4, kind: 'attitude' }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('g2', '在吗', '张三');
  assert.ok(ctx.attitudeLines.some((l) => l.includes('对张三')));
});

test('import/export: u:/sess: 键画像整包往返，旧格式字符串值兼容', () => {
  const { store } = tmpStore();
  store.setProfile('s1', '会话画像');
  store.setProfileEntry(userProfileKey('OID1'), '个人画像', { sessionId: 's1', name: '某人' });
  const dump = JSON.parse(JSON.stringify(store.exportData(NOW)));
  const { store: target } = tmpStore();
  const r = target.importData(dump, 'replace', NOW);
  assert.equal(r.profiles, 2);
  assert.equal(target.profileOf('s1'), '会话画像');
  assert.equal(target.profileOf(userProfileKey('OID1')), '个人画像');
  // 旧版导出（裸 sessionId 键 + 字符串值）也能导
  const legacy = { profiles: { s9: '旧画像' } };
  const r2 = target.importData(legacy, 'merge', NOW);
  assert.equal(r2.profiles, 1);
  assert.equal(target.profileOf('s9'), '旧画像');
});

test('buildDistillPrompt: 附现有画像供增量修订', () => {
  const p = buildDistillPrompt(
    [{ userText: '又来啦', assistantText: '咕嘟', actor: '张三 (OID123)', at: NOW }],
    '大肥鱼', 5, undefined, undefined,
    [{ text: '群整体很欢乐' }, { actor: '张三 (OID123)', text: '嘴甜会夸人' }],
  );
  assert.match(p, /现有画像/);
  assert.match(p, /本会话：群整体很欢乐/);
  assert.match(p, /张三 \(OID123\)：嘴甜会夸人/);
});

test('endOfTurn: LLM 幻觉的 openid 被校正到同昵称的真实发言人', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [{ content: '五笑又在钓鱼', importance: 3, actor: '花咲蝶舞（五笑）' }],
      // LLM 抄错 openid：真实是 REAL_OID，它写了 FAKE_OID
      profiles: [{ actor: '花咲蝶舞（五笑） (FEDCBA0987654321)', text: '爱整活的群友' }],
    }),
  });
  brain.ingest('g1', { userText: '钓个鱼', assistantText: '咕嘟', actor: '花咲蝶舞（五笑） (ABCDEF1234567890)', at: NOW });
  await brain.endOfTurn('g1');
  const people = store.people().filter((p) => p.kind === 'person');
  assert.equal(people.length, 1);
  assert.equal(people[0]!.openid, 'ABCDEF1234567890'); // 落到真实 openid，不是幻觉值
});

test('endOfTurn: openid 与昵称都对不上 → 退化为会话级画像不造幽灵人', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [],
      profiles: [{ actor: '不存在的路人 (1111AAAA2222BBBB)', text: '幻觉画像' }],
    }),
  });
  brain.ingest('g1', { userText: 'hi', assistantText: '咕嘟', actor: '张三 (ABCDEF1234567890)', at: NOW });
  await brain.endOfTurn('g1');
  assert.equal(store.people().filter((p) => p.kind === 'person').length, 0);
  assert.equal(store.profileOf('g1'), '幻觉画像'); // 落到 sess: 兜底
});

// ── 评分纠偏：相关性门控 ──
test('retrieval: 热度不再撑起排名——无关高热记忆排在相关冷记忆之后且不被强化', () => {
  const { store } = tmpStore();
  // 高热但无关的记忆（与查询仅共享「家」unigram，cos 刚过门槛）
  const hot = store.addNote('s1', { content: '大伙定的那家烧烤店今晚聚餐', importance: 5 }, NOW);
  for (let i = 0; i < 9; i++) store.reinforceById(hot.id, 1, 10, NOW); // strength→cap, hits=9
  store.addNote('s1', { content: '用户阿澈养了一只橘猫，名叫年糕', importance: 4 }, NOW - 20 * DAY);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '我家猫叫什么');
  // 相关命中排第一；高热无关记忆即便入围也排后
  assert.match(ctx.hits[0]!.content, /年糕/);
  // rel < reinforceMinCos 的命中不做强化：hits 停在 9 不再涨
  const hotAfter = store.noteById(hot.id)!;
  assert.equal(hotAfter.hits, 9);
});

// ── 跨会话召回 ──
test('assemble: 发言人在其他会话的 attitude/semantic 被跨群召回，episodic 不外溢', () => {
  const { store } = tmpStore();
  store.addNote('s2', { content: '张三喜欢收集旧游戏机', importance: 4, kind: 'semantic', actor: '张三 (ABCDEF1234567890)' }, NOW);
  store.addNote('s2', { content: '对张三：嘴上嫌弃其实信任', importance: 4, kind: 'attitude', actor: '张三 (ABCDEF1234567890)' }, NOW);
  store.addNote('s2', { content: '张三昨天在群里发了个旧游戏机梗图', importance: 3, kind: 'episodic', actor: '张三 (ABCDEF1234567890)' }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '旧游戏机', { nick: '张三', openid: 'ABCDEF1234567890' });
  const joined = ctx.memoryLines.join('\n');
  assert.match(joined, /跨群/);
  assert.match(joined, /张三喜欢收集旧游戏机/);
  assert.ok(!/梗图/.test(joined)); // episodic 不跨群
});

// ── 画像同名归并 ──
test('assemble: 同人多 openid 画像按 name 归并注入', () => {
  const { store } = tmpStore();
  store.setProfileEntry(userProfileKey('OID_A'), 'demo是群主人爱较真', { sessionId: 'g1', name: 'demo' });
  store.setProfileEntry(userProfileKey('OID_B'), 'demo爱拿鲸鱼娘体型调侃', { sessionId: 'g2', name: 'demo' });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('g1', 'hi', { nick: 'demo', openid: 'OID_B' });
  const profileLine = ctx.memoryLines.find((l) => l.startsWith('- [画像]'))!;
  assert.match(profileLine, /群主人/);
  assert.match(profileLine, /体型调侃/);
});

// ── 语义向量：embedding 命中与回退 ──
import { Embedder } from '../src/brain/embed.ts';
import type { EmbedFetchLike } from '../src/brain/embed.ts';

function mockEmbedder(vecs: number[][]) {
  const f: EmbedFetchLike = async (_url, init) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: vecs.map((embedding, index) => ({ embedding, index })) }),
  });
  return new Embedder({ enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000 }, f);
}

test('embed: 向量是派生态——不进 op 流水，随快照(base64)持久化', () => {
  const { dir, store } = tmpStore();
  const n = store.addNote('s1', { content: '用户讨厌香菜', importance: 3 }, NOW);
  store.setEmbedding(n.id, [0.1, 0.9, 0.2]);
  // 事件流水不含 embed 噪音
  assert.equal(store.recentOps(50).some((o) => o.op.op === 'embed'), false);
  // 未压缩前 jsonl 无 embed 行；快照持久化后可重载（精度 f32）
  store.flush();
  const raw = readFileSync(join(dir, 'brain.snapshot.json'), 'utf8');
  assert.match(raw, /"e":"[A-Za-z0-9+/=]+"/);
  assert.equal(raw.includes('[0.1,0.9,0.2]'), false);
  const store2 = new BrainStore(dir);
  const v = store2.noteById(n.id)!.embedding!;
  assert.ok(Math.abs(v[0]! - 0.1) < 1e-6 && Math.abs(v[1]! - 0.9) < 1e-6);
});

test('assemble: queryVec 命中带向量的记忆走语义余弦，正交向量被 embedMinCos 过滤', () => {
  const { store } = tmpStore();
  const a = store.addNote('s1', { content: '用户阿澈养了一只橘猫', importance: 3 }, NOW);
  const b = store.addNote('s1', { content: '量子场论研讨纪要', importance: 5 }, NOW);
  store.setEmbedding(a.id, [1, 0]);
  store.setEmbedding(b.id, [0, 1]);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '猫', undefined, [0.95, 0.05]);
  assert.equal(ctx.hits.length, 1);
  assert.match(ctx.hits[0]!.content, /橘猫/);
});

test('endOfTurn: embedder 启用时新记忆自动取向量，未启用不取', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({ memories: [{ content: '用户决定晨跑', importance: 4 }] }),
    embedder: mockEmbedder([[0.5, 0.5]]),
  });
  brain.ingest('s1', { userText: '我晨跑了', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.deepEqual(store.allNotes()[0]!.embedding, [0.5, 0.5]);

  const { store: s2 } = tmpStore();
  const brain2 = new Brain({
    store: s2, now,
    distiller: mockDistiller({ memories: [{ content: '用户决定晨跑', importance: 4 }] }),
    embedder: new Embedder({ enabled: true, baseUrl: '', apiKey: '', model: 'm', timeoutMs: 1000 }),
  });
  brain2.ingest('s1', { userText: '我晨跑了', assistantText: '咕嘟', at: NOW });
  await brain2.endOfTurn('s1');
  assert.equal(s2.allNotes()[0]!.embedding, undefined);
});

// ── 会话滚动摘要 ──
function mockDigestDistiller(digestText: string, distillResult: object) {
  return new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => ({
      ok: true, status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: init.body.includes('会话脉络整理模块') ? digestText : JSON.stringify(distillResult),
          },
        }],
      }),
    }),
  );
}

test('digest: 累计轮数到阈值触发摘要，assemble 注入会话脉络', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDigestDistiller('最近在聊山姆囤货和鲸鱼尾巴', { memories: [] }),
    config: { digestEveryTurns: 2 },
  });
  brain.ingest('s1', { userText: '山姆买啥', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.digestOf('s1'), undefined); // 第 1 轮未达阈值
  brain.ingest('s1', { userText: '尾巴好吃吗', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.digestOf('s1')!.text, '最近在聊山姆囤货和鲸鱼尾巴');
  assert.equal(store.digestOf('s1')!.uptoTurn, 2);
  const ctx = brain.assemble('s1', 'hi');
  assert.match(ctx.digest, /山姆囤货/);
});

test('digest: digestEveryTurns=0 时不触发', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDigestDistiller('摘要', { memories: [] }),
    config: { digestEveryTurns: 0 },
  });
  for (let i = 0; i < 5; i++) {
    brain.ingest('s1', { userText: 'hi', assistantText: '咕嘟', at: NOW });
    await brain.endOfTurn('s1');
  }
  assert.equal(store.digestOf('s1'), undefined);
});

test('digest: 摘要随快照持久化', () => {
  const { dir, store } = tmpStore();
  store.setDigest('s1', '会话脉络文本', 15);
  const store2 = new BrainStore(dir);
  assert.equal(store2.digestOf('s1')!.text, '会话脉络文本');
  assert.equal(store2.digestOf('s1')!.uptoTurn, 15);
});

test('assemble: emb 低相关命中过 embedMinCos 但不达 reinforceMinEmbedCos 不强化', () => {
  const { store } = tmpStore();
  const n = store.addNote('s1', { content: '普通条目', importance: 3 }, NOW);
  // cos([0.95,0.05],[0.8,0.2])≈0.97 高强化的对照组不需要；这里构造 rel≈0.48 的命中：
  // 与 queryVec [1,0] 成约 0.49 余弦的向量 [0.49,0.87]
  store.setEmbedding(n.id, [0.49, 0.87]);
  const brain = new Brain({ store, distiller: mockDistiller({}), now, config: { embedMinCos: 0.4 } });
  const ctx = brain.assemble('s1', 'x', undefined, [1, 0]);
  assert.equal(ctx.hits.length, 1);              // rel≈0.49 ≥ 0.4 入围
  assert.equal(store.noteById(n.id)!.hits, 0);   // 但 < 0.5 不强化
});

test('store: 单条画像文本 500 字硬截断，防修订膨胀', () => {
  const { store } = tmpStore();
  const long = '长'.repeat(800);
  store.setProfileEntry(userProfileKey('OID_LONG'), long, { sessionId: 's1', name: 'x' });
  assert.equal(store.profileOf(userProfileKey('OID_LONG')).length, 500);
  store.setProfile('s1', long); // sess 路径同样截断
  assert.equal(store.profileOf('s1').length, 500);
});

test('store: 画像截断优先句末收束，不从句子中间切断', () => {
  const { store } = tmpStore();
  // 末句从 480 字处开始、绵延超过上限：应停在 480 处的句末，不剩半截话
  const head = '稳'.repeat(480) + '。';
  const text = head + '尾句还在说半截话'.repeat(60);
  store.setProfile('s1', text);
  assert.equal(store.profileOf('s1'), head);
  // 上限内最后一个标点太靠前（<40%）时仍硬切，保住信息量
  const early = '短句。' + 'x'.repeat(800);
  store.setProfile('s1', early);
  assert.equal(store.profileOf('s1').length, 500);
});

test('buildDistillPrompt: 画像边界提示——时效信息进记忆不进画像', () => {
  const p = buildDistillPrompt(
    [{ userText: '明天早八', assistantText: '咕嘟', at: NOW }], '大肥鱼', 5,
  );
  assert.match(p, /长期成立的判断/);
  assert.match(p, /时效性信息/);
});

test('buildProfileReviewPrompt: 连旧画像一并审查，不只过滤本轮新增', () => {
  const p = buildProfileReviewPrompt([
    { actor: '张三 (ABCDEF1234567890)', previous: '性格随和，最近课表周二早八', candidate: '性格随和，最近课表周二早八' },
  ]);
  assert.match(p, /旧画像也必须重新审查/);
  assert.match(p, /性格随和，最近课表周二早八/);
  assert.match(p, /稳定的作息习惯可以保留/);
});

test('endOfTurn: 画像草稿经二次审核后才落盘，旧画像只含时效信息可清除', async () => {
  const { dir, store } = tmpStore();
  store.setProfile('s1', '最近课表周二早八');
  let reviews = 0;
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const auditing = prompt.includes('长期人物画像的编辑');
      if (auditing) reviews++;
      const content = auditing
        ? JSON.stringify({ profiles: [{ index: 0, text: '' }] })
        : JSON.stringify({ memories: [{ content: '用户本周课表周二早八', importance: 2 }] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  brain.ingest('s1', { userText: '记住这周课表', assistantText: '好', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.profileOf('s1'), '');
  assert.equal(store.allNotes()[0]!.content, '用户本周课表周二早八');
  assert.equal(reviews, 1);
  // 没有画像更新时，不应每轮多发一次审核请求。
  brain.ingest('s1', { userText: '你好', assistantText: '好', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(reviews, 1);
  assert.equal(new BrainStore(dir).profileOf('s1'), '');
});

test('endOfTurn: 审核失败时不让未经审核的画像覆盖旧画像', async () => {
  const { store } = tmpStore();
  store.setProfile('s1', '稳定偏好：喜欢民谣');
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('长期人物画像的编辑')
        ? '{"profiles":[]}'
        : JSON.stringify({ memories: [], profiles: [{ text: '最近课表周二早八' }] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  brain.ingest('s1', { userText: '最近课表变了', assistantText: '知道了', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.profileOf('s1'), '稳定偏好：喜欢民谣');
});

test('consolidate: 语义巩固产出的画像也必须先审核', async () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '张三喜欢听民谣', importance: 4 }, NOW - 3 * DAY);
  let reviews = 0;
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const auditing = prompt.includes('长期人物画像的编辑');
      if (auditing) reviews++;
      const content = auditing
        ? JSON.stringify({ profiles: [{ index: 0, text: '喜欢听民谣' }] })
        : JSON.stringify({ memories: [], profiles: [{ text: '喜欢听民谣，最近课表周二早八' }] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  await brain.consolidate('s1');
  assert.equal(reviews, 1);
  assert.equal(store.profileOf('s1'), '喜欢听民谣');
});

test('consolidate: 已被吸收的 episodic 不再触发重复巩固', async () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '张三喜欢听民谣', importance: 4 }, NOW - 3 * DAY);
  let calls = 0;
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      calls++;
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('长期人物画像的编辑')
        ? '{"profiles":[]}'
        : JSON.stringify({ memories: [{ content: '张三爱民谣', importance: 3, actor: '张三' }], profiles: [] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  assert.deepEqual(brain.sessionsNeedingConsolidation(), ['s1']);
  assert.equal(await brain.consolidate('s1'), 1);
  // 同一批 episodic 已被 semantic 吸收：不再列入巩固、不再调用 LLM
  assert.deepEqual(brain.sessionsNeedingConsolidation(), []);
  const callsAfter = calls;
  assert.equal(await brain.consolidate('s1'), 0);
  assert.equal(calls, callsAfter);
  // 新的 episodic 到期后恢复巩固资格
  store.addNote('s1', { content: '张三开始学吉他', importance: 3 }, NOW - 2 * DAY);
  assert.deepEqual(brain.sessionsNeedingConsolidation(), ['s1']);
});

test('reviewProfiles: 索引重复或条数缺失时整体失败，不落部分画像', async () => {
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '{"profiles":[{"index":0,"text":"a"},{"index":0,"text":"b"}]}' } }] }),
    }),
  );
  assert.equal(await distiller.reviewProfiles([
    { previous: '', candidate: 'a' }, { previous: '', candidate: 'b' },
  ]), undefined);
});
