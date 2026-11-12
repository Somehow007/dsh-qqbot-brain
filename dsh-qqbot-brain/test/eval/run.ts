/**
 * 检索评测集：test/eval/cases.json（线上真实记忆 + 人工标注）
 * 用法：npm run eval            # lexical 路径
 *       BRAIN_EMBED_API_KEY=… npm run eval   # 有 key 时同时对比 embedding 路径
 * 指标：应命中用例的 recall@topK；不应命中用例的误命中率。
 */

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain } from '../../src/brain/index.ts';
import { BrainStore } from '../../src/brain/store.ts';
import { Distiller } from '../../src/brain/distill.ts';
import { Embedder } from '../../src/brain/embed.ts';
import type { MemoryNote } from '../../src/brain/types.ts';

interface EvalCase {
  id: string;
  sessionId: string;
  query: string;
  expect?: string[];
  expectNone?: boolean;
  why?: string;
  optional?: boolean;
  speaker?: { nick?: string; openid?: string };
}

const fixture = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as {
  notes: MemoryNote[];
  cases: EvalCase[];
  deepCases?: EvalCase[];
};

const NOW = Date.parse('2026-10-31T03:00:00Z');
const now = () => NOW;

function makeBrain(store: BrainStore, embedder?: Embedder): Brain {
  const off = new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 5 });
  return new Brain({ store, distiller: off, embedder, now });
}

async function runEval(embedder?: Embedder): Promise<{ hitRate: number; fpRate: number; lines: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'brain-eval-'));
  const store = new BrainStore(dir);
  store.importData({ version: 1, exportedAt: NOW, notes: fixture.notes, emotions: {}, profiles: {} }, 'replace', NOW);
  const brain = makeBrain(store, embedder);
  // embedding 路径：先给全部 fixture 记忆回填向量，否则逐条回退 lexical 无对比意义
  if (embedder?.enabled) {
    while (await brain.backfillEmbeddings(50)) { /* 分批补完 */ }
  }

  let hit = 0;
  let hitTotal = 0;
  let fp = 0;
  let fpTotal = 0;
  const lines: string[] = [];
  for (const c of fixture.cases) {
    const qv = (await brain.queryEmbedding(c.query)) ?? undefined;
    const ctx = brain.assemble(c.sessionId, c.query, c.speaker, qv);
    if (c.expectNone) {
      fpTotal++;
      // 深挖行同属注入面：expectNone 语义=整段注入无相关记忆
      const bad = ctx.hits.length > 0 || ctx.deepRecallLines.length > 0;
      if (bad) fp++;
      lines.push(`${bad ? 'FAIL' : ' ok '} ${c.id} 噪声${ctx.hits.length}+深挖${ctx.deepRecallLines.length}条${bad ? ' ← ' + [...ctx.hits.map((h) => h.content.slice(0, 24)), ...ctx.deepRecallLines.map((l) => l.slice(0, 30))].join(' | ') : ''}`);
      continue;
    }
    hitTotal++;
    const found = (c.expect ?? []).some((sub) =>
      ctx.hits.some((h) => h.content.includes(sub))
      || ctx.memoryLines.some((l) => l.includes(sub))
      || ctx.deepRecallLines.some((l) => l.includes(sub)));
    if (found) hit++;
    lines.push(`${found ? ' ok ' : 'FAIL'} ${c.id} 「${c.query}」→ ${ctx.hits.length}条${ctx.deepRecallLines.length ? `+深挖${ctx.deepRecallLines.length}` : ''}${found ? '' : ' 期望:' + (c.expect ?? []).join('|')}`);
  }
  return { hitRate: hit / Math.max(1, hitTotal), fpRate: fp / Math.max(1, fpTotal), lines };
}

/**
 * 迭代C 深挖召回子集：召回意图词 + lane-1 弱/不可见的跨会话旧记忆。
 * 指标：lane-1（hits+memoryLines+attitudeLines）vs lane-1+deepRecallLines 的 recall 归属，
 * 以及深挖注入的噪声率（expectNone 用例 deepRecallLines 非空即误触发）。
 */
