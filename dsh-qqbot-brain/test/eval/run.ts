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
};

const NOW = Date.parse('2026-10-31T03:00:00Z');
const now = () => NOW;

function makeBrain(store: BrainStore, embedder?: Embedder): Brain {
  const off = new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 5 });
  return new Brain({ store, distiller: off, embedder, now });
}

async function runEval(embedder?: Embedder): Promise<{ hitRate: number; fpRate: number }> {
  const dir = mkdtempSync(join(tmpdir(), 'brain-eval-'));
  const store = new BrainStore(dir);
  store.importData({ version: 1, exportedAt: NOW, notes: fixture.notes, emotions: {}, profiles: {} }, 'replace', NOW);
  const brain = makeBrain(store, embedder);

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
      const bad = ctx.hits.length > 0;
      if (bad) fp++;
      lines.push(`${bad ? 'FAIL' : ' ok '} ${c.id} 噪声${ctx.hits.length}条${bad ? ' ← ' + ctx.hits.map((h) => h.content.slice(0, 24)).join(' | ') : ''}`);
      continue;
    }
    hitTotal++;
    const found = (c.expect ?? []).some((sub) =>
      ctx.hits.some((h) => h.content.includes(sub))
      || ctx.memoryLines.some((l) => l.includes(sub)));
    if (found) hit++;
    lines.push(`${found ? ' ok ' : 'FAIL'} ${c.id} 「${c.query}」→ ${ctx.hits.length}条${found ? '' : ' 期望:' + (c.expect ?? []).join('|')}`);
  }
  return { hitRate: hit / Math.max(1, hitTotal), fpRate: fp / Math.max(1, fpTotal) };
}

function report(tag: string, r: { hitRate: number; fpRate: number }, lines?: string[]): void {
  console.log(`\n=== ${tag} ===`);
  for (const l of lines ?? []) console.log(' ', l);
  console.log(`recall=${(r.hitRate * 100).toFixed(1)}%  noiseFP=${(r.fpRate * 100).toFixed(1)}%`);
}

const lex = await runEval();
// 逐用例明细只打 lexical 一轮
const dir2 = mkdtempSync(join(tmpdir(), 'brain-eval-'));
const store2 = new BrainStore(dir2);
store2.importData({ version: 1, exportedAt: NOW, notes: fixture.notes, emotions: {}, profiles: {} }, 'replace', NOW);
const brain2 = makeBrain(store2);
const detail: string[] = [];
for (const c of fixture.cases) {
  const ctx = brain2.assemble(c.sessionId, c.query, c.speaker);
  if (c.expectNone) {
    detail.push(`${ctx.hits.length === 0 ? ' ok ' : 'FAIL'} ${c.id} 噪声${ctx.hits.length}条${ctx.hits.length ? ' ← ' + ctx.hits.map((h) => h.content.slice(0, 24)).join(' | ') : ''}`);
  } else {
    const found = (c.expect ?? []).some((sub) => ctx.hits.some((h) => h.content.includes(sub)) || ctx.memoryLines.some((l) => l.includes(sub)));
    detail.push(`${found ? ' ok ' : 'FAIL'} ${c.id} 「${c.query}」→ ${ctx.hits.length}条${found ? '' : ' 期望:' + (c.expect ?? []).join('|')}`);
  }
}
report('lexical', lex, detail);

const embedder = new Embedder({
  enabled: true,
  baseUrl: process.env.BRAIN_EMBED_BASE_URL ?? 'https://api.siliconflow.cn',
  apiKey: process.env.BRAIN_EMBED_API_KEY ?? '',
  model: process.env.BRAIN_EMBED_MODEL ?? 'BAAI/bge-m3',
  timeoutMs: 15_000,
});
if (embedder.enabled) {
  report('embedding+lex混合', await runEval(embedder));
} else {
  console.log('\n（未设 BRAIN_EMBED_API_KEY，跳过 embedding 路径对比）');
}
