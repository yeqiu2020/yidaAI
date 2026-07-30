# 宜搭 API 常见错误案例集

> 开发过程中常见 API 使用错误及解决方案（19 大必读坑）
> 版本：v1.8.0
> 迁移自：10-common-api-mistakes.md

---

## ⚡ 速查：checkApiSuccess 工具函数（必须使用）

**所有 API 调用必须使用此函数判断结果，不能直接判断 `res.success`！**

**⚠️ 重要：checkApiSuccess 不适用于 getFormDataById！该API返回扁平对象（无success/data/result字段），需单独判断 `res.serialNo` 是否存在！**

```javascript
/**
 * 检查宜搭API调用是否成功
 * 适用于: searchFormDatas / saveFormData / updateFormData / deleteFormData
 * ⚠️ 不适用于 getFormDataById！
 *   getFormDataById 返回 {serialNo, instValue, creator...}，没有success字段
 *   需单独判断: if (!res || !res.serialNo) throw new Error('查询失败');
 */
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true; // 编辑/删除成功返回 null
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true; // 新增返回实例 ID
  if (res && (res.success === true || res.success === 1)) return true; // 查询标准格式
  if (res && (res.data || (res.result && res.result.data))) return true; // 查询直接返回数据
  return false;
}

function getApiErrorMessage(res, defaultMsg) {
  if (res && res.errorMsg) return res.errorMsg;
  if (res && res.message) return res.message;
  return defaultMsg || '操作失败';
}
```

---

## 案例 1：编辑 API 参数名错误（最常见！）

### 错误现象
```
参数校验失败 updateFormDataJson
```

### ❌ 错误代码
```javascript
// 编辑接口错误使用了新增的参数名 formDataJson
this.dataSourceMap.editDataSource.load({
  formInstId: formInstId,
  formDataJson: JSON.stringify(formData)  // 错误！
});
```

### ✅ 正确代码
```javascript
// 新增 - 用 formDataJson
this.dataSourceMap.add.load({
  formDataJson: JSON.stringify(formData)
});

// 编辑 - 用 updateFormDataJson
this.dataSourceMap.edit.load({
  formInstId: formInstId,
  updateFormDataJson: JSON.stringify(formData)  // 正确！
});
```

**参数对照表：**

| 操作 | API | 数据参数名 |
|------|-----|-----------|
| 新增 | `saveFormData.json` | `formDataJson` |
| 编辑 | `updateFormData.json` | `updateFormDataJson` |
| 删除 | `deleteFormData.json` | 无 |

---

## 案例 2：rowData.formUuid 是对象而非字符串

### 错误现象
```
未知的数据源
表单 UUID: [object Object]
```

### ❌ 错误代码
```javascript
pageState.currentDeleteFormUuid = rowData.formUuid;  // 危险！可能是对象
```

### ✅ 正确代码
```javascript
// 始终使用 CONFIG 中定义的 UUID，不依赖 rowData.formUuid
var formUuid = targetFormUuid || CONFIG.FORM_UUID.MAIN;
formUuid = String(formUuid);

// 兜底判断
if (!formUuid || formUuid === '[object Object]') {
  formUuid = CONFIG.FORM_UUID.MAIN;
}
```

**核心教训：** 不要信任 `rowData` 中的字段类型，始终使用 `CONFIG` 中定义的 UUID。

---

## 案例 3：跨表单查询数据位置不兼容

### 错误现象
查询成功但数据为空

### ❌ 错误代码
```javascript
var data = res.data; // 可能数据在 res.result.data
```

### ✅ 正确代码
```javascript
// 兼容两种数据位置
var result = res.result || res || {};
var dataList = result.data || res.data || [];
var totalCount = result.totalCount || res.totalCount || 0;
```

---

## 案例 4：success 字段格式不兼容

### 错误现象
API 返回成功但代码判断为失败

### ❌ 错误代码
```javascript
if (res.success === true) { ... } // 可能 success 是 1 或没有 success
```

### ✅ 正确代码
```javascript
// 使用 checkApiSuccess() 工具函数（见顶部）
if (checkApiSuccess(res)) { ... }
```

---

## 案例 5：自动化脚本使用多行注释

### 错误现象
自动化脚本执行失败，语法错误

### ❌ 错误代码
```javascript
/**
 * 自动化脚本
 * 版本号：v1.0.0
 */
```

