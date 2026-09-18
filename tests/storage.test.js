'use strict';
const test = require('node:test');
const assert = require('node:assert');

/** mock wx 环境（内存版 storage） */
function installMockWx() {
  const mem = Object.create(null);
  global.wx = {
    setStorageSync: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); },
    getStorageSync: (k) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : '')
  };
  return () => { delete global.wx; };
}

test('storage：增查改删/已食用/默认设置合并', async (t) => {
  const restore = installMockWx();
  t.after(restore);
  delete require.cache[require.resolve('../miniprogram/services/storage.js')];
  const s = require('../miniprogram/services/storage.js');

  // 默认设置
  const def = s.getSettings();
  assert.strictEqual(def.remindDays, 3);
  assert.strictEqual(def.aiMode, 'local');
  assert.strictEqual(def.aiBaseUrl, 'http://127.0.0.1:3000');
  // 设置合并：未给字段保留默认
  s.saveSettings({ remindDays: 5 });
  assert.strictEqual(s.getSettings().remindDays, 5);
  assert.strictEqual(s.getSettings().aiMode, 'local');

  // 保存食物
  const now = 1726670000000;
  const rec = s.saveFood({
    name: '牛奶', category: 'dairy', zone: 'fridge', shelfDays: 7,
    addedAt: now, expiryAt: now + 7 * 86400000, source: 'ai'
  });
  assert.ok(/^f_/.test(rec.id));
  assert.strictEqual(s.listFoods().length, 1);
  assert.strictEqual(s.getFood(rec.id).name, '牛奶');

  // 已食用默认不列出
  s.markEaten(rec.id);
  assert.strictEqual(s.listFoods().length, 0);
  assert.strictEqual(s.listFoods(true).length, 1);
  assert.ok(s.getFood(rec.id).eatenAt > 0);

  // 更新
  s.updateFood(rec.id, { name: '鲜牛奶', shelfDays: 10 });
  assert.strictEqual(s.getFood(rec.id).name, '鲜牛奶');

  // 删除
  s.removeFood(rec.id);
  assert.strictEqual(s.getFood(rec.id), null);
  assert.strictEqual(s.listFoods(true).length, 0);
});

test('storage：saveFood 补齐时间戳与字段、id 唯一', async (t) => {
  const restore = installMockWx();
  t.after(restore);
  delete require.cache[require.resolve('../miniprogram/services/storage.js')];
  const s = require('../miniprogram/services/storage.js');
  const a = s.saveFood({ name: 'A', zone: 'room', shelfDays: 5, addedAt: 1, expiryAt: 2 });
  const b = s.saveFood({ name: 'B', zone: 'room', shelfDays: 5, addedAt: 1, expiryAt: 2 });
  assert.notStrictEqual(a.id, b.id);
  assert.ok(a.createdAt > 0 && a.updatedAt > 0 && a.eatenAt === null);
});

test('storage：最近添加名称（去重、最新在前、上限5）', async (t) => {
  const restore = installMockWx();
  t.after(restore);
  delete require.cache[require.resolve('../miniprogram/services/storage.js')];
  const s = require('../miniprogram/services/storage.js');
  assert.deepStrictEqual(s.getRecentNames(), []);
  s.pushRecentName(' 牛奶 ');
  s.pushRecentName('西兰花');
  s.pushRecentName('牛奶');           // 重复 → 去重后置顶
  s.pushRecentName('鸡蛋');
  s.pushRecentName('豆腐');
  s.pushRecentName('猪肉');
  s.pushRecentName('排骨');           // 超过5个 → 挤掉最旧的
  assert.deepStrictEqual(s.getRecentNames(), ['排骨', '猪肉', '豆腐', '鸡蛋', '牛奶']);
});

test('storage：importFoods 合并导入（跳过冲突）', async (t) => {
  const restore = installMockWx();
  t.after(restore);
  delete require.cache[require.resolve('../miniprogram/services/storage.js')];
  const s = require('../miniprogram/services/storage.js');
  const a = s.saveFood({ name: 'A', zone: 'room', shelfDays: 5, addedAt: 1, expiryAt: 2 });
  const r = s.importFoods([
    { id: a.id, name: 'A重复', expiryAt: 3, addedAt: 3 },
    { name: 'B', expiryAt: 1726670000000, addedAt: 1726670000000 }
  ]);
  assert.strictEqual(r.merged, 1);
  assert.strictEqual(r.skipped, 1);
  assert.strictEqual(s.listFoods(true).length, 2);
  assert.strictEqual(s.getFood(a.id).name, 'A');   // 冲突条目未覆盖
});

test('storage：采购清单增删改查/去重/已买筛选', async (t) => {
  const restore = installMockWx();
  t.after(restore);
  delete require.cache[require.resolve('../miniprogram/services/storage.js')];
  const s = require('../miniprogram/services/storage.js');
  assert.deepStrictEqual(s.listShopping(), []);
  s.addShopping(' 牛奶 ');
  s.addShopping('牛奶');                    // 去重
  s.addShopping('鸡蛋');
  assert.strictEqual(s.listShopping().length, 2);
  const item = s.listShopping()[0];
  s.toggleShopping(item.id);                // 勾选
  assert.strictEqual(s.listShopping(true).filter((x) => x.id === item.id)[0].done, true);
  assert.strictEqual(s.listShopping().length, 1);        // 默认不含已买
  s.removeShopping(item.id);
  assert.strictEqual(s.listShopping(true).length, 1);
});
