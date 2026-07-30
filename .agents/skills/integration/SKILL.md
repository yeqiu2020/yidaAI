---
name: integration
description: 当用户说"集成自动化"、"创建自动化"、"逻辑流"、"创建逻辑流"、"自动化规则"、"表单触发"、"消息通知"、"连接器调用"、"新增数据节点"、"获取数据节点"、"发起审批"、"获取自身"时触发此skill。宜搭集成自动化（逻辑流）管理工具 - 通过API创建、修改、查询、启停集成自动化，支持表单事件触发、获取自身、获取单条/多条数据、新增数据、发起审批、连接器调用、消息通知等节点。
---

## 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **配置前必读「节点 componentName 权威对照表」（本文三·五）+ [references/node-playbook.md](references/node-playbook.md)（避坑清单/黄金配方/兜底路径）** — 所有节点 componentName / props 形状已从真实设计器引擎核实固化，禁止再凭空猜测节点名或 props 结构（猜错曾导致设计器白屏崩溃、保存报"转换xml失败"，白白浪费整天时间与费用）
2. **脚本(JavaScriptNode)/条件分支/循环容器：API 直建已回归验证（2026-07-28）** — 与更新数据/删除数据/子表新增一样均可由 `integration-create.js` 直建（3 条回归流保存成功 + 设计器回读通过，见「十、已知限制」）；仅并行分支仍需走设计器路径；Groovy 已 CLI 封装（离线断言通过，线上直建待回归）
3. **修改模式必须展示当前配置供确认** — 修改已有逻辑流时先展示当前配置
4. **🔴 配置数据节点前必须校验「目标表单类型」匹配** — 新增数据(AddDataNode)只能选普通表单(receipt)，发起审批(InitiateApprovalNode)只能选流程表单(process)。类型不对，设计器必报"表单不存在/无效表单"。create 脚本已内置 `assertFormType` 硬拦截，禁止绕过（详见 node-playbook.md 避坑清单第 9 条）

---

# Integration - 宜搭集成自动化工具

你是宜搭集成自动化（逻辑流）配置专家，通过 API 安全、高效地创建和管理宜搭平台的集成自动化规则。

## 参考文件索引（按需加载）

| 文件 | 何时加载 |
|------|----------|
| [references/node-playbook.md](references/node-playbook.md) | 配置数据节点/脚本/分支/循环前；遇到"白屏/转换xml失败/表单不存在/无效表单"报错；需要设计器 Playwright 兜底；查 API 接口/processJson·viewJson 结构/连接器预设/获取自身/发起审批详解 |
| [references/canonical-node-shapes.md](references/canonical-node-shapes.md) | 需要各节点 viewJson 完整原始形状 + processJson 序列化规则佐证时 |
| [references/cli-examples.md](references/cli-examples.md) | 组装复杂 CLI 参数（子表upsert/连接器/分支/循环等约 20 个完整示例）时 |
| [references/集成自动化硬规则.md](references/集成自动化硬规则.md) | 跨 AI 硬规则权威源（唯一可手改；改后运行 `node scripts/sync-hard-rules.js` 分发到 AGENTS.md/CLAUDE.md/.trae/.cursor） |
| [references/version-history.md](references/version-history.md) | 需要了解某能力何时引入/修复了什么时 |

## 一、核心能力

| 能力 | 说明 | 脚本 |
|------|------|------|
| **创建集成自动化** | 创建新的逻辑流，支持多种节点组合 | `integration-create.js` |
| **修改集成自动化** | 修改已有逻辑流的节点配置 | `integration-create.js --process-code` |
| **查询逻辑流列表** | 查询应用内所有逻辑流，支持筛选 | `integration-list.js list` |
| **启用/停用逻辑流** | 控制逻辑流的开关状态 | `integration-list.js enable/disable` |
| **检查运行日志** | 查询运行日志，排查异常；`--output` 可导出 Excel 报告 | `integration-check.js` |
| **回读逻辑流配置** | 回读并展示已有逻辑流的节点结构（修改前查看/排查） | `integration-get.js` |
| **体检逻辑流配置** | 审计任意已有逻辑流（含其他工具/AI 创建的）：占位符、空壳节点、空公式、断链 | `integration-validate.js` |

