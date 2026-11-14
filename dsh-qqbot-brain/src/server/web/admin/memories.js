// 记忆库页：B2 分页查询 + B4 批量 + 单条 CRUD + 放行队列。
// 数据走 GET /api/notes（服务端分页/筛选/排序），不复用 /api/state 全量。

import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { el, toast, debounce } from '../core/ui.js';
import {
  isSelfTrack, charOfNote, charName, charColor,
  sessLabel, KIND_LABEL,
  pager, pauseEditing, confirmDanger, pending, libHooks, mutRefresh,
} from './common.js';

// ── 页状态（模块级：路由切走再回来保留筛选/勾选）──
const F = {
  q: '', kind: '', track: '', char: '', persona: '', session: '',
  scope: '', status: '', sort: 'retention', dir: 'desc',
  page: 1, size: 20, sel: new Set(),
};
let LIST = { items: [], total: 0, page: 1, size: 20 };
let REL = [];          // 待放行候选（/api/release-candidates）
let REL_IDS = new Set();
let DRAFT = null;      // 抽屉草稿
let drawerOpen = false; // beginEdit/endEdit 配平标记
let batchbar = null;
let cleanPause = null;

const SORTS = [
  ['retention', '保持率'], ['age', '年龄'], ['importance', '重要度'], ['hits', '唤起次数'],
];
const SORT_SK = { retention: 'ret', importance: 'imp', hits: 'hits', age: 'age' };

