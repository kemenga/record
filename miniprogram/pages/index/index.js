'use strict';
const storage = require('../../services/storage.js');
const shelflife = require('../../services/shelflife.js');
const labels = require('../../services/labels.js');
const { ZONES } = require('../../data/shelf-life-db.js');

function fmtDate(ts) {
  const d = new Date(ts);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function toViewModel(r, now) {
  return Object.assign({}, r, {
    status: shelflife.getStatus(r.expiryAt, now),
    daysText: labels.daysLeftText(shelflife.getDaysLeft(r.expiryAt, now)),
    progressPercent: Math.round(shelflife.getProgress(r, now) * 100),
    zoneLabel: labels.zoneLabel(r.zone),
    categoryLabel: labels.categoryLabel(r.category),
    categoryIcon: labels.categoryIcon(r.category),
    addedText: fmtDate(r.addedAt)
  });
}

Page({
  data: {
    zoneChips: [{ key: 'all', label: '全部' }].concat(ZONES.map((z) => ({ key: z.key, label: z.label }))),
    zoneFilter: 'all',
    counts: { expired: 0, expiring: 0, total: 0 },
    groups: { expired: [], expiring: [], fresh: [] },
    sections: []
  },

  onShow() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload();
    wx.stopPullDownRefresh();
  },

  reload() {
    const now = Date.now();
    const settings = storage.getSettings();
    let foods = storage.listFoods();
    if (this.data.zoneFilter !== 'all') {
      foods = foods.filter((r) => r.zone === this.data.zoneFilter);
    }
    const g = shelflife.groupFoods(foods, now, settings.remindDays);
    const mapGroup = (arr) => arr.map((r) => toViewModel(r, now));
    const all = storage.listFoods();
    const allG = shelflife.groupFoods(all, now, settings.remindDays);
    const sections = [];
    if (g.expired.length) sections.push({ key: 'expired', title: '已过期', items: mapGroup(g.expired) });
    if (g.expiring.length) sections.push({ key: 'expiring', title: '即将到期', items: mapGroup(g.expiring) });
    if (g.fresh.length) sections.push({ key: 'fresh', title: '新鲜', items: mapGroup(g.fresh) });
    this.setData({
      groups: g,
      sections,
      counts: { expired: allG.expired.length, expiring: allG.expiring.length, total: all.length }
    });
  },

  onZoneChip(e) {
    this.setData({ zoneFilter: e.currentTarget.dataset.key });
    this.reload();
  },

  onCardTap(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  goAdd() {
    wx.switchTab({ url: '/pages/add/add' });
  }
});
