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

/** 剩余量三档文案（非法/未设置返回空串） */
const QUANTITY_LABELS = { full: '充足', half: '过半', low: '见底' };
function quantityLabel(key) {
  return QUANTITY_LABELS[key] || '';
}

/**
 * 三区储存建议文案：推荐分区置前（冷藏→常温→冷冻优先），不建议的标注
 * f: {roomDays?,fridgeDays?,freezerDays?}；全空返回空串
 */
function zoneGuide(f) {
  if (!f) return '';
  const zones = [
    { key: 'fridge', label: '冷藏', days: f.fridgeDays },
    { key: 'room', label: '常温', days: f.roomDays },
    { key: 'freezer', label: '冷冻', days: f.freezerDays }
  ];
  const avail = zones.filter((z) => z.days);
  if (!avail.length) return '';
  const best = avail[0];  // zones 已按 冷藏→常温→冷冻 排序，首个可用即推荐
  const parts = zones.map((z) => {
    const s = z.label + (z.days ? z.days + '天' : '不建议');
    return z === best ? '推荐' + s : s;
  });
  return parts.join(' · ');
}

module.exports = { categoryLabel, categoryIcon, zoneLabel, zoneLabels, zoneKeyByIndex, daysLeftText, quantityLabel, zoneGuide };
