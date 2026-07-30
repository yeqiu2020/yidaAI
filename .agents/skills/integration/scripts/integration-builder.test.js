'use strict';

/**
 * integration-builder.test.js - 离线断言测试（无需网络/登录）
 *
 * 直接调用 process-builder / view-builder，断言修复后的关键行为：
 *   - P0.2 条件分支真分流：默认分支 nextId 指向结束节点
 *   - P2.11 AND/OR 逻辑：triggerLogic/branchLogic 正确映射 conditionCode
 *   - P1 Groovy 节点：process type=CodeExecutor+scriptType Groovy；view componentName=GroovyNode+props.groovy
 *   - P3.12 userFields 默认值：两个 builder 一致为 form_inst_creator
 *   - normalize* 工具函数行为
 *
 * 运行：node integration-builder.test.js
 */

const assert = require('assert');
const {
  buildProcessJson,
  normalizeLogic,
  normalizeScriptType,
  normalizeBranchConditions,
} = require('./integration-process-builder');
const { buildViewJson } = require('./integration-view-builder');
const { exportToExcel } = require('./integration-check');
const { validateProcessJson, detectPlaceholder } = require('./integration-validate');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (error) {
    failed++;
    failures.push({ name, message: error.message });
    console.log('  ✗ ' + name + ' :: ' + error.message);
  }
}

// 生成一批稳定的伪节点 ID（离线，不依赖 crypto 随机性）
function makeIds(count) {
  const ids = [];
  for (let i = 0; i < count; i++) { ids.push('node_test_' + i); }
  return ids;
}

// 在 processJson.nodes 里按 type 查找节点
function findNode(nodes, type) {
  return nodes.find((n) => n.type === type);
}
function findViewNode(children, componentName) {
  return children.find((c) => c.componentName === componentName);
}

console.log('== normalize 工具函数 ==');
test('normalizeLogic 默认 AND', () => {
  assert.strictEqual(normalizeLogic(), 'AND');
  assert.strictEqual(normalizeLogic('and'), 'AND');
});
test('normalizeLogic 识别 OR（大小写不敏感）', () => {
  assert.strictEqual(normalizeLogic('or'), 'OR');
  assert.strictEqual(normalizeLogic('OR'), 'OR');
});
test('normalizeScriptType 默认 JavaScript', () => {
  assert.strictEqual(normalizeScriptType(), 'JavaScript');
  assert.strictEqual(normalizeScriptType('js'), 'JavaScript');
});
test('normalizeScriptType 识别 Groovy', () => {
  assert.strictEqual(normalizeScriptType('groovy'), 'Groovy');
  assert.strictEqual(normalizeScriptType('Groovy'), 'Groovy');
});
test('normalizeBranchConditions 兼容单对象与数组', () => {
  const single = normalizeBranchConditions(null, { fieldId: 'a' });
  assert.strictEqual(single.length, 1);
  const arr = normalizeBranchConditions([{ fieldId: 'a' }, { fieldId: 'b' }], null);
  assert.strictEqual(arr.length, 2);
  assert.strictEqual(normalizeBranchConditions(null, null).length, 0);
});

console.log('== P0.2 条件分支真分流 ==');
test('processJson: 默认分支 nextId 指向结束节点，命中分支指向尾节点', () => {
  const ids = makeIds(6); // trigger, condition, message, end (+2 branch ids not from list)
  const branchIds = { yes: 'node_yes', fallback: 'node_fallback' };
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: ids,
    hasMessageNode: true,
    hasConditionNode: true,
    branchCondition: { fieldId: 'f1', fieldName: '字段1', opCode: 'Equal', value: 'x', valueType: 'literal' },
    conditionBranchIds: branchIds,
  });
  const nodes = process.nodes;
  const routeNode = findNode(nodes, 'route');
  assert.ok(routeNode, '应存在 route 条件容器节点');
  const endNode = findNode(nodes, 'finish');
  const messageNode = findNode(nodes, 'sendMessage');
  const yesBranch = routeNode.childNodes.find((c) => !c.props.isDefault);
  const defaultBranch = routeNode.childNodes.find((c) => c.props.isDefault);
  // 命中分支 -> 尾节点（消息节点）
  assert.deepStrictEqual(yesBranch.nextId, [messageNode.nodeId], '命中分支应指向消息节点');
  // 默认分支 -> 结束节点（真正分流，而非两分支相同）
  assert.deepStrictEqual(defaultBranch.nextId, [endNode.nodeId], '默认分支应指向结束节点');
  // 两分支不应指向同一节点
  assert.notDeepStrictEqual(yesBranch.nextId, defaultBranch.nextId, '两分支 nextId 不应相同');
  // 默认分支 priority 为 max int
  assert.strictEqual(defaultBranch.props.priority, 2147483647);
});

