/**
 * 宜搭表单添加器 - 向已有应用添加单个表单
 * 版本: 1.3.1
 * 更新日期: 2026-04-19
 *
 * 更新内容:
 * - v1.3.1: 修复Windows终端中文乱码问题，添加UTF-8编码设置
 * - v1.3.0: 修复表单目录创建位置：字段清单在 01需求梳理/ 时，表单目录应该在项目根目录
 * - 新增检查逻辑：如果表单目录已存在，直接更新文件而不是重新创建
 * - 修复嵌套目录问题：避免在表单目录内再创建嵌套目录
 * - 智能更新文件：只更新需要更新的文件（JSON、组件ID清单、变更记录）
 *
 * 功能: 向已有的宜搭应用中添加单个表单（普通表单或流程表单）
 * 用法: node add_form_to_app.js --appId <应用ID> --form <字段清单文件路径> [--appName <应用名称>]
 * 示例:
 *   node add_form_to_app.js --appId APP_G7F1UGDPF7GIEW0UCUBY --form "./字段清单.md"
 *   node add_form_to_app.js --appId APP_XXX --form "./字段清单.md" --appName "AI宜搭场景"
 *
 * 说明:
 * - 应用ID必须提供，表单将添加到这个已有应用中
 * - 字段清单文件格式与 create_from_markdown.js 相同
 * - 只支持单个表单，不支持多表单
 * - 创建完成后自动同步表单结构、JSON文件和组件ID到本地
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
const API_CLIENT_DIR = path.join(SCRIPT_DIR, '..', '..', 'api-client', 'scripts');
const LOGIN_SCRIPT = path.join(API_CLIENT_DIR, 'login_manager.js');
const FORM_MANAGER = path.join(API_CLIENT_DIR, 'form_manager.js');

// config-sync 路径
const CONFIG_SYNC_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'config-sync', 'scripts', 'sync_form_schemas.js');

// get-schema 路径
const GET_SCHEMA_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'get-schema', 'scripts', 'sync-schema.js');

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

    const trimmedOutput = stdout.trim();
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
          const jsonStr = trimmedOutput.substring(i, jsonStart + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            // 继续查找
          }
        }
      }
    }

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
    const stderr = error.stderr ? error.stderr.toString() : '';
    const stdout = error.stdout ? error.stdout.toString() : '';
    const output = (stdout || stderr).trim();

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

  try {
    const result = execCommand(`node "${LOGIN_SCRIPT}"`);
    if (result && result.csrf_token) {
      console.log(`  ✅ 登录态有效 (${result.base_url})`);
      return result;
    }
  } catch (e) {
    console.log('  ⚠️  需要重新登录');
  }

  console.log('\n🔐 请扫码登录宜搭平台...');
  const result = execCommand(`node "${LOGIN_SCRIPT}"`);
  if (!result || !result.csrf_token) {
    throw new Error('登录失败');
  }
  console.log(`  ✅ 登录成功 (${result.base_url})`);
  return result;
}

// ==================== 字段解析（复用 create_from_markdown.js 的逻辑）=====================

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
    '单选': 'RadioField',
    '复选': 'CheckboxField',
    '下拉单选': 'SelectField',
    '下拉多选': 'MultiSelectField',
    '下拉复选': 'MultiSelectField',
    '关联表单': 'AssociationFormField',
    '成员': 'EmployeeField',
    '部门': 'DepartmentSelectField',
    '附件': 'AttachmentField',
    '图片': 'ImageField',
    '地址': 'AddressField',
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

  if (type === '单选' || type === '复选' || type === '下拉单选' || type === '下拉多选' || type === '下拉复选') {
    if (desc && desc !== '-' && !desc.includes('关联') && !desc.includes('公式')) {
      config.options = desc.split(/[\/、]/).map(opt => opt.trim()).filter(opt => opt);
    }
  }

  // 解析流水号前缀（支持"前缀:CP"或"前缀：CP"格式）
  if (type === '流水号') {
    const prefixMatch = desc.match(/前缀[：:](\w+)/);
    if (prefixMatch) {
      config.serialPrefix = prefixMatch[1].trim();
    }
  }

  return config;
}

/**
 * 解析单个表单的Markdown内容
 * 支持两种格式：
 * 1. 完整字段清单格式（包含 ### (一) 表单名称「类型」）
 * 2. 简化格式（直接是字段表格）
 */
