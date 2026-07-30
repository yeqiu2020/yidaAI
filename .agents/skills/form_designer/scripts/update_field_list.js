/**
 * 表单字段清单更新器
 * 版本: 1.2.1
 * 更新日期: 2026-04-01
 *
 * 功能: 根据用户描述更新字段清单.md和表单清单.md
 * 用法: node update_field_list.js <项目目录> <表单名称> <表单类型> [描述] [选项]
 *
 * 示例:
 *   # 新增表单
 *   node update_field_list.js "./进销存管理" "库存预警" "流程表单" "包含预警类型、阈值等字段"
 *
 *   # 更新现有表单
 *   node update_field_list.js "./进销存管理" "库存盘点" --update "添加盘点类型字段"
 */

const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================

const FIELD_LIST_FILENAME = '字段清单.md';
const FORM_LIST_FILENAME = '表单清单.md';
const REQUIREMENTS_DIR = '01需求梳理';

// ==================== 路径处理函数 ====================

/**
 * 查找项目根目录
 * 规则：
 * 1. 如果传入的是 01需求梳理 目录，返回其父目录（即项目根目录）
 * 2. 如果传入的是业务分组目录（如 04客户管理），返回其父目录（即项目根目录）
 * 3. 项目根目录下应该有 01需求梳理 目录
 */
function findProjectRoot(startDir) {
  // 如果传入的是 01需求梳理 目录，返回其父目录
  if (path.basename(startDir) === REQUIREMENTS_DIR) {
    return path.dirname(startDir);
  }

  // 返回传入目录的父目录（假设传入的是业务分组目录，其父目录就是项目根目录）
  return path.dirname(startDir);
}

/**
 * 获取字段清单文件路径
 * 规则：
 * 1. 首先向上查找项目根目录（包含 01需求梳理 的目录）
 * 2. 字段清单.md 始终位于项目根目录的 01需求梳理 目录下
 */
function getFieldListPath(projectDir) {
  const projectRoot = findProjectRoot(projectDir);
  return path.join(projectRoot, REQUIREMENTS_DIR, FIELD_LIST_FILENAME);
}

/**
 * 获取项目根目录
 * 用于生成表单清单.md的路径
 */
function getProjectRoot(projectDir) {
  return findProjectRoot(projectDir);
}

// 字段类型映射（用户描述 -> 标准类型）
const FIELD_TYPE_MAP = {
  // 文本类
  '文本': '单行文本',
  '单行文本': '单行文本',
  '多行文本': '多行文本',
  '备注': '多行文本',
  '说明': '多行文本',

  // 数值类
  '数字': '数值',
  '数值': '数值',
  '金额': '数值',
  '数量': '数值',
  '价格': '数值',

  // 日期类
  '日期': '日期',
  '日期时间': '日期时间',
  '时间': '日期时间',

  // 选择类
  '单选': '单选',
  '复选': '复选',
  '多选': '复选',
  '下拉': '下拉单选',
  '下拉单选': '下拉单选',
  '下拉多选': '下拉复选',
  '下拉复选': '下拉复选',

  // 关联类
  '关联': '关联表单',
  '关联表单': '关联表单',

  // 人员类
  '成员': '成员',
  '人员': '成员',
  '负责人': '成员',
  '审批人': '成员',
  '处理人': '成员',
  '部门': '部门',

  // 附件类
  '附件': '附件',
  '文件': '附件',
  '图片': '图片',
  '照片': '图片',

  // 系统类
  '流水号': '流水号',
  '编号': '流水号',
  '单号': '流水号',
};

// 默认字段模板
const DEFAULT_FIELDS = {
  common: [
    { name: '创建人', type: '成员', desc: '系统自动生成', status: '只读', required: '否' },
    { name: '创建时间', type: '日期时间', desc: '系统自动生成', status: '只读', required: '否' },
  ],
  receipt: [
    { name: '编号', type: '流水号', desc: '系统自动生成', status: '普通', required: '否' },
  ],
  process: [
    { name: '单号', type: '流水号', desc: '系统自动生成', status: '普通', required: '否' },
  ],
};

