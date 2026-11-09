import { ATTITUDE_OBJECT_RE, DEFAULT_BRAIN_CONFIG, EPHEMERAL_TIME_RE, GLOBAL_SESSION_ID, MOOD_VALENCE, PRE_TAG_PERSONA_ID, WHALE_CHARACTER_ID, WHALE_PERSONA_IDS, notePersonaId, resolveSelfFlag } from './types.ts';
import type { BrainConfig, BrainContext, DistillResult, EmotionState, MemoryNote, NoteDraft, NoteEmotion, Turn } from './types.ts';
import { isUserKey, normalizeProfileKey, resolveActorTag, sessionProfileKey, splitActor, userProfileKey } from './identity.ts';
import { ageInDays, retention } from './decay.ts';
import { ageLabel, formatClock } from './time.ts';
import { Retriever } from './retrieval.ts';
import { EmotionEngine, NEUTRAL_EMOTION } from './emotion.ts';
import { BrainStore, PRIVATE_MARK, PROFILE_TEXT_CAP, stripPrivateMarks, stripPrivateSegments, truncateProfileText } from './store.ts';
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
export { splitActor, resolveActorTag, userProfileKey, sessionProfileKey } from './identity.ts';

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

  /** 内部 LLM 调用（蒸馏/脉络/巩固）用的人设：配了精简版就用，否则取 pid 人设全文；缺省/查无此人设回落活动人设 */
  private personaForPrompts(pid?: string): string {
    const digest = this.cfg.personaDigest.trim();
    if (digest) return digest;
    const text = pid ? this.store.personaEntry(pid)?.text : undefined;
    return text || this.persona();
  }

  /** 整体替换人格内核（导入路径；写入需经此入口而非直接改文件） */
  setPersona(text: string): void {
    this.store.setPersona(text.trim());
  }

  personas(): { activeId: string; personas: ReturnType<BrainStore['listPersonas']> } {
    return { activeId: this.store.activePersonaId(), personas: this.store.listPersonas() };
  }

  createPersona(
    name: string, text: string, id?: string,
    extra?: { characterId?: string; moods?: string[] },
  ): ReturnType<BrainStore['createPersona']> {
    return this.store.createPersona(name, text, id, extra);
  }

  savePersona(
    id: string, name: string, text: string,
    patch?: { characterId?: string | null; moods?: string[] | null },
  ): ReturnType<BrainStore['savePersona']> {
    return this.store.savePersona(id, name, text, patch);
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
    // 私聊无 tag：sess 画像卡人工绑定的昵称回退为发言人（name 空=未绑定，行为不变）
    const given = typeof speaker === 'string' ? { nick: speaker } : speaker;
    const sp = given?.openid || given?.nick ? given : this.boundSpeaker(sessionId);
    // 世界轨共享·自我轨按角色隔离：检索池先滤掉他角色自我内容（attitude/self），
    // topK 命中/强化/昵称保底/跨群召回四处口径自然一致。
    // 私域过滤同点生效：域外 note 对 topK/保底/跨群/强化四路均不可见（硬隔离）。
    const visible = this.store.allNotes().filter((n) =>
      this.trackVisible(n) && !n.absorbedAt && this.scopeVisible(n, sessionId));
    const scored = this.retriever.query(
      visible, sessionId, queryText, now, this.store.graphVersion, queryVec,
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
      memoryLines.push(`- [${ageLabel(n.createdAt, now)}记] ${n.actor ? `[${n.actor}] ` : ''}${n.content}`);
    }
    if (sp?.nick) {
      const extra = visible
        .filter((n) => n.kind === 'attitude'
          && !attitudeHitIds.has(n.id) && n.content.includes(sp.nick!))
        .sort((a, b) => retention(b, now) - retention(a, now));
      const room = Math.max(0, 3 - attitudeLines.length);
      for (const n of extra.slice(0, room)) attitudeLines.push(`- ${n.content}`);
    }
    if (sp && (sp.openid || sp.nick)) {
      const xpool = visible.filter((n) => {
        // 全局域已在主检索池中，跨会话通道不再重复计入
        if (n.sessionId === sessionId || n.sessionId === GLOBAL_SESSION_ID) return false;
        if (n.kind !== 'attitude' && n.kind !== 'semantic') return false;
        if (!n.actor) return false;
        const id = splitActor(n.actor);
        return (sp.openid && id.openid === sp.openid) || (sp.nick && id.nick === sp.nick);
      });
      if (xpool.length) {
        const xhits = this.retriever.query(
          xpool, undefined, queryText || sp.nick || '', now, this.store.graphVersion, queryVec,
          { pool: xpool, indexKey: `__x__${sessionId}` },
        );
        for (const s of xhits.slice(0, 2)) {
          const n = s.note;
          memoryLines.push(`- [跨群·${ageLabel(n.createdAt, now)}记] ${n.actor ? `[${n.actor}] ` : ''}${n.content}`);
          const th = s.relSrc === 'emb' ? this.cfg.reinforceMinEmbedCos : this.cfg.reinforceMinCos;
          if (s.rel >= th) {
            this.store.reinforce(n, this.cfg.reinforceStep, this.cfg.strengthCap, now);
          }
        }
      }
    }
    // 个人画像（同名归并）优先，会话级画像次之；仅会话画像时维持「[画像]」标签
    // 私域段：非私域会话剥〔私〕句，私域会话保内容只去标记符
    const priv = this.store.isPrivateSession(sessionId);
    const personProfile = (sp?.openid || sp?.nick)
      ? this.store.mergedUserProfile({ openid: sp?.openid, nick: sp?.nick, includePrivate: priv })
      : '';
    const sessRaw = this.store.profileOf(sessionId);
    const sessProfile = priv ? stripPrivateMarks(sessRaw) : stripPrivateSegments(sessRaw);
    if (sessProfile) memoryLines.unshift(`- ${personProfile ? '[会话画像]' : '[画像]'} ${sessProfile}`);
    if (personProfile) memoryLines.unshift(`- [画像] ${personProfile}`);

    return {
      persona: this.persona(),
      emotion: this.emotion.describeState(this.emotionFor(sessionId, this.store.activePersonaId(), now)),
      digest: this.store.digestOf(sessionId)?.text ?? '',
      clock: formatClock(now, this.cfg.timeZone),
      memoryLines,
      attitudeLines,
      hits,
    };
  }

  /** 捕获一轮完整对话（不立即蒸馏，攒到 endOfTurn）；同步滚动摘要输入与轮数 */
  ingest(sessionId: string, turn: Turn): void {
    // 批次戳：钉「形成时人设」——切换瞬间在途批次仍归原角色，不读蒸馏时刻的 activeId
    const stamped: Turn = {
      ...turn,
      personaId: turn.personaId || this.store.activePersonaId() || undefined,
    };
    const buf = this.turnBuffer.get(sessionId) ?? [];
    buf.push(stamped);
    this.turnBuffer.set(sessionId, buf);
    const hb = this.historyBuffer.get(sessionId) ?? [];
    hb.push(stamped);
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
    // 攒批：未达 distillEveryTurns 继续攒（30 轮兜底防积压）——
    // 每轮一次蒸馏改 N 轮一次，输入按轮摊薄；情绪更新粒度同步变粗（配置即权衡）
    const need = Math.max(1, this.cfg.distillEveryTurns);
    if (turns.length < need && turns.length < 30) return;
    this.turnBuffer.set(sessionId, []);
    this.distilling.add(sessionId);
    try {
      const now = this.now();
      // 批次人设=批内众数（ingest 时钉的形成时人设），缺省回落活动人设——
      // 修「切换瞬间在途批次归新人设」窗口；existing/归并/戳/情绪/profile 全用它
      const batchPid = this.batchPersonaId(turns);
      // 私聊绑定视图：整批无 tag 且画像卡绑了 name 时，发言人显示为绑定昵称——
      // convo 行/actors 归集/existingProfiles 同口径生效（绑定=人工真值，非推断）
      const viewTurns = this.withBoundSpeaker(sessionId, turns);
      const actors = viewTurns.map((t) => t.actor);
      // 判重：附上当前 top-相关已有记忆，蒸馏结果可用 merge 指回更新而非重复新增。
      // 他角色的自我轨（attitude/self）不进列表——否则 mergeIndex 会改写别的角色轨。
      const queryText = turns.map((t) => t.userText).join(' ');
      const existing = this.retriever
        .query(
          this.store.allNotes().filter((n) =>
            this.trackVisible(n, batchPid) && !n.absorbedAt && this.scopeVisible(n, sessionId)),
          sessionId, queryText, now, this.store.graphVersion,
        )
        .slice(0, 8)
        .map((s) => s.note);
      const result = await this.distiller.distill(
        viewTurns, this.personaForPrompts(batchPid), existing, this.emotionFor(sessionId, batchPid, now),
        this.existingProfiles(sessionId, actors),
        { now, timeZone: this.cfg.timeZone },
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
        const s = this.emotion.apply(sessionId, e, now, batchPid);
        this.store.setEmotion(sessionId, s);
      }
      const stamp = this.emotionStamp(sessionId, now, batchPid);
      // 强情绪下形成的记忆更难忘：|v|·a 加权初始强度（最高 ×1.5）
      const boost = this.emotionBoost(stamp);
      // 待取向量集合：merge 目标（content 被改写需重算）+ 批量取向量失败的新记忆。
      // 已有有效向量的（dup 命中 / 刚 setEmbedding 的新记忆）不再重复 embed。
      const forEmbed: MemoryNote[] = [];
      // 新增草稿先取向量做写入判重：cos≥dedupeEmbedCos 视为同一事实，强化旧记忆而非再写一条
      const freshVecs = this.embedder?.enabled
        ? await this.embedder.embed(
            result.memories.filter((m) => m.mergeIndex == null || !existing[m.mergeIndex]).map((m) => m.content))
        : null;
      let fi = 0;
      for (const m of result.memories) {
        // 格式护栏：attitude 必须「对<对象>：<立场>」；LLM 常把用户事实错标为
        // attitude（线上实测 13/15），畸形条降级 episodic——不自动补「对」前缀，
        // 「X：确诊咽炎」补前缀会伪造立场。
        if (m.kind === 'attitude' && !ATTITUDE_OBJECT_RE.test(m.content.trim())) {
          this.log?.(`态度格式不符，按事实入库：${m.content.slice(0, 24)}…`);
          m.kind = 'episodic';
        }
        const cand = m.mergeIndex != null ? existing[m.mergeIndex] : undefined;
        // 轨道兼容才算「同一条记忆」：kind 跨类不并（事实吃态度=心态丢失）；
        // self 草稿不得 merge 进世界轨条目（自我内容落共享轨=跨角色泄漏），反之亦然
        const draftTrack = (m.kind === 'attitude' || resolveSelfFlag(m.kind, m.self, m.content) === true)
          ? `char:${this.characterOf(batchPid)}` : undefined;
        const target = (cand
          && (cand.kind === 'attitude') === (m.kind === 'attitude')
          && this.trackKeyOf(cand) === draftTrack ? cand : undefined)
          ?? (m.kind === 'attitude' ? this.findAttitudeSameObject(sessionId, m.content, batchPid) : undefined);
        if (target) {
          this.store.updateNote(target.id, { content: m.content, importance: m.importance, kind: m.kind });
          this.store.reinforceById(target.id, this.cfg.reinforceStep, this.cfg.strengthCap, now);
          forEmbed.push(target);
          continue;
        }
        const vec = freshVecs?.[fi++] ?? null;
        const dup = vec ? this.findNearDup(vec, {
          kind: m.kind ?? 'episodic',
          self: resolveSelfFlag(m.kind, m.self, m.content),
          personaId: batchPid,
        }, this.draftScope(sessionId, m)) : undefined;
        if (dup) {
          this.store.reinforce(dup.note, this.cfg.reinforceStep, this.cfg.strengthCap, now);
          this.log?.(`判重合并：与「${dup.note.content.slice(0, 20)}」余弦 ${dup.cos.toFixed(2)}，强化旧记忆`);
          continue;
        }
        // actor 只写了昵称时回填本轮真实全 tag——否则按 openid 归集（画像重生成、跨群召回）会漏条
        const n = this.store.addNote(sessionId, {
          ...m, actor: resolveActorTag(m.actor, actors), emotion: stamp, strengthBoost: boost, personaId: batchPid,
        }, now);
        if (vec) this.store.setEmbedding(n.id, vec);
        else forEmbed.push(n);
      }
      // 意图级遗忘：编号指回附带列表 / 子串精确匹配（限本会话+本角色可见轨，防误删他轨）
      for (const f of result.forget ?? []) {
        if (typeof f === 'number') {
          const t = existing[f];
          if (t) this.store.deleteNote(t.id);
        } else {
          for (const n of this.store.allNotes()) {
            if (n.sessionId === sessionId && this.trackVisible(n, batchPid) && n.content.includes(f)) this.store.deleteNote(n.id);
          }
        }
      }
      await this.reviewAndWriteProfiles(sessionId, result, actors, batchPid);
      // 新/改记忆补语义向量（失败静默，检索回退 lexical）
      await this.embedNotes(forEmbed);
      // 滚动摘要：累计轮数到阈值则更新「会话脉络」
      await this.maybeDigest(sessionId);
    } finally {
      this.distilling.delete(sessionId);
    }
  }

  /**
   * 「对X：」规范格式的态度按对象归并：会话+人设轨内找同对象旧条。
   * 只认「对」前缀——存量「X：」式人物事实不是立场，折叠会丢信息。
   */
  private findAttitudeSameObject(sessionId: string, content: string, pid: string): MemoryNote | undefined {
    const obj = ATTITUDE_OBJECT_RE.exec(content.trim())?.[1]?.trim();
    if (!obj) return undefined;
    return this.store.allNotes().find((n) =>
      n.kind === 'attitude' && !n.absorbedAt
      && n.sessionId === sessionId
      && this.characterOf(notePersonaId(n)) === this.characterOf(pid)
      && new RegExp(`^对${obj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[：:]`).test(n.content.trim()));
  }

  /**
   * 角色归属解析：personaId → characterId。
   * 显式 characterId 优先；缺省回落 whale 系常量（兼容分轨前存量）；其余人设=独立角色。
   */
  private characterOf(personaId: string | undefined): string {
    const pid = personaId || PRE_TAG_PERSONA_ID;
    const entry = this.store.personaEntry(pid);
    if (entry?.characterId?.trim()) return entry.characterId.trim();
    return (WHALE_PERSONA_IDS as readonly string[]).includes(pid) ? WHALE_CHARACTER_ID : pid;
  }

  /**
   * 三轨可见性：世界轨（非 attitude 且 self≠true）全角色共享；
   * 自我轨（attitude/self:true）仅同 character 可见。
   * pid=观察者人设 id（批次戳/活动人设）；无活动人设时全部可见，兼容分轨前行为。
   */
  private trackVisible(note: MemoryNote, pid?: string): boolean {
    const selfTrack = note.kind === 'attitude' || note.self === true;
    if (!selfTrack) return true;
    const viewerPid = pid ?? this.store.activePersonaId();
    if (!viewerPid) return true;
    return this.characterOf(notePersonaId(note)) === this.characterOf(viewerPid);
  }

  /** 自我轨键（角色 id）；世界轨返回 undefined（全角色共享，不作判重/归并边界） */
  private trackKeyOf(note: MemoryNote): string | undefined {
    return (note.kind === 'attitude' || note.self === true)
      ? `char:${this.characterOf(notePersonaId(note))}` : undefined;
  }

  /** 人设 id 众数（缺省回落活动人设）：批次/会话归属统一口径；计数并列取较晚出现者（更新上下文优先） */
  private modalPersonaId(ids: (string | undefined)[]): string {
    const counts = new Map<string, { n: number; last: number }>();
    ids.forEach((p, i) => {
      const k = p || this.store.activePersonaId() || '';
      if (!k) return;
      const c = counts.get(k) ?? { n: 0, last: -1 };
      c.n++; c.last = i;
      counts.set(k, c);
    });
    let best = '';
    let bestN = 0;
    let bestLast = -1;
    for (const [p, c] of counts) {
      if (c.n > bestN || (c.n === bestN && c.last > bestLast)) { best = p; bestN = c.n; bestLast = c.last; }
    }
    return best || this.store.activePersonaId() || '';
  }

  /** 蒸馏批次人设=批内众数（ingest 时钉的形成时戳），全缺省回落活动人设 */
  private batchPersonaId(turns: Turn[]): string {
    return this.modalPersonaId(turns.map((t) => t.personaId));
  }

  /** 情绪按角色隔离：状态 personaId 的角色与 viewer 不符→中性（缺省=whale 存量）；同角色版本共享 */
  private emotionFor(sessionId: string, personaId: string | undefined, now: number): EmotionState {
    const s = this.emotion.get(sessionId, now);
    if (this.characterOf(s.personaId) !== this.characterOf(personaId ?? this.store.activePersonaId())) {
      return NEUTRAL_EMOTION;
    }
    return s;
  }

  /**
   * 记忆生效作用域：n.private 手动覆盖 ?? 来源会话域标记；undefined=公开。
   * 派生而非写时盖章——标域/撤域立即作用于全部存量，零回填。
   */
  private noteScope(n: MemoryNote): string | undefined {
    return n.private ?? (this.store.sessionDomainOf(n.sessionId) || undefined);
  }

  /**
   * 私域可见性（硬隔离）：公开/强制公开全域可见；域名作用域只在同域会话可见；
   * sessionId 作用域只在该会话可见（原地私密，即便该会话后来标了域）。
   */
  private scopeVisible(n: MemoryNote, targetSession: string): boolean {
    const scope = this.noteScope(n);
    if (!scope || scope === 'public') return true;
    return scope === this.store.sessionDomainOf(targetSession) || scope === targetSession;
  }

  /** 待写入草稿的生效域：手动覆盖 ?? 目标会话域（与 addNote 落库口径一致） */
  private draftScope(sessionId: string, draft: { private?: string }): string | undefined {
    return draft.private?.trim() || this.store.sessionDomainOf(sessionId) || undefined;
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
      const recent = this.withBoundSpeaker(sessionId, buf.slice(-this.cfg.digestWindowTurns));
      const text = await this.distiller.digest(
        recent, this.store.digestOf(sessionId)?.text ?? '', this.personaForPrompts(),
        { now: this.now(), timeZone: this.cfg.timeZone }, this.cfg.digestTurnCharCap,
      );
      if (text) {
        this.store.setDigest(sessionId, text, count);
        this.log?.(`会话脉络 ${sessionId.slice(0, 8)}…：摘要更新（${count} 轮）`);
      }
    } finally {
      this.digesting.delete(sessionId);
    }
  }

  /**
   * 私聊发言人绑定：sess 画像卡 name 字段即「该会话发言人是谁」的人工绑定。
   * C2C 消息宿主不打发送者 tag（inbound 只对 group 组装 [昵称 (openid)]），
   * 无 tag 会话用绑定昵称作 speaker——读路径按 nick 点亮 u: 画像/态度保底/跨群召回；
   * 写路径 convo 行显示绑定昵称且 existingProfiles 可见该人画像。
   * name 为空=未绑定，一切行为与旧逻辑一致。
   */
  boundSpeakerNick(sessionId: string): string {
    return this.store.profileEntry(sessionProfileKey(sessionId))?.name?.trim() ?? '';
  }

  private boundSpeaker(sessionId: string): { nick?: string; openid?: string } | undefined {
    const nick = this.boundSpeakerNick(sessionId);
    return nick ? { nick } : undefined;
  }

  /**
   * 发言人绑定视图：整批轮次都没有真实 tag 且绑了 name 时，把发言人显示为
   * 绑定昵称；有一条真 tag 的会话原样返回（群聊个别消息解析失败不注入绑定人）。
   */
  private withBoundSpeaker(sessionId: string, turns: Turn[]): Turn[] {
    if (turns.some((t) => t.actor)) return turns;
    const nick = this.boundSpeakerNick(sessionId);
    if (!nick) return turns;
    return turns.map((t) => ({ ...t, actor: t.actor ?? nick }));
  }

  /** 收集「现有画像」供蒸馏增量修订：会话级画像 + 涉及发言人的个人画像 */
  private existingProfiles(sessionId: string, actors: (string | undefined)[]): { actor?: string; text: string }[] {
    const out: { actor?: string; text: string }[] = [];
    const sessProfile = this.store.profileOf(sessionId);
    if (sessProfile) out.push({ text: sessProfile });
    for (const actor of new Set(actors.filter((a): a is string => !!a))) {
      const id = splitActor(actor);
      if (id.openid) {
        const text = this.store.profileOf(userProfileKey(id.openid));
        if (text) out.push({ actor, text });
        continue;
      }
      // 裸昵称（私聊绑定 name 等）：按画像 name 精确匹配收该人全部可见 u: 画像，
      // 合成全 tag 供种回键位按 openid 归位；草稿落键仍走 resolveProfileTarget 校验
      for (const p of this.store.people()) {
        if (!p.openid || p.name !== id.nick || !p.text) continue;
        out.push({ actor: `${p.name} (${p.openid})`, text: p.text });
      }
    }
    return out;
  }

  /**
   * 解析画像条目的落点键：身份经真实发言人记录校验，不信任 LLM 输出的 openid。
   * - 无 actor → sess: 会话级
   * - openid 在已知发言人中（记忆 actor / 已有 u: 画像键 / 本轮 actor）→ u: 键
   * - openid 不可信但昵称唯一匹配已知发言人 → 校正为该发言人真实 openid
   * - 无法确认到具体的人 → sess: 兜底，不制造幽灵人物
   */
  private resolveProfileTarget(
    sessionId: string, actor: string | undefined, speakers: Map<string, string>,
  ): { key: string; name?: string; corrected: boolean } {
    if (!actor) return { key: sessionProfileKey(sessionId), corrected: false };
    const id = splitActor(actor);
    if (id.openid && speakers.has(id.openid))
      return { key: userProfileKey(id.openid), name: id.nick, corrected: false };
    const same = id.nick ? [...speakers].filter(([, n]) => n === id.nick) : [];
    if (same.length === 1)
      return { key: userProfileKey(same[0]![0]), name: same[0]![1], corrected: true };
    return { key: sessionProfileKey(sessionId), corrected: false };
  }

  private async reviewAndWriteProfiles(
    sessionId: string, result: DistillResult, actors: (string | undefined)[],
    writerPid?: string,
  ): Promise<void> {
    // 发言人注册表并入本轮真实 actor，供画像身份校验
    const speakers = this.store.speakers();
    for (const a of actors) {
      if (!a) continue;
      const id = splitActor(a);
      if (id.openid) speakers.set(id.openid, id.nick);
    }
    const candidates = [
      ...(result.profile ? [{ text: result.profile }] : []),
      ...(result.profiles ?? []),
    ];
    // 按「解析后落点」分组：同一键的多条草稿合并候选文本交审核，防顺序覆盖
    const byKey = new Map<string, ProfileReviewItem>();
    const seed = (key: string, actor: string | undefined, previous: string, candidate: string) => {
      const cur = byKey.get(key);
      if (!cur) { byKey.set(key, { actor, previous, candidate }); return; }
      if (previous) cur.previous = cur.previous ? `${cur.previous}\n${previous}` : previous;
      cur.candidate = cur.candidate !== cur.previous ? `${cur.candidate}\n${candidate}` : candidate;
      if (!cur.actor && actor) cur.actor = actor;
    };
    for (const p of this.existingProfiles(sessionId, actors)) {
      seed(this.resolveProfileTarget(sessionId, p.actor, speakers).key, p.actor, p.text, p.text);
    }
    for (const p of candidates) {
      const t = this.resolveProfileTarget(sessionId, p.actor, speakers);
      if (t.corrected)
        this.log?.(`画像身份校正：${p.actor ?? ''} → ${t.key.slice(0, 10)}…（LLM 输出的 openid 与真实发言人不符）`);
      seed(t.key, p.actor, '', p.text);
    }
    // 已审画像在新会话首次出现：直接补会话归属（纯簿记，不值得为此走审核 LLM）
    for (const [key, item] of byKey) {
      if (!isUserKey(key) || !item.previous || this.store.reviewedOf(key) !== item.previous) continue;
      const p = this.store.people().find((x) => x.key === key);
      if (p && !p.sessions.includes(sessionId)) {
        this.store.setProfileEntry(key, item.previous, { sessionId, name: p.name || '', reviewed: item.previous });
      }
    }
    // 「需重审」= 有新候选改写，或当前内容与上次审核产出不一致（含从未审过的旧数据）。
    // reviewed 存 ProfileEntry 持久化，重启后不再每会话重审一遍存量画像。
    const pending = [...byKey.entries()].filter(([key, item]) =>
      item.candidate !== item.previous
      || this.store.reviewedOf(key) !== item.previous);
    if (!pending.length) return;
    const reviewed = await this.distiller.reviewProfiles(pending.map(([, item]) => item));
    if (!reviewed) {
      this.log?.(`画像审核失败：${sessionId.slice(0, 8)}…，保持原画像`);
      return;
    }
    const people = this.store.people();
    for (const [i, [key, item]] of pending.entries()) {
      const text = truncateProfileText(reviewed[i]!, PROFILE_TEXT_CAP);
      // 私域标记监控：review 掉标即 fail-open，日志可见供人工纠正
      const prevMarks = (item.previous.match(/〔私〕/g) ?? []).length;
      const newMarks = (text.match(/〔私〕/g) ?? []).length;
      if (newMarks < prevMarks)
        this.log?.(`画像私域标记减少 ${key}：${prevMarks}→${newMarks}，请人工核对私段内容`);
      const isUser = isUserKey(key);
      const needsSessionLink = isUser && !!text
        && !(people.find((p) => p.key === key)?.sessions ?? []).includes(sessionId);
      // 文本未变但缺审核章时也要落一笔（reviewed=text 盖章），否则下轮又进 pending
      if (text !== item.previous || needsSessionLink || this.store.reviewedOf(key) !== text) {
        if (isUser) {
          const name = (item.actor && splitActor(item.actor).nick)
            || people.find((p) => p.key === key)?.name || '';
          this.store.setProfileEntry(key, text, { sessionId, name, reviewed: text, personaId: writerPid || this.store.activePersonaId() });
        } else {
          this.store.setProfileEntry(key, text, { sessionId, reviewed: text, personaId: writerPid || this.store.activePersonaId() });
        }
      }
    }
  }

  /**
   * 手工合并两张人物画像（同一人双 openid）：审核模型把两份文本整理成一份，
   * 写入 keep 并吸收 drop 的全部会话标记，drop 键删除。
   * 审核失败/无蒸馏时不改任何数据，返回 false。
   */
  async mergeProfiles(keepKey: string, dropKey: string): Promise<boolean> {
    if (keepKey === dropKey || !isUserKey(keepKey) || !isUserKey(dropKey)) return false;
    const people = this.store.people();
    const keep = people.find((p) => p.key === keepKey);
    const drop = people.find((p) => p.key === dropKey);
    if (!keep || !drop) return false;
    const reviewed = await this.distiller.reviewProfiles([
      { actor: keep.name || drop.name, previous: keep.text, candidate: drop.text },
    ]);
    const text = reviewed?.[0]?.trim();
    if (!text) return false;
    const sessions = [...new Set([...keep.sessions, ...drop.sessions])];
    this.store.setProfileEntry(keepKey, text, { sessionId: sessions[0] ?? '', name: keep.name || drop.name, sessions, reviewed: text, personaId: this.store.activePersonaId() });
    this.store.setProfileEntry(dropKey, '', { sessionId: sessions[0] ?? '' });
    return true;
  }

  /**
   * 手工编辑画像文本/名称（脑图页画像卡「编辑」）。
   * 人工修改即视为已审（reviewed=text），但不锁定——下一轮蒸馏仍可修订。
   * 允许给尚无画像的对象手建一张（会话卡的「画像未生成」态），
   * 但键必须指向已知发言人/会话，防打错键产生幽灵画像。
   */
  updateProfile(key: string, patch: { name?: string; text: string }): boolean {
    const k = normalizeProfileKey(key);
    const text = patch.text?.trim();
    if (!text) return false;
    const entry = this.store.profileEntry(k);
    if (!entry) {
      const known = isUserKey(k)
        ? this.store.speakers().has(k.slice(2))
        : this.store.sessions().some((s) => s.sessionId === k.slice(5));
      if (!known) return false;
    }
    this.store.setProfileEntry(k, text, {
      sessionId: entry?.sessions[0] ?? (isUserKey(k) ? '' : k.slice(5)),
      // name 显式传空串即清空；不传（undefined）才沿用旧名
      name: patch.name !== undefined ? patch.name : (entry?.name ?? ''),
      reviewed: text,
      personaId: this.store.activePersonaId(),
    });
    return true;
  }

  /** 删除单张画像卡（空文本 profile op 即删除语义） */
  deleteProfile(key: string): boolean {
    const entry = this.store.profileEntry(key);
    if (!entry) return false;
    this.store.setProfileEntry(key, '', { sessionId: entry.sessions[0] ?? '' });
    return true;
  }

  /**
   * 画像重生成（脑图页画像卡「重生成」）：归集该对象的记忆 → 蒸馏起草 → 审核把关 → 写回。
   * 草稿/审核任一失败或审核判无稳定内容时不改数据，reason 供页面提示。
   */
  async regenerateProfile(key: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.distiller.enabled) return { ok: false, reason: '蒸馏服务不可用' };
    const k = normalizeProfileKey(key);
    const entry = this.store.profileEntry(k);
    const person = isUserKey(k);
    // 记忆 actor 多为裸昵称（蒸馏 prompt 只让写昵称，不带 openid）——
    // 归集须 openid 或昵称双口径命中，与 assemble/mergedUserProfile 一致
    const nick = entry?.name || (person ? this.store.speakers().get(k.slice(2)) : undefined);
    const evidence = this.store.allNotes()
      .filter((n) => {
        // 自我轨按角色隔离：画像证据只取当前角色可见的记忆（跨角色 self 不污染画像）
        if (!this.trackVisible(n)) return false;
        if (!person) return n.sessionId === k.slice(5);
        if (n.actor == null) return false;
        const id = splitActor(n.actor);
        return id.openid === k.slice(2) || (!!nick && id.nick === nick);
      })
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-60)
      // 私域证据行前缀〔私〕：撰稿确定性识别，不靠模型猜哪条是私的
      .map((n) => (this.noteScope(n) ? { ...n, content: `${PRIVATE_MARK}${n.content}` } : n));
    // 记忆佐证即对象存在——entry 缺失（画像未生成过）同样允许重建
    if (!evidence.length) return { ok: false, reason: '该对象暂无可用的记忆' };
    const name = nick || k.slice(person ? 2 : 5).slice(0, 8);
    const draft = await this.distiller.draftProfile(
      person ? `用户「${name}」` : '本会话群聊整体（用户群像/氛围）',
      evidence, this.personaForPrompts(), { now: this.now(), timeZone: this.cfg.timeZone });
    // draft 三态：undefined=调用失败；''=模型判定无可提炼内容；非空=送审
    if (draft === undefined) return { ok: false, reason: '蒸馏调用失败' };
    if (!draft) return { ok: false, reason: '起草认为没有可提炼的稳定内容，未改动' };
    const reviewed = await this.distiller.reviewProfiles([
      { actor: name, previous: entry?.text ?? '', candidate: draft },
    ]);
    if (reviewed == null) return { ok: false, reason: '画像审核调用失败' };
    const text = reviewed[0]?.trim();
    if (!text) return { ok: false, reason: '审核认为没有可保留的稳定内容，未改动' };
    this.store.setProfileEntry(k, text, {
      sessionId: entry?.sessions[0] ?? (person ? '' : k.slice(5)),
      name,
      sessions: entry?.sessions ?? (person ? undefined : [k.slice(5)]),
      reviewed: text,
      personaId: this.store.activePersonaId(),
    });
    return { ok: true };
  }

  /** 清空会话脉络（管理入口；清空后由滚动摘要按节奏重建） */
  clearDigest(sessionId: string): boolean {
    const had = !!this.store.digestOf(sessionId);
    if (had) this.store.clearDigest(sessionId);
    return had;
  }

  /** 按时间段删除记忆（createdAt 闭区间）；返回删除条数 */
  purgeNotesInRange(from: number, to: number): number {
    return this.store.deleteNotesInRange(from, to).length;
  }

  /** 按归属人设批量删除记忆（脑图页危险区·按人设删除）；返回删除条数 */
  purgeNotesByPersona(personaId: string): number {
    return this.store.deleteNotesByPersona(personaId).length;
  }

  /**
   * 迭代A一次性迁移（幂等，可重入）：whale 系存量人设补 characterId='whale'，
   * 使温柔/依恋/原版三版本共享自我轨。self 标记由 sanitizeNote 在加载期
   * 启发式补齐（内存态派生），attitude 归并/情绪隔离均为读时判定——
   * 存量数据零回写，重复执行结果为空。
   * 返回被迁移的人设 id 列表。
   */
  migrateTracks(): string[] {
    const migrated: string[] = [];
    for (const p of this.store.listPersonas()) {
      if (!(WHALE_PERSONA_IDS as readonly string[]).includes(p.id)) continue;
      if (p.characterId) continue;
      this.store.savePersona(p.id, p.name, p.text, { characterId: WHALE_CHARACTER_ID });
      migrated.push(p.id);
    }
    return migrated;
  }

  /**
   * 记忆重置（保人设）：清笔记/画像/情绪/摘要。
   * 除 store 外还要清内存态——EmotionEngine states 与轮次缓冲不清，
   * 旧数据会在下次蒸馏/digest 时被回写或驱动误触发。
   */
  resetMemory(): { notes: number; profiles: number; emotions: number; digests: number } {
    const cleared = {
      notes: this.store.allNotes().length,
      profiles: this.store.people().length,
      emotions: this.store.sessions().filter((s) => s.emotion).length,
      digests: this.store.sessions().filter((s) => this.store.digestOf(s.sessionId)).length,
    };
    this.store.resetMemory();
    this.emotion.reset();
    this.turnBuffer.clear();
    this.historyBuffer.clear();
    this.turnCounter.clear();
    return cleared;
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
    // 巩固视角=本会话人设众数：会话内自我轨只归并到形成它的角色，
    // 跨角色 self 条目不进本批喂料（否则角色A的自我被角色B的巩固吞掉）；
    // 世界轨对各角色可见，天然全量入池
    const sessNotes = this.store.allNotes().filter((n) => n.sessionId === sessionId);
    const viewPid = this.modalPersonaId(sessNotes.map((n) => notePersonaId(n)));
    const eps = sessNotes.filter(
      (n) => n.kind === 'episodic' && !n.absorbedAt
        && this.trackVisible(n, viewPid)
        && ageInDays(n, now) >= this.cfg.consolidateMinAgeDays
        && !covered.has(n.id)
        // 巩固自身的产出（含降级回 episodic 的条）不再回喂，防循环再加工
        && !(n.sourceIds?.length),
    );
    if (eps.length < this.cfg.consolidateMinNotes) return 0;
    const epActors = eps.map((n) => n.actor);
    // 现有画像（会话级 + 涉及发言人的个人画像）一并喂入，巩固在旧画像上修订
    const profileText = this.existingProfiles(sessionId, epActors)
      .map((p) => `${p.actor ?? '会话整体'}：${p.text}`)
      .join('\n');
    // 归属=巩固视角人设（本会话众数）：自我轨按角色隔离后，
    // 「巩固碰巧跑在谁头上」不再是归属依据——视角即归属，跨角色内容已被喂料过滤挡住；
    // 提示词人设与情绪盖章同用视角，防「活动人设口吻」写进别角色的轨
    const notePid = viewPid || this.store.activePersonaId();
    const result = await this.distiller.consolidate(eps, profileText, this.personaForPrompts(notePid), { now, timeZone: this.cfg.timeZone });
    const stamp = this.emotionStamp(sessionId, now, notePid);
    const sourceIds = eps.map((e) => e.id);
    const boost = this.emotionBoost(stamp);
    // 入库判重：候选先批量取向量，与库内 cos>=dedupeEmbedCos 判同义转强化——
    // 历史上多轮巩固对同批源产过逐字重复的 semantic（线上实测），源退池后此处兜底产出侧
    const vecs = this.embedder?.enabled && result.memories.length
      ? await this.embedder.embed(result.memories.map((m) => m.content))
      : null;
    const noVec: MemoryNote[] = [];
    let kept = 0;
    for (let i = 0; i < result.memories.length; i++) {
      const m = result.memories[i]!;
      // 巩固可产立场条：合规「对X：」落 attitude，其余一律 semantic（与 endOfTurn 同口径格式护栏）
      let kind: MemoryNote['kind'] =
        m.kind === 'attitude' && ATTITUDE_OBJECT_RE.test(m.content.trim()) ? 'attitude' : 'semantic';
      // 时效锚点不是稳定语义：带「明天/昨晚/某月某日」的陈述一律落 episodic——
      // 线上出过「11月6日不用早起」被提升为 semantic 长期驻留
      if (kind === 'semantic' && EPHEMERAL_TIME_RE.test(m.content)) {
        kind = 'episodic';
        this.log?.(`巩固降级：含时效锚点按情景入库：${m.content.slice(0, 24)}…`);
      }
      const vec = vecs?.[i] ?? null;
      const dup = vec ? this.findNearDup(vec, {
        kind,
        self: resolveSelfFlag(kind, m.self, m.content),
        personaId: notePid,
      }, this.draftScope(sessionId, m)) : undefined;
      if (dup) {
        this.store.reinforce(dup.note, this.cfg.reinforceStep, this.cfg.strengthCap, now);
        // 谱系不丢：本批源的「沉淀自」指针并入旧条
        this.store.updateNote(dup.note.id, {
          sourceIds: [...new Set([...(dup.note.sourceIds ?? []), ...sourceIds])],
        });
        this.log?.(`巩固判重合并：与「${dup.note.content.slice(0, 20)}」同义，强化并收编来源`);
        continue;
      }
      const n = this.store.addNote(
        sessionId,
        // 语义记忆沿用源记忆全 tag（巩固输出同样常只写昵称）
        { ...m, actor: resolveActorTag(m.actor, epActors), kind, emotion: stamp, strengthBoost: boost, sourceIds, personaId: notePid },
        now,
      );
      if (vec) this.store.setEmbedding(n.id, vec);
      else noVec.push(n);
      kept++;
    }
    // 覆盖关系按「喂入」成立：无论产出判重合并还是新增，源都退出检索池
    if (result.memories.length) this.store.markAbsorbed(sourceIds, now);
    await this.reviewAndWriteProfiles(sessionId, result, epActors, notePid);
    await this.embedNotes(noVec);
    return kept;
  }

  /**
   * 追溯退池：把所有现存 semantic 笔记 sourceIds 指向的存活 episodic 打 absorbedAt。
   * markAbsorbed 只处理当次巩固的源——本方法补功能上线前的历史巩固批次；
   * 幂等可重入（已打戳/悬空/非 episodic 的引用自动跳过），插件启动与手动入口共用。
   */
  absorbCovered(): number {
    const now = this.now();
    const ids = new Set<string>();
    for (const n of this.store.allNotes()) {
      if (n.kind !== 'semantic') continue;
      for (const s of n.sourceIds ?? []) {
        const t = this.store.noteById(s);
        if (t && t.kind === 'episodic' && !t.absorbedAt) ids.add(s);
      }
    }
    if (!ids.size) return 0;
    this.store.markAbsorbed([...ids], now);
    return ids.size;
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
    const all = this.store.allNotes();
    const covered = new Set<string>();
    const bySession = new Map<string, MemoryNote[]>();
    for (const n of all) {
      if (n.kind === 'semantic') for (const id of n.sourceIds ?? []) covered.add(id);
      const arr = bySession.get(n.sessionId) ?? [];
      arr.push(n);
      bySession.set(n.sessionId, arr);
    }
    const eligible = new Map<string, number>();
    for (const [sid, notes] of bySession) {
      // 与 consolidate 同口径：按会话人设众数定视角，自我轨只数本角色可见的 episodic
      const viewPid = this.modalPersonaId(notes.map((n) => notePersonaId(n)));
      for (const n of notes) {
        if (n.kind !== 'episodic' || n.absorbedAt || covered.has(n.id)) continue;
        if (n.sourceIds?.length) continue;
        if (!this.trackVisible(n, viewPid)) continue;
        if (ageInDays(n, now) < this.cfg.consolidateMinAgeDays) continue;
        eligible.set(sid, (eligible.get(sid) ?? 0) + 1);
      }
    }
    return [...eligible.entries()]
      .filter(([, count]) => count >= this.cfg.consolidateMinNotes)
      .map(([id]) => id);
  }

  emotionOf(sessionId: string): EmotionState {
    // 读侧按活动角色隔离：跨角色返回中性（页面/注入同一份语义）
    return this.emotionFor(sessionId, this.store.activePersonaId(), this.now());
  }

  /** 当前会话情绪快照（写入记忆时钉上；op 流水会 compact，快照存记忆上才可靠）。
   *  pid=盖章视角角色：跨角色情绪不盖到本轨记忆上（否则他角色情绪串台进 label/强度加权） */
  private emotionStamp(sessionId: string, now: number, pid?: string): NoteEmotion {
    const e = this.emotionFor(sessionId, pid ?? this.store.activePersonaId(), now);
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
  sweepNearDups(): { clusters: number; merged: number; pairs: { keep: string; drop: string }[]; released: string[] } {
    // 已退池的 absorbed 条不参与：否则可能与活摘要成簇且 keep 选中存档条，
    // 把还在检索池的摘要并进不可见存档（静默丢失）
    const notes = this.store.allNotes().filter((n) => n.embedding?.length && !n.absorbedAt);
    const released: string[] = [];
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
          // 三轨归并边界：事实与态度不同角色不互并（吸收即丢失）；
          // 自我轨仅同 character 互并——同角色换版本共享、跨角色/跨轨互不可见；
          // 世界轨（trackKey 同 undefined）跨人设正常互并
          const a = notes[i]!, b = notes[j]!;
          if ((a.kind === 'attitude') !== (b.kind === 'attitude')) continue;
          if (this.trackKeyOf(a) !== this.trackKeyOf(b)) continue;
          // 私域边界：生效域不同的近重复不互并——但「公开↔域」对走佐证放行：
          // 事实既已见于公开池，域内副本放出零新信息，放完即同域、正常并簇。
          if (this.noteScope(a) !== this.noteScope(b)
            && !this.releaseCorroborated(a, b, released)
            && !this.releaseCorroborated(b, a, released)) continue;
          parent.set(find(a.id), find(b.id));
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
    // 佐证放行·画像语料：公开 u: 画像（剥私后）本就公开，域条内容高覆盖命中=事实已公开
    const pubCorpus = this.store.people()
      .filter((p) => p.kind === 'person')
      .map((p) => stripPrivateSegments(p.text))
      .join('');
    if (pubCorpus) {
      for (const n of this.store.allNotes()) {
        if (n.absorbedAt || !this.releaseableDomainScope(n)) continue;
        if (corroboratedByText(n.content, pubCorpus)) this.releaseNote(n, released);
      }
    }
    return { clusters: clusterCount, merged: pairs.length, pairs, released };
  }

  /**
   * 可自动放行的域作用域：派生域或域名覆盖均可；
   * private 显式钉到某 sessionId 的（仅本会话）是人工钉死，绝不自动放。
   */
  private releaseableDomainScope(n: MemoryNote): string | undefined {
    const s = this.noteScope(n);
    if (!s || s === 'public') return undefined;
    if (n.private && !this.store.domainNames().has(n.private)) return undefined;
    return s;
  }

  /**
   * 佐证放行（确定性安全）：candidate 为可放域条 ∧ corroborant 公开 →
   * candidate 标 private:'public'。放的是已存在事实的副本，零新信息暴露。
   */
  private releaseCorroborated(candidate: MemoryNote, corroborant: MemoryNote, released: string[]): boolean {
    if (!this.releaseableDomainScope(candidate)) return false;
    const cs = this.noteScope(corroborant);
    if (cs && cs !== 'public') return false;
    this.releaseNote(candidate, released);
    return true;
  }

  private releaseNote(n: MemoryNote, released: string[]): void {
    this.store.updateNote(n.id, { private: 'public' });
    released.push(n.id);
    this.log?.(`佐证放行：「${n.content.slice(0, 24)}」事实已见公开侧，放行至公开池`);
  }

  /**
   * 域内待放行候选（L2 人工队列）：无私密线索词的域条，按重要度排序。
   * 启发式只负责排队降噪，放行决策永远是人（UI 一键 PATCH private:'public'）。
   */
  releaseCandidates(limit = 30): { id: string; kind: MemoryNote['kind']; sessionId: string; content: string; importance: number; scope: string }[] {
    return this.store.allNotes()
      .filter((n) => !n.absorbedAt && n.kind !== 'attitude' && !!this.releaseableDomainScope(n)
        && !PRIVATE_HINT_RE.test(n.content))
      .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt)
      .slice(0, Math.max(1, limit))
      .map((n) => ({ id: n.id, kind: n.kind, sessionId: n.sessionId, content: n.content, importance: n.importance, scope: this.noteScope(n)! }));
  }

  /**
   * 写入判重：全库找与新记忆向量余弦最高的既有记忆，≥dedupeEmbedCos 判为同一事实。
   * draft 带轨道信息——自我轨（attitude/self）只在同 character 内判重，
   * 世界轨跨人设共享判重（同一事实不该按人设各存一条）。
   */
  private findNearDup(
    vec: number[],
    draft: { kind: MemoryNote['kind']; self?: boolean; personaId?: string },
    scope?: string,
  ): { note: MemoryNote; cos: number } | undefined {
    if (this.cfg.dedupeEmbedCos <= 0) return undefined;
    const draftTrack = (draft.kind === 'attitude' || draft.self === true)
      ? `char:${this.characterOf(draft.personaId)}` : undefined;
    let best: MemoryNote | undefined, bc = 0;
    for (const n of this.store.allNotes()) {
      if (!n.embedding?.length) continue;
      if (n.absorbedAt) continue; // 已吸收的存档条不做判重靶——否则新记忆会被强化到不可见的幽灵上
      // 事实与态度不同角色不互判重（态度被事实吸收=心态静默丢失，反之亦然）
      if ((n.kind === 'attitude') !== (draft.kind === 'attitude')) continue;
      // 三轨判重：自我轨仅同 character；世界轨（双方 trackKey 均 undefined）照常
      if (this.trackKeyOf(n) !== draftTrack) continue;
      // 私域边界：生效域不同不互判重——同义事实公私各存一条，私域不进公开条
      if (this.noteScope(n) !== scope) continue;
      const c = vecCosine(vec, n.embedding);
      if (c > bc) { bc = c; best = n; }
    }
    return best && bc >= this.cfg.dedupeEmbedCos ? { note: best, cos: bc } : undefined;
  }

  // ── 脑图页编辑入口 ──

  addNote(sessionId: string, draft: NoteDraft): MemoryNote {
    const now = this.now();
    const stamp = this.emotionStamp(sessionId || GLOBAL_SESSION_ID, now);
    const n = this.store.addNote(sessionId || GLOBAL_SESSION_ID,
      { ...draft, emotion: stamp, strengthBoost: draft.strengthBoost ?? this.emotionBoost(stamp), personaId: draft.personaId ?? this.store.activePersonaId() }, now);
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

  /** 标记/清除会话私域（脑图页/API 入口）；domain 空串=清除回公开 */
  setSessionDomain(sessionId: string, domain: string): void {
    this.store.setSessionDomain(sessionId, domain);
  }

  isPrivateSession(sessionId: string): boolean {
    return this.store.isPrivateSession(sessionId);
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
      personaId: n.personaId,
      /** 自我轨标记（脑图页徽标/过滤用）；attitude 隐含自我轨无需另标 */
      self: typeof n.self === 'boolean' ? n.self : undefined,
      /** 已被语义巩固吸收退池的存档条（可视化区分/验收用） */
      absorbed: !!n.absorbedAt,
      /** 私域手动覆盖；生效域=private ?? 来源会话域（图谱徽标用） */
      private: n.private,
      scope: this.noteScope(n),
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
          // 近重复统计与 sweepNearDups 同口径：跨生效域的对不会被合并，不计入警告数
          if (c >= 0.9 && this.noteScope(n) === this.noteScope(m)) {
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

  /** 检索预览（脑图页"检索模拟器"）；有 embedder 时顺带取向量走语义路径。带会话参数时按该会话私域口径过滤 */
  async preview(sessionId: string | undefined, query: string): Promise<MemoryNote[]> {
    const qv = (await this.queryEmbedding(query)) ?? undefined;
    return this.retriever
      .query(this.store.allNotes().filter((n) =>
        !n.absorbedAt && (!sessionId || this.scopeVisible(n, sessionId))),
        sessionId, query, this.now(), this.store.graphVersion, qv)
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

/** 放行队列的私密线索词（启发式降噪：命中的域条不进候选，放行决策永远是人） */
const PRIVATE_HINT_RE = /恋人|亲密|防护|避孕|射精|体外|安全期|保健药|枕边|吹头发|小余|宝宝|小笨蛋|身体反应|冷落|她还是她|男朋友|女朋友|送裙子|害羞|颈窝|白丝|丝袜|生理期|按腰|洗澡|数着日子|撒娇|半推半就|约会|按摩|被子|起床|旗袍|抱着|语音|夜|睡|床|带饭|做饭|喂/;

/**
 * 文本佐证判定：note 内容归一化（去 actor 前缀与标点）后的 char-bigram
 * 被公开语料覆盖 ≥60% 即「该事实已是公开知识」，可安全放行。
 */
function corroboratedByText(content: string, corpus: string): boolean {
  const norm = (s: string) => s.replace(/^[一-龥A-Za-z0-9_-]{1,12}[：:]\s*/, '').replace(/[\s\p{P}\p{S}]+/gu, '');
  const t = norm(content);
  if (t.length < 6) return false;
  const c = norm(corpus);
  let hit = 0, total = 0;
  for (let i = 0; i + 2 <= t.length; i++, total++) {
    if (c.includes(t.slice(i, i + 2))) hit++;
  }
  return total > 0 && hit / total >= 0.6;
}
