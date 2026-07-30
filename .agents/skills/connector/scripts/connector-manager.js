/**
 * connector-manager.js — 连接器管理（list / create / detail / delete）
 *
 * 候选轨 Skill（Phase 3 新增），使用 lib/core/http.js 进行 HTTP 请求。
 *
 * 用法：
 *   node connector-manager.js list --appType <appType>
 *   node connector-manager.js create --appType <appType> --name <名称> --host <域名> [--auth <鉴权> --username <用户名> --password <密码> ...]
 *   node connector-manager.js detail --appType <appType> --connectorId <id>
 *   node connector-manager.js delete --appType <appType> --connectorId <id>
 *
 * 创建日期：2026-07-10 (Phase 3)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const libCorePath = path.join(PROJECT_ROOT, 'lib', 'core');

// 加载公共库
const { httpGet, httpPost } = require(path.join(libCorePath, 'http'));
const { CliError, ErrorCode, wrapError } = require(path.join(libCorePath, 'error'));
const { loadCookieData, resolveBaseUrl } = require(path.join(libCorePath, 'utils'));

// ── 鉴权方式映射 ───────────────────────────────────────

const AUTH_TYPE_MAP = {
  'none': 'NONE',
  'basic': 'BasicAuth',
  'basicAuth': 'BasicAuth',
  'apikey': 'ApiKeyAuth',
  'apiKeyAuth': 'ApiKeyAuth',
  'ding': 'DingAuth',
  'dingAuth': 'DingAuth',
  'aliyun': 'AliyunApiGateway',
  'aliyunApiGateway': 'AliyunApiGateway',
  'dingTrust': 'DingTrustGW',
  'dingTrustGW': 'DingTrustGW',
};

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
 * 列出所有连接器
 * @param {string} appType
 * @returns {Promise<object>}
 */
async function listConnectors(appType) {
  if (!appType) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  }

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'listConnector');

  const result = await httpGet(apiPath, {
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '获取连接器列表失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  return result;
}

/**
 * 创建连接器
 * @param {string} appType
 * @param {string} name - 连接器名称
 * @param {string} host - 域名
 * @param {object} authConfig - 鉴权配置
 * @returns {Promise<object>}
 */
async function createConnector(appType, name, host, authConfig) {
  if (!appType) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  }
  if (!name) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 name 参数（连接器名称）');
  }
  if (!host) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 host 参数（域名）');
  }

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'saveConnector');

  // 构建鉴权配置
  var authType = (authConfig && authConfig.auth && AUTH_TYPE_MAP[authConfig.auth.toLowerCase()]) || 'NONE';
  var authInfo = {
    authType: authType,
  };

  if (authType === 'BasicAuth') {
    authInfo.username = (authConfig && authConfig.username) || '';
    authInfo.password = (authConfig && authConfig.password) || '';
  } else if (authType === 'ApiKeyAuth') {
    authInfo.apiKey = (authConfig && authConfig.apiKey) || '';
    authInfo.in = (authConfig && authConfig.in) || 'header';
    authInfo.headerName = (authConfig && authConfig.headerName) || 'Authorization';
  } else if (authType === 'DingAuth') {
    authInfo.appKey = (authConfig && authConfig.appKey) || '';
    authInfo.appSecret = (authConfig && authConfig.appSecret) || '';
  } else if (authType === 'AliyunApiGateway') {
    authInfo.appKey = (authConfig && authConfig.appKey) || '';
    authInfo.appSecret = (authConfig && authConfig.appSecret) || '';
  }

  var connectorConfig = {
    name: name,
    host: host,
    authInfo: JSON.stringify(authInfo),
    description: (authConfig && authConfig.description) || '',
  };

  var postData = querystring.stringify({
    _csrf_token: auth.csrfToken,
    name: connectorConfig.name,
    host: connectorConfig.host,
    authInfo: connectorConfig.authInfo,
    description: connectorConfig.description,
  });

  const result = await httpPost(apiPath, postData, {
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    // 检查权限相关错误
    if (result.errorMsg && (result.errorMsg.indexOf('权限') >= 0 || result.errorMsg.indexOf('permission') >= 0)) {
      throw new CliError(ErrorCode.API_ERROR, '创建连接器失败：企业版权限不足', {
        hint: '连接器功能需要企业版及以上版本，请检查组织版本或联系管理员升级',
        detail: result.errorMsg,
      });
    }
    throw new CliError(ErrorCode.API_ERROR, '创建连接器失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  // 保存 connector-id 到缓存
  var connectorId = result.content && (result.content.connectorId || result.content.id || result.content);
  if (connectorId) {
    saveConnectorCache(name, host, connectorId);
  }

  return result;
}

/**
 * 获取连接器详情
 * @param {string} appType
 * @param {string} connectorId
 * @returns {Promise<object>}
 */
async function getConnectorDetail(appType, connectorId) {
  if (!appType) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  }
  if (!connectorId) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');
  }

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'getConnectorDetail');

  const result = await httpGet(apiPath, {
    params: { connectorId: connectorId },
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '获取连接器详情失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  return result;
}

/**
 * 删除连接器
 * @param {string} appType
 * @param {string} connectorId
 * @returns {Promise<object>}
 */
async function deleteConnector(appType, connectorId) {
  if (!appType) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 appType 参数');
  }
  if (!connectorId) {
    throw new CliError(ErrorCode.MISSING_PARAM, '缺少 connectorId 参数');
  }

  const auth = getAuthData();
  const apiPath = buildApiPath(appType, 'deleteConnector');

  var postData = querystring.stringify({
    _csrf_token: auth.csrfToken,
    connectorId: connectorId,
  });

  const result = await httpPost(apiPath, postData, {
    cookies: auth.cookies,
    csrfToken: auth.csrfToken,
    baseUrl: auth.baseUrl,
  });

  if (!result.success) {
    throw new CliError(ErrorCode.API_ERROR, '删除连接器失败: ' + (result.errorMsg || '未知错误'), {
      detail: JSON.stringify(result).substring(0, 500),
    });
  }

  // 从缓存中移除
  removeConnectorCache(connectorId);

  return result;
}

