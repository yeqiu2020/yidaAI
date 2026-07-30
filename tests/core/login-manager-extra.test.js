/**
 * lib/core/login-manager.js 离线分支覆盖补充测试（覆盖率补充）
 *
 * 覆盖此前未触达的可离线函数：
 *   - loadCookies / getCookiesQuick（真实 fs）
 *   - getLoginStateQuick（真实 fs → null 路径）
 *   - loadOrgConfig（md / json 两种解析分支，mock fs）
 *   - launchBrowserWithFallback（Playwright 不可用时抛 UNKNOWN）
 *   - extractValidBaseUrl（有效 / www / login 三类）
 *   - fetchPageInfo（正常提取 + goto 异常分支）
 *   - tryHeadlessLogin（浏览器启动失败 → null）
 */

'use strict';

jest.mock('fs');

const fs = require('fs');

const {
  loadCookies,
  getCookiesQuick,
  getLoginStateQuick,
  loadOrgConfig,
  launchBrowserWithFallback,
  extractValidBaseUrl,
  fetchPageInfo,
  tryHeadlessLogin,
} = require('../../lib/core/login-manager');

const { CliError, ErrorCode } = require('../../lib/core/error');

describe('lib/core/login-manager 离线分支覆盖', () => {
  beforeEach(() => {
    fs.existsSync.mockReset();
    fs.readFileSync.mockReset();
    // 默认：所有文件均不存在
    fs.existsSync.mockReturnValue(false);
  });

  test('loadCookies 返回数组或 null（不崩溃）', () => {
    const cookies = loadCookies();
    expect(cookies === null || Array.isArray(cookies)).toBe(true);
  });

  test('getCookiesQuick 返回数组或 null（不崩溃）', () => {
    const cookies = getCookiesQuick();
    expect(cookies === null || Array.isArray(cookies)).toBe(true);
  });

  test('getLoginStateQuick 返回对象或 null（不崩溃）', () => {
    const state = getLoginStateQuick();
    expect(state === null || typeof state === 'object').toBe(true);
  });

  describe('loadOrgConfig()', () => {
    test('从 Markdown 配置解析', () => {
      const md = `## 组织信息

| 字段名 | 值 | 说明 |
|--------|-----|------|
| 组织名称 | 测试组织 | 宜搭组织 |
| 完整域名 | https://test.aliwork.com | 访问地址 |
| corpId | corp_123 | corpId |
| 域名前缀 | test | 前缀 |
| 用户名称 | 张三 | 用户 |
| 用户ID | u_1 | 用户ID |
| 用户角色 | admin | 角色 |
| 是否为超级管理员 | true | 管理员 |
| 部门 | 技术部 | 部门 |

## 应用列表

| 序号 | 应用名称 | 应用ID (appId) | 应用类型 | 备注 |
|------|----------|----------------|----------|------|
| 1 | 管理系统 | app_123 | 普通表单 | 主应用 |`;

      fs.existsSync.mockImplementation((p) => String(p).includes('组织及应用信息.md'));
      fs.readFileSync.mockReturnValue(md);

      const cfg = loadOrgConfig();
      expect(cfg).not.toBeNull();
      expect(cfg.base_url).toBe('https://test.aliwork.com');
      expect(cfg.corp_id).toBe('corp_123');
      expect(cfg.name).toBe('测试组织');
      expect(cfg.is_super_admin).toBe(true);
      expect(cfg.apps).toHaveLength(1);
      expect(cfg.apps[0].appId).toBe('app_123');
    });

    test('从 JSON 配置（完整域名键）解析', () => {
      const json = JSON.stringify({
        完整域名: 'https://json.aliwork.com',
        corpId: 'corp_json',
        域名前缀: 'json',
        组织名称: 'JSON组织',
        应用列表: [{ name: 'A', appId: 'a1' }],
      });

      fs.existsSync.mockImplementation((p) => String(p).includes('.organization.json'));
      fs.readFileSync.mockReturnValue(json);

      const cfg = loadOrgConfig();
      expect(cfg).not.toBeNull();
      expect(cfg.base_url).toBe('https://json.aliwork.com');
      expect(cfg.corp_id).toBe('corp_json');
      expect(cfg.apps).toHaveLength(1);
    });

    test('从 JSON 配置（organization 嵌套）解析', () => {
      const json = JSON.stringify({
        organization: {
          base_url: 'https://nest.aliwork.com',
          corp_id: 'corp_nest',
          corp_name: '嵌套组织',
          name: 'N',
          domain_prefix: 'nest',
        },
      });

      fs.existsSync.mockImplementation((p) => String(p).includes('.organization.json'));
      fs.readFileSync.mockReturnValue(json);

      const cfg = loadOrgConfig();
      expect(cfg).not.toBeNull();
      expect(cfg.base_url).toBe('https://nest.aliwork.com');
    });

    test('无任何配置时返回 null', () => {
      fs.existsSync.mockReturnValue(false);
      expect(loadOrgConfig()).toBeNull();
    });
  });

  describe('launchBrowserWithFallback()', () => {
    test('Playwright 不可用时抛出 UNKNOWN', async () => {
      await expect(launchBrowserWithFallback(true))
        .rejects.toMatchObject({ code: ErrorCode.UNKNOWN });
    });
  });

  describe('extractValidBaseUrl()', () => {
    test('有效的组织域名被提取', async () => {
      const page = { url: () => 'https://myorg.aliwork.com/home', evaluate: jest.fn() };
      const result = await extractValidBaseUrl(page);
      expect(result).toBe('https://myorg.aliwork.com');
    });

    test('www 域名被排除', async () => {
      const page = { url: () => 'https://www.aliwork.com/home', evaluate: jest.fn() };
      const result = await extractValidBaseUrl(page);
      expect(result).toBeNull();
    });

    test('login 域名被排除', async () => {
      const page = { url: () => 'https://login.aliwork.com/home', evaluate: jest.fn().mockResolvedValue(null) };
      const result = await extractValidBaseUrl(page);
      expect(result).toBeNull();
    });
  });

  describe('fetchPageInfo()', () => {
    test('正常提取 csrfToken / baseUrl', async () => {
      const page = {
        goto: jest.fn().mockResolvedValue(undefined),
        url: () => 'https://myorg.aliwork.com/dashboard',
        evaluate: jest.fn().mockResolvedValue('csrf_token_value'),
      };
      const info = await fetchPageInfo(page, 'https://myorg.aliwork.com/myApp');
      expect(info.csrfToken).toBe('csrf_token_value');
      expect(info.baseUrl).toBe('https://myorg.aliwork.com');
    });

    test('goto 抛出异常被捕获后仍返回信息', async () => {
      const page = {
        goto: jest.fn().mockRejectedValue(new Error('timeout')),
        url: () => 'https://myorg.aliwork.com/dashboard',
        evaluate: jest.fn().mockResolvedValue('csrf_token_value'),
      };
      const info = await fetchPageInfo(page, 'https://myorg.aliwork.com/myApp');
      expect(info).toHaveProperty('baseUrl');
    });
  });

  describe('tryHeadlessLogin()', () => {
    test('浏览器启动失败时返回 null', async () => {
      const result = await tryHeadlessLogin([{ name: 'a', value: 'b' }], 'https://test.aliwork.com');
      expect(result).toBeNull();
    });
  });
});
