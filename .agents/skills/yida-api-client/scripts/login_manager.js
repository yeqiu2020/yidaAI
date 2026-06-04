#!/usr/bin/env node
/**
 * login_manager.js - 宜搭平台登录态管理模块 (Node.js版本)
 * 版本: 1.0.0
 * 创建日期: 2026-03-25
 * 
 * 功能: 管理宜搭平台的登录态，支持Cookie持久化和自动验证
 * 替代原 Python 版本的 login_manager.py
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ==================== 配置 ====================

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const CONFIG_FILE = path.join(PROJECT_ROOT, '.agents', 'skills', 'yida-api-client', 'config', 'default.json');
const COOKIE_FILE = path.join(PROJECT_ROOT, '.cookies.json');

// 默认配置
const DEFAULT_CONFIG = {
  loginUrl: 'https://www.aliwork.com/workPlatform',
  defaultBaseUrl: 'https://www.aliwork.com'
};

async function launchBrowserWithFallback(headless = true) {
  const candidates = [
    { name: 'playwright-chromium', options: { headless } },
    { name: 'msedge', options: { headless, channel: 'msedge' } },
    { name: 'chrome', options: { headless, channel: 'chrome' } }
  ];

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const browser = await chromium.launch(candidate.options);
      console.error(`  ✅ 使用浏览器引擎: ${candidate.name}`);
      return browser;
    } catch (e) {
      lastError = e;
      console.error(`  ⚠️  启动 ${candidate.name} 失败: ${e.message}`);
    }
  }

  throw lastError || new Error('无法启动可用浏览器');
}

// ==================== 配置读取 ====================

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    } catch (e) {
      console.error(`  ⚠️  读取配置失败: ${e.message}`);
    }
  }
  return DEFAULT_CONFIG;
}

const config = loadConfig();
const LOGIN_URL = config.loginUrl || DEFAULT_CONFIG.loginUrl;
const DEFAULT_BASE_URL = config.defaultBaseUrl || DEFAULT_CONFIG.defaultBaseUrl;

// ==================== Cookie 管理 ====================

function saveLoginCache(cookies, baseUrl = null, csrfToken = null, corpId = null, loginUser = null) {
  const cache = {
    cookies,
    base_url: baseUrl,
    csrf_token: csrfToken,
    corp_id: corpId,
    login_user: loginUser
  };
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  console.error(`  ✅ 登录态已保存到 ${COOKIE_FILE}`);
}

function loadLoginCache() {
  if (!fs.existsSync(COOKIE_FILE)) {
    return null;
  }
  try {
    const content = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
    if (!content) return null;
    const data = JSON.parse(content);
    // 兼容旧格式（纯Cookie数组）
    if (Array.isArray(data)) {
      return { cookies: data, base_url: null, csrf_token: null };
    }
    return data;
  } catch (e) {
    console.error(`  ⚠️  读取缓存失败: ${e.message}`);
    return null;
  }
}

// ==================== 页面信息提取 ====================

async function fetchPageInfo(page, targetUrl) {
  console.error(`  📄 正在获取页面信息: ${targetUrl}`);
  
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    console.error(`  ⚠️  页面加载超时: ${e.message}`);
  }
  
  // 检查是否被重定向到登录页
  const currentUrl = page.url();
  if (currentUrl.toLowerCase().includes('login') || currentUrl.toLowerCase().includes('sign')) {
    console.error('  ❌ 被重定向到登录页，Cookie无效');
    return null;
  }
  
  // 提取 csrf_token
  let csrfToken = null;
  for (let i = 0; i < 10; i++) {
    try {
      csrfToken = await page.evaluate(() => {
        const input = document.querySelector("input[name='_csrf_token']");
        return input ? input.value : null;
      });
      if (csrfToken) break;
    } catch (e) {
      // ignore
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  if (csrfToken) {
    console.error(`  ✅ csrf_token: ${csrfToken.substring(0, 20)}...`);
  } else {
    console.error('  ⚠️  未获取到 csrf_token');
  }
  
  // 提取 loginUser
  let loginUser = null;
  try {
    loginUser = await page.evaluate(() => window.loginUser || null);
  } catch (e) {
    // ignore
  }
  
  if (loginUser) {
    console.error(`  ✅ loginUser: ${loginUser.userName || '?'}`);
  }
  
  // 提取 corpId
  let corpId = null;
  try {
    corpId = await page.evaluate(() => {
      return window.pageConfig && window.pageConfig.corpId 
        ? window.pageConfig.corpId 
        : null;
    });
  } catch (e) {
    // ignore
  }
  
  if (corpId) {
    console.error(`  ✅ corpId: ${corpId}`);
  }
  
  // 提取 base_url
  const parsed = new URL(page.url());
  const baseUrl = parsed.origin || null;
  
  if (baseUrl) {
    console.error(`  ✅ base_url: ${baseUrl}`);
  }
  
  return { csrfToken, loginUser, corpId, baseUrl };
}

// ==================== 登录验证 ====================

async function tryHeadlessLogin(savedCookies, savedBaseUrl) {
  const verifyBase = savedBaseUrl || DEFAULT_BASE_URL;
  const verifyUrl = `${verifyBase.replace(/\/$/, '')}/myApp`;
  let browser = null;
  let context = null;
  let page = null;

  try {
    browser = await launchBrowserWithFallback(true);
    context = await browser.newContext();
    await context.addCookies(savedCookies);
    page = await context.newPage();
  } catch (e) {
    console.error(`  ⚠️  无头验证启动失败，将转为扫码登录: ${e.message}`);
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    return null;
  }
  
  const pageInfo = await fetchPageInfo(page, verifyUrl);
  
  if (pageInfo && pageInfo.csrfToken) {
    console.error('  ✅ Cookie验证成功');
    const cookies = await context.cookies();
    const finalBase = pageInfo.baseUrl || verifyBase;
    await browser.close();
    return { 
      csrfToken: pageInfo.csrfToken, 
      loginUser: pageInfo.loginUser, 
      corpId: pageInfo.corpId, 
      baseUrl: finalBase, 
      cookies 
    };
  }
  
  // 尝试默认域名
  if (savedBaseUrl && savedBaseUrl !== DEFAULT_BASE_URL) {
    console.error('  🔄 尝试默认域名...');
    const fallbackUrl = `${DEFAULT_BASE_URL}/myApp`;
    const fallbackInfo = await fetchPageInfo(page, fallbackUrl);
    
    if (fallbackInfo && fallbackInfo.csrfToken) {
      console.error('  ✅ Cookie验证成功（默认域名）');
      const cookies = await context.cookies();
      const finalBase = fallbackInfo.baseUrl || DEFAULT_BASE_URL;
      await browser.close();
      return { 
        csrfToken: fallbackInfo.csrfToken, 
        loginUser: fallbackInfo.loginUser, 
        corpId: fallbackInfo.corpId, 
        baseUrl: finalBase, 
        cookies 
      };
    }
  }
  
  console.error('  ❌ Cookie已失效');
  await browser.close();
  return null;
}

async function interactiveLogin() {
  console.error('\n🔐 请扫码登录宜搭平台...');
  console.error(`  登录地址: ${LOGIN_URL}`);
  
  const browser = await launchBrowserWithFallback(false);
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(LOGIN_URL, { timeout: 120000 });
  
  console.error('  等待登录完成（最长10分钟）...');
  try {
    await page.waitForURL('**/workPlatform**', { timeout: 600000 });
  } catch (e) {
    console.error('  ⏰ 登录超时');
    await browser.close();
    process.exit(1);
  }
  
  await page.waitForLoadState('networkidle');
  console.error('  ✅ 登录成功');
  
  // 获取实际域名
  const parsed = new URL(page.url());
  const postLoginBase = parsed.origin;
  const myAppUrl = `${postLoginBase}/myApp`;
  
  // 获取页面信息
  const pageInfo = await fetchPageInfo(page, myAppUrl);
  
  // 保存Cookie
  const cookies = await context.cookies();
  const finalBase = pageInfo ? (pageInfo.baseUrl || postLoginBase) : postLoginBase;
  
  await browser.close();
  
  if (!pageInfo || !pageInfo.csrfToken) {
    console.error('  ❌ 登录成功但无法获取csrf_token');
    process.exit(1);
  }
  
  return { 
    csrfToken: pageInfo.csrfToken, 
    loginUser: pageInfo.loginUser, 
    corpId: pageInfo.corpId, 
    baseUrl: finalBase, 
    cookies 
  };
}

