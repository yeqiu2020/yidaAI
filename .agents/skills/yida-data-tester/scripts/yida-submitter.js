/**
 * 宜搭数据提交引擎 - 整合版
 * 版本: 2.2.0
 * 创建时间: 2026-05-11
 * 
 * 功能：通过宜搭Web API提交表单数据（基于Cookie认证）
 * 特点：
 * 1. 自动处理字段ID同步
 * 2. 支持日期时间戳自动转换
 * 3. 内置重试机制
 * 4. 详细的错误诊断
 * 5. 不生成临时文件（内存操作）
 * 6. 支持查询表单已有数据数量
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const querystring = require('querystring');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COOKIE_FILE = path.join(PROJECT_ROOT, '.cookies.json');

/**
 * 获取临时目录（用于保存必要的临时文件）
 */
function getTempDir() {
  const tempDir = path.join(os.tmpdir(), 'yida-data-tester');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * 清理临时文件
 */
function cleanTempFiles() {
  try {
    const tempDir = path.join(os.tmpdir(), 'yida-data-tester');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24小时
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (e) {
    // 忽略清理错误
  }
}

/**
 * 加载Cookie
 */
function loadCookies() {
  try {
    const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    if (Array.isArray(data)) {
      return { cookies: data, baseUrl: 'https://www.aliwork.com', csrfToken: '', userId: '' };
    }
    return { 
      cookies: data.cookies || [], 
      baseUrl: data.base_url || 'https://www.aliwork.com',
      csrfToken: data.csrf_token || '',
      userId: data.user_id || ''
    };
  } catch (e) {
    throw new Error(`读取Cookie失败: ${e.message}。请先运行登录脚本获取Cookie。`);
  }
}

/**
 * 发送POST请求
 */
function postRequest(hostname, path, params, cookies) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify(params);
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    const options = {
      hostname: hostname,
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Origin': `https://${hostname}`,
        'Referer': `https://${hostname}/`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve({ success: false, message: data.substring(0, 500), raw: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

/**
 * 同步表单Schema获取正确字段ID
 * 使用GET请求，与yida-get-schema保持一致
 */
async function syncFormSchema(appId, formUuid, cookies) {
  try {
    const hostname = appId.toLowerCase().includes('app_') 
      ? `${appId.split('_')[1].toLowerCase()}.aliwork.com`
      : 'www.aliwork.com';
    
    // 构建cookie字符串
    const cookieStr = Array.isArray(cookies.cookies) 
      ? cookies.cookies.map(c => `${c.name}=${c.value}`).join('; ')
      : cookies.cookies;
    
    // 使用GET请求，与yida-get-schema保持一致
    const path = `/alibaba/web/${appId}/_view/query/formdesign/getFormSchema.json?formUuid=${formUuid}&schemaVersion=V5`;
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        path,
        method: 'GET',
        headers: {
          'Cookie': cookieStr,
          'Accept': 'application/json',
          'Referer': `https://${hostname}/`
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            if (result.success && result.content) {
              resolve(result.content);
            } else {
              reject(new Error(`获取表单Schema失败: ${result.errorMsg || result.message || '未知错误'}`));
            }
          } catch (e) {
            reject(new Error(`解析Schema响应失败: ${e.message}`));
          }
        });
      });

      req.on('error', (e) => reject(new Error(`请求失败: ${e.message}`)));
      req.end();
    });
  } catch (error) {
    throw new Error(`同步表单Schema失败: ${error.message}`);
  }
}

/**
 * 提取字段ID映射
 * 支持两种Schema结构：
 * 1. 本地JSON文件: { componentsTree: [...] }
 * 2. API返回: { pages: [{ componentsTree: [...] }] }
 *
 * 【重要】已知的API不兼容字段类型（会自动跳过）：
 * - AssociationFormField: 关联表单字段，提交时会导致 "syntax error, expect [, actual error"
 * - AssociationFormProperty: 关联表单属性字段
 * - ImageField: 图片字段
 * - AttachmentField: 附件字段
 * 
 * 【注意】TableField(子表单) 可以正常提交，支持数组/对象/JSON字符串三种格式
 */
