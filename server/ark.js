'use strict';
/**
 * 火山方舟 Ark 客户端（零依赖，Node 18+ 内置 fetch）
 * API：POST {ARK_BASE_URL}/chat/completions，OpenAI 兼容协议
 * 复用小程序侧解析/钳制逻辑（CommonJS 相对路径引用）
 */

const { parseAiFoodResult, reconcileWithDb } = require('../miniprogram/services/parse.js');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3';
const DEFAULT_MODEL = 'glm-5.3-flash';

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

function buildMessages(imageBase64, mode) {
  const url = /^data:image\//i.test(imageBase64)
    ? imageBase64
    : 'data:image/jpeg;base64,' + imageBase64;
  const prompt = mode === 'receipt' ? RECEIPT_PROMPT : TASK_PROMPT;
  return [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url } },
        { type: 'text', text: prompt }
      ]
    }
  ];
}

/** 公共：POST chat/completions 并解析响应（callArk 与 chatComplete 共用） */
async function postChatCompletions(baseUrl, apiKey, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = '上游错误 ' + res.status;
      try { const j = JSON.parse(text); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* 忽略 */ }
      return { ok: false, httpStatus: res.status, error: msg };
    }
    const data = JSON.parse(text);
    const choice = data.choices && data.choices[0];
    const content = choice && choice.message && choice.message.content;
    const finishReason = (choice && choice.finish_reason) || '';
    if (typeof content !== 'string') return { ok: false, httpStatus: res.status, error: '上游响应缺少 content' };
    return { ok: true, httpStatus: res.status, content, finishReason };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')));
    return { ok: false, httpStatus: 0, error: aborted ? '请求超时（' + timeoutMs + 'ms）' : '网络错误：' + (err && err.message) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用 Ark Chat Completions（视觉识别：图片 + 任务提示词）
 * cfg.reasoningEffort：思考力度 low|medium|high（默认 low；空串则不带该参数）
 */
async function callArk({ baseUrl = DEFAULT_BASE_URL, apiKey, model = DEFAULT_MODEL, imageBase64, mode, timeoutMs = 45000, reasoningEffort = 'low' }) {
  if (!apiKey) return { ok: false, httpStatus: 0, error: '缺少 ARK_API_KEY' };
  const payload = {
    model,
    messages: buildMessages(imageBase64, mode),
    temperature: 0.2,
    // 思考模型的 reasoning 计入输出 token，1500 在复杂照片下会被截断在 JSON 中间
    max_tokens: 4096
  };
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
  const r = await postChatCompletions(baseUrl, apiKey, payload, timeoutMs);
  if (!r.ok) return r;
  return { ok: true, httpStatus: r.httpStatus, content: r.content, finishReason: r.finishReason };
}

/**
 * 多轮对话（聊天助手）：messages 为完整对话数组（含 system），可由调用方拼接图片
 */
async function chatComplete({ baseUrl = DEFAULT_BASE_URL, apiKey, model = DEFAULT_MODEL, messages, timeoutMs = 60000, reasoningEffort = 'low' }) {
  if (!apiKey) return { ok: false, httpStatus: 0, error: '缺少 ARK_API_KEY' };
  if (!Array.isArray(messages) || !messages.length) return { ok: false, httpStatus: 0, error: 'messages 不能为空' };
  const payload = {
    model,
    messages: messages,
    temperature: 0.5,
    max_tokens: 2000
  };
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
  const r = await postChatCompletions(baseUrl, apiKey, payload, timeoutMs);
  if (!r.ok) return r;
  return { ok: true, httpStatus: r.httpStatus, content: r.content, finishReason: r.finishReason };
}

module.exports = { DEFAULT_BASE_URL, DEFAULT_MODEL, TASK_PROMPT, RECEIPT_PROMPT, buildMessages, callArk, chatComplete, recognize };

/**
 * 识别 + 解析 + 数据库收缩 全链路
 * @param mode 'food'（默认，识别食物）| 'receipt'（识别购物小票）
 * @returns {ok, isFood, confidence, scene, items[]} 或 {ok:false, error, httpStatus?}
 */
async function recognize(cfg, imageBase64, mode) {
  const r = await callArk(Object.assign({}, cfg, { imageBase64, mode }));
  if (!r.ok) return { ok: false, error: r.error, httpStatus: r.httpStatus };
  const parsed = parseAiFoodResult(r.content);
  if (!parsed.ok) {
    // 诊断信息落日志，便于定位"思考截断/口语化回答"两类问题
    console.error('[recognize] 解析失败 finish=%s content头部=%s', r.finishReason, JSON.stringify(String(r.content).slice(0, 200)));
    const hint = r.finishReason === 'length'
      ? '模型输出被截断，请重试或拍摄内容更简单的照片'
      : '模型未按 JSON 格式回答，请重试';
    return { ok: false, error: hint + '（' + parsed.error + '）', httpStatus: 200 };
  }
  parsed.items = parsed.items.map(reconcileWithDb);
  return parsed;
}

module.exports = { DEFAULT_BASE_URL, DEFAULT_MODEL, TASK_PROMPT, RECEIPT_PROMPT, buildMessages, callArk, chatComplete, recognize };
