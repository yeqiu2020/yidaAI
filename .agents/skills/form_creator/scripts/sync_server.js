#!/usr/bin/env node
/**
 * 本地同步服务
 * 提供HTTP接口供原型页面调用，实现单个表单同步
 *
 * 启动: node sync_server.js
 * 端口: 默认3457（可通过环境变量 SYNC_SERVICE_PORT 覆盖）
 *
 * v2.5.0: 新增备份数据接口
 * - POST /backup-app-data: 备份应用数据
 *
 * v2.4.0: 新增8个API端点
 * - POST /sync-config: 同步应用配置
 * - POST /sync-schema: 同步表单Schema
 * - POST /sync-rules: 同步业务规则
 * - POST /project-sync: 一站式同步
 * - POST /clean-data: 清空表单数据
 * - POST /generate-system-map: 生成系统图谱
 * - POST /form-settings: 表单设置
 * - POST /flow-settings: 流程设置
 * - GET /local-files: 读取本地文件
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PORT = parseInt(process.env.SYNC_SERVICE_PORT || '3457', 10);
const SERVER_VERSION = '2.5.0';
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

// Skills 目录和项目根目录
const SKILLS_DIR = path.join(__dirname, '..', '..');
const PROJECT_ROOT = process.cwd();

// 脚本路径映射
const SCRIPTS = {
  configSync: path.join(SKILLS_DIR, 'yida-config-sync', 'scripts', 'sync_all_configs.js'),
  schemaSync: path.join(SKILLS_DIR, 'yida-get-schema', 'scripts', 'sync-schema.js'),
  ruleSync: path.join(SKILLS_DIR, 'yida-rule-sync', 'scripts', 'sync_rules.js'),
  projectSync: path.join(SKILLS_DIR, 'yida-project-sync', 'scripts', 'sync_project.js'),
  dataClean: path.join(SKILLS_DIR, 'data-clean', 'scripts', 'clear-form-data.js'),
  dataBackup: path.join(SKILLS_DIR, 'data-backup', 'scripts', 'backup-app-data.js'),
  systemMap: path.join(SKILLS_DIR, 'yida-system-map', 'scripts', 'generate_map.js'),
  formSettings: path.join(SKILLS_DIR, 'form-settings', 'scripts', 'form-settings.js'),
  flowSettings: path.join(SKILLS_DIR, 'flow-settings', 'scripts', 'flow-settings.js'),
  projectCreator: path.join(SKILLS_DIR, 'project-creator', 'scripts', 'create-project.js'),
};

/**
 * 通用脚本执行辅助函数
 * @param {string} scriptPath - 脚本绝对路径
 * @param {string[]} args - 命令行参数数组
 * @returns {Promise<string>} 脚本 stdout 输出
 */
function runScript(scriptPath, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout));
    });
    child.on('error', reject);
    // 可配置超时，默认60秒
    setTimeout(() => { child.kill(); reject(new Error('执行超时')); }, timeout);
  });
}

/**
 * 去除 Markdown 转义字符
 * Markdown 中下划线 _ 会被转义为 \_，需要还原
 */
function unescapeMarkdown(str) {
  if (!str) return str;
  return str.replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, '$1');
}

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
 * 将新应用添加到组织及应用信息.md的应用列表中
 * @param {string} appName - 应用名称
 * @param {string} appId - 应用ID，默认为'待创建'
 */
