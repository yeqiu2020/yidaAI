# form_creator 常见问题预防与解决方案

> 本文件从 SKILL.md 拆分而来（Phase 6 任务 6-6），包含 13 个常见问题的详细描述、原因分析和解决方案。

---

## ⚠️ 常见问题预防与解决方案（v6.17.0新增）

### 问题1：宜搭流水号组件限制

#### 问题描述
宜搭平台限制**每个表单最多只能有1个流水号组件（SerialNumberField）**。如果字段清单中一个表单包含多个流水号字段，创建时会报错：
```
❌ 错误: 最多只能有一个流水号组件
```

#### 典型场景
以下表单容易出现多个流水号：
- **报告审核**：审核编号（流水号）+ 报告编号（流水号）
- **报告盖章**：盖章编号（流水号）+ 报告编号（流水号）
- **报告修改**：修改编号（流水号）+ 原报告编号（流水号）+ 修改后报告编号（流水号）
- **报告加出**：加出编号（流水号）+ 原报告编号（流水号）
- **报告归档**：归档编号（流水号）+ 报告编号（流水号）

#### 解决方案
**在生成JSON之前，AI必须检查每个表单的流水号字段数量**：

```
检查规则：
1. 统计每个表单中 "流水号" 类型的字段数量
2. 如果数量 > 1，则只保留第一个流水号字段（通常是主编号）
3. 将其余流水号字段改为 "单行文本" 类型
```

**修改示例**：
| 原字段类型 | 修改后字段类型 | 说明 |
|-----------|---------------|------|
| 审核编号 | 流水号 | 保留（主编号） |
| 报告编号 | **单行文本** | 修改（从流水号改为单行文本） |

#### 预防机制
- **AI在解析字段清单时**，自动检测每个表单的流水号数量
- **如果检测到多个流水号**，在生成JSON前自动将多余的改为单行文本
- **在skill文档中明确记录**：宜搭限制每个表单只能有1个流水号

---

### 问题2：表单重复创建（本地目录重复）

#### 问题描述
执行双模式同步（generate_from_markdown.js + create_from_markdown.js）后，发现同一个表单在**两个不同目录**下各创建了一遍：

**错误目录结构示例**：
```
项目管理/                          # 项目根目录
├── 01需求梳理/
├── 机构信息「普通表单」/           # ✅ generate_from_markdown.js 创建的
│   └── 机构信息「普通表单」.json
├── 客户信息「普通表单」/           # ✅ generate_from_markdown.js 创建的
│   └── 客户信息「普通表单」.json
├── ...
└── 未分组表单/                     # ❌ create_from_markdown.js 又创建了一遍
    ├── 机构信息「普通表单」/       # ❌ 重复的表单
    ├── 客户信息「普通表单」/       # ❌ 重复的表单
    └── ...
```

#### 问题原因
两个脚本的**输出目录逻辑不一致**：

| 脚本 | 输出目录逻辑 | 实际输出位置 |
|------|-------------|-------------|
| `generate_from_markdown.js` | 如果输出路径是已有目录，采用**扁平结构**，直接输出到该目录 | `项目管理/表单名称「类型」/` |
| `create_from_markdown.js` | 统一在 `未分组表单/` 子目录下创建 | `项目管理/未分组表单/表单名称「类型」/` |

#### 解决方案
**方案A：统一使用扁平结构（推荐）**

修改 `create_from_markdown.js` 的目录创建逻辑，使其与 `generate_from_markdown.js` 一致：

```javascript
// create_from_markdown.js 中的 createLocalFormDirectories 函数
// 原逻辑：统一创建到 "未分组表单" 子目录
const ungroupedDir = path.join(projectDir, '未分组表单');

// 修改为：直接使用项目目录（扁平结构）
const formDir = path.join(projectDir, dirName);
```

**方案B：两个脚本使用完全相同的目录结构**

在执行两个脚本时，确保它们使用相同的输出目录结构规则。

#### 当前 workaround
在skill文档中明确告知用户：
1. `generate_from_markdown.js` 生成的文件在 `项目管理/表单名称「类型」/` 目录
2. `create_from_markdown.js` 生成的文件在 `项目管理/未分组表单/表单名称「类型」/` 目录
3. **以 `generate_from_markdown.js` 生成的目录为准**，`未分组表单/` 目录下的文件可以删除

---

### 问题3：表单在宜搭平台重复创建（多次重复）

