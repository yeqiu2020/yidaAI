'use strict';

/**
 * aggregate-lifecycle.js — 聚合表/视图表完整生命周期（P1-1，v1.0.0）
 *
 * API 契约 1:1 移植自官方 openyida 包（MIT，版本 2026.9.24）lib/aggregate-table/aggregate-table.js，
 * 设计校验直接引入官方 contract.js（本目录 aggregate-contract.js，仅做 require 路径适配）。
 * 差异点：官方用 token 鉴权，本脚本用本项目 .cookies.json 鉴权（api-client 体系）。
 *
 * 命令：
 *   list <appType> [--keyword 关键字]                       列出聚合表（formType=virtualView）
 *   create-empty <appType> <名称>                           创建空聚合表
 *   inspect <appType> <formUuid> [--json]                   结构检查（含双 revision）
 *   preview <appType> <formUuid> <design文件>               数据预览（不落库）
 *   save <appType> <formUuid> <design文件> [--expected-revision R]   草稿保存（stash 轴）
 *   publish <appType> <formUuid> <design文件> [--expected-revision R] 发布（live 轴）
 *   status <appType> <formUuid>                             构建状态查询
 *
 * revision 防覆盖机制（移植自官方）：
 * - save 走 stashGmtModified 轴、publish 走 gmtModified 轴；提交前读取当前轴值作为乐观锁，
 *   可用 --expected-revision 显式声明"我基于的版本"，不一致报 AGGREGATE_WRITE_PRECONDITION_FAILED（防盲覆盖他人改动）
 * - 写入后回读校验：revision 必须前进（AGGREGATE_WRITE_READBACK_REVISION_UNCHANGED/MISSING/MISMATCH）
 * - 设计内容回读比对：AGGREGATE_DESIGN_READBACK_MISMATCH（官方 contract 断言）
 */

const fs = require('fs');
const path = require('path');
const { postRequest, getRequest } = require('../../api-client/scripts/api_client');
const contract = require('./aggregate-contract');

const DESIGN_KEYS = contract.DESIGN_KEYS;
const REVISION_AXES = { save: 'stashGmtModified', publish: 'gmtModified' };
const ENDPOINTS = { preview: 'preview.json', save: 'saveStashConfig.json', publish: 'update.json' };
const FORM_TYPE_VIRTUAL_VIEW = 'virtualView';

// ==================== 鉴权与 HTTP（本项目 cookie 体系） ====================
// 🔴 必须读 .cookies.json 全量 cookie（含 c_csrf 等 38 项）：宜搭 POST 类接口的 CSRF 是
// "body token == cookie token" 双重校验，coreUtils.loadCookieData 的过滤子集会导致「csrf校验失败」
// （2026-09-28 P1-1 实测；与 data-tester loadCookies 同理，硬规则8 的向上追溯路径写法）

function buildAuth() {
  const cookieFile = path.resolve(__dirname, '..', '..', '..', '..', '.cookies.json');
  const raw = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
  const baseUrl = raw.baseUrl || raw.base_url;
  if (!baseUrl || !Array.isArray(raw.cookies)) { throw new Error('登录态无效: 请先运行 api-client login_manager'); }
  return { baseUrl, cookies: raw.cookies, csrfToken: raw.csrf_token || raw.csrfToken };
}

function unwrap(result, action) {
  if (!result || result.success === false || result.__needLogin) {
    const detail = result && (result.errorMsg || result.message);
    throw new Error('聚合表' + action + '失败: ' + (detail || '需要重新登录或接口异常'));
  }
  return result.content !== undefined ? result.content : result;
}

async function httpPost(auth, requestPath, params) {
  // 🔴 api_client.postRequest 不会自动注入 _csrf_token（各调用方显式加）。漏加 → 服务端「csrf校验失败」
  // （2026-09-28 P1-1 实测：show.json 传空 params 报 csrf 失败，注入后通过）
  const payload = Object.assign({}, params || {});
  if (payload._csrf_token === undefined) { payload._csrf_token = auth.csrfToken; }
  return postRequest(auth.baseUrl, requestPath, payload, auth.cookies);
}

async function httpGet(auth, requestPath, queryParams) {
  return getRequest(auth.baseUrl, requestPath, queryParams || {}, auth.cookies);
}

// ==================== API（端点与官方一致） ====================

async function checkVirtualViewFeature(auth, appType) {
  return httpPost(auth, `/dingtalk/web/${appType}/query/virtualview/show.json`, {});
}

