'use strict';
/**
 * 保鲜期状态纯逻辑（无 wx 依赖，Node 测试直接复用）
 */

const DAY_MS = 86400000;

/**
 * 剩余天数（向上取整）。过期返回 0 或负数：过期不足一天返回 0，更早过期为负。
 */
function getDaysLeft(expiryAt, now) {
  const d = Math.ceil((expiryAt - now) / DAY_MS);
  return d === 0 ? 0 : d; // 归一化 -0
}

/**
 * 状态：expired（已过期）/ expiring（即将到期，剩余 ≤ remindDays 且未过期）/ fresh
 */
function getStatus(expiryAt, now, remindDays) {
  if (now > expiryAt) return 'expired';
  if (getDaysLeft(expiryAt, now) <= remindDays) return 'expiring';
  return 'fresh';
}

/**
 * 保鲜进度 1 → 0（入库满格，到期归零；过期与异常输入钳制为 0）
 */
function getProgress(record, now) {
  const total = (record.shelfDays || 0) * DAY_MS;
  if (total <= 0) return 0;
  const left = record.expiryAt - now;
  const p = left / total;
  if (p > 1) return 1;
  if (p < 0) return 0;
  return p;
}

function byExpiryAsc(a, b) {
  return a.expiryAt - b.expiryAt;
}

/**
 * 分组：{ expired:[], expiring:[], fresh:[] }，各组按到期时间升序；
 * eatenAt 非空的记录（已食用）不参与分组。
 */
function groupFoods(records, now, remindDays) {
  const out = { expired: [], expiring: [], fresh: [] };
  for (const r of records) {
    if (!r || r.eatenAt) continue;
    const s = getStatus(r.expiryAt, now, remindDays);
    out[s].push(r);
  }
  out.expired.sort(byExpiryAsc);
  out.expiring.sort(byExpiryAsc);
  out.fresh.sort(byExpiryAsc);
  return out;
}

/**
 * "今天该吃"建议：过期 + 临期项按到期时间升序（最先过期最优先），限量返回；排除已食用
 */
function pickEatFirst(records, now, remindDays, limit) {
  const out = [];
  for (const r of records) {
    if (!r || r.eatenAt) continue;
    const s = getStatus(r.expiryAt, now, remindDays);
    if (s === 'expired' || s === 'expiring') out.push(r);
  }
  out.sort(byExpiryAsc);
  return typeof limit === 'number' ? out.slice(0, limit) : out;
}

module.exports = { DAY_MS, getDaysLeft, getStatus, getProgress, groupFoods, pickEatFirst };