function selOptions(list, cur) {
  const sel = document.createElement('select');
  for (const [v, t] of list) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (String(v) === String(cur)) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function fld(labelText, control) {
  const f = el('div', 'fld');
  f.appendChild(el('label', '', labelText));
  f.appendChild(control);
  return f;
}

async function load() {
  const params = new URLSearchParams({ page: String(F.page), size: String(F.size), sort: F.sort, dir: F.dir });
  if (F.q.trim()) params.set('q', F.q.trim());
  if (F.kind) params.set('kind', F.kind);
  if (F.track) params.set('track', F.track);
  if (F.char) params.set('char', F.char);
  if (F.persona) params.set('persona', F.persona);
  if (F.session) params.set('session', F.session);
  if (F.scope) params.set('scope', F.scope);
  if (F.status) params.set('status', F.status);
  try {
    LIST = await api.get(`/notes?${params}`);
  } catch (e) {
    toast(`加载失败：${e instanceof Error ? e.message : e}`);
    LIST = { items: [], total: 0, page: F.page, size: F.size };
  }
  renderBody();
  renderBatchbar();
}

async function loadRelease() {
  try {
    const r = await api.get('/release-candidates?limit=100');
    REL = r.candidates ?? [];
    REL_IDS = new Set(REL.map((c) => c.id));
  } catch { REL = []; REL_IDS = new Set(); }
}

function renderBody() {
  const body = document.getElementById('memBody');
  const pagerBox = document.getElementById('memPager');
  const count = document.getElementById('memCount');
  if (!body) return;
  body.replaceChildren();
  const items = LIST.items ?? [];
  if (!items.length) {
    const tr = document.createElement('tr');
    const td = el('td', 'empty', '无匹配记忆 —— 调整搜索或筛选条件，或点「新增记忆」。');
    td.colSpan = 9;
    tr.appendChild(td);
    body.appendChild(tr);
  }
  for (const n of items) body.appendChild(noteRow(n));
  if (count) count.textContent = `${LIST.total ?? 0} 条（服务端分页）`;
  if (pagerBox) {
    pager(pagerBox, {
      total: LIST.total ?? 0, page: LIST.page ?? F.page, size: LIST.size ?? F.size,
      onPage: (p) => { F.page = p; load(); },
    });
  }
  syncSortUI();
  syncHeadCheck();
}

function noteRow(n) {
  const self = isSelfTrack(n);
  const cid = charOfNote(n, store.personas?.personas ?? []);
  const rel = REL_IDS.has(n.id);
  const tr = el('tr', `data${n.fading ? ' fading' : ''}${F.sel.has(n.id) ? ' sel' : ''}`);
  tr.dataset.nid = n.id;

  const td0 = document.createElement('td');
  td0.style.width = '30px';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = F.sel.has(n.id);
  cb.onclick = (e) => { e.stopPropagation(); selToggle(n.id, cb.checked); };
  td0.appendChild(cb);
  tr.appendChild(td0);

  // 内容 + meta 行
  const td1 = document.createElement('td');
  td1.style.maxWidth = '340px';
  const txt = el('div', '', n.content ?? '');
  txt.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  txt.title = n.content ?? '';
  td1.appendChild(txt);
  const meta = el('div', '', `#${n.id} · ${sessLabel(n.sessionId)}${n.actor ? ` · ${n.actor}` : ''}`);
  meta.style.cssText = 'font:10px var(--mono);color:var(--ink3);margin-top:2px';
  td1.appendChild(meta);
  if (n.fading) td1.appendChild(el('span', 'tag fad', '将遗忘'));
  const sc = n.scope;
  if (sc && sc !== 'public') {
    td1.appendChild(el('span', 'tag priv', `${sc === n.sessionId ? '仅本会话' : `私域·${sc}`}${n.private === 'public' ? '（放行）' : ''}`));
  }
  if (rel) td1.appendChild(el('span', 'tag rel', '待放行'));
  tr.appendChild(td1);

  // 轨道
  const td2 = document.createElement('td');
  td2.style.whiteSpace = 'nowrap';
  const sq = el('span', 'sq');
  sq.style.background = self ? charColor(cid, store.personas?.personas ?? []) : '#0f0f0f';
  td2.appendChild(sq);
  td2.appendChild(document.createTextNode(self ? `自我·${charName(cid, store.personas?.personas ?? [])}` : '世界'));
  tr.appendChild(td2);

  tr.appendChild(el('td', '', KIND_LABEL[n.kind] ?? n.kind ?? '—'));

  // 保持率
  const td4 = document.createElement('td');
  td4.style.whiteSpace = 'nowrap';
  const rbar = el('span', 'rbar');
  const ri = document.createElement('i');
  ri.style.width = `${Math.max(2, (n.retention ?? 0) * 100)}%`;
  rbar.appendChild(ri);
  td4.appendChild(rbar);
  td4.appendChild(el('span', 'ret', `${Math.round((n.retention ?? 0) * 100)}%`));
  tr.appendChild(td4);

  tr.appendChild(el('td', 'num', String(n.importance ?? '—')));
  tr.appendChild(el('td', 'num', String(n.hits ?? 0)));
  tr.appendChild(el('td', 'num', `${n.ageDays ?? '—'}天`));

  // 操作
  const td9 = document.createElement('td');
  td9.style.whiteSpace = 'nowrap';
  if (rel) {
    const rb = el('button', 'act rel', '放行');
    rb.onclick = (e) => { e.stopPropagation(); releaseNote(n.id); };
    td9.appendChild(rb);
  }
  const eb = el('button', 'act', '编辑');
  eb.onclick = (e) => { e.stopPropagation(); openDrawer(n.id); };
  const ib = el('button', 'act re', '强化');
  ib.onclick = (e) => { e.stopPropagation(); reinforceNote(n.id); };
  const db = el('button', 'act del', '删除');
  db.onclick = (e) => { e.stopPropagation(); deleteNote(n.id); };
  td9.append(eb, ib, db);
  tr.appendChild(td9);

  tr.onclick = (e) => {
    if (e.target.closest('button,input,select,textarea,a')) return;
    openDrawer(n.id);
  };
  return tr;
}

function selToggle(id, on) {
  if (on) F.sel.add(id); else F.sel.delete(id);
  renderBatchbar();
  const tr = document.querySelector(`#memBody tr[data-nid="${CSS.escape(id)}"]`);
  tr?.classList.toggle('sel', on);
}

function syncHeadCheck() {
  const th = document.querySelector('#memHeadCheck');
  if (!th) return;
  const ids = (LIST.items ?? []).map((n) => n.id);
  th.checked = ids.length > 0 && ids.every((id) => F.sel.has(id));
}

function syncSortUI() {
  const dirBtn = document.getElementById('m-sortdir');
  if (dirBtn) dirBtn.textContent = F.dir === 'desc' ? '↓ 降序' : '↑ 升序';
  document.querySelectorAll('#memTable th[data-sk]').forEach((th) => {
    const on = SORT_SK[F.sort] === th.dataset.sk;
    th.classList.toggle('on', on);
    const s = th.querySelector('.sh');
    if (s) s.textContent = on ? (F.dir === 'desc' ? '↓' : '↑') : '⇅';
  });
}

function sortBy(sk) {
  const map = { ret: 'retention', imp: 'importance', hits: 'hits', age: 'age' };
  const key = map[sk];
  if (!key) return;
  if (F.sort === key) F.dir = F.dir === 'desc' ? 'asc' : 'desc';
  else { F.sort = key; F.dir = 'desc'; }
  F.page = 1;
  load();
}

// ── 行操作 ──
async function deleteNote(id) {
  const n = (LIST.items ?? []).find((x) => x.id === id);
  if (!(await confirmDanger({
    title: '删除记忆',
    body: `删除「${(n?.content ?? '').slice(0, 50)}${(n?.content ?? '').length > 50 ? '…' : ''}」？写入 del op，不可恢复，建议先备份。`,
    okText: '删除',
  }))) return;
  try {
    await api.del(`/notes/${encodeURIComponent(id)}`);
    F.sel.delete(id);
    toast('已删除', 2000);
    await load();
    loadRelease();
    mutRefresh();
  } catch (e) { toast(`删除失败：${e instanceof Error ? e.message : e}`); }
}

async function reinforceNote(id) {
  try {
    await api.post(`/notes/${encodeURIComponent(id)}/reinforce`);
    toast('已强化', 1500);
    load();
    mutRefresh();
  } catch (e) { toast(`强化失败：${e instanceof Error ? e.message : e}`); }
}

async function releaseNote(id) {
  try {
    await api.patch(`/notes/${encodeURIComponent(id)}`, { private: 'public' });
    toast('已放行至公开池', 2000);
    await load();
    loadRelease();
    mutRefresh();
  } catch (e) { toast(`放行失败：${e instanceof Error ? e.message : e}`); }
}

// ── 批量条 ──
function ensureBatchbar() {
  if (batchbar && batchbar.isConnected) return batchbar;
  const main = document.querySelector('.adm-main');
  if (!main) return null;
  batchbar = el('div', 'adm-batchbar');
  main.appendChild(batchbar);
  return batchbar;
}

function renderBatchbar() {
  const bar = ensureBatchbar();
  if (!bar) return;
  const n = F.sel.size;
  bar.classList.toggle('on', n > 0);
  if (!n) { bar.replaceChildren(); return; }
  bar.replaceChildren();
  bar.appendChild(el('b', '', `已选 ${n} 条`));

  const kindSel = selOptions(
    [['', '批量改类型…'], ['episodic', '情景'], ['semantic', '语义'], ['attitude', '态度']],
    '',
  );
  kindSel.id = 'bbKind';
  const impSel = selOptions(
    [['', '批量改重要度…'], ['1', '★'], ['2', '★★'], ['3', '★★★'], ['4', '★★★★'], ['5', '★★★★★']],
    '',
  );
  impSel.id = 'bbImp';
  const privSel = selOptions(
    [['', '批量改可见域…'], ['public', '公开'], ['__clear__', '清除覆盖（回派生）']],
    '',
  );
  privSel.id = 'bbPriv';
  const go = el('button', 'btn sm', '应用');
  go.id = 'bbGo';
  const del = el('button', 'btn sm danger', '批量删除');
  del.id = 'bbDel';
  const sp = el('span', 'sp');
  const clear = el('button', 'btn sm ghost', '取消选择');
  clear.id = 'bbClear';
  bar.append(kindSel, impSel, privSel, go, del, sp, clear);

  go.onclick = async () => {
    const patch = {};
    if (kindSel.value) patch.kind = kindSel.value;
    if (impSel.value) patch.importance = Number(impSel.value);
    if (privSel.value === 'public') patch.private = 'public';
    if (privSel.value === '__clear__') patch.private = '';
    if (!Object.keys(patch).length) { toast('先选择要应用的修改项', 2000); return; }
    const ids = [...F.sel];
    try {
      const r = await api.post('/notes/batch', { ids, patch });
      toast(`已应用到 ${r.affected ?? ids.length} 条`, 2500);
      F.sel.clear();
      await load();
      loadRelease();
      mutRefresh();
    } catch (e) { toast(`批量失败：${e instanceof Error ? e.message : e}`); }
  };
  del.onclick = async () => {
    const c = F.sel.size;
    if (!(await confirmDanger({
      title: '批量删除',
      body: `将删除 ${c} 条记忆，写入 del op，不可恢复。`,
      okText: '全部删除',
    }))) return;
    try {
      const r = await api.post('/notes/batch', { ids: [...F.sel], delete: true });
      toast(`已删除 ${r.affected ?? c} 条`, 2500);
      F.sel.clear();
      await load();
      loadRelease();
      mutRefresh();
    } catch (e) { toast(`批量删除失败：${e instanceof Error ? e.message : e}`); }
  };
  clear.onclick = () => { F.sel.clear(); renderBody(); renderBatchbar(); };
}

// ── 记忆抽屉 ──
function privToSel(priv) {
  if (priv == null || priv === '') return '';
  if (priv === 'public') return 'public';
  return priv; // 域名或会话 id 原样回填
}

function openDrawer(id) {
  const personas = store.personas?.personas ?? [];
  const src = id ? (LIST.items ?? []).find((x) => x.id === id) : null;
  // 所属角色只读展示：编辑=记忆推导值；新增=当前激活人设的 characterId
  const charId = src ? charOfNote(src, personas)
    : (personas.find((p) => p.id === store.personas?.activeId)?.characterId
      ?? personas[0]?.characterId ?? '');
  DRAFT = src ? {
    id: src.id, content: src.content ?? '', kind: src.kind ?? 'episodic',
    importance: src.importance ?? 3, sessionId: src.sessionId ?? 'manual',
    scopeSel: privToSel(src.private), self: src.self === true ? 'true' : src.self === false ? 'false' : '',
    actor: src.actor ?? '', charId, isNew: false,
  } : {
    id: null, content: '', kind: 'episodic', importance: 3,
    sessionId: 'manual', scopeSel: '', self: '', actor: '', charId, isNew: true,
  };
  renderDrawer();
  document.querySelector('.adm-scrim')?.classList.add('on');
  document.querySelector('.adm-drawer')?.classList.add('on');
  if (!drawerOpen) { drawerOpen = true; store.beginEdit(); }
}

function closeDrawer(force) {
  if (DRAFT?.isNew && (DRAFT.content ?? '').trim() && !force
    && !window.confirm('放弃未保存的内容？')) return;
  const wasOpen = drawerOpen;
  DRAFT = null;
  drawerOpen = false;
  document.querySelector('.adm-scrim')?.classList.remove('on');
  document.querySelector('.adm-drawer')?.classList.remove('on');
  if (wasOpen) store.endEdit();
}

function ensureDrawer() {
  const adm = document.querySelector('.adm');
  if (!adm) return { drawer: null, scrim: null };
  let scrim = adm.querySelector('.adm-scrim');
  let drawer = adm.querySelector('.adm-drawer');
  if (!scrim) {
    scrim = el('div', 'adm-scrim');
    scrim.onclick = () => closeDrawer();
    adm.appendChild(scrim);
  }
  if (!drawer) {
    drawer = el('aside', 'adm-drawer');
    drawer.innerHTML = '';
    const head = el('div', 'dhead');
    head.appendChild(el('h2', '', ''));
    head.dataset.role = 'title';
    const x = el('button', 'x', '×');
    x.type = 'button';
    x.onclick = () => closeDrawer();
    head.appendChild(x);
    const body = el('div', 'dbody');
    body.dataset.role = 'body';
    const foot = el('div', 'dfoot');
    foot.dataset.role = 'foot';
    drawer.append(head, body, foot);
    adm.appendChild(drawer);
  }
  return { drawer, scrim };
}

function renderDrawer() {
  const { drawer } = ensureDrawer();
  if (!drawer || !DRAFT) return;
  const d = DRAFT;
  const editing = !d.isNew;
  drawer.querySelector('[data-role=title]').textContent = editing ? '编辑记忆' : '新增记忆';
  const body = drawer.querySelector('[data-role=body]');
  const foot = drawer.querySelector('[data-role=foot]');
  body.replaceChildren();
  foot.replaceChildren();

  const selfTrack = d.kind === 'attitude' || d.self === 'true';
  const personas = store.personas?.personas ?? [];
  const sessions = store.sessions ?? [];
  const domains = [...new Set(sessions.map((s) => s.domain).filter(Boolean))];

  // 内容
  const f1 = el('div', 'fld');
  f1.appendChild(el('label', '', '内容 content *（≤200 字，服务端截断）'));
  const ta = document.createElement('textarea');
  ta.id = 'd-content'; ta.rows = 4; ta.maxLength = 200;
  ta.placeholder = '一句话事实/事件…';
  ta.value = d.content;
  ta.oninput = () => {
    d.content = ta.value;
    cnt.textContent = `${ta.value.length}/200`;
    cnt.classList.toggle('over', ta.value.length > 200);
  };
  const cnt = el('div', 'counter', `${(d.content ?? '').length}/200`);
  f1.append(ta, cnt);
  body.appendChild(f1);

  // 类型 + 重要度
  const frow1 = el('div', 'frow');
  const fk = el('div', 'fld');
  fk.appendChild(el('label', '', '类型 kind'));
  const ksel = document.createElement('select');
  ksel.id = 'd-kind';
  for (const k of ['episodic', 'semantic', 'attitude']) {
    const o = document.createElement('option');
    o.value = k; o.textContent = `${KIND_LABEL[k]}（${k}）`;
    if (d.kind === k) o.selected = true;
    ksel.appendChild(o);
  }
  ksel.onchange = () => { d.kind = ksel.value; if (d.kind === 'attitude') d.self = ''; renderDrawer(); };
  fk.appendChild(ksel);
  const fi = el('div', 'fld');
  fi.appendChild(el('label', '', '重要度 importance 1-5'));
  const isel = document.createElement('select');
  isel.id = 'd-imp';
  for (let i = 1; i <= 5; i++) {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = String(i);
    if (d.importance === i) o.selected = true;
    isel.appendChild(o);
  }
  isel.onchange = () => { d.importance = Number(isel.value); };
  fi.appendChild(isel);
  frow1.append(fk, fi);
  body.appendChild(frow1);

  // 会话 + 可见域
  const frow2 = el('div', 'frow');
  const fs = el('div', 'fld');
  fs.appendChild(el('label', '', '归属会话 sessionId'));
  const ssel = document.createElement('select');
  ssel.id = 'd-sess';
  const sids = [...new Set([...(sessions.map((s) => s.sessionId ?? s.id).filter(Boolean)), d.sessionId, 'manual'])];
  for (const sid of sids) {
    const o = document.createElement('option');
    o.value = sid; o.textContent = sessLabel(sid, sessions);
    if (d.sessionId === sid) o.selected = true;
    ssel.appendChild(o);
  }
  ssel.onchange = () => { d.sessionId = ssel.value; };
  // PATCH 白名单不含 sessionId/actor：编辑态只读展示（后端不支持改挂）
  if (editing) ssel.disabled = true;
  fs.appendChild(ssel);
  fs.appendChild(el('div', 'hint', editing ? '会话归属不可改（PATCH 白名单）' : "缺省 'manual'（全局）"));
  const fp = el('div', 'fld');
  fp.appendChild(el('label', '', '可见域 private / scope'));
  const psel = document.createElement('select');
  psel.id = 'd-scope';
  const pOpts = [
    ['', '派生（按会话域）'], ['public', '公开 · 强制放行'],
    ...domains.map((dm) => [dm, `私域 · ${dm}`]),
    ['__sess__', '仅本会话（原地私密）'],
  ];
  for (const [v, t] of pOpts) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    const cur = d.scopeSel === '__sess__' ? '__sess__' : d.scopeSel;
    if (cur === v || (v === '' && !d.scopeSel)) o.selected = true;
    psel.appendChild(o);
  }
  psel.onchange = () => { d.scopeSel = psel.value; };
  fp.appendChild(psel);
  fp.appendChild(el('div', 'hint', "scope = private ?? 会话域；'' 清除回派生"));
  frow2.append(fs, fp);
  body.appendChild(frow2);

  // self 三态 + 所属角色（只读：后端不支持改挂）
  const frow3 = el('div', 'frow');
  const fself = el('div', 'fld');
  fself.appendChild(el('label', '', '轨道 self（三态）'));
  const selfSel = document.createElement('select');
  selfSel.id = 'd-self';
  selfSel.disabled = d.kind === 'attitude';
  for (const [v, t] of [['', '派生（启发式判定）'], ['true', '自我轨 self=true'], ['false', '世界轨 self=false']]) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (d.self === v) o.selected = true;
    selfSel.appendChild(o);
  }
  selfSel.onchange = () => { d.self = selfSel.value; if (d.self === 'true' && !d.characterId) d.characterId = undefined; renderDrawer(); };
  fself.appendChild(selfSel);
  if (d.kind === 'attitude') fself.appendChild(el('div', 'hint', 'attitude 恒走自我轨，不写 self'));
  const fchar = el('div', 'fld');
  fchar.appendChild(el('label', '', '所属角色 characterId'));
  const cIn = document.createElement('input');
  cIn.value = d.charId ? `${charName(d.charId, personas)}（${d.charId}）` : '—';
  cIn.disabled = true;
  cIn.placeholder = '由人设/启发式决定';
  fchar.appendChild(cIn);
  fchar.appendChild(el('div', 'hint', '自我轨按角色隔离；角色归属由写入人设决定，不可手改'));
  frow3.append(fself, fchar);
  body.appendChild(frow3);

  // 发言人
  const fa = el('div', 'fld');
  fa.appendChild(el('label', '', '发言人 actor（可选）'));
  const ain = document.createElement('input');
  ain.id = 'd-actor'; ain.value = d.actor ?? '';
  ain.placeholder = '群聊中的用户标识';
  ain.onchange = () => { d.actor = ain.value; };
  if (editing) { ain.disabled = true; ain.value = d.actor ?? ''; }
  fa.appendChild(ain);
  if (editing) fa.appendChild(el('div', 'hint', '发言人不可改（PATCH 白名单）'));
  body.appendChild(fa);

  // 底部按钮
  foot.replaceChildren();
  const cancel = el('button', 'btn ghost', '取消');
  cancel.type = 'button';
  cancel.onclick = () => closeDrawer();
  const sp = el('span', 'sp');
  foot.appendChild(cancel);
  if (editing) {
    const del = el('button', 'btn danger', '删除');
    del.type = 'button';
    del.onclick = () => { closeDrawer(true); deleteNote(d.id); };
    foot.appendChild(del);
  }
  foot.appendChild(sp);
  const save = el('button', 'btn pri', editing ? '保存修改' : '写入记忆');
  save.type = 'button';
  save.onclick = () => saveNote();
  foot.appendChild(save);
}