console.log('== P2.11 AND/OR 逻辑 ==');
test('processJson: triggerLogic=or 映射 condition OR / conditionCode ||', () => {
  const ids = makeIds(3);
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: ids,
    hasMessageNode: true,
    triggerConditions: [
      { fieldId: 'f1', fieldName: 'F1', opCode: 'Equal', value: 'a', valueType: 'literal' },
      { fieldId: 'f2', fieldName: 'F2', opCode: 'Equal', value: 'b', valueType: 'literal' },
    ],
    triggerLogic: 'or',
  });
  const trigger = findNode(process.nodes, 'trigger');
  const cond = trigger.props.inputs.conditions;
  assert.strictEqual(cond.condition, 'OR');
  assert.strictEqual(cond.conditionCode, '||');
  assert.strictEqual(cond.rules.length, 2);
});
test('processJson: branchLogic=or + 多条件映射 OR', () => {
  const ids = makeIds(4);
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: ids,
    hasMessageNode: true,
    hasConditionNode: true,
    branchConditions: [
      { fieldId: 'f1', fieldName: 'F1', opCode: 'Equal', value: 'a', valueType: 'literal' },
      { fieldId: 'f2', fieldName: 'F2', opCode: 'Equal', value: 'b', valueType: 'literal' },
    ],
    branchLogic: 'or',
    conditionBranchIds: { yes: 'node_yes', fallback: 'node_fallback' },
  });
  const routeNode = findNode(process.nodes, 'route');
  const yesBranch = routeNode.childNodes.find((c) => !c.props.isDefault);
  assert.strictEqual(yesBranch.props.conditions.condition, 'OR');
  assert.strictEqual(yesBranch.props.conditions.rules.length, 2);
});

console.log('== P1 Groovy 脚本节点 ==');
test('processJson: Groovy 脚本节点 type=CodeExecutor + scriptType Groovy', () => {
  const ids = makeIds(3);
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [], userFields: [], hasMessageNode: false,
    nodeIds: ids,
    hasScriptNode: true, scriptCode: 'return 1;', scriptOutputs: [{ name: 'out', type: 'Number' }],
    scriptLang: 'groovy',
  });
  const scriptNode = findNode(process.nodes, 'CodeExecutor');
  assert.ok(scriptNode, '应存在 CodeExecutor 脚本节点');
  assert.strictEqual(scriptNode.props.scriptType, 'Groovy');
  assert.strictEqual(scriptNode.name.zh_CN, 'Groovy脚本');
  // 输出变量名带节点 id 前缀
  assert.strictEqual(scriptNode.props.outputsSchema[0].name, scriptNode.nodeId + '_out');
});
test('viewJson: Groovy 脚本节点 componentName=GroovyNode + props.groovy', () => {
  const ids = makeIds(4);
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [], userFields: [], hasMessageNode: false,
    nodeIds: ids,
    hasScriptNode: true, scriptCode: 'return 1;', scriptOutputs: [{ name: 'out', type: 'Number' }],
    scriptLang: 'groovy',
  });
  const children = view.schema.children;
  const scriptNode = findViewNode(children, 'GroovyNode');
  assert.ok(scriptNode, '应存在 GroovyNode');
  assert.ok(scriptNode.props.groovy, 'Groovy 节点应有 props.groovy');
  assert.strictEqual(scriptNode.props.groovy.scriptType, 'Groovy');
  assert.strictEqual(scriptNode.props.JavaScript, undefined, 'Groovy 节点不应有 props.JavaScript');
});
test('viewJson: JavaScript 脚本节点 componentName=JavaScriptNode + props.JavaScript', () => {
  const ids = makeIds(4);
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [], userFields: [], hasMessageNode: false,
    nodeIds: ids,
    hasScriptNode: true, scriptCode: 'return 1;', scriptOutputs: [{ name: 'out', type: 'Text' }],
    scriptLang: 'js',
  });
  const children = view.schema.children;
  const scriptNode = findViewNode(children, 'JavaScriptNode');
  assert.ok(scriptNode, '应存在 JavaScriptNode');
  assert.ok(scriptNode.props.JavaScript, 'JS 节点应有 props.JavaScript');
  assert.strictEqual(scriptNode.props.JavaScript.scriptType, 'JavaScript');
  assert.strictEqual(scriptNode.props.groovy, undefined, 'JS 节点不应有 props.groovy');
});

