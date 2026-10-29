import type { DistillResult, EmotionState, MemoryNote, Turn } from './types.ts';

/**
 * 蒸馏器：会话结束后（或每轮末）把对话压缩为记忆笔记 + 情绪增量 + 画像更新。
 * 通过 OpenAI 兼容接口调用（DeepSeek）。fetch 可注入，便于测试。
 */

export interface DistillerConfig {
  enabled: boolean;
  baseUrl: string;      // 如 https://api.deepseek.com
  apiKey: string;
  model: string;        // 如 deepseek-chat
  timeoutMs: number;
  maxNotes: number;     // 单次最多产出的记忆条数
}

export type FetchLike = (url: string, init: {
  method: string; headers: Record<string, string>; body: string; signal?: AbortSignal;
}) => Promise<{ ok: boolean; json(): Promise<unknown>; status: number }>;

const PROMPT = `你是陪伴型聊天角色的记忆提炼模块。阅读下面这段最新对话，输出 JSON：
{
  "memories": [{"content": "一句话值得长期记住的事实/事件（含相关实体，忽略寒暄）", "importance": 1-5, "actor": "发言人名（群聊必填，单聊可省略）", "merge": 0}],
  "emotion": {"label": "角色此刻的情绪短语，贴合角色性格（如「嘴硬但开心」「害羞偷笑」「记仇」），不要只写「平静」", "v": -1到1效价, "a": 0到1唤醒, "d": -1到1支配},
  "profile": "如需更新用户画像则给出画像全文，否则省略",
  "forget": []
}
要求：memories 最多 %d 条，可为空数组；只输出 JSON。
对话每行形如「发言人：内容」；单聊发言人显示为「用户」，群聊显示为「昵称 (openid)」，memories.actor 写该发言人昵称。
profile 字段：单聊写该用户画像全文；多发言人会话可按发言人分行写群内分人画像。
若本轮对话让「角色」对某人、某事或某话题形成了新的看法/立场/喜恶，或使既有态度发生更新（被说服、改观、加深、转淡），
给该项加 "kind": "attitude"，content 写成「对<对象>：<角色当前立场一句话>」的完整表述（如对某人的态度写对象昵称）；
普通事实/事件条目省略 kind。态度条目应与角色性格一致、由对话证据支撑，不要凭空产生。
若某条新记忆（含态度）是对「已有记忆」中某一条的更新/补充/修正，给该项加 "merge": 已有记忆编号，并把它写成合并后的完整表述；不要输出与已有记忆语义重复的新条。
若用户明确说"忘了X/别记这个/别再提X"，在 forget 里输出对应已有记忆的编号（数字）；若没有对应编号，输出该记忆内容中的关键子串（字符串）。无则 forget 为 []。
角色设定：%s

对话：
%s`;

const CONSOLIDATE_PROMPT = `你是陪伴型聊天角色的记忆巩固模块。下面是一个用户的「情景记忆」列表与现有「用户画像」。
把零散情景记忆提炼为少量稳定语义记忆（长期事实、稳定偏好、关系结论），并更新画像。输出 JSON：
{
  "memories": [{"content": "语义记忆：跨时间稳定的事实/偏好/关系", "importance": 1-5, "actor": "相关人名（有则保留）"}],
  "profile": "更新后的用户画像全文，300字以内"
}
要求：memories 最多 5 条，去重合并，丢弃一次性闲聊；只输出 JSON。
角色设定：%s

现有画像：%s

情景记忆：
%s`;

