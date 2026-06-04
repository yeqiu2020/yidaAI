/**
 * 同步工具模块
 * 版本: 1.0.0
 * 更新日期: 2026-04-29
 * 
 * 功能: 提取公共函数，供所有同步脚本使用，消除代码重复
 */

const fs = require('fs');
const path = require('path');

/**
 * 组件类型中文映射表
 */
const COMPONENT_TYPE_MAP = {
  'TextField': '单行文本',
  'TextareaField': '多行文本',
  'NumberField': '数值',
  'SelectField': '下拉单选',
  'MultiSelectField': '下拉多选',
  'RadioField': '单选',
  'CheckboxField': '多选',
  'DateField': '日期',
  'DateRangeField': '日期范围',
  'EmployeeField': '成员',
  'DepartmentField': '部门',
  'DepartmentSelectField': '部门',
  'AssociationFormField': '关联表单',
  'AssociationFormMultiSelectField': '关联表单多选',
  'ImageField': '图片',
  'AttachmentField': '附件',
  'TableField': '子表单',
  'SerialNumberField': '流水号',
  'SubformField': '关联子表单',
  'AddressField': '地址',
  'LocationField': '定位',
  'CascadeSelectField': '级联选择',
  'TreeSelectField': '树形选择',
  'ColumnsLayout': '列布局',
  'Column': '列',
  'Button': '按钮'
};

/**
 * 获取组件类型的中文名称
 * @param {string} componentName - 组件英文名称
 * @returns {string} 组件中文名称
 */
function getComponentTypeCN(componentName) {
  return COMPONENT_TYPE_MAP[componentName] || componentName;
}

/**
 * 从组件中提取标签文本
 * @param {Object} label - 标签对象或字符串
 * @returns {string} 标签文本
 */
function getLabelText(label, content) {
  // Button 组件使用 content 代替 label 存储显示文本
  const text = label || content;
  if (!text) return '未命名';
  if (typeof text === 'string') return text;
  return text.zh_CN || text.en_US || '未命名';
}

/**
 * 递归提取组件信息（包括子表字段）
 * @param {Array} components - 组件树
 * @param {Array} result - 结果数组
 * @param {Object} parentTable - 父级子表信息
 */
function extractComponents(components, result, parentTable = null) {
  if (!Array.isArray(components)) return;

  for (const comp of components) {
    // 如果是子表组件，先把它本身加入result，再递归处理其子组件（子表字段）
    if (comp.componentName === 'TableField') {
      // 添加子表组件本身
      if (comp.props && comp.props.fieldId) {
        result.push({
          componentName: comp.componentName,
          fieldName: getLabelText(comp.props.label, comp.props.content),
          fieldId: comp.props.fieldId,
          nodeId: comp.id,
          isTableField: true // 标记为子表组件
        });
      }
      
      // 递归处理子表内的字段
      if (comp.children && Array.isArray(comp.children)) {
        const tableInfo = {
          fieldId: comp.props?.fieldId,
          fieldName: getLabelText(comp.props?.label, comp.props?.content)
        };
        extractComponents(comp.children, result, tableInfo);
      }
      continue;
    }

    // 跳过布局组件（不影响子表字段提取）
    if (['GroupContainer', 'ColumnContainer', 'ColumnsLayout', 'Column', 'Section'].includes(comp.componentName)) {
      if (comp.children && Array.isArray(comp.children)) {
        extractComponents(comp.children, result, parentTable);
      }
      continue;
    }

    if (comp.props && comp.props.fieldId) {
      const compInfo = {
        componentName: comp.componentName,
        fieldName: getLabelText(comp.props.label, comp.props.content),
        fieldId: comp.props.fieldId,
        nodeId: comp.id
      };
      
      // 如果是子表内的字段，记录父级子表信息
      if (parentTable) {
        compInfo.parentTable = parentTable;
      }
      
      result.push(compInfo);
    }
    
    // 递归处理其他子组件
    if (comp.children && Array.isArray(comp.children)) {
      extractComponents(comp.children, result, parentTable);
    }
  }
}

/**
 * 生成组件ID清单
 * 格式与字段清单一致：主表字段和子表字段分开为独立的表格
 * @param {string} formDir - 表单目录
 * @param {string} formName - 表单名称
 * @param {string} formType - 表单类型
 * @param {string} schemaFilePath - Schema文件路径
 */
