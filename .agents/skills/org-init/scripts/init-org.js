/**
 * 组织初始化脚本 - V1.3.2
 * 自动从宜搭平台获取应用列表并更新到配置文件
 * 修复：配合 login-manager v1.0.11，修复页面跳转后登录流程提前退出的问题
 * 修复：文件不存在时自动创建默认配置文件
 * 新增：使用独立的登录管理器，组织选择时等待用户手动操作
 * 修复：使用动态路径，支持不同项目目录
 * 更新：应用列表表格改为3列格式（序号、应用名称、应用ID），移除空行、应用类型和备注列
 * 更新：移除用户信息表和组织英文标识行
 * 修复：应用列表生成时不再产生空行，表格格式更规范
 * 修复：移除对 simulated-login 的错误引用
 * 修复：应用列表按正序排列（新应用添加到表格末尾）
 * 修复：新增 updateOrgInfo 函数，在更新应用列表时同时更新组织信息
 * 修复：配合 login-manager v1.0.1，增强 base_url 有效性验证
 * 更新：配合 login-manager v1.0.3，使用双重保险策略获取组织信息
 * 重大更新：使用 API 接口 /query/app/getAppList.json 直接获取应用列表，无需逐个打开浏览器页面
 * 修复：尝试多个 API 端点获取应用列表，提高成功率
 * 修复：添加必要的请求头（Referer、User-Agent等），使API调用成功
 * 修复：添加 UTF-8 编码支持，解决 Windows 终端中文乱码
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Windows 平台设置 UTF-8 代码页，解决中文乱码
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误，继续执行
  }
}

// 引用本地的登录管理器（独立的，组织选择时等待用户手动操作）
const { ensureLogin } = require('./login-manager.js');

// 动态获取项目根目录（向上回溯到项目根目录）
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const CONFIG = {
  cookiesFile: path.join(PROJECT_ROOT, '.cookies.json'),
  orgConfigFile: path.join(PROJECT_ROOT, '组织及应用信息.md'),
  baseUrl: null  // 将在登录后动态获取
};

function loadCookies() {
  try {
    if (!fs.existsSync(CONFIG.cookiesFile)) return null;
    const data = JSON.parse(fs.readFileSync(CONFIG.cookiesFile, 'utf-8'));
    return data.cookies || data;
  } catch (e) {
    console.error('加载 Cookie 失败:', e.message);
    return null;
  }
}

function createDefaultOrgConfigFile(loginState) {
  // 格式化时间：YYYY-MM-DD HH:mm
  const now = new Date();
  const timeStr = now.getFullYear() + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
    String(now.getDate()).padStart(2, '0') + ' ' + 
    String(now.getHours()).padStart(2, '0') + ':' + 
    String(now.getMinutes()).padStart(2, '0');
  const baseUrl = loginState?.base_url || 'https://qfhefh.aliwork.com';
  const corpId = loginState?.corp_id || '';
  const corpName = loginState?.login_user?.corpName || '未知';
  const domainPrefix = baseUrl.replace('https://', '').replace('.aliwork.com', '');
  
  const defaultContent = `# 组织及应用信息

> 本文件存储宜搭组织信息和应用列表，供各个 Skill 调用
> 
> **注意**: 修改此文件后，相关 Skill 会自动读取最新配置

---

## 基本信息

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 版本 | 1.0.0 | 配置格式版本 |
| 最后更新时间 | ${timeStr} | 自动更新 |

---

## 组织信息

| 字段名 | 值 |
|--------|-----|
| 组织名称 | ${corpName} |
| 域名前缀 | ${domainPrefix} |
| 完整域名 | ${baseUrl} |
| corpId | ${corpId} |
| corp名称 | ${corpName} |

---

## 应用列表

> 在此添加需要管理的宜搭应用，Skill 会自动读取
> 
> **提示**: 运行 \`node .agents/skills/org-init/scripts/init-org.js\` 可自动同步宜搭平台上的应用列表

| 序号 | 应用名称 | 应用ID (appId) |
|------|----------|----------------|
---

## 原型页面访问地址

> 以下地址需要在 HTTP 服务启动后访问
> 
> 请勿使用 \`file://\` 协议打开，否则会导致同步配置功能失效

| 应用名称 | 原型页面地址 | 本地状态 |
|----------|-------------|----------|
---

## 使用说明

### 如何添加新应用

**方式一：手动添加**
1. 在「应用列表」表格末尾添加新行
2. 填写序号、应用名称、应用ID
3. 保存文件后即可被 Skill 读取

**方式二：自动同步**
1. 运行同步命令：\`node .agents/skills/org-init/scripts/init-org.js\`
2. 系统会自动从宜搭平台获取应用列表并更新此文件

### 如何修改组织信息

1. 直接修改「组织信息」表格中的值
2. 修改后 Skill 下次运行时会自动读取新配置

### Skill 调用方式

\`\`\`javascript
// 读取组织配置
const orgConfig = loadOrgConfig();

// 获取 base_url
const baseUrl = orgConfig.base_url;

// 获取 corpId
const corpId = orgConfig.corp_id;

// 获取应用列表
const apps = orgConfig.apps;
\`\`\`

---

## 备注

此配置由系统自动生成，也可手动修改。
`;

  fs.writeFileSync(CONFIG.orgConfigFile, defaultContent);
  console.log('  [创建] 默认配置文件:', CONFIG.orgConfigFile);
  return true;
}

/**
 * 更新组织信息到配置文件
 * @param {Object} loginState - 登录态对象
 * @returns {boolean} 是否成功
 */
