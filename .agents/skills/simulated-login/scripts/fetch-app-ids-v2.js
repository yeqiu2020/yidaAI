#!/usr/bin/env node
/**
 * [已废弃] 获取应用ID工具 V2
 * 通过点击应用，从 URL 或页面中提取应用编码（appId）
 *
 * ⚠️ 废弃说明：此文件未被任何脚本或 SKILL.md 引用，保留但不再维护。
 *    Phase 0 安全修复时补全了被截断的 main() 函数使其通过语法检查。
 *
 * 版本: v2.0.0
 * 创建日期: 2026-03-23
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadOrgConfig, loadCookies, ORG_CONFIG_FILE_MD } = require('./login-manager');

/**
 * 从 Markdown 文件读取应用列表
 * @returns {Array} 应用列表
 */
function loadAppsFromMarkdown() {
  try {
    const mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
    
    // 查找应用列表表格
    const appTableRegex = /## 应用列表[\s\S]*?\|[-\s|]+\|?\r?\n([\s\S]*?)(?=\n## |\n---|$)/;
    const match = mdContent.match(appTableRegex);
    
    if (!match) return [];
    
    let tableContent = match[1].replace(/\r\n/g, '\n');
    const lines = tableContent.split('\n').filter(line => line.trim());
    
    const apps = [];
    for (const line of lines) {
      const rowMatch = line.match(/\|\s*\d+\s*\|\s*([^|]+)\s*\|\s*([^|]*)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (rowMatch) {
        const appName = rowMatch[1].trim();
        const appId = rowMatch[2].trim();
        
        if (appName && appName !== '-') {
          apps.push({
            name: appName,
            appId: appId === '-' ? '' : appId,
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
 * 从应用页面获取应用ID
 * @param {Object} page - Playwright page 对象
 * @param {string} appName - 应用名称
 * @param {string} baseUrl - 宜搭基础URL
 * @returns {Promise<string|null>} 应用ID或null
 */
async function getAppIdFromPage(page, appName, baseUrl) {
  console.log(`\n  🔍 获取 "${appName}" 的应用ID...`);

  try {
    // 访问宜搭工作台
    await page.goto(`${baseUrl}/workPlatform`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 点击应用名称
    const appSelectors = [
      `text="${appName}"`,
      `[title="${appName}"]`,
      `div:has-text("${appName}")`,
      `span:has-text("${appName}")`,
      `a:has-text("${appName}")`
    ];

    let clicked = false;
    for (const selector of appSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          console.log(`    ✅ 点击应用: ${appName}`);
          clicked = true;
          break;
        }
      } catch (e) {
        // 继续尝试下一个选择器
      }
    }

    if (!clicked) {
      console.log(`    ⚠️ 无法点击应用: ${appName}`);
      return null;
    }

    // 等待页面加载
    await page.waitForTimeout(5000);

    // 获取当前页面URL
    const currentUrl = page.url();
    console.log(`    📄 当前URL: ${currentUrl.substring(0, 100)}...`);

    // 从URL中提取APP_ID
    const urlMatch = currentUrl.match(/APP_[A-Z0-9]+/);
    if (urlMatch) {
      console.log(`    ✅ 从URL找到应用ID: ${urlMatch[0]}`);
      return urlMatch[0];
    }

    // 如果URL中没有，尝试从页面内容中提取
    const pageContent = await page.content();
    const contentMatch = pageContent.match(/APP_[A-Z0-9]{20,}/);
    if (contentMatch) {
      console.log(`    ✅ 从页面内容找到应用ID: ${contentMatch[0]}`);
      return contentMatch[0];
    }

    // 尝试点击"应用设置"标签
    console.log(`    📝 尝试点击应用设置...`);
    
    // 等待并查找"应用设置"按钮
    const settingsSelectors = [
      'text="应用设置"',
      '[data-testid="app-settings"]',
      '.app-settings',
      '[class*="setting"]',
      'button:has-text("设置")'
    ];

    for (const sel of settingsSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          console.log(`    ✅ 点击设置 (选择器: ${sel})`);
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    // 等待设置页面加载
    await page.waitForTimeout(3000);

    // 从设置页面提取应用编码
    const settingsContent = await page.content();
    const settingsMatch = settingsContent.match(/APP_[A-Z0-9]{20,}/);
    if (settingsMatch) {
      console.log(`    ✅ 从设置页面找到应用ID: ${settingsMatch[0]}`);
      return settingsMatch[0];
    }

    console.log(`    ⚠️ 未找到应用ID`);
    return null;

  } catch (error) {
    console.log(`    ❌ 获取失败: ${error.message}`);
    return null;
  }
}

/**
 * 更新 Markdown 文件中的应用ID
 * @param {string} appName - 应用名称
 * @param {string} appId - 应用ID
 */
function updateAppIdInMarkdown(appName, appId) {
  try {
    let mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');

    // 查找并替换对应应用的 appId
    const rowRegex = new RegExp(`(\\|\\s*\\d+\\s*\\|\\s*${appName}\\s*\\|\\s*)[^|]*(\\s*\\|)`, 'g');

    if (mdContent.match(rowRegex)) {
      mdContent = mdContent.replace(rowRegex, `$1${appId}$2`);
      fs.writeFileSync(ORG_CONFIG_FILE_MD, mdContent);
      console.log(`    ✅ 已更新到 Markdown 文件`);
      return true;
    } else {
      console.log(`    ⚠️ 未在文件中找到应用: ${appName}`);
      return false;
    }

  } catch (error) {
    console.log(`    ❌ 更新文件失败: ${error.message}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  宜搭应用ID获取工具 V2');
  console.log('  （通过点击应用从URL或页面获取）');
  console.log('='.repeat(80));

  // 1. 加载组织配置
  const orgConfig = loadOrgConfig();
  if (!orgConfig?.base_url) {
    console.error('\n❌ 未找到组织配置');
    process.exit(1);
  }

  console.log(`\n📋 组织: ${orgConfig.name}`);
  console.log(`   域名: ${orgConfig.base_url}`);

  // 2. 加载应用列表
  const apps = loadAppsFromMarkdown();

  if (apps.length === 0) {
    console.log('\n⚠️ 未找到应用列表，请检查组织及应用信息.md');
    process.exit(0);
  }

  console.log(`\n📋 共找到 ${apps.length} 个应用`);

  // 3. 启动浏览器并逐个获取应用ID
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  // 加载已保存的 cookies
  const cookies = loadCookies();
  if (cookies && cookies.length > 0) {
    await context.addCookies(cookies);
  }

  const page = await context.newPage();

  for (const app of apps) {
    if (app.appId && app.appId !== '-') {
      console.log(`\n  ⏭️  "${app.name}" 已有应用ID: ${app.appId}，跳过`);
      continue;
    }

    const appId = await getAppIdFromPage(page, app.name, orgConfig.base_url);
    if (appId) {
      updateAppIdInMarkdown(app.name, appId);
    }
  }

  await browser.close();
  console.log('\n' + '='.repeat(80));
  console.log('  完成！');
  console.log('='.repeat(80) + '\n');
}

// 启动
if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ 执行失败:', err.message);
    process.exit(1);
  });
}