function parseSingleFormMarkdown(content, defaultFormName) {
  const lines = content.split('\n');

  let formName = defaultFormName;
  let formType = '普通表单';
  let inTable = false;
  let isSubTable = false;
  let subTableName = '';

  const fields = [];
  const subTables = [];

  // 首先尝试解析表单名称和类型
  for (const line of lines) {
    const trimmed = line.trim();

    // 匹配标准格式：### (一) 表单名称「类型」
    const formMatch = trimmed.match(/###\s*\(\S+\)\s*(.+?)「(.+?)」/);
    if (formMatch) {
      formName = formMatch[1].trim();
      formType = formMatch[2].trim();
      break;
    }

    // 匹配简化格式：## 表单名称「类型」
    const simpleMatch = trimmed.match(/^##\s*(.+?)「(.+?)」/);
    if (simpleMatch) {
      formName = simpleMatch[1].trim();
      formType = simpleMatch[2].trim();
      break;
    }

    // 匹配一级标题：# 表单名称「类型」
    const h1Match = trimmed.match(/^#\s*(.+?)「(.+?)」/);
    if (h1Match) {
      formName = h1Match[1].trim();
      formType = h1Match[2].trim();
      break;
    }
  }

  // 解析字段表格
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检测子表标记
    const subTableHeaderMatch = line.match(/\*\*子表[：:](.+?)\*\*/);
    if (subTableHeaderMatch) {
      isSubTable = true;
      subTableName = subTableHeaderMatch[1].trim();
      subTables.push({ name: subTableName, fields: [] });
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
    if (inTable && line.startsWith('|')) {
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

        if (isSubTable && subTables.length > 0) {
          subTables[subTables.length - 1].fields.push(fieldConfig);
        } else {
          fields.push(fieldConfig);
        }
      }
      continue;
    }

    // 空行表示表格结束
    if (inTable && line === '') inTable = false;
  }

  return { name: formName, type: formType, fields, subTables };
}

/**
 * 转换字段配置为宜搭API格式
 */
function convertFieldsToApiFormat(fields, subTables = []) {
  const apiFields = [];

  // 处理主表字段
  for (const field of fields) {
    const apiField = {
      type: field.type,
      label: field.label,
      required: field.required || false
    };

    if (field.type === 'NumberField') {
      if (field.precision !== undefined) apiField.precision = field.precision;
      if (field.unit) apiField.innerAfter = field.unit;
    }

    if (field.type === 'SelectField' || field.type === 'MultiSelectField' || field.type === 'CheckboxField' || field.type === 'RadioField') {
      if (field.options && field.options.length > 0) {
        apiField.options = field.options;
      }
    }

    if (field.type === 'AssociationFormField' && field.associationForm) {
      console.log(`    ⚠️  关联表单字段 "${field.label}" 目标表单 "${field.associationForm}" 需要在宜搭平台手动配置关联`);
      apiField.type = 'TextField';
    }

    apiFields.push(apiField);
  }

  // 处理子表
  if (subTables && subTables.length > 0) {
    for (const subTable of subTables) {
      const tableField = {
        type: 'TableField',
        label: subTable.name,
        children: []
      };

      for (const col of subTable.fields) {
        const colField = {
          type: col.type,
          label: col.label,
          required: col.required || false
        };

        if (col.precision !== undefined) colField.precision = col.precision;
        if (col.unit) colField.innerAfter = col.unit;
        if (col.options && col.options.length > 0) colField.options = col.options;

        if (col.type === 'AssociationFormField' && col.associationForm) {
          console.log(`    ⚠️  子表关联字段 "${col.label}" 目标表单 "${col.associationForm}" 需要在宜搭平台手动配置关联`);
          colField.type = 'TextField';
        }

        tableField.children.push(colField);
      }

      apiFields.push(tableField);
    }
  }

  return apiFields;
}

/**
 * 创建表单
 * @param {string} appId - 应用ID
 * @param {string} formTitle - 表单标题
 * @param {Array} fields - 字段定义数组
 * @param {string} formType - 表单类型: receipt(普通表单) 或 process(流程表单)
 * @returns {Object} 表单信息
 */
function createForm(appId, formTitle, fields, formType = 'receipt') {
  console.log(`\n📝 创建表单: ${formTitle}`);
  console.log(`  字段数量: ${fields.length}`);
  console.log(`  表单类型: ${formType === 'process' ? '流程表单' : '普通表单'}`);

  // 保存临时字段定义文件
  const tempFieldsFile = path.join(SCRIPT_DIR, '.temp_single_form_fields.json');
  fs.writeFileSync(tempFieldsFile, JSON.stringify(fields, null, 2), 'utf-8');

  try {
    const result = execCommand(
      `node "${FORM_MANAGER}" "${appId}" "${formTitle}" "${tempFieldsFile}" "${formType}"`
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

/**
 * 查找项目根目录（包含系统配置清单.md的目录）
 * @param {string} startDir - 起始目录
 * @returns {string|null} 项目根目录
 */
function findProjectRoot(startDir) {
  let currentDir = startDir;
  
  // 向上查找最多3层
  for (let i = 0; i < 3; i++) {
    const configPath = path.join(currentDir, '系统配置清单.md');
    if (fs.existsSync(configPath)) {
      return currentDir;
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  
  return null;
}

/**
 * 从系统配置清单解析表单UUID
 * @param {string} configPath - 系统配置清单路径
 * @param {string} formName - 表单名称
 * @returns {string|null} 表单UUID
 */
function parseFormUuidFromConfig(configPath, formName) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  
  // 匹配表单表格行，格式: | 序号 | 页面名称「类型」 | 表单UUID |
  const formRegex = new RegExp(
    `\\|\\s*\\d+\\s*\\|\\s*${formName}「[^」]+」\\s*\\|\\s*([A-Z0-9-]+)\\s*\\|`,
    'i'
  );
  
  const match = content.match(formRegex);
  if (match) {
    return match[1].trim();
  }
  
  return null;
}

/**
 * 创建表单目录结构
 * @param {string} projectRoot - 项目根目录
 * @param {string} formName - 表单名称
 * @param {string} formType - 表单类型
 * @returns {string} 表单目录路径
 */
function createFormDirectory(projectRoot, formName, formType) {
  const formDirName = `${formName}「${formType}」`;
  const formDir = path.join(projectRoot, formDirName);
  
  if (!fs.existsSync(formDir)) {
    fs.mkdirSync(formDir, { recursive: true });
    console.log(`  📁 创建表单目录: ${formDirName}`);
  } else {
    console.log(`  📁 表单目录已存在: ${formDirName}`);
  }
  
  return formDir;
}

/**
 * 获取正确的项目根目录
 * 如果字段清单在 01需求梳理/ 目录下，返回其父目录作为项目根目录
 * @param {string} formFilePath - 字段清单文件路径
 * @returns {string} 项目根目录
 */
function getCorrectProjectRoot(formFilePath) {
  const fieldListDir = path.dirname(formFilePath);
  const dirName = path.basename(fieldListDir);
  
  // 如果字段清单在 01需求梳理/ 目录下，项目根目录就是父目录
  if (dirName === '01需求梳理') {
    return path.dirname(fieldListDir);
  }
  
  // 否则直接使用字段清单所在目录
  return fieldListDir;
}

/**
 * 同步表单结构和组件ID
 * @param {string} projectRoot - 项目根目录（正确的项目根目录）
 * @param {string} appId - 应用ID
 * @param {string} formName - 表单名称
 * @param {string} formType - 表单类型
 * @param {string} formUuid - 表单UUID
 * @param {string} systemConfigRoot - 系统配置清单所在目录（用于更新配置清单）
 */
function syncFormSchema(projectRoot, appId, formName, formType, formUuid, systemConfigRoot) {
  console.log('\n🔄 同步表单结构和组件ID...');

  try {
    // 1. 创建或获取表单目录（在项目根目录中）
    const formDir = createFormDirectory(projectRoot, formName, formType);
    
    // 2. 同步JSON文件和组件ID
    const jsonFileName = `${formName}「${formType}」.json`;
    const jsonPath = path.join(formDir, jsonFileName);
    
    console.log(`  📥 从宜搭平台同步表单Schema...`);
    const result = execSync(
      `node "${GET_SCHEMA_SCRIPT}" "${appId}" "${formUuid}" "${jsonPath}"`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 120_000,
      }
    );
    
    console.log(result);
    console.log('  ✅ 表单JSON文件已同步');
    
    // 3. 更新系统配置清单中的表单列表
    if (systemConfigRoot) {
      updateSystemConfig(systemConfigRoot, formName, formType, formUuid);
    }
    
    console.log('  ✅ 表单结构和组件ID同步完成');
  } catch (error) {
    console.log(`  ⚠️  同步失败: ${error.message}`);
    console.log('  提示: 请稍后手动执行同步命令');
  }
}

/**
 * 更新系统配置清单
 * @param {string} projectRoot - 项目根目录
 * @param {string} formName - 表单名称
 * @param {string} formType - 表单类型
 * @param {string} formUuid - 表单UUID
 */
function updateSystemConfig(projectRoot, formName, formType, formUuid) {
  const configPath = path.join(projectRoot, '系统配置清单.md');
  
  if (!fs.existsSync(configPath)) {
    console.log('  ⚠️  系统配置清单不存在，跳过更新');
    return;
  }
  
  try {
    let content = fs.readFileSync(configPath, 'utf-8');
    
    // 检查表单是否已存在
    const formRegex = new RegExp(
      `\\|\\s*\\d+\\s*\\|\\s*${formName}「[^」]+」\\s*\\|`,
      'i'
    );
    
    if (formRegex.test(content)) {
      console.log('  ℹ️  表单已在系统配置清单中');
      return;
    }
    
    // 找到最后一个表单条目，添加新表单
    const lastFormRegex = /(\|\s*\d+\s*\|\s*[^|]+?「[^」]+」\s*\|\s*[A-Z0-9-]+\s*\|[^\n]*\n)(?!.*\|\s*\d+\s*\|)/;
    const lastMatch = content.match(lastFormRegex);
    
    if (lastMatch) {
      const lastIndex = parseInt(lastMatch[0].match(/\|\s*(\d+)\s*\|/)[1]);
      const newIndex = lastIndex + 1;
      const newLine = `| ${newIndex} | ${formName}「${formType}」 | ${formUuid} |\n`;
      
      content = content.replace(lastMatch[0], lastMatch[0] + newLine);
      fs.writeFileSync(configPath, content, 'utf-8');
      console.log(`  📝 已更新系统配置清单（序号 ${newIndex}）`);
    }
  } catch (error) {
    console.log(`  ⚠️  更新系统配置清单失败: ${error.message}`);
  }
}

// ==================== 主流程 ====================

function showHelp() {
  console.log(`
============================================================
  宜搭表单添加器 - 向已有应用添加单个表单
  版本: 1.0.0
============================================================

用法:
  node add_form_to_app.js --appId <应用ID> --form <字段清单文件路径> [选项]

参数:
  --appId <应用ID>     必填，宜搭应用ID（如 APP_XXX）
  --form <文件路径>     必填，字段清单Markdown文件路径
  --appName <应用名称>  可选，应用显示名称
  --help               显示帮助信息

示例:
  # 向已有应用添加表单
  node add_form_to_app.js --appId APP_G7F1UGDPF7GIEW0UCUBY --form "./字段清单.md"

  # 指定应用名称
  node add_form_to_app.js --appId APP_XXX --form "./字段清单.md" --appName "AI宜搭场景"

字段清单格式:
  支持标准格式或简化格式，必须包含字段表格：

  ## 表单名称「普通表单」

  | 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |
  |----------|----------|----------|----------|----------|
  | 字段1    | 单行文本 | 说明     | 编辑     | 是       |
  | 字段2    | 数值     | 说明     | 编辑     | 否       |

============================================================
`);
}

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const options = {
    appId: null,
    formFile: null,
    appName: null
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--appId' && i + 1 < args.length) {
      options.appId = args[i + 1];
      i++;
    } else if (args[i] === '--form' && i + 1 < args.length) {
      options.formFile = args[i + 1];
      i++;
    } else if (args[i] === '--appName' && i + 1 < args.length) {
      options.appName = args[i + 1];
      i++;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  // 验证参数
  if (!options.appId) {
    console.error('❌ 错误: 必须提供 --appId 参数');
    console.log('   使用 --help 查看帮助');
    process.exit(1);
  }

  if (!options.formFile) {
    console.error('❌ 错误: 必须提供 --form 参数');
    console.log('   使用 --help 查看帮助');
    process.exit(1);
  }

  console.log('\n============================================================');
  console.log('宜搭表单添加器 - 向已有应用添加单个表单');
  console.log('版本: 1.2.0');
  console.log('============================================================');

  // 1. 读取并解析字段清单
  console.log('\n[1/4] 读取字段清单...');
  const formFilePath = path.resolve(options.formFile);
  if (!fs.existsSync(formFilePath)) {
    console.error(`❌ 错误: 文件不存在 ${formFilePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(formFilePath, 'utf-8');
  const formInfo = parseSingleFormMarkdown(content, '新建表单');

  console.log(`  ✓ 表单名称: ${formInfo.name}`);
  console.log(`  ✓ 表单类型: ${formInfo.type}`);
  console.log(`  ✓ 主表字段: ${formInfo.fields.length} 个`);
  if (formInfo.subTables.length > 0) {
    console.log(`  ✓ 子表数量: ${formInfo.subTables.length} 个`);
    formInfo.subTables.forEach((st, i) => {
      console.log(`    - ${st.name}: ${st.fields.length} 个字段`);
    });
  }

  // 2. 确保登录
  console.log('\n[2/4] 检查登录态...');
  const loginInfo = ensureLogin();

  // 3. 创建表单
  console.log('\n[3/4] 创建表单到已有应用...');
  console.log(`  目标应用: ${options.appName || options.appId}`);
  console.log(`  应用ID: ${options.appId}`);

  const apiFields = convertFieldsToApiFormat(formInfo.fields, formInfo.subTables);
  const apiFormType = formInfo.type === '流程表单' ? 'process' : 'receipt';

  const formResult = createForm(options.appId, formInfo.name, apiFields, apiFormType);

  // 4. 同步表单结构
  console.log('\n[4/4] 同步表单结构...');
  
  // 获取正确的项目根目录
  const correctProjectRoot = getCorrectProjectRoot(formFilePath);
  console.log(`  📂 项目根目录: ${correctProjectRoot}`);
  
  // 查找系统配置清单所在目录（用于更新配置清单）
  const systemConfigRoot = findProjectRoot(correctProjectRoot);
  
  if (!systemConfigRoot) {
    console.log('  ⚠️  找不到系统配置清单.md，将只创建表单文件');
  } else {
    console.log(`  📂 系统配置目录: ${systemConfigRoot}`);
  }
  
  // 在正确的项目根目录创建/更新表单文件
  syncFormSchema(correctProjectRoot, options.appId, formInfo.name, formInfo.type, formResult.formUuid, systemConfigRoot);

  // 5. 生成结果报告
  console.log('\n============================================================');
  console.log('[添加完成]');
  console.log('============================================================');
  console.log(`\n应用信息:`);
  console.log(`  应用ID: ${options.appId}`);
  if (options.appName) {
    console.log(`  应用名称: ${options.appName}`);
  }
  console.log(`\n表单信息:`);
  console.log(`  表单名称: ${formInfo.name}「${formInfo.type}」`);
  console.log(`  表单UUID: ${formResult.formUuid}`);
  console.log(`  访问地址: ${formResult.url}`);
  console.log(`  字段数量: ${formInfo.fields.length} 个主表字段`);
  if (formInfo.subTables.length > 0) {
    console.log(`  子表数量: ${formInfo.subTables.length} 个`);
  }

  console.log('\n📁 本地文件:');
  const formDirName = `${formInfo.name}「${formInfo.type}」`;
  console.log(`  表单目录: ${path.join(correctProjectRoot, formDirName)}`);
  console.log(`  - ${formDirName}.json`);
  console.log(`  - 组件ID清单.md`);
  console.log(`  - 表单结构变更.md`);
  if (systemConfigRoot) {
    console.log(`  系统配置清单: ${path.join(systemConfigRoot, '系统配置清单.md')}`);
  }
  
  console.log('\n📋 下一步操作:');
  console.log('  1. 登录宜搭平台查看新创建的表单');
  console.log('  2. 如有关联表单字段，请在宜搭平台手动配置关联关系');
  console.log('  3. 如需添加更多表单，请再次运行此命令');

  console.log('\n============================================================\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ 执行失败:', error.message);
    process.exit(1);
  });
}
