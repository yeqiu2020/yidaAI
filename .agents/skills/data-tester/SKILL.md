---
name: data-tester
description: 当用户说"测试表单"、"宜搭测试"、"数据提交测试"、"公式验证"、"流程测试"、"验证校验规则"、"模拟数据"、"生成测试数据"、"批量插入数据"、"在XX表单中模拟生成XX条数据"、"在宜搭里创建测试数据"、"在表单中添加测试数据"时触发此skill。宜搭数据测试专家 - 用于自动化测试宜搭表单的数据提交、公式计算、校验规则、业务规则自动化和流程审批功能。当用户需要测试宜搭表单功能、验证公式计算结果、测试校验规则、测试业务规则自动化、流程审批，或在表单中模拟生成测试数据时，必须使用此技能。支持API和浏览器两种提交模式，可生成测试数据并输出详细测试报告。关键词：宜搭测试、表单测试、公式验证、流程测试、数据提交测试、模拟数据、生成数据、批量插入
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **【强制·v3.5.0】数据必须由AI生成，多表单优先使用一键自动关联提交** — AI读取字段清单，理解业务场景和字段语义，为每个字段生成贴合业务的真实数据。禁止使用脚本内置数据池（`addTestDataToForms`/`addTestDataToAllForms`）生成数据，这些函数已废弃。数据提交入口优先级：**①多表单（含关联字段）→ `submitAllWithAutoAssociations`（一键自动关联提交，v3.5.0推荐）**；②多表单（无关联字段）→ `submitAllAIGeneratedData`；③单表单 → `submitAIGeneratedData`。严禁逐表单调用。
2. **【强制】所有字段必须生成数据** — 除非字段类型属于宜搭API限制确实无法提交的（见下方清单），否则每个字段都必须生成有效数据，严禁遗漏。提交后必须通过API回查验证字段是否成功写入，发现空字段必须修复后重新提交。
3. **自动过滤不可API提交的字段类型** — 仅以下类型允许跳过：AssociationFormProperty（关联属性，由关联表单自动填充）、ImageField（图片）、AttachmentField（附件）、DepartmentSelectField（部门选择，需部门ID）、DigitalSignatureField（电子签名）、SerialNumberField（流水号，平台自动生成）。**AssociationFormField（关联表单）v3.1.0起支持通过API提交**，v3.5.0起推荐使用 `submitAllWithAutoAssociations` 一键提交，关联字段直接传标题字符串即可，函数自动查找instanceId。其余所有字段类型必须生成数据。
9. **【强制·v3.7.1·极其重要】被填充字段（dataFillingRules）在API提交时不会自动填充，必须手动赋值** — **这是导致"库存信息表连实例标题都没有"的根本原因**。字段清单中标记为"只读"且在关联表单字段说明中有"填充：当前字段=源字段"的字段，属于被填充字段。在宜搭UI中，用户选择关联记录后前端会自动填充这些字段；但通过API提交时，dataFillingRules **不会触发**，这些字段必须手动提供值。否则提交后字段为空，导致实例标题缺失、数据显示不完整。
   - **判断方法**：字段清单中同时满足以下条件的是被填充字段：①字段状态为"只读"；②同一表单内有"关联表单"字段，其字段说明的"填充"规则中包含当前字段名
   - **示例**：库存信息表的"仓库名称"字段——字段状态为"只读"，且"关联仓库"字段的说明中有"填充：仓库名称=仓库名称"，所以"仓库名称"是被填充字段
   - ❌ **错误做法**：以为被填充字段标记为"只读"就可以跳过不赋值
   - ✅ **正确做法**：被填充字段虽然标记为"只读"，但在API提交时不会自动填充，**必须手动赋值**（值应与关联目标表单中对应记录的字段值一致）
   - ✅ **v3.7.1起**：`submitAllWithAutoAssociations` 内置了被填充字段自动填充逻辑（从目标记录抄写值），AI只需提供关联字段的标题字符串，函数自动完成填充。但如果自动填充失败（日志中 `derivedFillCount = 0`），AI必须手动为被填充字段赋值
