/**
 * lib/core/login-manager.js — 统一登录管理器（合并版）
 *
 * 合并自 3 份 login-manager：
 *   1. org-init/scripts/login-manager.js (v1.0.12) — 基础版本，含 15 个 bug 修复
 *   2. simulated-login/scripts/login-manager.js (v1.3.1) — 组织配置管理、accessWithLogin
 *   3. yida-api-client/scripts/login_manager.js (v1.0.0) — 浏览器降级、fetchPageInfo
 *
 * 合并内容：
 *   ✅ org-init: UTF-8编码、上下文销毁处理、全局try-catch、base_url验证、双重保险组织信息、自定义浏览器路径、扩展等待时间
 *   ✅ simulated-login: 组织配置管理(Markdown)、cleanCookiesForStorage、accessWithLogin、getCookiesQuick、getLoginStateQuick
 *   ✅ yida-api-client: launchBrowserWithFallback(chromium/msedge/chrome)、fetchPageInfo、tryHeadlessLogin
 *   ✅ 公共库: 使用 lib/core/utils.js 和 lib/core/error.js
 *   ✅ Playwright 可选依赖（require 失败时优雅降级）
 *
 * 原文件保持不变（双轨制原则：稳定轨冻结，公共库独立）。
 *
 * 创建日期：2026-07-10 (Phase 2)
 * 版本：1.1.0 — logged-in 判定增加组织域名 URL 识别，修复新版 dashboard 登录挂起
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 公共库
const { findProjectRoot, resolveBaseUrl, extractInfoFromCookies, loadCookieData: coreLoadCookieData, DEFAULT_BASE_URL } = require('./utils');
const { CliError, ErrorCode } = require('./error');

// Playwright 可选依赖
let chromium = null;
try {
  chromium = require('playwright').chromium;
} catch {
  // Playwright 不可用，相关功能将降级
}

// Windows 平台设置 UTF-8 代码页，解决中文乱码（来自 org-init 修复）
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    // 忽略错误，继续执行
  }
}

// ── 配置 ───────────────────────────────────────────────

const PROJECT_ROOT = findProjectRoot();
// 阶段二改造：Cookie 优先全局，兼容项目根
const GLOBAL_COOKIE_FILE = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
const PROJECT_COOKIE_FILE = path.join(PROJECT_ROOT, '.cookies.json');
const COOKIE_FILE = fs.existsSync(GLOBAL_COOKIE_FILE) ? GLOBAL_COOKIE_FILE : PROJECT_COOKIE_FILE;
const ORG_CONFIG_FILE_MD = path.join(PROJECT_ROOT, '组织及应用信息.md');
const ORG_CONFIG_FILE_JSON = path.join(PROJECT_ROOT, '.organization.json');
const LOGIN_URL = 'https://www.aliwork.com/workPlatform';

// 浏览器可执行文件路径（支持自定义 Playwright 浏览器位置）
const CHROMIUM_EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  path.join(PROJECT_ROOT, '.playwright-browsers', 'chromium-1217', 'chrome-win64', 'chrome.exe');

// ── URL 验证工具（来自 org-init）───────────────────────

/**
 * 验证 base_url 是否是有效的宜搭组织域名
 * 有效的组织域名应该不是 www.aliwork.com，而是类似 xxx.aliwork.com 的格式
 * @param {string} baseUrl
 * @returns {boolean}
 */
function isValidOrgBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return false;
  }

  if (!baseUrl.includes('.aliwork.com')) {
    return false;
  }

  const domainPrefix = baseUrl.replace('https://', '').replace('.aliwork.com', '');

  // 排除无效的域名前缀（包括官方文档站点）
  const invalidPrefixes = ['www', 'login', 'auth', 'docs', 'help', 'support', 'developer', ''];
  if (invalidPrefixes.includes(domainPrefix)) {
    return false;
  }

  return true;
}

/**
 * 从页面中提取正确的 base_url（来自 org-init）
 * 会尝试多种方式获取，确保返回有效的组织域名
 * @param {object} page - Playwright page 对象
 * @returns {Promise<string|null>}
 */
