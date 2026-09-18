'use strict';
const storage = require('../../services/storage.js');
const ai = require('../../services/ai.js');
const labels = require('../../services/labels.js');
const { buildFoodRecord } = require('../../services/records.js');
const { shouldProceedSave, finishSave } = require('../../services/records.js');
const { searchDb } = require('../../services/search.js');
const { findFood } = require('../../data/shelf-life-db.js');

/** 根据 AI 结果行选择默认分区与天数（优先冷藏，其次冷冻，最后常温） */
function pickZoneDays(food) {
  if (food.fridgeDays) return { zone: 'fridge', days: food.fridgeDays };
  if (food.freezerDays) return { zone: 'freezer', days: food.freezerDays };
  if (food.roomDays) return { zone: 'room', days: food.roomDays };
  return { zone: 'fridge', days: 3 };
}

/** 手动输入名称 → 数据库候选（精确/别名 > 包含匹配，最多6条） */

Page({
  data: {
    photoPath: '',
    photoBase64: '',
    recognizing: false,
    aiError: '',
    aiScene: '',
    results: [],            // 待保存的识别结果行
    aiMode: 'food',         // food=拍食物 receipt=拍小票
    manualMode: false,
    manualName: '',
    manualSuggestions: [],
    zoneLabels: labels.zoneLabels(),
    manualZoneIndex: 0,
    manualDays: 3,
    manualTips: '',
    recentNames: []
  },

  onShow() {
    this.setData({ recentNames: storage.getRecentNames() });
  },

  onSetAiMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.aiMode) return;
    this.setData({ aiMode: mode, results: [], aiError: '', aiScene: '' });
  },

  onChoosePhoto() {
    if (this.data.recognizing) return; // 识别中禁止重复选图
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(res) {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        that.prepareAndRecognize(file.tempFilePath, file.size);
      },
      fail() { /* 用户取消 */ }
    });
  },

  /** 超 6MB 先压缩一次（压缩后仍超 8MB 才拒绝）；随后进入识别 */
  prepareAndRecognize(filePath, size) {
    const that = this;
    const SOFT = 6 * 1024 * 1024;
    const HARD = 8 * 1024 * 1024;
    if (size > SOFT && wx.compressImage) {
      wx.compressImage({
        src: filePath,
        quality: 60,
        success(c) {
          const cSize = (c.tempFiles && c.tempFiles[0] && c.tempFiles[0].size) || 0;
          if (cSize > HARD) {
            wx.showToast({ title: '图片过大且压缩后仍超限', icon: 'none' });
            return;
          }
          that.setData({ photoPath: c.tempFilePath, aiError: '', results: [] });
          that.readAndRecognize(c.tempFilePath);
        },
        fail() {
          if (size > HARD) {
            wx.showToast({ title: '图片超过8MB，请重拍', icon: 'none' });
            return;
          }
          that.setData({ photoPath: filePath, aiError: '', results: [] });
          that.readAndRecognize(filePath);
        }
      });
      return;
    }
    if (size > HARD) {
      wx.showToast({ title: '图片超过8MB，请重拍', icon: 'none' });
      return;
    }
    this.setData({ photoPath: filePath, aiError: '', results: [] });
    this.readAndRecognize(filePath);
  },

  readAndRecognize(filePath) {
    const that = this;
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      encoding: 'base64',
      success(res) {
        that.setData({ photoBase64: res.data });
        that.doRecognize(res.data);
      },
      fail() {
        that.setData({ recognizing: false, aiError: '读取图片失败，请重试' });
      }
    });
  },

  doRecognize(imageBase64) {
    const that = this;
    if (this.data.recognizing) return; // 防重入（选图/重试共用）
    this.setData({ recognizing: true });
    ai.recognizeFood(imageBase64, this.data.aiMode).then((r) => {
      if (!r.ok) {
        that.setData({ recognizing: false, aiError: r.error || '识别失败', results: [] });
        return;
      }
      if (!r.isFood || !r.foods || !r.foods.length) {
        that.setData({
          recognizing: false,
          results: [],
          aiError: 'AI 未在照片中识别到食物，可切换手动添加',
          aiScene: r.scene || ''
        });
        return;
      }
      const rows = r.foods.map((f, i) => {
        const zd = pickZoneDays(f);
        return {
          rid: 'r' + i,
          name: f.name,
          category: f.category,
          categoryIcon: labels.categoryIcon(f.category),
          adjusted: !!f.adjusted,
          confidence: typeof r.confidence === 'number' ? r.confidence : null,
          allDays: f,
          zoneIndex: labels.zoneLabels().indexOf(labels.zoneLabel(zd.zone)),
          zoneKey: zd.zone,
          days: zd.days,
          tips: f.tips || '',
          note: '',
          saved: false
        };
      });
      that.setData({
        recognizing: false,
        aiError: '',
        aiScene: r.scene || '',
        results: rows
      });
    });
  },

  onRetry() {
    if (this.data.photoBase64) this.doRecognize(this.data.photoBase64);
    else this.onChoosePhoto();
  },

  onRowName(e) {
    this.setRow(e.currentTarget.dataset.rid, { name: e.detail.value });
  },
  onRowZone(e) {
    const idx = Number(e.detail.value);
    this.setRow(e.currentTarget.dataset.rid, {
      zoneIndex: idx,
      zoneKey: labels.zoneKeyByIndex(idx),
      days: this.autoDaysForZone(e.currentTarget.dataset.rid, labels.zoneKeyByIndex(idx))
    });
  },
  onRowDays(e) {
    const v = parseInt(e.detail.value, 10);
    this.setRow(e.currentTarget.dataset.rid, { days: Number.isFinite(v) && v > 0 ? Math.min(v, 365) : 1 });
  },
  onRowNote(e) {
    this.setRow(e.currentTarget.dataset.rid, { note: e.detail.value });
  },

  setRow(rid, patch) {
    const results = this.data.results.map((row) => (row.rid === rid ? Object.assign({}, row, patch) : row));
    this.setData({ results });
  },

  /** 切换分区时用该食物该分区的建议天数（数据库/ AI 值）自动带出 */
  autoDaysForZone(rid, zoneKey) {
    const row = this.data.results.filter((r) => r.rid === rid)[0];
    if (!row) return 3;
    const fromAi = zoneKey === 'fridge' ? row.allDays.fridgeDays : zoneKey === 'freezer' ? row.allDays.freezerDays : row.allDays.roomDays;
    if (fromAi) return fromAi;
    const db = findFood(row.name);
    const fromDb = db ? db[zoneKey] : null;
    return fromDb || 3;
  },

  onSaveRow(e) {
    const rid = e.currentTarget.dataset.rid;
    const row = this.data.results.filter((r) => r.rid === rid)[0];
    if (!row || row.saved) return;
    if (!row.name || !row.name.trim()) {
      wx.showToast({ title: '请填写食物名称', icon: 'none' });
      return;
    }
    const zoneKey = labels.zoneKeyByIndex(row.zoneIndex);
    storage.saveFood(buildFoodRecord({
      name: row.name, category: row.category, zoneKey: zoneKey, days: row.days,
      source: 'ai', note: row.note, tips: row.tips, confidence: row.confidence
    }, Date.now()));
    storage.pushRecentName(row.name);
    this.setRow(rid, { saved: true });
    wx.showToast({ title: '已加入冰箱', icon: 'success' });
  },

  onSaveAll() {
    if (!shouldProceedSave(this)) return; // 防连点
    const pendings = this.data.results.filter((r) => !r.saved);
    if (!pendings.length) { finishSave(this); return; }
    const now = Date.now();
    pendings.forEach((row) => {
      const zoneKey = labels.zoneKeyByIndex(row.zoneIndex);
      storage.saveFood(buildFoodRecord({
        name: row.name, category: row.category, zoneKey: zoneKey, days: row.days,
        source: 'ai', note: row.note, tips: row.tips, confidence: row.confidence
      }, now));
      storage.pushRecentName(row.name);
    });
    this.setData({ results: this.data.results.map((r) => Object.assign({}, r, { saved: true })) });
    finishSave(this);
    wx.showToast({ title: pendings.length + ' 项已加入冰箱', icon: 'success' });
  },

  onGoIndex() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // ===== 手动添加 =====
  onToggleManual() {
    this.setData({ manualMode: !this.data.manualMode });
  },
  onRecentTap(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({
      manualMode: true,
      manualName: name,
      manualSuggestions: searchDb(name)
    });
  },
  onManualName(e) {
    this.setData({ manualName: e.detail.value, manualSuggestions: searchDb(e.detail.value) });
  },
  onPickSuggestion(e) {
    const name = e.currentTarget.dataset.name;
    const db = findFood(name);
    if (!db) return;
    const zone = db.fridge ? 'fridge' : db.freezer ? 'freezer' : 'room';
    const days = db[zone] || 3;
    this.setData({
      manualName: db.name,
      manualZoneIndex: labels.zoneLabels().indexOf(labels.zoneLabel(zone)),
      manualDays: days,
      manualTips: db.tips || '',
      manualSuggestions: []
    });
  },
  onManualZone(e) {
    this.setData({ manualZoneIndex: Number(e.detail.value) });
  },
  onManualDays(e) {
    const v = parseInt(e.detail.value, 10);
    this.setData({ manualDays: Number.isFinite(v) && v > 0 ? Math.min(v, 365) : 1 });
  },
  onManualSave() {
    const name = (this.data.manualName || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写食物名称', icon: 'none' });
      return;
    }
    const zoneKey = labels.zoneKeyByIndex(this.data.manualZoneIndex);
    const now = Date.now();
    const db = findFood(name);
    storage.saveFood(buildFoodRecord({
      name: name,
      category: db ? db.category : 'other',
      zoneKey: zoneKey,
      days: this.data.manualDays,
      source: db ? 'db' : 'manual',
      tips: db ? db.tips : ''
    }, now));
    storage.pushRecentName(name);
    this.setData({ manualName: '', manualSuggestions: [], manualTips: '', manualDays: 3, recentNames: storage.getRecentNames() });
    wx.showToast({ title: '已加入冰箱', icon: 'success' });
  }
});
