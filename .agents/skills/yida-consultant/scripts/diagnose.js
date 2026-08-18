#!/usr/bin/env node
/**
 * diagnose.js — yida-consultant 诊断路由 CLI
 *
 * 输入：用户问题文本 + 可选上下文
 * 输出：分类、置信度、建议读取的知识源、验证方式、风险等级、下一步动作
 *
 * 用法：
 *   node .agents/skills/yida-consultant/scripts/diagnose.js "集成自动化保存成功但不执行"
 *   node .agents/skills/yida-consultant/scripts/diagnose.js "这个公式有什么问题：IF(GT(NOW(), 计划完成时间), 1, 0)" --json
 *
 * 设计原则：
 * 1. 不调用线上写操作
 * 2. 默认只做本地文本分类和路径推荐
 * 3. 支持 --json，方便后续测试和未来抽离
 * 4. 导出纯函数，便于单元测试
 * 5. 所有路径基于项目根目录计算，不依赖当前终端所在目录
 */

'use strict';

var path = require('path');
var router = require('./router-rules.js');
var knowledge = require('./knowledge-sources.js');

/**
 * 计算项目根目录
 */
function getProjectRoot() {
  // 从当前文件向上找到 package.json 所在目录
  var dir = __dirname;
  for (var i = 0; i < 10; i++) {
    try {
      var fs = require('fs');
      fs.accessSync(path.join(dir, 'package.json'), fs.constants.F_OK);
      return dir;
    } catch (e) {
      dir = path.dirname(dir);
    }
  }
  return path.dirname(path.dirname(path.dirname(path.dirname(__dirname))));
}

/**
 * 诊断主函数（纯函数，可单元测试）
 * @param {string} input - 用户问题文本
 * @param {object} [context] - 可选上下文
 * @returns {object} 诊断结果
 */
