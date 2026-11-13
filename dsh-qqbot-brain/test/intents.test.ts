import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../src/brain/index.ts';
import { BrainStore } from '../src/brain/store.ts';
import { Distiller, buildDigestPrompt, buildDistillPrompt } from '../src/brain/distill.ts';
import { dailyOccurrenceMs } from '../src/brain/time.ts';
import { BrainHttpServer } from '../src/server/http.ts';
import type { Turn } from '../src/brain/types.ts';

// ── 迭代D：standing intents（prospective memory）+ provenance/session-kind ──

const DAY = 86_400_000;
let NOW = Date.parse('2026-03-24T04:00:00Z'); // = 北京时间 12:00
const now = () => NOW;

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'brain-intent-'));
  return { dir, store: new BrainStore(dir) };
}

function disabledDistiller() {
  return new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 5 });
}

/** 计数型 mock 蒸馏器：记录每次调用的 prompt，返回固定 JSON */
function countingDistiller(result: object, calls: { prompt: string }[]) {
  return new Distiller(
    { enabled: true, baseUrl: 'https://x.test', apiKey: 'k', model: 'm', timeoutMs: 1000, maxNotes: 5 },
    async (_url, init) => {
      calls.push({ prompt: (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0]!.content });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(result) } }] }) };
    },
  );
}

function makeBrain(store: BrainStore, distiller = disabledDistiller()) {
  // digestEveryTurns=0：隔离滚动摘要的额外 LLM 调用，调用计数只含蒸馏本体；
  // evictAfterDays=0：compact 的物理遗忘用真实 Date.now()，假时钟 note 会被误清
  return new Brain({ store, distiller, now, config: { digestEveryTurns: 0, evictAfterDays: 0 } });
}

const userTurn = (text: string, extra: Partial<Turn> = {}): Turn => ({
  userText: text, assistantText: '嗯嗯', actor: 'demo (oid1)', at: NOW, ...extra,
});

// ── D1：创建/校验 ──

test('intent 创建：event/time 必填集校验与归一', () => {
  const { store } = tmpStore();
  const brain = makeBrain(store);
  const ev = brain.addIntent({ kind: 'event', text: ' 用户提到考试 ', match: { text: '考试' } });
  assert.equal(ev.status, 'pending');
  assert.equal(ev.firedCount, 0);
  assert.equal(ev.text, '用户提到考试');
  assert.equal(ev.kind, 'event');
  // personaId 缺省=活动人设（无活动人设时为 undefined）
  assert.equal(ev.personaId, undefined);

  const tm = brain.addIntent({ kind: 'time', text: '晚上提醒', fireAt: NOW + DAY, dailyAt: undefined });
  assert.equal(tm.fireAt, NOW + DAY);

  // dailyAt 归一补零
  const daily = brain.addIntent({ kind: 'time', text: '每日站会', dailyAt: '9:05' });
  assert.equal(daily.dailyAt, '09:05');

  // 非法输入全部抛错
  assert.throws(() => brain.addIntent({ kind: 'event', text: 'x' } as never), /match/);
  assert.throws(() => brain.addIntent({ kind: 'event', text: 'x', match: {} } as never), /match/);
  assert.throws(() => brain.addIntent({ kind: 'time', text: 'x' } as never), /fireAt|dailyAt/);
  assert.throws(() => brain.addIntent({ kind: 'time', text: 'x', fireAt: NOW, dailyAt: '08:00' } as never), /互斥/);
  assert.throws(() => brain.addIntent({ kind: 'time', text: 'x', dailyAt: '25:00' } as never), /HH:mm/);
  assert.throws(() => brain.addIntent({ kind: 'event', text: 'x', match: { text: '/[/' } } as never), /无效/);
  assert.throws(() => brain.addIntent({ kind: 'sideways', text: 'x' } as never), /event 或 time/);
  assert.throws(() => brain.addIntent({ kind: 'event', text: '  ', match: { text: 'a' } } as never), /不能为空/);
  assert.throws(() => brain.addIntent({ kind: 'event', text: 'x'.repeat(201), match: { text: 'a' } } as never), /200/);
  assert.throws(() => brain.addIntent({ kind: 'time', text: 'x', fireAt: NOW, cooldownMs: -1 } as never), /cooldownMs/);
  assert.throws(() => brain.addIntent({ kind: 'time', text: 'x', fireAt: NOW, maxFires: 1.5 } as never), /maxFires/);
  assert.throws(() => brain.addIntent({ kind: 'time', text: 'x', fireAt: NOW, expiresAt: NOW - 1 } as never), /expiresAt/);
});

