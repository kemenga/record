'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildStats, forecastDays } = require('../miniprogram/services/stats.js');

const DAY = 86400000;
const now = 1726670000000;

test('buildStats：食用/丢弃计数与节约估算', () => {
  const all = [
    { id: '1', eatenAt: now - DAY, expiryAt: now + 5 * DAY },   // 及早食用（未过期吃掉）
    { id: '2', eatenAt: now - DAY, expiryAt: now - 2 * DAY },   // 过期后才吃（算丢弃）
    { id: '3', expiryAt: now - DAY },                            // 在库已过期
    { id: '4', expiryAt: now + 3 * DAY },
    { id: '5', removedAs: 'expired', expiryAt: now - 3 * DAY }   // 过期清除
  ];
  const s = buildStats(all, now, 40);   // 单价假设 40 元/样（可调）
  assert.strictEqual(s.eaten, 2);
  assert.strictEqual(s.eatenInTime, 1);
  assert.strictEqual(s.wasted, 3);       // 过期后才吃 + 在库过期 + 过期清除
  assert.strictEqual(s.active, 1);
  assert.ok(s.savedMoney >= 40);         // 至少及早食用那笔
});

test('forecastDays：未来7天到期分布（含今天/已过期桶）', () => {
  const all = [
    { expiryAt: now - DAY },            // 已过期桶（超过1天）
    { expiryAt: now - DAY * 0.5 },      // 今天（过期不足一天，剩0天）
    { expiryAt: now + DAY },             // 明天（剩1天整）
    { expiryAt: now + DAY * 6.5 },      // 第7天
    { expiryAt: now + DAY * 9 },        // 超范围
    { eatenAt: now, expiryAt: now + DAY } // 已食用不计
  ];
  const f = forecastDays(all, now, 7);
  assert.strictEqual(f[0].count, 1);    // 已过期
  assert.strictEqual(f[1].count, 1);    // 今天（剩0天）
  assert.strictEqual(f[2].count, 1);    // 明天
  assert.strictEqual(f[8].count, 1);    // 第7天（剩7天）
  assert.strictEqual(f[0].label, '过期');
  assert.strictEqual(f[1].label, '今天');
  assert.strictEqual(f[8].label, '7天');
  assert.strictEqual(f.length, 9);
});
