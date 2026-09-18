'use strict';
const storage = require('../../services/storage.js');
const ai = require('../../services/ai.js');

Page({
  data: {
    settings: null,
    healthText: '',
    checking: false
  },

  onShow() {
    this.setData({ settings: storage.getSettings(), healthText: '' });
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    const settings = storage.saveSettings({ aiMode: mode });
    this.setData({ settings: settings, healthText: '' });
  },

  onBaseUrl(e) {
    // 输入结束时保存，避免每次击键都写 storage
    const settings = storage.saveSettings({ aiBaseUrl: (e.detail.value || '').trim() || 'http://127.0.0.1:3000' });
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
  }
});
