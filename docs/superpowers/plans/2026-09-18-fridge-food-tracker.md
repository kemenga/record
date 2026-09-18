# 「鲜记」冰箱食物保质期小程序 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 原生微信小程序：拍照 → 火山方舟 Doubao-Seed-1.6-Vision 识别食物 → 建议保鲜期 → 冰箱清单管理与临期提醒。

**Architecture:** 小程序（本地 wx.storage）通过适配层调用 AI：dev 走本地零依赖 Node 代理 `server/`，prod 走云函数 `cloudfunctions/recognize/`。纯逻辑（保鲜数据库、状态计算、AI 解析）放 `miniprogram/` 内 CommonJS 模块，Node 测试直接复用；server 运行时 require 小程序侧数据库做交叉校验。

**Tech Stack:** 微信小程序原生（CommonJS）、Node 24（零运行时依赖、`node:test`）、火山方舟 Chat Completions API。

**Spec:** `docs/superpowers/specs/2026-09-18-fridge-food-tracker-design.md`

## Global Constraints

- API key 只经环境变量 `ARK_API_KEY` 注入；`.env` 与任何真实 key 禁止提交 git。
- 默认模型 `doubao-seed-1-6-vision-250815`，Base URL `https://ark.cn-beijing.volces.com/api/v3`，均可配置。
- 小程序 JS 一律 CommonJS；被 Node 测试的模块不得引用 `wx`（`wx` 依赖全部收敛到 `services/storage.js`、`services/ai.js` 的薄封装内）。
- 图片单张 ≤8MB（base64 后），server 端超限返回 413。
- 保鲜天数安全钳制：room ≤ 30、fridge ≤ 90、freezer ≤ 365；与内置库冲突时取更保守（更小）值。
- 状态阈值：expired(now>expiryAt) / expiring(剩余≤remindDays，默认3) / fresh。
- 类别枚举：vegetable|fruit|meat|seafood|dairy|egg|cooked|staple|snack|other；分区：fridge|freezer|room。

---

### Task 1: 项目基础与文档

**Files:** Create `.gitignore`, `README.md`(重写), `docs/ROADMAP.md`
- [ ] 写 .gitignore（node_modules/、.env、*.local、miniprogram_npm/ 等）
- [ ] 写 README 骨架（后续 Task 14 完善使用说明）
- [ ] 写 ROADMAP.md（夜间迭代队列，供定时任务消费）
- [ ] Commit & push

### Task 2: 内置保鲜数据库

**Files:** Create `miniprogram/data/shelf-life-db.js`; Test `tests/shelf-life-db.test.js`
**Produces:** `module.exports = { CATEGORIES, ZONES, DB, findFood(name) }`；条目结构 `{ name, aliases[], category, room|fridge|freezer(days,可null), tips }`；`findFood` 按名称/别名精确匹配返回条目或 null。
- [ ] 失败测试：DB ≥100 条；每条字段合法（category 在枚举内、天数 1..上限或 null）；findFood('西红柿') 命中；findFood('不存在食物') 返回 null；CATEGORIES/ZONES 结构正确
- [ ] 实现 DB（USDA + 中文食安指南，约 110 条中国家庭常见食物）
- [ ] 测试通过 → Commit & push

### Task 3: 保鲜期状态纯逻辑

**Files:** Create `miniprogram/services/shelflife.js`; Test `tests/shelflife.test.js`
**Produces:** `getStatus(expiryAt, now, remindDays)` → 'expired'|'expiring'|'fresh'；`getDaysLeft(expiryAt, now)` → 整数（向上取整，过期为负）；`getProgress(record, now)` → 0..1；`groupFoods(records, now, remindDays)` → `{expired:[],expiring:[],fresh:[]}` 各组按 expiryAt 升序。
- [ ] 失败测试：到期后1ms→expired；剩余0.5天+remind=3→expiring；剩余10天→fresh；剩余恰0天→expiring（未过期）；进度 0/1 边界；分组排序
- [ ] 实现（不引用 wx）
- [ ] 测试通过 → Commit & push

### Task 4: AI 响应解析与钳制（纯逻辑）