function extractFieldMapping(schema) {
  const mapping = {};

  // 已知会导致API提交失败的字段类型
  // 【注意】TableField(子表单) 可以正常提交，v2.0.6已从跳过列表中移除
  // 【注意】SelectField 和 DepartmentSelectField: v2.1.2 新增跳过，因为无法通过API直接提交正确格式
  const SKIP_COMPONENT_TYPES = [
    'AssociationFormField',
    'AssociationFormProperty',
    'ImageField',
    'AttachmentField',
    'SelectField',
    'DepartmentSelectField'
  ];

  function traverse(components) {
    if (!Array.isArray(components)) return;

    for (const comp of components) {
      const componentName = comp.componentName;
      
      // 处理子表单（TableField）- 提取内部列
      if (componentName === 'TableField' && comp.props) {
        const tableFieldId = comp.props.fieldId;
        const tableLabel = comp.props.label?.zh_CN || comp.props.label || '子表';
        
        // 提取子表字段本身
        if (tableFieldId && tableLabel) {
          mapping[tableLabel] = {
            fieldId: tableFieldId,
            componentName: 'TableField',
            label: tableLabel,
            isSubform: true,
            isSubformColumn: false
          };
        }
        
        // 提取子表内部列字段 - 支持两种结构：
        // 1. props.columns 数组
        // 2. children 数组（子组件形式）
        
        // 方式1: props.columns
        if (comp.props.columns && Array.isArray(comp.props.columns)) {
          for (const column of comp.props.columns) {
            if (column.fieldId && column.title) {
              const colFieldId = column.fieldId;
              const colLabel = column.title;
              const colComponentName = column.componentName || 'TextField';
              
              mapping[`${tableLabel}.${colLabel}`] = {
                fieldId: colFieldId,
                componentName: colComponentName,
                label: colLabel,
                isSubformColumn: true,
                parentFieldId: tableFieldId
              };
            }
          }
        }
        
        // 方式2: children 数组
        if (comp.children && Array.isArray(comp.children)) {
          for (const child of comp.children) {
            if (child.props && child.props.fieldId) {
              const colFieldId = child.props.fieldId;
              const colLabel = child.props.label?.zh_CN || child.props.label;
              const colComponentName = child.componentName || 'TextField';
              
              if (colLabel) {
                mapping[`${tableLabel}.${colLabel}`] = {
                  fieldId: colFieldId,
                  componentName: colComponentName,
                  label: colLabel,
                  isSubformColumn: true,
                  parentFieldId: tableFieldId
                };
              }
            }
          }
        }
      }
      
      // 处理普通字段（跳过已处理的子表字段）
      if (comp.props && comp.props.fieldId) {
        const fieldId = comp.props.fieldId;
        const label = comp.props.label?.zh_CN || comp.props.label;
        const fieldComponentName = comp.componentName;

        // 跳过已知不兼容的字段类型
        if (SKIP_COMPONENT_TYPES.includes(fieldComponentName)) {
          continue;
        }

        // 跳过已处理的子表字段（避免覆盖 isSubform 标记）
        if (fieldComponentName === 'TableField' && mapping[label]?.isSubform) {
          continue;
        }

        if (label) {
          const fieldInfo = {
            fieldId,
            componentName: fieldComponentName,
            label
          };
          
          // 提取数据源信息（用于RadioField、CheckboxField、SelectField等）
          if (comp.props.dataSource && Array.isArray(comp.props.dataSource)) {
            fieldInfo.dataSource = comp.props.dataSource;
          } else if (comp.props.defaultDataSource && comp.props.defaultDataSource.dataSource) {
            fieldInfo.dataSource = comp.props.defaultDataSource.dataSource;
          }
          
          mapping[label] = fieldInfo;
        }
      }

      // 递归处理子组件
      // 支持两种Schema结构：
      // 1. 扁平结构: children 在 comp.props.children 下
      // 2. 嵌套结构: children 在 comp.children 下（如机构信息表单）
      if (comp.props && comp.props.children) {
        traverse(comp.props.children);
      }
      if (comp.children) {
        traverse(comp.children);
      }
    }
  }

  // 处理本地JSON文件结构
  if (schema.componentsTree) {
    traverse(schema.componentsTree);
  }

  // 处理API返回的pages结构
  if (schema.pages && Array.isArray(schema.pages)) {
    for (const page of schema.pages) {
      if (page.componentsTree) {
        traverse(page.componentsTree);
      }
    }
  }

  return mapping;
}

