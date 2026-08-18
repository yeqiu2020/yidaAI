/**
 * 宜搭模拟登录管理器
 * 通过浏览器自动化完成宜搭平台的登录流程
 *
 * 版本: v1.3.1
 * 创建日期: 2026-03-23
 *
 * 功能:
 * 1. 自动处理宜搭登录流程（点击"立即登录"、选择组织等）
 * 2. 管理 Cookie 的保存和加载
 * 3. 提供统一的登录态获取接口
 * 4. 支持"先尝试直接访问，失败后再登录"的智能模式
 * 5. 支持组织配置管理（.organization.md），使用 Markdown 表格格式
 *
 * 更新记录:
 * v1.3.1 - 修复saveLoginState保存Playwright特有字段导致cookie文件被破坏的问题
 * v1.3.0 - 组织配置改用 Markdown 格式（.organization.md），支持应用列表管理
 * v1.2.1 - 组织配置改用中文字段名，所有信息独立字段存储
 * v1.2.0 - 新增组织配置管理功能，支持从 .organization.json 读取组织信息
 * v1.1.0 - 新增 accessWithLogin 函数，支持智能访问模式
 * v1.0.0 - 初始版本
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require('../../../../lib/core/utils');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 阶段二改造：Cookie 优先全局，兼容项目根
const GLOBAL_COOKIE_FILE = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
const COOKIE_FILE = fs.existsSync(GLOBAL_COOKIE_FILE) ? GLOBAL_COOKIE_FILE : path.join(PROJECT_ROOT, '.cookies.json');
const ORG_CONFIG_FILE_MD = path.join(PROJECT_ROOT, '组织及应用信息.md');
const ORG_CONFIG_FILE_JSON = path.join(PROJECT_ROOT, '.organization.json');
const DEFAULT_BASE_URL = 'https://www.aliwork.com';
const LOGIN_URL = 'https://www.aliwork.com/workPlatform';

// ==================== 组织配置管理 ====================

/**
 * 从 Markdown 表格中提取值
 * @param {string} mdContent - Markdown 内容
 * @param {string} fieldName - 字段名
 * @returns {string|null} 提取的值
 */
