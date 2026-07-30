/**
 * lib/core/http.js 请求路径单元测试（覆盖率补充）
 *
 * 通过 mock http/https 模块，覆盖 _doRequest 的真实网络分支：
 *   - 成功响应解析
 *   - POST / POST_JSON 序列化与 Content-Type
 *   - createHttpClient 实际发起请求
 *   - 非 JSON 响应 → HTTP_ERROR
 *   - 登录过期 → LOGIN_EXPIRED
 *   - CSRF 过期（不重试 / 重试成功后返回）
 *   - 请求超时 → REQUEST_TIMEOUT
 *   - 请求错误 → REQUEST_ERROR
 *   - 无效 URL → INVALID_PARAM
 *   - 相对路径 + baseUrl 分支
 *   - triggerAutoLogin 环境注入模式 → ENV_INJECT_AUTH_FAILED
 */

'use strict';

jest.mock('http');
jest.mock('https');

const http = require('http');
const https = require('https');

const {
  httpGet,
  httpPost,
  httpPostJson,
  createHttpClient,
  _internal,
} = require('../../lib/core/http');

const { CliError, ErrorCode } = require('../../lib/core/error');

let lastReq = null;

/**
 * 构建一个可被 jest 控制的 fake request 实现。
 * buildResponse(options, req) 返回 { mode, body, statusCode, errorMessage }
 */
function makeImpl(buildResponse) {
  return (options, cb) => {
    const req = {
      _options: options,
      on: jest.fn((event, handler) => {
        req._handlers = req._handlers || {};
        req._handlers[event] = handler;
      }),
      write: jest.fn(),
      end: jest.fn(() => {
        const cfg = buildResponse(options, req);

        if (cfg.mode === 'error') {
          if (req._handlers && req._handlers.error) {
            req._handlers.error(new Error(cfg.errorMessage || 'ECONNREFUSED'));
          }
          return;
        }

        if (cfg.mode === 'timeout') {
          if (req._handlers && req._handlers.timeout) {
            req._handlers.timeout();
          }
          return;
        }

        const res = {
          statusCode: cfg.statusCode || 200,
          on: jest.fn((ev, h) => {
            res._h = res._h || {};
            res._h[ev] = h;
          }),
        };
        cb(res);
        if (res._h && res._h.data) res._h.data(cfg.body || '');
        if (res._h && res._h.end) res._h.end();
      }),
      destroy: jest.fn(),
    };
    lastReq = req;
    return req;
  };
}

function mockBoth(buildResponse) {
  const impl = makeImpl(buildResponse);
  http.request.mockImplementation(impl);
  https.request.mockImplementation(impl);
}

const TEST_COOKIES = [{ name: 'tianshu_csrf_token', value: 'csrf123' }];

