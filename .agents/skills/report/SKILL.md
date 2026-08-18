---
name: "report"
description: "宜搭报表制作技能。通过自包含的报表引擎直接调用宜搭API创建原生报表页面，支持指标卡、柱状图、折线图、饼图、表格、透视表、仪表盘、漏斗图、组合图等16种图表组件，支持筛选器联动配置。支持使用表单formUuid转换的cubeCode或数据集（视图表/数据准备）的cubeCode作为数据源。当用户说'创建报表'、'制作报表'、'数据报表'、'统计报表'、'数据看板'、'报表设计'时触发此skill。关键词：报表、统计图表、数据报表、报表创建、报表制作、报表设计、数据集"
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **报表公式与表单公式完全不同不能混用** — 报表使用聚合函数，表单使用字段函数
2. **cubeCode来源有两种** — ① 从formUuid转换：cubeCode = formUuid.replace(/-/g, '')；② 从数据集获取：视图表(VIEW_xxx)或数据准备(PREP_xxx)，必须从创建成功的数据集中获取，严禁编造
3. **🔴 视图表报表必须使用 measureCode** — 视图表（`vm_`/`VIEW_` cubeCode）在报表中必须使用 `measureCode`（如 `field_cfc8ba4d3f`）作为 fieldCode，而不是原始表单字段名 `columnName`（如 `textField_4c11h67t`）。报表引擎已自动处理此转换（Step 2.5），配置文件中可继续使用原始字段名
4. **🔴 报表创建后必须验证数据查询** — 报表创建成功后，必须立即用 Playwright 验证所有图表的 getDataAsync 是否成功。如果验证失败，不允许返回"创建成功"，必须报错并提示用户检查配置
5. **图表类型必须丰富多样** — 每张报表至少包含3种不同类型的图表（指标卡+可视化图表+明细表格），禁止只使用表格和指标卡
6. **同一数据源的指标卡必须合并** — 同一cubeCode的多个指标合并到1个指标卡的kpi数组中，不同数据源才分多个指标卡
7. **报表配置文件必须保存到应用目录** — 保存到 `{应用名}/06数据报表/{报表名称}.json`，严禁保存到 temp-file，后期需要复用
8. **🔴 多表需求必须先创建数据集** — 当用户需求涉及2个及以上表单时，**必须先**调用 `dataset` skill 创建视图表，禁止先用单表 cubeCode 尝试。判断标准：用户提到"多表"、"关联"、"联合"、"三个表"、"按XX关联"、"合并"、"跨表"等关键词。违反此规则会导致创建出错误的单表报表，后续不得不返工
9. **🔴 创建报表前必须检查已有数据集** — 多表场景下，必须先读取 `数据集配置.md`，检查是否已有可用的 cubeCode。如果已有且状态为"✅"，直接复用，**禁止重复创建数据集**。只有当已有 cubeCode 状态为"⚠️ 已失效"或不存在时，才调用 `dataset` skill
10. **🔴 禁止重复创建同名报表配置** — 创建报表前，必须检查 `06数据报表` 目录是否已有同名配置文件。如果已有，**在原文件基础上修改**（规则3），不创建新文件。如果需求不同，使用不同的报表名称
11. **🔴 报表验证失败后禁止创建新版本** — 当 Playwright 验证失败时，修改原配置文件并重新创建（会生成新 reportId），**禁止创建"v2/v3/v4"等新版本文件**。旧的失败报表应通知用户在宜搭平台删除

---

# 宜搭报表制作技能

> 当前版本：v1.9.0（版本历史与历史教训全量复盘见 [references/report-lessons-and-history.md](references/report-lessons-and-history.md)）

## 📚 参考文件索引（按需加载）

