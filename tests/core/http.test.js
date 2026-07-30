/**
 * lib/core/http.js 单元测试 (Phase 4 - Task 4-1)
 *
 * 测试内容：
 *   - 内部工具函数：parseUrl, filterCookiesByDomain, buildCookieHeader, extractCsrfToken
 *   - loadAuth 认证数据加载
 *   - isEnvInjectMode 环境注入模式检测
 *   - MAX_AUTO_RETRY 常量
 *   - httpGet/httpPost/httpPostJson 接口存在性
 *   - createHttpClient 客户端工厂
 *   - requestWithAutoLogin 自动恢复逻辑
 *   - autoGet/autoPost/autoPostJson 便捷方法
 *
 * 注意：不测试实际网络请求（需要 mock 或真实登录态），
 *       侧重测试内部逻辑和错误处理路径。
 */

'use strict';

const {
  httpGet,
  httpPost,
  httpPostJson,
  createHttpClient,
  requestWithAutoLogin,
  autoGet,
  autoPost,
  autoPostJson,
  _internal,
} = require('../../lib/core/http');

const { CliError, ErrorCode } = require('../../lib/core/error');

describe('lib/core/http', () => {
  // ── 内部工具函数 ───────────────────────────────────
  describe('_internal', () => {
    describe('parseUrl()', () => {
      test('有效 URL 返回 URL 对象', () => {
        const url = _internal.parseUrl('https://www.aliwork.com/path');
        expect(url).toBeInstanceOf(URL);
        expect(url.hostname).toBe('www.aliwork.com');
        expect(url.pathname).toBe('/path');
      });

      test('无效 URL 抛出 CliError', () => {
        expect(() => _internal.parseUrl('not-a-url')).toThrow(CliError);
        try {
          _internal.parseUrl('not-a-url');
        } catch (err) {
          expect(err.code).toBe(ErrorCode.INVALID_PARAM);
        }
      });
    });

    describe('filterCookiesByDomain()', () => {
      test('按域名过滤 Cookie', () => {
        const cookies = [
          { name: 'a', value: '1', domain: '.aliwork.com' },
          { name: 'b', value: '2', domain: '.taobao.com' },
        ];
        const filtered = _internal.filterCookiesByDomain(cookies, 'www.aliwork.com');
        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe('a');
      });

      test('子域名匹配', () => {
        const cookies = [
          { name: 'a', value: '1', domain: '.aliwork.com' },
        ];
        const filtered = _internal.filterCookiesByDomain(cookies, 'test.aliwork.com');
        expect(filtered).toHaveLength(1);
      });

      test('空数组返回空数组', () => {
        expect(_internal.filterCookiesByDomain([], 'example.com')).toEqual([]);
      });

      test('无匹配时 fallback 到全量', () => {
        const cookies = [
          { name: 'a', value: '1', domain: '.other.com' },
        ];
        const filtered = _internal.filterCookiesByDomain(cookies, 'example.com');
        expect(filtered).toHaveLength(1); // fallback
      });

      test('domain 前导点被正确处理', () => {
        const cookies = [
          { name: 'a', value: '1', domain: 'aliwork.com' }, // 无前导点
        ];
        const filtered = _internal.filterCookiesByDomain(cookies, 'aliwork.com');
        expect(filtered).toHaveLength(1);
      });
    });

    describe('buildCookieHeader()', () => {
      test('构建 Cookie 请求头', () => {
        const cookies = [
          { name: 'key1', value: 'val1' },
          { name: 'key2', value: 'val2' },
        ];
        const header = _internal.buildCookieHeader(cookies);
        expect(header).toBe('key1=val1; key2=val2');
      });

      test('空数组返回空字符串', () => {
        expect(_internal.buildCookieHeader([])).toBe('');
      });

      test('null 返回空字符串', () => {
        expect(_internal.buildCookieHeader(null)).toBe('');
      });
    });

    describe('extractCsrfToken()', () => {
      test('提取 tianshu_csrf_token', () => {
        const cookies = [
          { name: 'other', value: 'val' },
          { name: 'tianshu_csrf_token', value: 'csrf_123' },
        ];
        expect(_internal.extractCsrfToken(cookies)).toBe('csrf_123');
      });

      test('无 CSRF Cookie 返回空字符串', () => {
        expect(_internal.extractCsrfToken([{ name: 'other', value: 'val' }])).toBe('');
      });

      test('空数组返回空字符串', () => {
        expect(_internal.extractCsrfToken([])).toBe('');
      });
    });

    describe('loadAuth()', () => {
      test('提供 cookies 时直接使用', () => {
        const cookies = [{ name: 'test', value: 'val', domain: '.aliwork.com' }];
        const auth = _internal.loadAuth({ cookies });
        expect(auth.cookies).toBe(cookies);
        expect(auth.cookieData).toBeNull();
      });

      test('提供 cookies 时自动提取 CSRF', () => {
        const cookies = [
          { name: 'tianshu_csrf_token', value: 'auto_csrf' },
        ];
        const auth = _internal.loadAuth({ cookies });
        expect(auth.csrfToken).toBe('auto_csrf');
      });

      test('无 cookies 且无 .cookies.json 时抛出 NO_COOKIE', () => {
        // 指向不存在的项目根
        expect(() => _internal.loadAuth({ projectRoot: '/nonexistent/path/12345' })).toThrow(CliError);
        try {
          _internal.loadAuth({ projectRoot: '/nonexistent/path/12345' });
        } catch (err) {
          expect(err.code).toBe(ErrorCode.NO_COOKIE);
        }
      });
    });

    describe('isEnvInjectMode()', () => {
      beforeEach(() => {
        delete process.env.YIDA_AUTH_ENABLED;
        delete process.env.YIDA_COOKIE_B64;
      });
      afterEach(() => {
        delete process.env.YIDA_AUTH_ENABLED;
        delete process.env.YIDA_COOKIE_B64;
      });

      test('无环境变量返回 false', () => {
        expect(_internal.isEnvInjectMode()).toBe(false);
      });

      test('YIDA_AUTH_ENABLED=1 返回 true', () => {
        process.env.YIDA_AUTH_ENABLED = '1';
        expect(_internal.isEnvInjectMode()).toBe(true);
      });

      test('YIDA_AUTH_ENABLED=true 返回 true', () => {
        process.env.YIDA_AUTH_ENABLED = 'true';
        expect(_internal.isEnvInjectMode()).toBe(true);
      });

      test('YIDA_COOKIE_B64 存在返回 true', () => {
        process.env.YIDA_COOKIE_B64 = 'some_base64';
        expect(_internal.isEnvInjectMode()).toBe(true);
      });
    });

    test('MAX_AUTO_RETRY 应为 3', () => {
      expect(_internal.MAX_AUTO_RETRY).toBe(3);
    });
  });

  // ── 公开 API ───────────────────────────────────────
  describe('公开 API', () => {
    test('httpGet 是函数', () => {
      expect(typeof httpGet).toBe('function');
    });

    test('httpPost 是函数', () => {
      expect(typeof httpPost).toBe('function');
    });

    test('httpPostJson 是函数', () => {
      expect(typeof httpPostJson).toBe('function');
    });

    test('createHttpClient 是函数', () => {
      expect(typeof createHttpClient).toBe('function');
    });

    test('requestWithAutoLogin 是函数', () => {
      expect(typeof requestWithAutoLogin).toBe('function');
    });

    test('autoGet 是函数', () => {
      expect(typeof autoGet).toBe('function');
    });

    test('autoPost 是函数', () => {
      expect(typeof autoPost).toBe('function');
    });

    test('autoPostJson 是函数', () => {
      expect(typeof autoPostJson).toBe('function');
    });
  });

  // ── createHttpClient ───────────────────────────────
  describe('createHttpClient()', () => {
    test('返回包含 get/post/postJson 的对象', () => {
      const client = createHttpClient();
      expect(typeof client.get).toBe('function');
      expect(typeof client.post).toBe('function');
      expect(typeof client.postJson).toBe('function');
    });

    test('默认 options 可被覆盖', () => {
      const client = createHttpClient({ baseUrl: 'https://custom.aliwork.com' });
      // client.get 应该使用默认 baseUrl（间接验证：不崩溃）
      expect(typeof client.get).toBe('function');
    });
  });

  // ── requestWithAutoLogin ───────────────────────────
  describe('requestWithAutoLogin()', () => {
    test('无 Cookie 时抛出包含 code 的错误', async () => {
      try {
        await requestWithAutoLogin('GET', 'https://www.aliwork.com/test', null, {
          projectRoot: '/nonexistent/path/12345',
        });
        throw new Error('应抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        // 应该是 NO_COOKIE 或 AUTO_LOGIN_EXHAUSTED
        expect([ErrorCode.NO_COOKIE, ErrorCode.AUTO_LOGIN_EXHAUSTED]).toContain(err.code);
      }
    });

    test('不支持的请求方法抛出 INVALID_PARAM', async () => {
      try {
        await requestWithAutoLogin('DELETE', '/test');
        throw new Error('应抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(CliError);
        expect(err.code).toBe(ErrorCode.INVALID_PARAM);
      }
    });
  });
});