10. **【强制·v3.7.2·极其重要】EmployeeField（成员组件）在API提交时不会自动填充，必须赋值** — **这是导致"创建人、负责人字段为空"的根本原因**。在宜搭UI中，"创建人"等成员字段会自动填充当前登录用户；但通过API提交时，这些字段**不会自动填充**，必须手动提供用户ID。与被填充字段(dataFillingRules)类似，这是一个"UI有自动行为、API没有"的典型陷阱。
   - **影响的字段**：创建人（只读成员）、负责人（普通/只读成员）、任何EmployeeField类型字段
   - ❌ **错误做法**：以为"创建人"标记为"只读"就会由平台自动填充；以为AI不需要为成员字段提供值
   - ✅ **正确做法**：EmployeeField字段必须提供有效的userId字符串，脚本会自动转为`[userId]`数组格式
   - ✅ **v3.7.2起**：`submitAllWithAutoAssociations` 内置了EmployeeField自动填充逻辑——扫描Schema中所有EmployeeField字段，为AI未提供值的字段自动填充当前登录用户ID。AI无需手动为成员字段赋值，但需确保提交前Cookie中有有效的userId
11. **【强制·v3.7.3·极其重要】DateField（日期组件）在API提交时不会自动填充，必须赋值** — **这是导致"创建时间等日期字段为空"的根本原因**。在宜搭UI中，"创建时间"等日期字段的默认值公式会触发；但通过API提交时，这些字段**不会自动填充**，必须手动提供时间戳。
   - **影响的字段**：创建时间（只读日期）、任何DateField类型字段
   - ❌ **错误做法**：以为"创建时间"标记为"只读"就会由平台自动填充当前时间
   - ✅ **v3.7.3起**：`submitAllWithAutoAssociations` 内置了DateField自动填充逻辑——扫描Schema中所有DateField字段，为AI未提供值的字段自动填充当前时间戳（`Date.now()`）。AI无需手动为日期字段赋值，但如果业务需要特定日期（如"需到货日期"），AI仍应提供具体值，不会被自动填充覆盖。
4. **模拟数据必须真实** — 使用真实地名、人名、业务场景，子表至少3行数据。公司名用"城市+核心词+行业词+后缀"（如"武汉华信电子科技有限公司"），产品名用真实市场产品（如"iPhone 15 Pro Max 256GB"），人名用常见中文名（如"张伟"）。
5. **字段格式必须符合宜搭API规范** — 各字段类型的提交格式参考 `references/yida-field-api-format.md`，严禁用错误格式提交导致字段为空
6. **【强制·v3.2.0】严禁创建临时脚本来查询/验证/解析数据** — AI必须使用skill提供的标准函数，不得自己写临时 `.js` 文件来造轮子。**这是导致本次任务耗时从5分钟增加到15分钟的根本原因**：AI遇到关联表单场景时，因为skill没有提供查询/验证函数，只能临时写脚本实现 `searchFormDatas`、`parseInstValue`、`loadLabelMap`、`buildRecordMap`、`verifyAssociationField` 等函数，每个函数都要调试CSRF Token、请求头、响应解析等问题，严重浪费时间。v3.2.0已将这些函数全部内置到 `submitter.js` 和 `batch-submitter.js`，AI直接require使用即可。
   - ❌ 禁止在 `temp-file/` 下创建 `submit-test-data.js`、`verify-data.js`、`diag-search.js` 等临时脚本
   - ❌ 禁止在脚本中自己实现 `searchFormDatas`、`parseInstValue`、`loadLabelMap`、`buildTitleMap`、`verifyAssociationField` 等函数
   - ✅ 必须从 `batch-submitter.js` 导入标准函数：`const { submitAIGeneratedData, searchFormDatas, buildTitleMap, loadLabelMap, parseInstValue, verifyAssociationField } = require('./scripts/batch-submitter.js');`
   - ✅ 如果发现skill缺少某个函数，**必须先扩展skill**（在 submitter.js 中新增函数并导出），而不是临时写脚本绕过
7. **【强制·v3.4.0新增】使用内置函数前必须先读其 JSDoc 注释** — **这是导致本次任务耗时15分钟（原本3-5分钟）的根本原因**：AI直接用 `buildTitleMap(records)` 后，按 `warehouseMap[title]` 查找instanceId，但函数返回的是 `{instanceId: title}`（正向映射），导致instanceId为undefined，触发宜搭API报错"syntax error, expect [, actual {"，然后花了10分钟排查。**正确做法**：调用任何不熟悉的内置函数前，必须先用 Grep/Read 查看其 JSDoc 注释中的 `@returns` 和 `@example`，确认返回值结构后再使用。
   - ❌ 禁止凭函数名猜测返回结构（`buildTitleMap` 不等于返回 title→instanceId）
   - ✅ 必须先 Read 函数源码或 JSDoc 注释，确认返回值方向
   - ✅ 对于"已知title查instanceId"场景，v3.4.0 已提供 `buildReverseTitleMap(records)` 直接返回反向映射，无需手动翻转
   - ✅ 对于"已知title查完整记录"场景，v3.4.0 已提供 `findRecordByTitle(records, title)` 直接返回记录对象（含formData）