console.log('== P3.12 userFields 默认值一致性 ==');
test('两个 builder 未指定 userFields 时默认均为 form_inst_creator', () => {
  const pIds = makeIds(3);
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'], notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: pIds, hasMessageNode: true,
  });
  const msgP = findNode(process.nodes, 'sendMessage');
  assert.deepStrictEqual(msgP.props.userFields, ['form_inst_creator']);

  const vIds = makeIds(4);
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: vIds, hasMessageNode: true,
  });
  const msgV = findViewNode(view.schema.children, 'SendMessageNode');
  assert.deepStrictEqual(msgV.props.sendMessageRules.userFields, ['form_inst_creator']);
});
test('显式指定 userFields 时按指定值透传', () => {
  const pIds = makeIds(3);
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'], notificationTitle: 't', notificationContent: 'c',
    toUsers: [], userFields: ['form_inst_modifier'],
    nodeIds: pIds, hasMessageNode: true,
  });
  const msgP = findNode(process.nodes, 'sendMessage');
  assert.deepStrictEqual(msgP.props.userFields, ['form_inst_modifier']);
});

console.log('== 基础链路完整性 ==');
test('最简链路: trigger -> message -> end 且 nextId 串联正确', () => {
  const ids = makeIds(3);
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'], notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: ids, hasMessageNode: true,
  });
  const trigger = findNode(process.nodes, 'trigger');
  const message = findNode(process.nodes, 'sendMessage');
  const end = findNode(process.nodes, 'finish');
  assert.deepStrictEqual(trigger.nextId, [message.nodeId]);
  assert.deepStrictEqual(message.nextId, [end.nodeId]);
  assert.deepStrictEqual(end.nextId, []);
});
test('viewJson 结构含 CanvasEngine 与 StartNode/EndNode', () => {
  const ids = makeIds(4);
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: ids, hasMessageNode: true,
  });
  assert.strictEqual(view.schema.componentName, 'CanvasEngine');
  assert.ok(findViewNode(view.schema.children, 'StartNode'));
  assert.ok(findViewNode(view.schema.children, 'EndNode'));
});

