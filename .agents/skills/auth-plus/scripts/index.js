/**
 * index.js — auth-plus 通用入口
 *
 * 自动选择最优登录策略：
 *   1. 环境变量注入（YIDA_COOKIE_B64 存在时）
 *   2. CDP 浏览器登录（本地 Chrome/Edge 调试端口可用时）
 *   3. 终端二维码登录
 *   4. Playwright 降级登录（可选）
 *
 * 用法：
 *   node index.js              # 自动选择策略
 *   node index.js --cdp        # 强制 CDP 登录
 *   node index.js --env-inject # 强制环境变量注入
 *   node index.js --qr         # 强制二维码登录
 *   node index.js --playwright # 强制 Playwright 登录（降级）
 *   node index.js --list-envs  # 列出所有环境
 *   node index.js --switch ENV # 切换环境
 *
 * 创建日期：2026-07-10 (Phase 2)
 */

'use strict';

const { CliError, ErrorCode } = require('../../../../lib/core/error');
const { loadCookieData, findProjectRoot, isLoginExpired } = require('../../../../lib/core/utils');
const envInject = require('./env-inject-login');
const cdpLogin = require('./cdp-login');
const qrLogin = require('./qr-login');
const cookieManager = require('./cookie-manager');
const orgSwitch = require('./org-switch');

// ── 策略选择 ───────────────────────────────────────────

/**
 * 检测现有登录态是否有效
 * @returns {object|null} 有效的登录态或 null
 */
function checkExistingLogin() {
  const cookieData = loadCookieData(findProjectRoot());

  if (!cookieData || !cookieData.cookies || cookieData.cookies.length === 0) {
    return null;
  }

  // 快速验证
  const validation = cookieManager.quickValidateCookies(cookieData);
  if (!validation.valid) {
    console.log(`  ⚠️ 现有 Cookie 无效: ${validation.reason}`);
    return null;
  }

  return cookieData;
}

/**
 * 自动选择登录策略
 * @returns {Promise<object>} 登录态
 */
async function autoSelectStrategy() {
  // 0. 先检查现有登录态
  const existing = checkExistingLogin();
  if (existing) {
    console.log('  ✅ 现有登录态有效，无需重新登录');
    return existing;
  }

  // 1. 环境变量注入
  if (envInject.isEnvInjectEnabled()) {
    console.log('  📋 检测到环境变量注入模式，使用 env-inject 策略');
    try {
      return await envInject.envInjectLogin();
    } catch (err) {
      console.log(`  ⚠️ 环境变量注入失败: ${err.message}`);
      console.log('  🔄 降级到下一策略...');
    }
  }

  // 2. CDP 浏览器登录
  try {
    const available = await cdpLogin.isCDPAvailable();
    if (available) {
      console.log('  📋 检测到 CDP 调试端口可用，使用 CDP 策略');
      return await cdpLogin.cdpLogin();
    }
  } catch (err) {
    console.log(`  ⚠️ CDP 检测失败: ${err.message}`);
  }

  // 3. 终端二维码登录
  console.log('  📋 使用终端二维码登录策略');
  try {
    return await qrLogin.qrLogin();
  } catch (err) {
    console.log(`  ⚠️ 二维码登录失败: ${err.message}`);
  }

  // 4. Playwright 降级
  console.log('  📋 所有轻量策略均失败，降级到 Playwright 登录');
  return await playwrightFallback();
}

/**
 * Playwright 降级登录
 * 使用 lib/core/login-manager.js（Phase 2 合并版）
 */
async function playwrightFallback() {
  try {
    const loginManager = require('../../../../lib/core/login-manager');
    if (typeof loginManager.ensureLogin === 'function') {
      return await loginManager.ensureLogin({ headless: false });
    }
  } catch (err) {
    // login-manager 可能依赖 playwright，如果不可用则报错
  }

  throw new CliError(
    ErrorCode.UNKNOWN,
    '所有登录策略均失败，且 Playwright 降级不可用',
    {
      hint: '请选择以下方式之一：\n' +
            '  1. 设置 YIDA_COOKIE_B64 环境变量\n' +
            '  2. 以调试模式启动 Chrome: chrome.exe --remote-debugging-port=9222\n' +
            '  3. 安装 Playwright: npm install playwright && npx playwright install chromium',
    }
  );
}

// ── 主函数 ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const forceStrategy = args.find(a => a.startsWith('--'));
  const strategy = forceStrategy ? forceStrategy.replace('--', '') : process.env.YIDA_LOGIN_STRATEGY || 'auto';

  console.log('\n' + '='.repeat(50));
  console.log('  auth-plus 多策略登录');
  console.log('='.repeat(50));

  // 处理非登录命令
  if (strategy === 'list-envs') {
    orgSwitch.listOrgEnvironments().forEach(env => {
      const current = env.env === (process.env.YIDA_ENV || 'default') ? ' ← 当前' : '';
      console.log(`  ${env.env.padEnd(15)} | ${(env.corpName || '?').padEnd(15)} | ${(env.baseUrl || '?').padEnd(35)} | ${env.cookieCount} cookies${current}`);
    });
    return;
  }

  if (strategy === 'switch') {
    const envName = args[args.indexOf('--switch') + 1];
    if (!envName) {
      console.error('  ❌ 请指定环境名称: node index.js --switch <env>');
      process.exit(1);
    }
    orgSwitch.switchOrg(envName);
    return;
  }

  // 选择登录策略
  let loginState;

  switch (strategy) {
    case 'auto':
      loginState = await autoSelectStrategy();
      break;

    case 'env-inject':
    case 'env':
      loginState = await envInject.envInjectLogin();
      break;

    case 'cdp':
      loginState = await cdpLogin.cdpLogin();
      break;

    case 'qr':
      loginState = await qrLogin.qrLogin();
      break;

    case 'playwright':
      loginState = await playwrightFallback();
      break;

    default:
      console.error(`  ❌ 未知策略: ${strategy}`);
      console.error('  可用策略: auto, env-inject, cdp, qr, playwright');
      process.exit(1);
  }

  if (loginState) {
    console.log('\n' + '='.repeat(50));
    console.log('  ✅ 登录成功');
    console.log(`     策略: ${loginState.login_strategy || strategy}`);
    console.log(`     base_url: ${loginState.base_url || '未知'}`);
    console.log(`     Cookie 数量: ${loginState.cookies?.length || 0}`);
    console.log('='.repeat(50));
  }
}

// ── 导出 ───────────────────────────────────────────────

module.exports = {
  autoSelectStrategy,
  checkExistingLogin,
  playwrightFallback,
};

// ── CLI 入口 ───────────────────────────────────────────

if (require.main === module) {
  main().catch(err => {
    console.error('\n❌', err.message || err);
    if (err.hint) console.error('  💡', err.hint);
    process.exit(1);
  });
}
