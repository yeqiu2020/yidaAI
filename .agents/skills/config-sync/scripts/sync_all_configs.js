/**
 * 统一同步所有配置
 * 版本: 2.10.2
 * 更新日期: 2026-08-05
 *
 * 更新内容:
 * - v2.10.2: 【修复】cleanupEmptyGroups 误删 API 中的空分组
 *            问题：cleanupEmptyGroups 只根据 forms 数组判断保留哪些分组，
 *                 但空分组没有表单，不在 forms 中，导致被误删。
 *            修复：1. 从 sync_config.js 导入 buildGroupTree
 *                  2. 在 cleanupEmptyGroups 前调用导航 API 获取空分组路径
 *                  3. 将空分组路径传入 cleanupEmptyGroups 防止被误删
 *
 * - v2.10.1: 【新增】支持多层次嵌套分组目录
 *            问题：sync_config.js v3.13.0 支持了多层次分组（分组内有分组），
 *                 但 sync_all_configs.js 的查找和创建逻辑未同步更新。
 *            修复：1. 新增 modulePathToDirPath 函数，将全路径转为嵌套目录路径
 *                  2. findFormDirectory 支持嵌套分组路径查找
 *                  3. 表单目录创建时使用嵌套分组路径
 *                  4. 表单重命名/移动逻辑使用嵌套分组路径
 *
 * - v2.9.1: 调用sync_config.js v3.7.1+，确保新建应用也能获取流程Code
 * - v2.9.0: 系统配置清单表格添加"流程Code"列
 *          - 调用sync_config.js v3.7.0+生成包含流程Code的系统配置清单
 *          - 流程表单自动获取并写入流程Code
 * - v2.10.0: 【修复分组冲突】与 sync_config.js v3.8.0+ 分组逻辑对齐
 *           - 问题：sync_config.js v3.8.0+ 恢复分组功能，在分组子目录创建表单目录
 *                  而 sync_all_configs.js v2.8.0 禁用分组只在根目录查找，导致同一表单被创建两次
 *           - 修复：parseFormsFromConfig 解析「所属分组」列（module 字段）
 *                  findFormDirectory 支持在分组子目录中查找表单目录
 *                  主循环按 module 字段在分组子目录中创建表单目录
 *                  新增步骤6：清理根目录下的重复表单目录（已迁移到分组子目录的）
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

// 引入 api-client 的模块（与 sync_config.js 使用相同的 API 调用方式）
const {
  loadCookieData,
  resolveBaseUrl,
  resolveCorpId,
  requestWithAutoLogin,
  getRequest,
  buildApiPath
} = require('../../api-client/scripts/api_client.js');

// 引入 form_manager 的 getFormSchema 函数（替代独立的 get-schema.js）
const { getFormSchema } = require('../../api-client/scripts/form_manager.js');

// 脚本路径
const CONFIG_SYNC_SCRIPT = path.join(__dirname, 'sync_config.js');
const PROTOTYPE_GENERATOR_SCRIPT = path.join(__dirname, '..', '..', 'form-to-prototype', 'scripts', 'prototype_generator.js');

// v2.11.0: 引入 form-scanner（UUID 表单目录匹配引擎，与 sync_server.js / sync_single_form.js 共享同一套逻辑）
const {
  scanLocalFormDirs,
  cleanupDeletedForms,
  cleanupEmptyGroups,
  cleanupOrphanRootFormDirs,
} = require('../../../../lib/sync-server/form-scanner');

// v2.10.2: 引入 sync_config.js 的 buildGroupTree 函数，用于获取 API 中的空分组路径
const { buildGroupTree } = require('./sync_config.js');

/**
 * 清理 Schema，转换为 nodeSchema 格式（与 sync-schema.js 保持一致）
 */
