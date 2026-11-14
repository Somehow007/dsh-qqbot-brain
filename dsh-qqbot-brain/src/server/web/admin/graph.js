// 关联图页：弧线图（arc diagram）——记忆列 + 保持率柱 + 关联弧。
// 数据：store.state.notes + state.edges（semantic/derived；facet 边指向人格小节不画，
// 同会话边为前端派生）。截断：筛选后 >40 条按类型比例分配名额（每类保底）。

import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { el } from '../core/ui.js';
import {
  isSelfTrack, charOfNote, charName, charColor, sessLabel,
  scopeText, KIND_LABEL, pending,
} from './common.js';
import { mapActions } from '../views/map.js';

const GF = { kind: '', track: '', sel: null };
const LINK_CN = { derived: '沉淀来源', semantic: '语义相似', session: '同会话' };
const ORDER = { attitude: 0, semantic: 1, episodic: 2 };
let ROOT = null;

function notes() { return store.state?.notes ?? []; }
function personas() { return store.personas?.personas ?? []; }
function edges() { return store.state?.edges ?? []; }

/** 筛选 + 截断：>40 条按类型比例分配（每类保底 6） */
function graphNodes() {
  const all = notes().filter((n) =>
    (!GF.kind || n.kind === GF.kind) && (!GF.track || (GF.track === 'self') === isSelfTrack(n)));
  const total = all.length;
  if (total <= 40) {
    return { ns: all.sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || (b.importance - a.importance) || (b.retention - a.retention)), trunc: false, total };
  }
  const CAP = 40;
  const score = (n) => (n.importance ?? 0) * 2 + (n.retention ?? 0) * 3 + (n.hits ?? 0) * 0.05;
  const groups = { episodic: [], semantic: [], attitude: [] };
  for (const n of all) (groups[n.kind] ??= []).push(n);
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt);
  const ks = Object.keys(groups).filter((k) => groups[k].length);
  const alloc = {};
  ks.forEach((k) => { alloc[k] = 0; });
  const floorN = Math.min(6, Math.floor(CAP / ks.length));
  const totLen = ks.reduce((s, k) => s + groups[k].length, 0);
  ks.forEach((k) => { alloc[k] = Math.max(Math.min(groups[k].length, floorN), Math.round(CAP * groups[k].length / totLen)); });
  let sum = ks.reduce((s, k) => s + alloc[k], 0);
  const minAlloc = (k) => Math.min(groups[k].length, floorN);
  while (sum > CAP) {
    const k = ks.filter((k) => alloc[k] > minAlloc(k)).sort((a, b) => (alloc[b] / groups[b].length) - (alloc[a] / groups[a].length))[0];
    if (!k) break;
    alloc[k]--; sum--;
  }
  while (sum < CAP) {
    const k = ks.filter((k) => alloc[k] < groups[k].length).sort((a, b) => (alloc[a] / groups[a].length) - (alloc[b] / groups[b].length))[0];
    if (!k) break;
    alloc[k]++; sum++;
  }
  const ns = ks.flatMap((k) => groups[k].slice(0, alloc[k]))
    .sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || (score(b) - score(a)));
  return { ns, trunc: true, total };
}

/** 有效边：note↔note（semantic/derived）+ 前端派生同会话链 */
function graphLinks(vis) {
  const visSet = new Set(vis.map((n) => n.id));
  const out = [];
  for (const e of edges()) {
    if (!visSet.has(e.a) || !visSet.has(e.b)) continue;
    if (e.kind === 'facet') continue; // facet:b 指向人格小节，非记忆节点
    out.push({ a: e.a, b: e.b, kind: e.kind === 'derived' ? 'derived' : 'semantic' });
  }
  // 同会话：按会话分组、组内相邻配对（链式，避免 O(n²) 爆炸）
  const bySess = new Map();
  for (const n of vis) {
    const sid = n.sessionId || 'manual';
    if (!bySess.has(sid)) bySess.set(sid, []);
    bySess.get(sid).push(n.id);
  }
  for (const ids of bySess.values()) {
    for (let i = 1; i < ids.length; i++) out.push({ a: ids[i - 1], b: ids[i], kind: 'session' });
  }
  return out;
}

