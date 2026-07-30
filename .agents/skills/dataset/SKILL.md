---
name: "dataset"
description: "宜搭数据集制作技能，用于通过API创建视图表和数据集，实现多表联合查询。当用户说'创建视图表'、'多表联合'、'多表关联'、'数据集'、'视图表'、'view table'、'多表数据合并'、'跨表数据整合'、'把多张表合成一张表'、'财务收支汇总'时触发此skill。支持通过内部API直接创建视图表（多表关联/合并），生成可在报表中使用的cubeCode。关键词：视图表、数据集、多表联合、多表关联、数据合并、跨表整合、cubeCode"
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **视图表名称必须具有业务含义** — 如"财务收支汇总"、"项目成本分析"，禁止无意义命名
2. **多表关联必须指定关联字段** — 关联字段必须是两个表都存在且类型匹配的字段
3. **🔴 视图表创建后必须记录cubeCode和measureMapping** — 保存到项目配置（数据集配置.md）中，供报表Skill引用。measureMapping中的columnName→measureCode映射是报表引用的关键。必须记录每个字段的映射关系，如：`textField_4c11h67t → field_9c20fb37e8`
4. **创建视图表前必须确认用户已登录** — 通过 Cookie 文件验证登录态
5. **🔴 输出字段优先使用主表字段** — 关联表字段（特别是`selectField_.._value`）可能因后端元数据未注册导致"元数据DBV没有找到"错误
6. **🔴 保存后必须用 queryModelTableDatasAsync.json 验证数据** — 只有返回真实数据行才算创建成功
7. **🔴 视图表在报表中使用时，报表引擎自动将columnName转为measureCode** — dataset skill负责创建视图表并记录measureMapping，report skill负责自动转换（Step 2.5），两者协同工作。**必须在创建成功后告知用户：报表配置文件中使用原始字段名（columnName）即可，引擎会自动转换，不要手动填写measureCode**
8. **🔴 创建后必须告知用户正确的报表创建流程** — 明确说明："使用 cubeCode 创建报表时，配置文件中的 fieldCode 使用原始字段名（如 textField_4c11h67t），不要使用 measureCode（如 field_9c20fb37e8）。报表引擎的 Step 2.5 会自动查询 measureMapping 并转换。"
9. **🔴 创建视图表前必须检查已有数据集** — 必须先读取项目根目录下的 `数据集配置.md`，检查「视图表列表」中是否已有同配置（相同主表+关联表+关联字段）的视图表。如果已有且状态为"✅"，直接复用 cubeCode，**禁止重复创建**
10. **🔴 禁止创建重复视图表版本** — 同样的主表+关联表+关联字段组合，只创建一个视图表。如果需要修改输出字段，**修改原视图表配置**（重新调用 saveModelTableSchema 保存），而非创建"v2/v3/v4"等新版本。历史教训：同一配置创建了6个版本（v2/v3/v4/v5/三方联合/三方联合v2），导致 cubeCode 混乱和配置堆积
11. **🔴 创建后必须验证并标记状态** — 创建成功后立即用 queryModelTableDatasAsync 验证数据查询，在 `数据集配置.md` 中标记验证状态（✅ 验证通过 / ⚠️ 已失效）。如果后续 report skill 发现 cubeCode 失效，必须回来更新状态为"⚠️ 已失效"，避免其他报表复用失效的 cubeCode

---

# 宜搭数据集制作技能

当前版本：v2.5.0（完整更新日志见 [references/版本历史.md](references/版本历史.md)）

## 📚 参考文件索引（按需加载）

| 参考文件 | 何时加载 |
|---------|---------|
| [references/视图表配置结构详解.md](references/视图表配置结构详解.md) | 构建 `saveModelTableSchema.json` 请求体时，逐结构对照 mainTable/associatedTables/tableRelations/measureMapping/frontSchema/columnFields 完整字段 |
| [references/版本历史.md](references/版本历史.md) | 需要了解历史版本变更（v2.4.0 配置驱动改造、v2.5.0 防重复规则）时 |

## 一、角色定义

你是宜搭数据集制作专家，擅长通过宜搭内部API创建视图表和数据集，实现多表联合查询。你熟悉宜搭视图表的内部API（saveModelTableSchema.json、queryModelTableSchema.json、queryTableFields.json等），能够通过API直接构建完整的视图表配置。

---

## 二、问题总结与正确方法（全量复盘）

### 2.0 历次踩过的坑与最终正确方法

