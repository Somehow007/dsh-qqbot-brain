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
    const created = await call('/personas', 'POST', { name: '温柔', text: '温柔内核', characterId: 'whale' });
    assert.equal(created.status, 200);
    const items = await created.json() as { personas: { id: string; characterId?: string }[] };
    const id = items.personas.find((p) => p.id !== 'legacy')!.id;
    assert.equal(items.personas.find((p) => p.id === id)!.characterId, 'whale');
    assert.equal(brain.persona(), '旧版');
    assert.equal((await call('/personas/activate', 'POST', { id: 'missing' })).status, 404);
    assert.equal((await call('/personas', 'PATCH', { id, name: '', text: 'bad' })).status, 400);
    assert.equal((await call('/persona', 'POST', { text: '' })).status, 400);
    assert.equal((await call('/persona', 'POST', { name: 'x' })).status, 400);
    assert.equal(brain.persona(), '旧版');
    assert.equal((await call('/personas/activate', 'POST', { id })).status, 200);
    assert.equal(brain.assemble('s1', 'hi').persona, '温柔内核');
    assert.equal(readPersonaFile(dir), '温柔内核');
    assert.equal((await call('/personas', 'PATCH', { id, name: '温柔二版', text: '新版', characterId: 'whale-v2' })).status, 200);
    assert.equal(readPersonaFile(dir), '新版');
    const afterPatch = await (await call('/personas')).json() as { personas: { id: string; characterId?: string }[] };
    assert.equal(afterPatch.personas.find((p) => p.id === id)!.characterId, 'whale-v2');
    // 不传 characterId 的 PATCH 保留旧值（文本不变，避免影响后续备份断言）
    assert.equal((await call('/personas', 'PATCH', { id, name: '温柔二版', text: '新版' })).status, 200);
    const kept = await (await call('/personas')).json() as { personas: { id: string; characterId?: string }[] };
    assert.equal(kept.personas.find((p) => p.id === id)!.characterId, 'whale-v2');
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

