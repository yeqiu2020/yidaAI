/**
 * Node.js 环境路径修复工具
 * 版本: 1.0.0
 * 功能: 自动查找并修复 Node.js 路径问题，支持 PowerShell 7
 *
 * 使用方式:
 *   const fixNodePath = require('./fix-node-path.js');
 *   fixNodePath(); // 自动修复 Node.js 路径
 *
 *   或命令行直接运行:
 *   node fix-node-path.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 常见 Node.js 安装路径
const POSSIBLE_PATHS = [
  // 官方安装路径
  'C:\\Program Files\\nodejs',
  'C:\\Program Files (x86)\\nodejs',
  // Trae 编辑器自带
  `${process.env.USERPROFILE}\\.trae-cn\\binaries\\node\\versions\\*`,
  `${process.env.USERPROFILE}\\.trae\\binaries\\node\\versions\\*`,
  // Cursor 编辑器自带
  `${process.env.USERPROFILE}\\.cursor\\binaries\\node\\versions\\*`,
  // CodeBuddy 编辑器自带
  `${process.env.USERPROFILE}\\.codebuddy\\binaries\\node\\versions\\*`,
  // NVM 版本管理器
  `${process.env.USERPROFILE}\\.nvm\\versions\\node\\*`,
  `${process.env.USERPROFILE}\\AppData\\Roaming\\nvm`,
  'C:\\ProgramData\\nvm',
  // 其他常见路径
  `${process.env.LOCALAPPDATA}\\Programs\\nodejs`,
  `${process.env.USERPROFILE}\\nodejs`,
];

/**
 * 检测 Node.js 是否可用
 * @returns {boolean}
 */
