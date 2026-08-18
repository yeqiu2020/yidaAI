#!/usr/bin/env node
/**
 * report-engine.js - 宜搭报表创建引擎（完全自包含）
 * 项目：yeqiu-yida（作者：叶秋）
 *
 * 不依赖任何外部CLI工具，直接调用宜搭HTTP API创建报表。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const querystring = require('querystring');

// ── 常量定义 ──────────────────────────────────────────

const CHART_COMPONENT_MAP = {
  bar: 'YoushuGroupedBarChart',
  line: 'YoushuLineChart',
  pie: 'YoushuPieChart',
  funnel: 'YoushuFunnelChart',
  gauge: 'YoushuGauge',
  combo: 'YoushuComboChart',
  table: 'YoushuTable',
  indicator: 'YoushuSimpleIndicatorCard',
  pivot: 'YoushuCrossPivotTable',
};

const BASE_COMPONENTS = [
  { package: '@alife/yida-vc-0', version: '1.0.0', componentName: 'Page' },
  { package: '@alife/yida-vc-0', version: '1.0.0', componentName: 'RootHeader' },
  { package: '@alife/yida-vc-0', version: '1.0.0', componentName: 'RootContent' },
  { package: '@alife/yida-vc-0', version: '1.0.0', componentName: 'RootFooter' },
  { package: '@alife/yida-vc-0', version: '1.0.0', componentName: 'FooterYida' },
  { package: '@/components/vc-yida-report', version: '1.0.6', componentName: 'YoushuPageHeader' },
  { package: '@/components/vc-yida-report', version: '1.0.6', componentName: 'PageHeaderContent' },
  { package: '@/components/vc-yida-report', version: '1.0.6', componentName: 'YoushuSelectFilter' },
  { package: '@/components/vc-yida-report', version: '1.0.6', componentName: 'YoushuTopFilterContainer' },
];

// ── ID 生成工具 ───────────────────────────────────────

function randomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function genNodeId() {
  return 'node_oc' + randomId() + randomId().slice(0, 4);
}

function genFieldId(componentName) {
  return componentName + '_' + randomId();
}

// ── Cookie / 登录态处理 ───────────────────────────────

function loadCookieData(projectRoot) {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
  const root = projectRoot || PROJECT_ROOT;
  // 阶段二改造：Cookie 优先全局，兼容项目根
  const os = require('os');
  const globalCookieFile = path.join(os.homedir(), '.yida-ai-helper', '.cookies.json');
  const rootCookieFile = path.join(root, '.cookies.json');
  const cookieFile = fs.existsSync(globalCookieFile) ? globalCookieFile : rootCookieFile;

  if (!fs.existsSync(cookieFile)) {
    console.error('[report] 未找到登录态文件:', cookieFile);
    return null;
  }

  try {
    const raw = fs.readFileSync(cookieFile, 'utf-8').trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    let cookieData = parsed;

    if (Array.isArray(parsed)) {
      cookieData = { cookies: parsed, base_url: 'https://www.aliwork.com' };
    }

    // 从 cookies 中提取关键信息
    if (cookieData.cookies && cookieData.cookies.length > 0) {
      const csrfCookie = cookieData.cookies.find(c => c.name === 'tianshu_csrf_token');
      const corpCookie = cookieData.cookies.find(c => c.name === 'corp_id');
      if (csrfCookie) cookieData.csrf_token = csrfCookie.value;
      if (corpCookie) cookieData.corp_id = corpCookie.value;
    }

    return cookieData;
  } catch (e) {
    console.error('[report] 读取登录态失败:', e.message);
    return null;
  }
}

function resolveBaseUrl(cookieData) {
  if (cookieData.base_url) return cookieData.base_url;
  const domainCookie = cookieData.cookies && cookieData.cookies.find(c => c.domain && c.domain.includes('aliwork.com'));
  if (domainCookie) {
    const domain = domainCookie.domain.replace(/^\./, '');
    return `https://${domain}`;
  }
  return 'https://www.aliwork.com';
}

// ── HTTP 请求 ─────────────────────────────────────────

function httpPost(baseUrl, requestPath, postData, cookies) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl);
    const requestHost = parsedUrl.hostname;

    const filteredCookies = cookies.filter(c => {
      const cookieDomain = (c.domain || '').replace(/^\./, '');
      return requestHost === cookieDomain || requestHost.endsWith('.' + cookieDomain);
    });
    const effectiveCookies = filteredCookies.length > 0 ? filteredCookies : cookies;
    const cookieHeader = effectiveCookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const csrfCookie = effectiveCookies.find(c => c.name === 'tianshu_csrf_token');
    const globalCsrfToken = csrfCookie ? csrfCookie.value : '';

    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: requestPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        Accept: 'application/json, text/plain, */*',
        Origin: baseUrl,
        Referer: baseUrl + '/',
        Cookie: cookieHeader,
        'x-requested-with': 'XMLHttpRequest',
        global_csrf_token: globalCsrfToken,
      },
      timeout: 30000,
    };

    const req = requestModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve({ success: false, errorMsg: `HTTP ${res.statusCode}: 响应不是JSON` });
        }
      });
    });

    let hasRejected = false;
    req.on('timeout', () => {
      hasRejected = true;
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.on('error', (err) => { if (!hasRejected) reject(err); });
    req.write(postData);
    req.end();
  });
}

