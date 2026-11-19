/**
 * 对话历史：chat-log.jsonl 追加写 + 有界内存视图。
 *
 * 成本一线（design.md §4）：toMessages() 输出受 maxTurns/maxChars 双重约束，
 * 超限截头保尾——陪伴长跑不发散。文件追加写失败静默（历史是便利不是关键路径，
 * 关键记忆在 brain store）。
 */

import { appendFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ChatUsage } from './llm.ts';
import type { HistoryConfig } from '../config.ts';

export type HistoryRole = 'user' | 'assistant' | 'proactive' | 'system';

export interface HistoryEntry {
  id: string;
  role: HistoryRole;
  text: string;
  at: number;
  /** 该条 assistant 回复的 token 用量（成本透出） */
  usage?: ChatUsage;
  /** 来源戳：user=用户 / agent=主动开口（proactive 的镜像，审计用） */
  via?: 'user' | 'agent';
}

interface WireEntry extends Omit<HistoryEntry, 'id'> {
  id?: string;
}

const FILE_MAX = 4 * 1024 * 1024; // 4MB 触发截尾重写（保最后 ~2000 行）

export class ChatHistory {
  private entries: HistoryEntry[] = [];
  private file: string;
  private cfg: HistoryConfig;
  private log: (msg: string) => void;

  constructor(dataDir: string, cfg: HistoryConfig, log: (msg: string) => void) {
    this.file = join(dataDir, 'chat-log.jsonl');
    this.cfg = cfg;
    this.log = log;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const lines = readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const e = JSON.parse(line) as WireEntry;
          if (typeof e.text !== 'string' || !e.text.trim()) continue;
          if (e.role !== 'user' && e.role !== 'assistant' && e.role !== 'proactive' && e.role !== 'system') continue;
          this.entries.push({
            id: e.id ?? randomUUID(),
            role: e.role,
            text: e.text,
            at: typeof e.at === 'number' ? e.at : Date.now(),
            usage: e.usage,
            via: e.via,
          });
        } catch { /* 单行坏数据跳过，不污染整份历史 */ }
      }
      // 内存只留尾部 maxTurns*2（文件可更长，内存有界）
      const cap = Math.max(this.cfg.maxTurns * 2, 10);
      if (this.entries.length > cap) this.entries = this.entries.slice(-cap);
      // 文件超限截尾重写：防 chat-log 无限增长
      try {
        if (statSync(this.file).size > FILE_MAX && this.entries.length > 200) {
          const keep = this.entries.slice(-200);
          const tmp = this.file + '.tmp';
          writeFileSync(tmp, keep.map((e) => JSON.stringify(e)).join('\n') + '\n');
          renameSync(tmp, this.file);
        }
      } catch { /* 截尾失败无所谓，下轮再试 */ }
    } catch (e) {
      this.log(`chat 历史加载失败：${String(e)}`);
    }
  }

  append(role: HistoryRole, text: string, opts?: { usage?: ChatUsage; via?: 'user' | 'agent' }): HistoryEntry {
    const entry: HistoryEntry = {
      id: randomUUID(),
      role,
      text,
      at: Date.now(),
      usage: opts?.usage,
      via: opts?.via,
    };
    this.entries.push(entry);
    const cap = Math.max(this.cfg.maxTurns * 2, 10);
    if (this.entries.length > cap) this.entries.splice(0, this.entries.length - cap);
    try {
      appendFileSync(this.file, JSON.stringify(entry) + '\n');
    } catch (e) {
      this.log(`chat 历史写入失败：${String(e)}`);
    }
    return entry;
  }

  /** 最近 n 条（新→旧返回逆序？不——返回时间正序，调用方自行处理） */
  recent(n = 50): HistoryEntry[] {
    return this.entries.slice(-n);
  }

  /**
   * LLM 上下文视图：proactive/system 归并为 assistant/system 角色，
   * user/assistant 保持原样；受 maxTurns/maxChars 双重约束截头保尾。
   */
  toMessages(): { role: 'user' | 'assistant' | 'system'; content: string }[] {
    let slice = this.entries.slice(-this.cfg.maxTurns);
    // 字符预算：从头截直到总长达标（保留最近的尾部）
    let total = slice.reduce((s, e) => s + e.text.length, 0);
    while (slice.length > 2 && total > this.cfg.maxChars) {
      total -= slice[0]!.text.length;
      slice = slice.slice(1);
    }
    return slice.map((e) => ({
      role: e.role === 'user' ? 'user' : e.role === 'system' ? 'system' : 'assistant',
      content: e.text,
    }));
  }

  /** 今日 proactive 条数（同一自然日，cfg.timeZone 口径——由调用方传入日期键） */
  countProactiveSince(sinceMs: number): number {
    return this.entries.filter((e) => e.role === 'proactive' && e.at >= sinceMs).length;
  }

  /** 最近一条 proactive 时间（minInterval 判定用） */
  lastProactiveAt(): number | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]!.role === 'proactive') return this.entries[i]!.at;
    }
    return undefined;
  }
}

