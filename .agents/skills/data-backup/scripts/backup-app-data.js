/**
 * 宜搭应用数据备份脚本
 * 版本: 1.7.0
 * 功能: 备份指定应用中的所有表单数据，支持 JSON/Excel 格式，Excel 表头自动显示字段名称
 *       v1.6.0 新增 --forms 参数：只备份指定的表单（按 UUID，竖线分隔），不传则全量备份
 *       v1.7.0 (2026-10-27) 修复"导出全部成功但交付为零"事故：
 *         1. 同名表单去重——文件名与合并 Excel 的 sheet 名冲突时自动追加 UUID 末4位
 *            （此前两个同名"出口销售订单"导致 saveMergedExcel 抛 "Worksheet already exists!"）
 *         2. 合并/打包失败不再删光已生成的明细文件——只保留目录并如实上报 partial 状态
 *         3. Excel 单元格超 32767 字符时截断并标注，不再整表单保存失败
 *         4. 备份过程写 _progress.json 进度文件（供页面轮询实时显示），结束自动清理
 *
 * 使用方式:
 * node scripts/backup-app-data.js <应用ID> <应用名称> [format] [输出目录] [--forms=UUID1|UUID2]
 *
 * 示例:
 *   node scripts/backup-app-data.js APP_XXXXXXXX "AI宜搭场景"
 *   node scripts/backup-app-data.js APP_XXXXXXXX "AI宜搭场景" excel
 *   node scripts/backup-app-data.js APP_XXXXXXXX "AI宜搭场景" json --forms=FORM-AAA|FORM-BBB
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Phase 6: 引入 lib/core/utils 作为统一的 Cookie 加载实现
const coreUtils = require('../../../../lib/core/utils');

// v3.0.2 多项目隔离：PROJECT_ROOT 优先取 YIDA_PROJECT_ROOT（sync_server 注入的目标项目），
// Cookie 等数据必须跟随目标项目而不是脚本宿主项目
const SCRIPT_HOST_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PROJECT_ROOT = (process.env.YIDA_PROJECT_ROOT && fs.existsSync(process.env.YIDA_PROJECT_ROOT))
  ? process.env.YIDA_PROJECT_ROOT
  : SCRIPT_HOST_ROOT;
const COOKIE_FILE = path.join(PROJECT_ROOT, '.cookies.json');
let CURRENT_STAGING_DIR = null;
// v1.7.0: 备份进度文件（固定写入 数据备份/_progress.json，供 sync_server /backup-progress 读取）
let PROGRESS_FILE = null;

function writeProgress(progress) {
  if (!PROGRESS_FILE) return;
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }), 'utf-8');
  } catch (_) {} // 进度写入失败不影响备份本身
}

function clearProgress() {
  if (!PROGRESS_FILE) return;
  try { fs.rmSync(PROGRESS_FILE, { force: true }); } catch (_) {}
  PROGRESS_FILE = null;
}

/**
 * v1.7.0: 同名表单去重——为每个 key（表单UUID）生成唯一的文件名/sheet名。
 * 首个表单保留原名；撞名时追加「_UUID末4位」后缀（必要时再加大序号）。
 * maxLen > 0 时（Excel sheet 名上限 31）先截断再去重，避免截断后二次撞名。
 */
function dedupeNames(entries, maxLen = 0) {
  const used = new Set();
  const result = new Map();
  for (const { key, base } of entries) {
    let candidate = maxLen > 0 ? base.slice(0, maxLen) : base;
    if (!used.has(candidate)) {
      used.add(candidate);
      result.set(key, candidate);
      continue;
    }
    const suffix = `_${key.slice(-4)}`;
    let n = 1;
    let finalName;
    do {
      const tail = n === 1 ? suffix : `${suffix}${n}`;
      const head = maxLen > 0 ? base.slice(0, Math.max(1, maxLen - tail.length)) : base;
      finalName = head + tail;
      n++;
    } while (used.has(finalName));
    used.add(finalName);
    result.set(key, finalName);
  }
  return result;
}