function updateOrgInfo(loginState) {
  try {
    if (!fs.existsSync(CONFIG.orgConfigFile)) {
      console.log('  [提示] 配置文件不存在，跳过组织信息更新');
      return false;
    }
    
    let content = fs.readFileSync(CONFIG.orgConfigFile, 'utf-8');
    
    const baseUrl = loginState?.base_url || 'https://qfhefh.aliwork.com';
    const corpId = loginState?.corp_id || '';
    const corpName = loginState?.login_user?.corpName || '未知';
    const domainPrefix = baseUrl.replace('https://', '').replace('.aliwork.com', '');
    
    // 更新时间
    const now = new Date();
    const timeStr = now.getFullYear() + '-' + 
      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0');
    
    // 更新最后更新时间
    content = content.replace(
      /(\| 最后更新时间 \|)[^|]+(\|)/,
      '$1 ' + timeStr + ' $2'
    );
    
    // 更新组织名称
    content = content.replace(
      /(\| 组织名称 \|)[^|]+(\|)/,
      '$1 ' + corpName + ' $2'
    );
    
    // 更新域名前缀
    content = content.replace(
      /(\| 域名前缀 \|)[^|]+(\|)/,
      '$1 ' + domainPrefix + ' $2'
    );
    
    // 更新完整域名
    content = content.replace(
      /(\| 完整域名 \|)[^|]+(\|)/,
      '$1 ' + baseUrl + ' $2'
    );
    
    // 更新 corpId
    content = content.replace(
      /(\| corpId \|)[^|]*(\|)/,
      '$1 ' + corpId + ' $2'
    );
    
    // 更新 corp名称
    content = content.replace(
      /(\| corp名称 \|)[^|]+(\|)/,
      '$1 ' + corpName + ' $2'
    );
    
    fs.writeFileSync(CONFIG.orgConfigFile, content);
    console.log('  [更新] 组织信息已更新');
    console.log('    - 组织名称:', corpName);
    console.log('    - 域名前缀:', domainPrefix);
    console.log('    - 完整域名:', baseUrl);
    console.log('    - corpId:', corpId);
    return true;
  } catch (e) {
    console.error('  [失败] 更新组织信息失败:', e.message);
    return false;
  }
}

