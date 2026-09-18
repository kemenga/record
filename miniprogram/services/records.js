'use strict';
/**
 * 食物记录构造（纯逻辑，供添加页/详情页复用）
 */

const DAY_MS = 86400000;
const ZONE_KEYS = ['fridge', 'freezer', 'room'];
const { CATEGORIES } = require('../data/shelf-life-db.js');
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/** 置信度规范化：0..1 小数（>1 视为百分数），非法 → null */
function normalizeConfidence(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > 1 ? Math.min(n / 100, 1) : n;
}

/**
 * @param {Object} input {name, category?, zoneKey?, days?, source?, note?, tips?, confidence?, now}
 * @returns 完整记录（不含 id/createdAt 等存储层字段，由 storage.saveFood 补齐）
 */
function buildFoodRecord(input, now) {
  const raw = parseInt(input.days, 10);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 365)) : 3;
  const zone = ZONE_KEYS.indexOf(input.zoneKey) !== -1 ? input.zoneKey : 'fridge';
  const name = String(input.name || '').trim();
  const confidence = normalizeConfidence(input.confidence);
  const hasAi = confidence !== null || (input.tips && String(input.tips).trim());
  return {
    name: name,
    category: CATEGORY_KEYS.indexOf(input.category) !== -1 ? input.category : 'other',
    zone: zone,
    shelfDays: days,
    addedAt: now,
    expiryAt: now + days * DAY_MS,
    source: input.source || 'manual',
    note: input.note || '',
    ai: hasAi ? { confidence: confidence, tips: (input.tips || '').trim() } : null
  };
}

/** 分区+类别组合筛选（'all'/undefined 表示不过滤） */
function applyFilters(records, filter) {
  const f = filter || {};
  return records.filter((r) =>
    (!f.zone || f.zone === 'all' || r.zone === f.zone) &&
    (!f.category || f.category === 'all' || r.category === f.category)
  );
}

module.exports = { DAY_MS, buildFoodRecord, applyFilters };
