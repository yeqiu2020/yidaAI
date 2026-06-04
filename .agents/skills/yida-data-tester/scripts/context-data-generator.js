/**
 * 上下文感知数据生成器
 * 版本: 1.0.0
 * 
 * 功能：
 * 1. 根据上下文（城市、行业等）生成相关的测试数据
 * 2. 支持字段名智能匹配生成对应数据
 * 3. 支持子表单数据生成
 */

// 城市数据
const CITY_DATA = {
  南昌: {
    province: '江西省',
    districts: ['红谷滩区', '青山湖区', '东湖区', '西湖区', '青云谱区', '高新区', '南昌县', '新建区', '进贤县', '安义县'],
    addresses: [
      '江西省南昌市红谷滩区会展路999号',
      '江西省南昌市青山湖区北京东路138号',
      '江西省南昌市东湖区阳明路156号',
      '江西省南昌市西湖区八一大道2号',
      '江西省南昌市青云谱区井冈山大道666号',
      '江西省南昌市高新区火炬大街998号',
      '江西省南昌市南昌县莲塘镇澄湖西路788号',
      '江西省南昌市新建区长堎镇新建大道666号'
    ],
    companies: [
      '南昌城市建设投资集团有限公司',
      '江西铜业集团有限公司',
      '南昌高新技术产业开发区管理委员会',
      '南昌市青山湖区人民政府',
      '江西江铃集团',
      '南昌铁路局',
      '江西财经大学',
      '南昌大学第一附属医院',
      '江西建工集团',
      '南昌市政公用集团'
    ],
    phonePrefix: '0791'
  },
  北京: {
    province: '北京市',
    districts: ['朝阳区', '海淀区', '东城区', '西城区', '丰台区', '石景山区', '通州区', '昌平区', '大兴区', '顺义区'],
    addresses: [
      '北京市朝阳区建国路88号',
      '北京市海淀区中关村大街1号',
      '北京市东城区王府井大街255号',
      '北京市西城区金融大街1号'
    ],
    companies: [
      '中国建筑集团有限公司',
      '中国石油化工集团有限公司',
      '中国电信集团有限公司',
      '中国工商银行股份有限公司'
    ],
    phonePrefix: '010'
  },
  上海: {
    province: '上海市',
    districts: ['浦东新区', '黄浦区', '静安区', '徐汇区', '长宁区', '普陀区', '虹口区', '杨浦区', '闵行区', '宝山区'],
    addresses: [
      '上海市浦东新区陆家嘴环路1000号',
      '上海市黄浦区南京东路100号',
      '上海市静安区南京西路1266号',
      '上海市徐汇区淮海中路999号'
    ],
    companies: [
      '上海汽车集团股份有限公司',
      '中国宝武钢铁集团有限公司',
      '交通银行股份有限公司',
      '上海浦东发展银行股份有限公司'
    ],
    phonePrefix: '021'
  }
};

// 行业数据
const INDUSTRY_DATA = {
  资产评估: {
    projectTypes: ['土地评估', '房地产评估', '资产评估', '矿业权评估', '无形资产评估'],
    reportTypes: ['土地评估报告', '房地产估价报告', '资产评估报告', '咨询报告'],
    appraiserTitles: ['资产评估师', '房地产估价师', '土地估价师', '矿业权评估师'],
    services: ['抵押评估', '转让评估', '征收评估', '司法鉴定', '咨询顾问']
  },
  房地产: {
    projectTypes: ['住宅开发', '商业地产', '工业地产', '土地开发', '城市更新'],
    reportTypes: ['可行性研究报告', '市场调研报告', '投资分析报告'],
    services: ['销售代理', '租赁代理', '物业管理', '投资顾问']
  }
};

// 人名库
const NAMES = {
  male: ['张伟', '王强', '刘洋', '陈明', '杨华', '赵军', '周勇', '吴刚', '郑伟', '孙磊'],
  female: ['李娜', '王丽', '张敏', '刘芳', '陈静', '杨丽', '赵敏', '周婷', '吴倩', '孙悦']
};

