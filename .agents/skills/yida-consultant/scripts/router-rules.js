/**
 * router-rules.js — yida-consultant 诊断路由规则
 *
 * 维护 9 类问题的关键词、负信号、默认验证方式、风险等级。
 * 纯函数，不调用任何外部 API，不执行写操作。
 * 可被 diagnose.js 引用，也可独立 require 做单元测试。
 */

'use strict';

/**
 * 宜搭上下文信号。诊断意图必须与这些信号之一共同出现，才能由 yida-consultant 接管。
 * 裸的“为什么不生效 / 报错什么原因 / 对不对”不能单独触发诊断分类。
 */
const YIDA_CONTEXT_SIGNALS = [
  '宜搭', 'yida', '表单', '组件id', '字段id', 'formuuid', 'apptype',
  '公式', '业务规则', '业务关联规则', '集成自动化', '逻辑流', '连接器',
  '流程', '审批', '数据提交', '提交报错', '关联填充', '字段格式',
  'textfield_', 'numberfield_', 'datefield_', 'employeefield_', 'form_inst_id',
  'saveformdata', 'updateformdata', 'searchformdatas',
  'now()', 'gt()', 'timestamp()', 'date()', 'if(', 'sum(', 'this.$', 'this.props',
  'datasourcemap', 'processjson', 'viewjson', 'direct_form'
];

/**
 * 通用诊断词只能辅助判断，不能作为具体分类的唯一依据。
 */
const GENERIC_DIAGNOSTIC_SIGNALS = [
  '为什么', '不生效', '报错', '什么原因', '哪里错', '对不对',
  '怎么解决', '不对', '失败', '异常', '保存成功但不'
];

/**
 * 9 类问题的路由规则
 * 每条规则包含：keywords（正信号）、negativeSignals（负信号）、validation、riskLevel
 */
