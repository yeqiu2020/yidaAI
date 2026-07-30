/**
 * lib/sync-server/form-scanner.js — 表单目录 UUID 扫描与匹配引擎
 *
 * v2.11.0: 统一所有"按 UUID 匹配本地表单目录"的逻辑，消除此前散落在
 * sync_all_configs.js、config-reader.js、sync_single_form.js 中的重复扫描代码。
 *
 * 被三方复用：
 *   - sync_server.js（/sync-app 端点）→ checkFormExists / findOrphanFormDirs / renameFormDirsIfNeeded
 *   - sync_all_configs.js（更新应用）  → scanLocalFormDirs / cleanupDeletedForms / cleanupEmptyGroups / cleanupOrphanRootFormDirs
 *   - sync_single_form.js（同步表单字段）→ findFormDir
 *
 * 创建日期：2026-07-11
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { log } = require('./utils');

const FORM_DIR_REGEX = /「(普通表单|流程表单)」$/;
const FORM_JSON_REGEX = /^.+「(普通表单|流程表单)」\.json$/;

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/**
 * 将不同来源的表单对象统一为标准格式
 * 兼容 readSystemConfig 的 {name, type, uuid} 和 parseFormsFromConfig 的 {formName, formType, formUuid, module}
 */
function normalizeForm(form) {
  const rawType = form.type || form.formType || '普通表单';
  return {
    name: form.name || form.formName,
    type: rawType.includes('流程') ? '流程表单' : '普通表单',
    uuid: form.uuid || form.formUuid || null,
    module: form.module || null,
  };
}

// ---------------------------------------------------------------------------
// 扫描
// ---------------------------------------------------------------------------

/**
 * 递归扫描本地所有表单目录，读取 JSON 中的 formUuid / formName / formType
 * @param {string} projectDir - 项目根目录
 * @returns {Array<{dirName, fullPath, uuid, name, type, group}>}
 */
function scanLocalFormDirs(projectDir) {
  const result = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentDir, entry.name);

      if (FORM_DIR_REGEX.test(entry.name)) {
        // 表单目录
        let uuid = null;
        let name = entry.name.replace(FORM_DIR_REGEX, '');
        let type = '普通表单';
        const tm = entry.name.match(FORM_DIR_REGEX);
        if (tm) type = tm[1];

        // 提取所属分组（父目录名形如 "XX「分组」"）
        let group = null;
        const groupMatch = path.basename(path.dirname(fullPath)).match(/^(.+?)「分组」$/);
        if (groupMatch) group = groupMatch[1];

        // 读取 JSON 元数据
        try {
          const inner = fs.readdirSync(fullPath);
          const jsonFile = inner.find(f => FORM_JSON_REGEX.test(f));
          if (jsonFile) {
            const data = JSON.parse(fs.readFileSync(path.join(fullPath, jsonFile), 'utf-8'));
            uuid = data.formUuid || null;
            if (data.formName) name = data.formName;
            if (data.formType) type = data.formType;
          }
        } catch (_) {} // JSON 读取失败不影响目录扫描

        result.push({ dirName: entry.name, fullPath, uuid, name, type, group });
      } else {
        // 非表单目录（分组目录等），继续向下搜索
        walk(fullPath);
      }
    }
  }

  walk(projectDir);
  return result;
}

// ---------------------------------------------------------------------------
// 查找与检测
// ---------------------------------------------------------------------------

/**
 * 按 UUID 优先、名字回退的方式查找表单目录
 * 适用于单次查找场景（如同步表单字段）。批量场景请先 scanLocalFormDirs 再自行 find。
 * @returns {string|null} 目录路径
 */
function findFormDir(projectDir, formName, formType, formUuid) {
  const normalizedType = (formType || '普通表单').includes('流程') ? '流程表单' : '普通表单';
  const localForms = scanLocalFormDirs(projectDir);

  if (formUuid) {
    const byUuid = localForms.find(f => f.uuid && f.uuid === formUuid);
    if (byUuid) return byUuid.fullPath;
  }

  const expectedDirName = `${formName}「${normalizedType}」`;
  const byName = localForms.find(f => f.dirName === expectedDirName);
  return byName ? byName.fullPath : null;
}

