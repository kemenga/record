'use strict';
/**
 * 食物记录构造（纯逻辑，供添加页/详情页复用）
 */

const DAY_MS = 86400000;
const ZONE_KEYS = ['fridge', 'freezer', 'room'];
const { CATEGORIES, findFood } = require('../data/shelf-life-db.js');
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

const ID_PREFIX = 'f_';
const MAX_TOTAL = 2000;

function makeId() {
  return ID_PREFIX + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** 校验单条导入记录的基本结构 */
function validRecord(r) {
  return r && typeof r === 'object' &&
    typeof r.name === 'string' && r.name.trim() &&
    typeof r.expiryAt === 'number' && Number.isFinite(r.expiryAt) &&
    typeof r.addedAt === 'number' && Number.isFinite(r.addedAt);
}

/**
 * 导入合并：id 冲突跳过、无 id 补 id、非法条目丢弃；总量上限 2000 条
 * @returns {merged, skipped, out}
 */
function mergeImport(existing, imported) {
  const out = existing.slice();
  let merged = 0;
  let skipped = 0;
  if (!Array.isArray(imported)) return { merged: merged, skipped: skipped, out: out };
  const ids = {};
  out.forEach((r) => { ids[r.id] = 1; });
  for (const rec of imported) {
    if (out.length >= MAX_TOTAL) break;
    if (!validRecord(rec)) continue;
    if (rec.id) {
      if (ids[rec.id]) { skipped++; continue; }
      ids[rec.id] = 1;
    }
    const clean = Object.assign({}, rec);
    if (!clean.id) {
      clean.id = makeId();
      ids[clean.id] = 1;
    }
    if (!clean.zone) clean.zone = 'fridge';
    if (!clean.category) clean.category = 'other';
    if (typeof clean.shelfDays !== 'number') clean.shelfDays = Math.max(1, Math.ceil((clean.expiryAt - clean.addedAt) / DAY_MS)) || 1;
    out.push(clean);
    merged++;
  }
  return { merged: merged, skipped: skipped, out: out };
}

/** 防连点：busy 时拒绝并返回 false；空闲放行并置忙（配合 finishSave 复位） */
function shouldProceedSave(state) {
  if (state.saving) return false;
  state.saving = true;
  return true;
}
function finishSave(state) {
  state.saving = false;
}

/**
 * 分区转移：按保鲜数据库新分区建议重算保鲜期（库无建议则沿用现有天数），追加转移历史
 */
function transferZone(record, newZone, now) {
  const db = findFood(record.name);
  const suggested = db ? db[newZone] : null;
  const days = suggested || record.shelfDays || 3;
  const history = (record.history || []).slice();
  history.push({ from: record.zone, to: newZone, at: now, days: days });
  return {
    zone: newZone,
    shelfDays: days,
    expiryAt: now + days * DAY_MS,
    history: history
  };
}

module.exports = { DAY_MS, buildFoodRecord, applyFilters, mergeImport, shouldProceedSave, finishSave, transferZone };
