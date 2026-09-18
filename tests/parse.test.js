'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseAiFoodResult, reconcileWithDb } = require('../miniprogram/services/parse.js');

test('解析正常 JSON', () => {
  const r = parseAiFoodResult(JSON.stringify({
    isFood: true, confidence: 0.92, scene: '砧板上的蔬菜',
    items: [{ name: '西兰花', category: 'vegetable', roomDays: 2, fridgeDays: 7, freezerDays: 30, tips: '焯水冷冻' }]
  }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.isFood, true);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].name, '西兰花');
  assert.strictEqual(r.items[0].fridgeDays, 7);
});

test('解析带 ```json 围栏与前后杂质文本', () => {
  const r = parseAiFoodResult('识别结果如下：\n```json\n{"isFood":true,"confidence":0.8,"items":[{"name":"牛奶","category":"dairy","fridgeDays":7}]}\n```\n以上仅供参考');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.items[0].name, '牛奶');
  assert.strictEqual(r.items[0].roomDays, null); // 缺省字段补 null
  assert.strictEqual(r.items[0].freezerDays, null);
});

test('天数超限被钳制', () => {
  const r = parseAiFoodResult('{"isFood":true,"items":[{"name":"奇异水果","category":"fruit","roomDays":900,"fridgeDays":365,"freezerDays":10000}]}');
  assert.strictEqual(r.ok, true);
  const it = r.items[0];
  assert.strictEqual(it.roomDays, 365);   // room ≤ 365
  assert.strictEqual(it.fridgeDays, 90);  // fridge ≤ 90
  assert.strictEqual(it.freezerDays, 365);
});

test('类型矫正：字符串数字、"7天"、小数向下取整', () => {
  const r = parseAiFoodResult('{"isFood":true,"items":[{"name":"A","fridgeDays":"5"},{"name":"B","fridgeDays":"7天"},{"name":"C","fridgeDays":3.9}]}');
  assert.strictEqual(r.items[0].fridgeDays, 5);
  assert.strictEqual(r.items[1].fridgeDays, 7);
  assert.strictEqual(r.items[2].fridgeDays, 3);
});

test('非食物图片', () => {
  const r = parseAiFoodResult('{"isFood":false,"confidence":0.9,"items":[]}');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.isFood, false);
  assert.deepStrictEqual(r.items, []);
});

test('非法 category 归为 other；无名条目被丢弃', () => {
  const r = parseAiFoodResult('{"isFood":true,"items":[{"name":"X","category":"machine"},{"fridgeDays":3},{"name":"Y"}]}');
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.items[0].category, 'other');
  assert.ok(r.items.every((i) => i.name));
});

test('坏输入返回 ok:false', () => {
  assert.strictEqual(parseAiFoodResult('').ok, false);
  assert.strictEqual(parseAiFoodResult('完全不是JSON').ok, false);
  assert.strictEqual(parseAiFoodResult('{"items":[{"name":"只有一项但没有闭合').ok, false);
  assert.strictEqual(parseAiFoodResult(null).ok, false);
});

test('reconcileWithDb：数据库存在时取更保守值并标记', () => {
  // AI 幻觉：牛奶冷藏 60 天，数据库 7 天 → 取 7
  const r = reconcileWithDb({ name: '牛奶', category: 'dairy', roomDays: null, fridgeDays: 60, freezerDays: null, tips: '' });
  assert.strictEqual(r.fridgeDays, 7);
  assert.strictEqual(r.adjusted, true);
  // AI 更保守：冷藏 3 天 → 保留 3
  const r2 = reconcileWithDb({ name: '牛奶', category: 'dairy', roomDays: null, fridgeDays: 3, freezerDays: null, tips: '' });
  assert.strictEqual(r2.fridgeDays, 3);
  assert.strictEqual(r2.adjusted, false);
  // 数据库无此项：原样返回
  const r3 = reconcileWithDb({ name: '外星食物', category: 'other', roomDays: 5, fridgeDays: 5, freezerDays: 5, tips: '' });
  assert.strictEqual(r3.fridgeDays, 5);
  assert.strictEqual(r3.adjusted, false);
});
