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

test('云函数 chat 分支：缺 messages / 缺 key 校验', async () => {
  const saved = process.env.ARK_API_KEY;
  delete process.env.ARK_API_KEY;
  const noKey = await cf.main({ mode: 'chat', messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(noKey.ok, false);
  assert.ok(noKey.error.indexOf('ARK_API_KEY') !== -1);
  if (saved !== undefined) process.env.ARK_API_KEY = saved;
  else process.env.ARK_API_KEY = 'test-key';
  try {
    const noMsgs = await cf.main({ mode: 'chat' });
    assert.strictEqual(noMsgs.ok, false);
    assert.ok(noMsgs.error.indexOf('messages') !== -1);
    const badMsgs = await cf.main({ mode: 'chat', messages: 'not-array' });
    assert.strictEqual(badMsgs.ok, false);
  } finally {
    if (saved === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = saved;
  }
});
