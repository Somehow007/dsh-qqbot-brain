// 主题解析与皮肤偏好。
// 解析序（§4.1）：persona.meta.* 逐字段 > 内置预设（概念稿色板）> characterId 哈希派生。
// 皮肤偏好（§4.2）：?skin=（不持久化）> localStorage brain-skin:<characterId> > 默认
//   （whale 系 → cortex，其余 → nocturne）。按钮切换写当前角色键。
// 本模块不 import store/api——node 单测可直接加载。

// 与 src/brain/types.ts 同步：分轨前人设 id 回落 whale 角色
const PRE_TAG_PERSONA_ID = 'whale-gentle';
const WHALE_PERSONA_IDS = ['whale-gentle', 'whale-devotion', 'legacy'];
const WHALE_CHARACTER_ID = 'whale';

// 与 src/brain/types.ts MOODS 同步：人设未配 moods 时的全局词表
export const DEFAULT_MOODS = ['平静', '开心', '兴奋', '害羞', '好奇', '委屈', '炸毛', '记仇', '难过'];

/** 全部皮肤 id（契约层）：cortex 已上线，dossier/nocturne 为 P2 占位 */
export const SKIN_IDS = ['cortex', 'dossier', 'nocturne'];
export const SKIN_LABELS = { cortex: '鲸脑', dossier: '墨刊', nocturne: '星图' };

/** personaId → 角色 id：显式 characterId 优先；whale 系常量回落；其余=人设 id 本身 */
export function characterOfId(pid, personas = []) {
  const id = pid || PRE_TAG_PERSONA_ID;
  const p = personas.find((x) => x?.id === id);
  const cid = typeof p?.characterId === 'string' ? p.characterId.trim() : '';
  if (cid) return cid;
  return WHALE_PERSONA_IDS.includes(id) ? WHALE_CHARACTER_ID : id;
}

/** 人设条目 → 角色 id */
export function characterOfPersona(persona, personas) {
  return characterOfId(persona?.id, personas ?? (persona ? [persona] : []));
}

// ── 预设（概念稿 data.js 色板；whale moodColors 取旧页 EMO_BUCKETS 九色，保证皮层零回退）──
const EMO9 = {
  平静: '#5fdcc8', 开心: '#ffc95c', 兴奋: '#ff9d3c', 害羞: '#ff9ecf', 好奇: '#6cb8ff',
  委屈: '#a991ff', 炸毛: '#ff6f86', 记仇: '#c66bd0', 难过: '#7a8fb8',
};
// ye/firefly 共用的 10 词扩展表（种子词表）：重叠词沿用 EMO9，新增词按角色色系取色
const YE_FIREFLY_MOOD_COLORS = {
  ...EMO9,
  心疼: '#e88ca0', 坚定: '#d2533c', 寂寞: '#7a8fb8', 想念: '#9a86ff', 温暖: '#ffb938', 释然: '#5fdcc8',
};

const PRESETS = {
  whale: {
    pal: { a: '#3d7bff', a2: '#8ec5ff', soft: '#e7f0ff', deep: '#0d2a66' },
    traits: [['傲娇', .92], ['嘴硬心软', .84], ['贪吃 token', .76], ['认真靠谱', .68], ['怕被冷落', .55]],
    moodColors: { ...EMO9 },
    mono: '鱼', en: 'DAFEIYU', tagline: '傲娇的蓝色鲸鱼女仆', title: '大肥鱼',
  },
  ye: {
    pal: { a: '#c8892a', a2: '#f1cf8a', soft: '#fbf2e2', deep: '#4a2f08' },
    traits: [['严厉', .88], ['护短', .81], ['好为人师', .74], ['不擅表达', .63], ['爱逞强', .52]],
    moodColors: { ...YE_FIREFLY_MOOD_COLORS },
    mono: '光', en: 'YE SHUNGUANG', tagline: '严厉又护短的师姐', title: '叶瞬光',
  },
  firefly: {
    pal: { a: '#1fae8c', a2: '#9be8d2', soft: '#e4f7f1', deep: '#073d32' },
    traits: [['温柔', .9], ['珍惜当下', .86], ['坚韧', .78], ['羞涩', .66], ['偶尔逞强', .5]],
    moodColors: { ...YE_FIREFLY_MOOD_COLORS },
    mono: '萤', en: 'FIREFLY', tagline: '想看一次真正日出的少女', title: '流萤',
  },
};

// ── 哈希派生（兜底：无 meta 且无预设的角色）──
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** characterId → 确定性四色（a/a2/soft/deep） */
export function deriveTheme(seed) {
  const h = hashStr(seed || 'persona') % 360;
  return {
    a: hslToHex(h, 72, 52), a2: hslToHex(h, 60, 70),
    soft: hslToHex(h, 45, 93), deep: hslToHex(h, 62, 20),
  };
}

