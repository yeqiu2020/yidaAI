/**
 * 统一同步所有配置
 * 版本: 2.9.1
 * 更新日期: 2026-05-17
 *
 * 更新内容:
 * - v2.9.1: 调用sync_config.js v3.7.1+，确保新建应用也能获取流程Code
 *          - 同步时自动补充获取流程表单的流程Code
 * - v2.9.0: 系统配置清单表格添加"流程Code"列
 *          - 调用sync_config.js v3.7.0+生成包含流程Code的系统配置清单
 *          - 流程表单自动获取并写入流程Code
 * - v2.8.0: 【彻底禁用分组】所有表单直接放在项目根目录
 *          - findFormDirectory 只在根目录查找，移除分组目录查找逻辑
 *          - 不再查找 02-09 等分组目录
 *          - 所有表单统一放在项目根目录下
 * - v2.7.0: 移除「未分组表单」目录逻辑，表单直接在项目根目录下创建
 *
 * 更新内容:
 * - 新增步骤5：同步完成后自动更新组织及应用信息.md 中的原型页面访问地址
 *   - 自动添加或更新应用的原型页面访问链接
 *   - 更新最后更新时间
 *
 * 历史版本:
 * v2.5.0 (2026-04-29) - 修复字段清单生成：支持新的组件ID清单格式（主表和子表分开）
 *   - 正确解析主表字段和子表字段
 *   - 子表字段按子表名称分组显示
 *   - 修复错误的"主表字段"/"子表字段"行问题
 * - 修复组件ID清单格式：主表字段和子表字段分开为独立的表格
 *   - 与字段清单.md格式保持一致
 *   - 主表字段单独一个表格
 *   - 每个子表字段单独一个表格，标题为"子表：XXX"
 * v2.4.0 (2026-04-29) - 修复组件ID清单格式
 * v2.3.0 (2026-04-28) - 新增步骤4：从组件ID清单生成 form-config-data.js
 * v2.2.1 (2026-04-28) - 修复目录创建逻辑：统一使用「普通表单」/「流程表单」作为类型名称
 * v2.2.0 (2026-04-17) - 修复组件ID清单生成：支持提取子表内的字段
 * v2.1.0 (2026-03-15) - 修复应用ID解析：兼容带转义符的格式（APP\_XXX）和正常格式（APP_XXX）
 * v2.0.0 (2026-03-12) - 改为从系统配置清单读取应用ID和表单UUID
 * 
 * 功能: 一键同步系统配置清单和所有表单的组件ID，直接覆盖原JSON文件
 * 用法: node sync_all_configs.js <项目目录> [应用ID]
 * 示例: node sync_all_configs.js "../../../进销存管理"
 * 
 * 说明:
 * - 如果提供了应用ID，则使用该ID
 * - 如果没有提供应用ID，则从系统配置清单读取
 * - 表单UUID列表从系统配置清单读取
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 引入同步工具模块
const { generateComponentList } = require('./sync-utils');

// 脚本路径
const CONFIG_SYNC_SCRIPT = path.join(__dirname, 'sync_config.js');
const SCHEMA_SYNC_SCRIPT = path.join(__dirname, '..', '..', 'yida-get-schema', 'scripts', 'sync-schema.js');
const PROTOTYPE_GENERATOR_SCRIPT = path.join(__dirname, '..', '..', 'form-to-prototype', 'scripts', 'prototype_generator.js');

/**
 * 组件类型中文映射表
 */
const COMPONENT_TYPE_MAP = {
  'TextField': '单行文本',
  'TextareaField': '多行文本',
  'NumberField': '数值',
  'SelectField': '下拉单选',
  'MultiSelectField': '下拉多选',
  'RadioField': '单选',
  'CheckboxField': '多选',
  'DateField': '日期',
  'DateRangeField': '日期范围',
  'EmployeeField': '成员',
  'DepartmentField': '部门',
  'DepartmentSelectField': '部门',
  'AssociationFormField': '关联表单',
  'AssociationFormMultiSelectField': '关联表单多选',
  'ImageField': '图片',
  'AttachmentField': '附件',
  'TableField': '子表单',
  'SerialNumberField': '流水号',
  'SubformField': '关联子表单',
  'AddressField': '地址',
  'LocationField': '定位',
  'CascadeSelectField': '级联选择',
  'TreeSelectField': '树形选择',
  'ColumnsLayout': '列布局',
  'Column': '列',
  'Button': '按钮'
};

