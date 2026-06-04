/**
 * 宜搭应用配置同步脚本 - 主入口
 * 版本: 3.7.2
 * 更新日期: 2026-05-17
 *
 * 更新内容:
 * - v3.7.2: 【简化修复】直接从createdForms和临时文件读取processCode
 *          - 不再硬编码为null，而是从form.processCode读取
 *          - 配合form_manager.js v1.6.1+，创建表单时返回processCode
 *          - 简化流程Code获取逻辑，不再依赖复杂的补充获取机制
 * - v3.7.1: 【重要修复】新建应用时也能获取流程Code
 *          - 在生成系统配置清单前，检测流程表单是否缺少processCode
 *          - 如果缺少，自动调用Playwright方式从部署运维页面补充获取
 *          - 确保不管是新建应用还是同步老应用，流程Code都能正确写入
 * - v3.7.0: 【重要修复】系统配置清单表格添加"流程Code"列
 *          - 表格格式从3列改为4列：序号、页面名称「类型」、表单UUID、流程Code
 *          - 普通表单流程Code显示"-"，流程表单显示真实流程Code
 *          - 同步时自动从平台获取流程Code并写入系统配置清单
 *          - 修复之前版本移除流程Code列导致的问题
 * - v3.6.0: 【彻底禁用分组】所有表单直接放在项目根目录
 *          - 禁用 AI 智能分组功能（autoGroupForms 返回空数组）
 *          - 禁用 hasExistingGroups 检测（始终返回 false）
 *          - 禁用 createFormDirectory 分组创建（忽略 groupName）
 *          - findFormDirectory 只在根目录查找，不查找分组目录
 *          - 所有表单统一放在项目根目录下，简化目录结构
 * - v3.5.0: 【重要修复】支持从create_from_markdown.js接收已创建表单列表
 *          - 新增 createdForms 参数支持，优先使用已知的表单UUID
 *          - 应用验证阶段识别 createdForms，跳过API验证
 *          - 获取表单列表阶段优先使用 createdForms，避免API查询
 *          - 解决新应用创建后API返回404导致同步失败的问题
 * - v3.4.0: 移除「未分组表单」目录逻辑
 *          - 表单直接在项目根目录下创建，不再放入未分组表单子目录
 *          - 统一目录查找逻辑，不再优先查找未分组表单目录
 *
 * 更新内容:
 * - v3.3.0: 优化组件ID清单格式
 *          - 子表组件ID不再显示在主表字段列表中
 *          - 子表标题直接显示子表组件ID：## 📋 子表：子表名称 (tableField_xxx)
 *          - 主表字段和子表字段完全分离，避免重复显示
 * - v3.2.3: 移除多余的JSON文件生成
 *          - 不再生成`${folderName}_schema.json`和`${folderName}.json`
 *          - 只生成组件ID清单.md和表单结构变更.md
 *          - JSON文件由sync_form_schemas.js统一生成
 * - v3.2.2: 修复AI智能分组的表单匹配逻辑
 *          - 使用form.name和form.formUuid进行值比较，而不是引用比较
 *          - 解决groups.find(g => g.forms.includes(form))始终返回undefined的问题
 * - v3.2.1: 修复Playwright备用方案调用问题
 *          - 直接调用fetch_forms_playwright.js而不是sync_form_list_playwright.js
 *          - 修复输出文件格式解析问题（支持直接数组或包含forms字段的对象）
 *          - 修复参数传递问题
 * - v3.2.0: API失败时自动回退到Playwright方式
 *          - 解决getFormList API经常返回404的问题
 *          - 当API方式获取表单列表失败时，自动调用Playwright脚本
 *          - 保持向后兼容，不破坏原有功能
 * - v3.1.0: 简化表单UUID清单表格格式
 *          - 只保留3列：序号、页面名称「类型」、表单UUID
 *          - 移除"页面类型"、"流程Code"列
 *          - 更新正则表达式匹配新格式
 *          - 【注意】v3.7.0已恢复流程Code列，此版本变更已回退
 * - v3.0.0: 系统配置清单格式优化
 *          - 表单UUID和流程Code分开显示（不再混在一起）
 *          - 不更新应用ID（由form_creator创建时写入或用户手动维护）
 *          - 保留原有的应用名称、应用ID、创建时间
 *          - 表头改为"表单ID清单"，添加说明文字
 * - v2.1.0: 新增双模式同步功能
 *          - 新项目模式：自动从平台获取应用信息和表单列表
 *          - 已有项目模式：支持指定应用ID和表单UUID列表
 *          - 支持从部署运维信息中解析表单列表
 *          - 智能识别用户输入，自动选择同步模式
 * - v2.0.0: 新增AI智能分组功能
 *          - 根据表单名称自动分类到2-3个分组
 *          - 分组序号从02开始（避免与01需求梳理重复）
 *          - 没有分组时自动创建，有分组时不修改
 *          - 每个表单单独文件夹，包含完整schema、精简JSON、组件ID清单、变更记录
 *          - 标准文件结构与新建应用保持一致
 * - v1.0.9: 修复应用创建后立即同步时验证失败的问题
 *          - 添加重试机制，API查询失败时自动重试3次
 *          - 如果有临时文件或本地配置，跳过API验证直接同步
 *          - 修复批量同步时只同步一个表单的问题
 * - v1.0.8: 修复表单列表解析逻辑，正确处理API返回的空对象
 *          - 避免将空对象{}误认为是一个表单
 *          - 添加表单数据有效性检查
 * - v1.0.7: 新增应用ID验证逻辑，使用本地应用ID去平台验证是否存在
 *          - 如果平台返回空表单列表，说明应用不存在或已被删除，直接报错
 *          - 验证通过后才继续同步表单和组件ID
 * 
 * 功能:
 * 1. 创建时同步：配合create_from_markdown.js，在创建应用后自动同步配置
 * 2. 更新同步：支持手动运行，从宜搭平台获取最新的表单和组件信息
 * 3. AI智能分组：自动根据表单名称分类，生成标准目录结构
 * 4. 双模式同步：支持新项目（自动获取）和已有项目（指定ID）两种模式
 * 
 * 目录结构规范:
 * 项目名称/
 * ├── 01需求梳理/          # 需求文档（已有则不修改）
 * ├── 02客户管理/          # AI智能分组
 * │   └── 客户信息「普通表单」/
 * │       ├── 客户信息「普通表单」.json
 * │       ├── 客户信息「普通表单」_schema.json
 * │       ├── 组件ID清单.md
 * │       └── 表单结构变更.md
 * └── 系统配置清单.md
 * 
 * 使用方式:
 * 1. 新项目同步（自动获取）:
 *    node sync_config.js --output /path/to/project
 * 
 * 2. 已有项目同步（指定应用ID）:
 *    node sync_config.js --appId APP_XXX --output /path/to/project
 * 
 * 3. 从部署运维信息同步:
 *    node sync_config.js --appId APP_XXX --formsFile ./forms.json --output /path/to/project
 * 
 * 4. 手动更新同步（用户在宜搭修改后）:
 *    node sync_config.js --appId APP_XXX --output /path/to/project --update
 * 
 * 5. 同步已有应用（AI智能分组）:
 *    node sync_config.js --appId APP_XXX --output /path/to/project --smart-group
 * 
 * 功能: 从宜搭平台同步应用配置，生成系统配置清单和组件ID清单
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 引入 yida-api-client 的模块
const {
  loadCookieData,
  triggerLogin,
  resolveBaseUrl,
  resolveCorpId,
  postRequest,
  getRequest,
  requestWithAutoLogin,
  buildApiPath
} = require('../../yida-api-client/scripts/api_client.js');

// 引入 form_manager 的 getFormSchema 函数
const { getFormSchema } = require('../../yida-api-client/scripts/form_manager.js');

// 登录脚本路径
const LOGIN_SCRIPT = path.join(__dirname, '..', '..', 'yida-api-client', 'scripts', 'login_manager.js');

// Playwright 同步脚本路径（API失败时的备用方案）
const PLAYWRIGHT_FETCH_SCRIPT = path.join(__dirname, 'fetch_forms_playwright.js');

/**
 * 【已禁用】AI智能分组函数
 * 所有表单直接放在项目根目录下，不进行任何分组
 */
