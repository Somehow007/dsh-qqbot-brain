import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildProactivePrompt } from '../src/chat/prompt.ts';
import type { BrainContext } from '../src/brain.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';

const FULL: BrainContext = {
  persona: '你是流萤',
  emotion: '情绪态：开心',
  digest: '脉络摘要',
  clock: '当前时刻：2026-11-19 22:00',
  memoryLines: ['- 记忆A', '- 记忆B'],
  attitudeLines: ['- 对开拓者：剧本里的人'],
  deepRecallLines: ['- [深挖] 旧事'],
  hits: [],
};

test('九段齐全且顺序稳定→易变', () => {
  const p = buildSystemPrompt(FULL, DEFAULT_CONFIG);
  const order = ['人格内核', '会话脉络', '表达口径', '当前发言人', '当前立场', '记忆库摘录', '深挖记忆', '情绪态', '当前时刻'];
  let last = -1;
  for (const name of order) {
    const i = p.indexOf(`【${name}】`);
    assert.ok(i > last, `${name} 缺失或顺序错`);
    last = i;
  }
});

test('空段不产出', () => {
  const empty: BrainContext = { persona: '', emotion: '', digest: '', clock: '', memoryLines: [], attitudeLines: [], deepRecallLines: [], hits: [] };
  const p = buildSystemPrompt(empty, DEFAULT_CONFIG);
  assert.ok(!p.includes('【人格内核】')); // channelStyle 文本含「人格内核」字样，须按节标题断言
  assert.ok(!p.includes('【记忆库摘录】'));
  assert.ok(p.includes('【表达口径】')); // channelStyle 恒在
});

test('发言人用 cfg.userNick', () => {
  const p = buildSystemPrompt(FULL, DEFAULT_CONFIG);
  assert.ok(p.includes(`【当前发言人】\n${DEFAULT_CONFIG.userNick}`));
});

test('buildProactivePrompt 含意图与此刻感约束', () => {
  const p = buildProactivePrompt('人设', '想起对方说过的考试', '开心', '22:00');
  assert.ok(p.includes('想起对方说过的考试'));
  assert.ok(p.includes('主动'));
});