### ✅ 正确代码
```javascript
// 自动化脚本
// 版本号：v1.0.0
// 注意：只能使用 // 单行注释
```

---

## 案例 6：this 指向丢失

### 错误现象
嵌套函数中 `this.utils` 或 `this.$()` 报错

### ❌ 错误代码
```javascript
export function handleAction(event) {
  this.dataSourceMap.query.load({}).then(function(res) {
    this.utils.toast({ type: 'success', title: '成功' }); // 报错！
  });
}
```

### ✅ 正确代码
```javascript
export function handleAction(event) {
  var that = this; // 先保存 this 引用
  this.dataSourceMap.query.load({}).then(function(res) {
    that.utils.toast({ type: 'success', title: '成功' }); // 使用 that
  });
}
```

---

## 案例 7：自定义页面表格行选择器函数签名错误

### 错误现象
勾选表格行后没反应，`event.selectedRows is undefined`

### ❌ 错误代码
```javascript
export function onRowSelect(event) {
  var selectedRows = event.selectedRows; // undefined！
}
```

### ✅ 正确代码
```javascript
/**
 * 表格行选择器标准签名（固定三个参数！）
 * @param {boolean} selected - 是否选中
 * @param {object} rowData - 当前操作行数据
 * @param {array} selectedRows - 所有选中行数据
 */
export function onSelect(selected, rowData, selectedRows) {
  if (!selected) return;
  var formInstId = rowData.formInstId || '';
  // 处理选中逻辑...
}
```

**绑定方式：** 绑定到表格的 **onSelect** 事件（不是 onChange）。

---

## 案例 8：跨表查询传递多余的 appType 参数

### 错误现象
API 返回空对象 `{}`，查询不到数据

### ❌ 错误代码
```javascript
var params = {
  formUuid: 'FORM-XXX',
  appType: CONFIG.APP_ID, // 多余！会导致查询失败
  searchFieldJson: JSON.stringify(searchConditions)
};
```

### ✅ 正确代码
```javascript
// 应用 ID 已在数据源 URL 中，不需要 appType 参数
var params = {
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify(searchConditions),
  pageSize: 100,
  currentPage: 1
};
```

---

## 案例 9：关联表单和图片字段 API 返回 JSON 字符串

### 错误现象
关联表单/图片字段跨表查询后无法正确显示

### ❌ 错误代码
```javascript
rowData['associationFormField_xxx'] = formData['associationFormField_xxx']; // 字符串无法显示
```

### ✅ 正确代码
```javascript
// 使用 data-structures.md 中的工具函数解析
function formatAssociationField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed); // 双重转义
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch(e) { return []; }
  }
  if (typeof value === 'object') return [value];
  return [];
}

rowData['associationFormField_xxx'] = formatAssociationField(formData['associationFormField_xxx']);
```

---

## 案例 10：关联表单字段读取 _id 后缀问题

### 错误现象
关联表单字段读取不到数据，但 API 响应中有数据

### ❌ 错误代码
```javascript
var value = formData['associationFormField_xxx']; // 可能为空
```

### ✅ 正确代码
```javascript
// 优先读取标准字段，如果为空则尝试带 _id 后缀的字段
var value = formData['associationFormField_xxx'];
if (!value) {
  value = formData['associationFormField_xxx_id']; // 带 _id 后缀的字段
}
// 然后用 formatAssociationField() 解析
```

**原因：** 宜搭同时存储两个版本：标准字段（可能为空）和带 `_id` 后缀的 JSON 字符串版本。

---

## 自动化脚本专项禁止事项

### 禁止使用 return 语句
```javascript
// ❌ 错误：顶层 return 会报错
if (error) {
  outputs.add('结果', 'result', null);
  return; // Invalid return statement
}

// ✅ 正确：用 if-else 控制流程
if (error) {
  outputs.add('结果', 'result', null);
} else {
  outputs.add('结果', 'result', result);
}
```

### 输入变量不能重新声明
```javascript
// ❌ 错误：会造成变量冲突
var inputData = inputData || [];

// ✅ 正确：用新变量名接收
var data = inputData || [];
```

---

## 案例 11：事件绑定禁止用 .on()

### 错误现象
事件绑定不生效，或处理函数不执行。

