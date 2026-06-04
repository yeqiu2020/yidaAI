const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = 'd:\\宜搭开发项目资料\\2026项目\\恒方咨询\\恒方咨询AI助手V1.6.2\\项目管理\\01需求梳理\\项目管理表单清单.xlsx';
const outputDir = 'd:\\宜搭开发项目资料\\2026项目\\恒方咨询\\恒方咨询AI助手V1.6.2\\项目管理\\01需求梳理';

// ==================== 流水号唯一性校验 ====================

/**
 * 确保每个表单中只有一个流水号字段
 * 规则：
 * 1. 保留第一个流水号字段（通常是表单的主编号）
 * 2. 后续检测到的流水号字段，如果名称包含"原"、"修改后"等前缀，转为单行文本
 * 3. 其他重复的流水号，转为单行文本
 */
function ensureSingleSerialNumber(fields, formName) {
  let serialNumberCount = 0;
  const processedFields = fields.map(field => {
    const parsed = parseField(field);
    const fieldType = inferFieldType(parsed.name, parsed.hint);
    if (fieldType === '流水号') {
      serialNumberCount++;
      if (serialNumberCount > 1) {
        // 第二个及以后的流水号，需要转换类型
        if (parsed.name.includes('原') || parsed.name.includes('旧') || parsed.name.includes('修改后') || parsed.name.includes('新')) {
          console.log(`  [流水号去重] ${formName} - "${parsed.name}" 是引用编号，转为单行文本`);
          return field.replace('（流水号）', '（单行文本）').replace('(流水号)', '(单行文本)');
        }
        console.log(`  [流水号去重] ${formName} - "${parsed.name}" 是业务编号，转为单行文本`);
        return field.replace('（流水号）', '（单行文本）').replace('(流水号)', '(单行文本)');
      }
    }
    return field;
  });
  return processedFields;
}

const workbook = xlsx.readFile(excelPath, {codepage: 65001});
const sheet = workbook.Sheets['Sheet1'];
const range = xlsx.utils.decode_range(sheet['!ref']);

let lines = [];
for(let r = 0; r <= range.e.r; r++) {
  const cell = sheet[xlsx.utils.encode_cell({r:r, c:0})];
  if(cell && cell.v) {
    lines.push(cell.v.toString().trim());
  }
}

const code = lines.join('\n') + '\nmodule.exports = formFieldLibrary;';

// 辅助函数提前定义
function parseField(fieldStr) {
  const bracketMatch = fieldStr.match(/^(.+?)（(.+?)）$/);
  if(bracketMatch) {
    return {
      name: bracketMatch[1].trim(),
      hint: bracketMatch[2].trim()
    };
  }
  return { name: fieldStr, hint: null };
}

// 合法字段类型白名单
const VALID_FIELD_TYPES = [
  '单行文本', '多行文本', '数值', '日期',
  '单选', '复选', '下拉单选', '下拉复选',
  '关联表单', '成员', '部门', '附件', '图片', '地址', '流水号'
];

function validateFieldType(type) {
  if (!VALID_FIELD_TYPES.includes(type)) {
    console.error(`[类型校验失败] 非法字段类型: "${type}"，已强制回退为"单行文本"`);
    return '单行文本';
  }
  return type;
}

function inferFieldType(fieldName, hint) {
  let result = '单行文本';

  if(hint) {
    if(hint.includes('流水号') || hint.includes('编号')) result = '流水号';
    else if(hint.includes('关联')) result = '关联表单';
    else if(hint.includes('日期')) result = '日期';
    else if(hint.includes('金额') || hint.includes('价格') || hint.includes('费用')) result = '数值';
    else if(hint.includes('数值') || hint.includes('数量')) result = '数值';
    else if(hint.includes('成员') || hint.includes('人员')) result = '成员';
    else if(hint.includes('部门')) result = '部门';
    else if(hint.includes('附件')) result = '附件';
    else if(hint.includes('图片') || hint.includes('照片')) result = '图片';
    else if(hint.includes('地址')) result = '地址';
    else if(hint.includes('/') || hint.includes('、')) result = '下拉单选';
  }

  if (result === '单行文本') {
    if(fieldName.includes('编号') || fieldName.includes('单号')) result = '流水号';
    else if(fieldName.includes('日期') || fieldName.includes('时间')) result = '日期';
    else if(fieldName.includes('金额') || fieldName.includes('费用') || fieldName.includes('价格')) result = '数值';
    else if(fieldName.includes('数量')) result = '数值';
    else if(fieldName.includes('人员') || fieldName.includes('负责人') || fieldName.includes('人')) result = '成员';
    else if(fieldName.includes('部门')) result = '部门';
    else if(fieldName.includes('状态') || fieldName.includes('类型') || fieldName.includes('等级')) result = '下拉单选';
    else if(fieldName.includes('备注') || fieldName.includes('说明') || fieldName.includes('描述')) result = '多行文本';
    else if(fieldName.includes('附件') || fieldName.includes('文件')) result = '附件';
    else if(fieldName.includes('照片') || fieldName.includes('图片')) result = '图片';
    else if(fieldName.includes('地址') || fieldName.includes('位置') || fieldName.includes('地点')) result = '地址';
  }

  return validateFieldType(result);
}

