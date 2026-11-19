/**
 * BrainContext → system prompt（移植自插件 inject/prompt.ts 的九段逻辑，去 Cordis 化）。
 *
 * 前缀缓存友好排序（design.md §5）：稳定段在前——人格内核/脉络/表达口径；
 * 易变段贴尾——发言人/立场/记忆/深挖/情绪/时刻。DeepSeek 前缀缓存只认
 * 「从第 0 token 起的相同前缀」，断在第一个变动 section。
 */

import type { BrainContext } from '../brain.ts';
import { ENGRAM_CHANNEL_STYLE, type EngramConfig } from '../config.ts';

/** 空段不产出（与插件 sections.push 条件一致：空数组/空串跳过） */
function block(title: string, lines: string[] | string): string[] {
  if (Array.isArray(lines)) {
    const t = lines.filter((s) => s.trim()).join('\n');
    return t ? [`【${title}】\n${t}`] : [];
  }
  const t = lines.trim();
  return t ? [`【${title}】\n${t}`] : [];
}

export function buildSystemPrompt(ctx: BrainContext, cfg: EngramConfig): string {
  const parts: string[] = [];
  // ── 稳定段（前缀缓存友好区）──
  parts.push(...block('人格内核', ctx.persona));
  parts.push(...block('会话脉络', ctx.digest));
  parts.push(...block('表达口径', ENGRAM_CHANNEL_STYLE));
  // ── 易变段（贴尾）──
  parts.push(...block('当前发言人', cfg.userNick));
  parts.push(...block('当前立场', ctx.attitudeLines));
  parts.push(...block('记忆库摘录', ctx.memoryLines));
  parts.push(...block('深挖记忆', ctx.deepRecallLines));
  parts.push(...block('情绪态', ctx.emotion));
  parts.push(...block('当前时刻', ctx.clock));
  return parts.join('\n\n');
}

/** 主动开口的轻量 system prompt（slice2：不带全量历史，只带人设+意图+此刻感） */
export function buildProactivePrompt(
  persona: string,
  intentText: string,
  emotion: string,
  clock: string,
): string {
  return [
    block('人格内核', persona).join('\n\n'),
    '【此刻】你想起一件想对对方说的事，主动发一条消息。',
    block('想起的事', intentText).join('\n\n'),
    block('情绪态', emotion).join('\n\n'),
    block('当前时刻', clock).join('\n\n'),
    '【要求】用你自己的话自然地说出来，一两句即可；不说「系统提示」「我注意到」这类生硬开场；'
      + '如果此刻不合适（深夜/对方可能在忙），可以只发一句轻的问候或干脆不发——但既然走到这一步，请给出一句真心的。',
  ].filter(Boolean).join('\n\n');
}
