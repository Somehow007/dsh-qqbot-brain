import { DEFAULT_BRAIN_CONFIG } from './types.ts';
import type { BrainConfig, BrainContext, DistillResult, EmotionState, MemoryNote, NoteDraft, Turn } from './types.ts';
import { isUserKey, splitActor, userProfileKey } from './identity.ts';
import { ageInDays, retention } from './decay.ts';
import { Retriever } from './retrieval.ts';
import { EmotionEngine, NEUTRAL_EMOTION } from './emotion.ts';
import { BrainStore, PROFILE_TEXT_CAP } from './store.ts';
import { Distiller } from './distill.ts';
import type { ProfileReviewItem } from './distill.ts';
import type { Embedder } from './embed.ts';

export * from './types.ts';
export { Retriever } from './retrieval.ts';
export type { ScoredNote } from './retrieval.ts';
export { EmotionEngine, NEUTRAL_EMOTION } from './emotion.ts';
export { BrainStore } from './store.ts';
export { Distiller } from './distill.ts';
export { Embedder } from './embed.ts';
export { retention, ageInDays } from './decay.ts';
export { splitActor, userProfileKey, sessionProfileKey } from './identity.ts';

export interface BrainOptions {
  config?: Partial<BrainConfig>;
  store: BrainStore;
  distiller: Distiller;
  /** 语义向量（可选；缺省/无 key 时检索回退 lexical） */
  embedder?: Embedder;
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
  private readonly embedder?: Embedder;
  private readonly retriever: Retriever;
  private readonly emotion: EmotionEngine;
  private readonly defaultPersona: string;
  private readonly now: () => number;
  private readonly log?: (msg: string) => void;
  private turnBuffer = new Map<string, Turn[]>();
  private distilling = new Set<string>();
  /** 已审核的画像文本；旧数据每次进程启动后首次涉及该人时重新检查。 */
  private reviewedProfiles = new Map<string, string>();
  /** 滚动摘要输入：最近对话轮次缓存（每会话封顶 60 条） */
  private historyBuffer = new Map<string, Turn[]>();
  /** 每会话已捕获轮数（驱动 digest 触发；重启后从 digest.uptoTurn 续算） */
  private turnCounter = new Map<string, number>();
  private digesting = new Set<string>();

