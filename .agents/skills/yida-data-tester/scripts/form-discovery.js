/**
 * 表单发现模块 - 自动从项目目录发现表单
 * 版本: 1.0.1
 * 
 * 功能：
 * 1. 从系统配置清单读取表单列表
 * 2. 从项目目录结构自动发现表单
 * 3. 支持按名称筛选表单
 */

const fs = require('fs');
const path = require('path');

/**
 * 从系统配置清单读取表单列表
 * @param {string} configPath - 系统配置清单文件路径
 * @returns {Array} 表单列表 [{name, type, uuid, dir}]
 */
function discoverFormsFromConfig(configPath) {
  const forms = [];
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    
    // 解析Markdown表格 - 改进的解析逻辑
    const lines = content.split('\n');
    let inTable = false;
    let headerFound = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 检测表头行
      if (trimmed.includes('序号') && trimmed.includes('页面名称')) {
        inTable = true;
        headerFound = true;
        continue;
      }
      
      // 跳过表格分隔线
      if (inTable && trimmed.startsWith('|') && trimmed.includes('---')) {
        continue;
      }
      
      // 解析表格行
      if (inTable && trimmed.startsWith('|')) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
        
        // 跳过表头行和分隔行
        if (cells[0] === '序号' || cells[0] === ':-:' || cells[0].includes('---')) {
          continue;
        }
        
        if (cells.length >= 3) {
          // cells[0] 是序号，cells[1] 是名称，cells[2] 是UUID
          const nameWithType = cells[1];
          const uuid = cells[2];
          
          // 解析名称和类型
          const match = nameWithType.match(/^(.+?)「(.+?)」$/);
          if (match) {
            const name = match[1];
            const type = match[2];
            forms.push({
              name,
              type,
              uuid,
              dir: `${name}「${type}」`
            });
          }
        }
      }
      
      // 表格结束（空行或不在表格中）
      if (inTable && !trimmed.startsWith('|') && trimmed !== '') {
        inTable = false;
      }
    }
  } catch (e) {
    console.error(`读取系统配置清单失败: ${e.message}`);
  }
  
  return forms;
}

/**
 * 从项目目录自动发现表单
 * @param {string} projectDir - 项目根目录
 * @returns {Array} 表单列表 [{name, type, uuid, dir}]
 */
function discoverFormsFromDirectory(projectDir) {
  const forms = [];
  
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirName = entry.name;
        
        // 匹配表单目录格式: 名称「类型」
        const match = dirName.match(/^(.+?)「(.+?)」$/);
        if (match) {
          const name = match[1];
          const type = match[2];
          const formDir = path.join(projectDir, dirName);
          
          // 查找JSON文件
          const jsonFiles = fs.readdirSync(formDir).filter(f => f.endsWith('.json'));
          let uuid = null;
          
          for (const jsonFile of jsonFiles) {
            try {
              const jsonPath = path.join(formDir, jsonFile);
              const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
              const schema = JSON.parse(jsonContent);
              
              // 从JSON中提取表单UUID
              if (schema.id) {
                uuid = schema.id;
                break;
              }
              if (schema.pages && schema.pages[0] && schema.pages[0].id) {
                uuid = schema.pages[0].id;
                break;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
          
          forms.push({
            name,
            type,
            uuid,
            dir: dirName
          });
        }
      }
    }
  } catch (e) {
    console.error(`扫描项目目录失败: ${e.message}`);
  }
  
  return forms;
}

/**
 * 综合发现表单（优先使用配置清单，回退到目录扫描）
 * @param {string} projectDir - 项目根目录
 * @returns {Array} 表单列表
 */
function discoverForms(projectDir) {
  // 优先尝试读取系统配置清单
  const configPath = path.join(projectDir, '系统配置清单.md');
  if (fs.existsSync(configPath)) {
    console.log('  📋 从系统配置清单发现表单...');
    const forms = discoverFormsFromConfig(configPath);
    if (forms.length > 0) {
      console.log(`  ✅ 从配置清单发现 ${forms.length} 个表单`);
      return forms;
    }
  }
  
  // 回退到目录扫描
  console.log('  📁 从项目目录扫描表单...');
  const forms = discoverFormsFromDirectory(projectDir);
  console.log(`  ✅ 从目录扫描发现 ${forms.length} 个表单`);
  return forms;
}

/**
 * 筛选表单
 * @param {Array} forms - 表单列表
 * @param {Object} filters - 筛选条件 {names: [], types: [], exclude: []}
 * @returns {Array} 筛选后的表单列表
 */
function filterForms(forms, filters = {}) {
  let result = forms;
  
  // 按名称筛选
  if (filters.names && filters.names.length > 0) {
    result = result.filter(f => filters.names.includes(f.name));
  }
  
  // 按类型筛选
  if (filters.types && filters.types.length > 0) {
    result = result.filter(f => filters.types.includes(f.type));
  }
  
  // 排除特定表单
  if (filters.exclude && filters.exclude.length > 0) {
    result = result.filter(f => !filters.exclude.includes(f.name));
  }
  
  return result;
}

/**
 * 获取应用ID
 * @param {string} configPath - 系统配置清单路径
 * @returns {string|null} 应用ID
 */
function getAppId(configPath) {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/APP_[A-Z0-9]+/);
    return match ? match[0] : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  discoverForms,
  discoverFormsFromConfig,
  discoverFormsFromDirectory,
  filterForms,
  getAppId
};