// ── D1：更新/取消/删除/列表 ──

test('intent 生命周期：update 补丁、cancel、delete、listIntents 过滤', () => {
  const { store } = tmpStore();
  const brain = makeBrain(store);
  const it = brain.addIntent({ kind: 'event', text: '盯梗', match: { text: '梗' }, cooldownMs: 60_000 });

  // update：text/cooldownMs 可改
  const u1 = brain.updateIntent(it.id, { text: '盯新梗', cooldownMs: null });
  assert.equal(u1?.text, '盯新梗');
  assert.equal(u1?.cooldownMs, undefined);
  // match 替换 + 清除
  assert.equal(brain.updateIntent(it.id, { match: { actor: 'demo' } })?.match?.actor, 'demo');
  assert.throws(() => brain.updateIntent(it.id, { match: null }), /match/); // event 清空 match 非法
  // 不存在 id → undefined；终态后仍可改配置但 status 不可经公开 patch 改
  assert.equal(brain.updateIntent('missing', { text: 'x' }), undefined);
  assert.equal(brain.updateIntent(it.id, { status: 'fired' } as never)?.status, 'pending');

  // time 型 fireAt/dailyAt 互斥：设一清另一
  const tm = brain.addIntent({ kind: 'time', text: '定时', dailyAt: '08:00' });
  const u2 = brain.updateIntent(tm.id, { fireAt: NOW + DAY });
  assert.equal(u2?.fireAt, NOW + DAY);
  assert.equal(u2?.dailyAt, undefined);
  assert.throws(() => brain.updateIntent(tm.id, { fireAt: null, dailyAt: null }), /fireAt 或 dailyAt/);
  assert.throws(() => brain.updateIntent(tm.id, { dailyAt: '99:99' }), /HH:mm/);

  // cancel：pending→cancelled；重复 cancel/终态 cancel 返回 false
  assert.equal(brain.cancelIntent(it.id), true);
  assert.equal(brain.listIntents({ status: 'cancelled' }).length, 1);
  assert.equal(brain.cancelIntent(it.id), false);
  assert.equal(brain.cancelIntent('missing'), false);

  // delete：硬删
  assert.equal(brain.deleteIntent(tm.id), true);
  assert.equal(brain.deleteIntent(tm.id), false);

  // listIntents 过滤（it 已 cancelled 仍在列表；全局 intent 对任意 sessionId 可见）
  brain.addIntent({ kind: 'event', text: 'a', match: { text: 'a' }, sessionId: 's1' });
  brain.addIntent({ kind: 'event', text: 'b', match: { text: 'b' } });
  assert.equal(brain.listIntents().length, 3);
  assert.equal(brain.listIntents({ kind: 'time' }).length, 0);
  assert.equal(brain.listIntents({ sessionId: 's1' }).length, 3); // s1 限定 + 两条全局
  assert.equal(brain.listIntents({ sessionId: 's2' }).length, 2); // 仅两条全局
});

// ── D1：JSONL 持久化 + 快照重载 ──

