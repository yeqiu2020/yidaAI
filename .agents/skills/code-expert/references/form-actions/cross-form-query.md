# 跨表单数据查询规范

> 跨表单数据查询的完整指南（含分页、兼容处理、坑点、场景分类）
> 版本: v2.4.0
> 迁移自: 03-cross-form-query.md

---

## 零、API参数名易错点（重要！）

### 新增 vs 编辑参数名不同（这是最常见错误！）

| 操作 | API | 数据参数名 | 错误现象 |
|------|-----|-----------|---------|
| 新增 | `saveFormData.json` | `formDataJson` | - |
| 编辑 | `updateFormData.json` | `updateFormDataJson` | `参数校验失败updateFormDataJson` |

```javascript
// ✅ 新增用 formDataJson
this.dataSourceMap.add.load({
  appId: CONFIG.APP_ID,
  formUuid: CONFIG.FORM_UUID,
  formDataJson: JSON.stringify(formData)
});

// ✅ 编辑用 updateFormDataJson
this.dataSourceMap.edit.load({
  appId: CONFIG.APP_ID,
  formUuid: CONFIG.FORM_UUID,
  formInstId: formInstId,
  updateFormDataJson: JSON.stringify(formData)
});
```

---

## 一、API返回数据结构不统一（必须兼容）

### ⚠️ 1.0 极其重要：每个API的返回结构完全不同！

**不要用同一套代码模板处理所有API！** 宜搭各API返回结构差异极大，必须针对每个API单独处理。

### 1.1 各API返回格式对照表（必须逐个记忆！）

| API | 返回结构 | 成功判断方式 | 数据位置 | 常见错误 |
|-----|---------|------------|---------|---------|
| `searchFormDatas` | `{success, result:{data, totalCount}}` | `res.success === true` | `res.result.data` | 无 |
| `getFormDataById` | `{serialNo, instValue, creator, ...}` | `res.serialNo` 存在 | `res.serialNo`(订单号)<br>`res.instValue`(字段JSON) | ❌用`checkApiSuccess`判断失败！<br>❌子表数据不在返回值中！ |
| `listTableData` | `{data:[...], totalCount, currentPage}` | `res.data` 是数组 | `res.data` | ❌`res.result`是undefined！<br>❌关联字段key带`_id`后缀！ |
| `saveFormData` | `"FINST-xxx"` 字符串 | `typeof res === 'string'` | 返回值本身就是实例ID | 无 |
| `updateFormData` | `null` | `res === null` | 无数据返回 | 无 |
| `deleteFormData` | `null` | `res === null` | 无数据返回 | 无 |

### 1.2 getFormDataById 返回结构（极其特殊！）

**⚠️ 这是与其他查询API完全不同的返回结构，必须单独处理！**

```javascript
// getFormDataById 返回扁平对象，没有 success / result / data 字段！
// 实际返回：
{
  "serialNo": "CG20260724004",      // ← 订单号/流水号在这里
  "instValue": "[{componentName, fieldData, fieldId...}]",  // ← 字段数据JSON字符串
  "creator": "0249654712697493",
  "gmtModified": 1784849065984,
  "modifier": "0249654712697493",
  "originator": { "name": {...}, "userId": "..." },
  "title": "{\"zh_CN\":\"CG20260724004\"}",
  "modelUuid": "FORM-5CCACE2552084BDFB53DF788687CFBB7GPPQ",
  "version": 3
}
```

**✅ 正确的判断和取值方式：**

```javascript
// ❌ 错误：用 checkApiSuccess 判断 → 永远失败！
if (checkApiSuccess(res)) { ... }  // res 没有 success/data/result，返回 false！

// ✅ 正确：直接判断 serialNo 是否存在
if (!res || !res.serialNo) {
  throw new Error('查询失败');
}
var orderNo = res.serialNo;  // 直接取流水号
```

**⚠️ 关键警告：getFormDataById 不返回子表数据！**

```javascript
// ❌ 错误：试图从返回值中取子表
var formData = res.formData || res;
var subTableData = formData['tableField_xxx'];  // undefined！子表数据不在返回值中！

// ✅ 正确：必须单独调用 listTableData 接口获取子表
// 先查主表拿基本信息
var orderNo = res.serialNo;
// 再查子表拿明细数据
that.dataSourceMap['getOrderSubTable'].load({
  formUuid: 'FORM-XXX',
  formInstanceId: formInstId,
  tableFieldId: 'tableField_xxx',
  currentPage: 1,
  pageSize: 50
}).then(function(subRes) {
  var subTableRows = subRes.data || [];  // 子表行数据
});
```

### 1.3 ⚠️ instValueMap 字段值可能是对象格式，不能直接 setValue

