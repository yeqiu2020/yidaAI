/**
 * 宜搭数据提交引擎 - 整合版
 * 版本: 3.6.1
 * 创建时间: 2026-05-11
 *
 * 🔴 v3.6.1 【地址字段本地预校验 + 失败载荷直出】
 *   背景（2026-07-25 事故）：AI 编造不存在的武汉区划代码（蔡甸区误写 420122，正确
 *   420114），服务端仅返回笼统报错，AI 为定位问题编写多个临时调试脚本，耗时 10+ 分钟。
 *   修复：
 *     1. AddressField 本地预校验武汉区划代码（WUHAN_DISTRICT_CODES），提交前即报出
 *        精确错误并附合法代码表；
 *     2. submitBatch 结果保留 transformedData 提交载荷，失败时直接打印，消灭
 *        "为看详细错误而写调试脚本"的动机。
 *
 * 🔴 v3.6.0 【内置删除能力 + 查询分页】
 *   背景（2026-07-24 混元三 40 分钟事故复盘）：关联填充因搜索索引延迟静默失败后，
 *   AI 手写删除脚本自救，但删除 API 与创建 API 的 CSRF 要求不同——创建不需要
 *   _csrf_token、删除必须携带，否则返回 "csrf校验失败" 静默失败——造成"假删除"
 *   与重复数据。现由 skill 统一提供删除函数（自动携带 _csrf_token、逐条校验结果、
 *   普通/流程自动分流），严禁 AI 再手写删除脚本。
 *   修复：
 *     1. 新增 deleteFormData()/deleteInstance()/clearFormData()；
 *     2. searchFormDatas 支持自动翻页（此前只取第 1 页 100 条，存量超过 100 条时
 *        instanceId 映射不完整，同样会导致关联填充静默失败）。
 *
 * 🔴 v3.3.0 【真正的根因修复】流程表单必须用 startInstance，绝不能用 saveFormData。
 *   背景（2026-07 实测复盘）：此前 submitOne/submitBatch 对所有表单一律调用
 *   /v1/form/saveFormData.json。对【普通表单】正确，但对【流程表单】会写出一条
 *   “没有流程实例上下文”的坏数据：getInstanceById 返回的记录 actioners=[]、
 *   缺少 instanceStatus/processCode/version 字段，导致流程表单详情页无法渲染
 *   （卡在“发起人/发起人部门”一直转圈打不开）。而数据列表只读 title，所以“列表能看、
 *   详情打不开”。用户“之前提交成功过”是因为之前提交的都是普通表单。
 *   修复：
 *     1. 新增 getFormMeta()：通过导航列表 API 判定 formType(receipt/process) 及 processCode；
 *     2. 新增 startInstance()：流程表单走 /v1/process/startInstance.json 发起真实流程实例；
 *     3. submitOne/submitBatch 按 formType 自动分流；流程表单缺 processCode 时直接报错，
 *        绝不静默降级为 saveFormData（那正是本次事故的成因）；
 *     4. 提交后完整性自检：流程表单抽查一条，校验 instanceStatus 存在，否则告警。
 *
 * 注意（历史澄清）：关联字段 associationFormField_xxx_id 在 searchFormDatas 回读中本就是
 *   “双重 JSON 字符串”（需 JSON.parse 两次），这是宜搭正常存储态，不是 bug；提交时只需传
 *   对象数组、由提交器统一 stringify 一次即可。切勿自行 JSON.stringify 关联值（会被服务端
 *   当成字符串丢弃/置空）。transformData 出口对“字符串化的关联值”仍会拦截报错。
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

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require('../../../../lib/core/utils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
// 阶段二改造：Cookie 优先全局，兼容项目根
const GLOBAL_COOKIE_FILE = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
const COOKIE_FILE = fs.existsSync(GLOBAL_COOKIE_FILE) ? GLOBAL_COOKIE_FILE : path.join(PROJECT_ROOT, '.cookies.json');

// 【v3.6.1】武汉市行政区划代码表（演示常用城市），用于 AddressField 本地预校验
const WUHAN_DISTRICT_CODES = {
  420102: '江岸区', 420103: '江汉区', 420104: '硚口区', 420105: '汉阳区',
  420106: '武昌区', 420107: '青山区', 420111: '洪山区', 420112: '东西湖区',
  420113: '汉南区', 420114: '蔡甸区', 420115: '江夏区', 420116: '黄陂区', 420117: '新洲区'
};

/**
 * 获取临时目录（用于保存必要的临时文件）
 */
