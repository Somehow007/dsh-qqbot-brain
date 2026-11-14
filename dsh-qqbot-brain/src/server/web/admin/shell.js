// D-admin 管理端壳：左导航（人设切换 + 七页入口）+ 页面分发 + 皮肤 token。
// 路由：#/admin → 概览；#/admin/<page> → 对应页。store 'data' 事件转发给当前页 update()。

import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { api } from '../core/api.js';
import { el, toast, confirmDialog } from '../core/ui.js';
import { adminCtx, applyTokens, runLeaveGuards, mutRefresh } from './common.js';
import { overviewPage } from './overview.js';
import { memoriesPage } from './memories.js';
import { personasPage } from './personas.js';
import { profilesPage } from './profiles.js';
import { opsPage } from './ops.js';
import { graphPage } from './graph.js';
import { backupPage } from './backup.js';

export const ADMIN_PAGES = [
  ['overview', '概览'],
  ['memories', '记忆库'],
  ['personas', '人设'],
  ['profiles', '画像'],
  ['ops', '事件流水'],
  ['graph', '关联图'],
  ['backup', '备份迁移'],
];
const PAGE_MAP = {
  overview: overviewPage, memories: memoriesPage, personas: personasPage,
  profiles: profilesPage, ops: opsPage, graph: graphPage, backup: backupPage,
};
const PAGE_NO = Object.fromEntries(ADMIN_PAGES.map(([id], i) => [id, String(i + 1).padStart(2, '0')]));

function buildNav(cur, ctx) {
  const nav = el('nav', 'adm-nav');
  const brand = el('div', 'nbrand', 'BRAIN INDEX');
  brand.appendChild(el('b', '', '管理端'));
  nav.appendChild(brand);

  // 当前人设块：色块 + 名称 + 激活切换下拉（展示/选中均以服务端 activeId 为准）
  const np = el('div', 'np');
  np.appendChild(el('div', 'lb', '当前人设 · ACTIVE PERSONA'));
  const activeId = store.personas?.activeId;
  const ap = ctx.personas.find((p) => p.id === activeId) ?? ctx.personas[0] ?? null;
  const who = el('div', 'who');
  const sw = el('i', 'sw');
  sw.style.background = ap?.meta?.theme?.a || ctx.theme.a;
  const whoTxt = el('div');
  whoTxt.appendChild(el('b', '', ap?.name || '未选择'));
  whoTxt.appendChild(el('small', '', `${ap?.characterId || ctx.charId || ''} · ${ap?.id || ''}`));
  who.append(sw, whoTxt);
  np.appendChild(who);
  const sel = document.createElement('select');
  sel.title = '切换激活人设（POST /api/personas/activate）';
  for (const p of ctx.personas) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${p.name}（${p.characterId || p.id}）${p.id === activeId ? ' ·当前' : ''}`;
    if (p.id === activeId) o.selected = true;
    sel.appendChild(o);
  }
  sel.disabled = !ctx.personas.length;
  sel.onchange = async () => {
    const id = sel.value;
    const p = ctx.personas.find((x) => x.id === id);
    if (!p || id === activeId) { paintPersonaPanel(); return; }
    if (!(await confirmDialog({
      title: '切换激活人设',
      body: `启用「${p.name}」？机器人之后的回复将使用这个人设。`,
      okText: '设为当前',
    }))) { paintPersonaPanel(); return; }
    try {
      await api.post('/personas/activate', { id });
      toast(`已切换为「${p.name}」`, 3000);
      mutRefresh();
    } catch (e) {
      toast(`切换失败：${e instanceof Error ? e.message : e}`);
      paintPersonaPanel();
    }
  };
  np.appendChild(sel);
  nav.appendChild(np);

  const nl = el('div', 'nl');
  for (const [id, cn] of ADMIN_PAGES) {
    const a = el('a', cur === id ? 'on' : '', '');
    const no = el('i', '', PAGE_NO[id]);
    a.append(no, document.createTextNode(cn));
    a.onclick = (e) => {
      e.preventDefault();
      if (!runLeaveGuards()) return;
      navigate(`#/admin/${id}`);
    };
    nl.appendChild(a);
  }
  nav.appendChild(nl);

  const foot = el('div', 'nfoot', 'BRAIN ADMIN\n七页管理台 · 数据走 /api/*');
  nav.appendChild(foot);
  return nav;
}

