/**
 * 组织初始化脚本 - V1.0.0
 * 自动从宜搭平台获取应用列表并更新到配置文件
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  cookiesFile: 'D:/宜搭AI编程/宜搭AI助手V1.4/.cookies.json',
  orgConfigFile: 'D:/宜搭AI编程/宜搭AI助手V1.4/组织及应用信息.md',
  baseUrl: 'https://qfhefh.aliwork.com'
};

/**
 * 加载 Cookie
 */
function loadCookies() {
  try {
    if (!fs.existsSync(CONFIG.cookiesFile)) {
      console.log('Cookie 文件不存在:', CONFIG.cookiesFile);
      return null;
    }
    const data = JSON.parse(fs.readFileSync(CONFIG.cookiesFile, 'utf-8'));
    return data.cookies || data;
  } catch (e) {
    console.error('加载 Cookie 失败:', e.message);
    return null;
  }
}

/**
 * 更新 Markdown 中的应用 ID
 */
function updateAppIdInMarkdown(appName, appId) {
  try {
    if (!fs.existsSync(CONFIG.orgConfigFile)) {
      console.log('配置文件不存在');
      return false;
    }
    
    let content = fs.readFileSync(CONFIG.orgConfigFile, 'utf-8');
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(\\|\\s*\\d+\\s*\\|\\s*' + escaped + '\\s*\\|\\s*)[^|]*(\\s*\\|)', 'g');
    
    if (content.match(regex)) {
      content = content.replace(regex, '$1' + (appId || '请手动补充') + '$2');
      fs.writeFileSync(CONFIG.orgConfigFile, content);
      console.log('  [OK]', appName, '->', appId || '请手动补充');
      return true;
    }
    console.log('  [未找到]', appName);
    return false;
  } catch (e) {
    console.error('  [失败]', e.message);
    return false;
  }
}

/**
 * 从宜搭获取应用列表
 */
async function fetchApps() {
  console.log('启动浏览器...');
  const browser = await chromium.launch({ headless: false });
  
  try {
    const cookies = loadCookies();
    if (!cookies) {
      console.log('请先使用 simulated-login skill 登录');
      return [];
    }
    
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();
    
    console.log('访问我的应用页面...');
    await page.goto(CONFIG.baseUrl + '/myApp', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    if (page.url().includes('login')) {
      console.log('未登录，请先登录');
      return [];
    }
    
    const apps = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.app-card, [class*="MyCreateAppCard"]');
      
      cards.forEach(card => {
        const titleEl = card.querySelector('[class*="title"], [class*="name"], span[title]');
        const name = titleEl ? titleEl.textContent.trim() : '';
        
        let appId = null;
        card.querySelectorAll('a[href]').forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            const match = href.match(/APP_[A-Z0-9]+/i);
            if (match && !appId) appId = match[0];
          }
        });
        
        if (name) results.push({ name, appId });
      });
      
      return results;
    });
    
    return apps;
  } finally {
    await browser.close();
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('宜搭组织初始化工具');
  console.log('='.repeat(60));
  
  const apps = await fetchApps();
  if (apps.length === 0) {
    console.log('未获取到应用');
    return;
  }
  
  console.log('\n找到', apps.length, '个应用:');
  apps.forEach((app, i) => {
    console.log('  ' + (i + 1) + '. ' + app.name + (app.appId ? ' (' + app.appId + ')' : ' (无ID)'));
  });
  
  console.log('\n更新配置文件...');
  let updated = 0;
  for (const app of apps) {
    if (updateAppIdInMarkdown(app.name, app.appId)) updated++;
  }
  
  console.log('\n完成! 更新了', updated, '个应用');
  console.log('='.repeat(60));
}

main().catch(console.error);
