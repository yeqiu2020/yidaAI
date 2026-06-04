/**
 * 组织初始化启动器 - V1.0.2
 * 自动检测 Node.js 路径并执行初始化脚本
 * 解决环境变量未生效问题
 * 修复：添加 UTF-8 编码支持，解决 Windows 终端中文乱码
 * 修复：确保子进程继承 UTF-8 编码设置
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Windows 平台设置 UTF-8 代码页，解决中文乱码
// 必须在任何输出之前执行，确保整个进程树使用 UTF-8 编码
if (process.platform === 'win32') {
  try {
    // 设置当前控制台代码页为 UTF-8
    execSync('chcp 65001', { stdio: 'ignore' });
    // 设置环境变量，确保子进程也使用 UTF-8
    process.env.CHCP = '65001';
  } catch (e) {
    // 忽略错误，继续执行
  }
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// 可能的 Node.js 安装路径
const NODE_PATHS = [
  'C:\\Program Files\\nodejs\\node.exe',
  'C:\\Program Files (x86)\\nodejs\\node.exe',
  `${process.env.LOCALAPPDATA}\\Programs\\nodejs\\node.exe`,
  `${process.env.PROGRAMDATA}\\nodejs\\node.exe`,
];

/**
 * 检测 Node.js 是否可用
 */
function findNodePath() {
  // 首先尝试直接运行 node
  try {
    execSync('node -v', { stdio: 'pipe' });
    console.log(`${colors.green}✅ 环境变量已生效，直接使用 node 命令${colors.reset}\n`);
    return 'node';
  } catch (e) {
    // 环境变量未生效，查找具体路径
  }

  // 检查常见安装路径
  for (const nodePath of NODE_PATHS) {
    if (fs.existsSync(nodePath)) {
      console.log(`${colors.yellow}⚠️  环境变量未生效，使用完整路径: ${nodePath}${colors.reset}\n`);
      console.log(`${colors.cyan}💡 提示：关闭所有终端窗口，重新打开新的终端，即可直接使用 "node" 命令${colors.reset}\n`);
      return nodePath;
    }
  }

  // 尝试从环境变量查找
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  
  const additionalPaths = [
    path.join(programFiles, 'nodejs', 'node.exe'),
    path.join(programFilesX86, 'nodejs', 'node.exe'),
  ];

  for (const nodePath of additionalPaths) {
    if (fs.existsSync(nodePath)) {
      console.log(`${colors.yellow}⚠️  环境变量未生效，使用完整路径: ${nodePath}${colors.reset}\n`);
      console.log(`${colors.cyan}💡 提示：关闭所有终端窗口，重新打开新的终端，即可直接使用 "node" 命令${colors.reset}\n`);
      return nodePath;
    }
  }

  return null;
}

/**
 * 主函数
 */
function main() {
  console.log(`${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.cyan}  宜搭组织初始化启动器${colors.reset}`);
  console.log(`${colors.cyan}========================================${colors.reset}\n`);

  // 查找 Node.js
  const nodePath = findNodePath();
  
  if (!nodePath) {
    console.error(`${colors.red}❌ 错误：未找到 Node.js 安装${colors.reset}`);
    console.error(`${colors.red}   请先运行环境初始化安装 Node.js${colors.reset}\n`);
    process.exit(1);
  }

  // 验证 Node.js 版本
  try {
    const version = execSync(`"${nodePath}" -v`, { encoding: 'utf-8' }).trim();
    console.log(`${colors.green}✅ Node.js 版本: ${version}${colors.reset}\n`);
  } catch (e) {
    console.error(`${colors.red}❌ 错误：无法获取 Node.js 版本${colors.reset}\n`);
    process.exit(1);
  }

  // 获取 init-org.js 路径
  const initOrgPath = path.join(__dirname, 'init-org.js');
  
  if (!fs.existsSync(initOrgPath)) {
    console.error(`${colors.red}❌ 错误：找不到初始化脚本: ${initOrgPath}${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`${colors.cyan}🚀 启动组织初始化...${colors.reset}\n`);

  // 执行 init-org.js
  // 设置环境变量确保子进程使用 UTF-8 编码
  const env = { ...process.env };
  if (process.platform === 'win32') {
    // 强制设置 UTF-8 编码环境变量
    env.CHCP = '65001';
    env.NODE_OPTIONS = '--no-warnings';
  }
  
  const child = spawn(`"${nodePath}"`, [initOrgPath], {
    shell: true,
    stdio: 'inherit',
    cwd: process.cwd(),
    env: env
  });

  child.on('exit', (code) => {
    process.exit(code);
  });
}

// 运行主函数
main();
