/**
 * 宜搭表单静默创建器 - 从字段清单直接创建到宜搭平台
 * 版本: 2.20.0
 * 更新日期: 2026-07-28
 *
 * 更新内容:
 * - v2.20.0: 【根因修复】杜绝FORM-TEMP占位符残留导致线上"表单不存在"（进销存3事故）
 *           根因链：字段清单中"被填充的只读关联字段"说明列写"-"（无"关联-->目标表"标记）
 *           → parseFieldConfig 提取不到 associationForm 且无告警
 *           → createFormWithMapping 跳过 associationForm 赋值
 *           → schema_builder.js 静默兜底生成 FORM-TEMP-*（formTitle/appType全空）
 *           → updateAssociationFields 按空 formTitle 匹配不到 targetMeta 静默跳过
 *           → 全流程无自检，带病交付，线上点"新增"必报"表单不存在"。
 *           修复（多层防御）：
 *           1) 新增 validateAssociationTargets：建表前校验所有关联字段目标表可解析，
 *              缺失时按字段名推断（去"关联/选择"前缀与表单名互相包含匹配），
 *              推断成功打告警自动补全，失败则零成本中止（此时未创建任何资源）；
 *           2) updateAssociationFields 中 targetMeta 匹配不到时不再静默，计入 failureReport；
 *           3) 新增 scanAndFixPlaceholders 建表后兜底自检：逐表扫描 FORM-TEMP 残留，
 *              可按 formTitle 解析真实UUID的自动回填保存（新建表单允许saveFormSchema），
 *              无法修复的醒目告警并以非零退出码结束，绝不带病交付；
 *           4) schema_builder.js v1.4.0 兜底生成占位符时同步输出显式告警。
 * - v2.19.3: 【修复】字段状态（只读/隐藏）未传递到宜搭表单Schema
 *           根因：convertFormToConfig 仅保留 status 字段，createFormWithMapping 生成 apiField 时又未传递任何状态字段，
 *           导致 field_templates.js 中定义的 READONLY/HIDDEN 行为完全丢失，所有字段默认变为 NORMAL。
 *           修复：1) convertFormToConfig 同时生成 behavior 字段（READONLY/HIDDEN/NORMAL）；
 *                2) createFormWithMapping 将 behavior 写入 apiField 和子表 colField，确保 schema_builder.js 正确接收。
 * - v2.19.2: 【修复】deleteYidaForm 回滚函数使用 auth.baseUrl，但 ensureLogin 返回的登录态字段为 base_url，
 *           导致表单创建失败时回滚请求构造 URL 报错 "Invalid URL"，已创建表单无法自动删除。
 *           修复：在 deleteYidaForm 中兼容 baseUrl/base_url 两种字段名，确保回滚删除正常执行。
 * - v2.19.1: 【修复】parseFillingFromAssocDesc 解析"当前字段=源字段"时只保留当前字段名、丢弃源字段名，
 *           导致 buildDataFillingRules 用被填充字段名去目标表单猜源字段，当两者名称不一致
 *           （如"关联订单号=销售订单号"）时匹配失败，填充规则为空。
 *           修复：parseFillingFromAssocDesc 返回 {currentLabel, sourceLabel} 对象数组；
 *           extractFillingFieldMap 旧格式兼容也存储 {currentLabel, sourceLabel}；
 *           buildDataFillingRules 用 sourceLabel 在目标表单找源字段、用 currentLabel 在当前表单找被填充组件。
 * - v2.19.0: 【重构】填充规则从被填充字段移到关联表单字段说明列
 *           1. extractFillingFieldMap 新增 parseFillingFromAssocDesc，从关联字段说明解析"填充：当前字段=源字段"
 *           2. 保留旧格式兼容：仍支持从被填充字段的"填充-->XXX.XXX"或"关联带出"识别
 *           3. parseFieldType 中关联字段正则排除分号，避免"关联-->XXX；填充：..."错误提取目标表单
 * - v2.18.0: 【修复】createFormWithMapping 中 updateOrgAppInfo 在应用名称已存在但ID为占位符（如"待创建"）时，更新为真实应用ID，而不是直接跳过
 * - v2.17.1: 【修复】updateOrgAppInfo 函数在应用名称已存在但ID为占位符（如"待创建"）时，更新为真实应用ID，而不是直接跳过
 * - v2.17.0: 【根因修复】createNavGroups 失败时不再跳过，杜绝"表单在根目录"问题
 *            根因：createNavGroups 的 try-catch 在 createNavGroup 失败时跳过分组，
 *            继续创建表单（parentNavUuid=null），导致表单在根目录创建，
 *            出现"一份在分组里，一份不在分组里"的混乱状态。
 *            修复：移除 try-catch，让 createNavGroup 失败时抛错中止整个流程。
 *            配合 form_manager.js v1.14.0 的 getNavList 重试机制，
 *            检测失败时重试3次后抛错，不会"静默继续创建无分组的表单"。
 *
 * - v2.16.0: 【根因修复】分组信息传递链断裂 + 支持应用分组.md
 *            彻查"本地文件不分组、系统配置清单无分组列"的根因：
 *            1. createdForms.push 丢弃了 config.module 字段 → sync_config.js 收不到分组信息
 *            2. 用户无法在创建应用前确认分组 → 分组不合理时需手动到宜搭调整
 *            修复：
 *            1. 新增 parseGroupConfig 函数，读取同目录下的"应用分组.md"文件
 *            2. 主流程优先使用应用分组.md覆盖configs中的module字段（用户修改优先）
 *            3. createdForms.push 加上 module 字段，传递给 sync_config.js
 *            4. syncFormSchemas 中构建JSON路径时也使用 module 字段按分组组织
 *
 * - v2.15.1: 【适配】适配 form_manager.js v1.11.1 的重试机制
 *            moveFormToGroup 添加重试机制，解决表单刚创建还没有出现在导航列表中导致移动失败的问题
 *
 * - v2.15.0: 【根因修复】已存在表单也能正确移入分组
 *            适配 form_manager.js v1.11.0 的修复：
 *            1. createFormWithMapping 透传 existing 标志，主流程据此输出不同日志
 *            2. 修改主流程日志：从过时的"建议拖入分组"改为"已移入分组"
 *            3. 解决"重跑创建流程时，已存在的表单仍在分组外面"的问题
 *
 * - v2.14.0: 【适配】适配 form_manager.js v1.10.0 的表单移入分组功能
 *            form_manager.js 新增 moveFormToGroup 函数，createEmptyForm 在创建表单后
 *            自动调用 moveFormToGroup 将表单移入分组（通过 updateFormNavigationOrderNew API）。
 *            本脚本无需修改核心逻辑，parentNavUuid 参数现在能正确生效（由 form_manager 处理）。
 *
 * - v2.13.0: 【根因修复】导航分组功能彻底修复
 *           1. createNavGroups 存储 navUuid（NAV-前缀）而不是 formUuid
 *           2. 主流程恢复 parentNavUuid 传参，传入正确的NAV-前缀分组UUID
 *           3. createFormWithMapping 恢复 parentNavArg 命令行传参
 *
 * - v2.12.0: 【新增】导航分组功能
 *           1. 创建表单前先按模块创建导航分组（div）
 *           2. 各表单自动放入对应模块的分组中
 *           3. createFormWithMapping 支持 parentNavUuid 参数
 *           4. 新增 createNavGroups 函数
 *           5. 流程从8步扩展为9步，新增[2/9]创建导航分组
 *
 * 历史版本:
 * - v2.11.0: 【统一命名】extractFillingFieldMap 识别"填充"格式
 *           1. 字段清单中"关联带出"统一改为"填充-->源表单.源字段"格式
 *           2. extractFillingFieldMap 通过 isFillingField 辅助函数识别填充字段
 *           3. 兼容新旧两种格式：新"填充"格式 + 旧"关联带出"格式（向后兼容）
 * - v2.10.0: 【修复】子表关联字段数据填充失效 + 主表关联带出字段匹配不全
 *           1. updateAssociationComponents 递归处理子表时，原代码将子表 children 作为 components 传给 buildDataFillingRules，
 *              导致 findTableFieldId 找不到 TableField，子表内关联字段的数据填充规则无法生成。
 *              修复：改为传递 topLevelComponents（顶层组件树），确保子表内关联字段也能正确生成 tableRules。
 *           2. findTargetFieldByLabel 前缀列表缺少"客户"、"供应商"、"仓库"、"产品"、"订单"等前缀，
 *              导致"客户联系人"无法匹配目标表单的"联系人"等字段。
 *              修复：扩展前缀列表，并新增模糊匹配（当前字段名包含目标字段名时命中）。
 *           3. 添加 module.exports 导出关键函数，支持修复脚本复用。
 * - v2.9.0: 【新增】关联表单字段自动配置显示设置和数据填充规则
 *          1. updateAssociationFields 自动设置 mainFieldId（主要信息）和 subFieldId（次要信息）
 *          2. 自动识别"关联带出"字段并生成 dataFillingRules 数据填充规则
 *          3. 支持目标字段智能匹配（精确匹配+去掉业务前缀模糊匹配）
 * - v2.8.0: 【新增】数据标题支持多字段组合+类型提示
 *          1. parseMarkdown 解析数据标题行时兼容括号内的类型提示文字
 *          2. 数据标题支持任意符号分隔的多字段组合（+、--、-、| 等均可），如"采购订单号--供应商"
 *          3. setCustomTitleByFieldName 使用 Unicode 正则提取字段名，自动识别分隔符
 * - v2.7.1: 【修复】数据标题设置失败时的二次回退 + 与excel-to-form数据标题推断规则对齐
 *          1. setDataTitles 增加二次回退：指定字段设置失败时自动回退到自动选择模式
 *          2. 与 excel-to-form v1.9.0 联动：普通表单优先选名称字段，流程表单优先选流水号
 * - v2.7.0: 【新增】创建表单后自动设置数据标题
 *          1. 新增 setDataTitles 函数，在创建表单后自动设置数据标题
 *          2. 流程表单（有流水号字段）→ 使用流水号字段作为数据标题
 *          3. 普通表单（无流水号字段）→ 自动选择名称类字段作为数据标题
 *          4. 步骤从7步扩展为8步，新增[4/8]设置数据标题
 * - v2.6.1: 【关键修复】应用名称默认使用本地项目文件夹名，不再优先使用字段清单标题中的系统名称，避免本地文件夹名与宜搭应用名不一致
 * - v2.6.0: 【恢复】恢复原型页面自动生成功能，创建表单后自动调用 form-to-prototype 生成HTML原型页面
 * - v2.4.0: 【关键修复】流水号配置传递断裂 + 组织信息表正则匹配失败
 *          1. createYidaForm函数：新增SerialNumberField case，将serialPrefix传递给apiField.prefix
 *          2. updateOrgInfo正则：添加\n## 作为有效表格结束标记
 * - v2.3.3: 【重要修复】修复原型页面生成目录错误和组织及应用信息.md格式混乱问题
 *          1. 修复原型页面输出目录：改为 {项目目录}/01需求梳理/原型页面/（之前错误地生成到01需求梳理根目录）
 *          2. 移除 create_from_markdown.js 中的 updateOrgInfoWithPrototype 调用
 *          3. 统一由 prototype_generator.js 处理组织及应用信息.md的更新，避免重复更新导致表格格式混乱
 * - v2.3.2: 【重要修复】修复创建应用后原型页面生成失败的问题
 *          1. 修复 generatePrototype 调用时传递相对路径导致文件找不到的问题
 *          2. 改为传递绝对路径 fullPath，避免在切换 cwd 后相对路径失效
 *          3. 错误示例：文件不存在 D:\...\.agents\skills\form-to-prototype\scripts\进销存管理\01需求梳理\字段清单.md
 * - v2.3.1: 【重要修复】修复更新组织及应用信息.md时表格格式损坏的问题
 *          1. 修复 beforeTable 缺少换行符导致分隔行与数据行粘连的问题
 *          2. 添加 beforeTable.endsWith('\n') 检查，确保分隔行和数据行之间有换行
 *          3. 避免生成 |------|----------|----------------|| 1 |... 这样的损坏格式
 * - v2.3.0: 【新增功能】创建新应用后自动生成原型页面
 *          1. 新增 generatePrototype 函数，自动调用 form-to-prototype skill
 *          2. 在应用创建完成后自动生成原型页面，方便用户预览表单界面
 *          3. 原型页面生成位置：{项目目录}/01需求梳理/原型页面/
 *          4. 自动更新组织及应用信息.md，追加原型页面访问地址
 * - v2.2.3: 【重要修复】创建流程表单时传递processCode到同步脚本
 *          1. 从form_manager.js获取processCode并写入createdForms
 *          2. 临时文件.temp_forms.json中包含processCode字段
 *          3. 确保新建应用时流程Code能正确写入系统配置清单
 * - v2.2.2: 【结构优化】适配简化后的组织及应用信息.md表格结构
 *          1. 应用列表表格从5列简化为3列（移除应用类型、备注列）
 *          2. 简化代码逻辑，专注于核心3列表格结构
 *          3. 保持动态列数检测能力，确保向后兼容
 * - v2.2.1: 【增强】增强组织及应用信息更新逻辑的健壮性
 *          1. 支持自动检测表格列数，动态适配多列表格结构
 *          2. 使用更安全的表格替换方式，精确定位表格数据区域
 *          3. 新增默认值填充机制（应用类型、备注等列）
 * - v2.2.0: 【重要修复】修复组织及应用信息更新失败和JSON文件未生成的问题
 *          1. 修复正则表达式匹配，支持"应用 ID"（带空格）格式
 *          2. 新增 syncFormSchemas 函数，自动调用 get-schema 生成JSON文件
 *          3. 确保创建完成后所有本地文件完整（组件ID清单、变更记录、JSON文件）
 * - v2.1.0: 【重要修复】修复新应用创建后同步失败的问题
 *          1. 创建完成后将表单信息写入 .temp_forms.json 临时文件
 *          2. 调用 config-sync 时传递 createdForms 参数
 *          3. 同步脚本优先使用已知的表单UUID，跳过API查询表单列表
 *          4. 解决新应用API返回404导致同步失败的问题
 * - v2.0.0: 【重要重构】简化创建流程，彻底解决表单重复创建问题
 *          1. 不再提前创建本地文件（JSON、组件ID清单、变更记录）
 *          2. 只负责在宜搭平台创建应用和表单
 *          3. 创建完成后调用 config-sync 整体同步（当作已有应用处理）
 *          4. 本地所有文件由 config-sync 统一生成，确保数据一致性
 *          5. 避免了之前版本因"先创建本地文件再同步"导致的重复变更记录
 *
 * 历史更新:
 * - v1.9.2: 修复表单重复创建问题（已被v2.0.0彻底解决）
 * - v1.9.0: 重构表单创建流程（已被v2.0.0替代）
 *
 * 功能: 读取Markdown字段清单，解析后调用宜搭API直接创建应用和表单
 * 用法: node create_from_markdown.js <markdown文件路径> [应用名称]
 * 示例: node create_from_markdown.js "../../../进销存管理/01需求梳理/字段清单.md" "进销存管理"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 动态导入 api_client 模块（避免循环依赖）
let apiClient = null;
function getApiClient() {
  if (!apiClient) {
    try {
      apiClient = require(path.join(API_CLIENT_DIR, 'api_client'));
    } catch (e) {
      console.error('无法加载 api_client 模块:', e.message);
    }
  }
  return apiClient;
}

// Windows 平台设置 UTF-8 代码页，解决中文乱码
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误，继续执行
  }
}

// ==================== 配置 ====================

const SCRIPT_DIR = __dirname;
const API_CLIENT_DIR = path.join(SCRIPT_DIR, '..', '..', 'api-client', 'scripts');
const LOGIN_SCRIPT = path.join(API_CLIENT_DIR, 'login_manager.js');
const APP_MANAGER = path.join(API_CLIENT_DIR, 'app_manager.js');
const FORM_MANAGER = path.join(API_CLIENT_DIR, 'form_manager.js');

const CONFIG_SYNC_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'config-sync', 'scripts', 'sync_config.js');

// 原型页面生成器脚本路径
const PROTOTYPE_GENERATOR_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'form-to-prototype', 'scripts', 'prototype_generator.js');

// ==================== 删除表单 ====================

/**
 * 删除宜搭表单
 * @param {Object} authRef - 登录态引用
 * @param {string} appType - 应用ID
 * @param {string} formUuid - 表单UUID
 * @returns {Promise<boolean>}
 */
