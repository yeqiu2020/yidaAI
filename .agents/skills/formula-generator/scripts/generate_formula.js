/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 宜搭公式生成器 - 核心实现
 * 版本: 2.3.0
 *
 * 提供公式生成和marks位置计算的核心功能
 * 修复: marks位置现在包含零宽空格，与宜搭实际格式一致
 * 修复: 子表字段 marks 位置计算 - 必须将 "子表名.字段名" 作为整体标记
 */

const fs = require('fs');
const path = require('path');

// 零宽空格字符
const ZERO_WIDTH_SPACE = '\u200b';

/**
 * 字段配置类
 */
class FieldConfig {
  constructor(displayName, fieldId) {
    this.displayName = displayName;
    this.fieldId = fieldId;
  }
}

/**
 * 查找所有字段在公式文本中的位置
 * @param {string} text - 公式文本（包含零宽空格包裹的字段名）
 * @param {Array<FieldConfig>} fields - 字段配置数组
 * @returns {Array<Object>} marks数组
 */
function findFieldPositions(text, fields) {
  const marks = [];

  fields.forEach(field => {
    // 查找所有出现的位置（支持1个或多个零宽空格包裹）
    const fieldName = field.displayName;
    const zwsPattern = new RegExp(`\u200b+${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\u200b+`, 'g');
    
    let match;
    while ((match = zwsPattern.exec(text)) !== null) {
      const wrappedField = match[0];
      const pos = match.index;
      
      // 计算左侧零宽空格数量
      const leftZwsCount = (wrappedField.match(new RegExp(`^\u200b+`, 'g')) || [''])[0].length;
      // 计算右侧零宽空格数量
      const rightZwsCount = (wrappedField.match(new RegExp(`\u200b+$`, 'g')) || [''])[0].length;
      
      // 宜搭marks需要包含零宽空格的位置
      // from: 包含左侧零宽空格的起始位置
      // to: 包含右侧零宽空格的结束位置
      const from = pos; // 从零宽空格开始
      const to = pos + wrappedField.length; // 到零宽空格结束

      marks.push({
        from: { line: 0, ch: from, sticky: null },
        to: { line: 0, ch: to, sticky: null },
        value: field.fieldId,
        invalid: false
      });
    }
  });

  return marks;
}

/**
 * 验证marks位置是否正确
 * @param {string} text - 公式文本
 * @param {Array<Object>} marks - marks数组
 * @param {Array<FieldConfig>} fields - 字段配置数组
 * @throws {Error} 验证失败时抛出错误
 */
function validateMarks(text, marks, fields) {
  marks.forEach((mark, index) => {
    const extracted = text.substring(mark.from.ch, mark.to.ch);
    const field = fields.find(f => f.fieldId === mark.value);

    if (!field) {
      throw new Error(`Mark ${index}: 找不到对应的字段配置 (value: ${mark.value})`);
    }

    // marks现在包含零宽空格，所以提取的内容应该是 "​字段名​"
    const expectedWithZws = ZERO_WIDTH_SPACE + field.displayName + ZERO_WIDTH_SPACE;
    if (extracted !== expectedWithZws) {
      throw new Error(
        `Mark ${index} 位置验证失败: ` +
        `期望 "${expectedWithZws}", 实际 "${extracted}" ` +
        `(位置: ${mark.from.ch}-${mark.to.ch})`
      );
    }
  });

  console.log(`✅ 所有 ${marks.length} 个字段标记位置验证通过`);
}

/**
 * 生成宜搭公式JSON
 * @param {string} formulaText - 公式文本（已包含零宽空格包裹的字段名）
 * @param {Array<FieldConfig>} fields - 字段配置数组（可为空数组，表示纯系统函数公式）
 * @returns {Object} 宜搭公式JSON对象
 */
function generateFormula(formulaText, fields) {
  // 查找所有字段位置
  const marks = findFieldPositions(formulaText, fields);

  // 验证marks数量（允许空字段数组，支持纯系统函数公式如 NOW(), TODAY() 等）
  if (marks.length === 0 && fields.length > 0) {
    throw new Error('未找到任何字段标记，请检查字段名是否正确');
  }
  
  // 纯系统函数公式（无字段引用）的场景
  if (marks.length === 0 && fields.length === 0) {
    console.log('ℹ️  检测到纯系统函数公式，无字段引用');
  }

  const expectedMarks = fields.reduce((sum, f) => {
    const wrappedField = ZERO_WIDTH_SPACE + f.displayName + ZERO_WIDTH_SPACE;
    const count = (formulaText.match(new RegExp(wrappedField, 'g')) || []).length;
    return sum + count;
  }, 0);

  if (marks.length !== expectedMarks) {
    console.warn(`警告: 找到 ${marks.length} 个标记，期望 ${expectedMarks} 个`);
  }

  // 验证marks位置
  validateMarks(formulaText, marks, fields);

  // 构建宜搭公式JSON
  return {
    text: formulaText,
    marks: marks,
    isCmData: true
  };
}

/**
 * 保存公式到文件
 * @param {Object} formulaJson - 宜搭公式JSON对象
 * @param {string} outputPath - 输出文件路径
 */
function saveFormula(formulaJson, outputPath) {
  // 确保目录存在
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 写入文件
  fs.writeFileSync(outputPath, JSON.stringify(formulaJson, null, 2), 'utf8');
  console.log(`✅ 公式JSON已生成: ${outputPath}`);
}

/**
 * 生成并保存公式（主函数）
 * @param {string} formulaText - 公式文本（已包含零宽空格包裹的字段名）
 * @param {Array<FieldConfig>} fields - 字段配置数组
 * @param {string} outputPath - 输出文件路径
 * @returns {Object} 生成的公式JSON
 */
function generateAndSaveFormula(formulaText, fields, outputPath) {
  // 验证公式文本格式
  if (!formulaText || formulaText.trim() === '') {
    throw new Error('公式文本不能为空');
  }

  // 检查括号匹配
  const leftBrackets = (formulaText.match(/\(/g) || []).length;
  const rightBrackets = (formulaText.match(/\)/g) || []).length;
  if (leftBrackets !== rightBrackets) {
    throw new Error(`括号不匹配: 左括号${leftBrackets}个，右括号${rightBrackets}个`);
  }

  // 检查换行符
  if (formulaText.includes('\n')) {
    throw new Error('公式文本不能包含换行符');
  }

  console.log(`✅ 公式格式验证通过 - 括号: ${leftBrackets}对, 无换行符`);

  // 生成公式JSON
  const formulaJson = generateFormula(formulaText, fields);

  // 保存到文件
  saveFormula(formulaJson, outputPath);

  return formulaJson;
}

module.exports = {
  generateAndSaveFormula,
  generateFormula,
  saveFormula,
  findFieldPositions,
  validateMarks,
  FieldConfig,
  ZERO_WIDTH_SPACE
};
