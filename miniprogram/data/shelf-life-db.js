'use strict';
/**
 * 内置食物保鲜数据库
 * 数据依据：USDA FoodKeeper / FoodSafety.gov 冷藏冷冻储存表 + 中文食品安全科普（政府食安文章）
 * 温度标准：冷藏 ≤4°C，冷冻 ≤-18°C，常温 = 阴凉干燥避光处
 * 天数为"建议保鲜期"（品质最佳期限），偏保守取值；null 表示不建议该方式储存
 */

const CATEGORIES = [
  { key: 'vegetable', label: '蔬菜', icon: '🥬' },
  { key: 'fruit', label: '水果', icon: '🍎' },
  { key: 'meat', label: '肉禽', icon: '🥩' },
  { key: 'seafood', label: '水产', icon: '🐟' },
  { key: 'dairy', label: '乳制品', icon: '🥛' },
  { key: 'egg', label: '蛋类', icon: '🥚' },
  { key: 'cooked', label: '熟食剩菜', icon: '🍲' },
  { key: 'staple', label: '主食粮油', icon: '🍚' },
  { key: 'snack', label: '零食饮料', icon: '🍪' },
  { key: 'other', label: '其他', icon: '🧂' }
];

const ZONES = [
  { key: 'fridge', label: '冷藏' },
  { key: 'freezer', label: '冷冻' },
  { key: 'room', label: '常温' }
];

/** 各分区建议天数安全上限（防 AI 幻觉与数据录入错误） */
const DAY_LIMITS = { room: 365, fridge: 90, freezer: 365 };