## 二、支持的节点类型

| 节点 | 类型标识 | 说明 |
|------|----------|------|
| **表单事件触发** | `trigger` | 触发器，支持 insert/update/delete/comment/processFinish/activityTask 六种事件 |
| **获取单条数据** | `dataRetrieve` | 按条件从表单获取单条数据，支持字段关联映射 |
| **获取多条数据** | `dataRetrieve` (multiple) | 按条件从表单获取多条数据，通过 quantity 控制条数 |
| **新增数据** | `dataCreate` | 向指定表单新增数据，支持字段赋值（引用触发表单字段、固定值、公式） |
| **更新数据** | `dataUpdate` | 直接更新目标表单数据，支持主表/子表更新；主条件定位主表记录、子条件逐行匹配子表行、公式累加赋值；`noneOperation=add` 即 upsert（API 直建已回归验证） |
| **删除数据** | `dataDelete` | 删除前置获取节点拿到的数据（主表或子表行），必须配合获取单条/多条节点使用（API 直建已回归验证） |
| **发起审批** | `initiateApproval` | 向流程表单发起一条审批，支持指定发起人和字段赋值 |
| **连接器调用** | `httpConnector`/`innerConnector` | 调用任意 HTTP/内置连接器，内置钉钉待办2.0预设，支持入参映射 |
| **消息通知** | `sendMessage` | 发送工作通知，支持标题/内容/按钮/接收人/表单字段引用 |
| **脚本(JS/Groovy)** | `CodeExecutor` | JavaScript 或 Groovy 脚本节点（`--script-lang js|groovy`），支持输出变量供后续节点引用（API 直建已回归验证） |
| **条件分支** | `route` + 子 `condition` | 条件容器+两分支（条件1/其他情况），命中分支走尾节点、默认分支直达结束形成真分流；支持多条件 + AND/OR（API 直建已回归验证） |
| **循环容器** | `foreach` | 遍历前置「获取多条数据」输出，循环体内嵌子节点（API 直建已回归验证） |
| **结束** | `finish` | 流程结束节点 |

### API 直建回归状态（2026-07-28）

| 节点 | componentName | CLI 参数 | 状态 |
|------|------|------|------|
| 脚本(JS) | `JavaScriptNode` | `--script-code` + `--script-output`（`--script-lang js`，默认） | ✅ API 直建已回归（回归E） |
| 脚本(Groovy) | `GroovyNode` | `--script-code` + `--script-lang groovy`（镜像 JS 兄弟节点） | ✅ CLI 已封装 + 离线断言通过（线上直建待回归） |
| 条件分支 | `ConditionContainer` + 子 `ConditionNode` | 单条件：`--branch-field/--branch-operator/--branch-value/--branch-field-name`；多条件：可重复 `--branch-condition` + `--branch-logic and|or` | ✅ API 直建已回归（回归F）；默认分支已修复为直达结束 |
| 并行分支 | `ConditionContainer`(type:parallel) + 子 `ParallelNode` | — | 设计器可用；API 直建待回归 |
| 循环容器 | `CycleContainer` | `--cycle`（需 `--data-query-type multiple` + 消息节点） | ✅ API 直建已回归（回归G，只能遍历「获取多条数据」输出） |

> 2026-07-30：view-builder 已与 process-builder/create.js 完成对齐重写（nodeIds 消费顺序、GroovyNode/JavaScriptNode、GetBatchDataNode、ConditionContainer+ConditionNode、CycleContainer、DeleteDataNode、InitiateApprovalNode、userFields 默认 form_inst_creator），离线断言 `integration-builder.test.js` 34 用例全绿，含 viewJson/processJson 节点 ID 一一对应校验。

### 节点执行顺序

```
trigger -> dataRetrieve -> addData -> initiateApproval -> [updateData] -> [deleteData] -> [script] -> connector -> [condition] -> [cycle] -> message -> end
```

> 带 `--cycle` 时消息节点作为循环体嵌入循环容器内部（不再是顶层节点）。

### 触发事件类型

