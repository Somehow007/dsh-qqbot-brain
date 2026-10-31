import type { BrainConfig, MemoryNote } from './types.ts';
import { retention } from './decay.ts';

/**
 * 字符 n-gram TF-IDF 检索（中文免分词）。
 * score(m,q) = alpha*cos(E(q),E(m)) + beta*R(m) + gamma*imp(m)/5
 *
 * 文本先归一化（小写化 + 去标点/符号，只留字母数字），否则「橘猫，名叫年糕」
 * 这类句子会产生 猫，名 等被标点切断的假 gram，查询永远对不上。
 * n 取 1-3：unigram 让单字查询（「猫」）与复述弱匹配（「跑步」→「晨跑」）可用，
 * 噪声由 minCosine 门槛兜底——余弦低于门槛的结果直接丢弃，
 * 不再让 R+importance 基线分凑满 topK。
 */

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function ngrams(text: string, ns: readonly number[] = [1, 2, 3]): string[] {
  const s = normalize(text);
  const out: string[] = [];
  for (const n of ns) for (let i = 0; i <= s.length - n; i++) out.push(s.slice(i, i + n));
  return out;
}

type Vec = Map<string, number>;

interface Index {
  df: Map<string, number>;
  tf: Vec[];
  docs: MemoryNote[];
  idf: Map<string, number>;
  version: number;
}

export class Retriever {
  private indexes = new Map<string, Index>();
  private cfg: BrainConfig;

  constructor(cfg: BrainConfig) {
    this.cfg = cfg;
  }

  private build(pool: MemoryNote[]): Omit<Index, 'version'> {
    const df = new Map<string, number>();
    const tf = pool.map((n) => {
      const c = new Map<string, number>();
      for (const g of ngrams(n.content)) c.set(g, (c.get(g) ?? 0) + 1);
      for (const k of c.keys()) df.set(k, (df.get(k) ?? 0) + 1);
      return c;
    });
    return { df, tf, docs: pool, idf: new Map() };
  }

  private indexFor(pool: MemoryNote[], key: string, version: number): Index {
    let idx = this.indexes.get(key);
    if (!idx || idx.version !== version) {
      idx = { ...this.build(pool), version };
      this.indexes.set(key, idx);
    }
    return idx;
  }

  private vectorize(counts: Map<string, number>, idx: Index): Vec {
    const v: Vec = new Map();
    for (const [k, f] of counts) {
      let idf = idx.idf.get(k);
      if (idf === undefined) {
        idf = Math.log((idx.docs.length + 1) / ((idx.df.get(k) ?? 0) + 1)) + 1;
        idx.idf.set(k, idf);
      }
      v.set(k, f * idf);
    }
    return v;
  }

  private cosine(a: Vec, b: Vec): number {
    if (a.size === 0 || b.size === 0) return 0;
    let dot = 0;
    for (const [k, w] of a) dot += w * (b.get(k) ?? 0);
    let na = 0;
    let nb = 0;
    for (const w of a.values()) na += w * w;
    for (const w of b.values()) nb += w * w;
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
  }

  /**
   * 按综合分返回 top-k；cos < minCosine 的先过滤，命中不足时不凑数（可为空）。
   * version 由 store 提供（任何写入后递增），索引自动失效重建。
   * 不修改 notes（强化由调用方处理）。
   */
  query(
    allNotes: MemoryNote[],
    sessionId: string | undefined,
    text: string,
    now: number,
    version: number,
  ): MemoryNote[] {
    const pool = sessionId ? allNotes.filter((n) => n.sessionId === sessionId) : allNotes;
    if (pool.length === 0 || !text.trim()) return [];
    const idx = this.indexFor(pool, sessionId ?? '__all__', version);

    const qc = new Map<string, number>();
    for (const g of ngrams(text)) qc.set(g, (qc.get(g) ?? 0) + 1);
    const qv = this.vectorize(qc, idx);
    const { alpha, beta, gamma, topK, candidatePool } = this.cfg;

    const scored: { n: MemoryNote; s: number }[] = [];
    idx.docs.forEach((n, i) => {
      const cos = this.cosine(this.vectorize(idx.tf[i] ?? new Map(), idx), qv);
      if (cos < this.cfg.minCosine) return;
      scored.push({ n, s: alpha * cos + beta * retention(n, now) + gamma * (n.importance / 5) });
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, Math.min(topK, candidatePool)).map((x) => x.n);
  }
}
