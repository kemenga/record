# 鲜记 FreshRec · 冰箱食物保质期管理小程序

拍照 → AI 识别食物种类 → 给出建议保鲜期 → 冰箱清单与临期提醒。

> 设计语言：奶油底（#F6F1E7）+ 墨绿主色（#2E5C3E）暖色主题（2026-09-19 前端重设计，逻辑层零改动）。

## 功能

- 📷 **拍照识别**：拍摄/选择食物照片，AI（默认 GLM-5.3-Flash，火山方舟 OpenAI 兼容接口；可通过环境变量切换 Doubao 等）识别食物种类、分类、常温/冷藏/冷冻建议保鲜天数与储存建议；一次可识别多种食物
- 🧾 **小票批量录入**：拍购物小票一键提取所有食品，批量保存（`reasoning_effort=low` 思考力度，识别约 2-3 秒）
- 🍳 **菜谱推荐**：40 道家常菜库，按"优先消耗临期食材"推荐，点击查看已有用料与缺料清单
- 🔔 **开屏临期提醒**：进入小程序一次性提示过期/临期数量（免推送权限依赖）
- ✏️ **结果可改**：识别结果可修改名称/分区/天数后保存；AI 天数若超出权威保鲜数据库范围会自动校正（只收紧、不放宽，防幻觉）
- 🧊 **冰箱清单**：按"已过期 / 即将到期 / 新鲜"分组，支持冷藏/冷冻/常温分区筛选，卡片显示剩余天数与保鲜进度条
- 📇 **详情管理**：进度、储存建议、编辑、删除、标记已食用
- 🗃 **内置保鲜数据库**：110+ 种中国家庭常见食物（USDA FoodKeeper / FoodSafety.gov + 中文食安科普），无 AI 也能手动添加并自动带出保鲜期
- 🔒 **本地存储**：数据仅存本机（wx.storage），照片只用于当次识别，代理不落盘

## 目录结构

```
miniprogram/            微信小程序（原生，CommonJS）
  pages/index           冰箱清单（统计/分组/筛选）
  pages/add             拍照识别 + 手动添加
  pages/detail          详情/编辑/删除/已食用
  pages/settings        AI 模式/地址/临期阈值
  components/food-card  食物卡片
  services/             shelflife(状态) parse(解析) storage(存储) ai(适配) labels
  data/shelf-life-db.js 内置保鲜数据库
server/                 零依赖 Node 代理（开发调试）
cloudfunctions/recognize/  云函数（正式使用，零依赖）
tests/                  node:test 单元/端到端测试（28 例）
tools/validate.js       工程静态校验；tools/mock-ark.js 假方舟服务
docs/                   设计文档/实现计划/ROADMAP
```

## 快速开始

### 1. 启动 AI 代理（本地模式）

```bash
cp server/.env.example server/.env
# 编辑 server/.env，填入 ARK_API_KEY（火山方舟控制台 → API Key 管理）
node server/index.js    # 默认 http://127.0.0.1:3000
```

无 Key 演示：另开终端 `node tools/mock-ark.js 9100`，并在 server/.env 设 `ARK_BASE_URL=http://127.0.0.1:9100/api/v3`、`ARK_API_KEY=test-key`。

### 2. 导入微信开发者工具

1. 打开微信开发者工具 → 导入项目 → 目录选本仓库根目录（`miniprogramRoot` 已配置为 `miniprogram/`）
2. AppID 用测试号（默认 `touristappid`）或替换为自己的
3. 详情 → 本地设置 → 勾选 **不校验合法域名**（本地代理必需）
4. 编译运行；"添加"页拍照 → 识别 → 保存；"设置"页可测试代理连通性

### 3. 云函数部署（正式使用）

1. 开发者工具开通云开发，`miniprogram/app.js` 中按需增加 `wx.cloud.init({ env: '你的环境ID' })`（ai.js 的 cloud 模式依赖它）
2. 右键 `cloudfunctions/recognize` → 上传并部署
3. 云开发控制台 → 云函数 → recognize → 配置 → 环境变量：`ARK_API_KEY=...`（可选 `ARK_MODEL`、`ARK_BASE_URL`）
4. 小程序"设置"页切换为 **云函数** 模式

> 真机正式发布时，若不用云函数而用自建代理，需在小程序后台配置 https 合法域名（要求备案域名 + TLS）。

## 测试与校验

```bash
node --test tests/*.test.js   # 28 例：保鲜数据库/状态计算/AI解析/server端到端/存储层
node tools/validate.js        # 工程静态校验（页面四件套/JSON/JS语法/WXML配平/require解析）
```

## 设计要点

- **API Key 安全**：仅存在于 `server/.env` 或云函数环境变量，`.env` 已 gitignore，绝不进小程序包
- **防幻觉双保险**：模型输出强制 JSON + 三级容错解析；天数上限钳制（常温365/冷藏90/冷冻365）；与内置权威数据库交叉收紧
- **AI 不可用兜底**：手动添加 + 数据库自动带出保鲜期，核心记账功能零 AI 依赖

详见 [设计文档](docs/superpowers/specs/2026-09-18-fridge-food-tracker-design.md) 与 [ROADMAP](docs/ROADMAP.md)。

## FAQ

- **识别报"无法连接 AI 服务"**：确认 `node server/index.js` 已运行、手机与电脑同网段（真机预览用局域网 IP 替换 127.0.0.1）、勾选了不校验合法域名
- **真机预览连不上电脑代理**：设置页把地址改成 `http://<电脑局域网IP>:3000`（`ipconfig` 查 IPv4）；电脑防火墙放行 3000 端口
- **正式发布必须用云函数吗**：不是。自建 https 代理也可以，但小程序后台"服务器域名"要求：https + 已备案域名 + TLS≥1.2，配置后无需勾选"不校验合法域名"；云函数方式免域名免备案，个人开发者最省事
- **图片超限**：小程序侧已压缩并限制 8MB；代理侧 413 时请重拍
- **云开发收费吗**：有免费额度（调用次数/容量），超出按量计费，控制台可设额度告警；不开通云开发则完全免费（仅本地代理模式）
- **识别结果不准**：可在保存前直接改名称/分区/天数；天数若与数据库冲突会被自动收紧（红色"已按数据库校正"标签）；详情页可再次修改
- **换了手机数据怎么办**：设置页（R11 起）支持剪贴板导出/导入 JSON

## 截图位

（待补：`docs/screenshots/` 下放置 index.png / add.png / detail.png / settings.png，四张核心界面图）

## 进度

- 2026-09-18 21:40–22:54：MVP（T1-T14）+ P1/P2 增强（R1-R12）+ V 队列（小票 OCR / 菜谱推荐 / 开屏提醒）全部完成
- 视觉模型：**GLM-5.3-Flash**（火山方舟 coding 端点，`reasoning_effort=low`；可经环境变量切换）
- 真实链路已验证：本地 server → glm-5.3-flash → JSON 解析 → 数据库交叉校验（实测手绘苹果图被正确识别并返回三分区保鲜天数，单次约 2.4s；防幻觉钳制层可见生效 `adjusted:true`）
- 43/43 测试 + 工程静态校验全绿；共 30+ 次提交全部推送 origin/main

## 后续想法（未排期）

- 订阅消息临期推送（需微信订阅消息模板）
- 购物小票 OCR 批量录入
- 根据临期食材推荐菜谱
- 家庭共享（云端同步）
