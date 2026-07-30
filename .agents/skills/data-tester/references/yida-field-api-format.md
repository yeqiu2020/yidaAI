# 宜搭 API 字段提交格式参考

> 来源：宜搭官方 API 文档 https://dingtalk.apifox.cn/doc-3607712
> 更新日期：2026-07-15

## 概述

通过 `saveFormData.json` API 提交表单数据时，`formDataJson` 中各字段类型的值格式不同。本文档记录所有字段类型的正确提交格式，供 `submitter.js` 的 `transformData` 函数参考。

## 字段类型格式速查表

| 字段类型 | componentName | 值类型 | 提交格式 | 能否API提交 |
|---------|--------------|--------|---------|------------|
| 单行文本 | TextField | string | `"textField_xxx": "文本"` | ✅ |
| 多行文本 | TextareaField | string | `"textareaField_xxx": "多行文本"` | ✅ |
| 数值 | NumberField | number | `"numberField_xxx": 100` | ✅ |
| 日期 | DateField | number(时间戳) | `"dateField_xxx": 1650470400000` | ✅ |
| 日期时间 | DateField(showTime) | number(时间戳) | 同上 | ✅ |
| 日期区间 | CascadeDateField | array(时间戳) | `"cascadeDateField_xxx": [开始时间戳,结束时间戳]` | ✅ |
| 单选按钮 | RadioField | string | `"radioField_xxx": "选项一"` | ✅ |
| 复选 | CheckboxField | array(string) | `"checkboxField_xxx": ["选项一","选项二"]` | ✅ |
| 下拉单选 | SelectField | string | `"selectField_xxx": "选项一"` | ✅ |
| 下拉多选 | MultiSelectField | array(string) | `"multiSelectField_xxx": ["选项一","选项二"]` | ✅ |
| 评分 | RateField | number | `"rateField_xxx": 5` | ✅ |
| 成员 | EmployeeField | array(userId) | `"employeeField_xxx": ["userId1"]` | ✅ |
| 部门 | DepartmentSelectField | array(deptId) | `"departmentSelectField_xxx": ["部门ID"]` | ❌ 需部门ID |
| 地址 | AddressField | **JSON字符串** | 见下方详细说明 | ✅ |
| 子表单 | TableField | array(object) | `"tableField_xxx": [{"fieldId1":"值"},{"fieldId1":"值"}]` | ✅ |
| 级联选择 | CascadeSelectField | array(string) | `"cascadeSelectField_xxx": ["层级1","层级2"]` | ✅ |
| 国家/地区 | CountrySelectField | array(string) | `"countrySelectField_xxx": ["中国"]` | ✅ |
| 关联表单 | AssociationFormField | array(object) | 见下方详细说明 | ✅ v3.1.0起支持 |
| 关联属性 | AssociationFormProperty | - | 依赖关联表单自动填充 | ❌ 跳过 |
| 图片 | ImageField | JSON字符串 | 需先上传文件 | ❌ 无法API提交 |
| 附件 | AttachmentField | JSON字符串 | 需先上传文件 | ❌ 无法API提交 |
| 流水号 | SerialNumberField | - | 平台自动生成 | ❌ 跳过 |
| 电子签名 | DigitalSignatureField | string(URL) | 需签名图片URL | ❌ 跳过 |

## AddressField 详细格式

**重要**：AddressField 的值是 **JSON.stringify 后的字符串**，不是对象！

```javascript
// ✅ 正确：值是 JSON 字符串
"addressField_xxx": "{\"address\":\"中山大道100号\",\"regionIds\":[420000,420100,420106],\"regionText\":[{\"zh_CN\":\"湖北省\"},{\"zh_CN\":\"武汉市\"},{\"zh_CN\":\"武昌区\"}]}"

// ❌ 错误：值是对象
"addressField_xxx": { "address": "中山大道100号", ... }

// ❌ 错误：值是数组
"addressField_xxx": ["湖北省", "武汉市", "武昌区", "中山大道100号"]
```

