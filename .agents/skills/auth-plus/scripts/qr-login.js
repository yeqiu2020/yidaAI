/**
 * qr-login.js — 终端二维码登录
 *
 * 通过 HTTP 请求获取宜搭登录二维码，在终端显示并轮询登录状态。
 * 不依赖浏览器，适用于服务器环境、SSH 远程等场景。
 *
 * 工作流程：
 *   1. 请求宜搭登录页面获取二维码
 *   2. 在终端显示二维码（ASCII art）
 *   3. 轮询登录状态
 *   4. 登录成功后获取 Cookie
 *   5. 保存到 .cookies.json
 *
 * 创建日期：2026-07-10 (Phase 2)
 * 版本：1.1.0 — 修复未登录重定向误判为登录成功；保存前强制校验 Cookie
 */

'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { findProjectRoot, resolveBaseUrl, extractInfoFromCookies } = require('../../../../lib/core/utils');
const { CliError, ErrorCode } = require('../../../../lib/core/error');
const cookieManager = require('./cookie-manager');

// ── 配置 ───────────────────────────────────────────────

const LOGIN_BASE = 'https://www.aliwork.com';
const MAX_POLL_STEPS = 300; // 最大轮询次数（每2秒一次，共10分钟）
const POLL_INTERVAL = 2000; // 轮询间隔（毫秒）

// ── HTTP 工具 ──────────────────────────────────────────

/**
 * 发送 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {object} [options] - 请求选项
 * @returns {Promise<{ statusCode: number, headers: object, body: string, cookies: Array }>}
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000,
    };

    const req = requestModule.request(requestOptions, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        // 解析 Set-Cookie 头
        const cookies = [];
        const setCookieHeaders = res.headers['set-cookie'];
        if (setCookieHeaders) {
          for (const header of setCookieHeaders) {
            const match = header.match(/^([^=]+)=([^;]*)/);
            if (match) {
              cookies.push({
                name: match[1].trim(),
                value: match[2].trim(),
                domain: parsed.hostname,
                path: '/',
              });
            }
          }
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body, cookies });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`请求超时: ${url}`));
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// ── 二维码显示 ─────────────────────────────────────────

/**
 * 在终端显示二维码
 * 使用 Unicode 半角/全角字符渲染二维码
 *
 * @param {string} qrUrl - 二维码图片 URL 或二维码内容
 */
function displayQRCode(qrUrl) {
  console.log('\n  ┌──────────────────────────────────┐');
  console.log('  │         宜搭扫码登录              │');
  console.log('  │                                  │');
  console.log('  │  请使用钉钉扫描下方二维码          │');
  console.log('  │                                  │');
  console.log('  └──────────────────────────────────┘\n');

  // 如果是 URL，尝试显示为二维码
  if (qrUrl) {
    console.log('  📱 二维码链接（可复制到浏览器生成二维码）:\n');
    console.log(`  ${qrUrl}\n`);

    // 尝试使用终端二维码渲染（简化版）
    // 使用 ANSI block characters 渲染
    try {
      const qrAscii = renderSimpleQRPlaceholder(qrUrl);
      console.log(qrAscii);
    } catch {
      // 如果渲染失败，仅显示链接
    }

    console.log('\n  ⏳ 等待扫码登录...\n');
  }
}

/**
 * 简易二维码占位渲染（不依赖外部库）
 * 实际二维码渲染需要 qrcode 库，这里仅作为占位提示
 * @param {string} url
 * @returns {string}
 */
function renderSimpleQRPlaceholder(url) {
  const border = '  ' + '─'.repeat(40);
  const empty = '  │' + ' '.repeat(40) + '│';
  const lines = [
    border,
    empty,
    '  │' + '  📱 请扫码登录宜搭平台'.padEnd(38) + '│',
    empty,
    '  │' + `  链接: ${url.substring(0, 36)}...`.padEnd(38) + '│',
    empty,
    '  │' + '  或复制上方链接到浏览器'.padEnd(38) + '│',
    empty,
    border,
  ];
  return lines.join('\n');
}