console.log('== viewJson 全节点覆盖（view-builder 补齐回归） ==');
test('viewJson: 获取多条 componentName=GetBatchDataNode + getData.type=batch（非 GetMultipleDataNode）', () => {
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [], userFields: [], hasMessageNode: false,
    nodeIds: makeIds(4),
    dataFormUuid: 'FORM-2', dataConditions: [], dataQueryType: 'multiple', dataQuantity: 50,
  });
  const node = findViewNode(view.schema.children, 'GetBatchDataNode');
  assert.ok(node, '应存在 GetBatchDataNode');
  assert.strictEqual(node.props.getData.type, 'batch');
  assert.strictEqual(node.props.getData.quantity, 50);
  assert.ok(!findViewNode(view.schema.children, 'GetMultipleDataNode'), '不应出现错名 GetMultipleDataNode');
});
test('viewJson: 条件分支为 ConditionContainer + 两个 ConditionNode 子节点，分支 id 与 processJson 一致', () => {
  const branchIds = { yes: 'node_yes', fallback: 'node_fb' };
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [], hasMessageNode: true,
    nodeIds: makeIds(5),
    hasConditionNode: true,
    branchCondition: { fieldId: 'f1', fieldName: 'F1', opCode: 'Equal', value: 'x', valueType: 'literal' },
    conditionBranchIds: branchIds,
  });
  const container = findViewNode(view.schema.children, 'ConditionContainer');
  assert.ok(container, '应存在 ConditionContainer 容器');
  assert.strictEqual(container.children.length, 2);
  assert.strictEqual(container.children[0].id, 'node_yes');
  assert.strictEqual(container.children[1].id, 'node_fb');
  assert.strictEqual(container.children[1].props.isDefault, true);
  assert.strictEqual(container.children[0].props.conditions.conditions.rules.length, 1);
});
test('viewJson: 循环容器 CycleContainer 循环体含消息节点且 sourceId 指向获取多条节点', () => {
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [], hasMessageNode: true,
    nodeIds: makeIds(6),
    dataFormUuid: 'FORM-2', dataConditions: [], dataQueryType: 'multiple', dataQuantity: 100,
    hasCycleNode: true,
  });
  const cycle = findViewNode(view.schema.children, 'CycleContainer');
  assert.ok(cycle, '应存在 CycleContainer');
  const dataNode = findViewNode(view.schema.children, 'GetBatchDataNode');
  assert.strictEqual(cycle.props.cycleContainerRules.sourceId, dataNode.id, 'sourceId 应指向获取多条节点');
  assert.ok(findViewNode(cycle.children, 'SendMessageNode'), '循环体应含消息节点');
  assert.ok(!findViewNode(view.schema.children, 'SendMessageNode'), '消息节点不应同时出现在顶层');
});
test('viewJson: 删除数据 DeleteDataNode props.deleteData.sourceId 指向前置获取节点', () => {
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [], userFields: [], hasMessageNode: false,
    nodeIds: makeIds(5),
    dataFormUuid: 'FORM-2', dataConditions: [], dataQueryType: 'single',
    hasDeleteDataNode: true,
  });
  const del = findViewNode(view.schema.children, 'DeleteDataNode');
  assert.ok(del, '应存在 DeleteDataNode');
  const dataNode = findViewNode(view.schema.children, 'GetSingleDataNode');
  assert.strictEqual(del.props.deleteData.sourceId, dataNode.id);
  assert.strictEqual(del.props.deleteData.type, 'node');
});
test('viewJson: 发起审批 InitiateApprovalNode 含 initiateApprovalRules', () => {
  const view = buildViewJson({
    formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [], userFields: [], hasMessageNode: false,
    nodeIds: makeIds(4),
    initiateApprovalFormUuid: 'FORM-P',
    initiateApprovalAssignments: [{ column: 'textField_a', valueType: 'processVar', value: 'trigger_textField_a' }],
  });
  const node = findViewNode(view.schema.children, 'InitiateApprovalNode');
  assert.ok(node, '应存在 InitiateApprovalNode');
  assert.strictEqual(node.props.initiateApprovalRules.formUuid, 'FORM-P');
  assert.strictEqual(node.props.initiateApprovalRules.assignments.length, 1);
});
test('viewJson/processJson: 同一 nodeIds 序列下各节点 id 一一对应（消费顺序一致）', () => {
  // 镜像 create.js：viewNodeIds = [canvasId, ...processNodeIds]
  const viewIds = makeIds(7);
  const processIds = viewIds.slice(1);
  const shared = {
    processCode: 'LPROC-T', formUuid: 'FORM-1', appType: 'APP-1', formEventTypes: ['insert'],
    notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [], hasMessageNode: true,
    dataFormUuid: 'FORM-2', dataConditions: [], dataQueryType: 'single',
    updateFormUuid: 'FORM-KC', updateType: 'direct_form', updateSourceId: 'FORM-KC',
    updateConditions: [{ bFieldId: 'textField_wh', bFieldName: '仓库', aFieldId: 'trg_x', valueType: 'processVar', opCode: 'Equal' }],
    updateAssignments: [{ column: 'numberField_qty', valueType: 'literal', value: 1 }],
  };
  const process = buildProcessJson({ ...shared, nodeIds: processIds });
  const view = buildViewJson({ ...shared, nodeIds: viewIds });
  const pairs = [
    ['dataRetrieve', 'GetSingleDataNode'],
    ['dataUpdate', 'UpdateDataNode'],
    ['sendMessage', 'SendMessageNode'],
    ['finish', 'EndNode'],
  ];
  for (const [pType, vName] of pairs) {
    const pNode = findNode(process.nodes, pType);
    const vNode = findViewNode(view.schema.children, vName);
    assert.ok(pNode && vNode, pType + '/' + vName + ' 应同时存在');
    assert.strictEqual(vNode.id, pNode.nodeId, pType + ' 与 ' + vName + ' 节点 id 应一致');
  }
});

console.log('== P0.1 Excel 导出 ==');
test('exportToExcel 生成含两工作表的 .xlsx 文件', () => {
  const xlsx = require('xlsx');
  const outPath = path.join(os.tmpdir(), 'integration-check-test-' + Date.now() + '.xlsx');
  const result = {
    checkedApps: ['APP-1'], totalFlows: 2, errors: [],
    abnormalFlows: [
      {
        appType: 'APP-1', formTitle: '测试表单', formUuid: 'FORM-1',
        name: '异常逻辑流', processCode: 'LPROC-ABN', abnormalLogCount: 1, modifier: '张三', gmtModified: 1700000000,
        logs: [{ procInstId: 'p1', formInstId: 'f1', exceptionEntity: '空指针异常', finishDate: 1700000000 }],
      },
    ],
  };
  const saved = exportToExcel(result, outPath);
  assert.ok(fs.existsSync(saved), '导出文件应存在');
  const wb = xlsx.readFile(saved);
  assert.ok(wb.SheetNames.includes('异常汇总'), '应含「异常汇总」工作表');
  assert.ok(wb.SheetNames.includes('异常日志'), '应含「异常日志」工作表');
  const summary = xlsx.utils.sheet_to_json(wb.Sheets['异常汇总']);
  assert.strictEqual(summary[0].processCode, 'LPROC-ABN');
  const logs = xlsx.utils.sheet_to_json(wb.Sheets['异常日志']);
  assert.strictEqual(logs[0].异常信息, '空指针异常');
  fs.unlinkSync(saved);
});

