#!/usr/bin/env node
/**
 * form_manager.js - 宜搭表单管理模块
 * 版本: 1.6.1
 * 更新日期: 2026-05-17
 *
 * 更新内容:
 * - v1.6.1: 【重要修复】创建流程表单时返回processCode
 *           createEmptyForm函数现在返回{formUuid, processCode}而不是只返回formUuid
 *           createForm函数返回结果中包含processCode字段
 *           确保新建应用时流程Code能正确传递到同步脚本
 *
 * 历史版本:
 * - v1.6.0: 【重大更新】权限设置改用saveOrUpdatePermit API
 *           新增listPermitGroups函数查询权限组
 *           PERMISSION_ACTIONS扩展支持更多操作权限
 *           修复之前通过updateFormSettings设置权限不生效的问题
 *
 * 历史版本:
 * - v1.5.0: 修复setCustomTitle函数API路径缺少_api和_mock参数的问题
 *           添加_locale_time_zone_offset参数，参数顺序与宜搭实际请求一致
 *
 * 历史版本:
 * - v1.4.0: 【重要修复】检测到同名表单时跳过创建，而不是删除后重新创建
 *          解决了字段ID不断变化的根本原因
 *          正确流程：创建一次 → 同步回来 → 以宜搭为准
 *
 * 历史版本:
 * - v1.3.0: 新增 getAppForms、deleteForm 函数，创建前检查同名表单
 *
 * 功能: 创建和管理宜搭表单页面，支持集成自动化API
 */

const fs = require("fs");
const path = require("path");
const querystring = require("querystring");

const {
  loadCookieData,
  triggerLogin,
  resolveBaseUrl,
  resolveCorpId,
  postRequest,
  requestWithAutoLogin,
  buildApiPath
} = require("./api_client");

const { buildFormSchema, i18n } = require("./schema_builder");

// ==================== i18n JSON 构建 ====================

function buildI18nJson(text) {
  return JSON.stringify({
    pureEn_US: text, en_US: text, zh_CN: text,
    envLocale: null, type: "i18n", ja_JP: null, key: null
  });
}

// ==================== 表单查询 ====================

/**
 * 获取应用下的所有表单列表
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @returns {Promise<Array>} 表单列表 [{formUuid, title, formType}]
 */
async function getAppForms(authRef, appType) {
  console.error(`\n📋 获取应用表单列表...`);

  const { getRequest } = require('./api_client');

  const result = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/app/form/list.json`,
      {
        _csrf_token: auth.csrfToken,
        pageSize: 100,
        pageIndex: 1
      },
      auth.cookies
    );
  }, authRef);

  if (!result?.success) {
    console.error(`  ⚠️ 获取表单列表失败: ${result?.errorMsg || '未知错误'}`);
    return [];
  }

  const forms = result.content?.data || result.content || result.data || [];
  console.error(`  ✅ 获取到 ${forms.length} 个表单`);
  return forms;
}

/**
 * 删除表单
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formUuid - 表单UUID
 * @returns {Promise<boolean>}
 */
async function deleteForm(authRef, appType, formUuid) {
  console.error(`\n🗑️  删除表单: ${formUuid}...`);

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/app/form/delete.json`,
      {
        _csrf_token: auth.csrfToken,
        formUuid: formUuid
      },
      auth.cookies
    );
  }, authRef);

  if (!result?.success) {
    console.error(`  ⚠️ 删除表单失败: ${result?.errorMsg || '未知错误'}`);
    return false;
  }

  console.error(`  ✅ 表单已删除`);
  return true;
}

// ==================== 表单创建 ====================

/**
 * 步骤1: 创建空白表单
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formTitle - 表单标题
 * @param {string} formType - 表单类型: receipt(普通表单) 或 process(流程表单)
 * @returns {Promise<Object>} { formUuid, processCode }
 */
async function createEmptyForm(authRef, appType, formTitle, formType = "receipt") {
  console.error("\n📄 Step 1: 创建空白表单...");
  console.error(`  表单类型: ${formType === "process" ? "流程表单" : "普通表单"}`);

  const params = {
    formType: formType,
    title: buildI18nJson(formTitle)
  };

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      buildApiPath(appType, "saveFormSchemaInfo"),
      { ...params, _csrf_token: auth.csrfToken },
      auth.cookies
    );
  }, authRef);

  if (!result?.success || !result.content) {
    const errorMsg = result?.errorMsg || "创建空白表单失败";
    throw new Error(errorMsg);
  }

  const formUuid = result.content.formUuid || result.content;
  const processCode = result.content.processCode || null;
  console.error(`  ✅ 空白表单已创建: ${formUuid}`);
  if (processCode) {
    console.error(`  📎 流程Code: ${processCode}`);
  }
  return { formUuid, processCode };
}

/**
 * 步骤2: 保存表单Schema
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formUuid - 表单UUID
 * @param {Object} schema - 表单Schema
 * @returns {Promise<Object>}
 *
 * ⚠️【安全警告】此函数仅允许对新建的表单调用，严禁对已有表单调用！
 * 对已有应用的表单字段内容（公式、代码、字段增删改）的修改，只能通过用户手动复制粘贴到宜搭平台。
 * 详见全局规则第25条。
 */
