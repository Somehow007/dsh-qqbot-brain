// hash 路由：注册 '#/map'、'#/admin/:page' 等；未知 hash → '#/map'。
// 视图契约：{ mount(el, params), update?(), unmount?() }；params 由路由段解析。

const routes = []; // [{ test(hash)→params|null, view }]
let current = null; // { hash, params, view }
let rootEl = null;

/** 注册路由。pattern 形如 '#/map' 或 '#/admin/:page'（:xxx 段捕获进 params） */
export function register(pattern, view) {
  const segs = pattern.replace(/^#/, '').split('/').filter(Boolean);
  routes.push({
    segs,
    test(hash) {
      const parts = hash.replace(/^#/, '').split('/').filter(Boolean);
      if (parts.length !== segs.length) return null;
      const params = {};
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].startsWith(':')) params[segs[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (segs[i] !== parts[i]) return null;
      }
      return params;
    },
  });
  routes[routes.length - 1].view = view;
}

export function navigate(hash) {
  if (location.hash === hash) dispatch();
  else location.hash = hash;
}

export function currentHash() { return location.hash || '#/map'; }

/** 重挂当前路由（皮肤/人设切换后视图需要按新 ctx 重建） */
export function refresh() {
  if (!current || !rootEl) return;
  current.view.unmount?.();
  try {
    current.view.mount(rootEl, current.params);
  } catch (e) {
    console.error('[brain] view mount failed', e);
  }
}

export function start(el) {
  rootEl = el;
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

function dispatch() {
  const hash = currentHash();
  for (const r of routes) {
    const params = r.test(hash);
    if (params === null) continue;
    if (current?.view === r.view && current?.params?.page === params.page && current?.hash === hash) return;
    current?.view?.unmount?.();
    current = { hash, params, view: r.view };
    try {
      r.view.mount(rootEl, params);
    } catch (e) {
      console.error('[brain] view mount failed', e);
      rootEl.textContent = '';
      const d = document.createElement('div');
      d.className = 'route-error';
      d.textContent = `页面加载失败：${e instanceof Error ? e.message : e}`;
      rootEl.appendChild(d);
    }
    return;
  }
  // 未知路由 → 回默认
  if (hash !== '#/map') { location.replace('#/map'); return; }
  current?.view?.unmount?.();
  current = null;
  rootEl.textContent = '';
}

/** 当前路由名（顶栏高亮用）：'map' | 'admin' | 其他 */
export function section() {
  const h = currentHash();
  if (h.startsWith('#/admin')) return 'admin';
  return 'map';
}
