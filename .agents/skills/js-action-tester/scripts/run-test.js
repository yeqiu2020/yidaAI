/**
 * 宜搭JS代码自动化测试 - 完整测试入口
 * 版本: v1.0.1
 * 
 * 使用方式:
 * node run-test.js --code="path/to/code.js" --appId="APP_XXX"
 */

const { chromium } = require('playwright');
const { YidaAutoTester } = require('./test-runner');
const path = require('path');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    codePath: null,
    appId: null,
    appName: 'AI自动化测试',
    headless: false,
    fields: null
  };
  
  for (const arg of args) {
    if (arg.startsWith('--code=')) {
      config.codePath = arg.replace('--code=', '');
    } else if (arg.startsWith('--appId=')) {
      config.appId = arg.replace('--appId=', '');
    } else if (arg.startsWith('--appName=')) {
      config.appName = arg.replace('--appName=', '');
    } else if (arg === '--headless') {
      config.headless = true;
    } else if (arg.startsWith('--fields=')) {
      try {
        config.fields = JSON.parse(arg.replace('--fields=', ''));
      } catch (e) {
        console.error('❌ 字段配置解析失败:', e.message);
      }
    }
  }
  
  return config;
}

// 默认字段配置（用于条件显示图片组件测试）
const defaultFields = [
  {
    type: 'RadioField',
    label: '部门',
    options: ['财务部', '人事部', '销售部']
  },
  {
    type: 'TextField',
    label: '姓名'
  },
  {
    type: 'ImageField',
    label: '图片上传'
  }
];

/**
 * 运行完整测试流程
 */
async function runTest(config) {
  const tester = new YidaAutoTester({
    appId: config.appId,
    appName: config.appName,
    headless: config.headless,
    slowMo: 100,
    chromium: chromium
  });

  try {
    console.log('🚀 开始宜搭JS代码自动化测试...\n');

    // 步骤1: 创建测试表单
    console.log('📋 步骤1: 创建测试表单');
    const fields = config.fields || defaultFields;
    const formUuid = await tester.createTestForm(fields);
    console.log(`✅ 测试表单创建成功: ${formUuid}\n`);

    // 步骤2: 初始化浏览器
    console.log('🌐 步骤2: 初始化浏览器');
    await tester.initBrowser();
    console.log('✅ 浏览器初始化成功\n');

    // 步骤3: 上传JS代码
    console.log('📤 步骤3: 上传JS代码');
    await tester.uploadCode(config.codePath);
    console.log('✅ 代码上传成功\n');

    // 步骤4: 自动绑定事件（部门字段的onChange）
    console.log('🔗 步骤4: 自动绑定字段事件');
    await tester.bindFieldEvent('部门', 'onChange', 'onDepartmentChange');
    console.log('✅ 事件绑定完成\n');

    // 步骤5: 执行测试用例
    console.log('🧪 步骤5: 执行测试用例');
    await tester.executeTest(formUuid);
    console.log('✅ 测试执行完成\n');

    // 步骤6: 生成测试报告
    console.log('📊 步骤6: 生成测试报告');
    const report = tester.generateReport();
    console.log('\n========== 测试报告 ==========');
    console.log(`表单UUID: ${report.formUuid}`);
    console.log(`测试时间: ${report.timestamp}`);
    console.log(`字段ID映射:`, JSON.stringify(tester.state.fieldIdMap, null, 2));
    console.log(`测试结果: ${report.summary.passed}/${report.summary.total} 通过`);
    console.log('==============================\n');

    console.log('✅ 测试流程完成！');
    console.log(`表单设计器地址: https://www.aliwork.com/alibaba/web/${config.appId}/design/pageDesigner?formUuid=${formUuid}`);

    return {
      success: true,
      formUuid: formUuid,
      report: report
    };

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // 关闭浏览器
    await tester.closeBrowser();
  }
}

// 主函数
async function main() {
  const config = parseArgs();
  
  if (!config.codePath) {
    console.error('❌ 请提供代码文件路径: --code="path/to/code.js"');
    process.exit(1);
  }
  
  if (!config.appId) {
    console.error('❌ 请提供应用ID: --appId="APP_XXX"');
    process.exit(1);
  }
  
  // 解析代码路径（支持相对路径）
  if (!path.isAbsolute(config.codePath)) {
    config.codePath = path.resolve(process.cwd(), config.codePath);
  }
  
  console.log('📋 测试配置:');
  console.log(`  代码路径: ${config.codePath}`);
  console.log(`  应用ID: ${config.appId}`);
  console.log(`  应用名称: ${config.appName}`);
  console.log(`  无头模式: ${config.headless}`);
  console.log('');
  
  const result = await runTest(config);
  process.exit(result.success ? 0 : 1);
}

// 运行测试
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runTest, parseArgs };
