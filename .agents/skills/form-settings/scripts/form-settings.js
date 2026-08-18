﻿const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 阶段二改造：Cookie 优先全局，兼容项目根（实际读取走 coreUtils.loadCookieData）
const GLOBAL_COOKIE_FILE = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
const COOKIE_FILE = fs.existsSync(GLOBAL_COOKIE_FILE) ? GLOBAL_COOKIE_FILE : path.join(PROJECT_ROOT, '.cookies.json');
const FORM_MANAGER_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'api-client', 'scripts', 'form_manager.js');
const API_CLIENT_PATH = path.join(PROJECT_ROOT, '.agents', 'skills', 'api-client', 'scripts', 'api_client.js');

// Phase 6: Cookie 加载统一委托给 lib/core/utils
const coreUtils = require('../../../../lib/core/utils');

function getAuthRef() {
  const { loadCookieData, resolveBaseUrl } = coreUtils;
  const { resolveCorpId } = require(API_CLIENT_PATH);
  const cookieData = loadCookieData();
  if (!cookieData) {
    console.error('  ❌ 未找到登录态，请先登录');
    process.exit(1);
  }
  return {
    cookieData,
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    corpId: resolveCorpId(cookieData)
  };
}

async function cmdGetSettings(appType, formUuid) {
  const { getFormSettings } = require(FORM_MANAGER_PATH);
  const authRef = getAuthRef();
  const settings = await getFormSettings(authRef, appType, formUuid);
  if (settings) {
    console.log(JSON.stringify({ success: true, formUuid, appType, settings }, null, 2));
  } else {
    console.log(JSON.stringify({ success: false, formUuid, appType }));
  }
  return settings;
}

async function cmdSetTitle(appType, formUuid, fieldIdOrName) {
  const { setCustomTitleByFieldName } = require(FORM_MANAGER_PATH);
  const authRef = getAuthRef();
  const result = await setCustomTitleByFieldName(authRef, appType, formUuid, fieldIdOrName || null);
  if (result?.success) {
    console.log(JSON.stringify({ success: true, message: '数据标题设置成功', formUuid, appType }, null, 2));
  } else {
    console.log(JSON.stringify({ success: false, message: `设置失败: ${result?.errorMsg || '未知错误'}`, formUuid, appType }, null, 2));
  }
  return result;
}

async function cmdSetRestart(appType, formUuid, enable) {
  const { updateFormSettings } = require(FORM_MANAGER_PATH);
  const authRef = getAuthRef();
  const result = await updateFormSettings(authRef, appType, formUuid, {
    reStart: enable ? 'y' : 'n'
  });
  if (result?.success) {
    console.log(JSON.stringify({ success: true, message: `复制流程已${enable ? '开启' : '关闭'}`, formUuid, appType }, null, 2));
  } else {
    console.log(JSON.stringify({ success: false, message: `设置失败: ${result?.errorMsg || '未知错误'}`, formUuid, appType }, null, 2));
  }
  return result;
}

async function cmdSetPermission(appType, formUuid, action, enable, options = {}) {
  const { setFormPermission, PERMISSION_ACTIONS } = require(FORM_MANAGER_PATH);
  const authRef = getAuthRef();
  const result = await setFormPermission(authRef, appType, formUuid, action, enable, options);
  if (result?.success) {
    const actionInfo = PERMISSION_ACTIONS[action];
    console.log(JSON.stringify({ success: true, message: `${actionInfo?.desc || action}已${enable ? '开启' : '关闭'}`, formUuid, appType, action, enable }, null, 2));
  } else {
    console.log(JSON.stringify({ success: false, message: `设置失败: ${result?.errorMsg || '未知错误'}`, formUuid, appType }, null, 2));
  }
  return result;
}

