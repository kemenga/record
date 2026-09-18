'use strict';
/**
 * AI 识别适配层（wx 依赖仅在此与 storage.js）
 * local 模式：请求本地/自建代理 server（开发者工具需勾选"不校验合法域名"）
 * cloud 模式：调用云函数（见 cloudfunctions/recognize）
 */

const storage = require('./storage.js');

function recognizeFood(imageBase64, mode) {
  const s = storage.getSettings();
  if (s.aiMode === 'cloud') {
    return new Promise((resolve) => {
      if (!wx.cloud || !wx.cloud.callFunction) {
        resolve({ ok: false, error: '当前环境不支持云开发（请用开发者工具打开并开通云开发）' });
        return;
      }
      wx.cloud.callFunction({ name: s.cloudFunctionName, data: { imageBase64: imageBase64, mode: mode || 'food' } })
        .then((res) => {
          const r = res && res.result;
          resolve(r && typeof r === 'object' ? r : { ok: false, error: '云函数返回异常' });
        })
        .catch((err) => {
          resolve({ ok: false, error: '云函数调用失败：' + ((err && err.errMsg) || (err && err.message) || '未知错误') });
        });
    });
  }
  return new Promise((resolve) => {
    wx.request({
      url: s.aiBaseUrl.replace(/\/+$/, '') + '/api/recognize',
      method: 'POST',
      timeout: 50000,
      header: { 'Content-Type': 'application/json' },
      data: { imageBase64: imageBase64, mode: mode || 'food' },
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.ok) {
          resolve(res.data);
        } else {
          const msg = res.data && res.data.error;
          resolve({ ok: false, error: 'AI 服务错误(' + res.statusCode + ')：' + (msg || '请稍后重试') });
        }
      },
      fail(err) {
        resolve({
          ok: false,
          error: '无法连接 AI 服务(' + ((err && err.errMsg) || '') + ')。请先启动本地代理：node server/index.js，或在设置中改用云函数模式'
        });
      }
    });
  });
}

/** 连通性检查（local 模式） */
function checkHealth() {
  const s = storage.getSettings();
  if (s.aiMode === 'cloud') {
    return Promise.resolve({ ok: true, skipped: true, message: '云函数模式无需连通性检查' });
  }
  return new Promise((resolve) => {
    wx.request({
      url: s.aiBaseUrl.replace(/\/+$/, '') + '/api/health',
      method: 'GET',
      timeout: 6000,
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.ok) {
          resolve({ ok: true, model: res.data.model, hasKey: res.data.hasKey });
        } else {
          resolve({ ok: false, error: 'HTTP ' + res.statusCode });
        }
      },
      fail(err) {
        resolve({ ok: false, error: (err && err.errMsg) || '连接失败' });
      }
    });
  });
}

module.exports = { recognizeFood, checkHealth };