test('intent 持久化：JSONL 重放与快照恢复一致', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  const ev = brain.addIntent({ kind: 'event', text: '持久化事件', match: { text: '持久' }, maxFires: 3 });
  const tm = brain.addIntent({ kind: 'time', text: '持久化定时', fireAt: NOW + DAY, cooldownMs: 1000 });
  brain.ingest('s1', userTurn('触发持久'));
  assert.equal(brain.listIntents({ kind: 'event' })[0]!.firedCount, 1);

  // 路径1：不 flush → 新实例走 JSONL 重放
  const replayed = new BrainStore(dir);
  const reEv = replayed.allIntents().find((i) => i.id === ev.id)!;
  assert.equal(reEv.firedCount, 1);
  assert.equal(reEv.lastFiredAt, NOW);
  assert.equal(reEv.status, 'pending'); // maxFires=3 未达
  assert.equal(replayed.allIntents().find((i) => i.id === tm.id)!.cooldownMs, 1000);

  // update/cancel/delete op 同样可重放
  brain.updateIntent(ev.id, { text: '改名' });
  brain.cancelIntent(tm.id);
  const replayed2 = new BrainStore(dir);
  assert.equal(replayed2.intentById(ev.id)!.text, '改名');
  assert.equal(replayed2.intentById(tm.id)!.status, 'cancelled');

  // 路径2：flush → 快照压缩 → 新实例从 snapshot 恢复
  brain.flush();
  const snapped = new BrainStore(dir);
  assert.equal(snapped.allIntents().length, 2);
  assert.equal(snapped.intentById(ev.id)!.text, '改名');
  assert.equal(snapped.intentById(ev.id)!.firedCount, 1);
  rmSync(dir, { recursive: true });
});

// ── D1：event 型确定性匹配 ──

test('event intent：ingest 即时匹配、via 门禁、会话范围、actor AND', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  brain.addIntent({ kind: 'event', text: '考试提及', match: { text: '考试' } });
  brain.addIntent({ kind: 'event', text: '特定人', match: { actor: 'alice' } });
  brain.addIntent({ kind: 'event', text: '仅s1', match: { text: '限定' }, sessionId: 's1' });
  brain.addIntent({ kind: 'event', text: '双条件', match: { text: '报告', actor: 'bob' } });
  brain.addIntent({ kind: 'event', text: '正则', match: { text: '/面试|笔试/' } });

  // 不匹配 → 空
  assert.deepEqual(brain.ingest('s1', userTurn('今天天气不错')), []);
  // text 子串命中（大小写不敏感）
  const r1 = brain.ingest('s1', userTurn('下周要考试了'));
  assert.equal(r1.length, 1);
  assert.equal(r1[0]!.text, '考试提及');
  // actor 命中：actor tag 含 'alice'
  const r2 = brain.ingest('s1', { userText: 'hi', assistantText: 'yo', actor: 'alice (ox)', at: NOW });
  assert.equal(r2.length, 1);
  assert.equal(r2[0]!.text, '特定人');
  // 双条件 AND：text 对 actor 错 → 不触发
  assert.deepEqual(brain.ingest('s1', userTurn('报告写完了', { actor: 'carol (oc)' })), []);
  const r3 = brain.ingest('s1', userTurn('报告写完了', { actor: 'bob (ob)' }));
  assert.equal(r3.length, 1);
  assert.equal(r3[0]!.text, '双条件');
  // sessionId 限定：s2 不触发「仅s1」
  assert.deepEqual(brain.ingest('s2', userTurn('这是限定消息')), []);
  const r4 = brain.ingest('s1', userTurn('这是限定消息'));
  assert.equal(r4.length, 1);
  assert.equal(r4[0]!.text, '仅s1');
  // via 门禁：agent/system 轮次不喂 event intent（userText 含「考试」也不触发）
  assert.deepEqual(brain.ingest('s1', { userText: '考试', assistantText: '', via: 'agent', at: NOW }), []);
  assert.deepEqual(brain.ingest('s1', { userText: '系统：考试提醒', assistantText: '', via: 'system', at: NOW }), []);
  // /…/flags 正则匹配式
  const r5 = brain.ingest('s1', userTurn('明天有个面试'));
  assert.equal(r5.length, 1);
  assert.equal(r5[0]!.text, '正则');
  // contextText 环境消息不参与匹配（只测 userText）
  const r6 = brain.ingest('s1', userTurn('普通消息', { contextText: '[Chat history] 考试复习资料' }));
  assert.ok(!r6.some((i) => i.text === '考试提及'));
  rmSync(dir, { recursive: true });
});

