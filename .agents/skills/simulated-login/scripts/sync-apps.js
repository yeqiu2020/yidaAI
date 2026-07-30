#!/usr/bin/env node
/**
 * 应用列表管理工具
 * 用于管理「组织及应用信息.md」中的应用列表
 *
 * 版本: v1.2.0
 * 创建日期: 2026-03-23
 *
 * 使用方法:
 * node sync-apps.js                    # 查看当前应用列表
 * node sync-apps.js --add              # 添加新应用
 * node sync-apps.js --edit             # 编辑应用列表
 */

const fs = require('fs');
const path = require('path');
const { loadOrgConfig, ORG_CONFIG_FILE_MD } = require('./login-manager');

/**
 * 读取当前应用列表
 * @returns {Array} 应用列表
 */
function loadAppsFromMarkdown() {
  try {
    console.log(`  📁 读取文件: ${ORG_CONFIG_FILE_MD}`);
    const mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
    console.log(`  📊 文件大小: ${mdContent.length} 字符`);

    // 查找应用列表表格
    // 匹配 "## 应用列表" 标题后的表格内容
    const appTableRegex = /## 应用列表[\s\S]*?\|[-\s|]+\|?\r?\n([\s\S]*?)(?=\n## |\n---|$)/;
    const match = mdContent.match(appTableRegex);

    // 调试信息
    console.log('  🔍 正在解析应用列表表格...');
    if (!match) {
      console.log('  ⚠️ 未找到应用列表表格');
      return [];
    }
    console.log(`  ✅ 找到表格内容，长度: ${match[1].length}`);

    let tableContent = match[1];
    // 处理 Windows 换行符
    tableContent = tableContent.replace(/\r\n/g, '\n');
    console.log(`  📄 表格内容预览: ${tableContent.substring(0, 100)}...`);
    const lines = tableContent.split('\n').filter(line => line.trim());
    console.log(`  📝 表格行数: ${lines.length}`);
    lines.forEach((line, i) => {
      console.log(`     行${i+1}: ${line.substring(0, 50)}`);
    });

    const apps = [];
    for (const line of lines) {
      // 解析表格行：| 序号 | 应用名称 | 应用ID | 应用类型 | 备注 |
      const rowMatch = line.match(/\|\s*\d+\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (rowMatch) {
        const appName = rowMatch[1].trim();
        const appId = rowMatch[2].trim();

        // 跳过空行
        if (appName && appName !== '-' && appId && appId !== '-') {
          apps.push({
            name: appName,
            appId: appId,
            type: rowMatch[3].trim(),
            remark: rowMatch[4].trim()
          });
        }
      }
    }

    return apps;
  } catch (error) {
    console.error('读取应用列表失败:', error.message);
    return [];
  }
}

/**
 * 更新 Markdown 文件中的应用列表
 * @param {Array} apps - 应用列表
 */
function saveAppsToMarkdown(apps) {
  console.log('\n📝 正在更新 Markdown 文件...');

  try {
    let mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');

    // 构建新的应用列表表格
    let appTable = '';

    if (apps.length === 0) {
      appTable += '| 1 | - | - | - | 暂无应用数据 |\n';
    } else {
      apps.forEach((app, index) => {
        const appName = app.name || '未命名应用';
        const appId = app.appId || '';
        const appType = app.type || '普通应用';
        const remark = app.remark || '';

        appTable += `| ${index + 1} | ${appName} | ${appId} | ${appType} | ${remark} |\n`;
      });

      // 添加一个空行作为预留
      appTable += `| ${apps.length + 1} | - | - | - | 预留空行 |\n`;
    }

    // 替换原有的应用列表表格
    const appTableRegex = /(## 应用列表[\s\S]*?\|------\|----------\|----------------\|----------\|------\|\n)([\s\S]*?)(?=\n## |\n---|$)/;
    mdContent = mdContent.replace(appTableRegex, `$1${appTable}$3`);

    // 更新最后更新时间
    mdContent = mdContent.replace(
      /最后更新时间\s*\|\s*[^|]+\s*\|/,
      `最后更新时间 | ${new Date().toISOString()} |`
    );

    fs.writeFileSync(ORG_CONFIG_FILE_MD, mdContent);
    console.log(`  ✅ 已更新 ${apps.length} 个应用到 Markdown 文件`);

  } catch (error) {
    console.error('  ❌ 更新 Markdown 文件失败:', error.message);
  }
}

/**
 * 显示当前应用列表
 */
function showAppList() {
  const apps = loadAppsFromMarkdown();

  console.log('\n📋 当前应用列表：');
  console.log('='.repeat(80));

  if (apps.length === 0) {
    console.log('  暂无应用');
  } else {
    apps.forEach((app, index) => {
      console.log(`  ${index + 1}. ${app.name}`);
      console.log(`     应用ID: ${app.appId}`);
      console.log(`     类型: ${app.type}`);
      if (app.remark) {
        console.log(`     备注: ${app.remark}`);
      }
      console.log('');
    });
  }

  console.log('='.repeat(80));
  console.log(`  共 ${apps.length} 个应用\n`);

  return apps;
}

/**
 * 添加新应用
 */
function addApp() {
  console.log('\n➕ 添加新应用');
  console.log('='.repeat(80));

  // 这里简化处理，实际可以通过命令行参数或交互式输入
  // 由于当前环境不支持交互式输入，我们展示如何使用

  console.log('  请手动编辑「组织及应用信息.md」文件，在应用列表表格中添加：');
  console.log('');
  console.log('  | 序号 | 应用名称 | 应用ID (appId) | 应用类型 | 备注 |');
  console.log('  |------|----------|----------------|----------|------|');
  console.log('  | 2 | 你的应用名称 | APP_XXXXXXXX | 普通应用 | 应用说明 |');
  console.log('');
  console.log('  或者使用以下格式直接追加到文件：\n');

  // 显示当前已有的应用作为参考
  const apps = loadAppsFromMarkdown();
  if (apps.length > 0) {
    console.log('  当前已有应用：');
    apps.forEach((app, index) => {
      console.log(`  ${index + 1}. ${app.name} (${app.appId})`);
    });
  }

  console.log('='.repeat(80) + '\n');
}

/**
 * 主函数
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  宜搭应用列表管理工具');
  console.log('='.repeat(80));

  // 检查组织配置文件是否存在
  if (!fs.existsSync(ORG_CONFIG_FILE_MD)) {
    console.error('\n❌ 未找到组织配置文件：组织及应用信息.md');
    console.error('   请先创建该文件或运行登录流程');
    process.exit(1);
  }

  // 加载组织配置
  const orgConfig = loadOrgConfig();
  if (!orgConfig || !orgConfig.base_url) {
    console.error('\n❌ 未找到组织配置，请先运行登录流程');
    process.exit(1);
  }

  console.log(`\n📋 组织信息:`);
  console.log(`  组织名称: ${orgConfig.name}`);
  console.log(`  完整域名: ${orgConfig.base_url}`);

  // 解析命令行参数
  const args = process.argv.slice(2);

  if (args.includes('--add')) {
    addApp();
  } else if (args.includes('--edit')) {
    console.log('\n✏️  请直接编辑文件：组织及应用信息.md');
    console.log('   文件路径：' + ORG_CONFIG_FILE_MD + '\n');
  } else {
    // 默认显示应用列表
    showAppList();

    console.log('💡 提示：');
    console.log('  添加应用：直接编辑「组织及应用信息.md」文件');
    console.log('  文件位置：' + ORG_CONFIG_FILE_MD);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('  完成！');
  console.log('='.repeat(80) + '\n');
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('程序运行出错:', error);
    process.exit(1);
  });
}