### AddressField 对象结构

```json
{
  "address": "详细地址",
  "regionIds": [省份编码, 城市编码, 区县编码],
  "regionText": [
    { "zh_CN": "省份名称" },
    { "zh_CN": "城市名称" },
    { "zh_CN": "区县名称" }
  ]
}
```

### regionIds 编码说明

- 省份编码：6位数字，如 420000（湖北省）
- 城市编码：6位数字，如 420100（武汉市）
- 区县编码：6位数字，如 420106（武昌区）
- 编码必须与 regionText 中的省市区名称一一对应

## EmployeeField 详细格式

```javascript
// ✅ 正确：值是用户ID数组
"employeeField_xxx": ["0249654712697493"]

// ❌ 错误：值是用户名字符串
"employeeField_xxx": "叶秋"

// ❌ 错误：值是用户名数组
"employeeField_xxx": ["叶秋"]
```

userId 从 `.cookies.json` 的 `user_id` 字段获取。

## TableField（子表单）详细格式

```javascript
// 子表的值是数组，每个元素是一行数据（对象）
// 对象的 key 是子表列的 fieldId，value 是该列的值
"tableField_xxx": [
  { "textField_xxx": "第一行", "numberField_xxx": 100 },
  { "textField_xxx": "第二行", "numberField_xxx": 200 },
  { "textField_xxx": "第三行", "numberField_xxx": 300 }
]

// 子表列中的字段类型也需要与主表相同的格式转换
// 例如：子表中的 DateField 也需要转为时间戳，AddressField 也需要 JSON.stringify
```

## 常见错误与预防

| 错误现象 | 根因 | 预防措施 |
|---------|------|---------|
| 地址字段提交后为空 | 提交了对象/数组而非JSON字符串 | AddressField 必须用 JSON.stringify |
| 成员字段提交后为空 | 提交了姓名而非用户ID | EmployeeField 必须用 userId 数组 |
| 下拉字段提交后为空 | 被错误加入跳过列表 | SelectField 不应跳过，直接提交选项value |
| 日期字段提交失败 | 提交了字符串而非时间戳 | DateField 必须转为毫秒时间戳 |
| 子表内地址/成员字段为空 | 子表字段未做格式转换 | 子表列也需要调用 transformFieldValue |
| 关联表单字段提交后为空 | 被错误加入跳过列表 | AssociationFormField v3.1.0起支持，传入对象格式 `{instanceId, title}` |
| 关联字段页面显示ID而非标题 | title字段为空或被设为instanceId | 【v3.1.2】title必填，传入对象格式 `{instanceId, title}` |
| **关联字段title与跳转记录不一致** | **AI推断title而非查询真实值，instanceId和title张冠李戴** | **【v3.1.4】严禁推断title！必须用searchFormDatas.json查询完整数据，建立instanceId→title映射表，确保一一对应** |
| 被填充字段与关联记录数据不一致 | AI编造被填充字段值而非从关联记录formData获取 | 【v3.1.4】被填充字段必须从关联记录的formData中获取真实值 |
| **子表内关联字段提交失败或title错配** | **submitter.js未提取子表内关联字段的associationMeta，导致无法补全元数据** | **【v3.1.5】已修复extractFieldMapping函数，子表内关联字段现在也提取associationMeta；AI仍需对子表内关联字段走6步闭环流程** |

## AssociationFormField 详细格式（v3.1.4更新）

**关联表单字段可以通过API提交**，格式为对象数组，包含关联记录的元数据和instanceId。