async function createEmptyVirtualView(auth, appType, title) {
  return httpPost(auth, `/dingtalk/web/${appType}/query/formdesign/saveFormSchemaInfo.json`, {
    formType: 'receipt',
    isVirtualView: 'y',
    title: JSON.stringify({ zh_CN: title, en_US: title, ja_JP: title, type: 'i18n' }),
  });
}

async function getVirtualViewConfig(auth, appType, formUuid) {
  return httpGet(auth, `/alibaba/web/${appType}/query/virtualview/get.json`, { formUuid });
}

async function postVirtualViewDesign(auth, appType, formUuid, designInfo, action, gmtModified) {
  const endpoint = ENDPOINTS[action];
  if (!endpoint) { throw new Error('未知聚合表动作: ' + action); }
  const payload = { formUuid, designInfo: JSON.stringify(designInfo) };
  if (gmtModified !== undefined) { payload.gmtModified = gmtModified === null ? '' : gmtModified; }
  return httpPost(auth, `/alibaba/web/${appType}/query/virtualview/${endpoint}`, payload);
}

async function queryBuildState(auth, appType, formUuid) {
  return httpGet(auth, `/alibaba/web/${appType}/query/virtualview/queryBuildState.json`, { formUuid });
}

async function fetchFormPageList(auth, appType) {
  const res = await httpGet(auth, `/dingtalk/web/${appType}/query/formnav/getFormNavigationListByOrder.json`, {});
  const content = res && (res.content !== undefined ? res.content : res);
  const items = Array.isArray(content) ? content : (content && content.data) || [];
  // 展平分组（与官方 form-navigation 语义一致：返回含 formType 的页面节点数组）
  const flat = [];
  for (const item of items) {
    if (Array.isArray(item && item.children)) {
      for (const child of item.children) { flat.push(child); }
    }
    flat.push(item);
  }
  return flat;
}

// ==================== revision 机制（移植官方） ====================

function selectRevision(config, action) {
  const axis = REVISION_AXES[action];
  return config && config[axis];
}

function isMissingRevision(value) {
  return value === undefined || value === null || value === '';
}

function assertRevisionAdvanced(action, beforeConfig, responseContent, readbackConfig) {
  const axis = REVISION_AXES[action];
  const beforeRevision = selectRevision(beforeConfig, action);
  const responseRevision = responseContent && responseContent.gmtModified;
  const readbackRevision = selectRevision(readbackConfig, action);
  if (isMissingRevision(readbackRevision)) {
    throw Object.assign(new Error('AGGREGATE_WRITE_READBACK_REVISION_MISSING'), { code: 'AGGREGATE_WRITE_READBACK_REVISION_MISSING' });
  }
  if (!isMissingRevision(beforeRevision) && String(readbackRevision) === String(beforeRevision)) {
    throw Object.assign(new Error('AGGREGATE_WRITE_READBACK_REVISION_UNCHANGED'), { code: 'AGGREGATE_WRITE_READBACK_REVISION_UNCHANGED' });
  }
  if (!isMissingRevision(responseRevision) && String(responseRevision) !== String(readbackRevision)) {
    throw Object.assign(new Error('AGGREGATE_WRITE_RESPONSE_READBACK_REVISION_MISMATCH'), {
      code: 'AGGREGATE_WRITE_RESPONSE_READBACK_REVISION_MISMATCH',
      details: { axis, responseRevision, readbackRevision },
    });
  }
  return { axis, verifiedRevision: readbackRevision, beforeRevision, responseRevision: responseRevision || null, readbackRevision };
}

// ==================== design 输入处理（移植官方 normalizeDesignConfig） ====================

function readJsonInput(input) {
  if (!input) { throw new Error('缺少 design JSON 文件路径'); }
  let raw = input;
  if (fs.existsSync(input)) { raw = fs.readFileSync(input, 'utf8'); }
  try { return JSON.parse(raw); } catch (err) { throw new Error('design JSON 解析失败: ' + err.message); }
}

function normalizeDesignConfig(rawConfig, formUuid) {
  let config = rawConfig;
  if (config && typeof config.designInfo === 'string') { config = JSON.parse(config.designInfo); }
  else if (config && config.designInfo && typeof config.designInfo === 'object') { config = config.designInfo; }
  else if (config && config.viewDesignConfig) { config = config.viewDesignConfig; }
  else if (config && Object.prototype.hasOwnProperty.call(config, 'content')) {
    config = config.content && config.content.viewDesignConfig ? config.content.viewDesignConfig : config.content;
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('design 必须是对象（含 ' + DESIGN_KEYS.join('/') + ' 数组）');
  }
  const normalized = { formUuid };
  for (const key of DESIGN_KEYS) { normalized[key] = config[key] === undefined ? [] : config[key]; }
  return normalized;
}

