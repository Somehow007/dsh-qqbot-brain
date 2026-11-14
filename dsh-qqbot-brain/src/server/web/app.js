// 壳层引导：store 拉数 → 顶栏渲染 → 路由分发。
// 顶栏：品牌（查看人设）/ 脑图·管理导航 / 皮肤按钮 / 搜索 / 查看人设下拉 / 统计条。

import { api, legacyUrl } from './core/api.js';
import { store } from './core/store.js';
import { register, start as routerStart, navigate, refresh as routerRefresh, section } from './core/router.js';
import { SKIN_LABELS, SKIN_IDS, setSkinPref } from './core/theme.js';
import { el, toast, debounce } from './core/ui.js';
import { skinById } from './skins/index.js';
import { mapCtx, mapView, implementedSkin } from './views/map.js';

const $ = (id) => document.getElementById(id);

// ── 路由 ──
register('#/map', mapView);
// 管理端 P3 才有页面；迁移期所有 #/admin/* 与顶栏「管理」都跳旧页
const adminRedirect = { mount() { location.href = legacyUrl(); } };
register('#/admin', adminRedirect);
register('#/admin/:page', adminRedirect);

// ── 顶栏：品牌/导航 ──
function paintBrand() {
  const ctx = mapCtx();
  const t = ctx.theme;
  const avatar = $('tbAvatar');
  avatar.textContent = t.mono || '脑';
  avatar.style.background = `linear-gradient(135deg, ${t.a}, ${t.deep})`;
  $('tbPersona').textContent = t.name || '未选择人设';
  const active = store.personas?.personas?.find((p) => p.id === store.personas?.activeId);
  const isActive = ctx.persona && active && ctx.persona.id === active.id;
  $('tbSub').textContent = [t.characterId, isActive ? '当前人设' : ''].filter(Boolean).join(' · ');
  document.title = `${t.name || '脑图'} · Brain`;
}

function paintNav() {
  const sec = section();
  document.querySelectorAll('.tb-link[data-nav]').forEach((b) => {
    b.classList.toggle('active', b.dataset.nav === sec);
  });
}

// ── 顶栏：皮肤按钮 ──
function paintSkins() {
  const box = $('tbSkins');
  box.replaceChildren();
  const ctx = mapCtx();
  const active = implementedSkin(ctx);
  for (const id of SKIN_IDS) {
    const impl = skinById(id);
    const b = el('button', `tb-skin${impl && impl.id === active.id ? ' active' : ''}`, SKIN_LABELS[id] ?? id);
    b.type = 'button';
    if (!impl) {
      b.disabled = true;
      b.title = 'P2 上线';
    } else {
      b.onclick = () => {
        setSkinPref(ctx.charId, id);
        routerRefresh();
        paintSkins();
      };
    }
    box.appendChild(b);
  }
}

