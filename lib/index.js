/**
 * lib/index.js — 包主入口
 *
 * 导出核心模块供外部引用。
 *
 * 创建日期：2026-08-17 (阶段一)
 * 版本：0.1.0
 */

'use strict';

const paths = require('./core/paths');
const { CliError, ErrorCode, wrapError } = require('./core/error');
const { safeSpawn, spawnNodeScript } = require('./core/spawn');

module.exports = {
  // 路径解析
  paths,
  // 错误体系
  CliError,
  ErrorCode,
  wrapError,
  // 子进程封装
  safeSpawn,
  spawnNodeScript,
};
