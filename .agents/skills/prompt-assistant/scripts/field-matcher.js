/**
 * 字段匹配器 - 根据用户描述匹配字段ID
 * 版本: v1.0.0
 * 创建日期: 2026-03-15
 */

const fs = require('fs');
const path = require('path');

/**
 * 字段语义匹配规则
 */
const FIELD_PATTERNS = {
  // 日期字段
  date: {
    '开始日期': ['开始', '起始', 'start', 'begin', '从', '起始日期'],
    '结束日期': ['结束', '截止', '终止', 'end', '到', '截止日期', '结束时间'],
    '创建日期': ['创建', '登记', '录入', '创建时间', '登记日期'],
    '更新日期': ['更新', '修改', '最后', '更新时间', '修改时间'],
    '入库日期': ['入库', '入库时间', '入库日期'],
    '出库日期': ['出库', '出库时间', '出库日期']
  },
  // 数值字段
  number: {
    '金额': ['金额', '价格', '总价', '合计', '总金额', '总额'],
    '数量': ['数量', '个数', '件数', 'count', 'quantity', '数目'],
    '单价': ['单价', '价格', 'unit', '单价金额'],
    '库存': ['库存', '存量', '剩余', '库存数量', '库存量'],
    '成本': ['成本', '成本价', '成本金额'],
    '利润': ['利润', '盈利', '收益']
  },
  // 文本字段
  text: {
    '名称': ['名称', '名字', 'name', '标题', '品名'],
    '编号': ['编号', '编码', 'code', 'no', '序号', '单号'],
    '备注': ['备注', '说明', '描述', 'memo', '注释'],
    '地址': ['地址', '位置', '地点', 'addr'],
    '电话': ['电话', '手机', '联系方式', 'tel', 'phone']
  },
  // 成员字段
  employee: {
    '负责人': ['负责人', '责任人', '经办人', '处理人'],
    '创建人': ['创建人', '登记人', '录入人', '制单人'],
    '审批人': ['审批人', '审核人', '批准人']
  },
  // 部门字段
  department: {
    '部门': ['部门', '所属部门', 'dept'],
    '创建部门': ['创建部门', '登记部门']
  }
};

/**
 * 计算字符串相似度（简单版）
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} 相似度 0-1
 */
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // 计算共同字符数
  const set1 = new Set(s1);
  const set2 = new Set(s2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  return intersection.size / Math.max(set1.size, set2.size);
}

/**
 * 根据描述匹配字段
 * @param {string} description 用户描述的字段名
 * @param {Array} components 组件列表
 * @param {string} componentType 字段类型（可选）
 * @returns {Object|null} 匹配到的字段信息
 */
function matchField(description, components, componentType = null) {
  let bestMatch = null;
  let bestScore = 0;
  
  // 遍历所有组件
  for (const comp of components) {
    // 如果指定了类型，先过滤类型
    if (componentType && comp.componentName !== componentType) {
      continue;
    }
    
    const fieldName = comp.fieldName || '';
    let score = calculateSimilarity(description, fieldName);
    
    // 检查语义匹配规则
    for (const [category, patterns] of Object.entries(FIELD_PATTERNS)) {
      for (const [standardName, keywords] of Object.entries(patterns)) {
        // 检查用户描述是否包含关键词
        const descMatch = keywords.some(kw => description.includes(kw));
        // 检查字段名是否包含关键词
        const fieldMatch = keywords.some(kw => fieldName.includes(kw));
        
        if (descMatch && fieldMatch) {
          score += 0.3; // 语义匹配加分
        }
      }
    }
    
    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = comp;
    }
  }
  
  return bestMatch;
}

/**
 * 批量匹配多个字段
 * @param {Array} descriptions 字段描述列表
 * @param {Array} components 组件列表
 * @returns {Array} 匹配结果列表
 */
function matchFields(descriptions, components) {
  return descriptions.map(desc => {
    const match = matchField(desc, components);
    return {
      description: desc,
      matched: !!match,
      field: match ? {
        name: match.fieldName,
        id: match.fieldId,
        type: match.componentName
      } : null,
      alternatives: match ? null : findAlternatives(desc, components, 3)
    };
  });
}

/**
 * 查找备选字段
 * @param {string} description 
 * @param {Array} components 
 * @param {number} count 返回数量
 * @returns {Array} 备选字段列表
 */
