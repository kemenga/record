'use strict';
/**
 * 云函数：recognize —— 火山方舟视觉识别（自包含、零依赖，Node https 实现）
 * 部署后在云开发控制台为该函数配置环境变量：
 *   ARK_API_KEY（必填）、ARK_MODEL（默认 doubao-seed-1-6-vision-250815）、
 *   ARK_BASE_URL（默认 https://ark.cn-beijing.volces.com/api/v3）
 * 返回结构与本地代理 /api/recognize 完全一致：{ok,isFood,confidence,scene,foods[]}
 *
 * 注意：解析/钳制逻辑与 miniprogram/services/parse.js 保持同义（云函数需自包含，无相对引用）；
 * 若调整提示词或钳制规则，请同步修改两处。
 */

const https = require('https');

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

const DAY_LIMITS = { room: 365, fridge: 90, freezer: 365 };
const CATEGORY_KEYS = ['vegetable', 'fruit', 'meat', 'seafood', 'dairy', 'egg', 'cooked', 'staple', 'snack', 'other'];

const RECEIPT_PROMPT = [
  '你是购物小票识别助手。请分析图片中的购物小票/收据，提取其中所有【食品类商品】，严格按以下 JSON 格式输出，禁止输出 JSON 以外的任何内容：',
  '{"isFood":true或false,"confidence":0到1的小数,"scene":"一句话概括小票内容","items":[{"name":"食品名(不超过10字)","category":"vegetable|fruit|meat|seafood|dairy|egg|cooked|staple|snack|other","roomDays":常温建议天数或null,"fridgeDays":冷藏建议天数或null,"freezerDays":冷冻建议天数或null,"tips":"数量/规格等备注，不超过30字"}]}',
  '规则：',
  '1. 只提取食品/饮料/生鲜，忽略日用品、文具等非食品；小票中无食品时 isFood=false 且 items=[]。',
  '2. 同名商品合并为一条，tips 中注明数量（如"×2"）。',
  '3. 保鲜天数按商品是生鲜还是包装食品给保守建议；包装食品可参考常识给开封前天数；不确定给 null。',
  '4. 常温不超过365天、冷藏不超过90天、冷冻不超过365天。',
  '5. 最多列出15条。'
].join('\n');

function toDays(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === 'string') {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (m) return Math.floor(parseFloat(m[0]));
  }
  return null;
}

function clampDays(v, limit) {
  if (v === null || v === undefined) return null;
  if (v < 1) return null;
  return Math.min(Math.floor(v), limit);
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  return {
    name: name.slice(0, 30),
    category: CATEGORY_KEYS.indexOf(raw.category) !== -1 ? raw.category : 'other',
    roomDays: clampDays(toDays(raw.roomDays), DAY_LIMITS.room),
    fridgeDays: clampDays(toDays(raw.fridgeDays), DAY_LIMITS.fridge),
    freezerDays: clampDays(toDays(raw.freezerDays), DAY_LIMITS.freezer),
    tips: typeof raw.tips === 'string' ? raw.tips.trim().slice(0, 200) : ''
  };
}

function parseAiFoodResult(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '空响应' };
  let payload = null;
  try { payload = JSON.parse(text); } catch (e) { /* 容错继续 */ }
  if (!payload) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) { try { payload = JSON.parse(fenced[1]); } catch (e) { /* 容错继续 */ } }
  }
  if (!payload) {
    const s = text.indexOf('{');
    const e2 = text.lastIndexOf('}');
    if (s !== -1 && e2 > s) {
      try { payload = JSON.parse(text.slice(s, e2 + 1)); } catch (err) {
        return { ok: false, error: '无法解析为 JSON' };
      }
    } else {
      return { ok: false, error: '响应中未找到 JSON' };
    }
  }
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeItem).filter(Boolean) : [];
  let confidence = Number(payload.confidence);
  if (!Number.isFinite(confidence)) confidence = items.length ? 0.5 : 0;
  return {
    ok: true,
    isFood: payload.isFood === undefined ? items.length > 0 : !!payload.isFood,
    confidence: Math.min(Math.max(confidence, 0), 1),
    items,
    scene: typeof payload.scene === 'string' ? payload.scene.slice(0, 100) : ''
  };
}

function callArk(imageBase64) {
  const apiKey = process.env.ARK_API_KEY || '';
  const model = process.env.ARK_MODEL || 'glm-5.3-flash';
  const base = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3').replace(/\/$/, '');
  const m = base.match(/^https:\/\/([^/]+)(\/.*)$/);
  if (!apiKey) return Promise.resolve({ ok: false, error: '云函数未配置 ARK_API_KEY 环境变量' });
  if (!m) return Promise.resolve({ ok: false, error: 'ARK_BASE_URL 配置非法' });

  const body = JSON.stringify({
    model: model,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: /^data:image\//i.test(imageBase64) ? imageBase64 : 'data:image/jpeg;base64,' + imageBase64 }
        },
        { type: 'text', text: mode === 'receipt' ? RECEIPT_PROMPT : TASK_PROMPT }
      ]
    }],
    temperature: 0.2,
    max_tokens: 4096,
    reasoning_effort: process.env.ARK_REASONING_EFFORT || 'low'
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: m[1],
      path: m[2] + '/chat/completions',
      method: 'POST',
      timeout: 50000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          let msg = '上游错误 ' + res.statusCode;
          try { const j = JSON.parse(text); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* 忽略 */ }
          resolve({ ok: false, error: msg });
          return;
        }
        try {
          const data = JSON.parse(text);
          const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          if (typeof content !== 'string') resolve({ ok: false, error: '上游响应缺少 content' });
          else resolve({ ok: true, content: content });
        } catch (e) {
          resolve({ ok: false, error: '上游响应非 JSON' });
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (err) => resolve({ ok: false, error: '网络错误：' + err.message }));
    req.write(body);
    req.end();
  });
}

exports.main = async function (event) {
  const img = event && event.imageBase64;
  if (typeof img !== 'string' || img.length < 32) {
    return { ok: false, error: '缺少 imageBase64' };
  }
  if (img.length > 8 * 1024 * 1024) {
    return { ok: false, error: '图片超过 8MB 上限' };
  }
  const r = await callArk(img);
  if (!r.ok) return { ok: false, error: r.error };
  const parsed = parseAiFoodResult(r.content);
  if (!parsed.ok) return { ok: false, error: '模型输出解析失败：' + parsed.error };
  return {
    ok: true,
    isFood: parsed.isFood,
    confidence: parsed.confidence,
    scene: parsed.scene,
    foods: parsed.items
  };
};