function getTempDir() {
  const tempDir = path.join(os.tmpdir(), 'data-tester');
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
    const tempDir = path.join(os.tmpdir(), 'data-tester');
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
 * Phase 6: 委托给 lib/core/utils.loadCookieData（统一实现）
 * 保留原返回结构：{ cookies, baseUrl, csrfToken, userId }
 */
function loadCookies() {
  const data = coreUtils.loadCookieData(PROJECT_ROOT);
  if (!data) {
    throw new Error(`读取Cookie失败：.cookies.json 不存在或为空。请先运行登录脚本获取Cookie。`);
  }
  return {
    cookies: data.cookies || [],
    baseUrl: data.base_url || 'https://www.aliwork.com',
    csrfToken: data.csrf_token || '',
    userId: data.user_id || ''
  };
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
 * 使用GET请求，与get-schema保持一致
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
    
    // 使用GET请求，与get-schema保持一致
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
  // 【注意】SelectField: v2.5.0 已从跳过列表中移除，因为dataSource中的value可以直接提交
  // 【注意】AssociationFormField: v3.1.0 已从跳过列表中移除，支持通过API提交关联数据
  // 【注意】AssociationFormProperty: 关联属性由关联表单自动填充，无需手动提交
  // 【注意】DepartmentSelectField: 仍需跳过，因为需要部门ID格式
  const SKIP_COMPONENT_TYPES = [
    'AssociationFormProperty',
    'ImageField',
    'AttachmentField',
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
        // 【v3.1.5修复】子表内关联字段也需提取 associationMeta，否则 transformFieldValue 无法补全元数据
        if (comp.props.columns && Array.isArray(comp.props.columns)) {
          for (const column of comp.props.columns) {
            if (column.fieldId && column.title) {
              const colFieldId = column.fieldId;
              const colLabel = column.title;
              const colComponentName = column.componentName || 'TextField';

              const colFieldInfo = {
                fieldId: colFieldId,
                componentName: colComponentName,
                label: colLabel,
                isSubformColumn: true,
                parentFieldId: tableFieldId
              };

              // 提取子表内关联字段的 associationMeta（与主表字段逻辑保持一致）
              if (colComponentName === 'AssociationFormField' && column.associationForm) {
                const af = column.associationForm;
                colFieldInfo.associationMeta = {
                  appType: af.appType || '',
                  formType: af.formType || 'receipt',
                  formUuid: af.formUuid || ''
                };
              }

              mapping[`${tableLabel}.${colLabel}`] = colFieldInfo;
            }
          }
        }

        // 方式2: children 数组
        // 【v3.1.5修复】同上，子表内关联字段也需提取 associationMeta
        if (comp.children && Array.isArray(comp.children)) {
          for (const child of comp.children) {
            if (child.props && child.props.fieldId) {
              const colFieldId = child.props.fieldId;
              const colLabel = child.props.label?.zh_CN || child.props.label;
              const colComponentName = child.componentName || 'TextField';

              if (colLabel) {
                const colFieldInfo = {
                  fieldId: colFieldId,
                  componentName: colComponentName,
                  label: colLabel,
                  isSubformColumn: true,
                  parentFieldId: tableFieldId
                };

                // 提取子表内关联字段的 associationMeta（与主表字段逻辑保持一致）
                if (colComponentName === 'AssociationFormField' && child.props.associationForm) {
                  const af = child.props.associationForm;
                  colFieldInfo.associationMeta = {
                    appType: af.appType || '',
                    formType: af.formType || 'receipt',
                    formUuid: af.formUuid || ''
                  };
                }

                mapping[`${tableLabel}.${colLabel}`] = colFieldInfo;
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
          
          // 提取关联表单元数据（用于AssociationFormField）
          if (fieldComponentName === 'AssociationFormField' && comp.props.associationForm) {
            const af = comp.props.associationForm;
            fieldInfo.associationMeta = {
              appType: af.appType || '',
              formType: af.formType || 'receipt', // receipt=普通表单, process=流程表单
              formUuid: af.formUuid || ''
            };
          }
          
          // 提取数据源信息（用于RadioField、CheckboxField、SelectField等）
          if (comp.props.dataSource && Array.isArray(comp.props.dataSource)) {
            fieldInfo.dataSource = comp.props.dataSource;
          } else if (comp.props.defaultDataSource) {
            if (comp.props.defaultDataSource.dataSource && Array.isArray(comp.props.defaultDataSource.dataSource)) {
              fieldInfo.dataSource = comp.props.defaultDataSource.dataSource;
            } else if (comp.props.defaultDataSource.options && Array.isArray(comp.props.defaultDataSource.options)) {
              fieldInfo.dataSource = comp.props.defaultDataSource.options;
            }
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

  /**
   * 【v3.2.0】递归解包被多次 JSON.stringify 的字符串：只要值是可解析为数组/对象的字符串，
   * 就反复 JSON.parse 直到得到数组/对象或无法再解析为止。用于关联字段防御双重编码。
   */
  function deepUnwrapJsonString(v) {
    let cur = v;
    let guard = 0;
    while (typeof cur === 'string' && guard < 5) {
      const s = cur.trim();
      if (!(s.startsWith('[') || s.startsWith('{'))) break;
      try { cur = JSON.parse(s); guard++; } catch (e) { break; }
    }
    return cur;
  }

  // 已知会导致API提交失败的字段类型
  // 【注意】SelectField: v2.5.0 已移除，dataSource中的value可以直接提交
  // 【注意】AssociationFormField: v3.1.0 已移除，支持通过API提交关联数据
  // 【注意】AssociationFormProperty: 关联属性由关联表单自动填充，无需手动提交
  // 详见 references/yida-field-api-format.md
  const SKIP_COMPONENT_TYPES = [
    'AssociationFormProperty',
    'ImageField',
    'AttachmentField',
    'DepartmentSelectField',
    'DigitalSignatureField'
  ];

  /**
   * 公共字段值转换函数 - 主表和子表统一调用
   * 根据字段类型将生成的数据转换为宜搭API要求的格式
   * 参考：references/yida-field-api-format.md
   * @param {*} value - 原始值
   * @param {Object} fieldInfo - 字段信息 {fieldId, componentName, label}
   * @returns {*} 转换后的值（null表示应跳过此字段）
   */
  function transformFieldValue(value, fieldInfo) {
    const cn = fieldInfo.componentName;

    // 跳过不兼容的字段类型
    if (SKIP_COMPONENT_TYPES.includes(cn)) {
      return null;
    }

    // DateField: 字符串日期 → 毫秒时间戳
    if (cn === 'DateField') {
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
      return value; // 已经是时间戳或无法解析
    }

    // AddressField: 对象 → JSON字符串
    if (cn === 'AddressField') {
      if (typeof value === 'object' && value !== null) {
        // 【v3.6.1】本地预校验：武汉（420100）区划代码必须在合法表中。
        // 防止 AI 编造不存在的代码（如把蔡甸区 420114 错写成 420122）导致服务端
        // 仅返回笼统的"参数校验失败"，AI 不得不写临时脚本排查 10 分钟。
        const ids = value.regionIds;
        if (Array.isArray(ids) && ids[0] === 420000 && ids[1] === 420100 && ids.length >= 3) {
          const code = ids[2];
          if (!WUHAN_DISTRICT_CODES[code]) {
            throw new Error(
              `地址字段"${fieldInfo.label || fieldInfo.fieldId}"使用了无效的武汉市区划代码 ${code}，请修正后重新生成。` +
              `合法代码: ${Object.entries(WUHAN_DISTRICT_CODES).map(([c, n]) => `${c}=${n}`).join(', ')}`
            );
          }
        }
        return JSON.stringify(value);
      }
      return value;
    }

    // EmployeeField: 字符串 → [userId] 数组
    if (cn === 'EmployeeField') {
      if (typeof value === 'string') {
        return [value];
      }
      return value; // 已经是数组
    }

    // AssociationFormField: 关联表单字段
    // AI可以传入以下格式：
    //   1. 对象数组（完整格式）: [{appType, formType, formUuid, instanceId, title}]  → 直接使用
    //   2. 对象（含instanceId和title）: {instanceId, title}  → 补全元数据（推荐·v3.1.2）
    //   3. 对象数组（含instanceId和title）: [{instanceId, title}]  → 逐个补全（推荐·v3.1.2）
    //   4. 字符串（instanceId）: "FINST-xxx"  → 自动补全元数据（title将为instanceId，给出警告）
    //   5. 字符串数组: ["FINST-xxx", "FINST-yyy"]  → 逐个补全（title将为instanceId，给出警告）
    if (cn === 'AssociationFormField') {
      // 【防御】关联字段的值不能是“被 JSON.stringify 过的字符串”。常见错误：调用方按存储态
      // _id 的样子传入 '[{"instanceId":...}]' 字符串。这里先把“字符串化的 JSON”还原为对象/数组，
      // 后续分支只会输出对象数组，再由提交器对整个 formData 统一 stringify 一次（正确单层）。
      value = deepUnwrapJsonString(value);
      if (Array.isArray(value) && value.length > 0) {
        // 格式1：已经是完整对象数组（含appType等元数据）
        if (typeof value[0] === 'object' && value[0].instanceId && value[0].appType) {
          return value;
        }
        // 格式3：对象数组（含instanceId和title）→ 逐个补全元数据
        if (typeof value[0] === 'object' && value[0].instanceId) {
          const meta = fieldInfo.associationMeta;
          if (meta) {
            return value.map(item => ({
              appType: meta.appType,
              formType: meta.formType,
              formUuid: meta.formUuid,
              instanceId: item.instanceId,
              title: item.title || item.instanceId
            }));
          }
        }
        // 格式5：字符串数组 → 逐个补全（给出警告）
        if (typeof value[0] === 'string') {
          console.warn(`[警告] 关联表单字段 "${fieldInfo.label}" 传入了字符串数组格式，title将为instanceId。建议传入对象格式 [{instanceId, title}] 以显示正确的标题。`);
          const meta = fieldInfo.associationMeta;
          if (meta) {
            return value.map(instId => ({
              appType: meta.appType,
              formType: meta.formType,
              formUuid: meta.formUuid,
              instanceId: instId,
              title: instId
            }));
          }
        }
      }
      // 格式2：对象（含instanceId和title）→ 补全元数据
      if (typeof value === 'object' && value !== null && value.instanceId) {
        const meta = fieldInfo.associationMeta;
        if (meta) {
          return [{
            appType: meta.appType,
            formType: meta.formType,
            formUuid: meta.formUuid,
            instanceId: value.instanceId,
            title: value.title || value.instanceId
          }];
        }
      }
      // 格式4：单个字符串instanceId（给出警告）
      if (typeof value === 'string') {
        console.warn(`[警告] 关联表单字段 "${fieldInfo.label}" 传入了字符串格式，title将为instanceId。建议传入对象格式 {instanceId, title} 以显示正确的标题。`);
        const meta = fieldInfo.associationMeta;
        if (meta) {
          return [{
            appType: meta.appType,
            formType: meta.formType,
            formUuid: meta.formUuid,
            instanceId: value,
            title: value
          }];
        }
      }
      return value; // 无法转换时保留原值
    }

    // TextField: 数字 → 字符串
    if (cn === 'TextField' && typeof value === 'number') {
      return String(value);
    }

    // 其他类型直接返回
    return value;
  }

  // 【v3.2.0】构建 fieldId -> fieldInfo 反查索引：当调用方直接用 fieldId 作为 key 传值时，
  // 也能据此识别字段类型并做规范化，而不是原样透传（原样透传会让关联字段的字符串值绕过
  // 规范化与校验，是造成“双重编码 / 详情页打不开”的根因之一）。
  const fieldIdIndex = {};
  for (const info of Object.values(fieldMapping)) {
    if (info && info.fieldId) fieldIdIndex[info.fieldId] = info;
  }

  for (const [key, value] of Object.entries(data)) {
    // key 已是 fieldId：优先用反查索引找到字段类型并做规范化（不再原样透传）
    if (key.includes('Field_') || key.includes('Field')) {
      const idInfo = fieldIdIndex[key];
      if (idInfo) {
        if (SKIP_COMPONENT_TYPES.includes(idInfo.componentName)) continue;
        // 子表：按 fieldId 传入时同样逐行规范化
        if (idInfo.componentName === 'TableField' && Array.isArray(value)) {
          const rows = [];
          for (const row of value) {
            const tRow = {};
            for (const [colKey, colValue] of Object.entries(row)) {
              const colInfo = fieldIdIndex[colKey] || fieldMapping[`${idInfo.label}.${colKey}`];
              if (colInfo) {
                const tv = transformFieldValue(colValue, colInfo);
                if (tv !== null) tRow[colInfo.fieldId] = tv;
              } else {
                tRow[colKey] = colValue;
              }
            }
            rows.push(tRow);
          }
          transformed[idInfo.fieldId] = rows;
          continue;
        }
        const tv = transformFieldValue(value, idInfo);
        if (tv !== null) transformed[idInfo.fieldId] = tv;
        continue;
      }
      // 未在 schema 中找到该 fieldId：关联字段仍做防御性解包，避免双重编码透传
      transformed[key] = key.startsWith('associationFormField') ? deepUnwrapJsonString(value) : value;
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
              // 统一调用 transformFieldValue 处理子表列
              const transformedValue = transformFieldValue(colValue, colFieldInfo);
              if (transformedValue !== null) {
                transformedRow[colFieldInfo.fieldId] = transformedValue;
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

      // 统一调用 transformFieldValue 处理主表字段
      const transformedValue = transformFieldValue(value, fieldInfo);
      if (transformedValue !== null) {
        transformed[fieldInfo.fieldId] = transformedValue;
      }
    } else {
      // 保留原key（用于没有Schema映射的情况）；关联字段做防御性解包，避免双重编码透传
      transformed[key] = key.startsWith('associationFormField') ? deepUnwrapJsonString(value) : value;
    }
  }

  // 【出口校验】杜绝关联字段以“字符串化 JSON”形态提交。关联字段必须提交对象数组，
  // 整个 formData 由提交器统一 JSON.stringify 一次；若调用方自行把数组 stringify 成字符串，
  // 服务端会把它当成普通字符串处理，导致关联关系丢失/置空（回读为空数组）。宁可提前抛错。
  for (const [k, v] of Object.entries(transformed)) {
    if (k.startsWith('associationFormField') && typeof v === 'string') {
      const s = v.trim();
      if (s.startsWith('[') || s.startsWith('{')) {
        throw new Error(`[关联字段格式错误] ${k} 传入的是“字符串化的JSON”，服务端会把它当成字符串导致关联关系丢失/置空。请传入对象数组 [{instanceId, title}]，切勿自行 JSON.stringify（整个 formData 由提交器统一序列化一次）。`);
      }
    }
  }

  return transformed;
}

/**
 * 【v3.3.0】获取表单元信息：判定普通表单/流程表单及其 processCode。
 * 通过导航列表 API（与 api-client/form_manager.getAppForms 一致）获取，自包含、不依赖本地配置文件。
 *
 * 【v3.3.1 修复】当导航列表中找不到表单时，不再静默降级为 'receipt'（那会让流程表单误用
 * saveFormData 产生详情页打不开的坏数据），而是抛出明确错误，强制调用方显式传入 formType。
 *
 * @returns {Promise<{formType:'receipt'|'process', processCode:(string|null), found:boolean}>}
 * @throws {Error} 当导航列表 API 失败或表单未找到时抛出（避免静默降级为普通表单）
 */
async function getFormMeta(appId, formUuid, cookieData) {
  const cd = cookieData || loadCookies();
  const hostname = cd.baseUrl.replace('https://', '');
  const path = `/dingtalk/web/${appId}/query/formnav/getFormNavigationListByOrder.json?_api=Nav.queryList&_mock=false`;
  const result = await getRequest(hostname, path, cd.cookies, cd.csrfToken);
  const list = (result && Array.isArray(result.content)) ? result.content : [];
  if (list.length === 0) {
    throw new Error(`导航列表为空，无法判定表单 ${formUuid} 的类型。请在 config 中显式传入 formType('process'/'receipt') 和 processCode。`);
  }
  const item = list.find(x => x.navType === 'PAGE' && x.formUuid === formUuid);
  if (!item) {
    throw new Error(`表单 ${formUuid} 未在导航列表中找到，无法自动判定表单类型。请在 config 中显式传入 formType('process'/'receipt') 和 processCode。`);
  }
  return {
    formType: item.formType || 'receipt',
    processCode: item.processCode || null,
    found: true
  };
}

/**
 * 【v3.3.0】发起流程实例（流程表单专用）。
 * 流程表单绝不能用 saveFormData，否则只写入表单数据、没有流程实例上下文，详情页打不开。
 * @returns {Promise<{success:boolean, instId?:string, isProcess?:boolean, message:string, attempt:number}>}
 */
async function startInstance(appId, formUuid, processCode, data, options = {}) {
  const { csrfToken, cookies, hostname, maxRetries = 3, retryDelay = 1000, deptId = '' } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const path = `/dingtalk/web/${appId}/v1/process/startInstance.json`;
      const params = {
        formUuid,
        processCode,
        appType: appId,
        formDataJson: JSON.stringify(data),
        dpId: deptId,
        deptId: deptId,
        _csrf_token: csrfToken
      };

      const result = await postRequest(hostname, path, params, cookies);

      if (result.success && !result.errorCode) {
        // startInstance 返回的 content 是流程实例Id（可直接用于 getInstanceById 自检）
        return { success: true, instId: result.content, isProcess: true, message: '发起流程成功', attempt };
      }
      lastError = result.errorMsg || result.message || '发起流程失败';
      if (lastError.includes('字段') || lastError.includes('参数校验')) break;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, retryDelay * attempt));
    } catch (error) {
      lastError = error.message;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, retryDelay * attempt));
    }
  }
  return { success: false, message: lastError, attempt: maxRetries };
}

/**
 * 【v3.3.0】提交后完整性自检：校验流程实例是否拥有真实流程上下文。
 * saveFormData 写入的流程表单数据缺少 instanceStatus（actioners 也为空），详情页打不开。
 * @returns {Promise<{ok:boolean, instanceStatus?:string, reason?:string}>}
 */
async function verifyProcessInstance(appId, instanceId, cookieData) {
  const cd = cookieData || loadCookies();
  const hostname = cd.baseUrl.replace('https://', '');
  const path = `/dingtalk/web/${appId}/v1/process/getInstanceById.json?processInstanceId=${instanceId}`;
  const result = await getRequest(hostname, path, cd.cookies, cd.csrfToken);
  const c = result && (result.content || result);
  if (!c || typeof c !== 'object') return { ok: false, reason: '无法读取流程实例详情' };
  const hasStatus = c.instanceStatus !== undefined && c.instanceStatus !== null && c.instanceStatus !== '';
  if (!hasStatus) {
    return { ok: false, reason: '实例缺少 instanceStatus（疑似用 saveFormData 写入的无流程上下文坏数据）' };
  }
  return { ok: true, instanceStatus: c.instanceStatus };
}

/**
 * 提交单条数据
 * 【v3.3.0】根据 options.formType 自动分流：流程表单走 startInstance，普通表单走 saveFormData。
 */
async function submitOne(appId, formUuid, data, options = {}) {
  const { 
    csrfToken, 
    cookies, 
    hostname,
    maxRetries = 3,
    retryDelay = 1000,
    formType,
    processCode
  } = options;

  // 🔴 流程表单必须用 startInstance；缺 processCode 时直接报错，绝不降级为 saveFormData（那会产生打不开的坏数据）
  if (formType === 'process') {
    if (!processCode) {
      return {
        success: false,
        message: `[流程表单缺少 processCode] 表单 ${formUuid} 是流程表单，必须提供 processCode 才能通过 startInstance 发起流程实例。请依靠 getFormMeta 自动获取或在配置中显式传入 processCode。切勿用 saveFormData 提交流程表单。`,
        attempt: 0
      };
    }
    return startInstance(appId, formUuid, processCode, data, { csrfToken, cookies, hostname, maxRetries, retryDelay });
  }

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
    schemaPath = null,  // 本地Schema文件路径（可选）
    verifyProcess = true // 【v3.3.0】流程表单提交后是否抽查流程实例完整性
  } = config;
  
  // 加载Cookie
  const cookieData = loadCookies();
  const hostname = cookieData.baseUrl.replace('https://', '');
  
  let fieldMapping = {};

  // 🔴【v3.3.0】提交前判定表单类型：普通表单(receipt) vs 流程表单(process)。
  // 流程表单必须走 startInstance；用 saveFormData 会写出“详情页打不开”的坏数据。
  // 允许 config 显式覆盖（config.formType / config.processCode），否则自动探测导航元信息。
  let formType = config.formType || null;
  let processCode = config.processCode || null;
  if (!formType) {
    // 🔴【v3.3.1】表单类型探测失败时绝不静默降级为 'receipt'——那正是本次事故的根因：
    // 流程表单被误当普通表单用 saveFormData 提交，产生"列表能看到、详情打不开"的坏数据。
    // 探测失败时直接抛错，强制调用方显式传入 formType。
    try {
      const meta = await getFormMeta(appId, formUuid, cookieData);
      formType = meta.formType;
      if (!processCode) processCode = meta.processCode;
      console.log(`  ✅ 表单类型: ${formType === 'process' ? '流程表单(startInstance)' : '普通表单(saveFormData)'}${formType === 'process' ? ` processCode=${processCode || '未获取到⚠️'}` : ''}`);
    } catch (e) {
      throw new Error(`【表单类型探测失败·拒绝提交】${e.message}\n` +
        `🔴 安全机制：无法确认表单类型时绝不默认按普通表单提交，否则流程表单会生成详情页打不开的坏数据。\n` +
        `请在 config 中显式传入 formType('process' 或 'receipt')；流程表单还需传入 processCode。`);
    }
  }
  if (formType === 'process' && !processCode) {
    throw new Error('【流程表单缺少 processCode·拒绝提交】检测到流程表单但未获取到 processCode，提交被拒绝（绝不降级为 saveFormData）。请在 config.processCode 中显式传入。');
  }
  
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
    
    // 提交（按 formType 自动分流：流程表单走 startInstance，普通表单走 saveFormData）
    const result = await submitOne(appId, formUuid, transformedData, {
      csrfToken: cookieData.csrfToken,
      cookies: cookieData.cookies,
      hostname,
      formType,
      processCode
    });
    
    results.push({
      index: i,
      originalData: item,
      transformedData, // 【v3.6.1】保留提交载荷，失败时可直接打印诊断，无需临时脚本
      ...result
    });
    
    // 延迟
    if (i < dataList.length - 1 && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 🔴【v3.3.0】提交后完整性自检：流程表单抽查第一条成功记录，确认拥有真实流程上下文。
  // 若 instanceStatus 缺失，说明写入的是无流程上下文的坏数据（详情页打不开），立即告警。
  if (verifyProcess && formType === 'process') {
    const firstOk = results.find(r => r.success && r.instId);
    if (firstOk) {
      try {
        const check = await verifyProcessInstance(appId, firstOk.instId, cookieData);
        if (check.ok) {
          console.log(`  ✅ 流程实例自检通过: instanceStatus=${check.instanceStatus}`);
        } else {
          console.log(`  ⛔ 流程实例自检未通过: ${check.reason}（提交的数据可能详情页打不开，请检查提交路径是否误用 saveFormData）`);
        }
      } catch (e) {
        console.log('  ⚠️ 流程实例自检失败:', e.message);
      }
    }
  }
  
  return results;
}

/**
 * 发送GET请求
 * 【v3.2.0修复】自动添加CSRF Token到URL参数，避免GET请求返回空数据
 * 之前getRequest没有添加_csrf_token，导致查询API返回空数据，AI不得不写临时脚本绕过
 * @param {string} hostname - 主机名
 * @param {string} requestPath - 请求路径（可含query参数）
 * @param {Object|string} cookies - Cookie数组或Cookie字符串
 * @param {string} [csrfToken] - CSRF Token（可选，不传则从Cookie加载）
 */
function getRequest(hostname, requestPath, cookies, csrfToken) {
  return new Promise((resolve, reject) => {
    const cookieHeader = Array.isArray(cookies)
      ? cookies.map(c => `${c.name}=${c.value}`).join('; ')
      : cookies;

    // 如果没有传入csrfToken，尝试从Cookie加载
    if (!csrfToken) {
      try {
        const cookieData = loadCookies();
        csrfToken = cookieData.csrfToken;
      } catch (e) {
        // 忽略错误，继续请求
      }
    }

    // 自动添加CSRF Token到URL参数
    let finalPath = requestPath;
    if (csrfToken) {
      const separator = finalPath.includes('?') ? '&' : '?';
      finalPath += `${separator}_csrf_token=${encodeURIComponent(csrfToken)}`;
    }

    const options = {
      hostname,
      path: finalPath,
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': `https://${hostname}/`,
        'X-Requested-With': 'XMLHttpRequest'
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
 * 【v3.2.0修复】改用searchFormDatas.json（带s）API，并传入csrfToken参数
 * 之前使用searchFormDataIds.json（不带s）只返回ID数量，无法获取formData
 * @param {string} appId - 应用ID
 * @param {string} formUuid - 表单UUID
 * @param {string} formType - 表单类型（'普通表单' 或 '流程表单'）
 * @returns {number} 已有数据条数
 */
async function getExistingDataCount(appId, formUuid, formType) {
  const cookieData = loadCookies();
  const hostname = cookieData.baseUrl.replace('https://', '');
  const cookies = cookieData.cookies;
  const csrfToken = cookieData.csrfToken;

  try {
    let totalCount = 0;

    if (formType === '流程表单') {
      const path = `/dingtalk/web/${appId}/v1/process/getInstanceIds.json?formUuid=${formUuid}&pageSize=1&currentPage=1`;
      const result = await getRequest(hostname, path, cookies, csrfToken);
      if (result.success && result.content) {
        totalCount = result.content.totalCount || result.content.data?.length || 0;
      }
    } else {
      // v3.2.0: 改用 searchFormDatas.json（带s），与 searchFormDatas 函数保持一致
      const path = `/dingtalk/web/${appId}/v1/form/searchFormDatas.json?formUuid=${formUuid}&pageSize=1&currentPage=1`;
      const result = await getRequest(hostname, path, cookies, csrfToken);
      if (result.success && result.content) {
        totalCount = result.content.totalCount || (result.content.data ? result.content.data.length : 0);
      } else if (result.content && Array.isArray(result.content.data)) {
        totalCount = result.content.data.length;
      }
    }

    return totalCount;
  } catch (e) {
    return -1;
  }
}

/**
 * 解析记录的 instValue 为 formData 对象
 * 【v3.2.0新增】统一解析instValue，避免AI每次都自己写parseInstValue函数
 * 宜搭API返回的记录中，formData可能直接存在于record.formData，
 * 也可能需要从instValue（JSON字符串或数组）中解析
 * @param {Object} record - API返回的表单记录
 * @returns {Object} formData对象 { fieldId: value }
 */
function parseInstValue(record) {
  // 优先使用 formData 字段（如果API直接返回）
  if (record.formData && typeof record.formData === 'object') {
    return record.formData;
  }

  let raw = record.instValue || record.formData;
  if (!raw) return {};

  // 如果是字符串，先JSON.parse
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  // 如果是数组格式（[{fieldId, fieldData}]），转换为对象
  if (Array.isArray(raw)) {
    const fd = {};
    for (const item of raw) {
      const fieldId = item.fieldId;
      if (!fieldId) continue;
      const fieldData = item.fieldData || {};
      fd[fieldId] = fieldData.value;
    }
    return fd;
  }

  // 如果已经是对象，直接返回
  if (typeof raw === 'object') {
    return raw;
  }

  return {};
}

/**
 * 查询表单完整数据（含formData）
 * 【v3.2.0新增】统一查询表单数据，避免AI每次都自己写searchFormDatas函数
 * 使用 searchFormDatas.json（带s）API，返回完整数据包含formData
 * 自动解析instValue为formData字段
 * @param {string} appId - 应用ID
 * @param {string} formUuid - 表单UUID
 * @param {Object} [options] - 可选参数
 * @param {number} [options.pageSize=100] - 每页条数
 * @param {number} [options.currentPage=1] - 当前页码
 * @returns {Promise<Array<Object>>} 记录数组，每条记录包含formInstId, title, formData等字段
 *
 * @example
 * // 查询仓库信息所有数据
 * const records = await searchFormDatas(appId, warehouseFormUuid);
 * // records[0].formInstId = "FINST-xxx"
 * // records[0].title = "武汉光谷中心仓"
 * // records[0].formData = { textField_xxx: "武汉光谷中心仓", ... }
 */
async function searchFormDatas(appId, formUuid, options = {}) {
  const { pageSize = 100, currentPage = 1, maxPages = 50 } = options;
  const cookieData = loadCookies();
  const hostname = cookieData.baseUrl.replace('https://', '');
  const cookies = cookieData.cookies;
  const csrfToken = cookieData.csrfToken;

  // 【v3.6.0】自动翻页：存量超过 pageSize 时继续拉取，避免映射不完整导致关联填充静默失败
  const all = [];
  let page = currentPage;
  while (page - currentPage < maxPages) {
    const path = `/dingtalk/web/${appId}/v1/form/searchFormDatas.json?formUuid=${formUuid}&pageSize=${pageSize}&currentPage=${page}`;
    const result = await getRequest(hostname, path, cookies, csrfToken);

    // 兼容多种响应结构
    let list = [];
    if (result && result.content && Array.isArray(result.content.data)) {
      list = result.content.data;
    } else if (result && result.data && Array.isArray(result.data)) {
      list = result.data;
    } else if (result && result.result && Array.isArray(result.result.data)) {
      list = result.result.data;
    }

    // 为每条记录解析formData
    for (const record of list) {
      record.formData = parseInstValue(record);
    }
    all.push(...list);

    if (list.length < pageSize) break;
    page++;
  }

  return all;
}

/**
 * 建立 instanceId → title 映射表
 * 【v3.2.0新增】统一映射表构建，避免AI每次都自己写buildRecordMap函数
 * 从searchFormDatas返回的记录列表中，为每条记录建立instanceId到真实title的映射
 * @param {Array<Object>} records - searchFormDatas返回的记录数组
 * @param {Object} [labelMap] - 可选，label→fieldId映射表（用于从formData提取title字段值）
 * @param {string} [titleLabel] - 可选，title对应的字段中文名（如"仓库名称"、"产品名称"）
 * @returns {Object} instanceId → title 映射表
 *
 * @example
 * // 方式1：直接使用record.title（推荐，适用于已配置数据标题的表单）
 * const records = await searchFormDatas(appId, warehouseFormUuid);
 * const whMap = buildTitleMap(records);
 * // whMap = { "FINST-xxx": "武汉光谷中心仓", ... }
 *
 * // 方式2：从formData提取title字段值（适用于title不准确的场景）
 * const labelMap = loadLabelMap(schemaPath);
 * const whMap = buildTitleMap(records, labelMap, '仓库名称');
 */
function buildTitleMap(records, labelMap, titleLabel) {
  const map = {};
  for (const r of records) {
    let title = r.title;
    if ((!title || title === r.formInstId) && labelMap && titleLabel) {
      // 从formData中提取title字段值
      const fd = r.formData || parseInstValue(r);
      const fieldId = labelMap[titleLabel];
      if (fieldId && fd[fieldId]) {
        title = fd[fieldId];
      }
    }
    map[r.formInstId] = title || r.formInstId;
  }
  return map;
}

/**
 * 建立 title → instanceId 反向映射表
 * 【v3.4.0新增】解决 buildTitleMap 方向易误用问题
 *
 * 【背景】buildTitleMap 返回 {instanceId: title}，但 AI 实际场景
 * 往往是"已知 title（如"武汉光谷中心仓"）想查 instanceId"，
 * 直接用 warehouseMap[title] 会返回 undefined 导致提交失败。
 * 本函数直接返回反向映射，消除方向歧义。
 *
 * @param {Array<Object>} records - searchFormDatas返回的记录数组
 * @param {Object} [labelMap] - 可选，label→fieldId映射表
 * @param {string} [titleLabel] - 可选，title对应的字段中文名
 * @returns {Object} title → instanceId 映射表
 *
 * @example
 * const records = await searchFormDatas(appId, warehouseFormUuid);
 * const titleToInstId = buildReverseTitleMap(records);
 * // titleToInstId = { "武汉光谷中心仓": "FINST-xxx", ... }
 *
 * // ✅ 正确用法：已知title查instanceId
 * const instId = titleToInstId['武汉光谷中心仓'];
 *
 * // ❌ 错误用法（曾导致15分钟耗时bug）：用buildTitleMap的返回值按title查
 * // const whMap = buildTitleMap(records);  // 返回 {instanceId: title}
 * // const instId = whMap['武汉光谷中心仓'];  // undefined！
 */
function buildReverseTitleMap(records, labelMap, titleLabel) {
  const forwardMap = buildTitleMap(records, labelMap, titleLabel);
  const reverseMap = {};
  for (const [instId, title] of Object.entries(forwardMap)) {
    if (title && title !== instId) {
      reverseMap[title] = instId;
    }
  }
  return reverseMap;
}

/**
 * 从记录列表中按 title 查找完整记录
 * 【v3.4.0新增】方便AI通过已知title直接获取记录对象（含formData）
 *
 * @param {Array<Object>} records - searchFormDatas返回的记录数组
 * @param {string} title - 要查找的title
 * @returns {Object|null} 匹配的记录对象，未找到返回null
 *
 * @example
 * const records = await searchFormDatas(appId, warehouseFormUuid);
 * const whRecord = findRecordByTitle(records, '武汉光谷中心仓');
 * // whRecord = { formInstId: "FINST-xxx", title: "...", formData: {...} }
 */
function findRecordByTitle(records, title) {
  return records.find(r => r.title === title) || null;
}

/**
 * 从本地Schema文件加载 label → fieldId 映射表
 * 【v3.2.0新增】统一Schema加载，避免AI每次都自己写loadLabelMap和traverse函数
 * 支持两种Schema结构：
 * 1. 本地JSON文件: { componentsTree: [...] }
 * 2. API返回: { pages: [{ componentsTree: [...] }] }
 * @param {string} schemaPath - Schema文件路径
 * @returns {Object} label → fieldId 映射表
 *
 * @example
 * const labelMap = loadLabelMap(path.join(projectDir, '基础信息', '仓库信息.json'));
 * // labelMap = { "仓库名称": "textField_ypnkpqx1", "仓库地址": "addressField_xxx", ... }
 */
function loadLabelMap(schemaPath) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const map = {};

  function traverse(components) {
    if (!Array.isArray(components)) return;
    for (const comp of components) {
      if (comp.props && comp.props.fieldId) {
        const label = comp.props.label?.zh_CN || comp.props.label;
        if (label) {
          map[label] = comp.props.fieldId;
        }
      }
      if (comp.props && comp.props.children) traverse(comp.props.children);
      if (comp.children) traverse(comp.children);
    }
  }

  if (schema.componentsTree) traverse(schema.componentsTree);
  if (schema.pages && Array.isArray(schema.pages)) {
    for (const page of schema.pages) {
      if (page.componentsTree) traverse(page.componentsTree);
    }
  }
  return map;
}

/**
 * 验证关联字段的title是否与instanceId指向的真实记录名称一致
 * 【v3.2.0新增】统一验证逻辑，避免AI每次都自己写verifyAssociationField函数
 * 宜搭API返回的关联字段值是双重JSON字符串，需要JSON.parse两次才能解析
 * @param {Object} record - 包含关联字段的记录（searchFormDatas返回）
 * @param {string} associationFieldId - 关联字段的fieldId（注意：带_id后缀的存储字段）
 * @param {Object} expectedTitleMap - instanceId → 期望的title映射表（由buildTitleMap生成）
 * @returns {Object} { isValid: boolean, details: Array<{instanceId, actualTitle, expectedTitle, match}> }
 *
 * @example
 * const records = await searchFormDatas(appId, inventoryFormUuid);
 * const whMap = buildTitleMap(await searchFormDatas(appId, warehouseFormUuid));
 * for (const r of records) {
 *   const result = verifyAssociationField(r, 'associationFormField_ypnknza1', whMap);
 *   if (!result.isValid) {
 *     console.log('关联字段title不匹配:', result.details);
 *   }
 * }
 */
function verifyAssociationField(record, associationFieldId, expectedTitleMap) {
  const fd = record.formData || parseInstValue(record);
  // 【v3.2.1修复】关联字段在formData中的key可能带_id后缀（如associationFormField_xxx_id）
  // loadLabelMap返回的fieldId不带_id后缀，需要自动兼容两种key
  let rawValue = fd[associationFieldId] || fd[associationFieldId + '_id'];

  const details = [];
  let isValid = true;

  if (!rawValue) {
    return { isValid: false, details: [{ instanceId: null, actualTitle: null, expectedTitle: null, match: false, reason: '关联字段为空' }] };
  }

  // 关联字段是双重JSON字符串，需要JSON.parse两次
  let parsed = rawValue;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed); // 第一次parse
    } catch (e) {
      return { isValid: false, details: [{ instanceId: null, actualTitle: rawValue, expectedTitle: null, match: false, reason: 'JSON.parse第一次失败' }] };
    }
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed); // 第二次parse
    } catch (e) {
      // 可能不是双重字符串，继续处理
    }
  }

  // 确保是数组
  if (!Array.isArray(parsed)) {
    parsed = [parsed];
  }

  for (const item of parsed) {
    if (!item || !item.instanceId) continue;
    const actualTitle = item.title;
    const expectedTitle = expectedTitleMap[item.instanceId];
    const match = actualTitle === expectedTitle;
    if (!match) isValid = false;
    details.push({
      instanceId: item.instanceId,
      actualTitle,
      expectedTitle,
      match
    });
  }

  return { isValid, details };
}