async function saveFormSchema(authRef, appType, formUuid, schema) {
  console.error("\n📝 Step 2: 保存表单Schema...");

  const params = {
    _csrf_token: authRef.csrfToken,
    appType: appType,
    formUuid: formUuid,
    content: JSON.stringify(schema),
    schemaVersion: "V5",
    prefix: "_view"
  };

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      buildApiPath(appType, "saveFormSchema", { prefix: "_view" }),
      params,
      auth.cookies,
      `${auth.baseUrl}/alibaba/web/${appType}/design/pageDesigner?formUuid=${formUuid}`
    );
  }, authRef);

  if (!result?.success) {
    const errorMsg = result?.errorMsg || "保存Schema失败";
    throw new Error(errorMsg);
  }

  console.error("  ✅ Schema保存成功");
  return result;
}

// ==================== 通用表单设置 API ====================

const FORM_SETTING_DEFS = {
  customTitle: { type: 'string', desc: '自定义数据标题开关', values: ['y', 'n'] },
  displayTitle: { type: 'string', desc: '数据标题公式' },
  reStart: { type: 'string', desc: '复制流程开关', values: ['y', 'n'] },
  showPrint: { type: 'string', desc: '显示打印按钮', values: ['y', 'n'] },
  showDetail: { type: 'string', desc: '显示详情', values: ['y', 'n'] },
  showCopyData: { type: 'string', desc: '显示复制数据', values: ['y', 'n'] },
  showNav: { type: 'string', desc: '显示导航', values: ['y', 'n'] },
  showAgent: { type: 'string', desc: '显示代理人', values: ['y', 'n'] },
  showDingGroup: { type: 'string', desc: '显示钉钉群', values: ['y', 'n'] },
  isEncrypt: { type: 'string', desc: '加密', values: ['y', 'n'] },
  serialSwitch: { type: 'string', desc: '流水号开关', values: ['y', 'n'] },
  defaultManager: { type: 'string', desc: '默认管理员', values: ['y', 'n'] },
  pushTask: { type: 'string', desc: '推送任务', values: ['y', 'n'] },
  previewConfig: { type: 'string', desc: '预览配置', values: ['y', 'n'] },
  formulaType: { type: 'string', desc: '公式类型', values: ['y', 'n'] },
  submissionRule: { type: 'string', desc: '提交规则', values: ['RESUBMIT', 'NORESUBMIT'] },
  pageType: { type: 'string', desc: '页面类型' },
  isInner: { type: 'string', desc: '内部表单', values: ['y', 'n'] },
  isAgent: { type: 'string', desc: '代理人', values: ['y', 'n'] },
  detailTheme: { type: 'string', desc: '详情主题' },
  isRenderNav: { type: 'string', desc: '渲染导航', values: ['true', 'false'] },
  defaultOrder: { type: 'string', desc: '默认排序' },
  consultPerson: { type: 'string', desc: '咨询人' },
  redirectConfig: { type: 'string', desc: '重定向配置' },
  relateUuid: { type: 'string', desc: '关联UUID' },
  manageCustomActionInfo: { type: 'string', desc: '查看状态操作权限(JSON)' },
  manageCustomConfigInfo: { type: 'string', desc: '自定义配置信息' }
};

const PERMISSION_ACTIONS = {
  OPERATE_EDIT_AFTER_PROCESS: { name: '编辑', desc: '查看状态下允许编辑' },
  OPERATE_DELETE_AFTER_PROCESS: { name: '删除', desc: '查看状态下允许删除' },
  OPERATE_PRINT_AFTER_PROCESS: { name: '打印', desc: '查看状态下允许打印' },
  OPERATE_VIEW: { name: '查看', desc: '查看状态下允许查看' },
  OPERATE_HISTORY: { name: '变更记录', desc: '查看状态下允许查看变更记录' },
  OPERATE_COMMENT: { name: '评论', desc: '查看状态下允许评论' },
  OPERATE_PRINT: { name: '打印', desc: '查看状态下允许打印(详情页)' },
  OPERATE_BATCH_CREATE: { name: '批量发起', desc: '批量发起' },
  OPERATE_BATCH_EXPORT: { name: '批量导出', desc: '批量导出' },
  OPERATE_BATCH_EDIT: { name: '批量修改', desc: '批量修改' },
  OPERATE_BATCH_DELETE: { name: '批量删除', desc: '批量删除' },
  OPERATE_BATCH_PRINT: { name: '批量打印', desc: '批量打印' },
  OPERATE_BATCH_DOWNLOAD: { name: '批量下载文件', desc: '批量下载文件' },
  OPERATE_BATCH_DOWNLOAD_QRCODE: { name: '批量下载二维码', desc: '批量下载二维码' },
  RESUBMIT_TRIGGER_RULE: { name: '触发规则', desc: '触发规则' }
};

