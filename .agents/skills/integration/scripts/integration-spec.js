'use strict';

/**
 * integration-spec.js — 集成自动化声明式规格（--spec）翻译器（v2.9.0，P4-2）
 *
 * 职责：把声明式 spec JSON 翻译为 integration-create.js 的既有 CLI 参数数组，
 * 之后完全复用原有构建链（processJson/viewJson 构建器 + 保存前体检门禁 + Schema 校验）。
 * 本模块不直接调用任何宜搭 API。
 *
 * 设计约束：
 * - 条件串格式必须与既有文档模板逐字符一致（AGENTS.md 硬规则 5/14/16 模板）：
 *   --update-condition / --update-sub-condition / --delete-sub-condition 用 `b:bName:a:Type:Op::valueType`（双冒号）
 *   --data-condition 用 `b:bName:a:Type:Op:valueType`（单冒号，硬规则 17 缺口1）
 * - 赋值串为 `fieldId:valueType:value` 三段式（parseAssignments 契约）
 * - 未建模的参数一律走 spec/node 的 extraArgs 原样透传（逃生舱口），禁止在本模块拼未知 flag
 */

const fs = require('fs');

/** 组装条件串。cond: {target,targetName,source,componentType,op,valueType,value} */
function buildConditionString(cond, doubleColon) {
  const aSide = cond.valueType === 'literal' ? (cond.value !== undefined ? cond.value : cond.source) : cond.source;
  const seg = [cond.target, cond.targetName || '', aSide, cond.componentType || '', cond.op || 'Equal'];
  const vt = cond.valueType ? (doubleColon ? '::' + cond.valueType : ':' + cond.valueType) : '';
  return seg.join(':') + vt;
}

/** 组装赋值串 a:{target,valueType,value} */
function buildAssignmentString(a) {
  if (!a.target || !a.valueType) {
    throw new Error('spec 赋值缺少 target 或 valueType: ' + JSON.stringify(a));
  }
  return a.target + ':' + a.valueType + ':' + (a.value !== undefined ? a.value : '');
}

/** 单节点 → CLI 参数片段 */
function nodeToArgs(node, out) {
  switch (node.type) {
    case 'getSelf':
      out.push('--get-self');
      if (node.queryField) out.push('--get-self-query-field', node.queryField);
      if (node.field) out.push('--get-self-field', node.field);
      break;
    case 'getFormData':
      out.push('--data-form-uuid', node.formUuid);
      if (node.queryType) out.push('--data-query-type', node.queryType);
      if (node.quantity !== undefined) out.push('--data-quantity', String(node.quantity));
      (node.conditions || []).forEach((c) => out.push('--data-condition', buildConditionString(c, false)));
      if (node.subSourceId) out.push('--data-sub-source-id', node.subSourceId);
      (node.subConditions || []).forEach((c) => out.push('--data-sub-condition', buildConditionString(c, false)));
      if (node.sourceType) out.push('--data-source-type', node.sourceType);
      if (node.subFieldId) out.push('--data-sub-field-id', node.subFieldId);
      break;
    case 'addData':
      out.push('--add-data-form-uuid', node.formUuid);
      (node.assignments || []).forEach((a) => out.push('--add-data-assignment', buildAssignmentString(a)));
      if (node.insertType) out.push('--add-data-insert-type', node.insertType);
      if (node.subFormUuid) out.push('--add-data-sub-form-uuid', node.subFormUuid);
      if (node.batch) {
        out.push('--add-data-type', node.batch.type || 'batch');
        if (node.batch.sourceId) out.push('--add-data-source-id', node.batch.sourceId);
      }
      break;
    case 'initiateApproval':
      out.push('--initiate-approval-form-uuid', node.formUuid);
      (node.assignments || []).forEach((a) => out.push('--initiate-approval-assignment', buildAssignmentString(a)));
      if (node.initiatorUser) out.push('--initiate-approval-initiator-user', node.initiatorUser);
      break;
    case 'updateData':
      out.push('--update-form-uuid', node.formUuid);
      (node.conditions || []).forEach((c) => out.push('--update-condition', buildConditionString(c, true)));
      (node.assignments || []).forEach((a) => out.push('--update-assignment', buildAssignmentString(a)));
      if (node.subSourceId) out.push('--update-sub-source-id', node.subSourceId);
      (node.subConditions || []).forEach((c) => out.push('--update-sub-condition', buildConditionString(c, true)));
      if (node.noneOperation) out.push('--update-none-operation', node.noneOperation);
      break;
    case 'deleteData':
      out.push('--delete-data');
      if (node.subSourceId) out.push('--delete-sub-source-id', node.subSourceId);
      (node.subConditions || []).forEach((c) => out.push('--delete-sub-condition', buildConditionString(c, true)));
      break;
    case 'message':
      if (node.receivers) out.push('--receivers', node.receivers);
      if (node.title) out.push('--title', node.title);
      if (node.content) out.push('--content', node.content);
      break;
    default:
      throw new Error('spec 节点类型未建模: ' + node.type + '（可用 extraArgs 透传原始 CLI 参数）');
  }
  (node.extraArgs || []).forEach((x) => out.push(x));
}

/**
 * 读 spec 并翻译为 argv。原 argv 中的 --spec <file> 被替换为翻译结果；
 * 命令行位置参数（appType/formUuid/flowName）优先于 spec 内声明。
 * @returns {string[]} 完整 argv
 */
function loadSpecArgs(argv) {
  const idx = argv.indexOf('--spec');
  if (idx === -1) return argv;
  const file = argv[idx + 1];
  if (!file) throw new Error('--spec 需要跟 spec JSON 文件路径');
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!spec.flowName) throw new Error('spec 缺少 flowName');
  if (!spec.trigger || !spec.trigger.formUuid) throw new Error('spec 缺少 trigger.formUuid');

  const positional = argv.filter((a, i) => i !== idx && i !== idx + 1 && !a.startsWith('-'));
  const flagsFromCli = [];
  for (let i = 0; i < argv.length; i++) {
    if (i === idx || i === idx + 1) { i++; continue; }
    if (!argv[i].startsWith('-')) continue;
    flagsFromCli.push(argv[i]);
    if (argv[i + 1] && !argv[i + 1].startsWith('-')) { flagsFromCli.push(argv[i + 1]); i++; }
  }

  const out = [];
  out.push(positional[0] || spec.appType);
  out.push(positional[1] || spec.trigger.formUuid);
  out.push(positional[2] || spec.flowName);
  if (!out[0]) throw new Error('appType 未提供（命令行位置参数或 spec.appType）');

  if (spec.trigger.events && spec.trigger.events.length) out.push('--events', spec.trigger.events.join(','));
  if (spec.trigger.approvalActions && spec.trigger.approvalActions.length) out.push('--approval-actions', spec.trigger.approvalActions.join(','));
  (spec.nodes || []).forEach((n) => nodeToArgs(n, out));
  (spec.extraArgs || []).forEach((x) => out.push(x));
  if (spec.publish) out.push('--publish');

  // 命令行显式 flag 优先级最高，追加在尾部（parseFlag 取首个命中，spec 值先生效、CLI 覆盖）
  return out.concat(flagsFromCli);
}

module.exports = { loadSpecArgs, buildConditionString, buildAssignmentString, nodeToArgs };