#### 问题描述
同一个表单在宜搭平台上出现了**多次**，导致平台上有多个同名表单。

**根本原因：宜搭表单创建是"两步式"的**

```
创建流程：
  步骤1: 创建空白表单（此时平台上已经有这个表单了）
  步骤2: 保存字段Schema（添加字段到表单）
```

**如果步骤2失败，步骤1创建的空白表单已经留在平台上了！**

**典型场景（以报告审核为例）**：

| 执行次数 | 操作 | 结果 | 平台上表单状态 |
|---------|------|------|---------------|
| 第1次 | 创建空白表单 → 保存Schema（多个流水号报错） | 步骤1成功，步骤2失败 | 多了1个空白表单 |
| 第2次 | 修复字段 → 再次创建 | 又创建了新的表单 | 多了2个表单（1个空白+1个完整） |

#### 问题原因

**form_manager.js 的两步式创建逻辑**：

```javascript
// 步骤1: 创建空白表单（无论后续是否失败，这个表单已经存在了）
const formUuid = await createEmptyForm(authRef, appType, title, formType);

// 步骤2: 构建并保存Schema（如果这里失败，步骤1的空白表单不会自动删除）
const schema = buildFormSchema(title, fields, formUuid);
await saveFormSchema(authRef, appType, formUuid, schema);
```

#### 解决方案

**方案A：在创建前检查是否已存在同名表单（推荐）**

在 `create_from_markdown.js` 中，创建表单前先查询应用下是否已有同名表单：

```javascript
// 伪代码：创建前检查
async function createFormWithCheck(appType, formTitle, fields, formType) {
  // 1. 查询应用下是否已有同名表单
  const existingForms = await getAppForms(appType);
  const existingForm = existingForms.find(f => f.title === formTitle);
  
  if (existingForm) {
    console.log(`⚠️ 表单 "${formTitle}" 已存在，跳过创建`);
    return existingForm;
  }
  
  // 2. 不存在才创建
  return await createForm(appType, formTitle, fields, formType);
}
```

**方案B：失败时自动删除空白表单**

在 `form_manager.js` 中，如果步骤2失败，自动删除步骤1创建的空白表单：

```javascript
try {
  // 步骤1: 创建空白表单
  const formUuid = await createEmptyForm(authRef, appType, title, formType);
  
  try {
    // 步骤2: 保存Schema
    const schema = buildFormSchema(title, fields, formUuid);
    await saveFormSchema(authRef, appType, formUuid, schema);
  } catch (schemaError) {
    // 步骤2失败，删除步骤1创建的空白表单
    await deleteForm(authRef, appType, formUuid);
    throw schemaError;
  }
} catch (error) {
  throw error;
}
```

**方案C：手动清理（当前workaround）**

如果已经出现重复表单，需要手动登录宜搭平台删除：
1. 登录宜搭平台 → 进入应用管理
2. 找到重复的同名的表单
3. 删除空白或不需要的表单（注意保留有数据的表单）

#### 预防机制
- **AI在重新创建前**，先查询宜搭平台是否已有同名表单
- **如果存在**，询问用户是跳过还是覆盖
- **在skill文档中明确记录**：宜搭表单创建是"两步式"的，失败时会留下空白表单

#### 【v6.17.2 已修复】

**form_manager.js v1.3.0 已实施以下修复：**

1. **新增 `getAppForms` 函数**：获取应用下所有表单列表
2. **新增 `deleteForm` 函数**：删除表单
3. **修改 `createForm` 函数**：
   - 创建前检查是否已存在同名表单，存在则跳过创建
   - 保存Schema失败时自动删除已创建的空白表单
4. **解决宜搭"两步式"创建导致的重复表单问题**

**修复后的创建流程：**
```javascript
// 1. 检查是否已存在同名表单
const existingForms = await getAppForms(authRef, appType);
const existingForm = existingForms.find(f => f.title === formTitle);
if (existingForm) {
  console.log(`表单 "${formTitle}" 已存在，跳过创建`);
  return existingForm;
}

// 2. 创建空白表单
const formUuid = await createEmptyForm(authRef, appType, title, formType);

// 3. 保存Schema（失败时自动删除空白表单）
try {
  const schema = buildFormSchema(title, fields, formUuid);
  await saveFormSchema(authRef, appType, formUuid, schema);
} catch (error) {
  await deleteForm(authRef, appType, formUuid); // 自动清理
  throw error;
}
```

