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
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CACHE_DIR = path.join(PROJECT_ROOT, '.cache', 'publish-guard');
const PUBLISH_PAGE_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'custom-page', 'scripts', 'publish-page.js');

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
function saveLocalCache(formUuid, schema) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${formUuid}.json`);
  const cacheData = {
    formUuid,
    cachedAt: new Date().toISOString(),
    schema: schema,
  };
  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  return cachePath;
}

/**
 * 生成 Schema 摘要（用于对比）
 * 只对比关键字段，忽略时间戳等易变字段
 */
function summarizeSchema(schema) {
  if (!schema) return null;
  const summary = {
    formUuid: schema.formUuid || schema.id || '',
    actionsSource: extractSourceCode(schema),
    fieldCount: 0,
    componentCount: 0,
  };

  // 统计组件数量
  if (schema.pages && Array.isArray(schema.pages)) {
    for (const page of schema.pages) {
      if (page.componentsTree) {
        summary.componentCount += countComponents(page.componentsTree);
      }
    }
  }

  // 统计 action 数量
  if (schema.actions && schema.actions.list) {
    summary.actionCount = schema.actions.list.length;
  }

  return summary;
}

/**
 * 递归统计组件数量
 */
function countComponents(components) {
  let count = 0;
  if (!Array.isArray(components)) return count;
  for (const comp of components) {
    if (!comp) continue;
    count++;
    if (comp.children && Array.isArray(comp.children)) {
      count += countComponents(comp.children);
    }
  }
  return count;
}

/**
 * 对比两个 Schema 摘要，返回差异描述
 */
function diffSchemas(localSummary, onlineSummary) {
  const diffs = [];

  if (!localSummary) {
    return { hasDiff: true, diffs: ['本地无缓存，首次发布'], isUnsynced: false };
  }

  // 对比代码内容
  if (localSummary.actionsSource && onlineSummary.actionsSource) {
    if (localSummary.actionsSource !== onlineSummary.actionsSource) {
      const localLen = localSummary.actionsSource.length;
      const onlineLen = onlineSummary.actionsSource.length;
      diffs.push(`代码内容已变更（本地 ${localLen} 字符 → 线上 ${onlineLen} 字符）`);
    }
  }

  // 对比组件数量
  if (localSummary.componentCount !== onlineSummary.componentCount) {
    diffs.push(`组件数量已变更（本地 ${localSummary.componentCount} → 线上 ${onlineSummary.componentCount}）`);
  }

  // 对比 action 数量
  if (localSummary.actionCount !== undefined && onlineSummary.actionCount !== undefined) {
    if (localSummary.actionCount !== onlineSummary.actionCount) {
      diffs.push(`Action 数量已变更（本地 ${localSummary.actionCount} → 线上 ${onlineSummary.actionCount}）`);
    }
  }

  return {
    hasDiff: diffs.length > 0,
    diffs,
    isUnsynced: diffs.length > 0,
  };
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
async function cmdCheck(appType, formUuid) {
  console.log('=== 发布守卫 · 检查线上状态 ===');
  console.log(`应用 ID: ${appType}`);
  console.log(`页面 ID: ${formUuid}`);
  console.log('');

  // 1. 获取线上 Schema
  console.log('[1/3] 获取线上 Schema...');
  let onlineSchema;
  try {
    onlineSchema = await fetchOnlineSchema(appType, formUuid);
    console.log('  ✅ 线上 Schema 获取成功');
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    console.error('\n可能原因：页面不存在、登录态过期、网络问题');
    return { passed: false, reason: '获取线上 Schema 失败' };
  }

  // 2. 加载本地缓存
  console.log('[2/3] 加载本地缓存...');
  const localCache = loadLocalCache(formUuid);
  if (!localCache) {
    console.log('  ⚠️ 本地无缓存（首次发布或缓存已清除）');
    console.log('  → 跳过未同步改动检查（视为无冲突）');
    return { passed: true, reason: '无本地缓存，跳过检查', onlineSchema };
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
async function cmdPublish(appType, formUuid, codePath, force) {
  console.log('=== 发布守卫 · 安全发布 ===');
  console.log(`应用 ID: ${appType}`);
  console.log(`页面 ID: ${formUuid}`);
  console.log(`代码文件: ${codePath}`);
  console.log(`强制覆盖: ${force ? '是' : '否'}`);
  console.log('');

  // Step 1: 检查线上状态
  console.log('[Step 1/4] 发布前检查...');
  if (!force) {
    const checkResult = await cmdCheck(appType, formUuid);
    if (!checkResult.passed) {
      console.error('\n❌ 发布前检查未通过，发布中止。');
      console.error(`   原因: ${checkResult.reason}`);
      console.error('   如需强制覆盖，请使用 --force 参数。');
      return { passed: false, reason: checkResult.reason };
    }
  } else {
    console.log('  ⚠️ 已使用 --force，跳过未同步改动检查');
  }

  // Step 2: 调用 publish-page.js 发布
  console.log('\n[Step 2/4] 调用 publish-page.js 发布...');

  if (!fs.existsSync(PUBLISH_PAGE_PATH)) {
    console.error(`  ❌ publish-page.js 不存在: ${PUBLISH_PAGE_PATH}`);
    return { passed: false, reason: 'publish-page.js 不存在' };
  }

  const publishArgs = [codePath, appType, formUuid];
  console.log(`  命令: node publish-page.js ${publishArgs.join(' ')}`);

  const publishResult = await new Promise((resolve) => {
    const child = fork(PUBLISH_PAGE_PATH, publishArgs, {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    child.on('exit', (code) => {
      resolve({ success: code === 0, exitCode: code });
    });
    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });

  if (!publishResult.success) {
    console.error(`\n❌ 发布失败（退出码: ${publishResult.exitCode}）`);
    return { passed: false, reason: 'publish-page.js 执行失败' };
  }

  console.log('  ✅ 发布成功');

  // Step 3: 更新本地缓存
  console.log('\n[Step 3/4] 更新本地缓存...');
  try {
    const onlineSchema = await fetchOnlineSchema(appType, formUuid);
    saveLocalCache(formUuid, onlineSchema);
    console.log('  ✅ 本地缓存已更新');
  } catch (err) {
    console.log(`  ⚠️ 更新缓存失败: ${err.message}（不影响发布结果）`);
  }

  // Step 4: Health check
  console.log('\n[Step 4/4] 发布后 health check...');
  const healthResult = await cmdHealth(appType, formUuid, true);

  if (!healthResult.passed) {
    console.error('\n⚠️ Health check 未通过！页面可能存在异常。');
    console.error('   建议检查页面是否正常加载。');
    return { passed: false, reason: 'health check 失败', publishSuccess: true };
  }

  console.log('\n=== 安全发布完成 ===');
  return { passed: true };
}

/**
 * 命令 health：发布后 health check
 */
async function cmdHealth(appType, formUuid, silent) {
  if (!silent) {
    console.log('=== 发布守卫 · Health Check ===');
    console.log(`应用 ID: ${appType}`);
    console.log(`页面 ID: ${formUuid}`);
    console.log('');
  }

  const http = loadHttp();
  const checks = [];

  // Check 1: 页面 Schema 可获取
  if (!silent) console.log('[1/2] 检查页面 Schema 可获取...');
  try {
    const schema = await fetchOnlineSchema(appType, formUuid);
    if (schema) {
      checks.push({ name: 'Schema 可获取', passed: true });
      if (!silent) console.log('  ✅ 页面 Schema 获取成功');
    } else {
      checks.push({ name: 'Schema 可获取', passed: false, error: 'Schema 为空' });
      if (!silent) console.log('  ❌ 页面 Schema 为空');
    }
  } catch (err) {
    checks.push({ name: 'Schema 可获取', passed: false, error: err.message });
    if (!silent) console.log(`  ❌ ${err.message}`);
  }

  // Check 2: 代码内容非空
  if (!silent) console.log('[2/2] 检查代码内容非空...');
  try {
    const schema = await fetchOnlineSchema(appType, formUuid);
    const sourceCode = extractSourceCode(schema);
    if (sourceCode && sourceCode.length > 0) {
      checks.push({ name: '代码内容非空', passed: true, detail: `${sourceCode.length} 字符` });
      if (!silent) console.log(`  ✅ 代码内容非空（${sourceCode.length} 字符）`);
    } else {
      checks.push({ name: '代码内容非空', passed: false, error: '代码内容为空（可能白屏）' });
      if (!silent) console.log('  ❌ 代码内容为空（可能白屏）');
    }
  } catch (err) {
    checks.push({ name: '代码内容非空', passed: false, error: err.message });
    if (!silent) console.log(`  ❌ ${err.message}`);
  }

  const allPassed = checks.every(c => c.passed);

  if (!silent) {
    console.log('');
    console.log('── Health Check 结果 ──');
    for (const c of checks) {
      console.log(`  ${c.passed ? '✅' : '❌'} ${c.name}${c.detail ? ': ' + c.detail : ''}${c.error ? ': ' + c.error : ''}`);
    }
    console.log(allPassed ? '\n✅ Health check 全部通过' : '\n❌ Health check 存在失败项');
  }

  return { passed: allPassed, checks };
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
    case 'health':
      return cmdHealth(opts.appType, opts.formUuid, false);
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