async function runDeepEval(embedder?: Embedder): Promise<{ found: number; total: number; rescued: number; noise: number; noiseTotal: number; lines: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'brain-deep-'));
  const store = new BrainStore(dir);
  store.importData({ version: 1, exportedAt: NOW, notes: fixture.notes, emotions: {}, profiles: {} }, 'replace', NOW);
  const brain = makeBrain(store, embedder);
  if (embedder?.enabled) {
    while (await brain.backfillEmbeddings(50)) { /* 分批补完 */ }
  }
  let found = 0;
  let rescued = 0;
  let total = 0;
  let noise = 0;
  let noiseTotal = 0;
  const lines: string[] = [];
  for (const c of fixture.deepCases ?? []) {
    const qv = (await brain.queryEmbedding(c.query)) ?? undefined;
    const ctx = brain.assemble(c.sessionId, c.query, undefined, qv);
    const lanePool = [...ctx.hits.map((h) => h.content), ...ctx.memoryLines, ...ctx.attitudeLines];
    const deepPool = ctx.deepRecallLines;
    const inLane = (sub: string) => lanePool.some((l) => l.includes(sub));
    const inDeep = (sub: string) => deepPool.some((l) => l.includes(sub));
    if (c.expectNone) {
      noiseTotal++;
      // 只计深挖注入噪声：lane-1 噪声已由主用例 n01-n05 度量，此处隔离迭代C增量
      const bad = deepPool.length > 0;
      if (bad) noise++;
      lines.push(`${bad ? 'FAIL' : ' ok '} ${c.id} 深挖噪声=${deepPool.length} lane1=${ctx.hits.length}${bad ? ' ← ' + deepPool.map((l) => l.slice(0, 30)).join(' | ') : ''}`);
      continue;
    }
    total++;
    const laneHit = (c.expect ?? []).some(inLane);
    const deepHit = (c.expect ?? []).some(inDeep);
    const hit = laneHit || deepHit;
    if (hit) found++;
    if (!laneHit && deepHit) rescued++;
    lines.push(`${hit ? ' ok ' : 'FAIL'} ${c.id} 「${c.query}」→ lane1=${laneHit ? '中' : '未中'} 深挖=${deepHit ? '中' : '未中'}${hit ? '' : ' 期望:' + (c.expect ?? []).join('|')}`);
  }
  return { found, total, rescued, noise, noiseTotal, lines };
}

function report(tag: string, r: { hitRate: number; fpRate: number }, lines?: string[]): void {
  console.log(`\n=== ${tag} ===`);
  for (const l of lines ?? []) console.log(' ', l);
  console.log(`recall=${(r.hitRate * 100).toFixed(1)}%  noiseFP=${(r.fpRate * 100).toFixed(1)}%`);
}

const lex = await runEval();
report('lexical', lex, lex.lines);

// ── 迭代C 深挖召回子集（recall-intent 门控；lexical 路径）──
const deepLex = await runDeepEval();
report('深挖召回·lexical', {
  hitRate: deepLex.total ? deepLex.found / deepLex.total : 0,
  fpRate: deepLex.noiseTotal ? deepLex.noise / deepLex.noiseTotal : 0,
}, deepLex.lines);
console.log(`  深挖独记命中（lane-1 未中、深挖救回）：${deepLex.rescued}/${deepLex.total}；深挖噪声：${deepLex.noise}/${deepLex.noiseTotal}`);

