#!/usr/bin/env node
/**
 * 获取应用ID工具 - 从后台获取
 * 访问宜搭后台的应用管理页面，获取所有应用的ID
 *
 * 版本: v3.0.0
 * 创建日期: 2026-03-23
 */

const { chromium } = require('playwright');
const fs = require('fs');
const { loadOrgConfig, loadCookies, ORG_CONFIG_FILE_MD } = require('./login-manager');

function loadAppsFromMarkdown() {
  try {
    const mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
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
    console.error('读取失败:', error.message);
    return [];
  }
}

function updateAppIdInMarkdown(appName, appId) {
  try {
    let mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
    const rowRegex = new RegExp(`(\\|\\s*\\d+\\s*\\|\\s*${appName}\\s*\\|\\s*)[^|]*(\\s*\\|)`, 'g');
    if (mdContent.match(rowRegex)) {
      mdContent = mdContent.replace(rowRegex, `$1${appId}$2`);
      fs.writeFileSync(ORG_CONFIG_FILE_MD, mdContent);
      console.log(`    ✅ 已更新: ${appName} -> ${appId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.log(`    ❌ 更新失败: ${error.message}`);
    return false;
  }
}

async function getAppIdsFromBackend(page, baseUrl) {
  console.log('\n🔍 访问宜搭后台应用管理页面...');

  // 先访问工作台，然后进入"我的应用"页面
  const workbenchUrl = `${baseUrl}/workPlatform`;
  console.log(`\n📍 访问工作台：${workbenchUrl}`);
  
  try {
    await page.goto(workbenchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`    当前 URL: ${currentUrl}`);

    // 检查是否需要登录
    if (currentUrl.includes('login') || currentUrl.includes('sign')) {
      console.log(`    ⚠️  需要登录`);
      return [];
    }

    // 截图保存
    await page.screenshot({ path: './debug-workbench-before.png', fullPage: true });
    console.log(`    📷 工作台截图已保存`);

    // 在页面中查找"我的应用"或"应用管理"的链接并点击
    console.log('\n🔍 查找"我的应用"入口...');
    
    const myAppLink = await page.evaluate(() => {
      // 查找包含"我的应用"、"应用管理"、"管理后台"等文本的链接
      const links = document.querySelectorAll('a[href], div[role="button"], span[role="button"]');
      
      for (const link of links) {
        const text = link.textContent?.trim() || '';
        if (text.includes('我的应用') || text.includes('应用管理') || text.includes('管理后台') || text.includes('后台')) {
          const href = link.getAttribute('href') || '';
          console.log(`找到入口：${text} - ${href}`);
          return { text, href, isButton: !href };
        }
      }
      
      // 没找到特定文本，尝试从 URL 中找
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('/admin') || href.includes('APP_')) {
          const text = link.textContent?.trim() || '应用链接';
          return { text, href, isButton: false };
        }
      }
      
      return null;
    });

    if (myAppLink) {
      console.log(`    ✅ 找到入口："${myAppLink.text}"`);
      
      if (myAppLink.isButton) {
        // 如果是按钮，尝试点击
        await page.click(`text=${myAppLink.text}`);
        await page.waitForTimeout(3000);
      } else {
        // 如果是链接，直接访问
        const targetUrl = myAppLink.href.startsWith('http') ? myAppLink.href : `${baseUrl}${myAppLink.href}`;
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(5000);
      }

      // 再次截图
      await page.screenshot({ path: './debug-admin-page.png', fullPage: true });
      console.log(`    📷 后台页面截图已保存`);

      // 保存页面 HTML 用于调试
      const pageContent = await page.content();
      fs.writeFileSync('./debug-admin-page.html', pageContent);
      console.log(`    📄 页面 HTML 已保存`);

      // 获取当前 URL
      const afterClickUrl = page.url();
      console.log(`    📍 点击后 URL: ${afterClickUrl}`);

      // 尝试从页面提取更多数据用于调试
      const debugInfo = await page.evaluate(() => {
        const info = {
          totalLinks: document.querySelectorAll('a[href]').length,
          totalDivs: document.querySelectorAll('div').length,
          pageTitle: document.title,
          bodyText: document.body.innerText.substring(0, 500),
          url: window.location.href,
          sampleLinks: []
        };
        
        // 获取一些示例链接
        const links = document.querySelectorAll('a[href]');
        for (let i = 0; i < Math.min(20, links.length); i++) {
          const href = links[i].getAttribute('href') || '';
          const text = links[i].textContent?.trim() || '';
          info.sampleLinks.push({ text: text.substring(0, 30), href });
        }
        
        return info;
      });
      
      console.log(`\n    📊 页面调试信息:`);
      console.log(`       标题: ${debugInfo.pageTitle}`);
      console.log(`       链接数量: ${debugInfo.totalLinks}`);
      console.log(`       当前URL: ${debugInfo.url}`);
      console.log(`       示例链接:`);
      debugInfo.sampleLinks.forEach(link => {
        if (link.href) console.log(`         - ${link.text}: ${link.href.substring(0, 60)}`);
      });

      // 从页面提取应用 ID 和名称
      const appsData = await page.evaluate(() => {
        const results = [];

        // 方法 1: 从页面所有链接中提取
        const links = document.querySelectorAll('a[href]');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const text = link.textContent?.trim() || '';

          // 匹配 APP_ 开头的 ID
          const appIdMatch = href.match(/APP_[A-Z0-9]+/);
          if (appIdMatch && text && text.length > 1 && text.length < 30) {
            // 排除明显不是应用名称的链接
            if (!text.includes('登录') && !text.includes('注册') && !text.includes('首页')) {
              results.push({
                name: text.substring(0, 30),
                appId: appIdMatch[0]
              });
            }
          }
        }

        // 方法 2: 从 data 属性中提取
        const dataElements = document.querySelectorAll('[data-app-id], [data-appid]');
        for (const el of dataElements) {
          const appId = el.getAttribute('data-app-id') || el.getAttribute('data-appid');
          const text = el.textContent?.trim() || '';
          if (appId && appId.startsWith('APP_') && text) {
            results.push({
              name: text.substring(0, 30),
              appId: appId
            });
          }
        }

        // 去重
        const unique = [];
        const seen = new Set();
        for (const item of results) {
          if (!seen.has(item.appId)) {
            seen.add(item.appId);
            unique.push(item);
          }
        }

        return unique;
      });

      if (appsData.length > 0) {
        console.log(`    ✅ 找到 ${appsData.length} 个应用`);
        appsData.forEach(app => console.log(`       - ${app.name}: ${app.appId}`));
        return appsData;
      }
    } else {
      console.log(`    ⚠️  未找到"我的应用"入口`);
    }

  } catch (error) {
    console.log(`    ❌ 访问失败：${error.message}`);
  }

  return [];
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  宜搭应用ID获取工具 V3');
  console.log('  （从后台应用管理页面获取）');
  console.log('='.repeat(80));

  const orgConfig = loadOrgConfig();
  if (!orgConfig?.base_url) {
    console.error('\n❌ 未找到组织配置');
    process.exit(1);
  }

  console.log(`\n📋 组织: ${orgConfig.name}`);
  console.log(`   域名: ${orgConfig.base_url}`);

  const apps = loadAppsFromMarkdown();
  console.log(`\n📋 当前应用列表: ${apps.length} 个`);

  const appsNeedId = apps.filter(app => !app.appId || app.appId === '');
  if (appsNeedId.length === 0) {
    console.log('\n✅ 所有应用已有 appId');
    process.exit(0);
  }

  console.log(`   需要获取ID: ${appsNeedId.length} 个\n`);

  const cookies = loadCookies();
  if (!cookies?.length) {
    console.error('❌ 未找到登录态');
    process.exit(1);
  }

  console.log('🌐 启动浏览器...');
  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addCookies(cookies);
    const page = await context.newPage();

    // 获取所有应用数据
    const appsData = await getAppIdsFromBackend(page, orgConfig.base_url);

    if (appsData.length > 0) {
      console.log('\n📝 匹配并更新应用ID...');
      
      let successCount = 0;
      for (const app of appsNeedId) {
        // 尝试匹配应用名称
        const matched = appsData.find(a => 
          a.name.includes(app.name) || app.name.includes(a.name)
        );
        
        if (matched) {
          const updated = updateAppIdInMarkdown(app.name, matched.appId);
          if (updated) successCount++;
        } else {
          console.log(`    ⚠️ 未匹配到: ${app.name}`);
        }
      }
      
      console.log(`\n✅ 成功更新 ${successCount}/${appsNeedId.length} 个应用ID`);
    } else {
      console.log('\n⚠️ 未获取到应用数据');
    }

    await browser.close();

  } catch (error) {
    console.error('错误:', error.message);
    await browser.close();
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('  完成！');
  console.log('='.repeat(80) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error('程序错误:', error);
    process.exit(1);
  });
}