function updateAppIdInMarkdown(appName, appId) {
  try {
    // 如果文件不存在，创建默认文件
    if (!fs.existsSync(CONFIG.orgConfigFile)) {
      console.log('  [提示] 配置文件不存在，创建默认文件...');
      createDefaultOrgConfigFile();
    }
    
    let content = fs.readFileSync(CONFIG.orgConfigFile, 'utf-8');
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 检查应用是否已存在
    const existingRegex = new RegExp('\\|\\s*\\d+\\s*\\|\\s*' + escaped + '\\s*\\|[^\\n]*', 'g');
    
    if (content.match(existingRegex)) {
      // 更新已存在的应用
      content = content.replace(existingRegex, (match) => {
        const parts = match.split('|');
        parts[3] = ' ' + (appId || '请手动补充') + ' ';
        return parts.join('|');
      });
      fs.writeFileSync(CONFIG.orgConfigFile, content);
      console.log('  [更新]', appName, '->', appId || '请手动补充');
      return true;
    } else {
      // 应用不存在，添加新行
      // 找到应用列表表格中所有已有的行
      const tableRowRegex = /\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/g;
      let lastNum = 0;
      let match;
      
      // 只匹配应用列表部分的行（在 ## 应用列表 和下一个 ## 之间）
      const appListSection = content.match(/## 应用列表[\s\S]*?(?=\n## |$)/);
      if (appListSection) {
        const rowMatches = appListSection[0].match(/\|\s*(\d+)\s*\|/g);
        if (rowMatches) {
          rowMatches.forEach(row => {
            const numMatch = row.match(/\|\s*(\d+)\s*\|/);
            if (numMatch) {
              const num = parseInt(numMatch[1]);
              if (!isNaN(num) && num > lastNum) {
                lastNum = num;
              }
            }
          });
        }
      }
      
      const newNum = lastNum + 1;
      const newRow = '| ' + newNum + ' | ' + appName + ' | ' + (appId || '请手动补充') + ' |';
      
      // 找到应用列表表格中最后一行，在其后添加新行
      // 首先找到应用列表部分
      const appListSectionRegex = /(## 应用列表[\s\S]*?)(\n## |\n---|$)/;
      const appListMatch = content.match(appListSectionRegex);
      
      if (appListMatch) {
        const appListSection = appListMatch[1];
        // 找到该部分中最后一行表格数据（以 | 数字 | 开头的行）
        const lines = appListSection.split('\n');
        let lastTableRowIndex = -1;
        
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].match(/^\|\s*\d+\s*\|/)) {
            lastTableRowIndex = i;
            break;
          }
        }
        
        if (lastTableRowIndex >= 0) {
          // 在最后一行表格数据后插入新行
          lines.splice(lastTableRowIndex + 1, 0, newRow);
          const newAppListSection = lines.join('\n');
          content = content.replace(appListSection, newAppListSection);
        } else {
          // 表格中没有数据行，在分隔符后添加
          const separatorRegex = /(\|------\|----------\|----------------\|)\n/;
          content = content.replace(separatorRegex, '$1\n' + newRow + '\n');
        }
      } else {
        // 备用方案：在分隔符后直接添加
        const separatorRegex = /(\|------\|----------\|----------------\|)\n/;
        content = content.replace(separatorRegex, '$1\n' + newRow + '\n');
      }
      
      fs.writeFileSync(CONFIG.orgConfigFile, content);
      console.log('  [新增]', appName, '->', appId || '请手动补充');
      return true;
    }
  } catch (e) {
    console.error('  [失败]', e.message);
    return false;
  }
}

/**
 * 发送 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {Object} options - 请求选项
 * @param {Object} cookies - Cookie 对象
 * @param {string} referer - Referer URL
 * @returns {Promise<Object>}
 */
