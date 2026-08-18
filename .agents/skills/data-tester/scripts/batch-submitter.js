/**
 * 批量提交模块
 * 版本: 3.7.3
 *
 * 【v3.7.3 变更】新增 DateField 自动填充：扫描所有表单Schema，
 * 为AI未提供值的DateField字段自动填充当前时间戳。
 * 根因：AI通常不会为"创建时间"等日期字段生成当前时间戳，
 * 而宜搭API提交时不会像UI那样自动填充日期字段。
 *
 * 【v3.7.2 变更】修复 EmployeeField（成员组件）字段值缺失问题：
 * 1. submitAllWithAutoAssociations 新增 EmployeeField 自动填充：扫描所有表单Schema，
 *    为AI未提供值的EmployeeField字段自动填充当前登录用户ID。
 *    根因：AI不知道userId，宜搭API不会像UI那样自动填充"创建人"等成员字段。
 * 2. extractFieldValue 新增 EmployeeField 类型处理：从 formData 格式
 *    [{value: userId, label: "姓名"}] 中正确提取 userId 字符串，
 *    使被填充字段（dataFillingRules）的负责人等成员字段能正确抄写。
 *
 * 【v3.7.1 变更】修复两个根因缺陷：
 * 1. 被填充字段查找失败：targetRecords.find(r => r.instanceId) 在普通表单中匹配不上，
 *    因为 buildReverseTitleMap 返回的是 formInstId，而普通表单记录的 r.instanceId 可能为空。
 *    修复为优先用 formInstId 匹配，回退到 instanceId。
 * 2. 依赖表单幂等性缺失：v3.7.0 只为基础表单添加了幂等性检查，依赖表单仍会被重复提交。
 *    现为依赖表单也添加幂等性检查。
 *
 * 【v3.7.0 变更】修复两个根因缺陷：
 * 1. 幂等性缺失：重复调用时基础表单数据翻倍。现增加幂等性检查，已有足够数据时跳过提交。
 * 2. 被填充字段值缺失：API提交时数据填充规则不触发，导致仓库地址、产品名称等字段为空。
 *    现自动从目标表单记录中抄写 dataFillingRules 指定的源字段值到被填充字段。
 *
 * 【v3.6.0 变更】修复 P0 级缺陷：基础表单提交后与查询 instanceId 之间无任何等待，
 * 撞上宜搭搜索索引延迟窗口时关联填充静默失败（报"成功"但关联为空）。现增加显式
 * 等待+按预期记录数轮询重试，超时仍未查全则 fail-fast 中止，绝不再提交空关联数据。
 * 另含：模糊匹配降级、基础失败中止、formOrder 差集告警、内置删除函数导出。
 *
 * 功能：
 * 1. 批量处理多个表单的数据提交
 * 2. 自动发现表单并提交
 * 3. 支持上下文感知的数据生成（基于字段语义分析）
 * 4. 提交前后对比数据增量，检测异常重复提交
 */

const { submitBatch, getExistingDataCount, loadCookies, searchFormDatas, buildTitleMap, buildReverseTitleMap, findRecordByTitle, loadLabelMap, parseInstValue, verifyAssociationField, getFormMeta, startInstance, verifyProcessInstance, extractFieldMapping, deleteFormData, deleteInstance, clearFormData } = require('./submitter');
const { discoverForms, filterForms, getAppId, validateProjectConfig } = require('./form-discovery');
const { generateFormData, generateMultipleData } = require('./context-data-generator');
const path = require('path');

/**
 * 批量提交多个表单
 * @param {Object} config - 配置
 * @param {string} config.projectDir - 项目目录
 * @param {string} config.appId - 应用ID（可选，自动从配置读取）
 * @param {Array} config.forms - 指定表单列表（可选，自动发现）
 * @param {number} config.count - 每个表单提交的数据条数（默认3）
 * @param {Object} config.context - 上下文 {city, ...}
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

  // 0. 前置安全校验
  if (projectDir) {
    const validation = validateProjectConfig(projectDir);
    if (validation.warnings && validation.warnings.length > 0) {
      validation.warnings.forEach(w => console.log(`⚠️  ${w}`));
    }
    if (!validation.valid) {
      validation.errors.forEach(e => console.error(`❌ ${e}`));
      throw new Error('项目配置校验失败，已中止提交。请检查上述错误后再试。');
    }
  }

  // 0.5 加载登录态，提取 userId 用于 EmployeeField
  let userId = '';
  try {
    const cookieData = loadCookies();
    userId = cookieData.userId || '';
    if (userId) {
      console.log(`👤 当前用户ID: ${userId}`);
    }
  } catch (e) {
    console.log('  ⚠️ 未能加载用户ID，EmployeeField 字段将为空');
  }

  // 将 userId 合并到 context 中
  const fullContext = { ...context, userId };

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
      const formDirName = form.dir.includes('/') ? form.dir.split('/').pop() : form.dir;
      const schemaPath = path.join(projectDir, form.dir, `${formDirName}.json`);
      
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
      const { extractFieldMapping } = require('./submitter');
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

      // 生成测试数据（基于字段语义分析，传入 userId 用于 EmployeeField）
      const testData = generateMultipleData(fieldMapping, count, fullContext);
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
 * @deprecated v3.0.0起废弃。使用 submitAIGeneratedData 替代。
 * 此函数使用脚本内置数据池生成数据，无法理解业务语义，数据质量低。
 * @param {string} projectDir - 项目目录
 * @param {Object} options - 选项
 * @returns {Object} 提交结果
 */
async function addTestDataToAllForms(projectDir, options = {}) {
  console.warn('⚠️ [废弃警告] addTestDataToAllForms 已废弃，请使用 submitAIGeneratedData 替代。');
  console.warn('⚠️ 脚本内置数据池无法理解业务语义，生成的数据可能不真实。');
  console.warn('⚠️ AI应根据应用场景生成数据后调用 submitAIGeneratedData 提交。');
  const {
    city = '',
    count = 3,
    exclude = [],
    delay = 1000
  } = options;

  return await submitMultipleForms({
    projectDir,
    context: { city },
    count,
    filters: { exclude },
    delay
  });
}

/**
 * 为指定表单添加测试数据
 * @deprecated v3.0.0起废弃。使用 submitAIGeneratedData 替代。
 * 此函数使用脚本内置数据池生成数据，无法理解业务语义，数据质量低。
 * @param {string} projectDir - 项目目录
 * @param {Array|string} formNames - 表单名称列表
 * @param {Object} options - 选项
 * @returns {Object} 提交结果
 */
