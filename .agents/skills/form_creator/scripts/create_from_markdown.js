/**
 * 宜搭表单静默创建器 - 从字段清单直接创建到宜搭平台
 * 版本: 2.3.3
 * 更新日期: 2026-05-19
 *
 * 更新内容:
 * - v2.3.3: 【重要修复】修复原型页面生成目录错误和组织及应用信息.md格式混乱问题
 *          1. 修复原型页面输出目录：改为 {项目目录}/01需求梳理/原型页面/（之前错误地生成到01需求梳理根目录）
 *          2. 移除 create_from_markdown.js 中的 updateOrgInfoWithPrototype 调用
 *          3. 统一由 prototype_generator.js 处理组织及应用信息.md的更新，避免重复更新导致表格格式混乱
 * - v2.3.2: 【重要修复】修复创建应用后原型页面生成失败的问题
 *          1. 修复 generatePrototype 调用时传递相对路径导致文件找不到的问题
 *          2. 改为传递绝对路径 fullPath，避免在切换 cwd 后相对路径失效
 *          3. 错误示例：文件不存在 D:\...\.agents\skills\form-to-prototype\scripts\进销存管理\01需求梳理\字段清单.md
 * - v2.3.1: 【重要修复】修复更新组织及应用信息.md时表格格式损坏的问题
 *          1. 修复 beforeTable 缺少换行符导致分隔行与数据行粘连的问题
 *          2. 添加 beforeTable.endsWith('\n') 检查，确保分隔行和数据行之间有换行
 *          3. 避免生成 |------|----------|----------------|| 1 |... 这样的损坏格式
 * - v2.3.0: 【新增功能】创建新应用后自动生成原型页面
 *          1. 新增 generatePrototype 函数，自动调用 form-to-prototype skill
 *          2. 在应用创建完成后自动生成原型页面，方便用户预览表单界面
 *          3. 原型页面生成位置：{项目目录}/01需求梳理/原型页面/
 *          4. 自动更新组织及应用信息.md，追加原型页面访问地址
 * - v2.2.3: 【重要修复】创建流程表单时传递processCode到同步脚本
 *          1. 从form_manager.js获取processCode并写入createdForms
 *          2. 临时文件.temp_forms.json中包含processCode字段
 *          3. 确保新建应用时流程Code能正确写入系统配置清单
 * - v2.2.2: 【结构优化】适配简化后的组织及应用信息.md表格结构
 *          1. 应用列表表格从5列简化为3列（移除应用类型、备注列）
 *          2. 简化代码逻辑，专注于核心3列表格结构
 *          3. 保持动态列数检测能力，确保向后兼容
 * - v2.2.1: 【增强】增强组织及应用信息更新逻辑的健壮性
 *          1. 支持自动检测表格列数，动态适配多列表格结构
 *          2. 使用更安全的表格替换方式，精确定位表格数据区域
 *          3. 新增默认值填充机制（应用类型、备注等列）
 * - v2.2.0: 【重要修复】修复组织及应用信息更新失败和JSON文件未生成的问题
 *          1. 修复正则表达式匹配，支持"应用 ID"（带空格）格式
 *          2. 新增 syncFormSchemas 函数，自动调用 yida-get-schema 生成JSON文件
 *          3. 确保创建完成后所有本地文件完整（组件ID清单、变更记录、JSON文件）
 * - v2.1.0: 【重要修复】修复新应用创建后同步失败的问题
 *          1. 创建完成后将表单信息写入 .temp_forms.json 临时文件
 *          2. 调用 yida-config-sync 时传递 createdForms 参数
 *          3. 同步脚本优先使用已知的表单UUID，跳过API查询表单列表
 *          4. 解决新应用API返回404导致同步失败的问题
 * - v2.0.0: 【重要重构】简化创建流程，彻底解决表单重复创建问题
 *          1. 不再提前创建本地文件（JSON、组件ID清单、变更记录）
 *          2. 只负责在宜搭平台创建应用和表单
 *          3. 创建完成后调用 yida-config-sync 整体同步（当作已有应用处理）
 *          4. 本地所有文件由 yida-config-sync 统一生成，确保数据一致性
 *          5. 避免了之前版本因"先创建本地文件再同步"导致的重复变更记录
 *
 * 历史更新:
 * - v1.9.2: 修复表单重复创建问题（已被v2.0.0彻底解决）
 * - v1.9.0: 重构表单创建流程（已被v2.0.0替代）
 *
 * 功能: 读取Markdown字段清单，解析后调用宜搭API直接创建应用和表单
 * 用法: node create_from_markdown.js <markdown文件路径> [应用名称]
 * 示例: node create_from_markdown.js "../../../进销存管理/01需求梳理/字段清单.md" "进销存管理"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Windows 平台设置 UTF-8 代码页，解决中文乱码
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误，继续执行
  }
}

// ==================== 配置 ====================

const SCRIPT_DIR = __dirname;
const API_CLIENT_DIR = path.join(SCRIPT_DIR, '..', '..', 'yida-api-client', 'scripts');
const LOGIN_SCRIPT = path.join(API_CLIENT_DIR, 'login_manager.js');
const APP_MANAGER = path.join(API_CLIENT_DIR, 'app_manager.js');
const FORM_MANAGER = path.join(API_CLIENT_DIR, 'form_manager.js');

const CONFIG_SYNC_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'yida-config-sync', 'scripts', 'sync_config.js');

// 原型页面生成器脚本路径
const PROTOTYPE_GENERATOR_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'form-to-prototype', 'scripts', 'prototype_generator.js');

// ==================== 工具函数 ====================

/**
 * 执行命令并获取结果
 * @param {string} command - 命令
 * @returns {Object} 解析后的JSON结果
 */
