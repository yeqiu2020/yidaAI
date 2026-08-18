/**
 * lib/sync-server/org-config.js — 组织配置管理模块
 *
 * Phase 6-2: 从 sync_server.js 抽取的组织及应用信息管理函数。
 * 实现与原 sync_server.js 完全一致。
 *
 * 创建日期：2026-07-10 (Phase 6)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { log, escapeRegExp } = require('./utils');

/**
 * 将新应用添加到组织及应用信息.md的应用列表中
 * @param {string} projectDir - 项目目录（必须显式传入，禁止依赖 process.cwd()）
 * @param {string} appName - 应用名称
 * @param {string} appId - 应用ID，默认为'待创建'
 */
function addAppToOrgConfig(projectDir, appName, appId = '待创建') {
  const orgConfigPath = path.join(projectDir, '组织及应用信息.md');
  if (!fs.existsSync(orgConfigPath)) {
    log('组织及应用信息.md 不存在，跳过注册新应用', 'yellow');
    return false;
  }

  try {
    const content = fs.readFileSync(orgConfigPath, 'utf-8');
    const lines = content.split('\n');

    // 定位「应用列表」section 内的表格范围
    const sectionIdx = lines.findIndex(l => l.trim() === '## 应用列表');
    if (sectionIdx === -1) {
      log('未找到「应用列表」section，跳过注册', 'yellow');
      return false;
    }

    let tableStart = -1;
    let tableEnd = lines.length;
    for (let i = sectionIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('## ')) {
        tableEnd = i;
        break;
      }
      if (tableStart === -1 && line.trim().startsWith('|') && line.includes('应用名称')) {
        tableStart = i;
      }
    }
    if (tableStart === -1) {
      log('未找到应用列表表格，跳过注册', 'yellow');
      return false;
    }

    // 检查应用是否已存在（限定在表格内，且是有效数据行）
    let maxNum = 0;
    let existsInTable = false;
    let insertIndex = tableEnd;

    for (let i = tableStart + 1; i < tableEnd; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed.startsWith('|') || trimmed.startsWith('|--') || trimmed.startsWith('| ---')) continue;
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
        maxNum = Math.max(maxNum, parseInt(cells[0], 10));
        if (cells[1] === appName) {
          existsInTable = true;
        }
      }
      // 记录最后一个数据行之后的位置作为插入点
      insertIndex = i + 1;
    }

    if (existsInTable) {
      log(`应用【${appName}】已在应用列表中，跳过`, 'yellow');
      return false;
    }

    // 插入新行到表格末尾
    const newNum = maxNum + 1;
    const newRow = `| ${newNum} | ${appName} | ${appId} |`;
    lines.splice(insertIndex, 0, newRow);

    fs.writeFileSync(orgConfigPath, lines.join('\n'), 'utf-8');
    log(`应用【${appName}】已注册到组织信息（序号 ${newNum}）`, 'green');
    return true;
  } catch (error) {
    log(`注册应用到组织信息失败: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 从 Markdown 内容中定位到指定 section，删除表格中匹配的行
 * @param {string} content - 文件内容
 * @param {string} sectionTitle - section 标题（不含 ##）
 * @param {Function} matchFn - (cells) => boolean，判断当前行是否应删除
 * @param {boolean} renumber - 删除后是否对第一列重新编号
 * @returns {{content: string, removed: boolean}}
 */
function removeRowFromSection(content, sectionTitle, matchFn, renumber = false) {
  const lines = content.split('\n');
  const sectionMarker = `## ${sectionTitle}`;
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === sectionMarker) {
      sectionStart = i;
      break;
    }
  }
  if (sectionStart === -1) return { content, removed: false };

  // 定位 section 内表格范围
  let tableStart = -1;
  let tableEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('## ')) {
      tableEnd = i;
      break;
    }
    if (tableStart === -1 && line.trim().startsWith('|') && (line.includes('应用名称') || line.includes('序号'))) {
      tableStart = i;
    }
  }
  if (tableStart === -1) return { content, removed: false };

  const newLines = [];
  let removed = false;
  let seq = 1;
  for (let i = 0; i < lines.length; i++) {
    if (i >= tableStart && i < tableEnd) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && !trimmed.startsWith('|--') && !trimmed.startsWith('| ---')) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
        if (matchFn(cells)) {
          removed = true;
          continue;
        }
        if (renumber && cells.length >= 3 && /^\d+$/.test(cells[0])) {
          newLines.push(line.replace(/^\|\s*\d+\s*\|/, `| ${seq} |`));
          seq++;
          continue;
        }
      }
    }
    newLines.push(lines[i]);
  }
  return { content: newLines.join('\n'), removed };
}

/**
 * 删除本地应用信息
 * 1. 从组织及应用信息.md 的应用列表和原型页面访问地址中移除记录
 * 2. 删除本地项目文件夹
 * @param {string} projectDir - 项目目录（必须显式传入，禁止依赖 process.cwd()）
 * @param {string} appName - 应用名称
 * @param {string} appId - 应用ID
 */
function deleteLocalApp(projectDir, appName, appId) {
  const orgConfigPath = path.join(projectDir, '组织及应用信息.md');
  let removedFromConfig = false;
  let removedFolder = false;
  let removedOrphanRows = 0;
  const errors = [];

  // 1. 从组织配置中移除
  if (fs.existsSync(orgConfigPath)) {
    try {
      let content = fs.readFileSync(orgConfigPath, 'utf-8');

      // 1.1 从「应用列表」section 内删除
      const r1 = removeRowFromSection(
        content,
        '应用列表',
        cells => cells.length >= 3 && cells[1] === appName,
        true
      );
      content = r1.content;

      // 1.2 从「原型页面访问地址」section 内删除
      const r2 = removeRowFromSection(
        content,
        '原型页面访问地址',
        cells => cells.length >= 3 && cells[0] === appName,
        false
      );
      content = r2.content;

      // 1.3 容错：扫描整个文件，删除任何包含该应用名称的孤立表格行
      const lines = content.split('\n');
      const newLines = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|') && !trimmed.startsWith('|--') && !trimmed.startsWith('| ---')) {
          const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
          if (cells.length >= 3 && /^\d+$/.test(cells[0]) && cells[1] === appName) {
            removedOrphanRows++;
            continue;
          }
        }
        newLines.push(line);
      }
      content = newLines.join('\n');

      if (r1.removed || r2.removed || removedOrphanRows > 0) {
        fs.writeFileSync(orgConfigPath, content, 'utf-8');
        removedFromConfig = true;
        log(`已从组织配置移除应用【${appName}】`, 'green');
      }
    } catch (error) {
      errors.push(`更新组织配置失败: ${error.message}`);
      log(`更新组织配置失败: ${error.message}`, 'red');
    }
  }

  // 2. 删除本地项目文件夹
  const projectDir_app = path.join(projectDir, appName);
  if (fs.existsSync(projectDir_app)) {
    try {
      fs.rmSync(projectDir_app, { recursive: true, force: true });
      removedFolder = true;
      log(`已删除本地项目文件夹: ${projectDir_app}`, 'green');
    } catch (error) {
      errors.push(`删除项目文件夹失败: ${error.message}`);
      log(`删除项目文件夹失败: ${error.message}`, 'red');
    }
  }

  return {
    success: removedFromConfig || removedFolder,
    appName,
    appId,
    removedFromConfig,
    removedFolder,
    removedOrphanRows,
    errors: errors.length > 0 ? errors : undefined
  };
}

module.exports = {
  addAppToOrgConfig,
  removeRowFromSection,
  deleteLocalApp,
};
