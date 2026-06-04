# 宜搭数据测试专家

**版本**: 1.0.0  
**创建时间**: 2026-03-13

一个用于自动化测试宜搭表单功能的技能，支持数据生成、双模式提交、结果验证和报告生成。

## 功能特性

- ✅ **智能数据生成** - 支持20+种宜搭字段类型
- ✅ **双模式提交** - API模式和浏览器模式
- ✅ **多维度验证** - 数据完整性、公式计算、校验规则、流程状态
- ✅ **详细报告** - JSON和Markdown格式报告
- ✅ **配置检测** - 自动诊断配置问题

## 快速开始

### 1. 安装依赖

```bash
npm install axios playwright
```

### 2. 配置测试

复制模板配置文件并修改：

```bash
cp templates/test-config-template.json my-test-config.json
cp templates/api-config-template.json my-api-config.json
```

### 3. 执行测试

```bash
# 生成测试数据
node scripts/data-generator.js my-test-config.json test-data.json

# API方式提交
node scripts/api-submitter.js my-api-config.json test-data.json submit-result.json

# 验证结果
node scripts/result-validator.js submit-result.json validation-config.json validation-result.json

# 生成报告
node scripts/report-generator.js submit-result.json validation-result.json my-test-config.json
```

## 使用示例

### 示例1：测试公式计算

```javascript
const DataGenerator = require('./scripts/data-generator');
const ApiSubmitter = require('./scripts/api-submitter');

// 配置
const config = {
  formUuid: 'FORM-XXXX-XXXX',
  fields: [
    { fieldId: 'qty', type: 'NumberField', generateRule: { min: 1, max: 100 } },
    { fieldId: 'price', type: 'MoneyField', generateRule: { min: 10, max: 1000 } }
  ],
  count: 10
};

// 生成数据
const generator = new DataGenerator();
const testData = generator.generate(config);

// 提交数据
const submitter = new ApiSubmitter({ appKey, appSecret });
const results = await submitter.submitBatch({ formUuid, dataList: testData });
```

### 示例2：测试校验规则（浏览器模式）

```javascript
const BrowserSubmitter = require('./scripts/browser-submitter');

const submitter = new BrowserSubmitter({ headless: false });
await submitter.init();
await submitter.login({ username, password });

const results = await submitter.submitBatch({
  formUrl: 'https://www.aliwork.com/yida/form/FORM-XXXX',
  dataList: testData
});

await submitter.close();
```

### 示例3：完整测试流程

```javascript
const { runCompleteTest } = require('./examples/complete-test-example');

await runCompleteTest();
```

## 目录结构

```
yida-data-tester/
├── SKILL.md                      # 技能主文档
├── README.md                     # 本文件
├── scripts/                      # 核心脚本
│   ├── data-generator.js         # 数据生成器
│   ├── api-submitter.js          # API提交引擎
│   ├── browser-submitter.js      # 浏览器提交引擎
│   ├── result-validator.js       # 结果验证器
│   └── report-generator.js       # 报告生成器
├── templates/                    # 配置模板
│   ├── test-config-template.json # 测试配置模板
│   ├── api-config-template.json  # API配置模板
│   ├── browser-config-template.json # 浏览器配置模板
│   └── validation-config-template.json # 验证配置模板
└── examples/                     # 使用示例
    └── complete-test-example.js  # 完整测试示例
```

## 支持的字段类型

| 字段类型 | 说明 | 生成规则 |
|---------|------|---------|
| TextField | 文本字段 | random, chinese, name, phone, email, idcard, increment |
| TextareaField | 多行文本 | lines |
| NumberField | 数字字段 | range, enum, boundary-min, boundary-max, negative |
| MoneyField | 金额字段 | range |
| DateField | 日期字段 | range, format |
| DateTimeField | 日期时间 | range |
| RadioField | 单选 | options |
| SelectField | 下拉选择 | options |
| MultiSelectField | 多选 | options, count |
| CascadeSelectField | 级联选择 | levels |
| AssociationFormField | 关联表单 | mockData |
| AddressField | 地址 | - |
| ImageField | 图片 | count |
| AttachmentField | 附件 | count, types |
| TableField | 子表单 | rowCount, columns |
| EmployeeField | 成员 | - |
| DepartmentField | 部门 | - |
| FormulaField | 公式字段 | validate, expectedFormula |

## 配置文件说明

### 测试配置 (test-config-template.json)

```json
{
  "testName": "测试名称",
  "formUuid": "表单UUID",
  "submitMode": "api",
  "testCount": 10,
  "fields": [
    {
      "fieldId": "字段ID",
      "fieldName": "字段名称",
      "type": "字段类型",
      "generateRule": { /* 生成规则 */ }
    }
  ],
  "validation": {
    "checkFormula": true,
    "checkValidation": false,
    "checkProcess": false
  }
}
```

### API配置 (api-config-template.json)

```json
{
  "appKey": "你的AppKey",
  "appSecret": "你的AppSecret",
  "formUuid": "表单UUID",
  "delay": 500,
  "stopOnError": false
}
```

### 浏览器配置 (browser-config-template.json)

```json
{
  "username": "登录账号",
  "password": "登录密码",
  "formUrl": "表单URL",
  "headless": false,
  "screenshotOnError": true
}
```

## 测试报告

生成的报告包括：

1. **JSON报告** - 完整的结构化数据
2. **Markdown报告** - 可读性强的详细报告
3. **摘要报告** - 快速概览

报告内容：
- 测试概览（时间、成功率等）
- 失败详情（错误信息、截图等）
- 验证结果（公式计算、数据完整性等）
- 问题分析和配置建议

## 常见问题

### Q: 如何获取宜搭API的AppKey和AppSecret？

A: 登录宜搭后台 -> 应用设置 -> API设置 -> 创建应用凭证

### Q: 浏览器模式需要安装什么？

A: 需要安装Playwright：`npm install playwright`，首次运行会自动下载浏览器

### Q: 如何测试公式计算？

A: 在字段配置中设置`validate: true`和`expectedFormula`，验证器会自动比对计算结果

### Q: 如何测试流程审批？

A: 设置`checkProcess: true`和`expectedProcessStatus`，验证器会轮询查询流程状态

## 版本历史

- v1.0.0 (2026-03-13): 初始版本，支持完整的测试流程

## 许可证

MIT
