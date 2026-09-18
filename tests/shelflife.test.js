'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { getStatus, getDaysLeft, getProgress, groupFoods, pickEatFirst, openPatch, applyOpened } = require('../miniprogram/services/shelflife.js');

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

test('开封状态：openPatch 默认天数按分类（乳制品3/熟食2/默认7）', () => {
  const now2 = now;
  const milk = { name: '牛奶', category: 'dairy', expiryAt: now + 5 * DAY, shelfDays: 7 };
  const p1 = openPatch(milk, now2);
  assert.strictEqual(p1.openedAt, now2);
  assert.strictEqual(p1.openedDays, 3);        // dairy → 3
  const cooked = { name: '剩菜', category: 'cooked', expiryAt: now + 2 * DAY, shelfDays: 3 };
  assert.strictEqual(openPatch(cooked, now2).openedDays, 2);
  const apple = { name: '苹果', category: 'fruit', expiryAt: now + 10 * DAY, shelfDays: 14 };
  assert.strictEqual(openPatch(apple, now2).openedDays, 7);   // 默认 7
  // 指定天数覆盖默认
  assert.strictEqual(openPatch(milk, now2, 5).openedDays, 5);
});

test('applyOpened：开封后到期日/时长按开封窗口计算，原记录不变', () => {
  const milk = { id: 'm', name: '牛奶', category: 'dairy', expiryAt: now + 5 * DAY, shelfDays: 7 };
  const openedAt = now - 4 * DAY;                       // 4天前开封，开封3天 → 1天前已过期
  const v = applyOpened(Object.assign({}, milk, { openedAt: openedAt, openedDays: 3 }));
  assert.strictEqual(v.expiryAt, openedAt + 3 * DAY);
  assert.strictEqual(v.shelfDays, 3);
  assert.strictEqual(v.opened, true);
  assert.strictEqual(getStatus(v.expiryAt, now, 3), 'expired');
  assert.strictEqual(milk.expiryAt, now + 5 * DAY);      // 原对象不变
  // 未开封记录原样透传
  const v2 = applyOpened(milk);
  assert.strictEqual(v2.expiryAt, milk.expiryAt);
  assert.ok(!v2.opened);
});

test('applyOpened：开封窗口晚于原到期日时取更晚者（不提前过期）', () => {
  // 原到期日在3天后，今天开封+2天窗口 → 生效到期日=2天后（早于原到期，取开封窗口）
  const a = applyOpened({ expiryAt: now + 3 * DAY, shelfDays: 30, openedAt: now, openedDays: 2 });
  assert.strictEqual(a.expiryAt, now + 2 * DAY);
  // 原到期日在1天后，今天开封+7天窗口 → 保鲜期不应比原到期更短？→ 取更晚（原到期）
  const b = applyOpened({ expiryAt: now + 1 * DAY, shelfDays: 30, openedAt: now, openedDays: 7 });
  assert.strictEqual(b.expiryAt, now + 7 * DAY);  // 开封后按开封窗口算（更晚）——语义：开封窗口即新寿命
});
