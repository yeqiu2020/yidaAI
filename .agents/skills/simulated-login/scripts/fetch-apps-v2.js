#!/usr/bin/env node
/**
 * 使用浏览器自动化获取宜搭应用列表 - V2
 * 针对宜搭工作台页面结构优化
 *
 * 版本: v2.0.0
 * 创建日期: 2026-03-23
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadOrgConfig, loadCookies, ORG_CONFIG_FILE_MD } = require('./login-manager');

async function fetchAppListFromBrowser(baseUrl, cookies) {
  console.log('🌐 启动浏览器...');

  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    if (cookies && cookies.length > 0) {
      await context.addCookies(cookies);
      console.log(`  ✅ 已加载 ${cookies.length} 个 Cookie`);
    }

    const page = await context.newPage();

    // 访问宜搭工作台
    const workbenchUrl = `${baseUrl}/workPlatform`;
    console.log(`\n📍 访问工作台: ${workbenchUrl}`);

    await page.goto(workbenchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`  当前页面: ${currentUrl}`);

    if (currentUrl.includes('login') || currentUrl.includes('sign')) {
      console.log('  ⚠️ 需要登录');
      await browser.close();
      return [];
    }

    // 截图保存
    const screenshotPath = path.join(__dirname, 'debug-workbench.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  📸 截图已保存: ${screenshotPath}`);

    console.log('\n🔍 提取应用列表...');

    // 从页面中提取应用信息
    const apps = await page.evaluate(() => {
      const results = [];

      // 方法1: 查找包含应用名称和链接的元素
      // 宜搭工作台通常使用特定的 class 或 data 属性
      const appSelectors = [
        // 最近使用区域的应用
        '[class*="recent"] [class*="app"]',
        '[class*="recently"] [class*="item"]',
        '[data-testid*="app"]',
        // 通用应用卡片
        '[class*="app-card"]',
        '[class*="application"]',
        // 链接中包含 APP_ 的
        'a[href*="APP_"]',
        // 包含特定文本的元素
        'div:has-text("进销存")',
        'div:has-text("管理")'
      ];

      for (const selector of appSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          console.log(`选择器 "${selector}" 找到 ${elements.length} 个元素`);

          elements.forEach(el => {
            // 提取应用名称
            const nameEl = el.querySelector('[class*="name"], [class*="title"], h1, h2, h3, h4, span, div');
            const name = nameEl ? nameEl.textContent.trim() : el.textContent.trim();

            // 提取应用ID（从链接或 data 属性）
            const linkEl = el.tagName === 'A' ? el : el.querySelector('a');
            const href = linkEl ? linkEl.getAttribute('href') : '';
            const appIdMatch = href.match(/APP_[A-Z0-9]+/) ||
                              el.getAttribute('data-app-id') ||
                              el.textContent.match(/APP_[A-Z0-9]+/);
            const appId = appIdMatch ? (appIdMatch[0] || appIdMatch) : '';

            if (name && name.length > 1 && name.length < 50) {
              // 避免重复
              const exists = results.find(a => a.name === name);
              if (!exists) {
                results.push({
                  name: name.substring(0, 30),
                  appId: appId || '',
                  type: '普通应用',
                  remark: ''
                });
              }
            }
          });
        } catch (e) {
          console.log(`选择器 "${selector}" 出错:`, e.message);
        }
      }

      // 方法2: 从页面所有文本中提取看起来像应用名称的内容
      const allText = document.body.innerText;
      const lines = allText.split('\n').filter(line => line.trim());

      // 常见应用名称模式
      const appPatterns = [
        /进销存[\w\u4e00-\u9fa5]*/,
        /[\w\u4e00-\u9fa5]*管理[\w\u4e00-\u9fa5]*/,
        /[\w\u4e00-\u9fa5]*系统/,
        /[\w\u4e00-\u9fa5]*测试/,
        /[\w\u4e00-\u9fa5]*演示/
      ];

      lines.forEach(line => {
        const trimmed = line.trim();
        // 过滤条件：长度适中，不包含特殊字符，不是常见的非应用文本
        if (trimmed.length >= 2 && trimmed.length <= 20 &&
            !trimmed.includes('：') && !trimmed.includes(':') &&
            !trimmed.includes('http') && !trimmed.includes('欢迎') &&
            !trimmed.includes('你好') && !trimmed.includes('了解') &&
            !trimmed.includes('点击') && !trimmed.includes('更多')) {

          // 检查是否匹配应用名称模式
          const isAppLike = appPatterns.some(pattern => pattern.test(trimmed));

          if (isAppLike) {
            const exists = results.find(a => a.name === trimmed);
            if (!exists) {
              results.push({
                name: trimmed,
                appId: '',
                type: '普通应用',
                remark: ''
              });
            }
          }
        }
      });

      return results;
    });

    console.log(`  ✅ 找到 ${apps.length} 个应用`);

    // 过滤和清理结果
    const filteredApps = apps.filter(app => {
      // 排除明显的非应用文本
      const excludeWords = ['宜搭', '工作台', '首页', '开始', '我的应用', '应用中心', '社区', '帮助中心', '管理员', '退出', '查看更多'];
      return !excludeWords.some(word => app.name.includes(word));
    });

    console.log(`  ✅ 过滤后剩余 ${filteredApps.length} 个应用`);

    await browser.close();
    return filteredApps;

  } catch (error) {
    console.error('  ❌ 获取失败:', error.message);
    await browser.close();
    return [];
  }
}

