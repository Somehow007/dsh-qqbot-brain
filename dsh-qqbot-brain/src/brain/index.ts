import { DEFAULT_BRAIN_CONFIG } from './types.ts';
import type { BrainConfig, BrainContext, DistillResult, EmotionState, MemoryNote, NoteDraft, Turn } from './types.ts';
import { splitActor, userProfileKey } from './identity.ts';
import { ageInDays, retention } from './decay.ts';
import { Retriever } from './retrieval.ts';
import { EmotionEngine, NEUTRAL_EMOTION } from './emotion.ts';
import { BrainStore } from './store.ts';
import { Distiller } from './distill.ts';

export * from './types.ts';
export { Retriever } from './retrieval.ts';
export { EmotionEngine, NEUTRAL_EMOTION } from './emotion.ts';
export { BrainStore } from './store.ts';
export { Distiller } from './distill.ts';
export { retention, ageInDays } from './decay.ts';
export { splitActor, userProfileKey, sessionProfileKey } from './identity.ts';

export interface BrainOptions {
  config?: Partial<BrainConfig>;
  store: BrainStore;
  distiller: Distiller;
  /** 人格内核默认文本（store 中已存时优先用 store 的） */
  defaultPersona?: string;
  now?: () => number;
  /** 调试日志（插件层按 debug 开关传入） */
  log?: (msg: string) => void;
}

/**
 * Brain 门面：组合存储、检索、情绪、蒸馏。
 * 对插件层暴露两个入口：
 *   assemble()  —— system-prompt/assemble 时取注入文本
 *   ingest/endOfTurn() —— session/event 捕获对话、触发蒸馏
 */
export class Brain {
  readonly cfg: BrainConfig;
  private readonly store: BrainStore;
  private readonly distiller: Distiller;
  private readonly retriever: Retriever;
  private readonly emotion: EmotionEngine;
  private readonly defaultPersona: string;
  private readonly now: () => number;
  private readonly log?: (msg: string) => void;
  private turnBuffer = new Map<string, Turn[]>();
  private distilling = new Set<string>();

  constructor(opts: BrainOptions) {
    this.cfg = { ...DEFAULT_BRAIN_CONFIG, ...(opts.config ?? {}) };
    this.store = opts.store;
    this.distiller = opts.distiller;
    this.retriever = new Retriever(this.cfg);
    this.emotion = new EmotionEngine(this.cfg);
    this.defaultPersona = opts.defaultPersona ?? '';
    this.now = opts.now ?? Date.now;
    this.log = opts.log;
    // 重启后恢复持久化的情绪状态
    for (const s of this.store.sessions()) {
      if (s.emotion) this.emotion.load(s.sessionId, s.emotion);
    }
    if (this.cfg.evictAfterDays > 0) {
      this.store.shouldEvict = (n, now) =>
        n.hits === 0
        && retention(n, now) < this.cfg.forgetThreshold
        && ageInDays(n, now) >= this.cfg.evictAfterDays;
    }
  }

  persona(): string {
    return this.store.persona() || this.defaultPersona;
  }

  /** 整体替换人格内核（导入路径；写入需经此入口而非直接改文件） */
  setPersona(text: string): void {
    this.store.setPersona(text.trim());
  }

  /**
   * 每轮组装注入上下文；对命中的记忆做唤起强化。
   * speaker：当前发言人（群聊），可为昵称字符串或 {nick, openid}。「对该人」的态度是恒定的上下文，
   * 含昵称的 attitude 条目跨会话保底唤起（补足到 3 条上限），不跟 topK 记忆池抢名额。
   * 命中按 kind 拆分：attitude → attitudeLines（【当前立场】），其余 → memoryLines（【记忆库摘录】）。
   * 画像：发言人带 openid 时优先注入其个人画像（u: 键），会话级画像（sess: 键）次之。
   */
  assemble(sessionId: string, queryText: string, speaker?: string | { nick?: string; openid?: string }): BrainContext {
    const now = this.now();
    const sp = typeof speaker === 'string' ? { nick: speaker } : speaker;
    const hits = this.retriever.query(this.store.allNotes(), sessionId, queryText, now, this.store.version);
    const hitIds = new Set(hits.map((n) => n.id));
    if (sp?.nick) {
      const extra = this.store.allNotes()
        .filter((n) => n.kind === 'attitude'
          && !hitIds.has(n.id) && n.content.includes(sp.nick!))
        .sort((a, b) => retention(b, now) - retention(a, now));
      const room = Math.max(0, 3 - hits.filter((n) => n.kind === 'attitude').length);
      hits.push(...extra.slice(0, room));
    }
    for (const n of hits) this.store.reinforce(n, this.cfg.reinforceStep, this.cfg.strengthCap, now);

    const attitudeLines: string[] = [];
    const memoryLines: string[] = [];
    for (const n of hits) {
      if (n.kind === 'attitude') {
        attitudeLines.push(`- ${n.content}`);
        continue;
      }
      const d = Math.floor(ageInDays(n, now));
      const when = d <= 0 ? '今天' : `${d}天前`;
      memoryLines.push(`- [${when}记] ${n.actor ? `[${n.actor}] ` : ''}${n.content}`);
    }
    // 个人画像优先，会话级画像次之；仅会话画像时维持「[画像]」标签（私聊即本人画像）
    const personProfile = sp?.openid ? this.store.profileOf(userProfileKey(sp.openid)) : '';
    const sessProfile = this.store.profileOf(sessionId);
    if (sessProfile) memoryLines.unshift(`- ${personProfile ? '[会话画像]' : '[画像]'} ${sessProfile}`);
    if (personProfile) memoryLines.unshift(`- [画像] ${personProfile}`);

    return {
      persona: this.persona(),
      emotion: this.emotion.describe(sessionId, now),
      memoryLines,
      attitudeLines,
      hits,
    };
  }