---

### 问题4：关联表单字段配置

#### 问题描述
创建表单时，关联表单字段（AssociationFormField）无法自动建立关联关系，需要在宜搭平台手动配置。

#### 解决方案
创建完成后，登录宜搭平台，进入每个表单的表单设计器，手动配置关联表单字段的关联目标。

---

### 问题5：流程表单流程设计

#### 问题描述
流程表单创建后，审批流程需要手动设计。

#### 解决方案
在宜搭平台的流程设计器中，为每个流程表单设计审批流程（审批节点、审批人、流转条件等）。

---

### 问题6：form_manager.js 删除旧表单重新创建（严重问题）

#### 问题描述
`form_manager.js` v1.3.0 的 `createForm` 函数在检测到同名表单时，会**删除旧表单然后重新创建**，而不是跳过或使用已有的表单。这导致：

1. 第一次创建成功（字段ID为 `ng6u` 开头）
2. 第二次运行时，检测到同名表单，删除 `ng6u` 版本，重新创建 `pk1o` 版本
3. 每次重新创建都会生成全新的字段ID，导致之前配置的公式、联动规则全部失效

**根本原因代码**（form_manager.js 第278-296行）：
```javascript
if (!skipExistingCheck) {
  const existingForms = await getAppForms(authRef, appType);
  const existingForm = existingForms.find(f => f.title === title);
  if (existingForm) {
    console.error(`表单 "${title}" 已存在，删除后重新创建`);
    await deleteForm(authRef, appType, existingForm.formUuid); // ❌ 删除旧表单
    console.error(`已删除旧表单，继续创建`);
  }
}
```

#### 正确的工作流程
应该像同步已有应用一样：
1. **创建宜搭表单**（只创建一次，如果已存在则跳过）
2. **同步回来**（使用 `get-schema` 或 `config-sync` 同步真实的字段ID）
3. **以宜搭创建的为准**（本地JSON文件使用宜搭平台分配的字段ID）

#### 正确的创建逻辑
```javascript
// 1. 检查是否已存在同名表单
const existingForms = await getAppForms(authRef, appType);
const existingForm = existingForms.find(f => f.title === title);

if (existingForm) {
  console.log(`表单 "${title}" 已存在，跳过创建`);
  return existingForm; // ✅ 直接返回已有表单，不删除
}

// 2. 不存在才创建
const formUuid = await createEmptyForm(authRef, appType, title, formType);
const schema = buildFormSchema(title, fields, formUuid);
await saveFormSchema(authRef, appType, formUuid, schema);

// 3. 创建完成后，同步回本地（像同步老应用一样）
// 使用 get-schema 同步表单结构和真实字段ID
```

#### 当前影响
- 所有通过 `create_from_markdown.js` 创建的表单，如果运行多次，字段ID会不断变化
- 导致公式配置失效、联动规则失效
- 本地JSON文件中的字段ID与宜搭平台不一致

#### 解决方案
**方案A：修改 form_manager.js（推荐）**
- 将 `deleteForm` 改为直接返回已有表单
- 创建完成后，使用 `get-schema` 同步真实字段ID到本地

**方案B：创建后手动同步**
- 运行 `create_from_markdown.js` 创建表单（只运行一次）
- 然后使用 `get-schema` 同步真实字段ID：
```powershell
node .agents/skills/get-schema/scripts/sync-schema.js --config "sync-config.json"
```

**方案C：使用 config-sync 同步已有应用**
- 如果表单已创建完成，直接使用 `config-sync` 同步已有应用的结构
- 这样可以获取到宜搭平台真实的字段ID

---

### 问题7：流水号字段创建后无法自动生成（v6.29.0已修复）

#### 问题描述
通过 `create_from_markdown.js` 创建的表单，流水号字段的规则在后台UI中已经显示出来了（固定字符 + 日期 + 自动计数），但直接创建数据时流水号字段为空。必须用户在后台手动进入流水号字段配置，添加规则再删除保存后，才能正常生成。

#### 根本原因
宜搭流水号字段是**双轨制**驱动的：

| 配置项 | 作用 | 脚本是否生成 |
|--------|------|------------|
| `serialNumberRule` 数组 | 仅供前端表单设计器UI显示规则 | ✅ 已生成 |
| `formula.expression` 中的 `SERIALNUMBER()` 公式 | **真正驱动数据提交时生成流水号** | ❌ 之前是空字符串 |