/**
 * 从系统配置清单解析应用ID
 * @param {string} configPath - 系统配置清单路径
 * @returns {string|null} 应用ID
 */
function parseAppIdFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  const content = fs.readFileSync(configPath, 'utf-8');
  // 兼容多种格式：应用编码、应用ID，以及带转义符的格式
  const appIdMatch = content.match(/\|\s*\*\*(?:应用编码|应用ID)\*\*\s*\|\s*`?(APP[_\\]*[A-Z0-9_\\]+)`?\s*\|/);
  if (appIdMatch) {
    // 去除可能的转义符
    return appIdMatch[1].replace(/\\/g, '');
  }
  return null;
}

/**
 * 从系统配置清单解析表单列表
 * @param {string} configPath - 系统配置清单路径
 * @returns {Array} 表单列表
 */
function parseFormsFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const forms = [];

  // 匹配表单表格行 - 支持两种格式
  // 格式1: | 序号 | 页面名称「类型」 | 页面编码（表单UUID） |
  // 格式2: | 序号 | 表单名称 | 表单类型 | 表单UUID | 备注 |

  // 先尝试格式1（新格式）
  const formRegexV1 = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*「([^|]+?)」\s*\|\s*([A-Z0-9-]+)\s*\|/g;
  let match;
  let matched = false;

  while ((match = formRegexV1.exec(content)) !== null) {
    forms.push({
      index: parseInt(match[1]),
      formName: match[2].trim(),
      formType: match[3].trim(),
      formUuid: match[4].trim()
    });
    matched = true;
  }

  // 如果格式1没有匹配到，尝试格式2（旧格式）
  if (!matched) {
    const formRegexV2 = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*「([^|]+?)」\s*\|\s*(?:普通|流程)\s*\|\s*([A-Z0-9-]+)\s*\|/g;
    while ((match = formRegexV2.exec(content)) !== null) {
      forms.push({
        index: parseInt(match[1]),
        formName: match[2].trim(),
        formType: match[3].trim(),
        formUuid: match[4].trim()
      });
    }
  }

  return forms;
}

/**
 * 查找表单目录
 * 只在项目根目录查找，不查找任何分组目录
 * @param {string} formName - 表单名称
 * @param {string} baseDir - 基础目录
 * @param {string} formType - 表单类型（普通表单/流程表单）
 * @returns {string|null} 表单目录路径
 */
function findFormDirectory(formName, baseDir, formType = '普通表单') {
  // 将 formType 转换为文件夹名称格式
  const expectedFolderName = `${formName}「${formType}」`;
  
  // 1. 在项目根目录精确查找
  const rootFormPath = path.join(baseDir, expectedFolderName);
  if (fs.existsSync(rootFormPath)) {
    return rootFormPath;
  }
  
  // 2. 在根目录下模糊查找（兼容不同命名）
  const rootItems = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const item of rootItems) {
    if (item.isDirectory() && item.name.includes(formName) && 
        (item.name.includes('普通表单') || item.name.includes('流程表单'))) {
      return path.join(baseDir, item.name);
    }
  }

  return null;
}

// 注意：generateComponentList 函数已从 sync-utils.js 引入

/**
 * 从组件ID清单生成字段清单
 * @param {string} projectRoot - 项目根目录
 * @param {Array} forms - 表单列表
 * @param {string} outputPath - 输出文件路径
 */
