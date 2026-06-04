/**
 * 宜搭表单生成器 - 表格格式字段清单版本
 * 版本: 6.3.0
 * 更新日期: 2026-04-01
 * 更新说明:
 *   - 【重要修复】生成表单时同时创建三个标准文件：JSON、组件ID清单.md、表单结构变更.md
 *   - 【重要修复】当输出路径是已存在的目录时，采用扁平结构，直接将表单输出到该目录
 *     不再强制创建"02未分类"等模块子目录，避免用户指定路径后还多一层目录的问题
 *   - 支持表格格式字段清单（字段名称、字段类型、字段说明、字段状态、是否必填）
 *   - 支持字段状态（普通/只读/隐藏），映射到宜搭的behavior属性（NORMAL/READONLY/HIDDEN）
 *   - 支持是否必填配置，生成validation验证规则
 *   - 支持公式计算字段识别
 *   - 集成yida_field_templates.js v4.1.0，支持字段状态
 *
 * 功能: 读取Markdown字段表（表格格式），AI判断字段类型，生成宜搭表单JSON
 * 用法: node generate_from_markdown.js <markdown文件路径> [输出目录]
 * 示例:
 *   - 创建新项目: node generate_from_markdown.js "../../../项目字段表/出入库管理.md" "出入库管理"
 *   - 已有文件夹: node generate_from_markdown.js "../../../项目/出入库管理/流程及字段梳理/出入库管理.md" "../../../项目/出入库管理"
 */

const fs = require('fs');
const path = require('path');
const { FormGeneratorV2 } = require('./form_generator_v2');

/**
 * 解析表格行
 * @param {string} line - 表格行内容
 * @returns {Array} 单元格数组
 */
function parseTableRow(line) {
  if (!line || !line.includes('|')) return null;
  
  // 去掉首尾的|，然后分割
  const cells = line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
    .filter(cell => cell); // 过滤空单元格
  
  return cells.length >= 5 ? cells : null;
}

/**
 * 判断是否为表格分隔行（包含---）
 * @param {string} line - 行内容
 * @returns {boolean}
 */
function isTableSeparator(line) {
  return line && line.includes('|') && line.includes('---');
}

/**
 * 解析字段类型
 * @param {string} typeStr - 字段类型字符串
 * @param {string} description - 字段说明
 * @returns {Object} 字段类型配置
 */
function parseFieldType(typeStr, description) {
  const type = typeStr.trim();
  const desc = (description || '').trim();
  
  // 映射表格中的字段类型到宜搭字段类型
  const typeMap = {
    '单行文本': 'TextField',
    '多行文本': 'TextareaField',
    '数值': 'NumberField',
    '日期': 'DateField',
    '日期时间': 'DateField',
    '下拉单选': 'SelectField',
    '下拉多选': 'MultiSelectField',
    '关联表单': 'AssociationFormField',
    '成员': 'EmployeeField',
    '部门': 'DepartmentSelectField',
    '附件': 'AttachmentField',
    '图片': 'ImageField',
    '流水号': 'SerialNumberField'
  };
  
  const baseType = typeMap[type] || 'TextField';
  const config = { type: baseType };
  
  // 根据说明解析额外配置
  if (type === '数值') {
    // 解析小数位数和单位
    const decimalMatch = desc.match(/(\d+)位小数/);
    if (decimalMatch) {
      config.precision = parseInt(decimalMatch[1], 10);
    }
    const unitMatch = desc.match(/单位：(.+)/);
    if (unitMatch) {
      config.unit = unitMatch[1].trim();
    }
  }
  
  if (type === '日期时间') {
    config.showTime = true;
  }
  
  if (type === '关联表单') {
    // 解析关联表单名称
    const assocMatch = desc.match(/关联-->(.+)/);
    if (assocMatch) {
      config.associationForm = assocMatch[1].trim();
    }
  }
  
  if (type === '下拉单选' || type === '下拉多选') {
    // 解析选项值
    if (desc && desc !== '-' && !desc.includes('关联')) {
      config.options = desc.split(/[\/、]/).map(opt => opt.trim()).filter(opt => opt);
    }
  }
  
  // 检查是否为公式计算字段
  if (desc.includes('公式计算')) {
    config.isFormula = true;
    const formulaMatch = desc.match(/公式计算[，,]\s*(.+)/);
    if (formulaMatch) {
      config.formula = formulaMatch[1].trim();
    }
  }
  
  // 检查是否为关联带出
  if (desc.includes('关联带出')) {
    config.isAssociationOut = true;
  }
  
  return config;
}