function safeFormName(form) {
  return String(form.name || form.uuid || '未命名表单').replace(/[\/\\:*?"<>|]/g, '_');
}

// 加载 xlsx 库（从项目根目录 node_modules）
let XLSX;
try {
  XLSX = require(path.join(PROJECT_ROOT, 'node_modules', 'xlsx'));
} catch (e) {
  try {
    XLSX = require('xlsx');
  } catch (e2) {
    XLSX = null;
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
 * 发送GET请求
 */
function getRequest(hostname, reqPath, cookies, csrfToken) {
  return new Promise((resolve, reject) => {
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
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
      // Buffer 收集统一解码，防 chunk 边界撕碎中文字符
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
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
 * 从系统配置清单获取真实appId
 */
function getAppIdFromConfig(appName) {
  if (appName) {
    const directPath = path.join(PROJECT_ROOT, appName, '系统配置清单.md');
    if (fs.existsSync(directPath)) {
      const content = fs.readFileSync(directPath, 'utf-8');
      const match = content.match(/#\s+.+?\(APP_[A-Z0-9]+\)/);
      if (match) {
        const idMatch = match[0].match(/(APP_[A-Z0-9]+)/);
        if (idMatch) return idMatch[1];
      }
      const tableMatch = content.match(/\|\s*\*?\*?应用ID\*?\*?\s*\|\s*(APP_[A-Z0-9]+)\s*\|/);
      if (tableMatch) return tableMatch[1];
    }
  }
  return null;
}

/**
 * 从系统配置清单获取表单列表
 */
function getFormsFromConfig(appId, appName) {
  if (appName) {
    const directPath = path.join(PROJECT_ROOT, appName, '系统配置清单.md');
    if (fs.existsSync(directPath)) {
      const content = fs.readFileSync(directPath, 'utf-8');
      if (content.includes(appId)) {
        return parseFormsFromConfig(content);
      }
      const forms = parseFormsFromConfig(content);
      if (forms && forms.length > 0) return forms;
    }
  }

  const configPath = path.join(PROJECT_ROOT, '系统配置清单.md');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    if (content.includes(appId)) return parseFormsFromConfig(content);
  }

  try {
    const dirs = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const subConfigPath = path.join(PROJECT_ROOT, dir.name, '系统配置清单.md');
      if (fs.existsSync(subConfigPath)) {
        const content = fs.readFileSync(subConfigPath, 'utf-8');
        if (content.includes(appId)) return parseFormsFromConfig(content);
      }
    }
  } catch (_) {} // 有意忽略：配置文件可能不存在或格式无效
}

function parseFormsFromConfig(configContent) {
  const forms = [];
  const lines = configContent.split('\n');
  for (const line of lines) {
    const match = line.match(/\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(FORM-[\w-]+)\s*\|\s*(.*?)\s*\|/);
    if (match && match[2] && match[2].startsWith('FORM-')) {
      const rawName = match[1].trim();
      const formName = rawName.replace(/「.+?」$/, '').trim() || rawName;
      const formUuid = match[2];
      const processCode = match[3] ? match[3].trim() : '';
      const isProcess = processCode !== '' && processCode !== '-';
      forms.push({ name: formName, uuid: formUuid, isProcess });
    }
  }
  return forms.length > 0 ? forms : null;
}

function getProjectDir(appName) {
  if (!appName) return PROJECT_ROOT;
  const directPath = path.join(PROJECT_ROOT, appName);
  return fs.existsSync(directPath) ? directPath : PROJECT_ROOT;
}

function normalizeFieldName(name) {
  return String(name || '').replace(/「.+?」$/, '').trim();
}

function addFieldMapping(map, fieldId, fieldName) {
  const cleanFieldId = String(fieldId || '').trim().replace(/\\_/g, '_');
  const cleanFieldName = normalizeFieldName(fieldName);
  if (cleanFieldId && cleanFieldName && !map[cleanFieldId]) {
    map[cleanFieldId] = cleanFieldName;
  }
}

function loadFieldMappingsFromJsFile(map, filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const fieldRegex = /"fieldName"\s*:\s*"([^"]+)"[\s\S]*?"fieldId"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = fieldRegex.exec(content)) !== null) {
    addFieldMapping(map, match[2], match[1]);
  }
}

function loadFieldMappingsFromMarkdownFile(map, filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  const componentRegex = /\|\s*([^|\n]+?)\s*\|[^|\n]*\|\s*组件ID[:：]\s*([^|\n]+?)\s*\|/g;
  let match;
  while ((match = componentRegex.exec(content)) !== null) {
    addFieldMapping(map, match[2], match[1]);
  }

  const idListRegex = /\|\s*\d+(?:\.\d+)?\s*\|\s*[^|\n]+\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|/g;
  while ((match = idListRegex.exec(content)) !== null) {
    const fieldName = match[1].trim();
    const fieldId = match[2].trim();
    if (/^[a-zA-Z]+Field_[\w-]+$/.test(fieldId) || /^serialNumberField_[\w-]+$/.test(fieldId)) {
      addFieldMapping(map, fieldId, fieldName);
    }
  }
}

function collectFilesByName(rootDir, fileName, results = []) {
  if (!fs.existsSync(rootDir)) return results;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', '.git', '.agents', '03项目交付物', 'temp-file'].includes(entry.name)) continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesByName(fullPath, fileName, results);
    } else if (entry.isFile() && entry.name === fileName) {
      results.push(fullPath);
    }
  }
  return results;
}

function loadFieldNameMap(appName) {
  const map = {};
  const projectDir = getProjectDir(appName);

  loadFieldMappingsFromJsFile(map, path.join(projectDir, '01需求梳理', '原型页面', 'js', 'form-config-data.js'));
  loadFieldMappingsFromJsFile(map, path.join(projectDir, '01需求梳理', '原型页面', 'js', 'form-config.js'));
  loadFieldMappingsFromMarkdownFile(map, path.join(projectDir, '01需求梳理', '字段清单.md'));

  for (const filePath of collectFilesByName(projectDir, '组件ID清单.md')) {
    loadFieldMappingsFromMarkdownFile(map, filePath);
  }

  return map;
}

function getExportFieldName(fieldNameMap, fieldId) {
  return fieldNameMap[fieldId] || fieldId;
}

function setFlatValue(flat, key, value) {
  if (!Object.prototype.hasOwnProperty.call(flat, key)) {
    flat[key] = value;
    return;
  }

  let index = 2;
  let nextKey = `${key}_${index}`;
  while (Object.prototype.hasOwnProperty.call(flat, nextKey)) {
    index++;
    nextKey = `${key}_${index}`;
  }
  flat[nextKey] = value;
}

/**
 * 从宜搭API获取表单列表
 */
async function getFormsFromAPI(appId, cookies, hostname, csrfToken) {
  const forms = [];
  const apiPath = `/dingtalk/web/${appId}/query/formdesign/getFormList.json`;

  try {
    const result = await getRequest(hostname, apiPath, cookies, csrfToken);
    if (!result?.success) return forms;

    let formList = [];
    if (result.content) {
      if (Array.isArray(result.content)) formList = result.content;
      else if (result.content.list && Array.isArray(result.content.list)) formList = result.content.list;
      else if (result.content.data && Array.isArray(result.content.data)) formList = result.content.data;
      else if (result.content.forms && Array.isArray(result.content.forms)) formList = result.content.forms;
    }

    for (const form of formList) {
      if (!form || typeof form !== 'object') continue;
      const formName = form.title?.zh_CN || form.name || form.formName || '未命名表单';
      const formUuid = form.formUuid;
      const processCode = form.processCode || '';
      const isProcess = form.formType === 'process' || (processCode !== '' && processCode !== null);
      if (formUuid) {
        forms.push({ name: formName, uuid: formUuid, isProcess });
      }
    }
  } catch (_) {} // 有意忽略：HTML 解析失败时返回空列表
}

/**
 * 查询普通表单完整数据
 */
async function searchNormalFormDatas(appId, formUuid, cookies, hostname, csrfToken) {
  const allData = [];
  let currentPage = 1;
  const pageSize = 100;

  while (true) {
    const reqPath = `/dingtalk/web/${appId}/v1/form/searchFormDatas.json?formUuid=${formUuid}&pageSize=${pageSize}&currentPage=${currentPage}`;
    const result = await getRequest(hostname, reqPath, cookies, csrfToken);

    if (!result.success) {
      console.log(`   ⚠️ API返回失败: ${result.errorMsg || result.message || JSON.stringify(result).slice(0,200)}`);
      break;
    }

    const data = Array.isArray(result.data) ? result.data : (result.content && Array.isArray(result.content.data) ? result.content.data : []);

    if (data.length === 0) break;
    allData.push(...data);
    if (data.length < pageSize) break;
    currentPage++;
  }

  return allData;
}

/**
 * 查询流程表单实例数据
 */
async function searchProcessFormDatas(appId, formUuid, cookies, hostname, csrfToken) {
  const normalData = await searchNormalFormDatas(appId, formUuid, cookies, hostname, csrfToken);
  if (normalData.length > 0) {
    return normalData;
  }

  const allData = [];
  let currentPage = 1;
  const pageSize = 100;

  while (true) {
    const reqPath = `/dingtalk/web/${appId}/v1/process/getInstanceIds.json?formUuid=${formUuid}&pageSize=${pageSize}&currentPage=${currentPage}`;
    const result = await getRequest(hostname, reqPath, cookies, csrfToken);

    if (!result.success) {
      console.log(`   ⚠️ 流程API返回失败: ${result.errorMsg || result.message || JSON.stringify(result).slice(0,200)}`);
      break;
    }

    const ids = Array.isArray(result.data) ? result.data : (result.content && Array.isArray(result.content.data) ? result.content.data : []);
    if (ids.length === 0) break;

    for (const id of ids) {
      allData.push({ processInstanceId: id });
    }

    if (ids.length < pageSize) break;
    currentPage++;
  }

  return allData;
}

/**
 * 查询单个表单数据（返回数据，不写文件）
 */
async function fetchFormData(appId, form, cookies, hostname, csrfToken) {
  console.log(`\n📋 备份表单: ${form.name} (${form.uuid})`);

  let data = [];
  let errorMsg = null;

  try {
    if (form.isProcess) {
      data = await searchProcessFormDatas(appId, form.uuid, cookies, hostname, csrfToken);
    } else {
      data = await searchNormalFormDatas(appId, form.uuid, cookies, hostname, csrfToken);
    }
    console.log(`   📊 共找到 ${data.length} 条数据`);
  } catch (error) {
    console.log(`   ❌ 错误: ${error.message}`);
    errorMsg = error.message;
  }

  return { success: !errorMsg, count: data.length, error: errorMsg, data };
}

/**
 * 将单条宜搭记录平铺为对象（方便 Excel/JSON 阅读）
 */
function flattenRecord(record, fieldNameMap = {}) {
  const flat = {};

  // 系统字段
  if (record.formInstId) flat['实例ID'] = record.formInstId;
  if (record.processInstanceId) flat['流程实例ID'] = record.processInstanceId;
  if (record.title) flat['标题'] = record.title;
  if (record.formUuid) flat['表单UUID'] = record.formUuid;
  if (record.originator?.name?.zh_CN) flat['提交人'] = record.originator.name.zh_CN;
  if (record.creator) flat['创建人ID'] = record.creator;
  if (record.gmtCreate) flat['创建时间'] = formatTimestamp(record.gmtCreate);
  if (record.gmtModified) flat['修改时间'] = formatTimestamp(record.gmtModified);

  // 业务字段（formData）
  const formData = record.formData || {};
  for (const [key, value] of Object.entries(formData)) {
    setFlatValue(flat, getExportFieldName(fieldNameMap, key), formatValue(value));
  }

  // 子表字段（tableField）
  if (record.children && Array.isArray(record.children)) {
    flat['_子表数量'] = record.children.length;
  }

  return flat;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(typeof ts === 'string' ? parseInt(ts, 10) : ts);
  if (isNaN(date.getTime())) return String(ts);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // 如果是数组且元素简单，拼接
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(',');
    }
    // 对象优先取 text/value/label
    if (value.text !== undefined) return String(value.text);
    if (value.value !== undefined) return String(value.value);
    if (value.label !== undefined) return String(value.label);
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * 保存为 JSON 文件
 * v1.7.0: uniqueName = 去重后的唯一文件名（同名表单不再互相覆盖）
 */
function saveJsonFile(outputDir, form, recordCount, data, errorMsg, uniqueName) {
  const safeName = uniqueName || safeFormName(form);
  const outputFile = path.join(outputDir, `${safeName}.json`);
  const backupContent = {
    appId: form.appId,
    formUuid: form.uuid,
    formName: form.name,
    isProcess: form.isProcess,
    recordCount,
    backupTime: new Date().toISOString(),
    backupStatus: errorMsg ? 'failed' : 'success',
    ...(errorMsg && { backupError: errorMsg }),
    data
  };
  fs.writeFileSync(outputFile, JSON.stringify(backupContent, null, 2), 'utf-8');
  console.log(`   💾 已保存 JSON: ${outputFile} (${recordCount} 条)`);
}

// v1.7.0: Excel 单元格文本上限 32767 字符，超长截断并标注（此前整表单保存失败）
const EXCEL_CELL_MAX = 32767;
const TRUNCATE_MARKER = '…【文本超长已截断，完整数据请用JSON格式备份】';

function truncateRowForExcel(row) {
  const out = {};
  let truncated = 0;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.length > EXCEL_CELL_MAX) {
      out[k] = v.slice(0, EXCEL_CELL_MAX - TRUNCATE_MARKER.length) + TRUNCATE_MARKER;
      truncated++;
    } else {
      out[k] = v;
    }
  }
  return { row: out, truncated };
}

