/**
 * knowledge-sources.js — yida-consultant 知识源映射
 *
 * 维护 FAQ、现有 skill references、场景案例库路径的映射。
 * 纯函数，不调用任何外部 API。
 */

'use strict';

/**
 * 问题描述 → 推荐知识源文件列表
 * 供 diagnose.js 和 AI 参考使用
 */
const KNOWLEDGE_SOURCES = {
  formula: {
    faq: '.agents/skills/yida-consultant/references/faq-formula.md',
    skillReferences: [
      '.agents/skills/formula-generator/references/01-formula-complete-reference.md',
      '.agents/skills/formula-generator/references/02-common-errors.md',
      '.agents/skills/formula-generator/references/05-failure-cases.md',
      '.agents/skills/formula-generator/references/06-component-data-structures.md'
    ],
    caseLibrary: '★宜搭场景案例库/宜搭公式/'
  },
  code: {
    faq: '.agents/skills/yida-consultant/references/faq-code.md',
    skillReferences: [
      '.agents/skills/code-expert/references/common-core/error-guide.md',
      '.agents/skills/code-expert/references/common-core/syntax-guide.md',
      '.agents/skills/code-expert/references/common-core/api-reference.md',
      '.agents/skills/code-expert/references/common-core/data-structures.md'
    ],
    caseLibrary: '★宜搭场景案例库/宜搭代码/',
    devDocs: '★宜搭开发参考文档/表单JS代码/'
  },
  form: {
    faq: '.agents/skills/yida-consultant/references/faq-form.md',
    skillReferences: [
      '.agents/skills/form_creator/references/faq.md',
      '.agents/skills/form_creator/references/field-type-rules.md',
      '.agents/skills/form_creator/references/workflow-details.md'
    ],
    devDocs: '★宜搭开发参考文档/业务构建到表单/'
  },
  'business-rule': {
    faq: '.agents/skills/yida-consultant/references/faq-business-rule.md',
    skillReferences: [
      '.agents/skills/business-rule/references/manual-config-steps.md',
      '.agents/skills/business-rule/references/business-rule-functions.md',
      '.agents/skills/business-rule/references/examples-jinxiaocun.md'
    ],
    caseLibrary: '★宜搭场景案例库/业务规则/'
  },
  integration: {
    faq: '.agents/skills/yida-consultant/references/faq-integration.md',
    skillReferences: [
      '.agents/skills/integration/references/集成自动化硬规则.md',
      '.agents/skills/integration/references/node-playbook.md',
      '.agents/skills/integration/references/canonical-node-shapes.md',
      '.agents/skills/integration/references/cli-examples.md'
    ]
  },
  data: {
    faq: '.agents/skills/yida-consultant/references/faq-data.md',
    skillReferences: [
      '.agents/skills/data-tester/references/yida-field-api-format.md'
    ]
  },
  connector: {
    faq: '.agents/skills/yida-consultant/references/faq-connector.md',
    skillReferences: [
      '.agents/skills/connector/references/connector-action-format.md',
      '.agents/skills/connector/references/connector-api-guide.md'
    ]
  },
  permission: {
    faq: '.agents/skills/yida-consultant/references/faq-permission.md',
    skillReferences: [
      '.agents/skills/auth-plus/SKILL.md',
      '.agents/skills/config-sync/SKILL.md',
      '.agents/skills/org-init/SKILL.md'
    ]
  },
  system: {
    faq: null,
    skillReferences: [
      '.agents/skills/system-troubleshooter/SKILL.md'
    ]
  }
};

/**
 * 通用参考文档（跨分类使用）
 */
const COMMON_SOURCES = {
  skillConfig: '.agents/skills/skill-config.json',
  caseLibraryIndex: '.agents/skills/yida-consultant/references/case-index.md',
  diagnosticFlow: '.agents/skills/yida-consultant/references/diagnostic-flow.md',
  generalHardRules: '.agents/skills/通用硬规则.md'
};

/**
 * 获取指定分类的知识源列表（扁平化）
 * @param {string} category - 分类名
 * @returns {string[]} 知识源文件路径列表
 */
function getSourcesByCategory(category) {
  var sources = KNOWLEDGE_SOURCES[category];
  if (!sources) return [];
  var result = [];
  if (sources.faq) result.push(sources.faq);
  if (sources.skillReferences) result = result.concat(sources.skillReferences);
  return result;
}

module.exports = { KNOWLEDGE_SOURCES, COMMON_SOURCES, getSourcesByCategory };
