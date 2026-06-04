/**
 * 宜搭表单 Schema 同步器
 * 版本: 1.3.0
 * 更新日期: 2026-03-14
 *
 * 更新内容:
 * - 修复 extractFields 函数，支持清理后的 nodeSchema 格式
 * - 修复变更记录顺序，最新变更插入到最前面
 * - 变更记录只显示实际变更的字段（新增/删除/修改）
 * - 支持子表字段提取，变更记录以层级结构显示子表及其字段
 *
 * 功能: 从宜搭平台获取表单 Schema 并同步到本地 JSON 文件
 * 支持: 单表单同步、批量同步、自动记录变更历史
 * 用法:
 *   单表单: node sync-schema.js <appType> <formUuid> <本地JSON路径>
 *   批量:   node sync-schema.js --config <配置文件路径>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==================== 配置 ====================

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');

// ==================== 工具函数 ====================

/**
 * 查找项目根目录
 * @returns {string} 项目根目录路径
 */
function findProjectRoot() {
  let currentDir = process.cwd();

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, '.agents'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return PROJECT_ROOT;
}

/**
 * 执行 get-schema.js 获取 Schema
 * @param {string} appType - 应用 ID
 * @param {string} formUuid - 表单 UUID
 * @returns {Object} Schema 对象
 */
