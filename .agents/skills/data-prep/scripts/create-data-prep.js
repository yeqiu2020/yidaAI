#!/usr/bin/env node
/**
 * create-data-prep.js - 通过浏览器自动化创建宜搭数据准备（可视化ETL）
 *
 * 使用 playwright-cli 工具自动化操作宜搭数据工厂的数据准备设计器，
 * 创建可视化ETL数据流，实现多表数据加工。
 *
 * 用法: node create-data-prep.js --appType <appType> --name <数据准备名称> --inputs <输入表1,输入表2> [--operations <操作描述>]
 *
 * 示例:
 *   node create-data-prep.js --appType APP_FDK8IG9UIDEFV2PTPDYL --name "财务收支ETL" --inputs "收款登记,费用报销,退款登记" --operations "关联,聚合"
 *
 * 前置条件:
 *   1. 已安装 playwright-cli 并可用
 *   2. 用户已登录宜搭平台（.cookies.json 存在且有效）
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Phase 6: 引入 lib/core/utils 作为统一的项目根目录查找实现
const coreUtils = require('../../../../lib/core/utils');

// Phase 6: findProjectRoot 委托给 lib/core/utils.findProjectRoot（统一实现）
function findProjectRoot() {
  return coreUtils.findProjectRoot();
}

const projectRoot = findProjectRoot();

// ── 参数解析 ────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    appType: '',
    name: '',
    inputs: [],
    operations: [],
    headed: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--appType':
        config.appType = args[++i];
        break;
      case '--name':
        config.name = args[++i];
        break;
      case '--inputs':
        config.inputs = args[++i].split(',').map(s => s.trim());
        break;
      case '--operations':
        config.operations = args[++i].split(',').map(s => s.trim());
        break;
      case '--headed':
        config.headed = true;
        break;
      case '--help':
      case '-h':
        console.log('用法: node create-data-prep.js --appType <appType> --name <数据准备名称> --inputs <输入表1,输入表2> [--operations <操作描述>] [--headed]');
        console.log('\n参数说明:');
        console.log('  --appType     应用ID');
        console.log('  --name        数据准备名称');
        console.log('  --inputs      输入表单名称，逗号分隔');
        console.log('  --operations  数据操作描述，逗号分隔（如: 关联,聚合,清洗）');
        console.log('  --headed      以有头模式打开浏览器');
        process.exit(0);
      default:
        break;
    }
  }

  const missing = [];
  if (!config.appType) { missing.push('--appType'); }
  if (!config.name) { missing.push('--name'); }
  if (config.inputs.length === 0) { missing.push('--inputs'); }

  if (missing.length > 0) {
    console.error('❌ 缺少必填参数:', missing.join(', '));
    console.error('使用 --help 查看帮助');
    process.exit(1);
  }

  return config;
}

// ── 数据集配置文件更新 ────────────────────────────────

function updateDatasetConfig(prepName, cubeCode, inputs, operations) {
  const configPath = path.join(projectRoot, '数据集配置.md');
  const date = new Date().toISOString().slice(0, 10);
  const inputsStr = inputs.join('、');
  const opsStr = operations.length > 0 ? operations.join('、') : 'ETL处理';

  let existingContent = '';
  if (fs.existsSync(configPath)) {
    existingContent = fs.readFileSync(configPath, 'utf-8');
  }

  // 如果文件已存在且已有数据准备部分，追加；否则创建/覆盖
  if (existingContent.includes('## 数据准备列表')) {
    // 在数据准备列表表格中追加一行
    const newRow = `| ${prepName} | ${cubeCode} | 数据准备 | ${inputsStr} | ${opsStr} | ${date} |`;
    existingContent = existingContent.replace(
      /(\|\s*---\|.*\n)((?:\|.*\n)*?)(\n---|\n## )/,
      `$1$2${newRow}\n$3`
    );
    fs.writeFileSync(configPath, existingContent, 'utf-8');
  } else {
    // 追加数据准备部分
    const prepSection = `
---

## 数据准备列表

| 数据集名称 | cubeCode | 类型 | 输入表 | 操作 | 创建时间 |
|-----------|----------|------|--------|------|----------|
| ${prepName} | ${cubeCode} | 数据准备 | ${inputsStr} | ${opsStr} | ${date} |
`;
    if (existingContent) {
      // 在"## 备注"之前插入
      existingContent = existingContent.replace(
        /(\n---\n\n## 备注)/,
        prepSection + '$1'
      );
      fs.writeFileSync(configPath, existingContent, 'utf-8');
    } else {
      const content = `# 数据集配置

> 本文件存储视图表和数据集的 cubeCode，供报表 Skill 调用

---

## 视图表列表

| 数据集名称 | cubeCode | 类型 | 主表 | 关联表 | 创建时间 |
|-----------|----------|------|------|--------|----------|

${prepSection}
---

## 备注

此配置文件由 dataset/data-prep Skill 自动生成。
最后更新: ${date}
`;
      fs.writeFileSync(configPath, content, 'utf-8');
    }
  }
  console.log(`\n✅ 数据集配置已更新: ${configPath}`);
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  const SEP = '='.repeat(50);
  console.log(SEP);
  console.log('🔄 宜搭数据准备创建工具（浏览器自动化）');
  console.log(SEP);
  console.log('应用 ID:', config.appType);
  console.log('数据准备名称:', config.name);
  console.log('输入表:', config.inputs.join(', '));
  console.log('操作:', config.operations.length > 0 ? config.operations.join(', ') : '默认ETL');
  console.log();

  // 检查 playwright-cli
  console.log('[Step 0] 检查 playwright-cli...');
  let cliAvailable = false;
  try {
    execSync('playwright-cli --version', { encoding: 'utf-8', stdio: 'pipe', cwd: projectRoot });
    cliAvailable = true;
    console.log('  playwright-cli 可用');
  } catch (err) {
    console.log('  ⚠️ playwright-cli 不可用，将输出操作指南');
  }

  if (!cliAvailable) {
    printManualGuide(config);
    process.exit(0);
  }

  // Step 1: 导航到数据集页面
  console.log('\n[Step 1] 导航到数据集页面...');
  const datasetUrl = `https://wggfro.aliwork.com/${config.appType}/admin/appSetting/dataset`;
  const { execSync: es } = require('child_process');
  try {
    es(`playwright-cli ${config.headed ? 'open --headed' : 'open'}`, { encoding: 'utf-8', cwd: projectRoot, timeout: 30000 });
    es(`playwright-cli goto ${datasetUrl}`, { encoding: 'utf-8', cwd: projectRoot, timeout: 30000 });
    es('playwright-cli wait --load networkidle', { encoding: 'utf-8', cwd: projectRoot, timeout: 30000 });
  } catch (err) {
    console.log('  浏览器操作失败:', err.message);
  }

  // Step 2: 点击"新建数据集" → "从数据准备"
  console.log('\n[Step 2] 点击"新建数据集" → "从数据准备"...');
  try {
    es(`playwright-cli eval "var btns = document.querySelectorAll('button'); for (var i = 0; i < btns.length; i++) { if (btns[i].textContent.includes('新建数据集')) { btns[i].click(); break; } } 'done'"`, { encoding: 'utf-8', cwd: projectRoot, timeout: 10000 });
  } catch (err) { /* ignore */ }

  setTimeout(() => {}, 1500);

  try {
    es(`playwright-cli eval "var items = document.querySelectorAll('[role=menuitem], [role=option], .next-menu-item'); for (var i = 0; i < items.length; i++) { if (items[i].textContent.trim().includes('从数据准备')) { items[i].click(); break; } } 'done'"`, { encoding: 'utf-8', cwd: projectRoot, timeout: 10000 });
  } catch (err) { /* ignore */ }

  console.log('  ⚠️ 数据准备设计器运行在独立域名 flow.data.aliwork.com');
  console.log('  可能需要处理隐私协议弹窗（点击"同意并继续"）');

  // Step 3: 输出操作指南
  console.log('\n' + SEP);
  console.log('📋 数据准备创建操作指南');
  console.log(SEP);
  console.log(`
请在浏览器中完成以下步骤：

1. 如果出现隐私协议弹窗，点击"同意并继续"
2. 在数据准备设计器中，设计数据流：

   输入节点（从左侧拖拽）:
${config.inputs.map((input, i) => `   - 输入节点${i + 1}: 选择表单"${input}"`).join('\n')}

   处理节点（根据需求拖拽）:
${config.operations.length > 0 ? config.operations.map(op => `   - ${getOperationGuide(op)}`).join('\n') : '   - 根据业务需求添加处理节点'}

   输出节点:
   - 配置输出字段和数据集名称: ${config.name}

3. 连线: 输入节点 → 处理节点 → 输出节点
4. 点击"保存"
5. 点击"运行"测试数据流
6. 点击"发布"
7. 获取 cubeCode（格式: PREP_XXXXXXXXXXXXXXXXXXXXXXXXXXXXX）

数据准备设计器URL:
  https://flow.data.aliwork.com/dataflow/index?namespaceCode=${config.appType}

创建成功后，请将 cubeCode 通知 AI 助手
`);
}