| 事件名 | API值 | 说明 |
|--------|-------|------|
| create/insert | `insert` | 表单数据创建时触发 |
| update | `update` | 表单数据更新时触发 |
| delete | `delete` | 表单数据删除时触发 |
| comment | `comment` | 表单评论时触发 |
| processFinish | `processFinish` | 流程审批完成时触发（需指定审批动作） |
| activityTask | `activityTask` | 审批节点事件触发（需指定节点ID和审批动作） |

### 触发条件运算符

`Equal`(等于) / `NotEqual`(不等于) / `Contain`(包含) / `NotContain`(不包含) / `HasValue`(有值) / `NoValue`(没有值) / `GreaterThan`(大于) / `LessThan`(小于) / `GreaterThanOrEqual`(大于等于) / `LessThanOrEqual`(小于等于) / `In`(等于任意一个) / `NotIn`(不等于任意一个)

## 三·五、节点 componentName 权威对照表（全 16 面板节点 · 从公开 bundle 提取，零猜测）

> 权威来源 = 公开 CDN 引擎 bundle 里的运行时节点枚举(pb) + 面板材料(configure)。
> **任何 AI 可一行复现（无需登录）**：`node .agents/skills/integration/scripts/dump-node-catalog.js`
> 配置时直接照抄，不要再猜。完整默认 props 形状 + 分支容器 children 结构见 [references/canonical-node-shapes.md](references/canonical-node-shapes.md)；根因复盘 + 15 条避坑清单 + 黄金配方 + 设计器兜底见 [references/node-playbook.md](references/node-playbook.md)。

| # | 节点（中文） | componentName | props 顶层键(rulesKey) | setter |
|---|---|---|---|---|
| 1 | 新增数据 | `AddDataNode` | `addDataRules` | AddDataSetter |
| 2 | 更新数据 | `UpdateDataNode` | `updateDataRules` | UpdateDataSetter |
| 3 | 获取单条数据 | `GetSingleDataNode` | `getData`（+type:"single"） | GetDataSetter |
| 4 | 获取多条数据 | `GetBatchDataNode` | `getData`（+type:"batch"） | GetDataSetter |
| 5 | 删除数据 | `DeleteDataNode` | `deleteData`（⚠️非 Rules 后缀） | DeleteDataSetter |
| 6 | 连接流 | `AINode` | `workFlowRules`（type:aiFlow） | iframe 子编辑器 |
| 7 | 连接器 | `ConnectorNode` | `connectorRules` | ConnectorSetter |
| 8 | 消息通知 | `SendMessageNode` | `sendMessageRules` | SendMessageSetter |
| 9 | 发送邮件 | `SendEmailNode` | `sendEmailRules` | SendEmailSetter |
| 10 | 发送卡片 | `CardNode` | cardRules（运行时确认） | CardSetter |
| 11 | 更新卡片 | `CardUpdateNode` | cardRules（运行时确认） | CardSetter |
| 12 | 条件分支 | `ConditionContainer` + 子 `ConditionNode` | 容器`{name}`；子节点`conditions` | BranchSetter |
| 13 | 并行分支 | `ConditionContainer`（加`type:"parallel"`）+ 子 `ParallelNode` | 子节点`conditions` | BranchSetter(parallel) |
| 14 | 循环容器 | `CycleContainer` | `cycleContainerRules` | 需前置 GetBatchDataNode |
| 15 | 发起审批 | `InitiateApprovalNode` | `initiateApprovalRules` | InitiateApprovalSetter |
| 16 | 脚本 | `GroovyNode`(Groovy) / `JavaScriptNode`(JS) | `groovy` / `JavaScript`（内含 action.code） | GroovySetter / JavaScriptSetter |
| — | 根容器 | `CanvasEngine` | — | — |
| — | 表单事件触发 | `StartNode` | `start` | —（引擎自带首节点） |
| — | 结束 | `EndNode` | `name`(i18n) | —（引擎自带尾节点） |

> `CarbonNode/ApplyNode/ApprovalNode/OperatorNode` 是流程审批内部节点，不在面板里。

### 决定性避坑速查（详解 + 完整 15 条见 [node-playbook.md](references/node-playbook.md) 第 1 节，每条都曾导致崩溃/白屏/保存失败）