`SERIALNUMBER()` 公式格式：
```
SERIALNUMBER("corpId", "appId", "formUuid", "fieldId", "{\"type\":\"custom\",\"value\":[...规则...]}")
```

当用户在后台手动编辑并保存流水号字段时，宜搭前端会自动生成这个 `SERIALNUMBER()` 公式写入 `formula.expression`，所以手动操作后就正常了。

#### 解决方案（form_manager.js v1.7.0已修复）
在 `form_manager.js` 的 `createForm` 函数中，`buildFormSchema` 后、`saveFormSchema` 前，调用 `enrichSerialNumberFormula()` 函数，遍历 schema 找到所有 SerialNumberField 字段，用 `corpId`/`appType`/`formUuid`/`fieldId`/`serialNumberRule` 拼出完整的 `SERIALNUMBER()` 公式写入 `formula.expression`。

#### 对已创建表单的影响
- 规则25禁止通过API修改已有应用的表单字段内容
- 已创建的表单只能手动操作：进入流水号字段 → 随便加一条规则 → 删掉 → 保存
- 修复后新创建的表单将自动生效

---

### 问题8：关联表单字段显示设置和数据填充未自动配置（v6.35.0已修复）

#### 问题描述
通过 `create_from_markdown.js` 创建的关联表单字段虽然 `formUuid` 正确，但打开表单设计器时：
1. **显示设置** 中「主要信息」和「次要信息」为空，需要手动选择；
2. **数据填充** 中没有自动带出关联字段，需要手动配置。

这导致每个关联字段都要在宜搭后台手动操作，效率低且容易遗漏。

#### 根本原因
创建时只设置了 `associationForm.formUuid`，未设置：
- `mainFieldId` / `mainComponentName`：下拉列表中显示的主要信息
- `subFieldId` / `subComponentName`：下拉列表中显示的次要信息
- `dataFillingRules`：关联选择后自动填充到当前表单其他字段的规则

#### 解决方案（v6.37.0已彻底修复）
`updateAssociationFields` 函数在创建后自动：
1. 查询每个目标表单的 Schema，提取数据标题字段作为 `mainFieldId`，流水号字段作为 `subFieldId`；
2. 从原始字段清单（configs）直接提取填充映射，按位置匹配归属到最近的关联表单字段；
3. 自动生成 `dataFillingRules`（含 `mainRules` 和 `tableRules`），设置 `supportDataFilling: true`，保存 Schema。

**v6.37.0 关键修复**：原先依赖宜搭 Schema 的 `tips` 属性识别"填充"字段（原"关联带出"），但宜搭保存后 `tips` 内容会丢失，导致 `supportDataFilling` 始终为 `false`。改为从原始字段清单直接提取，不依赖 Yida tips。

字段匹配规则：
- 精确匹配：当前字段名与目标字段名完全一致；
- 前缀剥离：如「调出仓库名称」自动匹配目标表单的「仓库名称」；
- 位置匹配：多个关联字段指向同一目标表单时，填充字段归属到最近的关联表单字段。

#### 对已创建表单的影响
- 规则25禁止通过API修改已有应用的表单字段内容
- 已创建的关联字段需要手动在宜搭后台配置显示设置和数据填充
- 修复后新创建的表单将自动生效

---

### 问题9：导航分组功能根因修复（v6.41.2彻底修复）

#### 问题描述
v6.41.0新增的导航分组功能存在两个问题：
1. 表单通过 `parentNavUuid` 参数被创建在分组"内部"，但表单在导航树中完全不可见
2. v6.41.1临时修复（不传parentNavUuid）后，表单虽可见但不分组，且脚本创建的"分组"行为与手动创建的分组不一致（脚本创建的可点击进入空页面，手动创建的只展开/关闭）

#### 根本原因（通过playwright捕获宜搭平台真实API确认）
宜搭平台有两套独立的API管理导航结构：
1. **`saveFormSchemaInfo`** — 用于创建表单（返回FORM-前缀UUID）
2. **`formnav/saveFormNavigation.json`** — 用于创建导航分组（返回NAV-前缀UUID）

v6.41.0错误地用 `saveFormSchemaInfo` + `formType:'group'` 创建分组，创建的是FORM-前缀的表单（可点击进入空页面），不是真正的导航分组。真正的导航分组必须用 `formnav/saveFormNavigation.json` API创建（返回NAV-前缀UUID，可展开/关闭不跳转页面）。

