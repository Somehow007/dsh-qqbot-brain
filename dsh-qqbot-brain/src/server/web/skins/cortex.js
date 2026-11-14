// 鲸脑皮层（cortex）皮肤：旧 page.html 展示区迁移。
// 解剖层 / 六类节点 / 连线 / 聚焦 / 神经信号 / 漂浮粒子 / 缩放平移 / 立绘气泡 / 检查器 / TOP RETENTION 原样保留；
// 记忆库等管理区已迁出（顶栏「管理」与「查看全部记忆 ↗」跳 #/admin/* → 迁移期回旧页）。
// 数据一律消费 ctx.vm（core/vm.js buildMapVM），写操作走 ctx.actions；皮肤自身不 fetch。
// 大肥鱼 + 鲸脑与旧页视觉一致；非鲸角色换标题/主色/单字头像，脑图结构与记忆三色不变。

import { el } from '../core/ui.js';
import { setPref, hashColor } from '../core/theme.js';
import {
  KIND, kindLabel, mapLabel, previewText, nodeLabel, scopeBadge, shortId,
  relationWhy, matchFacet,
} from '../core/vm.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CAP = { episodic: 10, semantic: 9, attitude: 7 };
const LABEL_N = 8, ZOOM_LABEL_W = 580;
const KIND_COLOR = { episodic: '#8f9aff', semantic: '#5fe0ff', attitude: '#e09cff' };
const WHALE_CHAR = 'whale';
const asset = (f) => new URL(`../assets/${f}`, import.meta.url).href;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svgEl = (t, attrs, txt) => {
  const e = document.createElementNS(SVGNS, t);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (txt != null) e.textContent = txt;
  return e;
};

// ── 解剖层常量（旧页原样）──
function smooth(pts) {
  const n = pts.length; let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d + 'Z';
}
const CEREBRUM = smooth([[205, 185], [275, 128], [375, 92], [490, 80], [605, 88], [705, 120], [785, 175], [835, 245], [848, 320], [825, 385], [770, 425], [690, 440], [610, 452], [520, 470], [420, 478], [340, 465], [300, 442], [292, 418], [266, 404], [226, 392], [186, 340], [170, 262]]);
const CEREBELLUM = smooth([[662, 452], [712, 428], [790, 418], [842, 442], [852, 488], [808, 520], [730, 524], [676, 500]]);
const STEM = 'M612,452 C618,500 610,540 596,590 L640,590 C652,540 664,500 670,458Z';
const SULCI = ['M282,408 C360,384 450,352 560,332 C602,324 630,302 642,282', 'M520,84 C515,150 500,220 480,262 C470,286 482,312 470,340', 'M332,448 C420,424 520,410 640,384', 'M232,200 C300,190 360,212 422,180', 'M206,282 C270,262 332,292 410,262', 'M602,120 C640,170 660,212 724,232', 'M700,302 C742,292 790,322 832,300', 'M760,382 C790,362 810,372 842,352', 'M560,96 C580,140 620,150 650,190', 'M380,110 C390,150 420,160 430,140'];
const ZONES = { emotion: { cx: 380, cy: 404, rx: 130, ry: 60 }, facet: { cx: 290, cy: 255, rx: 120, ry: 110 }, episodic: { cx: 560, cy: 415, rx: 230, ry: 72 }, semantic: { cx: 600, cy: 180, rx: 220, ry: 100 }, attitude: { cx: 700, cy: 320, rx: 120, ry: 100 } };
const REGIONS = [[108, 136, 200, 200, 'PREFRONTAL', '前额叶 · 人格', ''], [392, 42, 480, 94, 'NEOCORTEX', '新皮层 · 语义', 'semantic'], [812, 104, 808, 190, 'PARIETAL', '顶叶 · 态度', 'attitude'], [200, 546, 350, 446, 'AMYGDALA', '杏仁核 · 情绪', ''], [460, 574, 560, 474, 'HIPPOCAMPUS', '海马体 · 情景', 'episodic', 560, 590]];

const keyKind = (k) => (!k ? null : k.startsWith('facet:') ? 'facet' : k.startsWith('emo:') ? 'emotion' : 'memory');
const layoutSlots = (zone, n, box, inside, taken) => {
  const cand = [];
  for (let y = zone.cy - zone.ry; y <= zone.cy + zone.ry; y += 8) for (let x = zone.cx - zone.rx; x <= zone.cx + zone.rx; x += 8) {
    const dx = (x - zone.cx) / zone.rx, dy = (y - zone.cy) / zone.ry, d = dx * dx + dy * dy;
    if (d <= 1) cand.push([x, y, d]);
  }
  cand.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const out = [];
  for (const [x, y] of cand) {
    if (out.length >= n) break;
    const b = box(x, y);
    if (!inside(b[0], b[1]) || !inside(b[2], b[1]) || !inside(b[0], b[3]) || !inside(b[2], b[3])) continue;
    if (taken.some((t) => b[0] < t[2] + 6 && b[2] + 6 > t[0] && b[1] < t[3] + 4 && b[3] + 4 > t[1])) continue;
    taken.push(b); out.push({ x, y });
  }
  return out;
};
const labelPick = (items, n, per = 0) => {
  const ranked = [...items].sort((a, b) => b.retention * b.importance - a.retention * a.importance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out = new Set(), seen = new Map();
  for (const x of ranked) { if (out.size >= n) break; const c = seen.get(x.kind) || 0; if (c < per) { out.add(x.id); seen.set(x.kind, c + 1); } }
  for (const x of ranked) { if (out.size >= n) break; out.add(x.id); }
  return out;
};
const companionLine = (kind, count, name) => {
  if (kind === 'facet') return `「${name}」？哼，那是写在我骨子里的。${count ? `有 ${count} 段记忆在替它作证。` : '暂时还没有记忆跟它对上号。'}`;
  if (kind === 'emotion') return count ? `${name}的时候留下了 ${count} 段记忆……不、不准乱翻！` : `最近没在「${name}」的时候留下记忆。`;
  if (kind === 'memory') {
    if (!count) return '这条记忆孤零零的，暂时没看出和谁有关。';
    if (count === 1) return '它只有 1 个邻居，点过去就能顺着游。';
    return `它连着 ${count} 个地方，信号已经替你游过去了。`;
  }
  return '……才不是在等你来看我的脑子呢。点一个神经元，带你逛。';
};
const hex = (r) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 6 + i * Math.PI / 3;
  return (Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1);
}).join(' ');

