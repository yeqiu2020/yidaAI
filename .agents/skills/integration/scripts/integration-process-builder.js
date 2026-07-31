'use strict';

const { generateRuleGroupId, generateRuleItemId, generateDataRuleId, generateButtonUuid } = require('./integration-node-ids');

/**
 * integration-process-builder.js - 构建逻辑流执行引擎节点定义（processJson）
 *
 * processJson 是 saveProcess 接口的 json 参数，描述节点的逻辑关系和执行规则。
 * 与 integration-view-builder.js 的区别：
 *   - 本文件：执行引擎用，关注 nextId、type、props.inputs 等执行逻辑
 *   - view-builder：前端画布用，关注 componentName、addDataRules.inputs/rules 等渲染 Schema
 */

/**
 * 将用户友好的事件名称映射到宜搭 API 使用的事件类型
 */
function mapEventTypes(events) {
  const eventMapping = {
    create: 'insert',
    insert: 'insert',
    update: 'update',
    delete: 'delete',
    comment: 'comment',
    processfinish: 'processFinish',
    process_finish: 'processFinish',
    approval: 'processFinish',
    approve: 'processFinish',
    process: 'processFinish',
    activitytask: 'activityTask',
    activity_task: 'activityTask',
    approvalnode: 'activityTask',
    approval_node: 'activityTask',
  };
  return events
    .map((event) => eventMapping[event.toLowerCase()])
    .filter(Boolean);
}

function mapTriggerOperator(opCode) {
  const operatorMapping = {
    Equal: '等于',
    NotEqual: '不等于',
    Contain: '包含',
    NotContain: '不包含',
    HasValue: '有值',
    NoValue: '没有值',
    ExistValue: '有值',
    NotExistValue: '没有值',
    GreaterThan: '大于',
    LessThan: '小于',
    GreaterThanOrEqual: '大于等于',
    LessThanOrEqual: '小于等于',
    In: '等于任意一个',
    NotIn: '不等于任意一个',
  };
  return operatorMapping[opCode] || opCode || '等于';
}

function mapDataRetrieveOperator(opCode) {
  return mapTriggerOperator(opCode || 'Contain');
}