async function listPermitGroups(authRef, appType, formUuid, packageType = 'FORM_PACKAGE_VIEW') {
  console.error(`\n📋 查询权限组列表...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   表单UUID: ${formUuid}`);
  console.error(`   类型: ${packageType}`);

  const { getRequest, requestWithAutoLogin } = require('./api_client');

  const result = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/permission/manage/listPermitPackages.json`,
      {
        _csrf_token: auth.csrfToken,
        _locale_time_zone_offset: '28800000',
        formUuid: formUuid,
        packageName: '',
        packageType: packageType,
        pageIndex: 1,
        pageSize: 20,
        appType: appType
      },
      auth.cookies
    );
  }, authRef);

  if (!result?.success || !result.content?.formPermit) {
    console.error(`  ⚠️ 查询权限组失败: ${result?.errorMsg || '未知错误'}`);
    return [];
  }

  const permits = result.content.formPermit;
  console.error(`  ✅ 找到 ${permits.length} 个权限组`);
  return permits;
}

async function setFormPermission(authRef, appType, formUuid, actionCode, enable, options = {}) {
  console.error(`\n🔄 设置表单查看状态权限...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   表单UUID: ${formUuid}`);
  console.error(`   权限: ${actionCode} → ${enable ? '开启' : '关闭'}`);

  if (!PERMISSION_ACTIONS[actionCode]) {
    console.error(`  ❌ 未知权限代码: ${actionCode}`);
    console.error(`  可用权限: ${Object.keys(PERMISSION_ACTIONS).join(', ')}`);
    return null;
  }

  const packageType = options.packageType || 'FORM_PACKAGE_VIEW';
  const packageUuid = options.packageUuid || null;
  const packageIndex = options.packageIndex || 0;

  const permits = await listPermitGroups(authRef, appType, formUuid, packageType);
  if (permits.length === 0) {
    console.error('  ❌ 未找到权限组');
    return null;
  }

  let targetPermit = null;
  if (packageUuid) {
    targetPermit = permits.find(p => p.packageUuid === packageUuid);
  } else {
    targetPermit = permits[packageIndex];
  }

  if (!targetPermit) {
    console.error(`  ❌ 未找到目标权限组 (index=${packageIndex}, uuid=${packageUuid})`);
    return null;
  }

  const permitName = targetPermit.packageName?.zh_CN || '未命名';
  console.error(`  目标权限组: ${permitName} (${targetPermit.packageUuid})`);

  const operatePermit = JSON.parse(targetPermit.operatePermit || '{}');
  const oldValue = operatePermit[actionCode];
  operatePermit[actionCode] = enable ? 'y' : 'n';
  console.error(`  ${actionCode}: ${oldValue} → ${operatePermit[actionCode]}`);

  const { postRequest, requestWithAutoLogin: retryLogin } = require('./api_client');

  const apiPath = `/${appType}/permission/manage/saveOrUpdatePermit.json?_api=Permission.saveOrUpdatePermitGroup&_mock=false&_stamp=${Date.now()}`;

  const params = {
    _csrf_token: authRef.csrfToken,
    _locale_time_zone_offset: '28800000',
    formUuid: formUuid,
    packageType: packageType,
    packageName: JSON.stringify(targetPermit.packageName),
    description: JSON.stringify(targetPermit.description),
    roleData: JSON.stringify(targetPermit.roleMembers ? { include: targetPermit.roleMembers } : { include: [{ label: '默认', roleType: 'DEFAULT', roleValue: [{ ext: '', key: 'ALL', label: '默认' }] }] }),
    dataPermit: targetPermit.dataPermit || '{}',
    operatePermit: JSON.stringify(operatePermit),
    customButtonPermit: targetPermit.customButtonPermit || '[]',
    fieldPermit: targetPermit.fieldPermit || '{"fieldRange":"FORM"}',
    packageUuid: targetPermit.packageUuid,
    viewData: targetPermit.viewData || '{"all":"y","viewUuids":[]}'
  };

  const result = await retryLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      apiPath,
      { ...params, _csrf_token: auth.csrfToken },
      auth.cookies,
      `${auth.baseUrl}/alibaba/web/${appType}/design/pageDesigner?formUuid=${formUuid}`
    );
  }, authRef);

  if (result?.success) {
    console.error(`  ✅ 权限设置成功: ${PERMISSION_ACTIONS[actionCode].desc}已${enable ? '开启' : '关闭'}`);
  } else {
    console.error(`  ❌ 权限设置失败: ${result?.errorMsg || '未知错误'}`);
    if (result) console.error(`  完整响应: ${JSON.stringify(result).substring(0, 500)}`);
  }

  return result;
}

async function updateFormSettings(authRef, appType, formUuid, settings) {
  console.error(`\n🔄 更新表单设置...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   表单UUID: ${formUuid}`);
  console.error(`   修改项: ${Object.keys(settings).join(', ')}`);
  
  const { postRequest, requestWithAutoLogin } = require('./api_client');
  
  const schema = await getFormSchema(authRef, appType, formUuid);
  if (!schema) {
    console.error('  ❌ 无法获取表单Schema');
    return null;
  }
  
  const apiPath = `/dingtalk/web/${appType}/query/formdesign/updateFormSchemaInfo.json?_api=Form.updateFormSchemaInfo&_mock=false&_stamp=${Date.now()}`;
  
  const params = {
    _csrf_token: authRef.csrfToken,
    _locale_time_zone_offset: '28800000',
    serialSwitch: 'n',
    consultPerson: '',
    defaultManager: 'n',
    submissionRule: 'RESUBMIT',
    redirectConfig: '',
    pushTask: 'y',
    defaultOrder: 'cd',
    showPrint: 'y',
    formUuid: formUuid,
    relateUuid: '',
    title: schema.title ? JSON.stringify(schema.title) : '',
    pageType: 'web,mobile',
    showNav: 'y',
    isInner: 'y',
    isNew: 'n',
    showDetail: 'y',
    isAgent: 'y',
    showAgent: 'n',
    showDingGroup: 'y',
    showCopyData: 'y',
    reStart: 'n',
    previewConfig: 'y',
    isEncrypt: 'n',
    formulaType: 'n',
    displayTitle: '',
    customTitle: 'n',
    detailTheme: 'theme',
    isRenderNav: 'true',
    manageCustomActionInfo: '[]',
    manageCustomConfigInfo: 'null'
  };
  
  for (const [key, value] of Object.entries(settings)) {
    if (FORM_SETTING_DEFS[key]) {
      params[key] = value;
      console.error(`   → ${key}: ${value} (${FORM_SETTING_DEFS[key].desc})`);
    } else {
      console.error(`   ⚠️ 未知配置项: ${key}，跳过`);
    }
  }
  
  if (settings.customTitle === 'y' && settings.displayTitle) {
    params.customTitle = 'y';
  }
  
  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      apiPath,
      { ...params, _csrf_token: auth.csrfToken },
      auth.cookies,
      `${auth.baseUrl}/alibaba/web/${appType}/design/pageDesigner?formUuid=${formUuid}`
    );
  }, authRef);
  
  if (result?.success) {
    console.error(`  ✅ 表单设置更新成功`);
  } else {
    console.error(`  ❌ 表单设置更新失败: ${result?.errorMsg || '未知错误'}`);
    if (result) console.error(`  完整响应: ${JSON.stringify(result).substring(0, 500)}`);
  }
  
  return result;
}

async function getFormSettings(authRef, appType, formUuid) {
  console.error(`\n📋 获取表单设置...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   表单UUID: ${formUuid}`);
  
  const schema = await getFormSchema(authRef, appType, formUuid);
  if (!schema) {
    console.error('  ❌ 无法获取表单Schema');
    return null;
  }
  
  const settings = {};
  for (const [key, def] of Object.entries(FORM_SETTING_DEFS)) {
    if (schema[key] !== undefined) {
      settings[key] = schema[key];
    }
  }
  
  console.error(`  ✅ 获取成功`);
  return settings;
}

/**
 * 步骤3: 更新表单配置
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formUuid - 表单UUID
 * @param {number} version - 版本号
 * @returns {Promise<Object>}
 */
async function updateFormConfig(authRef, appType, formUuid, version = 1) {
  console.error("\n⚙️  Step 3: 更新表单配置...");

  const params = {
    _csrf_token: authRef.csrfToken,
    formUuid: formUuid,
    version: version,
    configType: "MINI_RESOURCE",
    value: 0
  };

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/formdesign/updateFormConfig.json`,
      params,
      auth.cookies
    );
  }, authRef);

  if (!result?.success) {
    const errorMsg = result?.errorMsg || "更新表单配置失败";
    throw new Error(errorMsg);
  }

  console.error("  ✅ 表单配置更新成功");
  return result;
}