/**
 * 【v3.6.0新增】删除普通表单的一条数据。
 * ⚠️ 关键差异：删除 API 与创建 API 不同，必须携带 _csrf_token，
 *    否则服务端返回 "csrf校验失败"——删除静默失败（2026-07-24 事故根因之一）。
 * @param {string} appId - 应用ID
 * @param {string} formInstId - 数据实例ID
 * @param {Object} [cookieData] - Cookie数据（不传则自动加载）
 * @returns {{success: boolean, message: string}}
 */
async function deleteFormData(appId, formInstId, cookieData) {
  const cd = cookieData || loadCookies();
  const hostname = cd.baseUrl.replace('https://', '');
  const result = await postRequest(
    hostname,
    `/dingtalk/web/${appId}/v1/form/deleteFormData.json`,
    { formInstId, _csrf_token: cd.csrfToken },
    cd.cookies
  );
  return { success: !!(result && result.success === true), message: (result && (result.errorMsg || result.message)) || '' };
}

/**
 * 【v3.6.0新增】删除流程表单的一个实例（必须携带 _csrf_token，同 deleteFormData）。
 * @param {string} appId - 应用ID
 * @param {string} processInstanceId - 流程实例ID
 * @param {Object} [cookieData] - Cookie数据（不传则自动加载）
 * @returns {{success: boolean, message: string}}
 */
