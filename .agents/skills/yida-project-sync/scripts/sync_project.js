#!/usr/bin/env node
/**
 * 宜搭已有项目同步脚本 - 主入口
 * 版本: 1.1.0
 * 更新日期: 2026-05-07
 *
 * 更新内容:
 * - 移除「未分组表单」目录逻辑，表单直接在项目根目录下创建
 * - 统一表单类型名称：使用「普通表单」/「流程表单」
 * 
 * 功能: 整合 config-sync、get-schema、rule-sync，一键同步已有宜搭项目
 * 
 * 使用方式:
 * node sync_project.js --appId APP_XXX --output ./项目名称
 * 
 * 参数:
 *   --appId      宜搭应用ID（必填）
 *   --output     项目输出目录（必填）
 *   --skip-schema  跳过表单结构同步（可选）
 *   --skip-rules   跳过业务规则同步（可选）
 *   --help       显示帮助信息
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==================== 配置 ====================

const SCRIPT_DIR = __dirname;
const SKILL_ROOT = path.resolve(SCRIPT_DIR, '..');
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');

// 依赖的 skill 路径
const CONFIG_SYNC_SCRIPT = path.join(PROJECT_ROOT, '.agents', 'skills', 'yida-config-sync', 'scripts', 'sync_config.js');
const SCHEMA_SYNC_SCRIPT = path.join(PROJECT_ROOT, '.agents', 'skills', 'yida-get-schema', 'scripts', 'sync-schema.js');
const RULE_SYNC_SCRIPT = path.join(PROJECT_ROOT, '.agents', 'skills', 'yida-rule-sync', 'scripts', 'sync_rules.js');
const PROTOTYPE_GENERATOR_SCRIPT = path.join(PROJECT_ROOT, '.agents', 'skills', 'form-to-prototype', 'scripts', 'prototype_generator.js');

// ==================== 工具函数 ====================

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
========================================
宜搭已有项目同步工具
========================================

用法:
  方式1 - 指定应用ID:
    node sync_project.js --appId <应用ID> --output <输出目录> [选项]

  方式2 - 从配置清单读取（推荐）:
    node sync_project.js --output <输出目录> [选项]
    # 脚本会自动从 <输出目录>/系统配置清单.md 读取应用ID

参数:
  --appId <应用ID>      宜搭应用ID，如 APP_YA1204PFH4K3MRARR1E3（可选，默认从配置清单读取）
  --output <目录>       项目输出目录，如 ./叶秋功能测试（必填）
  --skip-schema         跳过表单结构同步（可选）
  --skip-rules          跳过业务规则同步（可选）
  --skip-prototype      跳过原型页面生成（可选）
  --help                显示此帮助信息

示例:
  # 首次同步（指定应用ID）
  node sync_project.js --appId APP_YA1204PFH4K3MRARR1E3 --output ./叶秋功能测试

  # 更新同步（从配置清单读取应用ID）
  node sync_project.js --output ./叶秋功能测试

  # 跳过规则同步
  node sync_project.js --output ./项目名称 --skip-rules

========================================
`);
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    appId: null,
    outputDir: null,
    skipSchema: false,
    skipRules: false,
    skipPrototype: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--appId':
        options.appId = args[++i];
        break;
      case '--output':
        options.outputDir = args[++i];
        break;
      case '--skip-schema':
        options.skipSchema = true;
        break;
      case '--skip-rules':
        options.skipRules = true;
        break;
      case '--skip-prototype':
        options.skipPrototype = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * 检查依赖的 skill 是否存在
 */
