#!/usr/bin/env node
/**
 * 宜搭表单列表同步工具 - Playwright版
 * 版本: 1.7.1
 * 更新日期: 2026-05-17
 *
 * v1.7.1 更新内容:
 * - 修复流程Code同步问题：fetch_forms_playwright.js v1.2.1 修复了从第4列提取流程Code的逻辑
 * - 宜搭部署运维表格中，流程Code在独立的第4列，不是和第3列在一起
 *
 * v1.7.0 更新内容:
 * - 修复 readExistingForms 函数支持新格式（页面名称「类型」| 表单UUID | 流程Code）
 * - 正确解析「普通表单」和「流程表单」类型
 * - 流程Code为"-"时正确设置为null
 *
 * v1.6.0 更新内容:
 * - 移除「未分组表单」目录逻辑，表单直接在项目根目录下创建
 *
 * v1.5.0 更新内容:
 * - 简化表单UUID清单表格格式，只保留3列：序号、页面名称「类型」、表单UUID
 * - 移除"页面类型"、"流程Code"列
 * - 【注意】v1.7.0已恢复流程Code列支持
 *
 * 功能: 使用Playwright从宜搭部署运维页面获取表单列表，自动同步本地文件夹结构
 * 解决API端点404问题，更加稳定可靠
 * 支持自动删除本地多余表单、创建新增表单文件夹
 * 
 * v1.4.0 更新内容:
 * - 修复表单重命名识别问题：通过UUID对比，正确识别表单名称修改（而非删除+新增）
 * - 新增重命名表单处理：自动重命名本地文件夹并更新文件内容
 * - 改进差异对比逻辑：排除重命名表单的旧文件夹被误删
 *
 * 用法:
 *   node sync_form_list_playwright.js <项目目录> [应用ID] [选项]
 *   示例: node sync_form_list_playwright.js "./进销存管理"
 *   示例: node sync_form_list_playwright.js "./进销存管理" "APP_XXX" --visual
 *
 * 选项:
 *   --visual    可视化模式：显示浏览器窗口，高亮操作元素
 *   --help      显示帮助信息
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');

// Node.js 路径（解决环境变量未生效问题）
const NODE_PATH = process.env.NODE_PATH || 'C:\\Program Files\\nodejs\\node.exe';

// 颜色配置（用于终端输出）
const Colors = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  CYAN: '\x1b[36m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RED: '\x1b[31m'
};

/**
 * 打印带颜色的步骤信息（可视化模式）
 */
function printStep(stepNum, message) {
  console.log(`\n${Colors.CYAN}${Colors.BRIGHT}${'='.repeat(80)}${Colors.RESET}`);
  console.log(`${Colors.CYAN}${Colors.BRIGHT}  步骤 ${stepNum}: ${message}${Colors.RESET}`);
  console.log(`${Colors.CYAN}${Colors.BRIGHT}${'='.repeat(80)}${Colors.RESET}`);
}

/**
 * 打印信息
 */
function printInfo(message, visual = false) {
  if (visual) {
    console.log(`${Colors.BLUE}ℹ️  ${message}${Colors.RESET}`);
  } else {
    console.log(`ℹ️  ${message}`);
  }
}

/**
 * 打印成功信息
 */
function printSuccess(message, visual = false) {
  if (visual) {
    console.log(`${Colors.GREEN}✅ ${message}${Colors.RESET}`);
  } else {
    console.log(`✅ ${message}`);
  }
}

/**
 * 打印警告信息
 */
function printWarning(message, visual = false) {
  if (visual) {
    console.log(`${Colors.YELLOW}⚠️  ${message}${Colors.RESET}`);
  } else {
    console.log(`⚠️  ${message}`);
  }
}

/**
 * 打印错误信息
 */