// ── 报表 API 调用 ─────────────────────────────────────

async function createBlankReport(baseUrl, csrfToken, cookies, appType, reportTitle) {
  const querystring = require('querystring');
  const titleI18n = JSON.stringify({
    use: 'zh_CN',
    zh_CN: reportTitle,
    en_US: reportTitle,
    ja_JP: reportTitle,
    type: 'i18n'
  });
  const postData = querystring.stringify({
    _csrf_token: csrfToken,
    formType: 'report',
    title: titleI18n,
  });
  return httpPost(baseUrl, `/dingtalk/web/${appType}/query/formdesign/saveFormSchemaInfo.json`, postData, cookies);
}

async function saveReportSchema(baseUrl, csrfToken, cookies, appType, reportId, schema) {
  const querystring = require('querystring');
  const postData = querystring.stringify({
    _csrf_token: csrfToken,
    formUuid: reportId,
    content: JSON.stringify(schema),
    schemaVersion: 'V5',
    importSchema: 'true',
  });
  return httpPost(baseUrl, `/dingtalk/web/${appType}/_view/query/formdesign/saveFormSchema.json`, postData, cookies);
}

// ── 字段处理工具 ──────────────────────────────────────

function normalizeCubeCode(cubeCode) {
  return cubeCode.replace(/-/g, '_');
}

function normalizeFieldCode(fieldCode, fieldType) {
  const SELECT_TYPES = ['selectField_', 'radioField_', 'checkboxField_', 'multiSelectField_'];
  const needsValueSuffix = SELECT_TYPES.some(prefix => fieldCode.startsWith(prefix));
  if (needsValueSuffix && !fieldCode.endsWith('_value')) {
    return fieldCode + '_value';
  }
  return fieldCode;
}

function inferDataType(fieldCode) {
  if (fieldCode.startsWith('numberField_')) return 'DOUBLE';
  if (fieldCode.startsWith('dateField_')) return 'DATE';
  if (fieldCode === 'pid') return 'STRING';
  return 'STRING';
}

// ── 视图表 measureCode 转换 ─────────────────────────
// 视图表在报表中必须使用 measureCode（如 field_cfc8ba4d3f）而非 columnName（如 textField_4c11h67t）

function isViewTableCubeCode(cubeCode) {
  return cubeCode && (cubeCode.startsWith('vm_') || cubeCode.startsWith('VIEW_'));
}

async function fetchViewTableMeasureMapping(authRef, appType, cubeCode) {
  const postData = querystring.stringify({
    _csrf_token: authRef.csrfToken,
    cubeCode: cubeCode,
  });
  const result = await httpPost(
    authRef.baseUrl,
    `/alibaba/web/${appType}/visual/model-table/queryModelTableSchema.json?_api=YiDaModelTable.queryModelTableConfig&_mock=false&_csrf_token=${authRef.csrfToken}`,
    postData,
    authRef.cookies,
  );
  if (result.success && result.content && Array.isArray(result.content.measureMapping)) {
    const mapping = {};
    result.content.measureMapping.forEach(m => {
      // columnName -> measureCode
      // 同时存储原始 columnName 和带/不带 _value 后缀的版本
      mapping[m.columnName] = m.measureCode;
      if (m.columnName.endsWith('_value')) {
        mapping[m.columnName.slice(0, -6)] = m.measureCode;
      }
      if (!m.columnName.endsWith('_value') && m.columnName.startsWith('selectField_')) {
        mapping[m.columnName + '_value'] = m.measureCode;
      }
    });
    return mapping;
  }
  return null;
}

