'use strict';

const { generateDataRuleId, generateRuleGroupId, generateButtonUuid } = require('./integration-node-ids');
const { buildDataRetrieveCondition, buildTriggerCondition } = require('./integration-process-builder');
const {
  lookupConnectorPreset,
  buildConnectorRulesFromInputs,
  buildFallbackInputsFromAssignments,
} = require('./connector-presets');

function buildAddDataChildList(components) {
  return components
    .filter((component) => component.props && component.props.fieldId)
    .map((component) => {
      const { props } = component;
      const fieldId = props.fieldId;
      const labelObj = props.label || {};
      const labelText = typeof labelObj === 'object'
        ? (labelObj.zh_CN || labelObj.en_US || fieldId)
        : String(labelObj);
      return {
        fieldId,
        label: labelText,
        name: fieldId,
        required: false,
        componentName: component.componentName || 'TextField',
        componentOption: '[]',
        props,
      };
    });
}

function buildViewJson(options) {
  const {
    formUuid, formEventTypes, notificationTitle, notificationContent,
    toUsers, userFields, appType, nodeIds,
    addDataFormUuid, addDataAssignments, addDataFormSchema, addDataFormName,
    dataFormUuid, dataConditions, hasMessageNode, approvalActions,
    approvalNodeIds, triggerRecursively, triggerConditions,
    connectorId, actionId, connectorAssignments, connectorName, connectorIcon, connectorInputs,
    dataQueryType, dataQuantity,
    updateFormUuid, updateConditions, updateAssignments, updateFormSchema, updateFormName,
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
  const normalFormEventTypes = formEventTypes.filter((eventType) => eventType !== 'processFinish' && eventType !== 'activityTask');
  const startFormEventTypes = isApprovalProcessEvent || isApprovalNodeEvent
    ? ['processEvents', ...normalFormEventTypes]
    : formEventTypes;
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
    : {
      condition: 'AND',
      rules: [
        {
          id: '',
          op: '等于',
          operators: [],
          componentType: 'TextField',
        },
      ],
    };
  const approvalNodeActionTasks = isApprovalNodeEvent
    ? normalizedApprovalNodeIds.map((activityId) => ({
      activityId: [activityId],
      activityAction: normalizedApprovalActions,
    }))
    : [];
  const startExamineApproveType = isApprovalNodeEvent
    ? 'activityTask'
    : 'processFinish';

  let nodeIdIndex = 0;
  const canvasId = nodeIds[nodeIdIndex++];
  const triggerNodeId = nodeIds[nodeIdIndex++];
  const addDataNodeId = hasAddDataNode ? nodeIds[nodeIdIndex++] : null;
  const dataNodeId = hasDataNode ? nodeIds[nodeIdIndex++] : null;
  const updateDataNodeId = hasUpdateDataNode ? nodeIds[nodeIdIndex++] : null;
  const scriptNodeId = hasScriptNode ? nodeIds[nodeIdIndex++] : null;
  const connectorCallNodeId = hasConnectorCallNode ? nodeIds[nodeIdIndex++] : null;
  const conditionNodeId = hasConditionNode ? nodeIds[nodeIdIndex++] : null;
  const messageNodeId = includeMessageNode ? nodeIds[nodeIdIndex++] : null;
  const endNodeId = nodeIds[nodeIdIndex++];

  const children = [
    {
      componentName: 'StartNode',
      id: triggerNodeId,
      props: {
        nodeName: 'StartNode',
        name: {
          en_US: 'Form event trigger',
          zh_CN: '表单事件触发',
          type: 'i18n',
        },
        nodeError: '',
        start: {
          examineApproveType: startExamineApproveType,
          formEventType: startFormEventTypes,
          formEventField: '',
          dataFilterType: normalizedTriggerConditions.length > 0 ? 'byRule' : 'all',
          fieldType: 'all',
          conditions: triggerConditionObject,
          formUuid,
          triggerType: 'FormEvent',
          type: 'form',
          triggerFormEventRecursively: Boolean(triggerRecursively),
          examineApproveNode: isApprovalNodeEvent ? (normalizedApprovalNodeIds[0] || '') : '',
          examineApproveActiveList: isApprovalProcessEvent || isApprovalNodeEvent ? normalizedApprovalActions : [],
          examineApproveActiveTask: approvalNodeActionTasks,
        },
      },
    },
  ];

  if (hasAddDataNode && addDataNodeId) {
    const schemaComponents = Array.isArray(addDataFormSchema) ? addDataFormSchema : [];
    const childList = buildAddDataChildList(schemaComponents);
    const componentOptionMap = {};
    childList.forEach((item) => {
      componentOptionMap[item.fieldId] = '[]';
    });

    const assignmentRules = (addDataAssignments || []).map((assignment) => {
      const matchedField = childList.find((item) => item.fieldId === assignment.column);
      const labelText = matchedField ? matchedField.label : assignment.column;
      const componentName = matchedField ? matchedField.componentName : 'TextField';
      return {
        name: assignment.column,
        componentName,
        valueType: assignment.valueType,
        value: assignment.valueType === 'literal' && !isNaN(Number(assignment.value))
          ? Number(assignment.value)
          : assignment.value,
        required: false,
        ruleId: generateDataRuleId(),
        componentOption: '[]',
        label: labelText,
        componentProps: {
          defaultDataSource: {},
          relateAppType: '',
          relateOrderEnable: false,
          relateOrderConfig: [],
        },
      };
    });

    const formDisplayName = addDataFormName || '目标表单';
    children.push({
      componentName: 'AddDataNode',
      id: addDataNodeId,
      props: {
        nodeName: 'AddDataNode',
        name: '新增数据',
        description: `在 [${formDisplayName}] 中新增数据`,
        addDataRules: {
          formUuid: addDataFormUuid,
          appType,
          insertType: 'form',
          type: 'single',
          subFormUuid: '',
          sourceId: '',
          assignments: [],
          inputs: {
            childList,
            componentOptionMap,
          },
          rules: {
            childList,
            componentOptionMap,
            ruleId: generateDataRuleId(),
            rules: assignmentRules,
          },
        },
      },
      title: '新增数据',
    });
  }

  if (hasDataNode && dataNodeId) {
    const conditions = dataConditions && dataConditions.length > 0
      ? buildDataRetrieveCondition(dataConditions)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    const dataRetrieveQuantity = dataQueryIsMultiple ? Number(dataQuantity || 100) : 1;
    const componentName = dataQueryIsMultiple ? 'GetMultipleDataNode' : 'GetSingleDataNode';
    const nodeDisplayName = dataQueryIsMultiple ? '获取多条数据' : '获取单条数据';

    children.push({
      componentName,
      id: dataNodeId,
      props: {
        nodeName: componentName,
        name: nodeDisplayName,
        description: '请设置想要获取的数据',
        type: 'single',
        getData: {
          type: 'single',
          originalType: 'form',
          appType,
          sourceId: dataFormUuid,
          targetItem: {
            appType,
            appName: '',
            formItem: {
              formType: 'receipt',
              advanceProc: 'n',
              formUuid: dataFormUuid,
              title: '',
              fields: null,
              hasTableField: null,
            },
          },
          subSourceId: '',
          relativeItem: {},
          filterType: 'condition',
          condition: conditions,
          sort: { type: 'none', column: '' },
          rulesFilter: [],
          outputs: [],
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
        title: nodeDisplayName,
      },
    });
  }

  if (hasUpdateDataNode && updateDataNodeId) {
    const updateFormDisplayName = updateFormName || '目标表单';
    children.push({
      componentName: 'UpdateDataNode',
      id: updateDataNodeId,
      props: {
        nodeName: 'UpdateDataNode',
        name: '更新数据',
        description: `在 [${updateFormDisplayName}] 中更新数据`,
        updateDataRules: {
          formUuid: updateFormUuid,
          appType,
          subFormUuid: '',
          sourceId: updateFormUuid,
          assignments: (updateAssignments || []).map((a) => ({
            column: a.column,
            valueType: a.valueType,
            value: a.valueType === 'literal' && !isNaN(Number(a.value))
              ? Number(a.value) : a.value,
          })),
        },
      },
      title: '更新数据',
    });
  }

  if (hasScriptNode && scriptNodeId) {
    children.push({
      componentName: 'ScriptNode',
      id: scriptNodeId,
      props: {
        nodeName: 'ScriptNode',
        name: '脚本',
        description: '执行自定义脚本',
        scriptRules: {
          content: scriptCode || '',
          language: 'javascript',
          timeout: 30000,
          libs: [],
          description: '',
        },
      },
      title: '脚本',
    });
  }

  if (hasConditionNode && conditionNodeId) {
    const conditionObject = branchCondition
      ? buildDataRetrieveCondition([{
          bFieldId: branchCondition.fieldId || '',
          bFieldName: branchCondition.fieldName || '',
          aFieldId: branchCondition.value || '',
          componentType: branchCondition.componentType || 'TextField',
        }])
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    children.push({
      componentName: 'ConditionNode',
      id: conditionNodeId,
      props: {
        nodeName: 'ConditionNode',
        name: '条件分支',
        description: '根据条件判断分支',
        conditionRules: {
          conditionType: 'simple',
          conditions: conditionObject,
          branchConfig: {
            type: 'single',
            matchType: 'all',
            yesBranch: { name: '满足条件' },
            noBranch: { name: '不满足条件' },
          },
        },
      },
      title: '条件分支',
    });
  }

  if (hasConnectorCallNode && connectorCallNodeId) {
    let normalizedInputs = Array.isArray(connectorInputs) ? connectorInputs : [];
    let normalizedOutputs = [];
    let presetDescription = '';
    let presetSchemaType = 'normal';

    if (normalizedInputs.length === 0) {
      const preset = lookupConnectorPreset(connectorId, actionId);
      if (preset && preset.inputs && preset.inputs.length > 0) {
        normalizedInputs = preset.inputs;
        normalizedOutputs = preset.outputs || [];
        presetDescription = preset.description || '';
        presetSchemaType = preset.openDevSchemaType || 'normal';
      } else {
        normalizedInputs = buildFallbackInputsFromAssignments(connectorAssignments);
      }
    }

    const connectorRulesArray = buildConnectorRulesFromInputs(normalizedInputs, connectorAssignments);
    const connectorDisplayName = connectorName || '连接器';

    children.push({
      componentName: 'ConnectorNode',
      id: connectorCallNodeId,
      props: {
        nodeName: 'ConnectorNode',
        connectorRules: {
          allStepCounts: 2,
          currentStep: 1,
          connectorId,
          connectionId: '',
          actionId,
          connector: {
            config: null,
            connectorCorpId: '',
            connectorId,
            containTriggers: null,
            description: connectorDisplayName,
            iconUrl: connectorIcon || '',
            mode: 1,
            name: connectorDisplayName,
            orgId: 0,
            prioirty: 0,
            subscribed: null,
            underControl: null,
          },
          inputs: normalizedInputs,
          outputs: normalizedOutputs,
          url: '',
          method: '',
          body: '',
          rules: connectorRulesArray,
          description: presetDescription || connectorDisplayName,
          openDevSchemaType: presetSchemaType,
          totalLevel: 0,
          categoryListMap: {},
          selectedCategoryList: [],
          integrationObjectPath: [],
          integrationObjectName: '',
        },
        name: connectorDisplayName,
        description: '请选择连接器',
        step: 0,
        status: 'edit',
      },
      title: connectorDisplayName,
    });
  }

  if (includeMessageNode && messageNodeId) {
    children.push({
      componentName: 'SendMessageNode',
      id: messageNodeId,
      props: {
        nodeName: 'SendMessageNode',
        name: '消息通知',
        description: '请设置消息通知',
        sendMessageRules: {
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
          userFields: Array.isArray(userFields) && userFields.length > 0 ? userFields : ['form_inst_modifier'],
          description: '发送工作通知',
        },
      },
      title: '消息通知',
    });
  }

  children.push({
    componentName: 'EndNode',
    id: endNodeId,
    props: {
      name: { en_US: 'end', zh_CN: '结束', type: 'i18n' },
    },
  });

  return {
    schema: {
      componentName: 'CanvasEngine',
      id: canvasId,
      props: {},
      children,
    },
    globalSetting: {},
  };
}

module.exports = {
  buildAddDataChildList,
  buildViewJson,
};
