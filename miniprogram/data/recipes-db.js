'use strict';
/**
 * 家常菜谱库：ingredients 使用保鲜数据库(shelf-life-db)的规范名，
 * 便于与用户库存（含别名）匹配。
 */

const RECIPES = [
  { name: '西红柿炒鸡蛋', ingredients: ['西红柿', '鸡蛋'] },
  { name: '韭菜炒鸡蛋', ingredients: ['韭菜', '鸡蛋'] },
  { name: '韭菜盒子', ingredients: ['韭菜', '鸡蛋'] },
  { name: '苦瓜炒蛋', ingredients: ['苦瓜', '鸡蛋'] },
  { name: '黄瓜炒鸡蛋', ingredients: ['黄瓜', '鸡蛋'] },
  { name: '蛋炒饭', ingredients: ['鸡蛋', '剩饭'] },
  { name: '紫菜蛋花汤', ingredients: ['紫菜(干)', '鸡蛋'] },
  { name: '蛤蜊蒸蛋', ingredients: ['贝类', '鸡蛋'] },
  { name: '酸辣土豆丝', ingredients: ['土豆'] },
  { name: '土豆炖牛肉', ingredients: ['土豆', '牛肉'] },
  { name: '咖喱鸡肉', ingredients: ['土豆', '鸡肉', '胡萝卜'] },
  { name: '西红柿牛腩', ingredients: ['西红柿', '牛肉'] },
  { name: '洋葱炒牛肉', ingredients: ['洋葱', '牛肉'] },
  { name: '香菜炒牛肉', ingredients: ['香菜', '牛肉'] },
  { name: '红烧肉', ingredients: ['猪肉'] },
  { name: '青椒肉丝', ingredients: ['青椒', '猪肉'] },
  { name: '鱼香肉丝', ingredients: ['猪肉', '胡萝卜', '青椒'] },
  { name: '可乐鸡翅', ingredients: ['鸡翅', '可乐'] },
  { name: '宫保鸡丁', ingredients: ['鸡肉', '坚果', '黄瓜'] },
  { name: '小鸡炖蘑菇', ingredients: ['鸡肉', '蘑菇'] },
  { name: '白萝卜炖羊肉', ingredients: ['白萝卜', '羊肉'] },
  { name: '清蒸鲜鱼', ingredients: ['鲜鱼'] },
  { name: '红烧带鱼', ingredients: ['带鱼'] },
  { name: '白灼虾', ingredients: ['虾'] },
  { name: '西兰花炒虾仁', ingredients: ['西兰花', '虾'] },
  { name: '芦笋炒虾仁', ingredients: ['芦笋', '虾'] },
  { name: '蒜蓉西兰花', ingredients: ['西兰花', '大蒜'] },
  { name: '香菇炒青菜', ingredients: ['蘑菇', '小白菜'] },
  { name: '菠菜豆腐汤', ingredients: ['菠菜', '豆腐'] },
  { name: '小葱拌豆腐', ingredients: ['小葱', '豆腐'] },
  { name: '醋溜大白菜', ingredients: ['大白菜'] },
  { name: '手撕卷心菜', ingredients: ['卷心菜'] },
  { name: '干煸四季豆', ingredients: ['四季豆'] },
  { name: '蒜蓉空心菜', ingredients: ['空心菜'] },
  { name: '玉米排骨汤', ingredients: ['玉米', '排骨'] },
  { name: '冬瓜排骨汤', ingredients: ['冬瓜', '排骨'] },
  { name: '莲藕排骨汤', ingredients: ['莲藕', '排骨'] },
  { name: '山药排骨汤', ingredients: ['山药', '排骨'] },
  { name: '南瓜粥', ingredients: ['南瓜', '大米'] },
  { name: '胡萝卜炒肉', ingredients: ['胡萝卜', '猪肉'] }
];

module.exports = { RECIPES };
