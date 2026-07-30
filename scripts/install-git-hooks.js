const fs = require('fs');
const path = require('path');

/**
 * install-git-hooks.js
 * 版本: v1.0.0
 *
 * 把 scripts/git-hooks/ 下的版本化钩子安装到 .git/hooks/，
 * 使硬规则3-4的校验（precommit-validate.js）在每次 git commit 时自动触发。
 *
 * 触发方式:
 *   - npm install 时经 package.json 的 prepare 脚本自动执行
 *   - 手动执行: npm run hooks:install
 *
 * 安全策略:
 *   - 非 git 仓库（无 .git 目录）时静默跳过，不报错
 *   - 已存在非本工具安装的钩子时，先备份为 <hook>.backup 再覆盖，并提示
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const HOOKS_SRC_DIR = path.join(__dirname, 'git-hooks');
const GIT_HOOKS_DIR = path.join(REPO_ROOT, '.git', 'hooks');
const MARKER = 'yida-hard-rules';

function main() {
  if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) {
    console.log('ℹ️  未检测到 .git 目录，跳过 git 钩子安装');
    return;
  }
  if (!fs.existsSync(HOOKS_SRC_DIR)) {
    console.error(`❌ 钩子源目录不存在: ${HOOKS_SRC_DIR}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(GIT_HOOKS_DIR, { recursive: true });

  const hookNames = fs.readdirSync(HOOKS_SRC_DIR).filter(f => !f.includes('.'));
  for (const hookName of hookNames) {
    const srcPath = path.join(HOOKS_SRC_DIR, hookName);
    const destPath = path.join(GIT_HOOKS_DIR, hookName);
    const srcContent = fs.readFileSync(srcPath, 'utf-8');

    if (fs.existsSync(destPath)) {
      const existing = fs.readFileSync(destPath, 'utf-8');
      if (existing === srcContent) {
        console.log(`✅ ${hookName} 钩子已是最新，无需安装`);
        continue;
      }
      if (!existing.includes(MARKER)) {
        // 不是本工具装的钩子，先备份避免覆盖用户自有钩子
        const backupPath = destPath + '.backup';
        fs.copyFileSync(destPath, backupPath);
        console.log(`⚠️  检测到已有 ${hookName} 钩子（非本工具安装），已备份到 ${path.relative(REPO_ROOT, backupPath)}`);
      }
    }

    fs.writeFileSync(destPath, srcContent, { encoding: 'utf-8' });
    // Windows 上 chmod 是空操作，但在 Git Bash/WSL 环境需要可执行位
    try { fs.chmodSync(destPath, 0o755); } catch (e) { /* ignore */ }
    console.log(`✅ 已安装 ${hookName} 钩子 → ${path.relative(REPO_ROOT, destPath)}`);
  }
}

main();
