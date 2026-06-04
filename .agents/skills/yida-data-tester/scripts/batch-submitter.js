/**
 * 批量提交模块
 * 版本: 1.2.0
 * 
 * 功能：
 * 1. 批量处理多个表单的数据提交
 * 2. 自动发现表单并提交
 * 3. 支持上下文感知的数据生成
 * 4. 提交前后对比数据增量，检测异常重复提交
 */

const { submitBatch, getExistingDataCount } = require('./yida-submitter');
const { discoverForms, filterForms, getAppId } = require('./form-discovery');
const { generateFormData, generateMultipleData } = require('./context-data-generator');
const path = require('path');

/**
 * 批量提交多个表单
 * @param {Object} config - 配置
 * @param {string} config.projectDir - 项目目录
 * @param {string} config.appId - 应用ID（可选，自动从配置读取）
 * @param {Array} config.forms - 指定表单列表（可选，自动发现）
 * @param {number} config.count - 每个表单提交的数据条数（默认3）
 * @param {Object} config.context - 上下文 {city, industry}
 * @param {Object} config.filters - 筛选条件 {names, types, exclude}
 * @param {Function} config.onProgress - 进度回调
 * @returns {Object} 提交结果
 */
async function submitMultipleForms(config) {
  const {
    projectDir,
    appId: configAppId,
    forms: configForms,
    count = 3,
    context = {},
    filters = {},
    onProgress,
    delay = 1000
  } = config;

  console.log('==============================================');
  console.log('宜搭批量数据提交');
  console.log('==============================================');

  // 1. 获取应用ID
  let appId = configAppId;
  if (!appId) {
    const configPath = path.join(projectDir, '系统配置清单.md');
    appId = getAppId(configPath);
    if (appId) {
      console.log(`\n📱 应用ID: ${appId}`);
    } else {
      throw new Error('无法获取应用ID，请手动指定');
    }
  }

  // 2. 发现表单
  let forms = configForms;
  if (!forms || forms.length === 0) {
    console.log('\n🔍 正在发现表单...');
    forms = discoverForms(projectDir);
    
    // 应用筛选
    if (Object.keys(filters).length > 0) {
      forms = filterForms(forms, filters);
      console.log(`\n📋 筛选后表单数量: ${forms.length}`);
    }
  }

  if (forms.length === 0) {
    throw new Error('未找到任何表单');
  }

  console.log(`\n📋 共发现 ${forms.length} 个表单:`);
  forms.forEach((form, i) => {
    console.log(`  ${i + 1}. ${form.name}「${form.type}」`);
  });

  // 3. 批量提交
  const results = {
    totalForms: forms.length,
    successForms: 0,
    failedForms: 0,
    totalRecords: 0,
    successRecords: 0,
    failedRecords: 0,
    details: []
  };

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    console.log(`\n【${i + 1}/${forms.length}】正在处理: ${form.name}「${form.type}」`);

    try {
      const schemaPath = path.join(projectDir, form.dir, `${form.dir}.json`);
      
      // 检查Schema文件是否存在
      if (!require('fs').existsSync(schemaPath)) {
        console.log(`  ⚠️ Schema文件不存在: ${schemaPath}`);
        results.failedForms++;
        results.details.push({
          form: form.name,
          success: false,
          error: 'Schema文件不存在'
        });
        continue;
      }

      // 先生成测试数据，然后提交
      // 注意：这里我们先同步Schema获取字段映射，然后生成数据
      const { submitBatch } = require('./yida-submitter');
      const { extractFieldMapping } = require('./yida-submitter');
      const fs = require('fs');
      
      // 读取Schema并提取字段映射
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      const fieldMapping = extractFieldMapping(schema);
      
      console.log(`  📊 字段映射: ${Object.keys(fieldMapping).length} 个字段`);

      // 提交前记录已有数据数量（用于提交后对比增量）
      const beforeCount = await getExistingDataCount(appId, form.uuid, form.type);
      if (beforeCount >= 0) {
        console.log(`  📊 提交前已有数据: ${beforeCount} 条`);
      }

      // 生成测试数据
      const testData = generateMultipleData(fieldMapping, count, context);
      console.log(`  📝 生成 ${testData.length} 条测试数据`);

      // 提交数据
      const submitResults = await submitBatch({
        appId,
        formUuid: form.uuid,
        dataList: testData,
        syncSchema: true,
        schemaPath,
        delay
      });

      const successCount = submitResults.filter(r => r.success).length;
      const failedCount = submitResults.filter(r => !r.success).length;

      results.successRecords += successCount;
      results.failedRecords += failedCount;
      results.totalRecords += testData.length;

      // 提交后对比数据增量，检测异常重复提交
      let afterCount = -1;
      if (beforeCount >= 0) {
        afterCount = await getExistingDataCount(appId, form.uuid, form.type);
        const actualIncrement = afterCount - beforeCount;
        if (actualIncrement > successCount) {
          console.log(`  ⚠️ 数据增量异常: 新增了 ${actualIncrement} 条，但预期只新增 ${successCount} 条，可能存在重复提交`);
        }
        console.log(`  📊 提交后数据总量: ${afterCount} 条 (新增 ${actualIncrement} 条)`);
      }

      if (failedCount === 0) {
        results.successForms++;
        console.log(`  ✅ 成功 ${successCount} 条`);
      } else {
        results.failedForms++;
        console.log(`  ⚠️ 成功 ${successCount} 条，失败 ${failedCount} 条`);
      }

      results.details.push({
        form: form.name,
        type: form.type,
        uuid: form.uuid,
        success: failedCount === 0,
        successCount,
        failedCount,
        totalCount: testData.length,
        beforeCount,
        afterCount
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: forms.length,
          form: form.name,
          success: failedCount === 0
        });
      }

    } catch (error) {
      results.failedForms++;
      console.log(`  ❌ 错误: ${error.message}`);
      results.details.push({
        form: form.name,
        type: form.type,
        success: false,
        error: error.message
      });
    }
  }

  // 4. 输出统计
  console.log('\n==============================================');
  console.log('批量提交完成！');
  console.log('==============================================');
  console.log(`表单统计: ${results.successForms}/${results.totalForms} 成功`);
  console.log(`数据统计: ${results.successRecords}/${results.totalRecords} 成功`);
  if (results.failedRecords > 0) {
    console.log(`失败记录: ${results.failedRecords} 条`);
  }

  return results;
}

/**
 * 为指定应用的所有表单添加测试数据（简化接口）
 * @param {string} projectDir - 项目目录
 * @param {Object} options - 选项
 * @returns {Object} 提交结果
 */
async function addTestDataToAllForms(projectDir, options = {}) {
  const {
    city = '南昌',
    industry = '资产评估',
    count = 3,
    exclude = [],
    delay = 1000
  } = options;

  return await submitMultipleForms({
    projectDir,
    context: { city, industry },
    count,
    filters: { exclude },
    delay
  });
}

/**
 * 为指定表单添加测试数据
 * @param {string} projectDir - 项目目录
 * @param {Array|string} formNames - 表单名称列表
 * @param {Object} options - 选项
 * @returns {Object} 提交结果
 */
async function addTestDataToForms(projectDir, formNames, options = {}) {
  const {
    city = '南昌',
    industry = '资产评估',
    count = 3,
    delay = 1000
  } = options;

  const names = Array.isArray(formNames) ? formNames : [formNames];

  return await submitMultipleForms({
    projectDir,
    context: { city, industry },
    count,
    filters: { names },
    delay
  });
}

module.exports = {
  submitMultipleForms,
  addTestDataToAllForms,
  addTestDataToForms
};
