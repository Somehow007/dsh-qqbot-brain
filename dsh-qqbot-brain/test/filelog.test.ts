import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeFileLogger } from '../src/setup/file-log.ts';

function tmp(): string {
  const d = join(tmpdir(), `brain-log-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  return d;
}

test('文件日志：写入带时间戳的行', () => {
  const dir = tmp();
  try {
    const log = makeFileLogger(dir);
    log('已启动：测试');
    const line = readFileSync(join(dir, 'brain.log'), 'utf8');
    assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[qqbot-brain\] 已启动：测试\n$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('文件日志：超过 1MB 轮转为 .old', () => {
  const dir = tmp();
  try {
    const file = join(dir, 'brain.log');
    writeFileSync(file, 'x'.repeat(1024 * 1024 + 1));
    const log = makeFileLogger(dir);
    log('新一轮开始');
    assert.ok(existsSync(`${file}.old`));
    assert.match(readFileSync(file, 'utf8'), /新一轮开始\n$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('文件日志：目录不可写时静默不抛', () => {
  const log = makeFileLogger('/nonexistent-brain-dir-xyz');
  assert.doesNotThrow(() => log('不应崩溃'));
});
