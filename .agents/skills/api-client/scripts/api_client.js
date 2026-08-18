/**
 * api_client.js - 宜搭API客户端核心
 * 版本: 1.0.0
 * 创建日期: 2026-03-11
 * 
 * 功能: 封装宜搭HTTP API调用，支持Cookie管理和自动重试
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { execSync } = require("child_process");

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require("../../../../lib/core/utils");

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
// 阶段二改造：Cookie 优先全局，兼容项目根
const os = require("os");
const GLOBAL_COOKIE_FILE = path.join(os.homedir(), ".yida-ai-helper", ".cookies.json");
const COOKIE_FILE = fs.existsSync(GLOBAL_COOKIE_FILE) ? GLOBAL_COOKIE_FILE : path.join(PROJECT_ROOT, ".cookies.json");
const LOGIN_SCRIPT = path.join(__dirname, "login_manager.js");
const CONFIG_FILE = path.join(__dirname, "..", "config", "default.json");

// 默认配置
const DEFAULT_CONFIG = {
  defaultBaseUrl: "https://www.aliwork.com",
  timeout: { request: 30000 }
};

// ==================== 配置读取 ====================

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return { ...DEFAULT_CONFIG, ...config };
    } catch (e) {
      console.error(`  ⚠️  读取配置失败: ${e.message}`);
    }
  }
  return DEFAULT_CONFIG;
}

const CONFIG = loadConfig();

// ==================== Cookie 管理 ====================
// Phase 6: loadCookieData 委托给 lib/core/utils.loadCookieData（统一实现）
// 保留本函数签名以兼容现有调用方（不接受参数），内部转发到公共库

function loadCookieData() {
  return coreUtils.loadCookieData(PROJECT_ROOT, CONFIG.defaultBaseUrl);
}

function triggerLogin() {
  console.error("\n🔐 登录态失效，正在重新登录...\n");
  if (!fs.existsSync(LOGIN_SCRIPT)) {
    throw new Error(`登录脚本不存在: ${LOGIN_SCRIPT}`);
  }
  
  const stdout = execSync(`node "${LOGIN_SCRIPT}"`, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "inherit"],
    timeout: 180_000,
  });
  
  try {
    const result = JSON.parse(stdout);
    if (!result.cookies) throw new Error("登录结果缺少cookies");
    return result;
  } catch (e) {
    const lines = stdout.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const partial = lines.slice(i).join("\n");
        const result = JSON.parse(partial);
        if (!result.cookies) throw new Error("登录结果缺少cookies");
        return result;
      } catch (e2) {
        continue;
      }
    }
    throw new Error(`解析登录结果失败: ${e.message}`);
  }
}

// Phase 6: resolveBaseUrl 委托给 lib/core/utils.resolveBaseUrl（统一实现）
function resolveBaseUrl(cookieData) {
  return coreUtils.resolveBaseUrl(cookieData, CONFIG.defaultBaseUrl);
}

function resolveCorpId(cookieData) {
  if (cookieData?.corp_id) return cookieData.corp_id;
  if (cookieData?.cookies) {
    const corpCookie = cookieData.cookies.find(c => 
      c.name === "corpId" || c.name === "corp_id" || c.name === "dingtalk_corp_id"
    );
    if (corpCookie) return corpCookie.value;
  }
  return "";
}

// ==================== HTTP 请求工具 ====================

function isLoginRedirect(statusCode, locationHeader) {
  if (statusCode !== 301 && statusCode !== 302) return false;
  if (!locationHeader) return true;
  const loc = locationHeader.toLowerCase();
  return loc.includes("login") || loc.includes("sso") || 
         loc.includes("workplatform") || loc.includes("sign");
}

/**
 * 发送POST请求
 * @param {string} baseUrl - 基础URL
 * @param {string} requestPath - 请求路径
 * @param {Object} params - 请求参数
 * @param {Array} cookies - Cookie数组
 * @param {string} referer - Referer
 * @returns {Promise<Object>}
 */
function postRequest(baseUrl, requestPath, params, cookies, referer = null) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify(params);
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: requestPath,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        "Origin": baseUrl,
        "Referer": referer || baseUrl + "/",
        "Cookie": cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
      },
      timeout: CONFIG.timeout.request,
    };

    const request = requestModule.request(requestOptions, (response) => {
      // 检测到登录重定向
      if (isLoginRedirect(response.statusCode, response.headers.location)) {
        console.error(`  HTTP ${response.statusCode} → 需要重新登录`);
        resolve({ __needLogin: true });
        response.resume();
        return;
      }

      let responseData = "";
      response.on("data", chunk => { responseData += chunk; });
      response.on("end", () => {
        console.error(`  HTTP ${response.statusCode}`);
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          console.error(`  响应内容: ${responseData.substring(0, 500)}`);
          resolve({ 
            success: false, 
            errorMsg: `HTTP ${response.statusCode}: 非JSON响应` 
          });
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      reject(new Error("请求超时"));
    });

    request.on("error", reject);
    request.write(postData);
    request.end();
  });
}

