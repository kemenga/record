'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { getStatus, getDaysLeft, getProgress, groupFoods, pickEatFirst } = require('../miniprogram/services/shelflife.js');

const DAY = 86400000;
const now = 1726670000000;

test('getStatus 边界', () => {
  const expiry = now + 10 * DAY;
  assert.strictEqual(getStatus(expiry, now + 10 * DAY + 1, 3), 'expired');   // 过期1ms
  assert.strictEqual(getStatus(expiry, now + 10 * DAY, 3), 'expiring');      // 恰好到期（未过期，剩0天）
  assert.strictEqual(getStatus(now + 3 * DAY, now, 3), 'expiring');          // 剩3天=阈值
  assert.strictEqual(getStatus(now + 3 * DAY + 1, now, 3), 'fresh');
  assert.strictEqual(getStatus(now + 10 * DAY, now, 3), 'fresh');
});

test('getDaysLeft 整数向上取整，过期为负', () => {
  assert.strictEqual(getDaysLeft(now + DAY, now), 1);
  assert.strictEqual(getDaysLeft(now + DAY / 2, now), 1);      // 0.5天 → 1
  assert.strictEqual(getDaysLeft(now + 3 * DAY + 1, now), 4);
  assert.strictEqual(getDaysLeft(now - DAY / 2, now), 0);      // 过期半天 → 0（页面上"已过期"）
  assert.strictEqual(getDaysLeft(now - 2 * DAY, now), -2);
});

test('getProgress 边界钳制 0..1', () => {
  const rec = { addedAt: now - 2 * DAY, shelfDays: 10, expiryAt: now + 8 * DAY };
  // 已过 2/10
  assert.ok(Math.abs(getProgress(rec, now) - 0.8) < 1e-9);
  assert.strictEqual(getProgress({ addedAt: now - 20 * DAY, shelfDays: 10, expiryAt: now - 10 * DAY }, now), 0);
  assert.strictEqual(getProgress({ addedAt: now, shelfDays: 10, expiryAt: now + 10 * DAY }, now), 1);
  assert.strictEqual(getProgress({ addedAt: now, shelfDays: 0, expiryAt: now }, now), 0); // 防除零
});

test('groupFoods 分组与组内排序', () => {
  const foods = [
    { id: 'a', expiryAt: now + 10 * DAY },
    { id: 'b', expiryAt: now + 2 * DAY },   // expiring（≤3）
    { id: 'c', expiryAt: now - 1 * DAY },   // expired
    { id: 'd', expiryAt: now + 1 * DAY },   // expiring，比 b 更早到期
    { id: 'e', expiryAt: now + 30 * DAY }   // fresh
  ];
  const g = groupFoods(foods, now, 3);
  assert.deepStrictEqual(g.expired.map((f) => f.id), ['c']);
  assert.deepStrictEqual(g.expiring.map((f) => f.id), ['d', 'b']);  // 升序
  assert.deepStrictEqual(g.fresh.map((f) => f.id), ['a', 'e']);
});

test('groupFoods 过滤已食用', () => {
  const foods = [
    { id: 'a', expiryAt: now + DAY, eatenAt: now },  // 已食用 → 不出现
    { id: 'b', expiryAt: now + DAY }
  ];
  const g = groupFoods(foods, now, 3);
  assert.deepStrictEqual(g.expiring.map((f) => f.id), ['b']);
});

test('pickEatFirst：过期+临期优先，按到期升序，限量，排除已食用', () => {
  const foods = [
    { id: 'a', expiryAt: now + 10 * DAY },   // fresh 不参与
    { id: 'b', expiryAt: now + 2 * DAY },    // expiring
    { id: 'c', expiryAt: now - 1 * DAY },    // expired 最优先
    { id: 'd', expiryAt: now + 1 * DAY },    // expiring
    { id: 'e', expiryAt: now + 2 * DAY, eatenAt: now }, // 已食用排除
    { id: 'f', expiryAt: now - 3 * DAY }     // expired
  ];
  const pick = pickEatFirst(foods, now, 3, 2);
  assert.deepStrictEqual(pick.map((r) => r.id), ['f', 'c']); // 最先过期的排最前
  const all = pickEatFirst(foods, now, 3, 10);
  assert.deepStrictEqual(all.map((r) => r.id), ['f', 'c', 'd', 'b']);
});
