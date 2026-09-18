'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildFoodRecord } = require('../miniprogram/services/records.js');

const DAY = 86400000;
const now = 1726670000000;

test('buildFoodRecord：补齐字段并计算到期时间', () => {
  const r = buildFoodRecord({ name: ' 牛奶 ', category: 'dairy', zoneKey: 'fridge', days: 7, source: 'ai', tips: '尽快饮用' }, now);
  assert.strictEqual(r.name, '牛奶');
  assert.strictEqual(r.zone, 'fridge');
  assert.strictEqual(r.shelfDays, 7);
  assert.strictEqual(r.addedAt, now);
  assert.strictEqual(r.expiryAt, now + 7 * DAY);
  assert.strictEqual(r.source, 'ai');
  assert.deepStrictEqual(r.ai, { confidence: null, tips: '尽快饮用' });
});

test('buildFoodRecord：天数钳制 1..365、缺省回退', () => {
  assert.strictEqual(buildFoodRecord({ name: 'A', zoneKey: 'room', days: 0 }, now).shelfDays, 1);
  assert.strictEqual(buildFoodRecord({ name: 'A', zoneKey: 'room', days: 999 }, now).shelfDays, 365);
  assert.strictEqual(buildFoodRecord({ name: 'A', zoneKey: 'room' }, now).shelfDays, 3);      // 未给天数
  assert.strictEqual(buildFoodRecord({ name: 'A', zoneKey: 'room', days: '5' }, now).shelfDays, 5); // 字符串数字
  assert.strictEqual(buildFoodRecord({ name: 'A', zoneKey: 'room', days: 5, category: 'bogus' }, now).category, 'other');
  assert.strictEqual(buildFoodRecord({ name: 'A', zoneKey: 'nope', days: 5 }, now).zone, 'fridge'); // 非法分区回退冷藏
});
