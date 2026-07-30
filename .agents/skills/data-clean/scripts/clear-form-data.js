/**
 * 宜搭表单数据清空脚本
 * 版本: 2.2.0
 * 功能: 清空指定应用中的表单数据（保留表单结构）
 *
 * 使用方式:
 * node scripts/clear-form-data.js <应用ID> <范围> [选项]
 *
 * 范围（三者必须显式指定其一，否则拒绝执行）:
 *   --all                    清空所有表单数据
 *   --form <formUuid>        清空指定表单数据
 *   --forms <uuid1,uuid2>    清空多个指定表单数据（逗号分隔）
 *
 * 选项:
 *   --appName <应用名称>      指定应用名称，直接定位配置文件
 *   --dry-run                预览模式：仅列出将删除的表单与条数，不执行任何删除
 *   --confirm                确认执行删除（不可逆）。缺省时改用交互输入 DELETE 确认
 *
 * 示例:
 *   node scripts/clear-form-data.js APP_XXXXXXXX --all --dry-run          # 先预览
 *   node scripts/clear-form-data.js APP_XXXXXXXX --all --confirm          # 确认后执行
 *   node scripts/clear-form-data.js APP_XXXXXXXX --form FORM-XXXXXXXX --confirm
 *   node scripts/clear-form-data.js APP_XXXXXXXX --forms FORM-XXX,FORM-YYY --confirm
 *
 * v2.2.0 安全加固:
 * - 取消“无参数默认删除全部”行为：必须显式 --all / --form / --forms，否则拒绝执行
 * - 新增 --dry-run 预览模式，仅统计将删除的表单与条数，不执行删除
 * - 新增执行前确认闸门：需 --confirm 或交互输入 DELETE，否则不删除任何数据
 * - 备份升级为“可还原备份”：抓取每条记录的完整内容（不再仅存 dataId）；
 *   内容抓取不完整时在备份文件与终端明确提示“不可完整还原”；备份写入失败则跳过删除
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

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require('../../../../lib/core/utils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COOKIE_FILE = path.join(PROJECT_ROOT, '.cookies.json');

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
 * 抓取单条记录的完整内容（用于可还原备份）
 * 普通表单：getFormDataById.json（主表字段，不含子表明细）
 * 流程表单：getInstanceById.json（流程实例详情）
 * @returns {object|null} 成功返回记录内容，失败返回 null
 */
async function fetchFormDataContent(appId, instId, isProcess, cookies, hostname, csrfToken) {
  try {
    const reqPath = isProcess
      ? `/dingtalk/web/${appId}/v1/process/getInstanceById.json?processInstanceId=${encodeURIComponent(instId)}`
      : `/dingtalk/web/${appId}/v1/form/getFormDataById.json?formInstId=${encodeURIComponent(instId)}`;
    const result = await getRequest(hostname, reqPath, cookies, csrfToken);
    if (!result) return null;
    // 标准包装：{ success, result: {...} }
    if (result.result !== undefined && result.result !== null) return result.result;
    // 部分接口直接返回扁平对象（无 success/result 包装）
    if (result.success === undefined && !result.raw && typeof result === 'object') return result;
    if (result.success === true) return result.content || result.data || result;
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 交互式确认：要求用户输入 DELETE 才视为确认
 * 非 TTY（无交互终端）环境下直接返回 false，需显式 --confirm
 * @returns {Promise<boolean>}
 */
function askConfirmation(promptText) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
      resolve(false);
      return;
    }
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, answer => {
      rl.close();
      resolve(String(answer).trim() === 'DELETE');
    });
  });
}

/**
 * 清空单个表单数据
 * @param {object} [opts] - { dryRun: boolean } dryRun 为 true 时仅统计不删除
 */
