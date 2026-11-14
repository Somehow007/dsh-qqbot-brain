// 备份迁移页：导出 / 导入（merge|replace）/ 近重复去重预估与执行 / 危险区
// （按时段删、按人设删、记忆重置）。全部走既有 HTTP 契约。

import { api, fapi, API, TOKEN } from '../core/api.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { el, toast, confirmDialog } from '../core/ui.js';
import { confirmDanger, pauseEditing, mutRefresh } from './common.js';

let ROOT = null;
let IMP = null;          // {name,text,mode}
let DEDUP_EST = null;    // dry-run 结果
let cleanPause = null;

// ── 导出 ──
async function backupExport() {
  try {
    const r = await fetch(`${API}/export`, { headers: TOKEN ? { 'x-brain-token': TOKEN } : {} });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const day = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brain-export-${day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`已导出 brain-export-${day}.json`, 3000);
  } catch (e) {
    toast(`导出失败：${e instanceof Error ? e.message : e}`);
  }
}

// ── 导入 ──
function impPick(input) {
  const f = input.files?.[0];
  if (!f) return;
  f.text().then((t) => {
    IMP = { name: f.name, text: t, mode: IMP?.mode === 'replace' ? 'replace' : 'merge' };
    renderImportStat();
  });
}

async function backupImport() {
  if (!IMP) return;
  if (IMP.mode === 'replace') {
    const ok = await confirmDialog({
      title: '覆盖导入',
      body: '覆盖模式将清空当前全部记忆、画像与人设，再以备份整包恢复。该操作不可撤销。',
      okText: '覆盖导入', danger: true, expect: '覆盖',
    });
    if (!ok) return;
  }
  try {
    JSON.parse(IMP.text); // 先验 JSON
  } catch {
    toast('文件不是有效 JSON', 3000);
    return;
  }
  try {
    // /api/import 收裸 JSON 原文（非 {body:...} 包装）
    const r = await fapi(`/import?mode=${IMP.mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: IMP.text,
    });
    const st = ROOT?.querySelector('#impStat');
    if (st) {
      st.textContent = `已导入（${IMP.mode === 'merge' ? '合并' : '覆盖'}）：记忆 ${r.notes ?? 0} · 跳过 ${r.skipped ?? 0} · 画像 ${r.profiles ?? 0}${r.persona ? ' · 人设已更新' : ''}`;
      st.className = 'bstat ok';
    }
    toast(`导入完成：+${r.notes ?? 0} 记忆 · +${r.profiles ?? 0} 画像`, 3500);
    IMP = null;
    mutRefresh();
    render();
  } catch (e) {
    toast(`导入失败：${e instanceof Error ? e.message : e}`, 4000);
  }
}

function renderImportStat() {
  const st = ROOT?.querySelector('#impStat');
  if (st) st.textContent = IMP ? `已选：${IMP.name}（${IMP.text.length} 字节 · ${IMP.mode}）` : '尚未选择文件';
  const go = ROOT?.querySelector('#impGo');
  if (go) go.disabled = !IMP;
}

// ── 近重复去重（B5 dry-run + 执行）──
async function dedupEstimate() {
  const st = ROOT?.querySelector('#dedupStat');
  try {
    const r = await api.post('/dedup?dry=1');
    DEDUP_EST = r;
    const merged = r.wouldMerge ?? 0;
    if (st) {
      st.textContent = merged
        ? `预计 ${r.clusters ?? 0} 簇 · 合并 ${merged} 条重复 · 佐证放行 ${r.released ?? 0} 条`
        : '未发现近重复（向量余弦 ≥ 阈值）';
      st.className = 'bstat';
    }
    const go = ROOT?.querySelector('#dedupGo');
    if (go) go.disabled = !merged;
  } catch (e) {
    if (st) { st.textContent = `预估失败：${e instanceof Error ? e.message : e}`; st.className = 'bstat err'; }
  }
}

async function dedupGo() {
  if (!DEDUP_EST || !(DEDUP_EST.wouldMerge > 0)) return;
  if (!(await confirmDanger({
    title: '合并近重复记忆',
    body: `将合并约 ${DEDUP_EST.wouldMerge} 条近重复（保留信息量最大者，hits 求和、strength 封顶 10），域内佐证记录可能自动放行。建议先导出备份。`,
    okText: '执行合并',
  }))) return;
  try {
    const r = await api.post('/dedup');
    const st = ROOT?.querySelector('#dedupStat');
    if (st) {
      st.textContent = `已合并 ${r.merged ?? 0} 条 · ${r.clusters ?? 0} 簇 · 放行 ${r.released ?? 0} 条`;
      st.className = 'bstat ok';
    }
    toast(`已合并 ${r.merged ?? 0} 条近重复`, 3000);
    DEDUP_EST = null;
    const go = ROOT?.querySelector('#dedupGo');
    if (go) go.disabled = true;
    mutRefresh();
  } catch (e) {
    toast(`合并失败：${e instanceof Error ? e.message : e}`, 4000);
  }
}

// ── 危险区：预览数量（用 store.state.notes 本地估算）──
function notes() { return store.state?.notes ?? []; }

function purgeRange() {
  const fv = ROOT?.querySelector('#pf')?.value;
  const tv = ROOT?.querySelector('#pt')?.value;
  if (!fv || !tv) return null;
  const from = new Date(fv).getTime();
  const to = new Date(tv).getTime() + 59999; // datetime-local 无秒 → +59.999s 闭区间
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null;
  return { from, to, count: notes().filter((n) => (n.createdAt ?? 0) >= from && (n.createdAt ?? 0) <= to).length };
}

function purgePreview() {
  const r = purgeRange();
  const b = ROOT?.querySelector('#purgeGo');
  const s = ROOT?.querySelector('#purgeStat');
  if (!r) { if (b) b.disabled = true; if (s) s.textContent = '请先选择有效起止时间'; return; }
  if (b) b.disabled = !r.count;
  if (s) s.textContent = r.count ? `区间内 ${r.count} 条记忆将被删除` : '区间内无记忆';
}

async function purgeGo() {
  const r = purgeRange();
  if (!r?.count) return;
  if (!(await confirmDanger({
    title: '按时段删除',
    body: `永久删除 ${r.count} 条创建于该时段的记忆？写入 del-range op，不可撤销。`,
    okText: '删除',
  }))) return;
  try {
    const res = await api.post('/notes/purge', { from: r.from, to: r.to });
    const s = ROOT?.querySelector('#purgeStat');
    if (s) { s.textContent = `已删除 ${res.deleted ?? 0} 条`; s.className = 'bstat ok'; }
    toast(`已删除 ${res.deleted ?? 0} 条`, 3000);
    const b2 = ROOT?.querySelector('#purgeGo'); if (b2) b2.disabled = true;
    mutRefresh();
  } catch (e) { toast(`删除失败：${e instanceof Error ? e.message : e}`); }
}

function purgePCount() {
  const pid = ROOT?.querySelector('#pp')?.value;
  return pid ? notes().filter((n) => n.personaId === pid).length : 0;
}

function purgePPreview() {
  const c = purgePCount();
  const b = ROOT?.querySelector('#purgePGo');
  const s = ROOT?.querySelector('#purgePStat');
  const pid = ROOT?.querySelector('#pp')?.value;
  const pn = (store.personas?.personas ?? []).find((p) => p.id === pid)?.name || pid;
  if (b) b.disabled = !c;
  if (s) s.textContent = c ? `「${pn}」形成的 ${c} 条记忆（事实+态度）将被删除` : '该人设暂无记忆';
}

async function purgePGo() {
  const pid = ROOT?.querySelector('#pp')?.value;
  const c = purgePCount();
  if (!pid || !c) return;
  const pn = (store.personas?.personas ?? []).find((p) => p.id === pid)?.name || pid;
  if (!(await confirmDanger({
    title: '按人设删除',
    body: `永久删除「${pn}」形成的 ${c} 条记忆？写入 del-persona op，不可撤销。`,
    okText: '删除',
  }))) return;
  try {
    const res = await api.post('/notes/purge', { personaId: pid });
    const s = ROOT?.querySelector('#purgePStat');
    if (s) { s.textContent = `已删除 ${res.deleted ?? 0} 条`; s.className = 'bstat ok'; }
    toast(`已删除 ${res.deleted ?? 0} 条`, 3000);
    const b2 = ROOT?.querySelector('#purgePGo'); if (b2) b2.disabled = true;
    mutRefresh();
  } catch (e) { toast(`删除失败：${e instanceof Error ? e.message : e}`); }
}

async function resetGo() {
  const n = notes().length;
  const p = (store.profiles ?? []).length;
  if (!(await confirmDialog({
    title: '记忆重置',
    body: `清空全部记忆（${n} 条）、画像（${p} 张）、情绪与摘要；人格内核与人设版本保留。不可撤销。`,
    okText: '重置', danger: true, expect: '重置',
  }))) return;
  try {
    const r = await api.post('/reset');
    const cleared = r.cleared ?? {};
    const s = ROOT?.querySelector('#rstStat');
    if (s) { s.textContent = `已重置：记忆 ${cleared.notes ?? 0} · 画像 ${cleared.profiles ?? 0}`; s.className = 'bstat ok'; }
    toast('已重置', 3000);
    mutRefresh();
  } catch (e) { toast(`重置失败：${e instanceof Error ? e.message : e}`); }
}

// ── 渲染 ──
function render() {
  if (!ROOT) return;
  ROOT.replaceChildren();

  const head = el('div', 'phead');
  head.appendChild(el('span', 'no', '07'));
  head.appendChild(el('h1', '', '备份迁移'));
  const sub = el('div', 'sub');
  sub.append('Backup & Danger Zone', document.createElement('br'), '导出 / 导入 / 清理');
  head.appendChild(sub);
  ROOT.appendChild(head);

  const grid = el('div', 'bgrid');

  // 导出
  const c1 = el('div', 'bcell');
  c1.appendChild(el('h4', '', '导出全量备份'));
  c1.appendChild(el('div', 'desc', 'BrainExport v1：人设 + 全部记忆 + 画像 + 情绪 + 摘要 + 会话域，一份 JSON 搞定迁移与灾备。'));
  const ex = el('button', 'btn pri', '⬇ 导出 brain-export.json');
  ex.onclick = backupExport;
  c1.appendChild(ex);
  grid.appendChild(c1);

  // 导入
  const c2 = el('div', 'bcell');
  c2.appendChild(el('h4', '', '导入备份'));
  c2.appendChild(el('div', 'desc', '选择导出 JSON。合并=按 id 去重补入（本地优先）；覆盖=清库后整包恢复（需输入「覆盖」确认）。'));
  const file = document.createElement('input');
  file.type = 'file'; file.accept = '.json,application/json';
  file.style.fontSize = '12px';
  file.onchange = () => impPick(file);
  c2.appendChild(file);
  const radio = el('div', 'radio');
  const rm = document.createElement('label');
  const rim = document.createElement('input');
  rim.type = 'radio'; rim.name = 'im'; rim.value = 'merge'; rim.checked = IMP?.mode !== 'replace';
  rim.onchange = () => { if (IMP) IMP.mode = 'merge'; renderImportStat(); };
  rm.append(rim, document.createTextNode('合并 merge'));
  const rr = document.createElement('label');
  const rir = document.createElement('input');
  rir.type = 'radio'; rir.name = 'im'; rir.value = 'replace'; rir.checked = IMP?.mode === 'replace';
  rir.onchange = () => { if (IMP) IMP.mode = 'replace'; renderImportStat(); };
  rr.append(rir, document.createTextNode('覆盖 replace'));
  radio.append(rm, rr);
  c2.appendChild(radio);
  const go = el('button', 'btn', '导入');
  go.id = 'impGo'; go.disabled = !IMP;
  go.onclick = backupImport;
  const stat = el('div', 'bstat', IMP ? `已选：${IMP.name}` : '尚未选择文件');
  stat.id = 'impStat';
  c2.append(go, stat);
  grid.appendChild(c2);
  ROOT.appendChild(grid);

  // 维护
  const mod = el('section', 'mod');
  const mh = el('div', 'mh');
  mh.appendChild(el('span', 'no', 'BK-02'), el('span', '', '维护'), el('em', '', '低频手动操作'));
  mod.appendChild(mh);
  const row = el('div');
  row.style.cssText = 'display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start';

  const d1 = el('div');
  d1.style.cssText = 'flex:1;min-width:300px';
  d1.appendChild(el('h4', '', '近重复记忆合并'));
  d1.appendChild(el('div', 'desc', '向量余弦 ≥ 阈值的记忆聚类，每簇保留信息量最大者，其余 merge 后删除。三轨/私域边界不互并；域内佐证记录可能自动放行。'));
  d1.appendChild(el('div', 'desc', 'dry-run 预估 → POST /api/dedup?dry=1；执行 → POST /api/dedup')).style.marginBottom = '10px';
  const est = el('button', 'btn', '估算合并量');
  est.onclick = dedupEstimate;
  const dgo = el('button', 'btn pri', '合并近重复');
  dgo.id = 'dedupGo'; dgo.disabled = true;
  dgo.style.marginLeft = '8px';
  dgo.onclick = dedupGo;
  const dst = el('div', 'bstat', '');
  dst.id = 'dedupStat';
  d1.append(est, dgo, dst);
  row.appendChild(d1);

  const d2 = el('div');
  d2.style.cssText = 'flex:1;min-width:300px';
  d2.appendChild(el('h4', '', '私域放行队列'));
  d2.appendChild(el('div', 'desc', '域内疑似良性事实排队人工放行（私密线索词命中的不入队）。'));
  const relBtn = el('button', 'btn', '去记忆库查看放行队列 →');
  relBtn.onclick = () => navigate('#/admin/memories');
  d2.appendChild(relBtn);
  row.appendChild(d2);
  mod.appendChild(row);
  ROOT.appendChild(mod);

  // 危险区
  const dz = el('div', 'dangerzone');
  dz.appendChild(el('h4', '', '危险区 · 不可撤销操作'));
  dz.appendChild(el('div', 'desc', '以下操作写入事件流水但无法回滚，执行前请先导出备份。'));

  const dr1 = el('div', 'drow');
  const dd1 = el('div');
  dd1.appendChild(el('h5', '', '按时段删除记忆'));
  dd1.appendChild(el('div', 'desc', 'createdAt ∈ [from,to] 闭区间（ms）。op 显式携带 ids，防重放误删后入库记忆。'));
  const range = el('div');
  range.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  const fi = document.createElement('input');
  fi.type = 'datetime-local'; fi.id = 'pf'; fi.style.fontSize = '12px';
  const tilde = el('span', '', '~');
  const ti = document.createElement('input');
  ti.type = 'datetime-local'; ti.id = 'pt'; ti.style.fontSize = '12px';
  const pv = el('button', 'btn sm', '预览数量');
  pv.onclick = purgePreview;
  const pg = el('button', 'btn sm danger', '删除');
  pg.id = 'purgeGo'; pg.disabled = true;
  pg.onclick = purgeGo;
  range.append(fi, tilde, ti, pv, pg);
  const ps = el('div', 'bstat', '');
  ps.id = 'purgeStat';
  dd1.append(range, ps);

  const dd2 = el('div');
  dd2.appendChild(el('h5', '', '按人设删除记忆'));
  dd2.appendChild(el('div', 'desc', '删除该人设（版本）形成的全部记忆，事实+态度一起删。'));
  const pr = el('div');
  pr.style.cssText = 'display:flex;gap:8px;align-items:center';
  const psel = document.createElement('select');
  psel.id = 'pp'; psel.style.fontSize = '12px';
  for (const p of store.personas?.personas ?? []) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = `${p.name}（${p.id}）`;
    psel.appendChild(o);
  }
  const ppv = el('button', 'btn sm', '预览数量');
  ppv.onclick = purgePPreview;
  const pgo = el('button', 'btn sm danger', '删除');
  pgo.id = 'purgePGo'; pgo.disabled = true;
  pgo.onclick = purgePGo;
  pr.append(psel, ppv, pgo);
  const pps = el('div', 'bstat', '');
  pps.id = 'purgePStat';
  dd2.append(pr, pps);
  dr1.append(dd1, dd2);
  dz.appendChild(dr1);

  const dr2 = el('div', 'drow');
  dr2.style.gridTemplateColumns = '1fr';
  const dd3 = el('div');
  dd3.appendChild(el('h5', '', '记忆重置（保留人设）'));
  dd3.appendChild(el('div', 'desc', '清空全部记忆、画像、情绪与摘要；人格内核与人设版本保留。输入「重置」解锁。'));
  const rr2 = el('div');
  rr2.style.cssText = 'display:flex;gap:8px;align-items:center';
  const rw = document.createElement('input');
  rw.type = 'text'; rw.id = 'rstWord'; rw.placeholder = '输入「重置」'; rw.style.width = '160px';
  rw.oninput = () => { const b = ROOT?.querySelector('#rstGo'); if (b) b.disabled = rw.value.trim() !== '重置'; };
  const rb = el('button', 'btn danger', '重置全部记忆');
  rb.id = 'rstGo'; rb.disabled = true;
  rb.onclick = resetGo;
  rr2.append(rw, rb);
  const rs = el('div', 'bstat', '');
  rs.id = 'rstStat';
  dd3.append(rr2, rs);
  dr2.appendChild(dd3);
  dz.appendChild(dr2);
  ROOT.appendChild(dz);

  const foot = el('div', 'pfoot');
  foot.appendChild(el('span', '', '备份迁移 · 导出/导入走 BrainExport v1 · 危险操作写 op 可审计'));
  foot.appendChild(el('span', '', '建议先导出再执行危险区操作'));
  ROOT.appendChild(foot);

  fi.addEventListener('change', purgePreview);
  ti.addEventListener('change', purgePreview);
}

export const backupPage = {
  mount(root) {
    ROOT = root;
    cleanPause = pauseEditing(root);
    render();
  },
  update() { /* 危险区计数用 store.state —— 数据刷新后重渲染保持计数新鲜，但会丢输入；仅在非编辑时刷 */
    if (store.editing === 0 && !IMP) render();
  },
  unmount() {
    cleanPause?.(); cleanPause = null;
    IMP = null; DEDUP_EST = null;
    ROOT = null;
  },
};
