/**
 * smart-create.js — 智能创建（cURL 解析 / API 文档解析 / gen-template）
 *
 * 候选轨 Skill（Phase 3 新增），解析 cURL 命令或 API 文档，
 * 自动生成连接器配置和执行动作，然后调用 connector-manager 创建。
 *
 * 用法：
 *   node smart-create.js --appType <appType> --curl "curl 'https://...'" --name <名称>
 *   node smart-create.js --appType <appType> --doc <api-doc.md路径>
 *   node smart-create.js gen-template
 *
 * 创建日期：2026-07-10 (Phase 3)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const { CliError, ErrorCode, wrapError } = require(path.join(PROJECT_ROOT, 'lib', 'core', 'error'));
const connectorManager = require(path.join(__dirname, 'connector-manager.js'));
const actionManager = require(path.join(__dirname, 'action-manager.js'));

// ── cURL 解析 ──────────────────────────────────────────

/**
 * 解析 cURL 命令，提取 URL、method、headers、body
 * @param {string} curlCommand - cURL 命令字符串
 * @returns {object} - { url, method, host, path, headers, body, auth }
 */
function parseCurl(curlCommand) {
  if (!curlCommand || typeof curlCommand !== 'string') {
    throw new CliError(ErrorCode.INVALID_PARAM, 'cURL 命令不能为空');
  }

  var result = {
    method: 'GET',
    headers: {},
    body: null,
    auth: null,
  };

  // 提取 URL：优先匹配引号内的 URL 或 http(s):// 开头的裸 URL
  // 避免把 -X/-H/-d 等选项误识别为 URL
  var urlMatch = curlCommand.match(/curl\s+.*?(?:['"](https?:\/\/[^'"]+)['"]|(https?:\/\/\S+))/);
  if (!urlMatch) {
    // 回退：尝试匹配引号内的任意 URL（可能不含 http 前缀，如相对路径）
    urlMatch = curlCommand.match(/curl\s+.*?['"]([^'"]+)['"]/);
    if (urlMatch) result.url = urlMatch[1];
  } else {
    result.url = urlMatch[1] || urlMatch[2];
  }

  // 也处理 -X 方法
  var methodMatch = curlCommand.match(/-X\s+(GET|POST|PUT|DELETE|PATCH)/i);
  if (methodMatch) {
    result.method = methodMatch[1].toUpperCase();
  }

  // 如果有 -d/--data，默认为 POST
  if (curlCommand.match(/-d\s+|--data\s+|--data-raw\s+/)) {
    result.method = 'POST';
  }

  // 解析 URL 获取 host 和 path
  if (result.url) {
    try {
      var parsed = new URL(result.url);
      result.host = parsed.hostname;
      result.path = parsed.pathname + (parsed.search || '');
      result.protocol = parsed.protocol;
    } catch (e) {
      throw new CliError(ErrorCode.INVALID_PARAM, '无法解析 cURL 中的 URL: ' + result.url);
    }
  } else {
    throw new CliError(ErrorCode.INVALID_PARAM, 'cURL 命令中未找到 URL');
  }

  // 提取 headers
  var headerRegex = /-H\s+['"]([^'"]+)['"]/g;
  var headerMatch;
  while ((headerMatch = headerRegex.exec(curlCommand)) !== null) {
    var headerParts = headerMatch[1].split(':');
    if (headerParts.length >= 2) {
      var headerName = headerParts[0].trim();
      var headerValue = headerParts.slice(1).join(':').trim();
      result.headers[headerName] = headerValue;

      // 检测鉴权方式
      if (headerName.toLowerCase() === 'authorization') {
        if (headerValue.startsWith('Bearer ')) {
          result.auth = { type: 'ApiKeyAuth', in: 'header', headerName: 'Authorization', prefix: 'Bearer' };
        } else if (headerValue.startsWith('Basic ')) {
          result.auth = { type: 'BasicAuth' };
        }
      }
    }
  }

  // 提取 body
  var bodyMatch = curlCommand.match(/(?:-d|--data|--data-raw)\s+['"]([^'"]+)['"]/);
  if (bodyMatch) {
    result.body = bodyMatch[1];
    if (!result.headers['Content-Type']) {
      result.headers['Content-Type'] = 'application/json';
    }
  }

  return result;
}