// 通用数据
const COMMON_DATA = {
  emailDomains: ['@qq.com', '@163.com', '@gmail.com', '@outlook.com', '@hfpg.com'],
  bankNames: ['中国工商银行', '中国建设银行', '中国农业银行', '中国银行', '交通银行', '招商银行'],
  invoiceTypes: ['增值税普通发票', '增值税专用发票', '电子普通发票'],
  expenseTypes: ['差旅费', '交通费', '住宿费', '餐饮费', '业务招待费', '办公用品费', '通讯费'],
  contractTypes: ['委托评估合同', '咨询服务合同', '技术服务合同', '合作协议'],
  paymentMethods: ['银行转账', '现金', '支票', '汇票'],
  paymentTerms: ['一次性', '分期', '月结', '季结'],
  projectStatuses: ['进行中', '待立项', '已完结', '已终止', '暂停'],
  approvalResults: ['通过', '驳回', '退回修改', '待审核'],
  documentStatuses: ['草稿', '审核中', '已审核', '已盖章', '已归档', '已作废']
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
 * 根据字段名智能生成数据
 * @param {string} fieldName - 字段名（中文）
 * @param {Object} context - 上下文 {city, industry, ...}
 * @returns {*} 生成的数据
 */
function generateFieldData(fieldName, context = {}) {
  const city = context.city || '南昌';
  const industry = context.industry || '资产评估';
  const cityData = CITY_DATA[city] || CITY_DATA['南昌'];
  const industryData = INDUSTRY_DATA[industry] || INDUSTRY_DATA['资产评估'];
  
  const name = fieldName.trim();
  
  // 机构/公司相关
  if (name.includes('机构名称') || name.includes('公司名称') || name.includes('企业名称')) {
    return `${city}恒方资产评估有限公司`;
  }
  if (name.includes('机构简称') || name.includes('公司简称')) {
    return `${city}恒方`;
  }
  if (name.includes('统一社会信用代码')) {
    return `91360100MA${randomNumber(10000000, 99999999)}`;
  }
  
  // 客户相关
  if (name.includes('客户名称') || name.includes('委托方名称')) {
    return randomPick(cityData.companies);
  }
  if (name.includes('客户简称') || name.includes('委托方简称')) {
    const company = randomPick(cityData.companies);
    return company.substring(0, 4);
  }
  
  // 人员相关
  if (name.includes('姓名') || name.includes('法人姓名') || name.includes('联系人姓名')) {
    const gender = Math.random() > 0.5 ? 'male' : 'female';
    return randomPick(NAMES[gender]);
  }
  if (name.includes('性别')) {
    return Math.random() > 0.5 ? '男' : '女';
  }
  if (name.includes('身份证号')) {
    return `3601${randomNumber(10, 30)}${String(randomNumber(1, 12)).padStart(2, '0')}${String(randomNumber(1, 28)).padStart(2, '0')}${randomNumber(1000, 9999)}`;
  }
  
  // 联系方式
  if (name.includes('电话') || name.includes('手机') || name.includes('联系方式')) {
    if (name.includes('法人电话') || name.includes('联系人电话')) {
      return `138${randomNumber(10000000, 99999999)}`;
    }
    return `${cityData.phonePrefix}-${randomNumber(10000000, 99999999)}`;
  }
  if (name.includes('邮箱') || name.includes('电子邮件')) {
    const name = randomPick(NAMES.male);
    const domain = randomPick(COMMON_DATA.emailDomains);
    return `${name.toLowerCase()}${domain}`;
  }
  
  // 地址相关
  if (name.includes('地址') || name.includes('注册地址') || name.includes('办公地址')) {
    return randomPick(cityData.addresses);
  }
  if (name.includes('项目地点') || name.includes('地点')) {
    const district = randomPick(cityData.districts);
    return `${cityData.province}${city}${district}`;
  }
  
  // 金额相关
  if (name.includes('金额') || name.includes('费用') || name.includes('价格') || name.includes('预算')) {
    if (name.includes('注册资本')) {
      return randomNumber(100, 5000) * 10000;
    }
    if (name.includes('项目金额') || name.includes('合同金额')) {
      return randomNumber(5, 500) * 10000;
    }
    if (name.includes('评估价值') || name.includes('评估值')) {
      return randomNumber(100, 5000) * 10000;
    }
    return randomNumber(1000, 100000);
  }
  
  // 日期相关
  if (name.includes('日期') || name.includes('时间')) {
    if (name.includes('成立日期') || name.includes('入职日期')) {
      return createDate(randomNumber(2010, 2023), randomNumber(1, 12), randomNumber(1, 28));
    }
    if (name.includes('预计') || name.includes('计划')) {
      return futureDate(randomNumber(30, 180));
    }
    if (name.includes('完成') || name.includes('结束') || name.includes('终止')) {
      return recentDate(randomNumber(30, 365));
    }
    return recentDate(randomNumber(1, 90));
  }
  
  // 项目相关
  if (name.includes('项目名称')) {
    const district = randomPick(cityData.districts);
    const type = randomPick(industryData.projectTypes);
    return `${city}${district}${type}项目`;
  }
  if (name.includes('项目类型') || name.includes('评估类型')) {
    return randomPick(industryData.projectTypes);
  }
  if (name.includes('项目状态')) {
    return randomPick(COMMON_DATA.projectStatuses);
  }
  
  // 报告相关
  if (name.includes('报告编号')) {
    return `NC-${randomPick(['PG', 'BG', 'ZX'])}-${randomNumber(2023, 2025)}-${String(randomNumber(1, 999)).padStart(3, '0')}`;
  }
  if (name.includes('报告类型')) {
    return randomPick(industryData.reportTypes);
  }
  
  // 合同相关
  if (name.includes('合同类型')) {
    return randomPick(COMMON_DATA.contractTypes);
  }
  if (name.includes('付款方式')) {
    return randomPick(COMMON_DATA.paymentTerms);
  }
  
  // 银行相关
  if (name.includes('开户银行') || name.includes('银行名称')) {
    const bank = randomPick(COMMON_DATA.bankNames);
    return `${bank}${city}${randomPick(cityData.districts)}支行`;
  }
  if (name.includes('银行账号')) {
    return String(randomNumber(1000000000000000, 9999999999999999));
  }
  
  // 发票相关
  if (name.includes('发票类型')) {
    return randomPick(COMMON_DATA.invoiceTypes);
  }
  if (name.includes('发票号码')) {
    return String(randomNumber(10000000, 99999999));
  }
  if (name.includes('税率')) {
    return randomPick([3, 6, 9, 13]);
  }
  
  // 费用相关
  if (name.includes('费用类型') || name.includes('报销类型')) {
    return randomPick(COMMON_DATA.expenseTypes);
  }
  
  // 审批相关
  if (name.includes('审批结果') || name.includes('审核结论')) {
    return randomPick(COMMON_DATA.approvalResults);
  }
  if (name.includes('状态')) {
    return randomPick(COMMON_DATA.documentStatuses);
  }
  
  // 人员职务
  if (name.includes('职位') || name.includes('职务') || name.includes('岗位')) {
    return randomPick(['董事长', '总经理', '部门经理', '项目经理', '评估师', '助理']);
  }
  
  // 执业资格
  if (name.includes('执业资格') || name.includes('资格证书')) {
    return randomPick(industryData.appraiserTitles);
  }
  if (name.includes('证书号') || name.includes('资格证号')) {
    return `36${randomNumber(100000, 999999)}`;
  }
  
  // 从业年限
  if (name.includes('从业年限') || name.includes('工作年限')) {
    return randomNumber(1, 25);
  }
  
  // 备注/说明
  if (name.includes('备注') || name.includes('说明') || name.includes('描述') || name.includes('简介')) {
    const remarks = [
      `${city}${randomPick(industryData.services)}业务，需尽快处理`,
      `客户要求${randomPick(industryData.services)}，请安排人员跟进`,
      `该项目为${randomPick(industryData.projectTypes)}，周期约${randomNumber(1, 6)}个月`,
      `资料已收齐，待安排现场勘查`,
      `委托方要求加急，预计${randomNumber(3, 15)}个工作日内出具报告`,
      `需协调相关部门配合，请提前沟通`,
      `历史项目延续，沿用上次评估方法`,
      `客户为长期合作单位，请优先安排`
    ];
    return randomPick(remarks);
  }

  // 默认返回随机文本（避免明显假数据）
  const fallbackTexts = [
    `${city}${randomPick(industryData.services)}`,
    `${randomPick(industryData.projectTypes)}`,
    `${randomPick(COMMON_DATA.documentStatuses)}`,
    `${randomPick(['待确认', '已核实', '需补充', '已完成'])}`
  ];
  return randomPick(fallbackTexts);
}

/**
 * 根据表单字段生成完整的数据对象
 * @param {Object} fieldMapping - 字段映射 {字段名: {fieldId, componentName, label}}
 * @param {Object} context - 上下文
 * @returns {Object} 生成的数据
 */
function generateFormData(fieldMapping, context = {}) {
  const data = {};
  
  for (const [label, fieldInfo] of Object.entries(fieldMapping)) {
    // 跳过不兼容的字段类型
    const SKIP_TYPES = ['AssociationFormField', 'AssociationFormProperty', 'ImageField', 'AttachmentField'];
    if (SKIP_TYPES.includes(fieldInfo.componentName)) {
      continue;
    }
    
    // 跳过系统字段
    if (label.includes('创建人') || label.includes('创建时间') || label.includes('更新人') || label.includes('更新时间')) {
      continue;
    }
    
    // 跳过流水号字段
    if (fieldInfo.componentName === 'SerialNumberField') {
      continue;
    }
    
    // 跳过子表列字段（单独处理）
    if (fieldInfo.isSubformColumn) {
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
            row[colName] = generateFieldData(colName, context);
          }
        }
        
        subformRows.push(row);
      }
      
      data[label] = subformRows;
      continue;
    }
    
    // 跳过已作为子表列处理的普通字段（避免重复）
    // 检查是否有同名的子表列
    const hasSubformColumn = Object.values(fieldMapping).some(
      f => f.isSubformColumn && f.label === label
    );
    if (hasSubformColumn) {
      continue;
    }
    
    data[label] = generateFieldData(label, context);
  }
  
  return data;
}