/** 词名 → 确定性色（moodColors 兜底） */
export function hashColor(word) {
  return hslToHex(hashStr(word || '?') % 360, 68, 58);
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const validHex = (c) => typeof c === 'string' && HEX6.test(c);

function validTraits(t) {
  if (!Array.isArray(t)) return null;
  // 显式 [] = 用户清空，不回落预设；非法项过滤后仍返回（可为空）
  return t.filter((x) => Array.isArray(x) && x.length >= 2
    && typeof x[0] === 'string' && x[0].length <= 40
    && typeof x[1] === 'number' && x[1] >= 0 && x[1] <= 1).slice(0, 6);
}

/**
 * 解析人设主题。
 * @param persona {id,name,text,characterId?,moods?,meta?} 人设条目（可为 null → 派生兜底）
 * @param personas 全部人设（characterOfId 需要查表；缺省只用 persona 自身）
 * @returns {characterId,name,title,a,a2,soft,deep,moods,moodColors,traits,mono,en,tagline}
 *   title=角色级显示名（whale→大肥鱼）：皮肤标题/气泡用它，人设版本名（鲸鱼娘·温柔）只进顶栏
 */
export function resolveTheme(persona, personas) {
  const all = Array.isArray(personas) ? personas : (persona ? [persona] : []);
  const charId = characterOfId(persona?.id, all);
  const preset = PRESETS[charId] ?? null;
  const meta = persona?.meta ?? null;
  const name = typeof persona?.name === 'string' ? persona.name : '';
  const derived = deriveTheme(charId);
  const pick = (k) => (meta?.theme && validHex(meta.theme[k]) ? meta.theme[k] : null)
    ?? preset?.pal?.[k] ?? derived[k];
  const moodWords = Array.isArray(persona?.moods) && persona.moods.length
    ? persona.moods.filter((m) => typeof m === 'string' && m.trim()).slice(0, 12)
    : [...DEFAULT_MOODS];
  const moodColors = {};
  for (const w of moodWords) {
    const c = meta?.moodColors?.[w] ?? preset?.moodColors?.[w];
    moodColors[w] = validHex(c) ? c : hashColor(w);
  }
  // meta.moodColors 中词表外的额外键也带上（皮肤可能查全局词）
  if (meta?.moodColors && typeof meta.moodColors === 'object') {
    for (const [w, c] of Object.entries(meta.moodColors)) {
      if (!(w in moodColors) && validHex(c)) moodColors[w] = c;
    }
  }
  // 没有任何 moodColors 来源时，给全局九词兜底（情绪节点层需要）
  if (!Object.keys(moodColors).length) for (const w of DEFAULT_MOODS) moodColors[w] = hashColor(w);
  const traits = validTraits(meta?.traits) ?? preset?.traits ?? [];
  const text = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fallback);
  return {
    characterId: charId,
    name,
    title: preset?.title ?? name,
    a: pick('a'), a2: pick('a2'), soft: pick('soft'), deep: pick('deep'),
    moods: moodWords,
    moodColors,
    traits,
    mono: text(meta?.mono, preset?.mono ?? (name ? [...name][0] : '脑')),
    en: text(meta?.en, preset?.en ?? ''),
    tagline: text(meta?.tagline, preset?.tagline ?? ''),
  };
}

// ── 皮肤偏好 ──
function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function skinKey(characterId) { return `brain-skin:${characterId || 'default'}`; }

/** whale 系角色 → cortex；其余 → nocturne（§4.2 默认规则） */
export function defaultSkinFor(characterId) {
  return characterId === WHALE_CHARACTER_ID ? 'cortex' : 'nocturne';
}

/**
 * 解析当前应使用的皮肤 id。
 * @param characterId 角色 id
 * @param opts.param ?skin= 参数值（显式传入时不读 location；undefined=读 URL）
 * @param opts.stored localStorage 已存值（undefined=读 localStorage；测试注入用）
 */
export function resolveSkin(characterId, opts = {}) {
  let param = opts.param;
  if (param === undefined) {
    try { param = new URLSearchParams(location.search).get('skin') ?? undefined; } catch { param = undefined; }
  }
  if (param && SKIN_IDS.includes(param)) return param; // ?skin= 只影响本次，不写回
  let stored = opts.stored;
  if (stored === undefined) stored = storage()?.getItem(skinKey(characterId)) ?? null;
  if (stored && SKIN_IDS.includes(stored)) return stored;
  return defaultSkinFor(characterId);
}

/** 顶栏皮肤按钮切换：写当前角色键 */
export function setSkinPref(characterId, skin) {
  if (!SKIN_IDS.includes(skin)) return;
  try { storage()?.setItem(skinKey(characterId), skin); } catch { /* ignore */ }
}

// ── 动效偏好（沿用旧页 localStorage 键）──
const PREF_KEYS = { motion: 'brain-motion', signal: 'brain-signal', particles: 'brain-particles' };
export function getPref(name) {
  const v = storage()?.getItem(PREF_KEYS[name]) ?? null;
  return v === null ? null : v === '1';
}
export function setPref(name, on) {
  try { storage()?.setItem(PREF_KEYS[name], on ? '1' : '0'); } catch { /* ignore */ }
}