```javascript
// ✅ 正确：完整对象数组格式（脚本自动生成）
"associationFormField_xxx": [{
  "appType": "APP_KOV7DBWN1VFB2J43BHJZ",    // 应用ID
  "formType": "receipt",                       // receipt=普通表单, process=流程表单
  "formUuid": "FORM-67FB8C50BBCD4F629C0A50F7662B0160IWKV",  // 目标表单UUID
  "instanceId": "FINST-JQ966Z917CH7PR30JKX31AQZOPJB3L3BKTLRM7I1",  // 关联记录的instanceId
  "title": "武汉沌口仓库"                       // 显示标题（必填！否则页面显示instanceId）
}]

// ✅ 正确（推荐·v3.1.2）：AI传入对象格式 {instanceId, title}，脚本自动补全元数据
// AI在数据中写：
"选择仓库": {
  "instanceId": "FINST-JQ966Z917CH7PR30JKX31AQZOPJB3L3BKTLRM7I1",
  "title": "武汉沌口仓库"  // 关联记录的显示标题
}
// submitter.js 的 transformFieldValue 自动从 associationMeta 补全为完整对象数组

// ⚠️ 警告（v3.1.2起不推荐）：AI只传instanceId字符串，脚本会补全但title将为instanceId
// AI在数据中写：
"选择仓库": "FINST-JQ966Z917CH7PR30JKX31AQZOPJB3L3BKTLRM7I1"
// 结果：页面显示 "FINST-JQ966Z917CH7PR30JKX31AQZOPJB3L3BKTLRM7I1" 而不是 "武汉沌口仓库"

// ❌ 错误：只传标题文本（缺少instanceId，无法建立关联）
"选择仓库": "武汉沌口仓库"

// ❌ 错误：传空
"选择仓库": ""  // 关联字段为空
```

**查询instanceId和title的方法**：
```javascript
// ✅ 正确：使用 searchFormDatas.json（带s）查询完整数据，同时获取instanceId和字段值
// GET /dingtalk/web/{appId}/v1/form/searchFormDatas.json?formUuid={formUuid}&pageSize=100&currentPage=1
// 返回: { data: [{ formInstId: "FINST-xxx", formData: { textField_xxx: "武汉光谷中心仓", ... } }, ...] }
// 从formData中提取title字段值，与formInstId一一对应

// ❌ 错误：searchFormDataIds.json 只返回ID列表，不包含字段值，无法获取title
```

**【强制·v3.1.4】title的获取方式**：
- **严禁推断title！** 必须通过 `searchFormDatas.json` API查询目标表单完整数据，从formData中提取真实title
- title应该是关联表单记录的"数据标题"字段值
- 例如：仓库信息的数据标题是"仓库名称"，产品信息的数据标题是"产品分类_产品名称"
- **instanceId和title必须一一对应**：每个instanceId对应的title必须是从该记录的formData中查询到的真实值
- 严禁AI自己编造名称作为title然后随意配一个instanceId，这会导致页面显示与实际跳转记录不一致

**注意事项**：
1. **【v3.1.2重要】title字段必填**，否则页面会显示instanceId而不是关联记录的标题
2. **【v3.1.4重要】title必须通过API查询真实值，严禁推断**，否则会导致title和instanceId指向不同记录
3. 关联属性（AssociationFormProperty）仍不可手动提交，由关联表单自动填充
4. API提交时数据填充规则不会自动触发，被填充字段需要AI手动填入值，且**必须从关联记录的formData中获取真实值**（不仅是名称，地址、分类、型号等所有被填充字段都要用真实值）
5. 多选关联（multiple: true）时，可以传入对象数组 `[{instanceId, title}, ...]`
6. **【v3.1.4重要】回查验证时**，关联字段在API返回中存储在 `associationFormField_xxx_id` 字段（带`_id`后缀），值是**双重JSON字符串**，需要 `JSON.parse` 两次才能解析为数组
7. **【v3.1.4重要】完整的关联表单字段生成流程**详见 SKILL.md 的"关联表单字段数据生成流程（v3.1.5更新）"6步闭环流程
8. **【v3.1.5重要】子表内关联字段同样适用6步闭环流程**：submitter.js已修复子表内关联字段`associationMeta`提取缺失问题（extractFieldMapping函数现在对子表内列字段也提取associationMeta），子表每一行的关联字段都必须独立走完6步闭环流程，传入对象格式 `{instanceId, title}`
