'use strict';
/**
 * 假的火山方舟服务（测试/演示用）
 * 场景（scenario）：
 *   ok      —— 返回合法 JSON 内容（含牛奶60天，用于验证 reconcile 收缩到数据库的7天）
 *   fenced  —— 用 ```json 围栏包裹（验证解析容错）
 *   notfood —— isFood:false
 *   error401—— 返回 401
 *   timeout —— 挂起 5 秒（验证客户端超时）
 * CLI：node tools/mock-ark.js [port]
 */
const http = require('node:http');

const PAYLOAD_OK = JSON.stringify({
  isFood: true,
  confidence: 0.88,
  scene: '厨房台面上的食物',
  items: [
    { name: '牛奶', category: 'dairy', roomDays: null, fridgeDays: 60, freezerDays: 90, tips: '开封后尽快饮用' }
  ]
});

function buildContent(scenario) {
  switch (scenario) {
    case 'fenced':
      return '识别结果：\n```json\n' + PAYLOAD_OK + '\n```\n请参考';
    case 'notfood':
      return JSON.stringify({ isFood: false, confidence: 0.95, items: [] });
    default:
      return PAYLOAD_OK;
  }
}

function startMockArk(port, scenario) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 20 * 1024 * 1024) req.destroy(); chunks.push(c); });
    req.on('end', () => {
      const auth = req.headers.authorization || '';
      if (scenario === 'error401' || auth !== 'Bearer test-key') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
        return;
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { body = null; }
      const content0 = body && body.messages && body.messages[0] && body.messages[0].content;
      const hasImage = Array.isArray(content0) && content0.some((p) => p.type === 'image_url' && /^data:image\/[a-z]+;base64,/.test(p.image_url.url));
      if (!hasImage) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'missing image' } }));
        return;
      }
      if (scenario === 'timeout') return; // 挂起不响应
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: buildContent(scenario) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startMockArk };

if (require.main === module) {
  const port = Number(process.argv[2]) || 9100;
  startMockArk(port, process.env.SCENARIO || 'ok').then(() => {
    console.log(`mock-ark listening on http://127.0.0.1:${port} (scenario=${process.env.SCENARIO || 'ok'})`);
  });
}