function fetchSchema(appType, formUuid) {
  const getSchemaScript = path.join(SCRIPT_DIR, 'get-schema.js');

  try {
    const stdout = execSync(`node "${getSchemaScript}" "${appType}" "${formUuid}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 从输出中提取 JSON（JSON 可能跨多行）
    const output = stdout.trim();
    
    // 方法1：尝试直接解析整个输出
    try {
      return JSON.parse(output);
    } catch (e) {
      // 不是纯 JSON，继续尝试其他方法
    }
    
    // 方法2：从后往前查找 JSON 对象（找到最后一个完整的 {}）
    let braceCount = 0;
    let jsonStart = -1;
    let jsonEnd = -1;
    
    for (let i = output.length - 1; i >= 0; i--) {
      const char = output[i];
      if (char === '}') {
        braceCount++;
        if (jsonEnd === -1) jsonEnd = i + 1;
      } else if (char === '{') {
        braceCount--;
        if (braceCount === 0) {
          jsonStart = i;
          break;
        }
      }
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = output.substring(jsonStart, jsonEnd);
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        // 继续尝试方法3
      }
    }

    // 方法3：按行查找（兼容旧逻辑）
    const lines = output.split('\n');
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

    throw new Error('无法从输出中解析 Schema');
  } catch (error) {
    throw new Error(`获取 Schema 失败: ${error.message}`);
  }
}

/**
 * 获取字段的显示标签（处理 i18n 对象）
 * @param {Object|string} label - 标签
 * @returns {string} 显示标签
 */
function getFieldLabel(label) {
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object') {
    return label.zh_CN || label.en_US || JSON.stringify(label);
  }
  return '';
}

/**
 * 递归提取组件树中的字段
 * @param {Array} components - 组件树
 * @param {Array} fields - 字段列表
 * @param {Object} parentTable - 父级子表信息（如果是子表内的字段）
 */
function extractFieldsFromTree(components, fields, parentTable = null) {
  if (!Array.isArray(components)) return;

  // 布局容器组件列表（这些不是表单字段，只是容器）
  const layoutContainers = ['FormContainer', 'Page', 'RootContent', 'FormSection', 'Card', 'Grid', 'Column'];

  components.forEach(component => {
    // 如果是子表组件，不把它本身加入fields，只递归处理其子组件（子表字段）
    if (component.componentName === 'TableField') {
      if (component.children && Array.isArray(component.children)) {
        const tableInfo = {
          fieldId: component.props?.fieldId,
          label: getFieldLabel(component.props?.label)
        };
        extractFieldsFromTree(component.children, fields, tableInfo);
      }
      return; // 跳过TableField本身，不把它当作字段添加
    }

    // 检查是否有 fieldId（说明是表单字段），且不是布局容器
    if (component.props && component.props.fieldId && !layoutContainers.includes(component.componentName)) {
      const fieldInfo = {
        fieldId: component.props.fieldId,
        label: getFieldLabel(component.props.label),
        type: component.componentName,
        required: component.props.required || false,
        behavior: component.props.behavior || 'NORMAL'
      };
      
      // 如果是子表内的字段，记录父级子表信息
      if (parentTable) {
        fieldInfo.parentTable = parentTable;
      }
      
      fields.push(fieldInfo);
    }

    // 递归处理其他子组件
    if (component.children && Array.isArray(component.children)) {
      extractFieldsFromTree(component.children, fields, parentTable);
    }
  });
}

/**
 * 递归清理组件树，移除运行时属性，保留完整结构
 * @param {Array} components - 组件树
 * @returns {Array} 清理后的组件树
 */
function cleanComponentsTree(components) {
  if (!Array.isArray(components)) return components;

  return components.map(comp => {
    if (!comp || !comp.componentName) return comp;

    // 清理组件属性
    const cleaned = {
      componentName: comp.componentName,
      props: comp.props ? { ...comp.props } : {},
      condition: comp.condition !== undefined ? comp.condition : true,
      hidden: comp.hidden !== undefined ? comp.hidden : false,
      title: comp.title || '',
      isLocked: comp.isLocked !== undefined ? comp.isLocked : false,
      conditionGroup: comp.conditionGroup || ''
    };

    // 保留其他重要属性
    if (comp.id) cleaned.id = comp.id;
    if (comp.css) cleaned.css = comp.css;

    // 移除运行时属性
    delete cleaned.props.gmtModified;
    delete cleaned.props.gmtCreate;
    delete cleaned.props.creator;
    delete cleaned.props.modifier;
    delete cleaned.props.tenantId;

    // 递归清理子组件（保留 children 结构）
    if (comp.children && Array.isArray(comp.children)) {
      cleaned.children = cleanComponentsTree(comp.children);
    }

    return cleaned;
  });
}

/**
 * 从页面 Schema 中提取完整组件树
 * @param {Array} componentsTree - 页面组件树
 * @returns {Array} 完整组件树
 */
function extractFormFieldsFromPage(componentsTree) {
  if (!Array.isArray(componentsTree)) return [];

  // 查找 Page 组件
  const pageComponent = componentsTree.find(comp => comp.componentName === 'Page');
  if (!pageComponent || !pageComponent.children) return [];

  // 查找 RootContent 组件
  const rootContent = pageComponent.children.find(comp => comp.componentName === 'RootContent');
  if (!rootContent || !rootContent.children) return [];

  // 查找 FormContainer 组件
  const formContainer = rootContent.children.find(comp => comp.componentName === 'FormContainer');
  if (!formContainer || !formContainer.children) return [];

  // 清理并返回 FormContainer 下的所有组件（包括布局容器和表单字段）
  return cleanComponentsTree(formContainer.children);
}

/**
 * 清理 Schema，转换为 nodeSchema 格式
 * @param {Object} schema - 原始 Schema
 * @returns {Object} 清理后的 Schema
 */
function cleanSchema(schema) {
  if (!schema || !schema.pages || !Array.isArray(schema.pages)) {
    return schema;
  }

  const page = schema.pages[0];
  if (!page) return schema;

  // 提取表单字段
  const formFields = extractFormFieldsFromPage(page.componentsTree);

  // 返回 nodeSchema 格式（与 form_creator 生成的格式一致）
  return {
    type: 'nodeSchema',
    componentsMap: {},
    componentsTree: formFields
  };
}

/**
 * 提取表单中的字段列表
 * @param {Object} schema - Schema 对象
 * @returns {Array} 字段列表
 */
function extractFields(schema) {
  const fields = [];

  if (!schema) {
    return fields;
  }

  // 支持两种格式：
  // 1. 原始宜搭格式：schema.pages[0].componentsTree
  // 2. 清理后的格式：schema.componentsTree（nodeSchema）
  if (schema.pages && Array.isArray(schema.pages)) {
    schema.pages.forEach(page => {
      if (page.componentsTree && Array.isArray(page.componentsTree)) {
        extractFieldsFromTree(page.componentsTree, fields);
      }
    });
  } else if (schema.componentsTree && Array.isArray(schema.componentsTree)) {
    // 清理后的 nodeSchema 格式
    extractFieldsFromTree(schema.componentsTree, fields);
  }

  return fields;
}

/**
 * 对比字段差异
 * @param {Array} localFields - 本地字段列表
 * @param {Array} remoteFields - 线上字段列表
 * @returns {Object} 差异结果
 */
function compareFields(localFields, remoteFields) {
  const added = [];
  const removed = [];
  const modified = [];

  const localMap = new Map(localFields.map(f => [f.fieldId, f]));
  const remoteMap = new Map(remoteFields.map(f => [f.fieldId, f]));

  // 检测新增字段
  remoteFields.forEach(field => {
    if (!localMap.has(field.fieldId)) {
      added.push(field);
    }
  });

  // 检测删除字段
  localFields.forEach(field => {
    if (!remoteMap.has(field.fieldId)) {
      removed.push(field);
    }
  });

  // 检测修改字段
  remoteFields.forEach(field => {
    const localField = localMap.get(field.fieldId);
    if (localField) {
      const changes = [];

      if (localField.label !== field.label) {
        changes.push(`标签: "${localField.label}" → "${field.label}"`);
      }
      if (localField.type !== field.type) {
        changes.push(`类型: ${localField.type} → ${field.type}`);
      }
      if (localField.required !== field.required) {
        changes.push(`必填: ${localField.required} → ${field.required}`);
      }
      if (localField.behavior !== field.behavior) {
        changes.push(`行为: ${localField.behavior} → ${field.behavior}`);
      }

      if (changes.length > 0) {
        modified.push({
          fieldId: field.fieldId,
          label: field.label,
          changes
        });
      }
    }
  });

  return { added, removed, modified };
}

/**
 * 按层级结构格式化字段列表
 * @param {Array} fields - 字段列表
 * @returns {string} 格式化后的层级结构字符串
 */
function formatFieldsHierarchy(fields) {
  // 分离主表字段和子表字段
  const mainFields = fields.filter(f => !f.parentTable);
  const subTableFields = fields.filter(f => f.parentTable);
  
  // 按子表分组
  const subTableGroups = {};
  subTableFields.forEach(field => {
    const tableId = field.parentTable.fieldId;
    if (!subTableGroups[tableId]) {
      subTableGroups[tableId] = {
        tableInfo: field.parentTable,
        fields: []
      };
    }
    subTableGroups[tableId].fields.push(field);
  });
  
  let result = '';
  let index = 1;
  
  // 先显示主表字段
  mainFields.forEach(field => {
    result += `  - ${index}.${field.label}（${field.fieldId}）\n`;
    index++;
  });
  
  // 再显示子表及其字段
  Object.values(subTableGroups).forEach(group => {
    result += `  - ${index}.${group.tableInfo.label}（${group.tableInfo.fieldId}）\n`;
    index++;
    
    // 子表字段缩进显示
    group.fields.forEach((subField, subIndex) => {
      result += `    - ${subIndex + 1}.${subField.label}（${subField.fieldId}）\n`;
    });
  });
  
  return result;
}

/**
 * 生成变更记录 Markdown
 * @param {string} formName - 表单名称
 * @param {Object} diff - 差异结果
 * @returns {string} Markdown 内容
 */
function generateChangeLog(formName, diff) {
  const now = new Date();
  const timestamp = now.toLocaleString('zh-CN');

  let markdown = `\n## ${timestamp}\n`;
  markdown += `### ${formName}\n`;

  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
    markdown += '- ✅ 无变更\n';
  } else {
    if (diff.added.length > 0) {
      markdown += '- **新增字段**：\n';
      markdown += formatFieldsHierarchy(diff.added);
    }

    if (diff.removed.length > 0) {
      markdown += '- **删除字段**：\n';
      markdown += formatFieldsHierarchy(diff.removed);
    }

    if (diff.modified.length > 0) {
      markdown += '- **修改字段**：\n';
      // 修改字段保持简单列表格式，因为需要显示修改详情
      diff.modified.forEach((field, idx) => {
        const prefix = field.parentTable ? `[${field.parentTable.label}] ` : '';
        markdown += `  - ${idx + 1}.${prefix}${field.label}（${field.fieldId}）：\n`;
        field.changes.forEach(change => {
          markdown += `    - ${change}\n`;
        });
      });
    }
  }

  return markdown;
}

/**
 * 更新变更记录文件
 * 新版本插入到最前面（最新的变更在最上面）
 * @param {string} changelogPath - 变更记录文件路径
 * @param {string} content - 要追加的内容
 */
function updateChangelog(changelogPath, content) {
  const header = '# 表单结构变更记录\n\n';

  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(changelogPath, header + content, 'utf8');
  } else {
    // 读取现有内容
    const existingContent = fs.readFileSync(changelogPath, 'utf8');
    // 新内容插入到标题之后（最新的在最前面）
    const newContent = header + content + existingContent.substring(header.length);
    fs.writeFileSync(changelogPath, newContent, 'utf8');
  }
}

