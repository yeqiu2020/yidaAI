/**
 * action-manager.js — 执行动作管理（list / add / delete / test）
 *
 * 候选轨 Skill（Phase 3 新增），使用 lib/core/http.js 进行 HTTP 请求。
 *
 * 用法：
 *   node action-manager.js list-actions --appType <appType> --connectorId <id>
 *   node action-manager.js add-action --appType <appType> --connectorId <id> --operations <action-file>
 *   node action-manager.js delete-action --appType <appType> --connectorId <id> --actionId <id>
 *   node action-manager.js test --appType <appType> --connectorId <id> --action <action-file>
 *
 * 创建日期：2026-07-10 (Phase 3)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const libCorePath = path.join(PROJECT_ROOT, 'lib', 'core');

const { httpGet, httpPost } = require(path.join(libCorePath, 'http'));
const { CliError, ErrorCode, wrapError } = require(path.join(libCorePath, 'error'));
const { loadCookieData, resolveBaseUrl } = require(path.join(libCorePath, 'utils'));

// ── API 路径构建 ───────────────────────────────────────

function buildApiPath(appType, action) {
  return '/alibaba/web/' + appType + '/query/connector/' + action + '.json?_stamp=' + Date.now();
}

// ── Cookie 加载 ────────────────────────────────────────

function getAuthData() {
  const cookieData = loadCookieData(PROJECT_ROOT);
  if (!cookieData || !cookieData.cookies || cookieData.cookies.length === 0) {
    throw new CliError(ErrorCode.NO_COOKIE, '未找到有效的登录态（Cookie）', {
      hint: '请先运行登录命令获取登录态',
    });
  }
  return {
    cookies: cookieData.cookies,
    csrfToken: cookieData.csrf_token || '',
    baseUrl: resolveBaseUrl(cookieData),
    cookieData: cookieData,
  };
}

// ── 命令实现 ───────────────────────────────────────────

/**
 * 列出连接器的执行动作
 * @param {string} appType
 * @param {string} connectorId
 * @returns {Promise<object>}
 */
async function listActions(appType, connectorId) {
  if (!appType) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  if (!connectorId) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'listActions');

  const result = await httpGet(apiPath, {
    params: { connectorId: connectorId },
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '获取执行动作列表失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  return result;
}

/**
 * 添加执行动作
 * @param {string} appType
 * @param {string} connectorId
 * @param {string} operationsFile - 动作配置文件路径
 * @returns {Promise<object>}
 */
async function addAction(appType, connectorId, operationsFile) {
  if (!appType) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  if (!connectorId) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');
  if (!operationsFile) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 operations 参数（动作配置文件路径）');

  var fullPath = path.resolve(operationsFile);
  if (!fs.existsSync(fullPath)) {
    throw new CliError(ErrorCode.FILE_NOT_FOUND, '动作配置文件不存在: ' + fullPath);
  }

  var operationsContent = fs.readFileSync(fullPath, 'utf8');
  var operations;
  try {
    operations = JSON.parse(operationsContent);
  } catch (e) {
    throw new CliError(ErrorCode.INVALID_PARAM, '动作配置文件不是有效的 JSON: ' + e.message);
  }

  // 确保 operations 是数组
  if (!Array.isArray(operations)) {
    operations = [operations];
  }

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'saveAction');

  var results = [];
  for (var i = 0; i < operations.length; i++) {
    var op = operations[i];
    var postData = querystring.stringify({
      _csrf_token: auth.csrfToken,
      connectorId: connectorId,
      operations: JSON.stringify(op),
    });

    var result = await httpPost(apiPath, postData, {
      cookies: auth.cookies,
      csrfToken: auth.csrfToken,
      baseUrl: auth.baseUrl,
    });

    if (!result.success) {
      throw new CliError(ErrorCode.API_ERROR, '添加执行动作失败: ' + (result.errorMsg || '未知错误'), {
        detail: '动作: ' + (op.operationId || op.summary || JSON.stringify(op).substring(0, 200)),
      });
    }

    results.push(result);
  }

  return { success: true, content: results };
}

/**
 * 删除执行动作
 * @param {string} appType
 * @param {string} connectorId
 * @param {string} actionId
 * @returns {Promise<object>}
 */