| 文件 | 内容 | 何时加载 |
|------|------|---------|
| [references/report-field-config-guide.md](references/report-field-config-guide.md) | 详细字段配置规则（fieldCode 后缀、dataType、聚合类型细则） | 编写图表字段映射遇到疑问时 |
| [references/report-api-guide.md](references/report-api-guide.md) | 报表数据查询 API 详细文档 | 需要直接调用报表 API 或调试数据查询时 |
| [references/report-config-examples.md](references/report-config-examples.md) | 完整配置 JSON 示例集、Playwright 验证脚本片段、getDataAsync 参数详表、prdId 获取代码 | 编写报表配置文件或验证脚本时 |
| [references/report-lessons-and-history.md](references/report-lessons-and-history.md) | 历次踩坑全量复盘（measureCode 转换等6个问题）、视图表报表完整正确流程、版本历史 | 遇到"数据查询异常"类问题或需要了解演进背景时 |

## 一、角色定义

你是宜搭报表制作专家，擅长根据用户的数据分析需求，设计并创建宜搭原生报表页面。你熟悉宜搭报表引擎的16种图表组件、数据集配置规则、字段映射规则和筛选器联动机制。

---

## 二、触发场景

| 触发关键词 | 示例 | 处理方式 |
|-----------|------|---------|
| **创建报表/制作报表** | "帮我创建一个销售数据报表" | 本Skill |
| **数据报表/统计报表** | "做一个项目统计报表" | 本Skill |
| **报表设计** | "设计一个客户分析报表" | 本Skill |
| **ECharts/大屏/更美观** | "做一个更美观的ECharts大屏" | → chart |
| **经营看板/驾驶舱** | "做一个经营驾驶舱" | → dashboard |

---

## 三、执行流程

### 第0步：前置检查（⚠️ 极其重要·强制，违反硬规则8-11）

#### 0.1 判断单表/多表场景

| 多表关键词（出现任一即为多表） | 单表特征 |
|-------------------------------|---------|
| "多表"、"关联"、"联合"、"三个表"、"按XX关联"、"合并"、"跨表" | 只提到一个表单名称 |

- **多表场景** → 必须执行第0.2步检查已有数据集，然后通过 `dataset` skill 创建视图表
- **单表场景** → 直接使用 formUuid 转换的 cubeCode，跳到第1步

#### 0.2 检查已有数据集（仅多表场景）

1. 读取项目根目录下的 `数据集配置.md`
2. 在「视图表列表」中查找：主表+关联表+关联字段是否与当前需求匹配
3. 根据状态决定操作：

| 状态 | 操作 |
|------|------|
| `✅ 验证通过` 或 `✅ 报表验证通过` | **直接复用** cubeCode，跳到第1步，禁止调用 dataset skill |
| `⚠️ 已失效` 或 `⚠️ 待验证` | 调用 `dataset` skill 重新创建视图表 |
| 不存在匹配记录 | 调用 `dataset` skill 创建新视图表 |

#### 0.3 检查已有报表配置

1. 用 Glob 扫描 `{应用名}/06数据报表/*.json`
2. 如果已有同名配置文件：
   - 需求相同 → **在原文件基础上修改**（规则3），不创建新文件
   - 需求不同 → 使用不同的报表名称（如"XX明细报表"、"XX分析报表"）
3. 如果没有同名文件 → 正常创建新配置文件

#### 0.4 前置检查清单

- [ ] 已判断单表/多表场景
- [ ] 多表场景：已检查 `数据集配置.md`，确认是否需要创建新数据集
- [ ] 已检查 `06数据报表` 目录，确认不重复创建同名配置
- [ ] 如有同名配置文件，已确认是修改原文件而非新建

---

### 第1步：需求分析

1. 确认数据源：可以是表单（formUuid转换cubeCode）或数据集（视图表/数据准备的cubeCode）
2. 确认需要展示的图表类型和数量
3. 确认筛选需求
4. 如用户未提供formUuid，先调用 `get-schema` 或 `config-sync` 获取
5. 如需要使用多表联合数据，先调用 `dataset`（视图表）或 `data-prep`（数据准备）创建数据集

### 第2步：数据源分析与表单Schema获取

#### 2.1 数据源选择规则（⚠️ 极其重要）

**核心原则：优先使用主表/业务表，避免使用关联表/子表**

