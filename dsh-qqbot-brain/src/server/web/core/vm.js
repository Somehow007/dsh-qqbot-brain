// 视图模型：API 原始数据 → 皮肤共用 MapVM（纯函数，零 DOM，node 可测）。
// helper 自 src/server/page.html 迁入（旧页保留自身副本至 P4），口径不变。

import { characterOfId, DEFAULT_MOODS } from './theme.js';

// ── 基础常量与文本 helper ──
export const KIND = { episodic: '情景', semantic: '语义', attitude: '态度' };
export const KIND_GLYPH = { episodic: '忆', semantic: '知', attitude: '态' };
export const kindLabel = (k) => KIND[k] ?? '情景';
export const kindGlyph = (k) => KIND_GLYPH[k] ?? '忆';

export const ngrams = (s) => {
  s = String(s ?? '').replace(/\s/g, '');
  const o = [];
  for (const n of [2, 3]) for (let i = 0; i <= s.length - n; i++) o.push(s.slice(i, i + n));
  return o;
};
export const cleanText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const shortId = (s) => String(s ?? '').slice(0, 8);

// 私域徽标：scope=生效域（派生或手动覆盖）；'public'=强制公开放行；=sessionId=原地私密
export const scopeBadge = (n) => {
  const s = n.scope;
  if (!s) return null;
  if (s === 'public') return { t: '已放行', tip: '手动覆盖：强制公开，任何会话可见' };
  if (s === n.sessionId) return { t: '仅本会话', tip: '原地私密：仅本会话可见' };
  return { t: `私域·${s}`, tip: `私域「${s}」：仅同域会话可见${n.private ? '（手动覆盖）' : ''}` };
};

// ── 标签：公共前缀剥离取区分段 ──
export function distinctStart(note, notes) {
  const text = cleanText(note.content);
  const shared = Math.max(0, ...notes.filter((n) => n.id !== note.id).map((n) => {
    const other = cleanText(n.content); let i = 0;
    while (i < text.length && text[i] === other[i]) i++;
    return i;
  }));
  return shared < 8 ? 0 : Math.min(Math.max(0, shared - 2), Math.max(0, text.length - 11));
}
export function nodeLabel(note, notes, len = 11) {
  const text = cleanText(note.content), start = distinctStart(note, notes);
  const part = Array.from(text.slice(start)).slice(0, len).join('');
  return (start ? '…' : '') + part + (text.length > start + part.length ? '…' : '');
}
// 节点短标签：去掉「用户」这类公共主语，留 6 个可区分的字
export function mapLabel(note, notes) {
  const strip = (s) => String(s ?? '').replace(/^\s*(用户|对方|他|她)/, '');
  return nodeLabel({ id: note.id, content: strip(note.content) },
    notes.map((n) => ({ id: n.id, content: strip(n.content) })), 6);
}
export function previewText(note, notes, start = distinctStart(note, notes)) {
  const text = cleanText(note.content);
  return start >= 24 ? text.slice(0, 12) + ' … ' + text.slice(start) : text;
}

