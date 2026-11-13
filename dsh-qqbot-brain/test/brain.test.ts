import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain/index.ts';
import { BrainStore } from '../src/brain/store.ts';
import { Distiller, buildDistillPrompt, buildConsolidatePrompt, buildDigestPrompt, buildProfileReviewPrompt, parseDistillOutput } from '../src/brain/distill.ts';
import { ageLabel, formatClock, formatShort, formatStamp } from '../src/brain/time.ts';
import { SessionCapture, parseSenderTag } from '../src/capture/events.ts';
import type { PromptInjector } from '../src/inject/prompt.ts';
import { retention } from '../src/brain/decay.ts';
import { EmotionEngine } from '../src/brain/emotion.ts';
import { DAY_MS, DEFAULT_BRAIN_CONFIG, MOODS, RECALL_INTENT_RE } from '../src/brain/types.ts';

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

test('personas: characterId 随创建/编辑/备份往返，缺省回落人设 id', () => {
  const { dir, store } = tmpStore();
  const gentle = store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  assert.equal(gentle.characterId, 'whale');
  // PATCH 不传 characterId → 保留旧值；传 null/空串 → 清除回缺省
  store.savePersona('whale-gentle', '温柔版', '温柔二版');
  assert.equal(store.personaEntry('whale-gentle')!.characterId, 'whale');
  store.savePersona('whale-gentle', '温柔版', '温柔二版', { characterId: null });
  assert.equal(store.personaEntry('whale-gentle')!.characterId, undefined);
  // 独立角色人设：不显式给 characterId 时自我轨按人设 id 隔离
  const ye = store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  assert.equal(ye.characterId, undefined);
  store.flush();
  const restored = new BrainStore(dir);
  assert.equal(restored.personaEntry('ye-shunguang')!.id, 'ye-shunguang');
  rmSync(dir, { recursive: true });
});

test('self 标记：addNote 启发式兜底，快照/JSONL 回放对存量补标且显式 false 不被覆盖', () => {
  const { dir, store } = tmpStore();
  // LLM 显式 self 优先；启发式补「我」；世界事实不标
  const a = store.addNote('s1', { content: '我答应过讲睡前故事', importance: 3 }, NOW);
  assert.equal(a.self, true);
  const b = store.addNote('s1', { content: '我其实是外星人', importance: 3, self: false }, NOW);
  assert.equal(b.self, false); // 显式世界轨修正语义
  const c = store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 3 }, NOW);
  assert.equal(c.self, undefined);
  // attitude 恒走自我轨不写 self
  const d = store.addNote('s1', { content: '对张三：信任', importance: 3, kind: 'attitude' }, NOW);
  assert.equal(d.self, undefined);
  store.flush();
  const restored = new BrainStore(dir);
  assert.equal(restored.noteById(a.id)!.self, true);
  assert.equal(restored.noteById(b.id)!.self, false);
  assert.equal(restored.noteById(d.id)!.self, undefined);
  rmSync(dir, { recursive: true });
});

test('migrateTracks: whale 系人设补 characterId=whale，幂等且不动其他人设', () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle');
  store.createPersona('依恋版', '依恋', 'whale-devotion');
  store.setPersona('原版'); // legacy 条目
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const migrated = brain.migrateTracks();
  assert.deepEqual([...migrated].sort(), ['legacy', 'whale-devotion', 'whale-gentle']);
  for (const id of ['legacy', 'whale-gentle', 'whale-devotion']) {
    assert.equal(store.personaEntry(id)!.characterId, 'whale');
  }
  assert.equal(store.personaEntry('ye-shunguang')!.characterId, undefined);
  // 幂等：再跑结果为空
  assert.deepEqual(brain.migrateTracks(), []);
});

// ── 导出 / 导入 ──
test('export/import: 整包往返一致，衰减字段保留', () => {
  const { store } = tmpStore();
  const note = store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 4 }, NOW - 5 * DAY);
  const tracked = store.addNote('s1', { content: '依恋版时期的态度', kind: 'attitude', personaId: 'v2', importance: 3 }, NOW);
  // 迭代A字段：self 标记 + 人设 characterId 随整包往返
  const selfNote = store.addNote('s1', { content: '我答应过讲睡前故事', importance: 3, personaId: 'v2' }, NOW);
  const ver = store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.markAbsorbed([note.id], NOW - 2 * DAY);
  store.reinforceById(note.id, 1, 10, NOW - DAY);
  store.setProfile('s1', '阿澈：软件工程大二');
  store.setPersona('大肥鱼人设');
  const dump = JSON.parse(JSON.stringify(store.exportData(NOW)));

  const { store: target } = tmpStore();
  const r = target.importData(dump, 'merge', NOW);
  assert.equal(r.notes, 3);
  const got = target.noteById(note.id)!;
  assert.equal(got.content, '用户养了一只橘猫叫年糕');
  assert.equal(got.strength, store.noteById(note.id)!.strength);
  assert.equal(got.lastAccessAt, store.noteById(note.id)!.lastAccessAt);
  assert.equal(got.absorbedAt, NOW - 2 * DAY);
  assert.equal(target.noteById(tracked.id)!.personaId, 'v2');
  assert.equal(target.noteById(selfNote.id)!.self, true);
  assert.equal(target.personaEntry(ver.id)!.characterId, 'whale');
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

test('parseDistillOutput: 人设 moods 允许集——收自定义词、拒表外词（含全局表词）', () => {
  const moods = ['平静', '心疼', '想念'];
  const r = parseDistillOutput(JSON.stringify({
    memories: [],
    emotion: { label: '心头一酸', mood: '心疼', v: -0.4, a: 0.3, d: 0 },
  }), moods);
  assert.equal(r.emotion?.mood, '心疼');
  // 「炸毛」在全局 MOODS 但不在该人设允许集 → 丢弃
  const r2 = parseDistillOutput(JSON.stringify({
    memories: [],
    emotion: { label: '气鼓鼓', mood: '炸毛', v: -0.6, a: 0.7, d: 0.2 },
  }), moods);
  assert.equal(r2.emotion?.mood, undefined);
  // 反向：「想念」是自定义词，走默认 MOODS 校验同样被拒
  const r3 = parseDistillOutput(JSON.stringify({
    memories: [],
    emotion: { label: '有点想念', mood: '想念', v: -0.2, a: 0.4, d: 0 },
  }));
  assert.equal(r3.emotion?.mood, undefined);
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

// ── 三轨：世界共享·自我轨按角色隔离（迭代A）──
test('assemble: 同角色不同人设版本共享自我轨，跨角色自我轨互不可见', () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('依恋版', '依恋', 'whale-devotion', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang', { characterId: 'ye' });
  store.activatePersona('whale-gentle');
  // 世界轨：跨角色共享
  store.addNote('g1', { content: '张三上周请客吃了烤鱼', importance: 3 }, NOW);
  // 自我轨：whale 角色两条（不同人设版本戳）+ ye 角色一条
  store.addNote('g1', { content: '对张三：嘴上嫌弃其实信任', importance: 4, kind: 'attitude' }, NOW);
  store.addNote('g1', { content: '我答应过每晚给群友讲睡前故事', importance: 4, self: true, personaId: 'whale-devotion' }, NOW);
  store.addNote('g1', { content: '我来自叶瞬光的世界观', importance: 4, self: true, personaId: 'ye-shunguang' }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // 温柔版视角：whale 自我轨全量可见（含 devotion 戳的 self 与态度），ye 自我轨不可见
  const ctx = brain.assemble('g1', '张三 睡前故事 叶瞬光 烤鱼');
  assert.ok(ctx.attitudeLines.some((l) => l.includes('对张三')));
  assert.ok(ctx.hits.some((n) => n.content.includes('睡前故事')));
  assert.ok(!ctx.hits.some((n) => n.content.includes('叶瞬光的世界观')));
  assert.ok(ctx.memoryLines.some((l) => l.includes('烤鱼')));
  // 切依恋版（同角色 whale）：自我轨原样共享
  store.activatePersona('whale-devotion');
  const ctx2 = brain.assemble('g1', '睡前故事 叶瞬光', '张三');
  assert.ok(ctx2.attitudeLines.some((l) => l.includes('对张三')));
  assert.ok(ctx2.hits.some((n) => n.content.includes('睡前故事')));
  assert.ok(!ctx2.hits.some((n) => n.content.includes('叶瞬光的世界观')));
  // 切叶瞬光：whale 自我轨全部消失，世界轨仍在
  store.activatePersona('ye-shunguang');
  const ctx3 = brain.assemble('g1', '张三 睡前故事 烤鱼 叶瞬光');
  assert.ok(!ctx3.attitudeLines.some((l) => l.includes('对张三')));
  assert.ok(!ctx3.hits.some((n) => n.content.includes('睡前故事')));
  assert.ok(ctx3.hits.some((n) => n.content.includes('叶瞬光的世界观')));
  assert.ok(ctx3.memoryLines.some((l) => l.includes('烤鱼')));
});

test('self 启发式：含「我」的非态度记忆自动入自我轨，引号转述不误判', () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  store.activatePersona('ye-shunguang');
  // 启发式自标：第一人称内容→self:true→ye 不可见 whale 的？不——self 记忆归属按 personaId 戳
  const selfNote = store.addNote('g1', { content: '我答应过每晚讲睡前故事', importance: 4, personaId: 'whale-gentle' }, NOW);
  assert.equal(selfNote.self, true);
  const quoted = store.addNote('g1', { content: '群友说「我今天好累」，角色安慰了对方', importance: 3, personaId: 'whale-gentle' }, NOW);
  assert.equal(quoted.self, undefined); // 引号内转述不算自我内容
  const world = store.addNote('g1', { content: '用户养了一只橘猫叫年糕', importance: 3, personaId: 'whale-gentle' }, NOW);
  assert.equal(world.self, undefined);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('g1', '群友 安慰 年糕');
  assert.ok(!ctx.hits.some((n) => n.id === selfNote.id)); // whale 自我轨对 ye 不可见
  assert.ok(ctx.hits.some((n) => n.id === quoted.id));   // 世界轨共享
  assert.ok(ctx.hits.some((n) => n.id === world.id));
});

test('endOfTurn: 新记忆按批次人设打 personaId；mergeIndex 指不到他角色态度', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('依恋版', '依恋', 'whale-devotion', { characterId: 'whale' });
  store.activatePersona('whale-devotion');
  // 叶瞬光角色的态度：existing 列表已按角色过滤，mergeIndex=0 落空 → 新增而非改写旧轨
  store.addNote('s1', { content: '对内卷：极度反感', importance: 4, kind: 'attitude', personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [{ content: '对内卷：没那么反感了', importance: 4, kind: 'attitude', merge: 0 }],
    }),
  });
  brain.ingest('s1', { userText: '内卷好像也有点道理', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  const notes = store.allNotes();
  assert.equal(notes.length, 2);
  assert.equal(notes[0]!.content, '对内卷：极度反感');
  assert.equal(notes[1]!.content, '对内卷：没那么反感了');
  assert.equal(notes[1]!.personaId, 'whale-devotion');
});

test('endOfTurn: 批次戳——ingest 后切换人设，批次仍归形成时人设', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  store.activatePersona('whale-gentle');
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [{ content: '用户决定戒熬夜开始晨跑', importance: 4 }],
      emotion: { label: '得意', mood: '开心', v: 0.6, a: 0.5, d: 0.2 },
    }),
  });
  brain.ingest('s1', { userText: '我决定晨跑了', assistantText: '好耶', at: NOW });
  // 蒸馏前切人设：批次归属仍钉在形成时的 whale-gentle
  store.activatePersona('ye-shunguang');
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes()[0]!.personaId, 'whale-gentle');
  // 情绪戳同样归 whale：ye 视角读中性，切回 whale 可见
  assert.equal(brain.emotionOf('s1').label, '平静');
  store.activatePersona('whale-gentle');
  assert.equal(brain.emotionOf('s1').label, '得意');
});

test('endOfTurn: 同角色态度按对象归并——不同人设版本的「对X：」原位更新', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('依恋版', '依恋', 'whale-devotion', { characterId: 'whale' });
  store.activatePersona('whale-devotion');
  // 温柔版时期的同对象态度：同角色 → 兜底归并命中，原位更新不新增
  store.addNote('s1', { content: '对内卷：极度反感', importance: 4, kind: 'attitude', personaId: 'whale-gentle' }, NOW - 3 * DAY);
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [{ content: '对内卷：没那么反感了', importance: 4, kind: 'attitude' }],
    }),
  });
  brain.ingest('s1', { userText: '内卷好像也有点道理', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  const notes = store.allNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0]!.content, '对内卷：没那么反感了');
});

