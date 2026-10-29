import { DAY_MS } from './types.ts';
import type { MemoryNote } from './types.ts';

/**
 * 艾宾浩斯式保持率：R = e^(-t/S)
 * t = 距上次形成/唤起的天数；S = strength（天）。
 * 被检索命中时 strength 增加 → 下次衰减变慢（"用进废退"）。
 */
export function retention(note: MemoryNote, now: number): number {
  const days = Math.max(0, (now - note.lastAccessAt) / DAY_MS);
  return Math.exp(-days / Math.max(note.strength, 0.5));
}

/** 距形成天数（展示用） */
export function ageInDays(note: MemoryNote, now: number): number {
  return Math.max(0, (now - note.createdAt) / DAY_MS);
}