async function extractValidBaseUrl(page) {
  const url = page.url();

  // 方法1: 直接从当前 URL 提取
  const urlMatch = url.match(/^(https:\/\/[^\/]+)/);
  if (urlMatch) {
    const extractedUrl = urlMatch[1];
    if (isValidOrgBaseUrl(extractedUrl)) {
      return extractedUrl;
    }
  }

  // 方法2: 从页面中的链接提取
  try {
    const appLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*=".aliwork.com"]');
      return link ? link.href : null;
    });

    if (appLink) {
      const linkMatch = appLink.match(/^(https:\/\/[^\/]+)/);
      if (linkMatch && isValidOrgBaseUrl(linkMatch[1])) {
        return linkMatch[1];
      }
    }
  } catch {
    // 忽略错误
  }

  // 方法3: 检查页面是否包含组织信息
  try {
    const pageText = await page.evaluate(() => document.body?.innerText || '');
    if (pageText.includes('应用不存在') || pageText.includes('无权限访问')) {
      return null;
    }
  } catch {
    // 忽略错误
  }

  return null;
}

// ── 浏览器启动（来自 yida-api-client + org-init）────────

/**
 * 启动浏览器，支持多种引擎降级
 * 合并自 yida-api-client 的 launchBrowserWithFallback 和 org-init 的自定义路径
 *
 * @param {boolean} [headless=true]
 * @returns {Promise<object>} 浏览器实例
 */
async function launchBrowserWithFallback(headless = true) {
  if (!chromium) {
    throw new CliError(
      ErrorCode.UNKNOWN,
      'Playwright 不可用，无法启动浏览器',
      { hint: '请安装 Playwright: npm install playwright && npx playwright install chromium' }
    );
  }

  // 自定义浏览器路径检测（来自 org-init）
  const launchOptions = { headless, timeout: 30000 };

  if (fs.existsSync(CHROMIUM_EXECUTABLE_PATH)) {
    launchOptions.executablePath = CHROMIUM_EXECUTABLE_PATH;
  }

  // 候选引擎列表（来自 yida-api-client）
  const candidates = [
    { name: 'custom-chromium', options: { ...launchOptions } },
    { name: 'playwright-chromium', options: { headless } },
    { name: 'msedge', options: { headless, channel: 'msedge' } },
    { name: 'chrome', options: { headless, channel: 'chrome' } },
  ];

  // 如果没有自定义路径，跳过第一个候选
  const startIndex = fs.existsSync(CHROMIUM_EXECUTABLE_PATH) ? 0 : 1;

  let lastError = null;
  for (let i = startIndex; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const browser = await chromium.launch(candidate.options);
      return browser;
    } catch (e) {
      lastError = e;
    }
  }

  throw new CliError(ErrorCode.UNKNOWN, `无法启动浏览器: ${lastError?.message}`, {
    hint: '运行 npx playwright install chromium 安装浏览器',
    cause: lastError,
  });
}

// ── 页面信息提取（来自 yida-api-client）────────────────

/**
 * 从页面提取 csrf_token、loginUser、corpId、baseUrl
 * @param {object} page - Playwright page 对象
 * @param {string} targetUrl - 目标 URL
 * @returns {Promise<object|null>}
 */