### ❌ 错误代码
```javascript
export function didMount() {
  // ❌ 宜搭不支持这种绑定方式！
  this.$('componentId').on('change', this.handleChange);
  this.$('button_xxx').on('click', this.handleClick);
}
```

### ✅ 正确做法
应展开对应组件的属性面板，在配置面板中选择对应的函数：

```
配置步骤：
1. 在组件属性面板中找到事件配置（如 onChange、onClick）
2. 展开小箭头，选择对应的处理函数
3. 不要在 didMount 里用任何方式绑定事件
```

**didMount 中只能实现初始化逻辑，不能绑定事件。**

---

## 案例 12：关联表单回填时序问题

### 错误现象

子表单中的"选择物料"（关联表单）字段变化后，onChange 回调里无法获取到关联表单自动回填过来的字段值（如物料编号）。

### 错误原因
宜搭关联表单的**自动回填是异步操作**，JS 回调往往先于回填完成执行。在 onChange 里直接读取目标字段，得到的是回填前的空值。

### ❌ 错误代码
```javascript
export function handleMaterialChange(value, options) {
  // 关联回填未完成，取到空值！
  var rowIndex = this.index;
  var allData = this.$('tableField_xxx').getValue();
  var currentRow = allData[rowIndex];
  var materialCode = currentRow['materialCodeField_xxx'];  // undefined !
}
```

### ✅ 正确代码（setTimeout + 重新 getValue）
```javascript
export function handleMaterialChange(value, options) {
  // 需要在 onChange 开始就保存行索引和子表引用
  var rowIndex = this.index;  // 必须在最外层保存
  var subTable = this.$('tableField_xxx');  // 必须在最外层保存
  
  // 将所有取值/赋值操作放入 setTimeout（延迟等待回填完成）
  setTimeout(function() {
    var allData = subTable.getValue();  // 延迟后重新获取，此时回填已完成
    if (!Array.isArray(allData) || !allData[rowIndex]) return;
    
    var currentRow = allData[rowIndex];
    var materialCode = currentRow['materialCodeField_xxx'];  // ✅ 能取到回填值
    
    // 继续赋值操作...
    var updatedData = allData.slice();
    updatedData[rowIndex] = Object.assign({}, currentRow, {
      'targetField_xxx': materialCode
    });
    subTable.setValue(updatedData, { triggerChange: false });
  }, 300);  // 300ms 等待关联回填完成
}
```

**小结：**
| 时序场景 | 最小延迟 | 说明 |
|---------|---------|------|
| 弹窗显示后操作字段 | 100ms | 弹窗 DOM 渲染 |
| 关联表单回填后读取 | 300ms | 异步回填完成 |
| 子表 onChange 状态清空 | 0ms | 等 setTimeout(…, 0) |

---

## 案例 13：子表事件参数 JSON.stringify 循环引用

### 错误现象
```
TypeError: Converting circular structure to JSON
```

### 错误原因
宜搭事件回调参数（`value`、`extra`、`event`）内部包含对组件实例的循环引用，无法直接用标准 `JSON.stringify` 进行深拷贝。

### ❌ 错误代码
```javascript
export function onSubTableChange(value, extra) {
  // ❌ 不要直接对事件参数进行深拷贝！
  var dataCopy = JSON.parse(JSON.stringify(value));  // 报错！循环引用
}
```

### ✅ 正确代码
```javascript
export function onSubTableChange(value, extra) {
  // ✅ 对 getValue() 的返回结果进行深拷贝（相对安全）
  var rawData = this.$('tableField_xxx').getValue();
  var dataCopy;
  try {
    dataCopy = JSON.parse(JSON.stringify(rawData));
  } catch (e) {
    console.error('深拷贝失败，使用原始引用:', e);
    dataCopy = rawData;  // 备用方案直接使用原始引用
  }
  // 继续处理 dataCopy...
}
```

**规则：** 宜搭事件回调参数有循环引用，只对 `getValue()` 的返回结果做深拷贝，且必须包裹 `try-catch`。

---

## 专题：UI 时序问题处理

### 问题概述

在宜搭低代码平台开发中，**代码执行顺序不等于 UI 渲染顺序**。当操作涉及到弹窗、表格、动态组件等需要渲染的 UI 元素时，如果立即操作这些元素，可能会出现 `setValue is not a function` 或操作不生效的问题。