1. 脚本节点叫 `JavaScriptNode`（**不是** `ScriptNode`）；多条获取叫 `GetBatchDataNode`（**不是** `GetMultipleDataNode`，错名保存不报错但画布静默不渲染）。
2. `UpdateDataNode`/`AddDataNode` 的 viewJson props 是扁平的 `{name, nodeName, description, xxxRules}`，createNode 缺任意一项 → 画布白屏崩溃。
3. **🔴 processJson 的 `dataUpdate` props 必须扁平展开 updateDataRules**（与 viewJson 相反），嵌套或带 appType → 后端报「转换xml失败」。
4. **🔴 目标表单类型必须匹配节点 formTypes 白名单**：AddDataNode 只能 receipt（普通表单）、InitiateApprovalNode 只能 process（流程表单）；流程表单要新增记录必须用「发起审批」节点。`assertFormType` 已硬拦截，禁止绕过。
5. `CycleContainer` 只能遍历「获取多条数据」输出，**不能遍历触发子表行**——子表累加用 direct_form 子表更新（黄金配方见 node-playbook.md 第 2 节，含完整 updateDataRules JSON + 公式编码规则：跨表 `#{formUuid/fieldId}`、触发 `#{fieldId}`）。
6. 连接器：`currentStep` 必须为 2；人员/部门字段 literal 值必须是 `[{id,name}]` 数组；必填入参必须全部映射。

## 四、前置依赖

本 skill 依赖 `api-client` skill 提供的登录态管理和 HTTP 请求能力：

- **登录态管理**：`api-client/scripts/login_manager.js`
- **HTTP 请求**：`api-client/scripts/api_client.js`

使用前需确保已完成登录（`.cookies.json` 存在且有效）。

## 五、文件结构

```
integration/
├── SKILL.md                                    # 本文档
├── references/                                 # 渐进式披露参考文件（见索引表）
├── scripts/
│   ├── integration-node-ids.js                 # 节点ID生成工具
│   ├── integration-api.js                      # 宜搭API调用封装
│   ├── integration-process-builder.js          # processJson构建器（执行引擎）
│   ├── integration-view-builder.js             # viewJson构建器（画布渲染）
│   ├── connector-presets.js                    # 连接器预设管理
│   ├── integration-create.js                   # 创建/修改集成自动化
│   ├── integration-list.js                     # 查询/启停逻辑流
│   ├── integration-check.js                    # 运行日志检查（支持 --output 导出 Excel）
│   ├── integration-get.js                      # 回读逻辑流节点结构
│   ├── integration-validate.js                 # 保存前体检门禁 + 已有流审计 CLI
│   ├── dump-node-catalog.js                    # 从公开 bundle 提取全 16 节点权威定义
│   ├── integration-builder.test.js             # 离线断言测试（node 直接运行）
│   └── connector-presets/
│       ├── todo-create-task-inputs.json        # 钉钉待办-创建任务入参
│       └── todo-create-task-outputs.json       # 钉钉待办-创建任务出参
```

## 六、使用方式

### 1. 创建/修改集成自动化

```bash
node .agents/skills/integration/scripts/integration-create.js <appType> <formUuid> <flowName> [选项]
```

**代表性示例**（约 20 个完整示例见 [references/cli-examples.md](references/cli-examples.md)）：

```bash
# 消息通知（最简）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "新数据通知" \
  --events insert --receivers "user001,user002" --title "有新数据提交" --content "请及时查看"

# 子表更新 + upsert（主条件定位主表、子条件逐行匹配子表、公式累加，未命中则新增）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "子表upsert" \
  --events insert \
  --update-form-uuid FORM-ZZZ \
  --update-sub-source-id tableField_sub \
  --update-condition "textField_main:主表匹配字段:textField_trig" \
  --update-sub-condition "selectField_col:子表匹配列:textField_trig2" \
  --update-assignment "numberField_qty:column:#{FORM-ZZZ/numberField_qty}+#{numberField_src}" \
  --update-none-operation add

# 修改已有逻辑流（传入 --process-code）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "修改流程" \
  --process-code LPROC-XXX --events insert --receivers "user001"
```

**参数说明：**

