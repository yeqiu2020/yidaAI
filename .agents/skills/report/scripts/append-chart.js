'use strict';

/**
 * append-chart.js — 报表增量追加图表 CLI 入口（P2-1，v2.0.0）
 *
 * 完整实现在 report-lib/append.js（读取已有报表 Schema → 追加图表节点 → 增量保存，
 * 不影响既有图表）。本文件是薄 CLI 入口，修复 SKILL.md 第4步引用但脚本缺失的文档-代码脱节。
 *
 * 用法：node append-chart.js <appType> <reportId> <图表配置JSON文件或内联JSON>
 */

const { run } = require('./report-lib/append');

run(process.argv.slice(2)).catch((err) => {
  console.error('执行异常: ' + (err && err.message));
  process.exit(1);
});
