/**
 * lib/core/error.js — 统一错误类
 *
 * 实现 CliError 类，采用"核心函数抛异常，最外层 CLI 决定退出码"模式。
 *
 * 设计原则：
 *   - 核心库函数遇到错误时抛出 CliError，不自行调用 process.exit()
 *   - 最外层 CLI 入口捕获 CliError，根据 code 决定退出码和输出格式
 *   - 每个错误包含：错误码 + 用户可读消息 + 详情 + 建议操作
 *
 * 用法：
 *   const { CliError, ErrorCode } = require('./error');
 *   throw new CliError(ErrorCode.LOGIN_EXPIRED, '登录已过期', {
 *     detail: 'Cookie 已失效，需重新登录',
 *     hint: '请运行登录命令重新扫码',
 *   });
 *
 * 创建日期：2026-07-10 (Phase 1)
 */

'use strict';

/**
 * 错误码枚举
 */
const ErrorCode = {
  // 认证类
  LOGIN_EXPIRED: 'LOGIN_EXPIRED',           // 登录过期（需重新扫码登录）
  CSRF_EXPIRED: 'CSRF_EXPIRED',             // CSRF Token 过期（可自动刷新）
  NO_COOKIE: 'NO_COOKIE',                   // 无 Cookie 文件
  INVALID_COOKIE: 'INVALID_COOKIE',         // Cookie 文件格式无效
  AUTO_LOGIN_EXHAUSTED: 'AUTO_LOGIN_EXHAUSTED', // 自动重登录重试次数耗尽
  ENV_INJECT_AUTH_FAILED: 'ENV_INJECT_AUTH_FAILED', // 环境注入模式认证失败（不自动登录）

  // 网络类
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',       // 请求超时
  REQUEST_ERROR: 'REQUEST_ERROR',           // 请求错误（网络异常等）
  HTTP_ERROR: 'HTTP_ERROR',                  // HTTP 状态码错误

  // 参数类
  INVALID_PARAM: 'INVALID_PARAM',           // 参数无效
  MISSING_PARAM: 'MISSING_PARAM',           // 缺少必要参数

  // 文件类
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',         // 文件不存在
  FILE_READ_ERROR: 'FILE_READ_ERROR',       // 文件读取失败
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',     // 文件写入失败

  // 业务类
  API_ERROR: 'API_ERROR',                   // 宜搭 API 返回错误
  SCHEMA_ERROR: 'SCHEMA_ERROR',             // Schema 解析错误
  UNKNOWN: 'UNKNOWN',                       // 未知错误
};

/**
 * 错误码 → 退出码映射
 */
const ExitCodeMap = {
  [ErrorCode.LOGIN_EXPIRED]: 10,
  [ErrorCode.CSRF_EXPIRED]: 11,
  [ErrorCode.NO_COOKIE]: 12,
  [ErrorCode.INVALID_COOKIE]: 13,
  [ErrorCode.AUTO_LOGIN_EXHAUSTED]: 14,
  [ErrorCode.ENV_INJECT_AUTH_FAILED]: 15,
  [ErrorCode.REQUEST_TIMEOUT]: 20,
  [ErrorCode.REQUEST_ERROR]: 21,
  [ErrorCode.HTTP_ERROR]: 22,
  [ErrorCode.INVALID_PARAM]: 30,
  [ErrorCode.MISSING_PARAM]: 31,
  [ErrorCode.FILE_NOT_FOUND]: 40,
  [ErrorCode.FILE_READ_ERROR]: 41,
  [ErrorCode.FILE_WRITE_ERROR]: 42,
  [ErrorCode.API_ERROR]: 50,
  [ErrorCode.SCHEMA_ERROR]: 51,
  [ErrorCode.UNKNOWN]: 99,
};

/**
 * CliError — 统一错误类
 *
 * @property {string} code      - 错误码（见 ErrorCode 枚举）
 * @property {string} message   - 用户可读的错误消息
 * @property {string} [detail]  - 错误详情（技术细节）
 * @property {string} [hint]    - 建议操作（用户应做什么）
 * @property {object} [context] - 附加上下文数据
 */
class CliError extends Error {
  /**
   * @param {string} code     - 错误码
   * @param {string} message  - 用户可读消息
   * @param {object} [options]
   * @param {string} [options.detail]  - 错误详情
   * @param {string} [options.hint]    - 建议操作
   * @param {object} [options.context] - 附加上下文
   * @param {Error}  [options.cause]   - 原始错误
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code || ErrorCode.UNKNOWN;
    this.detail = options.detail || '';
    this.hint = options.hint || '';
    this.context = options.context || {};
    if (options.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * 获取对应的退出码。
   * @returns {number}
   */
  getExitCode() {
    return ExitCodeMap[this.code] !== undefined
      ? ExitCodeMap[this.code]
      : ExitCodeMap[ErrorCode.UNKNOWN];
  }

  /**
   * 格式化为用户友好的字符串。
   * @returns {string}
   */
  toString() {
    const parts = [`[${this.code}] ${this.message}`];
    if (this.detail) {
      parts.push(`  详情: ${this.detail}`);
    }
    if (this.hint) {
      parts.push(`  建议: ${this.hint}`);
    }
    return parts.join('\n');
  }

  /**
   * 转换为 JSON 对象。
   * @returns {object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      detail: this.detail,
      hint: this.hint,
      context: this.context,
      exitCode: this.getExitCode(),
    };
  }
}

/**
 * 将任意错误转换为 CliError。
 * 如果已经是 CliError 则原样返回。
 * @param {Error} err
 * @param {string} [defaultCode]
 * @returns {CliError}
 */
function wrapError(err, defaultCode = ErrorCode.UNKNOWN) {
  if (err instanceof CliError) {
    return err;
  }
  return new CliError(defaultCode, err.message || String(err), {
    detail: err.stack || '',
    cause: err,
  });
}

module.exports = {
  CliError,
  ErrorCode,
  ExitCodeMap,
  wrapError,
};