export function buildDistillPrompt(
  turns: Turn[], persona: string, maxNotes: number,
  existing?: MemoryNote[], currentEmotion?: EmotionState,
): string {
  const convo = turns
    .map((t) => `${t.actor ?? '用户'}：${t.userText}\n角色：${t.assistantText}`)
    .join('\n');
  let prompt = PROMPT.replace('%d', String(maxNotes))
    .replace('%s', persona || '（未设定）')
    .replace('%s', convo);
  if (currentEmotion) {
    prompt += `\n\n角色当前情绪：${currentEmotion.label}`
      + `（v=${currentEmotion.v.toFixed(2)} a=${currentEmotion.a.toFixed(2)} d=${currentEmotion.d.toFixed(2)}）。`
      + '若本轮对话后角色情绪没有明显变化，省略 emotion 字段以保留当前情绪；有明显变化时输出新的 emotion。';
  }
  if (existing?.length) {
    prompt += `\n\n已有记忆（编号供 merge 使用）：\n${existing
      .map((n, i) => `${i}. ${n.actor ? `[${n.actor}] ` : ''}${n.content}`)
      .join('\n')}`;
  }
  return prompt;
}

export function buildConsolidatePrompt(notes: MemoryNote[], profile: string, persona: string): string {
  const list = notes.map((n) => `- ${n.actor ? `[${n.actor}] ` : ''}${n.content}`).join('\n');
  return CONSOLIDATE_PROMPT.replace('%s', persona || '（未设定）')
    .replace('%s', profile || '（暂无）')
    .replace('%s', list);
}

export function parseDistillOutput(raw: string): DistillResult {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { memories: [] };
  let obj: unknown;
  try { obj = JSON.parse(m[0]); } catch { return { memories: [] }; }
  const o = obj as Record<string, unknown>;
  const memories = Array.isArray(o.memories)
    ? (o.memories as Array<Record<string, unknown>>)
        .filter((x) => typeof x?.content === 'string' && x.content.trim())
        .map((x) => ({
          content: String(x.content),
          importance: typeof x.importance === 'number' ? x.importance : 3,
          actor: typeof x.actor === 'string' && x.actor ? x.actor : undefined,
          kind: x.kind === 'attitude' ? 'attitude' as const : undefined,
          mergeIndex: typeof x.merge === 'number' && x.merge >= 0 ? Math.floor(x.merge) : undefined,
        }))
    : [];
  const e = o.emotion as Record<string, unknown> | undefined;
  const emotion = e && typeof e.label === 'string'
    ? {
        label: e.label,
        v: typeof e.v === 'number' ? e.v : 0,
        a: typeof e.a === 'number' ? e.a : 0.3,
        d: typeof e.d === 'number' ? e.d : 0,
      }
    : undefined;
  const profile = typeof o.profile === 'string' && o.profile.trim() ? o.profile.trim() : undefined;
  const forget = Array.isArray(o.forget)
    ? (o.forget as unknown[]).filter((x): x is number | string =>
        (typeof x === 'number' && x >= 0) || (typeof x === 'string' && !!x.trim()))
    : undefined;
  return { memories, emotion, profile, forget: forget?.length ? forget : undefined };
}

export class Distiller {
  private cfg: DistillerConfig;
  private fetchImpl: FetchLike;

  constructor(cfg: DistillerConfig, fetchImpl?: FetchLike) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl ?? (fetch as unknown as FetchLike);
  }

  get enabled(): boolean {
    return this.cfg.enabled && !!this.cfg.apiKey;
  }

  async distill(
    turns: Turn[], persona: string,
    existing?: MemoryNote[], currentEmotion?: EmotionState,
  ): Promise<DistillResult> {
    if (!this.enabled || turns.length === 0) return { memories: [] };
    return this.call(buildDistillPrompt(turns, persona, this.cfg.maxNotes, existing, currentEmotion));
  }

  /** 语义巩固：把情景记忆提炼为语义记忆 + 重写画像 */
  async consolidate(notes: MemoryNote[], profile: string, persona: string): Promise<DistillResult> {
    if (!this.enabled || notes.length === 0) return { memories: [] };
    return this.call(buildConsolidatePrompt(notes, profile, persona));
  }

  private async call(prompt: string): Promise<DistillResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: 0,
          max_tokens: 700,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return { memories: [] };
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      return parseDistillOutput(text);
    } catch {
      return { memories: [] };
    } finally {
      clearTimeout(timer);
    }
  }
}
