'use strict';
const storage = require('./services/storage.js');

App({
  onLaunch() {
    // 首启即预热设置（含默认 remindDays 等）
    this.globalData.settings = storage.getSettings();
  },
  globalData: {
    settings: null,
    launchReminded: false   // 本次启动是否已弹过临期提醒
  }
});