/**
 * 从 cURL 解析结果生成连接器配置
 * @param {object} parsed - parseCurl 的返回值
 * @param {string} name - 连接器名称
 * @returns {object} - { name, host, authConfig, actions }
 */
function buildConnectorFromCurl(parsed, name) {
  var authConfig = { auth: 'NONE' };
  if (parsed.auth) {
    authConfig.auth = parsed.auth.type;
  }

  // 生成执行动作
  var action = buildActionFromParsed(parsed, name || '默认动作');

  return {
    name: name,
    host: parsed.host,
    authConfig: authConfig,
    actions: [action],
  };
}

/**
 * 从解析结果构建执行动作配置
 * @param {object} parsed - parseCurl 的返回值
 * @param {string} actionName - 动作名称
 * @returns {object} - 执行动作配置
 */
function buildActionFromParsed(parsed, actionName) {
  var inputs = [];
  var parameters = {};

  // Headers 分组
  var headerItems = [];
  for (var hName in parsed.headers) {
    if (hName.toLowerCase() === 'authorization') continue; // 鉴权头由连接器处理
    headerItems.push({
      componentName: 'TextField',
      defaultValue: parsed.headers[hName],
      desc: hName,
      name: hName,
      required: false,
    });
  }
  if (headerItems.length > 0) {
    inputs.push({
      childList: headerItems,
      desc: '请求头',
      name: 'Headers',
      paramType: 'Object',
      required: false,
    });
    parameters.header = headerItems.map(function(h) {
      return { name: h.name, value: h.defaultValue };
    });
  }

  // Body 分组（POST/PUT）
  if (parsed.body && (parsed.method === 'POST' || parsed.method === 'PUT' || parsed.method === 'PATCH')) {
    var bodyFields = [];
    try {
      var bodyObj = JSON.parse(parsed.body);
      for (var fieldName in bodyObj) {
        bodyFields.push({
          componentName: 'TextField',
          name: fieldName,
          label: fieldName,
          desc: fieldName,
          required: false,
          __level: 0,
          hidden: false,
        });
      }
    } catch (e) {
      // 非 JSON body
    }

    inputs.push({
      defaultValue: parsed.body || '{}',
      desc: '请求体',
      name: 'Body',
      paramType: 'Object',
      required: false,
      childList: bodyFields,
    });
    parameters.body = { default: parsed.body || '{}' };
  }

  return {
    id: 'action_' + Date.now(),
    operationId: (actionName || 'action').replace(/\s+/g, '_'),
    summary: actionName || '默认动作',
    description: actionName || '默认动作',
    url: parsed.path,
    method: parsed.method.toLowerCase(),
    inputs: inputs,
    parameters: parameters,
    responses: { type: 'object', properties: {} },
    outputs: [],
    origin: true,
  };
}

// ── API 文档解析 ───────────────────────────────────────

/**
 * 解析 API 文档（Markdown 格式），提取接口信息
 * @param {string} docPath - 文档文件路径
 * @returns {object} - { connectors: [{ name, host, authConfig, actions }] }
 */
