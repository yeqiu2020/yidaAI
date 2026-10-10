'use strict';

const querystring = require('querystring');
const path = require('path');
const { getRequest, postRequest, requestWithAutoLogin } = require(path.resolve(__dirname, '../../api-client/scripts/api_client'));

async function getFormSchema(authRef, params) {
  const { appType, formUuid } = params;
  const response = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json?formUuid=${formUuid}&schemaVersion=V5`,
      null,
      auth.cookies
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    throw new Error(`获取表单 Schema 失败：${errorMsg}`);
  }

  let schemaContent = response.content;
  if (typeof schemaContent === 'string') {
    try {
      schemaContent = JSON.parse(schemaContent);
    } catch (parseError) {
      throw new Error(`解析表单 Schema 失败：${parseError.message}，原始内容：${schemaContent}`);
    }
  }

  const pages = schemaContent && Array.isArray(schemaContent.pages) ? schemaContent.pages : [];

  if (pages.length === 0) {
    return [];
  }

  const fieldComponents = [];

  // 鲁棒采集：只要节点带 props.fieldId 就视为字段收集；无论是否布局容器，只要有 children 就递归。
  // （旧逻辑靠 layoutTypes 白名单递归 → 遇到不在名单里的容器（如流程表单某些包裹/子表）就停止递归，
  //   导致 childList 只拿到外层包裹节点（无 fieldId）→ 新增/更新数据节点字段谱为空 → 设计器报“无效表单”。）
  function collectFields(children, parentLabel) {
    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      if (child.props && child.props.fieldId) {
        // 添加 __parentLabel 元数据，用于公式 __display 构建 "子表名.字段名"
        if (parentLabel) {
          child.props.__parentLabel = parentLabel;
        }
        fieldComponents.push(child);
      }
      if (Array.isArray(child.children) && child.children.length > 0) {
        // 子表容器(TableField)的 label 作为子表字段的 parentLabel
        const childLabel = child.props && child.props.label;
        const labelText = typeof childLabel === 'object' ? (childLabel.zh_CN || childLabel.en_US) : childLabel;
        collectFields(child.children, labelText || parentLabel);
      }
    }
  }

  for (const page of pages) {
    const rootNode = page.componentsTree && page.componentsTree[0];
    if (rootNode && Array.isArray(rootNode.children)) {
      collectFields(rootNode.children, null);
    }
  }

  return fieldComponents;
}

async function saveProcess(authRef, params) {
  const { appType, formUuid, processCode, processJson, viewJson, isOnline } = params;
  return requestWithAutoLogin((auth) => {
    const referer = `${auth.baseUrl}/${appType}/admin`;
    return postRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/simpleProcess/saveProcess.json`,
      {
        _csrf_token: auth.csrfToken,
        formUuid,
        isLogic: 'true',
        isOnline: String(isOnline),
        json: JSON.stringify(processJson),
        needReportLine: 'y',
        processCode,
        viewJson: JSON.stringify(viewJson),
      },
      auth.cookies,
      referer
    );
  }, authRef);
}

