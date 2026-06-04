> 作者：叶秋
> 联系方式：15270209736
> 来源：www.yidatrain.com

# 宜搭AI代码生成工作流

> 版本：v1.0.0  
> 创建日期：2026-02-17  
> 适用场景：宜搭表单代码、自定义页面代码、自动化脚本生成

---

## 一、工作流概述

### 1.1 设计理念

本工作流基于"AI与程序协作的工程实践"方法论，将**需求理解、逻辑设计**交给AI，将**代码规范检查、格式转换、验证校验**交给程序，实现高效、稳定、可迭代的宜搭代码生成。

### 1.2 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户输入层                                │
│              （业务需求、字段配置、功能描述）                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  [阶段1] 需求分析（AI + 程序）                                    │
│  ├─ AI：理解业务需求，识别关键字段和逻辑                         │
│  └─ 程序：提取结构化配置，验证字段ID格式                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  [阶段2] AI逻辑生成（AI主导）                                     │
│  ├─ 选择代码模板（子表处理/跨表查询/字段联动/数据校验）           │
│  ├─ 设计业务逻辑流程                                             │
│  └─ 生成函数列表和操作步骤                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  [阶段3] 代码组装（程序主导）                                     │
│  ├─ 组装文件头、配置区域、didMount函数                           │
│  ├─ 插入业务逻辑代码                                             │
│  └─ 添加操作步骤和注意事项注释                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  [阶段4] 验证校验（程序主导）                                     │
│  ├─ ES5语法检查（禁止ES6+语法）                                  │
│  ├─ 必需元素检查（didMount函数等）                               │
│  └─ 代码质量检查（行数、复杂度）                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  [阶段5] 输出生成（程序主导）                                     │
│  ├─ 生成完整代码文件                                             │
│  ├─ 生成说明文档（Markdown格式）                                 │
│  └─ 输出验证报告                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、工作流详细步骤

### 阶段1：需求分析

#### 输入
用户提供的业务需求描述，包括：
- 功能标题和描述
- 涉及的字段ID
- 业务逻辑说明
- 触发方式（按钮点击/字段变更/页面加载等）

#### AI职责
1. **理解业务需求**：分析用户描述，识别核心功能点
2. **识别字段类型**：判断字段是主表字段还是子表字段
3. **确定代码类型**：判断属于哪种场景（子表处理/跨表查询/字段联动/数据校验）

#### 程序职责
1. **结构化提取**：将AI识别的信息转换为结构化配置
2. **字段ID验证**：使用正则表达式验证字段ID格式
3. **配置补全**：补充默认值和必要配置项

#### 输出
```json
{
  "codeType": "subtableProcessing",
  "fields": {
    "mainFields": {...},
    "subtableFields": {...},
    "apiConfig": {...}
  },
  "businessLogic": {...},
  "metadata": {...}
}
```

---

### 阶段2：AI逻辑生成

#### AI职责
1. **选择代码模板**：根据代码类型选择合适的模板
2. **设计函数结构**：
   - 必须包含 `didMount()` 函数
   - 设计业务逻辑函数（如 `processData()`、`handleChange()`）
3. **编写业务逻辑**：
   - 使用占位符表示字段ID（如 `{SOURCE_TABLE}`）
   - 遵循ES5语法规范
   - 添加必要的错误处理

#### 程序职责
1. **模板管理**：提供代码模板框架
2. **配置整合**：将AI输出整合到配置对象中
3. **逻辑验证**：检查函数命名、参数等基础规范

#### 协作界面
**AI输出格式（使用占位符）：**
```javascript
// AI生成的业务逻辑模板
export function processData() {
  var tableData = this.$({SOURCE_TABLE}).getValue();
  var result = [];
  
  for (var i = 0; i < tableData.length; i++) {
    var row = tableData[i];
    // 处理逻辑...
    result.push(row);
  }
  
  this.$({TARGET_TABLE}).setValue(result);
}
```

---

### 阶段3：代码组装