async function fetchPageInfo(page, targetUrl) {
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  } catch {
    // 页面加载超时不阻塞
  }

  // 检查是否被重定向到登录页
  const currentUrl = page.url();
  if (currentUrl.toLowerCase().includes('login') || currentUrl.toLowerCase().includes('sign')) {
    return null;
  }

  // 提取 csrf_token（重试 10 次，来自 yida-api-client）
  let csrfToken = null;
  for (let i = 0; i < 10; i++) {
    try {
      csrfToken = await page.evaluate(() => {
        const input = document.querySelector('input[name=\'_csrf_token\']');
        return input ? input.value : null;
      });
      if (csrfToken) break;
    } catch {
      // 忽略
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 提取 loginUser
  let loginUser = null;
  try {
    loginUser = await page.evaluate(() => window.loginUser || null);
  } catch {
    // 忽略
  }

  // 提取 corpId
  let corpId = null;
  try {
    corpId = await page.evaluate(() => window.pageConfig?.corpId || null);
  } catch {
    // 忽略
  }

  // 提取 base_url
  const { URL } = require('url');
  const parsed = new URL(page.url());
  const baseUrl = parsed.origin || null;

  return { csrfToken, loginUser, corpId, baseUrl };
}

// ── Cookie 管理（合并自 3 份）──────────────────────────

/**
 * 加载 Cookie 数据（使用公共库版本，兼容旧格式）
 * @returns {object|null}
 */
function loadCookieData() {
  return coreLoadCookieData(PROJECT_ROOT);
}

/**
 * 清理 Cookie（移除 Playwright 特有字段）（来自 simulated-login v1.3.1 修复）
 * @param {Array} cookies
 * @returns {Array}
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

/**
 * 保存 Cookie 数据
 * 合并 org-init 的 saveCookieData 和 simulated-login 的 saveLoginState
 * @param {object} data - 登录态对象
 */
function saveCookieData(data) {
  const dataToSave = {
    cookies: cleanCookiesForStorage(data.cookies),
    base_url: data.base_url,
    csrf_token: data.csrf_token,
    corp_id: data.corp_id,
    login_user: data.login_user,
    updated_at: new Date().toISOString(),
  };

  fs.writeFileSync(COOKIE_FILE, JSON.stringify(dataToSave, null, 2));
  console.log('  ✅ 登录态已保存到 .cookies.json');
}

/**
 * 仅加载 Cookie 数组（来自 simulated-login）
 * @returns {Array|null}
 */
function loadCookies() {
  const data = loadCookieData();
  return data?.cookies || null;
}

/**
 * 保存登录态（simulated-login 兼容别名）
 */
const saveLoginState = saveCookieData;

// ── 组织配置管理（来自 simulated-login）────────────────

/**
 * 从 base_url 提取 domain_prefix
 * @param {string} baseUrl
 * @returns {string}
 */
function extractDomainPrefix(baseUrl) {
  if (!baseUrl) return '';
  const match = baseUrl.match(/https:\/\/([^.]+)\.aliwork\.com/);
  return match ? match[1] : '';
}

/**
 * 从 Markdown 表格中提取值（来自 simulated-login）
 */
function extractValueFromMarkdown(mdContent, fieldName) {
  const regex = new RegExp(`\\|\\s*${fieldName}\\s*\\|\\s*([^|]+)\\s*\\|`, 'i');
  const match = mdContent.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * 从 Markdown 应用列表表格中提取应用信息（来自 simulated-login）
 */
function extractAppsFromMarkdown(mdContent) {
  const apps = [];
  const appTableRegex = /## 应用列表[\s\S]*?\|------\|----------\|----------------\|----------\|------\|\n([\s\S]*?)(?=\n## |\n---|$)/;
  const tableMatch = mdContent.match(appTableRegex);

  if (tableMatch) {
    const lines = tableMatch[1].split('\n').filter(line => line.trim());
    for (const line of lines) {
      const match = line.match(/\|\s*\d+\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/);
      if (match) {
        const appName = match[1].trim();
        const appId = match[2].trim();
        if (appName && appName !== '-' && appId && appId !== '-') {
          apps.push({ name: appName, appId, type: match[3].trim(), remark: match[4].trim() });
        }
      }
    }
  }

  return apps;
}

/**
 * 加载组织配置（来自 simulated-login）
 */
function loadOrgConfig() {
  // 1. 从 .organization.md 读取
  if (fs.existsSync(ORG_CONFIG_FILE_MD)) {
    try {
      const data = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
      const baseUrl = extractValueFromMarkdown(data, '完整域名');
      if (baseUrl) {
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
          apps,
        };
      }
    } catch {
      // 忽略
    }
  }

  // 2. 从 .organization.json 读取
  if (fs.existsSync(ORG_CONFIG_FILE_JSON)) {
    try {
      const config = JSON.parse(fs.readFileSync(ORG_CONFIG_FILE_JSON, 'utf-8'));
      if (config['完整域名']) {
        return {
          domain_prefix: config['域名前缀'] || '',
          base_url: config['完整域名'],
          corp_id: config['corpId'] || '',
          corp_name: config['corp名称'] || '',
          name: config['组织名称'] || '',
          apps: config['应用列表'] || [],
        };
      }
      if (config.organization?.base_url) {
        return {
          domain_prefix: config.organization.domain_prefix || '',
          base_url: config.organization.base_url,
          corp_id: config.organization.corp_id || '',
          corp_name: config.organization.corp_name || '',
          name: config.organization.name || '',
          apps: [],
        };
      }
    } catch {
      // 忽略
    }
  }

  // 3. 从 .cookies.json 读取
  const cookieData = loadCookieData();
  if (cookieData?.base_url) {
    return {
      domain_prefix: extractDomainPrefix(cookieData.base_url),
      base_url: cookieData.base_url,
      corp_id: cookieData.corp_id || '',
      corp_name: '',
      name: '',
      apps: [],
    };
  }

  return null;
}

/**
 * 生成默认的 Markdown 模板（来自 simulated-login）
 */
function generateDefaultMarkdown() {
  return `# 组织信息配置

> 本文件存储宜搭组织相关信息和应用列表，供各个 Skill 调用

---

## 基本信息

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 版本 | 1.0.0 | 配置格式版本 |
| 最后更新时间 | ${new Date().toISOString()} | 自动更新 |

---

## 组织信息

| 字段名 | 值 | 说明 |
|--------|-----|------|
| 组织名称 |  | 宜搭组织显示名称 |
| 域名前缀 |  | 宜搭域名前缀 |
| 完整域名 |  | 完整的宜搭访问地址 |
| corpId |  | 钉钉 corpId |
| corp名称 |  | corp 显示名称 |

---

## 用户信息

| 字段名 | 值 | 说明 |
|--------|-----|------|
| 用户ID |  | 当前登录用户ID |
| 用户名称 |  | 当前登录用户姓名 |
| 用户角色 |  | 用户在组织中的角色 |
| 是否为超级管理员 |  | 是否具有超级管理员权限 |
| 部门 |  | 用户所属部门 |

---

## 应用列表

| 序号 | 应用名称 | 应用ID (appId) | 应用类型 | 备注 |
|------|----------|----------------|----------|------|
| 1 | - | - | - | 预留空行 |
`;
}

/**
 * 更新 Markdown 表格中的值（来自 simulated-login）
 */
function updateMarkdownTable(mdContent, tableTitle, values) {
  const tableRegex = new RegExp(`(## ${tableTitle}\\n\\n\\| 字段名 \\| 值 \\| 说明 \\|\\n\\|--------\\|-----\\|------\\|\\n)([\\s\\S]*?)(?=\\n## |\\n---|$)`);
  const match = mdContent.match(tableRegex);
  if (!match) return mdContent;

  let tableBody = match[2];
  for (const [fieldName, value] of Object.entries(values)) {
    const fieldRegex = new RegExp(`(\\| ${fieldName} \\| )([^|]+)( \\|)`, 'g');
    tableBody = tableBody.replace(fieldRegex, `$1${value}$3`);
  }

  return mdContent.replace(tableRegex, `$1${tableBody}$3`);
}

/**
 * 保存组织配置（来自 simulated-login）
 */
function saveOrgConfig(orgConfig) {
  try {
    let mdContent = '';
    if (fs.existsSync(ORG_CONFIG_FILE_MD)) {
      mdContent = fs.readFileSync(ORG_CONFIG_FILE_MD, 'utf-8');
    } else {
      mdContent = generateDefaultMarkdown();
    }

    mdContent = updateMarkdownTable(mdContent, '组织信息', {
      '组织名称': orgConfig.name || '',
      '域名前缀': orgConfig.domain_prefix || extractDomainPrefix(orgConfig.base_url) || '',
      '完整域名': orgConfig.base_url || '',
      'corpId': orgConfig.corp_id || '',
      'corp名称': orgConfig.corp_name || '',
    });

    mdContent = updateMarkdownTable(mdContent, '用户信息', {
      '用户ID': orgConfig.user_id || '',
      '用户名称': orgConfig.user_name || '',
      '用户角色': orgConfig.user_role || '',
      '是否为超级管理员': orgConfig.is_super_admin ? 'true' : 'false',
      '部门': orgConfig.department || '',
    });

    mdContent = mdContent.replace(
      /最后更新时间\s*\|\s*[^|]+\s*\|/,
      `最后更新时间 | ${new Date().toISOString()} |`
    );

    fs.writeFileSync(ORG_CONFIG_FILE_MD, mdContent);
    console.log('  ✅ 组织配置已保存到 组织及应用信息.md');
  } catch (e) {
    console.log('  ⚠️ 保存组织配置失败:', e.message);
  }
}

// ── 登录流程处理（来自 org-init，含 15 个 bug 修复）────

/**
 * 处理宜搭登录授权流程
 * 自动处理各种登录页面，在组织选择时等待用户手动操作
 *
 * 包含 org-init 的全部 15 个 bug 修复：
 *   - UTF-8 编码支持
 *   - Execution context was destroyed 处理
 *   - hasAgreementBtn 移到 page.evaluate 内部（防止 Node.js 崩溃）
 *   - 全局 try-catch
 *   - 实时状态反馈
 *   - 2秒轮询间隔
 *   - URL 检查防止误判登录成功
 *   - 排除 docs.aliwork.com
 *   - 最大步骤数 300（5-10分钟）
 *   - base_url 有效性验证
 *   - 双重保险组织信息获取
 *
 * @param {object} page - Playwright page 对象
 * @param {object} [config={}]
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function handleLoginFlow(page, config = {}) {
  console.log('  🔐 开始处理登录流程...');

  const maxSteps = 300; // 【org-init 修复】增加最大步骤数
  let step = 0;
  let lastPageState = null;
  let lastUrl = '';

  while (step < maxSteps) {
    step++;
    await page.waitForTimeout(2000); // 【org-init 修复】2秒间隔

    let currentUrl;
    let pageInfo;

    // 【org-init 修复】全局 try-catch，防止未捕获异常导致脚本崩溃
    try {
      currentUrl = page.url();
      pageInfo = await page.evaluate(() => {
        const bodyText = document.body?.innerText || '';
        const title = document.title || '';

        // 【org-init 修复】hasAgreementBtn 在 page.evaluate 内部获取，不在 Node.js 环境
        const hasQrCode = document.querySelector('.login-qr-code, .qrcode, [class*="qr"]') !== null;
        const hasAvatar = document.querySelector('.base-comp-avatar-pic') !== null;
        const hasLoginBtn = document.querySelector('.module-confirm-button') !== null;
        const hasOrgCards = document.querySelectorAll('[class*="org"], [class*="corp"]').length > 0;
        const orgCount = document.querySelectorAll('.org-card, [class*="OrgCard"], [class*="org-item"]').length;
        const hasAgreementBtn = document.querySelector('.module-agreement-button-co') !== null;

        return {
          title,
          bodyText: bodyText.substring(0, 500),
          hasQrCode, hasAvatar, hasLoginBtn, hasOrgCards, orgCount, hasAgreementBtn,
          url: window.location.href,
        };
      });
    } catch (e) {
      // 【org-init 修复】处理 Execution context was destroyed
      if (e.message.includes('Execution context was destroyed') || e.message.includes('contextDestroyed')) {
        await page.waitForTimeout(3000);

        // 【org-init 修复】页面跳转后重新检测状态
        try {
          currentUrl = page.url();
          if (!currentUrl.includes('www.aliwork.com') && currentUrl.includes('.aliwork.com')) {
            const bodyText = await page.evaluate(() => document.body?.innerText || '');
            const title = await page.evaluate(() => document.title || '');

            if (bodyText.includes('我的应用') || bodyText.includes('工作台') ||
                bodyText.includes('表单设计') || bodyText.includes('组件库') ||
                title.includes('工作台') || title.includes('我的应用')) {
              await page.waitForTimeout(3000);
              return { success: true, message: '登录成功' };
            }
          }
        } catch {
          // 重试失败
        }
        continue;
      }
      await page.waitForTimeout(3000);
      continue;
    }

    const bodyText = pageInfo.bodyText;
    let pageState = { type: 'unknown', message: '未知页面' };

    // 【org-init 修复】URL 检查防止将 www.aliwork.com 首页误判为已登录
    const isWwwHomepage = currentUrl.includes('//www.aliwork.com');
    // 【v1.1.0 修复】组织域名落地即视为已登录：新版 dashboard 页面不含"工作台/我的应用"
    // 等文案，纯文案判定会永远停在 unknown 循环（2026-08-18 登录挂起事故）
    let isOrgDomain = false;
    try {
      const u = new URL(currentUrl);
      isOrgDomain = u.hostname.endsWith('.aliwork.com') && u.hostname !== 'www.aliwork.com';
    } catch { /* 非法 URL 忽略 */ }
    if (isOrgDomain || (!isWwwHomepage && (
      bodyText.includes('表单设计') || bodyText.includes('组件库') ||
      bodyText.includes('我的应用') ||
      (bodyText.includes('工作台') && !bodyText.includes('宜搭工作台'))
    ))) {
      pageState = { type: 'logged-in', message: '已登录到宜搭工作台' };
    } else if (bodyText.includes('选择你加入的组织') || bodyText.includes('选择组织')) {
      pageState = { type: 'select-org', message: '组织选择页面', orgCount: pageInfo.orgCount };
    } else if (pageInfo.hasLoginBtn && bodyText.includes('立即登录')) {
      pageState = { type: 'login-button', message: '立即登录页面', hasQrCode: pageInfo.hasQrCode, hasAvatar: pageInfo.hasAvatar };
    } else if (pageInfo.hasQrCode || bodyText.includes('扫码登录')) {
      pageState = { type: 'qr-login', message: '二维码登录页面', hasAvatar: pageInfo.hasAvatar };
    } else if (bodyText.includes('确定') && pageInfo.hasAgreementBtn) {
      pageState = { type: 'agreement', message: '协议同意页面' };
    }

    const stateChanged = lastPageState !== pageState.type;
    if (stateChanged) {
      console.log(`  📍 步骤 ${step}/${maxSteps} | ${pageState.type} - ${pageState.message}`);
      console.log(`     URL: ${currentUrl}`);
      lastPageState = pageState.type;
    }
    lastUrl = currentUrl;

    switch (pageState.type) {
      case 'logged-in':
        await page.waitForTimeout(3000);
        return { success: true, message: '登录成功' };

      case 'select-org':
        console.log('  🏢 组织选择页面，等待用户操作...');
        break;

      case 'login-button':
        if (pageState.hasQrCode) {
          console.log('  📱 请使用钉钉扫码登录');
        } else if (pageState.hasAvatar) {
          console.log('  👤 请点击头像授权登录');
          try {
            await page.click('.base-comp-avatar-pic', { force: true, timeout: 5000 });
          } catch { /* 忽略 */ }
        } else {
          try {
            await page.click('.module-confirm-button', { force: true, timeout: 5000 });
          } catch { /* 忽略 */ }
        }
        break;

      case 'qr-login':
        if (pageState.hasAvatar) {
          try {
            await page.click('.base-comp-avatar-pic', { force: true, timeout: 5000 });
          } catch { /* 忽略 */ }
        } else {
          console.log('  📱 请使用钉钉扫码登录');
        }
        break;

      case 'agreement':
        try {
          await page.click('.module-agreement-button-co', { force: true, timeout: 5000 });
          console.log('  ✅ 已自动点击确定');
        } catch { /* 忽略 */ }
        break;
    }
  }

  return { success: false, message: '登录流程未完成' };
}

