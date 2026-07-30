/**
 * 上下文感知数据生成器
 * 版本: 3.0.0（架构变更 - 数据生成职责转移给AI）
 * 
 * ⚠️ v3.0.0起，本文件的数据生成函数已废弃。
 * 数据应由AI根据应用场景生成，脚本只负责提交（见 batch-submitter.js 的 submitAIGeneratedData）。
 * 
 * 本文件保留以下用途：
 * 1. 工具函数（randomPick, randomNumber 等）— 可能被其他模块引用
 * 2. REGION_CODE_MAP — 地址字段格式转换需要
 * 3. 数据生成函数 — 标记为废弃，调用时会输出警告
 * 
 * 历史问题：本文件使用硬编码数据池 + if/else 关键词匹配生成数据，
 * 无法理解业务语义，导致生成"武汉曹桂英实业有限公司"这种不真实的公司名。
 */

// 通用数据池（仅用于生成合理的随机值，不作为模板）
const DATA_POOL = {
  // 姓氏和名字
  姓氏: ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '朱', '马', '胡', '郭', '林', '何', '高', '罗', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹'],
  名字: ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀', '霞', '平', '刚', '桂英', '华', '建', '文', '辉', '玲', '婷', '宇', '浩'],
  
  // 常见公司核心词（真实公司命名方式：地域+核心词+行业词+后缀）
  公司核心词: ['华信', '中盛', '宏达', '恒通', '金桥', '远航', '新宇', '博源', '鼎立', '万邦', '天和', '嘉诚', '瑞丰', '永泰', '弘毅', '正源', '兴业', '盛达', '汇通', '诚信', '鸿运', '凯旋', '光华', '前程', '安泰', '泰和', '昌盛', '融达', '中联', '合力'],
  
  // 常见公司行业词（放在核心词和后缀之间）
  公司行业词: ['电子', '数码', '信息', '网络', '智能', '科技', '光电', '通信', '精密', '半导体', '软件', '数据', '物联网'],
  
  // 常见公司后缀
  公司后缀: ['有限公司', '科技有限公司', '贸易有限公司', '电子商务有限公司', '商贸有限公司', '实业有限公司', '股份有限公司'],
  
  // 电子产品分类
  产品分类: ['手机', '电脑', '平板', '配件', '智能穿戴', '智能家居', '数码影音'],
  
  // 常见产品名称
  产品名称: {
    手机: ['iPhone 15 Pro Max 256GB', 'iPhone 15 Pro 128GB', '华为 Mate 60 Pro 512GB', '华为 P60 Pro 256GB', '小米14 Pro 256GB', '小米14 Ultra 512GB', 'OPPO Find X7 Ultra 256GB', 'vivo X100 Pro 512GB', '三星 Galaxy S24 Ultra 256GB', '荣耀 Magic6 Pro 512GB'],
    电脑: ['MacBook Pro 14英寸 M3芯片 512GB', 'MacBook Air 15英寸 M3芯片 256GB', '联想 ThinkPad X1 Carbon 2024', '联想 小新Pro16 2024', '华为 MateBook X Pro 2024', '戴尔 XPS 15 2024', '惠普 战X 14英寸 2024', '华硕 灵耀14 2024', '微软 Surface Laptop 6', '小米笔记本Pro 16 2024'],
    平板: ['iPad Pro 12.9英寸 M2芯片 256GB', 'iPad Air 5 10.9英寸 256GB', '华为 MatePad Pro 13.2英寸', '小米平板6 Max 14英寸', '三星 Galaxy Tab S9 Ultra', '联想小新Pad Pro 2024', 'OPPO Pad 3 Pro', 'vivo Pad4 Pro'],
    配件: ['AirPods Pro 第三代', 'FreeBuds Pro 3', '索尼 WH-1000XM5 头戴式耳机', '苹果妙控键盘', '罗技 MX Master 3S 鼠标', '小米手环8 Pro', '华为Watch GT 4', '苹果MagSafe充电宝', '安克20000mAh充电宝', '绿联Type-C扩展坞'],
    智能穿戴: ['Apple Watch Ultra 2', '华为Watch 4 Pro', '小米手表S3', '三星Galaxy Watch7', 'Garmin Fenix 7X', '华为手环9', '小米手环9 Pro', 'OPPO Watch X'],
    智能家居: ['小米智能门锁Pro', '华为智能门锁SE', '石头扫地机器人P10 Pro', '追觅扫地机器人X30', '小米空气净化器4 Pro', '华为智选空气净化器', 'Yeelight智能吸顶灯', 'Aqara智能开关'],
    数码影音: ['索尼 Alpha 7R V 微单相机', '佳能 EOS R6 Mark II', '大疆 Pocket 3 口袋相机', '索尼 WF-1000XM5 耳机', 'Bose QuietComfort Ultra', 'GoPro Hero 12', '大疆 Osmo Action 5 Pro']
  },
  
  // 规格型号前缀
  规格前缀: {
    手机: ['A2849', 'A2848', 'ALN-AL80', 'LNA-AL00', '23127PN0CG', '2407FPN8EG', 'PHY110', 'V2329A', 'SM-S9280', 'MTP42CH/A'],
    电脑: ['Mac15,7', 'Mac15,12', '21KC', '21LB', 'KG1J', 'XPS9530', '83AQ', 'UX3407', 'Z1U2', 'MNW93CH/A'],
    平板: ['A2436', 'A2588', 'WGRR-W09', '2307BRPDCC', 'SM-X910', '21051182G', 'OPD2403', 'PD2454'],
    配件: ['A2968', 'T0013', 'WH1000XM5/B', 'MK293CH/A', '910-006593', 'M215D', 'FR551', 'A2565', 'A1378', 'US560'],
    智能穿戴: ['MQF83CH/A', 'FR90', 'M2130', 'SM-R960', '010-02863-24', 'M2245B', 'M2303', 'WATCH-01'],
    智能家居: ['XMZNMJ05LM', 'AL100', 'ROBOROCK-P10P', 'dreame-X30', 'AC-M17-SC', 'SA100', 'YLXD76YL', 'WS-EUK01'],
    数码影音: ['ILCE-7RM5', 'DS126851', 'AKP1', 'WF-1000XM5/B', 'CHDHX-121', 'GP-CHDHX-121-RW', 'OsmoAction5']
  },
  
  // 单位
  单位: ['个', '件', '箱', '套', '台', '只', '支', '张', '本', '瓶', '袋', '千克', '克', '升', '米'],
  
  // 仓库名称前缀
  仓库前缀: ['中心仓', '分仓', '前置仓', '保税仓', '云仓', '中转仓', '配送仓', '自提点'],
  
  // 仓库区域
  仓库区域: ['A区', 'B区', 'C区', 'D区', 'E区', 'F区', '东区', '西区', '南区', '北区'],
  
  // 供应商类型
  供应商类型: ['生产厂商', '品牌代理商', '批发商', '经销商', '贸易商', '服务商'],
  
  // 客户类型
  客户类型: ['零售商', '批发商', '电商平台', '企业客户', '个人客户', '经销商'],
  
  // 省份
  省份: ['湖北省', '广东省', '浙江省', '江苏省', '山东省', '河南省', '四川省', '湖南省', '河北省', '福建省'],
  
  // 城市
  城市: ['武汉市', '广州市', '深圳市', '杭州市', '南京市', '济南市', '郑州市', '成都市', '长沙市', '石家庄市', '福州市'],
  
  // 区县
  区县: ['江岸区', '江汉区', '硚口区', '汉阳区', '武昌区', '天河区', '福田区', '西湖区', '鼓楼区', '金水区', '锦江区', '岳麓区'],
  
  // 街道
  街道: ['中山大道', '解放大道', '建设大道', '发展大道', '光谷大道', '金融街', '科技路', '创业大道', '文化路', '商业街'],
  
  // 银行
  银行: ['中国工商银行', '中国建设银行', '中国农业银行', '中国银行', '交通银行', '招商银行', '中信银行', '浦发银行', '民生银行', '光大银行'],
  
  // 发票类型
  发票类型: ['增值税普通发票', '增值税专用发票', '电子普通发票'],
  
  // 费用类型
  费用类型: ['差旅费', '交通费', '住宿费', '餐饮费', '业务招待费', '办公用品费', '通讯费', '运输费', '仓储费'],
  
  // 项目状态
  项目状态: ['进行中', '待立项', '已完结', '已终止', '暂停'],
  
  // 文档状态
  文档状态: ['草稿', '审核中', '已审核', '已盖章', '已归档', '已作废'],
  
  // 审批结果
  审批结果: ['通过', '驳回', '退回修改', '待审核'],
  
  // 职位
  职位: ['董事长', '总经理', '部门经理', '项目经理', '主管', '专员', '助理', '工程师', '销售', '客服'],
  
  // 邮箱域名
  邮箱域名: ['@qq.com', '@163.com', '@gmail.com', '@outlook.com', '@sina.com', '@sohu.com', '@126.com', '@yeah.net'],
  
  // 支付方式
  支付方式: ['银行转账', '现金', '支票', '汇票', '支付宝', '微信支付'],
  
  // 付款条件
  付款条件: ['一次性', '分期', '月结', '季结', '货到付款', '款到发货']
};

