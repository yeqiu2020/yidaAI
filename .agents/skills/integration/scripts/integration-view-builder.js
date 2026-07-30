'use strict';

const { generateDataRuleId, generateRuleGroupId, generateButtonUuid } = require('./integration-node-ids');
const {
  buildDataRetrieveCondition,
  buildTriggerCondition,
  buildUpdateConditions,
  buildDataUpdateAssignments,
  buildInitiateApprovalAssignments,
  buildScriptRules,
  normalizeScriptType,
  normalizeBranchConditions,
  buildConditionNodeProps,
} = require('./integration-process-builder');
const {
  lookupConnectorPreset,
  buildConnectorRulesFromInputs,
  buildFallbackInputsFromAssignments,
} = require('./connector-presets');

/**
 * integration-view-builder.js - 构建逻辑流画布定义（viewJson）
 *
 * viewJson 是 saveProcess 接口的 viewJson 参数，描述设计器画布的渲染 Schema。
 * 与 integration-process-builder.js 的区别：
 *   - 本文件：前端画布用，关注 componentName、xxxRules 嵌套 props 等渲染 Schema
 *   - process-builder：执行引擎用，关注 nextId、type、扁平 props 等执行逻辑
 *
 * ⚠️ 节点 componentName / props 形状权威来源：references/canonical-node-shapes.md
 *   - 脚本节点 = JavaScriptNode / GroovyNode（不是 ScriptNode），props 外层包 JavaScript / groovy
 *   - 获取多条 = GetBatchDataNode（不是 GetMultipleDataNode，错名画布静默不渲染）
 *   - UpdateDataNode/AddDataNode 的 props 必须带全 name/nodeName/description（缺则画布白屏崩溃）
 *   - 条件分支 = ConditionContainer 容器 + 两个 ConditionNode 子节点（不是平铺单节点）
 *   - 循环容器 = CycleContainer，children 为循环体节点，只能遍历 GetBatchDataNode 输出
 *
 * ⚠️ nodeIds 消费顺序必须与 create.js 的 viewNodeIds 完全一致：
 *   canvas, trigger, dataRetrieve, addData, initiateApproval, updateData,
 *   deleteData, script, connector, condition, cycle, message, end
 *   （与 process-builder 的顺序相同，仅多出开头的 canvasId）
 */

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
    processCode, formUuid, formEventTypes, notificationTitle, notificationContent,
    toUsers, userFields, appType, nodeIds,
    addDataFormUuid, addDataAssignments, addDataFormSchema, addDataFormName,
    addDataInsertType, addDataSubFormUuid, addDataType, addDataSourceId,
    initiateApprovalFormUuid, initiateApprovalFormName,
    initiateApprovalInitiator, initiateApprovalAssignments,
    dataFormUuid, dataConditions, hasMessageNode, approvalActions,
    approvalNodeIds, triggerRecursively, triggerConditions, triggerLogic,
    connectorId, actionId, connectorAssignments, connectorName, connectorIcon, connectorInputs,
    connectionId,
    dataQueryType, dataQuantity,
    updateFormUuid, updateConditions, updateAssignments, updateFormSchema, updateFormName,
    updateType, updateSourceId, updateSubSourceId, updateSubConditions, updateNoneOperation,
    hasDeleteDataNode, deleteSubSourceId,
    hasScriptNode, scriptCode, scriptOutputs, scriptLang,
    hasConditionNode, branchCondition, branchConditions, branchLogic, conditionBranchIds,
    hasCycleNode,
  } = options;

  const hasAddDataNode = Boolean(addDataFormUuid);
  const hasDataNode = Boolean(dataFormUuid);
  const hasInitiateApprovalNode = Boolean(initiateApprovalFormUuid);
  const hasUpdateDataNode = Boolean(updateFormUuid);
  const hasDeleteNode = Boolean(hasDeleteDataNode);
  const hasConnectorCallNode = Boolean(connectorId && actionId);
  const hasScript = Boolean(hasScriptNode);
  const hasCondition = Boolean(hasConditionNode);
  const hasCycle = Boolean(hasCycleNode);
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
    ? buildTriggerCondition(normalizedTriggerConditions, triggerLogic)
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

  // ⚠️ 顺序与 create.js viewNodeIds / process-builder 严格一致（conditionBranchIds 单独传入不占序列）
  let nodeIdIndex = 0;
  const canvasId = nodeIds[nodeIdIndex++];
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

  // 获取单条/多条数据节点
  // ⚠️ 多条 componentName 必须是 GetBatchDataNode（getData.type='batch'），错名画布静默不渲染
  if (hasDataNode && dataNodeId) {
    const conditions = dataConditions && dataConditions.length > 0
      ? buildDataRetrieveCondition(dataConditions)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    const dataRetrieveQuantity = dataQueryIsMultiple ? Number(dataQuantity || 100) : 1;
    const dataRetrieveType = dataQueryIsMultiple ? 'batch' : 'single';
    const componentName = dataQueryIsMultiple ? 'GetBatchDataNode' : 'GetSingleDataNode';
    const nodeDisplayName = dataQueryIsMultiple ? '获取多条数据' : '获取单条数据';

    children.push({
      componentName,
      id: dataNodeId,
      props: {
        nodeName: componentName,
        name: nodeDisplayName,
        description: '请设置想要获取的数据',
        type: dataRetrieveType,
        getData: {
          type: dataRetrieveType,
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

  // 新增数据节点（props 扁平：name/nodeName/description/addDataRules，缺任意一项画布白屏崩溃）
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

    const addInsertType = addDataInsertType === 'sub_table' ? 'sub_table' : 'form';
    const addType = addDataType === 'batch' ? 'batch' : 'single';
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
          insertType: addInsertType,
          type: addType,
          subFormUuid: addInsertType === 'sub_table' ? (addDataSubFormUuid || '') : '',
          sourceId: addType === 'batch' ? (addDataSourceId || '') : '',
          // 赋值规则放 rules.rules（已验证形状），assignments 保持空数组
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

  // 发起审批节点（initiateApprovalRules，目标必须是流程表单 process）
  if (hasInitiateApprovalNode && initiateApprovalNodeId) {
    const approvalFormDisplayName = initiateApprovalFormName || initiateApprovalFormUuid;
    children.push({
      componentName: 'InitiateApprovalNode',
      id: initiateApprovalNodeId,
      props: {
        nodeName: 'InitiateApprovalNode',
        name: '发起审批',
        description: `在 [${approvalFormDisplayName}] 中发起一条审批`,
        initiateApprovalRules: {
          type: 'single',
          initiator: initiateApprovalInitiator || { type: 'select_user', value: '' },
          assignments: buildInitiateApprovalAssignments(initiateApprovalAssignments || []),
          formUuid: initiateApprovalFormUuid,
          processCode: processCode || '',
          formTitle: '',
          appType,
        },
      },
      title: '发起审批',
    });
  }

  // 更新数据节点（UI 设计器 JSON）
  // viewJson 中 UpdateDataNode 的 props 必须是嵌套结构：
  //   { name, nodeName, description, updateDataRules: {...} }
  // 与 processJson 不同！processJson 的 props 是扁平展开的
  if (hasUpdateDataNode && updateDataNodeId) {
    const updateFormDisplayName = updateFormName || '目标表单';
    const updateTypeValue = updateType || 'direct_form';
    const targetMainFormUuid = updateSourceId || updateFormUuid;
    const targetSubFieldId = updateSubSourceId || '';
    const hasSubUpdate = Boolean(targetSubFieldId);

    const mainCondition = buildUpdateConditions(updateConditions || []);
    const subCondition = hasSubUpdate
      ? buildUpdateConditions(updateSubConditions || [])
      : {};

    const updateDataRules = {
      type: updateTypeValue,
      sourceId: targetMainFormUuid,
      subSourceId: targetSubFieldId,
      condition: mainCondition,
      subCondition,
      assignments: (updateAssignments || []).map((a) => {
        const base = buildDataUpdateAssignments([a])[0] || {};
        // Build __display: replace #{FORM-xxx/fieldId} with "表单名.字段名" and #{fieldId} with "字段名"
        if (base.valueType === 'column' && base.value && typeof base.value === 'string') {
          const schemaFields = Array.isArray(updateFormSchema) ? updateFormSchema : [];
          const fieldLabelMap = {};
          schemaFields.forEach((comp) => {
            const fid = comp.props && comp.props.fieldId;
            const lbl = comp.props && comp.props.label;
            const text = typeof lbl === 'object' ? (lbl.zh_CN || lbl.en_US || fid) : (lbl || fid);
            if (fid) { fieldLabelMap[fid] = text; }
          });
          let display = base.value;
          // Replace cross-form references: #{FORM-xxx/fieldId}
          display = display.replace(/#\{([^/]+)\/([^}]+)\}/g, (match, formPart, fieldId) => {
            const label = fieldLabelMap[fieldId] || fieldId;
            return (updateFormName || '目标表单') + '.' + label;
          });
          // Replace trigger form references: #{fieldId}
          display = display.replace(/#\{([^/}]+)\}/g, (match, fieldId) => {
            return fieldLabelMap[fieldId] || fieldId;
          });
          // Replace operators with readable form
          display = display.replace(/\+/g, '+').replace(/-/g, '-').replace(/\*/g, '×').replace(/\//g, '÷');
          base.__display = display;
        }
        return base;
      }),
      noneOperation: updateNoneOperation || 'ignored',
      rulesFilter: mainCondition.rules || [],
      tableRulesFilter: hasSubUpdate ? (subCondition.rules || []) : [],
    };

    children.push({
      componentName: 'UpdateDataNode',
      id: updateDataNodeId,
      props: {
        name: '更新数据',
        nodeName: 'UpdateDataNode',
        description: hasSubUpdate
          ? `在 [${updateFormDisplayName}-子表] 中更新数据`
          : `在 [${updateFormDisplayName}] 中更新数据`,
        updateDataRules,
      },
      title: '更新数据',
    });
  }

  // 删除数据节点（props 键为 deleteData，非 Rules 后缀；sourceId 指向前置获取节点画布 id）
  if (hasDeleteNode && deleteDataNodeId) {
    const deleteData = {
      appType,
      sourceId: dataNodeId,
      type: 'node',
    };
    if (deleteSubSourceId) {
      deleteData.subSourceId = deleteSubSourceId;
    }
    children.push({
      componentName: 'DeleteDataNode',
      id: deleteDataNodeId,
      props: {
        nodeName: 'DeleteDataNode',
        name: '删除数据',
        description: '请设置要删除的数据',
        deleteData,
      },
      title: '删除数据',
    });
  }

  // 脚本节点：JavaScriptNode(props.JavaScript) / GroovyNode(props.groovy)
  // ⚠️ 权威形状源于 bundle 脚本 setter saveValue（buildScriptRules 与 process-builder 共用）：
  //   { inputs, scriptType, action:{code, exceptionStrategy}, outputs, testInputs }
  //   旧 builder 的 ScriptNode + scriptRules:{content,language,timeout,libs} 完全错误（画布不渲染）
  if (hasScript && scriptNodeId) {
    const scriptType = normalizeScriptType(scriptLang);
    const isGroovy = scriptType === 'Groovy';
    const scriptRules = buildScriptRules(scriptCode || '', scriptOutputs || [], scriptNodeId, scriptLang);
    const scriptComponentName = isGroovy ? 'GroovyNode' : 'JavaScriptNode';
    const scriptDisplayName = isGroovy ? 'Groovy脚本' : 'JavaScript脚本';
    const scriptProps = {
      nodeName: scriptComponentName,
      name: scriptDisplayName,
      description: '',
    };
    // rulesKey：Groovy 为小写 groovy，JS 为 JavaScript（bundle Gb 转换器取 props.groovy || props.JavaScript）
    if (isGroovy) {
      scriptProps.groovy = scriptRules;
    } else {
      scriptProps.JavaScript = scriptRules;
    }
    children.push({
      componentName: scriptComponentName,
      id: scriptNodeId,
      props: scriptProps,
      title: scriptDisplayName,
    });
  }

  // 连接器调用节点
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
          connectionId: connectionId || '',
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

  // 条件分支：ConditionContainer 容器 + 两个 ConditionNode 子节点（不是平铺单节点）
  // ⚠️ 子分支 id 必须与 processJson 一致（create.js 统一生成 conditionBranchIds 传入两个 builder）
  if (hasCondition && conditionNodeId) {
    const branchIds = conditionBranchIds || {};
    const branchList = normalizeBranchConditions(branchConditions, branchCondition);
    const conditionObject = branchList.length > 0
      ? buildConditionNodeProps(branchList, branchLogic)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    children.push({
      componentName: 'ConditionContainer',
      id: conditionNodeId,
      props: {
        name: '条件分支',
      },
      children: [
        {
          componentName: 'ConditionNode',
          id: branchIds.yes,
          props: {
            name: '条件1',
            description: '',
            conditions: {
              calculate: 'condition',
              expression: '',
              conditions: conditionObject,
              isDefault: false,
              priority: 1,
              description: '',
            },
          },
        },
        {
          componentName: 'ConditionNode',
          id: branchIds.fallback,
          props: {
            isDefault: true,
            name: '其他情况',
            description: '',
            buttons: [{ name: '关闭', handler: null }],
          },
        },
      ],
    });
  }

  // 消息通知节点；hasCycle 时作为循环体挂入 CycleContainer.children
  let messageNode = null;
  if (includeMessageNode && messageNodeId) {
    messageNode = {
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
          // 默认值与 process-builder 保持一致（form_inst_creator，权威样本见 canonical-node-shapes.md）
          userFields: Array.isArray(userFields) && userFields.length > 0 ? userFields : ['form_inst_creator'],
          description: '发送工作通知',
        },
      },
      title: '消息通知',
    };
  }

  // 循环容器：children 为循环体节点，sourceId 只能指向前置 GetBatchDataNode
  if (hasCycle && cycleNodeId) {
    children.push({
      componentName: 'CycleContainer',
      id: cycleNodeId,
      props: {
        nodeName: 'CycleContainer',
        name: '循环',
        description: '',
        cycleContainerRules: {
          sourceId: dataNodeId,
          blockType: 'continue',
          outputs: [],
        },
      },
      children: messageNode ? [messageNode] : [],
    });
  } else if (messageNode) {
    children.push(messageNode);
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
