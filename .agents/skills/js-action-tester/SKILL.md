---
name: js-action-tester
description: 宜搭表单JS动作代码自动化测试工具。专门用于测试宜搭表单内的JS动作代码（表单动作、字段联动、条件显示等），支持自动创建测试表单、上传代码、绑定事件、执行测试并生成报告。
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **只操作专用测试表单** — 严禁在业务表单上执行测试
2. **测试完成后提供清理测试表单功能** — 测试产生的表单可自动清理

---

# 宜搭JS动作代码测试工具 (JS Action Tester)

版本：v1.0.77

专门用于测试宜搭表单内JS动作代码的自动化工具。

## 功能概述

本工具可以：
1. 通过 API 自动创建测试表单
2. 自动上传 JS 代码到表单
3. 自动绑定字段事件（onChange 等）
4. 自动执行测试并验证结果
5. 生成详细的测试报告

**新增功能：**
- 自动登录流程处理（点击"立即登录" → 选择组织 → 进入应用）
- 每步截图保存，便于调试
- 简化的字段事件绑定 API

## 使用场景

- 测试宜搭表单 JS 代码功能
- 验证字段联动、条件显示等逻辑
- 自动化回归测试
- 批量测试多个表单功能

## 前置要求

1. 已安装 Node.js (v16+)
2. 已安装 Playwright: `npm install -g playwright`
3. 已安装宜搭 API 客户端依赖
4. 宜搭账号已登录（Cookie 已保存）

## 快速开始

### 方式1: 使用命令行工具（推荐）

```bash
cd d:\宜搭AI编程\宜搭AI助手V1.4\.agents\skills\js-action-tester\scripts

node run-test.js --code="path/to/your/code.js" --appId="APP_XXX"
```

**参数说明：**
- `--code`: JS代码文件路径（必需）
- `--appId`: 宜搭应用ID（必需）
- `--appName`: 应用名称（可选，默认"AI自动化测试"）
- `--headless`: 无头模式（可选，默认false显示浏览器）
- `--fields`: 自定义字段配置JSON（可选）

**示例：**
```bash
# 测试条件显示图片组件
node run-test.js \
  --code="../../../03进销存管理/99其他/表单内代码「普通表单」/代码/条件显示图片组件.js" \
  --appId="APP_WX4JH4EOQFYB4WSNAD3H"
```

### 方式2: 使用 JavaScript API

```javascript
const { chromium } = require('playwright');
const { YidaAutoTester } = require('./scripts/test-runner');

async function main() {
  const tester = new YidaAutoTester({
    appId: 'APP_XXX',
    appName: '测试应用',
    headless: false,
    chromium: chromium
  });

  try {
    // 1. 创建测试表单
    const formUuid = await tester.createTestForm([
      { type: 'RadioField', label: '部门', options: ['财务部', '人事部'] },
      { type: 'TextField', label: '姓名' },
      { type: 'ImageField', label: '图片上传' }
    ]);

    // 2. 初始化浏览器
    await tester.initBrowser();

    // 3. 上传JS代码
    await tester.uploadCode('./test-code.js');

    // 4. 绑定字段事件（简化API）
    await tester.bindFieldEvent('部门', 'onChange', 'onDepartmentChange');

    // 5. 执行测试
    await tester.executeTest(formUuid);

    // 6. 生成报告
    const report = tester.generateReport();
    console.log(report);

  } finally {
    await tester.closeBrowser();
  }
}

main();
```

## 工作流程

```
1. 创建测试表单（API）
   ↓
2. 初始化浏览器
   ↓
3. 处理登录流程（自动）
   - 点击"立即登录"
   - 选择组织
   - 进入应用
   ↓
4. 上传 JS 代码
   ↓
5. 绑定字段事件
   ↓
6. 执行测试用例
   ↓
7. 生成测试报告
```

## 核心 API

### createTestForm(fields)

创建测试表单。

**参数：**
- `fields`: 字段定义数组

**示例：**
```javascript
const formUuid = await tester.createTestForm([
  { type: 'RadioField', label: '部门', options: ['财务部', '人事部'] },
  { type: 'TextField', label: '姓名' }
]);
```

### uploadCode(codeFilePath)

上传 JS 代码到表单。

**参数：**
- `codeFilePath`: 代码文件路径

### bindFieldEvent(fieldLabel, eventType, handlerName)

绑定字段事件（简化API）。

**参数：**
- `fieldLabel`: 字段标签（如"部门"）
- `eventType`: 事件类型（如 'onChange'）
- `handlerName`: 处理函数名（如 'onDepartmentChange'）

