// 人设页：PersonaEntry {id,name,text,characterId?,moods?,meta?} 全字段编辑。
// meta={theme{a,a2,soft,deep},moodColors{词:色},traits[{name,v}],mono,en,tagline}
// ——纯展示字段（B1），不进 prompt。配色改动实时预览（resolveTheme 试算）。
// 写路径：POST /api/personas（新建）、PATCH /api/personas（保存）、activate、DELETE。

import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { resolveTheme, hashColor } from '../core/theme.js';
import { el, toast, confirmDialog } from '../core/ui.js';
import { confirmDanger, pauseEditing, leaveGuards, mutRefresh } from './common.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const META_TEXT_CAP = 40;
const TRAITS_CAP = 6;
const TEXT_CAP = 50000;

// 页状态
const PS = { sel: null, draft: null, dirty: false, pendingNewFrom: null };
let ROOT = null;
let CTX = null;
let cleanPause = null;

const blankMeta = () => ({ theme: { a: '', a2: '', soft: '', deep: '' }, moodColors: {}, traits: [], mono: '', en: '', tagline: '' });

function normMeta(raw) {
  const m = blankMeta();
  if (raw && typeof raw === 'object') {
    if (raw.theme && typeof raw.theme === 'object') {
      for (const k of ['a', 'a2', 'soft', 'deep']) {
        if (HEX.test(raw.theme[k] ?? '')) m.theme[k] = raw.theme[k];
      }
    }
    if (raw.moodColors && typeof raw.moodColors === 'object') {
      for (const [w, c] of Object.entries(raw.moodColors)) {
        if (w && HEX.test(c ?? '')) m.moodColors[w] = c;
      }
    }
    if (Array.isArray(raw.traits)) {
      m.traits = raw.traits.slice(0, TRAITS_CAP)
        .filter((t) => t && typeof t.name === 'string' && t.name.trim() && Number.isFinite(t.v))
        .map((t) => ({ name: t.name.trim().slice(0, 40), v: Math.min(1, Math.max(0, t.v)) }));
    }
    for (const k of ['mono', 'en', 'tagline']) {
      if (typeof raw[k] === 'string') m[k] = raw[k].trim().slice(0, META_TEXT_CAP);
    }
  }
  return m;
}

function draftFromPersona(p) {
  if (!p) {
    return { isNew: true, id: '', name: '', characterId: '', text: '', moods: [], meta: blankMeta() };
  }
  return {
    isNew: false,
    id: p.id,
    name: p.name ?? '',
    characterId: p.characterId ?? '',
    text: p.text ?? '',
    moods: Array.isArray(p.moods) ? [...p.moods] : [],
    meta: normMeta(p.meta),
  };
}

function markDirty() {
  PS.dirty = true;
  const s = ROOT?.querySelector('#pstat');
  if (s) s.innerHTML = '';
  if (s) s.appendChild(el('span', 'pdirty', '● 未保存修改'));
}

function ensureDraft() {
  const list = CTX?.personas ?? store.personas?.personas ?? [];
  // 刚创建成功：从「创建前 id 集合」里挑出新条目并选中（等 store 刷新到位）
  if (PS.pendingNewFrom) {
    const fresh = list.find((p) => !PS.pendingNewFrom.has(p.id));
    if (fresh) {
      PS.pendingNewFrom = null;
      PS.sel = fresh.id;
      PS.draft = draftFromPersona(fresh);
      PS.dirty = false;
      return;
    }
  }
  if (!PS.draft || (PS.draft.id && !list.some((p) => p.id === PS.draft.id))) {
    const p = list.find((x) => x.id === (PS.sel ?? store.personas?.activeId)) ?? list[0];
    PS.sel = p?.id ?? '__new__';
    PS.draft = draftFromPersona(p);
    PS.dirty = false;
  }
}

// ── 主题预览：draft → resolveTheme 试算 ──
function previewTheme() {
  const d = PS.draft;
  if (!d) return null;
  const meta = serializeMeta(d.meta);
  const fake = {
    id: d.id || 'preview', name: d.name || '预览', text: d.text || '',
    characterId: d.characterId || undefined, moods: d.moods.length ? d.moods : undefined,
    meta: meta ?? undefined,
  };
  const all = CTX?.personas ?? store.personas?.personas ?? [];
  return resolveTheme(fake, all);
}

