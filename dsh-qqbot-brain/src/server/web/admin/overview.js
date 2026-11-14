// 概览页：总览数字 / 分布 / 最近唤起 / 最近流水 / 立即巩固。
// 数据源：store.state（/api/state）+ store.ops —— 与脑图同一份轮询数据。

import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { el, toast, fmtT } from '../core/ui.js';
import { isSelfTrack, charName, openNoteInLib, KIND_LABEL, mutRefresh } from './common.js';

const num = (v) => (v ?? 0).toLocaleString('zh-CN');

function distRow(lb, val, max, cls = '') {
  const row = el('div', 'dr');
  row.appendChild(el('span', 'lb', lb));
  const b = el('span', 'b');
  const bar = document.createElement('i');
  bar.className = cls;
  bar.style.width = `${Math.max(1.5, (val / Math.max(max, 1)) * 100)}%`;
  b.appendChild(bar);
  row.appendChild(b);
  row.appendChild(el('em', '', String(val)));
  return row;
}

function rlistItem(text, small, onClick) {
  const li = el('li');
  li.appendChild(el('span', 't', text));
  li.appendChild(el('small', '', small));
  li.onclick = onClick;
  return li;
}

export const overviewPage = {
  mount(root, ctx) {
    this._root = root;
    this.render(ctx);
  },
  update(ctx) { this.render(ctx); },
  unmount() { this._root = null; },

  render(ctx) {
    const root = this._root;
    if (!root) return;
    const s = ctx.state;
    root.replaceChildren();
    if (!s) {
      root.appendChild(el('div', 'empty', store.error ? `加载失败：${store.error}` : '加载中…'));
      return;
    }
    const notes = s.notes ?? [];
    const total = notes.length;
    const avg = total ? notes.reduce((a, n) => a + (n.retention ?? 0), 0) / total : 0;
    const selfN = notes.filter(isSelfTrack).length;
    const fading = notes.filter((n) => n.fading).length;
    const stats = s.stats ?? {};
    const byKind = { episodic: 0, semantic: 0, attitude: 0 };
    const byTrack = { self: 0, world: 0 };
    for (const n of notes) {
      byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
      byTrack[isSelfTrack(n) ? 'self' : 'world'] += 1;
    }
    const maxK = Math.max(...Object.values(byKind), 1);
    const recentHits = [...notes].sort((a, b) => (b.lastAccessAt ?? 0) - (a.lastAccessAt ?? 0)).slice(0, 5);
    const recentOps = (ctx.ops ?? []).slice(0, 5);
    const charId = ctx.charId;

    // 页头
    const head = el('div', 'phead');
    head.appendChild(el('span', 'no', '01'));
    head.appendChild(el('h1', '', '概览'));
    const sub = el('div', 'sub');
    sub.append('数据源 GET /api/state', document.createElement('br'), '脑图总览与健康度');
    head.appendChild(sub);
    root.appendChild(head);

    // 总览数字
    const mod1 = el('section', 'mod');
    const mh1 = el('div', 'mh');
    mh1.appendChild(el('span', 'no', 'OV-01'), el('span', '', '总览数字'), el('em', '', '15s 轮询 · 编辑态跳过'));
    mod1.appendChild(mh1);
    const nums = el('div', 'nums');
    const mkNum = (a, b, c, html = false) => {
      const d = el('div');
      const bb = el('b');
      if (html) bb.innerHTML = a; else bb.textContent = a;
      if (b) bb.appendChild(el('small', '', b));
      d.appendChild(bb);
      d.appendChild(el('span', '', c));
      return d;
    };
    nums.append(
      mkNum(num(total), '', '条记忆'),
      mkNum(`${Math.round(avg * 100)}`, '%', '平均保持率'),
      mkNum(`${selfN}`, `/${byTrack.world}`, '自我轨 / 世界轨'),
      mkNum(String(fading), '', '条将遗忘'),
    );
    mod1.appendChild(nums);
    root.appendChild(mod1);

    // 分布 + 最近唤起
    const cols = el('div', 'cols2');
    const mod2 = el('section', 'mod');
    const mh2 = el('div', 'mh');
    mh2.appendChild(el('span', 'no', 'OV-02'), el('span', '', '分布'), el('em', '', '按类型 / 轨道'));
    mod2.appendChild(mh2);
    const dist = el('div', 'dist');
    for (const k of ['episodic', 'semantic', 'attitude']) dist.appendChild(distRow(KIND_LABEL[k] ?? k, byKind[k] ?? 0, maxK));
    mod2.appendChild(dist);
    const dist2 = el('div', 'dist');
    dist2.style.marginTop = '22px';
    dist2.appendChild(distRow(`自我轨 · ${charName(charId, ctx.personas)}`, byTrack.self, total, 'self'));
    dist2.appendChild(distRow('世界轨 · 共享', byTrack.world, total));
    mod2.appendChild(dist2);
    cols.appendChild(mod2);

    const mod3 = el('section', 'mod');
    const mh3 = el('div', 'mh');
    mh3.appendChild(el('span', 'no', 'OV-03'), el('span', '', '最近被唤起'), el('em', '', '按 lastAccessAt'));
    mod3.appendChild(mh3);
    const rl = el('ul', 'rlist');
    for (const n of recentHits) {
      rl.appendChild(rlistItem(n.content ?? '', fmtT(n.lastAccessAt), () => {
        openNoteInLib(n.id);
        navigate('#/admin/memories');
      }));
    }
    if (!recentHits.length) rl.appendChild(el('li', '', '暂无记忆'));
    mod3.appendChild(rl);
    cols.appendChild(mod3);
    root.appendChild(cols);

    // 最近流水
    const mod4 = el('section', 'mod');
    const mh4 = el('div', 'mh');
    mh4.appendChild(el('span', 'no', 'OV-04'), el('span', '', '最近流水'), el('em', '', '最新 5 条 · 点击去流水页'));
    mod4.appendChild(mh4);
    const rl2 = el('ul', 'rlist');
    for (const o of recentOps) {
      const li = rlistItem(opsSummary(o).slice(0, 60), fmtT(o.t), () => navigate('#/admin/ops'));
      rl2.appendChild(li);
    }
    if (!recentOps.length) rl2.appendChild(el('li', '', '暂无流水'));
    mod4.appendChild(rl2);
    const btns = el('div');
    btns.style.cssText = 'margin-top:14px;display:flex;gap:10px';
    const goOps = el('button', 'btn sm', '查看全部流水 →');
    goOps.type = 'button';
    goOps.onclick = () => navigate('#/admin/ops');
    const consol = el('button', 'btn sm ghost', '立即巩固');
    consol.type = 'button';
    consol.onclick = async () => {
      try {
        const r = await api.post('/consolidate');
        toast(`巩固完成：${r.sessions ?? 0} 会话 → ${r.semanticNotes ?? 0} 条语义`, 4000);
        mutRefresh();
      } catch (e) {
        toast(`巩固失败：${e instanceof Error ? e.message : e}`);
      }
    };
    btns.append(goOps, consol);
    mod4.appendChild(btns);
    root.appendChild(mod4);

    const foot = el('div', 'pfoot');
    foot.appendChild(el('span', '', `数据快照 · 记忆 ${stats.total ?? total} · 会话 ${stats.sessions ?? '—'} · 近重复对 ${stats.nearDup ?? 0}`));
    foot.appendChild(el('span', '', '编辑态自动刷新暂停 · 写操作走既有 op 可重放'));
    root.appendChild(foot);
  },
};

/** 流水摘要（overview 借用；ops.js 有完整版） */
export function opsSummary(o) {
  const op = o?.op ?? {};
  const name = op.op ?? '';
  const label = {
    add: '写入记忆', reinforce: '唤起强化', update: '修改记忆', del: '删除记忆',
    merge: '合并记忆', absorb: '巩固吸收', emotion: '情绪更新', profile: '画像更新',
    persona: '人设变更', 'persona-save': '人设保存', 'persona-activate': '人设激活',
    'persona-delete': '人设删除', reset: '记忆重置', 'del-range': '按时段删除',
    'del-persona': '按人设删除', 'sess-domain': '会话域变更', embed: '补向量',
    digest: '摘要更新', 'intent-add': '意图新增', 'intent-update': '意图更新',
    'intent-fire': '意图触发', 'intent-del': '意图删除',
  }[name] ?? name;
  const extra = op.content ?? op.name ?? op.key ?? op.id ?? '';
  return extra ? `${label} · ${String(extra).slice(0, 30)}` : label;
}
