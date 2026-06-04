#!/usr/bin/env node
/**
 * 单个表单同步脚本 - 真正从宜搭获取最新数据
 * 
 * 工作流程：
 * 1. 从系统配置清单读取应用ID和表单UUID
 * 2. 调用宜搭API获取最新表单Schema
 * 3. 更新本地JSON文件
 * 4. 更新原型页面
 * 
 * 用法: node sync_single_form.js <项目目录> <表单名称>
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_CLIENT_DIR = path.join(__dirname, '..', '..', 'yida-api-client', 'scripts');
const LOGIN_MANAGER = path.join(API_CLIENT_DIR, 'login_manager.js');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ️ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️ ${message}${colors.reset}`);
}

/**
 * 递归查找已存在的表单目录
 * 优先查找已有的目录，避免在错误位置重复创建
 */
function findExistingFormDir(projectDir, formName, formType) {
  const expectedDirName = `${formName}「${formType}」`;

  // 1. 先检查项目根目录
  const rootDir = path.join(projectDir, expectedDirName);
  if (fs.existsSync(rootDir)) {
    return rootDir;
  }

  // 2. 递归搜索子目录（最多3层）
  function walk(currentDir, depth) {
    if (depth > 3) return null;

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return null;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentDir, entry.name);

      // 检查是否匹配目标目录名
      if (entry.name === expectedDirName) {
        return fullPath;
      }

      // 递归搜索
      const found = walk(fullPath, depth + 1);
      if (found) return found;
    }

    return null;
  }

  return walk(projectDir, 0);
}

function formatCookieString(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return '';
  }
  return cookies
    .filter(c => c && c.name && c.value)
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

/**
 * 读取系统配置清单
 */
function readSystemConfig(projectDir) {
  const configPath = path.join(projectDir, '系统配置清单.md');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`系统配置清单不存在: ${configPath}`);
  }
  
  const content = fs.readFileSync(configPath, 'utf-8');
  
  // 提取应用ID（兼容“应用ID / 应用编码”等多种写法）
  let appId = null;

  // 1) 优先匹配表格中的应用ID/应用编码行
  const tableAppIdMatch = content.match(/\|\s*\*\*(应用ID|应用编码)\*\*\s*\|\s*`?(APP_[A-Z0-9]+)`?/i);
  if (tableAppIdMatch) {
    appId = tableAppIdMatch[2];
  }

  // 2) 兼容非加粗或其他文本写法
  if (!appId) {
    const textAppIdMatch = content.match(/(?:应用ID|应用编码)[^\n]*?(APP_[A-Z0-9]+)/i);
    if (textAppIdMatch) {
      appId = textAppIdMatch[1];
    }
  }

  // 3) 最后兜底：全文扫描第一个 APP_XXXX
  if (!appId) {
    const fallbackAppIdMatch = content.match(/\b(APP_[A-Z0-9]+)\b/i);
    if (fallbackAppIdMatch) {
      appId = fallbackAppIdMatch[1];
    }
  }
  
  if (!appId) {
    throw new Error('无法从系统配置清单中提取应用ID');
  }

  // 提取访问域名（用于请求宜搭API，避免写死）
  let baseUrl = null;
  const accessUrlMatch = content.match(/\|\s*\*\*访问地址\*\*\s*\|\s*(https?:\/\/[^\s|]+)/);
  if (accessUrlMatch && accessUrlMatch[1]) {
    try {
      baseUrl = new URL(accessUrlMatch[1]).origin;
    } catch (e) {
      // ignore
    }
  }
  
  // 提取表单UUID列表
  const formMap = {};
  const lines = content.split('\n');
  
  for (const line of lines) {
    // 新格式: | 1 | 产品信息「普通表单」 | FORM-XXX |
    const newMatch = line.match(/\|\s*\d+\s*\|\s*([^|]+?)「([^|]+?)」\s*\|\s*`?(FORM-[A-Z0-9]+)`?/);
    if (newMatch) {
      formMap[newMatch[1].trim()] = { 
        formUuid: newMatch[3].trim(), 
        formType: newMatch[2].trim() 
      };
      continue;
    }
    
    // 旧格式: | 1 | 产品信息 | 普通 | `FORM-XXX` | - |
    const oldMatch = line.match(/\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`?(FORM-[A-Z0-9]+)`?/);
    if (oldMatch) {
      formMap[oldMatch[1].trim()] = { 
        formUuid: oldMatch[3].trim(), 
        formType: oldMatch[2].trim() 
      };
    }
  }
  
  return { appId, formMap, baseUrl };
}

