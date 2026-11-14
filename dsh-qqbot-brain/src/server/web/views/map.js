// #/map 视图：解析当前皮肤并挂载；store 数据刷新转发给皮肤 update()。
// vm 由 core/vm.js 提供（S3 接入）；当前为 null，皮肤需容忍。

import { store } from '../core/store.js';
import { skinById } from '../skins/index.js';
import { characterOfId, resolveSkin, resolveTheme, getPref, SKIN_IDS } from '../core/theme.js';

/** 当前查看人设 + 全部人设 → 主题对象（顶栏/皮肤共用） */
export function mapCtx() {
  const persona = store.viewPersona();
  const all = store.personas?.personas ?? [];
  const theme = resolveTheme(persona, all);
  const charId = characterOfId(persona?.id, all);
  return {
    vm: store.mapVM ?? null,
    persona,
    theme,
    charId,
    skinId: resolveSkin(charId),
    motion: {
      still: getPref('motion') === false || new URLSearchParams(location.search).has('still'),
      signal: getPref('signal') !== false,
      particles: getPref('particles') !== false,
    },
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