/**
 * 创建宜搭表单
 * @param {Object} options - 创建选项
 * @param {string} options.appType - 应用ID（必填）
 * @param {string} options.title - 表单标题（必填）
 * @param {Array} options.fields - 字段定义数组（必填）
 * @param {string} options.formType - 表单类型: receipt(普通表单) 或 process(流程表单)（可选，默认receipt）
 * @param {Object} options.auth - 登录态（可选，自动读取）
 * @returns {Promise<Object>}
 */
async function createForm(options) {
  const {
    appType,
    title,
    fields,
    formType = "receipt",
    auth = null,
    skipExistingCheck = false
  } = options;

  if (!appType) throw new Error("应用ID(appType)不能为空");
  if (!title) throw new Error("表单标题不能为空");
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    throw new Error("字段定义不能为空");
  }

  console.error("=".repeat(50));
  console.error("  宜搭表单创建工具");
  console.error("=".repeat(50));
  console.error(`\n  应用ID: ${appType}`);
  console.error(`  表单名称: ${title}`);
  console.error(`  字段数量: ${fields.length}`);

  // 获取登录态
  console.error("\n🔑 检查登录态...");
  let cookieData = auth || loadCookieData();
  if (!cookieData) {
    console.error("  ⚠️  未找到登录态，需要登录");
    cookieData = triggerLogin();
  }

  const authRef = {
    cookieData,
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    corpId: resolveCorpId(cookieData)
  };

  console.error(`  ✅ 登录态就绪 (${authRef.baseUrl})`);
  if (authRef.corpId) {
    console.error(`  ✅ corpId: ${authRef.corpId}`);
  }

  // 【v1.4.0修改】检查是否已存在同名表单 - 跳过而不是删除
  if (!skipExistingCheck) {
    console.error("\n🔍 检查是否已存在同名表单...");
    try {
      const existingForms = await getAppForms(authRef, appType);
      const existingForm = existingForms.find(f => f.title === title);
      if (existingForm) {
        console.error(`  ✅ 表单 "${title}" 已存在，跳过创建`);
        console.error(`     现有表单UUID: ${existingForm.formUuid}`);
        return existingForm;
      } else {
        console.error(`  ✅ 未找到同名表单，继续创建`);
      }
    } catch (e) {
      console.error(`  ⚠️  检查表单列表失败: ${e.message}，继续创建`);
    }
  }

  // 步骤1: 创建空白表单
  let formUuid = null;
  let processCode = null;
  try {
    const emptyFormResult = await createEmptyForm(authRef, appType, title, formType);
    formUuid = emptyFormResult.formUuid;
    processCode = emptyFormResult.processCode;
  } catch (error) {
    console.error(`\n❌ 创建空白表单失败: ${error.message}`);
    throw error;
  }

  // 步骤2: 构建并保存Schema
  try {
    const schema = buildFormSchema(title, fields, formUuid);
    await saveFormSchema(authRef, appType, formUuid, schema);
  } catch (error) {
    console.error(`\n❌ 保存Schema失败: ${error.message}`);
    // 【v1.3.0新增】失败时自动删除空白表单
    console.error("🗑️  正在清理已创建的空白表单...");
    try {
      await deleteForm(authRef, appType, formUuid);
    } catch (deleteError) {
      console.error(`  ⚠️  自动删除失败: ${deleteError.message}`);
    }
    throw error;
  }

  // 步骤3: 更新表单配置
  try {
    await updateFormConfig(authRef, appType, formUuid, 1);
  } catch (error) {
    console.error(`\n❌ 更新表单配置失败: ${error.message}`);
    // 配置更新失败不影响表单使用，不删除表单
    console.error("  ⚠️  表单已创建但配置更新失败，可手动在宜搭平台调整");
  }

  // 输出结果
  const formUrl = `${authRef.baseUrl}/${appType}/workbench/${formUuid}`;

  console.error("\n" + "=".repeat(50));
  console.error("  ✅ 表单创建成功！");
  console.error(`  formUuid: ${formUuid}`);
  if (processCode) {
    console.error(`  processCode: ${processCode}`);
  }
  console.error(`  访问地址: ${formUrl}`);
  console.error("=".repeat(50));

  return {
    success: true,
    formUuid,
    processCode,
    formTitle: title,
    appType,
    fieldCount: fields.length,
    baseUrl: authRef.baseUrl,
    url: formUrl
  };
}

