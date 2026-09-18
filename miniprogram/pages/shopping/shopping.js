'use strict';
const storage = require('../../services/storage.js');
const { shoppingToRecords } = require('../../services/records.js');

Page({
  data: {
    items: [],          // 未买
    doneItems: [],      // 已买
    inputName: '',
    recentEaten: []     // 最近吃过（补货建议）
  },

  onShow() {
    this.reload();
  },

  reload() {
    this.setData({
      items: storage.listShopping(),
      doneItems: storage.listShopping(true).filter((x) => x.done),
      recentEaten: storage.getRecentNames().slice(0, 5)
    });
  },

  onInput(e) {
    this.setData({ inputName: e.detail.value });
  },

  onAdd() {
    const name = (this.data.inputName || '').trim();
    if (!name) return;
    storage.addShopping(name);
    this.setData({ inputName: '' });
    this.reload();
  },

  onQuickAdd(e) {
    storage.addShopping(e.currentTarget.dataset.name);
    this.reload();
  },

  onToggle(e) {
    storage.toggleShopping(e.currentTarget.dataset.id);
    this.reload();
  },

  onRemove(e) {
    storage.removeShopping(e.currentTarget.dataset.id);
    this.reload();
  },

  onClearDone() {
    storage.clearDoneShopping();
    this.reload();
  },

  /** 已买的批量入库（按数据库建议：默认冷藏），入库后从清单移除 */
  onBuyIntoFridge() {
    const done = this.data.doneItems;
    if (!done.length) return;
    const recs = shoppingToRecords(done, Date.now());
    recs.forEach((r) => {
      storage.saveFood(r);
      storage.pushRecentName(r.name);
    });
    done.forEach((x) => storage.removeShopping(x.id));
    this.reload();
    wx.showModal({
      title: '入库完成',
      content: recs.length + ' 件已按建议保鲜期放入冰箱（默认冷藏）',
      showCancel: false
    });
  }
});
