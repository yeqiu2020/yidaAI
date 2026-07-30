/**
 * lib/sync-server/utils.js — sync_server 公共工具函数
 *
 * Phase 6-2: 从 sync_server.js 抽取的公共工具函数。
 * 原文件保留为路由入口，本模块提供独立可测试的工具函数。
 *
 * 创建日期：2026-07-10 (Phase 6)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const CONFIG_FILE = '系统配置清单.md';

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

function unescapeMarkdown(str) {
  if (!str) return str;
  return str.replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, '$1');
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDirPath(dirPath) {
  if (!dirPath) return '';
  const raw = String(dirPath);
  const decoded = (() => {
    try { return decodeURIComponent(raw); } catch (_) { return raw; }
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
    return fs.existsSync(path.join(candidateDir, CONFIG_FILE));
  });
}

module.exports = {
  CONFIG_FILE,
  colors,
  log,
  unescapeMarkdown,
  escapeRegExp,
  normalizeDirPath,
  hasSystemConfig,
};
