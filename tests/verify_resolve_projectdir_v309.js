/**
 * tests/verify_resolve_projectdir_v309.js
 *
 * 验证 resolveProjectDir 在「服务在项目根内启动」（单项目模式）下不再误报 projectDir 无效。
 *
 * 背景（2026-09-22 实测）：
 *   STATIC_ROOT = process.cwd()。若服务由 `cd <项目根> && node sync_server.js` 启动，
 *   则 staticRoot == 项目根，此时 path.join(staticRoot, '{项目名}') 多套一层不存在的路径，
 *   旧实现直接放弃 → 刷出大量「传入的 projectDir 无效: 新鑫科技AI助手V2.0.33」噪音，
 *   并回退 referer/唯一项目（可能定位到错误项目）。
 *
 * 本脚本用真实文件系统 + 假 req 对象驱动，产出 verdict 字段 + exit code。
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { resolveProjectDir } = require('../lib/sync-server/dir-ops');

const PROJECT_ROOT = 'D:\\宜搭开发项目资料\\2025项目\\广东新鑫科技有限公司\\新鑫科技AI助手V2.0.33';
const STATIC_ROOT = 'D:\\宜搭开发项目资料\\2025项目\\广东新鑫科技有限公司';
const PROJECT_NAME = '新鑫科技AI助手V2.0.33';

const results = [];

function check(name, actual, expected) {
  const pass = actual === expected;
  results.push({ name, pass, actual, expected });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) {
    console.log(`        期望: ${expected}`);
    console.log(`        实际: ${actual}`);
  }
}

// 构造最小 req 对象（resolveProjectDir 只读 req.headers.referer）
const fakeReq = (referer = '') => ({ headers: { referer } });

function main() {
  console.log('='.repeat(64));
  console.log('验证 resolveProjectDir — projectDir 解析兜底 (v3.0.9)');
  console.log('='.repeat(64));

  // 场景 A：多项目模式（cwd = staticRoot），传相对项目名 → 应精确命中项目根
  console.log('\n[场景 A] 多项目模式：staticRoot=父目录，projectDir="{项目名}"');
  {
    const r = resolveProjectDir(fakeReq(), {
      projectDir: PROJECT_NAME,
      staticRoot: STATIC_ROOT,
    });
    check('A1 解析出项目根绝对路径', r, PROJECT_ROOT);
    check('A2 项目根存在 组织及应用信息.md', fs.existsSync(path.join(r || '', '组织及应用信息.md')), true);
  }

  // 场景 B：单项目模式（staticRoot 本身就是项目根），传项目名 → 兜底返回 staticRoot
  console.log('\n[场景 B] 单项目模式：staticRoot=项目根自身，projectDir="{项目名}"');
  {
    const r = resolveProjectDir(fakeReq(), {
      projectDir: PROJECT_NAME,
      staticRoot: PROJECT_ROOT,
    });
    check('B1 兜底命中 staticRoot（不再报无效）', r, PROJECT_ROOT);
  }

  // 场景 C：单项目模式，projectDir 传绝对路径 → 正常
  console.log('\n[场景 C] 单项目模式：projectDir 传绝对路径');
  {
    const r = resolveProjectDir(fakeReq(), {
      projectDir: PROJECT_ROOT,
      staticRoot: PROJECT_ROOT,
    });
    check('C1 绝对路径直通', r, PROJECT_ROOT);
  }

  // 场景 D：真的无效值 → 仍应走到后续兜底（referer 反推 / 唯一项目）
  console.log('\n[场景 D] 传入真正无效的 projectDir → 应走 referer 兜底，不返回错误目录');
  {
    const referer = `http://127.0.0.1:8080/${encodeURIComponent(PROJECT_NAME)}/本地操作页面/index.html`;
    const r = resolveProjectDir(fakeReq(referer), {
      projectDir: '不存在的项目XYZ',
      staticRoot: STATIC_ROOT,
    });
    check('D1 referer 反推命中项目根', r, PROJECT_ROOT);
  }

  // 场景 E：无效 projectDir 且无 referer → 静态根下唯一项目兜底
  console.log('\n[场景 E] 无效 projectDir + 无 referer → 唯一项目兜底');
  {
    const r = resolveProjectDir(fakeReq(), {
      projectDir: '不存在的项目XYZ',
      staticRoot: PROJECT_ROOT, // staticRoot 即项目根，走 hasOrgConfig(staticRoot) 兜底
    });
    check('E1 兜底到 staticRoot 自身', r, PROJECT_ROOT);
  }

  const failed = results.filter((r) => !r.pass);
  const verdict = failed.length === 0 ? 'PASS' : 'FAIL';

  console.log('\n' + '='.repeat(64));
  console.log(`总计: ${results.length}  通过: ${results.length - failed.length}  失败: ${failed.length}`);
  console.log(`verdict: ${verdict}`);
  console.log('='.repeat(64));

  process.exit(verdict === 'PASS' ? 0 : 1);
}

main();