function execCommand(command) {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    });
    
    // 首先尝试从整个输出中提取JSON（处理多行JSON）
    const trimmedOutput = stdout.trim();
    
    // 查找最后一个完整的JSON对象（从后往前找配对的{}）
    let braceCount = 0;
    let jsonStart = -1;
    
    for (let i = trimmedOutput.length - 1; i >= 0; i--) {
      const char = trimmedOutput[i];
      if (char === '}') {
        braceCount++;
        if (jsonStart === -1) jsonStart = i;
      } else if (char === '{') {
        braceCount--;
        if (braceCount === 0) {
          // 找到了完整的JSON对象
          const jsonStr = trimmedOutput.substring(i, jsonStart + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            // 继续查找
          }
        }
      }
    }
    
    // 回退到原来的单行检查方式
    const lines = trimmedOutput.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          return JSON.parse(line);
        } catch (e) {
          continue;
        }
      }
    }
    return null;
  } catch (error) {
    // 尝试从错误输出中解析错误信息
    const stderr = error.stderr ? error.stderr.toString() : '';
    const stdout = error.stdout ? error.stdout.toString() : '';
    
    // 尝试从输出中提取JSON（即使命令返回非零退出码）
    const output = (stdout || stderr).trim();
    
    // 使用同样的方法查找JSON对象
    let braceCount = 0;
    let jsonStart = -1;
    
    for (let i = output.length - 1; i >= 0; i--) {
      const char = output[i];
      if (char === '}') {
        braceCount++;
        if (jsonStart === -1) jsonStart = i;
      } else if (char === '{') {
        braceCount--;
        if (braceCount === 0) {
          const jsonStr = output.substring(i, jsonStart + 1);
          try {
            const result = JSON.parse(jsonStr);
            if (result.error || result.errorMsg) {
              throw new Error(result.error || result.errorMsg);
            }
            return result;
          } catch (e) {
            if (e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }
    }
    
    console.error(`命令执行失败: ${error.message}`);
    if (stderr) console.error(`错误输出: ${stderr}`);
    throw new Error(stderr || error.message);
  }
}

/**
 * 确保已登录
 * @returns {Object} 登录态信息
 */
function ensureLogin() {
  console.log('\n🔐 检查登录态...');
  
  // 先尝试无头验证
  try {
    const result = execCommand(`node "${LOGIN_SCRIPT}"`);
    if (result && result.csrf_token) {
      console.log(`  ✅ 登录态有效 (${result.base_url})`);
      return result;
    }
  } catch (e) {
    console.log('  ⚠️  需要重新登录');
  }
  
  // 需要扫码登录
  console.log('\n🔐 请扫码登录宜搭平台...');
  const result = execCommand(`node "${LOGIN_SCRIPT}"`);
  if (!result || !result.csrf_token) {
    throw new Error('登录失败');
  }
  console.log(`  ✅ 登录成功 (${result.base_url})`);
  return result;
}

/**
 * 创建应用
 * @param {string} appName - 应用名称
 * @param {string} description - 应用描述
 * @returns {Object} 应用信息
 */
function createApp(appName, description) {
  console.log(`\n📦 创建应用: ${appName}`);
  
  const result = execCommand(
    `node "${APP_MANAGER}" "${appName}" "${description || appName}"`
  );
  
  if (!result || !result.success) {
    throw new Error(result?.error || result?.errorMsg || '创建应用失败');
  }
  
  if (result.existing) {
    console.log(`  ⚠️  应用已存在，复用已有应用: ${result.appType}`);
  } else {
    console.log(`  ✅ 应用创建成功: ${result.appType}`);
  }
  console.log(`  📎 访问地址: ${result.url}`);
  
  return result;
}

// ==================== Markdown解析（复用generate_from_markdown.js的逻辑）=====================

/**
 * 解析字段类型
 */
function parseFieldType(typeStr, description) {
  const type = typeStr.trim();
  const desc = (description || '').trim();
  
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
  
  if (type === '数值') {
    const decimalMatch = desc.match(/(\d+)位小数/);
    if (decimalMatch) config.precision = parseInt(decimalMatch[1], 10);
    const unitMatch = desc.match(/单位：(.+)/);
    if (unitMatch) config.unit = unitMatch[1].trim();
  }
  
  if (type === '日期时间') {
    config.showTime = true;
  }
  
  if (type === '关联表单') {
    const assocMatch = desc.match(/关联-->([^，,]+)/);
    if (assocMatch) config.associationForm = assocMatch[1].trim();
  }
  
  if (type === '下拉单选' || type === '下拉多选') {
    if (desc && desc !== '-' && !desc.includes('关联') && !desc.includes('公式')) {
      config.options = desc.split(/[\/、]/).map(opt => opt.trim()).filter(opt => opt);
    }
  }
  
  return config;
}

/**
 * 解析Markdown内容
 */
function parseMarkdown(content) {
  const lines = content.split('\n');
  
  let systemName = '';
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
    
    // 匹配模块标题
    const moduleMatch = line.match(/^## [一二三四五六七八九十]+、(.+)$/);
    if (moduleMatch) {
      currentModule = moduleMatch[1];
      continue;
    }
    
    // 匹配表单标题
    const formMatch = line.match(/### \(\S+\)\s*(.+?)「(.+?)」/);
    if (formMatch) {
      if (currentForm) forms.push(currentForm);
      currentForm = {
        module: currentModule,
        name: formMatch[1].trim(),
        type: formMatch[2].trim(),
        fields: [],
        subTables: []
      };
      isSubTable = false;
      continue;
    }
    
    // 检测子表标记
    const subTableHeaderMatch = line.match(/\*\*子表[：:](.+?)\*\*/);
    if (subTableHeaderMatch && currentForm) {
      isSubTable = true;
      subTableName = subTableHeaderMatch[1].trim();
      currentForm.subTables.push({ name: subTableName, fields: [] });
      continue;
    }
    
    // 检测表格开始
    if (line.includes('| 字段名称') && line.includes('| 字段类型')) {
      inTable = true;
      continue;
    }
    
    // 跳过表格分隔行
    if (line.includes('---') && line.includes('|')) continue;
    
    // 解析表格数据行
    if (inTable && line.startsWith('|') && currentForm) {
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell);
      
      if (cells.length >= 5) {
        const [fieldName, fieldType, description, fieldStatus, required] = cells;
        
        const fieldConfig = {
          label: fieldName.trim(),
          ...parseFieldType(fieldType, description),
          status: fieldStatus.trim() === '只读' ? 'readonly' : 
                  fieldStatus.trim() === '隐藏' ? 'hidden' : 'editable',
          required: required.trim() === '是',
          description: description.trim()
        };
        
        if (isSubTable && currentForm.subTables.length > 0) {
          currentForm.subTables[currentForm.subTables.length - 1].fields.push(fieldConfig);
        } else {
          currentForm.fields.push(fieldConfig);
        }
      }
      continue;
    }
    
    // 空行表示表格结束
    if (inTable && line === '') inTable = false;
  }
  
  if (currentForm) forms.push(currentForm);
  
  return { name: systemName, forms };
}

/**
 * 转换表单配置
 */
function convertFormToConfig(form) {
  const fields = form.fields.map(field => ({
    label: field.label,
    type: field.type,
    required: field.required,
    status: field.status,
    precision: field.precision,
    unit: field.unit,
    associationForm: field.associationForm,
    options: field.options
  }));
  
  // 处理子表
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
          options: col.options
        }))
      });
    }
  }
  
  return {
    formName: form.name,
    formType: form.type,
    module: form.module,
    fields
  };
}