| # | 问题描述 | 错误表现 | 根因 | 正确方法 |
|---|---------|---------|------|--------|
| 1 | `employeeField_` 字段元数据未注册 | "元数据DBV没有找到.dbvCode:xxx,cvCode:employeeField_mpqkbhqu" | employeeField类型字段在视图表后端元数据中未注册 | 从measureMapping和frontSchema.columnFields中移除该字段 |
| 2 | 关联表`selectField_.._value`元数据未注册 | "元数据DBV没有找到.cvCode:selectField_4c11v3t5_value" | 关联表的选择字段_value版本在后端元数据中未注册 | 只保留主表字段，移除所有关联表字段 |
| 3 | cubeSource参数值错误 | "参数不合法:cubeSource:VIEW, is wrong!" | cubeSource的值不是`VIEW`而是`VIEW_MODEL` | 使用`cubeSource=VIEW_MODEL`，`_api=YiDaModelTable.generateCubeCode` |
| 4 | queryTableFields.json直接HTTP调用返回空 | 返回空对象`{}` | 该API需要浏览器环境中的额外header | 使用预验证的字段列表，或通过Playwright调用 |
| 5 | 报表getDataAsync全部失败（错误结论） | "数据查询异常，请检查报表配置" | 初始误判为报表不支持视图表cubeCode | ❌ 此结论已被推翻，见#6 |
| 6 | **报表getDataAsync失败的真正根因** | "数据查询异常，请检查报表配置" | 视图表在报表中必须使用`measureCode`（如`field_cfc8ba4d3f`）而非`columnName`（如`textField_4c11h67t`）作为fieldCode | 报表引擎Step 2.5自动查询measureMapping并转换 |
| 7 | 筛选器字段未转换为measureCode | 筛选器getDataAsync失败 "数据查询异常" | Step 2.5只检查filter.fieldCode，但筛选器配置用valueField.fieldCode | 修复为检查多种fieldCode来源 |

### 2.1 视图表与报表的协同关系（核心知识点）

```
视图表创建流程（dataset skill）:
  1. generateCubeCode → 获得cubeCode（vm_格式）
  2. queryTables → 获取表单列表
  3. 构建配置（mainTable + associatedTables + tableRelations + measureMapping）
  4. saveModelTableSchema → 保存视图表
  5. queryModelTableDatasAsync → 验证数据（通过Playwright）
  6. queryModelTableSchema → 获取measureMapping（columnName→measureCode映射）

报表创建流程（report skill）:
  1. 读取配置文件（fieldCode使用原始columnName）
  2. Step 2.5: 检测到vm_/VIEW_前缀cubeCode → 自动查询measureMapping → 转换所有fieldCode
  3. 创建空白报表
  4. 构建Schema（使用转换后的measureCode）
  5. 保存Schema
  6. Playwright验证getDataAsync全部成功
```

### 2.2 关键API端点

| API名称 | URL路径 | 方法 | 用途 |
|---------|---------|------|------|
| generateCubeCode | `/alibaba/web/{appType}/visual/model-table/generateCubeCodeByCubeSource.json` | GET | 生成新的cubeCode（参数: `cubeSource=VIEW_MODEL`, `_api=YiDaModelTable.generateCubeCode`） |
| queryTables | `/alibaba/web/{appType}/visual/model-table/queryTables.json` | GET | 获取可用表单列表 |
| queryTableFields | `/alibaba/web/{appType}/visual/model-table/queryTableFields.json` | GET | 获取表单的字段列表 |
| saveModelTableSchema | `/alibaba/web/{appType}/visual/model-table/saveModelTableSchema.json` | POST | 保存视图表配置 |
| queryModelTableSchema | `/alibaba/web/{appType}/visual/model-table/queryModelTableSchema.json` | GET | 查询视图表配置 |
| queryModelTableDatasAsync | `/alibaba/web/{appType}/visual/model-table/queryModelTableDatasAsync.json` | POST | 验证数据查询（需浏览器环境） |
| searchCubeList | `/{appType}/visual/datasetRpc/searchCubeList.json` | GET | 查询数据集列表 |

### 2.3 视图表本身 vs 报表引用的两层问题

**第一层：视图表自身数据查询**（queryModelTableDatasAsync.json）
- 根因：measureMapping中包含了后端元数据不存在的字段
- 解决：移除employeeField_和关联表的selectField_.._value字段
- 验证：通过Playwright打开设计器，确认返回真实数据行

**第二层：报表引用视图表**（getDataAsync.json）
- 根因：报表schema中的fieldCode必须使用measureCode而非columnName
- 解决：报表引擎自动查询measureMapping并转换（Step 2.5）
- 验证：通过Playwright打开报表页面，确认所有图表getDataAsync成功

⚠️ **两层问题独立存在**：视图表数据查询正常≠报表引用正常。必须分别验证。

