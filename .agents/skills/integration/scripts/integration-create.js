'use strict';

const path = require('path');
const coreUtils = require('../../../../lib/core/utils');
const { loadCookieData, resolveBaseUrl } = coreUtils;
const { appendGateBypassAudit } = require('../../../../lib/core/gate-audit');
const { triggerLogin } = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));
const { generateNodeId } = require('./integration-node-ids');
const { getFormSchema, getFormType, createLogicflow, saveProcess } = require('./integration-api');
const { mapEventTypes, buildProcessJson, resolveConnectorMode } = require('./integration-process-builder');
const { buildViewJson } = require('./integration-view-builder');
const { validateProcessJson, formatReport } = require('./integration-validate');

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

function parseAssignments(args, flagName) {
  const assignments = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === flagName && args[index + 1]) {
      const colonIndex = args[index + 1].indexOf(':');
      const secondColonIndex = args[index + 1].indexOf(':', colonIndex + 1);
      if (colonIndex !== -1 && secondColonIndex !== -1) {
        const column = args[index + 1].slice(0, colonIndex);
        const valueType = args[index + 1].slice(colonIndex + 1, secondColonIndex);
        const value = args[index + 1].slice(secondColonIndex + 1);
        assignments.push({ column, valueType, value });
      }
      index++;
    }
  }
  return assignments;
}

function buildSelectUserInitiator(rawValue) {
  if (!rawValue) {
    return null;
  }
  const colonIndex = rawValue.indexOf(':');
  const id = colonIndex === -1 ? rawValue.trim() : rawValue.slice(0, colonIndex).trim();
  const label = colonIndex === -1 ? id : rawValue.slice(colonIndex + 1).trim();
  if (!id) {
    return null;
  }
  return {
    type: 'select_user',
    value: JSON.stringify({ id, label: label || id, type: 'employee' }),
  };
}

