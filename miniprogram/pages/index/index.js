'use strict';
const storage = require('../../services/storage.js');
const shelflife = require('../../services/shelflife.js');
const labels = require('../../services/labels.js');
const { applyFilters } = require('../../services/records.js');
const { suggestRecipes } = require('../../services/recipes.js');
const { ZONES, CATEGORIES } = require('../../data/shelf-life-db.js');

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
    categoryChips: [{ key: 'all', label: '全部' }].concat(CATEGORIES.map((c) => ({ key: c.key, label: c.icon + c.label }))),
    categoryFilter: 'all',
    categoryFilterOn: false,
    counts: { expired: 0, expiring: 0, total: 0 },
    todayText: '',
    heroTip: '',
    groups: { expired: [], expiring: [], fresh: [] },
    sections: [],
    eatFirst: [],
    recipes: [],
    selectMode: false,
    selectedIds: [],
    selCount: 0
  },

  onShow() {
    this.reload();
    this.maybeRemindOnce();
  },

  /** 开屏一次性临期提醒（每次启动小程序只弹一次，不依赖推送权限） */
  maybeRemindOnce() {
    const app = getApp();
    if (!app.globalData.launchReminded) {
      const c = this.data.counts;
      if (c.expired + c.expiring > 0) {
        app.globalData.launchReminded = true;
        wx.showModal({
          title: '🧊 冰箱临期提醒',
          content: '你有 ' + c.expired + ' 样食物已过期、' + c.expiring + ' 样即将到期。看看「今天该吃」，优先消灭它们吧！',
          showCancel: false,
          confirmText: '好的'
        });
      }
    }
  },

  onPullDownRefresh() {
    this.reload();
    wx.stopPullDownRefresh();
  },

  reload() {
    const now = Date.now();
    const d = new Date(now);
    const todayText = (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + '日一二三四五六'.charAt(d.getDay());
    const settings = storage.getSettings();
    const foods = applyFilters(storage.listFoods().map(shelflife.applyOpened), {
      zone: this.data.zoneFilter,
      category: this.data.categoryFilter
    });
    const g = shelflife.groupFoods(foods, now, settings.remindDays);
    const selected = {};
    this.data.selectedIds.forEach((id) => { selected[id] = 1; });
    const mapGroup = (arr) => arr.map((r) => {
      const vm = toViewModel(r, now);
      vm.selectable = this.data.selectMode;
      vm.checked = !!selected[r.id];
      return vm;
    });
    const all = storage.listFoods().map(shelflife.applyOpened);
    const allG = shelflife.groupFoods(all, now, settings.remindDays);
    const eatFirst = shelflife.pickEatFirst(all, now, settings.remindDays, 3)
      .map((r) => Object.assign(toViewModel(r, now), {
        suggest: shelflife.getStatus(r.expiryAt, now, settings.remindDays) === 'expired'
          ? '已过期，尽快处理'
          : shelflife.getDaysLeft(r.expiryAt, now) === 0 ? '今天到期' : '先吃我'
      }));
    const recipes = suggestRecipes(all, now, settings.remindDays, 6).map((r) => ({
      name: r.name,
      sub: r.useExpiring ? '救急' + r.useExpiring + '样临期' : '已有' + r.matchCount + '/' + r.total + '样用料',
      detail: '用料：' + (r.expiringNames.length
        ? r.expiringNames.map((n) => n + '(临期)').join('、')
        : '见缺料清单') + (r.missing.length ? '\n还缺：' + r.missing.join('、') : '\n齐活，直接开做')
    }));
    const sections = [];
    if (g.expired.length) sections.push({ key: 'expired', title: '已过期', items: mapGroup(g.expired) });
    if (g.expiring.length) sections.push({ key: 'expiring', title: '即将到期', items: mapGroup(g.expiring) });
    if (g.fresh.length) sections.push({ key: 'fresh', title: '新鲜', items: mapGroup(g.fresh) });
    const nExp = allG.expired.length, nIng = allG.expiring.length, nAll = all.length;
    let heroTip = '拍张照片，开始记录你的冰箱';
    if (nAll > 0) {
      if (nExp > 0 && nIng > 0) heroTip = nExp + ' 样已过期 · ' + nIng + ' 样临期，今天先消灭它们';
      else if (nExp > 0) heroTip = nExp + ' 样已过期，尽快处理';
      else if (nIng > 0) heroTip = nIng + ' 样即将到期，优先吃掉';
      else heroTip = '全部新鲜，安心存放';
    }
    this.setData({
      todayText,
      heroTip,
      groups: g,
      sections,
      eatFirst,
      recipes,
      counts: { expired: allG.expired.length, expiring: allG.expiring.length, total: all.length }
    });
  },

  onZoneChip(e) {
    this.setData({ zoneFilter: e.currentTarget.dataset.key });
    this.reload();
  },

  onToggleCategory() {
    this.setData({ categoryFilterOn: !this.data.categoryFilterOn });
  },

  onCategoryChip(e) {
    this.setData({ categoryFilter: e.currentTarget.dataset.key });
    this.reload();
  },

  onCardTap(e) {
    if (this.data.selectMode) {
      this.onCardTapSelect(e);
      return;
    }
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  onEatFirstTap(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  onRecipeTap(e) {
    const idx = e.currentTarget.dataset.idx;
    const r = this.data.recipes[idx];
    if (!r) return;
    wx.showModal({ title: '🍳 ' + r.name, content: r.detail, showCancel: false, confirmText: '知道了' });
  },

  goShopping() {
    wx.navigateTo({ url: '/pages/shopping/shopping' });
  },

  goChat() {
    wx.navigateTo({ url: '/pages/chat/chat' });
  },

  goRecipes() {
    wx.navigateTo({ url: '/pages/recipes/recipes' });
  },

  // ===== 批量操作 =====
  onToggleManage() {
    const selectMode = !this.data.selectMode;
    this.setData({ selectMode: selectMode, selectedIds: [], selCount: 0 });
    this.reload();
  },

  onCardTapSelect(e) {
    const id = e.detail.id;
    const ids = this.data.selectedIds.slice();
    const i = ids.indexOf(id);
    if (i === -1) ids.push(id);
    else ids.splice(i, 1);
    this.setData({ selectedIds: ids, selCount: ids.length });
    this.reload();
  },

  visibleIds() {
    const out = [];
    this.data.sections.forEach((sec) => sec.items.forEach((r) => out.push(r.id)));
    return out;
  },

  onSelectAll() {
    const ids = this.visibleIds();
    const allSelected = ids.length > 0 && ids.every((id) => this.data.selectedIds.indexOf(id) !== -1);
    this.setData({ selectedIds: allSelected ? [] : ids, selCount: allSelected ? 0 : ids.length });
    this.reload();
  },

  onBatchEaten() {
    if (!this.data.selectedIds.length) return;
    storage.markEatenMany(this.data.selectedIds);
    this.setData({ selectMode: false, selectedIds: [], selCount: 0 });
    this.reload();
    wx.showToast({ title: '已标记食用', icon: 'success' });
  },

  onBatchDelete() {
    const that = this;
    if (!this.data.selectedIds.length) return;
    wx.showModal({
      title: '批量删除',
      content: '确定删除选中的 ' + this.data.selectedIds.length + ' 条记录吗？其中已过期的将计入浪费统计。',
      confirmColor: '#e64340',
      success(res) {
        if (res.confirm) {
          const now = Date.now();
          const ids = that.data.selectedIds;
          ids.forEach((id) => {
            const rec = storage.getFood(id);
            if (!rec) return;
            if (rec.expiryAt < now) storage.discardExpired(id);   // 过期留墓碑
            else storage.removeFood(id);
          });
          that.setData({ selectMode: false, selectedIds: [], selCount: 0 });
          that.reload();
        }
      }
    });
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