function parseApiDoc(docPath) {
  var fullPath = path.resolve(docPath);
  if (!fs.existsSync(fullPath)) {
    throw new CliError(ErrorCode.FILE_NOT_FOUND, 'API 文档不存在: ' + fullPath);
  }

  var content = fs.readFileSync(fullPath, 'utf8');
  var connectors = [];

  // 提取基础信息
  var nameMatch = content.match(/##\s+连接器名称\s*\n\s*(.+)/);
  var hostMatch = content.match(/##\s+域名\s*\n\s*(.+)/);
  var authMatch = content.match(/##\s+鉴权方式\s*\n\s*(.+)/);

  var connectorName = nameMatch ? nameMatch[1].trim() : 'API连接器';
  var host = hostMatch ? hostMatch[1].trim() : '';
  var authType = authMatch ? authMatch[1].trim() : 'NONE';

  if (!host) {
    // 尝试从接口路径推断
    var apiMatch = content.match(/https?:\/\/([^\/\s]+)/);
    if (apiMatch) {
      host = apiMatch[1];
    } else {
      throw new CliError(ErrorCode.INVALID_PARAM, 'API 文档中未找到域名信息');
    }
  }

  // 提取接口定义
  var actionRegex = /###\s+(.+)\n[\s\S]*?-+\s*方法:\s*(\w+)\s*\n\s*路径:\s*(\S+)\s*\n/g;
  var actionMatch;
  var actions = [];

  while ((actionMatch = actionRegex.exec(content)) !== null) {
    var actionName = actionMatch[1].trim();
    var method = actionMatch[2].trim().toUpperCase();
    var urlPath = actionMatch[3].trim();

    actions.push({
      id: 'action_' + Date.now() + '_' + actions.length,
      operationId: actionName.replace(/\s+/g, '_'),
      summary: actionName,
      description: actionName,
      url: urlPath,
      method: method.toLowerCase(),
      inputs: [
        {
          childList: [
            { componentName: 'TextField', defaultValue: 'application/json', desc: 'Content-Type', name: 'Content-Type', required: false },
          ],
          desc: '请求头',
          name: 'Headers',
          paramType: 'Object',
          required: false,
        },
      ],
      parameters: {
        header: [{ name: 'Content-Type', value: 'application/json' }],
      },
      responses: { type: 'object', properties: {} },
      outputs: [],
      origin: true,
    });
  }

  // 如果没有找到接口定义，尝试简单的接口列表解析
  if (actions.length === 0) {
    var simpleRegex = /\|\s*(GET|POST|PUT|DELETE)\s*\|\s*(\S+)\s*\|\s*(.+)\s*\|/g;
    var simpleMatch;
    while ((simpleMatch = simpleRegex.exec(content)) !== null) {
      actions.push({
        id: 'action_' + Date.now() + '_' + actions.length,
        operationId: simpleMatch[3].trim().replace(/\s+/g, '_'),
        summary: simpleMatch[3].trim(),
        description: simpleMatch[3].trim(),
        url: simpleMatch[2].trim(),
        method: simpleMatch[1].toLowerCase(),
        inputs: [],
        parameters: {},
        responses: { type: 'object', properties: {} },
        outputs: [],
        origin: true,
      });
    }
  }

  connectors.push({
    name: connectorName,
    host: host,
    authConfig: { auth: authType },
    actions: actions,
  });

  return { connectors: connectors };
}

// ── 生成模板 ───────────────────────────────────────────

/**
 * 生成 API 文档模板
 * @returns {string} - 模板内容
 */
function generateTemplate() {
  return [
    '# API 接口文档',
    '',
    '## 连接器名称',
    '我的API连接器',
    '',
    '## 域名',
    'api.example.com',
    '',
    '## 鉴权方式',
    'NONE',
    '',
    '> 可选值：NONE / BasicAuth / ApiKeyAuth / DingAuth / AliyunApiGateway / DingTrustGW',
    '',
    '---',
    '',
    '### 查询用户列表',
    '---',
    '方法: GET',
    '路径: /v1/users',
    '',
    '### 创建用户',
    '---',
    '方法: POST',
    '路径: /v1/users',
    '',
    '### 更新用户',
    '---',
    '方法: PUT',
    '路径: /v1/users/{id}',
    '',
    '### 删除用户',
    '---',
    '方法: DELETE',
    '路径: /v1/users/{id}',
    '',
  ].join('\n');
}

// ── 智能创建流程 ───────────────────────────────────────

/**
 * 从 cURL 智能创建连接器
 * @param {string} appType
 * @param {string} curlCommand
 * @param {string} name
 * @returns {Promise<object>}
 */
async function smartCreateFromCurl(appType, curlCommand, name) {
  console.log('=== 智能创建连接器（cURL）===');

  // 1. 解析 cURL
  console.log('[Step 1] 解析 cURL 命令...');
  var parsed = parseCurl(curlCommand);
  console.log('  URL: ' + parsed.url);
  console.log('  方法: ' + parsed.method);
  console.log('  域名: ' + parsed.host);
  console.log('  路径: ' + parsed.path);

  // 2. 构建连接器配置
  console.log('[Step 2] 构建连接器配置...');
  var config = buildConnectorFromCurl(parsed, name);

  // 3. 创建连接器
  console.log('[Step 3] 创建连接器...');
  var createResult = await connectorManager.createConnector(appType, config.name, config.host, config.authConfig);
  var connectorId = createResult.content && (createResult.content.connectorId || createResult.content.id) || createResult.content;
  console.log('  连接器ID: ' + connectorId);

  // 4. 保存执行动作到临时文件
  if (config.actions && config.actions.length > 0) {
    console.log('[Step 4] 添加执行动作...');
    var cacheDir = path.join(PROJECT_ROOT, '.cache', 'connector', 'actions');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    var actionFile = path.join(cacheDir, 'actions_' + Date.now() + '.json');
    fs.writeFileSync(actionFile, JSON.stringify(config.actions, null, 2), 'utf8');

    var addResult = await actionManager.addAction(appType, connectorId, actionFile);
    console.log('  添加了 ' + addResult.content.length + ' 个动作');
  }

  console.log('\n=== 智能创建成功 ===');
  console.log('连接器ID: ' + connectorId);
  console.log('连接器名称: ' + config.name);

  return { success: true, connectorId: connectorId, name: config.name };
}

/**
 * 从 API 文档智能创建连接器
 * @param {string} appType
 * @param {string} docPath
 * @returns {Promise<object>}
 */
async function smartCreateFromDoc(appType, docPath) {
  console.log('=== 智能创建连接器（API 文档）===');

  // 1. 解析文档
  console.log('[Step 1] 解析 API 文档...');
  var parsed = parseApiDoc(docPath);
  console.log('  发现 ' + parsed.connectors.length + ' 个连接器定义');

  var results = [];
  for (var i = 0; i < parsed.connectors.length; i++) {
    var config = parsed.connectors[i];
    console.log('\n[Step ' + (i + 2) + '] 创建连接器: ' + config.name);

    // 创建连接器
    var createResult = await connectorManager.createConnector(appType, config.name, config.host, config.authConfig);
    var connectorId = createResult.content && (createResult.content.connectorId || createResult.content.id) || createResult.content;
    console.log('  连接器ID: ' + connectorId);

    // 添加执行动作
    if (config.actions && config.actions.length > 0) {
      var cacheDir = path.join(PROJECT_ROOT, '.cache', 'connector', 'actions');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      var actionFile = path.join(cacheDir, 'actions_' + Date.now() + '_' + i + '.json');
      fs.writeFileSync(actionFile, JSON.stringify(config.actions, null, 2), 'utf8');

      var addResult = await actionManager.addAction(appType, connectorId, actionFile);
      console.log('  添加了 ' + addResult.content.length + ' 个动作');
    }

    results.push({ connectorId: connectorId, name: config.name });
  }

  console.log('\n=== 智能创建成功 ===');
  console.log('共创建 ' + results.length + ' 个连接器');
  return { success: true, connectors: results };
}

// ── CLI 入口 ───────────────────────────────────────────

function parseArgs(args) {
  var parsed = { command: args[0] || '', options: {} };
  for (var i = 0; i < args.length; i++) {
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
    console.log('用法: node smart-create.js [command] [options]');
    console.log('');
    console.log('命令:');
    console.log('  (无命令)    从 cURL 或文档创建');
    console.log('  gen-template  生成 API 文档模板');
    console.log('');
    console.log('选项:');
    console.log('  --appType <appType>   应用ID');
    console.log('  --curl <cURL命令>     cURL 命令');
    console.log('  --doc <文档路径>      API 文档路径');
    console.log('  --name <名称>         连接器名称');
    process.exit(0);
  }

  // gen-template 命令
  if (args[0] === 'gen-template') {
    var template = generateTemplate();
    var outputPath = path.join(PROJECT_ROOT, '.cache', 'connector', 'api-doc-template.md');
    var outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, template, 'utf8');
    console.log('API 文档模板已生成: ' + outputPath);
    process.exit(0);
  }

  var parsed = parseArgs(args);
  var opts = parsed.options;

  try {
    if (!opts.appType) {
      console.error('缺少 --appType 参数');
      process.exit(1);
    }

    if (opts.curl) {
      await smartCreateFromCurl(opts.appType, opts.curl, opts.name || '智能创建连接器');
    } else if (opts.doc) {
      await smartCreateFromDoc(opts.appType, opts.doc);
    } else {
      console.error('请提供 --curl 或 --doc 参数');
      process.exit(1);
    }
  } catch (err) {
    var cliErr = wrapError(err);
    console.error(cliErr.toString());
    process.exit(cliErr.getExitCode());
  }
}

module.exports = {
  parseCurl,
  buildConnectorFromCurl,
  parseApiDoc,
  generateTemplate,
  smartCreateFromCurl,
  smartCreateFromDoc,
};

if (require.main === module) {
  main().catch(function(e) {
    console.error('执行异常:', e);
    process.exit(1);
  });
}
