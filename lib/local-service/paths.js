'use strict';

const fs = require('fs');
const path = require('path');
const PRIVATE_DIRS = new Set(['node_modules', 'lib', 'scripts', 'tests', 'temp-file', 'logs']);
const PRIVATE_FILES = /^(?:AGENTS\.md|CLAUDE\.md|package(?:-lock)?\.json|skill-config\.json|storageState.*|.*cookies?.*|.*auth.*\.json|.*\.(?:key|pem|bat|cmd|ps1|bak))$/i;
const denied = message => Object.assign(new Error(message), { statusCode: 403 });

function within(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}

function publicParts(relative) {
  if (typeof relative !== 'string' || /[\0\\:]/.test(relative)) throw denied('非法文件路径');
  const parts = relative.split('/').filter(Boolean);
  if (parts.some(p => p === '..' || p.startsWith('.') || PRIVATE_DIRS.has(p.toLowerCase()) || PRIVATE_FILES.test(p))) {
    throw denied('禁止访问工具内部文件或凭证');
  }
  return parts;
}

function safeFile(root, relative, extensions) {
  const parts = publicParts(relative);
  const file = path.resolve(root, ...parts);
  if (!within(root, file)) throw denied('文件超出项目目录');
  if (extensions && !extensions.includes(path.extname(file).toLowerCase())) throw denied('不支持的文件类型');
  if (fs.existsSync(file) && !within(fs.realpathSync(root), fs.realpathSync(file))) throw denied('禁止跨项目符号链接');
  return file;
}

module.exports = { within, publicParts, safeFile };
