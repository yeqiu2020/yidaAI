#!/usr/bin/env node
/**
 * 本地同步服务
 * 提供HTTP接口供原型页面调用，实现单个表单同步
 * 
 * 启动: node sync_server.js
 * 端口: 默认3457（可通过环境变量 SYNC_SERVICE_PORT 覆盖）
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PORT = parseInt(process.env.SYNC_SERVICE_PORT || '3457', 10);
const SERVER_VERSION = '2.2.0';
const CONFIG_FILE = '系统配置清单.md';
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

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 查找项目目录
 * 根据请求中的referer或origin推断项目路径
 */
function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDirPath(dirPath) {
  if (!dirPath) return '';
  const raw = String(dirPath);
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  })();
  return decoded.replace(/\//g, '\\').replace(/\\+$/, '');
}

function hasSystemConfig(dirPath) {
  if (!dirPath) return false;
  const decoded = normalizeDirPath(dirPath);

  const candidates = Array.from(new Set([
    decoded,
    decoded.replace(/\//g, '\\'),
    decoded.replace(/\\/g, '/')
  ]));

  return candidates.some((candidateDir) => {
    const configPath = path.join(candidateDir, CONFIG_FILE);
    return fs.existsSync(configPath);
  });
}

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

function findProjectDir(req, payload = {}) {
  // 从请求头中获取来源页面路径
  const referer = req.headers.referer || '';
  const origin = req.headers.origin || '';
  const formName = payload.formName || '';
  const candidates = [];

  // 1) 前端显式传入项目目录（最高优先级）
  if (payload.projectDir && hasSystemConfig(payload.projectDir)) {
    candidates.push(normalizeDirPath(payload.projectDir));
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

  // 优先选择“系统配置清单里包含当前表单名”的目录
  const matchedByForm = uniqueCandidates.find((dir) => configContainsForm(dir, formName));
  if (matchedByForm) {
    return matchedByForm;
  }

  // 否则回退到第一个候选
  return uniqueCandidates[0];
}

/**
 * 从系统配置清单读取应用信息和表单列表
 */
function readSystemConfig(projectDir) {
  const configPath = path.join(projectDir, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');

    // 提取应用名称
    let appName = '未知应用';
    const appNameMatch = content.match(/\|\s*\*\*应用名称\*\*\s*\|\s*([^|\n]+)/);
    if (appNameMatch) {
      appName = appNameMatch[1].trim();
    }

    // 提取应用ID
    let appId = null;
    const appIdMatch = content.match(/\|\s*\*\*(应用ID|应用编码)\*\*\s*\|\s*`?(APP_[A-Z0-9]+)`?/i);
    if (appIdMatch) {
      appId = appIdMatch[2];
    }
    if (!appId) {
      const fallbackMatch = content.match(/\b(APP_[A-Z0-9]+)\b/);
      if (fallbackMatch) appId = fallbackMatch[1];
    }

    // 提取表单列表（新格式：| 1 | 名称「类型」 | FORM-XXX |）
    const forms = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.includes('「')) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          const nameMatch = cells[1].match(/^(.+?)「(.+?)」/);
          if (nameMatch) {
            forms.push({
              name: nameMatch[1].trim(),
              type: nameMatch[2].trim(),
              uuid: cells[2].trim()
            });
          }
        }
      }
    }

    return { appName, appId, forms };
  } catch (e) {
    log(`读取系统配置清单失败: ${e.message}`, 'red');
    return null;
  }
}

/**
 * 检查本地表单是否已存在且内容完整（组件ID清单中有字段）
 */
