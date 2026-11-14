// 墨刊（dossier）皮肤：概念图 a-dossier 还原。
// 刊头（双细线刊名/刊期/栏线副栏）→ 时间轴地层图（x=连续年龄 sqrt 刻度，三层 情景→语义→态度，
// 巩固画弧）→ 侧栏总览/专栏详情/同格记忆 → 底部记忆索引表（前 50 + 「查看全部」→ #/admin/memories）。
// 数据一律消费 ctx.vm（core/vm.js buildMapVM）；皮肤自身不 fetch。无 rAF（纯静态版式）。
// LOD：absorbed 存档条退出绘制集；活记忆按 (kind×天) 分 cell，每 cell ≤CELL_K 点成点、
// 余量折成带缝「+N」计数标（点击看全格 roster）；节点预算 NODE_CAP 按 kind→时间桶→cell
// 三级比例分配保底；常驻标签 ≤LABEL_CAP（分数序+AABB 防叠）；连线 ≤EDGE_CAP。

import { el } from '../core/ui.js';
import { hashColor } from '../core/theme.js';
import { kindLabel, relationWhy, previewText } from '../core/vm.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const W = 860, X0 = 110, X1 = 830, DMAX = 32;
const BANDS = { attitude: 70, semantic: 200, episodic: 330 };
const NODE_CAP = 60, LABEL_CAP = 24, EDGE_CAP = 80, PAGE_SIZE = 30;
const CELL_K = 4;          // 单格最多单独成点的条数
const CELL_ROSTER_CAP = 40;// 同格侧栏名单上限
const MARK_Y = 66;         // 「+N」标记基线：带底缝内（带界 ±58，下一带顶 -72）

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
// 连续年龄（天，浮点）：createdAt 优先，缺失退回整数 day + 半天居中
const ageDaysF = (n, now) => n.createdAt ? (now - n.createdAt) / 864e5 : (n.day ?? 0) + 0.5;
const nScore = (n) => (n.imp ?? n.importance ?? 0) * (n.ret ?? n.retention ?? 0);
const nTie = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
const nodeR = (n) => 4 + (n.imp ?? n.importance ?? 0) * 2.2;
const cellScoreOf = (c) => c.list.slice(0, CELL_K).reduce((s, n) => s + nScore(n), 0);
// 时间桶（dayCell 0..32 → 6 桶，近密远疏）：保底分配保证地层覆盖全轴
const bucketOf = (dc) => dc < 2 ? 0 : dc < 5 ? 1 : dc < 9 ? 2 : dc < 15 ? 3 : dc < 22 ? 4 : 5;

/**
 * 比例配额分配器：先按 prioKeys 顺序给每组 floorCap 保底（装不下则跳过），
 * 剩余预算按 alloc/demand 最小者优先逐个 +1 填满——确定性、与 quotaPick 同思路但按权重。
 * @param demand Map<key, number> 各组满载需求（>0）
 * @param cap    总预算
 * @param floorCap 每组保底上限
 * @param prioKeys 保底优先级序（先到先得）
 * @returns Map<key, number> 各组预算
 */
