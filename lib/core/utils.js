/**
 * lib/core/utils.js — 公共工具函数（自建核心库）
 *
 * 从 .agents/skills/report/scripts/core-lib/utils.js 复制并调整，
 * 移除对 i18n / chalk / env-manager / auth 模块的依赖，
 * 使本文件可被任意脚本独立 require 引入。
 *
 * 原文件保持不变（双轨制原则：稳定轨冻结，公共库独立）。
 *
 * 导出函数：
 *   findProjectRoot()         - 查找项目根目录（兼容多种 AI 工具环境）
 *   extractInfoFromCookies()  - 从 Cookie 列表中提取 csrf_token / corp_id / user_id
 *   loadCookieData()          - 读取 .cookies.json 登录态缓存
 *   resolveBaseUrl()          - 从 cookieData 中解析 base_url
 *   isLoginExpired()          - 检测响应体是否表示登录过期
 *   isCsrfTokenExpired()      - 检测响应体是否表示 csrf_token 过期
 *
 * 创建日期：2026-07-10 (Phase 1)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 默认值 ─────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://www.aliwork.com';

// ── 项目根目录查找 ────────────────────────────────────

/**
 * 检测当前活跃的 AI 工具。
 * 优先级：环境变量 > 兜底检测
 *
 * @returns {{ tool: string, displayName: string, dirName: string, workspaceRoot: string }|null}
 */
function detectActiveTool() {
  const env = process.env;
  const cwd = process.cwd();
  const home = os.homedir();

  // QoderWork（桌面客户端）
  if (
    env.QODERCLI_INTEGRATION_MODE === 'qoder_work' ||
    (env.__CFBundleIdentifier || '').toLowerCase().includes('qoder')
  ) {
    return {
      tool: 'qoderwork',
      displayName: 'QoderWork',
      dirName: '.qoderwork',
      workspaceRoot: path.join(cwd, 'project'),
    };
  }

  // Qoder IDE / Qoder Agent
  if (env.QODER_IDE || env.QODER_AGENT) {
    return {
      tool: 'qoder',
      displayName: 'Qoder',
      dirName: '.qoder',
      workspaceRoot: path.join(cwd, 'project'),
    };
  }

  // 悟空（Wukong）
  if (env.AGENT_WORK_ROOT && (env.AGENT_WORK_ROOT.includes('.real') || env.AGENT_WORK_ROOT.includes(path.join('.real')))) {
    return {
      tool: 'wukong',
      displayName: '悟空（Wukong）',
      dirName: '.real',
      workspaceRoot: resolveWukongWorkspaceRoot(env.AGENT_WORK_ROOT),
    };
  }

  // OpenAI Codex
  if (
    env.CODEX_SHELL ||
    env.CODEX_CI ||
    env.CODEX_THREAD_ID ||
    env.CODEX_HOME ||
    (env.__CFBundleIdentifier || '').toLowerCase().includes('codex')
  ) {
    return {
      tool: 'codex',
      displayName: 'Codex',
      dirName: '.codex',
      workspaceRoot: path.join(cwd, 'project'),
    };
  }

  // Claude Code
  if (env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDE_CODE) {
    return {
      tool: 'claude-code',
      displayName: 'Claude Code',
      dirName: '.claude',
      workspaceRoot: path.join(cwd, 'project'),
    };
  }

  // OpenCode
  if (env.OPENCODE) {
    const opencodeDirName = process.platform === 'win32'
      ? path.join('.config', 'opencode')
      : '.opencode';
    return {
      tool: 'opencode',
      displayName: 'OpenCode',
      dirName: opencodeDirName,
      workspaceRoot: path.join(cwd, 'project'),
    };
  }

  // Cursor
  if (env.CURSOR_TRACE_ID || (env.VSCODE_GIT_ASKPASS_NODE || '').includes('Cursor')) {
    return {
      tool: 'cursor',
      displayName: 'Cursor',
      dirName: '.cursor',
      workspaceRoot: path.join(cwd, 'project'),
    };
  }

  // Aone Copilot
  if (env.TERM_PROGRAM === 'vscode' && fs.existsSync(path.join(home, '.aone_copilot'))) {
    return {
      tool: 'aone-copilot',
      displayName: 'Aone Copilot',
      dirName: '.aone_copilot',
      workspaceRoot: path.join(cwd, 'project'),
    };
  }

  return null;
}

/**
 * 解析悟空工作区根目录。
 * @param {string} agentWorkRoot
 * @returns {string}
 */
