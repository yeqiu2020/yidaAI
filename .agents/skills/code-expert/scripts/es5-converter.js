/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * ES5语法转换工具
 * 版本号: v1.0.0
 * 创建时间: 2026-02-21
 * 
 * 功能描述:
 * 将ES6+语法自动转换为ES5语法，作为AI生成代码的兜底保障
 * 支持: 模板字符串、箭头函数、const/let、可选链、解构赋值、展开运算符
 * 
 * 使用方法:
 * 1. 命令行: node es5-converter.js <输入文件> [-o 输出文件]
 * 2. 模块引入: const { convertToES5 } = require('./es5-converter');
 */

const fs = require('fs');
const path = require('path');

// ===== 转换规则配置 =====
const CONVERSION_RULES = {
  // 模板字符串转换
  templateString: {
    name: '模板字符串',
    enabled: true
  },
  // 箭头函数转换
  arrowFunction: {
    name: '箭头函数',
    enabled: true
  },
  // const/let声明转换
  declaration: {
    name: 'const/let声明',
    enabled: true
  },
  // 可选链操作符转换
  optionalChaining: {
    name: '可选链操作符',
    enabled: true
  },
  // 解构赋值转换
  destructuring: {
    name: '解构赋值',
    enabled: true
  },
  // 展开运算符转换
  spreadOperator: {
    name: '展开运算符',
    enabled: true
  }
};

// ===== ES5转换器类 =====
class ES5Converter {
  constructor(options) {
    this.options = options || {};
    this.conversions = [];
  }

  /**
   * 转换代码为ES5语法
   * @param {string} code - 源代码
   * @returns {Object} 转换结果 { code, conversions, hasChanges }
   */
  convert(code) {
    this.conversions = [];
    var result = code;

    // 按顺序执行各项转换
    if (CONVERSION_RULES.templateString.enabled) {
      result = this.convertTemplateStrings(result);
    }

    if (CONVERSION_RULES.arrowFunction.enabled) {
      result = this.convertArrowFunctions(result);
    }

    if (CONVERSION_RULES.declaration.enabled) {
      result = this.convertDeclarations(result);
    }

    if (CONVERSION_RULES.optionalChaining.enabled) {
      result = this.convertOptionalChaining(result);
    }

    if (CONVERSION_RULES.destructuring.enabled) {
      result = this.convertDestructuring(result);
    }

    if (CONVERSION_RULES.spreadOperator.enabled) {
      result = this.convertSpreadOperator(result);
    }

    return {
      code: result,
      conversions: this.conversions,
      hasChanges: this.conversions.length > 0
    };
  }

