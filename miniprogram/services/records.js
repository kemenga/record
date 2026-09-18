'use strict';
/**
 * 食物记录构造（纯逻辑，供添加页/详情页复用）
 */

const DAY_MS = 86400000;
const ZONE_KEYS = ['fridge', 'freezer', 'room'];
const { CATEGORIES } = require('../data/shelf-life-db.js');
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/**
 * @param {Object} input {name, category?, zoneKey?, days?, source?, note?, tips?, now}
 * @returns 完整记录（不含 id/createdAt 等存储层字段，由 storage.saveFood 补齐）
 */
function buildFoodRecord(input, now) {
  const raw = parseInt(input.days, 10);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 365)) : 3;
  const zone = ZONE_KEYS.indexOf(input.zoneKey) !== -1 ? input.zoneKey : 'fridge';
  const name = String(input.name || '').trim();
  return {
    name: name,
    category: CATEGORY_KEYS.indexOf(input.category) !== -1 ? input.category : 'other',
    zone: zone,
    shelfDays: days,
    addedAt: now,
    expiryAt: now + days * DAY_MS,
    source: input.source || 'manual',
    note: input.note || '',
    ai: input.tips ? { confidence: null, tips: input.tips } : null
  };
}

module.exports = { DAY_MS, buildFoodRecord };