async function createLogicflow(authRef, params) {
  const { appType, formUuid, flowName } = params;
  const response = await requestWithAutoLogin((auth) => {
    const referer = `${auth.baseUrl}/${appType}/admin`;
    return postRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/formLogicflowBinding/createLogicflow.json`,
      {
        _csrf_token: auth.csrfToken,
        _locale_time_zone_offset: '28800000',
        name: flowName,
        type: '1',
        formUuid,
      },
      auth.cookies,
      referer
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    throw new Error(`新建逻辑流失败：${errorMsg}`);
  }

  const processCode = response.content && response.content.processCode;
  if (!processCode) {
    throw new Error(`新建逻辑流成功但未返回 processCode，响应：${JSON.stringify(response)}`);
  }
  return processCode;
}

async function listLogicflows(authRef, params) {
  const {
    appType,
    key = '',
    formUuid = '',
    status = '',
    type = '1',
    pageIndex = 1,
    pageSize = 10,
  } = params;

  const response = await requestWithAutoLogin((auth) => {
    const stamp = Date.now();
    const query = querystring.stringify({
      _api: 'Connector.getListflow',
      _mock: 'false',
      _csrf_token: auth.csrfToken,
      _locale_time_zone_offset: '28800000',
      type,
      key,
      appType,
      formUuid,
      status,
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
      _stamp: String(stamp),
    });
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/appLogicflowBinding/listflow.json?${query}`,
      null,
      auth.cookies
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    throw new Error(`查询逻辑流列表失败：${errorMsg}`);
  }

  const content = response.content || {};
  return {
    data: content.data || [],
    totalCount: content.totalCount || 0,
    hasMore: content.hasMore || false,
  };
}

async function listFormLogicflows(authRef, params) {
  const {
    appType,
    key = '',
    formUuid = '',
    status = '',
    type = '1',
    pageIndex = 1,
    pageSize = 10,
  } = params;

  const response = await requestWithAutoLogin((auth) => {
    const stamp = Date.now();
    const query = querystring.stringify({
      _api: 'Connector.getTriggerList',
      _mock: 'false',
      _csrf_token: auth.csrfToken,
      _locale_time_zone_offset: '28800000',
      type,
      key,
      appType,
      formUuid,
      status,
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
      _stamp: String(stamp),
    });
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/formLogicflowBinding/listflow.json?${query}`,
      null,
      auth.cookies
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    throw new Error(`查询表单逻辑流列表失败：${errorMsg}`);
  }

  const content = response.content || {};
  return {
    data: content.data || [],
    totalCount: content.totalCount || 0,
    hasMore: content.hasMore || false,
  };
}

async function listLogicflowLogs(authRef, params) {
  const {
    appType,
    processCode,
    dateType = 'modifyTime',
    status,
    formInstId,
    procInstId,
    startTime,
    endTime,
    pageIndex = 1,
    pageSize = 10,
  } = params;

  if (!appType) {
    throw new Error('查询逻辑流运行日志失败：缺少 appType');
  }
  if (!processCode) {
    throw new Error('查询逻辑流运行日志失败：缺少 processCode');
  }

  const response = await requestWithAutoLogin((auth) => {
    const stamp = Date.now();
    const queryParams = {
      _api: 'Connector.listLog',
      _mock: 'false',
      _csrf_token: auth.csrfToken,
      _locale_time_zone_offset: '28800000',
      dateType,
      processCode,
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
      _stamp: String(stamp),
    };

    if (status !== undefined && status !== null && status !== '') {
      queryParams.status = String(status);
    }
    if (formInstId) {
      queryParams.formInstId = formInstId;
    }
    if (procInstId) {
      queryParams.procInstId = procInstId;
    }
    if (startTime !== undefined && startTime !== null && startTime !== '') {
      queryParams.startTime = String(startTime);
    }
    if (endTime !== undefined && endTime !== null && endTime !== '') {
      queryParams.endTime = String(endTime);
    }

    const query = querystring.stringify(queryParams);
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/formLogicflowBinding/listLog.json?${query}`,
      null,
      auth.cookies
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    throw new Error(`查询逻辑流运行日志失败：${errorMsg}`);
  }

  const content = response.content || {};
  return {
    data: content.data || [],
    totalCount: content.totalCount || 0,
    currentPage: content.currentPage || pageIndex,
    hasMore: content.hasMore || false,
  };
}

async function switchLogicflow(authRef, params) {
  const { appType, formUuid, processCode, enable } = params;
  const response = await requestWithAutoLogin((auth) => {
    const stamp = Date.now();
    const referer = `${auth.baseUrl}/${appType}/admin`;
    return postRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/formLogicflowBinding/switchflow.json?_api=Connector.switchFlow&_mock=false&_stamp=${stamp}`,
      {
        _csrf_token: auth.csrfToken,
        _locale_time_zone_offset: '28800000',
        enable: enable ? 'y' : 'n',
        processCode,
        formUuid,
        type: '1',
      },
      auth.cookies,
      referer
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    throw new Error(`切换逻辑流状态失败：${errorMsg}`);
  }
  return response.content;
}

/**
 * 查询目标表单的信息（类型 + 名称）。
 * 用途：
 *   - 类型：创建集成自动化前校验「目标表单类型」是否匹配节点 setter 的 formTypes 白名单。
 *     - 新增数据(AddDataNode) 的表单选择器只查 formTypes=receipt → 目标必须是普通表单；
 *     - 发起审批(InitiateApprovalNode) 只查 formTypes=process → 目标必须是流程表单。
 *   - 名称：回填 viewJson/processJson 中节点卡片的表单名显示字段（formTitle / targetItem.formItem.title），
 *     否则卡片/下拉框只显示 UUID 或占位符（历史事故见 SKILL.md 避坑清单）。
 * 复用设计器同款接口 getFormAndAppInfo.json（用全类型过滤，保证任何表单都能查到其真实 formType 与 title）。
 * @returns {Promise<{formType: string|null, formTitle: string}|null>} 查不到返回 null；formTitle 取 title.zh_CN。
 */
async function getFormInfo(authRef, params) {
  const { appType, formUuid } = params;
  const qs =
    `supportSerialNo=y&ccMode=fold&formTypes=${encodeURIComponent('receipt,process,virtualView,report')}` +
    `&needAssocField=false&appType=${appType}&formUuid=${formUuid}`;
  const response = await requestWithAutoLogin((auth) => {
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/formdesign/getFormAndAppInfo.json?${qs}`,
      null,
      auth.cookies
    );
  }, authRef);

  if (!response || !response.success) {
    return null;
  }
  const content = response.content || {};
  const values =
    (content.formDatas && Array.isArray(content.formDatas.values) && content.formDatas.values) ||
    (Array.isArray(content.values) && content.values) ||
    [];
  if (!values.length) return null;
  const hit = values.find((v) => v && v.formUuid === formUuid) || values[0];
  if (!hit) return null;
  const rawTitle = hit.title;
  const formTitle = rawTitle && typeof rawTitle === 'object'
    ? (rawTitle.zh_CN || rawTitle.en_US || rawTitle.pureEn_US || '')
    : (rawTitle || '');
  return {
    formType: hit.formType || null,
    formTitle,
  };
}

/**
 * 查询目标表单的类型（receipt=普通表单 / process=流程表单 / virtualView=聚合表 / report=报表）。
 * 复用 getFormInfo；保留字符串返回类型以兼容 assertFormType 的调用方。
 * @returns {Promise<string|null>} formType 字符串；查不到返回 null。
 */
async function getFormType(authRef, params) {
  const info = await getFormInfo(authRef, params);
  return info ? info.formType : null;
}

/**
 * 查询目标表单的展示名称（用于节点卡片/下拉框回显表单名）。
 * @returns {Promise<string>} 表单名称（title.zh_CN）；查不到返回空字符串。
 */
async function getFormName(authRef, params) {
  const info = await getFormInfo(authRef, params);
  return info ? info.formTitle : '';
}

/**
 * 回读已有逻辑流的完整配置（processJson / viewJson）。
 * 用途：修改模式下先回读现有节点配置，供展示/比对。
 * 复用设计器同款接口 getProcess.json（GET，isLogic=true 表示逻辑流）。
 * @returns {Promise<{processCode, json, viewJson, name, ...}>} content 对象（json/viewJson 已解析为对象）
 */
async function getProcess(authRef, params) {
  const { appType, processCode } = params;
  if (!appType) {
    throw new Error('回读逻辑流失败：缺少 appType');
  }
  if (!processCode) {
    throw new Error('回读逻辑流失败：缺少 processCode');
  }
  const response = await requestWithAutoLogin((auth) => {
    const stamp = Date.now();
    const query = querystring.stringify({
      _csrf_token: auth.csrfToken,
      _locale_time_zone_offset: '28800000',
      processCode,
      isLogic: 'true',
      _stamp: String(stamp),
    });
    return getRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/simpleProcess/getProcess.json?${query}`,
      null,
      auth.cookies
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    throw new Error(`回读逻辑流失败：${errorMsg}`);
  }

  const content = response.content || {};
  const parseContent = (value) => {
    if (typeof value !== 'string') { return value; }
    try { return JSON.parse(value); } catch (e) { return value; }
  };
  const parsedContent = parseContent(content);
  const parseMaybe = (value) => {
    if (typeof value !== 'string') { return value; }
    try { return JSON.parse(value); } catch (e) { return value; }
  };
  return {
    ...(typeof parsedContent === 'object' ? parsedContent : content),
    json: parseMaybe(parsedContent.json),
    viewJson: parseMaybe(parsedContent.viewJson),
  };
}

/**
 * 删除逻辑流（集成自动化规则）。
 * API: POST /query/formLogicflowBinding/deleteflow.json (Connector.deleteFlow)
 * 注意：已启用（已开启）的流程不允许直接删除，需先关闭（switchLogicflow enable=false）再删除。
 * @param {object} authRef - 认证引用
 * @param {object} params - { appType, formUuid, processCode }
 * @returns {Promise<object>} 删除结果
 */
async function deleteLogicflow(authRef, params) {
  const { appType, formUuid, processCode } = params;
  if (!appType) {
    throw new Error('删除逻辑流失败：缺少 appType');
  }
  if (!processCode) {
    throw new Error('删除逻辑流失败：缺少 processCode');
  }
  if (!formUuid) {
    throw new Error('删除逻辑流失败：缺少 formUuid');
  }
  const response = await requestWithAutoLogin((auth) => {
    const stamp = Date.now();
    const referer = `${auth.baseUrl}/${appType}/admin`;
    return postRequest(
      auth.baseUrl,
      `/alibaba/web/${appType}/query/formLogicflowBinding/deleteflow.json?_api=Connector.deleteFlow&_mock=false&_stamp=${stamp}`,
      {
        _csrf_token: auth.csrfToken,
        _locale_time_zone_offset: '28800000',
        processCode,
        formUuid,
        type: '1',
      },
      auth.cookies,
      referer
    );
  }, authRef);

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || JSON.stringify(response) : '请求失败';
    const err = new Error(`删除逻辑流失败：${errorMsg}`);
    err.errorCode = response ? response.errorCode : null;
    err.needsDisable = errorMsg.includes('已启用') || errorMsg.includes('不允许删除');
    throw err;
  }
  return response.content;
}

module.exports = {
  getFormSchema,
  getFormType,
  getFormInfo,
  getFormName,
  saveProcess,
  getProcess,
  createLogicflow,
  deleteLogicflow,
  listLogicflows,
  listFormLogicflows,
  listLogicflowLogs,
  switchLogicflow,
};
