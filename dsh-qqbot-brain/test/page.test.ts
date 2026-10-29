import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext, Script } from 'node:vm';

const page = readFileSync(join(import.meta.dirname, '../src/server/page.html'), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const helpers = script.match(/const cleanText=[\s\S]*?(?=function bindMapNode)/)?.[0] ?? '';
const { cleanText, nodeLabel, previewText } = runInNewContext(`${helpers}; ({cleanText,nodeLabel,previewText})`) as {
  cleanText: (text: string) => string;
  nodeLabel: (note: { id: string; content: string }, notes: { id: string; content: string }[]) => string;
  previewText: (note: { id: string; content: string }, notes: { id: string; content: string }[]) => string;
};

test('页面脚本语法有效', () => {
  assert.ok(script);
  assert.doesNotThrow(() => new Script(script));
});

test('脑图标签在共同开头之后显示可区分的内容', () => {
  const notes = [
    { id: 'a', content: '用户今天提到下个月要去青岛看海，已经订好车票' },
    { id: 'b', content: '用户今天提到下个月要去杭州出差，计划见老朋友' },
  ];
  assert.match(nodeLabel(notes[0]!, notes), /青岛/);
  assert.match(nodeLabel(notes[1]!, notes), /杭州/);
  assert.notEqual(nodeLabel(notes[0]!, notes), nodeLabel(notes[1]!, notes));
});

test('短记忆保留全文，长记忆仍可定位，不因空白或相同内容丢失', () => {
  const short = { id: 'a', content: '  年糕\n喜欢鱼  ' };
  assert.equal(cleanText(short.content), '年糕 喜欢鱼');
  assert.equal(nodeLabel(short, [short]), '年糕 喜欢鱼');
  const same = [
    { id: 'a', content: '用户决定坚持每周三次晨跑' },
    { id: 'b', content: '用户决定坚持每周三次晨跑' },
  ];
  assert.ok(nodeLabel(same[0]!, same).includes('晨跑'));
});

test('卡片摘要保留开头，并突出长共同前缀之后的区别', () => {
  const notes = [
    { id: 'a', content: '用户在今天的聊天中提到自己最近正在认真考虑去青岛看海，已经订票' },
    { id: 'b', content: '用户在今天的聊天中提到自己最近正在认真考虑去杭州出差，准备见朋友' },
  ];
  assert.match(previewText(notes[0]!, notes), /^用户在今天的聊天/);
  assert.match(previewText(notes[0]!, notes), /青岛/);
  assert.match(previewText(notes[1]!, notes), /杭州/);
});