function generateFieldListFromComponents(projectRoot, forms, outputPath, appName) {
  // 确保目录存在
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let content = `# ${appName || path.basename(projectRoot)} - 字段清单\n\n`;
  content += `> 版本: 1.0.0\n`;
  content += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
  content += `> 生成方式: 从宜搭平台同步自动生成\n\n`;
  content += `---\n\n`;
  content += `## 一、业务表单\n\n`;

  const numberMap = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六'];
  let formIndex = 1;

  for (const form of forms) {
    const formName = form.formName;
    const formType = form.formType.includes('流程') ? '流程表单' : '普通表单';
    const indexStr = numberMap[formIndex - 1] || formIndex;

    content += `### (${indexStr}) ${formName}「${formType}」\n\n`;

    // 查找组件ID清单文件
    const formDir = findFormDirectory(formName, projectRoot, form.formType);
    if (formDir) {
      const componentMdPath = path.join(formDir, '组件ID清单.md');
      if (fs.existsSync(componentMdPath)) {
        const componentContent = fs.readFileSync(componentMdPath, 'utf-8');

        // 解析新的组件ID清单格式（主表字段和子表字段分开的表格）
        const sections = parseComponentMd(componentContent);

        if (sections.mainFields.length > 0 || sections.subTables.length > 0) {
          // 主表字段
          if (sections.mainFields.length > 0) {
            content += `**主表字段：**\n\n`;
            content += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
            content += `|---------|---------|---------|---------|---------|\n`;

            for (const row of sections.mainFields) {
              content += `| ${row.fieldName} | ${row.componentType} | 组件ID: ${row.fieldId} | 新增 | 否 |\n`;
            }
            content += `\n`;
          }

          // 子表字段
          for (const subTable of sections.subTables) {
            content += `**子表：${subTable.name}**\n\n`;
            content += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
            content += `|---------|---------|---------|---------|---------|\n`;

            for (const row of subTable.fields) {
              content += `| ${row.fieldName} | ${row.componentType} | 组件ID: ${row.fieldId} | 新增 | 否 |\n`;
            }
            content += `\n`;
          }

          const totalFields = sections.mainFields.length + sections.subTables.reduce((sum, st) => sum + st.fields.length, 0);
          content += `**字段数量**: ${totalFields} 个\n\n`;
        } else {
          content += `> 暂无字段信息\n\n`;
        }
      } else {
        content += `> 组件ID清单不存在\n\n`;
      }
    } else {
      content += `> 未找到表单目录\n\n`;
    }

    content += `---\n\n`;
    formIndex++;
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`   ✅ 字段清单已生成: ${outputPath}`);
}

/**
 * 解析组件ID清单Markdown内容
 * 支持新的格式（主表字段和子表字段分开的表格）
 * @param {string} mdContent - Markdown内容
 * @returns {Object} 解析结果 {mainFields: Array, subTables: Array}
 */
function parseComponentMd(mdContent) {
  const result = {
    mainFields: [],
    subTables: []
  };

  const lines = mdContent.split('\n');
  let currentSection = null; // 'main' 或 'subTable'
  let currentSubTableName = null;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检测主表字段部分
    if (line === '## 📋 主表字段') {
      currentSection = 'main';
      currentSubTableName = null;
      inTable = false;
      continue;
    }

    // 检测子表部分
    if (line.startsWith('## 📋 子表：')) {
      currentSection = 'subTable';
      currentSubTableName = line.replace('## 📋 子表：', '').trim();
      inTable = false;
      continue;
    }

    // 检测表格分隔行（支持多种格式）
    if (line.match(/^\|[\s\-:]+\|/) && line.includes('-')) {
      inTable = true;
      continue;
    }

    // 解析表格数据行
    if (inTable && line.startsWith('|') && line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 4 && !cells[0].match(/^(序号|--+)$/)) {
        const row = {
          index: cells[0],
          componentType: cells[1],
          fieldName: cells[2],
          fieldId: cells[3]
        };

        if (currentSection === 'main') {
          result.mainFields.push(row);
        } else if (currentSection === 'subTable' && currentSubTableName) {
          // 查找或创建子表
          let subTable = result.subTables.find(st => st.name === currentSubTableName);
          if (!subTable) {
            subTable = { name: currentSubTableName, fields: [] };
            result.subTables.push(subTable);
          }
          subTable.fields.push(row);
        }
      }
    }
  }

  return result;
}

