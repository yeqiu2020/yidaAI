/**
 * 配置读取器 - 读取系统配置清单和组件ID清单
 * 版本: v1.0.0
 * 创建日期: 2026-03-15
 */

const fs = require('fs');
const path = require('path');

/**
 * 读取系统配置清单
 * @param {string} projectPath 项目根目录
 * @returns {Object}
 */
function readSystemConfig(projectPath) {
  const configPath = path.join(projectPath, '系统配置清单.md');
  
  if (!fs.existsSync(configPath)) {
    return {
      success: false,
      error: '未找到系统配置清单.md，请先同步配置'
    };
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parseSystemConfig(content);
  } catch (error) {
    return {
      success: false,
      error: `读取系统配置清单失败: ${error.message}`
    };
  }
}

/**
 * 解析系统配置清单内容
 * @param {string} content 
 * @returns {Object}
 */
function parseSystemConfig(content) {
  const config = {
    success: true,
    appId: null,
    appName: null,
    forms: []
  };
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    // 解析应用ID
    const appIdMatch = line.match(/应用ID[:：]\s*(APP_[A-Z0-9]+)/);
    if (appIdMatch) {
      config.appId = appIdMatch[1];
    }
    
    // 解析应用名称
    const appNameMatch = line.match(/应用名称[:：]\s*(.+)/);
    if (appNameMatch) {
      config.appName = appNameMatch[1].trim();
    }
    
    // 解析表单表格行
    // | 序号 | 表单名称 | 表单类型 | 表单UUID | ...
    const formMatch = line.match(/^\|\s*\d+\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (formMatch) {
      const formName = formMatch[1].trim();
      const formType = formMatch[2].trim();
      const formUuid = formMatch[3].trim();
      
      if (formName && formUuid && formUuid.startsWith('FORM-')) {
        config.forms.push({
          name: formName,
          type: formType,
          uuid: formUuid
        });
      }
    }
  }
  
  return config;
}

/**
 * 根据表单名称查找表单信息
 * @param {string} projectPath 
 * @param {string} formName 
 * @returns {Object|null}
 */
function findFormByName(projectPath, formName) {
  const config = readSystemConfig(projectPath);
  
  if (!config.success) {
    return null;
  }
  
  // 精确匹配
  let form = config.forms.find(f => f.name === formName);
  
  // 模糊匹配
  if (!form) {
    form = config.forms.find(f => 
      f.name.includes(formName) || formName.includes(f.name)
    );
  }
  
  if (form) {
    return {
      ...form,
      appId: config.appId,
      appName: config.appName
    };
  }
  
  return null;
}

/**
 * 根据表单UUID查找表单目录
 * @param {string} projectPath 
 * @param {string} formUuid 
 * @returns {string|null}
 */
function findFormDirectory(projectPath, formUuid) {
  // 遍历项目目录查找包含该表单的目录
  const entries = fs.readdirSync(projectPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subEntries = fs.readdirSync(path.join(projectPath, entry.name), { withFileTypes: true });
      
      for (const subEntry of subEntries) {
        if (subEntry.isDirectory() && subEntry.name.includes(formUuid.substring(0, 20))) {
          return path.join(projectPath, entry.name, subEntry.name);
        }
      }
    }
  }
  
  return null;
}

/**
 * 读取组件ID清单
 * @param {string} formPath 表单目录路径
 * @returns {Object}
 */
