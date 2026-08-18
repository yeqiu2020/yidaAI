/**
 * scripts/postinstall.js — npm 安装后钩子（多工具版 + 拍平支持）
 *
 * 1. cleanupLegacy()：清理历史版本遗留的旧路径（含旧 FOLDER_NAME）
 * 2. 遍历多工具映射表：
 *    - flatten 工具（trae-cn）：每个 skill 直接复制到 skills/<skill>/，写 manifest
 *    - 非 flatten 工具：skills 全量复制到 skills/FOLDER_NAME/
 * 3. 汇总打印"已安装到 N 个工具"
 *
 * 创建日期：2026-08-17
 * 版本：2.0.0 (拍平支持)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const paths = require('../lib/core/paths');
const {
  FOLDER_NAME,
  TOOL_MAP,
  LEGACY_NAMES,
  getSkillsDir,
  getNestedTargetDir,
  getManifestPath,
  getSkillNames,
  copyDirRecursive,
  removeDir,
} = require('../lib/core/tool-map');

// ── cleanupLegacy ──────────────────────────────────────

function cleanupLegacy() {
  const home = os.homedir();
  for (const tool of TOOL_MAP) {
    const toolConfigDir = path.join(home, tool.dir);
    if (!fs.existsSync(toolConfigDir)) continue;

    const skillsDir = getSkillsDir(tool);
    if (!fs.existsSync(skillsDir)) continue;

    for (const legacy of LEGACY_NAMES) {
      // 非拍平工具：清理旧套壳目录
      const legacyPath = path.join(skillsDir, legacy);
      if (fs.existsSync(legacyPath)) {
        try {
          removeDir(legacyPath);
          console.log(`  [cleanup] 已清理旧版遗留: ${tool.name}/${legacy}`);
        } catch {}
      }
      // 拍平工具：清理旧 manifest
      const oldManifest = path.join(skillsDir, `.${legacy}-manifest.json`);
      if (fs.existsSync(oldManifest)) {
        try { fs.unlinkSync(oldManifest); } catch {}
      }
    }
  }
}

// ── 拍平分发 ──────────────────────────────────────────

/**
 * 拍平分发：每个 skill 直接复制到 skills/<skill>/
 * 含 manifest 管理和碰撞保护
 */
function distributeFlatten(tool, sourceDir) {
  const skillsDir = getSkillsDir(tool);
  const manifestPath = getManifestPath(tool);

  // 1. 读取旧 manifest，删除已不存在的旧目录
  let oldManifest = [];
  if (fs.existsSync(manifestPath)) {
    try {
      oldManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {}
  }

  // 2. 获取当前 skill 列表
  const currentSkills = getSkillNames(sourceDir);

  // 3. 删除 manifest 中已不存在的旧目录
  for (const oldSkill of oldManifest) {
    if (!currentSkills.includes(oldSkill)) {
      const oldDir = path.join(skillsDir, oldSkill);
      if (fs.existsSync(oldDir)) {
        try {
          removeDir(oldDir);
          console.log(`  [flatten:${tool.name}] 清理已移除的 skill: ${oldSkill}`);
        } catch {}
      }
    }
  }

  // 4. 复制当前 skills（碰撞保护：已存在且在 manifest 内则覆盖，不在 manifest 内则跳过）
  let installed = 0;
  let skipped = 0;
  for (const skillName of currentSkills) {
    const srcDir = path.join(sourceDir, skillName);
    const destDir = path.join(skillsDir, skillName);

    if (fs.existsSync(destDir) && !oldManifest.includes(skillName)) {
      // 碰撞：目标已存在但不在 manifest 内 → 跳过
      console.log(`  [flatten:${tool.name}] ⚠️ 碰撞跳过: ${skillName} (非托管目录)`);
      skipped++;
      continue;
    }

    // 覆盖（在 manifest 内 → 安全覆盖）
    if (fs.existsSync(destDir)) {
      removeDir(destDir);
    }
    copyDirRecursive(srcDir, destDir);
    installed++;
  }

  // 5. 写新 manifest
  fs.writeFileSync(manifestPath, JSON.stringify(currentSkills, null, 2), 'utf-8');

  return { installed, skipped };
}

// ── 嵌套分发（非拍平） ───────────────────────────────

function distributeNested(tool, sourceDir) {
  const targetDir = getNestedTargetDir(tool);

  // 覆盖式更新
  if (fs.existsSync(targetDir)) {
    removeDir(targetDir);
  }

  return copyDirRecursive(sourceDir, targetDir);
}

// ── 主逻辑 ─────────────────────────────────────────────

function main() {
  const sourceDir = paths.skillsSource();

  console.log('');
  console.log('[yidaai] postinstall: 分发 skills 到各 AI 工具');
  console.log(`  源目录: ${sourceDir}`);
  console.log('');

  // 1. 清理历史遗留
  cleanupLegacy();

  // 2. 探测式复制
  const home = os.homedir();
  let installed = 0;
  let skipped = 0;

  for (const tool of TOOL_MAP) {
    const toolConfigDir = path.join(home, tool.dir);

    if (!fs.existsSync(toolConfigDir)) {
      skipped++;
      continue;
    }

    const skillsDir = getSkillsDir(tool);
    if (!fs.existsSync(skillsDir)) {
      try {
        fs.mkdirSync(skillsDir, { recursive: true });
      } catch {
        skipped++;
        continue;
      }
    }

    try {
      if (tool.flatten) {
        const result = distributeFlatten(tool, sourceDir);
        console.log(`  ✅ ${tool.name.padEnd(12)} → ~/${tool.dir}/${tool.skillsSub}/ (拍平 ${result.installed} skills, 跳过 ${result.skipped})`);
      } else {
        const ok = distributeNested(tool, sourceDir);
        if (ok) {
          console.log(`  ✅ ${tool.name.padEnd(12)} → ~/${tool.dir}/${tool.skillsSub}/${FOLDER_NAME}/`);
        }
      }
      installed++;
    } catch (err) {
      console.log(`  ❌ ${tool.name.padEnd(12)} ${err.message}`);
      skipped++;
    }
  }

  console.log('');
  console.log(`[yidaai] postinstall 完成: 已安装到 ${installed} 个工具，跳过 ${skipped} 个未安装工具`);
  console.log('');
}

try {
  main();
} catch (err) {
  console.log(`[yidaai] postinstall 警告: ${err.message}`);
  console.log('  skills 分发可稍后通过 yida-helper copy 手动执行');
}

process.exit(0);