function autoGroupForms(forms) {
  // 返回空数组，禁用分组功能，所有表单直接放在根目录
  return [];
}

/**
 * 【已禁用】检查是否已有分组目录
 * 所有表单直接放在根目录，不创建分组
 */
function hasExistingGroups(baseDir) {
  // 禁用分组功能，始终返回 false
  return false;
}

/**
 * 创建表单目录结构
 * 所有表单直接放在项目根目录下，不进行分组
 */
function createFormDirectory(baseDir, groupName, formName, formType) {
  // 忽略 groupName，直接在根目录创建表单文件夹
  const folderName = `${formName}「${formType}」`;
  const formPath = path.join(baseDir, folderName);
  
  // 创建表单目录（如果不存在）
  if (!fs.existsSync(formPath)) {
    fs.mkdirSync(formPath, { recursive: true });
    console.log(`     📁 创建表单目录: ${folderName}`);
  }
  
  return formPath;
}

/**
 * 生成精简版JSON
 */
function generateSimplifiedJson(formName, formType, formUuid, schema, components) {
  return {
    formName: formName,
    formType: formType,
    formUuid: formUuid,
    title: schema.title || formName,
    schemaVersion: schema.schemaVersion || 'V5',
    gmtModified: schema.gmtModified,
    pageCount: schema.pages?.length || 0,
    componentCount: components.length,
    components: components.map(c => ({
      componentName: c.componentName,
      fieldId: c.fieldId,
      label: c.label
    }))
  };
}

/**
 * 生成表单结构变更记录
 */
function generateChangeMd(formName, formType) {
  const today = new Date().toISOString().split('T')[0];
  return `# ${formName}「${formType}」- 表单结构变更记录

> 版本: 1.0.0
> 创建日期: ${today}

---

## 📋 变更记录

| 版本 | 日期 | 变更内容 | 变更人 |
|:----:|:-----|:---------|:-------|
| 1.0.0 | ${today} | 初始版本，从宜搭平台同步 | 系统自动 |

---

## 📝 说明

- 本文件记录表单结构的变更历史
- 每次表单结构变更时，请更新此文件
- 包含字段增删改、组件类型变更等

---

*最后更新时间: ${new Date().toLocaleString()}*
`;
}

/**
 * 从系统配置清单中解析应用ID
 */
function parseAppIdFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }
  
  const content = fs.readFileSync(configPath, 'utf-8');
  const appIdMatch = content.match(/\|\s*\*\*应用ID\*\*\s*\|\s*(APP[_-][A-Z0-9]+)\s*\|/);
  return appIdMatch ? appIdMatch[1] : null;
}

/**
 * 从系统配置清单中解析表单列表
 */
function parseFormsFromConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const forms = [];

  // 匹配表单列表表格行
  // 格式1: | 序号 | 页面名称「类型」 | 表单UUID | 流程Code |
  const formRegex = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*「([^|]+?)」\s*\|\s*([A-Z0-9-]+)\s*\|\s*([^|]*)\s*\|/g;
  let match;

  while ((match = formRegex.exec(content)) !== null) {
    forms.push({
      index: parseInt(match[1]),
      name: match[2].trim(),
      type: match[3].trim(),
      formUuid: match[4].trim(),
      processCode: match[5] ? match[5].trim() || null : null
    });
  }

  return forms.length > 0 ? forms : null;
}

/**
 * 从部署运维信息文件解析表单列表
 * 支持格式：
 * 应用编码：APP_XXX
 * 页面名称：产品信息
 * 页面类型：表单
 * 页面编码：FORM-XXX
 */
function parseFormsFromDeployInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const forms = [];

  // 尝试解析JSON格式
  try {
    const jsonData = JSON.parse(content);
    if (Array.isArray(jsonData)) {
      return jsonData.map((form, index) => ({
        index: index + 1,
        name: form.name || form.title || '未命名表单',
        type: form.type || (form.formType === 'process' ? '流程' : '表单'),
        formUuid: form.formUuid || form.uuid || form.pageCode,
        processCode: form.processCode || null
      }));
    }
  } catch (e) {
    // 不是JSON格式，继续尝试文本解析
  }

  // 解析文本格式
  const lines = content.split('\n');
  let currentForm = null;
  let formIndex = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 匹配页面名称
    const nameMatch = trimmedLine.match(/页面名称[：:]\s*(.+)/);
    if (nameMatch) {
      if (currentForm) {
        forms.push(currentForm);
      }
      formIndex++;
      currentForm = {
        index: formIndex,
        name: nameMatch[1].trim(),
        type: '表单',
        formUuid: null,
        processCode: null
      };
      continue;
    }

    // 匹配页面类型
    const typeMatch = trimmedLine.match(/页面类型[：:]\s*(.+)/);
    if (typeMatch && currentForm) {
      const type = typeMatch[1].trim();
      currentForm.type = type.includes('流程') ? '流程' : '表单';
      continue;
    }

    // 匹配页面编码（formUuid）
    const uuidMatch = trimmedLine.match(/页面编码[：:]\s*(FORM-[A-Z0-9-]+)/i);
    if (uuidMatch && currentForm) {
      currentForm.formUuid = uuidMatch[1].trim().toUpperCase();
      continue;
    }

    // 匹配流程编码
    const processMatch = trimmedLine.match(/流程编码[：:]\s*(TPROC-[A-Z0-9-]+)/i);
    if (processMatch && currentForm) {
      currentForm.processCode = processMatch[1].trim().toUpperCase();
      continue;
    }
  }

  // 添加最后一个表单
  if (currentForm) {
    forms.push(currentForm);
  }

  return forms.length > 0 ? forms : null;
}

/**
 * 从部署运维信息中解析应用ID
 */
function parseAppIdFromDeployInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // 匹配应用编码
  const appIdMatch = content.match(/应用编码[：:]\s*(APP[_-][A-Z0-9]+)/i);
  if (appIdMatch) {
    return appIdMatch[1].trim().toUpperCase().replace(/-/g, '_');
  }

  return null;
}

/**
 * 刷新登录态
 * 调用Python登录脚本获取新鲜的登录态
 */
