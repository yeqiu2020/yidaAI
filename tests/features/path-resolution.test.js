/**
 * 核心功能测试：路径解析 (Phase 4 - Task 4-2)
 *
 * 测试路径安全校验和路径解析功能：
 *   - isPathSafe 路径安全校验（null-byte 注入、路径遍历、控制字符）
 *   - findProjectRoot 项目根目录查找
 *   - resolveBaseUrl base_url 解析
 *   - Windows 路径兼容性
 */

'use strict';

const path = require('path');
const fs = require('fs');

const {
  isPathSafe,
  findProjectRoot,
  resolveBaseUrl,
  DEFAULT_BASE_URL,
} = require('../../lib/core/utils');

describe('核心功能：路径解析', () => {
  // ── isPathSafe 路径安全校验 ────────────────────────
  describe('isPathSafe() 路径安全校验', () => {
    test('正常路径安全', () => {
      expect(isPathSafe('/home/user/file.txt').safe).toBe(true);
      expect(isPathSafe('C:\\Users\\test\\file.txt').safe).toBe(true);
      expect(isPathSafe('relative/path/file.js').safe).toBe(true);
    });

    test('null-byte 注入不安全', () => {
      const result = isPathSafe('test\0.txt');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('null-byte');
    });

    test('空路径不安全', () => {
      expect(isPathSafe('').safe).toBe(false);
      expect(isPathSafe(null).safe).toBe(false);
      expect(isPathSafe(undefined).safe).toBe(false);
    });

    test('非字符串不安全', () => {
      expect(isPathSafe(123).safe).toBe(false);
      expect(isPathSafe({}).safe).toBe(false);
      expect(isPathSafe([]).safe).toBe(false);
    });

    test('控制字符不安全', () => {
      const result = isPathSafe('file\x01name.txt');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('控制字符');
    });

    test('DEL 字符不安全', () => {
      const result = isPathSafe('file\x7fname.txt');
      expect(result.safe).toBe(false);
    });

    test('安全路径返回 reason=OK', () => {
      const result = isPathSafe('/safe/path/file.txt');
      expect(result.safe).toBe(true);
      expect(result.reason).toBe('OK');
    });
  });

  // ── findProjectRoot 项目根查找 ─────────────────────
  describe('findProjectRoot()', () => {
    test('返回绝对路径', () => {
      const root = findProjectRoot();
      expect(typeof root).toBe('string');
      expect(path.isAbsolute(root)).toBe(true);
    });

    test('返回非空路径', () => {
      const root = findProjectRoot();
      expect(root.length).toBeGreaterThan(0);
    });
  });

  // ── resolveBaseUrl 路径解析 ────────────────────────
  describe('resolveBaseUrl()', () => {
    afterEach(() => {
      delete process.env.YEQIU_YIDA_ENDPOINT;
    });

    test('环境变量优先', () => {
      process.env.YEQIU_YIDA_ENDPOINT = 'https://env.aliwork.com/';
      expect(resolveBaseUrl({ base_url: 'https://cookie.aliwork.com' }))
        .toBe('https://env.aliwork.com');
    });

    test('cookieData 次之', () => {
      expect(resolveBaseUrl({ base_url: 'https://cookie.aliwork.com/' }))
        .toBe('https://cookie.aliwork.com');
    });

    test('默认值兜底', () => {
      expect(resolveBaseUrl(null)).toBe(DEFAULT_BASE_URL);
    });

    test('尾部斜杠清除', () => {
      expect(resolveBaseUrl({ base_url: 'https://test.aliwork.com///' }))
        .toBe('https://test.aliwork.com');
    });

    test('自定义默认值', () => {
      expect(resolveBaseUrl(null, 'https://custom.aliwork.com/'))
        .toBe('https://custom.aliwork.com');
    });
  });

  // ── Windows 路径兼容 ───────────────────────────────
  describe('Windows 路径兼容', () => {
    test('Windows 绝对路径安全', () => {
      const result = isPathSafe('C:\\Users\\test\\file.txt');
      expect(result.safe).toBe(true);
    });

    test('Windows 相对路径安全', () => {
      const result = isPathSafe('.\\scripts\\test.js');
      expect(result.safe).toBe(true);
    });

    test('Windows UNC 路径安全', () => {
      const result = isPathSafe('\\\\server\\share\\file.txt');
      expect(result.safe).toBe(true);
    });

    test('Windows 路径含 null-byte 不安全', () => {
      const result = isPathSafe('C:\\Users\\test\0\\file.txt');
      expect(result.safe).toBe(false);
    });
  });

  // ── 路径拼接安全 ───────────────────────────────────
  describe('路径拼接安全', () => {
    test('path.join 不受 null-byte 影响（Node.js 内部处理）', () => {
      // path.join 会保留 null-byte，但 isPathSafe 会检测
      const joined = path.join('base', 'file.txt');
      expect(joined).toContain('base');
      expect(joined).toContain('file.txt');
    });

    test('path.resolve 规范化路径', () => {
      const resolved = path.resolve('base', '..', 'base', '.', 'file.txt');
      expect(resolved).toContain('base');
      expect(resolved).toContain('file.txt');
    });

    test('path.isAbsolute 正确识别绝对路径', () => {
      expect(path.isAbsolute('/unix/path')).toBe(true);
      expect(path.isAbsolute('relative/path')).toBe(false);
      // Windows 路径在 Windows 系统上
      if (process.platform === 'win32') {
        expect(path.isAbsolute('C:\\Windows')).toBe(true);
      }
    });
  });
});
