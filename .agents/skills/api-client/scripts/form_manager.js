#!/usr/bin/env node
/**
 * form_manager.js - 宜搭表单管理模块
 * 版本: 1.15.0
 * 更新日期: 2026-07-19
 *
 * 更新内容:
 * - v1.15.0: 【防时序竞争】createEmptyForm后等待2秒再saveFormSchema + 保存失败自动重试3次
 *            根因：批量创建17个表单时，个别表单的saveFormSchema在空表单创建后立即调用，
 *            宜搭后端尚未完成初始化就返回"表单不存在"，导致创建失败。
 *            修复1：createEmptyForm返回后等待2秒（sleep 2s），让宜搭后端完成初始化
 *            修复2：saveFormSchema失败时自动重试3次（间隔3秒），覆盖偶发性时序竞争
 *            修复3：重试全部失败才删除空白表单并抛错
 * - v1.14.0: 【加固】检测逻辑防失效，彻底杜绝重跑产生重复
 *            根因：getNavList 失败时返回空数组 []，导致 createNavGroup 的
 *            if (existingNavList.length > 0) 跳过检测创建重复分组；
 *            createForm 的 getAppForms 也返回 []，find 找不到同名表单，
 *            catch 块"继续创建"导致重复表单。
 *            修复1：getNavList 失败时重试3次（间隔2秒），都失败后抛错（不返回空数组）
 *            修复2：createForm 的 catch 块改为抛错（不"继续创建"），
 *                   错误信息明确提示"为避免创建重复表单，已中止创建"
 *            效果：平台临时故障时重试3次后可能恢复；长期故障时中止流程，不会产生重复
 *            端到端测试验证：createNavGroup 传入已存在的"基础信息"分组名，
 *            正确返回 existing=true，未创建新分组
 *
 * - v1.13.0: 【新增】deleteNavItem 函数 + 平台重复数据清理
 *            通过 Playwright 捕获宜搭平台手动删除导航项的真实API调用，
 *            确认删除API为 POST /query/formnav/deleteFormNavigation.json?_api=Nav.delete
 *            关键参数为 navUuid（之前尝试用 id/navId/formUuid 均失败返回"未知异常"）
 *            新增 deleteNavItem 函数，支持删除空分组、重复表单导航项、孤立导航项
 *            使用该API成功清理了进销存应用的9个空分组和11个重复表单导航项
 *
 * - v1.12.0: 【根因修复】表单和分组重复创建的两大根因
 *            根因1：getAppForms使用已失效的API路径 /query/app/form/list.json（返回404），
 *                   导致表单列表始终为空，createForm的"检测同名表单跳过创建"逻辑完全失效。
 *            修复1：getAppForms改用导航列表API（getFormNavigationListByOrder.json）获取表单列表，
 *                   过滤navType='PAGE'的导航项提取表单信息。
 *            根因2：createNavGroup没有检测同名分组的逻辑，每次重跑都创建新分组。
 *            修复2：createNavGroup在创建前先调用getNavList检查是否已存在同名分组，
 *                   如果存在直接返回现有分组的navUuid，不创建新分组。
 *            这两个根因共同导致了用户重跑3次后出现3套分组和27个表单（应该只有16个）。
 *
 * - v1.11.2: 【根因修复】修复 getRequest 未导入及 getAppForms 返回非数组问题
 *            1. 顶部 require api_client 时补充解构 getRequest，确保 createNavGroup/getNavList 等导航 API 可用
 *            2. getAppForms 增强响应解析，兼容 content.data/list 及分页对象结构，始终返回数组，避免上层 .find() 报错
 *
 * - v1.11.1: 【根因修复】moveFormToGroup 添加重试机制
 *            表单刚创建时，可能还没有出现在导航列表中（宜搭平台有延迟），
 *            导致 moveFormToGroup 在导航列表中找不到表单而返回 false。
 *            修复：添加重试机制，当找不到表单的导航项时，等待2秒后重试，最多重试3次。
 *
 * - v1.11.0: 【根因修复】已存在表单也能正确移入分组
 *            解决"重跑创建流程时，已存在的表单被跳过创建，导致不会被移入分组"的问题。
 *            createForm 函数在检测到同名表单已存在时：
 *            1. 如果指定了 parentNavUuid，也调用 moveFormToGroup 将已存在的表单移入分组
 *            2. 返回带有 success:true、existing:true 标志的完整对象（之前返回的是原始 existingForm 对象，
 *               缺少 success 字段，会导致上层 createFormWithMapping 误判为创建失败）
 *
 * - v1.10.0: 【根因修复】表单移入分组功能彻底修复
 *            经 playwright 捕获宜搭平台手动拖动表单到分组的真实API调用，
 *            发现 saveFormSchemaInfo 的 parentNavUuid 参数不生效（表单创建后始终在根目录）。
 *            真正用于移动导航项的API是 updateFormNavigationOrderNew.json（_api=Nav.updateOrderNew）。
 *            新增 moveFormToGroup 函数，通过该API将表单移入分组。
 *            新增 getNavList 函数，查询导航列表。
 *            createEmptyForm 不再传 parentNavUuid 给 saveFormSchemaInfo，
 *            改为创建表单后调用 moveFormToGroup 移入分组。
 *
 * - v1.9.0: 【根因修复】导航分组功能彻底修复
 *           createNavGroup 改用 formnav/saveFormNavigation.json API 创建真正的导航分组（NAV-前缀）
 *           createEmptyForm 恢复 parentNavUuid 传参，现在传入正确的NAV-前缀分组UUID
 *           通过 playwright 捕获宜搭平台手动创建分组的真实API确认根因
 *
 * - v1.8.0: 【新增】导航分组创建功能
 *           1. 新增 createNavGroup 函数，调用 saveFormSchemaInfo + formType:'group' 创建导航分组
 *           2. createEmptyForm 新增 parentNavUuid 参数，支持将表单放入指定分组
 *           3. createForm 新增 parentNavUuid 选项，传递到 createEmptyForm
 *           4. CLI 支持第5个参数 parentNavUuid
 *           5. 导出 createNavGroup
 *
 * 历史版本:
 * - v1.7.0: 【关键修复】流水号字段创建后无法自动生成的根本原因
 *           宜搭流水号字段是双轨制：serialNumberRule数组仅供前端UI显示
 *           真正驱动数据提交时生成流水号的是formula.expression中的SERIALNUMBER()公式
 *           新增enrichSerialNumberFormula函数，在saveFormSchema前为流水号字段
 *           补充完整的SERIALNUMBER(corpId,appId,formUuid,fieldId,规则JSON)公式
 *           解决了必须手动在后台编辑保存才能激活流水号的问题
 *
 * 历史版本:
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

// Phase 6: Cookie 加载统一委托给 lib/core/utils（不再通过 api_client 间接调用）
const coreUtils = require("../../../../lib/core/utils");
const { loadCookieData, resolveBaseUrl } = coreUtils;

const {
  triggerLogin,
  resolveCorpId,
  postRequest,
  getRequest,
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

  // v1.12.0: 改用导航列表API获取表单列表
  // 旧API /query/app/form/list.json 已失效（返回404），导致getAppForms始终返回空数组
  // 这使createForm的"检测同名表单跳过创建"逻辑失效，每次重跑都会创建重复表单
  // 新方案：通过导航列表API获取所有PAGE类型导航项，从中提取表单信息
  const navList = await getNavList(authRef, appType);
  if (navList.length === 0) {
    console.error(`  ⚠️ 导航列表为空，无法获取表单列表`);
    return [];
  }

  // 过滤出表单类型的导航项（navType === 'PAGE' 且有 formUuid）
  const forms = navList.filter(item => item.navType === 'PAGE' && item.formUuid).map(item => ({
    formUuid: item.formUuid,
    title: item.title?.zh_CN || item.title || '',
    formType: item.formType || 'receipt',
    processCode: item.processCode || null
  }));

  console.error(`  ✅ 获取到 ${forms.length} 个表单（从导航列表提取）`);
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

// ==================== 导航分组 ====================

/**
 * 创建导航分组
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} groupTitle - 分组标题
 * @param {string} parentNavUuid - 父级导航UUID（默认为根目录 NAV-SYSTEM-PARENT-UUID）
 * @returns {Promise<Object>} { navUuid, title }
 */
