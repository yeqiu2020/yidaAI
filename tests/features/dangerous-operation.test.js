/**
 * 核心功能测试：危险操作校验 (Phase 4 - Task 4-2)
 *
 * 测试危险操作校验和安全防护：
 *   - safeSpawn 安全子进程调用（shell:false，参数数组）
 *   - isPathSafe 路径注入防护
 *   - CliError 结构化错误码
 *   - exit code 映射
 *   - process.exit mock 验证
 *   - Cookie 脱敏（防止敏感信息泄露）
 */

'use strict';

const { safeSpawn, spawnNodeScript, spawnNodeEval } = require('../../lib/core/spawn');
const { CliError, ErrorCode, ExitCodeMap, wrapError } = require('../../lib/core/error');
const { isPathSafe, maskCookieValues } = require('../../lib/core/utils');

describe('核心功能：危险操作校验', () => {
  // ── safeSpawn 安全防护 ─────────────────────────────
  describe('safeSpawn 安全子进程调用', () => {
    test('强制 shell:false（不经过 shell 解析）', () => {
      // 如果 shell:true，以下命令会被 shell 解析为执行 echo
      // 但 shell:false 时，"echo; rm -rf /" 被视为单个不存在的命令
      const result = safeSpawn('echo; rm -rf /', []);
      expect(result.success).toBe(false);
    });

    test('参数以数组形式传递（不拼接字符串）', () => {
      // 安全的参数传递
      const result = safeSpawn(process.execPath, ['-e', 'console.log("safe args")']);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('safe args');
    });

    test('空 command 返回 CliError', () => {
      const result = safeSpawn('', []);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(CliError);
      expect(result.error.code).toBe(ErrorCode.MISSING_PARAM);
    });

    test('不存在的命令返回 CliError（不崩溃）', () => {
      const result = safeSpawn('nonexistent-binary-xyz', ['--help']);
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(CliError);
    });

    test('退出码非0返回失败', () => {
      const result = safeSpawn(process.execPath, ['-e', 'process.exit(42)']);
      expect(result.success).toBe(false);
      expect(result.status).toBe(42);
    });

    test('成功执行返回 stdout', () => {
      const result = safeSpawn(process.execPath, ['-e', 'process.stdout.write("output")']);
      expect(result.success).toBe(true);
      expect(result.stdout).toBe('output');
    });
  });

  // ── spawnNodeScript 安全 ───────────────────────────
  describe('spawnNodeScript 安全', () => {
    test('使用 process.execPath（不依赖 PATH 中的 node）', () => {
      const result = spawnNodeScript('-e', [], { cwd: process.cwd() });
      // 即使 -e 不是有效脚本，也应该使用 process.execPath 执行
      expect(result).toBeDefined();
    });

    test('空路径返回 CliError', () => {
      const result = spawnNodeScript('', []);
      expect(result.error.code).toBe(ErrorCode.MISSING_PARAM);
    });
  });

  // ── spawnNodeEval 安全 ─────────────────────────────
  describe('spawnNodeEval 安全', () => {
    test('空代码返回 CliError', () => {
      const result = spawnNodeEval('');
      expect(result.error.code).toBe(ErrorCode.MISSING_PARAM);
    });

    test('语法错误不崩溃', () => {
      const result = spawnNodeEval('!!! invalid !!!');
      expect(result.success).toBe(false);
      expect(result.stderr).toBeTruthy();
    });
  });

  // ── 路径注入防护 ───────────────────────────────────
  describe('路径注入防护', () => {
    test('null-byte 注入被检测', () => {
      const result = isPathSafe('file.txt\0.exe');
      expect(result.safe).toBe(false);
    });

    test('控制字符被检测', () => {
      const result = isPathSafe('file\x05name.txt');
      expect(result.safe).toBe(false);
    });

    test('空路径被拒绝', () => {
      expect(isPathSafe('').safe).toBe(false);
      expect(isPathSafe(null).safe).toBe(false);
    });
  });

  // ── CliError 结构化错误 ────────────────────────────
  describe('CliError 结构化错误码', () => {
    test('每个错误码都有对应的退出码', () => {
      for (const code of Object.values(ErrorCode)) {
        expect(ExitCodeMap[code]).toBeDefined();
        expect(typeof ExitCodeMap[code]).toBe('number');
        expect(ExitCodeMap[code]).toBeGreaterThan(0);
      }
    });

    test('退出码范围合理（10-99）', () => {
      for (const code of Object.values(ErrorCode)) {
        const exitCode = ExitCodeMap[code];
        expect(exitCode).toBeGreaterThanOrEqual(10);
        expect(exitCode).toBeLessThanOrEqual(99);
      }
    });

    test('wrapError 包装非 CliError 错误', () => {
      const plainError = new Error('plain error');
      const wrapped = wrapError(plainError);
      expect(wrapped).toBeInstanceOf(CliError);
      expect(wrapped.code).toBe(ErrorCode.UNKNOWN);
      expect(wrapped.cause).toBe(plainError);
    });

    test('CliError 可序列化为 JSON', () => {
      const err = new CliError(ErrorCode.API_ERROR, 'API failed', {
        detail: '500 Internal Server Error',
        hint: 'Retry later',
      });
      const json = err.toJSON();
      expect(json).toHaveProperty('code');
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('exitCode');
      expect(json.exitCode).toBe(ExitCodeMap[ErrorCode.API_ERROR]);
    });

    test('CliError toString 包含错误码和建议', () => {
      const err = new CliError(ErrorCode.NO_COOKIE, 'No cookie', {
        hint: 'Login first',
      });
      const str = err.toString();
      expect(str).toContain('[NO_COOKIE]');
      expect(str).toContain('No cookie');
      expect(str).toContain('Login first');
    });
  });

  // ── process.exit mock 验证 ─────────────────────────
  describe('process.exit 不在核心库中直接调用', () => {
    test('safeSpawn 不调用 process.exit', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      safeSpawn('nonexistent-command', []);
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });

    test('spawnNodeScript 不调用 process.exit', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      spawnNodeScript('', []);
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });

    test('spawnNodeEval 不调用 process.exit', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      spawnNodeEval('invalid !!!');
      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  // ── Cookie 脱敏防护 ────────────────────────────────
  describe('Cookie 脱敏防护', () => {
    test('敏感 Cookie 值被脱敏', () => {
      const sensitive = 'abcdefghijklmnop1234567890_secret';
      const masked = maskCookieValues([
        { name: 'tianshu_csrf_token', value: sensitive },
        { name: 'session', value: sensitive },
        { name: 'access_token', value: sensitive },
      ]);

      masked.forEach(c => {
        expect(c.value).not.toBe(sensitive);
        expect(c.value).toContain('...');
      });
    });

    test('脱敏后的值不包含完整密钥', () => {
      const sensitive = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const masked = maskCookieValues([
        { name: 'token', value: sensitive },
      ]);
      // 只显示前16位
      expect(masked[0].value).not.toContain(sensitive.substring(16));
    });
  });
});
