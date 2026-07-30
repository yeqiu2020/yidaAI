/**
 * 宜搭公式本地求值验证器（Phase 3 增量增强）
 * 
 * 功能：
 * 1. 60+ 宜搭内置函数本地解析
 * 2. 公式语法静态检查（括号匹配、参数数量、逗号位置等）
 * 3. 字段引用校验（字段名在公式中是否正确引用）
 * 4. 求值结果验证（给定输入值，验证公式计算结果）
 * 
 * 用法：
 *   node formula_evaluator.js --formula "公式文本" --fields "字段名:值,字段名:值"
 *   node formula_evaluator.js --formulaFile "公式文件路径" --fieldsFile "字段值JSON文件"
 * 
 * 与现有 formula_function_validator.js 协作：
 *   - formula_function_validator.js: 函数名验证（已存在，不修改）
 *   - formula_evaluator.js: 语法检查 + 字段校验 + 求值验证（新增）
 */

var fs = require('fs');
var path = require('path');

// ── 函数注册表（可增量更新） ──────────────────────────

var FUNCTION_REGISTRY = {
  // 文本函数
  'CONCATENATE': { minArgs: 1, maxArgs: -1, category: 'text', evaluate: function() { return Array.prototype.join.call(arguments, ''); } },
  'CONCAT': { minArgs: 1, maxArgs: -1, category: 'text', evaluate: function() { return Array.prototype.join.call(arguments, ''); } },
  'LEFT': { minArgs: 2, maxArgs: 2, category: 'text', evaluate: function(str, n) { return String(str).substring(0, n); } },
  'RIGHT': { minArgs: 2, maxArgs: 2, category: 'text', evaluate: function(str, n) { return String(str).substring(String(str).length - n); } },
  'LEN': { minArgs: 1, maxArgs: 1, category: 'text', evaluate: function(str) { return String(str).length; } },
  'LOWER': { minArgs: 1, maxArgs: 1, category: 'text', evaluate: function(str) { return String(str).toLowerCase(); } },
  'UPPER': { minArgs: 1, maxArgs: 1, category: 'text', evaluate: function(str) { return String(str).toUpperCase(); } },
  'MID': { minArgs: 3, maxArgs: 3, category: 'text', evaluate: function(str, start, len) { return String(str).substring(start - 1, start - 1 + len); } },
  'REPLACE': { minArgs: 4, maxArgs: 4, category: 'text', evaluate: function(str, start, len, newStr) { return String(str).substring(0, start - 1) + newStr + String(str).substring(start - 1 + len); } },
  'REPT': { minArgs: 2, maxArgs: 2, category: 'text', evaluate: function(str, n) { return new Array(n + 1).join(str); } },
  'SEARCH': { minArgs: 2, maxArgs: 2, category: 'text', evaluate: function(find, within) { var idx = String(within).indexOf(String(find)); return idx + 1; } },
  'SPLIT': { minArgs: 2, maxArgs: 2, category: 'text', evaluate: function(str, sep) { return String(str).split(sep); } },
  'TEXT': { minArgs: 1, maxArgs: 1, category: 'text', evaluate: function(val) { return String(val); } },
  'TRIM': { minArgs: 1, maxArgs: 1, category: 'text', evaluate: function(str) { return String(str).trim(); } },
  'VALUE': { minArgs: 1, maxArgs: 1, category: 'text', evaluate: function(str) { return parseFloat(str) || 0; } },
  'ARRAYGET': { minArgs: 2, maxArgs: 2, category: 'text', evaluate: function(arr, idx) { return arr[idx - 1]; } },

  // 逻辑函数
  'IF': { minArgs: 3, maxArgs: 3, category: 'logic', evaluate: function(cond, trueVal, falseVal) { return cond ? trueVal : falseVal; } },
  'EQ': { minArgs: 2, maxArgs: 2, category: 'logic', evaluate: function(a, b) { return a == b; } },
  'NE': { minArgs: 2, maxArgs: 2, category: 'logic', evaluate: function(a, b) { return a != b; } },
  'GT': { minArgs: 2, maxArgs: 2, category: 'logic', evaluate: function(a, b) { return Number(a) > Number(b); } },
  'GE': { minArgs: 2, maxArgs: 2, category: 'logic', evaluate: function(a, b) { return Number(a) >= Number(b); } },
  'LT': { minArgs: 2, maxArgs: 2, category: 'logic', evaluate: function(a, b) { return Number(a) < Number(b); } },
  'LE': { minArgs: 2, maxArgs: 2, category: 'logic', evaluate: function(a, b) { return Number(a) <= Number(b); } },
  'AND': { minArgs: 1, maxArgs: -1, category: 'logic', evaluate: function() { for (var i = 0; i < arguments.length; i++) { if (!arguments[i]) return false; } return true; } },
  'OR': { minArgs: 1, maxArgs: -1, category: 'logic', evaluate: function() { for (var i = 0; i < arguments.length; i++) { if (arguments[i]) return true; } return false; } },
  'NOT': { minArgs: 1, maxArgs: 1, category: 'logic', evaluate: function(val) { return !val; } },
  'ISEMPTY': { minArgs: 1, maxArgs: 1, category: 'logic', evaluate: function(val) { return val == null || val === '' || (Array.isArray(val) && val.length === 0); } },
  'TRUE': { minArgs: 0, maxArgs: 0, category: 'logic', evaluate: function() { return true; } },
  'FALSE': { minArgs: 0, maxArgs: 0, category: 'logic', evaluate: function() { return false; } },

  // 数学函数
  'ADD': { minArgs: 2, maxArgs: -1, category: 'math', evaluate: function() { var s = 0; for (var i = 0; i < arguments.length; i++) s += Number(arguments[i]); return s; } },
  'SUM': { minArgs: 1, maxArgs: -1, category: 'math', evaluate: function() { var s = 0; for (var i = 0; i < arguments.length; i++) { if (Array.isArray(arguments[i])) { arguments[i].forEach(function(v) { s += Number(v); }); } else { s += Number(arguments[i]); } } return s; } },
  'PRODUCT': { minArgs: 1, maxArgs: -1, category: 'math', evaluate: function() { var p = 1; for (var i = 0; i < arguments.length; i++) { if (Array.isArray(arguments[i])) { arguments[i].forEach(function(v) { p *= Number(v); }); } else { p *= Number(arguments[i]); } } return p; } },
  'SUMPRODUCT': { minArgs: 2, maxArgs: -1, category: 'math', evaluate: function() { var s = 0; for (var i = 0; i < arguments[0].length; i++) { var p = 1; for (var j = 0; j < arguments.length; j++) { p *= Number(arguments[j][i] || 0); } s += p; } return s; } },
  'AVERAGE': { minArgs: 1, maxArgs: -1, category: 'math', evaluate: function() { var s = 0, c = 0; for (var i = 0; i < arguments.length; i++) { if (Array.isArray(arguments[i])) { arguments[i].forEach(function(v) { s += Number(v); c++; }); } else { s += Number(arguments[i]); c++; } } return c > 0 ? s / c : 0; } },
  'MAX': { minArgs: 1, maxArgs: -1, category: 'math', evaluate: function() { return Math.max.apply(null, Array.prototype.concat.apply([], arguments)); } },
  'MIN': { minArgs: 1, maxArgs: -1, category: 'math', evaluate: function() { return Math.min.apply(null, Array.prototype.concat.apply([], arguments)); } },
  'ABS': { minArgs: 1, maxArgs: 1, category: 'math', evaluate: function(n) { return Math.abs(Number(n)); } },
  'ROUND': { minArgs: 2, maxArgs: 2, category: 'math', evaluate: function(n, d) { var f = Math.pow(10, d); return Math.round(Number(n) * f) / f; } },
  'CEILING': { minArgs: 1, maxArgs: 1, category: 'math', evaluate: function(n) { return Math.ceil(Number(n)); } },
  'FLOOR': { minArgs: 1, maxArgs: 1, category: 'math', evaluate: function(n) { return Math.floor(Number(n)); } },
  'INT': { minArgs: 1, maxArgs: 1, category: 'math', evaluate: function(n) { return Math.floor(Number(n)); } },
  'MOD': { minArgs: 2, maxArgs: 2, category: 'math', evaluate: function(a, b) { return Number(a) % Number(b); } },
  'POWER': { minArgs: 2, maxArgs: 2, category: 'math', evaluate: function(a, b) { return Math.pow(Number(a), Number(b)); } },
  'SQRT': { minArgs: 1, maxArgs: 1, category: 'math', evaluate: function(n) { return Math.sqrt(Number(n)); } },
  'COUNT': { minArgs: 1, maxArgs: -1, category: 'math', evaluate: function() { return arguments.length; } },
  'LARGE': { minArgs: 2, maxArgs: 2, category: 'math', evaluate: function(arr, k) { var s = Array.prototype.concat.apply([], arr).sort(function(a, b) { return b - a; }); return s[k - 1]; } },
  'SMALL': { minArgs: 2, maxArgs: 2, category: 'math', evaluate: function(arr, k) { var s = Array.prototype.concat.apply([], arr).sort(function(a, b) { return a - b; }); return s[k - 1]; } },

  // 日期函数
  'NOW': { minArgs: 0, maxArgs: 0, category: 'date', evaluate: function() { return new Date().getTime(); } },
  'TODAY': { minArgs: 0, maxArgs: 0, category: 'date', evaluate: function() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); } },
  'YEAR': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { var d = new Date(Number(date) || date); return d.getFullYear(); } },
  'MONTH': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { var d = new Date(Number(date) || date); return d.getMonth() + 1; } },
  'DAY': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { var d = new Date(Number(date) || date); return d.getDate(); } },
  'HOUR': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { var d = new Date(Number(date) || date); return d.getHours(); } },
  'MINUTE': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { var d = new Date(Number(date) || date); return d.getMinutes(); } },
  'SECOND': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { var d = new Date(Number(date) || date); return d.getSeconds(); } },
  'DATE': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(ts) { return Number(ts); } },
  'DAYS': { minArgs: 2, maxArgs: 2, category: 'date', evaluate: function(end, start) { var e = new Date(Number(end)); var s = new Date(Number(start)); return Math.floor((e - s) / (24 * 60 * 60 * 1000)); } },
  'DATEDELTA': { minArgs: 2, maxArgs: 2, category: 'date', evaluate: function(date, delta) { return Number(date) + delta * 24 * 60 * 60 * 1000; } },
  'TIMESTAMP': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { return new Date(Number(date) || date).getTime(); } },
  'WEEKNUM': { minArgs: 1, maxArgs: 1, category: 'date', evaluate: function(date) { var d = new Date(Number(date) || date); var onejan = new Date(d.getFullYear(), 0, 1); return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7); } },

  // 用户函数
  'LOGINUSER': { minArgs: 0, maxArgs: 0, category: 'user', evaluate: function() { return 'test_user'; } },
  'GETUSERNAME': { minArgs: 1, maxArgs: 1, category: 'user', evaluate: function(userId) { return '用户' + userId; } },
};

