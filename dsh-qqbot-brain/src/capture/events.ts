import type { Brain } from '../brain/index.ts';
import type { PromptInjector } from '../inject/prompt.ts';
import { formatShort } from '../brain/time.ts';
import { DEFAULT_TIME_ZONE } from '../brain/types.ts';

/**
 * 捕获 ctx.on('session/event') 广播的对话事件：
 *   user/message      —— 用户文本入队（兼作检索 query），攒到 turn/end 与回复配对
 *   assistant/message —— 收集本轮回复文本
 *   turn/end          —— 排空的 (user队列,assistant) 入库并触发蒸馏
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

const CURRENT_MSG_MARK = '[Current message]';
const SENDER_TAG_RE = /^\s*\[([^\[\]\n]{1,64}) \(([0-9A-Fa-f-]{8,64})\)\]\s*/;

/**
 * 解析宿主打在群聊消息上的发送者标签 `[昵称 (openid)]`。
 * 群聊整包为 `[Chat history]…[Current message]\n[tag] 正文`（或引用块后直接 tag），
 * 取最后一个 [Current message] 锚点后的首个 tag；无锚点时只认行首 tag（防误吃历史行）。
 * 返回剥离 tag 后的正文与 actor（`昵称 (openid)`），单聊无 tag 时 actor 为空。
 */
export function parseSenderTag(raw: string): { actor?: string; text: string } {
  const idx = raw.lastIndexOf(CURRENT_MSG_MARK);
  const head = idx >= 0 ? raw.slice(0, idx + CURRENT_MSG_MARK.length) : '';
  const tail = idx >= 0 ? raw.slice(idx + CURRENT_MSG_MARK.length) : raw;
  const m = tail.match(SENDER_TAG_RE);
  if (!m) return { text: raw };
  return { actor: `${m[1]} (${m[2]})`, text: head + tail.slice(m[0].length) };
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
  /** 待配对的用户消息队列：turn/end 前排空拼入一轮，避免连发/群聊插话覆盖丢失 */
  private pendingUser = new Map<string, { text: string; actor?: string; at: number }[]>();
  private replyBuf = new Map<string, string[]>();

  private brain: Brain;
  private injector: PromptInjector;
  private log: (msg: string) => void;
  private debug: boolean;
  /** 一轮内多条用户消息逐条时间的渲染时区 */
  private timeZone: string;

  constructor(brain: Brain, injector: PromptInjector, log: (msg: string) => void, debug: boolean, timeZone = DEFAULT_TIME_ZONE) {
    this.brain = brain;
    this.injector = injector;
    this.log = log;
    this.debug = debug;
    this.timeZone = timeZone;
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
        const raw = textOf(ev.data?.message ?? ev.data);
        if (!raw.trim()) return;
        const { actor, text: stripped } = parseSenderTag(raw);
        const text = stripped.trim() ? stripped : raw;
        const q = this.pendingUser.get(sessionId) ?? [];
        q.push({ text, actor, at: Date.now() });
        if (q.length > 8) q.splice(0, q.length - 8);
        this.pendingUser.set(sessionId, q);
        this.injector.noteUserText(sessionId, text, actor);
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
        const pending = this.pendingUser.get(sessionId) ?? [];
        this.pendingUser.set(sessionId, []);
        const replies = this.replyBuf.get(sessionId) ?? [];
        this.replyBuf.set(sessionId, []);
        if (pending.length === 0 || replies.length === 0) return;
        // 一轮内多条消息（连发/插话）逐条嵌 [HH:mm]，保住「每句话是啥时候」；
        // 单条消息不嵌——蒸馏 convo 的轮级时间戳已覆盖。
        const userText = pending.length > 1
          ? pending.map((p) => `[${formatShort(p.at, this.timeZone)}] ${p.text}`).join('\n')
          : pending[0]!.text;
        this.brain.ingest(sessionId, {
          userText,
          assistantText: replies.join('\n'),
          actor: pending[pending.length - 1]!.actor,
          at: pending[0]!.at,
        });
        void this.brain.endOfTurn(sessionId).catch((e: unknown) => {
          this.log(`brain: 蒸馏失败 ${String(e)}`);
        });
        break;
      }
    }
  }
}