test('sweepNearDups: 同角色不同版本的近似态度合并，跨角色/跨类不合并', () => {
  const { store } = tmpStore();
  // 同角色 whale 两版本 + 跨角色 ye：全同向量，只有同角色才互并
  const a = store.addNote('s1', { content: '对张三：信任', importance: 3, kind: 'attitude', personaId: 'whale-gentle' }, NOW);
  const b = store.addNote('s1', { content: '对张三：信任', importance: 3, kind: 'attitude', personaId: 'whale-devotion' }, NOW);
  const f = store.addNote('s1', { content: '对张三：信任', importance: 3, kind: 'attitude', personaId: 'ye-shunguang' }, NOW);
  // 跨类不互并：与态度同向量的 semantic 世界事实不被自我轨吸收
  const e = store.addNote('s1', { content: '对张三：信任', importance: 3, kind: 'semantic', personaId: 'whale-devotion' }, NOW);
  for (const n of [a, b, f, e]) store.setEmbedding(n.id, [1, 0, 0]);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  brain.sweepNearDups();
  const rest = store.allNotes();
  assert.equal(rest.length, 3);
  assert.ok(rest.some((n) => n.id === f.id));                 // ye 自我轨独立幸存
  assert.ok(rest.some((n) => n.id === e.id && n.kind === 'semantic')); // 世界轨不被吸收
  assert.ok(rest.some((n) => n.id === a.id || n.id === b.id)); // whale 两版本并为一条
});

test('endOfTurn: mergeIndex 跨类指回落空——态度输出不改写事实记忆', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle');
  store.createPersona('依恋版', '依恋', 'whale-devotion');
  store.activatePersona('whale-devotion');
  // 存量事实可被 existing 指回，但蒸馏产出 attitude 时不能改写到事实轨
  const fact = store.addNote('s1', { content: '内卷是群里常聊的话题', importance: 3, kind: 'semantic' }, NOW - 3 * DAY);
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [{ content: '对内卷：没那么反感了', importance: 4, kind: 'attitude', merge: 0 }],
    }),
  });
  brain.ingest('s1', { userText: '内卷好像也有点道理', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  const notes = store.allNotes();
  assert.equal(notes.length, 2);
  const kept = notes.find((n) => n.id === fact.id)!;
  assert.equal(kept.kind, 'semantic');
  assert.equal(kept.content, '内卷是群里常聊的话题');
  const added = notes.find((n) => n.id !== fact.id)!;
  assert.equal(added.kind, 'attitude');
  assert.equal(added.personaId, 'whale-devotion');
});

test('endOfTurn: 批次戳与蒸馏提示词人设一致——切换后批内提示词仍用形成时人设', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔口吻XYZ', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶口吻ABC', 'ye-shunguang');
  store.activatePersona('whale-gentle');
  let prompt = '';
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"memories":[]}' } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  brain.ingest('s1', { userText: '你好', assistantText: '咕嘟', at: NOW });
  // 蒸馏前切到另一角色：归属戳 whale，提示词人设也应是 whale 而非当前活动 ye
  store.activatePersona('ye-shunguang');
  await brain.endOfTurn('s1');
  assert.ok(prompt.includes('温柔口吻XYZ'), '提示词应使用批次人设全文');
  assert.ok(!prompt.includes('叶口吻ABC'), '不应串用切换后的活动人设');
});

test('endOfTurn: 情绪枚举随批次人设 moods——ye 词表注入、whale 回落全局', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang', { moods: ['平静', '心疼', '想念'] });
  store.activatePersona('ye-shunguang');
  const prompts: string[] = [];
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      prompts.push((JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"memories":[]}' } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  brain.ingest('s1', { userText: '你好', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.match(prompts[0]!, /只选其一：平静\/心疼\/想念/);
  assert.ok(!prompts[0]!.includes('炸毛'), 'ye 批次不应出现 whale 词表');
  // 未配 moods 的人设回落全局 MOODS
  store.activatePersona('whale-gentle');
  brain.ingest('s1', { userText: '在吗', assistantText: '在', at: NOW });
  await brain.endOfTurn('s1');
  assert.match(prompts[1]!, /只选其一：平静\/开心\/兴奋\/害羞\/好奇\/委屈\/炸毛\/记仇\/难过/);
});

test('endOfTurn: 批次人设并列取较晚——交替切换时归属最后形成侧', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  store.activatePersona('whale-gentle');
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({ memories: [{ content: '用户决定晨跑', importance: 3 }] }),
  });
  brain.ingest('s1', { userText: 'a', assistantText: 'b', at: NOW });   // whale
  store.activatePersona('ye-shunguang');
  brain.ingest('s1', { userText: 'c', assistantText: 'd', at: NOW });   // ye
  store.activatePersona('whale-gentle');
  brain.ingest('s1', { userText: 'e', assistantText: 'f', at: NOW });   // whale
  store.activatePersona('ye-shunguang');
  brain.ingest('s1', { userText: 'g', assistantText: 'h', at: NOW });   // ye
  await brain.endOfTurn('s1');
  // 2:2 并列取较晚出现者 → ye
  assert.equal(store.allNotes()[0]!.personaId, 'ye-shunguang');
});

test('endOfTurn: 情绪盖章按批次角色过滤——他角色情绪不进本轨记忆快照', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  store.activatePersona('ye-shunguang');
  // whale 角色留下的情绪态：ye 批次不该盖它的章（否则 label/强度加权串台）
  store.setEmotion('s1', { v: 0.8, a: 0.7, d: 0.5, label: '得意忘形', mood: '开心', personaId: 'whale-gentle', updatedAt: NOW });
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({ memories: [{ content: '用户决定晨跑', importance: 3 }] }),
  });
  brain.ingest('s1', { userText: '我决定晨跑了', assistantText: '好', at: NOW });
  await brain.endOfTurn('s1');
  const n = store.allNotes()[0]!;
  assert.equal(n.personaId, 'ye-shunguang');
  assert.equal(n.emotion!.label, '平静'); // NEUTRAL 而非 whale 的「得意忘形」
});

test('graph: self 三态透传——显式世界轨 false 不被吞成自动', async () => {
  const { store } = tmpStore();
  const n = store.addNote('s1', { content: '我其实是外星人', self: false }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const g = await brain.graph('s1');
  assert.equal(g.notes.find((x) => x.id === n.id)!.self, false);
});

test('store: 低强度记忆重放不被地板抬升——strength sanitize 幂等', () => {
  const { dir, store } = tmpStore();
  const n = store.addNote('s1', { content: '随手记', importance: 1, strengthBoost: 0.1 }, NOW);
  assert.ok(n.strength < 0.5);
  store.flush();
  const store2 = new BrainStore(dir);
  assert.equal(store2.noteById(n.id)!.strength, n.strength);
});

test('purgeNotesByPersona: 按归属人设批量删除，缺 tag 存量按 whale-gentle 计', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '事实A', importance: 3, personaId: 'whale-gentle' }, NOW);
  store.addNote('s1', { content: '态度A', importance: 3, kind: 'attitude', personaId: 'whale-devotion' }, NOW);
  store.addNote('s1', { content: '无tag存量事实', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  assert.equal(brain.purgeNotesByPersona('whale-gentle'), 2);
  assert.equal(store.allNotes().length, 1);
  assert.equal(store.allNotes()[0]!.content, '态度A');
});