function normalizeLogic(logic) {
  return String(logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
}

function normalizeAssignmentValue(valueType, value) {
  return valueType === 'literal' && !isNaN(Number(value)) ? Number(value) : value;
}

function buildTriggerCondition(triggerConditions, logic) {
  const groupId = generateRuleGroupId();
  const rules = (triggerConditions || []).map((condition) => {
    const opCode = condition.opCode || 'Equal';
    const valueType = condition.valueType || 'literal';
    const rawValue = condition.value;
    const ruleValue = normalizeAssignmentValue(valueType, rawValue);
    return {
      id: condition.fieldId,
      op: mapTriggerOperator(opCode),
      operators: [],
      value: ruleValue,
      componentType: condition.componentType || 'TextField',
      ruleId: generateRuleItemId(),
      parentId: groupId,
      extValue: valueType === 'literal' ? 'value' : valueType,
      ruleValue,
      name: condition.fieldName || condition.fieldId,
      valueType,
      ruleType: 'rule_text',
      opCode,
    };
  });
  const normalizedLogic = normalizeLogic(logic);
  return {
    condition: normalizedLogic,
    rules,
    ruleId: groupId,
    conditionCode: normalizedLogic === 'OR' ? '||' : '&&',
  };
}

/**
 * 构建获取单条数据节点的过滤条件对象
 */
function buildDataRetrieveCondition(dataConditions, logic) {
  const groupId = generateRuleGroupId();
  const rules = dataConditions.map((condition) => {
    const opCode = condition.opCode || 'Contain';
    const valueType = condition.valueType || 'processVar';
    const rawValue = condition.aFieldId || condition.value;
    const ruleValue = normalizeAssignmentValue(valueType, rawValue);
    return {
      id: condition.bFieldId,
      op: mapDataRetrieveOperator(opCode),
      operators: [],
      value: ruleValue,
      componentType: condition.componentType || 'TextField',
      ruleId: generateRuleItemId(),
      parentId: groupId,
      extValue: valueType === 'literal' ? 'value' : valueType,
      ruleValue,
      name: condition.bFieldName,
      valueType,
      ruleType: 'rule_text',
      opCode,
    };
  });
  const normalizedLogic = normalizeLogic(logic);
  return {
    condition: normalizedLogic,
    rules,
    ruleId: groupId,
    conditionCode: normalizedLogic === 'OR' ? '||' : '&&',
  };
}

/**
 * 构建新增数据节点的字段赋值列表
 */
function buildDataCreateAssignments(assignments) {
  return assignments.map(({ column, valueType, value }) => ({
    column,
    valueType,
    value: normalizeAssignmentValue(valueType, value),
    assignments: [],
  }));
}

function buildDataUpdateAssignments(assignments) {
  return assignments.map(({ column, valueType, value }) => ({
    column,
    valueType,
    value: normalizeAssignmentValue(valueType, value),
  }));
}

function buildUpdateConditions(updateConditions) {
  const groupId = generateRuleGroupId();
  const rules = updateConditions.map(({ bFieldId, bFieldName, aFieldId, componentType, opCode, opValue, valueType }) => ({
    id: bFieldId,
    op: mapTriggerOperator(opCode || 'Equal'),
    operators: [],
    value: valueType === 'processVar' ? aFieldId : (opValue || aFieldId),
    componentType: componentType || 'TextField',
    ruleId: generateRuleItemId(),
    parentId: groupId,
    extValue: valueType || 'literal',
    ruleValue: valueType === 'processVar' ? aFieldId : (opValue || aFieldId),
    name: bFieldName || bFieldId,
    valueType: valueType || 'literal',
    ruleType: 'rule_text',
    opCode: opCode || 'Equal',
  }));
  return {
    condition: 'AND',
    rules,
    ruleId: groupId,
    conditionCode: '&&',
  };
}

// 脚本输出变量类型 -> 设计器展示名（脚本 setter 输出表格的 typeDesc 列）
const SCRIPT_OUTPUT_TYPE_DESC = {
  Text: '文本',
  Number: '数字',
  Array: '数组',
  Object: '对象',
  Boolean: '布尔',
};

/**
 * 构建脚本节点的画布规则对象（viewJson props.JavaScript）
 * ⚠️ 权威形状源于 bundle 脚本 setter saveValue：
 *   { inputs, scriptType, action:{code, exceptionStrategy}, outputs, testInputs }
 * outputs[].name 必须为 <节点id>_<变量名>，引擎按该名注册流程变量（valueType=processVar）
 */
function normalizeScriptType(scriptLang) {
  return String(scriptLang || '').toLowerCase() === 'groovy' ? 'Groovy' : 'JavaScript';
}

function buildScriptRules(scriptCode, scriptOutputs, scriptNodeId, scriptLang) {
  const outputs = (scriptOutputs || []).map((output) => ({
    componentName: '',
    desc: output.desc || output.name,
    name: `${scriptNodeId}_${output.name}`,
    type: output.type || 'Text',
    typeDesc: SCRIPT_OUTPUT_TYPE_DESC[output.type] || output.type || '文本',
    value: '',
    valueType: 'processVar',
  }));
  return {
    inputs: [
      {
        name: '',
        componentName: '',
        valueType: 'literal',
        value: '',
        required: false,
        ruleId: generateDataRuleId(),
      },
    ],
    scriptType: normalizeScriptType(scriptLang),
    action: { code: scriptCode || '', exceptionStrategy: '' },
    outputs,
    testInputs: [],
  };
}

/**
 * 脚本节点 processJson props
 * ⚠️ 权威形状源于 bundle Gb 转换器：
 *   { inputs, action, scriptType, outputsSchema } —— outputsSchema 由 outputs 映射
 *   （{description: desc, name, type, valueType}），processJson type 为 CodeExecutor（Jct）
 */
function buildScriptNodeProps(scriptCode, scriptOutputs, scriptNodeId, scriptLang) {
  const rules = buildScriptRules(scriptCode, scriptOutputs, scriptNodeId, scriptLang);
  return {
    inputs: rules.inputs,
    action: rules.action,
    scriptType: rules.scriptType,
    outputsSchema: rules.outputs.map((output) => ({
      description: output.desc,
      name: output.name,
      type: output.type,
      valueType: output.valueType,
    })),
  };
}

// 归一化条件分支入参：兼容单条件对象（旧）与条件数组（多条件）
function normalizeBranchConditions(branchConditions, branchCondition) {
  if (Array.isArray(branchConditions) && branchConditions.length > 0) {
    return branchConditions.filter(Boolean);
  }
  return branchCondition ? [branchCondition] : [];
}

// 条件分支规则树：支持多条件 + AND/OR 逻辑（logic 缺省 AND）
function buildConditionNodeProps(branchConditions, logic) {
  const list = normalizeBranchConditions(branchConditions);
  const groupId = generateRuleGroupId();
  const rules = list.map((bc) => {
    const opCode = bc.opCode || 'Equal';
    const ruleValue = normalizeAssignmentValue(bc.valueType, bc.value);
    return {
      id: bc.fieldId || '',
      op: mapTriggerOperator(opCode),
      operators: [],
      value: ruleValue,
      componentType: bc.componentType || 'TextField',
      ruleId: generateRuleItemId(),
      parentId: groupId,
      extValue: bc.valueType || 'literal',
      ruleValue,
      name: bc.fieldName || bc.fieldId || '',
      valueType: bc.valueType || 'literal',
      ruleType: 'rule_text',
      opCode,
    };
  });
  const normalizedLogic = normalizeLogic(logic);
  return {
    condition: normalizedLogic,
    rules,
    ruleId: groupId,
    conditionCode: normalizedLogic === 'OR' ? '||' : '&&',
  };
}

function buildInitiateApprovalAssignments(assignments, options) {
  const includeRequired = options ? options.includeRequired !== false : true;
  return (assignments || []).map(({ column, valueType, value }) => {
    const assignment = {
      column,
      valueType,
      value: normalizeAssignmentValue(valueType, value),
    };
    if (includeRequired) {
      assignment.required = false;
    }
    return assignment;
  });
}

/**
 * 构建连接器调用节点的入参映射列表
 */
function buildConnectorCallAssignments(assignments) {
  return assignments.map(({ column, valueType, value }) => ({
    column,
    valueType,
    value: normalizeAssignmentValue(valueType, value),
    assignments: [],
  }));
}

/**
 * 推断连接器模式
 * connectorId 以 Http_ 开头时自动按 5（HTTP 连接器）处理
 */
function resolveConnectorMode(connectorId, connectorMode) {
  const parsedMode = Number(connectorMode || 0);
  if (Number.isFinite(parsedMode) && parsedMode > 0) {
    return parsedMode;
  }
  return String(connectorId || '').startsWith('Http_') ? 5 : 1;
}

/**
 * 构建 json 参数（节点定义，对应 saveProcess 接口的 json 字段）
 *
 * 节点顺序：trigger -> dataRetrieve -> addData -> initiateApproval -> updateData -> deleteData -> script -> connector -> condition -> message -> end
 */
function buildProcessJson(options) {
  const {
    processCode, formUuid, appType, formEventTypes,
    notificationTitle, notificationContent, toUsers, userFields, nodeIds,
    addDataFormUuid, addDataAssignments,
    initiateApprovalFormUuid, initiateApprovalFormName,
    initiateApprovalInitiator, initiateApprovalAssignments,
    dataFormUuid, dataConditions, hasMessageNode, approvalActions,
    approvalNodeIds, triggerRecursively, triggerConditions, triggerLogic,
    connectorId, actionId, connectorAssignments, connectorDescription,
    connectorMode, connectionId,
    dataQueryType, dataQuantity,
    updateFormUuid, updateConditions, updateAssignments,
    hasDeleteDataNode, deleteSubSourceId,
    hasScriptNode, scriptCode, scriptOutputs, scriptLang,
    hasConditionNode, branchCondition, branchConditions, branchLogic, conditionBranchIds,
    hasCycleNode,
    // 数据来源类型：form(默认,从表单查询) 或 subform(从触发数据子表获取)
    // bundle 验证：originalType="sub_table" 时 sourceId="#{formUuid}"，subSourceId=子表字段ID
    dataSourceType, dataSubFieldId,
    // 循环体内更新数据节点（用于 --cycle + --cycle-update-form-uuid 组合）
    // 场景：遍历触发子表行，逐行 UPSERT 目标表单记录
    cycleUpdateFormUuid, cycleUpdateConditions, cycleUpdateAssignments,
    cycleUpdateNoneOperation, cycleUpdateDataNodeId,
  } = options;

  const hasAddDataNode = Boolean(addDataFormUuid);
  // subform 模式下即使没有 dataFormUuid 也需要创建 GetBatchDataNode 从触发子表获取数据
  const hasDataNode = Boolean(dataFormUuid) || dataSourceType === 'subform';
  const hasInitiateApprovalNode = Boolean(initiateApprovalFormUuid);
  const hasUpdateDataNode = Boolean(updateFormUuid);
  const hasDeleteNode = Boolean(hasDeleteDataNode);
  const hasConnectorCallNode = Boolean(connectorId && actionId);
  const hasScript = Boolean(hasScriptNode);
  const hasCondition = Boolean(hasConditionNode);
  const hasCycle = Boolean(hasCycleNode);
  const hasCycleUpdateNode = Boolean(cycleUpdateFormUuid) && Boolean(cycleUpdateDataNodeId);
  const normalizedConnectorMode = resolveConnectorMode(connectorId, connectorMode);
  const connectorProcessType = normalizedConnectorMode === 5 ? 'httpConnector' : 'innerConnector';
  const includeMessageNode = hasMessageNode !== false;
  const dataQueryIsMultiple = dataQueryType === 'multiple';
  const isApprovalNodeEvent = formEventTypes.includes('activityTask');
  const isApprovalProcessEvent = formEventTypes.includes('processFinish');
  const normalizedApprovalActions = Array.isArray(approvalActions)
    ? approvalActions.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const normalizedApprovalNodeIds = Array.isArray(approvalNodeIds)
    ? approvalNodeIds.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const normalizedTriggerConditions = Array.isArray(triggerConditions)
    ? triggerConditions.filter(Boolean)
    : [];
  const triggerConditionObject = normalizedTriggerConditions.length > 0
    ? buildTriggerCondition(normalizedTriggerConditions, triggerLogic)
    : null;
  const activityTask = isApprovalNodeEvent
    ? normalizedApprovalNodeIds.map((activityId) => ({
      activityId: [activityId],
      activityAction: normalizedApprovalActions,
    }))
    : [];

  // 节点顺序：trigger, dataRetrieve, addData, initiateApproval, updateData, deleteData, script, connector, condition, cycle, message, end
  let nodeIdIndex = 0;
  const triggerNodeId = nodeIds[nodeIdIndex++];
  const dataNodeId = hasDataNode ? nodeIds[nodeIdIndex++] : null;
  const addDataNodeId = hasAddDataNode ? nodeIds[nodeIdIndex++] : null;
  const initiateApprovalNodeId = hasInitiateApprovalNode ? nodeIds[nodeIdIndex++] : null;
  const updateDataNodeId = hasUpdateDataNode ? nodeIds[nodeIdIndex++] : null;
  const deleteDataNodeId = hasDeleteNode ? nodeIds[nodeIdIndex++] : null;
  const scriptNodeId = hasScript ? nodeIds[nodeIdIndex++] : null;
  const connectorCallNodeId = hasConnectorCallNode ? nodeIds[nodeIdIndex++] : null;
  const conditionNodeId = hasCondition ? nodeIds[nodeIdIndex++] : null;
  const cycleNodeId = hasCycle ? nodeIds[nodeIdIndex++] : null;
  const messageNodeId = includeMessageNode ? nodeIds[nodeIdIndex++] : null;
  const endNodeId = nodeIds[nodeIdIndex++];

  // 链路末端：hasCycle 时消息节点移入循环容器，主链上的后继变为循环容器
  const tailNodeId = hasCycle ? cycleNodeId : includeMessageNode ? messageNodeId : endNodeId;

  // 计算下一个节点 ID 的辅助函数
  function nextAfter(current) {
    if (current === 'trigger') {
      return hasDataNode ? dataNodeId
        : hasAddDataNode ? addDataNodeId
        : hasInitiateApprovalNode ? initiateApprovalNodeId
        : hasUpdateDataNode ? updateDataNodeId
        : hasDeleteNode ? deleteDataNodeId
        : hasScript ? scriptNodeId
        : hasConnectorCallNode ? connectorCallNodeId
        : hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'dataRetrieve') {
      return hasAddDataNode ? addDataNodeId
        : hasInitiateApprovalNode ? initiateApprovalNodeId
        : hasUpdateDataNode ? updateDataNodeId
        : hasDeleteNode ? deleteDataNodeId
        : hasScript ? scriptNodeId
        : hasConnectorCallNode ? connectorCallNodeId
        : hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'addData') {
      return hasInitiateApprovalNode ? initiateApprovalNodeId
        : hasUpdateDataNode ? updateDataNodeId
        : hasDeleteNode ? deleteDataNodeId
        : hasScript ? scriptNodeId
        : hasConnectorCallNode ? connectorCallNodeId
        : hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'initiateApproval') {
      return hasUpdateDataNode ? updateDataNodeId
        : hasDeleteNode ? deleteDataNodeId
        : hasScript ? scriptNodeId
        : hasConnectorCallNode ? connectorCallNodeId
        : hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'updateData') {
      return hasDeleteNode ? deleteDataNodeId
        : hasScript ? scriptNodeId
        : hasConnectorCallNode ? connectorCallNodeId
        : hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'deleteData') {
      return hasScript ? scriptNodeId
        : hasConnectorCallNode ? connectorCallNodeId
        : hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'script') {
      return hasConnectorCallNode ? connectorCallNodeId
        : hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'connector') {
      return hasCondition ? conditionNodeId
        : tailNodeId;
    }
    if (current === 'condition') {
      return tailNodeId;
    }
    return endNodeId;
  }

  const triggerNextId = nextAfter('trigger');

  const nodes = [
    {
      name: {
        en_US: 'Form event trigger',
        zh_CN: '表单事件触发',
        type: 'i18n',
      },
      description: '',
      type: 'trigger',
      nodeId: triggerNodeId,
      prevId: '',
      nextId: [triggerNextId],
      props: {
        inputs: {
          formEventType: formEventTypes,
          formEventField: '',
          formUuid,
          conditions: triggerConditionObject,
          activityAction: isApprovalProcessEvent || isApprovalNodeEvent ? normalizedApprovalActions : [],
          triggerFormEventRecursively: Boolean(triggerRecursively),
          activityId: isApprovalNodeEvent ? normalizedApprovalNodeIds : [],
          activityTask,
        },
        triggerType: 'FormEvent',
      },
      childNodes: [],
    },
  ];

  // 获取单条/多条数据节点（可选）
  // bundle 验证（0.2.241）：originalType 合法值含 form/process/process_form/node/association/sub_table/data_service
  //   originalType="sub_table" 时：sourceId="#{触发表formUuid}"，subSourceId=触发子表字段ID(tableField_xxx)
  //   用于从触发数据子表获取多条数据，配合 CycleContainer 逐行处理
  if (hasDataNode && dataNodeId) {
    const conditions = dataConditions && dataConditions.length > 0
      ? buildDataRetrieveCondition(dataConditions)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    const dataRetrieveQuantity = dataQueryIsMultiple ? String(dataQuantity || 100) : '1';
    const dataRetrieveNextId = nextAfter('dataRetrieve');

    const isSubformSource = dataSourceType === 'subform';
    const dataOriginalType = isSubformSource ? 'sub_table' : 'form';
    const dataSourceIdValue = isSubformSource ? `#{${formUuid}}` : dataFormUuid;
    const dataSubSourceIdValue = isSubformSource ? (dataSubFieldId || '') : '';

    nodes.push({
      name: { zh_CN: dataQueryIsMultiple ? '获取多条数据' : '获取单条数据', en_US: '' },
      description: '请设置想要获取的数据',
      type: 'dataRetrieve',
      nodeId: dataNodeId,
      prevId: '',
      nextId: [dataRetrieveNextId],
      props: {
        // bundle $b：批量=batch / 单条=single（与 viewJson 节点级 type 一致）
        type: dataQueryIsMultiple ? 'batch' : 'single',
        filterType: 'condition',
        sort: { type: 'none', column: '' },
        sourceId: dataSourceIdValue,
        appType: isSubformSource ? '' : appType,
        originalType: dataOriginalType,
        subSourceId: dataSubSourceIdValue,
        condition: conditions,
        quantity: dataRetrieveQuantity,
        dataRules: {
          rules: [
            {
              componentName: '',
              labe: '',
              name: '',
              required: false,
              ruleId: generateDataRuleId(),
              value: '',
              valueType: 'literal',
            },
          ],
        },
        assignments: [],
      },
      childNodes: [],
    });
  }

  // 新增数据节点（可选）
  // 官方支持两种新增方式：表单中新增(insertType=form) / 在子表中新增(insertType=sub_table，需 subFormUuid)
  // type=batch（新增多条）时必须提供 sourceId（数据源：触发子表字段或前置获取多条节点），对应 bundle ky 校验
  if (hasAddDataNode && addDataNodeId) {
    const addDataNextId = nextAfter('addData');
    const addInsertType = options.addDataInsertType === 'sub_table' ? 'sub_table' : 'form';
    const addType = options.addDataType === 'batch' ? 'batch' : 'single';

    nodes.push({
      name: { zh_CN: '新增数据', en_US: '' },
      description: '请设置新增数据',
      type: 'dataCreate',
      nodeId: addDataNodeId,
      prevId: '',
      nextId: [addDataNextId],
      props: {
        formUuid: addDataFormUuid,
        appType,
        subFormUuid: addInsertType === 'sub_table' ? (options.addDataSubFormUuid || '') : '',
        insertType: addInsertType,
        type: addType,
        sourceId: addType === 'batch' ? (options.addDataSourceId || '') : '',
        assignments: buildDataCreateAssignments(addDataAssignments || []),
      },
      childNodes: [],
    });
  }

  // 发起审批节点（可选）
  if (hasInitiateApprovalNode && initiateApprovalNodeId) {
    const initiateApprovalNextId = nextAfter('initiateApproval');
    const formDisplayName = initiateApprovalFormName || initiateApprovalFormUuid;

    nodes.push({
      name: { zh_CN: '发起审批', en_US: 'Initiate approval', type: 'i18n' },
      description: '请设置发起审批',
      type: 'initiateApproval',
      nodeId: initiateApprovalNodeId,
      prevId: '',
      nextId: [initiateApprovalNextId],
      props: {
        type: 'single',
        initiator: initiateApprovalInitiator || { type: 'select_user', value: '' },
        assignments: buildInitiateApprovalAssignments(initiateApprovalAssignments || [], { includeRequired: false }),
        formUuid: initiateApprovalFormUuid,
        processCode,
        formTitle: '',
        appType,
        description: `在 [${formDisplayName}] 中发起一条审批`,
      },
      childNodes: [],
    });
  }

  // 更新数据节点（执行引擎 JSON）
  // ⚠️ 权威形状源于 bundle Jb：processJson 的 props 是 updateDataRules 直接展开的扁平结构
  //   { type, sourceId, subSourceId, condition, subCondition, assignments, noneOperation, rulesFilter, tableRulesFilter }
  //   不能嵌套在 props.updateDataRules 下，否则后端报「转换xml失败」
  if (hasUpdateDataNode && updateDataNodeId) {
    const updateNextId = nextAfter('updateData');
    const updateType = options.updateType || 'direct_form';
    const targetMainFormUuid = options.updateSourceId || updateFormUuid;
    const targetSubFieldId = options.updateSubSourceId || '';
    const hasSubUpdate = Boolean(targetSubFieldId);

    const mainCondition = buildUpdateConditions(updateConditions || []);
    const subCondition = hasSubUpdate
      ? buildUpdateConditions(options.updateSubConditions || [])
      : {};

    const updateDataProps = {
      type: updateType,
      sourceId: targetMainFormUuid,
      subSourceId: targetSubFieldId,
      // 主条件：定位目标主表记录
      condition: mainCondition,
      // 子条件：仅子表更新时非空（引擎对子表行逐行匹配）
      subCondition,
      // 赋值规则（valueType='column' 为公式）
      assignments: buildDataUpdateAssignments(updateAssignments || []),
      // 未匹配到目标数据时：ignored=跳过 / add=新增一条(upsert)
      noneOperation: options.updateNoneOperation || 'ignored',
      // 设计器回读时的条件行UI状态（镜像 condition/subCondition 的 rules）
      rulesFilter: mainCondition.rules || [],
      tableRulesFilter: hasSubUpdate ? (subCondition.rules || []) : [],
    };

    nodes.push({
      name: { zh_CN: '更新数据', en_US: '' },
      description: '请设置要更新的数据',
      type: 'dataUpdate',
      nodeId: updateDataNodeId,
      prevId: '',
      nextId: [updateNextId],
      props: updateDataProps,
      childNodes: [],
    });
  }

  // 删除数据节点（可选）
  // 官方语义：删除前必须先用获取数据节点拿到数据，sourceId 指向前置获取节点的 nodeId
  // 保存形状源于 bundle Xb：无 subSourceId 时 type="node" 且不带 subSourceId 字段
  if (hasDeleteNode && deleteDataNodeId) {
    const deleteNextId = nextAfter('deleteData');
    const deleteProps = {
      appType,
      sourceId: dataNodeId,
      type: 'node',
    };
    if (deleteSubSourceId) {
      deleteProps.subSourceId = deleteSubSourceId;
    }

    nodes.push({
      name: { zh_CN: '删除数据', en_US: '' },
      description: '请设置要删除的数据',
      type: 'dataDelete',
      nodeId: deleteDataNodeId,
      prevId: '',
      nextId: [deleteNextId],
      props: deleteProps,
      childNodes: [],
    });
  }

  // 脚本节点（可选）
  // ⚠️ bundle Jct：JavaScriptNode/GroovyNode -> type "CodeExecutor"；props 形状源于 Gb 转换器
  //   （Gb 取 props.groovy || props.JavaScript，二者结构一致，仅 scriptType 不同）
  if (hasScript && scriptNodeId) {
    const scriptNextId = nextAfter('script');
    const isGroovy = String(scriptLang || '').toLowerCase() === 'groovy';

    nodes.push({
      name: { zh_CN: isGroovy ? 'Groovy脚本' : 'JavaScript脚本', en_US: '' },
      description: '',
      type: 'CodeExecutor',
      nodeId: scriptNodeId,
      prevId: '',
      nextId: [scriptNextId],
      props: buildScriptNodeProps(scriptCode || '', scriptOutputs || [], scriptNodeId, scriptLang),
      childNodes: [],
    });
  }

  // 连接器调用节点（可选）
  if (hasConnectorCallNode && connectorCallNodeId) {
    const connectorCallNextId = nextAfter('connector');

    nodes.push({
      name: { zh_CN: '连接器', en_US: '' },
      description: connectorDescription || '请选择连接器',
      type: connectorProcessType,
      nodeId: connectorCallNodeId,
      prevId: '',
      nextId: [connectorCallNextId],
      props: {
        inputs: {
          url: '',
          method: '',
          body: '',
          connection: connectionId || '',
          connectionId: connectionId || '',
          connectorMode: normalizedConnectorMode,
          connectorId,
          actionId,
          assignments: buildConnectorCallAssignments(connectorAssignments || []),
        },
      },
      childNodes: [],
    });
  }

  // 条件分支（可选）
  // ⚠️ 权威结构源于 bundle Jct/nut/Yct/jb：
  //   ConditionContainer -> type "route"，容器 nextId = 所有子分支节点 id 数组，props.outgoingType='priority'（Ub）
  //   ConditionNode -> type "condition"，prevId = 父容器 id（nut：仅分支节点有 prevId）
  //   分支 props 源于 jb 转换器 { priority, isDefault, conditions, calculate, expression }；默认分支 priority=2147483647
  //   ✅ 分支路由（执行图层）：命中分支(条件1) -> 下游尾节点(消息/循环)；默认分支(其他情况) -> 直接结束
  //   以此实现“满足条件才执行尾节点”的真分支（旧版两分支 nextId 相同，条件形同虚设）
  if (hasCondition && conditionNodeId) {
    const branchIds = conditionBranchIds || {};
    const branchYesId = branchIds.yes;
    const branchDefaultId = branchIds.fallback;
    const conditionNextId = nextAfter('condition');
    const branchList = normalizeBranchConditions(branchConditions, branchCondition);
    const conditionObject = branchList.length > 0
      ? buildConditionNodeProps(branchList, branchLogic)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    nodes.push({
      name: { zh_CN: '条件分支', en_US: '' },
      description: '',
      type: 'route',
      nodeId: conditionNodeId,
      prevId: '',
      nextId: [branchYesId, branchDefaultId],
      props: { outgoingType: 'priority' },
      childNodes: [
        {
          name: { zh_CN: '条件1', en_US: '' },
          description: '',
          type: 'condition',
          nodeId: branchYesId,
          prevId: conditionNodeId,
          nextId: [conditionNextId],
          props: {
            priority: 1,
            isDefault: false,
            conditions: conditionObject,
            calculate: 'condition',
            expression: '',
          },
          childNodes: [],
        },
        {
          name: { zh_CN: '其他情况', en_US: '' },
          description: '',
          type: 'condition',
          nodeId: branchDefaultId,
          prevId: conditionNodeId,
          // 默认分支不走尾节点，直接到结束（与命中分支形成真正分流）
          nextId: [endNodeId],
          props: {
            priority: 2147483647,
            isDefault: true,
          },
          childNodes: [],
        },
      ],
    });
  }

  // 消息通知节点（可选）；hasCycle 时作为循环体嵌入 CycleContainer.childNodes，nextId 回指容器（Fb 回环规则）
  let messageNode = null;
  if (includeMessageNode && messageNodeId) {
    messageNode = {
      name: { zh_CN: '消息通知', en_US: '' },
      description: '请设置消息通知',
      type: 'sendMessage',
      nodeId: messageNodeId,
      prevId: '',
      nextId: hasCycle ? [cycleNodeId] : [endNodeId],
      props: {
        template: { templateName: '' },
        messageType: 'NORMAL',
        messageInfo: {
          title: notificationTitle,
          content: notificationContent,
          buttons: [
            {
              name: '查看详情',
              type: 'commit',
              value: `//yidalogin.aliwork.com/${appType}/formDetail/${formUuid}?formInstId=\${formInstId}`,
              buttonUuid: generateButtonUuid(),
            },
          ],
        },
        appType,
        toRoles: [],
        toUsers,
        userFields: Array.isArray(userFields) && userFields.length > 0 ? userFields : ['form_inst_creator'],
      },
      childNodes: [],
    };
  }

  // 循环体内更新数据节点（可选）
  // 场景：遍历触发子表行（通过 GetBatchDataNode originalType=sub_table 获取），
  //   循环体内逐行 UPSERT 目标表单记录（如：触发表子表各行 → 各自对应的目标表主表记录）
  // ⚠️ processJson props 必须扁平展开 updateDataRules（与主链 UpdateDataNode 一致，bundle Jb）
  //   循环体末节点 nextId 回指容器自身形成回环（Fb）
  let cycleUpdateNode = null;
  if (hasCycleUpdateNode && cycleUpdateDataNodeId) {
    const cycleUpdateMainCondition = buildUpdateConditions(cycleUpdateConditions || []);
    cycleUpdateNode = {
      name: { zh_CN: '更新数据', en_US: '' },
      description: '请设置要更新的数据',
      type: 'dataUpdate',
      nodeId: cycleUpdateDataNodeId,
      prevId: '',
      nextId: [cycleNodeId],
      props: {
        type: 'direct_form',
        sourceId: cycleUpdateFormUuid,
        subSourceId: '',
        condition: cycleUpdateMainCondition,
        subCondition: {},
        assignments: buildDataUpdateAssignments(cycleUpdateAssignments || []),
        noneOperation: cycleUpdateNoneOperation || 'add',
        rulesFilter: cycleUpdateMainCondition.rules || [],
        tableRulesFilter: [],
      },
      childNodes: [],
    };
  }

  // 循环容器（可选）
  // ⚠️ 权威结构源于 bundle Jct/Yct/ny/Fb：
  //   CycleContainer -> type "foreach"；nextId = [第一个子节点id, 下一个兄弟节点id]，额外有 jumpId = 下一个兄弟节点id
  //   props = viewJson 的 cycleContainerRules 直接透传（ny）：{ sourceId: 前置获取多条节点id, blockType, outputs }
  //   循环体末节点 nextId 回指容器自身形成回环（Fb）
  if (hasCycle && cycleNodeId) {
    // 循环体节点：优先更新数据节点，其次消息通知节点
    const cycleBodyNode = cycleUpdateNode || messageNode;
    nodes.push({
      name: { zh_CN: '循环', en_US: '' },
      description: '',
      type: 'foreach',
      nodeId: cycleNodeId,
      prevId: '',
      nextId: cycleBodyNode ? [cycleBodyNode.nodeId, endNodeId] : [endNodeId],
      jumpId: endNodeId,
      props: {
        sourceId: dataNodeId,
        blockType: 'continue',
        outputs: [],
      },
      childNodes: cycleBodyNode ? [cycleBodyNode] : [],
    });
  } else if (messageNode) {
    nodes.push(messageNode);
  } else if (cycleUpdateNode) {
    nodes.push(cycleUpdateNode);
  }

  nodes.push({
    name: { en_US: 'end', zh_CN: '结束', type: 'i18n' },
    description: '',
    type: 'finish',
    nodeId: endNodeId,
    prevId: '',
    nextId: [],
    props: {},
    childNodes: [],
  });

  return {
    props: {
      allowWithdraw: true,
      allowCollaboration: true,
      allowTemporaryStorage: true,
      processCode,
    },
    nodes,
  };
}

module.exports = {
  mapEventTypes,
  mapTriggerOperator,
  mapDataRetrieveOperator,
  normalizeLogic,
  buildTriggerCondition,
  buildDataRetrieveCondition,
  buildDataCreateAssignments,
  buildDataUpdateAssignments,
  buildUpdateConditions,
  normalizeScriptType,
  buildScriptRules,
  buildScriptNodeProps,
  normalizeBranchConditions,
  buildConditionNodeProps,
  buildInitiateApprovalAssignments,
  buildConnectorCallAssignments,
  resolveConnectorMode,
  buildProcessJson,
};