| 参数 | 说明 | 必填 |
|------|------|------|
| `<appType>` | 应用ID | 是 |
| `<formUuid>` | 触发表单UUID | 是 |
| `<flowName>` | 逻辑流名称 | 是 |
| `--process-code` | 已有逻辑流的processCode（修改模式） | 否 |
| `--events` | 触发事件（逗号分隔）：insert,update,delete,comment,processFinish,activityTask | 否（默认insert） |
| `--receivers` | 消息通知接收人userId（逗号分隔） | 否 |
| `--user-fields` | 消息通知接收人字段ID（逗号分隔，如form_inst_creator） | 否 |
| `--title` | 消息通知标题 | 否 |
| `--content` | 消息通知内容 | 否 |
| `--trigger-condition` | 触发条件（可多次）：fieldId:fieldName:opCode:value[:componentType[:valueType]] | 否 |
| `--trigger-logic and\|or` | 触发器多条件的逻辑关系，默认 `and` | 否 |
| `--trigger-recursively` | 允许自动触发（递归触发） | 否 |
| `--approval-actions` | 审批动作（逗号分隔）：agree,disagree,terminated | 审批事件时必填 |
| `--approval-node-ids` | 审批节点ID（逗号分隔） | activityTask事件时必填 |
| `--get-self` | 自动插入获取自身节点 | 否 |
| `--get-self-field` | 覆盖触发事件系统字段（默认__masterdata_form_inst_id） | 否 |
| `--get-self-query-field` | 覆盖查询系统字段（默认pid） | 否 |
| `--data-form-uuid` | 获取数据目标表单UUID | 否 |
| `--data-condition` | 获取数据过滤条件（可多次）：bFieldId:bFieldName:aFieldId[:componentType[:opCode[:valueType]]] | 否 |
| `--data-query-type` | 获取数据查询类型：single(默认)/multiple | 否 |
| `--data-quantity` | 多条数据时获取数量（默认100） | 否 |
| `--add-data-form-uuid` | 新增数据目标表单UUID | 否 |
| `--add-data-assignment` | 新增数据字段赋值（可多次）：目标字段ID:valueType:value | 否 |
| `--add-data-insert-type` | 新增方式：form(默认,表单中新增)/sub_table(在子表中新增) | 否 |
| `--add-data-sub-form-uuid` | 子表新增时目标子表字段ID（tableField_xxx） | sub_table时必填 |
| `--add-data-type` | 新增条数：single(默认)/batch(新增多条) | 否 |
| `--add-data-source-id` | batch时数据源：触发子表字段ID，或 `get`（自动解析为前置获取多条节点） | batch时必填 |
| `--initiate-approval-form-uuid` | 发起审批目标流程表单UUID | 否 |
| `--initiate-approval-initiator-user` | 发起审批的发起人 userId[:name] | 发起审批时必填 |
| `--initiate-approval-assignment` | 发起审批字段赋值（可多次） | 否 |
| `--connector-id` | 连接器ID | 否（需与--action-id同时使用） |
| `--action-id` | 连接器动作ID | 否 |
| `--connector-name` | 连接器显示名称 | 否 |
| `--connector-display-name` | 连接器展示名称（画布和配置面板显示） | 否 |
| `--connector-mode` | 连接器类型（HTTP=5，默认自动推断） | 否 |
| `--connection-id` | HTTP连接器鉴权连接ID | 否 |
| `--connector-icon` | 连接器图标URL | 否 |
| `--connector-inputs` | 连接器完整入参schema JSON文件路径 | 否 |
| `--connector-assignment` | 连接器入参映射（可多次）：column:valueType:value | 否 |
| `--update-form-uuid` | 更新数据目标表单UUID | 否 |
| `--update-condition` | 更新数据主条件（可多次，定位主表记录） | 否 |
| `--update-assignment` | 更新数据字段赋值（可多次，valueType=column 为公式累加） | 否 |
| `--update-type` | 更新模式：direct_form(默认,直接更新)/node(按前置获取节点更新) | 否 |
| `--update-sub-source-id` | 更新子表时目标子表字段ID（tableField_xxx） | 否 |
| `--update-sub-condition` | 子表更新时子条件（可多次，引擎逐行匹配；不传则每行都命中） | 建议必填 |
| `--update-none-operation` | 未匹配到数据时：ignored(默认,跳过)/add(新增一条=**upsert**) | 否 |
| `--delete-data` | 添加删除数据节点（删除前置获取节点的数据，需配合 `--data-form-uuid` 或 `--get-self`） | 否 |
| `--delete-sub-source-id` | 只删子表行时的目标子表字段ID（不传则删整条主表记录） | 否 |
| `--script-code` | 脚本节点(JavaScriptNode)代码内容（API 直建已回归） | 否 |
| `--script-lang js\|groovy` | 脚本节点语言，默认 `js`（JavaScriptNode），`groovy` 生成 GroovyNode | 否 |
| `--script-output` | 脚本输出变量（可多次）：`var:type[:desc]`，type=Text/Number/Array/Object/Boolean；引擎变量名自动拼为 `<节点id>_<var>` | 否 |
| `--branch-field` | 条件分支(ConditionContainer)字段ID（API 直建已回归） | 否 |
| `--branch-operator` | 条件分支运算符（Equal/NotEqual/Contain 等） | 否 |
| `--branch-value` | 条件分支比较值 | 否 |
| `--branch-field-name` | 条件分支字段中文名（面板回显用） | 否 |
| `--branch-condition` | 条件分支的单条条件，可重复以组合多条件：fieldId:fieldName:opCode:value[:componentType[:valueType]] | 否 |
| `--branch-logic and\|or` | 多条件分支的逻辑关系，默认 `and` | 否 |
| `--cycle` | 循环容器(CycleContainer)：需 `--data-query-type multiple` + 消息节点（作为循环体）（API 直建已回归） | 否 |
| `--publish` | 创建后直接发布 | 否 |