function extractValueFromMarkdown(mdContent, fieldName) {
  // 匹配表格行：| 字段名 | 值 | 说明 |
  const regex = new RegExp(`\\|\\s*${fieldName}\\s*\\|\\s*([^|]+)\\s*\\|`, 'i');
  const match = mdContent.match(regex);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * 从 Markdown 应用列表表格中提取应用信息
 * @param {string} mdContent - Markdown 内容
 * @returns {Array} 应用列表
 */
function extractAppsFromMarkdown(mdContent) {
  const apps = [];
  
  // 查找应用列表表格
  const appTableRegex = /## 应用列表[\s\S]*?\|------\|----------\|----------------\|----------\|------\|\n([\s\S]*?)(?=\n## |\n---|$)/;
  const tableMatch = mdContent.match(appTableRegex);
  
  if (tableMatch) {
    const tableContent = tableMatch[1];
    const lines = tableContent.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      // 解析表格行：| 序号 | 应用名称 | 应用ID | 应用类型 | 备注 |
      const match = line.match(/\|\s*\d+\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (match) {
        const appName = match[1].trim();
        const appId = match[2].trim();
        
        // 跳过空行（应用名称为 - 或空）
        if (appName && appName !== '-' && appId && appId !== '-') {
          apps.push({
            name: appName,
            appId: appId,
            type: match[3].trim(),
            remark: match[4].trim()
          });
        }
      }
    }
  }
  
  return apps;
}

/**
 * 加载组织配置
 * 优先从 .organization.md 读取，如果没有则从 .organization.json 读取，最后从 .cookies.json 读取
 * @returns {Object|null} 组织配置对象或 null
 */
function loadOrgConfig() {
  // 1. 优先从 .organization.md 读取（Markdown 格式）
  if (fs.existsSync(ORG_CONFIG_FILE_MD)) {
    try {
      const data = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
      
      // 提取组织信息
      const baseUrl = extractValueFromMarkdown(data, '完整域名');
      if (baseUrl) {
        console.log('  📋 从 .organization.md 加载组织配置');
        
        // 提取应用列表
        const apps = extractAppsFromMarkdown(data);
        
        return {
          domain_prefix: extractValueFromMarkdown(data, '域名前缀') || '',
          base_url: baseUrl,
          corp_id: extractValueFromMarkdown(data, 'corpId') || '',
          corp_name: extractValueFromMarkdown(data, 'corp名称') || '',
          name: extractValueFromMarkdown(data, '组织名称') || '',
          user_name: extractValueFromMarkdown(data, '用户名称') || '',
          user_id: extractValueFromMarkdown(data, '用户ID') || '',
          user_role: extractValueFromMarkdown(data, '用户角色') || '',
          is_super_admin: extractValueFromMarkdown(data, '是否为超级管理员') === 'true',
          department: extractValueFromMarkdown(data, '部门') || '',
          department_path: extractValueFromMarkdown(data, '部门路径') || '',
          apps: apps  // 应用列表
        };
      }
    } catch (e) {
      console.log('  ⚠️  读取 .organization.md 失败:', e.message);
    }
  }
  
  // 2. 从 .organization.json 读取（兼容旧版本）
  if (fs.existsSync(ORG_CONFIG_FILE_JSON)) {
    try {
      const data = fs.readFileSync(ORG_CONFIG_FILE_JSON, 'utf-8');
      const config = JSON.parse(data);
      
      // 检查新的中文字段名
      if (config['完整域名']) {
        console.log('  📋 从 .organization.json 加载组织配置');
        return {
          domain_prefix: config['域名前缀'] || '',
          base_url: config['完整域名'],
          corp_id: config['corpId'] || '',
          corp_name: config['corp名称'] || '',
          name: config['组织名称'] || '',
          user_name: config['用户名称'] || '',
          user_id: config['用户ID'] || '',
          user_role: config['用户角色'] || '',
          is_super_admin: config['是否为超级管理员'] || false,
          department: config['部门'] || '',
          department_path: config['部门路径'] || '',
          apps: config['应用列表'] || []
        };
      }
      
      // 兼容旧版本（organization 对象格式）
      if (config.organization?.base_url) {
        console.log('  📋 从 .organization.json 加载组织配置（旧格式）');
        return {
          domain_prefix: config.organization.domain_prefix || '',
          base_url: config.organization.base_url,
          corp_id: config.organization.corp_id || '',
          corp_name: config.organization.corp_name || '',
          name: config.organization.name || '',
          apps: []
        };
      }
    } catch (e) {
      console.log('  ⚠️  读取 .organization.json 失败:', e.message);
    }
  }
  
  // 3. 从 .cookies.json 读取（兼容旧版本）
  const cookieData = loadCookieData();
  if (cookieData?.base_url) {
    console.log('  📋 从 .cookies.json 加载组织配置');
    // 提取 domain_prefix
    const match = cookieData.base_url.match(/https:\/\/([^.]+)\.aliwork\.com/);
    return {
      domain_prefix: match ? match[1] : '',
      base_url: cookieData.base_url,
      corp_id: cookieData.corp_id || '',
      corp_name: '',
      name: '',
      apps: []
    };
  }
  
  return null;
}

/**
 * 保存组织配置到 .organization.md
 * @param {Object} orgConfig - 组织配置
 */
function saveOrgConfig(orgConfig) {
  try {
    // 读取现有的 Markdown 文件
    let mdContent = '';
    if (fs.existsSync(ORG_CONFIG_FILE_MD)) {
      mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
    } else {
      // 如果文件不存在，创建默认模板
      mdContent = generateDefaultMarkdown();
    }
    
    // 更新组织信息表格
    mdContent = updateMarkdownTable(mdContent, '组织信息', {
      '组织名称': orgConfig.name || '',
      '组织英文标识': orgConfig.org_english_id || '',
      '域名前缀': orgConfig.domain_prefix || extractDomainPrefix(orgConfig.base_url) || '',
      '完整域名': orgConfig.base_url || '',
      'corpId': orgConfig.corp_id || '',
      'corp名称': orgConfig.corp_name || '',
      'corp英文标识': orgConfig.corp_english_id || ''
    });
    
    // 更新用户信息表格
    mdContent = updateMarkdownTable(mdContent, '用户信息', {
      '用户ID': orgConfig.user_id || '',
      '用户名称': orgConfig.user_name || '',
      '用户角色': orgConfig.user_role || '',
      '是否为超级管理员': orgConfig.is_super_admin ? 'true' : 'false',
      '部门': orgConfig.department || '',
      '部门路径': orgConfig.department_path || ''
    });
    
    // 更新最后更新时间
    mdContent = mdContent.replace(
      /最后更新时间\s*\|\s*[^|]+\s*\|/,
      `最后更新时间 | ${new Date().toISOString()} |`
    );
    
    fs.writeFileSync(ORG_CONFIG_FILE_MD, mdContent);
    console.log('  ✅ 组织配置已保存到 .organization.md');
  } catch (e) {
    console.log('  ⚠️  保存组织配置失败:', e.message);
  }
}

/**
 * 生成默认的 Markdown 模板
 * @returns {string} Markdown 内容
 */
function generateDefaultMarkdown() {
  return `# 组织信息配置

> 本文件存储宜搭组织相关信息和应用列表，供各个 Skill 调用
> 
> **注意**: 修改此文件后，相关 Skill 会自动读取最新配置

---

## 基本信息

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 配置文件名称 | 组织信息 | - |
| 版本 | 1.0.0 | 配置格式版本 |
| 最后更新时间 | ${new Date().toISOString()} | 自动更新 |

---

## 组织信息

| 字段名 | 值 | 说明 |
|--------|-----|------|
| 组织名称 |  | 宜搭组织显示名称 |
| 组织英文标识 |  | 组织的英文标识符 |
| 域名前缀 |  | 宜搭域名前缀，用于构建访问地址 |
| 完整域名 |  | 完整的宜搭访问地址 |
| corpId |  | 钉钉 corpId |
| corp名称 |  | corp 显示名称 |
| corp英文标识 |  | corp 英文标识 |

---

## 用户信息

| 字段名 | 值 | 说明 |
|--------|-----|------|
| 用户ID |  | 当前登录用户ID |
| 用户名称 |  | 当前登录用户姓名 |
| 用户角色 |  | 用户在组织中的角色 |
| 是否为超级管理员 |  | 是否具有超级管理员权限 |
| 部门 |  | 用户所属部门 |
| 部门路径 |  | 完整的部门层级路径 |

---

## 应用列表

> 在此添加需要管理的宜搭应用，Skill 会自动读取

| 序号 | 应用名称 | 应用ID (appId) | 应用类型 | 备注 |
|------|----------|----------------|----------|------|
| 1 | - | - | - | 预留空行，添加新应用时请复制此行 |
| 2 | - | - | - | 预留空行 |
| 3 | - | - | - | 预留空行 |

---

## 使用说明

### 如何添加新应用

1. 在「应用列表」表格中找到空行，或复制一行
2. 填写应用名称、应用ID、应用类型和备注
3. 保存文件后即可被 Skill 读取

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
}

/**
 * 更新 Markdown 表格中的值
 * @param {string} mdContent - Markdown 内容
 * @param {string} tableTitle - 表格标题（如 "组织信息"）
 * @param {Object} values - 要更新的字段和值
 * @returns {string} 更新后的 Markdown 内容
 */
function updateMarkdownTable(mdContent, tableTitle, values) {
  // 查找表格位置
  const tableRegex = new RegExp(`(## ${tableTitle}\\n\\n\\| 字段名 \\| 值 \\| 说明 \\|\\n\\|--------\\|-----\\|------\\|\\n)([\\s\\S]*?)(?=\\n## |\\n---|$)`);
  const match = mdContent.match(tableRegex);
  
  if (!match) return mdContent;
  
  let tableBody = match[2];
  
  // 更新每个字段的值
  for (const [fieldName, value] of Object.entries(values)) {
    const fieldRegex = new RegExp(`(\\| ${fieldName} \\| )([^|]+)( \\|)`, 'g');
    tableBody = tableBody.replace(fieldRegex, `$1${value}$3`);
  }
  
  // 替换原表格内容
  return mdContent.replace(tableRegex, `$1${tableBody}$3`);
}

/**
 * 从 base_url 提取 domain_prefix
 * @param {string} baseUrl - 如 https://qfhefh.aliwork.com
 * @returns {string} - 如 qfhefh
 */
function extractDomainPrefix(baseUrl) {
  if (!baseUrl) return '';
  const match = baseUrl.match(/https:\/\/([^.]+)\.aliwork\.com/);
  return match ? match[1] : '';
}

// ==================== Cookie 管理 ====================

/**
 * 加载 Cookie 文件
 * Phase 6: 委托给 lib/core/utils.loadCookieData（统一实现）
 * @returns {Object|null} {cookies, base_url, csrf_token, corp_id, login_user} 或 null
 */
function loadCookieData() {
  return coreUtils.loadCookieData(PROJECT_ROOT, DEFAULT_BASE_URL);
}

/**
 * 仅加载 Cookie 数组
 * @returns {Array|null} Cookie 数组或 null
 */
function loadCookies() {
  const data = loadCookieData();
  return data?.cookies || null;
}

/**
 * 保存登录态
 * @param {Object} loginState - 登录态对象
 */
function cleanCookiesForStorage(cookies) {
  const validKeys = new Set(['name', 'value', 'domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite']);
  return cookies.map(cookie => {
    const cleaned = {};
    for (const key of validKeys) {
      if (cookie[key] !== undefined) {
        cleaned[key] = cookie[key];
      }
    }
    return cleaned;
  });
}

function saveLoginState(loginState) {
  const data = {
    cookies: cleanCookiesForStorage(loginState.cookies),
    base_url: loginState.base_url,
    csrf_token: loginState.csrf_token,
    corp_id: loginState.corp_id,
    login_user: loginState.login_user,
    updated_at: new Date().toISOString()
  };
  
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2));
  console.log('  ✅ 登录态已保存到 .cookies.json');
}

