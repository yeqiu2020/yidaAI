/**
 * 宜搭表单数据清空脚本
 * 版本: 2.1.2
 * 功能: 清空指定应用中的表单数据（保留表单结构）
 *
 * 使用方式:
 * node scripts/clear-form-data.js <应用ID> [选项]
 *
 * 选项:
 *   --all                    清空所有表单数据
 *   --form <formUuid>        清空指定表单数据
 *   --forms <uuid1,uuid2>    清空多个指定表单数据（逗号分隔）
 *   --appName <应用名称>      指定应用名称，直接定位配置文件
 *
 * 示例:
 *   node scripts/clear-form-data.js APP_XXXXXXXX --all
 *   node scripts/clear-form-data.js APP_XXXXXXXX --all --appName AI宜搭场景
 *   node scripts/clear-form-data.js APP_XXXXXXXX --form FORM-XXXXXXXX
 *   node scripts/clear-form-data.js APP_XXXXXXXX --forms FORM-XXX,FORM-YYY
 *
 * v2.1.2 修复:
 * - 根因修复：Markdown转义下划线导致appId包含反斜杠（APP\_XXX → APP_XXX）
 * - main函数入口添加unescape处理，防御性清理appId中的反斜杠
 * v2.1.1 修复:
 * - getRequest 支持传递 csrfToken 参数（修复API调用返回success=false）
 * - 指定appName时，即使appId不匹配也尝试直接解析表单列表（容错处理）
 * - 添加详细调试日志（显示文件中的APP_ID、includes结果等）
 * v2.1.0 修复:
 * - 新增 --appName 参数，直接定位系统配置清单（不再依赖子目录遍历搜索）
 * - 修复 getFormsFromAPI 使用正确的宜搭API路径
 * - 添加调试日志，便于排查问题
 * v2.0.0:
 * - 移除硬编码的表单列表和默认appId
 * - 从系统配置清单动态读取表单列表
 * - 支持从宜搭API获取表单列表（配置清单不存在时）
 * - 正确识别流程表单（通过processCode列判断）
 * - appId 参数改为必填
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COOKIE_FILE = path.join(PROJECT_ROOT, '.cookies.json');

/**
 * 加载Cookie
 */
