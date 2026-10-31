/**
 * 语义向量嵌入：OpenAI 兼容 /embeddings 接口（SiliconFlow BGE-M3、
 * OpenAI text-embedding-3-small 等均可）。无 apiKey 时 enabled=false，
 * 全链路自动回退 lexical 检索。
 */

export interface EmbedderConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export type EmbedFetchLike = (url: string, init: {
  method: string; headers: Record<string, string>; body: string; signal?: AbortSignal;
}) => Promise<{ ok: boolean; json(): Promise<unknown>; status: number }>;

export class Embedder {
  private cfg: EmbedderConfig;
  private fetchImpl: EmbedFetchLike;

  constructor(cfg: EmbedderConfig, fetchImpl?: EmbedFetchLike) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl ?? (fetch as unknown as EmbedFetchLike);
  }

  get enabled(): boolean {
    return this.cfg.enabled && !!this.cfg.apiKey;
  }

  /** 单次请求文本数上限（DashScope/百炼限制 10 条/批） */
  private static readonly BATCH = 10;

  /**
   * 批量取向量；超过单批上限自动分块串行，任何一块失败返回 null（调用方回退 lexical）。
   * 返回顺序与输入一一对应。
   */
  async embed(texts: string[]): Promise<number[][] | null> {
    const input = texts.map((t) => t.trim()).filter(Boolean);
    if (!this.enabled || input.length === 0) return null;
    const out: number[][] = [];
    for (let i = 0; i < input.length; i += Embedder.BATCH) {
      const chunk = await this.embedChunk(input.slice(i, i + Embedder.BATCH));
      if (!chunk) return null;
      out.push(...chunk);
    }
    return out;
  }

  private async embedChunk(input: string[]): Promise<number[][] | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.cfg.baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({ model: this.cfg.model, input }),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        data?: Array<{ embedding?: number[]; index?: number }>;
      };
      if (!Array.isArray(data.data) || data.data.length === 0) return null;
      // OpenAI 兼容返回的 index 是本批内下标，按它排序对齐输入
      const sorted = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vecs = sorted.map((d) => d.embedding);
      if (vecs.length !== input.length || vecs.some((v) => !Array.isArray(v) || v.length === 0)) return null;
      return vecs as number[][];
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 单条便捷入口 */
  async embedOne(text: string): Promise<number[] | null> {
    const r = await this.embed([text]);
    return r?.[0] ?? null;
  }
}

export function vecCosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
