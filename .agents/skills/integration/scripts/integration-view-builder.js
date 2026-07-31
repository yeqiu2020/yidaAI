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

const ZWSP = '\u200b';

/**
 * 构建公式赋值的三个显示字段：__display（纯文本）、__source、value
 *
 * bundle 逆向结论（parseListFieldsToVars + handleDialogEnter + renderInputArea）：
 *
 *   formSuffix = "Object"===type ? "//" : "targetForm"===type ? "/" : ""
 *
 * direct_form 模式下目标表单 = targetForm 类型 → formSuffix = "/"（单斜杠）
 *   所以 __source 中跨表引用 = "#{FORM-xxx/fieldId}"（单斜杠，与 CLI 传入格式一致）
 *   触发表单字段 formSuffix = "" → __source 中 = "#{fieldId}"（无后缀）
 *
 *   __source  = "#{FORM-xxx/fieldId}+#{fieldId}"  — 直接用原始公式，不做任何转换
 *   __display = "目标表字段.库存数量+入库明细.入库数量"  — 纯文本（renderInputArea 传给 <Input value>）
 *   value     = "#{FORM-xxx/fieldId}+#{fieldId}"  — 与 __source 相同（handleDialogEnter 不转换单斜杠格式）
 *
 * 历史踩坑（全部已修复）：
 *   1. __display 存成对象 → 设置面板显示 [object Object]
 *   2. __display 存成 JSON.stringify 字符串 → 设置面板显示 JSON 原文
 *   3. __source 缺失 → 公式编辑器弹窗空白
 *   4. __source 触发字段加 // 后缀 → 弹窗 invalid:true "无效字段"
 *   5. __source 跨表引用用 // 而非 / → 验证器报"类型不合法"
 *   6. value 做点号转换 → 多余且与 __source 不一致
 *
 * @param {string} formula - CLI 传入的公式，如 "#{FORM-xxx/fieldId}+#{fieldId}"
 * @param {Array} targetSchemaFields - 目标表单字段列表
 * @param {Array} triggerSchemaFields - 触发表单字段列表（含 __parentLabel）
 * @returns {{__display: string, __source: string, value: string}}
 */