#### 程序职责
1. **生成文件头**：包含标题、版本、创建时间、更新日志
2. **生成配置区域**：
   - 字段ID配置（FIELD_IDS）
   - API配置（API_CONFIG）
   - 常量定义（CONSTANTS）
3. **生成didMount函数**：生命周期函数，必须放在最前面
4. **替换占位符**：将 `{FIELD_NAME}` 替换为实际的字段ID
5. **插入业务逻辑**：将AI生成的业务逻辑代码插入到正确位置
6. **添加底部注释**：操作步骤和注意事项

#### 代码结构标准
```javascript
/**
 * 功能标题
 * 版本号: v1.0.0
 * 创建时间: 2026-02-17
 * 更新日志:
 *   v1.0.0 - 初始版本
 */

// ===== 配置参数定义 =====
var FIELD_IDS = {
  SOURCE_TABLE: 'tableField_xxx',
  TARGET_FIELD: 'textField_xxx'
};

var API_CONFIG = {
  APP_TYPE: 'APP_XXXXXXXX',
  FORM_UUID: 'FORM-XXXXXXXX'
};

/**
 * 页面加载完成后的初始化函数
 */
export function didMount() {
  console.log('功能已加载');
}

/**
 * 业务逻辑函数
 */
export function processData() {
  // AI生成的业务逻辑
}

/**
 * ===== 宜搭内操作步骤 =====
 * 1. ...
 * 2. ...
 * 
 * ===== 注意事项 =====
 * 1. ...
 * 2. ...
 * 
 * 代码版本号: v1.0.0
 */
```

---

### 阶段4：验证校验

#### 程序职责
1. **ES5语法检查**：
   - 禁止可选链操作符 `?.`
   - 禁止模板字符串（反引号）
   - 禁止const/let声明
   - 禁止箭头函数
   - 禁止解构赋值
   - 禁止展开运算符

2. **必需元素检查**：
   - 必须包含 `didMount` 函数
   - 必须包含文件头注释
   - 必须包含版本号

3. **代码质量检查**：
   - 代码行数不超过500行
   - 函数数量合理
   - 嵌套层级不超过5层

#### 验证结果
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "stats": {
    "lineCount": 120,
    "functionCount": 3
  }
}
```

---

### 阶段5：输出生成

#### 程序职责
1. **生成代码文件**：`.js` 格式的完整代码
2. **生成说明文档**：`.md` 格式的使用说明
3. **生成验证报告**：记录验证结果和警告信息

#### 输出文件结构
```
output/
├── yida_code.js          # 生成的代码文件
├── yida_code.md          # 使用说明文档
└── validation_report.json # 验证报告（可选）
```

---

## 三、核心程序组件

### 3.1 代码生成器（yida_code_generator.js）

**功能：**
- ES5语法验证
- ES6+到ES5的自动转换
- 代码格式化
- 完整代码生成

**主要方法：**
```javascript
// 创建生成器实例
var generator = new YidaCodeGenerator();

// 验证ES5语法
var result = generator.validateES5(code);

// 转换ES6+到ES5
var es5Code = generator.convertToES5(es6Code);

// 格式化代码
var formattedCode = generator.format(code);

// 生成完整代码
var result = generator.generateFromTemplate(aiTemplate);
```

### 3.2 工作流引擎（yida_workflow_engine.js）

**功能：**
- 执行完整工作流
- 需求分析
- AI逻辑生成
- 代码组装
- 验证校验

**主要方法：**
```javascript
// 创建工作流引擎实例
var engine = new YidaWorkflowEngine();

// 执行完整工作流
var result = engine.execute({
  title: '功能标题',
  description: '功能描述',
  fields: {...}
});
```

### 3.3 命令行工具（yida_cli.js）

**功能：**
- 命令行接口
- 配置文件读取
- 批量处理
- 代码验证和转换

**命令：**
```bash
# 生成代码
node yida_cli.js generate -c config.json -o ./output

# 验证代码
node yida_cli.js validate -f code.js

