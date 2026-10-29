import type { Brain } from '../brain/index.ts';
import type { BrainPluginConfig } from '../config.ts';

/**
 * 通过 system-prompt/assemble waterfall 注入五块 section：
 *   brain:persona (order 80) 人格内核 · 最稳定锚点
 *   brain:emotion (order 82) 情绪态一行
 *   brain:attitude(order 83) 态度立场（对人/事/话题的当前看法，慢变量）
 *   brain:memory  (order 84) top-k 记忆摘录
 *   brain:speaker (order 86) 当前发言人（群聊）
 * 官方 qqbot:scope-prompt 为 order 90，我们的内核更早、更难被稀释。
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

  register(ctx: unknown): void {
    const handler: AssembleHandler = async (_assembly, context, next) => {
      const assembled = await next();
      const sessionId = this.resolveSessionId(context);
      if (!sessionId) return assembled;

      const query = this.lastUserText.get(sessionId) ?? '';
      const actor = this.lastActor.get(sessionId);
      // actor 形如「昵称 (openid)」（昵称本身可能含括号），取最后 openid 组前的昵称部分
      const nick = actor?.replace(/\s*\([0-9A-Fa-f-]{8,64}\)\s*$/, '');
      const brain = this.brain.assemble(sessionId, query, nick);

      const sections = [...(assembled.sections ?? [])];
      if (this.config.injectPersona && brain.persona) {
        sections.push({ name: 'brain:persona', order: 80, text: `【人格内核】${brain.persona}` });
      }
      if (this.config.injectEmotion && brain.emotion) {
        sections.push({ name: 'brain:emotion', order: 82, text: `【情绪态】${brain.emotion}` });
      }
      if (this.config.injectAttitude && brain.attitudeLines.length) {
        sections.push({
          name: 'brain:attitude',
          order: 83,
          text: `【当前立场】\n${brain.attitudeLines.join('\n')}`,
        });
      }
      if (this.config.injectMemory && brain.memoryLines.length) {
        sections.push({
          name: 'brain:memory',
          order: 84,
          text: `【记忆库摘录】\n${brain.memoryLines.join('\n')}`,
        });
      }
      if (this.config.injectSpeaker && actor) {
        sections.push({ name: 'brain:speaker', order: 86, text: `【当前发言人】${actor}` });
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