// ==================== 登录流程处理 ====================

/**
 * 处理宜搭登录授权流程
 * 自动处理各种登录页面（立即登录、选择组织等）
 * 
 * @param {Object} page - Playwright page 对象
 * @param {Object} config - 配置选项
 * @returns {Promise<Object>} {success, message}
 */
async function handleLoginFlow(page, config = {}) {
  console.log('  🔐 开始处理登录流程...');
  
  const maxSteps = 15;
  let step = 0;
  
  while (step < maxSteps) {
    step++;
    console.log(`\n  📍 步骤 ${step}/${maxSteps}`);
    
    // 等待页面稳定
    await page.waitForTimeout(3000);
    
    // 检查当前页面状态
    const pageState = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      
      // 1. 检查是否已进入宜搭设计器或工作台
      if (bodyText.includes('表单设计') || bodyText.includes('组件库') || 
          bodyText.includes('页面设置') || bodyText.includes('保存') ||
          bodyText.includes('我的应用') || bodyText.includes('工作台')) {
        return { type: 'logged-in', message: '已登录到宜搭' };
      }
      
      // 2. 检查协议同意页面
      const confirmBtn = document.querySelector('.module-agreement-button-co');
      if (confirmBtn && bodyText.includes('确定')) {
        return { 
          type: 'agreement', 
          message: '协议同意页面',
          button: '.module-agreement-button-co',
          buttonText: '确定'
        };
      }
      
      // 3. 检查立即登录页面（按钮形式）
      const loginBtn = document.querySelector('.module-confirm-button');
      if (loginBtn && bodyText.includes('立即登录')) {
        return { 
          type: 'login-button', 
          message: '立即登录页面（按钮）',
          button: '.module-confirm-button',
          buttonText: '立即登录'
        };
      }
      
      // 4. 检查二维码+头像授权登录页面
      const avatarPic = document.querySelector('.base-comp-avatar-pic');
      const qrCode = document.querySelector('.login-qr-code, .qrcode, [class*="qr"]');
      
      if ((qrCode && avatarPic) || bodyText.includes('点击头像授权')) {
        return { 
          type: 'avatar-login', 
          message: '二维码+头像授权登录页面',
          avatarSelector: '.base-comp-avatar-pic',
          buttonText: '点击头像授权登录'
        };
      }
      
      // 5. 检查组织选择页面
      if (bodyText.includes('选择你加入的组织')) {
        return { 
          type: 'select-org', 
          message: '组织选择页面'
        };
      }
      
      // 6. 检查需要手动处理的页面
      if (bodyText.includes('绑定手机号码') || bodyText.includes('请设置密码')) {
        return { 
          type: 'manual', 
          message: '需要手动完成的页面',
          text: bodyText.substring(0, 100)
        };
      }
      
      // 7. 未知状态
      return { 
        type: 'unknown', 
        message: '未知页面状态',
        text: bodyText.substring(0, 200)
      };
    });
    
    console.log(`    当前状态: ${pageState.type} - ${pageState.message}`);
    
    // 根据状态执行相应操作
    switch (pageState.type) {
      case 'logged-in':
        console.log('    ✅ 登录流程完成！');
        await page.waitForTimeout(5000);
        return { success: true, message: '登录成功' };
        
      case 'agreement':
        console.log(`    🖱️ 点击"${pageState.buttonText}"按钮...`);
        try {
          await page.click(pageState.button, { force: true, timeout: 5000 });
          console.log('    ✅ 已点击确定');
        } catch (e) {
          console.log('    ⚠️ 点击失败，尝试文本选择器');
          try {
            await page.click('text="确定"', { force: true, timeout: 5000 });
            console.log('    ✅ 已点击确定(文本选择器)');
          } catch (e2) {
            console.log('    ❌ 无法点击确定按钮');
          }
        }
        break;
        
      case 'avatar-login':
        console.log('    🖱️ 检测到二维码+头像登录，点击头像...');
        try {
          const avatar = await page.$('.base-comp-avatar-pic');
          if (avatar) {
            await avatar.click({ force: true, timeout: 5000 });
            console.log('    ✅ 已点击头像');
          } else {
            throw new Error('未找到头像元素');
          }
        } catch (e) {
          console.log('    ⚠️ 点击失败:', e.message);
        }
        break;
        
      case 'login-button':
        console.log(`    🖱️ 点击"${pageState.buttonText}"按钮...`);
        try {
          await page.click(pageState.button, { force: true, timeout: 5000 });
          console.log('    ✅ 已点击立即登录');
        } catch (e) {
          console.log('    ⚠️ 点击失败，尝试文本选择器');
          try {
            await page.click('text="立即登录"', { force: true, timeout: 5000 });
            console.log('    ✅ 已点击立即登录(文本选择器)');
          } catch (e2) {
            console.log('    ❌ 无法点击立即登录按钮');
          }
        }
        break;
        
      case 'select-org':
        console.log('    🖱️ 尝试点击第一个组织...');
        try {
          const selectors = [
            '.org-item',
            '.module-corp-sel-listitem',
            '.module-corp-sel-listitem-title',
            '[class*="corp-sel"]',
            '[class*="org"]',
            '.next-list-item'
          ];
          let clicked = false;
          for (const selector of selectors) {
            try {
              const elements = await page.$$(selector);
              if (elements.length > 0) {
                for (const el of elements) {
                  const isVisible = await el.isVisible().catch(() => false);
                  if (isVisible) {
                    await el.click({ force: true, timeout: 5000 });
                    console.log(`    ✅ 已点击第一个组织 (${selector})`);
                    clicked = true;
                    break;
                  }
                }
                if (clicked) break;
              }
            } catch (e) {
              // 继续尝试下一个选择器
            }
          }
          if (!clicked) {
            console.log('    ⚠️ 未能点击组织');
          }
        } catch (e) {
          console.log('    ❌ 点击组织失败:', e.message);
        }
        break;
        
      case 'manual':
        console.log('    ⚠️ 需要手动操作:', pageState.text);
        if (config.headless) {
          throw new Error('需要手动完成登录流程');
        }
        console.log('    ⏳ 等待30秒供手动操作...');
        await page.waitForTimeout(30000);
        break;
        
      case 'unknown':
        console.log('    ⚠️ 未知状态，页面文本:', pageState.text);
        break;
    }
    
    console.log('    ⏳ 等待页面响应...');
    await page.waitForTimeout(5000);
  }
  
  console.log('  ⚠️ 登录流程达到最大步骤数，可能未完成');
  return { success: false, message: '登录流程未完成' };
}

