'use strict';
const { zoneGuide } = require('../miniprogram/services/labels.js');
const { quantityLabel } = require('../miniprogram/services/labels.js');
const test = require('node:test');
const assert = require('node:assert');
const { buildFoodRecord, applyFilters, mergeImport, shouldProceedSave, finishSave, transferZone, shoppingToRecords } = require('../miniprogram/services/records.js');

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

test('transferZone：按数据库新分区天数重算，并记历史', () => {
  const now2 = 1726670000000;
  const milk = { name: '牛奶', zone: 'fridge', shelfDays: 7, expiryAt: now2 + 7 * DAY, addedAt: now2 };
  const p = transferZone(milk, 'freezer', now2);
  assert.strictEqual(p.zone, 'freezer');
  assert.strictEqual(p.shelfDays, 90);                       // 数据库牛奶冷冻90天
  assert.strictEqual(p.expiryAt, now2 + 90 * DAY);
  assert.strictEqual(p.history.length, 1);
  assert.strictEqual(p.history[0].from, 'fridge');
  assert.strictEqual(p.history[0].to, 'freezer');
  assert.strictEqual(p.history[0].at, now2);
  // 数据库无该分区建议（土豆无冷藏）→ 保持现有天数
  const potato = { name: '土豆', zone: 'room', shelfDays: 30, expiryAt: now2 + 30 * DAY, addedAt: now2 };
  const p2 = transferZone(potato, 'fridge', now2);
  assert.strictEqual(p2.shelfDays, 30);
  // 转移历史累积
  const p3 = transferZone(Object.assign({}, milk, { history: [{ from: 'room', to: 'fridge', at: 1 }] }), 'freezer', now2);
  assert.strictEqual(p3.history.length, 2);
});

test('shoppingToRecords：勾选项按数据库入库（默认冷藏），未知项兜底', () => {
  const now2 = 1726670000000;
  const recs = shoppingToRecords([
    { id: 's1', name: '牛奶', done: true },
    { id: 's2', name: '神秘食物', done: true },
    { id: 's3', name: '没买的', done: false }        // 未勾选不入库
  ], now2);
  assert.strictEqual(recs.length, 2);
  const milk = recs.filter((r) => r.name === '牛奶')[0];
  assert.strictEqual(milk.category, 'dairy');
  assert.strictEqual(milk.zone, 'fridge');
  assert.strictEqual(milk.shelfDays, 7);
  assert.strictEqual(milk.source, 'shopping');
  const mystery = recs.filter((r) => r.name === '神秘食物')[0];
  assert.strictEqual(mystery.category, 'other');
  assert.strictEqual(mystery.shelfDays, 7);
});

test('quantityLabel：三档文案与非法回退', () => {
  assert.strictEqual(quantityLabel('full'), '充足');
  assert.strictEqual(quantityLabel('half'), '过半');
  assert.strictEqual(quantityLabel('low'), '见底');
  assert.strictEqual(quantityLabel('bogus'), '');
  assert.strictEqual(quantityLabel(null), '');
});

test('shoppingToRecords：数据库不建议冷藏的物品按可用分区入库', () => {
  const recs = shoppingToRecords([{ id: 'p', name: '土豆', done: true }], now);   // 土豆 fridge=null, room=30
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0].zone, 'room');
  assert.strictEqual(recs[0].shelfDays, 30);
});

test('buildFoodRecord：daysByZone 三区建议持久化（AI值 > 数据库 > null）', () => {
  // AI 值优先
  const r1 = buildFoodRecord({ name: '奇异食物', zoneKey: 'fridge', days: 5, allDays: { roomDays: 2, fridgeDays: 5, freezerDays: 60 } }, now);
  assert.deepStrictEqual(r1.daysByZone, { room: 2, fridge: 5, freezer: 60 });
  // 无 AI 值 → 数据库
  const r2 = buildFoodRecord({ name: '牛奶', zoneKey: 'fridge', days: 7 }, now);
  assert.strictEqual(r2.daysByZone.room, null);
  assert.strictEqual(r2.daysByZone.fridge, 7);
  assert.strictEqual(r2.daysByZone.freezer, 90);
  // 都没有 → 全 null
  const r3 = buildFoodRecord({ name: '外星食物', zoneKey: 'fridge', days: 3 }, now);
  assert.deepStrictEqual(r3.daysByZone, { room: null, fridge: null, freezer: null });
});

test('zoneGuide：推荐分区标记 + 三区天数/不建议', () => {
  const g1 = zoneGuide({ roomDays: 2, fridgeDays: 7, freezerDays: 30 });
  assert.ok(g1.indexOf('推荐冷藏') !== -1 && g1.indexOf('7天') !== -1);
  assert.ok(g1.indexOf('常温2天') !== -1 && g1.indexOf('冷冻30天') !== -1);
  const g2 = zoneGuide({ roomDays: 30, fridgeDays: null, freezerDays: null });   // 土豆类
  assert.ok(g2.indexOf('推荐常温') !== -1 && g2.indexOf('冷藏不建议') !== -1);
  const g3 = zoneGuide({});
  assert.strictEqual(g3, '');
});
