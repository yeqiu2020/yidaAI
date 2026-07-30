/**
 * org-switch.js — 组织切换与管理
 *
 * 功能：
 *   ① 列出当前可切换的组织
 *   ② 切换到指定组织
 *   ③ 保存组织配置
 *   ④ 管理多环境组织信息
 *
 * 创建日期：2026-07-10 (Phase 2)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot, loadCookieData, extractInfoFromCookies } = require('../../../../lib/core/utils');
const cookieManager = require('./cookie-manager');

// ── 组织配置文件路径 ───────────────────────────────────

/**
 * 获取组织配置文件路径
 * @returns {string}
 */
function getOrgConfigPath() {
  return path.join(findProjectRoot(), '组织及应用信息.md');
}

/**
 * 获取组织配置 JSON 文件路径
 * @returns {string}
 */
function getOrgConfigJsonPath() {
  return path.join(findProjectRoot(), '.organization.json');
}

// ── 组织信息提取 ───────────────────────────────────────

/**
 * 从 Cookie 数据中提取组织信息
 * @param {object} cookieData
 * @returns {{ corpId: string|null, corpName: string|null, baseUrl: string|null }}
 */
function extractOrgInfo(cookieData) {
  if (!cookieData || !cookieData.cookies) {
    return { corpId: null, corpName: null, baseUrl: null };
  }

  const { corpId } = extractInfoFromCookies(cookieData.cookies);
  const baseUrl = cookieData.base_url || null;

  // 从 Cookie 中提取组织名称
  let corpName = null;
  const corpUserCookie = cookieData.cookies.find(c => c.name === 'tianshu_corp_user');
  if (corpUserCookie) {
    // tianshu_corp_user 格式为 corpId_userId
    corpName = corpUserCookie.value.split('_')[0];
  }

  // 从 login_user 中获取组织名称
  if (cookieData.login_user && cookieData.login_user.corpName) {
    corpName = cookieData.login_user.corpName;
  }

  return { corpId, corpName, baseUrl };
}

/**
 * 从域名提取域名前缀
 * @param {string} baseUrl
 * @returns {string}
 */
function extractDomainPrefix(baseUrl) {
  if (!baseUrl) return '';
  const match = baseUrl.match(/https:\/\/([^.]+)\.aliwork\.com/);
  return match ? match[1] : '';
}

// ── 组织配置管理 ───────────────────────────────────────

/**
 * 保存组织配置到 Markdown 文件
 * @param {object} orgConfig - 组织配置
 */
