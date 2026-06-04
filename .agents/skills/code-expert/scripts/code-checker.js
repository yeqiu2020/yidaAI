/**
 * 宜搭代码检查工具
 * 版本号: v3.0.0
 *
 * 功能：对生成的宜搭代码进行全面的规范检查
 * 覆盖场景：表单动作代码 / 字段校验代码 / 自动化脚本 / 自定义页面代码
 */

// ============================================================
// 检查规则配置
// ============================================================

var RULES = {
  // ---------- 自动化脚本专属规则 ----------
  automation: {
    required: [
      {
        pattern: /outputs\.add\s*\(/,
        message: '自动化脚本必须使用 outputs.add() 输出结果'
      }
    ],
    forbidden: [
      {
        pattern: /\/\*[\s\S]*?\*\//,
        message: '自动化脚本只能使用 // 单行注释，禁止使用 /* */ 或 /** */ 多行注释'
      },
      {
        pattern: /this\.\$\s*\(/,
        message: '自动化脚本不能使用 this.$()，脚本环境无 UI 上下文'
      },
      {
        pattern: /\bconsole\s*\./,
        message: '自动化脚本不支持 console 方法，请删除所有日志语句'
      },
      {
        pattern: /\bconst\s+/,
        message: '自动化脚本仅支持 ES5，禁止使用 const，请改用 var'
      },
      {
        pattern: /\blet\s+/,
        message: '自动化脚本仅支持 ES5，禁止使用 let，请改用 var'
      },
      {
        pattern: /=>/,
        message: '自动化脚本仅支持 ES5，禁止使用箭头函数 =>，请改用 function(){}'
      },
      {
        pattern: /`[^`]*\$\{/,
        message: '自动化脚本仅支持 ES5，禁止使用模板字符串 `${}`，请改用字符串拼接'
      },
      {
        pattern: /var\s+\{[^}]+\}\s*=/,
        message: '自动化脚本仅支持 ES5，禁止使用解构赋值'
      },
      {
        pattern: /export\s+function/,
        message: '自动化脚本不能使用 export function，直接写执行代码'
      },
      {
        // 顶层 return（不在函数内）
        pattern: /^return\b/m,
        message: '自动化脚本顶层禁止使用 return，请用 if-else 控制流程'
      }
    ],
    warnings: [
      {
        pattern: /async\s+function/,
        message: '警告：自动化脚本仅支持 ES5，async/await 可能不生效'
      },
      {
        pattern: /\.\.\.\s*[a-zA-Z]/,
        message: '警告：自动化脚本仅支持 ES5，展开运算符(...)可能不生效'
      }
    ]
  },

  // ---------- 字段校验代码专属规则 ----------
  validation: {
    required: [
      {
        pattern: /function\s+validateRule\s*\(\s*value\s*\)/,
        message: '字段校验代码必须包含函数 validateRule(value)'
      },
      {
        pattern: /\breturn\s+(true|false)/,
        message: '字段校验函数必须返回 true 或 false'
      }
    ],
    forbidden: [
      {
        pattern: /this\.\$\s*\([^)]+\)\.setValue/,
        message: '字段校验代码不应在校验过程中修改其他字段值'
      },
      {
        pattern: /export\s+function/,
        message: '字段校验代码不需要 export，宜搭平台直接调用 validateRule 函数'
      },
      {
        pattern: /export\s+function\s+didMount/,
        message: '字段校验代码不需要 didMount 函数'
      }
    ],
    warnings: []
  },

  // ---------- 表单动作代码专属规则 ----------
  formAction: {
    required: [
      {
        pattern: /export\s+function\s+didMount\s*\(\s*\)/,
        message: '表单动作代码必须包含 export function didMount()'
      }
    ],
    forbidden: [
      {
        pattern: /function\s+validateRule\s*\(\s*value\s*\)/,
        message: '表单动作代码中不应包含 validateRule 函数，该函数属于字段校验代码'
      },
      {
        pattern: /outputs\.add\s*\(/,
        message: '表单动作代码不能使用 outputs.add()，该接口仅用于自动化脚本'
      }
    ],
    warnings: [
      {
        pattern: /\.then\s*\(function[^}]+\{[^}]+this\./,
        message: '警告：Promise 回调中不能直接使用 this，请在外层用 var that = this 保存引用'
      }
    ]
  },

  // ---------- 自定义页面代码专属规则 ----------
  customPage: {
    required: [
      {
        pattern: /export\s+function\s+didMount\s*\(\s*\)/,
        message: '自定义页面代码必须包含 export function didMount()'
      }
    ],
    forbidden: [
      {
        pattern: /outputs\.add\s*\(/,
        message: '自定义页面代码不能使用 outputs.add()，该接口仅用于自动化脚本'
      }
    ],
    warnings: [
      {
        pattern: /\.show\(\)[^]*?\.(setValue|getValue)\s*\(/,
        message: '警告：弹窗 show() 后立即操作字段可能失败，请用 setTimeout(fn, 100) 延迟执行'
      }
    ]
  }
};

// ============================================================
// 通用检查项（所有场景均适用）
// ============================================================

var COMMON_CHECKS = {
  warnings: [
    {
      pattern: /\.load\(/.source + '([^)]+)' + '\)\s*\.' + 'then',
      test: function(code) {
        // 检查 dataSourceMap 调用是否有 .catch() 错误处理
        var hasLoad = /\.load\s*\(/.test(code);
        var hasCatch = /\.catch\s*\(/.test(code);
        return hasLoad && !hasCatch;
      },
      message: '警告：dataSourceMap.load() 缺少 .catch() 错误处理，建议添加异常捕获'
    },
    {
      test: function(code) {
        // 检查是否声明了 CONFIG 常量
        return !/var\s+CONFIG\s*=/.test(code) && /this\.\$\s*\(/.test(code);
      },
      message: '建议：将字段 ID 和数据源名称统一放在 var CONFIG = {} 配置对象中，便于维护'
    }
  ]
};

// ============================================================
// 核心检查函数
// ============================================================

/**
 * 检查代码是否符合宜搭规范
 * @param {string} code - 要检查的代码文本
 * @param {string} scene - 场景类型：automation / validation / formAction / customPage
 * @returns {object} - { valid: boolean, errors: Array, warnings: Array, summary: string }
 */
function checkCode(code, scene) {
  var errors = [];
  var warnings = [];

  if (!code || typeof code !== 'string') {
    return {
      valid: false,
      errors: [{ type: 'error', message: '代码内容为空', rule: '基础检查' }],
      warnings: [],
      summary: '❌ 代码内容为空'
    };
  }

  // 去除注释内容后检查（避免注释中的示例代码触发误报）
  // 仅对 forbidden 规则有效，required 规则需要检查真实代码
  var codeForForbiddenCheck = removeComments(code);

  // 场景专属检查
  if (scene && RULES[scene]) {
    var sceneRules = RULES[scene];

    // 检查禁止项（使用去注释后的代码）
    if (sceneRules.forbidden) {
      for (var i = 0; i < sceneRules.forbidden.length; i++) {
        var rule = sceneRules.forbidden[i];
        if (rule.pattern.test(codeForForbiddenCheck)) {
          errors.push({
            type: 'error',
            message: rule.message,
            rule: scene + ' 规范'
          });
        }
      }
    }

    // 检查必须项（使用原始代码）
    if (sceneRules.required) {
      for (var j = 0; j < sceneRules.required.length; j++) {
        var reqRule = sceneRules.required[j];
        if (!reqRule.pattern.test(code)) {
          errors.push({
            type: 'error',
            message: reqRule.message,
            rule: scene + ' 规范'
          });
        }
      }
    }

    // 场景警告项
    if (sceneRules.warnings) {
      for (var k = 0; k < sceneRules.warnings.length; k++) {
        var warnRule = sceneRules.warnings[k];
        var matched = warnRule.test ? warnRule.test(code) : (warnRule.pattern && warnRule.pattern.test(code));
        if (matched) {
          warnings.push({
            type: 'warning',
            message: warnRule.message,
            rule: scene + ' 建议'
          });
        }
      }
    }
  }

  // 通用警告检查
  for (var m = 0; m < COMMON_CHECKS.warnings.length; m++) {
    var commonWarn = COMMON_CHECKS.warnings[m];
    var commonMatched = commonWarn.test ? commonWarn.test(code) : false;
    if (commonMatched) {
      warnings.push({
        type: 'warning',
        message: commonWarn.message,
        rule: '通用建议'
      });
    }
  }

  var valid = errors.length === 0;
  return {
    valid: valid,
    errors: errors,
    warnings: warnings,
    summary: generateSummary(valid, errors.length, warnings.length)
  };
}

/**
 * 移除代码中的注释内容（避免注释中的示例代码误报）
 * @param {string} code
 * @returns {string}
 */
function removeComments(code) {
  // 移除多行注释 /** */ 和 /* */
  var result = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // 移除单行注释 //
  result = result.replace(/\/\/[^\n]*/g, '');
  return result;
}

/**
 * 生成摘要文字
 */
function generateSummary(valid, errorCount, warningCount) {
  if (valid && warningCount === 0) {
    return '✅ 检查通过，代码符合宜搭规范';
  } else if (valid && warningCount > 0) {
    return '✅ 检查通过，但有 ' + warningCount + ' 条建议需关注';
  } else {
    return '❌ 检查未通过：' + errorCount + ' 个错误，' + warningCount + ' 个警告';
  }
}

/**
 * 生成可读的检查报告
 * @param {object} result - checkCode 返回的结果对象
 * @returns {string} - 格式化的报告文本
 */
function generateReport(result) {
  var lines = [];
  lines.push(result.summary);
  lines.push('');

  if (result.errors && result.errors.length > 0) {
    lines.push('【错误】必须修复：');
    for (var i = 0; i < result.errors.length; i++) {
      lines.push('  ' + (i + 1) + '. [' + result.errors[i].rule + '] ' + result.errors[i].message);
    }
    lines.push('');
  }

  if (result.warnings && result.warnings.length > 0) {
    lines.push('【警告】建议关注：');
    for (var j = 0; j < result.warnings.length; j++) {
      lines.push('  ' + (j + 1) + '. [' + result.warnings[j].rule + '] ' + result.warnings[j].message);
    }
  }

  return lines.join('\n');
}

/**
 * 快速校验入口（打印报告到控制台）
 * @param {string} code - 代码文本
 * @param {string} scene - 场景类型
 */
function quickCheck(code, scene) {
  var result = checkCode(code, scene);
  var report = generateReport(result);
  console.log(report);
  return result;
}

// ============================================================
// 场景自动识别（可选）
// ============================================================

/**
 * 自动识别代码场景类型
 * @param {string} code
 * @returns {string} - automation / validation / formAction / customPage
 */
function detectScene(code) {
  if (/outputs\.add\s*\(/.test(code)) {
    return 'automation';
  }
  if (/function\s+validateRule\s*\(\s*value\s*\)/.test(code)) {
    return 'validation';
  }
  if (/export\s+function\s+didMount/.test(code)) {
    // 根据其他特征区分 formAction 和 customPage
    // customPage 通常有 pageState 或 setState
    if (/pageState\s*=/.test(code) || /this\.setState\s*\(/.test(code)) {
      return 'customPage';
    }
    return 'formAction';
  }
  return 'formAction'; // 默认
}

// ============================================================
// 导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkCode: checkCode,
    generateReport: generateReport,
    quickCheck: quickCheck,
    detectScene: detectScene,
    RULES: RULES
  };
}

// 代码版本号: v3.0.0