/**
 * 从JSON文件创建表单
 * @param {string} appType - 应用ID
 * @param {string} formTitle - 表单标题
 * @param {string} fieldsJsonFile - 字段定义JSON文件路径
 * @param {string} formType - 表单类型: receipt(普通表单) 或 process(流程表单)（可选，默认receipt）
 * @returns {Promise<Object>}
 */
async function createFormFromFile(appType, formTitle, fieldsJsonFile, formType = "receipt") {
  const resolvedPath = path.resolve(fieldsJsonFile);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`字段定义文件不存在: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const fields = JSON.parse(content);

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("字段定义必须是非空数组");
  }

  return createForm({ appType, title: formTitle, fields, formType });
}

// ==================== 命令行入口 ====================

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error("用法: node form_manager.js <appType> <formTitle> <fieldsJsonFile> [formType]");
    console.error('示例: node form_manager.js "APP_XXX" "员工信息表" "fields.json"');
    console.error('示例: node form_manager.js "APP_XXX" "审批流程" "fields.json" "process"');
    console.error("\n参数说明:");
    console.error("  formType: receipt(普通表单,默认) 或 process(流程表单)");
    console.error("\n字段定义JSON格式示例:");
    console.error(JSON.stringify([
      { type: "TextField", label: "姓名", required: true },
      { type: "NumberField", label: "年龄" },
      { type: "SelectField", label: "部门", options: ["技术部", "产品部"] },
      { type: "DateField", label: "入职日期" },
      { type: "TableField", label: "订单明细", children: [
        { type: "TextField", label: "商品名称" },
        { type: "NumberField", label: "数量" }
      ]}
    ], null, 2));
    process.exit(1);
  }

  const [appType, formTitle, fieldsJsonFile, formType = "receipt"] = args;

  createFormFromFile(appType, formTitle, fieldsJsonFile, formType)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error(`\n❌ 错误: ${error.message}`);
      process.exit(1);
    });
}

// 如果是直接运行
if (require.main === module) {
  main();
}

// ==================== 查询表单Schema ====================

/**
 * 查询表单Schema
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formUuid - 表单UUID
 * @returns {Promise<Object>} 表单Schema
 */
async function getFormSchema(authRef, appType, formUuid) {
  console.error(`\n📋 查询表单Schema: ${formUuid}...`);
  
  const { getRequest, requestWithAutoLogin } = require('./api_client');
  
  const result = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/formdesign/getFormSchema.json`,
      { formUuid: formUuid, _csrf_token: auth.csrfToken },
      auth.cookies
    );
  }, authRef);
  
  if (!result?.success || !result.content) {
    console.error(`  ⚠️ 查询Schema失败: ${result?.errorMsg || '未知错误'}`);
    return null;
  }
  
  console.error(`  ✅ Schema查询成功`);
  // 调试：打印Schema的顶层键
  const keys = Object.keys(result.content);
  console.error(`     Schema键: ${keys.join(', ')}`);
  if (result.content.schema) {
    console.error(`     有schema键，其键为: ${Object.keys(result.content.schema).join(', ')}`);
  }
  return result.content;
}

/**
 * 从Schema中提取第一个文本字段的ID
 * @param {Object} schema - 表单Schema
 * @returns {string|null} 字段ID
 */