async function cmdListPermitGroups(appType, formUuid, packageType = 'FORM_PACKAGE_VIEW') {
  const { listPermitGroups, PERMISSION_ACTIONS } = require(FORM_MANAGER_PATH);
  const authRef = getAuthRef();
  const permits = await listPermitGroups(authRef, appType, formUuid, packageType);
  
  const result = permits.map((p, i) => {
    const name = p.packageName?.zh_CN || '未命名';
    const desc = p.description?.zh_CN || '';
    const op = JSON.parse(p.operatePermit || '{}');
    const editEnabled = op.OPERATE_EDIT_AFTER_PROCESS === 'y';
    const deleteEnabled = op.OPERATE_DELETE_AFTER_PROCESS === 'y' || op.OPERATE_DELETE === 'y';
    const printEnabled = op.OPERATE_PRINT === 'y' || op.OPERATE_PRINT_AFTER_PROCESS === 'y';
    
    return {
      index: i,
      name,
      description: desc,
      packageUuid: p.packageUuid,
      editEnabled,
      deleteEnabled,
      printEnabled,
      operatePermit: op
    };
  });
  
  console.log(JSON.stringify({ success: true, formUuid, appType, packageType, permitGroups: result }, null, 2));
  return result;
}

async function cmdListPermissions() {
  const { PERMISSION_ACTIONS } = require(FORM_MANAGER_PATH);
  console.log(JSON.stringify({ success: true, permissions: PERMISSION_ACTIONS }, null, 2));
}

async function cmdSet(appType, formUuid, settingsStr) {
  const { updateFormSettings, FORM_SETTING_DEFS } = require(FORM_MANAGER_PATH);
  const authRef = getAuthRef();
  
  const settings = {};
  const pairs = settingsStr.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=').map(s => s.trim());
    if (FORM_SETTING_DEFS[key]) {
      settings[key] = value;
    } else {
      console.error(`  ⚠️ 未知配置项: ${key}`);
    }
  }
  
  if (Object.keys(settings).length === 0) {
    console.error('  ❌ 没有有效的配置项');
    return null;
  }
  
  const result = await updateFormSettings(authRef, appType, formUuid, settings);
  if (result?.success) {
    console.log(JSON.stringify({ success: true, message: '表单设置更新成功', formUuid, appType, updated: Object.keys(settings) }, null, 2));
  } else {
    console.log(JSON.stringify({ success: false, message: `设置失败: ${result?.errorMsg || '未知错误'}`, formUuid, appType }, null, 2));
  }
  return result;
}

async function cmdListFields(appType, formUuid) {
  const { getFormFields } = require(FORM_MANAGER_PATH);
  const authRef = getAuthRef();
  const fields = await getFormFields(authRef, appType, formUuid);
  console.log(JSON.stringify({ success: true, formUuid, appType, fieldCount: fields.length, fields }, null, 2));
  return fields;
}

function cmdListSettings() {
  const { FORM_SETTING_DEFS } = require(FORM_MANAGER_PATH);
  console.log(JSON.stringify({ success: true, settings: FORM_SETTING_DEFS }, null, 2));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { command: '', params: {} };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app' || args[i] === '--appType') {
      parsed.params.appType = args[++i];
    } else if (args[i] === '--form' || args[i] === '--formUuid') {
      parsed.params.formUuid = args[++i];
    } else if (args[i] === '--field' || args[i] === '--fieldId') {
      parsed.params.fieldIdOrName = args[++i];
    } else if (args[i] === '--enable') {
      parsed.params.enable = args[++i] !== 'false';
    } else if (args[i] === '--action') {
      parsed.params.action = args[++i];
    } else if (args[i] === '--settings') {
      parsed.params.settings = args[++i];
    } else if (args[i] === '--packageType') {
      parsed.params.packageType = args[++i];
    } else if (args[i] === '--packageIndex') {
      parsed.params.packageIndex = parseInt(args[++i]);
    } else if (args[i] === '--packageUuid') {
      parsed.params.packageUuid = args[++i];
    } else if (!args[i].startsWith('--')) {
      parsed.command = args[i];
    }
  }
  return parsed;
}