/** draft.meta → PersonaMeta | null（全空→null 清除；theme 需四色齐才下发） */
function serializeMeta(m) {
  if (!m) return null;
  const out = {};
  const t = m.theme ?? {};
  if (['a', 'a2', 'soft', 'deep'].every((k) => HEX.test(t[k] ?? ''))) {
    out.theme = { a: t.a, a2: t.a2, soft: t.soft, deep: t.deep };
  }
  const mc = {};
  for (const [w, c] of Object.entries(m.moodColors ?? {})) {
    const word = String(w).trim().slice(0, 40);
    if (word && HEX.test(c ?? '')) mc[word] = c;
  }
  if (Object.keys(mc).length) out.moodColors = mc;
  const traits = (m.traits ?? []).filter((x) => x.name?.trim() && Number.isFinite(x.v))
    .slice(0, TRAITS_CAP).map((x) => ({ name: x.name.trim().slice(0, 40), v: Math.min(1, Math.max(0, x.v)) }));
  if (traits.length) out.traits = traits;
  for (const k of ['mono', 'en', 'tagline']) {
    const v = String(m[k] ?? '').trim().slice(0, META_TEXT_CAP);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// ── 渲染 ──
function render() {
  if (!ROOT) return;
  ensureDraft();
  const d = PS.draft;
  const list = CTX?.personas ?? store.personas?.personas ?? [];
  const activeId = store.personas?.activeId;
  const isNew = d.isNew || !d.id;
  const dirty = PS.dirty;
  ROOT.replaceChildren();

  const head = el('div', 'phead');
  head.appendChild(el('span', 'no', '03'));
  head.appendChild(el('h1', '', '人设'));
  const sub = el('div', 'sub');
  sub.append('Personas', document.createElement('br'), '角色版本 · 主题参数 · 人格内核');
  head.appendChild(sub);
  ROOT.appendChild(head);

  const grid = el('div', 'pgrid');

  // ── 左：人设列表 ──
  const plist = el('div', 'plist');
  for (const p of list) {
    const pi = el('div', `pi${PS.sel === p.id ? ' on' : ''}`);
    const sw = el('i', 'sw');
    sw.style.background = p.meta?.theme?.a || resolveTheme(p, list).a;
    const txt = el('div');
    txt.appendChild(el('b', '', p.name || p.id));
    txt.appendChild(el('small', '', `${p.id} → ${p.characterId || p.id}`));
    pi.append(sw, txt);
    if (p.id === activeId) pi.appendChild(el('span', 'tag', '当前'));
    pi.onclick = () => selectPersona(p.id);
    plist.appendChild(pi);
  }
  const pnew = el('div', 'pnew');
  const nb = el('button', 'btn sm', '＋ 新建人设');
  nb.style.width = '100%'; nb.type = 'button';
  nb.onclick = () => newPersona();
  pnew.appendChild(nb);
  plist.appendChild(pnew);
  grid.appendChild(plist);

  // ── 右：编辑区 ──
  const edit = el('div', 'pedit');
  if (isNew) {
    const nb2 = el('div', 'mb', '● 新建草稿 · 尚未写入（POST /api/personas）');
    nb2.style.cssText = 'font:12px var(--mono);color:var(--accent);margin-bottom:14px';
    edit.appendChild(nb2);
  }

  // 基本信息
  const sec1 = el('div', 'sec');
  sec1.appendChild(el('h4', '', '基本信息'));
  const fr1 = el('div', 'frow');
  const fn = fld('名称 name *', inp(d.name, (v) => { d.name = v; markDirty(); }));
  const fc = fld('所属角色 characterId', inp(d.characterId, (v) => { d.characterId = v; markDirty(); }, '缺省=人设ID；同角色版本共享自我轨'));
  fr1.append(fn, fc);
  const fr2 = el('div', 'frow');
  const fv = fld('版本 version（展示字段）', (() => {
    const i = document.createElement('input');
    i.value = d.id || '（保存后生成）';
    i.disabled = true;
    return i;
  })());
  const fst = el('div', 'fld');
  fst.appendChild(el('label', '', '状态'));
  const st = el('div');
  st.style.cssText = 'padding-top:6px;font-size:12px;display:flex;gap:8px;align-items:center';
  st.appendChild(el('span', `badge ${d.id === activeId ? 'on' : 'world'}`, d.id === activeId ? '当前生效' : '未启用 · 保存不影响当前回复'));
  const pstat = el('span', '');
  pstat.id = 'pstat';
  if (dirty) pstat.appendChild(el('span', 'pdirty', '● 未保存修改'));
  else pstat.appendChild(el('span', '', `已保存 · ${d.id || ''}`));
  pstat.style.cssText = 'font:11px var(--mono);color:var(--ink3)';
  st.appendChild(pstat);
  fst.appendChild(st);
  fr2.append(fv, fst);
  sec1.append(fr1, fr2);
  edit.appendChild(sec1);

  // 配色
  const sec2 = el('div', 'sec');
  sec2.appendChild(el('h4', '', '强调色 pal{a,a2,soft,deep} · 改动实时预览'));
  const palrow = el('div', 'palrow');
  const pv = previewTheme();
  for (const k of ['a', 'a2', 'soft', 'deep']) {
    const pf = el('div', 'pf');
    pf.appendChild(el('label', '', k));
    const ci = document.createElement('input');
    ci.type = 'color';
    ci.value = HEX.test(d.meta.theme[k] ?? '') ? d.meta.theme[k] : (pv?.[k] ?? '#888888');
    // theme 需四色齐才下发：动任一色板时先用预览值补齐其余三色（所见即所得）
    ci.oninput = () => {
      const pv = previewTheme();
      for (const k2 of ['a', 'a2', 'soft', 'deep']) {
        if (!HEX.test(d.meta.theme[k2] ?? '')) d.meta.theme[k2] = pv?.[k2] ?? '#888888';
      }
      d.meta.theme[k] = ci.value;
      markDirty();
      previewStrip();
    };
    const hx = el('span', 'hx', d.meta.theme[k] || '（跟随预设/派生）');
    hx.dataset.role = `hx-${k}`;
    pf.append(ci, hx);
    palrow.appendChild(pf);
  }
  sec2.appendChild(palrow);
  // 实时预览条
  const strip = el('div', 'pv-prev');
  strip.id = 'pvStrip';
  strip.appendChild(el('span', '', '预览'));
  for (const k of ['a', 'a2', 'soft', 'deep']) {
    const bar = document.createElement('i');
    bar.style.background = pv?.[k] ?? '#888';
    bar.dataset.k = k;
    strip.appendChild(bar);
  }
  sec2.appendChild(strip);
  edit.appendChild(sec2);

  // 情绪词表
  const sec3 = el('div', 'sec');
  sec3.appendChild(el('h4', '', '情绪词表 moods（蒸馏 mood 枚举）'));
  const chips = el('div', 'chips');
  chips.id = 'moodChips';
  renderMoodChips(chips, d);
  const moodIn = document.createElement('input');
  moodIn.placeholder = '新情绪词，回车/点添加';
  moodIn.style.cssText = 'width:180px';
  moodIn.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addMood(d, moodIn.value, chips); } };
  const addM = el('button', 'btn sm', '添加');
  addM.type = 'button';
  addM.onclick = () => addMood(d, moodIn.value, chips);
  const moodRow = el('div');
  moodRow.style.cssText = 'display:flex;gap:8px;margin-top:10px';
  moodRow.append(moodIn, addM);
  sec3.append(chips, moodRow);
  edit.appendChild(sec3);

  // 特质
  const sec4 = el('div', 'sec');
  sec4.appendChild(el('h4', '', '特质 traits（0–1 滊块）'));
  const traits = el('div', 'traits');
  traits.id = 'traitRows';
  renderTraits(traits, d);
  const tAdd = el('button', 'btn sm ghost', '＋ 添加特质');
  tAdd.type = 'button';
  tAdd.style.marginTop = '8px';
  tAdd.onclick = () => { if (d.meta.traits.length < TRAITS_CAP) { d.meta.traits.push({ name: '', v: 0.5 }); markDirty(); renderTraits(traits, d); } };
  sec4.append(traits, tAdd);
  edit.appendChild(sec4);

  // mono/en/tagline
  const sec5 = el('div', 'sec');
  sec5.appendChild(el('h4', '', '头像 / 命名 meta{mono,en,tagline}'));
  const fr5 = el('div', 'frow');
  fr5.append(
    fld('mono 单字头像', inp(d.meta.mono, (v) => { d.meta.mono = v; markDirty(); }, '≤40 字，cortex 头像块')),
    fld('en 英文名', inp(d.meta.en, (v) => { d.meta.en = v; markDirty(); }, 'eyebrow 等')),
  );
  sec5.appendChild(fr5);
  sec5.appendChild(fld('tagline 一句话简介', inp(d.meta.tagline, (v) => { d.meta.tagline = v; markDirty(); })));
  edit.appendChild(sec5);

  // 人格内核
  const sec6 = el('div', 'sec');
  sec6.appendChild(el('h4', '', '人格内核 persona.md（text · ≤50000 字）'));
  const monoed = el('div', 'monoed');
  const ln = el('div', 'ln');
  ln.id = 'plines';
  const ta = document.createElement('textarea');
  ta.id = 'ptext'; ta.spellcheck = false;
  ta.maxLength = TEXT_CAP;
  ta.value = d.text;
  ta.oninput = () => {
    d.text = ta.value;
    markDirty();
    syncLines(ta, ln);
    document.querySelector('#ptextCnt').textContent = `${ta.value.length} 字`;
  };
  ta.onscroll = () => { ln.scrollTop = ta.scrollTop; };
  monoed.append(ln, ta);
  sec6.appendChild(monoed);
  const cnt = el('div', '', `${(d.text ?? '').length} 字`);
  cnt.id = 'ptextCnt';
  cnt.style.cssText = 'font:10px var(--mono);color:var(--ink3);margin-top:5px;text-align:right';
  sec6.appendChild(cnt);
  edit.appendChild(sec6);

  // 操作
  const sec7 = el('div', 'sec');
  sec7.appendChild(el('h4', '', '操作'));
  const btns = el('div', 'pbtns');
  const save = el('button', 'btn pri', isNew ? '创建并保存' : '保存');
  save.onclick = () => savePersona();
  const act = el('button', 'btn', '设为当前人设');
  act.disabled = isNew || d.id === activeId;
  act.onclick = () => activatePersona();
  const dup = el('button', 'btn ghost', '另存副本');
  dup.onclick = () => duplicatePersona();
  const imp = el('button', 'btn ghost', '从 .md 导入');
  imp.onclick = () => importMd();
  const exp = el('button', 'btn ghost', '导出 .md');
  exp.onclick = () => exportMd();
  const del = el('button', 'btn danger', '删除');
  del.disabled = isNew || d.id === activeId;
  del.onclick = () => deletePersona();
  btns.append(save, act, dup, imp, exp, del);
  sec7.appendChild(btns);
  edit.appendChild(sec7);

  grid.appendChild(edit);
  ROOT.appendChild(grid);

  const foot = el('div', 'pfoot');
  foot.appendChild(el('span', '', '人设 · meta 为纯展示字段不进 prompt · characterId 缺省=人设ID'));
  foot.appendChild(el('span', '', `${list.length} 个人设版本`));
  ROOT.appendChild(foot);

  requestAnimationFrame(() => {
    const ta2 = ROOT.querySelector('#ptext');
    if (ta2) syncLines(ta2, ROOT.querySelector('#plines'));
  });
}