function resolveWukongWorkspaceRoot(agentWorkRoot) {
  if (!agentWorkRoot) {
    return path.join(os.homedir(), '.real', 'workspace');
  }

  const candidates = [
    agentWorkRoot,
    path.join(agentWorkRoot, 'project'),
    path.join(agentWorkRoot, 'workspace'),
    path.join(agentWorkRoot, 'workspace', 'project'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'config.json'))) {
      return candidate;
    }
  }

  return agentWorkRoot;
}

/**
 * 获取悟空环境的 node bin 目录路径。
 * @returns {string|null}
 */
function getWukongNodeBinDir() {
  const activeTool = detectActiveTool();
  if (activeTool && activeTool.tool === 'wukong') {
    const wukongBin = path.join(os.homedir(), '.real', '.bin', 'node', 'bin');
    if (fs.existsSync(wukongBin)) {
      return wukongBin;
    }
  }
  return null;
}

/**
 * 获取当前环境应使用的 npm 可执行文件路径。
 * @returns {string}
 */
function getNpmExecutable() {
  const wukongBin = getWukongNodeBinDir();
  if (wukongBin) {
    const npmName = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npmPath = path.join(wukongBin, npmName);
    if (fs.existsSync(npmPath)) {
      return npmPath;
    }
  }
  return 'npm';
}

/**
 * 获取当前环境应使用的 node 可执行文件路径。
 * @returns {string}
 */
function getNodeExecutable() {
  const wukongBin = getWukongNodeBinDir();
  if (wukongBin) {
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodePath = path.join(wukongBin, nodeName);
    if (fs.existsSync(nodePath)) {
      return nodePath;
    }
  }
  return 'node';
}

/**
 * 查找项目根目录（project 工作区）。
 *
 * 查找策略：
 *   1. 通过 __dirname 相对路径定位（lib/core → 项目根）
 *   2. 检查 .cookies.json 是否存在（标识项目根）
 *   3. 通过环境变量检测当前活跃的 AI 工具
 *   4. 兜底：返回 process.cwd()
 *
 * @returns {string} 项目根目录的绝对路径
 */
function findProjectRoot() {
  // lib/core/utils.js → ../.. = 项目根
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
  if (fs.existsSync(path.join(PROJECT_ROOT, '.cookies.json'))) {
    return PROJECT_ROOT;
  }

  const activeTool = detectActiveTool();

  if (activeTool) {
    if (fs.existsSync(activeTool.workspaceRoot)) {
      return activeTool.workspaceRoot;
    }
  }

  return PROJECT_ROOT;
}

// ── Cookie 解析 ───────────────────────────────────────

/**
 * 从 Cookie 列表中提取 csrf_token、corp_id、user_id。
 *
 * 国内宜搭（aliwork.com）：corpId/userId 合并写在 `tianshu_corp_user` 里，
 * 形如 `${corpId}_${userId}`，按最后一个下划线切分。
 *
 * 海外 YiDA（yidaapps.com）：不写 `tianshu_corp_user`，而是单独写 `corp_id` cookie
 * 存放 corpId 明文；userId 加密在 `pub_uid` 里客户端无法解密，留 null 接受。
 *
 * @param {Array} cookies
 * @returns {{ csrfToken: string|null, corpId: string|null, userId: string|null }}
 */
function extractInfoFromCookies(cookies) {
  let csrfToken = null;
  let corpId = null;
  let userId = null;

  for (const cookie of cookies) {
    if (cookie.name === 'tianshu_csrf_token') {
      csrfToken = cookie.value;
    } else if (cookie.name === 'tianshu_corp_user') {
      const lastUnderscore = cookie.value.lastIndexOf('_');
      if (lastUnderscore > 0) {
        corpId = cookie.value.slice(0, lastUnderscore);
        userId = cookie.value.slice(lastUnderscore + 1);
      }
    }
  }

  if (!corpId) {
    const corpCookie = cookies.find((c) => c && c.name === 'corp_id' && c.value);
    if (corpCookie) {
      corpId = corpCookie.value;
    }
  }

  return { csrfToken, corpId, userId };
}

// ── 登录态缓存读取 ────────────────────────────────────

/**
 * 读取登录态缓存。
 *
 * 简化版（无多环境管理）：优先读取项目根 `.cookies.json`，
 * 若不存在则兼容 `.cache/cookies.json`。
 *
 * @param {string} [projectRoot]
 * @param {string} [defaultBaseUrl]
 * @returns {object|null}
 */