function checkDependencies() {
  const deps = [
    { path: CONFIG_SYNC_SCRIPT, name: 'yida-config-sync' },
    { path: SCHEMA_SYNC_SCRIPT, name: 'yida-get-schema' },
    { path: RULE_SYNC_SCRIPT, name: 'yida-rule-sync' }
  ];

  const missing = [];
  for (const dep of deps) {
    if (!fs.existsSync(dep.path)) {
      missing.push(dep.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(`缺少必要的依赖 skill: ${missing.join(', ')}`);
  }
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
 * 执行命令并返回输出
 */
function execCommand(command, options = {}) {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout || '' };
  }
}

/**
 * 步骤1: 同步应用配置
 */
async function syncConfig(appId, outputDir) {
  console.log('\n📋 步骤1: 同步应用配置...');
  console.log('   正在调用 yida-config-sync...');

  const command = `node "${CONFIG_SYNC_SCRIPT}" --appId ${appId} --output "${outputDir}" --update`;
  const result = execCommand(command);

  if (!result.success) {
    console.error('   ❌ 配置同步失败:', result.error);
    return { success: false, error: result.error };
  }

  console.log('   ✅ 配置同步完成');
  
  // 解析同步结果
  const forms = parseFormsFromConfig(path.join(outputDir, '系统配置清单.md'));
  return { success: true, forms };
}

/**
 * 步骤2: 同步表单结构
 */
async function syncSchema(appId, outputDir, forms) {
  console.log('\n📄 步骤2: 同步表单结构...');
  console.log(`   共 ${forms.length} 个表单需要同步`);

  const results = [];
  const errors = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    console.log(`\n   [${i + 1}/${forms.length}] 同步表单: ${form.name}`);

    // 创建表单目录（直接在项目根目录下）
    const formTypeStr = form.type === '流程' ? '流程表单' : '普通表单';
    const formDirName = `${form.name}「${formTypeStr}」`;
    const formDir = path.join(outputDir, formDirName);
    ensureDir(formDir);

    // 构建 JSON 文件路径
    const jsonPath = path.join(formDir, `${formDirName}.json`);

    // 执行同步
    const command = `node "${SCHEMA_SYNC_SCRIPT}" "${appId}" "${form.formUuid}" "${jsonPath}"`;
    const result = execCommand(command);

    if (result.success) {
      console.log(`   ✅ ${form.name} 同步完成`);
      results.push({ form: form.name, success: true });
    } else {
      console.error(`   ❌ ${form.name} 同步失败:`, result.error);
      errors.push({ form: form.name, error: result.error });
    }
  }

  console.log(`\n   📊 表单同步结果: 成功 ${results.length}/${forms.length}`);
  
  return { 
    success: errors.length === 0, 
    results, 
    errors,
    total: forms.length,
    successCount: results.length
  };
}

/**
 * 步骤3: 同步业务规则
 */
async function syncRules(appId, outputDir) {
  console.log('\n📐 步骤3: 同步业务规则...');
  console.log('   正在调用 yida-rule-sync...');

  const command = `node "${RULE_SYNC_SCRIPT}" --appId ${appId} --output "${outputDir}"`;
  const result = execCommand(command);

  if (!result.success) {
    console.error('   ❌ 规则同步失败:', result.error);
    return { success: false, error: result.error };
  }

  console.log('   ✅ 规则同步完成');
  return { success: true };
}

/**
 * 步骤4: 生成原型页面
 */
async function generatePrototype(outputDir, forms) {
  console.log('\n🎨 步骤4: 生成原型页面...');
  
  // 检查原型生成器是否存在
  if (!fs.existsSync(PROTOTYPE_GENERATOR_SCRIPT)) {
    console.log('   ⚠️ 原型生成器不存在，跳过原型生成');
    return { success: false, error: '原型生成器不存在' };
  }
  
  // 创建字段清单文件（从同步的表单数据生成）
  const fieldListPath = path.join(outputDir, '01需求梳理', '字段清单.md');
  
  // 每次都重新生成字段清单，确保使用最新的同步数据
  console.log('   📝 从同步数据生成字段清单...');
  generateFieldListFromSync(outputDir, forms);
  
  // 调用原型生成器
  console.log('   🎨 正在生成原型页面...');
  const prototypeOutputDir = path.join(outputDir, '01需求梳理', '原型页面');
  
  const command = `node "${PROTOTYPE_GENERATOR_SCRIPT}" "${fieldListPath}" "${prototypeOutputDir}"`;
  const result = execCommand(command);
  
  if (!result.success) {
    console.error('   ❌ 原型生成失败:', result.error);
    return { success: false, error: result.error };
  }
  
  console.log('   ✅ 原型页面生成完成');
  return { success: true, outputDir: prototypeOutputDir };
}

/**
 * 从同步的表单数据生成字段清单
 */
