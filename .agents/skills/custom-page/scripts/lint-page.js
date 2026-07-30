/**
 * 自定义页面代码 lint 工具
 * 
 * 从 SKILL.md 致命规则自动提取检查项，对页面代码进行静态分析。
 * 
 * 用法：
 *   单独运行：node lint-page.js <代码文件路径>
 *   嵌入发布：由 publish-page.js 自动调用
 * 
 * 规则级别：
 *   - FATAL：致命错误，阻断发布
 *   - WARN：警告，不阻断发布
 * 
 * 退出码：
 *   0 - 无致命错误（可能有警告）
 *   1 - 有致命错误
 */

var fs = require('fs');
var path = require('path');

// ── 规则定义 ──────────────────────────────────────────

var FATAL_RULES = [
  {
    id: 'F01',
    name: 'export function 定义方法',
    severity: 'FATAL',
    check: function(code) {
      // 检查是否有非 export function 定义的需要 this 的方法
      var issues = [];
      // 检查是否有 const xxx = () => {} 形式定义的方法（可能需要 this）
      var arrowAssign = /(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g;
      var match;
      while ((match = arrowAssign.exec(code)) !== null) {
        // 如果这个箭头函数在代码中被 this. 调用，则是问题
        var funcName = match[1];
        var thisCallRegex = new RegExp('this\\.' + funcName + '\\b');
        if (thisCallRegex.test(code)) {
          issues.push({
            line: getLineNumber(code, match.index),
            message: '方法 "' + funcName + '" 使用箭头函数赋值定义，但被 this. 调用。必须使用 export function 定义。',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'F02',
    name: '事件绑定箭头函数包裹',
    severity: 'FATAL',
    check: function(code) {
      var issues = [];
      // 检查 onClick={this.xxx} 形式
      var directBind = /on(?:Click|Change|Submit|Focus|Blur|MouseEnter|MouseLeave)\s*=\s*\{this\.(\w+)\}/g;
      var match;
      while ((match = directBind.exec(code)) !== null) {
        issues.push({
          line: getLineNumber(code, match.index),
          message: '事件绑定 "' + match[0] + '" 直接使用 this. 方法引用，必须用箭头函数包裹：(e) => { self.' + match[1] + '(e) }',
        });
      }
      // 检查 .bind(this) 形式
      var bindThis = /\.bind\s*\(\s*this\s*\)/g;
      while ((match = bindThis.exec(code)) !== null) {
        issues.push({
          line: getLineNumber(code, match.index),
          message: '事件绑定使用了 .bind(this)，必须改为箭头函数包裹',
        });
      }
      return issues;
    },
  },
  {
    id: 'F03',
    name: '.map/.filter 回调箭头函数',
    severity: 'FATAL',
    check: function(code) {
      var issues = [];
      // 检查 .map(function(...) 中使用 this 的情况
      var mapFunction = /\.(?:map|filter|forEach|reduce|find|some|every)\s*\(\s*function\s*\(/g;
      var match;
      while ((match = mapFunction.exec(code)) !== null) {
        // 检查回调内是否使用了 this
        var afterMatch = code.substring(match.index, match.index + 500);
        if (afterMatch.indexOf('this.') >= 0 && afterMatch.indexOf('var self') < 0) {
          issues.push({
            line: getLineNumber(code, match.index),
            message: '.map/.filter 使用普通函数回调且内部引用 this，应改用箭头函数：.map((item) => ...)',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'F05',
    name: '禁止 import/require',
    severity: 'FATAL',
    check: function(code) {
      var issues = [];
      // 检查 import 语句（排除注释中的）
      var importRegex = /^\s*import\s+/gm;
      var match;
      while ((match = importRegex.exec(code)) !== null) {
        issues.push({
          line: getLineNumber(code, match.index),
          message: '使用了 import 语法，宜搭 native 页面禁止 import/require，第三方库通过 this.utils.loadScript 加载',
        });
      }
      // 检查 require 语句
      var requireRegex = /^\s*(?:var|const|let)\s+\w+\s*=\s*require\s*\(/gm;
      while ((match = requireRegex.exec(code)) !== null) {
        // 排除 publish 脚本自身的 require
        if (code.indexOf('__YIDA_PAGE_SOURCE__') < 0) {
          issues.push({
            line: getLineNumber(code, match.index),
            message: '使用了 require()，宜搭 native 页面禁止 import/require',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'F09',
    name: '禁止 ES6 计算属性名',
    severity: 'FATAL',
    check: function(code) {
      var issues = [];
      // 检查 { [key]: value } 形式
      var computedProp = /\{\s*\[[\w.]+\]\s*:/g;
      var match;
      while ((match = computedProp.exec(code)) !== null) {
        // 排除 JSX 表达式中的数组访问
        var context = code.substring(Math.max(0, match.index - 20), match.index + 50);
        if (context.indexOf('=>') < 0 && context.indexOf('return') < 0) {
          issues.push({
            line: getLineNumber(code, match.index),
            message: '使用了 ES6 计算属性名 { [key]: value }，宜搭运行时会静默白屏。改用 var obj = {}; obj[key] = value;',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'F10',
    name: '.then() 回调中禁止 padStart/padEnd',
    severity: 'FATAL',
    check: function(code) {
      var issues = [];
      // 检查 .then( 回调中的 padStart/padEnd
      var thenRegex = /\.then\s*\(\s*function\s*\([^)]*\)\s*\{/g;
      var match;
      while ((match = thenRegex.exec(code)) !== null) {
        // 提取回调体（粗略提取到下一个 .catch 或 ; ）
        var callbackStart = match.index + match[0].length;
        var callbackEnd = code.indexOf('.catch', callbackStart);
        if (callbackEnd < 0) callbackEnd = code.indexOf('});', callbackStart);
        if (callbackEnd < 0) callbackEnd = callbackStart + 1000;
        var callbackBody = code.substring(callbackStart, callbackEnd);
        
        if (callbackBody.indexOf('padStart') >= 0) {
          issues.push({
            line: getLineNumber(code, callbackStart),
            message: '.then() 回调中使用了 padStart()，会导致静默中断。改用三元运算符：month < 10 ? "0" + month : "" + month',
          });
        }
        if (callbackBody.indexOf('padEnd') >= 0) {
          issues.push({
            line: getLineNumber(code, callbackStart),
            message: '.then() 回调中使用了 padEnd()，会导致静默中断',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'F08',
    name: 'renderJsx 必须 render',
    severity: 'FATAL',
    check: function(code) {
      var issues = [];
      // 检查是否有 renderJsx 函数
      if (code.indexOf('renderJsx') < 0) {
        issues.push({
          line: 0,
          message: '未找到 renderJsx 函数，页面必须有页面入口',
        });
      }
      // 检查是否有 timestamp 渲染（粗略检查）
      if (code.indexOf('renderJsx') >= 0 && code.indexOf('timestamp') < 0) {
        issues.push({
          line: 0,
          message: 'renderJsx 中未检测到 timestamp 渲染，每个 return 分支必须渲染 <div style={{ display: "none" }}>{timestamp}</div>',
        });
      }
      return issues;
    },
  },
];

var WARN_RULES = [
  {
    id: 'W01',
    name: 'API 调用缺少 .catch()',
    severity: 'WARN',
    check: function(code) {
      var issues = [];
      // 检查 this.utils.yida 调用是否有 .catch
      var yidaCall = /this\.utils\.yida\.\w+\s*\(/g;
      var match;
      while ((match = yidaCall.exec(code)) !== null) {
        // 向后查找 200 字符内是否有 .catch
        var afterCall = code.substring(match.index, match.index + 500);
        if (afterCall.indexOf('.catch') < 0 && afterCall.indexOf('.then') >= 0) {
          // 有 .then 但没有 .catch
          issues.push({
            line: getLineNumber(code, match.index),
            message: 'API 调用有 .then() 但缺少 .catch()，异常会导致未处理的 Promise rejection',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'W02',
    name: 'didUnmount 缺少定时器清理',
    severity: 'WARN',
    check: function(code) {
      var issues = [];
      // 检查是否有 setInterval/setTimeout 但 didUnmount 中没有清理
      if (code.indexOf('setInterval') >= 0 || code.indexOf('setTimeout') >= 0) {
        var didUnmountIdx = code.indexOf('didUnmount');
        if (didUnmountIdx < 0) {
          issues.push({
            line: 0,
            message: '代码中有 setInterval/setTimeout 但未定义 didUnmount 函数清理定时器',
          });
        } else {
          var afterDidUnmount = code.substring(didUnmountIdx, didUnmountIdx + 500);
          if (afterDidUnmount.indexOf('clearInterval') < 0 && afterDidUnmount.indexOf('clearTimeout') < 0) {
            issues.push({
              line: getLineNumber(code, didUnmountIdx),
              message: 'didUnmount 中未检测到 clearInterval/clearTimeout，可能存在定时器泄漏',
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'W03',
    name: 'pageSize 可能超限',
    severity: 'WARN',
    check: function(code) {
      var issues = [];
      var pageSizeRegex = /pageSize\s*:\s*(\d+)/g;
      var match;
      while ((match = pageSizeRegex.exec(code)) !== null) {
        var size = parseInt(match[1], 10);
        if (size > 100) {
          issues.push({
            line: getLineNumber(code, match.index),
            message: 'pageSize=' + size + ' 超过最大值 100，宜搭分页接口最大支持 100',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'W04',
    name: '输入框可能使用了受控模式',
    severity: 'WARN',
    check: function(code) {
      var issues = [];
      // 检查 <input value={ 而非 defaultValue={
      var inputRegex = /<input[^>]*\bvalue\s*=\s*\{/g;
      var match;
      while ((match = inputRegex.exec(code)) !== null) {
        issues.push({
          line: getLineNumber(code, match.index),
          message: '<input> 使用了 value={...} 受控模式，建议使用 defaultValue 非受控模式',
        });
      }
      return issues;
    },
  },
  {
    id: 'W05',
    name: '缺少移动端适配',
    severity: 'WARN',
    check: function(code) {
      var issues = [];
      if (code.indexOf('isMobile') < 0 && code.indexOf('renderJsx') >= 0) {
        issues.push({
          line: 0,
          message: '未检测到 isMobile() 调用，页面可能缺少移动端适配',
        });
      }
      return issues;
    },
  },
  {
    id: 'W06',
    name: '字段 ID 未使用 FIELDS 常量',
    severity: 'WARN',
    check: function(code) {
      var issues = [];
      // 检查是否有直接写的 textField_xxx 等
      var directFieldRegex = /['"](?:textField|selectField|dateField|numberField|radioField|checkboxField|textareaField|dropdownField)_[\w]+['"]/g;
      var match;
      var inFieldsBlock = false;
      while ((match = directFieldRegex.exec(code)) !== null) {
        // 检查是否在 FIELDS 定义块内（前后 200 字符有 var FIELDS）
        var before = code.substring(Math.max(0, match.index - 200), match.index);
        if (before.indexOf('FIELDS') < 0) {
          issues.push({
            line: getLineNumber(code, match.index),
            message: '检测到直接写的字段 ID "' + match[0] + '"，建议在文件顶部定义 FIELDS 常量映射',
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'W07',
    name: 'UI 文案含 emoji（AI 味）',
    severity: 'WARN',
    check: function(code) {
      var issues = [];
      // emoji 常见区段：图形符号(1F300-1FAFF)、杂项符号与装饰符(2600-27BF，含 ✅❌⚠⭐ 等 AI 惯用勾叉/星)、
      // 几何装饰符(2B00-2BFF)、旗帜(1F1E6-1F1FF)、变体选择符(FE0F)
      var emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;
      var lines = code.split('\n');
      var flagged = 0;
      for (var i = 0; i < lines.length; i++) {
        var raw = lines[i];
        var trimmed = raw.replace(/^\s+/, '');
        // 跳过纯注释行（emoji 在注释里不会渲染，不算 AI 味）
        if (trimmed.indexOf('//') === 0 || trimmed.indexOf('*') === 0 || trimmed.indexOf('/*') === 0) continue;
        if (emojiRegex.test(raw)) {
          flagged++;
          if (flagged <= 5) {
            issues.push({
              line: i + 1,
              message: 'UI 文案/标题/按钮中出现 emoji，是典型「AI 味」信号，如非功能必需（如 emoji 选择器）请移除，改用文字或图标',
            });
          }
        }
      }
      if (flagged > 5) {
        issues.push({ line: 0, message: '共 ' + flagged + ' 行检测到 emoji（仅列出前 5 处），建议整体清理 UI 文案中的装饰性 emoji' });
      }
      return issues;
    },
  },
];

// ── 工具函数 ──────────────────────────────────────────

function getLineNumber(code, index) {
  if (index < 0) return 0;
  return code.substring(0, index).split('\n').length;
}

function detectCodeType(fileName) {
  var lower = fileName.toLowerCase();
  if (lower.endsWith('.canvas.jsx') || lower.endsWith('.canvas.tsx')) {
    return 'canvas';
  }
  return 'native';
}

// ── 主 lint 函数 ──────────────────────────────────────────

/**
 * 对页面代码执行 lint 检查
 * @param {string} sourceCode - 源代码
 * @param {string} fileName - 文件名（用于检测代码类型）
 * @returns {{ fatalIssues: Array, warnIssues: Array, passed: boolean }}
 */
function lintCode(sourceCode, fileName) {
  var codeType = detectCodeType(fileName || 'page.js');
  var fatalIssues = [];
  var warnIssues = [];

  // 执行致命规则检查
  FATAL_RULES.forEach(function(rule) {
    var issues = rule.check(sourceCode);
    issues.forEach(function(issue) {
      issue.ruleId = rule.id;
      issue.ruleName = rule.name;
      issue.severity = 'FATAL';
      fatalIssues.push(issue);
    });
  });

  // 执行警告规则检查（Canvas 模式下跳过部分 native 专属规则）
  var applicableWarnRules = WARN_RULES;
  if (codeType === 'canvas') {
    // Canvas 模式下不检查 import/require（Canvas 允许 import）
    applicableWarnRules = WARN_RULES.filter(function(r) { return r.id !== 'W05'; });
  }
  applicableWarnRules.forEach(function(rule) {
    var issues = rule.check(sourceCode);
    issues.forEach(function(issue) {
      issue.ruleId = rule.id;
      issue.ruleName = rule.name;
      issue.severity = 'WARN';
      warnIssues.push(issue);
    });
  });

  return {
    fatalIssues: fatalIssues,
    warnIssues: warnIssues,
    passed: fatalIssues.length === 0,
    codeType: codeType,
  };
}

/**
 * 格式化 lint 结果输出
 * @param {object} result - lintCode 返回的结果
 * @returns {string} 格式化的输出文本
 */
function formatLintResult(result) {
  var lines = [];
  lines.push('=== 代码规范检查 (Lint) ===');
  lines.push('代码类型: ' + result.codeType.toUpperCase());
  lines.push('');

  if (result.fatalIssues.length === 0 && result.warnIssues.length === 0) {
    lines.push('✅ 检查通过，未发现规范问题');
    return lines.join('\n');
  }

  if (result.fatalIssues.length > 0) {
    lines.push('❌ 致命错误 (' + result.fatalIssues.length + '):');
    result.fatalIssues.forEach(function(issue) {
      lines.push('  [' + issue.ruleId + '] 行 ' + issue.line + ': ' + issue.message);
    });
    lines.push('');
  }

  if (result.warnIssues.length > 0) {
    lines.push('⚠️ 警告 (' + result.warnIssues.length + '):');
    result.warnIssues.forEach(function(issue) {
      lines.push('  [' + issue.ruleId + '] 行 ' + issue.line + ': ' + issue.message);
    });
    lines.push('');
  }

  if (result.passed) {
    lines.push('✅ 无致命错误，可以继续发布');
    if (result.warnIssues.length > 0) {
      lines.push('   （有 ' + result.warnIssues.length + ' 个警告，建议修复但不阻断发布）');
    }
  } else {
    lines.push('❌ 发现 ' + result.fatalIssues.length + ' 个致命错误，建议修复后再发布');
  }

  return lines.join('\n');
}

// ── CLI 入口 ──────────────────────────────────────────

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('用法: node lint-page.js <代码文件路径> [--no-lint]');
    console.log('');
    console.log('参数说明:');
    console.log('  代码文件路径  JSX 源码文件路径');
    console.log('  --no-lint     跳过 lint 检查（仅用于 publish-page.js 集成）');
    process.exit(0);
  }

  var codePath = path.resolve(args[0]);
  if (!fs.existsSync(codePath)) {
    console.error('代码文件不存在: ' + codePath);
    process.exit(1);
  }

  var sourceCode = fs.readFileSync(codePath, 'utf8');
  var fileName = path.basename(codePath);
  var result = lintCode(sourceCode, fileName);
  console.log(formatLintResult(result));
  
  process.exit(result.passed ? 0 : 1);
}

module.exports = {
  lintCode: lintCode,
  formatLintResult: formatLintResult,
  FATAL_RULES: FATAL_RULES,
  WARN_RULES: WARN_RULES,
};