function isNodeAvailable() {
  try {
    execSync('node -v', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取当前 Node.js 版本
 * @returns {string|null}
 */
function getNodeVersion() {
  try {
    return execSync('node -v', { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

/**
 * 查找 Node.js 安装路径
 * @returns {string|null}
 */
function findNodePath() {
  for (const pathPattern of POSSIBLE_PATHS) {
    try {
      // 处理通配符路径
      if (pathPattern.includes('*')) {
        const basePath = pathPattern.split('*')[0];
        if (!fs.existsSync(basePath)) continue;

        // 递归查找 node.exe
        const found = findNodeExeRecursive(basePath);
        if (found) return found;
      } else {
        // 直接路径检查
        const nodeExe = path.join(pathPattern, 'node.exe');
        if (fs.existsSync(nodeExe)) {
          return pathPattern;
        }
      }
    } catch (error) {
      // 忽略错误，继续查找下一个路径
      continue;
    }
  }
  return null;
}

/**
 * 递归查找 node.exe
 * @param {string} dir
 * @returns {string|null}
 */
function findNodeExeRecursive(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 递归查找子目录
        const found = findNodeExeRecursive(fullPath);
        if (found) return found;
      } else if (entry.name === 'node.exe') {
        // 找到 node.exe，返回所在目录
        return dir;
      }
    }
  } catch (error) {
    // 忽略权限错误等
  }
  return null;
}

/**
 * 临时添加 Node.js 到当前会话 PATH
 * @param {string} nodePath
 */
function addToCurrentSession(nodePath) {
  process.env.PATH = `${nodePath};${process.env.PATH}`;
}

/**
 * 永久添加 Node.js 到用户环境变量
 * @param {string} nodePath
 * @returns {boolean}
 */
function addToUserPath(nodePath) {
  try {
    // Windows 系统使用 PowerShell 命令修改用户环境变量
    const command = `[Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH', 'User') + ';${nodePath}', 'User')`;
    execSync(`powershell -Command "${command}"`, { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error('添加到用户环境变量失败:', error.message);
    return false;
  }
}

/**
 * 检测是否为 PowerShell 7
 * @returns {boolean}
 */
function isPowerShell7() {
  return process.env.PSVersionTable && process.env.PSVersionTable.includes('7.');
}

/**
 * 从系统环境变量同步 Node.js 路径到当前会话
 * @returns {string|null}
 */
function syncFromSystemPath() {
  try {
    // 获取系统 PATH
    const machinePath = execSync(
      'powershell -Command "[Environment]::GetEnvironmentVariable(\'PATH\', \'Machine\')"',
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    const userPath = execSync(
      'powershell -Command "[Environment]::GetEnvironmentVariable(\'PATH\', \'User\')"',
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();

    const fullPath = `${machinePath};${userPath}`;

    // 查找包含 node.exe 的路径
    const paths = fullPath.split(';');
    for (const p of paths) {
      const nodeExe = path.join(p, 'node.exe');
      if (fs.existsSync(nodeExe)) {
        return p;
      }
    }
  } catch (error) {
    console.error('同步系统 PATH 失败:', error.message);
  }
  return null;
}

/**
 * 主修复函数
 * @param {Object} options
 * @param {boolean} options.silent - 静默模式，不输出日志
 * @param {boolean} options.permanent - 是否永久添加到用户环境变量
 * @returns {Object} 修复结果
 */
function fixNodePath(options = {}) {
  const { silent = false, permanent = true } = options;

  const log = (msg) => {
    if (!silent) console.log(msg);
  };

  log('🔍 检查 Node.js 环境...');

  // 1. 检查 Node.js 是否已可用
  if (isNodeAvailable()) {
    const version = getNodeVersion();
    log(`✅ Node.js 已可用，版本: ${version}`);
    return {
      success: true,
      fixed: false,
      version,
      path: null,
      message: 'Node.js 已可用',
    };
  }

  log('⚠️  Node.js 命令不可用，开始自动查找...');

  // 2. 尝试从系统 PATH 同步（适用于 PowerShell 7）
  const systemNodePath = syncFromSystemPath();
  if (systemNodePath) {
    log(`🔍 从系统 PATH 找到 Node.js: ${systemNodePath}`);
    addToCurrentSession(systemNodePath);

    if (isNodeAvailable()) {
      log(`✅ Node.js 现在可用，版本: ${getNodeVersion()}`);
      return {
        success: true,
        fixed: true,
        version: getNodeVersion(),
        path: systemNodePath,
        message: '已从系统 PATH 同步 Node.js 路径',
      };
    }
  }

  // 3. 在常见路径中查找
  const foundPath = findNodePath();

  if (!foundPath) {
    log('❌ 未找到 Node.js 安装路径');
    log('📥 请访问 https://nodejs.org/ 下载并安装 Node.js LTS 版本');
    return {
      success: false,
      fixed: false,
      version: null,
      path: null,
      message: '未找到 Node.js 安装路径',
    };
  }

  log(`🔍 找到 Node.js: ${foundPath}`);

  // 4. 临时添加到当前会话
  addToCurrentSession(foundPath);
  log('✅ 已临时添加到当前会话 PATH');

  // 5. 验证是否可用
  if (!isNodeAvailable()) {
    log('❌ 添加路径后仍无法使用 Node.js');
    return {
      success: false,
      fixed: false,
      version: null,
      path: foundPath,
      message: '添加路径后仍无法使用 Node.js',
    };
  }

  const version = getNodeVersion();
  log(`✅ Node.js 现在可用，版本: ${version}`);

  // 6. 永久添加到用户环境变量
  if (permanent) {
    log('💾 正在永久添加到用户环境变量...');
    if (addToUserPath(foundPath)) {
      log('✅ 已永久添加到用户环境变量');
      log('💡 提示：新打开的终端将自动识别 Node.js');
    } else {
      log('⚠️  永久添加失败，但当前会话已可用');
    }
  }

  return {
    success: true,
    fixed: true,
    version,
    path: foundPath,
    message: permanent
      ? '已修复并永久添加到用户环境变量'
      : '已修复（当前会话）',
  };
}

// 命令行直接运行时
if (require.main === module) {
  console.log('============================================================');
  console.log('  Node.js 环境路径修复工具');
  console.log('============================================================\n');

  const result = fixNodePath({ silent: false, permanent: true });

  console.log('\n------------------------------------------------------------');
  console.log('修复结果:', result.success ? '✅ 成功' : '❌ 失败');
  console.log('详细信息:', result.message);
  if (result.version) console.log('Node版本:', result.version);
  if (result.path) console.log('安装路径:', result.path);
  console.log('------------------------------------------------------------');

  process.exit(result.success ? 0 : 1);
}

module.exports = fixNodePath;
