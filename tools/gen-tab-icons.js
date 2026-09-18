'use strict';
/**
 * 生成 tabBar 图标（零依赖 PNG，81x81，微信推荐）
 * 用法：node tools/gen-tab-icons.js
 * 产出：miniprogram/assets/tab-{index,add,settings}{,-on}.png
 * 线条风格：2.5px 圆角线性图标；普通 #A79E8C / 选中 #2E5C3E（与 tabBar 配置一致）
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const S = 81;
const LW = 5;          // 线宽
const PAD = 14;        // 内边距

function crc32(buf) {
  return zlib.crc32(buf) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** 画布：0透明，>0 为色索引 */
function canvas() {
  return new Uint8Array(S * S);
}
function fillRect(px, x0, y0, x1, y1, c) {
  for (let y = Math.max(0, y0); y <= Math.min(S - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(S - 1, x1); x++) px[y * S + x] = c;
}
function hLine(px, x0, x1, y, c) { fillRect(px, x0, y - (LW >> 1), x1, y + (LW >> 1), c); }
function vLine(px, x, y0, y1, c) { fillRect(px, x - (LW >> 1), y0, x + (LW >> 1), y1, c); }
function rect(px, x0, y0, x1, y1, c) {
  hLine(px, x0, x1, y0, c); hLine(px, x0, x1, y1, c);
  vLine(px, x0, y0 + LW, y1 - LW, c); vLine(px, x1, y0 + LW, y1 - LW, c);
}
function circle(px, cx, cy, r, c) { // 环
  for (let y = cy - r - LW; y <= cy + r + LW; y++) {
    for (let x = cx - r - LW; x <= cx + r + LW; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= r + LW / 2 && d >= r - LW / 2 && x >= 0 && x < S && y >= 0 && y < S) px[y * S + x] = c;
    }
  }
}
function fillCircle(px, cx, cy, r, c) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && x < S && y >= 0 && y < S) px[y * S + x] = c;
}
function diag(px, x0, y0, x1, y1, c) { // 粗略直线
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n);
    const y = Math.round(y0 + (y1 - y0) * i / n);
    fillRect(px, x - (LW >> 1), y - (LW >> 1), x + (LW >> 1), y + (LW >> 1), c);
  }
}

/** 冰箱：圆角矩形 + 中隔线 + 把手点 */
function drawFridge(px, c) {
  rect(px, PAD + 6, PAD, S - PAD - 6, S - PAD, c);
  hLine(px, PAD + 6, S - PAD - 6, 34, c);
  fillRect(px, S - PAD - 18, 24, S - PAD - 12, 30, c);   // 上把手
  fillRect(px, S - PAD - 18, 42, S - PAD - 12, 54, c);   // 下把手
}
/** 加号圆 */
function drawAdd(px, c) {
  circle(px, S >> 1, S >> 1, 26, c);
  hLine(px, S / 2 - 13, S / 2 + 13, S >> 1, c);
  vLine(px, S >> 1, S / 2 - 13, S / 2 + 13, c);
}
/** 齿轮（简化：外圈+内点+齿） */
function drawGear(px, c) {
  circle(px, S >> 1, S >> 1, 22, c);
  fillCircle(px, S >> 1, S >> 1, 8, c);
  for (let a = 0; a < 8; a++) {
    const rad = Math.PI * a / 4;
    const x = Math.round((S >> 1) + Math.cos(rad) * 28);
    const y = Math.round((S >> 1) + Math.sin(rad) * 28);
    fillCircle(px, x, y, 4, c);
  }
}

function writePng(file, px, color) {
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      const v = px[y * S + x];
      const off = y * (S * 4 + 1) + 1 + x * 4;
      raw[off] = v ? color[0] : 0;
      raw[off + 1] = v ? color[1] : 0;
      raw[off + 2] = v ? color[2] : 0;
      raw[off + 3] = v ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
}

const GRAY = [0xA7, 0x9E, 0x8C];
const GREEN = [0x2E, 0x5C, 0x3E];
const draw = { index: drawFridge, add: drawAdd, settings: drawGear };

for (const [name, fn] of Object.entries(draw)) {
  for (const [suffix, color] of [['', GRAY], ['-on', GREEN]]) {
    const px = canvas();
    fn(px, 1);
    writePng(path.join('miniprogram', 'assets', `tab-${name}${suffix}.png`), px, color);
  }
}
console.log('tabBar 图标已生成：miniprogram/assets/tab-*.png（6个）');
