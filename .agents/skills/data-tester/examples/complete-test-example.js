/**
 * 宜搭数据测试完整示例
 * 版本: 1.0.0
 * 创建时间: 2026-03-13
 * 
 * 本示例展示如何使用宜搭数据测试专家技能进行完整的测试流程
 */

const DataGenerator = require('../scripts/data-generator');
const ApiSubmitter = require('../scripts/api-submitter');
const BrowserSubmitter = require('../scripts/browser-submitter');
const ResultValidator = require('../scripts/result-validator');
const ReportGenerator = require('../scripts/report-generator');

/**
 * 完整测试流程示例
 */
async function runCompleteTest() {
  console.log('🚀 开始宜搭数据测试...\n');

  const startTime = Date.now();

  // ========== 1. 配置 ==========
  const testConfig = {
    testName: '采购申请单完整测试',
    formUuid: 'FORM-XXXX-XXXX-XXXX-XXXX',
    formName: '采购申请单',
    submitMode: 'api', // 或 'browser'
    testCount: 5,
    
    // API配置
    appKey: 'your-app-key',
    appSecret: 'your-app-secret',
    baseUrl: 'https://api.dingtalk.com',
    
    // 浏览器配置（如使用browser模式）
    username: 'your-username',
    password: 'your-password',
    formUrl: 'https://www.aliwork.com/yida/form/FORM-XXXX-XXXX',
    
    // 字段配置
    fields: [
      {
        fieldId: 'textField_申请人',
        fieldName: '申请人',
        type: 'TextField',
        generateRule: { type: 'name' }
      },
      {
        fieldId: 'numberField_采购数量',
        fieldName: '采购数量',
        type: 'NumberField',
        generateRule: { type: 'range', min: 1, max: 100 }
      },
      {
        fieldId: 'moneyField_单价',
        fieldName: '单价',
        type: 'MoneyField',
        generateRule: { type: 'range', min: 10, max: 1000 }
      },
      {
        fieldId: 'formulaField_总金额',
        fieldName: '总金额',
        type: 'FormulaField',
        validate: true,
        expectedFormula: 'numberField_采购数量 * moneyField_单价'
      }
    ],
    
    // 验证配置
    validation: {
      checkFormula: true,
      checkValidation: false,
      checkProcess: false
    },
    
    // 表单配置
    formConfig: {
      formulaFields: [
        {
          fieldId: 'formulaField_总金额',
          fieldName: '总金额',
          expectedFormula: 'numberField_采购数量 * moneyField_单价'
        }
      ]
    }
  };

  // ========== 2. 生成测试数据 ==========
  console.log('📦 步骤1: 生成测试数据...');
  const generator = new DataGenerator();
  const testData = generator.generate({
    count: testConfig.testCount,
    fields: testConfig.fields
  });
  console.log(`✅ 已生成 ${testData.length} 条测试数据\n`);

  // ========== 3. 提交数据 ==========
  console.log('📤 步骤2: 提交测试数据...');
  let submitResults = [];

  if (testConfig.submitMode === 'api') {
    // API模式
    const submitter = new ApiSubmitter({
      appKey: testConfig.appKey,
      appSecret: testConfig.appSecret,
      baseUrl: testConfig.baseUrl
    });

    submitResults = await submitter.submitBatch({
      formUuid: testConfig.formUuid,
      dataList: testData
    }, {
      delay: 500,
      stopOnError: false
    });

  } else {
    // 浏览器模式
    const submitter = new BrowserSubmitter({
      headless: false,
      slowMo: 100,
      screenshotOnError: true
    });

    await submitter.init();
    
    const loginResult = await submitter.login({
      username: testConfig.username,
      password: testConfig.password
    });

    if (!loginResult.success) {
      throw new Error('登录失败: ' + loginResult.message);
    }

    submitResults = await submitter.submitBatch({
      formUrl: testConfig.formUrl,
      dataList: testData,
      formConfig: { fields: testConfig.fields }
    }, {
      delay: 3000
    });

    await submitter.close();
  }

  const successCount = submitResults.filter(r => r.success).length;
  console.log(`✅ 提交完成: ${successCount}/${submitResults.length} 成功\n`);

  // ========== 4. 验证结果 ==========
  console.log('🔍 步骤3: 验证测试结果...');
  
  // 只对成功提交的数据进行验证
  const successfulSubmissions = submitResults.filter(r => r.success);
  
  let validationResults = null;
  if (successfulSubmissions.length > 0 && testConfig.validation.checkFormula) {
    const apiSubmitter = new ApiSubmitter({
      appKey: testConfig.appKey,
      appSecret: testConfig.appSecret,
      baseUrl: testConfig.baseUrl
    });

    const validator = new ResultValidator(apiSubmitter);
    
    validationResults = await validator.validate({
      submitResults: successfulSubmissions,
      validationRules: testConfig.validation,
      formConfig: testConfig.formConfig
    });

    const passedCount = validationResults.results.filter(r => r.overall).length;
    console.log(`✅ 验证完成: ${passedCount}/${validationResults.results.length} 通过\n`);
  }

  // ========== 5. 生成报告 ==========
  console.log('📊 步骤4: 生成测试报告...');
  
  const endTime = Date.now();
  const reportGenerator = new ReportGenerator({
    outputDir: './test-reports',
    includeRawData: false
  });

  const report = await reportGenerator.generate({
    testName: testConfig.testName,
    testConfig,
    submitResults,
    validationResults,
    startTime,
    endTime
  });

  console.log('✅ 报告生成完成！');
  console.log(`📄 JSON报告: ${report.jsonReport}`);
  console.log(`📄 Markdown报告: ${report.markdownReport}`);
  console.log(`📄 摘要报告: ${report.summary}`);

  // ========== 6. 输出摘要 ==========
  console.log('\n========== 测试摘要 ==========');
  console.log(`测试名称: ${testConfig.testName}`);
  console.log(`执行时长: ${((endTime - startTime) / 1000).toFixed(2)}秒`);
  console.log(`提交: ${submitResults.length}条, 成功${successCount}条, 失败${submitResults.length - successCount}条`);
  
  if (validationResults) {
    console.log(`验证: ${validationResults.results.length}条, 通过${validationResults.passed}条, 失败${validationResults.failed}条`);
  }

  // 显示失败详情
  const failures = submitResults.filter(r => !r.success);
  if (failures.length > 0) {
    console.log('\n❌ 提交失败详情:');
    failures.forEach(f => {
      console.log(`  第${f.index + 1}条: ${f.message}`);
    });
  }

  return {
    submitResults,
    validationResults,
    report
  };
}