/**
 * 同步单个表单
 * @param {string} appType - 应用 ID
 * @param {string} formUuid - 表单 UUID
 * @param {string} localPath - 本地 JSON 路径
 * @returns {Object} 同步结果
 */
function syncSingleForm(appType, formUuid, localPath) {
  console.log(`\n🔄 同步表单: ${formUuid}`);
  console.log(`   本地路径: ${localPath}`);

  // 确保目录存在
  const absolutePath = path.isAbsolute(localPath) ? localPath : path.join(PROJECT_ROOT, localPath);
  const dir = path.dirname(absolutePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 读取本地 Schema（如果存在）
  let localSchema = null;
  let localFields = [];

  if (fs.existsSync(absolutePath)) {
    try {
      localSchema = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
      localFields = extractFields(localSchema);
      console.log(`   本地字段数: ${localFields.length}`);
    } catch (e) {
      console.warn(`   ⚠️  读取本地文件失败: ${e.message}`);
    }
  } else {
    console.log(`   本地文件不存在，将创建新文件`);
  }

  // 获取线上 Schema
  console.log(`   正在获取线上 Schema...`);
  const remoteSchema = fetchSchema(appType, formUuid);
  const remoteFields = extractFields(remoteSchema);
  console.log(`   线上字段数: ${remoteFields.length}`);

  // 对比差异
  const diff = compareFields(localFields, remoteFields);

  // 清理 Schema（移除运行时属性，保留创建时可用属性）
  const cleanedSchema = cleanSchema(remoteSchema);

  // 保存清理后的 Schema 到本地
  fs.writeFileSync(absolutePath, JSON.stringify(cleanedSchema, null, 2), 'utf8');
  console.log(`   ✅ 已保存到: ${absolutePath}`);

  // 生成变更记录
  const formName = remoteSchema.title || path.basename(localPath, '.json');
  const changelogContent = generateChangeLog(formName, diff);

  // 更新变更记录文件
  const changelogPath = path.join(dir, '表单结构变更.md');
  updateChangelog(changelogPath, changelogContent);
  console.log(`   📝 变更记录: ${changelogPath}`);

  // 输出变更统计
  if (diff.added.length > 0) {
    console.log(`   ➕ 新增: ${diff.added.length} 个字段`);
  }
  if (diff.removed.length > 0) {
    console.log(`   ➖ 删除: ${diff.removed.length} 个字段`);
  }
  if (diff.modified.length > 0) {
    console.log(`   📝 修改: ${diff.modified.length} 个字段`);
  }
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
    console.log(`   ✅ 无变更`);
  }

  return {
    success: true,
    formUuid,
    localPath: absolutePath,
    added: diff.added.length,
    removed: diff.removed.length,
    modified: diff.modified.length
  };
}

