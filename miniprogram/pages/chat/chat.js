'use strict';
const storage = require('../../services/storage.js');
const ai = require('../../services/ai.js');
const shelflife = require('../../services/shelflife.js');
const labels = require('../../services/labels.js');
const { buildChatSystemPrompt, parseCommands, applyCommands } = require('../../services/chat-cmd.js');

let msgSeq = 0;

Page({
  data: {
    bubbles: [],        // 视图模型 {id, role:'user'|'assistant', text, img, actions:[{ok,message}]}
    input: '',
    sending: false,
    photoPath: '',
    scrollInto: ''
  },

  onShow() {
    if (!this.data.bubbles.length) {
      this.pushAssistant('你好！我是冰箱助手 🤖\n可以对我说「买了牛奶」「鸡蛋吃完了」，也可以拍张食物照片让我帮你添加，或者问我营养、做法、储存问题。');
      this.data.scrollInto = '';
    }
  },

  /** 当前库存 system 提示 */
  systemPrompt() {
    const settings = storage.getSettings();
    return buildChatSystemPrompt(storage.listFoods(), Date.now(), settings.remindDays);
  },

  pushAssistant(text, actions) {
    msgSeq++;
    const id = 'm' + msgSeq;
    const bubbles = this.data.bubbles.concat([{
      id: id,
      role: 'assistant',
      text: text,
      img: '',
      actions: actions || []
    }]);
    this.setData({ bubbles: bubbles, scrollInto: id });
  },

  pushUser(text, img) {
    msgSeq++;
    const id = 'm' + msgSeq;
    const bubbles = this.data.bubbles.concat([{ id: id, role: 'user', text: text, img: img || '', actions: [] }]);
    this.setData({ bubbles: bubbles, scrollInto: id });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  onQuick(e) {
    this.setData({ input: e.currentTarget.dataset.text });
  },

  onAttach() {
    if (this.data.sending || this.data.photoPath) return;
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(res) {
        const f = res.tempFiles && res.tempFiles[0];
        if (f) that.setData({ photoPath: f.tempFilePath });
      },
      fail() { /* 取消 */ }
    });
  },

  onRemovePhoto() {
    this.setData({ photoPath: '' });
  },

  onSend() {
    const text = (this.data.input || '').trim();
    const photoPath = this.data.photoPath;
    if ((!text && !photoPath) || this.data.sending) return;
    const that = this;
    this.setData({ sending: true, input: '', photoPath: '' });
    this.pushUser(text || '（发了一张图片）', photoPath);

    const finishRead = (imageBase64) => {
      // 组装对话：system(实时库存) + 历史(文本) + 当前
      const history = [{ role: 'system', content: that.systemPrompt() }];
      that.data.bubbles.forEach((b) => {
        if (b.silent) return;
        history.push({ role: b.role === 'user' ? 'user' : 'assistant', content: b.text });
      });
      ai.sendChat(history, imageBase64).then((r) => {
        if (!r.ok) {
          that.pushAssistant('⚠️ ' + r.error);
          that.setData({ sending: false });
          return;
        }
        // 解析并执行指令；展示文本剥离 <cmd> 块
        const cmds = parseCommands(r.reply);
        const clean = r.reply.replace(/<cmd>[\s\S]*?<\/cmd>/g, '').trim();
        const actions = cmds.length ? applyCommands(cmds, Date.now()).map((x) => ({ ok: x.ok, message: x.message })) : [];
        that.pushAssistant(clean || '（已完成）', actions);
        that.setData({ sending: false });
      });
    };

    if (photoPath) {
      wx.getFileSystemManager().readFile({
        filePath: photoPath,
        encoding: 'base64',
        success(res) { finishRead(res.data); },
        fail() {
          that.pushAssistant('⚠️ 读取图片失败，请重试');
          that.setData({ sending: false });
        }
      });
    } else {
      finishRead(null);
    }
  }
});
