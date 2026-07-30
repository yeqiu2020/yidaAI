# 宜搭报表数据查询API指南

> 版本: 1.0.0
> 更新: 2026-05-22
> 来源: 宜搭官方文档

---

## 一、核心接口

### 1.1 getDataAsync.json（实时查询）

```
POST /alibaba/web/{appType}/visual/visualizationDataRpc/getDataAsync.json
```

**适用场景**：获取报表组件的聚合数据，数据实时计算。

### 1.2 getCacheData.json（缓存查询）

```
POST /alibaba/web/{appType}/visual/visualizationDataRpc/getCacheData.json
```

**适用场景**：大数据量场景，性能更好，数据可能有延迟。

---

## 二、请求参数

### 2.1 Body 参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `pageId` | String | 是 | 报表页面 UUID | `REPORT-XXX` |
| `cid` | String | 是 | 组件节点 ID（node_xxx 格式） | `node_ocmmwwwhdmg` |
| `cname` | String | 是 | 组件显示名称 | `基础表格_1` |
| `componentClassName` | String | 是 | 组件类型 | `YoushuTable` |
| `queryContext` | String(JSON) | 是 | 查询上下文 | 见下方说明 |
| `dataSetKey` | String | 是 | 数据集标识 | `table` |
| `_csrf_token` | String | 是 | CSRF Token | `window.g_config._csrf_token` |
| `_tb_token_` | String | 是 | 同 CSRF Token | 同上 |
| `_csrf` | String | 是 | 同 CSRF Token | 同上 |
| `timezone` | String | 否 | 时区 | `GMT+8` |
| `pageName` | String | 否 | 固定值 | `report` |
| `prdId` | String | 是 | 报表 topicId，**必须动态获取** | 通过 API 获取 |

### 2.2 queryContext 结构

```json
{
  "aliasList": [],
  "filterValueMap": {
    "filter-xxx": ["筛选值"]
  },
  "dim2table": true,
  "orderByList": [],
  "needTotalCount": false,
  "variableParams": {},
  "paging": {
    "start": 0,
    "limit": 10
  }
}
```

| 字段 | 说明 |
|------|------|
| `filterValueMap` | 筛选条件，key 为筛选器 filterKey，value 为筛选值数组 |
| `paging.start` | 分页起始位置（从 0 开始） |
| `paging.limit` | 每页数据量 |
| `orderByList` | 排序规则数组 |
| `needTotalCount` | 是否返回总数 |

---

## 三、返回数据结构

```json
{
  "success": true,
  "content": {
    "data": [
      ["进行中", 8],
      ["已完成", 5]
    ],
    "meta": [
      { "alias": "项目状态", "dataType": "STRING", "type": "DIMENSION" },
      { "alias": "项目数量", "dataType": "LONG", "type": "MEASURE" }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `content.data` | 二维数组，每行一条数据 |
| `content.meta` | 字段元信息，包含 alias/dataType/type |
| `meta.type` | `DIMENSION`（维度）或 `MEASURE`（度量） |

---

## 四、prdId 动态获取（⚠️ 必须遵守）

**prdId 不能硬编码**，必须在运行时通过接口动态获取。

### 4.1 获取方式

```javascript
var _fetchPrdId = function() {
  var appType = window.pageConfig && window.pageConfig.appType;
  var csrfToken = window.g_config && window.g_config._csrf_token;
  var baseUrl = window.location.origin;
  var url = baseUrl + '/dingtalk/web/' + appType
    + '/query/formnav/getFormNavigationListByOrder.json'
    + '?_api=Nav.queryList&_mock=false&_csrf_token=' + encodeURIComponent(csrfToken);

  return fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'accept': 'application/json, text/json',
      'x-requested-with': 'XMLHttpRequest',
    },
  })
    .then(function(resp) { return resp.json(); })
    .then(function(res) {
      if (res.success && Array.isArray(res.content)) {
        var targetNav = res.content.find(function(item) {
          return item.formUuid === REPORT_FORM_UUID;
        });
        if (targetNav && targetNav.topicId) {
          return targetNav.topicId;
        }
        var reportNav = res.content.find(function(item) {
          return item.formType === 'report' && item.topicId;
        });
        if (reportNav) {
          return reportNav.topicId;
        }
        throw new Error('未找到报表的 topicId');
      }
      throw new Error(res.errorMsg || '获取导航菜单失败');
    });
};
```

---

## 五、报表数据请求模板

### 5.1 在自定义页面中调用

```javascript
var _prdId = null;

