/**
 * lib/sync-server/config-reader.js — 配置读取模块
 *
 * Phase 6-2: 从 sync_server.js 抽取的系统配置读取函数。
 * v2.11.0: 表单目录扫描/匹配逻辑已迁移至 form-scanner.js，本模块仅保留配置解析。
 *
 * 创建日期：2026-07-10 (Phase 6)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { CONFIG_FILE, unescapeMarkdown, log } = require('./utils');

/**
 * 从系统配置清单读取应用信息和表单列表
 * @returns {{appName, appId, forms: Array<{name, type, uuid}>}|null}
 */
function readSystemConfig(projectDir) {
  const configPath = path.join(projectDir, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');

    // 提取应用名称
    // 【v1.2.1 修复】兼容加粗(**应用名称**)与未加粗(应用名称)两种表头格式，
    // 避免"系统配置清单"中部分应用的表头未加粗导致 appName 解析失败显示"未知应用"
    let appName = '未知应用';
    const appNameMatch = content.match(/\|\s*(?:\*\*)?应用名称(?:\*\*)?\s*\|\s*([^|\n]+)/);
    if (appNameMatch) {
      appName = appNameMatch[1].trim();
    }

    // 提取应用ID（兼容 Markdown 转义：APP\_XXX → APP_XXX；兼容加粗/未加粗表头）
    let appId = null;
    const appIdMatch = content.match(/\|\s*(?:\*\*)?(应用ID|应用编码)(?:\*\*)?\s*\|\s*`?(APP(?:\\?_)[A-Z0-9]+)`?/i);
    if (appIdMatch) {
      appId = unescapeMarkdown(appIdMatch[2]);
    }
    if (!appId) {
      const fallbackMatch = content.match(/\b(APP(?:\\?_)[A-Z0-9]+)\b/);
      if (fallbackMatch) appId = unescapeMarkdown(fallbackMatch[1]);
    }

    // 提取表单列表（格式：| 序号 | 名称「类型」 | UUID | ...）
    const forms = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.includes('「')) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          const nameMatch = cells[1].match(/^(.+?)「(.+?)」/);
          if (nameMatch) {
            forms.push({
              name: nameMatch[1].trim(),
              type: nameMatch[2].trim(),
              uuid: cells[2].trim()
            });
          }
        }
      }
    }

    return { appName, appId, forms };
  } catch (e) {
    log(`读取系统配置清单失败: ${e.message}`, 'red');
    return null;
  }
}

module.exports = {
  readSystemConfig,
};