async function saveNote() {
  const d = DRAFT;
  if (!d) return;
  const content = (d.content ?? '').trim();
  if (!content) { toast('content 不能为空', 2500); document.getElementById('d-content')?.focus(); return; }
  const patch = {
    content: content.slice(0, 200),
    importance: Math.min(5, Math.max(1, Math.round(d.importance || 3))),
    kind: ['episodic', 'semantic', 'attitude'].includes(d.kind) ? d.kind : 'episodic',
  };
  const self = patch.kind === 'attitude' ? undefined : (d.self === 'true' ? true : d.self === 'false' ? false : null);
  const priv = d.scopeSel === '' ? '' : (d.scopeSel === '__sess__' ? d.sessionId : d.scopeSel);
  const actor = (d.actor ?? '').trim() || undefined;
  try {
    if (d.id) {
      // PATCH 白名单：content/importance/kind/private/self（sessionId/actor 不支持改挂）
      // self：true/false 标轨，null 显式清除回派生，undefined（attitude）不下发
      const body = { ...patch, self, private: priv };
      await api.patch(`/notes/${encodeURIComponent(d.id)}`, body);
      toast('已保存', 2000);
    } else {
      const body = { ...patch, sessionId: d.sessionId || 'manual' };
      if (self !== undefined && self !== null) body.self = self;
      if (priv) body.private = priv;
      if (actor) body.actor = actor;
      await api.post('/notes', body);
      toast('已写入', 2000);
    }
    closeDrawer(true);
    await load();
    loadRelease();
    mutRefresh();
  } catch (e) {
    toast(`保存失败：${e instanceof Error ? e.message : e}`);
  }
}

