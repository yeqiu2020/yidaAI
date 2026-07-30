'use strict';

const path = require('path');
// 登录态统一委托给 lib/core/utils（与 integration-check.js 一致）
const coreUtils = require('../../../../lib/core/utils');
const { loadCookieData, resolveBaseUrl } = coreUtils;
const { triggerLogin } = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));
const { getProcess } = require('./integration-api');

/**
 * integration-get.js - 回读并展示已有逻辑流（集成自动化）的完整配置
 *
 * 用途：修改模式前先回读现有节点结构，或排查线上逻辑流的实际配置。
 * 复用设计器同款接口 getProcess.json（GET，isLogic=true）。
 */

function buildAuthRef() {
  let cookieData = loadCookieData();
  if (!cookieData) { cookieData = triggerLogin(); }
  return {
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    cookieData,
  };
}

function hasFlag(args, flagName) {
  return args.includes(flagName);
}

// 从名称对象/字符串提取中文展示名
function pickName(name) {
  if (!name) { return ''; }
  if (typeof name === 'string') { return name; }
  return name.zh_CN || name.en_US || '';
}

// 节点 type -> 中文说明（覆盖 processJson 已支持的节点类型）
const NODE_TYPE_DESC = {
  trigger: '表单事件触发',
  dataRetrieve: '获取数据',
  dataCreate: '新增数据',
  dataUpdate: '更新数据',
  dataDelete: '删除数据',
  initiateApproval: '发起审批',
  CodeExecutor: '脚本',
  route: '条件分支',
  condition: '分支条件',
  foreach: '循环',
  sendMessage: '消息通知',
  httpConnector: '连接器(HTTP)',
  innerConnector: '连接器',
  finish: '结束',
};

// 递归打印节点树（processJson.nodes / childNodes）
function printNodes(nodes, indent, lines) {
  for (const node of nodes || []) {
    if (!node || typeof node !== 'object') { continue; }
    const typeDesc = NODE_TYPE_DESC[node.type] || node.type || '未知';
    const display = pickName(node.name) || typeDesc;
    const nextIds = Array.isArray(node.nextId) ? node.nextId.filter(Boolean).join(', ') : '';
    lines.push(
      `${indent}- [${typeDesc}] ${display} (nodeId=${node.nodeId || '-'}` +
      (nextIds ? `, next=${nextIds}` : '') + ')'
    );
    if (Array.isArray(node.childNodes) && node.childNodes.length > 0) {
      printNodes(node.childNodes, indent + '  ', lines);
    }
  }
}

async function run(args) {
  if (!args.length || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.error('用法: node integration-get.js <appType> <processCode> [选项]');
    console.error('');
    console.error('选项:');
    console.error('  --json                   输出完整 JSON（含 processJson/viewJson）');
    console.error('  --raw                    输出接口原始 content');
    process.exit(0);
  }

  const outputJson = hasFlag(args, '--json');
  const outputRaw = hasFlag(args, '--raw');
  const positional = args.filter((arg) => !arg.startsWith('-'));
  const appType = positional[0];
  const processCode = positional[1];

  if (!appType || !processCode) {
    console.error('错误: 请提供 <appType> 和 <processCode>');
    console.error('用法: node integration-get.js <appType> <processCode> [选项]');
    process.exit(1);
  }

  const authRef = buildAuthRef();
  let content;
  try {
    content = await getProcess(authRef, { appType, processCode });
  } catch (error) {
    console.error('回读失败: ' + error.message);
    console.log(JSON.stringify({ success: false, error: error.message }));
    process.exit(1);
  }

  if (outputRaw) {
    console.log(JSON.stringify(content, null, 2));
    return;
  }

  const processJson = content.json && typeof content.json === 'object' && Array.isArray(content.json.nodes) ? content.json : {};
  let nodes = Array.isArray(processJson.nodes) ? processJson.nodes : [];

  // Fallback: if processJson has no nodes, parse viewJson schema.children
  if (nodes.length === 0 && content.schema && Array.isArray(content.schema.children)) {
    nodes = content.schema.children.map((child) => {
      const props = child.props || {};
      const typeMap = {
        StartNode: 'trigger', AddDataNode: 'dataCreate',
        GetSingleDataNode: 'dataRetrieve', GetMultipleDataNode: 'dataRetrieve',
        UpdateDataNode: 'dataUpdate', DeleteDataNode: 'dataDelete',
        ScriptNode: 'CodeExecutor', ConditionNode: 'route',
        ConnectorNode: 'httpConnector', SendMessageNode: 'sendMessage', EndNode: 'finish',
      };
      let flatProps = { ...props };
      if (child.componentName === 'UpdateDataNode' && props.updateDataRules) {
        flatProps = { ...props, ...props.updateDataRules };
        delete flatProps.updateDataRules;
      }
      if (child.componentName === 'AddDataNode' && props.addDataRules) {
        flatProps = { ...props, ...props.addDataRules };
        delete flatProps.addDataRules;
      }
      return {
        type: typeMap[child.componentName] || child.componentName,
        nodeId: child.id,
        name: props.name || props.nodeName || '',
        props: flatProps,
      };
    });
  }

  if (outputJson) {
    console.log(JSON.stringify({
      success: true,
      appType,
      processCode,
      name: pickName(content.name) || content.name || '',
      nodeCount: nodes.length,
      processJson,
      viewJson: content.viewJson,
    }, null, 2));
    return;
  }

  const SEP = '='.repeat(50);
  console.error(SEP);
  console.error('逻辑流配置回读');
  console.error(SEP);
  console.error('应用ID: ' + appType);
  console.error('processCode: ' + processCode);
  console.error('逻辑流名称: ' + (pickName(content.name) || content.name || '-'));
  console.error('节点数量: ' + nodes.length);
  console.error(SEP);

  if (!nodes.length) {
    console.error('未解析到节点（可能接口未返回 json 或结构异常，可用 --raw 查看原始内容）');
    return;
  }

  const lines = [];
  printNodes(nodes, '', lines);
  console.log(lines.join('\n'));
}

const args = process.argv.slice(2);
run(args).catch((err) => {
  console.error('执行异常: ' + err.message);
  console.log(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
