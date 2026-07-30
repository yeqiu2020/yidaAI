/**
 * env-inject-login.js — 环境变量注入登录
 *
 * 从环境变量 YIDA_COOKIE_B64 读取 Base64 编码的 Cookie JSON，
 * 解码后作为登录态使用。适用于 CI/CD、容器环境、无头服务。
 *
 * 环境变量：
 *   YIDA_COOKIE_B64    - Base64编码的Cookie JSON（必需）
 *   YIDA_AUTH_ENABLED  - 是否启用环境变量注入模式（默认 0）
 *   YIDA_BASE_URL      - base_url 覆盖（可选）
 *   YIDA_ENV           - 环境名称（用于Cookie隔离）
 *
 * Cookie JSON 格式：
 *   { "cookies": [...], "base_url": "https://xxx.aliwork.com" }
 *   或直接 Cookie 数组 [...]
 *
 * 创建日期：2026-07-10 (Phase 2)
 */

'use strict';

const { resolveBaseUrl, extractInfoFromCookies } = require('../../../../lib/core/utils');
const { CliError, ErrorCode } = require('../../../../lib/core/error');
const cookieManager = require('./cookie-manager');

// ── 配置 ───────────────────────────────────────────────

/**
 * 检查环境变量注入模式是否启用
 * @returns {boolean}
 */
function isEnvInjectEnabled() {
  return process.env.YIDA_AUTH_ENABLED === '1' ||
         process.env.YIDA_AUTH_ENABLED === 'true' ||
         !!process.env.YIDA_COOKIE_B64;
}

/**
 * 从环境变量获取 Base64 编码的 Cookie 数据
 * @returns {string|null}
 */
function getCookieB64() {
  return process.env.YIDA_COOKIE_B64 || null;
}

// ── 核心逻辑 ───────────────────────────────────────────

/**
 * 解码 Base64 Cookie 数据
 * @param {string} b64Data - Base64 编码的字符串
 * @returns {object} 解码后的 Cookie 数据
 * @throws {CliError} 解码失败时抛出
 */