const DB = [
  // ===== 蔬菜 =====
  { name: '西红柿', aliases: ['番茄'], category: 'vegetable', room: 5, fridge: 7, freezer: null, tips: '未熟透可常温放熟；熟后冷藏并尽快食用' },
  { name: '黄瓜', aliases: ['青瓜'], category: 'vegetable', room: 2, fridge: 5, freezer: null, tips: '冷藏易出现冻伤斑，用厨房纸包好放门格' },
  { name: '生菜', aliases: ['莴苣叶'], category: 'vegetable', room: 1, fridge: 5, freezer: null, tips: '厨房纸包裹装袋冷藏，避免压伤' },
  { name: '菠菜', category: 'vegetable', room: 1, fridge: 5, freezer: 60, tips: '焯水挤干后冷冻可延长保存' },
  { name: '西兰花', aliases: ['绿花菜'], category: 'vegetable', room: 2, fridge: 7, freezer: 300, tips: '掰小朵焯水后冷冻' },
  { name: '胡萝卜', category: 'vegetable', room: 5, fridge: 30, freezer: 300, tips: '去缨防抽水分，切片焯水后冷冻' },
  { name: '土豆', aliases: ['马铃薯', '洋芋'], category: 'vegetable', room: 30, fridge: null, freezer: null, tips: '避光阴凉；冷藏会使淀粉转糖影响口感' },
  { name: '红薯', aliases: ['地瓜', '甘薯'], category: 'vegetable', room: 30, fridge: null, freezer: 300, tips: '切块焯水后可冷冻' },
  { name: '洋葱', category: 'vegetable', room: 60, fridge: null, freezer: null, tips: '阴凉通风；切开后的包紧冷藏并在7天内用完' },
  { name: '大蒜', category: 'vegetable', room: 60, fridge: null, freezer: null, tips: '阴凉干燥；剥好的蒜瓣冷藏30天内用完' },
  { name: '生姜', category: 'vegetable', room: 14, fridge: 30, freezer: 180, tips: '可切片冷冻随取随用' },
  { name: '大白菜', category: 'vegetable', room: 2, fridge: 15, freezer: 90, tips: '整颗报纸包裹冷藏；切丝焯水后冷冻' },
  { name: '小白菜', aliases: ['上海青', '油菜'], category: 'vegetable', room: 1, fridge: 5, freezer: 90, tips: '焯水后冷冻' },
  { name: '韭菜', category: 'vegetable', room: 1, fridge: 4, freezer: 90, tips: '干燥纸包好冷藏，尽快食用' },
  { name: '芹菜', category: 'vegetable', room: 2, fridge: 14, freezer: 300, tips: '切段焯水后冷冻' },
  { name: '茄子', category: 'vegetable', room: 3, fridge: 7, freezer: null, tips: '怕冷怕热，13°C 左右最佳，尽快食用' },
  { name: '青椒', aliases: ['彩椒', '甜椒'], category: 'vegetable', room: 3, fridge: 10, freezer: 300, tips: '去籽切块焯水后冷冻' },
  { name: '蘑菇', aliases: ['口蘑', '香菇'], category: 'vegetable', room: 2, fridge: 7, freezer: null, tips: '纸袋冷藏透气防黏；建议炒熟后再冷冻' },
  { name: '金针菇', category: 'vegetable', room: 1, fridge: 7, freezer: null, tips: '原包装冷藏，开袋后尽快食用' },
  { name: '南瓜', category: 'vegetable', room: 90, fridge: null, freezer: 300, tips: '整颗阴凉存放；切开后去瓤密封冷藏7天内用完' },
  { name: '冬瓜', category: 'vegetable', room: 30, fridge: 7, freezer: null, tips: '切面覆保鲜膜冷藏，尽快食用' },
  { name: '豆腐', category: 'vegetable', room: 1, fridge: 5, freezer: 60, tips: '清水浸没冷藏每天换水；冷冻成冻豆腐另算' },
  { name: '豆芽', aliases: ['黄豆芽', '绿豆芽'], category: 'vegetable', room: 1, fridge: 3, freezer: null, tips: '极易变质，尽快食用' },
  { name: '玉米', aliases: ['甜玉米'], category: 'vegetable', room: 1, fridge: 2, freezer: 300, tips: '带苞叶冷藏；焯水后整根冷冻' },
  { name: '秋葵', category: 'vegetable', room: 2, fridge: 5, freezer: 300, tips: '擦干后装袋冷藏，勿沾水' },
  { name: '莲藕', category: 'vegetable', room: 3, fridge: 7, freezer: null, tips: '带泥阴凉存放；切开后泡水冷藏防氧化' },
  { name: '山药', category: 'vegetable', room: 30, fridge: null, freezer: null, tips: '阴凉干燥；切口处易氧化，包好冷藏7天内用完' },
  { name: '芦笋', category: 'vegetable', room: 1, fridge: 5, freezer: 300, tips: '根部沾湿厨房纸直立冷藏' },
  { name: '苦瓜', category: 'vegetable', room: 2, fridge: 5, freezer: null, tips: '用纸包好冷藏，避免冷风直吹' },
  { name: '四季豆', aliases: ['芸豆', '豆角'], category: 'vegetable', room: 2, fridge: 7, freezer: 300, tips: '必须彻底煮熟；焯水后冷冻' },
  { name: '香菜', aliases: ['芫荽'], category: 'vegetable', room: 2, fridge: 7, freezer: 90, tips: '湿纸包根冷藏或切碎冻存' },
  { name: '卷心菜', aliases: ['圆白菜', '甘蓝'], category: 'vegetable', room: 5, fridge: 21, freezer: 300, tips: '外叶保护内叶，切丝焯水后冷冻' },
  { name: '白萝卜', aliases: ['萝卜'], category: 'vegetable', room: 14, fridge: 30, freezer: null, tips: '去缨防糠心，纸包冷藏' },

  // ===== 水果 =====
  { name: '苹果', category: 'fruit', room: 14, fridge: 45, freezer: 240, tips: '乙烯释放量大，与其他果蔬分开存放' },
  { name: '香蕉', category: 'fruit', room: 5, fridge: null, freezer: 90, tips: '冷藏果皮变黑属正常；剥皮密封后冷冻可做奶昔' },
  { name: '橙子', aliases: ['脐橙', '甜橙'], category: 'fruit', room: 14, fridge: 30, freezer: null, tips: '阴凉或冷藏均可' },
  { name: '葡萄', category: 'fruit', room: 3, fridge: 14, freezer: 180, tips: '洗净沥干装袋冷冻可当冰品' },
  { name: '草莓', category: 'fruit', room: 1, fridge: 3, freezer: 180, tips: '不洗直接冷藏，吃前再洗' },
  { name: '蓝莓', category: 'fruit', room: 2, fridge: 10, freezer: 180, tips: '保持干燥冷藏' },
  { name: '西瓜', category: 'fruit', room: 5, fridge: 10, freezer: null, tips: '整瓜阴凉；切开覆膜冷藏并在2天内吃完' },
  { name: '桃子', category: 'fruit', room: 3, fridge: 7, freezer: 90, tips: '未熟常温放熟，熟后冷藏' },
  { name: '芒果', category: 'fruit', room: 5, fridge: 7, freezer: null, tips: '低温易冻伤，成熟后尽快食用' },
  { name: '菠萝', category: 'fruit', room: 4, fridge: 7, freezer: 90, tips: '切块冷冻可打冰沙' },
  { name: '猕猴桃', aliases: ['奇异果'], category: 'fruit', room: 5, fridge: 21, freezer: null, tips: '硬果常温催熟，软果冷藏' },
  { name: '柠檬', category: 'fruit', room: 14, fridge: 45, freezer: null, tips: '密封袋冷藏防干瘪' },
  { name: '梨', category: 'fruit', room: 5, fridge: 14, freezer: 240, tips: '乙烯较多，与其他水果分开' },
  { name: '樱桃', category: 'fruit', room: 2, fridge: 5, freezer: 90, tips: '带柄不洗冷藏，吃前再洗' },
  { name: '荔枝', category: 'fruit', room: 1, fridge: 4, freezer: 90, tips: '壳变褐属正常；去壳冷冻' },
  { name: '龙眼', aliases: ['桂圆(鲜)'], category: 'fruit', room: 2, fridge: 5, freezer: 90, tips: '装袋冷藏' },
  { name: '哈密瓜', category: 'fruit', room: 5, fridge: 10, freezer: null, tips: '切开覆膜冷藏2天内吃完' },
  { name: '火龙果', category: 'fruit', room: 5, fridge: 10, freezer: null, tips: '热带水果怕冷，避免久放冷藏' },
  { name: '柿子', category: 'fruit', room: 5, fridge: 10, freezer: null, tips: '软柿尽快吃；硬柿常温催熟' },
  { name: '柚子', category: 'fruit', room: 30, fridge: 60, freezer: null, tips: '整颗阴凉；剥开后密封冷藏5天内吃完' },

  // ===== 肉禽 =====
  { name: '猪肉', aliases: ['生猪肉', '猪瘦肉'], category: 'meat', room: null, fridge: 3, freezer: 180, tips: '分装单次用量冷冻，避免反复解冻' },
  { name: '牛肉', aliases: ['生牛肉', '牛腱'], category: 'meat', room: null, fridge: 4, freezer: 270, tips: '原包装冷藏尽快烹饪；分装冷冻' },
  { name: '羊肉', category: 'meat', room: null, fridge: 3, freezer: 180, tips: '分装冷冻，避免反复解冻' },
  { name: '鸡肉', aliases: ['生鸡肉', '鸡胸肉', '鸡腿'], category: 'meat', room: null, fridge: 2, freezer: 270, tips: '生鲜禽肉极易变质，1-2天内烹饪' },
  { name: '鸭肉', category: 'meat', room: null, fridge: 2, freezer: 270, tips: '同禽肉，尽快烹饪' },
  { name: '排骨', aliases: ['猪排骨', '肋排'], category: 'meat', room: null, fridge: 3, freezer: 180, tips: '分袋冷冻' },
  { name: '肉馅', aliases: ['碎肉', '猪肉末'], category: 'meat', room: null, fridge: 1, freezer: 120, tips: '绞碎后更易变质，当天烹饪最佳' },
  { name: '培根', category: 'meat', room: null, fridge: 7, freezer: 30, tips: '开封后密封冷藏' },
  { name: '火腿', aliases: ['火腿片'], category: 'meat', room: null, fridge: 5, freezer: 60, tips: '开封后密封冷藏尽快食用' },
  { name: '香肠', aliases: ['生香肠'], category: 'meat', room: null, fridge: 2, freezer: 60, tips: '生香肠冷藏仅1-2天' },
  { name: '午餐肉', category: 'meat', room: null, fridge: 5, freezer: null, tips: '开封后密封冷藏，3-5天内吃完' },
  { name: '腊肉', aliases: ['腊肠'], category: 'meat', room: 30, fridge: 90, freezer: null, tips: '阴凉干燥悬挂；夏季建议冷藏' },
  { name: '熟肉', aliases: ['酱牛肉', '卤肉', '烧鸡'], category: 'meat', room: null, fridge: 4, freezer: 90, tips: '晾凉后密封冷藏，吃前彻底加热' },

  // ===== 水产 =====
  { name: '鲜鱼', aliases: ['鱼片', '鱼段'], category: 'seafood', room: null, fridge: 2, freezer: 180, tips: '去鳞去内脏洗净擦干后冷冻' },
  { name: '带鱼', category: 'seafood', room: null, fridge: 2, freezer: 180, tips: '切段冷冻' },
  { name: '三文鱼', category: 'seafood', room: null, fridge: 2, freezer: 60, tips: '刺身级当天食用；冷冻后再生食需-35°C商用冷冻' },
  { name: '虾', aliases: ['基围虾', '鲜虾'], category: 'seafood', room: null, fridge: 2, freezer: 180, tips: '加少量水冻成虾块防风干' },
  { name: '蟹', aliases: ['大闸蟹', '梭子蟹'], category: 'seafood', room: null, fridge: 1, freezer: 90, tips: '活蟹当天蒸食最佳；死蟹勿食' },
  { name: '贝类', aliases: ['蛤蜊', '花蛤', '蛏子'], category: 'seafood', room: null, fridge: 2, freezer: 90, tips: '吐沙后冷藏，尽快烹饪' },
  { name: '鱿鱼', category: 'seafood', room: null, fridge: 2, freezer: 180, tips: '洗净切段冷冻' },

  // ===== 乳制品 =====
  { name: '牛奶', aliases: ['鲜牛奶'], category: 'dairy', room: null, fridge: 7, freezer: 90, tips: '以包装保质期为准；开封后3天内喝完' },
  { name: '酸奶', category: 'dairy', room: null, fridge: 14, freezer: null, tips: '以包装日期为准；冷冻会分层' },
  { name: '奶酪', aliases: ['芝士'], category: 'dairy', room: null, fridge: 30, freezer: 120, tips: '密封防霉变，切面用蜡纸包裹' },
  { name: '黄油', aliases: ['牛油'], category: 'dairy', room: null, fridge: 60, freezer: 270, tips: '密封避光防串味' },
  { name: '淡奶油', aliases: ['鲜奶油'], category: 'dairy', room: null, fridge: 14, freezer: null, tips: '开封后挤掉空气，3-7天内用完' },
  { name: '奶油蛋糕', category: 'dairy', room: 1, fridge: 2, freezer: null, tips: '必须冷藏，当天食用最佳' },

  // ===== 蛋类 =====
  { name: '鸡蛋', category: 'egg', room: 15, fridge: 35, freezer: null, tips: '大头朝上冷藏；带壳不宜冷冻，打散可冻' },
  { name: '鹌鹑蛋', category: 'egg', room: 10, fridge: 30, freezer: null, tips: '冷藏保存' },
  { name: '咸鸭蛋', category: 'egg', room: 30, fridge: 60, freezer: null, tips: '熟制品开封后冷藏尽快食用' },
  { name: '皮蛋', aliases: ['松花蛋'], category: 'egg', room: 60, fridge: null, freezer: null, tips: '阴凉存放，剥壳后当餐吃完' },

  // ===== 熟食剩菜 =====
  { name: '剩饭', category: 'cooked', room: null, fridge: 2, freezer: 30, tips: '晾凉后尽快冷藏，吃前彻底加热，只热一次' },
  { name: '剩菜', aliases: ['炒菜', '炖菜'], category: 'cooked', room: null, fridge: 3, freezer: 60, tips: '动筷前分装冷藏更安全；吃前彻底加热' },
  { name: '汤类', aliases: ['煲汤', '炖汤'], category: 'cooked', room: null, fridge: 3, freezer: 90, tips: '煮沸后不搅动冷藏，复热时再彻底煮沸' },
  { name: '卤味', aliases: ['卤牛肉', '卤鸭脖'], category: 'cooked', room: null, fridge: 2, freezer: null, tips: '开封后尽快食用，散装卤味当日吃完' },
  { name: '包子', aliases: ['馒头', '花卷'], category: 'cooked', room: 1, fridge: 3, freezer: 60, tips: '蒸熟放凉后分装冷冻，吃前复蒸' },
  { name: '生面点', aliases: ['生饺子', '生馄饨', '饺子皮'], category: 'cooked', room: 1, fridge: 3, freezer: 90, tips: '撒粉防粘分装冷冻' },
  { name: '凉菜', category: 'cooked', room: null, fridge: 1, freezer: null, tips: '最好当餐吃完，隔夜不再食用' },

  // ===== 主食粮油 =====
  { name: '大米', category: 'staple', room: 180, fridge: null, freezer: null, tips: '密封防潮防虫，阴凉存放' },
  { name: '面粉', category: 'staple', room: 180, fridge: null, freezer: null, tips: '密封防潮防虫' },
  { name: '杂粮', aliases: ['小米', '燕麦', '红豆'], category: 'staple', room: 180, fridge: null, freezer: null, tips: '密封防潮，夏季可冷藏防虫' },
  { name: '挂面', aliases: ['面条(干)'], category: 'staple', room: 365, fridge: null, freezer: null, tips: '干燥避光存放' },
  { name: '面包', category: 'staple', room: 4, fridge: 7, freezer: 90, tips: '切片冷冻保存口感更好，吃前烤制' },
  { name: '食用油', category: 'staple', room: 365, fridge: null, freezer: null, tips: '避光阴凉；开封后3个月内用完更佳' },
  { name: '罐头', aliases: ['午餐肉罐头', '水果罐头'], category: 'staple', room: 365, fridge: 3, freezer: null, tips: '未开封常温；开封后转移容器冷藏3天内吃完' },

  // ===== 零食饮料 =====
  { name: '薯片', category: 'snack', room: 14, fridge: null, freezer: null, tips: '开封后夹紧密封防受潮' },
  { name: '饼干', category: 'snack', room: 30, fridge: null, freezer: null, tips: '开封后密封防潮' },
  { name: '巧克力', category: 'snack', room: 60, fridge: null, freezer: null, tips: '15°C以下避光；冷藏易结霜发白' },
  { name: '坚果', aliases: ['核桃', '腰果', '瓜子'], category: 'snack', room: 30, fridge: 90, freezer: 180, tips: '密封防氧化，有哈喇味即丢弃' },
  { name: '可乐', aliases: ['汽水', '碳酸饮料'], category: 'snack', room: 90, fridge: 90, freezer: null, tips: '不可冷冻，会爆裂' },
  { name: '果汁', aliases: ['鲜榨果汁'], category: 'snack', room: null, fridge: 3, freezer: null, tips: '鲜榨汁尽快饮用；开封瓶装以标签为准' },
  { name: '啤酒', category: 'snack', room: 90, fridge: 90, freezer: null, tips: '避光防曝晒；不可冷冻' },
  { name: '茶叶', aliases: ['绿茶', '红茶'], category: 'snack', room: 180, fridge: null, freezer: null, tips: '密封避光防潮防串味' },

  // ===== 其他 =====
  { name: '酱油', category: 'other', room: 180, fridge: null, freezer: null, tips: '开封后避光；瓶口保持洁净' },
  { name: '番茄酱', category: 'other', room: 30, fridge: 90, freezer: null, tips: '开封后必须冷藏' },
  { name: '辣椒酱', aliases: ['老干妈'], category: 'other', room: 30, fridge: 60, freezer: null, tips: '取用时用干净餐具，防霉变' },
  { name: '醋', category: 'other', room: 365, fridge: null, freezer: null, tips: '常温避光即可' },

  // ===== 蔬菜（扩容） =====
  { name: '娃娃菜', category: 'vegetable', room: 1, fridge: 10, freezer: 90, tips: '焯水后冷冻' },
  { name: '油麦菜', category: 'vegetable', room: 1, fridge: 4, freezer: 90, tips: '纸包冷藏，尽快食用' },
  { name: '茼蒿', category: 'vegetable', room: 1, fridge: 4, freezer: 90, tips: '易蔫，尽快食用' },
  { name: '空心菜', aliases: ['通菜'], category: 'vegetable', room: 1, fridge: 3, freezer: 90, tips: '极易老化，当天烹饪最佳' },
  { name: '苋菜', category: 'vegetable', room: 1, fridge: 3, freezer: 90, tips: '尽快食用' },
  { name: '蒜苗', aliases: ['蒜薹'], category: 'vegetable', room: 2, fridge: 7, freezer: 90, tips: '切段焯水后冷冻' },
  { name: '大葱', category: 'vegetable', room: 14, fridge: 20, freezer: 90, tips: '整根阴凉存放；切开的密封冷藏' },
  { name: '小葱', aliases: ['香葱'], category: 'vegetable', room: 3, fridge: 5, freezer: 90, tips: '切碎冻存随取随用' },
  { name: '莴笋', category: 'vegetable', room: 5, fridge: 14, freezer: null, tips: '带叶冷藏更保水' },
  { name: '西葫芦', category: 'vegetable', room: 3, fridge: 7, freezer: 90, tips: '切片焯水后冷冻' },
  { name: '荸荠', aliases: ['马蹄'], category: 'vegetable', room: 7, fridge: 14, freezer: null, tips: '带泥阴凉；去皮后泡水冷藏' },
  { name: '芋头', aliases: ['芋艿'], category: 'vegetable', room: 30, fridge: null, freezer: null, tips: '阴凉干燥；去皮切块需冷冻' },
  { name: '紫甘蓝', category: 'vegetable', room: 5, fridge: 21, freezer: 90, tips: '切丝焯水后冷冻' },
  { name: '豌豆', aliases: ['甜豆'], category: 'vegetable', room: 2, fridge: 5, freezer: 300, tips: '剥粒焯水后冷冻' },
  { name: '毛豆', category: 'vegetable', room: 1, fridge: 3, freezer: 300, tips: '焯水后冷冻保持翠绿' },
  { name: '菜心', category: 'vegetable', room: 1, fridge: 5, freezer: 90, tips: '纸包冷藏' },

  // ===== 水果（扩容） =====
  { name: '柑橘', aliases: ['橘子', '桔子'], category: 'fruit', room: 14, fridge: 30, freezer: null, tips: '阴凉或冷藏' },
  { name: '榴莲', category: 'fruit', room: 4, fridge: 5, freezer: 90, tips: '开壳后果肉密封冷冻' },
  { name: '山竹', category: 'fruit', room: 4, fridge: 8, freezer: null, tips: '冷藏防风干，蒂绿新鲜' },
  { name: '百香果', category: 'fruit', room: 14, fridge: 14, freezer: null, tips: '皱皮不影响果肉' },
  { name: '鲜枣', aliases: ['冬枣'], category: 'fruit', room: 5, fridge: 10, freezer: null, tips: '冷藏保脆' },
  { name: '葡萄柚', aliases: ['西柚'], category: 'fruit', room: 20, fridge: 30, freezer: null, tips: '阴凉或冷藏' },
  { name: '李子', category: 'fruit', room: 3, fridge: 7, freezer: 90, tips: '未熟常温放熟' },
  { name: '杏', category: 'fruit', room: 3, fridge: 7, freezer: 90, tips: '熟果尽快食用' },
  { name: '圣女果', aliases: ['樱桃番茄'], category: 'fruit', room: 5, fridge: 10, freezer: null, tips: '避免冷藏过久失味' },
  { name: '甘蔗', category: 'fruit', room: 14, fridge: 20, freezer: null, tips: '切段密封冷藏；发红变质勿食' },

  // ===== 肉禽（扩容） =====
  { name: '猪肝', category: 'meat', room: null, fridge: 1, freezer: 90, tips: '当天烹饪最佳' },
  { name: '猪蹄', category: 'meat', room: null, fridge: 2, freezer: 180, tips: '分袋冷冻' },
  { name: '鸡翅', category: 'meat', room: null, fridge: 2, freezer: 270, tips: '生鲜禽肉1-2天内烹饪' },
  { name: '鸡爪', category: 'meat', room: null, fridge: 2, freezer: 270, tips: '焯水后冷冻更省事' },
  { name: '牛肚', category: 'meat', room: null, fridge: 2, freezer: 90, tips: '洗净焯水后冷冻' },
  { name: '火锅丸子', aliases: ['贡丸', '丸子'], category: 'meat', room: null, fridge: 7, freezer: 150, tips: '开封后密封冷冻' },

  // ===== 水产（扩容） =====
  { name: '生蚝', aliases: ['牡蛎', '海蛎'], category: 'seafood', room: null, fridge: 2, freezer: 90, tips: '带壳湿布冷藏，尽快食用' },
  { name: '扇贝', category: 'seafood', room: null, fridge: 2, freezer: 90, tips: '取肉洗净冷冻' },
  { name: '墨鱼', aliases: ['乌贼'], category: 'seafood', room: null, fridge: 2, freezer: 180, tips: '去皮切段冷冻' },
  { name: '秋刀鱼', category: 'seafood', room: null, fridge: 2, freezer: 180, tips: '去内脏洗净冷冻' },
  { name: '虾皮', category: 'seafood', room: 90, fridge: 90, freezer: null, tips: '密封防潮，有异味即弃' },
  { name: '海带(鲜)', category: 'seafood', room: 2, fridge: 7, freezer: 90, tips: '洗净切段冷冻' },
  { name: '紫菜(干)', category: 'seafood', room: 365, fridge: null, freezer: null, tips: '密封避光防潮' },

  // ===== 乳制品（扩容） =====
  { name: '奶粉(开封)', category: 'dairy', room: 30, fridge: null, freezer: null, tips: '密封防潮，一个月内用完' },
  { name: '布丁', category: 'dairy', room: 1, fridge: 5, freezer: null, tips: '冷藏保存，按标签为准' },

  // ===== 熟食剩菜（扩容） =====
  { name: '寿司', category: 'cooked', room: null, fridge: 1, freezer: null, tips: '生食级，当餐吃完最佳，隔夜勿食' },
  { name: '三明治', category: 'cooked', room: 1, fridge: 2, freezer: null, tips: '含蛋奶酱料易变质，尽快食用' },
  { name: '沙拉', category: 'cooked', room: null, fridge: 1, freezer: null, tips: '酱汁拌匀后当餐吃完' },
  { name: '酱鸭', category: 'cooked', room: 1, fridge: 3, freezer: 60, tips: '密封冷藏，吃前蒸透' },
  { name: '粽子(真空)', category: 'cooked', room: 90, fridge: 7, freezer: 90, tips: '按包装为准；开封后冷藏尽快食用' },
  { name: '汤圆', category: 'cooked', room: null, fridge: 1, freezer: 90, tips: '冷冻保存防开裂粘连' },
  { name: '年糕', category: 'cooked', room: 3, fridge: 7, freezer: 90, tips: '浸泡冷水冷藏每天换水，或切片冷冻' },

  // ===== 主食粮油（扩容） =====
  { name: '意面(干)', aliases: ['意大利面'], category: 'staple', room: 365, fridge: null, freezer: null, tips: '干燥避光' },
  { name: '米粉(干)', category: 'staple', room: 365, fridge: null, freezer: null, tips: '干燥避光防潮' },

  // ===== 零食饮料（扩容） =====
  { name: '冰淇淋', category: 'snack', room: null, fridge: null, freezer: 90, tips: '-18°C 保存，避免反复化冻' },
  { name: '果冻', category: 'snack', room: 90, fridge: null, freezer: null, tips: '避免高温暴晒' },
  { name: '辣条', category: 'snack', room: 30, fridge: null, freezer: null, tips: '开封后密封尽快吃完' },
  { name: '咖啡粉', aliases: ['咖啡豆'], category: 'snack', room: 180, fridge: null, freezer: null, tips: '密封避光，开封后风味递减' },
  { name: '现制奶茶', category: 'snack', room: 1, fridge: 1, freezer: null, tips: '2小时内饮用最佳，隔夜勿饮' },
  { name: '口香糖', category: 'snack', room: 365, fridge: null, freezer: null, tips: '避热防粘连' },

  // ===== 其他（扩容） =====
  { name: '蚝油(开封)', category: 'other', room: 30, fridge: 90, freezer: null, tips: '开封后冷藏更稳，瓶口擦净' },
  { name: '料酒', category: 'other', room: 365, fridge: null, freezer: null, tips: '拧紧避光' },
  { name: '香油', category: 'other', room: 365, fridge: null, freezer: null, tips: '避光防哈喇' },
  { name: '盐', category: 'other', room: 365, fridge: null, freezer: null, tips: '防潮即可' },
  { name: '鸡精', aliases: ['味精'], category: 'other', room: 365, fridge: null, freezer: null, tips: '密封防潮' },
  { name: '火锅底料(开封)', category: 'other', room: 30, fridge: 90, freezer: null, tips: '密封冷藏防霉' },
  { name: '豆瓣酱(开封)', category: 'other', room: 30, fridge: 90, freezer: null, tips: '取用干净餐具，表面注油隔绝空气' }
];

/** 按名称或别名精确查找（自动去除首尾空白）；找不到返回 null */
function findFood(name) {
  if (typeof name !== 'string') return null;
  const key = name.trim();
  if (!key) return null;
  for (const item of DB) {
    if (item.name === key) return item;
    if (item.aliases && item.aliases.indexOf(key) !== -1) return item;
  }
  return null;
}

module.exports = { CATEGORIES, ZONES, DB, DAY_LIMITS, findFood };
