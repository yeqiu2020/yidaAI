/**
 * lib/core/chalk.js 单元测试 (Phase 4 - Task 4-1)
 *
 * 测试内容：
 *   - ANSI 颜色常量正确性
 *   - 图标常量正确性
 *   - 分隔线生成
 *   - banner/step/label/success/fail/warn/info/hint 输出
 *   - YIDA_QUIET 静默模式
 *   - spinner 动画
 *   - table 渲染
 *   - error 函数（含 process.exit mock）
 *   - usage 提示
 *   - result 摘要
 */

'use strict';

const chalk = require('../../lib/core/chalk');

describe('lib/core/chalk', () => {
  // ── ANSI 颜色常量 ──────────────────────────────────
  describe('颜色常量 c', () => {
    test('应包含 reset 和基本颜色', () => {
      expect(chalk.c.reset).toBe('\x1b[0m');
      expect(chalk.c.red).toBe('\x1b[31m');
      expect(chalk.c.green).toBe('\x1b[32m');
      expect(chalk.c.blue).toBe('\x1b[34m');
    });

    test('应包含样式修饰符', () => {
      expect(chalk.c.bold).toBe('\x1b[1m');
      expect(chalk.c.dim).toBe('\x1b[2m');
      expect(chalk.c.italic).toBe('\x1b[3m');
      expect(chalk.c.underline).toBe('\x1b[4m');
    });
  });

  // ── 图标常量 ──────────────────────────────────────
  describe('图标常量 icon', () => {
    test('success 图标包含绿色和勾', () => {
      expect(chalk.icon.success).toContain(chalk.c.green);
      expect(chalk.icon.success).toContain('✔');
    });

    test('fail 图标包含红色和叉', () => {
      expect(chalk.icon.fail).toContain(chalk.c.red);
      expect(chalk.icon.fail).toContain('✖');
    });

    test('emoji 图标不含 ANSI 码', () => {
      expect(chalk.icon.rocket).toBe('🚀');
      expect(chalk.icon.package).toBe('📦');
      expect(chalk.icon.gear).toBe('⚙️');
    });
  });

  // ── 分隔线 sep ─────────────────────────────────────
  describe('sep()', () => {
    test('默认宽度 60', () => {
      const result = chalk.sep();
      // 去除 ANSI 码后的实际字符
      const plain = result.replace(/\x1b\[\d+m/g, '');
      expect(plain.length).toBe(60);
      expect(plain).toBe('─'.repeat(60));
    });

    test('自定义宽度', () => {
      const result = chalk.sep(30);
      const plain = result.replace(/\x1b\[\d+m/g, '');
      expect(plain.length).toBe(30);
    });

    test('包含 dim 颜色码', () => {
      expect(chalk.sep()).toContain(chalk.c.dim);
      expect(chalk.sep()).toContain(chalk.c.reset);
    });
  });

  // ── banner ─────────────────────────────────────────
  describe('banner()', () => {
    test('输出标题到 stderr', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.banner('Test Title');
      const calls = writeSpy.mock.calls.map(c => c[0]);
      const combined = calls.join('');
      expect(combined).toContain('Test Title');
      expect(combined).toContain(chalk.c.bold);
      expect(combined).toContain(chalk.c.cyan);
      writeSpy.mockRestore();
    });

    test('带副标题', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.banner('Title', { subtitle: 'Subtitle' });
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Subtitle');
      writeSpy.mockRestore();
    });

    test('YIDA_QUIET=1 时不输出', () => {
      process.env.YIDA_QUIET = '1';
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.banner('Quiet Title');
      expect(writeSpy).not.toHaveBeenCalled();
      writeSpy.mockRestore();
      delete process.env.YIDA_QUIET;
    });
  });

  // ── step ───────────────────────────────────────────
  describe('step()', () => {
    test('输出步骤编号和消息', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.step(1, 'First step');
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('[1]');
      expect(combined).toContain('First step');
      writeSpy.mockRestore();
    });
  });

  // ── label ──────────────────────────────────────────
  describe('label()', () => {
    test('输出标签值对', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.label('地址', 'https://example.com');
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('地址');
      expect(combined).toContain('https://example.com');
      writeSpy.mockRestore();
    });
  });

  // ── success/fail/warn/info/hint ─────────────────────
  describe('success()', () => {
    test('输出成功消息', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.success('Done');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Done'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✔'));
      logSpy.mockRestore();
    });
  });

  describe('fail()', () => {
    test('输出失败消息', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.fail('Error occurred');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Error occurred'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✖'));
      logSpy.mockRestore();
    });

    test('YIDA_QUIET 模式下仍输出到 stderr（无装饰）', () => {
      process.env.YIDA_QUIET = '1';
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.fail('Quiet Error');
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Quiet Error');
      expect(combined).not.toContain('✖');
      writeSpy.mockRestore();
      delete process.env.YIDA_QUIET;
    });
  });

  describe('warn()', () => {
    test('输出警告消息', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.warn('Warning');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Warning'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('⚠'));
      logSpy.mockRestore();
    });
  });

  describe('info()', () => {
    test('输出信息消息', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.info('Info message');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Info message'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ℹ'));
      logSpy.mockRestore();
    });
  });

  describe('hint()', () => {
    test('输出暗淡提示', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.hint('Hint text');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Hint text'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(chalk.c.dim));
      logSpy.mockRestore();
    });
  });

  // ── spinner ────────────────────────────────────────
  describe('spinner()', () => {
    test('返回 succeed/fail/update 方法', () => {
      const sp = chalk.spinner('Loading...');
      expect(typeof sp.succeed).toBe('function');
      expect(typeof sp.fail).toBe('function');
      expect(typeof sp.update).toBe('function');
    });

    test('succeed 输出成功消息', () => {
      const sp = chalk.spinner('Loading...');
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      sp.succeed('Done');
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Done');
      writeSpy.mockRestore();
    });

    test('YIDA_QUIET 模式下返回 no-op', () => {
      process.env.YIDA_QUIET = '1';
      const sp = chalk.spinner('Loading...');
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      sp.succeed('Done');
      expect(writeSpy).not.toHaveBeenCalled();
      writeSpy.mockRestore();
      delete process.env.YIDA_QUIET;
    });
  });

  // ── table ──────────────────────────────────────────
  describe('table()', () => {
    test('渲染键值对表格', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.table([['名称', '测试'], ['版本', '1.0']]);
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('名称');
      expect(combined).toContain('测试');
      expect(combined).toContain('版本');
      expect(combined).toContain('1.0');
      writeSpy.mockRestore();
    });
  });

  // ── commandGroup ───────────────────────────────────
  describe('commandGroup()', () => {
    test('渲染命令分组', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      chalk.commandGroup('Commands', [['list', '列出'], ['create', '创建']]);
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Commands');
      expect(combined).toContain('list');
      expect(combined).toContain('创建');
      writeSpy.mockRestore();
    });
  });

  // ── listItem ───────────────────────────────────────
  describe('listItem()', () => {
    test('输出列表项', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.listItem('Item 1');
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Item 1');
      expect(combined).toContain('•');
      writeSpy.mockRestore();
    });
  });

  // ── error ──────────────────────────────────────────
  describe('error()', () => {
    test('输出错误消息并抛出异常', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      expect(() => chalk.error('Fatal error', { hint: 'Try again' })).toThrow('Fatal error');

      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Fatal error');
      expect(combined).toContain('Try again');

      writeSpy.mockRestore();
    });

    test('exit=false 时不退出', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

      chalk.error('Non-fatal', { exit: false });
      expect(exitSpy).not.toHaveBeenCalled();

      writeSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  // ── usage ──────────────────────────────────────────
  describe('usage()', () => {
    test('输出用法提示', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.usage('node script.js --arg', 'node script.js --help');
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('用法');
      expect(combined).toContain('node script.js --arg');
      expect(combined).toContain('示例');
      writeSpy.mockRestore();
    });
  });

  // ── result ─────────────────────────────────────────
  describe('result()', () => {
    test('成功结果输出', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.result(true, 'Operation Success', [['ID', '123']]);
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Operation Success');
      expect(combined).toContain('✔');
      expect(combined).toContain('ID');
      expect(combined).toContain('123');
      writeSpy.mockRestore();
    });

    test('失败结果输出', () => {
      const writeSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      chalk.result(false, 'Operation Failed');
      const combined = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(combined).toContain('Operation Failed');
      expect(combined).toContain('✖');
      writeSpy.mockRestore();
    });
  });

  // ── isQuiet 行为 ───────────────────────────────────
  describe('YIDA_QUIET 静默模式', () => {
    beforeEach(() => {
      process.env.YIDA_QUIET = '1';
    });
    afterEach(() => {
      delete process.env.YIDA_QUIET;
    });

    test('success 在 quiet 模式下 no-op', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.success('Should not print');
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    test('info 在 quiet 模式下 no-op', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.info('Should not print');
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    test('warn 在 quiet 模式下 no-op', () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      chalk.warn('Should not print');
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