// ── 无头验证（来自 yida-api-client）────────────────────

/**
 * 无头验证 Cookie 有效性（来自 yida-api-client）
 * @param {Array} savedCookies
 * @param {string} savedBaseUrl
 * @returns {Promise<object|null>}
 */
async function tryHeadlessLogin(savedCookies, savedBaseUrl) {
  const verifyBase = savedBaseUrl || DEFAULT_BASE_URL;
  const verifyUrl = `${verifyBase.replace(/\/$/, '')}/myApp`;

  let browser;
  try {
    browser = await launchBrowserWithFallback(true);
    const context = await browser.newContext();
    await context.addCookies(savedCookies);
    const page = await context.newPage();

    const pageInfo = await fetchPageInfo(page, verifyUrl);

    if (pageInfo && pageInfo.csrfToken) {
      const cookies = await context.cookies();
      const finalBase = pageInfo.baseUrl || verifyBase;
      await browser.close();
      return {
        csrfToken: pageInfo.csrfToken,
        loginUser: pageInfo.loginUser,
        corpId: pageInfo.corpId,
        baseUrl: finalBase,
        cookies,
      };
    }

    // 尝试默认域名（来自 yida-api-client）
    if (savedBaseUrl && savedBaseUrl !== DEFAULT_BASE_URL) {
      const fallbackInfo = await fetchPageInfo(page, `${DEFAULT_BASE_URL}/myApp`);
      if (fallbackInfo && fallbackInfo.csrfToken) {
        const cookies = await context.cookies();
        await browser.close();
        return {
          csrfToken: fallbackInfo.csrfToken,
          loginUser: fallbackInfo.loginUser,
          corpId: fallbackInfo.corpId,
          baseUrl: fallbackInfo.baseUrl || DEFAULT_BASE_URL,
          cookies,
        };
      }
    }

    await browser.close();
    return null;
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* 忽略 */ }
    }
    return null;
  }
}