async function convertViewTableFields(charts, filters, authRef, appType) {
  const measureMappingCache = {};
  let hasViewTable = false;

  for (const chart of charts) {
    if (!isViewTableCubeCode(chart.cubeCode)) continue;
    hasViewTable = true;

    if (!measureMappingCache[chart.cubeCode]) {
      console.log(`  [视图表转换] 获取 ${chart.cubeCode} 的 measureMapping...`);
      const mapping = await fetchViewTableMeasureMapping(authRef, appType, chart.cubeCode);
      if (mapping) {
        measureMappingCache[chart.cubeCode] = mapping;
        console.log(`  [视图表转换] 获取到 ${Object.keys(mapping).length} 个字段映射`);
      } else {
        console.log(`  [视图表转换] ⚠️ 未获取到 measureMapping，跳过转换`);
        continue;
      }
    }

    const mapping = measureMappingCache[chart.cubeCode];

    const convertField = (field) => {
      if (!field || !field.fieldCode) return field;
      const measureCode = mapping[field.fieldCode];
      if (measureCode) {
        console.log(`  [视图表转换] ${field.fieldCode} -> ${measureCode}`);
        return { ...field, fieldCode: measureCode };
      }
      // 如果 fieldCode 已经是 measureCode 格式（field_ 开头），保持不变
      return field;
    };

    if (chart.kpi) chart.kpi = chart.kpi.map(convertField);
    if (chart.xField) chart.xField = convertField(chart.xField);
    if (chart.yField) chart.yField = chart.yField.map(convertField);
    if (chart.columnFields) chart.columnFields = chart.columnFields.map(convertField);
  }

  // 转换筛选器字段
  for (const filter of filters) {
    if (!isViewTableCubeCode(filter.cubeCode)) continue;

    if (!measureMappingCache[filter.cubeCode]) {
      const mapping = await fetchViewTableMeasureMapping(authRef, appType, filter.cubeCode);
      if (mapping) {
        measureMappingCache[filter.cubeCode] = mapping;
      } else {
        continue;
      }
    }

    const mapping = measureMappingCache[filter.cubeCode];

    // 获取要转换的 fieldCode（支持多种配置格式）
    const rawFieldCode = filter.fieldCode || filter.valueField?.fieldCode || filter.filterFieldCode;
    if (rawFieldCode) {
      const measureCode = mapping[rawFieldCode];
      if (measureCode) {
        console.log(`  [视图表转换] 筛选器 ${rawFieldCode} -> ${measureCode}`);
        if (filter.fieldCode) filter.fieldCode = measureCode;
        if (filter.filterFieldCode) filter.filterFieldCode = measureCode;
        if (filter.valueField) filter.valueField.fieldCode = measureCode;
        if (filter.labelField) filter.labelField.fieldCode = measureCode;
      } else {
        console.log(`  [视图表转换] 筛选器字段 ${rawFieldCode} 未在 measureMapping 中找到，跳过`);
      }
    }
  }

  if (hasViewTable) {
    console.log('  [视图表转换] 转换完成');
  }
}

function buildFieldObj(cubeCodeOrField, fieldCode, aliasName, alias, dataType, aggregateType) {
  // 增强版调用：buildFieldObj(cubeCode, fieldCode, aliasName, alias, dataType, aggregateType)
  if (typeof cubeCodeOrField === 'string' && arguments.length >= 2) {
    const code = normalizeFieldCode(fieldCode);
    return {
      fieldCode: code,
      alias: alias || genFieldAlias(),
      aliasName: { type: 'i18n', zh_CN: aliasName || fieldCode },
      classifiedCode: cubeCodeOrField,
      dataType: dataType || inferDataType(code),
      aggregateType: aggregateType || 'NONE',
    };
  }

  // 简单版调用：buildFieldObj(field)
  const field = cubeCodeOrField;
  if (typeof field === 'string') {
    const normalizedCode = normalizeFieldCode(field);
    return {
      fieldCode: normalizedCode,
      alias: genFieldAlias(),
      aliasName: { type: 'i18n', zh_CN: field },
      classifiedCode: '',
      dataType: inferDataType(normalizedCode),
      aggregateType: 'NONE',
    };
  }
  const normalizedCode = normalizeFieldCode(field.fieldCode);
  return {
    fieldCode: normalizedCode,
    alias: genFieldAlias(),
    aliasName: { type: 'i18n', zh_CN: field.aliasName || field.fieldCode },
    classifiedCode: '',
    dataType: field.dataType || inferDataType(normalizedCode),
    aggregateType: field.aggregateType || 'NONE',
  };
}

function getDefaultLayout(chartType) {
  const layouts = {
    indicator: { w: 6, h: 6 },
    bar: { w: 3, h: 22 },
    line: { w: 3, h: 22 },
    pie: { w: 3, h: 22 },
    funnel: { w: 3, h: 22 },
    gauge: { w: 2, h: 18 },
    combo: { w: 6, h: 22 },
    table: { w: 6, h: 38 },
    pivot: { w: 6, h: 30 },
  };
  return layouts[chartType] || { w: 3, h: 22 };
}

// ── 字段别名生成器（全局计数） ────────────────────────

let _aliasCounter = 0;

function genFieldAlias() {
  _aliasCounter++;
  return 'field_' + (_aliasCounter).toString(36);
}

// ── 构建 dataViewQueryModel（核心数据查询模型） ───────

