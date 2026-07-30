/**
 * lib/core/utils.js 分支覆盖补充测试（覆盖率补充）
 *
 * 覆盖此前未触达的分支：
 *   - detectActiveTool 各 AI 工具识别分支（QoderWork/Qoder/Wukong/Codex/Claude/OpenCode/Cursor/Aone）
 *   - getWukongNodeBinDir / getNpmExecutable / getNodeExecutable
 *   - resolveWukongWorkspaceRoot
 *   - secureFilePermissions（路径不安全 / win32 icacls 成功 / 失败 / 无用户名）
 *   - isPlaywrightAvailable（已安装 / 未安装）
 */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const child_process = require('child_process');

jest.mock('child_process');

const utils = require('../../lib/core/utils');

const TOOL_ENV_KEYS = [
  'QODERCLI_INTEGRATION_MODE', 'QODER_IDE', 'QODER_AGENT',
  'AGENT_WORK_ROOT', 'CODEX_SHELL', 'CODEX_CI', 'CODEX_THREAD_ID', 'CODEX_HOME',
  '__CFBundleIdentifier', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE', 'OPENCODE',
  'CURSOR_TRACE_ID', 'VSCODE_GIT_ASKPASS_NODE', 'TERM_PROGRAM',
];

function clearToolEnv() {
  TOOL_ENV_KEYS.forEach((k) => delete process.env[k]);
}

describe('lib/core/utils 分支覆盖', () => {
  afterEach(() => {
    clearToolEnv();
    jest.restoreAllMocks();
  });

  // ── detectActiveTool 各分支 ──────────────────────
  const toolCases = [
    ['QoderWork', { QODERCLI_INTEGRATION_MODE: 'qoder_work' }, 'qoderwork'],
    ['Qoder IDE', { QODER_IDE: '1' }, 'qoder'],
    ['Wukong', { AGENT_WORK_ROOT: 'C:/Users/me/.real/workspace' }, 'wukong'],
    ['Codex', { CODEX_SHELL: '1' }, 'codex'],
    ['Claude Code', { CLAUDE_CODE_ENTRYPOINT: '1' }, 'claude-code'],
    ['OpenCode', { OPENCODE: '1' }, 'opencode'],
    ['Cursor', { CURSOR_TRACE_ID: '1' }, 'cursor'],
  ];

  toolCases.forEach(([name, env, expectedTool]) => {
    test(`detectActiveTool 识别 ${name}`, () => {
      clearToolEnv();
      Object.assign(process.env, env);
      const result = utils.detectActiveTool();
      expect(result && result.tool).toBe(expectedTool);
    });
  });

  test('detectActiveTool 识别 Aone Copilot（TERM_PROGRAM=vscode 且 .aone_copilot 存在）', () => {
    clearToolEnv();
    process.env.TERM_PROGRAM = 'vscode';
    const spy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const result = utils.detectActiveTool();
    expect(result && result.tool).toBe('aone-copilot');
    spy.mockRestore();
  });

  test('detectActiveTool 无匹配环境变量返回 null', () => {
    clearToolEnv();
    const result = utils.detectActiveTool();
    expect(result).toBeNull();
  });

  // ── getWukongNodeBinDir ──────────────────────────
  test('getWukongNodeBinDir 在 wukong 且 bin 存在时返回 bin 目录', () => {
    clearToolEnv();
    process.env.AGENT_WORK_ROOT = 'C:/Users/me/.real/workspace';
    const binPath = path.join(os.homedir(), '.real', '.bin', 'node', 'bin');
    const spy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).includes('.real' + path.sep + '.bin' + path.sep + 'node' + path.sep + 'bin'));
    const result = utils.getWukongNodeBinDir();
    spy.mockRestore();
    expect(result).toBe(binPath);
  });

  test('getWukongNodeBinDir 非 wukong 环境返回 null', () => {
    clearToolEnv();
    expect(utils.getWukongNodeBinDir()).toBeNull();
  });

  // ── getNpmExecutable / getNodeExecutable ─────────
  test('getNpmExecutable 默认返回 npm', () => {
    clearToolEnv();
    expect(utils.getNpmExecutable()).toBe('npm');
  });

  test('getNodeExecutable 默认返回 node', () => {
    clearToolEnv();
    expect(utils.getNodeExecutable()).toBe('node');
  });

  // ── resolveWukongWorkspaceRoot ───────────────────
  test('resolveWukongWorkspaceRoot 找到 config.json 时返回该候选路径', () => {
    const candidate = path.join('C:/x', 'project');
    const spy = jest.spyOn(fs, 'existsSync').mockImplementation((p) => String(p).endsWith(path.join('project', 'config.json')));
    const result = utils.resolveWukongWorkspaceRoot('C:/x');
    spy.mockRestore();
    expect(result).toBe(candidate);
  });

  test('resolveWukongWorkspaceRoot 无 config.json 时返回 agentWorkRoot', () => {
    const spy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const result = utils.resolveWukongWorkspaceRoot('C:/x');
    spy.mockRestore();
    expect(result).toBe('C:/x');
  });

  // ── secureFilePermissions ────────────────────────
  test('secureFilePermissions 路径不安全时返回 path-check 失败', () => {
    const result = utils.secureFilePermissions('bad\u0000.txt');
    expect(result.success).toBe(false);
    expect(result.method).toBe('path-check');
  });

  test('secureFilePermissions win32 下 icacls 成功', () => {
    process.env.USERNAME = 'tester';
    child_process.execSync.mockReturnValue(Buffer.from(''));
    const result = utils.secureFilePermissions('C:/tmp/test.txt');
    expect(result.success).toBe(true);
    expect(result.method).toBe('icacls');
  });

  test('secureFilePermissions win32 下 icacls 失败被捕获', () => {
    process.env.USERNAME = 'tester';
    child_process.execSync.mockImplementation(() => { throw new Error('access denied'); });
    const result = utils.secureFilePermissions('C:/tmp/test.txt');
    expect(result.success).toBe(false);
    expect(result.detail).toContain('access denied');
  });

  test('secureFilePermissions 无用户名时返回失败', () => {
    delete process.env.USERNAME;
    const result = utils.secureFilePermissions('C:/tmp/test.txt');
    expect(result.success).toBe(false);
    expect(result.detail).toContain('无法确定');
  });

  // ── isPlaywrightAvailable ────────────────────────
  test('isPlaywrightAvailable 已安装时返回 available:true', () => {
    const result = utils.isPlaywrightAvailable();
    expect(result.available).toBe(true);
  });

  test('isPlaywrightAvailable 加载失败时（require 抛错）返回 available:false', () => {
    jest.isolateModules(() => {
      jest.doMock('playwright', () => { throw new Error('MODULE_NOT_FOUND'); });
      const u = require('../../lib/core/utils');
      const result = u.isPlaywrightAvailable();
      expect(result.available).toBe(false);
      expect(result.error).toContain('MODULE_NOT_FOUND');
    });
  });
});