test('event intent：冷却与 maxFires 幂等', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  brain.addIntent({ kind: 'event', text: '防刷', match: { text: '刷' }, cooldownMs: 60_000, maxFires: 2 });
  const r1 = brain.ingest('s1', userTurn('来刷一个'));
  assert.equal(r1.length, 1);
  assert.equal(r1[0]!.firedCount, 1);
  assert.equal(r1[0]!.status, 'pending');
  // 冷却中：同一消息再来不触发
  NOW += 10_000;
  assert.deepEqual(brain.ingest('s1', userTurn('再刷一个')), []);
  // 冷却结束 → 第二次触发 → 达 maxFires → fired 终态
  NOW += 60_000;
  const r2 = brain.ingest('s1', userTurn('又刷一个'));
  assert.equal(r2.length, 1);
  assert.equal(r2[0]!.firedCount, 2);
  assert.equal(r2[0]!.status, 'fired');
  // 终态不再触发
  NOW += 120_000;
  assert.deepEqual(brain.ingest('s1', userTurn('还刷')), []);
  rmSync(dir, { recursive: true });
});

test('intent 过期：expiresAt 到期 → expired 终态（tick 与 ingest 两路都清扫）', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  brain.addIntent({ kind: 'event', text: '短期盯梢', match: { text: '梢' }, expiresAt: NOW + 5_000 });
  NOW += 6_000;
  // tickIntents 清扫过期（不依赖消息到达）
  assert.deepEqual(brain.tickIntents(), []);
  assert.equal(brain.listIntents()[0]!.status, 'expired');
  // 已 expired 的 event intent 不再被 ingest 触发
  assert.deepEqual(brain.ingest('s1', userTurn('来梢')), []);
  rmSync(dir, { recursive: true });
});

// ── D1：time 型定时触发 ──

test('time intent：fireAt 一次性触发 → fired 终态，幂等不重复', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  brain.addIntent({ kind: 'time', text: '一小时后提醒', fireAt: NOW + 3_600_000 });
  // 未到期
  assert.deepEqual(brain.tickIntents(), []);
  // ingest 顺带 tick：到期立即触发（不等 60s 定时器）
  NOW += 3_600_000;
  const fired = brain.ingest('s1', userTurn('随便说点什么'));
  assert.equal(fired.length, 1);
  assert.equal(fired[0]!.text, '一小时后提醒');
  assert.equal(fired[0]!.status, 'fired'); // fireAt 一次性 → 终态
  assert.equal(fired[0]!.firedCount, 1);
  // 幂等：再 tick/ingest 不再触发
  assert.deepEqual(brain.tickIntents(), []);
  assert.deepEqual(brain.ingest('s1', userTurn('再说')), []);
  rmSync(dir, { recursive: true });
});

test('time intent：fireAt 建时已过期 → fire-ASAP 立即触发', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  brain.addIntent({ kind: 'time', text: '补触发', fireAt: NOW - 1000 });
  const fired = brain.tickIntents();
  assert.equal(fired.length, 1);
  assert.equal(fired[0]!.status, 'fired');
  rmSync(dir, { recursive: true });
});

test('time intent：dailyAt 每日复发（时区口径）+ 创建当天不补打', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  NOW = Date.parse('2026-03-24T04:00:00Z'); // 重置：前序测试会推进 NOW（北京 12:00）
  // dailyAt '13:00' → 当日场次 05:00Z
  const it = brain.addIntent({ kind: 'time', text: '每日午后', dailyAt: '13:00' });
  const occ1 = dailyOccurrenceMs('13:00', NOW, 'Asia/Shanghai')!;
  assert.equal(new Date(occ1).toISOString(), '2026-03-24T05:00:00.000Z');
  // 场次未到 → 不触发
  NOW = occ1 - 60_000;
  assert.deepEqual(brain.tickIntents(), []);
  // 场次已过 → 触发（pending 续发，不终态）
  NOW = occ1 + 60_000;
  const f1 = brain.tickIntents();
  assert.equal(f1.length, 1);
  assert.equal(f1[0]!.status, 'pending');
  assert.equal(f1[0]!.firedCount, 1);
  // 同一场次不重复触发（幂等）
  assert.deepEqual(brain.tickIntents(), []);
  // 次日同时刻 → 再次复发
  NOW = occ1 + DAY + 60_000;
  const f2 = brain.tickIntents();
  assert.equal(f2.length, 1);
  assert.equal(f2[0]!.firedCount, 2);
  // expiresAt 截断复发窗口
  brain.updateIntent(it.id, { expiresAt: NOW + DAY });
  NOW += 3 * DAY;
  assert.deepEqual(brain.tickIntents(), []);
  assert.equal(brain.listIntents()[0]!.status, 'expired');
  rmSync(dir, { recursive: true });
});

