/**
 * 同步表单结构及组件ID
 * 版本: 3.3.0
 * 更新日期: 2026-07-15
 *
 * 更新内容:
 * - v3.3.0: 修复与 sync_config.js 目录结构不一致的问题
 *           - findFormDirectory 增加在所有子目录中查找（支持「分组」后缀目录和编号目录）
 *           - createFormDirectory 改为创建带「分组」后缀的目录（与 sync_config.js 一致）
 *           - FORM_MODULE_MAP 去除编号前缀，添加缺失的"库存信息"映射
 *           - 修复：之前创建编号目录(02基础信息)，而 sync_config.js 创建分组目录(基础信息「分组」)，导致两套重复目录
 *
 * 更新内容:
 * - v3.2.0: 支持解析包含"流程Code"列的系统配置清单
 *          - 表格格式支持4列：序号、页面名称「类型」、表单UUID、流程Code
 *          - 兼容旧格式（3列）和新格式（4列）
 *          - 解析流程Code用于后续流程相关操作
 * - 移除「未分组表单」目录逻辑，表单直接在项目根目录下按业务分组创建
 *
 * 更新内容:
 * - 修复组件ID清单格式，主表字段和子表字段分开为独立的表格
 *   - 与字段清单.md格式保持一致
 *   - 主表字段单独一个表格
 *   - 每个子表字段单独一个表格，标题为"子表：XXX"
 * - 修复JSON文件名与文件夹名称不一致的问题
 *   - formType转换为"普通表单"或"流程表单"，与文件夹名称保持一致
 *   - 确保JSON文件名格式：`表单名称「普通表单」.json`
 * - 简化表单UUID清单表格格式匹配
 *   - 新格式：| 序号 | 页面名称「类型」 | 表单UUID |
 *   - 移除对"页面类型"、"流程Code"列的匹配
 *   - 【注意】v3.2.0已恢复对流程Code列的支持
 * - 修复找不到表单目录时自动创建目录（而非跳过）
 * - 新增 FORM_MODULE_MAP 映射表，支持自动确定表单所属模块
 * - 新增 createFormDirectory 函数，自动创建表单文件夹结构
 * - 修复应用ID解析问题，支持转义格式 APP\_XXX
 * - 支持指定单个或多个表单同步（新增--forms参数）
 * - 支持提取子表内的字段
 * - 组件类型显示中文名称
 *
 * 功能: 从宜搭平台同步表单的Schema结构和组件ID，直接覆盖原JSON文件
 * 用法: 
 *   同步所有表单: node sync_form_schemas.js <项目目录> [应用ID]
 *   同步指定表单: node sync_form_schemas.js <项目目录> [应用ID] --forms "表单1,表单2"
 * 示例: 
 *   node sync_form_schemas.js "../../../进销存管理"
 *   node sync_form_schemas.js "../../../进销存管理" --forms "产品信息,仓库信息"
 * 
 * 说明:
 * - 如果提供了应用ID，则使用该ID
 * - 如果没有提供应用ID，则从系统配置清单读取
 * - 表单UUID列表从系统配置清单读取
 * - 使用--forms参数可以只同步指定的表单（多个表单用逗号分隔）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 引入同步工具模块
const { generateComponentList } = require('./sync-utils');

// Node.js 路径（Phase 6: 使用 lib/core/utils 统一检测，消除硬编码路径）
let NODE_PATH;
try {
  NODE_PATH = require('../../../../lib/core/utils').getNodeExecutable();
} catch (_) {
  NODE_PATH = process.env.NODE_PATH || 'node';
}

// get-schema 路径
const SCHEMA_SYNC_SCRIPT = path.join(__dirname, '..', '..', 'get-schema', 'scripts', 'sync-schema.js');

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
  const appIdMatch = content.match(/\|\s*\*\*(?:应用编码|应用ID)\*\*\s*\|\s*`?(APP[_\\]*[A-Z0-9]+)`?\s*\|/);
  if (appIdMatch) {
    // 清理转义符，返回标准格式
    return appIdMatch[1].replace(/\\/g, '');
  }
  return null;
}

/**
 * 从系统配置清单解析表单列表
 * 支持三种格式：
 * 1. | 序号 | 页面名称「类型」 | 表单UUID | 流程Code | 所属分组 |（5列，优先）
 * 2. | 序号 | 页面名称「类型」 | 表单UUID | 流程Code |（4列）
 * 3. | 序号 | 页面名称「类型」 | 表单UUID |（3列）
 * @param {string} configPath - 系统配置清单路径
 * @returns {Array} 表单列表，每项包含 formName, formType, formUuid, processCode, module(可选)
 */
function parseFormsFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const forms = [];

  // 统一正则：匹配4列或5列格式，第5列"所属分组"为可选
  // 格式: | 序号 | 页面名称「类型」 | 表单UUID | 流程Code | 所属分组(可选) |
  const formRegex = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*「([^|]+?)」\s*\|\s*([A-Z0-9-]+)\s*\|\s*([^|]*)\s*\|(\s*([^|]*?)\s*\|)?/g;
  let match;

  while ((match = formRegex.exec(content)) !== null) {
    const moduleValue = match[7] ? match[7].trim() || null : null;
    forms.push({
      index: parseInt(match[1]),
      formName: match[2].trim(),
      formType: match[3].trim(),
      formUuid: match[4].trim(),
      processCode: match[5] ? match[5].trim() || null : null,
      module: (moduleValue && moduleValue !== '-') ? moduleValue : null
    });
  }

  return forms;
}

