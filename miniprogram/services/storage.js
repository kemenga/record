'use strict';
/**
 * 食物记录与设置的本地存储层（wx.storage 封装；wx 依赖仅在此与 ai.js）
 */

const KEY_FOODS = 'foods';
const KEY_SETTINGS = 'settings';
const KEY_RECENT_NAMES = 'recentNames';
const RECENT_NAMES_LIMIT = 5;
const { mergeImport } = require('./records.js');

const DEFAULT_SETTINGS = {
  remindDays: 3,                                    // 剩余 ≤n 天视为"即将到期"
  aiMode: 'local',                                  // local=本地代理 server，cloud=云函数
  aiBaseUrl: 'http://127.0.0.1:3000',               // local 模式的代理地址
  cloudFunctionName: 'recognize'                    // cloud 模式的云函数名
};

function readJson(key) {
  try {
    const v = wx.getStorageSync(key);
    if (!v) return null;
    if (typeof v === 'string') return JSON.parse(v);
    return v;
  } catch (e) {
    return null;
  }
}

function writeJson(key, val) {
  wx.setStorageSync(key, val);
}

function makeId() {
  return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** 全部记录；includeEaten=true 时包含已食用 */
function listFoods(includeEaten) {
  const arr = readJson(KEY_FOODS) || [];
  return includeEaten ? arr : arr.filter((r) => !r.eatenAt);
}

function getFood(id) {
  return (listFoods(true).filter((r) => r.id === id)[0]) || null;
}

/** 新增：补齐 id/createdAt/updatedAt/eatenAt，返回完整记录 */
function saveFood(record) {
  const arr = listFoods(true);
  const now = Date.now();
  const full = Object.assign(
    { category: 'other', zone: 'fridge', source: 'manual', note: '', ai: null },
    record,
    { id: record.id || makeId(), createdAt: now, updatedAt: now, eatenAt: record.eatenAt || null }
  );
  arr.unshift(full);
  writeJson(KEY_FOODS, arr);
  return full;
}

function updateFood(id, patch) {
  const arr = listFoods(true);
  const i = arr.findIndex((r) => r.id === id);
  if (i === -1) return null;
  arr[i] = Object.assign({}, arr[i], patch, { id, updatedAt: Date.now() });
  writeJson(KEY_FOODS, arr);
  return arr[i];
}

function markEaten(id) {
  return updateFood(id, { eatenAt: Date.now() });
}

function removeFood(id) {
  writeJson(KEY_FOODS, listFoods(true).filter((r) => r.id !== id));
}

/** 批量导入（id 冲突跳过、非法丢弃），返回 {merged, skipped} */
function importFoods(newRecords) {
  const r = mergeImport(listFoods(true), newRecords);
  writeJson(KEY_FOODS, r.out);
  return { merged: r.merged, skipped: r.skipped };
}

function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, readJson(KEY_SETTINGS) || {});
}

function saveSettings(patch) {
  const merged = Object.assign({}, getSettings(), patch || {});
  writeJson(KEY_SETTINGS, merged);
  return merged;
}

/** 最近添加的食物名（快捷重加用）：去重、最新在前、上限 5 */
function getRecentNames() {
  const v = readJson(KEY_RECENT_NAMES);
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

function pushRecentName(name) {
  const key = String(name || '').trim();
  if (!key) return getRecentNames();
  const list = getRecentNames().filter((n) => n !== key);
  list.unshift(key);
  const out = list.slice(0, RECENT_NAMES_LIMIT);
  writeJson(KEY_RECENT_NAMES, out);
  return out;
}

module.exports = {
  DEFAULT_SETTINGS,
  listFoods, getFood, saveFood, updateFood, markEaten, removeFood, importFoods,
  getSettings, saveSettings, getRecentNames, pushRecentName
};
