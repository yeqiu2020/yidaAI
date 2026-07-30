/**
 * lib/core/spawn.js — 安全子进程调用封装
 *
 * 封装 spawnSync，强制使用 process.execPath 和 shell: false，
 * 避免命令注入风险。
 *
 * 设计原则：
 *   - 始终使用 process.execPath（当前 Node.js 可执行文件）而非 shell 命令
 *   - 始终 shell: false，不经过 shell 解析
 *   - 参数以数组形式传递，不拼接字符串
 *   - 提供结构化的返回值，不直接 process.exit
 *
 * 用法：
 *   const { safeSpawn, spawnNodeScript } = require('./spawn');
 *
 *   // 执行 Node.js 脚本
 *   const result = spawnNodeScript('./my-script.js', ['--arg1', 'value1']);
 *   if (!result.success) { ... }
 *
 *   // 执行任意可执行文件（shell: false）
 *   const result2 = safeSpawn('git', ['status'], { cwd: '/path' });
 *
 * 创建日期：2026-07-10 (Phase 1)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { CliError, ErrorCode } = require('./error');

/**
 * 安全的 spawnSync 封装。
 *
 * @param {string} command    - 可执行文件路径或命令名
 * @param {string[]} args     - 参数数组（不经过 shell 解析）
 * @param {object} [options]  - spawnSync 选项
 * @param {string} [options.cwd]       - 工作目录
 * @param {object} [options.env]       - 环境变量（合并到 process.env）
 * @param {number} [options.timeout]   - 超时毫秒数
 * @param {string} [options.input]     - 标准输入
 * @param {boolean} [options.captureStderr=true] - 是否捕获 stderr
 * @returns {{ success: boolean, stdout: string, stderr: string, status: number|null, error?: CliError }}
 */
function safeSpawn(command, args, options = {}) {
  if (!command) {
    return {
      success: false,
      stdout: '',
      stderr: '未指定可执行文件',
      status: null,
      error: new CliError(ErrorCode.MISSING_PARAM, '未指定可执行文件'),
    };
  }

  const safeArgs = Array.isArray(args) ? args : [];

  const spawnOptions = {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    shell: false,  // 强制 shell: false
    encoding: 'utf-8',
    timeout: options.timeout || 0,
    maxBuffer: 10 * 1024 * 1024, // 10MB
    windowsHide: true,
  };

  if (options.input !== undefined) {
    spawnOptions.input = options.input;
  }

  try {
    const result = spawnSync(command, safeArgs, spawnOptions);

    const success = result.status === 0;
    const stdout = (result.stdout || '').toString();
    const stderr = (result.stderr || '').toString();

    if (!success) {
      const errorMsg = stderr.trim() || `进程退出码: ${result.status}`;
      return {
        success: false,
        stdout,
        stderr,
        status: result.status,
        error: new CliError(ErrorCode.UNKNOWN, errorMsg, {
          detail: `command: ${command} ${safeArgs.join(' ')}`,
          context: { status: result.status, signal: result.signal },
        }),
      };
    }

    return {
      success: true,
      stdout,
      stderr,
      status: result.status,
    };
  } catch (err) {
    return {
      success: false,
      stdout: '',
      stderr: err.message || String(err),
      status: null,
      error: new CliError(ErrorCode.UNKNOWN, `执行失败: ${err.message}`, {
        detail: `command: ${command} ${safeArgs.join(' ')}`,
        cause: err,
      }),
    };
  }
}

/**
 * 使用当前 Node.js 进程执行脚本文件。
 *
 * 内部使用 process.execPath，确保不依赖 PATH 中的 node。
 *
 * @param {string} scriptPath - JS 脚本文件路径
 * @param {string[]} [args=[]] - 脚本参数
 * @param {object} [options]   - 同 safeSpawn 选项
 * @returns {{ success: boolean, stdout: string, stderr: string, status: number|null, error?: CliError }}
 */
function spawnNodeScript(scriptPath, args = [], options = {}) {
  if (!scriptPath) {
    return {
      success: false,
      stdout: '',
      stderr: '未指定脚本路径',
      status: null,
      error: new CliError(ErrorCode.MISSING_PARAM, '未指定脚本路径'),
    };
  }

  // 解析为绝对路径
  const absolutePath = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.resolve(options.cwd || process.cwd(), scriptPath);

  return safeSpawn(process.execPath, [absolutePath, ...args], options);
}

/**
 * 执行 Node.js 代码字符串（通过 -e 参数）。
 *
 * @param {string} code - JS 代码
 * @param {object} [options] - 同 safeSpawn 选项
 * @returns {{ success: boolean, stdout: string, stderr: string, status: number|null, error?: CliError }}
 */
function spawnNodeEval(code, options = {}) {
  if (!code) {
    return {
      success: false,
      stdout: '',
      stderr: '未指定代码内容',
      status: null,
      error: new CliError(ErrorCode.MISSING_PARAM, '未指定代码内容'),
    };
  }

  return safeSpawn(process.execPath, ['-e', code], options);
}

module.exports = {
  safeSpawn,
  spawnNodeScript,
  spawnNodeEval,
};
