// #/map 视图：解析当前皮肤并挂载；store 数据刷新转发给皮肤 update()。
// vm 由 core/vm.js 提供（S3 接入）；当前为 null，皮肤需容忍。

import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { skinById } from '../skins/index.js';
import { characterOfId, resolveSkin, resolveTheme, getPref, SKIN_IDS } from '../core/theme.js';

const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** 皮肤可用的写操作：调 API 后触发 store.refresh()（皮肤自身不 fetch） */
export const mapActions = {
  patchNote: async (id, patch) => {
    await api.patch(`/notes/${encodeURIComponent(id)}`, patch);
    store.refresh();
  },
  deleteNote: async (id) => {
    await api.del(`/notes/${encodeURIComponent(id)}`);
    store.refresh();
  },
  reinforceNote: async (id) => {
    await api.post(`/notes/${encodeURIComponent(id)}/reinforce`);
    store.refresh();
  },
};

/** 当前查看人设 + 全部人设 → 主题对象（顶栏/皮肤共用） */
export function mapCtx() {
  const persona = store.viewPersona();
  const all = store.personas?.personas ?? [];
  const theme = resolveTheme(persona, all);
  const charId = characterOfId(persona?.id, all);
  const reduced = reducedMotion();
  const params = new URLSearchParams(location.search);
  return {
    vm: store.mapVM ?? null,
    persona,
    theme,
    charId,
    skinId: resolveSkin(charId),
    motion: {
      // still=静态终态（?still=1 / 系统减动效 / brain-motion 显式关）→ 皮肤强制关全部动效
      still: reduced || params.has('still') || getPref('motion') === false,
      // 未显式设置时跟随系统减动效偏好（与旧页 REDUCED 默认一致）
      signal: getPref('signal') ?? !reduced,
      particles: getPref('particles') ?? !reduced,
    },
    ops: store.ops,
    sessions: store.sessions,
    actions: mapActions,
  };
}

/** 已实现的皮肤（未上线的 id 回落 cortex；顶栏用它决定可点项） */
export function implementedSkin(ctx = mapCtx()) {
  return skinById(ctx.skinId) ?? skinById('cortex');
}

export function implementedSkinIds() {
  return SKIN_IDS.filter((id) => skinById(id));
}

export const mapView = {
  mount(el) {
    this._el = el;
    const ctx = mapCtx();
    const skin = implementedSkin(ctx);
    this._skin = skin;
    skin.mount(el, ctx);
    this._off = store.on((what) => {
      if (what === 'data' || what === 'paused' || what === 'editing') {
        skin.update?.(store.mapVM ?? null, mapCtx());
      }
    });
  },
  unmount() {
    this._off?.();
    this._off = null;
    this._skin?.unmount?.();
    this._skin = null;
  },
  highlight(ids) { this._skin?.highlight?.(ids); },
  select(id) { this._skin?.select?.(id); },
};
