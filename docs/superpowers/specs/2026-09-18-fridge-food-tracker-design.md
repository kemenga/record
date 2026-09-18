# 「鲜记」冰箱食物保质期管理小程序 — 设计文档

日期：2026-09-18 ｜ 状态：已定稿（自主执行模式，用户已授权免交互审批）

## 1. 需求调研结论

### 1.1 用户核心诉求

用户拍照 → 大模型识别食物种类 → 给出建议保鲜期 → 记录在冰箱清单中，临期/过期可见。

### 1.2 竞品调研（要点）

| 竞品 | 形态 | 可借鉴点 |
|---|---|---|
| 有菜（iOS） | App | 拍照录入 + 临期提醒 + "今天吃啥" |
| FreshTrack / 过期了吗（Android） | App | AI 视觉识物、常温/冷藏/冷冻三分区 |
| 仓鼠管家 | App | 拍照识别录入 + 智能到期提醒 |
| Otto! | App | 内置期限数据库自动建议（无AI也可用） |
| 冰箱小助手 / 临期助手 | 微信小程序 | 功能基础，**无 AI 识别** → 差异化空白 |

**关键洞察**：AI 识别能力集中在独立 App 与家电厂商生态（海尔/美的），微信小程序赛道内"拍照 AI 识别 + 保质期管理"成熟竞品少，是本产品切入点。

### 1.3 保鲜期数据依据

内置保鲜数据库以 USDA FoodKeeper / FoodSafety.gov 冷藏冷冻储存表 + 中文权威科普（政府食安文章）为依据，覆盖中国家庭常见食物约 100 条。温度标准：冷藏 ≤4°C，冷冻 ≤-18°C。

### 1.4 大模型选型

火山方舟 Doubao-Seed-1.6-Vision（默认模型 ID `doubao-seed-1-6-vision-250815`，可配置为接入点 `ep-xxx`）。

- 接口：`POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`（OpenAI 兼容）
- 鉴权：`Authorization: Bearer <ARK_API_KEY>`
- 图片：base64，`data:image/jpeg;base64,` 前缀，单图 ≤10MB
- 选择理由：多模态识别能力强、中文食物识别友好、OpenAI 兼容协议便于替换其他厂商

### 1.5 MVP 范围（今晚交付）

✅ 拍照/相册选图 → AI 识别（食物名、分类、置信度、常温/冷藏/冷冻建议天数、储存建议）
✅ 识别结果可编辑（名称/分区/天数）后保存
✅ 内置保鲜数据库：手动添加自动带出保鲜期；AI 失败时兜底
✅ 冰箱清单：按状态分组（已过期/即将到期/新鲜）+ 按分区（冷藏/冷冻/常温）筛选
✅ 详情页：保鲜进度条、编辑、删除、标记已食用
✅ 本地存储（wx.storage，单机 MVP）
✅ 设置页：AI 服务地址配置、即将到期阈值

🚫 暂不做（见 ROADMAP）：订阅消息推送、小票 OCR 批量录入、菜谱推荐、家庭共享、云同步、多图识别

## 2. 架构

```
微信小程序(原生)                    代理层(二选一)              火山方舟
┌─────────────────┐   dev   ┌──────────────────┐        ┌─────────────┐
│ miniprogram/    │ ──────► │ server/ 本地Node │ ─────► │ doubao-seed │
│  pages/...      │         │ (零依赖 http)    │        │ -1.6-vision │
│  services/ai.js │   prod  ├──────────────────┤        └─────────────┘
│  services/      │ ──────► │ cloudfunctions/  │
│  storage.js     │         │  recognize/      │
│  data/保鲜库.js │         └──────────────────┘
└─────────────────┘
```

关键原则：
- **API Key 永不进小程序包、永不进 git**。key 只在 server 环境变量（`ARK_API_KEY`）或云函数环境变量中。
- `services/ai.js` 统一适配层：`mode=local`（默认，请求本地 server，开发者工具勾选"不校验合法域名"）或 `mode=cloud`（wx.cloud.callFunction）。设置页可切换并填地址。
- server 与云函数复用同一套 prompt 与解析逻辑（CommonJS 模块）。

### 2.1 目录结构

