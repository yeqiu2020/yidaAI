/**
 * lib/cli/server.js — yida-helper start / stop / status 命令实现
 *
 * 封装 server-manager，静态根=cwd（--project-dir 可指定）
 *
 * 创建日期：2026-08-17 (阶段三)
 * 版本：1.0.0
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const paths = require('../core/paths');

// ── server-manager 脚本路径 ────────────────────────────

function getServerManagerScript() {
  // 优先包内 skills/
  const primary = path.join(paths.skillsSource(), 'server-manager', 'scripts', 'server_manager.js');
  const fs = require('fs');
  if (fs.existsSync(primary)) return primary;
  // 开发模式回退
  return path.join(paths.packageRoot(), '.agents', 'skills', 'server-manager', 'scripts', 'server_manager.js');
}

// ── 通用执行函数 ───────────────────────────────────────

/**
 * 执行 server-manager 子命令
 * @param {string} command - start | stop | status | restart
 * @param {string[]} args - 额外参数
 */
function runServerManager(command, args) {
  const script = getServerManagerScript();
  const allArgs = [script, command, ...args];

  const child = spawn('node', allArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: false,
  });

  child.on('error', (err) => {
    console.error(`  ❌ 启动失败: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.exit(code);
    }
  });
}

// ── start 命令 ─────────────────────────────────────────

/**
 * start 命令
 * @param {string[]} args
 */
function cmdStart(args) {
  let port = '8080';
  let projectDir = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = args[i + 1];
      i++;
    } else if (args[i] === '--project-dir' && args[i + 1]) {
      projectDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  console.log('');
  console.log(`  🚀 启动宜搭本地服务`);
  console.log(`  📁 工作目录: ${projectDir}`);
  console.log(`  🔌 端口: ${port}`);
  console.log('');

  // server_manager.js argv[2]=command, argv[3]=projectRoot
  runServerManager('start', [projectDir, port]);
}

// ── stop 命令 ──────────────────────────────────────────

/**
 * stop 命令
 */
function cmdStop() {
  console.log('');
  console.log('  🛑 停止宜搭本地服务');
  console.log('');
  runServerManager('stop', []);
}

// ── status 命令 ────────────────────────────────────────

/**
 * status 命令
 */
function cmdStatus() {
  console.log('');
  console.log('  📊 宜搭本地服务状态');
  console.log('');
  runServerManager('status', []);
}

module.exports = { cmdStart, cmdStop, cmdStatus };
