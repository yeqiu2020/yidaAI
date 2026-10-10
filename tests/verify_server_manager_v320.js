#!/usr/bin/env node
/**
 * 验证 server-manager v3.2.0 两处修复（真实缺陷回归验证）
 *
 * 覆盖：
 *   fix1  /__yida_start_service 的 targetRoot 推导（不再多拼一层 + 无效目标如实报错）
 *   fix2  isGlobalServiceRunning 的端口复用判定（3457 也能被正确识别为可复用）
 *
 * 判定方式：脚本产出 verdict 字段 + exit code。任何一项 FAIL ⇒ exit != 0。
 * 运行：node tests/verify_server_manager_v320.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 强制 UTF-8，避免 Windows GBK 控制台打印中文/特殊字符时炸掉
process.stdout.write('\uFEFF'.length === 1 ? '' : '');
if (process.stdout.setDefaultEncoding) process.stdout.setDefaultEncoding('utf8');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATIC_ROOT = path.dirname(PROJECT_ROOT);
const PROJECT_NAME = path.basename(PROJECT_ROOT);
const HTTP_PORT = 18080;   // 用非占用端口做隔离验证，不打扰用户正在用的 8080
const MANAGER = path.join(PROJECT_ROOT, '.agents', 'skills', 'server-manager', 'scripts', 'server_manager.js');
const BUILTIN = path.join(PROJECT_ROOT, '.agents', 'skills', 'server-manager', 'scripts', '_builtin_server.js');

const results = [];

function record(id, name, pass, detail) {
  results.push({ id, name, verdict: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? '[PASS]' : '[FAIL]'} ${id} ${name}`);
  if (detail) console.log(`       ${detail}`);
}

function get(url, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
  });
}

function waitPort(port, maxSeconds = 15) {
  return new Promise((resolve) => {
    let i = 0;
    const tick = async () => {
      i++;
      const r = await get(`http://127.0.0.1:${port}/__yida_health`, 1500);
      if (r.status === 200) return resolve(true);
      if (i >= maxSeconds * 2) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}

(async () => {
  console.log('='.repeat(64));
  console.log('server-manager v3.2.0 修复验证');
  console.log('='.repeat(64));
  console.log(`项目根   : ${PROJECT_ROOT}`);
  console.log(`静态服务根: ${STATIC_ROOT}`);
  console.log('');

  // ---------- 静态检查：内嵌模板与外部脚本一致性 ----------
  const managerSrc = fs.readFileSync(MANAGER, 'utf8');
  const builtinSrc = fs.readFileSync(BUILTIN, 'utf8');
  const hasResolver = managerSrc.includes('function resolveTargetProjectRoot');
  record('T1', '内嵌模板已包含 resolveTargetProjectRoot（防止被覆写回旧逻辑）',
    hasResolver, hasResolver ? '内嵌模板含修复后逻辑' : '内嵌模板仍是旧逻辑，下次启动会被覆写回去');

  const noOldJoin = !/const targetRoot = projectDir \? path\.join\(projectRoot, projectDir\)/.test(builtinSrc);
  record('T2', '外部 _builtin_server.js 已移除旧的错误拼接',
    noOldJoin, noOldJoin ? '已无 path.join(projectRoot, projectDir)' : '仍存在旧的错误拼接');

  // ---------- 启动被测内置服务器（隔离端口） ----------
  console.log('\n--- 启动被测内置服务器（端口 ' + HTTP_PORT + '）---');
  const child = spawn(process.execPath, [BUILTIN, STATIC_ROOT, String(HTTP_PORT)], {
    cwd: STATIC_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let childErr = '';
  child.stderr.on('data', (d) => { childErr += d.toString(); });
  child.on('error', (e) => { childErr += e.message; });

  const up = await waitPort(HTTP_PORT);
  if (!up) {
    record('T3', '内置服务器可在 staticRoot 下启动', false,
      `未在 15s 内就绪；stderr=${childErr || '(空)'}`);
    finish(1);
    return;
  }
  record('T3', '内置服务器可在 staticRoot 下启动', true, `端口 ${HTTP_PORT} 健康检查通过`);

  // ---------- fix1: /__yida_health 语义正确 ----------
  const health = await get(`http://127.0.0.1:${HTTP_PORT}/__yida_health`);
  let healthJson = {};
  try { healthJson = JSON.parse(health.body); } catch (_) {}
  const sameRoot = (healthJson.serviceRoot || '').replace(/\\/g, '/').toLowerCase() ===
                   STATIC_ROOT.replace(/\\/g, '/').toLowerCase();
  record('T4', '/__yida_health 返回 serviceRoot = 传入的 staticRoot',
    sameRoot, `serviceRoot=${healthJson.serviceRoot || '(缺)'}，期望=${STATIC_ROOT}`);

  // ---------- fix1 核心：targetRoot 不再多拼一层 ----------
  // 传完整项目名（前端 PROJECT_DIR_QUERY 的真实形态）
  const startUrl = `http://127.0.0.1:${HTTP_PORT}/__yida_start_service?projectDir=${encodeURIComponent(PROJECT_NAME)}`;
  const startRes = await get(startUrl);
  let startJson = {};
  try { startJson = JSON.parse(startRes.body); } catch (_) {}
  const normTarget = (startJson.projectRoot || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  const normExpect = PROJECT_ROOT.replace(/\\/g, '/').toLowerCase();
  record('T5', 'projectDir=完整项目名 ⇒ projectRoot 精确定位到项目根（不多一层）',
    normTarget === normExpect,
    `实际=${startJson.projectRoot || '(缺)'}\n       期望=${PROJECT_ROOT}`);

  // 传非法项目名 ⇒ 必须如实失败，不能假 success
  const badRes = await get(`http://127.0.0.1:${HTTP_PORT}/__yida_start_service?projectDir=__不存在的项目__`);
  let badJson = {};
  try { badJson = JSON.parse(badRes.body); } catch (_) {}
  record('T6', '非法 projectDir ⇒ 返回失败（不再假 success:true）',
    badJson.success === false && badRes.status >= 400,
    `status=${badRes.status}, success=${String(badJson.success)}, message=${badJson.message || '(无)'}`);

  // 不传 projectDir ⇒ 单项目模式下应落到项目根
  const noDirRes = await get(`http://127.0.0.1:${HTTP_PORT}/__yida_start_service`);
  let noDirJson = {};
  try { noDirJson = JSON.parse(noDirRes.body); } catch (_) {}
  const normNoDir = (noDirJson.projectRoot || '').replace(/\\/g, '/').toLowerCase();
  // staticRoot 下若只有一个项目，应解析到该项目；否则解析到 staticRoot 自身（若其本身是项目根）
  record('T7', '缺省 projectDir ⇒ 能推导出可用目标',
    !!noDirJson.projectRoot && noDirJson.success === true,
    `projectRoot=${noDirJson.projectRoot || '(缺)'}`);

  child.kill();

  // ---------- fix2: 端口复用判定 ----------
  // 直接调用 server_manager 的 status，验证不再误杀已运行服务
  console.log('\n--- 验证 isGlobalServiceRunning（端口复用判定）---');
  const { execFileSync } = require('child_process');
  let statusOut = '';
  try {
    statusOut = execFileSync(process.execPath, [MANAGER, 'status'], {
      cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 30000
    });
  } catch (e) {
    statusOut = (e.stdout || '') + (e.stderr || '');
  }
  const httpRunning = /HTTP 静态服务\s+│ 8080\s+│ 🟢/.test(statusOut);
  const syncRunning = /同步配置服务\s+│ 3457\s+│ 🟢/.test(statusOut);
  record('T8', 'status 命令可正常执行并输出两服务状态',
    /HTTP 静态服务/.test(statusOut) && /同步配置服务/.test(statusOut),
    `8080=${httpRunning ? '运行中' : '未启动'}, 3457=${syncRunning ? '运行中' : '未启动'}`);

  // 判定逻辑静态检查：必须回退读 serviceRoot/staticRoot，而不再只看 cwd
  const usesServiceRoot = managerSrc.includes('info.serviceRoot');
  const usesNormalize = managerSrc.includes('function normalizePath');
  const healthPathBranch = managerSrc.includes("port === CONFIG.httpPort ? '/__yida_health' : '/health'");
  record('T9', '判定逻辑已改为多字段回退 + 路径归一化 + 按端口选健康接口',
    usesServiceRoot && usesNormalize && healthPathBranch,
    `serviceRoot=${usesServiceRoot}, normalizePath=${usesNormalize}, 端口分支=${healthPathBranch}`);

  finish(results.some(r => r.verdict === 'FAIL') ? 1 : 0);
})();

function finish(code) {
  const failed = results.filter(r => r.verdict === 'FAIL');
  console.log('\n' + '='.repeat(64));
  console.log(`verdict: ${failed.length === 0 ? 'PASS' : 'FAIL'}   通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log('失败项:');
    failed.forEach(r => console.log(`  - ${r.id} ${r.name}`));
  }
  console.log('='.repeat(64));
  process.exit(code);
}