**字段赋值 valueType 说明（⚠️ valueType 是值类型枚举 token，不是数据值，严禁把 token 本身写进值槽位）：**

| valueType | 说明 | value格式 |
|-----------|------|-----------|
| `processVar` | 引用触发表单字段 | 表单字段ID（如 textField_xxx 的真实字段ID） |
| `literal` | 固定值 | 字面量（如 "已完成"、100 的真实业务值） |
| `column` | 公式 | 公式表达式（跨表 `#{formUuid/fieldId}`、触发字段 `#{fieldId}`） |

### 2. 其他子命令（完整选项示例见 [references/cli-examples.md](references/cli-examples.md)）

```bash
# 查询逻辑流列表（--key 关键字 / --form-uuid 表单 / --status y|n / --json）
node .agents/skills/integration/scripts/integration-list.js list <appType> [选项]

# 启用 / 停用
node .agents/skills/integration/scripts/integration-list.js enable|disable <appType> <formUuid> <processCode>

# 检查运行日志（--status exception|success|running，默认exception；--output report.xlsx 导出Excel；可多应用批量）
node .agents/skills/integration/scripts/integration-check.js <appType> [选项]

# 回读逻辑流配置（节点树展示；--json 完整JSON；--raw 原始返回）
node .agents/skills/integration/scripts/integration-get.js <appType> <processCode> [选项]

# 体检逻辑流（线上流有错误时退出码1；--file 体检本地 processJson）
node .agents/skills/integration/scripts/integration-validate.js <appType> <processCode>
```

### 3. 保存前体检门禁与已有流审计（integration-validate.js）

> 背景：saveProcess 接口对节点 props 完整性几乎不校验，任何工具产出的半成品（空壳节点、
> 占位符字面量、空公式、数据流断链）都能"保存成功"。**保存成功 ≠ 配置正确**。

- **门禁模式（自动）**：`integration-create.js` 保存前自动体检，有 [ERROR] 直接拒绝保存并输出
  `code: VALIDATION_FAILED` + 逐条问题；仅当用户明确批准时可加 `--force-save` 跳过。
- **审计模式（手动）**：体检任意已有逻辑流（包括其他 AI/人工在设计器创建的）。

**检查项与错误码：**

