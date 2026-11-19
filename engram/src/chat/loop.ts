/**
 * chat loop：单轮管线（design.md §4）。
 *
 *   assemble → prompt → llm.chat（可选 tool loop ≤2 轮）→ history
 *   → ingest(Turn via:'user') → endOfTurn（后台蒸馏）→ fired intents → proactive
 *
 * 失败语义：LLM 失败返回降级文案且**不写 assistant Turn**——用户消息仍进
 * history（真实发生），但不进 brain ingest，不污染记忆。
 */

import type { Brain, BrainContext, IntentEntry } from '../brain.ts';
import type { ChatLlm, ChatMessage, ChatResult, ChatUsage, ToolDef } from './llm.ts';
import type { ChatHistory } from './history.ts';
import type { EngramConfig } from '../config.ts';
import { buildSystemPrompt } from './prompt.ts';
import { BRAIN_SEARCH_TOOL, execBrainSearch } from './tools.ts';
import type { ProactiveService } from './proactive.ts';

export interface ChatReply {
  reply: string;
  usage?: ChatUsage;
  hits: number;
  degraded: boolean;
}

/** LLM 失败时的降级文案（流萤腔，不暴露系统错误） */
const DEGRADED_REPLY = '诶…我这边好像卡了一下，你再说一遍好不好？';

const TOOL_MAX_ROUNDS = 2;

export class ChatLoop {
  private brain: Brain;
  private llm: ChatLlm;
  private history: ChatHistory;
  private cfg: EngramConfig;
  private log: (msg: string) => void;
  private proactive?: ProactiveService;
  /** 同 query 复用查询向量（省重复 embedding 调用，抄 PromptInjector.embedForSession） */
  private queryVecCache = new Map<string, { query: string; vec: number[] | null }>();
  /** 串行化：Turn 配对假设 user/assistant 顺序，防并发交错污染 */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    brain: Brain,
    llm: ChatLlm,
    history: ChatHistory,
    cfg: EngramConfig,
    log: (msg: string) => void,
    proactive?: ProactiveService,
  ) {
    this.brain = brain;
    this.llm = llm;
    this.history = history;
    this.cfg = cfg;
    this.log = log;
    this.proactive = proactive;
  }

  /** 串行入口：所有 handleUserMessage 按到达顺序排队执行 */
  handleUserMessage(text: string): Promise<ChatReply> {
    const run = this.chain.then(() => this.run(text));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async queryVecFor(sessionId: string, query: string): Promise<number[] | undefined> {
    const cached = this.queryVecCache.get(sessionId);
    if (cached?.query === query) return cached.vec ?? undefined;
    try {
      const vec = await this.brain.queryEmbedding(query);
      this.queryVecCache.set(sessionId, { query, vec });
      return vec ?? undefined;
    } catch {
      this.queryVecCache.set(sessionId, { query, vec: null });
      return undefined;
    }
  }

  private async run(text: string): Promise<ChatReply> {
    const sid = this.cfg.sessionId;
    const trimmed = text.trim();
    if (!trimmed) return { reply: '', usage: undefined, hits: 0, degraded: false };

    // 1. 用户消息先进 history（真实发生的对话记录）
    this.history.append('user', trimmed, { via: 'user' });

    // 2. assemble（query 向量与检索并行友好：先发 embedding 请求再组装）
    const vecP = this.queryVecFor(sid, trimmed);
    const queryVec = await vecP;
    let ctx: BrainContext;
    try {
      ctx = this.brain.assemble(sid, trimmed, { nick: this.cfg.userNick }, queryVec);
    } catch (e) {
      this.log(`assemble 失败，降级裸聊：${String(e)}`);
      ctx = {
        persona: '', emotion: '', digest: '', clock: '',
        memoryLines: [], attitudeLines: [], deepRecallLines: [], hits: [],
      };
    }

    // 3. messages = system + history（含刚 append 的 user 消息）
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(ctx, this.cfg) },
      ...this.history.toMessages(),
    ];

    // 4. llm.chat + tool loop（≤2 轮；tools 默认关）
    const tools = this.cfg.tools.brainSearch ? [BRAIN_SEARCH_TOOL] : undefined;
    let result: ChatResult | undefined;
    let rounds = 0;
    while (true) {
      result = await this.llm.chat(messages, tools ? { tools } : undefined);
      if (!result) break;
      const calls = result.toolCalls;
      if (!calls?.length || !tools || rounds >= TOOL_MAX_ROUNDS) break;
      rounds++;
      // 回写 assistant tool_calls + 逐个执行 tool → tool 消息回注
      messages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: calls,
      });
      for (const call of calls) {
        if (call.function.name !== 'brain_search') {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: `未知工具 ${call.function.name}`,
          });
          continue;
        }
        let query = '';
        try { query = String(JSON.parse(call.function.arguments).query ?? ''); } catch { /* 坏 JSON 当空查 */ }
        const r = await execBrainSearch(this.brain, sid, query);
        this.log(`brain_search：${query.slice(0, 30)} → ${r.hits} 条`);
        messages.push({ role: 'tool', tool_call_id: call.id, name: 'brain_search', content: r.content });
      }
    }

    // 5. 失败降级：不写 assistant history、不 ingest（不污染记忆）
    if (!result?.content) {
      this.log(`chat LLM 失败/空回复（session=${sid}）`);
      return { reply: DEGRADED_REPLY, usage: undefined, hits: ctx.hits.length, degraded: true };
    }

    const reply = result.content;
    this.history.append('assistant', reply, { usage: result.usage, via: 'user' });

    // 6. brain ingest + endOfTurn（Turn 配对是记忆原料；endOfTurn 后台蒸馏）
    try {
      const fired = this.brain.ingest(sid, {
        userText: trimmed,
        assistantText: reply,
        actor: this.cfg.userNick,
        at: Date.now(),
        via: 'user',
      });
      void this.brain.endOfTurn(sid);
      // 7. fired intents → proactive（异步，不阻塞回复）
      if (fired.length && this.proactive) this.proactive.consume(fired);
    } catch (e) {
      this.log(`ingest/endOfTurn 失败（回复已正常返回）：${String(e)}`);
    }

    return { reply, usage: result.usage, hits: ctx.hits.length, degraded: false };
  }
}
