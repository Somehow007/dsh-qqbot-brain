// 管理端共享助手：上下文 / 记忆字段口径 / 分页器 / 编辑暂停 / 跨页跳转。
// 记忆字段口径与 B2 GET /api/notes items（= graph() 投影）一致。

import { store } from '../core/store.js';
import { characterOfId } from '../core/theme.js';
import { noteChar, shortId } from '../core/vm.js';
import { el, toast, confirmDialog, fmtT } from '../core/ui.js';
import { skinById } from '../skins/index.js';
import { implementedSkin, mapCtx } from '../views/map.js';

/** 管理端上下文：在 mapCtx 基础上补 skin 对象 / personas 列表 / state / profiles */
export function adminCtx() {
  const m = mapCtx();
  return {
    ...m,
    skin: implementedSkin(m),
    state: store.state,
    personas: store.personas?.personas ?? [],
    profiles: store.profiles ?? [],
    sessions: store.sessions ?? [],
  };
}

/** 把皮肤 token + 当前人设 accent 写到容器元素上（管理端配色跟随皮肤+人设） */
export function applyTokens(root, ctx) {
  const vars = { ...(ctx?.skin?.tokens ?? {}) };
  if (ctx?.theme?.a) vars['--accent'] = ctx.theme.a;
  if (ctx?.theme?.a2) vars['--accent2'] = ctx.theme.a2;
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === 'string' && v) root.style.setProperty(k, v);
  }
}

// ── 记忆字段口径 ──
export const isSelfTrack = (n) => !!n && (n.kind === 'attitude' || n.self === true);

export function charOfNote(n, personas) {
  return noteChar(n ?? {}, personas ?? []) || '';
}

export function charName(cid, personas) {
  const list = personas ?? store.personas?.personas ?? [];
  const p = list.find((x) => x.characterId === cid);
  return p?.name || cid || '—';
}

export function charColor(cid, personas) {
  const list = personas ?? store.personas?.personas ?? [];
  return list.find((x) => x.characterId === cid)?.meta?.theme?.a || 'var(--accent)';
}

export function sessIdOf(s) { return s?.sessionId ?? s?.id ?? ''; }
/** 会话显示名：sess 画像绑定昵称 > 短 sessionId（sessions[] 无 label 字段） */
export function sessLabel(sid, sessions) {
  const list = sessions ?? store.sessions ?? [];
  const s = list.find((x) => sessIdOf(x) === sid);
  return s?.profileName || (sid ? shortId(sid) : '—');
}
export function sessById(sid, sessions) {
  const list = sessions ?? store.sessions ?? [];
  return list.find((x) => sessIdOf(x) === sid) ?? null;
}
/** 会话的私域标记（sessionDomains 的等价物：sessions[] 带 domain 字段） */
export function sessDomain(sid, sessions) {
  return sessById(sid, sessions)?.domain || '';
}

/** 有效可见域文案：scope=private ?? 会话域；'public'/空=公开 */
export function scopeText(n) {
  const sc = n?.scope;
  if (!sc || sc === 'public') return '公开';
  if (sc === n?.sessionId) return '仅本会话';
  return `私域·${sc}`;
}

export const KIND_LABEL = { episodic: '情景', semantic: '语义', attitude: '态度' };
export const TRACK_LABEL = { world: '世界轨', self: '自我轨' };

// ── 分页器（DOM 构造，windowed 页码）──
export function pager(parent, { total, page, size, onPage }) {
  parent.replaceChildren();
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(Math.max(1, page), pages);
  const bar = el('div', 'pagerbar');
  const mk = (label, p, cls = '', disabled = false) => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.disabled = disabled;
    if (!disabled) b.onclick = () => onPage(p);
    return b;
  };
  bar.append(mk('首页', 1, '', cur <= 1), mk('上一页', cur - 1, '', cur <= 1));
  const win = new Set([1, pages, cur - 1, cur, cur + 1]);
  let prev = 0;
  for (let i = 1; i <= pages; i++) {
    if (!win.has(i)) continue;
    if (i - prev > 1) { const gap = el('button', '', '…'); gap.disabled = true; bar.appendChild(gap); }
    bar.appendChild(mk(String(i), i, i === cur ? 'on' : ''));
    prev = i;
  }
  bar.append(mk('下一页', cur + 1, '', cur >= pages), mk('末页', pages, '', cur >= pages));
  const from = total ? (cur - 1) * size + 1 : 0;
  const to = Math.min(total, cur * size);
  bar.appendChild(el('span', 'cnt', `第 ${from}–${to} 条，共 ${total} 条`));
  parent.appendChild(bar);
}

// ── 编辑暂停：root 内焦点进出 → store.beginEdit/endEdit（计数配平）──
export function pauseEditing(root) {
  let inside = false;
  const onIn = () => { if (!inside) { inside = true; store.beginEdit(); } };
  const onOut = (e) => {
    if (inside && !(e.relatedTarget instanceof Node && root.contains(e.relatedTarget))) {
      inside = false; store.endEdit();
    }
  };
  root.addEventListener('focusin', onIn);
  root.addEventListener('focusout', onOut);
  return () => {
    if (inside) { inside = false; store.endEdit(); }
    root.removeEventListener('focusin', onIn);
    root.removeEventListener('focusout', onOut);
  };
}

/** 危险确认（统一走 ui.confirmDialog；expect=需输入的确认词） */
export function confirmDanger({ title, body, okText = '确认', expect = '' } = {}) {
  return confirmDialog({ title, body, okText, danger: true, expect });
}

/**
 * 写操作后刷新全局 store：先 blur 当前焦点元素。
 * pauseEditing 会把「按钮焦点」也算作编辑中（editing>0 → store.refresh 静默跳过），
 * 不 blur 的话保存/删除后全局 state 要等下个 15s 轮询才更新。
 */
export function mutRefresh() {
  try { document.activeElement?.blur?.(); } catch { /* noop */ }
  store.refresh();
}

export { toast, confirmDialog, el, fmtT };
export { characterOfId };

// ── 跨页跳转：记忆库定位 ──
// memories 页 mount 时注册 focusNote；其他页设 pending.noteId 后 navigate('#/admin/memories')
export const pending = { noteId: null };
export const libHooks = { focusNote: null };

export function openNoteInLib(id) {
  pending.noteId = id || null;
  if (libHooks.focusNote) libHooks.focusNote(id);
}

// ── 未保存离开保护：页面 mount 注册 guard()（返回 false=阻止跳转），unmount 移除 ──
// shell 导航 / 顶栏跳转前调用 runLeaveGuards()；guard 内用同步 confirm（守卫须同步）
export const leaveGuards = new Set();
export function runLeaveGuards() {
  for (const g of leaveGuards) {
    try { if (g() === false) return false; } catch { /* 单个守卫异常不阻塞 */ }
  }
  return true;
}