function checkLocalFormExists(projectDir, formName, formType) {
  const expectedDirName = `${formName}「${formType}」`;

  // 递归搜索表单目录
  function findFormDir(currentDir, depth) {
    if (depth > 2) return null;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return null;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (entry.name === expectedDirName) return path.join(currentDir, entry.name);
      const found = findFormDir(path.join(currentDir, entry.name), depth + 1);
      if (found) return found;
    }
    return null;
  }

  const formDir = findFormDir(projectDir, 0);
  if (!formDir) return false;

  // 检查组件ID清单是否有实际字段内容
  const componentListPath = path.join(formDir, '组件ID清单.md');
  if (fs.existsSync(componentListPath)) {
    const content = fs.readFileSync(componentListPath, 'utf-8');
    // 如果组件ID清单中有实际的数据行（序号 | 类型 | 名称 | ID），认为内容完整
    const hasFieldRows = /\|\s*\d+\s*\|.*\|.*\|.*\|/.test(content);
    if (hasFieldRows) return true;
  }

  // 目录存在但内容为空，视为不存在（需要重新同步）
  log(`表单目录存在但内容为空，需要重新同步: ${formName}`, 'yellow');
  return false;
}

/**
 * 查找本地多余的表单目录（在宜搭中已删除但本地仍存在的）
 * @param {string} projectDir - 项目根目录
 * @param {Array} remoteForms - 宜搭中的表单列表 [{name, type}]
 * @returns {Array} 需要删除的本地表单目录路径列表
 */
function findLocalOrphanForms(projectDir, remoteForms) {
  // 构建宜搭表单目录名集合
  const remoteDirNames = new Set();
  for (const form of remoteForms) {
    remoteDirNames.add(`${form.name}「${form.type}」`);
  }

  const orphanDirs = [];

  // 递归搜索本地表单目录
  function walk(currentDir, depth) {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      // 跳过非表单目录（不以「」结尾的目录不是表单目录）
      if (!entry.name.includes('「') || !entry.name.endsWith('」')) {
        // 继续向下搜索
        walk(path.join(currentDir, entry.name), depth + 1);
        continue;
      }
      // 这是一个表单目录，检查是否在宜搭中还存在
      if (!remoteDirNames.has(entry.name)) {
        orphanDirs.push({
          dirName: entry.name,
          fullPath: path.join(currentDir, entry.name)
        });
      }
    }
  }

  walk(projectDir, 0);
  return orphanDirs;
}

/**
 * 执行同步脚本
 */
function executeSync(projectDir, formName) {
  return new Promise((resolve, reject) => {
    const syncScript = path.join(__dirname, 'sync_single_form.js');
    
    if (!fs.existsSync(syncScript)) {
      reject(new Error('同步脚本不存在'));
      return;
    }
    
    log(`执行同步: ${formName}`, 'cyan');
    log(`项目目录: ${projectDir}`, 'cyan');
    
    // 使用 spawn + 参数数组，避免 Windows 下中文参数编码问题
    const child = spawn(process.execPath, [syncScript, projectDir, formName], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      log(`同步失败: ${error.message}`, 'red');
      reject(error);
    });

    child.on('close', (code) => {
      // 解析输出中的JSON结果
      const parseResultFromText = (text) => {
        const lines = String(text || '').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              return JSON.parse(trimmed);
            } catch (e) {
              // continue
            }
          }
        }
        return null;
      };

      const resultFromStdout = parseResultFromText(stdout);
      const resultFromStderr = parseResultFromText(stderr);
      const result = resultFromStdout || resultFromStderr;

      if (code !== 0) {
        log(`同步失败: exit code ${code}`, 'red');
        if (result && result.error) {
          reject(new Error(result.error));
          return;
        }
        const mergedMessage = (stderr || stdout || `同步失败，退出码: ${code}`).toString().trim();
        reject(new Error(mergedMessage));
        return;
      }

      if (result) {
        resolve(result);
      } else {
        resolve({ success: true, message: '同步完成' });
      }
    });
  });
}

/**
 * 执行表单列表同步脚本（从宜搭获取最新表单列表并更新配置文件）
 */
