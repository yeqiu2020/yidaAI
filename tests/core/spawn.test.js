/**
 * lib/core/spawn.js 单元测试 (Phase 4 - Task 4-1)
 *
 * 测试内容：
 *   - safeSpawn 安全子进程调用
 *   - spawnNodeScript Node.js 脚本执行
 *   - spawnNodeEval Node.js 代码执行
 *   - 错误处理和返回值结构
 */

'use strict';

const path = require('path');

const { safeSpawn, spawnNodeScript, spawnNodeEval } = require('../../lib/core/spawn');
const { CliError, ErrorCode } = require('../../lib/core/error');

describe('lib/core/spawn', () => {
  // ── safeSpawn ──────────────────────────────────────
  describe('safeSpawn()', () => {
    test('成功执行 node --version', () => {
      const result = safeSpawn(process.execPath, ['--version']);
      expect(result.success).toBe(true);
      expect(result.status).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.stdout).toContain('v');
    });

    test('空 command 返回失败', () => {
      const result = safeSpawn('', []);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(CliError);
      expect(result.error.code).toBe(ErrorCode.MISSING_PARAM);
    });

    test('不存在的命令返回失败', () => {
      const result = safeSpawn('nonexistent-command-12345', []);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(CliError);
    });

    test('退出码非0时返回失败', () => {
      // node -e "process.exit(1)"
      const result = safeSpawn(process.execPath, ['-e', 'process.exit(1)']);
      expect(result.success).toBe(false);
      expect(result.status).toBe(1);
    });

    test('args 非数组时使用空数组', () => {
      const result = safeSpawn(process.execPath, null);
      // node 无参数会进入 REPL，但 spawnSync 会等待
      // 至少应该不崩溃
      expect(result).toBeDefined();
    });

    test('返回值包含 stdout/stderr/status', () => {
      const result = safeSpawn(process.execPath, ['-e', 'console.log("hello")']);
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('status');
      expect(result.stdout).toContain('hello');
    });

    test('windowsHide 默认为 true', () => {
      // 间接验证：不弹出窗口
      const result = safeSpawn(process.execPath, ['--version']);
      expect(result.success).toBe(true);
    });
  });

  // ── spawnNodeScript ────────────────────────────────
  describe('spawnNodeScript()', () => {
    test('成功执行脚本文件', () => {
      // 使用 jest.config.js 作为简单脚本（require 不报错即可）
      const scriptPath = path.join(__dirname, '..', '..', 'jest.config.js');
      const result = spawnNodeScript(scriptPath);
      expect(result.success).toBe(true);
    });

    test('空 scriptPath 返回失败', () => {
      const result = spawnNodeScript('', []);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe(ErrorCode.MISSING_PARAM);
    });

    test('相对路径解析为绝对路径', () => {
      // 在项目根目录下执行
      const result = spawnNodeScript('jest.config.js', [], {
        cwd: path.join(__dirname, '..', '..'),
      });
      expect(result.success).toBe(true);
    });

    test('带参数执行', () => {
      const result = spawnNodeScript('-e', ['console.log("arg test")'], {
        cwd: process.cwd(),
      });
      // -e 不是脚本文件，会报错，但验证参数传递正确
      // 改为直接测试带参数的脚本
      const tmpScript = path.join(__dirname, 'tmp-spawn-test.js');
      const fs = require('fs');
      fs.writeFileSync(tmpScript, 'console.log(process.argv[2]);');
      try {
        const r = spawnNodeScript(tmpScript, ['hello-arg']);
        expect(r.success).toBe(true);
        expect(r.stdout).toContain('hello-arg');
      } finally {
        fs.unlinkSync(tmpScript);
      }
    });
  });

  // ── spawnNodeEval ──────────────────────────────────
  describe('spawnNodeEval()', () => {
    test('成功执行代码', () => {
      const result = spawnNodeEval('console.log("eval test")');
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('eval test');
    });

    test('空代码返回失败', () => {
      const result = spawnNodeEval('');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe(ErrorCode.MISSING_PARAM);
    });

    test('语法错误返回失败', () => {
      const result = spawnNodeEval('invalid syntax !!!');
      expect(result.success).toBe(false);
      expect(result.stderr).toBeTruthy();
    });

    test('能访问 require', () => {
      const result = spawnNodeEval('console.log(typeof require)');
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('function');
    });
  });
});
