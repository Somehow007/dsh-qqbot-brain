import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText, nodeLabel, mapLabel, previewText, buildRelations, relationWhy,
  emotionBucket, emotionOps, matchEmotion, personaFacets, matchFacet,
  layoutSlots, labelPick, companionLine, scopeBadge, quotaPick,
  buildMapVM, noteChar, isSelfTrack, notePid, splitActor, EMO_BY_NAME,
} from '../src/server/web/core/vm.js';
import { MOODS } from '../src/brain/types.ts';

type Pad = { v: number; a: number; d?: number; label?: string; mood?: string };
type Box = [number, number, number, number];

// ── 迁移自 page.test.ts 的 helper 用例（口径不变，改为直接 import vm.js）──

test('私域徽标：生效域→私域·域名；=会话id→仅本会话；public 覆盖→已放行；公开无徽标', () => {
  assert.equal(scopeBadge({ sessionId: 's1' }), null);
  assert.equal(scopeBadge({ sessionId: 's1', scope: 's1' })!.t, '仅本会话');
  assert.equal(scopeBadge({ sessionId: 's1', scope: 'demo' })!.t, '私域·demo');
  assert.equal(scopeBadge({ sessionId: 's1', scope: 'public' })!.t, '已放行');
  const b = scopeBadge({ sessionId: 's1', scope: 'demo', private: 'demo' })!;
  assert.match(b.tip, /手动覆盖/);
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
  const ab = rels.find((r) => r.a === 'a' && r.b === 'b');
  assert.ok(ab, 'a/b 应有推断关系');
  assert.equal(ab!.reasons.join(','), 'topic,session,actor');
  assert.equal(ab!.primary, 'topic');
  const ac = rels.find((r) => r.a === 'a' && r.b === 'c');
  assert.equal(ac!.reasons.join(','), 'session', '仅同会话时只有 session 理由');
  assert.equal(ac!.primary, 'session');
  assert.equal(rels.find((r) => r.a === 'a' && r.b === 'd'), undefined, '无关记忆不连线');
  assert.equal(rels.find((r) => r.a === 'c' && r.b === 'd'), undefined, '会话与发言人都不同也不连');
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
  const ab = rels.find((r) => r.a === 'a' && r.b === 'b');
  assert.ok(ab, '语义边应保留');
  assert.equal(ab!.primary, 'semantic');
  assert.equal(ab!.cos, 0.78);
  assert.equal(ab!.reasons.join(','), 'semantic,session,actor', '语义主因 + 本地同会话/同发言人附加');
  assert.equal(rels.find((r) => r.b === 'ghost'), undefined, '指向不存在节点的边被过滤');
  assert.equal(relationWhy(ab!, { actor: '张三' }), '语义相似 78% · 同一会话 · 同一发言人 张三');
  const ac = rels.find((r) => r.a === 'c' && r.b === 'a');
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
  const ab = rels.find((r) => r.a === 'a' && r.b === 'b');
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

test('情绪桶优先按 mood 分类，MOODS 枚举与 vm 桶表同名同步', () => {
  assert.equal(emotionBucket({ v: .5, a: .3, mood: '害羞' }), 'emo:shy');
  assert.equal(emotionBucket({ v: -.6, a: .9, mood: '开心' }), 'emo:joy');
  assert.equal(emotionBucket({ v: .5, a: .3, mood: '不存在的情绪' }), 'emo:calm');
  for (const m of MOODS) assert.ok(EMO_BY_NAME[m], `vm 缺少情绪桶「${m}」，该 mood 会静默回退 PAD 推断`);
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
  taken.forEach((b) => assert.ok(inside(b[0], b[1]) && inside(b[2], b[3])));
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
  const before = items.map((x) => x.id).join();
  assert.deepEqual([...labelPick(items, 2)], ['a', 'b']);
  assert.deepEqual([...labelPick([...items].reverse(), 2)], ['a', 'b'], '输入顺序不影响结果');
  assert.equal(labelPick(items, 10).size, 4);
  assert.equal(labelPick([], 8).size, 0);
  assert.equal(items.map((x) => x.id).join(), before);
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

// ── buildMapVM 新增口径 ──

const mkNote = (id: string, extra: Record<string, unknown> = {}) => ({
  id, kind: 'episodic', content: `内容${id}`, sessionId: 's1', actor: '张三',
  importance: 3, retention: 0.8, hits: 0, createdAt: 1_700_000_000_000,
  lastAccessAt: 1_700_000_000_000, strength: 5, ageDays: 3, fading: false,
  personaId: 'pa', ...extra,
});
const PERSONAS = {
  activeId: 'pa',
  personas: [
    { id: 'pa', name: '鲸鱼娘·温柔', characterId: 'whale' },
    { id: 'pb', name: '鲸鱼娘·依恋', characterId: 'whale' },
    { id: 'pc', name: '叶瞬光', characterId: 'ye', moods: ['平静', '开心', '心疼', '释然'] },
  ],
};
const baseState = (notes: object[], extra: Record<string, unknown> = {}) => ({
  notes, edges: [], stats: { total: notes.length }, emotion: { v: 0.5, a: 0.6, mood: '开心', label: '雀跃' },
  persona: '鲸鱼娘人设文本', config: { forgetThreshold: 0.2 }, ...extra,
});

test('buildMapVM：自我轨按查看角色过滤，世界轨全保留', () => {
  const notes = [
    mkNote('w1', { personaId: 'pa' }),                                  // 世界轨·whale
    mkNote('w2', { personaId: 'pc' }),                                  // 世界轨·ye（共享）
    mkNote('s-whale', { kind: 'attitude', personaId: 'pb', content: '态度自我' }), // 自我轨·whale
    mkNote('s-ye', { kind: 'attitude', personaId: 'pc', content: '态度叶' }),       // 自我轨·ye
    mkNote('s-self', { self: true, personaId: 'pa', content: '显式自我' }),        // 自我轨·whale
  ];
  const whale = buildMapVM(baseState(notes), [], PERSONAS, { profiles: [] }, 'pa', 1_700_000_100_000, { sessions: [] });
  assert.deepEqual(whale.notes.map((n: { id: string }) => n.id).sort(), ['s-self', 's-whale', 'w1', 'w2']);
  // byId 保留全量（画面外定位用）
  assert.equal(Object.keys(whale.byId).length, 5);
  const ye = buildMapVM(baseState(notes), [], PERSONAS, { profiles: [] }, 'pc', 1_700_000_100_000, { sessions: [] });
  assert.deepEqual(ye.notes.map((n: { id: string }) => n.id).sort(), ['s-ye', 'w1', 'w2']);
  assert.equal(ye.characterId, 'ye');
});

test('buildMapVM：track/emo/sess/who 富化字段', () => {
  const notes = [
    mkNote('n1', { emotion: { v: 0.6, a: 0.7, mood: '开心', label: '雀跃' } }),
    mkNote('n2', { sessionId: 'manual', actor: undefined, emotion: { v: -0.5, a: 0.2 } }),
    mkNote('n3', { actor: '某人 (ABCDEF12-3456-7890-ABCD-EF1234567890)', sessionId: 's2' }),
  ];
  const sessions = { sessions: [
    { sessionId: 's1', domain: '', profileName: '' },
    { sessionId: 's2', domain: 'demo', profileName: '' },
    { sessionId: 'manual', domain: '', profileName: '' },
  ] };
  const profiles = { profiles: [
    { key: 'u:ABCDEF12-3456-7890-ABCD-EF1234567890', kind: 'person', name: '画像名', openid: 'ABCDEF12-3456-7890-ABCD-EF1234567890', text: '', sessions: [], updatedAt: 1 },
  ] };
  const vm = buildMapVM(baseState(notes), [], PERSONAS, profiles, 'pa', 1_700_000_100_000, sessions);
  const n1 = vm.byId['n1'] as Record<string, unknown>;
  assert.equal(n1.track, 'world');
  assert.equal(n1.emo, '开心');
  assert.equal(n1.emoLabel, '雀跃');
  assert.equal(n1.sess, 's1', '无 domain/profileName → shortId');
  const n2 = vm.byId['n2'] as Record<string, unknown>;
  assert.equal(n2.sess, '全局');
  assert.equal(n2.who, '用户', '无 actor 无画像 → 会话主人');
  const n3 = vm.byId['n3'] as Record<string, unknown>;
  assert.equal(n3.sess, '私域·demo');
  assert.equal(n3.who, '画像名', 'openid → u: 画像显示名');
});

test('buildMapVM：自定义词表人设无 mood 数据不硬猜 PAD，全局词表可推断', () => {
  const t0 = 1_700_000_000_000;
  const ops = [
    { t: t0 + 1000, op: { op: 'emotion', sessionId: 's1', state: { v: 0.8, a: 0.9 } } }, // PAD 推断→开心
  ];
  const notes = [mkNote('a', { createdAt: t0, sessionId: 's1' })];
  const whale = buildMapVM(baseState(notes), ops, PERSONAS, { profiles: [] }, 'pa', t0 + 2000, { sessions: [] });
  assert.equal((whale.byId['a'] as Record<string, unknown>).emo, '开心', '全局词表 PAD 推断');
  const ye = buildMapVM(baseState(notes), ops, PERSONAS, { profiles: [] }, 'pc', t0 + 2000, { sessions: [] });
  assert.equal((ye.byId['a'] as Record<string, unknown>).emo, null, '自定义词表不硬猜');
  // 蒸馏 mood 词直接透传（含自定义词）
  const notes2 = [mkNote('b', { emotion: { v: 0.5, a: 0.5, mood: '心疼', label: '心疼' } })];
  const ye2 = buildMapVM(baseState(notes2), [], PERSONAS, { profiles: [] }, 'pc', t0, { sessions: [] });
  assert.equal((ye2.byId['b'] as Record<string, unknown>).emo, '心疼');
});

test('buildMapVM：七日心情按本地日取当日最新，无记录日为 null（「—」）', () => {
  const now = new Date(2026, 10, 14, 12).getTime(); // 本地 11-14 中午
  const today = new Date(2026, 10, 14, 9).getTime();
  const threeDaysAgo = new Date(2026, 10, 11, 20).getTime();
  const ops = [
    { t: today, op: { op: 'emotion', sessionId: 's1', state: { v: 0.7, a: 0.6, mood: '开心' } } },
    { t: threeDaysAgo, op: { op: 'emotion', sessionId: 's1', state: { v: -0.5, a: 0.5, mood: '委屈' } } },
  ];
  const vm = buildMapVM(baseState([]), ops, PERSONAS, { profiles: [] }, 'pa', now, { sessions: [] });
  assert.equal(vm.week.length, 7);
  assert.equal(vm.week[6]!.key, '11/14');
  assert.equal(vm.week[6]!.mood, '开心');
  assert.equal(vm.week[5]!.mood, null, '11/13 无记录 → null');
  assert.equal(vm.week[3]!.mood, '委屈', '11/11 有记录');
  assert.equal(vm.week[0]!.mood, null);
});

test('buildMapVM：即将隐没天数 = S·ln(R/阈值)，已过线为 0', () => {
  const now = 1_700_000_000_000;
  // strength=10, retention=0.5, threshold=0.2 → days=ceil(10·ln(2.5))=ceil(9.16)=10
  const notes = [
    mkNote('soon', { retention: 0.5, strength: 10, importance: 5 }),
    mkNote('gone', { retention: 0.1, strength: 10, fading: true }),
    mkNote('safe', { retention: 0.95, strength: 30 }),
  ];
  const vm = buildMapVM(baseState(notes, { config: { forgetThreshold: 0.2 } }), [], PERSONAS, { profiles: [] }, 'pa', now, { sessions: [] });
  const soon = vm.fadingSoon.find((f: { id: string }) => f.id === 'soon')!;
  assert.equal(soon.days, Math.ceil(10 * Math.log(0.5 / 0.2)));
  const gone = vm.fadingSoon.find((f: { id: string }) => f.id === 'gone')!;
  assert.equal(gone.days, 0, '已过隐没线 → 0');
  assert.equal(gone.fading, true);
  assert.equal(vm.fadingSoon.length, 3, 'top5 内全列出（只有 3 条）');
  // 按 retention 升序
  assert.ok(vm.fadingSoon[0]!.ret <= vm.fadingSoon[1]!.ret);
});

test('buildMapVM：最近被想起 top6 按 lastAccessAt 降序', () => {
  const now = 1_700_000_000_000;
  const notes = Array.from({ length: 8 }, (_, i) => mkNote(`r${i}`, { lastAccessAt: now - i * 1000 }));
  const vm = buildMapVM(baseState(notes), [], PERSONAS, { profiles: [] }, 'pa', now, { sessions: [] });
  assert.equal(vm.recalls.length, 6);
  assert.equal(vm.recalls[0]!.id, 'r0');
  assert.equal(vm.recalls[5]!.id, 'r5');
});

test('buildMapVM：观测对象按 who 计数 top3，含「用户」', () => {
  const notes = [
    mkNote('a1', { actor: '甲 (11111111-1111-1111-1111-111111111111)' }),
    mkNote('a2', { actor: '甲 (11111111-1111-1111-1111-111111111111)' }),
    mkNote('b1', { actor: '乙 (22222222-2222-2222-2222-222222222222)' }),
    mkNote('u1', { actor: undefined, sessionId: 'manual' }),
    mkNote('u2', { actor: undefined, sessionId: 'manual' }),
    mkNote('u3', { actor: undefined, sessionId: 'manual' }),
  ];
  const vm = buildMapVM(baseState(notes), [], PERSONAS, { profiles: [] }, 'pa', 1_700_000_000_000, { sessions: [] });
  assert.equal(vm.observers[0]!.name, '用户');
  assert.equal(vm.observers[0]!.count, 3);
  assert.equal(vm.observers.length, 3);
});

test('buildMapVM：links 规范化（consolidate/similar/facet/emotion）+ facets/mood/say', () => {
  const notes = [
    mkNote('a', { emotion: { v: 0.6, a: 0.7, mood: '开心' } }),
    mkNote('b'),
  ];
  const edges = [
    { a: 'a', b: 'b', kind: 'semantic', score: 0.7 },
    { a: 'a', b: 'b', kind: 'derived', score: 1 },
    { a: 'a', b: 'facet:0', kind: 'facet', score: 0.8 },
  ];
  const vm = buildMapVM(baseState(notes, { edges }), [], PERSONAS, { profiles: [] }, 'pa', 1_700_000_000_000, { sessions: [] });
  const kinds = vm.links.map((l: { t: string }) => l.t).sort();
  assert.deepEqual(kinds, ['consolidate', 'emotion', 'facet', 'similar']);
  assert.equal(vm.mood.word, '开心');
  assert.equal(vm.mood.label, '雀跃');
  assert.ok(vm.say.length > 0);
  assert.ok(vm.facets.length >= 1, 'facets 来自查看人设文本');
  assert.equal(vm.persona.id, 'pa');
});

test('quotaPick：超 cap 时三类按比例分配且每类保底，确定性', () => {
  const items = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, kind: 'episodic', importance: 3, retention: 0.5 })),
    ...Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, kind: 'semantic', importance: 4, retention: 0.6 })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, kind: 'attitude', importance: 5, retention: 0.7 })),
  ];
  // 拉开分数差：episodic 高分在前
  items.forEach((it, i) => { (it as { importance: number }).importance = it.kind === 'episodic' ? 5 - Math.floor(i / 10) : it.importance; });
  const out = quotaPick(items, 40);
  assert.equal(out.length, 40);
  const byKind = (k: string) => out.filter((n: { kind: string }) => n.kind === k).length;
  // 比例分配：e≈22 s≈11 t≈7，均不低于保底 floorN=6
  assert.equal(byKind('episodic'), 22);
  assert.equal(byKind('semantic'), 11);
  assert.equal(byKind('attitude'), 7);
  // 组内高分优先：attitude 全 imp=5 ret=.7 → score 3.5 最高，取前 7 条 id 为 t0..t6
  assert.deepEqual(out.filter((n: { kind: string }) => n.kind === 'attitude').map((n: { id: string }) => n.id), ['t0', 't1', 't2', 't3', 't4', 't5', 't6']);
  // 确定性
  assert.deepEqual(quotaPick(items, 40).map((n: { id: string }) => n.id), out.map((n: { id: string }) => n.id));
  // 不超 cap 时原样返回
  assert.equal(quotaPick(items.slice(0, 5), 40).length, 5);
});

test('noteChar/isSelfTrack/notePid/splitActor 与服务端同口径', () => {
  assert.equal(notePid({}), 'whale-gentle');
  assert.equal(isSelfTrack({ kind: 'attitude' }), true);
  assert.equal(isSelfTrack({ self: true }), true);
  assert.equal(isSelfTrack({ kind: 'episodic' }), false);
  const plist = PERSONAS.personas;
  assert.equal(noteChar({ personaId: 'legacy' }, plist), 'whale');
  assert.equal(noteChar({ personaId: 'pc' }, plist), 'ye');
  assert.equal(noteChar({ personaId: 'unknown-x' }, plist), 'unknown-x');
  assert.deepEqual(splitActor('昵称 (ABCDEF12-3456-7890-ABCD-EF1234567890)'), { nick: '昵称', openid: 'ABCDEF12-3456-7890-ABCD-EF1234567890' });
  assert.deepEqual(splitActor('纯昵称'), { nick: '纯昵称', openid: undefined });
});
