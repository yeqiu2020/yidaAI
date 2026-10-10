/**
 * lib/sync-server/sync-ops.js — 同步操作模块
 *
 * Phase 6-2: 从 sync_server.js 抽取的表单同步和配置生成函数。
 * 实现与原 sync_server.js 完全一致，仅调整了脚本路径（通过 SKILLS_DIR）。
 *
 * 创建日期：2026-07-10 (Phase 6)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { SKILLS_DIR } = require('./script-runner');
const { log } = require('./utils');
const { readSystemConfig } = require('./config-reader');

/**
 * 期望的原型页面生成器版本。
 * 【v2.0.13 根治】不再写死版本号——从 prototype_generator.js 动态读取 GENERATOR_VERSION，
 * 与生成器版本由"单一来源"驱动，杜绝"两套版本号人工同步遗漏"导致存量应用不自动重建。
 * 每次生成器功能升级（GENERATOR_VERSION 递增）后，sync 期望版本自动跟随，
 * 所有应用的 .generator-version 不匹配时将被强制全量重建，确保新功能覆盖全部应用。
 */
let EXPECTED_PROTOTYPE_VERSION = '2.14.0'; // 兜底值（仅在无法读取生成器时使用）
try {
  const gen = require(path.join(SKILLS_DIR, 'form-to-prototype', 'scripts', 'prototype_generator.js'));
  if (gen && gen.GENERATOR_VERSION) EXPECTED_PROTOTYPE_VERSION = String(gen.GENERATOR_VERSION);
} catch (e) {
  log('读取生成器 GENERATOR_VERSION 失败，使用兜底值: ' + (e.message || e), 'yellow');
}

/**
 * v3.0.3 多项目隔离：从应用目录向上定位「项目根」（含 .cookies.json 或 组织及应用信息.md 的目录）。
 * executeSync / executeFormListSync 收到的 projectDir 是应用目录（如 .../V2.0.25/进销存2），
 * 而子进程读取 Cookie 时需要的是项目根（如 .../V2.0.25）。此前 spawn 未注入
 * YIDA_PROJECT_ROOT，子进程内 findProjectRoot() 回溯 __dirname 会指向宿主项目，
 * 跨项目调用时读到宿主项目的 Cookie（多组织并存下会串组织）。
 * @param {string} appDir - 应用目录
 * @returns {string|null} 项目根（找不到特征文件时返回 null，调用方不注入环境变量）
 */
function findProjectRootFromAppDir(appDir) {
  let cur = appDir;
  for (let i = 0; i < 4 && cur; i++) {
    if (fs.existsSync(path.join(cur, '.cookies.json')) ||
        fs.existsSync(path.join(cur, '组织及应用信息.md'))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/**
 * 执行同步脚本
 * v3.1.0: 支持 options.actionsOnly — 只同步动作代码（传 --actions-only 给 sync_single_form.js）
 */
function executeSync(projectDir, formName, options = {}) {
  return new Promise((resolve, reject) => {
    const syncScript = path.join(SKILLS_DIR, 'form_creator', 'scripts', 'sync_single_form.js');

    if (!fs.existsSync(syncScript)) {
      reject(new Error('同步脚本不存在'));
      return;
    }

    log(`执行同步: ${formName}${options.actionsOnly ? '（仅动作代码）' : ''}`, 'cyan');
    log(`项目目录: ${projectDir}`, 'cyan');

    // v3.0.3: 注入项目根，子进程内 Cookie 定位不再回溯到宿主项目
    const projectRoot = findProjectRootFromAppDir(projectDir);
    const childEnv = projectRoot
      ? { ...process.env, YIDA_PROJECT_ROOT: projectRoot }
      : { ...process.env };

    const scriptArgs = [syncScript, projectDir, formName];
    if (options.actionsOnly) {
      scriptArgs.push('--actions-only');
    }

    const child = spawn(process.execPath, scriptArgs, {
      cwd: projectRoot || process.cwd(),
      env: childEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer = null;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    // v3.2.0: 防卡死兜底 — 子进程 90 秒未退出则强制 kill，避免 executeSync Promise 永远 pending
    killTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill(); } catch (_) { /* ignore */ }
        reject(new Error('同步子进程执行超时（90秒），已强制终止'));
      }
    }, 90000);

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      log(`同步失败: ${error.message}`, 'red');
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      const parseResultFromText = (text) => {
        const lines = String(text || '').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              return JSON.parse(trimmed);
            } catch (e) {
              // continue
            }
          }
        }
        return null;
      };

      const resultFromStdout = parseResultFromText(stdout);
      const resultFromStderr = parseResultFromText(stderr);
      const result = resultFromStdout || resultFromStderr;

      if (code !== 0) {
        log(`同步失败: exit code ${code}`, 'red');
        if (result && result.error) {
          reject(new Error(result.error));
          return;
        }
        const mergedMessage = (stderr || stdout || `同步失败，退出码: ${code}`).toString().trim();
        reject(new Error(mergedMessage));
        return;
      }

      if (result) {
        resolve(result);
      } else {
        resolve({ success: true, message: '同步完成' });
      }
    });
  });
}

