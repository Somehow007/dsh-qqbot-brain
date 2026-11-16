// 事件流水页：B3 GET /api/ops 分页（type 逗号列表 / from / to 毫秒）。
// 点行展开原始 op JSON；能取到 note id 的给「在记忆库打开」跳转。

import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { el, toast, fmtT } from '../core/ui.js';
import { pager, openNoteInLib, pending } from './common.js';

const F = { type: '', range: '7d', page: 1, size: 20, open: null };
let LIST = { ops: [], total: 0, page: 1, size: 20 };

const TYPE_GROUPS = [
  ['', '全部类型'],
  ['reinforce', '召回 reinforce'],
  ['add,update,del,merge,absorb,del-range,del-persona', '记忆写入/编辑'],
  ['emotion', '情绪 emotion'],
  ['profile', '画像 profile'],
  ['persona,persona-save,persona-activate,persona-delete', '人设'],
  ['sess-domain', '会话域'],
  ['intent-add,intent-update,intent-fire,intent-del', '意图'],
  ['embed,digest,reset', '系统 embed/digest/reset'],
];
const RANGES = [['h24', '近 24 小时'], ['d7', '近 7 天'], ['d30', '近 30 天'], ['all', '全部']];
const DAY = 86400e3;

const OP_CN = {
  add: '写入', reinforce: '唤起', update: '修改', del: '删除', merge: '合并', absorb: '吸收',
  emotion: '情绪', profile: '画像', persona: '人设', 'persona-save': '人设保存',
  'persona-activate': '人设激活', 'persona-delete': '人设删除', reset: '重置',
  'del-range': '按时段删', 'del-persona': '按人设删', 'sess-domain': '会话域',
  embed: '向量', digest: '摘要', 'intent-add': '意图+', 'intent-update': '意图~',
  'intent-fire': '意图触发', 'intent-del': '意图-',
};
const ET_CLASS = {
  reinforce: 'recall', add: 'distill', emotion: 'mood', merge: 'consolidate', absorb: 'consolidate',
  embed: 'decay', digest: 'decay', reset: 'edit',
};
const etClassOf = (name) => ET_CLASS[name] ?? 'edit';

function rangeMs() {
  return { h24: DAY, d7: 7 * DAY, d30: 30 * DAY, all: 0 }[F.range] ?? 7 * DAY;
}

async function load() {
  const params = new URLSearchParams({ page: String(F.page), size: String(F.size) });
  if (F.type) params.set('type', F.type);
  const ms = rangeMs();
  if (ms) {
    params.set('to', String(Date.now()));
    params.set('from', String(Date.now() - ms));
  }
  try {
    LIST = await api.get(`/ops?${params}`);
  } catch (e) {
    toast(`加载失败：${e instanceof Error ? e.message : e}`);
    LIST = { ops: [], total: 0, page: F.page, size: F.size };
  }
  renderBody();
}

/** op → 可读摘要 + 关联 note id（尽力而为；原文 JSON 在展开行） */
function opInfo(rec) {
  const op = rec?.op ?? {};
  const name = op.op ?? '';
  const cn = OP_CN[name] ?? name;
  let noteId = '';
  let detail = '';
  const short = (s, n = 24) => String(s ?? '').slice(0, n);
  switch (name) {
    case 'add':
      noteId = op.note?.id ?? '';
      detail = `「${short(op.note?.content, 20)}」 ${op.note?.kind ?? ''}`.trim();
      break;
    case 'reinforce':
      noteId = op.id ?? '';
      detail = op.id ? `#${short(op.id, 8)}` : '';
      break;
    case 'update':
      noteId = op.id ?? '';
      detail = op.id ? `#${short(op.id, 8)} ${op.patch ? Object.keys(op.patch).join('/') : ''}` : '';
      break;
    case 'del':
      noteId = op.id ?? '';
      detail = op.id ? `#${short(op.id, 8)}` : '';
      break;
    case 'merge':
      noteId = op.keepId ?? '';
      detail = `留 ${short(op.keepId, 8)} ← 吸 ${short(op.dropId, 8)}`;
      break;
    case 'absorb':
      detail = `${(op.ids ?? []).length} 条情景源`;
      break;
    case 'emotion':
      detail = `${op.state?.label ?? ''}${op.state?.mood ? `「${op.state.mood}」` : ''} · ${op.sessionId ?? ''}`;
      break;
    case 'profile':
      detail = short(op.key, 30);
      break;
    case 'del-range':
      detail = `${(op.ids ?? []).length} 条（${fmtT(op.from)} ~ ${fmtT(op.to)}）`;
      break;
    case 'del-persona':
      detail = `${op.personaId ?? ''}（${(op.ids ?? []).length} 条）`;
      break;
    case 'sess-domain':
      detail = `${op.sessionId ?? ''} → ${op.domain || '公开'}`;
      break;
    case 'persona-save':
      detail = short(op.persona?.name ?? op.persona?.id, 30);
      break;
    case 'persona-activate':
    case 'persona-delete':
      detail = short(op.id, 30);
      break;
    case 'persona':
      detail = short(op.text, 30);
      break;
    case 'reset':
      detail = op.keepPersona === false ? '整库重置' : '记忆重置（人设保留）';
      break;
    case 'intent-fire':
      detail = short(op.id ?? op.text, 30);
      break;
    case 'digest':
      detail = short(op.sessionId, 30);
      break;
    default:
      detail = short(JSON.stringify(op).slice(0, 60), 60);
  }
  return { name, cn, noteId, detail, cls: etClassOf(name) };
}

