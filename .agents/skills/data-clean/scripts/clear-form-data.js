/**
 * 宜搭表单数据清空脚本
 * 版本: 1.0.0
 * 功能: 清空指定应用中的表单数据（保留表单结构）
 *
 * 使用方式:
 * node scripts/clear-form-data.js [应用ID] [选项]
 *
 * 选项:
 *   --all                    清空所有表单数据
 *   --form <formUuid>        清空指定表单数据
 *   --forms <uuid1,uuid2>    清空多个指定表单数据（逗号分隔）
 *
 * 示例:
 *   node scripts/clear-form-data.js APP_XXXXXXXX --all
 *   node scripts/clear-form-data.js APP_XXXXXXXX --form FORM-XXXXXXXX
 *   node scripts/clear-form-data.js APP_XXXXXXXX --forms FORM-XXX,FORM-YYY
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
 * 发送GET请求
 */
function getRequest(hostname, path, cookies) {
  return new Promise((resolve, reject) => {
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const options = {
      hostname: hostname,
      port: 443,
      path: path,
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
async function searchNormalFormDataIds(appId, formUuid, cookies, hostname) {
  const allIds = [];
  let currentPage = 1;
  const pageSize = 100;

  while (true) {
    const path = `/dingtalk/web/${appId}/v1/form/searchFormDataIds.json?formUuid=${formUuid}&pageSize=${pageSize}&currentPage=${currentPage}`;
    const result = await getRequest(hostname, path, cookies);

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
async function searchProcessFormDataIds(appId, formUuid, cookies, hostname) {
  const allIds = [];
  let currentPage = 1;
  const pageSize = 100;

  while (true) {
    const path = `/dingtalk/web/${appId}/v1/process/getInstanceIds.json?formUuid=${formUuid}&pageSize=${pageSize}&currentPage=${currentPage}`;
    const result = await getRequest(hostname, path, cookies);

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
      ids = await searchProcessFormDataIds(appId, formUuid, cookies, hostname);
    } else {
      ids = await searchNormalFormDataIds(appId, formUuid, cookies, hostname);
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
    forms: null
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
    }
  }

  return options;
}

/**
 * 从系统配置清单获取表单列表
 */
function getFormsFromConfig() {
  // 默认表单配置列表
  return [
    { name: '机构信息', uuid: 'FORM-67AA628B3F6C49D8A4BE4DCE3B2FAE79QCKX', isProcess: false },
    { name: '客户信息', uuid: 'FORM-780C20608B744CD1984D84E79CD7261CMI8F', isProcess: false },
    { name: '估价师信息', uuid: 'FORM-00F392CB925E493EA44CB94ED7E8B9805WYX', isProcess: false },
    { name: '案例库', uuid: 'FORM-3271CF884E2F489E95CE8EF075C9DEF9PHE4', isProcess: true },
    { name: '主项目信息', uuid: 'FORM-4FB0170F71064D8FA5B2F6C888C76BC9QND1', isProcess: false },
    { name: '项目立项', uuid: 'FORM-A9704AF7675B40BA9BE8054D9980C0FA3C82', isProcess: true },
    { name: '项目终止', uuid: 'FORM-41DA5F270EE7424DA8B89EE2FC771ACBR7OJ', isProcess: true },
    { name: '评定估算', uuid: 'FORM-595332A2976F42BFA57272CDAF55CB2DESXA', isProcess: true },
    { name: '合同申请', uuid: 'FORM-DB1757DA55734B75B7EA08BED82882B3T2LM', isProcess: true },
    { name: '合同修改', uuid: 'FORM-7DEE9223C5E9455D985AB19B1AE5AC3BWPV0', isProcess: true },
    { name: '合同作废', uuid: 'FORM-1518D9A952F64A788E68C36E958F91EAJHKW', isProcess: true },
    { name: '报告审核', uuid: 'FORM-6D1867D6B7EB448EBA92DC6D0529FF8DDSDE', isProcess: true },
    { name: '报告盖章', uuid: 'FORM-DBA49A3F2DE5420C9E1C75EB8A77223AS6XD', isProcess: true },
    { name: '报告修改', uuid: 'FORM-5CD911DAAE754C27AC3A81D65A9AE878MHKG', isProcess: true },
    { name: '报告加出', uuid: 'FORM-6C6B60CE28F14E7DA22E74799B05CD16W9H5', isProcess: true },
    { name: '报告相关盖章', uuid: 'FORM-2A8A46E09C2244D4BC2A2123545AF9EDAZ64', isProcess: true },
    { name: '报告归档', uuid: 'FORM-AB0D848228A24ACEBF6DCA4B81BE4A9DC8QJ', isProcess: true },
    { name: '考勤同步', uuid: 'FORM-2DA8DDD060D44CF8A712B844399469C2RVHX', isProcess: false },
    { name: '绩效核算', uuid: 'FORM-640C20DFE150474F9B3609FC3510832455D1', isProcess: true },
    { name: '费用报销', uuid: 'FORM-BE97B0B3C3934CF5A60E8D7C2CCA60C9IN3O', isProcess: true },
    { name: '项目结算', uuid: 'FORM-D0081B2D29FD488194B94B0CE37975E9TTG4', isProcess: true },
    { name: '收款登记', uuid: 'FORM-54EB9DA8E0BF41C48A40286A4CC67C28C007', isProcess: true },
    { name: '退款登记', uuid: 'FORM-2702DB0721E8404FA7F1DB68287BF79FQ0N1', isProcess: true },
    { name: '开票登记', uuid: 'FORM-BFA4A9499F354371BA5BE99CFC080820N3T6', isProcess: true },
    { name: '退票登记', uuid: 'FORM-D3045F0F846A429AB8256C95B850842BR8AC', isProcess: true }
  ];
}

/**
 * 主函数
 */
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('        宜搭表单数据清空工具 v1.0.0');
  console.log('═══════════════════════════════════════════\n');

  // 解析参数
  const options = parseArgs();

  // 获取应用ID
  const appId = options.appId || 'APP_FDK8IG9UIDEFV2PTPDYL';

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
    // 清空所有表单
    forms = getFormsFromConfig();
    console.log(`\n🎯 目标应用: ${appId}`);
    console.log(`📋 清空范围: 所有表单 (${forms.length} 个)`);
  } else if (options.form) {
    // 清空指定表单
    forms = [{ name: options.form, uuid: options.form, isProcess: false }];
    console.log(`\n🎯 目标应用: ${appId}`);
    console.log(`📋 清空范围: 指定表单 (${options.form})`);
  } else if (options.forms) {
    // 清空多个指定表单
    forms = options.forms.map(uuid => ({ name: uuid, uuid: uuid, isProcess: false }));
    console.log(`\n🎯 目标应用: ${appId}`);
    console.log(`📋 清空范围: 指定表单 (${options.forms.length} 个)`);
  } else {
    // 默认清空所有表单
    forms = getFormsFromConfig();
    console.log(`\n🎯 目标应用: ${appId}`);
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
