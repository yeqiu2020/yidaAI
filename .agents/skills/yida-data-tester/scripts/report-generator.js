/**
 * 宜搭测试报告生成器
 * 版本: 1.0.0
 * 创建时间: 2026-03-13
 * 
 * 功能：生成详细的测试报告（JSON和Markdown格式）
 */

const fs = require('fs');
const path = require('path');

/**
 * 报告生成器主类
 */
class ReportGenerator {
  constructor(config = {}) {
    this.config = {
      outputDir: config.outputDir || './test-reports',
      includeScreenshots: config.includeScreenshots !== false,
      includeRawData: config.includeRawData || false,
      ...config
    };
  }

  /**
   * 生成完整测试报告
   * @param {Object} params - 报告参数
   * @returns {Promise<Object>} 报告文件路径
   */
  async generate(params) {
    const {
      testName,
      testConfig,
      submitResults,
      validationResults,
      startTime,
      endTime
    } = params;

    // 确保输出目录存在
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // 生成时间戳
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportBaseName = `${testName}_${timestamp}`;

    // 生成JSON报告
    const jsonReportPath = path.join(this.config.outputDir, `${reportBaseName}.json`);
    const jsonReport = this.generateJsonReport({
      testName,
      testConfig,
      submitResults,
      validationResults,
      startTime,
      endTime
    });
    fs.writeFileSync(jsonReportPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

    // 生成Markdown报告
    const mdReportPath = path.join(this.config.outputDir, `${reportBaseName}.md`);
    const mdReport = this.generateMarkdownReport({
      testName,
      testConfig,
      submitResults,
      validationResults,
      startTime,
      endTime
    });
    fs.writeFileSync(mdReportPath, mdReport, 'utf-8');

    // 生成摘要报告
    const summaryPath = path.join(this.config.outputDir, `${reportBaseName}_summary.md`);
    const summary = this.generateSummary({
      testName,
      submitResults,
      validationResults,
      startTime,
      endTime
    });
    fs.writeFileSync(summaryPath, summary, 'utf-8');

    return {
      jsonReport: jsonReportPath,
      markdownReport: mdReportPath,
      summary: summaryPath,
      data: jsonReport
    };
  }

  /**
   * 生成JSON格式报告
   */
  generateJsonReport(params) {
    const {
      testName,
      testConfig,
      submitResults,
      validationResults,
      startTime,
      endTime
    } = params;

    const duration = endTime - startTime;

    // 统计信息
    const submitStats = this.calculateSubmitStats(submitResults);
    const validationStats = validationResults ? this.calculateValidationStats(validationResults) : null;

    return {
      meta: {
        testName,
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        duration: `${(duration / 1000).toFixed(2)}s`
      },
      config: testConfig,
      summary: {
        submit: submitStats,
        validation: validationStats
      },
      details: {
        submitResults: this.config.includeRawData ? submitResults : this.summarizeResults(submitResults),
        validationResults: validationResults ? (this.config.includeRawData ? validationResults.results : this.summarizeValidations(validationResults.results)) : null
      },
      issues: this.extractIssues(submitResults, validationResults?.results || [])
    };
  }

  /**
   * 生成Markdown格式报告
   */
  generateMarkdownReport(params) {
    const {
      testName,
      testConfig,
      submitResults,
      validationResults,
      startTime,
      endTime
    } = params;

    const duration = endTime - startTime;
    const submitStats = this.calculateSubmitStats(submitResults);
    const validationStats = validationResults ? this.calculateValidationStats(validationResults) : null;

    let md = `# 宜搭测试报告: ${testName}\n\n`;
    
    // 元信息
    md += `## 测试概览\n\n`;
    md += `- **测试名称**: ${testName}\n`;
    md += `- **开始时间**: ${new Date(startTime).toLocaleString()}\n`;
    md += `- **结束时间**: ${new Date(endTime).toLocaleString()}\n`;
    md += `- **执行时长**: ${(duration / 1000).toFixed(2)}秒\n`;
    md += `- **表单**: ${testConfig?.formName || 'N/A'} (${testConfig?.formUuid || 'N/A'})\n`;
    md += `- **提交模式**: ${testConfig?.submitMode || 'api'}\n\n`;

    // 统计摘要
    md += `## 统计摘要\n\n`;
    md += `### 数据提交\n\n`;
    md += `| 指标 | 数值 |\n`;
    md += `|------|------|\n`;
    md += `| 总计 | ${submitStats.total} |\n`;
    md += `| 成功 | ${submitStats.success} ✅ |\n`;
    md += `| 失败 | ${submitStats.failed} ❌ |\n`;
    md += `| 成功率 | ${submitStats.successRate} |\n\n`;

    if (validationStats) {
      md += `### 结果验证\n\n`;
      md += `| 指标 | 数值 |\n`;
      md += `|------|------|\n`;
      md += `| 总计 | ${validationStats.total} |\n`;
      md += `| 通过 | ${validationStats.passed} ✅ |\n`;
      md += `| 失败 | ${validationStats.failed} ❌ |\n`;
      md += `| 通过率 | ${validationStats.passRate} |\n\n`;
    }

    // 失败详情
    const failures = submitResults.filter(r => !r.success);
    if (failures.length > 0) {
      md += `## 提交失败详情\n\n`;
      md += `共 ${failures.length} 条数据提交失败\n\n`;
      
      failures.forEach((f, idx) => {
        md += `### 第 ${f.index + 1} 条\n\n`;
        md += `- **错误信息**: ${f.message}\n`;
        if (f.errorCode) {
          md += `- **错误码**: ${f.errorCode}\n`;
        }
        if (f.screenshot) {
          md += `- **截图**: ${f.screenshot}\n`;
        }
        md += `\n**提交数据**:\n\n`;
        md += '```json\n';
        md += JSON.stringify(f.data, null, 2);
        md += '\n```\n\n';
      });
    }

    // 验证失败详情
    if (validationResults) {
      const validationFailures = validationResults.results.filter(r => !r.overall);
      if (validationFailures.length > 0) {
        md += `## 验证失败详情\n\n`;
        md += `共 ${validationFailures.length} 条数据验证失败\n\n`;
        
        validationFailures.forEach(v => {
          md += `### 第 ${v.index + 1} 条 (${v.instanceId || 'N/A'})\n\n`;
          
          v.validations.forEach(val => {
            if (!val.passed) {
              md += `#### ${val.name}\n\n`;
              md += `- **状态**: ❌ 失败\n`;
              md += `- **信息**: ${val.message}\n\n`;
              
              if (val.details && val.details.length > 0) {
                md += `**详细问题**:\n\n`;
                val.details.forEach(d => {
                  md += `- ${d.message || d}\n`;
                  if (d.expected !== undefined && d.actual !== undefined) {
                    md += `  - 预期: ${JSON.stringify(d.expected)}\n`;
                    md += `  - 实际: ${JSON.stringify(d.actual)}\n`;
                  }
                });
                md += '\n';
              }
            }
          });
        });
      }
    }

    // 问题分析
    const issues = this.extractIssues(submitResults, validationResults?.results || []);
    if (issues.length > 0) {
      md += `## 问题分析\n\n`;
      
      // 按类型分组
      const groupedIssues = this.groupIssuesByType(issues);
      
      for (const [type, typeIssues] of Object.entries(groupedIssues)) {
        md += `### ${this.getIssueTypeName(type)} (${typeIssues.length}个)\n\n`;
        
        // 按消息分组统计
        const messageCounts = {};
        typeIssues.forEach(i => {
          messageCounts[i.message] = (messageCounts[i.message] || 0) + 1;
        });
        
        for (const [message, count] of Object.entries(messageCounts)) {
          md += `- **${message}**: ${count}次\n`;
        }
        md += '\n';
      }

      // 配置建议
      md += `## 配置优化建议\n\n`;
      md += this.generateSuggestions(issues);
    }

    // 原始数据附录
    if (this.config.includeRawData) {
      md += `## 附录: 原始数据\n\n`;
      md += '```json\n';
      md += JSON.stringify({
        submitResults,
        validationResults
      }, null, 2);
      md += '\n```\n';
    }

    return md;
  }

  /**
   * 生成摘要报告
   */
  generateSummary(params) {
    const {
      testName,
      submitResults,
      validationResults,
      startTime,
      endTime
    } = params;

    const duration = endTime - startTime;
    const submitStats = this.calculateSubmitStats(submitResults);
    const validationStats = validationResults ? this.calculateValidationStats(validationResults) : null;

    let md = `# 测试摘要: ${testName}\n\n`;
    md += `**执行时间**: ${new Date(startTime).toLocaleString()}\n`;
    md += `**执行时长**: ${(duration / 1000).toFixed(2)}秒\n\n`;

    md += `## 结果概览\n\n`;
    md += `| 阶段 | 总计 | 成功/通过 | 失败 | 成功率 |\n`;
    md += `|------|------|-----------|------|--------|\n`;
    md += `| 数据提交 | ${submitStats.total} | ${submitStats.success} | ${submitStats.failed} | ${submitStats.successRate} |\n`;
    if (validationStats) {
      md += `| 结果验证 | ${validationStats.total} | ${validationStats.passed} | ${validationStats.failed} | ${validationStats.passRate} |\n`;
    }
    md += '\n';

    // 快速问题列表
    const issues = this.extractIssues(submitResults, validationResults?.results || []);
    if (issues.length > 0) {
      md += `## 发现的问题\n\n`;
      
      const groupedIssues = this.groupIssuesByType(issues);
      for (const [type, typeIssues] of Object.entries(groupedIssues).slice(0, 3)) {
        md += `### ${this.getIssueTypeName(type)}\n\n`;
        const messageCounts = {};
        typeIssues.forEach(i => {
          messageCounts[i.message] = (messageCounts[i.message] || 0) + 1;
        });
        
        Object.entries(messageCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([message, count]) => {
            md += `- ${message} (${count}次)\n`;
          });
        md += '\n';
      }
    } else {
      md += `✅ 所有测试通过，未发现明显问题\n`;
    }

    return md;
  }

  // ============ 辅助方法 ============

  calculateSubmitStats(results) {
    const total = results.length;
    const success = results.filter(r => r.success).length;
    const failed = total - success;
    
    return {
      total,
      success,
      failed,
      successRate: total > 0 ? ((success / total) * 100).toFixed(2) + '%' : '0%'
    };
  }

  calculateValidationStats(validationResults) {
    const results = validationResults.results || [];
    const total = results.length;
    const passed = results.filter(r => r.overall).length;
    const failed = total - passed;
    
    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? ((passed / total) * 100).toFixed(2) + '%' : '0%'
    };
  }

