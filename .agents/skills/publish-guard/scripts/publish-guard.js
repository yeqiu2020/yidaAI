#!/usr/bin/env node
/**
 * 宜搭自定义页面发布守卫（Publish Guard）
 *
 * 功能：
 *   ① check   — 检查线上页面是否有未同步改动（对比线上 Schema 与本地缓存）
 *   ② diff    — 预览本地代码与线上代码的差异摘要
 *   ③ publish — 安全发布（检查 → 发布 → health check）
 *   ④ health  — 发布后 health check（页面可访问、非白屏/500）
 *
 * 用法:
 *   node publish-guard.js check   --appType <appType> --formUuid <formUuid>
 *   node publish-guard.js diff    --appType <appType> --formUuid <formUuid> --code <文件路径>
 *   node publish-guard.js publish --appType <appType> --formUuid <formUuid> --code <文件路径> [--force]
 *   node publish-guard.js health  --appType <appType> --formUuid <formUuid>
 *   node publish-guard.js --help
 *
 * 风险等级: R2（会读线上、可触发发布，需门禁+影子运行）
 *
 * 重要约束:
 *   - 不修改稳定轨的 publish-page.js
 *   - 作为 publish-page.js 的前置检查层，通过 child_process.fork 调用它
 *   - 发布后自动更新本地缓存
 *
 * 创建日期: 2026-07-10 (Phase 5-0)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

// 项目根目录
const SCRIPT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PROJECT_ROOT = require(path.join(SCRIPT_ROOT, 'lib/core/utils')).findProjectRoot();
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache', 'publish-guard');
const PUBLISH_PAGE_PATH = path.join(SCRIPT_ROOT, '.agents', 'skills', 'custom-page', 'scripts', 'publish-page.js');

// ── 工具函数 ───────────────────────────────────────────

/**
 * 加载 lib/core/http.js
 */
function loadHttp() {
  try {
    return require(path.join(PROJECT_ROOT, 'lib', 'core', 'http.js'));
  } catch (err) {
    throw new Error(`无法加载 lib/core/http.js: ${err.message}`);
  }
}

/**
 * 获取线上页面 Schema
 */
async function fetchOnlineSchema(appType, formUuid) {
  const http = loadHttp();
  const apiPath = `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json?formUuid=${formUuid}&schemaVersion=V5`;
  const result = await http.httpGet(apiPath);

  if (!result.success) {
    throw new Error(`获取线上 Schema 失败: ${result.errorMsg || '未知错误'}`);
  }

  return result.content || result.data;
}

/**
 * 从 Schema 中提取代码内容（actions.module.source）
 */
function extractSourceCode(schema) {
  if (!schema) return '';
  // V5 Schema 结构：actions.module.source
  if (schema.actions && schema.actions.module && schema.actions.module.source) {
    return schema.actions.module.source;
  }
  // 备选：pages[0].methods 等
  if (schema.pages && schema.pages[0]) {
    const page = schema.pages[0];
    if (page.methods && page.methods.__initMethods__ && page.methods.__initMethods__.source) {
      return page.methods.__initMethods__.source;
    }
  }
  return '';
}

/**
 * 获取本地缓存的 Schema 快照
 */
