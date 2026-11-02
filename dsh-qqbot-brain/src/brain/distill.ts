import type { DistillResult, EmotionState, MemoryNote, Turn } from './types.ts';
import { DEFAULT_TIME_ZONE, MOODS } from './types.ts';
import { ageLabel, formatClock, formatStamp } from './time.ts';

/** prompt 构建所需的时间上下文：convo 行时间戳 + 末尾「当前时间」锚点 */
export interface TimeCtx { now: number; timeZone: string }

const defaultTimeCtx = (): TimeCtx => ({ now: Date.now(), timeZone: DEFAULT_TIME_ZONE });

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
  "emotion": {"label": "角色此刻的情绪短语，贴合角色性格（如「嘴硬但开心」「害羞偷笑」「记仇」），不要只写「平静」", "mood": "情绪类别，只选其一：${MOODS.join('/')}", "v": -1到1效价, "a": 0到1唤醒, "d": -1到1支配},
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

emotion 字段：判定的是「这轮对话给角色带来的情绪」，依据是用户行为对角色的刺激，不要只按角色回复的语气反推（角色可能嘴硬）。
mood 参照锚点：被夸/被撩/被关心→害羞；分享好消息/被投喂/被惦记→开心或兴奋；被挑衅/被拆台/吃亏→炸毛或记仇；
被冷落/被误解/被凶→委屈或难过；听到八卦/新奇玩意→好奇；日常寒暄无波动→平静。
角色傲娇/嘴硬时按内心真实感受给效价（嘴上嫌弃实际开心时 v 仍为正），label 写真实情绪。
mood 与 v/a 语义须一致：负向类别（委屈/炸毛/记仇/难过）v 为负，正向类别（开心/兴奋/害羞）v 为正。

对话每行形如「[YYYY-MM-DD HH:mm] 发言人：内容」；单聊发言人显示为「用户」，群聊显示为「昵称 (openid)」，memories.actor 写该发言人昵称。
profiles 字段：仅在画像需要更新时输出，否则省略整个字段。
- 画像只写对该人长期成立的判断：性格特质、身份背景、与角色的关系定位、稳定偏好/雷区；
  时效性信息（最近课表、当下在忙什么、一次性安排、刚发生的小事）属于记忆，写进 memories 不进画像。
- 若下方给了「现有画像」，先剔除其中的近期安排、一次性事件和过时判断；只保留长期仍成立的要点，
  再融入本轮的稳定新信息。不要因为旧画像写过就默认它应该继续保留；没有新信息的人物不必重复输出。
- 每条 text 控制在 300 字以内：聊得越久越要压缩过时细节与已被取代的判断，画像求精不求长。
- 可保留 1-2 个标志性细节作人物锚点（如固定外号、反复出现的长期梗），但不要记流水账。
- 群聊：每个发言人有更新就各写一条，actor 原样照抄消息里的「昵称 (openid)」。
- 单聊：写一条且省略 actor（即会话对象本人）。
- 可选：再输出一条省略 actor 的条目，写该会话的用户群像/氛围；禁止给「角色自己」写画像
  （角色设定属于人格内核，不是画像）。
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
  "profiles": [{"actor": "相关发言人标识「昵称 (openid)」（有则照抄）", "text": "更新后的画像全文（只含长期成立的身份/性格/关系/稳定偏好），300字以内"}]
}
要求：memories 最多 5 条，去重合并，丢弃一次性闲聊；只输出 JSON。
旧画像可能混入近期课表、最近安排或一次性对话；不能照抄。时效性事实不进画像，
其中值得记住的可写入情景记忆/会话摘要，不得伪装成稳定语义记忆。
画像对象只限真实用户：禁止给「角色自己」写画像；无 actor 的会话级条目写用户群像/氛围。
可保留 1-2 个标志性细节作人物锚点（固定外号、长期梗），不要流水账。
角色设定：%s

现有画像：%s

情景记忆（[前缀] 为形成时间）：
%s`;

const PROFILE_REVIEW_PROMPT = `你是长期人物画像的编辑，不是聊天摘要器。以下画像草稿可能混入时效性记忆。
逐条核对原画像和草稿，只保留能长期成立的身份背景、稳定偏好、性格和与角色的关系。
删去课表、近期安排、今天/明天发生的事、一次性互动及已过时的判断；不要补造事实。
稳定的作息习惯可以保留，但某一次的课程/日程不能保留。旧画像也必须重新审查，不能原样照抄。
可保留 1-2 个标志性细节作人物锚点（如固定外号、反复出现的长期梗）。
若条目主体是角色本人的设定/形象（外貌、人设、口癖）而非对真实用户的认知，返回空字符串。
没有任何稳定信息时返回空字符串。每条最多 300 字，输出 JSON：
{"profiles":[{"index":0,"text":"整理后的完整画像"}]}
必须给输入中每个 index 各返回一条，index 不变；不要输出其他字段。