// 解析表单数据
const formLibrary = {};
let currentForm = null;
let currentSection = null;
let bracketCount = 0;

// 使用更安全的方式解析
const formRegex = /^['"]([^'"]+)['"]:\s*\{/;
const typeRegex = /type:\s*['"]([^'"]+)['"]/;
const fieldRegex = /^\s*['"]([^'"]+)['"],?\s*$/;

for(let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // 检测表单开始
  const formMatch = line.match(formRegex);
  if(formMatch) {
    currentForm = formMatch[1];
    formLibrary[currentForm] = {
      name: currentForm,
      type: '普通表单',
      fields: []
    };
    continue;
  }
  
  // 检测类型
  const typeMatch = line.match(typeRegex);
  if(typeMatch && currentForm) {
    formLibrary[currentForm].type = typeMatch[1];
    continue;
  }
  
  // 检测字段
  const fieldMatch = line.match(fieldRegex);
  if(fieldMatch && currentForm) {
    formLibrary[currentForm].fields.push(fieldMatch[1]);
  }
}

// 对每个表单的字段进行流水号唯一性校验
Object.keys(formLibrary).forEach(formName => {
  formLibrary[formName].fields = ensureSingleSerialNumber(formLibrary[formName].fields, formName);
});

const forms = Object.values(formLibrary);
console.log('解析到的表单数量:', forms.length);

// 生成字段清单
let fieldMd = `# 项目管理系统 - 表单字段清单\n\n`;
fieldMd += `> 版本: 1.0.0\n`;
fieldMd += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
fieldMd += `> 更新说明: 从Excel导入\n\n`;
fieldMd += `---\n\n`;
fieldMd += `## 📋 字段清单使用说明\n\n`;
fieldMd += `### 一、可用字段类型\n\n`;
fieldMd += `单行文本、多行文本、数值、日期、单选、复选、下拉单选、下拉复选、关联表单、成员、部门、附件、图片、地址、流水号\n\n`;
fieldMd += `### 二、字段说明格式规范\n\n`;
fieldMd += `**只有以下5类字段需要填写字段说明，其他字段留空或填"-"**\n\n`;
fieldMd += `| 字段类型 | 字段说明格式 | 示例 |\n`;
fieldMd += `|---------|-------------|------|\n`;
fieldMd += `| **流水号** | \`自动生成\` | 自动生成 |\n`;
fieldMd += `| **关联表单** | \`关联-->目标表单名称\` | 关联-->产品信息 |\n`;
fieldMd += `| **关联带出** | \`关联-->目标表单名称，关联带出\` | 关联-->产品信息，关联带出 |\n`;
fieldMd += `| **数值** | \`X位小数，单位：XXX\` | 2位小数，单位：元 |\n`;
fieldMd += `| **下拉单选/多选** | \`选项值1/选项值2/选项值3\` | 启用/停用 |\n\n`;
fieldMd += `### 三、字段状态\n\n`;
fieldMd += `| 状态值 | 说明 | 默认值 |\n`;
fieldMd += `|-------|------|--------|\n`;
fieldMd += `| **普通** | 字段可编辑输入（对应宜搭NORMAL） | 大部分字段默认为普通状态 |\n`;
fieldMd += `| **只读** | 字段不可编辑，仅用于展示（对应宜搭READONLY） | 关联带出字段、系统自动生成字段默认为只读状态 |\n`;
fieldMd += `| **隐藏** | 字段在表单中不显示（对应宜搭HIDDEN） | 默认无隐藏字段，用户可根据需要设置 |\n\n`;
fieldMd += `**字段状态自动判定规则**：\n`;
fieldMd += `- **只读**：流水号、创建人、创建时间、关联带出字段、公式计算字段\n`;
fieldMd += `- **普通**：其他所有字段\n\n`;
fieldMd += `**⚠️ 重要说明**：宜搭流程表单会自动记录审批相关信息（审批人、审批时间、审批意见等），**不需要在表单字段中添加审批相关字段**\n\n`;
fieldMd += `### 四、是否必填\n\n`;
fieldMd += `- **是**：该字段为必填项\n`;
fieldMd += `- **否**：该字段为选填项（默认）\n\n`;
fieldMd += `**默认值规则**：\n`;
fieldMd += `- 所有字段默认**非必填**（便于前期测试数据）\n`;
fieldMd += `- 流水号字段**永不必填**（系统自动生成）\n`;
fieldMd += `- 创建人、创建时间等系统字段**永不必填**\n\n`;
fieldMd += `### 五、表单类型标识\n\n`;
fieldMd += `- 「普通表单」：基础数据维护，无审批流程\n`;
fieldMd += `- 「流程表单」：需要审批流程的业务单据\n\n`;
fieldMd += `---\n\n`;

// 按模块分组（简单分组）
const modules = {};
forms.forEach(form => {
  let module = '其他';
  if(form.name.includes('机构') || form.name.includes('客户') || form.name.includes('人员') || form.name.includes('产品') || form.name.includes('仓库') || form.name.includes('估价') || form.name.includes('收费') || form.name.includes('银行') || form.name.includes('资质')) {
    module = '基础信息';
  } else if(form.name.includes('项目') || form.name.includes('合同') || form.name.includes('订单') || form.name.includes('任务') || form.name.includes('计划') || form.name.includes('预算')) {
    module = '项目管理';
  } else if(form.name.includes('审批') || form.name.includes('申请') || form.name.includes('报告') || form.name.includes('底稿') || form.name.includes('复核') || form.name.includes('审核') || form.name.includes('签发')) {
    module = '业务流程';
  } else if(form.name.includes('财务') || form.name.includes('收款') || form.name.includes('付款') || form.name.includes('报销') || form.name.includes('发票') || form.name.includes('工资') || form.name.includes('成本') || form.name.includes('结算')) {
    module = '财务管理';
  } else if(form.name.includes('库存') || form.name.includes('采购') || form.name.includes('领用') || form.name.includes('调拨') || form.name.includes('入库') || form.name.includes('出库')) {
    module = '库存管理';
  }
  
  if(!modules[module]) modules[module] = [];
  modules[module].push(form);
});

let moduleIndex = 1;
for(const [moduleName, moduleForms] of Object.entries(modules)) {
  fieldMd += `## ${numberToChinese(moduleIndex)}、${moduleName}\n\n`;
  
  moduleForms.forEach((form, formIndex) => {
    fieldMd += `### (${numberToChinese(formIndex + 1)}) ${form.name}「${form.type}」\n\n`;
    fieldMd += `**主表字段：**\n\n`;
    fieldMd += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
    fieldMd += `|---------|---------|---------|---------|---------|\n`;
    
    form.fields.forEach(field => {
      const parsed = parseField(field);
      const fieldType = inferFieldType(parsed.name, parsed.hint);
      const description = generateDescription(parsed, fieldType);
      const status = getFieldStatus(parsed.name, fieldType, parsed.hint);
      
      fieldMd += `| ${parsed.name} | ${fieldType} | ${description} | ${status} | 否 |\n`;
    });
    
    // 添加系统字段
    fieldMd += `| 创建人 | 成员 | - | 只读 | 否 |\n`;
    fieldMd += `| 创建时间 | 日期 | - | 只读 | 否 |\n`;
    if(form.type === '普通表单') {
      fieldMd += `| 状态 | 下拉单选 | 启用/停用 | 普通 | 否 |\n`;
    }
    
    fieldMd += `\n`;
  });
  
  moduleIndex++;
}

fieldMd += `---\n\n`;
fieldMd += `**文件链接**: [规则清单.md](./规则清单.md)\n`;

fs.writeFileSync(path.join(outputDir, '字段清单.md'), fieldMd, 'utf8');
console.log('✅ 字段清单已生成');

// 生成规则清单
let ruleMd = `# 项目管理系统 - 业务规则清单\n\n`;
ruleMd += `> 版本: 1.0.0\n`;
ruleMd += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
ruleMd += `> 更新说明: 从Excel导入并智能推导\n\n`;
ruleMd += `---\n\n`;
ruleMd += `## 📋 规则清单使用说明\n\n`;
ruleMd += `### 组织方式\n`;
ruleMd += `本规则清单采用**以表单为主体**的组织方式，每个表单的所有规则集中在一起，方便查找和维护。\n\n`;
ruleMd += `### 规则类型标识\n`;
ruleMd += `| 规则类型 | 标识符号 | 说明 | 记录内容 |\n`;
ruleMd += `|---------|---------|------|---------|\n`;
ruleMd += `| 关键字段更新 | 🔄 | 关键字段值更新规则 | 记录关键字段（如状态字段）的更新逻辑，以及该更新对其他表单的影响 |\n`;
ruleMd += `| 公式规则 | 🔢 | 表单内字段计算公式 | 只记录字段之间的计算公式，不记录自动生成、选项值等非计算类内容 |\n`;
ruleMd += `| 业务规则 | 📋 | 跨表单数据更新规则 | 当前表单操作完成后，对目标表单的数据进行增、删、改操作 |\n`;
ruleMd += `| 自动化规则 | 🤖 | 定时/条件触发的自动化任务 | 包括：①目标表单为流程表单时的数据更新；②定时触发的任务；③条件触发的自动化操作 |\n`;
ruleMd += `| 消息提醒规则 | 📢 | 消息通知规则 | 消息通知规则 |\n`;
ruleMd += `| 聚合表规则 | 📊 | 数据聚合统计规则 | 数据聚合统计规则 |\n`;
ruleMd += `| 报表规则 | 📈 | 报表展示规则 | 报表展示规则 |\n`;
ruleMd += `| 数据联动规则 | 🔄 | 表单间数据联动规则 | 表单间数据联动规则 |\n`;
ruleMd += `| 审批流程规则 | ✅ | 审批流程配置规则 | 审批流程配置规则 |\n\n`;
ruleMd += `### ⚠️ 不记录的内容\n`;
ruleMd += `以下规则**不需要**在规则清单中记录：\n`;
ruleMd += `1. ❌ 流水号自动生成规则\n`;
ruleMd += `2. ❌ 下拉选项的定义\n`;
ruleMd += `3. ❌ 关联表单的基础配置\n`;
ruleMd += `4. ❌ 审批流程配置\n`;
ruleMd += `5. ❌ 简单的关联带出字段\n\n`;
ruleMd += `---\n\n`;

moduleIndex = 1;
for(const [moduleName, moduleForms] of Object.entries(modules)) {
  ruleMd += `## ${numberToChinese(moduleIndex)}、${moduleName}\n\n`;
  
  moduleForms.forEach((form, formIndex) => {
    ruleMd += `### ${formIndex + 1}. ${form.name}\n\n`;
    
    // 🔄 关键字段更新规则
    const statusFields = form.fields.filter(f => f.includes('状态'));
    if(statusFields.length > 0) {
      ruleMd += `#### 🔄 关键字段更新规则\n\n`;
      statusFields.forEach(field => {
        const parsed = parseField(field);
        ruleMd += `**字段: ${parsed.name}**\n\n`;
        ruleMd += `| 更新场景 | 更新逻辑 | 影响范围 |\n`;
        ruleMd += `|---------|---------|---------|\n`;
        ruleMd += `| 表单提交 | 根据业务逻辑更新状态 | 相关表单状态联动 |\n\n`;
      });
    }
    
    // 🔢 公式规则
    const formulaFields = form.fields.filter(f => f.includes('公式') || f.includes('计算') || f.includes('合计') || f.includes('总计'));
    if(formulaFields.length > 0) {
      ruleMd += `#### 🔢 公式规则\n\n`;
      ruleMd += `| 字段名称 | 公式说明 | 触发时机 |\n`;
      ruleMd += `|---------|---------|---------|\n`;
      formulaFields.forEach(field => {
        const parsed = parseField(field);
        ruleMd += `| ${parsed.name} | 根据业务逻辑计算 | 字段变更时 |\n`;
      });
      ruleMd += `\n`;
    }
    
    // 📋 业务规则
    const relationFields = form.fields.filter(f => f.includes('关联') || f.includes('选择'));
    if(relationFields.length > 0) {
      ruleMd += `#### 📋 业务规则\n\n`;
      ruleMd += `**规则1: ${form.name}数据关联**\n\n`;
      ruleMd += `- **触发条件**: ${form.name}提交或更新\n`;
      ruleMd += `- **执行动作**: \n`;
      relationFields.forEach(field => {
        const parsed = parseField(field);
        ruleMd += `  - ${parsed.name}关联数据联动\n`;
      });
      ruleMd += `- **影响范围**: 关联表单数据\n\n`;
    }
    
    // 🤖 自动化规则
    const dateFields = form.fields.filter(f => f.includes('日期') || f.includes('时间'));
    if(dateFields.length > 0) {
      ruleMd += `#### 🤖 自动化规则\n\n`;
      ruleMd += `**规则1: 日期到期提醒**\n\n`;
      ruleMd += `- **触发器**: 定时触发\n`;
      ruleMd += `- **触发条件**: 日期字段即将到期\n`;
      ruleMd += `- **执行动作**: 发送消息提醒给相关人员\n`;
      ruleMd += `- **执行时机**: 每天早上 9:00\n\n`;
    }
    
    ruleMd += `---\n\n`;
  });
  
  moduleIndex++;
}

// 附录：全局规则
ruleMd += `## 附录：全局规则\n\n`;
ruleMd += `### 聚合表规则\n\n`;
ruleMd += `#### 1. 业务统计\n\n`;
ruleMd += `- **数据源**: 各业务表单\n`;
ruleMd += `- **聚合方式**: 计数 + 求和\n`;
ruleMd += `- **聚合字段**: 表单数量、金额字段\n`;
ruleMd += `- **分组字段**: 表单类型、状态\n`;
ruleMd += `- **过滤条件**: 无\n\n`;
ruleMd += `### 报表规则\n\n`;
ruleMd += `#### 1. 业务明细报表\n\n`;
ruleMd += `- **报表类型**: 明细表\n`;
ruleMd += `- **数据来源**: 各业务表单\n`;
ruleMd += `- **展示字段**: 关键业务字段\n`;
ruleMd += `- **筛选条件**: 可按时间、状态筛选\n`;
ruleMd += `- **排序规则**: 创建时间 降序\n\n`;
ruleMd += `---\n\n`;
ruleMd += `**文件链接**: [字段清单.md](./字段清单.md)\n`;

fs.writeFileSync(path.join(outputDir, '规则清单.md'), ruleMd, 'utf8');
console.log('✅ 规则清单已生成');

// 辅助函数（已在文件开头定义，此处保留以兼容旧调用）
function parseField(fieldStr) {
  const bracketMatch = fieldStr.match(/^(.+?)（(.+?)）$/);
  if(bracketMatch) {
    return {
      name: bracketMatch[1].trim(),
      hint: bracketMatch[2].trim()
    };
  }
  return { name: fieldStr, hint: null };
}

function generateDescription(parsed, fieldType) {
  if(parsed.hint) {
    if(parsed.hint.includes('关联')) return parsed.hint;
    if(parsed.hint.includes('公式')) return parsed.hint;
    if(parsed.hint.includes('位小数')) return parsed.hint;
    if(parsed.hint.includes('单位')) return parsed.hint;
    if(parsed.hint.includes('/') || parsed.hint.includes('、')) return parsed.hint;
  }
  
  if(fieldType === '流水号') return '自动生成';
  if(fieldType === '数值') {
    if(parsed.name.includes('金额') || parsed.name.includes('费用') || parsed.name.includes('价格')) {
      return '2位小数，单位：元';
    }
    if(parsed.name.includes('数量')) return '0位小数';
  }
  
  return '-';
}

function getFieldStatus(fieldName, fieldType, hint) {
  if(fieldName === '创建人' || fieldName === '创建时间') return '只读';
  if(hint && hint.includes('关联带出')) return '只读';
  if(hint && hint.includes('公式')) return '只读';
  if(fieldType === '流水号') return '只读';
  return '普通';
}

function numberToChinese(num) {
  const chinese = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if(num <= 10) return chinese[num - 1];
  if(num < 20) return '十' + (num % 10 > 0 ? chinese[num % 10 - 1] : '');
  return num;
}
