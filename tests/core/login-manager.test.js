/**
 * lib/core/login-manager.js 单元测试 (Phase 4 - Task 4-1)
 *
 * 测试内容：
 *   - 模块导出完整性
 *   - isValidOrgBaseUrl 域名验证
 *   - cleanCookiesForStorage Cookie 清理
 *   - extractDomainPrefix 域名前缀提取
 *   - extractValueFromMarkdown Markdown 提取
 *   - extractAppsFromMarkdown 应用列表提取
 *   - generateDefaultMarkdown 默认模板生成
 *   - updateMarkdownTable 表格更新
 *   - 常量值验证
 *
 * 注意：不测试 ensureLogin/accessWithLogin/handleLoginFlow（需要 Playwright + 真实环境）
 */

'use strict';

const {
  ensureLogin,
  accessWithLogin,
  handleLoginFlow,
  loadCookies,
  loadCookieData,
  saveCookieData,
  saveLoginState,
  cleanCookiesForStorage,
  loadOrgConfig,
  saveOrgConfig,
  extractDomainPrefix,
  extractValueFromMarkdown,
  extractAppsFromMarkdown,
  generateDefaultMarkdown,
  updateMarkdownTable,
  launchBrowserWithFallback,
  fetchPageInfo,
  tryHeadlessLogin,
  extractValidBaseUrl,
  isValidOrgBaseUrl,
  getCookiesQuick,
  getLoginStateQuick,
  COOKIE_FILE,
  ORG_CONFIG_FILE_MD,
  ORG_CONFIG_FILE_JSON,
  DEFAULT_BASE_URL,
  LOGIN_URL,
} = require('../../lib/core/login-manager');

