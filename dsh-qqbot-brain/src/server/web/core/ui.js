// 轻量 UI 原语：toast / confirm（可要求输入确认词）/ 抽屉 / 通用元素助手。
// 全部 textContent 渲染，API 文本不走 innerHTML。

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function esc(s) { return String(s ?? ''); }

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期 */
export function fmtT(t, now = Date.now()) {
  if (!t) return '—';
  const d = now - t;
  if (d < 60e3) return '刚刚';
  if (d < 3600e3) return `${Math.floor(d / 60e3)} 分钟前`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)} 小时前`;
  if (d < 7 * 86400e3) return `${Math.floor(d / 86400e3)} 天前`;
  const dt = new Date(t);
  return `${dt.getMonth() + 1}-${dt.getDate()}`;
}

export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.hidden = true; }, ms);
}

/**
 * 确认弹窗。opts.expect 非空时要求输入该词才可确认（危险操作）。
 * @returns Promise<boolean>
 */
export function confirmDialog({ title = '确认', body = '', okText = '确认', danger = false, expect = '' } = {}) {
  return new Promise((resolve) => {
    const m = document.getElementById('modal');
    if (!m) { resolve(window.confirm(`${title}\n${body}`)); return; }
    m.hidden = false;
    m.replaceChildren();
    const card = el('div', 'modal-card');
    card.appendChild(el('h3', '', title));
    if (body) card.appendChild(el('p', 'modal-body', body));
    let input = null;
    if (expect) {
      input = el('input', 'modal-input');
      input.placeholder = `输入「${expect}」确认`;
      card.appendChild(input);
    }
    const bar = el('div', 'modal-bar');
    const cancel = el('button', 'btn ghost', '取消');
    const ok = el('button', `btn ${danger ? 'danger' : 'primary'}`, okText);
    const done = (v) => { m.hidden = true; m.replaceChildren(); resolve(v); };
    cancel.onclick = () => done(false);
    ok.onclick = () => {
      if (expect && input.value.trim() !== expect) { input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return; }
      done(true);
    };
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
    bar.append(cancel, ok);
    card.appendChild(bar);
    m.appendChild(card);
    cancel.focus();
  });
}

/** 简单抽屉：open(el) / close()；点遮罩关闭 */
export const drawer = {
  open(node) {
    const d = document.getElementById('drawer');
    if (!d) return;
    d.replaceChildren(node);
    d.hidden = false;
    d.onclick = (e) => { if (e.target === d) this.close(); };
  },
  close() {
    const d = document.getElementById('drawer');
    if (d) { d.hidden = true; d.replaceChildren(); }
  },
  get isOpen() { const d = document.getElementById('drawer'); return !!d && !d.hidden; },
};

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