describe('lib/core/http 请求路径（mock 网络）', () => {
  beforeEach(() => {
    http.request.mockReset();
    https.request.mockReset();
    lastReq = null;
  });

  test('httpGet 成功响应解析 JSON', async () => {
    mockBoth(() => ({ mode: 'success', body: JSON.stringify({ success: true, data: 42 }) }));
    const res = await httpGet('https://www.aliwork.com/api', { cookies: TEST_COOKIES });
    expect(res.data).toBe(42);
  });

  test('httpPost 序列化查询串并设置表单 Content-Type', async () => {
    mockBoth(() => ({ mode: 'success', body: JSON.stringify({ success: true }) }));
    await httpPost('https://www.aliwork.com/api', { a: 1, b: 2 }, { cookies: TEST_COOKIES });
    expect(lastReq.write.mock.calls[0][0]).toBe('a=1&b=2');
    expect(lastReq._options.headers['Content-Type']).toContain('application/x-www-form-urlencoded');
  });

  test('httpPostJson 序列化 JSON 并设置 json Content-Type', async () => {
    mockBoth(() => ({ mode: 'success', body: JSON.stringify({ success: true }) }));
    await httpPostJson('https://www.aliwork.com/api', { k: 'v' }, { cookies: TEST_COOKIES });
    expect(lastReq.write.mock.calls[0][0]).toBe(JSON.stringify({ k: 'v' }));
    expect(lastReq._options.headers['Content-Type']).toContain('application/json');
  });

  test('createHttpClient 的 get 实际发起请求', async () => {
    mockBoth(() => ({ mode: 'success', body: JSON.stringify({ success: true }) }));
    const client = createHttpClient({ cookies: TEST_COOKIES, csrfToken: 'csrf123' });
    const res = await client.get('https://www.aliwork.com/x');
    expect(res.success).toBe(true);
  });

  test('非 JSON 响应 → HTTP_ERROR', async () => {
    mockBoth(() => ({ mode: 'success', statusCode: 200, body: 'not json at all' }));
    await expect(httpGet('https://www.aliwork.com/x', { cookies: TEST_COOKIES }))
      .rejects.toMatchObject({ code: ErrorCode.HTTP_ERROR });
  });

  test('登录过期 → LOGIN_EXPIRED', async () => {
    mockBoth(() => ({ mode: 'success', body: JSON.stringify({ success: false, errorCode: '307' }) }));
    await expect(httpGet('https://www.aliwork.com/x', { cookies: TEST_COOKIES }))
      .rejects.toMatchObject({ code: ErrorCode.LOGIN_EXPIRED });
  });

  test('CSRF 过期且不重试 → CSRF_EXPIRED', async () => {
    mockBoth(() => ({ mode: 'success', body: JSON.stringify({ success: false, errorCode: 'TIANSHU_000030' }) }));
    await expect(httpGet('https://www.aliwork.com/x', { cookies: TEST_COOKIES, autoCsrfRefresh: false }))
      .rejects.toMatchObject({ code: ErrorCode.CSRF_EXPIRED });
  });

  test('CSRF 过期且自动重试 → 第二次成功返回', async () => {
    let calls = 0;
    mockBoth(() => {
      calls += 1;
      return calls === 1
        ? { mode: 'success', body: JSON.stringify({ success: false, errorCode: 'TIANSHU_000030' }) }
        : { mode: 'success', body: JSON.stringify({ success: true, retried: true }) };
    });
    const res = await httpGet('https://www.aliwork.com/x', { cookies: TEST_COOKIES });
    expect(res.retried).toBe(true);
    expect(calls).toBe(2);
  });

  test('请求超时 → REQUEST_TIMEOUT', async () => {
    mockBoth(() => ({ mode: 'timeout' }));
    await expect(httpGet('https://www.aliwork.com/x', { cookies: TEST_COOKIES }))
      .rejects.toMatchObject({ code: ErrorCode.REQUEST_TIMEOUT });
  });

  test('请求错误 → REQUEST_ERROR', async () => {
    mockBoth(() => ({ mode: 'error', errorMessage: 'ECONNREFUSED' }));
    await expect(httpGet('https://www.aliwork.com/x', { cookies: TEST_COOKIES }))
      .rejects.toMatchObject({ code: ErrorCode.REQUEST_ERROR });
  });

  test('无效 URL → INVALID_PARAM', async () => {
    await expect(httpGet('http://', { cookies: TEST_COOKIES }))
      .rejects.toThrow(CliError);
  });

  test('相对路径 + baseUrl 组合请求主机', async () => {
    mockBoth(() => ({ mode: 'success', body: JSON.stringify({ success: true }) }));
    await httpGet('/api/test', { cookies: TEST_COOKIES, baseUrl: 'https://base.aliwork.com' });
    expect(lastReq._options.hostname).toBe('base.aliwork.com');
  });

  describe('triggerAutoLogin()', () => {
    afterEach(() => {
      delete process.env.YIDA_COOKIE_B64;
      delete process.env.YIDA_AUTH_ENABLED;
    });

    test('环境注入模式下抛出 ENV_INJECT_AUTH_FAILED', async () => {
      process.env.YIDA_COOKIE_B64 = 'some_base64';
      await expect(_internal.triggerAutoLogin({}))
        .rejects.toMatchObject({ code: ErrorCode.ENV_INJECT_AUTH_FAILED });
    });
  });
});
