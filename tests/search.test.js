'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { searchDb } = require('../miniprogram/services/search.js');

test('searchDb：精确命中置首、包含匹配、上限6', () => {
  const r = searchDb('西红柿');
  assert.strictEqual(r.length, 1);                    // 库内仅"西红柿"本身含此子串
  assert.strictEqual(r[0].name, '西红柿');
  // "番茄"是"西红柿"的别名 → 精确命中规范名置首；名称/别名含"番茄"的条目随后
  const r2 = searchDb('番茄');
  assert.strictEqual(r2[0].name, '西红柿');
  assert.ok(r2.some((x) => x.name === '番茄酱'));
  assert.ok(r2.some((x) => x.name === '圣女果'));
  assert.ok(r2.length <= 6);
});

test('searchDb：空输入/无命中/首尾空白', () => {
  assert.deepStrictEqual(searchDb(''), []);
  assert.deepStrictEqual(searchDb('  '), []);
  assert.deepStrictEqual(searchDb('不存在的食物xyz'), []);
  assert.strictEqual(searchDb(' 西兰花 ')[0].name, '西兰花');
});

test('searchDb：别名子串命中（洋芋→土豆）', () => {
  const r = searchDb('洋芋');
  assert.ok(r.some((x) => x.name === '土豆'));
});
