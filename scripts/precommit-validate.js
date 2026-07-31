const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

/**
 * precommit-validate.js
 * 版本: v1.2.0
 *
 * 硬规则3-4（写入前/写入后必须校验）的确定性触发点。
 * 之前 check-before-write / check-after-write 依赖 AI/人工记得手动执行，
 * 忘跑 = 违规产物照样落盘入库。本脚本把 ai-validator 的校验接到机器触发点：
 *   - git pre-commit 钩子（scripts/git-hooks/pre-commit）→ --staged 模式
 *   - npm run validate:write / CI 步骤 → --all 模式
 *
 * v1.1.0 新增代码门禁（仅 --staged 模式生效）：
 *   暂存变更命中 .agents/**\/*.js、lib/**、scripts/**、tests/** 任一路径时，
 *   追加执行 npm test 与 node scripts/validate-skill-config.js，失败则拦截提交。
 *   纯业务产出物提交（未命中代码路径）行为与旧版完全一致。
 *
 * v1.2.0 逃生口审计留痕：
 *   SKIP_YIDA_VALIDATE=1 必须同时提供 SKIP_YIDA_REASON（跳过原因），缺失则拒绝跳过、
 *   照常执行校验；跳过成功时将时间/原因追加写入 logs/gate-bypass-audit.log。
 *
 * 用法:
 *   node scripts/precommit-validate.js --staged        校验本次 git 暂存区中的业务产出物 + 代码门禁
 *   node scripts/precommit-validate.js --all           扫描整个工作区的业务产出物（业务目录多被 gitignore，CI/手动全量用这个）
 *   node scripts/precommit-validate.js <文件路径...>    校验指定文件
 *
 * 退出码: 0=全部通过, 1=存在违规（触发器应中断提交/流水线）
 * 逃生口: 设置环境变量 SKIP_YIDA_VALIDATE=1 且提供 SKIP_YIDA_REASON=<原因> 可跳过
 *        （仅限用户明确批准的场景，跳过记录写入审计日志）
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const {
  validateAfterWrite,
  validateDuplicateFields,
  validateAssociationFields,
  validateFillTargets,
  validateReadonlyFields,
  validateSerialPrefixes,
  validateFillRuleSyntax
} = require('./ai-validator.js');
const { appendGateBypassAudit } = require('../lib/core/gate-audit.js');

// 工具/文档/缓存目录：其中的 md/json 合法包含 FORM-XXX、TODO 等示例占位符，
// 属于技能源码而非业务产出物，不在硬规则3-4校验范围内
const EXCLUDED_TOP_DIRS = new Set([
  '.agents', '.git', '.idea', '.vscode', '.trae', '.cursor', '.qoder',
  '.codebuddy', '.playwright-cli', '.pytest_cache', '.cache',
  'node_modules', 'scripts', 'lib', 'tests', 'temp-file',
  '本地操作页面', '★宜搭场景案例库', '★宜搭开发参考文档'
]);

/**
 * 判断文件是否属于硬规则3-4管辖的业务产出物：
 *   1. 字段清单/规则清单（AI生成的需求梳理文档）
 *   2. 带序号前缀的提示词/公式/代码文件（如 1.xxx提示词.md、2.xxx.json、3.xxx.js）
 * 仓库根目录的编号指南文档（01环境初始化.md 等）是仓库自身文档，不算业务产出物。
 */
function isBusinessArtifact(relPath) {
  const normalized = relPath.split(path.sep).join('/');
  const segments = normalized.split('/');
  if (EXCLUDED_TOP_DIRS.has(segments[0])) return false;
  // 任意层级出现隐藏目录或 node_modules 都跳过
  if (segments.slice(0, -1).some(s => s.startsWith('.') || s === 'node_modules')) return false;

  const base = segments[segments.length - 1];
  const ext = path.extname(base).toLowerCase();
  if (!['.md', '.json', '.js'].includes(ext)) return false;

  if (base.includes('字段清单') || base.includes('规则清单')) return true;
  // 序号前缀文件只在子目录中算业务产出物（根目录编号文档除外）
  if (segments.length > 1 && /^\d+\./.test(base)) return true;
  return false;
}

// 命中即追加执行代码门禁（npm test + validate-skill-config）的代码路径规则：
// .agents/**/*.js（技能脚本）、lib/**（核心库）、scripts/**（工程脚本）、tests/**（测试）
const CODE_PATH_RULES = [
  rel => rel.startsWith('.agents/') && rel.endsWith('.js'),
  rel => rel.startsWith('lib/'),
  rel => rel.startsWith('scripts/'),
  rel => rel.startsWith('tests/')
];

function isCodeChange(relPath) {
  const normalized = relPath.split(path.sep).join('/');
  return CODE_PATH_RULES.some(rule => rule(normalized));
}

/** 代码门禁：跑单测 + 技能配置校验，任一失败返回 false（拦截提交） */
function runCodeQualityGate() {
  const steps = [
    // npm 在 Windows 上是 npm.cmd，需经 shell 解析
    ['npm test', 'npm', ['test'], true],
    ['node scripts/validate-skill-config.js', process.execPath, [path.join(__dirname, 'validate-skill-config.js')], false]
  ];
  let allPassed = true;
  for (const [label, cmd, cmdArgs, useShell] of steps) {
    console.log(`\n🔧 [代码门禁] ${label} ...`);
    const result = spawnSync(cmd, cmdArgs, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: useShell
    });
    if (result.status !== 0) {
      allPassed = false;
      console.error(`❌ [代码门禁] ${label} 失败（退出码 ${result.status === null ? '进程未启动' : result.status}）`);
    }
  }
  return allPassed;
}

