/**
 * lib/sync-server/guard-root.js — 项目根写入防线（单一来源）
 *
 * v3.0.8 引入（2026-08-22 分组平铺项目根事故根治，详见
 * form_creator/references/faq.md 问题17）。
 *
 * 所有能把「系统配置清单.md」或表单/分组目录写入目标目录的同步脚本，
 * CLI 入口必须调用 assertNotProjectRoot()，防止目标目录误传项目根导致：
 *   1. 清单写到项目根 → 项目根"伪装"成应用目录（下次事故的种子）；
 *   2. 表单分组目录平铺到项目根。
 *
 * 项目根判定标志：组织及应用信息.md（org-init 仅在项目根生成，应用目录不会有）。
 * ⚠️ 与 lib/sync-server/dir-ops.js 的 isProjectRootDir() 使用同一标志，
 *    修改判定逻辑时两处必须同步。
 *
 * 豁免：--allow-root（旧版单应用布局：项目根=应用目录，确需写入时显式确认）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ORG_CONFIG_FILE = '组织及应用信息.md';

function isProjectRootDir(dirPath) {
  if (!dirPath) return false;
  try {
    return fs.existsSync(path.join(dirPath, ORG_CONFIG_FILE));
  } catch (_) {
    return false;
  }
}

/**
 * 若目标目录是项目根且未豁免，打印错误并 process.exit(1)。
 * @param {string} targetDir 目标目录（绝对或相对均可，内部 resolve）
 * @param {Object} [options]
 * @param {boolean} [options.allowRoot=false] 是否显式豁免（--allow-root）
 * @param {string} [options.scriptName] 报错时显示的脚本名（默认 '本脚本'）
 * @returns {string} 通过防线后的目标目录绝对路径
 */
function assertNotProjectRoot(targetDir, options = {}) {
  const resolved = path.resolve(targetDir);
  if (options.allowRoot || !isProjectRootDir(resolved)) {
    return resolved;
  }
  const name = options.scriptName || '本脚本';
  console.error(`❌ 已拦截（${name}）：目标目录是项目根（含 ${ORG_CONFIG_FILE}），禁止把应用内容平铺到项目根。`);
  console.error(`   正确用法: 目标目录应为 "${path.join(resolved, '<应用名称>')}"`);
  console.error('   （旧版单应用布局确需以项目根为应用目录时，追加 --allow-root 显式确认）');
  process.exit(1);
}

/**
 * 从原始 argv 中剔除 --allow-root 标志（避免被误当成位置参数），返回 { args, allowRoot }。
 */
function splitAllowRootFlag(rawArgs) {
  return {
    args: rawArgs.filter(a => a !== '--allow-root'),
    allowRoot: rawArgs.includes('--allow-root')
  };
}

module.exports = { isProjectRootDir, assertNotProjectRoot, splitAllowRootFlag, ORG_CONFIG_FILE };
