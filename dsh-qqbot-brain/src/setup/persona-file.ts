import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/**
 * persona.md —— 人格内核的活文档（导出=复制此文件，导入=放入此文件或 POST API）。
 * 启动时若存在则覆盖 store 中的内核（文件在重启语义下是权威源）。
 */

export function personaFilePath(dataDir: string): string {
  return join(dataDir, 'persona.md');
}

export function readPersonaFile(dataDir: string): string {
  const p = personaFilePath(dataDir);
  if (!existsSync(p)) return '';
  try { return readFileSync(p, 'utf8').trim(); } catch { return ''; }
}

export function writePersonaFile(dataDir: string, text: string): void {
  const p = personaFilePath(dataDir);
  const tmp = p + '.tmp';
  writeFileSync(tmp, text.trim() + '\n');
  renameSync(tmp, p);
}
