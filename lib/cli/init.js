/**
 * lib/cli/init.js — yida-helper init 命令实现
 *
 * 在目标目录生成项目骨架：
 *   - 从 templates/ 复制 01/02/03 文档、组织及应用信息.md、.trae/rules/、本地操作页面
 *   - 占位符 {{PROJECT_NAME}} 替换为目录名
 *   - --with-skills 时复制 skills/ 到 .agents/skills/
 *   - 生成 .gitignore
 *
 * 创建日期：2026-08-17 (阶段三)
 * 版本：1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../core/paths');

// ── 辅助函数 ───────────────────────────────────────────

/**
 * 递归复制目录
 * @param {string} src - 源目录
 * @param {string} dest - 目标目录
 * @param {(content: string) => string} [transform] - 文件内容转换函数
 */
function copyDirRecursive(src, dest, transform) {
  if (!fs.existsSync(src)) return;

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, transform);
    } else if (entry.isFile()) {
      let content = fs.readFileSync(srcPath);
      // 只对文本文件做占位符替换
      if (transform && isTextFile(entry.name)) {
        content = Buffer.from(transform(content.toString('utf-8')), 'utf-8');
      }
      fs.writeFileSync(destPath, content);
    }
  }
}

/**
 * 判断是否是文本文件（需要做占位符替换）
 */
function isTextFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ['.md', '.json', '.js', '.css', '.html', '.yml', '.yaml', '.txt', '.gitignore', ''].includes(ext);
}

/**
 * 替换模板中的占位符
 * @param {string} content - 文件内容
 * @param {object} vars - 占位符键值对
 * @returns {string}
 */
function renderTemplate(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, value);
  }
  return result;
}

// ── .gitignore 内容 ────────────────────────────────────

const GITIGNORE_CONTENT = `# 宜搭AI助手 项目数据（不应提交到 git）
.cookies.json
.cache/
temp-file/
组织及应用信息.md
*.log
node_modules/
`;

// ── 主函数 ─────────────────────────────────────────────

/**
 * init 命令
 * @param {string[]} args - 命令行参数
 */
function cmdInit(args) {
  // 解析参数
  let targetDir = process.cwd();
  let withSkills = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-dir' && args[i + 1]) {
      targetDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--with-skills') {
      withSkills = true;
    }
  }

  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const projectName = path.basename(targetDir);
  const templatesDir = paths.packageRoot() + path.sep + 'templates';

  console.log('');
  console.log('  🚀 正在初始化项目...');
  console.log(`  📁 目标目录: ${targetDir}`);
  console.log(`  📋 项目名称: ${projectName}`);
  console.log('');

  // 模板变量
  const templateVars = {
    PROJECT_NAME: projectName,
    YIDA_URL: 'https://www.aliwork.com',
  };

  // 1. 复制模板文件（占位符替换）
  const templateFiles = [
    '01环境初始化.md',
    '02应用初始化.md',
    '03常用提示词.md',
    '组织及应用信息.md',
  ];

  for (const file of templateFiles) {
    const src = path.join(templatesDir, file);
    if (fs.existsSync(src)) {
      const content = fs.readFileSync(src, 'utf-8');
      const rendered = renderTemplate(content, templateVars);
      const dest = path.join(targetDir, file);
      fs.writeFileSync(dest, rendered, 'utf-8');
      console.log(`  ✅ ${file}`);
    }
  }

  // 2. 复制 .trae/rules/ 目录
  const traeRulesSrc = path.join(templatesDir, 'trae-rules');
  const traeRulesDest = path.join(targetDir, '.trae', 'rules');
  if (fs.existsSync(traeRulesSrc)) {
    copyDirRecursive(traeRulesSrc, traeRulesDest, (content) => renderTemplate(content, templateVars));
    console.log('  ✅ .trae/rules/');
  }

  // 3. 复制本地操作页面
  const localPageSrc = path.join(templatesDir, 'local-page');
  const localPageDest = path.join(targetDir, '本地操作页面');
  if (fs.existsSync(localPageSrc)) {
    copyDirRecursive(localPageSrc, localPageDest, (content) => renderTemplate(content, templateVars));
    console.log('  ✅ 本地操作页面/');
  }

  // 4. 生成 .gitignore
  const gitignorePath = path.join(targetDir, '.gitignore');
  fs.writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8');
  console.log('  ✅ .gitignore');

  // 5. 可选：复制 skills
  if (withSkills) {
    const skillsSrc = paths.skillsSource();
    const skillsDest = path.join(targetDir, '.agents', 'skills');
    if (fs.existsSync(skillsSrc)) {
      copyDirRecursive(skillsSrc, skillsDest);
      console.log('  ✅ .agents/skills/ (项目级兜底)');
    } else {
      console.log('  ⚠️  skills 源目录不存在，跳过');
    }
  }

  console.log('');
  console.log('  🎉 初始化完成！');
  console.log('');
  console.log('  下一步：');
  console.log('    yida-helper login    # 登录宜搭');
  console.log('    yida-helper start    # 启动本地服务');
  console.log('');
}

module.exports = cmdInit;