function generateComponentList(formDir, formName, formType, schemaFilePath) {
  try {
    if (!fs.existsSync(schemaFilePath)) {
      return;
    }
    
    const schema = JSON.parse(fs.readFileSync(schemaFilePath, 'utf-8'));
    
    // 提取组件信息（包括子表字段）
    const components = [];
    if (schema.componentsTree && Array.isArray(schema.componentsTree)) {
      extractComponents(schema.componentsTree, components);
    }
    
    // 分离主表字段和子表
    // 主表字段：没有parentTable且不是子表组件的字段
    const mainFields = components.filter(c => !c.parentTable && !c.isTableField);
    // 子表组件本身（TableField）
    const tableFields = components.filter(c => c.isTableField);
    // 子表内的字段
    const subTableFields = components.filter(c => c.parentTable);
    
    // 按子表分组子表字段
    const subTableGroups = {};
    for (const field of subTableFields) {
      const tableId = field.parentTable.fieldId;
      const tableName = field.parentTable.fieldName;
      if (!subTableGroups[tableId]) {
        subTableGroups[tableId] = {
          name: tableName,
          fieldId: tableId,
          fields: []
        };
      }
      subTableGroups[tableId].fields.push(field);
    }
    
    // 生成Markdown内容
    let mdContent = `# ${formName}「${formType}」- 组件ID清单\n\n`;
    mdContent += `> 生成日期: ${new Date().toISOString().split('T')[0]}\n`;
    mdContent += `> 同步来源: 宜搭平台\n\n`;
    mdContent += `---\n\n`;
    
    // 主表字段表格
    mdContent += `## 📋 主表字段\n\n`;
    mdContent += `| 序号 | 组件类型 | 字段名称 | 组件ID (fieldId) |\n`;
    mdContent += `|:---:|---------|---------|-----------------|\n`;
    
    for (let i = 0; i < mainFields.length; i++) {
      const comp = mainFields[i];
      const componentTypeCN = getComponentTypeCN(comp.componentName);
      mdContent += `| ${i + 1} | ${componentTypeCN} | ${comp.fieldName} | ${comp.fieldId} |\n`;
    }
    
    // 子表字段表格（每个子表一个独立的表格，标题包含子表ID）
    for (const tableId in subTableGroups) {
      const tableInfo = subTableGroups[tableId];
      mdContent += `\n## 📋 子表：${tableInfo.name} (${tableInfo.fieldId})\n\n`;
      mdContent += `| 序号 | 组件类型 | 字段名称 | 组件ID (fieldId) |\n`;
      mdContent += `|:---:|---------|---------|-----------------|\n`;
      
      for (let i = 0; i < tableInfo.fields.length; i++) {
        const comp = tableInfo.fields[i];
        const componentTypeCN = getComponentTypeCN(comp.componentName);
        mdContent += `| ${i + 1} | ${componentTypeCN} | ${comp.fieldName} | ${comp.fieldId} |\n`;
      }
    }
    
    // 统计信息
    mdContent += `\n---\n\n`;
    mdContent += `## 📊 统计信息\n\n`;
    mdContent += `| 统计项 | 数量 |\n`;
    mdContent += `|--------|------|\n`;
    mdContent += `| 组件总数 | ${components.length} |\n`;
    mdContent += `| 主表字段 | ${mainFields.length} |\n`;
    mdContent += `| 子表数量 | ${tableFields.length} |\n`;
    mdContent += `| 子表字段 | ${subTableFields.length} |\n`;
    mdContent += `\n---\n\n`;
    mdContent += `*最后更新时间: ${new Date().toISOString().split('T')[0]}*\n`;
    
    // 写入文件
    const outputFile = path.join(formDir, '组件ID清单.md');
    fs.writeFileSync(outputFile, mdContent, 'utf-8');
    
    console.log(`     📝 组件ID清单已生成 (${components.length}个组件，主表${mainFields.length}个，子表${tableFields.length}个，子表字段${subTableFields.length}个)`);
  } catch (error) {
    console.log(`     ⚠️  生成组件ID清单失败: ${error.message}`);
  }
}

module.exports = {
  COMPONENT_TYPE_MAP,
  getComponentTypeCN,
  getLabelText,
  extractComponents,
  generateComponentList
};
