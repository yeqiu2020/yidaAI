/**
 * 读取 Excel 文件内容
 * 版本: 2.0.0
 * 更新日期: 2026-02-16
 *
 * 支持解析字段括号说明:
 * 1. 字段名（字段类型）- 如: 客户编号（流水号）
 * 2. 字段名（选项1/选项2）- 如: 交货状态（未交货/发货中/正常交货）
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = path.join(__dirname, '项目字段表', '进销存管理.xlsx');

if (!fs.existsSync(excelPath)) {
  console.error('错误: Excel 文件不存在:', excelPath);
  process.exit(1);
}

/**
 * 解析字段字符串，提取字段名、类型说明、选项值
 * @param {string} fieldStr - 字段字符串，如 "客户编号（流水号）" 或 "交货状态（未交货/发货中）"
 * @returns {Object} 解析结果 { name: string, typeHint: string|null, options: string[]|null }
 */
function parseField(fieldStr) {
  if (!fieldStr || typeof fieldStr !== 'string') {
    return null;
  }

  // 去除前后空格
  fieldStr = fieldStr.trim();

  // 匹配括号内容: 字段名（括号内容）
  const bracketMatch = fieldStr.match(/^(.+?)（(.+?)）$/);

  if (bracketMatch) {
    const name = bracketMatch[1].trim();
    const bracketContent = bracketMatch[2].trim();

    // 判断括号内容是否包含斜杠，包含则是选项值
    if (bracketContent.includes('/') || bracketContent.includes('、')) {
      // 是选项值，用/或、分隔
      const options = bracketContent.split(/[\/、]/).map(opt => opt.trim()).filter(opt => opt);
      return {
        name,
        typeHint: null,
        options,
        isOptions: true
      };
    } else {
      // 是字段类型说明
      return {
        name,
        typeHint: bracketContent,
        options: null,
        isOptions: false
      };
    }
  }

  // 没有括号，返回原始字段名
  return {
    name: fieldStr,
    typeHint: null,
    options: null,
    isOptions: false
  };
}

/**
 * 解析字段列表字符串
 * @param {string} fieldsStr - 字段列表，如 "字段1、字段2（类型）、字段3（选项A/选项B）"
 * @returns {Array} 解析后的字段数组
 */
function parseFields(fieldsStr) {
  if (!fieldsStr || typeof fieldsStr !== 'string') {
    return [];
  }

  // 使用顿号、逗号分隔字段
  const fieldList = fieldsStr.split(/[、,]/).map(f => f.trim()).filter(f => f);

  return fieldList.map(fieldStr => parseField(fieldStr)).filter(f => f !== null);
}

console.log('正在读取 Excel 文件...\n');

try {
  const workbook = xlsx.readFile(excelPath);

  console.log('工作表列表:', workbook.SheetNames);
  console.log('');

  workbook.SheetNames.forEach((sheetName, index) => {
    console.log(`=== 工作表 ${index + 1}: ${sheetName} ===`);
    const sheet = workbook.Sheets[sheetName];

    console.log('\n方式1: sheet_to_json (header: 1):');
    const data1 = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    data1.forEach((row, rowIndex) => {
      if (row.length > 0) {
        console.log(`行 ${rowIndex + 1}:`, row);
      }
    });

    console.log('\n方式2: sheet_to_json (默认，带解析):');
    const data2 = xlsx.utils.sheet_to_json(sheet);
    data2.forEach((row, rowIndex) => {
      console.log(`\n行 ${rowIndex + 1}:`, row);

      // 解析主表字段
      if (row['主表字段']) {
        const mainFields = parseFields(row['主表字段']);
        console.log('  [主表字段解析]:');
        mainFields.forEach((field, i) => {
          if (field.isOptions) {
            console.log(`    ${i + 1}. ${field.name} [选项: ${field.options.join('/')}]`);
          } else if (field.typeHint) {
            console.log(`    ${i + 1}. ${field.name} [类型: ${field.typeHint}]`);
          } else {
            console.log(`    ${i + 1}. ${field.name}`);
          }
        });
      }

      // 解析子表1字段
      if (row['子表1字段']) {
        const subFields1 = parseFields(row['子表1字段']);
        console.log('  [子表1字段解析]:');
        subFields1.forEach((field, i) => {
          if (field.isOptions) {
            console.log(`    ${i + 1}. ${field.name} [选项: ${field.options.join('/')}]`);
          } else if (field.typeHint) {
            console.log(`    ${i + 1}. ${field.name} [类型: ${field.typeHint}]`);
          } else {
            console.log(`    ${i + 1}. ${field.name}`);
          }
        });
      }

      // 解析子表2字段
      if (row['子表2字段']) {
        const subFields2 = parseFields(row['子表2字段']);
        console.log('  [子表2字段解析]:');
        subFields2.forEach((field, i) => {
          if (field.isOptions) {
            console.log(`    ${i + 1}. ${field.name} [选项: ${field.options.join('/')}]`);
          } else if (field.typeHint) {
            console.log(`    ${i + 1}. ${field.name} [类型: ${field.typeHint}]`);
          } else {
            console.log(`    ${i + 1}. ${field.name}`);
          }
        });
      }
    });

    console.log('');
  });

  // 导出解析函数供其他模块使用
  module.exports = {
    parseField,
    parseFields
  };

} catch (error) {
  console.error('读取 Excel 文件失败:', error.message);
  console.error(error.stack);
}