// ==================== 工具函数 ====================

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    showHelp();
    process.exit(1);
  }

  const options = {
    projectDir: args[0],
    formName: args[1],
    formType: args[2],
    description: '',
    isUpdate: false,
    module: '',
    fields: null,
  };

  // 解析剩余参数和选项
  for (let i = 3; i < args.length; i++) {
    if (args[i] === '--update') {
      options.isUpdate = true;
    } else if (args[i] === '--module' && i + 1 < args.length) {
      options.module = args[i + 1];
      i++;
    } else if (args[i] === '--fields' && i + 1 < args.length) {
      try {
        options.fields = JSON.parse(args[i + 1]);
      } catch (e) {
        console.error('❌ --fields 参数必须是有效的JSON');
        process.exit(1);
      }
      i++;
    } else if (!args[i].startsWith('--')) {
      options.description += args[i] + ' ';
    }
  }

  options.description = options.description.trim();
  return options;
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
============================================================
  表单字段清单更新器
  版本: 1.0.0
============================================================

用法:
  node update_field_list.js <项目目录> <表单名称> <表单类型> [描述] [选项]

参数:
  <项目目录>    项目根目录路径
  <表单名称>    表单名称
  <表单类型>    普通表单 或 流程表单
  [描述]        字段描述（自然语言）

选项:
  --update      更新模式，修改现有表单
  --module      指定模块名称
  --fields      直接指定字段JSON

示例:
  # 新增表单
  node update_field_list.js "./进销存管理" "库存预警" "流程表单" "包含预警类型、阈值等字段"

  # 更新现有表单
  node update_field_list.js "./进销存管理" "库存盘点" --update "添加盘点类型字段"

============================================================
`);
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 读取字段清单
 * 逻辑：
 * 1. 字段清单.md 始终位于 01需求梳理 目录下
 * 2. 如果文件存在，直接读取并追加
 * 3. 如果文件不存在，创建新文件（兼容老应用同步场景）
 */
function readFieldList(projectDir) {
  const fieldListPath = getFieldListPath(projectDir);

  if (!fs.existsSync(fieldListPath)) {
    // 文件不存在，创建默认的字段清单
    const projectRoot = getProjectRoot(projectDir);
    const defaultContent = generateDefaultFieldList(projectRoot);
    ensureDir(path.dirname(fieldListPath));
    fs.writeFileSync(fieldListPath, defaultContent, 'utf-8');
    console.log(`  ✓ 创建新文件: ${fieldListPath}`);
    return { content: defaultContent, path: fieldListPath, forms: [] };
  }

  // 文件存在，直接读取（追加模式）
  const content = fs.readFileSync(fieldListPath, 'utf-8');
  const forms = parseFieldList(content);
  console.log(`  ✓ 读取现有文件: ${fieldListPath} (${forms.length} 个表单)`);
  return { content, path: fieldListPath, forms };
}

/**
 * 生成默认字段清单内容
 */
function generateDefaultFieldList(projectDir) {
  const projectName = path.basename(projectDir);
  const date = new Date().toLocaleDateString('zh-CN');

  return `# ${projectName} - 表单字段清单

> 版本: 1.0.0
> 生成日期: ${date}
> 更新说明: 初始版本

---

## 📋 字段清单使用说明

### 一、可用字段类型

单行文本、多行文本、数值、日期、日期时间、单选、复选、下拉单选、下拉复选、关联表单、成员、部门、附件、图片、流水号

### 二、字段说明格式规范

**只有以下4类字段需要填写字段说明，其他字段留空或填"-"**

