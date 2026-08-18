#!/usr/bin/env node
/**
 * create-report.js - 宜搭报表创建入口
 *
 * 直接调用 report-lib 原始模块创建报表，不依赖任何外部 CLI 工具。
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

function findProjectRoot() {
  // 阶段二改造：优先 cwd（CLI 模式下即用户工作目录）
  if (fs.existsSync(path.join(process.cwd(), '组织及应用信息.md'))) {
    return process.cwd();
  }
  // 全局 Cookie 存在时也优先 cwd
  const globalCookieFile = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
  if (fs.existsSync(globalCookieFile) && fs.existsSync(path.join(process.cwd(), '.cookies.json'))) {
    return process.cwd();
  }
  // 目录回溯兼容
  let currentDir = __dirname;
  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, '.cookies.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return path.resolve(__dirname, '..', '..', '..', '..');
}

const projectRoot = findProjectRoot();

// 设置环境变量，让 report-lib 找到项目根目录
process.env.YIDA_PROJECT_ROOT = projectRoot;

// 直接加载原始 report-lib 模块
const reportLib = require('./report-lib/index');

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('用法: node create-report.js <appType> "<报表名称>" <配置JSON文件路径>');
    console.log('示例: node create-report.js APP_XXX "销售报表" charts.json');
    process.exit(1);
  }

  const appType = args[0];
  const reportTitle = args[1];
  const configFile = args[2];

  // 调用原始模块的 run 函数
  process.argv = [
    process.argv[0],
    __filename,
    'create-report',
    appType,
    reportTitle,
    configFile,
  ];

  try {
    await reportLib.run();
  } catch (err) {
    console.error('执行异常:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