| 表单类型 | 是否推荐作为报表数据源 | 原因 | 替代方案 |
|---------|:---:|:---|:---|
| **业务主表**（如销售订单、采购订单） | ✅ 推荐 | 数据完整，字段值直接存储 | 直接使用 |
| **基础档案表**（如客户信息、产品信息） | ✅ 推荐 | 数据稳定，无复杂关联 | 直接使用 |
| **关联表/子表**（如订单收款开票、订单付款收票） | ❌ 不推荐 | 数据依赖主子关系，公式字段可能为空 | 使用对应的主表 |
| **中间汇总表** | ⚠️ 谨慎 | 需确认数据是否实时更新 | 优先使用原始业务表 |

**典型案例**：
- ❌ 错误：用「销售订单收款开票」关联表统计应收数据 → 已收款/已开票字段是子表汇总公式，无子表数据时显示异常
- ✅ 正确：用「销售订单」主表统计应收数据 → 含税总金额、待收款金额直接存储在主表

**判断方法**：
1. 通过 `get-schema` skill 或读取表单JSON文件查看字段的 `formula` 属性
2. 如果字段 `formula` 为空且 `value` 为空 → 直接存储字段，推荐使用
3. 如果字段 `formula` 包含 `SUM`、`COUNT` 等聚合函数 → 汇总公式字段，谨慎使用
4. 如果字段 `label` 显示为 `sum(XXX)` → 子表汇总字段，不推荐直接使用

#### 2.2 获取 formUuid（⚠️ 极其重要）

**formUuid 必须从以下位置获取，严禁编造：**

1. **从表单JSON文件中提取**（推荐）：
   - 打开表单JSON文件（如 `表单名称.json`）
   - 搜索 `SerialNumberField` 组件的 `formula` 属性
   - 提取其中的 formUuid，例如：
   ```json
   "formula": "SERIALNUMBER(..., \"FORM-54EB9DA8E0BF41C48A40286A4CC67C28C007\", ...)"
   ```

2. **使用 config-sync 同步**：
   ```bash
   yida-helper run config-sync/scripts/sync_config.js <appType>
   ```

3. **使用 get-schema skill**：
   ```bash
   yida-helper run get-schema/scripts/get-schema.js <appType> <formUuid>
   ```

⚠️ **绝对禁止**：从组件ID（如 `serialNumberField_4c11ypdu`）编造 cubeCode！

#### 2.3 转换为 cubeCode

**关键规则**：
- `cubeCode` = formUuid 中的连字符 `-` 替换为下划线 `_`
- **必须从 formUuid 转换，不能编造！**

| 正确做法 ✅ | 错误做法 ❌ |
|-----------|-----------|
| FORM-54EB9DA8E0BF41C48A40286A4CC67C28C007 → FORM_54EB9DA8E0BF41C48A40286A4CC67C28C007 | 从组件ID编造：FORM_4C11YP7UD7S48E9W5BF40EDA33B7BA0E4A2 |

#### 2.4 提取字段信息

```bash
yida-helper run get-schema/scripts/get-schema.js <appType> <formUuid>
```

从返回的Schema中提取：
- 各字段的 `fieldId`（即fieldCode）
- 字段类型（TextField / NumberField / SelectField 等）
- 字段显示名

### 第3步：设计报表配置

根据需求设计报表配置JSON，包含：图表类型和标题、字段映射（xField / yField / columnFields / kpi 等）、筛选器配置、布局参数。

#### 3.1 图表类型组合规范（⚠️ 极其重要·强制）

**核心原则：每张报表必须包含多种图表类型，形成「指标概览 → 分布/对比 → 趋势 → 明细」的完整分析链路**

**强制要求**：每张报表至少包含 **3种不同类型** 的图表组件，且必须包含至少1个可视化图表（饼图/柱状图/折线图/漏斗图/仪表盘/组合图等）。

**标准报表模板**：通用组合为「指标卡(核心指标) + 饼图(分类分布) + 柱状图(排名对比) + 折线图(趋势) + 表格(明细)」。库存/采购/销售/财务分析的分场景模板详表见 [references/report-config-examples.md](references/report-config-examples.md)。