function buildDataViewQueryModel(fields, cubeCode, cubeTenantId) {
  const fieldDefinitionList = [];
  const fieldListKeys = [];

  fields.forEach((f) => {
    const alias = genFieldAlias();
    f._alias = alias;
    const aggType = f.aggregateType || 'NONE';
    const isDateField = (f.dataType === 'DATE') || (f.fieldCode && f.fieldCode.startsWith('dateField_'));

    const aliasNameValue = typeof f.aliasName === 'object' && f.aliasName.type === 'i18n'
      ? f.aliasName.zh_CN
      : (f.aliasName || f.fieldCode);
    fieldDefinitionList.push({
      cubeCode: cubeCode,
      isDim: false,
      alias: alias,
      aliasName: { type: 'i18n', zh_CN: aliasNameValue },
      classifiedCode: cubeCode,
      fieldCode: normalizeFieldCode(f.fieldCode),
      dataType: f.dataType || 'STRING',
      aggregateType: aggType,
      timeGranularityType: isDateField ? 'DAY' : null,
    });

    fieldListKeys.push(alias);
  });

  return {
    model: {
      cubeCode: cubeCode,
      fieldDefinitionList: fieldDefinitionList,
      fieldList: fieldListKeys,
      filterList: [],
      orderByList: [],
      cubeTenantId: cubeTenantId || '',
    },
    processedFields: fields,
  };
}

// ── DataSetModelMap 构建（完全对齐 yeqiu-yida 格式） ────────

function buildDataSetModelMap(chart, corpId) {
  const cubeCode = normalizeCubeCode(chart.cubeCode || '');
  const cubeTenantId = corpId || '';
  const chartType = chart.type || 'bar';

  // 重置别名计数器
  _aliasCounter = 0;

  // ── 指标卡（indicator）──
  if (chartType === 'indicator') {
    const rawKpi = chart.kpi || [];
    const allFields = rawKpi.map(k => ({
      ...buildFieldObj(k),
      role: 'kpi',
    }));

    const { model: kpiModel } = buildDataViewQueryModel(allFields, cubeCode, cubeTenantId);

    const kpiObjs = allFields.filter(f => f.role === 'kpi').map(f =>
      buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
    );

    return {
      youshuData: {
        dataViewQueryModel: {
          ...kpiModel,
          cubeCode: cubeCode,
          cubeTenantId: cubeTenantId,
        },
        fieldList: allFields.map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
        ),
        youshuDataType: 'real',
        cubeCodes: cubeCode ? [cubeCode] : [],
        kpi: kpiObjs,
        helpKpi: [],
        filterList: [],
        limit: '',
        mockData: [],
      },
    };
  }

  // ── 表格（table）──
  if (chartType === 'table') {
    const rawColumns = chart.columnFields || [];
    const allFields = rawColumns.map(c => ({ ...buildFieldObj(c), role: 'col' }));

    const { model } = buildDataViewQueryModel(allFields, cubeCode, cubeTenantId);

    const fieldListObjs = allFields.map(f =>
      buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
    );

    return {
      table: {
        dataViewQueryModel: {
          ...model,
          cubeCode: cubeCode,
          cubeTenantId: cubeTenantId,
        },
        fieldList: fieldListObjs,
        youshuDataType: 'real',
        cubeCodes: cubeCode ? [cubeCode] : [],
        columnFields: [...fieldListObjs],
        filterList: [],
        limit: '',
        mockData: [],
      },
    };
  }

  // ── 通用图表（bar/line/pie/funnel/area/scatter）──
  if (['bar', 'line', 'pie', 'funnel', 'area', 'scatter'].includes(chartType)) {
    const allFields = [];

    if (chart.xField) {
      allFields.push({ ...buildFieldObj(chart.xField), role: 'x' });
    }
    if (Array.isArray(chart.yField)) {
      chart.yField.forEach((y) => {
        allFields.push({ ...buildFieldObj(y), role: 'y' });
      });
    }

    const { model, allFields: processedFields } = buildDataViewQueryModel(allFields, cubeCode, cubeTenantId);

    const xFieldObjs = processedFields.filter(f => f.role === 'x').map(f =>
      buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
    );
    const yFieldObjs = processedFields.filter(f => f.role === 'y').map(f =>
      buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
    );

    const extraFields = {};
    if (chartType === 'pie') {
      extraFields.ratio = [];
      extraFields.totalValue = [];
      extraFields.totalRatio = [];
      extraFields.trailingIconField = [];
    }

    return {
      chartData: {
        dataViewQueryModel: {
          ...model,
          cubeCode: cubeCode,
          cubeTenantId: cubeTenantId,
        },
        fieldList: processedFields.map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
        ),
        youshuDataType: 'real',
        cubeCodes: cubeCode ? [cubeCode] : [],
        xField: xFieldObjs,
        yField: yFieldObjs,
        groupField: [],
        annotationField: [],
        ...extraFields,
        filterList: [],
        limit: '',
        mockData: [],
      },
    };
  }

  // ── 组合图（combo）──
  if (chartType === 'combo') {
    const allFields = [];
    if (chart.xField) {
      allFields.push({ ...buildFieldObj(chart.xField), role: 'x' });
    }
    if (Array.isArray(chart.leftYFields)) {
      chart.leftYFields.forEach(y => allFields.push({ ...buildFieldObj(y), role: 'leftY' }));
    }
    if (Array.isArray(chart.rightYFields)) {
      chart.rightYFields.forEach(y => allFields.push({ ...buildFieldObj(y), role: 'rightY' }));
    }

    const { model, allFields: processedFields } = buildDataViewQueryModel(allFields, cubeCode, cubeTenantId);

    return {
      dataSetName: {
        dataViewQueryModel: {
          ...model,
          cubeCode: cubeCode,
          cubeTenantId: cubeTenantId,
        },
        fieldList: processedFields.map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
        ),
        youshuDataType: 'real',
        cubeCodes: cubeCode ? [cubeCode] : [],
        xField: processedFields.filter(f => f.role === 'x').map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
        ),
        leftYFields: processedFields.filter(f => f.role === 'leftY').map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
        ),
        rightYFields: processedFields.filter(f => f.role === 'rightY').map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType, f.aggregateType)
        ),
        annotationField: [],
        filterList: [],
        limit: '',
        mockData: [],
      },
    };
  }

  // ── 仪表盘（gauge）──
  if (chartType === 'gauge') {
    const allFields = [];
    if (chart.valueField) {
      allFields.push({ ...buildFieldObj(chart.valueField), role: 'value' });
    }
    const { model, allFields: processedFields } = buildDataViewQueryModel(allFields, cubeCode, cubeTenantId);

    return {
      chartData: {
        dataViewQueryModel: {
          ...model,
          cubeCode: cubeCode,
          cubeTenantId: cubeTenantId,
        },
        fieldList: processedFields.map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType || 'DOUBLE', f.aggregateType || 'AVG')
        ),
        youshuDataType: 'real',
        cubeCodes: cubeCode ? [cubeCode] : [],
        valueField: processedFields.filter(f => f.role === 'value').map(f =>
          buildFieldObj(cubeCode, f.fieldCode, f.aliasName, f._alias, f.dataType || 'DOUBLE', f.aggregateType || 'AVG')
        ),
        assitValueField: [],
        filterList: [],
        limit: '',
        mockData: [],
      },
    };
  }

  // 默认返回空
  return {};
}