// 中国行政区划编码映射（用于 AddressField 的 regionIds）
const REGION_CODE_MAP = {
  '湖北省': {
    code: 420000,
    '武汉市': {
      code: 420100,
      '江岸区': 420102,
      '江汉区': 420103,
      '硚口区': 420104,
      '汉阳区': 420105,
      '武昌区': 420106,
      '青山区': 420107,
      '洪山区': 420111,
      '东西湖区': 420112,
      '汉南区': 420113,
      '蔡甸区': 420114,
      '江夏区': 420115,
      '黄陂区': 420116,
      '新洲区': 420117
    }
  },
  '广东省': {
    code: 440000,
    '广州市': {
      code: 440100,
      '天河区': 440106,
      '福田区': 440304,  // 注：福田区实际属于深圳市，此处仅为数据兼容
      '越秀区': 440104,
      '海珠区': 440105,
      '荔湾区': 440103,
      '白云区': 440111,
      '黄埔区': 440112,
      '番禺区': 440113,
      '花都区': 440114,
      '南沙区': 440115
    },
    '深圳市': {
      code: 440300,
      '福田区': 440304,
      '罗湖区': 440303,
      '南山区': 440305,
      '宝安区': 440306,
      '龙岗区': 440307,
      '盐田区': 440308
    }
  },
  '浙江省': {
    code: 330000,
    '杭州市': {
      code: 330100,
      '西湖区': 330106,
      '上城区': 330102,
      '下城区': 330103,
      '江干区': 330104,
      '拱墅区': 330105,
      '滨江区': 330108,
      '余杭区': 330110,
      '萧山区': 330109
    }
  },
  '江苏省': {
    code: 320000,
    '南京市': {
      code: 320100,
      '鼓楼区': 320106,
      '玄武区': 320102,
      '秦淮区': 320104,
      '建邺区': 320105,
      '栖霞区': 320113,
      '雨花台区': 320114,
      '江宁区': 320115
    }
  },
  '山东省': {
    code: 370000,
    '济南市': {
      code: 370100,
      '历下区': 370102,
      '市中区': 370103,
      '槐荫区': 370104,
      '天桥区': 370105,
      '历城区': 370112
    }
  },
  '河南省': {
    code: 410000,
    '郑州市': {
      code: 410100,
      '金水区': 410105,
      '中原区': 410102,
      '二七区': 410103,
      '管城回族区': 410104,
      '惠济区': 410108
    }
  },
  '四川省': {
    code: 510000,
    '成都市': {
      code: 510100,
      '锦江区': 510104,
      '青羊区': 510105,
      '金牛区': 510106,
      '武侯区': 510107,
      '成华区': 510108
    }
  },
  '湖南省': {
    code: 430000,
    '长沙市': {
      code: 430100,
      '岳麓区': 430104,
      '芙蓉区': 430102,
      '天心区': 430103,
      '开福区': 430105,
      '雨花区': 430111
    }
  },
  '河北省': {
    code: 130000,
    '石家庄市': {
      code: 130100,
      '长安区': 130102,
      '桥西区': 130104,
      '新华区': 130105,
      '井陉矿区': 130107
    }
  },
  '福建省': {
    code: 350000,
    '福州市': {
      code: 350100,
      '鼓楼区': 350102,
      '台江区': 350103,
      '仓山区': 350104,
      '马尾区': 350105
    }
  }
};