// ── 页装配 ──
function buildToolbar(ctx) {
  const bar = el('div', 'toolbar');
  const q = document.createElement('input');
  q.type = 'search'; q.className = 'q'; q.placeholder = '内容关键词…';
  q.value = F.q;
  q.oninput = debounce(() => { F.q = q.value; F.page = 1; load(); }, 350);
  bar.appendChild(fld('搜索', q));

  const kind = selOptions([['', '全部类型'], ['episodic', '情景'], ['semantic', '语义'], ['attitude', '态度']], F.kind);
  kind.onchange = () => { F.kind = kind.value; F.page = 1; load(); };
  bar.appendChild(fld('类型', kind));

  const track = selOptions([['', '全部轨道'], ['world', '世界轨 · 共享'], ['self', '自我轨 · 仅同角色']], F.track);
  track.onchange = () => { F.track = track.value; F.page = 1; load(); };
  bar.appendChild(fld('轨道', track));

  const chars = [...new Set((ctx.personas ?? []).map((p) => p.characterId).filter(Boolean))];
  const char = selOptions([['', '全部角色'], ...chars.map((c) => [c, charName(c, ctx.personas)])], F.char);
  char.onchange = () => { F.char = char.value; F.page = 1; load(); };
  bar.appendChild(fld('角色', char));

  const pers = (ctx.personas ?? []).map((p) => [p.id, p.name]);
  const persona = selOptions([['', '全部人设'], ...pers], F.persona);
  persona.onchange = () => { F.persona = persona.value; F.page = 1; load(); };
  bar.appendChild(fld('人设', persona));

  const sess = selOptions(
    [['', '全部会话'], ...(ctx.sessions ?? []).map((s) => [s.sessionId ?? s.id, sessLabel(s.sessionId ?? s.id, ctx.sessions)])],
    F.session,
  );
  sess.onchange = () => { F.session = sess.value; F.page = 1; load(); };
  bar.appendChild(fld('会话', sess));

  const scope = selOptions([['', '全部可见域'], ['priv', '仅私域'], ['pub', '仅公开'], ['release', '域内待放行']], F.scope);
  scope.onchange = () => { F.scope = scope.value; F.page = 1; load(); };
  bar.appendChild(fld('可见域', scope));

  const status = selOptions([['', '全部状态'], ['fading', '将遗忘'], ['fresh', '鲜活']], F.status);
  status.onchange = () => { F.status = status.value; F.page = 1; load(); };
  bar.appendChild(fld('状态', status));

  const sort = el('div');
  sort.style.display = 'flex'; sort.style.gap = '6px';
  const sortSel = selOptions(SORTS, F.sort);
  sortSel.onchange = () => { F.sort = sortSel.value; F.dir = 'desc'; F.page = 1; load(); };
  const dirBtn = el('button', 'btn sm', F.dir === 'desc' ? '↓ 降序' : '↑ 升序');
  dirBtn.id = 'm-sortdir'; dirBtn.type = 'button'; dirBtn.title = '切换升序 / 降序';
  dirBtn.onclick = () => { F.dir = F.dir === 'desc' ? 'asc' : 'desc'; F.page = 1; load(); };
  sort.append(sortSel, dirBtn);
  bar.appendChild(fld('排序', sort));

  const sizeSel = selOptions([[20, '20 条'], [50, '50 条'], [100, '100 条']], F.size);
  sizeSel.onchange = () => { F.size = Number(sizeSel.value); F.page = 1; load(); };
  bar.appendChild(fld('每页', sizeSel));
  return bar;
}

