'use strict';

/**
 * integration-validate.js - 逻辑流配置体检器（保存前门禁 + 已有流审计）
 *
 * 背景：saveProcess 接口对节点 props 完整性几乎不校验，任何 AI/人工
 * 产出的半成品（空壳节点、占位符字面量、空公式、断链）都能"保存成功"。
 * 本模块在两个环节堵住带病配置：
 *   1. 门禁模式：integration-create.js 保存前调用 validateProcessJson，
 *      有 error 直接拒绝保存（--force-save 可跳过）。
 *   2. 审计模式：CLI 回读任意已有逻辑流（包括其他 AI 工具创建的）并体检。
 *
 * 用法:
 *   node integration-validate.js <appType> <processCode> [--json]   审计线上逻辑流
 *   node integration-validate.js --file <path.json> [--json]        校验本地 processJson
 */

const path = require('path');
const fs = require('fs');

// ==================== 占位符检测 ====================

// 序列化格式的保留 token：出现在 literal 值槽位 = 把"值类型枚举/结构键名"当成了数据
// （典型事故：匹配条件存成 仓库名称 等于 literal "processVar"，永远匹配不到任何数据）
const RESERVED_TOKENS = new Set([
  'processvar', 'formvar', 'literal', 'column', 'formula', 'value',
  'fieldid', 'formuuid', 'apptype', 'processcode', 'nodeid', 'valuetype',
]);

// 常见占位符样式（AI 编造/模板未替换）
const PLACEHOLDER_PATTERNS = [
  /^x{3,}$/i, /^y{3,}$/i, /^z{3,}$/i,
  /^(placeholder|todo|tbd|demo|example|sample|test\d*)$/i,
  /^(占位|占位符|示例|待填|待定|变量名?)$/,
  /^FORM-X{3,}/i, /^APP_X{3,}/i,
];

// 宜搭字段ID形态：literal 槽位出现字段ID = 想引用字段却存成了字面量
const FIELD_ID_LIKE = /^(text|textarea|number|select|multiSelect|radio|checkbox|date|dateRange|employee|department|association|attachment|image|address|rating|digitalSignature|serialNumber|table|cascade|countrySelect|link|money)Field_[0-9a-z]+$/i;