// ── 顶栏：查看人设下拉 ──
function paintPersonaSel() {
  const sel = $('tbPersonaSel');
  const list = store.personas?.personas ?? [];
  const cur = sel.value;
  sel.replaceChildren();
  for (const p of list) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${p.name}${p.id === store.personas?.activeId ? '（当前）' : ''}`;
    sel.appendChild(o);
  }
  sel.value = store.viewPersonaId && list.some((p) => p.id === store.viewPersonaId)
    ? store.viewPersonaId : (store.personas?.activeId ?? '');
  sel.disabled = !list.length;
  if (sel.value !== cur) paintBrand();
}

// ── 顶栏：统计条 ──
function paintStats() {
  const s = store.state;
  const st = $('tbStats');
  if (!s) { st.textContent = store.error ? `加载失败：${store.error}` : '加载中…'; return; }
  const stats = s.stats ?? {};
  const emo = s.emotion?.label ? ` · ${s.emotion.label}` : '';
  st.textContent = `记忆 ${stats.total ?? 0} · 均存 ${((stats.avgRetention ?? 0) * 100).toFixed(0)}% · 将忘 ${stats.fading ?? 0} · 关联 ${(s.edges ?? []).length} · SESS ${stats.sessions ?? 0} · OPS ${store.ops.length}${emo}`;
  if (store.error) st.title = `上次刷新失败：${store.error}`;
  else st.removeAttribute('title');
}

function paintEditing() {
  $('tbEditing').hidden = store.editing <= 0;
}

// ── 顶栏：搜索（唤起预览 → 高亮 + 下拉点选）──
const doSearch = debounce(async (q, sess) => {
  const hitsBox = $('tbHits');
  if (!q.trim()) { hitsBox.hidden = true; hitsBox.replaceChildren(); mapView.highlight?.([]); return; }
  try {
    const r = await api.get(`/query?q=${encodeURIComponent(q)}${sess ? `&session=${encodeURIComponent(sess)}` : ''}`);
    const hits = r.hits ?? [];
    hitsBox.replaceChildren();
    if (!hits.length) {
      hitsBox.appendChild(el('div', 'hits-empty', '没有命中记忆'));
    } else {
      hits.slice(0, 12).forEach((h) => {
        const b = el('button', 'hit');
        b.type = 'button';
        const t = document.createElement('span');
        t.textContent = h.content;
        const m = el('small', '', `R ${(h.retention * 100).toFixed(0)}% · ${h.sessionId || '全局'}`);
        b.append(t, m);
        b.onclick = () => { hitsBox.hidden = true; mapView.select?.(h.id); };
        hitsBox.appendChild(b);
      });
    }
    hitsBox.hidden = false;
    mapView.highlight?.(hits.map((h) => h.id));
  } catch (e) {
    toast(`搜索失败：${e instanceof Error ? e.message : e}`);
  }
}, 250);

function bindSearch() {
  const q = $('tbQuery');
  const sess = $('tbQSess');
  const paintSess = () => {
    const cur = sess.value;
    sess.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = '全部会话';
    sess.appendChild(all);
    for (const s of store.sessions) {
      const id = s.sessionId ?? s.id;
      if (!id) continue;
      const o = document.createElement('option');
      o.value = id;
      const short = id === 'manual' ? '全局' : (id.length > 10 ? `${id.slice(0, 8)}…` : id);
      o.textContent = s.domain ? `${short} ·${s.domain}` : short;
      sess.appendChild(o);
    }
    sess.value = cur;
  };
  paintSess();
  const fire = () => doSearch(q.value, sess.value);
  q.addEventListener('input', fire);
  sess.addEventListener('change', fire);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tb-search')) $('tbHits').hidden = true;
  });
  store.on((what) => { if (what === 'data') paintSess(); });
}

// ── 顶栏事件 ──
function bindTopbar() {
  $('tbBrand').onclick = () => navigate('#/map');
  document.querySelectorAll('.tb-link[data-nav]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.nav === 'admin') location.href = legacyUrl();
      else navigate('#/map');
    };
  });
  $('tbPersonaSel').addEventListener('change', (e) => {
    store.viewPersonaId = e.target.value;
    paintBrand();
    paintSkins();
    routerRefresh(); // 主题/皮肤可能随角色变化，重挂视图
    toast(`查看人设已切换（仅本页视角）`);
  });
}

// ── 启动 ──
function boot() {
  bindTopbar();
  bindSearch();
  routerStart($('view'));
  paintNav();
  paintBrand();

  let selApplied = false;
  store.on((what) => {
    if (what === 'data') {
      paintBrand(); paintNav(); paintSkins(); paintPersonaSel(); paintStats(); paintEditing();
      // ?sel=<id>：首屏数据到达后选中对应记忆
      if (!selApplied) {
        selApplied = true;
        const sel = new URLSearchParams(location.search).get('sel');
        if (sel) mapView.select?.(sel);
      }
    } else if (what === 'editing' || what === 'paused') {
      paintEditing();
    } else if (what === 'error') {
      paintStats();
    }
  });
  store.start();
}

boot();