### 典型错误场景

```javascript
// ❌ 错误做法：弹窗显示后立即操作字段
this.$('dialogId').show();
this.$('fieldId').setValue('值');  // 报错：setValue is not a function
```

### 根本原因

1. **DOM 渲染延迟**：调用 `show()` 方法后，浏览器需要时间完成 DOM 渲染
2. **组件初始化延迟**：组件实例需要时间在宜搭框架内完成初始化
3. **异步加载**：部分组件数据是异步加载的，加载完成前无法操作

### 解决方案

#### 1. 使用 setTimeout 延迟执行（推荐）

```javascript
// ✅ 正确做法：延迟 100ms 后操作字段
this.$('dialogId').show();

var that = this;
setTimeout(function() {
  that.$('fieldId').setValue('值');
}, 100);
```

**适用场景：**
- 弹窗显示后填充字段值
- 动态创建组件后操作组件
- 页面初始化后操作复杂组件

#### 2. 关联表单回填后的时序处理

```javascript
// ✅ 关联表单字段变化后，需要等待回填完成
export function handleAssociationChange(value) {
  var rowIndex = this.index;  // 必须在最外层保存
  var subTable = this.$('tableField_xxx');  // 必须在最外层保存
  
  setTimeout(function() {
    var allData = subTable.getValue();  // 延迟后重新获取，此时回填已完成
    var currentRow = allData[rowIndex];
    var filledValue = currentRow['autoFilledField_xxx'];  // ✅ 能取到回填值
    
    // 继续处理...
  }, 300);  // 300ms 等待关联回填完成
}
```

### 时序场景速查表

| 场景 | 最小延迟 | 说明 |
|------|---------|------|
| 弹窗显示后操作字段 | 100ms | 弹窗 DOM 渲染 |
| 关联表单回填后读取 | 300ms | 异步回填完成 |
| 子表 onChange 状态清空 | 0ms | 等 setTimeout(…, 0) |
| 自定义页面数据加载 | 100-200ms | API 响应 + 渲染 |

### 注意事项

1. **延迟时间不是越大越好**：过长的延迟会影响用户体验
2. **必须在最外层保存引用**：`this.index`、`this.$()` 等必须在 setTimeout 外保存
3. **避免嵌套 setTimeout**：多层延迟会导致代码难以维护

---

## 案例 14：跨应用数据连接实战陷阱

### 错误现象
跨应用查询时，参数名、响应格式、数据位置等问题导致查询失败或数据解析错误。

### 常见陷阱汇总

| 陷阱 | 错误现象 | 解决方案 |
|-----|---------|---------|
| 数据源名称错误 | `dataSourceMap.xxx is undefined` | 确认数据源名称与后台配置完全一致 |
| 参数名混淆 | 查询条件不生效 | 尝试 `searchFieldJson` 和 `searchField` 两种参数名 |
| 响应格式不一致 | `totalCount` 提取失败 | 打印完整响应，确认数据层级 |
| 非字符串输入 | 查询异常 | 在函数入口检查 value 类型 |

### 参数名混淆问题

**问题描述：** `searchFieldJson` 在不同场景下可能需要使用 `searchField`。

```javascript
// 方案1：优先使用 searchFieldJson
var params = {
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify({
    'textField_xxx': '搜索值'
  })
};

// 方案2：如果方案1失败，尝试 searchField
var params = {
  formUuid: 'FORM-XXX',
  searchField: JSON.stringify({
    'textField_xxx': '搜索值'
  })
};
```

### 响应格式不一致问题

**问题描述：** API 响应中 `totalCount` 的位置可能变化。

```javascript
// ❌ 错误：固定位置提取
var totalCount = res.result.totalCount;

// ✅ 正确：兼容多种格式
var totalCount = 0;
if (res && res.result && res.result.totalCount) {
  totalCount = res.result.totalCount;
} else if (res && res.totalCount) {
  totalCount = res.totalCount;
} else if (res && res.data && res.data.totalCount) {
  totalCount = res.data.totalCount;
}

// ✅ 最佳：使用可选链和空值合并
var totalCount = res?.result?.totalCount ?? res?.totalCount ?? 0;
```

### 非字符串输入问题

**问题描述：** 自定义校验函数的 `value` 参数可能不是字符串类型。