  summarizeResults(results) {
    return results.map(r => ({
      index: r.index,
      success: r.success,
      message: r.message,
      instanceId: r.instanceId || r.formInstId
    }));
  }

  summarizeValidations(validations) {
    return validations.map(v => ({
      index: v.index,
      instanceId: v.instanceId,
      overall: v.overall,
      message: v.message,
      failedValidations: v.validations.filter(val => !val.passed).map(val => val.name)
    }));
  }

  extractIssues(submitResults, validationResults) {
    const issues = [];

    // 提取提交问题
    submitResults.filter(r => !r.success).forEach(r => {
      issues.push({
        type: 'submit',
        index: r.index,
        message: r.message,
        errorCode: r.errorCode
      });
    });

    // 提取验证问题
    validationResults.forEach(v => {
      if (!v.overall && v.validations) {
        v.validations.filter(val => !val.passed).forEach(val => {
          issues.push({
            type: val.type,
            index: v.index,
            instanceId: v.instanceId,
            message: val.message,
            details: val.details
          });
        });
      }
    });

    return issues;
  }

  groupIssuesByType(issues) {
    const grouped = {};
    issues.forEach(i => {
      const type = i.type || 'unknown';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(i);
    });
    return grouped;
  }

  getIssueTypeName(type) {
    const names = {
      'submit': '提交错误',
      'dataIntegrity': '数据完整性问题',
      'formula': '公式计算问题',
      'validation': '校验规则问题',
      'process': '流程状态问题',
      'unknown': '其他问题'
    };
    return names[type] || type;
  }