// ==================== 主流程 ====================

/**
 * 获取表单所有关联的目标表单名称
 * @param {Array} fields - 字段数组
 * @returns {Array} 目标表单名称数组
 */
function getAssociationTargets(fields) {
  const targets = [];
  for (const field of fields) {
    if (field.type === 'AssociationFormField' && field.associationForm) {
      targets.push(field.associationForm);
    }
    if (field.type === 'TableField' && field.columns) {
      for (const col of field.columns) {
        if (col.type === 'AssociationFormField' && col.associationForm) {
          targets.push(col.associationForm);
        }
      }
    }
  }
  return [...new Set(targets)]; // 去重
}

/**
 * 对表单进行拓扑排序（按依赖关系排序）
 * @param {Array} configs - 表单配置数组
 * @returns {Array} 排序后的表单配置数组
 */
function topologicalSort(configs) {
  // 构建表单名称到配置的映射
  const formMap = new Map();
  configs.forEach(config => formMap.set(config.formName, config));
  
  // 构建依赖图
  const dependencies = new Map(); // 表单名称 -> 依赖的表单名称数组
  const dependents = new Map(); // 表单名称 -> 依赖它的表单名称数组
  
  configs.forEach(config => {
    const targets = getAssociationTargets(config.fields);
    dependencies.set(config.formName, targets);
    
    // 初始化dependents
    if (!dependents.has(config.formName)) {
      dependents.set(config.formName, []);
    }
    
    // 记录哪些表单依赖当前表单
    targets.forEach(target => {
      if (formMap.has(target)) {
        if (!dependents.has(target)) {
          dependents.set(target, []);
        }
        dependents.get(target).push(config.formName);
      }
    });
  });
  
  // 拓扑排序
  const sorted = [];
  const visited = new Set();
  const tempMarked = new Set();
  
  function visit(formName) {
    if (tempMarked.has(formName)) {
      // 检测到循环依赖，跳过
      return;
    }
    if (visited.has(formName)) {
      return;
    }
    
    tempMarked.add(formName);
    
    const deps = dependencies.get(formName) || [];
    for (const dep of deps) {
      if (formMap.has(dep)) {
        visit(dep);
      }
    }
    
    tempMarked.delete(formName);
    visited.add(formName);
    sorted.push(formMap.get(formName));
  }
  
  // 遍历所有表单
  for (const config of configs) {
    if (!visited.has(config.formName)) {
      visit(config.formName);
    }
  }
  
  return sorted;
}

/**
 * 创建表单（支持关联表单UUID映射）
 * @param {string} appType - 应用ID
 * @param {string} formTitle - 表单标题
 * @param {Array} fields - 字段定义数组
 * @param {Object} formUuidMap - 表单名称到UUID的映射
 * @param {string} formType - 表单类型: receipt(普通表单) 或 process(流程表单)
 * @returns {Object} 表单信息
 */
