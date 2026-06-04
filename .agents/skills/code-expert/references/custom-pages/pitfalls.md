# 自定义页面 - 常见坑点总结

> 宜搭自定义页面开发中高频踩坑问题及正确解法
> 版本: v1.1.0

---

> ⚠️ **开发前强制阅读**：自定义页面与表单动作代码结构类似，但存在若干关键差异。
> 请按顺序阅读本文档，再开始编写代码。

---

## 一、API 返回格式问题（最严重）

### 问题描述
宜搭不同 API 的成功返回格式完全不同，容易导致误判：
- **新增 API** (`saveFormData`): 成功返回字符串 `"FINST-xxx"`
- **编辑 API** (`updateFormData`): 成功返回 `null`
- **删除 API** (`deleteFormData`): 成功返回 `null`
- **查询 API**: 成功返回对象 `{success: true, data: [...]}`

### 错误示例
```javascript
// ❌ 错误：直接判断 success 字段
this.dataSourceMap['editDataSource'].load(params).then(function(res) {
  if (res.success) {  // 编辑API返回null，res.success会报错！
    // ...
  }
});
```

### 正确解决方案
**自定义页面代码顶部必须包含此工具函数：**

```javascript
// ✅ 正确：使用统一工具函数判断
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true;  // 编辑/删除成功
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;  // 新增成功
  if (res && (res.success === true || res.success === 1)) return true;  // 查询成功
  if (res && (res.data || (res.result && res.result.data))) return true;  // 直接返回数据
  return false;
}

this.dataSourceMap['dataSource'].load(params).then(function(res) {
  if (checkApiSuccess(res)) {
    // 成功处理
  } else {
    // 失败处理
  }
});
```

---

## 二、UI 渲染时序问题

### 问题描述
弹窗显示后立即操作字段（如 setValue）会报错：`setValue is not a function`

### 根本原因
代码执行顺序 ≠ UI 渲染顺序。弹窗 DOM 需要时间渲染完成。

### 错误示例
```javascript
// ❌ 错误：立即设置值
export function openEditDialog(rowData) {
  this.$('dialog_edit').show();
  this.$('field_name').setValue(rowData.name);  // 报错！DOM 未就绪
}
```

### 正确解决方案
```javascript
// ✅ 正确：延迟 100ms 后设置值
export function openEditDialog(rowData) {
  var that = this;
  this.$('dialog_edit').show();

  setTimeout(function() {
    that.$('field_name').setValue(rowData.name || '');
    that.$('field_age').setValue(rowData.age || '');
  }, 100);
}
```

---

## 三、表格行选择器事件函数签名问题

### 问题描述
表格行选择器（勾选框）的事件回调函数签名与普通 onChange 不同，使用错误签名会导致无法获取选中行数据。

### 错误示例
```javascript
// ❌ 错误：使用 onChange 事件，期望获取 event.selectedRows
export function onRowSelect(event) {
  var selectedRows = event.selectedRows;  // undefined！
}
```

### 正确解决方案
**必须使用宜搭标准的 onSelect 回调函数签名：**

```javascript
/**
 * 行选择器回调函数
 * @param selected Boolean 是否选中
 * @param rowData Object 当前操作行
 * @param selectedRows Array 所有选中的行数据
 *
 * 【绑定方式】
 * 1. 选中表格组件
 * 2. 找到【行选择器】配置
 * 3. 将事件绑定到 onSelect（不是 onChange！）
 */
export function onSelect(selected, rowData, selectedRows) {
  console.log('是否选中:', selected);
  console.log('当前行:', rowData);
  console.log('所有选中行:', selectedRows);

  // 保存选中行到全局状态
  pageState.selectedRows = selectedRows || [];
  pageState.selectedCount = pageState.selectedRows.length;
}
```

**关键提示**：
- 绑定事件名是 **onSelect**，不是 onChange
- 函数签名是三个参数：`(selected, rowData, selectedRows)`

---

## 四、表格行数据获取方式问题

### 问题描述
表格操作按钮、行选择器、以及跨表查询 API 返回的数据结构各不相同，混用会导致数据获取失败。

### 错误示例
```javascript
// ❌ 错误：假设所有场景都有 formData 层级
export function handleRowAction(event) {
  var rowData = event.rowData || {};
  var formData = rowData.formData || {};  // 表格操作按钮不一定有 formData！
  var name = formData['textField_name'];  // 获取不到值
}
```

### 各场景数据结构对比