/**
 * 转换数据格式
 * 【重要】会自动跳过关联表单等不兼容字段的数据
 */
function transformData(data, fieldMapping) {
  const transformed = {};
  const subformData = {}; // 收集子表数据

  // 已知会导致API提交失败的字段类型
  const SKIP_COMPONENT_TYPES = [
    'AssociationFormField',
    'AssociationFormProperty',
    'ImageField',
    'AttachmentField',
    'SelectField',
    'DepartmentSelectField'
  ];

  for (const [key, value] of Object.entries(data)) {
    // 如果key已经是fieldId，直接使用
    if (key.includes('Field_') || key.includes('Field')) {
      transformed[key] = value;
      continue;
    }

    // 通过字段名查找fieldId
    const fieldInfo = fieldMapping[key];
    if (fieldInfo) {
      // 跳过已知不兼容的字段类型
      if (SKIP_COMPONENT_TYPES.includes(fieldInfo.componentName)) {
        continue;
      }

      // 处理子表单字段
      if (fieldInfo.componentName === 'TableField' && Array.isArray(value)) {
        // 子表数据是数组格式
        const subformRows = [];
        for (const row of value) {
          const transformedRow = {};
          for (const [colKey, colValue] of Object.entries(row)) {
            // 查找子表列的 fieldId
            const subformKey = `${key}.${colKey}`;
            const colFieldInfo = fieldMapping[subformKey];
            if (colFieldInfo) {
              // 跳过子表中不兼容的字段类型（如关联表单、部门选择等）
              if (SKIP_COMPONENT_TYPES.includes(colFieldInfo.componentName)) {
                continue;
              }
              // 日期字段转换为时间戳
              if (colFieldInfo.componentName === 'DateField' && typeof colValue === 'string') {
                const date = new Date(colValue);
                if (!isNaN(date.getTime())) {
                  transformedRow[colFieldInfo.fieldId] = date.getTime();
                } else {
                  transformedRow[colFieldInfo.fieldId] = colValue;
                }
              } else if (colFieldInfo.componentName === 'TextField' && typeof colValue === 'number') {
                transformedRow[colFieldInfo.fieldId] = String(colValue);
              } else {
                transformedRow[colFieldInfo.fieldId] = colValue;
              }
            } else {
              // 保留原key
              transformedRow[colKey] = colValue;
            }
          }
          subformRows.push(transformedRow);
        }
        transformed[fieldInfo.fieldId] = subformRows;
        continue;
      }

      // 日期字段转换为时间戳
      if (fieldInfo.componentName === 'DateField' && typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          transformed[fieldInfo.fieldId] = date.getTime();
        } else {
          transformed[fieldInfo.fieldId] = value;
        }
      } else if (fieldInfo.componentName === 'TextField' && typeof value === 'number') {
        // 文本字段值必须为字符串（如"发票金额"虽含"金额"关键词但为文本框）
        transformed[fieldInfo.fieldId] = String(value);
      } else {
        transformed[fieldInfo.fieldId] = value;
      }
    } else {
      // 保留原key（用于没有Schema映射的情况）
      transformed[key] = value;
    }
  }

  return transformed;
}

/**
 * 提交单条数据
 */