function loadCookieData(projectRoot, defaultBaseUrl) {
  const root = projectRoot || findProjectRoot();
  const fallbackBaseUrl = defaultBaseUrl || DEFAULT_BASE_URL;

  const rootCookieFile = path.join(root, '.cookies.json');
  const legacyCookieFile = path.join(root, '.cache', 'cookies.json');

  const cookieFile = fs.existsSync(rootCookieFile)
    ? rootCookieFile
    : (fs.existsSync(legacyCookieFile) ? legacyCookieFile : null);

  if (!cookieFile || !fs.existsSync(cookieFile)) {return null;}

  try {
    const raw = fs.readFileSync(cookieFile, 'utf-8').trim();
    if (!raw) {return null;}

    const parsed = JSON.parse(raw);
    let cookieData;

    if (Array.isArray(parsed)) {
      cookieData = { cookies: parsed, base_url: fallbackBaseUrl };
    } else {
      cookieData = parsed;
    }

    if (cookieData.cookies && cookieData.cookies.length > 0) {
      const { csrfToken, corpId, userId } = extractInfoFromCookies(cookieData.cookies);
      if (csrfToken) {cookieData.csrf_token = csrfToken;}
      if (corpId) {cookieData.corp_id = corpId;}
      if (userId) {cookieData.user_id = userId;}
    }

    return cookieData;
  } catch {
    return null;
  }
}

// ── 响应检测 ──────────────────────────────────────────

/**
 * 检测响应体是否表示登录过期。
 * @param {object} responseJson
 * @returns {boolean}
 */
function isLoginExpired(responseJson) {
  return (
    responseJson &&
    responseJson.success === false &&
    (responseJson.errorCode === '307' || responseJson.errorCode === '302')
  );
}

/**
 * 检测响应体是否表示 csrf_token 过期。
 * @param {object} responseJson
 * @returns {boolean}
 */
function isCsrfTokenExpired(responseJson) {
  return (
    responseJson &&
    responseJson.success === false &&
    responseJson.errorCode === 'TIANSHU_000030'
  );
}

// ── base_url 解析 ─────────────────────────────────────

/**
 * 从 cookieData 中解析 base_url（简化版，无多环境管理）。
 *
 * 优先级（高 → 低）：
 *   1. YEQIU_YIDA_ENDPOINT 环境变量
 *   2. cookieData.base_url（历史兼容，含专属域名）
 *   3. defaultBaseUrl 参数 / 公有云兜底
 *
 * @param {object} cookieData
 * @param {string} [defaultBaseUrl]
 * @returns {string}
 */
