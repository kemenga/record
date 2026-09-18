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
    sections: [],
    eatFirst: []
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
    const eatFirst = shelflife.pickEatFirst(all, now, settings.remindDays, 3)
      .map((r) => Object.assign(toViewModel(r, now), {
        suggest: shelflife.getStatus(r.expiryAt, now, settings.remindDays) === 'expired'
          ? '已过期，尽快处理'
          : shelflife.getDaysLeft(r.expiryAt, now) === 0 ? '今天到期' : '先吃我'
      }));
    const sections = [];
    if (g.expired.length) sections.push({ key: 'expired', title: '已过期', items: mapGroup(g.expired) });
    if (g.expiring.length) sections.push({ key: 'expiring', title: '即将到期', items: mapGroup(g.expiring) });
    if (g.fresh.length) sections.push({ key: 'fresh', title: '新鲜', items: mapGroup(g.fresh) });
    this.setData({
      groups: g,
      sections,
      eatFirst,
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

  onEatFirstTap(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  onCardLongPress(e) {
    const id = e.detail.id;
    const that = this;
    wx.showActionSheet({
      itemList: ['标记已食用', '删除记录'],
      itemColor: '#333',
      success(res) {
        if (res.tapIndex === 0) {
          storage.markEaten(id);
          wx.showToast({ title: '已标记食用', icon: 'success' });
          that.reload();
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除记录',
            content: '确定删除这条食物记录吗？不可恢复。',
            confirmColor: '#e64340',
            success(m) {
              if (m.confirm) {
                storage.removeFood(id);
                that.reload();
              }
            }
          });
        }
      },
      fail() { /* 用户取消 */ }
    });
  },

  goAdd() {
    wx.switchTab({ url: '/pages/add/add' });
  }
});