#### 验证证据（通过查询导航列表API `getFormNavigationListByOrder.json` 确认）
| 类型 | navType | navUuid前缀 | formUuid | 创建API | 行为 |
|------|---------|------------|----------|---------|------|
| 真正的分组（手动创建） | `NAV` | `NAV-` | `null` | `formnav/saveFormNavigation.json` | 可展开/关闭，不跳转页面 |
| 表单 | `PAGE` | `FORM-` | `FORM-XXX` | `saveFormSchemaInfo` | 点击进入表单 |
| 脚本错误创建的"分组" | - | `FORM-` | `FORM-XXX` | `saveFormSchemaInfo`+`formType:'group'` | 点击进入空页面（错误行为） |

#### 解决方案（v6.41.2彻底修复）
1. **`createNavGroup` 改用 `formnav/saveFormNavigation.json` API**：创建真正的导航分组（NAV-前缀），创建后查询导航列表API获取navUuid（form_manager.js v1.9.0）
2. **`createEmptyForm` 恢复 `parentNavUuid` 传参**：现在传入的是正确的NAV-前缀分组UUID，表单正确放入分组并可见（form_manager.js v1.9.0）
3. **`createNavGroups` 存储 `navUuid`**：`moduleGroupMap[moduleName] = groupInfo.navUuid`（create_from_markdown.js v2.13.0）
4. **主流程恢复 `parentNavUuid` 传参**：`createFormWithMapping` 传入正确的NAV-前缀分组UUID（create_from_markdown.js v2.13.0）

#### 关键API说明
- **创建导航分组**：`POST /dingtalk/web/{APP_TYPE}/query/formnav/saveFormNavigation.json?_api=Nav.save`
  - 参数：`title={"en_US":"Group","zh_CN":"分组名称","type":"i18n"}`
  - 返回：`{"success":true,"content":528572}`（数字ID，需查询导航列表获取navUuid）
- **查询导航列表**：`GET /dingtalk/web/{APP_TYPE}/query/formnav/getFormNavigationListByOrder.json?_api=Nav.queryList`
  - 返回导航项数组，每个项包含 `navUuid`、`navType`、`formUuid`、`parentNavUuid` 等字段

#### 预防措施（防止类似问题再次发生）
1. **新增涉及宜搭API参数的功能时，必须先在测试应用上验证端到端效果**：不能只看API返回success就认为成功，必须打开宜搭平台页面确认实际效果
2. **执行后确认清单已新增"表单在导航树中可见"检查项**：AI在创建表单后必须执行此项检查
3. **对宜搭API的理解不能基于推测**：宜搭有多个API系统（saveFormSchemaInfo、formnav等），必须通过实际测试确认每个API的用途和行为
4. **新功能发布前必须全链路验证**：v6.41.0的分组功能只验证了"分组创建成功"，没有验证"分组行为是否正确"和"表单放入分组后是否可见"，导致问题潜伏

---

### 问题10：分组目录路径不一致导致原型页面无法加载字段（v2.18.0修复）

#### 问题描述
创建分组并将表单移动到分组目录后，原型页面点击表单的"新增"按钮时，表单内容为空，无法加载字段。

#### 根本原因
1. **应用分组.md中的分组名称带数字编号**（如"一、基础信息"），但创建本地目录时去掉了编号（如"基础信息"）
2. **form-to-prototype skill 的 prototype_generator.js** 生成 formPaths 时，没有考虑分组目录，直接生成扁平路径
3. 原型页面访问时路径不匹配，导致无法加载组件ID清单

#### 问题链
```
excel_to_form.js → 应用分组.md（带编号："一、基础信息"）
                    ↓
create_from_markdown.js → parseGroupConfig → config.module（带编号）
                    ↓
sync_config.js → 创建本地目录（带编号："一、基础信息"）
                    ↓
prototype_generator.js → formPaths（扁平路径，不含分组）
                    ↓
原型页面 → 路径不匹配 → 无法加载组件ID清单
```

#### 解决方案（v2.18.0彻底修复）
1. **create_from_markdown.js v2.18.0**：`parseGroupConfig` 函数新增 `stripModuleNumberPrefix` 函数，去除分组名称中的中文序号前缀（如"一、基础信息" → "基础信息"）
2. **prototype_generator.js v2.10.0**：
   - `parseMarkdown` 函数解析模块标题时去掉数字编号
   - `generateFormConfigJs` 函数生成 formPaths 时，如果表单有 module 字段，路径为"分组名/表单目录"
   - `loadFormListFromConfig` 函数动态加载时从系统配置清单读取分组信息