async function addTestDataToForms(projectDir, formNames, options = {}) {
  console.warn('⚠️ [废弃警告] addTestDataToForms 已废弃，请使用 submitAIGeneratedData 替代。');
  console.warn('⚠️ 脚本内置数据池无法理解业务语义，生成的数据可能不真实。');
  console.warn('⚠️ AI应根据应用场景生成数据后调用 submitAIGeneratedData 提交。');
  const {
    city = '',
    count = 3,
    delay = 1000
  } = options;

  const names = Array.isArray(formNames) ? formNames : [formNames];

  return await submitMultipleForms({
    projectDir,
    context: { city },
    count,
    filters: { names },
    delay
  });
}

/**
 * 提交AI生成的数据（AI负责生成数据，脚本只负责提交）
 * @param {string} projectDir - 项目目录
 * @param {string} formName - 表单名称
 * @param {Array<Object>} dataList - AI生成的数据，key为字段中文名
 *   示例: [{ "产品名称": "iPhone 15 Pro", "产品分类": "手机" }, ...]
 *   子表格式: [{ "子表名": [{ "列1": "值1" }, { "列1": "值2" }] }, ...]
 * @param {Object} options - 选项
 * @returns {Object} 提交结果
 */
async function submitAIGeneratedData(projectDir, formName, dataList, options = {}) {
  const { delay = 1000 } = options;

  console.log('==============================================');
  console.log('宜搭数据提交（AI生成数据模式）');
  console.log('==============================================');

  // 0. 前置安全校验
  const validation = validateProjectConfig(projectDir);
  if (validation.warnings && validation.warnings.length > 0) {
    validation.warnings.forEach(w => console.log(`⚠️  ${w}`));
  }
  if (!validation.valid) {
    validation.errors.forEach(e => console.error(`❌ ${e}`));
    throw new Error('项目配置校验失败，已中止提交。请检查上述错误后再试。');
  }

  // 1. 获取应用ID
  const configPath = path.join(projectDir, '系统配置清单.md');
  const appId = getAppId(configPath);
  if (!appId) {
    throw new Error('无法获取应用ID，请检查系统配置清单.md');
  }
  console.log(`📱 应用ID: ${appId}`);

  // 2. 发现表单并匹配
  const forms = discoverForms(projectDir);
  const form = forms.find(f => f.name === formName);
  if (!form) {
    throw new Error(`未找到表单: ${formName}，可用表单: ${forms.map(f => f.name).join('、')}`);
  }
  console.log(`📋 表单: ${form.name}「${form.type}」`);

  // 3. 定位Schema文件
  const formDirName = form.dir.includes('/') ? form.dir.split('/').pop() : form.dir;
  const schemaPath = path.join(projectDir, form.dir, `${formDirName}.json`);
  if (!require('fs').existsSync(schemaPath)) {
    throw new Error(`Schema文件不存在: ${schemaPath}`);
  }

  // 4. 提交前记录数据数量
  const beforeCount = await getExistingDataCount(appId, form.uuid, form.type);
  if (beforeCount >= 0) {
    console.log(`📊 提交前已有数据: ${beforeCount} 条`);
  }

  // 5. 提交数据
  console.log(`📝 提交 ${dataList.length} 条AI生成数据`);
  const submitResults = await submitBatch({
    appId,
    formUuid: form.uuid,
    dataList,
    syncSchema: true,
    schemaPath,
    delay
  });

  const successCount = submitResults.filter(r => r.success).length;
  const failedCount = submitResults.filter(r => !r.success).length;

  // 6. 提交后对比增量
  let afterCount = -1;
  if (beforeCount >= 0) {
    afterCount = await getExistingDataCount(appId, form.uuid, form.type);
    const actualIncrement = afterCount - beforeCount;
    if (actualIncrement > successCount) {
      console.log(`⚠️ 数据增量异常: 新增了 ${actualIncrement} 条，但预期只新增 ${successCount} 条`);
    }
    console.log(`📊 提交后数据总量: ${afterCount} 条 (新增 ${actualIncrement} 条)`);
  }

  if (failedCount === 0) {
    console.log(`✅ 全部成功: ${successCount} 条`);
  } else {
    console.log(`⚠️ 成功 ${successCount} 条，失败 ${failedCount} 条`);
  }

  return {
    form: form.name,
    type: form.type,
    uuid: form.uuid,
    success: failedCount === 0,
    successCount,
    failedCount,
    totalCount: dataList.length,
    beforeCount,
    afterCount,
    details: submitResults
  };
}

/**
 * 批量提交AI生成的数据到多个表单（一次调用完成所有表单）
 * 【v3.3.0新增】解决AI逐表单调用submitAIGeneratedData导致耗时过长的问题
 *
 * 核心优化：
 * 1. 一次调用处理所有表单，避免AI多次RunCommand的终端开销
 * 2. 自动处理关联字段：按依赖顺序提交，自动查询instanceId并补全关联元数据
 * 3. 去掉冗余的getExistingDataCount（提交前后各1次→仅提交后1次）
 * 4. delay从1000ms降到500ms
 *
 * @param {string} projectDir - 项目目录
 * @param {Object} formDataMap - 表单数据映射 { 表单名称: [数据1, 数据2, ...] }
 *   数据key为字段中文名，关联字段可传 {instanceId, title} 对象
 *   示例: {
 *     "产品信息": [{ "产品名称": "iPhone 15", ... }, ...],
 *     "仓库信息": [{ "仓库名称": "武汉仓", ... }, ...],
 *     "库存信息": [{ "选择仓库": {instanceId:"FINST-xxx",title:"武汉仓"}, "选择产品": {instanceId:"FINST-yyy",title:"iPhone"}, ... }]
 *   }
 * @param {Array<string>} formOrder - 表单提交顺序（依赖项在前），可选
 *   如不传则自动按依赖排序：无关联字段的表单排在前面，有关联字段的排在后面
 * @param {Object} options - 选项 { delay: 500, skipCountCheck: false }
 * @returns {Object} 批量提交结果
 */