function renderBody() {
  const body = document.getElementById('opsBody');
  const pagerBox = document.getElementById('opsPager');
  const count = document.getElementById('opsCount');
  if (!body) return;
  body.replaceChildren();
  const ops = LIST.ops ?? [];
  if (!ops.length) {
    const tr = document.createElement('tr');
    const td = el('td', 'empty', '该条件下暂无事件');
    td.colSpan = 5;
    tr.appendChild(td);
    body.appendChild(tr);
  }
  ops.forEach((rec, i) => {
    const gi = i; // 展开态按页内序号
    const info = opInfo(rec);
    const open = F.open === gi;
    const tr = el('tr', `oprow${open ? ' sel' : ''}`);
    const tdn = document.createElement('td');
    tdn.className = 'num'; tdn.style.textAlign = 'left';
    tdn.textContent = fmtT(rec.t);
    const tdt = document.createElement('td');
    const badge = el('span', `et ${info.cls}`, info.cn);
    tdt.appendChild(badge);
    const tds = document.createElement('td');
    tds.textContent = info.detail || info.cn;
    const tdnote = document.createElement('td');
    if (info.noteId) {
      const link = el('button', 'mlink', `#${info.noteId.slice(0, 8)}`);
      link.type = 'button';
      link.onclick = (e) => {
        e.stopPropagation();
        pending.noteId = info.noteId;
        navigate('#/admin/memories');
      };
      tdnote.appendChild(link);
    } else tdnote.textContent = '—';
    tr.append(tdn, tdt, tds, tdnote);
    tr.onclick = () => { F.open = open ? null : gi; renderBody(); };
    body.appendChild(tr);
    if (open) {
      const tr2 = document.createElement('tr');
      tr2.className = 'opdet';
      const td2 = document.createElement('td');
      td2.colSpan = 4;
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(rec, null, 2);
      td2.appendChild(pre);
      tr2.appendChild(td2);
      body.appendChild(tr2);
    }
  });
  if (count) count.textContent = `共 ${LIST.total ?? 0} 条 · 环形缓冲 cap 500 · 服务端分页`;
  if (pagerBox) {
    pager(pagerBox, {
      total: LIST.total ?? 0, page: LIST.page ?? F.page, size: LIST.size ?? F.size,
      onPage: (p) => { F.page = p; F.open = null; load(); },
    });
  }
}

export const opsPage = {
  mount(root) {
    this._root = root;
    root.replaceChildren();
    const head = el('div', 'phead');
    head.appendChild(el('span', 'no', '05'));
    head.appendChild(el('h1', '', '事件流水'));
    const sub = el('div', 'sub');
    sub.append('Ops Log', document.createElement('br'), 'append-only op 流 · 最新在前');
    head.appendChild(sub);
    root.appendChild(head);

    const bar = el('div', 'opsfilter');
    const mkSel = (options, cur, onChange) => {
      const s = document.createElement('select');
      for (const [v, t] of options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        if (v === cur) o.selected = true;
        s.appendChild(o);
      }
      s.onchange = onChange;
      return s;
    };
    const tf = el('div', 'fld'); tf.style.margin = '0';
    tf.appendChild(el('label', '', '事件类型'));
    tf.appendChild(mkSel(TYPE_GROUPS, F.type, (e) => { F.type = e.target.value; F.page = 1; F.open = null; load(); }));
    const rf = el('div', 'fld'); rf.style.margin = '0';
    rf.appendChild(el('label', '', '时间范围'));
    rf.appendChild(mkSel(RANGES, F.range, (e) => { F.range = e.target.value; F.page = 1; F.open = null; load(); }));
    bar.append(tf, rf);
    root.appendChild(bar);

    const table = document.createElement('table');
    table.style.marginTop = '4px';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const [t, w, cls] of [['时间', '96px', ''], ['类型', '80px', ''], ['摘要', '', ''], ['关联记忆', '110px', ''], ['—', '0', 'hidden']]) {
      if (cls === 'hidden') continue;
      const th = document.createElement('th');
      th.textContent = t;
      if (w) th.style.width = w;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    tbody.id = 'opsBody';
    table.appendChild(tbody);
    const twrap = el('div', 'adm-tscroll');
    twrap.appendChild(table);
    root.appendChild(twrap);

    const count = el('div', '');
    count.id = 'opsCount';
    count.style.cssText = 'font:11px var(--mono);color:var(--ink3);margin-top:10px';
    root.appendChild(count);
    const pg = el('div', '');
    pg.id = 'opsPager';
    root.appendChild(pg);

    load();
  },
  update() { if (store.editing === 0) load(); },
  unmount() { this._root = null; },
};
