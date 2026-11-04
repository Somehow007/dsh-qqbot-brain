import { GLOBAL_SESSION_ID } from './types.ts';
import type { BrainConfig, MemoryNote } from './types.ts';
import { retention } from './decay.ts';
import { vecCosine } from './embed.ts';

/**
 * 字符 n-gram TF-IDF + 可选语义向量的混合检索（中文免分词）。
 *
 * 评分（相关性门控）：
 *   rel   = 命中 embedding 时用 vecCosine(queryVec, note.embedding)，
 *           否则用 char n-gram TF-IDF 余弦
 *   score = alpha·rel·(1 + beta·R) + gamma·imp/5
 * rel 是硬门槛（lex 用 minCosine、emb 用 embedMinCos），R 只对相关命中
 * 做 boost——「够热但不相关」的记忆不再能靠 R+imp 基线分挤进 topK。
 *
 * 文本先归一化（小写化 + 去标点/符号，只留字母数字），否则「橘猫，名叫年糕」
 * 这类句子会产生 猫，名 等被标点切断的假 gram，查询永远对不上。
 * n 取 1-3：unigram 让单字查询（「猫」）与复述弱匹配（「跑步」→「晨跑」）可用，
 * 噪声由 minCosine 门槛兜底。
 */

/** 单条记忆的评分结果 */
export interface ScoredNote {
  note: MemoryNote;
  /** 相关性分（0..1；用于 reinforce 阈值与评测） */
  rel: number;
  /** 综合分（排序用） */
  score: number;
  /** 相关性来源：emb=语义向量 / lex=字符n-gram（阈值不同量纲，分开判） */
  relSrc: 'emb' | 'lex';
}

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
   * 按综合分返回 top-k 的 ScoredNote；rel 低于各自门槛的先过滤，命中不足不凑数。
   * version 由 store 提供（任何写入后递增），索引自动失效重建。
   * queryVec：有 embedding 时对带向量的条目用语义余弦（embedMinCos 门槛），
   * 无向量的条目仍走 lexical 余弦（minCosine 门槛）。
   * 不修改 notes（强化由调用方按 rel >= reinforceMinCos 处理）。
   */
  query(
    allNotes: MemoryNote[],
    sessionId: string | undefined,
    text: string,
    now: number,
    version: number,
    queryVec?: number[],
    opts?: { pool?: MemoryNote[]; indexKey?: string },
  ): ScoredNote[] {
    // 会话记忆 + 全局域（手动写入等无会话归属的条目对全体会话可见）
    const pool = opts?.pool
      ?? (sessionId
        ? allNotes.filter((n) => n.sessionId === sessionId || n.sessionId === GLOBAL_SESSION_ID)
        : allNotes);
    if (pool.length === 0 || !text.trim()) return [];
    const idx = this.indexFor(pool, opts?.indexKey ?? sessionId ?? '__all__', version);

    const qc = new Map<string, number>();
    for (const g of ngrams(text)) qc.set(g, (qc.get(g) ?? 0) + 1);
    const qv = this.vectorize(qc, idx);
    const { alpha, beta, gamma, topK, candidatePool } = this.cfg;

    const scored: ScoredNote[] = [];
    idx.docs.forEach((n, i) => {
      let rel: number;
      let relSrc: 'emb' | 'lex';
      if (queryVec && n.embedding) {
        rel = vecCosine(queryVec, n.embedding);
        relSrc = 'emb';
        if (rel < this.cfg.embedMinCos) return;
      } else {
        rel = this.cosine(this.vectorize(idx.tf[i] ?? new Map(), idx), qv);
        relSrc = 'lex';
        if (rel < this.cfg.minCosine) return;
      }
      scored.push({
        note: n,
        rel,
        relSrc,
        score: alpha * rel * (1 + beta * retention(n, now)) + gamma * (n.importance / 5),
      });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(topK, candidatePool));
  }
}