  constructor(opts: BrainOptions) {
    this.cfg = { ...DEFAULT_BRAIN_CONFIG, ...(opts.config ?? {}) };
    this.store = opts.store;
    this.distiller = opts.distiller;
    this.embedder = opts.embedder;
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

  personas(): { activeId: string; personas: ReturnType<BrainStore['listPersonas']> } {
    return { activeId: this.store.activePersonaId(), personas: this.store.listPersonas() };
  }

  createPersona(name: string, text: string, id?: string): ReturnType<BrainStore['createPersona']> {
    return this.store.createPersona(name, text, id);
  }

  savePersona(id: string, name: string, text: string): ReturnType<BrainStore['savePersona']> {
    return this.store.savePersona(id, name, text);
  }

  activatePersona(id: string): void {
    this.store.activatePersona(id);
  }

  /**
   * 每轮组装注入上下文。
   * speaker：当前发言人（群聊），可为昵称字符串或 {nick, openid}。
   * 检索评分已做相关性门控（rel 主导、R 只 boost）；只对 rel >= reinforceMinCos
   * 的真相关命中做唤起强化——发言人保底条目与弱相关凑数不再刷 hits/R 锁死。
   * 「对该人」的态度是恒定上下文：含昵称的 attitude 条目跨会话保底唤起进
   * 立场区（补足到 3 条上限），不占 topK、不参与强化计数。
   * 跨会话召回：发言人在其他会话留下的 attitude/semantic 条目按 rel 取 ≤2 条，
   * 标 [跨群] 前缀（episodic 流水不跨群）。
   * 画像：发言人个人画像（openid 精确 + 同名 u: 条目归并）优先，会话画像次之。
   * queryVec：可选查询向量（有 embedding 时 rel 走语义余弦）。
   */
  assemble(
    sessionId: string,
    queryText: string,
    speaker?: string | { nick?: string; openid?: string },
    queryVec?: number[],
  ): BrainContext {
    const now = this.now();
    const sp = typeof speaker === 'string' ? { nick: speaker } : speaker;
    const scored = this.retriever.query(
      this.store.allNotes(), sessionId, queryText, now, this.store.version, queryVec,
    );
    for (const s of scored) {
      const th = s.relSrc === 'emb' ? this.cfg.reinforceMinEmbedCos : this.cfg.reinforceMinCos;
      if (s.rel >= th) {
        this.store.reinforce(s.note, this.cfg.reinforceStep, this.cfg.strengthCap, now);
      }
    }
    const hits = scored.map((s) => s.note);

    const attitudeLines: string[] = [];
    const memoryLines: string[] = [];
    const attitudeHitIds = new Set<string>();
    for (const n of hits) {
      if (n.kind === 'attitude') {
        attitudeLines.push(`- ${n.content}`);
        attitudeHitIds.add(n.id);
        continue;
      }
      const d = Math.floor(ageInDays(n, now));
      const when = d <= 0 ? '今天' : `${d}天前`;
      memoryLines.push(`- [${when}记] ${n.actor ? `[${n.actor}] ` : ''}${n.content}`);
    }
    if (sp?.nick) {
      const extra = this.store.allNotes()
        .filter((n) => n.kind === 'attitude'
          && !attitudeHitIds.has(n.id) && n.content.includes(sp.nick!))
        .sort((a, b) => retention(b, now) - retention(a, now));
      const room = Math.max(0, 3 - attitudeLines.length);
      for (const n of extra.slice(0, room)) attitudeLines.push(`- ${n.content}`);
    }
    if (sp && (sp.openid || sp.nick)) {
      const xpool = this.store.allNotes().filter((n) => {
        if (n.sessionId === sessionId) return false;
        if (n.kind !== 'attitude' && n.kind !== 'semantic') return false;
        if (!n.actor) return false;
        const id = splitActor(n.actor);
        return (sp.openid && id.openid === sp.openid) || (sp.nick && id.nick === sp.nick);
      });
      if (xpool.length) {
        const xhits = this.retriever.query(
          xpool, undefined, queryText || sp.nick || '', now, this.store.version, queryVec,
          { pool: xpool, indexKey: `__x__${sessionId}` },
        );
        for (const s of xhits.slice(0, 2)) {
          const n = s.note;
          const d = Math.floor(ageInDays(n, now));
          const when = d <= 0 ? '今天' : `${d}天前`;
          memoryLines.push(`- [跨群·${when}记] ${n.actor ? `[${n.actor}] ` : ''}${n.content}`);
          const th = s.relSrc === 'emb' ? this.cfg.reinforceMinEmbedCos : this.cfg.reinforceMinCos;
          if (s.rel >= th) {
            this.store.reinforce(n, this.cfg.reinforceStep, this.cfg.strengthCap, now);
          }
        }
      }
    }
    // 个人画像（同名归并）优先，会话级画像次之；仅会话画像时维持「[画像]」标签
    const personProfile = (sp?.openid || sp?.nick)
      ? this.store.mergedUserProfile({ openid: sp?.openid, nick: sp?.nick })
      : '';
    const sessProfile = this.store.profileOf(sessionId);
    if (sessProfile) memoryLines.unshift(`- ${personProfile ? '[会话画像]' : '[画像]'} ${sessProfile}`);
    if (personProfile) memoryLines.unshift(`- [画像] ${personProfile}`);

    return {
      persona: this.persona(),
      emotion: this.emotion.describe(sessionId, now),
      digest: this.store.digestOf(sessionId)?.text ?? '',
      memoryLines,
      attitudeLines,
      hits,
    };
  }

  /** 捕获一轮完整对话（不立即蒸馏，攒到 endOfTurn）；同步滚动摘要输入与轮数 */
  ingest(sessionId: string, turn: Turn): void {
    const buf = this.turnBuffer.get(sessionId) ?? [];
    buf.push(turn);
    this.turnBuffer.set(sessionId, buf);
    const hb = this.historyBuffer.get(sessionId) ?? [];
    hb.push(turn);
    if (hb.length > 60) hb.splice(0, hb.length - 60);
    this.historyBuffer.set(sessionId, hb);
    // 重启后从已存 digest 的 uptoTurn 续算，避免计数倒退导致永不再触发
    this.turnCounter.set(
      sessionId,
      (this.turnCounter.get(sessionId) ?? this.store.digestOf(sessionId)?.uptoTurn ?? 0) + 1,
    );
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
        .slice(0, 8)
        .map((s) => s.note);
      const result = await this.distiller.distill(
        turns, this.persona(), existing, this.emotion.get(sessionId, now),
        this.existingProfiles(sessionId, turns.map((t) => t.actor)),
      );
      this.log?.(
        `蒸馏 ${sessionId.slice(0, 8)}…：记忆 ${result.memories.length} 条 / `
        + `情绪 ${result.emotion?.label ?? '（未变）'} / 画像 ${result.profile || result.profiles?.length ? '更新' : '（未变）'}`,
      );
      const touched: MemoryNote[] = [];
      for (const m of result.memories) {
        const target = m.mergeIndex != null ? existing[m.mergeIndex] : undefined;
        if (target) {
          this.store.updateNote(target.id, { content: m.content, importance: m.importance, kind: m.kind });
          this.store.reinforceById(target.id, this.cfg.reinforceStep, this.cfg.strengthCap, now);
          touched.push(target);
        } else {
          touched.push(this.store.addNote(sessionId, m, now));
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
      await this.reviewAndWriteProfiles(sessionId, result, turns.map((t) => t.actor));
      // 新/改记忆补语义向量（失败静默，检索回退 lexical）
      await this.embedNotes(touched);
      // 滚动摘要：累计轮数到阈值则更新「会话脉络」
      await this.maybeDigest(sessionId);
    } finally {
      this.distilling.delete(sessionId);
    }
  }

  /** 给一批记忆取向量并落盘（embedder 未启用/调用失败时 no-op） */
  private async embedNotes(notes: MemoryNote[]): Promise<void> {
    const targets = notes.filter((n) => n.content.trim());
    if (!this.embedder?.enabled || targets.length === 0) return;
    const vecs = await this.embedder.embed(targets.map((n) => n.content));
    if (!vecs) return;
    for (let i = 0; i < targets.length; i++) this.store.setEmbedding(targets[i]!.id, vecs[i]!);
  }

  /** 会话滚动摘要：turnCounter 距上次 uptoTurn 满 digestEveryTurns 则触发 */
  private async maybeDigest(sessionId: string): Promise<void> {
    const every = this.cfg.digestEveryTurns;
    if (!every || !this.distiller.enabled || this.digesting.has(sessionId)) return;
    const count = this.turnCounter.get(sessionId) ?? 0;
    const upto = this.store.digestOf(sessionId)?.uptoTurn ?? 0;
    if (count - upto < every) return;
    const buf = this.historyBuffer.get(sessionId) ?? [];
    if (buf.length === 0) return;
    this.digesting.add(sessionId);
    try {
      const recent = buf.slice(-this.cfg.digestWindowTurns);
      const text = await this.distiller.digest(
        recent, this.store.digestOf(sessionId)?.text ?? '', this.persona(),
      );
      if (text) {
        this.store.setDigest(sessionId, text, count);
        this.log?.(`会话脉络 ${sessionId.slice(0, 8)}…：摘要更新（${count} 轮）`);
      }
    } finally {
      this.digesting.delete(sessionId);
    }
  }

  /** 收集「现有画像」供蒸馏增量修订：会话级画像 + 涉及发言人（带 openid）的个人画像 */
  private existingProfiles(sessionId: string, actors: (string | undefined)[]): { actor?: string; text: string }[] {
    const out: { actor?: string; text: string }[] = [];
    const sessProfile = this.store.profileOf(sessionId);
    if (sessProfile) out.push({ text: sessProfile });
    for (const actor of new Set(actors.filter((a): a is string => !!a))) {
      const id = splitActor(actor);
      if (!id.openid) continue;
      const text = this.store.profileOf(userProfileKey(id.openid));
      if (text) out.push({ actor, text });
    }
    return out;
  }

  private async reviewAndWriteProfiles(
    sessionId: string, result: DistillResult, actors: (string | undefined)[],
  ): Promise<void> {
    const existing = this.existingProfiles(sessionId, actors);
    const candidates = [
      ...(result.profile ? [{ text: result.profile }] : []),
      ...(result.profiles ?? []),
    ];
    const byActor = new Map<string, ProfileReviewItem>();
    for (const p of existing) {
      byActor.set(p.actor ?? '', { actor: p.actor, previous: p.text, candidate: p.text });
    }
    for (const p of candidates) {
      const key = p.actor ?? '';
      const prev = byActor.get(key);
      byActor.set(key, { actor: p.actor, previous: prev?.previous ?? '', candidate: p.text });
    }
    const pending = [...byActor.entries()].filter(([actor, item]) =>
      item.candidate !== item.previous
      || this.reviewedProfiles.get(`${sessionId}:${actor}`) !== item.previous);
    if (!pending.length) return;
    const reviewed = await this.distiller.reviewProfiles(pending.map(([, item]) => item));
    if (!reviewed) {
      this.log?.(`画像审核失败：${sessionId.slice(0, 8)}…，保持原画像`);
      return;
    }
    for (const [i, [actor, item]] of pending.entries()) {
      const text = reviewed[i]!.slice(0, PROFILE_TEXT_CAP);
      const openid = actor ? splitActor(actor).openid : undefined;
      const needsSessionLink = openid && text && this.store.people().some((p) =>
        p.key === userProfileKey(openid) && !p.sessions.includes(sessionId));
      if (text !== item.previous || needsSessionLink) {
        this.writeProfiles(sessionId, { memories: [], profiles: [{ actor: item.actor, text }] }, actors);
      }
      this.reviewedProfiles.set(`${sessionId}:${actor}`, text);
    }
  }

  /**
   * 画像落盘：身份键经真实发言人记录校验，不信任 LLM 输出的 openid。
   * - actor 的 openid 在已知发言人中（记忆 actor / 已有 u: 画像键 / 本轮 actor）→ u: 键
   * - openid 不可信但昵称唯一匹配已知发言人 → 校正为该发言人真实 openid
   * - 无法确认到具体的人 → 退化为 sess: 会话级画像，不制造幽灵人物
   */
  private writeProfiles(sessionId: string, result: DistillResult, actors: (string | undefined)[]): void {
    if (result.profile) this.store.setProfile(sessionId, result.profile);
    const speakers = this.store.speakers();
    for (const a of actors) {
      if (!a) continue;
      const id = splitActor(a);
      if (id.openid) speakers.set(id.openid, id.nick);
    }
    for (const p of result.profiles ?? []) {
      const id = p.actor ? splitActor(p.actor) : undefined;
      if (id?.openid && speakers.has(id.openid)) {
        this.store.setProfileEntry(userProfileKey(id.openid), p.text, { sessionId, name: id.nick });
        continue;
      }
      const candidates = id?.nick ? [...speakers].filter(([, n]) => n === id.nick) : [];
      if (candidates.length === 1) {
        const [openid, nick] = candidates[0]!;
        this.log?.(`画像身份校正：${p.actor ?? ''} → u:${openid.slice(0, 8)}…（LLM 输出的 openid 与真实发言人不符）`);
        this.store.setProfileEntry(userProfileKey(openid), p.text, { sessionId, name: nick });
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
    // 现有画像（会话级 + 涉及发言人的个人画像）一并喂入，巩固在旧画像上修订
    const profileText = this.existingProfiles(sessionId, eps.map((n) => n.actor))
      .map((p) => `${p.actor ?? '会话整体'}：${p.text}`)
      .join('\n');
    const result = await this.distiller.consolidate(eps, profileText, this.persona());
    const added = result.memories.map((m) => this.store.addNote(sessionId, { ...m, kind: 'semantic' }, now));
    await this.reviewAndWriteProfiles(sessionId, result, eps.map((n) => n.actor));
    void this.embedNotes(added);
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
    const n = this.store.addNote(sessionId || 'manual', draft, this.now());
    void this.embedNotes([n]);
    return n;
  }

  updateNote(id: string, patch: Parameters<BrainStore['updateNote']>[1]): boolean {
    const ok = this.store.updateNote(id, patch);
    if (ok && patch.content != null) {
      const n = this.store.noteById(id);
      if (n) void this.embedNotes([n]);
    }
    return ok;
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
      digest: sessionId ? (this.store.digestOf(sessionId)?.text ?? '') : '',
      /** emotion 归属的会话（全局视图下标识来源；无记录时为 undefined） */
      emotionSession: emo?.sessionId,
      notes,
      stats,
      config: { forgetThreshold: this.cfg.forgetThreshold, topK: this.cfg.topK },
    };
  }

  /** 检索预览（脑图页"检索模拟器"）；有 embedder 时顺带取向量走语义路径 */
  async preview(sessionId: string | undefined, query: string): Promise<MemoryNote[]> {
    const qv = (await this.queryEmbedding(query)) ?? undefined;
    return this.retriever
      .query(this.store.allNotes(), sessionId, query, this.now(), this.store.version, qv)
      .map((s) => s.note);
  }

  /** 供注入层取查询向量；无 embedder 时返回 null（调用方回退 lexical） */
  async queryEmbedding(text: string): Promise<number[] | null> {
    return this.embedder?.enabled ? this.embedder.embedOne(text) : null;
  }

  /** 启动/周期回填：给缺向量的旧记忆补 embedding，返回处理条数 */
  async backfillEmbeddings(limit = 5): Promise<number> {
    if (!this.embedder?.enabled) return 0;
    const targets = this.store.allNotes().filter((n) => !n.embedding).slice(0, limit);
    if (targets.length === 0) return 0;
    const vecs = await this.embedder.embed(targets.map((n) => n.content));
    if (!vecs) return 0;
    for (let i = 0; i < targets.length; i++) this.store.setEmbedding(targets[i]!.id, vecs[i]!);
    return targets.length;
  }

  flush(): void {
    this.store.flush();
  }
}