/**
 * 检查本地表单是否已存在且内容完整（组件ID清单中有字段行）
 * @returns {boolean}
 */
function checkFormExists(projectDir, formName, formType, formUuid) {
  const localForms = scanLocalFormDirs(projectDir);

  let matched = null;
  if (formUuid) {
    matched = localForms.find(f => f.uuid && f.uuid === formUuid);
  }
  if (!matched) {
    const normalizedType = (formType || '普通表单').includes('流程') ? '流程表单' : '普通表单';
    const expectedDirName = `${formName}「${normalizedType}」`;
    matched = localForms.find(f => f.dirName === expectedDirName);
  }

  if (!matched) return false;

  const componentListPath = path.join(matched.fullPath, '组件ID清单.md');
  if (fs.existsSync(componentListPath)) {
    const content = fs.readFileSync(componentListPath, 'utf-8');
    const hasFieldRows = /\|\s*\d+\s*\|.*\|.*\|.*\|/.test(content);
    if (hasFieldRows) return true;
  }

  log(`表单目录存在但内容为空，需要重新同步: ${formName}`, 'yellow');
  return false;
}

// ---------------------------------------------------------------------------
// 改名 / 删除 / 清理
// ---------------------------------------------------------------------------

/**
 * 查找本地多余的表单目录（宜搭中已删除但本地仍存在的）
 * 有 UUID 的按 UUID 判断（改名时不会被误判）；无 UUID 的旧表单按目录名判断。
 * @returns {Array<{dirName, fullPath}>}
 */
function findOrphanFormDirs(projectDir, remoteForms) {
  const normalized = remoteForms.map(normalizeForm);
  const remoteUuids = new Set(normalized.map(f => f.uuid).filter(Boolean));
  const remoteDirNames = new Set(normalized.map(f => `${f.name}「${f.type}」`));

  const localForms = scanLocalFormDirs(projectDir);
  const orphanDirs = [];

  for (const local of localForms) {
    if (local.uuid) {
      if (!remoteUuids.has(local.uuid)) {
        orphanDirs.push({ dirName: local.dirName, fullPath: local.fullPath });
      }
    } else {
      if (!remoteDirNames.has(local.dirName)) {
        orphanDirs.push({ dirName: local.dirName, fullPath: local.fullPath });
      }
    }
  }

  return orphanDirs;
}

/**
 * 按 UUID 匹配重命名改名的表单目录（仅在原父目录下重命名叶子目录名，不跨分组移动）
 * @returns {Array<{from, to}>}
 */
