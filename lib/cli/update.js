/**
 * lib/cli/update.js — yida-helper update 命令实现
 *
 * 对比 registry 最新版 → 提示 → 执行 npm install -g → 自动跑 copy
 *
 * 创建日期：2026-08-17 (阶段三)
 * 版本：1.0.0
 */

'use strict';

const https = require('https');
const { execSync, spawn } = require('child_process');
const path = require('path');
const paths = require('../core/paths');

const PACKAGE_NAME = 'yidaai';

// ── 版本比较 ───────────────────────────────────────────

/**
 * 从 npm registry 获取最新版本号
 * @param {string} packageName
 * @returns {Promise<string|null>}
 */
function fetchLatestVersion(packageName) {
  return new Promise((resolve) => {
    const req = https.get(
      `https://registry.npmjs.org/${packageName}/latest`,
      { timeout: 10000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.version || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * 比较版本号，返回 latest 是否比 current 更新
 * @param {string} current
 * @param {string} latest
 * @returns {boolean}
 */
function isNewerVersion(current, latest) {
  if (!current || !latest) return false;
  const parseVer = (v) => v.replace(/[^0-9.]/g, '').split('.').map(Number);
  const c = parseVer(current);
  const l = parseVer(latest);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

// ── 主函数 ─────────────────────────────────────────────

/**
 * update 命令
 * @param {string[]} args - 命令行参数
 */
async function cmdUpdate(args) {
  const yes = args.includes('--yes');

  console.log('');
  console.log('  🔄 检查更新');
  console.log('');

  // 获取当前版本
  let currentVersion = 'unknown';
  try {
    const pkgPath = path.join(paths.packageRoot(), 'package.json');
    const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
    currentVersion = pkg.version || 'unknown';
  } catch {}

  console.log(`  📋 当前版本: ${currentVersion}`);

  // 获取最新版本
  const latestVersion = await fetchLatestVersion(PACKAGE_NAME);

  if (!latestVersion) {
    console.log('  ⚠️  无法连接 npm registry 或包尚未发布');
    console.log('     可能原因：网络问题 / 包未发布 / 首次安装');
    console.log('');
    return;
  }

  console.log(`  📋 npm 最新版: ${latestVersion}`);
  console.log('');

  if (!isNewerVersion(currentVersion, latestVersion)) {
    console.log('  ✅ 已是最新版本，无需更新');
    console.log('');
    return;
  }

  // 需要更新
  if (!yes) {
    console.log(`  ⚠️  发现新版本: ${currentVersion} → ${latestVersion}`);
    console.log('     使用 --yes 参数自动更新，或手动执行:');
    console.log(`     npm install -g ${PACKAGE_NAME}@latest`);
    console.log('');
    return;
  }

  // --yes 模式：自动更新
  console.log(`  📦 正在更新到 ${latestVersion}...`);
  console.log('');

  try {
    // 使用 inherit stdio 以显示 npm 输出
    execSync(`npm install -g ${PACKAGE_NAME}@latest`, { stdio: 'inherit' });
    console.log('');
    console.log('  ✅ 更新成功！');
  } catch {
    console.log('  ❌ 更新失败，请手动执行:');
    console.log(`     npm install -g ${PACKAGE_NAME}@latest`);
    console.log('');
    process.exit(1);
  }

  // 自动跑 copy
  console.log('');
  console.log('  📦 自动刷新 skills 分发...');
  console.log('');
  try {
    const cmdCopy = require('./copy');
    cmdCopy([]);
  } catch {
    console.log('  ⚠️  skills 分发失败，请手动执行: yida-helper copy');
  }

  console.log('');
  console.log('  🎉 更新完成！请重启 AI 工具使新 skills 生效。');
  console.log('');
}

module.exports = cmdUpdate;