8. **【强制·v3.3.1·最高优先级】流程表单严禁用 saveFormData 提交** — **这是导致"数据列表能看到、详情页打不开（一直转圈闪电符号）"的根本原因**。宜搭表单分两种类型：
   - **普通表单（receipt）**：用 `/v1/form/saveFormData.json` 提交 ✅
   - **流程表单（process）**：必须用 `/v1/process/startInstance.json` 发起流程实例 ✅
   - ❌ **绝对禁止**对流程表单调用 `saveFormData`——它只写入表单数据、不创建流程实例上下文（无 instanceStatus、无 processCode、无 actioners），产生的记录 formInstId 为 `FINST-xxx` 格式（正常流程实例为 UUID 格式），详情页因缺少流程上下文而永远加载不出来
   - ✅ `submitBatch` 已内置自动检测：通过导航列表 API 判定 `formType` 和 `processCode`，流程表单自动走 `startInstance`，普通表单走 `saveFormData`
   - ✅ 提交后自检：流程表单会抽查一条记录校验 `instanceStatus` 是否存在，缺失则告警
   - 🔴 **安全机制**：表单类型探测失败时**绝不降级为普通表单**（那正是本次事故的成因），而是直接抛错拒绝提交，强制显式传入 `formType`
   - 💡 **用户说"以前流程表单也成功过"的真相**：以前成功的是通过**浏览器模式**（模拟真实用户操作）或**手动在宜搭后台**提交的，那些路径会正确发起流程；而通过 API 的 `saveFormData` 路径从未对流程表单成功过

---

# 宜搭数据测试专家

当前版本：v3.7.3（完整更新日志见 [references/版本历史.md](references/版本历史.md)）

## 📚 参考文件索引（按需加载）

| 参考文件 | 何时加载 |
|---------|---------|
| [references/yida-field-api-format.md](references/yida-field-api-format.md) | 生成各字段类型的提交数据前，查宜搭API字段格式规范 |
| [references/版本历史.md](references/版本历史.md) | 需要了解历史版本变更、各次事故根因与修复细节时 |
| [references/已被取代-手动关联填充流程.md](references/已被取代-手动关联填充流程.md) | 仅历史参考：v3.5.0 前的手动关联填充旧流程（已被 `submitAllWithAutoAssociations` 取代） |

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

3. **智能数据生成（基于字段语义分析）**
   - 根据字段名智能推断数据类型和内容
   - 不再依赖预置的城市/行业模板
   - 支持多种数据类型（文本、数字、日期、关联数据等）
   - **模拟数据规范**：除宜搭API限制确实无法提交的字段类型外（仅关联表单、关联属性、图片、附件、部门选择、电子签名、流水号），**所有字段必须生成有效数据**，严禁遗漏。数据应真实可信（使用真实地名、人名、业务场景）。
   - **提交后回查**：提交完成后必须通过API查询最新数据，逐个字段检查是否成功写入。发现空字段必须排查原因并修复格式后重新提交。
   - **子表单数据要求**：带有子表单的表单，子表至少3行数据，子表内所有字段也必须生成数据

4. **多维度结果验证**
   - 验证数据是否正确保存
   - 验证公式计算结果
   - 验证校验规则触发情况
   - 追踪流程状态变化

5. **详细测试报告**
   - 生成JSON和Markdown格式的测试报告
   - 记录成功/失败详情和失败原因
   - 提供配置问题诊断建议

## 【AI执行指令】AI生成数据 + 脚本提交（核心流程）

**【极其重要·架构原则】数据由AI根据应用场景生成，脚本只负责提交到宜搭API。**

脚本内置的数据生成器（`context-data-generator.js`）仅作为兜底方案，它使用硬编码数据池随机拼凑，无法理解业务语义，生成的数据往往不真实（如"武汉曹桂英实业有限公司"这种用人名拼的公司名）。**AI理解业务场景，应当由AI来生成数据。**

### 核心流程

```
1. AI 读取字段清单 → 理解业务场景和字段语义
2. AI 为每个表单生成贴合业务的真实数据（JSON对象，key为字段中文名）
3. 调用 submitAIGeneratedData() 提交到宜搭
4. 检查提交结果，失败则修复后重试
```

> **【极其重要·强制】步骤 3 是必须完成的，绝不能只生成本地 JSON 文件就停下来！**
>
> 用户说"生成模拟数据"，意思是"在宜搭里看到这些数据"，而不是"在本地目录里看到几个 JSON 文件"。
> 如果只生成本地文件而不调用 `submitAIGeneratedData()` 提交，等于任务没有完成。
> **判断任务是否完成的唯一标准：数据是否已经出现在宜搭表单列表中。**

