const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// ==================== 合法字段类型白名单 ====================
// 所有字段类型必须严格来自此列表，禁止输出任何不在列表中的类型
const VALID_FIELD_TYPES = [
  '单行文本', '多行文本', '数值', '日期',
  '单选', '复选', '下拉单选', '下拉复选',
  '关联表单', '关联带出', '成员', '部门', '附件', '图片', '地址', '流水号'
];

function validateFieldType(type) {
  if (!VALID_FIELD_TYPES.includes(type)) {
    console.error(`[类型校验失败] 非法字段类型: "${type}"，已强制回退为"单行文本"`);
    return '单行文本';
  }
  return type;
}

// ==================== 评估咨询行业字段知识库 ====================
// 用途：当Excel中缺少某个表单的字段定义时，从此知识库补充系统字段和通用字段
// 注意：此知识库只包含通用系统字段，不包含具体业务字段。业务字段必须由Excel提供。
const industryFieldLibrary = {
  // 基础信息类
  '机构信息': {
    type: '普通表单',
    fields: ['机构编号（流水号）', '机构名称', '机构简称', '统一社会信用代码', '机构类型（总公司/分公司/子公司）', '所属行业', '注册资本（金额）', '成立日期（日期）', '注册地址', '办公地址', '联系电话', '传真', '邮箱', '网站', '法人姓名', '法人电话', '机构状态（启用/停用）', '备注（多行）']
  },
  '客户信息': {
    type: '普通表单',
    fields: ['客户编号（流水号）', '客户名称', '客户简称', '客户类型（企业/个人/政府/事业单位）', '统一社会信用代码/身份证号', '所属行业', '客户等级（A/B/C/D）', '客户来源（自主开发/转介绍/招投标/其他）', '联系人姓名', '联系人电话', '联系人邮箱', '联系人职务', '客户地址', '开户银行', '银行账号', '合作状态（潜在/合作中/暂停/终止）', '首次合作日期（日期）', '备注（多行）']
  },
  '估价师信息': {
    type: '普通表单',
    fields: ['估价师编号（流水号）', '姓名', '性别（男/女）', '身份证号', '联系电话', '邮箱', '所属机构', '部门', '职位', '执业资格类型（房地产估价师/土地估价师/资产评估师）', '资格证书号', '注册有效期（日期）', '从业年限（数值）', '专业领域（住宅/商业/工业/土地/资产）', '在职状态（在职/离职/退休）', '入职日期（日期）', '离职日期（日期）', '备注（多行）']
  },
  
  // 项目管理类
  '主项目信息': {
    type: '普通表单',
    fields: ['项目编号（流水号）', '项目名称', '项目类型（房地产评估/土地评估/资产评估/咨询顾问）', '委托方（关联-->客户信息）', '委托方名称（关联带出）', '项目负责人（成员）', '项目成员（成员）', '项目状态（待立项/进行中/已完结/已终止）', '立项日期（日期）', '预计完成日期（日期）', '实际完成日期（日期）', '项目金额（金额）', '项目地点', '项目简介（多行）', '备注（多行）']
  },
  '项目立项': {
    type: '流程表单',
    fields: ['立项编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联带出）', '项目类型（关联带出）', '项目金额（关联带出）', '立项申请人（成员）', '立项日期（日期）', '立项事由（多行）', '预计工期（数值）', '项目预算（金额）', '附件（附件）']
  },
  '项目终止': {
    type: '流程表单',
    fields: ['终止编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联带出）', '项目负责人（关联带出）', '终止申请人（成员）', '终止日期（日期）', '终止原因（多行）', '已完工作量（数值）', '已收费用（金额）', '需退费用（金额）', '终止审批意见（多行）', '附件（附件）']
  },
  '评定估算': {
    type: '流程表单',
    fields: ['估算编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联带出）', '估价师（成员）', '评估目的（抵押/转让/课税/清算/司法鉴定）', '评估方法（市场法/收益法/成本法/假设开发法）', '评估基准日（日期）', '评估价值（金额）', '价值类型（市场价值/投资价值/现状价值/残余价值）', '估算说明（多行）', '附件（附件）']
  },
  
  // 合同管理类
  '合同申请': {
    type: '流程表单',
    fields: ['合同编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联-->客户信息）', '委托方名称（关联带出）', '合同类型（委托评估/咨询顾问/技术服务）', '合同金额（金额）', '付款方式（一次性/分期/按进度）', '合同签订日期（日期）', '合同有效期（日期）', '主要条款（多行）', '附件（附件）'],
    subTables: [
      {
        name: '付款计划',
        fields: ['付款期次（数值）', '付款比例（数值）', '付款金额（金额）', '付款条件（多行）', '计划付款日期（日期）']
      }
    ]
  },
  '合同修改': {
    type: '流程表单',
    fields: ['修改编号（流水号）', '关联合同（关联-->合同申请）', '合同编号（关联带出）', '项目名称（关联带出）', '委托方（关联带出）', '原合同金额（关联带出）', '修改后金额（金额）', '修改内容（多行）', '修改原因（多行）', '申请人（成员）', '申请日期（日期）', '附件（附件）']
  },
  '合同作废': {
    type: '流程表单',
    fields: ['作废编号（流水号）', '关联合同（关联-->合同申请）', '合同编号（关联带出）', '项目名称（关联带出）', '委托方（关联带出）', '合同金额（关联带出）', '已收金额（金额）', '作废原因（多行）', '申请人（成员）', '申请日期（日期）', '附件（附件）']
  },
  
  // 报告管理类
  '报告审核': {
    type: '流程表单',
    fields: ['审核编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '报告编号', '报告类型（正式报告/预评估报告/咨询报告）', '估价师（成员）', '审核人（成员）', '审核日期（日期）', '审核意见（多行）', '审核结论（通过/退回修改）', '附件（附件）']
  },
  '报告盖章': {
    type: '流程表单',
    fields: ['盖章编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '报告编号', '报告类型（关联带出）', '盖章类型（公章/执业章/签字章）', '盖章份数（数值）', '申请人（成员）', '申请日期（日期）', '盖章人（成员）', '盖章日期（日期）', '附件（附件）']
  },
  '报告修改': {
    type: '流程表单',
    fields: ['修改编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '原报告编号', '修改后报告编号', '修改原因（多行）', '修改内容（多行）', '申请人（成员）', '申请日期（日期）', '附件（附件）']
  },
  '报告加出': {
    type: '流程表单',
    fields: ['加出编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '原报告编号', '加出份数（数值）', '加出原因（多行）', '申请人（成员）', '申请日期（日期）', '附件（附件）']
  },
  '报告相关盖章': {
    type: '流程表单',
    fields: ['盖章编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '相关文件名称', '盖章类型（公章/执业章/签字章）', '盖章份数（数值）', '申请人（成员）', '申请日期（日期）', '盖章人（成员）', '盖章日期（日期）', '附件（附件）']
  },
  '报告归档': {
    type: '流程表单',
    fields: ['归档编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '报告编号', '归档日期（日期）', '归档人（成员）', '档案位置', '档案状态（已归档/借阅中/已销毁）', '保管期限（数值）', '备注（多行）', '附件（附件）']
  },
  
  // 案例库
  '案例库': {
    type: '流程表单',
    fields: ['案例编号（流水号）', '案例名称', '案例类型（住宅/商业/工业/土地/资产）', '项目地点', '评估目的', '评估方法', '评估价值（金额）', '估价师（成员）', '案例日期（日期）', '案例描述（多行）', '附件（附件）']
  },
  
  // 考勤&绩效
  '考勤同步': {
    type: '普通表单',
    fields: ['同步编号（流水号）', '同步日期（日期）', '同步月份', '同步人员（成员）', '应出勤天数（数值）', '实际出勤天数（数值）', '迟到次数（数值）', '早退次数（数值）', '请假天数（数值）', '旷工天数（数值）', '同步状态（成功/失败）', '备注（多行）']
  },
  '绩效核算': {
    type: '流程表单',
    fields: ['核算编号（流水号）', '核算月份', '核算人（成员）', '被核算人（成员）', '项目数量（数值）', '项目金额合计（金额）', '绩效系数（数值）', '绩效金额（金额）', '核算日期（日期）', '核算状态（待审核/已通过/已驳回）', '备注（多行）']
  },
  
  // 财务管理
  '费用报销': {
    type: '流程表单',
    fields: ['报销编号（流水号）', '报销人（成员）', '报销日期（日期）', '报销类型（差旅费/办公费/业务招待费/交通费/其他）', '报销总金额（金额）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '发票张数（数值）', '附件（附件）'],
    subTables: [
      {
        name: '报销明细',
        fields: ['费用日期（日期）', '费用类型（交通费/住宿费/餐饮费/办公用品/其他）', '费用说明（多行）', '金额（金额）', '发票类型（增值税专用发票/增值税普通发票/无发票）', '发票号码']
      }
    ]
  },
  '项目结算': {
    type: '流程表单',
    fields: ['结算编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联带出）', '合同金额（关联带出）', '已收金额（金额）', '本次结算金额（金额）', '结算比例（数值）', '结算日期（日期）', '结算状态（待结算/已结算/部分结算）', '备注（多行）'],
    subTables: [
      {
        name: '结算明细',
        fields: ['结算期次（数值）', '结算内容（多行）', '结算金额（金额）', '结算比例（数值）', '计划结算日期（日期）', '实际结算日期（日期）', '结算状态（待结算/已结算）']
      }
    ]
  },
  '收款登记': {
    type: '流程表单',
    fields: ['收款编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联-->客户信息）', '委托方名称（关联带出）', '收款总金额（金额）', '收款方式（银行转账/现金/支票/其他）', '收款日期（日期）', '收款账户', '发票状态（已开票/未开票/部分开票）', '备注（多行）'],
    subTables: [
      {
        name: '收款明细',
        fields: ['款项类型（预付款/进度款/尾款/质保金）', '收款金额（金额）', '收款比例（数值）', '对应合同条款（多行）', '计划收款日期（日期）', '实际收款日期（日期）']
      }
    ]
  },
  '退款登记': {
    type: '流程表单',
    fields: ['退款编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联带出）', '原收款金额（金额）', '退款总金额（金额）', '退款原因（多行）', '退款方式（银行转账/现金/支票）', '退款日期（日期）', '退款账户', '备注（多行）'],
    subTables: [
      {
        name: '退款明细',
        fields: ['原收款编号（关联-->收款登记）', '原收款金额（关联带出）', '本次退款金额（金额）', '退款原因（多行）']
      }
    ]
  },
  '开票登记': {
    type: '流程表单',
    fields: ['开票编号（流水号）', '关联项目（关联-->主项目信息）', '项目名称（关联带出）', '委托方（关联带出）', '发票类型（增值税专用发票/增值税普通发票）', '开票总金额（金额）', '税率（数值）', '税额（金额）', '价税合计（金额）', '开票日期（日期）', '附件（附件）'],
    subTables: [
      {
        name: '发票明细',
        fields: ['发票号码', '发票金额（金额）', '税率（数值）', '税额（金额）', '价税合计（金额）', '发票内容（多行）']
      }
    ]
  },
  '退票登记': {
    type: '流程表单',
    fields: ['退票编号（流水号）', '关联开票（关联-->开票登记）', '发票号码（关联带出）', '发票金额（关联带出）', '退票总金额（金额）', '退票原因（多行）', '退票日期（日期）', '新发票号码', '备注（多行）'],
    subTables: [
      {
        name: '退票明细',
        fields: ['原发票号码（关联-->开票登记）', '原发票金额（关联带出）', '本次退票金额（金额）', '退票原因（多行）']
      }
    ]
  }
};

// ==================== 流水号唯一性校验 ====================

/**
 * 确保每个表单中只有一个流水号字段
 * 规则：
 * 1. 保留第一个流水号字段（通常是表单的主编号，如"审核编号"）
 * 2. 后续检测到的流水号字段，如果名称包含"原"、"修改后"等前缀，转为单行文本
 * 3. 其他重复的流水号，根据上下文转为合适的类型（如"报告编号"在"报告审核"中可保留，但在其他表单中如果是第二个流水号则转为单行文本）
 */
function ensureSingleSerialNumber(fields, formName) {
  let serialNumberCount = 0;
  const processedFields = fields.map(field => {
    const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions);
    if (fieldType === '流水号') {
      serialNumberCount++;
      if (serialNumberCount > 1) {
        // 第二个及以后的流水号，需要转换类型
        // 如果字段名包含"原"、"旧"、"修改后"等，说明是引用其他表单的编号，转为单行文本
        if (field.name.includes('原') || field.name.includes('旧') || field.name.includes('修改后') || field.name.includes('新')) {
          console.log(`  [流水号去重] ${formName} - "${field.name}" 是引用编号，转为单行文本`);
          return { ...field, typeHint: '单行文本', _convertedFromSerial: true };
        }
        // 其他情况，如"报告编号"在"报告审核"中，是业务编号而非表单编号，转为单行文本
        console.log(`  [流水号去重] ${formName} - "${field.name}" 是业务编号，转为单行文本`);
        return { ...field, typeHint: '单行文本', _convertedFromSerial: true };
      }
    }
    return field;
  });
  return processedFields;
}

// ==================== 辅助函数：获取字段类型（用于校验） ====================

function getFieldTypeForCheck(field) {
  return mapFieldType(field.name, field.typeHint, field.isOptions);
}

// ==================== 字段解析函数 ====================

function parseField(fieldStr) {
  if (!fieldStr || typeof fieldStr !== 'string') return null;
  fieldStr = fieldStr.trim();
  const bracketMatch = fieldStr.match(/^(.+?)（(.+?)）$/);
  if (bracketMatch) {
    const name = bracketMatch[1].trim();
    const bracketContent = bracketMatch[2].trim();
    if (bracketContent.includes('/') || bracketContent.includes('、')) {
      return { name, typeHint: null, options: bracketContent.split(/[\/、]/).map(opt => opt.trim()).filter(opt => opt), isOptions: true };
    } else {
      return { name, typeHint: bracketContent, options: null, isOptions: false };
    }
  }
  return { name: fieldStr, typeHint: null, options: null, isOptions: false };
}

function parseFields(fieldsStr) {
  if (!fieldsStr || typeof fieldsStr !== 'string') return [];
  return fieldsStr.split(/[、,]/).map(f => f.trim()).filter(f => f).map(fieldStr => parseField(fieldStr)).filter(f => f !== null);
}

// ==================== 字段类型映射 ====================
// 所有返回的字段类型必须通过 validateFieldType 校验，确保严格来自白名单

function mapFieldType(fieldName, typeHint, isOptions) {
  let result = '单行文本'; // 默认回退值

  // 如果明确指定了typeHint，优先使用
  if (typeHint) {
    const hint = typeHint.toLowerCase();
    // 精确匹配白名单中的类型
    if (hint === '单行文本') result = '单行文本';
    else if (hint === '多行文本') result = '多行文本';
    else if (hint === '数值') result = '数值';
    else if (hint === '日期') result = '日期';
    else if (hint === '单选') result = '单选';
    else if (hint === '复选') result = '复选';
    else if (hint === '下拉单选') result = '下拉单选';
    else if (hint === '下拉复选') result = '下拉复选';
    else if (hint === '关联表单') result = '关联表单';
    else if (hint === '关联带出') result = '关联带出';
    else if (hint === '成员') result = '成员';
    else if (hint === '部门') result = '部门';
    else if (hint === '附件') result = '附件';
    else if (hint === '图片') result = '图片';
    else if (hint === '地址') result = '地址';
    else if (hint === '流水号') result = '流水号';
    // hint中的关键词推断
    else if (hint.includes('流水号')) result = '流水号';
    else if (hint.includes('编号') && !hint.includes('单行文本') && !hint.includes('多行文本')) result = '流水号';
    else if (hint.includes('关联')) result = '关联表单';
    else if (hint.includes('多行') || hint.includes('备注') || hint.includes('说明')) result = '多行文本';
    else if (hint.includes('日期')) result = '日期';
    else if (hint.includes('金额') || hint.includes('价格') || hint.includes('费用')) result = '数值';
    else if (hint.includes('数值') || hint.includes('数字') || hint.includes('数量')) result = '数值';
    else if (hint.includes('成员') || hint.includes('人员') || hint.includes('负责人')) result = '成员';
    else if (hint.includes('部门')) result = '部门';
    else if (hint.includes('附件')) result = '附件';
    else if (hint.includes('图片') || hint.includes('照片')) result = '图片';
    else if (hint.includes('地址')) result = '地址';
    else if (hint.includes('关联带出')) result = '关联带出';
  }

  // 如果typeHint没有匹配到，根据字段名称推断
  if (result === '单行文本') {
    if (fieldName.includes('编号') || fieldName.includes('单号') || fieldName.includes('编码')) result = '流水号';
    else if (fieldName.includes('日期') || fieldName.includes('时间')) result = '日期';
    else if (fieldName.includes('金额') || fieldName.includes('费用') || fieldName.includes('价格') || fieldName.includes('成本')) result = '数值';
    else if (fieldName.includes('数量') || fieldName.includes('个数') || fieldName.includes('人数') || fieldName.includes('次数') || fieldName.includes('天数') || fieldName.includes('份数') || fieldName.includes('张数')) result = '数值';
    else if (fieldName.includes('比例') || fieldName.includes('比率') || fieldName.includes('系数') || fieldName.includes('折扣') || fieldName.includes('税率')) result = '数值';
    else if (fieldName.includes('备注') || fieldName.includes('说明') || fieldName.includes('描述') || fieldName.includes('内容') || fieldName.includes('简介') || fieldName.includes('事由') || fieldName.includes('原因') || fieldName.includes('意见') || fieldName.includes('条款') || fieldName.includes('明细')) result = '多行文本';
    else if (fieldName.includes('附件') || fieldName.includes('文件')) result = '附件';
    else if (fieldName.includes('照片') || fieldName.includes('图片')) result = '图片';
    else if (fieldName.includes('地址') || fieldName.includes('位置') || fieldName.includes('地点')) result = '地址';
    else if (fieldName.includes('人员') || fieldName.includes('负责人') || fieldName.includes('创建人') || fieldName.includes('估价师') || fieldName.includes('成员') || fieldName.includes('员工') || fieldName.includes('申请人') || fieldName.includes('经办人') || fieldName.includes('审批人') || fieldName.includes('签字人') || fieldName.includes('复核人') || fieldName.includes('领取人') || fieldName.includes('归档人') || fieldName.includes('开票人') || fieldName.includes('盖章人') || fieldName.includes('收款人') || fieldName.includes('报销人') || fieldName.includes('核算人') || fieldName.includes('同步人') || fieldName.includes('结算人') || fieldName.includes('审核人') || fieldName.includes('被核算人') || fieldName.includes('借用人') || fieldName.includes('归还人') || fieldName.includes('入库人') || fieldName.includes('出库人')) result = '成员';
    else if (fieldName.includes('部门')) result = '部门';
    else if (fieldName.includes('状态') || fieldName.includes('类型') || fieldName.includes('等级') || fieldName.includes('方式')) result = '下拉单选';
  }

  // 选项字段：如果字段名包含选项特征，推断为下拉单选
  if (isOptions) {
    result = '下拉单选';
  }

  return validateFieldType(result);
}

// ==================== 字段说明生成 ====================

function generateFieldDescription(field, formType) {
  if (field.typeHint) {
    if (field.typeHint.includes('关联-->')) return field.typeHint;
    if (field.typeHint.includes('关联带出')) return '关联带出';
    if (field.typeHint.includes('公式')) return field.typeHint;
    if (field.typeHint.includes('位小数')) return field.typeHint;
    if (field.typeHint.includes('单位')) return field.typeHint;
  }
  if (field.isOptions) return field.options.join('/');
  
  const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions);
  if (fieldType === '流水号') return '自动生成';
  if (fieldType === '数值') {
    if (field.name.includes('金额') || field.name.includes('费用') || field.name.includes('价格') || field.name.includes('成本') || field.name.includes('收款') || field.name.includes('退款') || field.name.includes('报销') || field.name.includes('绩效') || field.name.includes('结算') || field.name.includes('税额') || field.name.includes('价税') || field.name.includes('合同金额') || field.name.includes('预算') || field.name.includes('注册资本')) return '2位小数，单位：元';
    if (field.name.includes('数量') || field.name.includes('个数') || field.name.includes('人数') || field.name.includes('次数') || field.name.includes('天数') || field.name.includes('份数') || field.name.includes('张数') || field.name.includes('年限')) return '0位小数';
    if (field.name.includes('比例') || field.name.includes('比率') || field.name.includes('系数') || field.name.includes('折扣') || field.name.includes('税率')) return '2位小数，单位：%';
    if (field.name.includes('小时')) return '1位小数，单位：小时';
  }
  return '-';
}

// ==================== 字段状态判断 ====================

function getFieldStatus(fieldName, fieldType, typeHint) {
  if (fieldName === '创建人' || fieldName === '创建时间') return '只读';
  if (typeHint && typeHint.includes('关联带出')) return '只读';
  if (typeHint && typeHint.includes('自动生成')) return '只读';
  if (typeHint && typeHint.includes('公式')) return '只读';
  if (fieldType === '流水号') return '只读';
  return '普通';
}

// ==================== 智能补充字段 ====================

function autoCompleteFields(formName, formType, existingFields) {
  const completedFields = [...existingFields];
  const fieldNames = existingFields.map(f => f.name);

  if (!fieldNames.includes('创建人')) {
    completedFields.push({ name: '创建人', typeHint: '成员', options: null, isOptions: false, _auto: true });
  }
  if (!fieldNames.includes('创建时间')) {
    completedFields.push({ name: '创建时间', typeHint: '日期', options: null, isOptions: false, _auto: true });
  }

  if (formType === '普通表单' && !fieldNames.includes('状态')) {
    completedFields.push({ name: '状态', typeHint: null, options: ['启用', '停用'], isOptions: true, _auto: true });
  }

  existingFields.forEach(field => {
    if (field.typeHint && field.typeHint.includes('关联-->')) {
      const targetForm = field.typeHint.replace('关联-->', '').trim();
      const targetFields = inferTargetFields(targetForm);
      targetFields.forEach(targetField => {
        const targetFieldName = field.name + targetField.suffix;
        if (!fieldNames.includes(targetFieldName) && !completedFields.some(f => f.name === targetFieldName)) {
          completedFields.push({ name: targetFieldName, typeHint: '关联带出', options: null, isOptions: false, _auto: true });
        }
      });
    }
  });

  return completedFields;
}

function inferTargetFields(formName) {
  if (formName.includes('客户')) {
    return [{ suffix: '名称', type: '单行文本' }, { suffix: '联系人', type: '单行文本' }, { suffix: '电话', type: '单行文本' }];
  }
  if (formName.includes('产品')) {
    return [{ suffix: '名称', type: '单行文本' }, { suffix: '编码', type: '单行文本' }, { suffix: '规格', type: '单行文本' }];
  }
  if (formName.includes('项目')) {
    return [{ suffix: '名称', type: '单行文本' }, { suffix: '编号', type: '单行文本' }, { suffix: '类型', type: '单行文本' }];
  }
  if (formName.includes('合同')) {
    return [{ suffix: '编号', type: '单行文本' }, { suffix: '金额', type: '单行文本' }];
  }
  if (formName.includes('报告')) {
    return [{ suffix: '编号', type: '单行文本' }, { suffix: '名称', type: '单行文本' }];
  }
  if (formName.includes('估价师') || formName.includes('员工')) {
    return [{ suffix: '姓名', type: '单行文本' }, { suffix: '部门', type: '单行文本' }];
  }
  if (formName.includes('发票') || formName.includes('开票')) {
    return [{ suffix: '号码', type: '单行文本' }, { suffix: '金额', type: '单行文本' }];
  }
  return [{ suffix: '名称', type: '单行文本' }, { suffix: '编号', type: '单行文本' }];
}

// ==================== 数字转中文 ====================

function numberToChinese(num) {
  const chinese = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
  if (num <= 15) return chinese[num - 1];
  return num;
}

// ==================== 生成字段清单 Markdown ====================

function generateFieldListMarkdown(forms, systemName, version) {
  let md = `# ${systemName} - 表单字段清单\n\n`;
  md += `> 版本: ${version}\n`;
  md += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
  md += `> 更新说明: 从Excel导入并智能扩展\n\n`;
  md += `---\n\n`;
  md += `## 📋 字段清单使用说明\n\n`;
  md += `### 一、可用字段类型\n\n`;
  md += `单行文本、多行文本、数值、日期、单选、复选、下拉单选、下拉复选、关联表单、成员、部门、附件、图片、地址、流水号\n\n`;
  md += `### 二、字段说明格式规范\n\n`;
  md += `**只有以下5类字段需要填写字段说明，其他字段留空或填"-"**\n\n`;
  md += `| 字段类型 | 字段说明格式 | 示例 |\n`;
  md += `|---------|-------------|------|\n`;
  md += `| **流水号** | \`自动生成\` | 自动生成 |\n`;
  md += `| **关联表单** | \`关联-->目标表单名称\` | 关联-->产品信息 |\n`;
  md += `| **关联带出** | \`关联-->目标表单名称，关联带出\` | 关联-->产品信息，关联带出 |\n`;
  md += `| **数值** | \`X位小数，单位：XXX\` | 2位小数，单位：元 |\n`;
  md += `| **下拉单选/多选** | \`选项值1/选项值2/选项值3\` | 启用/停用 |\n\n`;
  md += `### 三、字段状态\n\n`;
  md += `| 状态值 | 说明 | 默认值 |\n`;
  md += `|-------|------|--------|\n`;
  md += `| **普通** | 字段可编辑输入（对应宜搭NORMAL） | 大部分字段默认为普通状态 |\n`;
  md += `| **只读** | 字段不可编辑，仅用于展示（对应宜搭READONLY） | 关联带出字段、系统自动生成字段默认为只读状态 |\n`;
  md += `| **隐藏** | 字段在表单中不显示（对应宜搭HIDDEN） | 默认无隐藏字段，用户可根据需要设置 |\n\n`;
  md += `**字段状态自动判定规则**：\n`;
  md += `- **只读**：流水号、创建人、创建时间、关联带出字段、公式计算字段\n`;
  md += `- **普通**：其他所有字段\n\n`;
  md += `**⚠️ 重要说明**：宜搭流程表单会自动记录审批相关信息（审批人、审批时间、审批意见等），**不需要在表单字段中添加审批相关字段**\n\n`;
  md += `### 四、是否必填\n\n`;
  md += `- **是**：该字段为必填项\n`;
  md += `- **否**：该字段为选填项（默认）\n\n`;
  md += `**默认值规则**：\n`;
  md += `- 所有字段默认**非必填**（便于前期测试数据）\n`;
  md += `- 流水号字段**永不必填**（系统自动生成）\n`;
  md += `- 创建人、创建时间等系统字段**永不必填**\n\n`;
  md += `### 五、表单类型标识\n\n`;
  md += `- 「普通表单」：基础数据维护，无审批流程\n`;
  md += `- 「流程表单」：需要审批流程的业务单据\n\n`;
  md += `---\n\n`;

  const modules = {};
  forms.forEach(form => {
    if (!modules[form.group]) modules[form.group] = [];
    modules[form.group].push(form);
  });

  let moduleIndex = 1;
  for (const [moduleName, moduleForms] of Object.entries(modules)) {
    md += `## ${numberToChinese(moduleIndex)}、${moduleName}\n\n`;
    
    moduleForms.forEach((form, formIndex) => {
      md += `### (${numberToChinese(formIndex + 1)}) ${form.name}「${form.type}」\n\n`;
      
      md += `**主表字段：**\n\n`;
      md += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
      md += `|---------|---------|---------|---------|---------|\n`;
      
      form.mainFields.forEach(field => {
        const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions);
        const description = generateFieldDescription(field, form.type);
        const status = getFieldStatus(field.name, fieldType, field.typeHint);
        md += `| ${field.name} | ${fieldType} | ${description} | ${status} | 否 |\n`;
      });
      
      md += `\n`;
      
      if (form.subTables && form.subTables.length > 0) {
        form.subTables.forEach(subTable => {
          if (subTable.name && subTable.fields.length > 0) {
            md += `**子表：${subTable.name}**\n\n`;
            md += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
            md += `|---------|---------|---------|---------|---------|\n`;
            
            subTable.fields.forEach(field => {
              const fieldType = mapFieldType(field.name, field.typeHint, field.isOptions);
              const description = generateFieldDescription(field, form.type);
              const status = getFieldStatus(field.name, fieldType, field.typeHint);
              md += `| ${field.name} | ${fieldType} | ${description} | ${status} | 否 |\n`;
            });
            
            md += `\n`;
          }
        });
      }
    });
    
    moduleIndex++;
  }

  md += `---\n\n`;
  md += `**文件链接**: [规则清单.md](./规则清单.md)\n`;

  return md;
}

// ==================== 生成规则清单 Markdown ====================

function generateRuleListMarkdown(forms, systemName, version) {
  let md = `# ${systemName} - 业务规则清单\n\n`;
  md += `> 版本: ${version}\n`;
  md += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
  md += `> 更新说明: 从Excel导入并智能推导\n\n`;
  md += `---\n\n`;
  md += `## 📋 规则清单使用说明\n\n`;
  md += `### 组织方式\n`;
  md += `本规则清单采用**以表单为主体**的组织方式，每个表单的所有规则集中在一起，方便查找和维护。\n\n`;
  md += `### 规则类型标识\n`;
  md += `| 规则类型 | 标识符号 | 说明 | 记录内容 |\n`;
  md += `|---------|---------|------|---------|\n`;
  md += `| 关键字段更新 | 🔄 | 关键字段值更新规则 | 记录关键字段（如状态字段）的更新逻辑，以及该更新对其他表单的影响 |\n`;
  md += `| 公式规则 | 🔢 | 表单内字段计算公式 | 只记录字段之间的计算公式，不记录自动生成、选项值等非计算类内容 |\n`;
  md += `| 业务规则 | 📋 | 跨表单数据更新规则 | 当前表单操作完成后，对目标表单的数据进行增、删、改操作 |\n`;
  md += `| 自动化规则 | 🤖 | 定时/条件触发的自动化任务 | 包括：①目标表单为流程表单时的数据更新；②定时触发的任务；③条件触发的自动化操作 |\n`;
  md += `| 消息提醒规则 | 📢 | 消息通知规则 | 消息通知规则 |\n`;
  md += `| 聚合表规则 | 📊 | 数据聚合统计规则 | 数据聚合统计规则 |\n`;
  md += `| 报表规则 | 📈 | 报表展示规则 | 报表展示规则 |\n`;
  md += `| 数据联动规则 | 🔄 | 表单间数据联动规则 | 表单间数据联动规则 |\n`;
  md += `| 审批流程规则 | ✅ | 审批流程配置规则 | 审批流程配置规则 |\n\n`;
  md += `### ⚠️ 不记录的内容\n`;
  md += `以下规则**不需要**在规则清单中记录：\n`;
  md += `1. ❌ 流水号自动生成规则\n`;
  md += `2. ❌ 下拉选项的定义\n`;
  md += `3. ❌ 关联表单的基础配置\n`;
  md += `4. ❌ 审批流程配置\n`;
  md += `5. ❌ 简单的关联带出字段\n\n`;
  md += `---\n\n`;

  const modules = {};
  forms.forEach(form => {
    if (!modules[form.group]) modules[form.group] = [];
    modules[form.group].push(form);
  });

  let moduleIndex = 1;
  for (const [moduleName, moduleForms] of Object.entries(modules)) {
    md += `## ${numberToChinese(moduleIndex)}、${moduleName}\n\n`;
    
    moduleForms.forEach((form, formIndex) => {
      md += `### ${formIndex + 1}. ${form.name}\n\n`;
      
      // 🔄 关键字段更新规则
      const statusFields = form.mainFields.filter(f => f.name.includes('状态'));
      if (statusFields.length > 0) {
        md += `#### 🔄 关键字段更新规则\n\n`;
        statusFields.forEach(field => {
          md += `**字段: ${field.name}**\n\n`;
          md += `| 更新场景 | 更新逻辑 | 影响范围 |\n`;
          md += `|---------|---------|---------|\n`;
          md += `| 表单提交 | 根据业务逻辑更新状态 | 相关表单状态联动 |\n\n`;
        });
      }
      
      // 🔢 公式规则
      const formulaFields = form.mainFields.filter(f => f.typeHint && f.typeHint.includes('公式'));
      if (formulaFields.length > 0) {
        md += `#### 🔢 公式规则\n\n`;
        md += `| 字段名称 | 公式说明 | 触发时机 |\n`;
        md += `|---------|---------|---------|\n`;
        formulaFields.forEach(field => {
          const formula = field.typeHint.replace('公式：', '').replace('公式', '');
          md += `| ${field.name} | ${formula} | 字段变更时 |\n`;
        });
        md += `\n`;
      } else {
        md += `#### 🔢 公式规则\n\n`;
        md += `无\n\n`;
      }
      
      // 📋 业务规则
      md += `#### 📋 业务规则\n\n`;
      const relationFields = form.mainFields.filter(f => f.typeHint && f.typeHint.includes('关联-->'));
      if (relationFields.length > 0 || (form.subTables && form.subTables.length > 0)) {
        md += `**规则1: ${form.name}数据关联**\n\n`;
        md += `- **触发条件**: ${form.name}提交或更新\n`;
        md += `- **执行动作**: \n`;
        if (relationFields.length > 0) {
          md += `  - 关联表单数据联动\n`;
        }
        if (form.subTables && form.subTables.length > 0) {
          md += `  - 子表数据汇总计算\n`;
        }
        md += `- **影响范围**: 关联表单、子表数据\n\n`;
      } else {
        md += `无\n\n`;
      }
      
      // 🤖 自动化规则
      md += `#### 🤖 自动化规则\n\n`;
      md += `无\n\n`;
      
      md += `---\n\n`;
    });
    
    moduleIndex++;
  }

  // 附录：全局规则
  md += `## 附录：全局规则\n\n`;
  
  md += `### 聚合表规则\n\n`;
  md += `#### 1. 项目统计聚合\n\n`;
  md += `- **数据源**: 主项目信息、项目立项、项目终止\n`;
  md += `- **聚合方式**: 计数、求和\n`;
  md += `- **聚合字段**: 项目数量、项目金额\n`;
  md += `- **分组字段**: 项目类型、项目状态、委托方、项目负责人\n`;
  md += `- **过滤条件**: 无\n\n`;
  
  md += `#### 2. 财务统计聚合\n\n`;
  md += `- **数据源**: 收款登记、退款登记、开票登记、退票登记\n`;
  md += `- **聚合方式**: 求和\n`;
  md += `- **聚合字段**: 收款金额、退款金额、开票金额\n`;
  md += `- **分组字段**: 委托方、项目名称、月份\n`;
  md += `- **过滤条件**: 无\n\n`;
  
  md += `### 报表规则\n\n`;
  md += `#### 1. 项目明细报表\n\n`;
  md += `- **报表类型**: 明细表\n`;
  md += `- **数据来源**: 主项目信息\n`;
  md += `- **展示字段**: 项目编号、项目名称、委托方、项目负责人、项目金额、项目状态\n`;
  md += `- **筛选条件**: 可按项目类型、项目状态、委托方、日期范围筛选\n`;
  md += `- **排序规则**: 立项日期 降序\n\n`;
  
  md += `#### 2. 财务报表\n\n`;
  md += `- **报表类型**: 汇总表\n`;
  md += `- **数据来源**: 收款登记、开票登记\n`;
  md += `- **展示字段**: 委托方、项目名称、合同金额、已收款金额、已开票金额\n`;
  md += `- **筛选条件**: 可按委托方、项目名称、日期范围筛选\n`;
  md += `- **排序规则**: 收款日期 降序\n\n`;
  
  const flowForms = forms.filter(f => f.type === '流程表单');
  if (flowForms.length > 0) {
    md += `### 审批流程规则\n\n`;
    flowForms.forEach((form, idx) => {
      md += `#### ${idx + 1}. ${form.name}审批流程\n\n`;
      md += `- **发起条件**: 提交${form.name}申请\n`;
      md += `- **审批节点**: \n`;
      md += `  - 节点1: 部门负责人审批\n`;
      md += `  - 节点2: 总经理审批（金额≥10万）\n`;
      md += `- **流转条件**: 金额分支\n`;
      md += `- **抄送规则**: 抄送相关人员\n\n`;
    });
  }

  md += `---\n\n`;
  md += `**文件链接**: [字段清单.md](./字段清单.md)\n`;

  return md;
}

// ==================== 从Excel解析表单数据 ====================

function parseExcelForms(excelPath) {
  const workbook = xlsx.readFile(excelPath, {codepage: 65001});
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // 先尝试作为标准表格解析
  const data = xlsx.utils.sheet_to_json(sheet);
  
  if (data.length > 0 && (data[0]['表单名称'] || data[0]['表单分组'])) {
    console.log('检测到标准表格格式');
    
    // 填充缺失的表单分组（向下填充）
    let currentGroup = '';
    const filledData = data.map(row => {
      if (row['表单分组'] && row['表单分组'].trim()) {
        currentGroup = row['表单分组'].trim();
      }
      return {
        ...row,
        '表单分组': currentGroup
      };
    });
    
    return filledData.map(row => {
      const formName = row['表单名称'];
      const formType = row['表单类型'] || '普通表单';
      const form = {
        group: row['表单分组'] || '',
        name: formName,
        type: formType,
        mainFields: [],
        subTables: []
      };

      // 如果Excel中有字段定义，使用Excel中的
      if (row['主表字段']) {
        form.mainFields = parseFields(row['主表字段']);
      } else {
        // 如果Excel中没有字段定义，从行业知识库扩展
        const libraryForm = industryFieldLibrary[formName];
        if (libraryForm) {
          console.log(`  [智能扩展] ${formName} - 从行业知识库扩展 ${libraryForm.fields.length} 个字段`);
          form.mainFields = libraryForm.fields.map(f => parseField(f));
        } else {
          console.log(`  [警告] ${formName} - 无字段定义且无行业知识库匹配`);
        }
      }

      // 子表处理 - 优先使用Excel中的子表定义
      if (row['子表1名称'] && row['子表1字段']) {
        form.subTables.push({
          name: row['子表1名称'],
          fields: parseFields(row['子表1字段'])
        });
      }

      if (row['子表2名称'] && row['子表2字段']) {
        form.subTables.push({
          name: row['子表2名称'],
          fields: parseFields(row['子表2字段'])
        });
      }

      // 如果Excel中没有子表定义，从行业知识库智能推理子表
      if (form.subTables.length === 0) {
        const libraryForm = industryFieldLibrary[formName];
        if (libraryForm && libraryForm.subTables && libraryForm.subTables.length > 0) {
          console.log(`  [智能推理子表] ${formName} - 推理出 ${libraryForm.subTables.length} 个子表`);
          libraryForm.subTables.forEach(subTable => {
            form.subTables.push({
              name: subTable.name,
              fields: subTable.fields.map(f => parseField(f))
            });
          });
        }
      }

      // 流水号唯一性校验：每个表单只能有一个流水号
      form.mainFields = ensureSingleSerialNumber(form.mainFields, form.name);

      form.mainFields = autoCompleteFields(form.name, form.type, form.mainFields);
      return form;
    }).map(form => {
      // 对子表也进行流水号唯一性校验
      if (form.subTables && form.subTables.length > 0) {
        form.subTables = form.subTables.map(subTable => ({
          ...subTable,
          fields: ensureSingleSerialNumber(subTable.fields, `${form.name}.${subTable.name}`)
        }));
      }
      return form;
    });
  } else {
    // JavaScript代码格式（兼容旧格式）
    console.log('检测到JavaScript代码格式');
    const range = xlsx.utils.decode_range(sheet['!ref']);
    let lines = [];
    for(let r = 0; r <= range.e.r; r++) {
      const cell = sheet[xlsx.utils.encode_cell({r:r, c:0})];
      if(cell && cell.v) {
        lines.push(cell.v.toString().trim());
      }
    }

    const formLibrary = {};
    let currentForm = null;
    const formRegex = /^['"]([^'"]+)['"]:\s*\{/;
    const typeRegex = /type:\s*['"]([^'"]+)['"]/;
    const fieldRegex = /^\s*['"]([^'"]+)['"],?\s*$/;
    const subTableNameRegex = /name:\s*['"]([^'"]+)['"]/;

    for(let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const formMatch = line.match(formRegex);
      if(formMatch) {
        currentForm = formMatch[1];
        formLibrary[currentForm] = {
          name: currentForm,
          type: '普通表单',
          fields: [],
          subTables: []
        };
        continue;
      }
      
      const typeMatch = line.match(typeRegex);
      if(typeMatch && currentForm) {
        formLibrary[currentForm].type = typeMatch[1];
        continue;
      }
      
      if(line.includes('subTables:') || line.includes('subTable:')) {
        continue;
      }
      
      const subTableNameMatch = line.match(subTableNameRegex);
      if(subTableNameMatch && currentForm) {
        formLibrary[currentForm].subTables.push({
          name: subTableNameMatch[1],
          fields: []
        });
        continue;
      }
      
      const fieldMatch = line.match(fieldRegex);
      if(fieldMatch && currentForm) {
        const fieldStr = fieldMatch[1];
        if(formLibrary[currentForm].subTables.length > 0) {
          const lastSubTable = formLibrary[currentForm].subTables[formLibrary[currentForm].subTables.length - 1];
          lastSubTable.fields.push(parseField(fieldStr));
        } else {
          formLibrary[currentForm].fields.push(parseField(fieldStr));
        }
        continue;
      }
    }

    return Object.values(formLibrary).map(form => {
      const result = {
        group: inferModuleGroup(form.name),
        name: form.name,
        type: form.type,
        mainFields: form.fields || [],
        subTables: form.subTables || []
      };
      // 流水号唯一性校验：每个表单只能有一个流水号
      result.mainFields = ensureSingleSerialNumber(result.mainFields, result.name);
      result.mainFields = autoCompleteFields(result.name, result.type, result.mainFields);
      // 对子表也进行流水号唯一性校验
      if (result.subTables && result.subTables.length > 0) {
        result.subTables = result.subTables.map(subTable => ({
          ...subTable,
          fields: ensureSingleSerialNumber(subTable.fields, `${result.name}.${subTable.name}`)
        }));
      }
      return result;
    });
  }
}

function inferModuleGroup(formName) {
  if(formName.includes('机构') || formName.includes('客户') || formName.includes('估价师') || formName.includes('案例')) return '基础信息';
  if(formName.includes('项目') || formName.includes('立项') || formName.includes('终止') || formName.includes('评定')) return '项目管理';
  if(formName.includes('合同')) return '合同管理';
  if(formName.includes('报告')) return '报告管理';
  if(formName.includes('考勤') || formName.includes('绩效')) return '考勤&绩效';
  if(formName.includes('报销') || formName.includes('结算') || formName.includes('收款') || formName.includes('退款') || formName.includes('开票') || formName.includes('退票')) return '财务管理';
  return '其他';
}

// ==================== 主函数 ====================

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('用法: node excel_to_form.js <Excel文件路径> [输出目录] [系统名称] [版本号]');
    console.log('示例: node excel_to_form.js "项目管理.xlsx" "01需求梳理" "项目管理系统" "1.0.0"');
    process.exit(1);
  }

  const excelPath = args[0];
  const outputDir = args[1] || '.';
  const systemName = args[2] || '项目管理系统';
  const version = args[3] || '1.0.0';

  if (!fs.existsSync(excelPath)) {
    console.error('错误: Excel 文件不存在:', excelPath);
    process.exit(1);
  }

  console.log('正在读取 Excel 文件:', excelPath);

  try {
    const forms = parseExcelForms(excelPath);
    console.log(`\n解析到 ${forms.length} 个表单\n`);
    forms.forEach((form, i) => {
      console.log(`${i + 1}. [${form.group}] [${form.type}] ${form.name} - ${form.mainFields.length} 个字段`);
    });

    // 生成字段清单
    const fieldListMd = generateFieldListMarkdown(forms, systemName, version);
    const fieldListPath = path.join(outputDir, '字段清单.md');
    fs.writeFileSync(fieldListPath, fieldListMd, 'utf8');
    console.log('\n✅ 字段清单已生成:', fieldListPath);

    // 生成规则清单
    const ruleListMd = generateRuleListMarkdown(forms, systemName, version);
    const ruleListPath = path.join(outputDir, '规则清单.md');
    fs.writeFileSync(ruleListPath, ruleListMd, 'utf8');
    console.log('✅ 规则清单已生成:', ruleListPath);

    console.log('\n🎉 转换完成！');
    console.log(`📁 输出目录: ${path.resolve(outputDir)}`);

  } catch (error) {
    console.error('转换失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出函数供其他模块使用
module.exports = {
  parseField,
  parseFields,
  mapFieldType,
  autoCompleteFields,
  generateFieldListMarkdown,
  generateRuleListMarkdown,
  parseExcelForms,
  industryFieldLibrary,
  ensureSingleSerialNumber
};
