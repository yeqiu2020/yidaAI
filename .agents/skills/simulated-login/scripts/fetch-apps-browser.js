#!/usr/bin/env node
/**
 * 使用浏览器自动化获取宜搭应用列表
 * 通过 Playwright 访问宜搭后台，从页面中提取应用信息
 *
 * 版本: v1.0.0
 * 创建日期: 2026-03-23
 *
 * 使用方法:
 * node fetch-apps-browser.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadOrgConfig, loadCookies, ORG_CONFIG_FILE_MD } = require('./login-manager');

/**
 * 从宜搭后台页面获取应用列表
 * @param {string} baseUrl - 宜搭基础URL
 * @param {Array} cookies - Cookie数组
 * @returns {Promise<Array>} 应用列表
 */
async function fetchAppListFromBrowser(baseUrl, cookies) {
  console.log('🌐 启动浏览器...');

  const browser = await chromium.launch({ headless: false }); // 设置为 false 方便调试

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    // 添加 Cookie
    if (cookies && cookies.length > 0) {
      await context.addCookies(cookies);
      console.log(`  ✅ 已加载 ${cookies.length} 个 Cookie`);
    }

    const page = await context.newPage();

    // 访问宜搭应用管理页面
    // 尝试多个可能的 URL
    const possibleUrls = [
      `${baseUrl}/admin#/app/myApps`,
      `${baseUrl}/admin#/app/list`,
      `${baseUrl}/admin#/myApp`,
      `${baseUrl}/workPlatform`,
      `${baseUrl}/admin`
    ];

    let currentUrl = '';
    for (const url of possibleUrls) {
      console.log(`\n📍 尝试访问: ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        currentUrl = page.url();
        console.log(`  当前页面: ${currentUrl}`);

        // 检查是否需要登录
        if (currentUrl.includes('login') || currentUrl.includes('sign')) {
          console.log('  ⚠️ 需要登录，跳过此 URL');
          continue;
        }

        // 检查页面是否包含应用列表
        const hasAppList = await page.evaluate(() => {
          // 检查是否有应用相关的元素
          const appElements = document.querySelectorAll(
            '[data-app-id], .app-item, .application-item, .app-card, [class*="app"]'
          );
          return appElements.length > 0;
        });

        if (hasAppList) {
          console.log('  ✅ 页面包含应用列表元素');
          break;
        }

      } catch (error) {
        console.log(`  ❌ 访问失败: ${error.message}`);
      }
    }

    // 等待页面完全加载
    console.log('\n⏳ 等待页面加载...');
    await page.waitForTimeout(5000);

    // 截图保存
    const screenshotPath = path.join(__dirname, 'debug-apps-page.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 页面截图已保存: ${screenshotPath}`);

    // 尝试多种方式提取应用列表
    console.log('\n🔍 尝试提取应用列表...');

    // 方式1: 从 window 对象获取
    const appsFromWindow = await page.evaluate(() => {
      // 尝试多种可能存储应用列表的变量
      const possibleKeys = [
        'appList', 'APP_LIST', 'apps', 'applicationList',
        'g_config', 'G_CONFIG', 'window.apps'
      ];

      for (const key of possibleKeys) {
        if (window[key]) {
          console.log(`找到 window.${key}:`, typeof window[key]);
          if (Array.isArray(window[key])) {
            return { source: `window.${key}`, data: window[key] };
          }
          if (window[key].appList && Array.isArray(window[key].appList)) {
            return { source: `window.${key}.appList`, data: window[key].appList };
          }
        }
      }

      // 尝试查找包含 appId 的对象
      for (const key in window) {
        try {
          const value = window[key];
          if (value && typeof value === 'object') {
            if (Array.isArray(value) && value.length > 0 && value[0].appId) {
              return { source: `window.${key}`, data: value };
            }
          }
        } catch (e) {
          // 忽略访问错误
        }
      }

      return null;
    });

    if (appsFromWindow && appsFromWindow.data && appsFromWindow.data.length > 0) {
      console.log(`  ✅ 从 ${appsFromWindow.source} 获取到 ${appsFromWindow.data.length} 个应用`);
      const apps = appsFromWindow.data.map(app => ({
        name: app.appName || app.name || '未命名应用',
        appId: app.appId || app.id || '',
        type: app.appType || app.type || '普通应用',
        remark: app.description || app.remark || ''
      })).filter(app => app.appId);

      await browser.close();
      return apps;
    }

    // 方式2: 从 DOM 元素提取
    console.log('  📝 尝试从 DOM 提取应用列表...');

    const appsFromDOM = await page.evaluate(() => {
      const apps = [];

      // 尝试多种选择器
      const selectors = [
        '[data-app-id]',
        '.app-item',
        '.application-item',
        '.app-card',
        '[class*="app-list"] [class*="item"]',
        '[class*="app"] [class*="card"]',
        'a[href*="APP_"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`选择器 "${selector}" 找到 ${elements.length} 个元素`);

        elements.forEach(el => {
          const appId = el.getAttribute('data-app-id') ||
                       el.getAttribute('data-id') ||
                       el.textContent.match(/APP_[A-Z0-9]+/)?.[0] ||
                       '';

          if (appId && appId.startsWith('APP_')) {
            const name = el.textContent?.trim().substring(0, 50) || '未命名应用';
            apps.push({ name, appId, type: '普通应用', remark: '' });
          }
        });

        if (apps.length > 0) break;
      }

      return apps;
    });

    if (appsFromDOM.length > 0) {
      console.log(`  ✅ 从 DOM 获取到 ${appsFromDOM.length} 个应用`);
      await browser.close();
      return appsFromDOM;
    }

    // 方式3: 从页面文本匹配
    console.log('  📝 尝试从页面文本匹配应用ID...');

    const pageContent = await page.content();
    const appIdRegex = /APP_[A-Z0-9]{20,}/g;
    const appIds = [...pageContent.matchAll(appIdRegex)].map(match => match[0]);
    const uniqueAppIds = [...new Set(appIds)];

    if (uniqueAppIds.length > 0) {
      console.log(`  ✅ 从页面文本匹配到 ${uniqueAppIds.length} 个应用ID`);

      // 尝试为每个 appId 找到对应的名称
      const appsWithNames = await Promise.all(
        uniqueAppIds.map(async (appId) => {
          try {
            // 在页面中查找包含此 appId 的元素
            const element = await page.$(`[data-app-id="${appId}"], a[href*="${appId}"], *:has-text("${appId}")`);
            let name = '未命名应用';

            if (element) {
              const text = await element.textContent();
              // 提取文本中除了 appId 之外的部分作为名称
              name = text?.replace(appId, '').trim().substring(0, 30) || '未命名应用';
            }

            return { name, appId, type: '普通应用', remark: '' };
          } catch (e) {
            return { name: '未命名应用', appId, type: '普通应用', remark: '' };
          }
        })
      );

      await browser.close();
      return appsWithNames;
    }

    console.log('  ⚠️ 未找到应用列表');
    await browser.close();
    return [];

  } catch (error) {
    console.error('  ❌ 获取应用列表失败:', error.message);
    await browser.close();
    return [];
  }
}