// ==================== 主入口 ====================

async function ensureLogin() {
  const cache = loadLoginCache();
  
  if (cache && cache.cookies) {
    console.error('🔍 检测到本地Cookie，尝试验证...');
    const result = await tryHeadlessLogin(cache.cookies, cache.base_url);
    if (result) {
      saveLoginCache(result.cookies, result.baseUrl, result.csrfToken, result.corpId, result.loginUser);
      return {
        csrf_token: result.csrfToken,
        corp_id: result.corpId,
        base_url: result.baseUrl,
        cookies: result.cookies,
        login_user: result.loginUser
      };
    }
  }
  
  // 需要重新登录
  const result = await interactiveLogin();
  saveLoginCache(result.cookies, result.baseUrl, result.csrfToken, result.corpId, result.loginUser);
  
  return {
    csrf_token: result.csrfToken,
    corp_id: result.corpId,
    base_url: result.baseUrl,
    cookies: result.cookies,
    login_user: result.loginUser
  };
}

async function main() {
  console.error('==================================================');
  console.error('  宜搭登录态管理工具 (Node.js版本)');
  console.error('==================================================');
  
  const result = await ensureLogin();
  
  console.error('\n==================================================');
  console.error('  ✅ 登录成功');
  console.error(`  用户: ${result.login_user ? result.login_user.userName : '?'}`);
  console.error(`  corpId: ${result.corp_id}`);
  console.error(`  baseUrl: ${result.base_url}`);
  console.error('==================================================');
  
  // 输出JSON结果到stdout
  console.log(JSON.stringify(result, null, 2));
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(e => {
    console.error(`错误: ${e.message}`);
    process.exit(1);
  });
}

// 导出供其他模块使用
module.exports = {
  ensureLogin,
  loadLoginCache,
  saveLoginCache
};
