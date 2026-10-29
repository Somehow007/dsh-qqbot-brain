import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Brain } from '../brain/index.ts';
import { retention } from '../brain/decay.ts';
import type { HttpConfig } from '../config.ts';

/**
 * 脑图页与 JSON API。
 * 优先挂 ctx.webServer（dsh web 模式），否则 node:http 独立端口兜底（CLI profile）。
 */

interface WebRoute { path: string; method?: string; handler: (req: IncomingMessage, res: ServerResponse) => void }
interface WebServerLike { register(route: WebRoute): () => void }

const PAGE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'page.html');

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage, limit = 64_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c; if (body.length > limit) req.destroy(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseJson<T>(body: string): T | undefined {
  try { return JSON.parse(body) as T; } catch { return undefined; }
}

export class BrainHttpServer {
  private server?: Server;
  private brain: Brain;
  private cfg: HttpConfig;
  private log: (msg: string) => void;

  private onPersonaSet?: (text: string) => void;

  constructor(brain: Brain, cfg: HttpConfig, log: (msg: string) => void, onPersonaSet?: (text: string) => void) {
    this.brain = brain;
    this.cfg = cfg;
    this.log = log;
    this.onPersonaSet = onPersonaSet;
  }

  private route(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    const prefix = this.cfg.prefix.replace(/\/$/, '');

    // 可选口令保护
    if (this.cfg.token) {
      const t = url.searchParams.get('token') ?? req.headers['x-brain-token'];
      if (t !== this.cfg.token) { res.writeHead(401).end('unauthorized'); return; }
    }

    if (p === `${prefix}/api/state`) {
      const sessionId = url.searchParams.get('session') ?? undefined;
      return json(res, this.brain.graph(sessionId));
    }
    if (p === `${prefix}/api/persona`) {
      if (req.method === 'GET') return json(res, { text: this.brain.persona() });
      if (req.method === 'POST') {
        readBody(req).then((body) => {
          let text = body.trim();
          const o = parseJson<{ text?: string }>(body);
          if (o?.text) text = o.text.trim();
          if (!text) { res.writeHead(400).end('empty persona'); return; }
          this.brain.setPersona(text);
          this.onPersonaSet?.(text);
          return json(res, { ok: true, length: text.length });
        });
        return;
      }
    }
    if (p === `${prefix}/api/sessions`) {
      return json(res, { sessions: this.brain.sessions() });
    }
    if (p === `${prefix}/api/ops`) {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
      return json(res, { ops: this.brain.recentOps(limit) });
    }
    if (p === `${prefix}/api/consolidate` && req.method === 'POST') {
      const sid = url.searchParams.get('session');
      const targets = sid ? [sid] : this.brain.sessionsNeedingConsolidation();
      Promise.all(targets.map((s) => this.brain.consolidate(s))).then((counts) => {
        json(res, { ok: true, sessions: targets.length, semanticNotes: counts.reduce((a, b) => a + b, 0) });
      });
      return;
    }
    // /api/notes 与 /api/notes/<id>[/reinforce]
    if (p === `${prefix}/api/notes` && req.method === 'POST') {
      readBody(req).then((body) => {
        const o = parseJson<{ content?: string; importance?: number; kind?: 'episodic' | 'semantic' | 'attitude'; sessionId?: string; actor?: string }>(body) ?? {};
        if (!o.content?.trim()) { res.writeHead(400).end('content required'); return; }
        const note = this.brain.addNote(o.sessionId ?? 'manual', {
          content: o.content, importance: o.importance, kind: o.kind, actor: o.actor,
        });
        return json(res, { ok: true, note });
      });
      return;
    }
    const noteMatch = p.match(new RegExp(`^${prefix}/api/notes/([^/]+)(/reinforce)?$`));
    if (noteMatch) {
      const id = decodeURIComponent(noteMatch[1] ?? '');
      if (noteMatch[2] === '/reinforce' && req.method === 'POST') {
        return this.brain.reinforceNote(id)
          ? json(res, { ok: true })
          : void res.writeHead(404).end('note not found');
      }
      if (req.method === 'PATCH') {
        readBody(req).then((body) => {
          const o = parseJson<{ content?: string; importance?: number; kind?: 'episodic' | 'semantic' | 'attitude' }>(body) ?? {};
          return this.brain.updateNote(id, o)
            ? json(res, { ok: true })
            : void res.writeHead(404).end('note not found');
        });
        return;
      }
      if (req.method === 'DELETE') {
        return this.brain.deleteNote(id)
          ? json(res, { ok: true })
          : void res.writeHead(404).end('note not found');
      }
    }
    if (p === `${prefix}/api/query`) {
      const sessionId = url.searchParams.get('session') ?? undefined;
      const q = url.searchParams.get('q') ?? '';
      const now = Date.now();
      const hits = this.brain.preview(sessionId, q).map((n) => ({
        id: n.id, content: n.content, importance: n.importance,
        retention: +retention(n, now).toFixed(3), hits: n.hits,
      }));
      return json(res, { hits });
    }
    if (p === prefix || p === `${prefix}/`) {
      try {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(readFileSync(PAGE_FILE, 'utf8'));
      } catch {
        res.writeHead(503).end('brain page not built yet (M3)');
      }
      return;
    }
    res.writeHead(404).end('not found');
  }

  /** 尝试挂到宿主 webServer，失败则自起端口。返回实际可访问的地址描述。 */
  start(ctx: unknown): string {
    // 宿主 dsh-host-webserver（与官方插件 bind-routes 同一服务形状）
    let webServer: WebServerLike | undefined;
    try {
      webServer = (ctx as { get(n: string): WebServerLike | undefined }).get('webServer');
    } catch { /* 无该服务 */ }

    if (webServer?.register) {
      const prefix = this.cfg.prefix.replace(/\/$/, '');
      webServer.register({ path: prefix, handler: (r, s) => this.route(r, s) });
      webServer.register({ path: `${prefix}/`, handler: (r, s) => this.route(r, s) });
      for (const sub of ['/api/state', '/api/query', '/api/persona', '/api/sessions', '/api/ops', '/api/notes']) {
        webServer.register({ path: `${prefix}${sub}`, handler: (r, s) => this.route(r, s) });
      }
      this.log(`brain: 已挂载到宿主 webServer ${prefix}`);
      return `host:${prefix}`;
    }

    if (!this.cfg.enabled) return 'disabled';
    this.server = createServer((req, res) => this.route(req, res));
    this.server.listen(this.cfg.port, this.cfg.host, () => {
      this.log(`brain: 脑图页 http://${this.cfg.host}:${this.cfg.port}${this.cfg.prefix}`);
    });
    return `http://${this.cfg.host}:${this.cfg.port}${this.cfg.prefix}`;
  }

  stop(): void {
    this.server?.close();
  }
}