待整理画像（actor 仅用于区分人物，不得修改身份）：
%s`;

export interface ProfileReviewItem { actor?: string; previous: string; candidate: string }

export function buildProfileReviewPrompt(items: ProfileReviewItem[]): string {
  return PROFILE_REVIEW_PROMPT.replace('%s', JSON.stringify(items.map((item, index) => ({
    index, actor: item.actor ?? '本会话', previous: item.previous, candidate: item.candidate,
  }))));
}

/**
 * convo 单行文本截断（user/assistant 各自上限）：防病态长输入；
 * 蒸馏取 800（保事实完整），digest 用 cfg.digestTurnCharCap（要主线不要全文）。
 */
const DISTILL_TURN_CAP = 800;
const capText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function buildDistillPrompt(
  turns: Turn[], persona: string, maxNotes: number,
  existing?: MemoryNote[], currentEmotion?: EmotionState,
  existingProfiles?: { actor?: string; text: string }[],
  ctx: TimeCtx = defaultTimeCtx(),
): string {
  // 环境上下文（[Chat history] 末段）取最后一个带 contextText 的轮次：
  // 其块内已含最近环境消息，单块足够；逐轮拼只会重复计费。
  const ctxBlock = [...turns].reverse().find((t) => t.contextText)?.contextText;
  const convo = turns
    .map((t) => `[${formatStamp(t.at, ctx.timeZone)}] ${t.actor ?? '用户'}：${capText(t.userText, DISTILL_TURN_CAP)}\n角色：${capText(t.assistantText, DISTILL_TURN_CAP)}`)
    .join('\n');
  let prompt = PROMPT.replace('%d', String(maxNotes))
    .replace('%s', persona || '（未设定）')
    .replace('%s', ctxBlock ? `${ctxBlock}\n\n${convo}` : convo);
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
    prompt += `\n\n已有记忆（编号供 merge 使用，[前缀] 为形成时间）：\n${existing
      .map((n, i) => `${i}. [${ageLabel(n.createdAt, ctx.now)}] ${n.actor ? `[${n.actor}] ` : ''}${n.content}`)
      .join('\n')}`;
  }
  prompt += `\n\n当前时间：${formatClock(ctx.now, ctx.timeZone)}`;
  return prompt;
}

export function buildConsolidatePrompt(notes: MemoryNote[], profile: string, persona: string, ctx: TimeCtx = defaultTimeCtx()): string {
  const list = notes.map((n) => `- [${ageLabel(n.createdAt, ctx.now)}] ${n.actor ? `[${n.actor}] ` : ''}${n.content}`).join('\n');
  return CONSOLIDATE_PROMPT.replace('%s', persona || '（未设定）')
    .replace('%s', profile || '（暂无）')
    .replace('%s', list);
}

export function buildDigestPrompt(
  turns: Turn[], priorDigest: string, persona: string,
  ctx: TimeCtx = defaultTimeCtx(), turnCharCap = 300,
): string {
  // digest 只要主线脉络：正文按行截断，contextText（环境消息块）整段不读——
  // 它的内容在相邻轮里近乎逐字重复，进窗口等于把同一批消息再付一遍。
  const convo = turns
    .map((t) => `[${formatStamp(t.at, ctx.timeZone)}] ${t.actor ?? '用户'}：${capText(t.userText, turnCharCap)}\n角色：${capText(t.assistantText, turnCharCap)}`)
    .join('\n');
  return DIGEST_PROMPT.replace('%s', persona || '（未设定）')
    .replace('%s', priorDigest || '（暂无）')
    .replace('%s', convo)
    + `\n\n当前时间：${formatClock(ctx.now, ctx.timeZone)}`;
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
        mood: typeof e.mood === 'string' && (MOODS as readonly string[]).includes(e.mood) ? e.mood : undefined,
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
    ctx?: TimeCtx,
  ): Promise<DistillResult> {
    if (!this.enabled || turns.length === 0) return { memories: [] };
    return this.call(buildDistillPrompt(turns, persona, this.cfg.maxNotes, existing, currentEmotion, existingProfiles, ctx));
  }

  /** 语义巩固：把情景记忆提炼为语义记忆 + 重写画像 */
  async consolidate(notes: MemoryNote[], profile: string, persona: string, ctx?: TimeCtx): Promise<DistillResult> {
    if (!this.enabled || notes.length === 0) return { memories: [] };
    return this.call(buildConsolidatePrompt(notes, profile, persona, ctx));
  }

  /** 专门审核画像；失败时不写任何画像，避免未经校验的草稿覆盖旧画像。 */
  async reviewProfiles(items: ProfileReviewItem[]): Promise<string[] | undefined> {
    if (!this.enabled || !items.length) return undefined;
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
          max_tokens: 2048,
          messages: [{ role: 'user', content: buildProfileReviewPrompt(items) }],
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data.choices?.[0]?.message?.content ?? '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return undefined;
      const parsed = JSON.parse(match[0]) as { profiles?: unknown };
      if (!Array.isArray(parsed.profiles) || parsed.profiles.length !== items.length) return undefined;
      const reviewed: string[] = new Array(items.length);
      const seen = new Set<number>();
      for (const entry of parsed.profiles) {
        if (!entry || !Number.isInteger(entry.index) || entry.index < 0
          || entry.index >= items.length || seen.has(entry.index) || typeof entry.text !== 'string') return undefined;
        seen.add(entry.index);
        reviewed[entry.index] = entry.text.trim();
      }
      return reviewed;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 会话滚动摘要：返回纯文本摘要（失败/未启用返回空串） */
  async digest(turns: Turn[], priorDigest: string, persona: string, ctx?: TimeCtx, turnCharCap = 300): Promise<string> {
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
          messages: [{ role: 'user', content: buildDigestPrompt(turns, priorDigest, persona, ctx, turnCharCap) }],
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
          // 群聊多画像+记忆 JSON 会超 700：截断→parse 失败→整轮白调
          max_tokens: 2048,
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