/**
 * 更新 Markdown 文件中的应用列表
 * @param {Array} apps - 应用列表
 */
function updateAppListInMarkdown(apps) {
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
 * 主函数
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  宜搭应用列表获取工具（浏览器方式）');
  console.log('='.repeat(80));

  // 1. 加载组织配置
  const orgConfig = loadOrgConfig();
  if (!orgConfig || !orgConfig.base_url) {
    console.error('\n❌ 未找到组织配置，请先运行登录流程');
    process.exit(1);
  }

  console.log(`\n📋 组织信息:`);
  console.log(`  组织名称: ${orgConfig.name}`);
  console.log(`  完整域名: ${orgConfig.base_url}`);

  // 2. 加载 Cookie
  const cookies = loadCookies();
  if (!cookies || cookies.length === 0) {
    console.error('\n❌ 未找到登录态，请先运行登录流程');
    process.exit(1);
  }

  // 3. 获取应用列表
  const apps = await fetchAppListFromBrowser(orgConfig.base_url, cookies);

  // 4. 显示结果
  console.log('\n📋 获取到的应用列表：');
  console.log('='.repeat(80));

  if (apps.length === 0) {
    console.log('  未找到应用');
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

  // 5. 更新 Markdown 文件
  if (apps.length > 0) {
    updateAppListInMarkdown(apps);
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
