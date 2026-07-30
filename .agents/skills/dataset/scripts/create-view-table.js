#!/usr/env node
/**
 * create-view-table.js  —— 通用视图表创建脚本（配置驱动，无硬编码）
 *
 * 特点：
 *   1. 所有可变参数（应用、表单、关联、字段、名称）全部来自外部 JSON 配置
 *   2. 支持 1 个主表 + 任意多个关联表（不再写死 2 个）
 *   3. 关联表的字段也可作为视图表输出字段（这是相对 v4 版的关键增强）
 *   4. 通过「配置文件」即可复用到任何应用、任何场景，无需改代码
 *
 * 用法：
 *   node create-view-table.js <配置JSON路径> [--dry-run] [--appType=xxx] [--name=xxx]
 *
 *   --dry-run     只解析配置 + 构建字段并打印，不发任何 HTTP 请求（用于校验配置）
 *   --appType=    覆盖配置里的 appType
 *   --name=       覆盖配置里的 cubeName
 *
 * 配置文件格式见同目录 viewtable.config.example.json
 */

'use strict';

const path = require('path');
const fs = require('fs');
const querystring = require('querystring');
const https = require('https');

// Phase 6: Cookie 加载统一委托给 lib/core/utils
const coreUtils = require('../../../../lib/core/utils');

// ── 参数解析 ──────────────────────────────────────────
function parseArgs(argv) {
  const out = { config: null, dryRun: false, appType: null, name: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--appType=')) out.appType = a.split('=')[1];
    else if (a.startsWith('--name=')) out.name = a.split('=')[1];
    else if (!a.startsWith('--')) out.config = a;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.config) {
  console.error('❌ 用法: node create-view-table.js <配置JSON路径> [--dry-run] [--appType=APP_xxx] [--name=报表名]');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const configPath = path.isAbsolute(args.config) ? args.config : path.join(process.cwd(), args.config);
if (!fs.existsSync(configPath)) {
  console.error('❌ 未找到配置文件:', configPath);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const appType = args.appType || cfg.appType;
if (!appType) {
  console.error('❌ 配置中缺少 appType，且未通过 --appType 指定');
  process.exit(1);
}
const cubeName = args.name || cfg.cubeName || '通用视图表';

const cookieFile = path.join(projectRoot, '.cookies.json');
if (!args.dryRun && !fs.existsSync(cookieFile)) {
  console.error('❌ 未找到 .cookies.json，请先使用 yida-login skill 登录');
  process.exit(1);
}
// Phase 6: 通过 lib/core/utils.loadCookieData 统一加载 cookie（dryRun 模式使用 mock 数据）
const cookieData = args.dryRun
  ? { cookies: [], csrf_token: '' }
  : coreUtils.loadCookieData(projectRoot);
const cookieStr = (cookieData.cookies || []).map(c => c.name + '=' + c.value).join('; ');
const csrfToken = cookieData.csrf_token || '';
const baseUrl = cfg.baseUrl || 'https://wggfro.aliwork.com';
const defaultOrigin = cfg.defaultOriginSchemaCode || '2f2bbd3f8a0134d2fd22273ec55419e6';

// ── 配置校验 ──────────────────────────────────────────
const mainTable = cfg.mainTable;
const associatedTables = cfg.associatedTables || [];
const joinFieldMain = cfg.joinField && cfg.joinField.main;
const joinFieldRemark = (cfg.joinField && cfg.joinField.remark) || '关联字段';
if (!mainTable || !mainTable.uuid) {
  console.error('❌ 配置缺少 mainTable.uuid');
  process.exit(1);
}
if (!joinFieldMain) {
  console.error('❌ 配置缺少 joinField.main（主表侧关联字段）');
  process.exit(1);
}
for (const [i, at] of associatedTables.entries()) {
  if (!at.uuid || !at.joinField) {
    console.error(`❌ 第 ${i + 1} 个关联表缺少 uuid 或 joinField`);
    process.exit(1);
  }
}

// 字段表 key 映射：main -> 主表，其余用关联表在数组中的 key（下划线序号）
const tableKeyOf = (field) => {
  if (!field.table || field.table === 'main') return 'main';
  return field.table;
};

// ── HTTP 工具 ─────────────────────────────────────────
function httpGet(apiPath, params) {
  return new Promise((resolve, reject) => {
    const qs = querystring.stringify(params);
    const url = baseUrl + apiPath + (qs ? '?' + qs : '');
    const urlObj = new URL(url);
    https.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Cookie': cookieStr,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': baseUrl + '/alibaba/web/' + appType + '/visual/modelTableDesigner',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ __raw: data.substring(0, 2000) }); }
      });
    }).on('error', reject);
  });
}