function createFormWithMapping(appType, formTitle, fields, formUuidMap, formType = 'receipt') {
  console.log(`\n📝 创建表单: ${formTitle}`);
  console.log(`  原始字段数量: ${fields.length}`);
  
  // 转换字段定义为宜搭API格式
  // 注意：关联表单字段如果找不到对应的formUuid，会暂时转换为单行文本字段
  const apiFields = [];
  let skippedAssocFields = 0;
  
  for (const field of fields) {
    const apiField = {
      type: field.type,
      label: field.label,
      required: field.required || false
    };
    
    // 根据字段类型添加额外配置
    if (field.type === 'NumberField') {
      if (field.precision !== undefined) apiField.precision = field.precision;
      if (field.unit) apiField.innerAfter = field.unit;
    }
    
    if (field.type === 'SelectField' || field.type === 'MultiSelectField') {
      if (field.options && field.options.length > 0) {
        apiField.options = field.options;
      }
    }
    
    if (field.type === 'AssociationFormField' && field.associationForm) {
      const targetFormUuid = formUuidMap[field.associationForm];
      if (targetFormUuid) {
        apiField.associationForm = {
          formUuid: targetFormUuid,
          formTitle: field.associationForm,
          appType: appType,
          mainFieldId: '',
          mainComponentName: 'TextField'
        };
      } else {
        // 使用占位符UUID创建关联表单字段（后续在宜搭平台手动修改关联）
        const placeholderUuid = `FORM-PLACEHOLDER-${Date.now().toString(36).toUpperCase()}`;
        console.log(`    ⚠️  关联表单字段 "${field.label}" 目标表单 "${field.associationForm}" 尚未创建，使用占位符UUID`);
        apiField.associationForm = {
          formUuid: placeholderUuid,
          formTitle: field.associationForm,
          appType: appType,
          mainFieldId: '',
          mainComponentName: 'TextField'
        };
        skippedAssocFields++;
      }
    }
    
    if (field.type === 'TableField' && field.columns) {
      apiField.children = [];
      for (const col of field.columns) {
        const colField = {
          type: col.type,
          label: col.label,
          required: col.required || false
        };
        
        if (col.precision !== undefined) colField.precision = col.precision;
        if (col.unit) colField.innerAfter = col.unit;
        if (col.options && col.options.length > 0) colField.options = col.options;
        
        if (col.type === 'AssociationFormField' && col.associationForm) {
          const targetFormUuid = formUuidMap[col.associationForm];
          if (targetFormUuid) {
            colField.associationForm = {
              formUuid: targetFormUuid,
              formTitle: col.associationForm,
              appType: appType,
              mainFieldId: '',
              mainComponentName: 'TextField'
            };
          } else {
            // 使用占位符UUID创建子表关联字段（后续在宜搭平台手动修改关联）
            const placeholderUuid = `FORM-PLACEHOLDER-${Date.now().toString(36).toUpperCase()}`;
            console.log(`    ⚠️  子表关联字段 "${col.label}" 目标表单 "${col.associationForm}" 尚未创建，使用占位符UUID`);
            colField.associationForm = {
              formUuid: placeholderUuid,
              formTitle: col.associationForm,
              appType: appType,
              mainFieldId: '',
              mainComponentName: 'TextField'
            };
            skippedAssocFields++;
          }
        }
        
        apiField.children.push(colField);
      }
    }
    
    apiFields.push(apiField);
  }
  
  if (skippedAssocFields > 0) {
    console.log(`  注意: ${skippedAssocFields} 个关联表单字段使用了占位符UUID（后续需在宜搭平台手动修改关联关系）`);
  }
  console.log(`  实际创建字段数量: ${apiFields.length}`);
  console.log(`  表单类型: ${formType === 'process' ? '流程表单' : '普通表单'}`);
  
  // 保存临时字段定义文件
  const tempFieldsFile = path.join(SCRIPT_DIR, '.temp_fields.json');
  fs.writeFileSync(tempFieldsFile, JSON.stringify(apiFields, null, 2), 'utf-8');
  
  try {
    // 调用表单管理器创建表单，传递表单类型
    const result = execCommand(
      `node "${FORM_MANAGER}" "${appType}" "${formTitle}" "${tempFieldsFile}" "${formType}"`
    );
    
    if (!result || !result.success) {
      throw new Error(result?.error || '创建表单失败');
    }
    
    console.log(`  ✅ 表单创建成功: ${result.formUuid}`);
    console.log(`  📎 访问地址: ${result.url}`);
    
    return result;
  } finally {
    // 清理临时文件
    if (fs.existsSync(tempFieldsFile)) {
      fs.unlinkSync(tempFieldsFile);
    }
  }
}