```javascript
export function checkRepeat(value, rule) {
  // ✅ 入口处检查类型
  if (typeof value !== 'string') {
    console.warn('Input value is not a string, skipping validation.');
    return true;  // 跳过校验
  }
  
  var stringValue = value.trim();
  if (stringValue === '') {
    return true;  // 空值跳过
  }
  
  // 继续校验逻辑...
}
```

### 数据源配置最佳实践

**配置步骤：**
1. 在宜搭后台"连接与集成" → "远程 API"中创建数据源
2. **请求 URL：** `/dingtalk/web/{AppKey}/v1/form/searchFormDatas.json`
3. **请求方法：** `GET`
4. **请求参数配置：** UI 界面**不配置任何 Query 参数**，所有参数由 JS 代码在调用时提供

**代码调用示例：**
```javascript
export function handleCrossAppQuery() {
  var that = this;
  
  var params = {
    formUuid: 'FORM-XXX',
    searchFieldJson: JSON.stringify({
      'textField_xxx': '搜索值'
    }),
    pageSize: 100,
    currentPage: 1
  };
  
  // 注意：数据源名称必须与后台配置完全一致
  this.dataSourceMap.crossAppQuery.load(params).then(function(res) {
    var totalCount = res?.result?.totalCount ?? res?.totalCount ?? 0;
    var data = res?.result?.data ?? res?.data ?? [];
    
    that.utils.toast({
      type: 'success',
      title: '查询完成',
      content: '共 ' + totalCount + ' 条记录'
    });
  }).catch(function(error) {
    console.error('跨应用查询失败:', error);
    that.utils.toast({
      type: 'error',
      title: '查询失败',
      content: error.message || '未知错误'
    });
  });
}
```

### 调试技巧

```javascript
// 在 load() 调用前后打印完整参数
console.log('请求参数:', JSON.stringify(params, null, 2));

this.dataSourceMap.query.load(params).then(function(res) {
  // 打印完整响应结构
  console.log('完整响应:', JSON.stringify(res, null, 2));
  
  // 确认 success 状态、result 结构、totalCount 位置
});
```

---

## 案例 15：地址组件 regionText 数据结构误解

### 错误现象
地址组件解析后，省市区街道字段都是空的，但控制台显示 regionText 数组有数据。

### ❌ 错误代码
```javascript
// 错误假设：regionText 是字符串数组
var regions = addr.regionText;
var province = regions[0] || '';  // 错误！regions[0] 是对象，不是字符串
var city = regions[1] || '';
```

### ✅ 正确代码
```javascript
// 正确理解：regionText 是对象数组，每个对象包含 zh_CN 和 en_US
// 格式: [
//   {zh_CN: "福建省", en_US: "fu jian sheng"},
//   {zh_CN: "龙岩市", en_US: "long yan shi"},
//   {zh_CN: "长汀县", en_US: "chang ting xian"},
//   {zh_CN: "庵杰乡", en_US: "an jie xiang"}
// ]
var regions = addr.regionText;
var province = (regions[0] && regions[0].zh_CN) || '';
var city = (regions[1] && regions[1].zh_CN) || '';
var district = (regions[2] && regions[2].zh_CN) || '';
var street = (regions[3] && regions[3].zh_CN) || '';
```

### 调试技巧
```javascript
// 打印完整数据结构
console.log('地址组件返回值:', JSON.stringify(addr, null, 2));
// 检查 regionText 的每个元素
addr.regionText.forEach(function(item, index) {
  console.log('regionText[' + index + ']:', item);
});
```

### 关键要点
1. **regionText 是对象数组**，不是字符串数组
2. **提取中文地址使用 `.zh_CN`**，英文使用 `.en_US`
3. **使用短路运算符防止 undefined 错误**：`(regions[0] && regions[0].zh_CN) || ''`

---

## 案例 16：didMount 初始化时组件未加载（字段顺序联动功能踩坑实录）

### 错误现象
```
Cannot read properties of null (reading 'getValue')
字段3默认是可编辑状态（应该禁用）
```

### ❌ 错误代码
```javascript
export function didMount() {
  console.log('功能已加载');
  
  // 错误：didMount 执行时组件可能未完全加载
  var value = this.$('textField_xxx').getValue();  // 返回 null！
  this.$('textField_xxx').set('disabled', true);   // 可能不生效
}
```