  /** 捕获一轮完整对话（不立即蒸馏，攒到 endOfTurn） */
  ingest(sessionId: string, turn: Turn): void {
    const buf = this.turnBuffer.get(sessionId) ?? [];
    buf.push(turn);
    this.turnBuffer.set(sessionId, buf);
  }

  /**
   * 轮末蒸馏：抽记忆 + 更新情绪 + 更新画像。异步执行、防重入；
   * 失败静默（蒸馏是后台任务，不应影响回复）。
   */
  async endOfTurn(sessionId: string): Promise<void> {
    const turns = this.turnBuffer.get(sessionId);
    if (!turns?.length || this.distilling.has(sessionId)) return;
    this.turnBuffer.set(sessionId, []);
    this.distilling.add(sessionId);
    try {
      const now = this.now();
      // 判重：附上当前 top-相关已有记忆，蒸馏结果可用 merge 指回更新而非重复新增
      const queryText = turns.map((t) => t.userText).join(' ');
      const existing = this.retriever
        .query(this.store.allNotes(), sessionId, queryText, now, this.store.version)
        .slice(0, 8);
      const result = await this.distiller.distill(
        turns, this.persona(), existing, this.emotion.get(sessionId, now),
      );
      this.log?.(
        `蒸馏 ${sessionId.slice(0, 8)}…：记忆 ${result.memories.length} 条 / `
        + `情绪 ${result.emotion?.label ?? '（未变）'} / 画像 ${result.profile || result.profiles?.length ? '更新' : '（未变）'}`,
      );
      for (const m of result.memories) {
        const target = m.mergeIndex != null ? existing[m.mergeIndex] : undefined;
        if (target) {
          this.store.updateNote(target.id, { content: m.content, importance: m.importance, kind: m.kind });
          this.store.reinforceById(target.id, this.cfg.reinforceStep, this.cfg.strengthCap, now);
        } else {
          this.store.addNote(sessionId, m, now);
        }
      }
      // 意图级遗忘：编号指回附带列表 / 子串精确匹配（限本会话，防误删）
      for (const f of result.forget ?? []) {
        if (typeof f === 'number') {
          const t = existing[f];
          if (t) this.store.deleteNote(t.id);
        } else {
          for (const n of this.store.allNotes()) {
            if (n.sessionId === sessionId && n.content.includes(f)) this.store.deleteNote(n.id);
          }
        }
      }
      if (result.emotion) {
        const s = this.emotion.apply(sessionId, result.emotion, now);
        this.store.setEmotion(sessionId, s);
      }
      this.writeProfiles(sessionId, result);
    } finally {
      this.distilling.delete(sessionId);
    }
  }

  /** 画像落盘：actor 带 openid → u: 键按人存；无 actor/无法解析 → sess: 键会话级 */
  private writeProfiles(sessionId: string, result: DistillResult): void {
    if (result.profile) this.store.setProfile(sessionId, result.profile);
    for (const p of result.profiles ?? []) {
      const id = p.actor ? splitActor(p.actor) : undefined;
      if (id?.openid) {
        this.store.setProfileEntry(userProfileKey(id.openid), p.text, { sessionId, name: id.nick });
      } else {
        this.store.setProfile(sessionId, p.text);
      }
    }
  }