async function submitOne(appId, formUuid, data, options = {}) {
  const { 
    csrfToken, 
    cookies, 
    hostname,
    maxRetries = 3,
    retryDelay = 1000 
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const path = `/dingtalk/web/${appId}/v1/form/saveFormData.json`;
      
      const params = {
        formUuid: formUuid,
        formDataJson: JSON.stringify(data),
        appType: appId,
        systemToken: '',
        _csrf_token: csrfToken
      };
      
      const result = await postRequest(hostname, path, params, cookies);
      
      if (result.success && !result.errorCode) {
        return {
          success: true,
          instId: result.content,
          message: '提交成功',
          attempt
        };
      } else {
        lastError = result.errorMsg || result.message || '提交失败';
        
        // 如果是字段错误，不需要重试
        if (lastError.includes('字段') || lastError.includes('参数校验')) {
          break;
        }
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    } catch (error) {
      lastError = error.message;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }
  
  return {
    success: false,
    message: lastError,
    attempt: maxRetries
  };
}

/**
 * 批量提交数据
 */
async function submitBatch(config) {
  const {
    appId,
    formUuid,
    dataList,
    syncSchema = true,
    onProgress,
    delay = 1000,
    schemaPath = null  // 本地Schema文件路径（可选）
  } = config;
  
  // 加载Cookie
  const cookieData = loadCookies();
  const hostname = cookieData.baseUrl.replace('https://', '');
  
  let fieldMapping = {};
  
  // 同步表单Schema获取正确字段ID
  if (syncSchema) {
    console.log('正在同步表单Schema...');
    
    let schema = null;
    
    // 优先使用本地Schema文件
    if (schemaPath && fs.existsSync(schemaPath)) {
      try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        schema = JSON.parse(schemaContent);
        console.log('  ✅ 从本地文件加载Schema');
      } catch (e) {
        console.log('  ⚠️ 本地Schema文件读取失败，尝试从API获取');
      }
    }
    
    // 如果本地没有，尝试从API获取
    if (!schema) {
      try {
        schema = await syncFormSchema(appId, formUuid, cookieData);
        console.log('  ✅ 从API加载Schema');
      } catch (e) {
        console.log('  ⚠️ API获取Schema失败:', e.message);
        console.log('  ⚠️ 将使用原始字段名提交');
      }
    }
    
    if (schema) {
      fieldMapping = extractFieldMapping(schema);
      console.log(`  ✅ 已获取 ${Object.keys(fieldMapping).length} 个字段映射`);
      
      if (Object.keys(fieldMapping).length === 0) {
        console.log('  ⚠️ 警告: 未获取到任何字段映射，将使用原始字段名提交');
      }
    }
  }
  
  const results = [];
  
  for (let i = 0; i < dataList.length; i++) {
    const item = dataList[i];
    
    if (onProgress) {
      onProgress({ current: i + 1, total: dataList.length, item });
    }
    
    // 转换数据
    const transformedData = syncSchema 
      ? transformData(item, fieldMapping)
      : item;
    
    // 提交
    const result = await submitOne(appId, formUuid, transformedData, {
      csrfToken: cookieData.csrfToken,
      cookies: cookieData.cookies,
      hostname
    });
    
    results.push({
      index: i,
      originalData: item,
      ...result
    });
    
    // 延迟
    if (i < dataList.length - 1 && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}

/**
 * 发送GET请求
 */
function getRequest(hostname, path, cookies) {
  return new Promise((resolve, reject) => {
    const cookieHeader = Array.isArray(cookies)
      ? cookies.map(c => `${c.name}=${c.value}`).join('; ')
      : cookies;

    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': `https://${hostname}/`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve({ success: false, message: data.substring(0, 500) });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

/**
 * 查询表单已有数据数量
 * @param {string} appId - 应用ID
 * @param {string} formUuid - 表单UUID
 * @param {string} formType - 表单类型（'普通表单' 或 '流程表单'）
 * @returns {number} 已有数据条数
 */
async function getExistingDataCount(appId, formUuid, formType) {
  const cookieData = loadCookies();
  const hostname = cookieData.baseUrl.replace('https://', '');
  const cookies = cookieData.cookies;

  try {
    let totalCount = 0;

    if (formType === '流程表单') {
      const path = `/dingtalk/web/${appId}/v1/process/getInstanceIds.json?formUuid=${formUuid}&pageSize=1&currentPage=1`;
      const result = await getRequest(hostname, path, cookies);
      if (result.success && result.content) {
        totalCount = result.content.totalCount || result.content.data?.length || 0;
      }
    } else {
      const path = `/dingtalk/web/${appId}/v1/form/searchFormDataIds.json?formUuid=${formUuid}&pageSize=1&currentPage=1`;
      const result = await getRequest(hostname, path, cookies);
      if (result.success && result.content) {
        totalCount = result.content.totalCount || result.content.data?.length || 0;
      }
    }

    return totalCount;
  } catch (e) {
    return -1;
  }
}

module.exports = {
  submitBatch,
  submitOne,
  syncFormSchema,
  extractFieldMapping,
  transformData,
  loadCookies,
  getExistingDataCount
};