| 字段类型 | 字段说明格式 | 示例 |
|---------|-------------|------|
| **流水号** | \`自动生成\` | 自动生成 |
| **关联表单** | \`关联-->目标表单名称\`（如有填充规则，用 \`；填充：当前字段=源字段\` 追加） | 关联-->产品信息；填充：规格型号=规格型号，单位=单位 |
| **数值** | \`X位小数，单位：XXX\` | 2位小数，单位：元 |
| **下拉单选/复选** | \`选项值1/选项值2/选项值3\` | 启用/停用 |

#### 补充说明

- **公式计算字段**：填写 \`公式计算\` 或 \`公式计算，计算逻辑\`，如：\`公式计算，数量×单价\`
- **被填充字段**：说明列填写自身属性（如"个/箱/公斤"或"2位小数，单位：元"），不再填写填充信息
- **无特殊说明**：填写 \`-\` 或留空

### 三、字段状态

| 状态值 | 说明 | 默认值 |
|-------|------|--------|
| **普通** | 字段可编辑输入（对应宜搭NORMAL） | 大部分字段默认为普通状态 |
| **只读** | 字段不可编辑，仅用于展示（对应宜搭READONLY） | 被填充字段、系统自动生成字段默认为只读状态 |
| **隐藏** | 字段在表单中不显示（对应宜搭HIDDEN） | 默认无隐藏字段，用户可根据需要设置 |

**字段状态自动判定规则**：
- **只读**：创建人、创建时间、被填充字段、公式计算字段
- **普通**：流水号、其他所有字段

**⚠️ 重要**：流水号字段状态统一为"普通"（不是"只读"），便于测试时手动输入编号

**⚠️ 重要说明**：宜搭流程表单会自动记录审批相关信息（审批人、审批时间、审批意见等），**不需要在表单字段中添加审批相关字段**

### 四、是否必填

- **是**：该字段为必填项
- **否**：该字段为选填项（默认）

**默认值规则**：
- 所有字段默认**非必填**（便于前期测试数据）
- 流水号字段**永不必填**（系统自动生成）
- 创建人、创建时间等系统字段**永不必填**

### 五、表单类型标识

- 「普通表单」：基础数据维护，无审批流程
- 「流程表单」：需要审批流程的业务单据

---

`;
}

/**
 * 解析字段清单，提取所有表单
 */
function parseFieldList(content) {
  const forms = [];
  const lines = content.split('\n');
  let currentForm = null;
  let inTable = false;
  let isSubTable = false;
  let subTableName = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // 匹配表单标题：### (一) 表单名称「类型」
    const formMatch = trimmed.match(/###\s*\(\S+\)\s*(.+?)「(.+?)」/);
    if (formMatch) {
      if (currentForm) {
        forms.push(currentForm);
      }
      currentForm = {
        name: formMatch[1].trim(),
        type: formMatch[2].trim(),
        fields: [],
        subTables: [],
      };
      inTable = false;
      isSubTable = false;
      continue;
    }

    // 检测子表标记
    const subTableMatch = trimmed.match(/\*\*子表[：:](.+?)\*\*/);
    if (subTableMatch && currentForm) {
      isSubTable = true;
      subTableName = subTableMatch[1].trim();
      currentForm.subTables.push({
        name: subTableName,
        fields: [],
      });
      inTable = false;
      continue;
    }

    // 检测表格开始
    if (trimmed.includes('| 字段名称') && trimmed.includes('| 字段类型')) {
      inTable = true;
      continue;
    }

    // 跳过表格分隔行
    if (trimmed.includes('---') && trimmed.includes('|')) continue;

    // 解析表格数据行
    if (inTable && trimmed.startsWith('|') && currentForm) {
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell);

      if (cells.length >= 5) {
        const field = {
          name: cells[0],
          type: cells[1],
          desc: cells[2],
          status: cells[3],
          required: cells[4],
        };

        if (isSubTable && currentForm.subTables.length > 0) {
          currentForm.subTables[currentForm.subTables.length - 1].fields.push(field);
        } else {
          currentForm.fields.push(field);
        }
      }
      continue;
    }

    // 空行表示表格结束
    if (inTable && trimmed === '') {
      inTable = false;
    }
  }

  if (currentForm) {
    forms.push(currentForm);
  }

  return forms;
}

/**
 * 读取表单清单
 */
function readFormList(projectDir) {
  // 表单清单始终在项目根目录
  const projectRoot = getProjectRoot(projectDir);
  const formListPath = path.join(projectRoot, FORM_LIST_FILENAME);

  if (!fs.existsSync(formListPath)) {
    // 创建默认的表单清单
    const defaultContent = generateDefaultFormList(projectRoot);
    fs.writeFileSync(formListPath, defaultContent, 'utf-8');
    console.log(`  ✓ 创建新文件: ${formListPath}`);
    return { content: defaultContent, path: formListPath, forms: [] };
  }

  const content = fs.readFileSync(formListPath, 'utf-8');
  const forms = parseFormList(content);
  return { content, path: formListPath, forms };
}

/**
 * 生成默认表单清单内容
 */
