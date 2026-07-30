#!/usr/bin/env node
/**
 * 安全中间件补丁 - server-security-patch.js
 *
 * 以 Monkey-patch 方式加固 sync_server.js，不修改原文件任何代码。
 *
 * 加固内容：
 *   1. 显式绑定 127.0.0.1（仅监听回环地址）
 *   2. CORS 改为精确 Origin 白名单（替换原来的 *）
 *   3. 所有写/删接口增加随机会话 token 校验
 *   4. /clean-data 需二次确认 nonce
 *
 * 启动方式：
 *   node .agents/skills/server-security/scripts/server-security-patch.js
 *
 * 回退方式：
 *   设置环境变量 SECURITY_PATCH_ENABLED=false 后直接运行原始 sync_server.js
 *   node .agents/skills/form_creator/scripts/sync_server.js
 *
 * 创建日期: 2026-07-10 (Phase 0 安全修复)
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const url = require('url');

// ============================================================
// 配置
// ============================================================

// 安全补丁开关（默认开启，设为 'false' 关闭）
const SECURITY_PATCH_ENABLED = process.env.SECURITY_PATCH_ENABLED !== 'false';

// 绑定地址：仅允许回环地址
const BIND_HOST = '127.0.0.1';

// CORS 白名单（仅允许本地来源）
const CORS_WHITELIST = new Set([
  'http://127.0.0.1',
  'http://localhost',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'http://127.0.0.1:3457',
  'http://localhost:3457',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  // file:// 协议的页面（Origin 为 null）
  'null',
]);

// 会话 token 存储
const sessionTokens = new Set();

// token 有效期（8小时）
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const tokenTimestamps = new Map(); // token -> 创建时间

// /clean-data 二次确认 nonce 存储
const cleanDataNonces = new Map(); // nonce -> { timestamp, used }
const NONCE_TTL_MS = 5 * 60 * 1000; // nonce 有效期5分钟

// 写/删接口路径列表
const WRITE_ENDPOINTS = new Set([
  '/sync-app',
  '/sync-form',
  '/sync-app-to-local',
  '/sync-config',
  '/sync-schema',
  '/sync-rules',
  '/project-sync',
  '/clean-data',
  '/backup-app-data',
  '/delete-local-app',
  '/generate-system-map',
  '/form-settings',
  '/flow-settings',
  '/create-project',
  '/refresh-org-apps',
  '/save-prompts',
]);

// 健康检查端点
const HEALTH_ENDPOINT = '/health';

// 获取会话 token 的端点
const TOKEN_ENDPOINT = '/get-session-token';

// 请求 /clean-data 前需先获取确认 nonce 的端点
const CONFIRM_NONCE_ENDPOINT = '/request-clean-confirm';

// ============================================================
// 辅助函数
// ============================================================

/**
 * 生成随机会话 token
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成随机 nonce
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 清理过期的 token
 */
function cleanupTokens() {
  const now = Date.now();
  for (const [token, ts] of tokenTimestamps) {
    if (now - ts > TOKEN_TTL_MS) {
      sessionTokens.delete(token);
      tokenTimestamps.delete(token);
    }
  }
}

/**
 * 清理过期的 nonce
 */
function cleanupNonces() {
  const now = Date.now();
  for (const [nonce, info] of cleanDataNonces) {
    if (now - info.timestamp > NONCE_TTL_MS || info.used) {
      cleanDataNonces.delete(nonce);
    }
  }
}

/**
 * 检查 Origin 是否在白名单中
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // 非 HTTP 请求（如 curl 无 Origin 头）
  return CORS_WHITELIST.has(origin);
}

/**
 * 从请求中提取 token
 */
function extractToken(req) {
  // 优先从 header 获取
  const headerToken = req.headers['x-session-token'];
  if (headerToken) return headerToken;

  // 其次从 query 获取
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.query && parsedUrl.query.token) {
    return parsedUrl.query.token;
  }

  return null;
}

/**
 * 从请求中提取 nonce
 */
function extractNonce(req) {
  return req.headers['x-confirm-nonce'] || null;
}

