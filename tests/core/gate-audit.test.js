'use strict';

/**
 * gate-audit.test.js
 *
 * 门禁旁路审计留痕测试：
 *   1. appendGateBypassAudit 单元测试（JSON Lines 追加、自动建目录、时间戳）
 *   2. precommit-validate.js 逃生口行为集成测试（spawn 真实脚本）：
 *      - SKIP_YIDA_VALIDATE=1 但缺 SKIP_YIDA_REASON → 拒绝跳过，照常校验
 *      - 提供原因 → 跳过并写入审计日志
 *
 * 集成测试通过 YIDA_GATE_AUDIT_LOG 环境变量把日志重定向到临时目录，
 * 避免污染仓库真实的 logs/gate-bypass-audit.log。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { appendGateBypassAudit, AUDIT_LOG_PATH } = require('../../lib/core/gate-audit');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PRECOMMIT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'precommit-validate.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-audit-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('appendGateBypassAudit 单元测试', () => {
  test('默认日志路径指向仓库 logs/gate-bypass-audit.log', () => {
    expect(AUDIT_LOG_PATH).toBe(path.join(REPO_ROOT, 'logs', 'gate-bypass-audit.log'));
  });

  test('写入一条含时间戳的 JSON Lines 记录并自动创建目录', () => {
    const logPath = path.join(tmpDir, 'sub', 'audit.log');
    const returned = appendGateBypassAudit({ gate: 'TEST_GATE', reason: '单元测试' }, logPath);

    expect(returned).toBe(logPath);
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.gate).toBe('TEST_GATE');
    expect(record.reason).toBe('单元测试');
    expect(new Date(record.time).toString()).not.toBe('Invalid Date');
  });

  test('多次调用追加多条记录', () => {
    const logPath = path.join(tmpDir, 'audit.log');
    appendGateBypassAudit({ gate: 'G1', reason: 'r1' }, logPath);
    appendGateBypassAudit({ gate: 'G2', reason: 'r2', processCode: 'PC-1' }, logPath);

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).processCode).toBe('PC-1');
  });
});

describe('precommit-validate.js 逃生口集成测试', () => {
  /** spawn 真实脚本，指定文件模式避免触碰 git 暂存区/代码门禁（防 npm test 递归） */
  function runPrecommit(env, fileArg) {
    return spawnSync(process.execPath, [PRECOMMIT_SCRIPT, fileArg], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: Object.assign({}, process.env, env)
    });
  }

  test('SKIP_YIDA_VALIDATE=1 但未提供 SKIP_YIDA_REASON 时拒绝跳过、照常校验', () => {
    const auditLog = path.join(tmpDir, 'audit.log');
    const sampleFile = path.join(tmpDir, '正常文档.md');
    fs.writeFileSync(sampleFile, '# 审计测试\n正常内容，无占位符。\n', 'utf-8');

    const result = runPrecommit({
      SKIP_YIDA_VALIDATE: '1',
      SKIP_YIDA_REASON: '',
      YIDA_GATE_AUDIT_LOG: auditLog
    }, sampleFile);

    expect(result.stderr).toContain('拒绝跳过');
    expect(result.stdout).not.toContain('已跳过硬规则3-4校验');
    // 校验流程照常执行（进入"指定文件"模式）
    expect(result.stdout).toContain('指定文件');
    // 未发生跳过，不产生审计记录
    expect(fs.existsSync(auditLog)).toBe(false);
  });

  test('提供 SKIP_YIDA_REASON 后跳过校验并新增一条审计记录', () => {
    const auditLog = path.join(tmpDir, 'audit.log');

    const result = runPrecommit({
      SKIP_YIDA_VALIDATE: '1',
      SKIP_YIDA_REASON: '单元测试演练',
      YIDA_GATE_AUDIT_LOG: auditLog
    }, path.join(tmpDir, '不存在也无所谓.md'));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('已跳过硬规则3-4校验');
    expect(result.stdout).toContain('单元测试演练');

    const lines = fs.readFileSync(auditLog, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.gate).toBe('SKIP_YIDA_VALIDATE');
    expect(record.reason).toBe('单元测试演练');
    expect(new Date(record.time).toString()).not.toBe('Invalid Date');
  });
});