function saveOrgConfig(orgConfig) {
  const configPath = getOrgConfigPath();

  // 读取现有内容或创建模板
  let mdContent = '';
  if (fs.existsSync(configPath)) {
    mdContent = fs.readFileSync(configPath, 'utf-8');
  }

  // 更新或创建组织信息表
  const orgInfo = [
    `| 组织名称 | ${orgConfig.name || ''} | 宜搭组织显示名称 |`,
    `| 域名前缀 | ${orgConfig.domain_prefix || extractDomainPrefix(orgConfig.base_url) || ''} | 宜搭域名前缀 |`,
    `| 完整域名 | ${orgConfig.base_url || ''} | 完整的宜搭访问地址 |`,
    `| corpId | ${orgConfig.corp_id || ''} | 钉钉 corpId |`,
  ];

  if (mdContent.includes('## 组织信息')) {
    // 替换现有组织信息表
    mdContent = mdContent.replace(
      /(## 组织信息\n\n\| 字段名 \| 值 \| 说明 \|\n\|--------\|-----\|------\|\n)([\s\S]*?)(?=\n## |\n---|$)/,
      `$1${orgInfo.join('\n')}\n`
    );
  } else {
    // 追加组织信息表
    mdContent += `\n## 组织信息\n\n| 字段名 | 值 | 说明 |\n|--------|-----|------|\n${orgInfo.join('\n')}\n`;
  }

  // 更新最后更新时间
  const now = new Date().toISOString();
  mdContent = mdContent.replace(
    /最后更新时间\s*\|\s*[^|]+\s*\|/,
    `最后更新时间 | ${now} |`
  );

  fs.writeFileSync(configPath, mdContent);
  console.log(`  ✅ 组织配置已保存到 ${path.relative(findProjectRoot(), configPath)}`);
}

// ── 组织切换 ───────────────────────────────────────────

/**
 * 列出所有已保存的环境及其组织信息
 * @returns {Array} 环境列表
 */
function listOrgEnvironments() {
  const envs = cookieManager.listEnvironments();
  const result = [];

  for (const env of envs) {
    const cookieData = cookieManager.loadEnvCookieData(env);
    if (cookieData) {
      const orgInfo = extractOrgInfo(cookieData);
      result.push({
        env,
        corpId: orgInfo.corpId,
        corpName: orgInfo.corpName,
        baseUrl: orgInfo.baseUrl,
        domainPrefix: extractDomainPrefix(orgInfo.baseUrl || ''),
        cookieCount: cookieData.cookies?.length || 0,
        updatedAt: cookieData.updated_at || '未知',
      });
    } else {
      result.push({
        env,
        corpId: null,
        corpName: null,
        baseUrl: null,
        domainPrefix: '',
        cookieCount: 0,
        updatedAt: '无数据',
      });
    }
  }

  return result;
}

/**
 * 切换到指定环境/组织
 * @param {string} env - 环境名称
 * @returns {object|null} 切换后的 Cookie 数据
 */
function switchOrg(env) {
  console.log(`\n  🔄 切换到环境: ${env}`);

  const cookieData = cookieManager.switchEnvironment(env);
  if (!cookieData) {
    return null;
  }

  // 提取并保存组织配置
  const orgInfo = extractOrgInfo(cookieData);
  saveOrgConfig({
    name: orgInfo.corpName || extractDomainPrefix(orgInfo.baseUrl),
    domain_prefix: extractDomainPrefix(orgInfo.baseUrl),
    base_url: orgInfo.baseUrl,
    corp_id: orgInfo.corpId,
  });

  console.log(`  ✅ 组织切换完成`);
  console.log(`     环境: ${env}`);
  console.log(`     组织: ${orgInfo.corpName || '未知'}`);
  console.log(`     域名: ${orgInfo.baseUrl || '未知'}`);
  console.log(`     CorpId: ${orgInfo.corpId || '未知'}`);

  return cookieData;
}

/**
 * 显示当前组织信息
 */
function showCurrentOrg() {
  const cookieData = loadCookieData(findProjectRoot());

  if (!cookieData) {
    console.log('\n  ❌ 未找到有效的登录态');
    return;
  }

  const orgInfo = extractOrgInfo(cookieData);
  const env = process.env.YIDA_ENV || 'default';

  console.log('\n  📋 当前组织信息:');
  console.log(`     环境: ${env}`);
  console.log(`     组织: ${orgInfo.corpName || '未知'}`);
  console.log(`     域名: ${orgInfo.baseUrl || '未知'}`);
  console.log(`     CorpId: ${orgInfo.corpId || '未知'}`);
  console.log(`     Cookie 数量: ${cookieData.cookies?.length || 0}`);
  console.log(`     更新时间: ${cookieData.updated_at || '未知'}`);
}

// ── CLI 入口 ───────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'show';

  switch (command) {
    case 'list':
      console.log('\n  📋 已保存的环境列表:');
      console.log('  ' + '-'.repeat(60));
      const envs = listOrgEnvironments();
      for (const env of envs) {
        const current = env.env === (process.env.YIDA_ENV || 'default') ? ' ← 当前' : '';
        console.log(`  ${env.env.padEnd(15)} | ${env.corpName || '?'.padEnd(15)} | ${env.baseUrl || '?'.padEnd(35)} | ${env.cookieCount} cookies${current}`);
      }
      console.log('  ' + '-'.repeat(60));
      break;

    case 'switch':
      if (!args[1]) {
        console.error('  ❌ 请指定环境名称: node org-switch.js switch <env>');
        process.exit(1);
      }
      switchOrg(args[1]);
      break;

    case 'show':
    default:
      showCurrentOrg();
      break;
  }
}

module.exports = {
  listOrgEnvironments,
  switchOrg,
  showCurrentOrg,
  extractOrgInfo,
  saveOrgConfig,
  extractDomainPrefix,
};
