'use strict';
const storage = require('../../services/storage.js');
const ai = require('../../services/ai.js');
const { buildStats, forecastDays } = require('../../services/stats.js');

Page({
  data: {
    settings: null,
    healthText: '',
    checking: false,
    stats: { active: 0, eaten: 0, wasted: 0, savedMoney: 0 },
    forecast: []
  },

  onShow() {
    const all = storage.listFoods(true);
    const stats = buildStats(all, Date.now(), 15);   // 每样按 15 元估算
    const raw = forecastDays(all, Date.now(), 7);
    const max = Math.max.apply(null, raw.map((x) => x.count).concat([1]));
    const forecast = raw.map((x) => Object.assign({}, x, { pct: Math.round((x.count / max) * 100) }));
    this.setData({ settings: storage.getSettings(), healthText: '', stats: stats, forecast: forecast });
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    const settings = storage.saveSettings({ aiMode: mode });
    this.setData({ settings: settings, healthText: '' });
  },

  onBaseUrl(e) {
    let url = (e.detail.value || '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      wx.showToast({ title: '地址需以 http:// 或 https:// 开头', icon: 'none' });
      url = 'http://' + url; // 自动补全协议，减少一次来回
    }
    const settings = storage.saveSettings({ aiBaseUrl: url || 'http://127.0.0.1:3000' });
    this.setData({ settings: settings });
  },

  onRemindDays(e) {
    const v = parseInt(e.detail.value, 10);
    const days = Number.isFinite(v) ? Math.min(Math.max(v, 1), 7) : 3;
    const settings = storage.saveSettings({ remindDays: days });
    this.setData({ settings: settings });
  },

  onCheckHealth() {
    const that = this;
    this.setData({ checking: true, healthText: '检测中…' });
    ai.checkHealth().then((r) => {
      let text;
      if (r.ok && r.skipped) {
        text = r.message;
      } else if (r.ok) {
        text = '✅ 连接正常，模型：' + r.model + (r.hasKey ? '' : '（未配置 Key，无法识别）');
      } else {
        text = '❌ 连接失败：' + r.error;
      }
      that.setData({ checking: false, healthText: text });
    });
  },

  // ===== 数据导出 / 导入 =====
  onExport() {
    const all = storage.listFoods(true);
    if (!all.length) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: JSON.stringify({ app: 'freshrec', version: 1, foods: all }),
      success() {
        wx.showModal({
          title: '导出成功',
          content: '共 ' + all.length + ' 条记录已复制到剪贴板。粘贴到备忘录/文件保存即可，换机时用「导入数据」粘贴回剪贴板后导入。',
          showCancel: false
        });
      }
    });
  },

  onImport() {
    const that = this;
    wx.getClipboardData({
      success(res) {
        let payload = null;
        try {
          payload = JSON.parse(res.data);
        } catch (e) { /* 容错 */ }
        if (!payload || !Array.isArray(payload.foods)) {
          wx.showModal({ title: '导入失败', content: '剪贴板内容不是鲜记导出的数据（应为 {foods:[...]} JSON）', showCancel: false });
          return;
        }
        wx.showModal({
          title: '确认导入',
          content: '读到 ' + payload.foods.length + ' 条记录，id 相同的会跳过。继续？',
          success(m) {
            if (!m.confirm) return;
            const r = storage.importFoods(payload.foods);
            that.setData({ settings: storage.getSettings() });
            wx.showModal({
              title: '导入完成',
              content: '新导入 ' + r.merged + ' 条，跳过冲突 ' + r.skipped + ' 条',
              showCancel: false
            });
          }
        });
      },
      fail() {
        wx.showToast({ title: '读取剪贴板失败', icon: 'none' });
      }
    });
  }
});
