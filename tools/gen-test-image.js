'use strict';
/**
 * 生成测试食物图片（零依赖 PNG：白底红苹果+棕柄+绿叶）
 * 用法：node tools/gen-test-image.js [输出路径]  （默认 tmp/apple.png）
 * 用途：无外网图片源时验证视觉识别链路
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 320;
const H = 320;

function crc32(buf) {
  return zlib.crc32(buf) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function main() {
  const out = process.argv[2] || path.join('tmp', 'apple.png');
  // 画布：1=白 2=红 3=深红 4=棕 5=绿
  const px = new Uint8Array(W * H).fill(1);
  const cx = 160;
  const cy = 190;
  const r = 95;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / 1.15;      // 稍扁的苹果形
      const dy = y - cy;
      const d = dx * dx + dy * dy;
      if (d < r * r) {
        let c = 2;
        if (dx * dx + (dy + 55) * (dy + 55) > r * r - 900) c = 3; // 边缘暗部
        px[y * W + x] = c;
      }
    }
  }
  // 果柄（棕色竖线）
  for (let y = 60; y < 105; y++) px[y * W + 162] = 4;
  // 叶子（绿色椭圆）
  for (let y = 78; y < 96; y++) {
    for (let x = 168; x < 218; x++) {
      const nx = (x - 193) / 25;
      const ny = (y - 87) / 9;
      if (nx * nx + ny * ny <= 1) px[y * W + x] = 5;
    }
  }
  // 高光（白色小椭圆）
  for (let y = 150; y < 168; y++) {
    for (let x = 118; x < 146; x++) {
      const nx = (x - 132) / 14;
      const ny = (y - 159) / 9;
      if (nx * nx + ny * ny <= 1) px[y * W + x] = 1;
    }
  }

  const COLORS = {
    1: [255, 255, 255],
    2: [214, 32, 32],
    3: [160, 20, 20],
    4: [110, 70, 30],
    5: [60, 150, 60]
  };
  // 每行前加 filter byte 0
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const c = COLORS[px[y * W + x]] || COLORS[1];
      const off = y * (W * 3 + 1) + 1 + x * 3;
      raw[off] = c[0];
      raw[off + 1] = c[1];
      raw[off + 2] = c[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  console.log('written', out, png.length, 'bytes');
}

main();
