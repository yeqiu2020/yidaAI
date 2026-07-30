# 宜搭报表字段配置指南

> 版本: 1.0.0
> 更新: 2026-05-22
> 来源: 宜搭官方文档

---

## 一、字段类型与 fieldCode 格式

| 字段类型 | fieldCode 格式 | dataType | 说明 |
|---------|---------------|----------|------|
| TextField (单行文本) | `textField_xxx` | `STRING` | 直接使用原始 fieldCode |
| TextareaField (多行文本) | `textareaField_xxx` | `STRING` | 直接使用原始 fieldCode |
| NumberField (数字) | `numberField_xxx` | `DOUBLE` | 直接使用原始 fieldCode |
| SelectField (下拉单选) | `selectField_xxx_value` | `STRING` | **必须加 `_value` 后缀** |
| RadioField (单选) | `radioField_xxx_value` | `STRING` | **必须加 `_value` 后缀** |
| MultiSelectField (下拉多选) | `multiSelectField_xxx_value` | `STRING` | **必须加 `_value` 后缀** |
| CheckboxField (多选) | `checkboxField_xxx_value` | `STRING` | **必须加 `_value` 后缀** |
| DateField (日期) | `dateField_xxx` | `DATE` | 直接使用原始 fieldCode，**不要拆分** |
| EmployeeField (成员) | `employeeField_xxx` | `STRING` | 直接使用原始 fieldCode |
| DepartmentSelectField (部门) | `departmentSelectField_xxx` | `STRING` | 直接使用原始 fieldCode |
| 内置字段 pid | `pid` | `STRING` | 用于 COUNT 计数 |

---

## 二、cubeCode 格式规则

报表引擎的 `cubeCode` 使用**下划线**分隔，而 `formUuid` 使用**连字符**分隔：

```
formUuid:  FORM-AB4ACB9DD12C470D82047E05CDC19166CJSU
cubeCode:  FORM_AB4ACB9DD12C470D82047E05CDC19166CJSU  ← 连字符替换为下划线
```

转换规则：将 formUuid 中的所有 `-` 替换为 `_`

---

## 三、聚合类型与 dataType 对应关系

| aggregateType | 实际 dataType | 说明 |
|--------------|--------------|------|
| `COUNT` | `DOUBLE` | 计数结果始终是数值 |
| `COUNT_DISTINCT` | `DOUBLE` | 去重计数结果始终是数值 |
| `SUM` | `DOUBLE` | 求和结果始终是数值 |
| `AVG` | `DOUBLE` | 平均值结果始终是数值 |
| `MAX` | `DOUBLE` | 最大值结果始终是数值 |
| `MIN` | `DOUBLE` | 最小值结果始终是数值 |
| `NONE` | 保持原类型 | 不进行聚合，保持字段原始类型 |

---

## 四、各图表类型的字段配置要求

| 图表类型 | 必填字段 | 说明 |
|---------|---------|------|
| `indicator` | `kpi`（数组） | 每个 kpi 字段需要 fieldCode/aliasName/aggregateType |
| `pie` | `xField`（单个）+ `yField`（数组） | xField 为分类维度，yField 为数值度量 |
| `bar`/`line`/`area` | `xField`（单个）+ `yField`（数组） | 可选 `groupField` 分组 |
| `table` | `columnFields`（数组） | 每列一个字段对象 |
| `combo` | `xField` + `leftYFields` + `rightYFields` | 柱线混合图 |
| `gauge` | `valueField`（单个） | 可选 `assitValueField` |
| `pivot` | `columnList`（数组） | 交叉透视表 |
| `funnel` | `xField` + `yField` | 漏斗图 |

---

## 五、dataSetKey 区分

| 组件类型 | dataSetKey |
|---------|-----------|
| YoushuSimpleIndicatorCard（指标卡） | `"youshuData"` |
| YoushuTable（统计表格） | `"table"` |
| 其他图表（柱/折/饼等） | `"chartData"` |
| 组合图 | `"dataSetName"` |

**用错 dataSetKey 会导致返回空数据。**

---

## 六、常见错误及解决方案

### 错误1：SelectField 字段显示为空

**原因**：未加 `_value` 后缀

**解决**：`selectField_xxx` → `selectField_xxx_value`

### 错误2：DateField 字段报错或显示异常

**原因**：错误地拆分为年月日时分秒6个字段