function printError(message, visual = false) {
  if (visual) {
    console.log(`${Colors.RED}❌ ${message}${Colors.RESET}`);
  } else {
    console.log(`❌ ${message}`);
  }
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
============================================================
  宜搭表单列表同步工具 - Playwright版
  版本: 1.3.0
============================================================

用法:
  node sync_form_list_playwright.js <项目目录> [应用ID] [选项]

参数:
  <项目目录>  项目根目录路径，包含系统配置清单.md
  [应用ID]    可选，宜搭应用ID，不提供则从系统配置清单读取

选项:
  --visual    可视化模式：显示浏览器窗口，高亮操作元素，彩色输出
  --help      显示帮助信息

示例:
  # 标准模式（后台运行，自动更新配置）
  node sync_form_list_playwright.js "./进销存管理"
  
  # 可视化模式（显示浏览器，适合调试和演示）
  node sync_form_list_playwright.js "./进销存管理" --visual
  
  # 指定应用ID
  node sync_form_list_playwright.js "./进销存管理" "APP_EQEQCWPLFZFK3Z85BB5C"

功能:
  1. 使用Playwright访问宜搭后台部署运维页面
  2. 获取完整的表单列表（名称、类型、UUID、流程Code）
  3. 对比本地和线上表单差异
  4. 自动删除本地多余的表单文件夹
  5. 自动创建新增表单的文件夹结构
  6. 更新系统配置清单.md

模式对比:
  标准模式 (--visual 未指定):
    - 浏览器在后台运行
    - 适合日常同步和自动化脚本
    - 自动更新系统配置清单
  
  可视化模式 (--visual):
    - 显示浏览器窗口
    - 高亮操作元素
    - 彩色步骤输出
    - 适合首次配置和调试

依赖:
  - Playwright: npm install -g playwright
  - Chromium: npx playwright install chromium
============================================================
  `);
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const projectDir = args[0];
  
  // 检查是否有 --visual 选项
  const visualMode = args.includes('--visual') || args.includes('-v');
  
  // 应用ID是第二个非选项参数
  let appId = null;
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith('--')) {
      appId = args[i];
      break;
    }
  }

  return { projectDir, appId, visualMode };
}

/**
 * 从系统配置清单读取应用ID
 */
function readAppIdFromConfig(projectDir) {
  const configPath = path.join(projectDir, '系统配置清单.md');

  if (!fs.existsSync(configPath)) {
    throw new Error(`系统配置清单不存在: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf8');

  // 匹配应用编码（支持转义格式 APP\_XXX 和普通格式 APP_XXX）
  const match = content.match(/APP[_\\]+([A-Z0-9]+)/);
  if (match) {
    // 返回标准化的应用ID
    return 'APP_' + match[1].replace(/\\/g, '');
  }

  throw new Error('无法从系统配置清单读取应用ID');
}

/**
 * 从系统配置清单读取应用名称
 */
function readAppNameFromConfig(projectDir) {
  const configPath = path.join(projectDir, '系统配置清单.md');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf8');

  const match = content.match(/应用名称\s*\|\s*([^|]+)\|/);
  if (match) {
    return match[1].trim();
  }

  return null;
}

/**
 * 从系统配置清单读取现有表单列表
 */
function readExistingForms(projectDir) {
  const configPath = path.join(projectDir, '系统配置清单.md');

  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf8');
  const forms = [];

  // 匹配表单列表表格行（支持4列格式：序号、页面名称「类型」、表单UUID、流程Code）
  // 格式: | 1 | 机构信息「普通表单」 | FORM-XXX | - |
  const formPattern = /\|\s*(\d+)\s*\|\s*([^|]+?)「([^|]+?)」\s*\|\s*`?(FORM-[A-Z0-9]{32}[A-Z0-9]{4})`?\s*\|\s*([^|]*)\s*\|/g;

  let match;
  while ((match = formPattern.exec(content)) !== null) {
    const typeStr = match[3].trim();
    const type = typeStr === '流程表单' ? '流程' : '表单';
    forms.push({
      index: parseInt(match[1]),
      name: match[2].trim(),
      type: type,
      formUuid: match[4].trim(),
      processCode: match[5] && match[5].trim() !== '-' ? match[5].trim() : null
    });
  }

  return forms;
}