function getFirstTextFieldId(schema) {
  if (!schema) {
    console.error('    ⚠️ Schema为空');
    return null;
  }
  
  // 宜搭Schema结构: schema.pages[0].componentsTree[0] -> RootContent -> FormContainer -> children
  let components = null;
  
  if (schema.pages && schema.pages[0] && schema.pages[0].componentsTree) {
    const pageRoot = schema.pages[0].componentsTree[0];
    if (pageRoot && pageRoot.children) {
      // 查找 RootContent
      const rootContent = pageRoot.children.find(c => c.componentName === 'RootContent');
      if (rootContent && rootContent.children) {
        // 查找 FormContainer
        const formContainer = rootContent.children.find(c => c.componentName === 'FormContainer');
        if (formContainer && formContainer.children) {
          components = formContainer.children;
        }
      }
    }
  }
  
  // 兼容旧结构
  if (!components && schema.components) {
    components = schema.components;
  }
  
  if (!components) {
    console.error('    ⚠️ 无法找到components');
    return null;
  }
  
  // 递归查找第一个TextField
  function findTextField(components, depth = 0) {
    for (const comp of components) {
      const indent = '  '.repeat(depth);
      // 检查是否是TextField
      if (comp.componentName === 'TextField') {
        const fieldId = comp.props?.fieldId;
        const label = comp.props?.label?.zh_CN || comp.props?.label || '无标签';
        if (fieldId) {
          console.error(`    ${indent}✓ 找到TextField: ${label} (${fieldId})`);
          return fieldId;
        } else {
          console.error(`    ${indent}⚠️ TextField无fieldId: ${label}`);
        }
      }
      // 递归查找子组件
      if (comp.children && comp.children.length > 0) {
        const found = findTextField(comp.children, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  
  const result = findTextField(components);
  if (!result) {
    console.error('    ⚠️ 未找到任何TextField');
  }
  return result;
}

// ==================== 集成自动化 API ====================

/**
 * 获取自动化流程列表
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @returns {Promise<Array>} 流程列表
 */
async function getAutomationFlowList(authRef, appType) {
  console.error(`\n🔄 获取自动化流程列表...`);
  console.error(`   应用ID: ${appType}`);
  
  const { getRequest, postRequest } = require('./api_client');
  
  const apiPath = `/aliwork/web/${appType}/query/app/flow/flowBinding/getFlowList.json`;
  console.error(`   API路径: ${apiPath}`);
  
  // 先尝试 GET 请求（带 corpId）
  console.error(`   尝试 GET 请求（带 corpId）...`);
  let result = await requestWithAutoLogin((auth) => {
    console.error(`   请求URL: ${auth.baseUrl}${apiPath}`);
    console.error(`   corpId: ${auth.corpId || '未设置'}`);
    return getRequest(
      auth.baseUrl,
      apiPath,
      { 
        _csrf_token: auth.csrfToken,
        corpId: auth.corpId,
        pageSize: 100,
        pageIndex: 1
      },
      auth.cookies
    );
  }, authRef);
  
  // 如果 GET 返回空，尝试 POST 请求
  if (result?.success && (!result.content || result.content.length === 0)) {
    console.error(`   GET 返回空，尝试 POST 请求...`);
    result = await requestWithAutoLogin((auth) => {
      return postRequest(
        auth.baseUrl,
        apiPath,
        { 
          _csrf_token: auth.csrfToken,
          pageSize: 100,
          pageIndex: 1
        },
        auth.cookies
      );
    }, authRef);
  }
  
  if (!result?.success) {
    console.error(`  ⚠️ 获取流程列表失败: ${result?.errorMsg || '未知错误'}`);
    console.error(`  响应数据:`, JSON.stringify(result, null, 2));
    return [];
  }
  
  // 调试：打印响应结构
  console.error(`  📊 响应结构:`, Object.keys(result));
  if (result.content) {
    console.error(`  📊 content类型:`, typeof result.content);
    if (Array.isArray(result.content)) {
      console.error(`  📊 content是数组，长度:`, result.content.length);
    } else {
      console.error(`  📊 content结构:`, Object.keys(result.content));
    }
  }
  
  const flows = result.content?.data || result.content || result.data || [];
  console.error(`  ✅ 获取到 ${flows.length} 个自动化流程`);
  
  if (flows.length > 0) {
    console.error(`  📋 第一个流程:`, JSON.stringify(flows[0], null, 2).substring(0, 500));
  }
  
  return flows;
}

/**
 * 获取连接器列表
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @returns {Promise<Array>} 连接器列表
 */
async function getConnectorList(authRef, appType) {
  console.error(`\n🔌 获取连接器列表...`);
  
  const { getRequest } = require('./api_client');
  
  const result = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/aliwork/web/${appType}/query/app/flow/flowBinding/getConnector.json`,
      { 
        _csrf_token: auth.csrfToken,
        mock: false
      },
      auth.cookies
    );
  }, authRef);
  
  if (!result?.success) {
    console.error(`  ⚠️ 获取连接器列表失败: ${result?.errorMsg || '未知错误'}`);
    return [];
  }
  
  const connectors = result.content || [];
  console.error(`  ✅ 获取到 ${connectors.length} 个连接器`);
  return connectors;
}

/**
 * 获取自动化流程详情
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} flowId - 流程ID
 * @returns {Promise<Object>} 流程详情
 */
async function getAutomationFlowDetail(authRef, appType, flowId) {
  console.error(`\n📋 获取流程详情: ${flowId}...`);
  
  const { getRequest } = require('./api_client');
  
  const result = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/aliwork/web/${appType}/query/app/flow/flowBinding/getFlowDetail.json`,
      { 
        _csrf_token: auth.csrfToken,
        flowId: flowId
      },
      auth.cookies
    );
  }, authRef);
  
  if (!result?.success) {
    console.error(`  ⚠️ 获取流程详情失败: ${result?.errorMsg || '未知错误'}`);
    return null;
  }
  
  console.error(`  ✅ 流程详情获取成功`);
  return result.content;
}

// ==================== 数据标题设置 API ====================

async function setCustomTitle(authRef, appType, formUuid, displayTitle, options = {}) {
  console.error(`\n🔄 设置数据标题...`);
  console.error(`   应用ID: ${appType}`);
  console.error(`   表单UUID: ${formUuid}`);
  console.error(`   标题公式: ${displayTitle}`);
  
  const { postRequest, requestWithAutoLogin } = require('./api_client');
  
  const title = options.title || null;
  
  const apiPath = `/dingtalk/web/${appType}/query/formdesign/updateFormSchemaInfo.json?_api=Form.updateFormSchemaInfo&_mock=false&_stamp=${Date.now()}`;
  
  const params = {
    _csrf_token: authRef.csrfToken,
    _locale_time_zone_offset: '28800000',
    serialSwitch: options.serialSwitch || 'n',
    consultPerson: options.consultPerson || '',
    defaultManager: options.defaultManager || 'n',
    submissionRule: options.submissionRule || 'RESUBMIT',
    redirectConfig: options.redirectConfig || '',
    pushTask: options.pushTask || 'y',
    defaultOrder: options.defaultOrder || 'cd',
    showPrint: options.showPrint || 'y',
    formUuid: formUuid,
    relateUuid: options.relateUuid || '',
    pageType: options.pageType || 'web,mobile',
    showNav: options.showNav || 'y',
    isInner: options.isInner || 'y',
    isNew: options.isNew || 'n',
    showDetail: options.showDetail || 'y',
    isAgent: options.isAgent || 'y',
    showAgent: options.showAgent || 'n',
    showDingGroup: options.showDingGroup || 'y',
    showCopyData: options.showCopyData || 'y',
    reStart: options.reStart || 'n',
    previewConfig: options.previewConfig || 'y',
    isEncrypt: options.isEncrypt || 'n',
    formulaType: options.formulaType || 'n',
    displayTitle: displayTitle,
    customTitle: 'y',
    detailTheme: options.detailTheme || 'theme',
    isRenderNav: options.isRenderNav || 'true',
    manageCustomActionInfo: options.manageCustomActionInfo || '[]',
    manageCustomConfigInfo: options.manageCustomConfigInfo || 'null'
  };
  
  if (title) {
    params.title = typeof title === 'string' ? title : JSON.stringify(title);
  }
  
  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      apiPath,
      { ...params, _csrf_token: auth.csrfToken },
      auth.cookies,
      `${auth.baseUrl}/alibaba/web/${appType}/design/pageDesigner?formUuid=${formUuid}`
    );
  }, authRef);
  
  if (result?.success) {
    console.error(`  ✅ 数据标题设置成功`);
  } else {
    console.error(`  ❌ 数据标题设置失败: ${result?.errorMsg || '未知错误'}`);
    if (result) console.error(`  完整响应: ${JSON.stringify(result).substring(0, 500)}`);
  }
  
  return result;
}

