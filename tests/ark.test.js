'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { startMockArk } = require('../tools/mock-ark.js');
const { buildMessages, callArk, recognize } = require('../server/ark.js');

function freePort() {
  return new Promise((resolve) => {
    const net = require('node:net');
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

async function withMock(scenario, fn) {
  const port = await freePort();
  const srv = await startMockArk(port, scenario);
  try {
    return await fn({ baseUrl: `http://127.0.0.1:${port}/api/v3`, apiKey: 'test-key', model: 'test-model' });
  } finally {
    await new Promise((r) => srv.close(r));
  }
}

test('buildMessages 生成 data-url 图片 + 文本指令', () => {
  const msgs = buildMessages('QUJD');
  const c = msgs[0].content;
  assert.ok(Array.isArray(c));
  assert.strictEqual(c[0].image_url.url, 'data:image/jpeg;base64,QUJD');
  assert.ok(c[1].text.includes('JSON'));
  // 已带前缀的不重复包装
  const msgs2 = buildMessages('data:image/png;base64,QUJD');
  assert.strictEqual(msgs2[0].content[0].image_url.url, 'data:image/png;base64,QUJD');
});

test('callArk 正常返回内容', async () => {
  await withMock('ok', async (cfg) => {
    const r = await callArk(Object.assign({ imageBase64: 'QUJD' }, cfg));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.httpStatus, 200);
    assert.ok(r.content.includes('牛奶'));
  });
});

test('recognize 全链路：fenced 响应解析 + 数据库收缩(60→7)', async () => {
  await withMock('fenced', async (cfg) => {
    const r = await recognize(cfg, 'QUJD');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.isFood, true);
    assert.strictEqual(r.items.length, 1);
    assert.strictEqual(r.items[0].name, '牛奶');
    assert.strictEqual(r.items[0].fridgeDays, 7);   // 收缩到数据库保守值
    assert.strictEqual(r.items[0].adjusted, true);
  });
});

test('recognize 非食物', async () => {
  await withMock('notfood', async (cfg) => {
    const r = await recognize(cfg, 'QUJD');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.isFood, false);
    assert.deepStrictEqual(r.items, []);
  });
});

test('callArk 401 → recognize ok:false', async () => {
  await withMock('error401', async (cfg) => {
    const r = await recognize(cfg, 'QUJD');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.httpStatus, 401);
    assert.ok(r.error);
  });
});

test('callArk 超时中断', async () => {
  await withMock('timeout', async (cfg) => {
    const r = await callArk(Object.assign({ imageBase64: 'QUJD', timeoutMs: 150 }, cfg));
    assert.strictEqual(r.ok, false);
    assert.ok(/超时|timeout|abort/i.test(r.error));
  });
});