// ── 增强版 buildFieldObj（支持 alias 参数） ──────────────

const _originalBuildFieldObj = buildFieldObj;

function buildFieldObjEnhanced(cubeCode, fieldCode, aliasName, alias, dataType, aggregateType) {
  return {
    fieldCode: normalizeFieldCode(fieldCode),
    alias: alias || genFieldAlias(),
    aliasName: { type: 'i18n', zh_CN: aliasName || fieldCode },
    classifiedCode: cubeCode,
    dataType: dataType || inferDataType(fieldCode),
    aggregateType: aggregateType || 'NONE',
  };
}

// ── 筛选器构建 ────────────────────────────────────────

function buildSelectFilter(filterDef, valueFieldDef, labelFieldDef, dataSetModelMap, corpId) {
  const fieldId = genFieldId('select');
  const nodeId = genNodeId();

  const filterMeta = {
    fieldId,
    nodeId,
    fieldCode: valueFieldDef.fieldCode,
    cubeCode: filterDef.cubeCode || '',
    cubeTenantId: corpId || '',
  };

  const filterComponent = {
    condition: true,
    componentName: 'YoushuSelectFilter',
    id: nodeId,
    props: {
      fieldId,
      title: filterDef.title || '筛选器',
      placeholder: filterDef.placeholder || '请选择',
      cubeCode: filterDef.cubeCode || '',
      cubeTenantId: corpId || '',
      valueField: valueFieldDef,
      labelField: labelFieldDef || valueFieldDef,
      dataSetModelMap: dataSetModelMap || {
        table: {
          queryModel: {
            cubeCode: filterDef.cubeCode || '',
            cubeTenantId: corpId || '',
            column: [valueFieldDef],
          },
        },
      },
    },
  };

  filterComponent.__filterMeta__ = filterMeta;
  return filterComponent;
}

function buildFilterContainer(filters, containerFieldId) {
  return {
    condition: true,
    componentName: 'YoushuTopFilterContainer',
    id: genNodeId(),
    props: {
      fieldId: containerFieldId,
      children: filters,
    },
  };
}

function injectFilterLinkage(dataSetModelMap, filterMeta, filterFieldCode, cubeCode, corpId) {
  const newMap = JSON.parse(JSON.stringify(dataSetModelMap));

  Object.keys(newMap).forEach(key => {
    const model = newMap[key];
    if (model && model.queryModel) {
      if (!model.queryModel.filter) {
        model.queryModel.filter = [];
      }
      model.queryModel.filter.push({
        fieldCode: filterFieldCode,
        cubeCode: cubeCode || filterMeta.cubeCode,
        cubeTenantId: corpId || filterMeta.cubeTenantId,
        operator: 'IN',
        values: [],
      });
    }
  });

  return newMap;
}

// ── 图表配置验证 ──────────────────────────────────────

