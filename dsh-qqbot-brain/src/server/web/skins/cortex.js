// 鲸脑皮层（cortex）皮肤 —— S2 占位实现。
// S4 将从 src/server/page.html 迁移：SVG 脑图、脑区、节点/边、检视器、信号动画等。
// 这里只验证皮肤接口与壳层联通，视觉以 S4 为准。

import { el } from '../core/ui.js';

export default {
  id: 'cortex',
  label: '鲸脑',

  mount(root, ctx) {
    this._root = root;
    this._ctx = ctx;
    root.replaceChildren();
    const wrap = el('div', 'skin-cortex');
    const ph = el('div', 'cx-placeholder');
    ph.textContent = `鲸脑皮层迁移中 · ${ctx?.theme?.name || ctx?.persona?.name || '…'}`;
    wrap.appendChild(ph);
    root.appendChild(wrap);
  },

  update(vm, ctx) { this._ctx = ctx ?? this._ctx; },
  highlight(ids) { /* S4 */ },
  select(id) { /* S4 */ },

  unmount() {
    this._root?.replaceChildren();
    this._root = null;
  },
};
