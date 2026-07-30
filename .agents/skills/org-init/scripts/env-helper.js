/**
 * 环境变量辅助工具 - V1.0.0
 * 自动检测并返回可用的 Node.js 路径
 * 解决环境变量未生效问题
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 可能的 Node.js 安装路径（Phase 6: Windows 默认安装路径，非业务硬编码）
const NODE_PATHS = [
  'C:\\Program Files\\nodejs\\node.exe',
  'C:\\Program Files (x86)\\nodejs\\node.exe',
  `${process.env.LOCALAPPDATA}\\Programs\\nodejs\\node.exe`,
  `${process.env.PROGRAMDATA}\\nodejs\\node.exe`,
];

/**
 * 检测 Node.js 是否可用
 * @returns {string|null} 可用的 node.exe 路径，如果不可用返回 null
 */
function findNodePath() {
  // 首先尝试直接运行 node
  try {
    execSync('node -v', { stdio: 'pipe' });
    return 'node'; // 环境变量已生效，直接使用 node
  } catch (e) {
    // 环境变量未生效，查找具体路径
  }

  // 检查常见安装路径
  for (const nodePath of NODE_PATHS) {
    if (fs.existsSync(nodePath)) {
      return nodePath;
    }
  }

  // 尝试从环境变量查找（Phase 6: Windows 系统环境变量默认值，非业务硬编码）
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  
  const additionalPaths = [
    path.join(programFiles, 'nodejs', 'node.exe'),
    path.join(programFilesX86, 'nodejs', 'node.exe'),
  ];

  for (const nodePath of additionalPaths) {
    if (fs.existsSync(nodePath)) {
      return nodePath;
    }
  }

  return null;
}

/**
 * 获取 Node.js 版本信息
 * @param {string} nodePath Node.js 路径
 * @returns {string|null} 版本号
 */
function getNodeVersion(nodePath) {
  try {
    const version = execSync(`"${nodePath}" -v`, { encoding: 'utf-8', stdio: 'pipe' });
    return version.trim();
  } catch (e) {
    return null;
  }
}

/**
 * 创建用于执行命令的包装函数
 * @returns {Object} 包含 nodePath 和 exec 方法的对象
 */
function createNodeExecutor() {
  const nodePath = findNodePath();
  
  if (!nodePath) {
    throw new Error('未找到 Node.js 安装。请先运行环境初始化。');
  }

  return {
    nodePath,
    version: getNodeVersion(nodePath),
    /**
     * 执行 Node.js 脚本
     * @param {string} scriptPath 脚本路径
     * @param {Array<string>} args 参数
     * @param {Object} options child_process 选项
     */
    exec(scriptPath, args = [], options = {}) {
      const { spawn } = require('child_process');
      const allArgs = [scriptPath, ...args];
      return spawn(`"${nodePath}"`, allArgs, {
        shell: true,
        stdio: 'inherit',
        ...options
      });
    },
    /**
     * 同步执行 Node.js 脚本
     * @param {string} scriptPath 脚本路径
     * @param {Array<string>} args 参数
     * @param {Object} options child_process 选项
     */
    execSync(scriptPath, args = [], options = {}) {
      const allArgs = [scriptPath, ...args];
      return execSync(`"${nodePath}" ${allArgs.join(' ')}`, {
        stdio: 'inherit',
        ...options
      });
    }
  };
}

module.exports = {
  findNodePath,
  getNodeVersion,
  createNodeExecutor
};

// 如果直接运行此脚本，显示环境信息
if (require.main === module) {
  console.log('========================================');
  console.log('  环境变量辅助工具 - 诊断信息');
  console.log('========================================\n');
  
  const nodePath = findNodePath();
  
  if (nodePath) {
    console.log('✅ 找到 Node.js');
    console.log(`   路径: ${nodePath}`);
    console.log(`   版本: ${getNodeVersion(nodePath)}`);
    
    if (nodePath === 'node') {
      console.log('\n✅ 环境变量已生效，可以直接使用 "node" 命令');
    } else {
      console.log('\n⚠️  环境变量未生效，需要使用完整路径执行');
      console.log('   建议：关闭所有终端窗口，重新打开新的终端');
    }
  } else {
    console.log('❌ 未找到 Node.js');
    console.log('   请先运行环境初始化安装 Node.js');
    process.exit(1);
  }
}