function validateChartConfig(chart, chartIndex) {
  const chartLabel = `图表${chartIndex + 1} [${chart.type || 'bar'}] "${chart.title || '未命名'}"`;
  let hasError = false;

  if (!chart.cubeCode) {
    console.error(`⚠️  ${chartLabel}: 缺少 cubeCode（数据源）`);
    hasError = true;
  }

  const chartType = chart.type || 'bar';

  if (['bar', 'line', 'pie', 'funnel', 'radar', 'heatmap', 'wordcloud', 'map'].includes(chartType)) {
    if (!chart.xField && !chart.yField) {
      console.error(`⚠️  ${chartLabel}: 缺少 xField 和 yField`);
      hasError = true;
    }
  }

  if (chartType === 'table') {
    if (!chart.columnFields && !chart.columns && !chart.fields) {
      console.error(`⚠️  ${chartLabel}: 缺少 columnFields`);
      hasError = true;
    }
  }

  if (chartType === 'indicator') {
    if (!chart.kpi && !chart.kpiField && !chart.yField && !chart.fields) {
      console.error(`⚠️  ${chartLabel}: 缺少 kpi 字段`);
      hasError = true;
    }
  }

  return !hasError;
}

// ── 报表 Schema 构建 ──────────────────────────────────

function buildReportSchema(reportTitle, charts, reportId, corpId) {
  const componentsMap = [...BASE_COMPONENTS];

  // 根据图表类型添加组件映射
  charts.forEach(chart => {
    const compName = CHART_COMPONENT_MAP[chart.type] || CHART_COMPONENT_MAP.bar;
    if (!componentsMap.some(c => c.componentName === compName)) {
      componentsMap.push({
        package: '@/components/vc-yida-report',
        version: '1.0.6',
        componentName: compName,
      });
    }
  });

  // 构建图表节点
  const chartNodes = charts.map((chart, index) => {
    const layout = getDefaultLayout(chart.type);
    const compName = CHART_COMPONENT_MAP[chart.type] || CHART_COMPONENT_MAP.bar;
    const dataSetModelMap = buildDataSetModelMap(chart, corpId);

    return {
      condition: true,
      componentName: compName,
      id: genNodeId(),
      props: {
        fieldId: genFieldId(chart.type),
        title: chart.title || '未命名图表',
        dataSetModelMap,
        layout: {
          x: 0,
          y: index * 10,
          w: layout.w,
          h: layout.h,
        },
      },
    };
  });

  const schema = {
    id: reportId,
    title: reportTitle,
    pages: [{
      componentsMap,
      componentsTree: [{
        componentName: 'Page',
        id: genNodeId(),
        props: {},
        children: [
          {
            componentName: 'RootHeader',
            id: genNodeId(),
            props: {},
            children: [{
              componentName: 'YoushuPageHeader',
              id: genNodeId(),
              props: {},
              children: [{
                componentName: 'PageHeaderContent',
                id: genNodeId(),
                props: {},
                children: [],
              }],
            }],
          },
          {
            componentName: 'RootContent',
            id: genNodeId(),
            props: {},
            children: chartNodes,
          },
          {
            componentName: 'RootFooter',
            id: genNodeId(),
            props: {},
            children: [{
              componentName: 'FooterYida',
              id: genNodeId(),
              props: {},
            }],
          },
        ],
      }],
    }],
  };

  return schema;
}

// ── 筛选器配置处理 ────────────────────────────────────

function normalizeFilterDef(filterDef) {
  if (filterDef.valueField) {
    return filterDef;
  }
  if (!filterDef.fieldCode) {
    return filterDef;
  }

  const fieldCode = filterDef.fieldCode;
  const aliasName = filterDef.label || filterDef.title || '筛选器';
  const dataType = filterDef.dataType || 'STRING';
  const fieldObj = { fieldCode, aliasName, dataType };

  return {
    ...filterDef,
    title: filterDef.label || filterDef.title || '筛选器',
    valueField: fieldObj,
    labelField: fieldObj,
    filterFieldCode: fieldCode,
  };
}

function autoGenerateFilters(charts) {
  const selectFieldMap = new Map();

  for (const chart of charts) {
    const cubeCode = chart.cubeCode || '';
    const fieldsToScan = [];

    if (chart.xField) fieldsToScan.push(chart.xField);
    if (Array.isArray(chart.yField)) fieldsToScan.push(...chart.yField);
    else if (chart.yField) fieldsToScan.push(chart.yField);
    if (Array.isArray(chart.columnFields)) fieldsToScan.push(...chart.columnFields);
    if (chart.kpiField) fieldsToScan.push(chart.kpiField);

    for (const field of fieldsToScan) {
      const fieldCode = typeof field === 'string' ? field : (field && field.fieldCode);
      if (!fieldCode) continue;

      const SELECT_PREFIXES = ['selectField_', 'radioField_', 'checkboxField_', 'multiSelectField_'];
      const isSelectLike = SELECT_PREFIXES.some(prefix => fieldCode.startsWith(prefix));
      if (!isSelectLike) continue;

      const baseFieldCode = fieldCode.endsWith('_value') ? fieldCode.slice(0, -6) : fieldCode;
      if (selectFieldMap.has(baseFieldCode)) continue;

      const aliasName = (typeof field === 'object' && (field.aliasName || field.alias)) || baseFieldCode;
      selectFieldMap.set(baseFieldCode, {
        type: 'select',
        label: aliasName,
        cubeCode: cubeCode,
        fieldCode: baseFieldCode,
        dataType: (typeof field === 'object' && field.dataType) || 'STRING',
      });
    }
  }

  return Array.from(selectFieldMap.values()).map(normalizeFilterDef);
}