test('time intent：dailyAt 创建于当日场次之后 → 当天不补打，次日复发', () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  NOW = Date.parse('2026-03-24T04:00:00Z'); // 重置：北京 12:00，dailyAt '09:00' 当日场次已过
  brain.addIntent({ kind: 'time', text: '每日早会', dailyAt: '09:00' });
  assert.deepEqual(brain.tickIntents(), []);
  // 明天 09:00 场次（北京）= 01:00Z
  NOW = Date.parse('2026-03-25T01:00:00Z') + 60_000;
  const f = brain.tickIntents();
  assert.equal(f.length, 1);
  rmSync(dir, { recursive: true });
});

// ── D2：provenance / session-kind ──

test('provenance：agent/system 批次跳过蒸馏（零 LLM 调用）', async () => {
  const { dir, store } = tmpStore();
  const calls: { prompt: string }[] = [];
  const brain = makeBrain(store, countingDistiller({ memories: [] }, calls));
  brain.ingest('s1', { userText: '', assistantText: '我主动问候你', via: 'agent', at: NOW });
  brain.ingest('s1', { userText: '系统心跳', assistantText: '', via: 'system', at: NOW + 1 });
  await brain.endOfTurn('s1');
  assert.equal(calls.length, 0);
  assert.equal(store.allNotes().length, 0);
  // 缓冲已排空：再来一条 agent 轮不残留
  brain.ingest('s1', { userText: '', assistantText: '又一次主动', via: 'agent', at: NOW + 2 });
  await brain.endOfTurn('s1');
  assert.equal(calls.length, 0);
  rmSync(dir, { recursive: true });
});

test('provenance：混合批次蒸馏——agent/system 行标注且不作用户事实', async () => {
  const { dir, store } = tmpStore();
  const calls: { prompt: string }[] = [];
  const brain = makeBrain(store, countingDistiller({
    memories: [{ content: 'demo：喜欢喝咖啡', importance: 3, actor: 'demo (oid1)' }],
  }, calls));
  brain.ingest('s1', userTurn('我最近迷上了手冲咖啡'));
  brain.ingest('s1', { userText: '', assistantText: '（主动）你今天有好好吃饭吗', via: 'agent', at: NOW + 1 });
  brain.ingest('s1', { userText: '系统：定时任务完成', assistantText: '', via: 'system', at: NOW + 2 });
  await brain.endOfTurn('s1');
  assert.equal(calls.length, 1);
  const convo = calls[0]!.prompt;
  // 用户轮保持「发言人：/角色：」双行格式
  assert.ok(convo.includes('demo (oid1)：我最近迷上了手冲咖啡'));
  // agent/system 行单行标注来源
  assert.ok(convo.includes('角色（主动开口）：（主动）你今天有好好吃饭吗'));
  assert.ok(convo.includes('系统：系统：定时任务完成'));
  // prompt 口径说明存在
  assert.ok(convo.includes('不是用户发言'));
  // 蒸馏产出记忆带 source='user'
  const notes = store.allNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0]!.source, 'user');
  rmSync(dir, { recursive: true });
});