`getFormDataById` 返回的 `instValue` 经过解析后得到 `instValueMap[fieldId]`，但该字段值**不一定是字符串**。很多字段类型（如流水号、标题、部分文本字段）的 `fieldData` 是 i18n 对象或嵌套对象：

```javascript
// ❌ 错误：直接把 instValueMap[fieldId] 当字符串用
var orderNo = mainResult.instValueMap['serialNumberField_xxx'];
row['textField_dst'] = orderNo;  // 可能显示 [object Object]

// 实际 instValueMap 中的值可能是：
{
  "serialNumberField_xxx": { "zh_CN": "CG20260729002", "en_US": "" },
  "textField_xxx": { "value": "xxx", "display": "xxx" }
}
```

**✅ 正确做法：**

1. **订单号/流水号优先用 `res.serialNo`**，它已经是稳定字符串：
```javascript
var orderNo = res.serialNo;  // ✅ 最可靠
```

2. 如果必须从 `instValueMap` 取文本字段，先用工具函数提取纯文本：
```javascript
function extractTextValue(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value.zh_CN !== undefined && value.zh_CN !== '') return value.zh_CN;
    if (value.en_US !== undefined && value.en_US !== '') return value.en_US;
  }
  return String(value);
}

var orderNo = extractTextValue(mainResult.instValueMap['serialNumberField_xxx']);
```

3. 子表 `setValue` 前，确保赋给文本字段的是字符串或数字，不是对象。

> **真实案例**：采购入库选择多个采购订单后，入库明细的「采购订单编号」全部显示 `[object Object]`。根因就是代码用 `instValueMap[serialNumberField_xxx]` 取值，而实际返回的是 `{zh_CN: "CG20260729002"}` 对象。改为 `res.serialNo` 后正常。

### 1.4 listTableDataByFormInstIdAndTableId 返回结构

**⚠️ 返回结构与其他查询API不同！data 在顶层，不在 result 下！**

```javascript
// listTableData 实际返回：
{
  "idCursor": 0,
  "data": [                        // ← data 在顶层！不是 res.result.data！
    {
      "textField_xxx": "文本值",
      "numberField_xxx": 100,
      "numberField_xxx_value": "100",   // ← 数值字段带 _value 后缀（字符串）
      "selectField_xxx": "选项显示值",
      "selectField_xxx_id": "选项实际值", // ← 下拉字段带 _id 后缀
      "associationFormField_xxx_id": "\"[{\\\"instanceId\\\":\\\"FINST-xxx\\\"...]\"", // ← 关联字段只有 _id 后缀版本！
      "textareaField_xxx": "备注"
    }
  ],
  "totalCount": 2,
  "currentPage": 1
}
```

**✅ 正确的取值方式：**

```javascript
// ❌ 错误：用通用兼容逻辑取数据
var result = res.result || res || {};
var list = result.data || [];  // res.result 是 undefined，res.data 是数组，
                               // result 变成数组，result.data 是 undefined！

// ✅ 正确：直接从顶层取 data
var list = [];
if (res && res.data && Array.isArray(res.data)) {
  list = res.data;
} else if (res && res.result && res.result.data && Array.isArray(res.result.data)) {
  list = res.result.data;  // 兼容少数环境
}
var totalCount = res.totalCount || 0;
```

**⚠️ 关键警告：子表API返回的字段key带后缀！**

| 字段类型 | 前端 getValue() 的 key | 子表API返回的 key | 说明 |
|---------|----------------------|------------------|------|
| 文本 | `textField_xxx` | `textField_xxx` | 一致，无后缀 |
| 数值 | `numberField_xxx` | `numberField_xxx` + `numberField_xxx_value` | 多一个字符串版本 |
| 下拉单选 | `selectField_xxx` | `selectField_xxx` + `selectField_xxx_id` | 多一个id版本 |
| **关联表单** | `associationFormField_xxx` | **`associationFormField_xxx_id`** | ⚠️ 只有 _id 版本有数据！ |
| 多行文本 | `textareaField_xxx` | `textareaField_xxx` | 一致，无后缀 |

**✅ 读取关联表单字段的正确方式：**

```javascript
// ❌ 错误：用前端字段名读取
var productAssoc = sourceRow['associationFormField_xxx'];  // undefined！

// ✅ 正确：优先尝试 _id 后缀
function getAssociationValue(row, fieldId) {
  // 优先尝试 _id 后缀（listTableData API 返回格式）
  var value = row[fieldId + '_id'];
  if (value !== undefined && value !== null) {
    return formatAssociationField(value);
  }
  // 兼容无后缀（前端 getValue 格式）
  return formatAssociationField(row[fieldId]);
}

var productAssoc = getAssociationValue(sourceRow, 'associationFormField_xxx');
```