function findAlternatives(description, components, count = 3) {
  const scored = components.map(comp => ({
    ...comp,
    score: calculateSimilarity(description, comp.fieldName)
  }));
  
  scored.sort((a, b) => b.score - a.score);
  
  return scored.slice(0, count).map(c => ({
    name: c.fieldName,
    id: c.fieldId,
    type: c.componentName,
    score: c.score
  }));
}

/**
 * 识别子表字段
 * @param {string} description 
 * @param {Array} components 
 * @returns {Object|null}
 */
function matchSubtableField(description, components) {
  // 查找包含子表字段的描述
  // 例如："产品详情子表的产品名称"
  
  const subtableMatch = description.match(/(.+?)[子表表]*[内的]*(.+)/);
  if (!subtableMatch) return null;
  
  const subtableDesc = subtableMatch[1].trim();
  const fieldDesc = subtableMatch[2].trim();
  
  // 匹配子表
  const subtable = components.find(c => 
    c.componentName === 'TableField' && 
    calculateSimilarity(subtableDesc, c.fieldName) > 0.6
  );
  
  if (!subtable || !subtable.children) return null;
  
  // 匹配子表字段
  const field = matchField(fieldDesc, subtable.children);
  
  if (field) {
    return {
      isSubtable: true,
      subtable: {
        name: subtable.fieldName,
        id: subtable.fieldId
      },
      field: {
        name: field.fieldName,
        id: field.fieldId,
        type: field.componentName
      }
    };
  }
  
  return null;
}

/**
 * 解析用户需求的字段
 * @param {string} userInput 用户输入
 * @param {string} formPath 表单目录路径
 * @returns {Object} 解析结果
 */
async function parseFieldsFromInput(userInput, formPath) {
  // 读取组件ID清单
  const componentListPath = path.join(formPath, '组件ID清单.md');
  
  if (!fs.existsSync(componentListPath)) {
    return {
      success: false,
      error: '未找到组件ID清单，请先同步配置'
    };
  }
  
  // 解析组件ID清单
  const content = fs.readFileSync(componentListPath, 'utf-8');
  const components = parseComponentList(content);
  
  // 提取可能的字段描述（简单实现，后续可优化）
  const fieldDescriptions = extractFieldDescriptions(userInput);
  
  // 匹配字段
  const matchedFields = matchFields(fieldDescriptions, components);
  
  return {
    success: true,
    fields: matchedFields,
    allComponents: components
  };
}

/**
 * 解析组件ID清单内容
 * @param {string} content 
 * @returns {Array}
 */
function parseComponentList(content) {
  const components = [];
  const lines = content.split('\n');
  
  let currentTable = null;
  
  for (const line of lines) {
    // 匹配主表字段: | 1 | 单行文本 | 产品名称 | textField_xxx |
    const mainMatch = line.match(/^\|\s*\d+\.?\d*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (mainMatch) {
      const comp = {
        componentName: mainMatch[1].trim(),
        fieldName: mainMatch[2].trim(),
        fieldId: mainMatch[3].trim()
      };
      
      if (comp.componentName === '子表单') {
        comp.isTableField = true;
        comp.children = [];
        currentTable = comp;
      }
      
      components.push(comp);
    }
    
    // 匹配子表字段: | 12.1 | 单行文本 | 产品名称 | textField_xxx |
    const subMatch = line.match(/^\|\s*(\d+)\.(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (subMatch && currentTable) {
      currentTable.children.push({
        componentName: subMatch[3].trim(),
        fieldName: subMatch[4].trim(),
        fieldId: subMatch[5].trim(),
        parentTable: currentTable.fieldName
      });
    }
  }
  
  return components;
}

/**
 * 从用户输入中提取字段描述
 * @param {string} input 
 * @returns {Array}
 */
function extractFieldDescriptions(input) {
  // 简单的提取逻辑，后续可用NLP优化
  const descriptions = [];
  
  // 匹配"XX字段"、"XX列"、"XX"等模式
  const patterns = [
    /[""']([^""']+?)[""'](?:字段|列)/g,
    /(\S+?)(?:字段|列)/g,
    /的(\S+?)(?:和|与|以及|$)/g
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      if (match[1] && match[1].length > 1) {
        descriptions.push(match[1].trim());
      }
    }
  }
  
  return [...new Set(descriptions)]; // 去重
}

module.exports = {
  matchField,
  matchFields,
  matchSubtableField,
  parseFieldsFromInput,
  findAlternatives,
  FIELD_PATTERNS
};