# 转换代码
node yida_cli.js convert -f es6code.js -o ./output

# 显示帮助
node yida_cli.js help

# 生成配置文件模板
node yida_cli.js init
```

---

## 四、配置文件规范

### 4.1 配置文件结构

```json
{
  "title": "子表数据汇总功能",
  "description": "将子表中的数量字段按区域分组汇总",
  "version": "v1.0.0",
  "fileName": "subtable_summary",
  "codeType": "subtableProcessing",
  
  "fields": {
    "SOURCE_TABLE": "tableField_source",
    "TARGET_TABLE": "tableField_target",
    "AREA_FIELD": "selectField_area",
    "AMOUNT_FIELD": "numberField_amount"
  },
  
  "appType": "APP_XXXXXXXX",
  "formUuid": "FORM-XXXXXXXX",
  
  "operations": ["分组", "求和"],
  "triggers": ["按钮点击"],
  
  "operationSteps": [
    "在宜搭设计器中打开目标表单页面",
    "将此代码复制到JS面板中",
    "配置按钮点击事件绑定处理函数"
  ],
  
  "notes": [
    "确保所有组件ID与实际表单中的ID一致",
    "代码使用ES5语法，不支持ES6+特性"
  ]
}
```

### 4.2 代码类型说明

| 代码类型 | 说明 | 适用场景 |
|---------|------|---------|
| subtableProcessing | 子表数据处理 | 子表数据汇总、分组统计、数据转换 |
| crossTableQuery | 跨表数据查询 | 跨应用数据查询、关联表单数据填充 |
| fieldLinkage | 字段联动 | 字段值变更触发其他字段更新 |
| dataValidation | 数据校验 | 表单提交前数据校验、字段规则验证 |
| automationScript | 自动化脚本 | 宜搭集成自动化流程脚本 |

---

## 五、使用流程

### 5.1 快速开始

**步骤1：生成配置文件模板**
```bash
cd 核心引擎
node yida_cli.js init
```

**步骤2：编辑配置文件**
打开生成的 `yida.config.template.json`，根据实际需求修改：
- 功能标题和描述
- 字段ID配置
- 操作步骤和注意事项

**步骤3：生成代码**
```bash
node yida_cli.js generate -c yida.config.json -o ./output
```

**步骤4：使用生成的代码**
1. 打开生成的 `.js` 文件
2. 复制代码到宜搭JS面板
3. 按照 `.md` 说明文档配置事件绑定

### 5.2 与AI协作流程

**方式1：AI直接生成配置**
1. 用户向AI描述需求
2. AI生成配置文件内容
3. 用户保存配置到JSON文件
4. 运行程序生成代码

**方式2：AI生成业务逻辑模板**
1. 用户向AI描述需求
2. 程序生成基础框架代码
3. AI在框架内编写业务逻辑（使用占位符）
4. 程序组装完整代码并验证

---

## 六、质量控制

### 6.1 代码规范检查清单

- [ ] 使用ES5语法（无ES6+特性）
- [ ] 包含 `didMount()` 函数
- [ ] 所有ID定义为变量
- [ ] 包含文件头注释
- [ ] 包含版本号
- [ ] 包含操作步骤说明
- [ ] 包含注意事项
- [ ] 有错误处理逻辑
- [ ] 有控制台日志输出

### 6.2 常见问题处理

| 问题 | 原因 | 解决方案 |
|-----|------|---------|
| ES6语法错误 | 使用了箭头函数、模板字符串等 | 程序自动转换或手动修改为ES5语法 |
| 字段ID错误 | ID格式不正确或不存在 | 检查字段ID格式，确保与实际表单一致 |
| didMount缺失 | 忘记添加生命周期函数 | 程序自动生成或手动添加 |
| 事件绑定失败 | 在代码中使用 `.on()` 绑定 | 改为在宜搭面板中配置事件 |
| 数据时序问题 | 关联数据回填与JS执行时序冲突 | 使用 `setTimeout` 延迟处理 |

---

## 七、扩展与迭代

### 7.1 添加新的代码模板

在 `yida_workflow_engine.js` 的 `CODE_TEMPLATES` 中添加：

```javascript
NEW_TEMPLATE_TYPE: {
  title: '新模板标题',
  requiredFields: ['field1', 'field2'],
  optionalFields: ['field3'],
  defaultFunctions: ['didMount', 'newFunction']
}
```

### 7.2 自定义验证规则

在 `yida_code_generator.js` 的 `ES5_RULES` 中添加：

```javascript
forbiddenPatterns: [
  // 现有规则...
  { pattern: /新规则/, name: '规则描述' }
]
```

### 7.3 集成到CI/CD

可以将代码验证步骤集成到持续集成流程中：

```yaml
# .github/workflows/validate.yml
name: Validate Yida Code
on: [push]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Validate ES5 Syntax
        run: node 核心引擎/yida_cli.js validate -f ./表单页面/代码.js
