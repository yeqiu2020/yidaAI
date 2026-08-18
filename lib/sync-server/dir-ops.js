/**
 * lib/sync-server/dir-ops.js — 目录操作模块
 *
 * Phase 6-2: 从 sync_server.js 抽取的目录查找和配置检测函数。
 * 实现与原 sync_server.js 完全一致，仅调整了 require 路径。
 *
 * 创建日期：2026-07-10 (Phase 6)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { hasSystemConfig, normalizeDirPath, escapeRegExp, log, CONFIG_FILE } = require('./utils');

const SCAN_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.idea',
  '.vscode',
  '.agents',
  'temp',
  'temp-file'
]);
const CONFIG_SCAN_CACHE_TTL_MS = 30000;
let configScanCache = {
  rootDir: '',
  expiresAt: 0,
  dirs: []
};

function findDirByFileUrl(fileUrl) {
  if (!fileUrl) return null;

  // 处理 file:// 协议
  if (fileUrl.startsWith('file:///')) {
    const filePath = decodeURIComponent(fileUrl.replace('file:///', '')).replace(/\//g, '\\');
    let currentDir = path.dirname(filePath);
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      if (hasSystemConfig(currentDir)) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    return null;
  }

  // 处理 HTTP 协议（如 http://127.0.0.1:8080/叶秋功能测试/01需求梳理/原型页面/index.html）
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    try {
      const parsedUrl = new URL(fileUrl);
      // 提取路径部分，去掉开头的 /
      const urlPath = decodeURIComponent(parsedUrl.pathname).replace(/^\//, '');
      // URL路径格式: 叶秋功能测试/01需求梳理/原型页面/index.html
      // 项目目录名就是第一个路径段
      const segments = urlPath.split('/').filter(s => s.length > 0);
      if (segments.length > 0) {
        const projectName = segments[0];
        const candidateDir = path.join(process.cwd(), projectName);
        if (hasSystemConfig(candidateDir)) {
          return candidateDir;
        }
      }
    } catch (_) {
      // URL 解析失败，忽略
    }
  }

  return null;
}

function collectConfigDirs(rootDir, maxDepth = 4) {
  const results = [];

  function walk(currentDir, depth) {
    if (depth > maxDepth) return;
    if (!fs.existsSync(currentDir)) return;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SCAN_IGNORE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (hasSystemConfig(fullPath)) {
        results.push(fullPath);
      }
      walk(fullPath, depth + 1);
    }
  }

  if (hasSystemConfig(rootDir)) {
    results.push(rootDir);
  }
  walk(rootDir, 0);
  return Array.from(new Set(results));
}

function getConfigDirsCached(rootDir) {
  const now = Date.now();
  if (
    configScanCache.rootDir === rootDir &&
    configScanCache.expiresAt > now &&
    Array.isArray(configScanCache.dirs) &&
    configScanCache.dirs.length > 0
  ) {
    return configScanCache.dirs;
  }

  const dirs = collectConfigDirs(rootDir, 4);
  configScanCache = {
    rootDir,
    expiresAt: now + CONFIG_SCAN_CACHE_TTL_MS,
    dirs
  };
  return dirs;
}

function configContainsForm(dirPath, formName) {
  if (!dirPath || !formName) return false;
  const configPath = path.join(dirPath, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return false;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const formPattern = new RegExp(`\\|\\s*\\d+\\s*\\|\\s*${escapeRegExp(formName)}\\s*[「【（(]`);
    return formPattern.test(content) || content.includes(formName);
  } catch (_) {
    return false;
  }
}

/**
 * 判断目录是否为"项目目录"（多组织并存模式下，项目目录 = 含 组织及应用信息.md 的目录）
 * @param {string} dirPath
 * @returns {boolean}
 */
function hasOrgConfig(dirPath) {
  if (!dirPath) return false;
  return fs.existsSync(path.join(dirPath, '组织及应用信息.md'));
}

/**
 * 列出静态根下的所有项目目录（每个含 组织及应用信息.md 的子目录即一个项目）
 * @param {string} staticRoot
 * @returns {string[]}
 */