/**
 * 从组件ID清单生成 form-config-data.js
 * 使用真实的组件ID，覆盖原型生成器生成的假数据
 * 支持新的组件ID清单格式（主表和子表分开的表格）
 * 
 * 关键修复（v2.5.0）：当遇到 ## 📋 子表：XXX 标记时，
 * 自动插入子表容器字段（componentType: '子表单'），
 * 确保运行时 groupFields() 能正确识别并创建 tableGroup。
 * 
 * @param {string} projectRoot - 项目根目录
 * @param {Array} forms - 表单列表
 */
function generateFormConfigDataFromComponents(projectRoot, forms) {
  const typeMap = {
    '单行文本': 'TextField',
    '多行文本': 'TextareaField',
    '数值': 'NumberField',
    '日期': 'DateField',
    '日期时间': 'DateField',
    '单选': 'RadioField',
    '复选': 'CheckboxField',
    '下拉复选': 'CheckboxField',
    '下拉单选': 'SelectField',
    '关联表单': 'AssociationFormField',
    '成员': 'EmployeeField',
    '部门': 'DepartmentSelectField',
    '附件': 'AttachmentField',
    '图片': 'ImageField',
    '流水号': 'SerialNumberField',
    '子表': 'TableField',
    '子表单': 'TableField',
    '评分': 'RateField'
  };

  const formConfigData = {};

  for (const form of forms) {
    const formName = form.formName;
    const formDir = findFormDirectory(formName, projectRoot, form.formType);

    if (!formDir) {
      console.log(`   ⚠️  未找到表单目录: ${formName}`);
      continue;
    }

    const componentMdPath = path.join(formDir, '组件ID清单.md');
    if (!fs.existsSync(componentMdPath)) {
      console.log(`   ⚠️  组件ID清单不存在: ${formName}`);
      continue;
    }

    const componentContent = fs.readFileSync(componentMdPath, 'utf-8');
    const fields = [];
    let mainIndex = 0;  // 主表全局序号计数器

    // 解析新的组件ID清单格式（主表和子表分开的表格）
    const lines = componentContent.split('\n');
    let inTable = false;
    let currentSection = 'main'; // 'main' 或 'subTable'
    let currentSubTableName = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 检测主表字段部分
      if (trimmedLine === '## 📋 主表字段') {
        currentSection = 'main';
        currentSubTableName = null;
        inTable = false;
        continue;
      }

      // 检测子表部分 → 插入子表容器字段（关键修复！）
      if (trimmedLine.startsWith('## 📋 子表：')) {
        currentSection = 'subTable';
        currentSubTableName = trimmedLine.replace('## 📋 子表：', '').trim();
        mainIndex++;  // 子表容器占用一个主表序号

        // 关键：插入子表容器字段，让运行时 groupFields() 能识别并创建 tableGroup
        fields.push({
          index: String(mainIndex),
          componentType: '子表单',
          fieldName: currentSubTableName,
          fieldId: 'tableField_' + currentSubTableName
        });

        inTable = false;
        continue;
      }

      // 检测表格开始（兼容前后有空格的情况，如 |  序号 |）
      if (trimmedLine.replace(/\s/g, '').startsWith('|序号|')) {
        inTable = true;
        continue;
      }

      // 跳过分隔行
      if (trimmedLine.match(/^\|[\s\-:]+\|/) && trimmedLine.includes('-')) {
        continue;
      }

      // 解析表格行
      if (inTable && trimmedLine.startsWith('|') && trimmedLine.includes('|')) {
        const cells = trimmedLine.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 4 && cells[0] !== '序号' && /^\d+$/.test(cells[0])) {
          const componentType = typeMap[cells[1]] || 'TextField';
          const field = {
            componentType: componentType,
            fieldName: cells[2],
            fieldId: cells[3].replace(/\\_/g, '_')
          };

          if (currentSection === 'subTable' && currentSubTableName) {
            // 子表字段：使用 "容器序号.子表内序号" 格式，并标记 isSubTableField
            field.index = String(mainIndex) + '.' + cells[0];
            field.isSubTableField = true;
            field.subTableName = currentSubTableName;
          } else {
            // 主表字段
            mainIndex++;
            field.index = String(mainIndex);
          }

          fields.push(field);
        }
      }
    }

    if (fields.length > 0) {
      formConfigData[formName] = {
        formName: formName,
        fields: fields
      };
      console.log(`   ✅ ${formName}: ${fields.length} 个字段`);
    }
  }

  // 生成 JS 文件
  const outputDir = path.join(projectRoot, '01需求梳理', '原型页面', 'js');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'form-config-data.js');
  const jsContent = `// 表单静态配置数据（从组件ID清单自动生成）\n// 用于 file:// 协议下避免 CORS 跨域问题\n\nwindow.FormConfigData = ${JSON.stringify(formConfigData, null, 2)};\n`;

  fs.writeFileSync(outputFile, jsContent, 'utf-8');
  console.log(`   ✅ form-config-data.js 已生成: ${outputFile}`);
}