test('provenance：buildDistillPrompt/buildDigestPrompt via 行渲染', () => {
  const ctx = { now: NOW, timeZone: 'Asia/Shanghai' };
  const turns: Turn[] = [
    { userText: '在吗', assistantText: '在的', actor: 'a (o)', at: NOW },
    { userText: '', assistantText: '我来主动说一句', via: 'agent', at: NOW + 1 },
    { userText: '心跳包', assistantText: '', via: 'system', at: NOW + 2 },
    { userText: '用户没tag的轮', assistantText: '回复', via: 'user', at: NOW + 3 },
  ];
  const dp = buildDistillPrompt(turns, '人设', 5, undefined, undefined, undefined, ctx);
  const dq = buildDigestPrompt(turns, '', '人设', ctx);
  for (const p of [dp, dq]) {
    assert.ok(p.includes('a (o)：在吗'));
    assert.ok(p.includes('角色（主动开口）：我来主动说一句'));
    assert.ok(p.includes('系统：心跳包'));
    // via=user 无 actor → 「用户」兜底
    assert.ok(p.includes('用户：用户没tag的轮'));
  }
  // agent 行 assistantText 空时回退 userText
  const p2 = buildDistillPrompt([{ userText: '壳层塞的文本', assistantText: '', via: 'agent', at: NOW }], 'p', 5, undefined, undefined, undefined, ctx);
  assert.ok(p2.includes('角色（主动开口）：壳层塞的文本'));
});

test('provenance：MemoryNote.source 各路径归属', async () => {
  const { dir, store } = tmpStore();
  const calls: { prompt: string }[] = [];
  const brain = makeBrain(store, countingDistiller({ memories: [{ content: 'u：事实', importance: 3 }] }, calls));
  // 脑图/API 手写 → manual
  const manual = brain.addNote('manual', { content: '手写记忆' });
  assert.equal(manual.source, 'manual');
  // 蒸馏 → user
  brain.ingest('s1', userTurn('我养了猫'));
  await brain.endOfTurn('s1');
  const distilled = store.allNotes().find((n) => n.content === 'u：事实')!;
  assert.equal(distilled.source, 'user');
  // 导入缺省 source → import；自带 source 保留
  store.importData({ notes: [{ id: 'imp1', sessionId: 's1', content: '导入无源', importance: 3, kind: 'episodic', createdAt: NOW, strength: 1, hits: 0, lastAccessAt: NOW }] }, 'merge', NOW);
  assert.equal(store.noteById('imp1')!.source, 'import');
  store.importData({ notes: [{ id: 'imp2', sessionId: 's1', content: '导入有源', importance: 3, kind: 'episodic', createdAt: NOW, strength: 1, hits: 0, lastAccessAt: NOW, source: 'agent' }] }, 'merge', NOW);
  assert.equal(store.noteById('imp2')!.source, 'agent');
  // source 经快照/JSONL 重放保留
  brain.flush();
  const re = new BrainStore(dir);
  assert.equal(re.noteById('imp2')!.source, 'agent');
  assert.equal(re.noteById('imp1')!.source, 'import');
  assert.equal(re.allNotes().find((n) => n.content === 'u：事实')!.source, 'user');
  rmSync(dir, { recursive: true });
});