function buildRelStrip() {
  if (!REL.length) return null;
  const strip = el('div', 'relstrip');
  strip.appendChild(el('b', '', `域内待放行 ${REL.length} 条`));
  strip.appendChild(el('span', '', '良性事实排队人工放行（私密线索词命中的不入队）：'));
  for (const c of REL.slice(0, 6)) {
    const chip = el('span', 'rc', `${c.content ?? ''}`);
    chip.title = c.content ?? '';
    const btn = el('button', 'act rel', '放行');
    btn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await api.patch(`/notes/${encodeURIComponent(c.id)}`, { private: 'public' });
        toast('已放行', 1500);
        loadRelease(); load(); mutRefresh();
      } catch (err) { toast(`放行失败：${err instanceof Error ? err.message : err}`); }
    };
    chip.appendChild(btn);
    strip.appendChild(chip);
  }
  if (REL.length > 6) strip.appendChild(el('span', '', `等 ${REL.length} 条`));
  strip.appendChild(el('span', 'hint', '逐条放行，或在记忆库中按「仅私域」筛选处理'));
  return strip;
}

function flashNote(id) {
  const tr = document.querySelector(`#memBody tr[data-nid="${CSS.escape(id)}"]`);
  if (tr) {
    tr.classList.add('flash');
    tr.scrollIntoView({ block: 'center' });
    setTimeout(() => tr.classList.remove('flash'), 1700);
    return true;
  }
  return false;
}

