/**
 * lib/cli/login.js — yida-helper login / logout 命令实现
 *
 * login: 复用 auth-plus 多策略登录，凭据写入全局 cookieFile()
 * logout: 删除全局 Cookie
 *
 * 创建日期：2026-08-17 (阶段三)
 * 版本：1.1.0 — 登录后强制校验+失败回滚+全局权威同步；策略分发走 runLogin
 */

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../core/paths');

// ── login 命令 ─────────────────────────────────────────

/**
 * login 命令
 * @param {string[]} args - 命令行参数
 */
async function cmdLogin(args) {
  // 解析参数
  let strategy = 'auto';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--method' && args[i + 1]) {
      strategy = args[i + 1];
      i++;
    } else if (args[i].startsWith('--')) {
      strategy = args[i].replace('--', '');
    }
  }

  console.log('');
  console.log('  🔐 宜搭登录');
  console.log(`  📋 策略: ${strategy}`);
  console.log('');

  // 动态加载 auth-plus（避免冷启动加载 playwright）
  let authPlus;
  try {
    authPlus = require('../../.agents/skills/auth-plus/scripts/index');
  } catch {
    // 在 npm 全局安装后路径不同，尝试包内 skills
    try {
      authPlus = require(path.join(paths.skillsSource(), 'auth-plus', 'scripts', 'index.js'));
    } catch (err2) {
      console.error('  ❌ 无法加载 auth-plus 登录模块');
      console.error(`     ${err2.message}`);
      process.exit(1);
    }
  }

  try {
    let loginState;

    loginState = await authPlus.runLogin(strategy);

    if (!loginState) {
      console.log('  ❌ 登录失败');
      process.exit(1);
    }

    // 【v1.1.0】保存后强制校验：防止未认证 Cookie 落盘（2026-08-18 假登录事故）
    // quickValidateCookies 要求 tianshu_csrf_token + 组织 Cookie，未认证的 SSO 落地页 Cookie 无法通过
    let cookieManager;
    try {
      cookieManager = require('../../.agents/skills/auth-plus/scripts/cookie-manager');
    } catch {
      cookieManager = require(path.join(paths.skillsSource(), 'auth-plus', 'scripts', 'cookie-manager.js'));
    }
    const validation = cookieManager.quickValidateCookies(loginState);

    if (!validation.valid) {
      // 校验失败：回滚本次策略可能已写入的 Cookie 文件，不留脏数据
      rollbackCookieFiles();
      console.error(`  ❌ 登录结果校验未通过: ${validation.reason}`);
      console.error('  💡 未认证的 Cookie 已回滚，不会保存。请重试或使用浏览器扫码登录。');
      process.exit(1);
    }

    // 权威同步到全局（浏览器策略默认只写项目根，此处统一落盘全局，保证切目录免重登）
    const globalFile = paths.cookieFile();
    fs.mkdirSync(path.dirname(globalFile), { recursive: true });
    fs.writeFileSync(globalFile, JSON.stringify({
      cookies: loginState.cookies,
      base_url: loginState.base_url,
      csrf_token: loginState.csrf_token,
      corp_id: loginState.corp_id,
      login_user: loginState.login_user,
      login_strategy: loginState.login_strategy || strategy,
      updated_at: new Date().toISOString(),
    }, null, 2), 'utf-8');

    console.log('');
    console.log('  ✅ 登录成功！');
    console.log(`     策略: ${loginState.login_strategy || strategy}`);
    console.log(`     base_url: ${loginState.base_url || '未知'}`);
    console.log(`     Cookie 数量: ${loginState.cookies?.length || 0}`);
    console.log(`     保存位置: ${globalFile}`);
    console.log('');
    console.log('  💡 Cookie 已全局保存，切换工作目录无需重登。');
    console.log('');
  } catch (err) {
    console.error(`  ❌ 登录失败: ${err.message || err}`);
    if (err.hint) {
      console.error(`  💡 ${err.hint}`);
    }
    process.exit(1);
  }
}

/**
 * 回滚本次登录可能写入的 Cookie 文件（校验失败时调用）
 * 仅删除全局 + 项目根的 .cookies.json，不触碰其他文件
 */
function rollbackCookieFiles() {
  try {
    const { findProjectRoot } = require('../core/utils');
    const candidates = [
      paths.cookieFile(),
      path.join(process.cwd(), '.cookies.json'),
      path.join(findProjectRoot(), '.cookies.json'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`  🧹 已回滚: ${file}`);
      }
    }
  } catch {
    // 回滚尽力而为，不阻塞错误报告
  }
}

// ── logout 命令 ────────────────────────────────────────

/**
 * logout 命令：删除全局 Cookie
 */
function cmdLogout() {
  const cookieFile = paths.cookieFile();
  const projectCookie = path.join(process.cwd(), '.cookies.json');

  console.log('');
  console.log('  🚪 退出登录');
  console.log('');

  let deleted = false;

  // 1. 删除全局 Cookie
  if (fs.existsSync(cookieFile)) {
    fs.unlinkSync(cookieFile);
    console.log(`  ✅ 已删除全局 Cookie: ${cookieFile}`);
    deleted = true;
  }

  // 2. 删除项目根 Cookie（兼容回退）
  if (fs.existsSync(projectCookie)) {
    fs.unlinkSync(projectCookie);
    console.log(`  ✅ 已删除项目 Cookie: ${projectCookie}`);
    deleted = true;
  }

  // 3. 删除旧格式 .cache/cookies.json
  const legacyCookie = path.join(process.cwd(), '.cache', 'cookies.json');
  if (fs.existsSync(legacyCookie)) {
    fs.unlinkSync(legacyCookie);
    console.log(`  ✅ 已删除旧格式 Cookie: ${legacyCookie}`);
    deleted = true;
  }

  if (!deleted) {
    console.log('  ℹ️  未找到 Cookie 文件，无需退出。');
  }

  console.log('');
}

module.exports = { cmdLogin, cmdLogout };
