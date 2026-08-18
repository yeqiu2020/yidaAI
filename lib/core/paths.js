/**
 * lib/core/paths.js — 路径解析唯一入口（完整版）
 *
 * 阶段二任务 2.1：补全全部导出函数，新增 Cookie 智能查找逻辑。
 *
 * Cookie 解析优先级（取代旧的 __dirname 上溯 4 层）：
 *   1. 环境变量 YIDA_HELPER_HOME 指向的目录下的 .cookies.json
 *   2. ~/.yida-ai-helper/.cookies.json（全局共享）
 *   3. 兼容回退：process.cwd() 下 .cookies.json（老项目不断档）
 *
 * 规格来源：改造方案文档第 6.4 节
 *
 * 创建日期：2026-08-17 (阶段一)
 * 版本：1.0.0 (阶段二完整版)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 基础路径 ───────────────────────────────────────────

/**
 * 用户主目录
 * @returns {string}
 */
function homeDir() {
  return os.homedir();
}

/**
 * 全局数据目录
 * 优先级：env.YIDA_HELPER_HOME > ~/.yida-ai-helper
 * @returns {string}
 */
function dataDir() {
  if (process.env.YIDA_HELPER_HOME) {
    return process.env.YIDA_HELPER_HOME;
  }
  return path.join(homeDir(), '.yida-ai-helper');
}

/**
 * 全局 Cookie 文件路径
 * @returns {string}
 */
function cookieFile() {
  return path.join(dataDir(), '.cookies.json');
}

/**
 * 全局配置文件路径
 * @returns {string}
 */
function configFile() {
  return path.join(dataDir(), 'config.json');
}

/**
 * 本包安装根目录
 * lib/core/paths.js → ../.. = 包根
 * @returns {string}
 */
function packageRoot() {
  return path.resolve(__dirname, '..', '..');
}

/**
 * 包内 skills 源目录
 * 开发模式回退：包根/skills 不存在时回退到 包根/.agents/skills
 * @returns {string}
 */
function skillsSource() {
  const primary = path.join(packageRoot(), 'skills');
  if (fs.existsSync(primary)) return primary;
  // 开发模式回退
  const fallback = path.join(packageRoot(), '.agents', 'skills');
  return fallback;
}

/**
 * 项目数据文件解析：在 cwd 下找，找不到再找 dataDir
 * @param {string} name - 文件名（如 '组织及应用信息.md'）
 * @returns {string|null} 找到则返回绝对路径，否则 null
 */
function resolveDataFile(name) {
  if (!name) return null;

  // 1. 当前工作目录
  const cwdFile = path.join(process.cwd(), name);
  if (fs.existsSync(cwdFile)) {
    return cwdFile;
  }

  // 2. 全局数据目录
  const dataFile = path.join(dataDir(), name);
  if (fs.existsSync(dataFile)) {
    return dataFile;
  }

  return null;
}

/**
 * 项目目录（工作目录）
 * 优先级：显式参数 > 环境变量 > cwd
 * @param {string} [explicit] - 显式指定的路径
 * @returns {string}
 */
function projectDir(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.YIDA_HELPER_PROJECT_DIR) return path.resolve(process.env.YIDA_HELPER_PROJECT_DIR);
  return process.cwd();
}

// ── Cookie 智能查找（取代 __dirname 上溯 4 层）──────────

/**
 * 查找实际可用的 Cookie 文件路径。
 *
 * 优先级（高 → 低）：
 *   1. 环境变量 YIDA_HELPER_HOME 指向的目录下的 .cookies.json
 *   2. ~/.yida-ai-helper/.cookies.json（全局共享）
 *   3. process.cwd() 下 .cookies.json（老项目兼容回退）
 *   4. process.cwd() 下 .cache/cookies.json（更老的格式兼容）
 *
 * @returns {string|null} 找到则返回绝对路径，否则 null
 */
function findCookieFile() {
  // 1 & 2: 全局 Cookie（cookieFile() 已含 env 优先级）
  const globalCookie = cookieFile();
  if (fs.existsSync(globalCookie)) {
    return globalCookie;
  }

  // 3: 当前工作目录 .cookies.json（老项目兼容）
  const cwdCookie = path.join(process.cwd(), '.cookies.json');
  if (fs.existsSync(cwdCookie)) {
    return cwdCookie;
  }

  // 4: .cache/cookies.json（更老的格式兼容）
  const legacyCookie = path.join(process.cwd(), '.cache', 'cookies.json');
  if (fs.existsSync(legacyCookie)) {
    return legacyCookie;
  }

  return null;
}

/**
 * 读取 Cookie 文件内容并解析为对象。
 *
 * @returns {object|null} Cookie 数据对象，找不到文件则返回 null
 */
function loadCookieData() {
  const cookiePath = findCookieFile();
  if (!cookiePath) return null;

  try {
    const raw = fs.readFileSync(cookiePath, 'utf-8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // 兼容数组格式（裸 Cookie 列表）
    if (Array.isArray(parsed)) {
      return { cookies: parsed };
    }

    return parsed;
  } catch {
    return null;
  }
}

module.exports = {
  // 基础路径
  homeDir,
  dataDir,
  cookieFile,
  configFile,
  packageRoot,
  skillsSource,
  resolveDataFile,
  projectDir,
  // Cookie 智能查找（阶段二新增）
  findCookieFile,
  loadCookieData,
};