async function clearFormData(appId, formUuid, formName, isProcess, cookies, hostname, csrfToken, opts = {}) {
  const dryRun = opts.dryRun === true;
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
      return { success: true, deleted: 0, failed: 0, found: 0 };
    }

    // dry-run：仅统计，不执行任何删除与备份
    if (dryRun) {
      console.log(`   🔍 [dry-run] 将删除 ${ids.length} 条数据（未执行）`);
      return { success: true, deleted: 0, failed: 0, found: ids.length, dryRun: true };
    }

    // 备份：抓取每条记录的完整内容以支持还原
    const backupDir = path.join(PROJECT_ROOT, 'temp-file', 'data-backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const records = [];
    let contentComplete = true;
    const subFormLimited = !isProcess; // getFormDataById 不返回子表明细
    console.log(`   💾 正在备份 ${ids.length} 条记录内容...`);
    for (let i = 0; i < ids.length; i++) {
      const content = await fetchFormDataContent(appId, ids[i], isProcess, cookies, hostname, csrfToken);
      if (content === null) contentComplete = false;
      records.push({ dataId: ids[i], data: content });
      process.stdout.write(`   💾 备份中 ${i + 1}/${ids.length}\r`);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const restorable = contentComplete;
    const backupFile = path.join(backupDir, `${(formName || formUuid).replace(/[\/\\:*?"<>|]/g, '_')}_${new Date().toISOString().slice(0,10)}.json`);
    try {
      fs.writeFileSync(backupFile, JSON.stringify({
        appId,
        formUuid,
        formName,
        isProcess,
        backupTime: new Date().toISOString(),
        restorable,
        restoreNote: restorable
          ? (subFormLimited
              ? '本备份包含主表字段内容，可用于人工还原（通过 saveFormData 重新提交）；但普通表单的子表明细未包含在内，还原时需另行补录子表数据。'
              : '本备份包含流程实例详情内容，可用于人工还原（需通过发起流程 API 重新提交）。')
          : '⚠️ 部分或全部记录内容抓取失败，本备份不可完整还原，请谨慎。',
        count: records.length,
        records
      }, null, 2), 'utf-8');
      console.log(`\n   💾 已备份记录内容: ${backupFile}`);
      if (!restorable) {
        console.log(`   ⚠️  部分记录内容抓取失败，备份不可完整还原`);
      } else if (subFormLimited) {
        console.log(`   ℹ️  备份含主表字段；子表明细未包含，还原需补录`);
      }
    } catch (backupErr) {
      // 备份写入失败视为高风险，跳过该表单的删除操作
      console.log(`\n   ⚠️  备份失败: ${backupErr.message}`);
      console.log(`   🛑 因备份失败，已跳过该表单的删除操作`);
      return { success: false, deleted: 0, failed: 0, found: ids.length, backupFailed: true };
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
    appName: null,
    dryRun: false,
    confirm: false
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
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--confirm':
        options.confirm = true;
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
  console.log('        宜搭表单数据清空工具 v2.2.0');
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
    console.log('用法: node clear-form-data.js <应用ID> <--all|--form <uuid>|--forms <u1,u2>> [--dry-run|--confirm] [--appName 应用名称]');
    console.log('示例: node clear-form-data.js APP_XXXXXXXX --all --dry-run');
    console.log('示例: node clear-form-data.js APP_XXXXXXXX --all --confirm --appName AI宜搭场景');
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

  // 校验删除范围：必须显式指定 --all / --form / --forms（取消“无参数默认删除全部”）
  if (!options.all && !options.form && !options.forms) {
    console.error('\n❌ 未指定删除范围，已拒绝执行（不会删除任何数据）');
    console.log('   请显式指定以下之一：');
    console.log('     --all                  清空所有表单数据');
    console.log('     --form <formUuid>      清空指定表单数据');
    console.log('     --forms <uuid1,uuid2>  清空多个指定表单数据');
    console.log('   建议先加 --dry-run 预览，确认后再加 --confirm 执行删除。');
    process.exit(1);
  }

  // 确定要处理的表单列表
  let forms = [];

  if (options.all) {
    // 清空所有表单 - 优先从本地配置读取，否则从API获取
    forms = getFormsFromConfig(appId, options.appName);
    if (!forms) {
      console.log('📡 从宜搭API获取表单列表...');
      forms = await getFormsFromAPI(appId, cookieData.cookies, hostname, cookieData.csrfToken);
    }
    if (!forms || forms.length === 0) {
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
  }

  // ── dry-run：仅统计将删除的表单与条数，不执行任何删除 ──
  if (options.dryRun) {
    console.log('\n🔍 [dry-run] 预览模式：仅统计，不会删除任何数据\n');
    let totalFound = 0;
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      console.log(`[${i + 1}/${forms.length}]`);
      const result = await clearFormData(
        appId, form.uuid, form.name, form.isProcess,
        cookieData.cookies, hostname, cookieData.csrfToken,
        { dryRun: true }
      );
      totalFound += result.found || 0;
      if (i < forms.length - 1) await new Promise(resolve => setTimeout(resolve, 300));
    }
    console.log('\n═════════════════════════════');
    console.log('           [dry-run] 预览汇总');
    console.log('══════════════════════════════');
    console.log(`📋 将处理表单数: ${forms.length}`);
    console.log(`📊 将删除数据: ${totalFound} 条`);
    console.log('🛑 未执行任何删除。确认无误后，去掉 --dry-run 并添加 --confirm 执行。');
    console.log('══════════════════════════════\n');
    process.exit(0);
  }

  // ── 执行前确认闸门：必须 --confirm 或交互输入 DELETE ──
  console.log('\n⚠️  警告: 此操作将删除上述表单的全部数据，且不可逆！');
  console.log('💾 删除前会自动将记录内容备份到 temp-file/data-backup/');
  if (!options.confirm) {
    const confirmed = await askConfirmation('\n请输入 DELETE 以确认删除（或取消后加 --confirm 重试）: ');
    if (!confirmed) {
      console.log('\n🛑 未获确认，已取消操作。未删除任何数据。');
      console.log('   如需执行删除：先用 --dry-run 预览，确认后重新运行并添加 --confirm。');
      process.exit(0);
    }
  } else {
    console.log('✅ 已通过 --confirm 确认，开始执行...');
  }

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
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 执行出错:', error.message);
    process.exit(1);
  });
}