test('人设 meta API：POST/PATCH 透传与清除，非法色值/traits 越界 400，备份往返保留', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-meta-http-'));
  const store = new BrainStore(dir);
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
    const meta = {
      theme: { a: '#1a2b3c', a2: '#4d5e6f', soft: '#8899aa', deep: '#0d1e2f' },
      moodColors: { 开心: '#ffd166' },
      traits: [{ name: '温柔', v: 0.9 }],
      mono: '鲸', en: 'WHALE', tagline: '深海里的大家伙',
    };
    // 非法 meta → 400 且不落库
    assert.equal((await call('/personas', 'POST', { name: 'x', text: 'x', meta: { theme: { a: 'red' } } })).status, 400);
    assert.equal((await call('/personas', 'POST', { name: 'x', text: 'x', meta: { traits: [{ name: 't', v: 2 }] } })).status, 400);
    assert.equal(store.listPersonas().length, 0);
    const created = await call('/personas', 'POST', { name: '鲸鱼娘', text: '鲸', characterId: 'whale', meta });
    assert.equal(created.status, 200);
    const items = await created.json() as { personas: { id: string; meta?: typeof meta }[] };
    const id = items.personas.find((p) => p.id !== 'legacy')!.id;
    assert.deepEqual(items.personas.find((p) => p.id === id)!.meta, meta);
    // PATCH 不传 meta 保留；PATCH meta:null 清除；PATCH 新 meta 覆盖
    assert.equal((await call('/personas', 'PATCH', { id, name: '鲸鱼娘', text: '鲸二版' })).status, 200);
    let got = await (await call('/personas')).json() as { personas: { id: string; meta?: typeof meta }[] };
    assert.deepEqual(got.personas.find((p) => p.id === id)!.meta, meta);
    const next = { ...meta, mono: '鱼' };
    assert.equal((await call('/personas', 'PATCH', { id, name: '鲸鱼娘', text: '鲸二版', meta: next })).status, 200);
    got = await (await call('/personas')).json() as { personas: { id: string; meta?: typeof meta }[] };
    assert.deepEqual(got.personas.find((p) => p.id === id)!.meta, next);
    assert.equal((await call('/personas', 'PATCH', { id, name: '鲸鱼娘', text: '鲸二版', meta: null })).status, 200);
    got = await (await call('/personas')).json() as { personas: { id: string; meta?: unknown }[] };
    assert.equal(got.personas.find((p) => p.id === id)!.meta, undefined);
    // 备份往返：重新写入 meta 后 export→import replace 仍在
    await call('/personas', 'PATCH', { id, name: '鲸鱼娘', text: '鲸二版', meta });
    const backup = await (await call('/export')).json() as object;
    assert.equal((await call('/import?mode=replace', 'POST', backup)).status, 200);
    const after = await (await call('/personas')).json() as { personas: { id: string; meta?: typeof meta }[] };
    assert.deepEqual(after.personas.find((p) => p.id === id)!.meta, meta);
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
    // 迭代A：whale 系人设启动时归并到同一角色，自我轨跨版本共享
    assert.equal(gentle?.characterId, 'whale');
    assert.equal(upgraded.listPersonas().find((p) => p.id === 'legacy')?.characterId, 'whale');
    assert.equal(upgraded.listPersonas().find((p) => p.id === 'whale-devotion')?.characterId, 'whale');
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

test('私域 API：/api/sessions/domain 标记/清除/校验，/api/sessions 带 domain', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-domain-http-'));
  const store = new BrainStore(dir);
  store.addNote('s1', { content: '私聊记忆', importance: 3 }, Date.now());
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
    assert.equal((await call('/sessions/domain', 'POST', { sessionId: 's1', domain: 'demo' })).status, 200);
    assert.equal(store.sessionDomainOf('s1'), 'demo');
    assert.equal((await call('/sessions/domain', 'POST', { sessionId: 's1', domain: 'public' })).status, 400);
    assert.equal((await call('/sessions/domain', 'POST', { domain: 'demo' })).status, 400);
    const list = await (await call('/sessions')).json() as { sessions: { sessionId: string; domain: string }[] };
    assert.equal(list.sessions.find((s) => s.sessionId === 's1')!.domain, 'demo');
    await call('/sessions/domain', 'POST', { sessionId: 's1', domain: '' });
    assert.equal(store.sessionDomainOf('s1'), '');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});

test('放行候选 API：返回域内待放行队列，PATCH private:public 放行后出队', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-release-http-'));
  const store = new BrainStore(dir);
  store.setSessionDomain('priv', 'demo');
  const cand = store.addNote('priv', { content: 'demo：每周读经济学人和小说', importance: 4 }, Date.now());
  store.addNote('priv', { content: 'demo：亲密约定梳头吹头发', importance: 4 }, Date.now());
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
    const list = await (await call('/release-candidates')).json() as { candidates: { id: string; scope: string }[] };
    assert.deepEqual(list.candidates.map((c) => c.id), [cand.id]);
    assert.equal(list.candidates[0]!.scope, 'demo');
    assert.equal((await call(`/notes/${cand.id}`, 'PATCH', { private: 'public' })).status, 200);
    const after = await (await call('/release-candidates')).json() as { candidates: unknown[] };
    assert.equal(after.candidates.length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});

