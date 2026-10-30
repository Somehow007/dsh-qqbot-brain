import { appendFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 文件日志：追加写入 <dataDir>/brain.log，超 1MB 轮转为 brain.log.old。
 * 日志失败静默——文件日志是观测手段，不能影响插件本体。
 */
export function makeFileLogger(dataDir: string, tag = '[qqbot-brain]'): (msg: string) => void {
  const file = join(dataDir, 'brain.log');
  const MAX = 1024 * 1024;
  return (msg: string): void => {
    try {
      if (statSync(file).size > MAX) renameSync(file, `${file}.old`);
    } catch { /* 文件不存在或不可写则跳过轮转 */ }
    try {
      appendFileSync(file, `${new Date().toISOString()} ${tag} ${msg}\n`);
    } catch { /* 写日志失败静默 */ }
  };
}
