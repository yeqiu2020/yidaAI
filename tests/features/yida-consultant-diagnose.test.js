/**
 * yida-consultant-diagnose.test.js
 * 诊断路由脚本测试
 */

var assert = require('assert');
var diagnose = require('../../.agents/skills/yida-consultant/scripts/diagnose.js');
var diagnoseText = diagnose.diagnoseText;

describe('yida-consultant diagnose.js', function() {

  // 测试样例 1: 公式诊断
  it('样例1: "这个公式有什么问题：IF(GT(NOW(), 计划完成时间), 1, 0)" 应分类为 formula', function() {
    var result = diagnoseText('这个公式有什么问题：IF(GT(NOW(), 计划完成时间), 1, 0)');
    assert.strictEqual(result.category, 'formula');
    assert.ok(result.confidence >= 0.5);
    assert.strictEqual(result.isExecution, false);
  });

  // 测试样例 2: 执行型公式请求
  it('样例2: "帮我写一个日期比较公式" 应识别为执行型，不接管', function() {
    var result = diagnoseText('帮我写一个日期比较公式');
    assert.strictEqual(result.isExecution, true);
    assert.strictEqual(result.suggestedSkill, 'formula-generator');
  });

  // 测试样例 3: 集成自动化诊断
  it('样例3: "集成自动化保存成功但不执行是什么原因" 应分类为 integration', function() {
    var result = diagnoseText('集成自动化保存成功但不执行是什么原因');
    assert.strictEqual(result.category, 'integration');
    assert.ok(result.confidence >= 0.5);
    assert.strictEqual(result.isExecution, false);
  });

  // 测试样例 4: 执行型集成自动化请求
  it('样例4: "配置一个采购入库同步库存的集成自动化" 应识别为执行型，不接管', function() {
    var result = diagnoseText('配置一个采购入库同步库存的集成自动化');
    assert.strictEqual(result.isExecution, true);
    assert.strictEqual(result.suggestedSkill, 'integration');
  });

  // 测试样例 5: 系统环境问题
  it('样例5: "PowerShell 里 node 命令找不到" 应分类为 system', function() {
    var result = diagnoseText('PowerShell 里 node 命令找不到');
    assert.strictEqual(result.category, 'system');
  });

  // 测试样例 6: 连接器诊断
  it('样例6: "连接器调用失败，鉴权报错是什么原因" 应分类为 connector', function() {
    var result = diagnoseText('连接器调用失败，鉴权报错是什么原因');
    assert.strictEqual(result.category, 'connector');
    assert.ok(result.confidence >= 0.5);
    assert.strictEqual(result.isExecution, false);
  });

  // 边界测试: 空输入
  it('边界测试: 空输入应返回 unknown', function() {
    var result = diagnoseText('');
    assert.strictEqual(result.category, 'unknown');
    assert.strictEqual(result.confidence, 0);
  });

  // 边界测试: 纯空格
  it('边界测试: 纯空格应返回 unknown', function() {
    var result = diagnoseText('   ');
    assert.strictEqual(result.category, 'unknown');
  });

  // 边界测试: 无匹配
  it('边界测试: 无关输入应返回 unknown', function() {
    var result = diagnoseText('今天天气不错');
    assert.strictEqual(result.category, 'unknown');
  });

  // 触发门禁测试: 裸诊断词不能误触发
  it('触发门禁: "为什么不生效" 缺少宜搭上下文，应返回 unknown', function() {
    var result = diagnoseText('为什么不生效');
    assert.strictEqual(result.category, 'unknown');
    assert.strictEqual(result.isExecution, false);
  });

  it('触发门禁: "报错什么原因" 缺少宜搭上下文，应返回 unknown', function() {
    var result = diagnoseText('报错什么原因');
    assert.strictEqual(result.category, 'unknown');
  });

  it('触发门禁: "这个功能为什么不生效" 缺少宜搭上下文，应返回 unknown', function() {
    var result = diagnoseText('这个功能为什么不生效');
    assert.strictEqual(result.category, 'unknown');
  });

  // 知识源测试: formula 应包含 FAQ 路径
  it('知识源测试: formula 分类应包含 faq-formula.md', function() {
    var result = diagnoseText('这个公式有什么问题：IF(GT(NOW(), 计划完成时间), 1, 0)');
    assert.ok(result.knowledgeSources.some(function(s) {
      return s.indexOf('faq-formula.md') !== -1;
    }));
  });

  // 知识源测试: integration 应包含硬规则路径
  it('知识源测试: integration 分类应包含集成自动化硬规则.md', function() {
    var result = diagnoseText('集成自动化保存成功但不执行');
    assert.ok(result.knowledgeSources.some(function(s) {
      return s.indexOf('集成自动化硬规则.md') !== -1;
    }));
  });

  // 执行型不接管测试: 创建表单
  it('执行型测试: "创建表单" 应识别为执行型', function() {
    var result = diagnoseText('创建表单');
    assert.strictEqual(result.isExecution, true);
    assert.strictEqual(result.suggestedSkill, 'form_creator');
  });

  // 执行型不接管测试: 生成测试数据
  it('执行型测试: "生成测试数据" 应识别为执行型', function() {
    var result = diagnoseText('在表单中生成测试数据');
    assert.strictEqual(result.isExecution, true);
    assert.strictEqual(result.suggestedSkill, 'data-tester');
  });

});