### 1.5 操作API返回格式

| 操作 | 成功返回 | 说明 |
|------|---------|------|
| 新增 | `"FINST-xxx"` (字符串) | 返回实例ID |
| 编辑 | `null` | 成功返回null |
| 删除 | `null` | 成功返回null |

### 1.6 必须使用统一工具函数判断结果

```javascript
/**
 * 检查宜搭API调用是否成功（适用于 searchFormDatas / saveFormData / updateFormData / deleteFormData）
 * ⚠️ 不适用于 getFormDataById！该API返回扁平对象，需单独判断 res.serialNo 是否存在
 */
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true;
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;
  if (res && (res.success === true || res.success === 1)) return true;
  if (res && (res.data || (res.result && res.result.data))) return true;
  return false;
}

function getApiErrorMessage(res, defaultMsg) {
  if (res && res.errorMsg) return res.errorMsg;
  if (res && res.message) return res.message;
  return defaultMsg || '操作失败';
}
```

### 1.7 兼容数据位置

```javascript
// ✅ 兼容 res.result.data 和 res.data 两种位置（仅适用于 searchFormDatas）
var result = res.result || res || {};
var dataList = result.data || res.data || [];
var totalCount = result.totalCount || res.totalCount || 0;

// ⚠️ 以上兼容逻辑不适用于 listTableData！
// listTableData 用：var list = res.data || [];
```

---

## 二、部门选择器值格式问题

```javascript
// ❌ 错误：直接传入部门对象
searchConditions['department'] = this.$('departmentField_xxx').getValue();

// ✅ 正确：提取 value 属性
var department = this.$('departmentField_xxx').getValue();
var departmentValue = '';
if (Array.isArray(department) && department.length > 0) {
  departmentValue = department[0].value || department[0];
}
searchConditions['department'] = departmentValue; // 传入如 "-1"
```

---

## 三、API返回数据字段层级问题

```javascript
// ❌ 错误：直接从 sourceData 读取
var employee = sourceData['employeeField_xxx']; // undefined

// ✅ 正确：从 formData 中读取
var formData = sourceData.formData || sourceData;
var employee = formData['employeeField_xxx']; // 正确获取值
```

---

## 三点五、searchFieldJson 各组件查询格式（极重要！）

> 不同组件类型的查询值格式**完全不同**，格式错误会导致查询条件静默失效（返回全部数据或空数据）。

### ⚠️ 重要澄清：不需要先转化为文本类型！

**错误观念：** "部门、人员等特殊组件作为查询条件时，需要先在表单内转化为文本类型再查询"

**正确做法：** 直接使用特定格式匹配即可，无需转化：
- **人员搜索框**：直接用工号字符串数组 `["工号1", "工号2"]`
- **部门选择**：直接用部门ID数字 `1123456`
- **日期组件**：直接用时间戳数组 `[1514736000000, 1517414399000]`

| 组件类型 | 格式 | 示例 | 备注 |
|---------|------|------|------|
| 单行/多行文本 | 字符串 | `"关键词"` | **模糊搜索** |
| **数字输入框** | **字符串数组[min,max]** | `["1", "10"]` | **范围搜索，精确匹配用["1","1"]** |
| 单选/下拉单选 | 字符串 | `"选项一"` | 精确搜索 |
| 多选/下拉多选 | 字符串数组 | `["选项二"]` | 数组搜索（必须是值的子集）|
| 日期组件 | 时间戳数组 | `[1514736000000, 1517414399000]` | 范围搜索 |
| 日期区间 | 嵌套数组 | `[[开始范围], [结束范围]]` | 双重范围 |
| 人员搜索框 | 工号字符串数组 | `["工号1", "工号2"]` | 精确匹配，顺序也要一致 |
| **部门选择** | **数字** | `1123456` | 精确匹配（不是数组！）|
| 级联选择 | 字符串数组 | `["part", "part_b"]` | 层级顺序 |
| 城市选择 | 字符串数组 | `["110000", "110100"]` | 必须含省ID |
| 子表单 | 字符串 | `"关键词"` | 模糊搜索 |

### ☠️ 数字输入框精确匹配 — 最隐蔽的坑！

```javascript
// ❌ 错误：数值类型/字符串，查询条件静默失效（返回全量数据！）
searchConditions['numberField_month'] = 1;      // 数值类型：失效
searchConditions['numberField_month'] = '1';    // 字符串：失效

// ✅ 正确：必须使用字符串数组 ["最小值", "最大值"]
searchConditions['numberField_month'] = ['1', '1'];   // 精确匹配 月份=1
searchConditions['numberField_month'] = ['1', '10'];  // 范围匹配 1~10月
```