  /**
   * 转换模板字符串为字符串拼接
   * `Hello ${name}!` -> 'Hello ' + name + '!'
   */
  convertTemplateStrings(code) {
    var result = code;
    var that = this;

    // 处理包含变量的模板字符串
    var templateWithVarPattern = /`([^`]*)\$\{([^}]+)\}([^`]*)`/g;
    var hasMatch = templateWithVarPattern.test(result);
    
    if (hasMatch) {
      result = result.replace(/`([^`]*)\$\{([^}]+)\}([^`]*)`/g, function(match, before, expr, after) {
        that.conversions.push({
          type: 'templateString',
          original: match,
          description: '模板字符串转换为字符串拼接'
        });

        var parts = [];
        if (before) parts.push("'" + before + "'");
        parts.push(expr.trim());
        if (after) parts.push("'" + after + "'");
        return parts.join(' + ');
      });
    }

    // 处理纯字符串模板（无变量）
    var pureTemplatePattern = /`([^`$]*)`/g;
    if (pureTemplatePattern.test(result)) {
      result = result.replace(/`([^`$]*)`/g, function(match, content) {
        // 处理多行字符串
        if (content.indexOf('\n') > -1) {
          that.conversions.push({
            type: 'templateString',
            original: match.substring(0, 30) + '...',
            description: '多行模板字符串转换'
          });
          // 转换换行符
          content = content.replace(/\n/g, '\\n');
        }
        return "'" + content + "'";
      });
    }

    return result;
  }

  /**
   * 转换箭头函数为传统函数
   * (a, b) => { ... } -> function(a, b) { ... }
   * a => expr -> function(a) { return expr; }
   */
  convertArrowFunctions(code) {
    var result = code;
    var that = this;

    // 转换: (a, b) => { ... }
    var arrowWithBracePattern = /\(([^)]*)\)\s*=>\s*\{/g;
    if (arrowWithBracePattern.test(result)) {
      result = result.replace(/\(([^)]*)\)\s*=>\s*\{/g, function(match, params) {
        that.conversions.push({
          type: 'arrowFunction',
          original: match,
          description: '箭头函数转换为function'
        });
        return 'function(' + params + ') {';
      });
    }

    // 转换: a => { ... } (单参数带花括号)
    var singleParamArrowPattern = /(\s|,|\(|=)(\w+)\s*=>\s*\{/g;
    if (singleParamArrowPattern.test(result)) {
      result = result.replace(/(\s|,|\(|=)(\w+)\s*=>\s*\{/g, function(match, prefix, param) {
        that.conversions.push({
          type: 'arrowFunction',
          original: param + ' => {',
          description: '单参数箭头函数转换'
        });
        return prefix + 'function(' + param + ') {';
      });
    }

    // 转换: (a, b) => expr (无花括号，需要return)
    var arrowExprPattern = /\(([^)]*)\)\s*=>\s*([^{;\n][^;\n]*)/g;
    if (arrowExprPattern.test(result)) {
      result = result.replace(/\(([^)]*)\)\s*=>\s*([^{;\n][^;\n]*)/g, function(match, params, expr) {
        // 避免重复转换已处理的
        if (expr.trim().startsWith('function')) return match;
        
        that.conversions.push({
          type: 'arrowFunction',
          original: match.substring(0, 40),
          description: '箭头函数表达式转换'
        });
        return 'function(' + params + ') { return ' + expr.trim() + '; }';
      });
    }

    return result;
  }

  /**
   * 转换const/let为var
   */
  convertDeclarations(code) {
    var result = code;
    var that = this;

    // 转换const
    if (/\bconst\b/.test(result)) {
      var constCount = (result.match(/\bconst\b/g) || []).length;
      result = result.replace(/\bconst\b/g, 'var');
      this.conversions.push({
        type: 'declaration',
        original: 'const',
        description: 'const转换为var (' + constCount + '处)'
      });
    }

    // 转换let
    if (/\blet\b/.test(result)) {
      var letCount = (result.match(/\blet\b/g) || []).length;
      result = result.replace(/\blet\b/g, 'var');
      this.conversions.push({
        type: 'declaration',
        original: 'let',
        description: 'let转换为var (' + letCount + '处)'
      });
    }

    return result;
  }

  /**
   * 转换可选链操作符
   * obj?.prop -> (obj && obj.prop)
   * obj?.method() -> (obj && obj.method())
   */
  convertOptionalChaining(code) {
    var result = code;
    var that = this;

    // 转换: obj?.prop
    var optionalPropPattern = /(\w+)\?\./g;
    if (optionalPropPattern.test(result)) {
      result = result.replace(/(\w+)\?\.(\w+)(\(\))?/g, function(match, obj, prop, call) {
        that.conversions.push({
          type: 'optionalChaining',
          original: match,
          description: '可选链转换为&&判断'
        });
        if (call) {
          return '(' + obj + ' && ' + obj + '.' + prop + '())';
        }
        return '(' + obj + ' && ' + obj + '.' + prop + ')';
      });
    }

    return result;
  }

  /**
   * 转换解构赋值
   * var { a, b } = obj; -> var a = obj.a; var b = obj.b;
   */
  convertDestructuring(code) {
    var result = code;
    var that = this;

    // 对象解构
    var objDestructPattern = /(?:var|const|let)\s*\{\s*([^}]+)\s*\}\s*=\s*(\w+);/g;
    if (objDestructPattern.test(result)) {
      result = result.replace(/(?:var|const|let)\s*\{\s*([^}]+)\s*\}\s*=\s*(\w+);/g, function(match, vars, obj) {
        that.conversions.push({
          type: 'destructuring',
          original: match.substring(0, 40),
          description: '对象解构转换为属性访问'
        });

        var varList = vars.split(',');
        var assignments = [];
        for (var i = 0; i < varList.length; i++) {
          var v = varList[i].trim();
          if (v) {
            // 处理重命名: { a: b } -> var b = obj.a;
            if (v.indexOf(':') > -1) {
              var parts = v.split(':');
              var original = parts[0].trim();
              var renamed = parts[1].trim();
              assignments.push('var ' + renamed + ' = ' + obj + '.' + original + ';');
            } else {
              assignments.push('var ' + v + ' = ' + obj + '.' + v + ';');
            }
          }
        }
        return assignments.join('\n');
      });
    }

    // 数组解构
    var arrDestructPattern = /(?:var|const|let)\s*\[\s*([^\]]+)\s*\]\s*=\s*(\w+);/g;
    if (arrDestructPattern.test(result)) {
      result = result.replace(/(?:var|const|let)\s*\[\s*([^\]]+)\s*\]\s*=\s*(\w+);/g, function(match, vars, arr) {
        that.conversions.push({
          type: 'destructuring',
          original: match.substring(0, 40),
          description: '数组解构转换为索引访问'
        });

        var varList = vars.split(',');
        var assignments = [];
        for (var i = 0; i < varList.length; i++) {
          var v = varList[i].trim();
          if (v) {
            assignments.push('var ' + v + ' = ' + arr + '[' + i + '];');
          }
        }
        return assignments.join('\n');
      });
    }

    return result;
  }

  /**
   * 转换展开运算符
   * [...arr] -> arr.slice()
   * {...obj} -> Object.assign({}, obj)
   */
  convertSpreadOperator(code) {
    var result = code;
    var that = this;

    // 数组展开: [...arr] -> arr.slice()
    var arraySpreadPattern = /\[\s*\.\.\.(\w+)\s*\]/g;
    if (arraySpreadPattern.test(result)) {
      result = result.replace(/\[\s*\.\.\.(\w+)\s*\]/g, function(match, arr) {
        that.conversions.push({
          type: 'spreadOperator',
          original: match,
          description: '数组展开转换为slice()'
        });
        return arr + '.slice()';
      });
    }

    // 对象展开: {...obj} -> Object.assign({}, obj)
    var objectSpreadPattern = /\{\s*\.\.\.(\w+)\s*\}/g;
    if (objectSpreadPattern.test(result)) {
      result = result.replace(/\{\s*\.\.\.(\w+)\s*\}/g, function(match, obj) {
        that.conversions.push({
          type: 'spreadOperator',
          original: match,
          description: '对象展开转换为Object.assign'
        });
        return 'Object.assign({}, ' + obj + ')';
      });
    }

    return result;
  }

  /**
   * 生成转换报告
   */
  generateReport() {
    if (this.conversions.length === 0) {
      return '✅ 代码已是ES5语法，无需转换';
    }

    var lines = [
      '========================================',
      'ES5语法转换报告',
      '========================================',
      '',
      '【转换统计】',
      '共执行 ' + this.conversions.length + ' 处转换',
      ''
    ];

    // 按类型分组统计
    var byType = {};
    for (var i = 0; i < this.conversions.length; i++) {
      var c = this.conversions[i];
      if (!byType[c.type]) {
        byType[c.type] = [];
      }
      byType[c.type].push(c);
    }

    lines.push('【转换详情】');
    for (var type in byType) {
      if (byType.hasOwnProperty(type)) {
        var items = byType[type];
        var typeName = CONVERSION_RULES[type] ? CONVERSION_RULES[type].name : type;
        lines.push('');
        lines.push('▸ ' + typeName + ' (' + items.length + '处)');
        for (var i = 0; i < items.length && i < 5; i++) {
          lines.push('  - ' + items[i].description);
        }
        if (items.length > 5) {
          lines.push('  - ...还有 ' + (items.length - 5) + ' 处');
        }
      }
    }

    lines.push('');
    lines.push('========================================');
    lines.push('转换完成');
    lines.push('========================================');

    return lines.join('\n');
  }
}

