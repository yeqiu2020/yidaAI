/**
 * lib/core/http.js — HTTP 请求封装（自建核心库）
 *
 * 封装 httpGet / httpPost / httpPostJson，内置：
 *   ① 自动 Cookie 加载和域匹配过滤
 *   ② 自动 CSRF Token 注入（从 Cookie 中提取 tianshu_csrf_token）
 *   ③ 登录过期检测 → 返回 CliError(LOGIN_EXPIRED)，不自动重登录（Phase 2 实现）
 *   ④ CSRF 过期检测 → 自动刷新重试（重新加载 Cookie 缓存）
 *   ⑤ 双重 reject 防护（hasRejected 标志）
 *   ⑥ 结构化错误码（CliError 类）
 *
 * 设计原则：
 *   - 核心函数返回 Promise，reject 时抛出 CliError
 *   - 不自行调用 process.exit()，由最外层 CLI 决定退出
 *   - Cookie/CSRF 自动加载可通过 options 覆盖
 *
 * 用法：
 *   const { httpGet, httpPost, httpPostJson } = require('./http');
 *
 *   // GET 请求（自动加载 Cookie 和 CSRF）
 *   const result = await httpGet('https://www.aliwork.com/some/path', { params: { page: 1 } });
 *
 *   // POST 请求
 *   const result = await httpPost('https://www.aliwork.com/some/path', { field1: 'value1' });
 *
 *   // JSON POST 请求
 *   const result = await httpPostJson('https://www.aliwork.com/some/path', { key: 'value' });
 *
 *   // 传入 options 覆盖自动行为
 *   const result = await httpGet(url, { cookies: customCookies, csrfToken: customToken });
 *
 * 创建日期：2026-07-10 (Phase 1)
 */

'use strict';

const https = require('https');
const http = require('http');
const querystring = require('querystring');
const { URL } = require('url');

const { loadCookieData, extractInfoFromCookies, resolveBaseUrl, isLoginExpired, isCsrfTokenExpired, findProjectRoot } = require('./utils');
const { CliError, ErrorCode } = require('./error');

// ── 内部工具函数 ───────────────────────────────────────

/**
 * 解析 URL，返回 URL 对象。
 * @param {string} url
 * @returns {URL}
 * @throws {CliError} URL 无效时抛出
 */
function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    throw new CliError(ErrorCode.INVALID_PARAM, `无效的 URL: ${url}`, {
      hint: '请检查 URL 格式，确保包含协议（http:// 或 https://）',
      context: { url },
    });
  }
}

/**
 * 按域名过滤 Cookie 列表。
 * 若 domain 匹配后为空（如 cookies 中 domain 字段缺失），fallback 到全量 cookies。
 * @param {Array} cookies - Cookie 列表
 * @param {string} requestHost - 请求目标主机名
 * @returns {Array}
 */
function filterCookiesByDomain(cookies, requestHost) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return [];
  }

  const filtered = cookies.filter((c) => {
    const cookieDomain = (c.domain || '').replace(/^\./, '');
    return requestHost === cookieDomain || requestHost.endsWith('.' + cookieDomain);
  });

  // fallback 到全量 cookies
  return filtered.length > 0 ? filtered : cookies;
}

/**
 * 从 Cookie 列表构建 Cookie 请求头。
 * @param {Array} cookies
 * @returns {string}
 */
