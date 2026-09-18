'use strict';
/**
 * 零依赖 HTTP 代理（开发调试用）
 *   GET  /api/health    → {ok, model, hasKey}
 *   POST /api/recognize → {imageBase64} → {ok, isFood, confidence, scene, foods[]}
 * 启动：node server/index.js  （读取环境变量与 server/.env）
 *   PORT 默认 3000；ARK_API_KEY 必填；ARK_BASE_URL / ARK_MODEL 可选
 */

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_BASE_URL, DEFAULT_MODEL, recognize } = require('./ark.js');

const MAX_BODY = 12 * 1024 * 1024;      // 请求体上限 12MB
const MAX_IMAGE_B64 = 8 * 1024 * 1024;  // base64 字符串上限 8MB

/** 极简 .env 加载（KEY=VALUE 每行一条，# 注释）
 * 注意：.env 的值【覆盖】已存在的系统环境变量——本机 shell 配置可能残留
 * 旧 ARK_API_KEY 导出，以 .env 文件为准可避免用到失效 Key。 */
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* .env 缺失或不可读均可忽略 */ }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

/** mock 演示模式返回的固定数据（--mock 启动时使用，无需真实 Key） */
const MOCK_FOOD = {
  ok: true,
  isFood: true,
  confidence: 0.5,
  scene: 'mock 演示模式',
  foods: [
    { name: '演示牛奶', category: 'dairy', roomDays: null, fridgeDays: 7, freezerDays: 90, tips: '演示数据：node server/index.js --mock', adjusted: false }
  ]
};
const MOCK_RECEIPT = {
  ok: true,
  isFood: true,
  confidence: 0.5,
  scene: 'mock 小票演示',
  foods: [
    { name: '演示牛奶', category: 'dairy', roomDays: null, fridgeDays: 7, freezerDays: 90, tips: '×2', adjusted: false },
    { name: '演示西兰花', category: 'vegetable', roomDays: 2, fridgeDays: 7, freezerDays: 300, tips: '', adjusted: false }
  ]
};

/** 构造请求处理函数（config 可覆盖环境变量，便于测试注入） */
async function createApp(config) {
  const cfg = Object.assign({
    arkBaseUrl: process.env.ARK_BASE_URL || DEFAULT_BASE_URL,
    arkApiKey: process.env.ARK_API_KEY || '',
    arkModel: process.env.ARK_MODEL || DEFAULT_MODEL,
    reasoningEffort: process.env.ARK_REASONING_EFFORT === undefined ? 'low' : process.env.ARK_REASONING_EFFORT,
    mock: process.env.ARK_MOCK === '1'
  }, config || {});

  return async function handler(req, res) {
    const url = (req.url || '').split('?')[0];
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (url === '/api/health' && req.method === 'GET') {
      const keyTail = (cfg.mock ? 'mock' : (cfg.arkApiKey ? '****' + cfg.arkApiKey.slice(-4) : ''));
      send(res, 200, { ok: true, model: cfg.mock ? 'mock' : cfg.arkModel, hasKey: Boolean(keyTail), keyTail: keyTail });
      return;
    }

    if (url === '/api/recognize' && req.method === 'POST') {
      if (!cfg.mock && !cfg.arkApiKey) { send(res, 503, { ok: false, error: '服务端未配置 ARK_API_KEY（请在 server/.env 或环境变量中设置）' }); return; }
      let body;
      try {
        body = JSON.parse(await readBody(req) || '{}');
      } catch (e) {
        if (e.statusCode === 413) { send(res, 413, { ok: false, error: '请求体超过 12MB 上限' }); return; }
        send(res, 400, { ok: false, error: '请求体不是合法 JSON' });
        return;
      }
      const img = body && body.imageBase64;
      if (typeof img !== 'string' || img.length < 32) { send(res, 400, { ok: false, error: '缺少 imageBase64 字段' }); return; }
      if (img.length > MAX_IMAGE_B64) { send(res, 413, { ok: false, error: '图片超过 8MB 上限，请压缩后重试' }); return; }

      const mode = body.mode === 'receipt' ? 'receipt' : 'food';
      if (cfg.mock) { send(res, 200, mode === 'receipt' ? MOCK_RECEIPT : MOCK_FOOD); return; }

      const t0 = Date.now();
      const r = await recognize({
        baseUrl: cfg.arkBaseUrl, apiKey: cfg.arkApiKey, model: cfg.arkModel,
        timeoutMs: 50000, mode: mode, reasoningEffort: cfg.reasoningEffort
      }, img);
      console.log(`[recognize] mode=${mode} img=${Math.round(img.length / 1024)}KB 耗时=${Date.now() - t0}ms ok=${r.ok}` + (r.ok ? ` 条数=${r.items.length}` : ` err=${r.error}`));
      if (!r.ok) { send(res, 502, { ok: false, error: r.error }); return; }
      send(res, 200, {
        ok: true,
        isFood: r.isFood,
        confidence: r.confidence,
        scene: r.scene,
        foods: r.items
      });
      return;
    }

    send(res, 404, { ok: false, error: 'not found' });
  };
}

async function main() {
  loadEnvFile(path.join(__dirname, '.env'));
  // --port N 命令行参数优先级最高（.env 会覆盖 shell 环境变量，命令行参数再覆盖 .env）
  const portArg = process.argv.indexOf('--port') !== -1 ? Number(process.argv[process.argv.indexOf('--port') + 1]) : NaN;
  const mockMode = process.argv.includes('--mock') || process.env.ARK_MOCK === '1';
  const app = await createApp(mockMode ? { mock: true } : {});
  const port = Number.isFinite(portArg) && portArg > 0 ? portArg : (Number(process.env.PORT) || 3000);
  require('node:http').createServer(app).on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[freshrec-server] 端口 ${port} 已被占用：可能已有一个鲜记 server 在运行。`);
      console.error('  换端口：PORT=3001 node server/index.js   或先结束旧进程。');
    } else {
      console.error('[freshrec-server] 启动失败：' + (err && err.message));
    }
    process.exit(1);
  }).listen(port, '0.0.0.0', () => {
    console.log(`[freshrec-server] http://127.0.0.1:${port}`);
    if (mockMode) {
      console.log('  ⚙ mock 演示模式：无需 ARK_API_KEY，/api/recognize 返回固定演示数据');
      return;
    }
    console.log(`  model=${process.env.ARK_MODEL || DEFAULT_MODEL}  hasKey=${Boolean(process.env.ARK_API_KEY)}`);
    if (!process.env.ARK_API_KEY) {
      console.log('  ⚠ 未检测到 ARK_API_KEY。复制 server/.env.example 为 server/.env 并填入你的火山方舟 API Key。');
    }
  });
}

if (require.main === module) main();

module.exports = { createApp, loadEnvFile };