**真实案例：** 选择1月份查询数据时返回了1月和2月的全部数据，而选2月时却正常。
原因：月份字段用了 `searchConditions['numberField_mght567l'] = 1`（数值类型），条件完全失效。
修复：改为 `['1', '1']` 后立即正常。

### 部门组件查询注意事项

```javascript
// 部门 getValue() 返回对象数组：[{value: "1123456", text: {...}}]
// 查询 searchFieldJson 需要传数字：1123456（不是数组！）

var deptArr = this.$('departmentField_xxx').getValue();
var deptId = '';
if (Array.isArray(deptArr) && deptArr.length > 0) {
  deptId = deptArr[0].value; // "-1" 或 "1123456"
}
// 注意：部门查询传字符串也行，传数字也行，但不能传对象
searchConditions['departmentField_xxx'] = deptId;  // ✅
```

### 人员组件查询注意事项

```javascript
// 人员 getValue() 返回对象数组：[{value: "工号", label: "姓名"}]
// 查询 searchFieldJson 需要传工号字符串数组：["工号"]

var memberArr = this.$('employeeField_xxx').getValue();
var empIds = [];
if (Array.isArray(memberArr)) {
  for (var i = 0; i < memberArr.length; i++) {
    var empId = memberArr[i].value || memberArr[i].key || memberArr[i].emplId;
    if (empId) empIds.push(String(empId));
  }
}
searchConditions['employeeField_xxx'] = empIds;  // ["工号1", "工号2"]
```

---

## 四、远程API数据源参数规范

### 4.1 不要传递 appType 参数

```javascript
// ❌ 错误：传递了 appType，会导致返回空 {}
var params = {
  formUuid: 'FORM-XXX',
  appType: CONFIG.APP_ID,  // 多余！
  searchFieldJson: JSON.stringify(searchConditions)
};

// ✅ 正确：应用ID已在 URL 中，不需要 appType
var params = {
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify(searchConditions),
  pageSize: 100,
  currentPage: 1
};
```

### 4.2 pageSize 最大值限制

| 接口 | 最大 pageSize |
|------|-------------|
| `searchFormDatas.json` | **100** |
| `listTableDataByFormInstIdAndTableId.json` | **50** |

---

## 五、分页查询完整实现

当数据超过100条时，必须使用递归分页查询获取全部数据。

### 5.1 递归分页查询函数

```javascript
/**
 * 递归查询所有分页数据（获取全部数据的标准方案）
 * @param {Object} that - this上下文
 * @param {Object} searchConditions - 查询条件
 * @param {number} currentPage - 当前页码（从1开始）
 * @param {Array} accumulatedData - 已累积的数据
 * @returns {Promise} 返回所有数据的Promise
 */
function queryAllData(that, searchConditions, currentPage, accumulatedData) {
  var pageSize = 100;

  var requestParams = {
    formUuid: CONFIG.TARGET_FORM.FORM_UUID,
    // 注意：不传 appType（应用ID已在数据源URL中）
    searchFieldJson: JSON.stringify(searchConditions),
    pageSize: String(pageSize),
    currentPage: String(currentPage)
  };

  return that.dataSourceMap[CONFIG.DATA_SOURCE.QUERY].load(requestParams).then(function(res) {
    var currentPageData = [];
    var totalCount = 0;

    // 兼容不同返回格式
    if (res && res.result && res.result.data) {
      currentPageData = res.result.data;
      totalCount = res.result.totalCount || 0;
    } else if (res && res.data) {
      currentPageData = res.data;
      totalCount = res.totalCount || 0;
    }

    var allData = accumulatedData.concat(currentPageData);

    // 判断是否还有更多数据
    if (allData.length < totalCount) {
      return queryAllData(that, searchConditions, currentPage + 1, allData);
    } else {
      return allData;
    }
  });
}
```

### 5.2 调用示例

```javascript
export function handleQuery() {
  var that = this;

  var searchConditions = {};

  // 部门条件需要提取 value
  var dept = this.$('departmentField_xxx').getValue();
  if (Array.isArray(dept) && dept.length > 0) {
    searchConditions['departmentField_xxx'] = dept[0].value;
  }

  // 其他条件
  searchConditions['numberField_xxx'] = this.$('numberField_xxx').getValue();

  queryAllData(that, searchConditions, 1, []).then(function(allData) {
    that.utils.toast({
      type: 'success',
      title: '查询完成',
      content: '共查询到 ' + allData.length + ' 条数据'
    });
    processQueryResult.call(that, allData);
  }).catch(function(err) {
    that.utils.toast({ type: 'error', title: '查询失败', content: err.message });
  });
}
```

### 5.3 分页原理说明

```
开始 → 查询第1页(pageSize=100) → 累积数据
  ↓
accumulatedData.length < totalCount?
  → 是 → 查询下一页(currentPage+1) → 递归
  → 否 → 返回全部数据
```