function summarizeConfig(config) {
  const c = config || {};
  return {
    formUuid: c.formUuid || '',
    isStashConfig: c.isStashConfig || '',
    gmtModified: c.gmtModified || null,
    stashGmtModified: c.stashGmtModified || null,
    counts: {
      relationForms: (c.relationForms || []).length,
      relationships: (c.relationships || []).length,
      aggregatedFields: (c.aggregatedFields || []).length,
      auxFields: (c.auxFields || []).length,
      formulaFields: (c.formulaFields || []).length,
      validators: (c.validators || []).length,
    },
  };
}

// ==================== 子命令 ====================

async function cmdList(auth, args) {
  const appType = args[0];
  const kwIdx = args.indexOf('--keyword');
  const keyword = kwIdx !== -1 ? args[kwIdx + 1] : '';
  if (!appType) { throw new Error('用法: list <appType> [--keyword 关键字]'); }
  const items = await fetchFormPageList(auth, appType);
  const tables = items
    .filter((n) => n && n.formType === FORM_TYPE_VIRTUAL_VIEW)
    .filter((n) => !keyword || [n.formName, n.formUuid, n.pathName].filter(Boolean).some((v) => String(v).toLowerCase().includes(keyword.toLowerCase())))
    .map((n) => ({ formUuid: n.formUuid, aggregateTableId: n.formUuid, name: n.formName || '', formType: FORM_TYPE_VIRTUAL_VIEW, pathName: n.pathName || '' }));
  console.error('聚合表列表: ' + tables.length + ' 个');
  console.log(JSON.stringify({ success: true, appType, count: tables.length, aggregateTables: tables }, null, 2));
}

async function cmdCreateEmpty(auth, args) {
  const appType = args[0], name = args[1];
  if (!appType || !name) { throw new Error('用法: create-empty <appType> <名称>'); }
  const feature = unwrap(await checkVirtualViewFeature(auth, appType), '能力检查');
  if (feature !== true) { throw new Error('当前应用/版本未启用聚合表能力（virtualview/show 返回 false）'); }
  const created = unwrap(await createEmptyVirtualView(auth, appType, name), '创建空聚合表');
  const formUuid = (created && created.formUuid) || created;
  if (!formUuid || !String(formUuid).length) {
    throw Object.assign(new Error('创建返回缺少 formUuid'), { code: 'AGGREGATE_CREATE_IDENTITY_MISSING' });
  }
  console.error('创建成功: ' + formUuid);
  console.log(JSON.stringify({
    success: true, appType, aggregateTableId: formUuid, formUuid, name, formType: FORM_TYPE_VIRTUAL_VIEW,
    designUrl: auth.baseUrl + '/alibaba/web/' + appType + '/design/virtualViewDesigner.html?formUuid=' + formUuid + '&fromNew=true',
    workbenchUrl: auth.baseUrl + '/' + appType + '/workbench/' + formUuid,
  }, null, 2));
}

async function cmdInspect(auth, args) {
  const appType = args[0], formUuid = args[1];
  if (!appType || !formUuid) { throw new Error('用法: inspect <appType> <formUuid>'); }
  const config = unwrap(await getVirtualViewConfig(auth, appType, formUuid), '结构检查');
  console.error('结构检查完成: ' + JSON.stringify(summarizeConfig(config)));
  console.log(JSON.stringify({ success: true, appType, formUuid, summary: summarizeConfig(config), config }, null, 2));
}

async function loadDesignForMutation(auth, appType, formUuid, input, action) {
  const designInfo = normalizeDesignConfig(readJsonInput(input), formUuid);
  const currentConfig = unwrap(await getVirtualViewConfig(auth, appType, formUuid), '提交前读取当前配置');
  const currentRevision = selectRevision(currentConfig, action);
  return { designInfo, currentConfig, currentRevision };
}