/**
 * 随机选择
 */
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成随机数
 */
function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 生成随机金额（保留2位小数）
 */
function randomAmount(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

/**
 * 生成日期时间戳
 */
function createDate(year, month, day) {
  return new Date(year, month - 1, day).getTime();
}

/**
 * 生成近期日期
 */
function recentDate(daysAgo = 30) {
  const date = new Date();
  date.setDate(date.getDate() - randomNumber(0, daysAgo));
  return date.getTime();
}

/**
 * 生成未来日期
 */
function futureDate(daysLater = 30) {
  const date = new Date();
  date.setDate(date.getDate() + randomNumber(1, daysLater));
  return date.getTime();
}

/**
 * 生成随机手机号
 */
function randomPhone() {
  const prefixes = ['138', '139', '150', '151', '152', '158', '159', '182', '183', '187', '188', '189', '198', '199'];
  return randomPick(prefixes) + String(randomNumber(10000000, 99999999));
}

/**
 * 生成随机邮箱
 */
function randomEmail() {
  const name = randomPick(DATA_POOL.姓氏) + randomPick(DATA_POOL.名字);
  return `${name.toLowerCase()}${randomPick(DATA_POOL.邮箱域名)}`;
}

/**
 * 生成随机姓名
 */
function randomName() {
  return randomPick(DATA_POOL.姓氏) + randomPick(DATA_POOL.名字);
}

/**
 * 生成随机公司名
 * 命名规则：城市 + 核心词 + [行业词] + 后缀
 * 例如：武汉华信电子有限公司、深圳恒通科技有限公司
 */
function randomCompany(city = '') {
  const prefix = city || randomPick(DATA_POOL.城市);
  const core = randomPick(DATA_POOL.公司核心词);
  // 50%概率加入行业词，让公司名更丰富
  const industry = Math.random() > 0.5 ? randomPick(DATA_POOL.公司行业词) : '';
  const suffix = randomPick(DATA_POOL.公司后缀);
  return `${prefix}${core}${industry}${suffix}`;
}

/**
 * 生成随机地址
 */
function randomAddress(city = '') {
  const province = randomPick(DATA_POOL.省份);
  const cityName = city || randomPick(DATA_POOL.城市);
  const district = randomPick(DATA_POOL.区县);
  const street = randomPick(DATA_POOL.街道);
  const number = randomNumber(1, 999);
  return `${province}${cityName}${district}${street}${number}号`;
}

/**
 * 根据字段名智能生成数据（核心函数 - 基于字段语义分析）
 * @param {string} fieldName - 字段名（中文）
 * @param {Object} context - 上下文 {city, ...}
 * @returns {*} 生成的数据
 */
function generateFieldData(fieldName, context = {}) {
  const city = context.city || '';
  const name = fieldName.trim();
  
  // ========== 产品相关 ==========
  if (name.includes('产品名称') || name.includes('商品名称')) {
    const category = randomPick(DATA_POOL.产品分类);
    return randomPick(DATA_POOL.产品名称[category]);
  }
  if (name.includes('产品分类') || name.includes('商品分类')) {
    return randomPick(DATA_POOL.产品分类);
  }
  if (name.includes('规格型号') || name.includes('型号')) {
    const category = randomPick(DATA_POOL.产品分类);
    return randomPick(DATA_POOL.规格前缀[category]) || `SPEC-${randomNumber(10000, 99999)}`;
  }
  if (name.includes('产品编号') || name.includes('商品编号') || name.includes('SKU')) {
    return `SKU${randomNumber(10000000, 99999999)}`;
  }
  if (name.includes('条形码') || name.includes('条码')) {
    return String(randomNumber(1000000000000, 9999999999999));
  }
  if (name.includes('品牌')) {
    return randomPick(['苹果', '华为', '小米', 'OPPO', 'vivo', '三星', '荣耀', '联想', '戴尔', '惠普', '华硕', '索尼', '佳能', '尼康', '大疆']);
  }
  
  // ========== 价格相关 ==========
  if (name.includes('采购价') || name.includes('进货价') || name.includes('成本价')) {
    return randomAmount(100, 5000);
  }
  if (name.includes('销售价') || name.includes('售价') || name.includes('零售价')) {
    return randomAmount(500, 10000);
  }
  if (name.includes('批发价')) {
    return randomAmount(200, 8000);
  }
  if (name.includes('市场价') || name.includes('原价')) {
    return randomAmount(1000, 15000);
  }
  if (name.includes('金额') || name.includes('费用') || name.includes('价格') || name.includes('预算')) {
    if (name.includes('注册')) {
      return randomNumber(100, 5000) * 10000;
    }
    if (name.includes('项目') || name.includes('合同')) {
      return randomNumber(5, 500) * 10000;
    }
    return randomAmount(100, 100000);
  }
  
  // ========== 库存相关 ==========
  if (name.includes('库存上限') || name.includes('最大库存') || name.includes('最高库存')) {
    return randomNumber(500, 5000);
  }
  if (name.includes('库存下限') || name.includes('最小库存') || name.includes('最低库存') || name.includes('安全库存')) {
    return randomNumber(10, 100);
  }
  if (name.includes('库存数量') || name.includes('当前库存') || name.includes('现有库存')) {
    return randomNumber(50, 2000);
  }
  if (name.includes('入库数量') || name.includes('出库数量') || name.includes('调拨数量')) {
    return randomNumber(1, 500);
  }
  if (name.includes('盘点数量')) {
    return randomNumber(1, 1000);
  }
  if (name.includes('数量') || name.includes('个数')) {
    return randomNumber(1, 1000);
  }
  
  // ========== 仓库相关 ==========
  if (name.includes('仓库名称') || name.includes('仓库')) {
    const prefix = randomPick(DATA_POOL.仓库前缀);
    const area = randomPick(DATA_POOL.仓库区域);
    return `${city || randomPick(DATA_POOL.城市)}${prefix}${area}`;
  }
  if (name.includes('仓库编号')) {
    return `WH${randomNumber(10000, 99999)}`;
  }
  if (name.includes('仓库地址')) {
    return randomAddress(city);
  }
  if (name.includes('库位') || name.includes('货位')) {
    return `${randomPick(DATA_POOL.仓库区域)}-${randomNumber(1, 99)}-${randomNumber(1, 9)}`;
  }
  
  // ========== 客户相关 ==========
  if (name.includes('客户名称') || name.includes('客户') || name.includes('委托方')) {
    return randomCompany(city);
  }
  if (name.includes('客户编号') || name.includes('客户代码')) {
    return `CUST${randomNumber(100000, 999999)}`;
  }
  if (name.includes('客户类型')) {
    return randomPick(DATA_POOL.客户类型);
  }
  
  // ========== 供应商相关 ==========
  if (name.includes('供应商名称') || name.includes('供应商') || name.includes('供货方')) {
    return randomCompany(city);
  }
  if (name.includes('供应商编号') || name.includes('供应商代码')) {
    return `SUP${randomNumber(100000, 999999)}`;
  }
  if (name.includes('供应商类型')) {
    return randomPick(DATA_POOL.供应商类型);
  }
  
  // ========== 人员相关 ==========
  if (name.includes('姓名') || name.includes('联系人') || name.includes('负责人') || name.includes('法人') || name.includes('经办人')) {
    return randomName();
  }
  if (name.includes('性别')) {
    return Math.random() > 0.5 ? '男' : '女';
  }
  if (name.includes('身份证号') || name.includes('身份证')) {
    return `4201${randomNumber(10, 30)}${String(randomNumber(1, 12)).padStart(2, '0')}${String(randomNumber(1, 28)).padStart(2, '0')}${randomNumber(1000, 9999)}`;
  }
  if (name.includes('职位') || name.includes('职务') || name.includes('岗位')) {
    return randomPick(DATA_POOL.职位);
  }
  
  // ========== 联系方式 ==========
  if (name.includes('电话') || name.includes('手机') || name.includes('联系方式') || name.includes('联系电话')) {
    return randomPhone();
  }
  if (name.includes('邮箱') || name.includes('电子邮件')) {
    return randomEmail();
  }
  if (name.includes('传真')) {
    return `${randomPick(['027', '010', '021'])}-${randomNumber(1000000, 9999999)}`;
  }
  
  // ========== 地址相关 ==========
  if (name.includes('地址') || name.includes('注册地址') || name.includes('办公地址') || name.includes('经营地址')) {
    return randomAddress(city);
  }
  if (name.includes('项目地点') || name.includes('地点') || name.includes('施工地点')) {
    return randomAddress(city);
  }
  
  // ========== 日期相关 ==========
  if (name.includes('日期') || name.includes('时间')) {
    if (name.includes('成立') || name.includes('入职') || name.includes('创建')) {
      return createDate(randomNumber(2010, 2023), randomNumber(1, 12), randomNumber(1, 28));
    }
    if (name.includes('预计') || name.includes('计划') || name.includes('交付')) {
      return futureDate(randomNumber(30, 180));
    }
    if (name.includes('完成') || name.includes('结束') || name.includes('终止')) {
      return recentDate(randomNumber(30, 365));
    }
    return recentDate(randomNumber(1, 90));
  }
  
  // ========== 银行相关 ==========
  if (name.includes('开户银行') || name.includes('银行名称')) {
    const bank = randomPick(DATA_POOL.银行);
    return `${bank}${city || randomPick(DATA_POOL.城市)}支行`;
  }
  if (name.includes('银行账号') || name.includes('账号')) {
    return String(randomNumber(1000000000000000, 9999999999999999));
  }
  
  // ========== 发票相关 ==========
  if (name.includes('发票类型')) {
    return randomPick(DATA_POOL.发票类型);
  }
  if (name.includes('发票号码') || name.includes('发票号')) {
    return String(randomNumber(10000000, 99999999));
  }
  if (name.includes('税率')) {
    return randomPick([3, 6, 9, 13]);
  }
  
  // ========== 费用相关 ==========
  if (name.includes('费用类型') || name.includes('报销类型')) {
    return randomPick(DATA_POOL.费用类型);
  }
  if (name.includes('费用说明') || name.includes('费用描述')) {
    return randomPick(['项目现场勘查差旅费', '客户拜访交通费', '团队工作餐', '办公用品采购', '设备维修费', '仓储租赁费', '物流运输费']);
  }
  
  // ========== 审批/状态相关 ==========
  if (name.includes('审批结果') || name.includes('审核结论')) {
    return randomPick(DATA_POOL.审批结果);
  }
  if (name.includes('状态')) {
    return randomPick(DATA_POOL.文档状态);
  }
  if (name.includes('项目状态')) {
    return randomPick(DATA_POOL.项目状态);
  }
  
  // ========== 支付方式 ==========
  if (name.includes('付款方式') || name.includes('支付方式')) {
    return randomPick(DATA_POOL.支付方式);
  }
  if (name.includes('付款条件') || name.includes('结算方式')) {
    return randomPick(DATA_POOL.付款条件);
  }
  
  // ========== 备注/说明 ==========
  if (name.includes('备注') || name.includes('说明') || name.includes('描述') || name.includes('简介') || name.includes('原因')) {
    const remarks = [
      '正常业务往来，需及时处理',
      '客户要求加急，请优先安排',
      '资料已收齐，待安排后续工作',
      '需协调相关部门配合，请提前沟通',
      '长期合作客户，请优先处理',
      '项目周期约3个月，请做好规划',
      '历史业务延续，沿用上次方案',
      '新客户首次合作，请做好服务'
    ];
    return randomPick(remarks);
  }
  
  // ========== 编号相关 ==========
  if (name.includes('编号') || name.includes('代码') || name.includes('单号')) {
    return `NO${randomNumber(10000000, 99999999)}`;
  }
  
  // ========== 通用默认值 ==========
  // 根据字段名长度生成一些变化
  const fallbackTexts = [
    `${city}业务数据${randomNumber(1, 999)}`,
    `待确认`,
    `已核实`,
    `需补充`,
    `已完成`
  ];
  return randomPick(fallbackTexts);
}

/**
 * 根据字段类型生成数据
 * @param {string} componentName - 组件类型
 * @param {string} label - 字段标签
 * @param {Object} fieldInfo - 字段完整信息
 * @param {Object} context - 上下文
 * @returns {*} 生成的数据
 */
function generateDataByType(componentName, label, fieldInfo, context = {}) {
  const city = context.city || '';
  
  switch (componentName) {
    case 'RadioField':
      // 单选框 - 从数据源中随机选择一个
      if (fieldInfo.dataSource && Array.isArray(fieldInfo.dataSource) && fieldInfo.dataSource.length > 0) {
        const option = randomPick(fieldInfo.dataSource);
        return option.value || option.text || option.label;
      }
      return generateFieldData(label, context);
      
    case 'CheckboxField':
      // 多选框 - 随机选择1-3个选项
      if (fieldInfo.dataSource && Array.isArray(fieldInfo.dataSource) && fieldInfo.dataSource.length > 0) {
        const count = randomNumber(1, Math.min(3, fieldInfo.dataSource.length));
        const shuffled = [...fieldInfo.dataSource].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count).map(opt => opt.value || opt.text || opt.label);
      }
      return [generateFieldData(label, context)];
      
    case 'SelectField':
      // 下拉选择 - 从数据源中随机选择一个
      if (fieldInfo.dataSource && Array.isArray(fieldInfo.dataSource) && fieldInfo.dataSource.length > 0) {
        const option = randomPick(fieldInfo.dataSource);
        return option.value || option.text || option.label;
      }
      return generateFieldData(label, context);
      
    case 'CascadeSelectField':
      // 级联选择 - 返回一个层级路径
      return [randomPick(DATA_POOL.省份), randomPick(DATA_POOL.城市), randomPick(DATA_POOL.区县)];
      
    case 'AddressField': {
      // 地址选择 - 宜搭API需要对象格式
      // { address: "详细地址", regionIds: [省编码, 市编码, 区编码], regionText: [{zh_CN:"省"},{zh_CN:"市"},{zh_CN:"区"}] }
      const province = city === '武汉' ? '湖北省' : randomPick(DATA_POOL.省份);
      const cityName = city ? city + '市' : randomPick(DATA_POOL.城市);

      // 从 REGION_CODE_MAP 中获取该城市下的区县列表，确保区县与城市匹配
      const cityMap = REGION_CODE_MAP[province]?.[cityName];
      let district;
      let regionIds = [];

      if (cityMap) {
        // 从映射表中获取区县列表（排除 code 属性）
        const districts = Object.keys(cityMap).filter(k => k !== 'code');
        district = randomPick(districts);
        regionIds = [REGION_CODE_MAP[province].code, cityMap.code, cityMap[district]];
      } else {
        // 回退到 DATA_POOL
        district = randomPick(DATA_POOL.区县);
      }

      const street = randomPick(DATA_POOL.街道);
      const number = randomNumber(1, 999);
      const detailAddress = `${street}${number}号`;

      return {
        address: detailAddress,
        regionIds: regionIds,
        regionText: [
          { zh_CN: province },
          { zh_CN: cityName },
          { zh_CN: district }
        ]
      };
    }
      
    case 'DateField':
      // 日期字段
      if (label.includes('预计') || label.includes('计划')) {
        return futureDate(randomNumber(30, 180));
      }
      if (label.includes('完成') || label.includes('结束')) {
        return recentDate(randomNumber(30, 365));
      }
      return recentDate(randomNumber(1, 90));
      
    case 'NumberField':
      // 数字字段 - 根据字段名生成合理数值
      return generateFieldData(label, context);

    case 'EmployeeField':
      // 成员字段 - 需要用户ID数组格式
      if (context.userId) {
        return [context.userId];
      }
      return null;
      
    case 'TextareaField':
      // 多行文本
      return generateFieldData(label, context);
      
    case 'TextField':
    default:
      // 默认使用字段名匹配生成
      return generateFieldData(label, context);
  }
}

