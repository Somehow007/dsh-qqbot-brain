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
  "memories": [{"content": "一句话可长期复用的事实（含相关实体）", "importance": 1-5, "actor": "发言人名（群聊必填，单聊可省略）", "merge": 0}],
  "emotion": {"label": "角色此刻的情绪短语，贴合角色性格（如「嘴硬但开心」「害羞偷笑」「记仇」），不要只写「平静」", "v": -1到1效价, "a": 0到1唤醒, "d": -1到1支配},
  "profiles": [{"actor": "发言人标识", "text": "对该人的画像全文"}],
  "forget": []
}
要求：memories 最多 %d 条，可为空数组；只输出 JSON。

【只记四类——其他一律不记】
1. 用户事实：身份、经历、拥有物、作息、所在环境等客观信息（如「demo 是大学生住宿舍没冰箱」）
2. 稳定偏好/厌恶：明确表达过且可复用的喜好（如「花咲蝶舞喜欢欧美流行歌」）
3. 承诺与约定：用户或角色答应要做的事、约定的时间/方式
4. 关系变化：称呼约定、结下的梁子、信任/熟络程度变化
【不记这些】
- 一次性拌嘴、玩梗、寒暄、插科打诨的过程（哪怕很好笑）
- 角色自己说了什么俏皮话（角色的承诺除外，记成「我答应某人做某事」）
- 截图里的问候、@ 动作本身、没有信息量的短消息
拿不准就不记：宁可 memories 为空，也不要写流水账。
importance 锚点：5=承诺或重要个人信息，4=稳定偏好，3=关系变化，2=一般事实，1=琐碎（1 分的不值得记，别写）。
content 用第三人称陈述事实（「某昵称：事实」），不要写成「角色回应了…」的对话记录。

对话每行形如「发言人：内容」；单聊发言人显示为「用户」，群聊显示为「昵称 (openid)」，memories.actor 写该发言人昵称。
profiles 字段：仅在画像需要更新时输出，否则省略整个字段。
- 若下方给了「现有画像」，在其基础上修订：保留仍然成立的要点、融入新信息，使画像随了解加深而更完整；
  重写后输出完整全文（不是增量），没有新信息的人物不必重复输出。
- 群聊：每个发言人有更新就各写一条，actor 原样照抄消息里的「昵称 (openid)」。
- 单聊：写一条且省略 actor（即会话对象本人）。
- 可选：再输出一条省略 actor 的条目，表示本次会话整体的画像。
若本轮对话让「角色」对某人、某事或某话题形成了新的看法/立场/喜恶，或使既有态度发生更新（被说服、改观、加深、转淡），
给该项加 "kind": "attitude"，content 写成「对<对象>：<角色当前立场一句话>」的完整表述（如对某人的态度写对象昵称）；
普通事实/事件条目省略 kind。态度条目应与角色性格一致、由对话证据支撑，不要凭空产生。
若某条新记忆（含态度）是对「已有记忆」中某一条的更新/补充/修正，给该项加 "merge": 已有记忆编号，并把它写成合并后的完整表述；不要输出与已有记忆语义重复的新条。
若用户明确说"忘了X/别记这个/别再提X"，在 forget 里输出对应已有记忆的编号（数字）；若没有对应编号，输出该记忆内容中的关键子串（字符串）。无则 forget 为 []。
角色设定：%s

对话：
%s`;

/** 会话滚动摘要：把最近轮次合并进旧摘要（transcript 与 note 之间的中间层） */
const DIGEST_PROMPT = `你是陪伴型聊天角色的会话脉络整理模块。下面是「既有脉络摘要」和「最近一段对话记录」。
把新对话合并进既有脉络，输出一段 250 字以内的最新脉络摘要（纯文本，不要 JSON、不要分点标题）。
脉络要覆盖：最近在聊的话题主线、谁卷入了什么事、有无未完结的话题/承诺/悬着的冲突；过时的细节压缩掉，新事实优先。
既有摘要为空时直接总结对话；整段都是水聊无实质内容时，用一句话带过即可。
角色设定：%s

