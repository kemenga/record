'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { NUTRITION, CATEGORY_FALLBACK, getNutrition } = require('../miniprogram/data/nutrition-db.js');
const { DB, findFood } = require('../miniprogram/data/shelf-life-db.js');

test('营养库完整性：数值合法且名称可在保鲜库中解析', () => {
  assert.ok(Object.keys(NUTRITION).length >= 80);
  for (const [name, n] of Object.entries(NUTRITION)) {
    assert.ok(findFood(name), `营养库名称「${name}」无法在保鲜库解析`);
    assert.ok(n.kcal >= 0 && n.kcal <= 900, name + ' kcal 非法');
    for (const k of ['protein', 'fat', 'carbs', 'fiber']) {
      assert.ok(n[k] >= 0 && n[k] <= 100, `${name}.${k} 非法`);
    }
  }
});

test('getNutrition：精确 > 别名归一 > 分类兜底', () => {
  const apple = getNutrition('苹果');
  assert.strictEqual(apple.kcal, 52);
  assert.strictEqual(apple.source, 'exact');
  // 番茄是西红柿别名 → 归一后精确命中
  const tomato = getNutrition('番茄');
  assert.strictEqual(tomato.kcal, 18);
  assert.strictEqual(tomato.source, 'exact');
  // 未收录（保鲜库有、营养库没有，如秋葵）→ 按蔬菜类别兜底
  const okra = getNutrition('秋葵');
  assert.strictEqual(okra.source, 'category');
  assert.ok(okra.kcal > 0);
  // 库外名称 → other 兜底
  assert.strictEqual(getNutrition('外星食物').source, 'category');
});