function listProjectDirs(staticRoot) {
  if (!fs.existsSync(staticRoot)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(staticRoot, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SCAN_IGNORE_DIRS.has(e.name))
    .map(e => path.join(staticRoot, e.name))
    .filter(hasOrgConfig);
}

/**
 * 从 HTTP URL / referer 反推项目目录：取 URL 路径第一段作为项目名，拼接到静态根下
 * @param {string} referer - 例如 http://127.0.0.1:8080/V2.0.23/某应用/... 
 * @param {string} staticRoot
 * @returns {string|null}
 */
function projectDirFromReferer(referer, staticRoot) {
  if (!referer) return null;
  try {
    const parsedUrl = new URL(referer);
    const urlPath = decodeURIComponent(parsedUrl.pathname).replace(/^\//, '');
    const segments = urlPath.split('/').filter(s => s.length > 0);
    if (segments.length > 0) {
      const candidate = path.join(staticRoot, segments[0]);
      if (hasOrgConfig(candidate)) {
        return normalizeDirPath(candidate);
      }
    }
  } catch (_) {}
  return null;
}

/**
 * 解析请求对应的"项目目录"（多组织并存核心）。
 * 优先级：显式 projectDir 参数 > referer 反推 > 静态根下唯一项目 > cwd 本身。
 * 返回含 组织及应用信息.md 的绝对路径；无法确定时返回 null。
 *
 * 兼容性说明：
 *  - 多组织模式：cwd = 静态根（父目录），项目目录是其子目录；
 *  - 单项目模式：cwd = 项目目录本身（含 组织及应用信息.md），直接回退到 cwd。
 * @param {object} req - HTTP 请求对象（用于取 referer）
 * @param {object} payload - { projectDir, staticRoot }
 * @returns {string|null}
 */
function resolveProjectDir(req, payload = {}) {
  const staticRoot = payload.staticRoot || process.cwd();

  // 1) 显式 projectDir 优先（绝对路径或相对静态根的路径）
  if (payload.projectDir) {
    const abs = normalizeDirPath(payload.projectDir);
    if (path.isAbsolute(abs)) {
      if (hasOrgConfig(abs)) return abs;
    } else {
      const candidate = path.join(staticRoot, abs);
      if (hasOrgConfig(candidate)) return normalizeDirPath(candidate);
    }
    log(`传入的 projectDir 无效: ${payload.projectDir}，尝试其他方式`, 'yellow');
  }

  // 2) referer 反推
  const fromReferer = projectDirFromReferer(req.headers.referer || '', staticRoot);
  if (fromReferer) return fromReferer;

  // 3) 静态根下唯一项目时兜底
  const projects = listProjectDirs(staticRoot);
  if (projects.length === 1) {
    return projects[0];
  }

  // 4) 兼容单项目模式：cwd 本身就是项目目录（含 组织及应用信息.md）
  if (hasOrgConfig(staticRoot)) {
    return normalizeDirPath(staticRoot);
  }

  log(`无法确定项目目录。referer=${req.headers.referer || '-'}`, 'yellow');
  return null;
}

function findProjectDir(req, payload = {}) {
  // 从请求头中获取来源页面路径
  const referer = req.headers.referer || '';
  const origin = req.headers.origin || '';
  const formName = payload.formName || '';
  const candidates = [];

  // 1) 前端显式传入项目目录（最高优先级）
  // v2.7.1 修复：支持传入相对路径（如 '进销存5'），自动拼接为绝对路径
  // 如果传入了 projectDir，直接用它，不再扫描其他目录（避免匹配到错误的应用）
  if (payload.projectDir) {
    // 尝试作为绝对路径
    if (hasSystemConfig(payload.projectDir)) {
      return normalizeDirPath(payload.projectDir);
    }
    // 尝试作为相对路径（相对于工作目录）
    const absoluteDir = path.join(process.cwd(), payload.projectDir);
    if (hasSystemConfig(absoluteDir)) {
      return normalizeDirPath(absoluteDir);
    }
    // 如果传入的 projectDir 无效，记录警告但继续尝试其他方式
    log(`传入的 projectDir 无效: ${payload.projectDir}，尝试其他方式查找`, 'yellow');
  }

  // 2) file:// 页面可直接从 URL 反推目录
  const dirFromReferer = findDirByFileUrl(referer);
  if (dirFromReferer) {
    candidates.push(dirFromReferer);
  }

  const dirFromPageUrl = findDirByFileUrl(payload.pageUrl || '');
  if (dirFromPageUrl) {
    candidates.push(dirFromPageUrl);
  }

  // 3) 从服务进程工作目录向下扫描
  const cwd = process.cwd();
  const scannedDirs = getConfigDirsCached(cwd);
  candidates.push(...scannedDirs);

  // 4) 兼容历史固定目录（已移除硬编码，由步骤3的向下扫描自动发现）

  const uniqueCandidates = Array.from(new Set(candidates)).filter(hasSystemConfig);
  if (uniqueCandidates.length === 0) {
    log(`未找到任何包含 ${CONFIG_FILE} 的目录。referer=${referer || '-'}, origin=${origin || '-'}`, 'yellow');
    return null;
  }

  // 优先选择"系统配置清单里包含当前表单名"的目录
  const matchedByForm = uniqueCandidates.find((dir) => configContainsForm(dir, formName));
  if (matchedByForm) {
    return matchedByForm;
  }

  // 否则回退到第一个候选
  return uniqueCandidates[0];
}

module.exports = {
  findDirByFileUrl,
  collectConfigDirs,
  getConfigDirsCached,
  configContainsForm,
  findProjectDir,
  hasOrgConfig,
  listProjectDirs,
  projectDirFromReferer,
  resolveProjectDir,
  SCAN_IGNORE_DIRS,
  CONFIG_SCAN_CACHE_TTL_MS,
};