function makeRequest(url, options = {}, cookies = {}, referer = '') {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    // 构建 cookie 字符串
    const cookieString = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...options.headers
    };
    
    if (referer) {
      headers['Referer'] = referer;
    }
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: headers
    };
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (e) {
          resolve({ success: false, errorMsg: '解析响应失败: ' + e.message, rawData: data });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * 使用 API 接口获取应用列表
 * @param {Object} loginState - 登录态对象
 * @returns {Promise<Array>} 应用列表
 */
async function fetchAppsViaAPI(loginState) {
  console.log('\n📋 使用 API 接口获取应用列表...');
  
  try {
    const baseUrl = loginState?.base_url || CONFIG.baseUrl;
    const cookies = loginState?.cookies || loadCookies();
    
    if (!cookies) {
      console.log('❌ 未获取到登录态，无法继续');
      return [];
    }
    
    // 将 cookies 数组转换为对象
    const cookieObj = {};
    if (Array.isArray(cookies)) {
      cookies.forEach(cookie => {
        if (cookie.name && cookie.value) {
          cookieObj[cookie.name] = cookie.value;
        }
      });
    } else {
      Object.assign(cookieObj, cookies);
    }
    
    // 从 cookie 中获取 csrf token（宜搭使用 tianshu_csrf_token 或 c_csrf）
    const csrfToken = cookieObj['tianshu_csrf_token'] || cookieObj['c_csrf'] || cookieObj['XSRF-TOKEN'] || '';
    const timestamp = Date.now();
    
    // 尝试多个 API 端点（使用正确的参数格式）
    const apiEndpoints = [
      { 
        url: `${baseUrl}/query/app/getAppList.json?_api=App.getList&_mock=false&_csrf_token=${csrfToken}&_locale_time_zone_offset=28800000&pageIndex=1&pageSize=100&orderField=data_gmt_create&appStatus=&isAdmin=true&creator=&key=&_stamp=${timestamp}`, 
        method: 'GET' 
      },
      { url: `${baseUrl}/app/getAppList.json`, method: 'POST', body: {} },
      { url: `${baseUrl}/query/app/getAppList.json`, method: 'GET' }
    ];
    
    for (const endpoint of apiEndpoints) {
      console.log(`  尝试 API: ${endpoint.url}`);
      
      const options = {
        method: endpoint.method,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      };
      
      if (endpoint.body) {
        options.body = endpoint.body;
      }
      
      const result = await makeRequest(endpoint.url, options, cookieObj, `${baseUrl}/myApp`);
      
      // 检查各种可能的响应格式
      let apps = null;
      
      if (result?.success && result.content?.data && Array.isArray(result.content.data)) {
        apps = result.content.data;
      } else if (result?.data && Array.isArray(result.data)) {
        apps = result.data;
      } else if (result?.result && Array.isArray(result.result)) {
        apps = result.result;
      } else if (Array.isArray(result)) {
        apps = result;
      }
      
      if (apps && apps.length > 0) {
        console.log(`  ✓ 找到 ${apps.length} 个应用`);
        
        // 转换为统一格式
        const formattedApps = apps.map(app => {
          const appName = app.appName?.zh_CN || app.appName?.en_US || app.appName || app.name || '未命名';
          const appId = app.appId || app.appType || app.id || null;
          return { name: appName, appId: appId };
        }).filter(app => app.name && app.name !== '未命名');
        
        return formattedApps;
      }
    }
    
    console.log('  ⚠️ 所有 API 端点都未能获取到应用列表');
    return [];
  } catch (error) {
    console.error('  ❌ API 调用失败:', error.message);
    return [];
  }
}

/**
 * 使用浏览器获取应用列表（备用方案）
 * @param {Object} loginState - 登录态对象
 * @returns {Promise<Array>} 应用列表
 */
async function fetchAppsViaBrowser(loginState) {
  console.log('\n启动浏览器获取应用列表...');
  const browser = await chromium.launch({ headless: false });
  
  try {
    const cookies = loginState?.cookies || loadCookies();
    if (!cookies) {
      console.log('❌ 未获取到登录态，无法继续');
      return [];
    }
    
    const baseUrl = loginState?.base_url || CONFIG.baseUrl;
    
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();
    
    // 拦截网络请求，尝试找到应用列表 API
    const apiCalls = [];
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('getAppList') || url.includes('app/list') || url.includes('myApp')) {
        try {
          const data = await response.json().catch(() => null);
          if (data && (data.data || data.content || data.result || Array.isArray(data))) {
            apiCalls.push({ url, data });
          }
        } catch (e) {}
      }
    });
    
    // 访问我的应用页面
    console.log('访问我的应用页面:', baseUrl + '/myApp');
    await page.goto(baseUrl + '/myApp', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    // 打印找到的 API 调用
    if (apiCalls.length > 0) {
      console.log('  发现 API 调用:');
      apiCalls.forEach((call, i) => {
        console.log(`    ${i + 1}. ${call.url}`);
      });
    }
    
    if (page.url().includes('login')) {
      console.log('❌ 未登录，请重新运行脚本进行登录');
      return [];
    }
    
    // 获取应用名称列表
    const appNames = await page.evaluate(() => {
      const names = [];
      const cards = document.querySelectorAll('.MyCreateAppCard--cardWrapper, .app-card');
      
      cards.forEach(card => {
        const titleEl = card.querySelector('[class*="CardTitle"], [class*="title"], h3, h4');
        if (titleEl) {
          const name = titleEl.textContent.trim();
          if (name && name.length > 1 && name.length < 50) {
            names.push(name);
          }
        }
      });
      
      return names;
    });
    
    console.log('找到', appNames.length, '个应用:', appNames);
    
    // 逐个点击应用获取 APP_ID
    const results = [];
    
    for (let i = 0; i < appNames.length; i++) {
      const appName = appNames[i];
      console.log('\n处理应用 ' + (i + 1) + '/' + appNames.length + ': ' + appName);
      
      try {
        const card = await page.locator('.MyCreateAppCard--cardWrapper, .app-card')
          .filter({ hasText: appName })
          .first();
        
        if (await card.isVisible().catch(() => false)) {
          const [newPage] = await Promise.all([
            context.waitForEvent('page', { timeout: 10000 }).catch(() => null),
            card.click()
          ]);
          
          let appId = null;
          
          if (newPage) {
            await newPage.waitForLoadState('networkidle');
            await newPage.waitForTimeout(3000);
            
            const url = newPage.url();
            console.log('  新页面URL:', url);
            
            const match = url.match(/APP_[A-Z0-9]+/i);
            if (match) {
              appId = match[0];
              console.log('  获取到 APP_ID:', appId);
            }
            
            await newPage.close();
          } else {
            await page.waitForTimeout(5000);
            const url = page.url();
            console.log('  当前页面URL:', url);
            
            const match = url.match(/APP_[A-Z0-9]+/i);
            if (match) {
              appId = match[0];
              console.log('  获取到 APP_ID:', appId);
            }
          }
          
          results.push({ name: appName, appId: appId });
          
          if (!page.url().includes('/myApp')) {
            await page.goto(baseUrl + '/myApp', { waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);
          }
        } else {
          console.log('  未找到应用卡片');
          results.push({ name: appName, appId: null });
        }
      } catch (e) {
        console.log('  处理失败:', e.message);
        results.push({ name: appName, appId: null });
        try {
          await page.goto(baseUrl + '/myApp', { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);
        } catch (e2) {}
      }
    }
    
    return results;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('宜搭组织初始化工具');
  console.log('='.repeat(60));
  
  // 第一步：调用 simulated-login 进行登录
  console.log('\n🔐 第一步：登录宜搭平台');
  console.log('  将打开浏览器进行登录，请按提示操作...');
  console.log('  如果需要选择组织，请选择您要初始化的组织');
  console.log('');
  
  let loginState;
  try {
    loginState = await ensureLogin({ 
      headless: false,
      targetUrl: 'https://www.aliwork.com'
    });
    
    if (!loginState) {
      console.log('❌ 登录失败，请重试');
      return;
    }
    
    console.log('\n✅ 登录成功！');
    console.log('  用户:', loginState.login_user?.userName || '未知');
    console.log('  组织:', loginState.login_user?.corpName || '未知');
    console.log('  baseUrl:', loginState.base_url);
    
    CONFIG.baseUrl = loginState.base_url;
    
  } catch (error) {
    console.error('❌ 登录过程出错:', error.message);
    console.log('  请确保您已完成登录流程并选择了组织');
    return;
  }
  
  // 第二步：获取应用列表（优先使用 API）
  console.log('\n📋 第二步：获取应用列表');
  let apps = await fetchAppsViaAPI(loginState);
  
  // 如果 API 失败，使用浏览器备用方案
  if (apps.length === 0) {
    console.log('\n⚠️ API 获取失败，尝试使用浏览器方式...');
    apps = await fetchAppsViaBrowser(loginState);
  }
  
  if (apps.length === 0) {
    console.log('⚠️ 未获取到应用，初始化结束');
    return;
  }
  
  console.log('\n获取到', apps.length, '个应用:');
  apps.forEach((app, i) => {
    console.log('  ' + (i + 1) + '. ' + app.name + (app.appId ? ' (' + app.appId + ')' : ' (无ID)'));
  });
  
  // 第三步：更新配置文件
  console.log('\n📝 第三步：更新配置文件...');
  
  if (!fs.existsSync(CONFIG.orgConfigFile)) {
    createDefaultOrgConfigFile(loginState);
  }
  
  updateOrgInfo(loginState);
  
  let updated = 0;
  let notFound = 0;
  for (const app of apps) {
    if (updateAppIdInMarkdown(app.name, app.appId)) {
      updated++;
    } else {
      notFound++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 初始化完成!');
  console.log('  - 成功更新:', updated, '个');
  console.log('  - 未匹配:', notFound, '个');
  console.log('  - 配置文件:', CONFIG.orgConfigFile);
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('\n❌ 脚本执行失败:');
  console.error('  错误类型:', error.name || 'Unknown');
  console.error('  错误信息:', error.message);
  console.error('  堆栈跟踪:', error.stack);
  process.exit(1);
});

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ 未处理的 Promise 拒绝:');
  console.error('  原因:', reason);
  process.exit(1);
});

// 捕获未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('\n❌ 未捕获的异常:');
  console.error('  错误信息:', error.message);
  console.error('  堆栈跟踪:', error.stack);
  process.exit(1);
});