  generateSuggestions(issues) {
    const suggestions = [];
    const groupedIssues = this.groupIssuesByType(issues);

    // 根据问题类型生成建议
    if (groupedIssues['submit']) {
      const submitErrors = groupedIssues['submit'];
      const authErrors = submitErrors.filter(i => 
        i.message.includes('权限') || i.message.includes('未登录') || i.errorCode === '401'
      );
      if (authErrors.length > 0) {
        suggestions.push(`**权限问题**: 检测到 ${authErrors.length} 次权限相关错误。请检查：`);
        suggestions.push('- API密钥是否正确');
        suggestions.push('- 账号是否有表单提交权限');
        suggestions.push('- 表单是否已发布');
        suggestions.push('');
      }

      const validationErrors = submitErrors.filter(i => 
        i.message.includes('校验') || i.message.includes('必填') || i.message.includes('格式')
      );
      if (validationErrors.length > 0) {
        suggestions.push(`**数据校验问题**: 检测到 ${validationErrors.length} 次校验错误。请检查：`);
        suggestions.push('- 测试数据是否符合字段要求');
        suggestions.push('- 必填字段是否都有值');
        suggestions.push('- 数据格式是否正确（如日期、手机号等）');
        suggestions.push('');
      }
    }

    if (groupedIssues['formula']) {
      suggestions.push(`**公式计算问题**: 检测到公式计算错误。请检查：`);
      suggestions.push('- 公式表达式是否正确');
      suggestions.push('- 引用的字段是否存在');
      suggestions.push('- 公式中是否有除以零等异常情况');
      suggestions.push('');
    }

    if (groupedIssues['dataIntegrity']) {
      suggestions.push(`**数据完整性问题**: 检测到数据保存不完整。请检查：`);
      suggestions.push('- 表单字段ID是否正确');
      suggestions.push('- 特殊字段（如关联表单、子表单）的数据格式');
      suggestions.push('- 宜搭平台是否有字段映射问题');
      suggestions.push('');
    }

    return suggestions.length > 0 ? suggestions.join('\n') : '暂无特定建议。';
  }
}