| 查询次数 | currentPage | 本次数据 | 累积 | totalCount | 是否继续 |
|---------|-------------|---------|------|------------|---------|
| 第1次 | 1 | 100条 | 100条 | 250 | 是 |
| 第2次 | 2 | 100条 | 200条 | 250 | 是 |
| 第3次 | 3 | 50条 | 250条 | 250 | 否 |

---

## 六、标准跨表单查询代码模板

```javascript
/**
 * 跨表单数据查询标准模板（含分页）
 * 版本号: v2.0.0
 * 代码类型: formAction
 */

// 工具函数（复制到代码顶部）
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true;
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;
  if (res && (res.success === true || res.success === 1)) return true;
  if (res && (res.data || (res.result && res.result.data))) return true;
  return false;
}

// 配置
var CONFIG = {
  APP_ID: 'APP_XXX',
  DATA_SOURCE: {
    QUERY: 'queryDataSource'
  },
  TARGET_FORM: {
    FORM_UUID: 'FORM-XXX'
  }
};

export function didMount() {
  console.log('跨表查询功能已加载');
}

// 分页递归查询
function queryAllData(that, searchConditions, currentPage, accumulatedData) {
  return that.dataSourceMap[CONFIG.DATA_SOURCE.QUERY].load({
    formUuid: CONFIG.TARGET_FORM.FORM_UUID,
    searchFieldJson: JSON.stringify(searchConditions),
    pageSize: '100',
    currentPage: String(currentPage)
  }).then(function(res) {
    var result = res.result || res || {};
    var currentPageData = result.data || res.data || [];
    var totalCount = result.totalCount || res.totalCount || 0;
    var allData = accumulatedData.concat(currentPageData);

    if (allData.length < totalCount) {
      return queryAllData(that, searchConditions, currentPage + 1, allData);
    }
    return allData;
  });
}

export function crossFormQuery() {
  var that = this;
  var searchConditions = {};

  // 提取部门选择器 value
  var dept = this.$('departmentField_xxx').getValue();
  if (Array.isArray(dept) && dept.length > 0) {
    searchConditions['departmentField_xxx'] = dept[0].value;
  }

  queryAllData(that, searchConditions, 1, []).then(function(allData) {
    console.log('查询到 ' + allData.length + ' 条数据');

    // 处理每条数据（字段值在 formData 中）
    for (var i = 0; i < allData.length; i++) {
      var formData = allData[i].formData || allData[i];
      var fieldValue = formData['textField_xxx'];
      // 处理...
    }

    that.utils.toast({ type: 'success', title: '查询完成' });
  }).catch(function(err) {
    that.utils.toast({ type: 'error', title: '查询失败', content: err.message });
  });
}
```

---

## 六、跨表查询结果填充子表时的字段格式问题（极其重要！）

> ⚠️ **这是最常见的跨表查询Bug！** API返回的字段值格式与 `setValue()` 需要的格式**不一致**，直接赋值会导致字段显示为空。

### 6.1 问题说明

跨表查询获取数据后，通常需要填充到当前表单的子表或字段中。但API返回的原始数据格式与组件 `setValue()` 需要的格式存在差异：

| 字段类型 | API返回格式 | setValue()需要格式 | 是否需转换 |
|---------|------------|-------------------|-----------|
| 文本/数值 | 直接值 | 直接值 | ❌ 不需要 |
| **成员** | JSON字符串/对象/数组 | `[{value, label, key}]` | ✅ **必须转换** |
| **部门** | JSON字符串/对象/数组 | `[{value, text}]` | ✅ **必须转换** |
| **关联表单** | JSON字符串 | `[{appType, formUuid, instanceId, title}]` | ✅ **必须转换** |
| **日期** | 时间戳 | 时间戳 | ❌ 不需要 |

### 6.2 成员字段转换示例

```javascript
// ❌ 错误：直接赋值，成员字段会显示为空
rowData['employeeField_xxx'] = formData['employeeField_xxx'];

// ✅ 正确：使用转换函数处理
function formatEmployeeField(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(function(item) {
      if (typeof item === 'string') {
        return { value: item, label: item, key: item };
      }
      return {
        value: item.value || item.key || item.emplId || '',
        label: item.label || item.name || item.value || '',
        key: item.key || item.value || item.emplId || ''
      };
    });
  }
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return formatEmployeeField(parsed);
    } catch (e) { 
      return [{ value: value, label: value, key: value }];
    }
  }
  if (typeof value === 'object') {
    return [{
      value: value.value || value.key || value.emplId || '',
      label: value.label || value.name || value.value || '',
      key: value.key || value.value || value.emplId || ''
    }];
  }
  return [];
}

// 使用转换函数
rowData['employeeField_xxx'] = formatEmployeeField(formData['employeeField_xxx']);
```