/**
 * 执行表单列表同步脚本（从宜搭获取最新表单列表并更新配置文件）
 */
function executeFormListSync(projectDir) {
  return new Promise((resolve, reject) => {
    // v2.11.0: 改用 sync_config.js --update（API 优先，Playwright 仅兜底）
    // 替代 sync_form_list_playwright.js（Playwright 爬页面，脆弱且依赖 Chromium）
    // 与"更新应用"使用完全相同的 API 策略，确保行为一致
    const syncScript = path.join(SKILLS_DIR, 'config-sync', 'scripts', 'sync_config.js');

    if (!fs.existsSync(syncScript)) {
      reject(new Error('表单列表同步脚本不存在: ' + syncScript));
      return;
    }

    // 从已有系统配置清单读取 appId（显式传入比让脚本自动读更可靠）
    const config = readSystemConfig(projectDir);
    if (!config || !config.appId) {
      reject(new Error('无法读取应用ID，请确保系统配置清单.md存在且包含应用ID'));
      return;
    }

    log(`执行表单列表同步（API方式）: ${projectDir}`, 'cyan');

    // v3.0.3: 注入项目根，子进程内 Cookie 定位不再回溯到宿主项目
    // （此前无 cwd/env，sync_config.js 的 loadCookieData() 会读宿主项目的 Cookie）
    const projectRoot = findProjectRootFromAppDir(projectDir);
    const childEnv = projectRoot
      ? { ...process.env, YIDA_PROJECT_ROOT: projectRoot }
      : { ...process.env };

    const child = spawn(process.execPath, [
      syncScript, '--appId', config.appId, '--output', projectDir, '--update'
    ], {
      cwd: projectRoot || process.cwd(),
      env: childEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      log(`表单列表同步失败: ${error.message}`, 'red');
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const mergedMessage = (stderr || stdout || `表单列表同步失败，退出码: ${code}`).toString().trim();
        log(`表单列表同步失败: ${mergedMessage}`, 'red');
        reject(new Error(mergedMessage));
        return;
      }
      log('表单列表同步完成', 'green');
      resolve({ success: true, output: stdout });
    });
  });
}

/**
 * 重新生成 form-config.js（当表单列表发生变化时调用）
 */
function regenerateFormConfigJs(projectDir) {
  return new Promise((resolve, reject) => {
    const fieldListPath = path.join(projectDir, '01需求梳理', '字段清单.md');
    if (!fs.existsSync(fieldListPath)) {
      log('字段清单不存在，无法更新 form-config.js', 'yellow');
      resolve({ success: false, skipped: true, message: '字段清单不存在' });
      return;
    }

    const generatorScript = path.join(SKILLS_DIR, 'form-to-prototype', 'scripts', 'prototype_generator.js');
    if (!fs.existsSync(generatorScript)) {
      log('原型页面生成器脚本不存在', 'red');
      resolve({ success: false, skipped: true, message: '生成器脚本不存在' });
      return;
    }

    const outputDir = path.join(projectDir, '01需求梳理', '原型页面');
    const formConfigPath = path.join(outputDir, 'js', 'form-config.js');

    log(`调用 prototype_generator.js --form-config-only...`, 'cyan');
    // v3.0.7: 注入项目根（与 executeSync 同款），防止生成器内 findProjectRoot() 回溯宿主项目
    const projectRoot = findProjectRootFromAppDir(projectDir);
    const childEnv = projectRoot
      ? { ...process.env, YIDA_PROJECT_ROOT: projectRoot }
      : { ...process.env };
    const child = spawn(process.execPath, [generatorScript, fieldListPath, outputDir, '--form-config-only'], {
      cwd: projectRoot || process.cwd(),
      env: childEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      log(`更新 form-config.js 失败: ${error.message}`, 'red');
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const mergedMessage = (stderr || stdout || `退出码: ${code}`).toString().trim();
        log(`更新 form-config.js 失败: ${mergedMessage}`, 'red');
        reject(new Error(mergedMessage));
        return;
      }

      if (fs.existsSync(formConfigPath)) {
        log(`form-config.js 已重新生成`, 'green');
        resolve({ success: true, skipped: false, message: 'form-config.js 已更新' });
      } else {
        log(`form-config.js 重新生成后未检测到文件`, 'yellow');
        resolve({ success: false, skipped: false, message: 'form-config.js 未生成' });
      }
    });
  });
}

