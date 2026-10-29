import type { Brain } from '../brain/index.ts';
import type { PromptInjector } from '../inject/prompt.ts';

/**
 * 捕获 ctx.on('session/event') 广播的对话事件：
 *   user/message      —— 记录最新用户文本（兼作检索 query），暂存待配对
 *   assistant/message —— 收集本轮回复文本
 *   turn/end          —— 配对的 (user,assistant) 入库并触发蒸馏
 * sessionId/agentId 从事件 data 中容错提取（官方出站模块同样依赖该通道）。
 */

interface RawEvent {
  type?: string;
  data?: Record<string, unknown>;
  sessionId?: string;
  agentId?: string;
  [k: string]: unknown;
}

/** session/event 回调第一个参数：会话对象（官方 outbound.route 签名为 (session, raw)） */
interface SessionLike {
  header?: { id?: string; [k: string]: unknown };
  id?: string;
  agentId?: string;
  [k: string]: unknown;
}

function textOf(message: unknown): string {
  if (typeof message === 'string') return message;
  const m = message as { content?: unknown; text?: string } | undefined;
  if (!m) return '';
  if (typeof m.text === 'string') return m.text;
  const c = m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => (typeof p === 'string' ? p : (p as { text?: string })?.text ?? ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function sessionIdOf(session: SessionLike | undefined, e: RawEvent): string | undefined {
  const d = e.data ?? {};
  return (
    (typeof session?.header?.id === 'string' && session.header.id) ||
    (typeof session?.id === 'string' && session.id) ||
    (typeof e.sessionId === 'string' && e.sessionId) ||
    (typeof d.sessionId === 'string' && d.sessionId) ||
    (typeof (d.session as { id?: string })?.id === 'string' && (d.session as { id: string }).id) ||
    undefined
  );
}

export class SessionCapture {
  private pendingUser = new Map<string, { text: string; at: number }>();
  private replyBuf = new Map<string, string[]>();

  private brain: Brain;
  private injector: PromptInjector;
  private log: (msg: string) => void;
  private debug: boolean;

  constructor(brain: Brain, injector: PromptInjector, log: (msg: string) => void, debug: boolean) {
    this.brain = brain;
    this.injector = injector;
    this.log = log;
    this.debug = debug;
  }

  register(ctx: unknown): void {
    (ctx as { on(e: 'session/event', h: (session: SessionLike, ev: RawEvent) => void): void })
      .on('session/event', (session: SessionLike, ev: RawEvent) => this.onEvent(session, ev));
  }

  private onEvent(session: SessionLike, ev: RawEvent): void {
    const sessionId = sessionIdOf(session, ev);
    if (!sessionId) return;

    // 记录 agent↔session 映射供 prompt 注入解析
    const agentId =
      (typeof session?.agentId === 'string' && session.agentId) ||
      (typeof ev.agentId === 'string' && ev.agentId) ||
      (typeof ev.data?.agentId === 'string' && (ev.data.agentId as string)) ||
      (typeof (ev.data?.agent as { id?: string })?.id === 'string' &&
        (ev.data!.agent as { id: string }).id) ||
      undefined;
    if (agentId) this.injector.noteAgentSession(agentId, sessionId);

    switch (ev.type) {
      case 'user/message': {
        const text = textOf(ev.data?.message ?? ev.data);
        if (!text.trim()) return;
        this.pendingUser.set(sessionId, { text, at: Date.now() });
        this.injector.noteUserText(sessionId, text);
        break;
      }
      case 'assistant/message': {
        const text = textOf(ev.data?.message ?? ev.data);
        if (!text.trim()) return;
        const buf = this.replyBuf.get(sessionId) ?? [];
        buf.push(text);
        this.replyBuf.set(sessionId, buf);
        break;
      }
      case 'turn/end': {
        const user = this.pendingUser.get(sessionId);
        const replies = this.replyBuf.get(sessionId) ?? [];
        this.replyBuf.set(sessionId, []);
        if (!user || replies.length === 0) return;
        this.brain.ingest(sessionId, {
          userText: user.text,
          assistantText: replies.join('\n'),
          at: user.at,
        });
        void this.brain.endOfTurn(sessionId).catch((e: unknown) => {
          if (this.debug) this.log(`brain: 蒸馏失败 ${String(e)}`);
        });
        break;
      }
    }
  }
}
