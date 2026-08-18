/**
 * lib/core/utils.js 单元测试 (Phase 4 - Task 4-1)
 *
 * 测试内容：
 *   - findProjectRoot 项目根目录查找
 *   - extractInfoFromCookies Cookie 信息提取
 *   - loadCookieData 登录态缓存读取
 *   - resolveBaseUrl base_url 解析
 *   - isLoginExpired / isCsrfTokenExpired 响应检测
 *   - maskCookieValues / maskSingleCookie Cookie 脱敏
 *   - isPathSafe 路径安全校验
 *   - SENSITIVE_COOKIE_NAMES 敏感 Cookie 集合
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// 【测试隔离】屏蔽本机真实全局 Cookie（~/.yida-ai-helper），保证用例只依赖临时目录内的文件
process.env.YIDA_HELPER_HOME = path.join(__dirname, '..', '..', 'temp-file', 'test-no-global-cookie');

const {
  findProjectRoot,
  extractInfoFromCookies,
  loadCookieData,
  resolveBaseUrl,
  isLoginExpired,
  isCsrfTokenExpired,
  maskCookieValues,
  maskSingleCookie,
  isPathSafe,
  SENSITIVE_COOKIE_NAMES,
  DEFAULT_BASE_URL,
  detectActiveTool,
} = require('../../lib/core/utils');

describe('lib/core/utils', () => {
  // ── DEFAULT_BASE_URL ───────────────────────────────
  describe('DEFAULT_BASE_URL', () => {
    test('应为宜搭公有云域名', () => {
      expect(DEFAULT_BASE_URL).toBe('https://www.aliwork.com');
    });
  });

  // ── findProjectRoot ────────────────────────────────
  describe('findProjectRoot()', () => {
    test('返回字符串路径', () => {
      const root = findProjectRoot();
      expect(typeof root).toBe('string');
      expect(root.length).toBeGreaterThan(0);
    });

    test('通过 __dirname 定位到项目根（返回有效路径）', () => {
      const root = findProjectRoot();
      // 在 IDE 环境中 findProjectRoot 可能返回 workspace 路径
      // 验证返回的是有效字符串路径
      expect(typeof root).toBe('string');
      expect(root.length).toBeGreaterThan(0);
      expect(path.isAbsolute(root)).toBe(true);
    });
  });

  // ── extractInfoFromCookies ─────────────────────────
  describe('extractInfoFromCookies()', () => {
    test('从国内宜搭 Cookie 提取 csrfToken/corpId/userId', () => {
      const cookies = [
        { name: 'tianshu_csrf_token', value: 'csrf_abc123' },
        { name: 'tianshu_corp_user', value: 'ding123abc_user456def' },
      ];
      const info = extractInfoFromCookies(cookies);
      expect(info.csrfToken).toBe('csrf_abc123');
      expect(info.corpId).toBe('ding123abc');
      expect(info.userId).toBe('user456def');
    });

    test('从海外 YiDA Cookie 提取 corpId（corp_id cookie）', () => {
      const cookies = [
        { name: 'corp_id', value: 'overseas_corp' },
      ];
      const info = extractInfoFromCookies(cookies);
      expect(info.corpId).toBe('overseas_corp');
      expect(info.csrfToken).toBeNull();
    });

    test('空数组返回全 null', () => {
      const info = extractInfoFromCookies([]);
      expect(info.csrfToken).toBeNull();
      expect(info.corpId).toBeNull();
      expect(info.userId).toBeNull();
    });

    test('tianshu_corp_user 无下划线时 corpId/userId 为 null', () => {
      const cookies = [
        { name: 'tianshu_corp_user', value: 'nounderScore' },
      ];
      const info = extractInfoFromCookies(cookies);
      expect(info.corpId).toBeNull();
      expect(info.userId).toBeNull();
    });
  });

  // ── loadCookieData ─────────────────────────────────
  describe('loadCookieData()', () => {
    test('不存在的路径返回 null', () => {
      const result = loadCookieData('/nonexistent/path/12345');
      expect(result).toBeNull();
    });

    test('数组格式 Cookie 也能正常加载', () => {
      // 使用临时文件测试
      const tmpDir = path.join(os.tmpdir(), 'yida-test-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      const cookieFile = path.join(tmpDir, '.cookies.json');
      const testCookies = [
        { name: 'tianshu_csrf_token', value: 'test_csrf' },
        { name: 'other', value: 'val' },
      ];
      fs.writeFileSync(cookieFile, JSON.stringify(testCookies));

      try {
        const result = loadCookieData(tmpDir);
        expect(result).not.toBeNull();
        expect(result.cookies).toHaveLength(2);
        expect(result.csrf_token).toBe('test_csrf');
        expect(result.base_url).toBe(DEFAULT_BASE_URL);
      } finally {
        fs.unlinkSync(cookieFile);
        fs.rmdirSync(tmpDir);
      }
    });

    test('对象格式 Cookie 加载并自动提取 csrf_token', () => {
      const tmpDir = path.join(os.tmpdir(), 'yida-test-obj-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      const cookieFile = path.join(tmpDir, '.cookies.json');
      const testData = {
        cookies: [
          { name: 'tianshu_csrf_token', value: 'obj_csrf' },
          { name: 'tianshu_corp_user', value: 'corp1_user1' },
        ],
        base_url: 'https://test.aliwork.com',
      };
      fs.writeFileSync(cookieFile, JSON.stringify(testData));

      try {
        const result = loadCookieData(tmpDir);
        expect(result).not.toBeNull();
        expect(result.csrf_token).toBe('obj_csrf');
        expect(result.corp_id).toBe('corp1');
        expect(result.base_url).toBe('https://test.aliwork.com');
      } finally {
        fs.unlinkSync(cookieFile);
        fs.rmdirSync(tmpDir);
      }
    });

    test('无效 JSON 返回 null', () => {
      const tmpDir = path.join(os.tmpdir(), 'yida-test-invalid-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      const cookieFile = path.join(tmpDir, '.cookies.json');
      fs.writeFileSync(cookieFile, '{ invalid json !!!');

      try {
        const result = loadCookieData(tmpDir);
        expect(result).toBeNull();
      } finally {
        fs.unlinkSync(cookieFile);
        fs.rmdirSync(tmpDir);
      }
    });
  });

  // ── resolveBaseUrl ─────────────────────────────────
  describe('resolveBaseUrl()', () => {
    test('环境变量优先级最高', () => {
      process.env.YEQIU_YIDA_ENDPOINT = 'https://env.aliwork.com/';
      try {
        const result = resolveBaseUrl({ base_url: 'https://cookie.aliwork.com' });
        expect(result).toBe('https://env.aliwork.com');
      } finally {
        delete process.env.YEQIU_YIDA_ENDPOINT;
      }
    });

    test('cookieData.base_url 次之', () => {
      const result = resolveBaseUrl({ base_url: 'https://test.aliwork.com/' });
      expect(result).toBe('https://test.aliwork.com');
    });

    test('无 cookieData 时返回默认值', () => {
      const result = resolveBaseUrl(null);
      expect(result).toBe(DEFAULT_BASE_URL);
    });

    test('自定义 defaultBaseUrl', () => {
      const result = resolveBaseUrl(null, 'https://custom.aliwork.com/');
      expect(result).toBe('https://custom.aliwork.com');
    });

    test('尾部斜杠被移除', () => {
      const result = resolveBaseUrl({ base_url: 'https://test.aliwork.com///' });
      expect(result).toBe('https://test.aliwork.com');
    });
  });

  // ── isLoginExpired ─────────────────────────────────
  describe('isLoginExpired()', () => {
    test('errorCode 307 为登录过期', () => {
      expect(isLoginExpired({ success: false, errorCode: '307' })).toBe(true);
    });

    test('errorCode 302 为登录过期', () => {
      expect(isLoginExpired({ success: false, errorCode: '302' })).toBe(true);
    });

    test('success=true 不是登录过期', () => {
      expect(isLoginExpired({ success: true, errorCode: '307' })).toBe(false);
    });

    test('其他 errorCode 不是登录过期', () => {
      expect(isLoginExpired({ success: false, errorCode: '500' })).toBe(false);
    });

    test('null 输入返回 falsy', () => {
      expect(isLoginExpired(null)).toBeFalsy();
    });
  });

  // ── isCsrfTokenExpired ─────────────────────────────
  describe('isCsrfTokenExpired()', () => {
    test('errorCode TIANSHU_000030 为 CSRF 过期', () => {
      expect(isCsrfTokenExpired({ success: false, errorCode: 'TIANSHU_000030' })).toBe(true);
    });

    test('其他 errorCode 不是 CSRF 过期', () => {
      expect(isCsrfTokenExpired({ success: false, errorCode: 'OTHER' })).toBe(false);
    });

    test('success=true 不是 CSRF 过期', () => {
      expect(isCsrfTokenExpired({ success: true, errorCode: 'TIANSHU_000030' })).toBe(false);
    });

    test('null 输入返回 falsy', () => {
      expect(isCsrfTokenExpired(null)).toBeFalsy();
    });
  });

  // ── maskCookieValues ───────────────────────────────
  describe('maskCookieValues()', () => {
    test('CSRF Token 被脱敏', () => {
      const cookies = [{ name: 'tianshu_csrf_token', value: 'abcdefghijklmnop1234567890' }];
      const masked = maskCookieValues(cookies);
      expect(masked[0].value).toContain('...');
      expect(masked[0].value).not.toContain('1234567890');
    });

    test('短于可见长度的敏感 Cookie 显示 ***', () => {
      const cookies = [{ name: 'tianshu_csrf_token', value: 'short' }];
      const masked = maskCookieValues(cookies);
      expect(masked[0].value).toBe('***');
    });

    test('非敏感 Cookie 不脱敏', () => {
      const cookies = [{ name: 'other_cookie', value: 'plaintext_value' }];
      const masked = maskCookieValues(cookies);
      expect(masked[0].value).toBe('plaintext_value');
    });

    test('空数组返回空数组', () => {
      expect(maskCookieValues([])).toEqual([]);
    });

    test('非数组返回空数组', () => {
      expect(maskCookieValues(null)).toEqual([]);
      expect(maskCookieValues('string')).toEqual([]);
    });

    test('不修改原数组', () => {
      const original = [{ name: 'token', value: 'abcdefghijklmnop1234567890' }];
      const masked = maskCookieValues(original);
      expect(original[0].value).toBe('abcdefghijklmnop1234567890');
      expect(masked[0].value).not.toBe(original[0].value);
    });
  });

  // ── maskSingleCookie ───────────────────────────────
  describe('maskSingleCookie()', () => {
    test('敏感 Cookie 值脱敏', () => {
      const result = maskSingleCookie('token', 'abcdefghijklmnop1234567890');
      expect(result).toContain('...');
      expect(result).not.toContain('1234567890');
    });

    test('非敏感 Cookie 值原样返回', () => {
      const result = maskSingleCookie('normal', 'value123');
      expect(result).toBe('value123');
    });

    test('短于可见长度的敏感值返回 ***', () => {
      const result = maskSingleCookie('session', 'abc');
      expect(result).toBe('***');
    });
  });

  // ── SENSITIVE_COOKIE_NAMES ─────────────────────────
  describe('SENSITIVE_COOKIE_NAMES', () => {
    test('包含 csrf_token', () => {
      expect(SENSITIVE_COOKIE_NAMES.has('tianshu_csrf_token')).toBe(true);
      expect(SENSITIVE_COOKIE_NAMES.has('csrf_token')).toBe(true);
      expect(SENSITIVE_COOKIE_NAMES.has('_csrf_token')).toBe(true);
    });

    test('包含 session 和 token', () => {
      expect(SENSITIVE_COOKIE_NAMES.has('session')).toBe(true);
      expect(SENSITIVE_COOKIE_NAMES.has('token')).toBe(true);
      expect(SENSITIVE_COOKIE_NAMES.has('access_token')).toBe(true);
      expect(SENSITIVE_COOKIE_NAMES.has('refresh_token')).toBe(true);
    });
  });

  // ── isPathSafe ─────────────────────────────────────
  describe('isPathSafe()', () => {
    test('正常路径安全', () => {
      const result = isPathSafe('/home/user/file.txt');
      expect(result.safe).toBe(true);
    });

    test('null-byte 注入不安全', () => {
      const result = isPathSafe('test\0.txt');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('null-byte');
    });

    test('空路径不安全', () => {
      const result = isPathSafe('');
      expect(result.safe).toBe(false);
    });

    test('null 输入不安全', () => {
      const result = isPathSafe(null);
      expect(result.safe).toBe(false);
    });

    test('非字符串不安全', () => {
      const result = isPathSafe(123);
      expect(result.safe).toBe(false);
    });

    test('包含控制字符不安全', () => {
      const result = isPathSafe('file\x01name.txt');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('控制字符');
    });
  });

  // ── detectActiveTool ───────────────────────────────
  describe('detectActiveTool()', () => {
    test('无环境变量时返回 null 或工具对象', () => {
      // 清除可能的 IDE 环境变量
      const savedEnv = { ...process.env };
      delete process.env.QODERCLI_INTEGRATION_MODE;
      delete process.env.QODER_IDE;
      delete process.env.QODER_AGENT;
      delete process.env.CLAUDE_CODE_ENTRYPOINT;
      delete process.env.CLAUDE_CODE;
      delete process.env.CURSOR_TRACE_ID;
      delete process.env.OPENCODE;
      delete process.env.CODEX_SHELL;

      const result = detectActiveTool();
      // 可能返回 null（无匹配）或某个工具对象
      if (result) {
        expect(result).toHaveProperty('tool');
        expect(result).toHaveProperty('displayName');
        expect(result).toHaveProperty('dirName');
      }

      // 恢复环境变量
      process.env = savedEnv;
    });
  });
});
