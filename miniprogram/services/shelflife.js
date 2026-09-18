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
 * 开封状态（NoWaste/UseSoon 模式）：开封后按"开封窗口"重算有效期
 */
const OPENED_DEFAULT_DAYS = { cooked: 2, seafood: 1, meat: 2, dairy: 3 };

/** 开封补丁：openedAt=now，openedDays 按分类默认（可显式指定） */
function openPatch(record, now, openedDays) {
  const byCat = OPENED_DEFAULT_DAYS[record.category];
  return { openedAt: now, openedDays: openedDays || byCat || 7 };
}

/**
 * 视图模型包装：已开封记录的有效期 = openedAt + openedDays（新寿命语义，可晚于原到期日）；
 * 同时把 shelfDays 换成开封窗口，保证进度条一致。原记录不修改。
 */
function applyOpened(record) {
  if (!record || !record.openedAt || !record.openedDays) {
    return Object.assign({ opened: false }, record);
  }
  return Object.assign({}, record, {
    opened: true,
    expiryAt: record.openedAt + record.openedDays * DAY_MS,
    shelfDays: record.openedDays
  });
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

module.exports = { DAY_MS, OPENED_DEFAULT_DAYS, openPatch, applyOpened, getDaysLeft, getStatus, getProgress, groupFoods, pickEatFirst };