/**
 * 发送 JSON 响应
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * 读取请求 body
 */
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// ============================================================
// 安全中间件
// ============================================================

/**
 * 安全中间件主函数
 * 返回 true 表示请求被拦截（已响应），false 表示放行
 */
async function securityMiddleware(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const origin = req.headers.origin || '';
  const method = req.method;

  // ---- CORS 处理 ----
  if (isOriginAllowed(origin)) {
    if (origin && origin !== 'null') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  } else {
    // 非白名单 Origin：拒绝请求
    sendJson(res, 403, {
      success: false,
      error: 'Origin not allowed',
      origin: origin || 'none',
    });
    return true;
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token, X-Confirm-Nonce');

  // 处理预检请求
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return true;
  }

  // ---- 获取会话 token 端点 ----
  if (pathname === TOKEN_ENDPOINT && method === 'GET') {
    cleanupTokens();
    const token = generateSessionToken();
    sessionTokens.add(token);
    tokenTimestamps.set(token, Date.now());
    sendJson(res, 200, {
      success: true,
      token: token,
      expiresIn: TOKEN_TTL_MS,
      message: '会话 token 已生成，请在后续写请求的 X-Session-Token 头中携带此 token',
    });
    return true;
  }

  // ---- 获取 /clean-data 确认 nonce 的端点 ----
  if (pathname === CONFIRM_NONCE_ENDPOINT && method === 'POST') {
    // 先验证 session token
    const token = extractToken(req);
    if (!token || !sessionTokens.has(token)) {
      sendJson(res, 403, {
        success: false,
        error: '无效或缺失的会话 token，请先通过 GET /get-session-token 获取',
      });
      return true;
    }

    cleanupNonces();
    const nonce = generateNonce();
    cleanDataNonces.set(nonce, { timestamp: Date.now(), used: false });
    sendJson(res, 200, {
      success: true,
      nonce: nonce,
      expiresIn: NONCE_TTL_MS,
      message: '确认 nonce 已生成，请在调用 /clean-data 时通过 X-Confirm-Nonce 头携带此 nonce',
    });
    return true;
  }

  // ---- 写/删接口 token 校验 ----
  if (WRITE_ENDPOINTS.has(pathname) && method === 'POST') {
    const token = extractToken(req);
    if (!token || !sessionTokens.has(token)) {
      sendJson(res, 403, {
        success: false,
        error: '无效或缺失的会话 token，请先通过 GET /get-session-token 获取',
        hint: 'GET /get-session-token 获取 token，然后在写请求中通过 X-Session-Token 头携带',
      });
      return true;
    }

    // ---- /clean-data 二次确认 nonce 校验 ----
    if (pathname === '/clean-data') {
      const nonce = extractNonce(req);
      if (!nonce) {
        sendJson(res, 403, {
          success: false,
          error: '清空数据操作需要二次确认 nonce',
          hint: '先 POST /request-clean-confirm 获取 nonce，然后在 /clean-data 请求中通过 X-Confirm-Nonce 头携带',
        });
        return true;
      }

      const nonceInfo = cleanDataNonces.get(nonce);
      if (!nonceInfo || nonceInfo.used) {
        sendJson(res, 403, {
          success: false,
          error: '无效或已使用的确认 nonce，请重新获取',
        });
        return true;
      }

      if (Date.now() - nonceInfo.timestamp > NONCE_TTL_MS) {
        cleanDataNonces.delete(nonce);
        sendJson(res, 403, {
          success: false,
          error: '确认 nonce 已过期，请重新获取',
        });
        return true;
      }

      // 标记 nonce 已使用
      nonceInfo.used = true;
    }
  }

  // ---- 健康检查端点附加安全信息 ----
  if (pathname === HEALTH_ENDPOINT) {
    // 让原始处理逻辑处理，但我们在响应后附加信息
    // 这里不拦截，让原始逻辑处理
    // 但我们可以在 res 上附加额外信息
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function (statusCode, headers) {
      // 在健康检查响应中添加安全状态
      return originalWriteHead(statusCode, headers);
    };
    const originalEnd = res.end.bind(res);
    res.end = function (data) {
      try {
        if (data) {
          const parsed = JSON.parse(data);
          parsed.securityPatch = SECURITY_PATCH_ENABLED ? 'enabled' : 'disabled';
          parsed.bindAddress = BIND_HOST;
          parsed.tokenRequired = true;
          data = JSON.stringify(parsed);
        }
      } catch (_) {} // 有意忽略：响应体可能非 JSON 格式，保持原始数据
    };
  }

  // 放行到原始处理逻辑
  return false;
}