| 错误码 | 级别 | 含义 |
|--------|------|------|
| `RETRIEVE_EMPTY_SOURCE` | ERROR | 获取数据节点未选表单（空壳节点） |
| `RETRIEVE_EMPTY_CONDITION` | ERROR(单条)/WARN(多条) | 获取节点无过滤条件 |
| `PLACEHOLDER_LITERAL` | ERROR | 字面量值是序列化保留 token（如 `processVar`）/字段ID形态/未解析模板/占位符 |
| `FORMULA_EMPTY` | ERROR | 赋值规则值类型为公式但公式内容为空 |
| `CONDITION_EMPTY_VALUE` | ERROR | 条件比较值为空（为空/不为空类操作符除外） |
| `UPDATE_EMPTY_CONDITION` / `UPDATE_EMPTY_ASSIGNMENTS` | ERROR | 直接更新无匹配条件 / 无更新规则 |
| `CREATE_EMPTY_SOURCE` / `CREATE_EMPTY_ASSIGNMENTS` | ERROR | 新增节点未选表单 / 无字段赋值 |
| `SCRIPT_EMPTY_CODE` | ERROR | 脚本节点代码为空 |
| `CONDITION_EMPTY_RULES` | ERROR | 条件分支无判断条件 |
| `MESSAGE_EMPTY_RECEIVER` | ERROR | 消息通知无接收人 |
| `FIELD_NOT_IN_SCHEMA` | ERROR | 引用的字段不在目标表单 Schema（create.js 门禁自动带 Schema 校验） |
| `RETRIEVE_DANGLING` | WARN | 获取节点输出无任何下游引用（数据流断链） |

> 跨 AI 硬规则权威源：`references/集成自动化硬规则.md`（工具无关，唯一可手改），
> 运行 `node scripts/sync-hard-rules.js` 分发到 `.trae/rules`（Trae）、`.cursor/rules`（Cursor）、
> `AGENTS.md`（Codex/Zed 等通用标准）、`CLAUDE.md`（Claude Code）；公共入口见 `.agents/skills/通用硬规则.md` 第 6 条。

## 七、执行流程

### 创建集成自动化

1. **确认操作目标**：询问用户需要创建什么类型的自动化
2. **获取应用和表单信息**：从系统配置清单或用户输入获取 appType、formUuid（严禁编造/占位符）
3. **确定节点组合**：根据需求确定需要哪些节点（触发器 + 数据操作 + 连接器 + 消息通知）；数据节点先核对目标表单类型（专属硬规则 4）
4. **构建参数**：组装命令行参数
5. **执行创建**：调用 `integration-create.js`
6. **验证结果**：检查输出中的 processCode 和 success 状态，再用 `integration-get.js` 回读 + `integration-validate.js` 体检闭环

### 修改集成自动化

1. **查询现有逻辑流**：使用 `integration-list.js list` 获取 processCode
2. **确认修改内容**：先用 `integration-get.js` 回读展示当前配置，与用户确认要修改的节点和配置
3. **执行修改**：使用 `--process-code` 参数调用 `integration-create.js`
4. **验证结果**：检查输出确认修改成功

## 八、获取自身节点（`--get-self`）

在触发节点和后续节点之间自动插入「获取单条数据」节点：来源表单=当前触发表单，查询字段 `pid`（`--get-self-query-field` 覆盖），触发字段 `__masterdata_form_inst_id`（`--get-self-field` 覆盖），匹配方式=等于。
适用场景：流水号为空（触发 payload 不是最新值）、定时自动化历史数据、需要最新值时先获取自身再引用。详见 [node-playbook.md](references/node-playbook.md) 第 6 节。

## 九、发起审批节点

- 目标表单必须是流程表单（formType=process），普通表单请使用 `--add-data-form-uuid`
- `--initiate-approval-initiator-user` 必须提供，格式为 `userId[:name]`
- 字段赋值格式与 `--add-data-assignment` 相同；完整示例见 [cli-examples.md](references/cli-examples.md)，详解见 [node-playbook.md](references/node-playbook.md) 第 7 节

连接器预设（钉钉待办 connectorId/actionId + 6 项必填入参表）见 [node-playbook.md](references/node-playbook.md) 第 5 节；API 接口 + processJson/viewJson 结构见第 4 节。

## 十、已知限制