function drawArc(svg, links, ns, trunc, total) {
  svg.replaceChildren();
  const NS = 'http://www.w3.org/2000/svg';
  const el2 = (t, a = {}, p) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    if (p) p.appendChild(e);
    return e;
  };
  if (!ns.length) {
    const t = el2('text', { x: 30, y: 230, 'font-size': 14, fill: 'var(--ink3)' }, svg);
    t.textContent = '当前筛选下没有可绘制的记忆';
    return 0;
  }
  const BASE = 250, x0 = 34, gapG = 42;
  const step = (900 - x0 * 2 - gapG * 2) / Math.max(1, ns.length - 1);
  const X = {};
  let x = x0, prev = null;
  const groups = {};
  for (const m of ns) {
    if (prev && prev !== m.kind) x += gapG;
    X[m.id] = x;
    (groups[m.kind] ??= []).push(x);
    prev = m.kind;
    x += step;
  }
  for (const [k, xs] of Object.entries(groups)) {
    const a = xs[0] - 9, b = xs[xs.length - 1] + 9;
    el2('rect', { x: a, y: BASE - 2, width: b - a, height: 4, fill: 'var(--ink)' }, svg);
    const t = el2('text', { x: a, y: 18, 'font-size': 12, 'font-weight': 700 }, svg);
    t.textContent = KIND_LABEL[k] ?? k;
    const t2 = el2('text', { x: a + 30, y: 18, 'font-size': 10, fill: 'var(--ink3)' }, svg);
    t2.textContent = `${k.toUpperCase()} · ${xs.length}`;
    el2('line', { x1: a, x2: b, y1: 26, y2: 26, stroke: 'var(--line)' }, svg);
  }
  const ga = el2('g', {}, svg);
  const vis = new Set(ns.map((n) => n.id));
  let linkCount = 0;
  for (const l of links) {
    if (!vis.has(l.a) || !vis.has(l.b)) continue;
    linkCount++;
    const xa = X[l.a], xb = X[l.b];
    const r = Math.abs(xb - xa) / 2;
    const [p, q] = xa < xb ? [xa, xb] : [xb, xa];
    el2('path', {
      class: 'arc', 'data-a': l.a, 'data-b': l.b,
      d: `M${p} ${BASE - 6} A${r} ${Math.min(r * 0.8, 180)} 0 0 1 ${q} ${BASE - 6}`,
      stroke: l.kind === 'derived' ? 'var(--accent)' : l.kind === 'semantic' ? 'var(--ink)' : 'var(--ink3)',
      'stroke-width': l.kind === 'derived' ? 2 : 1,
      'stroke-dasharray': l.kind === 'session' ? '3 3' : '',
    }, ga);
  }
  const ps = personas();
  for (const m of ns) {
    const nx = X[m.id];
    const self = isSelfTrack(m);
    const cid = charOfNote(m, ps);
    const col = self ? charColor(cid, ps) : '#0f0f0f';
    // 世界轨用墨色——亮色主题下 #0f0f0f 近黑可见；暗色主题下改用 ink
    const colUse = self ? col : 'var(--ink)';
    const h = 8 + (m.retention ?? 0) * 80;
    const g = el2('g', { class: 'node', 'data-id': m.id }, svg);
    el2('rect', { x: nx - step / 2, y: 30, width: step, height: 445, fill: 'transparent' }, g);
    el2('rect', { x: nx - 5, y: BASE - 11, width: 10, height: 10, fill: colUse }, g);
    el2('rect', {
      x: nx - 3, y: BASE + 8, width: 6, height: h,
      fill: m.fading ? 'none' : colUse, stroke: colUse, 'stroke-width': m.fading ? 1 : 0,
    }, g);
    const t = el2('text', {
      x: nx, y: BASE + h + 24, 'font-size': 12,
      'font-weight': (m.importance ?? 0) >= 4 ? 700 : 400,
      fill: m.id === GF.sel ? 'var(--accent)' : 'var(--ink)',
      style: 'writing-mode:vertical-rl;letter-spacing:.05em',
    }, g);
    t.textContent = (m.content ?? '').length > 8 ? `${m.content.slice(0, 8)}…` : (m.content ?? '');
    const ti = el2('title', {}, t);
    ti.textContent = m.content ?? '';
    const nn = el2('text', { x: nx, y: BASE + h + 15, 'font-size': 9, fill: 'var(--ink3)', 'text-anchor': 'middle', 'font-family': 'ui-monospace,monospace' }, g);
    nn.textContent = String(Math.round((m.retention ?? 0) * 100));
    g.addEventListener('click', () => {
      GF.sel = GF.sel === m.id ? null : m.id;
      drawArc(document.getElementById('arc'), graphLinks(graphNodes().ns), graphNodes().ns, trunc, total);
      gside();
    });
  }
  if (GF.sel) {
    const near = new Set([GF.sel, ...links.filter((l) => l.a === GF.sel || l.b === GF.sel).map((l) => (l.a === GF.sel ? l.b : l.a))]);
    svg.querySelectorAll('.node').forEach((g) => g.classList.toggle('dim', !near.has(g.dataset.id)));
    svg.querySelectorAll('.arc').forEach((a) => a.classList.toggle('dim', a.dataset.a !== GF.sel && a.dataset.b !== GF.sel));
  }
  const hint = document.getElementById('graphHint');
  if (hint) hint.textContent = trunc
    ? `共 ${total} 条符合筛选，按重要度/保持率截断前 40 条绘制（三类均衡取样，每类保底）`
    : `${total} 条记忆 · ${linkCount} 条关联`;
  return linkCount;
}