/**
 * 扫描本地表单文件夹
 */
function scanLocalFormFolders(projectDir) {
  const forms = [];
  
  // 遍历项目目录下的所有子目录
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('01')) {
      const modulePath = path.join(projectDir, entry.name);
      const moduleEntries = fs.readdirSync(modulePath, { withFileTypes: true });
      
      for (const moduleEntry of moduleEntries) {
        if (moduleEntry.isDirectory() && moduleEntry.name.includes('「')) {
          // 提取表单名称和类型
          const match = moduleEntry.name.match(/^(.+)「(普通表单|流程表单)」$/);
          if (match) {
            forms.push({
              name: match[1],
              type: match[2] === '流程表单' ? '流程' : '表单',
              folderPath: path.join(modulePath, moduleEntry.name),
              moduleName: entry.name
            });
          }
        }
      }
    }
  }
  
  return forms;
}

/**
 * 删除本地表单文件夹
 */
function deleteLocalFormFolder(folderPath, visualMode) {
  try {
    if (fs.existsSync(folderPath)) {
      // 递归删除文件夹
      fs.rmSync(folderPath, { recursive: true, force: true });
      printSuccess(`已删除本地文件夹: ${path.basename(folderPath)}`, visualMode);
      return true;
    }
  } catch (error) {
    printError(`删除文件夹失败: ${folderPath} - ${error.message}`, visualMode);
    return false;
  }
  return false;
}

/**
 * 重命名本地表单文件夹
 * 当表单名称修改但UUID不变时使用
 */
function renameFormFolder(projectDir, renamedItem, localFolders, visualMode) {
  try {
    // 查找旧名称对应的文件夹
    const oldFolder = localFolders.find(f => f.name === renamedItem.oldName);
    if (!oldFolder) {
      printWarning(`找不到旧文件夹: ${renamedItem.oldName}，将创建新文件夹`, visualMode);
      // 创建新文件夹
      return createFormFolder(projectDir, renamedItem.newForm, visualMode);
    }

    const oldFolderPath = oldFolder.folderPath;
    if (!fs.existsSync(oldFolderPath)) {
      printWarning(`旧文件夹不存在: ${oldFolderPath}，将创建新文件夹`, visualMode);
      return createFormFolder(projectDir, renamedItem.newForm, visualMode);
    }

    // 构建新文件夹路径
    const typeStr = renamedItem.type === '流程' ? '流程表单' : '普通表单';
    const newFolderName = `${renamedItem.newName}「${typeStr}」`;
    const newFolderPath = path.join(path.dirname(oldFolderPath), newFolderName);

    // 如果新文件夹已存在，不执行重命名
    if (fs.existsSync(newFolderPath)) {
      printInfo(`目标文件夹已存在: ${newFolderName}，跳过重命名`, visualMode);
      return false;
    }

    // 执行重命名
    fs.renameSync(oldFolderPath, newFolderPath);
    printSuccess(`已重命名文件夹: ${path.basename(oldFolderPath)} → ${newFolderName}`, visualMode);

    // 更新文件夹内的文件内容（表单名称）
    updateFormFilesAfterRename(newFolderPath, renamedItem.oldName, renamedItem.newName, renamedItem.formUuid, typeStr);

    return true;
  } catch (error) {
    printError(`重命名文件夹失败: ${renamedItem.oldName} → ${renamedItem.newName} - ${error.message}`, visualMode);
    return false;
  }
}

/**
 * 表单重命名后更新文件夹内的文件
 */
function updateFormFilesAfterRename(folderPath, oldName, newName, formUuid, typeStr) {
  try {
    const files = fs.readdirSync(folderPath);
    
    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // 替换文件内容中的旧表单名称
        content = content.replace(new RegExp(oldName, 'g'), newName);
        
        // 如果是JSON文件，确保formName字段正确
        if (file.endsWith('.json')) {
          try {
            const json = JSON.parse(content);
            if (json.formName) {
              json.formName = newName;
              content = JSON.stringify(json, null, 2);
            }
          } catch (e) {
            // 不是有效的JSON，只替换文本
          }
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
      }
    });
  } catch (error) {
    console.error(`更新文件内容失败: ${error.message}`);
  }
}

