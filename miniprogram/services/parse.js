'use strict';
/**
 * AI 识别结果解析与安全钳制（无 wx 依赖）
 * 模型输出为自由文本，可能带围栏/前后缀；此处统一容错解析 + 字段矫正 + 天数上限钳制
 */

const { DAY_LIMITS, CATEGORIES, findFood } = require('../data/shelf-life-db.js');

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

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
  const category = CATEGORY_KEYS.indexOf(raw.category) !== -1 ? raw.category : 'other';
  const tips = typeof raw.tips === 'string' ? raw.tips.trim() : '';
  return {
    name: name.slice(0, 30),
    category,
    roomDays: clampDays(toDays(raw.roomDays ?? raw.room), DAY_LIMITS.room),
    fridgeDays: clampDays(toDays(raw.fridgeDays ?? raw.fridge), DAY_LIMITS.fridge),
    freezerDays: clampDays(toDays(raw.freezerDays ?? raw.freezer), DAY_LIMITS.freezer),
    tips: tips.slice(0, 200)
  };
}

/**
 * 解析模型输出文本 → {ok,isFood,confidence,items[],scene} 或 {ok:false,error}
 */
function parseAiFoodResult(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: '空响应' };
  }
  let payload = null;
  // 1) 直接尝试
  try { payload = JSON.parse(text); } catch (e) { /* 继续容错 */ }
  // 2) 剥 ```json 围栏
  if (!payload) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try { payload = JSON.parse(fenced[1]); } catch (e) { /* 继续容错 */ }
    }
  }
  // 3) 截取首个 { 到末个 }
  if (!payload) {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s !== -1 && e > s) {
      try { payload = JSON.parse(text.slice(s, e + 1)); } catch (err) {
        return { ok: false, error: '无法解析为 JSON' };
      }
    } else {
      return { ok: false, error: '响应中未找到 JSON' };
    }
  }
  if (!payload || typeof payload !== 'object') return { ok: false, error: '响应结构异常' };

  const items = Array.isArray(payload.items)
    ? payload.items.map(normalizeItem).filter(Boolean)
    : [];
  const isFood = payload.isFood === undefined ? items.length > 0 : !!payload.isFood;
  let confidence = Number(payload.confidence);
  if (!Number.isFinite(confidence)) confidence = items.length ? 0.5 : 0;
  confidence = Math.min(Math.max(confidence, 0), 1);

  return {
    ok: true,
    isFood,
    confidence,
    items,
    scene: typeof payload.scene === 'string' ? payload.scene.slice(0, 100) : ''
  };
}

/**
 * 与内置数据库交叉校验（仅做安全收缩，不做补全）：
 * 数据库命中且 AI 给的天数更激进时取数据库保守值；数据库明确"不建议该方式储存"时置 null。
 * 补全缺失天数由添加页直接查库完成，此处不反向填充。返回新对象，调整过时 adjusted=true。
 */
function reconcileWithDb(item) {
  const db = findFood(item.name);
  if (!db) return Object.assign({}, item, { adjusted: false });
  const out = Object.assign({}, item, { adjusted: false });
  let adjusted = false;
  const pairs = [['roomDays', 'room'], ['fridgeDays', 'fridge'], ['freezerDays', 'freezer']];
  for (const [k, zk] of pairs) {
    if (out[k] === null || out[k] === undefined) continue; // AI 未给出 → 不补全
    const dbDays = db[zk];
    if (dbDays === null || dbDays === undefined) {
      out[k] = null; // 数据库不建议该方式储存
      adjusted = true;
    } else if (out[k] > dbDays) {
      out[k] = dbDays;
      adjusted = true;
    }
  }
  if (db.category && out.category === 'other') out.category = db.category;
  if (!out.tips && db.tips) out.tips = db.tips;
  out.adjusted = adjusted;
  return out;
}

module.exports = { parseAiFoodResult, reconcileWithDb };