| 数据来源 | 数据结构 | 获取方式 |
|---------|---------|---------|
| 跨表查询 API 返回 | `{formData: {...}, formInstId: '...'}` | `rowData.formData.fieldId` |
| 表格操作按钮 event | 直接行数据对象 `{creator: '...', fieldId: '...'}` | `event.fieldId` |
| 行选择器 rowData 参数 | 直接行数据对象 `{creator: '...', fieldId: '...'}` | `rowData.fieldId` |

### 正确解决方案
**使用兼容函数处理两种结构：**

```javascript
// 兼容提取表单数据（适配所有场景）
function extractFormData(rowData) {
  if (!rowData) return {};

  // 情况1: 跨表查询API返回的标准结构 {formData: {...}}
  if (rowData.formData) {
    return rowData.formData;
  }

  // 情况2: 表格操作按钮或行选择器直接传递行数据
  if (rowData.formUuid || rowData.creator) {
    return rowData;
  }

  return rowData;
}

// 表格操作按钮（编辑/删除）
export function handleRowAction(event) {
  var rowData = event;  // 宜搭表格操作按钮直接将行数据传入
  console.log('行数据:', rowData);
  var fieldValue = rowData['textField_name'];  // 直接读取
}

// 行选择器
export function onSelect(selected, rowData, selectedRows) {
  var formData = extractFormData(rowData);
  var fieldValue = formData['textField_name'];
}
```

---

## 五、弹窗字段 ID 混淆问题

### 问题描述
新增弹窗和编辑弹窗通常包含相同业务字段，但对应不同的组件 ID，混用会操作到错误的弹窗字段。

### 错误示例
```javascript
// 编辑弹窗显示后，误用了新增弹窗的字段 ID
export function openEditDialog(rowData) {
  this.$('dialog_edit').show();
  setTimeout(function() {
    that.$('textField_add_name').setValue(rowData.name);  // 错误！这是新增弹窗的字段
  }, 100);
}
```

### 正确解决方案
**在 CONFIG 中分别定义不同弹窗的字段 ID：**

```javascript
var CONFIG = {
  ADD_DIALOG: {
    DIALOG_ID: 'dialog_add',
    FIELDS: {
      NAME: 'textField_add_name',
      STATUS: 'radioField_add_status'
    }
  },
  EDIT_DIALOG: {
    DIALOG_ID: 'dialog_edit',
    FIELDS: {
      NAME: 'textField_edit_name',
      STATUS: 'radioField_edit_status'
    }
  }
};

export function openAddDialog() {
  this.$(CONFIG.ADD_DIALOG.DIALOG_ID).show();
  var that = this;
  setTimeout(function() {
    that.$(CONFIG.ADD_DIALOG.FIELDS.NAME).setValue('');  // 使用新增弹窗字段
  }, 100);
}

export function openEditDialog(rowData) {
  var that = this;
  this.$(CONFIG.EDIT_DIALOG.DIALOG_ID).show();
  setTimeout(function() {
    that.$(CONFIG.EDIT_DIALOG.FIELDS.NAME).setValue(rowData.name || '');  // 使用编辑弹窗字段
    that.$(CONFIG.EDIT_DIALOG.FIELDS.STATUS).setValue(rowData.status || '');
  }, 100);
}
```

---

## 六、数据源配置问题

### 问题描述
自定义页面通常需要增删改查四个独立数据源，容易遗漏某个或命名不规范。

### 解决方案
**标准数据源配置结构（所有自定义页面通用）：**

```javascript
var CONFIG = {
  APP_ID: 'APP_XXXXXXXXXXXXXXXXXXXX',  // 应用 AppID
  DATA_SOURCE: {
    QUERY: 'queryDataSource',    // 查询数据源
    ADD: 'addDataSource',        // 新增数据源
    EDIT: 'editDataSource',      // 编辑数据源
    DELETE: 'deleteDataSource'   // 删除数据源
  },
  FORM_UUID: {
    MAIN: 'FORM-XXXXXXXXXXXXXXXXXXXXXXXXXXXX'  // 表单 UUID
  }
};
```

**宜搭后台配置要求（每个数据源）：**

| 数据源名称 | API 地址 | 请求方式 |
|-----------|---------|---------|
| queryDataSource | `/dingtalk/web/{APP_ID}/v1/form/searchFormDatas.json` | GET |
| addDataSource | `/dingtalk/web/{APP_ID}/v1/form/saveFormData.json` | POST |
| editDataSource | `/dingtalk/web/{APP_ID}/v1/form/updateFormData.json` | POST |
| deleteDataSource | `/dingtalk/web/{APP_ID}/v1/form/deleteFormData.json` | POST |

---

## 七、数据源调用参数名配对问题

### 问题描述
新增和编辑 API 的表单数据参数名不同，用错会导致数据保存失败（无报错但数据为空）。