---

## 三、执行流程（API方式 - 推荐）

### 第1步：需求分析

1. 确认需要合并的表单（formUuid / tableName）
2. 确认关联字段（如项目编号、客户编号等）
3. 确认输出字段（需要展示哪些字段）
4. 如用户未提供formUuid，先调用 `get-schema` 或 `config-sync` 获取
5. **🔴 检查已有数据集（硬规则9）**：
   - 读取项目根目录下的 `数据集配置.md`
   - 在「视图表列表」中查找：主表+关联表+关联字段是否与当前需求匹配
   - 如果已有且状态为"✅ 验证通过" → **直接复用** cubeCode，告知 report skill 可直接使用，**终止当前流程**
   - 如果已有但状态为"⚠️ 已失效" → 继续执行第2步创建新视图表
   - 如果不存在匹配记录 → 继续执行第2步创建新视图表

### 第2步：登录验证

检查 `.cookies.json` 文件是否存在且有效：

```bash
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('.cookies.json','utf-8')); console.log('csrf:', d.csrf_token?.substring(0,20), 'cookies:', d.cookies?.length)"
```

如未登录，提示用户通过 login skill 登录。

### 第3步：生成cubeCode

```bash
# 调用 generateCubeCodeByCubeSource.json 生成新的 cubeCode
# cubeCode 格式：vm_{appType}_{userId}_{random}
```

### 第4步：获取表和字段信息

```bash
# 1. 调用 queryTables.json 获取可用表单列表
#    返回：tableName, tableRemark, dbvCode, originSchemaCode 等

# 2. 对每个表调用 queryTableFields.json 获取字段列表
#    返回：code, label, dataType, bizType 等
#    ⚠️ 只有 queryTableFields.json 返回的字段才能用作输出字段！
```

### 第5步：构建视图表配置并保存

配置结构（详见第四节），调用 `saveModelTableSchema.json` 保存。

### 第6步：验证数据查询

用 Playwright 打开视图表设计器，检查 `queryModelTableDatasAsync.json` 是否返回真实数据。

### 第7步：记录cubeCode

将 cubeCode 保存到项目配置中，供报表Skill引用。

---

## 四、视图表配置结构详解

### 4.1 完整配置对象

```javascript
{
  cubeCode: "vm_APP_xxx_xxx_xxx",       // 视图表唯一标识
  cubeName: "财务收支汇总",                // 视图表名称
  mainTable: { ... },                    // 主表信息
  associatedTables: [ ... ],             // 关联表列表
  tableRelations: [ ... ],               // 表关联关系（JOIN条件）
  filters: null,                         // 过滤条件
  measureMapping: [ ... ],               // 输出字段映射
  frontSchema: "{...}",                  // 前端Schema（JSON字符串）
  sqlSchema: null,                       // SQL Schema
}
```

### 4.2 各子结构速查表

| 子结构 | 作用 | 关键点 |
|--------|------|--------|
| `mainTable` | 主表信息 | `tableName`=表单UUID；`tableAlias` 格式 `table_alias_` + 16位hex（唯一）；`originSchemaCode` 从 queryTables.json 获取 |
| `associatedTables` | 关联表列表 | 结构同 mainTable，每表独立 tableAlias |
| `tableRelations` | JOIN条件 | `joinType: "LEFT_JOIN"`；`relations` 内 leftColumn/rightColumn 各含 columnName/columnRemark/dataType |
| `measureMapping` | 输出字段映射 | `columnName`=字段ID，`measureCode` 为字段唯一标识；⚠️ 只包含 queryTableFields.json 验证通过的字段 |
| `frontSchema` | 前端Schema（JSON字符串） | `cubeCodes[0].type: "multiTable"`；tableRelations 用前端格式（field/linkTable）；`columnFields` 与 measureMapping 一一对应 |
| `columnFields` | 列字段定义 | 每字段含 `_data`/measureCode/fieldKey/tableAlias 等约25个属性 |

**完整 JSON 结构逐字段参考（构建请求体时必读）**：[references/视图表配置结构详解.md](references/视图表配置结构详解.md)

---

## 五、字段类型处理规则

### 5.1 需要加 `_value` 后缀的字段类型

| 字段类型前缀 | 示例 | columnName 格式 |
|-------------|------|-----------------|
| `selectField_` | selectField_4c11b9ir | selectField_4c11b9ir**_value** |
| `radioField_` | radioField_mp6vwgsm | radioField_mp6vwgsm**_value** |
| `checkboxField_` | checkboxField_xxx | checkboxField_xxx**_value** |
| `multiSelectField_` | multiSelectField_xxx | multiSelectField_xxx**_value** |
| `employeeField_` | employeeField_mp3gcddm | employeeField_mp3gcddm**_value** |
| `associationFormField_` | associationFormField_xxx | associationFormField_xxx**_title** |