// ── 记忆关系：后端语义边为骨架；ngram/同会话/同发言人作本地附加理由；无后端边回退纯 ngram ──
export const REL_LABEL = { derived: '沉淀巩固', semantic: '语义相似', topic: '相似话题', session: '同一会话', actor: '同一发言人' };
export const REL_ORDER = ['derived', 'semantic', 'topic', 'session', 'actor'];
export function buildRelations(notes, edges) {
  const map = new Map(), byId = new Set(notes.map((n) => n.id));
  const put = (a, b, reason, w, cos) => {
    const k = a < b ? a + '|' + b : b + '|' + a;
    let r = map.get(k);
    if (!r) { r = { a, b, reasons: [], score: 0, cos: 0, primary: reason }; map.set(k, r); }
    if (!r.reasons.includes(reason)) r.reasons.push(reason);
    r.score += w; if (cos) r.cos = cos;
    r.primary = r.reasons.reduce((x, y) => REL_ORDER.indexOf(x) <= REL_ORDER.indexOf(y) ? x : y);
  };
  (edges || []).forEach((e) => {
    if (e.kind === 'semantic' && byId.has(e.a) && byId.has(e.b)) put(e.a, e.b, 'semantic', Math.round(e.score * 20), e.score);
    if (e.kind === 'derived' && byId.has(e.a) && byId.has(e.b)) put(e.a, e.b, 'derived', 22);
  });
  const grams = notes.map((n) => new Set(ngrams(n.content)));
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i], b = notes[j];
    let c = 0; for (const x of grams[j]) if (grams[i].has(x)) c++;
    if (c >= 3) put(a.id, b.id, 'topic', Math.min(c, 12));
    if (a.sessionId === b.sessionId) put(a.id, b.id, 'session', 2);
    if (a.actor && a.actor === b.actor) put(a.id, b.id, 'actor', 2);
  }
  return [...map.values()].sort((x, y) => y.score - x.score);
}
export function relationWhy(rel, other) {
  return rel.reasons.map((t) => {
    if (t === 'actor' && other.actor) return `同一发言人 ${other.actor}`;
    if (t === 'semantic' && rel.cos) return `语义相似 ${Math.round(rel.cos * 100)}%`;
    if (t === 'derived') return other.kind === 'semantic' ? '沉淀为这条语义记忆' : '巩固自这条情景记忆';
    return REL_LABEL[t];
  }).join(' · ');
}

// ── 情绪：mood 类别优先（与人设词表同名），无 mood 老数据回退 PAD；记忆取同会话形成后 10 分钟内最近一次 ──
export const EMO_BUCKETS = [
  { id: 'emo:calm', name: '平静', color: '#5fdcc8' }, { id: 'emo:joy', name: '开心', color: '#ffc95c' },
  { id: 'emo:hyped', name: '兴奋', color: '#ff9d3c' }, { id: 'emo:shy', name: '害羞', color: '#ff9ecf' },
  { id: 'emo:curious', name: '好奇', color: '#6cb8ff' }, { id: 'emo:pout', name: '委屈', color: '#a991ff' },
  { id: 'emo:huff', name: '炸毛', color: '#ff6f86' }, { id: 'emo:grudge', name: '记仇', color: '#c66bd0' },
  { id: 'emo:sad', name: '难过', color: '#7a8fb8' },
];
export const EMO_BY_ID = Object.fromEntries(EMO_BUCKETS.map((e) => [e.id, e]));
export const EMO_BY_NAME = Object.fromEntries(EMO_BUCKETS.map((e) => [e.name, e.id]));
export const EMO_NAME = Object.fromEntries(EMO_BUCKETS.map((e) => [e.id, e.name]));
const EMO_WINDOW = 10 * 60e3;

export function emotionBucket(s) {
  if (s && s.mood && EMO_BY_NAME[s.mood]) return EMO_BY_NAME[s.mood];
  const v = +(s && s.v) || 0, a = +(s && s.a) || 0;
  if (v >= .25) return a >= .5 ? 'emo:joy' : 'emo:calm';
  if (v <= -.25) return a >= .5 ? 'emo:huff' : 'emo:pout';
  return a >= .5 ? 'emo:curious' : 'emo:calm';
}
export function emotionOps(ops) {
  return (ops || []).filter((o) => o && o.op && o.op.op === 'emotion' && o.op.state)
    .map((o) => ({ t: o.t, sessionId: o.op.sessionId, state: o.op.state }));
}
function emotionEntry(note, emos) {
  let best = null;
  for (const e of emos) {
    if (e.sessionId !== note.sessionId) continue;
    const dt = e.t - note.createdAt;
    if (dt < -5e3 || dt > EMO_WINDOW) continue;
    if (!best || Math.abs(dt) < Math.abs(best.t - note.createdAt)) best = e;
  }
  return best;
}
export function matchEmotion(note, emos) {
  const best = emotionEntry(note, emos);
  return best ? { bucket: emotionBucket(best.state), label: best.state.label || '', t: best.t } : null;
}