**Files:** Create `miniprogram/services/parse.js`; Test `tests/parse.test.js`
**Produces:** `parseAiFoodResult(text)` → `{ok:true,isFood,confidence,items:[{name,category,roomDays,fridgeDays,freezerDays,tips}],scene}` 或 `{ok:false,error}`；容错：剥 ```json 围栏、截取首个 `{` 到末个 `}`、字段缺省/类型矫正、天数钳制；`reconcileWithDb(item)` → 与 DB 冲突取更保守值并标记 `adjusted:true`。
- [ ] 失败测试：正常 JSON、带围栏、前后混杂质文本、天数超限钳制、非食物、空/坏输入、reconcile 用 DB 覆盖过大天数
- [ ] 实现（不引用 wx）
- [ ] 测试通过 → Commit & push

### Task 5: server — Ark 客户端

**Files:** Create `server/ark.js`, `server/.env.example`; Test `tests/ark.test.js`（配合 `tools/mock-ark.js`）
**Produces:** `buildMessages(imageBase64)`；`callArk({baseUrl,apiKey,model,imageBase64,timeoutMs})` → `{ok,raw,httpStatus}`；`recognize(cfg,imageBase64)` → parse 后结果（内部 callArk→parseAiFoodResult→逐 item reconcileWithDb）。
- [ ] 写 `tools/mock-ark.js`（http 服务，校验 Bearer/图片字段，返回固定合法 JSON，可注入"围栏/超时"剧本）+ 失败测试
- [ ] 实现 ark.js（fetch、AbortController 超时 45s、非 200 带错误信息）
- [ ] 测试通过（含超时与 401 剧本）→ Commit & push

### Task 6: server — HTTP 代理端到端

**Files:** Create `server/index.js`; Test `tests/server.e2e.test.js`
**Produces:** `POST /api/recognize {imageBase64}` → 200 `{ok:true, foods:[...]}`/4xx `{ok:false,error}`；`GET /api/health` → `{ok:true,model}`；`.env` 加载（零依赖手写解析）；环境变量 `PORT`(默认3000)/`ARK_BASE_URL`/`ARK_MODEL`/`ARK_API_KEY`。
- [ ] 失败测试：mock-ark + 真 server → fetch /api/recognize（图 base64 任意 jpeg 头）断言食物字段；缺 key→503 明确错误；超大图→413；/api/health→200
- [ ] 实现零依赖 http server（手动 JSON body 收包，限制 12MB）
- [ ] 测试通过 → Commit & push

### Task 7: 小程序骨架

**Files:** Create `miniprogram/app.json|app.js|app.wxss`, `project.config.json`, `miniprogram/sitemap.json`, 四个页面与组件的空壳（index/add/detail/settings、components/food-card）
- [ ] app.json 注册 4 页面 + tabBar（清单/添加/设置）；app.js 全局（读设置、提供默认 remindDays）
- [ ] `project.config.json`（appid 占位 touristappid、es6、不校验域名提示）
- [ ] Commit & push

### Task 8: storage 服务（wx 封装）

**Files:** Create `miniprogram/services/storage.js`; Test `tests/storage.test.js`（注入 mock wx）
**Produces:** `listFoods()`, `saveFood(record)`, `updateFood(id,patch)`, `removeFood(id)`(硬删), `markEaten(id)`, `getFood(id)`, `getSettings()/saveSettings(patch)`（settings key 默认 `{remindDays:3, aiMode:'local', aiBaseUrl:'http://127.0.0.1:3000'}`）。
- [ ] 失败测试：mock `wx.setStorageSync/getStorageSync` 内存实现 → 增查改删/已食用排序/设置默认合并
- [ ] 实现
- [ ] 测试通过 → Commit & push

### Task 9: services/ai.js 适配层

**Files:** Create `miniprogram/services/ai.js`
**Produces:** `recognizeFood(imageBase64)`：aiMode=local→`wx.request` POST `${aiBaseUrl}/api/recognize`；=cloud→`wx.cloud.callFunction({name:'recognize'})`；超时 45s；返回 `{ok,...}` 或 `{ok:false,error}`。
- [ ] 实现（wx 依赖仅在此与 storage.js）
- [ ] `node --check` 通过 → Commit & push

### Task 10: 首页清单 pages/index

**Files:** `miniprogram/pages/index/*`、`components/food-card/*`
- [ ] food-card 组件：名称/分区徽标/剩余天数/状态色/缩略提示；properties: food, now
- [ ] index：顶部统计（过期 n / 临期 n / 共 n）、分区筛选 chips、状态分组列表（复用 shelflife.groupFoods）、空态引导、下拉刷新
- [ ] `node --check` + validate.js → Commit & push

### Task 11: 拍照识别页 pages/add

**Files:** `miniprogram/pages/add/*`
- [ ] `wx.chooseMedia`(camera/album, compressed) → FileSystemManager.readFile base64
- [ ] 识别中 loading；结果可编辑表单（名称/分区/天数/备注）；AI 多结果逐个可保存；AI 失败→手动模式（输入名称实时 findFood 匹配数据库自动填天数）
- [ ] `node --check` → Commit & push

### Task 12: 详情页 pages/detail

**Files:** `miniprogram/pages/detail/*`
- [ ] 进度条（getProgress）、状态色、储存建议 tips、编辑（名称/分区/天数）、删除（confirm）、标记已食用
- [ ] `node --check` → Commit & push

### Task 13: 设置页 pages/settings

**Files:** `miniprogram/pages/settings/*`
- [ ] AI 模式切换（local/cloud）、aiBaseUrl 输入、remindDays 调整、连通性测试按钮（/api/health）、隐私说明
- [ ] `node --check` → Commit & push

### Task 14: 云函数 + 静态校验 + 文档收尾

**Files:** Create `cloudfunctions/recognize/{index.js,package.json}`；`tools/validate.js`；完善 `README.md`
- [ ] 云函数（自包含：prompt+fetch+解析+钳制，环境变量注入 key）
- [ ] validate.js：app.json 页面与磁盘一致、全部 json 可解析、全部 js node --check、wxml 标签平衡、引用模块存在；全部通过
- [ ] README：导入开发者工具、启动 server、配 key、云函数部署、常见问题
- [ ] 全量测试 `node --test tests/` 通过 → Commit & push

### Task 15: ROADMAP 队列 + 定时自动化

- [ ] ROADMAP.md 写入夜间迭代任务（见文件）；全仓测试绿；Commit & push

## Self-Review 结论

- Spec 覆盖：MVP 范围 1.5 节全部条目 → Task 2-14 覆盖；安全 2.5/4 节 → Task 4/5/6 钳制与 env；测试策略第3节 → Task 2-6 单测 + Task 14 静态校验。✓
- 无占位符；跨任务签名一致（findFood/parseAiFoodResult/reconcileWithDb/getStatus/groupFoods/recognizeFood/storage API）。✓