// ── 登录流程 ───────────────────────────────────────────

/**
 * 获取登录页面的初始 Cookie 和二维码
 * @returns {Promise<{ cookies: Array, qrUrl: string|null, loginPage: string }>}
 */
async function fetchLoginPage() {
  console.log('  📄 请求宜搭登录页面...');

  const response = await httpRequest(`${LOGIN_BASE}/workPlatform`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  // 收集初始 Cookie
  const cookies = response.cookies;

  // 尝试从页面中提取二维码 URL
  let qrUrl = null;
  try {
    // 查找二维码图片 URL
    const qrMatch = response.body.match(/src="([^"]*qr[^"]*)"/i);
    if (qrMatch) {
      qrUrl = qrMatch[1].startsWith('http') ? qrMatch[1] : `${LOGIN_BASE}${qrMatch[1]}`;
    }

    // 查找二维码 API 端点
    const apiMatch = response.body.match(/["']([^"']*login[^"']*qr[^"']*api[^"']*)["']/i);
    if (apiMatch) {
      qrUrl = qrUrl || apiMatch[1];
    }
  } catch {
    // 忽略解析错误
  }

  // 如果没有找到二维码 URL，使用钉钉扫码登录链接
  if (!qrUrl) {
    qrUrl = `${LOGIN_BASE}/workPlatform`;
  }

  return { cookies, qrUrl, loginPage: response.body };
}

/**
 * 轮询登录状态
 * @param {Array} initialCookies - 初始 Cookie
 * @returns {Promise<object|null>} 登录成功后的 Cookie 数据
 */
async function pollLoginStatus(initialCookies) {
  console.log(`  ⏳ 开始轮询登录状态（每${POLL_INTERVAL / 1000}秒一次，最长${MAX_POLL_STEPS * POLL_INTERVAL / 1000 / 60}分钟）...`);

  const cookieHeader = initialCookies.map(c => `${c.name}=${c.value}`).join('; ');

  let step = 0;
  while (step < MAX_POLL_STEPS) {
    step++;
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    try {
      const response = await httpRequest(`${LOGIN_BASE}/workPlatform`, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      // 合并新 Cookie
      if (response.cookies.length > 0) {
        for (const newCookie of response.cookies) {
          const existing = initialCookies.find(c => c.name === newCookie.name);
          if (existing) {
            existing.value = newCookie.value;
          } else {
            initialCookies.push(newCookie);
          }
        }
      }

      // 检查是否已登录（通过重定向或页面内容）
      const location = response.headers.location || '';
      const body = response.body || '';

      // 登录成功的标志：重定向到组织域名 xxx.aliwork.com（非 www、非钉钉 SSO）
      // 【v1.1.0 修复】原 includes('.aliwork.com') 判定会被 query 参数里 URL 编码的域名文本误命中
      // （https%3A%2F%2Fwww.aliwork.com 中的域名是明文），把"重定向到钉钉 SSO 登录页"（=未登录）
      // 误判为登录成功，导致 2 个未认证 Cookie 落盘（2026-08-18 假登录事故）
      let loginRedirect = null;
      if (location) {
        try {
          const u = new URL(location);
          const h = u.hostname;
          // 组织域名（如 xxx.aliwork.com）= 已登录；login.dingtalk.com = 未登录，继续轮询
          if (h.endsWith('.aliwork.com') && h !== 'www.aliwork.com') {
            loginRedirect = location;
          }
        } catch {
          // 非法 URL 忽略
        }
      }
      if (loginRedirect) {
        console.log(`\n  ✅ 检测到登录重定向: ${loginRedirect}`);

        // 跟随重定向获取完整 Cookie
        const redirectResponse = await httpRequest(loginRedirect, {
          headers: {
            'Cookie': initialCookies.map(c => `${c.name}=${c.value}`).join('; '),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        // 合并重定向后的 Cookie
        if (redirectResponse.cookies.length > 0) {
          for (const newCookie of redirectResponse.cookies) {
            const existing = initialCookies.find(c => c.name === newCookie.name);
            if (existing) {
              existing.value = newCookie.value;
            } else {
              initialCookies.push(newCookie);
            }
          }
        }

        const baseUrl = location.match(/^(https:\/\/[^\/]+)/)?.[1] || LOGIN_BASE;

        return {
          cookies: initialCookies,
          base_url: baseUrl,
        };
      }

      // 检查页面内容是否表示已登录
      if (body.includes('我的应用') || body.includes('工作台')) {
        const baseUrl = body.match(/https:\/\/([^.]+)\.aliwork\.com/)?.[0] || LOGIN_BASE;
        if (!baseUrl.includes('//www.')) {
          console.log(`\n  ✅ 检测到登录成功！`);
          return {
            cookies: initialCookies,
            base_url: baseUrl,
          };
        }
      }

      // 输出等待提示
      if (step % 15 === 0) {
        console.log(`  ⏳ 已等待 ${step * POLL_INTERVAL / 1000}秒...`);
      }
    } catch (err) {
      // 网络错误时继续重试
      if (step % 15 === 0) {
        console.log(`  ⚠️ 轮询异常: ${err.message}`);
      }
    }
  }

  return null;
}

// ── 主入口 ─────────────────────────────────────────────

/**
 * 终端二维码登录主函数
 * @param {object} [options] - 选项
 * @returns {Promise<object>} 登录态
 */
async function qrLogin(options = {}) {
  console.log('\n' + '='.repeat(50));
  console.log('  终端二维码登录');
  console.log('='.repeat(50));

  // 1. 获取登录页面和初始 Cookie
  const { cookies: initialCookies, qrUrl } = await fetchLoginPage();

  console.log(`  ✅ 获取到 ${initialCookies.length} 个初始 Cookie`);

  // 2. 显示二维码
  displayQRCode(qrUrl);

  // 3. 轮询登录状态
  const loginResult = await pollLoginStatus(initialCookies);

  if (!loginResult) {
    throw new CliError(
      ErrorCode.UNKNOWN,
      '二维码登录超时，未检测到登录成功',
      { hint: '请确保在10分钟内完成扫码登录' }
    );
  }

  // 4. 清理 Cookie
  const validKeys = new Set(['name', 'value', 'domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite']);
  const cleanCookies = loginResult.cookies.map(c => {
    const cleaned = {};
    for (const key of validKeys) {
      if (c[key] !== undefined) cleaned[key] = c[key];
    }
    return cleaned;
  });

  // 5. 提取信息
  const { csrfToken, corpId, userId } = extractInfoFromCookies(cleanCookies);

  const loginState = {
    cookies: cleanCookies,
    base_url: loginResult.base_url,
    csrf_token: csrfToken,
    corp_id: corpId,
    user_id: userId,
    login_strategy: 'qr',
  };

  // 6. 保存前强制校验（【v1.1.0】防止未认证 Cookie 落盘，2026-08-18 假登录事故）
  const validation = cookieManager.quickValidateCookies(loginState);
  if (!validation.valid) {
    throw new CliError(
      ErrorCode.LOGIN_FAILED,
      `二维码登录结果校验未通过: ${validation.reason}`,
      { hint: '终端二维码为实验性策略，未提取到有效登录态。请使用浏览器扫码登录（默认策略）。' }
    );
  }

  // 7. 保存
  cookieManager.saveCookieData(loginState);

  console.log(`\n  ✅ Cookie 数量: ${cleanCookies.length}`);
  console.log(`  ✅ base_url: ${loginState.base_url}`);
  if (corpId) console.log(`  ✅ corp_id: ${corpId}`);

  console.log('\n' + '='.repeat(50));
  console.log('  ✅ 二维码登录完成');
  console.log('='.repeat(50));

  return loginState;
}

// ── CLI 入口 ───────────────────────────────────────────

if (require.main === module) {
  qrLogin().catch(err => {
    console.error('\n❌', err.message || err);
    if (err.hint) console.error('  💡', err.hint);
    process.exit(1);
  });
}

module.exports = {
  qrLogin,
  fetchLoginPage,
  pollLoginStatus,
};