// 模板语法逃逸：literal 值里残留 ${}/{{}}/<%%> 说明公式或变量没被真正解析
const TEMPLATE_ESCAPE = /(\$\{|\{\{|<%|#\{)/;

function detectPlaceholder(value) {
  if (typeof value !== 'string' || !value) { return null; }
  const trimmed = value.trim();
  if (RESERVED_TOKENS.has(trimmed.toLowerCase())) {
    return `字面量值 "${trimmed}" 是序列化格式的保留 token（值类型枚举/结构键名），` +
      '通常是想引用流程变量/字段却把 token 存成了数据本身';
  }
  if (FIELD_ID_LIKE.test(trimmed)) {
    return `字面量值 "${trimmed}" 形似宜搭字段ID，想引用字段请把 valueType 设为 processVar 并用字段引用格式`;
  }
  if (TEMPLATE_ESCAPE.test(trimmed)) {
    return `字面量值 "${trimmed}" 含未解析的模板/公式语法，应使用 formula/processVar 值类型`;
  }
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `字面量值 "${trimmed}" 疑似占位符（模板未替换或 AI 编造）`;
    }
  }
  return null;
}

// ==================== 校验核心 ====================

function pickName(name) {
  if (!name) { return ''; }
  if (typeof name === 'string') { return name; }
  return name.zh_CN || name.en_US || '';
}

function flattenNodes(nodes, acc) {
  for (const node of nodes || []) {
    if (!node || typeof node !== 'object') { continue; }
    acc.push(node);
    if (Array.isArray(node.childNodes) && node.childNodes.length > 0) {
      flattenNodes(node.childNodes, acc);
    }
  }
  return acc;
}

function conditionRules(condition) {
  return (condition && Array.isArray(condition.rules)) ? condition.rules : [];
}

// 空公式判定：valueType 为公式类且值为空/空白/空结构
function isEmptyFormulaValue(valueType, value) {
  if (valueType !== 'column' && valueType !== 'formula') { return false; }
  if (value === null || value === undefined) { return true; }
  if (typeof value === 'string') { return value.trim() === ''; }
  if (typeof value === 'object') { return Object.keys(value).length === 0; }
  return false;
}

/**
 * 校验 processJson，返回 { errors, warnings }
 * @param {object} processJson  { props, nodes } 结构（保存前构建产物或 getProcess 回读的 content.json）
 * @param {object} [options]
 * @param {object} [options.schemaMap]  { formUuid: [fieldId,...] } 提供时校验字段是否存在于表单
 */
function validateProcessJson(processJson, options) {
  const opts = options || {};
  const errors = [];
  const warnings = [];
  const nodes = flattenNodes((processJson && processJson.nodes) || [], []);

  const addIssue = (list, node, code, message) => {
    list.push({
      code,
      nodeId: node ? node.nodeId : '',
      nodeName: node ? (pickName(node.name) || node.type) : '',
      nodeType: node ? node.type : '',
      message,
    });
  };

  // schema 字段集（大小写敏感，宜搭 fieldId 本身区分大小写）
  const schemaSets = {};
  if (opts.schemaMap) {
    for (const uuid of Object.keys(opts.schemaMap)) {
      schemaSets[uuid] = new Set(opts.schemaMap[uuid] || []);
    }
  }
  const checkFieldInSchema = (node, formUuid, fieldId, where) => {
    if (!formUuid || !fieldId || !schemaSets[formUuid]) { return; }
    if (!schemaSets[formUuid].has(fieldId)) {
      addIssue(errors, node, 'FIELD_NOT_IN_SCHEMA',
        `${where} 引用的字段 "${fieldId}" 不存在于表单 ${formUuid} 的 Schema，疑似编造的字段ID`);
    }
  };

  // 通用：条件规则组体检（占位符 + 空值 + 字段存在性）
  const checkConditionRules = (node, condition, formUuid, where) => {
    for (const rule of conditionRules(condition)) {
      if (!rule || typeof rule !== 'object') { continue; }
      if (rule.valueType === 'literal') {
        const hit = detectPlaceholder(rule.value);
        if (hit) {
          addIssue(errors, node, 'PLACEHOLDER_LITERAL', `${where}：${hit}`);
        }
      }
      // 为空/不为空类操作符不需要比较值
      const noValueOp = /null|empty/i.test(String(rule.opCode || rule.op || ''));
      if (!noValueOp && (rule.value === '' || rule.value === null || rule.value === undefined)) {
        addIssue(errors, node, 'CONDITION_EMPTY_VALUE',
          `${where}：条件 "${rule.name || rule.id}" 的比较值为空`);
      }
      checkFieldInSchema(node, formUuid, rule.id, where);
    }
  };

  // 通用：赋值列表体检（空公式 + 占位符 + 字段存在性）
  const checkAssignments = (node, assignments, formUuid, where) => {
    for (const assignment of assignments || []) {
      if (!assignment || typeof assignment !== 'object') { continue; }
      if (isEmptyFormulaValue(assignment.valueType, assignment.value)) {
        addIssue(errors, node, 'FORMULA_EMPTY',
          `${where}：字段 "${assignment.column}" 的值类型为公式但公式内容为空`);
      }
      if (assignment.valueType === 'literal') {
        const hit = detectPlaceholder(assignment.value);
        if (hit) {
          addIssue(errors, node, 'PLACEHOLDER_LITERAL', `${where}：${hit}`);
        }
      }
      checkFieldInSchema(node, formUuid, assignment.column, where);
    }
  };

  // 断链检测辅助：某获取节点的 nodeId 是否被其它节点引用
  const isNodeReferenced = (targetNodeId) => {
    for (const other of nodes) {
      if (!other || other.nodeId === targetNodeId) { continue; }
      const propsStr = JSON.stringify(other.props || {});
      if (propsStr.indexOf(targetNodeId) >= 0) { return true; }
    }
    return false;
  };

  for (const node of nodes) {
    const props = node.props || {};

    switch (node.type) {
      case 'dataRetrieve': {
        // 空壳获取节点：没选表单 = 节点完全没配置
        if (!props.sourceId) {
          addIssue(errors, node, 'RETRIEVE_EMPTY_SOURCE',
            '获取数据节点未选择目标表单（sourceId 为空），节点是未配置的空壳');
          break;
        }
        const rules = conditionRules(props.condition);
        if (rules.length === 0) {
          if (props.type === 'single') {
            addIssue(errors, node, 'RETRIEVE_EMPTY_CONDITION',
              '获取单条数据节点没有任何过滤条件，将随机取一条数据，几乎必然是漏配');
          } else {
            addIssue(warnings, node, 'RETRIEVE_EMPTY_CONDITION',
              '获取多条数据节点没有过滤条件，将拉取全表数据，请确认是否有意为之');
          }
        }
        checkConditionRules(node, props.condition, props.sourceId, '获取数据过滤条件');
        // 数据流断链：取了数据但没有任何下游节点引用其输出
        if (!isNodeReferenced(node.nodeId)) {
          addIssue(warnings, node, 'RETRIEVE_DANGLING',
            '获取数据节点的输出没有被任何下游节点引用（更新/新增/条件都没用到它），疑似数据流断链');
        }
        break;
      }

      case 'dataUpdate': {
        if (!props.sourceId) {
          addIssue(errors, node, 'UPDATE_EMPTY_SOURCE', '更新数据节点未选择目标（sourceId 为空）');
          break;
        }
        // direct_form 模式必须有主条件定位记录，否则要么全表要么零匹配
        if (props.type !== 'node' && conditionRules(props.condition).length === 0) {
          addIssue(errors, node, 'UPDATE_EMPTY_CONDITION',
            '更新数据节点（直接更新模式）没有匹配条件，无法定位要更新的记录');
        }
        checkConditionRules(node, props.condition, props.type !== 'node' ? props.sourceId : '', '更新数据匹配条件');
        if (props.subCondition && conditionRules(props.subCondition).length > 0) {
          checkConditionRules(node, props.subCondition, '', '更新数据子表条件');
        }
        if (!Array.isArray(props.assignments) || props.assignments.length === 0) {
          addIssue(errors, node, 'UPDATE_EMPTY_ASSIGNMENTS',
            '更新数据节点没有任何更新规则（assignments 为空），保存后不会更新任何字段');
        }
        checkAssignments(node, props.assignments, props.type !== 'node' ? props.sourceId : '', '更新数据赋值规则');
        break;
      }

      case 'dataCreate': {
        // dataCreate 的目标表单存在 props.formUuid（sourceId 仅批量模式的数据源）
        if (!props.formUuid) {
          addIssue(errors, node, 'CREATE_EMPTY_SOURCE', '新增数据节点未选择目标表单');
          break;
        }
        const createAssignments = Array.isArray(props.assignments) ? props.assignments : [];
        if (createAssignments.length === 0) {
          addIssue(errors, node, 'CREATE_EMPTY_ASSIGNMENTS',
            '新增数据节点没有任何字段赋值，会创建全空记录');
        }
        checkAssignments(node, createAssignments, props.formUuid, '新增数据赋值规则');
        break;
      }

      case 'CodeExecutor': {
        const code = props.action && props.action.code;
        if (!code || String(code).trim() === '') {
          addIssue(errors, node, 'SCRIPT_EMPTY_CODE', '脚本节点代码为空');
        }
        break;
      }

      case 'condition': {
        // route 下的分支条件节点：非默认分支（priority>0 通常为显式条件分支）必须有规则
        const rules = conditionRules(props.condition || props);
        const isDefaultBranch = props.defaultCondition === true || props.priority === 999;
        if (!isDefaultBranch && rules.length === 0 && props.condition) {
          addIssue(errors, node, 'CONDITION_EMPTY_RULES', '条件分支没有任何判断条件');
        }
        checkConditionRules(node, props.condition, '', '条件分支');
        break;
      }

      case 'trigger': {
        if (props.condition) {
          checkConditionRules(node, props.condition, props.sourceId || '', '触发条件');
        }
        break;
      }

      case 'sendMessage': {
        const toUsers = Array.isArray(props.toUsers) ? props.toUsers : [];
        const userFields = Array.isArray(props.userFields) ? props.userFields : [];
        const toRoles = Array.isArray(props.toRoles) ? props.toRoles : [];
        if (toUsers.length === 0 && userFields.length === 0 && toRoles.length === 0) {
          addIssue(errors, node, 'MESSAGE_EMPTY_RECEIVER', '消息通知节点没有任何接收人');
        }
        break;
      }

      default:
        break;
    }
  }

  return { errors, warnings, nodeCount: nodes.length };
}

// ==================== 报告输出 ====================

function formatReport(result) {
  const lines = [];
  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push(`体检通过：${result.nodeCount} 个节点未发现问题`);
    return lines.join('\n');
  }
  if (result.errors.length > 0) {
    lines.push(`发现 ${result.errors.length} 个错误（会导致逻辑流不工作，禁止保存/发布）:`);
    for (const issue of result.errors) {
      lines.push(`  [ERROR][${issue.code}] ${issue.nodeName || issue.nodeType}(${issue.nodeId}): ${issue.message}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push(`发现 ${result.warnings.length} 个警告（请人工确认）:`);
    for (const issue of result.warnings) {
      lines.push(`  [WARN][${issue.code}] ${issue.nodeName || issue.nodeType}(${issue.nodeId}): ${issue.message}`);
    }
  }
  return lines.join('\n');
}

// ==================== CLI（审计模式） ====================

async function runCli(args) {
  const outputJson = args.includes('--json');
  const fileIdx = args.indexOf('--file');

  let processJson;
  let source;

  if (fileIdx >= 0) {
    const filePath = args[fileIdx + 1];
    if (!filePath) {
      console.error('错误: --file 需要提供 JSON 文件路径');
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
    // 兼容三种输入：processJson 本体 / {processJson} 包装 / getProcess 原始 content（json 字段）
    processJson = raw.nodes ? raw : (raw.processJson || raw.json || raw);
    source = filePath;
  } else {
    const positional = args.filter((arg) => !arg.startsWith('-'));
    const appType = positional[0];
    const processCode = positional[1];
    if (!appType || !processCode) {
      console.error('用法: node integration-validate.js <appType> <processCode> [--json]');
      console.error('      node integration-validate.js --file <path.json> [--json]');
      process.exit(appType || processCode ? 1 : 0);
    }
    const coreUtils = require('../../../../lib/core/utils');
    const { triggerLogin } = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));
    const { getProcess } = require('./integration-api');
    let cookieData = coreUtils.loadCookieData();
    if (!cookieData) { cookieData = triggerLogin(); }
    const authRef = {
      csrfToken: cookieData.csrf_token,
      cookies: cookieData.cookies,
      baseUrl: coreUtils.resolveBaseUrl(cookieData),
      cookieData,
    };
    const content = await getProcess(authRef, { appType, processCode });
    processJson = content.json && typeof content.json === 'object' && Array.isArray(content.json.nodes) ? content.json : {};
    // Fallback: if processJson has no nodes, build from viewJson schema.children
    if (!Array.isArray(processJson.nodes) || processJson.nodes.length === 0) {
      if (content.schema && Array.isArray(content.schema.children)) {
        const typeMap = {
          StartNode: 'trigger', AddDataNode: 'dataCreate',
          GetSingleDataNode: 'dataRetrieve', GetMultipleDataNode: 'dataRetrieve',
          UpdateDataNode: 'dataUpdate', DeleteDataNode: 'dataDelete',
          ScriptNode: 'CodeExecutor', ConditionNode: 'route',
          ConnectorNode: 'httpConnector', SendMessageNode: 'sendMessage', EndNode: 'finish',
        };
        processJson = {
          nodes: content.schema.children.map((child) => {
            const props = child.props || {};
            let flatProps = { ...props };
            if (child.componentName === 'UpdateDataNode' && props.updateDataRules) {
              flatProps = { ...props, ...props.updateDataRules };
              delete flatProps.updateDataRules;
            }
            if (child.componentName === 'AddDataNode' && props.addDataRules) {
              flatProps = { ...props, ...props.addDataRules };
              delete flatProps.addDataRules;
            }
            return {
              type: typeMap[child.componentName] || child.componentName,
              nodeId: child.id,
              name: props.name || props.nodeName || '',
              props: flatProps,
            };
          }),
        };
      }
    }
    source = `${appType}/${processCode}（线上回读）`;
  }

  const result = validateProcessJson(processJson);
  if (outputJson) {
    console.log(JSON.stringify({ success: result.errors.length === 0, source, ...result }, null, 2));
  } else {
    console.error('体检对象: ' + source);
    console.log(formatReport(result));
  }
  process.exit(result.errors.length > 0 ? 1 : 0);
}

module.exports = {
  validateProcessJson,
  formatReport,
  detectPlaceholder,
};

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error('执行异常: ' + err.message);
    process.exit(1);
  });
}
