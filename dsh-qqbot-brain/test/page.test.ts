import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';
import { MOODS } from '../src/brain/types.ts';

const page = readFileSync(join(import.meta.dirname, '../src/server/page.html'), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const helpers = script.match(/const ngrams=[\s\S]*?(?=function bindMapNode)/)?.[0] ?? '';
type Pad = { v: number; a: number; d?: number; label?: string; mood?: string };
type EmoOp = { t: number; op: { op: string; sessionId?: string; state?: Pad } };
type Facet = { id: string; title: string; heading: string; body: string };
type Box = [number, number, number, number];
const { cleanText, nodeLabel, mapLabel, previewText, buildRelations, relationWhy, emotionBucket, emotionOps, matchEmotion, personaFacets, matchFacet, layoutSlots, labelPick, companionLine } = runInNewContext(`${helpers}; ({cleanText,nodeLabel,mapLabel,previewText,buildRelations,relationWhy,emotionBucket,emotionOps,matchEmotion,personaFacets,matchFacet,layoutSlots,labelPick,companionLine})`) as {
  cleanText: (text: string) => string;
  nodeLabel: (note: { id: string; content: string }, notes: { id: string; content: string }[]) => string;
  mapLabel: (note: { id: string; content: string }, notes: { id: string; content: string }[]) => string;
  previewText: (note: { id: string; content: string }, notes: { id: string; content: string }[]) => string;
  buildRelations: (notes: { id: string; content: string; sessionId: string; actor?: string }[], edges?: { a: string; b: string; kind: string; score: number }[]) => { a: string; b: string; reasons: string[]; score: number; cos: number; primary: string }[];
  relationWhy: (rel: { reasons: string[] }, other: { actor?: string }) => string;
  emotionBucket: (state: Pad | undefined) => string;
  emotionOps: (ops: EmoOp[]) => { t: number; sessionId: string; state: Pad }[];
  matchEmotion: (note: { sessionId: string; createdAt: number }, emos: { t: number; sessionId: string; state: Pad }[]) => { bucket: string; label: string; t: number } | null;
  personaFacets: (text: string) => Facet[];
  matchFacet: (note: { content: string }, facets: Facet[]) => { facet: string; score: number; words: string[] } | null;
  layoutSlots: (zone: { cx: number; cy: number; rx: number; ry: number }, n: number, box: (x: number, y: number) => Box, inside: (x: number, y: number) => boolean, taken: Box[]) => { x: number; y: number }[];
  labelPick: (items: { id: string; retention: number; importance: number; kind?: string }[], n: number, per?: number) => Set<string>;
  companionLine: (kind: string | null, count: number, name?: string) => string;
};

test('页面脚本语法有效', () => {
  assert.ok(script);
  assert.doesNotThrow(() => new Script(script));
});

test('API 请求经 fapi 透传访问口令', () => {
  assert.match(script, /sessionStorage\.getItem\('brain-token'\)/);
  assert.match(script, /token='?\s*\+\s*encodeURIComponent\(TOKEN\)/);
  assert.equal(script.match(/\bfetch\(/g)?.length, 1);
});

test('人设列表定时刷新时保留未保存的名称与全文草稿', () => {
  const controls: Record<string, { value: string; textContent?: string; disabled?: boolean; options?: unknown[]; replaceChildren?: (...options: unknown[]) => void; add?: (option: unknown) => void }> = {
    personaName: { value: '' }, personaEdit: { value: '' }, personaStat: { value: '' },
    personaActivate: { value: '', disabled: false },
    personaDel: { value: '', disabled: false }, personaDup: { value: '', disabled: false },
    personaSelect: { value: '', options: [] },
  };
  controls.personaSelect!.replaceChildren = (...options) => { controls.personaSelect!.options = options; };
  controls.personaSelect!.add = (option) => { controls.personaSelect!.options!.push(option); };
  const functions = script.match(/function personaDirty\(\)[\s\S]*?(?=\/\/ ── 事件绑定)/)?.[0] ?? '';
  const sandbox = {
    document: { getElementById: (id: string) => controls[id] },
    Option: class {
      text: string;
      value: string;
      constructor(text: string, value: string) { this.text = text; this.value = value; }
    },
  };
  const update = runInNewContext(`
    let PERSONAS={activeId:'',personas:[]}, editingPersonaId='', personaBaseline={name:'',text:''};
    const $=id=>document.getElementById(id);
    ${functions}
    ({showPersonas,personaDirty})
  `, sandbox) as { showPersonas: (data: object) => void; personaDirty: () => boolean };
  update.showPersonas({ activeId: 'a', personas: [{ id: 'a', name: '原版', text: '原内容' }] });
  controls.personaEdit!.value = '本地草稿';
  assert.equal(update.personaDirty(), true);
  update.showPersonas({ activeId: 'a', personas: [{ id: 'a', name: '原版', text: '外部更新' }] });
  assert.equal(controls.personaEdit!.value, '本地草稿');
  assert.equal(controls.personaStat!.textContent, '有未保存修改');
});

test('脑图标签在共同开头之后显示可区分的内容', () => {
  const notes = [
    { id: 'a', content: '用户今天提到下个月要去青岛看海，已经订好车票' },
    { id: 'b', content: '用户今天提到下个月要去杭州出差，计划见老朋友' },
  ];
  assert.match(nodeLabel(notes[0]!, notes), /青岛/);
  assert.match(nodeLabel(notes[1]!, notes), /杭州/);
  assert.notEqual(nodeLabel(notes[0]!, notes), nodeLabel(notes[1]!, notes));
});

test('短记忆保留全文，长记忆仍可定位，不因空白或相同内容丢失', () => {
  const short = { id: 'a', content: '  年糕\n喜欢鱼  ' };
  assert.equal(cleanText(short.content), '年糕 喜欢鱼');
  assert.equal(nodeLabel(short, [short]), '年糕 喜欢鱼');
  const same = [
    { id: 'a', content: '用户决定坚持每周三次晨跑' },
    { id: 'b', content: '用户决定坚持每周三次晨跑' },
  ];
  assert.ok(nodeLabel(same[0]!, same).includes('晨跑'));
});

test('卡片摘要保留开头，并突出长共同前缀之后的区别', () => {
  const notes = [
    { id: 'a', content: '用户在今天的聊天中提到自己最近正在认真考虑去青岛看海，已经订票' },
    { id: 'b', content: '用户在今天的聊天中提到自己最近正在认真考虑去杭州出差，准备见朋友' },
  ];
  assert.match(previewText(notes[0]!, notes), /^用户在今天的聊天/);
  assert.match(previewText(notes[0]!, notes), /青岛/);
  assert.match(previewText(notes[1]!, notes), /杭州/);
});

test('关系推断区分相似话题、同一会话、同一发言人', () => {
  const notes = [
    { id: 'a', content: '用户周末喜欢出门散步', sessionId: 's1', actor: '张三' },
    { id: 'b', content: '用户周末经常出门散步', sessionId: 's1', actor: '张三' },
    { id: 'c', content: '完全不同的记录内容', sessionId: 's1' },
    { id: 'd', content: '另一条毫无关联的笔记', sessionId: 's2', actor: '李四' },
  ];
  const rels = buildRelations(notes);
  const ab = rels.find(r => r.a === 'a' && r.b === 'b');
  assert.ok(ab, 'a/b 应有推断关系');
  assert.equal(ab!.reasons.join(','), 'topic,session,actor');
  assert.equal(ab!.primary, 'topic');
  const ac = rels.find(r => r.a === 'a' && r.b === 'c');
  assert.equal(ac!.reasons.join(','), 'session', '仅同会话时只有 session 理由');
  assert.equal(ac!.primary, 'session');
  assert.equal(rels.find(r => r.a === 'a' && r.b === 'd'), undefined, '无关记忆不连线');
  assert.equal(rels.find(r => r.a === 'c' && r.b === 'd'), undefined, '会话与发言人都不同也不连');
});

test('关系理由文案明示推断来源', () => {
  const why = relationWhy({ reasons: ['topic', 'actor'] }, { actor: '张三' });
  assert.equal(why, '相似话题 · 同一发言人 张三');
  assert.equal(relationWhy({ reasons: ['session'] }, {}), '同一会话');
});

test('关系按强度排序，弱关系排在强关系之后', () => {
  const notes = [
    { id: 'a', content: '用户周末喜欢出门散步', sessionId: 's1', actor: '张三' },
    { id: 'b', content: '用户周末经常出门散步', sessionId: 's1', actor: '张三' },
    { id: 'c', content: '完全不同的记录内容', sessionId: 's1' },
  ];
  const rels = buildRelations(notes);
  assert.ok(rels[0]!.score >= rels[1]!.score, '按 score 降序');
  assert.equal(rels[0]!.primary, 'topic');
});

test('服务端语义边优先展示并保留本地附加理由', () => {
  const notes = [
    { id: 'a', content: '猫很胖', sessionId: 's1', actor: '张三' },
    { id: 'b', content: '狗很可爱', sessionId: 's1', actor: '张三' },
    { id: 'c', content: '完全不同的记录内容', sessionId: 's2', kind: 'semantic' },
  ];
  const edges = [
    { a: 'a', b: 'b', kind: 'semantic', score: 0.78 },
    { a: 'a', b: 'ghost', kind: 'semantic', score: 0.9 },
    { a: 'a', b: 'c', kind: 'facet', score: 0.6 },
    { a: 'c', b: 'a', kind: 'derived', score: 1 },
  ];
  const rels = buildRelations(notes, edges);
  const ab = rels.find(r => r.a === 'a' && r.b === 'b');
  assert.ok(ab, '语义边应保留');
  assert.equal(ab!.primary, 'semantic');
  assert.equal(ab!.cos, 0.78);
  assert.equal(ab!.reasons.join(','), 'semantic,session,actor', '语义主因 + 本地同会话/同发言人附加');
  assert.equal(rels.find(r => r.b === 'ghost'), undefined, '指向不存在节点的边被过滤');
  assert.equal(relationWhy(ab!, { actor: '张三' }), '语义相似 78% · 同一会话 · 同一发言人 张三');
  const ac = rels.find(r => (r.a === 'c' && r.b === 'a'));
  assert.ok(ac, 'derived 边应保留');
  assert.equal(ac!.primary, 'derived');
  assert.equal(relationWhy(ac!, { kind: 'semantic' }), '沉淀为这条语义记忆');
  assert.equal(relationWhy(ac!, { kind: 'episodic' }), '巩固自这条情景记忆');
});

test('无服务端边时本地推断行为不变', () => {
  const notes = [
    { id: 'a', content: '用户周末喜欢出门散步', sessionId: 's1' },
    { id: 'b', content: '用户周末经常出门散步', sessionId: 's1' },
  ];
  const rels = buildRelations(notes, []);
  const ab = rels.find(r => r.a === 'a' && r.b === 'b');
  assert.equal(ab!.reasons.join(','), 'topic,session');
});

test('情绪桶按 PAD 推断：效价定正负，唤醒定强弱', () => {
  assert.equal(emotionBucket({ v: .6, a: .7 }), 'emo:joy');
  assert.equal(emotionBucket({ v: .4, a: .2 }), 'emo:calm');
  assert.equal(emotionBucket({ v: 0, a: .8 }), 'emo:curious');
  assert.equal(emotionBucket({ v: 0, a: .1 }), 'emo:calm');
  assert.equal(emotionBucket({ v: -.5, a: .2 }), 'emo:pout');
  assert.equal(emotionBucket({ v: -.6, a: .9 }), 'emo:huff');
  assert.equal(emotionBucket(undefined), 'emo:calm');
});

test('情绪桶优先按 mood 分类，MOODS 枚举与页面桶表同名同步', () => {
  // mood 优先于 PAD 推断（害羞 v>0 a 中低，旧逻辑会误判平静）
  assert.equal(emotionBucket({ v: .5, a: .3, mood: '害羞' }), 'emo:shy');
  assert.equal(emotionBucket({ v: -.6, a: .9, mood: '开心' }), 'emo:joy');
  assert.equal(emotionBucket({ v: .5, a: .3, mood: '不存在的情绪' }), 'emo:calm');
  for (const m of MOODS) assert.ok(script.includes(`name:'${m}'`), `页面缺少情绪桶「${m}」，该 mood 会静默回退 PAD 推断`);
});

test('记忆的形成时情绪：同会话、形成后 10 分钟内最近的一条', () => {
  const t0 = 1_700_000_000_000;
  const emos = emotionOps([
    { t: t0 + 30e3, op: { op: 'emotion', sessionId: 's1', state: { v: .6, a: .7, label: '雀跃' } } },
    { t: t0 + 5 * 60e3, op: { op: 'emotion', sessionId: 's1', state: { v: -.6, a: .9, label: '炸毛' } } },
    { t: t0 + 10e3, op: { op: 'emotion', sessionId: 's2', state: { v: -.5, a: .2 } } },
    { t: t0, op: { op: 'add' } },
  ]);
  assert.equal(emos.length, 3, '只取 emotion 记录');
  const hit = matchEmotion({ sessionId: 's1', createdAt: t0 }, emos);
  assert.equal(hit?.bucket, 'emo:joy');
  assert.equal(hit?.label, '雀跃');
  assert.equal(matchEmotion({ sessionId: 's1', createdAt: t0 - 11 * 60e3 }, emos), null, '超过 10 分钟不匹配');
  assert.equal(matchEmotion({ sessionId: 's1', createdAt: t0 + 6 * 60e3 }, emos), null, '情绪早于记忆不匹配');
  assert.equal(matchEmotion({ sessionId: 's3', createdAt: t0 }, emos), null, '跨会话不匹配');
});

test('人设按 ## 小节拆成特质；无小节时退化为单个人格内核', () => {
  const facets = personaFacets('# 标题\n导语\n## 身份与底色：蓝发鲸鱼娘\n穿女仆装\n## 群聊与称呼\n被叫大肥鱼会抗议\n');
  assert.equal(facets.length, 2);
  assert.equal(facets[0]!.title, '身份与底色');
  assert.equal(facets[0]!.heading, '身份与底色：蓝发鲸鱼娘');
  assert.equal(facets[1]!.body, '被叫大肥鱼会抗议');
  const single = personaFacets('温和的蓝鲸助手');
  assert.equal(single.length, 1);
  assert.equal(single[0]!.title, '人格内核');
  assert.equal(personaFacets('').length, 0);
  assert.equal(personaFacets(Array.from({ length: 9 }, (_, i) => `## 节${i}\n内容`).join('\n')).length, 6, '最多 6 个特质');
});

test('记忆与人格小节靠区分性共同词连线，低于阈值不连', () => {
  const facets = personaFacets('## 身份\n蓝发鲸鱼娘，穿女仆装\n## 称呼\n群友叫她大肥鱼时会嘴硬抗议\n## 说话\n语气温柔偶尔傲娇');
  const hit = matchFacet({ content: '群友又叫她大肥鱼，她嘴硬说不胖' }, facets);
  assert.equal(hit?.facet, 'facet:1');
  assert.ok(hit!.words.length >= 2);
  assert.equal(matchFacet({ content: '用户喜欢吃火锅' }, facets), null);
  assert.equal(matchFacet({ content: '大肥鱼' }, []), null);
});

test('脑区槽位：标签框互不重叠、不越出轮廓，结果确定', () => {
  const zone = { cx: 200, cy: 100, rx: 120, ry: 60 };
  const box = (x: number, y: number): Box => [x - 14, y - 14, x + 80, y + 14];
  const inside = (x: number, y: number) => x >= 60 && x <= 360 && y >= 30 && y <= 170;
  const taken: Box[] = [];
  const slots = layoutSlots(zone, 8, box, inside, taken);
  assert.ok(slots.length >= 4 && slots.length <= 8);
  for (let i = 0; i < taken.length; i++) for (let j = i + 1; j < taken.length; j++) {
    const a = taken[i]!, b = taken[j]!;
    assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), '框不重叠');
  }
  taken.forEach(b => assert.ok(inside(b[0], b[1]) && inside(b[2], b[3])));
  assert.equal(JSON.stringify(layoutSlots(zone, 8, box, inside, [])), JSON.stringify(slots), '同输入同输出');
  assert.equal(layoutSlots(zone, 3, box, () => false, []).length, 0, '放不下时返回空');
});

test('常驻标签按保持率×重要度取前 n 条，同分按 id 定序且不改原数组', () => {
  const items = [
    { id: 'c', retention: 0.9, importance: 2 },
    { id: 'a', retention: 0.5, importance: 4 },
    { id: 'b', retention: 0.5, importance: 4 },
    { id: 'd', retention: 0.2, importance: 5 },
  ];
  const before = items.map(x => x.id).join();
  assert.deepEqual([...labelPick(items, 2)], ['a', 'b']);
  assert.deepEqual([...labelPick([...items].reverse(), 2)], ['a', 'b'], '输入顺序不影响结果');
  assert.equal(labelPick(items, 10).size, 4);
  assert.equal(labelPick([], 8).size, 0);
  assert.equal(items.map(x => x.id).join(), before);
  // 每类保底：分数最低的 semantic 也能拿到常驻标签，总数仍不超过 n
  const mixed = [
    { id: 'e1', retention: 0.9, importance: 5, kind: 'episodic' },
    { id: 'e2', retention: 0.8, importance: 5, kind: 'episodic' },
    { id: 'e3', retention: 0.7, importance: 5, kind: 'episodic' },
    { id: 's1', retention: 0.1, importance: 1, kind: 'semantic' },
  ];
  assert.deepEqual([...labelPick(mixed, 2)].sort(), ['e1', 'e2']);
  assert.deepEqual([...labelPick(mixed, 2, 1)].sort(), ['e1', 's1']);
  assert.equal(labelPick(mixed, 3, 2).size, 3);
});

test('节点短标签去掉公共主语，陪伴文案随类型变化', () => {
  const notes = [{ id: 'a', content: '用户喜欢下雨天的声音' }];
  assert.match(mapLabel(notes[0]!, notes), /^喜欢下雨天/);
  assert.match(companionLine('facet', 2, '说话风格'), /说话风格.*2 段记忆/);
  assert.match(companionLine('emotion', 0, '炸毛'), /没在「炸毛」/);
  assert.match(companionLine('memory', 1), /1 个邻居/);
  assert.ok(companionLine(null, 0).length > 0);
});