### 6.3 部门字段转换示例

```javascript
// ❌ 错误：直接赋值
rowData['departmentField_xxx'] = formData['departmentField_xxx'];

// ✅ 正确：使用转换函数
function formatDepartmentField(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(function(item) {
      if (typeof item === 'string') {
        return { value: item, text: item };
      }
      return {
        value: item.value || '',
        text: item.text || item.label || item.value || ''
      };
    });
  }
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return formatDepartmentField(parsed);
    } catch (e) {
      return [{ value: value, text: value }];
    }
  }
  if (typeof value === 'object') {
    return [{
      value: value.value || '',
      text: value.text || value.label || value.value || ''
    }];
  }
  return [];
}
```

### 6.4 关联表单字段转换示例

```javascript
// ❌ 错误：直接赋值
rowData['associationFormField_xxx'] = formData['associationFormField_xxx'];

// ✅ 正确：先解析JSON字符串，再构建关联对象
function formatAssociationField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { return []; }
  }
  if (typeof value === 'object') return [value];
  return [];
}

// 使用
var assocValue = formatAssociationField(formData['associationFormField_xxx']);
if (assocValue.length > 0) {
  rowData['associationFormField_xxx'] = [{
    appType: assocValue[0].appType || 'APP_XXX',
    formType: 'receipt',
    formUuid: assocValue[0].formUuid || 'FORM-XXX',
    instanceId: assocValue[0].instanceId || '',
    title: assocValue[0].title || ''
  }];
}
```

### 6.5 完整的子表数据构建模板

```javascript
// 处理查询结果，构建子表数据
var subTableData = [];
for (var i = 0; i < allData.length; i++) {
  var sourceData = allData[i];
  var formData = sourceData.formData || sourceData;

  var rowData = {};
  
  // 普通字段直接赋值
  rowData['textField_xxx'] = formData['textField_xxx'] || '';
  rowData['numberField_xxx'] = formData['numberField_xxx'] || 0;
  
  // 特殊字段需要转换
  rowData['employeeField_xxx'] = formatEmployeeField(formData['employeeField_xxx']);
  rowData['departmentField_xxx'] = formatDepartmentField(formData['departmentField_xxx']);
  rowData['associationFormField_xxx'] = formatAssociationField(formData['associationFormField_xxx']);

  subTableData.push(rowData);
}

// 填充到子表
this.$('tableField_xxx').setValue(subTableData, { triggerChange: false });
```

---

## 六点五、场景分类与场景C端到端完整实现（⭐直播翻车根因，最常见）

> 跨表查询到底要配几个数据源、调几个API，**取决于你要什么数据**。先按下表选场景，再套对应实现，切勿盲目套通用模板。

### 场景分类决策表

| 场景 | 你要什么 | API | 数据源 | 成功判断 | 数据位置 |
|------|---------|-----|-------|---------|---------|
| **A** 查主表列表 | 满足条件的多条主表记录 | `searchFormDatas` | 1个 | `checkApiSuccess(res)` | `res.result.data` |
| **B** 按ID查主表详情 | 已知实例ID的主表字段 | `getFormDataById` | 1个 | `res.serialNo` 存在 | `res.serialNo` / `res.instValue` |
| **C** 查主表+子表 ⭐ | 完整记录（主表+子表明细） | `getFormDataById` + `listTableData` | **2个** | 见下 | 见下 |
| **D** 只查子表 | 已知实例ID的子表明细 | `listTableData` | 1个 | `res.data` 是数组 | `res.data`（顶层） |

> ⚠️ **场景C必须调2个API、配2个数据源**：`getFormDataById` 不返回子表，子表必须单独调 `listTableData`。这正是直播翻车最集中的地方。

### 场景C完整实现（选关联表单 → 查主表 → 查子表 → 映射 → 填充当前子表）

> 📦 可直接套用模板：`assets/templates/cross-form-query-template.js`（含完整工具函数与配置步骤）。下面是核心串联逻辑：

