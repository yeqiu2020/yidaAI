'use strict';

/**
 * agent_capabilities.js — 环境预检摘要（P5-3，对齐 OpenYida agent-capabilities 模式）
 *
 * 一条命令输出机器可读 JSON 摘要：项目 Skill 概况、登录态有效性、本地服务状态、关键配置文件可读性。
 * 供 server-manager / api-client / config-sync 等 Skill 作为统一预检入口（轻量摘要为主，完整诊断按需）。
 *
 * 用法：node .agents/skills/server-manager/scripts/agent_capabilities.js [--full]
 * 输出：单行 JSON（stdout），诊断过程走 stderr；退出码 0=可用 1=登录态失效或致命错误
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function checkCookieFile() {
  const file = path.join(PROJECT_ROOT, '.cookies.json');
  if (!fs.existsSync(file)) { return { exists: false, loginState: 'missing' }; }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cookies = Array.isArray(raw.cookies) ? raw.cookies : [];
    return {
      exists: true,
      cookieCount: cookies.length,
      hasCsrf: !!(raw.csrf_token || raw.csrfToken),
      baseUrl: raw.baseUrl || raw.base_url || '',
      userId: (raw.login_user && raw.login_user.userId) || raw.userId || '',
    };
  } catch (e) {
    return { exists: true, loginState: 'corrupt', error: e.message };
  }
}

function httpProbe(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs || 3000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: d.slice(0, 300) }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

async function probeLoginState(cookieInfo) {
  if (!cookieInfo.exists || cookieInfo.loginState) { return cookieInfo.loginState || 'missing'; }
  try {
    const { getRequest } = require('../../api-client/scripts/api_client');
    const raw = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, '.cookies.json'), 'utf8'));
    const baseUrl = raw.baseUrl || raw.base_url;
    const res = await getRequest(baseUrl, '/query/app/getAppList.json', {
      _api: 'App.getList', _mock: 'false', _csrf_token: raw.csrf_token || raw.csrfToken,
      pageIndex: '1', pageSize: '1',
    }, raw.cookies);
    if (res && res.__needLogin) { return 'expired'; }
    if (res && (res.success === true || (res.content && res.content.data))) { return 'valid'; }
    return 'unknown';
  } catch (e) {
    return 'probe-failed: ' + e.message;
  }
}

async function probeServices() {
  const [http8080, sync3457] = await Promise.all([
    httpProbe('http://127.0.0.1:8080/__yida_health'),
    httpProbe('http://127.0.0.1:3457/health'),
  ]);
  return {
    httpStatic8080: http8080.ok ? 'running' : 'stopped',
    syncConfig3457: sync3457.ok ? 'running' : 'stopped',
    syncVersion: (() => { try { return JSON.parse(sync3457.body).version || ''; } catch (e) { return ''; } })(),
  };
}

function checkConfigs() {
  const read = (rel) => { try { const c = fs.readFileSync(path.join(PROJECT_ROOT, rel), 'utf8'); return { readable: true, bytes: c.length }; } catch (e) { return { readable: false, error: e.code || e.message }; } };
  return {
    '组织及应用信息.md': read('组织及应用信息.md'),
    '系统配置清单.md': read('系统配置清单.md'),
  };
}

function skillSummary() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, '.agents', 'skills', 'skill-config.json'), 'utf8'));
    const skills = cfg.skills || [];
    const byStatus = {};
    skills.forEach((s) => { byStatus[s.verifyStatus || 'unregistered'] = (byStatus[s.verifyStatus || 'unregistered'] || 0) + 1; });
    return { registered: skills.length, configVersion: cfg.version, verifyStatus: byStatus };
  } catch (e) {
    return { error: 'skill-config.json 读取失败: ' + e.message };
  }
}

async function run(args) {
  const cookieInfo = checkCookieFile();
  const summary = {
    generatedAt: new Date().toISOString(),
    projectRoot: PROJECT_ROOT,
    projectDirName: path.basename(PROJECT_ROOT),
    skills: skillSummary(),
    cookie: cookieInfo,
    loginState: await probeLoginState(cookieInfo),
    services: await probeServices(),
    configs: checkConfigs(),
  };
  if (args.includes('--full')) {
    summary.fullDiagnosticsNote = '--full 模式：完整诊断快照按需在各 Skill 内执行，本脚本保持轻量';
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.loginState !== 'valid') { process.exitCode = 1; }
}

if (require.main === module) {
  run(process.argv.slice(2)).catch((e) => {
    console.error('预检失败: ' + e.message);
    console.log(JSON.stringify({ success: false, error: e.message }));
    process.exit(1);
  });
}

module.exports = { run };
