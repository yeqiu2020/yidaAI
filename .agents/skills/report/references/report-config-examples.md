# 报表配置完整示例集与样式/布局细则

> 本文件由 SKILL.md 下沉而来，收录完整的报表配置 JSON 示例、指标卡样式参数、业务场景模板与默认布局细则。
> 字段配置规则见 [report-field-config-guide.md](report-field-config-guide.md)，API 文档见 [report-api-guide.md](report-api-guide.md)。

---

## 指标卡样式参数详表（indicatorStyle）

| 参数 | 说明 | 可选值 | 默认值 |
|------|------|--------|--------|
| `showSideStyle` | 侧边条样式 | `'NONE'`(无) / `'SOLID'`(实线) / `'GRADIENT'`(渐变) | `'SOLID'` |
| `sideBarColor` | 侧边条颜色 | 色值如 `'#0089FF'` | `'#0089FF'` |
| `bgColorType` | 背景填充类型 | `'single'`(纯色) / `'gradient'`(渐变) / `'multiple'`(多色) | `'single'` |
| `singleBgColor` | 纯色背景色 | 色值如 `'#F1F2F3'` | `'#F1F2F3'` |
| `colorType` | 指标值颜色类型 | `'SCHEMA_COLOR'`(主题色) / `'custom'`(自定义) | `'SCHEMA_COLOR'` |
| `customColor` | 自定义颜色序列 | 逗号分隔色值 | `'#0089FF,#FF9200,...'` |
| `columnCount` | 每行显示指标数 | 数字 | `4` |
| `valueSize` | 指标值字号 | 如 `'20px'` | `'20px'` |
| `size` | 指标卡大小 | `'small'` / `'normal'` / `'large'` | `'normal'` |

**推荐配色方案**：

| 场景 | showSideStyle | sideBarColor | bgColorType | singleBgColor |
|------|:---:|:---:|:---:|:---:|
| 默认 | SOLID | #0089FF | single | #F1F2F3 |
| 库存 | SOLID | #11AB4F | single | #F0FFF4 |
| 采购 | SOLID | #FF9200 | single | #FFF8F0 |
| 销售 | SOLID | #0089FF | single | #F0F7FF |
| 财务 | SOLID | #7263EE | single | #F5F0FF |

---

## 标准报表模板（按业务场景选择）

| 业务场景 | 推荐图表组合 | 布局 |
|---------|------------|------|
| **库存分析** | 指标卡(产品种类/库存总量/盘点次数/调拨次数) + 饼图(产品分类分布) + 柱状图(各仓库库存) + 折线图(库存变动趋势) + 表格(产品明细) | 指标卡→饼图+柱状图→折线图→表格 |
| **采购分析** | 指标卡(采购订单数/采购总额/入库单数/入库总额) + 柱状图(供应商采购额排名) + 饼图(采购状态分布) + 折线图(采购趋势) + 表格(采购明细) | 指标卡→柱状图+饼图→折线图→表格 |
| **销售分析** | 指标卡(销售订单数/销售总额/客户数/未收款额) + 柱状图(客户销售额排名) + 饼图(产品销售占比) + 折线图(销售趋势) + 表格(销售明细) | 指标卡→柱状图+饼图→折线图→表格 |
| **财务分析** | 指标卡(总收入/总支出/净利润/待收款) + 柱状图(月度收支对比) + 饼图(支出分类) + 折线图(资金趋势) + 表格(收付款明细) | 指标卡→柱状图+饼图→折线图→表格 |
| **通用分析** | 指标卡(核心指标) + 饼图(分类分布) + 柱状图(排名对比) + 折线图(趋势) + 表格(明细) | 指标卡→饼图+柱状图→折线图→表格 |

---

## 默认布局详表（6列栅格系统）

| 图表类型 | 默认宽度 w | 默认高度 h | 布局效果 |
|---------|-----------|-----------|---------|
| 指标卡 | 6 | 6 | 占满整行 |
| 饼图 | 3 | 22 | 半行 |
| 柱状图 | 3 | 22 | 半行 |
| 折线图 | 3 | 22 | 半行 |
| 组合图 | 6 | 22 | 占满整行 |
| 表格 | 6 | 38 | 占满整行 |
| 透视表 | 6 | 30 | 占满整行 |
| 仪表盘 | 2 | 18 | 1/3行 |

---

## 示例 1：基础配置格式（filters + charts 结构）