var _fetchReportData = function(component, filterValueMap) {
  var appType = window.pageConfig && window.pageConfig.appType;
  var csrfToken = window.g_config && window.g_config._csrf_token;
  var body = new URLSearchParams({
    timezone: 'GMT+8',
    _tb_token_: csrfToken,
    _csrf_token: csrfToken,
    _csrf: csrfToken,
    prdId: _prdId,
    pageId: REPORT_FORM_UUID,
    pageName: 'report',
    cid: component.cid,
    cname: component.cname || '',
    componentClassName: component.className,
    queryContext: JSON.stringify({
      filterValueMap: filterValueMap || {},
      dim2table: true
    }),
    dataSetKey: component.dataSetKey,
  });
  var url = '/alibaba/web/' + appType + '/visual/visualizationDataRpc/getDataAsync.json';
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    credentials: 'include',
  })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      if (result.success) return result.content;
      throw new Error(result.errorMsg || '报表数据获取失败');
    });
};
```

### 5.2 通过 yida SDK 调用

```javascript
this.utils.yida.request({
  url: "/alibaba/web/" + APP_TYPE + "/visual/visualizationDataRpc/getDataAsync.json",
  method: "POST",
  data: {
    pageName: "report",
    prdId: prdId,
    pageId: "REPORT-XXX",
    cid: "node_xxx",
    cname: "按状态统计",
    componentClassName: "YoushuTable",
    dataSetKey: "table",
    queryContext: JSON.stringify({ filterValueMap: {}, dim2table: true }),
  },
});
```

---

## 六、常见组件类型

| componentClassName | 说明 | dataSetKey |
|-------------------|------|-----------|
| `YoushuTable` | 基础表格 | `table` |
| `YoushuGroupedBarChart` | 柱状图 | `chartData` |
| `YoushuLineChart` | 折线图 | `chartData` |
| `YoushuPieChart` | 饼图 | `chartData` |
| `YoushuSimpleIndicatorCard` | 指标卡 | `youshuData` |
| `YoushuFunnelChart` | 漏斗图 | `chartData` |
| `YoushuGauge` | 仪表盘 | `chartData` |
| `YoushuComboChart` | 组合图 | `dataSetName` |
| `YoushuCrossPivotTable` | 交叉透视表 | `table` |

---

## 七、常见问题

### Q：报表 API 返回空数据？

检查以下项：
1. `dataSetKey` 是否正确（指标卡用 `youshuData`，表格用 `table`，其他用 `chartData`）
2. `prdId` 是否通过动态获取（不能硬编码）
3. `pageId` 是否使用了报表的 REPORT-xxx（不能用自定义页面的 FORM-xxx）
4. `cid` 是否正确（必须是 node_xxx 格式，不是 YoushuXxx_xxx 格式）

### Q：cid 和 fieldId 的区别？

| 名称 | 格式 | 用途 |
|------|------|------|
| `cid` | `node_xxx` | getDataAsync.json 的请求参数 |
| `fieldId` | `YoushuXxx_xxx` | Schema 中组件标识符，不能用于 API 请求 |

### Q：如何获取 cid？

1. 执行 `node .agents/skills/get-schema/scripts/get-schema.js <appType> <reportFormUuid>` 获取报表 Schema
2. 在 `componentsTree` 中找到目标组件节点，其 `id` 字段即为 `cid`
3. 或在浏览器 DevTools Network 中筛选 `getDataAsync` 请求查看

---

**文档版本**: 1.0.0
**最后更新**: 2026-05-22
