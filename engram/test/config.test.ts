import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, DEFAULT_CONFIG } from '../src/config.ts';

test('默认值：关键面', () => {
  const c = loadConfig({});
  assert.equal(c.sessionId, 'main');
  assert.equal(c.userNick, '开拓者');
  assert.equal(c.http.port, 4100);
  assert.equal(c.http.brainPort, 4101);
  assert.equal(c.proactive.enabled, false); // slice2 默认关
  assert.equal(c.proactive.maxPerDay, 4);
  assert.equal(c.tools.brainSearch, false);
  assert.equal(c.history.maxTurns, 24);
});

test('env 覆盖：chat/brain LLM 独立', () => {
  const c = loadConfig({
    ENGRAM_DATA_DIR: '/tmp/x',
    USER_NICK: '测试员',
    CHAT_LLM_MODEL: 'gpt-x',
    BRAIN_LLM_MODEL: 'deepseek-x',
    CHAT_LLM_API_KEY: 'ck',
    BRAIN_LLM_API_KEY: 'bk',
    ENGRAM_HTTP_TOKEN: 'tok',
    PROACTIVE_ENABLED: '1',
    PROACTIVE_MAX_PER_DAY: '6',
  });
  assert.equal(c.dataDir, '/tmp/x');
  assert.equal(c.userNick, '测试员');
  assert.equal(c.chat.model, 'gpt-x');
  assert.equal(c.llm.model, 'deepseek-x');
  assert.equal(c.chat.apiKey, 'ck');
  assert.equal(c.llm.apiKey, 'bk');
  assert.equal(c.http.token, 'tok');
  assert.equal(c.proactive.enabled, true);
  assert.equal(c.proactive.maxPerDay, 6);
});

test('env 兜底：DEEPSEEK_API_KEY 同时喂 chat+brain', () => {
  const c = loadConfig({ DEEPSEEK_API_KEY: 'shared' });
  assert.equal(c.chat.apiKey, 'shared');
  assert.equal(c.llm.apiKey, 'shared');
});
