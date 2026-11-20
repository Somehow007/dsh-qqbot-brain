/**
 * 主动开口（slice2，design.md §7）：消费 ingest/tickIntents 的 fired intents，
 * 经 shell 预算闸门后生成并投递消息。
 *
 * 关键约束：
 * - provenance：主动消息以 via:'agent' 的 Turn ingest——event intent 不误触发、
 *   纯 agent 批次蒸馏自动跳过、boundSpeaker 不补发言人（内核侧已保证）。
 * - 预算闸门在 shell 侧：maxPerDay / quietHours / minInterval 全部可配；
 *   超限不丢——进 deferred 队列（持久化），下个 tick 预算恢复后补发。
 * - 重启语义：intent 状态内核持久化；离线到期的 time intent 重启会集中
 *   补触发 → consume 入口按 restartCatchupHours 截断（只收最近 N 小时内
 *   lastFiredAt 的 fired），更早的记 skipped+log。
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Brain, IntentEntry, Turn } from '../brain.ts';
import type { ChatHistory, HistoryEntry } from './history.ts';
import type { ChatLlm, ChatMessage } from './llm.ts';
import { buildProactivePrompt } from './prompt.ts';
import type { ProactiveConfig, EngramConfig } from '../config.ts';

interface ProactiveState {
  /** 'YYYY-MM-DD'（cfg.timeZone 口径）→ 当日已发主动消息数 */
  dayKey: string;
  dayCount: number;
  lastSentAt?: number;
  /** 延迟队列：预算超限时暂存的 fired intent（带入队时间，TTL 过期丢弃） */
  deferred: { intent: IntentEntry; enqueuedAt: number }[];
}

export class ProactiveService {
  private brain: Brain;
  private llm: ChatLlm;
  private history: ChatHistory;
  private cfg: EngramConfig;
  private pcfg: ProactiveConfig;
  private log: (msg: string) => void;
  private stateFile: string;
  private state: ProactiveState;
  private sending = false;
  /** 投递后回调（main.ts 桥到 web.broadcast 做 SSE 推送） */
  private onDeliver?: (entry: HistoryEntry) => void;

  constructor(
    brain: Brain,
    llm: ChatLlm,
    history: ChatHistory,
    cfg: EngramConfig,
    log: (msg: string) => void,
    onDeliver?: (entry: HistoryEntry) => void,
  ) {
    this.brain = brain;
    this.llm = llm;
    this.history = history;
    this.cfg = cfg;
    this.pcfg = cfg.proactive;
    this.log = log;
    this.stateFile = join(cfg.dataDir, 'proactive-state.json');
    this.state = this.loadState();
    this.onDeliver = onDeliver;
  }

  get enabled(): boolean {
    return this.pcfg.enabled && this.llm.enabled;
  }

  private loadState(): ProactiveState {
    if (existsSync(this.stateFile)) {
      try {
        const s = JSON.parse(readFileSync(this.stateFile, 'utf8')) as ProactiveState;
        return {
          dayKey: typeof s.dayKey === 'string' ? s.dayKey : '',
          dayCount: typeof s.dayCount === 'number' ? s.dayCount : 0,
          lastSentAt: typeof s.lastSentAt === 'number' ? s.lastSentAt : undefined,
          deferred: Array.isArray(s.deferred) ? s.deferred : [],
        };
      } catch { /* 坏档按空状态重建 */ }
    }
    return { dayKey: '', dayCount: 0, deferred: [] };
  }