/**
 * 保存为 Excel 文件
 * v1.7.0: uniqueName 去重；超长文本截断并返回截断单元格数
 */
function saveExcelFile(outputDir, form, recordCount, data, errorMsg, fieldNameMap = {}, uniqueName) {
  if (!XLSX) {
    throw new Error('xlsx 库未安装，无法导出 Excel');
  }

  const safeName = uniqueName || safeFormName(form);
  const outputFile = path.join(outputDir, `${safeName}.xlsx`);

  let rows = [];
  if (!errorMsg && data.length > 0) {
    rows = data.map(record => flattenRecord(record, fieldNameMap));
  } else if (errorMsg) {
    rows = [{ '备份状态': 'failed', '错误信息': errorMsg }];
  }

  let truncatedCells = 0;
  rows = rows.map(row => {
    const t = truncateRowForExcel(row);
    truncatedCells += t.truncated;
    return t.row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeName.slice(0, 31));
  XLSX.writeFile(wb, outputFile);
  console.log(`   💾 已保存 Excel: ${outputFile} (${recordCount} 条)${truncatedCells > 0 ? `，⚠️ ${truncatedCells} 个单元格超长已截断` : ''}`);
  return truncatedCells;
}

/**
 * 保存所有表单数据到一个合并 Excel（多 sheet）
 */
function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function saveMergedExcel(outputDir, appName, allFormResults, fieldNameMap = {}) {
  if (!XLSX) return null;

  const outputFile = path.join(outputDir, `_全部表单汇总.xlsx`);
  const wb = XLSX.utils.book_new();

  // v1.7.0: sheet 名先按 31 字符上限截断、再跨表单去重（同名表单此前直接抛
  // "Worksheet with name |xxx| already exists!" 导致整个备份交付为零）
  const sheetNames = dedupeNames(
    allFormResults.map(r => ({ key: r.form.uuid, base: safeFormName(r.form) })),
    31
  );

  for (const result of allFormResults) {
    const sheetName = sheetNames.get(result.form.uuid) || safeFormName(result.form).slice(0, 31);
    let rows = [];
    if (!result.error && result.data.length > 0) {
      rows = result.data.map(record => flattenRecord(record, fieldNameMap));
    } else if (result.error) {
      rows = [{ '备份状态': 'failed', '错误信息': result.error }];
    }
    rows = rows.map(row => truncateRowForExcel(row).row);
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, outputFile);
  console.log(`   💾 已保存合并 Excel: ${outputFile}`);
  return outputFile;
}

/**
 * 生成备份目录（日期+流水号，如 2026-06-17_001）
 */
function generateBackupDir(baseBackupDir, appName) {
  const today = new Date().toISOString().slice(0, 10);
  let seq = 1;

  if (fs.existsSync(baseBackupDir)) {
    const entries = fs.readdirSync(baseBackupDir, { withFileTypes: true });
    for (const entry of entries) {
      const dirMatch = entry.isDirectory() ? entry.name.match(new RegExp(`^${today}_(\\d{3})$`)) : null;
      const zipMatch = entry.isFile() ? entry.name.match(new RegExp(`^${escapeRegExp(appName)}_${today}_(\\d{3})\\.zip$`)) : null;
      const match = dirMatch || zipMatch;
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= seq) seq = num + 1;
      }
    }
  }

  const timestamp = `${today}_${String(seq).padStart(3, '0')}`;
  return {
    outputDir: path.join(baseBackupDir, timestamp),
    timestamp
  };
}