/**
 * 仅测试公式计算的示例
 */
async function testFormulaOnly() {
  console.log('🧮 开始公式测试...\n');

  const config = {
    testName: '公式计算专项测试',
    formUuid: 'FORM-XXXX-XXXX',
    fields: [
      {
        fieldId: 'numberField_A',
        type: 'NumberField',
        generateRule: { type: 'range', min: 1, max: 100 }
      },
      {
        fieldId: 'numberField_B',
        type: 'NumberField',
        generateRule: { type: 'range', min: 1, max: 100 }
      },
      {
        fieldId: 'formulaField_Sum',
        type: 'FormulaField',
        validate: true,
        expectedFormula: 'numberField_A + numberField_B'
      },
      {
        fieldId: 'formulaField_Product',
        type: 'FormulaField',
        validate: true,
        expectedFormula: 'numberField_A * numberField_B'
      }
    ],
    testCount: 10
  };

  // 生成数据
  const generator = new DataGenerator();
  const testData = generator.generate(config);

  // 计算预期结果
  const expectedResults = testData.map(d => ({
    A: d.numberField_A,
    B: d.numberField_B,
    expectedSum: d.numberField_A + d.numberField_B,
    expectedProduct: d.numberField_A * d.numberField_B
  }));

  console.log('预期计算结果:');
  expectedResults.forEach((r, i) => {
    console.log(`  第${i + 1}条: A=${r.A}, B=${r.B}, Sum=${r.expectedSum}, Product=${r.expectedProduct}`);
  });

  return expectedResults;
}

/**
 * 仅测试校验规则的示例
 */
async function testValidationOnly() {
  console.log('✅ 开始校验规则测试...\n');

  const config = {
    testName: '校验规则专项测试',
    formUuid: 'FORM-XXXX-XXXX',
    fields: [
      {
        fieldId: 'textField_必填',
        type: 'TextField',
        // 测试空值
        generateRule: { type: 'random', length: 0 }
      },
      {
        fieldId: 'numberField_范围',
        type: 'NumberField',
        // 测试超出范围的值
        generateRule: { type: 'boundary-max', min: 0, max: 100 }
      },
      {
        fieldId: 'textField_手机',
        type: 'TextField',
        // 测试错误格式的手机号
        generateRule: { type: 'random', length: 11 }
      }
    ],
    testCount: 5
  };

  const generator = new DataGenerator();
  const testData = generator.generate(config);

  console.log('生成的边界测试数据:');
  testData.forEach((d, i) => {
    console.log(`  第${i + 1}条:`, JSON.stringify(d));
  });

  return testData;
}

// ========== 主程序 ==========

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'complete';

  try {
    switch (mode) {
      case 'complete':
        await runCompleteTest();
        break;
      case 'formula':
        await testFormulaOnly();
        break;
      case 'validation':
        await testValidationOnly();
        break;
      default:
        console.log('用法: node complete-test-example.js [complete|formula|validation]');
        console.log('  complete   - 运行完整测试流程');
        console.log('  formula    - 仅测试公式计算');
        console.log('  validation - 仅测试校验规则');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  runCompleteTest,
  testFormulaOnly,
  testValidationOnly
};

/**
 * 版本历史：
 * v1.0.0 (2026-03-13): 初始版本，提供完整测试流程、公式测试和校验规则测试示例
 */