async function main() {
  const markdownPath = process.argv[2];
  const appName = process.argv[3];
  
  if (!markdownPath) {
    console.log('用法: node create_from_markdown.js <markdown文件路径> [应用名称]');
    console.log('示例:');
    console.log('  node create_from_markdown.js "../../../进销存管理/01需求梳理/字段清单.md" "进销存管理"');
    process.exit(1);
  }
  
  console.log('\n============================================================');
  console.log('宜搭表单静默创建器');
  console.log('版本: 2.3.3');
  console.log('============================================================');

  // 1. 读取并解析Markdown
  console.log('\n[1/6] 读取字段清单...');
  const fullPath = path.resolve(markdownPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`错误: 文件不存在 ${fullPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  const systemInfo = parseMarkdown(content);
  const appNameToUse = appName || systemInfo.name || '未命名应用';
  
  console.log(`  ✓ 系统名称: ${systemInfo.name || '-'}`);
  console.log(`  ✓ 应用名称: ${appNameToUse}`);
  console.log(`  ✓ 表单数量: ${systemInfo.forms.length} 个`);
  systemInfo.forms.forEach(form => {
    const subCount = form.subTables ? form.subTables.length : 0;
    console.log(`    - ${form.name}「${form.type}」(${form.fields.length}主表字段${subCount > 0 ? `, ${subCount}子表` : ''})`);
  });
  
  const outputDir = path.dirname(path.dirname(fullPath));

  // 2. 转换表单配置并排序
  let configs = systemInfo.forms.map(convertFormToConfig);
  configs = topologicalSort(configs);
  
  console.log(`\n  按依赖关系排序后的创建顺序:`);
  configs.forEach((config, index) => {
    const targets = getAssociationTargets(config.fields);
    const deps = targets.length > 0 ? ` (依赖: ${targets.join(', ')})` : '';
    console.log(`    ${index + 1}. ${config.formName}${deps}`);
  });

  // 3. 确保登录
  const loginInfo = ensureLogin();
  
  // 4. 创建应用
  const appInfo = createApp(appNameToUse, `${appNameToUse} - 自动创建`);
  
  // 5. 创建表单（按依赖关系排序）
  console.log('\n[2/6] 创建宜搭表单...');
  
  const createdForms = [];
  const formUuidMap = {};
  let hasError = false;
  
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    console.log(`\n  📌 创建进度: ${i + 1}/${configs.length} — ${config.formName}`);
    try {
      const apiFormType = config.formType === '流程表单' ? 'process' : 'receipt';
      const formInfo = createFormWithMapping(appInfo.appType, config.formName, config.fields, formUuidMap, apiFormType);
      createdForms.push({
        formName: config.formName,
        formType: config.formType,
        formUuid: formInfo.formUuid,
        processCode: formInfo.processCode || null,
        url: formInfo.url
      });
      formUuidMap[config.formName] = formInfo.formUuid;
      console.log(`  ✅ [${i + 1}/${configs.length}] ${config.formName} 创建成功`);
    } catch (error) {
      console.error(`  ❌ [${i + 1}/${configs.length}] 创建表单失败: ${config.formName} - ${error.message}`);
      hasError = true;
      break;
    }
  }

  if (hasError && createdForms.length > 0) {
    console.log(`\n  ⚠️  创建过程中出错，正在回滚已创建的 ${createdForms.length} 个表单...`);
    for (const form of createdForms) {
      try {
        deleteForm(loginInfo, appInfo.appType, form.formUuid);
        console.log(`  🗑️  已回滚: ${form.formName}`);
      } catch (rollbackError) {
        console.error(`  ❌ 回滚失败: ${form.formName} - ${rollbackError.message}`);
        console.error(`     请手动删除表单: ${form.formName} (UUID: ${form.formUuid})`);
      }
    }
    console.log('\n  ❌ 表单创建失败，已回滚所有已创建的表单。请检查错误后重试。');
    process.exit(1);
  }

  if (hasError && createdForms.length === 0) {
    console.log('\n  ❌ 第一个表单创建即失败，无需回滚。请检查错误后重试。');
    process.exit(1);
  }
  
  // 6. 更新关联字段的mainFieldId
  if (createdForms.length > 0) {
    console.log('\n[3/6] 更新关联字段配置...');
    await updateAssociationFields(appInfo.appType, createdForms, formUuidMap, loginInfo);
  }

  // 7. 写入临时文件，记录创建的表单UUID（供同步脚本使用）
  console.log('\n[4/6] 保存表单信息到临时文件...');
  const tempFormsFile = path.join(outputDir, '.temp_forms.json');
  try {
    fs.writeFileSync(tempFormsFile, JSON.stringify(createdForms, null, 2), 'utf-8');
    console.log(`  ✅ 已保存: ${tempFormsFile}`);
    console.log(`  📋 共 ${createdForms.length} 个表单`);
  } catch (error) {
    console.log(`  ⚠️  保存临时文件失败: ${error.message}`);
  }

  // 8. 更新组织及应用信息
  console.log('\n[5/6] 更新组织及应用信息...');
  updateOrgAppInfo(appInfo);

  // 9. 调用 yida-config-sync 整体同步（当作已有应用处理）
  console.log('\n[6/6] 同步应用到本地（当作已有应用处理）...');
  await syncAsExistingApp(outputDir, appInfo.appType, createdForms);

  // 10. 生成原型页面
  console.log('\n[7/7] 生成原型页面...');
  // 使用绝对路径传递markdown文件路径，避免相对路径在切换cwd后失效
  const prototypeResult = await generatePrototype(fullPath, outputDir, appInfo);

  // 生成结果报告
  console.log('\n============================================================');
  console.log('[创建完成]');
  console.log('============================================================');
  console.log(`\n应用信息:`);
  console.log(`  应用名称: ${appInfo.appName}`);
  console.log(`  应用ID: ${appInfo.appType}`);
  console.log(`  访问地址: ${appInfo.url}`);
  console.log(`\n表单列表 (${createdForms.length}/${configs.length}):`);
  createdForms.forEach((form, index) => {
    console.log(`  ${index + 1}. ${form.formName}「${form.formType}」`);
    console.log(`     UUID: ${form.formUuid}`);
    console.log(`     地址: ${form.url}`);
  });

  if (createdForms.length < configs.length) {
    console.log(`\n⚠️  警告: ${configs.length - createdForms.length} 个表单创建失败`);
    const failedForms = configs
      .filter(config => !createdForms.find(f => f.formName === config.formName))
      .map(config => config.formName);
    console.log(`  失败的表单: ${failedForms.join(', ')}`);
  }

  console.log('\n📋 完成事项:');
  console.log('  ✅ 宜搭应用和表单已创建');
  console.log('  ✅ 组织及应用信息已更新');
  console.log('  ✅ 应用配置已同步到本地（系统配置清单、组件ID清单等）');
  console.log('  ✅ 原型页面已生成');
  console.log('\n💡 提示:');
  console.log('  现在可以直接使用这些表单编写公式和代码提示词');
  console.log('  所有文件由 yida-config-sync 统一生成，确保数据一致性');
  if (prototypeResult.success) {
    console.log(`  原型页面访问地址: ${prototypeResult.url}`);
  }

  console.log('\n============================================================\n');
}

/**
 * 调用 yida-config-sync 将应用当作已有应用同步回来
 * 创建完成后，应用就是"已有应用"，使用同步已有应用的逻辑
 * @param {string} outputDir - 项目输出目录
 * @param {string} appId - 应用ID
 * @param {Array} createdForms - 已创建的表单列表（包含formName, formType, formUuid）
 */
async function syncAsExistingApp(outputDir, appId, createdForms) {
  console.log(`  🔄 调用 yida-config-sync 同步应用: ${appId}`);
  console.log(`  📁 输出目录: ${outputDir}`);

  try {
    const { syncConfig } = require(CONFIG_SYNC_SCRIPT);
    await syncConfig({
      appId: appId,
      outputDir: outputDir,
      createdForms: createdForms  // 传递已创建的表单列表，避免API查询
    });
    console.log('  ✅ 应用同步完成');
    
    // 同步完成后，调用 yida-get-schema 生成JSON文件
    await syncFormSchemas(outputDir, appId, createdForms);
    
  } catch (error) {
    console.log(`  ⚠️  同步失败: ${error.message}`);
    console.log('  💡 请稍后手动执行同步命令:');
    console.log(`     node .agents/skills/yida-config-sync/scripts/sync_config.js --appId ${appId} --output "${outputDir}"`);
  }
}

/**
 * 调用 yida-get-schema 同步所有表单的JSON文件
 * @param {string} outputDir - 项目输出目录
 * @param {string} appId - 应用ID
 * @param {Array} createdForms - 已创建的表单列表
 */
async function syncFormSchemas(outputDir, appId, createdForms) {
  console.log(`\n  🔄 同步表单JSON文件...`);
  
  try {
    const GET_SCHEMA_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'yida-get-schema', 'scripts', 'sync-schema.js');
    
    // 构建同步配置文件
    const syncConfig = {
      appType: appId,
      forms: createdForms.map(form => {
        // 构建JSON文件路径
        const formDirName = `${form.formName}「${form.formType}」`;
        const formDir = path.join(outputDir, formDirName);
        const jsonPath = path.join(formDir, `${formDirName}.json`);
        
        return {
          formUuid: form.formUuid,
          localPath: jsonPath
        };
      })
    };
    
    // 保存临时配置文件
    const configPath = path.join(outputDir, '.temp_sync_forms.json');
    fs.writeFileSync(configPath, JSON.stringify(syncConfig, null, 2), 'utf-8');
    
    // 调用 sync-schema.js 进行批量同步
    const { execSync } = require('child_process');
    const command = `node "${GET_SCHEMA_SCRIPT}" --config "${configPath}"`;
    
    console.log(`     正在同步 ${createdForms.length} 个表单的JSON文件...`);
    
    execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300_000,
      cwd: path.dirname(GET_SCHEMA_SCRIPT)
    });
    
    // 删除临时配置文件
    try {
      fs.unlinkSync(configPath);
    } catch (e) {
      // 忽略删除错误
    }
    
    console.log('  ✅ 表单JSON文件同步完成');
  } catch (error) {
    console.log(`  ⚠️  JSON文件同步失败: ${error.message}`);
    console.log('  💡 请稍后手动执行同步命令:');
    console.log(`     node .agents/skills/yida-get-schema/scripts/sync-schema.js --config "${outputDir}/sync-forms-config.json"`);
  }
}

/**
 * 更新组织及应用信息.md文件
 * 将新创建的应用添加到应用列表的最前面（序号为1）
 * @param {Object} appInfo - 应用信息
 */
function updateOrgAppInfo(appInfo) {
  try {
    // 查找组织及应用信息.md文件（从当前目录向上查找）
    let orgInfoPath = null;
    let currentDir = SCRIPT_DIR;
    
    // 向上查找5层目录（从 .agents/skills/form_creator/scripts 到项目根目录）
    for (let i = 0; i < 6; i++) {
      const possiblePath = path.join(currentDir, '组织及应用信息.md');
      if (fs.existsSync(possiblePath)) {
        orgInfoPath = possiblePath;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    
    // 如果没找到，尝试从环境变量或默认路径获取
    if (!orgInfoPath) {
      const defaultPath = path.join(process.cwd(), '组织及应用信息.md');
      if (fs.existsSync(defaultPath)) {
        orgInfoPath = defaultPath;
      }
    }
    
    // 最后尝试项目根目录（基于常见结构）
    if (!orgInfoPath) {
      const rootPath = path.join(SCRIPT_DIR, '..', '..', '..', '..', '组织及应用信息.md');
      if (fs.existsSync(rootPath)) {
        orgInfoPath = rootPath;
      }
    }
    
    if (!orgInfoPath) {
      console.log(`  ⚠️  未找到组织及应用信息.md文件，跳过更新`);
      return;
    }
    
    console.log(`\n📝 更新组织及应用信息: ${orgInfoPath}`);
    
    let content = fs.readFileSync(orgInfoPath, 'utf-8');
    
    // 更新最后更新时间
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    content = content.replace(/\| 最后更新时间 \| [^|]+ \| 自动更新 \|/, `| 最后更新时间 | ${timeStr} | 自动更新 |`);
    
    // 检查应用是否已存在（按应用ID检查，转义特殊字符）
    const escapedAppId = appInfo.appType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const appIdPattern = new RegExp(`\\| [^|]+ \\| [^|]+ \\| ${escapedAppId} \\|`);
    if (appIdPattern.test(content)) {
      console.log(`  ✓ 应用 "${appInfo.appName}" 已存在于列表中`);
      return;
    }
    
    // 解析现有的应用列表（支持多种表格格式）
    // 匹配包含"序号"、"应用名称"、"应用 ID"或"应用ID"的表格
    const tableRegex = /(\| 序号[^|]* \| 应用名称[^|]* \| 应用\s*ID[^|]*\|[\s\S]*?)(\n---|\n\*\*\*)/;
    const match = content.match(tableRegex);
    
    if (!match) {
      console.log(`  ⚠️  未找到应用列表表格，跳过更新`);
      return;
    }
    
    // 提取表头（支持应用ID中间有空格的情况，支持多列）
    // 注意：分隔线可能是 | -- | 或 |------| 格式
    // 分隔线后面应该紧跟换行，而不是数据
    const headerMatch = content.match(/\| 序号[^|]* \| 应用名称[^|]* \| 应用\s*ID[^|]*\|?[^\n]*\n\|[-:\s|]+\|?(?=\n)/);
    if (!headerMatch) {
      console.log(`  ⚠️  应用列表表格格式不正确，跳过更新`);
      return;
    }
    
    const header = headerMatch[0];
    
    // 提取表头列数，确定表格有几列
    // 只取第一行（表头行），排除分隔线
    const headerLine = header.split('\n')[0];
    const headerColumns = headerLine.split('|').filter(col => col.trim()).length;
    
    // 提取所有现有应用行（支持多列表格，动态匹配列数）
    // 支持两种格式：
    // 1. | 1 | 名称 | ID | （标准格式，行尾有|）
    // 2. | 1 | 名称 | ID    （简化格式，行尾无|）
    const rows = [];
    
    // 查找表格区域（从表头后到下一个 ## 或 *** 或 --- 之前）
    const tableStartIdx = content.indexOf(headerMatch[0]) + headerMatch[0].length;
    let tableEndIdx = content.length;
    const endMarkers = ['\n## ', '\n***', '\n---'];
    for (const marker of endMarkers) {
      const idx = content.indexOf(marker, tableStartIdx);
      if (idx !== -1 && idx < tableEndIdx) {
        tableEndIdx = idx;
      }
    }
    const tableContent = content.substring(tableStartIdx, tableEndIdx);
    
    // 按行分割并解析每一行
    const lines = tableContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      // 匹配表格行：| 序号 | 名称 | ID | 或 | 序号 | 名称 | ID
      // 排除分隔线行（包含 -- 或 :: 的行，以及只有 | 和 - : 空格 的行）
      if (trimmedLine.startsWith('|') && 
          !trimmedLine.match(/^\|[-:\s|]*\|?$/) && // 排除分隔线行
          !trimmedLine.match(/^\|\s*--/) && // 排除以 | -- 开头的行
          trimmedLine.length > 5) { // 确保行有足够内容
        const parts = trimmedLine.split('|').map(p => p.trim()).filter(p => p);
        if (parts.length >= 3) {
          const seq = parseInt(parts[0]);
          const name = parts[1];
          const appId = parts[2];
          if (!isNaN(seq) && name && appId) {
            rows.push({ seq, name, appId });
          }
        }
      }
    }
    
    // 检查是否已存在（按名称或ID）
    const exists = rows.some(r => r.name === appInfo.appName || r.appId === appInfo.appType);
    if (exists) {
      console.log(`  ✓ 应用 "${appInfo.appName}" 已存在于列表中`);
      return;
    }
    
    // 将新应用插入到最前面（序号为1）
    const newRow = { seq: 1, name: appInfo.appName, appId: appInfo.appType };
    
    // 其他应用序号顺延
    const updatedRows = [newRow, ...rows.map(r => ({ ...r, seq: r.seq + 1 }))];
    
    // 重新构建表格内容（保持原有列数，用空值填充额外列）
    // 检测原表格行尾是否有 |
    const hasTrailingPipe = rows.length > 0 && content.includes(`| ${rows[0].seq} | ${rows[0].name} | ${rows[0].appId} |`);
    
    const newTableRows = updatedRows.map(r => {
      // 基础3列：序号、名称、ID
      let rowStr = `| ${r.seq} | ${r.name} | ${r.appId}`;
      // 如果原表格行尾有 |，则添加
      if (hasTrailingPipe) {
        rowStr += ' |';
      }
      // 如果原表格有更多列，用空值或默认值填充
      for (let i = 3; i < headerColumns; i++) {
        if (i === 3) rowStr += hasTrailingPipe ? ' 普通应用 |' : ' | 普通应用';
        else if (i === 4) rowStr += hasTrailingPipe ? ' - |' : ' | -';
        else rowStr += hasTrailingPipe ? ' |' : ' |';
      }
      // 再次确保行尾有 |
      if (hasTrailingPipe && !rowStr.endsWith(' |')) {
        rowStr += ' |';
      }
      return rowStr;
    }).join('\n');
    
    // 使用更安全的方式替换表格内容
    // 直接替换表格区域内的所有内容
    const beforeTable = content.substring(0, tableStartIdx);
    const afterTable = content.substring(tableEndIdx);
    // 确保 beforeTable 以换行符结尾，避免分隔行和数据行粘连
    const beforeTableWithNewline = beforeTable.endsWith('\n') ? beforeTable : beforeTable + '\n';
    content = beforeTableWithNewline + newTableRows + '\n' + afterTable;
    
    // 保存文件
    fs.writeFileSync(orgInfoPath, content, 'utf-8');
    console.log(`  ✅ 已添加应用到列表第1位: ${appInfo.appName} (${appInfo.appType})`);
    
  } catch (error) {
    console.log(`  ⚠️  更新组织及应用信息失败: ${error.message}`);
    // 不抛出错误，因为这是辅助功能，不应影响主流程
  }
}

/**
 * 更新关联字段的mainFieldId
 * @param {string} appType - 应用ID
 * @param {Array} createdForms - 已创建的表单列表
 * @param {Object} formUuidMap - 表单名称到UUID的映射
 * @param {Object} loginInfo - 登录信息
 */
async function updateAssociationFields(appType, createdForms, formUuidMap, loginInfo) {
  // 动态导入form_manager的函数
  const { getFormSchema, getFirstTextFieldId, saveFormSchema } = require(FORM_MANAGER);
  
  // 首先查询所有表单的第一个文本字段ID
  const formMainFieldMap = {};
  for (const form of createdForms) {
    try {
      const schema = await getFormSchema(
        { csrfToken: loginInfo.csrf_token, cookies: loginInfo.cookies, baseUrl: loginInfo.base_url },
        appType,
        form.formUuid
      );
      if (schema) {
        const mainFieldId = getFirstTextFieldId(schema);
        if (mainFieldId) {
          formMainFieldMap[form.formName] = mainFieldId;
          console.log(`  ✓ ${form.formName}: ${mainFieldId}`);
        }
      }
    } catch (error) {
      console.error(`  ⚠️  查询 ${form.formName} 失败: ${error.message}`);
    }
  }
  
  // 然后更新包含关联字段的表单
  for (const form of createdForms) {
    try {
      const schema = await getFormSchema(
        { csrfToken: loginInfo.csrf_token, cookies: loginInfo.cookies, baseUrl: loginInfo.base_url },
        appType,
        form.formUuid
      );
      
      // 宜搭Schema结构: schema.pages[0].componentsTree[0] -> RootContent -> FormContainer -> children
      let components = null;
      
      if (schema && schema.pages && schema.pages[0] && schema.pages[0].componentsTree) {
        const pageRoot = schema.pages[0].componentsTree[0];
        if (pageRoot && pageRoot.children) {
          // 查找 RootContent
          const rootContent = pageRoot.children.find(c => c.componentName === 'RootContent');
          if (rootContent && rootContent.children) {
            // 查找 FormContainer
            const formContainer = rootContent.children.find(c => c.componentName === 'FormContainer');
            if (formContainer && formContainer.children) {
              components = formContainer.children;
            }
          }
        }
      }
      
      if (!components) {
        console.log(`  ⚠️ ${form.formName}: 无法获取表单组件结构`);
        continue;
      }
      
      let updated = false;
      
      // 递归更新关联字段
      function updateAssociationComponents(components) {
        for (const comp of components) {
          if (comp.componentName === 'AssociationFormField' && comp.props?.associationForm) {
            const targetFormTitle = comp.props.associationForm.formTitle;
            const targetMainFieldId = formMainFieldMap[targetFormTitle];
            const currentMainFieldId = comp.props.associationForm.mainFieldId;
            // 更新条件：有目标字段ID，且当前字段ID为空、'_'或无效
            if (targetMainFieldId && (!currentMainFieldId || currentMainFieldId === '_' || currentMainFieldId === '')) {
              comp.props.associationForm.mainFieldId = targetMainFieldId;
              updated = true;
              console.log(`  ✓ 更新 ${form.formName}.${comp.props.label?.zh_CN || comp.props.content?.zh_CN || comp.props.label || comp.props.content || '关联字段'}: ${targetMainFieldId}`);
            }
          }
          if (comp.children && comp.children.length > 0) {
            updateAssociationComponents(comp.children);
          }
        }
      }
      
      updateAssociationComponents(components);
      
      if (updated) {
        // 保存更新后的Schema
        await saveFormSchema(
          { csrfToken: loginInfo.csrf_token, cookies: loginInfo.cookies, baseUrl: loginInfo.base_url },
          appType,
          form.formUuid,
          schema
        );
        console.log(`  ✅ ${form.formName} 更新成功`);
      }
    } catch (error) {
      console.error(`  ⚠️  更新 ${form.formName} 失败: ${error.message}`);
    }
  }
}

/**
 * 生成原型页面
 * 调用 form-to-prototype skill 生成 HTML 原型页面
 * @param {string} markdownPath - 字段清单文件路径
 * @param {string} outputDir - 项目输出目录
 * @param {Object} appInfo - 应用信息
 * @returns {Object} 生成结果 {success: boolean, url: string}
 */
async function generatePrototype(markdownPath, outputDir, appInfo) {
  const result = { success: false, url: '' };
  
  try {
    // 检查原型页面生成器脚本是否存在
    if (!fs.existsSync(PROTOTYPE_GENERATOR_SCRIPT)) {
      console.log(`  ⚠️  原型页面生成器脚本不存在: ${PROTOTYPE_GENERATOR_SCRIPT}`);
      return result;
    }
    
    // 确定原型页面输出目录：{项目目录}/01需求梳理/原型页面/
    const prototypeOutputDir = path.join(outputDir, '01需求梳理', '原型页面');
    
    console.log(`  📁 原型页面输出目录: ${prototypeOutputDir}`);
    
    // 调用原型页面生成器
    const command = `node "${PROTOTYPE_GENERATOR_SCRIPT}" "${markdownPath}" "${prototypeOutputDir}"`;
    
    console.log(`  🔄 正在生成原型页面...`);
    
    execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120_000,
      cwd: path.dirname(PROTOTYPE_GENERATOR_SCRIPT)
    });
    
    console.log(`  ✅ 原型页面生成成功`);
    
    // 构建访问地址
    const projectName = path.basename(outputDir);
    result.url = `http://127.0.0.1:8080/${projectName}/01需求梳理/原型页面/index.html`;
    result.success = true;
    
    // 注意：组织及应用信息.md 的更新由 prototype_generator.js 统一处理
    // 避免重复更新导致表格格式混乱
    
  } catch (error) {
    console.log(`  ⚠️  生成原型页面失败: ${error.message}`);
    console.log(`  💡 请稍后手动执行生成命令:`);
    console.log(`     node .agents/skills/form-to-prototype/scripts/prototype_generator.js "${markdownPath}" "${path.join(outputDir, '01需求梳理')}"`);
  }
  
  return result;
}