function generateDefaultFormList(projectDir) {
  const projectName = path.basename(projectDir);
  const date = new Date().toLocaleDateString('zh-CN');

  return `# ${projectName}

## 概览

- **系统名称**: ${projectName}
- **版本**: 1.0.0
- **表单总数**: 0 个

## 表单列表

| 序号 | 表单名称 | 表单类型 | 模块 | 文件路径 |
|------|----------|----------|------|----------|

---

生成时间: ${date}
`;
}

/**
 * 解析表单清单
 */
function parseFormList(content) {
  const forms = [];
  const lines = content.split('\n');
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测表格开始
    if (trimmed.includes('| 序号') && trimmed.includes('| 表单名称')) {
      inTable = true;
      continue;
    }

    // 跳过表格分隔行
    if (trimmed.includes('---') && trimmed.includes('|')) continue;

    // 解析表格数据行
    if (inTable && trimmed.startsWith('|')) {
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell);

      if (cells.length >= 4 && !isNaN(parseInt(cells[0]))) {
        forms.push({
          index: parseInt(cells[0]),
          name: cells[1],
          type: cells[2],
          module: cells[3],
          path: cells[4] || '',
        });
      }
      continue;
    }

    // 空行或分隔线表示表格结束
    if (inTable && (trimmed === '' || trimmed.startsWith('---'))) {
      inTable = false;
    }
  }

  return forms;
}

/**
 * 智能识别字段类型
 */
function detectFieldType(fieldName, context = '') {
  const lowerName = fieldName.toLowerCase();
  const lowerContext = context.toLowerCase();

  // 根据字段名称关键词判断
  if (lowerName.includes('编号') || lowerName.includes('单号') || lowerName.includes('code')) {
    return { type: '流水号', desc: '系统自动生成' };
  }

  if (lowerName.includes('日期') || lowerName.includes('时间')) {
    if (lowerName.includes('日期时间') || lowerName.includes('datetime')) {
      return { type: '日期时间', desc: '系统自动生成' };
    }
    return { type: '日期', desc: '-' };
  }

  if (lowerName.includes('金额') || lowerName.includes('价格') || lowerName.includes('总价')) {
    return { type: '数值', desc: '2位小数，单位：元' };
  }

  if (lowerName.includes('数量') || lowerName.includes('库存') || lowerName.includes('数量')) {
    return { type: '数值', desc: '0位小数' };
  }

  if (lowerName.includes('人') || lowerName.includes('员') || lowerName.includes('负责人') || lowerName.includes('审批人')) {
    return { type: '成员', desc: '-' };
  }

  if (lowerName.includes('部门')) {
    return { type: '部门', desc: '-' };
  }

  if (lowerName.includes('状态') || lowerName.includes('类型') || lowerName.includes('类别')) {
    return { type: '下拉单选', desc: '待确认/已完成' }; // 默认选项，用户可修改
  }

  if (lowerName.includes('备注') || lowerName.includes('说明') || lowerName.includes('描述')) {
    return { type: '多行文本', desc: '-' };
  }

  if (lowerName.includes('附件') || lowerName.includes('文件')) {
    return { type: '附件', desc: '-' };
  }

  if (lowerName.includes('图片') || lowerName.includes('照片')) {
    return { type: '图片', desc: '-' };
  }

  // 默认返回单行文本
  return { type: '单行文本', desc: '-' };
}

/**
 * 从描述中解析字段
 */
function parseFieldsFromDescription(description, formType) {
  const fields = [];

  // 添加默认字段
  if (formType === '普通表单') {
    fields.push({ name: '编号', type: '流水号', desc: '系统自动生成', status: '普通', required: '否' });
  } else {
    fields.push({ name: '单号', type: '流水号', desc: '系统自动生成', status: '普通', required: '否' });
  }

  // 解析描述中的字段
  // 支持格式："字段1、字段2、字段3" 或 "字段1，字段2，字段3"
  const fieldNames = description
    .split(/[,，、]/)
    .map((f) => f.trim())
    .filter((f) => f);

  for (const fieldName of fieldNames) {
    // 跳过系统字段（已经在默认字段中）
    if (fieldName.includes('编号') || fieldName.includes('单号')) continue;
    if (fieldName.includes('创建人') || fieldName.includes('创建时间')) continue;

    const detected = detectFieldType(fieldName, description);
    fields.push({
      name: fieldName,
      type: detected.type,
      desc: detected.desc,
      status: detected.type === '流水号' ? '普通' : '普通',
      required: '否',
    });
  }

  // 添加系统字段
  fields.push({ name: '创建人', type: '成员', desc: '系统自动生成', status: '只读', required: '否' });
  fields.push({ name: '创建时间', type: '日期时间', desc: '系统自动生成', status: '只读', required: '否' });

  return fields;
}

