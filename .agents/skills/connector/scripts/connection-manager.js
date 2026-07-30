/**
 * connection-manager.js — 连接账号管理（list / create）
 *
 * 候选轨 Skill（Phase 3 新增），使用 lib/core/http.js 进行 HTTP 请求。
 *
 * 用法：
 *   node connection-manager.js list-connections --appType <appType> --connectorId <id>
 *   node connection-manager.js create-connection --appType <appType> --connectorId <id> --name <账号名> [--username <用户名> --password <密码> --api-key <密钥>]
 *
 * 创建日期：2026-07-10 (Phase 3)
 */

'use strict';

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
 * 列出连接账号
 * @param {string} appType
 * @param {string} connectorId
 * @returns {Promise<object>}
 */
async function listConnections(appType, connectorId) {
  if (!appType) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  if (!connectorId) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'listConnections');

  const result = await httpGet(apiPath, {
    params: { connectorId: connectorId },
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '获取连接账号列表失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  return result;
}

/**
 * 创建连接账号
 * @param {string} appType
 * @param {string} connectorId
 * @param {string} name - 账号名称
 * @param {object} credentials - 凭证信息
 * @returns {Promise<object>}
 */
async function createConnection(appType, connectorId, name, credentials) {
  if (!appType) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  if (!connectorId) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');
  if (!name) throw new CliError(ErrorCode.MISSING_PARAM, '缺少 name 参数（账号名称）');

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'saveConnection');

  var authInfo = {};
  if (credentials) {
    if (credentials.username) authInfo.username = credentials.username;
    if (credentials.password) authInfo.password = credentials.password;
    if (credentials.apiKey) authInfo.apiKey = credentials.apiKey;
    if (credentials.appKey) authInfo.appKey = credentials.appKey;
    if (credentials.appSecret) authInfo.appSecret = credentials.appSecret;
  }

  var postData = querystring.stringify({
    _csrf_token: auth.csrfToken,
    connectorId: connectorId,
    name: name,
    authInfo: JSON.stringify(authInfo),
  });

  const result = await httpPost(apiPath, postData, {
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '创建连接账号失败: ' + (result.errorMsg || '未知错误'), {
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
    console.log('用法: node connection-manager.js <command> [options]');
    console.log('');
    console.log('命令:');
    console.log('  list-connections    列出连接账号');
    console.log('  create-connection   创建连接账号');
    process.exit(0);
  }

  var parsed = parseArgs(args);
  var cmd = parsed.command;
  var opts = parsed.options;

  try {
    switch (cmd) {
      case 'list-connections':
        if (!opts.appType || !opts.connectorId) {
          console.error('缺少参数: --appType, --connectorId 为必填');
          process.exit(1);
        }
        console.log('=== 连接账号列表 ===');
        var listResult = await listConnections(opts.appType, opts.connectorId);
        var connections = listResult.content || [];
        if (Array.isArray(connections) && connections.length > 0) {
          connections.forEach(function(c) {
            console.log('  ID: ' + (c.connectionId || c.id || 'N/A'));
            console.log('  名称: ' + (c.name || 'N/A'));
            console.log('  状态: ' + (c.status || 'N/A'));
            console.log('  ---');
          });
          console.log('共 ' + connections.length + ' 个账号');
        } else {
          console.log('  暂无连接账号');
        }
        break;

      case 'create-connection':
        if (!opts.appType || !opts.connectorId || !opts.name) {
          console.error('缺少参数: --appType, --connectorId, --name 为必填');
          process.exit(1);
        }
        console.log('=== 创建连接账号 ===');
        var createResult = await createConnection(opts.appType, opts.connectorId, opts.name, {
          username: opts.username,
          password: opts.password,
          apiKey: opts.apiKey || opts['api-key'],
          appKey: opts.appKey || opts['app-key'],
          appSecret: opts.appSecret || opts['app-secret'],
        });
        console.log('\n=== 创建成功 ===');
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
  listConnections,
  createConnection,
};

if (require.main === module) {
  main().catch(function(e) {
    console.error('执行异常:', e);
    process.exit(1);
  });
}