/**
 * 更新组织及应用信息.md 中的原型页面访问地址
 * 与 server_manager.js 的 updateOrgInfo() 保持完全一致的格式和逻辑
 * 核心原则：整体重建「原型页面访问地址」section，绝不触碰「应用列表」表格
 * @param {string} projectRoot - 项目根目录
 */
function updateOrgInfoPrototypeUrl(projectRoot) {
  const appName = path.basename(projectRoot);
  const HTTP_PORT = 8080;
  const orgInfoPath = path.join(process.cwd(), '组织及应用信息.md');
  
  if (!fs.existsSync(orgInfoPath)) {
    console.log(`   ⚠️  组织及应用信息.md 不存在: ${orgInfoPath}`);
    return;
  }
  
  let content = fs.readFileSync(orgInfoPath, 'utf-8');
  
  // 扫描项目根目录下所有有原型页面的应用
  const rootDir = process.cwd();
  const apps = [];
  const items = fs.readdirSync(rootDir);
  
  for (const item of items) {
    const appPath = path.join(rootDir, item);
    const prototypePath = path.join(appPath, '01需求梳理', '原型页面', 'index.html');
    
    if (fs.existsSync(prototypePath)) {
      apps.push({
        name: item,
        url: `http://127.0.0.1:${HTTP_PORT}/${item}/01需求梳理/原型页面/index.html`,
        synced: true
      });
    }
  }
  
  if (apps.length === 0) {
    console.log(`   ⚠️  未找到任何原型页面，跳过更新`);
    return;
  }
  
  // 构建原型页面section（与 server_manager.js 格式完全一致）
  const prototypeTable = apps.map(app =>
    `| ${app.name} | ${app.url} | ✅ 已同步 |`
  ).join('\n');
  
  const prototypeSection = `\n---\n\n## 原型页面访问地址\n\n> 以下地址需要在 HTTP 服务启动后访问\n> \n> 请勿使用 \`file://\` 协议打开，否则会导致同步配置功能失效\n\n| 应用名称 | 原型页面地址 | 本地状态 |\n|----------|-------------|----------|\n${prototypeTable}\n`;
  
  // 替换或新增 section（与 server_manager.js 逻辑一致）
  if (content.includes('## 原型页面访问地址')) {
    content = content.replace(/\n[*-]{3}\n\n## 原型页面访问地址[\s\S]*?(?=\n[*-]{3}\n\n## |$)/, prototypeSection);
    console.log(`   📝 更新原型页面访问地址 (${apps.length} 个应用)`);
  } else {
    content = content.replace(/\n[*-]{3}\n\n## 备注/, prototypeSection + '\n---\n\n## 备注');
    console.log(`   ➕ 新增原型页面访问地址section (${apps.length} 个应用)`);
  }
  
  const now = new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().split(' ')[0].substring(0, 5);
  content = content.replace(/\|\s*最后更新时间\s*\|\s*[^|]+\|/, `| 最后更新时间 | ${now} |`);
  
  fs.writeFileSync(orgInfoPath, content, 'utf-8');
  console.log(`   ✅ 已更新组织及应用信息.md`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('用法: node sync_all_configs.js <项目目录> [应用ID] [应用名称]');
    console.log('示例: node sync_all_configs.js "../../../进销存管理"');
    console.log('');
    console.log('说明:');
    console.log('  - 从系统配置清单读取应用ID和表单UUID');
    console.log('  - 如果提供了应用ID参数，则优先使用参数值');
    process.exit(1);
  }
  
  const projectRoot = path.resolve(args[0]);
  const configPath = path.join(projectRoot, '系统配置清单.md');
  
  // 如果项目目录不存在，自动创建
  if (!fs.existsSync(projectRoot)) {
    console.log(`📁 项目目录不存在，自动创建: ${projectRoot}`);
    fs.mkdirSync(projectRoot, { recursive: true });
  }
  
  // 获取应用ID（参数优先，其次从系统配置清单读取）
  let appId = args[1];
  let appName = args[2] || null;  // 第三个参数：应用名称（批量同步时传入）
  if (!appId) {
    appId = parseAppIdFromConfig(configPath);
  }
  
  if (!appId) {
    console.error('❌ 无法获取应用ID');
    console.error('  请确保:');
    console.error('  1. 提供了应用ID参数，或');
    console.error('  2. 项目目录下存在系统配置清单.md，且包含应用ID');
    process.exit(1);
  }
  
  console.log('============================================================');
  console.log('  统一同步所有配置');
  console.log('============================================================');
  console.log(`应用ID: ${appId}`);
  console.log(`项目目录: ${projectRoot}`);
  console.log('');
  
  // 步骤1：同步系统配置清单
  console.log('\n[步骤1/2] 同步系统配置清单...');
  console.log('------------------------------------------------------------');
  
  try {
    if (fs.existsSync(CONFIG_SYNC_SCRIPT)) {
      let syncCmd = `node "${CONFIG_SYNC_SCRIPT}" --appId "${appId}" --output "${projectRoot}"`;
      if (appName) {
        syncCmd += ` --appName "${appName}"`;
      }
      execSync(
        syncCmd,
        {
          encoding: 'utf-8',
          stdio: 'inherit',
          timeout: 300_000,
        }
      );
      console.log('✅ 系统配置清单同步完成');
    } else {
      console.log('⚠️  sync_config.js 脚本不存在，跳过');
    }
  } catch (error) {
    console.log(`⚠️  系统配置清单同步失败: ${error.message}`);
    console.log('继续同步表单结构...');
  }
  
  // 步骤2：同步所有表单结构
  console.log('\n[步骤2/3] 同步所有表单结构及组件ID...');
  console.log('------------------------------------------------------------');
  
  // 从系统配置清单读取表单列表
  const forms = parseFormsFromConfig(configPath);
  
  if (forms.length === 0) {
    console.error('❌ 未能从系统配置清单解析出表单');
    console.error(`  请检查文件: ${configPath}`);
    process.exit(1);
  }
  
  console.log(`表单数量: ${forms.length}`);
  console.log('');
  
  let syncedCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const formName = form.formName;
    const formType = form.formType;
    const formUuid = form.formUuid;
    
    console.log(`[${i + 1}/${forms.length}] 同步: ${formName}`);
    
    if (!formUuid) {
      console.log(`   ⚠️  找不到表单UUID，跳过`);
      failedCount++;
      continue;
    }
    
    let formDir = findFormDirectory(formName, projectRoot, formType);
    
    // 从目录名称中提取实际的表单类型
    let actualFormType = formType;
    if (formDir) {
      const dirName = path.basename(formDir);
      const typeMatch = dirName.match(/「(普通表单|流程表单)」/);
      if (typeMatch) {
        actualFormType = typeMatch[1];
      }
    }
    
    if (!formDir) {
      // 找不到表单目录，自动创建到项目根目录（不再使用未分组表单）
      console.log(`   📁 未找到表单目录，自动创建...`);
      
      // 统一使用「普通表单」/「流程表单」作为类型名称
      const typeStr = formType.includes('流程') ? '流程表单' : '普通表单';
      actualFormType = typeStr;
      const folderName = `${formName}「${typeStr}」`;
      formDir = path.join(projectRoot, folderName);
      
      // 创建表单目录
      if (!fs.existsSync(formDir)) {
        fs.mkdirSync(formDir, { recursive: true });
        console.log(`     📁 创建表单目录：${folderName}`);
      }
    }
    
    // 构建原JSON文件路径（使用实际的表单类型）
    const jsonFileName = `${formName}「${actualFormType}」.json`;
    const jsonFilePath = path.join(formDir, jsonFileName);
    
    try {
      execSync(
        `node "${SCHEMA_SYNC_SCRIPT}" "${appId}" "${formUuid}" "${jsonFilePath}"`,
        {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 120_000,
        }
      );
      
      generateComponentList(formDir, formName, actualFormType, jsonFilePath);
      
      console.log(`   ✅ 完成`);
      syncedCount++;
    } catch (error) {
      console.log(`   ❌ 失败: ${error.message}`);
      failedCount++;
    }
  }
  
  // 步骤3：生成原型页面
  console.log('\n[步骤3/3] 生成原型页面...');
  console.log('------------------------------------------------------------');
  
  try {
    // 生成字段清单
    const fieldListPath = path.join(projectRoot, '01需求梳理', '字段清单.md');
    const prototypeOutputDir = path.join(projectRoot, '01需求梳理', '原型页面');
    
    // 从组件ID清单生成字段清单
    generateFieldListFromComponents(projectRoot, forms, fieldListPath, appName);
    
    // 调用原型生成器
    if (fs.existsSync(PROTOTYPE_GENERATOR_SCRIPT)) {
      execSync(
        `node "${PROTOTYPE_GENERATOR_SCRIPT}" "${fieldListPath}" "${prototypeOutputDir}"`,
        {
          encoding: 'utf-8',
          stdio: 'inherit',
          timeout: 60_000,
        }
      );
      console.log('✅ 原型页面生成完成');
    } else {
      console.log('⚠️  prototype_generator.js 脚本不存在，跳过原型生成');
    }
  } catch (error) {
    console.log(`⚠️  原型页面生成失败: ${error.message}`);
  }

  // 步骤4：从组件ID清单生成正确的 form-config-data.js（覆盖原型生成器的假数据）
  console.log('\n[步骤4/4] 生成静态配置数据...');
  console.log('------------------------------------------------------------');
  try {
    generateFormConfigDataFromComponents(projectRoot, forms);
    console.log('✅ 静态配置数据生成完成');
  } catch (error) {
    console.log(`⚠️  静态配置数据生成失败: ${error.message}`);
  }

  // 步骤5：更新组织及应用信息.md 中的原型页面访问地址
  console.log('\n[步骤5/5] 更新组织及应用信息...');
  console.log('------------------------------------------------------------');
  try {
    updateOrgInfoPrototypeUrl(projectRoot);
    console.log('✅ 组织及应用信息已更新');
  } catch (error) {
    console.log(`⚠️  更新组织及应用信息失败: ${error.message}`);
  }
  
  console.log('\n============================================================');
  console.log('  同步完成');
  console.log('============================================================');
  console.log(`系统配置清单: ${fs.existsSync(configPath) ? '✅ 已更新' : '❌ 失败'}`);
  console.log(`表单结构同步: ✅ ${syncedCount} 个`);
  if (failedCount > 0) {
    console.log(`              ⚠️  ${failedCount} 个失败`);
  }
  console.log('');
  
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('❌ 执行失败:', error.message);
  process.exit(1);
});