function httpPost(apiPath, postData, refererPath) {
  return new Promise((resolve, reject) => {
    const url = baseUrl + apiPath;
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Cookie': cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': refererPath || (baseUrl + '/alibaba/web/' + appType + '/visual/modelTableDesigner'),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ __raw: data.substring(0, 2000) }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomHex(length) {
  let result = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}
function randomFieldId() { return 'field_' + randomHex(10); }

// ── 主流程 ────────────────────────────────────────────
async function main() {
  const SEP = '='.repeat(60);
  console.log(SEP);
  console.log('📦 通用视图表创建（配置驱动）');
  console.log('   配置:', path.basename(configPath));
  console.log('   应用:', appType);
  console.log('   名称:', cubeName);
  console.log(SEP);

  // 关联表 key 列表
  const assocKeys = associatedTables.map((_, i) => 'assoc_' + i);
  const allTables = { main: mainTable, ...Object.fromEntries(assocKeys.map((k, i) => [k, associatedTables[i]])) };

  // 生成 tableAlias
  const tableAliasMap = {};
  tableAliasMap.main = 'table_alias_' + randomHex(16);
  assocKeys.forEach(k => { tableAliasMap[k] = 'table_alias_' + randomHex(16); });

  if (args.dryRun) {
    console.log('\n🔍 [DRY-RUN] 仅构建配置，不发送任何请求');
    console.log('主表:', mainTable.name, mainTable.uuid);
    associatedTables.forEach((at, i) => console.log(`关联表${i + 1}:`, at.name, at.uuid, '| 关联字段', at.joinField));
    const fields = cfg.fields || [];
    console.log(`\n输出字段共 ${fields.length} 个:`);
    fields.forEach((f, i) => {
      const colName = f.suffix ? f.code + '_value' : f.code;
      const srcTable = tableKeyOf(f) === 'main' ? mainTable.name : (allTables[tableKeyOf(f)] || {}).name || tableKeyOf(f);
      console.log(`  ${i + 1}. [${srcTable}] ${f.label} (${colName}) [${f.type}]`);
    });
    console.log('\n✅ 配置解析通过。去掉 --dry-run 即可真实创建。');
    return;
  }

  // Step 1: 生成 cubeCode
  console.log('\n📌 Step 1: 生成新的 cubeCode...');
  const genResult = await httpGet(
    `/alibaba/web/${appType}/visual/model-table/generateCubeCodeByCubeSource.json`,
    { _api: 'YiDaModelTable.generateCubeCode', _mock: 'false', _csrf_token: csrfToken, _locale_time_zone_offset: '28800000', cubeSource: 'VIEW_MODEL' }
  );
  let cubeCode = null;
  if (genResult.success && genResult.content) {
    cubeCode = genResult.content.cubeCode || genResult.content;
    console.log('✅ cubeCode:', cubeCode);
  } else {
    console.log('❌ 生成 cubeCode 失败:', JSON.stringify(genResult).substring(0, 300));
    console.log('⚠️ 可能是登录态过期，请重新登录后重试');
    process.exit(1);
  }

  // Step 2: 查询可用表单（获取 originSchemaCode）
  console.log('\n📌 Step 2: 查询可用表单列表...');
  const tablesResult = await httpGet(
    `/alibaba/web/${appType}/visual/model-table/queryTables.json`,
    { _api: 'YiDaModelTable.getDatasetList', _mock: 'false', _csrf_token: csrfToken, _locale_time_zone_offset: '28800000' }
  );
  const tableMeta = {};
  if (tablesResult.success && tablesResult.content) {
    const tableList = Array.isArray(tablesResult.content) ? tablesResult.content : (tablesResult.content.tables || tablesResult.content.list || []);
    console.log(`找到 ${tableList.length} 个可用表单`);
    for (const t of tableList) {
      const tableName = t.tableName || t.name || '';
      for (const [key, info] of Object.entries(allTables)) {
        if (tableName === info.uuid) {
          tableMeta[key] = {
            dbvCode: t.dbvCode || appType,
            originSchemaCode: t.originSchemaCode || t.schemaCode || defaultOrigin,
            schemaCode: t.schemaCode || appType,
            tableRemark: t.tableRemark || info.name,
            tableName: tableName,
          };
        }
      }
    }
  }
  for (const key of Object.keys(allTables)) {
    if (!tableMeta[key]) {
      tableMeta[key] = { dbvCode: appType, originSchemaCode: defaultOrigin, schemaCode: appType, tableRemark: allTables[key].name, tableName: allTables[key].uuid };
    }
  }
  console.log('主表:', tableMeta.main.tableRemark);
  associatedTables.forEach((at, i) => console.log(`关联表${i + 1}:`, tableMeta['assoc_' + i].tableRemark));

  // Step 3: 构建 measureMapping 和 columnFields
  console.log('\n📌 Step 3: 构建输出字段配置...');
  const measureMapping = [];
  const columnFields = [];
  const fields = cfg.fields || [];
  console.log(`输出字段共 ${fields.length} 个:`);
  fields.forEach((f, i) => {
    const colName = f.suffix ? f.code + '_value' : f.code;
    const key = tableKeyOf(f);
    const alias = tableAliasMap[key];
    const cube = allTables[key].uuid;
    const measureCode = randomFieldId();
    const fieldKey = randomFieldId();
    const srcTable = key === 'main' ? mainTable.name : (allTables[key] || {}).name || key;
    console.log(`  ${i + 1}. [${srcTable}] ${f.label} (${colName}) [${f.type}]`);

    measureMapping.push({
      aggregateType: '',
      bizCode: f.suffix ? f.code : '',
      bizName: f.label,
      bizType: null,
      columnName: colName,
      dataType: f.type,
      dim: null,
      expression: '',
      expressionSchema: '',
      hierarchy: null,
      level: null,
      measureCode: measureCode,
      measureRemark: f.label,
      originDataType: f.type,
      tableAlias: alias,
    });

    columnFields.push({
      _data: {
        bizCode: f.suffix ? f.code : '',
        bizName: f.label,
        bizType: f.type,
        columnName: colName,
        dataType: f.type,
        isDim: false,
        isHierarchy: false,
        level: 1,
        measureCode: measureCode,
        originDataType: f.type,
        tableAlias: alias,
      },
      aggregateType: 'NONE',
      beUsedTimes: 1,
      code: colName,
      columnName: colName,
      columnRemark: f.label,
      cubeCode: cube,
      dataType: f.type,
      drillList: [],
      fieldCode: colName,
      fieldKey: fieldKey,
      format: { type: 'NONE' },
      id: colName,
      isDimension: false,
      link: [{ type: 'NONE' }],
      measureCode: measureCode,
      orderBy: { reference: fieldKey, type: 'NONE' },
      tableAlias: alias,
      text: f.label,
      title: { type: 'i18n', zh_CN: f.label },
      visible: true,
    });
  });

  // Step 4: 构建完整配置
  console.log('\n📌 Step 4: 构建完整视图表配置...');
  const mainT = {
    dbvCode: tableMeta.main.dbvCode, metaSource: 'YIDA',
    originSchemaCode: tableMeta.main.originSchemaCode, schemaCode: tableMeta.main.schemaCode,
    tableAlias: tableAliasMap.main, tableName: mainTable.uuid, tableRemark: mainTable.name,
  };
  const assocT = associatedTables.map((at, i) => {
    const k = 'assoc_' + i;
    return { dbvCode: tableMeta[k].dbvCode, metaSource: 'YIDA', originSchemaCode: tableMeta[k].originSchemaCode, schemaCode: tableMeta[k].schemaCode, tableAlias: tableAliasMap[k], tableName: at.uuid, tableRemark: at.name };
  });
  const tableRelations = associatedTables.map((at, i) => ({
    joinType: 'LEFT_JOIN',
    leftTableAlias: tableAliasMap.main,
    relations: [{ leftColumn: { columnName: joinFieldMain, columnRemark: joinFieldRemark, dataType: 'STRING' }, rightColumn: { columnName: at.joinField, columnRemark: at.joinRemark || joinFieldRemark, dataType: 'STRING' } }],
    rightTableAlias: tableAliasMap['assoc_' + i],
  }));
  const frontSchema = {
    cubeCodes: [{
      type: 'multiTable',
      value: {
        mainTableCode: mainTable.uuid,
        mainTable: mainT,
        associatedTableCodes: associatedTables.map(at => at.uuid),
        associatedTables: assocT,
        joinType: 'LEFT_JOIN',
        tableRelations: associatedTables.map((at) => ({
          field: joinFieldMain, fieldName: joinFieldRemark, dataType: 'STRING',
          linkTable: at.uuid, linkTableField: at.joinField, linkTableFieldName: at.joinRemark || joinFieldRemark,
        })),
      },
    }],
    columnFields: columnFields,
    filterList: [],
  };
  const config = {
    cubeCode: cubeCode, cubeName: cubeName, cubeType: 'VIEW',
    mainTable: mainT, associatedTables: assocT, tableRelations: tableRelations,
    filters: null, measureMapping: measureMapping, frontSchema: JSON.stringify(frontSchema), sqlSchema: null,
  };

  // Step 5: 保存
  console.log('\n📌 Step 5: 保存视图表配置...');
  const savePath = `/alibaba/web/${appType}/visual/model-table/saveModelTableSchema.json?_api=YiDaModelTable.saveModelTableConfig&_mock=false&_csrf_token=${csrfToken}`;
  const postData = querystring.stringify({ _csrf_token: csrfToken, _locale_time_zone_offset: '28800000', schema: JSON.stringify(config) });
  const refererPath = baseUrl + '/alibaba/web/' + appType + '/visual/modelTableDesigner?cubeCode=' + cubeCode;
  const saveResult = await httpPost(savePath, postData, refererPath);
  if (!saveResult.success) {
    console.log('❌ 保存失败！', saveResult.errorMsg || '');
    console.log('完整返回:', JSON.stringify(saveResult).substring(0, 500));
    process.exit(1);
  }
  console.log('✅ 配置保存成功！');

  // Step 6: 验证数据查询
  console.log('\n📌 Step 6: 验证数据查询...');
  await delay(2000);
  const verifyPath = `/alibaba/web/${appType}/visual/model-table/queryModelTableDatasAsync.json?_api=YiDaModelTable.queryModelTableDatas&_mock=false&_csrf_token=${csrfToken}`;
  const verifyPost = querystring.stringify({ _csrf_token: csrfToken, cubeCode: cubeCode, currentPage: '1', pageSize: '10' });
  const verifyResult = await httpPost(verifyPath, verifyPost, refererPath);
  let dataOk = false;
  if (verifyResult.success && verifyResult.content) {
    const content = verifyResult.content;
    const rowCount = content.dataList ? content.dataList.length : (content.data ? content.data.length : (content.total !== undefined ? content.total : 0));
    console.log(`✅ 数据查询成功！返回 ${rowCount} 行数据`);
    dataOk = true;
    const rows = content.dataList || content.data || [];
    if (rows.length > 0) console.log('第一行数据:', JSON.stringify(rows[0]).substring(0, 600));
  } else if (verifyResult.errorMsg) {
    console.log('❌ 数据查询失败:', verifyResult.errorMsg);
    if (verifyResult.errorMsg.includes('cvCode:')) {
      const match = verifyResult.errorMsg.match(/cvCode:(\S+)/);
      if (match) console.log('⚠️ 有问题的字段:', match[1], '→ 建议从配置的 fields 中移除该字段后重试');
    }
  } else if (verifyResult.__raw && verifyResult.__raw.includes('<!DOCTYPE')) {
    console.log('⚠️ 返回了 HTML 页面（登录态可能异常，需通过 Playwright 验证）');
  } else {
    console.log('未知结果:', JSON.stringify(verifyResult).substring(0, 500));
  }

  // Step 7: 查询 measureMapping
  console.log('\n📌 Step 7: 查询 measureMapping（供报表引擎使用）...');
  await delay(1000);
  const schemaPath = `/alibaba/web/${appType}/visual/model-table/queryModelTableSchema.json?_api=YiDaModelTable.queryModelTableConfig&_mock=false&_csrf_token=${csrfToken}`;
  const schemaPost = querystring.stringify({ _csrf_token: csrfToken, cubeCode: cubeCode });
  const schemaResult = await httpPost(schemaPath, schemaPost, refererPath);
  let measureMappingFromServer = null;
  if (schemaResult.success && schemaResult.content && Array.isArray(schemaResult.content.measureMapping)) {
    measureMappingFromServer = schemaResult.content.measureMapping;
    console.log(`✅ 获取到 ${measureMappingFromServer.length} 个字段的 measureMapping`);
    measureMappingFromServer.forEach(m => console.log(`  ${m.columnName} → ${m.measureCode}  (${m.measureRemark})`));
  } else {
    console.log('⚠️ 未获取到 measureMapping（报表引擎会自动查询）');
  }

  console.log('\n' + SEP);
  console.log('📊 视图表创建结果');
  console.log(SEP);
  console.log('cubeCode:', cubeCode);
  console.log('cubeName:', cubeName);
  console.log('主表:', mainTable.name, '| 关联:', associatedTables.map(at => at.name).join(', '));
  console.log('数据验证:', dataOk ? '✅ 成功' : '⚠️ 需 Playwright 复核');
  console.log('设计器URL:', baseUrl + '/alibaba/web/' + appType + '/visual/modelTableDesigner?code=' + cubeCode + '&type=view');
  console.log('\nDONE');
}

if (require.main === module) {
  main().catch(err => { console.error('ERROR:', err.message); console.error(err.stack); process.exit(1); });
}
