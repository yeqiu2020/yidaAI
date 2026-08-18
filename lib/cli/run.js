/**
 * lib/cli/run.js — yida-helper run
 *
 * 透传模式：以包内 skills/ 为根解析相对路径后透传给 node 执行。
 * 用途：在全局安装后，AI 工具仍能通过 yida-helper run 找到 skills 脚本并执行。
 *
 * 示例：
 *   yida-helper run integration/scripts/integration-create.js create APP-XXX ...
 *
 * 创建日期：2026-08-18 (阶段四)
 * 版本：1.0.0
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const paths = require('../core/paths');

/**
 * run 命令
 * @param {string[]} args — 第一个元素为相对路径，后续为透传参数
 */
function cmdRun(args) {
  if (!args || args.length === 0) {
    console.log('  用法: yida-helper run <skills内相对路径> [args...]');
    console.log('');
    console.log('  示例:');
    console.log('    yida-helper run integration/scripts/integration-create.js create APP-XXX ...');
    console.log('    yida-helper run get-schema/scripts/get-schema.js --form-uuid FORM-XXX');
    console.log('');
    process.exit(1);
  }

  const relPath = args[0];
  const passThroughArgs = args.slice(1);

  // 从 skillsSource() 解析绝对路径
  const skillsRoot = paths.skillsSource();
  const targetPath = path.resolve(skillsRoot, relPath);

  // 安全检查：解析后的路径必须在 skills 目录内
  const relative = path.relative(skillsRoot, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    console.error(`  ❌ 路径越界: ${relPath}`);
    console.error('     只允许执行 skills 目录内的脚本。');
    process.exit(1);
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`  ❌ 脚本不存在: ${targetPath}`);
    console.error('     请检查路径是否正确。');
    process.exit(1);
  }

  // 透传执行
  const child = spawn('node', [targetPath, ...passThroughArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  child.on('close', (code) => {
    process.exit(code ?? 1);
  });
}

module.exports = cmdRun;
