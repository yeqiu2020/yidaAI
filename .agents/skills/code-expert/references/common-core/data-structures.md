# 宜搭组件 JS 数据结构参考

> 各组件 getValue() / setValue() 标准格式
> 版本: v1.1.0
> 迁移自: 11-component-data-structures.md
> 更新: 补充地址组件 regionText 详细格式说明

***

## 一、基础字段

### 1. 单行文本 (TextField)

```javascript
// getValue 返回: 字符串
var value = this.$('textField_xxx').getValue(); // "我是单行文本"
this.$('textField_xxx').setValue("新的文本");
```

### 2. 多行文本 (TextareaField)

```javascript
var value = this.$('textareaField_xxx').getValue(); // "多行文本"
this.$('textareaField_xxx').setValue("新的多行文本");
```

### 3. 数值 (NumberField)

```javascript
var value = this.$('numberField_xxx').getValue(); // 12345
this.$('numberField_xxx').setValue(100);
```

### 4. 评分 (RateField)

```javascript
var value = this.$('rateField_xxx').getValue(); // 4
this.$('rateField_xxx').setValue(5);
```

### 5. 流水号 (SerialNumberField)

```javascript
var value = this.$('serialNumberField_xxx').getValue(); // "0001"
```

***

## 二、选择类字段

### 6. 单选 (RadioField)

```javascript
// getValue 返回: 字符串（选项值）
var value = this.$('radioField_xxx').getValue(); // "选项一"
this.$('radioField_xxx').setValue("选项二");
```

### 7. 复选 (CheckboxField)

```javascript
// getValue 返回: 字符串数组
var value = this.$('checkboxField_xxx').getValue(); // ["选项二", "选项一"]
this.$('checkboxField_xxx').setValue(["选项一", "选项三"]);
```

### 8. 下拉单选 (SelectField)

```javascript
var value = this.$('selectField_xxx').getValue(); // "选项二"
this.$('selectField_xxx').setValue("选项一");
```

### 9. 下拉复选 (MultiSelectField)

```javascript
var value = this.$('multiSelectField_xxx').getValue(); // ["选项二", "选项三"]
this.$('multiSelectField_xxx').setValue(["选项一", "选项二"]);
```

### 10. 级联选择 (CascaderField)

```javascript
// getValue 返回: 字符串（最后一级的值）
var value = this.$('cascaderField_xxx').getValue(); // "part_b"
this.$('cascaderField_xxx').setValue("part_c");
```

***

## 三、成员/部门类字段

### 11. 成员 (EmployeeField)

```javascript
// getValue 返回: 对象数组
// [{avatar: "...", key: "xxx", label: "叶秋", value: "xxx"}]

var members = this.$('employeeField_xxx').getValue();
var memberId = members[0].value || members[0].key; // 成员ID

// 设置（单个成员）
this.$('employeeField_xxx').setValue([
  { value: "0249654712697493", label: "叶秋", key: "0249654712697493" }
]);

// 设置（多个成员）
this.$('employeeField_xxx').setValue([
  { value: "工号1", label: "张三", key: "工号1" },
  { value: "工号2", label: "李四", key: "工号2" }
]);
```

**编辑模式下自动填充当前用户:**

```javascript
export function didMount() {
  var employs = [];
  if (this.utils.isEditMode() === true) {
    var employ = {
      label: window.loginUser.userName,
      value: window.loginUser.userId
    };
    employs.push(employ);
    this.$('employeeField_xxx').setValue(employs);
  }
}
```

**提取成员ID工具函数:**

```javascript
function getEmployeeId(employeeValue) {
  if (!employeeValue || !Array.isArray(employeeValue) || employeeValue.length === 0) return '';
  var first = employeeValue[0];
  return first.value || first.key || first.emplId || '';
}

function getEmployeeName(employeeValue) {
  if (!employeeValue || !Array.isArray(employeeValue) || employeeValue.length === 0) return '';
  var first = employeeValue[0];
  return first.label || first.name || '';
}
```

### 12. 部门 (DepartmentField)

```javascript
// getValue 返回: 对象数组
// [{text: {zh_CN: "云途数字技术", ...}, value: "-1"}]

var dept = this.$('departmentField_xxx').getValue();
var deptId = dept[0].value; // 部门ID

// 设置（格式一：带 text 对象）
this.$('departmentField_xxx').setValue([
  { value: "-1", text: { zh_CN: "云途数字技术" } }
]);

// 设置（格式二：简化格式）
this.$('departmentField_xxx').setValue([
  { value: "999969055", text: "财务部" }
]);
```

**⚠️ 跨表查询时提取部门ID:**

```javascript
// ❌ 错误：直接传入部门对象
searchConditions['department'] = department;

// ✅ 正确：提取 value 属性
var deptArr = this.$('departmentSelectField_xxx').getValue();
if (Array.isArray(deptArr) && deptArr.length > 0) {
  searchConditions['department'] = deptArr[0].value || deptArr[0];
}
```