function updateAppListInMarkdown(apps) {
  console.log('\n📝 更新 Markdown 文件...');

  try {
    let mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');

    let appTable = '';
    if (apps.length === 0) {
      appTable += '| 1 | - | - | - | 暂无应用数据 |\n';
    } else {
      apps.forEach((app, index) => {
        appTable += `| ${index + 1} | ${app.name} | ${app.appId} | ${app.type} | ${app.remark} |\n`;
      });
      appTable += `| ${apps.length + 1} | - | - | - | 预留空行 |\n`;
    }

    const appTableRegex = /(## 应用列表[\s\S]*?\|------\|----------\|----------------\|----------\|------\|\n)([\s\S]*?)(?=\n## |\n---|$)/;
    mdContent = mdContent.replace(appTableRegex, `$1${appTable}$3`);

    mdContent = mdContent.replace(
      /最后更新时间\s*\|\s*[^|]+\s*\|/,
      `最后更新时间 | ${new Date().toISOString()} |`
    );

    fs.writeFileSync(ORG_CONFIG_FILE_MD, mdContent);
    console.log(`  ✅ 已更新 ${apps.length} 个应用`);

  } catch (error) {
    console.error('  ❌ 更新失败:', error.message);
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  宜搭应用列表获取工具 V2');
  console.log('='.repeat(80));

  const orgConfig = loadOrgConfig();
  if (!orgConfig?.base_url) {
    console.error('\n❌ 未找到组织配置');
    process.exit(1);
  }

  console.log(`\n📋 组织: ${orgConfig.name}`);
  console.log(`   域名: ${orgConfig.base_url}`);

  const cookies = loadCookies();
  if (!cookies?.length) {
    console.error('\n❌ 未找到登录态');
    process.exit(1);
  }

  const apps = await fetchAppListFromBrowser(orgConfig.base_url, cookies);

  console.log('\n📋 应用列表：');
  console.log('='.repeat(80));

  if (apps.length === 0) {
    console.log('  未找到应用');
  } else {
    apps.forEach((app, index) => {
      console.log(`  ${index + 1}. ${app.name}`);
      if (app.appId) console.log(`     ID: ${app.appId}`);
    });
  }

  console.log('='.repeat(80));
  console.log(`  共 ${apps.length} 个应用\n`);

  if (apps.length > 0) {
    updateAppListInMarkdown(apps);
  }

  console.log('='.repeat(80));
  console.log('  完成！');
  console.log('='.repeat(80) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error('错误:', error);
    process.exit(1);
  });
}