async function createNavGroup(authRef, appType, groupTitle, parentNavUuid = 'NAV-SYSTEM-PARENT-UUID') {
  console.error(`\n📁 创建导航分组: ${groupTitle}`);

  // v1.12.0: 创建前先检查是否已存在同名分组，避免重跑时创建重复分组
  // 之前没有检测逻辑，每次重跑都会创建新分组，导致出现多套重复分组
  const existingNavList = await getNavList(authRef, appType);
  if (existingNavList.length > 0) {
    const existingGroup = existingNavList.find(item =>
      item.title?.zh_CN === groupTitle && item.navType === 'NAV' && !item.formUuid
    );
    if (existingGroup) {
      console.error(`  ✅ 分组 "${groupTitle}" 已存在，复用现有分组: ${existingGroup.navUuid}`);
      return { navUuid: existingGroup.navUuid, title: groupTitle, existing: true };
    }
  }

  // v1.9.0: 使用 formnav/saveFormNavigation.json API 创建真正的导航分组（NAV-前缀）
  // 之前用 saveFormSchemaInfo + formType:'group' 创建的是FORM-前缀的表单，不是真正的导航分组
  const params = {
    title: buildI18nJson(groupTitle)
  };

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/formnav/saveFormNavigation.json?_api=Nav.save&_mock=false`,
      { ...params, _csrf_token: auth.csrfToken, _locale_time_zone_offset: 28800000 },
      auth.cookies
    );
  }, authRef);

  if (!result?.success) {
    const errorMsg = result?.errorMsg || "创建导航分组失败";
    throw new Error(errorMsg);
  }

  // API返回的是数字ID，需要查询导航列表获取navUuid
  const navListResult = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/formnav/getFormNavigationListByOrder.json?_api=Nav.queryList&_mock=false`,
      { _csrf_token: auth.csrfToken, _locale_time_zone_offset: 28800000 },
      auth.cookies
    );
  }, authRef);

  let navUuid = null;
  if (navListResult?.success && Array.isArray(navListResult.content)) {
    const group = navListResult.content.find(item =>
      item.title?.zh_CN === groupTitle && item.navType === 'NAV' && !item.formUuid
    );
    if (group) {
      navUuid = group.navUuid;
    }
  }

  if (!navUuid) {
    throw new Error(`创建导航分组成功但无法获取navUuid: ${groupTitle}`);
  }

  console.error(`  ✅ 导航分组已创建: ${groupTitle} (${navUuid})`);
  return { navUuid: navUuid, title: groupTitle };
}