function getOperationGuide(op) {
  const guides = {
    '关联': '关联节点 - 配置关联字段和关联方式（左关联/内关联/全关联）',
    '合并': '合并节点 - 选择需要合并的数据源，配置合并规则',
    '聚合': '聚合节点 - 配置分组字段和聚合函数（求和/计数/平均值等）',
    '清洗': '清洗节点 - 配置清洗规则（去重/过滤条件/空值处理）',
    '计算': '计算节点 - 配置计算公式，添加计算字段',
    '过滤': '清洗节点 - 配置过滤条件',
    '去重': '清洗节点 - 配置去重规则',
  };
  return guides[op] || `${op}节点 - 根据需求配置`;
}

function printManualGuide(config) {
  console.log('\n' + '='.repeat(50));
  console.log('📋 手动创建数据准备指南');
  console.log('='.repeat(50));
  console.log(`
由于 playwright-cli 不可用，请按以下步骤手动创建数据准备：

1. 登录宜搭平台: https://wggfro.aliwork.com
2. 进入应用: ${config.appType}
3. 导航到: 应用设置 → 数据工厂 → 数据集
   直接链接: https://wggfro.aliwork.com/${config.appType}/admin/appSetting/dataset
4. 点击"新建数据集" → "从数据准备"
5. 如出现隐私协议，点击"同意并继续"
6. 在数据准备设计器中:
   a. 从左侧拖拽"输入节点"，选择表单:
${config.inputs.map((input, i) => `      - 输入${i + 1}: ${input}`).join('\n')}
   b. 添加处理节点:
${config.operations.length > 0 ? config.operations.map(op => `      - ${getOperationGuide(op)}`).join('\n') : '      - 根据需求添加处理节点'}
   c. 添加"输出节点"，配置输出名称: ${config.name}
   d. 连线: 输入 → 处理 → 输出
7. 保存 → 运行测试 → 发布
8. 获取 cubeCode（PREP_开头）

数据准备设计器:
  https://flow.data.aliwork.com/dataflow/index?namespaceCode=${config.appType}

创建完成后，请更新 数据集配置.md 文件中的 cubeCode 信息。
`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('执行异常:', err.message);
    process.exit(1);
  });
}