function addAppToOrgConfig(appName, appId = '待创建') {
  const orgConfigPath = path.join(PROJECT_ROOT, '组织及应用信息.md');
  if (!fs.existsSync(orgConfigPath)) {
    log('组织及应用信息.md 不存在，跳过注册新应用', 'yellow');
    return false;
  }

  try {
    let content = fs.readFileSync(orgConfigPath, 'utf-8');

    // 检查应用是否已存在
    const appExists = content.includes(`| ${appName} |`);
    if (appExists) {
      log(`应用【${appName}】已在组织信息中，跳过`, 'yellow');
      return false;
    }

    // 查找应用列表表格，获取最大序号
    const lines = content.split('\n');
    let appTableEndIndex = -1;
    let maxNum = 0;
    let inAppTable = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.includes('应用名称') && trimmed.includes('应用ID')) {
        inAppTable = true;
        continue;
      }
      if (inAppTable) {
        if (trimmed.startsWith('|') && !trimmed.startsWith('|--') && !trimmed.startsWith('| ---')) {
          const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
          if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
            maxNum = Math.max(maxNum, parseInt(cells[0], 10));
          }
        } else if (!trimmed.startsWith('|')) {
          appTableEndIndex = i;
          inAppTable = false;
        }
      }
    }

    // 如果表格在文件末尾
    if (inAppTable && appTableEndIndex === -1) {
      appTableEndIndex = lines.length;
    }

    if (appTableEndIndex === -1) {
      log('未找到应用列表表格，跳过注册', 'yellow');
      return false;
    }

    // 插入新行
    const newNum = maxNum + 1;
    const newRow = `| ${newNum} | ${appName} | ${appId} |`;
    lines.splice(appTableEndIndex, 0, newRow);

    fs.writeFileSync(orgConfigPath, lines.join('\n'), 'utf-8');
    log(`应用【${appName}】已注册到组织信息（序号 ${newNum}）`, 'green');
    return true;
  } catch (error) {
    log(`注册应用到组织信息失败: ${error.message}`, 'red');
    return false;
  }
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

    // 提取应用ID（兼容 Markdown 转义：APP\_XXX → APP_XXX）
    let appId = null;
    const appIdMatch = content.match(/\|\s*\*\*(应用ID|应用编码)\*\*\s*\|\s*`?(APP(?:\\?_)[A-Z0-9]+)`?/i);
    if (appIdMatch) {
      appId = unescapeMarkdown(appIdMatch[2]);
    }
    if (!appId) {
      const fallbackMatch = content.match(/\b(APP(?:\\?_)[A-Z0-9]+)\b/);
      if (fallbackMatch) appId = unescapeMarkdown(fallbackMatch[1]);
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

  // ========== 组织门户 API ==========

  /**
   * 获取组织信息及应用列表（含同步状态）
   * GET /org-info
   */
  if (parsedUrl.pathname === '/org-info') {
    try {
      const orgInfoPath = path.join(process.cwd(), '组织及应用信息.md');
      if (!fs.existsSync(orgInfoPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '组织及应用信息.md 不存在' }));
        return;
      }

      const content = fs.readFileSync(orgInfoPath, 'utf-8');

      // 解析组织信息
      const orgInfo = {};
      const orgNameMatch = content.match(/\|\s*组织名称\s*\|\s*([^|\n]+)/);
      if (orgNameMatch) orgInfo.orgName = orgNameMatch[1].trim();
      const domainMatch = content.match(/\|\s*域名前缀\s*\|\s*([^|\n]+)/);
      if (domainMatch) orgInfo.domainPrefix = domainMatch[1].trim();
      const fullDomainMatch = content.match(/\|\s*完整域名\s*\|\s*([^|\n]+)/);
      if (fullDomainMatch) orgInfo.fullDomain = fullDomainMatch[1].trim();
      const corpIdMatch = content.match(/\|\s*corpId\s*\|\s*([^|\n]+)/);
      if (corpIdMatch) orgInfo.corpId = corpIdMatch[1].trim();
      const corpNameMatch = content.match(/\|\s*corp名称\s*\|\s*([^|\n]+)/);
      if (corpNameMatch) orgInfo.corpName = corpNameMatch[1].trim();

      // 解析应用列表
      const apps = [];
      const lines = content.split('\n');
      let inAppTable = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('应用名称') && trimmed.includes('应用ID')) {
          inAppTable = true;
          continue;
        }
        if (inAppTable) {
          if (trimmed.startsWith('|') && !trimmed.startsWith('|--') && !trimmed.startsWith('| ---')) {
            const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
            if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
              const appName = cells[1];
              const appId = unescapeMarkdown(cells[2]);
              // 检查同步状态
              const appDir = path.join(process.cwd(), appName);
              const configPath = path.join(appDir, CONFIG_FILE);
              const prototypePath = path.join(appDir, '01需求梳理', '原型页面', 'index.html');
              const isSynced = fs.existsSync(configPath);
              const hasPrototype = fs.existsSync(prototypePath);

              apps.push({
                name: appName,
                appId: appId,
                synced: isSynced,
                hasPrototype: hasPrototype,
                prototypeUrl: hasPrototype ? `http://127.0.0.1:8080/${encodeURIComponent(appName)}/01需求梳理/原型页面/index.html` : null
              });
            }
          } else if (!trimmed.startsWith('|')) {
            inAppTable = false;
          }
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        orgInfo,
        apps,
        totalApps: apps.length,
        syncedApps: apps.filter(a => a.synced).length
      }));
    } catch (error) {
      log(`获取组织信息失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  /**
   * 同步应用到本地
   * POST /sync-app-to-local
   * Body: { appName: "xxx", appId: "APP_XXX" }
   */
  if (parsedUrl.pathname === '/sync-app-to-local' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName, appId } = data;

        if (!appName || !appId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少应用名称或应用ID' }));
          return;
        }

        log(`收到同步应用到本地请求: ${appName} (${appId})`, 'yellow');

        const projectDir = path.join(process.cwd(), appName);
        const syncScript = path.join(__dirname, '..', '..', 'yida-config-sync', 'scripts', 'sync_all_configs.js');

        if (!fs.existsSync(syncScript)) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: '同步脚本不存在: ' + syncScript }));
          return;
        }

        // 确保项目目录存在
        if (!fs.existsSync(projectDir)) {
          fs.mkdirSync(projectDir, { recursive: true });
        }

        log(`执行同步: node ${syncScript} "${projectDir}" "${appId}" "${appName}"`, 'cyan');

        const child = spawn(process.execPath, [syncScript, projectDir, appId, appName], {
          cwd: process.cwd(),
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
          log(`同步应用失败: ${error.message}`, 'red');
          // 尝试发送错误响应（可能已发送）
          try {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: error.message }));
          } catch (_) {}
        });

        child.on('close', (code) => {
          if (code !== 0) {
            const errorMsg = (stderr || stdout || `退出码: ${code}`).toString().trim();
            log(`同步应用失败: ${errorMsg}`, 'red');
            try {
              res.writeHead(500);
              res.end(JSON.stringify({ success: false, error: errorMsg }));
            } catch (_) {}
            return;
          }

          log(`同步应用成功: ${appName}`, 'green');

          // 更新组织及应用信息.md中的原型页面地址
          try {
            const serverMgr = path.join(__dirname, '..', '..', 'yida-server-manager', 'scripts', 'server_manager.js');
            if (fs.existsSync(serverMgr)) {
              spawn(process.execPath, [serverMgr, 'update-org'], {
                cwd: process.cwd(),
                detached: true,
                stdio: ['ignore', 'ignore', 'ignore'],
                windowsHide: true
              }).unref();
            }
          } catch (_) {}

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: `应用【${appName}】同步完成`,
            appName,
            appId
          }));
        });
      } catch (error) {
        log(`处理请求失败: ${error.message}`, 'red');
        try {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: error.message }));
        } catch (_) {}
      }
    });
    return;
  }

  /**
   * 备份应用数据
   * POST /backup-app-data
   * Body: { appName: "xxx", appId: "APP_XXX" }
   */
  if (parsedUrl.pathname === '/backup-app-data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName, appId, format = 'json' } = data;

        if (!appName || !appId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少应用名称或应用ID' }));
          return;
        }

        if (!['json', 'excel'].includes(format)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '格式参数错误，仅支持 json 或 excel' }));
          return;
        }

        log(`收到备份应用数据请求: ${appName} (${appId}) [${format}]`, 'yellow');

        const backupScript = SCRIPTS.dataBackup;
        if (!fs.existsSync(backupScript)) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: '备份脚本不存在: ' + backupScript }));
          return;
        }

        log(`执行备份: node ${backupScript} "${appId}" "${appName}" "${format}"`, 'cyan');

        const child = spawn(process.execPath, [backupScript, appId, appName, format], {
          cwd: process.cwd(),
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
          log(`备份应用数据失败: ${error.message}`, 'red');
          try {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: error.message }));
          } catch (_) {}
        });

        child.on('close', (code) => {
          if (code !== 0) {
            const errorMsg = (stderr || stdout || `退出码: ${code}`).toString().trim();
            log(`备份应用数据失败: ${errorMsg}`, 'red');
            try {
              res.writeHead(500);
              res.end(JSON.stringify({ success: false, error: errorMsg }));
            } catch (_) {}
            return;
          }

          log(`备份应用数据成功: ${appName}`, 'green');

          // 尝试从stdout最后一行解析JSON结果
          let resultData = {};
          try {
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            if (lastLine && lastLine.startsWith('{')) {
              resultData = JSON.parse(lastLine);
            }
          } catch (_) {}

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: `应用【${appName}】数据备份完成`,
            appName,
            appId,
            outputDir: resultData.outputDir || null,
            zipPath: resultData.zipPath || null,
            totalRecords: resultData.totalRecords || 0,
            totalForms: resultData.totalForms || 0
          }));
        });
      } catch (error) {
        log(`处理备份请求失败: ${error.message}`, 'red');
        try {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: error.message }));
        } catch (_) {}
      }
    });
    return;
  }

  /**
   * 获取所有应用的同步状态
   * GET /app-sync-status
   */
  if (parsedUrl.pathname === '/app-sync-status') {
    try {
      const orgInfoPath = path.join(process.cwd(), '组织及应用信息.md');
      if (!fs.existsSync(orgInfoPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '组织及应用信息.md 不存在' }));
        return;
      }

      const content = fs.readFileSync(orgInfoPath, 'utf-8');
      const apps = [];
      const lines = content.split('\n');
      let inAppTable = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('应用名称') && trimmed.includes('应用ID')) {
          inAppTable = true;
          continue;
        }
        if (inAppTable) {
          if (trimmed.startsWith('|') && !trimmed.startsWith('|--') && !trimmed.startsWith('| ---')) {
            const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
            if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
              const appName = cells[1];
              const appId = unescapeMarkdown(cells[2]);
              const appDir = path.join(process.cwd(), appName);
              const configPath = path.join(appDir, CONFIG_FILE);
              const prototypePath = path.join(appDir, '01需求梳理', '原型页面', 'index.html');
              const isSynced = fs.existsSync(configPath);
              const hasPrototype = fs.existsSync(prototypePath);

              // 读取表单数量
              let formCount = 0;
              if (isSynced) {
                try {
                  const config = readSystemConfig(appDir);
                  if (config && config.forms) formCount = config.forms.length;
                } catch (_) {}
              }

              apps.push({
                name: appName,
                appId: appId,
                synced: isSynced,
                hasPrototype: hasPrototype,
                formCount,
                prototypeUrl: hasPrototype ? `http://127.0.0.1:8080/${encodeURIComponent(appName)}/01需求梳理/原型页面/index.html` : null
              });
            }
          } else if (!trimmed.startsWith('|')) {
            inAppTable = false;
          }
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        apps,
        totalApps: apps.length,
        syncedApps: apps.filter(a => a.synced).length
      }));
    } catch (error) {
      log(`获取同步状态失败: ${error.message}`, 'red');
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // ========== 新增 API 端点 (v2.4.0) ==========

  /**
   * POST /sync-config - 同步应用配置
   * Body: { appName, appId }
   */
  if (parsedUrl.pathname === '/sync-config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName, appId } = data;
        if (!appName || !appId) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appName 或 appId 参数' }));
          return;
        }
        const projectDir = path.join(PROJECT_ROOT, appName);
        const result = await runScript(SCRIPTS.configSync, [projectDir, appId, appName], 120000); // 2分钟
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * POST /sync-schema - 同步表单Schema
   * Body: { appId, formUuid, formName, appName }
   */
  if (parsedUrl.pathname === '/sync-schema' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, formUuid, formName, appName } = data;
        if (!appId || !formUuid || !formName || !appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少必要参数 (appId, formUuid, formName, appName)' }));
          return;
        }
        const localJsonPath = path.join(PROJECT_ROOT, appName, '02基础信息', formName, formName + '.json');
        const result = await runScript(SCRIPTS.schemaSync, [appId, formUuid, localJsonPath]);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * POST /sync-rules - 同步业务规则
   * Body: { appId, appName }
   */
  if (parsedUrl.pathname === '/sync-rules' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, appName } = data;
        if (!appId || !appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 appName 参数' }));
          return;
        }
        const outputDir = path.join(PROJECT_ROOT, appName);
        const result = await runScript(SCRIPTS.ruleSync, ['--appId', appId, '--output', outputDir]);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * POST /project-sync - 一站式同步
   * Body: { appId, appName }
   */
  if (parsedUrl.pathname === '/project-sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, appName } = data;
        if (!appId || !appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 appName 参数' }));
          return;
        }
        const outputDir = path.join(PROJECT_ROOT, appName);
        const result = await runScript(SCRIPTS.projectSync, ['--appId', appId, '--output', outputDir], 300000); // 5分钟
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * POST /clean-data - 清空表单数据
   * Body: { appId, mode: 'all'|'form', formUuid, appName }
   */
  if (parsedUrl.pathname === '/clean-data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, mode, formUuid, appName } = data;
        if (!appId || !mode) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 mode 参数' }));
          return;
        }
        let args;
        if (mode === 'all') {
          args = [appId, '--all'];
          if (appName) args.push('--appName', appName);
        } else if (mode === 'form') {
          if (!formUuid) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: 'form 模式下缺少 formUuid 参数' }));
            return;
          }
          args = [appId, '--form', formUuid];
          if (appName) args.push('--appName', appName);
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'mode 必须为 all 或 form' }));
          return;
        }
        const result = await runScript(SCRIPTS.dataClean, args, 300000); // 5分钟超时
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * POST /generate-system-map - 生成系统图谱
   * Body: { appName }
   */
  if (parsedUrl.pathname === '/generate-system-map' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appName } = data;
        if (!appName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appName 参数' }));
          return;
        }
        const configPath = path.join(PROJECT_ROOT, appName, '系统配置清单.md');
        if (!fs.existsSync(configPath)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '系统配置清单.md 不存在: ' + configPath }));
          return;
        }
        const outputDir = path.join(PROJECT_ROOT, appName, '系统功能图谱');
        const result = await runScript(SCRIPTS.systemMap, [configPath, outputDir]);

        // 扫描输出目录，返回生成的图谱文件列表
        const files = [];
        if (fs.existsSync(outputDir)) {
          const entries = fs.readdirSync(outputDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile()) {
              files.push(entry.name);
            }
          }
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result, files }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * POST /form-settings - 表单设置
   * Body: { appId, formUuid, action, options }
   * action: 'get-settings'|'set-title'|'list-fields'|'set-restart'|'set-permission'
   */
  if (parsedUrl.pathname === '/form-settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, formUuid, action, options } = data;
        if (!appId || !formUuid || !action) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId, formUuid 或 action 参数' }));
          return;
        }
        const validActions = ['get-settings', 'set-title', 'list-fields', 'set-restart', 'set-permission'];
        if (!validActions.includes(action)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: `action 必须为: ${validActions.join(', ')}` }));
          return;
        }
        const args = [action, '--app', appId, '--form', formUuid];
        // 根据 action 和 options 构建额外参数
        if (options) {
          if (options.title) args.push('--title', options.title);
          if (options.field) args.push('--field', options.field);
          if (options.restart !== undefined) args.push('--restart', String(options.restart));
          if (options.permission) args.push('--permission', options.permission);
        }
        const result = await runScript(SCRIPTS.formSettings, args);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * POST /flow-settings - 流程设置
   * Body: { appId, formUuid, action, options }
   * action: 'list-flow-forms'|'get-settings'|'set-auto-approval'
   */
  if (parsedUrl.pathname === '/flow-settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { appId, formUuid, action, options } = data;
        if (!appId || !action) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 appId 或 action 参数' }));
          return;
        }
        const validActions = ['list-flow-forms', 'get-settings', 'set-auto-approval'];
        if (!validActions.includes(action)) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: `action 必须为: ${validActions.join(', ')}` }));
          return;
        }
        // list-flow-forms 只需要 appId
        const args = [action, '--app', appId];
        if (formUuid) args.push('--form', formUuid);
        // 根据 options 构建额外参数
        if (options) {
          if (options.autoApproval !== undefined) args.push('--auto-approval', String(options.autoApproval));
        }
        const result = await runScript(SCRIPTS.flowSettings, args);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  /**
   * GET /app-forms - 获取应用的表单列表（从本地系统配置清单读取）
   * Query: appName (应用名称)
   */
  if (parsedUrl.pathname === '/app-forms' && req.method === 'GET') {
    try {
      const appName = parsedUrl.query && parsedUrl.query.appName;
      if (!appName) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '缺少 appName 参数' }));
        return;
      }
      const configPath = path.join(PROJECT_ROOT, appName, '系统配置清单.md');
      if (!fs.existsSync(configPath)) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, forms: [], message: '未找到系统配置清单，请先同步应用' }));
        return;
      }
      const content = fs.readFileSync(configPath, 'utf-8');
      // 解析表单列表：匹配 | 序号 | 表单名称 | FORM-xxx | ... | 格式的行
      const forms = [];
      const lines = content.split('\n');
      for (const line of lines) {
        // 匹配包含 FORM-xxx 的表格行
        const formMatch = line.match(/\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(FORM-[\w-]+)\s*\|/);
        if (formMatch && formMatch[2] && formMatch[2].startsWith('FORM-')) {
          forms.push({ name: formMatch[1].trim(), formUuid: formMatch[2] });
        }
      }
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, forms }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  /**
   * GET /local-files - 读取本地文件内容
   * Query: file (相对路径)
   * 只允许读取 .md, .json, .js 文件，路径不能包含 '..'
   */
  if (parsedUrl.pathname === '/local-files' && req.method === 'GET') {
    try {
      const filePath = parsedUrl.query && parsedUrl.query.file;
      if (!filePath) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '缺少 file 参数' }));
        return;
      }
      // 安全检查：路径不能包含 '..'
      if (filePath.includes('..')) {
        res.writeHead(403);
        res.end(JSON.stringify({ success: false, error: '路径不允许包含 ..' }));
        return;
      }
      // 只允许读取 .md, .json, .js 文件
      const ext = path.extname(filePath).toLowerCase();
      if (!['.md', '.json', '.js'].includes(ext)) {
        res.writeHead(403);
        res.end(JSON.stringify({ success: false, error: '只允许读取 .md, .json, .js 文件' }));
        return;
      }
      const fullPath = path.join(PROJECT_ROOT, filePath);
      if (!fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: '文件不存在' }));
        return;
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: content }));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  /**
   * POST /create-project - 创建新项目
   * Body: { projectName: "xxx" }
   */
  if (parsedUrl.pathname === '/create-project' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { projectName } = data;
        if (!projectName) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: '缺少 projectName 参数' }));
          return;
        }
        if (!fs.existsSync(SCRIPTS.projectCreator)) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: 'project-creator 脚本不存在' }));
          return;
        }
        // 直接 require 调用，避免 Windows spawn 中文编码问题
        const { createProject } = require(SCRIPTS.projectCreator);
        const result = createProject(projectName);
        // 将新应用注册到组织信息
        addAppToOrgConfig(projectName, '待创建');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
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
  log(`  - GET  http://localhost:${PORT}/health            健康检查`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/app-info          应用信息`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-app          同步应用（只同步新增表单）`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-form         同步单个表单`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/org-info          组织信息及应用列表`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-app-to-local 同步应用到本地`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/app-sync-status   应用同步状态`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-config       同步应用配置`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-schema       同步表单Schema`, 'cyan');
  log(`  - POST http://localhost:${PORT}/sync-rules        同步业务规则`, 'cyan');
  log(`  - POST http://localhost:${PORT}/project-sync      一站式同步`, 'cyan');
  log(`  - POST http://localhost:${PORT}/clean-data        清空表单数据`, 'cyan');
  log(`  - POST http://localhost:${PORT}/backup-app-data   备份应用数据`, 'cyan');
  log(`  - POST http://localhost:${PORT}/generate-system-map 生成系统图谱`, 'cyan');
  log(`  - POST http://localhost:${PORT}/form-settings     表单设置`, 'cyan');
  log(`  - POST http://localhost:${PORT}/flow-settings     流程设置`, 'cyan');
  log(`  - GET  http://localhost:${PORT}/local-files       读取本地文件`, 'cyan');
  log(`  - POST http://localhost:${PORT}/create-project    创建新项目`, 'cyan');
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
