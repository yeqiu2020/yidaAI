/**
 * cdp-login.js — CDP 浏览器登录（Chrome DevTools Protocol）
 *
 * 通过 Chrome DevTools Protocol 直接连接本地已开启调试端口的浏览器，
 * 不依赖 Playwright，实现轻量级登录态获取。
 *
 * 工作流程：
 *   1. 检测 CDP 调试端口（默认 9222）
 *      - 若端口可用 → 直接连接
 *      - 若不可用 → 自动探测本机 Chrome/Edge/Brave 并以调试模式启动
 *   2. 打开宜搭登录页面
 *   3. 等待用户完成登录（轮询检测登录状态）
 *   4. 获取 Cookie 和页面信息
 *   5. 保存到 .cookies.json
 *
 * 支持的浏览器：Chrome 66+ / Edge 79+ / Brave / Chromium
 * （Target.createTarget 从 Chrome 66 起支持，基本覆盖所有用户）
 *
 * 创建日期：2026-07-10 (Phase 2)
 * 更新日期：2026-07-12 (增加自动探测+自动拉起浏览器)
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { findProjectRoot } = require('../../../../lib/core/utils');
const { CliError, ErrorCode } = require('../../../../lib/core/error');
const cookieManager = require('./cookie-manager');

// ── 配置 ───────────────────────────────────────────────

const CDP_PORT = parseInt(process.env.YIDA_CDP_PORT || '9222', 10);
const CDP_HOST = '127.0.0.1';
const LOGIN_URL = 'https://www.aliwork.com/workPlatform';
const MAX_WAIT_STEPS = 300; // 最大等待步骤（每2秒检测一次，共10分钟）

// ── 浏览器探测 ──────────────────────────────────────────

/**
 * 各平台常见 Chromium 内核浏览器路径（优先 Chrome → Edge → Brave → Chromium）
 * 旧版 Chrome（66+）即支持 Target.createTarget，所以版本兼容性无需担心。
 */