/**
 * 创建新的表单文件夹
 */
function createFormFolder(projectDir, form, visualMode) {
  try {
    // 根据表单类型确定模块
    const moduleMap = {
      '产品信息': '02基础信息',
      '仓库信息': '02基础信息',
      '库存盘点': '03库存管理',
      '库存调拨': '03库存管理',
      '客户信息': '04客户管理',
      '客户跟进': '04客户管理',
      '供应商信息': '05采购管理',
      '采购订单': '05采购管理',
      '采购入库': '05采购管理',
      '销售订单': '06销售管理',
      '销售出库': '06销售管理',
      '销售退货': '06销售管理',
      '收款登记': '07财务管理',
      '付款登记': '07财务管理',
      '开票登记': '07财务管理',
      '收票登记': '07财务管理',
      '每日审查': '08审查管理',
      '检查信息': '08审查管理',
      '审查提交': '08审查管理'
    };
    
    const moduleName = moduleMap[form.name];
    const typeStr = form.type === '流程' ? '流程表单' : '普通表单';
    const folderName = `${form.name}「${typeStr}」`;
    // 如果有模块映射，创建到模块目录；否则直接创建到项目根目录
    const folderPath = moduleName
      ? path.join(projectDir, moduleName, folderName)
      : path.join(projectDir, folderName);
    const modulePath = moduleName ? path.join(projectDir, moduleName) : null;

    // 创建模块目录（如果存在模块映射且目录不存在）
    if (modulePath && !fs.existsSync(modulePath)) {
      fs.mkdirSync(modulePath, { recursive: true });
    }

    // 创建表单文件夹
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      
      // 创建默认文件
      const defaultFiles = {
        [`${folderName}.json`]: JSON.stringify({
          formName: form.name,
          formUuid: form.formUuid,
          type: typeStr,
          components: [],
          createTime: new Date().toISOString()
        }, null, 2),
        '组件ID清单.md': `# ${form.name} - 组件ID清单\n\n## 📋 组件列表\n\n| 序号 | 组件类型 | 字段名称 | 组件ID (fieldId) |\n|:---:|---------|---------|-----------------|\n\n## 📊 统计信息\n\n| 统计项 | 数量 |\n|--------|------|\n| 组件总数 | 0 |\n`,
        '表单结构变更.md': `# ${form.name} - 表单结构变更记录\n\n## 变更历史\n\n| 版本 | 日期 | 变更内容 | 变更人 |\n|-----|------|---------|-------|\n| 1.0.0 | ${new Date().toISOString().split('T')[0]} | 表单创建 | 系统自动 |\n`
      };
      
      for (const [fileName, content] of Object.entries(defaultFiles)) {
        fs.writeFileSync(path.join(folderPath, fileName), content, 'utf8');
      }
      
      printSuccess(`已创建表单文件夹: ${moduleName}/${folderName}`, visualMode);
      return true;
    } else {
      printInfo(`表单文件夹已存在: ${moduleName}/${folderName}`, visualMode);
      return false;
    }
  } catch (error) {
    printError(`创建表单文件夹失败: ${form.name} - ${error.message}`, visualMode);
    return false;
  }
}

/**
 * 执行独立的Python脚本获取表单列表
 */