#### 预防措施
1. **所有涉及分组名称的地方，必须统一去掉数字编号**：使用 `stripModuleNumberPrefix` 函数
2. **生成路径时必须考虑分组目录**：formPaths 应为"分组名/表单目录"格式
3. **动态加载时必须从系统配置清单读取分组信息**：确保路径一致性

---

### 问题11：分组目录带编号导致组件ID清单找不到、原型页面表单为空（v6.47.0修复）

#### 问题描述
生成宜搭应用后，发现两个问题：
1. 分组目录下的表单目录缺少组件ID清单.md文件
2. 原型页面打开后，所有表单都是空的（没有字段）

#### 根本原因
这个问题由三个关联的子问题组成：

**子问题1：目录结构不一致（重复目录）**
- `generate_from_markdown.js` 创建带编号的分组目录（如 `02基础信息`）
- `sync_config.js` 的 `findFormDirectory` 函数跳过所有 `/^\d{2}/` 开头的目录
- 导致找不到已存在的表单目录，然后创建新的不带编号目录（如 `基础信息`）
- 结果：同一个表单在两个目录下各有一份（`02基础信息/表单「类型」/` 和 `基础信息/表单「类型」/`）

**子问题2：组件ID清单只在一个目录中**
- `sync_config.js` 同步时找到了新建的目录（不带编号），组件ID清单.md生成在这里
- `create_from_markdown.js` 的 `syncFormSchemas` 函数按 `form.module` 构建路径，生成在带编号的目录
- 结果：带编号目录有JSON文件但没组件ID清单，不带编号目录有组件ID清单但没JSON文件

**子问题3：原型页面使用占位符fieldId**
- `prototype_generator.js` 的 `generateStaticConfigData` 函数没有从组件ID清单.md读取真实fieldId
- 而是使用占位符（如 `field_产品编号_01`）
- 在 `file://` 协议下，原型页面优先使用静态配置，导致显示占位符而非真实fieldId

#### 问题链
```
generate_from_markdown.js → 创建带编号目录（02基础信息）
                    ↓
sync_config.js → findFormDirectory 跳过 /^\d{2}/ → 找不到 → 创建不带编号目录（基础信息）
                    ↓
组件ID清单.md 生成在不带编号目录 → 带编号目录缺失
                    ↓
prototype_generator.js → generateStaticConfigData 未读取组件ID清单 → 使用占位符fieldId
                    ↓
原型页面 → 表单为空（占位符fieldId不是真实ID）
```

#### 解决方案（v6.47.0彻底修复）
1. **sync_config.js v3.8.1**：`findFormDirectory` 只跳过特殊目录（`01需求梳理`、`.`开头、`temp-file`），不跳过分组目录（包括带编号的）
2. **prototype_generator.js v2.10.1**：
   - `generateStaticConfigData` 函数优先从组件ID清单.md读取真实fieldId
   - 新增 `findFormDirectoryWithNumberPrefix` 函数，支持查找带编号的分组目录
   - 如果直接路径找不到组件ID清单，尝试在带编号的目录中查找

#### 预防措施
1. **所有目录查找函数不应跳过带编号的目录**：只用精确名称匹配跳过特殊目录（如 `01需求梳理`）
2. **生成静态配置时必须优先从组件ID清单读取真实fieldId**：不能只用占位符
3. **查找文件时必须支持带编号的分组目录**：添加 `findFormDirectoryWithNumberPrefix` 回退查找

---

### 问题12：两个脚本分组目录命名规则不一致导致重复目录（v6.48.0彻底修复）

#### 问题描述
执行双模式同步（generate_from_markdown.js + create_from_markdown.js）后，每个分组都生成两份目录：
- 带编号目录：`02基础信息/`、`03库存管理/`（generate_from_markdown.js 创建）
- 不带编号目录：`基础信息/`、`库存管理/`（create_from_markdown.js + sync_config.js 创建）

两份目录都有相同结构的文件，但组件ID清单内容不同：
- 带编号目录：本地生成的**占位符**组件ID（如 `serialNumberField_mloe5q178...`）
- 不带编号目录：从宜搭同步的**真实**组件ID（如 `serialNumberField_bsl2y8l3`）

