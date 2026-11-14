// 皮肤注册表。皮肤契约：
// {
//   id, label,
//   mount(el, ctx)    // ctx={vm,persona,theme,motion,params}
//   update(vm, ctx)   // store 'data' 刷新时调用
//   highlight(ids)    // 搜索命中 → 高亮节点（数组或 null 清除）
//   select(id)        // 面板选中一条记忆（id 或 null 关）
//   unmount()
// }
// vm 结构见 core/vm.js buildMapVM()；theme 见 core/theme.js resolveTheme()。

import cortex from './cortex.js';
import nocturne from './nocturne.js';

export const SKINS = [
  cortex,
  nocturne,
  // P2：dossier（墨刊）
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) ?? null;
}
