/**
 * lib/sync-server/script-runner.js — 脚本执行器
 *
 * Phase 6-2: 从 sync_server.js 抽取的脚本路径映射和执行函数。
 *
 * 创建日期：2026-07-10 (Phase 6)
 */

'use strict';

const path = require('path');
const { spawn } = require('child_process');

const SKILLS_DIR = path.join(__dirname, '..', '..', '.agents', 'skills');

const SCRIPTS = {
  configSync: path.join(SKILLS_DIR, 'config-sync', 'scripts', 'sync_all_configs.js'),
  schemaSync: path.join(SKILLS_DIR, 'get-schema', 'scripts', 'sync-schema.js'),
  ruleSync: path.join(SKILLS_DIR, 'rule-sync', 'scripts', 'sync_rules.js'),
  projectSync: path.join(SKILLS_DIR, 'project-sync', 'scripts', 'sync_project.js'),
  dataClean: path.join(SKILLS_DIR, 'data-clean', 'scripts', 'clear-form-data.js'),
  dataBackup: path.join(SKILLS_DIR, 'data-backup', 'scripts', 'backup-app-data.js'),
  systemMap: path.join(SKILLS_DIR, 'system-map', 'scripts', 'generate_map.js'),
  formSettings: path.join(SKILLS_DIR, 'form-settings', 'scripts', 'form-settings.js'),
  flowSettings: path.join(SKILLS_DIR, 'flow-settings', 'scripts', 'flow-settings.js'),
  projectCreator: path.join(SKILLS_DIR, 'project-creator', 'scripts', 'create-project.js'),
};

/**
 * 通用脚本执行辅助函数
 * @param {string} scriptPath - 脚本绝对路径
 * @param {string[]} args - 命令行参数数组
 * @param {number} timeout - 超时毫秒
 * @returns {Promise<string>} 脚本 stdout 输出
 */
function runScript(scriptPath, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout));
    });
    child.on('error', reject);
    setTimeout(() => { child.kill(); reject(new Error('执行超时')); }, timeout);
  });
}

module.exports = {
  SCRIPTS,
  runScript,
  SKILLS_DIR,
};