既有脉络摘要：%s

最近对话：
%s`;

const CONSOLIDATE_PROMPT = `你是陪伴型聊天角色的记忆巩固模块。下面是一个会话的「情景记忆」列表与现有「画像」。
把零散情景记忆提炼为少量稳定语义记忆（长期事实、稳定偏好、关系结论），并更新画像。输出 JSON：
{
  "memories": [{"content": "语义记忆：跨时间稳定的事实/偏好/关系", "importance": 1-5, "actor": "相关人名（有则保留）"}],
  "profiles": [{"actor": "相关发言人标识「昵称 (openid)」（有则照抄）", "text": "更新后的画像全文，300字以内"}]
}
要求：memories 最多 5 条，去重合并，丢弃一次性闲聊；只输出 JSON。
角色设定：%s

现有画像：%s

情景记忆：
%s`;

export function buildDistillPrompt(
  turns: Turn[], persona: string, maxNotes: number,
  existing?: MemoryNote[], currentEmotion?: EmotionState,
  existingProfiles?: { actor?: string; text: string }[],
): string {
  const convo = turns
    .map((t) => `${t.actor ?? '用户'}：${t.userText}\n角色：${t.assistantText}`)
    .join('\n');
  let prompt = PROMPT.replace('%d', String(maxNotes))
    .replace('%s', persona || '（未设定）')
    .replace('%s', convo);
  if (existingProfiles?.length) {
    prompt += `\n\n现有画像：\n${existingProfiles
      .map((p) => `- ${p.actor ?? '本会话'}：${p.text}`)
      .join('\n')}`;
  }
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

export function buildDigestPrompt(turns: Turn[], priorDigest: string, persona: string): string {
  const convo = turns
    .map((t) => `${t.actor ?? '用户'}：${t.userText}\n角色：${t.assistantText}`)
    .join('\n');
  return DIGEST_PROMPT.replace('%s', persona || '（未设定）')
    .replace('%s', priorDigest || '（暂无）')
    .replace('%s', convo);
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
  const profiles = Array.isArray(o.profiles)
    ? (o.profiles as Array<Record<string, unknown>>)
        .filter((x) => typeof x?.text === 'string' && x.text.trim())
        .map((x) => ({
          actor: typeof x.actor === 'string' && x.actor.trim() ? x.actor.trim() : undefined,
          text: String(x.text).trim(),
        }))
    : undefined;
  const forget = Array.isArray(o.forget)
    ? (o.forget as unknown[]).filter((x): x is number | string =>
        (typeof x === 'number' && x >= 0) || (typeof x === 'string' && !!x.trim()))
    : undefined;
  return { memories, emotion, profile, profiles: profiles?.length ? profiles : undefined, forget: forget?.length ? forget : undefined };
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
    existingProfiles?: { actor?: string; text: string }[],
  ): Promise<DistillResult> {
    if (!this.enabled || turns.length === 0) return { memories: [] };
    return this.call(buildDistillPrompt(turns, persona, this.cfg.maxNotes, existing, currentEmotion, existingProfiles));
  }

  /** 语义巩固：把情景记忆提炼为语义记忆 + 重写画像 */
  async consolidate(notes: MemoryNote[], profile: string, persona: string): Promise<DistillResult> {
    if (!this.enabled || notes.length === 0) return { memories: [] };
    return this.call(buildConsolidatePrompt(notes, profile, persona));
  }

  /** 会话滚动摘要：返回纯文本摘要（失败/未启用返回空串） */
  async digest(turns: Turn[], priorDigest: string, persona: string): Promise<string> {
    if (!this.enabled || turns.length === 0) return '';
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
          max_tokens: 500,
          messages: [{ role: 'user', content: buildDigestPrompt(turns, priorDigest, persona) }],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return '';
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return (data.choices?.[0]?.message?.content ?? '').trim();
    } catch {
      return '';
    } finally {
      clearTimeout(timer);
    }
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