/**
 * 查询导航列表
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @returns {Promise<Array>} 导航项列表
 *
 * v1.14.0: 【加固】失败时重试3次，都失败后抛错（之前返回空数组导致检测失效）
 *          之前的逻辑：失败时返回 []，调用方 if (navList.length > 0) 跳过检测，
 *          导致 createNavGroup 创建重复分组、createForm 创建重复表单。
 *          修复：失败时重试，都失败后抛错，让上层感知检测失败，不会"静默继续创建"。
 */
async function getNavList(authRef, appType) {
  const { getRequest } = require('./api_client');

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await requestWithAutoLogin((auth) => {
      return getRequest(
        auth.baseUrl,
        `/dingtalk/web/${appType}/query/formnav/getFormNavigationListByOrder.json?_api=Nav.queryList&_mock=false`,
        { _csrf_token: auth.csrfToken, _locale_time_zone_offset: 28800000 },
        auth.cookies
      );
    }, authRef);

    if (result?.success && Array.isArray(result.content)) {
      return result.content;
    }

    lastError = result?.errorMsg || `success=${result?.success}, content类型=${Array.isArray(result?.content) ? 'Array' : typeof result?.content}`;
    console.error(`  ⚠️ getNavList 第 ${attempt}/${MAX_RETRIES} 次失败: ${lastError}`);
    if (attempt < MAX_RETRIES) {
      console.error(`     等待 ${RETRY_DELAY_MS / 1000} 秒后重试...`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  // 重试都失败后抛错，不返回空数组（避免检测失效导致重复创建）
  throw new Error(`查询导航列表失败（重试${MAX_RETRIES}次后仍失败）: ${lastError}`);
}

/**
 * 删除导航项（v1.13.0 新增）
 *
 * 通过 Playwright 捕获宜搭平台手动删除导航项的真实API调用，
 * 确认删除API为 POST /query/formnav/deleteFormNavigation.json?_api=Nav.delete
 * 关键参数为 navUuid（不是 id、navId 或 formUuid）
 *
 * 可用于删除：空分组、重复的表单导航项、孤立的导航项
 *
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} navUuid - 要删除的导航项UUID（NAV-前缀）
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteNavItem(authRef, appType, navUuid) {
  console.error(`\n🗑️  删除导航项: ${navUuid}`);

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/formnav/deleteFormNavigation.json?_api=Nav.delete&_mock=false`,
      {
        _csrf_token: auth.csrfToken,
        _locale_time_zone_offset: 28800000,
        navUuid: navUuid
      },
      auth.cookies
    );
  }, authRef);

  if (!result?.success) {
    console.error(`  ⚠️ 删除导航项失败: ${result?.errorMsg || '未知错误'}`);
    return false;
  }

  console.error(`  ✅ 导航项已删除`);
  return true;
}

/**
 * 将表单移入导航分组（v1.10.0 核心函数）
 *
 * 通过 playwright 捕获宜搭平台手动拖动表单到分组的真实API，
 * 发现 saveFormSchemaInfo 的 parentNavUuid 参数不生效。
 * 真正用于移动导航项的API是 updateFormNavigationOrderNew.json（_api=Nav.updateOrderNew）。
 *
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formUuid - 表单UUID
 * @param {string} groupNavUuid - 目标分组的navUuid（NAV-前缀）
 * @returns {Promise<boolean>} 是否成功
 */
async function moveFormToGroup(authRef, appType, formUuid, groupNavUuid) {
  console.error(`\n🔄 移动表单到分组: ${formUuid} → ${groupNavUuid}`);

  // v1.11.1: 添加重试机制
  // 表单刚创建时，可能还没有出现在导航列表中（宜搭平台有延迟）
  // 当找不到表单的导航项时，等待2秒后重试，最多重试3次
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let navList = [];
  let formNavItem = null;
  let groupItem = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // 1. 查询导航列表，获取表单的数字ID和当前所有导航项的顺序
    navList = await getNavList(authRef, appType);
    if (navList.length === 0) {
      console.error(`  ⚠️ 导航列表为空 (尝试 ${attempt}/${MAX_RETRIES})`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return false;
    }

    // 找到表单的导航项（通过 formUuid 匹配）
    formNavItem = navList.find(item => item.formUuid === formUuid && item.navType === 'PAGE');
    if (!formNavItem) {
      console.error(`  ⚠️ 在导航列表中找不到表单: ${formUuid} (尝试 ${attempt}/${MAX_RETRIES})`);
      if (attempt < MAX_RETRIES) {
        console.error(`     等待 ${RETRY_DELAY_MS / 1000} 秒后重试...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      console.error(`  ❌ 重试 ${MAX_RETRIES} 次后仍找不到表单，放弃移动`);
      return false;
    }

    // 找到目标分组
    groupItem = navList.find(item => item.navUuid === groupNavUuid && item.navType === 'NAV');
    if (!groupItem) {
      console.error(`  ⚠️ 在导航列表中找不到分组: ${groupNavUuid}`);
      return false;
    }

    // 找到了表单和分组，跳出重试循环
    break;
  }

  // 如果表单已经在目标分组下，无需移动
  if (formNavItem.parentNavUuid === groupNavUuid) {
    console.error(`  ✅ 表单已在目标分组下，无需移动`);
    return true;
  }

  // 2. 构造新的 ids 列表
  // 策略：将表单的 id 从原位置移除，插入到分组 id 之后
  const allIds = navList.map(item => item.id);
  const newIds = allIds.filter(id => id !== formNavItem.id);
  const groupIndex = newIds.indexOf(groupItem.id);
  if (groupIndex === -1) {
    console.error(`  ⚠️ 无法在ids列表中找到分组id: ${groupItem.id}`);
    return false;
  }
  newIds.splice(groupIndex + 1, 0, formNavItem.id);

  // 3. 调用 updateFormNavigationOrderNew.json API
  const params = {
    currentId: formNavItem.id,
    parentNavUuid: groupNavUuid,
    navType: 'PAGE',
    ids: newIds.join(',')
  };

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/formnav/updateFormNavigationOrderNew.json?_api=Nav.updateOrderNew&_mock=false`,
      { ...params, _csrf_token: auth.csrfToken, _locale_time_zone_offset: 28800000 },
      auth.cookies
    );
  }, authRef);

  if (!result?.success) {
    console.error(`  ⚠️ 移动表单失败: ${result?.errorMsg || '未知错误'}`);
    return false;
  }

  console.error(`  ✅ 表单已移入分组`);
  return true;
}

// ==================== 表单创建 ====================

/**
 * 步骤1: 创建空白表单
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formTitle - 表单标题
 * @param {string} formType - 表单类型: receipt(普通表单) 或 process(流程表单) 或 group(导航分组)
 * @param {string} parentNavUuid - 父级导航UUID（可选，将表单放入指定分组）
 * @returns {Promise<Object>} { formUuid, processCode }
 */
async function createEmptyForm(authRef, appType, formTitle, formType = "receipt", parentNavUuid = null) {
  console.error("\n📄 Step 1: 创建空白表单...");
  console.error(`  表单类型: ${formType === "process" ? "流程表单" : "普通表单"}`);
  if (parentNavUuid) {
    console.error(`  目标分组: ${parentNavUuid}`);
  }

  const params = {
    formType: formType,
    title: buildI18nJson(formTitle)
  };

  // v1.10.0: 不再通过 saveFormSchemaInfo 的 parentNavUuid 参数设置分组归属
  // 经 playwright 捕获验证，saveFormSchemaInfo 的 parentNavUuid 参数不生效，
  // 表单创建后始终在根目录（parentNavUuid=NAV-SYSTEM-PARENT-UUID）。
  // 正确做法：先创建表单，再用 moveFormToGroup（updateFormNavigationOrderNew.json API）移入分组。

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

  // v1.10.0: 如果指定了父级分组，创建表单后调用 moveFormToGroup 移入分组
  if (parentNavUuid) {
    await moveFormToGroup(authRef, appType, formUuid, parentNavUuid);
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

  // 【根因修复】_csrf_token 必须在闭包内用 auth.csrfToken 构造，
  // 不能在闭包外用 authRef.csrfToken 固化；否则当 requestWithAutoLogin
  // 检测到 csrf/登录失效并重登录刷新 token 后，重试仍会发送旧 token，导致重登录失效。
  const baseParams = {
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
      { ...baseParams, _csrf_token: auth.csrfToken },
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
    skipExistingCheck = false,
    parentNavUuid = null
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
  // 【v1.11.0修改】表单已存在时，如果指定了 parentNavUuid，也调用 moveFormToGroup 移入分组
  // 【v1.14.0修改】检测失败时抛错（之前"继续创建"会导致重复创建表单）
  //               之前的逻辑：getAppForms 失败时 catch 块"继续创建"，导致重复表单。
  //               修复：检测失败时抛错，让上层感知，不会"静默继续创建"。
  if (!skipExistingCheck) {
    console.error("\n🔍 检查是否已存在同名表单...");
    try {
      const existingForms = await getAppForms(authRef, appType);
      const existingForm = existingForms.find(f => f.title === title);
      if (existingForm) {
        console.error(`  ✅ 表单 "${title}" 已存在，跳过创建`);
        console.error(`     现有表单UUID: ${existingForm.formUuid}`);

        // v1.11.0: 表单已存在时，如果指定了父级分组，也调用 moveFormToGroup 移入分组
        // 解决"重跑创建流程时，已存在的表单不会被移入分组"的问题
        if (parentNavUuid) {
          console.error(`  📁 检测到指定分组，将已存在的表单移入分组: ${parentNavUuid}`);
          try {
            await moveFormToGroup(authRef, appType, existingForm.formUuid, parentNavUuid);
          } catch (moveError) {
            console.error(`  ⚠️  移动已存在表单到分组失败: ${moveError.message}`);
            // 移动失败不阻断流程，表单仍在根目录可用
          }
        }

        const formUrl = `${authRef.baseUrl}/${appType}/workbench/${existingForm.formUuid}`;
        return {
          success: true,
          existing: true,
          formUuid: existingForm.formUuid,
          processCode: existingForm.processCode || null,
          formTitle: title,
          appType,
          baseUrl: authRef.baseUrl,
          url: formUrl
        };
      } else {
        console.error(`  ✅ 未找到同名表单，继续创建（共检测到 ${existingForms.length} 个已有表单）`);
      }
    } catch (e) {
      // v1.14.0: 检测失败时抛错，不"继续创建"（避免静默产生重复表单）
      console.error(`  ❌ 检查表单列表失败: ${e.message}`);
      console.error(`     为避免创建重复表单，中止创建。请检查网络/登录态后重试。`);
      throw new Error(`表单重复检测失败: ${e.message}（为避免创建重复表单，已中止创建）`);
    }
  }

  // 步骤1: 创建空白表单
  let formUuid = null;
  let processCode = null;
  try {
    const emptyFormResult = await createEmptyForm(authRef, appType, title, formType, parentNavUuid);
    formUuid = emptyFormResult.formUuid;
    processCode = emptyFormResult.processCode;
  } catch (error) {
    console.error(`\n❌ 创建空白表单失败: ${error.message}`);
    throw error;
  }

  // 步骤1.5: 【v1.15.0新增】等待2秒，让宜搭后端完成空表单初始化
  // 根因：saveFormSchema在空表单创建后立即调用时，宜搭后端可能尚未完成初始化，
  // 返回"表单不存在"。等待2秒后再保存Schema，大幅降低时序竞争概率。
  console.error("  ⏳ 等待2秒，确保表单初始化完成...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 步骤2: 构建并保存Schema（含重试机制）
  const schema = buildFormSchema(title, fields, formUuid);
  // 【v1.7.0新增】为流水号字段补充 SERIALNUMBER() 公式
  enrichSerialNumberFormula(schema, authRef.corpId, appType, formUuid);

  let schemaSaved = false;
  // 【加固】"表单不存在" 是宜搭后端最终一致性延迟（空表单已创建但读路径尚未同步）。
  // 提高重试次数并使用渐进退避，覆盖平台较慢时的传播延迟，避免误触发回滚。
  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const backoffMs = attempt * 3000; // 渐进退避：6s / 9s / 12s / 15s
        console.error(`  🔄 第${attempt}次重试保存Schema（共${MAX_RETRIES}次，等待${backoffMs / 1000}秒）...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
      await saveFormSchema(authRef, appType, formUuid, schema);
      schemaSaved = true;
      break;
    } catch (error) {
      console.error(`  ⚠️  第${attempt}次保存Schema失败: ${error.message}`);
      if (attempt < MAX_RETRIES) {
        console.error(`     将在稍后重试...`);
      } else {
        // 全部重试失败，清理空白表单并抛错
        console.error(`\n❌ 保存Schema失败（已重试${MAX_RETRIES}次）: ${error.message}`);
        console.error("🗑️  正在清理已创建的空白表单...");
        try {
          await deleteForm(authRef, appType, formUuid);
        } catch (deleteError) {
          console.error(`  ⚠️  自动删除失败: ${deleteError.message}`);
        }
        throw error;
      }
    }
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
async function createFormFromFile(appType, formTitle, fieldsJsonFile, formType = "receipt", parentNavUuid = null) {
  const resolvedPath = path.resolve(fieldsJsonFile);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`字段定义文件不存在: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const fields = JSON.parse(content);

  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("字段定义必须是非空数组");
  }

  return createForm({ appType, title: formTitle, fields, formType, parentNavUuid });
}

// ==================== 命令行入口 ====================

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error("用法: node form_manager.js <appType> <formTitle> <fieldsJsonFile> [formType] [parentNavUuid]");
    console.error('示例: node form_manager.js "APP_XXX" "员工信息表" "fields.json"');
    console.error('示例: node form_manager.js "APP_XXX" "审批流程" "fields.json" "process"');
    console.error("\n参数说明:");
    console.error("  formType: receipt(普通表单,默认) 或 process(流程表单)");
    console.error("  parentNavUuid: ⚠️ v1.8.1已废弃，不再生效。表单统一创建在导航根目录，可在宜搭平台手动拖入分组。");
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

  const [appType, formTitle, fieldsJsonFile, formType = "receipt", parentNavUuid = ""] = args;

  createFormFromFile(appType, formTitle, fieldsJsonFile, formType, parentNavUuid || null)
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

  // 递归查找字段，跳过子表字段（数据标题只能引用主表字段）
  function findFieldByLabel(comps, targetName) {
    for (const comp of comps) {
      if (comp.componentName === 'TableField') continue;
      const fieldId = comp.props?.fieldId;
      const label = comp.props?.label?.zh_CN || comp.props?.label || '';
      if (fieldId === targetName || label === targetName) {
        return { fieldId, label };
      }
      if (comp.children && comp.children.length > 0) {
        const found = findFieldByLabel(comp.children, targetName);
        if (found) return found;
      }
    }
    return null;
  }

  let displayTitle = null;
  let matchedLabels = [];

  if (fieldIdOrName) {
    // 提取所有字段名（连续的字母数字中文下划线字符），其余符号自动作为分隔符
    // 支持任意符号分隔：+、--、-、|、/、~、空格等
    const fieldNames = fieldIdOrName.match(/[\p{L}\p{N}_]+/gu) || [];
    const fieldIds = [];

    for (const name of fieldNames) {
      const found = findFieldByLabel(components, name);
      if (found) {
        fieldIds.push(found.fieldId);
        matchedLabels.push(found.label);
      } else {
        console.error(`  ⚠️ 未找到字段: ${name}`);
      }
    }

    if (fieldIds.length > 0) {
      displayTitle = fieldIds.map(id => `\${${id}}`).join('_');
    }
  } else {
    const result = autoSelectTitleField(components);
    if (result.fieldId) {
      displayTitle = `\${${result.fieldId}}`;
      matchedLabels = [result.label];
    }
  }

  if (!displayTitle) {
    console.error(`  ❌ 未找到合适的字段作为数据标题`);
    console.error('  可用字段列表:');
    function listFields(comps, depth = 0) {
      for (const comp of comps) {
        if (comp.componentName === 'TableField') continue;
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

  console.error(`  ✅ 选中字段: ${matchedLabels.join(' + ')} → ${displayTitle}`);

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

// ==================== 流水号公式补充（v1.7.0新增） ====================

/**
 * 为流水号字段补充 SERIALNUMBER() 公式
 *
 * 【背景】
 * 宜搭流水号字段是双轨制驱动的：
 * 1. serialNumberRule 数组 → 仅供前端表单设计器UI显示规则
 * 2. formula.expression 中的 SERIALNUMBER() 公式 → 真正在数据提交时驱动流水号生成
 *
 * 通过 saveFormSchema API 保存的 schema 中虽然包含了 serialNumberRule 数组，
 * 但如果 formula.expression 为空，宜搭服务器不会在数据提交时生成流水号。
 * 只有用户在后台手动编辑并保存时，宜搭前端才会自动生成 SERIALNUMBER() 公式。
 *
 * 此函数在 saveFormSchema 前遍历 schema，为所有流水号字段补充完整的 SERIALNUMBER() 公式。
 *
 * @param {Object} schema - buildFormSchema 返回的完整 schema
 * @param {string} corpId - 组织ID
 * @param {string} appType - 应用ID
 * @param {string} formUuid - 表单UUID
 */
function enrichSerialNumberFormula(schema, corpId, appType, formUuid) {
  if (!corpId || !appType || !formUuid) {
    console.error("  ⚠️  缺少 corpId/appType/formUuid，跳过流水号公式补充");
    return;
  }

  let count = 0;

  if (!schema.pages) return;

  for (const page of schema.pages) {
    if (!page.componentsTree) continue;

    const traverse = (nodes) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (node.componentName === "SerialNumberField" && node.props) {
          const fieldId = node.props.fieldId;
          const rule = node.props.serialNumberRule;
          if (fieldId && Array.isArray(rule) && rule.length > 0) {
            const ruleObj = { type: "custom", value: rule };
            const ruleJson = JSON.stringify(ruleObj);
            // 转义反斜杠和双引号，使其能嵌入 SERIALNUMBER() 公式字符串中
            const escapedRuleJson = ruleJson.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            node.props.formula = {
              expression: `SERIALNUMBER("${corpId}", "${appType}", "${formUuid}", "${fieldId}", "${escapedRuleJson}")`
            };
            count++;
          }
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };

    traverse(page.componentsTree);
  }

  if (count > 0) {
    console.error(`  ✅ 已为 ${count} 个流水号字段补充 SERIALNUMBER() 公式`);
  }
}

// ==================== 导出 ====================

module.exports = {
  createForm,
  createFormFromFile,
  createEmptyForm,
  createNavGroup,
  getNavList,
  deleteNavItem,
  moveFormToGroup,
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
