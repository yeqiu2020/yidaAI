'use strict';

const path = require('path');
const { loadCookieData, triggerLogin, resolveBaseUrl } = require(path.resolve(__dirname, '../../yida-api-client/scripts/api_client'));
const { generateNodeId } = require('./integration-node-ids');
const { getFormSchema, createLogicflow, saveProcess } = require('./integration-api');
const { mapEventTypes, buildProcessJson } = require('./integration-process-builder');
const { buildViewJson } = require('./integration-view-builder');

function parseFlag(args, flagName) {
  const index = args.indexOf(flagName);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return null;
}

function hasFlag(args, flagName) {
  return args.includes(flagName);
}

async function run(args) {
  const arg0 = args[0];

  if (!arg0 || arg0 === '--help' || arg0 === '-h') {
    console.error('用法: node integration-create.js <appType> <formUuid> <flowName> [选项]');
    console.error('');
    console.error('选项:');
    console.error('  --process-code <code>          已有逻辑流processCode（修改模式）');
    console.error('  --receivers <userId,...>        消息通知接收人');
    console.error('  --user-fields <fieldId,...>     消息通知接收人字段');
    console.error('  --title <title>                 消息通知标题');
    console.error('  --content <content>             消息通知内容');
    console.error('  --events <events>               触发事件（逗号分隔）');
    console.error('  --trigger-condition <cond>        触发条件（可多次）');
    console.error('  --trigger-recursively           允许自动触发');
    console.error('  --approval-actions <actions>    审批动作');
    console.error('  --approval-node-ids <ids>       审批节点ID');
    console.error('  --add-data-form-uuid <uuid>     新增数据目标表单');
    console.error('  --add-data-assignment <assign>  新增数据字段赋值（可多次）');
    console.error('  --data-form-uuid <uuid>         获取数据目标表单');
    console.error('  --data-condition <cond>         获取数据过滤条件（可多次）');
    console.error('  --data-query-type <type>        数据类型: single(默认)/multiple');
    console.error('  --data-quantity <n>             多条数据时获取数量（默认100）');
    console.error('  --update-form-uuid <uuid>       更新数据目标表单');
    console.error('  --update-condition <cond>       更新数据过滤条件（可多次）');
    console.error('  --update-assignment <assign>    更新数据字段赋值（可多次）');
    console.error('  --script-code <code>            脚本代码内容');
    console.error('  --branch-field <fieldId>        条件分支字段ID');
    console.error('  --branch-operator <op>          条件分支运算符');
    console.error('  --branch-value <value>          条件分支比较值');
    console.error('  --branch-field-name <name>      条件分支字段名称');
    console.error('  --connector-id <id>             连接器ID');
    console.error('  --action-id <id>                连接器动作ID');
    console.error('  --connector-name <name>         连接器名称');
    console.error('  --connector-icon <url>          连接器图标');
    console.error('  --connector-inputs <path>       连接器入参schema文件');
    console.error('  --connector-assignment <assign> 连接器入参映射（可多次）');
    console.error('  --publish                       创建后直接发布');
    process.exit(0);
  }

  const subArgs = arg0 === 'create' ? args.slice(1) : args;
  const appType = subArgs[0];
  const formUuid = subArgs[1];
  const flowName = subArgs[2];

  if (!appType || !formUuid || !flowName) {
    console.error('错误: 缺少必要参数 appType, formUuid, flowName');
    console.error('用法: node integration-create.js <appType> <formUuid> <flowName> [选项]');
    process.exit(1);
  }

  const processCodeInput = parseFlag(subArgs, '--process-code');
  const receiversRaw = parseFlag(subArgs, '--receivers') || '';
  const userFieldsRaw = parseFlag(subArgs, '--user-fields') || '';
  const notificationTitle = parseFlag(subArgs, '--title') || flowName;
  const notificationContent = parseFlag(subArgs, '--content') || '表单有新记录提交，请及时查看。';
  const eventsRaw = parseFlag(subArgs, '--events') || 'insert';
  const approvalActionsRaw = parseFlag(subArgs, '--approval-actions') || '';
  const approvalNodeIdsRaw = parseFlag(subArgs, '--approval-node-ids') || '';
  const triggerRecursively = hasFlag(subArgs, '--trigger-recursively');
  const shouldPublish = hasFlag(subArgs, '--publish');

  const receiverUserIds = receiversRaw
    ? receiversRaw.split(',').map((id) => id.trim()).filter(Boolean)
    : [];
  const toUsers = receiverUserIds.map((userId) => ({ userId, userName: '' }));
  const userFields = userFieldsRaw
    ? userFieldsRaw.split(',').map((id) => id.trim()).filter(Boolean)
    : [];

  const formEventTypes = mapEventTypes(
    eventsRaw.split(',').map((event) => event.trim()).filter(Boolean)
  );
  const approvalActions = approvalActionsRaw
    ? approvalActionsRaw.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
  const approvalNodeIds = approvalNodeIdsRaw
    ? approvalNodeIdsRaw.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  if (formEventTypes.length === 0) {
    console.error('错误: 无效的事件类型');
    process.exit(1);
  }

  if (formEventTypes.includes('processFinish') && approvalActions.length === 0) {
    console.error('错误: 审批事件触发时必须传入 --approval-actions');
    process.exit(1);
  }

  if (formEventTypes.includes('activityTask') && approvalActions.length === 0) {
    console.error('错误: 审批节点事件触发时必须传入 --approval-actions');
    process.exit(1);
  }

  if (formEventTypes.includes('activityTask') && approvalNodeIds.length === 0) {
    console.error('错误: 审批节点事件触发时必须传入 --approval-node-ids');
    process.exit(1);
  }

  if (receiverUserIds.length === 0) {
    console.error('提示: 未指定消息通知接收人');
  }

  const dataFormUuid = parseFlag(subArgs, '--data-form-uuid') || null;
  const dataQueryType = parseFlag(subArgs, '--data-query-type') || 'single';
  const dataQuantity = parseInt(parseFlag(subArgs, '--data-quantity') || '100', 10);

  const dataConditions = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--data-condition' && subArgs[index + 1]) {
      const parts = subArgs[index + 1].split(':');
      if (parts.length >= 3) {
        dataConditions.push({
          bFieldId: parts[0],
          bFieldName: parts[1],
          aFieldId: parts[2],
          componentType: parts[3] || 'TextField',
        });
      }
      index++;
    }
  }

  const updateFormUuid = parseFlag(subArgs, '--update-form-uuid') || null;

  const updateConditions = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--update-condition' && subArgs[index + 1]) {
      const parts = subArgs[index + 1].split(':');
      if (parts.length >= 3) {
        updateConditions.push({
          bFieldId: parts[0],
          bFieldName: parts[1],
          aFieldId: parts[2],
          componentType: parts[3] || 'TextField',
          opCode: parts[4] || 'Equal',
          opValue: parts[5] || '',
          valueType: parts[6] || 'literal',
        });
      }
      index++;
    }
  }

  const updateAssignments = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--update-assignment' && subArgs[index + 1]) {
      const colonIndex = subArgs[index + 1].indexOf(':');
      const secondColonIndex = subArgs[index + 1].indexOf(':', colonIndex + 1);
      if (colonIndex !== -1 && secondColonIndex !== -1) {
        const column = subArgs[index + 1].slice(0, colonIndex);
        const valueType = subArgs[index + 1].slice(colonIndex + 1, secondColonIndex);
        const value = subArgs[index + 1].slice(secondColonIndex + 1);
        updateAssignments.push({ column, valueType, value });
      }
      index++;
    }
  }

  const scriptCode = parseFlag(subArgs, '--script-code') || '';
  const hasScriptNode = Boolean(scriptCode);

  const branchFieldId = parseFlag(subArgs, '--branch-field') || '';
  const branchOperator = parseFlag(subArgs, '--branch-operator') || 'Equal';
  const branchValue = parseFlag(subArgs, '--branch-value') || '';
  const branchFieldName = parseFlag(subArgs, '--branch-field-name') || '';
  const branchComponentType = parseFlag(subArgs, '--branch-component-type') || 'TextField';
  const branchValueType = parseFlag(subArgs, '--branch-value-type') || 'literal';
  const hasConditionNode = Boolean(branchFieldId && branchValue);
  const branchCondition = hasConditionNode ? {
    fieldId: branchFieldId,
    fieldName: branchFieldName,
    opCode: branchOperator,
    value: branchValue,
    componentType: branchComponentType,
    valueType: branchValueType,
  } : null;

  const triggerConditions = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--trigger-condition' && subArgs[index + 1]) {
      const parts = subArgs[index + 1].split(':');
      if (parts.length >= 4) {
        triggerConditions.push({
          fieldId: parts[0],
          fieldName: parts[1],
          opCode: parts[2],
          value: parts[3],
          componentType: parts[4] || 'TextField',
          valueType: parts[5] || 'literal',
        });
      }
      index++;
    }
  }

  const addDataFormUuid = parseFlag(subArgs, '--add-data-form-uuid') || null;

  const addDataAssignments = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--add-data-assignment' && subArgs[index + 1]) {
      const colonIndex = subArgs[index + 1].indexOf(':');
      const secondColonIndex = subArgs[index + 1].indexOf(':', colonIndex + 1);
      if (colonIndex !== -1 && secondColonIndex !== -1) {
        const column = subArgs[index + 1].slice(0, colonIndex);
        const valueType = subArgs[index + 1].slice(colonIndex + 1, secondColonIndex);
        const value = subArgs[index + 1].slice(secondColonIndex + 1);
        addDataAssignments.push({ column, valueType, value });
      }
      index++;
    }
  }

  const connectorIdArg = parseFlag(subArgs, '--connector-id') || null;
  const actionIdArg = parseFlag(subArgs, '--action-id') || null;
  const connectorNameArg = parseFlag(subArgs, '--connector-name') || '';
  const connectorIconArg = parseFlag(subArgs, '--connector-icon') || '';
  const connectorInputsPath = parseFlag(subArgs, '--connector-inputs') || null;

  let connectorInputsJson = [];
  if (connectorInputsPath) {
    try {
      const fs2 = require('fs');
      const raw = fs2.readFileSync(connectorInputsPath, 'utf8');
      const parsed = JSON.parse(raw);
      connectorInputsJson = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('读取 --connector-inputs 文件失败：' + err.message + '，降级为空 inputs');
      connectorInputsJson = [];
    }
  }

  const connectorAssignments = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--connector-assignment' && subArgs[index + 1]) {
      const colonIndex = subArgs[index + 1].indexOf(':');
      const secondColonIndex = subArgs[index + 1].indexOf(':', colonIndex + 1);
      if (colonIndex !== -1 && secondColonIndex !== -1) {
        const column = subArgs[index + 1].slice(0, colonIndex);
        const valueType = subArgs[index + 1].slice(colonIndex + 1, secondColonIndex);
        const value = subArgs[index + 1].slice(secondColonIndex + 1);
        connectorAssignments.push({ column, valueType, value });
      }
      index++;
    }
  }

  const hasConnectorCallNode = Boolean(connectorIdArg && actionIdArg);
  if ((connectorIdArg && !actionIdArg) || (!connectorIdArg && actionIdArg)) {
    console.error('警告: --connector-id 与 --action-id 必须同时提供，已忽略连接器调用节点');
  }

  const hasMessageNode = receiverUserIds.length > 0 || userFields.length > 0;

  const canvasId = generateNodeId();
  const triggerNodeId = generateNodeId();
  const addDataNodeId = addDataFormUuid ? generateNodeId() : null;
  const dataNodeId = dataFormUuid ? generateNodeId() : null;
  const updateDataNodeId = updateFormUuid ? generateNodeId() : null;
  const scriptNodeId = hasScriptNode ? generateNodeId() : null;
  const connectorCallNodeId = hasConnectorCallNode ? generateNodeId() : null;
  const conditionNodeId = hasConditionNode ? generateNodeId() : null;
  const messageNodeId = hasMessageNode ? generateNodeId() : null;
  const endNodeId = generateNodeId();

  const SEP = '='.repeat(50);
  console.error(SEP);
  console.error('创建集成自动化');
  console.error(SEP);
  console.error('应用ID: ' + appType);
  console.error('表单UUID: ' + formUuid);
  console.error('逻辑流名称: ' + flowName);
  console.error(processCodeInput ? '模式: 修改已有逻辑流' : '模式: 新建逻辑流');
  if (processCodeInput) {
    console.error('processCode: ' + processCodeInput);
  }
  console.error('触发事件: ' + formEventTypes.join(', '));
  if (approvalActions.length > 0) {
    console.error('审批动作: ' + approvalActions.join(', '));
  }
  if (approvalNodeIds.length > 0) {
    console.error('审批节点: ' + approvalNodeIds.join(', '));
  }
  if (triggerRecursively) {
    console.error('允许自动触发: true');
  }
  if (triggerConditions.length > 0) {
    console.error('触发过滤条件: ' + triggerConditions.length);
  }
  console.error('接收人: ' + (receiverUserIds.length > 0 ? receiverUserIds.join(', ') : '未指定'));
  console.error('通知标题: ' + notificationTitle);
  console.error('通知内容: ' + notificationContent);
  if (dataFormUuid) {
    console.error('获取数据表单: ' + dataFormUuid);
    console.error('获取数据查询类型: ' + dataQueryType);
    if (dataQueryType === 'multiple') {
      console.error('获取数据数量: ' + dataQuantity);
    }
    console.error('获取数据条件: ' + dataConditions.length);
  }
  if (updateFormUuid) {
    console.error('更新数据表单: ' + updateFormUuid);
    console.error('更新数据条件: ' + updateConditions.length);
    console.error('更新数据赋值: ' + updateAssignments.length);
  }
  if (hasScriptNode) {
    console.error('脚本节点: 是');
  }
  if (hasConditionNode) {
    console.error('条件分支: ' + branchFieldId + ' ' + branchOperator + ' ' + branchValue);
  }
  console.error(shouldPublish ? '操作模式: 发布' : '操作模式: 草稿');

  let totalSteps = 1;
  if (!processCodeInput) { totalSteps++; }
  if (addDataFormUuid) { totalSteps++; }
  if (updateFormUuid) { totalSteps++; }
  totalSteps++;
  let currentStep = 0;
  const stepLog = (label) => {
    currentStep++;
    console.error('步骤 ' + currentStep + '/' + totalSteps + ': ' + label);
  };

  stepLog('读取登录态');
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error('登录态缓存不存在，触发登录...');
    cookieData = triggerLogin();
  }

  const authRef = {
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    cookieData,
  };
  console.error('登录成功: ' + authRef.baseUrl);

  let processCode = processCodeInput;
  if (!processCode) {
    stepLog('新建逻辑流绑定');
    try {
      processCode = await createLogicflow(authRef, { appType, formUuid, flowName });
      console.error('新建逻辑流成功: ' + processCode);
    } catch (error) {
      console.error('新建逻辑流失败: ' + error.message);
      console.log(JSON.stringify({ success: false, error: error.message }));
      process.exit(1);
    }
  }

  const processNodeIds = [triggerNodeId];
  if (addDataNodeId) { processNodeIds.push(addDataNodeId); }
  if (dataNodeId) { processNodeIds.push(dataNodeId); }
  if (updateDataNodeId) { processNodeIds.push(updateDataNodeId); }
  if (scriptNodeId) { processNodeIds.push(scriptNodeId); }
  if (connectorCallNodeId) { processNodeIds.push(connectorCallNodeId); }
  if (conditionNodeId) { processNodeIds.push(conditionNodeId); }
  if (messageNodeId) { processNodeIds.push(messageNodeId); }
  processNodeIds.push(endNodeId);

  const viewNodeIds = [canvasId, triggerNodeId];
  if (addDataNodeId) { viewNodeIds.push(addDataNodeId); }
  if (dataNodeId) { viewNodeIds.push(dataNodeId); }
  if (updateDataNodeId) { viewNodeIds.push(updateDataNodeId); }
  if (scriptNodeId) { viewNodeIds.push(scriptNodeId); }
  if (connectorCallNodeId) { viewNodeIds.push(connectorCallNodeId); }
  if (conditionNodeId) { viewNodeIds.push(conditionNodeId); }
  if (messageNodeId) { viewNodeIds.push(messageNodeId); }
  viewNodeIds.push(endNodeId);

  let addDataFormSchema = [];
  if (addDataFormUuid) {
    try {
      stepLog('获取新增目标表单Schema');
      addDataFormSchema = await getFormSchema(authRef, { appType, formUuid: addDataFormUuid.toString() });
      console.error('获取Schema成功: ' + addDataFormSchema.length + ' 个字段');
    } catch (error) {
      console.error('获取Schema失败: ' + error.message + '（继续执行）');
    }
  }

  let updateFormSchema = [];
  if (updateFormUuid) {
    try {
      stepLog('获取更新目标表单Schema');
      updateFormSchema = await getFormSchema(authRef, { appType, formUuid: updateFormUuid.toString() });
      console.error('获取Schema成功: ' + updateFormSchema.length + ' 个字段');
    } catch (error) {
      console.error('获取Schema失败: ' + error.message + '（继续执行）');
    }
  }

  const processJson = buildProcessJson({
    processCode, formUuid, appType, formEventTypes,
    notificationTitle, notificationContent, toUsers, userFields,
    nodeIds: processNodeIds,
    addDataFormUuid: addDataFormUuid || undefined,
    addDataAssignments,
    dataFormUuid: dataFormUuid || undefined,
    dataConditions, dataQueryType, dataQuantity,
    hasMessageNode, approvalActions, approvalNodeIds,
    triggerRecursively, triggerConditions,
    updateFormUuid: updateFormUuid || undefined,
    updateConditions, updateAssignments,
    hasScriptNode, scriptCode,
    hasConditionNode, branchCondition,
    connectorId: connectorIdArg, actionId: actionIdArg,
    connectorAssignments, connectorDescription: connectorNameArg || undefined,
  });

  const viewJson = buildViewJson({
    formUuid, formEventTypes, notificationTitle, notificationContent,
    toUsers, userFields, appType, nodeIds: viewNodeIds,
    addDataFormUuid: addDataFormUuid || undefined,
    addDataAssignments, addDataFormSchema, addDataFormName: '',
    dataFormUuid: dataFormUuid || undefined,
    dataConditions, dataQueryType, dataQuantity,
    hasMessageNode, approvalActions, approvalNodeIds,
    triggerRecursively, triggerConditions,
    updateFormUuid: updateFormUuid || undefined,
    updateConditions, updateAssignments, updateFormSchema, updateFormName: '',
    hasScriptNode, scriptCode,
    hasConditionNode, branchCondition,
    connectorId: connectorIdArg, actionId: actionIdArg,
    connectorAssignments, connectorName: connectorNameArg,
    connectorIcon: connectorIconArg, connectorInputs: connectorInputsJson,
  });

  stepLog('保存逻辑流（草稿）');
  const saveResponse = await saveProcess(authRef, {
    appType, formUuid, processCode, processJson, viewJson, isOnline: false,
  });

  if (!saveResponse || !saveResponse.success) {
    const errorMsg = saveResponse
      ? saveResponse.errorMsg || JSON.stringify(saveResponse)
      : '请求失败';
    console.error('保存失败: ' + errorMsg);
    console.log(JSON.stringify({ success: false, error: errorMsg }));
    process.exit(1);
  }
  console.error('保存成功');

  if (shouldPublish) {
    stepLog('发布逻辑流');
    const publishResponse = await saveProcess(authRef, {
      appType, formUuid, processCode, processJson, viewJson, isOnline: true,
    });

    if (!publishResponse || !publishResponse.success) {
      const errorMsg = publishResponse
        ? publishResponse.errorMsg || JSON.stringify(publishResponse)
        : '请求失败';
      console.error('发布失败: ' + errorMsg + '，已保存为草稿');
      console.log(JSON.stringify({
        success: true, published: false, processCode, flowName, appType, formUuid,
        warning: '发布失败：' + errorMsg + '，已保存为草稿',
      }));
      return;
    }

    console.error('发布成功');
    console.error('\n' + SEP);
    console.error('创建完成（已发布）');
    console.error('processCode: ' + processCode);
    console.error('逻辑流名称: ' + flowName);
    console.error(SEP);
    console.log(JSON.stringify({
      success: true, published: true, processCode, flowName, appType, formUuid, formEventTypes,
    }));
    return;
  }

  console.error('\n' + SEP);
  console.error('创建完成（草稿）');
  console.error('processCode: ' + processCode);
  console.error('逻辑流名称: ' + flowName);
  console.error('提示: 使用 --publish 参数可直接发布');
  console.error(SEP);
  console.log(JSON.stringify({
    success: true, published: false, processCode, flowName, appType, formUuid, formEventTypes,
  }));
}

const args = process.argv.slice(2);
run(args).catch((err) => {
  console.error('执行异常: ' + err.message);
  console.log(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