### 场景1：AI生成数据并提交（推荐·默认方式）

**当用户说"添加测试数据"、"生成模拟数据"时，AI应：**

1. **读取字段清单**，理解每个表单的字段结构
2. **根据业务场景生成真实数据**，key 为字段中文名（与字段清单中的字段名称一致）
3. **调用 `submitAIGeneratedData`** 提交数据

```javascript
const { submitAIGeneratedData } = require('./scripts/batch-submitter.js');

// AI为"产品信息"表单生成的数据（key为字段中文名）
const dataList = [
  {
    "产品名称": "iPhone 15 Pro Max 256GB",
    "产品分类": "手机",
    "规格型号": "A3108",
    "单位": "台",
    "参考采购价": 7999,
    "参考销售价": 9999,
    "库存上限": 200,
    "库存下限": 10,
    "备注": "旗舰机型，深空黑色",
    "状态": "启用"
  },
  // ... 更多数据
];

const result = await submitAIGeneratedData(
  'e:/周勇/宜搭AI助手V2.0.3/进销存',  // 项目目录
  '产品信息',                           // 表单名称
  dataList,                             // AI生成的数据
  { delay: 1000 }
);

console.log(`成功: ${result.successCount}/${result.totalCount}`);
```

**数据格式规范**：
- 主表字段：`{ "字段中文名": 值 }`
- 子表字段：`{ "子表名称": [{ "列字段名": 值 }, ...] }`
- 日期字段：传字符串 `"2026-07-15"` 或时间戳，脚本自动转换
- 地址字段：传对象 `{"address":"详细地址","regionIds":[420000,420100,420106],"regionText":[{"zh_CN":"湖北省"},{"zh_CN":"武汉市"},{"zh_CN":"武昌区"}]}`
- 成员字段：传用户ID字符串（从Cookie获取），脚本自动转数组
- 数值字段：传数字类型
- 下拉单选：传选项的显示文本

**⚠️ 跳过以下字段类型**（宜搭API不支持直接提交）：
- AssociationFormProperty（关联属性，由关联表单自动填充）
- ImageField（图片）、AttachmentField（附件）
- DepartmentSelectField（部门选择）、DigitalSignatureField（电子签名）
- SerialNumberField（流水号，平台自动生成）

**✅ 关联表单字段（AssociationFormField）v3.1.0起支持提交**：传入对象格式 `{instanceId, title}`（如`{"instanceId":"FINST-xxx","title":"武汉沌口仓库"}`），脚本自动补全关联元数据。**v3.1.2起推荐使用对象格式**，只传instanceId字符串会导致页面显示ID而不是标题。

### 场景2：一键自动关联提交（v3.5.0·推荐·默认方式）

**【v3.5.0重大优化】这是导致"20分钟变3分钟"的核心修复。**

**问题根因**：之前 AI 需要手动编排 4 步流程才能完成带关联字段的提交：
1. 提交基础表单 → 2. 查询 instanceId → 3. 填充关联字段 → 4. 提交依赖表单
每步都要写内联 Node.js 脚本 + 调试 PowerShell 引号问题，导致 20+ 分钟耗时。

**修复方案**：`submitAllWithAutoAssociations` 一键完成全流程。关联字段**直接传标题字符串**，函数自动查找 instanceId。

**当用户说"添加测试数据"、"生成模拟数据"且涉及多个表单（含关联字段）时，必须优先使用本函数。**

```javascript
const { submitAllWithAutoAssociations } = require('./scripts/batch-submitter.js');

// AI 只需生成这样的数据（关联字段传标题字符串即可，无需查 instanceId）
const formDataMap = {
  "仓库信息": [
    { "仓库名称": "武汉光谷电子仓", "仓库地址": {...}, "状态": "启用", ... },
    { "仓库名称": "武汉沌口电子仓", "仓库地址": {...}, "状态": "启用", ... },
  ],
  "产品信息": [
    { "产品名称": "iPhone 15 Pro Max 256GB", "产品分类": "手机", ... },
  ],
  "供应商信息": [...],
  "客户信息": [...],
  "库存信息": [
    // 关联字段直接传标题字符串，函数自动查找 instanceId！
    { "仓库名称": "武汉光谷电子仓", "产品名称": "iPhone 15 Pro Max 256GB", "库存数量": 500, ... },
  ],
  "采购订单": [
    {
      "供应商": "武汉鑫源电子有限公司",  // 关联字段传标题字符串
      "采购明细": [
        { "选择产品": "iPhone 15 Pro Max 256GB", "采购数量": 10, ... },  // 子表内关联字段也支持
      ]
    },
  ],
  "销售订单": [
    {
      "客户名称": "武汉华信电子科技有限公司",  // 关联字段传标题字符串
      "销售明细": [
        { "选择产品": "iPhone 15 Pro Max 256GB", "销售数量": 5, ... },
      ]
    },
  ],
};

// 按依赖顺序排列（被关联的表单在前）
const formOrder = ['仓库信息', '产品信息', '客户信息', '供应商信息', '库存信息', '采购订单', '销售订单'];

// 一键调用，函数自动：提交基础表单 → 查询 instanceId → 填充关联字段 → 提交依赖表单
const result = await submitAllWithAutoAssociations(projectDir, formDataMap, formOrder);
console.log(`总耗时: ${result.elapsedSeconds}s`);
console.log(`成功: ${result.successRecords}/${result.totalRecords} 条数据`);
console.log(`关联字段自动填充: ${result.autoFilledFields.length} 个`);
```