// ── 迭代A 三轨隔离冒烟：世界轨共享 / 自我轨按角色隔离（确定性，无 LLM）──
function runIsolationEval(): { ok: boolean; lines: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'brain-iso-'));
  const store = new BrainStore(dir);
  store.createPersona('温柔版', '温柔', 'whale-gentle', { characterId: 'whale' });
  store.createPersona('依恋版', '依恋', 'whale-devotion', { characterId: 'whale' });
  store.createPersona('叶瞬光', '叶', 'ye-shunguang');
  store.addNote('g1', { content: '用户养了一只橘猫叫年糕', importance: 4, personaId: 'whale-gentle' }, NOW);
  store.addNote('g1', { content: '我答应过每晚给群友讲睡前故事', importance: 4, self: true, personaId: 'whale-gentle' }, NOW);
  store.addNote('g1', { content: '对用户：嘴上嫌弃其实在意', importance: 4, kind: 'attitude', personaId: 'whale-devotion' }, NOW);
  store.addNote('g1', { content: '我来自叶瞬光的世界观', importance: 4, self: true, personaId: 'ye-shunguang' }, NOW);
  const brain = makeBrain(store);
  const has = (ctx: ReturnType<Brain['assemble']>, sub: string) =>
    ctx.hits.some((h) => h.content.includes(sub)) || ctx.memoryLines.some((l) => l.includes(sub));
  const lines: string[] = [];
  let ok = true;
  const check = (label: string, cond: boolean) => { ok &&= cond; lines.push(`${cond ? ' ok ' : 'FAIL'} ${label}`); };
  store.activatePersona('whale-gentle');
  const w = brain.assemble('g1', '年糕 睡前故事 嘴上嫌弃 叶瞬光');
  check('whale-gentle 见世界轨', has(w, '年糕'));
  check('whale-gentle 见自我轨', has(w, '睡前故事'));
  check('whale-gentle 见同角色态度', w.attitudeLines.some((l) => l.includes('嘴上嫌弃')));
  check('whale-gentle 不见 ye 自我轨', !has(w, '叶瞬光的世界观'));
  store.activatePersona('whale-devotion');
  const d = brain.assemble('g1', '睡前故事 嘴上嫌弃 叶瞬光');
  check('whale-devotion 共享 whale 自我轨', has(d, '睡前故事') && d.attitudeLines.some((l) => l.includes('嘴上嫌弃')));
  check('whale-devotion 不见 ye 自我轨', !has(d, '叶瞬光的世界观'));
  store.activatePersona('ye-shunguang');
  const y = brain.assemble('g1', '年糕 睡前故事 嘴上嫌弃 叶瞬光');
  check('ye 见世界轨', has(y, '年糕'));
  check('ye 见自有自我轨', has(y, '叶瞬光的世界观'));
  check('ye 不见 whale 自我轨', !has(y, '睡前故事'));
  check('ye 不见 whale 态度', !y.attitudeLines.some((l) => l.includes('嘴上嫌弃')));
  return { ok, lines };
}
const iso = runIsolationEval();
report('persona 三轨隔离', { hitRate: iso.ok ? 1 : 0, fpRate: 0 }, iso.lines);

const embedder = new Embedder({
  enabled: true,
  baseUrl: process.env.BRAIN_EMBED_BASE_URL ?? 'https://api.siliconflow.cn',
  apiKey: process.env.BRAIN_EMBED_API_KEY ?? '',
  model: process.env.BRAIN_EMBED_MODEL ?? 'BAAI/bge-m3',
  timeoutMs: 15_000,
});
if (embedder.enabled) {
  const emb = await runEval(embedder);
  report('embedding+lex混合', emb, emb.lines);
  const deepEmb = await runDeepEval(embedder);
  report('深挖召回·emb', {
    hitRate: deepEmb.total ? deepEmb.found / deepEmb.total : 0,
    fpRate: deepEmb.noiseTotal ? deepEmb.noise / deepEmb.noiseTotal : 0,
  }, deepEmb.lines);
  console.log(`  深挖独记命中（lane-1 未中、深挖救回）：${deepEmb.rescued}/${deepEmb.total}；深挖噪声：${deepEmb.noise}/${deepEmb.noiseTotal}`);
} else {
  console.log('\n（未设 BRAIN_EMBED_API_KEY，跳过 embedding 路径对比）');
}