/**
 * 表单名称到模块的兜底映射表
 * 仅当系统配置清单中没有"所属分组"列时使用
 */
const FORM_MODULE_MAP = {
  '产品信息': '基础信息',
  '仓库信息': '基础信息',
  '库存信息': '库存管理',
  '库存盘点': '库存管理',
  '库存调拨': '库存管理',
  '客户信息': '客户管理',
  '客户跟进': '客户管理',
  '供应商信息': '采购管理',
  '采购订单': '采购管理',
  '采购入库': '采购管理',
  '销售订单': '销售管理',
  '销售出库': '销售管理',
  '销售退货': '销售管理',
  '收款登记': '财务管理',
  '付款登记': '财务管理',
  '开票登记': '财务管理',
  '收票登记': '财务管理'
};

/**
 * 查找表单对应的目录
 * 在所有子目录中递归查找（支持分组目录「分组」后缀和编号目录两种格式）
 * @param {string} formName - 表单名称
 * @param {string} baseDir - 基础目录
 * @param {string} formType - 表单类型（表单/流程）
 * @returns {string|null} 表单目录路径
 */
function findFormDirectory(formName, baseDir, formType = '表单') {
  const typeStr = formType.includes('流程') ? '流程表单' : '普通表单';
  const expectedFolderName = `${formName}「${typeStr}」`;

  // 首先在项目根目录直接查找
  const items = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory() && item.name === expectedFolderName) {
      return path.join(baseDir, item.name);
    }
  }

  // 然后在所有子目录中查找（支持分组目录「分组」后缀和编号目录两种格式）
  for (const item of items) {
    if (!item.isDirectory()) continue;
    const dirName = item.name;
    // 跳过特殊目录
    if (dirName === '01需求梳理' || dirName.startsWith('.') || dirName === 'temp-file') continue;
    // 跳过表单目录本身（含「普通表单」或「流程表单」的）
    if (dirName.includes('「普通表单」') || dirName.includes('「流程表单」')) continue;

    const subDirPath = path.join(baseDir, dirName);
    if (!fs.existsSync(subDirPath)) continue;

    const subItems = fs.readdirSync(subDirPath, { withFileTypes: true });
    for (const subItem of subItems) {
      if (subItem.isDirectory() && subItem.name === expectedFolderName) {
        return path.join(subDirPath, subItem.name);
      }
    }
  }

  return null;
}

/**
 * 创建表单目录
 * 优先使用从系统配置清单解析的 module 字段，兜底使用 FORM_MODULE_MAP
 * @param {string} formName - 表单名称
 * @param {string} baseDir - 基础目录
 * @param {string} formType - 表单类型
 * @param {string} formUuid - 表单UUID
 * @param {string|null} moduleFromConfig - 从系统配置清单解析的分组名称
 * @returns {string|null} 创建的目录路径
 */