function fld(labelText, control, hint) {
  const f = el('div', 'fld');
  f.appendChild(el('label', '', labelText));
  f.appendChild(control);
  if (hint) f.appendChild(el('div', 'hint', hint));
  return f;
}

function inp(value, onInput, placeholder) {
  const i = document.createElement('input');
  i.type = 'text';
  i.value = value ?? '';
  if (placeholder) i.placeholder = placeholder;
  i.oninput = () => onInput(i.value);
  return i;
}

function syncLines(ta, ln) {
  if (!ta || !ln) return;
  const n = ta.value.split('\n').length;
  ln.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  ln.scrollTop = ta.scrollTop;
}

function previewStrip() {
  const strip = ROOT?.querySelector('#pvStrip');
  if (!strip) return;
  const pv = previewTheme();
  for (const k of ['a', 'a2', 'soft', 'deep']) {
    const bar = strip.querySelector(`i[data-k="${k}"]`);
    if (bar && pv?.[k]) bar.style.background = pv[k];
  }
  // 配色输入框旁的 hex 显示同步
  for (const k of ['a', 'a2', 'soft', 'deep']) {
    const hx = ROOT.querySelector(`[data-role="hx-${k}"]`);
    if (hx) hx.textContent = PS.draft?.meta?.theme?.[k] || '（跟随预设/派生）';
  }
}