test('HTTP /api/intents：CRUD + 过滤 + tick + 校验 400/404', async () => {
  const { dir, store } = tmpStore();
  const brain = makeBrain(store);
  const http = new BrainHttpServer(brain, {
    enabled: true, port: 0, host: '127.0.0.1', prefix: '/brain', token: 'tk',
  }, () => {});
  const server = createServer((req, res) => {
    (http as unknown as { route: (req: typeof req, res: typeof res) => Promise<void> }).route(req, res)
      .catch((e) => res.writeHead(500).end(String(e)));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const url = `http://127.0.0.1:${addr.port}/brain/api`;
    const call = (path: string, method = 'GET', body?: object) =>
      fetch(url + path, {
        method, headers: { 'x-brain-token': 'tk', 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      });
    // 口令保护
    assert.equal((await fetch(url + '/intents')).status, 401);
    // 创建 event intent
    const c1 = await call('/intents', 'POST', { kind: 'event', text: '盯梗', match: { text: '梗' } });
    assert.equal(c1.status, 200);
    const it1 = (await c1.json() as { intent: { id: string; status: string } }).intent;
    assert.equal(it1.status, 'pending');
    // 创建 time intent（fireAt）
    const c2 = await call('/intents', 'POST', { kind: 'time', text: '定时', fireAt: NOW + DAY });
    assert.equal(c2.status, 200);
    const it2 = (await c2.json() as { intent: { id: string } }).intent;
    // 非法输入 → 400
    assert.equal((await call('/intents', 'POST', { kind: 'event', text: 'x' })).status, 400);
    assert.equal((await call('/intents', 'POST', { kind: 'time', text: 'x' })).status, 400);
    assert.equal((await call('/intents', 'POST', { kind: 'time', text: 'x', fireAt: NOW, dailyAt: '08:00' })).status, 400);
    assert.equal((await call('/intents', 'POST', { kind: 'event', text: 'x', match: { text: '/[/' } })).status, 400);
    assert.equal((await call('/intents', 'POST', 'not-json' as never)).status, 400);
    // 列表 + 过滤
    const list = await (await call('/intents')).json() as { intents: { id: string; kind: string }[] };
    assert.equal(list.intents.length, 2);
    const evOnly = await (await call('/intents?kind=event')).json() as { intents: unknown[] };
    assert.equal(evOnly.intents.length, 1);
    const pendOnly = await (await call('/intents?status=pending&kind=time')).json() as { intents: { id: string }[] };
    assert.equal(pendOnly.intents[0]!.id, it2.id);
    // PATCH 更新
    const p1 = await call(`/intents/${it1.id}`, 'PATCH', { text: '盯新梗', cooldownMs: 5000 });
    assert.equal(p1.status, 200);
    assert.equal((await p1.json() as { intent: { text: string; cooldownMs: number } }).intent.cooldownMs, 5000);
    // PATCH 非法 → 400；不存在 → 404
    assert.equal((await call(`/intents/${it1.id}`, 'PATCH', { match: null })).status, 400);
    assert.equal((await call('/intents/nope', 'PATCH', { text: 'x' })).status, 404);
    // tick 手动评估（fireAt 未到 → 空 fired）
    const tick = await call('/intents/tick', 'POST');
    assert.equal(tick.status, 200);
    assert.equal((await tick.json() as { fired: unknown[] }).fired.length, 0);
    // cancel
    assert.equal((await call(`/intents/${it2.id}/cancel`, 'POST')).status, 200);
    assert.equal((await call(`/intents/${it2.id}/cancel`, 'POST')).status, 404); // 已 cancelled
    assert.equal((await call('/intents/nope/cancel', 'POST')).status, 404);
    // DELETE
    assert.equal((await call(`/intents/${it1.id}`, 'DELETE')).status, 200);
    assert.equal((await call(`/intents/${it1.id}`, 'DELETE')).status, 404);
    const left = await (await call('/intents')).json() as { intents: unknown[] };
    assert.equal(left.intents.length, 1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true });
  }
});

test('provenance：巩固同质继承 source（全 agent 源批 → agent 产出）', async () => {
  const { dir, store } = tmpStore();
  const calls: { prompt: string }[] = [];
  const brain = new Brain({
    store,
    distiller: countingDistiller({ memories: [{ content: '对demo： agent侧沉淀', importance: 3, kind: 'attitude' }] }, calls),
    now,
    config: { consolidateMinAgeDays: 0, consolidateMinNotes: 1 },
  });
  // 两条 agent 来源的老情景记忆 → 巩固产出应继承 'agent'
  for (const c of ['agent事实一', 'agent事实二']) {
    store.addNote('s1', { content: c, importance: 3, kind: 'episodic', source: 'agent' }, NOW - 2 * DAY);
  }
  const kept = await brain.consolidate('s1');
  assert.equal(kept, 1);
  const sem = store.allNotes().find((n) => n.content.includes('agent侧沉淀'))!;
  assert.equal(sem.source, 'agent');
  rmSync(dir, { recursive: true });
});
