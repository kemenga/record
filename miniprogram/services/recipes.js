'use strict';
/**
 * 临期食材菜谱推荐（纯逻辑）
 * 优先推荐用掉"临期/已过期"食材的菜，其次用料匹配多的、用料总数少的（更易做）。
 */

const { RECIPES } = require('../data/recipes-db.js');
const { findFood } = require('../data/shelf-life-db.js');
const shelflife = require('./shelflife.js');

/** 用户记录名 → 保鲜库规范名（别名归一）；库外名称原样 */
function normalizeName(name) {
  const f = findFood(name);
  return f ? f.name : String(name || '').trim();
}

/**
 * @param records 食物记录（未食用参与）
 * @returns [{name, matchCount, total, useExpiring, expiringNames, missing}] 限量返回
 */
function suggestRecipes(records, now, remindDays, limit) {
  const have = {};
  const expiringSet = {};
  for (const r of records || []) {
    if (!r || r.eatenAt) continue;
    const n = normalizeName(r.name);
    if (!n) continue;
    have[n] = 1;
    if (shelflife.getStatus(r.expiryAt, now, remindDays) !== 'fresh') expiringSet[n] = 1;
  }
  const out = [];
  for (const rec of RECIPES) {
    let match = 0;
    const expiringNames = [];
    const missing = [];
    for (const ing of rec.ingredients) {
      if (have[ing]) {
        match++;
        if (expiringSet[ing]) expiringNames.push(ing);
      } else {
        missing.push(ing);
      }
    }
    if (match === 0) continue;
    out.push({
      name: rec.name,
      matchCount: match,
      total: rec.ingredients.length,
      useExpiring: expiringNames.length,
      expiringNames: expiringNames,
      missing: missing
    });
  }
  out.sort((a, b) =>
    (b.useExpiring - a.useExpiring) ||
    (b.matchCount - a.matchCount) ||
    (a.total - b.total)
  );
  return typeof limit === 'number' ? out.slice(0, limit) : out;
}

module.exports = { suggestRecipes, normalizeName };