const BROWSER_PATHS = {
  win32: [
    { name: 'Chrome',  path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { name: 'Chrome',  path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
    { name: 'Edge',    path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
    { name: 'Edge',    path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    { name: 'Brave',   path: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
    { name: 'Brave',   path: 'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
  ],
  darwin: [
    { name: 'Chrome',  path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    { name: 'Edge',    path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
    { name: 'Brave',   path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
    { name: 'Chromium',path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
  ],
  linux: [
    { name: 'Chrome',  path: '/usr/bin/google-chrome-stable' },
    { name: 'Chrome',  path: '/usr/bin/google-chrome' },
    { name: 'Chromium',path: '/usr/bin/chromium-browser' },
    { name: 'Chromium',path: '/usr/bin/chromium' },
    { name: 'Edge',    path: '/usr/bin/microsoft-edge-stable' },
    { name: 'Edge',    path: '/usr/bin/microsoft-edge' },
  ],
};

/**
 * 自动探测本机可用的 Chromium 内核浏览器
 * @returns {{ name: string, path: string }|null} 浏览器信息或 null
 */
function findBrowserPath() {
  const platform = os.platform();
  const candidates = BROWSER_PATHS[platform] || [];

  // 1. 检查硬编码路径
  for (const entry of candidates) {
    if (fs.existsSync(entry.path)) {
      return entry;
    }
  }

  // 2. Windows: 尝试 where 命令
  if (platform === 'win32') {
    for (const cmd of ['chrome', 'msedge']) {
      try {
        const result = execSync(`where ${cmd}`, { encoding: 'utf8', timeout: 3000, windowsHide: true }).trim();
        if (result) {
          const exe = result.split('\n')[0].trim();
          if (fs.existsSync(exe)) return { name: cmd === 'chrome' ? 'Chrome' : 'Edge', path: exe };
        }
      } catch { /* where 命令可能找不到 */ }
    }
  }

  // 3. Linux/macOS: 尧试 PATH 中的常见名称
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'microsoft-edge', 'microsoft-edge-stable']) {
    try {
      const result = execSync(`which ${name} 2>/dev/null`, { encoding: 'utf8', timeout: 3000 }).trim();
      if (result && fs.existsSync(result)) return { name, path: result };
    } catch { /* which 命令可能找不到 */ }
  }

  return null;
}

/**
 * 以调试模式启动浏览器（使用独立临时 profile，不干扰用户正常浏览器）
 *
 * 启动参数说明：
 *   --remote-debugging-port  开启 CDP 调试端口
 *   --remote-allow-origins=* 允许任意来源连接（新版 Chrome 安全要求）
 *   --user-data-dir           使用临时目录，与用户正常浏览器隔离
 *   --no-first-run            跳过首次运行引导
 *   --no-default-browser-check 跳过默认浏览器检查
 *
 * @param {string} browserPath - 浏览器可执行文件路径
 * @param {number} port - CDP 调试端口
 * @returns {{ process: object, tempDir: string }} 启动信息
 */
function launchBrowserDebugMode(browserPath, port) {
  const tempDir = path.join(os.tmpdir(), `yida-cdp-debug-${port}`);

  // 确保临时目录存在
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
  ];

  const proc = spawn(browserPath, args, {
    detached: true,   // 独立进程，脚本退出后浏览器继续运行
    stdio: 'ignore',  // 不捕获浏览器输出
  });
  proc.unref();

  return { process: proc, tempDir };
}

// ── CDP 通信 ───────────────────────────────────────────

let messageId = 0;

/**
 * 发送 CDP 命令并等待响应
 * @param {object} ws - WebSocket 连接
 * @param {string} method - CDP 方法名
 * @param {object} [params] - 方法参数
 * @returns {Promise<object>} 响应结果
 */
function sendCDPCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const message = JSON.stringify({ id, method, params });

    const handler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          ws.off('message', handler);
          if (response.error) {
            reject(new Error(`CDP error: ${JSON.stringify(response.error)}`));
          } else {
            resolve(response.result);
          }
        }
      } catch {
        // 忽略非 JSON 消息
      }
    };

    ws.on('message', handler);
    ws.send(message);
  });
}

/**
 * 获取 CDP 调试目标列表
 * @returns {Promise<Array>}
 */
function getCDPTargets() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_HOST}:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          resolve(targets);
        } catch (err) {
          reject(new Error(`解析 CDP 目标列表失败: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`无法连接到 CDP 端口 ${CDP_PORT}: ${err.message}`));
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`连接 CDP 端口 ${CDP_PORT} 超时`));
    });
  });
}

/**
 * 创建新的浏览器标签页
 *
 * 注意：新版 Chrome（133+）已禁用 HTTP 接口 /json/new（返回 405），
 * 因此改通过 WebSocket CDP 的 Target.createTarget 命令创建标签页，
 * 再通过 /json/list 查询新标签页的 webSocketDebuggerUrl。
 *
 * @param {string} url - 目标 URL
 * @returns {Promise<object>} 新标签页信息（含 webSocketDebuggerUrl）
 */
function createCDPTab(url) {
  return new Promise((resolve, reject) => {
    getCDPTargets().then(targets => {
      const controlTarget =
        targets.find(t => t.type === 'browser' && t.webSocketDebuggerUrl) ||
        targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) ||
        targets.find(t => t.webSocketDebuggerUrl);
      if (!controlTarget) {
        throw new Error('未找到可用于创建标签页的调试目标');
      }

      const WebSocket = getWebSocket();
      const ctrl = new WebSocket(controlTarget.webSocketDebuggerUrl);
      let ctrlId = 0;
      const pending = new Map();

      ctrl.on('message', (data) => {
        try {
          const resp = JSON.parse(data.toString());
          if (resp.id && pending.has(resp.id)) {
            const { resolve: r, reject: rej } = pending.get(resp.id);
            pending.delete(resp.id);
            if (resp.error) rej(new Error(resp.error.message));
            else r(resp.result);
          }
        } catch { /* 忽略非 JSON / 事件消息 */ }
      });

      const send = (method, params = {}) => new Promise((res, rej) => {
        const id = ++ctrlId;
        pending.set(id, { resolve: res, reject: rej });
        ctrl.send(JSON.stringify({ id, method, params }));
      });

      ctrl.on('open', async () => {
        try {
          // 启用 Target 域（新版 CDP 用 setDiscoverTargets 代替已废弃的 Target.enable）
          await send('Target.setDiscoverTargets', { discover: true });
          const { targetId } = await send('Target.createTarget', { url });
          ctrl.close();

          // 等待新标签页在 /json/list 中可见
          let newTab = null;
          for (let i = 0; i < 10 && !newTab; i++) {
            const list = await getCDPTargets();
            newTab = list.find(t => t.id === targetId && t.webSocketDebuggerUrl);
            if (!newTab) await new Promise(r => setTimeout(r, 200));
          }
          if (!newTab) throw new Error('无法获取新标签页的调试地址');
          resolve(newTab);
        } catch (err) {
          ctrl.close();
          reject(err);
        }
      });

      ctrl.on('error', err => reject(err));
    }).catch(reject);
  });
}

/**
 * 检测 CDP 是否可用
 * @returns {Promise<boolean>}
 */
async function isCDPAvailable() {
  try {
    const targets = await getCDPTargets();
    return Array.isArray(targets);
  } catch {
    return false;
  }
}

// ── 登录流程 ───────────────────────────────────────────

/**
 * 通过 CDP 获取页面的 Cookie
 * @param {object} ws - WebSocket 连接
 * @returns {Promise<Array>} Cookie 列表
 */
async function getCookiesViaCDP(ws) {
  const result = await sendCDPCommand(ws, 'Network.getAllCookies');
  return result.cookies || [];
}

/**
 * 通过 CDP 获取当前页面 URL
 * @param {object} ws - WebSocket 连接
 * @returns {Promise<string>}
 */
async function getCurrentUrl(ws) {
  const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true,
  });
  return result.result?.value || '';
}

/**
 * 通过 CDP 获取页面文本内容
 * @param {object} ws - WebSocket 连接
 * @returns {Promise<string>}
 */
async function getPageText(ws) {
  const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
    expression: 'document.body ? document.body.innerText : ""',
    returnByValue: true,
  });
  return result.result?.value || '';
}

/**
 * 通过 CDP 获取页面标题
 * @param {object} ws - WebSocket 连接
 * @returns {Promise<string>}
 */
async function getPageTitle(ws) {
  const result = await sendCDPCommand(ws, 'Runtime.evaluate', {
    expression: 'document.title',
    returnByValue: true,
  });
  return result.result?.value || '';
}

/**
 * 检测是否已登录
 * @param {string} url - 当前 URL
 * @param {string} pageText - 页面文本
 * @returns {boolean}
 */
function is_loggedIn(url, pageText) {
  // 排除 www.aliwork.com 首页
  if (url.includes('//www.aliwork.com')) {
    return false;
  }

  // 检查是否在宜搭工作台
  if (url.includes('.aliwork.com')) {
    if (pageText.includes('我的应用') || pageText.includes('工作台') ||
        pageText.includes('表单设计') || pageText.includes('组件库')) {
      return true;
    }
  }

  return false;
}

/**
 * 提取 base_url
 * @param {string} url
 * @returns {string|null}
 */
function extractBaseUrl(url) {
  const match = url.match(/^(https:\/\/[^\/]+)/);
  if (!match) return null;

  const extractedUrl = match[1];
  // 排除无效域名
  const invalidPrefixes = ['www', 'login', 'auth', 'docs', 'help', 'support', 'developer'];
  const domainPrefix = extractedUrl.replace('https://', '').replace('.aliwork.com', '');
  if (invalidPrefixes.includes(domainPrefix)) return null;

  return extractedUrl;
}

// ── WebSocket 连接 ────────────────────────────────────

/**
 * 动态加载 WebSocket（Node.js 内置或 ws 模块），并兼容二者 API。
 *
 * Node 22+ 内置的是 WHATWG 原生 WebSocket：
 *   - 没有 ws 模块的 .on()/.off() 方法（原生用 addEventListener）
 *   - message 事件回调收到的是 { data } 事件对象，而非原始数据
 * 这里给原生 WebSocket 原型补上 .on()/.off()，并把 message 事件
 * 还原为「直接传原始数据」的 ws 模块行为，使全脚本无需改动即可运行。
 *
 * @returns {object} WebSocket 类
 */
let wsPatched = false;
function getWebSocket() {
  let WS;
  if (typeof globalThis.WebSocket !== 'undefined') {
    WS = globalThis.WebSocket;
  } else {
    try {
      WS = require('ws');
    } catch {
      throw new CliError(
        ErrorCode.UNKNOWN,
        'WebSocket 不可用。请确保 Node.js 版本 >= 22 或安装 ws 模块',
        { hint: 'npm install ws' }
      );
    }
  }

  if (!wsPatched && WS.prototype && typeof WS.prototype.on !== 'function') {
    WS.prototype.on = function (event, handler) {
      if (event === 'message') {
        // 原生 message 事件给的是 { data }，这里还原为 ws 模块的「原始数据」签名
        this.addEventListener(event, (e) => handler(e.data));
      } else {
        this.addEventListener(event, handler);
      }
      return this;
    };
    WS.prototype.off = function (event, handler) {
      this.removeEventListener(event, handler);
      return this;
    };
    wsPatched = true;
  }

  return WS;
}

// ── 主入口 ─────────────────────────────────────────────

/**
 * CDP 登录主函数
 * @param {object} [options] - 选项
 * @param {number} [options.port] - CDP 端口
 * @param {string} [options.loginUrl] - 登录 URL
 * @returns {Promise<object>} 登录态
 */
async function cdpLogin(options = {}) {
  const port = options.port || CDP_PORT;
  const loginUrl = options.loginUrl || LOGIN_URL;

  console.log('\n' + '='.repeat(50));
  console.log('  CDP 浏览器登录');
  console.log('='.repeat(50));

  // 1. 检测 CDP 可用性，不可用时自动拉起浏览器
  console.log(`\n  🔍 检测 CDP 端口 ${CDP_HOST}:${port}...`);

  let targets;
  try {
    targets = await getCDPTargets();
    console.log(`  ✅ CDP 可用，检测到 ${targets.length} 个标签页`);
  } catch {
    // CDP 端口不可用 → 尝试自动启动浏览器
    console.log(`  ⚠️ CDP 端口 ${port} 不可用，尝试自动启动浏览器...`);
    const browser = findBrowserPath();
    if (!browser) {
      throw new CliError(
        ErrorCode.REQUEST_ERROR,
        '未检测到本机可用的浏览器（Chrome/Edge/Brave）',
        {
          hint: '请安装 Chrome 或 Edge 浏览器，或以调试模式手动启动:\n' +
                `  chrome.exe --remote-debugging-port=${port}\n` +
                `  msedge.exe --remote-debugging-port=${port}`,
          context: { port, host: CDP_HOST },
        }
      );
    }
    console.log(`  📦 检测到 ${browser.name}: ${browser.path}`);
    launchBrowserDebugMode(browser.path, port);
    console.log(`  🚀 已启动 ${browser.name}（调试端口 ${port}，独立临时 profile）`);

    // 等待 CDP 端口就绪（最多 15 秒）
    let ready = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        targets = await getCDPTargets();
        ready = true;
        break;
      } catch {}
    }
    if (!ready) {
      throw new CliError(
        ErrorCode.REQUEST_ERROR,
        `自动启动浏览器后 CDP 端口 ${port} 仍未就绪`,
        {
          hint: '请检查浏览器是否正常启动，或手动以调试模式启动:\n' +
                `  ${browser.path} --remote-debugging-port=${port}`,
          context: { port, browser: browser.name },
        }
      );
    }
    console.log(`  ✅ ${browser.name} 已就绪，检测到 ${targets.length} 个标签页`);
  }

  // 2. 创建新标签页打开登录页面
  console.log(`\n  📄 打开登录页面: ${loginUrl}`);
  const newTab = await createCDPTab(loginUrl);

  if (!newTab.webSocketDebuggerUrl) {
    throw new CliError(ErrorCode.UNKNOWN, '无法获取 CDP WebSocket 调试地址');
  }

  console.log(`  ✅ 标签页已创建`);

  // 3. 连接 WebSocket
  const WebSocket = getWebSocket();
  const ws = new WebSocket(newTab.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WebSocket 连接超时')), 10000);
  });

  console.log(`  ✅ WebSocket 已连接`);

  // 4. 启用 Network 域
  await sendCDPCommand(ws, 'Network.enable');
  await sendCDPCommand(ws, 'Runtime.enable');

  // 5. 等待登录完成
  console.log('\n  ⏳ 等待登录完成（每2秒检测一次，最长10分钟）...');
  console.log('  💡 请在浏览器中完成登录操作\n');

  let step = 0;
  let lastUrl = '';

  while (step < MAX_WAIT_STEPS) {
    step++;
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const currentUrl = await getCurrentUrl(ws);
      const pageText = await getPageText(ws);
      const pageTitle = await getPageTitle(ws);

      if (currentUrl !== lastUrl) {
        console.log(`  📍 步骤 ${step}/${MAX_WAIT_STEPS} | URL: ${currentUrl}`);
        console.log(`     标题: ${pageTitle}`);
        lastUrl = currentUrl;
      }

      if (is_loggedIn(currentUrl, pageText)) {
        console.log(`\n  ✅ 检测到登录成功！`);

        // 等待页面稳定
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 6. 获取 Cookie
        const cookies = await getCookiesViaCDP(ws);
        console.log(`  ✅ 获取到 ${cookies.length} 个 Cookie`);

        // 7. 提取 base_url
        const baseUrl = extractBaseUrl(currentUrl) || 'https://www.aliwork.com';
        console.log(`  ✅ base_url: ${baseUrl}`);

        // 8. 清理 Cookie（移除 Playwright 特有字段）
        const validKeys = new Set(['name', 'value', 'domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite']);
        const cleanCookies = cookies.map(c => {
          const cleaned = {};
          for (const key of validKeys) {
            if (c[key] !== undefined) cleaned[key] = c[key];
          }
          return cleaned;
        });

        // 9. 关闭 WebSocket
        ws.close();

        // 10. 保存登录态
        const loginState = {
          cookies: cleanCookies,
          base_url: baseUrl,
          login_strategy: 'cdp',
        };

        cookieManager.saveCookieData(loginState);

        console.log('\n' + '='.repeat(50));
        console.log('  ✅ CDP 登录完成');
        console.log('='.repeat(50));

        return loginState;
      }
    } catch (err) {
      // 页面跳转可能导致 context destroyed，忽略并重试
      if (err.message.includes('Cannot evaluate') || err.message.includes('Execution context')) {
        continue;
      }
      console.log(`  ⚠️ 检测异常: ${err.message}`);
    }
  }

  ws.close();
  throw new CliError(ErrorCode.UNKNOWN, 'CDP 登录超时，未检测到登录成功', {
    hint: '请确保在10分钟内完成登录操作',
  });
}

// ── CLI 入口 ───────────────────────────────────────────

if (require.main === module) {
  cdpLogin().catch(err => {
    console.error('\n❌', err.message || err);
    if (err.hint) console.error('  💡', err.hint);
    process.exit(1);
  });
}

module.exports = {
  cdpLogin,
  isCDPAvailable,
  getCDPTargets,
  findBrowserPath,
  launchBrowserDebugMode,
};