async function deleteAction(appType, connectorId, actionId) {
  if (!appType) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  if (!connectorId) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');
  if (!actionId) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 actionId 参数');

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'deleteAction');

  var postData = querystring.stringify({
    _csrf_token: auth.csrfToken,
    connectorId: connectorId,
    actionId: actionId,
  });

  const result = await httpPost(apiPath, postData, {
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '删除执行动作失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  return result;
}

/**
 * 测试连接器
 * @param {string} appType
 * @param {string} connectorId
 * @param {string} actionFile - 动作配置文件路径
 * @returns {Promise<object>}
 */
async function testConnector(appType, connectorId, actionFile) {
  if (!appType) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  if (!connectorId) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');
  if (!actionFile) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 action 参数（动作配置文件路径）');

  var fullPath = path.resolve(actionFile);
  if (!fs.existsSync(fullPath)) {
    throw new CliError(ErrorCode.FILE_NOT_FOUND, '动作配置文件不存在: ' + fullPath);
  }

  var actionContent = fs.readFileSync(fullPath, 'utf8');
  var action;
  try {
    action = JSON.parse(actionContent);
  } catch (e) {
    throw new CliError(ErrorCode.INVALID_PARAM, '动作配置文件不是有效的 JSON: ' + e.message);
  }

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'testConnector');

  var postData = querystring.stringify({
    _csrf_token: auth.csrfToken,
    connectorId: connectorId,
    action: JSON.stringify(action),
  });

  const result = await httpPost(apiPath, postData, {
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '测试连接器失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  return result;
}

// ── CLI 入口 ───────────────────────────────────────────

function parseArgs(args) {
  var parsed = { command: args[0], options: {} };
  for (var i = 1; i < args.length; i++) {
    var arg = args[i];
    if (arg.startsWith('--')) {
      var key = arg.substring(2);
      var value = args[i + 1];
      if (value && !value.startsWith('--')) {
        parsed.options[key] = value;
        i++;
      } else {
        parsed.options[key] = true;
      }
    }
  }
  return parsed;
}

async function main() {
  var args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node action-manager.js <command> [options]');
    console.log('');
    console.log('命令:');
    console.log('  list-actions    列出执行动作');
    console.log('  add-action      添加执行动作');
    console.log('  delete-action   删除执行动作');
    console.log('  test            测试连接器');
    process.exit(0);
  }

  var parsed = parseArgs(args);
  var cmd = parsed.command;
  var opts = parsed.options;

  try {
    switch (cmd) {
      case 'list-actions':
        if (!opts.appType || !opts.connectorId) {
          console.error('缺少参数: --appType, --connectorId 为必填');
          process.exit(1);
        }
        console.log('=== 执行动作列表 ===');
        var listResult = await listActions(opts.appType, opts.connectorId);
        var actions = listResult.content || [];
        if (Array.isArray(actions) && actions.length > 0) {
          actions.forEach(function(a) {
            console.log('  ID: ' + (a.actionId || a.id || 'N/A'));
            console.log('  名称: ' + (a.summary || a.operationId || 'N/A'));
            console.log('  方法: ' + (a.method || 'N/A'));
            console.log('  路径: ' + (a.url || 'N/A'));
            console.log('  ---');
          });
          console.log('共 ' + actions.length + ' 个动作');
        } else {
          console.log('  暂无执行动作');
        }
        break;

      case 'add-action':
        if (!opts.appType || !opts.connectorId || !opts.operations) {
          console.error('缺少参数: --appType, --connectorId, --operations 为必填');
          process.exit(1);
        }
        console.log('=== 添加执行动作 ===');
        var addResult = await addAction(opts.appType, opts.connectorId, opts.operations);
        console.log('\n=== 添加成功 ===');
        console.log('共添加 ' + addResult.content.length + ' 个动作');
        break;

      case 'delete-action':
        if (!opts.appType || !opts.connectorId || !opts.actionId) {
          console.error('缺少参数: --appType, --connectorId, --actionId 为必填');
          process.exit(1);
        }
        console.log('=== 删除执行动作 ===');
        await deleteAction(opts.appType, opts.connectorId, opts.actionId);
        console.log('\n=== 删除成功 ===');
        break;

      case 'test':
        if (!opts.appType || !opts.connectorId || !opts.action) {
          console.error('缺少参数: --appType, --connectorId, --action 为必填');
          process.exit(1);
        }
        console.log('=== 测试连接器 ===');
        var testResult = await testConnector(opts.appType, opts.connectorId, opts.action);
        console.log('\n=== 测试结果 ===');
        console.log(JSON.stringify(testResult.content, null, 2));
        break;

      default:
        console.error('未知命令: ' + cmd);
        process.exit(1);
    }
  } catch (err) {
    var cliErr = wrapError(err);
    console.error(cliErr.toString());
    process.exit(cliErr.getExitCode());
  }
}

module.exports = {
  listActions,
  addAction,
  deleteAction,
  testConnector,
};

if (require.main === module) {
  main().catch(function(e) {
    console.error('执行异常:', e);
    process.exit(1);
  });
}