function renameFormDirsIfNeeded(projectDir, remoteForms) {
  const normalized = remoteForms.map(normalizeForm);
  const localForms = scanLocalFormDirs(projectDir);
  const renamed = [];

  for (const remote of normalized) {
    if (!remote.uuid) continue;
    const local = localForms.find(l => l.uuid && l.uuid === remote.uuid);
    if (!local) continue;

    const expectedDirName = `${remote.name}「${remote.type}」`;
    if (local.dirName === expectedDirName) continue;

    const targetDir = path.join(path.dirname(local.fullPath), expectedDirName);
    try {
      if (fs.existsSync(targetDir) && path.resolve(targetDir) !== path.resolve(local.fullPath)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.renameSync(local.fullPath, targetDir);
      log(`   🔄 表单改名: ${local.dirName} → ${expectedDirName}`, 'cyan');
      renamed.push({ from: local.dirName, to: expectedDirName });
    } catch (err) {
      log(`   ⚠️ 重命名失败: ${local.dirName} - ${err.message}`, 'yellow');
    }
  }

  return renamed;
}

/**
 * 删除宜搭平台已删除的表单对应的本地目录
 * @returns {number} 删除数量
 */
function cleanupDeletedForms(projectDir, remoteForms) {
  const orphanDirs = findOrphanFormDirs(projectDir, remoteForms);
  let removed = 0;

  for (const orphan of orphanDirs) {
    try {
      fs.rmSync(orphan.fullPath, { recursive: true, force: true });
      log(`   🗑️ 删除已移除表单: ${orphan.dirName}`, 'reset');
      removed++;
    } catch (err) {
      log(`   ⚠️ 删除失败: ${orphan.dirName} - ${err.message}`, 'yellow');
    }
  }

  if (removed > 0) log(`   ✅ 共清理 ${removed} 个已移除表单目录`, 'green');
  else log('   ✅ 无已移除表单需要清理', 'green');
  return removed;
}

/**
 * 删除已空且不在清单中的分组目录
 * @returns {number} 删除数量
 */
function cleanupEmptyGroups(projectDir, remoteForms) {
  const normalized = remoteForms.map(normalizeForm);
  const keptGroups = new Set(normalized.map(f => f.module).filter(Boolean));

  let removed = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(projectDir, { withFileTypes: true });
  } catch (_) {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const m = entry.name.match(/^(.+?)「分组」$/);
    if (!m) continue;
    if (keptGroups.has(m[1])) continue;

    const groupDir = path.join(projectDir, entry.name);
    let hasFormDir = false;
    try {
      const inner = fs.readdirSync(groupDir, { withFileTypes: true });
      hasFormDir = inner.some(it => it.isDirectory() && FORM_DIR_REGEX.test(it.name));
    } catch (_) {}

    if (!hasFormDir) {
      try {
        fs.rmSync(groupDir, { recursive: true, force: true });
        log(`   🗑️ 删除已移除分组: ${entry.name}`, 'reset');
        removed++;
      } catch (err) {
        log(`   ⚠️ 删除分组失败: ${entry.name} - ${err.message}`, 'yellow');
      }
    }
  }

  if (removed > 0) log(`   ✅ 共清理 ${removed} 个已移除分组目录`, 'green');
  else log('   ✅ 无已移除分组需要清理', 'green');
  return removed;
}

/**
 * 清理根目录下与分组子目录重复的表单目录
 * 场景：表单从根目录迁移到分组子目录后，根目录残留同名目录
 * @returns {number} 删除数量
 */
function cleanupOrphanRootFormDirs(projectRoot, forms) {
  const normalized = forms.map(normalizeForm);
  const groupedForms = normalized.filter(f => f.module);
  if (groupedForms.length === 0) return 0;

  let removedCount = 0;

  for (const form of groupedForms) {
    const expectedFolderName = `${form.name}「${form.type}」`;
    const rootFormDir = path.join(projectRoot, expectedFolderName);

    if (fs.existsSync(rootFormDir) && fs.statSync(rootFormDir).isDirectory()) {
      const groupDirName = `${form.module}「分组」`;
      const groupFormDir = path.join(projectRoot, groupDirName, expectedFolderName);
      if (fs.existsSync(groupFormDir)) {
        try {
          fs.rmSync(rootFormDir, { recursive: true, force: true });
          log(`   🧹 清理根目录重复表单: ${expectedFolderName}（已迁移到 ${groupDirName}/）`, 'reset');
          removedCount++;
        } catch (error) {
          log(`   ⚠️  清理失败: ${expectedFolderName} - ${error.message}`, 'yellow');
        }
      }
    }
  }

  if (removedCount > 0) {
    log(`   ✅ 共清理 ${removedCount} 个根目录重复表单目录`, 'green');
  }
  return removedCount;
}

module.exports = {
  normalizeForm,
  scanLocalFormDirs,
  findFormDir,
  checkFormExists,
  findOrphanFormDirs,
  renameFormDirsIfNeeded,
  cleanupDeletedForms,
  cleanupEmptyGroups,
  cleanupOrphanRootFormDirs,
};