  /**
   * 语义巩固（新皮层慢速巩固）：把会话内足够老的情景记忆
   * 提炼为语义记忆并重写画像。返回新产生的语义记忆条数。
   */
  async consolidate(sessionId: string): Promise<number> {
    const now = this.now();
    const eps = this.store.allNotes().filter(
      (n) => n.sessionId === sessionId && n.kind === 'episodic'
        && ageInDays(n, now) >= this.cfg.consolidateMinAgeDays,
    );
    if (eps.length < this.cfg.consolidateMinNotes) return 0;
    const result = await this.distiller.consolidate(eps, this.store.profileOf(sessionId), this.persona());
    for (const m of result.memories) this.store.addNote(sessionId, { ...m, kind: 'semantic' }, now);
    this.writeProfiles(sessionId, result);
    return result.memories.length;
  }

  /** 供定时器：所有满足巩固条件的会话 id */
  sessionsNeedingConsolidation(): string[] {
    const now = this.now();
    const ids = new Set<string>();
    for (const n of this.store.allNotes()) {
      if (n.kind === 'episodic' && ageInDays(n, now) >= this.cfg.consolidateMinAgeDays) ids.add(n.sessionId);
    }
    return [...ids].filter((id) =>
      this.store.allNotes().filter(
        (n) => n.sessionId === id && n.kind === 'episodic'
          && ageInDays(n, now) >= this.cfg.consolidateMinAgeDays,
      ).length >= this.cfg.consolidateMinNotes,
    );
  }

  emotionOf(sessionId: string): EmotionState {
    return this.emotion.get(sessionId, this.now());
  }

  // ── 脑图页编辑入口 ──

  addNote(sessionId: string, draft: NoteDraft): MemoryNote {
    return this.store.addNote(sessionId || 'manual', draft, this.now());
  }

  updateNote(id: string, patch: Parameters<BrainStore['updateNote']>[1]): boolean {
    return this.store.updateNote(id, patch);
  }

  deleteNote(id: string): boolean {
    return this.store.deleteNote(id);
  }

  reinforceNote(id: string): boolean {
    return this.store.reinforceById(id, this.cfg.reinforceStep, this.cfg.strengthCap, this.now());
  }

  sessions(): ReturnType<BrainStore['sessions']> {
    return this.store.sessions();
  }

  /** 画像卡片：按人（u:）+ 会话级（sess:），脑图页「画像」页签 */
  people(): ReturnType<BrainStore['people']> {
    return this.store.people();
  }

  /** 备份导出：人格 + 全部记忆 + 画像 + 情绪（脑图页「备份迁移」） */
  exportData(): ReturnType<BrainStore['exportData']> {
    return this.store.exportData(this.now());
  }

  /** 备份导入：merge 按 id 去重补入；replace 清库后整包恢复 */
  importData(data: unknown, mode: 'merge' | 'replace'): ReturnType<BrainStore['importData']> {
    return this.store.importData(data, mode, this.now());
  }

  recentOps(limit = 100): ReturnType<BrainStore['recentOps']> {
    return this.store.recentOps(limit);
  }

  /** 可视化数据：节点 + 边 + 情绪 + 统计 */
  graph(sessionId?: string) {
    const now = this.now();
    const notes = this.store.allNotes()
      .filter((n) => !sessionId || n.sessionId === sessionId)
      .map((n) => ({
        id: n.id,
        content: n.content,
        importance: n.importance,
        kind: n.kind,
        actor: n.actor,
        sessionId: n.sessionId,
        createdAt: n.createdAt,
        strength: n.strength,
        lastAccessAt: n.lastAccessAt,
        ageDays: Math.floor(ageInDays(n, now)),
        retention: +retention(n, now).toFixed(3),
        hits: n.hits,
        fading: retention(n, now) < this.cfg.forgetThreshold,
      }));
    const stats = {
      total: notes.length,
      avgRetention: notes.length
        ? +(notes.reduce((s, n) => s + n.retention, 0) / notes.length).toFixed(3)
        : 0,
      fading: notes.filter((n) => n.fading).length,
      sessions: new Set(notes.map((n) => n.sessionId)).size,
    };
    const emo = sessionId
      ? { sessionId, state: this.emotion.get(sessionId, now) }
      : this.emotion.latest(now);
    return {
      persona: this.persona(),
      emotion: emo?.state ?? NEUTRAL_EMOTION,
      /** emotion 归属的会话（全局视图下标识来源；无记录时为 undefined） */
      emotionSession: emo?.sessionId,
      notes,
      stats,
      config: { forgetThreshold: this.cfg.forgetThreshold, topK: this.cfg.topK },
    };
  }

  /** 检索预览（脑图页"检索模拟器"） */
  preview(sessionId: string | undefined, query: string): MemoryNote[] {
    return this.retriever.query(this.store.allNotes(), sessionId, query, this.now(), this.store.version);
  }

  flush(): void {
    this.store.flush();
  }
}