```

---

## 八、最佳实践

### 8.1 开发前准备

1. **确认字段ID**：在宜搭设计器中确认所有字段ID
2. **选择代码类型**：根据需求选择合适的代码模板
3. **准备配置**：提前准备好配置文件

### 8.2 开发过程

1. **分步开发**：先生成基础框架，再添加业务逻辑
2. **及时验证**：每次修改后都运行验证
3. **记录版本**：每次修改更新版本号和更新日志

### 8.3 测试上线

1. **测试环境**：先在测试环境验证功能
2. **边界测试**：测试空数据、大量数据等边界情况
3. **逐步上线**：先小范围试用，确认无误后全面上线

---

## 九、附录

### 9.1 字段ID命名规范

| 组件类型 | ID前缀 | 示例 |
|---------|-------|------|
| 单行文本 | textField_ | textField_name |
| 多行文本 | textareaField_ | textareaField_desc |
| 数值 | numberField_ | numberField_amount |
| 下拉选择 | selectField_ | selectField_status |
| 单选 | radioField_ | radioField_gender |
| 多选 | checkboxField_ | checkboxField_hobby |
| 日期 | dateField_ | dateField_birthday |
| 成员 | employeeField_ | employeeField_manager |
| 部门 | departmentField_ | departmentField_dept |
| 关联表单 | associationFormField_ | associationFormField_order |
| 子表单 | tableField_ | tableField_details |
| 图片 | imageField_ | imageField_photo |
| 附件 | attachmentField_ | attachmentField_file |
| 流水号 | serialNumberField_ | serialNumberField_no |

### 9.2 常用API速查

```javascript
// 获取/设置组件值
this.$('fieldId').getValue();
this.$('fieldId').setValue(value);

// 获取/设置组件属性
this.$('fieldId').get('propName');
this.$('fieldId').set('propName', value);

// 消息提示
this.utils.toast({ type: 'success', title: '标题', content: '内容' });

// 对话框
this.utils.dialog({ type: 'confirm', title: '标题', content: '内容' });

// 数据源调用
this.dataSourceMap.dataSourceName.load(params).then(function(res) { ... });

// 获取用户信息
this.utils.getLoginUserId();
this.utils.getLoginUserName();
```

### 9.3 文件目录结构

```
宜搭AI编程/
├── 核心引擎/
│   ├── yida_code_generator.js      # 代码生成器
│   ├── yida_workflow_engine.js     # 工作流引擎
│   └── yida_cli.js                 # 命令行工具
├── .trae/skills/yida_coder/
│   └── SKILL.md                    # AI技能定义
├── 表单页面/
│   ├── 通用场景案例/                # 通用代码案例
│   └── 项目场景案例/                # 项目特定案例
├── ★宜搭开发参考文档/               # 开发文档
├── AI编程提示词/                    # 提示词模板
└── 宜搭AI代码生成工作流.md          # 本文档
```

---

**文档版本**: v1.0.0  
**最后更新**: 2026-02-17  
**维护者**: AI Assistant