### 5.2 不需要后缀的字段类型

| 字段类型前缀 | 示例 | columnName 格式 |
|-------------|------|-----------------|
| `textField_` | textField_4c11h67t | textField_4c11h67t |
| `numberField_` | numberField_4c11hcwj | numberField_4c11hcwj |
| `dateField_` | dateField_4c11spad | dateField_4c11spad |
| `serialNumberField_` | serialNumberField_xxx | serialNumberField_xxx |

### 5.3 ⚠️ 已知问题字段

#### 问题类型1：`employeeField_` 字段元数据未注册
- **表现**：`employeeField_mpqkbhqu` 导致 "元数据DBV没有找到" 错误
- **修复**：从 `measureMapping` 和 `frontSchema.columnFields` 中移除该字段

#### 问题类型2：关联表字段的 `_value` 后缀版本元数据未注册
- **表现**：`selectField_4c11v3t5_value`（发票状态，来自开票登记表）导致 "元数据DBV没有找到" 错误
- **根因**：关联表的 `selectField_` / `radioField_` 等字段的 `_value` 后缀版本，在视图表后端元数据中可能未注册
- **修复**：从 `measureMapping` 和 `frontSchema.columnFields` 中移除该字段

### 5.4 🔴 关键教训：关联表字段安全策略

**核心原则：视图表输出字段应优先使用主表字段，关联表字段可能存在元数据未注册问题**

| 字段来源 | 风险等级 | 说明 |
|---------|---------|------|
| 主表 `textField_` | ✅ 安全 | 主表文本字段，元数据已注册 |
| 主表 `numberField_` | ✅ 安全 | 主表数值字段，元数据已注册 |
| 主表 `dateField_` | ✅ 安全 | 主表日期字段，元数据已注册 |
| 主表 `selectField_.._value` | ✅ 安全 | 主表选择字段值，元数据已注册 |
| 关联表 `textField_` | ⚠️ 需验证 | 关联表文本字段，可能未注册 |
| 关联表 `selectField_.._value` | ❌ 高风险 | 关联表选择字段值，大概率未注册 |
| `employeeField_` | ❌ 高风险 | 人员字段，元数据经常未注册 |

**解决方案**：
1. 保存视图表前，优先只使用主表字段
2. 如果必须使用关联表字段，保存后用 `queryModelTableDatasAsync.json` 验证
3. 如果报错，逐个移除关联表字段直到成功
4. 最终只保留验证通过的字段

---

## 六、自动化脚本

### 6.1 脚本列表

| 脚本 | 功能 | 用法 |
|------|------|------|
| `scripts/list-datasets.js` | 查询数据集列表 | `node list-datasets.js [appType]` |
| `scripts/verify-dataset.js` | 验证 cubeCode 是否有效 | `node verify-dataset.js <appType> <cubeCode>` |
| `scripts/create-view-table.js` | **配置驱动**通用创建视图表（支持任意关联表 + 关联表字段输出） | `node create-view-table.js <配置JSON> [--dry-run] [--appType=APP_xxx] [--name=名称]` |

### 6.2 API方式创建视图表（推荐，配置驱动）

**通用脚本已彻底去除硬编码**：应用 ID、表单 UUID、关联字段、输出字段全部来自外部 JSON 配置。换应用/换场景只需改配置，无需动代码。

```bash
# 1. 复制示例配置并填入你的应用/表单
cp scripts/viewtable.config.example.json my-config.json
#    编辑 my-config.json：appType / mainTable / associatedTables / joinField / fields

# 2. 先用 --dry-run 校验配置（不发任何 HTTP 请求，不会创建多余视图表）
node scripts/create-view-table.js my-config.json --dry-run

# 3. 确认无误后真实创建
node scripts/create-view-table.js my-config.json
#    可选覆盖：--appType=APP_xxx  覆盖配置里的 appType
#             --name=自定义名称    覆盖配置里的 cubeName
```

### 6.3 配置文件格式（viewtable.config.example.json）

