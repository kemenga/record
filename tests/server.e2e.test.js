'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { startMockArk } = require('../tools/mock-ark.js');
const { createApp } = require('../server/index.js');

function freePort() {
  return new Promise((resolve) => {
    const net = require('node:net');
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

async function start(config) {
  const app = await createApp(config);
  const port = await freePort();
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  return { srv, base: 'http://127.0.0.1:' + port };
}

test('e2e: health + recognize 全链路 + 错误分支', async (t) => {
  const arkPort = await freePort();
  const ark = await startMockArk(arkPort, 'ok');
  t.after(() => new Promise((r) => ark.close(r)));
  const config = {
    arkBaseUrl: 'http://127.0.0.1:' + arkPort + '/api/v3',
    arkApiKey: 'test-key',
    arkModel: 'test-model'
  };
  const { srv, base } = await start(config);
  t.after(() => new Promise((r) => srv.close(r)));

  // health
  let res = await fetch(base + '/api/health');
  assert.strictEqual(res.status, 200);
  const h = await res.json();
  assert.strictEqual(h.ok, true);
  assert.strictEqual(h.model, 'test-model');
  assert.strictEqual(h.hasKey, true);

  // 正常识别（mock 返回牛奶60天 → 数据库收缩为7）
  res = await fetch(base + '/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: 'A'.repeat(64) })
  });
  assert.strictEqual(res.status, 200);
  const r = await res.json();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.foods[0].name, '牛奶');
  assert.strictEqual(r.foods[0].fridgeDays, 7);

  // 缺图 → 400
  res = await fetch(base + '/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);

  // 超大图（base64 > 8MB）→ 413
  res = await fetch(base + '/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: 'A'.repeat(9 * 1024 * 1024) })
  });
  assert.strictEqual(res.status, 413);

  // 坏 JSON → 400
  res = await fetch(base + '/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{oops'
  });
  assert.strictEqual(res.status, 400);

  // 未知路径 → 404
  res = await fetch(base + '/api/nope');
  assert.strictEqual(res.status, 404);
});

test('e2e: 无 key → health.hasKey=false, recognize 503', async (t) => {
  const arkPort = await freePort();
  const ark = await startMockArk(arkPort, 'ok');
  t.after(() => new Promise((r) => ark.close(r)));
  const { srv, base } = await start({ arkBaseUrl: 'http://127.0.0.1:' + arkPort + '/api/v3', arkApiKey: '', arkModel: 'm' });
  t.after(() => new Promise((r) => srv.close(r)));

  const h = await (await fetch(base + '/api/health')).json();
  assert.strictEqual(h.hasKey, false);
  const res = await fetch(base + '/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: 'A'.repeat(64) })
  });
  assert.strictEqual(res.status, 503);
  const r = await res.json();
  assert.ok(r.error.includes('ARK_API_KEY'));
});

test('e2e: 上游 401 → 502 且透出错误信息', async (t) => {
  const arkPort = await freePort();
  const ark = await startMockArk(arkPort, 'error401');
  t.after(() => new Promise((r) => ark.close(r)));
  const { srv, base } = await start({ arkBaseUrl: 'http://127.0.0.1:' + arkPort + '/api/v3', arkApiKey: 'test-key', arkModel: 'm' });
  t.after(() => new Promise((r) => srv.close(r)));

  const res = await fetch(base + '/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: 'A'.repeat(64) })
  });
  assert.strictEqual(res.status, 502);
});

test('e2e: --mock 模式无 key 也能识别', async (t) => {
  const { srv, base } = await start({ arkApiKey: '', arkModel: 'm', mock: true });
  t.after(() => new Promise((r) => srv.close(r)));
  const h = await (await fetch(base + '/api/health')).json();
  assert.strictEqual(h.hasKey, true);
  assert.strictEqual(h.model, 'mock');
  const res = await fetch(base + '/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: 'A'.repeat(64) })
  });
  assert.strictEqual(res.status, 200);
  const r = await res.json();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.foods[0].name, '演示牛奶');
});