/**
 * 根据表单字段生成完整的数据对象
 * @deprecated v3.0.0起废弃。AI应直接生成数据，调用 submitAIGeneratedData 提交。
 * @param {Object} fieldMapping - 字段映射 {字段名: {fieldId, componentName, label}}
 * @param {Object} context - 上下文
 * @returns {Object} 生成的数据
 */
function generateFormData(fieldMapping, context = {}) {
  console.warn('⚠️ [废弃警告] generateFormData 已废弃，AI应直接生成数据后调用 submitAIGeneratedData 提交。');
  console.warn('⚠️ 脚本数据池无法理解业务语义，生成的数据可能不真实。');
  const data = {};
  
  for (const [label, fieldInfo] of Object.entries(fieldMapping)) {
    // 跳过不兼容的字段类型
    const SKIP_TYPES = ['AssociationFormField', 'AssociationFormProperty', 'ImageField', 'AttachmentField'];
    if (SKIP_TYPES.includes(fieldInfo.componentName)) {
      continue;
    }

    // 跳过流水号字段（由平台自动生成）
    if (fieldInfo.componentName === 'SerialNumberField') {
      continue;
    }

    // 跳过子表列字段（单独处理）
    if (fieldInfo.isSubformColumn) {
      continue;
    }

    // 处理 EmployeeField（含系统字段创建人）- 使用 userId
    if (fieldInfo.componentName === 'EmployeeField') {
      if (context.userId) {
        data[label] = [context.userId];
      }
      continue;
    }

    // 处理系统日期字段（创建时间、更新时间）- 使用当前时间戳
    if (fieldInfo.componentName === 'DateField' &&
        (label.includes('创建时间') || label.includes('更新时间'))) {
      data[label] = Date.now();
      continue;
    }

    // 处理子表单字段
    if (fieldInfo.componentName === 'TableField' && fieldInfo.isSubform) {
      // 生成子表数据（3行）
      const subformRows = [];
      const rowCount = 3;
      
      for (let i = 0; i < rowCount; i++) {
        const row = {};
        
        // 查找该子表的所有列
        for (const [colLabel, colFieldInfo] of Object.entries(fieldMapping)) {
          if (colFieldInfo.isSubformColumn && colFieldInfo.parentFieldId === fieldInfo.fieldId) {
            const colName = colFieldInfo.label;
            row[colName] = generateDataByType(colFieldInfo.componentName, colName, colFieldInfo, context);
          }
        }
        
        subformRows.push(row);
      }
      
      data[label] = subformRows;
      continue;
    }
    
    // 跳过已作为子表列处理的普通字段（避免重复）
    const hasSubformColumn = Object.values(fieldMapping).some(
      f => f.isSubformColumn && f.label === label
    );
    if (hasSubformColumn) {
      continue;
    }
    
    // 根据字段类型生成数据
    data[label] = generateDataByType(fieldInfo.componentName, label, fieldInfo, context);
  }
  
  return data;
}