// ── 主接口（合并 3 份）────────────────────────────────

/**
 * 确保拥有有效的登录态
 * 合并 org-init 的 base_url 验证 + yida-api-client 的无头验证 + simulated-login 的组织配置保存
 *
 * @param {object} [options={}]
 * @param {boolean} [options.headless=false]
 * @param {string} [options.targetUrl]
 * @returns {Promise<object>} 登录态
 */
async function ensureLogin(options = {}) {
  const { headless = false, targetUrl = LOGIN_URL } = options;

  console.log('\n' + '='.repeat(50));
  console.log('  宜搭登录管理器（合并版）');
  console.log('='.repeat(50));

  // 1. 尝试加载现有 Cookie
  const existingData = loadCookieData();

  if (existingData?.cookies) {
    console.log(`  检测到本地 Cookie (${existingData.cookies.length} 个)`);

    // 【org-init 修复】验证 base_url 有效性
    const savedBaseUrl = existingData.base_url;
    if (!isValidOrgBaseUrl(savedBaseUrl)) {
      console.log('  ⚠️ 已保存的 base_url 无效，需要重新登录');
    } else {
      // 【yida-api-client】无头验证
      const result = await tryHeadlessLogin(existingData.cookies, savedBaseUrl);
      if (result) {
        console.log('  ✅ Cookie 有效，无需重新登录');
        const loginState = {
          cookies: result.cookies,
          base_url: result.baseUrl,
          csrf_token: result.csrfToken,
          corp_id: result.corpId,
          login_user: result.loginUser,
        };
        saveCookieData(loginState);
        return loginState;
      }
      console.log('  ⚠️ Cookie 已失效，需要重新登录');
    }
  } else {
    console.log('  未检测到本地 Cookie');
  }

  // 2. 需要重新登录
  console.log('\n🔐 开始交互式登录...');

  const browser = await launchBrowserWithFallback(headless);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await context.newPage();

  try {
    // 【org-init 修复】commit 模式导航 + DOM 等待
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const loginResult = await handleLoginFlow(page, { headless });

    if (!loginResult.success) {
      throw new Error('登录流程未完成');
    }

    // 获取 Cookie
    const cookies = await context.cookies();

    // 【org-init 修复】使用验证函数提取有效的 base_url
    let baseUrl = await extractValidBaseUrl(page);

    // 尝试访问 /myApp 再次提取
    if (!baseUrl) {
      try {
        await page.goto('https://www.aliwork.com/myApp', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        baseUrl = await extractValidBaseUrl(page);
      } catch { /* 忽略 */ }
    }

    if (!baseUrl) {
      throw new Error('无法获取有效的组织域名');
    }

    // 【yida-api-client】获取页面信息
    const pageInfo = await fetchPageInfo(page, `${baseUrl}/myApp`);

    const loginState = {
      cookies,
      base_url: baseUrl,
      csrf_token: pageInfo?.csrfToken || null,
      corp_id: pageInfo?.corpId || null,
      login_user: pageInfo?.loginUser || null,
    };

    saveCookieData(loginState);

    // 【simulated-login】保存组织配置
    saveOrgConfig({
      base_url: baseUrl,
      corp_id: pageInfo?.corpId || '',
      name: pageInfo?.loginUser?.corpName || '',
      corp_name: pageInfo?.loginUser?.corpName || '',
      user_id: pageInfo?.loginUser?.userId || '',
      user_name: pageInfo?.loginUser?.userName || '',
      user_role: pageInfo?.loginUser?.userRole || '',
      is_super_admin: pageInfo?.loginUser?.isSuperAdmin === 'y',
      department: pageInfo?.loginUser?.deptName || '',
      department_path: pageInfo?.loginUser?.deptName || '',
    });

    console.log('='.repeat(50));
    return loginState;
  } catch (error) {
    throw new CliError(ErrorCode.UNKNOWN, `登录失败: ${error.message}`, { cause: error });
  } finally {
    await browser.close();
  }
}

// ── 访问页面（带自动登录）（来自 simulated-login）──────

/**
 * 先尝试使用现有 Cookie 直接访问，失败则自动触发登录流程
 * @param {object} options
 * @returns {Promise<object>}
 */
async function accessWithLogin(options = {}) {
  const { targetUrl, headless = false, page: existingPage } = options;

  if (!targetUrl) {
    throw new CliError(ErrorCode.MISSING_PARAM, 'targetUrl 不能为空');
  }

  let browser;
  let page = existingPage;

  if (!page) {
    browser = await launchBrowserWithFallback(headless);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const existingData = loadCookieData();
    if (existingData?.cookies?.length > 0) {
      await context.addCookies(existingData.cookies);
    }

    page = await context.newPage();
  }

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    const currentUrl = page.url();

    const needsLogin = currentUrl.includes('login.dingtalk') ||
                       currentUrl.includes('/oauth2/') ||
                       currentUrl.includes('signin');

    if (!needsLogin) {
      const cookies = await page.context().cookies();
      const pageInfo = await fetchPageInfo(page, currentUrl);

      const loginState = {
        cookies,
        base_url: pageInfo?.baseUrl || currentUrl.replace(/\/admin.*$/, '').replace(/\/myApp.*$/, ''),
        csrf_token: pageInfo?.csrfToken,
        corp_id: pageInfo?.corpId,
        login_user: pageInfo?.loginUser,
      };

      saveCookieData(loginState);
      return { success: true, page, browser, loginState, usedExistingCookie: true };
    }

    // 需要登录
    const loginResult = await handleLoginFlow(page, { headless });
    if (!loginResult.success) {
      throw new Error('登录流程未完成');
    }

    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    const cookies = await page.context().cookies();
    const pageInfo = await fetchPageInfo(page, page.url());

    const loginState = {
      cookies,
      base_url: pageInfo?.baseUrl,
      csrf_token: pageInfo?.csrfToken,
      corp_id: pageInfo?.corpId,
      login_user: pageInfo?.loginUser,
    };

    saveCookieData(loginState);
    return { success: true, page, browser, loginState, usedExistingCookie: false };
  } catch (error) {
    if (browser && !existingPage) {
      await browser.close();
    }
    throw error;
  }
}