async function runPlaywrightScript(projectDir, appId, appName, visualMode) {
  // Node.js脚本路径
  const nodeScriptPath = path.join(__dirname, 'fetch_forms_playwright.js');
  
  // 检查Node.js脚本是否存在
  if (!fs.existsSync(nodeScriptPath)) {
    throw new Error(`Node.js脚本不存在: ${nodeScriptPath}`);
  }
  
  // 构建命令行参数
  const outputFile = path.join(projectDir, 'forms_deploy_list.json');
  const cookieFile = path.join(PROJECT_ROOT, '.cookies.json');
  const visualModeStr = visualMode ? 'true' : 'false';
  
  try {
    // 执行Node.js脚本（使用完整路径）
    const nodeCmd = fs.existsSync(NODE_PATH) ? NODE_PATH : 'node';
    execSync(`"${nodeCmd}" "${nodeScriptPath}" "${appId}" "${appName || appId}" "${outputFile}" "${cookieFile}" "${visualModeStr}"`, {
      encoding: 'utf8',
      timeout: 120000,
      cwd: projectDir,
      stdio: 'inherit'  // 将Node.js输出直接显示到终端
    });

    // 从输出文件读取结果
    if (fs.existsSync(outputFile)) {
      const data = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      // 清理输出文件
      fs.unlinkSync(outputFile);
      return data.forms || [];
    }

    return [];
  } catch (error) {
    throw new Error(`执行Python脚本失败: ${error.message}`);
  }
}

/**
 * 对比表单差异
 * 改进：支持识别表单重命名（UUID相同但名称不同）
 */
function compareForms(localForms, remoteForms, localFolders, visualMode) {
  const localMap = new Map(localForms.map(f => [f.formUuid, f]));
  const remoteMap = new Map(remoteForms.map(f => [f.formUuid, f]));
  const localFolderMap = new Map(localFolders.map(f => [f.name, f]));

  const added = [];
  const removed = [];
  const renamed = [];  // 新增：重命名的表单
  const unchanged = [];

  // 检测新增表单（平台有，本地配置没有）
  remoteForms.forEach(form => {
    if (!localMap.has(form.formUuid)) {
      added.push(form);
    } else {
      const localForm = localMap.get(form.formUuid);
      // 检测是否重命名（UUID相同但名称不同）
      if (localForm.name !== form.name) {
        renamed.push({
          oldName: localForm.name,
          newName: form.name,
          formUuid: form.formUuid,
          type: form.type,
          oldForm: localForm,
          newForm: form
        });
      } else {
        unchanged.push(form);
      }
    }
  });

  // 检测删除表单（本地有，平台没有）
  localForms.forEach(form => {
    if (!remoteMap.has(form.formUuid)) {
      removed.push(form);
    }
  });

  // 检测本地文件夹中多余的表单（本地文件夹有，平台没有）
  // 改进：排除重命名的表单（旧名称对应的文件夹需要重命名，而不是删除）
  const localOnlyFolders = [];
  localFolders.forEach(folder => {
    // 检查是否有相同名称的远程表单
    const existsInRemoteByName = remoteForms.some(rf => rf.name === folder.name);
    // 检查是否是重命名的表单（旧名称对应的文件夹）
    const isRenamedOldFolder = renamed.some(r => r.oldName === folder.name);
    
    if (!existsInRemoteByName && !isRenamedOldFolder) {
      localOnlyFolders.push(folder);
    }
  });

  return { added, removed, renamed, unchanged, localOnlyFolders };
}

/**
 * 更新系统配置清单
 */