/**
 * 生成多条数据
 * @deprecated v3.0.0起废弃。AI应直接生成数据，调用 submitAIGeneratedData 提交。
 * @param {Object} fieldMapping - 字段映射
 * @param {number} count - 数量
 * @param {Object} context - 上下文
 * @returns {Array} 数据列表
 */
function generateMultipleData(fieldMapping, count = 1, context = {}) {
  console.warn('⚠️ [废弃警告] generateMultipleData 已废弃，AI应直接生成数据后调用 submitAIGeneratedData 提交。');
  console.warn('⚠️ 脚本数据池无法理解业务语义，生成的数据可能不真实。');
  const dataList = [];
  
  for (let i = 0; i < count; i++) {
    dataList.push(generateFormData(fieldMapping, context));
  }
  
  return dataList;
}

/**
 * 生成子表数据
 * @param {number} rowCount - 行数
 * @param {Object} context - 上下文
 * @returns {Array} 子表数据
 */
function generateSubformData(rowCount = 3, context = {}) {
  const rows = [];
  const expenseDescriptions = [
    '项目现场勘查差旅费',
    '客户拜访交通费',
    '团队工作餐',
    '办公用品采购',
    '设备维修费',
    '仓储租赁费',
    '物流运输费',
    '客户招待费',
    '资料复印打印费',
    '快递及通讯费'
  ];

  for (let i = 0; i < rowCount; i++) {
    rows.push({
      '费用日期': recentDate(randomNumber(1, 30)),
      '费用类型': randomPick(DATA_POOL.费用类型),
      '费用说明': randomPick(expenseDescriptions),
      '金额': randomAmount(50, 5000),
      '发票类型': randomPick(DATA_POOL.发票类型),
      '发票号码': String(randomNumber(10000000, 99999999))
    });
  }

  return rows;
}

module.exports = {
  generateFieldData,
  generateDataByType,
  generateFormData,
  generateMultipleData,
  generateSubformData,
  createDate,
  recentDate,
  futureDate,
  randomPick,
  randomNumber,
  randomPhone,
  randomEmail,
  randomName,
  randomCompany,
  randomAddress,
  DATA_POOL
};
