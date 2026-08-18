# 数据类高频问题

> 来源：data-tester/references/yida-field-api-format.md

---

## 地址字段提交格式错误

### 症状

提交含地址字段的表单数据时报错，或地址数据显示异常。

### 根因

AddressField 的值是 **JSON.stringify 后的字符串**，不是对象也不是数组。

### 修复方案

```json
"addressField_xxx": "{\"address\":\"中山大道100号\",\"regionIds\":[420000,420100,420106],\"regionText\":[{\"zh_CN\":\"湖北省\"},{\"zh_CN\":\"武汉市\"},{\"zh_CN\":\"武昌区\"}]}"
```

注意：值是 JSON 字符串，不是 JSON 对象。

### 验证方式

调 config-sync 同步配置确认字段类型，再用 data-tester 提交测试数据验证格式。

### 参考来源

`.agents/skills/data-tester/references/yida-field-api-format.md`（AddressField 详细格式）

---

## 成员字段提交格式错误

### 症状

提交含成员字段的表单数据时报错，或成员字段显示异常。

### 根因

EmployeeField 的值是 userId 数组，不是用户名或对象。

### 修复方案

```json
"employeeField_xxx": ["0249654712697493"]
```

注意：值是 userId 字符串数组，不是用户名字符串。

### 验证方式

调 config-sync 同步配置确认字段类型，再用 data-tester 提交测试数据验证格式。

### 参考来源

`.agents/skills/data-tester/references/yida-field-api-format.md`（EmployeeField 详细格式）

---

## 关联表单字段提交格式错误

### 症状

提交含关联表单字段的表单数据时报错，或关联表单字段显示异常。

### 根因

AssociationFormField 的值是对象数组，不是字符串或 ID。

### 修复方案

```json
"associationFormField_xxx": [{
  "appType": "APP_XXX",
  "formType": "receipt",
  "formUuid": "FORM-XXX",
  "instanceId": "FINST-XXX",
  "title": "关联记录标题"
}]
```

### 验证方式

调 config-sync 同步配置确认字段类型，再用 data-tester 提交测试数据验证格式。

### 参考来源

`.agents/skills/data-tester/references/yida-field-api-format.md`（AssociationFormField 格式）

---

## 日期字段提交格式错误

### 症状

提交含日期字段的表单数据时报错，或日期显示不正确。

### 根因

DateField 的值是时间戳（数字，毫秒），不是日期字符串。

### 修复方案

```json
"dateField_xxx": 1650470400000
```

注意：值是毫秒级时间戳数字，不是 `"2022-04-21"` 之类的字符串。

### 验证方式

调 data-tester 提交测试数据，验证日期字段是否正确显示。

### 参考来源

`.agents/skills/data-tester/references/yida-field-api-format.md`（字段类型格式速查表）
