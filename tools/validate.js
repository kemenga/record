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

// 7. WXML 事件处理函数必须存在于同目录同名 JS（Page/Component 方法）
for (const wf of walk(MP, ['.wxml'], [])) {
  const jsf = wf.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsf)) continue; // 无配套 JS 的在检查2已报
  const wxml = fs.readFileSync(wf, 'utf8');
  const js = fs.readFileSync(jsf, 'utf8');
  const re = /[\s"'](?:bind|catch|mut-bind)[a-z:-]*\s*=\s*"([^"]+)"/g;
  let m;
  const missing = new Set();
  while ((m = re.exec(wxml))) {
    const handler = m[1].trim();
    if (!handler || !/^[A-Za-z_$][\w$]*$/.test(handler)) continue; // 表达式/空值跳过
    // 方法定义形态：name(...) {  或  name: function  或  name:
    if (!new RegExp('\\b' + handler + '\\s*[(:]').test(js)) missing.add(handler);
  }
  if (missing.size) {
    fail(`WXML 事件处理函数在 JS 中不存在: ${path.relative(ROOT, wf)} → ${[...missing].join(', ')}`);
  }
}

// 7b. 页面 WXML 的 {{}} 根标识符必须能在 JS 中找到（data 键 / setData / 方法名）；
//     带 wx:for 作用域追踪（wx:for-item / wx:for-index 声明的名与默认 item/index 不检查）
function mustacheRoots(wxml) {
  const src = wxml.replace(/<!--[\s\S]*?-->/g, '');
  const scope = [];   // 栈元素: {forItem, forIndex}（wx:for 引入）
  const openStack = [];
  const roots = new Set();
  const tagRe = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/)?>/g;
  const musRe = /\{\{([^}]*)\}\}/g;
  let pos = 0;
  let m;
  const collect = (text) => {
    musRe.lastIndex = 0;
    let mm;
    while ((mm = musRe.exec(text))) {
      const expr = mm[1].replace(/'[^']*'|"[^"]*"/g, '');   // 去字符串字面量
      for (const t of expr.match(/[A-Za-z_$][\w$]*/g) || []) {
        if (['true', 'false', 'null', 'undefined'].includes(t)) continue;
        const root = t;
        const scoped = scope.some((s) => s.forItem === root || s.forIndex === root);
        if (!scoped) roots.add(root);
      }
    }
  };
  while ((m = tagRe.exec(src))) {
    collect(src.slice(pos, m.index));
    pos = m.index + m[0].length;
    const closing = !!m[1];
    const tag = m[2];
    const attrs = m[3] || '';
    const self = !!m[4];
    if (closing) {
      for (let i = openStack.length - 1; i >= 0; i--) {
        if (openStack[i].tag === tag) { scope.length = openStack[i].scopeLen; openStack.length = i; break; }
      }
    } else if (!self) {
      const hasFor = /[\s"']wx:for(?![\w-])/.test(attrs);
      const fi = (attrs.match(/wx:for-item\s*=\s*"([^"]+)"/) || [])[1] || 'item';
      const fx = (attrs.match(/wx:for-index\s*=\s*"([^"]+)"/) || [])[1] || 'index';
      openStack.push({ tag, scopeLen: scope.length });
      if (hasFor) scope.push({ forItem: fi, forIndex: fx });
    }
  }
  collect(src.slice(pos));
  return roots;
}

for (const wf of walk(MP, ['.wxml'], [])) {
  if (wf.includes(path.join('components', path.sep))) continue; // 组件 properties 契约不同，跳过
  const jsf = wf.replace(/\.wxml$/, '.js');
  if (!fs.existsSync(jsf)) continue;
  const js = fs.readFileSync(jsf, 'utf8');
  const unknown = [];
  for (const root of mustacheRoots(fs.readFileSync(wf, 'utf8'))) {
    // data 初始键 / setData 键 / 任意同名标识符（含方法与 data 引用）
    if (!new RegExp('\\b' + root + '\\b').test(js)) unknown.push(root);
  }
  if (unknown.length) {
    fail(`WXML 数据绑定在 JS 中无定义: ${path.relative(ROOT, wf)} → ${unknown.join(', ')}`);
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
