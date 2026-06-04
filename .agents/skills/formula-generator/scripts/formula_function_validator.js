/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 宜搭公式函数验证器
 * 版本: 1.0.0
 * 
 * 功能：自动验证公式中使用的所有函数是否存在于宜搭官方文档
 * 必须在生成公式前调用此验证器
 */

const fs = require('fs');
const path = require('path');

// 宜搭官方函数列表（从宜搭表单公式文档.md提取）
const YIDA_OFFICIAL_FUNCTIONS = new Set([
  // 文本函数
  'ARRAYGET', 'CONCATENATE', 'LEFT', 'RIGHT', 'LEN', 'LOWER', 'UPPER', 'MID',
  'PINYINHEADCHAR', 'REPLACE', 'REPT', 'RMBFORMAT', 'SEARCH', 'SPLIT', 'TEXT',
  'TRIM', 'UUID', 'VALUE', 'STRINGTONUMBER', 'LEFTTRIM', 'RIGHTTRIM', 'CONCAT',
  'SPLITPART', 'NUMBERTOSTRING',
  // 时间函数
  'CASCADEDATEINTERVAL', 'CASCADEDATEINTERVALV2', 'DATE', 'DATEDELTA', 'DAY',
  'DAYBEGIN', 'DAYEND', 'DAYS', 'DAYS360', 'HOUR', 'ISOWEEKNUM', 'MINUTE',
  'MONTH', 'NETWORKDAYS', 'NOW', 'SECOND', 'SYSTIME', 'TIME', 'TIMESTAMP',
  'TODAY', 'WEEKNUM', 'WORKDAY', 'YEAR', 'YEARBEGIN', 'YEAREND', 'DATEFORMAT',
  'STRINGTODATE', 'DATEDIFF', 'DATEADD', 'QUARTER', 'FROMUNIXTIME',
  // 数组函数（报表场域）
  'ArrayToString', 'StringToArray', 'ArrayLength', 'ArrayCat',
  // 逻辑函数
  'EQ', 'NE', 'AND', 'OR', 'NOT', 'XOR', 'FALSE', 'TRUE', 'GE', 'LE', 'GT',
  'LT', 'IF', 'ISEMPTY', 'ISNULL', 'HASEMPTYTEXT', 'TIMECOMPARE', 'NUMBERCOMPARE',
  'CASEWHEN',
  // 数学函数
  'COUNT', 'ADD', 'AVERAGE', 'MAX', 'MIN', 'ABS', 'ROUND', 'CEILING', 'FLOOR',
  'INT', 'LOG', 'MOD', 'POWER', 'FIXED', 'SQRT', 'SUM', 'PRODUCT', 'SUMPRODUCT',
  'LARGE', 'SMALL', 'COUNTDISTINCT', 'ParseDouble', 'Parseint',
  // 集合函数
  'DIFFERENCESET', 'INTERSECTIONSET', 'SUBSET', 'UNIONSET',
  // 校验函数
  'ARRAYREPEATED', 'EXIST', 'EXACT',
  // 人员函数
  'USER', 'USERFIELD', 'DIRECTOR', 'EMPLOYEE', 'GETUSERNAME', 'LOGINUSER',
  'LOGINUSERWORKNO', 'DEPTNAME',
  // 高级公式函数
  'DELETE', 'INSERT', 'UPDATE', 'UPSERT',
  // 构造器函数（来自构造器函数.md）
  'USERBUILDER', 'DIRECTORBUILDER', 'DEPTBUILDER', 'GETOBJECTFIELD', 'GETARRAYITEM'
]);

// 常见错误函数映射（错误函数名 -> 正确函数名）
const COMMON_MISTAKES = {
  'ISBLANK': 'ISEMPTY',  // Excel函数，宜搭用ISEMPTY
  'SUBTRACT': 'ADD(使用负数)',  // 宜搭无减法函数
  'DIVIDE': '/(除号)',  // 宜搭无除法函数
  'SUMIF': '无此函数',  // 宜搭无SUMIF
  'VLOOKUP': '无此函数',  // 宜搭无VLOOKUP
  'IFERROR': 'IF+ISEMPTY',  // 宜搭无IFERROR
  'CONCAT': 'CONCATENATE',  // 表单场域用CONCATENATE
  'AVERAGE': 'AVG',  // 报表场域用AVG
  'VALUE': 'VAL',  // 报表场域用VAL
};

/**
 * 从公式文本中提取所有函数名
 * @param {string} formulaText - 公式文本
 * @returns {string[]} - 函数名列表
 */
function extractFunctions(formulaText) {
  const functions = new Set();
  // 匹配函数名模式：字母( 或 字母数字(
  const regex = /\b([A-Za-z][A-Za-z0-9]*)\s*\(/g;
  let match;
  while ((match = regex.exec(formulaText)) !== null) {
    functions.add(match[1].toUpperCase());
  }
  return Array.from(functions);
}

/**
 * 验证公式中的函数
 * @param {string} formulaText - 公式文本
 * @returns {object} - 验证结果
 */
function validateFunctions(formulaText) {
  const functions = extractFunctions(formulaText);
  const invalidFunctions = [];
  const warnings = [];

  for (const func of functions) {
    if (!YIDA_OFFICIAL_FUNCTIONS.has(func)) {
      // 检查是否是常见错误
      if (COMMON_MISTAKES[func]) {
        invalidFunctions.push({
          function: func,
          error: `使用了错误的函数`,
          suggestion: `宜搭没有 ${func} 函数，请使用 ${COMMON_MISTAKES[func]}`
        });
      } else {
        invalidFunctions.push({
          function: func,
          error: `函数不存在`,
          suggestion: `请查阅【宜搭表单公式文档.md】确认正确的函数名`
        });
      }
    }
  }

  return {
    valid: invalidFunctions.length === 0,
    functions: functions,
    invalidFunctions: invalidFunctions,
    formulaText: formulaText
  };
}

/**
 * 验证公式（带抛出错误）
 * @param {string} formulaText - 公式文本
 * @throws {Error} - 验证失败时抛出错误
 */
function validateFormulaStrict(formulaText) {
  const result = validateFunctions(formulaText);
  
  if (!result.valid) {
    const errors = result.invalidFunctions.map(f => 
      `❌ ${f.function}: ${f.error}\n   建议: ${f.suggestion}`
    ).join('\n\n');
    
    throw new Error(
      `公式函数验证失败！\n\n` +
      `公式: ${formulaText}\n\n` +
      `发现的函数: ${result.functions.join(', ')}\n\n` +
      `错误详情:\n${errors}\n\n` +
      `请查阅【宜搭表单公式文档.md】确认正确的函数名称。`
    );
  }
  
  console.log(`✅ 函数验证通过！使用的函数: ${result.functions.join(', ')}`);
  return result;
}

module.exports = {
  validateFunctions,
  validateFormulaStrict,
  YIDA_OFFICIAL_FUNCTIONS,
  COMMON_MISTAKES
};

// 命令行使用
if (require.main === module) {
  const formula = process.argv[2];
  if (!formula) {
    console.log('用法: node formula_function_validator.js "公式文本"');
    process.exit(1);
  }
  
  try {
    validateFormulaStrict(formula);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
