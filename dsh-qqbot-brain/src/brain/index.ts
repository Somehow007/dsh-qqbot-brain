import { DEFAULT_BRAIN_CONFIG, MOOD_VALENCE } from './types.ts';
import type { BrainConfig, BrainContext, DistillResult, EmotionState, MemoryNote, NoteDraft, NoteEmotion, Turn } from './types.ts';
import { isUserKey, splitActor, userProfileKey } from './identity.ts';
import { ageInDays, retention } from './decay.ts';
import { Retriever } from './retrieval.ts';
import { EmotionEngine, NEUTRAL_EMOTION } from './emotion.ts';
import { BrainStore, PROFILE_TEXT_CAP } from './store.ts';
import { Distiller } from './distill.ts';
import type { ProfileReviewItem } from './distill.ts';
import type { Embedder } from './embed.ts';
import { vecCosine } from './embed.ts';

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

  deletePersona(id: string): void {
    this.store.deletePersona(id);
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
      // 先落本轮情绪：新写出的记忆以「产生它们的这次对话」的情绪盖章
      if (result.emotion) {
        const e = result.emotion;
        const expect = e.mood ? MOOD_VALENCE[e.mood] : undefined;
        if (expect !== undefined && Math.abs(e.v) > 0.3 && Math.sign(e.v) !== expect) {
          this.log?.(`情绪矛盾：mood=${e.mood} 但 v=${e.v.toFixed(2)}（${sessionId.slice(0, 8)}…）`);
        }
        const s = this.emotion.apply(sessionId, e, now);
        this.store.setEmotion(sessionId, s);
      }
      const stamp = this.emotionStamp(sessionId, now);
      // 强情绪下形成的记忆更难忘：|v|·a 加权初始强度（最高 ×1.5）
      const boost = this.emotionBoost(stamp);
      const touched: MemoryNote[] = [];
      // 新增草稿先取向量做写入判重：cos≥dedupeEmbedCos 视为同一事实，强化旧记忆而非再写一条
      const freshVecs = this.embedder?.enabled
        ? await this.embedder.embed(
            result.memories.filter((m) => m.mergeIndex == null || !existing[m.mergeIndex]).map((m) => m.content))
        : null;
      let fi = 0;
      for (const m of result.memories) {
        const target = m.mergeIndex != null ? existing[m.mergeIndex] : undefined;
        if (target) {
          this.store.updateNote(target.id, { content: m.content, importance: m.importance, kind: m.kind });
          this.store.reinforceById(target.id, this.cfg.reinforceStep, this.cfg.strengthCap, now);
          touched.push(target);
          continue;
        }
        const vec = freshVecs?.[fi++] ?? null;
        const dup = vec ? this.findNearDup(vec) : undefined;
        if (dup) {
          this.store.reinforce(dup.note, this.cfg.reinforceStep, this.cfg.strengthCap, now);
          this.log?.(`判重合并：与「${dup.note.content.slice(0, 20)}」余弦 ${dup.cos.toFixed(2)}，强化旧记忆`);
          touched.push(dup.note);
          continue;
        }
        const n = this.store.addNote(sessionId, { ...m, emotion: stamp, strengthBoost: boost }, now);
        if (vec) this.store.setEmbedding(n.id, vec);
        touched.push(n);
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
   * 只处理尚未被 semantic 笔记吸收的 episodic——旧池不变时
   * 重跑只会反复压缩画像，形成只缩不涨的棘轮。
   */
  async consolidate(sessionId: string): Promise<number> {
    const now = this.now();
    const covered = this.consolidatedIds(sessionId);
    const eps = this.store.allNotes().filter(
      (n) => n.sessionId === sessionId && n.kind === 'episodic'
        && ageInDays(n, now) >= this.cfg.consolidateMinAgeDays
        && !covered.has(n.id),
    );
    if (eps.length < this.cfg.consolidateMinNotes) return 0;
    // 现有画像（会话级 + 涉及发言人的个人画像）一并喂入，巩固在旧画像上修订
    const profileText = this.existingProfiles(sessionId, eps.map((n) => n.actor))
      .map((p) => `${p.actor ?? '会话整体'}：${p.text}`)
      .join('\n');
    const result = await this.distiller.consolidate(eps, profileText, this.persona());
    const stamp = this.emotionStamp(sessionId, now);
    const sourceIds = eps.map((e) => e.id);
    const boost = this.emotionBoost(stamp);
    const added = result.memories.map((m) => this.store.addNote(
      sessionId, { ...m, kind: 'semantic', emotion: stamp, strengthBoost: boost, sourceIds }, now,
    ));
    await this.reviewAndWriteProfiles(sessionId, result, eps.map((n) => n.actor));
    void this.embedNotes(added);
    return result.memories.length;
  }

  /** 该会话已被 semantic 笔记吸收（sourceIds 收录）的笔记 id 集合 */
  private consolidatedIds(sessionId: string): Set<string> {
    const covered = new Set<string>();
    for (const n of this.store.allNotes()) {
      if (n.sessionId !== sessionId || n.kind !== 'semantic') continue;
      for (const id of n.sourceIds ?? []) covered.add(id);
    }
    return covered;
  }

  /** 供定时器：所有满足巩固条件的会话 id（尚有未被吸收的到期 episodic） */
  sessionsNeedingConsolidation(): string[] {
    const now = this.now();
    const covered = new Set<string>();
    for (const n of this.store.allNotes()) {
      if (n.kind !== 'semantic') continue;
      for (const id of n.sourceIds ?? []) covered.add(id);
    }
    const eligible = new Map<string, number>();
    for (const n of this.store.allNotes()) {
      if (n.kind !== 'episodic' || covered.has(n.id)) continue;
      if (ageInDays(n, now) < this.cfg.consolidateMinAgeDays) continue;
      eligible.set(n.sessionId, (eligible.get(n.sessionId) ?? 0) + 1);
    }
    return [...eligible.entries()]
      .filter(([, count]) => count >= this.cfg.consolidateMinNotes)
      .map(([id]) => id);
  }

  emotionOf(sessionId: string): EmotionState {
    return this.emotion.get(sessionId, this.now());
  }

  /** 当前会话情绪快照（写入记忆时钉上；op 流水会 compact，快照存记忆上才可靠） */
  private emotionStamp(sessionId: string, now: number): NoteEmotion {
    const e = this.emotion.get(sessionId, now);
    return { v: e.v, a: e.a, d: e.d, label: e.label, mood: e.mood };
  }

  /** 强情绪下形成的记忆更难忘：|v|·a → 初始强度乘数 1.0~1.5 */
  private emotionBoost(stamp: NoteEmotion): number {
    return 1 + Math.min(1, Math.abs(stamp.v) * stamp.a) * 0.5;
  }

  /**
   * 存量近重复清理：向量余弦 ≥dedupeEmbedCos 的记忆并查集聚类，
   * 每簇保留信息量最大的一条（长文案 > 重要度 > 命中 > 更早创建），
   * 其余经 merge op 合并字段后删除。无向量记忆不参与（无法判定）。
   */
  sweepNearDups(): { clusters: number; merged: number; pairs: { keep: string; drop: string }[] } {
    const notes = this.store.allNotes().filter((n) => n.embedding?.length);
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) { parent.set(r, parent.get(parent.get(r)!)!); r = parent.get(r)!; }
      return r;
    };
    notes.forEach((n) => parent.set(n.id, n.id));
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        if (vecCosine(notes[i]!.embedding!, notes[j]!.embedding!) >= this.cfg.dedupeEmbedCos
          && find(notes[i]!.id) !== find(notes[j]!.id)) {
          parent.set(find(notes[i]!.id), find(notes[j]!.id));
        }
      }
    }
    const clusters = new Map<string, MemoryNote[]>();
    for (const n of notes) {
      const r = find(n.id);
      const c = clusters.get(r) ?? [];
      c.push(n); clusters.set(r, c);
    }
    const pairs: { keep: string; drop: string }[] = [];
    let clusterCount = 0;
    for (const members of clusters.values()) {
      if (members.length < 2) continue;
      clusterCount++;
      members.sort((a, b) => b.content.length - a.content.length
        || b.importance - a.importance || b.hits - a.hits || a.createdAt - b.createdAt);
      const keep = members[0]!;
      for (const m of members.slice(1)) {
        this.store.mergeNotes(keep.id, m.id, this.cfg.strengthCap);
        pairs.push({ keep: keep.id, drop: m.id });
      }
      this.log?.(`近重复合并：「${keep.content.slice(0, 24)}」吸收 ${members.length - 1} 条复读`);
    }
    return { clusters: clusterCount, merged: pairs.length, pairs };
  }

  /** 写入判重：全库找与新记忆向量余弦最高的既有记忆，≥dedupeEmbedCos 判为同一事实 */
  private findNearDup(vec: number[]): { note: MemoryNote; cos: number } | undefined {
    if (this.cfg.dedupeEmbedCos <= 0) return undefined;
    let best: MemoryNote | undefined, bc = 0;
    for (const n of this.store.allNotes()) {
      if (!n.embedding?.length) continue;
      const c = vecCosine(vec, n.embedding);
      if (c > bc) { bc = c; best = n; }
    }
    return best && bc >= this.cfg.dedupeEmbedCos ? { note: best, cos: bc } : undefined;
  }

  // ── 脑图页编辑入口 ──

  addNote(sessionId: string, draft: NoteDraft): MemoryNote {
    const now = this.now();
    const stamp = this.emotionStamp(sessionId || 'manual', now);
    const n = this.store.addNote(sessionId || 'manual',
      { ...draft, emotion: stamp, strengthBoost: draft.strengthBoost ?? this.emotionBoost(stamp) }, now);
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

  /** 可视化数据：节点 + 关联边 + 情绪 + 统计 */
  async graph(sessionId?: string) {
    const now = this.now();
    const raw = this.store.allNotes()
      .filter((n) => !sessionId || n.sessionId === sessionId);
    const notes = raw.map((n) => ({
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
      emotion: n.emotion,
    }));
    const { edges, nearDup } = await this.graphEdges(raw, sessionId);
    const stats = {
      total: notes.length,
      avgRetention: notes.length
        ? +(notes.reduce((s, n) => s + n.retention, 0) / notes.length).toFixed(3)
        : 0,
      fading: notes.filter((n) => n.fading).length,
      sessions: new Set(notes.map((n) => n.sessionId)).size,
      /** 向量余弦 ≥0.9 的近重复记忆对数（判重质量观测指标） */
      nearDup,
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
      edges,
      config: { forgetThreshold: this.cfg.forgetThreshold, topK: this.cfg.topK },
    };
  }

  /**
   * 图谱关联边（实时推导，不落库——存了反而会在记忆/人设变化后变陈旧）。
   * - semantic：向量余弦 ∈ [0.65, 0.9) 的每节点 top-3；≥0.9 判为近重复不连（判重是独立问题）
   * - facet：记忆向量与人格小节（页面前端同款 ## 拆分）最大余弦 ≥0.55
   * 向量缺失/embedding 未启用时相应边集为空，页面自行回退 ngram/字面推断。
   * 计算是 O(n²)：按（会话过滤 · store.graphVersion · 人设文本）缓存，
   * 记忆结构/向量未变时 15s 轮询直接命中。
   */
  private edgesCache?: {
    key: string;
    value: { edges: { a: string; b: string; kind: 'semantic' | 'facet' | 'derived'; score: number }[]; nearDup: number };
  };

  private async graphEdges(notes: MemoryNote[], sessionId?: string): Promise<{ edges: { a: string; b: string; kind: 'semantic' | 'facet' | 'derived'; score: number }[]; nearDup: number }> {
    const key = `${sessionId ?? ''}|${this.store.graphVersion}|${this.persona()}`;
    if (this.edgesCache?.key === key) return this.edgesCache.value;
    const edges: { a: string; b: string; kind: 'semantic' | 'facet' | 'derived'; score: number }[] = [];
    const present = new Set(notes.map((n) => n.id));
    for (const n of notes) {
      for (const s of n.sourceIds ?? []) {
        if (present.has(s)) edges.push({ a: n.id, b: s, kind: 'derived', score: 1 });
      }
    }
    const vecs = notes.filter((n) => n.embedding?.length);
    let nearDup = 0;
    if (vecs.length >= 2) {
      const best = new Map<string, { a: string; b: string; score: number }>();
      const dups = new Set<string>();
      for (const n of vecs) {
        const sims: { m: MemoryNote; c: number }[] = [];
        for (const m of vecs) {
          if (m.id === n.id) continue;
          const c = vecCosine(n.embedding!, m.embedding!);
          if (c >= 0.9) {
            const [a, b] = n.id < m.id ? [n.id, m.id] : [m.id, n.id];
            dups.add(`${a}|${b}`);
          } else if (c >= 0.65) sims.push({ m, c });
        }
        for (const { m, c } of sims.sort((x, y) => y.c - x.c).slice(0, 3)) {
          const [a, b] = n.id < m.id ? [n.id, m.id] : [m.id, n.id];
          const cur = best.get(`${a}|${b}`);
          if (!cur || c > cur.score) best.set(`${a}|${b}`, { a, b, score: +c.toFixed(3) });
        }
      }
      nearDup = dups.size;
      edges.push(...[...best.values()].sort((x, y) => y.score - x.score).slice(0, 400)
        .map((e) => ({ ...e, kind: 'semantic' as const })));
    }
    const fvecs = await this.facetVectors();
    if (fvecs) {
      for (const n of vecs) {
        let bi = -1, bc = 0;
        fvecs.forEach((fv, i) => {
          const c = vecCosine(n.embedding!, fv);
          if (c > bc) { bc = c; bi = i; }
        });
        if (bi >= 0 && bc >= 0.55) edges.push({ a: n.id, b: `facet:${bi}`, kind: 'facet', score: +bc.toFixed(3) });
      }
    }
    const value = { edges, nearDup };
    this.edgesCache = { key, value };
    return value;
  }

  /** 人格小节向量缓存：key=当前人设文本；人设不变则 /api/state 轮询零成本 */
  private facetVecCache: { key: string; vecs: number[][] | null } = { key: '', vecs: null };

  private async facetVectors(): Promise<number[][] | null> {
    if (!this.embedder?.enabled) return null;
    const persona = this.persona();
    if (this.facetVecCache.key !== persona) {
      const texts = personaFacetTexts(persona);
      this.facetVecCache = { key: persona, vecs: texts.length ? await this.embedder.embed(texts) : null };
    }
    return this.facetVecCache.vecs;
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

/**
 * 人设按「## 小节」拆成特质文本（与 page.html personaFacets 同款规则：
 * 无小节时整篇作一节，最多 6 节，facet id 为 facet:<下标>——两边必须一致）。
 */
function personaFacetTexts(text: string): string[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  const parts = t.split(/^##\s+/m).slice(1);
  if (!parts.length) return [t];
  return parts.slice(0, 6).map((p) => {
    const nl = p.indexOf('\n');
    return ((nl < 0 ? p : p.slice(0, nl)).trim() + ' ' + (nl < 0 ? '' : p.slice(nl + 1)).trim()).trim();
  });
}