async function main() {
  const { command, params } = parseArgs();
  
  console.error('============================================================');
  console.error('  表单设置工具 v2.1');
  console.error('============================================================');
  
  switch (command) {
    case 'get-settings': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: get-settings --app <appType> --form <formUuid>');
        process.exit(1);
      }
      await cmdGetSettings(params.appType, params.formUuid);
      break;
    }
    case 'set-title': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: set-title --app <appType> --form <formUuid> [--field <fieldIdOrName>]');
        process.exit(1);
      }
      await cmdSetTitle(params.appType, params.formUuid, params.fieldIdOrName);
      break;
    }
    case 'set-restart': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: set-restart --app <appType> --form <formUuid> --enable true|false');
        process.exit(1);
      }
      await cmdSetRestart(params.appType, params.formUuid, params.enable !== false);
      break;
    }
    case 'set-permission': {
      if (!params.appType || !params.formUuid || !params.action) {
        console.error('用法: set-permission --app <appType> --form <formUuid> --action <权限代码> --enable true|false [--packageIndex 0] [--packageUuid xxx]');
        console.error('可用权限: OPERATE_EDIT_AFTER_PROCESS(编辑), OPERATE_DELETE_AFTER_PROCESS(删除), OPERATE_PRINT_AFTER_PROCESS(打印)');
        process.exit(1);
      }
      const permOptions = {};
      if (params.packageIndex !== undefined) permOptions.packageIndex = params.packageIndex;
      if (params.packageUuid) permOptions.packageUuid = params.packageUuid;
      await cmdSetPermission(params.appType, params.formUuid, params.action, params.enable !== false, permOptions);
      break;
    }
    case 'list-permit-groups': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: list-permit-groups --app <appType> --form <formUuid> [--packageType FORM_PACKAGE_VIEW]');
        process.exit(1);
      }
      await cmdListPermitGroups(params.appType, params.formUuid, params.packageType || 'FORM_PACKAGE_VIEW');
      break;
    }
    case 'list-permissions': {
      cmdListPermissions();
      break;
    }
    case 'set': {
      if (!params.appType || !params.formUuid || !params.settings) {
        console.error('用法: set --app <appType> --form <formUuid> --settings "key1=val1,key2=val2"');
        process.exit(1);
      }
      await cmdSet(params.appType, params.formUuid, params.settings);
      break;
    }
    case 'list-fields': {
      if (!params.appType || !params.formUuid) {
        console.error('用法: list-fields --app <appType> --form <formUuid>');
        process.exit(1);
      }
      await cmdListFields(params.appType, params.formUuid);
      break;
    }
    case 'list-settings': {
      cmdListSettings();
      break;
    }
    default:
      console.error('可用命令:');
      console.error('  get-settings        获取表单当前设置');
      console.error('  set-title           设置数据标题（支持自动选择）');
      console.error('  set-restart         开启/关闭复制流程');
      console.error('  set-permission      设置查看状态权限（编辑/删除/打印等）');
      console.error('  list-permit-groups  列出权限组及权限状态');
      console.error('  set                 通用设置（key=value格式）');
      console.error('  list-fields         列出表单字段');
      console.error('  list-settings       列出所有可配置项');
      console.error('  list-permissions    列出所有可配置权限');
      console.error('');
      console.error('示例:');
      console.error('  node form-settings.js set-title --app APP_XXX --form FORM-XXX');
      console.error('  node form-settings.js set-title --app APP_XXX --form FORM-XXX --field "项目名称"');
      console.error('  node form-settings.js set-restart --app APP_XXX --form FORM-XXX --enable true');
      console.error('  node form-settings.js set-permission --app APP_XXX --form FORM-XXX --action OPERATE_EDIT_AFTER_PROCESS --enable true');
      console.error('  node form-settings.js set-permission --app APP_XXX --form FORM-XXX --action OPERATE_EDIT_AFTER_PROCESS --enable true --packageIndex 0');
      console.error('  node form-settings.js list-permit-groups --app APP_XXX --form FORM-XXX');
      console.error('  node form-settings.js set --app APP_XXX --form FORM-XXX --settings "reStart=y,showPrint=n"');
      console.error('  node form-settings.js get-settings --app APP_XXX --form FORM-XXX');
      console.error('  node form-settings.js list-settings');
      console.error('  node form-settings.js list-permissions');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行失败:', err.message);
    process.exit(1);
  });
}