**关联字段值格式**：
- ✅ 传标题字符串：`"武汉光谷电子仓"` → 函数自动查找 instanceId 并转为 `{instanceId, title}` 格式
- ✅ 传完整对象：`{instanceId: "FINST-xxx", title: "武汉光谷电子仓"}` → 函数直接使用
- ❌ 传 instanceId 字符串：`"FINST-xxx"` → 会导致页面显示 ID 而非标题

**自动检测关联关系**：函数从 Schema 中自动检测 AssociationFormField 及其目标表单 UUID，无需手动指定。如果自动检测失败，可手动传入第 4 个参数 `associationConfig`。

**函数完整签名**：
```javascript
await submitAllWithAutoAssociations(
  projectDir,          // 项目目录
  formDataMap,         // 所有表单数据（关联字段传标题字符串）
  formOrder,           // 提交顺序（依赖项在前）
  associationConfig,   // 可选，手动指定关联映射（通常不需要，自动检测即可）
  options              // 可选，{ delay: 500, skipCountCheck: false, indexWaitMs: 2000, indexMaxRetries: 5, allowPartialFill: false }
);
```

**【强制·v3.6.0】防翻车三原则（2026-07-24 混元三 40 分钟事故教训）：**

1. ✅ **唯一推荐姿势 = 上面这一次调用**。formDataMap 里关联字段直接写标题字符串，formOrder 按依赖顺序，其余全部交给函数（提交基础表单 → 等待搜索索引 → 轮询重试查询 → 填充关联 → 提交依赖表单）。
2. ❌ **严禁自行预解析标题**：不要自己先 `searchFormDatas` 查标题/instanceId 再填值。基础数据刚提交时宜搭搜索索引有数秒延迟，此时查询会返回空，AI 若把查不到的结果（`undefined`/空值）填进关联字段，函数会跳过填充并产生"显示成功但关联为空"的假数据。v3.6.0 起函数内部已内置索引等待与重试，预解析只会把时间窗口提前到索引尚未更新的时刻，有害无利。
3. 🔧 **数据异常时的标准修复流程 = 清空 → 重跑**。使用 `clearFormData(appId, formUuid, formType)` 清空问题表单后重跑场景2的调用，**严禁手写删除脚本**。⚠️ 删除 API 与创建 API 的 CSRF 要求不同：创建不需要 `_csrf_token`、删除必须携带，否则返回 `csrf校验失败` 静默失败（"假删除"产生重复数据）。`clearFormData` 已内置 CSRF、逐条校验结果、普通/流程自动分流。

```javascript
// 标准修复流程示例
const { clearFormData } = require('./scripts/batch-submitter.js');
const r = await clearFormData(appId, formUuid, '普通表单'); // 或 '流程表单'
console.log(`清空: ${r.deleted}/${r.total} 成功, ${r.failed} 失败`);
// 然后重跑 submitAllWithAutoAssociations(projectDir, formDataMap, formOrder)
```

**v3.6.0 起函数的 fail-fast 保护**：基础表单提交失败、索引重试超时、或任一关联字段匹配不到目标记录时，函数会**直接抛错中止**并列出明细，绝不再提交"空关联"的假成功数据。如确需容忍部分缺失，显式传 `options.allowPartialFill = true`。

### 场景2b：批量提交（无关联字段的简单场景）

当需要为多个表单添加数据且**没有关联字段**时，可使用 `submitAllAIGeneratedData`。

**【强制·v3.3.0】多表单必须一次性提交 — 严禁逐表单调用**：
- ❌ **严禁**：AI逐个表单调用 `submitAIGeneratedData` → 5次 RunCommand × (终端启动3s + 脚本7s) = 50s+，加上AI思考等待 = 20分钟
- ✅ **必须**：AI一次性生成所有表单数据，调用 `submitAllAIGeneratedData` → 1次 RunCommand，脚本内部循环 = ~25s