/** 从 git 暂存区取本次提交涉及的文件（-z 避免中文路径被转义） */
function listStagedFiles() {
  const out = execFileSync(
    'git',
    ['-c', 'core.quotepath=off', 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
    { cwd: REPO_ROOT, encoding: 'utf-8' }
  );
  return out.split('\0').filter(Boolean);
}

/** 遍历工作区收集所有业务产出物（--all 模式，覆盖被 gitignore 的业务目录） */
function listAllFiles(dir, relBase, collected) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = relBase ? relBase + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_TOP_DIRS.has(entry.name) || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      listAllFiles(path.join(dir, entry.name), rel, collected);
    } else if (entry.isFile() && isBusinessArtifact(rel)) {
      collected.push(rel);
    }
  }
  return collected;
}

/** 对单个文件执行 check-after-write；字段清单额外执行 check-all 全套校验 */
function validateFile(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  const fileErrors = [];
  const fileWarnings = [];

  const checks = [['check-after-write', validateAfterWrite]];
  if (path.basename(relPath).includes('字段清单')) {
    checks.push(
      ['check-duplicate-fields', validateDuplicateFields],
      ['check-association-fields', validateAssociationFields],
      ['check-fill-targets', validateFillTargets],
      ['check-readonly-fields', validateReadonlyFields],
      ['check-serial-prefixes', validateSerialPrefixes],
      ['check-fill-rule-syntax', validateFillRuleSyntax]
    );
  }

  for (const [name, fn] of checks) {
    try {
      const result = fn(absPath) || {};
      (result.errors || []).forEach(e => fileErrors.push(`[${name}] ${e}`));
      (result.warnings || []).forEach(w => fileWarnings.push(`[${name}] ${w}`));
    } catch (e) {
      fileErrors.push(`[${name}] 校验执行异常: ${e.message}`);
    }
  }

  return { file: relPath, errors: fileErrors, warnings: fileWarnings };
}

function main() {
  if (process.env.SKIP_YIDA_VALIDATE === '1') {
    const skipReason = (process.env.SKIP_YIDA_REASON || '').trim();
    if (!skipReason) {
      console.error('⛔ SKIP_YIDA_VALIDATE=1 但未提供 SKIP_YIDA_REASON（跳过原因），拒绝跳过，继续执行校验。');
      console.error('   跳过用法: SKIP_YIDA_VALIDATE=1 SKIP_YIDA_REASON="<原因>" git commit ...');
    } else {
      const auditPath = appendGateBypassAudit({
        gate: 'SKIP_YIDA_VALIDATE',
        script: 'scripts/precommit-validate.js',
        args: process.argv.slice(2).join(' ') || '--staged',
        reason: skipReason
      });
      console.log(`⚠️  SKIP_YIDA_VALIDATE=1，已跳过硬规则3-4校验（原因: ${skipReason}）`);
      console.log(`   审计留痕已写入: ${path.relative(REPO_ROOT, auditPath)}`);
      return;
    }
  }

  const args = process.argv.slice(2);
  let files;
  let modeLabel;
  let stagedFiles = [];

  if (args.includes('--all')) {
    modeLabel = '全量扫描';
    files = listAllFiles(REPO_ROOT, '', []);
  } else if (args.includes('--staged') || args.length === 0) {
    modeLabel = 'git 暂存区';
    stagedFiles = listStagedFiles();
    files = stagedFiles.filter(isBusinessArtifact);
  } else {
    modeLabel = '指定文件';
    files = args.map(f => path.relative(REPO_ROOT, path.resolve(REPO_ROOT, f)));
  }

  // 代码门禁只在暂存区模式（即 pre-commit 钩子链路）触发
  const codeGateNeeded = stagedFiles.some(isCodeChange);

  if (files.length === 0 && !codeGateNeeded) {
    console.log(`✅ [${modeLabel}] 未发现需要校验的业务产出物（字段清单/规则清单/序号提示词文件），直接放行`);
    return;
  }

  if (files.length === 0) {
    console.log(`✅ [${modeLabel}] 未发现需要校验的业务产出物（字段清单/规则清单/序号提示词文件）`);
  } else {
    console.log(`🔍 [${modeLabel}] 对 ${files.length} 个业务产出物执行 ai-validator 硬规则3-4校验...`);
    let failedCount = 0;

    for (const relPath of files) {
      const result = validateFile(relPath);
      if (result.errors.length > 0) {
        failedCount++;
        console.error(`\n❌ ${relPath}`);
        result.errors.forEach(e => console.error(`   ${e}`));
      } else {
        console.log(`✅ ${relPath}`);
      }
    }

    if (failedCount > 0) {
      console.error(`\n⛔ 校验失败：${failedCount}/${files.length} 个文件违反硬规则3-4，已拦截。`);
      console.error('   请修复上述错误后重试；单文件排查可运行:');
      console.error('   node scripts/ai-validator.js check-after-write <文件路径>');
      process.exitCode = 1;
    } else {
      console.log(`\n✅ 全部通过（${files.length} 个文件）`);
    }
  }

  if (codeGateNeeded) {
    console.log('\n🚧 暂存变更命中代码路径（.agents/**/*.js、lib/**、scripts/**、tests/**），追加执行代码门禁');
    if (!runCodeQualityGate()) {
      console.error('\n⛔ 代码门禁未通过，已拦截提交。修复后重试，或经用户明确批准后使用 SKIP_YIDA_VALIDATE=1 并提供 SKIP_YIDA_REASON=<原因> 跳过。');
      process.exitCode = 1;
    } else {
      console.log('\n✅ 代码门禁通过（npm test + validate-skill-config）');
    }
  }
}

main();