### 易错点
```javascript
// ❌ 错误：编辑时用了新增的参数名
this.dataSourceMap['editDataSource'].load({
  formInstId: rowData.formInstId,
  formDataJson: JSON.stringify(formData)  // 错误！编辑用 updateFormDataJson
});

// ❌ 错误：新增时用了编辑的参数名
this.dataSourceMap['addDataSource'].load({
  updateFormDataJson: JSON.stringify(formData)  // 错误！新增用 formDataJson
});
```

### 正确参数对比

| 操作 | API | 数据参数名 |
|------|-----|----------|
| 新增 | `saveFormData` | **`formDataJson`** |
| 编辑 | `updateFormData` | **`updateFormDataJson`** |
| 删除 | `deleteFormData` | `formInstId` |
| 查询 | `searchFormDatas` | `searchFieldJson` |

```javascript
// ✅ 正确：新增
this.dataSourceMap[CONFIG.DATA_SOURCE.ADD].load({
  appId: CONFIG.APP_ID,
  formUuid: CONFIG.FORM_UUID.MAIN,
  formDataJson: JSON.stringify(formData)  // 新增用 formDataJson
});

// ✅ 正确：编辑
this.dataSourceMap[CONFIG.DATA_SOURCE.EDIT].load({
  appId: CONFIG.APP_ID,
  formUuid: CONFIG.FORM_UUID.MAIN,
  formInstId: rowData.formInstId,
  updateFormDataJson: JSON.stringify(formData)  // 编辑用 updateFormDataJson
});
```

---

## 八、表格数据列字段映射问题

### 问题描述
表格组件的列字段配置格式不正确，导致数据无法正确显示。

### 正确格式
在宜搭表格组件的列配置中，字段映射格式为：
```
formData.textField_xxx
formData.numberField_xxx
formData.selectField_xxx
formData.dateField_xxx
```

### 表格操作按钮配置
```javascript
// 表格操作列按钮配置
// - 动作类型：调用JS函数
// - 绑定函数：handleRowAction
// - 传入参数：{"action": "edit"} 或 {"action": "delete"}

export function handleRowAction(event) {
  // event 包含行数据，event.action 区分按钮类型
  var action = event.action || 'default';
  var rowData = event;  // 行数据直接在 event 中

  if (action === 'edit') {
    this.openEditDialog(rowData);
  } else if (action === 'delete') {
    this.confirmDelete(rowData);
  }
}
```

---

## 九、查询数据格式兼容处理

### 问题描述
跨表查询 API 返回数据格式有多种，需要兼容处理，否则偶尔会获取不到数据。

### 兼容处理示例
```javascript
export function loadTableData() {
  var that = this;

  this.dataSourceMap[CONFIG.DATA_SOURCE.QUERY].load({
    formUuid: CONFIG.FORM_UUID.MAIN,
    currentPage: pageState.currentPage,
    pageSize: 20
  }).then(function(res) {
    // 兼容多种返回格式
    var result = res.result || res || {};
    var dataList = result.data || res.data || [];
    var totalCount = result.totalCount || res.totalCount || 0;

    // 更新页面状态
    pageState.totalCount = totalCount;

    // 设置表格数据
    that.$('table_main').setValue(dataList);
  }).catch(function(error) {
    console.error('加载数据失败:', error);
    that.utils.toast({ type: 'error', title: '数据加载失败' });
  });
}
```

---

## 十、函数绑定位置说明

### 问题描述
不清楚各函数应绑定在什么事件或按钮上，导致功能无法触发。

### 标准绑定清单

| 功能 | 绑定位置 | 绑定函数 | 备注 |
|------|---------|---------|------|
| 页面初始化 | 页面JS面板 didMount | `didMount`（自动调用） | - |
| 打开新增弹窗 | 新增按钮 onClick | `openAddDialog` | - |
| 确认新增 | 新增弹窗确认按钮 | `confirmAdd` | - |
| 编辑/删除 | 表格操作列按钮 | `handleRowAction` | 传入 action 参数 |
| 确认编辑 | 编辑弹窗确认按钮 | `confirmEdit` | - |
| 行选择器 | 表格行选择器 onSelect | `onSelect` | 注意函数签名！ |
| 搜索 | 搜索按钮 onClick | `onSearch` | - |
| 分页 | 分页组件 onChange | `onPageChange` | - |

### 代码注释规范（必须注明绑定方式）