```jsonc
{
  "appType": "APP_FDK8IG9UIDEFV2PTPDYL",        // 目标应用
  "cubeName": "财务收支三方联合",                // 视图表名称
  "mainTable": { "name": "收款登记", "uuid": "FORM_xxx" },  // 主表
  "joinField": { "main": "textField_xxx", "remark": "项目名称" }, // 主表侧关联字段
  "associatedTables": [                          // 任意多个关联表
    { "name": "开票登记", "uuid": "FORM_xxx",
      "joinField": "textField_xxx", "joinRemark": "项目名称" }  // 关联表侧关联字段
  ],
  "fields": [                                    // 输出字段（可来自主表或任意关联表）
    { "code": "textField_xxx", "label": "项目名称", "type": "STRING",
      "table": "main", "suffix": false },        // table: "main" 或 "assoc_0"/"assoc_1"...
    { "code": "numberField_xxx", "label": "价税合计", "type": "DOUBLE",
      "table": "assoc_0", "suffix": false }      // 关联表字段也可输出（已验证可用）
  ]
}
```

**字段规则**：
- `table`: `"main"` 表示来自主表；`"assoc_0"`/`"assoc_1"`… 对应 `associatedTables` 数组下标
- `suffix`: `selectField_`/`radioField_`/`employeeField_` 等需 `true`（自动加 `_value`）；`textField_`/`numberField_`/`dateField_` 用 `false`
- 关联表 `numberField_`（如金额）已验证可正常输出；关联表 `selectField_.._value` 仍属高风险，建议先 `--dry-run` 后实跑用 Playwright 验证

### 6.4 脚本目录管理规则（⚠️ 极其重要·强制）

**`scripts/` 目录只放正式生产脚本，禁止放调试/测试文件！**

| 规则 | 说明 |
|------|------|
| 正式脚本 | 仅 `create-view-table.js`、`list-datasets.js`、`verify-dataset.js`、`viewtable.config.example.json` |
| 调试/测试脚本 | 一律放到项目根目录的 `temp-file/` 文件夹下，使用后立即删除 |
| 禁止创建版本文件 | 调试时修改原脚本，禁止创建 `xxx-v2.js`、`xxx-final.js`、`xxx-debug.js` 等变体 |

**历史教训**：2026-07-10 清理前，`scripts/` 目录堆积了 39 个文件（其中 35 个是调试过程中产生的临时脚本），严重影响了 skill 的可维护性。

### 6.5 验证数据查询（Playwright方式）

`queryModelTableDatasAsync.json` API 在直接 HTTP 调用时会返回 HTML 登录页，必须通过 Playwright 在浏览器环境中调用：

```javascript
// 用 Playwright 打开设计器，捕获 queryModelTableDatasAsync.json 的响应
const page = await context.newPage();
page.on('response', async (res) => {
  if (res.url().includes('queryModelTableDatasAsync')) {
    const body = await res.text();
    const result = JSON.parse(body);
    if (result.success && result.content?.dataRecordList) {
      console.log(`✅ 数据查询成功！${result.content.dataRecordList.length} 行数据`);
    } else {
      console.log(`❌ 失败: ${result.errorMsg}`);
    }
  }
});
await page.goto(`${baseUrl}/alibaba/web/${appType}/visual/modelTableDesigner?cubeCode=${cubeCode}`);
```

---

## 七、与其他Skill的配合

| Skill | 配合方式 |
|-------|---------|
| `config-sync` | 获取应用ID、表单UUID |
| `get-schema` | 获取表单Schema，提取字段信息 |
| `report` | 使用视图表的cubeCode创建报表 |
| `data-prep` | 复杂数据加工场景使用数据准备 |
| `login` | 获取登录态 |

---

## 八、绝对禁止

- ❌ **禁止编造 cubeCode**：必须从 `generateCubeCodeByCubeSource.json` 获取
- ❌ **禁止跳过字段验证**：所有输出字段必须通过 `queryTableFields.json` 验证
- ❌ **禁止使用未验证的字段类型**：`employeeField_` 等字段可能导致"数据查询异常"
- ❌ **禁止跳过数据验证**：保存后必须用 `queryModelTableDatasAsync.json` 验证数据查询
- ❌ **禁止忘记记录cubeCode**：创建成功后必须保存到项目配置

---

## 九、检查清单

### 创建视图表前
- [ ] 已确认需要合并的表单和关联字段
- [ ] 已确认用户已登录宜搭平台（`.cookies.json` 存在且有效）
- [ ] 已获取所有表单的 formUuid
- [ ] 已通过 `queryTableFields.json` 验证所有输出字段

### 创建视图表后
- [ ] `saveModelTableSchema.json` 返回 `success: true`
- [ ] `queryModelTableDatasAsync.json` 返回真实数据行（通过 Playwright 验证）
- [ ] cubeCode 已记录到项目配置
- [ ] 已告知用户如何使用 cubeCode 创建报表

---

## 十、版本记录

当前版本：**v2.5.0 (2026-07-10)** — 完整版本历史已下沉至 [references/版本历史.md](references/版本历史.md)