test('profile: 画像写入记录 lastWrittenByPersona 标签', () => {
  const { store } = tmpStore();
  store.setProfileEntry('u:abc', '张三：爱聊原神', { sessionId: 's1', name: '张三', personaId: 'whale-gentle' });
  assert.equal(store.profileEntry('u:abc')!.lastWrittenByPersona, 'whale-gentle');
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

test('buildDistillPrompt: 人设 moods 替换枚举并换通用指引（不套全局锚点）', () => {
  const turns = [{ userText: '你好', assistantText: '咕嘟', at: NOW }];
  const p = buildDistillPrompt(turns, '叶瞬光', 5,
    undefined, undefined, undefined, undefined, ['平静', '心疼', '想念']);
  assert.match(p, /只选其一：平静\/心疼\/想念/);
  assert.ok(!p.includes('炸毛'), '自定义词表不应出现全局表独有词');
  assert.match(p, /类别词义按角色设定理解/);
  assert.ok(!p.includes('被夸/被撩/被关心→害羞'), '不应套全局锚点');
  // 传全局 MOODS 原表仍走默认锚点（内容相同视为未自定义）
  const p2 = buildDistillPrompt(turns, '大肥鱼', 5,
    undefined, undefined, undefined, undefined, [...MOODS]);
  assert.match(p2, /被夸\/被撩\/被关心→害羞/);
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
  store.setEmotion('s2', { v: 0.5, a: 0.6, d: 0.2, label: '开心', mood: '开心', updatedAt: NOW });
  const brain = new Brain({ store, distiller: mockDistiller({}), defaultPersona: '大肥鱼人设', now });
  const ctx = brain.assemble('s1', '推荐首歌');
  assert.equal(ctx.persona, '大肥鱼人设');
  // 平静态省略情绪行（R10）；有非中性情绪时才渲染注入
  assert.equal(ctx.emotion, '');
  assert.match(brain.assemble('s2', 'x').emotion, /当前情绪/);
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
  // 正文只留当前消息；环境消息拆进 history 供蒸馏读背景，不再重复进 query/digest
  assert.equal(r.text, '收到 (@you)');
  assert.match(r.history!, /Chat history begins/);
  assert.match(r.history!, /早点睡/);
  assert.match(r.history!, /Chat history ends/);
  assert.ok(!r.text.includes('张三 (ABCDEF1234567890)]'));
});

test('parseSenderTag: history 超界取末段且按行裁切', () => {
  const lines = ['[Chat history begins]'];
  for (let i = 0; i < 30; i++) lines.push(`[人${i} (1111111AAAAA)] 第${i}条消息内容占位占位占位占位占位`);
  lines.push('[Chat history ends]', '[Current message]', '[张三 (ABCDEF1234567890)] 嗯');
  const r = parseSenderTag(lines.join('\n'));
  assert.equal(r.text, '嗯');
  assert.ok(r.history!.length <= 600);
  assert.match(r.history!, /^\[Chat history begins\]/);
  assert.ok(!r.history!.includes('第0条'));
  assert.match(r.history!, /第29条/);
});

test('parseSenderTag: 昵称含括号也能取到最后 (id) 组', () => {
  const r = parseSenderTag('[小鱼 (夜猫子) (ABCDEF1234567890)] 在吗');
  assert.equal(r.actor, '小鱼 (夜猫子) (ABCDEF1234567890)');
  assert.equal(r.text, '在吗');
});

test('parseSenderTag: 单聊裸文本 / 引用块提出并入正文', () => {
  const plain = parseSenderTag('今晚吃鱼');
  assert.equal(plain.actor, undefined);
  assert.equal(plain.text, '今晚吃鱼');
  // 无 tag 时原文整体当正文（单聊）
  const noTag = parseSenderTag('[Current message]\n裸文本无标签');
  assert.equal(noTag.actor, undefined);
  const quoted = parseSenderTag('[Quoted message begins]\nx\n[Quoted message ends]\n[Current message]\n[李四 (ABCDEF1234567891)] 裸文本');
  assert.equal(quoted.actor, '李四 (ABCDEF1234567891)');
  assert.match(quoted.text, /^\[引用\]x\n裸文本/);
  assert.equal(quoted.history, undefined);
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

test('prompt 槽位填充：实参含字面 %s 不导致后续槽位错位', () => {
  const notes = [{
    id: 'n1', sessionId: 's1', content: '记忆X', importance: 3,
    kind: 'episodic' as const, createdAt: NOW, strength: 1, hits: 0, lastAccessAt: NOW,
  }];
  // 旧链式 replace 会把 list 填进画像里的 %s，尾部槽位留下字面 %s
  const p = buildConsolidatePrompt(notes, '画像里有 %s 占位符', '人设%s', { now: NOW, timeZone: 'Asia/Shanghai' });
  assert.match(p, /人设%s/);
  assert.match(p, /画像里有 %s 占位符/);
  assert.match(p, /- \[1分钟前\] 记忆X/);
  const d = buildDigestPrompt(
    [{ at: NOW, userText: '带 %s 的消息', assistantText: '回', actor: 'u:1' }],
    '先前摘要', '人设', { now: NOW, timeZone: 'Asia/Shanghai' });
  assert.match(d, /带 %s 的消息/);
  assert.match(d, /先前摘要/);
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
import { splitActor, resolveActorTag, userProfileKey } from '../src/brain/identity.ts';
import { appendFileSync, writeFileSync } from 'node:fs';

test('splitActor: 拆出昵称与 openid，昵称含括号也能取到末尾 id 组', () => {
  assert.deepEqual(splitActor('张三 (ABCDEF1234567890)'), { nick: '张三', openid: 'ABCDEF1234567890' });
  assert.deepEqual(splitActor('小鱼 (夜猫子) (ABCDEF1234567890)'), { nick: '小鱼 (夜猫子)', openid: 'ABCDEF1234567890' });
  assert.deepEqual(splitActor('裸昵称'), { nick: '裸昵称', openid: undefined });
});

test('resolveActorTag: 裸昵称回填全 tag；已带 openid/查无此人原样', () => {
  const tags = ['花咲蝶舞（五笑） (ABCDEF1234567890)', 'demo (FEDCBA0987654321)'];
  assert.equal(resolveActorTag('花咲蝶舞（五笑）', tags), '花咲蝶舞（五笑） (ABCDEF1234567890)');
  assert.equal(resolveActorTag('demo (FEDCBA0987654321)', tags), 'demo (FEDCBA0987654321)');
  assert.equal(resolveActorTag('路人甲', tags), '路人甲');
  assert.equal(resolveActorTag(undefined, tags), undefined);
  assert.equal(resolveActorTag('  ', tags), undefined);
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

test('endOfTurn: 蒸馏记忆裸昵称 actor 回填为本轮真实 昵称(openid) 全 tag', async () => {
  const { store } = tmpStore();
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [
        { content: '五笑爱整活', importance: 3, actor: '花咲蝶舞（五笑）' },
        { content: 'demo 是群主', importance: 3, actor: 'demo (FEDCBA0987654321)' },
        { content: '路人随口一句', importance: 3, actor: '路人甲' },
      ],
    }),
  });
  brain.ingest('g1', { userText: 'hi', assistantText: '咕嘟', actor: '花咲蝶舞（五笑） (ABCDEF1234567890)', at: NOW });
  brain.ingest('g1', { userText: 'hi2', assistantText: '咕嘟', actor: 'demo (FEDCBA0987654321)', at: NOW });
  await brain.endOfTurn('g1');
  const actors = store.allNotes().map((n) => n.actor);
  assert.ok(actors.includes('花咲蝶舞（五笑） (ABCDEF1234567890)'), '裸昵称应回填全 tag');
  assert.ok(actors.includes('demo (FEDCBA0987654321)'), '已带全 tag 原样保留');
  assert.ok(actors.includes('路人甲'), '查无对应发言人时原样保留裸昵称');
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

// ── 私聊发言人绑定（sess 画像卡 name）──
test('boundSpeakerNick: 取 sess 画像 name；未绑定/无画像返回空串', () => {
  const { store } = tmpStore();
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  assert.equal(brain.boundSpeakerNick('c2c'), '');
  store.setProfileEntry('sess:c2c', '私聊画像', { sessionId: 'c2c' });
  assert.equal(brain.boundSpeakerNick('c2c'), '');
  store.setProfileEntry('sess:c2c', '私聊画像', { sessionId: 'c2c', name: 'demo' });
  assert.equal(brain.boundSpeakerNick('c2c'), 'demo');
});

test('assemble: 私聊绑定后按昵称点亮 u:画像/态度保底/跨群语义召回；episodic 不跨会话', () => {
  const { store } = tmpStore();
  // 群聊沉淀：demo 的 u: 画像 + 态度 + 语义记忆 + 流水（openid 用真实 hex 形态）
  store.setProfileEntry(userProfileKey('FEFE5282E38BAB65FD11F7C87E5D50F2'), 'demo是群主，与角色恋人关系', { sessionId: 'g1', name: 'demo' });
  store.addNote('g1', { content: '对demo：嘴上嫌弃其实信任', importance: 4, kind: 'attitude', actor: 'demo (FEFE5282E38BAB65FD11F7C87E5D50F2)' }, NOW);
  store.addNote('g1', { content: 'demo：家里养了只橘猫', importance: 4, kind: 'semantic', actor: 'demo (FEFE5282E38BAB65FD11F7C87E5D50F2)' }, NOW);
  store.addNote('g1', { content: 'demo：昨晚发了张梗图', importance: 3, kind: 'episodic', actor: 'demo (FEFE5282E38BAB65FD11F7C87E5D50F2)' }, NOW);
  // 私聊会话已有 sess 画像但未绑定 → 群聊数据全部不可见（修复前行为）
  store.setProfileEntry('sess:c2c', 'demo 是角色的主人', { sessionId: 'c2c' });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const cold = brain.assemble('c2c', '橘猫');
  assert.ok(!cold.memoryLines.some((l) => l.includes('demo是群主')));
  assert.equal(cold.attitudeLines.length, 0);
  assert.ok(!cold.memoryLines.some((l) => l.includes('跨群')));
  // 画像卡绑定 name='demo' → nick 级读路径点亮
  store.setProfileEntry('sess:c2c', 'demo 是角色的主人', { sessionId: 'c2c', name: 'demo' });
  const ctx = brain.assemble('c2c', '橘猫');
  assert.match(ctx.memoryLines[0]!, /画像.*demo是群主/);
  assert.match(ctx.memoryLines[1]!, /会话画像.*demo 是角色的主人/);
  assert.ok(ctx.attitudeLines.some((l) => l.includes('对demo')));
  assert.ok(ctx.memoryLines.some((l) => l.includes('跨群') && l.includes('橘猫')));
  assert.ok(!ctx.memoryLines.some((l) => l.includes('梗图'))); // episodic 仍不跨会话
});

test('assemble: 显式 speaker 优先于绑定昵称', () => {
  const { store } = tmpStore();
  store.setProfileEntry(userProfileKey('DE10ABC123'), 'demo是群主', { sessionId: 'g1', name: 'demo' });
  store.setProfileEntry('sess:g1', '群画像', { sessionId: 'g1', name: 'demo' });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // 群聊里李四发言：绑定 demo 不应顶替真实发言人
  const ctx = brain.assemble('g1', 'hi', { nick: '李四', openid: 'OID_LS' });
  assert.ok(!ctx.memoryLines.some((l) => l.includes('demo是群主')));
});

test('endOfTurn: 绑定私聊蒸馏可见该人 u: 画像；昵称歧义草稿仍落 sess:', async () => {
  const { store } = tmpStore();
  // 'demo' 对应两张 u: 画像（真实线上：同人多 openid 碎片）
  store.setProfileEntry(userProfileKey('FEFE5282E38BAB65FD11F7C87E5D50F2'), 'demo画像：自律爱学习', { sessionId: 'g1', name: 'demo' });
  store.setProfileEntry(userProfileKey('99449CA8F9BBA79926C9A9B55D4504C2'), 'demo画像：爱发表情包', { sessionId: 'g2', name: 'demo' });
  store.setProfileEntry('sess:c2c', '私聊旧画像', { sessionId: 'c2c', name: 'demo' });
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({
      memories: [],
      profiles: [{ actor: 'demo', text: '私聊新画像' }],
    }),
  });
  brain.ingest('c2c', { userText: 'hi', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('c2c');
  // 草稿昵称歧义 → sess: 兜底不造幽灵；u: 画像文本不被私聊蒸馏改写
  assert.equal(store.profileOf('c2c'), '私聊新画像');
  assert.equal(store.profileOf(userProfileKey('FEFE5282E38BAB65FD11F7C87E5D50F2')), 'demo画像：自律爱学习');
  // u: 画像已审内容首次在绑定会话出现 → 补会话归属簿记
  assert.ok(store.people().find((p) => p.openid === 'FEFE5282E38BAB65FD11F7C87E5D50F2')!.sessions.includes('c2c'));
});

test('endOfTurn: 绑定私聊 convo 行显示绑定昵称而非「用户」', async () => {
  const { store } = tmpStore();
  store.setProfileEntry('sess:c2c', '私聊画像', { sessionId: 'c2c', name: 'demo' });
  let seen = '';
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_u, init) => {
      const p = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      // 只取蒸馏 prompt——后续的画像审核调用会覆盖
      if (p.includes('记忆提炼模块')) seen = p;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"memories":[]}' } }] }) };
    },
  );
  const brain = new Brain({ store, now, distiller });
  brain.ingest('c2c', { userText: '想我了没', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('c2c');
  assert.match(seen, /demo：想我了没/);
  assert.ok(!seen.includes('用户：想我了没'));
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

test('buildProfileReviewPrompt: 审核默认保留而非逢审必改', () => {
  const p = buildProfileReviewPrompt([{ previous: '稳定画像', candidate: '稳定画像' }]);
  assert.match(p, /默认原样保留/);
  assert.match(p, /不为改而改/);
});

test('buildDistillPrompt: 单聊不再要求会话整体画像', () => {
  const p = buildDistillPrompt(
    [{ userText: 'hi', assistantText: '咕嘟', at: NOW }], '大肥鱼', 5,
  );
  assert.match(p, /单聊不必输出此条/);
});

test('buildProfileReviewPrompt: 连旧画像一并审查，不只过滤本轮新增', () => {
  const p = buildProfileReviewPrompt([
    { actor: '张三 (ABCDEF1234567890)', previous: '性格随和，最近课表周二早八', candidate: '性格随和，最近课表周二早八' },
  ]);
  assert.match(p, /逐条核对原画像和草稿/);
  assert.match(p, /性格随和，最近课表周二早八/);
  assert.match(p, /拿不准的一律保留/);
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

test('endOfTurn: 解析到同一会话键的多条画像草稿合并审核，不互相覆盖', async () => {
  const { store } = tmpStore();
  // 两个同名 demo 发言人 → 昵称歧义，actor 为「demo」的画像退化 sess: 键
  store.addNote('g1', { content: 'a', importance: 3, actor: 'demo (ABCDEF1234567890)' }, NOW);
  store.addNote('g1', { content: 'b', importance: 3, actor: 'demo (FEDCBA0987654321)' }, NOW);
  let reviewItems: { index: number; candidate: string }[] = [];
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      let content;
      if (prompt.includes('长期人物画像的编辑')) {
        const raw = prompt.slice(prompt.indexOf('待整理画像') + '待整理画像（actor 仅用于区分人物，不得修改身份）：'.length).trim();
        reviewItems = JSON.parse(raw) as typeof reviewItems;
        content = JSON.stringify({ profiles: reviewItems.map((it) => ({ index: it.index, text: it.candidate })) });
      } else {
        content = JSON.stringify({ memories: [], profiles: [
          { actor: 'demo', text: '爱抬杠的主人' },
          { text: '群里氛围爱玩梗' },
        ] });
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  brain.ingest('g1', { userText: 'hi', assistantText: '咕嘟', actor: 'demo (ABCDEF1234567890)', at: NOW });
  await brain.endOfTurn('g1');
  assert.equal(reviewItems.length, 1);
  assert.match(reviewItems[0]!.candidate, /爱抬杠的主人\n群里氛围爱玩梗/);
  assert.equal(store.profileOf('g1'), '爱抬杠的主人\n群里氛围爱玩梗');
});

test('mergeProfiles: 双卡合并为审核后文本并吸收会话标记，源卡删除', async () => {
  const { store } = tmpStore();
  store.setProfileEntry(userProfileKey('OID_A'), '画像A', { sessionId: 's1', name: 'demo' });
  store.setProfileEntry(userProfileKey('OID_B'), '画像B', { sessionId: 's2', name: 'demo' });
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '{"profiles":[{"index":0,"text":"合并后画像"}]}' } }] }),
    }),
  );
  const brain = new Brain({ store, distiller, now });
  assert.equal(await brain.mergeProfiles(userProfileKey('OID_A'), userProfileKey('OID_B')), true);
  assert.equal(store.profileOf(userProfileKey('OID_A')), '合并后画像');
  assert.equal(store.profileOf(userProfileKey('OID_B')), '');
  const keep = store.people().find((p) => p.key === userProfileKey('OID_A'));
  assert.deepEqual([...keep!.sessions].sort(), ['s1', 's2']);
});

test('mergeProfiles: 审核失败时不改任何画像', async () => {
  const { store } = tmpStore();
  store.setProfileEntry(userProfileKey('OID_A'), '画像A', { sessionId: 's1', name: 'demo' });
  store.setProfileEntry(userProfileKey('OID_B'), '画像B', { sessionId: 's2', name: 'demo' });
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '{"profiles":[]}' } }] }),
    }),
  );
  const brain = new Brain({ store, distiller, now });
  assert.equal(await brain.mergeProfiles(userProfileKey('OID_A'), userProfileKey('OID_B')), false);
  assert.equal(store.profileOf(userProfileKey('OID_A')), '画像A');
  assert.equal(store.profileOf(userProfileKey('OID_B')), '画像B');
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

// ── token 成本优化（11-02-llm-token-audit）──

test('capture: 群聊 history 块拆进 Turn.contextText，userText 只留当前正文', async () => {
  const ingested: Array<{ userText: string; contextText?: string }> = [];
  const brain = {
    ingest: (_s: string, t: { userText: string; contextText?: string }) => { ingested.push(t); },
    endOfTurn: async () => {},
  };
  const injector = { noteAgentSession: () => {}, noteUserText: () => {} } as unknown as PromptInjector;
  let handler: (session: unknown, ev: unknown) => void = () => {};
  const ctx = { on: (_e: string, h: typeof handler) => { handler = h; } };
  const cap = new SessionCapture(brain as unknown as Brain, injector, () => {}, false);
  cap.register(ctx);
  const s = { id: 'g1' };
  const raw = [
    '[Chat history begins]', '[李四 (11111111AAAA)] 早点睡', '[Chat history ends]',
    '[Current message]', '[张三 (ABCDEF1234567890)] 收到',
  ].join('\n');
  handler(s, { type: 'user/message', data: { message: raw } });
  handler(s, { type: 'assistant/message', data: { message: '咕嘟' } });
  handler(s, { type: 'turn/end', data: {} });
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0]!.userText, '收到');
  assert.match(ingested[0]!.contextText!, /早点睡/);
});