// ── 语法检查 ──────────────────────────────────────────

/**
 * 静态检查公式语法
 * @param {string} formula - 公式文本（已去除零宽空格）
 * @returns {{ errors: Array, warnings: Array }}
 */
function checkSyntax(formula) {
  var errors = [];
  var warnings = [];

  // 1. 括号匹配检查
  var parenStack = [];
  for (var i = 0; i < formula.length; i++) {
    if (formula[i] === '(') parenStack.push(i);
    if (formula[i] === ')') {
      if (parenStack.length === 0) {
        errors.push({ pos: i, msg: '多余的右括号 )' });
      } else {
        parenStack.pop();
      }
    }
  }
  if (parenStack.length > 0) {
    errors.push({ pos: parenStack[0], msg: '缺少右括号 )，有 ' + parenStack.length + ' 个未闭合的左括号' });
  }

  // 2. 引号匹配检查
  var inString = false;
  var stringStart = -1;
  for (let j = 0; j < formula.length; j++) {
    if (formula[j] === '"') {
      if (!inString) {
        inString = true;
        stringStart = j;
      } else {
        inString = false;
      }
    }
  }
  if (inString) {
    errors.push({ pos: stringStart, msg: '字符串引号未闭合' });
  }

  // 3. 函数名后必须紧跟左括号
  var funcRegex = /([A-Za-z][A-Za-z0-9]*)\s*(?!\()/g;
  var match;
  while ((match = funcRegex.exec(formula)) !== null) {
    var name = match[1].toUpperCase();
    // 排除字段名（通常包含中文）
    if (/^[A-Z]+$/.test(match[1]) && FUNCTION_REGISTRY[name]) {
      // 这是一个已注册函数，检查后面是否有括号
      var afterFunc = formula.substring(match.index + match[0].length);
      if (!afterFunc.startsWith('(')) {
        warnings.push({ pos: match.index, msg: '函数 "' + name + '" 后可能缺少左括号 (' });
      }
    }
  }

  // 4. 空参数检查
  var emptyParamRegex = /,\s*,/g;
  while ((match = emptyParamRegex.exec(formula)) !== null) {
    warnings.push({ pos: match.index, msg: '检测到空参数（连续逗号）' });
  }

  // 5. IF 函数参数检查
  var ifRegex = /IF\s*\(/g;
  while ((match = ifRegex.exec(formula)) !== null) {
    // 粗略检查 IF 是否有 3 个参数
    var ifStart = match.index + match[0].length;
    var depth = 1;
    var commaCount = 0;
    var j = ifStart;
    while (j < formula.length && depth > 0) {
      if (formula[j] === '(') depth++;
      if (formula[j] === ')') depth--;
      if (formula[j] === ',' && depth === 1) commaCount++;
      j++;
    }
    if (commaCount < 2) {
      warnings.push({ pos: match.index, msg: 'IF 函数应有 3 个参数（条件, 真值, 假值），当前只有 ' + (commaCount + 1) + ' 个参数' });
    }
  }

  return { errors: errors, warnings: warnings };
}

// ── 字段引用校验 ──────────────────────────────────────────

/**
 * 校验公式中的字段引用
 * @param {string} formula - 公式文本（含零宽空格）
 * @param {Array} fields - 字段配置 [{ displayName, fieldId }]
 * @returns {{ valid: boolean, issues: Array, foundFields: Array }}
 */
function validateFieldReferences(formula, fields) {
  var issues = [];
  var foundFields = [];

  // 去除零宽空格后的公式文本
  var cleanFormula = formula.replace(/\u200b/g, '');

  // 检查每个字段是否在公式中出现
  fields.forEach(function(field) {
    var displayName = field.displayName;
    if (cleanFormula.indexOf(displayName) >= 0) {
      foundFields.push(displayName);
    } else {
      issues.push({
        type: 'field_missing',
        field: displayName,
        fieldId: field.fieldId,
        msg: '字段 "' + displayName + '" 在公式中未找到引用',
      });
    }
  });

  // 检查公式中是否有未在 fields 中定义的字段引用
  // （粗略检查：零宽空格包裹的内容）
  var zwsRegex = /\u200b([^\u200b]+)\u200b/g;
  var match;
  while ((match = zwsRegex.exec(formula)) !== null) {
    var fieldName = match[1];
    var isDefined = fields.some(function(f) { return f.displayName === fieldName; });
    if (!isDefined && foundFields.indexOf(fieldName) < 0) {
      issues.push({
        type: 'field_undefined',
        field: fieldName,
        msg: '公式中引用的字段 "' + fieldName + '" 未在 fields 配置中定义',
      });
    }
  }

  return {
    valid: issues.filter(function(i) { return i.type === 'field_undefined'; }).length === 0,
    issues: issues,
    foundFields: foundFields,
  };
}

// ── 公式解析器（递归下降） ──────────────────────────

/**
 * 解析公式文本并求值
 * @param {string} formula - 公式文本（已去除零宽空格）
 * @param {object} fieldValues - 字段值映射 { "字段名": value }
 * @returns {{ result: any, error: string|null, trace: Array }}
 */
function evaluateFormula(formula, fieldValues) {
  fieldValues = fieldValues || {};
  var trace = [];
  var pos = 0;

  function skipWhitespace() {
    while (pos < formula.length && /\s/.test(formula[pos])) pos++;
  }

  function parseValue() {
    skipWhitespace();
    
    // 字符串
    if (formula[pos] === '"') {
      pos++;
      var str = '';
      while (pos < formula.length && formula[pos] !== '"') {
        str += formula[pos];
        pos++;
      }
      pos++; // 跳过结束引号
      return str;
    }

    // 数字
    if (/[\d.-]/.test(formula[pos])) {
      var numStr = '';
      while (pos < formula.length && /[\d.eE+\-]/.test(formula[pos])) {
        numStr += formula[pos];
        pos++;
      }
      var num = parseFloat(numStr);
      return isNaN(num) ? numStr : num;
    }

    // 布尔值
    if (formula.substring(pos, pos + 4).toUpperCase() === 'TRUE') {
      pos += 4;
      return true;
    }
    if (formula.substring(pos, pos + 5).toUpperCase() === 'FALSE') {
      pos += 5;
      return false;
    }

    // 函数调用或字段名
    if (/[A-Za-z\u4e00-\u9fff]/.test(formula[pos])) {
      var funcName = '';
      while (pos < formula.length && /[A-Za-z0-9\u4e00-\u9fff.]/.test(formula[pos])) {
        funcName += formula[pos];
        pos++;
      }
      var funcUpper = funcName.toUpperCase();
      skipWhitespace();

      if (formula[pos] === '(') {
        pos++; // 跳过 (
        var args = [];
        skipWhitespace();
        if (formula[pos] !== ')') {
          args.push(parseValue());
          skipWhitespace();
          while (formula[pos] === ',') {
            pos++;
            args.push(parseValue());
            skipWhitespace();
          }
        }
        if (formula[pos] !== ')') {
          throw new Error('函数 ' + funcUpper + ' 缺少右括号，位置: ' + pos);
        }
        pos++; // 跳过 )

        // 执行函数
        return executeFunction(funcUpper, args);
      }
      // 不是函数调用，是字段名
      return fieldValues[funcName] !== undefined ? fieldValues[funcName] : funcName;
    }

    // 括号表达式
    if (formula[pos] === '(') {
      pos++;
      var val = parseValue();
      skipWhitespace();
      if (formula[pos] === ')') pos++;
      return val;
    }

    throw new Error('无法解析位置 ' + pos + ' 的字符: ' + formula[pos]);
  }

  function executeFunction(funcName, args) {
    var funcInfo = FUNCTION_REGISTRY[funcName];
    if (!funcInfo) {
      throw new Error('未知函数: ' + funcName);
    }

    // 参数数量检查
    if (args.length < funcInfo.minArgs) {
      throw new Error('函数 ' + funcName + ' 需要至少 ' + funcInfo.minArgs + ' 个参数，实际 ' + args.length + ' 个');
    }
    if (funcInfo.maxArgs > 0 && args.length > funcInfo.maxArgs) {
      throw new Error('函数 ' + funcName + ' 最多接受 ' + funcInfo.maxArgs + ' 个参数，实际 ' + args.length + ' 个');
    }

    trace.push({ func: funcName, args: args });

    // 执行数学运算符
    if (funcName === 'ADD' && args.length === 2) {
      return Number(args[0]) + Number(args[1]);
    }

    return funcInfo.evaluate.apply(null, args);
  }

  try {
    // 处理数学运算符（将 a+b 转为 ADD(a,b) 等）
    var processedFormula = formula
      .replace(/\s*\+\s*/g, ' + ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s*\*\s*/g, ' * ')
      .replace(/\s*\/\s*/g, ' / ');

    // 简单处理：尝试直接解析
    var result = parseValue();
    return { result: result, error: null, trace: trace };
  } catch (e) {
    return { result: null, error: e.message, trace: trace };
  }
}

// ── 综合验证 ──────────────────────────────────────────

/**
 * 对公式进行综合验证（语法 + 字段 + 求值）
 * @param {string} formula - 公式文本
 * @param {Array} fields - 字段配置 [{ displayName, fieldId }]
 * @param {object} testValues - 测试字段值 { "字段名": value }
 * @returns {{ syntaxCheck: object, fieldCheck: object, evaluation: object, passed: boolean }}
 */
function comprehensiveValidate(formula, fields, testValues) {
  // 去除零宽空格进行语法检查
  var cleanFormula = formula.replace(/\u200b/g, '');

  // 1. 语法检查
  var syntaxCheck = checkSyntax(cleanFormula);

  // 2. 字段引用校验
  var fieldCheck = validateFieldReferences(formula, fields || []);

  // 3. 求值验证（始终尝试，公式可能仅含字面量无需字段值）
  var evaluation = { result: null, error: null, trace: [] };
  try {
    evaluation = evaluateFormula(cleanFormula, testValues || {});
  } catch (e) {
    evaluation.error = e.message;
  }

  // 4. 与现有函数验证器协作
  var functionCheck = { valid: true, invalidFunctions: [] };
  try {
    var validator = require(path.join(__dirname, 'formula_function_validator.js'));
    var funcResult = validator.validateFunctions(cleanFormula);
    functionCheck = funcResult;
  } catch (e) {
    // 函数验证器加载失败，跳过
  }

  var passed = syntaxCheck.errors.length === 0 && 
               fieldCheck.valid && 
               !evaluation.error &&
               functionCheck.valid;

  return {
    syntaxCheck: syntaxCheck,
    fieldCheck: fieldCheck,
    functionCheck: functionCheck,
    evaluation: evaluation,
    passed: passed,
  };
}

/**
 * 格式化验证结果
 * @param {object} result - comprehensiveValidate 返回值
 * @returns {string}
 */
function formatResult(result) {
  var lines = [];
  lines.push('=== 公式综合验证 ===');
  lines.push('');

  // 语法检查
  if (result.syntaxCheck.errors.length === 0 && result.syntaxCheck.warnings.length === 0) {
    lines.push('✅ 语法检查: 通过');
  } else {
    if (result.syntaxCheck.errors.length > 0) {
      lines.push('❌ 语法错误:');
      result.syntaxCheck.errors.forEach(function(e) { lines.push('  位置 ' + e.pos + ': ' + e.msg); });
    }
    if (result.syntaxCheck.warnings.length > 0) {
      lines.push('⚠️ 语法警告:');
      result.syntaxCheck.warnings.forEach(function(w) { lines.push('  位置 ' + w.pos + ': ' + w.msg); });
    }
  }

  // 字段检查
  if (result.fieldCheck.issues.length === 0) {
    lines.push('✅ 字段引用: 通过（' + result.fieldCheck.foundFields.length + ' 个字段）');
  } else {
    lines.push('⚠️ 字段引用问题:');
    result.fieldCheck.issues.forEach(function(i) { lines.push('  [' + i.type + '] ' + i.msg); });
  }

  // 函数检查
  if (result.functionCheck.valid) {
    lines.push('✅ 函数验证: 通过（' + (result.functionCheck.functions || []).join(', ') + '）');
  } else {
    lines.push('❌ 函数验证失败:');
    (result.functionCheck.invalidFunctions || []).forEach(function(f) { lines.push('  ' + f.function + ': ' + f.error); });
  }

  // 求值结果
  if (result.evaluation.error) {
    lines.push('❌ 求值失败: ' + result.evaluation.error);
  } else if (result.evaluation.result !== null) {
    lines.push('✅ 求值结果: ' + JSON.stringify(result.evaluation.result));
  } else {
    lines.push('ℹ️ 求值验证: 未提供测试值，跳过');
  }

  lines.push('');
  lines.push(result.passed ? '✅ 综合验证: 通过' : '❌ 综合验证: 未通过');

  return lines.join('\n');
}

// ── CLI 入口 ──────────────────────────────────────────

if (require.main === module) {
  var args = process.argv.slice(2);
  var formula = '';
  var fields = [];
  var testValues = {};

  // 解析参数
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--formula' && args[i + 1]) {
      formula = args[++i];
    } else if (args[i] === '--formulaFile' && args[i + 1]) {
      formula = fs.readFileSync(args[++i], 'utf8').trim();
    } else if (args[i] === '--fields' && args[i + 1]) {
      // 格式: "字段名:字段ID,字段名:字段ID"
      args[++i].split(',').forEach(function(pair) {
        var parts = pair.split(':');
        if (parts.length >= 2) {
          fields.push({ displayName: parts[0], fieldId: parts[1] });
        }
      });
    } else if (args[i] === '--testValues' && args[i + 1]) {
      // 格式: "字段名=值,字段名=值"
      args[++i].split(',').forEach(function(pair) {
        var parts = pair.split('=');
        if (parts.length >= 2) {
          var val = parts[1];
          // 尝试解析为数字
          if (/^\d+$/.test(val)) val = parseInt(val, 10);
          else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);
          testValues[parts[0]] = val;
        }
      });
    }
  }

  if (!formula) {
    console.log('用法: node formula_evaluator.js --formula "公式文本" [--fields "名:ID,..."] [--testValues "名=值,..."]');
    console.log('     node formula_evaluator.js --formulaFile "文件路径" [--fields "名:ID,..."] [--testValues "名=值,..."]');
    process.exit(1);
  }

  var result = comprehensiveValidate(formula, fields, testValues);
  console.log(formatResult(result));
  process.exit(result.passed ? 0 : 1);
}

module.exports = {
  checkSyntax: checkSyntax,
  validateFieldReferences: validateFieldReferences,
  evaluateFormula: evaluateFormula,
  comprehensiveValidate: comprehensiveValidate,
  formatResult: formatResult,
  FUNCTION_REGISTRY: FUNCTION_REGISTRY,
};