function decodeCookieB64(b64Data) {
  let decoded;
  try {
    // 支持 UTF-8 安全的 Base64 解码
    const buffer = Buffer.from(b64Data, 'base64');
    decoded = buffer.toString('utf-8');
  } catch (err) {
    throw new CliError(
      ErrorCode.INVALID_COOKIE,
      'YIDA_COOKIE_B64 Base64 解码失败',
      { detail: err.message, hint: '请确保使用标准 Base64 编码' }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (err) {
    throw new CliError(
      ErrorCode.INVALID_COOKIE,
      'YIDA_COOKIE_B64 解码后不是有效的 JSON',
      { detail: err.message, hint: '请确保 Base64 内容为有效的 Cookie JSON' }
    );
  }

  // 兼容两种格式：{ cookies: [...] } 或直接 [...]
  let cookieData;
  if (Array.isArray(parsed)) {
    cookieData = { cookies: parsed };
  } else if (parsed.cookies && Array.isArray(parsed.cookies)) {
    cookieData = parsed;
  } else {
    throw new CliError(
      ErrorCode.INVALID_COOKIE,
      'Cookie JSON 格式无效：缺少 cookies 数组',
      { hint: '格式应为 { "cookies": [...], "base_url": "..." } 或直接 [...]' }
    );
  }

  return cookieData;
}

/**
 * 环境变量注入登录主函数
 *
 * 从 YIDA_COOKIE_B64 环境变量读取并解码 Cookie，
 * 验证有效性后保存到本地。
 *
 * @param {object} [options] - 选项
 * @param {boolean} [options.save=true] - 是否保存到本地文件
 * @param {string} [options.env] - 环境名称
 * @returns {Promise<object>} 登录态
 * @throws {CliError} 注入失败时抛出
 */
async function envInjectLogin(options = {}) {
  const shouldSave = options.save !== false;
  const env = options.env || process.env.YIDA_ENV || cookieManager.DEFAULT_ENV;

  console.log('\n' + '='.repeat(50));
  console.log('  环境变量注入登录');
  console.log('='.repeat(50));

  // 1. 检查是否启用
  if (!isEnvInjectEnabled()) {
    throw new CliError(
      ErrorCode.NO_COOKIE,
      '环境变量注入模式未启用',
      {
        hint: '请设置 YIDA_AUTH_ENABLED=1 并提供 YIDA_COOKIE_B64',
        context: { YIDA_AUTH_ENABLED: process.env.YIDA_AUTH_ENABLED },
      }
    );
  }

  // 2. 获取 Base64 数据
  const b64Data = getCookieB64();
  if (!b64Data) {
    throw new CliError(
      ErrorCode.NO_COOKIE,
      'YIDA_COOKIE_B64 环境变量未设置',
      { hint: '请设置 YIDA_COOKIE_B64 为 Base64 编码的 Cookie JSON' }
    );
  }

  console.log(`  ✅ 检测到 YIDA_COOKIE_B64（长度: ${b64Data.length}）`);

  // 3. 解码
  const cookieData = decodeCookieB64(b64Data);
  console.log(`  ✅ Base64 解码成功，Cookie 数量: ${cookieData.cookies.length}`);

  // 4. 提取信息
  const { csrfToken, corpId, userId } = extractInfoFromCookies(cookieData.cookies);
  if (csrfToken) cookieData.csrf_token = csrfToken;
  if (corpId) cookieData.corp_id = corpId;
  if (userId) cookieData.user_id = userId;

  // 5. 解析 base_url（环境变量优先）
  cookieData.base_url = process.env.YIDA_BASE_URL ||
    cookieData.base_url ||
    resolveBaseUrl(cookieData);

  console.log(`  ✅ base_url: ${cookieData.base_url}`);
  if (corpId) console.log(`  ✅ corp_id: ${corpId}`);
  if (csrfToken) console.log(`  ✅ csrf_token: ${csrfToken.substring(0, 16)}...`);

  // 6. 快速验证
  const validation = cookieManager.quickValidateCookies(cookieData);
  if (!validation.valid) {
    console.log(`  ⚠️ Cookie 验证警告: ${validation.reason}`);
    console.log('  ⚠️ Cookie 可能无效，但仍然保存（环境注入模式不阻塞）');
  } else {
    console.log(`  ✅ Cookie 快速验证通过`);
  }

  // 7. 标记登录策略
  cookieData.login_strategy = 'env-inject';

  // 8. 保存到本地
  if (shouldSave) {
    cookieManager.saveCookieData(cookieData, env);
  }

  console.log('\n' + '='.repeat(50));
  console.log('  ✅ 环境变量注入登录完成');
  console.log('='.repeat(50));

  return cookieData;
}

/**
 * 获取环境注入模式的登录态（不保存，仅返回）
 * 供 requestWithAutoLogin 使用
 *
 * @returns {object|null} 登录态或 null
 */
function getEnvInjectLoginState() {
  if (!isEnvInjectEnabled()) {
    return null;
  }

  const b64Data = getCookieB64();
  if (!b64Data) {
    return null;
  }

  try {
    const cookieData = decodeCookieB64(b64Data);
    const { csrfToken, corpId, userId } = extractInfoFromCookies(cookieData.cookies);
    if (csrfToken) cookieData.csrf_token = csrfToken;
    if (corpId) cookieData.corp_id = corpId;
    if (userId) cookieData.user_id = userId;
    cookieData.base_url = process.env.YIDA_BASE_URL ||
      cookieData.base_url ||
      resolveBaseUrl(cookieData);
    cookieData.login_strategy = 'env-inject';
    return cookieData;
  } catch {
    return null;
  }
}

// ── CLI 入口 ───────────────────────────────────────────

if (require.main === module) {
  envInjectLogin().catch(err => {
    console.error('\n❌', err.message || err);
    if (err.hint) console.error('  💡', err.hint);
    process.exit(1);
  });
}

module.exports = {
  envInjectLogin,
  isEnvInjectEnabled,
  getEnvInjectLoginState,
  decodeCookieB64,
};