function cleanSchema(schema) {
  if (!schema || !schema.pages || !Array.isArray(schema.pages)) {
    return schema;
  }

  const page = schema.pages[0];
  if (!page) return schema;

  // 提取 FormContainer 下的组件树
  const componentsTree = page.componentsTree || [];
  const pageComponent = componentsTree.find(comp => comp.componentName === 'Page');
  if (!pageComponent || !pageComponent.children) return schema;

  const rootContent = pageComponent.children.find(comp => comp.componentName === 'RootContent');
  if (!rootContent || !rootContent.children) return schema;

  const formContainer = rootContent.children.find(comp => comp.componentName === 'FormContainer');
  if (!formContainer || !formContainer.children) return schema;

  // 清理组件树（移除运行时属性）
  function cleanComponentsTree(components) {
    if (!Array.isArray(components)) return components;
    return components.map(comp => {
      if (!comp || !comp.componentName) return comp;
      const cleaned = {
        componentName: comp.componentName,
        props: comp.props ? { ...comp.props } : {},
        condition: comp.condition !== undefined ? comp.condition : true,
        hidden: comp.hidden !== undefined ? comp.hidden : false,
        title: comp.title || '',
        isLocked: comp.isLocked !== undefined ? comp.isLocked : false,
        conditionGroup: comp.conditionGroup || ''
      };
      if (comp.id) cleaned.id = comp.id;
      if (comp.css) cleaned.css = comp.css;
      // 移除运行时属性
      delete cleaned.props.gmtModified;
      delete cleaned.props.gmtCreate;
      delete cleaned.props.creator;
      delete cleaned.props.modifier;
      delete cleaned.props.tenantId;
      // 递归清理子组件
      if (comp.children && Array.isArray(comp.children)) {
        cleaned.children = cleanComponentsTree(comp.children);
      }
      return cleaned;
    });
  }

  return {
    type: 'nodeSchema',
    componentsMap: {},
    componentsTree: cleanComponentsTree(formContainer.children)
  };
}

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
  const appIdMatch = content.match(/\|\s*(?:\*\*)?(?:应用编码|应用ID)(?:\*\*)?\s*\|\s*`?(APP[_\\]*[A-Z0-9_\\]+)`?\s*\|/);
  if (appIdMatch) {
    // 去除可能的转义符
    return appIdMatch[1].replace(/\\/g, '');
  }
  return null;
}

/**
 * 从系统配置清单解析表单列表
 * v2.10.0: 支持解析「所属分组」列（module 字段），与 sync_config.js v3.8.0+ 对齐
 * @param {string} configPath - 系统配置清单路径
 * @returns {Array} 表单列表，每项包含 formName, formType, formUuid, module
 */
function parseFormsFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const forms = [];

  // 匹配表单表格行 - 支持4列和5列格式
  // 4列（旧）: | 序号 | 页面名称「类型」 | 表单UUID | 流程Code |
  // 5列（新）: | 序号 | 页面名称「类型」 | 表单UUID | 流程Code | 所属分组 |
  const formRegex = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*「([^|]+?)」\s*\|\s*([A-Z0-9-]+)\s*\|\s*([^|]*)\s*\|(\s*([^|]*?)\s*\|)?/g;
  let match;

  while ((match = formRegex.exec(content)) !== null) {
    // 注意：match[6] 是可选的第6组（含尾部|），match[7] 才是真正的分组名称
    const moduleValue = match[7] ? match[7].trim() || null : null;
    forms.push({
      index: parseInt(match[1]),
      formName: match[2].trim(),
      formType: match[3].trim(),
      formUuid: match[4].trim(),
      module: (moduleValue && moduleValue !== '-') ? moduleValue : null
    });
  }

  return forms;
}

/**
 * 将分组的全路径转换为带「分组」后缀的目录路径
 * v2.10.1: 新增，支持多层次嵌套
 * 例: "业务规则分组/1.主表操作主表" → "业务规则分组「分组」/1.主表操作主表「分组」"
 */
function modulePathToDirPath(baseDir, modulePath) {
  if (!modulePath) return baseDir;
  const parts = modulePath.split('/');
  let currentDir = baseDir;
  for (const part of parts) {
    currentDir = path.join(currentDir, `${part}「分组」`);
  }
  return currentDir;
}

/**
 * 查找表单目录
 * v2.10.1: 支持多层次嵌套分组路径
 * 优先在分组子目录中查找（如果有 module 信息），然后在根目录查找
 * @param {string} formName - 表单名称
 * @param {string} baseDir - 基础目录
 * @param {string} formType - 表单类型（普通表单/流程表单）
 * @param {string|null} module - 所属分组全路径（可选，如"业务规则分组/1.主表操作主表"）
 * @returns {string|null} 表单目录路径
 */
