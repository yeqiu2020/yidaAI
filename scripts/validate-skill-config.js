#!/usr/bin/env node
/**
 * validate-skill-config.js — skill-config.json 与 .agents/skills 目录一致性校验
 *
 * 校验规则：
 *   1. .agents/skills/ 下每个含 SKILL.md 的目录必须在 skills 数组中登记，
 *      或在 exemptedSkills 中显式豁免（带理由）；两者互斥，都没有则报错（反向校验）
 *   2. skills 数组中每个条目的 path 必须指向真实存在的技能目录（含 SKILL.md）
 *   3. 条目 name 必须与 path 目录名一致，且不允许重复登记
 *   4. exemptedSkills 条目必须有 name 和非空 reason，且不得与 skills 登记冲突
 *
 * 豁免清单的唯一事实源是 skill-config.json 的 exemptedSkills 字段（不再硬编码），
 * scripts/generate-skill-index.js 的 NON_EFFECTIVE_DIRS 须与其保持一致。
 *
 * 双源维护约定（见 skill-config.json 的 _dualSource_comment）：
 *   SKILL.md frontmatter description 是运行时权威面，skill-config.json 的
 *   skills[].description 是索引面；两者描述必须同步修改，只改一侧即为漂移。
 *
 * 用法:
 *   node scripts/validate-skill-config.js    # 一致则退出码 0；不一致则打印差异并退出码 1
 *
 * 创建日期: 2026-07-30（修复 skill-config.json 与目录漂移问题时引入）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.agents', 'skills');
const SKILL_CONFIG_PATH = path.join(SKILLS_DIR, 'skill-config.json');

function main() {
  const errors = [];

  // 1. 扫描目录：所有含 SKILL.md 的目录（不预先排除，豁免交给配置中的 exemptedSkills 判定）
  const skillMdDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')))
    .sort();

  // 2. 读取配置
  let config;
  try {
    config = JSON.parse(fs.readFileSync(SKILL_CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error(`❌ 无法读取或解析 ${SKILL_CONFIG_PATH}: ${e.message}`);
    process.exit(1);
  }
  const skills = Array.isArray(config.skills) ? config.skills : [];

  // 3. 豁免清单合法性：每条必须有 name 和非空 reason
  const exempted = Array.isArray(config.exemptedSkills) ? config.exemptedSkills : [];
  const exemptedNames = new Set();
  for (const e of exempted) {
    if (!e || typeof e.name !== 'string' || !e.name.trim()) {
      errors.push(`exemptedSkills 存在缺少 name 的条目: ${JSON.stringify(e)}`);
      continue;
    }
    if (typeof e.reason !== 'string' || !e.reason.trim()) {
      errors.push(`豁免条目 "${e.name}" 缺少豁免理由 reason（豁免必须显式标注理由）`);
    }
    if (exemptedNames.has(e.name)) {
      errors.push(`豁免条目 "${e.name}" 重复`);
    }
    exemptedNames.add(e.name);
  }

  // 4. 条目自身合法性：path 存在、name 与目录名一致、无重复、不与豁免清单冲突
  const configuredDirs = new Set();
  for (const s of skills) {
    const dirName = path.basename(String(s.path || ''));
    if (!dirName) {
      errors.push(`条目 "${s.name}" 缺少 path`);
      continue;
    }
    if (s.name !== dirName) {
      errors.push(`条目 name "${s.name}" 与 path 目录名 "${dirName}" 不一致`);
    }
    if (configuredDirs.has(dirName)) {
      errors.push(`条目 "${dirName}" 重复登记`);
    }
    configuredDirs.add(dirName);
    if (exemptedNames.has(dirName)) {
      errors.push(`条目 "${dirName}" 同时出现在 skills 登记与 exemptedSkills 豁免清单中（两者互斥，请二选一）`);
    }
    if (!fs.existsSync(path.join(SKILLS_DIR, dirName, 'SKILL.md'))) {
      errors.push(`条目 "${dirName}" 指向的目录不存在或缺少 SKILL.md（应从 skills 数组移除）`);
    }
  }

  // 5. 反向校验：含 SKILL.md 的目录必须已登记或已豁免，否则报错
  const missing = skillMdDirs.filter((d) => !configuredDirs.has(d) && !exemptedNames.has(d));
  for (const d of missing) {
    errors.push(`目录 ".agents/skills/${d}" 含 SKILL.md 但未在 skills 数组登记，也未在 exemptedSkills 中豁免（应补登记或标注豁免理由）`);
  }

  if (errors.length > 0) {
    console.error(`❌ skill-config.json 与 .agents/skills 目录不一致，共 ${errors.length} 处：`);
    for (const e of errors) {
      console.error(`   - ${e}`);
    }
    process.exit(1);
  }

  const exemptedWithSkillMd = skillMdDirs.filter((d) => exemptedNames.has(d)).length;
  console.log(
    `✅ 校验通过：skills 登记 ${skills.length} 条 + 豁免 ${exemptedWithSkillMd} 条 = 含 SKILL.md 目录 ${skillMdDirs.length} 个，全部覆盖`
  );
}
main();