async function setCustomTitleByFieldName(authRef, appType, formUuid, fieldIdOrName) {
  console.error(`\n🔄 通过字段ID/名称设置数据标题...`);
  console.error(`   字段标识: ${fieldIdOrName || '(自动选择)'}`);
  
  const schema = await getFormSchema(authRef, appType, formUuid);
  if (!schema) {
    console.error('  ❌ 无法获取表单Schema');
    return null;
  }
  
  let components = null;
  if (schema.pages && schema.pages[0] && schema.pages[0].componentsTree) {
    const pageRoot = schema.pages[0].componentsTree[0];
    if (pageRoot && pageRoot.children) {
      const rootContent = pageRoot.children.find(c => c.componentName === 'RootContent');
      if (rootContent && rootContent.children) {
        const formContainer = rootContent.children.find(c => c.componentName === 'FormContainer');
        if (formContainer && formContainer.children) {
          components = formContainer.children;
        }
      }
    }
  }
  if (!components && schema.components) {
    components = schema.components;
  }
  
  if (!components) {
    console.error('  ❌ 无法找到表单组件');
    return null;
  }
  
  let targetFieldId = null;
  let targetFieldLabel = null;
  
  if (fieldIdOrName) {
    function findField(comps) {
      for (const comp of comps) {
        const fieldId = comp.props?.fieldId;
        const label = comp.props?.label?.zh_CN || comp.props?.label || '';
        if (fieldId === fieldIdOrName || label === fieldIdOrName) {
          targetFieldId = fieldId;
          targetFieldLabel = label;
          return true;
        }
        if (comp.children && comp.children.length > 0) {
          if (findField(comp.children)) return true;
        }
      }
      return false;
    }
    findField(components);
  } else {
    const result = autoSelectTitleField(components);
    targetFieldId = result.fieldId;
    targetFieldLabel = result.label;
  }
  
  if (!targetFieldId) {
    console.error(`  ❌ 未找到合适的字段作为数据标题`);
    console.error('  可用字段列表:');
    function listFields(comps, depth = 0) {
      for (const comp of comps) {
        const fieldId = comp.props?.fieldId;
        const label = comp.props?.label?.zh_CN || comp.props?.label || '';
        if (fieldId) {
          console.error(`    ${'  '.repeat(depth)}- ${label} (${fieldId}) [${comp.componentName}]`);
        }
        if (comp.children && comp.children.length > 0) {
          listFields(comp.children, depth + 1);
        }
      }
    }
    listFields(components);
    return null;
  }
  
  console.error(`  ✅ 选中字段: ${targetFieldLabel} (${targetFieldId})`);
  
  const displayTitle = `\${${targetFieldId}}`;
  const rawTitle = schema.title;
  const titleJson = rawTitle ? JSON.stringify(rawTitle) : undefined;
  
  return await setCustomTitle(authRef, appType, formUuid, displayTitle, {
    title: titleJson
  });
}