function executeFormListSync(projectDir) {
  return new Promise((resolve, reject) => {
    const syncScript = path.join(__dirname, '..', '..', 'yida-config-sync', 'scripts', 'sync_form_list_playwright.js');
    
    if (!fs.existsSync(syncScript)) {
      reject(new Error('表单列表同步脚本不存在: ' + syncScript));
      return;
    }
    
    log(`执行表单列表同步: ${projectDir}`, 'cyan');
    
    const child = spawn(process.execPath, [syncScript, projectDir], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      log(`表单列表同步失败: ${error.message}`, 'red');
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const mergedMessage = (stderr || stdout || `表单列表同步失败，退出码: ${code}`).toString().trim();
        log(`表单列表同步失败: ${mergedMessage}`, 'red');
        reject(new Error(mergedMessage));
        return;
      }
      log('表单列表同步完成', 'green');
      resolve({ success: true, output: stdout });
    });
  });
}

/**
 * 重新生成 form-config.js（当表单列表发生变化时调用）
 * 只重新生成 form-config.js，不重新生成整个原型页面
 */
function regenerateFormConfigJs(projectDir) {
  return new Promise((resolve, reject) => {
    const fieldListPath = path.join(projectDir, '01需求梳理', '字段清单.md');
    if (!fs.existsSync(fieldListPath)) {
      log('字段清单不存在，无法更新 form-config.js', 'yellow');
      resolve({ success: false, skipped: true, message: '字段清单不存在' });
      return;
    }

    const generatorScript = path.join(__dirname, '..', '..', 'form-to-prototype', 'scripts', 'prototype_generator.js');
    if (!fs.existsSync(generatorScript)) {
      log('原型页面生成器脚本不存在', 'red');
      resolve({ success: false, skipped: true, message: '生成器脚本不存在' });
      return;
    }

    const outputDir = path.join(projectDir, '01需求梳理', '原型页面');
    const formConfigPath = path.join(outputDir, 'js', 'form-config.js');

    // 使用 --form-config-only 参数仅重新生成 form-config.js
    log(`调用 prototype_generator.js --form-config-only...`, 'cyan');
    const child = spawn(process.execPath, [generatorScript, fieldListPath, outputDir, '--form-config-only'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      log(`更新 form-config.js 失败: ${error.message}`, 'red');
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const mergedMessage = (stderr || stdout || `退出码: ${code}`).toString().trim();
        log(`更新 form-config.js 失败: ${mergedMessage}`, 'red');
        reject(new Error(mergedMessage));
        return;
      }

      if (fs.existsSync(formConfigPath)) {
        log(`form-config.js 已重新生成`, 'green');
        resolve({ success: true, skipped: false, message: 'form-config.js 已更新' });
      } else {
        log(`form-config.js 重新生成后未检测到文件`, 'yellow');
        resolve({ success: false, skipped: false, message: 'form-config.js 未生成' });
      }
    });
  });
}

/**
 * 生成原型页面（如果尚未存在）
 * 同步完成后自动调用 form-to-prototype 生成器
 */