function gside() {
  const w = document.getElementById('gside');
  if (!w) return;
  w.replaceChildren();
  if (!GF.sel) {
    w.appendChild(el('div', 'empty-hint', '点选弧线图中任意一列查看记忆详情。\n\n下垂柱=保持率，方块颜色=轨道（自我轨用所属角色强调色）。'));
    return;
  }
  const n = notes().find((x) => x.id === GF.sel);
  if (!n) return;
  const ps = personas();
  const self = isSelfTrack(n);
  const cid = charOfNote(n, ps);
  w.appendChild(el('h3', '', n.content ?? ''));
  const kv = el('div', 'kv');
  const kvRow = (k, vNode) => { kv.appendChild(el('div', '', k)); kv.appendChild(vNode); };
  const v1 = el('div');
  const sq = el('span', 'sq');
  sq.style.background = self ? charColor(cid, ps) : 'var(--ink)';
  v1.append(sq, document.createTextNode(self ? `自我 · ${charName(cid, ps)}` : '世界 · 共享'));
  kvRow('轨道', v1);
  kvRow('类型', el('div', '', `${KIND_LABEL[n.kind] ?? n.kind}（${n.kind}）`));
  kvRow('保持率', el('div', '', `${Math.round((n.retention ?? 0) * 100)}%${n.fading ? ' — 将遗忘' : ''}`));
  kvRow('重要 / 唤起', el('div', '', `${n.importance ?? '—'} / ${n.hits ?? 0}`));
  kvRow('年龄 / 会话', el('div', '', `${n.ageDays ?? '—'} 天 · ${sessLabel(n.sessionId)}`));
  kvRow('角色 / 人设', el('div', '', `${charName(cid, ps)} · ${n.personaId || '—'}`));
  kvRow('可见域', el('div', '', `${scopeText(n)}${n.private ? '（手动覆盖）' : ''}`));
  if (n.emotion) {
    kvRow('情绪', el('div', '', `${n.emotion.label ?? ''}${n.emotion.mood ? `「${n.emotion.mood}」` : ''} v=${n.emotion.v ?? ''} a=${n.emotion.a ?? ''}`));
  }
  kvRow('创建', el('div', '', new Date(n.createdAt ?? 0).toLocaleString('zh-CN', { hour12: false })));
  w.appendChild(kv);

  // 关联列表
  const rel = linksFor(n.id);
  const rl = el('ul', 'rl');
  if (!rel.length) rl.appendChild(el('li', '', '无关联'));
  for (const { other, kind } of rel) {
    const li = el('li');
    li.style.cursor = 'pointer';
    li.appendChild(el('span', '', `${(other.content ?? '').slice(0, 22)}…`));
    li.appendChild(el('small', '', LINK_CN[kind] ?? kind));
    li.onclick = () => { GF.sel = other.id; redraw(); };
    rl.appendChild(li);
  }
  w.appendChild(rl);

  const btns = el('div');
  btns.style.cssText = 'display:flex;gap:8px;margin-top:16px;flex-wrap:wrap';
  const open = el('button', 'btn sm', '在记忆库中打开');
  open.onclick = () => { pending.noteId = n.id; navigate('#/admin/memories'); };
  const reinf = el('button', 'btn sm a2', '强化');
  reinf.onclick = async () => { await mapActions.reinforceNote(n.id); redraw(); };
  const del = el('button', 'btn sm danger', '删除');
  del.onclick = async () => {
    if (!window.confirm(`删除「${(n.content ?? '').slice(0, 40)}…」？写入 del op，不可恢复。`)) return;
    await mapActions.deleteNote(n.id);
    GF.sel = null;
    redraw();
  };
  btns.append(open, reinf, del);
  w.appendChild(btns);
}

