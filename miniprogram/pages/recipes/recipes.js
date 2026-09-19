'use strict';
const storage = require('../../services/storage.js');
const { listRecipeMatches } = require('../../services/recipes.js');

Page({
  data: {
    keyword: '',
    total: 0,
    ready: 0,
    items: []          // 视图模型（含 expand/have/missing）
  },

  onShow() {
    this.reload();
  },

  reload() {
    const now = Date.now();
    const settings = storage.getSettings();
    const matches = listRecipeMatches(storage.listFoods(), now, settings.remindDays);
    const kw = (this.data.keyword || '').trim();
    const filtered = kw
      ? matches.filter((m) => m.name.indexOf(kw) !== -1 || m.have.concat(m.missing).some((i) => i.indexOf(kw) !== -1))
      : matches;
    // 排序：不缺料 > 缺料少 > 用料多
    filtered.sort((a, b) => (b.matchCount === b.total ? -1 : 0) - (a.matchCount === a.total ? -1 : 0) || (a.missing.length - b.missing.length) || (b.matchCount - a.matchCount));
    const items = filtered.map((m) => Object.assign(m, {
      expand: m.name === this.data.expandName,
      readyNow: m.matchCount === m.total
    }));
    this.setData({
      items: items,
      total: matches.length,
      ready: matches.filter((m) => m.matchCount === m.total).length
    });
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
    this.reload();
  },

  onToggle(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ expandName: this.data.expandName === name ? '' : name });
    this.reload();
  },

  goAdd() {
    wx.switchTab({ url: '/pages/add/add' });
  }
});