// ==================== 保存前体检门禁（复现 Trae AI 坏流的 4 个硬伤） ====================

console.log('== 体检门禁: 占位符检测 ==');
test('detectPlaceholder 拦截序列化保留 token（processVar 当字面量）', () => {
  assert.ok(detectPlaceholder('processVar'), 'processVar 应被判为占位符');
  assert.ok(detectPlaceholder('formVar'));
  assert.ok(detectPlaceholder('fieldId'));
});
test('detectPlaceholder 拦截字段ID形态字面量与模板逃逸', () => {
  assert.ok(detectPlaceholder('textField_abc123'), '字段ID当字面量应被拦截');
  assert.ok(detectPlaceholder('${warehouseName}'), '未解析模板应被拦截');
  assert.ok(detectPlaceholder('xxx'), 'xxx 占位符应被拦截');
});
test('detectPlaceholder 放行正常业务值', () => {
  assert.strictEqual(detectPlaceholder('上海仓库'), null);
  assert.strictEqual(detectPlaceholder('已通过'), null);
  assert.strictEqual(detectPlaceholder('A-001'), null);
});

console.log('== 体检门禁: 截图 4 硬伤全部拦截 ==');
// 仿 Trae AI 产出的坏流：空壳获取节点 + processVar 字面量 + 空公式 + 断链
test('硬伤① 空壳获取节点（未选表单）→ RETRIEVE_EMPTY_SOURCE', () => {
  const bad = { nodes: [{ type: 'dataRetrieve', nodeId: 'n1', name: { zh_CN: '获取单条数据' }, props: { type: 'single', sourceId: '', condition: { rules: [] } } }] };
  const result = validateProcessJson(bad);
  assert.ok(result.errors.some((e) => e.code === 'RETRIEVE_EMPTY_SOURCE'));
});
test('硬伤② processVar 当字面量存进匹配条件 → PLACEHOLDER_LITERAL', () => {
  const bad = { nodes: [{ type: 'dataUpdate', nodeId: 'n2', name: { zh_CN: '更新数据' }, props: {
    type: 'direct_form', sourceId: 'FORM-KC',
    condition: { condition: 'AND', rules: [{ id: 'textField_wh', name: '仓库名称', opCode: 'Equal', valueType: 'literal', value: 'processVar' }] },
    assignments: [{ column: 'numberField_qty', valueType: 'literal', value: 1 }],
  } }] };
  const result = validateProcessJson(bad);
  assert.ok(result.errors.some((e) => e.code === 'PLACEHOLDER_LITERAL'), 'processVar 字面量应报错');
});
test('硬伤③ 更新规则公式为空 → FORMULA_EMPTY', () => {
  const bad = { nodes: [{ type: 'dataUpdate', nodeId: 'n3', name: { zh_CN: '更新数据' }, props: {
    type: 'direct_form', sourceId: 'FORM-KC',
    condition: { condition: 'AND', rules: [{ id: 'textField_wh', name: '仓库名称', opCode: 'Equal', valueType: 'processVar', value: 'trigger_textField_wh' }] },
    assignments: [{ column: 'numberField_qty', valueType: 'column', value: '' }],
  } }] };
  const result = validateProcessJson(bad);
  assert.ok(result.errors.some((e) => e.code === 'FORMULA_EMPTY'), '空公式应报错');
});
test('硬伤④ 获取节点输出无人引用 → RETRIEVE_DANGLING 警告', () => {
  const bad = { nodes: [
    { type: 'dataRetrieve', nodeId: 'nGet', name: { zh_CN: '获取单条数据' }, props: { type: 'single', sourceId: 'FORM-CG', condition: { rules: [{ id: 'textField_a', name: 'a', opCode: 'Equal', valueType: 'processVar', value: 'trg_x' }] } } },
    { type: 'dataUpdate', nodeId: 'nUpd', name: { zh_CN: '更新数据' }, props: { type: 'direct_form', sourceId: 'FORM-KC', condition: { rules: [{ id: 'f', name: 'f', opCode: 'Equal', valueType: 'processVar', value: 'trg_y' }] }, assignments: [{ column: 'n', valueType: 'literal', value: 1 }] } },
  ] };
  const result = validateProcessJson(bad);
  assert.ok(result.warnings.some((w) => w.code === 'RETRIEVE_DANGLING'), '断链获取节点应警告');
});
test('获取节点被下游引用时不报断链', () => {
  const good = { nodes: [
    { type: 'dataRetrieve', nodeId: 'nGet', name: { zh_CN: '获取单条数据' }, props: { type: 'single', sourceId: 'FORM-CG', condition: { rules: [{ id: 'textField_a', name: 'a', opCode: 'Equal', valueType: 'processVar', value: 'trg_x' }] } } },
    { type: 'dataUpdate', nodeId: 'nUpd', name: { zh_CN: '更新数据' }, props: { type: 'node', sourceId: 'nGet', condition: { rules: [] }, assignments: [{ column: 'n', valueType: 'processVar', value: 'nGet_numberField_qty' }] } },
  ] };
  const result = validateProcessJson(good);
  assert.ok(!result.warnings.some((w) => w.code === 'RETRIEVE_DANGLING'));
});

