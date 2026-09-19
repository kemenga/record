'use strict';
const test = require('node:test');
const assert = require('node:assert');

/** 本文件独立进程运行：直接安装 mock wx 并加载模块 */
delete require.cache[require.resolve('../miniprogram/services/storage.js')];
delete require.cache[require.resolve('../miniprogram/services/chat-cmd.js')];
const mem = Object.create(null);
global.wx = {
  setStorageSync: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); },
  getStorageSync: (k) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : '')
};
const { parseCommands, buildChatSystemPrompt, applyCommands } = require('../miniprogram/services/chat-cmd.js');

const DAY = 86400000;
const now = 1726670000000;

test('parseCommands：提取单个/多个 cmd 块，忽略非法', () => {
  const r1 = parseCommands('好的，已帮你加入。\n<cmd>{"action":"add","name":"牛奶","days":7,"zone":"fridge"}</cmd>');
  assert.strictEqual(r1.length, 1);
  assert.strictEqual(r1[0].action, 'add');
  assert.strictEqual(r1[0].name, '牛奶');
  assert.strictEqual(r1[0].days, 7);
  const r2 = parseCommands('<cmd>{"action":"add","name":"A"}</cmd>中间文本<cmd>{"action":"delete","name":"西红柿"}</cmd><cmd>{broken}</cmd>');
  assert.strictEqual(r2.length, 2);
  assert.strictEqual(parseCommands('没有指令的普通回复').length, 0);
  assert.strictEqual(parseCommands('').length, 0);
});

test('parseCommands：字段矫正（缺 name 丢弃、zone 非法回退、days 钳制、字符串数字）', () => {
  assert.strictEqual(parseCommands('<cmd>{"action":"add"}</cmd>').length, 0);
  const z = parseCommands('<cmd>{"action":"add","name":"A","zone":"微波炉"}</cmd>')[0];
  assert.strictEqual(z.zone, 'fridge');
  const d = parseCommands('<cmd>{"action":"add","name":"A","days":"7天","zone":"freezer"}</cmd>')[0];
  assert.strictEqual(d.days, 7);
  assert.strictEqual(d.zone, 'freezer');
  const d2 = parseCommands('<cmd>{"action":"add","name":"A","days":9999}</cmd>')[0];
  assert.strictEqual(d2.days, 365);
  const d3 = parseCommands('<cmd>{"action":"add","name":"A"}</cmd>')[0];
  assert.strictEqual(d3.days, undefined);   // 执行层用数据库兜底
});

test('buildChatSystemPrompt：包含库存、指令规范与规则；已食用不列', () => {
  const records = [
    { name: '牛奶', zone: 'fridge', expiryAt: now + 5 * DAY, addedAt: now },
    { name: '西红柿', zone: 'room', expiryAt: now + 2 * DAY, addedAt: now, eatenAt: now }
  ];
  const p = buildChatSystemPrompt(records, now, 3);
  assert.ok(p.includes('牛奶'));
  assert.ok(p.includes('剩5天'));
  assert.ok(p.includes('<cmd>'));
  assert.ok(p.includes('"action":"add"'));
  assert.ok(p.includes('"action":"delete"'));
  assert.ok(p.indexOf('西红柿') === -1);
});

test('applyCommands：add 入库（DB 兜底天数）、delete 归一名匹配、未找到报错', () => {
  const results = applyCommands([
    { action: 'add', name: ' 牛奶 ', days: 7, zone: 'fridge' },
    { action: 'delete', name: '番茄' },          // 别名归一 → 西红柿不存在 → 未找到
    { action: 'add', name: '西兰花' },           // 未给天数 → 数据库 7
    { action: 'unknown' },
    { action: 'delete', name: '牛奶' }
  ], now);
  assert.strictEqual(results[0].ok, true);
  assert.ok(results[0].message.indexOf('牛奶') !== -1);
  assert.strictEqual(results[1].ok, false);
  assert.ok(results[1].message.indexOf('未找到') !== -1);
  assert.strictEqual(results[2].ok, true);
  assert.ok(results[2].message.indexOf('7天') !== -1);
  assert.strictEqual(results[3].ok, false);
  assert.strictEqual(results[4].ok, true);      // add 过的牛奶被删除
  assert.strictEqual(global.wx.getStorageSync('foods').length, 1);   // 只剩西兰花
});