**示例：**
```javascript
await tester.bindFieldEvent('部门', 'onChange', 'onDepartmentChange');
```

### executeTest(formUuid)

执行测试用例。

**参数：**
- `formUuid`: 表单 UUID

### generateReport()

生成测试报告。

**返回：**
```javascript
{
  timestamp: '2026-03-22T12:10:27.295Z',
  formUuid: 'FORM-XXX',
  results: [...],
  summary: {
    total: 0,
    passed: 0,
    failed: 0
  }
}
```

## 字段类型支持

| 字段类型 | 说明 |
|---------|------|
| RadioField | 单选 |
| TextField | 单行文本 |
| TextareaField | 多行文本 |
| NumberField | 数值 |
| DateField | 日期 |
| SelectField | 下拉单选 |
| MultiSelectField | 下拉多选 |
| CheckboxField | 复选 |
| ImageField | 图片上传 |
| AttachmentField | 附件 |
| EmployeeField | 成员 |
| DepartmentSelectField | 部门 |
| TableField | 子表单 |
| AssociationFormField | 关联表单 |

## 登录流程说明

工具会自动处理钉钉登录流程：

1. **检测登录状态** - 检查是否需要登录
2. **点击"立即登录"** - 自动点击登录按钮
3. **选择组织** - 自动选择第一个组织
4. **进入应用** - 等待进入宜搭设计器

**截图保存：**
- 登录过程中会保存截图到当前目录：`login-step-1.png`, `login-step-2.png`...
- 用于调试和验证登录流程

## 最佳实践

### 1. 使用字段 ID 精确选择

工具会自动收集字段 ID，优先使用 ID 选择字段：
```javascript
// 推荐：使用字段标签
await tester.clickFormField('部门');

// 内部实现会使用保存的字段 ID 精确查找
```

### 2. 处理动态 ID

宜搭字段 ID 是动态生成的，工具会自动处理：
```javascript
// 工具会自动提取并保存 ID 映射
tester.state.fieldIdMap = {
  '部门': 'radioField_xxx',
  '姓名': 'textField_xxx'
};
```

### 3. 等待页面加载

关键操作后添加适当的等待：
```javascript
await tester.state.page.waitForTimeout(2000); // 等待 2 秒
```

### 4. 错误处理

使用 try-catch 包裹关键操作：
```javascript
try {
  await tester.clickFormField('部门');
} catch (e) {
  console.log('点击失败:', e.message);
  await tester.state.page.screenshot({ path: './debug.png' });
}
```

## 常见问题

### Q: 找不到字段怎么办？

A: 确保：
1. 字段标签名称正确（区分大小写）
2. JS 面板已关闭（工具会自动处理）
3. 表单已完全加载

### Q: 代码粘贴失败？

A: 工具使用剪贴板 API 进行真正的粘贴，不是逐行输入。如果失败会尝试 Monaco Editor API。

### Q: 如何调试？

A: 
1. 工具会自动截图保存到当前目录：`login-step-X.png`
2. 查看截图了解页面状态
3. 使用 `headless: false` 显示浏览器观察执行过程

### Q: 登录流程卡住？

A:
1. 检查截图 `login-step-X.png` 查看当前页面状态
2. 确保 Cookie 文件有效
3. 尝试手动登录一次，让工具保存新的 storage state

## 脚本文件

- `scripts/test-runner.js` - 测试执行引擎（v1.0.77）
- `scripts/login-handler.js` - 登录流程处理模块（v1.0.2）
- `scripts/run-test.js` - 命令行测试入口（v1.0.1）

## 参考文档

- `references/api-reference.md` - 宜搭 API 参考
- `references/element-selectors.md` - 元素选择器参考

---

## 角色定义

你是宜搭表单JS动作代码自动化测试专家，专门负责测试宜搭表单内的JS动作代码。你熟悉宜搭表单的事件绑定机制和Playwright自动化测试框架，能够自动创建测试表单、上传代码、绑定事件并执行测试。

## 检查清单

### 执行前确认
- [ ] 确认登录态有效（Cookie未过期）
- [ ] 确认已获取待测试的JS动作代码
- [ ] 确认已识别代码的事件类型（onChange/onSubmit等）

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认测试表单已创建在专用测试应用中，未影响线上应用
- [ ] 确认测试完成后已生成测试报告

---

## 版本历史

- v1.0.77 - 添加简化的 `bindFieldEvent` API，完善登录流程
- v1.0.76 - 重构登录流程，添加截图检查
- v1.0.0 - 初始版本，支持基础测试流程
