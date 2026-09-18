'use strict';
/**
 * 手动添加联想搜索（纯逻辑，从 add 页提取以便测试）
 */

const { DB, findFood } = require('../data/shelf-life-db.js');

/**
 * 名称 → 数据库候选：精确/别名命中优先，其余包含匹配；最多 6 条
 */
function searchDb(name) {
  const key = (name || '').trim();
  if (!key) return [];
  const out = [];
  const seen = {};
  const exact = findFood(key);
  if (exact) out.push(exact);
  for (const item of DB) {
    if (out.length >= 6) break;
    if (seen[item.name]) continue;
    const hit = item.name.indexOf(key) !== -1 ||
      (item.aliases || []).some((a) => a.indexOf(key) !== -1);
    if (hit && item.name !== (exact && exact.name)) { out.push(item); seen[item.name] = 1; }
  }
  return out.slice(0, 6);
}

module.exports = { searchDb };