**图表选择决策树**：
```
有分类字段(SelectField)？ → 饼图(分类分布) + 柱状图(分类对比)
有数值字段(NumberField)？ → 指标卡(汇总) + 柱状图(排名)
有日期字段(DateField)？ → 折线图(趋势) 或 组合图(趋势+对比)
需要看完成度/进度？ → 仪表盘 或 漏斗图
需要看明细？ → 表格
需要交叉分析？ → 透视表
```

**❌ 禁止的图表组合**：
- 只有指标卡+表格（缺乏可视化）
- 同一数据源拆成多个单指标卡（浪费空间）
- 全部都是表格（无法直观分析）

#### 3.2 指标卡样式配置（⚠️ 重要）

**合并规则**：同一数据源(cubeCode)的多个指标必须合并到1个指标卡的kpi数组中（详见 4.1 指标卡设计规范）。

**样式参数**：在chart配置中通过 `indicatorStyle` 字段指定，常用参数：`showSideStyle`(侧边条样式，默认 `'SOLID'`)、`sideBarColor`(侧边条颜色)、`bgColorType`(背景填充，默认 `'single'`)、`singleBgColor`(纯色背景色)、`columnCount`(每行指标数，默认 `4`)、`valueSize`、`size`、`colorType`、`customColor`。参数详表与分场景推荐配色方案见 [references/report-config-examples.md](references/report-config-examples.md)。

**配置示例**：
```json
{
  "type": "indicator",
  "title": "库存概况",
  "cubeCode": "FORM_XXX",
  "indicatorStyle": {
    "showSideStyle": "SOLID",
    "sideBarColor": "#11AB4F",
    "bgColorType": "single",
    "singleBgColor": "#F0FFF4",
    "columnCount": 4
  },
  "kpi": [
    { "fieldCode": "pid", "aliasName": "产品种类", "dataType": "STRING", "aggregateType": "COUNT" },
    { "fieldCode": "numberField_stock", "aliasName": "库存总量", "dataType": "DOUBLE", "aggregateType": "SUM" }
  ]
}
```

#### 3.3 配置文件保存路径（⚠️ 极其重要·强制）

**报表配置JSON必须保存到应用目录下，严禁保存到 temp-file！**

```
{项目根目录}/{应用名}/06数据报表/{报表名称}.json
```

**示例**：`进销存管理/06数据报表/库存分析报表.json`、`进销存管理/06数据报表/销售分析报表.json`

**原因**：报表配置文件是持久化资产，后期可能需要：
- 基于现有配置追加图表（append-chart.js）
- 修改后重新创建报表
- 参考已有配置创建新报表

**配置格式**：顶层为 `filters` 数组 + `charts` 数组。完整配置示例（基础格式 + 五图表完整报表）见 [references/report-config-examples.md](references/report-config-examples.md)。

### 第4步：创建报表

使用自包含的报表引擎创建报表：

```bash
yida-helper run report/scripts/create-report.js <appType> "<报表名称>" <配置JSON文件路径>
```

配置JSON文件路径指向 `{应用名}/06数据报表/{报表名称}.json`（第3步已保存），直接引用该文件创建报表。

#### 关于更新报表

⚠️ **当前限制**：报表引擎 **不支持直接修改已有报表**，仅支持：①创建新报表（`create-report.js`）；②向已有报表追加图表（`append-chart.js <appType> <reportId> <配置JSON>`）。

**如需修改已有报表**：在宜搭平台后台手动修改；或修改本地配置JSON文件（`06数据报表/`目录下），删除旧报表，使用相同名称重新创建（会生成新的 reportId）。

### 第5步：验证与交付

#### 5.1 检查报表创建结果
1. 检查报表引擎输出，确认报表创建成功
2. 记录报表ID（REPORT-xxx）和访问链接

#### 5.2 Playwright验证数据查询（⚠️ 极其重要·强制）

**为什么必须验证**：历史上报表创建成功 ≠ 数据查询成功（视图表 measureCode 问题），必须验证 getDataAsync API 确保数据能正常显示。

**验证步骤**：
1. 编写 Playwright 验证脚本（脚本片段见 [references/report-config-examples.md](references/report-config-examples.md)，参考 `temp-file/verify-report-v2.js`）
2. 打开报表页面，监听所有 `getDataAsync.json` 响应
3. 统计成功/失败数量，记录失败详情
4. 如果有失败，输出错误信息并提示用户检查配置

