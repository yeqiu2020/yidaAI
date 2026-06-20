---
name: yida-data-tester
description: 当用户说"测试表单"、"宜搭测试"、"数据提交测试"、"公式验证"、"流程测试"、"验证校验规则"、"模拟数据"、"生成测试数据"、"批量插入数据"、"在XX表单中模拟生成XX条数据"、"在宜搭里创建测试数据"、"在表单中添加测试数据"时触发此skill。宜搭数据测试专家 - 用于自动化测试宜搭表单的数据提交、公式计算、校验规则、业务规则自动化和流程审批功能。当用户需要测试宜搭表单功能、验证公式计算结果、测试校验规则、测试业务规则自动化、流程审批，或在表单中模拟生成测试数据时，必须使用此技能。支持API和浏览器两种提交模式，可生成测试数据并输出详细测试报告。关键词：宜搭测试、表单测试、公式验证、流程测试、数据提交测试、模拟数据、生成数据、批量插入
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则
1. **禁止通过API修改已有应用的表单字段内容** — 公式、代码、字段增删改只能复制粘贴（规则25）
2. **应用ID和表单UUID必须填真实值** — 从系统配置清单.md读取，严禁占位符（规则24）
3. **写入文件前必须校验** — 运行 `node scripts/ai-validator.js check-before-write <文件路径>` 确认不覆盖已有文件
4. **写入文件后必须校验** — 运行 `node scripts/ai-validator.js check-after-write <文件路径>` 确认内容合规
5. **Cookie必须使用根目录** — 严禁 process.cwd()，必须用 PROJECT_ROOT（规则26）

### 专属硬规则
1. **自动过滤不可API提交的字段类型** — 如附件、图片等字段自动跳过
2. **模拟数据必须真实** — 使用真实地名、人名、业务场景，子表至少3行数据

---

# 宜搭数据测试专家

## 概述

本技能用于帮助用户自动化测试宜搭平台的各种功能，包括：
- 表单数据提交测试
- 公式计算结果验证
- 字段校验规则测试
- 业务规则自动化测试
- 流程审批流转测试

## 核心特性

1. **智能字段同步**
   - 自动同步表单Schema获取正确的字段ID
   - 解决创建表单后字段ID变化的问题
   - 自动转换日期格式为时间戳

2. **双模式提交引擎**
   - API模式：直接调用宜搭Web API，速度快，适合批量测试
   - 浏览器模式：模拟真实用户操作，适合测试前端交互和复杂场景

3. **智能数据生成**
   - 支持多种数据类型（文本、数字、日期、关联数据等）
   - 可配置数据规则和边界条件
   - 支持自定义数据模板
   - **模拟数据规范**：除平台限制无法写入的字段外，尽量每个字段都有数据；数据应看起来真实可信（如使用真实地名、人名、业务场景）
   - **子表单数据要求**：带有子表单的表单，子表至少需要3行数据

4. **多维度结果验证**
   - 验证数据是否正确保存
   - 验证公式计算结果
   - 验证校验规则触发情况
   - 追踪流程状态变化

5. **详细测试报告**
   - 生成JSON和Markdown格式的测试报告
   - 记录成功/失败详情和失败原因
   - 提供配置问题诊断建议

## 【AI执行指令】直接调用封装接口，禁止阅读源码

**【极其重要】本技能已提供完整的封装接口，AI执行时必须直接调用以下函数，禁止阅读内部源码实现，禁止创建临时脚本文件。**

### 场景1：为指定表单添加测试数据（最常用）

当用户说"往XX表单添加X条测试数据"时，**直接执行**：

```javascript
const { addTestDataToForms } = require('./scripts/batch-submitter.js');

const results = await addTestDataToForms(
  '项目目录路径',           // 如：'d:/宜搭AI编程/宜搭AI助手V1.6/资产评估管理系统'
  ['表单名称'],             // 如：['费用报销']
  {
    city: '南昌',           // 模拟城市，默认南昌
    industry: '资产评估',    // 行业上下文，默认资产评估
    count: 3                // 数据条数，默认3
  }
);

console.log(`成功: ${results.successForms}/${results.totalForms} 个表单`);
console.log(`数据: ${results.successRecords}/${results.totalRecords} 条成功`);
```

**参数说明**：
- `projectDir`：项目目录路径，必须指向包含"系统配置清单.md"的目录
- `formNames`：表单名称数组，如 `['费用报销']` 或 `['客户信息', '项目立项']`
- `options.city`：模拟数据的城市上下文（默认'南昌'）
- `options.industry`：行业上下文（默认'资产评估'）
- `options.count`：每个表单生成的数据条数（默认3）

