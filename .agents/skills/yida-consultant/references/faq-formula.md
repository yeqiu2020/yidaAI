# 公式类高频问题

> 来源：formula-generator/references/02-common-errors.md、05-failure-cases.md、06-component-data-structures.md

---

## 日期比较类型不匹配

### 症状

公式 `IF(GT(NOW(), 计划完成时间), 1, 0)` 逻辑看起来正确，但比较结果不正确。

### 根因

`NOW()` 返回的是日期/时间对象，而"计划完成时间"字段存储的是时间戳（数字）。两者类型不匹配，`GT` 函数无法正确比较。

### 修复方案

将 `NOW()` 转为时间戳再比较：
```
IF(GT(TIMESTAMP(NOW()), 计划完成时间), 1, 0)
```

### 验证方式

调 data-tester 提交一条测试数据，看公式字段是否返回预期值。

### 参考来源

`.agents/skills/formula-generator/references/01-formula-complete-reference.md`（TIMESTAMP 函数）

---

## 日期字段未用 DATE() 转换

### 症状

`YEAR(出生日期)` 返回错误结果，或 `DAYS(结束日期, 开始日期)` 计算天数不正确。

### 根因

日期组件字段的值是**时间戳**（数字），不是日期对象。`YEAR()`、`MONTH()`、`DAYS()` 等函数需要日期对象参数。

### 修复方案

```
YEAR(DATE(出生日期))
DAYS(DATE(结束日期), DATE(开始日期))
```

注意：`NOW()` 和 `TODAY()` 返回的已经是日期对象，**不需要**再用 `DATE()` 包裹。

### 验证方式

调 data-tester 提交测试数据，验证日期计算结果。

### 参考来源

`.agents/skills/formula-generator/references/02-common-errors.md`（错误3-7）

---

## SUMPRODUCT 参数不足

### 症状

报错："函数 SUMPRODUCT 的必需参数个数为 2"

### 根因

宜搭的 SUMPRODUCT 函数必须至少 2 个参数，不能单独使用一个数组。

### 修复方案

```
// 方案1：使用 SUM 函数替代（推荐用于条件计数）
SUM(IF(EQ(子表.产品,"苹果"),1,0))

// 方案2：使用两个数组相乘
SUMPRODUCT(IF(EQ(子表.产品,"苹果"),1,0), 1)
```

### 验证方式

调 data-tester 提交含子表数据的测试数据，验证公式计算结果。

### 参考来源

`.agents/skills/formula-generator/references/02-common-errors.md`（错误1）

---

## 使用了不存在的函数或大小写错误

### 症状

报错："未找到与 XXX 匹配的公式函数"，或公式返回空值。

### 根因

1. 在表单场域使用 `MAPX`、`SUMPRODUCTX`（报表场域专用）
2. 使用 `SUBTRACT`、`DIVIDE`（宜搭无此函数，减法用 `-`，除法用 `/`）
3. 大小写错误：`GETARRAYITEM` 应为 `GetArrayItem`

### 修复方案

查阅 `.agents/skills/formula-generator/references/01-formula-complete-reference.md` 确认函数存在，严格按文档大小写使用。

### 验证方式

修正后保存公式，检查是否报错。

### 参考来源

`.agents/skills/formula-generator/references/02-common-errors.md`（错误2）

---

## 子表字段 ID 格式错误

### 症状

公式中引用子表字段时报错或返回空值。

### 根因

错误使用了 `tableField_xxx.textField_yyy` 格式。宜搭子表字段 ID 与普通字段 ID 格式完全相同，直接使用 `textField_yyy`，不需要子表前缀。

### 修复方案

直接使用字段本身的 ID：`textField_yyy`，不要使用 `子表ID.字段ID` 格式。

### 验证方式

检查公式中的字段 ID，确认无 `.` 前缀格式。

### 参考来源

`.agents/skills/formula-generator/references/02-common-errors.md`（错误10）
