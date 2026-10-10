/**
 * lib/sync-server/action-code.js — 表单动作代码提取与落盘模块
 *
 * 从宜搭 getFormSchema 返回的 Schema 中提取表单动作代码
 * （实测结构：schema.actions.module.source，含 didMount/onChange 等全部导出函数的 ES5 源码），
 * 写入表单目录下的「代码」文件夹，命名格式：动作代码_下载版.js（固定名覆盖，v1.2.0 起）。
 * 【动作代码命名规范 2026-09-28 用户定稿】
 * - 动作代码_下载版.js   = 线上代码镜像（每次同步覆盖更新）
 * - 动作代码_推送版.js   = 唯一工作文件（推送固定推它）
 * - 动作代码_推送前备份.js = 推送瞬间线上快照（固定名滚动覆盖）
 * 文件名不再带日期/_v2 等后缀；版本号只在代码内部（头部/加载 toast）体现。
 *
 * 被以下链路共用：
 * - form_creator/scripts/sync_single_form.js（单表单同步 / 原型页"同步动作代码"按钮 --actions-only 模式）
 * - config-sync/scripts/sync_config.js（应用级"同步到本地"）
 *
 * 创建日期：2026-09-28
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** 代码文件夹名（位于表单目录内） */
const CODE_DIR_NAME = '代码';

/**
 * 从 Schema 中提取动作代码源码
 * @param {object} schema - 宜搭 getFormSchema 返回的 Schema 对象
 * @returns {string} 动作代码源码（未配置或为空壳时返回空字符串）
 */
function extractActionCodeSource(schema) {
  if (!schema) return '';

  let source = '';
  // 主结构（实测宜搭 V5 Schema）：actions.module.source
  if (schema.actions && schema.actions.module && typeof schema.actions.module.source === 'string') {
    source = schema.actions.module.source;
  } else if (schema.actions && typeof schema.actions.source === 'string') {
    // 兜底：actions 本身直接挂 source
    source = schema.actions.source;
  }

  source = String(source || '').trim();
  if (!source) return '';

  // 过滤宜搭默认空壳/占位代码（参照 rule-sync 的过滤规则）
  if (source.includes('/*set actions code here*/')) return '';
  if (/^function\s+didMount\s*\(\s*\)\s*\{\s*\}$/.test(source)) return '';

  return source;
}

/**
 * 将动作代码写入表单目录的「代码」文件夹
 * - 未配置动作代码时不建目录、不写文件
 * - 同一天重复同步覆盖同名文件（文件头注释记录最新同步时间）
 *
 * @param {string} formDir - 表单目录（如 .../采购订单「流程表单」）
 * @param {object} meta - 元信息 { formName, formUuid }
 * @param {object} schema - 宜搭 Schema 对象
 * @returns {{hasCode: boolean, filePath?: string, codeLength?: number, skipped?: boolean}}
 */
function saveActionCodeToFormDir(formDir, meta, schema) {
  const source = extractActionCodeSource(schema);
  if (!source) {
    return { hasCode: false };
  }
  if (!formDir) {
    return { hasCode: false, skipped: true };
  }

  const codeDir = path.join(formDir, CODE_DIR_NAME);
  fs.mkdirSync(codeDir, { recursive: true });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // v1.2.0: 固定名覆盖（原 动作代码YYYYMMDD.js，按用户命名规范改为「下载版」）
  const filePath = path.join(codeDir, '动作代码_下载版.js');
  // v1.1.0: 同步元信息从文件头部挪到末尾尾注 — 用户要求本地文件与宜搭 JS 面板
  // 逐行完全一致（包括行号），头部注释会造成对照错位。推送时由
  // action-code-sync.stripHeaderComment 自动剥离本尾注。
  const footer = [
    '',
    '',
    '// ==== 宜搭同步备份信息（推送时自动剥离本段） ====',
    `// 表单名称: ${meta && meta.formName ? meta.formName : ''}`,
    `// 表单UUID: ${meta && meta.formUuid ? meta.formUuid : ''}`,
    `// 同步时间: ${timeStr}`,
    '// 来源: 宜搭平台 getFormSchema API（actions.module.source）',
    '',
  ].join('\n');

  fs.writeFileSync(filePath, source + footer, 'utf-8');

  return { hasCode: true, filePath, codeLength: source.length };
}

module.exports = {
  CODE_DIR_NAME,
  extractActionCodeSource,
  saveActionCodeToFormDir,
};
