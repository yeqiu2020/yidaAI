'use strict';

/**
 * fix-delete-flow.js - 修复删除子表流的两个问题：
 * 1. 加回"获取单条数据"节点（用户心智模型）
 * 2. 填充 rulesFilter 让设计器显示友好名称（而非 tableField_xxx 原始ID）
 */

const path = require('path');
const coreUtils = require('../../../../lib/core/utils');
const { loadCookieData, resolveBaseUrl } = coreUtils;
const { triggerLogin } = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));
const { getFormSchema, getFormName, saveProcess, getProcess } = require('./integration-api');
const { validateProcessJson, formatReport } = require('./integration-validate');

(async () => {
  const APP = 'APP_HHYNCIQ5E4UZFSMY4W3F';
  const PROCESS_CODE = 'LPROC-NA766IB1UZ88UK4OJE0R77HE1DD73D4F5TOSMQ';
  const TARGET_FORM = 'FORM-AB089735539A4BDF96560D57B44D269D3CAD';
  const TRIGGER_FORM = 'FORM-3BC7433335FE40A5AFE78AFDD952225F0Q08';
  const SUBTABLE_FIELD_ID = 'tableField_5rkfw271';

  console.log('读取登录态...');
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.log('登录态缓存不存在，触发登录...');
    cookieData = triggerLogin();
  }
  const authRef = {
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    cookieData,
  };
  console.log('登录成功:', authRef.baseUrl);

  // Step 1: 获取目标表单的Schema（用于填充 rulesFilter）
  console.log('\nStep 1: 获取目标表单 Schema...');
  const schemaFields = await getFormSchema(authRef, { appType: APP, formUuid: TARGET_FORM });
  console.log(`获取到 ${schemaFields.length} 个字段`);

  // 找到子表字段
  const subtableField = schemaFields.find(f => f.props?.fieldId === SUBTABLE_FIELD_ID);
  console.log('子表字段:', subtableField ? subtableField.props?.label : '未找到');

  // 找到子表内的字段（通过 parentLabel 匹配）
  let subTableInnerFields = [];
  if (subtableField) {
    const subtableLabel = typeof subtableField.props?.label === 'object'
      ? (subtableField.props.label.zh_CN || subtableField.props.label.en_US)
      : subtableField.props?.label;
    console.log('子表标签:', subtableLabel);
    
    // 子表内的字段：parentLabel === 子表标签
    subTableInnerFields = schemaFields.filter(f => f.props?.__parentLabel === subtableLabel);
    console.log(`子表内字段数: ${subTableInnerFields.length}`);
    subTableInnerFields.forEach(f => {
      const label = f.props?.label;
      const labelText = typeof label === 'object' ? (label.zh_CN || label.en_US) : label;
      console.log(`  - ${f.props?.fieldId}: ${labelText} (${f.props?.componentName || f.componentName})`);
    });
  }

  // Step 2: 构建 rulesFilter（让设计器能显示友好名称）
  console.log('\nStep 2: 构建 rulesFilter...');
  
  function buildRulesFilterFromSchema(fields, parentTableFieldId) {
    return fields.map(f => {
      const label = f.props?.label;
      const labelText = typeof label === 'object' ? (label.zh_CN || label.en_US) : label;
      const nodeName = f.props?.componentName || f.componentName || 'TextField';
      
      // 构建 operators 列表
      const operators = getOperatorsForType(nodeName);
      
      return {
        id: f.props?.fieldId,
        name: labelText,
        componentType: nodeName,
        placeholder: getPlaceholderForType(nodeName),
        operators,
        props: {
          emptyInputOperators: ['有值', '没有值'],
          defaultDataSource: {},
          relateAppType: '',
          relateOrderEnable: false,
          relateOrderConfig: [],
        },
        values: [],
        supportSort: true,
      };
    });
  }
  
  function getOperatorsForType(type) {
    switch (type) {
      case 'NumberField':
        return ['等于', '不等于', '介于', '大于', '大于等于', '小于', '小于等于', '有值', '没有值'];
      case 'TextField':
      case 'TextAreaField':
        return ['包含', '等于', '不等于', '有值', '没有值'];
      case 'DateField':
        return ['等于', '不等于', '介于', '早于', '晚于', '有值', '没有值'];
      case 'EmployeeField':
        return ['等于任意一个', '等于', '不等于', '有值', '没有值'];
      default:
        return ['等于', '不等于', '有值', '没有值'];
    }
  }
  
  function getPlaceholderForType(type) {
    switch (type) {
      case 'NumberField': return '请输入数字';
      case 'DateField': return '请选择日期';
      case 'EmployeeField': return '请选择';
      default: return '请输入';
    }
  }

  const rulesFilterEntries = subTableInnerFields.length > 0
    ? buildRulesFilterFromSchema(subTableInnerFields, SUBTABLE_FIELD_ID)
    : [];

  console.log(`生成 ${rulesFilterEntries.length} 个 rulesFilter 条目`);

  // Step 3: 读取当前流程JSON
  console.log('\nStep 3: 读取当前流程...');
  const { getProcess } = require('./integration-api');
  const processData = await getProcess(authRef, { appType: APP, processCode: PROCESS_CODE });

  // processData.schema IS the CanvasEngine tree (has .children directly)
  const processJson = processData.schema;
  let viewJson = processData.viewJson;
  
  if (typeof viewJson === 'string') {
    viewJson = JSON.parse(viewJson);
  }
  
  if (!processJson || !processJson.children) {
    throw new Error('读取流程失败: 无有效 processJson.children');
  }

  console.log('流程读取成功，节点数:', processJson.children.length);

  // Step 4: 在流程中插入 GetSingleDataNode + 替换 GetBatchDataNode
  console.log('\nStep 4: 插入获取单条数据节点 + 替换获取多条数据节点...');
  // 在 StartNode 后面插入新的 GetSingleDataNode
  const nodes = processJson.children;
  const startNodeIdx = nodes.findIndex(n => n.componentName === 'StartNode');
  
  // 生成新节点ID
  function genId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
  }
  
  const getSingleId = genId('node');
  const getBatchId = genId('node');
  
  // 获取表单名称
  const targetFormName = '目标表单3';
  
  // 构建 GetSingleDataNode
  const getSingleNode = {
    componentName: 'GetSingleDataNode',
    id: getSingleId,
    props: {
      nodeName: 'GetSingleDataNode',
      name: '获取单条数据',
      description: `请设置想要获取的数据`,
      type: 'single',
      getData: {
        type: 'single',
        originalType: 'process',
        appType: APP,
        sourceId: TARGET_FORM,
        targetItem: {
          appType: APP,
          appName: '',
          formItem: {
            formType: 'process',
            advanceProc: 'n',
            formUuid: TARGET_FORM,
            title: targetFormName,
            fields: null,
            hasTableField: null,
          },
        },
        subSourceId: '',
        relativeItem: {},
        filterType: 'condition',
        condition: {
          condition: 'AND',
          rules: [
            {
              id: 'textField_5rkfde2c',
              op: '等于',
              operators: [],
              value: 'textField_5mgmyxq3',
              componentType: 'TextField',
              ruleId: `item-${Math.random().toString(36).slice(2, 15)}`,
              parentId: `group-${Math.random().toString(36).slice(2, 15)}`,
              extValue: 'processVar',
              ruleValue: 'textField_5mgmyxq3',
              name: '名称',
              valueType: 'processVar',
              ruleType: 'rule_text',
              opCode: 'Equal',
            },
          ],
          ruleId: `group-${Math.random().toString(36).slice(2, 15)}`,
          conditionCode: '&&',
        },
        sort: { type: 'none', column: '' },
        rulesFilter: [],
        outputs: [],
        quantity: 1,
        dataRules: {
          rules: [{
            componentName: '',
            labe: '',
            name: '',
            required: false,
            ruleId: `rule-${Math.random().toString(36).slice(2, 15).toUpperCase()}`,
            value: '',
            valueType: 'literal',
          }],
        },
        assignments: [],
      },
      title: '获取单条数据',
    },
  };

  // 构建 GetBatchDataNode（sub_table 模式 + 填充 rulesFilter）
  const getBatchNode = {
    componentName: 'GetBatchDataNode',
    id: getBatchId,
    props: {
      nodeName: 'GetBatchDataNode',
      name: '获取多条数据',
      description: '请设置想要获取的数据',
      type: 'batch',
      getData: {
        type: 'batch',
        originalType: 'sub_table',
        appType: '',
        sourceId: `#{${TARGET_FORM}}`,
        targetItem: {},
        subSourceId: SUBTABLE_FIELD_ID,
        relativeItem: {},
        filterType: 'condition',
        condition: {
          condition: 'AND',
          rules: [
            {
              id: 'numberField_5rkfgxx6',
              op: '等于',
              operators: [],
              value: 'numberField_5mgmoit9',
              componentType: 'NumberField',
              ruleId: `item-${Math.random().toString(36).slice(2, 15)}`,
              parentId: `group-${Math.random().toString(36).slice(2, 15)}`,
              extValue: 'processVar',
              ruleValue: 'numberField_5mgmoit9',
              name: '规格',
              valueType: 'processVar',
              ruleType: 'rule_text',
              opCode: 'Equal',
            },
          ],
          ruleId: `group-${Math.random().toString(36).slice(2, 15)}`,
          conditionCode: '&&',
        },
        sort: { type: 'none', column: '' },
        rulesFilter: rulesFilterEntries,
        outputs: [],
        quantity: 100,
        dataRules: {
          rules: [{
            componentName: '',
            labe: '',
            name: '',
            required: false,
            ruleId: `rule-${Math.random().toString(36).slice(2, 15).toUpperCase()}`,
            value: '',
            valueType: 'literal',
          }],
        },
        assignments: [],
      },
      title: '获取多条数据',
    },
  };

  // 插入节点：StartNode 后面是 GetSingleDataNode → GetBatchDataNode → 原有其他节点
  const deleteNode = nodes.find(n => n.componentName === 'DeleteDataNode');
  const endNode = nodes.find(n => n.componentName === 'EndNode');
  
  processJson.children = [
    nodes[startNodeIdx],     // StartNode
    getSingleNode,           // 新增：GetSingleDataNode
    getBatchNode,            // 新增：GetBatchDataNode
    deleteNode,              // 原有：DeleteDataNode
    endNode,                 // 原有：EndNode
  ].filter(Boolean);

  // 更新 DeleteDataNode 的引用
  const deleteNodeIdx = processJson.children.findIndex(n => n.componentName === 'DeleteDataNode');
  if (deleteNodeIdx >= 0) {
    processJson.children[deleteNodeIdx].props.deleteData.sourceId = getBatchId;
  }

  console.log('节点数:', processJson.children.length);

  // Step 6: 验证
  console.log('\nStep 6: 验证修改后的流程...');
  const validationReport = validateProcessJson(processJson, { appType: APP });
  if (validationReport.errors.length > 0) {
    console.error('体检错误:');
    console.error(formatReport(validationReport));
    console.log('\n继续保存（可能有误）...');
  } else {
    console.log('体检通过，无错误');
  }
  if (validationReport.warnings.length > 0) {
    console.log('警告:', validationReport.warnings);
  }

  // Step 7: 保存流程
  console.log('\nStep 7: 保存流程...');
  
  // 重建 viewJson 以匹配新的节点结构
  const newViewJson = rebuildViewJson(processJson, viewJson, { getSingleId, getBatchId, targetFormName });
  
  const saveResult = await saveProcess(authRef, {
    appType: APP,
    formUuid: TRIGGER_FORM,
    processCode: PROCESS_CODE,
    processJson,
    viewJson: newViewJson,
    isOnline: false,
  });
  
  console.log('保存结果:', JSON.stringify(saveResult));

  console.log('\n✅ 修复完成');
  console.log(`新节点: 获取单条数据 (${getSingleId}) → 获取多条数据 (${getBatchId})`);
  console.log(`rulesFilter 条目: ${rulesFilterEntries.length}`);

})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

function rebuildViewJson(processJson, oldViewJson, ids) {
  // 简化的 viewJson 重建 - 新节点使用默认 view 结构
  const viewChildren = processJson.children.map(node => {
    if (node.id === ids.getSingleId) {
      return {
        componentName: 'GetSingleDataNode',
        id: ids.getSingleId,
        props: {
          name: { zh_CN: '获取单条数据', en_US: '' },
        },
      };
    }
    if (node.id === ids.getBatchId) {
      return {
        componentName: 'GetBatchDataNode',
        id: ids.getBatchId,
        props: {
          name: { zh_CN: '获取多条数据', en_US: '' },
        },
      };
    }
    // 保持原有节点的 viewJson
    const oldChild = oldViewJson?.schema?.children?.find(c => c.id === node.id);
    return oldChild || { componentName: node.componentName, id: node.id };
  });

  return {
    componentName: 'CanvasEngine',
    id: processJson.id,
    children: viewChildren,
    globalSetting: oldViewJson?.globalSetting || {},
  };
}