1. **更新/删除/子表新增节点 API 直建已全部回归验证（2026-07-28）**：四大类场景 × insert/update/delete/upsert 共 7 条真实逻辑流保存成功且设计器回读完整。关键：processJson 的 dataUpdate 必须扁平展开、viewJson 多条获取组件名必须是 GetBatchDataNode（避坑清单 10/11 条）。
2. **脚本节点 API 直建已回归（回归E）**：componentName=`JavaScriptNode`，processJson type=`CodeExecutor`；输出变量名=`<节点id>_<var>`。Groovy 已 CLI 封装且离线断言通过（GroovyNode + props.groovy），线上直建待回归。
3. **条件分支 API 直建已回归（回归F）**：route 容器+两 condition 子分支；分支子节点 ID 必须 processJson/viewJson 一致（create.js 统一生成）。并行分支/多分支仍待回归。
4. **循环容器 API 直建已回归（回归G）**：只能遍历「获取多条数据」输出，循环体不能为空（CLI 强制要求消息节点）。
5. **连接器预设有限**：仅内置钉钉待办预设，其他连接器需传入 `--connector-inputs`。
6. **组合场景测试已全部通过（2026-07-28）**：4 个复杂场景 API 直建均成功 + 设计器保存均通过（ConnectorNode currentStep、EmployeeField literal 数组、连接器必填入参，详见 node-playbook.md 避坑清单 13-15 条）。

> 3 条回归流：LPROC-N7C6...SMP5 / LPROC-9K96...SM24 / LPROC-3Y86...SME4，均保存成功+设计器面板回读正常；仅并行分支/Groovy/复杂拓扑需走设计器路径（见 node-playbook.md 第 3 节）。

## 十二、禁止事项

- 禁止在无登录态时执行操作（需先通过 `api-client` 登录）
- 禁止硬编码 Cookie 和 Token
- 禁止在修改模式下省略 `--process-code` 参数
- 禁止在审批事件触发时省略 `--approval-actions` 参数
- 禁止在 activityTask 事件时省略 `--approval-node-ids` 参数
- 禁止在发起审批时省略 `--initiate-approval-initiator-user` 参数
- 禁止手写 processJson/viewJson、直接调 saveProcess.json、用浏览器拖节点拼流程（AGENTS.md 硬规则 1）

## 检查清单

### 执行前确认
- [ ] 确认登录态有效（Cookie未过期）
- [ ] 确认应用ID和表单UUID从系统配置清单.md读取真实值，严禁占位符
- [ ] 确认已识别节点类型（componentName 照三·五对照表，不猜测）
- [ ] 确认数据节点目标表单类型匹配（AddData→receipt、InitiateApproval→process）
- [ ] 确认修改模式下已展示当前配置供用户确认

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认保存前体检通过（无 [ERROR]）；若用了 `--force-save` 必须是用户明确批准
- [ ] 确认已用 `integration-get.js` 回读 + `integration-validate.js` 体检闭环（保存成功 ≠ 配置正确）
- [ ] 确认创建/修改后逻辑流已发布（非草稿状态）
- [ ] 确认最终回复已按下方「交付回报契约」向用户完整回报，用户无需追问即可定位产物并看到验证结果

### 交付回报契约（完成标准）

每次创建/修改逻辑流后，最终回复必须向用户回报以下内容，缺一不算交付完成（本契约只约束回复内容，不改变任何脚本行为）：

1. **目标应用**：应用名称 + appType（如 `进销存系统 / APP_XXXXXX`）
2. **processCode**：本次创建/修改的逻辑流 processCode
3. **设计器访问入口**：该逻辑流在宜搭设计器中的访问路径（应用 → 集成&自动化 → 对应逻辑流），有可用链接时给出链接
4. **回读结果摘要**：`integration-get.js` 回读的节点树摘要（节点数、类型、串联是否与预期一致）
5. **体检结果摘要**：`integration-validate.js` 的体检结论（通过 / [ERROR]·[WARN] 条数及处理情况）

---

## 版本历史

当前版本 **v2.5.0 (2026-07-29)**：保存前体检门禁 + 已有流审计 + 跨 AI 硬规则分发。完整版本历史（v2.5.0 ~ v1.0.0）见 [references/version-history.md](references/version-history.md)。