// ── 缓存管理 ───────────────────────────────────────────

function saveConnectorCache(name, host, connectorId) {
  var cacheDir = path.join(PROJECT_ROOT, '.cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  var cacheFile = path.join(cacheDir, 'connectors.json');
  var cache = {};
  if (fs.existsSync(cacheFile)) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch (e) {
      cache = {};
    }
  }
  cache[connectorId] = {
    name: name,
    host: host,
    connectorId: connectorId,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
}

function removeConnectorCache(connectorId) {
  var cacheFile = path.join(PROJECT_ROOT, '.cache', 'connectors.json');
  if (fs.existsSync(cacheFile)) {
    try {
      var cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      delete cache[connectorId];
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
      // 忽略
    }
  }
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
    console.log('用法: node connector-manager.js <command> [options]');
    console.log('');
    console.log('命令:');
    console.log('  list      列出所有连接器');
    console.log('  create    创建连接器');
    console.log('  detail    获取连接器详情');
    console.log('  delete    删除连接器');
    console.log('');
    console.log('示例:');
    console.log('  node connector-manager.js list --appType APP_XXX');
    console.log('  node connector-manager.js create --appType APP_XXX --name "测试API" --host "api.example.com"');
    console.log('  node connector-manager.js detail --appType APP_XXX --connectorId CN_XXX');
    console.log('  node connector-manager.js delete --appType APP_XXX --connectorId CN_XXX');
    process.exit(0);
  }

  var parsed = parseArgs(args);
  var cmd = parsed.command;
  var opts = parsed.options;

  try {
    switch (cmd) {
      case 'list':
        if (!opts.appType) {
          console.error('缺少 --appType 参数');
          process.exit(1);
        }
        console.log('=== 连接器列表 ===');
        var listResult = await listConnectors(opts.appType);
        var connectors = listResult.content || [];
        if (Array.isArray(connectors) && connectors.length > 0) {
          connectors.forEach(function(c) {
            console.log('  ID: ' + (c.connectorId || c.id || 'N/A'));
            console.log('  名称: ' + (c.name || 'N/A'));
            console.log('  域名: ' + (c.host || 'N/A'));
            console.log('  鉴权: ' + (c.authType || 'N/A'));
            console.log('  ---');
          });
          console.log('共 ' + connectors.length + ' 个连接器');
        } else {
          console.log('  暂无连接器');
        }
        break;

      case 'create':
        if (!opts.appType || !opts.name || !opts.host) {
          console.error('缺少参数: --appType, --name, --host 为必填');
          process.exit(1);
        }
        console.log('=== 创建连接器 ===');
        console.log('名称: ' + opts.name);
        console.log('域名: ' + opts.host);
        console.log('鉴权: ' + (opts.auth || 'NONE'));
        var createResult = await createConnector(opts.appType, opts.name, opts.host, {
          auth: opts.auth,
          username: opts.username,
          password: opts.password,
          apiKey: opts.apiKey || opts['api-key'],
          appKey: opts.appKey || opts['app-key'],
          appSecret: opts.appSecret || opts['app-secret'],
          description: opts.description,
        });
        console.log('\n=== 创建成功 ===');
        console.log('连接器ID: ' + (createResult.content && (createResult.content.connectorId || createResult.content.id) || createResult.content));
        break;

      case 'detail':
        if (!opts.appType || !opts.connectorId) {
          console.error('缺少参数: --appType, --connectorId 为必填');
          process.exit(1);
        }
        console.log('=== 连接器详情 ===');
        var detailResult = await getConnectorDetail(opts.appType, opts.connectorId);
        var detail = detailResult.content || {};
        console.log(JSON.stringify(detail, null, 2));
        break;

      case 'delete':
        if (!opts.appType || !opts.connectorId) {
          console.error('缺少参数: --appType, --connectorId 为必填');
          process.exit(1);
        }
        console.log('=== 删除连接器 ===');
        console.log('连接器ID: ' + opts.connectorId);
        console.log('⚠️ 警告: 此操作不可逆！');
        var deleteResult = await deleteConnector(opts.appType, opts.connectorId);
        console.log('\n=== 删除成功 ===');
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
  listConnectors,
  createConnector,
  getConnectorDetail,
  deleteConnector,
  AUTH_TYPE_MAP,
};

if (require.main === module) {
  main().catch(function(e) {
    console.error('执行异常:', e);
    process.exit(1);
  });
}
