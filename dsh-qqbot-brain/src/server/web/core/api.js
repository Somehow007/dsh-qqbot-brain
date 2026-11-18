// API 客户端：/api/* 一律带 x-brain-token 头；/web/* 静态文件服务端免口令。
// 口令来源与旧页一致：?token= > sessionStorage('brain-token')；首跳 query 读入后立即从地址栏抹掉。

const qs = new URLSearchParams(location.search);
export const TOKEN = qs.get('token') || sessionStorage.getItem('brain-token') || '';
if (TOKEN) sessionStorage.setItem('brain-token', TOKEN);
if (qs.has('token')) {
  qs.delete('token');
  history.replaceState(null, '', location.pathname + (qs.toString() ? `?${qs}` : '') + location.hash);
}

// 前缀 = 页面路径去尾斜杠（/brain；自起端口与宿主挂载同口径）
export const PREFIX = location.pathname.replace(/\/$/, '');
export const API = `${PREFIX}/api`;

export class ApiError extends Error {
  constructor(status, body) {
    super(body || `HTTP ${status}`);
    this.status = status;
  }
}

/**
 * 统一请求。opts 同 fetch；返回解析后的 JSON（非 JSON 返回文本）。
 * !ok 抛 ApiError（status + 响应文本）。
 */
export async function fapi(path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  if (TOKEN) headers['x-brain-token'] = TOKEN;
  const r = await fetch(`${API}${path}`, { ...opts, headers });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new ApiError(r.status, text || `HTTP ${r.status}`);
  }
  const ct = r.headers.get('content-type') ?? '';
  return ct.includes('json') ? r.json() : r.text();
}

const json = (method) => (path, body) =>
  fapi(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const api = {
  get: (path) => fapi(path),
  post: json('POST'),
  patch: json('PATCH'),
  del: (path) => fapi(path, { method: 'DELETE' }),
};

/** 跳旧单文件页（迁移期管理端/未迁移功能的落点；P4 移除） */
export function legacyUrl() {
  const u = new URL(location.href);
  u.searchParams.set('ui', 'legacy');
  u.hash = '';
  return `${u.pathname}${u.search}`;
}