function createFormDirectory(formName, baseDir, formType, formUuid, moduleFromConfig = null) {
  try {
    // 优先使用系统配置清单中的分组，兜底使用 FORM_MODULE_MAP
    const moduleName = moduleFromConfig || FORM_MODULE_MAP[formName];
    const typeStr = formType.includes('流程') ? '流程表单' : '普通表单';
    const folderName = `${formName}「${typeStr}」`;

    let folderPath;
    if (moduleName) {
      // 有模块映射，创建到带「分组」后缀的模块目录（与 sync_config.js 一致）
      const groupDirName = `${moduleName}「分组」`;
      const groupPath = path.join(baseDir, groupDirName);
      if (!fs.existsSync(groupPath)) {
        fs.mkdirSync(groupPath, { recursive: true });
      }
      folderPath = path.join(groupPath, folderName);

      // 创建表单文件夹
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`   📁 已创建表单目录: ${groupDirName}/${folderName}`);
      } else {
        console.log(`   📁 使用已有表单目录: ${groupDirName}/${folderName}`);
      }
    } else {
      // 无模块映射，直接创建到项目根目录
      folderPath = path.join(baseDir, folderName);

      // 创建表单文件夹
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`   📁 已创建表单目录: ${folderName}`);
      } else {
        console.log(`   📁 使用已有表单目录: ${folderName}`);
      }
    }

    return folderPath;
  } catch (error) {
    console.error(`   ❌ 创建表单目录失败: ${error.message}`);
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('用法: node sync_form_schemas.js <项目目录> [应用ID] [--forms "表单1,表单2,..."]');
    console.log('');
    console.log('示例:');
    console.log('  同步所有表单: node sync_form_schemas.js "../../../进销存管理"');
    console.log('  同步指定表单: node sync_form_schemas.js "../../../进销存管理" --forms "产品信息,仓库信息"');
    console.log('  指定应用ID并同步指定表单: node sync_form_schemas.js "../../../进销存管理" "APP_XXX" --forms "产品信息"');
    console.log('');
    console.log('说明:');
    console.log('  - 从系统配置清单读取应用ID和表单UUID');
    console.log('  - 如果提供了应用ID参数，则优先使用参数值');
    console.log('  - 使用--forms参数可以只同步指定的表单（多个表单用逗号分隔）');
    process.exit(1);
  }
  
  const projectRoot = path.resolve(args[0]);
  const configPath = path.join(projectRoot, '系统配置清单.md');
  
  // 检查项目目录是否存在
  if (!fs.existsSync(projectRoot)) {
    console.error(`❌ 找不到项目目录: ${projectRoot}`);
    process.exit(1);
  }
  
  // 检查 sync-schema.js 是否存在
  if (!fs.existsSync(SCHEMA_SYNC_SCRIPT)) {
    console.error(`❌ 找不到脚本: ${SCHEMA_SYNC_SCRIPT}`);
    process.exit(1);
  }
  
  // 解析参数
  let appId = null;
  let targetForms = null; // 指定要同步的表单列表
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--forms' && i + 1 < args.length) {
      // 解析--forms参数，支持逗号分隔的多个表单名称
      targetForms = args[i + 1].split(',').map(f => f.trim()).filter(f => f);
      i++; // 跳过下一个参数
    } else if (!args[i].startsWith('--') && !appId) {
      // 第一个非--开头的参数是应用ID
      appId = args[i];
    }
  }
  
  // 如果没有提供应用ID，从系统配置清单读取
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
  
  // 从系统配置清单读取表单列表
  let forms = parseFormsFromConfig(configPath);
  
  if (forms.length === 0) {
    console.error('❌ 未能从系统配置清单解析出表单');
    console.error(`  请检查文件: ${configPath}`);
    process.exit(1);
  }
  
  // 如果指定了要同步的表单，过滤表单列表
  if (targetForms && targetForms.length > 0) {
    const originalCount = forms.length;
    forms = forms.filter(form => targetForms.some(target => form.formName.includes(target)));
    
    if (forms.length === 0) {
      console.error('❌ 未找到指定的表单');
      console.error(`  指定的表单: ${targetForms.join(', ')}`);
      console.error(`  可用的表单: ${parseFormsFromConfig(configPath).map(f => f.formName).join(', ')}`);
      process.exit(1);
    }
    
    console.log(`  已筛选: 从 ${originalCount} 个表单中选择 ${forms.length} 个进行同步`);
  }
  
  console.log('============================================================');
  console.log('  同步表单结构及组件ID');
  console.log('============================================================');
  console.log(`应用ID: ${appId}`);
  console.log(`项目目录: ${projectRoot}`);
  console.log(`表单数量: ${forms.length}${targetForms ? ' (已筛选)' : ' (全部)'}`);
  console.log('');
  
  let syncedCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const formName = form.formName;
    const formType = form.formType;
    const formUuid = form.formUuid;
    
    console.log(`\n[${i + 1}/${forms.length}] 同步: ${formName}`);
    
    if (!formUuid) {
      console.log(`   ⚠️  找不到表单UUID，跳过`);
      failedCount++;
      continue;
    }
    
    // 查找表单目录，如果不存在则自动创建
    let formDir = findFormDirectory(formName, projectRoot, formType);
    if (!formDir) {
      console.log(`   ⚠️  找不到表单目录，正在自动创建...`);
      formDir = createFormDirectory(formName, projectRoot, formType, formUuid, form.module || null);
      if (!formDir) {
        console.log(`   ❌ 创建表单目录失败，跳过`);
        failedCount++;
        continue;
      }
    }
    
    // 构建JSON文件路径（与文件夹名称保持一致）
    // formType可能是"表单"或"流程"，需要转换为"普通表单"或"流程表单"
    const typeStr = formType.includes('流程') ? '流程表单' : '普通表单';
    const jsonFileName = `${formName}「${typeStr}」.json`;
    const jsonFilePath = path.join(formDir, jsonFileName);
    
    try {
      // 调用 sync-schema.js，直接覆盖原JSON文件（使用完整路径）
      const nodeCmd = fs.existsSync(NODE_PATH) ? NODE_PATH : 'node';
      execSync(
        `"${nodeCmd}" "${SCHEMA_SYNC_SCRIPT}" "${appId}" "${formUuid}" "${jsonFilePath}"`,
        {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 120_000,
        }
      );
      
      // 生成组件ID清单
      generateComponentList(formDir, formName, formType, jsonFilePath);
      
      console.log(`   ✅ 同步完成`);
      syncedCount++;
    } catch (error) {
      console.log(`   ❌ 同步失败: ${error.message}`);
      failedCount++;
    }
  }
  
  console.log('\n============================================================');
  console.log('  同步完成');
  console.log('============================================================');
  console.log(`成功: ${syncedCount}/${forms.length}`);
  console.log(`失败: ${failedCount}/${forms.length}`);
  console.log('');
  
  process.exit(failedCount > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  });
}
