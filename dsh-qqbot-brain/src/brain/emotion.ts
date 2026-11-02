import type { BrainConfig, EmotionState } from './types.ts';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const NEUTRAL_EMOTION: EmotionState = {
  v: 0, a: 0.3, d: 0, label: '平静', mood: '平静', updatedAt: 0,
};

/**
 * 独立情绪插件：PAD 状态，与对话解耦，随时间向中性回归。
 * 蒸馏模块每轮给出增量与 label；本类负责钳制与衰减。
 */
export class EmotionEngine {
  private states = new Map<string, EmotionState>();
  private cfg: BrainConfig;

  constructor(cfg: BrainConfig) {
    this.cfg = cfg;
  }

  get(sessionId: string, now: number): EmotionState {
    const s = this.states.get(sessionId) ?? { ...NEUTRAL_EMOTION, updatedAt: now };
    const days = (now - s.updatedAt) / 86_400_000;
    if (days <= 0) return s;
    // 向中性回归：v,d → 0；a → 0.3 基线
    const k = Math.exp(-this.cfg.emotionDecayPerDay * days);
    return {
      v: s.v * k,
      a: 0.3 + (s.a - 0.3) * k,
      d: s.d * k,
      label: days > 1 ? '平静' : s.label,
      mood: days > 1 ? '平静' : s.mood,
      updatedAt: now,
    };
  }

  /** 应用蒸馏给出的情绪增量（值域由增量语义直接覆盖 v/a/d） */
  apply(sessionId: string, e: { label: string; v: number; a: number; d: number; mood?: string }, now: number): EmotionState {
    const next: EmotionState = {
      v: clamp(e.v, -1, 1),
      a: clamp(e.a, 0, 1),
      d: clamp(e.d, -1, 1),
      label: e.label.slice(0, 24),
      mood: e.mood,
      updatedAt: now,
    };
    this.states.set(sessionId, next);
    return next;
  }

  /** 持久化恢复 */
  load(sessionId: string, s: EmotionState): void {
    this.states.set(sessionId, s);
  }

  /** 全局视图用：最近更新过的那个会话的情绪（仍按时间衰减）；无记录时 undefined */
  latest(now: number): { sessionId: string; state: EmotionState } | undefined {
    let sid: string | undefined;
    let best = -1;
    for (const [k, s] of this.states) {
      if (s.updatedAt > best) { best = s.updatedAt; sid = k; }
    }
    return sid ? { sessionId: sid, state: this.get(sid, now) } : undefined;
  }

  describe(sessionId: string, now: number): string {
    const s = this.get(sessionId, now);
    // 平静态（≈中性基线 v=0/a=0.3/d=0）不渲染：这行注入无信息量，省 ~20 tok/轮
    if (Math.abs(s.v) < 0.1 && Math.abs(s.d) < 0.1 && Math.abs(s.a - 0.3) < 0.1) return '';
    return `当前情绪：${s.label}（v=${s.v.toFixed(1)} a=${s.a.toFixed(1)} d=${s.d.toFixed(1)}）`;
  }
}