```javascript
/**
 * 新增弹窗确认函数
 *
 * 【绑定方式】
 * 1. 选中新增弹窗的【确认】按钮
 * 2. 点击【动作】面板
 * 3. 选择【调用JS函数】
 * 4. 选择本函数 confirmAdd
 *
 * 版本号: v1.0.0
 */
export function confirmAdd() {
  // 实现逻辑
}
```

---

## 快速检查清单

### 开发前必须确认
- [ ] 已阅读本文档（custom-pages/pitfalls.md）
- [ ] 已确认行选择器使用 `onSelect(selected, rowData, selectedRows)` 签名
- [ ] 已确认表格操作按钮直接传递行数据对象（非嵌套结构）
- [ ] 已区分新增弹窗和编辑弹窗的字段 ID

### 代码编写中检查
- [ ] 代码顶部包含 `checkApiSuccess()` 工具函数
- [ ] 弹窗显示后操作字段使用 `setTimeout(fn, 100)` 延迟
- [ ] 新增用 `formDataJson`，编辑用 `updateFormDataJson`
- [ ] 数据源四个名称（QUERY/ADD/EDIT/DELETE）均已配置
- [ ] 关键操作有 `.catch()` 错误处理

### 提交前检查
- [ ] 所有函数注释包含绑定方式说明
- [ ] 版本号已更新（文件头部）
- [ ] CONFIG 中 APP_ID 和 FORM_UUID 已填入实际值

---

## 十一、表格组件 API 方法名错误

### 问题描述
TablePc 组件没有 `setData()` 方法，调用会报错 `table.setData is not a function`。

### 错误示例
```javascript
// ❌ 错误：TablePc 没有 setData 方法
var table = this.$('table_doing');
table.setData({ data: list });  // 报错！
```

### 正确解决方案
```javascript
// ✅ 正确：使用 set("data", ...) 方法
var table = this.$('table_doing');
table.set("data", { data: list });
```

---

## 十二、Dialog 组件显示/隐藏方法错误

### 问题描述
Dialog 组件没有 `set("visible", ...)` 方法，调用会报错或无效。

### 错误示例
```javascript
// ❌ 错误：Dialog 没有 set("visible") 方法
var dialog = this.$('dialog_add');
dialog.set("visible", true);   // 无效或报错！
dialog.set("visible", false);  // 无效或报错！
```

### 正确解决方案
```javascript
// ✅ 正确：使用 show() / hide() 方法
var dialog = this.$('dialog_add');
dialog.show();  // 显示弹窗
dialog.hide();  // 隐藏弹窗
```

---

## 十三、yida API 名称错误

### 问题描述
`this.utils.yida` 中没有 `createFormData` 方法，该 API 名称不存在。

### 错误示例
```javascript
// ❌ 错误：createFormData 不存在
this.utils.yida.createFormData({
  formUuid: FORM_UUID,
  formData: formDataObj  // 错误：参数名也不对
});
```

### 正确解决方案
```javascript
// ✅ 正确：使用 saveFormData
this.utils.yida.saveFormData({
  formUuid: FORM_UUID,
  appType: APP_TYPE,                    // 必须传入应用类型
  formDataJson: JSON.stringify(formDataObj)  // 数据必须转为 JSON 字符串
});
```

**关键参数说明**：
| 参数 | 类型 | 是否必填 | 说明 |
|------|------|---------|------|
| `formUuid` | string | ✅ | 表单 UUID |
| `appType` | string | ✅ | 应用类型（如 APP_XXXXXXXXXXXXXX） |
| `formDataJson` | string | ✅ | 表单数据 JSON 字符串 |

---

## 十四、日期字段时间戳格式问题

### 问题描述
DateField 组件 `getValue()` 返回的是格式化字符串（如 `"2024-01-15"`），但 `saveFormData` 的 `formDataJson` 要求日期字段传 **13位毫秒时间戳**，传字符串会导致数据保存后显示为空。

### 错误示例
```javascript
// ❌ 错误：直接传递日期字符串
var dueDate = this.$('dlg_dueDate').getValue();  // "2024-01-15"
formDataObj.dateField_xxx = dueDate;  // 错误！saveFormData 需要毫秒时间戳
```

### 正确解决方案
```javascript
// ✅ 正确：转换为毫秒时间戳
function toTimestamp(dateValue) {
  if (!dateValue) return '';
  if (typeof dateValue === 'number') return dateValue;
  if (typeof dateValue === 'string') {
    var ts = new Date(dateValue).getTime();
    return isNaN(ts) ? '' : ts;
  }
  return '';
}

var dueDate = this.$('dlg_dueDate').getValue();
var ts = toTimestamp(dueDate);
if (ts) {
  formDataObj.dateField_xxx = ts;  // 传毫秒时间戳
}
```

---

