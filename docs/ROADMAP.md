# ROADMAP — 夜间迭代队列

> 执行模式：**连续运行**（2026-09-18 22:15 起，无定时任务）。从上往下取第一个未完成任务执行，完成后勾选、提交并 push 到 origin main。
> 每个任务前先 `node --test tests/*.test.js` 与 `node tools/validate.js` 确保全绿再动新功能；发现红测先修复。
> 终点：队列清空且收尾完成，或到达 2026-09-19 07:00。

## P0 — 主线交付（今晚必须完成）

- [x] T1 项目基础（.gitignore/README/ROADMAP）
- [x] T2 内置保鲜数据库 + 测试
- [x] T3 保鲜状态纯逻辑 + 测试
- [x] T4 AI 响应解析/钳制 + 测试
- [x] T5 server Ark 客户端 + mock 测试
- [x] T6 server HTTP 代理端到端测试
- [x] T7 小程序骨架（app/页面壳/tabBar）
- [x] T8 storage 服务 + 测试
- [x] T9 AI 适配层 services/ai.js
- [x] T10 首页清单 + food-card 组件
- [x] T11 拍照识别页
- [x] T12 详情页
- [x] T13 设置页
- [x] T14 云函数 + tools/validate.js + README 完善

## P1 — 体验增强（P0 全部完成后，按序做，每个完成后 commit+push）

- [x] R1 首页"今天该吃"排序建议（临期优先 + 简单提示语）
- [x] R2 添加页识别历史最近 5 条快捷重加
- [x] R3 详情页展示 AI 原始置信度与建议（tips）
- [x] R4 首页空态/过期项交互打磨（删除确认、误触保护）
- [x] R5 设置页"云函数部署指引"内嵌说明
- [x] R6 server 增加 --mock 启动参数（无 key 时用假数据，方便演示）
- [x] R7 tests 增加：add 页保存流程纯逻辑（构造 record）单测
- [x] R8 README 增加截图位说明与 FAQ（合法域名、云开发收费提示）

## P2 — 锦上添花（时间允许）

- [ ] R9 保鲜数据库扩到 150 条并补 aliases（番茄/西红柿等别名匹配测试）
- [ ] R10 列表按类别筛选
- [ ] R11 数据导出/导入（剪贴板 JSON）便于换机
- [ ] R12 cloudfunctions 补充独立的单元测试与部署脚本说明

## 收尾（明早 07:00 前）

- [ ] F1 全量测试+validate 绿，README 进度更新，最终 commit+push
