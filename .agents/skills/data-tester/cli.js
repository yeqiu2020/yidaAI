#!/usr/bin/env node
/**
 * 宜搭数据测试专家 - CLI 工具
 * 版本: 1.0.0
 *
 * 用法:
 *   node cli.js <项目路径> [选项]
 *
 * 示例:
 *   node cli.js d:/宜搭AI编程/我的项目 --city 武汉 --count 5
 *   node cli.js d:/宜搭AI编程/我的项目 --forms "表单1,表单2" --city 北京 --count 3
 */

const { addTestDataToAllForms, addTestDataToForms } = require('./scripts/batch-submitter');
const path = require('path');

function showHelp() {
  console.log(`
宜搭数据测试专家 - 批量添加测试数据

用法:
  node cli.js <项目路径> [选项]

参数:
  <项目路径>                项目目录路径（包含系统配置清单.md）

选项:
  --forms <表单名>          指定表单名称，多个用逗号分隔（默认所有表单）
  --city <城市>             模拟数据城市（默认: 南昌）
  --industry <行业>         行业上下文（默认: 通用业务）
  --count <数量>            每个表单的数据条数（默认: 3）
  --exclude <表单名>        排除的表单，多个用逗号分隔
  --help                    显示帮助信息

示例:
  # 为所有表单添加5条武汉地区的测试数据
  node cli.js d:/宜搭AI编程/我的项目 --city 武汉 --count 5

  # 为指定表单添加测试数据
  node cli.js d:/宜搭AI编程/我的项目 --forms "费用报销,采购申请" --city 上海 --count 10

  # 排除特定表单
  node cli.js d:/宜搭AI编程/我的项目 --exclude "系统配置,日志记录" --count 5
`);
}

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const projectDir = args[0];
  const options = {
    city: '南昌',
    industry: '通用业务',
    count: 3
  };
  let formNames = null;
  let exclude = null;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--city':
        if (nextArg) options.city = nextArg;
        i++;
        break;
      case '--industry':
        if (nextArg) options.industry = nextArg;
        i++;
        break;
      case '--count':
        if (nextArg) options.count = parseInt(nextArg) || 3;
        i++;
        break;
      case '--forms':
        if (nextArg) formNames = nextArg.split(',').map(f => f.trim());
        i++;
        break;
      case '--exclude':
        if (nextArg) exclude = nextArg.split(',').map(f => f.trim());
        i++;
        break;
    }
  }

  if (exclude) {
    options.exclude = exclude;
  }

  return { projectDir, formNames, options };
}

async function main() {
  const { projectDir, formNames, options } = parseArgs();

  console.log('==============================================');
  console.log('宜搭数据测试专家 - CLI');
  console.log('==============================================');
  console.log(`项目路径: ${projectDir}`);
  console.log(`模拟城市: ${options.city}`);
  console.log(`行业上下文: ${options.industry}`);
  console.log(`数据条数: ${options.count}条/表单`);

  if (formNames) {
    console.log(`指定表单: ${formNames.join(', ')}`);
  } else {
    console.log('目标表单: 所有表单');
  }

  if (options.exclude) {
    console.log(`排除表单: ${options.exclude.join(', ')}`);
  }

  console.log('==============================================\n');

  console.log('\n⚠️ 注意：CLI 入口使用的是已废弃的脚本内置数据池函数（addTestDataTo*）。');
  console.log('   推荐使用 submitAllWithAutoAssociations（见 SKILL.md 场景2），由 AI 生成业务化数据。\n');

  try {
    let results;

    if (formNames) {
      // 为指定表单添加数据
      results = await addTestDataToForms(projectDir, formNames, options);
    } else {
      // 为所有表单添加数据
      results = await addTestDataToAllForms(projectDir, options);
    }

    console.log('\n==============================================');
    console.log('批量提交完成！');
    console.log('==============================================');
    console.log(`表单统计: ${results.successForms}/${results.totalForms} 成功`);
    console.log(`数据统计: ${results.successRecords}/${results.totalRecords} 条成功`);

    // 【v3.6.0修复】results.failedForms 是数字而非数组，改为从 details 过滤失败表单
    const failedDetails = (results.details || []).filter(d => !d.success);
    if (failedDetails.length > 0) {
      console.log('\n❌ 失败的表单:');
      failedDetails.forEach(d => {
        console.log(`  - ${d.form}: ${d.error || `部分记录失败（${d.successCount || 0}/${d.total || '?'}）`}`);
      });
    }

    console.log('==============================================');

  } catch (error) {
    console.error('\n❌ 执行失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

/**
 * 版本历史：
 * v1.0.0 (2026-06-05): 初始版本，提供命令行接口
 */