**【强制·v3.1.3】表单依赖分析与顺序生成流程**：

1. **分析关联依赖**：读取字段清单，找出所有"关联表单"字段，建立表单间的依赖关系图
   - 例如：库存信息 → 关联 → 仓库信息、产品信息
   - 例如：采购订单 → 关联 → 供应商信息
   - 例如：库存盘点 → 关联 → 仓库信息、产品信息（子表）
2. **拓扑排序**：被关联的表单（依赖项）排在前面，有关联字段的表单（被依赖项）排在后面
   - 正确顺序示例：产品信息 → 仓库信息 → 库存信息（库存信息依赖前两者）
   - 错误顺序示例：库存信息 → 产品信息 → 仓库信息（库存信息无法关联尚未生成的数据）
3. **AI一次性生成所有表单数据**，按依赖顺序排列，调用 `submitAllAIGeneratedData` 一次性提交

```javascript
const { submitAllAIGeneratedData, searchFormDatas, buildTitleMap } = require('./scripts/batch-submitter.js');

// ✅ v3.3.0正确做法：一次性生成所有表单数据，一次调用提交
const formDataMap = {
  "产品信息": [
    { "产品名称": "iPhone 15 Pro Max 256GB", "产品分类": "手机", ... },
    { "产品名称": "华为 Mate 60 Pro 512GB", "产品分类": "手机", ... },
    { "产品名称": "联想 ThinkPad X1 Carbon", "产品分类": "电脑", ... },
  ],
  "仓库信息": [
    { "仓库名称": "武汉光谷中心仓", "仓库地址": {...}, ... },
    { "仓库名称": "武汉沌口分仓", "仓库地址": {...}, ... },
    { "仓库名称": "武汉江汉配送仓", "仓库地址": {...}, ... },
  ],
  "客户信息": [...],
  "供应商信息": [...],
};

// 按依赖顺序排列：被关联的表单在前
const formOrder = ['产品信息', '仓库信息', '客户信息', '供应商信息'];

const result = await submitAllAIGeneratedData(
  projectDir,     // 项目目录
  formDataMap,    // 所有表单的数据
  formOrder,      // 提交顺序（依赖项在前）
  { delay: 500 }  // delay从1000降到500
);

console.log(`总耗时: ${result.elapsedSeconds}s`);
console.log(`成功: ${result.successForms}/${result.totalForms} 表单, ${result.successRecords}/${result.totalRecords} 条数据`);
```

**⚠️ 涉及关联字段时不要用本场景**：手动"查询→建映射→填instanceId"的旧流程**已被取代**（v3.5.0起改用场景2的 `submitAllWithAutoAssociations`，且v3.6.0起**严禁自行预解析标题**）。旧流程仅作历史参考：[references/已被取代-手动关联填充流程.md](references/已被取代-手动关联填充流程.md)

**【禁止事项】**
- ❌ 禁止创建临时 `.js` 文件来调用功能
- ❌ **【v3.2.0强化】禁止创建临时脚本实现 `searchFormDatas`、`parseInstValue`、`loadLabelMap`、`buildTitleMap`、`verifyAssociationField` 等函数** — 这些函数已内置在 `submitter.js` 和 `batch-submitter.js`，直接require使用
- ❌ 禁止在数据中出现"测试数据"、"test"等明显假数据
- ❌ 禁止用硬编码人名拼凑公司名称（如"武汉曹桂英实业有限公司"）
- ❌ 禁止使用 `addTestDataToForms`/`addTestDataToAllForms`（已废弃，数据质量低）
- ❌ 禁止跳过AI数据生成步骤，直接让脚本用硬编码数据池生成
- ❌ **【v3.2.0】禁止在临时脚本中自己处理CSRF Token、请求头、响应解析** — `getRequest` 函数已自动添加CSRF Token，`searchFormDatas` 已自动解析instValue为formData

**【正确做法】**
- ✅ AI根据应用场景和字段语义生成真实合理的业务数据
- ✅ 公司名使用真实命名方式：城市+核心词+行业词+后缀（如"武汉华信电子科技有限公司"）
- ✅ 产品名使用真实市场产品（如"iPhone 15 Pro Max 256GB"、"华为 Mate 60 Pro"）
- ✅ 人名使用常见中文名（如"张伟"、"李芳"）
- ✅ 地址使用真实行政区划（如"湖北省武汉市武昌区"）
- ✅ 调用 `submitAIGeneratedData` 提交，脚本自动处理字段ID映射和格式转换
- ✅ **【v3.2.0】使用标准函数处理关联表单场景**：`searchFormDatas`查询数据、`buildTitleMap`建立映射、`loadLabelMap`加载Schema、`verifyAssociationField`验证关联字段