function loadCookies() {
  try {
    const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    if (Array.isArray(data)) {
      return {
        cookies: data,
        baseUrl: 'https://www.aliwork.com',
        csrfToken: '',
        userId: ''
      };
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
 * 发送POST请求（带CSRF Token）
 */
function postRequest(hostname, path, params, cookies, csrfToken) {
  return new Promise((resolve, reject) => {
    const postParams = { ...params, _csrf_token: csrfToken };
    const postData = querystring.stringify(postParams);
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
 * 发送GET请求（支持可选的csrf token参数）
 */
function getRequest(hostname, reqPath, cookies, csrfToken) {
  return new Promise((resolve, reject) => {
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    // 如果提供了csrf token，添加到查询参数
    if (csrfToken) {
      const separator = reqPath.includes('?') ? '&' : '?';
      reqPath += `${separator}_csrf_token=${encodeURIComponent(csrfToken)}`;
    }

    const options = {
      hostname: hostname,
      port: 443,
      path: reqPath,
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
          resolve({ success: false, message: data.substring(0, 500), raw: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

/**
 * 查询普通表单数据ID列表
 */
async function searchNormalFormDataIds(appId, formUuid, cookies, hostname, csrfToken) {
  const allIds = [];
  let currentPage = 1;
  const pageSize = 100;

  while (true) {
    const reqPath = `/dingtalk/web/${appId}/v1/form/searchFormDataIds.json?formUuid=${formUuid}&pageSize=${pageSize}&currentPage=${currentPage}`;
    const result = await getRequest(hostname, reqPath, cookies, csrfToken);

    if (result.success && result.content && result.content.data) {
      const data = result.content.data;
      if (data.length === 0) break;

      allIds.push(...data);

      if (data.length < pageSize) break;
      currentPage++;
    } else {
      break;
    }
  }

  return allIds;
}

/**
 * 查询流程表单实例ID列表
 */
async function searchProcessFormDataIds(appId, formUuid, cookies, hostname, csrfToken) {
  const allIds = [];
  let currentPage = 1;
  const pageSize = 100;

  while (true) {
    const reqPath = `/dingtalk/web/${appId}/v1/process/getInstanceIds.json?formUuid=${formUuid}&pageSize=${pageSize}&currentPage=${currentPage}`;
    const result = await getRequest(hostname, reqPath, cookies, csrfToken);

    if (result.success && result.content && result.content.data) {
      const data = result.content.data;
      if (data.length === 0) break;

      allIds.push(...data);

      if (data.length < pageSize) break;
      currentPage++;
    } else {
      break;
    }
  }

  return allIds;
}

/**
 * 删除普通表单数据
 */
async function deleteFormData(appId, formInstId, cookies, hostname, csrfToken) {
  const path = `/dingtalk/web/${appId}/v1/form/deleteFormData.json`;
  const params = { formInstId: formInstId };

  const result = await postRequest(hostname, path, params, cookies, csrfToken);
  return result.success === true;
}

/**
 * 删除流程实例
 */
async function deleteProcessInstance(appId, processInstanceId, cookies, hostname, csrfToken) {
  const path = `/dingtalk/web/${appId}/v1/process/deleteInstance.json`;
  const params = { processInstanceId: processInstanceId };

  const result = await postRequest(hostname, path, params, cookies, csrfToken);
  return result.success === true;
}

/**
 * 清空单个表单数据
 */
async function clearFormData(appId, formUuid, formName, isProcess, cookies, hostname, csrfToken) {
  console.log(`\n📋 处理表单: ${formName || formUuid}`);

  let ids = [];
  let deleteCount = 0;
  let failCount = 0;

  try {
    if (isProcess) {
      ids = await searchProcessFormDataIds(appId, formUuid, cookies, hostname, csrfToken);
    } else {
      ids = await searchNormalFormDataIds(appId, formUuid, cookies, hostname, csrfToken);
    }

    console.log(`   📊 共找到 ${ids.length} 条数据`);

    if (ids.length === 0) {
      return { success: true, deleted: 0, failed: 0 };
    }

    const backupDir = path.join(PROJECT_ROOT, 'temp-file', 'data-backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupFile = path.join(backupDir, `${(formName || formUuid).replace(/[\/\\:*?"<>|]/g, '_')}_${new Date().toISOString().slice(0,10)}.json`);
    try {
      fs.writeFileSync(backupFile, JSON.stringify({ appId, formUuid, formName, isProcess, dataIds: ids, backupTime: new Date().toISOString() }, null, 2), 'utf-8');
      console.log(`   💾 已备份数据ID列表: ${backupFile}`);
    } catch (backupErr) {
      console.log(`   ⚠️  备份失败: ${backupErr.message}，继续执行清空操作`);
    }

    // 逐条删除数据
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      let success;

      if (isProcess) {
        success = await deleteProcessInstance(appId, id, cookies, hostname, csrfToken);
      } else {
        success = await deleteFormData(appId, id, cookies, hostname, csrfToken);
      }

      if (success) {
        deleteCount++;
        process.stdout.write(`   ✅ 已删除 ${i + 1}/${ids.length}\r`);
      } else {
        failCount++;
        console.log(`\n   ❌ 删除失败: ${id}`);
      }

      // 添加小延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n   ✅ 完成: 成功删除 ${deleteCount} 条，失败 ${failCount} 条`);
    return { success: true, deleted: deleteCount, failed: failCount };

  } catch (error) {
    console.log(`   ❌ 错误: ${error.message}`);
    return { success: false, deleted: deleteCount, failed: failCount + (ids.length - deleteCount) };
  }
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    appId: null,
    all: false,
    form: null,
    forms: null,
    appName: null
  };

  // 第一个参数是应用ID
  if (args.length > 0 && !args[0].startsWith('--')) {
    options.appId = args[0];
    args.shift();
  }

  // 解析选项
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--all':
        options.all = true;
        break;
      case '--form':
        if (i + 1 < args.length) {
          options.form = args[++i];
        }
        break;
      case '--forms':
        if (i + 1 < args.length) {
          options.forms = args[++i].split(',');
        }
        break;
      case '--appName':
        if (i + 1 < args.length) {
          options.appName = args[++i];
        }
        break;
    }
  }

  return options;
}

/**
 * 从系统配置清单获取表单列表
 * @param {string} appId - 应用ID
 * @param {string} [appName] - 应用名称（优先直接定位配置文件）
 * @returns {Array} 表单列表 [{name, uuid, isProcess}]
 */
function getFormsFromConfig(appId, appName) {
  console.log(`🔎 getFormsFromConfig 调用: appId="${appId}", appName="${appName}"`);
  console.log(`🔎 PROJECT_ROOT="${PROJECT_ROOT}"`);

  // 优先通过 appName 直接定位配置文件
  if (appName) {
    const directPath = path.join(PROJECT_ROOT, appName, '系统配置清单.md');
    console.log(`🔍 尝试直接定位: ${directPath}`);
    if (fs.existsSync(directPath)) {
      const content = fs.readFileSync(directPath, 'utf-8');
      console.log(`📄 文件大小: ${content.length} 字符`);
      // 调试：查找文件中所有 APP_ 开头的字符串
      const appIds = content.match(/APP_[A-Z0-9]+/g);
      console.log(`📄 文件中的APP_ID: ${appIds ? appIds.join(', ') : '无'}`);
      console.log(`📄 检查的appId: "${appId}" (长度=${appId.length})`);
      console.log(`📄 includes结果: ${content.includes(appId)}`);
      if (content.includes(appId)) {
        console.log(`✅ 通过appName直接找到配置文件: ${directPath}`);
        return parseFormsFromConfig(content);
      } else {
        // appId不匹配但用户指定了appName，仍然尝试解析表单（可能是配置文件格式问题）
        console.log(`⚠️  配置文件不包含appId "${appId}"，但用户指定了appName，尝试直接解析表单列表`);
        const forms = parseFormsFromConfig(content);
        if (forms && forms.length > 0) {
          console.log(`✅ 通过appName直接解析到 ${forms.length} 个表单`);
          return forms;
        }
        console.log(`⚠️  直接解析也未找到表单，继续搜索`);
      }
    } else {
      console.log(`⚠️  直接路径不存在: ${directPath}，继续搜索`);
    }
  }

  // 尝试从本地系统配置清单读取
  const configPath = path.join(PROJECT_ROOT, '系统配置清单.md');

  // 如果根目录没有，遍历子目录查找
  let configContent = null;
  if (fs.existsSync(configPath)) {
    console.log(`✅ 根目录找到配置文件: ${configPath}`);
    configContent = fs.readFileSync(configPath, 'utf-8');
  } else {
    // 遍历子目录查找系统配置清单
    console.log(`🔍 根目录无配置文件，搜索子目录...`);
    try {
      const dirs = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
      console.log(`📁 找到 ${dirs.filter(d => d.isDirectory()).length} 个子目录`);
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const subConfigPath = path.join(PROJECT_ROOT, dir.name, '系统配置清单.md');
        if (fs.existsSync(subConfigPath)) {
          console.log(`🔍 检查子目录: ${dir.name}/系统配置清单.md`);
          const content = fs.readFileSync(subConfigPath, 'utf-8');
          // 调试：显示文件中的APP_ID
          const foundAppIds = content.match(/APP_[A-Z0-9]+/g);
          console.log(`   📄 文件中的APP_ID: ${foundAppIds ? foundAppIds.join(', ') : '无'}`);
          // 检查是否包含目标 appId
          if (content.includes(appId)) {
            console.log(`✅ 在子目录 ${dir.name} 中找到匹配的配置文件`);
            configContent = content;
            break;
          } else {
            console.log(`⚠️  ${dir.name}/系统配置清单.md 不包含 appId "${appId}"`);
          }
        }
      }
    } catch (e) {
      console.log(`❌ 搜索子目录出错: ${e.message}`);
    }
  }

  if (!configContent) {
    console.log('⚠️  未找到系统配置清单，将使用宜搭API获取表单列表');
    return null; // 返回null表示需要从API获取
  }

  return parseFormsFromConfig(configContent);
}

/**
 * 从系统配置清单内容解析表单列表
 * @param {string} configContent - 配置文件内容
 * @returns {Array} 表单列表 [{name, uuid, isProcess}]
 */
function parseFormsFromConfig(configContent) {
  const forms = [];
  const lines = configContent.split('\n');
  for (const line of lines) {
    // 匹配 | 序号 | 页面名称「类型」 | FORM-xxx | processCode | 格式
    const match = line.match(/\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(FORM-[\w-]+)\s*\|\s*(.*?)\s*\|/);
    if (match && match[2] && match[2].startsWith('FORM-')) {
      // 提取表单名称（去掉「类型」部分）
      const rawName = match[1].trim();
      const formName = rawName.replace(/「.+?」$/, '').trim() || rawName;
      const formUuid = match[2];
      const processCode = match[3] ? match[3].trim() : '';
      // 流程表单：processCode 不为空且不为 "-"
      const isProcess = processCode !== '' && processCode !== '-';
      forms.push({ name: formName, uuid: formUuid, isProcess });
    }
  }

  console.log(`📋 从配置清单解析到 ${forms.length} 个表单`);
  return forms.length > 0 ? forms : null;
}

/**
 * 从宜搭API获取表单列表
 * 使用正确的宜搭API路径: /dingtalk/web/${appId}/query/formdesign/getFormList.json
 */
async function getFormsFromAPI(appId, cookies, hostname, csrfToken) {
  const forms = [];

  // 使用宜搭正确的API路径获取表单列表
  const apiPath = `/dingtalk/web/${appId}/query/formdesign/getFormList.json`;
  console.log(`📡 调用API: ${apiPath}`);

  try {
    const result = await getRequest(hostname, apiPath, cookies, csrfToken);
    console.log(`📥 API返回: success=${result?.success}, hasContent=${!!result?.content}`);

    if (!result?.success) {
      console.log(`⚠️  API调用失败: ${result?.errorMsg || result?.message || '未知错误'}`);
      return forms;
    }

    // 解析表单列表 - 宜搭API可能返回不同的结构
    let formList = [];
    if (result.content) {
      if (Array.isArray(result.content)) {
        formList = result.content;
      } else if (result.content.list && Array.isArray(result.content.list)) {
        formList = result.content.list;
      } else if (result.content.data && Array.isArray(result.content.data)) {
        formList = result.content.data;
      } else if (result.content.forms && Array.isArray(result.content.forms)) {
        formList = result.content.forms;
      } else {
        console.log(`⚠️  API返回的content结构: ${Object.keys(result.content).join(', ')}`);
      }
    }

    if (formList.length === 0) {
      console.log('⚠️  API返回的表单列表为空');
      return forms;
    }

    console.log(`📋 API返回 ${formList.length} 个表单`);

    for (let i = 0; i < formList.length; i++) {
      const form = formList[i];
      if (!form || typeof form !== 'object') continue;

      const formName = form.title?.zh_CN || form.name || form.formName || '未命名表单';
      const formUuid = form.formUuid;
      const processCode = form.processCode || '';
      const isProcess = form.formType === 'process' || (processCode !== '' && processCode !== null);

      if (formUuid) {
        forms.push({ name: formName, uuid: formUuid, isProcess });
        console.log(`   [${i + 1}] ${formName} - ${formUuid} (${isProcess ? '流程表单' : '普通表单'})`);
      }
    }
  } catch (error) {
    console.log(`❌ API调用异常: ${error.message}`);
  }

  return forms;
}

/**
 * 主函数
 */
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('        宜搭表单数据清空工具 v2.1.2');
  console.log('═══════════════════════════════════════════\n');

  // 解析参数
  const options = parseArgs();

  // 获取应用ID（必须提供）
  // 清理 Markdown 转义：APP\_XXX → APP_XXX
  let appId = options.appId;
  if (appId) {
    appId = appId.replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, '$1');
  }
  if (!appId) {
    console.error('❌ 缺少应用ID参数！');
    console.log('用法: node clear-form-data.js <应用ID> --all [--appName 应用名称]');
    console.log('示例: node clear-form-data.js APP_XXXXXXXX --all --appName AI宜搭场景');
    process.exit(1);
  }

  if (options.appName) {
    console.log(`📦 应用名称: ${options.appName}`);
  }

  // 加载Cookie
  let cookieData;
  try {
    cookieData = loadCookies();
    console.log(`✅ Cookie加载成功`);
    console.log(`📍 基础URL: ${cookieData.baseUrl}`);
    console.log(`🔑 CSRF Token: ${cookieData.csrfToken ? '已获取' : '未获取'}`);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  const hostname = cookieData.baseUrl.replace('https://', '');

  // 确定要处理的表单列表
  let forms = [];

  if (options.all) {
    // 清空所有表单 - 优先从本地配置读取，否则从API获取
    forms = getFormsFromConfig(appId, options.appName);
    if (!forms) {
      console.log('📡 从宜搭API获取表单列表...');
      forms = await getFormsFromAPI(appId, cookieData.cookies, hostname, cookieData.csrfToken);
    }
    if (forms.length === 0) {
      console.log('⚠️  未找到任何表单，请确认应用ID是否正确');
      process.exit(1);
    }
    console.log(`\n🎯 目标应用: ${appId}${options.appName ? ` (${options.appName})` : ''}`);
    console.log(`📋 清空范围: 所有表单 (${forms.length} 个)`);
  } else if (options.form) {
    // 清空指定表单
    forms = [{ name: options.form, uuid: options.form, isProcess: false }];
    console.log(`\n🎯 目标应用: ${appId}${options.appName ? ` (${options.appName})` : ''}`);
    console.log(`📋 清空范围: 指定表单 (${options.form})`);
  } else if (options.forms) {
    // 清空多个指定表单
    forms = options.forms.map(uuid => ({ name: uuid, uuid: uuid, isProcess: false }));
    console.log(`\n🎯 目标应用: ${appId}${options.appName ? ` (${options.appName})` : ''}`);
    console.log(`📋 清空范围: 指定表单 (${options.forms.length} 个)`);
  } else {
    // 默认清空所有表单
    forms = getFormsFromConfig(appId, options.appName);
    if (!forms) {
      console.log('📡 从宜搭API获取表单列表...');
      forms = await getFormsFromAPI(appId, cookieData.cookies, hostname, cookieData.csrfToken);
    }
    if (forms.length === 0) {
      console.log('⚠️  未找到任何表单，请确认应用ID是否正确');
      process.exit(1);
    }
    console.log(`\n🎯 目标应用: ${appId}${options.appName ? ` (${options.appName})` : ''}`);
    console.log(`📋 清空范围: 所有表单 (${forms.length} 个)`);
  }

  console.log('\n⚠️  警告: 此操作将删除所有表单数据，且不可恢复！');
  console.log('⏳ 3秒后开始执行...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  // 统计
  let totalDeleted = 0;
  let totalFailed = 0;
  let processedForms = 0;

  // 逐个清空表单
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    console.log(`\n[${i + 1}/${forms.length}]`);

    const result = await clearFormData(
      appId,
      form.uuid,
      form.name,
      form.isProcess,
      cookieData.cookies,
      hostname,
      cookieData.csrfToken
    );

    totalDeleted += result.deleted;
    totalFailed += result.failed;
    processedForms++;

    // 表单间延迟
    if (i < forms.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 输出汇总
  console.log('\n═══════════════════════════════════════════');
  console.log('              执行完成汇总');
  console.log('═══════════════════════════════════════════');
  console.log(`📊 处理表单数: ${processedForms}`);
  console.log(`✅ 成功删除: ${totalDeleted} 条数据`);
  console.log(`❌ 删除失败: ${totalFailed} 条数据`);
  console.log('═══════════════════════════════════════════\n');
}

// 执行
main().catch(error => {
  console.error('❌ 执行出错:', error.message);
  process.exit(1);
});
