#!/usr/bin/env node
/**
 * app_manager.js - 宜搭应用管理模块
 * 版本: 1.1.0
 * 更新日期: 2026-03-11
 * 
 * 功能: 创建和管理宜搭应用
 */

// Phase 6: Cookie 加载统一委托给 lib/core/utils（不再通过 api_client 间接调用）
const coreUtils = require("../../../../lib/core/utils");
const { loadCookieData, resolveBaseUrl } = coreUtils;

const {
  triggerLogin,
  postRequest,
  getRequest,
  requestWithAutoLogin,
  PROJECT_ROOT
} = require("./api_client");

// ==================== i18n 工具 ====================

function i18n(zhText, enText) {
  return JSON.stringify({
    type: "i18n",
    zh_CN: zhText,
    en_US: enText || zhText
  });
}

// ==================== 应用查询 ====================

/**
 * 查询已有应用列表
 * @param {Object} authRef - 登录态引用
 * @returns {Promise<Array>} 应用列表
 */
async function listApps(authRef) {
  console.error("\n🔍 查询已有应用...");
  
  const result = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      "/query/app/getAppList.json",
      {},  // queryParams
      auth.cookies
    );
  }, authRef);
  
  // API 返回的数据结构是 result.content.data
  if (result?.success && result.content?.data && Array.isArray(result.content.data)) {
    console.error(`  ✓ 找到 ${result.content.data.length} 个应用`);
    return result.content.data;
  }
  
  console.error("  ⚠️  未找到应用列表或格式异常");
  return [];
}

/**
 * 根据名称查找应用
 * @param {Array} apps - 应用列表
 * @param {string} appName - 应用名称
 * @returns {Object|null} 应用信息
 */
function findAppByName(apps, appName) {
  if (!Array.isArray(apps)) {
    console.error(`  ⚠️  应用列表格式异常: ${typeof apps}`);
    return null;
  }
  return apps.find(app => {
    const name = app.appName?.zh_CN || app.appName;
    return name === appName;
  }) || null;
}

// ==================== 应用创建 ====================

/**
 * 构建registerApp请求参数
 * @param {string} csrfToken - CSRF Token
 * @param {string} appName - 应用名称
 * @param {string} description - 应用描述
 * @param {string} icon - 图标标识
 * @param {string} iconColor - 图标颜色
 * @returns {Object}
 */
function buildRegisterParams(csrfToken, appName, description, icon, iconColor) {
  const iconValue = `${icon}%%${iconColor}`;
  return {
    _csrf_token: csrfToken,
    appName: i18n(appName),
    description: i18n(description || appName),
    icon: iconValue,
    iconUrl: iconValue,
    colour: "blue",
    defaultLanguage: "zh_CN",
    openExclusive: "n",
    openPhysicColumn: "n",
    openIsolationDatabase: "n",
    openExclusiveUnit: "n",
    group: "全部应用"
  };
}

/**
 * 创建宜搭应用
 * @param {Object} options - 创建选项
 * @param {string} options.name - 应用名称（必填）
 * @param {string} options.description - 应用描述（可选，默认使用name）
 * @param {string} options.icon - 图标标识（可选，默认xian-yingyong）
 * @param {string} options.iconColor - 图标颜色（可选，默认#0089FF）
 * @param {Object} options.auth - 登录态（可选，自动读取）
 * @returns {Promise<Object>}
 */
async function createApp(options) {
  const {
    name,
    description = name,
    icon = "xian-yingyong",
    iconColor = "#0089FF",
    auth = null
  } = options;

  if (!name) {
    throw new Error("应用名称不能为空");
  }

  console.error("=".repeat(50));
  console.error("  宜搭应用创建工具");
  console.error("=".repeat(50));
  console.error(`\n  应用名称: ${name}`);
  console.error(`  应用描述: ${description}`);
  console.error(`  图标: ${icon} (${iconColor})`);

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
    baseUrl: resolveBaseUrl(cookieData)
  };

  console.error(`  ✅ 登录态就绪 (${authRef.baseUrl})`);

  // 查询已有应用，检查是否已存在同名应用
  const existingApps = await listApps(authRef);
  const existingApp = findAppByName(existingApps, name);
  
  if (existingApp) {
    console.error(`\n⚠️  应用 "${name}" 已存在，将复用已有应用`);
    const appType = existingApp.appType;
    const appUrl = `${authRef.baseUrl}/${appType}/admin`;
    
    console.error("=".repeat(50));
    console.error("  ✅ 复用已有应用");
    console.error(`  appType: ${appType}`);
    console.error(`  访问地址: ${appUrl}`);
    console.error("=".repeat(50));
    
    return {
      success: true,
      appType,
      appName: name,
      baseUrl: authRef.baseUrl,
      url: appUrl,
      existing: true
    };
  }

  // 发送创建请求
  console.error("\n📦 创建应用...");
  const params = buildRegisterParams(
    authRef.csrfToken,
    name,
    description,
    icon,
    iconColor
  );

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      "/query/app/registerApp.json",
      params,
      auth.cookies
    );
  }, authRef);

  // 处理结果
  console.error("\n" + "=".repeat(50));
  if (result?.success && result.content) {
    const appType = result.content;
    const appUrl = `${authRef.baseUrl}/${appType}/admin`;

    console.error("  ✅ 应用创建成功！");
    console.error(`  appType: ${appType}`);
    console.error(`  访问地址: ${appUrl}`);
    console.error("=".repeat(50));

    return {
      success: true,
      appType,
      appName: name,
      baseUrl: authRef.baseUrl,
      url: appUrl
    };
  } else {
    const errorMsg = result?.errorMsg || "未知错误";
    console.error(`  ❌ 创建失败: ${errorMsg}`);
    console.error("=".repeat(50));
    throw new Error(errorMsg);
  }
}

// ==================== 命令行入口 ====================

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error("用法: node app_manager.js <appName> [description] [icon] [iconColor]");
    console.error('示例: node app_manager.js "考勤管理" "员工考勤系统" "xian-daka" "#00B853"');
    console.error("\n可用图标:");
    console.error("  xian-yingyong, xian-daka, xian-xinwen, xian-qiye, xian-danju");
    console.error("  xian-shichang, xian-baogao, xian-liucheng, xian-chaxun");
    console.error("\n可用颜色:");
    console.error("  #0089FF #00B853 #FFA200 #FF7357 #5C72FF");
    process.exit(1);
  }

  const [appName, description, icon, iconColor] = args;

  createApp({
    name: appName,
    description,
    icon,
    iconColor
  }).then(result => {
    console.log(JSON.stringify(result, null, 2));
  }).catch(error => {
    console.error(`\n❌ 错误: ${error.message}`);
    process.exit(1);
  });
}

// 如果是直接运行
if (require.main === module) {
  main();
}

// ==================== 导出 ====================

module.exports = {
  createApp,
  buildRegisterParams,
  i18n
};
