'use strict';

const { generateRuleGroupId, generateRuleItemId, generateDataRuleId, generateButtonUuid } = require('./integration-node-ids');

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
    GreaterThan: '大于',
    LessThan: '小于',
    GreaterThanOrEqual: '大于等于',
    LessThanOrEqual: '小于等于',
    In: '等于任意一个',
    NotIn: '不等于任意一个',
  };
  return operatorMapping[opCode] || opCode || '等于';
}

function buildTriggerCondition(triggerConditions) {
  const groupId = generateRuleGroupId();
  const rules = (triggerConditions || []).map((condition) => {
    const opCode = condition.opCode || 'Equal';
    const valueType = condition.valueType || 'literal';
    const rawValue = condition.value;
    const ruleValue = valueType === 'literal' && !isNaN(Number(rawValue))
      ? Number(rawValue)
      : rawValue;
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
  return {
    condition: 'AND',
    rules,
    ruleId: groupId,
    conditionCode: '&&',
  };
}

function buildDataRetrieveCondition(dataConditions) {
  const groupId = generateRuleGroupId();
  const rules = dataConditions.map(({ bFieldId, bFieldName, aFieldId, componentType }) => ({
    id: bFieldId,
    op: '包含',
    operators: [],
    value: aFieldId,
    componentType: componentType || 'TextField',
    ruleId: generateRuleItemId(),
    parentId: groupId,
    extValue: 'processVar',
    ruleValue: aFieldId,
    name: bFieldName,
    valueType: 'processVar',
    ruleType: 'rule_text',
    opCode: 'Contain',
  }));
  return {
    condition: 'AND',
    rules,
    ruleId: groupId,
    conditionCode: '&&',
  };
}

function buildDataCreateAssignments(assignments) {
  return assignments.map(({ column, valueType, value }) => ({
    column,
    valueType,
    value: valueType === 'literal' && !isNaN(Number(value)) ? Number(value) : value,
    assignments: [],
  }));
}

function buildDataUpdateAssignments(assignments) {
  return assignments.map(({ column, valueType, value }) => ({
    column,
    valueType,
    value: valueType === 'literal' && !isNaN(Number(value)) ? Number(value) : value,
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

function buildScriptNodeProps(scriptCode) {
  return {
    content: scriptCode || '',
    language: 'javascript',
    timeout: 30000,
    libs: [],
    description: '',
  };
}

function buildConditionNodeProps(branchCondition) {
  const groupId = generateRuleGroupId();
  const ruleId = generateRuleItemId();
  const opCode = branchCondition.opCode || 'Equal';
  const ruleValue = branchCondition.valueType === 'literal' && !isNaN(Number(branchCondition.value))
    ? Number(branchCondition.value)
    : branchCondition.value;
  return {
    condition: 'AND',
    rules: [
      {
        id: branchCondition.fieldId || '',
        op: mapTriggerOperator(opCode),
        operators: [],
        value: ruleValue,
        componentType: branchCondition.componentType || 'TextField',
        ruleId,
        parentId: groupId,
        extValue: branchCondition.valueType || 'literal',
        ruleValue,
        name: branchCondition.fieldName || branchCondition.fieldId || '',
        valueType: branchCondition.valueType || 'literal',
        ruleType: 'rule_text',
        opCode,
      },
    ],
    ruleId: groupId,
    conditionCode: '&&',
  };
}

function buildConnectorCallAssignments(assignments) {
  return assignments.map(({ column, valueType, value }) => ({
    column,
    valueType,
    value: valueType === 'literal' && !isNaN(Number(value)) ? Number(value) : value,
    assignments: [],
  }));
}

function buildProcessJson(options) {
  const {
    processCode, formUuid, appType, formEventTypes,
    notificationTitle, notificationContent, toUsers, userFields, nodeIds,
    addDataFormUuid, addDataAssignments,
    dataFormUuid, dataConditions, hasMessageNode, approvalActions,
    approvalNodeIds, triggerRecursively, triggerConditions,
    connectorId, actionId, connectorAssignments, connectorDescription,
    dataQueryType, dataQuantity,
    updateFormUuid, updateConditions, updateAssignments,
    hasScriptNode, scriptCode,
    hasConditionNode, branchCondition,
  } = options;

  const hasAddDataNode = Boolean(addDataFormUuid);
  const hasDataNode = Boolean(dataFormUuid);
  const hasUpdateDataNode = Boolean(updateFormUuid);
  const hasConnectorCallNode = Boolean(connectorId && actionId);
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
    ? buildTriggerCondition(normalizedTriggerConditions)
    : null;
  const activityTask = isApprovalNodeEvent
    ? normalizedApprovalNodeIds.map((activityId) => ({
      activityId: [activityId],
      activityAction: normalizedApprovalActions,
    }))
    : [];

  let nodeIdIndex = 0;
  const triggerNodeId = nodeIds[nodeIdIndex++];
  const addDataNodeId = hasAddDataNode ? nodeIds[nodeIdIndex++] : null;
  const dataNodeId = hasDataNode ? nodeIds[nodeIdIndex++] : null;
  const updateDataNodeId = hasUpdateDataNode ? nodeIds[nodeIdIndex++] : null;
  const scriptNodeId = hasScriptNode ? nodeIds[nodeIdIndex++] : null;
  const connectorCallNodeId = hasConnectorCallNode ? nodeIds[nodeIdIndex++] : null;
  const conditionNodeId = hasConditionNode ? nodeIds[nodeIdIndex++] : null;
  const messageNodeId = includeMessageNode ? nodeIds[nodeIdIndex++] : null;
  const endNodeId = nodeIds[nodeIdIndex++];

  const nextNodeAfterTrigger = hasAddDataNode
    ? addDataNodeId
    : hasDataNode
      ? dataNodeId
      : hasUpdateDataNode
        ? updateDataNodeId
        : hasScriptNode
          ? scriptNodeId
          : hasConnectorCallNode
            ? connectorCallNodeId
            : hasConditionNode
              ? conditionNodeId
              : includeMessageNode
                ? messageNodeId
                : endNodeId;

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
      nextId: [nextNodeAfterTrigger],
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

  if (hasAddDataNode && addDataNodeId) {
    const addDataNextId = hasDataNode
      ? dataNodeId
      : hasUpdateDataNode
        ? updateDataNodeId
        : hasScriptNode
          ? scriptNodeId
          : hasConnectorCallNode
            ? connectorCallNodeId
            : hasConditionNode
              ? conditionNodeId
              : includeMessageNode
                ? messageNodeId
                : endNodeId;

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
        subFormUuid: '',
        insertType: 'form',
        type: 'single',
        sourceId: '',
        assignments: buildDataCreateAssignments(addDataAssignments || []),
      },
      childNodes: [],
    });
  }

  if (hasDataNode && dataNodeId) {
    const conditions = dataConditions && dataConditions.length > 0
      ? buildDataRetrieveCondition(dataConditions)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    const dataRetrieveQuantity = dataQueryIsMultiple ? String(dataQuantity || 100) : '1';

    const dataRetrieveNextId = hasUpdateDataNode
      ? updateDataNodeId
      : hasScriptNode
        ? scriptNodeId
        : hasConnectorCallNode
          ? connectorCallNodeId
          : hasConditionNode
            ? conditionNodeId
            : includeMessageNode
              ? messageNodeId
              : endNodeId;

    nodes.push({
      name: { zh_CN: dataQueryIsMultiple ? '获取多条数据' : '获取单条数据', en_US: '' },
      description: '请设置想要获取的数据',
      type: 'dataRetrieve',
      nodeId: dataNodeId,
      prevId: '',
      nextId: [dataRetrieveNextId],
      props: {
        type: 'single',
        filterType: 'condition',
        sort: { type: 'none', column: '' },
        sourceId: dataFormUuid,
        appType,
        originalType: 'form',
        subSourceId: '',
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

  if (hasUpdateDataNode && updateDataNodeId) {
    const updateCond = updateConditions && updateConditions.length > 0
      ? buildUpdateConditions(updateConditions)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    const updateNextId = hasScriptNode
      ? scriptNodeId
      : hasConnectorCallNode
        ? connectorCallNodeId
        : hasConditionNode
          ? conditionNodeId
          : includeMessageNode
            ? messageNodeId
            : endNodeId;

    nodes.push({
      name: { zh_CN: '更新数据', en_US: '' },
      description: '请设置要更新的数据',
      type: 'dataUpdate',
      nodeId: updateDataNodeId,
      prevId: '',
      nextId: [updateNextId],
      props: {
        formUuid: updateFormUuid,
        appType,
        subFormUuid: '',
        sourceId: updateFormUuid,
        assignments: buildDataUpdateAssignments(updateAssignments || []),
      },
      childNodes: [],
    });
  }

  if (hasScriptNode && scriptNodeId) {
    const scriptNextId = hasConnectorCallNode
      ? connectorCallNodeId
      : hasConditionNode
        ? conditionNodeId
        : includeMessageNode
          ? messageNodeId
          : endNodeId;

    nodes.push({
      name: { zh_CN: '脚本', en_US: '' },
      description: '执行自定义脚本',
      type: 'script',
      nodeId: scriptNodeId,
      prevId: '',
      nextId: [scriptNextId],
      props: buildScriptNodeProps(scriptCode || ''),
      childNodes: [],
    });
  }

  if (hasConnectorCallNode && connectorCallNodeId) {
    const connectorCallNextId = hasConditionNode
      ? conditionNodeId
      : includeMessageNode
        ? messageNodeId
        : endNodeId;

    nodes.push({
      name: { zh_CN: '连接器', en_US: '' },
      description: connectorDescription || '请选择连接器',
      type: 'innerConnector',
      nodeId: connectorCallNodeId,
      prevId: '',
      nextId: [connectorCallNextId],
      props: {
        inputs: {
          url: '',
          method: '',
          body: '',
          connection: '',
          connectorId,
          actionId,
          assignments: buildConnectorCallAssignments(connectorAssignments || []),
        },
      },
      childNodes: [],
    });
  }

  if (hasConditionNode && conditionNodeId) {
    const conditionObject = branchCondition
      ? buildConditionNodeProps(branchCondition)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    const conditionNextId = includeMessageNode ? messageNodeId : endNodeId;

    nodes.push({
      name: { zh_CN: '条件分支', en_US: '' },
      description: '根据条件判断分支',
      type: 'condition',
      nodeId: conditionNodeId,
      prevId: '',
      nextId: [conditionNextId],
      props: {
        conditionType: 'simple',
        conditions: conditionObject,
        branchConfig: {
          type: 'single',
          matchType: 'all',
          yesBranch: { name: '满足条件', nextId: [conditionNextId] },
          noBranch: { name: '不满足条件', nextId: [conditionNextId] },
        },
      },
      childNodes: [],
    });
  }

  if (includeMessageNode && messageNodeId) {
    nodes.push({
      name: { zh_CN: '消息通知', en_US: '' },
      description: '请设置消息通知',
      type: 'sendMessage',
      nodeId: messageNodeId,
      prevId: '',
      nextId: [endNodeId],
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
    });
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
  buildTriggerCondition,
  buildDataRetrieveCondition,
  buildDataCreateAssignments,
  buildDataUpdateAssignments,
  buildUpdateConditions,
  buildScriptNodeProps,
  buildConditionNodeProps,
  buildConnectorCallAssignments,
  buildProcessJson,
};
