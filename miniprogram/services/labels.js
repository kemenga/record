'use strict';
/** 标签/文案辅助（纯逻辑） */
const { CATEGORIES, ZONES } = require('../data/shelf-life-db.js');

const CAT_MAP = {};
CATEGORIES.forEach((c) => { CAT_MAP[c.key] = c; });
const ZONE_MAP = {};
ZONES.forEach((z) => { ZONE_MAP[z.key] = z; });

function categoryLabel(key) {
  return (CAT_MAP[key] && CAT_MAP[key].label) || '其他';
}

function categoryIcon(key) {
  return (CAT_MAP[key] && CAT_MAP[key].icon) || '🧂';
}

function zoneLabel(key) {
  return (ZONE_MAP[key] && ZONE_MAP[key].label) || '冷藏';
}

function zoneLabels() {
  return ZONES.map((z) => z.label);
}

function zoneKeyByIndex(i) {
  return ZONES[i] && ZONES[i].key;
}

/** 剩余天数文案 */
function daysLeftText(daysLeft) {
  if (daysLeft < 0) return '已过期' + (-daysLeft) + '天';
  if (daysLeft === 0) return '今天到期';
  return '剩' + daysLeft + '天';
}

module.exports = { categoryLabel, categoryIcon, zoneLabel, zoneLabels, zoneKeyByIndex, daysLeftText };