function findFormDirectory(formName, baseDir, formType = '普通表单', module = null) {
  const expectedFolderName = `${formName}「${formType}」`;

  // 1. 如果有分组信息，优先在嵌套分组子目录中查找
  if (module) {
    // v2.10.1: 使用 modulePathToDirPath 构建嵌套分组目录路径
    const groupDir = modulePathToDirPath(baseDir, module);
    if (fs.existsSync(groupDir)) {
      // 精确匹配
      const groupFormPath = path.join(groupDir, expectedFolderName);
      if (fs.existsSync(groupFormPath)) {
        return groupFormPath;
      }
      // 模糊查找
      try {
        const groupItems = fs.readdirSync(groupDir, { withFileTypes: true });
        for (const item of groupItems) {
          if (item.isDirectory() && item.name.includes(formName) &&
              (item.name.includes('普通表单') || item.name.includes('流程表单'))) {
            return path.join(groupDir, item.name);
          }
        }
      } catch (_) {} // 有意忽略：目录扫描失败时返回 null，调用方有 fallback
    }
    // 向后兼容：旧版单层分组目录（不带「分组」后缀）
    if (!module.includes('/')) {
      const oldGroupDir = path.join(baseDir, module);
      if (fs.existsSync(oldGroupDir)) {
        const groupFormPath = path.join(oldGroupDir, expectedFolderName);
        if (fs.existsSync(groupFormPath)) {
          return groupFormPath;
        }
      }
    }
  }

  // 2. 在项目根目录精确查找
  if (fs.existsSync(baseDir)) {
    const rootFormPath = path.join(baseDir, expectedFolderName);
    if (fs.existsSync(rootFormPath)) {
      return rootFormPath;
    }

    // 3. 在根目录下模糊查找（兼容不同命名）
    try {
      const rootItems = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const item of rootItems) {
        if (item.isDirectory() && item.name.includes(formName) &&
            (item.name.includes('普通表单') || item.name.includes('流程表单'))) {
          return path.join(baseDir, item.name);
        }
      }
    } catch (_) {} // 有意忽略：目录扫描失败时返回 null，调用方有 fallback
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

  const numberMap = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六'];
  let formIndex = 1;

  // v2.10.0: 按实际分组组织字段清单，与目录结构一致
  // prototype_generator.js 通过 ## 一、模块名 标题解析分组
  // 未分组表单放在所有 ## 段落之前，module 为空字符串

  // 辅助函数：生成单个表单的字段清单内容
  function generateFormSection(form) {
    const formName = form.formName;
    const formType = form.formType.includes('流程') ? '流程表单' : '普通表单';
    const indexStr = numberMap[formIndex - 1] || formIndex;

    let section = `### (${indexStr}) ${formName}「${formType}」\n\n`;

    // 查找组件ID清单文件
    const formDir = findFormDirectory(formName, projectRoot, form.formType, form.module);
    if (formDir) {
      const componentMdPath = path.join(formDir, '组件ID清单.md');
      if (fs.existsSync(componentMdPath)) {
        const componentContent = fs.readFileSync(componentMdPath, 'utf-8');

        // 解析新的组件ID清单格式（主表字段和子表字段分开的表格）
        const sections = parseComponentMd(componentContent);

        if (sections.mainFields.length > 0 || sections.subTables.length > 0) {
          // 主表字段
          if (sections.mainFields.length > 0) {
            section += `**主表字段：**\n\n`;
            section += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
            section += `|---------|---------|---------|---------|---------|\n`;

            for (const row of sections.mainFields) {
              section += `| ${row.fieldName} | ${row.componentType} | 组件ID: ${row.fieldId} | 新增 | 否 |\n`;
            }
            section += `\n`;
          }

          // 子表字段
          for (const subTable of sections.subTables) {
            section += `**子表：${subTable.name}**\n\n`;
            section += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
            section += `|---------|---------|---------|---------|---------|\n`;

            for (const row of subTable.fields) {
              section += `| ${row.fieldName} | ${row.componentType} | 组件ID: ${row.fieldId} | 新增 | 否 |\n`;
            }
            section += `\n`;
          }

          const totalFields = sections.mainFields.length + sections.subTables.reduce((sum, st) => sum + st.fields.length, 0);
          section += `**字段数量**: ${totalFields} 个\n\n`;
        } else {
          section += `> 暂无字段信息\n\n`;
        }
      } else {
        section += `> 组件ID清单不存在\n\n`;
      }
    } else {
      section += `> 未找到表单目录\n\n`;
    }

    section += `---\n\n`;
    formIndex++;
    return section;
  }

  // 分离未分组和已分组的表单
  const ungroupedForms = forms.filter(f => !f.module);
  const groupedForms = forms.filter(f => f.module);

  // 收集所有分组名（保持顺序）
  const moduleOrder = [];
  for (const f of groupedForms) {
    if (!moduleOrder.includes(f.module)) {
      moduleOrder.push(f.module);
    }
  }

  // 先输出未分组表单（无 ## 段落头，prototype_generator 会将 module 设为空字符串）
  for (const form of ungroupedForms) {
    content += generateFormSection(form);
  }

  // 按分组输出
  for (let mi = 0; mi < moduleOrder.length; mi++) {
    const moduleName = moduleOrder[mi];
    const moduleNum = numberMap[mi] || (mi + 1);
    content += `## ${moduleNum}、${moduleName}\n\n`;

    const moduleForms = groupedForms.filter(f => f.module === moduleName);
    for (const form of moduleForms) {
      content += generateFormSection(form);
    }
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
    const formDir = findFormDirectory(formName, projectRoot, form.formType, form.module);

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
  
  // 初始化登录态（与 sync_config.js 使用同一 API 调用方式）
  console.log('🔑 检查登录态...');
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error('❌ 未找到登录态，请先运行登录脚本或通过服务端触发登录');
    process.exit(1);
  }
  const authRef = {
    cookieData,
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    corpId: resolveCorpId(cookieData)
  };
  console.log(`   ✅ 登录态就绪 (${authRef.baseUrl})`);
  
  // 步骤1：同步系统配置清单（从宜搭平台获取最新表单列表）
  console.log('\n[步骤1/2] 同步系统配置清单...');
  console.log('------------------------------------------------------------');
  
  // 记录系统配置清单的修改时间，用于判断步骤1是否成功更新
  let configModifiedBefore = false;
  if (fs.existsSync(configPath)) {
    configModifiedBefore = fs.statSync(configPath).mtimeMs;
  }
  
  let step1Success = false;
  try {
    if (fs.existsSync(CONFIG_SYNC_SCRIPT)) {
      let syncCmd = `node "${CONFIG_SYNC_SCRIPT}" --appId "${appId}" --output "${projectRoot}" --update --skip-schema`;
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
      step1Success = true;
    } else {
      console.log('⚠️  sync_config.js 脚本不存在，跳过');
    }
  } catch (error) {
    console.log(`⚠️  系统配置清单同步失败: ${error.message}`);
  }
  
  // 检查步骤1是否真正更新了系统配置清单（即使 execSync 抛异常，文件可能已被更新）
  if (!step1Success && fs.existsSync(configPath)) {
    const configModifiedAfter = fs.statSync(configPath).mtimeMs;
    if (configModifiedAfter !== configModifiedBefore) {
      console.log('✅ 检测到系统配置清单已被更新（尽管步骤1报告失败）');
      step1Success = true;
    }
  }
  
  if (!step1Success) {
    // 步骤1彻底失败且没有更新系统配置清单，使用旧数据继续（但会明确告知用户）
    if (!fs.existsSync(configPath)) {
      console.error('❌ 系统配置清单不存在且步骤1失败，无法继续同步');
      process.exit(1);
    }
    console.log('⚠️  将使用现有的系统配置清单继续同步（可能不包含宜搭平台上的最新表单）');
    console.log('⚠️  如需同步新增的表单，请检查登录态后重新点击同步按钮');
  }
  
  // 步骤2：同步所有表单结构
  console.log('\n[步骤2/3] 同步所有表单结构及组件ID...');
  console.log('------------------------------------------------------------');
  
  // 从系统配置清单读取表单列表
  const forms = parseFormsFromConfig(configPath);
  
  // v2.11.0: 扫描本地已有表单目录，用于按 UUID 匹配改名、清理已删除表单
  const localForms = scanLocalFormDirs(projectRoot);
  
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
    
    // v2.11.0: 优先用 formUuid 在本地已扫描结果中匹配（正确处理表单改名/移动）
    let formDir = null;
    const matchedLocal = localForms.find(l => l.uuid && l.uuid === formUuid);
    if (matchedLocal) {
      formDir = matchedLocal.fullPath;
    } else {
      formDir = findFormDirectory(formName, projectRoot, formType, form.module);
    }

    // 实际表单类型：UUID 命中时以清单为准；否则从目录名提取
    let actualFormType = formType.includes('流程') ? '流程表单' : '普通表单';
    if (formDir && !matchedLocal) {
      const dirName = path.basename(formDir);
      const typeMatch = dirName.match(/「(普通表单|流程表单)」/);
      if (typeMatch) {
        actualFormType = typeMatch[1];
      }
    }

    // v2.11.0: UUID 命中但目录名（改名）或所属分组变化 → 重命名/移动目录，避免残留旧目录
    // v2.10.1: 支持多层次嵌套分组路径
    if (formDir && matchedLocal) {
      const targetTypeStr = formType.includes('流程') ? '流程表单' : '普通表单';
      const targetFolderName = `${formName}「${targetTypeStr}」`;
      const targetDir = form.module
        ? path.join(modulePathToDirPath(projectRoot, form.module), targetFolderName)
        : path.join(projectRoot, targetFolderName);
      if (path.resolve(formDir) !== path.resolve(targetDir)) {
        try {
          if (fs.existsSync(targetDir) && path.resolve(targetDir) !== path.resolve(formDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          fs.renameSync(formDir, targetDir);
          // 清理目录内残留的旧名 JSON（避免与重命名后的新名 JSON 并存）
          try {
            const inner = fs.readdirSync(targetDir);
            for (const f of inner) {
              if (/^.+「(普通表单|流程表单)」\.json$/.test(f) && f !== `${targetFolderName}.json`) {
                fs.unlinkSync(path.join(targetDir, f));
              }
            }
          } catch (_) {}
          console.log(`   🔄 表单改名/移动: ${path.basename(formDir)} → ${targetFolderName}`);
          formDir = targetDir;
        } catch (err) {
          console.log(`   ⚠️ 重命名目录失败，继续使用原目录: ${err.message}`);
        }
      }
    }

    if (!formDir) {
      // 找不到表单目录，自动创建
      console.log(`   📁 未找到表单目录，自动创建...`);
      
      // 统一使用「普通表单」/「流程表单」作为类型名称
      const typeStr = formType.includes('流程') ? '流程表单' : '普通表单';
      actualFormType = typeStr;
      const folderName = `${formName}「${typeStr}」`;
      
      // v2.10.1: 有分组信息时创建到嵌套分组子目录，支持多层次分组
      if (form.module) {
        const groupDir = modulePathToDirPath(projectRoot, form.module);
        formDir = path.join(groupDir, folderName);
        console.log(`     📁 创建表单目录：${form.module}（分组）/${folderName}`);
      } else {
        formDir = path.join(projectRoot, folderName);
        console.log(`     📁 创建表单目录：${folderName}`);
      }
      
      // 创建表单目录
      if (!fs.existsSync(formDir)) {
        fs.mkdirSync(formDir, { recursive: true });
      }
    }
    
    // 构建JSON文件路径（使用实际的表单类型）
    const jsonFileName = `${formName}「${actualFormType}」.json`;
    const jsonFilePath = path.join(formDir, jsonFileName);
    
    try {
      // 直接调用 form_manager.js 的 getFormSchema（与步骤1使用同一 API 调用方式）
      // 替代之前通过 execSync 调用独立 get-schema.js（后者使用不同 API 路径容易失败）
      const schema = await getFormSchema(authRef, appId, formUuid);
      
      if (!schema) {
        throw new Error('获取表单Schema失败: 返回为空');
      }
      
      // 清理 Schema 并保存为 nodeSchema 格式的 JSON 文件
      const cleanedSchema = cleanSchema(schema);
      // v2.11.0: 在 JSON 顶层写入表单标识，便于后续同步时按 UUID 匹配改名/删除，避免残留
      cleanedSchema.formUuid = formUuid;
      cleanedSchema.formName = formName;
      cleanedSchema.formType = actualFormType;
      fs.writeFileSync(jsonFilePath, JSON.stringify(cleanedSchema, null, 2), 'utf8');
      console.log(`   📄 Schema已保存到: ${jsonFileName}`);
      
      generateComponentList(formDir, formName, actualFormType, jsonFilePath);
      
      // 生成"表单结构变更.md"（仅在文件不存在时创建，保留用户手动维护的变更记录）
      const changePath = path.join(formDir, '表单结构变更.md');
      if (!fs.existsSync(changePath)) {
        const today = new Date().toISOString().split('T')[0];
        const changeMd = `# ${formName}「${actualFormType}」- 表单结构变更记录\n\n> 版本: 1.0.0\n> 创建日期: ${today}\n\n---\n\n## 📋 变更记录\n\n| 版本 | 日期 | 变更内容 | 变更人 |\n|:----:|:-----|:---------|:-------|\n| 1.0.0 | ${today} | 初始版本，从宜搭平台同步 | 系统自动 |\n\n---\n\n## 📝 说明\n\n- 本文件记录表单结构的变更历史\n- 每次表单结构变更时，请更新此文件\n- 包含字段增删改、组件类型变更等\n\n---\n\n*最后更新时间: ${new Date().toLocaleString()}*\n`;
        fs.writeFileSync(changePath, changeMd, 'utf8');
        console.log(`   📄 保存变更记录`);
      }
      
      console.log(`   ✅ 完成`);
      syncedCount++;
    } catch (error) {
      console.log(`   ❌ 失败: ${error.message}`);
      failedCount++;
    }
  }

  // 步骤2-B：清理根目录下与分组子目录重复的表单目录
  console.log('\n[步骤2-B] 清理重复目录...');
  console.log('------------------------------------------------------------');
  try {
    cleanupOrphanRootFormDirs(projectRoot, forms);
  } catch (error) {
    console.log(`⚠️  清理重复目录失败: ${error.message}`);
  }

  // 步骤2-C：清理宜搭平台已删除的表单目录（按 UUID 匹配，避免残留）
  console.log('\n[步骤2-C] 清理已删除的表单...');
  console.log('------------------------------------------------------------');
  try {
    cleanupDeletedForms(projectRoot, forms);
  } catch (error) {
    console.log(`⚠️  清理已删除表单失败: ${error.message}`);
  }

  // 步骤2-D：清理已空且不在清单中的分组目录
  console.log('\n[步骤2-D] 清理空分组目录...');
  console.log('------------------------------------------------------------');
  try {
    // v2.10.2: 先获取 API 中的空分组路径，防止被误删
    let navGroupPaths = [];
    try {
      const navResult = await requestWithAutoLogin((auth) => {
        return getRequest(
          auth.baseUrl,
          `/dingtalk/web/${appId}/query/formnav/getFormNavigationListByOrder.json?_api=Nav.queryList&_mock=false`,
          { _csrf_token: auth.csrfToken, _locale_time_zone_offset: 28800000 },
          auth.cookies
        );
      }, authRef);
      if (navResult?.success && Array.isArray(navResult.content)) {
        const { allGroupPaths } = buildGroupTree(navResult.content);
        navGroupPaths = allGroupPaths || [];
      }
    } catch (_) {
      // 获取分组路径失败时，使用空数组（不会保留空分组，但不会阻塞流程）
    }
    cleanupEmptyGroups(projectRoot, forms, navGroupPaths);
  } catch (error) {
    console.log(`⚠️  清理空分组失败: ${error.message}`);
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
    console.log(`              ⚠️  ${failedCount} 个失败（不影响整体同步结果）`);
  }
  console.log('');

  // 只要有成功同步的表单就算整体成功（部分失败不应导致整次同步被标记为失败）
  const allFailed = syncedCount === 0 && failedCount > 0;
  process.exit(allFailed ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  });
}