function buildCookieHeader(cookies) {
  return (cookies || [])
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

/**
 * 从 Cookie 列表中提取 CSRF Token。
 * @param {Array} cookies
 * @returns {string}
 */
function extractCsrfToken(cookies) {
  const csrfCookie = (cookies || []).find((c) => c.name === 'tianshu_csrf_token');
  return csrfCookie ? csrfCookie.value : '';
}

/**
 * 自动加载认证数据（Cookie + CSRF + baseUrl）。
 * @param {object} [options] - 调用方传入的覆盖选项
 * @param {Array} [options.cookies] - 覆盖自动加载的 cookies
 * @param {string} [options.csrfToken] - 覆盖自动提取的 CSRF token
 * @param {string} [options.baseUrl] - 覆盖自动解析的 baseUrl
 * @param {string} [options.projectRoot] - 项目根目录
 * @returns {{ cookies: Array, csrfToken: string, baseUrl: string, cookieData: object|null }}
 * @throws {CliError} 无 Cookie 时抛出
 */
function loadAuth(options = {}) {
  // 如果调用方已提供 cookies，直接使用
  if (options.cookies && Array.isArray(options.cookies) && options.cookies.length > 0) {
    const csrfToken = options.csrfToken || extractCsrfToken(options.cookies);
    const baseUrl = options.baseUrl || resolveBaseUrl(null);
    return { cookies: options.cookies, csrfToken, baseUrl, cookieData: null };
  }

  // 自动加载 Cookie
  const projectRoot = options.projectRoot || findProjectRoot();
  const cookieData = loadCookieData(projectRoot);

  if (!cookieData || !cookieData.cookies || cookieData.cookies.length === 0) {
    throw new CliError(ErrorCode.NO_COOKIE, '未找到有效的登录态（Cookie）', {
      hint: '请先运行登录命令获取登录态',
      context: { projectRoot },
    });
  }

  const cookies = cookieData.cookies;
  const csrfToken = options.csrfToken || cookieData.csrf_token || extractCsrfToken(cookies);
  const baseUrl = options.baseUrl || resolveBaseUrl(cookieData);

  return { cookies, csrfToken, baseUrl, cookieData };
}

// ── 核心请求函数 ───────────────────────────────────────

/**
 * 发送 HTTP GET 请求。
 *
 * @param {string} url - 完整 URL 或路径（路径时需提供 options.baseUrl）
 * @param {object} [options]
 * @param {object} [options.params] - 查询参数
 * @param {Array} [options.cookies] - 覆盖自动加载的 cookies
 * @param {string} [options.csrfToken] - 覆盖自动提取的 CSRF token
 * @param {string} [options.baseUrl] - 覆盖自动解析的 baseUrl
 * @param {string} [options.projectRoot] - 项目根目录
 * @param {boolean} [options.silentStatus=false] - 是否静默 HTTP 状态码输出
 * @param {number} [options.timeout=30000] - 超时毫秒数
 * @param {boolean} [options.autoCsrfRefresh=true] - CSRF 过期时是否自动刷新重试
 * @returns {Promise<object>} 解析后的 JSON 响应
 * @throws {CliError} 请求失败时抛出
 */
function httpGet(url, options = {}) {
  return _doRequest('GET', url, null, options);
}

/**
 * 发送 HTTP POST 请求（application/x-www-form-urlencoded）。
 *
 * @param {string} url - 完整 URL 或路径
 * @param {object|string} [data] - POST 数据（对象会自动序列化）
 * @param {object} [options] - 同 httpGet options
 * @returns {Promise<object>}
 * @throws {CliError}
 */
function httpPost(url, data, options = {}) {
  const postData = typeof data === 'string' ? data : querystring.stringify(data || {});
  return _doRequest('POST', url, postData, options, 'application/x-www-form-urlencoded');
}

/**
 * 发送 HTTP POST 请求（application/json）。
 *
 * @param {string} url - 完整 URL 或路径
 * @param {object|string} [data] - POST 数据（对象会自动 JSON.stringify）
 * @param {object} [options] - 同 httpGet options
 * @returns {Promise<object>}
 * @throws {CliError}
 */
function httpPostJson(url, data, options = {}) {
  const postData = typeof data === 'string' ? data : JSON.stringify(data || {});
  return _doRequest('POST', url, postData, options, 'application/json');
}

// ── 内部实现 ───────────────────────────────────────────

/**
 * 核心请求实现。
 *
 * @param {string} method - 'GET' 或 'POST'
 * @param {string} url - URL 或路径
 * @param {string|null} postData - POST body（GET 时为 null）
 * @param {object} options - 选项
 * @param {string} [contentType] - POST Content-Type
 * @param {boolean} [isRetry=false] - 是否为 CSRF 刷新后的重试
 * @returns {Promise<object>}
 */
function _doRequest(method, url, postData, options, contentType, isRetry = false) {
  return new Promise((resolve, reject) => {
    let authData;
    let parsedUrl;
    let requestUrl;

    try {
      // 加载认证数据
      authData = loadAuth(options);

      // 解析 URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        requestUrl = url;
      } else {
        requestUrl = authData.baseUrl + url;
      }
      parsedUrl = parseUrl(requestUrl);
    } catch (err) {
      // loadAuth 或 parseUrl 抛出 CliError
      reject(err instanceof CliError ? err : new CliError(ErrorCode.UNKNOWN, err.message, { cause: err }));
      return;
    }

    const requestHost = parsedUrl.hostname;
    const effectiveCookies = filterCookiesByDomain(authData.cookies, requestHost);
    const cookieHeader = buildCookieHeader(effectiveCookies);
    const globalCsrfToken = authData.csrfToken || extractCsrfToken(effectiveCookies);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    // 构建请求路径
    let fullPath = parsedUrl.pathname;
    if (method === 'GET' && options.params) {
      const qs = querystring.stringify(options.params);
      fullPath += (parsedUrl.search ? parsedUrl.search + '&' : '?') + qs;
    } else if (parsedUrl.search) {
      fullPath += parsedUrl.search;
    }

    // 构建请求头
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Origin: parsedUrl.origin,
      Referer: parsedUrl.origin + '/',
      Cookie: cookieHeader,
      'x-requested-with': 'XMLHttpRequest',
      global_csrf_token: globalCsrfToken,
    };

    if (method === 'POST') {
      headers['Content-Type'] = contentType || 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(postData || '');
    }

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: fullPath,
      method: method,
      headers: headers,
      timeout: options.timeout || 30000,
    };

    const req = requestModule.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // 尝试解析 JSON
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          // 非 JSON 响应
          reject(new CliError(
            ErrorCode.HTTP_ERROR,
            `HTTP ${res.statusCode}: 响应不是有效的 JSON`,
            {
              detail: data.substring(0, 500),
              context: { statusCode: res.statusCode, url: requestUrl },
            }
          ));
          return;
        }

        // 登录过期检测
        if (isLoginExpired(parsed)) {
          reject(new CliError(
            ErrorCode.LOGIN_EXPIRED,
            '登录已过期，需要重新登录',
            {
              hint: '请运行登录命令重新扫码登录（Phase 2 将实现自动重登录）',
              context: { errorCode: parsed.errorCode, url: requestUrl },
            }
          ));
          return;
        }

        // CSRF 过期检测 → 自动刷新重试
        if (isCsrfTokenExpired(parsed)) {
          if (!isRetry && options.autoCsrfRefresh !== false) {
            // 重新加载 Cookie（刷新 CSRF）
            const refreshedOptions = { ...options };
            // 清除缓存的 cookies/csrfToken，强制重新加载
            delete refreshedOptions.cookies;
            delete refreshedOptions.csrfToken;
            _doRequest(method, url, postData, refreshedOptions, contentType, true)
              .then(resolve)
              .catch(reject);
            return;
          }
          reject(new CliError(
            ErrorCode.CSRF_EXPIRED,
            'CSRF Token 已过期，刷新后仍失败',
            {
              hint: '请重新登录获取新的 CSRF Token',
              context: { url: requestUrl },
            }
          ));
          return;
        }

        resolve(parsed);
      });
    });

    // 双重 reject 防护
    let hasRejected = false;

    req.on('timeout', () => {
      if (hasRejected) {return;}
      hasRejected = true;
      req.destroy();
      reject(new CliError(
        ErrorCode.REQUEST_TIMEOUT,
        `请求超时 (${options.timeout || 30000}ms)`,
        { context: { url: requestUrl, timeout: options.timeout || 30000 } }
      ));
    });

    req.on('error', (err) => {
      if (hasRejected) {return;}
      hasRejected = true;
      reject(new CliError(
        ErrorCode.REQUEST_ERROR,
        `请求失败: ${err.message}`,
        { detail: err.code || err.message, cause: err, context: { url: requestUrl } }
      ));
    });

    if (method === 'POST' && postData) {
      req.write(postData);
    }
    req.end();
  });
}