/**
 * 批量同步
 * @param {string} configPath - 配置文件路径
 * @returns {Array} 同步结果列表
 */
function syncBatch(configPath) {
  const absoluteConfigPath = path.isAbsolute(configPath) ? configPath : path.join(PROJECT_ROOT, configPath);

  if (!fs.existsSync(absoluteConfigPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(absoluteConfigPath, 'utf8'));

  if (!config.appType || !config.forms || !Array.isArray(config.forms)) {
    throw new Error('配置文件格式错误，需要包含 appType 和 forms 数组');
  }

  console.log(`\n📦 批量同步模式`);
  console.log(`   应用: ${config.appType}`);
  console.log(`   表单数: ${config.forms.length}`);

  const results = [];

  for (const form of config.forms) {
    try {
      const result = syncSingleForm(config.appType, form.formUuid, form.localPath);
      results.push(result);
    } catch (error) {
      console.error(`   ❌ 同步失败: ${error.message}`);
      results.push({
        success: false,
        formUuid: form.formUuid,
        error: error.message
      });
    }
  }

  return results;
}

// ==================== 主函数 ====================

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法:');
    console.log('  单表单: node sync-schema.js <appType> <formUuid> <本地JSON路径>');
    console.log('  批量:   node sync-schema.js --config <配置文件路径>');
    console.log('');
    console.log('示例:');
    console.log('  node sync-schema.js APP_xxx FORM-yyy "进销存管理/客户信息.json"');
    console.log('  node sync-schema.js --config "sync-config.json"');
    process.exit(1);
  }

  // 批量模式
  if (args[0] === '--config') {
    if (args.length < 2) {
      console.error('❌ 请提供配置文件路径');
      process.exit(1);
    }

    try {
      const results = syncBatch(args[1]);

      console.log('\n' + '='.repeat(50));
      console.log('📊 批量同步完成');
      console.log('='.repeat(50));

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      console.log(`✅ 成功: ${successCount}`);
      console.log(`❌ 失败: ${failCount}`);

      results.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        console.log(`   ${status} ${result.formUuid}`);
      });

      process.exit(failCount > 0 ? 1 : 0);
    } catch (error) {
      console.error('❌ 批量同步失败:', error.message);
      process.exit(1);
    }
  }

  // 单表单模式
  if (args.length < 3) {
    console.error('❌ 参数不足，单表单模式需要: appType formUuid 本地JSON路径');
    process.exit(1);
  }

  const [appType, formUuid, localPath] = args;

  try {
    const result = syncSingleForm(appType, formUuid, localPath);

    console.log('\n' + '='.repeat(50));
    console.log('✅ 同步完成');
    console.log('='.repeat(50));
    console.log(`📁 文件: ${result.localPath}`);
    console.log(`➕ 新增: ${result.added} 个字段`);
    console.log(`➖ 删除: ${result.removed} 个字段`);
    console.log(`📝 修改: ${result.modified} 个字段`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 同步失败:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();
