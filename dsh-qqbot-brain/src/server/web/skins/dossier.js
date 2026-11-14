// 墨刊（dossier）皮肤：概念图 a-dossier 还原。
// 刊头（双细线刊名/刊期/栏线副栏）→ 时间轴地层图（x=时间平方根刻度，三层 情景→语义→态度，
// 巩固画弧）→ 侧栏总览/专栏详情 → 底部记忆索引表（前 50 + 「查看全部」→ #/admin/memories）。
// 数据一律消费 ctx.vm（core/vm.js buildMapVM）；皮肤自身不 fetch。无 rAF（纯静态版式）。
// LOD：地层点 ≤60（quotaPick 三 kind 按比例）、常驻标签 ≤24（labelPick）、连线 ≤80。

import { el } from '../core/ui.js';
import { hashColor } from '../core/theme.js';
import { kindLabel, quotaPick, labelPick, relationWhy, previewText } from '../core/vm.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const W = 860, X0 = 110, X1 = 830, DMAX = 32;
const BANDS = { attitude: 70, semantic: 200, episodic: 330 };
const NODE_CAP = 60, LABEL_CAP = 24, EDGE_CAP = 80, ROW_CAP = 50;

const svg = (t, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, t);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const xOf = (d) => X1 - Math.sqrt(Math.min(Math.max(0, d), DMAX) / DMAX) * (X1 - X0);
// 关系类型 → 图上线型：derived=沉淀弧；semantic/topic=虚线；session/actor=细线
const edgeKind = (r) => r.primary === 'derived' ? 'consolidate'
  : (r.primary === 'session' || r.primary === 'actor') ? 'session' : 'similar';

