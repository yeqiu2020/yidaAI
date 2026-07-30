/**
 * lib/core/error.js 单元测试 (Phase 4 - Task 4-1)
 *
 * 测试内容：
 *   - ErrorCode 枚举完整性
 *   - ExitCodeMap 映射正确性
 *   - CliError 类构造、属性、方法
 *   - wrapError 函数
 */

'use strict';

const { CliError, ErrorCode, ExitCodeMap, wrapError } = require('../../lib/core/error');

describe('lib/core/error', () => {
  // ── ErrorCode 枚举 ─────────────────────────────────
  describe('ErrorCode 枚举', () => {
    test('应包含认证类错误码', () => {
      expect(ErrorCode.LOGIN_EXPIRED).toBe('LOGIN_EXPIRED');
      expect(ErrorCode.CSRF_EXPIRED).toBe('CSRF_EXPIRED');
      expect(ErrorCode.NO_COOKIE).toBe('NO_COOKIE');
      expect(ErrorCode.INVALID_COOKIE).toBe('INVALID_COOKIE');
      expect(ErrorCode.AUTO_LOGIN_EXHAUSTED).toBe('AUTO_LOGIN_EXHAUSTED');
      expect(ErrorCode.ENV_INJECT_AUTH_FAILED).toBe('ENV_INJECT_AUTH_FAILED');
    });

    test('应包含网络类错误码', () => {
      expect(ErrorCode.REQUEST_TIMEOUT).toBe('REQUEST_TIMEOUT');
      expect(ErrorCode.REQUEST_ERROR).toBe('REQUEST_ERROR');
      expect(ErrorCode.HTTP_ERROR).toBe('HTTP_ERROR');
    });

    test('应包含参数类错误码', () => {
      expect(ErrorCode.INVALID_PARAM).toBe('INVALID_PARAM');
      expect(ErrorCode.MISSING_PARAM).toBe('MISSING_PARAM');
    });

    test('应包含文件类错误码', () => {
      expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCode.FILE_READ_ERROR).toBe('FILE_READ_ERROR');
      expect(ErrorCode.FILE_WRITE_ERROR).toBe('FILE_WRITE_ERROR');
    });

    test('应包含业务类错误码', () => {
      expect(ErrorCode.API_ERROR).toBe('API_ERROR');
      expect(ErrorCode.SCHEMA_ERROR).toBe('SCHEMA_ERROR');
      expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
    });
  });

  // ── ExitCodeMap ────────────────────────────────────
  describe('ExitCodeMap', () => {
    test('LOGIN_EXPIRED → 10', () => {
      expect(ExitCodeMap[ErrorCode.LOGIN_EXPIRED]).toBe(10);
    });

    test('NO_COOKIE → 12', () => {
      expect(ExitCodeMap[ErrorCode.NO_COOKIE]).toBe(12);
    });

    test('UNKNOWN → 99', () => {
      expect(ExitCodeMap[ErrorCode.UNKNOWN]).toBe(99);
    });

    test('每个 ErrorCode 都有对应的退出码', () => {
      for (const code of Object.values(ErrorCode)) {
        expect(ExitCodeMap[code]).toBeDefined();
        expect(typeof ExitCodeMap[code]).toBe('number');
      }
    });
  });

  // ── CliError 类 ────────────────────────────────────
  describe('CliError 类', () => {
    test('基本构造', () => {
      const err = new CliError(ErrorCode.UNKNOWN, 'Something went wrong');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(CliError);
      expect(err.name).toBe('CliError');
      expect(err.code).toBe(ErrorCode.UNKNOWN);
      expect(err.message).toBe('Something went wrong');
    });

    test('带 options 构造', () => {
      const cause = new Error('original');
      const err = new CliError(ErrorCode.API_ERROR, 'API failed', {
        detail: 'Status 500',
        hint: 'Check network',
        context: { url: 'https://example.com' },
        cause,
      });
      expect(err.detail).toBe('Status 500');
      expect(err.hint).toBe('Check network');
      expect(err.context).toEqual({ url: 'https://example.com' });
      expect(err.cause).toBe(cause);
    });

    test('默认 options 为空', () => {
      const err = new CliError(ErrorCode.UNKNOWN, 'msg');
      expect(err.detail).toBe('');
      expect(err.hint).toBe('');
      expect(err.context).toEqual({});
    });

    test('code 缺省时为 UNKNOWN', () => {
      const err = new CliError(null, 'msg');
      expect(err.code).toBe(ErrorCode.UNKNOWN);
    });

    test('getExitCode() 返回正确的退出码', () => {
      const err = new CliError(ErrorCode.LOGIN_EXPIRED, 'msg');
      expect(err.getExitCode()).toBe(10);
    });

    test('未知 code 的 getExitCode 返回 99', () => {
      const err = new CliError('UNDEFINED_CODE', 'msg');
      expect(err.getExitCode()).toBe(99);
    });

    test('toString() 包含 code 和 message', () => {
      const err = new CliError(ErrorCode.API_ERROR, 'API failed', {
        detail: 'detail info',
        hint: 'hint text',
      });
      const str = err.toString();
      expect(str).toContain('[API_ERROR]');
      expect(str).toContain('API failed');
      expect(str).toContain('详情: detail info');
      expect(str).toContain('建议: hint text');
    });

    test('toJSON() 返回完整对象', () => {
      const err = new CliError(ErrorCode.NO_COOKIE, 'No cookie', {
        detail: 'File not found',
        hint: 'Login first',
        context: { key: 'value' },
      });
      const json = err.toJSON();
      expect(json.name).toBe('CliError');
      expect(json.code).toBe('NO_COOKIE');
      expect(json.message).toBe('No cookie');
      expect(json.detail).toBe('File not found');
      expect(json.hint).toBe('Login first');
      expect(json.context).toEqual({ key: 'value' });
      expect(json.exitCode).toBe(12);
    });
  });

  // ── wrapError ──────────────────────────────────────
  describe('wrapError()', () => {
    test('CliError 原样返回', () => {
      const original = new CliError(ErrorCode.UNKNOWN, 'original');
      const wrapped = wrapError(original);
      expect(wrapped).toBe(original);
    });

    test('普通 Error 包装为 CliError', () => {
      const original = new Error('plain error');
      const wrapped = wrapError(original);
      expect(wrapped).toBeInstanceOf(CliError);
      expect(wrapped.code).toBe(ErrorCode.UNKNOWN);
      expect(wrapped.message).toBe('plain error');
      expect(wrapped.cause).toBe(original);
    });

    test('自定义 defaultCode', () => {
      const original = new Error('plain error');
      const wrapped = wrapError(original, ErrorCode.REQUEST_ERROR);
      expect(wrapped.code).toBe(ErrorCode.REQUEST_ERROR);
    });

    test('非 Error 值也能包装', () => {
      const wrapped = wrapError('string error');
      expect(wrapped).toBeInstanceOf(CliError);
      expect(wrapped.message).toBe('string error');
    });
  });
});