// ── 人格层：人设按「## 小节」拆特质；记忆与小节靠区分性双字词连线 ──
export const FACET_MIN = 2;
export function personaFacets(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const parts = t.split(/^##\s+/m).slice(1);
  if (!parts.length) return [{ id: 'facet:0', title: '人格内核', heading: '人格内核', body: t }];
  return parts.slice(0, 6).map((p, i) => {
    const nl = p.indexOf('\n'), heading = (nl < 0 ? p : p.slice(0, nl)).trim();
    const title = Array.from(heading.split(/[：:（(，,]/)[0].trim()).slice(0, 8).join('') || `特质 ${i + 1}`;
    return { id: 'facet:' + i, title, heading, body: (nl < 0 ? '' : p.slice(nl + 1)).trim() };
  });
}
export function matchFacet(note, facets) {
  if (!facets.length) return null;
  const bi = (s) => new Set(ngrams(String(s)).filter((g) => g.length === 2 && /^[\p{L}\p{N}]{2}$/u.test(g)));
  const fg = facets.map((f) => bi(f.heading + f.body)), df = new Map();
  fg.forEach((s) => s.forEach((g) => df.set(g, (df.get(g) || 0) + 1)));
  const lim = facets.length > 2 ? Math.ceil(facets.length / 2) : facets.length + 1;
  let best = null;
  const mine = bi(note.content);
  fg.forEach((s, i) => {
    const words = [...mine].filter((g) => s.has(g) && df.get(g) < lim);
    if (words.length >= FACET_MIN && (!best || words.length > best.score)) best = { facet: facets[i].id, score: words.length, words: words.slice(0, 3) };
  });
  return best;
}

// ── 布局/选取 helper ──
export function layoutSlots(zone, n, box, inside, taken) {
  const cand = [];
  for (let y = zone.cy - zone.ry; y <= zone.cy + zone.ry; y += 8) for (let x = zone.cx - zone.rx; x <= zone.cx + zone.rx; x += 8) {
    const dx = (x - zone.cx) / zone.rx, dy = (y - zone.cy) / zone.ry, d = dx * dx + dy * dy;
    if (d <= 1) cand.push([x, y, d]);
  }
  cand.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const out = [];
  for (const [x, y] of cand) {
    if (out.length >= n) break;
    const b = box(x, y);
    if (!inside(b[0], b[1]) || !inside(b[2], b[1]) || !inside(b[0], b[3]) || !inside(b[2], b[3])) continue;
    if (taken.some((t) => b[0] < t[2] + 6 && b[2] + 6 > t[0] && b[1] < t[3] + 4 && b[3] + 4 > t[1])) continue;
    taken.push(b); out.push({ x, y });
  }
  return out;
}
// 常驻标签：保持率×重要度前 n 条（同分按 id 定序），每 kind 先保底 per 条；其余按需显现
export function labelPick(items, n, per = 0) {
  const ranked = [...items].sort((a, b) => b.retention * b.importance - a.retention * a.importance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out = new Set(), seen = new Map();
  for (const x of ranked) { if (out.size >= n) break; const c = seen.get(x.kind) || 0; if (c < per) { out.add(x.id); seen.set(x.kind, c + 1); } }
  for (const x of ranked) { if (out.size >= n) break; out.add(x.id); }
  return out;
}
// ── LOD 截断：三类 kind 按比例分配名额（同 d-admin 关联图口径），优先级 importance×retention ──
/**
 * items 超过 cap 时按 kind 分组比例截断；每类保底 floorN=min(6,⌊cap/kinds⌋)。
 * @param items [{id,kind,importance|imp,retention|ret,...}] 任意携带记忆字段的对象
 * @param cap   总名额
 * @returns 截断后的数组（score 降序、id 定序，确定性输出）
 */
export function quotaPick(items, cap) {
  const list = [...items];
  if (list.length <= cap) return list;
  const groups = new Map();
  for (const it of list) {
    const k = it.kind ?? 'episodic';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const ks = [...groups.keys()];
  const score = (n) => (n.importance ?? n.imp ?? 0) * (n.retention ?? n.ret ?? 0);
  const tie = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  ks.forEach((k) => groups.get(k).sort((a, b) => score(b) - score(a) || tie(a, b)));
  const alloc = Object.fromEntries(ks.map((k) => [k, 0]));
  const floorN = Math.min(6, Math.floor(cap / ks.length));
  const totLen = ks.reduce((s, k) => s + groups.get(k).length, 0);
  ks.forEach((k) => {
    alloc[k] = Math.max(Math.min(groups.get(k).length, floorN), Math.round(cap * groups.get(k).length / totLen));
  });
  let sum = ks.reduce((s, k) => s + alloc[k], 0);
  const minAlloc = (k) => Math.min(groups.get(k).length, floorN);
  while (sum > cap) {
    const k = ks.filter((x) => alloc[x] > minAlloc(x))
      .sort((a, b) => (alloc[b] / groups.get(b).length) - (alloc[a] / groups.get(a).length))[0];
    if (!k) break;
    alloc[k]--; sum--;
  }
  while (sum < cap) {
    const k = ks.filter((x) => alloc[x] < groups.get(x).length)
      .sort((a, b) => (alloc[a] / groups.get(a).length) - (alloc[b] / groups.get(b).length))[0];
    if (!k) break;
    alloc[k]++; sum++;
  }
  return ks.flatMap((k) => groups.get(k).slice(0, alloc[k]))
    .sort((a, b) => score(b) - score(a) || tie(a, b));
}

export function companionLine(kind, count, name) {
  if (kind === 'facet') return `「${name}」？哼，那是写在我骨子里的。${count ? `有 ${count} 段记忆在替它作证。` : '暂时还没有记忆跟它对上号。'}`;
  if (kind === 'emotion') return count ? `${name}的时候留下了 ${count} 段记忆……不、不准乱翻！` : `最近没在「${name}」的时候留下记忆。`;
  if (kind === 'memory') {
    if (!count) return '这条记忆孤零零的，暂时没看出和谁有关。';
    if (count === 1) return '它只有 1 个邻居，点过去就能顺着游。';
    return `它连着 ${count} 个地方，信号已经替你游过去了。`;
  }
  return '……才不是在等你来看我的脑子呢。点一个神经元，带你逛。';
}

// ── 归属/轨道（与服务端 characterOf 同口径；personas 为人设条目数组）──
export const PRE_TAG_PERSONA_ID = 'whale-gentle';
export function notePid(n) { return n.personaId || PRE_TAG_PERSONA_ID; }
export const isSelfTrack = (n) => n.kind === 'attitude' || n.self === true;
export function noteChar(n, personas = []) {
  const pid = notePid(n);
  const p = personas.find((x) => x.id === pid);
  const fb = characterOfId(pid, personas); // characterId 优先 + whale 系回落，等价旧 fb 逻辑
  return p ? (p.characterId?.trim() || fb) : fb;
}

// ── 身份：actor「昵称 (openid)」拆分（与 src/brain/identity.ts 同口径）──
const ACTOR_TAIL_RE = /^(.*?)\s*\(([0-9A-Fa-f-]{8,64})\)\s*$/;
export function splitActor(actor) {
  const m = String(actor ?? '').match(ACTOR_TAIL_RE);
  return { nick: (m?.[1] ?? String(actor ?? '')).trim(), openid: m?.[2] };
}

const DAY_MS = 86400e3;
const sameLocalDay = (a, b) => {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
};

/**
 * 构建 MapVM。
 * @param state   /api/state
 * @param ops     /api/ops?limit=500（new→old）
 * @param personas /api/personas 响应 {activeId,personas} 或数组
 * @param profiles /api/profiles 响应 {profiles} 或数组
 * @param viewPersonaId 查看人设 id（纯前端视角）
 * @param now     当前时间戳（测试可注入）
 * @param sessions /api/sessions 响应 {sessions} 或数组（sess 显示名用，可省）
 */
export function buildMapVM(state, ops, personas, profiles, viewPersonaId, now = Date.now(), sessions = []) {
  const rawNotes = state?.notes ?? [];
  const plist = Array.isArray(personas) ? personas : (personas?.personas ?? []);
  const activeId = Array.isArray(personas) ? '' : (personas?.activeId ?? '');
  const viewEntry = plist.find((p) => p.id === viewPersonaId)
    ?? plist.find((p) => p.id === activeId) ?? plist[0] ?? null;
  const viewChar = characterOfId(viewEntry?.id ?? viewPersonaId, plist);
  const moodWords = Array.isArray(viewEntry?.moods) && viewEntry.moods.length ? viewEntry.moods : [...DEFAULT_MOODS];
  // PAD 推断产出的是全局九词；人设自定义词表时无 mood 数据不硬猜（诚实 null）
  const defaultScale = moodWords.length === DEFAULT_MOODS.length && DEFAULT_MOODS.every((w) => moodWords.includes(w));

  const emos = emotionOps(ops);
  const sessMap = new Map();
  for (const s of (Array.isArray(sessions) ? sessions : (sessions?.sessions ?? []))) {
    if (s?.sessionId) sessMap.set(s.sessionId, s);
  }
  const profByOpenid = new Map();
  const sessProfName = new Map();
  for (const p of (Array.isArray(profiles) ? profiles : (profiles?.profiles ?? []))) {
    if (p?.openid && p?.name) profByOpenid.set(p.openid, p.name);
    if (p?.kind === 'session' && typeof p.key === 'string' && p.key.startsWith('sess:') && p.name) {
      sessProfName.set(p.key.slice(5), p.name);
    }
  }
  const sessName = (sessionId) => {
    if (!sessionId || sessionId === 'manual') return '全局';
    const s = sessMap.get(sessionId);
    if (s?.domain) return `私域·${s.domain}`;
    if (s?.profileName) return s.profileName;
    return shortId(sessionId);
  };
  const whoOf = (n) => {
    const a = typeof n.actor === 'string' ? n.actor.trim() : '';
    if (a) {
      const { nick, openid } = splitActor(a);
      if (openid) { const pn = profByOpenid.get(openid); if (pn) return pn; }
      return nick || a;
    }
    return sessProfName.get(n.sessionId) || '用户';
  };

  // 情绪词解析：蒸馏 mood 词 > ops 推断 mood 词 > PAD（仅全局词表人设）
  const emoInfoOf = (n) => {
    const snap = n.emotion;
    if (snap && typeof snap === 'object') {
      const word = (snap.mood || '').trim() || (defaultScale ? EMO_NAME[emotionBucket(snap)] : null);
      return word || snap.label ? { word: word ?? null, label: snap.label || '', t: n.createdAt } : null;
    }
    const e = emotionEntry(n, emos);
    if (!e) return null;
    const word = (e.state.mood || '').trim() || (defaultScale ? EMO_NAME[emotionBucket(e.state)] : null);
    return word || e.state.label ? { word: word ?? null, label: e.state.label || '', t: e.t } : null;
  };
  const stateEmo = (st) => {
    if (!st || typeof st !== 'object') return { word: null, label: '', v: 0, a: 0, d: 0 };
    const word = (st.mood || '').trim() || (defaultScale ? EMO_NAME[emotionBucket(st)] : null);
    return { word: word ?? null, label: st.label || '', v: +(st.v) || 0, a: +(st.a) || 0, d: +(st.d) || 0 };
  };

  // 富化全部记忆（byId 供「画面外定位」），visible = 三轨过滤后的绘制集
  const byId = {};
  const visible = [];
  for (const n of rawNotes) {
    const emo = emoInfoOf(n);
    const v = {
      ...n,
      title: mapLabel(n, rawNotes),
      day: n.ageDays ?? 0,
      ret: n.retention ?? 0,
      imp: n.importance ?? 0,
      track: isSelfTrack(n) ? 'self' : 'world',
      emo: emo?.word ?? null,
      emoLabel: emo?.label ?? '',
      emoT: emo?.t ?? null,
      sess: sessName(n.sessionId),
      who: whoOf(n),
      char: noteChar(n, plist),
    };
    byId[n.id] = v;
    if (v.track === 'world' || v.char === viewChar) visible.push(v);
  }

  // 关系：visible 集上的合并关系（derived/semantic 边 + topic/session/actor 本地理由）
  const relations = buildRelations(visible, state?.edges ?? []);

  // links：服务端边规范化（consolidate/similar/facet）+ 记忆↔情绪词交叉边
  const links = [];
  for (const e of state?.edges ?? []) {
    if (!byId[e.a]) continue;
    if (e.kind === 'derived') links.push({ a: e.a, b: e.b, t: 'consolidate' });
    else if (e.kind === 'semantic') links.push({ a: e.a, b: e.b, t: 'similar', score: e.score });
    else if (e.kind === 'facet') links.push({ a: e.a, b: e.b, t: 'facet', score: e.score });
  }
  for (const n of visible) {
    if (n.emo) links.push({ a: n.id, b: `emo:${n.emo}`, t: 'emotion' });
  }

  // 当前心情 + 一句话（确定性模板，零 LLM）
  const mood = stateEmo(state?.emotion);
  const emoCount = mood.word ? visible.filter((n) => n.emo === mood.word).length : 0;
  const say = companionLine(mood.word ? 'emotion' : null, emoCount, mood.word || '平静');

  // 七日心情：ops 按本地日分桶取当日最新一条；无记录日 mood=null（如实「—」）
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    const hit = emos.find((e) => sameLocalDay(e.t, d)); // ops new→old，首个命中=当日最新
    week.push({ key, mood: hit ? stateEmo(hit.state).word : null });
  }

  // 最近被想起 top6（lastAccessAt 降序）
  const recalls = [...visible]
    .sort((a, b) => (b.lastAccessAt ?? 0) - (a.lastAccessAt ?? 0))
    .slice(0, 6)
    .map((n) => ({ id: n.id, t: n.lastAccessAt ?? n.createdAt, title: n.title, kind: n.kind }));

  // 即将隐没 top5：retention 升序；days = S·ln(R/阈值)，已过线=0
  const threshold = state?.config?.forgetThreshold ?? 0.2;
  const fadingSoon = [...visible]
    .sort((a, b) => a.ret - b.ret)
    .slice(0, 5)
    .map((n) => {
      const s = Math.max(n.strength ?? 1, 0.5);
      const days = n.ret <= threshold ? 0 : Math.max(1, Math.ceil(s * Math.log(n.ret / threshold)));
      return { id: n.id, days, ret: n.ret, title: n.title, fading: !!n.fading };
    });

  // 观测对象：who 计数 top3
  const whoCount = new Map();
  for (const n of visible) whoCount.set(n.who, (whoCount.get(n.who) ?? 0) + 1);
  const observers = [...whoCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  const viewText = viewEntry?.text || state?.persona || '';
  return {
    notes: visible,
    byId,
    relations,
    links,
    edges: state?.edges ?? [],
    mood,
    say,
    week,
    recalls,
    fadingSoon,
    observers,
    facets: personaFacets(viewText),
    persona: viewEntry ?? null,
    characterId: viewChar,
    moodWords,
    emotionSession: state?.emotionSession ?? null,
    stats: state?.stats ?? {},
    config: state?.config ?? {},
    now,
  };
}