export default {
  id: 'dossier',
  label: '墨刊',

  // §4.3 管理端 token 集（P3 消费）：纸面亮色；accent 由消费方按当前人设 a 覆盖
  tokens: {
    '--bg': '#f3efe6', '--panel': '#ebe5d8', '--ink': '#171512',
    '--ink2': '#5b554b', '--line': '#cfc6b4',
    '--accent': '#3d7bff', '--accent2': '#8ec5ff', '--danger': '#b3332e',
    '--font-head': '"Songti SC","Noto Serif SC",serif', '--font-body': '-apple-system,"PingFang SC",sans-serif',
  },

  mount(elm, ctx) {
    this._ctx = ctx;
    this._vm = ctx?.vm ?? null;
    this._sel = null;
    this._qhit = new Set();
    this._pos = {};
    this._drawn = new Set();
    const theme = ctx?.theme ?? {};
    this._brandKey = `${ctx?.persona?.id ?? ''}|${theme.name ?? ''}|${ctx?.charId ?? theme.characterId ?? ''}`;

    elm.replaceChildren();
    const root = el('div', 'dsr');
    root.style.setProperty('--a', theme.a || '#3d7bff');
    root.style.setProperty('--soft', theme.soft || '#e7f0ff');
    root.innerHTML = `<div class="wrap">
      <header class="mast">
        <div class="l">Mind Dossier<br>心智档案 · 第 ${String(new Date().getMonth() + 1).padStart(2, '0')} 期</div>
        <h1 id="dName"></h1>
        <div class="r" id="dDl"></div>
      </header>
      <div class="sub"><span id="dTag">—</span><span id="dSt">—</span></div>
      <div class="grid">
        <main class="col-main">
          <div class="kicker">Memory Strata · 记忆地层</div>
          <h2>她记住了什么</h2>
          <p class="dek">横轴是时间，越往右越新；自下而上从「情景」沉淀为「语义」，再凝成「态度」。专色是她自己的记忆，墨色是所有角色共享的世界记忆。</p>
          <svg id="dMap" viewBox="0 0 ${W} 430" width="100%" role="img" aria-label="记忆地层图"></svg>
          <div class="legend">
            <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--a)"/></svg>自我轨</span>
            <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--ink)"/></svg>世界轨</span>
            <span><svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--ink)" stroke-dasharray="2 2"/></svg>将遗忘</span>
            <span><svg width="26" height="10"><path d="M1 9 Q13 -3 25 9" fill="none" stroke="var(--ink)"/></svg>沉淀巩固</span>
            <span><svg width="26" height="10"><line x1="0" y1="5" x2="26" y2="5" stroke="var(--ink)" stroke-dasharray="1 3"/></svg>语义相似</span>
            <span><svg width="26" height="10"><line x1="0" y1="5" x2="26" y2="5" stroke="var(--ink3)"/></svg>同会话/同发言人</span>
            <span>大小＝重要度 · 浓淡＝保持率</span>
          </div>
        </main>
        <aside class="col-side" id="dSide"></aside>
      </div>
      <section class="index"><h3>记忆索引 <a class="all" href="#/admin/memories">查看全部 →</a></h3>
        <table><thead><tr><th>No.</th><th>内容</th><th>轨道</th><th>类型</th><th>保持率</th><th>重要度</th><th>唤起</th><th>年龄</th></tr></thead><tbody id="dRows"></tbody></table>
      </section>
      <div class="foot"><span>MIND DOSSIER · <span id="dFootName"></span></span><span>换人设 = 换专色 + 换自我轨，版式不变</span></div>
    </div>`;
    elm.appendChild(root);
    this._root = elm;
    this._dsr = root;
    this._paint();
  },

  // ── 整绘：刊头 + 地层图 + 侧栏 + 索引表 ──
  _paint() {
    const vm = this._vm, theme = this._ctx?.theme ?? {};
    const q = (s) => this._root.querySelector(s);
    const title = theme.title || theme.name || '心智档案';
    const h1 = q('#dName');
    h1.replaceChildren();
    h1.append(document.createTextNode(title));
    const sm = document.createElement('small'); sm.textContent = theme.en || '';
    h1.append(sm);
    const d = new Date(vm?.now ?? Date.now());
    const dl = q('#dDl');
    dl.replaceChildren(
      document.createTextNode(`${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}`),
      el('br'), document.createTextNode(`当前人设 ${this._ctx?.persona?.name ?? '—'}`));
    q('#dTag').textContent = `「${theme.tagline || '……'}」 · 人设版本 ${this._ctx?.persona?.id ?? '—'}`;
    const notes = vm?.notes ?? [];
    const self = notes.filter((n) => n.track === 'self').length;
    q('#dSt').textContent = vm
      ? `记忆 ${notes.length} · 自我 ${self} · 世界 ${notes.length - self} · 关联 ${vm.links?.length ?? 0}`
      : '档案加载中……';
    q('#dFootName').textContent = `${theme.en || 'DOSSIER'}`;

    this._layout();
    this._drawMap();
    this._rows();
    const keep = this._sel && vm?.byId?.[this._sel] ? this._sel : null;
    this._select(keep);
    if (this._qhit.size) this._applyHi([...this._qhit]);
  },

  // ── 布局：kind 分带 + 时间 sqrt 横轴 + 带内碰撞上下让位 ──
  _layout() {
    this._pos = {};
    this._drawn = new Set();
    const notes = this._vm?.notes ?? [];
    const used = {};
    for (const n of quotaPick(notes, NODE_CAP)) {
      this._drawn.add(n.id);
      const key = n.kind ?? 'episodic';
      let x = xOf(n.day), y = BANDS[key] ?? BANDS.episodic, k = 0;
      (used[key] ??= []);
      while (used[key].some((p) => Math.hypot(p[0] - x, p[1] - y) < 30) && k < 14) {
        k++;
        y = (BANDS[key] ?? BANDS.episodic) + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 20;
      }
      used[key].push([x, y]);
      this._pos[n.id] = [x, y];
    }
    // 常驻标签：保持率×重要度 top24，每 kind 保底 3
    this._pins = labelPick([...this._drawn].map((id) => this._vm.byId[id]).filter(Boolean), LABEL_CAP, 3);
  },

  _drawMap() {
    const s = this._root.querySelector('#dMap');
    s.replaceChildren();
    const vm = this._vm;
    for (const [k, y] of Object.entries(BANDS)) {
      svg('rect', { x: 0, y: y - 58, width: W, height: 116, fill: k === 'semantic' ? 'rgba(0,0,0,.025)' : 'none' }, s);
      svg('line', { x1: X0 - 10, x2: W, y1: y + 58, y2: y + 58, stroke: 'var(--rule)' }, s);
      const t = svg('text', { x: 0, y: y - 4, class: 'band-l' }, s); t.textContent = kindLabel(k);
      const t2 = svg('text', { x: 0, y: y + 12, class: 'band-s' }, s); t2.textContent = k.toUpperCase();
    }
    for (const dd of [0, 1, 3, 7, 14, 28]) {
      const x = xOf(dd);
      svg('line', { x1: x, x2: x, y1: 8, y2: 392, stroke: 'var(--rule)', 'stroke-dasharray': '2 4' }, s);
      const t = svg('text', { x, y: 412, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ink3)' }, s);
      t.textContent = dd ? `${dd} 天前` : '今天';
    }
    if (!vm) return;
    const byId = vm.byId ?? {};
    const ge = svg('g', {}, s), gn = svg('g', {}, s);
    const rels = (vm.relations ?? [])
      .filter((r) => this._pos[r.a] && this._pos[r.b])
      .sort((a, b) => b.score - a.score)
      .slice(0, EDGE_CAP);
    for (const r of rels) {
      const [x1, y1] = this._pos[r.a], [x2, y2] = this._pos[r.b];
      const tk = edgeKind(r);
      let d;
      if (tk === 'consolidate') {
        const my = Math.min(y1, y2) - 30;
        d = `M${x1} ${y1} C${x1} ${my} ${x2} ${my + 40} ${x2} ${y2}`;
      } else d = `M${x1} ${y1} L${x2} ${y2}`;
      const self = byId[r.a]?.track === 'self' || byId[r.b]?.track === 'self';
      svg('path', {
        d, class: 'edge', 'data-a': r.a, 'data-b': r.b,
        stroke: tk === 'session' ? 'var(--ink3)' : self ? 'var(--a)' : 'var(--ink)',
        'stroke-width': tk === 'consolidate' ? 1.4 : 1,
        'stroke-dasharray': tk === 'similar' ? '1 4' : '', opacity: .7,
      }, ge);
    }
    for (const id of this._drawn) {
      const n = byId[id];
      if (!n) continue;
      const [x, y] = this._pos[id], r = 4 + n.imp * 2.2;
      const g = svg('g', { class: 'node', 'data-id': id, transform: `translate(${x} ${y})`, tabindex: 0, role: 'button' }, gn);
      const fill = n.track === 'self' ? 'var(--a)' : 'var(--ink)', fading = n.ret < .4;
      svg('circle', { r: r + 8, class: 'halo', fill: 'none', stroke: 'var(--a)', 'stroke-width': 2, opacity: 0 }, g);
      svg('circle', { r: r + 5, fill: 'transparent' }, g);
      svg('circle', {
        r, fill: fading ? 'var(--paper)' : fill,
        'fill-opacity': fading ? 1 : .25 + n.ret * .75,
        stroke: fill, 'stroke-width': fading ? 1.2 : 0,
        'stroke-dasharray': fading ? '2 2' : '',
      }, g);
      if (n.track === 'self') svg('circle', { r: r + 3.5, fill: 'none', stroke: 'var(--a)', 'stroke-width': .8 }, g);
      const t = svg('text', { class: 'lab', y: -r - 7, 'text-anchor': 'middle' }, g);
      t.textContent = n.title;
      if (this._pins.has(id)) g.classList.add('pin');
      g.onclick = () => this._select(id);
      g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._select(id); } };
    }
  },

  // ── 侧栏：总览（引语/特质/情绪/编者按） ──
  _sideOverview() {
    const side = this._root.querySelector('#dSide');
    side.replaceChildren();
    const vm = this._vm, theme = this._ctx?.theme ?? {};
    const name = theme.title || theme.name || '她';

    const pull = el('div', 'pull');
    const qq = el('q'); qq.textContent = vm?.say || '……';
    pull.append(qq);
    pull.append(el('span', 'by', `—— ${name} · 当前心情「${vm?.mood?.word ?? '无记录'}」`));
    side.append(pull);

    side.append(el('div', 'sec', '人格 · Traits'));
    const ul = el('ul', 'traits');
    for (const [nm, v] of (theme.traits ?? []).slice(0, 6)) {
      const li = el('li');
      li.append(el('b', '', nm));
      const bar = el('span', 'bar'); const i = el('i'); i.style.width = `${Math.round(v * 100)}%`; bar.append(i);
      li.append(bar, el('em', '', (+v).toFixed(2)));
      ul.append(li);
    }
    side.append(ul);
    if (!(theme.traits ?? []).length) side.append(el('p', 'dek', '尚未写下人格特质。'));

    side.append(el('div', 'sec', '情绪 · Mood'));
    const mood = el('div', 'mood');
    const dot = el('span', 'dot');
    const w = vm?.mood?.word;
    if (w) dot.style.background = this._moodColor(w);
    mood.append(dot);
    const md = el('div');
    const mb = el('b', '', w ?? '无情绪记录');
    md.append(mb);
    if (w) md.append(document.createTextNode(` · 强度 ${(+(vm.mood.a) || 0).toFixed(2)}`));
    md.append(el('br'));
    md.append(el('small', '', (vm?.moodWords ?? []).join(' / ')));
    md.lastChild.style.cssText = 'color:var(--ink2);font-family:var(--mono)';
    mood.append(md);
    side.append(mood);

    side.append(el('div', 'sec', '编者按'));
    side.append(el('p', 'dek', '点选版面中的任意一粒记忆，右栏会换成它的专栏：原文、保持率与它牵动的其他记忆。'));
  },

  // ── 侧栏：单条记忆专栏 ──
  _sideDetail(n) {
    const side = this._root.querySelector('#dSide');
    side.replaceChildren();
    const vm = this._vm, theme = this._ctx?.theme ?? {};
    const name = theme.title || theme.name || '她';

    const back = el('button', 'back', '← 返回总览');
    back.type = 'button';
    back.onclick = () => this._select(null);
    side.append(back);

    const kick = el('div', 'kicker', `${kindLabel(n.kind)} · ${n.track === 'self' ? name + '的自我轨' : '世界轨'}`);
    kick.style.marginTop = '16px';
    side.append(kick);
    const h2 = el('h2', '', n.title); h2.style.fontSize = '30px';
    side.append(h2);
    side.append(el('p', 'body', n.content || '')); // 全文，textContent 安全
    if (!this._pos[n.id]) side.append(el('div', 'nodraw', '该条目不在当前地层图 LOD（前 60 点）内，仅在索引与专栏呈现。'));

    const dl = el('dl', 'meta');
    const put = (dt, dd) => { dl.append(el('dt', '', dt), dd); };
    const tag = el('dd'); const tg = el('span', `tag ${n.track}`, n.track === 'self' ? `SELF · 仅${name}` : 'WORLD · 全角色共享');
    tag.append(tg); put('轨道', tag);
    const rd = el('dd');
    const ret = el('span', 'ret'); const ri = el('i'); ri.style.width = `${Math.round(n.ret * 100)}%`; ret.append(ri);
    rd.append(ret, document.createTextNode(`${Math.round(n.ret * 100)}%${n.ret < .4 ? ' · 将遗忘' : ''}`));
    put('保持率', rd);
    put('重要度', el('dd', '', '●'.repeat(n.imp) + '○'.repeat(Math.max(0, 5 - n.imp))));
    put('唤起', el('dd', '', `${n.hits ?? 0} 次`));
    put('来源', el('dd', '', `${n.sess || '—'}${n.who ? ' · ' + n.who : ''} · ${n.day} 天前`));
    if (n.emo) {
      const ed = el('dd');
      const eDot = el('i'); eDot.style.cssText = `display:inline-block;width:9px;height:9px;border-radius:50%;background:${this._moodColor(n.emo)}`;
      ed.append(eDot, document.createTextNode(` ${n.emo}${n.emoLabel ? ' · ' + n.emoLabel : ''}`));
      put('情绪', ed);
    }
    side.append(dl);

    const rel = (vm?.relations ?? []).filter((r) => r.a === n.id || r.b === n.id)
      .map((r) => ({ r, other: vm.byId?.[r.a === n.id ? r.b : r.a] })).filter((x) => x.other);
    side.append(el('div', 'sec', `牵动的记忆 · ${rel.length}`));
    const ul = el('ul', 'rel');
    if (!rel.length) ul.append(el('li', '', '暂无关联'));
    for (const { r, other } of rel.slice(0, 14)) {
      const li = el('li');
      li.append(el('b', '', other.title));
      li.append(el('span', '', `${relationWhy(r, other)} · ${kindLabel(other.kind)}`));
      li.onclick = () => this._select(other.id);
      ul.append(li);
    }
    if (rel.length > 14) ul.append(el('li', '', `…… 另 ${rel.length - 14} 条`));
    side.append(ul);
  },

  _moodColor(w) {
    return this._ctx?.theme?.moodColors?.[w] ?? hashColor(w);
  },

  // ── 索引表：retention 降序前 50 ──
  _rows() {
    const tb = this._root.querySelector('#dRows');
    tb.replaceChildren();
    const vm = this._vm;
    if (!vm) return;
    const all = [...vm.notes].sort((a, b) => b.ret - a.ret || (a.id < b.id ? -1 : 1));
    for (const [i, n] of all.slice(0, ROW_CAP).entries()) {
      const tr = el('tr', 'row');
      tr.dataset.id = n.id;
      tr.append(el('td', 'n', String(i + 1).padStart(2, '0')));
      const t = el('td', 't');
      t.append(el('b', '', n.title));
      t.append(el('div', '', previewText(n, vm.notes)));
      tr.append(t);
      const td = el('td'); td.append(el('span', `tag ${n.track}`, n.track === 'self' ? 'SELF' : 'WORLD'));
      tr.append(td);
      const kd = el('td', '', kindLabel(n.kind));
      kd.style.whiteSpace = 'nowrap';
      tr.append(kd);
      const rc = el('td', 'num');
      const ret = el('span', 'ret'); const ri = el('i'); ri.style.width = `${Math.round(n.ret * 100)}%`; ret.append(ri);
      rc.append(ret, document.createTextNode(`${Math.round(n.ret * 100)}%`));
      tr.append(rc);
      tr.append(el('td', 'num', String(n.imp)));
      tr.append(el('td', 'num', String(n.hits ?? 0)));
      tr.append(el('td', 'num', `${n.day}d`));
      tr.onclick = () => this._select(n.id);
      tb.append(tr);
    }
    if (all.length > ROW_CAP) {
      const tr = el('tr');
      const td = el('td', '', `…… 另 ${all.length - ROW_CAP} 条，管理端可全量翻页`);
      td.colSpan = 8;
      td.style.cssText = 'font:11px var(--mono);color:var(--ink3);text-align:center;padding:14px';
      tr.append(td);
      tb.append(tr);
    }
  },

  // ── 选中（内部 + 皮肤接口共用）──
  _select(id) {
    this._sel = id;
    const n = id && this._vm?.byId?.[id];
    if (n) this._sideDetail(n); else this._sideOverview();
    const near = new Set();
    if (n) {
      near.add(id);
      for (const r of this._vm.relations ?? []) {
        if (r.a === id) near.add(r.b);
        if (r.b === id) near.add(r.a);
      }
    }
    this._root.querySelectorAll('.node').forEach((g) => {
      g.classList.toggle('sel', g.dataset.id === id);
      g.classList.toggle('near', near.has(g.dataset.id) && g.dataset.id !== id);
      g.classList.toggle('dim', !!id && !near.has(g.dataset.id));
    });
    this._root.querySelectorAll('.edge').forEach((e) => {
      e.classList.toggle('dim', !!id && e.dataset.a !== id && e.dataset.b !== id);
    });
    let selRow = null;
    this._root.querySelectorAll('#dRows tr.row').forEach((r) => {
      const on = r.dataset.id === id;
      r.classList.toggle('sel', on);
      if (on) selRow = r;
    });
    selRow?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  },

  // ── 搜索高亮 ──
  _applyHi(ids) {
    const set = ids ? new Set(ids) : new Set();
    this._root.querySelectorAll('.node').forEach((g) => {
      g.classList.toggle('hit', set.has(g.dataset.id));
    });
  },

  // ── 皮肤接口 ──
  update(vm, ctx) {
    if (ctx) {
      const t = ctx.theme ?? {};
      const bk = `${ctx.persona?.id ?? ''}|${t.name ?? ''}|${ctx.charId ?? t.characterId ?? ''}`;
      if (bk !== this._brandKey) { const elm = this._root; this.mount(elm, { ...ctx, vm }); return; }
      this._ctx = ctx;
    }
    if (vm && vm === this._vm) return; // 同 vm 跳过整绘（保留选中/滚动）
    this._vm = vm;
    if (this._root) this._paint();
  },
  highlight(ids) {
    this._qhit = new Set(ids ?? []);
    if (this._root) this._applyHi(ids);
  },
  select(id) { if (this._root) this._select(id); },
  unmount() {
    this._root?.replaceChildren();
    this._root = this._dsr = null;
    this._vm = null; this._ctx = null;
    this._sel = null; this._qhit = new Set();
    this._pos = {}; this._drawn = new Set(); this._pins = new Set();
  },
};