function refreshLoginState() {
  console.log('\n🔐 刷新登录态...');
  
  try {
    const result = execSync(`node "${LOGIN_SCRIPT}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const loginInfo = JSON.parse(result);
    if (loginInfo && loginInfo.csrf_token) {
      console.log(`   ✅ 登录态刷新成功 (${loginInfo.base_url})`);
      return {
        csrfToken: loginInfo.csrf_token,
        cookies: loginInfo.cookies,
        baseUrl: loginInfo.base_url,
        corpId: loginInfo.corp_id
      };
    }
  } catch (error) {
    console.log(`   ⚠️ 刷新登录态失败: ${error.message}`);
  }
  
  return null;
}

/**
 * 获取应用信息
 * @param {Object} authRef - 登录认证信息
 * @param {string} appId - 应用ID
 * @param {string} [appName] - 可选的应用名称（批量同步时从组织及应用信息.md传入）
 */
async function fetchAppInfo(authRef, appId, appName) {
  try {
    // 宜搭没有直接获取应用信息的API，从登录态中获取
    const baseUrl = authRef.baseUrl;
    const appUrl = `${baseUrl}/${appId}/admin`;
    
    return {
      appName: appName || `未知应用(${appId})`,
      appId: appId,
      baseUrl: baseUrl,
      appUrl: appUrl
    };
  } catch (error) {
    throw new Error(`获取应用信息失败: ${error.message}`);
  }
}

/**
 * 使用Playwright方式获取表单列表（API失败时的备用方案）
 * @param {string} appId - 应用ID
 * @param {string} outputDir - 输出目录（用于Playwright脚本）
 * @returns {Array} 表单列表
 */
async function fetchFormListWithPlaywright(appId, outputDir) {
  const forms = [];
  
  try {
    console.log('  🔄 API方式失败，尝试使用Playwright方式...');
    console.log(`  📡 调用Playwright脚本: ${PLAYWRIGHT_FETCH_SCRIPT}`);
    
    // 检查Playwright脚本是否存在
    if (!fs.existsSync(PLAYWRIGHT_FETCH_SCRIPT)) {
      console.warn('  ⚠️ Playwright脚本不存在，跳过');
      return forms;
    }
    
    // 创建临时目录用于存储Playwright输出
    const tempDir = path.join(outputDir, '.temp_sync');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const outputFile = path.join(tempDir, 'forms_deploy_list.json');
    const cookieFile = path.join(path.resolve(__dirname, '..', '..', '..', '..'), '.cookies.json');
    
    // 调用Playwright脚本获取表单列表
    // 参数: appId, appName, outputFile, cookieFile, visualMode
    try {
      execSync(
        `node "${PLAYWRIGHT_FETCH_SCRIPT}" "${appId}" "${appId}" "${outputFile}" "${cookieFile}" "false"`,
        {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 120_000,
          cwd: process.cwd()
        }
      );
    } catch (execError) {
      // Playwright脚本执行失败，但可能已生成临时文件
      console.log('  ⚠️ Playwright脚本执行完成（可能有警告）');
    }
    
    // 尝试读取Playwright生成的部署信息文件
    if (fs.existsSync(outputFile)) {
      const deployContent = fs.readFileSync(outputFile, 'utf-8');
      const deployData = JSON.parse(deployContent);
      
      // 支持两种格式：直接数组或包含forms字段的对象
      const formsList = Array.isArray(deployData) ? deployData : (deployData.forms || []);
      
      if (formsList.length > 0) {
        console.log(`  📋 Playwright获取到 ${formsList.length} 个表单`);
        
        for (let i = 0; i < formsList.length; i++) {
          const form = formsList[i];
          console.log(`     [${i+1}] ${form.name || '未命名'} - UUID: ${form.formUuid || '无'}`);
          // 修正表单类型判断：有流程编码的就是流程表单
          const hasProcess = form.processCode || (form.formType === 'process') || (form.type && form.type.includes('流程'));
          forms.push({
            index: i + 1,
            name: form.name || '未命名表单',
            type: hasProcess ? '流程' : '表单',
            formUuid: form.formUuid,
            processCode: form.processCode || null
          });
        }
      }
      
      // 清理临时文件
      try {
        fs.unlinkSync(outputFile);
      } catch (e) {
        // 忽略清理错误
      }
    }
    
    // 清理临时目录
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      // 忽略清理错误
    }
    
    return forms;
  } catch (error) {
    console.warn(`  ⚠️ Playwright方式也失败了: ${error.message}`);
    return forms;
  }
}

/**
 * 获取表单列表
 * 优先使用API方式，失败时自动回退到Playwright方式
 */
async function fetchFormList(authRef, appId, outputDir = null) {
  const forms = [];
  let apiFailed = false;
  
  try {
    console.log(`  📡 调用API: ${buildApiPath(appId, 'getFormList')}`);
    
    // 调用宜搭API获取表单列表
    const result = await requestWithAutoLogin((auth) => {
      return getRequest(
        auth.baseUrl,
        buildApiPath(appId, 'getFormList'),
        { _csrf_token: auth.csrfToken },
        auth.cookies
      );
    }, authRef);
    
    console.log(`  📥 API返回: success=${result?.success}, hasContent=${!!result?.content}, errorCode=${result?.errorCode}`);
    
    if (!result?.success) {
      console.warn(`  ⚠️ API调用失败: ${result?.errorMsg || '未知错误'}`);
      apiFailed = true;
    } else if (!result.content) {
      console.warn('  ⚠️ API返回内容为空');
      apiFailed = true;
    } else {
      // 调试：输出content的实际结构
      console.log(`  🔍 content类型: ${typeof result.content}`);
      console.log(`  🔍 content键: ${Object.keys(result.content).join(', ')}`);
      console.log(`  🔍 content内容: ${JSON.stringify(result.content).substring(0, 200)}`);
      
      // 解析表单列表 - 宜搭API可能返回不同的结构
      let formList = [];
      if (Array.isArray(result.content)) {
        formList = result.content;
      } else if (result.content.data && Array.isArray(result.content.data)) {
        formList = result.content.data;
      } else if (result.content.list && Array.isArray(result.content.list)) {
        formList = result.content.list;
      } else if (result.content.forms && Array.isArray(result.content.forms)) {
        formList = result.content.forms;
      } else if (result.content.formUuid || result.content.name || result.content.title) {
        // 只有content包含表单相关字段时才当作单个表单处理
        formList = [result.content];
      } else {
        console.log('  ⚠️ API返回的content不包含有效的表单数据');
        apiFailed = true;
      }
      
      if (!apiFailed && formList.length > 0) {
        console.log(`  📋 解析到 ${formList.length} 个表单`);
        
        for (let i = 0; i < formList.length; i++) {
          const form = formList[i];
          // 检查表单数据是否有效
          if (!form || typeof form !== 'object') {
            console.log(`     [${i+1}] 无效表单数据`);
            continue;
          }
          console.log(`     [${i+1}] ${form.title?.zh_CN || form.name || '未命名'} - UUID: ${form.formUuid || '无'}`);
          forms.push({
            index: i + 1,
            name: form.title?.zh_CN || form.name || '未命名表单',
            type: form.formType === 'process' ? '流程' : '表单',
            formUuid: form.formUuid,
            processCode: form.processCode || null
          });
        }
        
        // API方式成功，直接返回
        return forms;
      } else if (!apiFailed && formList.length === 0) {
        console.log('  ⚠️ API返回的表单列表为空');
        apiFailed = true;
      }
    }
  } catch (error) {
    console.warn(`  ⚠️ 获取表单列表失败: ${error.message}`);
    apiFailed = true;
  }
  
  // API方式失败，尝试Playwright方式
  if (apiFailed && outputDir) {
    const playwrightForms = await fetchFormListWithPlaywright(appId, outputDir);
    if (playwrightForms.length > 0) {
      return playwrightForms;
    }
  }
  
  return forms;
}

/**
 * 获取表单Schema（包含组件信息）
 * 使用 form_manager.js 中的 getFormSchema 函数
 */
async function fetchFormSchema(authRef, appId, formUuid) {
  try {
    console.log(`  📡 调用API: ${buildApiPath(appId, 'getFormSchema')}`);
    console.log(`  📋 formUuid: ${formUuid}`);
    
    // 使用 form_manager.js 中的 getFormSchema 函数
    const schema = await getFormSchema(authRef, appId, formUuid);
    
    if (!schema) {
      throw new Error('获取表单Schema失败: 返回为空');
    }
    
    console.log(`  ✅ 获取Schema成功，类型: ${typeof schema}`);
    if (schema && typeof schema === 'object') {
      console.log(`     Schema键: ${Object.keys(schema).join(', ')}`);
    }
    
    return schema;
  } catch (error) {
    console.error(`  ❌ 获取表单Schema失败: ${error.message}`);
    throw error;
  }
}

/**
 * 从Schema中提取组件信息
 * 宜搭Schema结构: schema.pages[0].componentsTree[0] -> RootContent -> FormContainer -> children
 * 
 * 更新：支持子表字段提取，正确标记子表组件和子表内字段
 */
function extractComponentsFromSchema(schemaData) {
  const components = [];
  
  console.log(`  🔍 开始解析Schema...`);
  
  let schema = schemaData;
  if (schemaData.content) {
    schema = typeof schemaData.content === 'string' 
      ? JSON.parse(schemaData.content) 
      : schemaData.content;
  }
  
  // 宜搭Schema结构: schema.pages[0].componentsTree[0] -> RootContent -> FormContainer -> children
  let componentsTree = null;
  
  if (schema.pages && Array.isArray(schema.pages) && schema.pages.length > 0) {
    const pageRoot = schema.pages[0].componentsTree?.[0];
    if (pageRoot && pageRoot.children) {
      // 查找 RootContent
      const rootContent = pageRoot.children.find(c => c.componentName === 'RootContent');
      if (rootContent && rootContent.children) {
        // 查找 FormContainer
        const formContainer = rootContent.children.find(c => c.componentName === 'FormContainer');
        if (formContainer && formContainer.children) {
          componentsTree = formContainer.children;
          console.log(`     ✓ 从FormContainer找到 ${componentsTree.length} 个顶层组件`);
        }
      }
    }
  }
  
  // 兼容旧结构：直接查找componentsTree
  if (!componentsTree && schema.componentsTree && Array.isArray(schema.componentsTree)) {
    componentsTree = schema.componentsTree;
    console.log(`     ✓ 从componentsTree找到 ${componentsTree.length} 个顶层组件`);
  }
  
  // 兼容旧结构：直接查找components
  if (!componentsTree && schema.components && Array.isArray(schema.components)) {
    componentsTree = schema.components;
    console.log(`     ✓ 从components找到 ${componentsTree.length} 个顶层组件`);
  }
  
  if (!componentsTree) {
    console.log(`     ⚠️ 无法找到组件列表`);
    return components;
  }
  
  // 递归遍历组件树
  function traverseComponents(node, depth = 0, parentTable = null) {
    if (!node || typeof node !== 'object') return;
    
    // 如果当前节点有fieldId，记录它
    if (node.props && node.props.fieldId) {
      // Button 组件使用 content 代替 label 存储显示文本
      const label = node.props.label?.zh_CN || 
                   node.props.label || 
                   node.props.content?.zh_CN ||
                   node.props.content ||
                   node.props.name ||
                   '未命名字段';
      
      const compInfo = {
        componentName: node.componentName,
        fieldName: label,
        fieldId: node.props.fieldId
      };
      
      // 如果是子表组件，标记为子表
      if (node.componentName === 'TableField') {
        compInfo.isTableField = true;
      }
      
      // 如果是子表内的字段，记录父级子表信息
      if (parentTable) {
        compInfo.parentTable = parentTable;
      }
      
      components.push(compInfo);
    }
    
    // 递归遍历子组件
    // 子组件可能在children、slots、或props.children中
    const children = node.children || 
                    node.slots?.default?.children ||
                    node.props?.children;
    
    if (Array.isArray(children)) {
      // 如果是子表组件，传递子表信息给子字段
      const tableInfo = node.componentName === 'TableField' && node.props ? {
        fieldId: node.props.fieldId,
        fieldName: node.props.label?.zh_CN || node.props.label || node.props.content?.zh_CN || node.props.content || node.props.name || '未命名'
      } : parentTable;
      
      for (const child of children) {
        traverseComponents(child, depth + 1, tableInfo);
      }
    }
  }
  
  // 遍历所有顶层组件
  for (const component of componentsTree) {
    traverseComponents(component);
  }
  
  console.log(`     📊 共提取 ${components.length} 个组件`);
  
  return components;
}

/**
 * 生成系统配置清单
 * 注意：不更新应用ID，应用ID由form_creator创建时写入或用户手动维护
 */
function generateSystemConfig(appInfo, forms, existingConfig = null) {
  const now = new Date().toISOString().split('T')[0];
  
  // 从现有配置中提取应用ID（如果不更新）
  let existingAppId = appInfo.appId;
  let existingAppName = appInfo.appName;
  let existingCreateTime = now;
  
  if (existingConfig) {
    // 提取现有的应用ID
    const appIdMatch = existingConfig.match(/\*\*应用ID\*\*\s*\|\s*([^|\n]+)/);
    if (appIdMatch && appIdMatch[1].trim()) {
      existingAppId = appIdMatch[1].trim();
    }
    // 提取现有的应用名称
    const appNameMatch = existingConfig.match(/\*\*应用名称\*\*\s*\|\s*([^|\n]+)/);
    if (appNameMatch && appNameMatch[1].trim()) {
      existingAppName = appNameMatch[1].trim();
    }
    // 提取现有的创建时间
    const createTimeMatch = existingConfig.match(/\*\*创建时间\*\*\s*\|\s*([^|\n]+)/);
    if (createTimeMatch && createTimeMatch[1].trim()) {
      existingCreateTime = createTimeMatch[1].trim();
    }
  }
  
  // 构建表单表格行 - 包含流程Code列
  const formRows = forms.map(form => {
    const formUuid = form.formUuid || '-';
    const formType = form.type === '流程' ? '流程表单' : '普通表单';
    const processCode = form.processCode || '-';
    return `| ${form.index} | ${form.name}「${formType}」 | ${formUuid} | ${processCode} |`;
  }).join('\n');
  
  // 保留原有的创建失败记录和备注
  let failureRecords = '';
  let existingNotes = '';
  
  if (existingConfig) {
    // 尝试提取现有的失败记录和备注
    const failureMatch = existingConfig.match(/## ⚠️ 创建失败记录([\s\S]*?)(?=## |$)/);
    if (failureMatch) {
      failureRecords = failureMatch[0];
    }
  }
  
  return `# ${existingAppName} - 系统配置清单

> 版本: 1.0.0
> 生成日期: ${now}
> 更新说明: 自动同步宜搭平台配置

---

## 📱 应用信息

| 配置项 | 值 |
|--------|-----|
| **应用名称** | ${existingAppName} |
| **应用ID** | ${existingAppId} |
| **访问地址** | ${appInfo.appUrl} |
| **创建时间** | ${existingCreateTime} |
| **表单数量** | ${forms.length} |

---

## 📋 表单ID清单

> **说明**：从宜搭平台「部署运维」页面获取所有页面编码。流程表单包含两个ID：表单UUID（页面编码）和流程Code（流程编码）

| 序号 | 页面名称「类型」 | 页面编码（表单UUID） | 流程Code |
|:---:|-----------------|---------------------|----------|
${formRows}

---

${failureRecords || `## ⚠️ 创建失败记录

| 表单名称 | 失败原因 |
|---------|---------|
| - | - |

`}---

## 📊 统计信息

| 统计项 | 数量 |
|--------|------|
| 总表单数 | ${forms.length} |
| 成功同步 | ${forms.length} |
| 普通表单 | ${forms.filter(f => f.type === '表单').length} |
| 流程表单 | ${forms.filter(f => f.type === '流程').length} |

---

## 🔗 快速访问

- **应用管理后台**: ${appInfo.appUrl}
- **宜搭平台**: https://www.aliwork.com

---

## 📝 备注

1. 本清单由系统自动同步生成，记录了宜搭平台的应用和表单ID
2. 表单UUID用于API调用和系统集成
3. 如表单结构有变更，请重新运行同步脚本

---

*最后更新时间: ${now}*
`;
}

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
  'CheckboxField': '复选',
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
 */
function getComponentTypeCN(componentName) {
  return COMPONENT_TYPE_MAP[componentName] || componentName;
}

/**
 * 生成组件ID清单
 * 格式：主表字段和子表字段分开为独立的表格
 * 子表组件ID显示在子表标题中，不显示在主表字段列表里
 */
function generateComponentMd(formName, components) {
  const now = new Date().toISOString().split('T')[0];
  
  // 分离主表字段、子表组件和子表内字段
  // 主表字段：没有parentTable且不是子表组件的字段
  const mainFields = components.filter(c => !c.parentTable && !c.isTableField);
  // 子表组件本身（用于获取子表名称和ID）
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
  let mdContent = `# ${formName} - 组件ID清单

> 版本: 1.0.0
> 生成日期: ${now}
> 更新说明: 从宜搭平台获取的表单组件ID清单

---

## 📋 主表字段

| 序号 | 组件类型 | 字段名称 | 组件ID (fieldId) |
|:---:|---------|---------|-----------------|
`;
  
  // 主表字段表格
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
  mdContent += `## 📝 备注\n\n`;
  mdContent += `1. 本清单从**宜搭平台**实时获取，记录了表单中所有组件的ID\n`;
  mdContent += `2. 组件ID (fieldId) 用于公式计算、联动规则、API调用等场景\n`;
  mdContent += `3. 子表组件ID显示在子表标题中，不在主表字段列表中重复显示\n`;
  mdContent += `4. 如表单结构有变更，请重新运行同步脚本\n\n`;
  mdContent += `---\n\n`;
  mdContent += `*最后更新时间: ${now}*\n`;
  
  return mdContent;
}

/**
 * 查找表单对应的目录
 * 优先在根目录查找，找不到再去分组目录查找
 * 支持多种匹配方式：精确匹配、包含匹配、模糊匹配
 */
function findFormDirectory(formName, baseDir) {
  console.log(`     🔍 查找表单目录: ${formName}`);
  console.log(`     📁 基础目录: ${baseDir}`);
  
  if (!fs.existsSync(baseDir)) {
    console.log(`     ⚠️ 基础目录不存在`);
    return null;
  }
  
  // 只在项目根目录查找，不查找任何分组目录
  const rootItems = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const item of rootItems) {
    if (!item.isDirectory()) continue;
    
    const dirName = item.name;
    
    // 跳过模块目录（以数字开头的目录）
    if (/^\d{2}/.test(dirName)) continue;
    
    // 精确匹配：目录名包含表单名
    if (dirName.includes(formName)) {
      const fullPath = path.join(baseDir, dirName);
      console.log(`     ✅ 找到目录: ${dirName}`);
      return fullPath;
    }
    
    // 模糊匹配：提取目录名中的中文部分进行匹配
    const chineseMatch = dirName.match(/[\u4e00-\u9fa5]+/g);
    if (chineseMatch) {
      const chineseName = chineseMatch.join('');
      if (chineseName.includes(formName) || formName.includes(chineseName)) {
        const fullPath = path.join(baseDir, dirName);
        console.log(`     ✅ 找到目录: ${dirName}`);
        return fullPath;
      }
    }
  }
  
  console.log(`     ⚠️ 未找到表单目录`);
  return null;
}

/**
 * 主同步函数
 * 支持双模式：
 * 1. 新项目模式：自动从平台获取应用信息和表单列表
 * 2. 已有项目模式：支持指定应用ID和表单UUID列表
 */
async function syncConfig(options = {}) {
  const {
    appId: providedAppId,
    outputDir = './',
    formDirs = null,
    formsFile = null,
    createdForms = null,  // 从create_from_markdown.js传递的已创建表单列表
    appName = null  // 从批量同步传入的应用名称
  } = options;

  console.log('='.repeat(60));
  console.log('  宜搭应用配置同步工具');
  console.log('='.repeat(60));

  // 1. 确定应用ID和路径
  let appId = providedAppId;
  const configPath = path.join(outputDir, '系统配置清单.md');
  const tempFormsFile = path.join(outputDir, '.temp_forms.json');

  // 尝试从部署运维信息文件解析应用ID
  if (!appId && formsFile) {
    console.log('\n📖 尝试从部署运维信息解析应用ID...');
    appId = parseAppIdFromDeployInfo(formsFile);
    if (appId) {
      console.log(`   ✅ 找到应用ID: ${appId}`);
    }
  }

  // 尝试从系统配置清单读取应用ID
  if (!appId) {
    console.log('\n📖 尝试从系统配置清单读取应用ID...');
    appId = parseAppIdFromConfig(configPath);

    if (appId) {
      console.log(`   ✅ 找到应用ID: ${appId}`);
    } else {
      throw new Error('未提供应用ID，且无法从系统配置清单或部署运维信息解析');
    }
  } else {
    console.log(`\n📱 应用ID: ${appId}`);
  }
  
  // 2. 获取登录态
  console.log('\n🔑 检查登录态...');
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.log('   ⚠️  未找到登录态，需要登录');
    cookieData = triggerLogin();
  }
  
  const authRef = {
    cookieData,
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
    corpId: resolveCorpId(cookieData)
  };
  
  console.log(`   ✅ 登录态就绪 (${authRef.baseUrl})`);
  
  // 3. 检查是否有本地数据源（临时文件、系统配置清单，或从创建脚本传递的表单列表）
  const hasTempFile = fs.existsSync(tempFormsFile);
  const hasExistingConfig = fs.existsSync(configPath) && parseFormsFromConfig(configPath);
  const hasCreatedForms = createdForms && Array.isArray(createdForms) && createdForms.length > 0;

  // 如果有本地数据源或传递了表单列表，跳过API验证（应用刚创建时API可能还未同步）
  if (hasCreatedForms || hasTempFile || hasExistingConfig) {
    console.log('\n📱 应用验证（使用本地数据源）...');
    console.log(`   本地应用ID: ${appId}`);
    if (hasCreatedForms) console.log('   ✅ 从创建脚本获取表单列表');
    if (hasTempFile) console.log('   ✅ 找到临时文件');
    if (hasExistingConfig) console.log('   ✅ 找到系统配置清单');
    console.log('   📝 跳过API验证，直接使用本地数据源');
  } else {
    // 没有本地数据源，需要验证应用ID
    console.log('\n📱 验证应用ID...');
    console.log(`   本地应用ID: ${appId}`);

    // 带重试机制的验证
    let verifyForms = [];
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      verifyForms = await fetchFormList(authRef, appId, outputDir);
      if (verifyForms.length > 0) {
        console.log(`   ✅ 应用验证成功，从平台获取到 ${verifyForms.length} 个表单`);
        break;
      }

      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`   ⏳ 验证失败，${retryCount}秒后重试 (${retryCount}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
      }
    }

    if (verifyForms.length === 0) {
      console.log('   ❌ 应用验证失败：无法从平台获取表单列表');
      console.log('   可能原因：');
      console.log('     1. 应用ID错误');
      console.log('     2. 应用已被删除');
      console.log('     3. 没有该应用的访问权限');
      console.log('     4. 应用刚创建，数据尚未同步（请稍后重试）');
      throw new Error(`应用ID ${appId} 验证失败，应用可能不存在或已被删除`);
    }
  }
  
  // 4. 获取应用信息
  const appInfo = await fetchAppInfo(authRef, appId, appName);
  console.log(`   应用名称: ${appInfo.appName}`);
  console.log(`   应用URL: ${appInfo.appUrl}`);
  
  // 5. 获取表单列表（优先级：createdForms参数 > formsFile > 临时文件 > 系统配置清单 > API调用）
  console.log('\n📋 获取表单列表...');
  let forms = [];

  // 优先使用从create_from_markdown.js传递的表单列表（最可靠，避免API查询）
  if (createdForms && Array.isArray(createdForms) && createdForms.length > 0) {
    console.log('   📁 使用从创建脚本传递的表单列表...');
    forms = createdForms.map((form, index) => ({
      index: index + 1,
      name: form.formName,
      type: form.formType === '流程表单' ? '流程' : '表单',
      formUuid: form.formUuid,
      processCode: form.processCode || null
    }));
    console.log(`   ✅ 使用传递的 ${forms.length} 个表单（跳过API查询）`);
  }

  // 强制更新模式：直接从API获取最新数据
  if (forms.length === 0 && options.forceUpdate) {
    console.log('   🔄 强制更新模式：使用API获取的最新表单列表');
    // 强制更新模式下，直接从API获取表单列表
    forms = await fetchFormList(authRef, appId, outputDir);
    if (forms.length > 0 && forms[0].formUuid && forms[0].formUuid !== 'undefined') {
      console.log(`   ✅ 从API获取到 ${forms.length} 个表单（最新数据）`);
    } else {
      console.log('   ❌ API返回的表单列表无效');
      forms = [];
    }
  }

  // 正常模式：如果还没有表单列表，按优先级尝试其他来源
  if (forms.length === 0) {
    // 首先尝试从部署运维信息文件读取（已有项目模式）
    if (formsFile && fs.existsSync(formsFile)) {
      console.log('   📁 从部署运维信息文件读取表单列表...');
      const deployForms = parseFormsFromDeployInfo(formsFile);
      if (deployForms && deployForms.length > 0) {
        forms = deployForms;
        console.log(`   ✅ 从部署运维信息读取到 ${forms.length} 个表单`);
      } else {
        console.log('   ⚠️ 部署运维信息中没有有效的表单列表');
      }
    }

    // 其次尝试从临时文件读取（由create_from_markdown.js生成）
    if (forms.length === 0 && fs.existsSync(tempFormsFile)) {
      console.log('   📁 从临时文件读取表单列表...');
      try {
        const tempData = fs.readFileSync(tempFormsFile, 'utf-8');
        const tempForms = JSON.parse(tempData);
        if (Array.isArray(tempForms) && tempForms.length > 0) {
          forms = tempForms.map((form, index) => ({
            index: index + 1,
            name: form.formName,
            type: form.formType === '流程表单' ? '流程' : '表单',
            formUuid: form.formUuid,
            processCode: form.processCode || null
          }));
          console.log(`   ✅ 从临时文件读取到 ${forms.length} 个表单`);
        }
      } catch (error) {
        console.log(`   ⚠️ 读取临时文件失败: ${error.message}`);
      }
    }

    // 再次尝试从系统配置清单读取
    if (forms.length === 0 && fs.existsSync(configPath)) {
      console.log('   📁 尝试从系统配置清单读取...');
      const cachedForms = parseFormsFromConfig(configPath);
      if (cachedForms && cachedForms.length > 0) {
        forms = cachedForms;
        console.log(`   ✅ 从系统配置清单读取到 ${forms.length} 个表单`);
      } else {
        console.log('   ⚠️ 系统配置清单中没有有效的表单列表');
      }
    }

    // 最后尝试调用API（失败时会自动回退到Playwright方式）
    if (forms.length === 0) {
      console.log('   📡 尝试从API获取表单列表...');
      forms = await fetchFormList(authRef, appId, outputDir);
      if (forms.length > 0 && forms[0].formUuid && forms[0].formUuid !== 'undefined') {
        console.log(`   ✅ 从API获取到 ${forms.length} 个表单`);
      } else {
        console.log('   ❌ API返回的表单列表无效');
        forms = [];
      }
    }
  }
  
  // 5. 补充获取流程Code（对于流程表单且没有processCode的）
  const hasProcessFormsWithoutCode = forms.some(f => f.type === '流程' && !f.processCode);
  if (hasProcessFormsWithoutCode) {
    console.log('\n🔍 检测到流程表单缺少流程Code，尝试通过Playwright补充获取...');
    try {
      const playwrightForms = await fetchFormListWithPlaywright(appId, outputDir);
      if (playwrightForms.length > 0) {
        // 用Playwright获取的数据补充流程Code
        const playwrightMap = new Map(playwrightForms.map(f => [f.formUuid, f.processCode]));
        let updatedCount = 0;
        for (const form of forms) {
          if (form.type === '流程' && !form.processCode) {
            const pc = playwrightMap.get(form.formUuid);
            if (pc) {
              form.processCode = pc;
              updatedCount++;
            }
          }
        }
        console.log(`   ✅ 已补充 ${updatedCount} 个流程表单的流程Code`);
      }
    } catch (error) {
      console.log(`   ⚠️ 补充流程Code失败: ${error.message}`);
    }
  }

  // 6. 读取现有配置（用于保留失败记录等信息）
  let existingConfig = null;
  if (fs.existsSync(configPath)) {
    existingConfig = fs.readFileSync(configPath, 'utf-8');
  }

  // 7. 生成系统配置清单（仅在表单列表有效时更新）
  console.log('\n📝 生成系统配置清单...');
  if (forms.length > 0 && forms[0].formUuid && forms[0].formUuid !== 'undefined') {
    // 表单列表有效，更新系统配置清单
    const systemConfig = generateSystemConfig(appInfo, forms, existingConfig);
    fs.writeFileSync(configPath, systemConfig, 'utf-8');
    console.log(`   ✅ 已保存: ${configPath}`);
  } else {
    // 表单列表无效，保留现有配置
    console.log(`   ⚠️ 表单列表无效，保留现有系统配置清单`);
    // 重新读取表单列表
    const cachedForms = parseFormsFromConfig(configPath);
    if (cachedForms && cachedForms.length > 0) {
      forms = cachedForms;
      console.log(`   ✅ 使用现有配置中的 ${forms.length} 个表单`);
    }
  }
  
  // 7. 获取每个表单的组件ID
  console.log('\n🔍 获取表单组件ID...\n');
  
  // 在获取组件ID之前，刷新登录态（解决时间差问题）
  const freshAuthRef = refreshLoginState() || authRef;
  
  let successCount = 0;
  let failCount = 0;
  
  // 【禁用分组】所有表单直接放在根目录
  let groups = [];
  
  // 按顺序同步所有表单
  for (const form of forms) {
    console.log(`📝 [${form.index}] ${form.name}`);
    
    try {
      // 获取表单Schema（使用新鲜的登录态）
      const schemaResult = await fetchFormSchema(freshAuthRef, appId, form.formUuid);
      
      // 提取组件信息
      const components = extractComponentsFromSchema(schemaResult);
      
      if (components.length === 0) {
        console.log(`   ⚠️ 警告: 未找到任何组件\n`);
        failCount++;
        continue;
      }
      
      // 确定表单目录 - 直接在根目录查找或创建
      let formDir;
      
      // 优先使用指定的目录映射
      formDir = formDirs?.[form.name];
      if (!formDir) {
        // 在根目录查找已有的表单文件夹
        formDir = findFormDirectory(form.name, outputDir);
      }
      
      // 如果还是找不到目录，直接在项目根目录下创建
      if (!formDir) {
        const typeStr = form.type && form.type.includes('流程') ? '流程表单' : '普通表单';
        const folderName = `${form.name}「${typeStr}」`;
        formDir = path.join(outputDir, folderName);
        
        // 创建表单目录
        if (!fs.existsSync(formDir)) {
          fs.mkdirSync(formDir, { recursive: true });
          console.log(`   📁 创建表单目录: ${folderName}`);
        }
      }
      
      // 获取schema数据
      let schema = schemaResult;
      if (schemaResult.content) {
        schema = typeof schemaResult.content === 'string' 
          ? JSON.parse(schemaResult.content) 
          : schemaResult.content;
      }
      
      // 生成标准格式的文件
      // 只生成组件ID清单和变更记录，JSON文件由sync_form_schemas.js生成
      
      // 1. 保存组件ID清单（标准格式）
      const mdContent = generateComponentMd(form.name, components);
      const mdPath = path.join(formDir, '组件ID清单.md');
      fs.writeFileSync(mdPath, mdContent, 'utf-8');
      console.log(`   📄 保存组件清单`);
      
      // 2. 保存变更记录（如果不存在）
      const changePath = path.join(formDir, '表单结构变更.md');
      if (!fs.existsSync(changePath)) {
        const changeMd = generateChangeMd(form.name, form.type);
        fs.writeFileSync(changePath, changeMd, 'utf-8');
        console.log(`   📄 保存变更记录`);
      }
      
      console.log(`   ✅ 成功: 获取 ${components.length} 个组件\n`);
      successCount++;
    } catch (error) {
      console.log(`   ❌ 失败: ${error.message}\n`);
      failCount++;
    }
  }
  
  // 8. 清理临时文件
  if (fs.existsSync(tempFormsFile)) {
    try {
      fs.unlinkSync(tempFormsFile);
      console.log('\n🧹 已清理临时文件');
    } catch (e) {
      // 忽略清理错误
    }
  }

  // 9. 输出统计
  console.log('='.repeat(60));
  console.log('📊 同步完成!');
  console.log(`   表单总数: ${forms.length}`);
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failCount}`);
  console.log('='.repeat(60));

  return {
    success: true,
    appId: appId,
    appName: appInfo.appName,
    forms: forms,
    outputDir: outputDir,
    stats: {
      total: forms.length,
      success: successCount,
      failed: failCount
    }
  };
}