test('buildDistillPrompt: contextText 作为背景块进 convo 之前', () => {
  const p = buildDistillPrompt(
    [{
      userText: '收到', assistantText: '咕嘟', actor: '张三 (ABCDEF1234567890)', at: NOW,
      contextText: '[Chat history begins]\n[李四 (111)] 早点睡\n[Chat history ends]',
    }],
    '大肥鱼', 5,
  );
  const ctxIdx = p.indexOf('早点睡');
  const convoIdx = p.indexOf('收到');
  assert.ok(ctxIdx > 0 && ctxIdx < convoIdx, '环境上下文应在正文之前且只出现一次');
  assert.equal(p.indexOf('早点睡'), p.lastIndexOf('早点睡'));
});

test('buildDigestPrompt: 单行截断且不含 contextText', () => {
  const long = '长'.repeat(500);
  const p = buildDigestPrompt(
    [{ userText: long, assistantText: long, at: NOW, contextText: '环境消息不应进摘要' }],
    '旧摘要', '大肥鱼', { now: NOW, timeZone: 'Asia/Shanghai' }, 300,
  );
  assert.ok(p.includes('…'), '超长行应被截断');
  assert.ok(!p.includes('环境消息不应进摘要'), 'contextText 不进 digest');
  assert.ok(!p.includes(long), '全文不应原样进入');
});

test('endOfTurn: distillEveryTurns 攒批，未达阈值不调用', async () => {
  const { store } = tmpStore();
  let calls = 0;
  let turnLines = 0;
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      if (prompt.includes('记忆提炼模块')) {
        calls++;
        turnLines = (prompt.match(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/g) ?? []).length;
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"memories":[]}' } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { distillEveryTurns: 2 } });
  brain.ingest('s1', { userText: '第一轮', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(calls, 0, '未达 2 轮不应蒸馏');
  brain.ingest('s1', { userText: '第二轮', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(calls, 1, '攒满 2 轮应一次蒸馏');
  assert.equal(turnLines, 2, '一次调用覆盖两轮');
});

test('画像审核章持久化：重启后存量画像不再重审', async () => {
  const { dir, store } = tmpStore();
  const mkDistiller = (counter: { review: number }) => new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      if (prompt.includes('长期人物画像的编辑')) {
        counter.review++;
        const raw = prompt.slice(prompt.indexOf('待整理画像') + '待整理画像（actor 仅用于区分人物，不得修改身份）：'.length).trim();
        const items = JSON.parse(raw) as { index: number; candidate: string }[];
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ profiles: items.map((i) => ({ index: i.index, text: i.candidate })) }) } }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"memories":[],"profiles":[{"text":"会话画像v1"}]}' } }] }) };
    },
  );
  const c1 = { review: 0 };
  const brain1 = new Brain({ store, distiller: mkDistiller(c1), now });
  brain1.ingest('s1', { userText: '你好', assistantText: '咕嘟', at: NOW });
  await brain1.endOfTurn('s1');
  assert.equal(c1.review, 1, '首次画像应审核');
  assert.equal(store.reviewedOf('sess:s1'), '会话画像v1', '审核章应已落盘');
  store.flush();
  // 模拟重启：重载 store + 新 Brain，同一画像内容不再触发审核调用
  const store2 = new BrainStore(dir);
  const c2 = { review: 0 };
  const brain2 = new Brain({ store: store2, distiller: mkDistiller(c2), now });
  brain2.ingest('s1', { userText: '又来', assistantText: '咕嘟', at: NOW });
  await brain2.endOfTurn('s1');
  assert.equal(c2.review, 0, '已审画像重启后不应重审');
  rmSync(dir, { recursive: true });
});

test('endOfTurn 向量：merge 目标重取向量，dup 命中不重复取向量', async () => {
  const { store } = tmpStore();
  const old = store.addNote('s1', { content: '用户喜欢猫', importance: 3 }, NOW);
  store.setEmbedding(old.id, [1, 0, 0]);
  const embedCalls: string[][] = [];
  const fake = {
    enabled: true,
    embed: async (texts: string[]) => { embedCalls.push(texts); return texts.map(() => [0.99, 0.05, 0]); },
    embedOne: async () => null,
  };
  const brain = new Brain({
    store,
    distiller: mockDistiller({ memories: [{ content: '用户其实很喜欢猫咪', importance: 3 }] }),
    embedder: fake as never,
    now,
  });
  brain.ingest('s1', { userText: '猫', assistantText: '咕嘟', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.allNotes().length, 1, '近重复应合并而非新增');
  // freshVecs 一次（新草稿判重）；dup 命中后不再对其重取向量
  assert.deepEqual(embedCalls.flat(), ['用户其实很喜欢猫咪']);
  // merge 路径：目标 content 被改写，需要重取向量
  const embedCalls2: string[][] = [];
  const fake2 = {
    enabled: true,
    embed: async (texts: string[]) => { embedCalls2.push(texts); return texts.map(() => [0.9, 0.1, 0]); },
    embedOne: async () => null,
  };
  const brain2 = new Brain({
    store,
    distiller: mockDistiller({ memories: [{ content: '用户非常喜欢猫咪', importance: 4, merge: 0 }] }),
    embedder: fake2 as never,
    now,
  });
  brain2.ingest('s1', { userText: '猫', assistantText: '咕嘟', at: NOW });
  await brain2.endOfTurn('s1');
  assert.ok(embedCalls2.flat().includes('用户非常喜欢猫咪'), 'merge 改写的目标应重取向量');
});

// ── 画像管理与记忆重置（11-02-profile-admin-memory-reset）──

test('del-range: 只删闭区间内记忆；op 携带 ids，重放不误删后入库的老记忆', () => {
  const { dir, store } = tmpStore();
  store.addNote('s1', { content: '区间内', importance: 3 }, NOW - 2 * DAY);
  store.addNote('s1', { content: '区间外早', importance: 3 }, NOW - 10 * DAY);
  store.addNote('s1', { content: '区间外晚', importance: 3 }, NOW);
  const ids = store.deleteNotesInRange(NOW - 3 * DAY, NOW - 1 * DAY);
  assert.equal(ids.length, 1);
  assert.ok(store.recentOps(10).some((o) => o.op.op === 'del-range'));
  assert.deepEqual(store.allNotes().map((n) => n.content).sort(), ['区间外早', '区间外晚']);
  // 关键回归：del-range 之后才入库、createdAt 却落在区间内的记忆，重放不得被误删
  // （若 op 存的是区间谓词而非显式 ids，重放会把它一并删掉）
  store.addNote('s1', { content: '补录的老记忆', importance: 3 }, NOW - 2 * DAY);
  store.flush();
  const reloaded = new BrainStore(dir);
  assert.deepEqual(reloaded.allNotes().map((n) => n.content).sort(), ['区间外早', '区间外晚', '补录的老记忆']);
  rmSync(dir, { recursive: true });
});

test('resetMemory: 清笔记/画像/情绪/摘要但保人设，重放一致；旧格式 reset 重放仍全清', () => {
  const { dir, store } = tmpStore();
  store.setPersona('人设内核');
  store.addNote('s1', { content: 'x', importance: 3 }, NOW);
  store.setProfileEntry(userProfileKey('OID1'), '画像', { sessionId: 's1', name: 'demo' });
  store.setEmotion('s1', { v: 0.5, a: 0.6, d: 0, label: '开心', updatedAt: NOW });
  store.setDigest('s1', '摘要', 10);
  store.resetMemory();
  assert.equal(store.allNotes().length, 0);
  assert.equal(store.people().length, 0);
  assert.equal(store.sessions().length, 0);
  assert.equal(store.digestOf('s1'), undefined);
  assert.equal(store.persona(), '人设内核');
  store.flush();
  const reloaded = new BrainStore(dir);
  assert.equal(reloaded.allNotes().length, 0);
  assert.equal(reloaded.people().length, 0);
  assert.equal(reloaded.persona(), '人设内核');
  assert.equal(reloaded.activePersonaId(), 'legacy');
  // 旧格式 reset op（无 keepPersona 字段，覆盖导入时代写的就是它）重放仍全清
  appendFileSync(join(dir, 'brain.jsonl'), JSON.stringify({ t: NOW, op: 'reset' }) + '\n');
  const legacy = new BrainStore(dir);
  assert.equal(legacy.persona(), '');
  assert.equal(legacy.listPersonas().length, 0);
  rmSync(dir, { recursive: true });
});

test('profile: 手工编辑置已审并保留名称/sessions，删除即清空', () => {
  const { store } = tmpStore();
  const key = userProfileKey('OID_E');
  store.setProfileEntry(key, '旧画像', { sessionId: 's1', name: '旧名' });
  const brain = new Brain({
    store,
    distiller: new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 1 }),
    now,
  });
  assert.equal(brain.updateProfile(key, { text: '手工新画像' }), true);
  assert.equal(store.profileOf(key), '手工新画像');
  assert.equal(store.profileEntry(key)!.reviewed, '手工新画像');
  assert.equal(store.profileEntry(key)!.name, '旧名');
  assert.deepEqual(store.profileEntry(key)!.sessions, ['s1']);
  assert.equal(brain.updateProfile(key, { name: '新名', text: '再改' }), true);
  assert.equal(store.profileEntry(key)!.name, '新名');
  // 显式空串即清空名称；不传 name（undefined）则沿用旧名
  assert.equal(brain.updateProfile(key, { name: '', text: '清名' }), true);
  assert.equal(store.profileEntry(key)!.name, '');
  // upsert：会话卡「画像未生成」态可手建——但键必须指向已知会话/发言人，防幽灵画像
  store.addNote('s1', { content: '存在过对话', importance: 3 }, NOW);
  assert.equal(brain.updateProfile('sess:s1', { text: '手建群像' }), true);
  assert.equal(store.profileOf('sess:s1'), '手建群像');
  assert.equal(store.profileEntry('sess:s1')!.sessions.includes('s1'), true);
  assert.equal(brain.updateProfile('u:nope', { text: 'x' }), false);
  assert.equal(brain.updateProfile('sess:nope', { text: 'x' }), false);
  assert.equal(brain.updateProfile(key, { text: '  ' }), false);
  assert.equal(brain.deleteProfile(key), true);
  assert.equal(store.hasProfile(key), false);
  assert.equal(brain.deleteProfile(key), false);
});

test('regenerateProfile: u: 键只归集该 openid 记忆，草稿送审后写回并置已审', async () => {
  const { store } = tmpStore();
  const key = userProfileKey('ABCDEF1234567890');
  store.setProfileEntry(key, '旧画像', { sessionId: 'g1', name: 'demo' });
  store.addNote('g1', { content: 'demo 是大学生住宿舍', importance: 4, actor: 'demo (ABCDEF1234567890)' }, NOW - DAY);
  store.addNote('g1', { content: '不相干的路人发言', importance: 4, actor: '路人 (FEDCBA0987654321)' }, NOW - DAY);
  let draftPrompt = '';
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('人物画像撰稿模块')
        ? (draftPrompt = prompt, '{"profile":"草稿画像"}')
        : '{"profiles":[{"index":0,"text":"审核后画像"}]}';
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  const r = await brain.regenerateProfile(key);
  assert.deepEqual(r, { ok: true });
  assert.ok(draftPrompt.includes('demo 是大学生住宿舍'), '草稿输入应含该人记忆');
  assert.ok(!draftPrompt.includes('不相干的路人发言'), '草稿输入不应混入他人记忆');
  assert.match(draftPrompt, /用户「demo」/);
  assert.equal(store.profileOf(key), '审核后画像');
  assert.equal(store.profileEntry(key)!.reviewed, '审核后画像');
  assert.equal(store.people().find((p) => p.key === key)!.name, 'demo');
});

test('regenerateProfile: 记忆 actor 为裸昵称（真实蒸馏格式）时按画像名归集', async () => {
  const { store } = tmpStore();
  const key = userProfileKey('B24EA87BAE34ED99C55AD166EDE974DA');
  store.setProfileEntry(key, '旧画像', { sessionId: 'g1', name: '花咲蝶舞（五笑）' });
  // 蒸馏 prompt 只让 memories.actor 写昵称——真实落库数据多为裸昵称，无 openid
  store.addNote('g1', { content: '花咲蝶舞爱发梗图', importance: 4, actor: '花咲蝶舞（五笑）' }, NOW - DAY);
  store.addNote('g1', { content: '不相干的路人发言', importance: 4, actor: '大肥鱼' }, NOW - DAY);
  let draftPrompt = '';
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('人物画像撰稿模块')
        ? (draftPrompt = prompt, '{"profile":"草稿画像"}')
        : '{"profiles":[{"index":0,"text":"审核后画像"}]}';
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  const r = await brain.regenerateProfile(key);
  assert.deepEqual(r, { ok: true });
  assert.ok(draftPrompt.includes('花咲蝶舞爱发梗图'), '裸昵称记忆应被归集');
  assert.ok(!draftPrompt.includes('不相干的路人发言'), '不应混入他人记忆');
  assert.match(draftPrompt, /用户「花咲蝶舞（五笑）」/);
});