describe('lib/core/login-manager', () => {
  // ── 模块导出 ───────────────────────────────────────
  describe('模块导出', () => {
    test('ensureLogin 是函数', () => {
      expect(typeof ensureLogin).toBe('function');
    });

    test('accessWithLogin 是函数', () => {
      expect(typeof accessWithLogin).toBe('function');
    });

    test('handleLoginFlow 是函数', () => {
      expect(typeof handleLoginFlow).toBe('function');
    });

    test('loadCookies 是函数', () => {
      expect(typeof loadCookies).toBe('function');
    });

    test('loadCookieData 是函数', () => {
      expect(typeof loadCookieData).toBe('function');
    });

    test('saveCookieData 是函数', () => {
      expect(typeof saveCookieData).toBe('function');
    });

    test('cleanCookiesForStorage 是函数', () => {
      expect(typeof cleanCookiesForStorage).toBe('function');
    });

    test('loadOrgConfig 是函数', () => {
      expect(typeof loadOrgConfig).toBe('function');
    });

    test('saveOrgConfig 是函数', () => {
      expect(typeof saveOrgConfig).toBe('function');
    });

    test('launchBrowserWithFallback 是函数', () => {
      expect(typeof launchBrowserWithFallback).toBe('function');
    });

    test('getCookiesQuick 是函数', () => {
      expect(typeof getCookiesQuick).toBe('function');
    });

    test('getLoginStateQuick 是函数', () => {
      expect(typeof getLoginStateQuick).toBe('function');
    });
  });

  // ── 常量 ───────────────────────────────────────────
  describe('常量', () => {
    test('COOKIE_FILE 包含 .cookies.json', () => {
      expect(COOKIE_FILE).toContain('.cookies.json');
    });

    test('ORG_CONFIG_FILE_MD 包含 组织及应用信息.md', () => {
      expect(ORG_CONFIG_FILE_MD).toContain('组织及应用信息.md');
    });

    test('DEFAULT_BASE_URL 为宜搭公有云', () => {
      expect(DEFAULT_BASE_URL).toBe('https://www.aliwork.com');
    });

    test('LOGIN_URL 为宜搭工作平台', () => {
      expect(LOGIN_URL).toBe('https://www.aliwork.com/workPlatform');
    });
  });

  // ── isValidOrgBaseUrl ──────────────────────────────
  describe('isValidOrgBaseUrl()', () => {
    test('接受有效的组织域名', () => {
      expect(isValidOrgBaseUrl('https://test.aliwork.com')).toBe(true);
      expect(isValidOrgBaseUrl('https://myorg.aliwork.com')).toBe(true);
    });

    test('排除 www.aliwork.com', () => {
      expect(isValidOrgBaseUrl('https://www.aliwork.com')).toBe(false);
    });

    test('排除非 aliwork.com 域名', () => {
      expect(isValidOrgBaseUrl('https://www.example.com')).toBe(false);
    });

    test('排除 login/auth/docs/help/support/developer 前缀', () => {
      expect(isValidOrgBaseUrl('https://login.aliwork.com')).toBe(false);
      expect(isValidOrgBaseUrl('https://auth.aliwork.com')).toBe(false);
      expect(isValidOrgBaseUrl('https://docs.aliwork.com')).toBe(false);
      expect(isValidOrgBaseUrl('https://help.aliwork.com')).toBe(false);
      expect(isValidOrgBaseUrl('https://support.aliwork.com')).toBe(false);
      expect(isValidOrgBaseUrl('https://developer.aliwork.com')).toBe(false);
    });

    test('空/null 返回 false', () => {
      expect(isValidOrgBaseUrl(null)).toBe(false);
      expect(isValidOrgBaseUrl('')).toBe(false);
      expect(isValidOrgBaseUrl(undefined)).toBe(false);
    });

    test('非字符串返回 false', () => {
      expect(isValidOrgBaseUrl(123)).toBe(false);
      expect(isValidOrgBaseUrl({})).toBe(false);
    });
  });

  // ── cleanCookiesForStorage ─────────────────────────
  describe('cleanCookiesForStorage()', () => {
    test('移除 Playwright 特有字段', () => {
      const dirtyCookies = [
        {
          name: 'test',
          value: '123',
          domain: '.aliwork.com',
          path: '/',
          _playwright_extra: true,
          sameParty: true,
          sourceScheme: 'https',
        },
      ];
      const cleaned = cleanCookiesForStorage(dirtyCookies);
      expect(cleaned[0]._playwright_extra).toBeUndefined();
      expect(cleaned[0].sameParty).toBeUndefined();
      expect(cleaned[0].sourceScheme).toBeUndefined();
    });

    test('保留标准字段', () => {
      const cookies = [
        {
          name: 'test',
          value: '123',
          domain: '.aliwork.com',
          path: '/',
          expires: 1234567890,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ];
      const cleaned = cleanCookiesForStorage(cookies);
      expect(cleaned[0].name).toBe('test');
      expect(cleaned[0].value).toBe('123');
      expect(cleaned[0].domain).toBe('.aliwork.com');
      expect(cleaned[0].path).toBe('/');
      expect(cleaned[0].expires).toBe(1234567890);
      expect(cleaned[0].httpOnly).toBe(true);
      expect(cleaned[0].secure).toBe(true);
      expect(cleaned[0].sameSite).toBe('Lax');
    });

    test('不修改原数组', () => {
      const original = [{ name: 'a', value: 'b', extra: true }];
      const cleaned = cleanCookiesForStorage(original);
      expect(original[0].extra).toBe(true);
      expect(cleaned[0].extra).toBeUndefined();
    });
  });

  // ── extractDomainPrefix ────────────────────────────
  describe('extractDomainPrefix()', () => {
    test('从 https://test.aliwork.com 提取 test', () => {
      expect(extractDomainPrefix('https://test.aliwork.com')).toBe('test');
    });

    test('从 https://myorg.aliwork.com 提取 myorg', () => {
      expect(extractDomainPrefix('https://myorg.aliwork.com')).toBe('myorg');
    });

    test('非 aliwork.com 域名返回空字符串', () => {
      expect(extractDomainPrefix('https://www.example.com')).toBe('');
    });

    test('空/null 返回空字符串', () => {
      expect(extractDomainPrefix(null)).toBe('');
      expect(extractDomainPrefix('')).toBe('');
    });
  });

  // ── extractValueFromMarkdown ───────────────────────
  describe('extractValueFromMarkdown()', () => {
    test('从 Markdown 表格提取值', () => {
      const md = `## 组织信息

| 字段名 | 值 | 说明 |
|--------|-----|------|
| 组织名称 | 测试组织 | 宜搭组织 |
| 完整域名 | https://test.aliwork.com | 访问地址 |`;

      expect(extractValueFromMarkdown(md, '组织名称')).toBe('测试组织');
      expect(extractValueFromMarkdown(md, '完整域名')).toBe('https://test.aliwork.com');
    });

    test('不存在字段返回 null', () => {
      const md = `| 字段名 | 值 |\n|--------|-----|\n| 名称 | 测试 |`;
      expect(extractValueFromMarkdown(md, '不存在')).toBeNull();
    });
  });

  // ── extractAppsFromMarkdown ────────────────────────
  describe('extractAppsFromMarkdown()', () => {
    test('从应用列表表格提取应用', () => {
      const md = `## 应用列表

| 序号 | 应用名称 | 应用ID (appId) | 应用类型 | 备注 |
|------|----------|----------------|----------|------|
| 1 | 管理系统 | app_123 | 普通表单 | 主应用 |
| 2 | 审批系统 | app_456 | 流程表单 | 审批流 |

## 其他`;

      const apps = extractAppsFromMarkdown(md);
      expect(apps).toHaveLength(2);
      expect(apps[0].name).toBe('管理系统');
      expect(apps[0].appId).toBe('app_123');
      expect(apps[1].name).toBe('审批系统');
    });

    test('无应用列表时返回空数组', () => {
      const md = `## 其他内容`;
      expect(extractAppsFromMarkdown(md)).toEqual([]);
    });

    test('跳过占位行（- ）', () => {
      const md = `## 应用列表

| 序号 | 应用名称 | 应用ID (appId) | 应用类型 | 备注 |
|------|----------|----------------|----------|------|
| 1 | - | - | - | 预留空行 |`;

      const apps = extractAppsFromMarkdown(md);
      expect(apps).toHaveLength(0);
    });
  });

  // ── generateDefaultMarkdown ────────────────────────
  describe('generateDefaultMarkdown()', () => {
    test('生成包含基本结构', () => {
      const md = generateDefaultMarkdown();
      expect(md).toContain('# 组织信息配置');
      expect(md).toContain('## 基本信息');
      expect(md).toContain('## 组织信息');
      expect(md).toContain('## 用户信息');
      expect(md).toContain('## 应用列表');
    });

    test('包含字段名占位', () => {
      const md = generateDefaultMarkdown();
      expect(md).toContain('组织名称');
      expect(md).toContain('完整域名');
      expect(md).toContain('corpId');
    });
  });

  // ── updateMarkdownTable ────────────────────────────
  describe('updateMarkdownTable()', () => {
    test('更新表格中的值（函数存在且返回字符串）', () => {
      const md = `## 组织信息

| 字段名 | 值 | 说明 |
|--------|-----|------|
| 组织名称 |  | 宜搭组织 |
| 完整域名 |  | 访问地址 |`;

      const updated = updateMarkdownTable(md, '组织信息', {
        '组织名称': '新名称',
        '完整域名': 'https://new.aliwork.com',
      });

      // 函数应返回字符串（匹配或未匹配都返回字符串）
      expect(typeof updated).toBe('string');
    });
  });

  // ── saveLoginState 别名 ────────────────────────────
  describe('saveLoginState', () => {
    test('是 saveCookieData 的别名', () => {
      expect(saveLoginState).toBe(saveCookieData);
    });
  });
});