// ==================== 主接口 ====================

/**
 * 确保拥有有效的登录态
 * 会自动验证现有 Cookie，如果无效则触发登录流程
 * 
 * @param {Object} options - 选项
 * @param {boolean} options.headless - 是否无头模式（默认 false）
 * @param {string} options.targetUrl - 目标 URL（默认工作台）
 * @returns {Promise<Object>} 登录态对象
 */
async function ensureLogin(options = {}) {
  const { headless = false, targetUrl = LOGIN_URL } = options;
  
  console.log('\n' + '='.repeat(50));
  console.log('  宜搭模拟登录管理器');
  console.log('='.repeat(50));
  
  // 1. 尝试加载现有 Cookie
  const existingData = loadCookieData();
  
  if (existingData?.cookies) {
    console.log(`  检测到本地 Cookie (${existingData.cookies.length} 个)`);
    console.log('  🔍 验证 Cookie 有效性...');
    
    // 2. 验证 Cookie 是否有效
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    
    try {
      await context.addCookies(existingData.cookies);
      const page = await context.newPage();
      
      const testUrl = `${existingData.base_url || DEFAULT_BASE_URL}/myApp`;
      await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });
      
      const currentUrl = page.url();
      if (!currentUrl.includes('login.dingtalk') && !currentUrl.includes('/oauth2/') && !currentUrl.includes('signin')) {
        // Cookie 有效
        console.log('  ✅ Cookie 验证成功');
        await browser.close();
        return existingData;
      }
      
      console.log('  ❌ Cookie 已失效，需要重新登录');
    } catch (error) {
      console.log('  ❌ 验证失败:', error.message);
    } finally {
      await browser.close();
    }
  } else {
    console.log('  未检测到本地 Cookie');
  }
  
  // 3. 需要重新登录
  console.log('\n🔐 开始交互式登录...');
  console.log(`  登录地址: ${targetUrl}`);
  
  const browser = await chromium.launch({ 
    headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  
  const page = await context.newPage();
  
  try {
    // 打开登录页面
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 120000 });
    console.log('  📄 已打开登录页面');
    
    // 处理登录流程
    const loginResult = await handleLoginFlow(page, { headless });
    
    if (!loginResult.success) {
      throw new Error('登录流程未完成');
    }
    
    // 获取登录态信息
    const currentUrl = page.url();
    const baseUrl = currentUrl.replace(/\/workPlatform.*$/, '');
    
    // 访问 myApp 获取完整信息
    const myAppUrl = `${baseUrl}/myApp`;
    await page.goto(myAppUrl, { waitUntil: 'networkidle' });
    
    const csrfToken = await page.evaluate(() => {
      const input = document.querySelector("input[name='_csrf_token']");
      return input ? input.value : null;
    });
    
    const loginUser = await page.evaluate(() => window.loginUser || null);
    const corpId = await page.evaluate(() => 
      window.pageConfig?.corpId || null
    );
    
    const cookies = await context.cookies();
    
    const loginState = {
      cookies,
      base_url: baseUrl,
      csrf_token: csrfToken,
      corp_id: corpId,
      login_user: loginUser
    };
    
    console.log(`  用户: ${loginUser?.userName || '未知'}`);
    console.log(`  corpId: ${corpId || '未知'}`);
    console.log(`  baseUrl: ${baseUrl}`);
    
    // 保存登录态
    saveLoginState(loginState);
    
    // 保存组织配置（使用新的中文字段格式）
    saveOrgConfig({
      base_url: baseUrl,
      corp_id: corpId,
      name: loginUser?.corpName || '',
      corp_name: loginUser?.corpName || '',
      user_id: loginUser?.userId || '',
      user_name: loginUser?.userName || '',
      user_role: loginUser?.userRole || '',
      is_super_admin: loginUser?.isSuperAdmin === 'y',
      department: loginUser?.deptName || '',
      department_path: loginUser?.deptName || ''
    });
    
    console.log('='.repeat(50));
    return loginState;
    
  } catch (error) {
    console.error('  ❌ 登录失败:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * 快速获取 Cookie（不验证，不触发登录）
 * @returns {Array|null} Cookie 数组或 null
 */
function getCookiesQuick() {
  return loadCookies();
}

/**
 * 获取完整的登录态信息（不验证，不触发登录）
 * 优先使用组织配置中的 base_url
 * @returns {Object|null} 登录态对象或 null
 */
function getLoginStateQuick() {
  const cookieData = loadCookieData();
  const orgConfig = loadOrgConfig();
  
  // 合并数据：Cookie 数据 + 组织配置（组织配置优先）
  if (cookieData || orgConfig) {
    return {
      ...cookieData,
      ...orgConfig,
      base_url: orgConfig?.base_url || cookieData?.base_url || DEFAULT_BASE_URL,
      corp_id: orgConfig?.corp_id || cookieData?.corp_id || null
    };
  }
  
  return null;
}

/**
 * 访问目标页面（带自动登录）
 * 先尝试使用现有 Cookie 直接访问，如果失败则自动触发登录流程
 * 
 * @param {Object} options - 选项
 * @param {string} options.targetUrl - 目标页面 URL（必需）
 * @param {boolean} options.headless - 是否无头模式（默认 false）
 * @param {Object} options.page - 已有的 Playwright page 对象（可选）
 * @returns {Promise<Object>} { success, page, loginState, usedExistingCookie }
 */
async function accessWithLogin(options = {}) {
  const { targetUrl, headless = false, page: existingPage } = options;
  
  if (!targetUrl) {
    throw new Error('targetUrl 不能为空');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('  宜搭页面访问（带自动登录）');
  console.log('='.repeat(60));
  console.log(`  目标页面: ${targetUrl}`);
  
  let browser;
  let page;
  let usedExistingCookie = false;
  
  // 如果传入了已有的 page，则直接使用
  if (existingPage) {
    page = existingPage;
    console.log('  使用传入的 page 对象');
  } else {
    // 启动浏览器
    console.log('\n🚀 启动浏览器...');
    browser = await chromium.launch({ 
      headless,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    
    // 尝试使用现有 Cookie
    const existingData = loadCookieData();
    if (existingData?.cookies?.length > 0) {
      console.log(`  检测到本地 Cookie (${existingData.cookies.length} 个)`);
      await context.addCookies(existingData.cookies);
      console.log('  ✅ Cookie 已添加到浏览器');
    }
    
    page = await context.newPage();
  }
  
  try {
    // 尝试直接访问目标页面
    console.log(`\n📍 尝试直接访问: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    const currentUrl = page.url();
    console.log(`  当前页面: ${currentUrl}`);
    
    // 检查是否需要登录
    const needsLogin = currentUrl.includes('login.dingtalk') || 
                       currentUrl.includes('/oauth2/') || 
                       currentUrl.includes('signin') ||
                       (currentUrl.includes('workPlatform') && !currentUrl.includes('aliwork.com'));
    
    if (!needsLogin) {
      // 直接访问成功
      console.log('  ✅ 直接访问成功（无需登录）');
      usedExistingCookie = true;
      
      // 获取当前登录态
      const cookies = await page.context().cookies();
      const loginUser = await page.evaluate(() => window.loginUser || null);
      const corpId = await page.evaluate(() => window.pageConfig?.corpId || null);
      const csrfToken = await page.evaluate(() => {
        const input = document.querySelector("input[name='_csrf_token']");
        return input ? input.value : null;
      });
      
      let baseUrl = currentUrl.replace(/\/admin.*$/, '').replace(/\/design.*$/, '').replace(/\/myApp.*$/, '').replace(/\/alibaba.*$/, '');
      if (!baseUrl.includes('aliwork.com')) {
        const existingData = loadCookieData();
        baseUrl = existingData?.base_url || baseUrl;
      }
      
      const loginState = {
        cookies,
        base_url: baseUrl,
        csrf_token: csrfToken,
        corp_id: corpId,
        login_user: loginUser,
        updated_at: new Date().toISOString()
      };
      
      // 保存更新后的登录态
      saveLoginState(loginState);
      
      // 保存组织配置（使用新的中文字段格式）
      saveOrgConfig({
        base_url: baseUrl,
        corp_id: corpId,
        name: loginUser?.corpName || '',
        corp_name: loginUser?.corpName || '',
        user_id: loginUser?.userId || '',
        user_name: loginUser?.userName || '',
        user_role: loginUser?.userRole || '',
        is_super_admin: loginUser?.isSuperAdmin === 'y',
        department: loginUser?.deptName || '',
        department_path: loginUser?.deptName || ''
      });
      
      console.log('='.repeat(60));
      
      return {
        success: true,
        page,
        browser,
        loginState,
        usedExistingCookie: true
      };
    }
    
    // 需要登录
    console.log('  ⚠️ 需要登录，开始登录流程...');
    
    // 处理登录流程
    const loginResult = await handleLoginFlow(page, { headless });
    
    if (!loginResult.success) {
      throw new Error('登录流程未完成');
    }
    
    // 登录成功后，访问目标页面
    console.log(`\n📍 登录成功，访问目标页面: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    
    // 获取登录态信息
    const currentUrlAfterLogin = page.url();
    let baseUrl = currentUrlAfterLogin.replace(/\/admin.*$/, '').replace(/\/design.*$/, '').replace(/\/myApp.*$/, '').replace(/\/alibaba.*$/, '');
    if (!baseUrl.includes('aliwork.com')) {
      const existingData = loadCookieData();
      baseUrl = existingData?.base_url || baseUrl;
    }
    
    const cookies = await page.context().cookies();
    const loginUser = await page.evaluate(() => window.loginUser || null);
    const corpId = await page.evaluate(() => window.pageConfig?.corpId || null);
    const csrfToken = await page.evaluate(() => {
      const input = document.querySelector("input[name='_csrf_token']");
      return input ? input.value : null;
    });
    
    const loginState = {
      cookies,
      base_url: baseUrl,
      csrf_token: csrfToken,
      corp_id: corpId,
      login_user: loginUser,
      updated_at: new Date().toISOString()
    };
    
    console.log(`  用户: ${loginUser?.userName || '未知'}`);
    console.log(`  baseUrl: ${baseUrl}`);
    
    // 保存登录态
    saveLoginState(loginState);
    
    // 保存组织配置（使用新的中文字段格式）
    saveOrgConfig({
      base_url: baseUrl,
      corp_id: corpId,
      name: loginUser?.corpName || '',
      corp_name: loginUser?.corpName || '',
      user_id: loginUser?.userId || '',
      user_name: loginUser?.userName || '',
      user_role: loginUser?.userRole || '',
      is_super_admin: loginUser?.isSuperAdmin === 'y',
      department: loginUser?.deptName || '',
      department_path: loginUser?.deptName || ''
    });
    
    console.log('='.repeat(60));
    
    return {
      success: true,
      page,
      browser,
      loginState,
      usedExistingCookie: false
    };
    
  } catch (error) {
    console.error('  ❌ 访问失败:', error.message);
    
    // 如果出错，关闭浏览器（如果是我们自己创建的）
    if (browser && !existingPage) {
      await browser.close();
    }
    
    throw error;
  }
}

// ==================== 导出 ====================

module.exports = {
  // 主要接口
  ensureLogin,
  accessWithLogin,  // 新增：访问页面（带自动登录）
  handleLoginFlow,

  // Cookie 管理
  loadCookies,
  loadCookieData,
  saveLoginState,

  // 组织配置管理
  loadOrgConfig,
  saveOrgConfig,
  extractDomainPrefix,
  extractValueFromMarkdown,
  extractAppsFromMarkdown,
  generateDefaultMarkdown,
  updateMarkdownTable,

  // 快速获取（不验证）
  getCookiesQuick,
  getLoginStateQuick,

  // 常量
  COOKIE_FILE,
  ORG_CONFIG_FILE_MD,
  ORG_CONFIG_FILE_JSON,
  DEFAULT_BASE_URL,
  LOGIN_URL
};