async function run(args) {
  const arg0 = args[0];

  if (!arg0 || arg0 === '--help' || arg0 === '-h') {
    console.error('用法: node integration-create.js <appType> <formUuid> <flowName> [选项]');
    console.error('');
    console.error('选项:');
    console.error('  --process-code <code>              已有逻辑流processCode（修改模式）');
    console.error('  --receivers <userId,...>           消息通知接收人');
    console.error('  --user-fields <fieldId,...>        消息通知接收人字段');
    console.error('  --title <title>                    消息通知标题');
    console.error('  --content <content>                消息通知内容');
    console.error('  --events <events>                  触发事件（逗号分隔）');
    console.error('  --trigger-condition <cond>         触发条件（可多次）');
    console.error('  --trigger-logic <and|or>           触发条件多条件之间的逻辑（默认and）');
    console.error('  --trigger-recursively              允许自动触发');
    console.error('  --approval-actions <actions>       审批动作');
    console.error('  --approval-node-ids <ids>          审批节点ID');
    console.error('  --get-self                         自动插入获取自身节点');
    console.error('  --get-self-field <field>           覆盖触发事件系统字段（默认__masterdata_form_inst_id）');
    console.error('  --get-self-query-field <field>     覆盖查询系统字段（默认pid）');
    console.error('  --data-form-uuid <uuid>            获取数据目标表单');
    console.error('  --data-condition <cond>           获取数据过滤条件（可多次）');
    console.error('  --data-query-type <type>           数据类型: single(默认)/multiple');
    console.error('  --data-quantity <n>                多条数据时获取数量（默认100）');
    console.error('  --add-data-form-uuid <uuid>        新增数据目标表单');
    console.error('  --add-data-assignment <assign>     新增数据字段赋值（可多次）');
    console.error('  --add-data-insert-type <type>      新增方式: form(默认,表单中新增)/sub_table(在子表中新增)');
    console.error('  --add-data-sub-form-uuid <fieldId> 子表新增时目标子表字段ID（tableField_xxx）');
    console.error('  --add-data-type <type>             新增条数: single(默认)/batch(多条,需--add-data-source-id)');
    console.error('  --add-data-source-id <id>          批量新增数据源（触发子表字段ID或get表示前置获取节点）');
    console.error('  --initiate-approval-form-uuid <uuid>  发起审批目标流程表单');
    console.error('  --initiate-approval-initiator-user <userId[:name]>  发起审批的发起人');
    console.error('  --initiate-approval-assignment <assign>  发起审批字段赋值（可多次）');
    console.error('  --update-form-uuid <uuid>          更新数据目标表单');
    console.error('  --update-condition <cond>          更新数据主条件（可多次）');
    console.error('  --update-assignment <assign>       更新数据字段赋值（可多次）');
    console.error('  --update-type <type>               更新模式: direct_form(默认,直接更新)/node(按前置获取节点更新)');
    console.error('  --update-sub-source-id <fieldId>   更新子表时目标子表字段ID（tableField_xxx）');
    console.error('  --update-sub-condition <cond>      更新子表时的子条件（可多次，格式同--update-condition）');
    console.error('  --update-none-operation <op>       未匹配到数据时: ignored(默认,跳过)/add(新增一条=upsert)');
    console.error('  --delete-data                      添加删除数据节点（删除前置获取节点的数据，需配合--data-form-uuid或--get-self）');
    console.error('  --delete-sub-source-id <fieldId>   删除子表行时的子表字段ID（可选）');
    console.error('  --script-code <code>               脚本节点代码内容');
    console.error('  --script-lang <js|groovy>          脚本语言: js(默认,JavaScriptNode)/groovy(GroovyNode)');
    console.error('  --script-output <var:type[:desc]>  脚本输出变量（可多次，引擎变量名为<节点id>_<var>）');
    console.error('  --branch-field <fieldId>           条件分支(ConditionContainer)字段ID（单条件简写）');
    console.error('  --branch-operator <op>             条件分支运算符');
    console.error('  --branch-value <value>             条件分支比较值');
    console.error('  --branch-field-name <name>         条件分支字段名称');
    console.error('  --branch-condition <cond>          条件分支条件（可多次，格式fieldId:fieldName:opCode:value[:componentType[:valueType]]）');
    console.error('  --branch-logic <and|or>            条件分支多条件之间的逻辑（默认and）');
    console.error('  --cycle                            循环容器(CycleContainer)：需--data-query-type multiple，循环体为消息节点');
    console.error('  --data-source-type <type>          获取数据来源: form(默认,表单查询)/subform(触发子表)');
    console.error('  --data-sub-field-id <fieldId>      子表来源时的触发子表字段ID(tableField_xxx)');
    console.error('  --cycle-update-form-uuid <uuid>    循环体内更新数据目标表单(逐行UPSERT)');
    console.error('  --cycle-update-condition <cond>    循环体更新主条件(可多次,格式同--update-condition)');
    console.error('  --cycle-update-assignment <assign> 循环体更新赋值(可多次,格式同--update-assignment)');
    console.error('  --cycle-update-none-operation <op>  循环体未匹配处理: ignored/add(默认add=upsert)');
    console.error('  --connector-id <id>               连接器ID');
    console.error('  --action-id <id>                   连接器动作ID');
    console.error('  --connector-name <name>            连接器名称');
    console.error('  --connector-display-name <name>    连接器展示名称');
    console.error('  --connector-mode <mode>            连接器类型（HTTP=5，默认自动推断）');
    console.error('  --connection-id <id>               HTTP连接器鉴权连接ID');
    console.error('  --connector-icon <url>             连接器图标');
    console.error('  --connector-inputs <path>          连接器入参schema文件');
    console.error('  --connector-assignment <assign>     连接器入参映射（可多次）');
    console.error('  --publish                          创建后直接发布');
    console.error('  --force-save                       跳过保存前体检门禁（仅限用户明确批准，写入审计日志）');
    console.error('  --force-save-reason <reason>       跳过门禁的原因（随审计日志留痕）');
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
  // 保存前体检门禁的逃生口：仅限人工确认过的特殊场景（生效时写入审计日志）
  const forceSave = hasFlag(subArgs, '--force-save');
  const forceSaveReason = (parseFlag(subArgs, '--force-save-reason') || '').trim();

  // 获取自身节点参数
  const getSelf = hasFlag(subArgs, '--get-self');
  const getSelfTriggerField = parseFlag(subArgs, '--get-self-field')
    || parseFlag(subArgs, '--get-self-trigger-field')
    || '__masterdata_form_inst_id';
  const getSelfQueryField = parseFlag(subArgs, '--get-self-query-field') || 'pid';

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

  if (receiverUserIds.length === 0 && userFields.length === 0) {
    console.error('提示: 未指定消息通知接收人，将不生成消息通知节点');
  }

  // 获取数据节点参数
  const dataFormUuid = getSelf ? formUuid : (parseFlag(subArgs, '--data-form-uuid') || null);
  const dataQueryType = parseFlag(subArgs, '--data-query-type') || 'single';
  const dataQuantity = parseInt(parseFlag(subArgs, '--data-quantity') || '100', 10);
  // 数据来源类型：form(默认,从指定表单查询) 或 subform(从触发数据子表获取)
  const dataSourceType = parseFlag(subArgs, '--data-source-type') || 'form';
  const dataSubFieldId = parseFlag(subArgs, '--data-sub-field-id') || '';

  const dataConditions = [];
  if (getSelf) {
    dataConditions.push({
      bFieldId: getSelfQueryField,
      bFieldName: '表单实例ID',
      aFieldId: getSelfTriggerField,
      componentType: 'TextField',
      opCode: 'Equal',
      valueType: 'processVar',
    });
  }
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--data-condition' && subArgs[index + 1]) {
      const parts = subArgs[index + 1].split(':');
      if (parts.length >= 3) {
        dataConditions.push({
          bFieldId: parts[0],
          bFieldName: parts[1],
          aFieldId: parts[2],
          componentType: parts[3] || 'TextField',
          opCode: parts[4] || 'Contain',
          valueType: parts[5] || 'processVar',
        });
      }
      index++;
    }
  }

  // 触发条件
  const triggerLogic = parseFlag(subArgs, '--trigger-logic') || 'and';
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

  // 新增数据节点参数
  const addDataFormUuid = parseFlag(subArgs, '--add-data-form-uuid') || null;
  const addDataAssignments = parseAssignments(subArgs, '--add-data-assignment');
  const addDataInsertType = (parseFlag(subArgs, '--add-data-insert-type') || 'form') === 'sub_table' ? 'sub_table' : 'form';
  const addDataSubFormUuid = parseFlag(subArgs, '--add-data-sub-form-uuid') || '';
  const addDataType = (parseFlag(subArgs, '--add-data-type') || 'single') === 'batch' ? 'batch' : 'single';
  const addDataSourceIdRaw = parseFlag(subArgs, '--add-data-source-id') || '';

  if (addDataFormUuid && addDataInsertType === 'sub_table' && !addDataSubFormUuid) {
    console.error('错误: --add-data-insert-type sub_table 时必须提供 --add-data-sub-form-uuid <子表字段ID>');
    process.exit(1);
  }
  if (addDataFormUuid && addDataType === 'batch' && !addDataSourceIdRaw) {
    console.error('错误: --add-data-type batch 时必须提供 --add-data-source-id（触发子表字段ID 或 get 表示前置获取节点）');
    process.exit(1);
  }

  // 发起审批节点参数
  const initiateApprovalFormUuid = parseFlag(subArgs, '--initiate-approval-form-uuid') || null;
  const initiateApprovalInitiator = buildSelectUserInitiator(
    parseFlag(subArgs, '--initiate-approval-initiator-user') || ''
  );
  const initiateApprovalAssignments = parseAssignments(subArgs, '--initiate-approval-assignment');

  if (initiateApprovalFormUuid && !initiateApprovalInitiator) {
    console.error('错误: 发起审批节点必须提供 --initiate-approval-initiator-user userId[:name]');
    process.exit(1);
  }

  // 更新数据节点参数（direct_form 已上线验证；node 模式需前置获取节点）
  const updateFormUuid = parseFlag(subArgs, '--update-form-uuid') || null;
  const updateType = (parseFlag(subArgs, '--update-type') || 'direct_form') === 'node' ? 'node' : 'direct_form';
  const updateSubSourceId = parseFlag(subArgs, '--update-sub-source-id') || '';
  const updateNoneOperation = (parseFlag(subArgs, '--update-none-operation') || 'ignored') === 'add' ? 'add' : 'ignored';
  function parseUpdateConditionList(flagName) {
    const list = [];
    for (let index = 0; index < subArgs.length; index++) {
      if (subArgs[index] === flagName && subArgs[index + 1]) {
        const parts = subArgs[index + 1].split(':');
        if (parts.length >= 3) {
          list.push({
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
    return list;
  }
  const updateConditions = parseUpdateConditionList('--update-condition');
  const updateSubConditions = parseUpdateConditionList('--update-sub-condition');
  const updateAssignments = parseAssignments(subArgs, '--update-assignment');

  if (updateFormUuid && updateSubSourceId && updateSubConditions.length === 0) {
    console.error('警告: 子表更新建议提供 --update-sub-condition，否则子表每行都会命中');
  }

  // 循环体内更新数据节点参数（用于 --cycle + --cycle-update-form-uuid 组合）
  // 场景：遍历触发子表行，逐行 UPSERT 目标表单记录
  const cycleUpdateFormUuid = parseFlag(subArgs, '--cycle-update-form-uuid') || null;
  const cycleUpdateConditions = parseUpdateConditionList('--cycle-update-condition');
  const cycleUpdateAssignments = parseAssignments(subArgs, '--cycle-update-assignment');
  const cycleUpdateNoneOperation = (parseFlag(subArgs, '--cycle-update-none-operation') || 'ignored') === 'add' ? 'add' : 'ignored';

  // 删除数据节点参数（官方语义：删除前必须先用获取数据节点拿到数据）
  const hasDeleteDataNode = hasFlag(subArgs, '--delete-data');
  const deleteSubSourceId = parseFlag(subArgs, '--delete-sub-source-id') || '';

  // 脚本节点（JavaScriptNode/GroovyNode，processJson type=CodeExecutor）
  const scriptCode = parseFlag(subArgs, '--script-code') || '';
  const scriptLang = String(parseFlag(subArgs, '--script-lang') || 'js').toLowerCase() === 'groovy' ? 'groovy' : 'js';
  const hasScriptNode = Boolean(scriptCode);
  // 脚本输出变量：--script-output "varName:type[:desc]"（可多次），引擎流程变量名为 <节点id>_<varName>
  const scriptOutputs = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--script-output' && subArgs[index + 1]) {
      const parts = subArgs[index + 1].split(':');
      if (parts[0]) {
        scriptOutputs.push({
          name: parts[0],
          type: parts[1] || 'Text',
          desc: parts[2] || parts[0],
        });
      }
      index++;
    }
  }

  // 条件分支（ConditionContainer容器 + 2个ConditionNode子分支）
  // 支持两种入参：单条件简写（--branch-field/--branch-value）与多条件（可重复 --branch-condition）
  const branchFieldId = parseFlag(subArgs, '--branch-field') || '';
  const branchOperator = parseFlag(subArgs, '--branch-operator') || 'Equal';
  const branchValue = parseFlag(subArgs, '--branch-value') || '';
  const branchFieldName = parseFlag(subArgs, '--branch-field-name') || '';
  const branchComponentType = parseFlag(subArgs, '--branch-component-type') || 'TextField';
  const branchValueType = parseFlag(subArgs, '--branch-value-type') || 'literal';
  const branchLogic = parseFlag(subArgs, '--branch-logic') || 'and';
  // 多条件：--branch-condition "fieldId:fieldName:opCode:value[:componentType[:valueType]]"（可多次）
  const branchConditions = [];
  for (let index = 0; index < subArgs.length; index++) {
    if (subArgs[index] === '--branch-condition' && subArgs[index + 1]) {
      const parts = subArgs[index + 1].split(':');
      if (parts.length >= 4) {
        branchConditions.push({
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
  // 单条件简写：当未使用 --branch-condition 时，由 --branch-field/--branch-value 构造一条
  const branchCondition = (branchConditions.length === 0 && branchFieldId && branchValue) ? {
    fieldId: branchFieldId,
    fieldName: branchFieldName,
    opCode: branchOperator,
    value: branchValue,
    componentType: branchComponentType,
    valueType: branchValueType,
  } : null;
  const hasConditionNode = branchConditions.length > 0 || Boolean(branchCondition);

  // 连接器调用节点参数
  const connectorIdArg = parseFlag(subArgs, '--connector-id') || null;
  const actionIdArg = parseFlag(subArgs, '--action-id') || null;
  const connectorNameArg = parseFlag(subArgs, '--connector-name') || '';
  const connectorDisplayNameArg = parseFlag(subArgs, '--connector-display-name') || connectorNameArg;
  const connectorModeArg = resolveConnectorMode(connectorIdArg, parseFlag(subArgs, '--connector-mode') || '');
  const connectionIdArg = parseFlag(subArgs, '--connection-id')
    || parseFlag(subArgs, '--connector-connection-id')
    || '';
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
  if (hasConnectorCallNode && String(connectorIdArg).startsWith('Http_') && connectorModeArg !== 5) {
    console.error('警告: connectorId 以 Http_ 开头，但 connectorMode 不是 5，右侧配置面板可能无法加载');
  }
  if (hasConnectorCallNode && connectorModeArg === 5 && !connectionIdArg) {
    console.error('警告: HTTP 连接器建议提供 --connection-id');
  }

  const hasMessageNode = receiverUserIds.length > 0 || userFields.length > 0;

  // 循环容器（CycleContainer）：以前置获取多条节点为数据源，循环体为消息通知节点或更新数据节点
  const hasCycleNode = hasFlag(subArgs, '--cycle');
  const hasCycleUpdateNode = Boolean(cycleUpdateFormUuid);
  if (hasCycleNode) {
    if (dataSourceType === 'subform') {
      if (!dataSubFieldId) {
        console.error('错误: --data-source-type subform 时必须提供 --data-sub-field-id <子表字段ID>');
        process.exit(1);
      }
    } else if (!dataFormUuid || dataQueryType !== 'multiple') {
      console.error('错误: --cycle 需要前置获取多条数据节点，请同时提供 --data-form-uuid 和 --data-query-type multiple');
      process.exit(1);
    }
    if (!hasMessageNode && !hasCycleUpdateNode) {
      console.error('错误: --cycle 的循环体需要消息通知节点或更新数据节点，请提供 --receivers/--user-fields 或 --cycle-update-form-uuid');
      process.exit(1);
    }
  }

  if (hasDeleteDataNode && !dataFormUuid) {
    console.error('错误: --delete-data 需要前置获取数据节点，请同时提供 --data-form-uuid（或 --get-self）');
    process.exit(1);
  }

  // 生成节点 ID（顺序：canvasId, trigger, dataRetrieve, addData, initiateApproval, updateData, deleteData, script, connector, condition, message, end）
  const canvasId = generateNodeId();
  const triggerNodeId = generateNodeId();
  // subform 模式下即使没有 dataFormUuid 也需要创建 GetBatchDataNode 从触发子表获取数据
  const dataNodeId = (dataFormUuid || dataSourceType === 'subform') ? generateNodeId() : null;
  const addDataNodeId = addDataFormUuid ? generateNodeId() : null;
  const initiateApprovalNodeId = initiateApprovalFormUuid ? generateNodeId() : null;
  const updateDataNodeId = updateFormUuid ? generateNodeId() : null;
  const deleteDataNodeId = hasDeleteDataNode ? generateNodeId() : null;
  const scriptNodeId = hasScriptNode ? generateNodeId() : null;
  const connectorCallNodeId = hasConnectorCallNode ? generateNodeId() : null;
  const conditionNodeId = hasConditionNode ? generateNodeId() : null;
  // 条件分支子节点ID（不入 nodeIds 序列，经 options 传入两个 builder 保证 process/view 一致）
  const conditionBranchIds = hasConditionNode ? { yes: generateNodeId(), fallback: generateNodeId() } : null;
  const cycleNodeId = hasCycleNode ? generateNodeId() : null;
  const cycleUpdateDataNodeId = hasCycleUpdateNode ? generateNodeId() : null;
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
  if (getSelf) {
    console.error('获取自身: 是 (查询字段=' + getSelfQueryField + ', 触发字段=' + getSelfTriggerField + ')');
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
  if (addDataFormUuid) {
    console.error('新增数据表单: ' + addDataFormUuid);
    console.error('新增方式: ' + addDataInsertType + (addDataInsertType === 'sub_table' ? ' (子表=' + addDataSubFormUuid + ')' : ''));
    console.error('新增条数: ' + addDataType + (addDataType === 'batch' ? ' (数据源=' + addDataSourceIdRaw + ')' : ''));
    console.error('新增数据赋值: ' + addDataAssignments.length);
  }
  if (initiateApprovalFormUuid) {
    console.error('发起审批表单: ' + initiateApprovalFormUuid);
    console.error('发起审批赋值: ' + initiateApprovalAssignments.length);
  }
  if (updateFormUuid) {
    console.error('更新数据表单: ' + updateFormUuid);
    console.error('更新模式: ' + updateType + (updateSubSourceId ? ' (子表=' + updateSubSourceId + ', 子条件=' + updateSubConditions.length + ')' : ' (主表)'));
    console.error('未匹配处理: ' + updateNoneOperation + (updateNoneOperation === 'add' ? ' (upsert)' : ' (跳过)'));
  }
  if (hasDeleteDataNode) {
    console.error('删除数据: 是 (前置获取节点=' + dataFormUuid + (deleteSubSourceId ? ', 子表=' + deleteSubSourceId : '') + ')');
  }
  if (hasScriptNode) {
    console.error('脚本节点: 是 (输出变量 ' + scriptOutputs.length + ' 个)');
  }
  if (hasConditionNode) {
    if (branchConditions.length > 0) {
      console.error('条件分支: ' + branchConditions.length + ' 条条件 (' + branchLogic.toUpperCase() + ')');
    } else {
      console.error('条件分支: ' + branchFieldId + ' ' + branchOperator + ' ' + branchValue);
    }
  }
  if (hasCycleNode) {
    console.error('循环容器: 是 (数据源=前置获取多条节点, 循环体=消息通知)');
  }
  if (hasConnectorCallNode) {
    console.error('连接器: ' + connectorIdArg + ' / ' + actionIdArg);
    console.error('连接器模式: ' + connectorModeArg);
    if (connectionIdArg) {
      console.error('连接ID: ' + connectionIdArg);
    }
  }
  console.error(shouldPublish ? '操作模式: 发布' : '操作模式: 草稿');

  // 步骤计数
  let totalSteps = 1; // 登录
  if (!processCodeInput) { totalSteps++; }
  if (addDataFormUuid) { totalSteps++; }
  if (updateFormUuid) { totalSteps++; }
  totalSteps++; // 保存
  let currentStep = 0;
  const stepLog = (label) => {
    currentStep++;
    console.error('步骤 ' + currentStep + '/' + totalSteps + ': ' + label);
  };

  // Step 1: 读取登录态
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

  // Step 2: 新建逻辑流绑定（新建模式）
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

  // 构建 processJson 节点 ID 列表（顺序：trigger, dataRetrieve, addData, initiateApproval, updateData, deleteData, script, connector, condition, cycle, message, end）
  const processNodeIds = [triggerNodeId];
  if (dataNodeId) { processNodeIds.push(dataNodeId); }
  if (addDataNodeId) { processNodeIds.push(addDataNodeId); }
  if (initiateApprovalNodeId) { processNodeIds.push(initiateApprovalNodeId); }
  if (updateDataNodeId) { processNodeIds.push(updateDataNodeId); }
  if (deleteDataNodeId) { processNodeIds.push(deleteDataNodeId); }
  if (scriptNodeId) { processNodeIds.push(scriptNodeId); }
  if (connectorCallNodeId) { processNodeIds.push(connectorCallNodeId); }
  if (conditionNodeId) { processNodeIds.push(conditionNodeId); }
  if (cycleNodeId) { processNodeIds.push(cycleNodeId); }
  if (messageNodeId) { processNodeIds.push(messageNodeId); }
  processNodeIds.push(endNodeId);

  // viewJson 节点 ID 列表（canvasId 开头）
  const viewNodeIds = [canvasId, triggerNodeId];
  if (dataNodeId) { viewNodeIds.push(dataNodeId); }
  if (addDataNodeId) { viewNodeIds.push(addDataNodeId); }
  if (initiateApprovalNodeId) { viewNodeIds.push(initiateApprovalNodeId); }
  if (updateDataNodeId) { viewNodeIds.push(updateDataNodeId); }
  if (deleteDataNodeId) { viewNodeIds.push(deleteDataNodeId); }
  if (scriptNodeId) { viewNodeIds.push(scriptNodeId); }
  if (connectorCallNodeId) { viewNodeIds.push(connectorCallNodeId); }
  if (conditionNodeId) { viewNodeIds.push(conditionNodeId); }
  if (cycleNodeId) { viewNodeIds.push(cycleNodeId); }
  if (messageNodeId) { viewNodeIds.push(messageNodeId); }
  viewNodeIds.push(endNodeId);

  // ⚠️ 创建前强制校验「目标表单类型」是否匹配节点 setter 的 formTypes 白名单。
  // 根因：AddDataNode 表单选择器只查 receipt；InitiateApprovalNode 只查 process。
  // 若类型不匹配，设计器会报“表单不存在/无效表单，请重新配置”，且保存出的节点永远无效。
  // 故在此直接拦截并给出正确指引，绝不静默生成坏节点。
  async function assertFormType(kind, targetUuid, expected, hint) {
    if (!targetUuid) return;
    let actual = null;
    try {
      actual = await getFormType(authRef, { appType, formUuid: targetUuid.toString() });
    } catch (e) {
      console.error(`⚠️ 无法确认表单类型（${targetUuid}）：${e.message}，跳过类型校验`);
      return;
    }
    if (actual && actual !== expected) {
      const zh = { receipt: '普通表单', process: '流程表单', virtualView: '聚合表', report: '报表' };
      const msg =
        `${kind}节点的目标表单必须是「${zh[expected] || expected}(${expected})」，` +
        `但「${targetUuid}」是「${zh[actual] || actual}(${actual})」。${hint}`;
      console.error('❌ ' + msg);
      console.log(JSON.stringify({
        success: false,
        error: msg,
        code: 'FORM_TYPE_MISMATCH',
        node: kind,
        expected,
        actual,
        formUuid: targetUuid,
      }));
      process.exit(1);
    }
  }

  await assertFormType(
    '新增数据',
    addDataFormUuid,
    'receipt',
    '流程表单不能用「新增数据」节点新增，请改用「发起审批(InitiateApprovalNode)」节点（--initiate-approval-form-uuid）。'
  );
  await assertFormType(
    '发起审批',
    initiateApprovalFormUuid,
    'process',
    '普通表单不能用「发起审批」节点，请改用「新增数据(AddDataNode)」节点（--add-data-form-uuid）。'
  );

  // 获取目标表单 Schema（用于 viewJson 的 inputs/rules 字段）
  let addDataFormSchema = [];
  if (addDataFormUuid) {
    stepLog('获取新增目标表单Schema');
    addDataFormSchema = await getFormSchema(authRef, { appType, formUuid: addDataFormUuid.toString() });
    console.error('获取Schema成功: ' + addDataFormSchema.length + ' 个字段');
    // 子表新增：字段谱必须换成目标子表（TableField）的子字段，与设计器 setter 展示一致
    if (addDataInsertType === 'sub_table') {
      const tableField = addDataFormSchema.find(
        (c) => c.props && c.props.fieldId === addDataSubFormUuid
      );
      if (!tableField) {
        const msg = `新增目标表单「${addDataFormUuid}」中未找到子表字段「${addDataSubFormUuid}」，请确认子表字段ID（tableField_xxx）。`;
        console.error('❌ ' + msg);
        console.log(JSON.stringify({ success: false, error: msg, code: 'SUB_TABLE_NOT_FOUND', node: '新增数据', formUuid: addDataFormUuid }));
        process.exit(1);
      }
      // 递归采集子表内带 fieldId 的字段（子表 children 可能有包裹层）
      const subFields = [];
      (function collect(children) {
        for (const child of children || []) {
          if (!child || typeof child !== 'object') continue;
          if (child.props && child.props.fieldId) { subFields.push(child); }
          if (Array.isArray(child.children) && child.children.length > 0) { collect(child.children); }
        }
      })(tableField.children);
      addDataFormSchema = subFields;
      console.error('子表字段谱: ' + subFields.length + ' 个子字段');
    }
    // 字段谱为空 → AddDataNode 的 ky 校验（inputs.childList 非空）不过 → 设计器同样报无效。直接拦截。
    if (!addDataFormSchema.length) {
      const msg =
        `新增目标表单「${addDataFormUuid}」抓取到 0 个字段，生成的节点字段谱为空，` +
        `设计器会判定为无效节点。请确认表单存在且含可写字段后重试。`;
      console.error('❌ ' + msg);
      console.log(JSON.stringify({ success: false, error: msg, code: 'EMPTY_FORM_SCHEMA', node: '新增数据', formUuid: addDataFormUuid }));
      process.exit(1);
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

  // 获取循环体内更新数据的目标表单 Schema
  let cycleUpdateFormSchema = [];
  // 触发表单 Schema（用于 __display 中将触发字段ID替换为字段名称）
  let triggerFormSchema = [];
  if (cycleUpdateFormUuid) {
    try {
      stepLog('获取循环更新目标表单Schema');
      cycleUpdateFormSchema = await getFormSchema(authRef, { appType, formUuid: cycleUpdateFormUuid.toString() });
      console.error('获取Schema成功: ' + cycleUpdateFormSchema.length + ' 个字段');
    } catch (error) {
      console.error('获取Schema失败: ' + error.message + '（继续执行）');
    }
    // subform 模式下公式中会引用触发表单的子表字段，需要触发表单 Schema 来构建 __display
    if (dataSourceType === 'subform') {
      try {
        stepLog('获取触发表单Schema');
        triggerFormSchema = await getFormSchema(authRef, { appType, formUuid: formUuid.toString() });
        console.error('触发表单Schema成功: ' + triggerFormSchema.length + ' 个字段');
      } catch (error) {
        console.error('触发表单Schema失败: ' + error.message + '（继续执行）');
      }
    }
  }

  // 公式赋值中引用了触发表单字段时，需要触发表单 Schema 来构建 __display（CodeMirror marks）
  // 适用于 direct_form 更新和循环更新两种场景
  if (updateFormUuid && triggerFormSchema.length === 0) {
    const hasFormulaAssignment = (updateAssignments || []).some(a => a.valueType === 'column')
      || (cycleUpdateAssignments || []).some(a => a.valueType === 'column');
    if (hasFormulaAssignment) {
      try {
        stepLog('获取触发表单Schema');
        triggerFormSchema = await getFormSchema(authRef, { appType, formUuid: formUuid.toString() });
        console.error('触发表单Schema成功: ' + triggerFormSchema.length + ' 个字段');
      } catch (error) {
        console.error('触发表单Schema失败: ' + error.message + '（继续执行）');
      }
    }
  }

  // 批量新增数据源：'get' 表示前置获取节点（取其画布 id），否则为触发表子表字段ID
  let addDataSourceId = addDataSourceIdRaw;
  if (addDataSourceIdRaw === 'get') {
    if (!dataNodeId) {
      console.error('错误: --add-data-source-id get 需要前置获取节点，请同时提供 --data-form-uuid（或 --get-self）');
      process.exit(1);
    }
    addDataSourceId = dataNodeId;
  }

  // node 模式更新：sourceId 指向前置获取节点的画布 id；direct_form 模式指向目标主表 formUuid
  let updateSourceId = '';
  if (updateFormUuid) {
    if (updateType === 'node') {
      if (!dataNodeId) {
        console.error('错误: --update-type node 需要前置获取节点，请同时提供 --data-form-uuid（或 --get-self）');
        process.exit(1);
      }
      updateSourceId = dataNodeId;
    } else {
      updateSourceId = updateFormUuid;
    }
  }

  // 构建 processJson 和 viewJson
  const processJson = buildProcessJson({
    processCode, formUuid, appType, formEventTypes,
    notificationTitle, notificationContent, toUsers, userFields,
    nodeIds: processNodeIds,
    addDataFormUuid: addDataFormUuid || undefined,
    addDataAssignments,
    addDataInsertType, addDataSubFormUuid, addDataType, addDataSourceId,
    initiateApprovalFormUuid: initiateApprovalFormUuid || undefined,
    initiateApprovalFormName: '',
    initiateApprovalInitiator: initiateApprovalInitiator || undefined,
    initiateApprovalAssignments,
    dataFormUuid: dataFormUuid || undefined,
    dataConditions, dataQueryType, dataQuantity,
    hasMessageNode, approvalActions, approvalNodeIds,
    triggerRecursively, triggerConditions, triggerLogic,
    updateFormUuid: updateFormUuid || undefined,
    updateConditions, updateAssignments,
    updateType, updateSourceId, updateSubSourceId, updateSubConditions, updateNoneOperation,
    hasDeleteDataNode, deleteSubSourceId,
    hasScriptNode, scriptCode, scriptOutputs, scriptLang,
    hasConditionNode, branchCondition, branchConditions, branchLogic, conditionBranchIds,
    hasCycleNode,
    dataSourceType, dataSubFieldId,
    cycleUpdateFormUuid, cycleUpdateConditions, cycleUpdateAssignments, cycleUpdateNoneOperation, cycleUpdateDataNodeId,
    connectorId: connectorIdArg, actionId: actionIdArg,
    connectorAssignments, connectorDescription: connectorNameArg || undefined,
    connectorMode: connectorModeArg, connectionId: connectionIdArg,
  });

  const viewJson = buildViewJson({
    processCode, formUuid, formEventTypes, notificationTitle, notificationContent,
    toUsers, userFields, appType, nodeIds: viewNodeIds,
    addDataFormUuid: addDataFormUuid || undefined,
    addDataAssignments, addDataFormSchema, addDataFormName: '',
    addDataInsertType, addDataSubFormUuid, addDataType, addDataSourceId,
    initiateApprovalFormUuid: initiateApprovalFormUuid || undefined,
    initiateApprovalFormName: '',
    initiateApprovalInitiator: initiateApprovalInitiator || undefined,
    initiateApprovalAssignments,
    dataFormUuid: dataFormUuid || undefined,
    dataConditions, dataQueryType, dataQuantity,
    hasMessageNode, approvalActions, approvalNodeIds,
    triggerRecursively, triggerConditions, triggerLogic,
    updateFormUuid: updateFormUuid || undefined,
    updateConditions, updateAssignments, updateFormSchema, updateFormName: '',
    updateType, updateSourceId, updateSubSourceId, updateSubConditions, updateNoneOperation,
    hasDeleteDataNode, deleteSubSourceId,
    hasScriptNode, scriptCode, scriptOutputs, scriptLang,
    hasConditionNode, branchCondition, branchConditions, branchLogic, conditionBranchIds,
    hasCycleNode,
    dataSourceType, dataSubFieldId,
    cycleUpdateFormUuid, cycleUpdateConditions, cycleUpdateAssignments, cycleUpdateNoneOperation, cycleUpdateDataNodeId,
    cycleUpdateFormSchema,
    triggerFormSchema,
    connectorId: connectorIdArg, actionId: actionIdArg,
    connectorAssignments, connectorName: connectorNameArg,
    connectorDisplayName: connectorDisplayNameArg,
    connectorIcon: connectorIconArg, connectorInputs: connectorInputsJson,
    connectorMode: connectorModeArg, connectionId: connectionIdArg,
  });

  // Step: 保存前体检（门禁）—— saveProcess 不校验 props 完整性，半成品也能保存成功，必须在这里拦住
  stepLog('保存前体检');
  const schemaMap = {};
  // 仅主表直接更新时校验字段存在性（子表更新的字段谱是子字段，与主表 Schema 不同层）
  if (updateFormUuid && !updateSubSourceId && updateFormSchema.length > 0) {
    schemaMap[updateFormUuid.toString()] = updateFormSchema
      .map((c) => c.props && c.props.fieldId).filter(Boolean);
  }
  if (addDataFormUuid && addDataFormSchema.length > 0) {
    schemaMap[addDataFormUuid.toString()] = addDataFormSchema
      .map((c) => c.props && c.props.fieldId).filter(Boolean);
  }
  const validation = validateProcessJson(processJson, { schemaMap });
  console.error(formatReport(validation));
  if (validation.errors.length > 0) {
    if (!forceSave) {
      console.error('体检未通过，已拒绝保存（避免产生看似保存成功实则不工作的废流）。');
      console.error('请按上方 [ERROR] 提示修正参数后重试；确认无误可加 --force-save 跳过门禁。');
      console.log(JSON.stringify({ success: false, error: '保存前体检未通过', code: 'VALIDATION_FAILED', issues: validation.errors }));
      process.exit(1);
    }
    console.error('⚠️ --force-save 已指定，跳过体检门禁继续保存');
    const auditPath = appendGateBypassAudit({
      gate: 'integration-create --force-save',
      processCode,
      appType,
      formUuid,
      flowName,
      errorCount: validation.errors.length,
      reason: forceSaveReason || '(未提供原因)',
    });
    console.error('审计留痕已写入: ' + auditPath);
  }

  // Step: 保存逻辑流（草稿）
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
