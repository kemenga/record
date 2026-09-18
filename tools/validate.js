'use strict';
/**
 * 小程序工程静态校验（无微信开发者工具环境下的自检）
 *   node tools/validate.js
 * 检查：工程配置可解析；app.json 页面四件套齐全（含 tabBar）；全部 JSON 可解析；
 *       全部 JS 语法检查（node --check）；WXML 标签配平；相对 require 可解析。
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
let errors = [];
let warnings = [];

function fail(msg) { errors.push(msg); }
function walk(dir, exts, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

// 1. 工程与 JSON 校验
const projCfg = path.join(ROOT, 'project.config.json');
if (!fs.existsSync(projCfg)) fail('缺少 project.config.json');
for (const f of [projCfg].concat(walk(MP, ['.json'], []))) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
    fail('JSON 解析失败: ' + path.relative(ROOT, f) + ' → ' + e.message);
  }
}

// 2. app.json 页面四件套 + tabBar
const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
for (const page of appJson.pages || []) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    if (!fs.existsSync(path.join(MP, page + ext))) fail(`页面 ${page} 缺少 ${ext}`);
  }
}
const tabPages = ((appJson.tabBar && appJson.tabBar.list) || []).map((t) => t.pagePath);
for (const tp of tabPages) {
  if ((appJson.pages || []).indexOf(tp) === -1) fail(`tabBar 页面 ${tp} 未在 pages 中注册`);
}

// 3. 组件 json：usingComponents 指向存在
for (const jf of walk(MP, ['.json'], [])) {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { continue; }
  const uc = cfg.usingComponents || {};
  for (const [name, comp] of Object.entries(uc)) {
    const compPath = comp.startsWith('/') ? path.join(MP, comp) : path.resolve(path.dirname(jf), comp);
    if (!fs.existsSync(compPath + '.js')) fail(`${path.relative(ROOT, jf)} 的组件 ${name} 不存在: ${comp}`);
  }
}

// 4. JS 语法（miniprogram/server/tools/cloudfunctions）
const jsFiles = []
  .concat(walk(MP, ['.js'], []))
  .concat(walk(path.join(ROOT, 'server'), ['.js'], []))
  .concat(walk(path.join(ROOT, 'tools'), ['.js'], []))
  .concat(walk(path.join(ROOT, 'cloudfunctions'), ['.js'], []));
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) {
    fail('JS 语法错误: ' + path.relative(ROOT, f) + '\n' + String(e.stderr));
  }
}

// 5. WXML 标签配平
for (const wf of walk(MP, ['.wxml'], [])) {
  const src = fs.readFileSync(wf, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/)?([a-zA-Z][\w-]*)([^>]*?)(\/)?>/g;
  const stack = [];
  let m;
  let ok = true;
  while ((m = re.exec(src))) {
    const closing = !!m[1];
    const tag = m[2];
    const self = !!m[4];
    if (self) continue;
    if (!closing) stack.push({ tag, pos: m.index });
    else {
      const top = stack.pop();
      if (!top || top.tag !== tag) {
        fail(`WXML 标签不配平: ${path.relative(ROOT, wf)} → </${tag}> 多余或错配`);
        ok = false;
        break;
      }
    }
  }
  if (ok && stack.length) {
    fail(`WXML 标签不配平: ${path.relative(ROOT, wf)} → 未闭合 <${stack[stack.length - 1].tag}>`);
  }
}

// 6. miniprogram 内相对 require 可解析
for (const f of walk(MP, ['.js'], [])) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /require\((['"])(\.[^'"]+)\1\)/g;
  let m;
  while ((m = re.exec(src))) {
    const target = path.resolve(path.dirname(f), m[2]);
    if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) {
      fail(`require 不可解析: ${path.relative(ROOT, f)} → ${m[2]}`);
    }
  }
}

// 结果
console.log(`检查文件：JS ${jsFiles.length} 个、JSON/页面/WXML 全量`);
if (warnings.length) console.log('警告:\n  ' + warnings.join('\n  '));
if (errors.length) {
  console.error('✖ 校验失败 ' + errors.length + ' 项:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('✔ 静态校验全部通过');