function allocBudget(demand, cap, floorCap, prioKeys) {
  const out = new Map();
  let sum = 0;
  for (const k of prioKeys) {
    const d = demand.get(k) ?? 0;
    if (!d) continue;
    const f = Math.min(d, floorCap);
    if (sum + f <= cap) { out.set(k, f); sum += f; }
  }
  const keys = [...demand.keys()];
  while (sum < cap) {
    let best = null, bestKey = null;
    for (const k of keys) {
      const d = demand.get(k), a = out.get(k) ?? 0;
      if (a >= d) continue;
      const ratio = a / d;
      if (best === null || ratio < best || (ratio === best && k < bestKey)) { best = ratio; bestKey = k; }
    }
    if (bestKey === null) break;
    out.set(bestKey, (out.get(bestKey) ?? 0) + 1);
    sum++;
  }
  return out;
}

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
    this._selCell = null;
    this._qhit = new Set();
    this._page = 0;
    this._pos = {};
    this._drawn = new Set();
    this._cells = new Map();
    this._cellOf = new Map();
    this._pinPos = new Map();
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
        <div class="pager" id="dPager"></div>
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
    const archived = notes.filter((n) => n.absorbed).length;
    q('#dSt').textContent = vm
      ? `记忆 ${notes.length} · 自我 ${self} · 世界 ${notes.length - self} · 关联 ${vm.links?.length ?? 0} · 存档 ${archived}`
      : '档案加载中……';
    q('#dFootName').textContent = `${theme.en || 'DOSSIER'}`;

    this._selCell = null;
    this._layout();
    this._drawMap();
    this._rows();
    const keep = this._sel && vm?.byId?.[this._sel] ? this._sel : null;
    this._select(keep);
    if (this._qhit.size) this._applyHi([...this._qhit]);
  },

  // ── 布局：absorbed 退出 → (kind×天) cell 聚合 → kind→时间桶→cell 三级配额 → 槽位+碰撞 ──
  _layout() {
    this._pos = {};
    this._drawn = new Set();
    this._cells = new Map();
    this._cellOf = new Map();
    this._pins = new Set();
    const vm = this._vm, now = vm?.now ?? Date.now();
    const notes = vm?.notes ?? [];
    const byId = vm?.byId ?? {};

    // 1) 聚合：absorbed 存档退出绘制集；活记忆按 (kind, dayCell) 分格，格内按分降序
    const cells = new Map();
    for (const n of notes) {
      if (n.absorbed) continue;
      const dc = Math.min(Math.max(0, Math.floor(ageDaysF(n, now))), 32);
      const kind = n.kind ?? 'episodic';
      const key = `${kind}|${dc}`;
      let c = cells.get(key);
      if (!c) cells.set(key, c = { key, kind, dc, list: [], drawn: [], drawnIds: new Set(), hidden: 0, markX: 0, markY: 0 });
      c.list.push(n);
    }
    this._cells = cells;
    for (const c of cells.values()) {
      c.list.sort((a, b) => nScore(b) - nScore(a) || nTie(a, b));
      for (const n of c.list) this._cellOf.set(n.id, c.key);
    }

    // 2) 三级配额：kind 间按满载需求比例（保底 6）；kind 内按时间桶比例（保底一格 CELL_K）
    const cellDemand = (c) => Math.min(c.list.length, CELL_K);
    const kinds = [...new Set([...cells.values()].map((c) => c.kind))];
    const kindDemand = new Map(), kindBest = new Map();
    for (const k of kinds) {
      const cs = [...cells.values()].filter((c) => c.kind === k);
      kindDemand.set(k, cs.reduce((s, c) => s + cellDemand(c), 0));
      kindBest.set(k, Math.max(...cs.map(cellScoreOf)));
    }
    const kindPrio = [...kinds].sort((a, b) => kindBest.get(b) - kindBest.get(a) || (a < b ? -1 : 1));
    const kindBudget = allocBudget(kindDemand, NODE_CAP, 6, kindPrio);

    for (const k of kinds) {
      const budget = kindBudget.get(k) ?? 0;
      const buckets = new Map();
      for (const c of cells.values()) {
        if (c.kind !== k) continue;
        const b = bucketOf(c.dc);
        let arr = buckets.get(b);
        if (!arr) buckets.set(b, arr = []);
        arr.push(c);
      }
      const bucketDemand = new Map(), bucketBest = new Map();
      for (const [b, cs] of buckets) {
        bucketDemand.set(b, cs.reduce((s, c) => s + cellDemand(c), 0));
        bucketBest.set(b, Math.max(...cs.map(cellScoreOf)));
      }
      const bucketPrio = [...buckets.keys()].sort((a, b) => bucketBest.get(b) - bucketBest.get(a) || a - b);
      const bucketBudget = allocBudget(bucketDemand, budget, CELL_K, bucketPrio);
      // 桶内 cell 按 cellScore 降序花预算；预算见底时按分取前 d 个（余量全进「+N」）
      for (const [b, cs] of buckets) {
        let remain = bucketBudget.get(b) ?? 0;
        cs.sort((a, b) => cellScoreOf(b) - cellScoreOf(a) || (a.key < b.key ? -1 : 1));
        for (const c of cs) {
          const d = Math.min(c.list.length, CELL_K, remain);
          c.drawn = d > 0 ? c.list.slice(0, d) : [];
          c.drawnIds = new Set(c.drawn.map((n) => n.id));
          c.hidden = c.list.length - c.drawn.length;
          remain -= d;
        }
      }
    }

    // 3) 「+N」标记落位（先于节点）：带缝单行、按 cellScore 序取「净空最大、漂移最小」；
    //    extra=补位时需额外避让的已落位节点（矩形口径）
    const placedM = [];
    // 情景带下方空隙最宽（底缘距日标 ~44px）→ 允许第二错峰行；其余带单行
    const markRows = (bandY) => (bandY === BANDS.episodic ? [MARK_Y, MARK_Y + 12] : [MARK_Y]);
    const placeMark = (c, extra = []) => {
      const bandY = BANDS[c.kind] ?? BANDS.episodic;
      const hw = `+${c.hidden}`.length * 2.6 + 2; // 9px mono 半宽估
      const bx0 = xOf(Math.min(c.dc + 0.5, DMAX));
      let bx = bx0, brow = MARK_Y, bScore = -Infinity;
      for (const row of markRows(bandY)) {
        for (const dx of [0, -6, 6, -12, 12, -18, 18, -24, 24, -36, 36, -48, 48, -60, 60]) {
          const cx = bx0 + dx;
          if (cx < 100 || cx > W - 20) continue;
          let clear = placedM.length || extra.length ? Infinity : 999;
          for (const m of placedM) {
            if (m.bandY !== bandY) continue; // 只同带互让（跨带纵向隔 130px 不冲突）
            if (Math.abs(m.y - (bandY + row - 2)) > 8) continue; // 只同行互让
            const d = Math.abs(m.x - cx) - m.hw - hw - 3;
            if (d < clear) clear = d;
          }
          for (const q of extra) {
            const ox = Math.max(0, Math.abs(q.x - cx) - hw - q.r - 2);
            const oy = Math.max(0, Math.abs(q.y - (bandY + row - 2)) - 5 - q.r - 2);
            const d = Math.hypot(ox, oy) - 3;
            if (d < clear) clear = d;
          }
          const score = clear - 0.05 * Math.abs(dx) - 0.03 * (row - MARK_Y);
          if (score > bScore) { bScore = score; bx = cx; brow = row; }
        }
      }
      c.markX = bx;
      c.markY = bandY + brow;
      c.marked = true;
      placedM.push({ x: bx, y: bandY + brow - 2, hw, bandY, box: true });
    };
    const marks = [...cells.values()].filter((c) => c.hidden > 0)
      .sort((a, b) => cellScoreOf(b) - cellScoreOf(a) || (a.key < b.key ? -1 : 1));
    for (const c of marks) placeMark(c);

    // 4) 槽位坐标：x=连续年龄；格内按分序纵向均布；碰撞 pass（真实半径、带内 clamp、避让标记）
    const units = [];
    for (const c of cells.values()) {
      const bandY = BANDS[c.kind] ?? BANDS.episodic;
      const D = c.drawn.length;
      c.drawn.forEach((n, i) => {
        const spacing = D > 1 ? Math.min(24, 68 / (D - 1)) : 0;
        units.push({
          id: n.id, cellKey: c.key, score: nScore(n),
          x: xOf(ageDaysF(n, now)),
          y: bandY + (i - (D - 1) / 2) * spacing,
          r: nodeR(n), bandY,
        });
      });
    }
    units.sort((a, b) => b.score - a.score || nTie(a, b));
    // 碰撞 pass：分数序逐个落位；候选=带内 y 全扫(步4)×小幅 x 挪(±24)，取「最大净空、位移最小」；
    // 全候选仍重叠（净空<-2）→ 不占位、降级进「+N」（低分者先降级，带宽不足时保版面整洁）
    const done = placedM.slice();
    for (const u of units) {
      let bx = u.x, by = u.y, bScore = -Infinity, bClear = -Infinity;
      for (let dy = -52; dy <= 52; dy += 4) {
        const cy = Math.min(Math.max(u.bandY + dy, u.bandY - 50), u.bandY + 50);
        for (const dx of [0, -8, 8, -16, 16, -24, 24]) {
          const cx = u.x + dx;
          if (cx < 96 || cx > W - 16) continue;
          let clear = done.length ? Infinity : 999;
          for (const q of done) {
            let d;
            if (q.box) { // 「+N」标记按矩形避让：半宽 hw、半高 5
              const ox = Math.max(0, Math.abs(q.x - cx) - q.hw - u.r - 2);
              const oy = Math.max(0, Math.abs(q.y - cy) - 5 - u.r - 2);
              d = Math.hypot(ox, oy) - 3;
            } else {
              d = Math.hypot(q.x - cx, q.y - cy) - q.r - u.r - 3;
            }
            if (d < clear) clear = d;
          }
          const score = clear - 0.1 * Math.abs(dx) - 0.03 * Math.abs(cy - u.y);
          if (score > bScore) { bScore = score; bx = cx; by = cy; bClear = clear; }
        }
      }
      const c = cells.get(u.cellKey);
      if (bClear < -2) { // 无处可放 → 降级进「+N」
        c.hidden++;
        c.drawnIds.delete(u.id);
        continue;
      }
      u.x = bx; u.y = by;
      done.push(u);
      this._pos[u.id] = [u.x, u.y];
      this._drawn.add(u.id);
      this._cellOf.set(u.id, u.cellKey);
    }
    // 碰撞降级后：首次出现 hidden 的 cell 补「+N」标记（同时避让已落位节点）
    const nodeBoxes = done.filter((q) => q.id);
    for (const c of cells.values())
      if (c.hidden > 0 && !c.marked) placeMark(c, nodeBoxes);

    // 5) 常驻标签：分数序候选（每 kind 先保底 3）；above→below 双锚位，
    //    对节点/「+N」标记/svg 边界做 AABB 防叠，放不下就不 pin（hover/选中仍显）
    const ranked = [...this._drawn].map((id) => byId[id]).filter(Boolean)
      .sort((a, b) => nScore(b) - nScore(a) || nTie(a, b));
    const cnt = {}, first = [], rest = [];
    for (const n of ranked) {
      const k = n.kind ?? 'episodic';
      if ((cnt[k] ?? 0) < 3) { first.push(n); cnt[k] = (cnt[k] ?? 0) + 1; }
      else rest.push(n);
    }
    this._pinPos = new Map();
    const taken = [];
    // b=[x0,y0,x1,y1] 矩形 vs q={x,y,r} 圆盘最近距离；hit 阈值可扣 slack 放宽（第二趟允许文字擦圆边）
    const circHit = (b, q, rr) => {
      const ox = Math.max(0, Math.max(q.x - b[2], b[0] - q.x));
      const oy = Math.max(0, Math.max(q.y - b[3], b[1] - q.y));
      return Math.hypot(ox, oy) < (rr ?? q.r + 1);
    };
    const tryPin = (n, slack) => {
      const p = this._pos[n.id];
      if (!p || this._pins.has(n.id)) return false;
      const r = nodeR(n), w = String(n.title ?? '').length * 12 + 8;
      for (const ldx of [0, -14, 14, -28, 28]) {
        const lx = p[0] + ldx;
        for (const { b, a } of [
          { b: [lx - w / 2, p[1] - r - 20, lx + w / 2, p[1] - r - 3], a: 'above' },
          { b: [lx - w / 2, p[1] + r + 4, lx + w / 2, p[1] + r + 17], a: 'below' },
        ]) {
          if (b[0] < 4 || b[2] > W - 4 || b[1] < 4 || b[3] > 406) continue;
          if (nodeBoxes.some((q) => circHit(b, q, q.r + 1 - slack))) continue;
          if (placedM.some((m) => circHit(b, { x: m.x, y: m.y, r: m.hw + 2 }))) continue;
          if (taken.some((t) => b[0] < t[2] + 4 && b[2] + 4 > t[0] && b[1] < t[3] + 2 && b[3] + 2 > t[1])) continue;
          taken.push(b);
          this._pins.add(n.id);
          this._pinPos.set(n.id, { a, x: ldx });
          return true;
        }
      }
      return false;
    };
    const order = [...first, ...rest];
    for (const n of order) { if (this._pins.size >= LABEL_CAP) break; tryPin(n, 1); }
    for (const n of order) { if (this._pins.size >= LABEL_CAP) break; tryPin(n, 7); }
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
    const ge = svg('g', {}, s), gm = svg('g', {}, s), gn = svg('g', {}, s);
    const ETYPE_CAP = { consolidate: 48, session: 16, similar: 20 };
    const rels = (vm.relations ?? [])
      .filter((r) => this._pos[r.a] && this._pos[r.b])
      .sort((a, b) => b.score - a.score);
    const ecnt = { consolidate: 0, session: 0, similar: 0 };
    const relDrawn = [];
    for (const r of rels) {
      if (relDrawn.length >= EDGE_CAP) break;
      const t = edgeKind(r);
      if (ecnt[t] >= ETYPE_CAP[t]) continue;
      ecnt[t]++;
      relDrawn.push(r);
    }
    for (const r of relDrawn) {
      const [ax, ay] = this._pos[r.a], [bx, by] = this._pos[r.b];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      // 端点收束到圆边外 2px——线不穿节点
      const ra = nodeR(byId[r.a]) + 2, rb = nodeR(byId[r.b]) + 2;
      const x1 = ax + (dx / len) * ra, y1 = ay + (dy / len) * ra;
      const x2 = bx - (dx / len) * rb, y2 = by - (dy / len) * rb;
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
    // 同格「+N」计数标记：带缝内、点击看全格 roster（hidden=0 不标）
    for (const c of this._cells.values()) {
      if (!c.hidden) continue;
      const g = svg('g', {
        class: 'cellmark', 'data-cell': c.key,
        transform: `translate(${c.markX} ${c.markY})`,
        tabindex: 0, role: 'button', 'aria-label': `同格另有 ${c.hidden} 条记忆`,
      }, gm);
      svg('text', { 'text-anchor': 'middle', class: 'cm' }, g).textContent = `+${c.hidden}`;
      g.onclick = () => this._selectCell(c.key);
      g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._selectCell(c.key); } };
    }
    for (const id of this._drawn) {
      const n = byId[id];
      if (!n) continue;
      const [x, y] = this._pos[id], r = nodeR(n);
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
      const anch = this._pinPos?.get(id);
      const t = svg('text', {
        class: 'lab', x: anch?.x ?? 0,
        y: anch?.a === 'below' ? r + 14 : -r - 7, 'text-anchor': 'middle',
      }, g);
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
    if (!this._pos[n.id]) side.append(el('div', 'nodraw',
      n.absorbed ? '该条目已沉淀为语义存档，不在地层图绘制集内。'
        : '该条目未单独上图（同格聚合或超出 LOD），可在索引表与管理端查看。'));

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

  // ── 侧栏：同格记忆名单（cell 聚合标记的全量成员，含未上图条目）──
  _sideCell(c) {
    const side = this._root.querySelector('#dSide');
    side.replaceChildren();
    const back = el('button', 'back', '← 返回总览');
    back.type = 'button';
    back.onclick = () => this._select(null);
    side.append(back);
    const dcTxt = c.dc >= 32 ? '32 天前及以前' : `${c.dc} 天前`;
    const kick = el('div', 'kicker', `${kindLabel(c.kind)} · ${dcTxt}`);
    kick.style.marginTop = '16px';
    side.append(kick);
    side.append(el('h2', '', `同格 ${c.list.length} 条`));
    side.append(el('p', 'dek',
      `这一格共有 ${c.list.length} 条记忆，图上单独成点 ${c.drawnIds.size} 条${c.hidden ? `，其余 ${c.hidden} 条聚合在「+${c.hidden}」里` : ''}。点条目看专栏。`));
    const ul = el('ul', 'rel');
    for (const n of c.list.slice(0, CELL_ROSTER_CAP)) {
      const li = el('li');
      li.append(el('b', '', n.title));
      const meta = [`保持 ${Math.round(n.ret * 100)}%`, `重要 ${n.imp}`, `${n.day ?? '—'} 天前`];
      if (c.drawnIds.has(n.id)) meta.push('上图');
      li.append(el('span', '', meta.join(' · ')));
      li.onclick = () => this._select(n.id);
      ul.append(li);
    }
    if (c.list.length > CELL_ROSTER_CAP)
      ul.append(el('li', '', `…… 另 ${c.list.length - CELL_ROSTER_CAP} 条，索引表与管理端可全量查看`));
    side.append(ul);
  },

  _moodColor(w) {
    return this._ctx?.theme?.moodColors?.[w] ?? hashColor(w);
  },

  // ── 索引表：retention 降序分页（PAGE_SIZE/页，全量仍可去管理端）──
  _rows() {
    const tb = this._root.querySelector('#dRows');
    tb.replaceChildren();
    const pg = this._root.querySelector('#dPager');
    pg?.replaceChildren();
    const vm = this._vm;
    if (!vm) return;
    const all = [...vm.notes].sort((a, b) => b.ret - a.ret || (a.id < b.id ? -1 : 1));
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (this._page >= pages) this._page = pages - 1;
    const slice = all.slice(this._page * PAGE_SIZE, this._page * PAGE_SIZE + PAGE_SIZE);
    for (const [i, n] of slice.entries()) {
      const tr = el('tr', 'row');
      tr.dataset.id = n.id;
      tr.append(el('td', 'n', String(this._page * PAGE_SIZE + i + 1).padStart(2, '0')));
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
    if (pg) {
      const info = el('span', 'info', pages > 1 ? `第 ${this._page + 1} / ${pages} 页 · 共 ${all.length} 条` : `共 ${all.length} 条`);
      if (pages > 1) {
        const mkBtn = (label, d, dis) => {
          const b = el('button', 'pg', label);
          b.type = 'button';
          b.disabled = dis;
          b.onclick = () => { this._page += d; this._rows(); };
          return b;
        };
        pg.append(mkBtn('‹ 上一页', -1, this._page === 0), info, mkBtn('下一页 ›', 1, this._page >= pages - 1));
      } else pg.append(info);
    }
  },

  // ── 选中（内部 + 皮肤接口共用）──
  _select(id) {
    this._selCell = null;
    this._sel = id;
    this._root.querySelectorAll('.cellmark').forEach((m) => m.classList.remove('sel', 'dim', 'near'));
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
    if (n) {
      const ck = this._cellOf.get(id);
      if (ck) this._root.querySelector(`[data-cell="${ck}"]`)?.classList.add('near');
    }
    // 不做 scrollIntoView：选中不该强制拖动页面；行高亮留给用户自己滚到
    this._root.querySelectorAll('#dRows tr.row').forEach((r) => {
      r.classList.toggle('sel', r.dataset.id === id);
    });
  },

  // ── 同格聚焦：点「+N」标记 → 侧栏全格名单 + 地图只留该格高亮 ──
  _selectCell(key) {
    const c = this._cells?.get(key);
    if (!c) return;
    this._selCell = key;
    this._sel = null;
    const memberIds = new Set(c.list.map((n) => n.id));
    const drawnIds = c.drawnIds ?? new Set();
    this._sideCell(c);
    this._root.querySelectorAll('.node').forEach((g) => {
      const id = g.dataset.id;
      g.classList.toggle('sel', false);
      g.classList.toggle('near', drawnIds.has(id));
      g.classList.toggle('dim', !memberIds.has(id));
    });
    this._root.querySelectorAll('.edge').forEach((e) => {
      e.classList.toggle('dim', !(memberIds.has(e.dataset.a) && memberIds.has(e.dataset.b)));
    });
    this._root.querySelectorAll('.cellmark').forEach((m) => {
      const on = m.dataset.cell === key;
      m.classList.toggle('sel', on);
      m.classList.toggle('dim', !on);
    });
    this._root.querySelectorAll('#dRows tr.row').forEach((r) => {
      r.classList.toggle('near', memberIds.has(r.dataset.id));
      r.classList.toggle('sel', false);
    });
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
    this._sel = null; this._selCell = null; this._qhit = new Set();
    this._pos = {}; this._drawn = new Set(); this._pins = new Set();
    this._cells = new Map(); this._cellOf = new Map(); this._pinPos = new Map();
  },
};