console.log('== 体检门禁: 其他关键拦截与回归 ==');
test('直接更新无匹配条件 → UPDATE_EMPTY_CONDITION；无更新规则 → UPDATE_EMPTY_ASSIGNMENTS', () => {
  const bad = { nodes: [{ type: 'dataUpdate', nodeId: 'n4', props: { type: 'direct_form', sourceId: 'FORM-KC', condition: { rules: [] }, assignments: [] } }] };
  const result = validateProcessJson(bad);
  assert.ok(result.errors.some((e) => e.code === 'UPDATE_EMPTY_CONDITION'));
  assert.ok(result.errors.some((e) => e.code === 'UPDATE_EMPTY_ASSIGNMENTS'));
});
test('schemaMap 提供时拦截编造字段 → FIELD_NOT_IN_SCHEMA', () => {
  const bad = { nodes: [{ type: 'dataUpdate', nodeId: 'n5', props: {
    type: 'direct_form', sourceId: 'FORM-KC',
    condition: { rules: [{ id: 'textField_fake', name: '不存在', opCode: 'Equal', valueType: 'processVar', value: 'trg_x' }] },
    assignments: [{ column: 'numberField_qty', valueType: 'literal', value: 1 }],
  } }] };
  const result = validateProcessJson(bad, { schemaMap: { 'FORM-KC': ['textField_wh', 'numberField_qty'] } });
  assert.ok(result.errors.some((e) => e.code === 'FIELD_NOT_IN_SCHEMA'));
});
test('回归: builder 正常产出的最简消息流体检通过', () => {
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-1', appType: 'APP-1',
    formEventTypes: ['insert'], notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: makeIds(3), hasMessageNode: true,
  });
  const result = validateProcessJson(process);
  assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
});
test('回归: builder 正常产出的直接更新流（含公式累加）体检通过', () => {
  const process = buildProcessJson({
    processCode: 'LPROC-TEST', formUuid: 'FORM-CG', appType: 'APP-1',
    formEventTypes: ['insert'], notificationTitle: 't', notificationContent: 'c',
    toUsers: [{ userId: 'u1', userName: '' }], userFields: [],
    nodeIds: makeIds(6), hasMessageNode: false,
    updateFormUuid: 'FORM-KC', updateType: 'direct_form', updateSourceId: 'FORM-KC',
    updateConditions: [{ bFieldId: 'textField_wh', bFieldName: '仓库名称', aFieldId: 'trigger_textField_wh', valueType: 'processVar', opCode: 'Equal' }],
    updateAssignments: [{ column: 'numberField_qty', valueType: 'column', value: '<p>#{numberField_qty}+#{trigger_numberField_in}</p>' }],
    updateNoneOperation: 'add',
  });
  const result = validateProcessJson(process);
  assert.strictEqual(result.errors.length, 0, JSON.stringify(result.errors));
});

console.log('\n==================================================');
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
console.log('==================================================');
if (failed > 0) {
  for (const f of failures) {
    console.log('FAIL: ' + f.name + ' :: ' + f.message);
  }
  process.exit(1);
}