function generatePrototypePages(projectDir, formListChanged = false) {
  return new Promise((resolve, reject) => {
    // 检查原型页面是否已存在
    const prototypeIndex = path.join(projectDir, '01需求梳理', '原型页面', 'index.html');
    if (fs.existsSync(prototypeIndex)) {
      // 原型页面已存在，但表单列表发生变化时需要重新生成 form-config.js
      if (formListChanged) {
        log('表单列表发生变化，重新生成 form-config.js...', 'cyan');
        regenerateFormConfigJs(projectDir)
          .then(result => resolve(result))
          .catch(err => resolve({ success: false, skipped: true, message: '更新form-config.js失败: ' + err.message }));
        return;
      }
      log('原型页面已存在，跳过生成', 'green');
      resolve({ success: true, skipped: true, message: '原型页面已存在' });
      return;
    }

    // 检查字段清单是否存在
    const fieldListPath = path.join(projectDir, '01需求梳理', '字段清单.md');
    if (!fs.existsSync(fieldListPath)) {
      log('字段清单不存在，无法生成原型页面', 'yellow');
      resolve({ success: false, skipped: true, message: '字段清单不存在' });
      return;
    }

    // 调用 prototype_generator.js 生成原型页面
    const generatorScript = path.join(__dirname, '..', '..', 'form-to-prototype', 'scripts', 'prototype_generator.js');
    if (!fs.existsSync(generatorScript)) {
      log('原型页面生成器脚本不存在: ' + generatorScript, 'red');
      resolve({ success: false, skipped: true, message: '生成器脚本不存在' });
      return;
    }

    const outputDir = path.join(projectDir, '01需求梳理', '原型页面');

    log(`正在生成原型页面...`, 'cyan');
    log(`字段清单: ${fieldListPath}`, 'cyan');
    log(`输出目录: ${outputDir}`, 'cyan');

    const child = spawn(process.execPath, [generatorScript, fieldListPath, outputDir], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      log(`原型页面生成失败: ${error.message}`, 'red');
      resolve({ success: false, skipped: false, error: error.message });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const mergedMessage = (stderr || stdout || `退出码: ${code}`).toString().trim();
        log(`原型页面生成失败: ${mergedMessage}`, 'red');
        resolve({ success: false, skipped: false, error: mergedMessage });
        return;
      }

      // 验证是否生成了 index.html
      if (fs.existsSync(prototypeIndex)) {
        log(`原型页面生成成功!`, 'green');
        resolve({ success: true, skipped: false, message: '原型页面生成成功' });
      } else {
        log(`原型页面生成后未检测到 index.html，可能生成不完整`, 'yellow');
        resolve({ success: true, skipped: false, message: '生成可能不完整，请检查' });
      }
    });
  });
}

/**
 * 创建HTTP服务器
 */