function diagnoseText(input, context) {
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return {
      category: 'unknown',
      confidence: 0,
      label: '未知',
      knowledgeSources: [],
      validation: { mode: 'none', description: '请补充错误信息、截图、公式/代码原文或配置上下文' },
      riskLevel: 'none',
      nextAction: '请提供更详细的问题描述',
      isExecution: false
    };
  }

  var text = input.toLowerCase();
  var originalText = input; // 保留原始大小写用于匹配

  // 1. 先检查是否是执行型请求
  // 1a. 精确匹配执行信号
  var executionMatch = null;
  for (var i = 0; i < router.EXECUTION_SIGNALS.length; i++) {
    var signal = router.EXECUTION_SIGNALS[i];
    if (text.indexOf(signal.toLowerCase()) !== -1) {
      executionMatch = signal;
      break;
    }
  }

  // 1b. 模糊匹配：执行动词 + 领域关键词组合
  if (!executionMatch) {
    executionMatch = fuzzyMatchExecution(originalText);
  }

  if (executionMatch) {
    // 执行型请求，不接管
    var targetSkill;
    if (executionMatch.indexOf('(模糊匹配)') !== -1) {
      // 模糊匹配结果直接是 skill 名
      targetSkill = executionMatch.replace('(模糊匹配)', '');
    } else {
      targetSkill = guessExecutionSkill(executionMatch);
    }
    return {
      category: 'execution',
      confidence: 0.95,
      label: '执行型请求（不接管）',
      knowledgeSources: [],
      validation: { mode: 'redirect', description: '应使用 ' + targetSkill + ' skill' },
      riskLevel: 'none',
      nextAction: '提示用户使用 ' + targetSkill + ' skill',
      isExecution: true,
      executionMatch: executionMatch,
      suggestedSkill: targetSkill
    };
  }

  // 2. 宜搭上下文门禁：裸诊断词不能直接触发分类
  if (!hasYidaDiagnosticContext(text) && !hasSystemContext(text)) {
    return {
      category: 'unknown',
      confidence: 0,
      label: '未知',
      knowledgeSources: [],
      validation: { mode: 'none', description: '请补充宜搭上下文，例如公式/代码原文、表单、组件ID、业务规则、集成自动化、连接器或具体错误信息' },
      riskLevel: 'none',
      nextAction: '请补充宜搭相关上下文；裸的“为什么不生效/报错什么原因/对不对”不足以诊断',
      isExecution: false
    };
  }

  // 3. 匹配诊断分类
  var bestMatch = null;
  var bestScore = 0;
  var secondScore = 0;
  var bestHasSpecificSignal = false;

  for (var j = 0; j < router.ROUTER_RULES.length; j++) {
    var rule = router.ROUTER_RULES[j];
    var score = 0;
    var hasSpecificSignal = false;

    // 正信号匹配
    for (var k = 0; k < rule.keywords.length; k++) {
      var keyword = rule.keywords[k].toLowerCase();
      if (text.indexOf(keyword) !== -1) {
        score += 1;
        if (!isGenericDiagnosticSignal(keyword)) {
          hasSpecificSignal = true;
        }
      }
    }

    // 负信号减分
    for (var m = 0; m < rule.negativeSignals.length; m++) {
      if (text.indexOf(rule.negativeSignals[m].toLowerCase()) !== -1) {
        score -= 2;
      }
    }

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestMatch = rule;
      bestHasSpecificSignal = hasSpecificSignal;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!bestMatch || bestScore <= 0 || (bestMatch.category !== 'system' && !bestHasSpecificSignal)) {
    return {
      category: 'unknown',
      confidence: 0,
      label: '未知',
      knowledgeSources: [],
      validation: { mode: 'none', description: '请补充错误信息、截图、公式/代码原文或配置上下文' },
      riskLevel: 'none',
      nextAction: '请提供更详细的问题描述，包括错误信息、公式/代码原文、截图等',
      isExecution: false
    };
  }

  // 3. 计算置信度
  var confidence;
  if (bestScore >= 3) {
    confidence = 0.9;
  } else if (bestScore >= 2) {
    confidence = 0.7;
  } else {
    confidence = 0.5;
  }

  // 如果有第二接近的分类，降低置信度
  if (secondScore > 0 && bestScore - secondScore <= 1) {
    confidence = Math.max(0.4, Math.round((confidence - 0.2) * 100) / 100);
  }

  // 4. 组装结果
  var sources = knowledge.getSourcesByCategory(bestMatch.category);
  if (bestMatch.knowledgeSources) {
    // 合并 router-rules 中的知识源（去重）
    for (var n = 0; n < bestMatch.knowledgeSources.length; n++) {
      if (sources.indexOf(bestMatch.knowledgeSources[n]) === -1) {
        sources.push(bestMatch.knowledgeSources[n]);
      }
    }
  }

  return {
    category: bestMatch.category,
    confidence: confidence,
    label: bestMatch.label,
    knowledgeSources: sources,
    validation: bestMatch.validation,
    riskLevel: bestMatch.riskLevel,
    nextAction: bestMatch.nextAction,
    isExecution: false
  };
}

/**
 * 是否包含宜搭业务上下文。
 * 仅有诊断词时返回 false，避免误抢普通问题。
 */