// ── 高级封装 ───────────────────────────────────────────

/**
 * 创建 HTTP 客户端实例，预设默认 options。
 *
 * @param {object} [defaultOptions] - 默认选项（同 httpGet options）
 * @returns {{ get: function, post: function, postJson: function }}
 */
function createHttpClient(defaultOptions = {}) {
  return {
    get(url, options = {}) {
      return httpGet(url, { ...defaultOptions, ...options });
    },
    post(url, data, options = {}) {
      return httpPost(url, data, { ...defaultOptions, ...options });
    },
    postJson(url, data, options = {}) {
      return httpPostJson(url, data, { ...defaultOptions, ...options });
    },
  };
}

// ── requestWithAutoLogin：自动恢复请求（Phase 2）────────

/**
 * 最大自动重试次数
 */
const MAX_AUTO_RETRY = 3;

/**
 * 检查是否为环境变量注入模式
 * @returns {boolean}
 */
function isEnvInjectMode() {
  return process.env.YIDA_AUTH_ENABLED === '1' ||
         process.env.YIDA_AUTH_ENABLED === 'true' ||
         !!process.env.YIDA_COOKIE_B64;
}

/**
 * 触发自动重登录
 *
 * 尝试调用 auth-plus 的登录策略重新获取登录态。
 * 在环境注入模式下不自动登录，直接返回错误。
 *
 * @param {object} [options] - 登录选项
 * @returns {Promise<object>} 新的登录态
 * @throws {CliError} 登录失败时抛出
 */