async function deleteYidaForm(authRef, appType, formUuid) {
  console.log(`  🗑️  删除表单: ${formUuid}...`);

  const { postRequest, requestWithAutoLogin } = getApiClient();

  // 兼容 ensureLogin 返回的 base_url / csrf_token（snake_case）字段
  // 与 api_client 期望的 baseUrl / csrfToken（camelCase）字段。
  // 【根因修复】此前只补了 baseUrl，未补 csrfToken，导致回滚删除时
  // 闭包读取 auth.csrfToken 得到 undefined，_csrf_token 未发送，
  // 服务端返回 "csrf校验失败"，已创建表单无法自动删除、残留在平台。
  const normalizedAuthRef = {
    ...authRef,
    baseUrl: authRef.baseUrl || authRef.base_url,
    csrfToken: authRef.csrfToken || authRef.csrf_token
  };

  const result = await requestWithAutoLogin((auth) => {
    return postRequest(
      auth.baseUrl,
      `/dingtalk/web/${appType}/query/app/form/delete.json`,
      {
        _csrf_token: auth.csrfToken,
        formUuid: formUuid
      },
      auth.cookies
    );
  }, normalizedAuthRef);

  if (!result?.success) {
    throw new Error(result?.errorMsg || '删除表单失败');
  }

  console.log(`  ✅ 表单已删除: ${formUuid}`);
  return true;
}

// ==================== 工具函数 ====================

/**
 * 执行命令并获取结果
 * @param {string} command - 命令
 * @returns {Object} 解析后的JSON结果
 */