// ── 快速获取（来自 simulated-login）────────────────────

/**
 * 快速获取 Cookie（不验证，不触发登录）
 */
function getCookiesQuick() {
  return loadCookies();
}

/**
 * 获取完整的登录态信息（不验证，不触发登录）
 */
function getLoginStateQuick() {
  const cookieData = loadCookieData();
  const orgConfig = loadOrgConfig();

  if (cookieData || orgConfig) {
    return {
      ...cookieData,
      ...orgConfig,
      base_url: orgConfig?.base_url || cookieData?.base_url || DEFAULT_BASE_URL,
      corp_id: orgConfig?.corp_id || cookieData?.corp_id || null,
    };
  }

  return null;
}

// ── 导出 ───────────────────────────────────────────────

module.exports = {
  // 主要接口
  ensureLogin,
  accessWithLogin,
  handleLoginFlow,

  // Cookie 管理
  loadCookies,
  loadCookieData,
  saveCookieData,
  saveLoginState,
  cleanCookiesForStorage,

  // 组织配置管理
  loadOrgConfig,
  saveOrgConfig,
  extractDomainPrefix,
  extractValueFromMarkdown,
  extractAppsFromMarkdown,
  generateDefaultMarkdown,
  updateMarkdownTable,

  // 浏览器与页面
  launchBrowserWithFallback,
  fetchPageInfo,
  tryHeadlessLogin,
  extractValidBaseUrl,
  isValidOrgBaseUrl,

  // 快速获取
  getCookiesQuick,
  getLoginStateQuick,

  // 常量
  COOKIE_FILE,
  ORG_CONFIG_FILE_MD,
  ORG_CONFIG_FILE_JSON,
  DEFAULT_BASE_URL,
  LOGIN_URL,
};
