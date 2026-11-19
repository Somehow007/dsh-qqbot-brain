/**
 * persona 装载（design.md §6）：
 *
 *   personas/firefly/ 包（persona.md + seed-export.json）
 *   → importData merge 幂等灌入（uuid5 确定性 id，重启不重复）
 *   → persona.md 优先级：dataDir/persona.md > pack/persona.md
 *   → setPersona 同步活跃卡文本——persona.md 是 prompt+蒸馏双侧唯一事实源
 *     （importData merge 对已存在 personas[] 跳过更新，store.ts:1259，
 *      故后续编辑靠 setPersona 而非重复 import）
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readPersonaFile,
  writePersonaFile,
  type Brain,
} from './brain.ts';

export interface PersonaPack {
  /** persona.md 全文（pack 内嵌权威文本） */
  personaText: string;
  /** seed-export.json 原始对象（BrainExport 形状，交给 importData） */
  seed: unknown;
  /** pack 内登记的人设 id（一般 'firefly'） */
  personaId?: string;
}

export interface PersonaBootResult {
  personaText: string;
  /** persona.md / pack / none——启动日志用 */
  personaFrom: 'persona.md' | 'pack' | 'none';
  /** 种子导入计数（notes/personas/persona） */
  seedNotes?: number;
}

/** 读 persona 包：persona.md + seed-export.json。缺文件返回 null 由调用方降级。 */
export function loadPersonaPack(seedDir: string): PersonaPack | null {
  const personaPath = join(seedDir, 'persona.md');
  const seedPath = join(seedDir, 'seed-export.json');
  if (!existsSync(personaPath)) return null;
  try {
    const personaText = readFileSync(personaPath, 'utf8').trim();
    if (!personaText) return null;
    let seed: unknown;
    if (existsSync(seedPath)) {
      try { seed = JSON.parse(readFileSync(seedPath, 'utf8')); } catch { seed = undefined; }
    }
    const pid = (seed as { activePersonaId?: string } | undefined)?.activePersonaId;
    return { personaText, seed, personaId: pid };
  } catch {
    return null;
  }
}

/**
 * 启动自举（幂等）：
 *  1. seed merge 导入（首次建条目+激活；重跑全 skip）
 *  2. persona.md 缺失 → 写 pack 文本（活文档自举）
 *  3. setPersona(resolved) —— activeId 存在时同步活跃卡文本
 */
export function ensurePersona(
  brain: Brain,
  dataDir: string,
  pack: PersonaPack | null,
  log: (msg: string) => void,
): PersonaBootResult {
  // 1. 种子幂等灌入
  let seedNotes: number | undefined;
  if (pack?.seed != null) {
    try {
      const res = brain.importData(pack.seed, 'merge');
      seedNotes = res.notes;
      log(`persona 种子导入：+${res.notes} 记忆 / 跳过 ${res.skipped} / 画像 ${res.profiles} / 情绪 ${res.emotions} / 人设 ${res.persona ? '更新' : '无'}`);
    } catch (e) {
      log(`persona 种子导入失败（继续用现有数据）：${String(e)}`);
    }
  } else {
    log('persona 包无 seed-export.json，跳过种子导入');
  }

  // 2. persona.md 优先级解析
  const fileText = readPersonaFile(dataDir);
  const resolved = fileText || pack?.personaText || '';
  const personaFrom: PersonaBootResult['personaFrom'] = fileText ? 'persona.md' : pack ? 'pack' : 'none';

  // 3. dataDir/persona.md 自举（首次启动把 pack 文本落成活文档）
  if (!fileText && resolved) {
    try {
      writePersonaFile(dataDir, resolved);
      log('persona.md 自举：pack 文本已写入数据目录');
    } catch (e) {
      log(`persona.md 写入失败：${String(e)}`);
    }
  }

  // 4. setPersona 同步：activeId 存在 → savePersona 活跃卡（prompt+蒸馏双侧生效）；
  //    无 activeId → 'persona' op 人格内核兜底。空文本不调用（setPersona 拒空）。
  if (resolved) {
    try {
      brain.setPersona(resolved);
    } catch (e) {
      log(`setPersona 失败：${String(e)}`);
    }
  }

  return { personaText: resolved, personaFrom, seedNotes };
}