function resolveBaseUrl(cookieData, defaultBaseUrl) {
  // 优先级 1：环境变量强制指定
  if (process.env.YEQIU_YIDA_ENDPOINT) {
    return process.env.YEQIU_YIDA_ENDPOINT.replace(/\/+$/, '');
  }

  // 优先级 2：cookieData.base_url
  if (cookieData && cookieData.base_url) {
    return cookieData.base_url.replace(/\/+$/, '');
  }

  // 优先级 3：参数 / 默认值
  return (defaultBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

// ── Cookie 安全加固（Phase 2）──────────────────────────

/**
 * 需要脱敏的 Cookie 名称集合
 */
const SENSITIVE_COOKIE_NAMES = new Set([
  'tianshu_csrf_token',
  'csrf_token',
  '_csrf_token',
  'session',
  'token',
  'access_token',
  'refresh_token',
]);

/**
 * Cookie 脱敏：敏感值只显示前 16 位
 *
 * 对 CSRF Token、session、token 等敏感 Cookie 的值进行脱敏，
 * 日志和输出中不再显示完整认证信息。
 *
 * @param {Array} cookies - Cookie 列表
 * @param {number} [visibleLength=16] - 敏感值可见长度
 * @returns {Array} 脱敏后的 Cookie 列表（浅拷贝）
 */
function maskCookieValues(cookies, visibleLength = 16) {
  if (!Array.isArray(cookies)) return [];

  return cookies.map(cookie => {
    const masked = { ...cookie };

    if (SENSITIVE_COOKIE_NAMES.has(cookie.name) && typeof cookie.value === 'string') {
      const val = cookie.value;
      if (val.length > visibleLength) {
        masked.value = val.substring(0, visibleLength) + '...';
      } else {
        masked.value = '***';
      }
    }

    return masked;
  });
}

/**
 * 脱敏单个 Cookie 值
 *
 * @param {string} name - Cookie 名称
 * @param {string} value - Cookie 值
 * @param {number} [visibleLength=16] - 敏感值可见长度
 * @returns {string} 脱敏后的值
 */
function maskSingleCookie(name, value, visibleLength = 16) {
  if (!SENSITIVE_COOKIE_NAMES.has(name)) {
    return value;
  }
  if (typeof value !== 'string' || value.length <= visibleLength) {
    return '***';
  }
  return value.substring(0, visibleLength) + '...';
}

/**
 * 路径安全校验
 *
 * 防止 null-byte 注入和路径遍历攻击。
 *
 * @param {string} filePath - 待校验的文件路径
 * @returns {{ safe: boolean, reason: string }}
 */
function isPathSafe(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { safe: false, reason: '路径为空或非字符串' };
  }

  // 检查 null-byte 注入
  if (filePath.includes('\0')) {
    return { safe: false, reason: '路径包含 null-byte 字符' };
  }

  // 检查路径遍历（仅对相对路径生效，绝对路径允许 .. 但需规范化后检查）
  const normalized = path.resolve(filePath);

  // 检查规范化后的路径是否在合理范围内（不穿越到根目录以外）
  // 对于 Windows，根目录为驱动器根；对于 Unix，根目录为 /
  const root = path.parse(normalized).root;
  if (!normalized.startsWith(root)) {
    return { safe: false, reason: '路径遍历到根目录以外' };
  }

  // 检查路径中不包含可疑字符
  const suspiciousChars = /[\x00-\x1f\x7f]/;
  if (suspiciousChars.test(filePath)) {
    return { safe: false, reason: '路径包含控制字符' };
  }

  return { safe: true, reason: 'OK' };
}

/**
 * 安全化文件权限
 *
 * 在 Linux/Mac 上设置 chmod 600（仅所有者可读写），
 * 在 Windows 上使用 ACL 限制访问权限（尽力而为，失败不阻塞）。
 *
 * @param {string} filePath - 文件路径
 * @returns {{ success: boolean, platform: string, method: string, detail?: string }}
 */
function secureFilePermissions(filePath) {
  const platform = process.platform;

  // 先校验路径安全
  const pathCheck = isPathSafe(filePath);
  if (!pathCheck.safe) {
    return {
      success: false,
      platform,
      method: 'path-check',
      detail: `路径不安全: ${pathCheck.reason}`,
    };
  }

  if (platform === 'win32') {
    // Windows: 使用 icacls 设置 ACL（限制为当前用户）
    try {
      const { execSync } = require('child_process');
      const username = process.env.USERNAME || process.env.USER || '';

      if (username) {
        // 移除继承权限，仅保留当前用户
        execSync(`icacls "${filePath}" /inheritance:r /grant:r "${username}:(R,W)"`, {
          stdio: 'pipe',
          timeout: 5000,
          windowsHide: true,
        });
        return {
          success: true,
          platform: 'win32',
          method: 'icacls',
          detail: `ACL 设置为仅 ${username} 可读写`,
        };
      }
      return {
        success: false,
        platform: 'win32',
        method: 'icacls',
        detail: '无法确定当前用户名',
      };
    } catch (err) {
      // Windows ACL 设置失败不阻塞操作，仅记录
      return {
        success: false,
        platform: 'win32',
        method: 'icacls',
        detail: `ACL 设置失败: ${err.message}`,
      };
    }
  } else {
    // Linux/Mac: chmod 600
    try {
      fs.chmodSync(filePath, 0o600);
      return {
        success: true,
        platform: 'linux',
        method: 'chmod',
        detail: '权限设置为 600',
      };
    } catch (err) {
      return {
        success: false,
        platform: 'linux',
        method: 'chmod',
        detail: `chmod 失败: ${err.message}`,
      };
    }
  }
}

/**
 * 检测 Playwright 是否可用（Phase 6 新增）
 *
 * Playwright 是可选依赖（optionalDependencies），
 * 安装时使用 --no-optional 可跳过。此函数供脚本检测
 * Playwright 是否已安装，以便决定是否降级到 CDP 等替代方案。
 *
 * @returns {{ available: boolean, version: string|null, error: string|null }}
 */
function isPlaywrightAvailable() {
  try {
    const pw = require('playwright');
    return {
      available: true,
      version: pw.version || 'unknown',
      error: null,
    };
  } catch (err) {
    return {
      available: false,
      version: null,
      error: err.code === 'MODULE_NOT_FOUND'
        ? 'Playwright 未安装（可选依赖）。降级方案：CDP 登录 / 环境变量注入 / 二维码登录'
        : err.message,
    };
  }
}

module.exports = {
  detectActiveTool,
  findProjectRoot,
  extractInfoFromCookies,
  loadCookieData,
  resolveBaseUrl,
  isLoginExpired,
  isCsrfTokenExpired,
  getWukongNodeBinDir,
  getNpmExecutable,
  getNodeExecutable,
  resolveWukongWorkspaceRoot,
  DEFAULT_BASE_URL,
  // Cookie 安全加固（Phase 2）
  maskCookieValues,
  maskSingleCookie,
  isPathSafe,
  secureFilePermissions,
  SENSITIVE_COOKIE_NAMES,
  // Playwright 可用性检测（Phase 6）
  isPlaywrightAvailable,
};