/**
 * 生成多条数据
 * @param {Object} fieldMapping - 字段映射
 * @param {number} count - 数量
 * @param {Object} context - 上下文
 * @returns {Array} 数据列表
 */
function generateMultipleData(fieldMapping, count = 1, context = {}) {
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
    '南昌西站至项目地出租车',
    '如家酒店住宿一晚',
    '项目团队工作餐',
    '青山湖区现场勘查交通费',
    '红谷滩区客户拜访打车费',
    '高新区项目现场往返地铁',
    '评估资料复印打印费',
    '测量工具耗材费',
    '专家咨询会议茶歇',
    '报告装订及快递费'
  ];

  for (let i = 0; i < rowCount; i++) {
    rows.push({
      '费用日期': recentDate(randomNumber(1, 30)),
      '费用类型': randomPick(COMMON_DATA.expenseTypes),
      '费用说明': randomPick(expenseDescriptions),
      '金额': randomNumber(50, 5000),
      '发票类型': randomPick(COMMON_DATA.invoiceTypes),
      '发票号码': String(randomNumber(10000000, 99999999))
    });
  }

  return rows;
}

module.exports = {
  generateFieldData,
  generateFormData,
  generateMultipleData,
  generateSubformData,
  createDate,
  recentDate,
  futureDate,
  randomPick,
  randomNumber,
  CITY_DATA,
  INDUSTRY_DATA
};
