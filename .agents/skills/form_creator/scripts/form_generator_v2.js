/**
 * 宜搭表单生成器 V2 - 基于标准字段模板
 * 版本: 2.0.0
 * 创建日期: 2026-02-15
 * 
 * 功能: 根据AI输出的结构化配置，生成100%符合宜搭规范的表单JSON
 * 数据来源: 宜搭字段类型.json (从宜搭实际表单复制)
 */

const fs = require('fs');
const path = require('path');
const { FieldTemplates, generateFieldId, i18n } = require('./yida_field_templates');

// ==================== 工具函数 ====================

/**
 * 生成零宽空格包裹的字段名（用于公式）
 * @param {string} fieldName - 字段显示名
 * @returns {string} 零宽空格包裹的字段名
 */
function wrapWithZeroWidthSpace(fieldName) {
  const ZWSP = '\u200B';
  return `${ZWSP}${fieldName}${ZWSP}`;
}

/**
 * 计算公式中所有字段引用的marks位置
 * @param {string} formulaText - 公式文本
 * @param {Array} fields - 字段配置列表
 * @returns {Array} marks数组
 */
function calculateFormulaMarks(formulaText, fields) {
  const marks = [];
  
  for (const field of fields) {
    const wrappedName = wrapWithZeroWidthSpace(field.label);
    let pos = 0;
    
    while ((pos = formulaText.indexOf(wrappedName, pos)) !== -1) {
      marks.push({
        from: pos,
        to: pos + wrappedName.length,
        fieldId: field.fieldId,
        fieldName: field.label
      });
      pos += wrappedName.length;
    }
  }
  
  marks.sort((a, b) => a.from - b.from);
  return marks;
}

/**
 * 验证marks的正确性
 * @param {string} formulaText - 公式文本
 * @param {Array} marks - marks数组
 * @param {Array} fields - 字段列表
 * @returns {boolean} 验证结果
 */
function validateMarks(formulaText, marks, fields) {
  console.log('  [验证] 开始验证marks...');
  
  for (const mark of marks) {
    const extractedText = formulaText.substring(mark.from, mark.to);
    const expectedField = fields.find(f => f.fieldId === mark.fieldId);
    
    if (!expectedField) {
      console.error(`  [验证失败] 找不到fieldId: ${mark.fieldId}`);
      return false;
    }
    
    const expectedText = wrapWithZeroWidthSpace(expectedField.label);
    
    if (extractedText !== expectedText) {
      console.error(`  [验证失败] 位置 ${mark.from}-${mark.to}:`);
      console.error(`    期望: "${expectedText}"`);
      console.error(`    实际: "${extractedText}"`);
      return false;
    }
  }
  
  console.log(`  [验证通过] 共 ${marks.length} 个marks全部正确`);
  return true;
}

/**
 * 替换公式模板中的占位符
 * @param {string} template - 公式模板
 * @param {Array} fields - 字段列表
 * @returns {string} 替换后的公式文本
 */
function replaceFormulaPlaceholders(template, fields) {
  let result = template;
  
  for (const field of fields) {
    const placeholder = `{${field.label}}`;
    const wrappedName = wrapWithZeroWidthSpace(field.label);
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), wrappedName);
  }
  
  return result;
}

// ==================== 主生成器 ====================

class FormGeneratorV2 {
  constructor() {
    this.generatedFields = [];
  }

  /**
   * 生成单个字段
   * @param {Object} fieldConfig - 字段配置
   * @param {number} index - 字段索引
   * @returns {Object} 生成的字段JSON
   */
  generateField(fieldConfig, index) {
    const templateFn = FieldTemplates[fieldConfig.type];
    
    if (!templateFn) {
      throw new Error(`不支持的字段类型: ${fieldConfig.type}`);
    }
    
    console.log(`  [生成] ${fieldConfig.type}: ${fieldConfig.label}`);
    
    const field = templateFn(fieldConfig);
    
    // 保存字段信息
    this.generatedFields.push({
      label: fieldConfig.label,
      fieldId: field.props.fieldId,
      type: fieldConfig.type
    });
    
    // 如果是子表，也需要收集子字段信息以便公式引用
    if (fieldConfig.type === 'TableField' && field.children) {
      for (const childField of field.children) {
        this.generatedFields.push({
          label: childField.props.label.zh_CN,
          fieldId: childField.props.fieldId,
          type: childField.componentName,
          isSubField: true, // 标记为子表字段
          parentLabel: fieldConfig.label
        });
      }
    }
    
    return field;
  }

