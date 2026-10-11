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

// v3.0.8 项目根降级：含「组织及应用信息.md」的目录是项目根（org-init 仅在项目根生成，
// 应用目录不会有此文件），不应被识别为应用目录。历史事故（2026-08-21/22）：项目根残留
// 系统配置清单.md（课程录制）后被当应用目录返回，导致 /app-info 报错应用、同步误定位。
// 旧版单应用布局（项目根=应用目录）通过「降级为兜底候选」保持兼容，而非一刀切排除。
function isProjectRootDir(dirPath) {
  if (!dirPath) return false;
  try {
    return fs.existsSync(path.join(dirPath, '组织及应用信息.md'));
  } catch (_) {
    return false;
  }
}

function findDirByFileUrl(fileUrl) {
  if (!fileUrl) return null;

  // 处理 file:// 协议
  if (fileUrl.startsWith('file:///')) {
    const filePath = decodeURIComponent(fileUrl.replace('file:///', '')).replace(/\//g, '\\');
    let currentDir = path.dirname(filePath);
    let rootFallback = null; // v3.0.8: 项目根候选降级为兜底
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      if (hasSystemConfig(currentDir)) {
        if (isProjectRootDir(currentDir)) {
          if (!rootFallback) rootFallback = currentDir;
        } else {
          return currentDir; // 应用目录，立即返回
        }
      }
      currentDir = path.dirname(currentDir);
    }
    return rootFallback;
  }

  // 处理 HTTP 协议（如 http://127.0.0.1:8080/叶秋功能测试/01需求梳理/原型页面/index.html）
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    try {
      const parsedUrl = new URL(fileUrl);
      // 提取路径部分，去掉开头的 /
      const urlPath = decodeURIComponent(parsedUrl.pathname).replace(/^\//, '');
      // 兼容两种 URL 布局（v3.0.2 修复，此前只支持单项目布局导致 /app-info 返回错误应用名）：
      //  - 单项目布局: /{应用名}/01需求梳理/... → 第一段即应用目录
      //  - 多项目布局: /{项目名}/{应用名}/01需求梳理/... → 需逐级累积路径段尝试
      const segments = urlPath.split('/').filter(s => s.length > 0);
      // v3.0.5 修复：逐级累积时取「最深」的匹配目录。
      // 多项目布局下项目根（如 .../宜搭AI助手V2.0.30）本身也含系统配置清单，
      // 旧逻辑在 i=1 命中项目根即返回，导致 /app-info 返回错误应用（如"课程录制"）。
      // v3.0.8 修复：项目根候选（含组织及应用信息.md）降级为兜底，仅当无应用目录候选时返回，
      // 兼容旧版单应用布局（项目根=应用目录）。
      let best = null;
      let rootFallback = null;
      for (let i = 1; i <= Math.min(segments.length, 3); i++) {
        const candidateDir = path.join(process.cwd(), ...segments.slice(0, i));
        if (!hasSystemConfig(candidateDir)) continue;
        if (isProjectRootDir(candidateDir)) {
          if (!rootFallback) rootFallback = candidateDir;
        } else {
          best = candidateDir;
        }
      }
      if (best) return best;
      return rootFallback;
    } catch (_) {
      // URL 解析失败，忽略
    }
  }

  return null;
}

