/**
 * 批量同步组织内多个应用到本地
 * 版本: 1.0.0
 * 更新日期: 2026-03-31
 * 
 * 功能: 读取组织及应用信息.md，批量同步指定应用或所有应用到本地
 * 用法: node sync_batch_apps.js [应用名称1,应用名称2,...]
 * 示例: 
 *   - 同步所有应用: node sync_batch_apps.js
 *   - 同步指定应用: node sync_batch_apps.js "进销存管理,客户管理"
 * 
 * 说明:
 * - 从组织及应用信息.md读取应用列表
 * - 自动创建项目目录
 * - 逐个同步每个应用的配置
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 脚本路径
const SYNC_ALL_CONFIGS_SCRIPT = path.join(__dirname, 'sync_all_configs.js');

/**
 * 解析组织及应用信息.md
 * @param {string} orgInfoPath - 组织及应用信息.md路径
 * @returns {Object} 组织信息和应用列表
 */
function parseOrgInfo(orgInfoPath) {
  if (!fs.existsSync(orgInfoPath)) {
    throw new Error(`组织及应用信息.md不存在: ${orgInfoPath}\n请先执行组织初始化步骤。`);
  }

  const content = fs.readFileSync(orgInfoPath, 'utf-8');
  
  // 解析组织信息 - 支持两种格式
  // 格式1: | **组织名称** | 值 |
  // 格式2: | 组织名称 | 值 |
  let orgNameMatch = content.match(/\|\s*\*?\*?组织名称\*?\*?\s*\|\s*([^|]+)\s*\|/);
  let corpIdMatch = content.match(/\|\s*\*?\*?[Cc]orp\s*[Ii][Dd]\*?\*?\s*\|\s*([^|]+)\s*\|/);
  let baseUrlMatch = content.match(/\|\s*\*?\*?(宜搭域名|完整域名)\*?\*?\s*\|\s*([^|]+)\s*\|/);
  
  const orgInfo = {
    orgName: orgNameMatch ? orgNameMatch[1].trim() : '未知',
    corpId: corpIdMatch ? corpIdMatch[1].trim() : '',
    baseUrl: baseUrlMatch ? baseUrlMatch[2].trim() : ''
  };

  // 解析应用列表
  const apps = [];
  // 匹配应用表格行: | 序号 | 应用名称 | 应用ID (appId) |
  // 格式: | 1 | 应用名称 | APP_XXX | 或 | 1 | 应用名称 | APP\_XXX |
  // 支持各种APP ID格式，支持带转义符的\_格式，支持序号带.的格式
  const appRegex = /\|\s*([\d.]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  let match;
  
  while ((match = appRegex.exec(content)) !== null) {
    const appId = match[3].trim().replace(/\\_/g, '_');
    // 只保留包含有效APP ID的行
    if (!appId.startsWith('APP_')) continue;
    apps.push({
      index: match[1].trim(),
      appName: match[2].trim(),
      appId: appId,
      appType: '普通应用'
    });
  }

  return { orgInfo, apps };
}

/**
 * 同步单个应用到本地
 * @param {Object} app - 应用信息
 * @param {string} rootDir - 根目录
 * @returns {Object} 同步结果
 */
async function syncSingleApp(app, rootDir) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 正在同步应用: ${app.appName}`);
  console.log(`   应用ID: ${app.appId}`);
  console.log(`${'='.repeat(60)}`);

  const projectDir = path.join(rootDir, app.appName);
  
  try {
    // 检查项目目录是否存在，不存在则创建
    if (!fs.existsSync(projectDir)) {
      console.log(`   📁 创建项目目录: ${projectDir}`);
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // 创建 01需求梳理 目录（用于存放原型页面和字段清单）
    const needDir = path.join(projectDir, '01需求梳理');
    if (!fs.existsSync(needDir)) {
      fs.mkdirSync(needDir, { recursive: true });
    }

    // 执行同步脚本
    console.log(`   🔄 执行同步...`);
    const cmd = `node "${SYNC_ALL_CONFIGS_SCRIPT}" "${projectDir}" "${app.appId}" "${app.appName}"`;
    
    try {
      execSync(cmd, { 
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 300000 // 5分钟超时
      });
      
      console.log(`   ✅ 同步成功: ${app.appName}`);
      return {
        success: true,
        appName: app.appName,
        appId: app.appId,
        projectDir: projectDir
      };
    } catch (syncError) {
      console.log(`   ⚠️ 同步完成但可能有警告: ${app.appName}`);
      return {
        success: true,
        appName: app.appName,
        appId: app.appId,
        projectDir: projectDir,
        warning: syncError.message
      };
    }
  } catch (error) {
    console.error(`   ❌ 同步失败: ${app.appName}`);
    console.error(`      错误: ${error.message}`);
    return {
      success: false,
      appName: app.appName,
      appId: app.appId,
      error: error.message
    };
  }
}

/**
 * 批量同步应用
 */
async function batchSyncApps() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 批量同步组织内应用到本地');
  console.log('='.repeat(70));

  // 获取根目录（当前工作目录）
  const rootDir = process.cwd();
  
  // 解析命令行参数
  const args = process.argv.slice(2);
  let targetApps = null; // null表示同步所有应用
  
  if (args.length > 0) {
    // 解析指定的应用名称列表
    targetApps = args[0].split(',').map(name => name.trim());
    console.log(`\n📋 指定同步应用: ${targetApps.join(', ')}`);
  } else {
    console.log(`\n📋 同步所有应用`);
  }

  // 读取组织及应用信息
  const orgInfoPath = path.join(rootDir, '组织及应用信息.md');
  console.log(`\n📖 读取组织信息: ${orgInfoPath}`);
  
  let orgData;
  try {
    orgData = parseOrgInfo(orgInfoPath);
  } catch (error) {
    console.error(`\n❌ ${error.message}`);
    process.exit(1);
  }

  console.log(`\n🏢 组织名称: ${orgData.orgInfo.orgName}`);
  console.log(`📊 应用总数: ${orgData.apps.length} 个`);

  // 筛选要同步的应用
  let appsToSync = orgData.apps;
  if (targetApps) {
    appsToSync = orgData.apps.filter(app => 
      targetApps.some(target => app.appName.includes(target) || target.includes(app.appName))
    );
    
    if (appsToSync.length === 0) {
      console.error(`\n❌ 未找到匹配的应用，可用的应用有:`);
      orgData.apps.forEach(app => console.log(`   - ${app.appName}`));
      process.exit(1);
    }
    
    console.log(`\n🎯 匹配到 ${appsToSync.length} 个应用`);
  }

  // 显示要同步的应用列表
  console.log(`\n📋 即将同步的应用:`);
  appsToSync.forEach((app, index) => {
    console.log(`   ${index + 1}. ${app.appName} (${app.appId})`);
  });

  // 执行同步
  console.log(`\n${'='.repeat(70)}`);
  console.log('开始批量同步...');
  console.log('='.repeat(70));

  const results = [];
  const total = appsToSync.length;
  for (let i = 0; i < appsToSync.length; i++) {
    const app = appsToSync[i];
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📌 同步进度: ${i + 1}/${total} — ${app.appName}`);
    console.log('─'.repeat(50));
    const result = await syncSingleApp(app, rootDir);
    results.push(result);
    if (result.success) {
      console.log(`✅ [${i + 1}/${total}] ${app.appName} 同步完成`);
    } else {
      console.log(`❌ [${i + 1}/${total}] ${app.appName} 同步失败: ${result.error}`);
    }
  }

  // 生成汇总报告
  console.log('\n' + '='.repeat(70));
  console.log('📊 同步汇总报告');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`\n✅ 同步成功: ${successCount} 个`);
  console.log(`❌ 同步失败: ${failCount} 个`);
  console.log(`📦 应用总数: ${results.length} 个`);

  if (failCount > 0) {
    console.log(`\n⚠️ 失败的应用:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.appName}: ${r.error}`);
    });
  }

  console.log(`\n📁 项目目录位置: ${rootDir}`);
  console.log('='.repeat(70));

  // 返回结果
  return {
    success: failCount === 0,
    total: results.length,
    successCount,
    failCount,
    results
  };
}

// 执行批量同步
batchSyncApps()
  .then(result => {
    console.log('\n✨ 批量同步完成！');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ 批量同步失败:', error.message);
    process.exit(1);
  });