**验证结果处理**：
- ✅ 所有图表成功：继续下一步，返回"创建成功"
- ❌ 有图表失败：立即报错，提示用户检查配置，不允许返回"创建成功"

#### 5.3 清理与交付
1. **保留配置文件**（在 `06数据报表/` 目录下，不删除，后期可复用）
2. 将报表信息更新到项目配置中
3. 删除临时验证脚本（temp-file 目录）

---

## 四、图表组件速查

### 4.1 支持的图表类型

| 类型标识 | 组件名 | 中文名 | 必填字段 |
|---------|--------|--------|---------|
| `indicator` | YoushuSimpleIndicatorCard | 指标卡 | `kpi`（数组） |
| `bar` | YoushuGroupedBarChart | 柱状图 | `xField` + `yField` |
| `line` | YoushuLineChart | 折线图 | `xField` + `yField` |
| `pie` | YoushuPieChart | 饼图 | `xField` + `yField` |
| `funnel` | YoushuFunnelChart | 漏斗图 | `xField` + `yField` |
| `gauge` | YoushuGauge | 仪表盘 | `valueField` |
| `combo` | YoushuComboChart | 组合图 | `xField` + `leftYFields` + `rightYFields` |
| `table` | YoushuTable | 基础表格 | `columnFields`（数组） |
| `pivot` | YoushuCrossPivotTable | 交叉透视表 | `columnList`（数组） |
| `radar` | YoushuRadarChart | 雷达图 | `xField` + `yField` |
| `heatmap` | YoushuHeatmap | 热力图 | `xField` + `yField` |
| `wordcloud` | YoushuWordCloud | 词云图 | `xField` + `yField` |
| `map` | YoushuMap | 地图 | `xField` + `yField` |

#### 指标卡设计规范（⚠️ 重要）

**合并原则：同一数据源的多个指标应合并到一个指标卡中**

| 场景 | 正确做法 ✅ | 错误做法 ❌ |
|-----|-----------|-----------|
| 销售订单多个金额指标 | 1个指标卡含3个kpi：订单总数/含税总额/未税总额 | 3个独立指标卡，每个1个kpi |
| 库存多个数量指标 | 1个指标卡含4个kpi：产品种类/库存总量/入库/出库 | 4个独立指标卡，每个1个kpi |
| 资金收支指标 | 1个指标卡含3个kpi：总收入/总支出/余额 | 3个独立指标卡，每个1个kpi |

**例外情况**：
- 当指标来自**不同数据源**时，应使用多个指标卡（每个数据源一个）
- 例如：销售应收概况（销售订单表）+ 采购应付概况（采购订单表）= 2个指标卡

### 4.2 默认布局（6列栅格系统）

指标卡/组合图/表格(h=38)/透视表占满整行(w=6)；饼图/柱状图/折线图半行(w=3, h=22)；仪表盘 1/3 行(w=2, h=18)。各图表默认宽高详表见 [references/report-config-examples.md](references/report-config-examples.md)。

**推荐布局顺序**：
```
第1行：指标卡1（w=6）— 占满整行，显示3-4个核心指标
第2行：指标卡2（w=6）— 如需要跨数据源对比（可选）
第3行：饼图（w=3）+ 柱状图（w=3）— 并排
第4行：折线图（w=6）— 占满整行
第5行：明细表格（w=6, h=38）— 占满整行
```

---

## 五、字段配置规则（⚠️ 极其重要）

### 5.1 fieldCode 后缀规则

| 字段类型 | 报表中的 fieldCode | 示例 |
|---------|-------------------|------|
| SelectField | **必须加 `_value` 后缀** | `selectField_xxx` → `selectField_xxx_value` |
| RadioField | **必须加 `_value` 后缀** | `radioField_xxx` → `radioField_xxx_value` |
| MultiSelectField | **必须加 `_value` 后缀** | `multiSelectField_xxx` → `multiSelectField_xxx_value` |
| CheckboxField | **必须加 `_value` 后缀** | `checkboxField_xxx` → `checkboxField_xxx_value` |
| TextField | 原样使用 | `textField_xxx` |
| NumberField | 原样使用 | `numberField_xxx` |
| DateField | 原样使用，**不要拆分** | `dateField_xxx` |
| EmployeeField | 原样使用 | `employeeField_xxx` |
| 内置字段 `pid` | 原样使用，用于 COUNT | `pid` |