/**
 * 解析字段状态
 * @param {string} statusStr - 字段状态字符串
 * @returns {string} 状态值
 */
function parseFieldStatus(statusStr) {
  const status = statusStr.trim();
  if (status === '只读') return 'readonly';
  if (status === '隐藏') return 'hidden';
  return 'editable'; // 默认普通（editable对应NORMAL）
}

/**
 * 解析是否必填
 * @param {string} requiredStr - 是否必填字符串
 * @returns {boolean}
 */
function parseRequired(requiredStr) {
  return requiredStr.trim() === '是';
}

/**
 * 解析Markdown内容（表格格式）
 * @param {string} content - Markdown文件内容
 * @returns {Object} 解析后的系统信息
 */
function parseMarkdown(content) {
  const lines = content.split('\n');
  
  let systemName = '';
  let version = '';
  let currentModule = '';
  let currentForm = null;
  let inTable = false;
  let isSubTable = false;
  let subTableName = '';
  
  const forms = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 解析系统名称
    if (line.startsWith('# ') && !systemName) {
      systemName = line.replace('# ', '').replace(/ - .+$/, '').trim();
      continue;
    }
    
    // 解析版本
    if (line.startsWith('> 版本:')) {
      version = line.replace('> 版本:', '').trim();
      continue;
    }
    
    // 匹配模块标题: ## 一、模块名称
    const moduleMatch = line.match(/^## [一二三四五六七八九十]+、(.+)$/);
    if (moduleMatch) {
      currentModule = moduleMatch[1];
      continue;
    }
    
    // 匹配表单标题: ### (一) 表单名称「表单类型」
    const formMatch = line.match(/### \(\S+\)\s*(.+?)「(.+?)」/);
    if (formMatch) {
      if (currentForm) {
        forms.push(currentForm);
      }
      currentForm = {
        module: currentModule,
        name: formMatch[1].trim(),
        type: formMatch[2].trim(), // 普通表单 或 流程表单
        fields: [],
        subTables: []
      };
      isSubTable = false;
      continue;
    }
    
    // 检测子表标记: **子表：子表名称**
    const subTableHeaderMatch = line.match(/\*\*子表[：:](.+?)\*\*/);
    if (subTableHeaderMatch && currentForm) {
      isSubTable = true;
      subTableName = subTableHeaderMatch[1].trim();
      currentForm.subTables.push({
        name: subTableName,
        fields: []
      });
      continue;
    }
    
    // 检测表格开始（包含字段名称、字段类型等表头）
    if (line.includes('| 字段名称') && line.includes('| 字段类型')) {
      inTable = true;
      continue;
    }
    
    // 跳过表格分隔行
    if (isTableSeparator(line)) {
      continue;
    }
    
    // 解析表格数据行
    if (inTable && line.startsWith('|') && currentForm) {
      const cells = parseTableRow(line);
      if (cells && cells.length >= 5) {
        const [fieldName, fieldType, description, fieldStatus, required] = cells;
        
        const fieldConfig = {
          label: fieldName.trim(),
          ...parseFieldType(fieldType, description),
          status: parseFieldStatus(fieldStatus),
          required: parseRequired(required),
          description: description.trim()
        };
        
        if (isSubTable && currentForm.subTables.length > 0) {
          // 添加到子表
          currentForm.subTables[currentForm.subTables.length - 1].fields.push(fieldConfig);
        } else {
          // 添加到主表
          currentForm.fields.push(fieldConfig);
        }
      }
      continue;
    }
    
    // 空行表示表格结束
    if (inTable && line === '') {
      inTable = false;
    }
  }
  
  // 添加最后一个表单
  if (currentForm) {
    forms.push(currentForm);
  }
  
  return {
    name: systemName,
    version: version,
    forms: forms
  };
}

/**
 * 转换表单配置
 * @param {Object} form - 解析后的表单
 * @returns {Object} 表单配置
 */
function convertFormToConfig(form) {
  // 处理主表字段
  const fields = form.fields.map(field => ({
    label: field.label,
    type: field.type,
    required: field.required,
    status: field.status,
    precision: field.precision,
    unit: field.unit,
    associationForm: field.associationForm,
    options: field.options,
    isFormula: field.isFormula,
    formula: field.formula,
    isAssociationOut: field.isAssociationOut,
    description: field.description
  }));

  // 处理子表 - 转换为 TableField 格式
  if (form.subTables && form.subTables.length > 0) {
    for (const subTable of form.subTables) {
      fields.push({
        type: 'TableField',
        label: subTable.name,
        columns: subTable.fields.map(col => ({
          label: col.label,
          type: col.type,
          required: col.required,
          status: col.status,
          precision: col.precision,
          unit: col.unit,
          associationForm: col.associationForm,
          options: col.options,
          isFormula: col.isFormula,
          formula: col.formula,
          isAssociationOut: col.isAssociationOut,
          description: col.description
        }))
      });
    }
  }

  return {
    formName: form.name,
    formType: form.type, // 普通表单 或 流程表单
    module: form.module,
    fields: fields
  };
}

/**
 * 模块名称到编号的映射
 * 从02开始编号（01留给需求梳理）
 */
const moduleNumberMap = new Map();
let moduleCounter = 2; // 从02开始

/**
 * 获取模块编号
 * @param {string} moduleName - 模块名称
 * @returns {string} 带编号的模块名称
 */
function getModuleNumberedName(moduleName) {
  if (!moduleNumberMap.has(moduleName)) {
    const number = String(moduleCounter).padStart(2, '0');
    moduleNumberMap.set(moduleName, `${number}${moduleName}`);
    moduleCounter++;
  }
  return moduleNumberMap.get(moduleName);
}

/**
 * 生成项目
 * @param {string} markdownPath - Markdown文件路径
 * @param {string} outputPath - 输出目录或项目名称
 */
async function generateProject(markdownPath, outputPath) {
  console.log('\n============================================================');
  console.log('宜搭表单生成器 - 表格格式字段清单版本');
  console.log('版本: 6.1.0');
  console.log('============================================================\n');

  // 1. 读取Markdown
  console.log('[1/4] 读取Markdown文件...');
  const fullPath = path.resolve(markdownPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`错误: 文件不存在 ${fullPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  console.log('  ✓ 文件读取成功\n');

  // 2. 解析Markdown
  console.log('[2/4] 解析Markdown内容...');
  const systemInfo = parseMarkdown(content);
  console.log(`  ✓ 系统名称: ${systemInfo.name}`);
  console.log(`  ✓ 版本: ${systemInfo.version}`);
  console.log(`  ✓ 解析到 ${systemInfo.forms.length} 个表单`);

  // 显示解析结果
  systemInfo.forms.forEach(form => {
    const subTableCount = form.subTables ? form.subTables.length : 0;
    console.log(`    - ${form.name}「${form.type}」(${form.fields.length}个主表字段${subTableCount > 0 ? `, ${subTableCount}个子表` : ''})`);
  });
  console.log();

  // 3. 转换配置
  console.log('[3/4] 转换字段配置...');
  const configs = systemInfo.forms.map(convertFormToConfig);

  // 显示转换结果
  configs.forEach(config => {
    console.log(`\n  【${config.formName}】${config.formType}`);
    console.log('  主表字段:');
    config.fields.forEach(field => {
      if (field.type === 'TableField') {
        console.log(`    - ${field.label}: ${field.type} (${field.columns.length}列)`);
      } else {
        const extra = field.associationForm ? `->${field.associationForm}` :
                      field.unit ? `[单位:${field.unit}]` :
                      field.precision !== undefined ? `[${field.precision}位小数]` :
                      field.isFormula ? '[公式]' :
                      field.isAssociationOut ? '[关联带出]' : '';
        const status = field.status === 'readonly' ? '[只读]' : field.status === 'hidden' ? '[隐藏]' : '';
        const required = field.required ? '[必填]' : '';
        console.log(`    - ${field.label}: ${field.type}${extra}${status}${required}`);
      }
    });
  });
  console.log();

  // 4. 生成项目
  console.log('[4/4] 生成项目...\n');

  // 判断输出路径是已有目录还是项目名称
  const resolvedOutputPath = path.resolve(outputPath);
  const isExistingDir = fs.existsSync(resolvedOutputPath) && fs.statSync(resolvedOutputPath).isDirectory();
  
  let projectPath;
  let useFlatStructure = false; // 是否使用扁平结构（不创建模块目录）
  
  if (isExistingDir) {
    // 使用已有目录 - 直接将表单输出到该目录，不创建模块子目录
    projectPath = resolvedOutputPath;
    useFlatStructure = true;
    console.log(`[信息] 使用已有目录: ${projectPath}`);
    console.log(`[信息] 采用扁平结构，表单直接输出到当前目录\n`);
  } else {
    // 创建新项目目录
    projectPath = path.join(__dirname, '..', '..', '..', '..', '项目', outputPath);
    console.log(`[信息] 创建新项目: ${outputPath}\n`);
  }

  // 只有在新项目模式下才创建模块目录
  if (!useFlatStructure) {
    // 创建模块目录（带编号）
    const modules = [...new Set(configs.map(f => f.module || '未分类'))];
    for (const module of modules) {
      const numberedModuleName = getModuleNumberedName(module);
      const modulePath = path.join(projectPath, numberedModuleName);
      if (!fs.existsSync(modulePath)) {
        fs.mkdirSync(modulePath, { recursive: true });
        console.log(`  [创建] 模块目录: ${numberedModuleName}/`);
      }
    }
    console.log();
  }

  // 生成所有表单
  const generator = new FormGeneratorV2();
  const generatedForms = [];

  for (const config of configs) {
    console.log(`[生成] ${config.formName}`);
    const formJson = generator.generate(config);
    
    // 每个表单创建独立文件夹，包含表单类型标注
    const formFolderName = `${config.formName}「${config.formType}」`;
    
    let formFolderPath;
    if (useFlatStructure) {
      // 扁平结构：表单直接放在指定目录下
      formFolderPath = path.join(projectPath, formFolderName);
    } else {
      // 模块结构：表单放在模块子目录下
      const module = config.module || '未分类';
      const numberedModuleName = getModuleNumberedName(module);
      formFolderPath = path.join(projectPath, numberedModuleName, formFolderName);
    }
    
    if (!fs.existsSync(formFolderPath)) {
      fs.mkdirSync(formFolderPath, { recursive: true });
    }
    
    const outputFile = path.join(formFolderPath, `${config.formName}「${config.formType}」.json`);
    
    generator.saveToFile(formJson, outputFile);

    // 生成组件ID清单.md
    generateComponentIdList(formFolderPath, config, formJson);

    // 生成表单结构变更.md
    generateFormChangeLog(formFolderPath, config);

    generatedForms.push({
      formName: config.formName,
      formType: config.formType,
      module: config.module || '-',
      numberedModule: useFlatStructure ? '-' : (config.module || '未分类'),
      outputPath: outputFile
    });
  }

  // 生成项目文档
  generateProjectDocs(projectPath, generatedForms, systemInfo);

  console.log('\n============================================================');
  console.log('[项目生成完成]');
  console.log('============================================================');
  console.log(`\n位置: ${projectPath}`);
  console.log('\n生成文件:');
  generatedForms.forEach(form => {
    if (useFlatStructure) {
      console.log(`  ✓ ${form.formName}「${form.formType}」/${form.formName}「${form.formType}」.json`);
    } else {
      console.log(`  ✓ ${form.numberedModule}/${form.formName}「${form.formType}」/${form.formName}「${form.formType}」.json`);
    }
  });
  console.log('\n============================================================\n');
}

/**
 * 生成项目文档
 * @param {string} projectPath - 项目路径
 * @param {Array} forms - 生成的表单列表
 * @param {Object} systemInfo - 系统信息
 */
function generateProjectDocs(projectPath, forms, systemInfo) {
  // 生成表单清单
  const formListContent = `# ${systemInfo.name || '表单清单'}

## 概览

- **系统名称**: ${systemInfo.name || '-'}
- **版本**: ${systemInfo.version || '-'}
- **表单总数**: ${forms.length} 个

## 表单列表

| 序号 | 表单名称 | 表单类型 | 模块 | 文件路径 |
|------|----------|----------|------|----------|
${forms.map((form, index) => `| ${index + 1} | ${form.formName} | ${form.formType} | ${form.module} | ${form.numberedModule}/${form.formName}.json |`).join('\n')}

---

生成时间: ${new Date().toLocaleString('zh-CN')}
`;

  fs.writeFileSync(path.join(projectPath, '表单清单.md'), formListContent, 'utf-8');
  console.log('\n[文档] 生成 表单清单.md');
}

/**
 * 生成组件ID清单
 * @param {string} formFolderPath - 表单文件夹路径
 * @param {Object} config - 表单配置
 * @param {Object} formJson - 表单JSON
 */
function generateComponentIdList(formFolderPath, config, formJson) {
  // 提取字段信息
  const fields = [];
  if (formJson.componentsTree && Array.isArray(formJson.componentsTree)) {
    formJson.componentsTree.forEach((component, index) => {
      if (component.props && component.props.fieldId) {
        fields.push({
          index: index + 1,
          componentType: component.componentName,
          // Button 组件使用 content 代替 label 存储显示文本
          fieldName: component.props.label?.zh_CN || component.props.content?.zh_CN || component.props.content || '-',
          fieldId: component.props.fieldId
        });
      }
    });
  }

  const content = `# ${config.formName} - 组件ID清单

## 📋 组件列表

| 序号 | 组件类型 | 字段名称 | 组件ID (fieldId) |
|:---:|---------|---------|-----------------|
${fields.map(f => `| ${f.index} | ${f.componentType} | ${f.fieldName} | ${f.fieldId} |`).join('\n')}

## 📊 统计信息

| 统计项 | 数量 |
|--------|------|
| 组件总数 | ${fields.length} |

---

生成时间: ${new Date().toLocaleString('zh-CN')}
`;

  fs.writeFileSync(path.join(formFolderPath, '组件ID清单.md'), content, 'utf-8');
  console.log('  [文档] 生成 组件ID清单.md');
}

/**
 * 生成表单结构变更记录
 * @param {string} formFolderPath - 表单文件夹路径
 * @param {Object} config - 表单配置
 */
function generateFormChangeLog(formFolderPath, config) {
  const content = `# ${config.formName} - 表单结构变更记录

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|-----|------|---------|-------|
| 1.0.0 | ${new Date().toLocaleDateString('zh-CN')} | 表单创建 | 系统自动 |

---

生成时间: ${new Date().toLocaleString('zh-CN')}
`;

  fs.writeFileSync(path.join(formFolderPath, '表单结构变更.md'), content, 'utf-8');
  console.log('  [文档] 生成 表单结构变更.md');
}

// 主函数
function main() {
  const markdownPath = process.argv[2];
  const outputPath = process.argv[3] || '未命名项目';

  if (!markdownPath) {
    console.log('用法: node generate_from_markdown.js <markdown文件路径> [输出目录或项目名称]');
    console.log('示例:');
    console.log('  - 创建新项目: node generate_from_markdown.js "../../../项目字段表/出入库管理.md" "出入库管理"');
    console.log('  - 已有文件夹: node generate_from_markdown.js "../../../项目/出入库管理/流程及字段梳理/出入库管理.md" "../../../项目/出入库管理"');
    process.exit(1);
  }

  generateProject(markdownPath, outputPath).catch(err => {
    console.error('生成失败:', err);
    process.exit(1);
  });
}

main();