/**
 * 发送GET请求
 * @param {string} baseUrl - 基础URL
 * @param {string} requestPath - 请求路径
 * @param {Object} queryParams - 查询参数
 * @param {Array} cookies - Cookie数组
 * @returns {Promise<Object>}
 */
function getRequest(baseUrl, requestPath, queryParams, cookies) {
  return new Promise((resolve, reject) => {
    const queryString = querystring.stringify(queryParams);
    const fullPath = requestPath + (queryString ? "?" + queryString : "");
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: fullPath,
      method: "GET",
      headers: {
        "Origin": baseUrl,
        "Referer": baseUrl + "/",
        "Cookie": cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
      },
      timeout: CONFIG.timeout.request,
    };

    const request = requestModule.request(requestOptions, (response) => {
      if (isLoginRedirect(response.statusCode, response.headers.location)) {
        console.error(`  HTTP ${response.statusCode} → 需要重新登录`);
        resolve({ __needLogin: true });
        response.resume();
        return;
      }

      let responseData = "";
      response.on("data", chunk => { responseData += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve({ 
            success: false, 
            errorMsg: `HTTP ${response.statusCode}: 非JSON响应` 
          });
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      reject(new Error("请求超时"));
    });

    request.on("error", reject);
    request.end();
  });
}

// ==================== 自动重试包装 ====================

/**
 * 带自动重登录的请求封装
 * @param {Function} requestFn - 返回Promise的请求函数
 * @param {Object} authRef - 登录态引用对象 { cookieData, csrfToken, cookies, baseUrl }
 * @returns {Promise<Object>}
 */
/**
 * 判断响应是否需要重新登录（登录过期 或 CSRF Token 失效）。
 *
 * 【根因修复】之前仅用 errorMsg 字符串匹配 3 种登录过期文案，
 * 忽略了基于 errorCode 的稳健检测，也不识别 "csrf校验失败"（errorCode TIANSHU_000030）。
 * 一旦 CSRF Token 服务端轮换/过期，请求会无法恢复。
 * 现接入 lib/core/utils 的 isLoginExpired / isCsrfTokenExpired（基于 errorCode）。
 * @param {Object} result - 请求响应
 * @returns {boolean}
 */
function needsReLogin(result) {
  if (!result) return false;
  if (result.__needLogin) return true;
  // 基于 errorCode 的稳健检测：登录过期（307/302）、csrf 过期（TIANSHU_000030）
  if (coreUtils.isLoginExpired(result) || coreUtils.isCsrfTokenExpired(result)) return true;
  // errorMsg 字符串兑底：兼容历史登录过期文案 + csrf 校验失败
  if (result.success === false && result.errorMsg) {
    const msg = String(result.errorMsg);
    return ['登录状态已过期', '未登录', '请先登录', 'csrf校验失败', 'csrf 校验失败', 'CSRF校验']
      .some((k) => msg.includes(k));
  }
  return false;
}

async function requestWithAutoLogin(requestFn, authRef) {
  let result = await requestFn(authRef);

  if (needsReLogin(result)) {
    console.error("  🔄 登录态/CSRF 校验失败，正在重新登录...");
    const newCookieData = triggerLogin();
    
    // 更新登录态
    authRef.cookieData = newCookieData;
    authRef.csrfToken = newCookieData.csrf_token;
    authRef.cookies = newCookieData.cookies;
    authRef.baseUrl = resolveBaseUrl(newCookieData);
    authRef.corpId = resolveCorpId(newCookieData);
    
    console.error("  🔄 重新发送请求...");
    result = await requestFn(authRef);
  }
  
  return result;
}

// ==================== API路径构建 ====================

/**
 * 构建宜搭API路径
 * @param {string} appType - 应用ID
 * @param {string} apiName - 接口名称
 * @param {Object} options - 选项 { prefix, namespace, addTimestamp }
 * @returns {string}
 */
function buildApiPath(appType, apiName, options = {}) {
  const { prefix = "", namespace = "dingtalk", addTimestamp = false } = options;
  const prefixPath = prefix ? `/${prefix}` : "";
  const timestamp = addTimestamp ? `?_stamp=${Date.now()}` : "";
  return `/${namespace}/web/${appType}${prefixPath}/query/formdesign/${apiName}.json${timestamp}`;
}

// ==================== 导出 ====================

module.exports = {
  // 配置
  CONFIG,
  
  // Cookie管理
  loadCookieData,
  triggerLogin,
  resolveBaseUrl,
  resolveCorpId,
  
  // HTTP请求
  postRequest,
  getRequest,
  requestWithAutoLogin,
  
  // 工具
  buildApiPath,
  isLoginRedirect,
  
  // 常量
  PROJECT_ROOT,
  COOKIE_FILE,
  LOGIN_SCRIPT
};
