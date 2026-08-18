/**
 * lib/core/tool-map.js — 多工具 skills 分发映射表（公共模块）
 *
 * postinstall.js / copy.js / doctor.js 三处共用，避免重复代码。
 *
 * FOLDER_NAME: 非拍平工具的套壳目录名
 * flatten: true 表示该工具使用拍平分发（每个 skill 直接放在 skills/ 下，无套壳）
 *
 * 创建日期：2026-08-18
 * 版本：1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const FOLDER_NAME = 'yidaai';

const MANIFEST_FILE = '.yidaai-manifest.json';

const TOOL_MAP = [
  { name: 'trae-cn',  dir: '.trae-cn',   skillsSub: 'skills', flatten: true },
  { name: 'traecli',  dir: '.traecli',   skillsSub: 'skills' },
  { name: 'codex',    dir: '.codex',     skillsSub: 'skills' },
  { name: 'opencode', dir: '.config/opencode', skillsSub: 'skills' },
  { name: 'codebuddy',dir: '.codebuddy', skillsSub: 'skills' },
  { name: 'qoder',    dir: '.qoder',     skillsSub: 'skills' },
  { name: 'qoder-cn', dir: '.qoder-cn',  skillsSub: 'skills' },
  { name: 'zcode',    dir: '.zcode',     skillsSub: 'skills' },
  { name: 'claude',   dir: '.claude',    skillsSub: 'skills' },
  { name: 'cursor',   dir: '.cursor',    skillsSub: 'skills' },
  // CatPaw 预留槽位（官方路径未公开）
];

// 历史遗留目录名（用于 cleanupLegacy 清理）
const LEGACY_NAMES = ['yida-ai-helper', 'yeqiu-yida', 'yida-skills'];

// ── 辅助函数 ───────────────────────────────────────────

function getSkillsDir(tool) {
  const home = os.homedir();
  return path.join(home, tool.dir, tool.skillsSub);
}

function getNestedTargetDir(tool) {
  return path.join(getSkillsDir(tool), FOLDER_NAME);
}

function getManifestPath(tool) {
  return path.join(getSkillsDir(tool), MANIFEST_FILE);
}

/**
 * 获取 skillsSource 下所有 skill 目录名
 */
function getSkillNames(skillsSource) {
  if (!fs.existsSync(skillsSource)) return [];
  return fs.readdirSync(skillsSource, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

/**
 * 递归复制目录
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(dir);
      return;
    }
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
  FOLDER_NAME,
  MANIFEST_FILE,
  TOOL_MAP,
  LEGACY_NAMES,
  getSkillsDir,
  getNestedTargetDir,
  getManifestPath,
  getSkillNames,
  copyDirRecursive,
  removeDir,
};