### ✅ 正确代码
```javascript
export function didMount() {
  console.log('功能已加载');
  
  var that = this;
  
  // 正确：使用 setTimeout 延迟初始化
  setTimeout(function() {
    var component = that.$('textField_xxx');
    if (!component) {
      console.error('组件不存在，ID:', 'textField_xxx');
      return;
    }
    
    var value = component.getValue();
    component.set('disabled', true);
    console.log('初始化完成');
  }, 100);
}
```

### 关键要点
1. **didMount 执行时组件可能未完全加载**，直接操作返回 null
2. **必须使用 setTimeout 延迟初始化**（建议 100ms）
3. **操作前检查组件是否存在**，避免 null 引用错误
4. **参考版本**：字段顺序填写联动功能 v1.0.0 → v1.0.1

---

## 案例 17：setValue 触发字段校验规则报错

### 错误现象
```
bound main 函数执行错误
Cannot read properties of null (reading 'getValue')
at Proxy.validateRule
```

### ❌ 错误代码
```javascript
export function onFieldChange(event) {
  // 错误：setValue 会触发字段校验规则
  this.$('textField_xxx').setValue('');  // 触发校验，如果校验规则有bug会报错
}
```

### ✅ 正确代码
```javascript
export function onFieldChange(event) {
  try {
    var component = this.$('textField_xxx');
    if (!component) {
      console.error('组件不存在');
      return;
    }
    
    // 正确：只禁用字段，不清空值（避免触发校验）
    component.set('disabled', true);
    // component.setValue('');  // 慎用！会触发校验规则
    
  } catch (error) {
    console.error('处理失败:', error);
    
    // 捕获到校验规则错误时给出明确提示
    if (error.message && error.message.indexOf('validateRule') !== -1) {
      console.error('提示：表单字段配置了校验规则，但校验规则代码有错误');
      console.error('建议：检查表单字段的校验规则设置');
    }
  }
}
```

### 关键要点
1. **setValue 会触发字段校验规则**，如校验规则有 bug 会导致报错
2. **禁用字段时建议只使用 set('disabled', true)**，避免调用 setValue('')
3. **捕获错误时检查是否包含 'validateRule'**，给用户明确提示
4. **根本解决方案**：修复表单字段的校验规则代码
5. **参考版本**：字段顺序填写联动功能 v1.0.2 → v1.0.4

---

## 案例 18：组件存在性检查缺失

### 错误现象
```
Cannot read properties of null (reading 'getValue')
Cannot read properties of null (reading 'set')
```

### ❌ 错误代码
```javascript
export function initFieldStatus() {
  // 错误：未检查组件是否存在
  var value = this.$('field1').getValue();  // 如果组件不存在，返回 null，getValue 报错
  this.$('field2').set('disabled', true);   // 如果组件不存在，set 报错
}
```

### ✅ 正确代码
```javascript
export function initFieldStatus() {
  // 正确：先获取组件，检查是否存在
  var field1Component = this.$('field1');
  var field2Component = this.$('field2');
  
  // 调试日志：检查组件是否存在
  console.log('字段1组件:', field1Component ? '存在' : '不存在', 'ID:', 'field1');
  console.log('字段2组件:', field2Component ? '存在' : '不存在', 'ID:', 'field2');
  
  // 检查组件是否存在
  if (!field1Component || !field2Component) {
    console.error('错误：部分字段组件未找到，请检查字段ID配置');
    return;
  }
  
  // 安全操作
  var value = field1Component.getValue();
  field2Component.set('disabled', true);
}
```

### 关键要点
1. **this.$() 可能返回 null**（字段ID错误或组件未加载）
2. **操作前必须检查组件是否存在**
3. **添加调试日志**，方便排查字段ID问题
4. **优雅降级**：组件不存在时给出明确提示，不中断执行
5. **参考版本**：字段顺序填写联动功能 v1.0.1 → v1.0.2

---

## 案例 19：错误使用 hide()/show() 方法控制组件显示

### 错误现象
```
TypeError: imageComponent.hide is not a function
TypeError: imageComponent.show is not a function
```