test('web 静态白名单：免口令可访问、仅白名单文件、?ui=legacy 分流旧页', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-web-http-'));
  const store = new BrainStore(dir);
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
    const base = `http://127.0.0.1:${addr.port}`;
    const auth = { headers: { 'x-brain-token': 'test-token' } };

    // 白名单内静态文件免口令（ES module 相对 import 带不了 token）
    const js = await fetch(`${base}/brain/web/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
    assert.match(await js.text(), /core\/api\.js/);
    assert.equal((await fetch(`${base}/brain/web/core/theme.js`)).status, 200);
    assert.equal((await fetch(`${base}/brain/web/app.css`)).status, 200);

    // 白名单外/不存在/目录 → 404（.html 不在扩展名白名单；目录无文件）
    assert.equal((await fetch(`${base}/brain/web/nope.js`)).status, 404);
    assert.equal((await fetch(`${base}/brain/web/index.html`)).status, 404);
    assert.equal((await fetch(`${base}/brain/web/core`)).status, 404);
    // 字面 ../ 被 URL 归一化出 /web/ 前缀 → 落回口令保护（401）；
    // 编码形态 %2e%2e%2f 留在 /web/ 内 → serveWeb 解码后拒 '..' → 404
    assert.equal((await fetch(`${base}/brain/web/../page.html`)).status, 401);
    assert.equal((await fetch(`${base}/brain/web/%2e%2e%2fpage.html`)).status, 404);

    // API 与 HTML 仍受口令保护
    assert.equal((await fetch(`${base}/brain/api/state`)).status, 401);
    assert.equal((await fetch(`${base}/brain`)).status, 401);
    assert.equal((await fetch(`${base}/brain?ui=legacy`)).status, 401);

    // /brain → 新壳 index.html（注入 <base>）
    const page = await fetch(`${base}/brain`, auth);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<base href="\/brain\/">/);
    assert.match(html, /web\/app\.js/);
    assert.doesNotMatch(html, /大肥鱼 \/ 心智图谱/);

    // ?ui=legacy → 旧单文件页
    const legacy = await fetch(`${base}/brain?ui=legacy`, auth);
    assert.equal(legacy.status, 200);
    const lhtml = await legacy.text();
    assert.match(lhtml, /大肥鱼 \/ 心智图谱/);
    assert.doesNotMatch(lhtml, /<base href/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});

test('B2–B5 管理端 API：notes 分页查询/批量/ops 分页/dedup dry 预估', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-admin-api-'));
  const store = new BrainStore(dir);
  store.setSessionDomain('priv', 'demo');
  const n1 = store.addNote('s1', { content: '管理页测试记忆甲', importance: 4 }, Date.now());
  const n2 = store.addNote('s1', { content: '管理页测试记忆乙', kind: 'semantic', importance: 2 }, Date.now());
  store.addNote('priv', { content: 'demo：每周读经济学人', importance: 3 }, Date.now());
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

    // 口令保护覆盖新路由
    assert.equal((await fetch(url + '/notes')).status, 401);
    assert.equal((await fetch(url + '/notes/batch', { method: 'POST' })).status, 401);

    // B2 GET /api/notes：分页+筛选
    const page1 = await (await call('/notes?page=1&size=20')).json() as { items: { id: string }[]; total: number; page: number; size: number };
    assert.equal(page1.total, 3);
    assert.equal(page1.items.length, 3);
    assert.equal(page1.size, 20);
    const sem = await (await call('/notes?kind=semantic')).json() as { items: { id: string }[]; total: number };
    assert.equal(sem.total, 1);
    assert.equal(sem.items[0]!.id, n2.id);
    const priv = await (await call('/notes?scope=priv')).json() as { total: number };
    assert.equal(priv.total, 1);
    const bad = await (await call('/notes?size=7')).json() as { size: number };
    assert.equal(bad.size, 20, '非法 size 归一');

    // B4 POST /api/notes/batch：合法批量补丁
    const batch = await call('/notes/batch', 'POST', { ids: [n1.id, n2.id, 'ghost'], patch: { importance: 5 } });
    assert.equal(batch.status, 200);
    assert.deepEqual(await batch.json(), { ok: true, affected: 2 });
    assert.equal(store.noteById(n1.id)!.importance, 5);
    // 非法形状全 400
    assert.equal((await call('/notes/batch', 'POST', { ids: Array(201).fill('x'), patch: { importance: 1 } })).status, 400);
    assert.equal((await call('/notes/batch', 'POST', { ids: [n1.id], patch: { importance: 1 }, delete: true })).status, 400);
    assert.equal((await call('/notes/batch', 'POST', { ids: [n1.id], patch: {} })).status, 400);
    assert.equal((await call('/notes/batch', 'POST', { ids: [n1.id], patch: { kind: 'bogus' } })).status, 400);
    assert.equal((await call('/notes/batch', 'POST', { ids: 'not-array', patch: { importance: 1 } })).status, 400);
    assert.equal((await call('/notes/batch', 'POST', { patch: { importance: 1 } })).status, 400);
    // 批量删除
    const del = await call('/notes/batch', 'POST', { ids: [n2.id], delete: true });
    assert.equal((await del.json() as { affected: number }).affected, 1);
    assert.equal(store.noteById(n2.id), undefined);

    // B3 /api/ops 分页模式 + 旧 limit 兼容
    const ops = await (await call('/ops?page=1&size=20')).json() as { ops: { t: number; op: { op: string } }[]; total: number; page: number; size: number };
    assert.ok(ops.total >= 5, 'add×3 + update×批量 + del');
    assert.equal(ops.page, 1);
    assert.equal(ops.size, 20);
    const adds = await (await call('/ops?type=add')).json() as { ops: { op: { op: string } }[]; total: number };
    assert.ok(adds.ops.every((o) => o.op.op === 'add'));
    assert.equal(adds.total, 3);
    const legacy = await (await call('/ops?limit=2')).json() as { ops: unknown[] };
    assert.equal(legacy.ops.length, 2, '旧 limit 口径不变');
    const legacyAll = await (await call('/ops')).json() as { ops: unknown[] };
    assert.ok(Array.isArray(legacyAll.ops), '裸 /ops 仍返回 {ops}');

    // B5 /api/dedup?dry=1：预估零写入；非 dry 行为不变
    const m1 = store.addNote('s1', { content: '去重甲', importance: 3 }, Date.now());
    const m2 = store.addNote('s1', { content: '去重乙长文案内容', importance: 4 }, Date.now());
    store.setEmbedding(m1.id, [1, 0, 0]);
    store.setEmbedding(m2.id, [0.99, 0.05, 0]);
    const opsBefore = store.recentOps(500).length;
    const notesBefore = store.allNotes().length;
    const dry = await (await call('/dedup?dry=1', 'POST')).json() as { wouldMerge: number; pairs: unknown[]; released: number };
    assert.equal(dry.wouldMerge, 1);
    assert.equal(dry.pairs.length, 1);
    assert.equal(store.recentOps(500).length, opsBefore, 'dry 不落 op');
    assert.equal(store.allNotes().length, notesBefore, 'dry 不动条数');
    const real = await (await call('/dedup', 'POST')).json() as { merged: number };
    assert.equal(real.merged, 1, '非 dry 仍执行合并');
    assert.equal(store.allNotes().length, notesBefore - 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});

test('口令收口（B-02）：首跳 ?token= 换 HttpOnly cookie，刷新与 API 凭 cookie 通过；错口令不发 cookie', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-token-cookie-'));
  const brain = new Brain({
    store: new BrainStore(dir),
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
    const base = `http://127.0.0.1:${addr.port}/brain`;
    const first = await fetch(`${base}?token=test-token`);
    assert.equal(first.status, 200);
    const cookie = first.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^brain_token=test-token;/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/brain/);
    const jar = { cookie: 'other=1; brain_token=test-token' };
    assert.equal((await fetch(base, { headers: jar })).status, 200);
    assert.equal((await fetch(`${base}/api/personas`, { headers: jar })).status, 200);
    assert.equal((await fetch(`${base}/api/personas`, { headers: { cookie: 'brain_token=wrong' } })).status, 401);
    assert.equal((await fetch(`${base}/api/personas`)).status, 401);
    const bad = await fetch(`${base}?token=wrong`);
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get('set-cookie'), null);
    const viaHeader = await fetch(`${base}/api/personas`, { headers: { 'x-brain-token': 'test-token' } });
    assert.equal(viaHeader.status, 200);
    assert.equal(viaHeader.headers.get('set-cookie'), null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});