/**
 * 生成表单序号（中文数字）
 */
function getFormIndex(index) {
  const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
  if (index <= 20) {
    return chineseNumbers[index - 1];
  }
  return index;
}

/**
 * 生成字段清单表单内容
 */
function generateFormContent(formName, formType, fields, subTables = []) {
  let content = `### (${getFormIndex(fields.length > 0 ? 1 : 1)}) ${formName}「${formType}」\n\n`;

  // 主表字段表格
  content += '| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n';
  content += '|---------|---------|---------|---------|---------|\n';

  for (const field of fields) {
    content += `| ${field.name} | ${field.type} | ${field.desc} | ${field.status} | ${field.required} |\n`;
  }

  // 子表
  if (subTables && subTables.length > 0) {
    for (const subTable of subTables) {
      content += `\n**子表：${subTable.name}**\n\n`;
      content += '| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n';
      content += '|---------|---------|---------|---------|---------|\n';

      for (const field of subTable.fields) {
        content += `| ${field.name} | ${field.type} | ${field.desc} | ${field.status} | ${field.required} |\n`;
      }
    }
  }

  return content;
}

/**
 * 更新字段清单
 */
function updateFieldList(fieldListData, formName, formType, fields, subTables = [], isUpdate = false) {
  let { content, forms } = fieldListData;

  // 查找是否已存在该表单
  const existingIndex = forms.findIndex((f) => f.name === formName);

  if (isUpdate && existingIndex >= 0) {
    // 更新模式：替换现有表单
    const existingForm = forms[existingIndex];
    const oldContent = generateFormContent(existingForm.name, existingForm.type, existingForm.fields, existingForm.subTables);
    const newContent = generateFormContent(formName, formType, fields, subTables);
    content = content.replace(oldContent, newContent);
  } else {
    // 新增模式：在末尾添加
    const newContent = generateFormContent(formName, formType, fields, subTables);
    content = content.trim() + '\n\n' + newContent;
  }

  return content;
}

/**
 * 更新表单清单
 */
function updateFormList(formListData, formName, formType, module = '') {
  let { content, forms } = formListData;

  // 检查是否已存在
  const existingIndex = forms.findIndex((f) => f.name === formName);

  if (existingIndex >= 0) {
    // 更新现有条目
    const existing = forms[existingIndex];
    const oldLine = `| ${existing.index} | ${existing.name} | ${existing.type} | ${existing.module} | ${existing.path} |`;
    const newLine = `| ${existing.index} | ${formName} | ${formType} | ${module || existing.module} | ${existing.path} |`;
    content = content.replace(oldLine, newLine);
  } else {
    // 添加新条目
    const newIndex = forms.length > 0 ? Math.max(...forms.map((f) => f.index)) + 1 : 1;
    const moduleName = module || '';
    // 如果有模块名，使用模块目录；否则直接放在根目录
    const filePath = moduleName ? `${String(newIndex).padStart(2, '0')}${moduleName}/${formName}.json` : `${formName}.json`;
    const newLine = `| ${newIndex} | ${formName} | ${formType} | ${moduleName} | ${filePath} |\n`;

    // 在表格最后一行后插入
    const lines = content.split('\n');
    let insertIndex = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('|') && lines[i].includes('|') && !lines[i].includes('序号')) {
        insertIndex = i;
        break;
      }
    }

    if (insertIndex >= 0) {
      lines.splice(insertIndex + 1, 0, newLine.trim());
      content = lines.join('\n');
    }

    // 更新表单总数
    content = content.replace(/表单总数.*$/m, `表单总数: ${newIndex} 个`);
  }

  // 更新生成时间
  const date = new Date().toLocaleDateString('zh-CN');
  content = content.replace(/生成时间.*$/m, `生成时间: ${date}`);

  return content;
}

/**
 * 显示更新预览
 */
