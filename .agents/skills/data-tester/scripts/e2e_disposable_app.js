'use strict';

/**
 * e2e_disposable_app.js — 一次性测试应用 E2E 模式（P5-2，对齐 OpenYida real E2E 机制）
 *
 * 目标：结构级验证跑在带固定前缀的一次性应用里（前缀 XJTEST_），彻底不污染真实业务应用。
 * 全链路：创建应用 → 建一次性表单（测试键/测试值）→ 提交1条测试数据 → 回查 → 登记注册表。
 * 清理必须征得用户同意（遵守项目「数据删除必须先获得用户同意」约束）——本脚本只创建不清理。
 *
 * 用法：
 *   node e2e_disposable_app.js --plan                      # 只打印计划，不创建任何资源
 *   node e2e_disposable_app.js --name "E2E冒烟"            # 真实执行全链路
 *
 * 注册表：.cache/e2e/registry.json（记录 appId/formUuid/instId，供事后审计与清理）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REGISTRY = path.join(PROJECT_ROOT, '.cache', 'e2e', 'registry.json');
const PREFIX = 'XJTEST_';

function log(msg) { console.error('[e2e] ' + msg); }

function readRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (e) { return { runs: [] }; }
}

function writeRegistry(registry) {
  fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));
}

function runCli(cmd, args) {
  log('执行: ' + cmd + ' ' + args.join(' '));
  return execFileSync('node', [cmd].concat(args), { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function extractJson(output) {
  const m = output.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : null;
}

async function main(args) {
  const plan = args.includes('--plan');
  const nameIdx = args.indexOf('--name');
  const name = nameIdx !== -1 ? args[nameIdx + 1] : 'E2E冒烟';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const appName = PREFIX + name + '_' + stamp;
  const formName = PREFIX + '冒烟表单';

  const plan_ = {
    appName,
    formName,
    steps: ['app_manager.js 创建应用', 'add_form_to_app.js 创建表单（测试键/测试值）', 'submitOne 提交1条数据', '回查验证', 'registry.json 登记（清理需用户确认）'],
  };
  if (plan) {
    console.log(JSON.stringify({ success: true, mode: 'plan', plan: plan_ }, null, 2));
    return;
  }

  // Step 1: 创建一次性应用
  log('Step 1: 创建一次性应用 ' + appName);
  const appOut = runCli(path.join('.agents', 'skills', 'api-client', 'scripts', 'app_manager.js'), [appName, 'P5-2一次性E2E测试应用（可清理）']);
  const appJson = extractJson(appOut);
  if (!appJson || !appJson.appType) { throw new Error('应用创建失败: ' + appOut.slice(-300)); }
  const appId = appJson.appType;
  log('应用ID: ' + appId);

  // Step 2: 创建一次性表单（临时字段清单 MD → add_form_to_app）
  log('Step 2: 创建一次性表单 ' + formName);
  const tmpDir = path.join(PROJECT_ROOT, 'temp-file');
  fs.mkdirSync(tmpDir, { recursive: true });
  const mdPath = path.join(tmpDir, PREFIX + '冒烟表单-字段清单.md');
  fs.writeFileSync(mdPath, [
    '## ' + formName + '「普通表单」', '',
    '| 字段名称 | 字段类型 | 字段说明 | 字段状态 | 是否必填 |',
    '|----------|----------|----------|----------|----------|',
    '| 测试键 | 单行文本 | 冒烟匹配键 | 编辑 | 是 |',
    '| 测试值 | 数值 | 冒烟数值 | 编辑 | 否 |',
  ].join('\n'));
  const formOut = runCli(path.join('.agents', 'skills', 'form_creator', 'scripts', 'add_form_to_app.js'), ['--appId', appId, '--form', mdPath]);
  const formUuidMatch = formOut.match(/表单UUID:\s*(FORM-[A-Z0-9]+)/);
  if (!formUuidMatch) { throw new Error('表单创建失败: ' + formOut.slice(-300)); }
  const formUuid = formUuidMatch[1];
  log('表单UUID: ' + formUuid);

  // Step 3: 提交1条测试数据（data-tester submitOne，普通表单链路）
  log('Step 3: 提交测试数据');
  const submitScript = path.join(tmpDir, PREFIX + 'submit.js');
  fs.writeFileSync(submitScript, [
    "const { submitOne, searchFormDatas, loadCookies } = require('" + path.join(PROJECT_ROOT, '.agents', 'skills', 'data-tester', 'scripts', 'submitter.js').replace(/\\/g, '/') + "');",
    "(async () => {",
    "  const cd = loadCookies();",
    "  const opts = { csrfToken: cd.csrfToken, cookies: cd.cookies, hostname: (cd.baseUrl || '').replace(/^https:\\/\\//, '') };",
    "  const r = await submitOne('" + appId + "', '" + formUuid + "', {}, opts);",
    "  console.log(JSON.stringify(r));",
    "})().catch(e => { console.error(e.message); process.exit(1); });",
  ].join('\n'));
  // 字段ID需真实值——从同步出的 Schema 提取
  const schemaFile = path.join(tmpDir, formName + '「普通表单」', formName + '「普通表单」.json');
  const schemaRaw = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  const schemaStr = JSON.stringify(schemaRaw);
  const textField = (schemaStr.match(/textField_[a-z0-9]+/) || [])[0];
  const numberField = (schemaStr.match(/numberField_[a-z0-9]+/) || [])[0];
  if (!textField) { throw new Error('未从 Schema 提取到 textField 字段ID: ' + schemaFile); }
  const submitScript2 = path.join(tmpDir, PREFIX + 'submit2.js');
  fs.writeFileSync(submitScript2, [
    "const { submitOne, searchFormDatas, loadCookies } = require('" + path.join(PROJECT_ROOT, '.agents', 'skills', 'data-tester', 'scripts', 'submitter.js').replace(/\\/g, '/') + "');",
    "(async () => {",
    "  const cd = loadCookies();",
    "  const opts = { csrfToken: cd.csrfToken, cookies: cd.cookies, hostname: (cd.baseUrl || '').replace(/^https:\\/\\//, '') };",
    "  const r = await submitOne('" + appId + "', '" + formUuid + "', { " + textField + ": 'SMOKE1', " + (numberField ? numberField + ': 42' : '') + " }, opts);",
    "  if (!r.success) { console.error('提交失败: ' + r.message); process.exit(1); }",
    "  await new Promise(res => setTimeout(res, 5000));",
    "  const recs = await searchFormDatas('" + appId + "', '" + formUuid + "');",
    "  console.log(JSON.stringify({ success: true, instId: r.instId, readbackCount: recs.length }));",
    "})().catch(e => { console.error(e.message); process.exit(1); });",
  ].join('\n'));
  const submitOut = runCli(submitScript2, []);
  const submitJson = extractJson(submitOut);
  if (!submitJson || !submitJson.success) { throw new Error('数据提交/回查失败: ' + submitOut.slice(-300)); }

  // Step 4: 登记注册表（清理需用户确认，本脚本不清理）
  const registry = readRegistry();
  registry.runs.push({
    registeredAt: new Date().toISOString(),
    purpose: name,
    appType: appId,
    appName,
    formUuid,
    textField,
    numberField: numberField || '',
    smokeInstId: submitJson.instId,
    readbackCount: submitJson.readbackCount,
    cleanup: '待用户确认（应用级删除建议在宜搭后台手动执行，或明确授权后脚本化）',
  });
  writeRegistry(registry);
  log('已登记注册表: ' + REGISTRY);

  console.log(JSON.stringify({
    success: true,
    mode: 'executed',
    appType: appId,
    formUuid,
    smokeInstId: submitJson.instId,
    readbackCount: submitJson.readbackCount,
    registry: '.cache/e2e/registry.json',
    cleanupNote: '清理需用户确认（未执行任何删除）',
  }, null, 2));
}

main(process.argv.slice(2)).catch((e) => {
  console.error('[e2e] 失败: ' + e.message);
  console.log(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