/**
 * 生成原型页面（如果尚未存在）。
 * 版本感知：读取 .generator-version，与 EXPECTED_PROTOTYPE_VERSION 不符则强制全量重建，
 * 保证 manifest.html 等新功能覆盖所有应用（即使 index.html 已存在）。
 */
function generatePrototypePages(projectDir, formListChanged = false) {
  return new Promise((resolve, reject) => {
    const prototypeDir = path.join(projectDir, '01需求梳理', '原型页面');
    const prototypeIndex = path.join(prototypeDir, 'index.html');

    // 版本感知判断：.generator-version 缺失或版本不符 → 需要强制全量重建
    let needFullRegen = false;
    try {
      const versionFile = path.join(prototypeDir, '.generator-version');
      const currentVer = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf-8').trim() : null;
      if (currentVer !== EXPECTED_PROTOTYPE_VERSION) {
        log(`原型页面版本不符（当前=${currentVer || '无'}，期望=${EXPECTED_PROTOTYPE_VERSION}），强制全量重建`, 'yellow');
        needFullRegen = true;
      }
    } catch (e) {
      log('读取原型版本失败，将强制全量重建: ' + e.message, 'yellow');
      needFullRegen = true;
    }

    if (fs.existsSync(prototypeIndex)) {
      if (formListChanged && !needFullRegen) {
        log('表单列表发生变化，重新生成 form-config.js...', 'cyan');
        regenerateFormConfigJs(projectDir)
          .then(result => resolve(result))
          .catch(err => resolve({ success: false, skipped: true, message: '更新form-config.js失败: ' + err.message }));
        return;
      }
      if (!needFullRegen) {
        log('原型页面已存在且版本一致，跳过生成', 'green');
        resolve({ success: true, skipped: true, message: '原型页面已存在' });
        return;
      }
      // needFullRegen=true：即使 index.html 已存在也继续往下走完整重建
    }

    const fieldListPath = path.join(projectDir, '01需求梳理', '字段清单.md');
    if (!fs.existsSync(fieldListPath)) {
      log('字段清单不存在，无法生成原型页面', 'yellow');
      resolve({ success: false, skipped: true, message: '字段清单不存在' });
      return;
    }

    const generatorScript = path.join(SKILLS_DIR, 'form-to-prototype', 'scripts', 'prototype_generator.js');
    if (!fs.existsSync(generatorScript)) {
      log('原型页面生成器脚本不存在: ' + generatorScript, 'red');
      resolve({ success: false, skipped: true, message: '生成器脚本不存在' });
      return;
    }

    const outputDir = path.join(projectDir, '01需求梳理', '原型页面');

    log(`正在生成原型页面...`, 'cyan');
    log(`字段清单: ${fieldListPath}`, 'cyan');
    log(`输出目录: ${outputDir}`, 'cyan');

    // v3.0.7: 注入项目根（与 executeSync 同款），防止生成器内 findProjectRoot() 回溯宿主项目
    const projectRoot = findProjectRootFromAppDir(projectDir);
    const childEnv = projectRoot
      ? { ...process.env, YIDA_PROJECT_ROOT: projectRoot }
      : { ...process.env };
    const child = spawn(process.execPath, [generatorScript, fieldListPath, outputDir], {
      cwd: projectRoot || process.cwd(),
      env: childEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      log(`原型页面生成失败: ${error.message}`, 'red');
      resolve({ success: false, skipped: false, error: error.message });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const mergedMessage = (stderr || stdout || `退出码: ${code}`).toString().trim();
        log(`原型页面生成失败: ${mergedMessage}`, 'red');
        resolve({ success: false, skipped: false, error: mergedMessage });
        return;
      }

      if (fs.existsSync(prototypeIndex)) {
        log(`原型页面生成成功!`, 'green');
        resolve({ success: true, skipped: false, message: '原型页面生成成功' });
      } else {
        log(`原型页面生成后未检测到 index.html，可能生成不完整`, 'yellow');
        resolve({ success: true, skipped: false, message: '生成可能不完整，请检查' });
      }
    });
  });
}

module.exports = {
  executeSync,
  executeFormListSync,
  regenerateFormConfigJs,
  generatePrototypePages,
};