test('regenerateProfile: 起草判空与调用失败是两种 reason，均不改数据', async () => {
  const { store } = tmpStore();
  const key = userProfileKey('AABBCCDD');
  store.setProfileEntry(key, '原画像', { sessionId: 's1', name: 'x' });
  store.addNote('s1', { content: 'x 爱钓鱼', importance: 3, actor: 'x (AABBCCDD)' }, NOW);
  const mkBrain = (fetchImpl: ConstructorParameters<typeof Distiller>[1]) => new Brain({
    store, now,
    distiller: new Distiller(
      { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
      fetchImpl,
    ),
  });
  // 模型成功但判定无可提炼内容 → 不算「调用失败」
  const emptyDraft = mkBrain(async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: '{"profile":""}' } }] }),
  }));
  assert.deepEqual(await emptyDraft.regenerateProfile(key),
    { ok: false, reason: '起草认为没有可提炼的稳定内容，未改动' });
  // 网络/服务错误 → 调用失败
  const failCall = mkBrain(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  assert.deepEqual(await failCall.regenerateProfile(key), { ok: false, reason: '蒸馏调用失败' });
  // 输出无法解析 → 按失败论
  const badJson = mkBrain(async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: '（非 JSON 输出）' } }] }),
  }));
  assert.deepEqual(await badJson.regenerateProfile(key), { ok: false, reason: '蒸馏调用失败' });
  assert.equal(store.profileOf(key), '原画像');
});

test('regenerateProfile: 蒸馏关闭/画像不存在/无记忆/审核判空均不改数据', async () => {
  const { store } = tmpStore();
  const key = userProfileKey('AABBCCDD');
  store.setProfileEntry(key, '原画像', { sessionId: 's1', name: 'x' });
  const off = new Brain({
    store,
    distiller: new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 1 }),
    now,
  });
  assert.deepEqual(await off.regenerateProfile(key), { ok: false, reason: '蒸馏服务不可用' });
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('人物画像撰稿模块')
        ? '{"profile":"草稿画像"}'
        : '{"profiles":[{"index":0,"text":""}]}';
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now });
  // 画像条目缺失时以记忆佐证为准：无证据统一报「暂无可用的记忆」（含不存在的键）
  assert.deepEqual(await brain.regenerateProfile('u:nope'), { ok: false, reason: '该对象暂无可用的记忆' });
  assert.deepEqual(await brain.regenerateProfile(key), { ok: false, reason: '该对象暂无可用的记忆' });
  store.addNote('s1', { content: 'x 爱钓鱼', importance: 3, actor: 'x (AABBCCDD)' }, NOW);
  const r = await brain.regenerateProfile(key);
  assert.deepEqual(r, { ok: false, reason: '审核认为没有可保留的稳定内容，未改动' });
  assert.equal(store.profileOf(key), '原画像');
});

test('resetMemory: 清内存态——assemble 不再注入旧情绪/画像/摘要', async () => {
  const { store } = tmpStore();
  store.setPersona('人设内核');
  store.setEmotion('s1', { v: 0.8, a: 0.9, d: 0.5, label: '兴奋', updatedAt: NOW });
  store.setProfile('s1', '旧会话画像');
  store.addNote('s1', { content: '一条记忆', importance: 3 }, NOW);
  store.setDigest('s1', '旧脉络', 5);
  const brain = new Brain({
    store,
    distiller: new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 1 }),
    now,
  });
  const before = brain.assemble('s1', 'hi');
  assert.ok(before.emotion.includes('兴奋'));
  assert.ok(before.memoryLines.some((l) => l.includes('旧会话画像')));
  assert.equal(before.digest, '旧脉络');
  const cleared = brain.resetMemory();
  assert.equal(cleared.notes, 1);
  assert.equal(cleared.profiles, 1);
  const after = brain.assemble('s1', 'hi');
  assert.equal(after.emotion, '');
  assert.ok(!after.memoryLines.some((l) => l.includes('画像')));
  assert.equal(after.digest, '');
  assert.equal(after.persona, '人设内核');
});

test('consolidate: 语义记忆裸昵称 actor 沿用源记忆全 tag', async () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '张三喜欢听民谣', importance: 4, actor: '张三 (ABCDEF1234567890)' }, NOW - 3 * DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('长期人物画像的编辑')
        ? '{"profiles":[]}'
        : JSON.stringify({ memories: [{ content: '张三爱民谣', importance: 3, actor: '张三' }], profiles: [] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  await brain.consolidate('s1');
  assert.equal(
    store.allNotes().find((n) => n.kind === 'semantic')?.actor,
    '张三 (ABCDEF1234567890)',
  );
});

test('consolidate: 被吸收的 episodic 打戳退出检索池', async () => {
  const { store } = tmpStore();
  const ep = store.addNote('s1', { content: '张三喜欢听民谣', importance: 4 }, NOW - 3 * DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('长期人物画像的编辑')
        ? '{"profiles":[]}'
        : JSON.stringify({ memories: [{ content: '张三爱民谣', importance: 3, actor: '张三' }], profiles: [] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  await brain.consolidate('s1');
  assert.ok(store.allNotes().find((n) => n.id === ep.id)?.absorbedAt);
  // 退池后同词检索不再命中原件，只剩 semantic
  const ctx = await brain.assemble('s1', '民谣', { nick: '张三' });
  assert.ok(!ctx.memoryLines.some((l) => l.includes('张三喜欢听民谣')));
});

test('store: absorb op 持久化，重载后 absorbedAt 保留', () => {
  const { dir, store } = tmpStore();
  const n = store.addNote('s1', { content: '张三喜欢听民谣', importance: 3 }, NOW);
  store.markAbsorbed([n.id, 'ghost'], NOW);
  assert.ok(store.allNotes().find((x) => x.id === n.id)?.absorbedAt);
  const re = new BrainStore(dir);
  re.load();
  assert.ok(re.allNotes().find((x) => x.id === n.id)?.absorbedAt);
});

test('endOfTurn: 「对X：」同对象态度自动归并，非对格式降级为事实', async () => {
  const { store } = tmpStore();
  const old = store.addNote('s1', { content: '对张三：觉得他记性好', importance: 3, kind: 'attitude' }, NOW - DAY);
  const keep = store.addNote('s1', { content: '张三：爱听民谣', importance: 3, kind: 'attitude' }, NOW - DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              memories: [
                { content: '对张三：记性是好，就是爱得意', importance: 4, kind: 'attitude' },
                { content: '张三：开始学吉他', importance: 3, kind: 'attitude' },
              ],
              profiles: [],
            }),
          },
        }],
      }),
    }),
  );
  const brain = new Brain({ store, distiller, now });
  brain.ingest('s1', { userText: '张三记性真好', assistantText: '哼，那当然', actor: 'a', at: NOW });
  await brain.endOfTurn('s1');
  const atts = store.allNotes().filter((n) => n.kind === 'attitude');
  const updated = atts.find((n) => n.id === old.id);
  assert.equal(updated?.content, '对张三：记性是好，就是爱得意'); // 同对象原位更新
  // 非「对X：」格式的 attitude 输出是错标事实，入库护栏降级为 episodic；
  // 存量旧条（keep）是用户/旧版数据，不受影响
  assert.ok(store.allNotes().some((n) => n.content === '张三：开始学吉他' && n.kind === 'episodic'));
  assert.ok(!atts.some((n) => n.content === '张三：开始学吉他'));
  assert.ok(atts.some((n) => n.id === keep.id && n.content === '张三：爱听民谣'));
});

// ── 三类边界加固（11-04-memory-kind-boundary）──

test('endOfTurn: 畸形 attitude 降级 episodic，不污染旧态度', async () => {
  const { store } = tmpStore();
  const old = store.addNote('s1', { content: '对张三：嫌他得意', importance: 3, kind: 'attitude' }, NOW - DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              memories: [{ content: '张三：王者主玩对抗路', importance: 3, kind: 'attitude', merge: 0 }],
              profiles: [],
            }),
          },
        }],
      }),
    }),
  );
  const brain = new Brain({ store, distiller, now });
  brain.ingest('s1', { userText: '张三王者对抗路', assistantText: '哦', actor: 'a', at: NOW });
  await brain.endOfTurn('s1');
  const n = store.allNotes().find((x) => x.content === '张三：王者主玩对抗路');
  assert.equal(n?.kind, 'episodic'); // 错标事实落回事实轨
  assert.equal(store.noteById(old.id)?.content, '对张三：嫌他得意'); // 旧态度不被改写
});

test('absorbCovered: 历史 sourceIds 的存活源追溯退池，幂等且检索不可见', async () => {
  const { store } = tmpStore();
  const e1 = store.addNote('s1', { content: '张三喜欢听民谣', importance: 3 }, NOW - 3 * DAY);
  const e2 = store.addNote('s1', { content: '李四爱打篮球', importance: 3 }, NOW - 3 * DAY);
  const sem = store.addNote('s1', { content: '张三音乐口味偏民谣', importance: 4, kind: 'semantic', sourceIds: [e1.id, 'ghost-id'] }, NOW - 2 * DAY);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  assert.equal(brain.absorbCovered(), 1); // e1 退池；悬空 ghost 与未覆盖 e2 不动
  assert.ok(store.noteById(e1.id)?.absorbedAt);
  assert.ok(!store.noteById(e2.id)?.absorbedAt);
  assert.ok(!store.noteById(sem.id)?.absorbedAt);
  assert.equal(brain.absorbCovered(), 0); // 幂等
  const ctx = brain.assemble('s1', '张三 民谣');
  assert.ok(!ctx.hits.some((n) => n.id === e1.id)); // 退池源不再被召回
});

test('sweepNearDups: absorbed 存档条不参团，活摘要不被并进存档', () => {
  const { store } = tmpStore();
  const a = store.addNote('s1', { content: '同一条事实原文', importance: 3 }, NOW);
  const b = store.addNote('s1', { content: '同一条事实原文', importance: 3 }, NOW);
  store.setEmbedding(a.id, [1, 0, 0]);
  store.setEmbedding(b.id, [1, 0, 0]);
  store.markAbsorbed([a.id], NOW); // a 为已退池的巩固源
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const r = brain.sweepNearDups();
  assert.equal(r.merged, 0);
  assert.ok(store.noteById(b.id) && !store.noteById(b.id)!.absorbedAt);
});

test('consolidate: 产出与库内 semantic 同义→判重合并不新增，源仍退池且谱系并入旧条', async () => {
  const { store } = tmpStore();
  const existing = store.addNote('s1', { content: '角色不粉馆长嫌他直播吼', importance: 4, kind: 'semantic', sourceIds: ['old-src'] }, NOW - 5 * DAY);
  store.setEmbedding(existing.id, [1, 0, 0]);
  const e1 = store.addNote('s1', { content: '花咲蝶舞问角色喜不喜欢馆长，角色答不粉', importance: 3 }, NOW - 3 * DAY);
  const fake = {
    enabled: true,
    embed: async (texts: string[]) => texts.map(() => [1, 0, 0]),
    embedOne: async () => null,
  };
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('长期人物画像的编辑')
        ? '{"profiles":[]}'
        : JSON.stringify({ memories: [{ content: '角色不粉馆长嫌他吼', importance: 4 }], profiles: [] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, embedder: fake as never, now, config: { consolidateMinNotes: 1 } });
  assert.equal(await brain.consolidate('s1'), 0); // 判重命中，不新增
  assert.ok(store.noteById(e1.id)?.absorbedAt); // 源被覆盖仍退池
  const sem = store.noteById(existing.id)!;
  assert.ok(sem.sourceIds!.includes(e1.id)); // 「沉淀自」谱系并入旧条
  assert.ok(sem.hits > 0); // 旧条被强化而非复读新增
});

test('consolidate: 合规「对X：」立场输出落 attitude 并归巩固视角人设轨', async () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle');
  store.createPersona('依恋版', '依恋', 'whale-devotion');
  store.activatePersona('whale-devotion'); // 巩固跑在 devotion 期
  // 两条源都是 whale-gentle 时期（无 personaId → 归 whale-gentle 轨）
  store.addNote('s1', { content: '角色答不粉馆长嫌他直播吼', importance: 3 }, NOW - 3 * DAY);
  store.addNote('s1', { content: '又聊到馆长全程吼看不下去', importance: 3 }, NOW - 3 * DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('长期人物画像的编辑')
        ? '{"profiles":[]}'
        : JSON.stringify({
            memories: [
              { content: '对馆长：嫌他直播全程吼、嘴太脏，不粉', importance: 4, kind: 'attitude' },
              { content: '花咲蝶舞爱拿主播考角色', importance: 3 },
            ],
            profiles: [],
          });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  assert.equal(await brain.consolidate('s1'), 2);
  const att = store.allNotes().find((n) => n.kind === 'attitude')!;
  assert.match(att.content, /^对馆长[：:]/);
  assert.equal(att.personaId, 'whale-gentle'); // 归巩固视角（会话人设众数）而非碰巧活动的 devotion
  const sem = store.allNotes().find((n) => n.kind === 'semantic')!;
  assert.equal(sem.personaId, 'whale-gentle'); // semantic provenance 同记巩固视角人设
});