### ❌ 错误代码
```javascript
// 错误：宜搭组件没有 hide() 和 show() 方法
var imageComponent = this.$('imageField_xxx');
imageComponent.hide();  // 报错：hide is not a function
imageComponent.show();  // 报错：show is not a function

// 错误：set('visible', false) 对某些组件不生效
imageComponent.set('visible', false);  // 可能不生效
```

### ✅ 正确代码
```javascript
// 正确：使用 setBehavior() 方法控制组件状态
var imageComponent = this.$('imageField_xxx');

// 隐藏组件 - 设置为 HIDDEN 状态
imageComponent.setBehavior('HIDDEN');

// 显示组件 - 设置为 NORMAL 状态
imageComponent.setBehavior('NORMAL');
```

### 组件状态说明

| 状态值 | 说明 | 使用场景 |
|--------|------|----------|
| NORMAL | 正常态，即输入态 | 显示组件，允许编辑 |
| READONLY | 只读态 | 显示组件，但只读 |
| DISABLED | 禁用态 | 显示组件，但禁用 |
| HIDDEN | 隐藏态 | 完全隐藏组件 |

### 获取当前状态
```javascript
// 获取组件当前状态
var behavior = this.$('fieldId').getBehavior();
console.log('当前状态:', behavior);  // NORMAL / READONLY / DISABLED / HIDDEN
```

### 关键要点
1. **宜搭组件没有 hide() 和 show() 方法**，这是常见误解
2. **set('visible', false/true) 对某些组件不生效**（如图片组件）
3. **使用 setBehavior('HIDDEN'/'NORMAL') 是更可靠的方法**
4. **参考 API 文档**：`references/common-core/api-reference.md` 第 1.4 节
5. **参考版本**：条件显示图片组件功能 v1.0.0 → v1.0.4

---

## 案例 20：getFormDataById 用 checkApiSuccess 判断导致误判失败（直播翻车实录！）

### 错误现象
```
查询采购订单主表失败
查询采购订单异常: Error: 查询采购订单主表失败
```

### 错误原因
`getFormDataById` API 返回的是扁平对象 `{serialNo, instValue, creator, originator, title, modelUuid, version}`，**没有 `success` / `data` / `result` 字段**。`checkApiSuccess` 遍历所有判断条件都不满足，返回 `false`，导致明明成功的查询被判定为失败。

### ❌ 错误代码
```javascript
that.dataSourceMap['getPurchaseOrderDetail'].load({
  formInstId: formInstId,
  formUuid: CONFIG.TARGET_FORM.FORM_UUID
}).then(function(res) {
  if (!checkApiSuccess(res)) {
    // res 是 {serialNo: "CG20260724004", ...}，checkApiSuccess 返回 false！
    throw new Error('查询采购订单主表失败');  // 明明查询成功了却报错！
  }
  var formData = res.formData || res.data || res || {};
  var orderNo = formData[CONFIG.SOURCE_FIELD_IDS.ORDER_NO] || '';  // res 没有 formData！
});
```

### ✅ 正确代码
```javascript
that.dataSourceMap['getPurchaseOrderDetail'].load({
  formInstId: formInstId,
  formUuid: CONFIG.TARGET_FORM.FORM_UUID
}).then(function(res) {
  // getFormDataById 返回扁平对象，用 serialNo 判断成功
  if (!res || !res.serialNo) {
    throw new Error('查询采购订单主表失败');
  }
  var orderNo = res.serialNo;  // 订单号/流水号在 serialNo 字段
  // 注意：子表数据不在返回值中，需单独调用 listTableData 接口
});
```

### 关键要点
1. **getFormDataById 不适用 checkApiSuccess** — 返回结构完全不同
2. **订单号在 `res.serialNo`** — 不是 `res.formData[serialNumberField_xxx]`
3. **子表数据不在返回值中** — 必须单独调用 `listTableDataByFormInstIdAndTableId`
4. **`instValueMap[fieldId]` 不一定是字符串** — 可能是 `{zh_CN, en_US}` 等对象，直接 `setValue` 给文本字段会显示 `[object Object]`；订单号优先用 `res.serialNo`
5. **参考版本**：采购订单填充入库明细 v1.0.0 → v1.4.0（直播翻车修复）

---

## 案例 21：listTableData 子表API关联字段带 _id 后缀（直播翻车实录！）

### 错误现象
跨表查询子表后，关联表单字段显示为空（undefined）

