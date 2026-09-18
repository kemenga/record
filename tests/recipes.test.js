'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { RECIPES } = require('../miniprogram/data/recipes-db.js');
const { suggestRecipes } = require('../miniprogram/services/recipes.js');
const { findFood } = require('../miniprogram/data/shelf-life-db.js');

const DAY = 86400000;
const now = 1726670000000;

test('菜谱库完整性：名称唯一、用料为库内规范名', () => {
  assert.ok(RECIPES.length >= 35);
  const names = new Set();
  for (const r of RECIPES) {
    assert.ok(r.name && !names.has(r.name), '菜名缺失或重复: ' + r.name);
    names.add(r.name);
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length >= 1 && r.ingredients.length <= 5);
    for (const ing of r.ingredients) {
      assert.ok(findFood(ing), `用料「${ing}」不在保鲜库中（菜谱：${r.name}）`);
    }
  }
});

test('suggestRecipes：临期优先排序、别名归一、限量', () => {
  const records = [
    { name: '番茄', expiryAt: now + 2 * DAY, addedAt: now },        // 别名→西红柿，临期
    { name: '鸡蛋', expiryAt: now + 30 * DAY, addedAt: now },       // 新鲜
    { name: '土豆', expiryAt: now + 20 * DAY, addedAt: now },
    { name: '牛肉', expiryAt: now + 60 * DAY, addedAt: now },
    { name: '已吃掉的虾', expiryAt: now + 1 * DAY, addedAt: now, eatenAt: now } // 已食用不算
  ];
  const out = suggestRecipes(records, now, 3, 10);
  assert.ok(out.length >= 3);
  // 用了临期西红柿的菜排最前
  assert.strictEqual(out[0].name, '西红柿炒鸡蛋');
  assert.strictEqual(out[0].useExpiring, 1);
  assert.ok(out[0].expiringNames.includes('西红柿'));
  // 蛋炒饭/紫菜蛋花汤只匹配鸡蛋，不应出现在用了双料的菜之前
  const names = out.map((r) => r.name);
  assert.ok(names.includes('土豆炖牛肉'));
  assert.ok(!names.includes('白灼虾')); // 虾已食用
});

test('suggestRecipes：无匹配返回空、limit 生效', () => {
  assert.deepStrictEqual(suggestRecipes([{ name: '可乐', expiryAt: now + 80 * DAY, addedAt: now }], now, 3, 5).map((r) => r.name), ['可乐鸡翅']);
  assert.deepStrictEqual(suggestRecipes([], now, 3, 5), []);
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ name: '猪肉', expiryAt: now + 99 * DAY, addedAt: now, id: 'p' + i });
  assert.ok(suggestRecipes(many, now, 3, 5).length <= 5);
});