## 关键问题解决方案

### 问题1：字段ID不匹配
**现象**：提交成功但数据为空，或提示字段不存在
**原因**：创建表单后宜搭会重新分配字段ID
**解决**：使用 `syncSchema: true` 自动同步正确的字段ID

### 问题2：日期格式错误
**现象**：提示"日期组件值的格式错误, 必须为时间戳"
**解决**：使用 `submitter.js` 自动转换日期字符串为时间戳

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
**原因**：关联字段的instanceId为空/undefined（如按错误方向使用 `buildTitleMap` 查找），或提交了宜搭API不支持的字段类型（AssociationFormProperty关联属性、ImageField图片、AttachmentField附件、DepartmentSelectField部门选择、DigitalSignatureField电子签名）
**解决**：本skill已自动过滤上述无法通过API提交的字段类型。**AssociationFormField（关联表单）v3.1.0起已支持API提交**（旧版"关联表单无法API提交"的说法已被取代），v3.5.0起用 `submitAllWithAutoAssociations` 传标题字符串即可。SelectField（下拉单选）v2.5.0起支持正常提交。EmployeeField（成员）使用当前登录用户ID填充。部门选择等仍不支持的字段请在宜搭后台手动操作或使用浏览器模式提交。

### 问题6：流程表单数据"列表能看到、详情页打不开"（v3.3.1修复）
**现象**：提交流程表单数据后，数据列表中能看到记录（有标题），但点击打开详情页一直转圈（闪电符号加载中），永远打不开
**根因**：流程表单误用了 `saveFormData`（普通表单API）提交。`saveFormData` 只写入表单数据，不创建流程实例上下文（无 instanceStatus、无 processCode、无 actioners），产生的记录 formInstId 为 `FINST-xxx` 格式（正常流程实例为 UUID 格式如 `647e2188-...`）。详情页需要流程上下文才能渲染，缺少上下文就会卡死
**判断方法**：
1. 用流程API查询记录详情：`/v1/process/getInstanceById.json?processInstanceId=<instId>`
2. 如果 `instanceStatus` 为空/undefined → 确认是坏数据（saveFormData 误用）
3. 如果 `instanceStatus` 有值（如 RUNNING/COMPLETED）→ 正常数据
**解决**：
- v3.3.1 起 `submitBatch` 已内置自动检测表单类型，流程表单自动走 `startInstance`
- 已有的坏数据需要删除（用 `deleteFormData` 删除 `FINST-xxx` 记录），然后用修复后的 skill 重新提交
- **注意**：`deleteFormData` 可删除 `FINST-xxx` 坏记录；UUID 格式的正常流程实例用 `deleteInstance` 删除
**预防**：表单类型探测失败时脚本会直接报错拒绝提交，绝不降级为 `saveFormData`

## AI数据生成指南（v3.0.0）

### 数据生成原则
1. **【强制·最高优先级】所有字段必须生成数据**：读取字段清单后，必须为每一个字段生成数据，一个都不能少。包括但不限于：
   - 业务字段（产品名称、客户名称等）
   - **系统字段（创建人、创建时间等）**——这些是最容易被遗漏的，必须特别注意
   - 只读字段（被填充字段等）——也需要手动填入值，因为API提交时数据填充规则不会自动触发
   - 成员字段、日期字段、地址字段等所有非跳过类型的字段
   - **唯一允许跳过的字段类型**：AssociationFormProperty（关联属性）、ImageField（图片）、AttachmentField（附件）、DepartmentSelectField（部门选择）、DigitalSignatureField（电子签名）、SerialNumberField（流水号）。其余所有字段（包括创建人、创建时间等系统字段）**必须**生成数据，没有例外。
