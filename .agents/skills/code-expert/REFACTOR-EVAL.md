# code-expert Skill 重构评估文档

> 评估日期: 2026-07-24
> 评估背景: 直播演示"采购订单填充入库明细"功能时连续翻车，暴露出SKILL在跨表查询场景的文档和模板存在系统性缺陷
> 评估目的: 输出重构方案供团队评审，确保下次同类场景一次通过

---

## 一、问题回顾：直播翻车的5个错误

| # | 错误现象 | 直接原因 | SKILL根因 |
|---|---------|---------|----------|
| 1 | 子表数据为空 | 只调了getFormDataById，没有单独调子表API | 文档未明确"getFormDataById不返回子表" |
| 2 | checkApiSuccess误判成功为失败 | getFormDataById返回扁平对象{serialNo,...}，无success字段 | 文档未区分各API的返回结构差异 |
| 3 | 关联字段读到undefined | listTableData子表API关联字段key带_id后缀 | 文档未强调子表API字段命名规则 |
| 4 | 代码编译报错 | 函数缺闭合大括号} | 自检步骤无"语法完整性"检查项 |
| 5 | 子表数据解析失败 | listTableData的data在顶层，通用兼容逻辑导致result变成数组 | 文档未文档化listTableData的特殊返回结构 |

**根因总结**: SKILL文档把所有API的返回结构当作"同一种模式"处理，实际上6个常用API的返回结构各不相同。

---

## 二、核心问题：跨表查询场景没有按"需要什么数据"来分类

### 当前SKILL的混乱点

跨表查询时，**到底需要配几个数据源、调几个API**，取决于你要获取什么数据。但当前SKILL没有按场景划分，所有信息混在一起：

| 你要做什么 | 需要的API | 需要的数据源 | 当前文档在哪 |
|-----------|----------|------------|------------|
| 只查目标表单的主表字段 | searchFormDatas | 1个 | cross-form-query.md |
| 按ID查目标表单的主表字段 | getFormDataById | 1个 | cross-form-query.md（但没写返回结构） |
| 查目标表单的主表+子表 | getFormDataById + listTableData | 2个 | **分散在3个文件，没有组合说明** |
| 只查目标表单的子表 | listTableData | 1个 | cross-form-query.md（但没写返回结构） |
| 查完还要写回/更新目标表单 | 上面任一 + saveFormData/updateFormData | 2-3个 | 分散在2个文件 |

**这就是直播翻车的根本原因** — 我需要"查主表+子表"，但SKILL没有告诉我这个场景需要2个API、2个数据源，以及每个API返回什么结构。

---

## 三、重构方案：按场景分层组织

### 3.1 场景分类体系

将跨表查询按"数据需求"分为4个场景，每个场景有独立的数据源配置模板和代码模板：

```
跨表查询
├── 场景A: 仅查主表列表（searchFormDatas）
│   用途: 查询满足条件的记录，获取主表字段
│   数据源: 1个（searchFormDatas）
│   返回: {success, result:{data:[{formData:{...}},...]}}
│
├── 场景B: 按ID查主表详情（getFormDataById）
│   用途: 已知实例ID，查询该记录的主表信息
│   ⚠️ 不返回子表数据！子表字段不在返回值中！
│   数据源: 1个（getFormDataById）
│   返回: {serialNo, instValue, creator, ...}（扁平对象，无success字段）
│
├── 场景C: 查主表+子表（getFormDataById + listTableData）⭐ 最常见
│   用途: 查询完整记录（主表字段+子表明细），用于填充当前表单子表
│   数据源: 2个（getFormDataById + listTableData）
│   ⚠️ 必须调2个API！getFormDataById不返回子表！
│   ⚠️ 关联字段key带_id后缀！
│
└── 场景D: 只查子表（listTableData）
    用途: 已知实例ID，只需子表数据
    数据源: 1个（listTableData）
    返回: {data:[...], totalCount, currentPage}（data在顶层）
    ⚠️ 关联字段key带_id后缀！
```

### 3.2 每个场景需要文档化的内容

| 文档化内容 | 场景A | 场景B | 场景C | 场景D |
|-----------|-------|-------|-------|-------|
| 数据源配置 | 1个 | 1个 | 2个 | 1个 |
| API请求参数 | formUuid, searchFieldJson | formInstId, formUuid | (B+D的组合) | formUuid, formInstanceId, tableFieldId |
| API返回结构 | ✅已有 | ❌缺失→已补充 | ❌缺失→已补充 | ❌缺失→已补充 |
| 成功判断方式 | checkApiSuccess | res.serialNo | (B+D组合) | res.data是数组 |
| 数据提取方式 | res.result.data | res.serialNo, res.instValue | 主表:res.serialNo 子表:res.data | res.data |
| 字段命名规则 | formData内标准命名 | instValue需解析JSON | 子表关联字段带_id后缀 | 关联字段带_id后缀 |
| 代码模板 | ✅已有(通用模板) | ❌缺失 | ❌缺失 | ❌缺失 |

---

## 四、具体重构事项清单

### 第一优先级：补场景C专用模板（影响面最大）

