'use strict';

const fs = require('fs');
const path = require('path');
const { loadCookieData, triggerLogin, resolveBaseUrl } = require(path.resolve(__dirname, '../../yida-api-client/scripts/api_client'));
const { listLogicflows, listFormLogicflows, listLogicflowLogs } = require('./integration-api');

const LOG_STATUS = {
  success: '3',
  exception: '2',
  running: '0',
};

const DEFAULT_FLOW_TYPES = ['1', '2', '3', '5', '6'];
const VALUE_FLAGS = new Set(['--output', '-o', '--log-page-size', '--max-log-pages', '--status', '--flow-types']);

function normalizeLogStatus(value) {
  if (!value || value === 'exception') { return LOG_STATUS.exception; }
  if (value === 'success') { return LOG_STATUS.success; }
  if (value === 'running') { return LOG_STATUS.running; }
  if (['0', '2', '3'].includes(String(value))) { return String(value); }
  throw new Error('不支持的日志状态：' + value + '。可选值：exception/success/running/0/2/3');
}

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

function parseFlag(args, flagName) {
  const index = args.indexOf(flagName);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('-')) {
    return args[index + 1];
  }
  return null;
}

function hasFlag(args, flagName) {
  return args.includes(flagName);
}

function parseAppTypes(args) {
  return args.filter((arg, index) => {
    if (arg.startsWith('-')) { return false; }
    return !VALUE_FLAGS.has(args[index - 1]);
  });
}

function appendFlow(result, group, flow) {
  if (!flow || !flow.processCode || result.seenProcessCodes.has(flow.processCode)) { return; }
  result.seenProcessCodes.add(flow.processCode);
  result.flows.push({
    appType: result.appType,
    formUuid: flow.formUuid || group.formUuid || '',
    formTitle: group.formTitle || flow.formTitle || '',
    formType: group.formType || flow.formType || '',
    name: flow.name || '',
    processCode: flow.processCode,
    status: flow.status || '',
    eventName: flow.eventName || '',
    eventType: flow.eventType || group.eventType || null,
    executeByOrder: flow.executeByOrder,
    gmtModified: flow.gmtModified || '',
    lastAction: flow.lastAction || '',
    modifier: flow.modifier || '',
  });
}

function collectFlowsFromListResponse(result, response) {
  const groups = response.data || [];
  for (const item of groups) {
    if (Array.isArray(item.flowList)) {
      for (const flow of item.flowList) {
        appendFlow(result, item, flow);
      }
    } else {
      appendFlow(result, {}, item);
    }
  }
}

async function listAllFlowsForForm(authRef, appType, formUuid, baseGroup, options) {
  options = options || {};
  const pageSize = options.pageSize || 10;
  const type = options.type || '1';
  const flows = { appType, flows: [], seenProcessCodes: new Set() };
  let pageIndex = 1;
  let totalCount = null;

  do {
    const response = await listFormLogicflows(authRef, {
      appType, formUuid, type, pageIndex, pageSize,
    });
    collectFlowsFromListResponse(flows, response);
    totalCount = response.totalCount || totalCount;
    pageIndex++;
  } while (totalCount && (pageIndex - 1) * pageSize < totalCount);

  return flows.flows.map((flow) => ({
    ...flow,
    formTitle: flow.formTitle || baseGroup.formTitle || '',
    formType: flow.formType || baseGroup.formType || '',
  }));
}

async function listAllLogicflows(authRef, appType, options) {
  options = options || {};
  const pageSize = options.pageSize || 10;
  const flowTypes = options.flowTypes || DEFAULT_FLOW_TYPES;
  const result = { appType, flows: [], seenProcessCodes: new Set() };

  for (const type of flowTypes) {
    const groupsWithMore = [];
    let pageIndex = 1;
    let totalCount = null;

    do {
      const response = await listLogicflows(authRef, {
        appType, type, pageIndex, pageSize,
      });
      collectFlowsFromListResponse(result, response);
      for (const group of response.data || []) {
        if (group && group.formUuid && group.hasMore) {
          groupsWithMore.push(group);
        }
      }
      totalCount = response.totalCount || totalCount;
      pageIndex++;
    } while (totalCount && (pageIndex - 1) * pageSize < totalCount);

    for (const group of groupsWithMore) {
      const formFlows = await listAllFlowsForForm(authRef, appType, group.formUuid, group, { pageSize, type });
      for (const flow of formFlows) {
        appendFlow(result, group, flow);
      }
    }
  }

  return result.flows;
}