function linksFor(id) {
  const byId = new Map(notes().map((n) => [n.id, n]));
  const out = [];
  const seen = new Set();
  for (const l of graphLinks(graphNodes().ns)) {
    if (l.a !== id && l.b !== id) continue;
    const oid = l.a === id ? l.b : l.a;
    if (seen.has(oid)) continue;
    seen.add(oid);
    const other = byId.get(oid);
    if (other) out.push({ other, kind: l.kind });
  }
  return out;
}

function redraw() {
  const { ns, trunc, total } = graphNodes();
  drawArc(document.getElementById('arc'), graphLinks(ns), ns, trunc, total);
  gside();
}

function render(ctx) {
  if (!ROOT) return;
  ROOT.replaceChildren();
  const head = el('div', 'phead');
  head.appendChild(el('span', 'no', '06'));
  head.appendChild(el('h1', '', '关联图'));
  const sub = el('div', 'sub');
  sub.append('Arc Diagram', document.createElement('br'), '记忆关系与保持率一览');
  head.appendChild(sub);
  ROOT.appendChild(head);

  const bar = el('div', 'gfilters');
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
  const kf = el('div', 'fld'); kf.style.margin = '0';
  kf.appendChild(el('label', '', '类型'));
  kf.appendChild(mkSel([['', '全部类型'], ['episodic', '情景'], ['semantic', '语义'], ['attitude', '态度']], GF.kind,
    (e) => { GF.kind = e.target.value; GF.sel = null; redraw(); }));
  const tf = el('div', 'fld'); tf.style.margin = '0';
  tf.appendChild(el('label', '', '轨道'));
  tf.appendChild(mkSel([['', '全部轨道'], ['world', '世界轨'], ['self', '自我轨']], GF.track,
    (e) => { GF.track = e.target.value; GF.sel = null; redraw(); }));
  const rst = el('button', 'btn sm ghost', '重置');
  rst.type = 'button';
  rst.onclick = () => { GF.sel = null; GF.kind = ''; GF.track = ''; render(); };
  const spacer = el('div'); spacer.style.marginLeft = 'auto';
  spacer.appendChild(rst);
  bar.append(kf, tf, spacer);
  ROOT.appendChild(bar);

  const hint = el('div', '');
  hint.id = 'graphHint';
  hint.style.cssText = 'font:11px var(--mono);color:var(--ink3);margin-bottom:2px';
  ROOT.appendChild(hint);

  const wrap = el('div', 'gwrap');
  const left = el('div');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'arc'; svg.classList.add('arcg');
  svg.setAttribute('viewBox', '0 0 900 500');
  svg.style.cssText = 'width:100%;display:block';
  left.appendChild(svg);
  const legend = el('div', 'glegend');
  legend.append(
    legendItem('自我轨（角色色）', 'var(--accent)', true),
    legendItem('世界轨', 'var(--ink)', true),
    legendItem('沉淀 derived', 'var(--accent)', false),
    legendItem('语义 semantic', 'var(--ink)', false),
    legendItem('同会话 session', 'var(--ink3)', false),
  );
  left.appendChild(legend);
  wrap.appendChild(left);
  const side = el('div', 'gside');
  side.id = 'gside';
  wrap.appendChild(side);
  ROOT.appendChild(wrap);

  const foot = el('div', 'pfoot');
  foot.appendChild(el('span', '', '关联图 · edges 实时推导不落库 · facet 边（人格小节）不绘制'));
  foot.appendChild(el('span', '', '同会话边为前端派生'));
  ROOT.appendChild(foot);

  redraw();
}

function legendItem(label, color, isRect) {
  const s = el('span');
  const NS = 'http://www.w3.org/2000/svg';
  const ic = document.createElementNS(NS, 'svg');
  ic.setAttribute('width', '12'); ic.setAttribute('height', '12');
  if (isRect) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('width', '12'); r.setAttribute('height', '12');
    r.setAttribute('fill', color ?? 'var(--accent)');
    ic.appendChild(r);
  } else {
    ic.setAttribute('width', '26'); ic.setAttribute('height', '10');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M1 9 Q13 -4 25 9');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color ?? 'var(--ink)');
    if (color === 'var(--ink3)') p.setAttribute('stroke-dasharray', '3 3');
    ic.appendChild(p);
  }
  s.append(ic, document.createTextNode(label));
  return s;
}

export const graphPage = {
  mount(root) {
    ROOT = root;
    render();
  },
  update() { redraw(); },
  unmount() { ROOT = null; },
};
