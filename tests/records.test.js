'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildFoodRecord, applyFilters, mergeImport, shouldProceedSave, finishSave } = require('../miniprogram/services/records.js');

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

test('buildFoodRecord：AI 置信度规范化', () => {
  const r1 = buildFoodRecord({ name: 'A', zoneKey: 'fridge', days: 5, tips: 'x', confidence: 0.88 }, now);
  assert.strictEqual(r1.ai.confidence, 0.88);
  const r2 = buildFoodRecord({ name: 'A', zoneKey: 'fridge', days: 5, confidence: 88 }, now);
  assert.strictEqual(r2.ai.confidence, 0.88);   // >1 视为百分数归一
  const r3 = buildFoodRecord({ name: 'A', zoneKey: 'fridge', days: 5, confidence: 'abc', tips: 't' }, now);
  assert.strictEqual(r3.ai.confidence, null);   // 非法 → null，tips 保留
  const r4 = buildFoodRecord({ name: 'A', zoneKey: 'fridge', days: 5 }, now);
  assert.strictEqual(r4.ai, null);              // 无 tips 无置信度 → 不存 ai
});

test('applyFilters：分区+类别组合筛选', () => {
  const list = [
    { id: 'a', zone: 'fridge', category: 'dairy' },
    { id: 'b', zone: 'freezer', category: 'meat' },
    { id: 'c', zone: 'fridge', category: 'vegetable' },
    { id: 'd', zone: 'room', category: 'dairy' }
  ];
  const f = applyFilters;
  assert.deepStrictEqual(f(list, {}).map((r) => r.id), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(f(list, { zone: 'fridge' }).map((r) => r.id), ['a', 'c']);
  assert.deepStrictEqual(f(list, { category: 'dairy' }).map((r) => r.id), ['a', 'd']);
  assert.deepStrictEqual(f(list, { zone: 'fridge', category: 'dairy' }).map((r) => r.id), ['a']);
  assert.deepStrictEqual(f(list, { zone: 'all', category: 'all' }).map((r) => r.id), ['a', 'b', 'c', 'd']);
});

test('mergeImport：id 冲突跳过、非法条目丢弃、无 id 补 id', () => {
  const existing = [{ id: 'a', name: '牛奶', expiryAt: 1, addedAt: 1 }];
  const imported = [
    { id: 'a', name: '牛奶(重复)', expiryAt: 2, addedAt: 2 },       // id 冲突 → 跳过
    { name: '鸡蛋', expiryAt: 1726670000000, addedAt: 1726670000000 }, // 无 id → 补 id 合入
    { name: '', expiryAt: 1, addedAt: 1 },                            // 缺名 → 丢弃
    { name: '坏条目', expiryAt: 'abc', addedAt: 1 },                  // expiryAt 非数字 → 丢弃
    'garbage'                                                          // 非对象 → 丢弃
  ];
  const r = mergeImport(existing, imported);
  assert.strictEqual(r.merged, 1);
  assert.strictEqual(r.skipped, 1);
  const egg = r.out.filter((x) => x.name === '鸡蛋')[0];
  assert.ok(egg && egg.id);
  assert.strictEqual(r.out.length, 2);   // 原1 + 新1
  // 空输入
  assert.deepStrictEqual(mergeImport(existing, null), { merged: 0, skipped: 0, out: existing });
  // 上限保护
  const big = [];
  for (let i = 0; i < 2500; i++) big.push({ name: 'x' + i, expiryAt: 1, addedAt: 1 });
  assert.ok(mergeImport([], big).merged <= 2000);
});

test('shouldProceedSave：防连点（busy 拒绝，空闲放行并置忙）', () => {
  const state = { saving: false };
  assert.strictEqual(shouldProceedSave(state), true);
  assert.strictEqual(state.saving, true);
  assert.strictEqual(shouldProceedSave(state), false);   // 忙时拒绝
  finishSave(state);
  assert.strictEqual(state.saving, false);
  assert.strictEqual(shouldProceedSave({ saving: true }), false);
});
