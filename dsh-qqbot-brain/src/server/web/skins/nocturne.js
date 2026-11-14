// 夜航星图（nocturne）皮肤：概念图 b-nocturne 还原。
// 鎏金星盘 / 星云银河 canvas / 时间指针扫掠 / 彗星(≤3)·流星 / 鼠标视差 / 切人设颜色补间 /
// 侧栏「今夜星语 · 本命星座 · 自己的星」/ 星历六块（七日星象/被想起/将隐没/观测对象/星等/星座谱）。
// 数据一律消费 ctx.vm（core/vm.js buildMapVM）；皮肤自身不 fetch。
// LOD：星体 ≤150（quotaPick 三 kind 按比例）、常驻标签 ≤24（labelPick）、连线 ≤200（derived 优先）。

import { el, fmtT } from '../core/ui.js';
import { getPref, setPref, hashColor, DEFAULT_MOODS } from '../core/theme.js';
import {
  kindLabel, quotaPick, labelPick, relationWhy, REL_LABEL, previewText,
  emotionOps, emotionBucket, EMO_NAME,
} from '../core/vm.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const C = 380, RO = 330;
const R = { attitude: 132, semantic: 206, episodic: 280 };
const STAR_CAP = 150, LABEL_CAP = 24, EDGE_CAP = 200, COMET_MAX = 3;
const PERIOD = 48000, DAY_MS = 86400e3;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = (t, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, t);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const pt = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];
const ang = (d) => -Math.PI / 2 + Math.sqrt(Math.max(0, d) / 32) * Math.PI * 1.8;
const sameLocalDay = (a, b) => {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};
const hhmm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const hex2rgb = (h) => {
  h = String(h).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
// 关系类型 → 星图线型：沉淀=可见弧；相似=虚线点选后显；会话/发言人=细线点选后显
const relType = (r) => r.primary === 'derived' ? 'consolidate'
  : (r.primary === 'session' || r.primary === 'actor') ? 'session' : 'similar';

// 切人设颜色补间的跨挂载记忆（壳层切人设=整视图重挂，模块级记住上次色板）
let LAST_PAL = null;

export default {
  id: 'nocturne',
  label: '星图',

  // §4.3 管理端 token 集（P3 消费）：夜空暗色；accent 由消费方按当前人设 a/a2 覆盖
  tokens: {
    '--bg': '#070b18', '--panel': '#0c1328', '--ink': '#ebe2cb',
    '--ink2': 'rgba(235,226,203,.62)', '--line': 'rgba(216,184,120,.22)',
    '--accent': '#3d7bff', '--accent2': '#8ec5ff', '--danger': '#ff6f86',
    '--font-head': '"Songti SC","Noto Serif SC",serif', '--font-body': '-apple-system,"PingFang SC",sans-serif',
  },

  mount(root, ctx) {
    this.unmount(); // 防御：上次未净时先清
    this._root = root;
    this._ctx = ctx;
    this._vm = ctx?.vm ?? null;
    this._sel = null;
    this._pos = {};        // id → [x,y]
    this._edgeEls = [];
    this._starEls = new Map();
    this._cls = new Map();   // 元素→{sel,near,dim,hi} class 状态缓存（_syncCls 差分写入用）
    this._relMap = null; this._relMapVm = null;
    this._stars = [];      // 扫掠用 {id,a,fl,r,hit}
    this._comets = null; this._cometN = 0;
    this._skyStars = []; this._meteors = [];
    this._raf = 0; this._themeRaf = 0;
    this._lastT = 0; this._mx = 0; this._my = 0; this._tx = 0; this._ty = 0;
    this._t0 = performance.now();
    this._nextMeteor = 0; this._nextComet = 0;
    this._qhit = new Set();
    this._almHi = null;
    this._selfOpen = false;

    const theme = ctx?.theme ?? {};
    const title = theme.title || theme.name || '星图';
    this._brandKey = `${ctx?.persona?.id ?? ''}|${theme.name ?? ''}|${ctx?.charId ?? theme.characterId ?? ''}`;
    // 强制静帧：?still=1 / 系统减动效 —— 此时连「动效」开关也禁用；
    // ctx.motion.still 仅因 brain-motion 偏好而关时允许皮肤内再开
    const params = new URLSearchParams(location.search);
    let reduced = false;
    try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* noop */ }
    this._hardStill = params.has('still') || reduced;
    this._motion = this._hardStill ? false : !ctx?.motion?.still;

    const moodWord = this._vm?.mood?.word ?? null;
    const moodc = (moodWord && theme.moodColors?.[moodWord]) || hashColor(moodWord || '?');
    this._a2c = theme.a2 || '#8ec5ff';

    root.innerHTML = `
      <div class="noc${this._motion ? '' : ' still'}" style="--a:${esc(theme.a)};--a2:${esc(theme.a2)};--moodc:${esc(moodc)}">
        <div class="bg" aria-hidden="true"><div class="bgp">
          <div class="neb n1"></div><div class="neb n2"></div><div class="neb n3"></div>
          <div class="band"></div><canvas id="nstar"></canvas>
        </div></div>
        <div class="wrap">
          <header class="mast">
            <div class="l">Nocturne Atlas<br>心智星图</div>
            <h1 id="nName">—</h1><div class="r" id="nDl">—</div>
          </header>
          <div class="sub"><span id="nTag">—</span><span><span id="nSt">—</span><button class="mot" id="nMot" type="button" aria-pressed="${this._motion}"${this._hardStill ? ' disabled' : ''}>动效</button></span></div>
          <div class="grid">
            <div class="chart"><svg id="sky" viewBox="0 0 760 760" width="100%" role="group" aria-label="${esc(title)}的夜航星图：点选星体查看记忆"></svg>
              <div class="legend">
                <span><svg width="14" height="14"><circle cx="7" cy="7" r="3.5" fill="var(--a2)"/><circle cx="7" cy="7" r="6" fill="none" stroke="var(--a2)" stroke-width=".7"/></svg>${esc(title)}自己的星</span>
                <span><svg width="10" height="10"><circle cx="5" cy="5" r="3" fill="#ebe2cb"/></svg>共享的星</span>
                <span><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke="#ebe2cb" stroke-opacity=".6"/></svg>沉淀成星座</span>
                <span><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke="#ebe2cb" stroke-opacity=".4" stroke-dasharray="1 3"/></svg>彼此相似（点选后显示）</span>
                <span>由内而外 · 态度 / 语义 / 情景 · 顺时针渐远</span>
              </div>
            </div>
            <aside class="side" id="nSide"></aside>
          </div>
          <div class="alm" id="nAlm"></div>
          <div class="foot"><span>NOCTURNE ATLAS</span><span>星等＝重要度 · 亮度＝保持率 · 上限 ${STAR_CAP} 星</span></div>
        </div>
      </div>`;

    const q = (s) => root.querySelector(s);
    this._noc = q('.noc');
    this._sky = q('#sky');
    this._side = q('#nSide');
    this._alm = q('#nAlm');
    this._canvas = q('#nstar');
    this._c2d = this._canvas.getContext('2d');
    this._bgp = q('.bgp');
    this._mot = q('#nMot');

    this._mot.onclick = () => this._setMotion(!this._motion);
    this._onResize = () => this._sizeSky();
    addEventListener('resize', this._onResize);
    this._onMove = (e) => {
      this._tx = (e.clientX / innerWidth - .5) * -20;
      this._ty = (e.clientY / innerHeight - .5) * -20;
    };
    addEventListener('mousemove', this._onMove);
    this._onVis = () => {
      if (document.hidden) { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }
      else if (this._motion && !this._raf) { this._lastT = performance.now(); this._raf = requestAnimationFrame((t) => this._frame(t)); }
    };
    document.addEventListener('visibilitychange', this._onVis);

    // 人设色补间：模块级记住上次色板，重挂后从旧色缓到新色
    const pal = { '--a': theme.a || '#3d7bff', '--a2': theme.a2 || '#8ec5ff', '--moodc': moodc };
    if (LAST_PAL && (LAST_PAL['--a'] !== pal['--a'] || LAST_PAL['--a2'] !== pal['--a2'] || LAST_PAL['--moodc'] !== pal['--moodc'])) {
      this._tweenPal(LAST_PAL, pal);
    }
    LAST_PAL = pal;

    try { this._sizeSky(); } catch (e) { root.dataset.err = 'sky:' + e.message; throw e; }
    try { this._paint(); } catch (e) { root.dataset.err = 'paint:' + e.message + '|' + (e.stack || '').split('\n').slice(0, 4).join('~'); throw e; }
    if (this._motion) this._raf = requestAnimationFrame((t) => { this._lastT = t; this._frame(t); });
    root.dataset.mounted = '1';
  },

  // ── 整绘：刊头 + 星盘 + 侧栏 + 星历（数据到达/刷新时调用）──
  _paint() {
    const vm = this._vm, theme = this._ctx?.theme ?? {};
    const title = theme.title || theme.name || '星图';
    const q = (s) => this._root.querySelector(s);
    q('#nName').replaceChildren();
    const h1 = q('#nName');
    h1.append(document.createTextNode(title));
    const sm = document.createElement('small'); sm.textContent = theme.en || '';
    h1.append(sm);
    const d = new Date(vm?.now ?? Date.now());
    q('#nDl').innerHTML = `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}<br>观测者 · 你`;
    const pName = this._ctx?.persona?.name ?? '';
    q('#nTag').textContent = `「${theme.tagline || '……'}」${pName ? ` · ${pName}` : ''}`;

    this._draw();
    const self = this._drawnCount?.self ?? 0;
    const total = this._drawnCount?.total ?? 0;
    q('#nSt').textContent = vm
      ? `星 ${total}/${vm.notes.length} · 本命 ${self} · 共享 ${total - self} · 星座线 ${this._edgeEls.length}`
      : '星图加载中……';
    this._paintSide();
    this._paintAlmanac();
  },

  _moodColor(word) {
    const t = this._ctx?.theme ?? {};
    return t.moodColors?.[word] || hashColor(word || '?');
  },

  // LOD：quotaPick 取星（三 kind 按比例）；选中星被截也保证进绘制集？——否：截掉的仍可在侧栏看详情但不画
  _drawnNotes() {
    const vm = this._vm;
    if (!vm) return [];
    return quotaPick(vm.notes, STAR_CAP);
  },

  _edges(drawn) {
    const set = new Set(drawn.map((n) => n.id));
    const rels = (this._vm?.relations ?? []).filter((r) => set.has(r.a) && set.has(r.b));
    rels.sort((a, b) => (a.primary === 'derived' ? 0 : 1) - (b.primary === 'derived' ? 0 : 1) || b.score - a.score);
    return rels.slice(0, EDGE_CAP).map((r) => ({ a: r.a, b: r.b, t: relType(r) }));
  },

  // ── 星盘 SVG ──
  _draw() {
    const s = this._sky, vm = this._vm, theme = this._ctx?.theme ?? {};
    s.replaceChildren();
    this._pos = {}; this._edgeEls = []; this._starEls.clear(); this._stars = [];
    this._cls?.clear(); this._cometN = 0;

    const defs = svg('defs', {}, s);
    const soft = svg('filter', { id: 'nsoft', x: '-80%', y: '-80%', width: '260%', height: '260%' }, defs);
    svg('feGaussianBlur', { stdDeviation: 2.4 }, soft);
    const soft2 = svg('filter', { id: 'nsoft2', x: '-120%', y: '-120%', width: '340%', height: '340%' }, defs);
    svg('feGaussianBlur', { stdDeviation: 5 }, soft2);
    for (const [k, r] of Object.entries(R)) {
      svg('path', { id: 'no-' + k, d: `M${C - r} ${C} A${r} ${r} 0 0 1 ${C + r} ${C}` }, defs);
    }
    const g1 = svg('linearGradient', { id: 'ngsem', gradientUnits: 'userSpaceOnUse', x1: 110, y1: 0, x2: 650, y2: 760 }, defs);
    g1.innerHTML = `<stop offset="0%" stop-color="var(--a)"/><stop offset="55%" stop-color="var(--a2)"/><stop offset="100%" stop-color="var(--a)"/>`;
    const g2 = svg('radialGradient', { id: 'ncg', cx: '50%', cy: '50%', r: '50%' }, defs);
    g2.innerHTML = `<stop offset="0%" stop-color="var(--a2)" stop-opacity=".5"/><stop offset="45%" stop-color="var(--a)" stop-opacity=".22"/><stop offset="100%" stop-color="var(--a)" stop-opacity="0"/>`;
    const g3 = svg('radialGradient', { id: 'nwg', gradientUnits: 'userSpaceOnUse', cx: C, cy: C, r: RO }, defs);
    g3.innerHTML = `<stop offset="0%" stop-color="var(--a2)" stop-opacity=".13"/><stop offset="100%" stop-color="var(--a2)" stop-opacity="0"/>`;
    const g4 = svg('radialGradient', { id: 'nspA', cx: '50%', cy: '50%', r: '50%' }, defs);
    g4.innerHTML = `<stop offset="0%" stop-color="var(--a2)" stop-opacity=".8"/><stop offset="42%" stop-color="var(--a2)" stop-opacity=".38"/><stop offset="100%" stop-color="var(--a2)" stop-opacity="0"/>`;
    const g5 = svg('radialGradient', { id: 'nspC', cx: '50%', cy: '50%', r: '50%' }, defs);
    g5.innerHTML = `<stop offset="0%" stop-color="#ebe2cb" stop-opacity=".65"/><stop offset="42%" stop-color="#ebe2cb" stop-opacity=".3"/><stop offset="100%" stop-color="#ebe2cb" stop-opacity="0"/>`;

    // 背景微星（固定种子）
    let seed = 11;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 140; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * RO;
      svg('circle', {
        cx: C + r * Math.cos(a), cy: C + r * Math.sin(a), r: rnd() * .7 + .2,
        fill: '#ebe2cb', class: 'mstar',
        style: `--o:${rnd() * .3 + .06};--d:${3 + rnd() * 6}s;animation-delay:${-rnd() * 8}s;opacity:var(--o)`,
      }, s);
    }

    // 星盘外环 + 刻度盘 + 时间标记
    svg('circle', { cx: C, cy: C, r: RO, fill: 'none', stroke: 'var(--gold)', 'stroke-width': .9 }, s);
    svg('circle', { cx: C, cy: C, r: RO + 22, fill: 'none', stroke: 'var(--gold2)', 'stroke-width': .7 }, s);
    const dial = svg('g', { class: 'dial' }, s);
    for (let i = 0; i < 360; i += 2) {
      const a = i * Math.PI / 180, L = i % 30 === 0 ? 10 : i % 10 === 0 ? 6 : 3;
      const [x1, y1] = pt(RO, a), [x2, y2] = pt(RO + L, a);
      svg('line', { x1, y1, x2, y2, stroke: i % 30 === 0 ? 'var(--gold)' : i % 10 === 0 ? 'var(--gold2)' : 'var(--gold3)', 'stroke-width': i % 30 === 0 ? .9 : .55 }, dial);
    }
    for (const [dd, l] of [[0, '今'], [1, '一日'], [3, '三日'], [7, '七日'], [14, '半月'], [28, '一月']]) {
      const a = ang(dd), [x, y] = pt(RO + 36, a), [x1, y1] = pt(RO - 4, a), [x2, y2] = pt(R.attitude - 16, a);
      svg('line', { x1, y1, x2, y2, stroke: 'var(--gold3)', 'stroke-dasharray': '1 5' }, s);
      svg('text', { x, y: y + 4, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--gold2)' }, s).textContent = l;
    }

    // 三轨轨道
    svg('circle', { cx: C, cy: C, r: (R.attitude + R.episodic) / 2, fill: 'none', stroke: 'var(--a)', 'stroke-width': R.episodic - R.attitude, opacity: .04 }, s);
    for (const [k, r] of Object.entries(R)) {
      const sem = k === 'semantic';
      svg('circle', { cx: C, cy: C, r, fill: 'none', stroke: sem ? 'url(#ngsem)' : 'var(--gold3)', 'stroke-width': sem ? .9 : .7, 'stroke-dasharray': sem ? '' : '2 4', opacity: sem ? .5 : 1 }, s);
      const t = svg('text', { class: 'ring-t', dy: -6 }, s);
      svg('textPath', { href: '#no-' + k, startOffset: '50%', 'text-anchor': 'middle' }, t)
        .textContent = `${kindLabel(k)} · ${k.toUpperCase()}`;
    }

    // 中心：光晕 + 日冕射线 + 人格刻度 + 内圆盘
    svg('circle', { cx: C, cy: C, r: 95, fill: 'url(#ncg)' }, s);
    const rays = svg('g', { class: 'rays' }, s);
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, len = 26 + (i * 37) % 40;
      const [x1, y1] = pt(40, a), [x2, y2] = pt(40 + len, a);
      svg('line', { x1, y1, x2, y2, stroke: 'var(--gold2)', 'stroke-width': .6, 'stroke-linecap': 'round', opacity: .8 }, rays);
    }
    const traits = theme.traits ?? [];
    traits.forEach(([name, v], i) => {
      const n = traits.length, a = -Math.PI / 2 + (i + .5) * 2 * Math.PI / n;
      const [x1, y1] = pt(34, a), [x2, y2] = pt(34 + v * 52, a), [tx, ty] = pt(34 + v * 52 + 14, a);
      svg('line', { x1, y1, x2, y2, stroke: 'var(--c2)', 'stroke-width': .8 }, s);
      svg('circle', { cx: x2, cy: y2, r: 1.8, fill: 'var(--a2)' }, s);
      svg('text', { x: tx, y: ty + 4, 'text-anchor': Math.cos(a) > .3 ? 'start' : Math.cos(a) < -.3 ? 'end' : 'middle', 'font-size': 11, fill: 'var(--c2)' }, s).textContent = name;
    });
    svg('circle', { cx: C, cy: C, r: 34, fill: 'none', stroke: 'var(--gold3)', 'stroke-width': .6 }, s);
    svg('circle', { cx: C, cy: C, r: 30, fill: 'var(--night)', stroke: 'var(--gold)', 'stroke-width': .8 }, s);
    svg('circle', { cx: C, cy: C, r: 26, fill: 'none', stroke: 'var(--a2)', 'stroke-width': .6 }, s);
    const cn = svg('text', { x: C, y: C + 8, 'text-anchor': 'middle', 'font-size': 22, fill: 'var(--cream)', style: 'cursor:pointer' }, s);
    cn.textContent = theme.mono || '脑';
    cn.addEventListener('click', () => this.select(null));

    // 情绪带：RO+11 连续弧段；当前情绪词加粗 + 呼吸圈
    const moods = theme.moods ?? [];
    const curWord = vm?.mood?.word ?? null;
    const mi = moods.findIndex((w) => w === curWord);
    if (moods.length) {
      const stepA = 2 * Math.PI / moods.length, arcR = RO + 11;
      moods.forEach((w, i) => {
        const cur = i === mi, gap = stepA * .16;
        const a0 = -Math.PI / 2 + stepA * i + gap, a1 = -Math.PI / 2 + stepA * (i + 1) - gap;
        const [x1, y1] = pt(arcR, a0), [x2, y2] = pt(arcR, a1);
        const dd = `M${x1} ${y1}A${arcR} ${arcR} 0 0 1 ${x2} ${y2}`;
        const col = this._moodColor(w);
        if (cur) svg('path', { d: dd, fill: 'none', stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: .16 }, s);
        svg('path', { d: dd, fill: 'none', stroke: col, 'stroke-width': cur ? 3 : 1.5, 'stroke-linecap': 'round', opacity: cur ? 1 : .35 }, s);
      });
      if (mi >= 0) {
        const [mx, my] = pt(arcR, -Math.PI / 2 + stepA * (mi + .5));
        svg('circle', { cx: mx, cy: my, r: 9, fill: 'none', stroke: this._moodColor(curWord), 'stroke-width': .8, class: 'breathe' }, s);
      }
    }

    // 星位：角度=√(day/32)，碰撞沿角推移
    const drawn = this._drawnNotes();
    this._drawnCount = {
      total: drawn.length,
      self: drawn.filter((n) => n.track === 'self').length,
    };
    const taken = [];
    for (const m of [...drawn].sort((a, b) => a.day - b.day)) {
      let a = ang(m.day), r = R[m.kind] ?? R.episodic, k = 0;
      while (taken.some(([x, y]) => Math.hypot(x - pt(r, a)[0], y - pt(r, a)[1]) < 30) && k < 60) { k++; a += .045; }
      this._pos[m.id] = pt(r, a); taken.push(this._pos[m.id]);
    }

    // 时间指针（楔形扫掠）
    this._hand = svg('g', { transform: `rotate(-90 ${C} ${C})` }, s);
    const [wx0, wy0] = pt(RO, 0), [wx1, wy1] = pt(RO, -.42);
    this._wedge = svg('path', { d: `M${C} ${C}L${wx0} ${wy0}A${RO} ${RO} 0 0 0 ${wx1} ${wy1}Z`, fill: 'url(#nwg)', class: 'wedge' }, this._hand);
    svg('line', { x1: C, y1: C, x2: C + RO, y2: C, stroke: 'var(--gold)', 'stroke-opacity': .6, 'stroke-width': .8 }, this._hand);
    if (!this._motion) { this._hand.setAttribute('opacity', '.4'); this._wedge.setAttribute('opacity', 0); }

    const ge = svg('g', {}, s);
    this._comets = svg('g', {}, s);
    const gn = svg('g', {}, s);

    // 连线：巩固弧常显，相似/会话点选后显
    for (const l of this._edges(drawn)) {
      const [x1, y1] = this._pos[l.a], [x2, y2] = this._pos[l.b];
      const mx = (x1 + x2) / 2 - C, my = (y1 + y2) / 2 - C, md = Math.hypot(mx, my) || 1, k = Math.max(md, 175) / md;
      const e = svg('path', {
        d: `M${x1} ${y1} Q${C + mx * k} ${C + my * k} ${x2} ${y2}`, fill: 'none',
        class: 'edge', 'data-a': l.a, 'data-b': l.b, 'data-t': l.t,
        stroke: '#ebe2cb', 'stroke-opacity': l.t === 'consolidate' ? .5 : 0,
        'stroke-width': .8, 'stroke-dasharray': l.t === 'similar' ? '1 4' : '',
      }, ge);
      this._edgeEls.push({ el: e, a: l.a, b: l.b, t: l.t, on: false });
    }
    if (this._motion) {
      let di = 0;
      this._edgeEls.forEach((e) => {
        if (e.t !== 'consolidate') return;
        e.len = e.el.getTotalLength();
        e.el.style.setProperty('--len', e.len);
        e.el.classList.add('draw');
        e.el.style.animationDelay = (1 + di++ * .18) + 's';
      });
      this._edgeCleanup = (ev) => { if (ev.target?.classList?.contains('draw')) ev.target.classList.remove('draw'); };
      ge.addEventListener('animationend', this._edgeCleanup);
    }

    // 星体
    const labelSet = labelPick(drawn, LABEL_CAP, 2);
    for (const m of drawn) {
      const [x, y] = this._pos[m.id];
      const r = 1.6 + (m.imp ?? 1) * .9;
      const g = svg('g', { class: 'star', 'data-id': m.id, transform: `translate(${x} ${y})` }, gn);
      svg('circle', { r: 14, fill: 'transparent' }, g);
      const op = .3 + (m.ret ?? 0) * .7;
      const core = svg('g', { class: 'core', style: `animation-delay:${.1 + (m.day || 0) * .03}s` }, g);
      const fl = svg('circle', { r: r + 2, fill: m.track === 'self' ? 'var(--a2)' : '#ebe2cb', opacity: 0, filter: 'url(#nsoft)' }, g);
      this._stars.push({ id: m.id, a: Math.atan2(y - C, x - C), fl, r, hit: -1e9 });
      const self = m.track === 'self', col = self ? 'var(--a2)' : '#ebe2cb';
      if (self) svg('circle', { r: r + 7, fill: 'var(--a2)', opacity: .15, filter: 'url(#nsoft2)' }, core);
      else svg('circle', { r: r + 4, fill: '#ebe2cb', opacity: .1, filter: 'url(#nsoft)' }, core);
      svg('circle', { r, fill: col, opacity: op }, core);
      if (self || (m.imp ?? 0) >= 4) {
        const L = r * 3;
        svg('path', { d: `M${-L} 0H${L}M0 ${-L}V${L}`, fill: 'none', stroke: `url(#${self ? 'nspA' : 'nspC'})`, 'stroke-width': .7, 'stroke-linecap': 'round' }, core);
      }
      const right = x >= C;
      const lab = svg('text', { class: 'lab' + (labelSet.has(m.id) ? '' : ' h'), x: right ? r + 8 : -r - 8, y: 4, 'text-anchor': right ? 'start' : 'end' }, g);
      lab.textContent = m.title;
      g.addEventListener('click', () => this.select(m.id));
      this._starEls.set(m.id, g);
    }
    if (this._qhit.size) this._applyHi([...this._qhit]);
    if (this._sel) this._focusClasses();
  },

  // relations → id→[{rel,otherId}] 邻接表（每 vm 建一次；select 路径原来每次扫全表 ~1.9w 条）
  _relMapFor() {
    if (this._relMapVm === this._vm) return this._relMap;
    const map = new Map();
    for (const r of this._vm?.relations ?? []) {
      for (const [me, other] of [[r.a, r.b], [r.b, r.a]]) {
        let l = map.get(me); if (!l) map.set(me, l = []);
        l.push({ rel: r, otherId: other });
      }
    }
    this._relMap = map; this._relMapVm = this._vm;
    return map;
  },

  // 元素 class 状态缓存：_syncCls 只对真实变化的 token 写 DOM（点击路径原来每次
  // _clearHi+_focusClasses 对 ~350 元素无条件 toggle，是卡顿主因之一）
  _syncCls(el, want) {
    const cur = this._cls.get(el) ?? {};
    const next = { ...cur, ...want };
    for (const k of ['sel', 'near', 'dim', 'hi']) {
      const v = !!next[k];
      if (!!cur[k] !== v) el.classList.toggle(k, v);
    }
    this._cls.set(el, next);
  },

  // ── 侧栏 ──
  _neighbors(id) {
    const out = [];
    for (const x of this._relMapFor().get(id) ?? []) {
      const other = this._vm?.byId?.[x.otherId];
      if (other) out.push({ rel: x.rel, other });
    }
    return out.slice(0, 12);
  },

  _selfCluster() {
    const vm = this._vm;
    const ids = new Set(vm.notes.filter((n) => n.track === 'self').map((n) => n.id));
    const adj = {};
    (vm.relations ?? []).filter((r) => r.primary === 'derived' && ids.has(r.a) && ids.has(r.b))
      .forEach((l) => { (adj[l.a] = adj[l.a] || []).push(l.b); (adj[l.b] = adj[l.b] || []).push(l.a); });
    const seen = new Set(), comps = [];
    for (const id of Object.keys(adj)) {
      if (seen.has(id)) continue;
      const comp = [], q = [id]; seen.add(id);
      while (q.length) { const c = q.pop(); comp.push(c); for (const n of adj[c] || []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
      if (comp.length >= 2) comps.push(comp);
    }
    comps.sort((a, b) => b.length - a.length);
    if (!comps.length) {
      const top = vm.notes.filter((n) => n.track === 'self').sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0))[0];
      return top ? { ids: [top.id], hub: top, members: [top] } : null;
    }
    const comp = comps[0], ms = comp.map((id) => vm.byId[id]);
    const hub = ms.filter((m) => m.kind === 'attitude').sort((a, b) => (b.hits ?? 0) - (a.hits ?? 0))[0] || ms[0];
    return { ids: comp, hub, members: ms };
  },

  _sec(text) { return el('div', 'sec', text); },

  _paintSide() {
    const side = this._side, vm = this._vm, theme = this._ctx?.theme ?? {};
    side.replaceChildren();
    if (!vm) { side.append(el('div', 'empty', '星图加载中……')); return; }
    const id = this._sel, n = id && vm.byId?.[id];
    if (n) this._sideDetail(n);
    else this._sideOverview();
  },

  _sideOverview() {
    const side = this._side, vm = this._vm, theme = this._ctx?.theme ?? {};
    const title = theme.title || theme.name || '星图';
    side.append(el('div', 'kicker', 'Persona · 本星'));
    side.append(el('h2', '', title));
    if (theme.tagline) {
      const tg = el('div', ''); tg.style.cssText = 'font:13px var(--serif);color:var(--c2)';
      tg.textContent = theme.tagline; side.append(tg);
    }
    side.append(el('div', 'quote', vm.say || '……'));

    side.append(this._sec('此刻的情绪'));
    const mood = el('div', 'mood');
    const w = vm.mood?.word;
    const b = el('b', '', w || '—');
    if (w) b.style.color = this._moodColor(w);
    mood.append(b, el('span', '', w ? `强度 ${(+(vm.mood.a) || 0).toFixed(2)}` : '无情绪记录'));
    side.append(mood);
    if (theme.moods?.length) {
      const mw = el('div', 'mw');
      theme.moods.forEach((m) => { const sp = el('span', m === w ? 'on' : '', m); mw.append(sp); });
      side.append(mw);
    }

    if (theme.traits?.length) {
      side.append(this._sec(`人格的${['', '一', '二', '三', '四', '五', '六'][theme.traits.length] || theme.traits.length}个方位`));
      theme.traits.forEach(([nm, v]) => {
        const tr = el('div', 'tr');
        tr.append(el('span', '', nm));
        const ln = el('span', 'ln'); const i = document.createElement('i'); i.style.width = `${v * 100}%`; ln.append(i);
        tr.append(ln, el('em', '', v.toFixed(2)));
        side.append(tr);
      });
    }

    // 今夜星语：最新的自我轨记忆（真实数据替代概念虚构段落）
    const newest = vm.notes.filter((n2) => n2.track === 'self').sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))[0];
    if (newest) {
      side.append(this._sec('今夜星语'));
      const p = el('p', 'astro');
      const sl = el('span', 'sl', `「${newest.title}」`);
      sl.onclick = () => this.select(newest.id);
      p.append(sl, document.createTextNode(` — ${previewText(newest, vm.notes).slice(0, 60)}`));
      side.append(p);
    }

    const bc = this._selfCluster();
    if (bc) {
      side.append(this._sec(`本命星座 · ${bc.ids.length} 星`));
      const p = el('p', 'astro');
      p.textContent = `「${bc.hub.title}」${bc.ids.length > 1 ? `牵着 ${bc.ids.length - 1} 颗本命星：${bc.members.slice(0, 5).map((m) => m.title).join(' · ')}` : '独自亮着。'}`;
      if (bc.ids.length > 1) { p.style.cursor = 'pointer'; p.onclick = () => this._focusSet(bc.ids); }
      side.append(p);
    }

    const ss = vm.notes.filter((n2) => n2.track === 'self');
    if (ss.length) {
      side.append(this._sec(`${title}自己的星`));
      const ul = el('ul', 'rel');
      const shown = this._selfOpen ? ss : ss.slice(0, 5);
      shown.forEach((m) => {
        const li = el('li');
        const sp = el('span', '', m.title);
        li.append(sp, el('small', '', kindLabel(m.kind)));
        li.onclick = () => this.select(m.id);
        ul.append(li);
      });
      if (ss.length > 5) {
        const li = el('li', 'more');
        li.append(el('span', '', this._selfOpen ? '收起' : `另外 ${ss.length - 5} 颗`), el('small', '', this._selfOpen ? '↑' : '展开 →'));
        li.onclick = () => { this._selfOpen = !this._selfOpen; this._paintSide(); };
        ul.append(li);
      }
      side.append(ul);
    }
  },

  _sideDetail(n) {
    const side = this._side, vm = this._vm, theme = this._ctx?.theme ?? {};
    const title = theme.title || theme.name || '星图';
    const back = el('button', 'back', '← 回到本星'); back.type = 'button';
    back.onclick = () => this.select(null);
    side.append(back);
    const kick = el('div', 'kicker', `${kindLabel(n.kind)} · ${n.track === 'self' ? '只属于' + title : '众星共享'}`);
    kick.style.marginTop = '20px';
    side.append(kick, el('h2', '', n.title), el('p', 'body', n.content));
    if (!this._pos[n.id]) side.append(el('div', 'empty', '该星在当前星图 LOD 之外，未画出。'));

    const dl = el('dl', 'meta');
    const row = (dt, dd) => { dl.append(el('dt', '', dt), dd); };
    const thr = vm.config?.forgetThreshold ?? .2;
    const dim = el('dd', '', `${Math.round((n.ret ?? 0) * 100)}%${(n.fading || n.ret <= thr) ? '　· 将隐没' : ''}`);
    row('亮度', dim);
    row('星等', el('dd', '', '✦'.repeat(Math.min(5, Math.round(n.imp ?? 0))) + ' ' + (n.imp ?? 0) + '/5'));
    row('被想起', el('dd', '', `${n.hits ?? 0} 次`));
    row('出处', el('dd', '', `${n.sess || '—'}${n.who ? ' · ' + n.who : ''} · ${n.day ? `${n.day} 日前` : '今日'}`));
    if (n.emo) {
      const dd = el('dd', '', n.emo + (n.emoLabel ? ` · ${n.emoLabel}` : ''));
      dd.style.color = this._moodColor(n.emo);
      row('情绪', dd);
    }
    row('形成', el('dd', '', fmtT(n.createdAt, vm.now)));
    side.append(dl);

    const nb = this._neighbors(n.id);
    side.append(this._sec(`同一星座 · ${nb.length}`));
    const ul = el('ul', 'rel');
    if (!nb.length) ul.append(el('li', '', '孤星'));
    nb.forEach(({ rel, other }) => {
      const li = el('li');
      li.append(el('span', '', other.title), el('small', '', REL_LABEL[rel.primary] ?? '关联'));
      li.title = relationWhy(rel, other);
      li.onclick = () => this.select(other.id);
      ul.append(li);
    });
    side.append(ul);
  },

  // ── 星历六块 ──
  _weekEmo() {
    const vm = this._vm;
    const words = vm?.moodWords?.length ? vm.moodWords : DEFAULT_MOODS;
    const def = words.length === DEFAULT_MOODS.length && DEFAULT_MOODS.every((w) => words.includes(w));
    const emos = emotionOps(this._ctx?.ops);
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date((vm?.now ?? Date.now()) - i * DAY_MS);
      const hit = emos.find((e) => sameLocalDay(e.t, d)); // ops new→old：首个命中=当日最新
      const word = hit ? ((hit.state.mood || '').trim() || (def ? EMO_NAME[emotionBucket(hit.state)] : null)) : null;
      out.push({ d: i, word, a: hit ? Math.max(0, Math.min(1, +(hit.state.a) || 0)) : 0, has: !!hit });
    }
    return out;
  },

  _constellations() {
    const vm = this._vm, drawn = new Set(Object.keys(this._pos));
    const adj = {};
    (vm?.relations ?? []).filter((r) => r.primary === 'derived' && drawn.has(r.a) && drawn.has(r.b))
      .forEach((l) => { (adj[l.a] = adj[l.a] || []).push(l.b); (adj[l.b] = adj[l.b] || []).push(l.a); });
    const seen = new Set(), comps = [];
    for (const id of Object.keys(adj)) {
      if (seen.has(id)) continue;
      const comp = [], q = [id]; seen.add(id);
      while (q.length) { const c = q.pop(); comp.push(c); for (const n of adj[c] || []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
      if (comp.length >= 2) comps.push(comp);
    }
    comps.sort((a, b) => b.length - a.length);
    return comps.slice(0, 5).map((comp) => {
      const ms = comp.map((id) => vm.byId[id]);
      const kinds = {};
      ms.forEach((m) => { const k = kindLabel(m.kind); kinds[k] = (kinds[k] || 0) + 1; });
      const hub = ms.find((m) => m.kind === 'semantic') || ms.find((m) => m.kind === 'attitude') || ms[0];
      return { ids: comp, text: `${Object.entries(kinds).map(([k, v]) => `${k}×${v}`).join(' · ')} → ${kindLabel(hub.kind)}：${hub.title}`, n: comp.length };
    });
  },

  _paintAlmanac() {
    const alm = this._alm, vm = this._vm;
    alm.replaceChildren();
    if (!vm) return;
    const grid = el('div', 'alm-g');
    const col = (h, en) => {
      const c = el('div', 'alm-c');
      const hh = el('h4', '', h); const sm = el('small', '', en); hh.append(sm);
      c.prepend(hh); grid.append(c); return c;
    };

    // 1. 近七日星象：ops 情绪记录按日取最新；无记录日如实「—」
    const wk = this._weekEmo();
    const c1 = col('近七日星象', 'MOOD · 7D');
    const XS = (i) => 18 + i * (284 / 6), YS = (e) => 78 - e.a * 56, BASE = 80;
    const lb = (dd) => dd === 0 ? '今天' : dd === 1 ? '昨' : dd + '天前';
    const sp = svg('svg', { class: 'emo-spark', viewBox: '0 0 320 120' });
    const dl = svg('defs', {}, sp);
    const lg = svg('linearGradient', { id: 'nalmFill', x1: 0, y1: 24, x2: 0, y2: BASE, gradientUnits: 'userSpaceOnUse' }, dl);
    lg.innerHTML = `<stop offset="0" stop-color="#d8b878" stop-opacity=".15"/><stop offset="1" stop-color="#d8b878" stop-opacity="0"/>`;
    const line = wk.map((e, i) => `${i ? 'L' : 'M'}${XS(i).toFixed(1)} ${YS(e).toFixed(1)}`).join(' ');
    svg('path', { d: `${line} L${XS(6).toFixed(1)} ${BASE} L${XS(0).toFixed(1)} ${BASE} Z`, fill: 'url(#nalmFill)' }, sp);
    svg('path', { d: line, fill: 'none', stroke: 'var(--gold2)', 'stroke-width': .8 }, sp);
    wk.forEach((e, i) => {
      const x = XS(i), y = YS(e);
      if (!e.has) {
        svg('circle', { cx: x, cy: BASE - 4, r: 2.2, fill: 'none', stroke: 'var(--c3)', 'stroke-width': .8 }, sp);
        svg('text', { x, y: 110, 'text-anchor': 'middle', 'font-size': 8, fill: 'var(--c3)' }, sp).textContent = lb(e.d);
        svg('text', { class: 'ml', x, y: BASE - 10, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--c3)' }, sp).textContent = '—';
        return;
      }
      const col2 = this._moodColor(e.word);
      if (e.d === 0) svg('circle', { cx: x, cy: y, r: 9, fill: col2, opacity: .22 }, sp);
      const dot = svg('circle', { cx: x, cy: y, r: e.d === 0 ? 4.8 : 3.4, fill: col2 }, sp);
      svg('title', {}, dot).textContent = `${lb(e.d)} · ${e.word ?? '—'}`;
      svg('text', { class: 'ml', x, y: y + 17, 'text-anchor': 'middle', 'font-size': 10, fill: col2, opacity: .9 }, sp).textContent = e.word ?? '—';
      svg('text', { x, y: 110, 'text-anchor': 'middle', 'font-size': 8, fill: 'var(--c3)' }, sp).textContent = lb(e.d);
    });
    c1.append(sp);
    const astro = el('p', 'astro');
    astro.style.marginTop = '12px';
    astro.textContent = wk.slice(-3).map((e) => `${e.d === 0 ? '今日' : e.d === 1 ? '昨日' : e.d + ' 天前'} · ${e.has ? (e.word ?? '—') : '无记录'}`).join('\n');
    astro.style.whiteSpace = 'pre-line';
    c1.append(astro);

    // 2. 最近被想起（lastAccessAt 实录）
    const c2 = col('最近被想起', 'RECALL');
    const rec = el('ul', 'rec');
    if (!vm.recalls.length) rec.append(el('li', '', '还没有被唤起的记忆'));
    vm.recalls.forEach((r) => {
      const li = el('li'), n = vm.byId[r.id];
      li.append(el('time', '', hhmm(r.t)));
      const rt = el('div', 'rt');
      rt.append(el('b', '', r.title), el('span', '', `${n?.sess || '—'} · ${kindLabel(r.kind)}`));
      li.append(rt);
      li.onclick = () => this.select(r.id);
      rec.append(li);
    });
    c2.append(rec);

    // 3. 即将隐没（真实 S·ln(R/阈值)）
    const c3 = col('即将隐没', 'FADED · RETENTION');
    const fl = el('ul', 'fade');
    if (!vm.fadingSoon.length) fl.append(el('li', '', '没有临近遗忘线的记忆'));
    vm.fadingSoon.forEach((m) => {
      const n = vm.byId[m.id], li = el('li');
      const ft = el('div', 'ft');
      ft.append(el('b', '', m.title), el('span', 'kd', `${kindLabel(n?.kind)} · ${n?.track === 'self' ? '本命' : '共享'}`));
      li.append(ft);
      const bar = el('div', 'bar'); const i = document.createElement('i'); i.style.width = `${Math.round((m.ret ?? 0) * 100)}%`; bar.append(i);
      li.append(bar, el('em', '', m.days <= 0 ? '已过遗忘线' : `约 ${m.days} 天后隐没`));
      li.onclick = () => this.select(m.id);
      fl.append(li);
    });
    c3.append(fl);

    // 4. 观测对象：actor 计数 top3，点按高亮该人的星
    const c4 = col('观测对象', 'OBJECTS');
    const who = el('div', 'who');
    if (!vm.observers.length) who.append(el('div', 'empty', '暂无观测对象'));
    vm.observers.forEach(({ name, count }) => {
      const b = el('button', 'wc'); b.type = 'button'; b.dataset.who = name;
      const h = el('span', 'wch'); h.append(document.createTextNode(name), el('small', '', `${count} 星`));
      const cn = el('span', 'wcn', `关于 TA 的星 ${count}`);
      const ul = el('ul');
      vm.notes.filter((m) => m.who === name).sort((x, y) => (y.imp ?? 0) - (x.imp ?? 0)).slice(0, 3)
        .forEach((m) => ul.append(el('li', '', m.title)));
      b.append(h, cn, ul);
      b.onclick = () => this._focusWho(name);
      who.append(b);
    });
    c4.append(who);

    // 5. 星等分布 + 类型×轨道矩阵
    const c5 = col('星等分布', 'MAGNITUDE · KIND');
    const dist = [1, 2, 3, 4, 5].map((i) => vm.notes.filter((m) => Math.round(m.imp ?? 0) === i).length);
    const dmax = Math.max(...dist, 1);
    const dv = el('div', 'dist');
    dist.forEach((nn, i) => {
      const db = el('div', 'db');
      const bar = document.createElement('i'); bar.style.height = `${Math.round(nn / dmax * 100)}%`;
      db.append(bar, el('b', '', String(nn)), el('span', '', String(i + 1)));
      dv.append(db);
    });
    c5.append(dv);
    const mx = el('table', 'mx');
    const mxd = (v) => { const td = document.createElement('td'); td.textContent = v; return td; };
    const hr = document.createElement('tr');
    hr.append(el('th'), el('th', '', '自我'), el('th', '', '世界'));
    mx.append(hr);
    ['attitude', 'semantic', 'episodic'].forEach((k) => {
      const tr = document.createElement('tr');
      const th = mxd(kindLabel(k)); th.style.textAlign = 'left'; th.style.paddingLeft = '12px';
      tr.append(th,
        mxd(vm.notes.filter((m) => m.kind === k && m.track === 'self').length),
        mxd(vm.notes.filter((m) => m.kind === k && m.track === 'world').length));
      mx.append(tr);
    });
    c5.append(mx);

    // 6. 星座谱：巩固边连通分量 top5，点按整组高亮
    const c6 = col('星座谱', 'CONSTELLATIONS');
    const cl = el('ul', 'const');
    const comps = this._constellations();
    if (!comps.length) cl.append(el('li', '', '尚无可辨认的星座'));
    comps.forEach((cp) => {
      const li = el('li');
      li.append(el('b', '', cp.text), el('span', '', `沉淀巩固 · ${cp.n} 星`));
      li.onclick = () => this._focusSet(cp.ids);
      cl.append(li);
    });
    c6.append(cl);

    alm.append(grid);
  },

  // ── 高亮/聚焦 ──
  _applyHi(ids) {
    const set = new Set(ids);
    this._starEls.forEach((g, id) => {
      const on = set.has(id);
      this._syncCls(g, { dim: !on, hi: on });
    });
    this._edgeEls.forEach((e) => this._syncCls(e.el, { dim: !(set.has(e.a) && set.has(e.b)) }));
  },
  _clearHi() {
    this._almHi = null;
    // sel 不清（选择态跨高亮保留，旧语义）；只写真正亮着的元素
    for (const [el, st] of [...this._cls]) {
      if (st.sel || st.near || st.dim || st.hi) this._syncCls(el, { near: false, dim: false, hi: false });
    }
    this._alm?.querySelectorAll('.wc').forEach((b) => b.classList.remove('on'));
  },
  _focusWho(w) {
    if (this._almHi?.type === 'who' && this._almHi.val === w) { this._clearHi(); return; }
    this._clearHi(); this._almHi = { type: 'who', val: w };
    this._applyHi((this._vm?.notes ?? []).filter((m) => m.who === w).map((m) => m.id));
    this._alm?.querySelectorAll('.wc').forEach((b) => b.classList.toggle('on', b.dataset.who === w));
  },
  _focusSet(ids) {
    const key = ids.join(',');
    if (this._almHi?.type === 'set' && this._almHi.val === key) { this._clearHi(); return; }
    this._clearHi(); this._almHi = { type: 'set', val: key };
    this._applyHi(ids);
  },
  _focusClasses() {
    const id = this._sel;
    const near = new Set(id ? [id, ...this._neighbors(id).map((x) => x.other.id)] : []);
    const qh = this._qhit;
    this._starEls.forEach((g, gid) => {
      this._syncCls(g, {
        sel: gid === id,
        near: near.has(gid) && gid !== id,
        dim: !!id && !near.has(gid) && !qh.has(gid),
      });
    });
    for (const e of this._edgeEls) {
      const on = !!id && (e.a === id || e.b === id);
      this._syncCls(e.el, { dim: !!id && !on });
      // stroke/draw 只在 on 翻转时写：原来每次 select 都 getTotalLength+getBBox 强制布局
      if (on === e.on) continue;
      e.on = on;
      if (e.t !== 'consolidate') e.el.setAttribute('stroke-opacity', on ? .45 : 0);
      if (on && this._motion) {
        e.el.style.setProperty('--len', e.len ??= e.el.getTotalLength());
        e.el.classList.remove('draw'); void e.el.getBoundingClientRect();
        e.el.style.animationDelay = '0s'; e.el.classList.add('draw');
      }
    }
  },

  // ── 动效帧：视差 / 时间指针 / 扫掠辉光 / 流星 / 彗星 ──
  _sizeSky() {
    const cv = this._canvas, ctx = this._c2d;
    if (!cv || !ctx) return;
    const r = cv.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1); // dpr 上限 2（设计 §5.3）
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    cv.width = W * d; cv.height = H * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    let seed = 97;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    this._skyStars = [];
    const cx = W / 2, cy = H * .44, phi = -.5, ux = Math.cos(phi), uy = Math.sin(phi), vx = -uy, vy = ux;
    const L = Math.hypot(W, H) * .7, bw = H * .12;
    for (let i = 0; i < 400; i++) {
      const s = (rnd() * 2 - 1) * L * .6, dd = (rnd() + rnd() + rnd() - 1.5) * bw;
      this._skyStars.push({ x: cx + ux * s + vx * dd, y: cy + uy * s + vy * dd, r: .4 + rnd(), a: .1 + rnd() * .5, ph: rnd() * 6.28, sp: .3 + rnd() * 1.1, tw: rnd() > .72 });
    }
    for (let i = 0; i < 80; i++) this._skyStars.push({ x: rnd() * W, y: rnd() * H, r: .3 + rnd() * .8, a: .05 + rnd() * .22, ph: rnd() * 6.28, sp: .25 + rnd() * .8, tw: rnd() > .5 });
    // 静态层烘焙一次：每帧只 drawImage + 画 ~28% 闪烁星，省 ~70% arc 填充
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const oc = off.getContext('2d');
    oc.setTransform(d, 0, 0, d, 0, 0);
    for (const s of this._skyStars) {
      if (s.tw) continue;
      oc.globalAlpha = s.a; oc.fillStyle = '#ebe2cb';
      oc.beginPath(); oc.arc(s.x, s.y, s.r, 0, 6.283); oc.fill();
    }
    oc.globalAlpha = 1;
    this._skyStatic = off;
    this._drawSky(performance.now(), !this._motion);
  },
  _drawSky(now, still) {
    const ctx = this._c2d, d = Math.min(2, devicePixelRatio || 1);
    const W = this._canvas.width / d, H = this._canvas.height / d;
    ctx.clearRect(0, 0, W, H);
    if (this._skyStatic) ctx.drawImage(this._skyStatic, 0, 0, W, H);
    for (const s of this._skyStars) {
      if (!s.tw) continue;
      const tw = still ? 1 : .55 + .45 * Math.sin(now * .001 * s.sp + s.ph);
      ctx.globalAlpha = s.a * tw; ctx.fillStyle = '#ebe2cb';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const m of this._meteors) {
      const u = Math.min(1, m.age / m.life), o = Math.sin(Math.PI * u);
      const tx = m.x - m.vx * 16, ty = m.y - m.vy * 16;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${.85 * o})`); g.addColorStop(.35, `${this._a2c}cc`); g.addColorStop(1, `${this._a2c}00`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${o})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 1.7, 0, 6.283); ctx.fill();
    }
  },
  _spawnMeteor() {
    const d = Math.min(2, devicePixelRatio || 1);
    const W = this._canvas.width / d;
    this._meteors.push({ x: W * (.15 + Math.random() * .7), y: -12, vx: 3.5 + Math.random() * 3, vy: 2 + Math.random() * 2.2, age: 0, life: 55 + Math.random() * 30 });
  },
  _frame(now) {
    if (!this._root) { this._raf = 0; return; }
    const dt = Math.min(.05, (now - this._lastT) / 1000 || 0); this._lastT = now;
    if (!this._motion) { this._raf = 0; return; }
    this._mx += (this._tx - this._mx) * .045; this._my += (this._ty - this._my) * .045;
    this._bgp.style.transform = `translate(${this._mx.toFixed(2)}px,${this._my.toFixed(2)}px)`;
    const t = now - this._t0, ha = -Math.PI / 2 + (t % PERIOD) / PERIOD * 2 * Math.PI;
    if (this._hand) this._hand.setAttribute('transform', `rotate(${ha * 180 / Math.PI} ${C} ${C})`);
    for (const st of this._stars) {
      let dd = ha - st.a; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      if (dd > 0 && dd < .05 && now - st.hit > 2000) st.hit = now;
      const k = Math.max(0, 1 - (now - st.hit) / 1400);
      // 仅在辉光亮/熄瞬间写 DOM：稳态 k=0 时 150 星×2 属性写全省掉
      if (k > .001 || st.w) {
        st.fl.setAttribute('opacity', (k * .55).toFixed(3));
        st.fl.setAttribute('r', st.r + 2 + (1 - k) * 9 * (k > 0));
        st.w = k > .001;
      }
    }
    if (now > this._nextMeteor) { this._nextMeteor = now + 6000 + Math.random() * 6000; this._spawnMeteor(); }
    for (let i = this._meteors.length - 1; i >= 0; i--) {
      const m = this._meteors[i]; m.age += dt * 60; m.x += m.vx; m.y += m.vy;
      if (m.age >= m.life) this._meteors.splice(i, 1);
    }
    if (now > this._nextComet) { this._nextComet = now + 6000 + Math.random() * 6000; if (this._cometN < COMET_MAX) this._launch(); }
    this._drawSky(now, false);
    this._raf = requestAnimationFrame((tt) => this._frame(tt));
  },
  // 彗星：沿已画出的巩固弧飞（情景 → 更内层方向）
  _launch() {
    const es = this._edgeEls.filter((e) => e.t === 'consolidate');
    if (!es.length || !this._comets) return;
    const e = es[Math.floor(Math.random() * es.length)], L = e.el.getTotalLength();
    const fromA = this._vm?.byId?.[e.a]?.kind === 'episodic';
    // 路径预采样：每帧 getPointAtLength×11 太贵，改查 160 点折线
    const NS = 160, pts = [];
    for (let i = 0; i <= NS; i++) pts.push(e.el.getPointAtLength(L * i / NS));
    const atRaw = (d0) => {
      const u = Math.max(0, Math.min(1, d0 / L)) * NS, i0 = Math.min(NS - 1, Math.floor(u)), f = u - i0;
      const p0 = pts[i0], p1 = pts[i0 + 1];
      return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f };
    };
    const at = (l) => atRaw(fromA ? Math.max(0, l) : Math.max(0, L - l));
    const head = svg('circle', { r: 2, fill: '#fff', filter: 'url(#nsoft)' }, this._comets);
    const segs = [];
    for (let k = 0; k < 5; k++) segs.push(svg('path', { fill: 'none', stroke: 'var(--a2)', 'stroke-linecap': 'round' }, this._comets));
    this._cometN++;
    const t0 = performance.now(), dur = 1800 + L * 4;
    const step = (now) => {
      if (!this._root || !head.isConnected) { this._cometN--; return; }
      const u = Math.min(1, (now - t0) / dur), ease = u * u * (3 - 2 * u);
      const p = at(ease * L), o = Math.sin(Math.PI * u);
      head.setAttribute('cx', p.x); head.setAttribute('cy', p.y); head.setAttribute('opacity', o);
      for (let k = 0; k < 5; k++) {
        const q1 = at(ease * L - (k + 1) * 9), q2 = at(ease * L - k * 9);
        segs[k].setAttribute('d', `M${q1.x} ${q1.y}L${q2.x} ${q2.y}`);
        segs[k].setAttribute('stroke-width', (1.5 - k * .25).toFixed(2));
        segs[k].setAttribute('opacity', (o * (.5 - k * .09)).toFixed(3));
      }
      if (u < 1) requestAnimationFrame(step);
      else { head.remove(); segs.forEach((x) => x.remove()); this._cometN--; }
    };
    requestAnimationFrame(step);
  },
  _tweenPal(from, to) {
    const root = this._noc;
    cancelAnimationFrame(this._themeRaf);
    const D = 1100, t0 = performance.now();
    const f = {}, tt = {};
    for (const k in to) { f[k] = hex2rgb(from[k]); tt[k] = hex2rgb(to[k]); }

    const apply = (e) => {
      for (const k in tt) {
        const c = f[k].map((v, i) => Math.round(v + (tt[k][i] - v) * e));
        root.style.setProperty(k, `rgb(${c.join(',')})`);
      }
    };
    if (!this._motion) { apply(1); return; }
    const step = (now) => {
      const u = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - u, 3);
      apply(e);
      if (u < 1 && this._root) this._themeRaf = requestAnimationFrame(step);
    };
    this._themeRaf = requestAnimationFrame(step);
  },
  _setMotion(on) {
    this._motion = on && !this._hardStill;
    this._noc?.classList.toggle('still', !this._motion);
    this._mot?.setAttribute('aria-pressed', String(this._motion));
    setPref('motion', this._motion);
    if (this._hand) {
      if (this._motion) {
        this._hand.removeAttribute('opacity'); this._wedge?.removeAttribute('opacity');
        this._t0 = performance.now();
        if (!this._raf) { this._lastT = performance.now(); this._raf = requestAnimationFrame((t) => this._frame(t)); }
      } else {
        this._hand.setAttribute('opacity', '.4');
        this._hand.setAttribute('transform', `rotate(-90 ${C} ${C})`);
        this._wedge?.setAttribute('opacity', 0);
      }
    }
    if (!this._motion) {
      this._meteors.length = 0; this._cometN = 0;
      this._comets?.replaceChildren();
      this._stars.forEach((st) => st.fl.setAttribute('opacity', 0));
      if (this._bgp) this._bgp.style.transform = 'translate(0,0)';
      this._mx = this._my = this._tx = this._ty = 0;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
      this._drawSky(performance.now(), true);
    }
  },

  // ── 皮肤接口 ──
  update(vm, ctx) {
    if (!this._root) return;
    if (ctx) {
      const t = ctx.theme ?? {};
      const bk = `${ctx.persona?.id ?? ''}|${t.name ?? ''}|${ctx.charId ?? t.characterId ?? ''}`;
      if (bk !== this._brandKey) {
        const el2 = this._root;
        try { this.mount(el2, { ...ctx, vm }); }
        catch (e) { el2.dataset.err2 = e.message + '|' + (e.stack || '').split('\n').slice(0, 4).join('~'); throw e; }
        return;
      }
      this._ctx = ctx;
      // 情绪词变化 → --moodc 跟随（直接写，不播补间）
      const w = vm?.mood?.word ?? null;
      const mc = (w && t.moodColors?.[w]) || hashColor(w || '?');
      this._noc?.style.setProperty('--moodc', mc);
      LAST_PAL = { '--a': t.a || '#3d7bff', '--a2': t.a2 || '#8ec5ff', '--moodc': mc };
    }
    if (vm === undefined || vm === this._vm) return;
    this._vm = vm;
    this._noc?.classList.add('instant'); // 15s 刷新不重播入场/描边动画
    if (this._sel && !vm?.byId?.[this._sel]) this._sel = null;
    this._paint();
  },

  /** 顶栏搜索命中 → 命中星增辉、其余淡出（概念 focusSet 同效果）；空数组清除 */
  highlight(ids) {
    if (!this._root) return;
    this._qhit = new Set(ids || []);
    if (this._qhit.size) this._applyHi([...this._qhit]);
    else { this._clearHi(); this._focusClasses(); }
  },

  /** 选中（顶栏点选 / ?sel= / 星历跳转）；截掉的星也显示详情但不画 */
  select(id) {
    if (!this._root || !this._vm) return;
    const nid = id && this._vm.byId?.[id] ? id : null;
    const same = nid === this._sel;
    this._clearHi();
    this._sky.querySelectorAll('.ripple').forEach((e) => e.remove());
    this._sel = nid;
    if (this._sel) {
      const g = this._starEls.get(this._sel);
      if (g) {
        svg('circle', { r: 6, fill: 'none', stroke: 'var(--a2)', 'stroke-width': .8, class: 'ripple' }, g);
        svg('circle', { r: 6, fill: 'none', stroke: 'var(--a2)', 'stroke-width': .8, class: 'ripple', style: 'animation-delay:1.2s' }, g);
      }
    }
    // 同星重复点击：聚焦态照常重算（差分写入很廉价），侧栏重建才是大头——跳过
    this._focusClasses();
    if (!same) {
      this._paintSide();
      if (this._sel && innerWidth <= 900) this._side.scrollIntoView({ behavior: 'smooth' });
    }
  },

  unmount() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._themeRaf) cancelAnimationFrame(this._themeRaf);
    this._raf = this._themeRaf = 0;
    if (this._onResize) removeEventListener('resize', this._onResize);
    if (this._onMove) removeEventListener('mousemove', this._onMove);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    this._onResize = this._onMove = this._onVis = null;
    this._root?.replaceChildren();
    this._root = null;
    this._vm = null;
    this._sel = null;
    this._cometN = 0;
    this._skyStatic = null;
    this._starEls?.clear();
    this._cls?.clear();
    this._relMap = this._relMapVm = null;
    this._edgeEls = [];
    this._stars = [];
    this._meteors = [];
  },
};