#### 根本原因
**两个脚本的分组目录命名规则完全相反**：

| 脚本 | 命名规则 | 实现代码 |
|------|---------|---------|
| `generate_from_markdown.js` | `02基础信息`（加数字编号） | `getModuleNumberedName()` 函数从02开始编号，01留给需求梳理 |
| `create_from_markdown.js` + `sync_config.js` | `基础信息`（不加编号） | `parseGroupConfig()` → `stripModuleNumberPrefix()` 去掉中文序号前缀 |

**冲突链路**：
```
generate_from_markdown.js 读取字段清单.md
    ↓
解析模块名"一、基础信息" → currentModule = "基础信息"
    ↓
getModuleNumberedName("基础信息") → "02基础信息"
    ↓
创建目录: 02基础信息/产品信息「普通表单」/

create_from_markdown.js 读取应用分组.md
    ↓
parseGroupConfig() → stripModuleNumberPrefix("基础信息") → "基础信息"
    ↓
form.module = "基础信息"
    ↓
sync_config.js: path.join(outputDir, form.module) = "outputDir/基础信息"
    ↓
findFormDirectory(form.name, "outputDir/基础信息")
    ↓
基础目录"基础信息"不存在（实际是"02基础信息"）
    ↓
返回 null → 创建新的不带编号目录"基础信息/表单名「类型」/"
    ↓
结果：产生重复目录
```

#### v6.47.0 修复不彻底的原因
v6.47.0 只修复了 `findFormDirectory` 函数（让它不跳过带编号目录），但没有解决**两个脚本命名规则不一致**的根因。`findFormDirectory` 接收的 `baseDir` 参数是 `outputDir/基础信息`（不带编号），这个目录根本不存在，所以无论 `findFormDirectory` 怎么优化，都无法在不存在的目录里找到表单目录。

#### 解决方案（v6.48.0彻底修复）
**统一方向**：两个脚本都使用**不带编号**的分组目录名（与应用分组.md保持一致）

理由：
1. 应用分组.md是用户确认的分组结构，应该作为**唯一权威**
2. 应用分组.md中的分组名称本身不带数字编号
3. 数字编号是 generate_from_markdown.js 自己加的，没有业务意义
4. 宜搭平台的导航分组也不带数字编号
5. create_from_markdown.js 已经使用不带编号的规则，修改 generate_from_markdown.js 影响范围更小

**修改内容**（generate_from_markdown.js v6.4.0）：
1. 删除 `getModuleNumberedName` 函数和 `moduleNumberMap`、`moduleCounter` 变量
2. 创建模块目录时直接使用 `module` 名，不加数字编号
3. 表单文件夹路径直接使用 `module` 名，不加数字编号
4. `numberedModule` 字段值改为与 `module` 一同（保留字段名向后兼容）

#### 预防措施
1. **所有脚本的目录命名规则必须统一**：以应用分组.md为权威，不带数字编号
2. **新增脚本或修改现有脚本时，必须检查目录命名规则是否与其他脚本一致**
3. **禁止任何脚本自行给分组目录加数字编号前缀**：数字编号没有业务意义，只会导致命名冲突
4. **双模式同步后必须验证目录结构**：检查是否产生重复目录

---

### 问题13：分组目录与表单目录命名结构不一致（v6.49.0优化）

#### 问题描述
分组目录名（如`基础信息`）和表单目录名（如`产品信息「普通表单」`）结构不一致，用户难以区分哪些是分组、哪些是表单。

#### 解决方案（v6.49.0）
统一目录命名结构，分组目录加「分组」后缀：
- 分组目录：`基础信息「分组」`（与表单的`「普通表单」`/`「流程表单」`结构对齐）
- 表单目录：`产品信息「普通表单」`

**修改的脚本**（6个）：
1. `generate_from_markdown.js` v6.5.0（form_creator）
2. `create_from_markdown.js` v2.19.0（form_creator）
3. `sync_single_form.js` v1.2.0（form_creator）
4. `project_generator_v2.js` v1.1.0（form_creator）
5. `sync_config.js` v3.10.1（config-sync）
6. `prototype_generator.js` v2.11.0（form-to-prototype）