  /**
   * 处理字段的公式
   * @param {Object} field - 生成的字段
   * @param {Object} fieldConfig - 原始配置
   */
  processFormula(field, fieldConfig) {
    if (fieldConfig.valueType === 'formula' && fieldConfig.formulaTemplate) {
      console.log(`  [公式] 处理公式...`);
        
      const formulaText = replaceFormulaPlaceholders(fieldConfig.formulaTemplate, this.generatedFields);
      const marks = calculateFormulaMarks(formulaText, this.generatedFields);
        
      if (!validateMarks(formulaText, marks, this.generatedFields)) {
        throw new Error('公式 marks验证失败');
      }
        
      // 更新字段的公式和 marks
      if (field.props.complexValue) {
        field.props.complexValue.complexType = 'formula';
        field.props.complexValue.formula = formulaText;
        field.props.complexValue.marks = marks;
        field.props.complexValue.isCmData = true;
      }
        
      field.props.formula = formulaText;
      field.props.valueType = 'formula';
        
      console.log(`  [公式] 生成 ${marks.length} 个 marks`);
    }
      
    // 处理子表内的公式字段
    if (fieldConfig.type === 'TableField' && field.children) {
      for (let i = 0; i < field.children.length; i++) {
        const childField = field.children[i];
        const childConfig = fieldConfig.columns[i];
          
        if (childConfig.valueType === 'formula' && childConfig.formulaTemplate) {
          console.log(`  [子表公式] ${childConfig.label}: ${childConfig.formulaTemplate}`);
            
          // 子表公式只能引用同一子表内的字段
          const subFields = this.generatedFields.filter(f => f.parentLabel === fieldConfig.label);
          const formulaText = replaceFormulaPlaceholders(childConfig.formulaTemplate, subFields);
          const marks = calculateFormulaMarks(formulaText, subFields);
            
          if (childField.props.complexValue) {
            childField.props.complexValue.complexType = 'formula';
            childField.props.complexValue.formula = formulaText;
            childField.props.complexValue.marks = marks;
            childField.props.complexValue.isCmData = true;
          }
            
          childField.props.formula = formulaText;
          childField.props.valueType = 'formula';
            
          console.log(`  [子表公式] 生成 ${marks.length} 个 marks`);
        }
      }
    }
  }

  /**
   * 生成完整表单
   * @param {Object} formConfig - 表单配置
   * @returns {Object} 宜搭标准JSON
   */
  generate(formConfig) {
    console.log(`\n[开始] 生成表单: ${formConfig.formName}`);
    console.log(`[信息] 共 ${formConfig.fields.length} 个字段\n`);
    
    this.generatedFields = [];
    const componentsTree = [];
    
    // 第一遍：生成所有字段
    for (let i = 0; i < formConfig.fields.length; i++) {
      const fieldConfig = formConfig.fields[i];
      const field = this.generateField(fieldConfig, i);
      componentsTree.push({ field, config: fieldConfig });
    }
    
    console.log('');
    
    // 第二遍：处理公式
    for (const { field, config } of componentsTree) {
      this.processFormula(field, config);
    }
    
    const result = {
      type: 'nodeSchema',
      componentsMap: {},
      componentsTree: componentsTree.map(item => item.field)
    };
    
    console.log(`\n[完成] 表单生成成功!\n`);
    
    return result;
  }

  /**
   * 保存生成的JSON到文件
   * @param {Object} formJson - 生成的表单JSON
   * @param {string} outputPath - 输出路径
   */
  saveToFile(formJson, outputPath) {
    const content = JSON.stringify(formJson, null, 2);
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`[保存] 已保存到: ${outputPath}`);
  }
}

// ==================== 导出 ====================

module.exports = {
  FormGeneratorV2,
  FieldTemplates,
  generateFieldId,
  wrapWithZeroWidthSpace,
  calculateFormulaMarks,
  validateMarks,
  replaceFormulaPlaceholders
};

// ==================== 命令行入口 ====================

if (require.main === module) {
  const configPath = process.argv[2];
  
  if (!configPath) {
    console.log('用法: node form_generator_v2.js <配置文件路径>');
    console.log('示例: node form_generator_v2.js ./config/employee_form.js');
    process.exit(1);
  }
  
  const fullPath = path.resolve(configPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`错误: 配置文件不存在: ${fullPath}`);
    process.exit(1);
  }
  
  delete require.cache[require.resolve(fullPath)];
  const formConfig = require(fullPath);
  
  const generator = new FormGeneratorV2();
  const formJson = generator.generate(formConfig);
  
  const outputName = formConfig.formName.replace(/\s+/g, '_') + '.json';
  // 单表输出到根目录的 单表/ 文件夹下
  const outputPath = path.join(__dirname, '..', '..', '..', '..', '单表', outputName);
  
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  generator.saveToFile(formJson, outputPath);
}
