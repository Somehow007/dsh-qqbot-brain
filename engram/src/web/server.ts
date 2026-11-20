/**
 * engram Web 服务（design.md §9）：
 *
 *   :4100 公网  — chat UI + /api/* + /brain/* 反代 → 127.0.0.1:4101
 *   鉴权      — ?token= 首跳换 cookie；/api/* 校验 cookie/X-Engram-Token；
 *               /brain/* 由 brain server 自带鉴权，反代注入 x-brain-token
 *   SSE       — /api/events 推送 proactive/system 事件（心跳 25s）
 *
 * 单用户假设到底：无多租户、无账号体系；chat 请求串行化在 ChatLoop 内部
 * （Turn 配对假设 user/assistant 顺序）。
 */

import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ChatLoop, ChatReply } from '../chat/loop.ts';
import type { ChatHistory, HistoryEntry } from '../chat/history.ts';
import type { EngramConfig } from '../config.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAT_HTML = join(HERE, 'chat.html');

interface SseClient { res: ServerResponse }

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage, limit = 32_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c;
      if (body.length > limit) { req.destroy(); reject(new Error('body too large')); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export class EngramServer {
  private loop: ChatLoop;
  private history: ChatHistory;
  private cfg: EngramConfig;
  private log: (msg: string) => void;
  private server?: Server;
  private sseClients = new Set<SseClient>();
  private chatHtml?: string;

  constructor(loop: ChatLoop, history: ChatHistory, cfg: EngramConfig, log: (msg: string) => void) {
    this.loop = loop;
    this.history = history;
    this.cfg = cfg;
    this.log = log;
  }

  /** SSE 广播（proactive 发送后调用；失败静默——SSE 是便利通道） */
  broadcast(entry: HistoryEntry): void {
    const payload = `data: ${JSON.stringify({ type: 'message', entry })}\n\n`;
    for (const c of this.sseClients) {
      try { c.res.write(payload); } catch { this.sseClients.delete(c); }
    }
  }

  private authed(req: IncomingMessage): boolean {
    const token = this.cfg.http.token;
    if (!token) return true; // 未配置口令=本机调试态（生产必须设，main.ts 会 warn）
    if (req.headers['x-engram-token'] === token) return true;
    return parseCookies(req)['engram_token'] === token;
  }

  /** /brain/* 反代：注入 x-brain-token 透传给 brain server 自带鉴权 */
  private proxyBrain(req: IncomingMessage, res: ServerResponse): void {
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: this.cfg.http.brainPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, 'x-brain-token': this.cfg.http.brainToken },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      this.log(`brain 反代失败：${String(e)}`);
      if (!res.headersSent) json(res, { error: 'brain admin unreachable' }, 502);
      else res.end();
    });
    req.pipe(upstream);
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;

    // ── token 首跳：?token= → Set-Cookie → 302 回 /（不留 token 在地址栏历史）──
    const qToken = url.searchParams.get('token');
    if (qToken && this.cfg.http.token && qToken === this.cfg.http.token) {
      res.writeHead(302, {
        'Set-Cookie': `engram_token=${encodeURIComponent(qToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
        Location: '/',
      });
      res.end();
      return;
    }

    // ── 静态页（公开 shell；API 全部要鉴权，页内 JS 会处理 401）──
    if (path === '/' || path === '/index.html') {
      if (!this.chatHtml) {
        try { this.chatHtml = readFileSync(CHAT_HTML, 'utf8'); }
        catch { this.chatHtml = '<h1>chat.html missing</h1>'; }
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(this.chatHtml);
      return;
    }

    // ── API 鉴权 ──
    if (!this.authed(req)) {
      json(res, { error: 'unauthorized' }, 401);
      return;
    }

    // ── /brain/* 反代（engram 鉴权已过才注入 x-brain-token；放在 authed 之前
    //    等于公网裸奔 brain 管理端——proxyBrain 无条件注入口令头）──
    if (path === '/brain' || path.startsWith('/brain/')) {
      this.proxyBrain(req, res);
      return;
    }

    if (path === '/api/config' && req.method === 'GET') {
      json(res, {
        ok: true,
        userNick: this.cfg.userNick,
        proactive: this.cfg.proactive.enabled,
        brainMap: '/brain/',
      });
      return;
    }

    if (path === '/api/history' && req.method === 'GET') {
      json(res, { entries: this.history.recent(80) });
      return;
    }

    if (path === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      const client: SseClient = { res };
      this.sseClients.add(client);
      const heartbeat = setInterval(() => {
        try { res.write(': hb\n\n'); } catch { clearInterval(heartbeat); }
      }, 25_000);
      req.on('close', () => {
        clearInterval(heartbeat);
        this.sseClients.delete(client);
      });
      return;
    }

    if (path === '/api/chat' && req.method === 'POST') {
      let body = '';
      try { body = await readBody(req); } catch { json(res, { error: 'bad request' }, 400); return; }
      let text = '';
      try { text = String((JSON.parse(body) as { text?: string }).text ?? ''); }
      catch { json(res, { error: 'bad json' }, 400); return; }
      if (!text.trim()) { json(res, { error: 'empty text' }, 400); return; }
      try {
        const r: ChatReply = await this.loop.handleUserMessage(text);
        json(res, { reply: r.reply, usage: r.usage, hits: r.hits, degraded: r.degraded });
      } catch (e) {
        this.log(`chat 处理异常：${String(e)}`);
        json(res, { error: 'internal' }, 500);
      }
      return;
    }

    json(res, { error: 'not found' }, 404);
  }

  start(): string {
    this.server = createServer((req, res) => {
      this.route(req, res).catch((e) => {
        this.log(`route 异常：${String(e)}`);
        if (!res.headersSent) json(res, { error: 'internal' }, 500);
        else res.end();
      });
    });
    this.server.on('error', (e) => {
      this.log(`chat 服务启动失败（${this.cfg.http.host}:${this.cfg.http.port} ${String(e)}）`);
    });
    this.server.listen(this.cfg.http.port, this.cfg.http.host, () => {
      this.log(`chat 服务 http://${this.cfg.http.host}:${this.cfg.http.port}/`);
    });
    return `http://${this.cfg.http.host}:${this.cfg.http.port}/`;
  }

  stop(): void {
    for (const c of this.sseClients) { try { c.res.end(); } catch { /* ignore */ } }
    this.sseClients.clear();
    this.server?.close();
  }
}