### 场景2：为所有表单添加测试数据

当用户说"给所有表单添加测试数据"时，**直接执行**：

```javascript
const { addTestDataToAllForms } = require('./scripts/batch-submitter.js');

const results = await addTestDataToAllForms(
  '项目目录路径',
  {
    city: '南昌',
    industry: '资产评估',
    count: 3,
    exclude: ['考勤同步']  // 可选：排除特定表单
  }
);
```

### 场景3：单表单精细控制（高级）

当用户需要自定义数据内容时，才使用 `yida-submitter.js` 的 `submitBatch`：

```javascript
const { submitBatch } = require('./scripts/yida-submitter.js');

const results = await submitBatch({
  appId: 'APP_XXXXXXXXXXXXX',
  formUuid: 'FORM-XXXXXXXXXXXXXXXX',
  dataList: testData,      // 自定义数据数组
  syncSchema: true,
  schemaPath: './表单.json', // 本地Schema文件路径
  delay: 1000
});
```

**【禁止事项】**
- ❌ 禁止阅读 `yida-submitter.js`、`batch-submitter.js` 等内部源码
- ❌ 禁止创建临时 `.js` 文件来调用功能
- ❌ 禁止手动构造测试数据（让 `addTestDataToForms` 自动生成）
- ❌ 禁止逐个字段分析表单结构（让脚本自动处理）

**【正确做法】**
- ✅ 直接 `require('./scripts/batch-submitter.js')` 调用封装函数
- ✅ 传入项目目录和表单名称即可
- ✅ 让脚本自动发现表单、自动生成数据、自动提交

## 关键问题解决方案

### 问题1：字段ID不匹配
**现象**：提交成功但数据为空，或提示字段不存在
**原因**：创建表单后宜搭会重新分配字段ID
**解决**：使用 `syncSchema: true` 自动同步正确的字段ID

### 问题2：日期格式错误
**现象**：提示"日期组件值的格式错误, 必须为时间戳"
**解决**：使用 `yida-submitter.js` 自动转换日期字符串为时间戳

### 问题3：流水号不生成
**现象**：流水号字段显示"自动生成"但没有值
**原因**：流水号字段 behavior 不是 READONLY
**解决**：确保表单模板中 SerialNumberField 的 behavior 为 READONLY

### 问题4：API 404 错误
**现象**：提示 "No handler found for POST /form/saveFormData.json"
**原因**：API 路径缺少版本号 /v1/
**解决**：使用正确的路径 `/dingtalk/web/{appId}/v1/form/saveFormData.json`

### 问题5：关联表单字段导致提交失败
**现象**：提示 `syntax error, expect [, actual error, pos 0, fieldName null`
**原因**：宜搭API不支持直接提交关联表单（AssociationFormField）、关联表单属性（AssociationFormProperty）、表格（TableField）、图片（ImageField）、附件（AttachmentField）、下拉选择（SelectField）、部门选择（DepartmentSelectField）等复杂字段类型
**解决**：本skill已自动过滤这些字段类型，只提交基础字段（TextField、NumberField、DateField、TextareaField等）。如需填写关联表单、下拉选择、部门选择等字段，请在宜搭后台手动操作或使用浏览器模式提交。

## 模拟数据规范

### 基本原则
1. **字段覆盖**：除宜搭平台限制无法写入的字段（如关联表单、图片、附件）外，模拟数据应尽量让每个字段都有值
2. **数据真实性**：数据应看起来真实可信，避免无意义的随机字符串
   - 人名：使用真实的中文姓名（如"张伟"、"李娜"、"王强"）
   - 地名：使用真实的省市县区名称（如"江西省南昌市青山湖区"）
   - 地址：使用真实街道和门牌号格式（如"红谷滩区会展路999号"）
   - 金额：使用符合业务场景的数字（如报销金额在50-5000之间）
   - 日期：使用合理的业务日期（如项目周期内的日期）
   - 电话：使用符合格式的手机号（如"13800138000"）

### 子表单数据要求
1. **最少行数**：带有子表单的表单，子表至少需要 **3行** 数据
2. **数据多样性**：子表各行数据应有所差异，避免重复相同内容
3. **字段完整**：子表内的每个字段也应尽量填写完整