async function submitAllAIGeneratedData(projectDir, formDataMap, formOrder = null, options = {}) {
  const { delay = 500, skipCountCheck = false } = options;
  const fs = require('fs');

  console.log('==============================================');
  console.log('宜搭批量数据提交（AI生成数据·多表单模式）');
  console.log('==============================================');

  const startTime = Date.now();

  // 0. 前置安全校验：交叉验证 App ID 与表单 UUID 格式
  const validation = validateProjectConfig(projectDir);
  if (validation.warnings && validation.warnings.length > 0) {
    validation.warnings.forEach(w => console.log(`⚠️  ${w}`));
  }
  if (!validation.valid) {
    validation.errors.forEach(e => console.error(`❌ ${e}`));
    throw new Error('项目配置校验失败，已中止提交。请检查上述错误后再试。');
  }
  console.log(`✅ 配置校验通过（AppID: ${validation.appId}, 表单数: ${validation.formCount}）`);

  // 1. 获取应用ID（只读1次）
  const configPath = path.join(projectDir, '系统配置清单.md');
  const appId = getAppId(configPath);
  if (!appId) throw new Error('无法获取应用ID');
  console.log(`📱 应用ID: ${appId}`);

  // 2. 发现表单（只扫描1次）
  const allForms = discoverForms(projectDir);

  // 3. 确定提交顺序
  const formNames = formOrder || Object.keys(formDataMap);
  console.log(`📋 提交顺序: ${formNames.join(' → ')}`);

  // 4. 批量提交
  const results = {
    totalForms: formNames.length,
    successForms: 0,
    failedForms: 0,
    totalRecords: 0,
    successRecords: 0,
    failedRecords: 0,
    details: []
  };

  for (const formName of formNames) {
    const dataList = formDataMap[formName];
    if (!dataList || dataList.length === 0) {
      console.log(`\n⏭️ 跳过 ${formName}: 无数据`);
      continue;
    }

    const form = allForms.find(f => f.name === formName);
    if (!form) {
      console.log(`\n❌ 未找到表单: ${formName}`);
      results.failedForms++;
      results.details.push({ form: formName, success: false, error: '未找到表单' });
      continue;
    }

    console.log(`\n【${results.details.length + 1}/${formNames.length}】${form.name}「${form.type}」- ${dataList.length}条`);

    try {
      // 定位Schema文件
      const formDirName = form.dir.includes('/') ? form.dir.split('/').pop() : form.dir;
      const schemaPath = path.join(projectDir, form.dir, `${formDirName}.json`);
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Schema文件不存在: ${schemaPath}`);
      }

      // 提交数据
      const submitResults = await submitBatch({
        appId,
        formUuid: form.uuid,
        dataList,
        syncSchema: true,
        schemaPath,
        delay
      });

      const successCount = submitResults.filter(r => r.success).length;
      const failedCount = submitResults.filter(r => !r.success).length;

      results.successRecords += successCount;
      results.failedRecords += failedCount;
      results.totalRecords += dataList.length;

      if (failedCount === 0) {
        results.successForms++;
        console.log(`  ✅ 全部成功: ${successCount}条`);
      } else {
        results.failedForms++;
        console.log(`  ⚠️ 成功${successCount}条，失败${failedCount}条`);
        // 输出失败详情（【v3.6.1】附提交载荷，消灭"为看详细错误而写调试脚本"的动机）
        for (const r of submitResults) {
          if (!r.success) {
            console.log(`    ❌ 第${r.index + 1}条: ${r.message}`);
            if (r.transformedData) {
              console.log(`       提交载荷: ${JSON.stringify(r.transformedData).slice(0, 600)}`);
            }
          }
        }
      }

      // 提交后数据数量（仅在不跳过时检查）
      let afterCount = -1;
      if (!skipCountCheck) {
        afterCount = await getExistingDataCount(appId, form.uuid, form.type);
        console.log(`  📊 提交后数据总量: ${afterCount}条`);
      }

      results.details.push({
        form: form.name,
        type: form.type,
        uuid: form.uuid,
        success: failedCount === 0,
        successCount,
        failedCount,
        totalCount: dataList.length,
        afterCount
      });
    } catch (error) {
      results.failedForms++;
      console.log(`  ❌ 错误: ${error.message}`);
      results.details.push({ form: form.name, success: false, error: error.message });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n==============================================`);
  console.log(`批量提交完成！耗时 ${elapsed}s`);
  console.log(`表单: ${results.successForms}/${results.totalForms} 成功`);
  console.log(`数据: ${results.successRecords}/${results.totalRecords} 成功`);
  if (results.failedRecords > 0) {
    console.log(`失败: ${results.failedRecords}条`);
  }
  console.log('==============================================');

  results.elapsedSeconds = parseFloat(elapsed);
  return results;
}

/**
 * 从宜搭 formData 中提取字段值，用于自动填充被填充字段
 * @param {Array|String|Number} rawValue - formData 中字段ID对应的原始值
 * @param {String} fieldType - 字段类型（如 TextField, NumberField, SelectField 等）
 * @returns {String|Number|Object|null} 提取后的值，可直接赋给 AI 生成数据的字段
 */
function extractFieldValue(rawValue, fieldType) {
  if (!rawValue) return null;

  // formData 的值格式因字段类型而异
  switch (fieldType) {
    case 'TextField':
      // TextField: [{ value: "xxx" }] 或直接字符串
      return Array.isArray(rawValue) ? (rawValue[0]?.value || rawValue[0]) : rawValue;

    case 'NumberField':
      // NumberField: [{ value: "123.45" }] 或直接数字
      if (Array.isArray(rawValue)) {
        const v = rawValue[0]?.value || rawValue[0];
        return v !== undefined ? Number(v) : null;
      }
      return typeof rawValue === 'number' ? rawValue : Number(rawValue);

    case 'SelectField':
      // SelectField: [{ value: "选项", label: "选项" }]
      if (Array.isArray(rawValue)) return rawValue[0]?.label || rawValue[0]?.value || rawValue[0];
      return rawValue;

    case 'DateField':
      // DateField: [{ value: timestamp }] 或数字时间戳
      if (Array.isArray(rawValue)) {
        const ts = rawValue[0]?.value || rawValue[0];
        return ts ? new Date(Number(ts)).toISOString().split('T')[0] : null;
      }
      return rawValue;

    case 'AddressField':
      // AddressField: 复杂结构，直接返回原值（submitter.js 会处理格式）
      return rawValue;

    case 'EmployeeField':
      // EmployeeField: [{ value: userId, label: "姓名", ... }]
      // 【v3.7.2修复】从formData格式中提取userId字符串，供被填充字段自动填充使用
      if (Array.isArray(rawValue) && rawValue.length > 0) {
        // 取第一个成员的value（userId）
        return rawValue[0]?.value || rawValue[0]?.label || null;
      }
      // 如果已经是字符串（userId），直接返回
      if (typeof rawValue === 'string') return rawValue;
      return rawValue;

    default:
      // 其他类型保持原值
      return rawValue;
  }
}

/**
 * 通过表单UUID查找表单名称
 * @param {String} uuid - 表单UUID
 * @param {Array} allForms - 所有表单列表
 * @returns {String|null} 表单名称
 */
function uuidToName(uuid, allForms) {
  const f = allForms.find(f => f.uuid === uuid);
  return f ? f.name : null;
}

/**
 * 一键自动关联提交（v3.5.0 核心优化）
 *
 * 【解决的问题】之前 AI 需要 4 步手动编排才能完成带关联字段的提交：
 *   1. 提交基础表单 → 2. 查询 instanceId → 3. 填充关联字段 → 4. 提交依赖表单
 * 每步都要写内联 Node.js 脚本 + 调试 PowerShell 引号问题，导致 20+ 分钟耗时。
 *
 * 现在只需 1 步：调用本函数，关联字段直接传标题字符串，函数自动完成全流程。
 *
 * @param {string} projectDir - 项目目录
 * @param {Object} formDataMap - 表单数据映射 { 表单名称: [数据1, 数据2, ...] }
 *   关联字段（AssociationFormField）的值可以直接传标题字符串，函数自动查找 instanceId。
 *   例如: { "仓库名称": "武汉光谷电子仓" } 会自动转为 { instanceId: "FINST-xxx", title: "武汉光谷电子仓" }
 *   也支持手动传入完整对象: { "仓库名称": { instanceId: "FINST-xxx", title: "武汉光谷电子仓" } }
 * @param {Array<string>} formOrder - 表单提交顺序（依赖项在前）
 *   例如: ['仓库信息', '产品信息', '客户信息', '供应商信息', '库存信息', '采购订单', '销售订单']
 * @param {Object} [associationConfig] - 可选，手动指定关联字段映射关系。
 *   如果不传，函数会从 Schema 自动检测 AssociationFormField 及其目标表单 UUID。
 *   格式: { '表单名称': { '字段中文名': '目标表单名称' }, '表单名称.子表名': { '字段中文名': '目标表单名称' } }
 *   例如: { '库存信息': { '仓库名称': '仓库信息', '产品名称': '产品信息' },
 *           '采购订单': { '供应商': '供应商信息' },
 *           '采购订单.采购明细': { '选择产品': '产品信息' } }
 * @param {Object} [options] - 选项 { delay: 500, skipCountCheck: false, indexWaitMs: 2000, indexMaxRetries: 5, allowPartialFill: false }
 * @returns {Object} 批量提交结果（含自动填充的关联字段详情）
 *
 * @example
 * // AI 只需生成这样的数据（关联字段传标题字符串即可）:
 * const formDataMap = {
 *   "仓库信息": [
 *     { "仓库名称": "武汉光谷电子仓", "仓库地址": {...}, "状态": "启用", ... },
 *     { "仓库名称": "武汉沌口电子仓", "仓库地址": {...}, "状态": "启用", ... },
 *   ],
 *   "产品信息": [
 *     { "产品名称": "iPhone 15 Pro Max 256GB", "产品分类": "手机", ... },
 *   ],
 *   "库存信息": [
 *     // 关联字段直接传标题字符串，函数自动查找 instanceId
 *     { "仓库名称": "武汉光谷电子仓", "产品名称": "iPhone 15 Pro Max 256GB", "库存数量": 500, ... },
 *   ],
 *   "采购订单": [
 *     {
 *       "供应商": "武汉鑫源电子有限公司",  // 关联字段传标题字符串
 *       "采购明细": [
 *         { "选择产品": "iPhone 15 Pro Max 256GB", "采购数量": 10, ... },  // 子表内关联字段也支持
 *       ]
 *     },
 *   ],
 * };
 *
 * const formOrder = ['仓库信息', '产品信息', '供应商信息', '库存信息', '采购订单'];
 * const result = await submitAllWithAutoAssociations(projectDir, formDataMap, formOrder);
 * // result.autoFilledFields 记录了哪些字段被自动填充了 instanceId
 */
async function submitAllWithAutoAssociations(projectDir, formDataMap, formOrder, associationConfig = null, options = {}) {
  const { delay = 500, skipCountCheck = false, indexWaitMs = 2000, indexMaxRetries = 5, allowPartialFill = false } = options;
  const fs = require('fs');

  console.log('==============================================');
  console.log('宜搭一键自动关联提交（v3.7.2）');
  console.log('==============================================');

  const startTime = Date.now();

  // 0. 前置校验
  const validation = validateProjectConfig(projectDir);
  if (!validation.valid) {
    validation.errors.forEach(e => console.error(`❌ ${e}`));
    throw new Error('项目配置校验失败');
  }
  console.log(`✅ 配置校验通过（AppID: ${validation.appId}）`);

  // 1. 获取应用ID
  const configPath = path.join(projectDir, '系统配置清单.md');
  const appId = getAppId(configPath);
  if (!appId) throw new Error('无法获取应用ID');
  console.log(`📱 应用ID: ${appId}`);

  // 【v3.7.2】1.5 加载登录态，提取 userId 用于 EmployeeField 自动填充
  let userId = '';
  try {
    const cookieData = loadCookies();
    userId = cookieData.userId || '';
    if (userId) {
      console.log(`👤 当前用户ID: ${userId}（将自动填充EmployeeField）`);
    } else {
      console.log('  ⚠️ 未能获取用户ID，EmployeeField 字段将为空');
    }
  } catch (e) {
    console.log(`  ⚠️ 加载Cookie失败: ${e.message}，EmployeeField 字段将为空`);
  }

  // 2. 发现表单
  const allForms = discoverForms(projectDir);

  // 3. 从 Schema 自动检测关联字段映射（如果未手动提供）
  let assocMap = associationConfig; // { formName: { fieldLabel: targetFormName } }
  if (!assocMap) {
    console.log('🔍 自动检测关联字段...');
    assocMap = {};
    const uuidToNameMap = {};
    for (const f of allForms) {
      uuidToNameMap[f.uuid] = f.name;
    }

    for (const formName of formOrder) {
      const form = allForms.find(f => f.name === formName);
      if (!form) continue;

      const formDirName = form.dir.includes('/') ? form.dir.split('/').pop() : form.dir;
      const schemaPath = path.join(projectDir, form.dir, `${formDirName}.json`);
      if (!fs.existsSync(schemaPath)) continue;

      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const fieldMapping = extractFieldMapping(schema);

        // 检查关联字段（区分主表 vs 子表内）
        for (const [fieldLabel, info] of Object.entries(fieldMapping)) {
          if (info.componentName !== 'AssociationFormField' || !info.associationMeta || !info.associationMeta.formUuid) continue;
          const targetFormName = uuidToNameMap[info.associationMeta.formUuid];
          if (!targetFormName) continue;

          if (info.isSubformColumn) {
            // 子表内关联字段 → 放入 "表单名.子表名" 分组
            const parentLabel = fieldLabel.substring(0, fieldLabel.lastIndexOf('.'));
            const subTableKey = `${formName}.${parentLabel}`;
            if (!assocMap[subTableKey]) assocMap[subTableKey] = {};
            assocMap[subTableKey][fieldLabel.substring(fieldLabel.lastIndexOf('.') + 1)] = targetFormName;
          } else {
            // 主表关联字段 → 放入 "表单名" 分组
            if (!assocMap[formName]) assocMap[formName] = {};
            assocMap[formName][fieldLabel] = targetFormName;
          }
        }
      } catch (e) {
        console.log(`  ⚠️ 解析 ${formName} Schema 失败: ${e.message}`);
      }
    }
    console.log(`  ✅ 检测到 ${Object.keys(assocMap).length} 个表单/子表有关联字段`);
  }

  // 【v3.6.0】差集校验：formDataMap 中有但 formOrder 未列出的表单会被静默丢弃，必须显式告警
  const missingInOrder = Object.keys(formDataMap).filter(n => !formOrder.includes(n));
  if (missingInOrder.length > 0) {
    console.log(`⚠️ 以下表单在 formDataMap 中提供了数据，但未列入 formOrder，将被跳过: ${missingInOrder.join(', ')}`);
  }

  // 【v3.7.2】EmployeeField 自动填充：为所有表单中缺失的 EmployeeField 字段自动填充当前用户ID
  // 根因：AI通常不会为"创建人"、"负责人"等成员字段生成值（不知道userId），
  // 而宜搭API提交时不会像UI那样自动填充这些字段，导致成员字段为空。
  if (userId) {
    console.log('\n========== EmployeeField 自动填充 ==========');
    let empFillCount = 0;
    for (const formName of formOrder) {
      const form = allForms.find(f => f.name === formName);
      if (!form) continue;

      const formDirName = form.dir.includes('/') ? form.dir.split('/').pop() : form.dir;
      const schemaPath = path.join(projectDir, form.dir, formDirName + '.json');
      if (!fs.existsSync(schemaPath)) continue;

      let schema;
      try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); } catch (e) { continue; }

      const fieldMapping = extractFieldMapping(schema);

      // 找出所有 EmployeeField 字段
      const empFields = [];
      for (const [label, info] of Object.entries(fieldMapping)) {
        if (info.componentName === 'EmployeeField' && !info.isSubform && !info.isSubformColumn) {
          empFields.push({ label, fieldId: info.fieldId });
        }
      }

      if (empFields.length === 0) continue;

      const dataList = formDataMap[formName];
      if (!dataList) continue;

      for (const dataItem of dataList) {
        for (const empField of empFields) {
          // 只在AI未提供值时自动填充
          if (!dataItem[empField.label] || dataItem[empField.label] === '' || dataItem[empField.label] === null || dataItem[empField.label] === undefined) {
            dataItem[empField.label] = userId;
            empFillCount++;
            console.log(`  📝 ${formName}.${empField.label} ← userId:${userId}`);
          }
        }
      }

      // 处理子表内的 EmployeeField
      for (const [label, info] of Object.entries(fieldMapping)) {
        if (info.componentName === 'TableField' && info.isSubform) {
          const subTableLabel = label;
          const subColumns = Object.entries(fieldMapping).filter(([l, i]) =>
            i.isSubformColumn && i.parentFieldId === info.fieldId && i.componentName === 'EmployeeField'
          );
          if (subColumns.length === 0) continue;

          for (const dataItem of dataList) {
            const subRows = dataItem[subTableLabel];
            if (!Array.isArray(subRows)) continue;
            for (const row of subRows) {
              for (const [colLabel, colInfo] of subColumns) {
                const colName = colLabel.split('.').pop();
                if (!row[colName] || row[colName] === '' || row[colName] === null) {
                  row[colName] = userId;
                  empFillCount++;
                  console.log(`  📝 ${formName}.${subTableLabel}.${colName} ← userId:${userId}`);
                }
              }
            }
          }
        }
      }
    }
    if (empFillCount > 0) {
      console.log(`  ✅ 自动填充了 ${empFillCount} 个 EmployeeField`);
    } else {
      console.log('  ℹ️ 所有 EmployeeField 已有值，无需自动填充');
    }
  }

  // 【v3.7.3】DateField 自动填充：为所有表单中缺失的 DateField 字段自动填充当前时间戳
  // 根因：AI通常不会为"创建时间"等日期字段生成当前时间戳，
  // 而宜搭API提交时不会像UI那样自动填充日期字段。
  {
    console.log('\n========== DateField 自动填充 ==========');
    let dateFillCount = 0;
    const now = Date.now();
    for (const formName of formOrder) {
      const form = allForms.find(f => f.name === formName);
      if (!form) continue;

      const formDirName = form.dir.includes('/') ? form.dir.split('/').pop() : form.dir;
      const schemaPath = path.join(projectDir, form.dir, formDirName + '.json');
      if (!fs.existsSync(schemaPath)) continue;

      let schema;
      try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); } catch (e) { continue; }

      const fieldMapping = extractFieldMapping(schema);

      // 找出所有 DateField 字段
      const dateFields = [];
      for (const [label, info] of Object.entries(fieldMapping)) {
        if (info.componentName === 'DateField' && !info.isSubform && !info.isSubformColumn) {
          dateFields.push({ label, fieldId: info.fieldId });
        }
      }

      if (dateFields.length === 0) continue;

      const dataList = formDataMap[formName];
      if (!dataList) continue;

      for (const dataItem of dataList) {
        for (const dateField of dateFields) {
          // 只在AI未提供值时自动填充
          if (!dataItem[dateField.label] || dataItem[dateField.label] === '' || dataItem[dateField.label] === null || dataItem[dateField.label] === undefined) {
            dataItem[dateField.label] = now;
            dateFillCount++;
            console.log(`  📝 ${formName}.${dateField.label} ← ${new Date(now).toLocaleString('zh-CN')}`);
          }
        }
      }

      // 处理子表内的 DateField
      for (const [label, info] of Object.entries(fieldMapping)) {
        if (info.componentName === 'TableField' && info.isSubform) {
          const subTableLabel = label;
          const subDateColumns = Object.entries(fieldMapping).filter(([l, i]) =>
            i.isSubformColumn && i.parentFieldId === info.fieldId && i.componentName === 'DateField'
          );
          if (subDateColumns.length === 0) continue;

          for (const dataItem of dataList) {
            const subRows = dataItem[subTableLabel];
            if (!Array.isArray(subRows)) continue;
            for (const row of subRows) {
              for (const [colLabel, colInfo] of subDateColumns) {
                const colName = colLabel.split('.').pop();
                if (!row[colName] || row[colName] === '' || row[colName] === null) {
                  row[colName] = now;
                  dateFillCount++;
                  console.log(`  📝 ${formName}.${subTableLabel}.${colName} ← ${new Date(now).toLocaleString('zh-CN')}`);
                }
              }
            }
          }
        }
      }
    }
    if (dateFillCount > 0) {
      console.log(`  ✅ 自动填充了 ${dateFillCount} 个 DateField`);
    } else {
      console.log('  ℹ️ 所有 DateField 已有值，无需自动填充');
    }
  }

  // 4. 将表单分为"基础层"（无关联依赖）和"依赖层"（有关联依赖）
  // 关联目标表单必须在依赖表单之前提交
  const dependentFormNames = new Set(Object.keys(assocMap).filter(k => !k.includes('.')));
  const baseFormNames = formOrder.filter(n => !dependentFormNames.has(n));
  const depFormNames = formOrder.filter(n => dependentFormNames.has(n));

  console.log(`📋 基础表单: ${baseFormNames.join(', ') || '无'}`);
  console.log(`📋 依赖表单: ${depFormNames.join(', ') || '无'}`);

  const results = {
    totalForms: formOrder.length,
    successForms: 0,
    failedForms: 0,
    totalRecords: 0,
    successRecords: 0,
    failedRecords: 0,
    autoFilledFields: [],
    details: []
  };

  // 【v3.7.0】幂等性检查：跳过已有足够数据的基础表单
  console.log('\n========== 幂等性检查 ==========');
  const skippedBaseForms = [];
  for (const name of baseFormNames) {
    if (!formDataMap[name]) continue;
    const expectedCount = formDataMap[name].length;
    const form = allForms.find(f => f.name === name);
    if (!form) continue;
    try {
      const existingRecords = await searchFormDatas(appId, form.uuid);
      if (existingRecords.length >= expectedCount) {
        console.log(`  ⏭️ ${name}: 已有 ${existingRecords.length} 条数据，跳过提交（本次需 ${expectedCount} 条）`);
        skippedBaseForms.push(name);
        // 将已有数据也计入 instanceIdMaps 查询范围
        results.totalRecords += expectedCount;
        results.successRecords += expectedCount;
        results.successForms++;
        results.details.push({
          form: name, type: form.type || '普通表单', uuid: form.uuid,
          success: true, successCount: expectedCount, failedCount: 0, totalCount: expectedCount,
          afterCount: existingRecords.length, skipped: true
        });
      } else {
        console.log(`  ✅ ${name}: 已有 ${existingRecords.length} 条数据，需补充 ${expectedCount - existingRecords.length} 条`);
      }
    } catch (e) {
      console.log(`  ⚠️ ${name}: 查询已有数据失败 (${e.message})，将尝试提交`);
    }
  }

  // 5. 提交基础层表单（无关联依赖）
  const baseFormData = {};
  const actualBaseFormNames = baseFormNames.filter(n => !skippedBaseForms.includes(n));
  for (const name of actualBaseFormNames) {
    if (formDataMap[name]) baseFormData[name] = formDataMap[name];
  }

  if (Object.keys(baseFormData).length > 0) {
    console.log('\n========== 第一阶段：提交基础表单 ==========');
    const baseResult = await submitAllAIGeneratedData(projectDir, baseFormData, actualBaseFormNames, { delay, skipCountCheck: true });
    results.successForms += baseResult.successForms;
    results.failedForms += baseResult.failedForms;
    results.successRecords += baseResult.successRecords;
    results.failedRecords += baseResult.failedRecords;
    results.totalRecords += baseResult.totalRecords;
    results.details.push(...baseResult.details);

    if (baseResult.failedRecords > 0) {
      throw new Error(`基础表单有 ${baseResult.failedRecords}/${baseResult.totalRecords} 条提交失败，已中止依赖表单提交（避免产生无关联的孤立数据）。请先排查基础表单失败原因后重试。`);
    }
  }

  // 6. 查询基础表单数据的 instanceId 映射（【v3.6.0】等待搜索索引可见 + 轮询重试 + fail-fast）
  console.log('\n========== 查询 instanceId 映射 ==========');
  const instanceIdMaps = {}; // { formName: { title: instanceId } }

  // 收集所有关联目标表单名称
  const targetFormNames = new Set();
  for (const fields of Object.values(assocMap)) {
    for (const targetName of Object.values(fields)) {
      targetFormNames.add(targetName);
    }
  }

  // 每个目标表单预期至少可查到的记录数 = 本次基础阶段成功提交数（历史存量只会更多）
  const expectedCounts = {};
  for (const d of results.details) {
    if (d.form && d.successCount) expectedCounts[d.form] = d.successCount;
  }

  // 宜搭搜索索引为最终一致性，刚提交的数据可能延迟数秒才可搜。先显式等待再查询。
  if (Object.keys(baseFormData).length > 0 && targetFormNames.size > 0) {
    console.log(`  ⏳ 等待 ${indexWaitMs}ms 让宜搭搜索索引更新...`);
    await new Promise(r => setTimeout(r, indexWaitMs));
  }

  for (const targetName of targetFormNames) {
    const form = allForms.find(f => f.name === targetName);
    if (!form) {
      console.log(`  ⚠️ 未找到关联目标表单: ${targetName}`);
      continue;
    }
    const expected = expectedCounts[targetName] || 0;
    let records = [];
    let lastError = null;
    for (let attempt = 0; attempt <= indexMaxRetries; attempt++) {
      try {
        records = await searchFormDatas(appId, form.uuid);
        lastError = null;
      } catch (e) {
        lastError = e;
        records = [];
      }
      if (records.length >= expected) break;
      if (attempt < indexMaxRetries) {
        const waitMs = indexWaitMs * (attempt + 1);
        console.log(`  ⏳ ${targetName}: 查到 ${records.length}/${expected} 条，${waitMs}ms 后重试（第${attempt + 1}次）...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
    if (lastError) {
      throw new Error(`查询关联目标表单 ${targetName} 失败: ${lastError.message}。已中止，避免提交空关联数据。`);
    }
    if (records.length < expected) {
      throw new Error(`关联目标表单 ${targetName} 索引延迟超限：重试 ${indexMaxRetries} 次后仍仅查到 ${records.length}/${expected} 条。已中止，避免提交空关联数据。请稍后重试或增大 options.indexMaxRetries。`);
    }
    instanceIdMaps[targetName] = buildReverseTitleMap(records);
    console.log(`  ✅ ${targetName}: ${records.length} 条记录, ${Object.keys(instanceIdMaps[targetName]).length} 个映射`);
  }

  // 7. 自动填充依赖表单的关联字段
  console.log('\n========== 自动填充关联字段 ==========');
  let fillCount = 0;
  const unfilledFields = []; // 【v3.6.0】收集未匹配项，用于 fail-fast

  for (const formName of depFormNames) {
    const formAssoc = assocMap[formName] || {};
    const dataList = formDataMap[formName];
    if (!dataList) continue;

    for (const dataItem of dataList) {
      // 【v3.6.1】完整性检查：每条数据必须为其全部主表关联字段提供非空标题字符串，
      // 否则填充会静默跳过（标签与 schema 不匹配时 0 填充 0 告警的教训）
      for (const expectedLabel of Object.keys(formAssoc)) {
        const v = dataItem[expectedLabel];
        const isFilledObj = v && typeof v === 'object' && v.instanceId;
        if (!isFilledObj && (v === undefined || v === null || (typeof v === 'string' && v.trim() === ''))) {
          unfilledFields.push(`${formName}.${expectedLabel}=<数据缺失>`);
        }
      }

      // 填充主表关联字段
      for (const [fieldLabel, targetFormName] of Object.entries(formAssoc)) {
        const rawValue = dataItem[fieldLabel];
        if (rawValue && typeof rawValue === 'string') {
          // 值是标题字符串，自动查找 instanceId
          const map = instanceIdMaps[targetFormName] || {};
          let instId = map[rawValue];
          if (!instId) {
            // 【v3.6.0】模糊匹配降级（数据标题可能是组合格式，如 "手机--iPhone 15"）
            const fuzzyKey = Object.keys(map).find(k => k.includes(rawValue) || rawValue.includes(k));
            if (fuzzyKey) {
              instId = map[fuzzyKey];
              console.log(`  ℹ️ 模糊匹配: "${rawValue}" → "${fuzzyKey}"`);
            }
          }
          if (instId) {
            dataItem[fieldLabel] = { instanceId: instId, title: rawValue };
            fillCount++;
            results.autoFilledFields.push({ form: formName, field: fieldLabel, title: rawValue, instanceId: instId });
          } else {
            console.log(`  ⚠️ ${formName}.${fieldLabel}: 未找到 "${rawValue}" 在 ${targetFormName} 中的 instanceId`);
            unfilledFields.push(`${formName}.${fieldLabel}="${rawValue}"`);
          }
        }
        // 如果值已经是 {instanceId, title} 对象，跳过
      }

      // 填充子表内关联字段
      for (const [subTableKey, subFields] of Object.entries(assocMap)) {
        if (!subTableKey.includes('.')) continue; // 只处理子表
        const [parentForm, subTableName] = subTableKey.split('.');
        if (parentForm !== formName) continue;

        const subTableData = dataItem[subTableName];
        if (!Array.isArray(subTableData)) continue;

        for (const row of subTableData) {
          // 【v3.6.1】子表关联字段完整性检查
          for (const expectedLabel of Object.keys(subFields)) {
            const v = row[expectedLabel];
            const isFilledObj = v && typeof v === 'object' && v.instanceId;
            if (!isFilledObj && (v === undefined || v === null || (typeof v === 'string' && v.trim() === ''))) {
              unfilledFields.push(`${formName}.${subTableName}.${expectedLabel}=<数据缺失>`);
            }
          }
          for (const [fieldLabel, targetFormName] of Object.entries(subFields)) {
            const rawValue = row[fieldLabel];
            if (rawValue && typeof rawValue === 'string') {
              const map = instanceIdMaps[targetFormName] || {};
              let instId = map[rawValue];
              if (!instId) {
                // 【v3.6.0】模糊匹配降级
                const fuzzyKey = Object.keys(map).find(k => k.includes(rawValue) || rawValue.includes(k));
                if (fuzzyKey) {
                  instId = map[fuzzyKey];
                  console.log(`  ℹ️ 模糊匹配: "${rawValue}" → "${fuzzyKey}"`);
                }
              }
              if (instId) {
                row[fieldLabel] = { instanceId: instId, title: rawValue };
                fillCount++;
                results.autoFilledFields.push({ form: `${formName}.${subTableName}`, field: fieldLabel, title: rawValue, instanceId: instId });
              } else {
                console.log(`  ⚠️ ${formName}.${subTableName}.${fieldLabel}: 未找到 "${rawValue}" 在 ${targetFormName} 中的 instanceId`);
                unfilledFields.push(`${formName}.${subTableName}.${fieldLabel}="${rawValue}"`);
              }
            }
          }
        }
      }
    }
  }
  console.log(`  ✅ 自动填充了 ${fillCount} 个关联字段`);

  // 【v3.6.0】fail-fast：有关联字段未匹配到目标记录时，默认中止依赖表单提交，
  // 避免把"空关联"的假成功数据写入宜搭（这是 2026-07-24 混元三 40 分钟事故的根源）
  if (unfilledFields.length > 0 && !allowPartialFill) {
    throw new Error(
      `有 ${unfilledFields.length} 个关联字段未能匹配到目标记录，已中止依赖表单提交（避免提交空关联数据）：\n` +
      `  - ${unfilledFields.join('\n  - ')}\n` +
      `请检查标题字符串是否与目标表单的数据标题完全一致，或传 options.allowPartialFill=true 强制继续。`
    );
  }

  // 【v3.7.0】自动填充被填充字段：根据 dataFillingRules 从目标记录抄写值
  console.log('\n========== 自动填充被填充字段 ==========');
  console.log(`  🔍 依赖表单: ${depFormNames.join(', ')}`);
  let derivedFillCount = 0;

  for (const formName of depFormNames) {
    const form = allForms.find(f => f.name === formName);
    if (!form) { console.log(`  ⚠️ 未找到表单: ${formName}`); continue; }
    console.log(`  🔍 处理表单: ${formName}, dir: ${form.dir}`);

    // 读取当前表单的 Schema，提取字段映射和填充规则
    const formDirName = form.dir.includes('/') ? form.dir.split('/').pop() : form.dir;
    const schemaPath = path.join(projectDir, form.dir, formDirName + '.json');
    console.log(`  🔍 schemaPath: ${schemaPath}, exists: ${fs.existsSync(schemaPath)}`);
    if (!fs.existsSync(schemaPath)) continue;

    let schema;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    } catch (e) { continue; }

    const fieldMapping = extractFieldMapping(schema);
    // fieldMapping: { fieldLabel: { fieldId, componentName, ... } }

    // 从 Schema 中提取所有关联字段及其 dataFillingRules
    const associationFields = [];
    for (const comp of schema.componentsTree) {
      if (comp.componentName === 'AssociationFormField' && comp.props && comp.props.dataFillingRules) {
        const mainRules = comp.props.dataFillingRules.mainRules || [];
        if (mainRules.length > 0) {
          associationFields.push({
            fieldId: comp.props.fieldId || comp.id,
            mainRules: mainRules,
            targetFormUuid: comp.props.associationForm?.formUuid
          });
        }
      }
    }

    if (associationFields.length === 0) { console.log(`  ⚠️ 无关联字段有填充规则`); continue; }
    console.log(`  🔍 找到 ${associationFields.length} 个关联字段有填充规则`);

    // 构建 fieldId → fieldLabel 的反向映射
    const fieldIdToLabel = {};
    for (const [label, info] of Object.entries(fieldMapping)) {
      if (!info.isSubformColumn) { // 只处理主表字段
        fieldIdToLabel[info.fieldId] = label;
      }
    }

    const dataList = formDataMap[formName];
    if (!dataList) continue;

    for (const dataItem of dataList) {
      for (const assocField of associationFields) {
        // 找到关联字段的 label
        const assocLabel = fieldIdToLabel[assocField.fieldId];
        if (!assocLabel) { console.log(`  ⚠️ fieldId ${assocField.fieldId} 无label映射`); continue; }

        // 获取关联字段的值（已被填充为 {instanceId, title}）
        const assocValue = dataItem[assocLabel];
        console.log(`  🔍 关联字段: ${assocLabel}, value type: ${typeof assocValue}, isArray: ${Array.isArray(assocValue)}`);
        if (!assocValue || !assocValue.instanceId) { console.log(`  ⚠️ ${assocLabel} 无instanceId, value: ${JSON.stringify(assocValue)?.substring(0, 100)}`); continue; }

        // 找到目标表单名称和记录
        const targetName = uuidToName(assocField.targetFormUuid, allForms);
        if (!targetName) { console.log(`  ⚠️ targetFormUuid ${assocField.targetFormUuid} 无对应表单名`); continue; }

        const targetForm = allForms.find(f => f.name === targetName);
        if (!targetForm) { console.log(`  ⚠️ 目标表单 ${targetName} 未在allForms中找到`); continue; }

        let targetRecords;
        try {
          targetRecords = await searchFormDatas(appId, targetForm.uuid);
        } catch (e) {
          console.log(`  ⚠️ 查询目标表单 ${targetName} 失败: ${e.message}`);
          continue;
        }

        // 【v3.7.1修复】用 formInstId 匹配（buildReverseTitleMap 返回的值是 formInstId，
        // 而普通表单记录的 r.instanceId 可能为空或不等于 formInstId）
        const targetRecord = targetRecords.find(r =>
          r.formInstId === assocValue.instanceId || r.instanceId === assocValue.instanceId
        );
        if (!targetRecord || !targetRecord.formData) {
          console.log(`  ⚠️ 未找到目标记录 formInstId/instanceId=${assocValue.instanceId}, records=${targetRecords.length}`);
          continue;
        }

        // 逐条填充规则抄写
        for (const rule of assocField.mainRules) {
          const targetLabel = fieldIdToLabel[rule.target]; // 被填充字段的中文名
          if (!targetLabel) { console.log(`  ⚠️ rule.target ${rule.target} 无label映射`); continue; }

          // 从目标记录的 formData 中读取源字段值
          const sourceValue = targetRecord.formData[rule.source];
          if (!sourceValue) continue;

          // 根据 sourceType 决定如何提取值
          let fillValue = extractFieldValue(sourceValue, rule.sourceType);
          if (fillValue !== null && fillValue !== undefined) {
            dataItem[targetLabel] = fillValue;
            derivedFillCount++;
            console.log(`  📝 ${formName}.${targetLabel} ← ${targetName} (规则: ${rule.source}→${rule.target})`);
          }
        }
      }
    }
  }

  if (derivedFillCount > 0) {
    console.log(`  ✅ 自动填充了 ${derivedFillCount} 个被填充字段`);
  } else {
    console.log('  ℹ️ 无需填充被填充字段');
  }

  // 【v3.7.1】8. 依赖表单幂等性检查：跳过已有足够数据的依赖表单
  console.log('\n========== 依赖表单幂等性检查 ==========');
  const skippedDepForms = [];
  for (const name of depFormNames) {
    if (!formDataMap[name]) continue;
    const expectedCount = formDataMap[name].length;
    const form = allForms.find(f => f.name === name);
    if (!form) continue;
    try {
      const existingRecords = await searchFormDatas(appId, form.uuid);
      if (existingRecords.length >= expectedCount) {
        console.log(`  ⏭️ ${name}: 已有 ${existingRecords.length} 条数据，跳过提交（本次需 ${expectedCount} 条）`);
        skippedDepForms.push(name);
        results.totalRecords += expectedCount;
        results.successRecords += expectedCount;
        results.successForms++;
        results.details.push({
          form: name, type: form.type || '普通表单', uuid: form.uuid,
          success: true, successCount: expectedCount, failedCount: 0, totalCount: expectedCount,
          afterCount: existingRecords.length, skipped: true
        });
      } else {
        console.log(`  ✅ ${name}: 已有 ${existingRecords.length} 条数据，需补充 ${expectedCount - existingRecords.length} 条`);
      }
    } catch (e) {
      console.log(`  ⚠️ ${name}: 查询已有数据失败 (${e.message})，将尝试提交`);
    }
  }

  // 9. 提交依赖层表单（跳过已有足够数据的）
  const depFormData = {};
  const actualDepFormNames = depFormNames.filter(n => !skippedDepForms.includes(n));
  for (const name of actualDepFormNames) {
    if (formDataMap[name]) depFormData[name] = formDataMap[name];
  }

  if (Object.keys(depFormData).length > 0) {
    console.log('\n========== 第二阶段：提交依赖表单 ==========');
    const depResult = await submitAllAIGeneratedData(projectDir, depFormData, actualDepFormNames, { delay, skipCountCheck: true });
    results.successForms += depResult.successForms;
    results.failedForms += depResult.failedForms;
    results.successRecords += depResult.successRecords;
    results.failedRecords += depResult.failedRecords;
    results.totalRecords += depResult.totalRecords;
    results.details.push(...depResult.details);
  }

  // 9. 输出统计
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n==============================================`);
  console.log(`一键自动关联提交完成！耗时 ${elapsed}s`);
  console.log(`表单: ${results.successForms}/${results.totalForms} 成功`);
  console.log(`数据: ${results.successRecords}/${results.totalRecords} 成功`);
  console.log(`关联字段自动填充: ${fillCount} 个`);
  if (results.failedRecords > 0) {
    console.log(`失败: ${results.failedRecords}条`);
  }
  console.log('==============================================');

  results.elapsedSeconds = parseFloat(elapsed);
  return results;
}

module.exports = {
  submitMultipleForms,
  addTestDataToAllForms,
  addTestDataToForms,
  submitAIGeneratedData,
  submitAllAIGeneratedData,
  // v3.5.0新增：一键自动关联提交
  submitAllWithAutoAssociations,
  // v3.7.0新增：从formData中提取字段值（用于自动填充被填充字段）
  extractFieldValue,
  // v3.2.0新增：关联表单场景标准函数（从submitter.js透传）
  searchFormDatas,
  buildTitleMap,
  loadLabelMap,
  parseInstValue,
  verifyAssociationField,
  // v3.4.0新增：反向映射 + 按title查找记录（解决buildTitleMap方向易误用问题）
  buildReverseTitleMap,
  findRecordByTitle,
  // v3.3.0新增：流程表单支持（从submitter.js透传）
  getFormMeta,
  startInstance,
  verifyProcessInstance,
  // v3.6.0新增：删除能力（数据异常时的官方修复手段，严禁 AI 手写删除脚本）
  deleteFormData,
  deleteInstance,
  clearFormData
};
