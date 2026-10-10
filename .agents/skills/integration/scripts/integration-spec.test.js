'use strict';

/**
 * integration-spec.test.js — --spec 声明式规格翻译器离线断言（P4-2，v2.9.0）
 * 金标准 = AGENTS.md 硬规则 5/14/16 文档模板逐字符比对。
 * 运行：node .agents/skills/integration/scripts/integration-spec.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadSpecArgs, buildConditionString } = require('./integration-spec');

let pass = 0, fail = 0;
const assert = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' | ' + detail : '')); }
};

function translate(specObj) {
  const f = path.join(os.tmpdir(), 'spec_test_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(f, JSON.stringify(specObj));
  return loadSpecArgs(['--spec', f]);
}
const flagVal = (argv, flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
const flagVals = (argv, flag) => { const r = []; argv.forEach((a, i) => { if (a === flag && argv[i + 1]) r.push(argv[i + 1]); }); return r; };

console.log('== P4-2 spec 翻译器（金标准=硬规则文档模板）==');

// 金标准1：硬规则5 direct_form 黄金配方（3节点 upsert）
const g1 = translate({
  specVersion: '1.0', appType: 'APP_XXX', flowName: '审批通过后同步更新',
  trigger: { formUuid: 'FORM-TRIGGER', events: ['processFinish'], approvalActions: ['agree'] },
  nodes: [{
    type: 'updateData', formUuid: 'FORM-TARGET', noneOperation: 'add',
    conditions: [
      { target: 'textField_target_key1', targetName: '目标匹配字段1', source: 'textField_trig_key1', componentType: 'TextField', op: 'Equal', valueType: 'processVar' },
      { target: 'textField_target_key2', targetName: '目标匹配字段2', source: 'textField_trig_key2', componentType: 'TextField', op: 'Equal', valueType: 'processVar' },
    ],
    assignments: [
      { target: 'numberField_target_val', valueType: 'column', value: '#{FORM-TARGET/numberField_target_val}+#{numberField_trig_val}' },
      { target: 'textField_target_key1', valueType: 'processVar', value: 'textField_trig_key1' },
      { target: 'textField_target_key2', valueType: 'processVar', value: 'textField_trig_key2' },
    ],
  }],
  publish: true,
});
assert('位置参数（appType/formUuid/flowName）', g1[0] === 'APP_XXX' && g1[1] === 'FORM-TRIGGER' && g1[2] === '审批通过后同步更新');
assert('events / approval-actions', flagVal(g1, '--events') === 'processFinish' && flagVal(g1, '--approval-actions') === 'agree');
assert('update-condition 双冒号格式逐字符一致（硬规则5模板）',
  flagVals(g1, '--update-condition')[0] === 'textField_target_key1:目标匹配字段1:textField_trig_key1:TextField:Equal::processVar' &&
  flagVals(g1, '--update-condition')[1] === 'textField_target_key2:目标匹配字段2:textField_trig_key2:TextField:Equal::processVar',
  JSON.stringify(flagVals(g1, '--update-condition')));
assert('update-assignment 三段式（column 公式）',
  flagVals(g1, '--update-assignment')[0] === 'numberField_target_val:column:#{FORM-TARGET/numberField_target_val}+#{numberField_trig_val}');
assert('noneOperation=add / publish', flagVal(g1, '--update-none-operation') === 'add' && g1.includes('--publish'));

// 金标准2：硬规则16 模式A（sub_table 直接获取+删子表行），data-condition 单冒号
const g2 = translate({
  specVersion: '1.0', appType: 'APP_XXX', flowName: '审批通过后删除关联子表行',
  trigger: { formUuid: 'FORM-TRIGGER', events: ['processFinish'], approvalActions: ['agree'] },
  nodes: [
    { type: 'getFormData', formUuid: 'FORM-TARGET', queryType: 'multiple',
      conditions: [{ target: 'numberField_target_sub_val', targetName: '规格', source: 'numberField_trigger_sub_val', componentType: 'NumberField', op: 'Equal', valueType: 'processVar' }],
      subSourceId: 'tableField_target_sub' },
    { type: 'deleteData', subSourceId: 'tableField_target_sub',
      subConditions: [{ target: 'numberField_target_sub_val', targetName: '规格', source: 'numberField_trigger_sub_val', componentType: 'NumberField', op: 'Equal', valueType: 'processVar' }] },
  ],
  publish: true,
});
assert('data-condition 单冒号格式（硬规则16模板）',
  flagVal(g2, '--data-condition') === 'numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal:processVar',
  flagVal(g2, '--data-condition'));
assert('data-sub-source-id 单独使用（模式A，无 data-sub-condition）',
  flagVal(g2, '--data-sub-source-id') === 'tableField_target_sub' && flagVal(g2, '--data-sub-condition') === null);
assert('delete-sub-condition 双冒号',
  flagVal(g2, '--delete-sub-condition') === 'numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar');

// 金标准3：获取自身→更新数据 + literal 条件（硬规则17缺口1 单冒号，a位=值）
const g3 = translate({
  specVersion: '1.0', appType: 'APP_A', flowName: 'spec模式获取自身更新',
  trigger: { formUuid: 'FORM-T', events: ['insert'] },
  nodes: [
    { type: 'getSelf' },
    { type: 'updateData', formUuid: 'FORM-G', noneOperation: 'ignored',
      conditions: [{ target: 'process_status', targetName: '流程状态', value: '已完成', componentType: 'SelectField', op: 'Contain', valueType: 'literal' }],
      assignments: [{ target: 'numberField_v', valueType: 'processVar', value: 'numberField_s' }] },
  ],
  publish: true,
});
assert('getSelf 节点', g3.includes('--get-self'));
assert('literal 条件 a位=值（data格式单冒号）',
  buildConditionString({ target: 'process_status', targetName: '流程状态', value: '已完成', componentType: 'SelectField', op: 'Contain', valueType: 'literal' }, false) === 'process_status:流程状态:已完成:SelectField:Contain:literal');
assert('update noneOperation=ignored（硬规则13.1）', flagVal(g3, '--update-none-operation') === 'ignored');

// 发起审批赋值三段式（硬规则11/14）
const g4 = translate({
  specVersion: '1.0', appType: 'APP_A', flowName: '两步方案',
  trigger: { formUuid: 'FORM-T', events: ['processFinish'], approvalActions: ['agree'] },
  nodes: [{ type: 'initiateApproval', formUuid: 'FORM-G', assignments: [{ target: 'textField_m', valueType: 'processVar', value: 'textField_src' }] }],
});
assert('initiateApproval-assignment 三段式', flagVal(g4, '--initiate-approval-assignment') === 'textField_m:processVar:textField_src');

// fail-fast：未建模节点禁止静默丢节点
let threw = false;
try { translate({ specVersion: '1.0', flowName: 'x', appType: 'APP_A', trigger: { formUuid: 'F' }, nodes: [{ type: 'unknownNode' }] }); } catch (e) { threw = /未建模/.test(e.message); }
assert('未建模节点报错（防静默丢节点）', threw);

console.log('----------------------------------');
console.log('测试完成: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail > 0) process.exit(1);