// v3.0.5：从 pageUrl/referer 提取「项目名」段（首段是 staticRoot 下含组织及应用信息.md 的目录时）
function urlProjectSegment(url, staticRoot) {
  try {
    if (!url || !/^https?:\/\//.test(url)) return null;
    const urlPath = decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
    const segments = urlPath.split('/').filter(s => s.length > 0);
    if (segments.length >= 2 && hasOrgConfig(path.join(staticRoot, segments[0]))) {
      return segments[0];
    }
  } catch (_) {
    // ignore
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
  // v3.0.1: 未初始化项目（缺少 组织及应用信息.md）但目录存在时也返回，
  // 让前端能显示"初始化组织信息"按钮及加载提示词等数据
  if (payload.projectDir) {
    const abs = normalizeDirPath(payload.projectDir);
    if (path.isAbsolute(abs)) {
      if (hasOrgConfig(abs)) return abs;
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs;
    } else {
      // v3.0.9 修复：单项目模式（服务在项目根内启动，staticRoot 本身就是项目根）下，
      // path.join(staticRoot, '{项目名}') 会多套一层不存在的路径，旧逻辑随即放弃并
      // 回退到 referer/唯一项目，日志刷出大量「传入的 projectDir 无效: XXX」噪音；
      // 若缓存了旧 referer 还可能定位到错误项目。补两级兜底：
      //   a) staticRoot 自身即项目根（hasOrgConfig(staticRoot)）；
      //   b) 传入的项目名与 staticRoot 的末段目录名一致。
      const candidate = path.join(staticRoot, abs);
      if (hasOrgConfig(candidate)) return normalizeDirPath(candidate);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return normalizeDirPath(candidate);
      if (hasOrgConfig(staticRoot) && path.basename(staticRoot) === abs) {
        return normalizeDirPath(staticRoot);
      }
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

  // 4) 兼容单项目模式：cwd 本身就是项目目录（含 组织及应用信息.md）；
  //    项目尚未初始化（无组织及应用信息.md）但含 .agents 时同样按项目根处理，
  //    保证首次「初始化组织信息」能定位到项目根
  if (hasOrgConfig(staticRoot) || fs.existsSync(path.join(staticRoot, '.agents'))) {
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
  // v3.0.5 修复两个事故级 bug：
  //  a) 旧逻辑返回「相对路径」（如 '宜搭AI助手V2.0.30'），executeSync 又以该相对路径作为
  //     子进程 cwd，子进程 path.resolve 后拼出重复路径（...\宜搭AI助手V2.0.30\宜搭AI助手V2.0.30），
  //     报"系统配置清单不存在"。现一律返回 path.resolve 后的绝对路径。
  //  b) 多项目布局（/{项目名}/{应用名}/...）下未尝试 staticRoot/{项目名}/{应用名}，
  //     导致依赖兜底扫描匹配到错误项目（如 V2.0.28 的同名应用）。现优先用 pageUrl
  //     首段项目名精确定位，多候选时用表单名消歧。
  if (payload.projectDir) {
    const decoded = normalizeDirPath(String(payload.projectDir));
    const cwd = process.cwd();
    const projectCandidates = [];
    if (path.isAbsolute(decoded)) {
      projectCandidates.push(decoded);
    } else {
      // 多项目布局：staticRoot/{pageUrl首段项目名}/{应用目录名}
      const projSeg = urlProjectSegment(payload.pageUrl || '', cwd) ||
        urlProjectSegment(referer, cwd);
      if (projSeg) {
        projectCandidates.push(path.join(cwd, projSeg, decoded));
      }
      // 其余项目下的同名应用目录（无 pageUrl 时兜底）
      for (const proj of listProjectDirs(cwd)) {
        projectCandidates.push(path.join(proj, decoded));
      }
      // 单项目布局兼容：cwd/{应用目录名}
      projectCandidates.push(path.join(cwd, decoded));
      // 兜底：直接传项目名（如 '宜搭AI助手V2.0.30'）→ 项目根
      projectCandidates.push(decoded);
    }
    const seen = new Set();
    const withConfig = projectCandidates.filter((c) => {
      const key = path.resolve(c);
      if (seen.has(key)) return false;
      seen.add(key);
      return hasSystemConfig(c);
    });
    if (withConfig.length > 0) {
      // 多个同名应用目录（如 V2.0.28/进销存2 与 V2.0.30/进销存2）时按表单名消歧
      const matchedByForm = formName
        ? withConfig.find((d) => configContainsForm(d, formName))
        : null;
      const resolved = path.resolve(matchedByForm || withConfig[0]);
      // v3.0.6 修复：projectDir 误传「项目根目录名」（如浏览器缓存旧版 app.js 发来
      // '宜搭AI助手V2.0.30'）时会静默命中项目根的系统配置清单（如"课程录制"），
      // 不报错但同步到错误应用，比报错更隐蔽。pageUrl（浏览器实际页面地址）比
      // projectDir 可靠，若其解析出 resolved 之下更深的应用目录，以 pageUrl 为准。
      const pageUrlDir = findDirByFileUrl(payload.pageUrl || '') || findDirByFileUrl(referer);
      if (
        pageUrlDir &&
        pageUrlDir !== resolved &&
        pageUrlDir.startsWith(resolved + path.sep)
      ) {
        log(`projectDir 命中 ${resolved}，但 pageUrl 指向更深的应用目录，改用 ${pageUrlDir}`, 'yellow');
        return pageUrlDir;
      }
      return resolved;
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

  // v3.0.8：项目根候选（含组织及应用信息.md）沉底，避免其作为 matchedByForm/
  // uniqueCandidates[0] 兜底胜出（残留清单曾让项目根冒充"课程录制"应用目录）。
  // sort 稳定，非项目根候选保持原相对顺序；项目根仅在前者全部不匹配时兜底。
  uniqueCandidates.sort((a, b) => (isProjectRootDir(a) ? 1 : 0) - (isProjectRootDir(b) ? 1 : 0));

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