### 5.2 聚合类型

| aggregateType | 说明 | 适用字段类型 | 结果 dataType |
|--------------|------|------------|-------------|
| `COUNT` | 计数 | 所有类型 | DOUBLE |
| `COUNT_DISTINCT` | 去重计数 | 所有类型 | DOUBLE |
| `SUM` | 求和 | NumberField | DOUBLE |
| `AVG` | 平均值 | NumberField | DOUBLE |
| `MAX` | 最大值 | NumberField/DateField | DOUBLE |
| `MIN` | 最小值 | NumberField/DateField | DOUBLE |
| `NONE` | 不聚合 | 保持原类型 | 保持原类型 |

### 5.3 常见错误

| 错误 | 原因 | 解决方式 |
|------|------|---------|
| SelectField 数据不显示 | 未加 `_value` 后缀 | 加 `_value` 后缀 |
| DateField 报错 | 拆分为年月日 | 直接使用原始 fieldCode |
| SUM 聚合返回 0 | 字段是 TextField | 改为 NumberField 或用 COUNT |

详细字段配置规则请参考 [references/report-field-config-guide.md](references/report-field-config-guide.md)

---

## 六、筛选器配置

### 6.1 简化格式（推荐）

```json
{
  "type": "select",
  "label": "行业",
  "cubeCode": "FORM_XXX",
  "fieldCode": "selectField_xxx",
  "dataType": "STRING",
  "linkTo": [0, 1]
}
```

- `linkTo`：联动到哪些图表，按索引号指定；不指定则联动所有图表
- 筛选器会自动为 SelectField/RadioField 类型的字段生成

### 6.2 自动生成筛选器

如果配置中未指定 `filters`，系统会自动扫描所有图表的 xField/yField 中的 SelectField/RadioField 字段，自动生成下拉筛选器。

---

## 七、报表公式

报表公式与表单公式**完全不同**，不能混用！详细参考 [../formula-generator/references/04-report-formulas.md](../formula-generator/references/04-report-formulas.md)

### 7.1 核心差异

| 特性 | 表单公式 | 报表公式 |
|------|---------|---------|
| 条件判断 | `IF(条件,真值,假值)` | `CASEWHEN(条件,值,...)` |
| 文本拼接 | `CONCATENATE()` | `CONCAT()` |
| 为空判断 | `EQ(字段,"")` | `字段 IS NULL` |

### 7.2 报表聚合函数

| 函数 | 用法 | 说明 |
|------|------|------|
| `SUM` | `SUM(度量字段,条件,排除字段)` | 条件求和 |
| `AVG` | `AVG(度量字段,条件,排除字段)` | 条件求平均 |
| `COUNT` | `COUNT(度量字段,条件,排除字段)` | 条件计数 |
| `COUNTDISTINCT` | `COUNTDISTINCT(度量字段,条件,排除字段)` | 去重计数 |
| `MAX` | `MAX(度量字段,条件,排除字段)` | 最大值 |
| `MIN` | `MIN(度量字段,条件,排除字段)` | 最小值 |

---

## 八、报表数据查询API

- 端点：`POST /alibaba/web/{appType}/visual/visualizationDataRpc/getDataAsync.json`
- `prdId` 必须通过 `getFormNavigationListByOrder` 接口动态获取，不能硬编码
- 参数详表与获取代码见 [references/report-config-examples.md](references/report-config-examples.md)，完整 API 文档见 [references/report-api-guide.md](references/report-api-guide.md)

---

## 九、与其他Skill的配合

| Skill | 配合方式 |
|-------|---------|
| `config-sync` | 获取应用ID、表单UUID、字段ID |
| `get-schema` | 获取表单Schema，提取字段信息 |
| `dataset` | 创建视图表数据集，获取多表关联的cubeCode |
| `data-prep` | 创建数据准备数据集，获取ETL处理后的cubeCode |
| `formula-generator` | 生成报表公式（应用场景：报表公式） |
| `code-expert` | 生成自定义页面JS代码（ECharts报表） |
| `data-tester` | 测试报表数据是否正确 |

