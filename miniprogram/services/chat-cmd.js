'use strict';
/**
 * 大模型聊天管冰箱：指令解析 + 执行（纯逻辑层，wx 依赖经 storage）
 * 模型回复中嵌入 <cmd>{...}</cmd> 指令块；本模块负责解析、矫正、执行。
 */

const storage = require('./storage.js');
const { buildFoodRecord } = require('./records.js');
const { findFood } = require('../data/shelf-life-db.js');
const labels = require('./labels.js');
const shelflife = require('./shelflife.js');

const ZONE_KEYS = ['fridge', 'freezer', 'room'];
const CMD_RE = /<cmd>([\s\S]*?)<\/cmd>/g;

/**
 * 从模型回复中解析指令（非法/缺 name 的块丢弃）
 * @returns [{action, name?, days?, zone?}]
 */
function parseCommands(text) {
  const out = [];
  if (typeof text !== 'string' || !text) return out;
  let m;
  CMD_RE.lastIndex = 0;
  while ((m = CMD_RE.exec(text))) {
    let obj;
    try { obj = JSON.parse(m[1].trim()); } catch (e) { continue; }
    if (!obj || typeof obj !== 'object') continue;
    if (obj.action === 'add') {
      const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 20) : '';
      if (!name) continue;
      out.push({
        action: 'add',
        name: name,
        days: toClampedDays(obj.days),
        zone: ZONE_KEYS.indexOf(obj.zone) !== -1 ? obj.zone : 'fridge'
      });
    } else if (obj.action === 'delete') {
      const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 20) : '';
      if (!name) continue;
      out.push({ action: 'delete', name: name });
    }
    // 其它 action 忽略
  }
  return out;
}

function toClampedDays(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(n, 365)) : undefined;
}

/**
 * 构造聊天 system 提示：库存清单 + 指令规范 + 行为规则
 */
function buildChatSystemPrompt(records, now, remindDays) {
  const lines = [];
  for (const r of records || []) {
    if (!r || r.eatenAt) continue;
    const days = shelflife.getDaysLeft(r.expiryAt, now);
    lines.push('- ' + r.name + '（' + labels.zoneLabel(r.zone) + '，剩' + days + '天）');
  }
  const inventory = lines.length ? lines.join('\n') : '（空）';
  return [
    '你是「鲜记」冰箱助手，帮用户管理冰箱食物。用户冰箱当前库存：',
    inventory,
    '',
    '你可以通过在回复中嵌入指令来增删食物，每条指令占一行，格式：',
    '<cmd>{"action":"add","name":"食物名","days":7,"zone":"fridge|freezer|room"}</cmd>',
    '<cmd>{"action":"delete","name":"食物名"}</cmd>',
    '规则：',
    '1. 用户表达"买了/放入/加了/囤了"某食物 → 发 add 指令；days 按 USDA FoodKeeper 保守建议（冷藏按4°C），1-365；zone 按常识选（多数生鲜冷藏；土豆洋葱等阴凉存放的用 room；长期保存的肉类用 freezer）。',
    '2. 用户表达"吃完了/删掉/扔了/处理了" → 发 delete 指令（name 用库存中的规范名）。',
    '3. 一句话提到多种食物时发多条指令；每条指令前后不要加列表符号。',
    '4. 咨询类问题（营养、做法、储存方法、保质期）直接回答，不要发指令；回答保持简洁友好，使用中文。',
    '5. 删除不存在的食物时，回复中说明没有找到。'
  ].join('\n');
}

/**
 * 执行指令（add：未给天数/分区时用数据库兜底；delete：别名归一后精确匹配）
 * @returns [{ok, action, message, name?}]
 */
function applyCommands(cmds, now) {
  const results = [];
  for (const cmd of cmds || []) {
    if (cmd.action === 'add') {
      const db = findFood(cmd.name);
      const days = cmd.days || (db ? (db[cmd.zone] || db.fridge || db.room || db.freezer || 7) : 7);
      const rec = storage.saveFood(buildFoodRecord({
        name: cmd.name,
        category: db ? db.category : 'other',
        zoneKey: cmd.zone,
        days: days,
        source: 'chat',
        tips: db ? db.tips : ''
      }, now));
      storage.pushRecentName(rec.name);
      results.push({
        ok: true,
        action: 'add',
        name: rec.name,
        message: '已添加 ' + rec.name + ' · ' + labels.zoneLabel(rec.zone) + rec.shelfDays + '天'
      });
    } else if (cmd.action === 'delete') {
      const target = labels_canonical(cmd.name);
      const rec = storage.listFoods(true).filter((r) => !r.removed && r.name === target)[0] || null;
      if (!rec) {
        results.push({ ok: false, action: 'delete', name: cmd.name, message: '未找到：' + cmd.name });
      } else {
        storage.removeFood(rec.id);
        results.push({ ok: true, action: 'delete', name: rec.name, message: '已删除 ' + rec.name });
      }
    } else {
      results.push({ ok: false, action: cmd.action, message: '不支持的操作' });
    }
  }
  return results;
}

/** 名称别名归一（番茄→西红柿）；库外原样返回 */
function labels_canonical(name) {
  const f = findFood(name);
  return f ? f.name : String(name || '').trim();
}

module.exports = { parseCommands, buildChatSystemPrompt, applyCommands };
