# 宜搭组件数据结构参考

> 本文档汇总各宜搭表单组件在公式中可读取的数据结构。

详细函数和组件结构信息请参阅 [01-formula-complete-reference.md](./01-formula-complete-reference.md)。

## 常用组件公式值结构

| 组件类型 | 字段标识 | 公式中返回值类型 | 说明 |
| -------- | -------- | ---------------- | ---- |
| 单行文本 | textField | string | 直接返回文本内容 |
| 数值 | numberField | number | 返回数值，可参与数学运算 |
| 日期 | dateField | number | 返回时间戳（毫秒），需用日期函数处理 |
| 日期时间 | dateTimeField | number | 返回时间戳（毫秒） |
| 单选 | selectField | string | 返回选中项的 value |
| 多选 | multiselectField | string[] | 返回选中项 value 数组 |
| 人员 | employeeField | object | 含 userId、name、departName 等字段 |
| 部门 | departmentField | object | 含 departId、departName 等字段 |
| 关联表单 | associationFormField | string | 返回关联表单实例 ID |
| 子表 | tableField | object[] | 返回子表行数组，每行为字段对象 |
| 金额 | moneyField | number | 返回数值 |
| 评分 | rateField | number | 返回评分值 |
| 开关 | switchField | boolean | 返回 true/false |
| 地址 | addressField | object | 含 province、city、district、detail 等字段 |

## 人员字段结构详解

```
{
  userId: "xxx",        // 用户ID
  name: "张三",         // 姓名
  label: "张三",        // 显示名
  departName: "技术部",  // 部门名称
  departId: "xxx"       // 部门ID
}
```

## 部门字段结构详解

```
{
  departId: "xxx",      // 部门ID
  departName: "技术部",  // 部门名称
  label: "技术部"        // 显示名
}
```

## 子表字段结构详解

子表在公式中以数组形式返回，每行数据为一个对象：

```
[
  { "子表字段1": "值1", "子表字段2": "值2" },
  { "子表字段1": "值3", "子表字段2": "值4" }
]
```

常用子表聚合公式：
- `SUM(子表.数值字段)` — 求和
- `COUNT(子表)` — 计数
- `AVG(子表.数值字段)` — 平均值