2. **AI是数据生成器**：AI读取字段清单，理解业务场景，为每个字段生成贴合业务的真实数据
3. **脚本只负责提交**：`submitAIGeneratedData` 接收AI生成的数据，自动处理字段ID映射和格式转换
4. **数据必须真实**：
   - 公司名：城市+核心词+行业词+后缀（如"武汉华信电子科技有限公司"）
   - 产品名：真实市场产品（如"iPhone 15 Pro Max 256GB"）
   - 人名：常见中文名（如"张伟"、"李芳"）
   - 地址：真实行政区划（如"湖北省武汉市武昌区光谷大道1号"）
   - 金额/数量：符合业务逻辑的合理数值
   - 创建人：从Cookie获取当前登录用户的userId，传入字符串格式
   - 创建时间：传 `"YYYY-MM-DD HH:mm:ss"` 格式的字符串，脚本自动转时间戳
   - **【v3.1.5重要】关于默认值公式**：form_creator v6.54.0起创建表单时会自动为"创建人"字段设置 `USER()` 公式、为"创建时间"字段设置 `TIMESTAMP(TODAY())` 公式。但**通过API提交时默认值公式不会自动触发**，所以AI仍需为这两个字段生成数据。
   - **【v3.7.3简化】DateField 自动填充**：`submitAllWithAutoAssociations` 现支持自动为缺失的 DateField 字段填充当前时间戳。AI 无需再手动为"创建时间"等字段赋值，但如果业务需要特定日期（如"需到货日期"、"交货日期"），AI仍应提供具体值，不会被自动填充覆盖。
5. **子表单数据要求**：子表至少3行数据，各行数据有差异，子表内所有字段也必须生成数据

### AI生成数据的流程
1. 读取项目的字段清单.md，理解所有表单和字段
2. 结合用户提供的场景信息（城市、行业、场景）
3. 为每个表单逐个生成数据（JSON对象，key为字段中文名）
4. **【强制】字段完整性检查**：生成完数据后，必须对照字段清单逐一核对，确保所有字段都有数据。发现遗漏立即补上。
   - **【v3.7.3简化】DateField和EmployeeField已在提交时自动填充**，AI无需再为"创建时间"、"创建人"等字段生成数据，但其他业务字段（产品名称、库存数量等）仍需手动生成。
5. 跳过宜搭API不支持的字段类型（关联属性、图片、附件、部门、电子签名、流水号）——仅此6种可跳过，其余全部生成
6. **【强制·v3.1.4】关联表单字段必须填写**：AI需要先查询目标表单的完整数据（含formData），建立instanceId→title映射表，然后从映射表中选取instanceId和对应的真实title。**严禁推断title！** 详见下方"关联表单字段数据生成流程"
7. 调用 `submitAIGeneratedData` 提交
8. 检查提交结果，失败则修复后重试
9. **【强制】提交后回查验证**：通过API查询最新数据，逐个字段检查是否成功写入。发现空字段必须排查原因并修复后重新提交。
   - **【强制·v3.1.4】关联字段专项验证**：回查时必须验证关联字段的title与instanceId指向的真实记录名称是否一致。关联字段在API返回中是**双重JSON字符串**（如`"\"[{\\\"title\\\":\\\"xxx\\\"}]\""`），需要`JSON.parse`两次才能解析。发现title与真实名称不匹配的，必须删除该记录并重新提交。

### 关联表单字段数据生成流程（v3.5.0·已由一键函数自动处理）

> **【v3.5.0重要变更】以下6步流程已由 `submitAllWithAutoAssociations` 函数自动封装，AI 不再需要手动执行。**
>
> **推荐做法**：使用场景2的 `submitAllWithAutoAssociations`，关联字段传标题字符串即可，函数自动完成查询→映射→填充。
>
> **仅在特殊场景**（如只需查询单个关联字段的 instanceId，不涉及批量提交）时，才需手动使用以下函数：
> - `searchFormDatas(appId, formUuid)` — 查询表单数据
> - `buildReverseTitleMap(records)` — title → instanceId 映射
> - `findRecordByTitle(records, title)` — 按 title 查完整记录
> - `verifyAssociationField(record, fieldId, titleMap)` — 验证关联字段

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
- [ ] 确认已读取字段清单.md，理解每个表单的字段结构
- [ ] 确认已理解用户提供的场景信息（城市、行业、业务场景）
- [ ] 确认数据由AI生成（不是脚本内置数据池）
- [ ] **【强制】确认所有字段都有数据，无一遗漏（v3.7.3起DateField和EmployeeField由脚本自动填充）**
- [ ] **【强制·v3.5.0】多表单提交优先使用 `submitAllWithAutoAssociations`，关联字段传标题字符串即可**
- [ ] **【强制·v3.1.3】formOrder 必须按依赖顺序排列（被关联的在前，关联他表的在后）**

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认子表数据至少2行
- [ ] 确认提交后增量数据与预期一致，无异常重复提交
- [ ] **【强制】通过API回查最新数据，逐个字段检查是否成功写入，发现空字段必须修复后重新提交**

---

## 版本

当前版本：**v3.7.3 (2026-08-01)** — 新增 DateField 自动填充：扫描所有表单Schema，为AI未提供值的DateField字段自动填充当前时间戳。完整版本历史（v3.3.0起各版本根因分析与修复明细）已下沉至 [references/版本历史.md](references/版本历史.md)
