'use strict';

const path = require('path');
const { loadCookieData, triggerLogin, resolveBaseUrl } = require(path.resolve(__dirname, '../../yida-api-client/scripts/api_client'));
const { listLogicflows, switchLogicflow } = require('./integration-api');

async function createAuthRef() {
  let cookieData = loadCookieData();
  if (!cookieData) {
    cookieData = triggerLogin();
  }
  return {
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    cookieData,
  };
}

function parseListArgs(args) {
  const parsed = {
    appType: '',
    formUuid: '',
    status: '',
    key: '',
    pageIndex: 1,
    pageSize: 50,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--form-uuid' && args[i + 1]) {
      parsed.formUuid = args[++i];
    } else if (arg === '--status' && args[i + 1]) {
      parsed.status = args[++i];
    } else if (arg === '--key' && args[i + 1]) {
      parsed.key = args[++i];
    } else if (arg === '--page' && args[i + 1]) {
      const n = Number.parseInt(args[++i], 10);
      if (Number.isFinite(n) && n > 0) { parsed.pageIndex = n; }
    } else if (arg === '--size' && args[i + 1]) {
      const n = Number.parseInt(args[++i], 10);
      if (Number.isFinite(n) && n > 0) { parsed.pageSize = Math.min(n, 100); }
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (!arg.startsWith('--') && !parsed.appType) {
      parsed.appType = arg;
    }
  }
  return parsed;
}

function flattenFlowList(content) {
  const groups = (content && content.data) || [];
  const flows = [];
  for (const group of groups) {
    const formUuid = group.formUuid || '';
    const formName = group.formName || group.title || '';
    const flowList = Array.isArray(group.flowList) ? group.flowList : [];
    for (const flow of flowList) {
      flows.push({
        formUuid,
        formName,
        processCode: flow.processCode || '',
        name: flow.name || flow.title || '',
        status: flow.status || '',
        gmtModified: flow.gmtModified || flow.gmtCreate || '',
        modifier: flow.modifier || flow.creator || '',
      });
    }
  }
  return flows;
}

function printFlowTable(flows) {
  if (process.env.YIDA_QUIET === '1') { return; }
  if (flows.length === 0) {
    console.error('  （无匹配的逻辑流）');
    return;
  }
  console.error('\n  逻辑流列表');
  console.error('  ' + '-'.repeat(96));
  console.error('  ' + '状态'.padEnd(6) + 'processCode'.padEnd(28) + 'name'.padEnd(28) + 'formUuid');
  console.error('  ' + '-'.repeat(96));
  for (const flow of flows) {
    const statusTag = flow.status === 'y' ? '启用  ' : '停用  ';
    console.error('  ' + statusTag + flow.processCode.padEnd(28) + (flow.name || '-').padEnd(28) + flow.formUuid);
  }
  console.error('  ' + '-'.repeat(96) + '\n');
}

async function runList(args) {
  const parsed = parseListArgs(args);
  if (!parsed.appType) {
    console.error('用法: node integration-list.js list <appType> [--form-uuid <uuid>] [--status y|n] [--key <kw>] [--json]');
    return;
  }
  if (parsed.status && parsed.status !== 'y' && parsed.status !== 'n') {
    console.error('--status 仅支持 y / n，当前值：' + parsed.status);
    return;
  }

  const authRef = await createAuthRef();
  const result = await listLogicflows(authRef, {
    appType: parsed.appType,
    formUuid: parsed.formUuid,
    status: parsed.status,
    key: parsed.key,
    pageIndex: parsed.pageIndex,
    pageSize: parsed.pageSize,
  });
  const flows = flattenFlowList(result);

  if (parsed.json) {
    console.log(JSON.stringify(flows));
    return;
  }

  printFlowTable(flows);
  console.log(JSON.stringify({
    appType: parsed.appType,
    total: flows.length,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
    flows,
  }));
}

function parseSwitchArgs(args) {
  return {
    appType: args[0] || '',
    formUuid: args[1] || '',
    processCode: args[2] || '',
  };
}

async function runSwitch(args, enable) {
  const { appType, formUuid, processCode } = parseSwitchArgs(args);
  if (!appType || !formUuid || !processCode) {
    const action = enable ? 'enable' : 'disable';
    console.error('用法: node integration-list.js ' + action + ' <appType> <formUuid> <processCode>');
    return;
  }

  const authRef = await createAuthRef();
  try {
    await switchLogicflow(authRef, { appType, formUuid, processCode, enable });
  } catch (err) {
    console.log(JSON.stringify({
      success: false,
      action: enable ? 'enable' : 'disable',
      appType, formUuid, processCode,
      error: err.message,
    }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    success: true,
    action: enable ? 'enable' : 'disable',
    appType, formUuid, processCode,
    status: enable ? 'y' : 'n',
  }));
}

async function runEnable(args) {
  return runSwitch(args, true);
}

async function runDisable(args) {
  return runSwitch(args, false);
}

const command = process.argv[2];
const subArgs = process.argv.slice(3);

if (command === 'list') {
  runList(subArgs).catch((err) => {
    console.error('执行异常: ' + err.message);
    process.exit(1);
  });
} else if (command === 'enable') {
  runEnable(subArgs).catch((err) => {
    console.error('执行异常: ' + err.message);
    process.exit(1);
  });
} else if (command === 'disable') {
  runDisable(subArgs).catch((err) => {
    console.error('执行异常: ' + err.message);
    process.exit(1);
  });
} else {
  console.error('用法: node integration-list.js <command> [参数]');
  console.error('');
  console.error('命令:');
  console.error('  list <appType> [选项]              查询逻辑流列表');
  console.error('  enable <appType> <formUuid> <code>  启用逻辑流');
  console.error('  disable <appType> <formUuid> <code> 停用逻辑流');
  console.error('');
  console.error('list 选项:');
  console.error('  --form-uuid <uuid>  按表单筛选');
  console.error('  --status <y|n>      按状态筛选');
  console.error('  --key <keyword>     按关键字搜索');
  console.error('  --page <n>          页码');
  console.error('  --size <n>          每页数量');
  console.error('  --json              输出纯JSON');
  process.exit(1);
}
