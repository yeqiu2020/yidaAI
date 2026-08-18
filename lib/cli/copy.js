/**
 * lib/cli/copy.js — yida-helper copy 命令实现（拍平支持 + manifest + --force）
 *
 * 无参=全量重分发；--tool 指定单个；--project 刷新项目级；--force 碰撞强制覆盖
 *
 * 创建日期：2026-08-17
 * 版本：2.0.0 (拍平支持)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const paths = require('../core/paths');
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
} = require('../core/tool-map');

// ── 拍平分发 ──────────────────────────────────────────

function distributeFlatten(tool, sourceDir, force) {
  const skillsDir = getSkillsDir(tool);
  const manifestPath = getManifestPath(tool);

  // 1. 读取旧 manifest
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

  // 4. 复制当前 skills
  let installed = 0;
  let skipped = 0;
  for (const skillName of currentSkills) {
    const srcDir = path.join(sourceDir, skillName);
    const destDir = path.join(skillsDir, skillName);

    if (fs.existsSync(destDir) && !oldManifest.includes(skillName)) {
      // 碰撞：目标已存在但不在 manifest 内
      if (!force) {
        console.log(`  [flatten:${tool.name}] ⚠️ 碰撞跳过: ${skillName} (非托管目录，--force 可覆盖)`);
        skipped++;
        continue;
      } else {
        console.log(`  [flatten:${tool.name}] ⚡ --force 覆盖: ${skillName}`);
        removeDir(destDir);
      }
    }

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

  if (fs.existsSync(targetDir)) {
    removeDir(targetDir);
  }

  return copyDirRecursive(sourceDir, targetDir);
}

// ── 项目级分发 ────────────────────────────────────────

function distributeToProject(projectDir) {
  const targetDir = path.join(projectDir, '.agents', 'skills');
  const sourceDir = paths.skillsSource();

  if (!fs.existsSync(sourceDir)) {
    console.error(`  ❌ skills 源目录不存在: ${sourceDir}`);
    return false;
  }

  if (fs.existsSync(targetDir)) {
    removeDir(targetDir);
  }

  return copyDirRecursive(sourceDir, targetDir);
}

// ── 主函数 ─────────────────────────────────────────────

function cmdCopy(args) {
  let toolName = null;
  let projectDir = null;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tool' && args[i + 1]) {
      toolName = args[i + 1];
      i++;
    } else if (args[i] === '--project' && args[i + 1]) {
      projectDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  console.log('');
  console.log('  📦 Skills 分发');
  console.log('');

  // 项目级分发
  if (projectDir) {
    console.log(`  📁 项目级分发到: ${projectDir}`);
    const ok = distributeToProject(projectDir);
    if (ok) {
      console.log('  ✅ .agents/skills/ 已刷新');
    } else {
      console.log('  ❌ 分发失败');
    }
    console.log('');
    return;
  }

  // 全量或指定工具分发
  const tools = toolName ? TOOL_MAP.filter(t => t.name === toolName) : TOOL_MAP;

  if (toolName && tools.length === 0) {
    console.error(`  ❌ 未知工具: ${toolName}`);
    console.error(`  可用工具: ${TOOL_MAP.map(t => t.name).join(', ')}`);
    process.exit(1);
  }

  const sourceDir = paths.skillsSource();
  let installed = 0;
  let skipped = 0;

  for (const tool of tools) {
    const toolConfigDir = path.join(os.homedir(), tool.dir);
    if (!fs.existsSync(toolConfigDir)) {
      console.log(`  ⏭️  ${tool.name.padEnd(12)} (未安装，跳过)`);
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
        const result = distributeFlatten(tool, sourceDir, force);
        console.log(`  ✅ ${tool.name.padEnd(12)} → ~/${tool.dir}/${tool.skillsSub}/ (拍平 ${result.installed} skills${result.skipped > 0 ? ', 跳过 ' + result.skipped : ''})`);
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
  console.log(`  📊 已安装到 ${installed} 个工具，跳过 ${skipped} 个未安装工具`);
  console.log('');
}

module.exports = cmdCopy;