// ── 11-07 恋人线走查修复 ──

test('store: 画像截断无句末标点时退到分句标点，不留半句残文', () => {
  const { store } = tmpStore();
  // cap 内句末标点太靠前（位置 1 < 200）→ 退到分句标点（452 ≥ 300），截在逗号前
  const text = '短。' + 'x'.repeat(450) + '，' + 'y'.repeat(400);
  store.setProfile('s1', text);
  const p = store.profileOf('s1');
  assert.equal(p.length, 452);
  assert.ok(!p.endsWith('，'));
});

test('digest: clearDigest 清空脉络并持久化（空文本 op=删除语义）', () => {
  const { dir, store } = tmpStore();
  store.setDigest('s1', '旧脉络', 15);
  store.clearDigest('s1');
  assert.equal(store.digestOf('s1'), undefined);
  store.setDigest('s1', '新脉络', 30);
  const re = new BrainStore(dir);
  re.load();
  assert.equal(re.digestOf('s1')!.text, '新脉络');
  re.clearDigest('s1');
  const re2 = new BrainStore(dir);
  re2.load();
  assert.equal(re2.digestOf('s1'), undefined);
});

test('endOfTurn: 审核产出的超长画像按标点收束，不留半句残文', async () => {
  const { store } = tmpStore();
  const long = '甲：' + 'x'.repeat(450) + '，' + 'y'.repeat(200);
  const distiller = mockDistiller({ memories: [], profiles: [{ actor: '张三 (ABCDEF1234567890)', text: long }] });
  const brain = new Brain({ store, distiller, now });
  brain.ingest('s1', { userText: 'hi', assistantText: '咕', actor: '张三 (ABCDEF1234567890)', at: NOW });
  await brain.endOfTurn('s1');
  assert.equal(store.profileOf('u:ABCDEF1234567890').length, 452);
});

test('consolidate: 含时效锚点的产出降级为 episodic，且不再回喂巩固', async () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '张三这阵子在赶项目', importance: 4 }, NOW - 3 * DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      const content = prompt.includes('长期人物画像的编辑')
        ? '{"profiles":[]}'
        : JSON.stringify({ memories: [{ content: '张三的项目明天截止', importance: 3 }], profiles: [] });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  await brain.consolidate('s1');
  const demoted = store.allNotes().find((n) => n.content.includes('明天'));
  assert.equal(demoted?.kind, 'episodic');
  // 巩固产出（含降级条）不回喂：下一轮没有可加工的 episodic
  assert.equal(await brain.consolidate('s1'), 0);
  assert.deepEqual(brain.sessionsNeedingConsolidation(), []);
});

test('consolidate: 全自我轨源批次产出继承自我轨——第三人称改写不再漏标世界轨', async () => {
  const { store } = tmpStore();
  store.createPersona('流萤', '流萤文', 'firefly', { characterId: 'firefly' });
  store.activatePersona('firefly');
  // 种子形态：self:true episodic 第一人称
  for (let i = 0; i < 4; i++) {
    store.addNote('manual', { content: `我第${i}次陪开拓者看星星`, importance: 3, self: true, personaId: 'firefly' }, NOW - 3 * DAY);
  }
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      // LLM 把第一人称改写成第三人称且不标 self——旧路径会漏进世界轨
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        memories: [{ content: '流萤与开拓者约定每晚星空下散步', importance: 3 }], profiles: [],
      }) } }] }),
    }),
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  assert.equal(await brain.consolidate('manual'), 1);
  const sem = store.allNotes().find((n) => n.kind === 'semantic')!;
  assert.equal(sem.self, true);
  assert.equal(sem.personaId, 'firefly');
});

test('consolidate: 全自我轨源批次中 LLM 显式 self:false 仍优先于继承', async () => {
  const { store } = tmpStore();
  store.createPersona('流萤', '流萤文', 'firefly', { characterId: 'firefly' });
  store.activatePersona('firefly');
  store.addNote('manual', { content: '我答应开拓者明晚讲故事', importance: 3, self: true, personaId: 'firefly' }, NOW - 3 * DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        memories: [{ content: '开拓者是星核猎人', importance: 3, self: false }], profiles: [],
      }) } }] }),
    }),
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  await brain.consolidate('manual');
  const sem = store.allNotes().find((n) => n.kind === 'semantic')!;
  assert.equal(sem.self, false); // 显式世界轨不被继承规则翻回
});

test('consolidate: 多角色会话按角色分批——各角色自我轨都能被巩固', async () => {
  const { store } = tmpStore();
  store.createPersona('叶瞬光', '叶', 'ye-shunguang', { characterId: 'ye' });
  store.createPersona('流萤', '流萤文', 'firefly', { characterId: 'firefly' });
  store.activatePersona('firefly');
  // manual 会话并存两角色自我轨 episodic（人设包种子形态）
  store.addNote('manual', { content: '我答应师弟明晚教剑法', importance: 3, self: true, personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  store.addNote('manual', { content: '我收集了新的星核碎片', importance: 3, self: true, personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  store.addNote('manual', { content: '我修好了开拓者的义体', importance: 3, self: true, personaId: 'firefly' }, NOW - 3 * DAY);
  store.addNote('manual', { content: '我给开拓者讲了星空故事', importance: 3, self: true, personaId: 'firefly' }, NOW - 3 * DAY);
  let calls = 0;
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      if (prompt.includes('长期人物画像的编辑')) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"profiles":[]}' } }] }) };
      calls++;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        memories: [{ content: `语义沉淀${calls}`, importance: 3 }], profiles: [],
      }) } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  assert.deepEqual(brain.sessionsNeedingConsolidation(), ['manual']);
  assert.equal(await brain.consolidate('manual'), 2);
  assert.equal(calls, 2); // 两角色各跑一次，不再只有众数视角
  const sems = store.allNotes().filter((n) => n.kind === 'semantic');
  assert.equal(sems.length, 2);
  const pids = new Set(sems.map((s) => s.personaId));
  assert.ok(pids.has('ye-shunguang') && pids.has('firefly'));
  for (const s of sems) assert.equal(s.self, true); // 各批次自我轨继承
  // 两批源都退池
  assert.equal(store.allNotes().filter((n) => n.kind === 'episodic' && !n.absorbedAt).length, 0);
});

test('consolidate: 世界轨源也按源角色分批——不并入会话众数角色批（F5）', async () => {
  const { store } = tmpStore();
  store.createPersona('鲸鱼娘', '鲸', 'whale-devotion', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang', { characterId: 'ye' });
  store.createPersona('流萤', '流萤文', 'firefly', { characterId: 'firefly' });
  store.activatePersona('firefly');
  // 生产形态：会话存量 whale 占众数（已巩固/已吸收不影响众数口径），新近世界轨 ep 来自 ye 与 firefly
  for (let i = 0; i < 5; i++) {
    store.addNote('s1', { content: `旧事${i}`, importance: 3, kind: 'semantic', personaId: 'whale-devotion' }, NOW - 9 * DAY);
  }
  store.addNote('s1', { content: 'demo：被允许叫角色小光', importance: 3, self: false, personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  store.addNote('s1', { content: 'demo：答应明天制定目标', importance: 3, self: false, personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  store.addNote('s1', { content: 'demo：学院项目已上线', importance: 3, self: false, personaId: 'firefly' }, NOW - 2 * DAY);
  store.addNote('s1', { content: 'demo：正在上机课', importance: 3, self: false, personaId: 'firefly' }, NOW - 2 * DAY);
  const personas: string[] = [];
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      if (prompt.includes('长期人物画像的编辑')) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"profiles":[]}' } }] }) };
      personas.push(prompt.includes('叶') ? 'ye' : prompt.includes('流萤文') ? 'firefly' : prompt.includes('鲸') ? 'whale' : '?');
      // LLM 把关系总结判成自我轨——旧路径会落进众数角色 whale 的自我轨
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        memories: [{ content: `demo 是我在意的人${personas.length}`, importance: 3, self: true }], profiles: [],
      }) } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 2 } });
  assert.deepEqual(brain.sessionsNeedingConsolidation(), ['s1']);
  assert.equal(await brain.consolidate('s1'), 2);
  assert.deepEqual(personas.sort(), ['firefly', 'ye']); // 无 whale 视角批
  const outs = store.allNotes().filter((n) => n.kind === 'semantic' && n.sourceIds?.length);
  assert.deepEqual(outs.map((n) => n.personaId).sort(), ['firefly', 'ye-shunguang']);
  for (const o of outs) {
    assert.equal(o.self, true);
    // 每条产出的源都与产出同角色
    for (const sid of o.sourceIds!) assert.equal(store.noteById(sid)!.personaId, o.personaId);
  }
});

test('consolidate: 角色分批后各批独立过 minNotes 门槛——不够量的小角色批延迟不跑', async () => {
  const { store } = tmpStore();
  store.createPersona('叶瞬光', '叶', 'ye-shunguang', { characterId: 'ye' });
  store.createPersona('流萤', '流萤文', 'firefly', { characterId: 'firefly' });
  store.activatePersona('firefly');
  for (let i = 0; i < 3; i++) store.addNote('s1', { content: `流萤期世界事实${i}`, importance: 3, personaId: 'firefly' }, NOW - 3 * DAY);
  store.addNote('s1', { content: '叶期世界事实', importance: 3, personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  let calls = 0;
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content;
      if (prompt.includes('长期人物画像的编辑')) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"profiles":[]}' } }] }) };
      calls++;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ memories: [{ content: '沉淀', importance: 3 }], profiles: [] }) } }] }) };
    },
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 3 } });
  assert.deepEqual(brain.sessionsNeedingConsolidation(), ['s1']);
  await brain.consolidate('s1');
  assert.equal(calls, 1); // 只跑够量的 firefly 批
  const ye = store.allNotes().find((n) => n.content === '叶期世界事实')!;
  assert.equal(ye.absorbedAt, undefined); // 延迟≠丢失：仍在检索池
});

test('consolidate: 混合源批次（世界轨+自我轨）不启用全自我轨继承', async () => {
  const { store } = tmpStore();
  store.createPersona('叶瞬光', '叶', 'ye-shunguang', { characterId: 'ye' });
  store.activatePersona('ye-shunguang');
  store.addNote('s1', { content: '用户养了一只橘猫', importance: 3, personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  store.addNote('s1', { content: '我答应师弟明晚教剑法', importance: 3, self: true, personaId: 'ye-shunguang' }, NOW - 3 * DAY);
  const distiller = new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({
        memories: [{ content: '用户与师弟都是叶瞬光的朋友', importance: 3 }], profiles: [],
      }) } }] }),
    }),
  );
  const brain = new Brain({ store, distiller, now, config: { consolidateMinNotes: 1 } });
  await brain.consolidate('s1');
  const sem = store.allNotes().find((n) => n.kind === 'semantic')!;
  assert.equal(sem.self, undefined); // 非全自我轨源→走启发式，第三人称无「我」落世界轨
});

test('importData: 导入条目即时补向量——人设种子包不再等重启回填', async () => {
  const { store } = tmpStore();
  const embedder = mockEmbedder([[0.1, 0.2], [0.3, 0.4]]);
  const brain = new Brain({ store, distiller: mockDistiller({}), embedder, now });
  brain.importData({ notes: [
    { id: 'n1', content: '种子记忆一', importance: 3 },
    { id: 'n2', content: '种子记忆二', importance: 3 },
  ] }, 'merge');
  await new Promise((r) => setTimeout(r, 10)); // embedNotes 是 fire-and-forget
  assert.deepEqual(store.noteById('n1')!.embedding, [0.1, 0.2]);
  assert.deepEqual(store.noteById('n2')!.embedding, [0.3, 0.4]);
  // 已有向量的条目不重复嵌入：二次导入同包 skipped，不再发起 embed
  let embedCalls = 0;
  const counting = new Embedder(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000 },
    async () => { embedCalls++; return { ok: true, status: 200, json: async () => ({ data: [] }) }; },
  );
  const brain2 = new Brain({ store, distiller: mockDistiller({}), embedder: counting, now });
  brain2.importData({ notes: [{ id: 'n3', content: '第三条', importance: 3 }] }, 'merge');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(embedCalls, 1); // 只嵌入新增的 n3，n1/n2 已有向量不在 pending 里
});