/**
 * 读取Cookie
 */
function isCookieDomainMatch(cookieDomain, host) {
  if (!cookieDomain || !host) return false;
  const normalizedDomain = String(cookieDomain).replace(/^\./, '').toLowerCase();
  const normalizedHost = String(host).toLowerCase();
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function loadCookies(baseUrl = '') {
  try {
    const cookiePath = path.join(__dirname, '..', '..', '..', '..', '.cookies.json');
    if (!fs.existsSync(cookiePath)) {
      logWarning('Cookie文件不存在，将尝试无Cookie访问');
      return '';
    }
    
    const cookieData = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
    const allCookies = Array.isArray(cookieData.cookies) ? cookieData.cookies : [];
    if (allCookies.length === 0) {
      return '';
    }

    let targetHost = '';
    try {
      if (baseUrl) {
        targetHost = new URL(baseUrl).hostname;
      }
    } catch (_) {
      // ignore
    }

    // 仅发送匹配目标域名的Cookie，避免跨域同名Cookie导致登录失败
    const filteredCookies = targetHost
      ? allCookies.filter(c => isCookieDomainMatch(c.domain, targetHost))
      : allCookies;

    const cookiesForRequest = filteredCookies.length > 0 ? filteredCookies : allCookies;
    const uniqueByName = new Map();
    for (const cookie of cookiesForRequest) {
      if (!cookie || !cookie.name) continue;
      // 同名Cookie优先保留“更具体域名”（例如 qfhefh.aliwork.com 优先于 .aliwork.com）
      const prev = uniqueByName.get(cookie.name);
      if (!prev) {
        uniqueByName.set(cookie.name, cookie);
      } else {
        const prevDomain = String(prev.domain || '').replace(/^\./, '');
        const currDomain = String(cookie.domain || '').replace(/^\./, '');
        if (currDomain.length > prevDomain.length) {
          uniqueByName.set(cookie.name, cookie);
        }
      }
    }
    
    // 提取所有Cookie并格式化为字符串
    const cookieStr = Array.from(uniqueByName.values())
      .map(c => `${c.name}=${c.value}`)
      .join('; ');
    
    logInfo(`Cookie过滤结果: ${allCookies.length} -> ${uniqueByName.size} (host: ${targetHost || 'unknown'})`);
    return cookieStr;
  } catch (error) {
    logWarning(`读取Cookie失败: ${error.message}`);
    return '';
  }
}

/**
 * 确保宜搭登录态有效（必要时自动触发登录）
 */
async function ensureLoginContext() {
  try {
    if (!fs.existsSync(LOGIN_MANAGER)) {
      logWarning('未找到 login_manager.js，继续使用本地Cookie尝试同步');
      return null;
    }
    const { ensureLogin } = require(LOGIN_MANAGER);
    const loginInfo = await ensureLogin();
    if (loginInfo && loginInfo.cookies) {
      logSuccess(`登录态有效 (${loginInfo.base_url || 'unknown'})`);
    }
    return loginInfo;
  } catch (error) {
    logWarning(`自动登录校验失败，改用本地Cookie继续尝试: ${error.message}`);
    return null;
  }
}

/**
 * 从宜搭API获取表单Schema
 */
async function fetchFormSchemaFromYida(appId, formUuid, requestContext = {}) {
  return new Promise((resolve, reject) => {
    const baseUrl = (requestContext.baseUrl || 'https://qfhefh.aliwork.com').replace(/\/$/, '');
    const cookieStr = requestContext.cookieStr || loadCookies(baseUrl);
    const csrfToken = requestContext.csrfToken || '';
    const url = `${baseUrl}/alibaba/web/${appId}/_view/query/formdesign/getFormSchema.json?formUuid=${formUuid}&schemaVersion=V5`;
    
    logInfo(`正在从宜搭获取表单Schema...`);
    logInfo(`URL: ${url}`);
    
    if (cookieStr) {
      logInfo('已加载登录Cookie');
    } else {
      logWarning('未加载到Cookie，可能导致登录失败');
    }
    
    const httpOptions = {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `${baseUrl}/`,
        'x-csrf-token': csrfToken,
        'Cookie': cookieStr
      }
    };
    
    const req = https.get(url, httpOptions, (res) => {
      let data = '';
      
      logInfo(`响应状态码: ${res.statusCode}`);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // 如果响应是重定向（登录页），说明Cookie失效
        if (data.includes('<!DOCTYPE html>') || data.includes('<html')) {
          reject(new Error('登录态已过期，请重新登录宜搭平台'));
          return;
        }
        
        try {
          const result = JSON.parse(data);
          if (result.success && result.content) {
            resolve(result.content);
          } else {
            const errMsg = result.errorMsg || result.error || '获取Schema失败';
            if (String(errMsg).toUpperCase().includes('LOGIN FAILED')) {
              reject(new Error('LOGIN_REQUIRED: 登录已失效，请重新登录宜搭平台'));
              return;
            }
            reject(new Error(errMsg));
          }
        } catch (e) {
          logError(`响应内容: ${data.substring(0, 200)}...`);
          reject(new Error(`解析响应失败: ${e.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`请求失败: ${error.message}`));
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

/**
 * 从Schema解析字段
 */
function parseFieldsFromSchema(schema) {
  const fields = [];
  const seenFieldIds = new Set();

  function readLabel(label) {
    if (!label) return '';
    if (typeof label === 'object') {
      return label.zh_CN || label.en_US || '';
    }
    return String(label);
  }

  function readPlaceholder(placeholder) {
    if (!placeholder) return '';
    if (typeof placeholder === 'object') {
      return placeholder.zh_CN || placeholder.en_US || '';
    }
    return String(placeholder);
  }

  function extractTableSubFields(tableComp) {
    const subFields = [];
    const seen = new Set();

    function walk(nodes) {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        const nodeName = node.componentName;
        const fieldId = node.props?.fieldId || node.props?.id;
        // Button 组件使用 content 代替 label
        const fieldName = readLabel(node.props?.label || node.props?.content);

        if (
          fieldId &&
          fieldName &&
          !seen.has(fieldId) &&
          !['GroupContainer', 'ColumnContainer', 'Section', 'ColumnsLayout', 'Column'].includes(nodeName)
        ) {
          seen.add(fieldId);
          subFields.push({
            fieldId: fieldId,
            fieldName: fieldName,
            componentType: nodeName,
            placeholder: readPlaceholder(node.props?.placeholder)
          });
        }

        if (node.children) {
          walk(node.children);
        }
        if (node.props?.children) {
          walk(node.props.children);
        }
      }
    }

    walk(tableComp.children);
    walk(tableComp.props?.children);
    return subFields;
  }
  
  function extractComponents(components, context = {}) {
    if (!components || !Array.isArray(components)) return;
    const inTable = !!context.inTable;
    
    for (const comp of components) {
      const componentName = comp.componentName;
      const isTableField = componentName === 'TableField';

      // 跳过布局组件
      if (['GroupContainer', 'ColumnContainer', 'Section', 'RootHeader', 'RootFooter', 'FooterYida', 'Page', 'FormContainer', 'RootContent', 'ColumnsLayout', 'Column'].includes(componentName)) {
        if (comp.children) {
          extractComponents(comp.children, context);
        }
        if (comp.props?.children) {
          extractComponents(comp.props.children, context);
        }
        continue;
      }
      
      // 提取字段信息
      const fieldId = comp.props?.fieldId || comp.props?.id;
      // Button 组件使用 content 代替 label 存储显示文本
      const label = comp.props?.label || comp.props?.content;
      
      // 子表内部字段不提升为主表字段（避免“子表字段变主字段”）
      if (!inTable && fieldId && label && !seenFieldIds.has(fieldId)) {
        const fieldName = readLabel(label);
        if (fieldName) {
          const placeholder = readPlaceholder(comp.props?.placeholder);
          const subFields = isTableField ? extractTableSubFields(comp) : undefined;
          
          seenFieldIds.add(fieldId);
          fields.push({
            fieldId: fieldId,
            fieldName: fieldName,
            componentType: componentName,
            placeholder: placeholder,
            ...(isTableField ? { subFields } : {})
          });
        }
      }
      
      // 子表字段已作为一个主表字段存在，不再展开其子列字段
      if (isTableField) {
        continue;
      }

      // 递归处理子组件
      if (comp.children) {
        extractComponents(comp.children, context);
      }
      if (comp.props?.children) {
        extractComponents(comp.props.children, context);
      }
    }
  }
  
  // 尝试多种可能的结构
  if (schema.pages?.[0]?.componentsTree?.[0]?.children) {
    extractComponents(schema.pages[0].componentsTree[0].children);
  } else if (schema.formSchema?.children) {
    extractComponents(schema.formSchema.children);
  } else if (schema.components) {
    extractComponents(schema.components);
  }
  
  return fields;
}

/**
 * 更新本地JSON文件
 */
function updateLocalJson(formDir, formName, schema) {
  const jsonPath = path.join(formDir, `${formName}「普通表单」.json`);
  
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(schema, null, 2), 'utf-8');
    logSuccess(`已更新本地JSON: ${jsonPath}`);
    return true;
  } catch (error) {
    logError(`更新JSON失败: ${error.message}`);
    return false;
  }
}

/**
 * 将组件类型英文转换为中文
 */
function getComponentTypeCN(componentType) {
  const typeMap = {
    'TextField': '单行文本',
    'TextareaField': '多行文本',
    'NumberField': '数值',
    'RadioField': '单选',
    'SelectField': '下拉单选',
    'MultiSelectField': '下拉多选',
    'CheckboxField': '复选',
    'DateField': '日期',
    'DateRangeField': '日期区间',
    'EmployeeField': '成员',
    'DepartmentField': '部门',
    'DepartmentSelectField': '部门',
    'TableField': '子表单',
    'ImageField': '图片',
    'AttachmentField': '附件',
    'CascadeSelectField': '级联选择',
    'AddressField': '地址',
    'LocationField': '定位',
    'RelateField': '关联表单',
    'AssociationFormField': '关联表单',
    'SubTableField': '子表单',
    'Button': '按钮'
  };
  return typeMap[componentType] || componentType;
}

/**
 * 更新组件ID清单 - 保持原有格式（主表/子表分开）
 */
function updateComponentList(formDir, formName, fields) {
  const listPath = path.join(formDir, '组件ID清单.md');

  // 分离主表字段和子表字段
  const mainFields = [];
  const subTables = [];

  for (const field of fields) {
    if (field.componentType === 'TableField' || field.componentType === 'SubTableField') {
      subTables.push(field);
    } else {
      mainFields.push(field);
    }
  }

  // 生成主表字段表格
  const mainFieldsRows = mainFields.map((f, i) =>
    `| ${i + 1} | ${getComponentTypeCN(f.componentType)} | ${f.fieldName} | ${f.fieldId} |`
  ).join('\n');

  // 生成子表字段表格
  const subTableSections = subTables.map((table) => {
    const subRows = (table.subFields || []).map((sub, i) =>
      `| ${i + 1} | ${getComponentTypeCN(sub.componentType)} | ${sub.fieldName} | ${sub.fieldId} |`
    ).join('\n');

    return `## 📋 子表：${table.fieldName} (${table.fieldId})

| 序号 | 组件类型 | 字段名称 | 组件ID (fieldId) |
|:---:|---------|---------|-----------------|
${subRows}`;
  }).join('\n\n');

  // 计算统计信息
  const mainFieldCount = mainFields.length;
  const subTableCount = subTables.length;
  const subFieldCount = subTables.reduce((sum, t) => sum + (t.subFields || []).length, 0);
  const totalCount = mainFieldCount + subFieldCount;

  const content = `# ${formName}「普通表单」- 组件ID清单

> 生成日期: ${new Date().toISOString().split('T')[0]}
> 同步来源: 宜搭平台

---

## 📋 主表字段

| 序号 | 组件类型 | 字段名称 | 组件ID (fieldId) |
|:---:|---------|---------|-----------------|
${mainFieldsRows}

${subTableSections}

---

## 📊 统计信息

| 统计项 | 数量 |
|--------|------|
| 组件总数 | ${totalCount} |
| 主表字段 | ${mainFieldCount} |
| 子表数量 | ${subTableCount} |
| 子表字段 | ${subFieldCount} |

---

*最后更新时间: ${new Date().toISOString().split('T')[0]}*
`;

  try {
    fs.writeFileSync(listPath, content, 'utf-8');
    logSuccess(`已更新组件ID清单: ${listPath}`);
    return true;
  } catch (error) {
    logError(`更新组件ID清单失败: ${error.message}`);
    return false;
  }
}

/**
 * 更新原型页面 - 只更新新增页面（抽屉），详情页保持原有数据显示
 */
function updatePrototypePage(projectDir, formName, fields) {
  const formsDir = path.join(projectDir, '01需求梳理', '原型页面', 'forms');
  let updatedCount = 0;
  
  // 生成字段HTML（带组件ID）- 用于新增页面
  const fieldsHtmlWithId = fields.map(f => {
    return `              <!-- ${f.fieldName} -->
              <div class="form-item">
                <label class="form-label">${f.fieldName} <span class="field-id" onclick="copyToClipboard('${f.fieldId}')">${f.fieldId}</span></label>
                <div class="form-control">
                  <input type="text" class="input" id="${f.fieldName}" placeholder="${f.placeholder || '请输入'}">
                </div>
              </div>`;
  }).join('\n');
  
  // 生成字段HTML（不带组件ID）- 用于抽屉
  const fieldsHtmlSimple = fields.map(f => {
    return `              <!-- ${f.fieldName} -->
              <div class="form-item">
                <label class="form-label">${f.fieldName}</label>
                <div class="form-control">
                  <input type="text" class="input" id="${f.fieldName}" placeholder="${f.placeholder || '请输入'}">
                </div>
              </div>`;
  }).join('\n');
  
  // 1. 更新详情页 _form.html - 只更新"新增"模式，不修改详情显示
  // 注意：_form.html 用于详情查看，保持原有数据显示，不显示字段ID
  const formDetailFile = path.join(formsDir, `${formName}_form.html`);
  if (fs.existsSync(formDetailFile)) {
    // 详情页保持原有逻辑，不自动更新字段
    // 如果需要更新，用户需要手动重新生成原型页面
    logInfo('详情页保持原有数据显示，不自动更新字段');
  }
  
  // 2. 更新列表页 .html（抽屉中的表单）- 用于新增，需要同步字段
  const formListFile = path.join(formsDir, `${formName}.html`);
  if (fs.existsSync(formListFile)) {
    let content = fs.readFileSync(formListFile, 'utf-8');
    
    // 检查是否有抽屉表单
    if (content.includes('drawer') && content.includes('id="' + formName + 'Form"')) {
      // 删除旧的"从宜搭同步"区域（如果存在）
      content = content.replace(
        /<!-- 从宜搭同步的新增字段 -->[\s\S]*?<\/div>\s*<\/div>\s*/,
        ''
      );
      
      // 替换抽屉中的"基本信息"区域
      const basicInfoPattern = /(<div class="form-section">\s*<h3 class="form-section-title">基本信息<\/h3>\s*<div class="form-grid">)[\s\S]*?(<\/div>\s*<\/div>)/;
      if (basicInfoPattern.test(content)) {
        content = content.replace(
          basicInfoPattern,
          `$1\n${fieldsHtmlSimple}\n$2`
        );
        logInfo('已替换抽屉中"基本信息"区域的字段');
        
        try {
          fs.writeFileSync(formListFile, content, 'utf-8');
          logSuccess(`已更新列表页抽屉: ${formListFile}`);
          updatedCount++;
        } catch (error) {
          logError(`更新列表页失败: ${error.message}`);
        }
      } else {
        logWarning('未找到抽屉中的"基本信息"区域');
      }
    }
  }
  
  return updatedCount > 0;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
用法: node sync_single_form.js <项目目录> <表单名称>

示例:
  node sync_single_form.js "./进销存管理" "产品信息"
    `);
    process.exit(1);
  }
  
  const projectDir = path.resolve(args[0]);
  const formName = args[1];
  
  log(`\n${'='.repeat(60)}`, 'bright');
  log('单个表单同步工具 - 从宜搭获取最新数据', 'bright');
  log(`${'='.repeat(60)}\n`, 'bright');
  
  try {
    // 1. 读取系统配置
    log(`[1/5] 读取系统配置...`, 'bright');
    const { appId, formMap, baseUrl } = readSystemConfig(projectDir);
    logSuccess(`应用ID: ${appId}`);
    
    const formInfo = formMap[formName];
    if (!formInfo) {
      throw new Error(`表单 "${formName}" 未在系统配置清单中找到`);
    }
    logSuccess(`表单UUID: ${formInfo.formUuid}`);
    
    // 2. 确保登录态
    log(`\n[2/5] 检查宜搭登录态...`, 'bright');
    const loginInfo = await ensureLoginContext();
    const requestBaseUrl = (loginInfo && loginInfo.base_url) || baseUrl || 'https://qfhefh.aliwork.com';
    const requestCookieStr = (loginInfo && Array.isArray(loginInfo.cookies))
      ? formatCookieString(loginInfo.cookies)
      : loadCookies(requestBaseUrl);
    const requestCsrfToken = (loginInfo && loginInfo.csrf_token) || '';
    logSuccess(`请求域名: ${requestBaseUrl}`);
    if (!loginInfo) {
      logWarning('未获取到实时登录态，使用本地Cookie发起请求');
    }

    // 3. 从宜搭获取Schema
    log(`\n[3/5] 从宜搭获取最新Schema...`, 'bright');
    const schema = await fetchFormSchemaFromYida(appId, formInfo.formUuid, {
      baseUrl: requestBaseUrl,
      cookieStr: requestCookieStr,
      csrfToken: requestCsrfToken
    });
    logSuccess('成功获取Schema');
    
    // 4. 解析字段
    log(`\n[4/5] 解析字段...`, 'bright');
    const fields = parseFieldsFromSchema(schema);
    logSuccess(`共 ${fields.length} 个字段`);
    
    // 显示字段列表
    fields.forEach((f, i) => {
      logInfo(`  ${i + 1}. ${f.fieldName} (${f.componentType})`);
    });
    
    // 5. 更新本地文件
    log(`\n[5/5] 更新本地文件...`, 'bright');

    // 查找表单目录（优先查找已存在的，避免重复创建）
    let formDir = findExistingFormDir(projectDir, formName, formInfo.formType);
    if (!formDir) {
      formDir = path.join(projectDir, `${formName}「${formInfo.formType}」`);
      fs.mkdirSync(formDir, { recursive: true });
      logInfo(`创建新目录: ${formDir}`);
    } else {
      logInfo(`找到已有目录: ${formDir}`);
    }
    
    // 更新JSON
    updateLocalJson(formDir, formName, schema);
    
    // 更新组件ID清单
    updateComponentList(formDir, formName, fields);
    
    // 更新原型页面
    updatePrototypePage(projectDir, formName, fields);
    
    // 完成
    log(`\n${'='.repeat(60)}`, 'bright');
    logSuccess('同步完成！');
    log(`${'='.repeat(60)}\n`, 'bright');
    
    console.log(JSON.stringify({
      success: true,
      formName,
      fieldCount: fields.length,
      fields: fields.map(f => ({
        fieldName: f.fieldName,
        fieldId: f.fieldId,
        componentType: f.componentType,
        subFields: f.subFields || [],
        // 兼容旧前端字段名
        name: f.fieldName,
        id: f.fieldId
      }))
    }));
    
  } catch (error) {
    logError(error.message);
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  }
}

main().catch(error => {
  logError(`未捕获的错误: ${error.message}`);
  process.exit(1);
});