function paintPersonaPanel() {
  // 人设切换后 store.refresh → 'data' → 这里只更新色板/名称/下拉，避免整壳重建丢编辑态
  const np = document.querySelector('.adm-nav .np');
  if (!np) return;
  const ctx = adminCtx();
  const activeId = store.personas?.activeId;
  const ap = ctx.personas.find((p) => p.id === activeId) ?? ctx.personas[0] ?? null;
  const sw = np.querySelector('.sw');
  const b = np.querySelector('.who b');
  const small = np.querySelector('.who small');
  const sel = np.querySelector('select');
  if (sw) sw.style.background = ap?.meta?.theme?.a || ctx.theme.a;
  if (b) b.textContent = ap?.name || '未选择';
  if (small) small.textContent = `${ap?.characterId || ctx.charId || ''} · ${ap?.id || ''}`;
  if (sel) {
    [...sel.options].forEach((o) => {
      o.textContent = o.textContent.replace(/ ·当前$/, '');
      if (o.value === activeId) o.textContent += ' ·当前';
    });
    sel.value = activeId ?? sel.value;
  }
}

let lastRefreshAt = 0;
function paintRstat(host) {
  const r = host?.querySelector?.('.rstat') ?? document.querySelector('.adm .rstat');
  if (!r) return;
  const ed = store.editing > 0;
  r.classList.toggle('edit', ed);
  const t = lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—';
  r.textContent = ed ? '编辑中 · 自动刷新已暂停' : `自动刷新 15s · 上次 ${t}`;
}

export const adminView = {
  mount(root, params = {}) {
    this._root = root;
    const pageId = PAGE_MAP[params.page] ? params.page : 'overview';
    this._pageId = pageId;
    root.replaceChildren();

    const ctx = adminCtx();
    const adm = el('div', 'adm');
    applyTokens(adm, ctx);
    adm.appendChild(buildNav(pageId, ctx));

    const main = el('div', 'adm-main');
    const top = el('div', 'adm-top');
    const brand = el('div', 'brand', 'BRAIN');
    brand.appendChild(el('span', '', ' / ADMIN CONSOLE'));
    const sp = el('div', 'sp');
    const rstat = el('span', 'rstat');
    top.append(brand, sp, rstat);
    main.appendChild(top);

    const scroll = el('div', 'adm-scroll');
    const inner = el('div', 'adm-inner');
    scroll.appendChild(inner);
    main.appendChild(scroll);
    adm.appendChild(main);
    root.appendChild(adm);
    this._adm = adm;
    this._inner = inner;
    this._rstat = rstat;

    this._page = PAGE_MAP[pageId];
    try {
      this._page.mount(inner, adminCtx());
    } catch (e) {
      console.error('[admin] page mount failed', e);
      inner.textContent = '';
      inner.appendChild(el('div', 'route-error', `页面加载失败：${e instanceof Error ? e.message : e}`));
    }

    this._off = store.on((what) => {
      if (what === 'data') {
        lastRefreshAt = Date.now();
        this._page?.update?.(adminCtx());
        paintPersonaPanel();
        paintRstat(this._adm);
      } else if (what === 'editing' || what === 'paused') {
        paintRstat(this._adm);
      } else if (what === 'error') {
        paintRstat(this._adm);
      }
    });
    lastRefreshAt = Date.now();
    paintRstat(this._adm);
  },

  unmount() {
    this._off?.();
    this._off = null;
    try { this._page?.unmount?.(); } catch { /* 页面卸载异常不阻塞路由 */ }
    this._page = null;
    this._adm?.remove();
    this._adm = this._inner = this._rstat = this._root = null;
  },
};

export { paintPersonaPanel };