async function cmdSaveOrPublish(auth, args, action) {
  const appType = args[0], formUuid = args[1], input = args[2];
  const revIdx = args.indexOf('--expected-revision');
  const expectedRevision = revIdx !== -1 ? args[revIdx + 1] : null;
  if (!appType || !formUuid || !input) { throw new Error('用法: ' + action + ' <appType> <formUuid> <design文件> [--expected-revision R]'); }

  const { designInfo, currentConfig, currentRevision } = await loadDesignForMutation(auth, appType, formUuid, input, action);
  // 防盲覆盖：显式声明"我基于的版本"时强校验（多人协作场景）
  if (expectedRevision !== null && (isMissingRevision(currentRevision) || String(currentRevision) !== String(expectedRevision))) {
    throw Object.assign(new Error('AGGREGATE_WRITE_PRECONDITION_FAILED'), {
      code: 'AGGREGATE_WRITE_PRECONDITION_FAILED',
      details: { axis: REVISION_AXES[action], expectedRevision, observedRevision: currentRevision || null },
    });
  }
  // 官方契约校验（draft/publish 两档）
  const check = contract.validateAggregateDesignConfig(designInfo, { mode: action === 'publish' ? 'publish' : 'draft' });
  if (!check.valid) {
    throw Object.assign(new Error('AGGREGATE_DESIGN_CONTRACT_INVALID: ' + check.errors.map((e) => e.code).join(', ')), {
      code: 'AGGREGATE_DESIGN_CONTRACT_INVALID', details: check.errors,
    });
  }

  const result = unwrap(await postVirtualViewDesign(auth, appType, formUuid, designInfo, action, currentRevision), action === 'publish' ? '发布' : '草稿保存');
  const readback = unwrap(await getVirtualViewConfig(auth, appType, formUuid), '回读');
  contract.assertAggregateDesignReadback(designInfo, readback);
  const revisionProof = assertRevisionAdvanced(action, currentConfig, result, readback);
  console.error((action === 'publish' ? '发布成功' : '草稿保存成功') + ' revision(' + revisionProof.axis + ')=' + revisionProof.verifiedRevision);
  console.log(JSON.stringify({
    success: true, action, appType, aggregateTableId: formUuid, formUuid,
    revisionAxis: revisionProof.axis, revision: revisionProof.verifiedRevision,
    beforeRevision: revisionProof.beforeRevision, readbackVerified: true,
  }, null, 2));
}

async function cmdStatus(auth, args) {
  const appType = args[0], formUuid = args[1];
  if (!appType || !formUuid) { throw new Error('用法: status <appType> <formUuid>'); }
  const state = unwrap(await queryBuildState(auth, appType, formUuid), '状态查询');
  console.log(JSON.stringify({ success: true, appType, formUuid, buildState: state }, null, 2));
}

// ==================== 入口 ====================

async function run(args) {
  const command = args[0];
  const rest = args.slice(1);
  const auth = buildAuth();
  switch (command) {
    case 'list': return cmdList(auth, rest);
    case 'create-empty': return cmdCreateEmpty(auth, rest);
    case 'inspect': return cmdInspect(auth, rest);
    case 'preview': {
      const appType = rest[0], formUuid = rest[1], input = rest[2];
      if (!appType || !formUuid || !input) { throw new Error('用法: preview <appType> <formUuid> <design文件>'); }
      const designInfo = normalizeDesignConfig(readJsonInput(input), formUuid);
      const check = contract.validateAggregateDesignConfig(designInfo, { mode: 'draft' });
      if (!check.valid) { throw Object.assign(new Error('AGGREGATE_DESIGN_CONTRACT_INVALID'), { details: check.errors }); }
      const rows = unwrap(await postVirtualViewDesign(auth, appType, formUuid, designInfo, 'preview'), '数据预览');
      const rowCount = Array.isArray(rows) ? rows.length : 0;
      console.error('预览完成: ' + rowCount + ' 行');
      console.log(JSON.stringify({ success: true, appType, formUuid, rowCount, rows }, null, 2));
      return;
    }
    case 'save': return cmdSaveOrPublish(auth, rest, 'save');
    case 'publish': return cmdSaveOrPublish(auth, rest, 'publish');
    case 'status': return cmdStatus(auth, rest);
    default:
      throw new Error('未知命令: ' + command + '（可用: list/create-empty/inspect/preview/save/publish/status）');
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).catch((err) => {
    console.error('执行异常: ' + err.message);
    if (err.details) { console.error('详情: ' + JSON.stringify(err.details)); }
    console.log(JSON.stringify({ success: false, code: err.code || 'ERROR', error: err.message }));
    process.exit(1);
  });
}

module.exports = { run, REVISION_AXES, ENDPOINTS, FORM_TYPE_VIRTUAL_VIEW };