// ===== 便捷函数 =====

/**
 * 转换代码为ES5
 * @param {string} code - 源代码
 * @returns {Object} { code, conversions, hasChanges }
 */
function convertToES5(code) {
  var converter = new ES5Converter();
  return converter.convert(code);
}

/**
 * 转换文件为ES5
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径（可选）
 * @returns {Object} 转换结果
 */
function convertFile(inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error('文件不存在: ' + inputPath);
  }

  var code = fs.readFileSync(inputPath, 'utf-8');
  var converter = new ES5Converter();
  var result = converter.convert(code);

  if (outputPath) {
    fs.writeFileSync(outputPath, result.code, 'utf-8');
  }

  result.report = converter.generateReport();
  return result;
}

// ===== 命令行接口 =====
function main() {
  var args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('ES5语法转换工具 v1.0.0');
    console.log('');
    console.log('用法: node es5-converter.js <输入文件> [-o 输出文件]');
    console.log('');
    console.log('示例:');
    console.log('  node es5-converter.js code.js              # 转换并输出到控制台');
    console.log('  node es5-converter.js code.js -o out.js    # 转换并保存到文件');
    process.exit(1);
  }

  var inputFile = args[0];
  var outputFile = null;

  // 解析参数
  for (var i = 1; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') {
      outputFile = args[i + 1];
      i++;
    }
  }

  try {
    console.log('正在转换文件: ' + inputFile);
    console.log('');

    var result = convertFile(inputFile, outputFile);
    console.log(result.report);

    if (outputFile) {
      console.log('');
      console.log('✓ 转换后的代码已保存到: ' + outputFile);
    } else if (result.hasChanges) {
      console.log('');
      console.log('========== 转换后的代码 ==========');
      console.log(result.code);
      console.log('==================================');
    }

    process.exit(0);
  } catch (error) {
    console.error('转换失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

// 导出模块
module.exports = {
  ES5Converter,
  convertToES5,
  convertFile,
  CONVERSION_RULES
};