async function deleteInstance(appId, processInstanceId, cookieData) {
  const cd = cookieData || loadCookies();
  const hostname = cd.baseUrl.replace('https://', '');
  const result = await postRequest(
    hostname,
    `/dingtalk/web/${appId}/v1/process/deleteInstance.json`,
    { processInstanceId, _csrf_token: cd.csrfToken },
    cd.cookies
  );
  return { success: !!(result && result.success === true), message: (result && (result.errorMsg || result.message)) || '' };
}

/**
 * 【v3.6.0新增】清空指定表单的全部数据（普通/流程自动分流，逐条校验删除结果）。
 * 数据异常时的官方修复手段：清空后重跑 submitAllWithAutoAssociations 即可。
 * @param {string} appId - 应用ID
 * @param {string} formUuid - 表单UUID
 * @param {string} formType - '普通表单' 或 '流程表单'（discoverForms 返回的 type 值）
 * @param {Object} [cookieData] - Cookie数据（不传则自动加载）
 * @returns {{deleted: number, failed: number, total: number}}
 */
async function clearFormData(appId, formUuid, formType, cookieData) {
  const cd = cookieData || loadCookies();
  const hostname = cd.baseUrl.replace('https://', '');
  const isProcess = formType === '流程表单' || formType === 'process';
  const idsPath = isProcess
    ? `/dingtalk/web/${appId}/v1/process/getInstanceIds.json?formUuid=${formUuid}&pageSize=100&currentPage=1`
    : `/dingtalk/web/${appId}/v1/form/searchFormDataIds.json?formUuid=${formUuid}&pageSize=100&currentPage=1`;
  const res = await getRequest(hostname, idsPath, cd.cookies, cd.csrfToken);
  let ids = [];
  if (res && res.content && Array.isArray(res.content.data)) ids = res.content.data;
  else if (res && Array.isArray(res.data)) ids = res.data;

  let deleted = 0, failed = 0;
  for (const id of ids) {
    const r = isProcess ? await deleteInstance(appId, id, cd) : await deleteFormData(appId, id, cd);
    if (r.success) {
      deleted++;
    } else {
      failed++;
      console.log(`  ⚠️ 删除失败 ${id}: ${r.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { deleted, failed, total: ids.length };
}

module.exports = {
  submitBatch,
  submitOne,
  syncFormSchema,
  extractFieldMapping,
  transformData,
  loadCookies,
  getExistingDataCount,
  // v3.2.0新增：关联表单场景标准函数
  searchFormDatas,
  buildTitleMap,
  loadLabelMap,
  parseInstValue,
  verifyAssociationField,
  // v3.4.0新增：反向映射 + 按title查找记录（解决buildTitleMap方向易误用问题）
  buildReverseTitleMap,
  findRecordByTitle,
  // v3.3.0新增：流程表单支持（getFormMeta/startInstance/verifyProcessInstance）
  // 【v3.3.1】此前这些函数未导出，导致外部无法直接调用；现已修复
  getFormMeta,
  startInstance,
  verifyProcessInstance,
  getRequest,
  // v3.6.0新增：删除能力（数据异常时的官方修复手段，严禁 AI 手写删除脚本）
  deleteFormData,
  deleteInstance,
  clearFormData
};