function generateFieldListFromSync(outputDir, forms) {
  const fieldListDir = path.join(outputDir, '01需求梳理');
  ensureDir(fieldListDir);
  
  // 读取系统配置清单获取应用名称
  const configPath = path.join(outputDir, '系统配置清单.md');
  let appName = '未知应用';
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const appNameMatch = configContent.match(/\*\*应用名称\*\*\s*\|\s*([^|]+)\s*\|/);
    if (appNameMatch) {
      appName = appNameMatch[1].trim();
    }
  }
  
  // 生成字段清单内容（符合 prototype_generator.js 期望的格式）
  let content = `# ${appName} - 字段清单\n\n`;
  content += `> 版本: 1.0.0\n`;
  content += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
  content += `> 生成方式: 从宜搭平台同步自动生成\n\n`;
  content += `---\n\n`;
  
  // 添加一个默认模块
  content += `## 一、业务表单\n\n`;
  
  // 为每个表单生成字段信息
  let formIndex = 1;
  const numberMap = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六'];
  
  for (const form of forms) {
    const normalizedType = String(form.typeLabel || form.type || '').includes('流程') ? '流程表单' : '普通表单';
    const typeCandidates = Array.from(new Set([
      normalizedType,
      String(form.typeLabel || '').trim(),
      String(form.type || '').trim()
    ].filter(Boolean)));

    const formDirCandidates = Array.from(new Set([
      ...typeCandidates.map((typeName) => `${form.name}「${typeName}」`),
      form.name
    ]));

    // 兼容目录结构：
    // 1) <输出目录>/<表单目录>/组件ID清单.md（主流程）
    // 2) <分组目录>/<表单目录>/组件ID清单.md（分组目录）
    const searchRoots = [outputDir];
    const subDirs = fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '01需求梳理')
      .map((d) => path.join(outputDir, d.name));
    searchRoots.push(...subDirs);

    let componentMdPath = '';
    for (const rootDir of searchRoots) {
      for (const formDirName of formDirCandidates) {
        const candidate = path.join(rootDir, formDirName, '组件ID清单.md');
        if (fs.existsSync(candidate)) {
          componentMdPath = candidate;
          break;
        }
      }
      if (componentMdPath) {
        break;
      }
    }
    
    // 使用 prototype_generator.js 期望的格式: ### (一) 表单名称「类型」
    const formType = normalizedType;
    const indexStr = numberMap[formIndex - 1] || formIndex;
    content += `### (${indexStr}) ${form.name}「${formType}」\n\n`;
    
    // 如果有组件ID清单，读取字段信息
    if (fs.existsSync(componentMdPath)) {
      const componentContent = fs.readFileSync(componentMdPath, 'utf-8');
      
      // 解析组件ID清单表格（按行解析，避免跨行误匹配到统计表）
      const rows = [];
      const lines = componentContent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|')) continue;

        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length < 4) continue;
        // 支持主表序号(1,2,3)和子表序号(9.1,9.2,9.3)
        if (!/^\d+(?:\.\d+)?$/.test(cells[0])) continue;
        if (cells[0] === '序号') continue;

        rows.push({
          index: cells[0],
          componentType: cells[1],
          fieldName: cells[2],
          fieldId: cells[3]
        });
      }
      
      // 过滤布局组件和统计行
      const meaningfulRows = rows.filter((row) => {
        const t = String(row.componentType || '').trim();
        // 过滤纯布局类组件
        if (['列布局', '列', 'ColumnsLayout', 'Column'].includes(t)) return false;
        // 过滤统计汇总行（主表字段/子表字段 数量统计行）
        if (row.fieldName === '主表字段' || row.fieldName === '子表字段') return false;
        // 过滤空的统计行
        if (!t && !row.fieldName) return false;
        return true;
      });

      if (meaningfulRows.length > 0) {
        // 分离主表字段和子表字段（子表父字段 componentType 为 子表单/TableField，子字段序号含小数点）
        const mainFields = [];
        const subTables = []; // [{ name, fieldId, children[] }]
        let currentSubTable = null;

        for (const row of meaningfulRows) {
          const isSubTableParent = row.componentType === '子表单' || row.componentType === 'TableField' || row.componentType === 'SubForm';
          const hasDecimalIndex = String(row.index).indexOf('.') !== -1;

          if (isSubTableParent && !hasDecimalIndex) {
            currentSubTable = {
              name: row.fieldName,
              fieldId: row.fieldId,
              children: []
            };
            subTables.push(currentSubTable);
            continue;
          }

          if (hasDecimalIndex && currentSubTable) {
            currentSubTable.children.push(row);
            continue;
          }

          // 非子表相关字段，归入主表
          currentSubTable = null;
          mainFields.push(row);
        }

        // 输出主表字段
        if (mainFields.length > 0) {
          content += `**主表字段：**\n\n`;
          content += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
          content += `|---------|---------|---------|---------|---------|\n`;

          for (const row of mainFields) {
            const fieldType = mapComponentTypeToFieldType(row.componentType);
            content += `| ${row.fieldName} | ${fieldType} | 组件ID: ${row.fieldId} | 新增 | 否 |\n`;
          }
        }

        // 输出子表字段
        for (const subTable of subTables) {
          content += `\n**子表：${subTable.name}**\n\n`;

          if (subTable.children.length > 0) {
            content += `| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |\n`;
            content += `|---------|---------|---------|---------|---------|\n`;

            for (const child of subTable.children) {
              const fieldType = mapComponentTypeToFieldType(child.componentType);
              content += `| ${child.fieldName} | ${fieldType} | 组件ID: ${child.fieldId} | 新增 | 否 |\n`;
            }
          } else {
            content += `> 子表暂无字段\n`;
          }
        }

        const mainFieldCount = mainFields.length;
        const subTableCount = subTables.length;
        const subFieldCount = subTables.reduce((sum, st) => sum + st.children.length, 0);
        content += `\n**字段数量**: ${mainFieldCount} 个（主表）+ ${subTableCount} 个子表（含 ${subFieldCount} 个子表字段）\n`;
        content += `\n`;
      } else {
        content += `> 暂无字段信息\n\n`;
      }
    } else {
      content += `> 组件ID清单不存在\n\n`;
    }
    
    content += `---\n\n`;
    formIndex++;
  }
  
  // 写入字段清单文件
  const fieldListPath = path.join(fieldListDir, '字段清单.md');
  fs.writeFileSync(fieldListPath, content, 'utf-8');
  console.log(`   ✅ 字段清单已生成: ${fieldListPath}`);
}