function buildFormulaFields(formula, targetSchemaFields, triggerSchemaFields) {
  // 构建目标表单字段 label 映射
  const targetFieldMap = {};
  (targetSchemaFields || []).forEach((comp) => {
    const fid = comp.props && comp.props.fieldId;
    const lbl = comp.props && comp.props.label;
    const text = typeof lbl === 'object' ? (lbl.zh_CN || lbl.en_US || fid) : (lbl || fid);
    if (fid) { targetFieldMap[fid] = text; }
  });

  // 构建触发表单字段 label 映射（子表字段带 "子表名.字段名" 前缀）
  const triggerFieldMap = {};
  (triggerSchemaFields || []).forEach((comp) => {
    const fid = comp.props && comp.props.fieldId;
    const lbl = comp.props && comp.props.label;
    const text = typeof lbl === 'object' ? (lbl.zh_CN || lbl.en_US || fid) : (lbl || fid);
    const parentLbl = comp.props && comp.props.__parentLabel;
    if (fid) {
      triggerFieldMap[fid] = parentLbl ? `${parentLbl}.${text}` : text;
    }
  });

  // __display：把 #{FORM-xxx/fieldId} 替换为 "目标表字段.字段名"，#{fieldId} 替换为 "字段名"
  let displayText = '';
  const regex = /#\{([^}]+)\}/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    if (match.index > lastIndex) {
      displayText += formula.substring(lastIndex, match.index);
    }
    const ref = match[1];
    if (ref.includes('/')) {
      // 跨表引用: FORM-xxx/fieldId
      const slashIdx = ref.indexOf('/');
      const fieldId = ref.substring(slashIdx + 1);
      const label = targetFieldMap[fieldId] || fieldId;
      displayText += `目标表字段.${label}`;
    } else {
      // 触发表单引用: fieldId
      const label = triggerFieldMap[ref] || ref;
      displayText += label;
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < formula.length) {
    displayText += formula.substring(lastIndex);
  }

  // __source 和 value 直接用原始公式，不做任何转换
  return {
    __display: displayText,
    __source: formula,
    value: formula,
  };
}

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
    // 数据来源类型：form(默认) 或 subform(从触发数据子表获取，bundle 验证 originalType="sub_table")
    dataSourceType, dataSubFieldId,
    // 循环体内更新数据节点（用于 --cycle + --cycle-update-form-uuid 组合）
    cycleUpdateFormUuid, cycleUpdateConditions, cycleUpdateAssignments,
    cycleUpdateNoneOperation, cycleUpdateDataNodeId, cycleUpdateFormSchema,
    triggerFormSchema,
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
  // bundle 验证（0.2.241）：originalType="sub_table" 时从触发数据子表获取
  //   sourceId="#{formUuid}"，subSourceId=子表字段ID，appType=""，targetItem={}
  if (hasDataNode && dataNodeId) {
    const conditions = dataConditions && dataConditions.length > 0
      ? buildDataRetrieveCondition(dataConditions)
      : { condition: 'AND', rules: [], ruleId: generateRuleGroupId(), conditionCode: '&&' };

    const dataRetrieveQuantity = dataQueryIsMultiple ? Number(dataQuantity || 100) : 1;
    const dataRetrieveType = dataQueryIsMultiple ? 'batch' : 'single';
    const componentName = dataQueryIsMultiple ? 'GetBatchDataNode' : 'GetSingleDataNode';
    const nodeDisplayName = dataQueryIsMultiple ? '获取多条数据' : '获取单条数据';

    const isSubformSource = dataSourceType === 'subform';
    const dataOriginalType = isSubformSource ? 'sub_table' : 'form';
    const dataSourceIdValue = isSubformSource ? `#{${formUuid}}` : dataFormUuid;
    const dataSubSourceIdValue = isSubformSource ? (dataSubFieldId || '') : '';

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
          originalType: dataOriginalType,
          appType: isSubformSource ? '' : appType,
          sourceId: dataSourceIdValue,
          targetItem: isSubformSource ? {} : {
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
          subSourceId: dataSubSourceIdValue,
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
        // 公式赋值需要三个字段（bundle handleDialogEnter 权威来源）：
//   __display = "目标表字段.库存数量+入库明细.入库数量" 纯文本 — 设置面板输入框显示
//   __source  = "#{FORM-xxx/fieldId}+#{fieldId}" 原始公式 — 公式编辑器弹窗重建
//   value     = "#{FORM-xxx/fieldId}+#{fieldId}" 原始公式 — 执行引擎
        if (base.valueType === 'column' && base.value && typeof base.value === 'string') {
          const ff = buildFormulaFields(base.value, updateFormSchema, triggerFormSchema);
          base.__display = ff.__display;
          base.__source = ff.__source;
          base.value = ff.value;
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

  // 循环体内更新数据节点（可选）
  // 场景：遍历触发子表行（GetBatchDataNode originalType=sub_table），循环体内逐行 UPSERT 目标表单
  // viewJson 中 UpdateDataNode 的 props 必须嵌套 updateDataRules（与主链 UpdateDataNode 一致）
  let cycleUpdateNode = null;
  if (hasCycleUpdateNode && cycleUpdateDataNodeId) {
    const cycleMainCondition = buildUpdateConditions(cycleUpdateConditions || []);
    const cycleFormDisplayName = '目标表单';

      const cycleAssignments = (cycleUpdateAssignments || []).map((a) => {
        const base = buildDataUpdateAssignments([a])[0] || {};
        if (base.valueType === 'column' && base.value && typeof base.value === 'string') {
          const ff = buildFormulaFields(base.value, cycleUpdateFormSchema, triggerFormSchema);
          base.__display = ff.__display;
          base.__source = ff.__source;
          base.value = ff.value;
        }
        return base;
      });

    cycleUpdateNode = {
      componentName: 'UpdateDataNode',
      id: cycleUpdateDataNodeId,
      props: {
        name: '更新数据',
        nodeName: 'UpdateDataNode',
        description: `在 [${cycleFormDisplayName}] 中更新数据`,
        updateDataRules: {
          type: 'direct_form',
          sourceId: cycleUpdateFormUuid,
          subSourceId: '',
          condition: cycleMainCondition,
          subCondition: {},
          assignments: cycleAssignments,
          noneOperation: cycleUpdateNoneOperation || 'add',
          rulesFilter: cycleMainCondition.rules || [],
          tableRulesFilter: [],
        },
      },
      title: '更新数据',
    };
  }

  // 循环容器：children 为循环体节点，sourceId 只能指向前置 GetBatchDataNode
  if (hasCycle && cycleNodeId) {
    const cycleBodyNode = cycleUpdateNode || messageNode;
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
      children: cycleBodyNode ? [cycleBodyNode] : [],
    });
  } else if (messageNode) {
    children.push(messageNode);
  } else if (cycleUpdateNode) {
    children.push(cycleUpdateNode);
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