function loadLocalCache(formUuid) {
  const cachePath = path.join(CACHE_DIR, `${formUuid}.json`);
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 保存 Schema 快照到本地缓存
 */
function saveLocalCache(formUuid, schema, metadata = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${formUuid}.json`);
  const cacheData = {
    formUuid,
    cachedAt: new Date().toISOString(),
    schema: schema,
    ...metadata,
  };
  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  return cachePath;
}

/**
 * 生成 Schema 摘要（用于对比）
 * 只对比关键字段，忽略时间戳等易变字段
 */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function summarizeSchema(schema) {
  if (!schema) return null;
  return stable({ actions: schema.actions || null, pages: schema.pages || null, componentsTree: schema.componentsTree || null, config: schema.config || null });
}
function diffSchemas(localSummary, onlineSummary) {
  const changed = !localSummary || JSON.stringify(stable(localSummary)) !== JSON.stringify(stable(onlineSummary));
  return { hasDiff: changed, isUnsynced: changed, diffs: changed ? ['线上内容与同步基线不同（含代码、编译产物、组件或配置）'] : [] };
}
const normalize = value => String(value || '').replace(/\r\n/g, '\n').trim();
function findCanvas(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.componentName === 'YidaCodeCanvas') return schema.props || {};
  for (const value of Object.values(schema)) {
    if (value && typeof value === 'object') {
      const found = findCanvas(value);
      if (found) return found;
    }
  }
  return null;
}
function compileExpected(codePath) {
  const source = fs.readFileSync(codePath, 'utf8');
  if (/\.canvas\.(jsx|tsx)$/i.test(codePath)) {
    const artifact = require('../../custom-page/scripts/canvas-publish').compileCanvasLocal(source);
    return { type: 'canvas', runtimeCode: artifact.runtimeCode, importedModules: artifact.importedModules };
  }
  const publisher = require('../../custom-page/scripts/publish-page');
  const compiled = publisher.compileSource(source, 'commonjs');
  new (require('vm').Script)(compiled);
  return { type: 'native', source, compiled, functions: publisher.extractExportedFunctions(source) };
}
function verifyPublishedSchema(schema, expected) {
  const failures = [];
  if (!expected) return { passed: false, failures: ['缺少本次代码预期，请使用 publish 或 health --code 核对'], runtimeVerified: false };
  if (expected.type === 'canvas') {
    const canvas = findCanvas(schema);
    if (!canvas || normalize(canvas.runtimeCode) !== normalize(expected.runtimeCode) || normalize(canvas.code) !== normalize(expected.runtimeCode)) failures.push('Canvas 运行代码与本次产物不一致');
    if (!canvas || JSON.stringify(stable(canvas.importedModules)) !== JSON.stringify(stable(expected.importedModules))) failures.push('Canvas 依赖不一致');
  } else {
    const actions = schema && schema.actions || {};
    const module = actions.module || {};
    if (normalize(module.source) !== normalize(expected.source)) failures.push('source 与本次源码不一致');
    if (normalize(module.compiled) !== normalize(expected.compiled)) failures.push('compiled 与本次编译产物不一致');
    const ids = new Set((actions.list || []).map(item => item.id));
    for (const name of expected.functions || []) if (!ids.has(name)) failures.push('函数注册表缺失: ' + name);
  }
  return { passed: failures.length === 0, failures, runtimeVerified: false };
}

/**
 * 生成代码 diff 摘要
 */
function generateCodeDiff(localCode, onlineCode) {
  const localLines = localCode.split('\n');
  const onlineLines = onlineCode ? onlineCode.split('\n') : [];

  const added = [];
  const removed = [];

  // 简单的行级 diff
  const localSet = new Set(localLines.map(l => l.trim()).filter(Boolean));
  const onlineSet = new Set(onlineLines.map(l => l.trim()).filter(Boolean));

  for (const line of localLines) {
    const trimmed = line.trim();
    if (trimmed && !onlineSet.has(trimmed)) {
      added.push(line);
    }
  }

  for (const line of onlineLines) {
    const trimmed = line.trim();
    if (trimmed && !localSet.has(trimmed)) {
      removed.push(line);
    }
  }

  return {
    localLines: localLines.length,
    onlineLines: onlineLines.length,
    added: added.slice(0, 10),  // 最多显示 10 行
    removed: removed.slice(0, 10),
    addedCount: added.length,
    removedCount: removed.length,
  };
}

// ── 命令实现 ───────────────────────────────────────────

/**
 * 命令 check：检查线上页面是否有未同步改动
 */
async function cmdCheck(appType, formUuid, services = {}) {
  console.log('=== 发布守卫 · 检查线上状态 ===');
  console.log(`应用 ID: ${appType}`);
  console.log(`页面 ID: ${formUuid}`);
  console.log('');

  // 1. 获取线上 Schema
  console.log('[1/3] 获取线上 Schema...');
  let onlineSchema;
  try {
    onlineSchema = await (services.fetchSchema || fetchOnlineSchema)(appType, formUuid);
    console.log('  ✅ 线上 Schema 获取成功');
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    console.error('\n可能原因：页面不存在、登录态过期、网络问题');
    return { passed: false, reason: '获取线上 Schema 失败' };
  }

  // 2. 加载本地缓存
  console.log('[2/3] 加载本地缓存...');
  const localCache = (services.loadCache || loadLocalCache)(formUuid);
  if (!localCache) {
    console.log('  ⚠️ 本地无缓存（首次发布或缓存已清除）');
    console.log('  → 请先检查线上内容并执行 baseline 建立同步基线');
    return { passed: false, reason: '无同步基线，禁止盲目覆盖', onlineSchema };
  }
  console.log(`  ✅ 本地缓存存在（缓存时间: ${localCache.cachedAt}）`);

  // 3. 对比
  console.log('[3/3] 对比线上与本地缓存...');
  const localSummary = summarizeSchema(localCache.schema);
  const onlineSummary = summarizeSchema(onlineSchema);
  const diff = diffSchemas(localSummary, onlineSummary);

  if (diff.isUnsynced) {
    console.log('  ❌ 检测到线上有未同步改动！');
    for (const d of diff.diffs) {
      console.log(`     • ${d}`);
    }
    console.log('\n⚠️ 发布将覆盖线上改动！如需强制覆盖，请使用 --force 参数。');
    return { passed: false, reason: '线上有未同步改动', diff, onlineSchema };
  } else {
    console.log('  ✅ 线上与本地缓存一致，无未同步改动');
    return { passed: true, reason: '无未同步改动', onlineSchema };
  }
}

/**
 * 命令 diff：预览发布内容 diff
 */
async function cmdDiff(appType, formUuid, codePath) {
  console.log('=== 发布守卫 · 代码差异预览 ===');
  console.log(`应用 ID: ${appType}`);
  console.log(`页面 ID: ${formUuid}`);
  console.log(`代码文件: ${codePath}`);
  console.log('');

  // 读取本地代码
  if (!fs.existsSync(codePath)) {
    console.error(`❌ 代码文件不存在: ${codePath}`);
    return { passed: false, reason: '代码文件不存在' };
  }
  const localCode = fs.readFileSync(codePath, 'utf-8');

  // 获取线上代码
  console.log('[1/2] 获取线上代码...');
  let onlineSchema;
  try {
    onlineSchema = await fetchOnlineSchema(appType, formUuid);
    console.log('  ✅ 线上 Schema 获取成功');
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    return { passed: false, reason: '获取线上 Schema 失败' };
  }

  const onlineCode = extractSourceCode(onlineSchema);

  // 生成 diff
  console.log('[2/2] 生成差异摘要...');
  const diff = generateCodeDiff(localCode, onlineCode);

  console.log('');
  console.log('── 差异摘要 ──');
  console.log(`本地代码: ${diff.localLines} 行`);
  console.log(`线上代码: ${diff.onlineLines} 行`);
  console.log(`新增行: ${diff.addedCount} 行`);
  console.log(`删除行: ${diff.removedCount} 行`);

  if (diff.added.length > 0) {
    console.log('\n── 新增行（最多 10 行）──');
    for (const line of diff.added) {
      console.log(`  + ${line}`);
    }
  }

  if (diff.removed.length > 0) {
    console.log('\n── 删除行（最多 10 行）──');
    for (const line of diff.removed) {
      console.log(`  - ${line}`);
    }
  }

  if (diff.addedCount === 0 && diff.removedCount === 0) {
    console.log('\n✅ 本地代码与线上代码一致');
  }

  return { passed: true, diff };
}

/**
 * 命令 publish：安全发布（检查 → 发布 → health check）
 */
async function publishFile(codePath, appType, formUuid) {
  return new Promise(resolve => {
    const child = fork(PUBLISH_PAGE_PATH, [codePath, appType, formUuid], { stdio: 'inherit', cwd: PROJECT_ROOT });
    child.on('exit', code => resolve({ success: code === 0, exitCode: code }));
    child.on('error', error => resolve({ success: false, error: error.message }));
  });
}

async function cmdPublish(appType, formUuid, codePath, force, services = {}) {
  const fetchSchema = services.fetchSchema || fetchOnlineSchema;
  const expected = (services.compileExpected || compileExpected)(codePath);
  const before = force ? { passed: true, onlineSchema: await fetchSchema(appType, formUuid) } : await cmdCheck(appType, formUuid, services);
  if (!before.passed) return before;
  const source = fs.readFileSync(codePath, 'utf8');
  const canvas = expected.type === 'canvas' && findCanvas(before.onlineSchema);
  const diff = generateCodeDiff(expected.type === 'canvas' ? expected.runtimeCode : source,
    expected.type === 'canvas' ? String(canvas && canvas.runtimeCode || '') : extractSourceCode(before.onlineSchema));
  console.log('发布差异：新增 ' + diff.addedCount + ' 行，删除 ' + diff.removedCount + ' 行');
  diff.added.forEach(line => console.log('  + ' + line));
  diff.removed.forEach(line => console.log('  - ' + line));
  // Detect edits made after the check, before starting the publisher.
  const latest = await fetchSchema(appType, formUuid);
  if (diffSchemas(summarizeSchema(before.onlineSchema), summarizeSchema(latest)).hasDiff) return { passed: false, reason: '检查后线上再次变化，请重新核对' };
  const result = await (services.publish || publishFile)(codePath, appType, formUuid);
  if (!result.success) return { passed: false, reason: '发布命令失败', saved: false };
  const health = await cmdHealth(appType, formUuid, true, expected, services);
  if (!health.passed) return { passed: false, saved: true, verified: false, reason: health.failures.join('；'), health };
  // Advance the baseline only after comparing this release's actual payload.
  (services.saveCache || saveLocalCache)(formUuid, health.schema, { expected });
  console.log('保存与回读已验证；请在内置浏览器完成页面运行验收。');
  return { passed: true, saved: true, verified: true, runtimeVerified: false, nextAction: 'in_app_browser_validation', diff };
}

async function cmdHealth(appType, formUuid, silent, expected, services = {}) {
  try {
    const schema = await (services.fetchSchema || fetchOnlineSchema)(appType, formUuid);
    const cache = !expected && (services.loadCache || loadLocalCache)(formUuid);
    const result = verifyPublishedSchema(schema, expected || cache && cache.expected);
    if (!silent) console.log(JSON.stringify(result, null, 2));
    return { ...result, schema };
  } catch (error) { return { passed: false, failures: [error.message], runtimeVerified: false }; }
}

async function cmdBaseline(appType, formUuid) {
  const schema = await fetchOnlineSchema(appType, formUuid);
  const file = saveLocalCache(formUuid, schema);
  console.log('同步基线已保存（未发布）: ' + file);
  return { passed: true, file };
}

// ── 参数解析 ───────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { help: true };
  }

  const command = args[0];
  const opts = {
    command,
    appType: null,
    formUuid: null,
    code: null,
    force: false,
    help: false,
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--appType':
        opts.appType = args[++i];
        break;
      case '--formUuid':
        opts.formUuid = args[++i];
        break;
      case '--code':
        opts.code = args[++i];
        break;
      case '--force':
        opts.force = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        break;
    }
  }

  return opts;
}

function printUsage() {
  console.log(`
宜搭自定义页面发布守卫（Publish Guard）

命令:
  check    检查线上页面是否有未同步改动
  diff     预览本地代码与线上代码的差异
  publish  安全发布（检查 → 发布 → health check）
  health   发布后 health check

用法:
  node publish-guard.js check   --appType <appType> --formUuid <formUuid>
  node publish-guard.js diff    --appType <appType> --formUuid <formUuid> --code <文件路径>
  node publish-guard.js publish --appType <appType> --formUuid <formUuid> --code <文件路径> [--force]
  node publish-guard.js health  --appType <appType> --formUuid <formUuid>

参数:
  --appType <id>      应用 ID
  --formUuid <id>     页面 UUID
  --code <path>       本地代码文件路径
  --force             强制覆盖（跳过未同步改动检查）
  --help              显示帮助

风险等级: R2（会读线上、可触发发布）
`);
}

// ── 主流程 ─────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  // 验证必填参数
  if (!opts.appType || !opts.formUuid) {
    console.error('❌ 缺少必填参数: --appType 和 --formUuid');
    printUsage();
    process.exit(1);
  }

  switch (opts.command) {
    case 'check':
      return cmdCheck(opts.appType, opts.formUuid);
    case 'diff':
      if (!opts.code) {
        console.error('❌ diff 命令需要 --code 参数');
        process.exit(1);
      }
      return cmdDiff(opts.appType, opts.formUuid, path.resolve(opts.code));
    case 'publish':
      if (!opts.code) {
        console.error('❌ publish 命令需要 --code 参数');
        process.exit(1);
      }
      return cmdPublish(opts.appType, opts.formUuid, path.resolve(opts.code), opts.force);
    case 'baseline':
      return cmdBaseline(opts.appType, opts.formUuid);
    case 'health':
      return cmdHealth(opts.appType, opts.formUuid, false, opts.code ? compileExpected(opts.code) : undefined);
    default:
      console.error(`❌ 未知命令: ${opts.command}`);
      printUsage();
      process.exit(1);
  }
}

// 模块导出（供测试和外部调用）
module.exports = {
  fetchOnlineSchema,
  extractSourceCode,
  loadLocalCache,
  saveLocalCache,
  summarizeSchema,
  diffSchemas,
  generateCodeDiff,
  cmdCheck,
  cmdDiff,
  cmdPublish,
  cmdHealth,
  cmdBaseline,
  compileExpected,
  verifyPublishedSchema,
};

// 命令行入口
if (require.main === module) {
  main().then(result => {
    if (result && result.passed === false) {
      process.exit(1);
    }
  }).catch(err => {
    console.error('发布守卫执行失败:', err.message);
    process.exit(1);
  });
}
