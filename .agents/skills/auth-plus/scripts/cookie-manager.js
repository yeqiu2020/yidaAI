/**
 * cookie-manager.js — Cookie 环境隔离管理
 *
 * 功能：
 *   ① Cookie 缓存按环境隔离（.cache/cookies-{env}.json）
 *   ② 环境切换时自动备份和恢复
 *   ③ 与 .cookies.json 主文件同步
 *   ④ Cookie 有效性快速检测
 *
 * 创建日期：2026-07-10 (Phase 2)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot, loadCookieData, resolveBaseUrl, extractInfoFromCookies } = require('../../../../lib/core/utils');

// ── 配置 ───────────────────────────────────────────────

const DEFAULT_ENV = process.env.YIDA_ENV || 'default';

/**
 * 获取环境对应的 Cookie 文件路径
 * @param {string} [env] - 环境名称
 * @returns {string}
 */
function getCookieFilePath(env) {
  const envName = env || DEFAULT_ENV;
  const root = findProjectRoot();
  const cacheDir = path.join(root, '.cache');

  // default 环境使用主文件 .cookies.json（兼容现有脚本）
  if (envName === 'default') {
    return path.join(root, '.cookies.json');
  }

  // 其他环境使用 .cache/cookies-{env}.json
  return path.join(cacheDir, `cookies-${envName}.json`);
}

/**
 * 获取所有已保存的环境列表
 * @returns {string[]}
 */
function listEnvironments() {
  const root = findProjectRoot();
  const cacheDir = path.join(root, '.cache');
  const envs = ['default']; // default 总是存在

  if (!fs.existsSync(cacheDir)) {
    return envs;
  }

  const files = fs.readdirSync(cacheDir);
  for (const file of files) {
    const match = file.match(/^cookies-(.+)\.json$/);
    if (match) {
      envs.push(match[1]);
    }
  }

  return envs;
}

/**
 * 保存 Cookie 数据到指定环境
 * @param {object} cookieData - Cookie 数据对象
 * @param {string} [env] - 环境名称
 */
function saveCookieData(cookieData, env) {
  const filePath = getCookieFilePath(env);
  const dir = path.dirname(filePath);

  // 确保目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dataToSave = {
    ...cookieData,
    updated_at: new Date().toISOString(),
    env: env || DEFAULT_ENV,
  };

  fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
  console.log(`  ✅ 登录态已保存到 ${path.relative(findProjectRoot(), filePath)}`);

  // 如果不是 default 环境，同步到主文件（方便旧脚本读取）
  if ((env || DEFAULT_ENV) !== 'default') {
    const mainFile = getCookieFilePath('default');
    fs.writeFileSync(mainFile, JSON.stringify(dataToSave, null, 2));
    console.log(`  ✅ 已同步到主文件 .cookies.json`);
  }
}

/**
 * 加载指定环境的 Cookie 数据
 * @param {string} [env] - 环境名称
 * @returns {object|null}
 */
function loadEnvCookieData(env) {
  const filePath = getCookieFilePath(env);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    let cookieData;

    if (Array.isArray(parsed)) {
      cookieData = { cookies: parsed };
    } else {
      cookieData = parsed;
    }

    if (cookieData.cookies && cookieData.cookies.length > 0) {
      const { csrfToken, corpId, userId } = extractInfoFromCookies(cookieData.cookies);
      if (csrfToken) cookieData.csrf_token = csrfToken;
      if (corpId) cookieData.corp_id = corpId;
      if (userId) cookieData.user_id = userId;
    }

    return cookieData;
  } catch {
    return null;
  }
}

/**
 * 切换到指定环境
 * @param {string} env - 目标环境名称
 * @returns {object|null} 切换后的 Cookie 数据
 */
function switchEnvironment(env) {
  const cookieData = loadEnvCookieData(env);

  if (!cookieData) {
    console.error(`  ❌ 环境 "${env}" 不存在或无有效 Cookie`);
    console.error(`  可用环境: ${listEnvironments().join(', ')}`);
    return null;
  }

  // 同步到主文件
  const mainFile = getCookieFilePath('default');
  const dir = path.dirname(mainFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(mainFile, JSON.stringify(cookieData, null, 2));

  console.log(`  ✅ 已切换到环境: ${env}`);
  console.log(`     Cookie 数量: ${cookieData.cookies?.length || 0}`);
  console.log(`     base_url: ${cookieData.base_url || '未设置'}`);

  // 设置环境变量
  process.env.YIDA_ENV = env;

  return cookieData;
}

/**
 * 删除指定环境的 Cookie
 * @param {string} env - 环境名称
 * @returns {boolean} 是否删除成功
 */
function deleteEnvironment(env) {
  if (env === 'default') {
    console.error('  ❌ 不能删除 default 环境');
    return false;
  }

  const filePath = getCookieFilePath(env);
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ 环境 "${env}" 不存在`);
    return false;
  }

  fs.unlinkSync(filePath);
  console.log(`  ✅ 已删除环境: ${env}`);
  return true;
}

/**
 * 快速检测 Cookie 有效性（不发请求，仅检查结构）
 * @param {object} cookieData
 * @returns {{ valid: boolean, reason: string }}
 */
function quickValidateCookies(cookieData) {
  if (!cookieData) {
    return { valid: false, reason: 'Cookie 数据为空' };
  }

  if (!cookieData.cookies || !Array.isArray(cookieData.cookies) || cookieData.cookies.length === 0) {
    return { valid: false, reason: 'Cookie 数组为空' };
  }

  // 检查是否有关键 Cookie
  const hasCsrfToken = cookieData.cookies.some(c => c.name === 'tianshu_csrf_token');
  if (!hasCsrfToken) {
    return { valid: false, reason: '缺少 tianshu_csrf_token' };
  }

  // 检查是否有 corp 相关 Cookie
  const hasCorpInfo = cookieData.cookies.some(c =>
    c.name === 'tianshu_corp_user' || c.name === 'corp_id'
  );
  if (!hasCorpInfo) {
    return { valid: false, reason: '缺少组织信息 Cookie' };
  }

  // 检查 Cookie 是否过期
  const now = Date.now();
  const expiredCookies = cookieData.cookies.filter(c => {
    if (c.expires && typeof c.expires === 'number' && c.expires > 0) {
      return c.expires * 1000 < now;
    }
    return false;
  });

  if (expiredCookies.length === cookieData.cookies.length) {
    return { valid: false, reason: '所有 Cookie 已过期' };
  }

  return { valid: true, reason: 'OK' };
}

module.exports = {
  getCookieFilePath,
  listEnvironments,
  saveCookieData,
  loadEnvCookieData,
  switchEnvironment,
  deleteEnvironment,
  quickValidateCookies,
  DEFAULT_ENV,
};