function renderMoodChips(host, d) {
  host.replaceChildren();
  if (!d.moods.length) {
    host.appendChild(el('span', '', '（空 = 使用全局九词表）'));
    host.lastChild.style.color = 'var(--ink3)';
    host.lastChild.style.fontSize = '12px';
    return;
  }
  d.moods.forEach((w, i) => {
    const chip = el('span', 'chip');
    const dot = document.createElement('i');
    const color = d.meta.moodColors[w] || hashFallback(w);
    dot.style.background = color;
    dot.title = '点击改色';
    const ci = document.createElement('input');
    ci.type = 'color';
    ci.value = HEX.test(color) ? color : '#888888';
    ci.style.cssText = 'position:absolute;width:0;height:0;opacity:0';
    dot.onclick = () => ci.click();
    ci.oninput = () => {
      d.meta.moodColors[w] = ci.value;
      dot.style.background = ci.value;
      markDirty();
    };
    chip.append(dot, ci, document.createTextNode(w));
    const del = el('button', '', '×');
    del.type = 'button';
    del.onclick = () => {
      d.moods.splice(i, 1);
      delete d.meta.moodColors[w];
      markDirty();
      renderMoodChips(host, d);
    };
    chip.appendChild(del);
    host.appendChild(chip);
  });
}

