import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EmotionState, IntentDraft, IntentEntry, IntentStatus, IntentUpdatePatch, MemoryNote, NoteDraft, NoteEmotion, ProfileEntry, SessionDigest } from './types.ts';
import { isSelfContent, MEMORY_SOURCES, notePersonaId, resolveSelfFlag } from './types.ts';
import { isSessionKey, isUserKey, normalizeProfileKey, sessionProfileKey, splitActor, userProfileKey } from './identity.ts';

/**
 * JSONL 追加式存储 + 定期快照压缩。
 * 2C2G 友好：全部常驻内存索引，磁盘只做追加与快照。
 */

type Op =
  | { op: 'add'; note: MemoryNote }
  | { op: 'reinforce'; id: string; strength: number; hits: number; lastAccessAt: number }
  // self 允许 null：PATCH 语义里 null=清除标记回派生态（区分「未传」与「显式 false」）
  | { op: 'update'; id: string; patch: Partial<Pick<MemoryNote, 'content' | 'importance' | 'kind' | 'sourceIds' | 'private'>> & { self?: boolean | null } }
  | { op: 'embed'; id: string; vector: number[] }
  | { op: 'del'; id: string }
  | { op: 'absorb'; ids: string[]; at: number }
  | { op: 'merge'; keepId: string; dropId: string; patch: {
      strength: number; hits: number; importance: number; createdAt: number; lastAccessAt: number;
      actor?: string; emotion?: NoteEmotion; sourceIds?: string[]; private?: string;
    } }
  | { op: 'emotion'; sessionId: string; state: EmotionState }
  | { op: 'profile'; sessionId: string; text: string; key?: string; name?: string; at?: number; sessions?: string[]; reviewed?: string; personaId?: string }
  | { op: 'digest'; sessionId: string; text: string; uptoTurn?: number }
  | { op: 'persona'; text: string }
  | { op: 'persona-save'; persona: PersonaEntry }
  | { op: 'persona-activate'; id: string }
  | { op: 'persona-delete'; id: string }
  | { op: 'reset'; keepPersona?: boolean }
  | { op: 'del-range'; from: number; to: number; ids: string[] }
  | { op: 'del-persona'; personaId: string; ids: string[] }
  | { op: 'sess-domain'; sessionId: string; domain: string }
  // ── standing intents（迭代D）──
  // intent-update.patch：可变配置字段（null=清除）+ status 内部终态转移（公开 updateIntent 不暴露 status）
  | { op: 'intent-add'; intent: IntentEntry }
  | { op: 'intent-update'; id: string; patch: IntentUpdatePatch }
  // intent-fire 携带结果态（firedCount/cooldownUntil/status）：重放确定性，不重算
  | { op: 'intent-fire'; id: string; at: number; firedCount: number; cooldownUntil: number | null; status: IntentStatus }
  | { op: 'intent-del'; id: string };

/**
 * 人设条目：persona=版本/衣服（prompt 文本），characterId=所属角色（灵魂，自我轨归属）。
 * characterId 缺省=自身 id（独立角色）；moods 预留给按人设注入蒸馏情绪枚举（迭代 B 用）。
 * meta=展示主题元数据（B1）：皮肤配色/情绪色/特质/单字头像，永不进 prompt。
 */
export interface PersonaEntry {
  id: string;
  name: string;
  text: string;
  characterId?: string;
  moods?: string[];
  meta?: PersonaMeta;
}

/** 人设主题四色（#rrggbb）：a 主色 / a2 辅色 / soft 柔色 / deep 底色 */
export interface PersonaTheme { a: string; a2: string; soft: string; deep: string }
export interface PersonaTrait { name: string; v: number }

/** 人设展示元数据（脑图皮肤 + D-admin 人设页共用；纯展示字段，不参与检索/蒸馏） */
export interface PersonaMeta {
  theme?: PersonaTheme;
  /** 情绪词 → 色值（覆盖人设 moods 词表的着色；词名键 ≤40 字） */
  moodColors?: Record<string, string>;
  /** 特质条 0..1，≤6 条 */
  traits?: PersonaTrait[];
  /** 单字头像（非 whale 人设的 cortex 头像块） */
  mono?: string;
  /** 英文名（cortex eyebrow 等） */
  en?: string;
  /** 一句话简介 */
  tagline?: string;
}

/** createPersona 可选扩展字段（Brain/HTTP 层共用同一形状） */
export interface PersonaExtra { characterId?: string; moods?: string[]; meta?: PersonaMeta | null }
/** savePersona 补丁：键缺省=保留旧值，null/空=清除（同 characterId/moods 口径） */
export interface PersonaPatch { characterId?: string | null; moods?: string[] | null; meta?: PersonaMeta | null }

/** 导出文件格式（脑图页「备份迁移」） */
export interface BrainExport {
  version: 1;
  exportedAt: number;
  persona: string;
  personas?: PersonaEntry[];
  activePersonaId?: string;
  notes: MemoryNote[];
  emotions: Record<string, EmotionState>;
  /** 键为画像主键（u:/sess:）；值为完整条目，导入时兼容旧版字符串值 */
  profiles: Record<string, ProfileEntry | string>;
  /** 会话滚动摘要（v1 备份可缺省） */
  digests?: Record<string, SessionDigest>;
  /** 私域会话标记 sessionId→domain（v1 备份可缺省） */
  sessionDomains?: Record<string, string>;
  /** standing intents（迭代D；v1 备份可缺省） */
  intents?: IntentEntry[];
}