```javascript
// ① 查主表：getFormDataById（❌不能用 checkApiSuccess，判断 res.serialNo）
function fetchMainForm(that, formInstId) {
  return that.dataSourceMap['getSourceMainForm'].load({
    formInstId: formInstId
  }).then(function(res) {
    var main = extractFormDataByIdResult(res); // 无 serialNo 返回 null
    if (!main) { throw new Error('主表查询失败'); }
    return main; // { serialNo, instValueMap, raw }
  });
}

// ② 查子表：listTableData（数据在 res.data 顶层，pageSize 上限 50，含分页）
function fetchSubTable(that, formInstId, currentPage, accumulated) {
  return that.dataSourceMap['getSourceSubTable'].load({
    formUuid: 'FORM-XXX',                  // 源表单UUID（真实值）
    formInstanceId: formInstId,
    tableFieldId: 'tableField_source',     // 源子表字段ID
    currentPage: String(currentPage),
    pageSize: '50'
  }).then(function(res) {
    var parsed = extractListTableDataResult(res); // 从 res.data 顶层取
    var all = accumulated.concat(parsed.list);
    if (all.length < parsed.totalCount) {
      return fetchSubTable(that, formInstId, currentPage + 1, all);
    }
    return all;
  });
}

// ③ 映射源子表行 → 目标子表行（关联列必须用 getAssociationValue）
function buildSubTableRows(sourceRows) {
  var rows = [];
  for (var i = 0; i < sourceRows.length; i++) {
    var src = sourceRows[i];
    rows.push({
      'textField_dstName': src['textField_srcName'] || '',
      'numberField_dstQty': src['numberField_srcQty'] || 0,
      // ⚠️ 关联字段带 _id 后缀，标准字段名为空！
      'associationFormField_dstProduct': getAssociationValue(src, 'associationFormField_srcProduct')
    });
  }
  return rows;
}

// ④ 关联字段 onChange 串联全流程（手动绑定到关联字段的 onChange）
var isProcessing = false;
export function onSourceFieldChange(event) {
  var that = this;
  if (isProcessing) return;
  var value = event && event.value;
  if (!value || !value.length || !value[0].instanceId) return;
  var formInstId = value[0].instanceId;

  isProcessing = true;
  fetchMainForm(that, formInstId).then(function(main) {
    return fetchSubTable(that, formInstId, 1, []); // 查完主表再查子表
  }).then(function(sourceRows) {
    var targetRows = buildSubTableRows(sourceRows);
    // triggerChange:false 防死循环
    that.$('tableField_target').setValue(targetRows, { triggerChange: false });
    that.utils.toast({ type: 'success', title: '已填充 ' + targetRows.length + ' 条明细' });
  }).catch(function(err) {
    that.utils.toast({ type: 'error', title: '填充失败', content: err.message });
  }).then(function() {
    isProcessing = false; // 相当于 finally 释放锁
  });
}
```

**场景C避坑清单（逐项对照）：**
- [ ] 是否配了 **2 个数据源**（getFormDataById + listTableData）？
- [ ] 主表用 `res.serialNo` / `extractFormDataByIdResult` 判断，**没有**用 `checkApiSuccess`？
- [ ] 订单号/流水号是否优先从 `res.serialNo` 取，**没有**把 `instValueMap[fieldId]` 对象直接 setValue 给文本字段？
- [ ] 子表从 `res.data` **顶层**取，**没有**用 `res.result.data` 通用逻辑？
- [ ] 子表关联列用了 `getAssociationValue`（`_id` 后缀）？
- [ ] `setValue` 带了 `{ triggerChange: false }` 且有 `isProcessing` 锁？

---

## 七、跨表单查询检查清单

- [ ] 部门选择器是否提取了 `value` 属性？
- [ ] 是否从 `formData` 属性中提取字段值？
- [ ] API返回是否兼容三种 success 格式？
- [ ] 数据位置是否兼容 `res.result.data` 和 `res.data`？
- [ ] 是否**没有**传递 `appType` 参数？
- [ ] pageSize 是否不超过100？
- [ ] 是否使用 `checkApiSuccess()` 判断结果？
- [ ] 数据量可能超100条时是否使用分页递归？
- [ ] **成员/部门/关联表单字段是否使用了格式转换函数？（极其重要！）**
- [ ] **getFormDataById 取订单号/流水号是否优先用 `res.serialNo`，且 setValue 给文本字段前已确保不是对象？**

---

## 八、跨应用数据源 API

### 8.1 API 请求路径格式

```javascript
// 应用编码可以通过应用设置 => 部署运维页面查看
// 接口路径格式
"/dingtalk/web/${应用编码}/${接口路径}"

// 示例
/dingtalk/web/APP_X1X2X3X4/v1/form/searchFormDatas.json
```

**重要提示：** 在宜搭平台编写的接口请求代码请直接使用相对路径，避免因企业二级域名修改导致需要调整代码。

### 8.2 接口返回结构

```javascript
interface IResponse {
  success: boolean;    // 请求是否成功
  result?: object | array | string;  // 请求成功的返回内容
  errorMsg?: string;   // 错误信息
  errorCode?: string;  // 错误码
  errorLevel?: number; // 错误级别
}
```

### 8.3 表单相关 API 汇总

