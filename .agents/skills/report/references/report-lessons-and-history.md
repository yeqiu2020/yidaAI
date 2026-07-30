# 报表历史教训复盘与版本历史

> 本文件由 SKILL.md 下沉而来，收录历次踩坑的全量复盘和版本更新日志。
> 正文见 [../SKILL.md](../SKILL.md)。

---

## 一、问题总结与正确方法（全量复盘）

### 1.1 历次踩过的坑与最终正确方法

| # | 问题描述 | 错误表现 | 根因 | 正确方法 |
|---|---------|---------|------|--------|
| 1 | 报表使用FORM_ cubeCode正常，vm_/VIEW_ cubeCode全部失败 | "数据查询异常，请检查报表配置" | 视图表在报表中必须使用`measureCode`而非`columnName` | 报表引擎Step 2.5自动查询measureMapping并转换 |
| 2 | 误判为报表不支持视图表 | 用FORM_替代vm_创建了报表 | 缺少对measureMapping机制的理解 | ❌ 此结论已推翻，报表完全支持视图表 |
| 3 | 手动操作UI可以修复报表 | "更改数据集→切换→切回→拖入字段"后生效 | UI拖入字段时自动使用measureCode | 引擎自动化此转换过程 |
| 4 | selectField等字段需要_value后缀 | 报表数据异常 | selectField/radioField等在FORM_格式中需要_value后缀 | normalizeFieldCode函数自动处理 |
| 5 | 两个入口文件未同步更新 | create-report.js调用的report-lib没有转换逻辑 | report-engine.js和report-lib/index.js是两个入口 | 两个文件都要同步修改 |
| 6 | 筛选器字段未转换为measureCode | 筛选器getDataAsync失败 "数据查询异常" | Step 2.5只检查filter.fieldCode，但筛选器配置用valueField.fieldCode | 修复为检查filter.fieldCode ‖ filter.valueField?.fieldCode ‖ filter.filterFieldCode |

### 1.2 视图表报表的完整正确流程

```
1. 使用dataset skill创建视图表 → 获得cubeCode（vm_格式）
2. 编写报表配置JSON → fieldCode使用原始columnName（如表单字段名）
3. 调用create-report.js创建报表
4. 引擎Step 2.5自动检测vm_/VIEW_前缀 → 查询measureMapping → 转换fieldCode
5. 创建空白报表 → 构建Schema（使用measureCode） → 保存
6. Playwright验证：打开报表页面，检查所有getDataAsync是否成功
```

⚠️ **关键点**：配置文件中写原始字段名即可，引擎自动转换。不要手动查measureCode填入配置。

---

## 二、版本历史

v1.9.0 (2026-07-10):
- 🔴 **新增4条硬规则(8-11)**：多表必须先创建数据集、创建前检查已有数据集、禁止重复创建同名报表配置、验证失败后禁止创建新版本
- 🔴 **新增第0步前置检查**：强制判断单表/多表→检查已有数据集→检查已有报表配置，防止重复创建
- ✅ **根因修复**：解决历史中创建6个报表+8个配置文件+6个视图表版本的重复堆积问题

v1.8.1 (2026-07-09):
- 🔴 **筛选器转换Bug修复**：Step 2.5中筛选器字段转换只检查`filter.fieldCode`，但筛选器配置实际使用`valueField.fieldCode`
- ✅ **修复方案**：改为检查`filter.fieldCode || filter.valueField?.fieldCode || filter.filterFieldCode`，同时转换valueField和labelField
- ✅ **验证结果**：V4报表 5/5 图表 + 2/2 筛选器 全部成功