const server = http.createServer(async (req, res) => {
  // 设置CORS头，允许本地文件访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url, true);
  
  // 健康检查接口
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      time: new Date().toISOString(),
      version: SERVER_VERSION,
      cwd: process.cwd(),
      script: __filename
    }));
    return;
  }
  
  // 应用信息接口（支持 GET 带 query 和 POST 带 body）
  if (parsedUrl.pathname === '/app-info') {
    try {
      // 支持从查询参数传入 projectDir（GET）
      const payload = {};
      if (parsedUrl.query && parsedUrl.query.projectDir) {
        payload.projectDir = parsedUrl.query.projectDir;
      }

      // 如果是 POST，从 body 读取 pageUrl
      if (req.method === 'POST') {
        let body = '';
        await new Promise((resolve) => {
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', resolve);
        });
        try {
          const data = JSON.parse(body);
          if (data.pageUrl) payload.pageUrl = data.pageUrl;
          if (data.projectDir) payload.projectDir = data.projectDir;
        } catch (_) {}
      }

      const projectDir = findProjectDir(req, payload);
      if (!projectDir) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '无法确定项目目录' }));
        return;
      }

      const config = readSystemConfig(projectDir);
      if (!config) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: '读取系统配置清单失败' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        appName: config.appName,
        appId: config.appId,
        formCount: config.forms.length
      }));
    } catch (error) {
      log(`处理请求失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // 同步应用接口 - 只同步本地没有的新增表单
  if (parsedUrl.pathname === '/sync-app' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        // 查找项目目录
        const projectDir = findProjectDir(req, data);

        if (!projectDir) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: '无法确定项目目录，请确保系统配置清单.md存在',
            debug: {
              version: SERVER_VERSION,
              cwd: process.cwd(),
              pageUrl: data.pageUrl || '',
              projectDir: data.projectDir || '',
              referer: req.headers.referer || '',
              origin: req.headers.origin || ''
            }
          }));
          return;
        }

        log(`收到同步应用请求: ${projectDir}`, 'yellow');

        // 第一步：从宜搭获取最新表单列表并更新配置文件
        log('正在从宜搭获取最新表单列表...', 'cyan');
        try {
          await executeFormListSync(projectDir);
          log('表单列表已更新', 'green');
        } catch (listError) {
          log(`获取表单列表失败: ${listError.message}`, 'red');
          res.writeHead(500);
          res.end(JSON.stringify({
            success: false,
            error: '从宜搭获取表单列表失败：' + listError.message
          }));
          return;
        }

        // 第二步：读取更新后的系统配置清单
        const config = readSystemConfig(projectDir);
        if (!config || !config.forms || config.forms.length === 0) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '系统配置清单中没有表单数据' }));
          return;
        }

        log(`当前配置中共 ${config.forms.length} 个表单`, 'cyan');

        // 第三步：筛选本地不存在的表单
        const newForms = [];
        const existingForms = [];
        for (const form of config.forms) {
          if (checkLocalFormExists(projectDir, form.name, form.type)) {
            existingForms.push(form.name);
          } else {
            newForms.push(form);
          }
        }

        log(`已有表单: ${existingForms.length}个, 新增表单: ${newForms.length}个`, 'cyan');

        // 第三步-B：查找本地多余的表单（宜搭中已删除的）
        const orphanForms = findLocalOrphanForms(projectDir, config.forms);
        log(`本地多余表单: ${orphanForms.length}个`, 'cyan');

        // 如果没有新增表单也没有多余表单，直接返回
        if (newForms.length === 0 && orphanForms.length === 0) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: '所有表单已同步，没有新增或删除的表单',
            appName: config.appName,
            totalForms: config.forms.length,
            existingForms: existingForms.length,
            newForms: 0,
            syncedForms: [],
            deletedForms: [],
            details: []
          }));
          return;
        }

        // 第四步：同步新增表单
        const syncedForms = [];
        const failedForms = [];

        for (const form of newForms) {
          try {
            log(`开始同步新增表单: ${form.name}`, 'cyan');
            const result = await executeSync(projectDir, form.name);
            syncedForms.push(form.name);
            log(`同步成功: ${form.name}`, 'green');
          } catch (error) {
            log(`同步失败: ${form.name} - ${error.message}`, 'red');
            failedForms.push({ name: form.name, error: error.message });
          }
        }

        // 第五步：删除本地多余的表单目录
        const deletedForms = [];
        const deleteFailedForms = [];

        for (const orphan of orphanForms) {
          try {
            log(`删除本地多余表单: ${orphan.dirName}`, 'yellow');
            fs.rmSync(orphan.fullPath, { recursive: true, force: true });
            deletedForms.push(orphan.dirName);
            log(`已删除: ${orphan.dirName}`, 'green');
          } catch (error) {
            log(`删除失败: ${orphan.dirName} - ${error.message}`, 'red');
            deleteFailedForms.push({ name: orphan.dirName, error: error.message });
          }
        }

        // 第五步-B：从字段清单.md中移除已删除的表单章节
        if (deletedForms.length > 0) {
          const fieldListPath = path.join(projectDir, '01需求梳理', '字段清单.md');
          if (fs.existsSync(fieldListPath)) {
            try {
              let fieldListContent = fs.readFileSync(fieldListPath, 'utf-8');
              for (const dirName of deletedForms) {
                // 提取表单名称（如 "AI写公式演示「普通表单」" → "AI写公式演示"）
                const nameMatch = dirName.match(/^(.+?)「/);
                if (nameMatch) {
                  const formName = nameMatch[1];
                  // 匹配 ### (序号) 表单名「类型」 开头的章节，直到下一个 ### 或 ## 或文件末尾
                  const sectionRegex = new RegExp(
                    `\\n###\\s*\\([^)]*\\)\\s*${formName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}「[^」]*」[\\s\\S]*?(?=\\n###\\s|\\n##\\s|$)`,
                    'g'
                  );
                  fieldListContent = fieldListContent.replace(sectionRegex, '');
                  log(`已从字段清单移除: ${formName}`, 'green');
                }
              }
              fs.writeFileSync(fieldListPath, fieldListContent, 'utf-8');
            } catch (error) {
              log(`更新字段清单失败: ${error.message}`, 'yellow');
            }
          }
        }

        // 第六步：检查并生成原型页面（如果尚未存在）
        let prototypeResult = null;
        try {
          const formListChanged = newForms.length > 0 || deletedForms.length > 0;
          prototypeResult = await generatePrototypePages(projectDir, formListChanged);
          if (prototypeResult && prototypeResult.success && !prototypeResult.skipped) {
            log(`原型页面已生成: ${prototypeResult.message}`, 'green');
          }
        } catch (protoError) {
          log(`原型页面生成出错: ${protoError.message}`, 'yellow');
          prototypeResult = { success: false, skipped: false, error: protoError.message };
        }

        // 构建结果消息
        const parts = [];
        if (syncedForms.length > 0) parts.push(`新增 ${syncedForms.length} 个表单`);
        if (deletedForms.length > 0) parts.push(`删除 ${deletedForms.length} 个本地多余表单`);
        if (failedForms.length > 0) parts.push(`${failedForms.length} 个同步失败`);
        if (deleteFailedForms.length > 0) parts.push(`${deleteFailedForms.length} 个删除失败`);
        if (prototypeResult && prototypeResult.success && !prototypeResult.skipped) parts.push(`原型页面已自动生成`);
        if (prototypeResult && prototypeResult.error) parts.push(`原型页面生成失败: ${prototypeResult.error}`);

        const needRefresh = syncedForms.length > 0 || deletedForms.length > 0 ||
          (prototypeResult && prototypeResult.success && !prototypeResult.skipped);

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: parts.length > 0 ? `同步完成！${parts.join('，')}` : '同步完成',
          appName: config.appName,
          totalForms: config.forms.length,
          existingForms: existingForms.length,
          newForms: newForms.length,
          syncedForms: syncedForms,
          failedForms: failedForms,
          deletedForms: deletedForms,
          deleteFailedForms: deleteFailedForms,
          prototypeGenerated: prototypeResult ? !prototypeResult.skipped : false,
          needRefresh: needRefresh
        }));

      } catch (error) {
        log(`处理请求失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // 同步表单接口
  if (parsedUrl.pathname === '/sync-form' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const formName = data.formName;

        if (!formName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少表单名称参数' }));
          return;
        }

        // 查找项目目录
        const projectDir = findProjectDir(req, data);

        if (!projectDir) {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            error: '无法确定项目目录，请确保系统配置清单.md存在',
            debug: {
              version: SERVER_VERSION,
              cwd: process.cwd(),
              formName: formName || '',
              pageUrl: data.pageUrl || '',
              projectDir: data.projectDir || '',
              referer: req.headers.referer || '',
              origin: req.headers.origin || ''
            }
          }));
          return;
        }

        log(`收到同步请求: ${formName}`, 'yellow');

        // 执行同步
        const result = await executeSync(projectDir, formName);

        res.writeHead(200);
        res.end(JSON.stringify(result));

      } catch (error) {
        log(`处理请求失败: ${error.message}`, 'red');
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ success: false, error: '接口不存在' }));
});

// 启动服务器
server.listen(PORT, () => {
  log('='.repeat(60), 'green');
  log('宜搭表单同步服务已启动', 'green');
  log('='.repeat(60), 'green');
  log(`服务地址: http://localhost:${PORT}`, 'cyan');
  log('可用接口:', 'cyan');
  log(`  - GET  http://localhost:${PORT}/health    健康检查`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/app-info  应用信息`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-app  同步应用（只同步新增表单）`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-form 同步单个表单`, 'cyan');
  log('='.repeat(60), 'green');
  log('按 Ctrl+C 停止服务', 'yellow');
  log('='.repeat(60), 'green');
});

// 优雅退出
process.on('SIGINT', () => {
  log('\n正在停止服务...', 'yellow');
  server.close(() => {
    log('服务已停止', 'green');
    process.exit(0);
  });
});