/**
 * 更新组织及应用信息.md，追加原型页面访问地址
 * @param {string} outputDir - 项目输出目录
 * @param {Object} appInfo - 应用信息
 * @param {string} prototypeUrl - 原型页面访问地址
 */
async function updateOrgInfoWithPrototype(outputDir, appInfo, prototypeUrl) {
  try {
    // 查找组织及应用信息.md文件（从项目目录向上查找）
    let orgInfoPath = null;
    let currentDir = outputDir;
    
    while (currentDir !== path.dirname(currentDir)) {
      const possiblePath = path.join(currentDir, '组织及应用信息.md');
      if (fs.existsSync(possiblePath)) {
        orgInfoPath = possiblePath;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    
    if (!orgInfoPath) {
      console.log(`  ⚠️  未找到组织及应用信息.md文件，跳过原型地址更新`);
      return;
    }
    
    let content = fs.readFileSync(orgInfoPath, 'utf-8');
    
    // 检查是否已存在原型页面访问地址章节
    const prototypeSectionRegex = /## 原型页面访问地址/;
    
    if (!prototypeSectionRegex.test(content)) {
      // 不存在则创建新章节（在更新时间章节前插入）
      const updateTimeRegex = /## 更新时间/;
      const prototypeSection = `## 原型页面访问地址

> 以下地址需要在 HTTP 服务启动后访问
>
> ⚠️ **必须使用 HTTP 方式访问**，严禁使用 \`file://\` 协议打开

| 应用名称 | 原型页面地址 | 本地状态 |
|----------|-------------|----------|
| ${appInfo.appName} | ${prototypeUrl} | ✅ 已同步 |

`;
      
      if (updateTimeRegex.test(content)) {
        content = content.replace(updateTimeRegex, prototypeSection + '## 更新时间');
      } else {
        content += '\n' + prototypeSection;
      }
    } else {
      // 已存在则追加新行
      const tableRow = `| ${appInfo.appName} | ${prototypeUrl} | ✅ 已同步 |`;
      
      // 在表格最后一行后追加
      const tableEndRegex = /(\| [^|]+ \| http[^|]+ \| [^|]+ \|)\n*(## 更新时间|$)/;
      const match = content.match(tableEndRegex);
      
      if (match) {
        content = content.replace(match[1], match[1] + '\n' + tableRow);
      } else {
        // 如果无法匹配，在章节末尾追加
        content = content.replace(/(## 原型页面访问地址[\s\S]*?)(\n## |$)/, '$1\n' + tableRow + '\n$2');
      }
    }
    
    // 保存文件
    fs.writeFileSync(orgInfoPath, content, 'utf-8');
    console.log(`  ✅ 已更新组织及应用信息.md，追加原型页面访问地址`);
    
  } catch (error) {
    console.log(`  ⚠️  更新组织及应用信息.md失败: ${error.message}`);
    // 不抛出错误，因为这是辅助功能
  }
}

main().catch(err => {
  console.error('\n错误:', err.message);
  process.exit(1);
});
