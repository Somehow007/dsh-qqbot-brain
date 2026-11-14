import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  characterOfId, characterOfPersona, resolveTheme, resolveSkin,
  defaultSkinFor, skinKey, deriveTheme, hashColor, DEFAULT_MOODS, SKIN_IDS,
} from '../src/server/web/core/theme.js';

test('characterOfId：characterId 优先，whale 系常量回落，其余=人设 id', () => {
  assert.equal(characterOfId('legacy', []), 'whale');
  assert.equal(characterOfId('whale-devotion', []), 'whale');
  assert.equal(characterOfId(undefined, []), 'whale'); // PRE_TAG 回落
  assert.equal(characterOfId('p1', [{ id: 'p1', characterId: 'ye' }]), 'ye');
  assert.equal(characterOfId('p2', [{ id: 'p2' }]), 'p2');
  assert.equal(characterOfId('p3', [{ id: 'p3', characterId: '  ' }]), 'p3'); // 空白视为未设
});

test('默认皮肤规则：whale 系→cortex，其余→nocturne', () => {
  assert.equal(defaultSkinFor('whale'), 'cortex');
  assert.equal(defaultSkinFor('ye'), 'nocturne');
  assert.equal(defaultSkinFor('firefly'), 'nocturne');
  assert.equal(defaultSkinFor('custom-x'), 'nocturne');
});

test('resolveSkin 三级解析：?skin= > localStorage > 默认；非法值回落', () => {
  // ?skin= 显式优先（不持久化语义由调用方保证，这里只验证返回值）
  assert.equal(resolveSkin('whale', { param: 'dossier', stored: 'cortex' }), 'dossier');
  assert.equal(resolveSkin('ye', { param: 'nocturne', stored: 'cortex' }), 'nocturne');
  // 非法 ?skin= 忽略，落到 stored
  assert.equal(resolveSkin('whale', { param: 'evil', stored: 'cortex' }), 'cortex');
  // stored 生效
  assert.equal(resolveSkin('ye', { param: undefined, stored: 'cortex' }), 'cortex');
  assert.equal(resolveSkin('whale', { param: undefined, stored: 'nocturne' }), 'nocturne');
  // stored 缺失/非法 → 默认
  assert.equal(resolveSkin('whale', { param: undefined, stored: null }), 'cortex');
  assert.equal(resolveSkin('ye', { param: undefined, stored: 'bogus' }), 'nocturne');
  assert.equal(resolveSkin('whale', { param: undefined, stored: undefined }), 'cortex');
});

test('resolveSkin localStorage 键按角色隔离', () => {
  assert.equal(skinKey('whale'), 'brain-skin:whale');
  assert.equal(skinKey('ye'), 'brain-skin:ye');
  assert.notEqual(skinKey('whale'), skinKey('ye'));
});

test('resolveTheme：whale 预设色板与 mono/en/tagline（概念稿值）', () => {
  const t = resolveTheme({ id: 'whale-gentle', name: '鲸鱼娘·温柔', characterId: 'whale' });
  assert.equal(t.characterId, 'whale');
  assert.equal(t.a, '#3d7bff');
  assert.equal(t.a2, '#8ec5ff');
  assert.equal(t.soft, '#e7f0ff');
  assert.equal(t.deep, '#0d2a66');
  assert.equal(t.mono, '鱼');
  assert.equal(t.en, 'DAFEIYU');
  assert.equal(t.tagline, '傲娇的蓝色鲸鱼女仆');
  assert.equal(t.traits.length, 5);
  assert.equal(t.traits[0][0], '傲娇');
  // whale 未配 moods → 全局九词表；moodColors 用旧页 EMO_BUCKETS 九色（皮层零回退）
  assert.deepEqual(t.moods, DEFAULT_MOODS);
  assert.equal(t.moodColors['开心'], '#ffc95c');
  assert.equal(t.moodColors['平静'], '#5fdcc8');
  assert.equal(t.moodColors['难过'], '#7a8fb8');
  for (const w of t.moods) assert.ok(t.moodColors[w], `缺 ${w} 色`);
});

test('resolveTheme：meta 逐字段覆盖预设；moodColors 覆盖单词色', () => {
  const persona = {
    id: 'ye-shunguang', name: '叶瞬光', characterId: 'ye',
    moods: ['平静', '开心', '心疼', '释然'],
    meta: {
      theme: { a: '#112233', a2: '#445566', soft: '#778899', deep: '#aabbcc' },
      moodColors: { 心疼: '#ff0000' },
      traits: [['严厉', .9], ['护短', .8]],
      mono: '葉', en: 'LEAF', tagline: '自定义',
    },
  };
  const t = resolveTheme(persona);
  assert.equal(t.characterId, 'ye');
  assert.equal(t.a, '#112233');
  assert.equal(t.deep, '#aabbcc');
  assert.equal(t.mono, '葉');
  assert.equal(t.en, 'LEAF');
  assert.equal(t.traits.length, 2);
  assert.deepEqual(t.moods, ['平静', '开心', '心疼', '释然']); // 人设 moods 优先于全局
  assert.equal(t.moodColors['心疼'], '#ff0000'); // meta 覆盖
  assert.ok(t.moodColors['平静'], '其余词仍有兜底色');
  assert.ok(t.moodColors['释然'], '词表外…词表内每词必有色');
});

test('resolveTheme：meta 显式空 traits 生效（不回落预设）', () => {
  const t = resolveTheme({ id: 'p', name: 'X', characterId: 'custom', meta: { traits: [] } });
  assert.deepEqual(t.traits, []);
});

test('resolveTheme：未知角色哈希派生，确定性且形状合法', () => {
  const p = { id: 'p-x', name: '某人', characterId: 'custom-42' };
  const t1 = resolveTheme(p);
  const t2 = resolveTheme(p);
  assert.deepEqual(t1, t2, '同输入同输出');
  for (const k of ['a', 'a2', 'soft', 'deep']) assert.match(t1[k], /^#[0-9a-f]{6}$/);
  assert.equal(t1.mono, '某'); // name 首字
  assert.notEqual(t1.a, t1.deep);
  // 不同角色大概率不同色
  assert.notDeepEqual(resolveTheme({ id: 'p-y', name: '乙', characterId: 'custom-43' }).a, t1.a);
});

test('resolveTheme：无 persona 回落 whale 系预设（PRE_TAG 口径）', () => {
  const t = resolveTheme(null);
  assert.equal(t.characterId, 'whale');
  assert.equal(t.mono, '鱼');
  assert.ok(t.a && t.a2 && t.soft && t.deep);
});

test('deriveTheme/hashColor 确定性', () => {
  assert.equal(deriveTheme('x').a, deriveTheme('x').a);
  assert.match(hashColor('开心'), /^#[0-9a-f]{6}$/);
});

test('SKIN_IDS 覆盖契约三皮肤', () => {
  assert.deepEqual([...SKIN_IDS].sort(), ['cortex', 'dossier', 'nocturne']);
});