function execCommand(command) {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    });
    
    // 首先尝试从整个输出中提取JSON（处理多行JSON）
    const trimmedOutput = stdout.trim();
    
    // 查找最后一个完整的JSON对象（从后往前找配对的{}）
    let braceCount = 0;
    let jsonStart = -1;
    
    for (let i = trimmedOutput.length - 1; i >= 0; i--) {
      const char = trimmedOutput[i];
      if (char === '}') {
        braceCount++;
        if (jsonStart === -1) jsonStart = i;
      } else if (char === '{') {
        braceCount--;
        if (braceCount === 0) {
          // 找到了完整的JSON对象
          const jsonStr = trimmedOutput.substring(i, jsonStart + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            // 继续查找
          }
        }
      }
    }
    
    // 回退到原来的单行检查方式
    const lines = trimmedOutput.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          return JSON.parse(line);
        } catch (e) {
          continue;
        }
      }
    }
    return null;
  } catch (error) {
    // 尝试从错误输出中解析错误信息
    const stderr = error.stderr ? error.stderr.toString() : '';
    const stdout = error.stdout ? error.stdout.toString() : '';
    
    // 尝试从输出中提取JSON（即使命令返回非零退出码）
    const output = (stdout || stderr).trim();
    
    // 使用同样的方法查找JSON对象
    let braceCount = 0;
    let jsonStart = -1;
    
    for (let i = output.length - 1; i >= 0; i--) {
      const char = output[i];
      if (char === '}') {
        braceCount++;
        if (jsonStart === -1) jsonStart = i;
      } else if (char === '{') {
        braceCount--;
        if (braceCount === 0) {
          const jsonStr = output.substring(i, jsonStart + 1);
          try {
            const result = JSON.parse(jsonStr);
            if (result.error || result.errorMsg) {
              throw new Error(result.error || result.errorMsg);
            }
            return result;
          } catch (e) {
            if (e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }
    }
    
    console.error(`命令执行失败: ${error.message}`);
    if (stderr) console.error(`错误输出: ${stderr}`);
    throw new Error(stderr || error.message);
  }
}

/**
 * 确保已登录
 * @returns {Object} 登录态信息
 */
function ensureLogin() {
  console.log('\n🔐 检查登录态...');
  
  // 先尝试无头验证
  try {
    const result = execCommand(`node "${LOGIN_SCRIPT}"`);
    if (result && result.csrf_token) {
      console.log(`  ✅ 登录态有效 (${result.base_url})`);
      return result;
    }
  } catch (e) {
    console.log('  ⚠️  需要重新登录');
  }
  
  // 需要扫码登录
  console.log('\n🔐 请扫码登录宜搭平台...');
  const result = execCommand(`node "${LOGIN_SCRIPT}"`);
  if (!result || !result.csrf_token) {
    throw new Error('登录失败');
  }
  console.log(`  ✅ 登录成功 (${result.base_url})`);
  return result;
}

/**
 * 创建应用
 * @param {string} appName - 应用名称
 * @param {string} description - 应用描述
 * @returns {Object} 应用信息
 */
function createApp(appName, description) {
  console.log(`\n📦 创建应用: ${appName}`);
  
  const result = execCommand(
    `node "${APP_MANAGER}" "${appName}" "${description || appName}"`
  );
  
  if (!result || !result.success) {
    throw new Error(result?.error || result?.errorMsg || '创建应用失败');
  }
  
  if (result.existing) {
    console.log(`  ⚠️  应用已存在，复用已有应用: ${result.appType}`);
  } else {
    console.log(`  ✅ 应用创建成功: ${result.appType}`);
  }
  console.log(`  📎 访问地址: ${result.url}`);
  
  return result;
}

// ==================== Markdown解析（复用generate_from_markdown.js的逻辑）=====================

/**
 * 解析字段类型
 */
function parseFieldType(typeStr, description) {
  const type = typeStr.trim();
  const desc = (description || '').trim();
  
  const typeMap = {
    '单行文本': 'TextField',
    '多行文本': 'TextareaField',
    '数值': 'NumberField',
    '日期': 'DateField',
    '日期时间': 'DateField',
    '单选': 'RadioField',
    '复选': 'CheckboxField',
    '下拉单选': 'SelectField',
    '下拉多选': 'MultiSelectField',
    '下拉复选': 'MultiSelectField',
    '关联表单': 'AssociationFormField',
    '成员': 'EmployeeField',
    '部门': 'DepartmentSelectField',
    '附件': 'AttachmentField',
    '图片': 'ImageField',
    '地址': 'AddressField',
    '流水号': 'SerialNumberField'
  };
  
  const baseType = typeMap[type] || 'TextField';
  const config = { type: baseType };
  
  if (type === '数值') {
    const decimalMatch = desc.match(/(\d+)位小数/);
    if (decimalMatch) config.precision = parseInt(decimalMatch[1], 10);
    const unitMatch = desc.match(/单位：(.+)/);
    if (unitMatch) config.unit = unitMatch[1].trim();
  }
  
  if (type === '日期时间') {
    config.showTime = true;
  }
  
  if (type === '关联表单') {
    // 正则排除逗号和分号，确保"关联-->产品信息；填充：..."只提取"产品信息"
    const assocMatch = desc.match(/关联-->([^，,；;]+)/);
    if (assocMatch) config.associationForm = assocMatch[1].trim();
    // v2.20.0: 提取不到目标表时此处不静默放过——config.associationForm 为空，
    // 由建表前的 validateAssociationTargets 统一推断/拦截（那里能拿到字段label和表单名）
  }
  
  if (type === '单选' || type === '复选' || type === '下拉单选' || type === '下拉多选' || type === '下拉复选') {
    if (desc && desc !== '-' && !desc.includes('关联') && !desc.includes('公式')) {
      config.options = desc.split(/[\/、]/).map(opt => opt.trim()).filter(opt => opt);
    }
  }

  // 解析流水号前缀（支持"前缀:CP"或"前缀：CP"格式）
  if (type === '流水号') {
    const prefixMatch = desc.match(/前缀[：:](\w+)/);
    if (prefixMatch) {
      config.serialPrefix = prefixMatch[1].trim();
    }
  }

  return config;
}

/**
 * 解析Markdown内容
 */
function parseMarkdown(content) {
  const lines = content.split('\n');
  
  let systemName = '';
  let currentModule = '';
  let currentForm = null;
  let inTable = false;
  let isSubTable = false;
  let subTableName = '';
  
  const forms = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 解析系统名称
    if (line.startsWith('# ') && !systemName) {
      systemName = line.replace('# ', '').replace(/ - .+$/, '').trim();
      continue;
    }
    
    // 匹配模块标题
    const moduleMatch = line.match(/^## [一二三四五六七八九十]+、(.+)$/);
    if (moduleMatch) {
      currentModule = moduleMatch[1];
      continue;
    }
    
    // 匹配表单标题
    const formMatch = line.match(/### \(\S+\)\s*(.+?)「(.+?)」/);
    if (formMatch) {
      if (currentForm) forms.push(currentForm);
      currentForm = {
        module: currentModule,
        name: formMatch[1].trim(),
        type: formMatch[2].trim(),
        fields: [],
        subTables: [],
        dataTitle: null  // 数据标题字段名
      };
      isSubTable = false;
      continue;
    }
    
    // 匹配数据标题行（兼容括号内的类型提示和多字段任意符号分隔）
    const dataTitleMatch = line.match(/\*\*数据标题[：:]\s*(.+?)\*\*/);
    if (dataTitleMatch && currentForm) {
      let titleField = dataTitleMatch[1].trim();
      // 去除括号内的类型提示，如 "产品名称（仅支持：..." → "产品名称"
      const parenIdx = titleField.indexOf('（');
      if (parenIdx > 0) {
        titleField = titleField.substring(0, parenIdx).trim();
      }
      if (titleField && titleField !== '（需手动指定）') {
        // 提取所有字段名（连续的字母数字中文下划线字符），其余符号自动作为分隔符
        // 例如 "采购订单号--供应商" → ["采购订单号", "供应商"]
        const fieldNames = titleField.match(/[\p{L}\p{N}_]+/gu);
        if (fieldNames && fieldNames.length > 0) {
          // 统一用+连接，由 setCustomTitleByFieldName 统一提取字段名
          currentForm.dataTitle = fieldNames.join('+');
        }
      }
      continue;
    }
    
    // 检测子表标记
    const subTableHeaderMatch = line.match(/\*\*子表[：:](.+?)\*\*/);
    if (subTableHeaderMatch && currentForm) {
      isSubTable = true;
      subTableName = subTableHeaderMatch[1].trim();
      currentForm.subTables.push({ name: subTableName, fields: [] });
      continue;
    }
    
    // 检测表格开始
    if (line.includes('| 字段名称') && line.includes('| 字段类型')) {
      inTable = true;
      continue;
    }
    
    // 跳过表格分隔行
    if (line.includes('---') && line.includes('|')) continue;
    
    // 解析表格数据行
    if (inTable && line.startsWith('|') && currentForm) {
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell);
      
      if (cells.length >= 5) {
        const [fieldName, fieldType, description, fieldStatus, required] = cells;
        
        const fieldConfig = {
          label: fieldName.trim(),
          ...parseFieldType(fieldType, description),
          status: fieldStatus.trim() === '只读' ? 'readonly' : 
                  fieldStatus.trim() === '隐藏' ? 'hidden' : 'editable',
          required: required.trim() === '是',
          description: description.trim()
        };
        
        if (isSubTable && currentForm.subTables.length > 0) {
          currentForm.subTables[currentForm.subTables.length - 1].fields.push(fieldConfig);
        } else {
          currentForm.fields.push(fieldConfig);
        }
      }
      continue;
    }
    
    // 空行表示表格结束
    if (inTable && line === '') inTable = false;
  }
  
  if (currentForm) forms.push(currentForm);
  
  return { name: systemName, forms };
}

/**
 * 根据表单名称生成流水号前缀（拼音首字母大写）
 */
function generateSerialPrefix(formName) {
  const prefixMap = {
    '产品信息': 'CP',
    '仓库信息': 'CK',
    '库存盘点': 'KCPD',
    '库存调拨': 'KCDB',
    '客户信息': 'KH',
    '客户跟进': 'KHGJ',
    '供应商信息': 'GYS',
    '采购订单': 'CGDD',
    '采购入库': 'CGRK',
    '销售订单': 'XSDD',
    '销售出库': 'XSCK',
    '销售退货': 'XSTH',
    '收款登记': 'SKDJ',
    '开票登记': 'KPDJ',
    '付款登记': 'FKDJ',
    '收票登记': 'SPDJ'
  };
  return prefixMap[formName] || 'SN';
}

/**
 * 解析应用分组.md文件
 * v2.16.0新增：读取同目录下的应用分组.md，返回 { formName: moduleName } 映射
 * 目的：让用户在创建应用前确认/修改分组结构，创建时按用户修改后的版本分组
 * @param {string} groupFilePath - 应用分组.md文件路径
 * @returns {Object|null} { formName: moduleName } 映射，文件不存在时返回null
 */
/**
 * 解析应用分组配置
 * v2.18.0: 新增 stripModuleNumberPrefix 函数，去除分组名称中的中文序号前缀（如"一、基础信息" → "基础信息"）
 * 避免分组名称带编号导致目录名和路径不一致
 */
function stripModuleNumberPrefix(moduleName) {
  return moduleName.replace(/^[一二三四五六七八九十]+[、.．]\s*/, '');
}

function parseGroupConfig(groupFilePath) {
  if (!fs.existsSync(groupFilePath)) {
    console.log(`  ℹ️ 未找到应用分组文件: ${path.basename(groupFilePath)}，使用字段清单中的模块分组`);
    return null;
  }

  console.log(`  📂 读取应用分组文件: ${path.basename(groupFilePath)}`);
  const content = fs.readFileSync(groupFilePath, 'utf-8');

  const formToModule = {};
  // 匹配表格行：| 序号 | 分组名称 | 包含表单 |
  // 包含表单列可能是"表单A, 表单B, 表单C"格式
  const tableRowRegex = /^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;
  const lines = content.split('\n');

  for (const line of lines) {
    // 跳过表头和分隔线
    if (line.includes('序号') || line.includes('---')) continue;

    const match = line.match(tableRowRegex);
    if (match) {
      // v2.18.0: 去掉分组名称中的中文序号前缀（如"一、基础信息" → "基础信息"）
      const moduleName = stripModuleNumberPrefix(match[1].trim());
      const formsCell = match[2].trim();
      // 按逗号分隔表单名
      const formNames = formsCell.split(/[,，]/).map(s => s.trim()).filter(s => s);
      for (const formName of formNames) {
        formToModule[formName] = moduleName;
      }
    }
  }

  const groupCount = new Set(Object.values(formToModule)).size;
  const formCount = Object.keys(formToModule).length;
  console.log(`  ✅ 解析到 ${groupCount} 个分组，共 ${formCount} 个表单`);

  return Object.keys(formToModule).length > 0 ? formToModule : null;
}

/**
 * 转换表单配置
 */
function convertFormToConfig(form) {
  // 根据表单名称生成流水号前缀
  const serialPrefix = generateSerialPrefix(form.name);

  const fields = form.fields.map(field => ({
    label: field.label,
    type: field.type,
    required: field.required,
    status: field.status,
    behavior: field.status === 'readonly' ? 'READONLY' : field.status === 'hidden' ? 'HIDDEN' : 'NORMAL',
    precision: field.precision,
    unit: field.unit,
    associationForm: field.associationForm,
    options: field.options,
    description: field.description,
    serialPrefix: field.serialPrefix || (field.type === 'SerialNumberField' ? serialPrefix : undefined)
  }));

  // 处理子表
  if (form.subTables && form.subTables.length > 0) {
    for (const subTable of form.subTables) {
      fields.push({
        type: 'TableField',
        label: subTable.name,
        columns: subTable.fields.map(col => ({
          label: col.label,
          type: col.type,
          required: col.required,
          status: col.status,
          behavior: col.status === 'readonly' ? 'READONLY' : col.status === 'hidden' ? 'HIDDEN' : 'NORMAL',
          precision: col.precision,
          unit: col.unit,
          associationForm: col.associationForm,
          options: col.options,
          description: col.description
        }))
      });
    }
  }
  
  return {
    formName: form.name,
    formType: form.type,
    module: form.module,
    fields,
    dataTitle: form.dataTitle || null
  };
}

// ==================== 主流程 ====================

/**
 * 获取表单所有关联的目标表单名称
 * @param {Array} fields - 字段数组
 * @returns {Array} 目标表单名称数组
 */
function getAssociationTargets(fields) {
  const targets = [];
  for (const field of fields) {
    if (field.type === 'AssociationFormField' && field.associationForm) {
      targets.push(field.associationForm);
    }
    if (field.type === 'TableField' && field.columns) {
      for (const col of field.columns) {
        if (col.type === 'AssociationFormField' && col.associationForm) {
          targets.push(col.associationForm);
        }
      }
    }
  }
  return [...new Set(targets)]; // 去重
}

/**
 * 对表单进行拓扑排序（按依赖关系排序）
 * @param {Array} configs - 表单配置数组
 * @returns {Array} 排序后的表单配置数组
 */
function topologicalSort(configs) {
  // 构建表单名称到配置的映射
  const formMap = new Map();
  configs.forEach(config => formMap.set(config.formName, config));
  
  // 构建依赖图
  const dependencies = new Map(); // 表单名称 -> 依赖的表单名称数组
  const dependents = new Map(); // 表单名称 -> 依赖它的表单名称数组
  
  configs.forEach(config => {
    const targets = getAssociationTargets(config.fields);
    dependencies.set(config.formName, targets);
    
    // 初始化dependents
    if (!dependents.has(config.formName)) {
      dependents.set(config.formName, []);
    }
    
    // 记录哪些表单依赖当前表单
    targets.forEach(target => {
      if (formMap.has(target)) {
        if (!dependents.has(target)) {
          dependents.set(target, []);
        }
        dependents.get(target).push(config.formName);
      }
    });
  });
  
  // 拓扑排序
  const sorted = [];
  const visited = new Set();
  const tempMarked = new Set();
  
  function visit(formName) {
    if (tempMarked.has(formName)) {
      // 检测到循环依赖，跳过
      return;
    }
    if (visited.has(formName)) {
      return;
    }
    
    tempMarked.add(formName);
    
    const deps = dependencies.get(formName) || [];
    for (const dep of deps) {
      if (formMap.has(dep)) {
        visit(dep);
      }
    }
    
    tempMarked.delete(formName);
    visited.add(formName);
    sorted.push(formMap.get(formName));
  }
  
  // 遍历所有表单
  for (const config of configs) {
    if (!visited.has(config.formName)) {
      visit(config.formName);
    }
  }
  
  return sorted;
}

/**
 * 建表前校验关联表单字段的目标表可解析性（v2.20.0新增）
 *
 * 根因背景（进销存3事故）：字段清单中"被填充的只读关联字段"说明列写"-"、
 * 缺少"关联-->目标表"标记 → 解析层拿不到目标表名 → schema_builder 静默兜底
 * 生成 FORM-TEMP 占位符 → 线上点"新增"报"表单不存在"。
 *
 * 防御策略：
 *   1. 目标表名缺失时，先按字段名推断（去掉"关联/选择"前缀后与表单名互相包含匹配）
 *   2. 推断成功且唯一 → 自动补全并打印告警（要求用户回头修正字段清单）
 *   3. 推断失败或有歧义 → 汇总所有问题字段，中止建表（此时尚未创建任何资源，零成本失败）
 *   4. 目标表名有值但不在本次创建列表 → 同样中止（否则必然产生占位符）
 *
 * 注意：必须在 topologicalSort 之前调用，推断补全的 associationForm 才能参与依赖排序。
 * @param {Array} configs - 表单配置数组（convertFormToConfig 输出，会被原地补全）
 */
function validateAssociationTargets(configs) {
  const formNames = configs.map(c => c.formName);
  const errors = [];
  const inferred = [];

  // 按字段名推断目标表：去掉"关联/选择"前缀，与表单名互相包含匹配，唯一命中才采纳
  function inferTargetForm(label) {
    const core = (label || '').replace(/^(关联|选择)/, '').trim();
    if (!core) return null;
    const matches = formNames.filter(name => name.includes(core) || core.includes(name));
    return matches.length === 1 ? matches[0] : null;
  }

  function checkField(formName, field, scope) {
    if (field.type !== 'AssociationFormField') return;
    if (!field.associationForm) {
      const guess = inferTargetForm(field.label);
      if (guess) {
        field.associationForm = guess;
        inferred.push({ formName, label: field.label, scope, target: guess });
      } else {
        errors.push({ formName, label: field.label, scope, reason: '说明列缺少"关联-->目标表"标记，且无法按字段名唯一推断目标表' });
      }
    } else if (!formNames.includes(field.associationForm)) {
      errors.push({ formName, label: field.label, scope, reason: `目标表"${field.associationForm}"不在本次创建的表单列表中` });
    }
  }

  for (const config of configs) {
    for (const field of config.fields) {
      checkField(config.formName, field, '主表');
      if (field.type === 'TableField' && field.columns) {
        for (const col of field.columns) {
          checkField(config.formName, col, `子表[${field.label}]`);
        }
      }
    }
  }

  if (inferred.length > 0) {
    console.log('\n  ⚠️ 以下关联字段说明列缺少"关联-->目标表"标记，已按字段名自动推断（请回头补全字段清单）：');
    for (const it of inferred) {
      console.log(`    - ${it.formName}.${it.label}（${it.scope}）→ 推断目标表: ${it.target}`);
      console.log(`      请在字段清单该字段说明列补上: 关联-->${it.target}`);
    }
  }

  if (errors.length > 0) {
    console.error('\n' + '='.repeat(60));
    console.error(`❌ 建表前校验失败：${errors.length} 个关联表单字段无法确定目标表`);
    console.error('='.repeat(60));
    for (const e of errors) {
      console.error(`  - ${e.formName}.${e.label}（${e.scope}）: ${e.reason}`);
    }
    console.error('='.repeat(60));
    console.error('💡 修复方法：在字段清单中为上述字段的"说明"列填写 关联-->目标表名');
    console.error('   （即使是"被其他关联字段填充的只读关联字段"也必须标注目标表，');
    console.error('   否则会生成 FORM-TEMP 占位符，线上点"新增"必报"表单不存在"）');
    console.error('   本次未创建任何应用/表单，修正字段清单后重新运行即可。');
    process.exit(1);
  }
}

/**
 * 创建表单（支持关联表单UUID映射）
 * @param {string} appType - 应用ID
 * @param {string} formTitle - 表单标题
 * @param {Array} fields - 字段定义数组
 * @param {Object} formUuidMap - 表单名称到UUID的映射
 * @param {string} formType - 表单类型: receipt(普通表单) 或 process(流程表单)
 * @param {string} parentNavUuid - 父级导航分组UUID（可选，将表单放入指定分组）
 * @returns {Object} 表单信息
 */
function createFormWithMapping(appType, formTitle, fields, formUuidMap, formType = 'receipt', parentNavUuid = null) {
  console.log(`\n📝 创建表单: ${formTitle}`);
  console.log(`  原始字段数量: ${fields.length}`);
  
  // 转换字段定义为宜搭API格式
  // 注意：关联表单字段如果找不到对应的formUuid，会暂时转换为单行文本字段
  const apiFields = [];
  let skippedAssocFields = 0;
  
  for (const field of fields) {
    const apiField = {
      type: field.type,
      label: field.label,
      required: field.required || false,
      behavior: field.behavior || 'NORMAL'
    };
    
    // 根据字段类型添加额外配置
    if (field.type === 'NumberField') {
      if (field.precision !== undefined) apiField.precision = field.precision;
      if (field.unit) apiField.innerAfter = field.unit;
    }

    if (field.type === 'SerialNumberField') {
      if (field.serialPrefix) apiField.prefix = field.serialPrefix;
    }

    if (field.type === 'SelectField' || field.type === 'MultiSelectField' || field.type === 'CheckboxField' || field.type === 'RadioField') {
      if (field.options && field.options.length > 0) {
        apiField.options = field.options;
      }
    }
    
    if (field.type === 'AssociationFormField' && field.associationForm) {
      const targetFormUuid = formUuidMap[field.associationForm];
      if (targetFormUuid) {
        apiField.associationForm = {
          formUuid: targetFormUuid,
          formTitle: field.associationForm,
          appType: appType,
          mainFieldId: '',
          mainComponentName: 'TextField'
        };
      } else {
        // 使用临时UUID创建关联表单字段（后续在宜搭平台手动修改关联）
        const placeholderUuid = `FORM-TEMP-${Date.now().toString(36).toUpperCase()}`;
        console.log(`    ⚠️  关联表单字段 "${field.label}" 目标表单 "${field.associationForm}" 尚未创建，使用临时UUID`);
        apiField.associationForm = {
          formUuid: placeholderUuid,
          formTitle: field.associationForm,
          appType: appType,
          mainFieldId: '',
          mainComponentName: 'TextField'
        };
        skippedAssocFields++;
      }
    }
    
    if (field.type === 'TableField' && field.columns) {
      apiField.children = [];
      for (const col of field.columns) {
        const colField = {
          type: col.type,
          label: col.label,
          required: col.required || false,
          behavior: col.behavior || 'NORMAL'
        };
        
        if (col.precision !== undefined) colField.precision = col.precision;
        if (col.unit) colField.innerAfter = col.unit;
        if (col.options && col.options.length > 0) colField.options = col.options;
        
        if (col.type === 'AssociationFormField' && col.associationForm) {
          const targetFormUuid = formUuidMap[col.associationForm];
          if (targetFormUuid) {
            colField.associationForm = {
              formUuid: targetFormUuid,
              formTitle: col.associationForm,
              appType: appType,
              mainFieldId: '',
              mainComponentName: 'TextField'
            };
          } else {
            // 使用临时UUID创建关联表单字段（后续在宜搭平台手动修改关联）
            const placeholderUuid = `FORM-TEMP-${Date.now().toString(36).toUpperCase()}`;
            console.log(`    ⚠️  子表关联字段 "${col.label}" 目标表单 "${col.associationForm}" 尚未创建，使用临时UUID`);
            colField.associationForm = {
              formUuid: placeholderUuid,
              formTitle: col.associationForm,
              appType: appType,
              mainFieldId: '',
              mainComponentName: 'TextField'
            };
            skippedAssocFields++;
          }
        }
        
        apiField.children.push(colField);
      }
    }
    
    apiFields.push(apiField);
  }
  
  if (skippedAssocFields > 0) {
    console.log(`  注意: ${skippedAssocFields} 个关联表单字段使用了占位符UUID（后续需在宜搭平台手动修改关联关系）`);
  }
  console.log(`  实际创建字段数量: ${apiFields.length}`);
  console.log(`  表单类型: ${formType === 'process' ? '流程表单' : '普通表单'}`);
  if (parentNavUuid) {
    console.log(`  目标分组: ${parentNavUuid}`);
  }
  
  // 保存临时字段定义文件
  const tempFieldsFile = path.join(SCRIPT_DIR, '.temp_fields.json');
  fs.writeFileSync(tempFieldsFile, JSON.stringify(apiFields, null, 2), 'utf-8');
  
  try {
    // v2.13.0: 恢复 parentNavUuid 传参，现在传入的是正确的NAV-前缀分组UUID
    const parentNavArg = parentNavUuid ? ` "${parentNavUuid}"` : '';
    const result = execCommand(
      `node "${FORM_MANAGER}" "${appType}" "${formTitle}" "${tempFieldsFile}" "${formType}"${parentNavArg}`
    );
    
    if (!result || !result.success) {
      throw new Error(result?.error || '创建表单失败');
    }

    // v2.15.0: 透传 existing 标志，主流程据此输出不同日志
    if (result.existing) {
      console.log(`  ✅ 表单已存在，已移入分组: ${result.formUuid}`);
    } else {
      console.log(`  ✅ 表单创建成功: ${result.formUuid}`);
    }
    console.log(`  📎 访问地址: ${result.url}`);

    return result;
  } finally {
    // 清理临时文件
    if (fs.existsSync(tempFieldsFile)) {
      fs.unlinkSync(tempFieldsFile);
    }
  }
}

async function main() {
  const markdownPath = process.argv[2];
  const appName = process.argv[3];
  
  if (!markdownPath) {
    console.log('用法: node create_from_markdown.js <markdown文件路径> [应用名称（不推荐，会自动使用项目文件夹名）]');
    console.log('示例:');
    console.log('  node create_from_markdown.js "../../../进销存管理/01需求梳理/字段清单.md"');
    process.exit(1);
  }
  
  console.log('\n============================================================');
  console.log('宜搭表单静默创建器');
  console.log('版本: 2.20.0');
  console.log('============================================================');

  // 1. 读取并解析Markdown
  console.log('\n[1/10] 读取字段清单...');
  const fullPath = path.resolve(markdownPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`错误: 文件不存在 ${fullPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  const systemInfo = parseMarkdown(content);
  
  // 先计算 outputDir（从字段清单路径向上两级）
  const outputDir = path.dirname(path.dirname(fullPath));
  
  // 应用名称优先级：1. 用户显式传入 2. 本地项目文件夹名 3. 字段清单标题 4. 默认名
  const projectNameFromDir = path.basename(outputDir);
  const appNameToUse = appName || projectNameFromDir || systemInfo.name || '未命名应用';
  
  console.log(`  ✓ 系统名称: ${systemInfo.name || '-'}`);
  console.log(`  ✓ 应用名称: ${appNameToUse}`);
  console.log(`  ✓ 表单数量: ${systemInfo.forms.length} 个`);
  systemInfo.forms.forEach(form => {
    const subCount = form.subTables ? form.subTables.length : 0;
    console.log(`    - ${form.name}「${form.type}」(${form.fields.length}主表字段${subCount > 0 ? `, ${subCount}子表` : ''})`);
  });

  // 2. 转换表单配置并排序
  let configs = systemInfo.forms.map(convertFormToConfig);
  // v2.20.0: 建表前校验关联目标（含缺失推断），必须在拓扑排序前执行，
  // 推断补全的 associationForm 才能参与依赖排序；校验失败零成本中止
  validateAssociationTargets(configs);
  configs = topologicalSort(configs);

  // v2.16.0新增：读取应用分组.md，优先使用用户确认/修改后的分组（覆盖字段清单中的模块）
  const groupFilePath = path.join(path.dirname(fullPath), '应用分组.md');
  const formToModule = parseGroupConfig(groupFilePath);
  if (formToModule) {
    console.log(`\n  📝 使用应用分组.md覆盖模块分组:`);
    let overrideCount = 0;
    for (const config of configs) {
      const newModule = formToModule[config.formName];
      if (newModule && newModule !== config.module) {
        console.log(`    ${config.formName}: ${config.module || '(无)'} → ${newModule}`);
        config.module = newModule;
        overrideCount++;
      } else if (newModule) {
        // 一致，无需覆盖
      } else {
        console.log(`    ⚠️ ${config.formName} 在应用分组.md中未找到，保留原分组: ${config.module || '(无)'}`);
      }
    }
    if (overrideCount > 0) {
      console.log(`  ✅ 已覆盖 ${overrideCount} 个表单的分组`);
    }
  }

  console.log(`\n  按依赖关系排序后的创建顺序:`);
  configs.forEach((config, index) => {
    const targets = getAssociationTargets(config.fields);
    const deps = targets.length > 0 ? ` (依赖: ${targets.join(', ')})` : '';
    const groupInfo = config.module ? ` [分组: ${config.module}]` : ' [未分组]';
    console.log(`    ${index + 1}. ${config.formName}${groupInfo}${deps}`);
  });

  // 3. 确保登录
  const loginInfo = ensureLogin();
  
  // 4. 创建应用
  const appInfo = createApp(appNameToUse, `${appNameToUse} - 自动创建`);
  
  // 5. 创建导航分组
  console.log('\n[2/10] 创建导航分组...');
  const moduleGroupMap = await createNavGroups(appInfo.appType, configs, loginInfo);
  
  // 6. 创建表单（按依赖关系排序，放入对应分组）
  console.log('\n[3/10] 创建宜搭表单...');
  
  const createdForms = [];
  const formUuidMap = {};
  let hasError = false;
  
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    // v2.13.0: 恢复表单放入分组功能，现在用正确的NAV-前缀UUID
    const parentNavUuid = config.module ? (moduleGroupMap[config.module] || null) : null;
    console.log(`\n  📌 创建进度: ${i + 1}/${configs.length} — ${config.formName}${config.module ? ` → ${config.module}` : ''}`);
    try {
      const apiFormType = config.formType === '流程表单' ? 'process' : 'receipt';
      const formInfo = createFormWithMapping(appInfo.appType, config.formName, config.fields, formUuidMap, apiFormType, parentNavUuid);
      createdForms.push({
        formName: config.formName,
        formType: config.formType,
        formUuid: formInfo.formUuid,
        processCode: formInfo.processCode || null,
        url: formInfo.url,
        module: config.module || null  // v2.16.0: 保留分组信息，传递给sync_config.js用于本地目录分组
      });
      formUuidMap[config.formName] = formInfo.formUuid;
      // v2.15.0: 根据是否已存在输出不同日志，已自动移入分组（不再需要手动拖动）
      if (formInfo.existing) {
        console.log(`  ✅ [${i + 1}/${configs.length}] ${config.formName} 已存在，已移入分组${config.module ? ` (${config.module})` : ''}`);
      } else {
        console.log(`  ✅ [${i + 1}/${configs.length}] ${config.formName} 创建成功，已移入分组${config.module ? ` (${config.module})` : ''}`);
      }
    } catch (error) {
      console.error(`  ❌ [${i + 1}/${configs.length}] 创建表单失败: ${config.formName} - ${error.message}`);
      hasError = true;
      break;
    }
  }

  if (hasError && createdForms.length > 0) {
    console.log(`\n  ⚠️  创建过程中出错，正在回滚已创建的 ${createdForms.length} 个表单...`);
    // 【加固】回滚前重新加载最新登录态：
    // 各表单由子进程创建，期间可能已刷新 .cookies.json 中的 csrf_token；
    // 而父进程内存中的 loginInfo 是流程开始时捕获的，可能已过期，
    // 直接用它回滚会再次遇到 "csrf校验失败"。优先用本地最新登录态。
    let rollbackAuth = loginInfo;
    try {
      const api = getApiClient();
      const fresh = api && api.loadCookieData && api.loadCookieData();
      if (fresh && (fresh.csrf_token || fresh.csrfToken)) {
        rollbackAuth = fresh;
      }
    } catch (reloadError) {
      console.error(`  ⚠️  重新加载登录态失败，使用初始登录态回滚: ${reloadError.message}`);
    }
    for (const form of createdForms) {
      try {
        await deleteYidaForm(rollbackAuth, appInfo.appType, form.formUuid);
        console.log(`  🗑️  已回滚: ${form.formName}`);
      } catch (rollbackError) {
        console.error(`  ❌ 回滚失败: ${form.formName} - ${rollbackError.message}`);
        console.error(`     请手动删除表单: ${form.formName} (UUID: ${form.formUuid})`);
      }
    }
    console.log('\n  ❌ 表单创建失败，已回滚所有已创建的表单。请检查错误后重试。');
    process.exit(1);
  }

  if (hasError && createdForms.length === 0) {
    console.log('\n  ❌ 第一个表单创建即失败，无需回滚。请检查错误后重试。');
    process.exit(1);
  }
  
  // 7. 更新关联字段的mainFieldId
  if (createdForms.length > 0) {
    console.log('\n[4/10] 更新关联字段配置...');
    await updateAssociationFields(appInfo.appType, createdForms, formUuidMap, loginInfo, configs);
  }
  
  // v2.20.0: 建表后兜底自检——扫描FORM-TEMP占位符残留，能修复的自动回填，不能修复的醒目告警
  if (createdForms.length > 0) {
    console.log('\n[5/10] 建表后自检：扫描FORM-TEMP占位符残留...');
    await scanAndFixPlaceholders(appInfo.appType, createdForms, formUuidMap, loginInfo);
  }
  
  // 8. 设置数据标题
  if (createdForms.length > 0) {
    console.log('\n[6/10] 设置数据标题...');
    await setDataTitles(appInfo.appType, createdForms, configs, loginInfo);
  }

  // 9. 写入临时文件，记录创建的表单UUID（供同步脚本使用）
  console.log('\n[7/10] 保存表单信息到临时文件...');
  const tempFormsFile = path.join(outputDir, '.temp_forms.json');
  try {
    fs.writeFileSync(tempFormsFile, JSON.stringify(createdForms, null, 2), 'utf-8');
    console.log(`  ✅ 已保存: ${tempFormsFile}`);
    console.log(`  📋 共 ${createdForms.length} 个表单`);
  } catch (error) {
    console.log(`  ⚠️  保存临时文件失败: ${error.message}`);
  }

  // 10. 更新组织及应用信息
  console.log('\n[8/10] 更新组织及应用信息...');
  updateOrgAppInfo(appInfo);

  // 11. 调用 config-sync 整体同步（当作已有应用处理）
  console.log('\n[9/10] 同步应用到本地（当作已有应用处理）...');
  await syncAsExistingApp(outputDir, appInfo.appType, createdForms, appNameToUse);

  // 12. 生成原型页面
  console.log('\n[10/10] 生成原型页面...');
  await generatePrototype(fullPath, outputDir, appInfo);

  // 生成结果报告
  console.log('\n============================================================');
  console.log('[创建完成]');
  console.log('============================================================');
  console.log(`\n应用信息:`);
  console.log(`  应用名称: ${appInfo.appName}`);
  console.log(`  应用ID: ${appInfo.appType}`);
  console.log(`  访问地址: ${appInfo.url}`);
  console.log(`\n表单列表 (${createdForms.length}/${configs.length}):`);
  createdForms.forEach((form, index) => {
    console.log(`  ${index + 1}. ${form.formName}「${form.formType}」`);
    console.log(`     UUID: ${form.formUuid}`);
    console.log(`     地址: ${form.url}`);
  });

  if (createdForms.length < configs.length) {
    console.log(`\n⚠️  警告: ${configs.length - createdForms.length} 个表单创建失败`);
    const failedForms = configs
      .filter(config => !createdForms.find(f => f.formName === config.formName))
      .map(config => config.formName);
    console.log(`  失败的表单: ${failedForms.join(', ')}`);
  }

  console.log('\n📋 完成事项:');
  console.log('  ✅ 宜搭应用和表单已创建');
  console.log('  ✅ 数据标题已自动设置');
  console.log('  ✅ 组织及应用信息已更新');
  console.log('  ✅ 应用配置已同步到本地（系统配置清单、组件ID清单等）');
  console.log('  ✅ 原型页面已生成');
  console.log('\n💡 提示:');
  console.log('  现在可以直接使用这些表单编写公式和代码提示词');
  console.log('  所有文件由 config-sync 统一生成，确保数据一致性');
  console.log('  原型页面可通过 HTTP 服务访问，预览表单界面');

  console.log('\n============================================================\n');
}

/**
 * 创建导航分组
 * 根据表单配置中的 module 字段，创建对应的导航分组（div）
 * 返回 module → groupUuid 的映射
 * @param {string} appType - 应用ID
 * @param {Array} configs - 表单配置数组
 * @param {Object} loginInfo - 登录信息
 * @returns {Object} moduleGroupMap: { moduleName: groupUuid }
 */
async function createNavGroups(appType, configs, loginInfo) {
  const { createNavGroup } = require(FORM_MANAGER);
  const authRef = {
    csrfToken: loginInfo.csrf_token,
    cookies: loginInfo.cookies,
    baseUrl: loginInfo.base_url
  };

  // 按出现顺序收集唯一模块名
  const modules = [];
  const seen = new Set();
  for (const config of configs) {
    if (config.module && !seen.has(config.module)) {
      modules.push(config.module);
      seen.add(config.module);
    }
  }

  if (modules.length === 0) {
    console.log('  ℹ️ 未检测到模块分组，跳过导航分组创建');
    return {};
  }

  console.log(`  📁 检测到 ${modules.length} 个模块分组: ${modules.join(', ')}`);

  const moduleGroupMap = {};
  for (const moduleName of modules) {
    // v2.17.0: createNavGroup 失败时抛错中止整个流程（之前是跳过分组继续创建表单）
    // 之前的逻辑：catch 块跳过失败分组，表单创建时 parentNavUuid=null，表单在根目录创建
    // 这导致"一份在分组里，一份不在分组里"的混乱状态
    // 修复：createNavGroup 失败时抛错，让上层感知，不会"静默继续创建无分组的表单"
    const groupInfo = await createNavGroup(authRef, appType, moduleName);
    moduleGroupMap[moduleName] = groupInfo.navUuid;
    if (groupInfo.existing) {
      console.log(`  ✅ 导航分组 "${moduleName}" 已存在，复用: ${groupInfo.navUuid}`);
    } else {
      console.log(`  ✅ 导航分组 "${moduleName}" 创建成功: ${groupInfo.navUuid}`);
    }
  }

  const successCount = Object.keys(moduleGroupMap).length;
  console.log(`  📊 导航分组创建: 成功 ${successCount}/${modules.length}`);

  return moduleGroupMap;
}

/**
 * 批量设置数据标题
 * 为每个已创建的表单自动设置数据标题：
 * - 优先使用字段清单中指定的数据标题字段（支持多字段+号组合，如"采购订单号+供应商"）
 * - 若未指定，则流程表单（有流水号字段）使用流水号字段
 * - 若无流水号，则自动选择名称类字段
 * - 指定字段设置失败时，回退到自动选择
 * @param {string} appType - 应用ID
 * @param {Array} createdForms - 已创建的表单列表
 * @param {Array} configs - 表单配置列表（含字段信息和数据标题）
 * @param {Object} loginInfo - 登录信息
 */
async function setDataTitles(appType, createdForms, configs, loginInfo) {
  const { setCustomTitleByFieldName } = require(FORM_MANAGER);
  const authRef = {
    csrfToken: loginInfo.csrf_token,
    cookies: loginInfo.cookies,
    baseUrl: loginInfo.base_url
  };

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < createdForms.length; i++) {
    const form = createdForms[i];
    const config = configs.find(c => c.formName === form.formName);

    // 优先使用字段清单中指定的数据标题，其次查找流水号字段
    let titleField = null;
    if (config) {
      if (config.dataTitle) {
        // 字段清单中明确指定了数据标题
        titleField = config.dataTitle;
      } else if (config.fields) {
        // 未指定时，查找流水号字段
        const serialField = config.fields.find(f => f.type === 'SerialNumberField');
        if (serialField) {
          titleField = serialField.label;
        }
      }
    }

    try {
      const result = await setCustomTitleByFieldName(authRef, appType, form.formUuid, titleField);
      if (result && result.success) {
        const fieldDesc = titleField || '(自动选择)';
        console.log(`  ✅ ${form.formName} → ${fieldDesc}`);
        successCount++;
      } else if (titleField) {
        // 指定字段设置失败，尝试回退到自动选择
        console.error(`  ⚠️ ${form.formName} 指定字段"${titleField}"设置失败，回退到自动选择`);
        try {
          const fallbackResult = await setCustomTitleByFieldName(authRef, appType, form.formUuid, null);
          if (fallbackResult && fallbackResult.success) {
            console.log(`  ✅ ${form.formName} → (自动选择，回退成功)`);
            successCount++;
          } else {
            console.error(`  ❌ ${form.formName} 自动选择也失败: ${fallbackResult?.errorMsg || '未知错误'}`);
            failCount++;
          }
        } catch (fallbackError) {
          console.error(`  ❌ ${form.formName} 回退异常: ${fallbackError.message}`);
          failCount++;
        }
      } else {
        console.error(`  ❌ ${form.formName} 设置失败: ${result?.errorMsg || '未知错误'}`);
        failCount++;
      }
    } catch (error) {
      console.error(`  ❌ ${form.formName} 异常: ${error.message}`);
      failCount++;
    }
  }

  console.log(`  📊 数据标题设置: 成功 ${successCount}/${createdForms.length}, 失败 ${failCount}`);
}

/**
 * 调用 config-sync 将应用当作已有应用同步回来
 * 创建完成后，应用就是"已有应用"，使用同步已有应用的逻辑
 * @param {string} outputDir - 项目输出目录
 * @param {string} appId - 应用ID
 * @param {Array} createdForms - 已创建的表单列表（包含formName, formType, formUuid）
 */
async function syncAsExistingApp(outputDir, appId, createdForms, appName) {
  console.log(`  🔄 调用 config-sync 同步应用: ${appId}`);
  console.log(`  📁 输出目录: ${outputDir}`);
  console.log(`  📝 应用名称: ${appName || path.basename(outputDir)}`);

  try {
    const { syncConfig } = require(CONFIG_SYNC_SCRIPT);
    await syncConfig({
      appId: appId,
      outputDir: outputDir,
      createdForms: createdForms,  // 传递已创建的表单列表，避免API查询
      appName: appName || path.basename(outputDir)  // 传递应用名称，避免同步时写入"未知应用"
    });
    console.log('  ✅ 应用同步完成');
    
    // 同步完成后，调用 get-schema 生成JSON文件
    await syncFormSchemas(outputDir, appId, createdForms);
    
  } catch (error) {
    console.log(`  ⚠️  同步失败: ${error.message}`);
    console.log('  💡 请稍后手动执行同步命令:');
    console.log(`     node .agents/skills/config-sync/scripts/sync_config.js --appId ${appId} --output "${outputDir}"`);
  }
}

/**
 * 调用 get-schema 同步所有表单的JSON文件
 * @param {string} outputDir - 项目输出目录
 * @param {string} appId - 应用ID
 * @param {Array} createdForms - 已创建的表单列表
 */
async function syncFormSchemas(outputDir, appId, createdForms) {
  console.log(`\n  🔄 同步表单JSON文件...`);
  
  try {
    const GET_SCHEMA_SCRIPT = path.join(SCRIPT_DIR, '..', '..', 'get-schema', 'scripts', 'sync-schema.js');
    
    // 构建同步配置文件
    const syncConfig = {
      appType: appId,
      forms: createdForms.map(form => {
        // v2.16.0: 按分组组织JSON文件路径，与sync_config.js的目录结构保持一致
        // v2.19.0: 分组目录加「分组」后缀，与表单目录结构对齐
        const formDirName = `${form.formName}「${form.formType}」`;
        const groupSubdir = form.module ? `${form.module}「分组」` : '';
        const formDir = groupSubdir
          ? path.join(outputDir, groupSubdir, formDirName)
          : path.join(outputDir, formDirName);
        const jsonPath = path.join(formDir, `${formDirName}.json`);

        return {
          formUuid: form.formUuid,
          localPath: jsonPath
        };
      })
    };
    
    // 保存临时配置文件
    const configPath = path.join(outputDir, '.temp_sync_forms.json');
    fs.writeFileSync(configPath, JSON.stringify(syncConfig, null, 2), 'utf-8');
    
    // 调用 sync-schema.js 进行批量同步
    const { execSync } = require('child_process');
    const command = `node "${GET_SCHEMA_SCRIPT}" --config "${configPath}"`;
    
    console.log(`     正在同步 ${createdForms.length} 个表单的JSON文件...`);
    
    execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300_000,
      cwd: path.dirname(GET_SCHEMA_SCRIPT)
    });
    
    // 删除临时配置文件
    try {
      fs.unlinkSync(configPath);
    } catch (e) {
      // 忽略删除错误
    }
    
    console.log('  ✅ 表单JSON文件同步完成');
  } catch (error) {
    console.log(`  ⚠️  JSON文件同步失败: ${error.message}`);
    console.log('  💡 请稍后手动执行同步命令:');
    console.log(`     node .agents/skills/get-schema/scripts/sync-schema.js --config "${outputDir}/sync-forms-config.json"`);
  }
}

/**
 * 更新组织及应用信息.md文件
 * 将新创建的应用添加到应用列表的最前面（序号为1）
 * @param {Object} appInfo - 应用信息
 */
function updateOrgAppInfo(appInfo) {
  try {
    // 查找组织及应用信息.md文件（从当前目录向上查找）
    let orgInfoPath = null;
    let currentDir = SCRIPT_DIR;
    
    // 向上查找5层目录（从 .agents/skills/form_creator/scripts 到项目根目录）
    for (let i = 0; i < 6; i++) {
      const possiblePath = path.join(currentDir, '组织及应用信息.md');
      if (fs.existsSync(possiblePath)) {
        orgInfoPath = possiblePath;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    
    // 如果没找到，尝试从环境变量或默认路径获取
    if (!orgInfoPath) {
      const defaultPath = path.join(process.cwd(), '组织及应用信息.md');
      if (fs.existsSync(defaultPath)) {
        orgInfoPath = defaultPath;
      }
    }
    
    // 最后尝试项目根目录（基于常见结构）
    if (!orgInfoPath) {
      const rootPath = path.join(SCRIPT_DIR, '..', '..', '..', '..', '组织及应用信息.md');
      if (fs.existsSync(rootPath)) {
        orgInfoPath = rootPath;
      }
    }
    
    if (!orgInfoPath) {
      console.log(`  ⚠️  未找到组织及应用信息.md文件，跳过更新`);
      return;
    }
    
    console.log(`\n📝 更新组织及应用信息: ${orgInfoPath}`);
    
    let content = fs.readFileSync(orgInfoPath, 'utf-8');
    
    // 更新最后更新时间
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    content = content.replace(/\| 最后更新时间 \| [^|]+ \| 自动更新 \|/, `| 最后更新时间 | ${timeStr} | 自动更新 |`);
    
    // 检查应用是否已存在（按应用ID检查，转义特殊字符）
    const escapedAppId = appInfo.appType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const appIdPattern = new RegExp(`\\| [^|]+ \\| [^|]+ \\| ${escapedAppId} \\|`);
    if (appIdPattern.test(content)) {
      console.log(`  ✓ 应用 "${appInfo.appName}" 已存在于列表中`);
      return;
    }
    
    // 解析现有的应用列表（支持多种表格格式）
    // 匹配包含"序号"、"应用名称"、"应用 ID"或"应用ID"的表格
    // 结束标志支持：---、***、## 标题、文件末尾
    const tableRegex = /(\| 序号[^|]* \| 应用名称[^|]* \| 应用\s*ID[^|]*\|[\s\S]*?)(\n---|\n\*\*\*|\n## )/;
    const match = content.match(tableRegex);
    
    if (!match) {
      console.log(`  ⚠️  未找到应用列表表格，跳过更新`);
      return;
    }
    
    // 提取表头（支持应用ID中间有空格的情况，支持多列）
    // 注意：分隔线可能是 | -- | 或 |------| 格式
    // 分隔线后面应该紧跟换行，而不是数据
    const headerMatch = content.match(/\| 序号[^|]* \| 应用名称[^|]* \| 应用\s*ID[^|]*\|?[^\n]*\n\|[-:\s|]+\|?(?=\n)/);
    if (!headerMatch) {
      console.log(`  ⚠️  应用列表表格格式不正确，跳过更新`);
      return;
    }
    
    const header = headerMatch[0];
    
    // 提取表头列数，确定表格有几列
    // 只取第一行（表头行），排除分隔线
    const headerLine = header.split('\n')[0];
    const headerColumns = headerLine.split('|').filter(col => col.trim()).length;
    
    // 提取所有现有应用行（支持多列表格，动态匹配列数）
    // 支持两种格式：
    // 1. | 1 | 名称 | ID | （标准格式，行尾有|）
    // 2. | 1 | 名称 | ID    （简化格式，行尾无|）
    const rows = [];
    
    // 查找表格区域（从表头后到下一个 ## 或 *** 或 --- 之前）
    const tableStartIdx = content.indexOf(headerMatch[0]) + headerMatch[0].length;
    let tableEndIdx = content.length;
    const endMarkers = ['\n## ', '\n***', '\n---'];
    for (const marker of endMarkers) {
      const idx = content.indexOf(marker, tableStartIdx);
      if (idx !== -1 && idx < tableEndIdx) {
        tableEndIdx = idx;
      }
    }
    const tableContent = content.substring(tableStartIdx, tableEndIdx);
    
    // 按行分割并解析每一行
    const lines = tableContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      // 匹配表格行：| 序号 | 名称 | ID | 或 | 序号 | 名称 | ID
      // 排除分隔线行（包含 -- 或 :: 的行，以及只有 | 和 - : 空格 的行）
      if (trimmedLine.startsWith('|') && 
          !trimmedLine.match(/^\|[-:\s|]*\|?$/) && // 排除分隔线行
          !trimmedLine.match(/^\|\s*--/) && // 排除以 | -- 开头的行
          trimmedLine.length > 5) { // 确保行有足够内容
        const parts = trimmedLine.split('|').map(p => p.trim()).filter(p => p);
        if (parts.length >= 3) {
          const seq = parseInt(parts[0]);
          const name = parts[1];
          const appId = parts[2];
          if (!isNaN(seq) && name && appId) {
            rows.push({ seq, name, appId });
          }
        }
      }
    }
    
    // 检查是否已存在（按ID）
    const existingById = rows.find(r => r.appId === appInfo.appType);
    if (existingById) {
      console.log(`  ✓ 应用 "${appInfo.appName}" 已存在于列表中`);
      return;
    }

    // 按名称查找，如果存在但ID为占位符（如"待创建"），则更新为真实ID
    const existingByName = rows.find(r => r.name === appInfo.appName);
    if (existingByName) {
      const placeholderPattern = /^(待创建|待填写|未填写|\{APP_ID\}|APP_XXX|FORM-XXX|APP-[A-Z0-9_]+XXX)$/i;
      if (placeholderPattern.test(existingByName.appId) || existingByName.appId !== appInfo.appType) {
        // 只更新该行的应用ID，保持其他内容不变
        const oldRowPattern = new RegExp(
          `(\\| ${existingByName.seq} \\| ${existingByName.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| )${existingByName.appId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\|?)`,
          'g'
        );
        const newContent = content.replace(oldRowPattern, `$1${appInfo.appType}$2`);
        if (newContent !== content) {
          fs.writeFileSync(orgInfoPath, newContent, 'utf-8');
          console.log(`  ✅ 已更新应用ID: ${appInfo.appName} (${appInfo.appType})`);
        } else {
          console.log(`  ⚠️  应用名称已存在但ID替换失败: ${appInfo.appName}`);
        }
        return;
      }
      console.log(`  ✓ 应用 "${appInfo.appName}" 已存在于列表中`);
      return;
    }

    // 将新应用插入到最前面（序号为1）
    const newRow = { seq: 1, name: appInfo.appName, appId: appInfo.appType };
    
    // 其他应用序号顺延
    const updatedRows = [newRow, ...rows.map(r => ({ ...r, seq: r.seq + 1 }))];
    
    // 重新构建表格内容（保持原有列数，用空值填充额外列）
    // 检测原表格行尾是否有 |
    const hasTrailingPipe = rows.length > 0 && content.includes(`| ${rows[0].seq} | ${rows[0].name} | ${rows[0].appId} |`);
    
    const newTableRows = updatedRows.map(r => {
      // 基础3列：序号、名称、ID
      let rowStr = `| ${r.seq} | ${r.name} | ${r.appId}`;
      // 如果原表格行尾有 |，则添加
      if (hasTrailingPipe) {
        rowStr += ' |';
      }
      // 如果原表格有更多列，用空值或默认值填充
      for (let i = 3; i < headerColumns; i++) {
        if (i === 3) rowStr += hasTrailingPipe ? ' 普通应用 |' : ' | 普通应用';
        else if (i === 4) rowStr += hasTrailingPipe ? ' - |' : ' | -';
        else rowStr += hasTrailingPipe ? ' |' : ' |';
      }
      // 再次确保行尾有 |
      if (hasTrailingPipe && !rowStr.endsWith(' |')) {
        rowStr += ' |';
      }
      return rowStr;
    }).join('\n');
    
    // 使用更安全的方式替换表格内容
    // 直接替换表格区域内的所有内容
    const beforeTable = content.substring(0, tableStartIdx);
    const afterTable = content.substring(tableEndIdx);
    // 确保 beforeTable 以换行符结尾，避免分隔行和数据行粘连
    const beforeTableWithNewline = beforeTable.endsWith('\n') ? beforeTable : beforeTable + '\n';
    content = beforeTableWithNewline + newTableRows + '\n' + afterTable;
    
    // 保存文件
    fs.writeFileSync(orgInfoPath, content, 'utf-8');
    console.log(`  ✅ 已添加应用到列表第1位: ${appInfo.appName} (${appInfo.appType})`);
    
  } catch (error) {
    console.log(`  ⚠️  更新组织及应用信息失败: ${error.message}`);
    // 不抛出错误，因为这是辅助功能，不应影响主流程
  }
}

// ==================== 关联表单字段增强配置（v2.9.0新增）=====================

/**
 * 从Schema中提取表单组件树
 * @param {Object} schema - 表单Schema
 * @returns {Array|null} 组件数组
 */
function extractComponentsFromSchema(schema) {
  if (!schema) return null;
  if (schema.pages && schema.pages[0] && schema.pages[0].componentsTree) {
    const pageRoot = schema.pages[0].componentsTree[0];
    if (pageRoot && pageRoot.children) {
      const rootContent = pageRoot.children.find(c => c.componentName === 'RootContent');
      if (rootContent && rootContent.children) {
        const formContainer = rootContent.children.find(c => c.componentName === 'FormContainer');
        if (formContainer && formContainer.children) {
          return formContainer.children;
        }
      }
    }
  }
  if (schema.components) return schema.components;
  return null;
}

/**
 * 从组件树中提取字段映射表
 * @param {Array} components - 组件数组
 * @returns {Map<string, Object>} 字段标签到字段信息的映射
 */
function getFieldMap(components) {
  const map = new Map();
  if (!components) return map;
  
  function collect(comps) {
    for (const comp of comps) {
      const fieldId = comp.props?.fieldId;
      const label = comp.props?.label?.zh_CN || comp.props?.label || '';
      const componentName = comp.componentName;
      if (fieldId && label) {
        map.set(label, { fieldId, componentName, label });
        // 同时按字段名索引，便于多种匹配
        map.set(fieldId, { fieldId, componentName, label });
      }
      if (comp.children && comp.children.length > 0) {
        collect(comp.children);
      }
    }
  }
  collect(components);
  return map;
}

/**
 * 获取SerialNumberField字段ID
 * @param {Array} components - 组件数组
 * @returns {string|null}
 */
function getSerialNumberFieldId(components) {
  if (!components) return null;
  function find(comps) {
    for (const comp of comps) {
      if (comp.componentName === 'SerialNumberField') {
        const fieldId = comp.props?.fieldId;
        if (fieldId) return fieldId;
      }
      if (comp.children && comp.children.length > 0) {
        const found = find(comp.children);
        if (found) return found;
      }
    }
    return null;
  }
  return find(components);
}

/**
 * 从Schema配置或组件树中获取主/次显示字段
 * - 主字段：优先从 schema.config.displayTitle/customTitle 解析，否则取第一个 TextField
 * - 次字段：优先取 SerialNumberField，否则取第二个 TextField
 * @param {Array} components - 组件数组
 * @param {Object} schema - 表单Schema
 * @returns {Object} { mainFieldId, mainComponentName, subFieldId, subComponentName }
 */
function getMainAndSubFieldIds(components, schema) {
  let mainFieldId = null;
  let mainComponentName = 'TextField';
  let subFieldId = null;
  let subComponentName = 'SerialNumberField';
  
  // 优先从 schema.config.displayTitle 解析数据标题字段
  const displayTitle = schema?.config?.displayTitle || schema?.config?.customTitle;
  if (displayTitle && typeof displayTitle === 'string') {
    const matches = displayTitle.match(/\$\{([^}]+)\}/g);
    if (matches && matches.length > 0) {
      mainFieldId = matches[0].replace(/\$\{|\}/g, '');
    }
  }
  
  // 收集所有主表字段（排除子表）
  const textFields = [];
  function collectTextFields(comps) {
    for (const comp of comps) {
      if (comp.componentName === 'TableField') continue;
      const fieldId = comp.props?.fieldId;
      const label = comp.props?.label?.zh_CN || comp.props?.label || '';
      if (fieldId) {
        textFields.push({
          fieldId,
          componentName: comp.componentName,
          label
        });
      }
      if (comp.children && comp.children.length > 0) {
        collectTextFields(comp.children);
      }
    }
  }
  if (components) collectTextFields(components);
  
  // 主字段兜底
  if (!mainFieldId && textFields.length > 0) {
    // 优先名称类字段
    const nameKeywords = ['名称', '名字', '标题', '主题', '姓名'];
    const nameField = textFields.find(f =>
      nameKeywords.some(kw => f.label.includes(kw)) && f.componentName === 'TextField'
    );
    if (nameField) {
      mainFieldId = nameField.fieldId;
      mainComponentName = nameField.componentName;
    } else {
      mainFieldId = textFields[0].fieldId;
      mainComponentName = textFields[0].componentName;
    }
  } else if (mainFieldId && textFields.length > 0) {
    const found = textFields.find(f => f.fieldId === mainFieldId);
    if (found) mainComponentName = found.componentName;
  }
  
  // 次字段优先 SerialNumberField
  subFieldId = getSerialNumberFieldId(components);
  if (!subFieldId && textFields.length > 1) {
    // 排除主字段后取第一个非主字段
    const secondField = textFields.find(f => f.fieldId !== mainFieldId);
    if (secondField) {
      subFieldId = secondField.fieldId;
      subComponentName = secondField.componentName;
    }
  }
  
  return { mainFieldId, mainComponentName, subFieldId, subComponentName };
}

/**
 * 智能查找目标字段ID
 * 支持精确匹配、去掉常见业务前缀后的模糊匹配
 * @param {Map<string, Object>} targetFieldMap - 目标表单字段映射
 * @param {string} label - 当前字段标签
 * @returns {Object|null} { fieldId, componentName }
 */
function findTargetFieldByLabel(targetFieldMap, label) {
  if (!label || !targetFieldMap) return null;

  // 精确匹配
  if (targetFieldMap.has(label)) {
    return targetFieldMap.get(label);
  }

  // 常见业务前缀，用于"调出仓库名称"→"仓库名称"、"客户联系人"→"联系人"这类场景
  const prefixes = [
    '调出', '调入', '入库', '出库', '采购', '销售', '退货', '收款', '付款', '开票', '收票',
    '客户', '供应商', '仓库', '产品', '订单'
  ];
  for (const prefix of prefixes) {
    if (label.startsWith(prefix)) {
      const stripped = label.slice(prefix.length);
      if (targetFieldMap.has(stripped)) {
        return targetFieldMap.get(stripped);
      }
    }
  }

  // 尝试反向：目标字段带前缀，当前字段不带
  for (const prefix of prefixes) {
    const prefixedLabel = prefix + label;
    if (targetFieldMap.has(prefixedLabel)) {
      return targetFieldMap.get(prefixedLabel);
    }
  }

  // 模糊匹配：当前字段名包含目标字段名（如"客户联系电话"包含"联系电话"）
  for (const [targetLabel, targetField] of targetFieldMap.entries()) {
    if (typeof targetLabel !== 'string') continue;
    if (targetLabel.length >= 2 && label.includes(targetLabel)) {
      return targetField;
    }
  }

  return null;
}

/**
 * 从字段配置中提取"填充"字段映射
 * 新格式：从关联表单字段的 description 解析"填充：当前字段=源字段"规则
 * 旧格式兼容：从被填充字段的 description 识别"填充-->源表单.源字段"或"关联带出"
 * @param {Array} configs - 表单配置数组
 * @returns {Object} fillingFieldMap: { formName: { assocFieldLabel: { targetFormName, mainLabels: [], subTableLabels: { subTableName: [] } } } }
 */
// 填充规则分隔符正则常量（穷举兼容所有可能符号）
// 规范：字段清单中多个"当前字段=源字段"对之间推荐用顿号"、"分隔
// 但解析时必须穷举兼容：顿号、中文逗号，英文逗号,中文分号；英文分号;
// 此常量必须与 ai-validator.js 中的 FILLING_PAIR_SEPARATOR 保持一致
const FILLING_PAIR_SEPARATOR = /[、，,；;]/;

function extractFillingFieldMap(configs) {
  // 旧格式兼容：判断 description 是否标记为填充字段
  const isLegacyFillingField = (desc) => !!(desc && (desc.includes('填充-->') || desc.includes('关联带出')));

  // 新格式：从关联字段 description 解析"填充：当前字段=源字段，当前字段=源字段"
  // 返回 {currentLabel, sourceLabel} 对象数组，保留源字段名以便精确匹配目标表单字段
  // 分隔符使用 FILLING_PAIR_SEPARATOR 常量，穷举兼容多种符号
  const parseFillingFromAssocDesc = (desc) => {
    if (!desc) return [];
    const match = desc.match(/填充：(.+)/);
    if (!match) return [];
    const fillingStr = match[1];
    const pairs = fillingStr.split(FILLING_PAIR_SEPARATOR).map(s => s.trim());
    const fillings = [];
    for (const pair of pairs) {
      const parts = pair.split('=').map(s => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        fillings.push({ currentLabel: parts[0], sourceLabel: parts[1] });
      }
    }
    return fillings;
  };

  const map = {};
  for (const config of configs) {
    const formFilling = {};
    // 按顺序遍历主表字段，用 lastAssocField 跟踪最近的关联表单字段（旧格式兼容用）
    let lastAssocLabel = null;   // 最近一个关联表单字段的 label
    let lastAssocTarget = null;  // 最近一个关联表单字段的目标表单名称

    for (const field of config.fields) {
      if (field.type === 'TableField' && field.columns) {
        // 子表：子表内也有独立的关联表单和填充关系
        let lastSubAssocLabel = null;
        let lastSubAssocTarget = null;
        for (const col of field.columns) {
          if (col.type === 'AssociationFormField' && col.associationForm) {
            lastSubAssocLabel = col.label;
            lastSubAssocTarget = col.associationForm;
            // 新格式：从关联字段 description 解析填充规则
            const fillings = parseFillingFromAssocDesc(col.description);
            if (fillings.length > 0) {
              if (!formFilling[lastSubAssocLabel]) {
                formFilling[lastSubAssocLabel] = { targetFormName: lastSubAssocTarget, mainLabels: [], subTableLabels: {} };
              }
              if (!formFilling[lastSubAssocLabel].subTableLabels[field.label]) {
                formFilling[lastSubAssocLabel].subTableLabels[field.label] = [];
              }
              formFilling[lastSubAssocLabel].subTableLabels[field.label].push(...fillings);
            }
          }
          // 旧格式兼容：从被填充字段的 description 识别
          const desc = col.description || '';
          if (isLegacyFillingField(desc) && lastSubAssocLabel && lastSubAssocTarget) {
            if (!formFilling[lastSubAssocLabel]) {
              formFilling[lastSubAssocLabel] = { targetFormName: lastSubAssocTarget, mainLabels: [], subTableLabels: {} };
            }
            if (!formFilling[lastSubAssocLabel].subTableLabels[field.label]) {
              formFilling[lastSubAssocLabel].subTableLabels[field.label] = [];
            }
            formFilling[lastSubAssocLabel].subTableLabels[field.label].push({ currentLabel: col.label, sourceLabel: col.label });
          }
        }
      } else if (field.type === 'AssociationFormField' && field.associationForm) {
        // 主表关联表单字段
        lastAssocLabel = field.label;
        lastAssocTarget = field.associationForm;
        // 新格式：从关联字段 description 解析填充规则
        const fillings = parseFillingFromAssocDesc(field.description);
        if (fillings.length > 0) {
          if (!formFilling[lastAssocLabel]) {
            formFilling[lastAssocLabel] = { targetFormName: lastAssocTarget, mainLabels: [], subTableLabels: {} };
          }
          formFilling[lastAssocLabel].mainLabels.push(...fillings);
        }
      } else {
        // 旧格式兼容：主表填充字段，通过 description 识别
        const desc = field.description || '';
        if (isLegacyFillingField(desc) && lastAssocLabel && lastAssocTarget) {
          if (!formFilling[lastAssocLabel]) {
            formFilling[lastAssocLabel] = { targetFormName: lastAssocTarget, mainLabels: [], subTableLabels: {} };
          }
          formFilling[lastAssocLabel].mainLabels.push({ currentLabel: field.label, sourceLabel: field.label });
        }
      }
    }
    if (Object.keys(formFilling).length > 0) {
      map[config.formName || config.name] = formFilling;
    }
  }
  return map;
}

/**
 * 根据 Yida Schema 组件树构建 label → component 的映射
 * @param {Array} components - Yida Schema 组件树
 * @returns {Map<string, Object>} label → { fieldId, componentName }
 */
function buildComponentLabelMap(components) {
  const map = new Map();
  function walk(comps) {
    for (const comp of comps) {
      const fieldId = comp.props?.fieldId;
      const label = comp.props?.label?.zh_CN || comp.props?.label || '';
      if (fieldId && label) {
        map.set(label, { fieldId, componentName: comp.componentName });
      }
      if (comp.children && comp.children.length > 0) {
        walk(comp.children);
      }
    }
  }
  if (components) walk(components);
  return map;
}

/**
 * 构建数据填充规则
 * 使用从字段清单提取的关联带出映射（不依赖 Yida tips，因为宜搭保存后会丢失内容）
 * @param {Array} components - 当前表单 Yida Schema 组件树
 * @param {Map<string, Object>} targetFieldMap - 目标表单字段映射
 * @param {Object} fillingInfo - 从 extractFillingFieldMap 获取的当前表单→目标表单的关联带出字段信息
 * @param {string} assocFieldLabel - 关联字段标签（用于日志）
 * @returns {Object} dataFillingRules
 */
function buildDataFillingRules(components, targetFieldMap, fillingInfo, assocFieldLabel) {
  const mainRules = [];
  const tableRules = [];
  // 收集未匹配原因，便于排查"规则解析到但配置为空"的问题（v2.19.1新增）
  // 每条记录：{ currentLabel, sourceLabel, scope, reason }
  const unmatched = [];
  if (!components || !targetFieldMap || !fillingInfo) {
    return { tableRules: [], mainRules, version: 'v2', unmatched };
  }

  // 构建当前表单的 label → component 映射
  const currentLabelMap = buildComponentLabelMap(components);

  // 处理主表关联带出字段
  // fillingInfo.mainLabels 元素为 { currentLabel, sourceLabel }：
  //   currentLabel = 当前表单被填充字段名，sourceLabel = 目标表单源字段名
  // 原则：信任用户在字段清单中明确写的"当前字段=源字段"映射，
  //       用 sourceLabel 在目标表单精确匹配，用 currentLabel 在当前表单找被填充组件
  if (fillingInfo.mainLabels && fillingInfo.mainLabels.length > 0) {
    for (const item of fillingInfo.mainLabels) {
      const currentLabel = typeof item === 'string' ? item : item.currentLabel;
      const sourceLabel = typeof item === 'string' ? item : (item.sourceLabel || item.currentLabel);
      const currentComp = currentLabelMap.get(currentLabel);
      if (!currentComp) {
        unmatched.push({ currentLabel, sourceLabel, scope: '主表', reason: `当前表单中找不到被填充字段"${currentLabel}"` });
        continue;
      }
      const targetField = findTargetFieldByLabel(targetFieldMap, sourceLabel);
      if (targetField) {
        mainRules.push({
          source: targetField.fieldId,
          target: currentComp.fieldId,
          sourceType: targetField.componentName,
          targetType: currentComp.componentName
        });
      } else {
        unmatched.push({ currentLabel, sourceLabel, scope: '主表', reason: `目标表单中找不到源字段"${sourceLabel}"` });
      }
    }
  }

  // 处理子表关联带出字段
  // 【v6.57.0 重要修复】子表内关联字段的填充应使用 mainRules 而非 tableRules！
  // 原因：用户场景是「关联表单的主表字段 → 填充到当前表单子表的每一行」
  //   - mainRules = 主表填充规则：关联表单主表字段 → 当前表单任意位置（含子表行），设计器完全支持
  //   - tableRules = 子表填充规则：关联表单子表字段 → 当前表单子表，设计器不支持此配置
  // 之前错误地使用了 tableRules，导致设计器中"数据填充"面板显示为空/禁用状态
  if (fillingInfo.subTableLabels && Object.keys(fillingInfo.subTableLabels).length > 0) {
    for (const [subTableName, labels] of Object.entries(fillingInfo.subTableLabels)) {
      for (const item of labels) {
        const currentLabel = typeof item === 'string' ? item : item.currentLabel;
        const sourceLabel = typeof item === 'string' ? item : (item.sourceLabel || item.currentLabel);
        const currentComp = currentLabelMap.get(currentLabel);
        if (!currentComp) {
          unmatched.push({ currentLabel, sourceLabel, scope: `子表[${subTableName}]`, reason: `当前表单中找不到被填充字段"${currentLabel}"` });
          continue;
        }
        const targetField = findTargetFieldByLabel(targetFieldMap, sourceLabel);
        if (targetField) {
          // 使用 mainRules 而非 tableRules——因为数据来源是关联表单的主表字段
          mainRules.push({
            source: targetField.fieldId,
            target: currentComp.fieldId,
            sourceType: targetField.componentName,
            targetType: currentComp.componentName
          });
        } else {
          unmatched.push({ currentLabel, sourceLabel, scope: `子表[${subTableName}]`, reason: `目标表单中找不到源字段"${sourceLabel}"` });
        }
      }
    }
  }

  return { tableRules, mainRules, version: 'v2', unmatched };
}

/**
 * 更新关联字段的mainFieldId、subFieldId和数据填充规则
 * @param {string} appType - 应用ID
 * @param {Array} createdForms - 已创建的表单列表
 * @param {Object} formUuidMap - 表单名称到UUID的映射
 * @param {Object} loginInfo - 登录信息
 * @param {Array} configs - 原始字段配置（用于提取关联带出信息，不依赖 Yida tips）
 */
async function updateAssociationFields(appType, createdForms, formUuidMap, loginInfo, configs) {
  // 动态导入form_manager的函数
  const { getFormSchema, saveFormSchema } = require(FORM_MANAGER);

  // 失败报告收集器（v2.19.1新增）
  // 收集所有"解析到规则但未成功配置"的字段，最终汇总报告，避免静默失败
  const failureReport = [];

  // 从原始字段配置提取关联带出映射（不依赖 Yida Schema 的 tips）
  const fillingFieldMap = configs ? extractFillingFieldMap(configs) : {};
  if (Object.keys(fillingFieldMap).length > 0) {
    console.log('  📋 从字段清单提取到关联带出信息：');
    for (const [formName, assocFields] of Object.entries(fillingFieldMap)) {
      for (const [assocLabel, info] of Object.entries(assocFields)) {
        const mainCount = info.mainLabels.length;
        const subCount = Object.values(info.subTableLabels).reduce((s, arr) => s + arr.length, 0);
        console.log(`    ${formName}.${assocLabel} → ${info.targetFormName}: 主表${mainCount}个，子表${subCount}个关联带出字段`);
      }
    }
  } else {
    console.log('  ⚠️ 未从字段清单中提取到关联带出信息，数据填充规则将不会生成');
  }
  
  // 第一阶段：收集所有目标表单的字段信息
  const formMetaMap = {}; // formName -> { mainFieldId, mainComponentName, subFieldId, subComponentName, fieldMap }
  for (const form of createdForms) {
    try {
      const schema = await getFormSchema(
        { csrfToken: loginInfo.csrf_token, cookies: loginInfo.cookies, baseUrl: loginInfo.base_url },
        appType,
        form.formUuid
      );
      if (schema) {
        const components = extractComponentsFromSchema(schema);
        const fieldMap = getFieldMap(components);
        const { mainFieldId, mainComponentName, subFieldId, subComponentName } = getMainAndSubFieldIds(components, schema);
        formMetaMap[form.formName] = { mainFieldId, mainComponentName, subFieldId, subComponentName, fieldMap };
        console.log(`  ✓ ${form.formName}: 主字段=${mainFieldId || '-'}, 次字段=${subFieldId || '-'}`);
      }
    } catch (error) {
      console.error(`  ⚠️  查询 ${form.formName} 失败: ${error.message}`);
    }
  }
  
  // 第二阶段：更新包含关联字段的表单
  for (const form of createdForms) {
    try {
      const schema = await getFormSchema(
        { csrfToken: loginInfo.csrf_token, cookies: loginInfo.cookies, baseUrl: loginInfo.base_url },
        appType,
        form.formUuid
      );
      
      const components = extractComponentsFromSchema(schema);
      if (!components) {
        console.log(`  ⚠️ ${form.formName}: 无法获取表单组件结构`);
        continue;
      }
      
      let updated = false;
      
      // 递归更新关联字段
      // 注意：topLevelComponents 始终指向当前表单的顶层组件树，用于 buildDataFillingRules 查找 TableField
      // 不能用递归层的 components，否则子表内关联字段找不到 TableField，子表数据填充规则会丢失
      function updateAssociationComponents(currentComponents, topLevelComponents) {
        for (const comp of currentComponents) {
          if (comp.componentName === 'AssociationFormField' && comp.props?.associationForm) {
            let targetFormTitle = comp.props.associationForm.formTitle;
            // formTitle 可能是 i18n 对象 { zh_CN: "xxx" } 或纯字符串
            if (targetFormTitle && typeof targetFormTitle === 'object') {
              targetFormTitle = targetFormTitle.zh_CN || targetFormTitle.en_US || '';
            }
            const targetMeta = formMetaMap[targetFormTitle];
            const assocForm = comp.props.associationForm;
            const assocLabel = comp.props.label?.zh_CN || comp.props.content?.zh_CN || comp.props.label || comp.props.content || '关联字段';

            if (targetMeta) {
              // 1. 更新主字段（主要信息）
              if (targetMeta.mainFieldId && (!assocForm.mainFieldId || assocForm.mainFieldId === '_' || assocForm.mainFieldId === '')) {
                assocForm.mainFieldId = targetMeta.mainFieldId;
                assocForm.mainComponentName = targetMeta.mainComponentName;
                assocForm.mainFieldLabel = assocForm.mainFieldLabel || { type: 'i18n', zh_CN: targetMeta.fieldMap.get(targetMeta.mainFieldId)?.label || '' };
                updated = true;
              }
              // 2. 更新次字段（次要信息）
              if (targetMeta.subFieldId && (!assocForm.subFieldId || assocForm.subFieldId === '_' || assocForm.subFieldId === '')) {
                assocForm.subFieldId = targetMeta.subFieldId;
                assocForm.subComponentName = targetMeta.subComponentName;
                updated = true;
              }
              // 3. 补充formTitle i18n（如果缺失或为字符串）
              if (!assocForm.formTitle || typeof assocForm.formTitle === 'string') {
                assocForm.formTitle = { type: 'i18n', zh_CN: targetFormTitle, en_US: targetFormTitle };
              }
              // 4. 更新数据填充规则（使用从字段清单提取的关联带出映射，按关联字段label匹配）
              const formFillingInfo = fillingFieldMap[form.formName];
              // fillingFieldMap 结构: { formName: { assocFieldLabel: { targetFormName, mainLabels, subTableLabels } } }
              const assocFillingInfo = formFillingInfo ? formFillingInfo[assocLabel] : null;
              if (assocFillingInfo && assocFillingInfo.targetFormName === targetFormTitle) {
                // 关键修复：必须用顶层 components，否则子表内关联字段找不到 TableField
                const dataFillingRules = buildDataFillingRules(topLevelComponents, targetMeta.fieldMap, assocFillingInfo, assocLabel);
                const mainRuleCount = dataFillingRules.mainRules ? dataFillingRules.mainRules.length : 0;
                if (mainRuleCount > 0) {
                  comp.props.dataFillingRules = dataFillingRules;
                  comp.props.supportDataFilling = true;
                  updated = true;
                  console.log(`  ✓ ${form.formName}.${assocLabel}: 配置 ${mainRuleCount} 条数据填充规则（全部使用主表填充规则mainRules，设计器可正常配置）`);
                  // 即使部分成功，也要报告未匹配项（如果有）
                  if (dataFillingRules.unmatched && dataFillingRules.unmatched.length > 0) {
                    for (const u of dataFillingRules.unmatched) {
                      failureReport.push({ formName: form.formName, assocLabel, ...u });
                      console.log(`    ⚠️ 未匹配：${u.scope} "${u.currentLabel}=源.${u.sourceLabel}" - ${u.reason}`);
                    }
                  }
                } else {
                  // 规则解析到但全部未匹配，收集每一条失败原因
                  const unmatchedList = dataFillingRules.unmatched || [];
                  for (const u of unmatchedList) {
                    failureReport.push({ formName: form.formName, assocLabel, ...u });
                  }
                  const reasonSummary = unmatchedList.length > 0
                    ? unmatchedList.map(u => `${u.currentLabel}=源.${u.sourceLabel}(${u.reason})`).join('; ')
                    : '未知原因';
                  console.log(`  ❌ ${form.formName}.${assocLabel}: 数据填充规则为空（主表0，子表0）- 原因：${reasonSummary}`);
                }
              } else {
                console.log(`  ℹ️ ${form.formName}.${assocLabel}: 字段清单中无关联带出字段，跳过数据填充配置`);
              }
            } else {
              // v2.20.0: targetMeta 匹配不到时不再静默跳过——多为 formTitle 为空（占位符兜底特征）
              // 或目标表不在本次创建列表，计入 failureReport 避免带病交付
              const rawUuid = assocForm.formUuid || '';
              const isPlaceholder = typeof rawUuid === 'string' && rawUuid.startsWith('FORM-TEMP-');
              failureReport.push({
                formName: form.formName,
                assocLabel,
                scope: '关联字段目标',
                currentLabel: assocLabel,
                sourceLabel: targetFormTitle || '(空)',
                reason: `目标表单"${targetFormTitle || '(空)'}"未匹配到已建表单${isPlaceholder ? `，且formUuid为占位符 ${rawUuid}（线上点"新增"会报"表单不存在"）` : ''}`
              });
              console.log(`  ❌ ${form.formName}.${assocLabel}: 目标表单"${targetFormTitle || '(空)'}"未匹配到已建表单，关联配置不完整${isPlaceholder ? `（占位符: ${rawUuid}）` : ''}`);
            }
          }
          if (comp.children && comp.children.length > 0) {
            updateAssociationComponents(comp.children, topLevelComponents);
          }
        }
      }

      updateAssociationComponents(components, components);
      
      if (updated) {
        // 保存更新后的Schema
        await saveFormSchema(
          { csrfToken: loginInfo.csrf_token, cookies: loginInfo.cookies, baseUrl: loginInfo.base_url },
          appType,
          form.formUuid,
          schema
        );
        console.log(`  ✅ ${form.formName} 关联配置更新成功`);
      }
    } catch (error) {
      console.error(`  ⚠️  更新 ${form.formName} 失败: ${error.message}`);
    }
  }

  // 失败汇总报告（v2.19.1新增）：避免静默失败
  if (failureReport.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log(`⚠️  关联填充规则配置失败汇总（共 ${failureReport.length} 条未匹配）：`);
    console.log('='.repeat(60));
    // 按表单分组
    const byForm = {};
    for (const f of failureReport) {
      const key = `${f.formName}.${f.assocLabel}`;
      if (!byForm[key]) byForm[key] = [];
      byForm[key].push(f);
    }
    for (const [key, items] of Object.entries(byForm)) {
      console.log(`  [${key}] ${items.length}条未匹配：`);
      for (const u of items) {
        console.log(`    - ${u.scope}: "${u.currentLabel}=源.${u.sourceLabel}" → ${u.reason}`);
      }
    }
    console.log('='.repeat(60));
    console.log('💡 提示：以上字段在字段清单中标注了填充规则，但实际配置时未匹配到目标字段。');
    console.log('   可能原因：1)源字段名在目标表单不存在；2)被填充字段在当前表单不存在；3)分隔符不被识别。');
    console.log('   请检查字段清单中"当前字段=源字段"映射是否正确，或目标表单是否缺少对应字段。');
    console.log('='.repeat(60));
  }
}

/**
 * 建表后兜底自检：扫描并修复FORM-TEMP占位符残留（v2.20.0新增）
 *
 * 定位：最后一道防线。前置校验（validateAssociationTargets）正常时这里应该扫不到任何残留；
 * 一旦扫到，说明上游又出现新的漏网路径，绝不允许静默带病交付。
 * 修复策略：
 *   - formTitle 可解析且在 formUuidMap 中有真实UUID → 自动回填并保存
 *     （本函数只处理本次流程新建的表单，符合"saveFormSchema仅允许对新建表单调用"约束）
 *   - 无法解析（formTitle为空等）→ 醒目告警 + 非零退出码，要求立即人工处理
 * @param {string} appType - 应用ID
 * @param {Array} createdForms - 本次创建的表单列表
 * @param {Object} formUuidMap - 表单名称到UUID的映射
 * @param {Object} loginInfo - 登录信息
 */
async function scanAndFixPlaceholders(appType, createdForms, formUuidMap, loginInfo) {
  const { getFormSchema, saveFormSchema } = require(FORM_MANAGER);
  const auth = { csrfToken: loginInfo.csrf_token, cookies: loginInfo.cookies, baseUrl: loginInfo.base_url };
  const unfixable = [];
  let fixedCount = 0;
  let scannedCount = 0;

  for (const form of createdForms) {
    let schema;
    try {
      schema = await getFormSchema(auth, appType, form.formUuid);
    } catch (error) {
      console.error(`  ⚠️  获取 ${form.formName} Schema失败，无法自检: ${error.message}`);
      unfixable.push({ formName: form.formName, label: '(整表)', placeholder: '-', reason: `Schema获取失败: ${error.message}` });
      continue;
    }
    scannedCount++;
    const components = extractComponentsFromSchema(schema);
    if (!components) continue;

    let fixedInForm = 0;
    function scan(comps) {
      for (const comp of comps) {
        if (comp.componentName === 'AssociationFormField' && comp.props?.associationForm) {
          const assocForm = comp.props.associationForm;
          const uuid = assocForm.formUuid || '';
          if (typeof uuid === 'string' && uuid.startsWith('FORM-TEMP-')) {
            const label = comp.props.label?.zh_CN || comp.props.label || comp.props.content?.zh_CN || '(未知字段)';
            let title = assocForm.formTitle;
            if (title && typeof title === 'object') title = title.zh_CN || title.en_US || '';
            const realUuid = title ? formUuidMap[title] : null;
            if (realUuid) {
              assocForm.formUuid = realUuid;
              if (!assocForm.appType) assocForm.appType = appType;
              fixedInForm++;
              console.log(`  🔧 ${form.formName}.${label}: 占位符 ${uuid} → ${realUuid}（目标表: ${title}）`);
            } else {
              unfixable.push({ formName: form.formName, label, placeholder: uuid, reason: title ? `目标表"${title}"未找到真实UUID` : 'formTitle为空，无法定位目标表' });
            }
          }
        }
        if (comp.children && comp.children.length > 0) scan(comp.children);
      }
    }
    scan(components);

    if (fixedInForm > 0) {
      try {
        await saveFormSchema(auth, appType, form.formUuid, schema);
        fixedCount += fixedInForm;
        console.log(`  ✅ ${form.formName}: 已自动回填 ${fixedInForm} 个占位符并保存`);
      } catch (error) {
        console.error(`  ❌ ${form.formName}: 占位符回填保存失败: ${error.message}`);
        unfixable.push({ formName: form.formName, label: '(保存失败)', placeholder: '-', reason: error.message });
      }
    }
  }

  if (unfixable.length === 0) {
    console.log(`  ✅ 自检通过：${scannedCount} 个表单无FORM-TEMP占位符残留${fixedCount > 0 ? `（自动修复 ${fixedCount} 处）` : ''}`);
    return;
  }

  console.error('\n' + '='.repeat(60));
  console.error(`❌ 自检发现 ${unfixable.length} 处无法自动修复的FORM-TEMP占位符残留！`);
  console.error('='.repeat(60));
  for (const u of unfixable) {
    console.error(`  - ${u.formName}.${u.label}: ${u.placeholder} → ${u.reason}`);
  }
  console.error('='.repeat(60));
  console.error('💡 后果：这些关联字段在线上点击"新增"会报"表单不存在"！');
  console.error('   请立即到宜搭表单设计器中手动修改上述字段的关联表单指向，');
  console.error('   并在字段清单中为对应字段补上 关联-->目标表名 标记。');
  process.exitCode = 1;
}

/**
 * 生成原型页面
 * 调用 form-to-prototype skill 生成 HTML 原型页面
 * @param {string} markdownPath - 字段清单文件路径
 * @param {string} outputDir - 项目输出目录
 * @param {Object} appInfo - 应用信息
 * @returns {Object} 生成结果 {success: boolean, url: string}
 */
async function generatePrototype(markdownPath, outputDir, appInfo) {
  const result = { success: false, url: '' };
  
  try {
    // 检查原型页面生成器脚本是否存在
    if (!fs.existsSync(PROTOTYPE_GENERATOR_SCRIPT)) {
      console.log(`  ⚠️  原型页面生成器脚本不存在: ${PROTOTYPE_GENERATOR_SCRIPT}`);
      return result;
    }
    
    // 确定原型页面输出目录：{项目目录}/01需求梳理/原型页面/
    const prototypeOutputDir = path.join(outputDir, '01需求梳理', '原型页面');
    
    console.log(`  📁 原型页面输出目录: ${prototypeOutputDir}`);
    
    // 调用原型页面生成器
    const command = `node "${PROTOTYPE_GENERATOR_SCRIPT}" "${markdownPath}" "${prototypeOutputDir}"`;
    
    console.log(`  🔄 正在生成原型页面...`);
    
    execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120_000,
      cwd: path.dirname(PROTOTYPE_GENERATOR_SCRIPT)
    });
    
    console.log(`  ✅ 原型页面生成成功`);
    
    // 构建访问地址
    const projectName = path.basename(outputDir);
    result.url = `http://127.0.0.1:8080/${projectName}/01需求梳理/原型页面/index.html`;
    result.success = true;
    
    // 注意：组织及应用信息.md 的更新由 prototype_generator.js 统一处理
    // 避免重复更新导致表格格式混乱
    
  } catch (error) {
    console.log(`  ⚠️  生成原型页面失败: ${error.message}`);
    console.log(`  💡 请稍后手动执行生成命令:`);
    console.log(`     node .agents/skills/form-to-prototype/scripts/prototype_generator.js "${markdownPath}" "${path.join(outputDir, '01需求梳理')}"`);
  }
  
  return result;
}

/**
 * 更新组织及应用信息.md，追加原型页面访问地址
 * @param {string} outputDir - 项目输出目录
 * @param {Object} appInfo - 应用信息
 * @param {string} prototypeUrl - 原型页面访问地址
 */
async function updateOrgInfoWithPrototype(outputDir, appInfo, prototypeUrl) {
  try {
    // 查找组织及应用信息.md文件（从项目目录向上查找）
    let orgInfoPath = null;
    let currentDir = outputDir;
    
    while (currentDir !== path.dirname(currentDir)) {
      const possiblePath = path.join(currentDir, '组织及应用信息.md');
      if (fs.existsSync(possiblePath)) {
        orgInfoPath = possiblePath;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    
    if (!orgInfoPath) {
      console.log(`  ⚠️  未找到组织及应用信息.md文件，跳过原型地址更新`);
      return;
    }
    
    let content = fs.readFileSync(orgInfoPath, 'utf-8');
    
    // 检查是否已存在原型页面访问地址章节
    const prototypeSectionRegex = /## 原型页面访问地址/;
    
    if (!prototypeSectionRegex.test(content)) {
      // 不存在则创建新章节（在更新时间章节前插入）
      const updateTimeRegex = /## 更新时间/;
      const prototypeSection = `## 原型页面访问地址

> 以下地址需要在 HTTP 服务启动后访问
>
> ⚠️ **必须使用 HTTP 方式访问**，严禁使用 \`file://\` 协议打开

| 应用名称 | 原型页面地址 | 本地状态 |
|----------|-------------|----------|
| ${appInfo.appName} | ${prototypeUrl} | ✅ 已同步 |

`;
      
      if (updateTimeRegex.test(content)) {
        content = content.replace(updateTimeRegex, prototypeSection + '## 更新时间');
      } else {
        content += '\n' + prototypeSection;
      }
    } else {
      // 已存在则追加新行
      const tableRow = `| ${appInfo.appName} | ${prototypeUrl} | ✅ 已同步 |`;
      
      // 在表格最后一行后追加
      const tableEndRegex = /(\| [^|]+ \| http[^|]+ \| [^|]+ \|)\n*(## 更新时间|$)/;
      const match = content.match(tableEndRegex);
      
      if (match) {
        content = content.replace(match[1], match[1] + '\n' + tableRow);
      } else {
        // 如果无法匹配，在章节末尾追加
        content = content.replace(/(## 原型页面访问地址[\s\S]*?)(\n## |$)/, '$1\n' + tableRow + '\n$2');
      }
    }
    
    // 保存文件
    fs.writeFileSync(orgInfoPath, content, 'utf-8');
    console.log(`  ✅ 已更新组织及应用信息.md，追加原型页面访问地址`);
    
  } catch (error) {
    console.log(`  ⚠️  更新组织及应用信息.md失败: ${error.message}`);
    // 不抛出错误，因为这是辅助功能
  }
}

// 支持作为模块被 require（修复脚本等场景复用内部函数）
if (require.main === module) {
  main().catch(err => {
    console.error('\n错误:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseMarkdown,
  parseGroupConfig,
  convertFormToConfig,
  topologicalSort,
  validateAssociationTargets,
  scanAndFixPlaceholders,
  extractFillingFieldMap,
  buildDataFillingRules,
  buildComponentLabelMap,
  findTargetFieldByLabel,
  getFieldMap,
  getMainAndSubFieldIds,
  extractComponentsFromSchema,
  updateAssociationFields,
  ensureLogin
};