// 命令行入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--appId' && args[i + 1]) {
      options.appId = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--formsFile' && args[i + 1]) {
      // 从部署运维信息文件读取表单列表
      options.formsFile = args[i + 1];
      i++;
    } else if (args[i] === '--update') {
      // 强制更新模式：忽略本地缓存，从API获取最新数据
      options.forceUpdate = true;
    } else if (args[i] === '--smart-group') {
      // 智能分组模式：强制使用AI智能分组（即使已有分组）
      options.smartGroup = true;
    } else if (args[i] === '--appName' && args[i + 1]) {
      // 应用名称（批量同步时传入）
      options.appName = args[i + 1];
      i++;
    }
  }

  // 如果没有提供应用ID但提供了formsFile，尝试从文件中解析
  if (!options.appId && options.formsFile) {
    const appIdFromFile = parseAppIdFromDeployInfo(options.formsFile);
    if (appIdFromFile) {
      console.log(`📋 从部署运维信息解析到应用ID: ${appIdFromFile}`);
      options.appId = appIdFromFile;
    }
  }

  // 如果没有提供应用ID，尝试从系统配置清单读取
  if (!options.appId && options.outputDir) {
    const configPath = path.join(options.outputDir, '系统配置清单.md');
    const appIdFromConfig = parseAppIdFromConfig(configPath);
    if (appIdFromConfig) {
      console.log(`📋 从系统配置清单读取到应用ID: ${appIdFromConfig}`);
      options.appId = appIdFromConfig;
    }
  }

  syncConfig(options).catch(error => {
    console.error(`\n❌ 同步失败: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  syncConfig,
  fetchAppInfo,
  fetchFormList,
  fetchFormSchema,
  extractComponentsFromSchema,
  generateSystemConfig,
  generateComponentMd,
  parseAppIdFromConfig,
  parseFormsFromConfig,
  parseAppIdFromDeployInfo,
  parseFormsFromDeployInfo
};
