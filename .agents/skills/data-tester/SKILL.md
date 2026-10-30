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
12. **【强制·v3.7.4·极其重要】公式字段（FormulaField / 公式默认值）在API提交时不会计算，存储为空** — **这是"验证断言全挂但流程本身没毛病"的根本原因**（2026-09-22 对账场景实锤，与规则 9/10/11 同族，是第 4 个"UI有、API没有"陷阱）。
   - **现象**：表单里配置了公式的字段（如"剩余数量"= 销售-历史-本次、"整单状态判定"= IF(GT(SUM(...),0),...)），通过 UI 提交时有值；通过 `startInstance` / `saveFormData` 提交后，这些字段在存储里**全是空字符串或空数组**（连"未对账"这类默认值都不会填，表现为**空**而非初始值）。
   - **影响面**：任何依赖表单公式字段的下游逻辑。**最坑的是集成自动化/业务规则的赋值源若引用公式字段，API 测试时该字段为空 → 赋值写入空值或静默不匹配 → 断言全挂，看起来像"逻辑流没跑"**，实际是数据源为空。
   - **❌ 错误做法**：
     - 用 API 提交的数据去断言"公式字段的值对不对" → 永远为空，永远失败
     - 看到公式字段为空就判定"逻辑流未执行/引擎 bug" → 误判（本次就差点把根因判到逻辑流上，实际流程日志显示成功执行、只是源字段为空）
     - 把公式字段当作可靠的"预计算列"来简化集成自动化赋值 → API 路径会翻车
   - **✅ 正确做法（三选一）**：
     - **① 生产路径本就是 UI 提交**：若业务真实入口是界面提交，API 测不到的公式字段项，按卡面记 **CANNOT-VERIFY（API 路径不可验，需 UI 真实提交）**，写明解除条件，不要用 API 结果冒充通过。
     - **② 赋值改内联算术**：集成自动化的赋值公式**不要引用表单公式字段**，直接把原始字段的算术内联写进去（如 `IF(GT(#{本次对账},0),#{销售数量}-#{历史对账}-#{本次对账},0)`），原始字段 API 提交是有值的，UI/API 两条路径都稳。
     - **③ 测试数据显式补值**：若必须让公式字段有值，只能靠 UI 提交；API 脚本无法伪造（字段是只读公式，传值也会被忽略）。
   - **判据**：脚本断言失败的字段，**先确认它是不是公式字段**（Schema 里 `type=FormulaField` / 有 `formula` 配置）。是 → 先归因到本规则，再谈逻辑流。
   - **关联**：v3.7.4 起 `submitAllWithAutoAssociations` **不处理公式字段**（无自动填充能力），AI 不得假设它会兜底。
13. **【强制·v3.7.4·高频踩坑收集】调用本 skill 标准函数时的 6 条实测坑** — 均为 2026-09-22 对账场景实测（原记录在 integration 硬规则20，现同步到本 skill，纯 data-tester 任务也必须遵守）。
   - ① **`submitOne` 走 process 分支不自动加载 Cookie** — 必须显式传 `{csrfToken, cookies, hostname}`，否则 `postRequest` 内 `cookies.map` 报空指针（`Cannot read properties of undefined (reading 'map')`）。其余函数（`submitBatch`/`submitAIGeneratedData`）会自动加载，**只有 `submitOne` 和 `startInstance` 需要显式传**。
   - ② **`deleteInstance` 第 3 参传完整 cookieData 对象** — 不是 cookies 数组。误传数组报 `replace undefined`。
   - ③ **取 userId 用 `loadCookies().userId`** — 返回结构是 `{cookies, baseUrl, csrfToken, userId}`，**没有 `login_user.userId` 键**，别再按旧结构取。
   - ④ **提交后等 6 秒再查待办/审批** — 流程实例创建与待办生成有异步延迟，立刻查会得到空列表或乐观锁冲突（optim lock fail）。
   - ⑤ **`searchFormDatas` 的 `pageSize` 上限 100** — 传 200 **静默**返回 0 条（不报错！），验证脚本一律 ≤100，否则会误判"没有数据/没写入"。
   - ⑥ **测试数据删除必须征得用户同意** — 即使是 AI 自己几秒前刚创建的坏数据，也必须先问；未经确认不得删除（本次因此被用户批评）。
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
14. **【强制·v3.8.0】数据查询三项硬规范（pageSize / 日期时间戳 / 稳定排序）** — 所有查询与提交代码必须遵守（依据：OpenYida 借鉴改造清单 P0-3；官方 README 确认日期时间戳与稳定排序要求，pageSize 上限为本项目实测）：
   - **① pageSize 规范**：自行编写的分页查询默认显式写 `pageSize: 50`；平台硬上限 **100**，传 200 会**静默返回 0 条**（不报错，专属硬规则 13-⑤ 已实测）。除用户明确要求外，禁止写 50/100 之外的随意值。本 skill 内置标准函数默认 100 且自动翻页，无需改动
   - **② 日期字段格式**：直接调用宜搭 API 写日期数据（DateField/CascadeDateField）必须用 **13 位毫秒时间戳**（如 `1719705600000`），严禁提交 `YYYY-MM-DD` 字符串。经本 skill 标准函数（`submitAIGeneratedData` 等）提交时可传日期字符串（脚本自动转时间戳），但自行编写的脚本/代码严禁裸字符串直传 API
   - **③ 稳定排序**：需要**分页、对比、配对**的查询必须显式传 `dynamicOrder`（如 `{"dateField_xxx":"-"}` 降序、`{"numberField_xxx":"+"}` 升序）；不传时 `searchFormDatas` 不保证顺序稳定，跨页全量拉取或前后两次查询顺序可能不同。`submitter.js` 的 `searchFormDatas` 已支持 `options.dynamicOrder`；内置"全量拉取建映射"类调用顺序无关，可不传
15. **【强制·v3.9.0】结构级验证优先「一次性测试应用」模式（P5-2）** — 结构级验证（脚本冒烟、全链路 E2E、新能力验证）优先创建带 `XJTEST_` 前缀的一次性应用执行，**彻底不污染真实业务应用**：
   - **入口**：`node .agents/skills/data-tester/scripts/e2e_disposable_app.js --plan`（只打印计划）/ `--name "用途"`（真实执行：建应用→建冒烟表单→提交1条→回查→登记）
   - **注册表**：`.cache/e2e/registry.json` 记录每次创建的 appId/formUuid/instId，供事后审计
   - **清理红线**：本模式只创建不删除；清理（应用/表单/数据）**必须先征得用户同意**（专属硬规则 13-⑥ 同源）
   - **两种模式并存**：业务验收（在指定真实表单中造数）用原模式；结构级验证/冒烟用一次性应用模式。用户指定目标表单时以用户为准

---

# 宜搭数据测试专家

当前版本：v3.8.0（完整更新日志见 [references/版本历史.md](references/版本历史.md)）

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


> 📚 「AI执行指令·核心流程」与「AI数据生成指南」外移至 [references/操作流程与数据生成.md](references/操作流程与数据生成.md)（2026-10-30 上下文收敛）——执行提交任务时加载。
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

当前版本：**v3.9.0 (2026-09-28)** — 新增专属硬规则第15条与「一次性测试应用模式」（P5-2）：结构级验证优先 `e2e_disposable_app.js` 在 `XJTEST_` 前缀一次性应用中执行全链路（建应用→建表单→提交→回查→registry.json 登记），只创建不清理（清理需用户确认），与既有"指定表单造数"模式并存。完整版本历史（v3.3.0起各版本根因分析与修复明细）已下沉至 [references/版本历史.md](references/版本历史.md)