### 示例
```javascript
// 费用报销表单 - 主表+子表
{
  '报销人': '周勇',
  '报销日期': new Date('2025-05-20').getTime(),
  '报销类型': '差旅费',
  '报销总金额': 2850,
  '报销说明': '青山湖项目现场勘查差旅费',
  // 子表 - 至少3行
  '报销明细': [
    {
      '费用日期': new Date('2025-05-18').getTime(),
      '费用类型': '交通费',
      '费用说明': '南昌西站至项目地出租车',
      '金额': 120,
      '发票类型': '增值税普通发票',
      '发票号码': '12345678'
    },
    {
      '费用日期': new Date('2025-05-19').getTime(),
      '费用类型': '住宿费',
      '费用说明': '如家酒店住宿一晚',
      '金额': 280,
      '发票类型': '增值税专用发票',
      '发票号码': '12345679'
    },
    {
      '费用日期': new Date('2025-05-20').getTime(),
      '费用类型': '餐饮费',
      '费用说明': '项目团队工作餐',
      '金额': 150,
      '发票类型': '增值税普通发票',
      '发票号码': '12345680'
    }
  ]
}
```

## 依赖

- Node.js 16+
- 项目根目录存在 `.cookies.json`（首次使用需要登录）

---

## 角色定义

你是宜搭数据测试专家，专门负责自动化测试宜搭表单的数据提交、公式验证、校验规则和流程审批功能。你熟悉宜搭API接口和浏览器自动化方式，能够生成真实业务模拟数据并输出详细测试报告。

## 检查清单

### 执行前确认
- [ ] 确认登录态有效（Cookie未过期）
- [ ] 确认应用ID和表单UUID从系统配置清单.md读取真实值，严禁占位符
- [ ] 确认已选择提交模式（API模式 vs 浏览器模式）
- [ ] 确认模拟数据必须真实，禁止出现"测试数据"等明显假数据

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认子表数据至少3行
- [ ] 确认提交后增量数据与预期一致，无异常重复提交
- [ ] 确认已生成测试报告

---

## 版本
### v2.3.0 (2026-06-05)
- 修复：基础字段（TextField、NumberField）数据为空的问题
  - context-data-generator.js 新增 `generateDataByType` 函数，根据字段类型生成数据
  - 支持 RadioField、CheckboxField、SelectField、CascadeSelectField、AddressField、DateField、NumberField、TextareaField、TextField 等类型
  - yida-submitter.js 的 extractFieldMapping 现在提取 dataSource 信息（用于单选/多选字段）
  - NumberField 默认返回 1-1000 的随机数，确保数值字段一定有值
  - TextField 兜底逻辑增强，确保任何字段名都能生成有效数据
  - 修复兜底逻辑依赖行业数据可能为空的问题
- 新增：CLI 命令行工具 cli.js，支持直接命令行调用批量提交功能

### v2.2.1 (2026-05-17)
- 优化：数据生成器全面消除"测试数据"等明显假数据
  - data-generator.js 中关联表单、图片、附件字段默认值改为真实业务内容
  - context-data-generator.js 中备注/说明字段改为真实业务描述
  - 子表单费用说明改为真实场景描述（如"南昌西站至项目地出租车"）
  - 默认兜底文本改为业务状态词（如"待确认"、"已核实"）

### v2.2.0 (2026-05-15)
- 新增：提交前后对比数据增量，检测异常重复提交
  - batch-submitter.js 在提交前记录已有数据数量，提交后对比增量
  - 如果增量大于预期提交数量，输出异常警告
  - yida-submitter.js 新增 getExistingDataCount 和 getRequest 函数
  - 支持普通表单和流程表单的数据数量查询
  - 不再阻止正常的新增操作，只在增量异常时报警

### v2.1.2 (2026-05-11)
- 修复：SelectField、DepartmentSelectField 字段导致API提交失败的问题
  - extractFieldMapping 跳过 SelectField 和 DepartmentSelectField（无法通过API提交正确格式）
  - transformData 跳过 SelectField 和 DepartmentSelectField
- 修复：子表单中 AssociationFormField 列导致API提交失败的问题
  - transformData 在遍历子表行时跳过 SKIP_COMPONENT_TYPES 中的字段类型
- 修复：TextField 值类型不匹配的问题
  - transformData 自动将 TextField 的 number 类型值转为 string（如"发票金额"字段）

### v2.1.1 (2026-05-11)
- 修复：子表数据无法提交的问题
  - extractFieldMapping 现在正确提取子表内部列的 fieldId
  - transformData 支持将子表数据转换为宜搭API格式
  - generateFormData 自动生成3行子表数据
  - 子表列字段存储为 "子表字段名.列名" 格式

