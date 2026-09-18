'use strict';
const test = require('node:test');
const assert = require('node:assert');
const cf = require('../cloudfunctions/recognize/index.js');

test('云函数：缺图/短图被拒', async () => {
  let r = await cf.main({});
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.indexOf('imageBase64') !== -1);

  r = await cf.main({ imageBase64: 'too-short' });
  assert.strictEqual(r.ok, false);

  r = await cf.main({ imageBase64: 'A'.repeat(9 * 1024 * 1024) });
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.indexOf('8MB') !== -1);
});

test('云函数：未配置 ARK_API_KEY 时返回明确错误（不打网络）', async () => {
  const saved = process.env.ARK_API_KEY;
  delete process.env.ARK_API_KEY;
  try {
    const r = await cf.main({ imageBase64: 'A'.repeat(64) });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.indexOf('ARK_API_KEY') !== -1);
  } finally {
    if (saved !== undefined) process.env.ARK_API_KEY = saved;
  }
});