export default {
  id: 'cortex',
  label: '鲸脑',

  // ── 挂载：DOM 骨架 + 解剖层 + 手势/动效绑定（数据由 update 驱动）──
  mount(root, ctx) {
    this.unmount(); // 防御：上次未净时先清
    this._root = root;
    this._ctx = ctx;
    this._vm = ctx?.vm ?? null;
    this._sel = null;
    this._lastPanelKey = undefined;
    this._detailDirty = false;
    this._C = null;
    this._nodeEls = new Map();
    this._edgeEls = [];
    this._POS = new Map();
    this._pulses = [];
    this._pulseRAF = 0;
    this._driftRAF = 0;
    this._driftSeed = new Map();
    this._qhit = new Set();
    this._insideBrain = () => true;
    this._VB_HOME = { x: 100, y: 4, w: 840, h: 600 };
    this._VB = { ...this._VB_HOME };
    this._ptrs = new Map();
    this._pend = [0, 0];
    this._viewMoved = false;
    this._pinchPrev = null;
    this._lastTap = { t: 0, x: 0, y: 0 };
    this._dblGuard = 0;

    const theme = ctx?.theme ?? {};
    const charId = ctx?.charId ?? theme.characterId ?? '';
    const title = theme.title || theme.name || '脑图';
    const isWhale = charId === WHALE_CHAR;
    // 皮层强调色：鲸脑沿用旧页 --persona #8fb4ff；其他角色取主题 a2
    const accent = isWhale ? '#8fb4ff' : (theme.a2 || '#8fb4ff');
    const accent2 = isWhale ? '#96d4e5' : (theme.a2 || '#96d4e5');
    // eyebrow：鲸脑固定 WHALE CORTEX（旧页原文）；其他角色用英文名/标题
    const eyebrow = isWhale ? 'WHALE CORTEX' : `${(theme.en || title)} CORTEX`;
    const still = !!ctx?.motion?.still;
    this._signalOn = still ? false : ctx?.motion?.signal !== false;
    this._particlesOn = still ? false : ctx?.motion?.particles !== false;

    const q = (s) => root.querySelector(s);
    root.innerHTML = `
      <div class="cx" style="--cx-accent:${accent};--cx-accent2:${accent2};--cx-bubble:${isWhale ? '#5a7aa8' : accent2};--cx-a:${theme.a || '#3d7bff'};--cx-deep:${theme.deep || '#0d2a66'}">
        <div class="cx-shell">
          <div class="layout">
            <main class="stage">
              <div class="stage-head">
                <div class="eyebrow">${esc(eyebrow)}<span class="eb-tail"> · 点亮一个神经元，看信号流向哪里</span></div>
                <h1>${esc(title)}的心智图谱</h1>
              </div>
              <svg id="brain" viewBox="100 4 840 600" preserveAspectRatio="xMidYMid meet" role="group" aria-label="${esc(isWhale ? '鲸脑皮层' : title + '皮层')}：点选节点查看记忆、情绪与人格的关联">
                <defs>
                  <radialGradient id="shellFill" cx="45%" cy="45%" r="60%"><stop offset="0" stop-color="#0f3660" stop-opacity=".75"/><stop offset="1" stop-color="#071a31" stop-opacity=".55"/></radialGradient>
                  <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
                  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
                </defs>
                <g id="anatomy"></g><g id="sparks"></g><g id="motes"></g><g id="labels"></g><g id="edges"></g><g id="pulses"></g><g id="nodes"></g>
              </svg>
              <div id="graphEmpty" hidden>暂无记忆 · 可在管理端写入第一条</div>
              <div class="stage-foot">
                <div class="legend-box">
                  <span id="map-current">悬停或点选节点查看</span>
                  <div class="legend" title="沉淀巩固为实录，其余连线为相似度推导；情绪与人格连线均为推断">
                    <span><svg width="14" height="14"><polygon points="7,1 12.5,4 12.5,10 7,13 1.5,10 1.5,4" fill="#081a30" stroke="${accent}"/></svg>人格</span>
                    <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#ffc95c"/></svg>情绪</span>
                    <span><svg width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#061426" stroke="#8f9aff" stroke-width="1.5"/></svg>记忆</span>
                    <span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#5fdcc8"/></svg>沉淀巩固</span>
                    <span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#62b8ea" stroke-dasharray="3 4"/></svg>语义相似</span>
                    <span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#4f7fb0"/></svg>同会话</span>
                    <span><svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#9b85d6" stroke-dasharray="1 4"/></svg>同发言人</span>
                  </div>
                </div>
                <div class="ctrls" role="toolbar" aria-label="视图控制">
                  <button class="ctrl ico" id="zoomIn" type="button" aria-label="放大视图" title="放大">＋</button>
                  <button class="ctrl ico" id="zoomOut" type="button" aria-label="缩小视图" title="缩小">－</button>
                  <button class="ctrl" id="particleToggle" type="button" aria-pressed="${this._particlesOn}" title="背景漂浮粒子与节点微漂"${still ? ' disabled' : ''}>漂浮</button>
                  <button class="ctrl" id="signalToggle" type="button" aria-pressed="${this._signalOn}" title="沿连线流动的神经信号脉冲"${still ? ' disabled' : ''}>信号</button>
                  <button class="ctrl" id="resetView" type="button">复位</button>
                </div>
              </div>
            </main>
            <aside class="side">
              <div class="portrait">
                ${isWhale
                  ? `<img src="${asset('whale-banner.jpg')}" alt="${esc(title)}立绘">`
                  : `<div class="mono-portrait"><span class="mono-char">${esc(theme.mono || '脑')}</span></div>`}
                <div class="bubble"><small>${esc(title)}</small><span id="companion">正在读取这片海……</span></div>
                <div class="portrait-title">PERSONA / ${esc(title)}</div>
              </div>
              <div class="panel">
                <div class="panel-heading">MEMORY INSPECTOR</div>
                <h2 id="info-title">心智总览</h2>
                <span class="type" id="info-hint"></span>
                <div class="detail" id="info-detail"></div>
                <div class="pnote" id="info-foot"></div>
              </div>
            </aside>
          </div>
          <div class="bottom"><section class="deck"><div class="deck-top"><h3>记忆切片 · TOP RETENTION</h3><button class="deck-more" id="deck-more" type="button">查看全部记忆 ↗</button></div><div class="cards" id="cards"></div></section></div>
        </div>
      </div>`;

    // 元素引用（全部限定在皮肤根内）
    this._brain = q('#brain');
    this._nodesG = q('#nodes');
    this._edgesG = q('#edges');
    this._pulsesG = q('#pulses');
    this._motesG = q('#motes');
    this._companion = q('#companion');
    this._mapCurrent = q('#map-current');
    this._graphEmpty = q('#graphEmpty');
    this._title = q('#info-title');
    this._hint = q('#info-hint');
    this._detail = q('#info-detail');
    this._foot = q('#info-foot');
    this._cards = q('#cards');
    this._deckMore = q('#deck-more');

    this._anatomy();
    this._bindGestures();
    this._bindCtrls();
    this._idleTimer = setInterval(() => this._idlePulse(), 700);
    if (matchMedia('(max-width: 640px)').matches) {
      Object.assign(this._VB, { x: 140, y: 120, w: 600, h: 429 });
      this._setView();
    }
    this._render();
  },

  // ── 解剖层：脑轮廓/沟回/脑区柔光/星点/气泡标签/溢出入口（静态，只画一次）──
  _anatomy() {
    const g = this._root.querySelector('#anatomy');
    g.append(svgEl('path', { d: CEREBELLUM, class: 'shell-path', opacity: .8 }));
    [0, 1, 2, 3].forEach((i) => g.append(svgEl('path', { d: `M${690 + i * 6},${446 + i * 16} C740,${434 + i * 18} 800,${438 + i * 16} ${842 - i * 4},${456 + i * 14}`, class: 'sulcus' })));
    g.append(svgEl('path', { d: STEM, class: 'shell-path', opacity: .7 }));
    g.append(svgEl('path', { d: CEREBRUM, class: 'shell-glow' }));
    g.append(svgEl('path', { d: CEREBRUM, class: 'shell-path' }));
    SULCI.forEach((d) => g.append(svgEl('path', { d, class: 'sulcus' })));
    [['#8fb4ff', 300, 250, 120, 95], ['#5fe0ff', 590, 180, 170, 80], ['#e09cff', 720, 300, 90, 80], ['#ffc95c', 395, 405, 80, 50], ['#8f9aff', 590, 418, 150, 45]]
      .forEach(([c, cx, cy, rx, ry]) => g.append(svgEl('ellipse', { cx, cy, rx, ry, fill: c, opacity: .07, filter: 'url(#blur)' })));
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx && ctx.isPointInPath && typeof Path2D === 'function') {
      const p1 = new Path2D(CEREBRUM), p2 = new Path2D(CEREBELLUM), sg = this._root.querySelector('#sparks');
      this._insideBrain = (x, y) => ctx.isPointInPath(p1, x, y);
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let made = 0, tries = 0; made < 220 && tries < 6000; tries++) {
        const x = 160 + rnd() * 700, y = 75 + rnd() * 460;
        if (!ctx.isPointInPath(p1, x, y) && !ctx.isPointInPath(p2, x, y)) continue;
        const c = svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (.4 + rnd() * .8).toFixed(2), class: 'spark' });
        c.style.animationDelay = (-rnd() * 5).toFixed(2) + 's'; c.style.animationDuration = (3.5 + rnd() * 4).toFixed(2) + 's';
        sg.append(c); made++;
      }
      const mg = this._motesG;
      for (let made = 0, tries = 0; made < 64 && tries < 4000; tries++) {
        const x = 160 + rnd() * 700, y = 75 + rnd() * 460;
        if (!ctx.isPointInPath(p1, x, y) && !ctx.isPointInPath(p2, x, y)) continue;
        const c = svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (.7 + rnd() * 1.3).toFixed(2), class: 'mote' });
        c.style.animationDuration = (14 + rnd() * 20).toFixed(2) + 's'; c.style.animationDelay = (-rnd() * 30).toFixed(2) + 's';
        c.style.setProperty('--dx', ((rnd() - .5) * 36).toFixed(1) + 'px');
        mg.append(c); made++;
      }
      for (let made = 0, tries = 0; made < 14 && tries < 3000; tries++) {
        const x = 110 + rnd() * 820, y = 30 + rnd() * 580;
        if (ctx.isPointInPath(p1, x, y) || ctx.isPointInPath(p2, x, y)) continue;
        const c = svgEl('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: (.8 + rnd() * 1.6).toFixed(2), class: 'mote far' });
        c.style.animationDuration = (22 + rnd() * 26).toFixed(2) + 's'; c.style.animationDelay = (-rnd() * 40).toFixed(2) + 's';
        c.style.setProperty('--dx', ((rnd() - .5) * 60).toFixed(1) + 'px');
        mg.append(c); made++;
      }
    }
    const lab = this._root.querySelector('#labels');
    REGIONS.forEach(([x, y, lx, ly, en, cn, kind, ox, oy]) => {
      lab.append(svgEl('path', { d: `M${x + (x > lx ? 0 : 60)},${y + 6} L${lx},${ly}`, class: 'leader' }));
      const t = svgEl('text', { x, y, class: 'rlabel' });
      t.append(svgEl('tspan', { x, dy: 0 }, en), svgEl('tspan', { x, dy: 16, class: 'cn' }, cn));
      lab.append(t);
      if (kind) {
        const og = svgEl('g', { class: 'of-wrap', role: 'button', tabindex: 0, 'data-kind': kind });
        const o = svgEl('text', { x: ox ?? x, y: oy ?? y + 32, class: 'overflow', id: 'of-' + kind });
        og.append(svgEl('rect', { x: (ox ?? x) - 8, y: (oy ?? y + 32) - 14, width: 118, height: 20, class: 'hit' }), o);
        og.style.display = 'none';
        const open = () => { location.hash = '#/admin/memories'; };
        og.addEventListener('click', (ev) => { ev.stopPropagation(); open(); });
        og.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
        lab.append(og);
      }
    });
  },

  // ── 手势：滚轮/触控板捏合缩放、拖拽平移、双指捏合、双击；竖向滑动留给页面 ──
  _bindGestures() {
    const brain = this._brain, VB = this._VB;
    this._setView = () => {
      brain.setAttribute('viewBox', `${VB.x.toFixed(1)} ${VB.y.toFixed(1)} ${VB.w.toFixed(1)} ${VB.h.toFixed(1)}`);
      brain.classList.toggle('zoomed', VB.w < ZOOM_LABEL_W);
    };
    this._clampView = () => {
      VB.w = Math.min(1200, Math.max(190, VB.w)); VB.h = VB.w * this._VB_HOME.h / this._VB_HOME.w;
      const mx = this._VB_HOME.w * .35, my = this._VB_HOME.h * .35;
      VB.x = Math.min(this._VB_HOME.x + this._VB_HOME.w + mx - VB.w, Math.max(this._VB_HOME.x - mx, VB.x));
      VB.y = Math.min(this._VB_HOME.y + this._VB_HOME.h + my - VB.h, Math.max(this._VB_HOME.y - my, VB.y));
    };
    this._viewScale = () => {
      const r = brain.getBoundingClientRect(), s = Math.min(r.width / VB.w, r.height / VB.h);
      return { s, ox: r.left + (r.width - VB.w * s) / 2, oy: r.top + (r.height - VB.h * s) / 2 };
    };
    this._toSvg = (px, py) => { const { s, ox, oy } = this._viewScale(); return { x: VB.x + (px - ox) / s, y: VB.y + (py - oy) / s }; };
    this._panBy = (dx, dy) => { const { s } = this._viewScale(); VB.x -= dx / s; VB.y -= dy / s; this._clampView(); this._setView(); };
    this._zoomAt = (px, py, f) => {
      const p = this._toSvg(px, py), w0 = VB.w;
      VB.w = Math.min(1200, Math.max(190, VB.w * f)); VB.h = VB.w * this._VB_HOME.h / this._VB_HOME.w;
      const k = VB.w / w0;
      VB.x = p.x - (p.x - VB.x) * k; VB.y = p.y - (p.y - VB.y) * k;
      this._clampView(); this._setView();
    };
    this._zoomCenter = (f) => { const r = brain.getBoundingClientRect(); this._zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); };

    brain.addEventListener('wheel', (ev) => { if (!ev.ctrlKey) return; ev.preventDefault(); this._zoomAt(ev.clientX, ev.clientY, ev.deltaY > 0 ? 1.05 : 1 / 1.05); }, { passive: false });
    const ptrs = this._ptrs;
    brain.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (ptrs.size === 1) { this._viewMoved = false; this._pend = [0, 0]; } else try { brain.setPointerCapture(ev.pointerId); } catch { /* noop */ }
      this._pinchPrev = null;
    });
    brain.addEventListener('pointermove', (ev) => {
      const prev = ptrs.get(ev.pointerId); if (!prev) return;
      ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (ptrs.size === 1) {
        const dx = ev.clientX - prev[0], dy = ev.clientY - prev[1];
        if (this._viewMoved) this._panBy(dx, dy);
        else {
          this._pend[0] += dx; this._pend[1] += dy;
          if (this._pend[0] * this._pend[0] + this._pend[1] * this._pend[1] > 64) {
            this._viewMoved = true;
            try { brain.setPointerCapture(ev.pointerId); } catch { /* noop */ }
            this._panBy(this._pend[0], this._pend[1]);
          }
        }
      } else if (ptrs.size === 2) {
        const [p, q2] = [...ptrs.values()], mid = [(p[0] + q2[0]) / 2, (p[1] + q2[1]) / 2], dist = Math.hypot(p[0] - q2[0], p[1] - q2[1]);
        if (this._pinchPrev) { this._zoomAt(mid[0], mid[1], this._pinchPrev.dist / dist); this._panBy(mid[0] - this._pinchPrev.mid[0], mid[1] - this._pinchPrev.mid[1]); }
        this._pinchPrev = { mid, dist }; this._viewMoved = true;
      }
    });
    const ptrEnd = (ev) => {
      ptrs.delete(ev.pointerId); if (ptrs.size < 2) this._pinchPrev = null;
      if (ev.type !== 'pointerup' || !ev.isPrimary || ptrs.size > 0 || this._viewMoved || ev.pointerType === 'mouse') return;
      const dx = ev.clientX - this._lastTap.x, dy = ev.clientY - this._lastTap.y;
      if (ev.timeStamp - this._lastTap.t < 340 && dx * dx + dy * dy < 900) {
        this._viewMoved = true; this._lastTap.t = 0; this._dblGuard = ev.timeStamp;
        if (VB.w > 430) this._zoomAt(ev.clientX, ev.clientY, .5); else { Object.assign(VB, this._VB_HOME); this._setView(); }
      } else this._lastTap = { t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
    };
    brain.addEventListener('pointerup', ptrEnd);
    brain.addEventListener('pointercancel', ptrEnd);
    brain.addEventListener('dblclick', (ev) => {
      if (ev.timeStamp - this._dblGuard < 500) return;
      if (VB.w > 430) this._zoomAt(ev.clientX, ev.clientY, .5); else { Object.assign(VB, this._VB_HOME); this._setView(); }
    });
    brain.addEventListener('click', (ev) => {
      if (this._viewMoved) { this._viewMoved = false; ev.stopImmediatePropagation(); ev.preventDefault(); return; }
      if (!ev.target.closest('.node') && !ev.target.closest('.of-wrap') && !ev.target.closest('.overflow')) this._panel(null);
    }, true);
    this._onResize = () => { this._clampView(); this._setView(); };
    addEventListener('resize', this._onResize);
    this._onKey = (ev) => {
      if (ev.key === 'Escape' && this._sel && !(ev.target instanceof Element && ev.target.closest('input,textarea,select'))) this._panel(null);
    };
    document.addEventListener('keydown', this._onKey);
    // 检查器输入监听只挂一次（detail 元素跨 panel 重绘存续）
    this._detail?.addEventListener('input', () => { this._detailDirty = true; });
  },

  // ── 工具栏：缩放/漂浮/信号/复位 + 管理跳转 ──
  _bindCtrls() {
    const q = (s) => this._root.querySelector(s);
    q('#zoomIn').onclick = () => this._zoomCenter(1 / 1.5);
    q('#zoomOut').onclick = () => this._zoomCenter(1.5);
    q('#resetView').onclick = () => { Object.assign(this._VB, this._VB_HOME); this._setView(); this._panel(null); };
    this._deckMore.onclick = () => { location.hash = '#/admin/memories'; };
    this._updateParticleBtn = () => {
      const b = q('#particleToggle');
      b.setAttribute('aria-pressed', String(this._particlesOn));
      b.setAttribute('aria-label', '漂浮：' + (this._particlesOn ? '开' : '关'));
      this._motesG.style.display = this._particlesOn ? '' : 'none';
      if (this._particlesOn && !this._driftRAF) this._driftRAF = requestAnimationFrame((t) => this._driftTick(t));
    };
    this._updateSignalBtn = () => {
      const b = q('#signalToggle');
      b.setAttribute('aria-pressed', String(this._signalOn));
      b.setAttribute('aria-label', '神经信号：' + (this._signalOn ? '开' : '关'));
    };
    q('#particleToggle').onclick = () => {
      if (q('#particleToggle').disabled) return;
      this._particlesOn = !this._particlesOn;
      setPref('particles', this._particlesOn);
      this._updateParticleBtn();
    };
    q('#signalToggle').onclick = () => {
      if (q('#signalToggle').disabled) return;
      this._signalOn = !this._signalOn;
      setPref('signal', this._signalOn);
      this._updateSignalBtn();
    };
    this._updateParticleBtn();
    this._updateSignalBtn();
    this._motesG.style.display = this._particlesOn ? '' : 'none';
  },

  // ── 数据 → 皮层模型 ──
  _emoNodes() {
    const theme = this._ctx?.theme ?? {};
    return (theme.moods?.length ? theme.moods : []).map((w) => ({
      id: `emo:${w}`, name: w, color: theme.moodColors?.[w] || hashColor(w),
    }));
  },

  _buildCortex(vm) {
    const notes = vm.notes, facets = vm.facets;
    const emoNodes = this._emoNodes();
    const emoIds = new Set(emoNodes.map((e) => e.id));
    // 服务端人格边：note → facet:<i>（向量匹配）；缺边条目回退字面共同词推断
    const srvFacet = new Map();
    (vm.edges || []).forEach((e) => { if (e.kind === 'facet' && typeof e.b === 'string' && e.b.startsWith('facet:')) srvFacet.set(e.a, { facet: e.b, cos: e.score }); });
    const emoOf = new Map(), facetOf = new Map();
    notes.forEach((n) => {
      // vm 已按「快照 > ops 推断」解析好 emo 词；词不在本角色词表则不挂情绪节点
      if (n.emo && emoIds.has(`emo:${n.emo}`)) emoOf.set(n.id, { node: `emo:${n.emo}`, word: n.emo, label: n.emoLabel || '', t: n.emoT });
      const sf = srvFacet.get(n.id);
      const f = sf ? { facet: sf.facet, words: null, cos: sf.cos } : matchFacet(n, facets);
      if (f) facetOf.set(n.id, f);
    });
    const shown = [], overflow = {};
    for (const k of Object.keys(CAP)) {
      const all = notes.filter((n) => (KIND[n.kind] ? n.kind : 'episodic') === k)
        .sort((a, b) => b.retention - a.retention || b.importance - a.importance);
      let pick = all.slice(0, CAP[k]);
      const sel = all.find((n) => n.id === this._sel);
      if (sel && !pick.includes(sel)) pick = [...pick.slice(0, -1), sel];
      pick.forEach((n) => shown.push({ n, k }));
      overflow[k] = all.length - pick.length;
    }
    const curWord = vm.mood?.word;
    return {
      notes, facets, emoNodes, emoOf, facetOf, shown, overflow,
      current: curWord && emoIds.has(`emo:${curWord}`) ? `emo:${curWord}` : null,
    };
  },

  _colorOf(k) {
    const t = keyKind(k);
    if (t === 'facet') return this._accent();
    if (t === 'emotion') return this._C?.emoNodes.find((e) => e.id === k)?.color || '#5fdcc8';
    const n = this._vm?.byId?.[k];
    return KIND_COLOR[n?.kind] || KIND_COLOR.episodic;
  },
  _accent() {
    const theme = this._ctx?.theme ?? {};
    return (this._ctx?.charId ?? theme.characterId) === WHALE_CHAR ? '#8fb4ff' : (theme.a2 || '#8fb4ff');
  },

  _nameOf(k) {
    const t = keyKind(k);
    if (t === 'facet') return this._C?.facets.find((f) => f.id === k)?.title || '人格';
    if (t === 'emotion') return this._C?.emoNodes.find((e) => e.id === k)?.name || '情绪';
    const n = this._vm?.byId?.[k];
    return n ? previewText(n, this._vm.notes) : '';
  },

  _mapSummary(key) {
    if (!key || !this._vm) return matchMedia('(pointer:coarse)').matches ? '点选节点查看 · 捏合/双击缩放' : '悬停或点选查看 · ⌃滚轮/双击缩放';
    const t = keyKind(key);
    if (t === 'facet') return `人格 · ${this._nameOf(key)} · ${this._neighbors(key).length} 段记忆`;
    if (t === 'emotion') return `情绪 · ${this._nameOf(key)} · ${this._neighbors(key).length} 段记忆（推断）`;
    return this._nameOf(key) || '悬停或点选节点查看';
  },

  _validKey(k) {
    const t = keyKind(k);
    if (!t || !this._C) return false;
    if (t === 'facet') return this._C.facets.some((f) => f.id === k);
    if (t === 'emotion') return this._C.emoNodes.some((e) => e.id === k);
    return !!this._vm?.byId?.[k] && this._vm.notes.some((n) => n.id === k);
  },

  _neighbors(key) {
    const C = this._C, out = [];
    if (!C || !key) return out;
    const t = keyKind(key);
    if (t === 'emotion') {
      C.notes.forEach((n) => { const e = C.emoOf.get(n.id); if (e && e.node === key) out.push({ id: n.id, why: '形成时情绪' + (e.label ? ` · ${e.label}` : '') }); });
      return out;
    }
    if (t === 'facet') {
      C.notes.forEach((n) => { const f = C.facetOf.get(n.id); if (f && f.facet === key) out.push({ id: n.id, why: f.words?.length ? '共同词 · ' + f.words.join('、') : `语义相似 ${Math.round((f.cos || 0) * 100)}%` }); });
      return out;
    }
    (this._vm?.relations ?? []).filter((r) => r.a === key || r.b === key).slice(0, 8).forEach((r) => {
      const o = r.a === key ? r.b : r.a, other = this._vm?.byId?.[o];
      if (other) out.push({ id: o, why: relationWhy(r, other) });
    });
    const e = C.emoOf.get(key); if (e) out.push({ id: e.node, why: '形成时情绪' + (e.label ? ` · ${e.label}` : '') });
    const f = C.facetOf.get(key); if (f) out.push({ id: f.facet, why: f.words?.length ? '共同词 · ' + f.words.join('、') : `语义相似 ${Math.round((f.cos || 0) * 100)}%` });
    return out;
  },

  // ── 渲染：固定槽位画三种节点 ──
  _render() {
    const vm = this._vm;
    if (!vm) {
      this._C = null;
      this._nodesG?.replaceChildren(); this._nodeEls?.clear();
      this._edgesG?.replaceChildren(); this._edgeEls = []; this._POS = new Map();
      this._graphEmpty.hidden = false;
      this._graphEmpty.textContent = '加载中……';
      this._cards?.replaceChildren();
      this._setCompanion();
      return;
    }
    this._C = this._buildCortex(vm);
    const C = this._C, ng = this._nodesG;
    ng.replaceChildren(); this._nodeEls.clear();
    const taken = [], pos = new Map(), overflow = { ...C.overflow };
    const facetBox = (x, y) => [x - 40, y - 18, x + 40, y + 34], emoBox = (x, y) => [x - 20, y - 13, x + 20, y + 27], memBox = (x, y) => [x - 14, y - 14, x + 88, y + 14];
    layoutSlots(ZONES.facet, C.facets.length, facetBox, this._insideBrain, taken).forEach((p, i) => pos.set(C.facets[i].id, p));
    layoutSlots(ZONES.emotion, C.emoNodes.length, emoBox, this._insideBrain, taken).forEach((p, i) => pos.set(C.emoNodes[i].id, p));
    for (const k of ['episodic', 'attitude', 'semantic']) {
      const items = C.shown.filter((s) => s.k === k).map((s) => s.n).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      const slots = layoutSlots(ZONES[k], items.length, memBox, this._insideBrain, taken);
      items.forEach((n, i) => { if (slots[i]) pos.set(n.id, slots[i]); else overflow[k]++; });
    }
    this._POS = pos;
    const facetCount = new Map(), emoCount = new Map();
    C.facetOf.forEach((f) => facetCount.set(f.facet, (facetCount.get(f.facet) || 0) + 1));
    C.emoOf.forEach((e) => emoCount.set(e.node, (emoCount.get(e.node) || 0) + 1));
    const add = (key, cls, build, aria) => {
      const p = pos.get(key); if (!p) return;
      const g = svgEl('g', { class: 'node ' + cls, 'data-key': key, transform: `translate(${p.x} ${p.y})`, tabindex: 0, role: 'button', 'aria-label': aria });
      build(g); this._bindMapNode(g, key); ng.append(g); this._nodeEls.set(key, g);
    };
    C.facets.forEach((f) => {
      const cnt = facetCount.get(f.id) || 0, r = 9 + Math.min(cnt, 6) * .7;
      add(f.id, 'facet', (g) => {
        g.append(svgEl('title', {}, f.heading));
        g.append(svgEl('circle', { class: 'halo', r: r + 10 }));
        g.append(svgEl('polygon', { class: 'ring', points: hex(r) }));
        g.append(svgEl('polygon', { class: 'core', points: hex(r * .5), opacity: .9 }));
        g.append(svgEl('text', { class: 'cap', y: r + 14, 'text-anchor': 'middle' }, Array.from(f.title).slice(0, 6).join('')));
        g.append(svgEl('circle', { class: 'hit', r: 30 }));
      }, `人格特质：${f.heading}`);
    });
    C.emoNodes.forEach((e) => {
      const cnt = emoCount.get(e.id) || 0, r = 4 + Math.min(cnt, 8) * .5, now = e.id === C.current;
      add(e.id, 'emo' + (cnt || now ? '' : ' empty'), (g) => {
        g.append(svgEl('circle', { class: 'halo', r: r + 8, style: `fill:${e.color}` }));
        if (now) g.append(svgEl('circle', { class: 'mood-ring', r, style: `stroke:${e.color}` }));
        g.append(svgEl('circle', { class: 'ring', r, style: `stroke:${e.color};fill:${e.color};fill-opacity:.08` }));
        g.append(svgEl('circle', { class: 'core', r: (r * .5).toFixed(1), style: `fill:${e.color}`, opacity: .9 }));
        g.append(svgEl('text', { class: 'cap', y: r + 13, 'text-anchor': 'middle' }, e.name));
        g.append(svgEl('circle', { class: 'hit', r: 22 }));
      }, `情绪：${e.name}，${cnt} 段记忆`);
    });
    const all = vm.notes;
    const labeled = labelPick(C.shown.filter((s) => pos.has(s.n.id)).map((s) => ({ ...s.n, kind: s.k })), LABEL_N, 2);
    C.shown.forEach(({ n, k }) => {
      const r = 6 + n.importance * 1.1, sb = scopeBadge(n);
      add(n.id, `mem k-${k}${n.fading ? ' fading' : ''}${sb ? ' priv' : ''}${labeled.has(n.id) ? '' : ' quiet'}`, (g) => {
        g.append(svgEl('title', {}, n.content));
        g.append(svgEl('circle', { class: 'halo', r: r + 7 }));
        g.append(svgEl('circle', { class: 'ring', r }));
        g.append(svgEl('circle', { class: 'core', r: (r * .6).toFixed(1) }));
        if (sb) g.append(svgEl('circle', { class: 'privdot', cx: 0, cy: -(r + 4), r: 2.2 }));
        g.append(svgEl('text', { class: 'cap', x: r + 5, y: 4 }, mapLabel(n, all)));
        g.append(svgEl('circle', { class: 'hit', r: 20 }));
      }, `${sb ? sb.t + ' ' : ''}${kindLabel(n.kind)}记忆：${n.content}`);
    });
    ['semantic', 'attitude', 'episodic'].forEach((k) => {
      const o = this._root.querySelector('#of-' + k); if (!o) return;
      o.parentElement.style.display = overflow[k] ? '' : 'none';
      o.textContent = `+${overflow[k]} 条未显示 ↗`;
    });
    this._graphEmpty.hidden = !!all.length;
    if (!all.length) this._graphEmpty.textContent = '暂无记忆 · 可在管理端写入第一条';
    this._deckMore.textContent = `查看全部 ${vm.stats?.total ?? all.length} 条记忆 ↗`;
    this._drawEdges();
    this._applyFocus();
    this._renderCards(all);
  },

  _renderCards(all) {
    const cards = this._cards;
    cards.replaceChildren();
    if (!all.length) {
      cards.innerHTML = '<div class="empty cards-empty">还没有记忆。可在管理端写入第一条。</div>';
      return;
    }
    [...all].sort((a, b) => b.retention - a.retention).slice(0, 4).forEach((n) => {
      const c = document.createElement('button'); c.type = 'button';
      c.className = `card k-${KIND[n.kind] ? n.kind : 'episodic'}` + (n.fading ? ' faded' : '') + (n.id === this._sel ? ' active' : '');
      c.dataset.key = n.id;
      c.innerHTML = `<span class="ctag"><b></b><span>R ${(n.retention * 100).toFixed(0)}%</span></span><div class="title"></div><div class="meter"><i style="width:${Math.max(3, n.retention * 100)}%"></i></div>`;
      c.querySelector('.ctag b').textContent = kindLabel(n.kind);
      c.querySelector('.title').textContent = previewText(n, all);
      c.title = n.content;
      c.addEventListener('click', () => { this._panel(n.id); if (innerWidth <= 1000) this._title.scrollIntoView({ behavior: 'smooth' }); });
      cards.append(c);
    });
  },

  // ── 边：记忆↔记忆最多 28 条（含选中节点的关系）；跨层边默认透明，选中才亮 ──
  _edgePath(p, q, bend) {
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dx = q.x - p.x, dy = q.y - p.y;
    return `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
  },
  _addEdge(a, b, cls, bend) {
    const p = this._POS.get(a), q = this._POS.get(b); if (!p || !q) return;
    const el = svgEl('path', { class: 'edge ' + cls, 'data-a': a, 'data-b': b, d: this._edgePath(p, q, bend) });
    this._edgesG.append(el); this._edgeEls.push({ a, b, el, bend });
  },
  _drawEdges() {
    this._edgesG.replaceChildren(); this._edgeEls = [];
    const C = this._C; if (!C) return;
    const rels = (this._vm?.relations ?? []).filter((r) => this._POS.has(r.a) && this._POS.has(r.b)), pick = new Set(rels.slice(0, 28));
    if (this._sel) rels.filter((r) => r.a === this._sel || r.b === this._sel).slice(0, 8).forEach((r) => pick.add(r));
    pick.forEach((r) => this._addEdge(r.a, r.b, 'rel-' + r.primary, .2));
    C.shown.forEach(({ n }) => {
      const e = C.emoOf.get(n.id), f = C.facetOf.get(n.id);
      if (e) this._addEdge(n.id, e.node, 'cross', -.12);
      if (f) this._addEdge(n.id, f.facet, 'cross', .14);
    });
  },

  // ── 聚焦：选中节点 + 邻居点亮，其余淡出 ──
  _applyFocus() {
    const key = this._sel, lit = new Set(key ? [key, ...this._neighbors(key).map((x) => x.id)] : []);
    this._brain.classList.toggle('focus', !!key);
    this._nodeEls.forEach((g, k) => { g.classList.toggle('lit', lit.has(k)); g.classList.toggle('selected', k === key); });
    this._edgeEls.forEach((e) => {
      const on = !!key && (e.a === key || e.b === key);
      e.el.classList.toggle('lit', on);
      e.el.style.stroke = on ? this._colorOf(e.a === key ? e.b : e.a) : '';
    });
    this._setCompanion();
  },
  _setCompanion() {
    const el = this._companion; if (!el) return;
    const k = this._sel, t = keyKind(k);
    el.textContent = companionLine(t, k ? this._neighbors(k).length : 0, k ? this._nameOf(k) : '');
  },

  // ── 神经信号：脉冲沿边流动；选中时两跳扩散，空闲时稀疏随机 ──
  _fire(edge, fromId, delay, color) {
    if (!this._signalOn || typeof edge.el.getTotalLength !== 'function') return;
    const len = edge.el.getTotalLength(), pg = this._pulsesG;
    const dots = [0, 1, 2, 3].map((i) => {
      const c = svgEl('circle', { r: i ? 2.6 - (i - 1) * .7 : 2.2, class: 'pulse', fill: i ? (color || '#bfeaff') : '#fff', opacity: 0 });
      if (i === 1) c.setAttribute('filter', 'url(#soft)');
      pg.append(c); return c;
    });
    this._pulses.push({ edge, len, rev: edge.b === fromId, t0: performance.now() + (delay || 0), dur: 520 + len * 2.2, dots });
    if (!this._pulseRAF) this._pulseRAF = requestAnimationFrame((t) => this._pulseTick(t));
  },
  _pulseTick(now) {
    for (let i = this._pulses.length - 1; i >= 0; i--) {
      const p = this._pulses[i], t = (now - p.t0) / p.dur;
      if (t < 0) continue;
      if (t > 1 || !p.edge.el.isConnected) { p.dots.forEach((d) => d.remove()); this._pulses.splice(i, 1); continue; }
      p.dots.forEach((d, j) => {
        const tt = Math.max(0, t - j * .035), e = tt < .5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2;
        const pt = p.edge.el.getPointAtLength(p.len * (p.rev ? 1 - e : e));
        d.setAttribute('cx', pt.x); d.setAttribute('cy', pt.y);
        d.setAttribute('opacity', ((j ? .7 - (j - 1) * .2 : 1) * Math.sin(Math.PI * t) * 1.2).toFixed(2));
      });
    }
    this._pulseRAF = this._pulses.length ? requestAnimationFrame((t) => this._pulseTick(t)) : 0;
  },
  _burst(key) {
    const first = this._edgeEls.filter((e) => e.a === key || e.b === key);
    first.forEach((e, i) => this._fire(e, key, i * 40, this._colorOf(key)));
    first.forEach((e) => {
      const nb = e.a === key ? e.b : e.a; if (keyKind(nb) !== 'memory') return;
      this._edgeEls.filter((x) => x !== e && !x.el.classList.contains('cross') && (x.a === nb || x.b === nb)).slice(0, 4).forEach((x) => this._fire(x, nb, 520, this._colorOf(nb)));
    });
  },
  _idlePulse() {
    if (!this._signalOn || document.hidden || this._pulses.length > 10 || !this._edgeEls.length) return;
    const pool = this._sel ? this._edgeEls.filter((e) => e.a === this._sel || e.b === this._sel) : this._edgeEls;
    const e = pool[Math.floor(Math.random() * pool.length)];
    if (e) this._fire(e, this._sel && e.b === this._sel ? e.b : e.a, 0, this._sel ? this._colorOf(this._sel) : undefined);
  },

  // ── 漂浮：节点在原位 ±2.5 单位内缓慢游荡，边同帧跟随 ──
  _driftOf(k) {
    let s = this._driftSeed.get(k);
    if (!s) {
      let h = 2166136261;
      for (const c of k) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      const r = (i) => ((h >>> (i * 5)) & 31) / 31;
      s = [r(0) * 6.28, r(1) * 6.28, 6.28 / (7 + r(2) * 6), 6.28 / (8 + r(3) * 5), keyKind(k) === 'memory' ? 1.3 : 1];
      this._driftSeed.set(k, s);
    }
    return s;
  },
  _driftPos(k, t) {
    const p = this._POS.get(k); if (!p) return null; if (!t) return p;
    const [a, b, w1, w2, A] = this._driftOf(k);
    return { x: p.x + A * Math.sin(t * w1 + a), y: p.y + A * Math.cos(t * w2 + b) };
  },
  _driftApply(t) {
    this._nodeEls.forEach((g, k) => { const p = this._driftPos(k, t); if (p) g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`); });
    this._edgeEls.forEach((e) => { const p = this._driftPos(e.a, t), q = this._driftPos(e.b, t); if (p && q) e.el.setAttribute('d', this._edgePath(p, q, e.bend)); });
  },
  _driftTick(now) {
    if (!this._particlesOn) { this._driftRAF = 0; this._driftApply(0); return; }
    if (!document.hidden) this._driftApply(now / 1000);
    this._driftRAF = requestAnimationFrame((t) => this._driftTick(t));
  },

  // ── 图表：衰减曲线 / 情绪历史 ──
  _decayChart(n) {
    const S = Math.max(.5, n.strength), days = Math.min(60, S * 3), W = 264, H = 76;
    const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}` });
    const x = (d) => 10 + (d / days) * (W - 20), y = (r) => 4 + (1 - r) * (H - 16);
    svg.appendChild(svgEl('line', { class: 'axis', x1: 10, y1: H - 12, x2: W - 10, y2: H - 12 }));
    const thr = this._vm?.config?.forgetThreshold ?? 0.2;
    svg.appendChild(svgEl('line', { class: 'thr', x1: 10, y1: y(thr), x2: W - 10, y2: y(thr) }));
    svg.appendChild(svgEl('text', { x: W - 12, y: y(thr) - 3, 'text-anchor': 'end' }, '遗忘阈值'));
    let d = 'M'; const R0 = n.retention;
    for (let i = 0; i <= 40; i++) { const t = i / 40 * days; const r = R0 * Math.exp(-t / S); d += `${x(t).toFixed(1)},${y(r).toFixed(1)} `; }
    svg.appendChild(svgEl('path', { class: 'curve', d }));
    const cross = -S * Math.log(thr / R0);
    svg.appendChild(svgEl('text', { x: 10, y: H - 2 }, isFinite(cross) && cross > 0 ? `约 ${cross.toFixed(1)} 天后低于阈值（S=${S}天）` : `已在阈值下（S=${S}天）`));
    return svg;
  },
  _emotionChart() {
    const pts = (this._ctx?.ops ?? []).filter((o) => o?.op?.op === 'emotion').slice(0, 60).map((o) => ({ v: o.op.state.v, a: o.op.state.a, t: o.t })).reverse();
    if (pts.length < 2) return null;
    const W = 264, H = 76, svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}` });
    const x = (i) => 10 + (i / (pts.length - 1)) * (W - 20), yv = (v) => (H / 2 - 4) - (v * (H / 2 - 16)), ya = (a) => 4 + (1 - a) * (H - 20);
    svg.appendChild(svgEl('line', { class: 'axis', x1: 10, y1: H / 2 - 4, x2: W - 10, y2: H / 2 - 4 }));
    let dv = 'M', da = 'M';
    pts.forEach((p, i) => { dv += `${x(i).toFixed(1)},${yv(p.v).toFixed(1)} `; da += `${x(i).toFixed(1)},${ya(p.a).toFixed(1)} `; });
    svg.appendChild(svgEl('path', { class: 'emo-a', d: da }));
    svg.appendChild(svgEl('path', { class: 'emo-v', d: dv }));
    svg.appendChild(svgEl('text', { x: 10, y: H - 2 }, `v 效价（实线）· a 唤醒（虚线）· 最近 ${pts.length} 次`));
    return svg;
  },

  // ── 检查器 ──
  _div(cls, text) { return el('div', cls, text ?? ''); },
  _linkBlock(title, list, emptyText) {
    const wrap = document.createDocumentFragment();
    wrap.append(this._div('sec-title', `${title} · ${list.length}`));
    if (!list.length) { wrap.append(this._div('rel-empty', emptyText)); return wrap; }
    list.forEach((r) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rel-link'; b.dataset.key = r.id;
      const dot = document.createElement('i'); dot.style.background = this._colorOf(r.id);
      const body = document.createElement('span');
      const nm = document.createElement('span'); nm.className = 'rel-name'; nm.textContent = this._nameOf(r.id);
      const why = document.createElement('span'); why.className = 'rel-why'; why.textContent = r.why;
      body.append(nm, why); b.append(dot, body); b.onclick = () => this._panel(r.id); wrap.append(b);
    });
    return wrap;
  },
  _meterRow(key, name, count, max, color, mark) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'meter-row'; b.dataset.key = key;
    const a = document.createElement('span'); a.textContent = name + (mark ? ' ●' : ''); a.title = name;
    const m = this._div('meter'); const i = document.createElement('i'); i.style.width = (max ? count / max * 100 : 0) + '%'; i.style.background = color; m.append(i);
    const c = document.createElement('span'); c.textContent = count;
    b.append(a, m, c); b.onclick = () => this._panel(key); return b;
  },
  _meterGroup(detail, items, emptyText) {
    const max = Math.max(1, ...items.map((x) => x.count)), live = items.filter((x) => x.count || x.mark), rest = items.filter((x) => !x.count && !x.mark);
    if (live.length) { const m = this._div('meters'); live.forEach((x) => m.append(this._meterRow(x.key, x.name, x.count, max, x.color, x.mark))); detail.append(m); }
    if (!rest.length) return;
    const row = this._div('chips'); row.append(live.length ? '未关联：' : emptyText);
    rest.forEach((x) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.key = x.key; b.title = `${x.name} · 0 段记忆`;
      const dot = document.createElement('i'); dot.style.background = x.color;
      b.append(dot, x.name); b.onclick = () => this._panel(x.key); row.append(b);
    });
    detail.append(row);
  },
  _overview(detail) {
    const C = this._C;
    if (!C) { detail.append(this._div('rel-empty', '加载中……')); return; }
    const fc = new Map(), ec = new Map();
    C.facetOf.forEach((f) => fc.set(f.facet, (fc.get(f.facet) || 0) + 1));
    C.emoOf.forEach((e) => ec.set(e.node, (ec.get(e.node) || 0) + 1));
    detail.append(this._div('sec-title', 'PERSONA · 人格光谱（关联记忆数）'));
    if (!C.facets.length) detail.append(this._div('rel-empty', '未配置人设——可在管理端人设页填写。'));
    else this._meterGroup(detail, C.facets.map((f) => ({ key: f.id, name: f.title, count: fc.get(f.id) || 0, color: this._accent() })), '暂无记忆关联到人设小节：');
    detail.append(this._div('sec-title', 'AMYGDALA · 情绪读数（推断）'));
    this._meterGroup(detail, C.emoNodes.map((e) => ({ key: e.id, name: e.name, count: ec.get(e.id) || 0, color: e.color, mark: e.id === C.current })), '其余情绪：');
    const s = this._vm?.mood ?? {}, sess = this._vm?.emotionSession;
    detail.append(this._div('mood-now', `此刻：${s.label || s.word || '平静'}（v=${(+s.v || 0).toFixed(2)} a=${(+s.a || 0).toFixed(2)} d=${(+s.d || 0).toFixed(2)}）${sess ? ` · 会话 ${shortId(sess)}` : ''}`));
    const c = this._emotionChart(); if (c) detail.append(c);
  },

  _panel(key) {
    this._detailDirty = false;
    if (key && !this._validKey(key)) key = null;
    this._sel = key;
    const detail = this._detail, foot = this._foot, hint = this._hint, C = this._C, t = keyKind(key);
    const vm = this._vm;
    const notes = vm?.notes ?? [];
    detail.replaceChildren();
    const quote = (text) => { detail.append(this._div('quote', text)); };
    hint.style.color = '';
    const title = this._ctx?.theme?.title || this._ctx?.theme?.name || '脑图';
    if (!t) {
      this._title.textContent = `${title} · 心智总览`; hint.textContent = '人格 · 情绪 · 记忆';
      this._overview(detail);
      foot.textContent = '跨层连线均为推断：情绪按记忆形成后 10 分钟内的情绪记录匹配，人格按人设「##」小节的共同词匹配。';
    } else if (t === 'facet') {
      const f = C.facets.find((x) => x.id === key);
      this._title.textContent = f.heading; hint.textContent = '人格特质 · 前额叶'; hint.style.color = this._accent();
      quote(f.body || f.heading);
      detail.append(this._linkBlock('塑造它的记忆（推断）', this._neighbors(key), '还没有记忆与这一节人设共享关键词。'));
      foot.textContent = '来自当前人设的小节，可在管理端人设页编辑。';
    } else if (t === 'emotion') {
      const e = C.emoNodes.find((x) => x.id === key), now = key === C.current, s = vm?.mood ?? {};
      this._title.textContent = e.name + (now ? ' · 此刻' : ''); hint.textContent = '情绪 · 杏仁核（推断）'; hint.style.color = e.color;
      if (now) {
        quote(`${s.label || e.name}（v=${(+s.v || 0).toFixed(2)} a=${(+s.a || 0).toFixed(2)} d=${(+s.d || 0).toFixed(2)}）`);
        const c = this._emotionChart(); if (c) detail.append(c);
      }
      detail.append(this._linkBlock('带着这种情绪形成的记忆', this._neighbors(key), '操作日志里没有找到对应的记忆。'));
      foot.textContent = '情绪节点按人设词表（moods）判定；无 mood 的旧记录按 PAD 推断。';
    } else {
      const n = vm.byId[key], nb = this._neighbors(key), sb = scopeBadge(n);
      this._title.textContent = nodeLabel(n, notes, 16); hint.textContent = `${kindLabel(n.kind)}记忆${sb ? ` · ${sb.t}` : ''}`; hint.style.color = this._colorOf(key);
      quote(n.content);
      detail.append(this._decayChart(n));
      detail.append(this._linkBlock('关联记忆', nb.filter((x) => keyKind(x.id) === 'memory'), '暂无可推断的关联。'));
      detail.append(this._linkBlock('情绪', nb.filter((x) => keyKind(x.id) === 'emotion'), '形成时没有匹配到情绪记录。'));
      detail.append(this._linkBlock('人格', nb.filter((x) => keyKind(x.id) === 'facet'), '与人设小节没有共同关键词。'));
      // 编辑区：写操作经 ctx.actions（壳层 API + 刷新），皮肤不直接 fetch
      const ed = document.createElement('details'); ed.className = 'note-edit';
      const domains = [...new Set((this._ctx?.sessions ?? []).map((s) => s.domain).filter(Boolean))];
      ed.innerHTML = `<summary>编辑、强化或删除这条记忆</summary><textarea id="ne-content">${esc(n.content)}</textarea>
        <div class="erow">
          <select id="ne-imp">${[1, 2, 3, 4, 5].map((i) => `<option value="${i}"${i === n.importance ? ' selected' : ''}>重要度${i}</option>`).join('')}</select>
          <select id="ne-kind"><option value="episodic"${n.kind === 'episodic' ? ' selected' : ''}>情景</option><option value="semantic"${n.kind === 'semantic' ? ' selected' : ''}>语义</option><option value="attitude"${n.kind === 'attitude' ? ' selected' : ''}>态度</option></select>
          <select id="ne-self" title="自我轨标记：自我=角色自身内容仅同角色可见；世界=显式共享；自动=按内容启发式判定">
            <option value="auto"${n.self == null ? ' selected' : ''}>轨道·自动</option>
            <option value="self"${n.self === true ? ' selected' : ''}>轨道·自我</option>
            <option value="world"${n.self === false ? ' selected' : ''}>轨道·世界</option>
          </select>
          <select id="ne-priv" title="可见域覆盖：派生=随来源会话域标记；公开=强制放行到所有会话；仅本会话=原地私密；私域·X=仅该域会话可见">
            <option value="">派生（随会话域）</option>
            <option value="public"${n.private === 'public' ? ' selected' : ''}>强制公开</option>
            <option value="__sess__"${n.private === n.sessionId ? ' selected' : ''}>仅本会话</option>
            ${domains.map((dm) => `<option value="${esc(dm)}"${n.private === dm ? ' selected' : ''}>私域·${esc(dm)}</option>`).join('')}
          </select>
          <button class="act" id="ne-save">保存</button>
          <button class="act" id="ne-reinf">强化</button>
          <button class="act danger" id="ne-del">删除</button>
        </div>`;
      detail.appendChild(ed);
      const q = (s) => detail.querySelector(s);
      q('#ne-save').onclick = async () => {
        const pv = q('#ne-priv').value, sv = q('#ne-self').value;
        this._detailDirty = false;
        await this._ctx?.actions?.patchNote?.(n.id, {
          content: q('#ne-content').value, importance: +q('#ne-imp').value, kind: q('#ne-kind').value,
          private: pv === '__sess__' ? n.sessionId : pv,
          self: sv === 'auto' ? null : sv === 'self',
        });
      };
      q('#ne-reinf').onclick = async () => { this._detailDirty = false; await this._ctx?.actions?.reinforceNote?.(n.id); };
      q('#ne-del').onclick = async () => {
        if (confirm('删除这条记忆？（写入 del 墓碑，不可恢复）')) { this._detailDirty = false; await this._ctx?.actions?.deleteNote?.(n.id); }
      };
      foot.textContent = `${n.actor ? `发言人 ${n.actor} · ` : ''}会话 ${shortId(n.sessionId)} · 重要度 ${n.importance}/5 · ${n.ageDays}天前 · 保持率 ${(n.retention * 100).toFixed(1)}% · 唤起 ${n.hits} 次${n.fading ? ' · ⚠将遗忘' : ''}${sb ? ` · ${sb.tip}` : ''}`;
    }
    this._mapCurrent.textContent = this._mapSummary(key);
    this._root.querySelectorAll('.card').forEach((x) => x.classList.toggle('active', x.dataset.key === key));
    if (t === 'memory' && !this._POS.has(key)) { this._C = this._buildCortex(vm); this._render(); }
    else { this._drawEdges(); this._applyFocus(); }
    if (key !== this._lastPanelKey) { this._lastPanelKey = key; if (key) this._burst(key); }
  },

  _bindMapNode(g, key) {
    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._panel(key);
      if (innerWidth <= 1000) this._title.scrollIntoView({ behavior: 'smooth' });
    });
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._panel(key); } });
    g.addEventListener('mouseenter', () => { this._mapCurrent.textContent = this._mapSummary(key); });
    g.addEventListener('mouseleave', () => { this._mapCurrent.textContent = this._mapSummary(this._sel); });
    g.addEventListener('focus', () => { this._mapCurrent.textContent = this._mapSummary(key); });
    g.addEventListener('blur', () => { this._mapCurrent.textContent = this._mapSummary(this._sel); });
  },

  // ── 皮肤接口 ──
  update(vm, ctx) {
    if (!this._root) return;
    this._ctx = ctx ?? this._ctx;
    this._vm = vm ?? this._vm;
    this._render();
    // 编辑中不重绘检查器（保住未保存输入）；与旧页 load() 同口径
    const ae = document.activeElement;
    const editing = this._detailDirty || (ae && this._detail?.contains(ae));
    if (!editing) this._panel(this._sel && this._validKey(this._sel) ? this._sel : null);
  },

  /** 顶栏搜索命中 → 节点 qhit + 连线 qlit + 气泡提示（旧页 query 输入框行为） */
  highlight(ids) {
    if (!this._root) return;
    const set = new Set(ids || []);
    this._qhit = set;
    this._nodeEls.forEach((g, k) => g.classList.toggle('qhit', set.has(k)));
    this._edgeEls.forEach((e) => {
      const on = !e.el.classList.contains('cross') && (set.has(e.a) || set.has(e.b));
      e.el.classList.toggle('qlit', on);
      if (on) this._fire(e, set.has(e.a) ? e.a : e.b, 0, '#a8ecff');
    });
    if (set.size) this._companion.textContent = `这句话会唤起 ${set.size} 条记忆，亮起来的就是。`;
    else this._setCompanion();
  },

  /** 选中节点（顶栏点选 / ?sel= / 卡片跳转）；null=回总览 */
  select(id) {
    if (!this._root || !this._vm) return;
    this._panel(id ?? null);
    if (id && innerWidth <= 1000) this._title.scrollIntoView({ behavior: 'smooth' });
  },

  unmount() {
    clearInterval(this._idleTimer); this._idleTimer = 0;
    if (this._pulseRAF) cancelAnimationFrame(this._pulseRAF);
    if (this._driftRAF) cancelAnimationFrame(this._driftRAF);
    this._pulseRAF = this._driftRAF = 0;
    this._pulses?.forEach((p) => p.dots.forEach((d) => d.remove()));
    this._pulses = [];
    if (this._onResize) removeEventListener('resize', this._onResize);
    if (this._onKey) document.removeEventListener('keydown', this._onKey);
    this._onResize = this._onKey = null;
    this._root?.replaceChildren();
    this._root = null;
    this._vm = null;
    this._C = null;
    this._nodeEls?.clear();
    this._edgeEls = [];
    this._sel = null;
  },
};
