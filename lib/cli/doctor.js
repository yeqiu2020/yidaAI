/**
 * lib/cli/doctor.js — yida-helper doctor 命令实现
 *
 * 环境体检，输出结构化报告：
 *   1. Node 版本
 *   2. 登录态（Cookie 存在性）
 *   3. Playwright 可用性
 *   4. 端口占用（8080 / 3457）
 *   5. 各工具 skills 分发状态
 *   6. npm 最新版
 *
 * 创建日期：2026-08-17 (阶段三)
 * 版本：1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const net = require('net');
const { execSync } = require('child_process');
const paths = require('../core/paths');

// ── 工具映射表（与 copy.js 一致）──────────────────────

const toolMap = require('../core/tool-map');
const { FOLDER_NAME, TOOL_MAP: TOOL_MAP_DOCTOR, MANIFEST_FILE, getSkillsDir, getNestedTargetDir } = toolMap;

// ── 检查函数 ───────────────────────────────────────────

/**
 * 检查端口是否被占用
 * @param {number} port
 * @returns {boolean}
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createConnection({ port, host: '127.0.0.1' });
    tester.on('connect', () => { tester.end(); resolve(true); });
    tester.on('error', () => resolve(false));
    tester.setTimeout(1000);
    tester.on('timeout', () => { tester.destroy(); resolve(false); });
  });
}

/**
 * 从 npm registry 获取最新版本号
 * @param {string} packageName
 * @returns {Promise<string|null>}
 */
function fetchLatestVersion(packageName) {
  return new Promise((resolve) => {
    const req = https.get(
      `https://registry.npmjs.org/${packageName}/latest`,
      { timeout: 5000 },
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
 * 检查 Playwright 是否可用
 * @returns {boolean}
 */
function checkPlaywright() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    try {
      require.resolve('playwright-core');
      return true;
    } catch {
      return false;
    }
  }
}

// ── 主函数 ─────────────────────────────────────────────

/**
 * doctor 命令
 */
async function cmdDoctor() {
  const checks = [];
  let allPass = true;

  console.log('');
  console.log('  🩺 环境体检报告');
  console.log('  ' + '='.repeat(56));

  // 1. Node 版本
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
  const nodeOk = nodeMajor >= 18;
  checks.push({ item: 'Node 版本', status: nodeOk, detail: `${nodeVersion} (要求 >=18)` });
  if (!nodeOk) allPass = false;

  // 2. 登录态
  const cookieFile = paths.findCookieFile();
  let cookieCount = 0;
  if (cookieFile) {
    try {
      const raw = fs.readFileSync(cookieFile, 'utf-8');
      const parsed = JSON.parse(raw);
      const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
      cookieCount = cookies.length;
    } catch {}
  }
  checks.push({
    item: '登录态 (Cookie)',
    status: cookieCount > 0,
    detail: cookieFile ? `${cookieCount} 个 Cookie (${cookieFile})` : '未找到 .cookies.json',
  });
  if (cookieCount === 0) allPass = false;

  // 3. Playwright
  const pwOk = checkPlaywright();
  checks.push({
    item: 'Playwright',
    status: pwOk,
    detail: pwOk ? '已安装 (可选依赖)' : '未安装 (可选，登录/自动化需要)',
  });
  // Playwright 不影响 allPass（可选依赖）

  // 4. 端口占用
  const port8080 = await isPortInUse(8080);
  const port3457 = await isPortInUse(3457);
  checks.push({
    item: '端口 8080 (静态服务)',
    status: true,
    detail: port8080 ? '已启动' : '未启动 (yida-helper start)',
  });
  checks.push({
    item: '端口 3457 (同步服务)',
    status: true,
    detail: port3457 ? '已启动' : '未启动',
  });

  // 5. 各工具 skills 分发状态
  console.log('');
  console.log('  ── Skills 分发状态 ──');
  const home = os.homedir();
  for (const tool of TOOL_MAP_DOCTOR) {
    const toolDir = path.join(home, tool.dir);
    const exists = fs.existsSync(toolDir);

    let skillsInstalled = false;
    if (exists) {
      if (tool.flatten) {
        // 拍平工具：检测 manifest + 抽查一个 skill
        const manifestPath = path.join(getSkillsDir(tool), MANIFEST_FILE);
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            skillsInstalled = manifest.length > 0;
          } catch {}
        }
      } else {
        // 嵌套工具：检测套壳目录
        const nestedDir = getNestedTargetDir(tool);
        skillsInstalled = fs.existsSync(nestedDir);
      }
    }

    const icon = skillsInstalled ? '✅' : (exists ? '⚠️' : '⏭️');
    const detail = !exists ? '工具未安装' :
                   skillsInstalled ? '已分发' : '工具已安装但 skills 未分发 (yida-helper copy)';
    console.log(`  ${icon} ${tool.name.padEnd(12)} ${detail}`);
    if (exists && !skillsInstalled) allPass = false;
  }

  // 6. npm 最新版
  console.log('');
  console.log('  ── 版本检查 ──');
  const pkgPath = path.join(paths.packageRoot(), 'package.json');
  let currentVersion = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    currentVersion = pkg.version || 'unknown';
  } catch {}

  const latestVersion = await fetchLatestVersion('yidaai');
  if (latestVersion) {
    const isLatest = currentVersion === latestVersion;
    console.log(`  ${isLatest ? '✅' : '⚠️'} 当前版本: ${currentVersion}`);
    console.log(`  ${isLatest ? '✅' : '⚠️'} npm 最新版: ${latestVersion}`);
    if (!isLatest) {
      console.log(`     可更新: npm install -g yidaai@latest`);
    }
  } else {
    console.log(`  ✅ 当前版本: ${currentVersion}`);
    console.log(`  ℹ️  无法连接 npm registry (可能是包尚未发布或网络问题)`);
  }

  // 汇总
  console.log('');
  console.log('  ' + '='.repeat(56));
  console.log(`  ${allPass ? '✅ 体检通过' : '⚠️ 有需关注的项目（见上方详情）'}`);
  console.log('');

  // 结构化清单
  console.log('  ── 结构化清单 ──');
  for (const c of checks) {
    console.log(`  ${c.status ? '✅' : '❌'} ${c.item}: ${c.detail}`);
  }
  console.log('');
}

module.exports = cmdDoctor;