function autoSelectTitleField(components) {
  const NAME_KEYWORDS = ['名称', '名字', '标题', '主题', '姓名'];
  const EXCLUDE_KEYWORDS = ['编号', '创建人', '创建时间', '修改人', '修改时间', '备注', '说明', '描述', '账户', '电话', '手机', '地址', '代码', '编码'];
  const EXCLUDE_TYPES = ['SerialNumberField', 'TextareaField', 'AddressField', 'TableField', 'AssociationFormField', 'DateField', 'AttachmentField', 'RichTextField', 'CascaderSelectField'];
  
  const allFields = [];
  function collectFields(comps, parentLabel) {
    for (const comp of comps) {
      const fieldId = comp.props?.fieldId;
      const label = comp.props?.label?.zh_CN || comp.props?.label || '';
      const componentName = comp.componentName;
      if (fieldId && !EXCLUDE_TYPES.includes(componentName)) {
        allFields.push({ fieldId, label, type: componentName, parentLabel });
      }
      if (comp.children && comp.children.length > 0) {
        collectFields(comp.children, label);
      }
    }
  }
  collectFields(components, '');
  
  const mainFields = allFields.filter(f => !f.parentLabel);
  
  const searchPool = mainFields.length > 0 ? mainFields : allFields;
  
  for (const field of searchPool) {
    const isNameField = NAME_KEYWORDS.some(kw => field.label.includes(kw));
    const isExcluded = EXCLUDE_KEYWORDS.some(kw => field.label.includes(kw));
    if (isNameField && !isExcluded && field.type === 'TextField') {
      console.error(`  🎯 智能选择: 找到名称类字段 "${field.label}" (${field.fieldId})`);
      return { fieldId: field.fieldId, label: field.label };
    }
  }
  
  for (const field of searchPool) {
    const isExcluded = EXCLUDE_KEYWORDS.some(kw => field.label.includes(kw));
    if (!isExcluded && field.type === 'TextField') {
      console.error(`  🎯 智能选择: 使用第一个文本字段 "${field.label}" (${field.fieldId})`);
      return { fieldId: field.fieldId, label: field.label };
    }
  }
  
  for (const field of searchPool) {
    const isExcluded = EXCLUDE_KEYWORDS.some(kw => field.label.includes(kw));
    if (!isExcluded && (field.type === 'SelectField' || field.type === 'NumberField')) {
      console.error(`  🎯 智能选择: 使用选择/数字字段 "${field.label}" (${field.fieldId})`);
      return { fieldId: field.fieldId, label: field.label };
    }
  }
  
  if (searchPool.length > 0) {
    const field = searchPool[0];
    console.error(`  🎯 智能选择: 无理想字段，使用 "${field.label}" (${field.fieldId})`);
    return { fieldId: field.fieldId, label: field.label };
  }
  
  return { fieldId: null, label: null };
}

async function getFormFields(authRef, appType, formUuid) {
  console.error(`\n🔄 获取表单字段列表...`);
  console.error(`   表单UUID: ${formUuid}`);
  
  const schema = await getFormSchema(authRef, appType, formUuid);
  if (!schema) {
    console.error('  ❌ 无法获取表单Schema');
    return [];
  }
  
  const fields = [];
  
  function collectFields(components, parentPath = '') {
    for (const comp of components) {
      const fieldId = comp.props?.fieldId;
      const label = comp.props?.label?.zh_CN || comp.props?.label || '';
      const componentName = comp.componentName;
      
      if (fieldId) {
        fields.push({
          fieldId,
          label,
          type: componentName,
          path: parentPath ? `${parentPath} > ${label}` : label
        });
      }
      
      if (comp.children && comp.children.length > 0) {
        collectFields(comp.children, parentPath ? `${parentPath} > ${label}` : label);
      }
    }
  }
  
  let components = null;
  if (schema.pages && schema.pages[0] && schema.pages[0].componentsTree) {
    const pageRoot = schema.pages[0].componentsTree[0];
    if (pageRoot && pageRoot.children) {
      const rootContent = pageRoot.children.find(c => c.componentName === 'RootContent');
      if (rootContent && rootContent.children) {
        const formContainer = rootContent.children.find(c => c.componentName === 'FormContainer');
        if (formContainer && formContainer.children) {
          components = formContainer.children;
        }
      }
    }
  }
  if (!components && schema.components) {
    components = schema.components;
  }
  
  if (components) {
    collectFields(components);
  }
  
  console.error(`  ✅ 找到 ${fields.length} 个字段`);
  return fields;
}

// ==================== 导出 ====================

module.exports = {
  createForm,
  createFormFromFile,
  createEmptyForm,
  saveFormSchema,
  updateFormConfig,
  getFormSchema,
  getFirstTextFieldId,
  setCustomTitle,
  setCustomTitleByFieldName,
  getFormFields,
  getAppForms,
  deleteForm,
  getAutomationFlowList,
  getConnectorList,
  getAutomationFlowDetail,
  updateFormSettings,
  getFormSettings,
  autoSelectTitleField,
  setFormPermission,
  listPermitGroups,
  FORM_SETTING_DEFS,
  PERMISSION_ACTIONS
};
