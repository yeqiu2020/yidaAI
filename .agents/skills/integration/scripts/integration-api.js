'use strict';

const querystring = require('querystring');
const path = require('path');
const { getRequest, postRequest, requestWithAutoLogin } = require(path.resolve(__dirname, '../../yida-api-client/scripts/api_client'));

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
  const layoutTypes = new Set([
    'Container', 'Card', 'Tab', 'TabPane', 'Grid', 'GridColumn',
    'Fieldset', 'Section', 'Collapse', 'CollapsePanel',
  ]);

  function collectFields(children) {
    for (const child of children) {
      if (layoutTypes.has(child.componentName)) {
        if (Array.isArray(child.children)) {
          collectFields(child.children);
        }
      } else {
        fieldComponents.push(child);
      }
    }
  }

  for (const page of pages) {
    const rootNode = page.componentsTree && page.componentsTree[0];
    if (rootNode && Array.isArray(rootNode.children)) {
      collectFields(rootNode.children);
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

module.exports = {
  getFormSchema,
  saveProcess,
  createLogicflow,
  listLogicflows,
  listFormLogicflows,
  listLogicflowLogs,
  switchLogicflow,
};