function hashFallback(word) {
  return hashColor(String(word ?? ''));
}

function addMood(d, word, host) {
  const w = String(word ?? '').trim();
  if (!w) return;
  if (d.moods.includes(w)) return;
  if (d.moods.length >= 12) { toast('情绪词最多 12 个', 2000); return; }
  d.moods.push(w);
  markDirty();
  renderMoodChips(host, d);
}

function renderTraits(host, d) {
  host.replaceChildren();
  if (!d.meta.traits.length) {
    host.appendChild(el('div', '', '（空）'));
    host.lastChild.style.cssText = 'color:var(--ink3);font-size:12px;padding:8px 0';
    return;
  }
  d.meta.traits.forEach((t, i) => {
    const row = el('div', 'tr');
    const name = document.createElement('input');
    name.type = 'text'; name.value = t.name ?? ''; name.placeholder = '特质名';
    name.oninput = () => { t.name = name.value; markDirty(); };
    const range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '1'; range.step = '0.05';
    range.value = String(t.v ?? 0.5);
    const vv = el('span', 'vv', Number(t.v ?? 0.5).toFixed(2));
    vv.dataset.tv = String(i);
    range.oninput = () => { t.v = Number(range.value); vv.textContent = Number(range.value).toFixed(2); markDirty(); };
    const xx = el('button', 'xx', '×');
    xx.type = 'button';
    xx.onclick = () => { d.meta.traits.splice(i, 1); markDirty(); renderTraits(host, d); };
    row.append(name, range, vv, xx);
    host.appendChild(row);
  });
}

// ── 动作 ──
function selectPersona(id) {
  if (id === PS.sel) return;
  if (PS.dirty && !window.confirm('人设编辑器有未保存修改，确定切换？')) return;
  PS.sel = id;
  const p = (CTX?.personas ?? store.personas?.personas ?? []).find((x) => x.id === id);
  PS.draft = draftFromPersona(p);
  PS.dirty = false;
  render();
}

function newPersona() {
  if (PS.dirty && !window.confirm('未保存的编辑会丢失，确认新建？')) return;
  PS.sel = '__new__';
  PS.draft = draftFromPersona(null);
  PS.dirty = false;
  render();
}

function duplicatePersona() {
  const d = PS.draft;
  if (!d) return;
  if (PS.dirty && !window.confirm('未保存的编辑会丢弃，以已保存版本为底建副本？')) return;
  const src = d.id ? (CTX?.personas ?? []).find((x) => x.id === d.id) : null;
  const base = src ? draftFromPersona(src) : d;
  PS.sel = '__new__';
  PS.draft = {
    isNew: true, id: '', name: `${base.name || '人设'} 副本`,
    characterId: base.characterId || '', text: base.text || '',
    moods: [...(base.moods ?? [])], meta: normMeta(base.meta),
  };
  PS.dirty = true;
  render();
  toast('副本草稿已建 · 保存后生效');
}

function importMd() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.md,.txt,text/markdown,text/plain';
  inp.onchange = async () => {
    const f = inp.files?.[0];
    if (!f) return;
    if (PS.dirty && !window.confirm('未保存的编辑会丢失，确认导入新草稿？')) return;
    const text = (await f.text()).trim();
    if (!text) { toast('文件为空', 2500); return; }
    PS.sel = '__new__';
    PS.draft = {
      isNew: true, id: '', name: f.name.replace(/\.[^.]+$/, ''), characterId: '',
      text, moods: [], meta: blankMeta(),
    };
    PS.dirty = true;
    render();
    toast(`已从「${f.name}」导入草稿 · ${text.length} 字`);
  };
  inp.click();
}