  private saveState(): void {
    try {
      const tmp = this.stateFile + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.state));
      renameSync(tmp, this.stateFile);
    } catch (e) {
      this.log(`proactive 状态写入失败：${String(e)}`);
    }
  }

  /** cfg.timeZone 口径的 'HH:mm' 与 'YYYY-MM-DD' */
  private tzParts(now: number): { hhmm: string; day: string } {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.cfg.timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return { hhmm: `${get('hour')}:${get('minute')}`, day: `${get('year')}-${get('month')}-${get('day')}` };
  }

  private inQuietHours(now: number): boolean {
    const { hhmm } = this.tzParts(now);
    const [sh, sm] = this.pcfg.quietStart.split(':').map(Number);
    const [eh, em] = this.pcfg.quietEnd.split(':').map(Number);
    const cur = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) ;
    const start = (sh || 0) * 60 + (sm || 0);
    const end = (eh || 0) * 60 + (em || 0);
    // 跨零点区间（23:00-08:00）
    if (start > end) return cur >= start || cur < end;
    return cur >= start && cur < end;
  }

  private rollDayIfNeeded(now: number): void {
    const { day } = this.tzParts(now);
    if (this.state.dayKey !== day) {
      this.state.dayKey = day;
      this.state.dayCount = 0;
    }
  }

  /**
   * 预算闸门：返回允许发送的剩余额度说明；不通过返回原因。
   * 顺序：enabled → quietHours → minInterval → maxPerDay。
   */
  private gate(now: number): { ok: boolean; reason?: string } {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    if (this.inQuietHours(now)) return { ok: false, reason: 'quiet-hours' };
    this.rollDayIfNeeded(now);
    if (this.state.lastSentAt != null
      && now - this.state.lastSentAt < this.pcfg.minIntervalMinutes * 60_000) {
      return { ok: false, reason: 'min-interval' };
    }
    if (this.state.dayCount >= this.pcfg.maxPerDay) return { ok: false, reason: 'max-per-day' };
    return { ok: true };
  }

  /**
   * 消费 fired intents（ingest 返回值 / tickIntents 定时器共用入口）。
   * 同步入口、异步发送——不阻塞回复路径。重启补发按 lastFiredAt 截断。
   */
  consume(fired: IntentEntry[]): void {
    if (!this.enabled || !fired.length) return;
    const now = Date.now();
    const cutoff = now - this.pcfg.restartCatchupHours * 3_600_000;
    for (const it of fired) {
      // 离线久到的补触发不追发（intent 已 fired，丢的是「时机」不是「内容」）
      if (it.lastFiredAt != null && it.lastFiredAt < cutoff) {
        this.log(`proactive 跳过超窗 intent：${it.id.slice(0, 8)}…（${it.text.slice(0, 30)}）`);
        continue;
      }
      this.enqueue(it);
    }
    void this.flush();
  }

  /** 每 60s tick 兜底：tickIntents 的 fired + deferred 队列重试 */
  onTick(fired: IntentEntry[]): void {
    this.consume(fired);
    // deferred 重试：预算可能已恢复（跨了静默时段/过了零点）
    this.pruneDeferred();
    void this.flush();
  }

  private enqueue(intent: IntentEntry): void {
    const dup = this.state.deferred.some((d) => d.intent.id === intent.id);
    if (dup) return;
    this.state.deferred.push({ intent, enqueuedAt: Date.now() });
    if (this.state.deferred.length > this.pcfg.queueMax) {
      const dropped = this.state.deferred.shift();
      this.log(`proactive 队列满，丢弃最旧：${dropped?.intent.id.slice(0, 8)}…`);
    }
    this.saveState();
  }

  private pruneDeferred(): void {
    const ttl = this.pcfg.queueTtlHours * 3_600_000;
    const before = this.state.deferred.length;
    this.state.deferred = this.state.deferred.filter((d) => Date.now() - d.enqueuedAt < ttl);
    if (this.state.deferred.length !== before) this.saveState();
  }

  /** 串行发送：同时只发一条（防并发抢预算/乱序） */
  private async flush(): Promise<void> {
    if (this.sending || !this.state.deferred.length) return;
    this.sending = true;
    try {
      while (this.state.deferred.length) {
        const g = this.gate(Date.now());
        if (!g.ok) return; // 等下个窗口
        const next = this.state.deferred[0]!;
        const text = await this.generate(next.intent);
        if (!text) {
          // 生成失败：弹出但不计预算（避免坏 intent 堵队列；记 log 可查）
          this.state.deferred.shift();
          this.saveState();
          this.log(`proactive 生成失败：${next.intent.id.slice(0, 8)}…`);
          continue;
        }
        this.deliver(text);
        this.state.deferred.shift();
        this.saveState();
      }
    } finally {
      this.sending = false;
    }
  }

  /** 轻量生成：人设+意图语义+情绪+时刻，不带全量历史（成本一线） */
  private async generate(intent: IntentEntry): Promise<string | undefined> {
    const brain = this.brain;
    const sid = this.cfg.sessionId;
    const emotion = brain.emotionOf(sid);
    // persona() 是人格内核文本（assemble 同口径）；emotionOf 返回 EmotionState
    // ——情绪行文本用 assemble 同款描述？emotionOf 给 state，转一行描述：
    const emotionLine = emotion ? `${emotion.label}` : '';
    const ctx = brain.assemble(sid, intent.text, { nick: this.cfg.userNick });
    const system = buildProactivePrompt(ctx.persona, intent.text, emotionLine || ctx.emotion, ctx.clock);
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: '（此刻请主动说一句）' },
    ];
    const r = await this.llm.chat(messages, { maxTokens: 300, temperature: 0.9 });
    return r?.content?.trim() || undefined;
  }

  /** 投递：history 记录 + brain ingest via:'agent'（provenance 关键一步） */
  private deliver(text: string): void {
    const entry = this.history.append('proactive', text, { via: 'agent' });
    this.onDeliver?.(entry);
    const turn: Turn = {
      userText: '',
      assistantText: text,
      at: Date.now(),
      via: 'agent',
    };
    this.brain.ingest(this.cfg.sessionId, turn);
    void this.brain.endOfTurn(this.cfg.sessionId);
    this.state.dayCount++;
    this.state.lastSentAt = Date.now();
    this.saveState();
    this.log(`proactive 已发送：${text.slice(0, 40)}`);
  }
}