**解决**：直接使用原始 `dateField_xxx`，不要拆分

### 错误3：SUM 聚合返回 0

**原因**：字段类型是 TextField 而非 NumberField

**解决**：在表单中将字段类型改为 NumberField，或使用 COUNT 聚合

### 错误4：报表创建失败

**原因**：字段配置格式错误导致 Schema 构建失败

**解决**：
1. 检查所有 SelectField/RadioField 是否加了 `_value` 后缀
2. 检查 DateField 是否使用了原始 fieldCode
3. 检查 `dataType` 是否与字段类型匹配
4. 检查 `cubeCode` 格式是否正确

---

## 七、完整配置示例

```json
{
  "filters": [
    {
      "type": "select",
      "label": "行业",
      "cubeCode": "FORM_AB4ACB9DD12C470D82047E05CDC19166CJSU",
      "fieldCode": "selectField_k2ak55yx3",
      "dataType": "STRING"
    }
  ],
  "charts": [
    {
      "type": "indicator",
      "title": "客户总数",
      "cubeCode": "FORM_AB4ACB9DD12C470D82047E05CDC19166CJSU",
      "kpi": [
        {
          "fieldCode": "textField_k2ak1lrej",
          "aliasName": "客户名称",
          "dataType": "STRING",
          "aggregateType": "COUNT"
        }
      ]
    },
    {
      "type": "pie",
      "title": "客户行业分布",
      "cubeCode": "FORM_AB4ACB9DD12C470D82047E05CDC19166CJSU",
      "xField": {
        "fieldCode": "selectField_k2ak55yx3_value",
        "aliasName": "行业",
        "dataType": "STRING",
        "aggregateType": "NONE"
      },
      "yField": [
        {
          "fieldCode": "textField_k2ak1lrej",
          "aliasName": "客户名称",
          "dataType": "STRING",
          "aggregateType": "COUNT"
        }
      ]
    },
    {
      "type": "bar",
      "title": "客户来源渠道",
      "cubeCode": "FORM_AB4ACB9DD12C470D82047E05CDC19166CJSU",
      "xField": {
        "fieldCode": "selectField_k2ak68ptp_value",
        "aliasName": "客户来源",
        "dataType": "STRING",
        "aggregateType": "NONE"
      },
      "yField": [
        {
          "fieldCode": "textField_k2ak1lrej",
          "aliasName": "客户名称",
          "dataType": "STRING",
          "aggregateType": "COUNT"
        }
      ]
    },
    {
      "type": "line",
      "title": "客户创建趋势",
      "cubeCode": "FORM_AB4ACB9DD12C470D82047E05CDC19166CJSU",
      "xField": {
        "fieldCode": "dateField_k2ak7mxcx",
        "aliasName": "创建日期",
        "dataType": "DATE",
        "aggregateType": "NONE"
      },
      "yField": [
        {
          "fieldCode": "textField_k2ak1lrej",
          "aliasName": "客户名称",
          "dataType": "STRING",
          "aggregateType": "COUNT"
        }
      ]
    },
    {
      "type": "table",
      "title": "客户列表",
      "cubeCode": "FORM_AB4ACB9DD12C470D82047E05CDC19166CJSU",
      "columnFields": [
        { "fieldCode": "textField_k2ak1lrej", "aliasName": "客户名称", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "textField_k2ak2gbo8", "aliasName": "联系人", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "textField_k2ak3dlc4", "aliasName": "电话", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "selectField_k2ak55yx3_value", "aliasName": "行业", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "selectField_k2ak68ptp_value", "aliasName": "客户来源", "dataType": "STRING", "aggregateType": "NONE" },
        { "fieldCode": "dateField_k2ak7mxcx", "aliasName": "创建日期", "dataType": "DATE", "aggregateType": "NONE" }
      ]
    }
  ]
}
```

---

## 八、获取字段配置信息

### 方法1：通过表单 Schema 获取

```bash
node .agents/skills/get-schema/scripts/get-schema.js <appType> <formUuid>
```

从返回的 Schema 中提取各字段的 `fieldId` 和类型。

### 方法2：查看表单设计器

在宜搭表单设计器中，点击字段查看属性，获取 `fieldCode` 和字段类型。

### 方法3：通过 config-sync 同步

使用 `config-sync` 技能同步应用配置，自动获取所有字段ID。

---

**文档版本**: 1.0.0
**最后更新**: 2026-05-22
