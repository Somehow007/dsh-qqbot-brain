import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Brain, BrainStore, Distiller } from '../src/brain/index.ts';
import { BrainHttpServer } from '../src/server/http.ts';
import { writePersonaFile, readPersonaFile } from '../src/setup/persona-file.ts';
import { apply } from '../src/index.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';

test('人设 API: 口令保护、创建编辑切换与备份恢复同步活动文件', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-persona-http-'));
  const store = new BrainStore(dir);
  store.setPersona('旧版');
  writePersonaFile(dir, '旧版');
  const brain = new Brain({
    store,
    distiller: new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 1 }),
  });
  const http = new BrainHttpServer(brain, {
    enabled: true, port: 0, host: '127.0.0.1', prefix: '/brain', token: 'test-token',
  }, () => {}, (text) => writePersonaFile(dir, text));
  const server = createServer((req, res) => {
    (http as unknown as { route: (req: typeof req, res: typeof res) => Promise<void> }).route(req, res).catch((err) => {
      res.writeHead(500).end(String(err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const url = `http://127.0.0.1:${addr.port}/brain/api`;
    const call = (path: string, method = 'GET', body?: object) =>
      fetch(url + path, {
        method, headers: { 'x-brain-token': 'test-token', 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      });
    assert.equal((await fetch(url + '/personas')).status, 401);
    const created = await call('/personas', 'POST', { name: '温柔', text: '温柔内核' });
    assert.equal(created.status, 200);
    const items = await created.json() as { personas: { id: string }[] };
    const id = items.personas.find((p) => p.id !== 'legacy')!.id;
    assert.equal(brain.persona(), '旧版');
    assert.equal((await call('/personas/activate', 'POST', { id: 'missing' })).status, 404);
    assert.equal((await call('/personas', 'PATCH', { id, name: '', text: 'bad' })).status, 400);
    assert.equal((await call('/persona', 'POST', { text: '' })).status, 400);
    assert.equal((await call('/persona', 'POST', { name: 'x' })).status, 400);
    assert.equal(brain.persona(), '旧版');
    assert.equal((await call('/personas/activate', 'POST', { id })).status, 200);
    assert.equal(brain.assemble('s1', 'hi').persona, '温柔内核');
    assert.equal(readPersonaFile(dir), '温柔内核');
    assert.equal((await call('/personas', 'PATCH', { id, name: '温柔二版', text: '新版' })).status, 200);
    assert.equal(readPersonaFile(dir), '新版');
    const backup = await (await call('/export')).json() as object;
    assert.equal((await call('/personas/activate', 'POST', { id: 'legacy' })).status, 200);
    assert.equal((await call('/import?mode=replace', 'POST', backup)).status, 200);
    assert.equal(readPersonaFile(dir), '新版');
    assert.equal(new BrainStore(dir).persona(), '新版');
    assert.equal(readFileSync(join(dir, 'persona.md'), 'utf8').trim(), '新版');
    assert.equal((await call('/personas?id=missing', 'DELETE')).status, 404);
    assert.equal((await call('/personas?id=' + id, 'DELETE')).status, 400);
    const del = await call('/personas?id=legacy', 'DELETE');
    assert.equal(del.status, 200);
    const left = await del.json() as { personas: { id: string }[] };
    assert.equal(left.personas.length, 1);
    assert.equal(left.personas[0]!.id, id);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});

test('启动迁移单份人设、加载完整预置、保持用户选择与手工 persona.md 优先级', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-persona-boot-'));
  try {
    const store = new BrainStore(dir);
    store.setPersona('原版内容');
    writePersonaFile(dir, '手工编辑内容');
    const ctx = { on: () => {}, get: () => undefined, logger: { info: () => {} } };
    const cfg = {
      dataDir: dir,
      llm: { ...DEFAULT_CONFIG.llm, enabled: false },
      embed: { ...DEFAULT_CONFIG.embed, enabled: false },
      consolidation: { ...DEFAULT_CONFIG.consolidation, enabled: false },
      http: { ...DEFAULT_CONFIG.http, enabled: false },
    };
    await apply(ctx, cfg);
    const upgraded = new BrainStore(dir);
    assert.equal(upgraded.persona(), '手工编辑内容');
    assert.equal(upgraded.activePersonaId(), 'legacy');
    const gentle = upgraded.listPersonas().find((p) => p.id === 'whale-gentle');
    assert.equal(gentle?.text, readFileSync(join(import.meta.dirname, '../src/setup/whale-gentle.md'), 'utf8').trim());
    upgraded.activatePersona('whale-gentle');
    writePersonaFile(dir, gentle!.text);
    await apply(ctx, cfg);
    const restarted = new BrainStore(dir);
    assert.equal(restarted.activePersonaId(), 'whale-gentle');
    assert.equal(restarted.listPersonas().length, 3);
    assert.ok(restarted.listPersonas().some((p) => p.id === 'whale-devotion'));
    restarted.activatePersona('legacy');
    assert.equal(restarted.persona(), '手工编辑内容');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('画像管理与危险区 API：编辑/删除/重生成门禁/时段删除/记忆重置保人设', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-admin-http-'));
  const store = new BrainStore(dir);
  store.setPersona('人设内核');
  store.setProfileEntry('u:OID1', '画像A', { sessionId: 's1', name: 'demo' });
  const t1 = Date.parse('2026-10-30T10:00:00Z');
  const t2 = Date.parse('2026-11-01T10:00:00Z');
  store.addNote('s1', { content: '旧记忆', importance: 3 }, t1);
  store.addNote('s1', { content: '新记忆', importance: 3 }, t2);
  const brain = new Brain({
    store,
    distiller: new Distiller({ enabled: false, baseUrl: '', apiKey: '', model: '', timeoutMs: 1000, maxNotes: 1 }),
  });
  const http = new BrainHttpServer(brain, {
    enabled: true, port: 0, host: '127.0.0.1', prefix: '/brain', token: 'test-token',
  }, () => {});
  const server = createServer((req, res) => {
    (http as unknown as { route: (req: typeof req, res: typeof res) => Promise<void> }).route(req, res).catch((err) => {
      res.writeHead(500).end(String(err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const url = `http://127.0.0.1:${addr.port}/brain/api`;
    const call = (path: string, method = 'GET', body?: object) =>
      fetch(url + path, {
        method, headers: { 'x-brain-token': 'test-token', 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      });
    // 画像编辑
    assert.equal((await call('/profiles', 'PATCH', { key: 'u:OID1', text: '手改画像', name: '新名' })).status, 200);
    assert.equal(store.profileOf('u:OID1'), '手改画像');
    assert.equal(store.profileEntry('u:OID1')!.name, '新名');
    assert.equal(store.profileEntry('u:OID1')!.reviewed, '手改画像');
    assert.equal((await call('/profiles', 'PATCH', { key: 'u:nope', text: 'x' })).status, 404);
    assert.equal((await call('/profiles', 'PATCH', { key: 'u:OID1' })).status, 400);
    // 重生成门禁：蒸馏不可用 → 409 且不改数据
    assert.equal((await call('/profiles/regenerate', 'POST', { key: 'u:OID1' })).status, 409);
    assert.equal((await call('/profiles/regenerate', 'POST', {})).status, 400);
    // 时段删除
    assert.equal((await call('/notes/purge', 'POST', { from: t2, to: t1 })).status, 400);
    const purge = await call('/notes/purge', 'POST', { from: t1 - 1000, to: t1 + 1000 });
    assert.equal(purge.status, 200);
    assert.equal((await purge.json() as { deleted: number }).deleted, 1);
    assert.deepEqual(store.allNotes().map((n) => n.content), ['新记忆']);
    // 画像删除
    assert.equal((await call('/profiles?id=' + encodeURIComponent('u:OID1'), 'DELETE')).status, 200);
    assert.equal(store.hasProfile('u:OID1'), false);
    assert.equal((await call('/profiles?id=' + encodeURIComponent('u:OID1'), 'DELETE')).status, 404);
    // 记忆重置：清光记忆数据但保人设
    const reset = await call('/reset', 'POST');
    assert.equal(reset.status, 200);
    const cleared = await reset.json() as { cleared: { notes: number } };
    assert.equal(cleared.cleared.notes, 1);
    assert.equal(store.allNotes().length, 0);
    assert.equal(store.persona(), '人设内核');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});