/**
 * 将备份目录打包为zip
 */
function createZipBackup(baseBackupDir, appName, timestamp, stagingDir) {
  const zipFileName = `${appName}_${timestamp}.zip`;
  const zipFilePath = path.join(baseBackupDir, zipFileName);
  if (fs.existsSync(zipFilePath)) {
    throw new Error(`备份压缩包已存在，避免覆盖: ${zipFilePath}`);
  }

  try {
    const psCmd = `Compress-Archive -Path "${stagingDir}\\*" -DestinationPath "${zipFilePath}" -Force`;
    execSync(`powershell -Command "${psCmd}"`, { windowsHide: true, timeout: 60000 });
    console.log(`📦 已打包: ${zipFilePath}`);
    return zipFilePath;
  } catch (e1) {
    console.log(`   ⚠️ PowerShell打包失败: ${e1.message}`);
    try {
      const sevenZipCmd = `7z a -tzip "${zipFilePath}" "${stagingDir}\\*"`;
      execSync(sevenZipCmd, { windowsHide: true, timeout: 60000 });
      console.log(`📦 已打包(7z): ${zipFilePath}`);
      return zipFilePath;
    } catch (e2) {
      console.log(`   ⚠️ 7z打包也失败，跳过压缩`);
      return null;
    }
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const appId = args[0];
  const appName = args[1];

  // 兼容两种参数顺序：
  //   1) node backup-app-data.js <appId> <appName> [format] [outputDir]
  //   2) node backup-app-data.js <appId> <appName> [outputDir] [format]
  let format = 'json';
  let customOutputDir = '';
  // v1.6.0: --forms=UUID1|UUID2 指定只备份这些表单（不传则全量备份）
  let selectedFormUuids = null;
  for (let i = 2; i < args.length; i++) {
    const rawArg = args[i];
    if (rawArg.startsWith('--forms=')) {
      selectedFormUuids = rawArg.slice('--forms='.length).split('|')
        .map(s => s.trim())
        .filter(Boolean);
      continue;
    }
    const arg = rawArg.toLowerCase();
    if (arg === 'json' || arg === 'excel') {
      format = arg;
    } else if (!customOutputDir && rawArg) {
      customOutputDir = rawArg;
    }
  }

  if (!appId || !appName) {
    console.error('❌ 参数不足！');
    console.log('用法: node backup-app-data.js <应用ID> <应用名称> [format] [输出目录]');
    console.log('format: json 或 excel，默认 json');
    process.exit(1);
  }

  if (!['json', 'excel'].includes(format)) {
    console.error(`❌ 不支持的格式: ${format}，仅支持 json 或 excel`);
    process.exit(1);
  }

  if (format === 'excel' && !XLSX) {
    console.error('❌ Excel 导出需要 xlsx 库，请先运行 npm install xlsx');
    process.exit(1);
  }

  // 清理转义
  let cleanAppId = appId.replace(/\\([\\`*_{}[\]()#+\-.!~|])/g, '$1');

  // 如果appId无效，尝试从系统配置清单中读取真实appId
  if (cleanAppId === '待创建' || !cleanAppId.startsWith('APP_')) {
    console.log(`⚠️ 传入的appId为 "${cleanAppId}"，尝试从系统配置清单获取真实appId...`);
    const realAppId = getAppIdFromConfig(appName);
    if (realAppId) {
      console.log(`✅ 从系统配置清单获取到真实appId: ${realAppId}`);
      cleanAppId = realAppId;
    } else {
      console.log(`⚠️ 未找到真实appId，仍尝试备份...`);
    }
  }

  console.log('═══════════════════════════════════════════');
  console.log(`        宜搭应用数据备份工具 v1.6.0 [${format.toUpperCase()}]`);
  console.log('═══════════════════════════════════════════\n');

  // 加载Cookie
  let cookieData;
  try {
    cookieData = loadCookies();
    console.log(`✅ Cookie加载成功`);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }

  const hostname = cookieData.baseUrl.replace('https://', '');

  // 获取表单列表
  let forms = getFormsFromConfig(cleanAppId, appName);
  if (!forms) {
    console.log('📡 从宜搭API获取表单列表...');
    forms = await getFormsFromAPI(cleanAppId, cookieData.cookies, hostname, cookieData.csrfToken);
  }

  if (!forms || forms.length === 0) {
    console.log('⚠️  未找到任何表单');
    process.exit(1);
  }

  // v1.6.0: 按 --forms 指定的 UUID 过滤（部分备份模式）
  let selectedCount = 0;
  if (selectedFormUuids && selectedFormUuids.length > 0) {
    const uuidSet = new Set(selectedFormUuids);
    const before = forms.length;
    const filtered = forms.filter(f => uuidSet.has(f.uuid));
    const missing = selectedFormUuids.filter(u => !filtered.some(f => f.uuid === u));
    if (missing.length > 0) {
      console.log(`⚠️ 以下 ${missing.length} 个指定表单未在表单列表中找到，已跳过: ${missing.join(', ')}`);
    }
    if (filtered.length === 0) {
      console.log('❌ 指定的表单均未匹配到，请检查表单 UUID');
      process.exit(1);
    }
    selectedCount = filtered.length;
    console.log(`🎯 指定备份模式: ${selectedCount}/${before} 个表单`);
    forms.length = 0;
    forms.push(...filtered);
  }

  const fieldNameMap = loadFieldNameMap(appName);

  console.log(`\n🎯 目标应用: ${appName} (${cleanAppId})`);
  console.log(`📋 表单数量: ${forms.length} 个`);
  console.log(`📄 输出格式: ${format.toUpperCase()}`);
  console.log(`🏷️ 字段名称映射: ${Object.keys(fieldNameMap).length} 个\n`);

  // 创建临时目录（日期+流水号，如 2026-06-17_001），最终只保留根目录下的zip
  const baseBackupDir = customOutputDir ? path.resolve(customOutputDir) : path.join(PROJECT_ROOT, appName, '03项目交付物', '数据备份');
  if (!fs.existsSync(baseBackupDir)) {
    fs.mkdirSync(baseBackupDir, { recursive: true });
  }
  const { outputDir: stagingDir, timestamp } = generateBackupDir(baseBackupDir, appName);
  CURRENT_STAGING_DIR = stagingDir;
  fs.mkdirSync(stagingDir, { recursive: true });
  console.log(`📁 备份目录: ${baseBackupDir}\n`);

  // v1.7.0: 进度文件固定放 数据备份/_progress.json（sync_server /backup-progress 按此路径读取）
  PROGRESS_FILE = path.join(baseBackupDir, '_progress.json');
  writeProgress({ phase: 'fetching', current: 0, total: forms.length, formName: '', format });

  // v1.7.0: 预生成唯一文件名映射（同名表单追加 _UUID末4位，不再互相覆盖）
  const uniqueFileNames = dedupeNames(forms.map(f => ({ key: f.uuid, base: safeFormName(f) })));

  // 逐个备份
  let totalRecords = 0;
  let successForms = 0;
  let failForms = 0;
  const formResults = [];
  const allFormData = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    console.log(`[${i + 1}/${forms.length}]`);
    writeProgress({ phase: 'backuping', current: i + 1, total: forms.length, formName: form.name, format });

    const result = await fetchFormData(
      cleanAppId,
      form,
      cookieData.cookies,
      hostname,
      cookieData.csrfToken
    );

    // 保存文件
    let truncatedCells = 0;
    try {
      if (format === 'json') {
        saveJsonFile(stagingDir, form, result.count, result.data, result.error, uniqueFileNames.get(form.uuid));
      } else {
        truncatedCells = saveExcelFile(stagingDir, form, result.count, result.data, result.error, fieldNameMap, uniqueFileNames.get(form.uuid));
      }
      allFormData.push({ form, ...result });
    } catch (saveError) {
      console.log(`   ❌ 保存文件失败: ${saveError.message}`);
      result.success = false;
      result.error = saveError.message;
    }

    formResults.push({
      name: form.name,
      uuid: form.uuid,
      isProcess: form.isProcess,
      success: result.success,
      recordCount: result.count,
      error: result.error || null,
      file: uniqueFileNames.get(form.uuid) || null,
      truncatedCells
    });

    if (result.success) {
      totalRecords += result.count;
      successForms++;
    } else {
      failForms++;
    }

    // 表单间延迟
    if (i < forms.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // v1.7.0: 汇总先落盘——后面合并/打包再崩，统计也已保存
  const summary = {
    appId: cleanAppId,
    appName,
    backupTime: new Date().toISOString(),
    outputDir: baseBackupDir,
    format,
    backupMode: selectedCount > 0 ? 'selected' : 'all',
    selectedForms: selectedCount > 0 ? selectedCount : null,
    totalForms: forms.length,
    successForms,
    failForms,
    totalRecords,
    forms: formResults
  };
  fs.writeFileSync(path.join(stagingDir, '_backup_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  // v1.7.0: 合并 Excel 失败不再致命——明细文件已全部生成，保留并如实上报
  let mergedExcelPath = null;
  let mergedError = null;
  if (format === 'excel' && allFormData.length > 0) {
    writeProgress({ phase: 'merging', current: forms.length, total: forms.length, formName: '', format });
    console.log(`\n📊 正在生成合并 Excel...`);
    try {
      mergedExcelPath = saveMergedExcel(stagingDir, appName, allFormData, fieldNameMap);
    } catch (mergeError) {
      mergedError = mergeError.message;
      console.log(`   ⚠️ 合并 Excel 失败（不影响已生成的单表单文件）: ${mergedError}`);
    }
  }

  // v1.7.0: 打包失败保留明细目录，不再删光交付物
  writeProgress({ phase: 'zipping', current: forms.length, total: forms.length, formName: '', format });
  console.log(`\n📦 正在打包备份文件...`);
  const zipPath = createZipBackup(baseBackupDir, appName, timestamp, stagingDir);
  let stagingKept = false;
  if (zipPath) {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      CURRENT_STAGING_DIR = null;
    } catch (cleanupError) {
      console.log(`   ⚠️ 清理临时目录失败（明细文件保留在: ${stagingDir}）: ${cleanupError.message}`);
      stagingKept = true;
    }
  } else {
    stagingKept = true;
    console.log(`   ⚠️ 压缩包未生成，全部明细文件已保留在: ${stagingDir}`);
  }

  const partial = Boolean(mergedError || !zipPath);
  console.log('\n═══════════════════════════════════════════');
  console.log('              备份完成汇总');
  console.log('═══════════════════════════════════════════');
  console.log(`📊 表单总数: ${forms.length}`);
  console.log(`✅ 成功备份: ${successForms} 个表单`);
  console.log(`❌ 备份失败: ${failForms} 个表单`);
  console.log(`📝 数据记录: ${totalRecords} 条`);
  console.log(`📁 文件目录: ${baseBackupDir}`);
  if (mergedError) {
    console.log(`⚠️ 合并Excel: 失败（${mergedError}），单表单文件不受影响`);
  } else if (mergedExcelPath && zipPath) {
    console.log(`📊 合并Excel: 已打包到压缩包内`);
  }
  if (zipPath) {
    console.log(`📦 压缩包: ${zipPath}`);
  }
  console.log('═══════════════════════════════════════════\n');

  // 输出结果给调用方（sync_server）
  console.log(JSON.stringify({
    success: true,
    outputDir: baseBackupDir,
    zipPath,
    keptDir: stagingKept ? stagingDir : null,
    partial,
    warnings: [
      ...(mergedError ? [`合并Excel失败: ${mergedError}`] : []),
      ...(!zipPath ? ['zip打包失败，已保留明细文件目录'] : []),
      ...(failForms > 0 ? [`${failForms} 个表单导出失败，详见备份汇总`] : [])
    ],
    mergedExcelPath: zipPath && mergedExcelPath ? 'packed' : (mergedExcelPath ? stagingDir : null),
    format,
    backupMode: selectedCount > 0 ? 'selected' : 'all',
    totalRecords,
    totalForms: forms.length,
    successForms,
    failForms
  }));
  clearProgress();
}

if (require.main === module) {
  main().catch(error => {
    if (CURRENT_STAGING_DIR && fs.existsSync(CURRENT_STAGING_DIR)) {
      try {
        fs.rmSync(CURRENT_STAGING_DIR, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('⚠️ 清理临时目录失败:', cleanupError.message);
      }
    }
    console.error('❌ 执行出错:', error.message);
    console.log(JSON.stringify({ success: false, error: error.message }));
    clearProgress();
    process.exit(1);
  });
}