// ============ 命令行接口 ============

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('用法: node report-generator.js <提交结果文件> <验证结果文件> [配置文件]');
    console.log('示例: node report-generator.js ./submit-result.json ./validation-result.json ./test-config.json');
    process.exit(1);
  }

  const submitResultPath = args[0];
  const validationResultPath = args[1];
  const configPath = args[2];

  try {
    // 读取提交结果
    const submitContent = fs.readFileSync(submitResultPath, 'utf-8');
    const submitData = JSON.parse(submitContent);

    // 读取验证结果
    let validationData = null;
    if (fs.existsSync(validationResultPath)) {
      const validationContent = fs.readFileSync(validationResultPath, 'utf-8');
      validationData = JSON.parse(validationContent);
    }

    // 读取配置
    let testConfig = {};
    if (configPath && fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      testConfig = JSON.parse(configContent);
    }

    // 创建报告生成器
    const generator = new ReportGenerator({
      outputDir: './test-reports',
      includeRawData: false
    });

    console.log('正在生成测试报告...');

    // 生成报告
    const report = await generator.generate({
      testName: testConfig.testName || '宜搭表单测试',
      testConfig,
      submitResults: submitData.results || submitData,
      validationResults: validationData,
      startTime: Date.now() - 60000, // 模拟开始时间
      endTime: Date.now()
    });

    console.log('\n✅ 报告生成成功！');
    console.log(`📄 JSON报告: ${report.jsonReport}`);
    console.log(`📄 Markdown报告: ${report.markdownReport}`);
    console.log(`📄 摘要报告: ${report.summary}`);

  } catch (error) {
    console.error('❌ 生成报告失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

// 导出模块
module.exports = ReportGenerator;

/**
 * 版本历史：
 * v1.0.0 (2026-03-13): 初始版本，支持JSON和Markdown格式的详细测试报告生成
 */