async function triggerAutoLogin(options = {}) {
  // 环境注入模式下不自动登录
  if (isEnvInjectMode()) {
    throw new CliError(
      ErrorCode.ENV_INJECT_AUTH_FAILED,
      '环境注入模式认证失败，不触发自动登录',
      {
        hint: '请检查 YIDA_COOKIE_B64 环境变量是否包含有效的 Cookie',
        context: { mode: 'env-inject' },
      }
    );
  }

  // 尝试加载 auth-plus 的 env-inject 模块获取环境注入登录态
  try {
    const envInject = require('../../.agents/candidates/auth-plus/scripts/env-inject-login');
    const envLoginState = envInject.getEnvInjectLoginState();
    if (envLoginState) {
      return envLoginState;
    }
  } catch {
    // auth-plus 不可用，继续尝试其他方式
  }

  // 尝试加载 lib/core/login-manager（Phase 2 合并版）
  try {
    const loginManager = require('./login-manager');
    if (typeof loginManager.ensureLogin === 'function') {
      const loginState = await loginManager.ensureLogin(options);
      return loginState;
    }
  } catch {
    // login-manager 不可用
  }

  // 尝试加载 auth-plus 的 CDP 登录
  try {
    const cdpLogin = require('../../.agents/candidates/auth-plus/scripts/cdp-login');
    if (typeof cdpLogin.cdpLogin === 'function') {
      const loginState = await cdpLogin.cdpLogin(options);
      return loginState;
    }
  } catch {
    // CDP 不可用
  }

  throw new CliError(
    ErrorCode.AUTO_LOGIN_EXHAUSTED,
    '所有自动登录策略均不可用',
    {
      hint: '请手动运行登录命令，或确保 auth-plus/login-manager 可用',
      context: { mode: isEnvInjectMode() ? 'env-inject' : 'normal' },
    }
  );
}

/**
 * 带自动恢复的 HTTP 请求
 *
 * 遇到以下情况时自动恢复并重试：
 *   ① CSRF 过期 → 刷新 Token → 重试（已在 _doRequest 中处理）
 *   ② 登录过期 → 触发 auth-plus 重登录 → 重试
 *   ③ 最大重试 MAX_AUTO_RETRY 次，超过后返回明确错误
 *   ④ 环境注入模式下登录失败返回 ENV_INJECT_AUTH_FAILED，不自动登录
 *
 * @param {string} method - 请求方法：'GET' / 'POST' / 'POST_JSON'
 * @param {string} url - 请求 URL 或路径
 * @param {object|string} [data] - POST 数据（仅 POST/POST_JSON）
 * @param {object} [options] - 请求选项（同 httpGet options）
 * @returns {Promise<object>} 解析后的 JSON 响应
 * @throws {CliError} 重试耗尽后抛出
 */
