import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EmotionState, MemoryNote, NoteDraft, ProfileEntry, SessionDigest } from './types.ts';
import { isSessionKey, isUserKey, normalizeProfileKey, sessionProfileKey, splitActor, userProfileKey } from './identity.ts';

/**
 * JSONL 追加式存储 + 定期快照压缩。
 * 2C2G 友好：全部常驻内存索引，磁盘只做追加与快照。
 */

type Op =
  | { op: 'add'; note: MemoryNote }
  | { op: 'reinforce'; id: string; strength: number; hits: number; lastAccessAt: number }
  | { op: 'update'; id: string; patch: Partial<Pick<MemoryNote, 'content' | 'importance' | 'kind'>> }
  | { op: 'embed'; id: string; vector: number[] }
  | { op: 'del'; id: string }
  | { op: 'emotion'; sessionId: string; state: EmotionState }
  | { op: 'profile'; sessionId: string; text: string; key?: string; name?: string; at?: number }
  | { op: 'digest'; sessionId: string; text: string; uptoTurn?: number }
  | { op: 'persona'; text: string }
  | { op: 'persona-save'; persona: PersonaEntry }
  | { op: 'persona-activate'; id: string }
  | { op: 'reset' };

export interface PersonaEntry { id: string; name: string; text: string }

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
}

export interface ImportResult {
  notes: number;
  skipped: number;
  profiles: number;
  emotions: number;
  persona: boolean;
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** 导入时按入库规范清洗一条记忆；结构不合法返回 undefined */
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
    strength: Math.max(0.5, num(n.strength, 3)),
    hits: Math.max(0, Math.round(num(n.hits, 0))),
    lastAccessAt: num(n.lastAccessAt, now),
    embedding: (Array.isArray(n.embedding) && n.embedding.length)
      ? n.embedding
      : decodeVec((n as { e?: string }).e),
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
    updatedAt: num(e.updatedAt, Date.now()),
  };
}

/** 流水视图用：op + 写入时刻 */
export interface OpRecord { t: number; op: Op }