```json
{
  "filters": [
    {
      "type": "select",
      "label": "行业",
      "cubeCode": "FORM_XXX",
      "fieldCode": "selectField_xxx",
      "dataType": "STRING",
      "linkTo": [0, 1]
    }
  ],
  "charts": [
    {
      "type": "indicator",
      "title": "客户总数",
      "cubeCode": "FORM_XXX",
      "kpi": [
        {
          "fieldCode": "pid",
          "aliasName": "客户总数",
          "dataType": "STRING",
          "aggregateType": "COUNT"
        }
      ]
    },
    {
      "type": "pie",
      "title": "行业分布",
      "cubeCode": "FORM_XXX",
      "xField": {
        "fieldCode": "selectField_xxx_value",
        "aliasName": "行业",
        "dataType": "STRING",
        "aggregateType": "NONE"
      },
      "yField": [
        {
          "fieldCode": "pid",
          "aliasName": "数量",
          "dataType": "STRING",
          "aggregateType": "COUNT"
        }
      ]
    }
  ]
}
```

---

## 示例 2：完整报表配置（指标卡+饼图+柱状图+折线图+表格）

```json
{
  "filters": [
    {
      "type": "select",
      "label": "项目状态",
      "cubeCode": "FORM_XXX",
      "fieldCode": "selectField_status",
      "dataType": "STRING"
    }
  ],
  "charts": [
    {
      "type": "indicator",
      "title": "项目概况",
      "cubeCode": "FORM_XXX",
      "indicatorStyle": {
        "showSideStyle": "SOLID",
        "sideBarColor": "#0089FF",
        "bgColorType": "single",
        "singleBgColor": "#F0F7FF",
        "columnCount": 4
      },
      "kpi": [
        { "fieldCode": "pid", "aliasName": "项目总数", "dataType": "STRING", "aggregateType": "COUNT" },
        { "fieldCode": "numberField_budget", "aliasName": "预算总额", "dataType": "DOUBLE", "aggregateType": "SUM" },
        { "fieldCode": "numberField_actual", "aliasName": "实际支出", "dataType": "DOUBLE", "aggregateType": "SUM" }
      ]
    },
    {
      "type": "pie",
      "title": "状态分布",
      "cubeCode": "FORM_XXX",
      "xField": { "fieldCode": "selectField_status_value", "aliasName": "状态", "dataType": "STRING", "aggregateType": "NONE" },
      "yField": [{ "fieldCode": "pid", "aliasName": "数量", "dataType": "STRING", "aggregateType": "COUNT" }]
    },
    {
      "type": "bar",
      "title": "负责人分布",
      "cubeCode": "FORM_XXX",
      "xField": { "fieldCode": "employeeField_owner", "aliasName": "负责人", "dataType": "STRING", "aggregateType": "NONE" },
      "yField": [{ "fieldCode": "pid", "aliasName": "数量", "dataType": "STRING", "aggregateType": "COUNT" }]
    },
    {
      "type": "line",
      "title": "创建趋势",
      "cubeCode": "FORM_XXX",
      "xField": { "fieldCode": "dateField_created", "aliasName": "创建日期", "dataType": "DATE", "aggregateType": "NONE" },
      "yField": [{ "fieldCode": "pid", "aliasName": "数量", "dataType": "STRING", "aggregateType": "COUNT" }]
    },
    {
      "type": "table",
      "title": "项目列表",
      "cubeCode": "FORM_XXX",
      "columnFields": [
        { "fieldCode": "textField_name", "aliasName": "项目名称", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "selectField_status_value", "aliasName": "状态", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "employeeField_owner", "aliasName": "负责人", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "dateField_created", "aliasName": "创建日期", "dataType": "DATE", "aggregateType": "NONE" }
      ]
    }
  ]
}
```

---

## 示例 3：Playwright 验证脚本片段

```javascript
// 打开报表页面，监听 getDataAsync.json
page.on('response', async (res) => {
  if (res.url().includes('getDataAsync.json')) {
    const result = await res.json();
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      console.log(`❌ 失败: ${result.errorMsg}`);
    }
  }
});
```

---

## 示例 4：prdId 动态获取

```javascript
// 通过 getFormNavigationListByOrder 接口动态获取
var url = '/dingtalk/web/' + appType + '/query/formnav/getFormNavigationListByOrder.json';
```

### getDataAsync.json 参数详表

```
POST /alibaba/web/{appType}/visual/visualizationDataRpc/getDataAsync.json
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `pageId` | 是 | 报表页面UUID（REPORT-xxx） |
| `cid` | 是 | 组件节点ID（node_xxx格式） |
| `cname` | 是 | 组件显示名称 |
| `componentClassName` | 是 | 组件类型（如YoushuTable） |
| `dataSetKey` | 是 | 指标卡用`youshuData`，表格用`table`，其他用`chartData` |
| `prdId` | 是 | 必须动态获取，不能硬编码 |
| `queryContext` | 是 | JSON字符串，含filterValueMap/paging/orderByList |

更多 API 细节见 [report-api-guide.md](report-api-guide.md)。