function updateConfigFile(projectDir, appId, appName, forms, added, removed, visualMode) {
  const configPath = path.join(projectDir, '系统配置清单.md');

  if (!fs.existsSync(configPath)) {
    console.log(`⚠️ 系统配置清单不存在，跳过更新: ${configPath}`);
    return false;
  }

  let content = fs.readFileSync(configPath, 'utf8');

  // 更新版本号
  const versionMatch = content.match(/版本:\s*(\d+)\.(\d+)\.(\d+)/);
  let newVersion = '1.0.0';
  if (versionMatch) {
    const major = versionMatch[1];
    const minor = parseInt(versionMatch[2]);
    const patch = parseInt(versionMatch[3]) + 1;
    newVersion = `${major}.${minor}.${patch}`;
    content = content.replace(/版本:\s*\d+\.\d+\.\d+/, `版本: ${newVersion}`);
  }

  // 更新最后同步日期
  const today = new Date().toISOString().split('T')[0];
  content = content.replace(/最后同步:\s*\d{4}-\d{2}-\d{2}/, `最后同步: ${today}`);

  // 更新更新说明
  let updateNote = '同步表单列表';
  if (added.length > 0) {
    updateNote += `，新增${added.length}个`;
  }
  if (removed.length > 0) {
    updateNote += `，删除${removed.length}个`;
  }
  content = content.replace(/更新说明:.*/, `更新说明: ${updateNote}`);

  // 构建新的表单列表表格（包含流程Code列）
  const formTableHeader = `| 序号 | 页面名称「类型」 | 表单UUID | 流程Code |
|------|-----------------|----------|----------|`;

  const formRows = forms.map((form, index) => {
    const typeStr = form.type === '流程' ? '流程表单' : '普通表单';
    const processCode = form.processCode || '-';
    return `| ${index + 1} | ${form.name}「${typeStr}」 | ${form.formUuid} | ${processCode} |`;
  }).join('\n');

  // 替换表单列表部分
  const formTablePattern = /(## 📋 表单ID清单\n\n> \*\*说明\*\*：从宜搭平台[")"\s\S]*?)(\n\n## |\n## |\n\*\*\*)/;
  const newFormTable = `## 📋 表单ID清单

> **说明**：从宜搭平台「部署运维」页面获取所有页面编码。流程表单包含两个ID：表单UUID（页面编码）和流程Code（流程编码）

${formTableHeader}
${formRows}
`;

  if (formTablePattern.test(content)) {
    content = content.replace(formTablePattern, newFormTable + '\n\n***\n\n## ');
  }

  // 更新统计信息
  const normalCount = forms.filter(f => f.type === '表单').length;
  const processCount = forms.filter(f => f.type === '流程').length;
  content = content.replace(/表单总数:\s*\d+/, `表单总数: ${forms.length}`);
  content = content.replace(/普通表单:\s*\d+/, `普通表单: ${normalCount}`);
  content = content.replace(/流程表单:\s*\d+/, `流程表单: ${processCount}`);

  // 保存更新后的内容
  fs.writeFileSync(configPath, content, 'utf8');
  printSuccess(`已更新系统配置清单: ${configPath}`, visualMode);

  return true;
}

/**
 * 主函数
 */
async function main() {
  try {
    // 解析命令行参数
    const { projectDir, appId: providedAppId, visualMode } = parseArgs();

    // 验证项目目录
    const projectPath = path.resolve(projectDir);
    if (!fs.existsSync(projectPath)) {
      throw new Error(`项目目录不存在: ${projectPath}`);
    }

    console.log(`${Colors.CYAN}${Colors.BRIGHT}${'='.repeat(80)}${Colors.RESET}`);
    console.log(`${Colors.CYAN}${Colors.BRIGHT}  宜搭表单列表同步工具 - Playwright版${Colors.RESET}`);
    console.log(`${Colors.CYAN}${Colors.BRIGHT}  版本: 1.5.0${Colors.RESET}`);
    console.log(`${Colors.CYAN}${Colors.BRIGHT}${'='.repeat(80)}${Colors.RESET}`);

    printInfo(`项目目录: ${projectPath}`, visualMode);

    // 获取应用ID
    let appId = providedAppId;
    if (!appId) {
      appId = readAppIdFromConfig(projectPath);
      printInfo(`从配置读取应用ID: ${appId}`, visualMode);
    } else {
      printInfo(`使用指定应用ID: ${appId}`, visualMode);
    }

    // 获取应用名称
    const appName = readAppNameFromConfig(projectPath);

    // 读取本地配置
    const localForms = readExistingForms(projectPath);
    printInfo(`本地配置表单: ${localForms.length} 个`, visualMode);

    // 扫描本地表单文件夹
    const localFolders = scanLocalFormFolders(projectPath);
    printInfo(`本地表单文件夹: ${localFolders.length} 个`, visualMode);

    // 使用Playwright获取远程表单列表
    printInfo('启动Playwright获取表单列表...', visualMode);
    const remoteForms = await runPlaywrightScript(projectPath, appId, appName, visualMode);
    printInfo(`线上表单总数: ${remoteForms.length} 个`, visualMode);

    // 对比差异
    const { added, removed, renamed, unchanged, localOnlyFolders } = compareForms(localForms, remoteForms, localFolders, visualMode);

    console.log('\n🔍 差异对比结果:\n');
    
    if (added.length > 0) {
      console.log(`  ➕ 新增表单: ${added.length} 个`);
      added.forEach(form => {
        console.log(`    - ${form.name} (${form.formUuid})`);
      });
    }
    
    if (renamed.length > 0) {
      console.log(`\n  📝 重命名表单: ${renamed.length} 个`);
      renamed.forEach(item => {
        console.log(`    - ${item.oldName} → ${item.newName} (${item.formUuid})`);
      });
    }
    
    if (removed.length > 0) {
      console.log(`\n  ➖ 配置中待删除表单: ${removed.length} 个`);
      removed.forEach(form => {
        console.log(`    - ${form.name} (${form.formUuid})`);
      });
    }
    
    if (localOnlyFolders.length > 0) {
      console.log(`\n  🗑️  本地多余文件夹: ${localOnlyFolders.length} 个`);
      localOnlyFolders.forEach(folder => {
        console.log(`    - ${folder.moduleName}/${path.basename(folder.folderPath)}`);
      });
    }

    // 处理重命名的表单（先处理重命名，再处理删除和新增）
    if (renamed.length > 0) {
      printInfo('正在处理重命名的表单...', visualMode);
      let renamedCount = 0;
      for (const item of renamed) {
        if (renameFormFolder(projectPath, item, localFolders, visualMode)) {
          renamedCount++;
        }
      }
      printSuccess(`已处理 ${renamedCount}/${renamed.length} 个重命名表单`, visualMode);
    }

    // 删除本地多余的表单文件夹
    if (localOnlyFolders.length > 0) {
      printInfo('正在删除本地多余的表单文件夹...', visualMode);
      let deletedCount = 0;
      for (const folder of localOnlyFolders) {
        if (deleteLocalFormFolder(folder.folderPath, visualMode)) {
          deletedCount++;
        }
      }
      printSuccess(`已删除 ${deletedCount}/${localOnlyFolders.length} 个本地文件夹`, visualMode);
    }

    // 创建新增表单的文件夹
    if (added.length > 0) {
      printInfo('正在创建新增表单的文件夹...', visualMode);
      let createdCount = 0;
      for (const form of added) {
        if (createFormFolder(projectPath, form, visualMode)) {
          createdCount++;
        }
      }
      printSuccess(`已创建 ${createdCount}/${added.length} 个表单文件夹`, visualMode);
    }

    // 更新系统配置清单
    printInfo('正在更新系统配置清单...', visualMode);
    updateConfigFile(projectPath, appId, appName, remoteForms, added, removed, visualMode);

    console.log(`\n${Colors.GREEN}${Colors.BRIGHT}✅ 同步完成！${Colors.RESET}\n`);
    console.log('📊 同步统计:');
    console.log(`  - 线上表单总数: ${remoteForms.length}`);
    console.log(`  - 普通表单: ${remoteForms.filter(f => f.type === '表单').length}`);
    console.log(`  - 流程表单: ${remoteForms.filter(f => f.type === '流程').length}`);
    console.log(`  - 新增表单: ${added.length}`);
    console.log(`  - 重命名表单: ${renamed.length}`);
    console.log(`  - 删除配置: ${removed.length}`);
    console.log(`  - 删除本地文件夹: ${localOnlyFolders.length}`);
    console.log(`  - 保持一致: ${unchanged.length}`);

  } catch (error) {
    console.error(`\n${Colors.RED}❌ 错误: ${error.message}${Colors.RESET}`);
    process.exit(1);
  }
}

// 运行主函数
main();