function exportMd() {
  const d = PS.draft;
  if (!d) return;
  const text = `# ${d.name || 'persona'}\n\n${d.text || ''}\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  a.download = `${(d.name || 'persona').replace(/[\\/:*?"<>|]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出 .md', 2000);
}

async function savePersona() {
  const d = PS.draft;
  if (!d) return;
  const name = (d.name ?? '').trim();
  const text = (d.text ?? '').trim();
  if (!name || !text) { toast('名称和内容不能为空', 2500); return; }
  const moods = (d.moods ?? []).map((m) => String(m).trim()).filter(Boolean).slice(0, 12);
  const meta = serializeMeta(d.meta);
  const characterId = (d.characterId ?? '').trim();
  try {
    let r;
    if (d.isNew || !d.id) {
      const before = new Set((CTX?.personas ?? store.personas?.personas ?? []).map((p) => p.id));
      r = await api.post('/personas', {
        name, text,
        characterId: characterId || undefined,
        moods,
        meta: meta ?? undefined,
      });
      PS.pendingNewFrom = before; // store 刷新后 ensureDraft 自动选中新条目
      toast('已创建', 2500);
    } else {
      r = await api.patch('/personas', {
        id: d.id, name, text,
        characterId: characterId || null,   // 空=清除回落人设ID
        moods,
        meta,                                // null=清除全部 meta
      });
      toast('已保存', 2500);
    }
    // 响应即全量 personas 负载：先落 store 再渲染，避免等下一轮轮询闪旧值
    if (r?.personas) {
      store.personas = { personas: r.personas, activeId: r.activeId ?? store.personas?.activeId };
      if (CTX) CTX.personas = r.personas;
    }
    PS.dirty = false;
    mutRefresh();
    render();
  } catch (e) {
    toast(`保存失败：${e instanceof Error ? e.message : e}`, 4000);
  }
}

async function activatePersona() {
  const d = PS.draft;
  if (!d?.id || d.isNew) return;
  const p = (CTX?.personas ?? []).find((x) => x.id === d.id);
  if (!(await confirmDialog({
    title: '设为当前人设',
    body: `启用「${p?.name || d.name}」？机器人之后的回复将使用这个人设。`,
    okText: '设为当前',
  }))) return;
  try {
    const r = await api.post('/personas/activate', { id: d.id });
    if (r?.personas) {
      store.personas = { personas: r.personas, activeId: r.activeId ?? d.id };
      if (CTX) { CTX.personas = r.personas; }
    }
    PS.dirty = false;
    toast(`已切换为「${p?.name || d.name}」`, 3000);
    mutRefresh();
    render();
  } catch (e) { toast(`切换失败：${e instanceof Error ? e.message : e}`); }
}

async function deletePersona() {
  const d = PS.draft;
  if (!d?.id || d.isNew) return;
  const p = (CTX?.personas ?? []).find((x) => x.id === d.id);
  if (d.id === store.personas?.activeId) { toast('当前人设不能删除', 2500); return; }
  if (!(await confirmDanger({
    title: '删除人设',
    body: `删除「${p?.name || d.name}」？不可恢复。其名下自我轨记忆将失去归属角色。`,
    okText: '删除',
  }))) return;
  try {
    const r = await api.del(`/personas?id=${encodeURIComponent(d.id)}`);
    if (r?.personas) {
      store.personas = { personas: r.personas, activeId: r.activeId ?? store.personas?.activeId };
      if (CTX) CTX.personas = r.personas;
    }
    PS.sel = null; PS.draft = null; PS.dirty = false;
    toast('已删除', 2500);
    mutRefresh();
    render();
  } catch (e) { toast(`删除失败：${e instanceof Error ? e.message : e}`); }
}

// ── 页对象 ──
const leaveGuard = () => {
  if (!PS.dirty) return true;
  return window.confirm('人设编辑器有未保存修改，确定离开？');
};

export const personasPage = {
  mount(root, ctx) {
    ROOT = root; CTX = ctx;
    cleanPause = pauseEditing(root);
    leaveGuards.add(leaveGuard);
    window.addEventListener('beforeunload', onBeforeUnload);
    render();
  },
  update(ctx) {
    CTX = ctx;
    // 有未保存修改时不重建编辑区（保住焦点/滚动/未提交输入）；保存后 store.refresh 自然刷新
    if (!PS.dirty) render();
  },
  unmount() {
    cleanPause?.(); cleanPause = null;
    leaveGuards.delete(leaveGuard);
    window.removeEventListener('beforeunload', onBeforeUnload);
    ROOT = null; CTX = null;
  },
};

function onBeforeUnload(e) {
  if (PS.dirty) { e.preventDefault(); e.returnValue = ''; }
}
