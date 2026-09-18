'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { CATEGORIES, ZONES, DB, findFood } = require('../miniprogram/data/shelf-life-db.js');

const DAY_LIMITS = { room: 365, fridge: 90, freezer: 365 }; // 常温放宽：米面粮油可存数月

test('DB 规模与结构完整性', () => {
  assert.ok(DB.length >= 150, `应有至少150条，实际 ${DB.length}`);
  const names = new Set();
  for (const item of DB) {
    assert.ok(item.name && typeof item.name === 'string', `条目缺 name: ${JSON.stringify(item)}`);
    assert.ok(!names.has(item.name), `名称重复: ${item.name}`);
    names.add(item.name);
    assert.ok(CATEGORIES.some((c) => c.key === item.category), `非法 category: ${item.name}=${item.category}`);
    for (const zone of ['room', 'fridge', 'freezer']) {
      const v = item[zone];
      assert.ok(v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= DAY_LIMITS[zone]),
        `${item.name}.${zone} 非法: ${v}`);
    }
    assert.ok(item.fridge !== null || item.room !== null || item.freezer !== null, `${item.name} 三区全为 null`);
    if (item.aliases !== undefined) assert.ok(Array.isArray(item.aliases), `${item.name} aliases 非数组`);
  }
});

test('类别与分区元数据', () => {
  assert.strictEqual(CATEGORIES.length, 10);
  assert.ok(CATEGORIES.every((c) => c.key && c.label && c.icon));
  assert.deepStrictEqual(ZONES.map((z) => z.key), ['fridge', 'freezer', 'room']);
  assert.ok(ZONES.every((z) => z.label));
});

test('findFood 精确名与别名匹配', () => {
  const t = findFood('西红柿');
  assert.ok(t && t.name === '西红柿');
  assert.ok(findFood('番茄'));          // alias 命中
  assert.ok(findFood('洋芋') && findFood('洋芋').name === '土豆');
  assert.ok(findFood('马蹄') && findFood('马蹄').name === '荸荠');
  assert.ok(findFood('海蛎') && findFood('海蛎').name === '生蚝');
  assert.ok(findFood('樱桃番茄') && findFood('樱桃番茄').name === '圣女果');
  assert.strictEqual(findFood('不存在食物'), null);
});

test('常识抽查：鸡蛋/生肉/牛奶天数符合 USDA 区间', () => {
  const egg = findFood('鸡蛋');
  assert.ok(egg.fridge >= 21 && egg.fridge <= 40, `鸡蛋冷藏 ${egg.fridge} 天超常识区间`);
  const pork = findFood('猪肉');
  assert.ok(pork.fridge >= 2 && pork.fridge <= 5, `生猪肉冷藏 ${pork.fridge} 天超常识区间`);
  const milk = findFood('牛奶');
  assert.ok(milk.fridge >= 5 && milk.fridge <= 10, `牛奶冷藏 ${milk.fridge} 天超常识区间`);
});