| 操作 | 接口路径 | 请求类型 | 核心参数 |
|------|---------|---------|---------|
| 新增数据 | `/v1/form/saveFormData.json` | POST | `formUuid`, `formDataJson` |
| 更新数据 | `/v1/form/updateFormData.json` | POST | `formInstId`, `updateFormDataJson` |
| 删除数据 | `/v1/form/deleteFormData.json` | POST | `formInstId` |
| 按 ID 查询 | `/v1/form/getFormDataById.json` | GET | `formInstId` |
| 条件搜索 ID | `/v1/form/searchFormDataIds.json` | GET | `formUuid`, `searchFieldJson` |
| 条件搜索详情 | `/v1/form/searchFormDatas.json` | GET | `formUuid`, `searchFieldJson` |
| 获取子表数据 | `/v1/form/listTableDataByFormInstIdAndTableId.json` | GET | `formUuid`, `formInstanceId`, `tableFieldId` |

### 8.4 流程相关 API 汇总

| 操作 | 接口路径 | 请求类型 | 核心参数 |
|------|---------|---------|---------|
| 发起流程 | `/v1/process/startInstance.json` | POST | `processCode`, `formUuid`, `formDataJson` |
| 搜索流程实例 ID | `/v1/process/getInstanceIds.json` | GET | `formUuid`, `searchFieldJson` |
| 搜索流程实例详情 | `/v1/process/getInstances.json` | GET | `formUuid`, `searchFieldJson` |
| 获取流程实例详情 | `/v1/process/getInstanceById.json` | GET | `processInstanceId` |

### 8.5 新增数据 API 详解

```javascript
// 接口路径: /v1/form/saveFormData.json
// 请求类型: POST

var params = {
  formUuid: 'FORM-XXX',      // 表单ID（必填）
  appType: 'APP_XXX',        // 应用ID（必填）
  formDataJson: JSON.stringify({
    'textField_xxx': '单行文本',
    'employeeField_xxx': ['工号']
  })
};

this.dataSourceMap.add.load(params).then(function(res) {
  // 成功返回实例ID
  console.log('新增成功:', res);  // "FINST-XXX"
});
```

### 8.6 更新数据 API 详解

```javascript
// 接口路径: /v1/form/updateFormData.json
// 请求类型: POST

var params = {
  formInstId: 'FINST-XXX',   // 要更新的数据ID（必填）
  updateFormDataJson: JSON.stringify({
    'employeeField_xxx': ['工号1', '工号2']
  })
};

this.dataSourceMap.update.load(params).then(function(res) {
  // 成功返回 null
  console.log('更新成功');
});
```

**注意：** 更新 API 的参数名是 `updateFormDataJson`，不是 `formDataJson`！

### 8.7 条件搜索 API 详解

```javascript
// 接口路径: /v1/form/searchFormDatas.json
// 请求类型: GET

var params = {
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify({
    'textField_xxx': '关键词',      // 模糊搜索
    'numberField_xxx': ['1', '10'], // 范围搜索
    'selectField_xxx': '选项一'     // 精确搜索
  }),
  pageSize: 100,
  currentPage: 1,
  originatorId: '',           // 提交人工号（可选）
  createFrom: '2024-01-01',   // 创建时间起始（可选）
  createTo: '2024-12-31',     // 创建时间结束（可选）
  modifiedFrom: '',           // 修改时间起始（可选）
  modifiedTo: '',             // 修改时间结束（可选）
  dynamicOrder: '{"numberField_xxx":"+"}'  // 排序（可选）
};

this.dataSourceMap.query.load(params).then(function(res) {
  var data = res.result.data || [];
  var totalCount = res.result.totalCount || 0;
});
```

### 8.8 流程实例状态说明

| 状态值 | 含义 |
|-------|------|
| RUNNING | 运行中 |
| TERMINATED | 已终止 |
| COMPLETED | 已完成 |
| ERROR | 异常 |

| 审批结果 | 含义 |
|---------|------|
| agree | 同意 |
| disagree | 拒绝 |

### 8.9 跨应用开发注意事项

**权限问题：**
- 确保当前用户有权限访问目标应用
- 跨应用查询可能受到权限控制限制
- 免登页面无法直接使用远程 Open API（需要鉴权）

**性能考虑：**
- 跨应用查询比同应用查询慢
- 建议添加缓存机制
- 避免频繁调用

**参数名注意事项：**
- `searchFieldJson` 在某些场景下可能需要使用 `searchField`
- 建议优先使用 `searchFieldJson`，如遇问题可尝试切换

---

*文档版本: v2.3.0*
*更新内容（v2.3.0）：新增“六点五、场景分类与场景C端到端完整实现”，与 cross-form-query-template.js 模板配套*
*更新内容（v2.2.0）：澄清“不需要先转化为文本类型”的错误观念，补充日期区间格式*