// ============================================================
// Monkey-patch http.createServer 和 server.listen
// ============================================================

if (SECURITY_PATCH_ENABLED) {
  // 保存原始方法
  const originalCreateServer = http.createServer;

  // 替换 createServer
  http.createServer = function (requestListener) {
    // 包装原始请求处理器
    const wrappedHandler = async (req, res) => {
      try {
        // 运行安全中间件
        const intercepted = await securityMiddleware(req, res);
        if (intercepted) return;

        // 调用原始处理器
        requestListener(req, res);
      } catch (err) {
        // 安全中间件出错时返回 500
        try {
          sendJson(res, 500, {
            success: false,
            error: 'Security middleware error: ' + err.message,
          });
        } catch (_) {} // 有意忽略：响应可能已发送（连接已关闭）
      }
    };

    return originalCreateServer.call(http, wrappedHandler);
  };

  // 保存原始 listen 方法
  const originalListen = http.Server.prototype.listen;

  // 替换 listen：强制绑定到 127.0.0.1
  http.Server.prototype.listen = function (port, ...args) {
    // 如果第二个参数是回调函数（即原始调用为 listen(port, callback)）
    // 则插入 host 参数
    if (typeof port === 'number' || typeof port === 'string') {
      // 检查 args[0] 是否是回调
      if (args.length > 0 && typeof args[0] === 'function') {
        const callback = args[0];
        console.log('\n[安全补丁] 服务绑定到 127.0.0.1:' + port);
        return originalListen.call(this, port, BIND_HOST, () => {
          // 打印安全信息
          console.log('[安全补丁] ✅ 安全加固已启用');
          console.log('[安全补丁]    - 仅监听回环地址: 127.0.0.1');
          console.log('[安全补丁]    - CORS: 精确 Origin 白名单');
          console.log('[安全补丁]    - 写接口需会话 token (GET /get-session-token)');
          console.log('[安全补丁]    - /clean-data 需二次确认 nonce (POST /request-clean-confirm)');
          console.log('[安全补丁] 回退方式: 设置 SECURITY_PATCH_ENABLED=false 后直接运行 sync_server.js\n');
          callback();
        });
      }
      // 如果 args[0] 是 host（不太可能在这种调用模式中）
      if (args.length > 0 && typeof args[0] === 'string') {
        // 已有 host 参数，强制改为 127.0.0.1
        console.log('[安全补丁] 强制绑定到 127.0.0.1 (原 host: ' + args[0] + ')');
        args[0] = BIND_HOST;
        return originalListen.call(this, port, ...args);
      }
      // 没有回调，只有 port
      console.log('[安全补丁] 服务绑定到 127.0.0.1:' + port);
      return originalListen.call(this, port, BIND_HOST);
    }
    // 其他情况：直接调用原始方法
    return originalListen.call(this, port, ...args);
  };

  console.log('[安全补丁] 安全中间件已注入，等待服务启动...');
} else {
  console.log('[安全补档] ⚠️ SECURITY_PATCH_ENABLED=false，安全加固已关闭');
}

// ============================================================
// 加载原始 sync_server.js
// ============================================================

// 计算原始 sync_server.js 的路径
const originalServerPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'skills',
  'form_creator',
  'scripts',
  'sync_server.js'
);

console.log('[安全补丁] 加载原始服务: ' + originalServerPath);

// 检查文件是否存在
const fs = require('fs');
if (!fs.existsSync(originalServerPath)) {
  console.error('[安全补丁] ❌ 原始服务文件不存在: ' + originalServerPath);
  process.exit(1);
}

// 加载原始服务（这会启动服务器）
require(originalServerPath);