export interface ImportResult {
  notes: number;
  skipped: number;
  profiles: number;
  emotions: number;
  persona: boolean;
  intents: number;
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** 导入时按入库规范清洗一条记忆；结构不合法返回 undefined */
function sanitizeNoteEmotion(raw: unknown): NoteEmotion | undefined {
  const e = raw as Partial<NoteEmotion> | undefined;
  if (!e || typeof e !== 'object') return undefined;
  return {
    v: Math.min(1, Math.max(-1, num(e.v, 0))),
    a: Math.min(1, Math.max(0, num(e.a, 0))),
    d: Math.min(1, Math.max(-1, num(e.d, 0))),
    label: typeof e.label === 'string' ? e.label : '',
    mood: typeof e.mood === 'string' && e.mood ? e.mood : undefined,
  };
}

function sanitizeNote(raw: unknown, now: number): MemoryNote | undefined {
  const n = raw as Partial<MemoryNote> | undefined;
  if (!n || typeof n.id !== 'string' || !n.id) return undefined;
  if (typeof n.content !== 'string' || !n.content.trim()) return undefined;
  return {
    id: n.id,
    sessionId: typeof n.sessionId === 'string' && n.sessionId ? n.sessionId : 'imported',
    actor: typeof n.actor === 'string' ? n.actor : undefined,
    content: n.content.trim().slice(0, 200),
    importance: Math.min(5, Math.max(1, Math.round(num(n.importance, 3)))),
    kind: n.kind === 'semantic' || n.kind === 'attitude' ? n.kind : 'episodic',
    createdAt: num(n.createdAt, now),
    // 地板取入库可产最小值 0.1（importance≥1 × strengthBoost≥0.1）：
    // 加载/回放是热路径，地板必须幂等——0.5 会把合法低强度记忆每次重放都抬一档
    strength: Math.max(0.1, num(n.strength, 3)),
    hits: Math.max(0, Math.round(num(n.hits, 0))),
    lastAccessAt: num(n.lastAccessAt, now),
    embedding: (Array.isArray(n.embedding) && n.embedding.length)
      ? n.embedding
      : decodeVec((n as { e?: string }).e),
    emotion: sanitizeNoteEmotion(n.emotion),
    sourceIds: Array.isArray(n.sourceIds) && n.sourceIds.length
      ? n.sourceIds.filter((id): id is string => typeof id === 'string' && !!id)
      : undefined,
    personaId: typeof n.personaId === 'string' && n.personaId ? n.personaId : undefined,
    // self 三态：true 标自我轨 / false 显式世界轨（手动修正，启发式不覆盖）/ 缺省走启发式
    self: n.kind === 'attitude' ? undefined
      : n.self === true ? true
      : n.self === false ? false
      : (isSelfContent(n.content) ? true : undefined),
    absorbedAt: num(n.absorbedAt, 0) || undefined,
    private: typeof n.private === 'string' && n.private.trim() ? n.private.trim() : undefined,
    source: typeof n.source === 'string' && (MEMORY_SOURCES as readonly string[]).includes(n.source)
      ? n.source as MemoryNote['source'] : undefined,
  };
}

function sanitizeEmotion(raw: unknown): EmotionState | undefined {
  const e = raw as Partial<EmotionState> | undefined;
  if (!e || typeof e !== 'object') return undefined;
  return {
    v: Math.min(1, Math.max(-1, num(e.v, 0))),
    a: Math.min(1, Math.max(0, num(e.a, 0))),
    d: Math.min(1, Math.max(-1, num(e.d, 0))),
    label: typeof e.label === 'string' ? e.label : '',
    mood: typeof e.mood === 'string' && e.mood ? e.mood : undefined,
    personaId: typeof e.personaId === 'string' && e.personaId ? e.personaId : undefined,
    updatedAt: num(e.updatedAt, Date.now()),
  };
}

const META_COLOR_RE = /^#[0-9a-f]{6}$/i;
const META_TEXT_CAP = 40;
const META_TRAITS_CAP = 6;

function cleanMetaColor(v: unknown): string | undefined {
  return typeof v === 'string' && META_COLOR_RE.test(v) ? v : undefined;
}
function cleanMetaText(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= META_TEXT_CAP ? t : undefined;
}

/**
 * 人设 meta 清洗（B1）：strict=true 时任一字段非法抛错（API 写入→400）；
 * strict=false 时丢弃非法字段保留合法部分（备份导入容错，不整包拒收）。
 * 只保留已知键——meta 是纯展示字段，永不进 prompt。
 */
export function cleanPersonaMeta(raw: unknown, strict = false): PersonaMeta | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    if (strict) throw new Error('人设 meta 格式无效');
    return undefined;
  }
  const m = raw as Record<string, unknown>;
  const bad = (what: string): never => { throw new Error(`人设 meta.${what} 无效`); };
  const out: PersonaMeta = {};

  if (m.theme !== undefined) {
    const t = (m.theme && typeof m.theme === 'object' ? m.theme : {}) as Record<string, unknown>;
    const a = cleanMetaColor(t.a), a2 = cleanMetaColor(t.a2);
    const soft = cleanMetaColor(t.soft), deep = cleanMetaColor(t.deep);
    if (a && a2 && soft && deep) out.theme = { a, a2, soft, deep };
    else if (strict) bad('theme 需含 a/a2/soft/deep 四个 #rrggbb 色值');
  }
  if (m.moodColors !== undefined) {
    if (typeof m.moodColors !== 'object' || m.moodColors === null || Array.isArray(m.moodColors)) {
      if (strict) bad('moodColors 需为 {情绪词: 色值} 对象');
    } else {
      const mc: Record<string, string> = {};
      for (const [k, v] of Object.entries(m.moodColors as Record<string, unknown>)) {
        const key = cleanMetaText(k), color = cleanMetaColor(v);
        if (key && color) mc[key] = color;
        else if (strict) bad(`moodColors 含非法项「${k.slice(0, 20)}」`);
      }
      if (Object.keys(mc).length) out.moodColors = mc;
    }
  }
  if (m.traits !== undefined) {
    if (!Array.isArray(m.traits)) {
      if (strict) bad('traits 需为数组');
    } else {
      if (m.traits.length > META_TRAITS_CAP && strict) bad(`traits 最多 ${META_TRAITS_CAP} 条`);
      const traits: PersonaTrait[] = [];
      for (const t of (m.traits as unknown[]).slice(0, META_TRAITS_CAP)) {
        const name = cleanMetaText((t as PersonaTrait | null)?.name);
        const v = (t as PersonaTrait | null)?.v;
        if (name && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) traits.push({ name, v });
        else if (strict) bad('traits 条目需 {name≤40字, v∈[0,1]}');
      }
      if (traits.length) out.traits = traits;
    }
  }
  for (const k of ['mono', 'en', 'tagline'] as const) {
    if (m[k] !== undefined) {
      const v = cleanMetaText(m[k]);
      if (v) out[k] = v;
      else if (strict) bad(`${k} 需为 ≤${META_TEXT_CAP} 字字符串`);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

const INTENT_STATUSES: readonly IntentStatus[] = ['pending', 'fired', 'expired', 'cancelled'];

function sanitizeIntentMatch(raw: unknown): IntentEntry['match'] | undefined {
  const m = raw as { text?: unknown; actor?: unknown } | undefined;
  if (!m || typeof m !== 'object') return undefined;
  const text = typeof m.text === 'string' && m.text.trim() ? m.text.trim().slice(0, 200) : undefined;
  const actor = typeof m.actor === 'string' && m.actor.trim() ? m.actor.trim().slice(0, 200) : undefined;
  return text || actor ? { text, actor } : undefined;
}

/** 导入/快照回放清洗一条 intent；结构不合法返回 undefined（kind/status 非法回落/丢弃） */
function sanitizeIntent(raw: unknown): IntentEntry | undefined {
  const i = raw as Partial<IntentEntry> | undefined;
  if (!i || typeof i !== 'object') return undefined;
  if (typeof i.id !== 'string' || !i.id) return undefined;
  if (typeof i.text !== 'string' || !i.text.trim()) return undefined;
  const kind = i.kind === 'event' || i.kind === 'time' ? i.kind : undefined;
  if (!kind) return undefined;
  return {
    id: i.id,
    kind,
    text: i.text.trim().slice(0, 200),
    status: INTENT_STATUSES.includes(i.status as IntentStatus) ? i.status as IntentStatus : 'pending',
    createdAt: num(i.createdAt, 0),
    fireAt: num(i.fireAt, 0) || undefined,
    dailyAt: typeof i.dailyAt === 'string' && i.dailyAt.trim() ? i.dailyAt.trim() : undefined,
    match: sanitizeIntentMatch(i.match),
    cooldownMs: num(i.cooldownMs, 0) || undefined,
    cooldownUntil: num(i.cooldownUntil, 0) || undefined,
    maxFires: Number.isInteger(i.maxFires) && (i.maxFires as number) > 0 ? i.maxFires as number : undefined,
    firedCount: Math.max(0, Math.round(num(i.firedCount, 0))),
    lastFiredAt: num(i.lastFiredAt, 0) || undefined,
    expiresAt: num(i.expiresAt, 0) || undefined,
    personaId: typeof i.personaId === 'string' && i.personaId ? i.personaId : undefined,
    sessionId: typeof i.sessionId === 'string' && i.sessionId ? i.sessionId : undefined,
  };
}

/** 流水视图用：op + 写入时刻 */
export interface OpRecord { t: number; op: Op }

export const PROFILE_TEXT_CAP = 500;

/** 画像私域标记：句首〔私〕到句末（。/换行/文末）为私域内容，非私域注入时剥句 */
export const PRIVATE_MARK = '〔私〕';

/** 剥去〔私〕开头的私域句：公开会话注入用（句间空白收束） */
export function stripPrivateSegments(text: string): string {
  return text.replace(/〔私〕[^。\n]*(。|\n|$)/g, '').replace(/ {2,}/g, ' ').trim();
}

/** 私域注入：保留私段内容，只去标记符 */
export function stripPrivateMarks(text: string): string {
  return text.replace(/〔私〕/g, '');
}

/**
 * 画像文本截断：超出上限时优先在上限内最后一个句末标点处收束，
 * 避免从句子中间切断；句末标点太靠前（<40%）或没有时退到分句标点，
 * 分句标点也没有才硬切——线上出过画像以半句残文落盘。
 */
export function truncateProfileText(text: string, cap: number): string {
  const t = text.trim();
  if (t.length <= cap) return t;
  const head = t.slice(0, cap);
  const end = Math.max(
    head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'),
    head.lastIndexOf('!'), head.lastIndexOf('?'), head.lastIndexOf('；'),
    head.lastIndexOf(';'), head.lastIndexOf('\n'),
  );
  const closeTail = (cut: number) => {
    while (cut < head.length && '」』”’"'.includes(head[cut]!)) cut++;
    return cut;
  };
  if (end >= Math.floor(cap * 0.4)) return head.slice(0, closeTail(end + 1));
  const soft = Math.max(
    head.lastIndexOf('，'), head.lastIndexOf('、'), head.lastIndexOf('：'),
    head.lastIndexOf(','), head.lastIndexOf(':'),
  );
  if (soft >= Math.floor(cap * 0.6)) return head.slice(0, soft);
  return head;
}

// ── 向量编解码：派生态以 base64(f32) 存快照，不进 op 流水 ──
function encodeVec(v: number[]): string {
  const buf = Buffer.alloc(v.length * 4);
  v.forEach((x, i) => buf.writeFloatLE(x, i * 4));
  return buf.toString('base64');
}
function decodeVec(s: unknown): number[] | undefined {
  if (typeof s !== 'string' || !s) return undefined;
  const buf = Buffer.from(s, 'base64');
  const f = new Float32Array(Math.floor(buf.length / 4));
  for (let i = 0; i < f.length; i++) f[i] = buf.readFloatLE(i * 4);
  return [...f];
}

export class BrainStore {
  private notes = new Map<string, MemoryNote>();
  private emotions = new Map<string, EmotionState>();
  /** 会话滚动摘要 */
  private digests = new Map<string, SessionDigest>();
  /** 画像按人存储：键 u:<openid>（发言人）或 sess:<sessionId>（兜底） */
  private profiles = new Map<string, ProfileEntry>();
  /** 私域会话标记：sessionId → domain 名（同域会话共享信任域；未标记=公开） */
  private sessionDomains = new Map<string, string>();
  private personaText = '';
  private personaEntries = new Map<string, PersonaEntry>();
  private activeId = '';
  /** standing intents（迭代D）：前瞻记忆，体量小不用二级索引 */
  private intents = new Map<string, IntentEntry>();
  /** 版本号：任何写入后 +1，检索器据此重建索引 */
  version = 0;
  /** 边集相关版本：仅记忆内容/结构/向量变化时递增（reinforce/emotion 等不计）——graphEdges 缓存键 */
  graphVersion = 0;
  private dirtyOps = 0;
  /** 最近操作流水（环形，供"事件流水"页查看真实落盘历史） */
  private opsLog: OpRecord[] = [];
  private static readonly OPS_LOG_CAP = 500;
  /** 物理遗忘谓词（由 Brain 按衰减参数注入）：快照时真删除返回 true 的记忆 */
  shouldEvict?: (n: MemoryNote, now: number) => boolean;
  private readonly file: string;
  private readonly snapshotFile: string;
  private readonly compactEvery: number;

  constructor(dir: string, compactEvery = 200) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'brain.jsonl');
    this.snapshotFile = join(dir, 'brain.snapshot.json');
    this.compactEvery = compactEvery;
    this.load();
  }

  private load(): void {
    if (existsSync(this.snapshotFile)) {
      try {
        const snap = JSON.parse(readFileSync(this.snapshotFile, 'utf8')) as {
          notes: MemoryNote[]; emotions: Record<string, EmotionState>;
          profiles: Record<string, ProfileEntry | string>; persona: string;
          digests?: Record<string, SessionDigest>;
          personas?: PersonaEntry[]; activePersonaId?: string;
          sessionDomains?: Record<string, string>;
          intents?: IntentEntry[];
        };
        for (const [k, v] of Object.entries(snap.sessionDomains ?? {})) {
          if (typeof v === 'string' && v) this.sessionDomains.set(k, v);
        }
        const loadNow = Date.now();
        for (const raw of snap.notes ?? []) {
          // 快照回放同样过 sanitize：self 启发式在此对存量生效（旧快照无 self 字段），
          // 向量 e(base64) 由 sanitizeNote 内部解码
          const n = sanitizeNote(raw, loadNow);
          if (n) this.notes.set(n.id, n);
        }
        for (const [k, v] of Object.entries(snap.emotions ?? {})) {
          const e = sanitizeEmotion(v);
          if (e) this.emotions.set(k, e);
        }
        for (const [k, v] of Object.entries(snap.digests ?? {})) this.digests.set(k, v);
        // 旧快照：键为裸 sessionId、值为字符串 → 迁移为 sess: 键 + 完整条目
        for (const [k, v] of Object.entries(snap.profiles ?? {})) {
          const key = normalizeProfileKey(k);
          const e: Partial<ProfileEntry> = typeof v === 'string' ? { text: v } : v;
          this.profiles.set(key, {
            text: e.text ?? '',
            name: e.name ?? '',
            sessions: e.sessions ?? (key.startsWith('sess:') ? [key.slice(5)] : []),
            updatedAt: e.updatedAt ?? 0,
            reviewed: e.reviewed,
          });
        }
        this.personaText = snap.persona ?? '';
        for (const entry of snap.personas ?? []) {
          if (typeof entry.id === 'string' && typeof entry.name === 'string' && typeof entry.text === 'string')
            this.personaEntries.set(entry.id, entry);
        }
        for (const raw of snap.intents ?? []) {
          const it = sanitizeIntent(raw);
          if (it) this.intents.set(it.id, it);
        }
        if (snap.activePersonaId && this.personaEntries.has(snap.activePersonaId))
          this.activeId = snap.activePersonaId;
        if (!this.activeId && this.personaText) {
          this.personaEntries.set('legacy', { id: 'legacy', name: '原有人设', text: this.personaText });
          this.activeId = 'legacy';
        }
      } catch { /* 快照损坏时仅依赖 jsonl 重放 */ }
    }
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line) as OpRecord & Op;
          this.apply(rec);
          // embed 是派生态不进事件流水展示（兼容重放旧 op）
          if (rec.op !== 'embed') this.pushOp({ t: rec.t ?? 0, op: rec });
        } catch { /* 跳过坏行 */ }
      }
    }
  }

  private apply(op: Op): void {
    switch (op.op) {
      case 'add': {
        // 回放同样过 sanitize：旧 op 无 self 字段时启发式补标，自我轨隔离对存量生效
        const n = sanitizeNote(op.note, Date.now());
        if (n) this.notes.set(n.id, n);
        break;
      }
      case 'reinforce': {
        const n = this.notes.get(op.id);
        if (n) { n.strength = op.strength; n.hits = op.hits; n.lastAccessAt = op.lastAccessAt; }
        break;
      }
      case 'update': {
        const n = this.notes.get(op.id);
        if (n) {
          if (op.patch.content != null) n.content = op.patch.content.trim().slice(0, 200);
          if (op.patch.importance != null) n.importance = Math.min(5, Math.max(1, Math.round(op.patch.importance)));
          if (op.patch.kind != null) n.kind = op.patch.kind;
          if (op.patch.sourceIds != null) n.sourceIds = op.patch.sourceIds;
          // 存在性判断：'' 清除为派生态（undefined），其余原样存（含 'public' 强制公开）
          if ('private' in op.patch) n.private = op.patch.private?.trim() || undefined;
          // self 三态：true 标自我轨 / false 显式世界轨 / undefined 清除（键存在才生效）
          if ('self' in op.patch) n.self = op.patch.self === true ? true : op.patch.self === false ? false : undefined;
        }
        break;
      }
      case 'embed': {
        const n = this.notes.get(op.id);
        if (n) n.embedding = op.vector;
        break;
      }
      case 'del': this.notes.delete(op.id); break;
      case 'absorb':
        for (const id of op.ids) {
          const n = this.notes.get(id);
          if (n) n.absorbedAt = op.at;
        }
        break;
      case 'merge': {
        const n = this.notes.get(op.keepId);
        if (n) Object.assign(n, op.patch);
        this.notes.delete(op.dropId);
        break;
      }
      case 'emotion': {
        const e = sanitizeEmotion(op.state);
        if (e) this.emotions.set(op.sessionId, e);
        break;
      }
      case 'digest':
        // 空文本即删除语义：clearDigest 通过空 text op 清脉络
        if (!op.text.trim()) { this.digests.delete(op.sessionId); break; }
        this.digests.set(op.sessionId, {
          text: op.text,
          uptoTurn: op.uptoTurn ?? this.digests.get(op.sessionId)?.uptoTurn ?? 0,
          updatedAt: Date.now(),
        });
        break;
      case 'profile': {
        // 旧 op 无 key → 按 sessionId 兜底为 sess: 键
        const key = op.key ? normalizeProfileKey(op.key) : sessionProfileKey(op.sessionId);
        if (!op.text.trim()) {
          this.profiles.delete(key);
          break;
        }
        const prev = this.profiles.get(key);
        this.profiles.set(key, {
          text: truncateProfileText(op.text, PROFILE_TEXT_CAP),
          name: op.name ?? prev?.name ?? '',
          sessions: [...new Set([...(prev?.sessions ?? []), op.sessionId, ...(op.sessions ?? [])])]
            .filter(Boolean),
          updatedAt: op.at ?? Date.now(),
          reviewed: op.reviewed ?? prev?.reviewed,
          lastWrittenByPersona: op.personaId ?? prev?.lastWrittenByPersona,
        });
        break;
      }
      case 'persona': {
        const id = this.activeId || 'legacy';
        const old = this.personaEntries.get(id);
        this.personaEntries.set(id, {
          id, name: old?.name ?? '原有人设', text: op.text,
          characterId: old?.characterId, moods: old?.moods, meta: old?.meta,
        });
        this.activeId = id;
        this.personaText = op.text;
        break;
      }
      case 'persona-save':
        this.personaEntries.set(op.persona.id, op.persona);
        if (this.activeId === op.persona.id) this.personaText = op.persona.text;
        break;
      case 'persona-activate':
        this.activeId = op.id;
        this.personaText = this.personaEntries.get(op.id)?.text ?? '';
        break;
      case 'persona-delete':
        this.personaEntries.delete(op.id);
        break;
      case 'reset':
        this.notes.clear();
        this.emotions.clear();
        this.profiles.clear();
        this.digests.clear();
        this.intents.clear();
        if (!op.keepPersona) {
          this.personaText = '';
          this.personaEntries.clear();
          this.activeId = '';
        }
        break;
      case 'del-range':
        for (const id of op.ids) this.notes.delete(id);
        break;
      case 'del-persona':
        for (const id of op.ids) this.notes.delete(id);
        break;
      case 'sess-domain':
        if (op.domain) this.sessionDomains.set(op.sessionId, op.domain);
        else this.sessionDomains.delete(op.sessionId);
        break;
      case 'intent-add': {
        const it = sanitizeIntent(op.intent);
        if (it) this.intents.set(it.id, it);
        break;
      }
      case 'intent-update': {
        const it = this.intents.get(op.id);
        if (it) {
          const p = op.patch;
          if (p.text !== undefined) it.text = p.text.trim().slice(0, 200);
          // 可选字段：undefined 跳过 / null 清除 / 其余赋值（JSON 落盘后 undefined 键本就不存在）
          for (const k of ['match', 'fireAt', 'dailyAt', 'cooldownMs', 'maxFires', 'expiresAt', 'sessionId', 'personaId'] as const) {
            const v = p[k];
            if (v !== undefined) (it as unknown as Record<string, unknown>)[k] = v ?? undefined;
          }
          if (p.status !== undefined) it.status = p.status;
        }
        break;
      }
      case 'intent-fire': {
        const it = this.intents.get(op.id);
        if (it) {
          it.firedCount = op.firedCount;
          it.lastFiredAt = op.at;
          it.cooldownUntil = op.cooldownUntil ?? undefined;
          it.status = op.status;
        }
        break;
      }
      case 'intent-del':
        this.intents.delete(op.id);
        break;
    }
  }

  private pushOp(rec: OpRecord): void {
    this.opsLog.push(rec);
    if (this.opsLog.length > BrainStore.OPS_LOG_CAP) this.opsLog.splice(0, this.opsLog.length - BrainStore.OPS_LOG_CAP);
  }

  private persist(op: Op): void {
    this.apply(op);
    const rec = { t: Date.now(), ...op };
    appendFileSync(this.file, JSON.stringify(rec) + '\n');
    this.pushOp({ t: rec.t, op });
    this.version++;
    // persona-activate 也要 bump：态度分轨下切人设会改变检索可见池，
    // 不重建索引会命中缓存里的他人设态度（低频操作，重建代价可忽略）。
    // persona-save/delete 同理：characterId/moods 变更改变自我轨归属判定
    if (op.op === 'add' || op.op === 'update' || op.op === 'del'
      || op.op === 'merge' || op.op === 'reset' || op.op === 'embed'
      || op.op === 'del-range' || op.op === 'del-persona'
      || op.op === 'sess-domain'
      || op.op === 'persona-activate' || op.op === 'persona-save'
      || op.op === 'persona-delete') this.graphVersion++;
    if (++this.dirtyOps >= this.compactEvery) this.compact();
  }

  private compact(): void {
    if (this.shouldEvict) {
      const now = Date.now();
      for (const n of [...this.notes.values()]) {
        if (this.shouldEvict(n, now)) { this.notes.delete(n.id); this.graphVersion++; }
      }
    }
    const snap = {
      notes: [...this.notes.values()].map((n) =>
        n.embedding
          ? { ...n, embedding: undefined, e: encodeVec(n.embedding) }
          : n),
      emotions: Object.fromEntries(this.emotions),
      profiles: Object.fromEntries(this.profiles),
      digests: Object.fromEntries(this.digests),
      persona: this.personaText,
      personas: [...this.personaEntries.values()],
      activePersonaId: this.activeId,
      sessionDomains: Object.fromEntries(this.sessionDomains),
      intents: [...this.intents.values()],
    };
    const tmp = this.snapshotFile + '.tmp';
    writeFileSync(tmp, JSON.stringify(snap));
    renameSync(tmp, this.snapshotFile);
    writeFileSync(this.file, '');
    this.dirtyOps = 0;
  }

  // ── 记忆 ──

  addNote(sessionId: string, draft: NoteDraft, now: number): MemoryNote {
    const content = draft.content.trim().slice(0, 200);
    const note: MemoryNote = {
      id: randomUUID(),
      sessionId,
      actor: draft.actor,
      content,
      importance: Math.min(5, Math.max(1, Math.round(draft.importance ?? 3))),
      kind: draft.kind ?? 'episodic',
      createdAt: now,
      strength: Math.min(5, Math.max(1, Math.round(draft.importance ?? 3)))
        * Math.min(3, Math.max(0.1, draft.strengthBoost ?? 1)),
      hits: 0,
      lastAccessAt: now,
      emotion: draft.emotion ? sanitizeNoteEmotion(draft.emotion) : undefined,
      sourceIds: draft.sourceIds?.length ? [...draft.sourceIds] : undefined,
      // 空串归一化为缺失：无人设期写的 '' 否则会让 notePersonaId 归不到任何轨
      personaId: draft.personaId || undefined,
      // 自我轨统一兜底：attitude 恒自我轨不写 self；其余 LLM self 优先、启发式补漏
      self: resolveSelfFlag(draft.kind, draft.self, content),
      private: draft.private?.trim() || undefined,
      // 来源戳由调用方给（蒸馏='user'/脑图='manual'/导入='import'）；缺省留空视同 user 系
      source: draft.source,
    };
    if (!note.content) return note;
    this.persist({ op: 'add', note });
    return note;
  }

  /** 巩固吸收：给源情景记忆打 absorbedAt 戳，退出检索池与巩固候选（保留存档可查） */
  markAbsorbed(ids: string[], at: number): void {
    const live = ids.filter((id) => this.notes.has(id));
    if (live.length) this.persist({ op: 'absorb', ids: live, at });
  }

  /**
   * 近重复合并：把 drop 的价值并入 keep 后删除 drop。
   * 强度 = max + min×0.5（封顶 cap，复读次数应体现在强度而非简单取大）；
   * hits 求和、importance 取大、createdAt 取早（记忆形成于更早）、
   * lastAccessAt 取新；keep 缺的 actor/emotion 由 drop 补；sourceIds 取并集。
   * 注意：其他记忆的 sourceIds 若引用 dropId 会成为悬垂引用，图谱边生成时按存活集过滤即可。
   */
  mergeNotes(keepId: string, dropId: string, cap: number): boolean {
    const keep = this.notes.get(keepId), drop = this.notes.get(dropId);
    if (!keep || !drop || keepId === dropId) return false;
    this.persist({
      op: 'merge', keepId, dropId,
      patch: {
        strength: Math.min(cap, Math.max(keep.strength, drop.strength) + Math.min(keep.strength, drop.strength) * 0.5),
        hits: keep.hits + drop.hits,
        importance: Math.max(keep.importance, drop.importance),
        createdAt: Math.min(keep.createdAt, drop.createdAt),
        lastAccessAt: Math.max(keep.lastAccessAt, drop.lastAccessAt),
        actor: keep.actor ?? drop.actor,
        emotion: keep.emotion ?? drop.emotion,
        sourceIds: [...new Set([...(keep.sourceIds ?? []), ...(drop.sourceIds ?? [])])]
          .filter((id) => id !== keepId && id !== dropId),
        // 私域覆盖取并集之严：任一带覆盖结果都带覆盖（生效域另由来源会话派生兜底）
        private: keep.private ?? drop.private,
      },
    });
    return true;
  }

  /** 命中强化：S+step（封顶），记录唤起时刻与次数 */
  reinforce(note: MemoryNote, step: number, cap: number, now: number): void {
    const strength = Math.min(cap, note.strength + step);
    this.persist({
      op: 'reinforce', id: note.id, strength,
      hits: note.hits + 1, lastAccessAt: now,
    });
  }

  allNotes(): MemoryNote[] {
    return [...this.notes.values()];
  }

  /**
   * 写入/回填语义向量（不更新衰减字段）。
   * 向量是派生态：只进内存 + 快照（base64），不落 op 流水——
   * 重启快照间隙的向量丢失由启动回填兜底（每次最多 5 条/30s）。
   */
  setEmbedding(id: string, vector: number[]): void {
    if (!vector.length) return;
    this.apply({ op: 'embed', id, vector });
    this.version++;
    // 向量进边集计算，与 persist 的 embed 分支同一口径
    this.graphVersion++;
  }

  // ── 会话滚动摘要 ──

  setDigest(sessionId: string, text: string, uptoTurn: number): void {
    if (!text.trim()) return;
    this.persist({ op: 'digest', sessionId, text: text.trim(), uptoTurn });
  }

  /** 清空会话脉络：空文本 digest op 即删除语义（setDigest 只写非空） */
  clearDigest(sessionId: string): void {
    this.persist({ op: 'digest', sessionId, text: '' });
  }

  digestOf(sessionId: string): SessionDigest | undefined {
    return this.digests.get(sessionId);
  }

  noteById(id: string): MemoryNote | undefined {
    return this.notes.get(id);
  }

  updateNote(id: string, patch: Partial<Pick<MemoryNote, 'content' | 'importance' | 'kind' | 'sourceIds' | 'private'>> & { self?: boolean | null }): boolean {
    if (!this.notes.has(id)) return false;
    this.persist({ op: 'update', id, patch });
    return true;
  }

  deleteNote(id: string): boolean {
    if (!this.notes.has(id)) return false;
    this.persist({ op: 'del', id });
    return true;
  }

  /** 按 id 手动强化（脑图页"强化"按钮） */
  reinforceById(id: string, step: number, cap: number, now: number): boolean {
    const n = this.notes.get(id);
    if (!n) return false;
    this.reinforce(n, step, cap, now);
    return true;
  }

  /**
   * 按时间段批量删除记忆（脑图页「危险区」）。
   * createdAt ∈ [from, to] 闭区间；op 显式携带 id 列表而非区间谓词——
   * 重放时若重算区间，会把本 op 之后才入库、但 createdAt 落在区间内的
   * 记忆（如随后导入的备份）误删。空集不落 op。
   */
  deleteNotesInRange(from: number, to: number): string[] {
    const ids = [...this.notes.values()]
      .filter((n) => n.createdAt >= from && n.createdAt <= to)
      .map((n) => n.id);
    if (ids.length) this.persist({ op: 'del-range', from, to, ids });
    return ids;
  }

  /**
   * 按归属人设批量删除记忆（脑图页「危险区·按人设删除」）。
   * op 显式携带 id 列表，与 del-range 同理防重放误删后入库记忆。空集不落 op。
   */
  deleteNotesByPersona(personaId: string): string[] {
    const ids = [...this.notes.values()]
      .filter((n) => notePersonaId(n) === personaId)
      .map((n) => n.id);
    if (ids.length) this.persist({ op: 'del-persona', personaId, ids });
    return ids;
  }

  /** 清空全部记忆数据但保留人设（脑图页「记忆重置」；全清走 importData replace） */
  resetMemory(): void {
    this.persist({ op: 'reset', keepPersona: true });
  }

  /** 全部已知会话：记忆 / 会话级画像 / 情绪三个来源的并集 */
  sessions(): { sessionId: string; noteCount: number; profile: string; profileName: string; emotion?: EmotionState; domain: string }[] {
    const ids = new Set<string>([
      ...[...this.profiles.keys()].filter(isSessionKey).map((k) => k.slice(5)),
      ...this.emotions.keys(),
      ...this.sessionDomains.keys(),
      ...[...this.notes.values()].map((n) => n.sessionId),
    ]);
    return [...ids].map((sessionId) => {
      const entry = this.profiles.get(sessionProfileKey(sessionId));
      return {
        sessionId,
        noteCount: [...this.notes.values()].filter((n) => n.sessionId === sessionId).length,
        profile: entry?.text ?? '',
        // sess 画像 name=私聊发言人绑定（画像卡编辑写入；空=未绑定）
        profileName: entry?.name ?? '',
        emotion: this.emotions.get(sessionId),
        domain: this.sessionDomains.get(sessionId) ?? '',
      };
    });
  }

  // ── 私域会话标记 ──

  /** 会话所属私域名；未标记返回 '' */
  sessionDomainOf(sessionId: string): string {
    return this.sessionDomains.get(sessionId) ?? '';
  }

  /** 已登记域名集合：区分 note.private 是「域名覆盖」还是「钉到某 sessionId」 */
  domainNames(): Set<string> {
    return new Set(this.sessionDomains.values());
  }

  isPrivateSession(sessionId: string): boolean {
    return this.sessionDomains.has(sessionId);
  }

  /**
   * 标记/清除会话私域：domain 非空=标为该域（同名共享信任域），空串=清除回公开。
   * 'public' 是 note.private 的保留覆盖值，禁作域名防止双关。
   */
  setSessionDomain(sessionId: string, domain: string): void {
    const d = domain.trim();
    if (!sessionId.trim()) throw new Error('sessionId 不能为空');
    if (d === 'public') throw new Error("'public' 是保留作用域值，不能用作域名");
    this.persist({ op: 'sess-domain', sessionId: sessionId.trim(), domain: d });
  }

  /**
   * 已知发言人注册表：openid → 昵称。
   * 来源：全部记忆的 actor（真实 tag）+ 已确认的 u: 画像键。
   * 用途：校验蒸馏产出的画像身份——LLM 可能抄错/幻觉 openid，只认真实出现过的。
   */
  speakers(): Map<string, string> {
    const reg = new Map<string, string>();
    for (const n of this.notes.values()) {
      if (!n.actor) continue;
      const id = splitActor(n.actor);
      if (id.openid) reg.set(id.openid, id.nick);
    }
    for (const [key, e] of this.profiles) {
      if (isUserKey(key)) reg.set(key.slice(2), e.name || reg.get(key.slice(2)) || '');
    }
    return reg;
  }

  /** 画像卡片（脑图页）：按人（u:）在前、会话级（sess:）在后，按更新时间倒序 */
  people(): {
    key: string; kind: 'person' | 'session'; name: string; openid?: string;
    text: string; sessions: string[]; updatedAt: number;
  }[] {
    return [...this.profiles.entries()]
      .map(([key, e]) => {
        const person = isUserKey(key);
        return {
          key,
          kind: (person ? 'person' : 'session') as 'person' | 'session',
          name: e.name || (person ? key.slice(2).slice(0, 8) : key.slice(5).slice(0, 8)),
          openid: person ? key.slice(2) : undefined,
          text: e.text,
          sessions: e.sessions,
          updatedAt: e.updatedAt,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** 最近操作流水（新→旧），limit 截断 */
  recentOps(limit = 100): OpRecord[] {
    return this.opsLog.slice(-limit).reverse();
  }

  /**
   * B3 流水分页（新→旧）：环形缓冲内过滤，不新增落盘。
   * types=op 名集合（空集=不过滤）；from/to=ms 时间戳闭区间。
   */
  opsPage(q: { types?: ReadonlySet<string>; from?: number; to?: number; page: number; size: number }): { ops: OpRecord[]; total: number } {
    const filtered: OpRecord[] = [];
    for (let i = this.opsLog.length - 1; i >= 0; i--) {
      const r = this.opsLog[i]!;
      if (q.from != null && r.t < q.from) continue;
      if (q.to != null && r.t > q.to) continue;
      if (q.types?.size && !q.types.has(r.op.op)) continue;
      filtered.push(r);
    }
    const start = (q.page - 1) * q.size;
    return { ops: filtered.slice(start, start + q.size), total: filtered.length };
  }

  // ── 情绪 / 画像 / 人格 ──

  setEmotion(sessionId: string, state: EmotionState): void {
    this.persist({ op: 'emotion', sessionId, state });
  }

  emotionOf(sessionId: string): EmotionState | undefined {
    return this.emotions.get(sessionId);
  }

  /** 会话级画像写入（旧接口；等价于 setProfileEntry(sess:sessionId)） */
  setProfile(sessionId: string, text: string): void {
    this.persist({ op: 'profile', sessionId, text });
  }

  /** 按身份键写画像：u:<openid> 或 sess:<id>；name/sessionId/sessions 用于展示与归属追踪 */
  setProfileEntry(key: string, text: string, meta?: { sessionId?: string; name?: string; sessions?: string[]; reviewed?: string; personaId?: string }): void {
    this.persist({
      op: 'profile',
      sessionId: meta?.sessionId ?? key,
      key,
      name: meta?.name,
      sessions: meta?.sessions,
      text,
      reviewed: meta?.reviewed,
      personaId: meta?.personaId || undefined,
      at: Date.now(),
    });
  }

  /** 该画像键上次审核产出的文本；与当前 text 相同即「已审」，缺省/不一致=需重审 */
  reviewedOf(key: string): string {
    return this.profiles.get(normalizeProfileKey(key))?.reviewed ?? '';
  }

  hasProfile(key: string): boolean {
    return this.profiles.has(normalizeProfileKey(key));
  }

  /** 完整画像条目（编辑/重生成需要 name/sessions 等元数据，profileOf 只给文本） */
  profileEntry(key: string): ProfileEntry | undefined {
    const e = this.profiles.get(normalizeProfileKey(key));
    return e ? { ...e, sessions: [...e.sessions] } : undefined;
  }

  /**
   * 画像查询：id 可为完整键（u:/sess:）或裸 sessionId（自动补 sess: 前缀）。
   */
  profileOf(id: string): string {
    return this.profiles.get(id)?.text ?? this.profiles.get(sessionProfileKey(id))?.text ?? '';
  }

  /**
   * 读侧画像归并：QQ openid 按上下文不同，同一人可能散在多个 u: 键。
   * 命中 openid 精确匹配或 name 完全相同的所有 u: 条目，按更新时间倒序
   * 去重拼接（封顶 400 字）；无命中返回空串。
   * includePrivate=false 剥去〔私〕私域句（公开会话注入）；true 保内容只去标记符。
   */
  mergedUserProfile(opts: { openid?: string; nick?: string; includePrivate?: boolean }): string {
    const picks: ProfileEntry[] = [];
    const seen = new Set<string>();
    for (const [key, e] of this.profiles) {
      if (!isUserKey(key)) continue;
      const hit = (opts.openid && key === userProfileKey(opts.openid))
        || (opts.nick && e.name && e.name === opts.nick);
      if (hit && !seen.has(e.text)) {
        seen.add(e.text);
        picks.push(e);
      }
    }
    picks.sort((a, b) => b.updatedAt - a.updatedAt);
    const joined = picks.map((e) => e.text.trim()).filter(Boolean).join(' ');
    const text = opts.includePrivate ? stripPrivateMarks(joined) : stripPrivateSegments(joined);
    return text.slice(0, 400);
  }

  setPersona(text: string): void {
    const value = text.trim();
    if (!value) throw new Error('人设内容不能为空');
    if (!this.activeId) this.persist({ op: 'persona', text: value });
    else this.savePersona(this.activeId, this.personaEntries.get(this.activeId)!.name, value);
  }

  persona(): string {
    return this.personaText;
  }

  listPersonas(): PersonaEntry[] {
    return [...this.personaEntries.values()].map((p) => ({ ...p }));
  }

  /** 人设条目查询（characterId 解析等读侧用；返回拷贝防外部改动内部表） */
  personaEntry(id: string): PersonaEntry | undefined {
    const p = this.personaEntries.get(id);
    return p ? { ...p } : undefined;
  }

  activePersonaId(): string {
    return this.activeId;
  }

  createPersona(
    name: string, text: string, id: string = randomUUID(),
    extra?: PersonaExtra,
  ): PersonaEntry {
    const persona = this.validPersona(id, name, text);
    if (extra?.characterId?.trim()) persona.characterId = extra.characterId.trim();
    if (extra?.moods?.length) persona.moods = extra.moods.filter((m) => typeof m === 'string' && m.trim());
    const meta = cleanPersonaMeta(extra?.meta, true);
    if (meta) persona.meta = meta;
    if (this.personaEntries.has(id)) throw new Error('人设 ID 已存在');
    this.persist({ op: 'persona-save', persona });
    return persona;
  }

  /**
   * patch 只覆盖显式给出的键：characterId/moods/meta 缺省保留旧值，null/空串清除——
   * 改人设文本不应顺手抹掉角色归属与展示主题。
   */
  savePersona(
    id: string, name: string, text: string,
    patch?: PersonaPatch,
  ): PersonaEntry {
    const prev = this.personaEntries.get(id);
    if (!prev) throw new Error('人设不存在');
    const persona = this.validPersona(id, name, text);
    persona.characterId = patch && 'characterId' in patch
      ? (patch.characterId?.trim() || undefined)
      : prev.characterId;
    persona.moods = patch && 'moods' in patch
      ? (patch.moods?.length ? patch.moods.filter((m) => typeof m === 'string' && m.trim()) : undefined)
      : prev.moods;
    persona.meta = patch && 'meta' in patch
      ? cleanPersonaMeta(patch.meta, true)
      : prev.meta;
    this.persist({ op: 'persona-save', persona });
    return persona;
  }

  activatePersona(id: string): void {
    if (!this.personaEntries.has(id)) throw new Error('人设不存在');
    if (id !== this.activeId) this.persist({ op: 'persona-activate', id });
  }

  deletePersona(id: string): void {
    if (!this.personaEntries.has(id)) throw new Error('人设不存在');
    if (id === this.activeId) throw new Error('当前人设不能删除');
    this.persist({ op: 'persona-delete', id });
  }

  private validPersona(id: string, name: string, text: string): PersonaEntry {
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim() || typeof text !== 'string' || !text.trim())
      throw new Error('人设名称和内容不能为空');
    if (name.trim().length > 80 || text.length > 50_000) throw new Error('人设过长');
    return { id, name: name.trim(), text: text.trim() };
  }

  // ── standing intents（迭代D prospective memory）──

  /** 新建 intent：id/status/createdAt/firedCount 由存储层钉死，draft 只带可变字段 */
  addIntent(draft: IntentDraft, now: number): IntentEntry {
    const entry: IntentEntry = {
      id: randomUUID(),
      kind: draft.kind,
      text: draft.text.trim().slice(0, 200),
      status: 'pending',
      createdAt: now,
      firedCount: 0,
      match: draft.match,
      fireAt: draft.fireAt,
      dailyAt: draft.dailyAt,
      cooldownMs: draft.cooldownMs,
      maxFires: draft.maxFires,
      expiresAt: draft.expiresAt,
      personaId: draft.personaId || undefined,
      sessionId: draft.sessionId || undefined,
    };
    this.persist({ op: 'intent-add', intent: entry });
    return { ...entry, match: entry.match ? { ...entry.match } : undefined };
  }

  /** 配置字段补丁（null=清除）；status 仅供内核终态转移（cancel/expire/maxFires） */
  updateIntent(id: string, patch: IntentUpdatePatch): IntentEntry | undefined {
    if (!this.intents.has(id)) return undefined;
    this.persist({ op: 'intent-update', id, patch });
    return this.intentById(id);
  }

  /** 触发落账：firedCount/lastFiredAt/cooldownUntil/status 由调用方算好随 op 落盘（重放确定性） */
  fireIntent(id: string, fire: { at: number; firedCount: number; status: IntentStatus; cooldownUntil?: number }): IntentEntry | undefined {
    if (!this.intents.has(id)) return undefined;
    this.persist({
      op: 'intent-fire', id, at: fire.at, firedCount: fire.firedCount,
      cooldownUntil: fire.cooldownUntil ?? null, status: fire.status,
    });
    return this.intentById(id);
  }

  deleteIntent(id: string): boolean {
    if (!this.intents.has(id)) return false;
    this.persist({ op: 'intent-del', id });
    return true;
  }

  allIntents(): IntentEntry[] {
    return [...this.intents.values()].map((i) => ({ ...i, match: i.match ? { ...i.match } : undefined }));
  }

  intentById(id: string): IntentEntry | undefined {
    const i = this.intents.get(id);
    return i ? { ...i, match: i.match ? { ...i.match } : undefined } : undefined;
  }

  // ── 导出 / 导入（脑图页「备份迁移」）──

  exportData(now: number): BrainExport {
    return {
      version: 1,
      exportedAt: now,
      persona: this.personaText,
      personas: this.listPersonas(),
      activePersonaId: this.activeId,
      notes: [...this.notes.values()],
      emotions: Object.fromEntries(this.emotions),
      profiles: Object.fromEntries(this.profiles),
      digests: Object.fromEntries(this.digests),
      sessionDomains: Object.fromEntries(this.sessionDomains),
      intents: [...this.intents.values()],
    };
  }

  /**
   * 导入备份文件。
   * merge：按 id 去重补入，已存在的 id 跳过（本地数据优先）；
   * replace：先写 reset op 清库，再整包回放。
   * 记忆保留原 id/createdAt/strength/lastAccessAt，衰减保持率迁移后不重置。
   */
  importData(raw: unknown, mode: 'merge' | 'replace', now: number): ImportResult {
    const data = raw as Partial<BrainExport> | null;
    if (!data || typeof data !== 'object') throw new Error('备份文件格式无效');
    if (data.notes != null && !Array.isArray(data.notes)) throw new Error('备份文件 notes 字段无效');
    if (data.personas != null && (!Array.isArray(data.personas)
      || data.personas.some((p) => !p || typeof p !== 'object'
        || typeof p.id !== 'string' || !p.id.trim()
        || typeof p.name !== 'string' || !p.name.trim()
        || typeof p.text !== 'string' || !p.text.trim()
        || p.name.length > 80 || p.text.length > 50_000)))
      throw new Error('备份文件 personas 字段无效');
    if (data.activePersonaId && data.personas?.length && !data.personas.some((p) => p.id === data.activePersonaId))
      throw new Error('备份文件活动人设无效');
    if (data.intents != null && !Array.isArray(data.intents)) throw new Error('备份文件 intents 字段无效');
    if (mode === 'replace') this.persist({ op: 'reset' });

    const res: ImportResult = { notes: 0, skipped: 0, profiles: 0, emotions: 0, persona: false, intents: 0 };
    for (const n of data.notes ?? []) {
      const note = sanitizeNote(n, now);
      if (!note || (mode === 'merge' && this.notes.has(note.id))) { res.skipped++; continue; }
      // 来源戳缺省补 'import'：备份自带 source（user/agent 等）者保留原始出处
      note.source ??= 'import';
      this.persist({ op: 'add', note });
      res.notes++;
    }
    for (const raw of data.intents ?? []) {
      const it = sanitizeIntent(raw);
      if (!it || (mode === 'merge' && this.intents.has(it.id))) { res.skipped++; continue; }
      this.persist({ op: 'intent-add', intent: it });
      res.intents++;
    }
    if (data.profiles && typeof data.profiles === 'object') {
      for (const [rawKey, v] of Object.entries(data.profiles)) {
        const text = typeof v === 'string' ? v : (v as Partial<ProfileEntry>)?.text;
        if (typeof text !== 'string' || !text) continue;
        const key = normalizeProfileKey(rawKey);
        const meta = (typeof v === 'object' && v) as Partial<ProfileEntry>;
        this.persist({
          op: 'profile',
          sessionId: isSessionKey(key) ? key.slice(5) : (meta?.sessions?.[0] ?? key),
          key,
          name: meta?.name,
          text,
          reviewed: meta?.reviewed,
        });
        res.profiles++;
      }
    }
    if (data.emotions && typeof data.emotions === 'object') {
      for (const [sid, st] of Object.entries(data.emotions)) {
        const e = sanitizeEmotion(st);
        if (!e) continue;
        this.persist({ op: 'emotion', sessionId: sid, state: e });
        res.emotions++;
      }
    }
    if (data.sessionDomains && typeof data.sessionDomains === 'object') {
      for (const [sid, d] of Object.entries(data.sessionDomains)) {
        if (typeof d === 'string' && d && d !== 'public' && sid.trim()) {
          this.persist({ op: 'sess-domain', sessionId: sid, domain: d });
        }
      }
    }
    if (data.digests && typeof data.digests === 'object') {
      for (const [sid, d] of Object.entries(data.digests)) {
        const text = (d as Partial<SessionDigest>)?.text;
        if (typeof text === 'string' && text.trim()) {
          this.persist({ op: 'digest', sessionId: sid, text, uptoTurn: (d as SessionDigest).uptoTurn });
        }
      }
    }
    if (data.personas?.length) {
      for (const p of data.personas) {
        if (!this.personaEntries.has(p.id)) {
          // characterId/moods/meta 随整包迁移（旧备份无此字段→undefined，行为同旧版）；
          // meta 走宽容清洗：备份里个别非法字段丢弃，不整包拒收
          this.createPersona(p.name, p.text, p.id, {
            characterId: typeof p.characterId === 'string' ? p.characterId : undefined,
            moods: Array.isArray(p.moods) ? p.moods.filter((m): m is string => typeof m === 'string') : undefined,
            meta: cleanPersonaMeta(p.meta),
          });
        }
      }
      if (!this.activeId) this.activatePersona(data.activePersonaId || data.personas[0]!.id);
      res.persona = true;
    } else if (typeof data.persona === 'string' && data.persona.trim() && (mode === 'replace' || !this.activeId)) {
      this.persist({ op: 'persona', text: data.persona.trim() });
      res.persona = true;
    }
    return res;
  }

  flush(): void {
    if (this.dirtyOps > 0) this.compact();
  }
}
