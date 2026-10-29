import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EmotionState, MemoryNote, NoteDraft } from './types.ts';

/**
 * JSONL 追加式存储 + 定期快照压缩。
 * 2C2G 友好：全部常驻内存索引，磁盘只做追加与快照。
 */

type Op =
  | { op: 'add'; note: MemoryNote }
  | { op: 'reinforce'; id: string; strength: number; hits: number; lastAccessAt: number }
  | { op: 'update'; id: string; patch: Partial<Pick<MemoryNote, 'content' | 'importance' | 'kind'>> }
  | { op: 'del'; id: string }
  | { op: 'emotion'; sessionId: string; state: EmotionState }
  | { op: 'profile'; sessionId: string; text: string }
  | { op: 'persona'; text: string };

/** 流水视图用：op + 写入时刻 */
export interface OpRecord { t: number; op: Op }

export class BrainStore {
  private notes = new Map<string, MemoryNote>();
  private emotions = new Map<string, EmotionState>();
  private profiles = new Map<string, string>();
  private personaText = '';
  /** 版本号：任何写入后 +1，检索器据此重建索引 */
  version = 0;
  private dirtyOps = 0;
  /** 最近操作流水（环形，供"事件流水"页查看真实落盘历史） */
  private opsLog: OpRecord[] = [];
  private static readonly OPS_LOG_CAP = 500;
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
          profiles: Record<string, string>; persona: string;
        };
        for (const n of snap.notes ?? []) this.notes.set(n.id, n);
        for (const [k, v] of Object.entries(snap.emotions ?? {})) this.emotions.set(k, v);
        for (const [k, v] of Object.entries(snap.profiles ?? {})) this.profiles.set(k, v);
        this.personaText = snap.persona ?? '';
      } catch { /* 快照损坏时仅依赖 jsonl 重放 */ }
    }
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line) as OpRecord & Op;
          this.apply(rec);
          this.pushOp({ t: rec.t ?? 0, op: rec });
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
      case 'del': this.notes.delete(op.id); break;
      case 'emotion': this.emotions.set(op.sessionId, op.state); break;
      case 'profile': this.profiles.set(op.sessionId, op.text); break;
      case 'persona': this.personaText = op.text; break;
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
    const snap = {
      notes: [...this.notes.values()],
      emotions: Object.fromEntries(this.emotions),
      profiles: Object.fromEntries(this.profiles),
      persona: this.personaText,
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

  /** 全部已知会话：记忆 / 画像 / 情绪三个来源的并集 */
  sessions(): { sessionId: string; noteCount: number; profile: string; emotion?: EmotionState }[] {
    const ids = new Set<string>([
      ...this.profiles.keys(),
      ...this.emotions.keys(),
      ...[...this.notes.values()].map((n) => n.sessionId),
    ]);
    return [...ids].map((sessionId) => ({
      sessionId,
      noteCount: [...this.notes.values()].filter((n) => n.sessionId === sessionId).length,
      profile: this.profiles.get(sessionId) ?? '',
      emotion: this.emotions.get(sessionId),
    }));
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

  setProfile(sessionId: string, text: string): void {
    this.persist({ op: 'profile', sessionId, text });
  }

  profileOf(sessionId: string): string {
    return this.profiles.get(sessionId) ?? '';
  }

  setPersona(text: string): void {
    this.persist({ op: 'persona', text });
  }

  persona(): string {
    return this.personaText;
  }

  flush(): void {
    if (this.dirtyOps > 0) this.compact();
  }
}