/**
 * 映射组件类型到字段类型
 */
function mapComponentTypeToFieldType(componentType) {
  const typeMap = {
    'TextField': '单行文本',
    'TextareaField': '多行文本',
    'NumberField': '数值',
    'DateField': '日期',
    'SelectField': '下拉单选',
    'RadioField': '单选',
    'CheckboxField': '多选',
    'EmployeeField': '成员',
    'DepartmentField': '部门',
    'AttachmentField': '附件',
    'ImageField': '图片',
    'TableField': '子表单',
    'SerialNumberField': '流水号',
    'RateField': '评分',
    'CascadeSelectField': '级联选择',
    'AddressField': '地址',
    'PhoneField': '电话',
    'EmailField': '邮箱',
    'UrlField': '链接'
  };
  
  return typeMap[componentType] || componentType;
}

/**
 * 从系统配置清单解析表单列表
 * 支持格式: | 序号 | 页面名称「类型」 | 页面编码（表单UUID） |
 */
function parseFormsFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const forms = [];
  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    if (line.includes('页面名称') || line.includes('---')) continue;

    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    if (!/^\d+$/.test(cells[0])) continue;

    const pageNameAndType = cells[1];
    const uuid = cells[2];
    if (!/^FORM-[A-Z0-9]+$/i.test(uuid)) continue;

    const formNameTypePatterns = [
      /^(.+?)「(.+?)」$/,
      /^(.+?)【(.+?)】$/,
      /^(.+?)（(.+?)）$/,
      /^(.+?)\((.+?)\)$/
    ];
    let name = '';
    let typeLabel = '';
    for (const pattern of formNameTypePatterns) {
      const match = pageNameAndType.match(pattern);
      if (match) {
        name = match[1].trim();
        typeLabel = match[2].trim();
        break;
      }
    }

    // 无法匹配“名称+类型”时，兜底按“普通表单”处理，避免整表单被跳过
    if (!name) {
      name = pageNameAndType.trim();
      typeLabel = pageNameAndType.includes('流程') ? '流程表单' : '普通表单';
    }

    forms.push({
      index: parseInt(cells[0], 10),
      name,
      type: typeLabel.includes('流程') ? '流程' : '普通',
      typeLabel,
      formUuid: uuid.trim()
    });
  }

  return forms;
}

/**
 * 从系统配置清单解析应用信息
 */
function parseAppInfoFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  
  const appNameMatch = content.match(/\*\*应用名称\*\*\s*\|\s*([^|]+)\s*\|/);
  const appIdMatch = content.match(/\*\*应用ID\*\*\s*\|\s*(APP[_-][A-Z0-9]+)\s*\|/);
  const baseUrlMatch = content.match(/\*\*访问地址\*\*\s*\|\s*([^|]+)\s*\|/);

  return {
    appName: appNameMatch ? appNameMatch[1].trim() : null,
    appId: appIdMatch ? appIdMatch[1] : null,
    baseUrl: baseUrlMatch ? baseUrlMatch[1].trim() : null
  };
}

/**
 * 生成项目开发提示词
 */
function generateProjectGuide(outputDir, appName) {
  const guideContent = `# ${appName} - 项目开发提示词

## 项目概述

本项目通过【同步已有项目】功能从宜搭平台同步而来。

## 开发流程

### 步骤1: 需求梳理
- 查看同步的表单结构和字段定义
- 理解业务逻辑和数据关系
- 梳理需要优化或新增的功能

### 步骤2: 流程设计
- 分析现有流程表单的审批节点
- 设计优化后的审批流程
- 绘制流程图

### 步骤3: 字段清单
- 查看各表单的字段定义（JSON文件）
- 确认字段类型和校验规则
- 规划需要调整的字段

### 步骤4: 规则配置
- 查看系统规则清单.md中的公式、联动、校验规则
- 优化现有规则或添加新规则
- 编写宜搭公式

### 步骤5: 测试验证
- 在宜搭平台测试表单功能
- 验证公式计算是否正确
- 测试流程审批是否正常

### 步骤6: 上线部署
- 确认所有功能测试通过
- 培训用户使用
- 正式上线运行

## 项目文件说明

| 文件/目录 | 说明 |
|----------|------|
| 系统配置清单.md | 应用ID、表单UUID等配置信息 |
| 系统规则清单.md | 公式、联动、校验、代码等规则 |
| XX表单「类型」/ | 各表单的JSON结构和组件ID清单 |
| 表单结构变更.md | 记录表单结构的变更历史 |

## 注意事项

1. 同步操作会覆盖本地文件，请确保已备份重要修改
2. 如需更新同步，可再次运行同步命令
3. 修改公式时请使用 formula-generator 生成准确的公式
`;

  const guidePath = path.join(outputDir, '项目开发提示词.md');
  fs.writeFileSync(guidePath, guideContent, 'utf-8');
}

/**
 * 生成同步报告
 */
function generateReport(options, results) {
  const { appId, outputDir, skipSchema, skipRules } = options;
  const { configResult, schemaResult, rulesResult, appInfo } = results;

  console.log('\n');
  console.log('========================================');
  console.log('宜搭项目同步完成');
  console.log('========================================');
  console.log();
  console.log('📱 应用信息');
  console.log(`   应用名称: ${appInfo?.appName || '未知'}`);
  console.log(`   应用ID: ${appId}`);
  console.log(`   访问地址: ${appInfo?.baseUrl || 'https://www.aliwork.com/' + appId + '/admin'}`);
  console.log();
  console.log('📊 同步统计');
  console.log(`   表单数量: ${configResult.forms?.length || 0}`);
  
  if (!skipSchema && schemaResult) {
    console.log(`   同步成功: ${schemaResult.successCount}/${schemaResult.total} 个表单`);
    if (schemaResult.errors.length > 0) {
      console.log(`   同步失败: ${schemaResult.errors.length} 个表单`);
    }
  }
  
  console.log();
  console.log('✅ 同步步骤');
  console.log(`   ${configResult.success ? '✓' : '✗'} 应用配置同步`);
  console.log(`   ${skipSchema ? '⊘ 跳过' : (schemaResult?.success ? '✓' : '✗') + ' 表单结构同步'}`);
  console.log(`   ${skipRules ? '⊘ 跳过' : (rulesResult?.success ? '✓' : '✗') + ' 业务规则同步'}`);
  
  console.log();
  console.log('📁 输出文件');
  console.log('   - 系统配置清单.md');
  if (!skipRules) {
    console.log('   - 系统规则清单.md');
  }
  if (!skipSchema && schemaResult?.successCount > 0) {
    console.log(`   - ${schemaResult.successCount} 个表单JSON文件`);
    console.log(`   - ${schemaResult.successCount} 个组件ID清单`);
  }
  console.log('   - 项目开发提示词.md');
  
  console.log();
  console.log('========================================');
  console.log(`同步成功！项目已保存到: ${outputDir}`);
  console.log('========================================');
}

/**
 * 从系统配置清单解析应用ID
 */
function parseAppIdFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const appIdMatch = content.match(/\*\*应用ID\*\*\s*\|\s*(APP[_-][A-Z0-9]+)\s*\|/);
  return appIdMatch ? appIdMatch[1] : null;
}

/**
 * 主同步函数
 */
async function syncProject(options) {
  let { appId, outputDir, skipSchema, skipRules } = options;

  console.log('========================================');
  console.log('宜搭已有项目同步');
  console.log('========================================');

  // 检查依赖
  try {
    checkDependencies();
  } catch (error) {
    console.error('❌ 依赖检查失败:', error.message);
    return { success: false, error: error.message };
  }

  // 确保输出目录存在
  ensureDir(outputDir);

  // 如果没有提供应用ID，尝试从配置清单读取
  if (!appId) {
    const configPath = path.join(outputDir, '系统配置清单.md');
    appId = parseAppIdFromConfig(configPath);
    
    if (appId) {
      console.log(`📋 从配置清单读取应用ID: ${appId}`);
    } else {
      console.error('❌ 错误: 未提供应用ID，且无法从配置清单读取');
      console.error('   请提供 --appId 参数，或确保配置清单存在且包含应用ID');
      return { success: false, error: '未找到应用ID' };
    }
  } else {
    console.log(`📋 使用指定的应用ID: ${appId}`);
  }

  console.log(`输出目录: ${outputDir}`);
  console.log(`跳过结构同步: ${skipSchema ? '是' : '否'}`);
  console.log(`跳过规则同步: ${skipRules ? '是' : '否'}`);
  console.log('========================================');

  // 创建需求梳理目录
  ensureDir(path.join(outputDir, '01需求梳理'));

  const results = {
    configResult: null,
    schemaResult: null,
    rulesResult: null,
    appInfo: null
  };

  // 步骤1: 同步应用配置
  results.configResult = await syncConfig(appId, outputDir);
  if (!results.configResult.success) {
    console.error('\n❌ 同步失败: 无法获取应用配置');
    return { success: false, error: '配置同步失败' };
  }

  // 获取应用信息
  results.appInfo = parseAppInfoFromConfig(path.join(outputDir, '系统配置清单.md'));

  // 步骤2: 同步表单结构（可选）
  if (!skipSchema && results.configResult.forms.length > 0) {
    results.schemaResult = await syncSchema(appId, outputDir, results.configResult.forms);
  }

  // 步骤3: 同步业务规则（可选）
  if (!skipRules) {
    results.rulesResult = await syncRules(appId, outputDir);
  }

  // 步骤4: 生成原型页面（可选）
  if (!options.skipPrototype) {
    const forms = parseFormsFromConfig(path.join(outputDir, '系统配置清单.md'));
    if (forms.length > 0) {
      const prototypeResult = await generatePrototype(outputDir, forms);
      if (!prototypeResult.success) {
        console.warn('\n⚠️ 原型页面生成失败，但同步数据已保存');
      }
    } else {
      console.log('\n⚠️ 未找到表单列表，跳过原型页面生成');
    }
  } else {
    console.log('\n⏭️ 跳过原型页面生成');
  }

  // 生成项目开发提示词
  generateProjectGuide(outputDir, results.appInfo?.appName || '宜搭项目');

  // 生成同步报告
  generateReport(options, results);

  return {
    success: true,
    appId,
    appName: results.appInfo?.appName,
    formsCount: results.configResult.forms.length,
    results
  };
}

// ==================== 主入口 ====================

async function main() {
  const options = parseArgs();

  // 显示帮助
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // 验证必填参数
  if (!options.outputDir) {
    console.error('❌ 错误: 请提供输出目录 (--output)');
    showHelp();
    process.exit(1);
  }

  // 如果没有提供appId，检查配置清单是否存在
  if (!options.appId) {
    const configPath = path.join(options.outputDir, '系统配置清单.md');
    if (!fs.existsSync(configPath)) {
      console.error('❌ 错误: 未提供应用ID，且配置清单不存在');
      console.error('   首次同步请提供 --appId 参数');
      console.error('   示例: node sync_project.js --appId APP_XXX --output ./项目名称');
      showHelp();
      process.exit(1);
    }
    console.log('📋 未提供应用ID，将尝试从配置清单读取...');
  }

  // 执行同步
  try {
    const result = await syncProject(options);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ 同步过程发生错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出函数供其他模块使用
module.exports = { syncProject };