test('prompt: 蒸馏/巩固/脉络提示含敏感场景与时效锚通用规则', () => {
  const d = buildDistillPrompt([{ userText: 'x', assistantText: 'y', at: NOW }], 'p', 5);
  assert.match(d, /只记约定、边界或结论/);
  assert.match(d, /底线、拒绝方式与相处规则也是立场/);
  const c = buildConsolidatePrompt([], '', 'p');
  assert.match(c, /带时间锚点的条目/);
  const g = buildDigestPrompt([{ userText: 'x', assistantText: 'y', at: NOW }], '', 'p');
  assert.match(g, /拒绝后仍被叙述推进/);
});

test('prompt: 画像关系须点名角色——蒸馏/巩固/撰稿/审核四路同口径（F5b）', () => {
  const d = buildDistillPrompt([{ userText: 'x', assistantText: 'y', at: NOW }], 'p', 5);
  const c = buildConsolidatePrompt([], '', 'p');
  for (const s of [d, c]) {
    assert.match(s, /必须点名角色/);
    assert.match(s, /不要用泛指的「角色」「我」/);
  }
  assert.match(buildProfileReviewPrompt([{ actor: 'a', previous: '', candidate: 'x' }]), /原样保留点名/);
});

import { PromptInjector as RealInjector } from '../src/inject/prompt.ts';
import { DEFAULT_CONFIG, DEFAULT_CHANNEL_STYLE } from '../src/config.ts';

async function assembleSections(cfg: Partial<typeof DEFAULT_CONFIG>) {
  const { store } = tmpStore();
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const inj = new RealInjector(brain, { ...DEFAULT_CONFIG, ...cfg }, () => {});
  let h: (a: unknown, c: unknown, n: () => Promise<{ sections: { name: string; order: number; text: string }[] }>) => Promise<{ sections: { name: string; order: number; text: string }[] }> = async () => ({ sections: [] });
  inj.register({ on: (_e: string, fn: typeof h) => { h = fn; } });
  const host = [{ name: 'tool:web_fetch', order: 2100, text: 'Cite the URL as a markdown link' }];
  return (await h({}, { sessionId: 's1' }, async () => ({ sections: host }))).sections;
}

test('inject: 表达口径段排在宿主 web 工具指令与 persona-suffix 之后、易变段之前', async () => {
  const secs = await assembleSections({});
  const style = secs.find((x) => x.name === 'brain:style')!;
  assert.ok(style.order > 2100 && style.order > 10200 && style.order < 10300);
  assert.match(style.text, /不用 markdown/);
  assert.equal(style.text, `【表达口径】${DEFAULT_CHANNEL_STYLE}`);
});

test('inject: 表达口径可关——开关 false 或正文空串都不注入；可按渠道换正文', async () => {
  assert.equal((await assembleSections({ injectChannelStyle: false })).some((x) => x.name === 'brain:style'), false);
  assert.equal((await assembleSections({ channelStyle: '  ' })).some((x) => x.name === 'brain:style'), false);
  const custom = (await assembleSections({ channelStyle: '网页端可用 markdown' })).find((x) => x.name === 'brain:style')!;
  assert.equal(custom.text, '【表达口径】网页端可用 markdown');
});

// ── 私域隔离 ──
import { stripPrivateMarks, stripPrivateSegments } from '../src/brain/store.ts';

test('私域：标域会话产出的记忆对公开会话三路不可见，同域/本域会话可见', () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  store.setSessionDomain('priv2', 'demo');
  store.addNote('priv', { content: 'demo 与角色约定了梳头吹头发', kind: 'semantic', actor: 'demo (DE10ABC123)', importance: 4 }, NOW);
  store.addNote('priv', { content: '对demo：亲密节奏由我决定', kind: 'attitude', actor: 'demo (DE10ABC123)', importance: 4 }, NOW);
  store.addNote('pub', { content: 'demo 是群主', kind: 'semantic', actor: 'demo (DE10ABC123)', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const sp = { nick: 'demo', openid: 'DE10ABC123' };

  // 公开会话：跨群召回与昵称保底都不放出私域条
  const pub = brain.assemble('pub', '梳头', sp);
  assert.ok(!pub.memoryLines.join('\n').includes('梳头'));
  assert.ok(!pub.attitudeLines.join('\n').includes('亲密节奏'));
  assert.ok(!pub.memoryLines.some((l) => l.includes('跨群')));

  // 同域另一会话：跨群召回互通（同一信任域）
  const prv = brain.assemble('priv2', '梳头', sp);
  assert.ok(prv.memoryLines.some((l) => l.includes('梳头') && l.includes('跨群')));
  assert.ok(prv.attitudeLines.join('\n').includes('亲密节奏'));

  // 来源会话自身：主检索池可见
  const self = brain.assemble('priv', '梳头', sp);
  assert.ok(self.memoryLines.join('\n').includes('梳头'));

  // 公开条全域可见：私域会话照常召回公开记忆（可见性不对称是正确的）
  const crossPub = brain.assemble('priv', '群主', sp);
  assert.ok(crossPub.memoryLines.join('\n').includes('群主'));
});

test('私域覆盖：sessionId 私钥仅原会话可见，public 覆盖放行私域条', () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  // 公开会话里的敏感条收回本会话：semantic+actor 本可跨群，私钥钉死后不可见
  store.addNote('pub', { content: 'demo 的原地私密事', kind: 'semantic', actor: 'demo (DE10ABC123)', private: 'pub', importance: 4 }, NOW);
  // 私域良性事实手动放行
  store.addNote('priv', { content: 'demo 的放行公开事', kind: 'semantic', actor: 'demo (DE10ABC123)', private: 'public', importance: 4 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const sp = { nick: 'demo', openid: 'DE10ABC123' };

  const prv = brain.assemble('priv', '私密事', sp);
  assert.ok(!prv.memoryLines.join('\n').includes('原地私密'));
  const pub = brain.assemble('pub', '私密事', sp);
  assert.ok(pub.memoryLines.join('\n').includes('原地私密'));

  const pub2 = brain.assemble('pub', '放行事', sp);
  assert.ok(pub2.memoryLines.join('\n').includes('放行公开事'));
});

test('私域画像：〔私〕句公开会话剥句、私域会话去标记保内容', () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  store.setProfileEntry('u:DE10ABC123', '大学生，住宿舍。〔私〕与角色是恋人关系，亲密约定由她主导。', { sessionId: 's1', name: 'demo' });
  store.setProfileEntry('sess:pub', '群氛围轻松。〔私〕群里聊过私密话题。', { sessionId: 'pub' });
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const sp = { nick: 'demo', openid: 'DE10ABC123' };

  const pub = brain.assemble('pub', 'hi', sp);
  const pubProfile = pub.memoryLines.find((l) => l.startsWith('- [画像]'))!;
  assert.ok(pubProfile.includes('大学生'));
  assert.ok(!pubProfile.includes('恋人'));
  // sess: 画像同口径剥句
  assert.ok(!pub.memoryLines.join('\n').includes('私密话题'));

  const prv = brain.assemble('priv', 'hi', sp);
  const prvProfile = prv.memoryLines.find((l) => l.startsWith('- [画像]'))!;
  assert.ok(prvProfile.includes('恋人'));
  assert.ok(!prvProfile.includes('〔私〕'));

  // 纯函数级口径
  assert.equal(stripPrivateSegments('甲。〔私〕乙。丙。'), '甲。丙。');
  assert.equal(stripPrivateMarks('甲。〔私〕乙。'), '甲。乙。');
});

test('私域：标域立即生效（检索缓存随 graphVersion 失效，无泄漏窗口）', () => {
  const { store } = tmpStore();
  store.addNote('priv', { content: 'demo 的秘密约定', kind: 'semantic', actor: 'demo (DE10ABC123)', importance: 4 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const sp = { nick: 'demo', openid: 'DE10ABC123' };
  // 标域前跨群可召回
  assert.ok(brain.assemble('pub', '秘密', sp).memoryLines.join('\n').includes('秘密'));
  store.setSessionDomain('priv', 'demo');
  assert.ok(!brain.assemble('pub', '秘密', sp).memoryLines.join('\n').includes('秘密'));
  // 撤域回公开（派生模型：作用域随当前标记走）
  store.setSessionDomain('priv', '');
  assert.ok(brain.assemble('pub', '秘密', sp).memoryLines.join('\n').includes('秘密'));
});

test('私域：sess-domain op 与 note.private 跨快照重放、export/import 往返', () => {
  const { dir, store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  store.addNote('priv', { content: 'x', private: 'public' }, NOW);
  store.flush();
  const s2 = new BrainStore(dir);
  assert.equal(s2.sessionDomainOf('priv'), 'demo');
  assert.ok(s2.isPrivateSession('priv'));
  assert.equal(s2.allNotes()[0]!.private, 'public');
  const dump = JSON.parse(JSON.stringify(s2.exportData(NOW)));
  const { store: s3 } = tmpStore();
  s3.importData(dump, 'merge', NOW);
  assert.equal(s3.sessionDomainOf('priv'), 'demo');
  assert.equal(s3.allNotes()[0]!.private, 'public');
  s3.setSessionDomain('priv', '');
  assert.equal(s3.sessionDomainOf('priv'), '');
  assert.throws(() => s3.setSessionDomain('x', 'public'));
  rmSync(dir, { recursive: true });
});

test('私域判重：公开↔域近重复=佐证放行后合并；mergeNotes 私域覆盖取严', () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  const a = store.addNote('pub', { content: '同一事实公开版', importance: 3 }, NOW);
  const b = store.addNote('priv', { content: '同一事实私域版', importance: 3 }, NOW);
  for (const n of [a, b]) store.setEmbedding(n.id, [1, 0, 0]);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // 佐证放行：事实已见公开池，域内副本放行至公开后正常并簇
  const r = brain.sweepNearDups();
  assert.equal(r.merged, 1);
  assert.deepEqual(r.released, [b.id]);
  assert.equal(store.allNotes().length, 1);
  // 手动合并时私域覆盖并入 keep（取严）
  const keep = store.addNote('pub', { content: 'k' }, NOW);
  const drop = store.addNote('s', { content: 'd', private: 'demo' }, NOW);
  store.mergeNotes(keep.id, drop.id, 10);
  assert.equal(store.noteById(keep.id)!.private, 'demo');
});

test('私域判重：写入判重不跨域——私域新条不与公开同义条合并', async () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  const old = store.addNote('pub', { content: '用户喜欢猫', importance: 3 }, NOW);
  store.setEmbedding(old.id, [1, 0, 0]);
  const fake = {
    enabled: true,
    embed: async (texts: string[]) => texts.map(() => [0.99, 0.05, 0]),
    embedOne: async () => null,
  };
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({ memories: [{ content: '用户很喜欢猫咪', importance: 3 }] }),
    embedder: fake as never,
  });
  brain.ingest('priv', { userText: '猫', assistantText: '咕', at: NOW });
  await brain.endOfTurn('priv');
  // 同义但跨域：不并入公开条，私域各存一条
  assert.equal(store.allNotes().length, 2);
  assert.equal(store.noteById(old.id)!.hits, 0);
});

test('私域：私域会话蒸馏产出的记忆域外不可见', async () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  const brain = new Brain({
    store, now,
    distiller: mockDistiller({ memories: [{ content: 'demo 约定了亲密边界', importance: 4 }] }),
  });
  brain.ingest('priv', { userText: '约定', assistantText: '嗯', at: NOW });
  await brain.endOfTurn('priv');
  assert.equal(store.allNotes().length, 1);
  assert.ok(!brain.assemble('pub', '约定', { nick: 'demo' }).memoryLines.join('\n').includes('亲密边界'));
  assert.ok(brain.assemble('priv', '约定', { nick: 'demo' }).memoryLines.join('\n').includes('亲密边界'));
});

test('放行阀：域↔域不互并不放行；钉死条有公开孪生也不自动放', () => {
  const { store } = tmpStore();
  store.setSessionDomain('p1', 'demo');
  store.setSessionDomain('p2', 'vault');
  const a = store.addNote('p1', { content: '同一事实A域', importance: 3 }, NOW);
  const b = store.addNote('p2', { content: '同一事实B域', importance: 3 }, NOW);
  const pinned = store.addNote('pub2', { content: '钉死条', importance: 3, private: 'pub2' }, NOW);
  const pub = store.addNote('pub3', { content: '钉死条公开孪生', importance: 3 }, NOW);
  for (const n of [a, b]) store.setEmbedding(n.id, [0, 1, 0]);
  for (const n of [pinned, pub]) store.setEmbedding(n.id, [1, 0, 0]);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const r = brain.sweepNearDups();
  assert.equal(r.merged, 0);
  assert.equal(r.released.length, 0);
  assert.equal(store.allNotes().length, 4);
  assert.equal(store.noteById(pinned.id)!.private, 'pub2', '人工钉死绝不自动放');
});

