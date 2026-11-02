import { DAY_MS } from './types.ts';

/**
 * 时间渲染助手：给「什么时候说」打底。
 * 全部按配置时区输出（默认 Asia/Shanghai，云服务器系统时区通常 UTC）；
 * 非法时区降级为系统时区而非抛错——时间是提示信息，不能搞崩注入/蒸馏。
 */

interface Parts { y: string; mo: string; d: string; hh: string; mi: string; wd: string }

function partsOf(ms: number, timeZone: string, withWeekday: boolean): Parts {
  const base: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    ...(withWeekday ? { weekday: 'short' as const } : {}),
  };
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('zh-CN', { ...base, timeZone });
  } catch {
    fmt = new Intl.DateTimeFormat('zh-CN', base);
  }
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) bag[p.type] = p.value;
  // hour12:false 下部分 ICU 版本把午夜渲成 24 点，统一归零
  const hh = bag.hour === '24' ? '00' : (bag.hour ?? '00');
  return { y: bag.year ?? '', mo: bag.month ?? '', d: bag.day ?? '', hh, mi: bag.minute ?? '', wd: bag.weekday ?? '' };
}

/** `YYYY-MM-DD HH:mm` —— 蒸馏/脉络 convo 行级时间戳 */
export function formatStamp(ms: number, timeZone: string): string {
  const p = partsOf(ms, timeZone, false);
  return `${p.y}-${p.mo}-${p.d} ${p.hh}:${p.mi}`;
}

/** `HH:mm` —— 同一轮内多条用户消息的逐条时间（轮级时间戳已带日期，行内从简） */
export function formatShort(ms: number, timeZone: string): string {
  const p = partsOf(ms, timeZone, false);
  return `${p.hh}:${p.mi}`;
}

/** `2026年11月2日 周二 16:40（Asia/Shanghai）` —— 「当前时刻」注入行 */
export function formatClock(now: number, timeZone: string): string {
  const p = partsOf(now, timeZone, true);
  return `${Number(p.y)}年${Number(p.mo)}月${Number(p.d)}日 ${p.wd} ${p.hh}:${p.mi}（${timeZone}）`;
}

/** `N分钟前 / N小时前 / N天前` —— 记忆形成年龄标注（替代天粒度的「今天/N天前」） */
export function ageLabel(createdAt: number, now: number): string {
  const ms = Math.max(0, now - createdAt);
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}分钟前`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(ms / DAY_MS)}天前`;
}