### 错误原因
`listTableDataByFormInstIdAndTableId` API 返回的子表行数据中，关联表单字段的 key 带 `_id` 后缀（如 `associationFormField_xxx_id`），**标准字段名（不带 `_id`）的值为空**。代码使用前端 `getValue()` 的字段名来读取，导致读到 undefined。

### ❌ 错误代码
```javascript
// 子表API返回的行数据：
// { associationFormField_xxx_id: "\"[{\\\"instanceId\\\":\\\"FINST-xxx\\\"...}]\"", associationFormField_xxx: undefined }

var productAssoc = formatAssociationField(sourceRow['associationFormField_xxx']);  // undefined → []
```

### ✅ 正确代码
```javascript
// 使用 getAssociationValue 工具函数，优先尝试 _id 后缀
function getAssociationValue(row, fieldId) {
  var value = row[fieldId + '_id'];  // 优先尝试 _id 后缀
  if (value !== undefined && value !== null) {
    return formatAssociationField(value);
  }
  return formatAssociationField(row[fieldId]);  // 兼容前端格式
}

var productAssoc = getAssociationValue(sourceRow, 'associationFormField_xxx');
if (productAssoc.length > 0) {
  rowData['associationFormField_yyy'] = [{
    appType: productAssoc[0].appType || CONFIG.APP_ID,
    formType: 'receipt',
    formUuid: productAssoc[0].formUuid || '',
    instanceId: productAssoc[0].instanceId || '',
    title: productAssoc[0].title || ''
  }];
}
```

### 关键要点
1. **子表API关联字段只有 `_id` 后缀版本有数据** — 标准字段名为空
2. **必须使用 `getAssociationValue` 函数** — 优先尝试 `_id` 后缀
3. **下拉字段同理** — `selectField_xxx` 有 `_id` 后缀版本 `selectField_xxx_id`
4. **参考版本**：采购订单填充入库明细 v1.0.0 → v1.0.3（直播翻车修复）

---

## 案例 22：listTableData 返回数据在顶层，通用兼容逻辑导致解析失败（直播翻车实录！）

### 错误现象
子表查询返回有数据，但代码解析后 `dataList` 为空

### 错误原因
`listTableDataByFormInstIdAndTableId` 返回 `{data: [...], totalCount, currentPage}`，`data` 在顶层。通用兼容逻辑 `var result = res.result || res || {}; var list = result.data || [];` 中，`res.result` 为 undefined，`res` 本身就是含 `data` 的对象，`res || {}` 取 `res`，但 `res.data` 是数组而非对象，没有 `.data` 属性，导致 `result.data` 为 undefined。

### ❌ 错误代码
```javascript
var result = res.result || res || {};  // res.result 是 undefined, res 是 {data:[...], totalCount:2}
var list = result.data || [];  // res.data 是数组，数组没有 data 属性 → undefined → []

// 或者更隐蔽的错误：
var result = res.result || res.data || res || {};
var list = result.data || [];  // res.result = undefined, res.data = [行1, 行2],
                               // result = [行1, 行2]，数组没有 .data → []
```

### ✅ 正确代码
```javascript
// listTableData 的 data 在顶层，不能用通用兼容逻辑
var list = [];
if (res && res.data && Array.isArray(res.data)) {
  list = res.data;
} else if (res && res.result && res.result.data && Array.isArray(res.result.data)) {
  list = res.result.data;
}
var totalCount = res.totalCount || 0;
```

### 关键要点
1. **不同API的返回结构完全不同** — 不要用同一套兼容逻辑处理所有API
2. **`listTableData` 的 `data` 在顶层** — 不是 `res.result.data`
3. **数组没有 `.data` 属性** — `res.result || res` 当 `res.result` 为 undefined 时，`result` 变成含 `data` 的对象，看起来没问题；但如果先用了 `res.data`，`result` 就变成数组了
4. **参考版本**：采购订单填充入库明细 v1.0.0 → v1.4.0（直播翻车修复）

---

*文档版本：v1.10.0*
*更新内容：
- 案例 20 增加要点：instValueMap[fieldId] 可能是对象格式，订单号优先用 res.serialNo，避免 setValue 后显示 [object Object]
- 参考采购订单填充入库明细开发经验（v1.0.0 → v1.4.0，直播翻车实录）*
