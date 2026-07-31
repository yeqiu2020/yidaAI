'use strict';

/**
 * gate-audit.js
 *
 * 门禁旁路审计留痕：两处逃生口（precommit 的 SKIP_YIDA_VALIDATE、
 * integration-create 的 --force-save）生效时，把时间/原因/上下文追加写入
 * 仓库内日志文件（JSON Lines，一行一条）。只做留痕，不参与门禁判定。
 *
 * 日志路径解析优先级：显式入参 > 环境变量 YIDA_GATE_AUDIT_LOG（测试用）> 默认仓库路径。
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AUDIT_LOG_PATH = path.join(REPO_ROOT, 'logs', 'gate-bypass-audit.log');

/**
 * 追加一条门禁旁路审计记录。
 * @param {Object} entry 记录内容，至少包含 gate 与 reason 字段
 * @param {string} [logPath] 日志文件路径（默认 logs/gate-bypass-audit.log）
 * @returns {string} 实际写入的日志文件路径
 */
function appendGateBypassAudit(entry, logPath) {
  const target = logPath || process.env.YIDA_GATE_AUDIT_LOG || AUDIT_LOG_PATH;
  const record = Object.assign({ time: new Date().toISOString() }, entry);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, JSON.stringify(record) + '\n', 'utf-8');
  return target;
}

module.exports = { appendGateBypassAudit, AUDIT_LOG_PATH };