---

## 十、绝对禁止

- ❌ **禁止在报表配置中手动填写 measureCode**：报表引擎会自动查询视图表的 measureMapping 并将 columnName 转换为 measureCode（Step 2.5），配置文件中继续使用原始表单字段名即可
- ❌ **禁止编造 cubeCode**：cubeCode来源有两种——①从formUuid转换（连字符→下划线）；②从数据集获取（VIEW_xxx/PREP_xxx），必须从创建成功的数据集中获取，严禁编造
- ❌ **禁止前端聚合**：所有聚合统计必须通过报表API由服务端完成
- ❌ **禁止混用表单公式和报表公式**：两套函数体系完全不同
- ❌ **禁止忘记 _value 后缀**：SelectField/RadioField/MultiSelectField/CheckboxField 必须加
- ❌ **禁止拆分DateField**：日期字段直接使用原始fieldCode
- ❌ **禁止硬编码 prdId**：必须通过 getFormNavigationListByOrder 动态获取
- ❌ **禁止编造字段ID**：必须从表单Schema或数据集配置中获取真实字段ID
- ❌ **禁止只使用指标卡+表格**：每张报表至少3种不同图表类型，必须包含可视化图表
- ❌ **禁止同数据源拆分指标卡**：同一cubeCode的指标必须合并到1个指标卡
- ❌ **禁止配置文件存到temp-file**：必须保存到 `{应用名}/06数据报表/` 目录
- ❌ **禁止多表需求先用单表尝试**：涉及2个及以上表单时，必须先创建视图表，禁止先用 FORM_ cubeCode 创建单表报表再返工
- ❌ **禁止重复创建数据集**：多表场景必须先检查 `数据集配置.md`，复用已有可用 cubeCode
- ❌ **禁止创建v2/v3/v4等新版本配置文件**：验证失败时修改原配置文件重新创建，不创建新版本文件

---

## 十一、检查清单

### 创建报表前

- [ ] **🔴 已执行第0步前置检查：判断单表/多表场景**
- [ ] **🔴 多表场景：已检查 `数据集配置.md`，复用已有 cubeCode 或确认需要新建**
- [ ] **🔴 已检查 `06数据报表` 目录，确认不重复创建同名配置文件**
- [ ] 已确认数据源表单的 formUuid（从表单JSON或 config-sync 获取）
- [ ] **已确认数据源是主表/业务表，非关联表/子表（通过get-schema检查字段formula属性）**
- [ ] 已确认 cubeCode 是从 formUuid 转换而来（连字符→下划线），**非编造**
- [ ] 已获取表单Schema，提取了字段ID和类型
- [ ] **已确认指标卡设计：同一数据源的指标合并到1个指标卡，不同数据源才分多个指标卡**
- [ ] **已确认图表类型丰富：至少3种不同类型，包含可视化图表（饼图/柱状图/折线图等）**
- [ ] 已确认 SelectField/RadioField 加了 `_value` 后缀
- [ ] 已确认 DateField 未拆分
- [ ] 已设计好图表类型和布局

### 创建报表后

- [ ] CLI命令执行成功
- [ ] 报表ID（REPORT-xxx）已记录
- [ ] 访问链接已提供
- [ ] **🔴 Playwright验证通过：所有图表 getDataAsync 成功（如有失败，立即报错）**
- [ ] **配置文件已保存到 `{应用名}/06数据报表/` 目录（非temp-file）**
- [ ] 报表信息已更新到项目配置

---

## 十二、历史教训摘要

历史上曾因视图表 measureCode 未转换、筛选器字段转换遗漏、双入口文件未同步等 6 个问题导致"数据查询异常"，均已在报表引擎中根因修复（配置文件写原始字段名即可，引擎自动转换）。全量复盘与视图表报表完整正确流程见 [references/report-lessons-and-history.md](references/report-lessons-and-history.md)。