```
miniprogram/           原生小程序（CommonJS，便于 Node 测试复用纯逻辑）
  app.js|json|wxss
  pages/index|add|detail|settings/
  components/food-card/
  services/ai.js storage.js shelflife.js
  data/shelf-life-db.js
server/                零依赖 Node 代理（POST /api/recognize, GET /api/health）
  index.js ark.js
cloudfunctions/recognize/   云函数（与 server 共享 ark 逻辑设计）
tests/                 node:test 单元测试（纯逻辑 + server 端到端 mock）
tools/validate.js      静态校验（app.json 页面齐全、JSON/JS 语法、WXML 标签平衡）
tools/mock-ark.js      假方舟服务，端到端测试用
docs/                  本文档、计划、ROADMAP（夜间迭代队列）
```

### 2.2 数据模型

食物记录（wx.storage key: `foods`，数组）：

```js
{
  id: 'f_1726670000_x7',        // 时间戳+随机
  name: '西兰花',
  category: 'vegetable',         // vegetable|fruit|meat|seafood|dairy|egg|cooked| staple|snack|other
  zone: 'fridge',                // fridge 冷藏 | freezer 冷冻 | room 常温
  addedAt: 1726670000000,        // 入库时间
  expiryAt: 1727274800000,       // 建议到期时间戳
  shelfDays: 7,                  // 建议保鲜天数（按所存分区）
  source: 'ai' | 'manual' | 'db',// 保鲜期来源
  ai: { confidence: 0.92, tips: '建议用保鲜袋包裹', raw: {...} },  // 可选
  note: '',
  eatenAt: null | timestamp,     // 已食用（软删除，默认列表不显示）
  createdAt, updatedAt
}
```

AI 识别响应（模型输出严格 JSON，经 `parseAiFoodResult` 容错解析）：

```js
{ isFood: true, confidence: 0.9,
  items: [{ name: '西兰花', category: 'vegetable',
            roomDays: 2, fridgeDays: 7, freezerDays: 30,
            tips: '保鲜袋包裹存放于冷藏室抽屉' }],
  scene: '冰箱中的蔬菜' }
```

### 2.3 状态计算（纯函数，shelflife.js）

| 状态 | 判定 | 颜色 |
|---|---|---|
| expired 已过期 | now > expiryAt | 红 |
| expiring 即将到期 | 距到期 ≤ remindDays（默认3，可设） | 橙 |
| fresh 新鲜 | 其余 | 绿 |

剩余天数进度条 = clamp((expiryAt-now)/(shelfDays*86400e3), 0, 1)。

### 2.4 Prompt 设计（关键）

要求模型：识别图中食物（可能多个）；非食物或无法判断时 `isFood:false`；只输出 JSON；天数给保守安全值；多场景（生/熟、包装食品）区分。System prompt 固化在 server 端，小程序只传图。

### 2.5 错误处理

- 小程序：AI 请求失败/超时(30s) → 提示并引导手动添加（数据库兜底），不阻塞记录。
- 解析容错：剥离 ```json 围栏、截取首尾大括号、字段缺省值、天数上限 clamp（防幻觉，如冷藏 ≤90 天、冷冻 ≤365 天，与内置库冲突时取更保守值）。
- server：无 key 时返回明确错误码；仅接受 POST /api/recognize，图片 ≤8MB（base64 后），超限 413。

## 3. 测试策略（本机无微信开发者工具）

1. 纯逻辑单元测试（node:test）：shelflife 状态/进度计算、storage 数据操作（mock wx）、AI 响应解析容错、保鲜数据库完整性（条目结构/天数范围）。
2. server 端到端：mock-ark（假方舟返回固定 JSON）→ 真 server → node fetch 断言。
3. 静态校验 tools/validate.js：app.json 声明页面与磁盘一致、全部 JSON 可解析、全部 JS `node --check`、WXML 标签平衡、wxss 存在。
4. 真机/工具验证留待用户：README 提供微信开发者工具导入步骤。

## 4. 安全与合规

- API key 走环境变量；`.env` 进 .gitignore；提供 `.env.example`。
- 图片仅用于识别，代理不落盘。
- 小程序正式发布需在微信后台配置 https 合法域名（README 说明）；MVP 用云函数或本地代理。

## 5. 参考资料

- 火山方舟对话 API / 模型列表：https://www.volcengine.com/docs/82379/1799865
- Doubao-Seed-1.6-Vision 介绍：https://ai-bot.cn/doubao-seed-1-6
- FoodSafety.gov 冷藏储存表：https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts
- USDA FSIS Freezing and Food Safety：http://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/freezing-and-food-safety