async function collectAbnormalFlows(authRef, appType, options) {
  options = options || {};
  const status = normalizeLogStatus(options.status || 'exception');
  const logPageSize = options.logPageSize || 10;
  const maxLogPages = options.maxLogPages || 1;
  const flows = await listAllLogicflows(authRef, appType, {
    pageSize: 10,
    flowTypes: options.flowTypes || DEFAULT_FLOW_TYPES,
  });

  const abnormalFlows = [];

  for (let index = 0; index < flows.length; index++) {
    const flow = flows[index];
    const logs = [];
    let totalCount = 0;
    for (let pageIndex = 1; pageIndex <= maxLogPages; pageIndex++) {
      const logResponse = await listLogicflowLogs(authRef, {
        appType, processCode: flow.processCode, status, pageIndex, pageSize: logPageSize,
      });
      totalCount = logResponse.totalCount || totalCount;
      logs.push(...(logResponse.data || []));
      if (!totalCount || pageIndex * logPageSize >= totalCount) { break; }
    }
    if (totalCount > 0 || logs.length > 0) {
      abnormalFlows.push({ ...flow, abnormalLogCount: totalCount || logs.length, logs });
    }
  }

  return { appType, totalFlows: flows.length, abnormalFlows };
}

function formatTimestamp(value) {
  if (value === undefined || value === null || value === '') { return ''; }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) { return String(value); }
  const timestamp = numeric < 10000000000 ? numeric * 1000 : numeric;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) { return String(value); }
  const pad = (part) => String(part).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function printTextResult(result) {
  console.error('检查完成: ' + result.checkedApps.length + ' 个应用, ' +
    result.totalFlows + ' 条逻辑流, ' + result.abnormalFlows.length + ' 条异常');
  if (result.errors.length) {
    console.error('失败应用: ' + result.errors.length);
  }
  if (!result.abnormalFlows.length) {
    console.error('未发现异常日志');
    return;
  }
  for (const flow of result.abnormalFlows) {
    console.log([
      flow.appType,
      flow.formTitle || flow.formUuid || '-',
      flow.name || '-',
      flow.processCode,
      '异常日志 ' + flow.abnormalLogCount,
    ].join('\t'));
    for (const log of flow.logs || []) {
      console.log([
        '',
        log.procInstId || '-',
        log.formInstId || '-',
        log.exceptionEntity || '-',
        log.finishDate || log.finishTime || log.createDate || '-',
      ].join('\t'));
    }
  }
}

async function run(args) {
  if (!args.length || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.error('用法: node integration-check.js <appType> [appType2 ...] [选项]');
    console.error('');
    console.error('选项:');
    console.error('  --status <status>        日志状态筛选: exception/success/running');
    console.error('  --json                   输出JSON格式');
    console.error('  --output <path>          导出Excel报告');
    console.error('  --log-page-size <n>      日志每页数量（默认10）');
    console.error('  --max-log-pages <n>      最大日志页数（默认1）');
    console.error('  --flow-types <types>     逻辑流类型（逗号分隔）');
    console.error('  --no-progress            不显示进度条');
    process.exit(0);
  }

  const outputJson = hasFlag(args, '--json');
  const outputPath = parseFlag(args, '--output') || parseFlag(args, '-o');
  const logPageSize = Number(parseFlag(args, '--log-page-size') || 10);
  const maxLogPages = Number(parseFlag(args, '--max-log-pages') || 1);
  const status = normalizeLogStatus(parseFlag(args, '--status') || 'exception');
  const flowTypes = (parseFlag(args, '--flow-types') || DEFAULT_FLOW_TYPES.join(','))
    .split(',').map((item) => item.trim()).filter(Boolean);
  const appTypes = parseAppTypes(args);

  if (!appTypes.length) {
    console.error('错误: 请指定至少一个 appType');
    process.exit(1);
  }

  if (!outputJson) {
    console.error('集成自动化运行日志检查');
    console.error('状态筛选: ' + status);
  }

  const authRef = buildAuthRef();
  const result = {
    checkedApps: appTypes,
    totalFlows: 0,
    abnormalFlows: [],
    errors: [],
  };

  for (const appType of appTypes) {
    try {
      if (!outputJson) {
        console.error('正在检查: ' + appType);
      }
      const appResult = await collectAbnormalFlows(authRef, appType, {
        status, logPageSize, maxLogPages, flowTypes,
      });
      result.totalFlows += appResult.totalFlows;
      result.abnormalFlows.push(...appResult.abnormalFlows);
    } catch (error) {
      result.errors.push({ appType, message: error.message });
    }
  }

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printTextResult(result);
  if (result.errors.length) {
    process.exitCode = 1;
  }
}

const args = process.argv.slice(2);
run(args).catch((err) => {
  console.error('执行异常: ' + err.message);
  process.exit(1);
});