**事项4.1**: 新增 `assets/templates/cross-form-query-template.js`

这是最常见也最容易出错的场景。专用模板应包含：
- `fetchMainForm()` — 调用 getFormDataById，用 res.serialNo 判断成功
- `fetchSubTable()` — 调用 listTableData，从 res.data 取数据，支持分页
- `getAssociationValue()` — 安全读取关联字段（优先_id后缀）
- `buildSubTableRows()` — 将源子表数据映射到目标子表格式
- `onSourceFieldChange()` — 完整的 onChange 事件处理示例
- CONFIG 模板 — 包含2个数据源配置、源表和目标表字段映射

**预期效果**: 下次做"选关联表单→填充子表"场景时，直接套模板，不需要从零拼凑。

---

### 第二优先级：更新现有模板和工具函数

**事项4.2**: 更新 `assets/templates/api-response-utils.js`

当前版本(v1.0.0)的问题：
- checkApiSuccess 注释说"统一处理所有API"，但实际上不适用于 getFormDataById
- 缺少 getAssociationValue 函数
- 缺少 getFormDataById 的专用判断逻辑
- 缺少 listTableData 的专用数据提取逻辑

更新内容：
- checkApiSuccess 增加注释"不适用于getFormDataById"
- 新增 getAssociationValue 函数
- 新增 extractFormDataByIdResult(res) 函数 — 专门处理getFormDataById返回
- 新增 extractListTableDataResult(res) 函数 — 专门处理listTableData返回
- 新增 callDataSourceWithCheck(dataSourceName, params, apiType, onSuccess, onError, context) — apiType参数指定API类型，内部自动选择正确的判断逻辑

---

### 第三优先级：新增快速导航入口

**事项4.3**: 新增 `references/00-index.md`

一页纸快速导航，包含：
- 场景选择决策树（你做A→用场景X→读文档Y→用模板Z）
- API返回格式速查表（6个API一行一个）
- 最常见错误速查表（错误现象→原因→修复→参考案例编号）
- 必读文档优先级排序

---

### 第四优先级：整合分散信息

**事项4.4**: 更新 `references/common-core/api-reference.md`

当前 api-reference.md 可能只文档了请求参数，需要补充每个API的**实际返回结构**。
避免与 cross-form-query.md 重复，api-reference.md 只需一行描述+指向cross-form-query.md的链接。

**事项4.5**: 更新 `references/form-actions/cross-form-query.md`

刚才已经在1.0-1.3节补充了API返回结构，但需要进一步按场景C组织，增加"场景C完整实现模板"章节，把主表查询+子表查询+数据映射+子表填充的完整流程写成一个连贯的示例。

---

### 第五优先级：SKILL.md 工作流更新

**事项4.6**: 更新 `SKILL.md` 的核心工作流

在"第五步：代码生成"中增加子步骤：
- 5a. 识别跨表查询场景类型（A/B/C/D）
- 5b. 根据场景选择对应模板
- 5c. 确认数据源数量和配置

在"第六步：自我审查"中增加API响应结构检查项（已部分完成，需补充场景选择检查）。

---

## 五、重构优先级和预期效果

| 优先级 | 事项 | 工作量 | 预期效果 |
|-------|------|-------|---------|
| P0 | 4.1 新增跨表查询场景C专用模板 | 中 | **场景C一次通过率从0%提升到80%+** |
| P0 | 4.2 更新api-response-utils.js | 小 | 所有场景的API判断逻辑统一且正确 |
| P1 | 4.3 新增00-index.md快速导航 | 小 | 模型不需要读5个文件，1页导航直达 |
| P1 | 4.5 cross-form-query.md按场景重组 | 中 | 信息不再混乱，按场景找对应章节 |
| P2 | 4.4 api-reference.md补充返回结构 | 小 | 消除文档盲区 |
| P2 | 4.6 SKILL.md工作流更新 | 小 | 生成前先选场景，避免盲目套模板 |

---

## 六、风险评估

| 风险 | 说明 | 缓解措施 |
|------|------|---------|
| 文档膨胀 | 新增模板和文档导致SKILL总体积过大 | 00-index.md做导航，模型只读需要的部分 |
| 信息重复 | 场景C在模板和cross-form-query.md中都有 | 模板是可执行代码，文档是知识说明，各有侧重 |
| 维护成本 | 多个文件需要同步更新 | 版本号统一管理，修改任一文件需检查关联文件 |

---

## 七、建议执行顺序

```
第1步: 4.2 更新 api-response-utils.js（基础工具函数，后续模板依赖它）
第2步: 4.1 新增 cross-form-query-template.js（场景C专用模板，影响最大）
第3步: 4.3 新增 00-index.md（快速导航，降低信息查找成本）
第4步: 4.5 更新 cross-form-query.md（按场景重组，补充场景C完整示例）
第5步: 4.4 更新 api-reference.md（补充返回结构）
第6步: 4.6 更新 SKILL.md（工作流增加场景选择步骤）
```

---

*文档版本: v1.0.0*
*创建日期: 2026-07-24*