function hasYidaDiagnosticContext(text) {
  for (var i = 0; i < router.YIDA_CONTEXT_SIGNALS.length; i++) {
    if (text.indexOf(router.YIDA_CONTEXT_SIGNALS[i].toLowerCase()) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * 系统环境类问题允许被识别为 system，以便转交 system-troubleshooter。
 */
function hasSystemContext(text) {
  var systemSignals = ['node.js', 'node ', 'npm', 'powershell', '终端', '乱码', '编码', '路径', '命令找不到', '权限拒绝', '环境变量', 'chcp', 'utf-8'];
  for (var i = 0; i < systemSignals.length; i++) {
    if (text.indexOf(systemSignals[i].toLowerCase()) !== -1) {
      return true;
    }
  }
  return false;
}

function isGenericDiagnosticSignal(keyword) {
  for (var i = 0; i < router.GENERIC_DIAGNOSTIC_SIGNALS.length; i++) {
    if (keyword === router.GENERIC_DIAGNOSTIC_SIGNALS[i].toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * 模糊匹配执行型请求：执行动词 + 领域关键词组合
 * 例如 "帮我写一个日期比较公式" -> 动词"写" + 领域"公式" -> formula-generator
 * 例如 "配置一个采购入库同步库存的集成自动化" -> 动词"配置" + 领域"集成自动化" -> integration
 */
function fuzzyMatchExecution(text) {
  var executionVerbs = ['写', '创建', '生成', '配置', '同步', '设计', '制作', '搭建', '开发', '实现'];
  var domainToSkill = [
    { keywords: ['公式'], skill: 'formula-generator' },
    { keywords: ['代码', 'JS动作', '自动化脚本', '字段校验'], skill: 'code-expert' },
    { keywords: ['表单'], skill: 'form_creator' },
    { keywords: ['集成自动化', '逻辑流'], skill: 'integration' },
    { keywords: ['连接器'], skill: 'connector' },
    { keywords: ['业务规则', '业务关联规则'], skill: 'business-rule' },
    { keywords: ['报表', '图表'], skill: 'report' },
    { keywords: ['数据集', '视图表'], skill: 'dataset' },
    { keywords: ['原型', '预览界面'], skill: 'form-to-prototype' },
    { keywords: ['自定义页面', '展示页面'], skill: 'custom-page' }
  ];

  var hasVerb = false;
  for (var v = 0; v < executionVerbs.length; v++) {
    if (text.indexOf(executionVerbs[v]) !== -1) {
      hasVerb = true;
      break;
    }
  }
  if (!hasVerb) return null;

  // 排除诊断型信号
  var diagnosticSignals = ['为什么', '报错', '不生效', '什么原因', '哪里错', '对不对', '怎么解决', '不对', '失败', '异常'];
  for (var d = 0; d < diagnosticSignals.length; d++) {
    if (text.indexOf(diagnosticSignals[d]) !== -1) {
      return null; // 含诊断信号，不判为执行型
    }
  }

  for (var i = 0; i < domainToSkill.length; i++) {
    var domain = domainToSkill[i];
    for (var j = 0; j < domain.keywords.length; j++) {
      if (text.indexOf(domain.keywords[j]) !== -1) {
        return domain.skill + '(模糊匹配)';
      }
    }
  }
  return null;
}

/**
 * 根据执行型信号猜测目标 Skill
 */
function guessExecutionSkill(signal) {
  var signalMap = {
    '写公式': 'formula-generator', '生成公式': 'formula-generator', '创建公式': 'formula-generator',
    '写代码': 'code-expert', '生成代码': 'code-expert', '创建代码': 'code-expert',
    '创建表单': 'form_creator', '生成表单': 'form_creator', '设计表单': 'form_designer',
    '配置集成自动化': 'integration', '创建逻辑流': 'integration', '创建自动化': 'integration',
    '创建连接器': 'connector',
    '配置业务规则': 'business-rule', '创建业务规则': 'business-rule',
    '同步配置': 'config-sync', '同步规则': 'rule-sync', '同步Schema': 'get-schema',
    '生成测试数据': 'data-tester', '批量插入': 'data-tester',
    '清空数据': 'data-clean', '删除数据': 'data-clean',
    '创建报表': 'report', '创建数据集': 'dataset', '生成原型': 'form-to-prototype'
  };
  return signalMap[signal] || '对应执行型 Skill';
}

// ===== CLI 入口 =====
if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node diagnose.js "<问题描述>" [--json]');
    console.error('示例: node diagnose.js "集成自动化保存成功但不执行"');
    console.error('      node diagnose.js "这个公式有什么问题：IF(GT(NOW(), 计划完成时间), 1, 0)" --json');
    process.exit(1);
  }

  var useJson = args.indexOf('--json') !== -1;
  var inputText = args.filter(function(a) { return a !== '--json'; }).join(' ');

  var result = diagnoseText(inputText);

  if (useJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('=========================================');
    console.log('  yida-consultant 诊断结果');
    console.log('=========================================');
    console.log('');
    console.log('分类: ' + result.label + ' (' + result.category + ')');
    console.log('置信度: ' + (result.confidence * 100).toFixed(0) + '%');
    console.log('风险等级: ' + result.riskLevel);
    console.log('');
    console.log('知识源:');
    if (result.knowledgeSources.length === 0) {
      console.log('  (无)');
    } else {
      result.knowledgeSources.forEach(function(s) {
        console.log('  - ' + s);
      });
    }
    console.log('');
    console.log('验证方式: ' + result.validation.description);
    if (result.validation.commandHint) {
      console.log('  命令: ' + result.validation.commandHint);
    }
    console.log('');
    console.log('下一步: ' + result.nextAction);
    console.log('');
    console.log('=========================================');
  }
}

module.exports = {
  diagnoseText,
  getProjectRoot,
  hasYidaDiagnosticContext,
  hasSystemContext
};
