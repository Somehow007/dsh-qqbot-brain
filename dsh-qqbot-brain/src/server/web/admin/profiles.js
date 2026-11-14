// 画像页：人物（u:）/会话（sess:）画像卡 —— 编辑 / 合并 / 重生成 / 删除，
// 外加会话私域标记维护（POST /api/sessions/domain）。
// 数据源 store.profiles（/api/profiles 轮询）；写操作后 mutRefresh()。

import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { el, toast, fmtT, confirmDialog } from '../core/ui.js';
import { pager, sessIdOf, sessLabel, confirmDanger, pauseEditing, mutRefresh } from './common.js';

const P = { page: 1, size: 12, editing: null, merge: null };
let ROOT = null;
let CTX = null;
let cleanPause = null;

const PRIVATE_RE = /〔私〕[^。\n]*(?:。|\n|$)/g;
const privSegCount = (text) => (String(text ?? '').match(PRIVATE_RE) ?? []).length;

/** 画像文本渲染：〔私〕…句 高亮（DOM 构造，不用 innerHTML） */
function renderProfileText(host, text) {
  host.replaceChildren();
  const s = String(text ?? '');
  let last = 0;
  for (const m of s.matchAll(PRIVATE_RE)) {
    if (m.index > last) host.appendChild(document.createTextNode(s.slice(last, m.index)));
    host.appendChild(el('mark', '', m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) host.appendChild(document.createTextNode(s.slice(last)));
}

function rerender() { render(); }

function card(p) {
  const sessions = CTX?.sessions ?? [];
  const isEdit = P.editing === p.key;
  const canMerge = p.kind === 'person';
  const merging = P.merge === p.key;
  const mergeKeep = P.merge ? (store.profiles ?? []).find((x) => x.key === P.merge) : null;
  const cardEl = el('div', `pcard${isEdit ? ' editing' : ''}`);

  const ph = el('div', 'ph');
  ph.appendChild(el('span', `badge ${p.kind === 'person' ? 'self' : 'world'}`, p.kind === 'person' ? '人物' : '会话'));
  ph.appendChild(el('b', '', p.name || '(未命名)'));
  const privN = privSegCount(p.text);
  if (privN) ph.appendChild(el('small', '', `含 ${privN} 私域句`));
  cardEl.appendChild(ph);
  cardEl.appendChild(el('div', 'pk', p.key));

  if (isEdit) {
    const nm = document.createElement('input');
    nm.className = 'pn'; nm.maxLength = 80;
    nm.placeholder = p.kind === 'person' ? '画像名称' : '发言人绑定昵称（私聊会话→人）';
    nm.value = p.name ?? '';
    nm.dataset.role = 'name';
    const ta = document.createElement('textarea');
    ta.maxLength = 500;
    ta.value = p.text ?? '';
    ta.dataset.role = 'text';
    const cnt = el('div', '', `${(p.text ?? '').length}/500 · 「〔私〕」句=私域，仅私域会话注入`);
    cnt.style.cssText = 'font:10px var(--mono);color:var(--ink3);text-align:right';
    ta.oninput = () => { cnt.textContent = `${ta.value.length}/500 · 「〔私〕」句=私域，仅私域会话注入`; };
    cardEl.append(nm, ta, cnt);
  } else {
    const pt = el('div', 'pt');
    renderProfileText(pt, p.text);
    cardEl.appendChild(pt);
  }

  const ps = el('div', 'ps');
  const sessList = p.sessions ?? [];
  for (const sid of sessList.slice(0, 4)) ps.appendChild(el('span', '', sessLabel(sid, sessions)));
  if (sessList.length > 4) ps.appendChild(el('span', '', `+${sessList.length - 4}`));
  cardEl.appendChild(ps);
  cardEl.appendChild(el('div', 'pk', `更新 ${fmtT(p.updatedAt)}`));

  const pa = el('div', 'pa');
  if (isEdit) {
    const save = el('button', 'act', '保存');
    save.onclick = () => saveProfile(p.key, cardEl);
    const cancel = el('button', 'act', '取消');
    cancel.onclick = () => { P.editing = null; rerender(); };
    pa.append(save, cancel);
  } else {
    const edit = el('button', 'act', '编辑');
    edit.onclick = () => { P.editing = p.key; P.merge = null; rerender(); };
    const regen = el('button', 'act', '重生成');
    regen.onclick = () => regenProfile(p.key, regen);
    const del = el('button', 'act del', '删除');
    del.onclick = () => delProfile(p);
    pa.append(edit, regen, del);
    if (canMerge) {
      if (merging) {
        const mb = el('button', 'act', '合并中…');
        mb.disabled = true;
        pa.appendChild(mb);
      } else if (mergeKeep && mergeKeep.key !== p.key) {
        const mb = el('button', 'act rel', `并入「${mergeKeep.name || mergeKeep.key}」`);
        mb.onclick = () => mergeInto(p.key);
        pa.appendChild(mb);
      } else {
        const mb = el('button', 'act', '合并…');
        mb.onclick = () => { P.merge = p.key; rerender(); };
        pa.appendChild(mb);
      }
    } else {
      pa.appendChild(el('span', 'tag', '会话卡不可合并'));
    }
  }
  cardEl.appendChild(pa);
  return cardEl;
}

async function saveProfile(key, cardEl) {
  const ta = cardEl.querySelector('[data-role=text]');
  const nm = cardEl.querySelector('[data-role=name]');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) { toast('画像文本不能为空', 2500); return; }
  try {
    const r = await api.patch('/profiles', { key, name: (nm?.value ?? '').trim(), text: text.slice(0, 500) });
    if (r?.profiles) store.profiles = r.profiles;
    P.editing = null;
    toast('已保存', 2000);
    mutRefresh();
  } catch (e) { toast(`保存失败：${e instanceof Error ? e.message : e}`); }
}

async function delProfile(p) {
  if (!(await confirmDanger({
    title: '删除画像',
    body: `删除「${p.name || p.key}」的画像卡？`,
    okText: '删除',
  }))) return;
  try {
    const r = await api.del(`/profiles?id=${encodeURIComponent(p.key)}`);
    if (r?.profiles) store.profiles = r.profiles;
    toast('已删除', 2000);
    mutRefresh();
  } catch (e) { toast(`删除失败：${e instanceof Error ? e.message : e}`); }
}

async function regenProfile(key, btn) {
  if (!(await confirmDialog({
    title: '重生成画像',
    body: `将对「${key}」重新蒸馏 + 审核（LLM 调用，需数秒）。失败或无稳定内容时不改数据。`,
    okText: '重生成',
  }))) return;
  if (btn) btn.disabled = true;
  toast('重生成中（蒸馏起草 → 审核把关）…', 3000);
  try {
    const r = await api.post('/profiles/regenerate', { key });
    if (r?.profiles) store.profiles = r.profiles;
    toast('已重新生成', 2500);
    mutRefresh();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast(`重生成失败：${msg.slice(0, 120)}`, 4000);
    if (btn) btn.disabled = false;
  }
}

async function mergeInto(dropKey) {
  const keepKey = P.merge;
  if (!keepKey || keepKey === dropKey) return;
  const keep = (store.profiles ?? []).find((p) => p.key === keepKey);
  const drop = (store.profiles ?? []).find((p) => p.key === dropKey);
  if (!keep || !drop) return;
  if (!(await confirmDialog({
    title: '合并画像',
    body: `把「${drop.name || drop.key}」并入「${keep.name || keep.key}」？审核模型将合并文本、吸收会话标记，drop 卡删除。`,
    okText: '合并',
  }))) return;
  try {
    const r = await api.post('/profiles/merge', { keep: keepKey, drop: dropKey });
    if (r?.profiles) store.profiles = r.profiles;
    P.merge = null;
    toast('已合并', 2500);
    mutRefresh();
  } catch (e) {
    toast(`合并失败（409=审核未通过）：${e instanceof Error ? e.message : e}`, 4000);
  }
}

// ── 会话私域标记 ──
function sessionDomainRow(s, domains) {
  const row = el('div', 'sessdom');
  const sidText = sessIdOf(s);
  const sid = el('span', 'sid', `${sessLabel(sidText, store.sessions)} · ${sidText}`);
  sid.title = sidText;
  row.appendChild(sid);
  const inp = document.createElement('input');
  inp.value = s.domain ?? '';
  inp.placeholder = '域名（空=公开）';
  const dl = document.createElement('datalist');
  dl.id = `dl-${sidText.replace(/[^\w-]/g, '_')}`;
  for (const d of domains) {
    const o = document.createElement('option');
    o.value = d;
    dl.appendChild(o);
  }
  inp.setAttribute('list', dl.id);
  const save = el('button', 'btn sm ghost', '设');
  save.onclick = async () => {
    try {
      const r = await api.post('/sessions/domain', { sessionId: sidText, domain: inp.value.trim() });
      if (r?.sessions) { store.sessions = r.sessions; if (CTX) CTX.sessions = r.sessions; }
      toast('已更新会话域', 1500);
      mutRefresh();
    } catch (e) { toast(`失败：${e instanceof Error ? e.message : e}`); }
  };
  row.append(inp, dl, save);
  return row;
}

function render() {
  if (!ROOT) return;
  ROOT.replaceChildren();
  const sessions = CTX?.sessions ?? [];

  const head = el('div', 'phead');
  head.appendChild(el('span', 'no', '04'));
  head.appendChild(el('h1', '', '画像'));
  const sub = el('div', 'sub');
  sub.append('Profiles', document.createElement('br'), '按人（u:）+ 会话级（sess:）画像卡');
  head.appendChild(sub);
  ROOT.appendChild(head);

  const all = store.profiles ?? [];
  const mergeKeep = P.merge ? all.find((p) => p.key === P.merge) : null;
  if (mergeKeep) {
    const banner = el('div', 'mergebanner');
    banner.appendChild(el('span', '', `正在选择要并入「${mergeKeep.name || mergeKeep.key}」的画像 —— 点击另一张人物画像卡的「并入」`));
    const cancel = el('button', 'btn sm ghost', '取消');
    cancel.onclick = () => { P.merge = null; rerender(); };
    banner.appendChild(cancel);
    ROOT.appendChild(banner);
  }

  const size = P.size;
  const pages = Math.max(1, Math.ceil(all.length / size));
  P.page = Math.min(P.page, pages);
  const rows = all.slice((P.page - 1) * size, P.page * size);

  const grid = el('div', 'pcards');
  if (!rows.length) {
    const empty = el('div', 'empty', '暂无画像 —— 由蒸馏/合并自动产出');
    empty.style.gridColumn = '1/-1';
    grid.appendChild(empty);
  }
  for (const p of rows) grid.appendChild(card(p));
  ROOT.appendChild(grid);

  const pg = el('div', '');
  pager(pg, { total: all.length, page: P.page, size, onPage: (p) => { P.page = p; rerender(); } });
  ROOT.appendChild(pg);

  // 会话私域标记
  const mod = el('section', 'mod');
  const mh = el('div', 'mh');
  mh.appendChild(el('span', 'no', 'PF-02'), el('span', '', '会话私域标记'), el('em', '', 'domain=该会话记忆进入的私域；空=公开'));
  mod.appendChild(mh);
  const domains = [...new Set(sessions.map((s) => s.domain).filter(Boolean))];
  if (!sessions.length) mod.appendChild(el('div', 'empty', '暂无会话'));
  for (const s of sessions) mod.appendChild(sessionDomainRow(s, domains));
  ROOT.appendChild(mod);

  const foot = el('div', 'pfoot');
  foot.appendChild(el('span', '', '画像 · 人工修改即盖 reviewed 章 · 合并仅限人物卡'));
  foot.appendChild(el('span', '', `${all.length} 张画像卡`));
  ROOT.appendChild(foot);
}

export const profilesPage = {
  mount(root, ctx) {
    ROOT = root; CTX = ctx;
    cleanPause = pauseEditing(root);
    render();
  },
  update(ctx) {
    CTX = ctx;
    // 卡片编辑中不重建（保住未保存的 textarea 输入）；保存/取消后自会刷新
    if (!P.editing && !P.merge) render();
  },
  unmount() {
    cleanPause?.(); cleanPause = null;
    P.editing = null; P.merge = null;
    ROOT = null; CTX = null;
  },
};