### 13. 国家/地区 (RegionField)

```javascript
// getValue 返回: 对象数组
// [{text: {zh_CN: "中国香港特别行政区", ...}, value: "HK"}]
var region = this.$('regionField_xxx').getValue();
var regionCode = region[0].value; // 国家/地区代码
```

***

## 四、时间类字段

### 14. 日期 (DateField)

```javascript
// getValue 返回: 时间戳（毫秒）
var timestamp = this.$('dateField_xxx').getValue(); // 1774108800000

// 设置（时间戳或字符串均可）
this.$('dateField_xxx').setValue(1774108800000);
this.$('dateField_xxx').setValue("2026-03-20");
```

### 15. 日期区间 (DateRangeField)

```javascript
// getValue 返回: {start: timestamp, end: timestamp}
var range = this.$('dateRangeField_xxx').getValue();
var start = range.start;
var end = range.end;

// 设置
this.$('dateRangeField_xxx').setValue({
  start: 1772294400000,
  end: 1772899200000
});
```

***

## 五、文件类字段

### 16. 图片上传 (ImageField)

```javascript
// getValue 返回: 对象数组
// [{downloadURL: "...", imgURL: "...", name: "xxx.jpeg", fileUuid: "..."}]
var images = this.$('imageField_xxx').getValue();
```

### 17. 附件 (AttachmentField)

```javascript
// getValue 返回: 对象数组
// [{downloadURL: "...", name: "xxx.xlsx", fileUuid: "..."}]
var files = this.$('attachmentField_xxx').getValue();
```

***

## 六、特殊字段

### 18. 关联表单 (AssociationFormField)

```javascript
// getValue 返回: 对象数组
// [{appType: "APP_XXX", formUuid: "FORM-XXX", instanceId: "FINST-XXX", title: "标题"}]

var related = this.$('associationFormField_xxx').getValue();
var instanceId = related[0].instanceId; // 关联实例ID

// 设置（单个关联）
this.$('associationFormField_xxx').setValue([{
  appType: "APP_XXX",
  formType: "receipt",
  formUuid: "FORM-XXX",
  instanceId: "FINST-XXX",
  title: "标题",
  subTitle: "次要字段"
}]);

// 设置（多个关联）
this.$('associationFormField_xxx').setValue([
  {
    appType: 'APP_XOXRQ4842LVM51RRJC7N',
    formType: 'receipt',
    formUuid: 'FORM-DFYJ319VV0ILV3BW1C8HHBHHJPXI3X095L5IK1',
    instanceId: 'FINST-DFYJ319VD4IL2SMEZH8Q63MY7UR3302NRL5IK1',
    subTitle: 'BB',
    title: 'AA'
  },
  {
    appType: 'APP_XOXRQ4842LVM51RRJC7N',
    formType: 'receipt',
    formUuid: 'FORM-DFYJ319VV0ILV3BW1C8HHBHHJPXI3X095L5IK2',
    instanceId: 'FINST-DFYJ319VD4IL2SMEZH8Q63MY7UR3302NRL5IK2',
    subTitle: 'DD',
    title: 'CC'
  }
]);
```

**关联表单赋值参数说明:**

| 参数         | 必填 | 说明                                |
| ---------- | -- | --------------------------------- |
| appType    | 是  | 应用编码（如 APP\_XXX）                  |
| formType   | 是  | 表单类型：receipt（普通表单）或 process（流程表单） |
| formUuid   | 是  | 表单唯一 ID                           |
| instanceId | 是  | 关联的数据实例 ID                        |
| title      | 是  | 主要字段信息（显示标题）                      |
| subTitle   | 否  | 次要字段信息                            |

**⚠️ API返回的关联表单字段是JSON字符串，需要解析:**

```javascript
// API返回的 formData 中可能有两个版本:
// 版本1: associationFormField_xxx (可能为空)
// 版本2: associationFormField_xxx_id (JSON字符串，包含实际数据)

var value = formData['associationFormField_xxx'] || formData['associationFormField_xxx_id'];

// 如果是字符串，需要解析（可能是双重转义）
if (typeof value === 'string') {
  try {
    value = JSON.parse(value);
    if (typeof value === 'string') value = JSON.parse(value); // 双重转义
  } catch(e) { value = []; }
}
if (!Array.isArray(value)) value = value ? [value] : [];
```

### 19. 子表单 (TableField/SubTable)