## 十五、字段 ID 必须与底表实际字段一致

### 问题描述
自定义页面中引用的字段 ID 必须与底表（普通表单）中实际的组件 ID 完全一致。凭想象编造字段 ID 会导致：表格显示空行、新增数据字段丢失、编辑回填失败。

### 错误示例
```javascript
// ❌ 错误：使用不存在的字段 ID
formDataObj.radioField_lnlkspl2 = '中';  // 底表没有这个字段！
formDataObj.employeeField_lnlkspl5 = ''; // 底表没有这个字段！
```

### 正确解决方案
**必须从底表的 `组件ID清单.md` 或 Schema 中获取真实字段 ID：**

```javascript
// ✅ 正确：使用底表真实字段 ID
formDataObj.textField_lnlkspl1 = taskName;      // 待办事项
formDataObj.radioField_lojt4j84 = category;     // 分类
formDataObj.rateField_lojt4j85 = importance;    // 重要度
formDataObj.dateField_lnlkspkx = remindDate;    // 设置提醒日期
formDataObj.textareaField_lojt4j87 = detail;    // 待办详情
```

**获取真实字段 ID 的方法**：
1. 查看底表目录下的 `组件ID清单.md`
2. 查看底表的 JSON Schema 文件中的 `fieldId` 字段
3. 宜搭设计器中查看组件的「字段标识」

---

## 十六、表格操作按钮回调绑定错误

### 问题描述
宜搭自定义页面的表格操作栏/操作列按钮，**不能直接绑定 `this.onXxx.bind(this)`**。表格组件有标准的统一回调函数，需要通过 `__sid` 分发到具体业务函数。

### 错误示例（Schema 配置）
```json
// ❌ 错误：直接绑定业务函数
{
  "callback": { "type": "JSExpression", "value": "this.onAddClick.bind(this)" }
}
```

### 正确解决方案
**Schema 中使用统一回调：**
```json
// ✅ 正确：操作栏按钮使用 onActionBarItemClick
{
  "callback": { "type": "JSExpression", "value": "this.onActionBarItemClick.bind(this)" },
  "__sid": "item_doing_add"
}

// ✅ 正确：操作列按钮使用 onActionColumnItemClick
{
  "callback": { "type": "JSExpression", "value": "this.onActionColumnItemClick.bind(this)" },
  "__sid": "item_doing_edit"
}
```

**JS 代码中分发处理：**
```javascript
function onActionBarItemClick(item, record) {
  if (item && item.__sid === 'item_doing_add') {
    this.onAddClick();
  }
}

function onActionColumnItemClick(item, record, index) {
  if (item && item.__sid === 'item_doing_edit') {
    this.onEditClick(record, index);
  } else if (item && item.__sid === 'item_doing_delete') {
    this.onDeleteClick(record, index);
  }
}
```

---

## 十七、confirm() 在 iframe 中被阻止

### 问题描述
自定义页面运行在宜搭的 iframe 中，`confirm()` 弹窗会被浏览器安全策略阻止，导致函数中断执行，删除等操作无反应。

### 错误示例
```javascript
// ❌ 错误：confirm() 在 iframe 中会被阻止
function onDeleteClick(record, index) {
  if (confirm('确定删除吗？')) {  // 被阻止！函数中断
    this.utils.yida.deleteFormData({ formInstId: record.formInstId });
  }
}
```

### 正确解决方案
```javascript
// ✅ 正确：直接执行，无需 confirm
function onDeleteClick(record, index) {
  var self = this;
  this.utils.yida.deleteFormData({
    formInstId: record.formInstId
  }).then(function() {
    self.utils.toast({ title: '删除成功', type: 'success' });
    self.loadData();
  }).catch(function(err) {
    self.utils.toast({ title: '删除失败: ' + err.message, type: 'error' });
  });
}
```

---

## 十八、rowSelection 回调绑定

### 问题描述
自定义页面中表格的行选择器（勾选框），应使用 `onChange` 回调而非 `onSelect`。

### 正确配置
```json
{
  "rowSelection": {
    "mode": "multiple",
    "onChange": { "type": "JSExpression", "value": "this.onRowSelect.bind(this)" }
  }
}
```

**JS 代码处理：**
```javascript
function onRowSelect(selectedRowKeys) {
  // selectedRowKeys 是选中的行 key 数组
  console.log('选中行:', selectedRowKeys);
}
```

---

*文档版本: v1.2.0*
*更新内容: 补充 8 个新坑点（表格 API、Dialog API、yida API 名称、日期时间戳、字段 ID 一致性、按钮回调、confirm 阻止、rowSelection 回调）*
