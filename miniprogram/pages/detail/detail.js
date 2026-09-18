'use strict';
const storage = require('../../services/storage.js');
const shelflife = require('../../services/shelflife.js');
const labels = require('../../services/labels.js');
const { buildFoodRecord } = require('../../services/records.js');

Page({
  data: {
    id: '',
    food: null,          // 视图模型
    zoneLabels: labels.zoneLabels(),
    editZoneIndex: 0,
    editDays: 1,
    editName: '',
    editing: false
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  onShow() {
    this.reload();
  },

  reload() {
    const rec = storage.getFood(this.data.id);
    if (!rec) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const now = Date.now();
    const settings = storage.getSettings();
    const view = shelflife.applyOpened(rec);   // 已开封则按开封窗口计算
    const status = shelflife.getStatus(view.expiryAt, now, settings.remindDays);
    const vm = Object.assign({}, view, {
      status,
      statusText: status === 'expired' ? '已过期' : status === 'expiring' ? '即将到期' : '新鲜',
      daysText: labels.daysLeftText(shelflife.getDaysLeft(view.expiryAt, now)),
      progressPercent: Math.round(shelflife.getProgress(view, now) * 100),
      zoneLabel: labels.zoneLabel(rec.zone),
      categoryLabel: labels.categoryLabel(rec.category),
      categoryIcon: labels.categoryIcon(rec.category),
      addedText: this.fmt(rec.addedAt),
      expiryText: this.fmt(view.expiryAt),
      openedText: view.opened ? '已开封 · 开封后 ' + rec.openedDays + ' 天内食用' : '',
      sourceText: rec.source === 'ai' ? 'AI 识别' : rec.source === 'db' ? '保鲜数据库' : '手动录入',
      tips: (rec.ai && rec.ai.tips) || '',
      confidenceText: rec.ai && rec.ai.confidence !== null && rec.ai.confidence !== undefined
        ? 'AI 置信度 ' + Math.round(rec.ai.confidence * 100) + '%'
        : ''
    });
    this.setData({
      food: vm,
      editName: rec.name,
      editZoneIndex: labels.zoneLabels().indexOf(labels.zoneLabel(rec.zone)),
      editDays: rec.shelfDays || 1
    });
    wx.setNavigationBarTitle({ title: rec.name });
  },

  fmt(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  },

  onToggleEdit() {
    this.setData({ editing: !this.data.editing });
  },
  onEditName(e) { this.setData({ editName: e.detail.value }); },
  onEditZone(e) { this.setData({ editZoneIndex: Number(e.detail.value) }); },
  onEditDays(e) {
    const v = parseInt(e.detail.value, 10);
    this.setData({ editDays: Number.isFinite(v) && v > 0 ? Math.min(v, 365) : 1 });
  },
  onEditSave() {
    const name = (this.data.editName || '').trim();
    if (!name) {
      wx.showToast({ title: '名称不能为空', icon: 'none' });
      return;
    }
    // 语义：编辑后的天数为"从今天起还能存放的天数"
    const rebuilt = buildFoodRecord({
      name: name,
      zoneKey: labels.zoneKeyByIndex(this.data.editZoneIndex),
      days: this.data.editDays,
      source: this.data.food.source,
      note: this.data.food.note,
      tips: this.data.food.tips
    }, Date.now());
    storage.updateFood(this.data.id, {
      name: rebuilt.name,
      zone: rebuilt.zone,
      shelfDays: rebuilt.shelfDays,
      expiryAt: rebuilt.expiryAt
    });
    this.setData({ editing: false });
    this.reload();
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  onOpenFood() {
    const rec = storage.getFood(this.data.id);
    if (!rec || rec.openedAt) return;
    const suggested = shelflife.openPatch(rec, Date.now()).openedDays;
    const that = this;
    wx.showActionSheet({
      itemList: ['建议 ' + suggested + ' 天（按类别）', '1 天', '2 天', '3 天', '7 天'],
      success(res) {
        const days = res.tapIndex === 0 ? suggested : [1, 2, 3, 7][res.tapIndex - 1];
        storage.updateFood(that.data.id, shelflife.openPatch(rec, Date.now(), days));
        that.reload();
        wx.showToast({ title: '已标记开封', icon: 'success' });
      },
      fail() { /* 取消 */ }
    });
  },

  onEaten() {
    const that = this;
    wx.showModal({
      title: '标记已食用',
      content: '该食物将从清单移除（可在更换数据前随时新增）',
      confirmText: '已吃完',
      success(res) {
        if (res.confirm) {
          storage.markEaten(that.data.id);
          wx.showToast({ title: '干得干净！', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        }
      }
    });
  },

  onDelete() {
    const that = this;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条食物记录吗？不可恢复。',
      confirmColor: '#e64340',
      success(res) {
        if (res.confirm) {
          storage.removeFood(that.data.id);
          wx.navigateBack();
        }
      }
    });
  }
});
