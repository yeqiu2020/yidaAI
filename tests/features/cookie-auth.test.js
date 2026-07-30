/**
 * 核心功能测试：Cookie/认证加载 (Phase 4 - Task 4-2)
 *
 * 测试 Cookie 和认证相关的核心功能：
 *   - loadCookieData 登录态缓存读取
 *   - extractInfoFromCookies Cookie 信息提取
 *   - resolveBaseUrl base_url 解析优先级
 *   - isLoginExpired / isCsrfTokenExpired 响应检测
 *   - maskCookieValues Cookie 脱敏
 *   - Cookie 文件格式兼容性（数组/对象）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadCookieData,
  extractInfoFromCookies,
  resolveBaseUrl,
  isLoginExpired,
  isCsrfTokenExpired,
  maskCookieValues,
  maskSingleCookie,
  SENSITIVE_COOKIE_NAMES,
  DEFAULT_BASE_URL,
} = require('../../lib/core/utils');

describe('核心功能：Cookie/认证加载', () => {
  // ── Cookie 文件格式兼容 ────────────────────────────
  describe('Cookie 文件格式兼容', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = path.join(os.tmpdir(), 'yida-cookie-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      try {
        const cookieFile = path.join(tmpDir, '.cookies.json');
        if (fs.existsSync(cookieFile)) fs.unlinkSync(cookieFile);
        fs.rmdirSync(tmpDir);
      } catch { /* 忽略 */ }
    });

    test('数组格式 Cookie（旧格式）可加载', () => {
      const cookieFile = path.join(tmpDir, '.cookies.json');
      const cookies = [
        { name: 'test', value: 'val', domain: '.aliwork.com' },
      ];
      fs.writeFileSync(cookieFile, JSON.stringify(cookies));

      const result = loadCookieData(tmpDir);
      expect(result).not.toBeNull();
      expect(result.cookies).toHaveLength(1);
      expect(result.base_url).toBe(DEFAULT_BASE_URL);
    });

    test('对象格式 Cookie（新格式）可加载', () => {
      const cookieFile = path.join(tmpDir, '.cookies.json');
      const data = {
        cookies: [{ name: 'test', value: 'val' }],
        base_url: 'https://test.aliwork.com',
        csrf_token: 'token123',
      };
      fs.writeFileSync(cookieFile, JSON.stringify(data));

      const result = loadCookieData(tmpDir);
      expect(result).not.toBeNull();
      expect(result.base_url).toBe('https://test.aliwork.com');
      expect(result.csrf_token).toBe('token123');
    });

    test('自动从 Cookie 提取 csrf_token', () => {
      const cookieFile = path.join(tmpDir, '.cookies.json');
      const data = {
        cookies: [
          { name: 'tianshu_csrf_token', value: 'auto_extracted_token' },
        ],
      };
      fs.writeFileSync(cookieFile, JSON.stringify(data));

      const result = loadCookieData(tmpDir);
      expect(result.csrf_token).toBe('auto_extracted_token');
    });

    test('自动从 Cookie 提取 corp_id 和 user_id', () => {
      const cookieFile = path.join(tmpDir, '.cookies.json');
      const data = {
        cookies: [
          { name: 'tianshu_corp_user', value: 'ding_corp123_user456' },
        ],
      };
      fs.writeFileSync(cookieFile, JSON.stringify(data));

      const result = loadCookieData(tmpDir);
      expect(result.corp_id).toBe('ding_corp123');
      expect(result.user_id).toBe('user456');
    });

    test('不存在的文件返回 null', () => {
      expect(loadCookieData('/nonexistent/path')).toBeNull();
    });

    test('空文件返回 null', () => {
      const cookieFile = path.join(tmpDir, '.cookies.json');
      fs.writeFileSync(cookieFile, '');

      expect(loadCookieData(tmpDir)).toBeNull();
    });

    test('无效 JSON 返回 null', () => {
      const cookieFile = path.join(tmpDir, '.cookies.json');
      fs.writeFileSync(cookieFile, '{ invalid }');

      expect(loadCookieData(tmpDir)).toBeNull();
    });
  });

  // ── extractInfoFromCookies ─────────────────────────
  describe('Cookie 信息提取', () => {
    test('提取 CSRF Token', () => {
      const cookies = [{ name: 'tianshu_csrf_token', value: 'csrf_abc' }];
      const info = extractInfoFromCookies(cookies);
      expect(info.csrfToken).toBe('csrf_abc');
    });

    test('提取 corpId 和 userId（国内格式，按最后一个下划线切分）', () => {
      const cookies = [
        { name: 'tianshu_corp_user', value: 'ding_corp123_user456' },
      ];
      const info = extractInfoFromCookies(cookies);
      // 按最后一个下划线切分：corpId=ding_corp123, userId=user456
      expect(info.corpId).toBe('ding_corp123');
      expect(info.userId).toBe('user456');
    });

    test('海外 YiDA 格式 corpId', () => {
      const cookies = [{ name: 'corp_id', value: 'overseas_corp' }];
      const info = extractInfoFromCookies(cookies);
      expect(info.corpId).toBe('overseas_corp');
    });

    test('无认证信息的 Cookie', () => {
      const cookies = [{ name: 'preferences', value: 'dark_mode' }];
      const info = extractInfoFromCookies(cookies);
      expect(info.csrfToken).toBeNull();
      expect(info.corpId).toBeNull();
      expect(info.userId).toBeNull();
    });
  });

  // ── resolveBaseUrl 优先级 ──────────────────────────
  describe('base_url 解析优先级', () => {
    afterEach(() => {
      delete process.env.YEQIU_YIDA_ENDPOINT;
    });

    test('环境变量 > cookieData', () => {
      process.env.YEQIU_YIDA_ENDPOINT = 'https://env.aliwork.com';
      const result = resolveBaseUrl({ base_url: 'https://cookie.aliwork.com' });
      expect(result).toBe('https://env.aliwork.com');
    });

    test('cookieData > 默认值', () => {
      const result = resolveBaseUrl({ base_url: 'https://cookie.aliwork.com' });
      expect(result).toBe('https://cookie.aliwork.com');
    });

    test('无 cookieData 返回默认值', () => {
      const result = resolveBaseUrl(null);
      expect(result).toBe(DEFAULT_BASE_URL);
    });

    test('尾部斜杠被清除', () => {
      process.env.YEQIU_YIDA_ENDPOINT = 'https://env.aliwork.com//';
      expect(resolveBaseUrl(null)).toBe('https://env.aliwork.com');
    });
  });

  // ── 响应检测 ───────────────────────────────────────
  describe('响应检测', () => {
    test('登录过期检测（errorCode 307）', () => {
      expect(isLoginExpired({ success: false, errorCode: '307' })).toBe(true);
    });

    test('登录过期检测（errorCode 302）', () => {
      expect(isLoginExpired({ success: false, errorCode: '302' })).toBe(true);
    });

    test('CSRF 过期检测（TIANSHU_000030）', () => {
      expect(isCsrfTokenExpired({ success: false, errorCode: 'TIANSHU_000030' })).toBe(true);
    });

    test('正常响应不触发检测', () => {
      expect(isLoginExpired({ success: true, errorCode: '200' })).toBe(false);
      expect(isCsrfTokenExpired({ success: true, errorCode: '200' })).toBe(false);
    });
  });

  // ── Cookie 脱敏 ────────────────────────────────────
  describe('Cookie 脱敏', () => {
    test('CSRF Token 脱敏（值超过可见长度）', () => {
      const masked = maskCookieValues([
        { name: 'tianshu_csrf_token', value: 'abcdefghijklmnop1234567890' },
      ]);
      expect(masked[0].value).toContain('...');
      expect(masked[0].value).not.toContain('1234567890');
    });

    test('CSRF Token 脱敏（值短于可见长度）', () => {
      const masked = maskCookieValues([
        { name: 'tianshu_csrf_token', value: 'short' },
      ]);
      expect(masked[0].value).toBe('***');
    });

    test('session Token 脱敏', () => {
      const masked = maskCookieValues([
        { name: 'session', value: 'abcdefghijklmnop1234567890' },
      ]);
      expect(masked[0].value).toContain('...');
    });

    test('access_token 脱敏', () => {
      const masked = maskCookieValues([
        { name: 'access_token', value: 'abcdefghijklmnop1234567890' },
      ]);
      expect(masked[0].value).toContain('...');
    });

    test('非敏感 Cookie 不脱敏', () => {
      const masked = maskCookieValues([
        { name: 'user_prefs', value: 'dark_mode_on' },
      ]);
      expect(masked[0].value).toBe('dark_mode_on');
    });

    test('脱敏不修改原数组', () => {
      const original = [{ name: 'token', value: 'abcdefghijklmnop1234567890' }];
      const masked = maskCookieValues(original);
      expect(original[0].value).toBe('abcdefghijklmnop1234567890');
      expect(masked[0].value).not.toBe(original[0].value);
    });

    test('maskSingleCookie: 敏感值', () => {
      const result = maskSingleCookie('token', 'abcdefghijklmnop1234567890');
      expect(result).toContain('...');
    });

    test('maskSingleCookie: 非敏感值', () => {
      const result = maskSingleCookie('normal', 'value123');
      expect(result).toBe('value123');
    });
  });
});