const ROUTER_RULES = [
  {
    category: 'formula',
    label: '公式问题',
    keywords: [
      '公式', '计算结果不对', '函数报错',
      'NOW()', 'GT()', 'TIMESTAMP()', 'DATE()', 'IF(', 'SUM(', 'SUMPRODUCT(',
      'CONCATENATE(', 'YEAR(', 'MONTH(', 'DAY(', 'DAYS(', 'USERFIELD(',
      'ARRAYGET(', 'GetArrayItem(', 'COUNT(', 'AVG(', 'MAX(', 'MIN(',
      'MARKS', 'textField_', 'numberField_'
    ],
    negativeSignals: ['写公式', '生成公式', '创建公式', '写代码', '创建表单'],
    validation: {
      mode: 'write-required',
      commandHint: 'node .agents/skills/data-tester/scripts/submitter.js',
      description: '提交测试数据验证公式字段返回值（写操作，需用户同意）'
    },
    riskLevel: 'medium',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-formula.md',
      '.agents/skills/formula-generator/references/02-common-errors.md',
      '.agents/skills/formula-generator/references/05-failure-cases.md'
    ],
    nextAction: '给出正确公式写法，用户复制粘贴（通用硬规则：不能API改已有字段）'
  },
  {
    category: 'code',
    label: '代码问题',
    keywords: [
      'JS', 'js', '代码', '报错', 'this.$', 'this.props', 'this.utils',
      'export function', 'dataSourceMap', 'setValue', 'getValue',
      'ES6', '箭头函数', 'async', 'await', 'let ', 'const ',
      '自动化脚本', '表单动作', '字段校验'
    ],
    negativeSignals: ['写代码', '生成代码', '创建代码', '写公式'],
    validation: {
      mode: 'simulate-first',
      commandHint: 'node .agents/skills/js-action-tester/scripts/test-runner.js',
      description: '创建测试表单绑定代码运行（优先新建模拟环境）'
    },
    riskLevel: 'low',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-code.md',
      '.agents/skills/code-expert/references/common-core/error-guide.md',
      '.agents/skills/code-expert/references/common-core/syntax-guide.md'
    ],
    nextAction: '给出正确代码写法，用户复制粘贴（通用硬规则：不能API改已有字段）'
  },
  {
    category: 'form',
    label: '表单问题',
    keywords: [
      '表单', '字段类型', '布局', 'UUID', '组件ID', '提交报错',
      'formUuid', 'formType', '子表单', '关联表单'
    ],
    negativeSignals: ['创建表单', '生成表单', '设计表单'],
    validation: {
      mode: 'read-only',
      commandHint: 'node .agents/skills/get-schema/scripts/sync-schema.js',
      description: '同步最新 Schema，检查字段类型和 ID'
    },
    riskLevel: 'low',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-form.md',
      '.agents/skills/form_creator/references/faq.md',
      '.agents/skills/form_creator/references/field-type-rules.md'
    ],
    nextAction: '指导正确配置或调 form_creator 重建'
  },
  {
    category: 'business-rule',
    label: '业务规则问题',
    keywords: [
      '业务关联规则', '业务规则', 'INSERT', 'UPDATE', 'DELETE', 'UPSERT',
      '跨表', '单据提交', '节点提交规则'
    ],
    negativeSignals: ['配置业务规则', '创建业务规则'],
    validation: {
      mode: 'read-only',
      commandHint: 'node .agents/skills/rule-sync/scripts/sync_rules.js',
      description: '同步当前规则配置，检查配置'
    },
    riskLevel: 'low',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-business-rule.md',
      '.agents/skills/business-rule/references/manual-config-steps.md',
      '.agents/skills/business-rule/references/business-rule-functions.md'
    ],
    nextAction: '调 business-rule skill 重新配置'
  },
  {
    category: 'integration',
    label: '集成自动化问题',
    keywords: [
      '集成自动化', '逻辑流', '保存成功但不', '触发器', '节点',
      'processJson', 'viewJson', 'direct_form', '循环容器',
      'processFinish', '审批通过', '同步库存', '消息通知', '连接器调用'
    ],
    negativeSignals: ['配置集成自动化', '创建逻辑流', '创建自动化'],
    validation: {
      mode: 'read-only',
      commandHint: 'node .agents/skills/integration/scripts/integration-validate.js <appType> <processCode>',
      description: '体检逻辑流配置（只读操作）'
    },
    riskLevel: 'medium',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-integration.md',
      '.agents/skills/integration/references/集成自动化硬规则.md',
      '.agents/skills/integration/references/node-playbook.md'
    ],
    nextAction: '先做只读体检；如需重建逻辑流，必须征得用户同意，走 integration CLI'
  },
  {
    category: 'data',
    label: '数据问题',
    keywords: [
      '提交报错', '数据格式', '关联填充', '字段格式',
      'saveFormData', 'updateFormData', 'searchFormDatas',
      'AddressField', 'EmployeeField', 'AssociationFormField',
      '时间戳', 'userId'
    ],
    negativeSignals: ['生成测试数据', '批量插入', '清空数据', '删除数据'],
    validation: {
      mode: 'read-only',
      commandHint: 'node .agents/skills/config-sync/scripts/sync_config.js',
      description: '同步配置检查字段格式'
    },
    riskLevel: 'low',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-data.md',
      '.agents/skills/data-tester/references/yida-field-api-format.md'
    ],
    nextAction: '指导正确数据格式或调 data-tester 重试'
  },
  {
    category: 'connector',
    label: '连接器问题',
    keywords: [
      '连接器', '鉴权', 'API调用', '动作配置', 'connector',
      '401', '403', '鉴权失败', '连接账号', 'safe-action'
    ],
    negativeSignals: ['创建连接器'],
    validation: {
      mode: 'write-required',
      commandHint: 'node .agents/skills/connector/scripts/connector-manager.js',
      description: '连接器动作测试（涉及外部 API 调用，需说明影响）'
    },
    riskLevel: 'medium',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-connector.md',
      '.agents/skills/connector/references/connector-action-format.md',
      '.agents/skills/connector/references/connector-api-guide.md'
    ],
    nextAction: '调 connector skill 重新配置'
  },
  {
    category: 'permission',
    label: '登录/权限问题',
    keywords: [
      '登录', 'Cookie', '权限', '数据范围', '看不到数据',
      '权限组', '登录态', '认证', '未登录', 'appType未填写'
    ],
    negativeSignals: [],
    validation: {
      mode: 'read-only',
      commandHint: 'node .agents/skills/config-sync/scripts/sync_config.js',
      description: '检查登录态和权限配置'
    },
    riskLevel: 'low',
    knowledgeSources: [
      '.agents/skills/yida-consultant/references/faq-permission.md'
    ],
    nextAction: '调 auth-plus 重新登录或调对应 Skill 调整权限'
  },
  {
    category: 'system',
    label: '系统环境问题',
    keywords: [
      'Node.js', 'npm', 'PowerShell', '乱码', '编码',
      '路径错误', '命令找不到', '权限拒绝', '环境变量',
      '终端', 'chcp', 'UTF-8'
    ],
    negativeSignals: [],
    validation: {
      mode: 'redirect',
      commandHint: '转交 system-troubleshooter',
      description: '系统环境问题不在 yida-consultant 职责范围内'
    },
    riskLevel: 'low',
    knowledgeSources: [
      '.agents/skills/system-troubleshooter/SKILL.md'
    ],
    nextAction: '转交 system-troubleshooter 处理'
  }
];

/**
 * 执行型信号词（命中则不接管，转交执行型 Skill）
 */
const EXECUTION_SIGNALS = [
  '写公式', '生成公式', '创建公式', '写代码', '生成代码', '创建代码',
  '创建表单', '生成表单', '设计表单', '配置集成自动化', '创建逻辑流',
  '创建自动化', '创建连接器', '配置业务规则', '创建业务规则',
  '同步配置', '同步规则', '同步Schema', '生成测试数据', '批量插入',
  '清空数据', '删除数据', '创建报表', '创建数据集', '生成原型'
];

module.exports = {
  ROUTER_RULES,
  EXECUTION_SIGNALS,
  YIDA_CONTEXT_SIGNALS,
  GENERIC_DIAGNOSTIC_SIGNALS
};