export const PROFILE_TEXT_CAP = 500;

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
  private personaText = '';
  private personaEntries = new Map<string, PersonaEntry>();
  private activeId = '';
  /** 版本号：任何写入后 +1，检索器据此重建索引 */
  version = 0;
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
        };
        for (const raw of snap.notes ?? []) {
          const n = raw as MemoryNote & { e?: string };
          // 快照里向量以 e(base64 f32) 存储；兼容旧版 number[]
          if (!n.embedding && n.e) n.embedding = decodeVec(n.e);
          delete n.e;
          this.notes.set(n.id, n);
        }
        for (const [k, v] of Object.entries(snap.emotions ?? {})) this.emotions.set(k, v);
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
          });
        }
        this.personaText = snap.persona ?? '';
        for (const entry of snap.personas ?? []) {
          if (typeof entry.id === 'string' && typeof entry.name === 'string' && typeof entry.text === 'string')
            this.personaEntries.set(entry.id, entry);
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
      case 'add': this.notes.set(op.note.id, op.note); break;
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
        }
        break;
      }
      case 'embed': {
        const n = this.notes.get(op.id);
        if (n) n.embedding = op.vector;
        break;
      }
      case 'del': this.notes.delete(op.id); break;
      case 'emotion': this.emotions.set(op.sessionId, op.state); break;
      case 'digest':
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
          text: op.text.trim().slice(0, PROFILE_TEXT_CAP),
          name: op.name ?? prev?.name ?? '',
          sessions: [...new Set([...(prev?.sessions ?? []), op.sessionId])],
          updatedAt: op.at ?? Date.now(),
        });
        break;
      }
      case 'persona': {
        const id = this.activeId || 'legacy';
        const old = this.personaEntries.get(id);
        this.personaEntries.set(id, { id, name: old?.name ?? '原有人设', text: op.text });
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
      case 'reset':
        this.notes.clear();
        this.emotions.clear();
        this.profiles.clear();
        this.digests.clear();
        this.personaText = '';
        this.personaEntries.clear();
        this.activeId = '';
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
    if (++this.dirtyOps >= this.compactEvery) this.compact();
  }

  private compact(): void {
    if (this.shouldEvict) {
      const now = Date.now();
      for (const n of [...this.notes.values()]) {
        if (this.shouldEvict(n, now)) this.notes.delete(n.id);
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
    };
    const tmp = this.snapshotFile + '.tmp';
    writeFileSync(tmp, JSON.stringify(snap));
    renameSync(tmp, this.snapshotFile);
    writeFileSync(this.file, '');
    this.dirtyOps = 0;
  }

  // ── 记忆 ──

  addNote(sessionId: string, draft: NoteDraft, now: number): MemoryNote {
    const note: MemoryNote = {
      id: randomUUID(),
      sessionId,
      actor: draft.actor,
      content: draft.content.trim().slice(0, 200),
      importance: Math.min(5, Math.max(1, Math.round(draft.importance ?? 3))),
      kind: draft.kind ?? 'episodic',
      createdAt: now,
      strength: Math.min(5, Math.max(1, Math.round(draft.importance ?? 3))),
      hits: 0,
      lastAccessAt: now,
    };
    if (!note.content) return note;
    this.persist({ op: 'add', note });
    return note;
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
  }

  // ── 会话滚动摘要 ──

  setDigest(sessionId: string, text: string, uptoTurn: number): void {
    if (!text.trim()) return;
    this.persist({ op: 'digest', sessionId, text: text.trim(), uptoTurn });
  }

  digestOf(sessionId: string): SessionDigest | undefined {
    return this.digests.get(sessionId);
  }

  noteById(id: string): MemoryNote | undefined {
    return this.notes.get(id);
  }

  updateNote(id: string, patch: Partial<Pick<MemoryNote, 'content' | 'importance' | 'kind'>>): boolean {
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

  /** 全部已知会话：记忆 / 会话级画像 / 情绪三个来源的并集 */
  sessions(): { sessionId: string; noteCount: number; profile: string; emotion?: EmotionState }[] {
    const ids = new Set<string>([
      ...[...this.profiles.keys()].filter(isSessionKey).map((k) => k.slice(5)),
      ...this.emotions.keys(),
      ...[...this.notes.values()].map((n) => n.sessionId),
    ]);
    return [...ids].map((sessionId) => ({
      sessionId,
      noteCount: [...this.notes.values()].filter((n) => n.sessionId === sessionId).length,
      profile: this.profiles.get(sessionProfileKey(sessionId))?.text ?? '',
      emotion: this.emotions.get(sessionId),
    }));
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

  /** 按身份键写画像：u:<openid> 或 sess:<id>；name/sessionId 用于展示与归属追踪 */
  setProfileEntry(key: string, text: string, meta?: { sessionId?: string; name?: string }): void {
    this.persist({
      op: 'profile',
      sessionId: meta?.sessionId ?? key,
      key,
      name: meta?.name,
      text,
      at: Date.now(),
    });
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
   */
  mergedUserProfile(opts: { openid?: string; nick?: string }): string {
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
    return picks.map((e) => e.text.trim()).filter(Boolean).join(' ').slice(0, 400);
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

  activePersonaId(): string {
    return this.activeId;
  }

  createPersona(name: string, text: string, id: string = randomUUID()): PersonaEntry {
    const persona = this.validPersona(id, name, text);
    if (this.personaEntries.has(id)) throw new Error('人设 ID 已存在');
    this.persist({ op: 'persona-save', persona });
    return persona;
  }

  savePersona(id: string, name: string, text: string): PersonaEntry {
    if (!this.personaEntries.has(id)) throw new Error('人设不存在');
    const persona = this.validPersona(id, name, text);
    this.persist({ op: 'persona-save', persona });
    return persona;
  }

  activatePersona(id: string): void {
    if (!this.personaEntries.has(id)) throw new Error('人设不存在');
    if (id !== this.activeId) this.persist({ op: 'persona-activate', id });
  }

  private validPersona(id: string, name: string, text: string): PersonaEntry {
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim() || typeof text !== 'string' || !text.trim())
      throw new Error('人设名称和内容不能为空');
    if (name.trim().length > 80 || text.length > 50_000) throw new Error('人设过长');
    return { id, name: name.trim(), text: text.trim() };
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
    if (mode === 'replace') this.persist({ op: 'reset' });

    const res: ImportResult = { notes: 0, skipped: 0, profiles: 0, emotions: 0, persona: false };
    for (const n of data.notes ?? []) {
      const note = sanitizeNote(n, now);
      if (!note || (mode === 'merge' && this.notes.has(note.id))) { res.skipped++; continue; }
      this.persist({ op: 'add', note });
      res.notes++;
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
        if (!this.personaEntries.has(p.id)) this.createPersona(p.name, p.text, p.id);
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