async function requestWithAutoLogin(method, url, data, options = {}) {
  let retryCount = 0;
  let lastError = null;

  // 获取请求函数
  let requestFn;
  let contentType;
  switch (method.toUpperCase()) {
    case 'GET':
      requestFn = () => httpGet(url, options);
      break;
    case 'POST':
      requestFn = () => httpPost(url, data, options);
      break;
    case 'POST_JSON':
    case 'POSTJSON':
    case 'POST-JSON':
      requestFn = () => httpPostJson(url, data, options);
      break;
    default:
      throw new CliError(ErrorCode.INVALID_PARAM, `不支持的请求方法: ${method}`);
  }

  while (retryCount < MAX_AUTO_RETRY) {
    try {
      const result = await requestFn();
      return result;
    } catch (err) {
      lastError = err instanceof CliError ? err : new CliError(ErrorCode.UNKNOWN, err.message, { cause: err });

      // CSRF 过期：_doRequest 已经处理了第一次刷新，如果到这里说明刷新后仍失败
      if (lastError.code === ErrorCode.CSRF_EXPIRED) {
        retryCount++;
        if (retryCount >= MAX_AUTO_RETRY) {
          break;
        }
        console.log(`  ⚠️ CSRF 过期，尝试重登录后重试 (${retryCount}/${MAX_AUTO_RETRY})...`);

        // 清除缓存的 cookies/csrfToken，强制重新加载
        delete options.cookies;
        delete options.csrfToken;

        try {
          await triggerAutoLogin(options);
        } catch (loginErr) {
          // 重登录失败，如果环境注入模式则直接返回
          if (loginErr.code === ErrorCode.ENV_INJECT_AUTH_FAILED) {
            throw loginErr;
          }
          // 其他情况继续重试
        }
        continue;
      }

      // 登录过期：触发自动重登录
      if (lastError.code === ErrorCode.LOGIN_EXPIRED) {
        retryCount++;
        if (retryCount >= MAX_AUTO_RETRY) {
          break;
        }

        console.log(`  ⚠️ 登录过期，触发自动重登录后重试 (${retryCount}/${MAX_AUTO_RETRY})...`);

        // 清除缓存的 cookies/csrfToken，强制重新加载
        delete options.cookies;
        delete options.csrfToken;

        try {
          const newLoginState = await triggerAutoLogin(options);
          // 如果重登录成功，使用新的 Cookie
          if (newLoginState && newLoginState.cookies) {
            options.cookies = newLoginState.cookies;
            options.csrfToken = newLoginState.csrf_token;
            if (newLoginState.base_url) {
              options.baseUrl = newLoginState.base_url;
            }
          }
        } catch (loginErr) {
          // 环境注入模式：不自动登录，直接返回错误
          if (loginErr.code === ErrorCode.ENV_INJECT_AUTH_FAILED) {
            throw loginErr;
          }
          // 其他登录失败：继续重试
          console.log(`  ⚠️ 自动重登录失败: ${loginErr.message}`);
        }
        continue;
      }

      // 非认证类错误，直接抛出
      throw lastError;
    }
  }

  // 重试耗尽
  throw new CliError(
    ErrorCode.AUTO_LOGIN_EXHAUSTED,
    `自动恢复重试 ${MAX_AUTO_RETRY} 次后仍失败`,
    {
      detail: lastError ? lastError.message : '未知错误',
      hint: '请手动运行登录命令获取新的登录态',
      context: {
        maxRetry: MAX_AUTO_RETRY,
        lastErrorCode: lastError?.code,
        url,
        method,
      },
    }
  );
}

/**
 * 带自动恢复的 HTTP GET 请求
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<object>}
 */
function autoGet(url, options = {}) {
  return requestWithAutoLogin('GET', url, null, options);
}

/**
 * 带自动恢复的 HTTP POST 请求
 * @param {string} url
 * @param {object|string} [data]
 * @param {object} [options]
 * @returns {Promise<object>}
 */
function autoPost(url, data, options = {}) {
  return requestWithAutoLogin('POST', url, data, options);
}

/**
 * 带自动恢复的 HTTP POST JSON 请求
 * @param {string} url
 * @param {object|string} [data]
 * @param {object} [options]
 * @returns {Promise<object>}
 */
function autoPostJson(url, data, options = {}) {
  return requestWithAutoLogin('POST_JSON', url, data, options);
}

module.exports = {
  httpGet,
  httpPost,
  httpPostJson,
  createHttpClient,
  // Phase 2: 带自动恢复的请求
  requestWithAutoLogin,
  autoGet,
  autoPost,
  autoPostJson,
  // 顶层导出常量，供外部直接读取
  MAX_AUTO_RETRY,
  // 导出内部工具供测试使用
  _internal: {
    parseUrl,
    filterCookiesByDomain,
    buildCookieHeader,
    extractCsrfToken,
    loadAuth,
    isEnvInjectMode,
    triggerAutoLogin,
    MAX_AUTO_RETRY,
  },
};
