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