function readReportConfig(chartsJsonOrFile) {
  let raw;

  if (fs.existsSync(chartsJsonOrFile)) {
    try {
      raw = JSON.parse(fs.readFileSync(chartsJsonOrFile, 'utf-8'));
    } catch (e) {
      console.error('[report] 读取配置文件失败:', e.message);
      process.exit(1);
    }
  } else {
    try {
      raw = JSON.parse(chartsJsonOrFile);
    } catch (e) {
      console.error('[report] 配置解析失败:', e.message);
      process.exit(1);
    }
  }

  if (Array.isArray(raw)) {
    return { charts: raw, filters: autoGenerateFilters(raw) };
  }

  if (raw && Array.isArray(raw.charts)) {
    const explicitFilters = Array.isArray(raw.filters) ? raw.filters.map(normalizeFilterDef) : [];
    const filters = explicitFilters.length > 0 ? explicitFilters : autoGenerateFilters(raw.charts);
    return { charts: raw.charts, filters };
  }

  console.error('[report] 配置格式错误：必须是图表数组或包含 charts 字段的对象');
  process.exit(1);
}

// ── 主流程 ────────────────────────────────────────────

async function createReport(appType, reportTitle, chartsJsonOrFile, options = {}) {
  const SEP = '='.repeat(50);
  console.log(SEP);
  console.log('[report] 宜搭报表创建引擎');
  console.log(SEP);
  console.log('应用 ID:', appType);
  console.log('报表名称:', reportTitle);

  // Step 1: 读取登录态
  console.log('\n[Step 1] 读取登录态...');
  const cookieData = loadCookieData(options.projectRoot);
  if (!cookieData) {
    console.error('❌ 未找到登录态，请先登录');
    return { success: false, error: '未找到登录态' };
  }

  const csrfToken = cookieData.csrf_token || '';
  const cookies = cookieData.cookies || [];
  const baseUrl = resolveBaseUrl(cookieData);
  const corpId = cookieData.corp_id || '';

  console.log('登录态就绪，域名:', baseUrl);
  console.log('组织 ID:', corpId || '（未获取到）');

  const authRef = { csrfToken, cookies, baseUrl, cookieData };

  // Step 2: 读取图表定义
  console.log('\n[Step 2] 读取图表定义...');
  const { charts, filters } = readReportConfig(chartsJsonOrFile);
  console.log('图表数量:', charts.length);
  console.log('筛选器数量:', filters.length);

  // Step 2.5: 视图表字段转换（columnName -> measureCode）
  const hasViewTable = charts.some(c => isViewTableCubeCode(c.cubeCode)) || filters.some(f => isViewTableCubeCode(f.cubeCode));
  if (hasViewTable) {
    console.log('\n[Step 2.5] 视图表字段转换...');
    await convertViewTableFields(charts, filters, authRef, appType);
  }

  // 预校验
  let hasConfigError = false;
  charts.forEach((chart, i) => {
    console.log(`  ${i + 1}. [${chart.type}] ${chart.title || '未命名'} (cubeCode: ${chart.cubeCode || '未配置'})`);
    if (!validateChartConfig(chart, i)) {
      hasConfigError = true;
    }
  });

  if (hasConfigError) {
    console.error('\n❌ 图表配置存在错误，请修正后重试。');
    return { success: false, error: '图表配置错误' };
  }

  // Step 3: 创建空白报表
  console.log('\n[Step 3] 创建空白报表...');
  const createResult = await createBlankReport(baseUrl, csrfToken, cookies, appType, reportTitle);

  if (!createResult || !createResult.success || !createResult.content) {
    const errorMsg = createResult ? (createResult.errorMsg || '未知错误') : '请求失败';
    console.error('创建报表失败:', errorMsg);
    return { success: false, error: errorMsg };
  }

  const reportId = createResult.content.formUuid || createResult.content;
  console.log('报表创建成功，ID:', reportId);

  // Step 4: 构建报表 Schema
  console.log('\n[Step 4] 构建报表 Schema...');
  const schema = buildReportSchema(reportTitle, charts, reportId, corpId);

  // 注入筛选器
  if (filters.length > 0) {
    console.log('[Step 4.1] 注入筛选器...');

    const page = schema.pages[0];
    const componentsTree = page.componentsTree[0];

    const rootHeader = componentsTree.children.find(c => c.componentName === 'RootHeader');
    const pageHeader = rootHeader && rootHeader.children && rootHeader.children.find(c => c.componentName === 'YoushuPageHeader');
    const pageHeaderContent = pageHeader && pageHeader.children && pageHeader.children.find(c => c.componentName === 'PageHeaderContent');

    if (pageHeaderContent) {
      const filterComponents = ['YoushuSelectFilter', 'YoushuTopFilterContainer'];
      filterComponents.forEach(compName => {
        if (!page.componentsMap.some(c => c.componentName === compName)) {
          page.componentsMap.push({
            package: '@/components/vc-yida-report',
            version: '1.0.6',
            componentName: compName,
          });
        }
      });

      const builtFilters = filters.map(filterDef => {
        const valueFieldDef = filterDef.valueField || {
          fieldCode: filterDef.filterFieldCode || filterDef.fieldCode || '',
          aliasName: filterDef.title || filterDef.label || '筛选器',
          dataType: filterDef.dataType || 'STRING',
        };
        const labelFieldDef = filterDef.labelField || valueFieldDef;
        const filterTitle = valueFieldDef.aliasName || filterDef.title || filterDef.label || '筛选器';

        return buildSelectFilter(
          { ...filterDef, cubeTenantId: filterDef.cubeTenantId || corpId, title: filterTitle },
          valueFieldDef,
          labelFieldDef,
          null,
          filterDef.cubeTenantId || corpId,
        );
      });

      const containerFieldId = genFieldId('filter');
      const filterContainer = buildFilterContainer(builtFilters, containerFieldId);
      if (!pageHeaderContent.children) pageHeaderContent.children = [];
      pageHeaderContent.children.push(filterContainer);

      const rootContent = componentsTree.children.find(c => c.componentName === 'RootContent');
      builtFilters.forEach((builtFilter, fi) => {
        const filterDef = filters[fi];
        const filterMeta = builtFilter.__filterMeta__;
        const linkTo = filterDef.linkTo || [];
        const targetCharts = linkTo.length > 0 ? linkTo : charts.map((_, idx) => idx);

        targetCharts.forEach(target => {
          const chartIndex = typeof target === 'number' ? target : charts.findIndex(c => c.title === target);
          if (chartIndex < 0 || chartIndex >= charts.length) return;

          const chart = charts[chartIndex];
          const chartNode = rootContent && rootContent.children && rootContent.children[chartIndex];
          if (!chartNode || !chartNode.props || !chartNode.props.dataSetModelMap) return;

          const filterFieldCode = filterDef.filterFieldCode || (filterDef.valueField && filterDef.valueField.fieldCode) || '';
          const cubeCode = chart.cubeCode || filterDef.cubeCode || '';

          chartNode.props.dataSetModelMap = injectFilterLinkage(
            chartNode.props.dataSetModelMap,
            filterMeta,
            filterFieldCode,
            cubeCode,
            corpId,
          );
          console.log(`  筛选器${fi + 1} 已联动到图表${chartIndex + 1}: ${chart.title || chart.type}`);
        });
      });

      console.log('筛选器注入完成，数量:', builtFilters.length);
    }
  }

  console.log('Schema 构建完成，图表数:', charts.length);

  // Step 5: 保存报表 Schema
  console.log('\n[Step 5] 保存报表 Schema...');

  // 调试：保存 Schema 到临时文件
  const debugSchemaPath = path.join(process.cwd(), 'temp-file', `report-schema-${reportId}.json`);
  try {
    const debugDir = path.dirname(debugSchemaPath);
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    fs.writeFileSync(debugSchemaPath, JSON.stringify(schema, null, 2), 'utf-8');
    console.log('调试：Schema 已保存到:', debugSchemaPath);
  } catch (e) {
    console.log('调试：保存 Schema 失败:', e.message);
  }

  const saveResult = await saveReportSchema(baseUrl, csrfToken, cookies, appType, reportId, schema);

  if (!saveResult || !saveResult.success) {
    const errorMsg = saveResult ? (saveResult.errorMsg || '未知错误') : '请求失败';
    console.error('保存 Schema 失败:', errorMsg);
    return { success: false, reportId, error: errorMsg };
  }

  console.log('Schema 保存成功！');

  const reportUrl = baseUrl + '/' + appType + '/workbench/' + reportId;
  console.log('\n' + SEP);
  console.log('✅ 报表创建成功！');
  console.log('报表 ID:', reportId);
  console.log('报表名称:', reportTitle);
  console.log('图表数量:', charts.length);
  console.log('访问链接:', reportUrl);
  console.log(SEP);

  return {
    success: true,
    reportId,
    reportTitle,
    appType,
    chartCount: charts.length,
    url: reportUrl,
  };
}

// ── CLI 入口 ──────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('用法: node report-engine.js <appType> "<报表名称>" <配置JSON文件路径>');
    console.log('示例: node report-engine.js APP_XXX "销售报表" charts.json');
    process.exit(1);
  }

  createReport(args[0], args[1], args[2]).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }).catch(err => {
    console.error('执行异常:', err.message);
    process.exit(1);
  });
}

module.exports = { createReport };
