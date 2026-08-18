/**
 * lib/cli/migrate.js — yida-helper migrate
 *
 * 老用户数据迁移：从旧项目目录复制数据文件到新工作目录。
 *
 * 迁移内容：
 *   1. 组织及应用信息.md → 新目录（若全局不存在则同时复制到全局）
 *   2. .cookies.json → 全局 cookieFile()（如果全局不存在）
 *   3. .cache/cookies.json → 全局 cookieFile()（更老格式兼容）
 *   4. 本地操作页面/ → 新目录（可选）
 *
 * 创建日期：2026-08-18 (阶段六)
 * 版本：1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../core/paths');

// ── 辅助函数 ───────────────────────────────────────────

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  return true;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

// ── 主函数 ─────────────────────────────────────────────

/**
 * migrate 命令
 * @param {string[]} args - 命令行参数，第一个为旧项目路径
 */
function cmdMigrate(args) {
  if (!args || args.length === 0) {
    console.log('  用法: yida-helper migrate <旧项目路径>');
    console.log('');
    console.log('  将旧项目的数据文件迁移到当前工作目录，并将 Cookie 迁移到全局目录。');
    console.log('');
    console.log('  示例:');
    console.log('    yida-helper migrate ~/my-old-project');
    console.log('    yida-helper migrate "D:\\宜搭项目\\旧版本"');
    console.log('');
    process.exit(1);
  }

  const oldProjectDir = path.resolve(args[0]);
  const newProjectDir = process.cwd();
  const globalCookie = paths.cookieFile();
  const globalDir = paths.dataDir();

  console.log('');
  console.log('  📦 数据迁移');
  console.log(`  📁 旧项目: ${oldProjectDir}`);
  console.log(`  📁 新项目: ${newProjectDir}`);
  console.log(`  🌐 全局目录: ${globalDir}`);
  console.log('');

  if (!fs.existsSync(oldProjectDir)) {
    console.error(`  ❌ 旧项目目录不存在: ${oldProjectDir}`);
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;

  // 1. 迁移组织及应用信息.md
  const orgInfoFile = '组织及应用信息.md';
  const oldOrgInfo = path.join(oldProjectDir, orgInfoFile);
  if (fs.existsSync(oldOrgInfo)) {
    const newOrgInfo = path.join(newProjectDir, orgInfoFile);
    if (copyFile(oldOrgInfo, newOrgInfo)) {
      console.log(`  ✅ ${orgInfoFile} → 新项目目录`);
      migrated++;
    }
    // 如果全局没有，也复制到全局
    const globalOrgInfo = path.join(globalDir, orgInfoFile);
    if (!fs.existsSync(globalOrgInfo)) {
      copyFile(oldOrgInfo, globalOrgInfo);
      console.log(`  ✅ ${orgInfoFile} → 全局目录（备份）`);
    }
  } else {
    console.log(`  ⏭️  ${orgInfoFile} 不存在，跳过`);
    skipped++;
  }

  // 2. 迁移 .cookies.json → 全局
  const oldCookieFiles = [
    { src: path.join(oldProjectDir, '.cookies.json'), desc: '.cookies.json' },
    { src: path.join(oldProjectDir, '.cache', 'cookies.json'), desc: '.cache/cookies.json' },
  ];

  let cookieMigrated = false;
  for (const { src, desc } of oldCookieFiles) {
    if (fs.existsSync(src)) {
      if (!fs.existsSync(globalCookie)) {
        // 确保全局目录存在
        if (!fs.existsSync(globalDir)) {
          fs.mkdirSync(globalDir, { recursive: true });
        }
        copyFile(src, globalCookie);
        console.log(`  ✅ ${desc} → 全局 Cookie (${globalCookie})`);
        migrated++;
        cookieMigrated = true;
        break;
      } else {
        console.log(`  ℹ️  全局 Cookie 已存在，跳过迁移（如需覆盖请先 yida-helper logout）`);
        cookieMigrated = true;
        break;
      }
    }
  }
  if (!cookieMigrated) {
    console.log('  ⏭️  未找到 Cookie 文件，跳过');
    skipped++;
  }

  // 3. 迁移本地操作页面/（可选）
  const oldLocalPage = path.join(oldProjectDir, '本地操作页面');
  if (fs.existsSync(oldLocalPage)) {
    const newLocalPage = path.join(newProjectDir, '本地操作页面');
    if (!fs.existsSync(newLocalPage)) {
      copyDir(oldLocalPage, newLocalPage);
      console.log('  ✅ 本地操作页面/ → 新项目目录');
      migrated++;
    } else {
      console.log('  ℹ️  新项目已有 本地操作页面/，跳过');
      skipped++;
    }
  } else {
    console.log('  ⏭️  本地操作页面/ 不存在，跳过');
    skipped++;
  }

  // 4. 迁移 .agents/skills/（可选，老用户可能有自定义 skills）
  const oldSkills = path.join(oldProjectDir, '.agents', 'skills');
  if (fs.existsSync(oldSkills)) {
    console.log('');
    console.log('  ℹ️  检测到旧项目有 .agents/skills/ 目录');
    console.log('     如需刷新 skills 到全局各工具，请运行: yida-helper copy');
    console.log('     如需复制到当前项目，请运行: yida-helper copy --project .');
  }

  console.log('');
  console.log(`  🎉 迁移完成: ${migrated} 项已迁移，${skipped} 项跳过`);
  console.log('');
  console.log('  下一步：');
  console.log('    yida-helper login    # 重新登录（如果 Cookie 未迁移成功）');
  console.log('    yida-helper copy     # 分发 skills 到各 AI 工具');
  console.log('    yida-helper doctor   # 环境体检');
  console.log('');
}

module.exports = cmdMigrate;