test('放行阀·画像佐证：域条内容高覆盖命中公开画像即放行', () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  store.setProfileEntry(userProfileKey('OID_A'), 'demo 是群主。不吃菠萝。住宿舍人多说话不便。〔私〕恋人线略', { sessionId: 'pub', name: 'demo' });
  const hit = store.addNote('priv', { content: 'demo：不吃菠萝，住宿舍', importance: 3 }, NOW);
  const miss = store.addNote('priv', { content: 'demo：与鲸鱼娘约定亲密后由他带去洗澡', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const r = brain.sweepNearDups();
  assert.equal(store.noteById(hit.id)!.private, 'public');
  assert.ok(r.released.includes(hit.id));
  assert.equal(store.noteById(miss.id)!.private, undefined, '无公开佐证不自动放');
});

test('放行候选队列：无私词域条入队，私词/钉死/公开/态度条不入队', () => {
  const { store } = tmpStore();
  store.setSessionDomain('priv', 'demo');
  const cand = store.addNote('priv', { content: 'demo：每周读经济学人和小说', importance: 4 }, NOW);
  store.addNote('priv', { content: 'demo：亲密约定梳头吹头发', importance: 4 }, NOW);
  store.addNote('pub2', { content: '钉死事实', importance: 4, private: 'pub2' }, NOW);
  store.addNote('pub', { content: '公开事实', importance: 4 }, NOW);
  store.addNote('priv', { content: '对某事：立场', importance: 4, kind: 'attitude' }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  assert.deepEqual(brain.releaseCandidates().map((x) => x.id), [cand.id]);
});

// ── 人设包种子（personas/ye-shunguang/seed-export.json）──
test('叶瞬光 seed-export：merge 导入结构合规 + 跨角色可见性端到端', () => {
  const { store } = tmpStore();
  // 生产形态：whale 角色在位激活，ye 尚未导入
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.activatePersona('whale-gentle');
  const seedPath = fileURLToPath(new URL('../../personas/ye-shunguang/seed-export.json', import.meta.url));
  const data = JSON.parse(readFileSync(seedPath, 'utf-8'));
  const brain = new Brain({ store, distiller: mockDistiller({ memories: [] }), now });

  const r = store.importData(data, 'merge', NOW);
  assert.equal(r.notes, 28);
  assert.equal(r.persona, true);
  // merge 不抢占已激活人设
  assert.equal(store.activePersonaId(), 'whale-gentle');
  // 幂等：重复 merge 全跳过
  const r2 = store.importData(data, 'merge', NOW);
  assert.equal(r2.notes, 0);
  assert.equal(r2.skipped, 28);

  const ys = store.personaEntry('ye-shunguang')!;
  assert.ok(ys.moods?.includes('心疼') && ys.moods?.includes('想念'), 'personas 条目应带 moods');
  const notes = store.allNotes();
  assert.equal(notes.length, 28);
  assert.ok(notes.every((n) => n.personaId === 'ye-shunguang'));
  assert.ok(notes.filter((n) => n.kind !== 'attitude').every((n) => n.self === true), '非 attitude 种子全落自我轨');
  assert.ok(notes.filter((n) => n.kind === 'attitude').every((n) => n.self === undefined), 'attitude 不写 self');

  // whale 激活：ye 自我轨（含桂花糖记忆）不可见
  const underWhale = brain.assemble('s1', '桂花糖');
  assert.ok(!underWhale.memoryLines.some((l) => l.includes('桂花糖')), 'whale 下不应召回 ye 自我轨');
  // 切到 ye：种子可被唤起
  store.activatePersona('ye-shunguang');
  const underYe = brain.assemble('s1', '桂花糖');
  assert.ok(underYe.memoryLines.some((l) => l.includes('桂花糖')), 'ye 激活后种子应可召回');
});

// ── 迭代C：主动召回 Brain.search + recall-intent 深挖门控 ──

test('search: 默认口径与 assemble lane-1 一致（本会话+全局域；三轨/私域/退池过滤）', () => {
  const { store } = tmpStore();
  const here = store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 4 }, NOW);
  const glob = store.addNote('manual', { content: '全局备忘：年糕的猫粮买了', importance: 3 }, NOW);
  const other = store.addNote('s2', { content: '别的群聊里聊过年糕', importance: 3 }, NOW);
  const absorbed = store.addNote('s1', { content: '年糕的旧记忆已退池', importance: 3 }, NOW);
  store.markAbsorbed([absorbed.id], NOW);
  store.setSessionDomain('priv', 'demo');
  store.addNote('priv', { content: '私域群里的年糕秘密', importance: 5 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const r = brain.search('s1', '年糕');
  const contents = r.map((s) => s.note.content);
  assert.ok(contents.includes(here.content), '本会话命中');
  assert.ok(contents.includes(glob.content), '全局域命中');
  assert.ok(!contents.includes(other.content), '默认不跨会话');
  assert.ok(!contents.some((c) => c.includes('秘密')), '私域域外不可见');
  assert.ok(!contents.includes(absorbed.content), 'absorbed 不进池');
});

test('search: kinds 过滤、limit 截断、minCos 覆盖三者独立生效', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: ' episodic 条目关于烤鱼', importance: 3, kind: 'episodic' }, NOW);
  store.addNote('s1', { content: 'semantic 条目关于烤鱼', importance: 3, kind: 'semantic' }, NOW);
  store.addNote('s1', { content: 'attitude 对烤鱼：喜欢', importance: 3, kind: 'attitude' }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const all = brain.search('s1', '烤鱼');
  assert.ok(all.length >= 3, '无过滤应三类都在');
  const sem = brain.search('s1', '烤鱼', { kinds: ['semantic'] });
  assert.ok(sem.length > 0 && sem.every((s) => s.note.kind === 'semantic'), 'kinds 过滤');
  const one = brain.search('s1', '烤鱼', { limit: 1 });
  assert.ok(one.length <= 1, 'limit 截断');
  // minCos 抬高到不可能值 → 全过滤；minCos=0 → 全进（仍受 topK/排序影响）
  const strict = brain.search('s1', '烤鱼', { minCos: 0.99 });
  assert.equal(strict.length, 0, 'minCos 覆盖可收紧');
});

test('search: crossSession 纳入他会话，仍守私域/三轨/退池硬过滤', () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  store.activatePersona('whale-gentle');
  const world = store.addNote('s2', { content: '别的群聊约定周末爬山', importance: 3 }, NOW);
  store.addNote('s2', { content: '我叶瞬光去年也想去爬山', importance: 4, self: true, personaId: 'ye-shunguang' }, NOW);
  store.setSessionDomain('priv', 'demo');
  store.addNote('priv', { content: '私域群的爬山秘密计划', importance: 5 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const r = brain.search('s1', '爬山', { crossSession: true });
  const contents = r.map((s) => s.note.content);
  assert.ok(contents.includes(world.content), '跨会话世界轨可见');
  assert.ok(!contents.some((c) => c.includes('剑穗') || c.includes('叶瞬光')), '他角色自我轨不可见');
  assert.ok(!contents.some((c) => c.includes('秘密')), '私域域外不可见');
  // 同查询默认口径下跨会话条目不出现
  const local = brain.search('s1', '爬山');
  assert.ok(!local.map((s) => s.note.content).includes(world.content), '默认仍限本会话');
});

test('search: emb 路径 queryVec 走语义余弦，minEmbedCos 覆盖生效', () => {
  const { store } = tmpStore();
  const a = store.addNote('s1', { content: '用户讨厌香菜', importance: 3 }, NOW);
  const b = store.addNote('s1', { content: '量子场论研讨纪要', importance: 5 }, NOW);
  store.setEmbedding(a.id, [1, 0]);
  store.setEmbedding(b.id, [0, 1]);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const qv = [0.95, 0.05];
  const r = brain.search('s1', 'x', {}, qv);
  assert.equal(r.length, 1);
  assert.match(r[0]!.note.content, /香菜/);
  assert.equal(r[0]!.relSrc, 'emb');
  // minEmbedCos=0 放行正交向量（b 的 cos=0.05 仍 < 默认 0.47 被滤；覆盖后可进）
  const loose = brain.search('s1', 'x', { minEmbedCos: 0 }, qv);
  assert.ok(loose.length >= 2, 'minEmbedCos 覆盖可放宽');
});

test('search: 纯检索无副作用——命中不刷 hits/strength', () => {
  const { store } = tmpStore();
  const n = store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 4 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const before = { hits: n.hits, strength: n.strength, lastAccessAt: n.lastAccessAt };
  const r = brain.search('s1', '猫');
  assert.ok(r.length > 0);
  const after = store.noteById(n.id)!;
  assert.deepEqual({ hits: after.hits, strength: after.strength, lastAccessAt: after.lastAccessAt }, before);
});

test('深挖门控: 召回意图∧弱命中→追加深挖行（跨会话旧记忆可唤起）', () => {
  const { store } = tmpStore();
  // 目标记忆在他会话：lane-1 严格本会话+全局域看不到，深挖 crossSession 能捞到
  store.addNote('s2', { content: '用户去年在云南大理租了三个月民宿', importance: 4 }, NOW - 30 * DAY);
  store.addNote('s1', { content: '今天天气不错适合出门', importance: 2 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '你还记得我去年在云南的事吗');
  assert.ok(ctx.deepRecallLines.length > 0, '应触发深挖');
  assert.ok(ctx.deepRecallLines.some((l) => l.includes('云南') || l.includes('大理')), '深挖应命中旧记忆');
  assert.ok(ctx.deepRecallLines.every((l) => l.startsWith('- [深挖·')), '深挖行带标记');
  assert.ok(ctx.deepRecallLines.some((l) => l.includes('跨群·')), '跨会话命中标跨群');
});

test('深挖门控: 意图∧强命中→不追加（成本纪律）', () => {
  const { store } = tmpStore();
  store.addNote('s1', { content: '用户养了一只橘猫叫年糕', importance: 4 }, NOW);
  store.addNote('s1', { content: '年糕是橘猫每天吃小鱼干', importance: 4 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '你还记得我的猫叫年糕吗');
  assert.ok(ctx.hits.length >= 2, 'lane-1 应有真相关命中');
  assert.equal(ctx.deepRecallLines.length, 0, 'lane-1 足够时不深挖');
});

test('深挖门控: 无意图词→不追加；enabled=false→不追加', () => {
  const { store } = tmpStore();
  store.addNote('s2', { content: '用户去年在云南大理租了三个月民宿', importance: 4 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  // 无意图词的弱查询不触发
  const ctx = brain.assemble('s1', '云南 民宿');
  assert.equal(ctx.deepRecallLines.length, 0, '无意图词不深挖');
  // 意图词+弱命中但开关关闭
  const off = new Brain({
    store, distiller: mockDistiller({}), now,
    config: { deepRecall: { enabled: false } },
  });
  const ctx2 = off.assemble('s1', '你还记得我去年在云南的事吗');
  assert.equal(ctx2.deepRecallLines.length, 0, 'enabled=false 全关');
});

test('深挖门控: 与 lane-1 已注入条目去重，不重复注入', () => {
  const { store } = tmpStore();
  // s1 本会话条目 lane-1 可见（弱相关，在 hits 但不算真相关）；s2 条目只有深挖能捞
  store.addNote('s1', { content: '用户养了一只猫', importance: 3 }, NOW);
  store.addNote('s2', { content: '用户养猫时买过猫爬架', importance: 3 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '你还记得我养的猫吗');
  const laneContents = [...ctx.memoryLines, ...ctx.attitudeLines];
  for (const l of ctx.deepRecallLines) {
    assert.ok(!laneContents.some((x) => x.includes(l.replace(/^- \[深挖·[^\]]*\] ?/, ''))), '深挖不重复 lane-1');
  }
});

test('深挖门控: 私域与他角色自我轨在深挖下仍不可见', () => {
  const { store } = tmpStore();
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  store.activatePersona('whale-gentle');
  store.addNote('s2', { content: '别的群聊约定周末爬山看海', importance: 4 }, NOW);
  store.addNote('s2', { content: '我叶瞬光去年也想去爬山看海', importance: 4, self: true, personaId: 'ye-shunguang' }, NOW);
  store.setSessionDomain('priv', 'demo');
  store.addNote('priv', { content: '私域群的爬山秘密计划', importance: 5 }, NOW);
  const brain = new Brain({ store, distiller: mockDistiller({}), now });
  const ctx = brain.assemble('s1', '你还记得我们约定周末爬山的事吗');
  const deep = ctx.deepRecallLines.join('\n');
  assert.ok(deep.includes('爬山看海'), '深挖应命中跨会话世界轨');
  assert.ok(!deep.includes('叶瞬光'), '他角色自我轨不进深挖');
  assert.ok(!deep.includes('秘密'), '私域域外不进深挖');
});

test('RECALL_INTENT_RE: 召回意图词命中/不命中边界', () => {
  assert.ok(RECALL_INTENT_RE.test('你还记得我去年说的那个事吗'));
  assert.ok(RECALL_INTENT_RE.test('什么来着'));
  assert.ok(RECALL_INTENT_RE.test('do you remember our plan'));
  assert.ok(!RECALL_INTENT_RE.test('今天天气真好'));
  assert.ok(!RECALL_INTENT_RE.test('年糕'));
});
