'use strict';
/**
 * 统计面板纯逻辑（NoWaste 式：食用/浪费计数 + N 日到期预测）
 */

const DAY_MS = 86400000;
const { getDaysLeft } = require('./shelflife.js');

/**
 * @param records 全部记录（含已食用）
 * @param pricePerItem 每样食物的估算单价（元），用于"避免浪费"展示
 */
function buildStats(records, now, pricePerItem) {
  let eaten = 0;
  let eatenInTime = 0;
  let wasted = 0;
  let active = 0;
  for (const r of records || []) {
    if (!r) continue;
    if (r.eatenAt) {
      eaten++;
      if (r.expiryAt >= r.eatenAt) eatenInTime++;
      else wasted++;               // 过期后才吃，也算浪费
      continue;
    }
    if (r.removedAs === 'expired' || r.expiryAt < now) wasted++;
    else active++;
  }
  return {
    eaten: eaten,
    eatenInTime: eatenInTime,
    wasted: wasted,
    active: active,
    savedMoney: Math.round(eatenInTime * (pricePerItem || 0))
  };
}

/**
 * 未来 N 天到期分布：[过期, 今天, 明天, 2天, ..., N天]，长度 N+2
 */
function forecastDays(records, now, n) {
  const out = [{ label: '过期', count: 0 }, { label: '今天', count: 0 }];
  for (let d = 1; d <= n; d++) {
    out.push({ label: d === 1 ? '明天' : d + '天', count: 0 });
  }
  for (const r of records || []) {
    if (!r || r.eatenAt) continue;
    const d = getDaysLeft(r.expiryAt, now);
    if (d < 0) out[0].count++;
    else if (d === 0) out[1].count++;
    else if (d <= n) out[d + 1].count++;
    // 超出 N 天的不进预测
  }
  return out;
}

module.exports = { buildStats, forecastDays };