```javascript
// getValue 返回: 对象数组，每个对象包含rowId和子表字段
// [{rowId: "xxx", textField_xxx: "值", numberField_xxx: 123, ...}]

var tableData = this.$('tableField_xxx').getValue();

// 遍历
for (var i = 0; i < tableData.length; i++) {
  var row = tableData[i];
  var fieldValue = row['textField_xxx'];
}

// 设置（覆盖整个子表）
this.$('tableField_xxx').setValue([
  { textField_xxx: "第一行", numberField_xxx: 100 },
  { textField_xxx: "第二行", numberField_xxx: 200 }
]);

// 子表最大行数: 500行
```

### 20. 地址 (AddressField)

```javascript
// getValue 返回: {address: "详细地址", regionIds: [...], regionText: [...]}
// 注意: regionText 是对象数组，每个对象包含 zh_CN 和 en_US 属性
// 格式: [
//   {zh_CN: "福建省", en_US: "fu jian sheng"},
//   {zh_CN: "龙岩市", en_US: "long yan shi"},
//   {zh_CN: "长汀县", en_US: "chang ting xian"},
//   {zh_CN: "庵杰乡", en_US: "an jie xiang"}
// ]
var addr = this.$('addressField_xxx').getValue();

// 正确提取省市区街道的方式
var province = addr.regionText[0] ? addr.regionText[0].zh_CN : '';  // 福建省
var city = addr.regionText[1] ? addr.regionText[1].zh_CN : '';      // 龙岩市
var district = addr.regionText[2] ? addr.regionText[2].zh_CN : '';  // 长汀县
var street = addr.regionText[3] ? addr.regionText[3].zh_CN : '';    // 庵杰乡
var detail = addr.address; // 详细地址
```

***

## 七、数据提取工具函数库

```javascript
/**
 * 宜搭组件数据提取工具函数库
 * 版本号: v1.0.0
 */

// ===== 成员字段 =====
function getEmployeeId(v) {
  if (!v || !Array.isArray(v) || !v.length) return '';
  return v[0].value || v[0].key || v[0].emplId || '';
}
function getEmployeeName(v) {
  if (!v || !Array.isArray(v) || !v.length) return '';
  return v[0].label || v[0].name || '';
}

// ===== 部门字段 =====
function getDepartmentId(v) {
  if (!v || !Array.isArray(v) || !v.length) return '';
  return v[0].value || '';
}
function getDepartmentName(v) {
  if (!v || !Array.isArray(v) || !v.length) return '';
  if (v[0].text && v[0].text.zh_CN) return v[0].text.zh_CN;
  return v[0].label || '';
}

// ===== 关联表单字段 =====
function getAssociationInstanceId(v) {
  if (!v || !Array.isArray(v) || !v.length) return '';
  return v[0].instanceId || '';
}

// ===== 日期字段 =====
function formatDate(timestamp, fmt) {
  if (!timestamp) return '';
  fmt = fmt || 'yyyy-MM-dd';
  var d = new Date(timestamp);
  return fmt
    .replace('yyyy', d.getFullYear())
    .replace('MM', ('0' + (d.getMonth() + 1)).slice(-2))
    .replace('dd', ('0' + d.getDate()).slice(-2));
}

// ===== 格式化API返回的关联表单/图片字段（JSON字符串→数组）=====
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

function formatImageField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch(e) { return []; }
  }
  return [];
}
```

***

## 八、常见问题

### Q1: 为什么成员/部门字段返回数组？

支持多选，即使单选也是数组格式 `[{...}]`。

### Q2: 日期字段为什么返回时间戳？

便于计算。用 `formatDate()` 工具函数转为显示格式。

### Q3: API返回的字段值与表单内 getValue() 不同？

API返回原始存储格式，`getValue()` 经过了前端格式化。关联表单、图片字段 API 返回 JSON 字符串，需手动解析。

### Q5: 跨表查询后填充子表，成员/部门字段为什么显示为空？

**这是跨表查询最常见的Bug！**

原因：API返回的成员/部门数据格式与 `setValue()` 需要的格式不一致。

```javascript
// ❌ 错误：直接赋值，成员字段显示为空
rowData['employeeField_xxx'] = formData['employeeField_xxx'];

// ✅ 正确：转换为 setValue 需要的格式
rowData['employeeField_xxx'] = [{
  value: '工号',
  label: '姓名',
  key: '工号'
}];
```

**解决方案：**
1. 使用 `formatEmployeeField()` / `formatDepartmentField()` 工具函数转换
2. 参考 `cross-form-query.md` 文档第6节"跨表查询结果填充子表时的字段格式问题"
3. 在检查清单中确认"成员/部门/关联表单字段是否使用了格式转换函数"

### Q4: 如何判断字段是否有值？

```javascript
// 基础字段（文本/数值）
if (value && value !== '') { /* 有值 */ }

// 数组字段（成员/部门/关联表单）
if (value && Array.isArray(value) && value.length > 0) { /* 有值 */ }

// 对象字段（日期区间/地址）
if (value && typeof value === 'object') { /* 有值 */ }
```

***

*文档版本: v1.0.0*
