# 表单类高频问题

> 来源：form_creator/references/faq.md、★宜搭开发参考文档/业务构建到表单/

---

## 字段类型选择错误导致数据提交失败

### 症状

表单提交时报错，或数据格式不符合预期。

### 根因

字段类型与实际数据不匹配。例如：需要数值计算却用了文本字段；需要多选却用了单选按钮。

### 修复方案

检查字段类型：
- 需要数值计算 → NumberField
- 需要多选 → CheckboxField 或 MultiSelectField
- 需要日期计算 → DateField（存储为时间戳）
- 需要人员选择 → EmployeeField（存储为 userId 数组）

### 验证方式

调 get-schema 同步最新 Schema，确认字段类型和 ID。

### 参考来源

`.agents/skills/form_creator/references/field-type-rules.md`

---

## 子表字段格式不正确

### 症状

子表数据提交报错，或子表数据显示异常。

### 根因

子表字段提交格式不正确。子表单字段值应为对象数组，每个对象包含子表内各字段的值。

### 修复方案

```json
"tableField_xxx": [
  {"fieldId1": "值1", "fieldId2": "值2"},
  {"fieldId1": "值3", "fieldId2": "值4"}
]
```

### 验证方式

调 config-sync 同步配置确认字段 ID，再用 data-tester 提交测试数据验证格式。

### 参考来源

`.agents/skills/data-tester/references/yida-field-api-format.md`（TableField 格式）

---

## 表单 UUID 或字段 ID 填写错误

### 症状

同步配置、提交数据或创建自动化时报错"表单不存在"或"字段不存在"。

### 根因

使用了错误的表单 UUID 或字段 ID，或使用了占位符（如 `FORM-XXX`、`textField_xxx`）。

### 修复方案

1. 调 config-sync 从宜搭平台同步最新配置
2. 从系统配置清单.md 读取真实的表单 UUID 和字段 ID
3. 严禁编造任何 ID

### 验证方式

调 config-sync 同步后对比配置清单，确认 ID 正确。

### 参考来源

`.agents/skills/form_creator/references/faq.md`
