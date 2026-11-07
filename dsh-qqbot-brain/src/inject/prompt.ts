import type { Brain } from '../brain/index.ts';
import { splitActor } from '../brain/identity.ts';
import type { BrainPluginConfig } from '../config.ts';

/**
 * 通过 system-prompt/assemble waterfall 注入七块 section，按稳定性分两段：
 *   brain:persona (order 80)    人格内核 · 最稳定锚点
 *   brain:digest  (order 81)    会话脉络 · 每 15 轮才变
 *   brain:speaker (order 10300) 当前发言人（群聊）
 *   brain:attitude(order 10310) 态度立场（对人/事/话题的当前看法，慢变量）
 *   brain:memory  (order 10320) top-k 记忆摘录（含 [跨群] 召回与画像行）
 *   brain:emotion (order 10330) 情绪态一行
 *   brain:clock   (order 10340) 当前时刻（每轮必变）
 * 官方 sections 段位：identity -1000 → persona-prefix 0 → policies 500-900 →
 * tools 1000-3100 → … → persona-suffix 10200（dsh-system-prompt SECTION_ORDERS）。
 * DeepSeek 前缀缓存只认「从第 0 token 起的相同前缀」，断在第一个变动 section——
 * 故稳定段留在 80/81，易变段整体移到 >10200 的 prompt 尾部：
 * 保住 tools/policies 数千 token 的缓存命中，关键信息贴消息端也符合 U 型注意力。
 *
 * agent→sessionId 解析：优先读 context.agent 的 session 信息；
 * 拿不到时回退到 SessionCapture 维护的 agentId→sessionId 映射。
 */

interface AssembleContext {
  agent?: { id?: string; session?: { id?: string } | string; sessionId?: string };
  sessionId?: string;
}

interface AssembledPrompt {
  sections?: Array<{ name: string; order: number; text: string }>;
  [k: string]: unknown;
}

type AssembleHandler = (
  assembly: unknown,
  context: AssembleContext,
  next: () => Promise<AssembledPrompt>,
) => Promise<AssembledPrompt>;

export class PromptInjector {
  /** agentId → sessionId（由事件流喂入） */
  private agentSession = new Map<string, string>();
  /** sessionId → 最近一条用户消息（检索 query） */
  private lastUserText = new Map<string, string>();
  /** sessionId → 最近一条消息的发言人（群聊 `[昵称 (openid)]`，单聊无） */
  private lastActor = new Map<string, string>();
  /** sessionId → 上次检索 query 与查询向量（同 query 复用，省重复 embedding 调用） */
  private queryVecCache = new Map<string, { query: string; vec: number[] | null }>();

  private brain: Brain;
  private config: BrainPluginConfig;
  private log: (msg: string) => void;

  constructor(brain: Brain, config: BrainPluginConfig, log: (msg: string) => void) {
    this.brain = brain;
    this.config = config;
    this.log = log;
  }

  noteAgentSession(agentId: string, sessionId: string): void {
    this.agentSession.set(agentId, sessionId);
  }

  noteUserText(sessionId: string, text: string, actor?: string): void {
    this.lastUserText.set(sessionId, text);
    if (actor) this.lastActor.set(sessionId, actor);
  }

  private resolveSessionId(context: AssembleContext): string | undefined {
    if (context.sessionId) return context.sessionId;
    const a = context.agent;
    if (!a) return undefined;
    if (a.sessionId) return a.sessionId;
    const sess = a.session;
    if (typeof sess === 'string') return sess;
    if (sess?.id) return sess.id;
    if (a.id) return this.agentSession.get(a.id);
    return undefined;
  }

  /** 查询向量：同 query 复用缓存（宿主重试/复读不再重复调）；失败回退 lexical */
  private embedForSession(sessionId: string, query: string): Promise<number[] | undefined> {
    const cached = this.queryVecCache.get(sessionId);
    if (cached?.query === query) return Promise.resolve(cached.vec ?? undefined);
    return this.brain.queryEmbedding(query).then((v) => {
      this.queryVecCache.set(sessionId, { query, vec: v });
      return v ?? undefined;
    }).catch(() => undefined);
  }

  register(ctx: unknown): void {
    const handler: AssembleHandler = async (_assembly, context, next) => {
      // 先解析会话并提前发取向量请求：与宿主装配并行，emb ~0.3s 不再串行阻塞
      const sessionId = this.resolveSessionId(context);
      const vecP = sessionId
        ? this.embedForSession(sessionId, this.lastUserText.get(sessionId) ?? '')
        : Promise.resolve(undefined);
      const assembled = await next();
      if (!sessionId) return assembled;

      const query = this.lastUserText.get(sessionId) ?? '';
      const actor = this.lastActor.get(sessionId);
      // 私聊绑定：sess 画像卡 name 作发言人（assemble 内另有同名回退，此处取来驱动 speaker section）
      const boundNick = actor ? '' : this.brain.boundSpeakerNick(sessionId);
      const queryVec = await vecP;
      // actor 形如「昵称 (openid)」（昵称本身可能含括号），拆出昵称与 openid 供画像/态度按人取
      const brain = this.brain.assemble(
        sessionId, query,
        actor ? splitActor(actor) : (boundNick ? { nick: boundNick } : undefined),
        queryVec,
      );

      const sections = [...(assembled.sections ?? [])];
      if (this.config.injectPersona && brain.persona) {
        sections.push({ name: 'brain:persona', order: 80, text: `【人格内核】${brain.persona}` });
      }
      if (this.config.injectDigest && brain.digest) {
        sections.push({ name: 'brain:digest', order: 81, text: `【会话脉络】${brain.digest}` });
      }
      if (this.config.injectSpeaker && (actor || boundNick)) {
        sections.push({ name: 'brain:speaker', order: 10300, text: `【当前发言人】${actor || boundNick}` });
      }
      if (this.config.injectAttitude && brain.attitudeLines.length) {
        sections.push({
          name: 'brain:attitude',
          order: 10310,
          text: `【当前立场】\n${brain.attitudeLines.join('\n')}`,
        });
      }
      if (this.config.injectMemory && brain.memoryLines.length) {
        sections.push({
          name: 'brain:memory',
          order: 10320,
          text: `【记忆库摘录】\n${brain.memoryLines.join('\n')}`,
        });
      }
      if (this.config.injectEmotion && brain.emotion) {
        sections.push({ name: 'brain:emotion', order: 10330, text: `【情绪态】${brain.emotion}` });
      }
      if (this.config.injectClock && brain.clock) {
        sections.push({ name: 'brain:clock', order: 10340, text: `【当前时刻】${brain.clock}` });
      }
      if (this.config.debug && brain.hits.length) {
        this.log(`brain: 命中 ${brain.hits.length} 条记忆 (session=${sessionId.slice(0, 8)}…)`);
      }
      return { ...assembled, sections };
    };
    (ctx as { on(e: 'system-prompt/assemble', h: AssembleHandler): void })
      .on('system-prompt/assemble', handler);
  }
}