function showPreview(formName, formType, fields, subTables = []) {
  console.log('\n📋 更新预览');
  console.log('============================================================');
  console.log(`表单名称: ${formName}「${formType}」`);
  console.log(`主表字段: ${fields.length} 个`);

  if (subTables.length > 0) {
    console.log(`子表数量: ${subTables.length} 个`);
    for (const st of subTables) {
      console.log(`  - ${st.name}: ${st.fields.length} 个字段`);
    }
  }

  console.log('\n字段列表:');
  console.log('------------------------------------------------------------');
  console.log('| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |');
  console.log('|---------|---------|---------|---------|---------|');

  for (const field of fields) {
    console.log(`| ${field.name} | ${field.type} | ${field.desc} | ${field.status} | ${field.required} |`);
  }

  console.log('============================================================\n');
}

// ==================== 主流程 ====================

async function main() {
  const options = parseArgs();

  console.log('\n============================================================');
  console.log('表单字段清单更新器');
  console.log('版本: 1.2.1');
  console.log('============================================================');

  // 显示处理后的路径信息
  const fieldListPath = getFieldListPath(options.projectDir);
  const projectRoot = getProjectRoot(options.projectDir);

  console.log(`\n项目目录: ${options.projectDir}`);
  console.log(`字段清单路径: ${fieldListPath}`);
  console.log(`表单清单目录: ${projectRoot}`);
  console.log(`表单名称: ${options.formName}`);
  console.log(`表单类型: ${options.formType}`);
  console.log(`操作模式: ${options.isUpdate ? '更新' : '新增'}`);

  // 1. 读取字段清单
  console.log('\n[1/4] 读取字段清单...');
  const fieldListData = readFieldList(options.projectDir);
  console.log(`  ✓ 已读取: ${fieldListData.path}`);
  console.log(`  ✓ 现有表单: ${fieldListData.forms.length} 个`);

  // 2. 读取表单清单
  console.log('\n[2/4] 读取表单清单...');
  const formListData = readFormList(options.projectDir);
  console.log(`  ✓ 已读取: ${formListData.path}`);
  console.log(`  ✓ 现有条目: ${formListData.forms.length} 个`);

  // 3. 解析字段
  console.log('\n[3/4] 解析字段...');
  let fields = [];
  let subTables = [];

  if (options.fields) {
    // 使用直接指定的字段
    fields = options.fields;
  } else if (options.description) {
    // 从描述中解析字段
    fields = parseFieldsFromDescription(options.description, options.formType);
  } else if (options.isUpdate) {
    // 更新模式但没有指定字段，报错
    console.error('❌ 错误: 更新模式需要提供字段描述或 --fields 参数');
    process.exit(1);
  } else {
    // 新增模式但没有描述，使用默认字段
    fields = parseFieldsFromDescription('', options.formType);
  }

  console.log(`  ✓ 解析字段: ${fields.length} 个`);

  // 4. 更新字段清单
  console.log('\n[4/4] 更新文档...');

  // 更新字段清单
  const newFieldListContent = updateFieldList(
    fieldListData,
    options.formName,
    options.formType,
    fields,
    subTables,
    options.isUpdate
  );
  fs.writeFileSync(fieldListData.path, newFieldListContent, 'utf-8');
  console.log(`  ✓ 已更新: ${fieldListData.path}`);

  // 更新表单清单
  const newFormListContent = updateFormList(
    formListData,
    options.formName,
    options.formType,
    options.module
  );
  fs.writeFileSync(formListData.path, newFormListContent, 'utf-8');
  console.log(`  ✓ 已更新: ${formListData.path}`);

  // 5. 显示预览
  showPreview(options.formName, options.formType, fields, subTables);

  // 6. 输出结果
  console.log('[完成]');
  console.log('============================================================');
  console.log('\n📋 下一步操作:');
  console.log('  1. 查看更新后的字段清单，确认字段定义');
  console.log('  2. 如需修改，再次运行本命令');
  console.log('  3. 确认无误后，调用 form_creator 生成表单');
  console.log('\n示例:');
  console.log(`  node .agents/skills/form_creator/scripts/create_from_markdown.js "${path.join(options.projectDir, REQUIREMENTS_DIR, FIELD_LIST_FILENAME)}" "${path.basename(options.projectDir)}"`);
  console.log('\n============================================================\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ 执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}