**关键规则**：
- `form.module` 字段值保持为分组名称（如"基础信息"），不带「分组」后缀
- 只有在**创建目录**或**拼接目录路径**时，才使用 `module + '「分组」'` 作为目录名
- **向后兼容**（v3.10.1新增）：查找带「分组」后缀的目录失败时，检查旧目录(不带后缀)是否存在，如果存在则自动重命名为新目录，复用旧目录里的所有完整文件。避免创建重复目录和文件丢失。`prototype_generator.js`也支持向后兼容，优先查找带「分组」后缀的目录，找不到则查找不带后缀的旧目录。

#### 预防措施
1. **分组目录统一使用「分组」后缀**：与表单的「普通表单」/「流程表单」结构对齐
2. **所有涉及分组目录的脚本必须同步修改**：form_creator、config-sync、form-to-prototype
3. **保留向后兼容**：查找分组目录时，优先查找带「分组」后缀的新目录，找不到再查找不带后缀的旧目录

---

### 问题14：FORM-TEMP占位符残留导致线上点"新增"报"表单不存在"（v6.61.0已根治）

#### 问题描述（进销存3真实事故）
采购入库表单线上点击关联字段的"新增"按钮，弹窗必报"表单不存在，唯一排查码：xxx"。排查发现该字段的 `associationForm.formUuid` 是 `FORM-TEMP-MS0DU18H` 这样的占位符，而非真实表单UUID。全系统扫描共发现3张表单4个坏字段。

#### 根因链（五层失守，缺一层都不会出事故）
1. **源头**：字段清单中"被其他关联字段填充的只读关联表单字段"（如"关联供应商"）说明列只写`-`，没有`关联-->目标表`标记
2. **解析层**：`parseFieldConfig` 的正则提取不到目标表名，`field.associationForm=undefined`，无任何告警
3. **构建层**：`createFormWithMapping` 因 `associationForm` 为空跳过赋值，`schema_builder.js` 静默兜底生成 `FORM-TEMP-*`（特征：formTitle/appType 全空）
4. **二次配置层**：`updateAssociationFields` 按 formTitle 匹配 formMetaMap，空 title 匹配不到 targetMeta，静默跳过
5. **无自检**：建表完成全流程无 FORM-TEMP 残留扫描，带病交付

#### 证据鉴别法（排查同类问题时可复用）
- 坏字段 Schema：`formTitle=""`、`appType=""`（schema_builder 兜底分支特征）
- 好字段 Schema：`formTitle="采购订单"`、`appType="APP_xxx"`（create_from_markdown 建表分支会填表名）
- 占位符后缀是36进制时间戳，可与 Schema 节点ID（如 `node_ocms0du18h5`）的时间戳段对照确认产生时机

#### 修复方案
- **线上已有表单**：受通用硬规则第1条限制（禁止API修改已有表单），只能在宜搭设计器中手动重选关联表单后保存
- **skill层根治（v6.61.0，`create_from_markdown.js v2.20.0` + `schema_builder.js v1.4.0`）**：
  1. `validateAssociationTargets` 建表前校验：目标表缺失时按字段名推断（去"关联/选择"前缀与表单名互相包含、唯一命中才采纳），推断成功打告警自动补全，失败则零成本中止（未创建任何资源）；必须在拓扑排序前执行，推断结果才能参与依赖排序
  2. `updateAssociationFields` 中 targetMeta 匹配不到时计入 failureReport，不再静默
  3. `scanAndFixPlaceholders` 建表后兜底自检（步骤[5/10]）：可解析的自动回填真实UUID并保存（仅限本次新建表单，符合saveFormSchema约束），无法修复的醒目告警+非零退出码
  4. `schema_builder.js` 兜底分支同步输出显式 console.warn

#### 预防措施
1. **字段清单规范**：所有"关联表单"类型字段（含被填充的只读字段）说明列必须写 `关联-->目标表名`，绝不能只写`-`
2. **AI执行后必查日志**：看到推断告警（⚠️ 已按字段名自动推断）必须回头补全字段清单；看到自检失败（❌ FORM-TEMP残留）必须立即处理，严禁当作成功交付
3. **静默兜底是事故温床**：任何"生成占位符/降级处理"的代码分支都必须伴随显式告警，并在流程末尾有兜底自检
4. **回归测试常驻**：`tests/test_validate_assoc.js` 固化了3个场景（事故复刻推断补全/无法推断中止/标记完整直通），修改 `create_from_markdown.js` 的关联字段解析/校验逻辑后必须重跑：`node .agents/skills/form_creator/tests/test_validate_assoc.js`

---
