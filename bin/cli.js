#!/usr/bin/env node
/**
 * bin/cli.js — yida-helper CLI 入口（命令路由骨架）
 *
 * 阶段一任务 1.2：建立路由骨架，命令未实现时输出 "not implemented"。
 * 阶段三将逐个落地各命令的具体实现。
 *
 * 命令行解析：用现有 core-lib/command-manifest.js 的机制扩展，不引入 commander 等新依赖（禁令 B12）。
 *
 * 创建日期：2026-08-17 (阶段一)
 * 版本：0.1.0
 */

'use strict';

// Windows 平台设置 UTF-8 代码页
if (process.platform === 'win32') {
  try {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
  } catch {
    // 忽略
  }
}

const path = require('path');
const { CliError, wrapError } = require('../lib/core/error');
const paths = require('../lib/core/paths');

// ── 命令表 ─────────────────────────────────────────────

/**
 * 命令定义表
 * 每个命令：{ name, alias[], desc, impl(impl 为 null 表示尚未实现)
 */
const COMMANDS = [
  {
    name: 'init',
    desc: '在目标目录生成项目骨架（模板渲染 + 占位符填充）。可选 --with-skills 复制 skills 到 .agents/skills/',
    impl: require('../lib/cli/init'),
    args: '[--project-dir <路径>] [--with-skills]',
  },
  {
    name: 'login',
    desc: '复用 auth-plus 多策略登录，凭据写入全局 cookieFile()',
    impl: require('../lib/cli/login').cmdLogin,
    args: '[--method auto]',
  },
  {
    name: 'logout',
    desc: '删除全局 Cookie',
    impl: require('../lib/cli/login').cmdLogout,
    args: '',
  },
  {
    name: 'copy',
    desc: '按多工具映射表重分发 skills。无参=全量；--tool 指定单个；--project 刷新项目级；--force 碰撞强制覆盖',
    impl: require('../lib/cli/copy'),
    args: '[--tool <name>] [--project <路径>] [--force]',
  },
  {
    name: 'start',
    desc: '封装 server-manager，静态根=cwd。可选 --port 和 --project-dir',
    impl: require('../lib/cli/server').cmdStart,
    args: '[--port 8080] [--project-dir <路径>]',
  },
  {
    name: 'stop',
    desc: '停止本地服务',
    impl: require('../lib/cli/server').cmdStop,
    args: '',
  },
  {
    name: 'status',
    desc: '查询本地服务端口与健康状态',
    impl: require('../lib/cli/server').cmdStatus,
    args: '',
  },
  {
    name: 'doctor',
    desc: '环境体检，输出结构化报告（Node 版本、登录态、Playwright 可用性、端口占用、各工具 skills 分发状态、npm 最新版）',
    impl: require('../lib/cli/doctor'),
    args: '',
  },
  {
    name: 'update',
    desc: '对比 registry 最新版 → 提示 → 执行 npm install -g → 自动跑 copy',
    impl: require('../lib/cli/update'),
    args: '[--yes]',
  },
  {
    name: 'version',
    desc: '打印包版本',
    impl: cmdVersion,
    args: '',
  },
  {
    name: 'help',
    desc: '打印命令表',
    impl: cmdHelp,
    args: '',
  },
  {
    name: 'migrate',
    desc: '老数据迁移：复制组织及应用信息.md 等数据到新工作目录 → 提示 Cookie 迁移到全局',
    impl: require('../lib/cli/migrate'),
    args: '<老项目路径>',
  },
  {
    name: 'run',
    desc: '透传模式：以包内 skills/ 为根解析相对路径后透传给 node 执行',
    impl: require('../lib/cli/run'),
    args: '<相对路径> [args...]',
  },
];

// ── 版本号 ─────────────────────────────────────────────

/**
 * 从 package.json 读取版本号
 * @returns {string}
 */
function getVersion() {
  try {
    const pkgPath = path.join(paths.packageRoot(), 'package.json');
    const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── 已实现的命令 ───────────────────────────────────────

/**
 * version 命令
 */
function cmdVersion() {
  console.log(getVersion());
}

/**
 * help 命令：打印命令表
 */
function cmdHelp() {
  const version = getVersion();
  console.log('');
  console.log('  宜搭AI助手 (yida-helper) v' + version);
  console.log('  一条命令安装、增量更新、多工具适配');
  console.log('');
  console.log('  用法:');
  console.log('    yida-helper <command> [options]');
  console.log('    yidaazs <command> [options]          (别名)');
  console.log('');
  console.log('  命令:');
  for (const cmd of COMMANDS) {
    const namePadding = ' '.repeat(Math.max(0, 10 - cmd.name.length));
    const alias = cmd.alias ? ` (${cmd.alias.join(', ')})` : '';
    console.log(`    ${cmd.name}${namePadding}${cmd.desc}`);
    if (cmd.args) {
      console.log(`              参数: ${cmd.args}`);
    }
  }
  console.log('');
  console.log('  更多信息: yida-helper help');
  console.log('');
}

// ── not implemented 提示 ───────────────────────────────

/**
 * 输出"未实现"提示
 * @param {string} cmdName
 */
function notImplemented(cmdName) {
  console.log(`  ⚠️ 命令 "${cmdName}" 尚未实现 (not implemented)`);
  console.log(`     该命令将在后续阶段落地，请关注版本更新。`);
}

// ── 主路由 ─────────────────────────────────────────────

/**
 * 解析命令行参数
 */
function main() {
  const args = process.argv.slice(2);

  // 无参数 → help
  if (args.length === 0) {
    cmdHelp();
    return;
  }

  const cmdName = args[0];
  const cmdArgs = args.slice(1);

  // 查找命令
  const cmd = COMMANDS.find((c) => c.name === cmdName || (c.alias && c.alias.includes(cmdName)));

  if (!cmd) {
    // 未知命令
    console.log(`  ❌ 未知命令: ${cmdName}`);
    console.log('');
    cmdHelp();
    process.exit(30); // INVALID_PARAM 退出码
  }

  // 执行命令
  try {
    if (cmd.impl) {
      cmd.impl(cmdArgs);
    } else {
      notImplemented(cmd.name);
    }
  } catch (err) {
    const cliErr = wrapError(err);
    console.error(cliErr.toString());
    process.exit(cliErr.getExitCode());
  }
}

// 启动
main();