function readComponentList(formPath) {
  const listPath = path.join(formPath, '组件ID清单.md');
  
  if (!fs.existsSync(listPath)) {
    return {
      success: false,
      error: '未找到组件ID清单.md，请先同步配置'
    };
  }
  
  try {
    const content = fs.readFileSync(listPath, 'utf-8');
    return {
      success: true,
      components: parseComponentList(content)
    };
  } catch (error) {
    return {
      success: false,
      error: `读取组件ID清单失败: ${error.message}`
    };
  }
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
  let mainIndex = 0;
  
  for (const line of lines) {
    // 匹配主表字段: | 1 | 单行文本 | 产品名称 | textField_xxx |
    const mainMatch = line.match(/^\|\s*(\d+)\.?\d*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (mainMatch) {
      const index = mainMatch[1];
      const type = mainMatch[2].trim();
      const name = mainMatch[3].trim();
      const id = mainMatch[4].trim();
      
      const comp = {
        index: index,
        componentName: type,
        fieldName: name,
        fieldId: id,
        isTableField: type === '子表单',
        children: type === '子表单' ? [] : null
      };
      
      if (comp.isTableField) {
        currentTable = comp;
      }
      
      components.push(comp);
    }
    
    // 匹配子表字段: | 12.1 | 单行文本 | 产品名称 | textField_xxx |
    const subMatch = line.match(/^\|\s*(\d+)\.(\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (subMatch && currentTable) {
      const parentIndex = subMatch[1];
      const subIndex = subMatch[2];
      const type = subMatch[3].trim();
      const name = subMatch[4].trim();
      const id = subMatch[5].trim();
      
      currentTable.children.push({
        parentIndex: parentIndex,
        index: subIndex,
        componentName: type,
        fieldName: name,
        fieldId: id,
        parentTable: currentTable.fieldName,
        parentTableId: currentTable.fieldId
      });
    }
  }
  
  return components;
}

/**
 * 根据字段名称查找字段
 * @param {Array} components 
 * @param {string} fieldName 
 * @returns {Object|null}
 */
function findFieldByName(components, fieldName) {
  // 精确匹配
  for (const comp of components) {
    if (comp.fieldName === fieldName) {
      return comp;
    }
    
    // 查找子表字段
    if (comp.children) {
      for (const child of comp.children) {
        if (child.fieldName === fieldName) {
          return {
            ...child,
            isSubtableField: true,
            subtableName: comp.fieldName,
            subtableId: comp.fieldId
          };
        }
      }
    }
  }
  
  // 模糊匹配
  for (const comp of components) {
    if (comp.fieldName.includes(fieldName) || fieldName.includes(comp.fieldName)) {
      return comp;
    }
    
    if (comp.children) {
      for (const child of comp.children) {
        if (child.fieldName.includes(fieldName) || fieldName.includes(child.fieldName)) {
          return {
            ...child,
            isSubtableField: true,
            subtableName: comp.fieldName,
            subtableId: comp.fieldId
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * 根据字段ID查找字段
 * @param {Array} components 
 * @param {string} fieldId 
 * @returns {Object|null}
 */
function findFieldById(components, fieldId) {
  for (const comp of components) {
    if (comp.fieldId === fieldId) {
      return comp;
    }
    
    if (comp.children) {
      for (const child of comp.children) {
        if (child.fieldId === fieldId) {
          return {
            ...child,
            isSubtableField: true,
            subtableName: comp.fieldName,
            subtableId: comp.fieldId
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * 获取所有表单列表
 * @param {string} projectPath 
 * @returns {Array}
 */
function getAllForms(projectPath) {
  const config = readSystemConfig(projectPath);
  
  if (!config.success) {
    return [];
  }
  
  return config.forms.map(f => ({
    name: f.name,
    type: f.type,
    uuid: f.uuid,
    appId: config.appId
  }));
}

/**
 * 获取表单完整信息
 * @param {string} projectPath 
 * @param {string} formName 
 * @returns {Object}
 */
function getFormFullInfo(projectPath, formName) {
  const form = findFormByName(projectPath, formName);
  
  if (!form) {
    return {
      success: false,
      error: `未找到表单: ${formName}`
    };
  }
  
  const formPath = findFormDirectory(projectPath, form.uuid);
  
  if (!formPath) {
    return {
      success: false,
      error: `未找到表单目录: ${formName}`
    };
  }
  
  const componentList = readComponentList(formPath);
  
  if (!componentList.success) {
    return {
      success: false,
      error: componentList.error
    };
  }
  
  return {
    success: true,
    form: {
      ...form,
      path: formPath
    },
    components: componentList.components
  };
}

module.exports = {
  readSystemConfig,
  parseSystemConfig,
  findFormByName,
  findFormDirectory,
  readComponentList,
  parseComponentList,
  findFieldByName,
  findFieldById,
  getAllForms,
  getFormFullInfo
};
