/**
 * Jest 配置文件 (Phase 4)
 *
 * 测试体系配置：
 *   - 测试目录：tests/
 *   - 覆盖率收集：lib/core/
 *   - 测试环境：node
 *   - 超时：10000ms（部分测试涉及文件I/O）
 */

'use strict';

module.exports = {
  // 测试环境
  testEnvironment: 'node',

  // 测试文件匹配模式
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
  ],

  // 测试超时（毫秒）
  testTimeout: 10000,

  // 覆盖率配置
  collectCoverageFrom: [
    'lib/core/**/*.js',
    '!lib/core/**/*.test.js',
    // 高频改动技能脚本的最小回归覆盖（report / form_creator）
    '.agents/skills/report/scripts/report-lib/field-utils.js',
    '.agents/skills/report/scripts/report-lib/chart-builder.js',
    '.agents/skills/form_creator/scripts/form_generator_v2.js',
  ],

  // 覆盖率输出目录
  coverageDirectory: '<rootDir>/tests/coverage',

  // 覆盖率报告格式
  coverageReporters: ['text-summary', 'lcov'],

  // 覆盖率阈值（lib/core 模块覆盖，login-manager 含浏览器自动化函数无法离线测试）
  coverageThreshold: {
    './lib/core/chalk.js': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    './lib/core/error.js': {
      statements: 90,
      branches: 80,
      functions: 90,
      lines: 90,
    },
    './lib/core/spawn.js': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    './lib/core/utils.js': {
      statements: 55,
      branches: 50,
      functions: 55,
      lines: 55,
    },
    './lib/core/http.js': {
      statements: 25,
      branches: 20,
      functions: 40,
      lines: 25,
    },
    './lib/core/login-manager.js': {
      statements: 15,
      branches: 8,
      functions: 20,
      lines: 15,
    },
  },

  // 模块名称映射
  moduleNameMapper: {},

  // verbose 模式
  verbose: true,
};