export const memoriesPage = {
  mount(root, ctx) {
    this._root = root;
    this._ctx = ctx;
    root.replaceChildren();

    const head = el('div');
    head.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:4px';
    const addBtn = el('button', 'btn pri', '＋ 新增记忆');
    addBtn.type = 'button';
    addBtn.onclick = () => openDrawer(null);
    head.appendChild(addBtn);
    root.appendChild(head);

    this._relStripHost = el('div');
    root.appendChild(this._relStripHost);

    root.appendChild(buildToolbar(ctx));

    const table = document.createElement('table');
    table.id = 'memTable';
    table.style.marginTop = '6px';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const mkTh = (text, sk = '', num = false) => {
      const th = document.createElement('th');
      if (num) th.className = 'num';
      if (sk) {
        th.dataset.sk = sk;
        th.style.cursor = 'pointer';
        th.title = '点击排序';
        th.onclick = () => sortBy(sk);
        th.append(text + ' ');
        th.appendChild(el('span', 'sh', '⇅'));
      } else th.textContent = text;
      return th;
    };
    const th0 = document.createElement('th');
    th0.style.width = '30px';
    const headCb = document.createElement('input');
    headCb.type = 'checkbox';
    headCb.id = 'memHeadCheck';
    headCb.onclick = () => {
      const on = headCb.checked;
      for (const n of LIST.items ?? []) selToggle(n.id, on);
      renderBody(); renderBatchbar();
    };
    th0.appendChild(headCb);
    hr.append(th0,
      mkTh('内容'), mkTh('轨道'), mkTh('类型'),
      mkTh('保持率', 'ret'), mkTh('重要', 'imp', true), mkTh('唤起', 'hits', true), mkTh('年龄', 'age', true),
      mkTh('操作'));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    tbody.id = 'memBody';
    table.appendChild(tbody);
    root.appendChild(table);

    const count = el('div', '', '');
    count.id = 'memCount';
    count.style.cssText = 'font:11px var(--mono);color:var(--ink3);margin-top:10px';
    root.appendChild(count);
    const pg = el('div', '');
    pg.id = 'memPager';
    root.appendChild(pg);

    // 编辑暂停：工具栏/表单焦点
    cleanPause = pauseEditing(root);
    // 跨页定位钩子
    libHooks.focusNote = (id) => {
      if (!id) return;
      // 不在当前页结果中 → 清筛选重查第一页再闪
      if (!flashNote(id)) {
        F.q = ''; F.kind = ''; F.track = ''; F.char = ''; F.persona = '';
        F.session = ''; F.scope = ''; F.status = ''; F.page = 1;
        load().then(() => setTimeout(() => flashNote(id), 60));
      }
    };

    // 首屏：若有 pending note（从流水/概览/关联图跳入）→ 清筛选定位
    if (pending.noteId) {
      const id = pending.noteId;
      pending.noteId = null;
      F.q = ''; F.kind = ''; F.track = ''; F.char = ''; F.persona = '';
      F.session = ''; F.scope = ''; F.status = ''; F.page = 1; F.sel.clear();
      load().then(() => setTimeout(() => flashNote(id), 60));
    } else {
      load();
    }
    loadRelease().then(() => { if (this._root) this.renderRelStrip(); });
    ensureDrawer();
  },

  renderRelStrip() {
    if (!this._relStripHost) return;
    const strip = buildRelStrip();
    this._relStripHost.replaceChildren(...(strip ? [strip] : []));
  },

  update() {
    // store 'data' 到达：若非编辑态刷新当前页数据（编辑中 store 本就不 emit data）
    if (store.editing === 0) load();
  },

  unmount() {
    cleanPause?.(); cleanPause = null;
    libHooks.focusNote = null;
    closeDrawer(true);
    batchbar?.remove(); batchbar = null;
    this._root = null;
    this._relStripHost = null;
  },
};
