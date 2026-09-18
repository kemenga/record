'use strict';
/**
 * 火山方舟 Ark 客户端（零依赖，Node 18+ 内置 fetch）
 * API：POST {ARK_BASE_URL}/chat/completions，OpenAI 兼容协议
 * 复用小程序侧解析/钳制逻辑（CommonJS 相对路径引用）
 */

const { parseAiFoodResult, reconcileWithDb } = require('../miniprogram/services/parse.js');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seed-1-6-vision-250815';

const TASK_PROMPT = [
  '你是食材保鲜专家。请分析图片中的食物，严格按以下 JSON 格式输出，禁止输出 JSON 以外的任何内容：',
  '{"isFood":true或false,"confidence":0到1的小数,"scene":"一句话描述场景","items":[{"name":"食物名","category":"vegetable|fruit|meat|seafood|dairy|egg|cooked|staple|snack|other","roomDays":常温建议天数或null,"fridgeDays":冷藏建议天数或null,"freezerDays":冷冻建议天数或null,"tips":"一句话储存建议"}]}',
  '规则：',
  '1. 只识别可食用的食物；非食物或无法判断时 isFood=false 且 items=[]。',
  '2. 天数为建议保鲜天数（冷藏按4°C、冷冻按-18°C、常温为阴凉干燥处），参考 USDA FoodKeeper，拿不准时取保守值（偏小）。',
  '3. 常温不超过365天、冷藏不超过90天、冷冻不超过365天。',
  '4. 图片中有多种食物时全部列出，最多8种；name 用不超过10字的通用中文名。',
  '5. 注意区分生鲜与熟食（如生鸡肉与熟鸡肉保鲜期差异大），name 中体现"生/熟/开封/未开封"等关键状态。',
  '6. tips 不超过50字。'
].join('\n');

function buildMessages(imageBase64) {
  const url = /^data:image\//i.test(imageBase64)
    ? imageBase64
    : 'data:image/jpeg;base64,' + imageBase64;
  return [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url } },
        { type: 'text', text: TASK_PROMPT }
      ]
    }
  ];
}

/**
 * 调用 Ark Chat Completions
 * @returns {ok, httpStatus, content} 或 {ok:false, httpStatus, error}
 */
async function callArk({ baseUrl = DEFAULT_BASE_URL, apiKey, model = DEFAULT_MODEL, imageBase64, timeoutMs = 45000 }) {
  if (!apiKey) return { ok: false, httpStatus: 0, error: '缺少 ARK_API_KEY' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(imageBase64),
        temperature: 0.2,
        max_tokens: 1500
      }),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = '上游错误 ' + res.status;
      try { const j = JSON.parse(text); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* 忽略 */ }
      return { ok: false, httpStatus: res.status, error: msg };
    }
    const data = JSON.parse(text);
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string') return { ok: false, httpStatus: res.status, error: '上游响应缺少 content' };
    return { ok: true, httpStatus: res.status, content };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')));
    return { ok: false, httpStatus: 0, error: aborted ? '请求超时（' + timeoutMs + 'ms）' : '网络错误：' + (err && err.message) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 识别 + 解析 + 数据库收缩 全链路
 * @returns {ok, isFood, confidence, scene, items[]} 或 {ok:false, error, httpStatus?}
 */
async function recognize(cfg, imageBase64) {
  const r = await callArk(Object.assign({}, cfg, { imageBase64 }));
  if (!r.ok) return { ok: false, error: r.error, httpStatus: r.httpStatus };
  const parsed = parseAiFoodResult(r.content);
  if (!parsed.ok) return { ok: false, error: '模型输出解析失败：' + parsed.error, httpStatus: 200 };
  parsed.items = parsed.items.map(reconcileWithDb);
  return parsed;
}

module.exports = { DEFAULT_BASE_URL, DEFAULT_MODEL, TASK_PROMPT, buildMessages, callArk, recognize };
