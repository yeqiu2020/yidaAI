---
name: integration
description: 当用户说"集成自动化"、"创建自动化"、"逻辑流"、"创建逻辑流"、"自动化规则"、"表单触发"、"消息通知"、"连接器调用"、"新增数据节点"、"获取数据节点"时触发此skill。宜搭集成自动化（逻辑流）管理工具 - 通过API创建、修改、查询、启停集成自动化，支持表单事件触发、新增数据、获取单条数据、连接器调用、消息通知等节点。
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则
1. **禁止通过API修改已有应用的表单字段内容** — 公式、代码、字段增删改只能复制粘贴（规则25）
2. **应用ID和表单UUID必须填真实值** — 从系统配置清单.md读取，严禁占位符（规则24）
3. **写入文件前必须校验** — 运行 `node scripts/ai-validator.js check-before-write <文件路径>` 确认不覆盖已有文件
4. **写入文件后必须校验** — 运行 `node scripts/ai-validator.js check-after-write <文件路径>` 确认内容合规
5. **Cookie必须使用根目录** — 严禁 process.cwd()，必须用 PROJECT_ROOT（规则26）

### 专属硬规则
1. **不支持脚本节点/更新数据/条件分支** — 当前仅支持6种节点类型
2. **修改模式必须展示当前配置供确认** — 修改已有逻辑流时先展示当前配置

---

# Integration - 宜搭集成自动化工具

## 一、角色定义

你是宜搭集成自动化（逻辑流）配置专家，专门负责通过 API 创建和管理宜搭平台的集成自动化规则。你熟悉宜搭平台的逻辑流设计 API 接口，能够安全、高效地创建和管理集成自动化。

## 二、核心能力

| 能力 | 说明 | 脚本 |
|------|------|------|
| **创建集成自动化** | 创建新的逻辑流，支持多种节点组合 | `integration-create.js` |
| **修改集成自动化** | 修改已有逻辑流的节点配置 | `integration-create.js --process-code` |
| **查询逻辑流列表** | 查询应用内所有逻辑流，支持筛选 | `integration-list.js list` |
| **启用/停用逻辑流** | 控制逻辑流的开关状态 | `integration-list.js enable/disable` |
| **检查运行日志** | 查询逻辑流运行日志，排查异常 | `integration-check.js` |

## 三、支持的节点类型

| 节点 | 类型标识 | 说明 |
|------|----------|------|
| **表单事件触发** | `StartNode` | 触发器，支持 insert/update/delete/comment/processFinish/activityTask 六种事件 |
| **新增数据** | `AddDataNode` | 向指定表单新增数据，支持字段赋值（引用触发表单字段、固定值、公式） |
| **获取单条数据** | `GetSingleDataNode` | 按条件从表单获取单条数据，支持字段关联映射 |
| **连接器调用** | `ConnectorNode` | 调用任意 HTTP 连接器，内置钉钉待办2.0预设，支持入参映射 |
| **消息通知** | `SendMessageNode` | 发送工作通知，支持标题/内容/按钮/接收人/表单字段引用 |
| **结束** | `EndNode` | 流程结束节点 |

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

| 运算符 | opCode | 说明 |
|--------|--------|------|
| 等于 | `Equal` | 字段值等于指定值 |
| 不等于 | `NotEqual` | 字段值不等于指定值 |
| 包含 | `Contain` | 字段值包含指定值 |
| 不包含 | `NotContain` | 字段值不包含指定值 |
| 有值 | `HasValue` | 字段有值 |
| 没有值 | `NoValue` | 字段没有值 |
| 大于 | `GreaterThan` | 字段值大于指定值 |
| 小于 | `LessThan` | 字段值小于指定值 |
| 大于等于 | `GreaterThanOrEqual` | 字段值大于等于指定值 |
| 小于等于 | `LessThanOrEqual` | 字段值小于等于指定值 |
| 等于任意一个 | `In` | 字段值等于列表中任意一个 |
| 不等于任意一个 | `NotIn` | 字段值不等于列表中任意一个 |

## 四、前置依赖

本 skill 依赖 `yida-api-client` skill 提供的登录态管理和 HTTP 请求能力：

- **登录态管理**：`yida-api-client/scripts/login_manager.js`
- **HTTP 请求**：`yida-api-client/scripts/api_client.js`

使用前需确保已完成登录（`.cookies.json` 存在且有效）。

## 五、文件结构

```
integration/
├── SKILL.md                                    # 本文档
├── scripts/
│   ├── integration-node-ids.js                 # 节点ID生成工具
│   ├── integration-api.js                      # 宜搭API调用封装
│   ├── integration-process-builder.js          # processJson构建器（执行引擎）
│   ├── integration-view-builder.js             # viewJson构建器（画布渲染）
│   ├── connector-presets.js                    # 连接器预设管理
│   ├── integration-create.js                   # 创建/修改集成自动化
│   ├── integration-list.js                     # 查询/启停逻辑流
│   ├── integration-check.js                    # 运行日志检查
│   └── connector-presets/
│       ├── todo-create-task-inputs.json        # 钉钉待办-创建任务入参
│       └── todo-create-task-outputs.json       # 钉钉待办-创建任务出参
```

## 六、使用方式

### 1. 创建集成自动化

```bash
node .agents/skills/integration/scripts/integration-create.js <appType> <formUuid> <flowName> [选项]
```

**基本示例：**

```bash
# 创建简单的消息通知自动化（数据创建时通知指定用户）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "新数据通知" \
  --events insert \
  --receivers "user001,user002" \
  --title "有新数据提交" \
  --content "请及时查看"

# 创建带新增数据节点的自动化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "同步数据" \
  --events insert \
  --add-data-form-uuid FORM-YYY \
  --add-data-assignment "textField_xxx:processVar:textField_aaa" \
  --add-data-assignment "textField_yyy:literal:固定值"

# 创建带获取单条数据节点的自动化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "关联查询" \
  --events insert \
  --data-form-uuid FORM-ZZZ \
  --data-condition "textField_bbb:关联字段名:textField_aaa:TextField"

# 创建带获取多条数据节点的自动化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "查询多条" \
  --events insert \
  --data-form-uuid FORM-ZZZ \
  --data-query-type multiple \
  --data-quantity 50 \
  --data-condition "textField_bbb:关联字段名:textField_aaa:TextField"

# 创建带连接器调用节点的自动化（钉钉待办）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "创建待办" \
  --events insert \
  --connector-id "G-CONN-1016B8AEBED50B01B8D00009" \
  --action-id "G-ACT-1016B8B1911A0B01B8D0000I" \
  --connector-name "创建待办任务" \
  --connector-assignment "subject:processVar:textField_xxx" \
  --connector-assignment "priority:literal:20"

# 创建带触发条件的自动化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "条件触发" \
  --events insert \
  --trigger-condition "selectField_xxx:状态:Equal:已完成:SelectField:literal" \
  --receivers "user001"

# 创建审批完成触发的自动化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "审批通知" \
  --events processFinish \
  --approval-actions agree,disagree \
  --receivers "user001"

# 创建审批节点事件触发的自动化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "节点通知" \
  --events activityTask \
  --approval-actions agree \
  --approval-node-ids "node_xxx" \
  --receivers "user001"

# 修改已有逻辑流（传入 --process-code）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "修改流程" \
  --process-code LPROC-XXX \
  --events insert \
  --receivers "user001"

# 创建并直接发布
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "发布流程" \
  --events insert \
  --receivers "user001" \
  --publish
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
| `--trigger-recursively` | 允许自动触发（递归触发） | 否 |
| `--approval-actions` | 审批动作（逗号分隔）：agree,disagree,terminated | 审批事件时必填 |
| `--approval-node-ids` | 审批节点ID（逗号分隔） | activityTask事件时必填 |
| `--add-data-form-uuid` | 新增数据目标表单UUID | 否 |
| `--add-data-assignment` | 新增数据字段赋值（可多次）：目标字段ID:valueType:value | 否 |
| `--data-form-uuid` | 获取数据目标表单UUID | 否 |
| `--data-condition` | 获取数据过滤条件（可多次）：bFieldId:bFieldName:aFieldId[:componentType] | 否 |
| `--data-query-type` | 获取数据查询类型：single(默认)/multiple | 否 |
| `--data-quantity` | 多条数据时获取数量（默认100） | 否 |
| `--update-form-uuid` | 更新数据目标表单UUID ⚠️后端暂不支持 | 否 |
| `--update-condition` | 更新数据过滤条件（可多次）⚠️后端暂不支持 | 否 |
| `--update-assignment` | 更新数据字段赋值（可多次）⚠️后端暂不支持 | 否 |
| `--script-code` | 脚本代码内容 ⚠️后端暂不支持 | 否 |
| `--branch-field` | 条件分支字段ID ⚠️后端暂不支持 | 否 |
| `--branch-operator` | 条件分支运算符 ⚠️后端暂不支持 | 否 |
| `--branch-value` | 条件分支比较值 ⚠️后端暂不支持 | 否 |
| `--connector-id` | 连接器ID | 否（需与--action-id同时使用） |
| `--action-id` | 连接器动作ID | 否 |
| `--connector-name` | 连接器显示名称 | 否 |
| `--connector-icon` | 连接器图标URL | 否 |
| `--connector-inputs` | 连接器完整入参schema JSON文件路径 | 否 |
| `--connector-assignment` | 连接器入参映射（可多次）：column:valueType:value | 否 |
| `--publish` | 创建后直接发布 | 否 |

**字段赋值 valueType 说明：**

| valueType | 说明 | value格式 |
|-----------|------|-----------|
| `processVar` | 引用触发表单字段 | 表单字段ID（如 textField_xxx） |
| `literal` | 固定值 | 字面量（如 "已完成"、100） |
| `column` | 公式 | 公式表达式 |

### 2. 查询逻辑流列表

```bash
node .agents/skills/integration/scripts/integration-list.js list <appType> [选项]
```

**示例：**

```bash
# 查询应用下所有逻辑流
node .agents/skills/integration/scripts/integration-list.js list APP_XXX

# 按关键字搜索
node .agents/skills/integration/scripts/integration-list.js list APP_XXX --key "通知"

# 按表单筛选
node .agents/skills/integration/scripts/integration-list.js list APP_XXX --form-uuid FORM-XXX

# 按状态筛选（y=启用, n=停用）
node .agents/skills/integration/scripts/integration-list.js list APP_XXX --status y

# 输出纯JSON格式
node .agents/skills/integration/scripts/integration-list.js list APP_XXX --json
```

### 3. 启用/停用逻辑流

```bash
# 启用
node .agents/skills/integration/scripts/integration-list.js enable <appType> <formUuid> <processCode>

# 停用
node .agents/skills/integration/scripts/integration-list.js disable <appType> <formUuid> <processCode>
```

### 4. 检查运行日志

```bash
node .agents/skills/integration/scripts/integration-check.js <appType> [选项]
```

**示例：**

```bash
# 检查应用下异常日志
node .agents/skills/integration/scripts/integration-check.js APP_XXX

# 输出JSON格式
node .agents/skills/integration/scripts/integration-check.js APP_XXX --json

# 导出Excel报告
node .agents/skills/integration/scripts/integration-check.js APP_XXX --output report.xlsx

# 检查成功日志
node .agents/skills/integration/scripts/integration-check.js APP_XXX --status success

# 多应用批量检查
node .agents/skills/integration/scripts/integration-check.js APP_AAA APP_BBB APP_CCC
```

**日志状态筛选：**

| 参数值 | 说明 |
|--------|------|
| `exception`（默认） | 执行异常 |
| `success` | 执行成功 |
| `running` | 执行中 |

## 七、执行流程

### 创建集成自动化

1. **确认操作目标**：询问用户需要创建什么类型的自动化
2. **获取应用和表单信息**：从系统配置清单或用户输入获取 appType、formUuid
3. **确定节点组合**：根据需求确定需要哪些节点（触发器 + 数据操作 + 连接器 + 消息通知）
4. **构建参数**：组装命令行参数
5. **执行创建**：调用 `integration-create.js`
6. **验证结果**：检查输出中的 processCode 和 success 状态

### 修改集成自动化

1. **查询现有逻辑流**：使用 `integration-list.js list` 获取 processCode
2. **确认修改内容**：与用户确认要修改的节点和配置
3. **执行修改**：使用 `--process-code` 参数调用 `integration-create.js`
4. **验证结果**：检查输出确认修改成功

## 八、API 接口说明

### 核心接口

| 接口 | 方法 | 路径 |
|------|------|------|
| 获取表单Schema | GET | `/alibaba/web/{appType}/_view/query/formdesign/getFormSchema.json` |
| 保存/发布逻辑流 | POST | `/alibaba/web/{appType}/query/simpleProcess/saveProcess.json` |
| 新建逻辑流绑定 | POST | `/alibaba/web/{appType}/query/formLogicflowBinding/createLogicflow.json` |
| 查询逻辑流列表 | GET | `/alibaba/web/{appType}/query/appLogicflowBinding/listflow.json` |
| 查询表单逻辑流 | GET | `/alibaba/web/{appType}/query/formLogicflowBinding/listflow.json` |
| 查询运行日志 | GET | `/alibaba/web/{appType}/query/formLogicflowBinding/listLog.json` |
| 启停逻辑流 | POST | `/alibaba/web/{appType}/query/formLogicflowBinding/switchflow.json` |

### processJson 结构

```json
{
  "props": {
    "allowWithdraw": true,
    "allowCollaboration": true,
    "allowTemporaryStorage": true,
    "processCode": "LPROC-XXX"
  },
  "nodes": [
    { "type": "trigger", "nodeId": "node_xxx", "nextId": ["node_yyy"], "props": { ... } },
    { "type": "dataCreate", "nodeId": "node_yyy", "nextId": ["node_zzz"], "props": { ... } },
    { "type": "sendMessage", "nodeId": "node_zzz", "nextId": ["node_end"], "props": { ... } },
    { "type": "finish", "nodeId": "node_end", "nextId": [], "props": {} }
  ]
}
```

### viewJson 结构

```json
{
  "schema": {
    "componentName": "CanvasEngine",
    "id": "canvas_xxx",
    "children": [
      { "componentName": "StartNode", "id": "node_xxx", "props": { ... } },
      { "componentName": "AddDataNode", "id": "node_yyy", "props": { ... } },
      { "componentName": "SendMessageNode", "id": "node_zzz", "props": { ... } },
      { "componentName": "EndNode", "id": "node_end", "props": { ... } }
    ]
  },
  "globalSetting": {}
}
```

## 九、连接器预设

### 内置预设

| 连接器 | 动作 | connectorId | actionId |
|--------|------|-------------|----------|
| 钉钉待办 | 创建待办任务 | `G-CONN-1016B8AEBED50B01B8D00009` | `G-ACT-1016B8B1911A0B01B8D0000I` |

### 创建待办任务入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| unionId | String | 是 | 任务所有者unionId |
| subject | String | 是 | 待办标题 |
| creatorId | String | 是 | 创建者unionId |
| description | String | 否 | 待办备注描述 |
| detailUrl | Object | 否 | 详情页URL（含pcUrl和appUrl） |
| dueTime | Number | 是 | 截止时间（Unix时间戳毫秒） |
| priority | Number | 是 | 优先级：10较低/20普通/30紧急/40非常紧急 |
| executorIds | Array | 是 | 执行者unionId数组 |

## 十、禁止事项

- 禁止在无登录态时执行操作（需先通过 `yida-api-client` 登录）
- 禁止硬编码 Cookie 和 Token
- 禁止在修改模式下省略 `--process-code` 参数
- 禁止在审批事件触发时省略 `--approval-actions` 参数
- 禁止在 activityTask 事件时省略 `--approval-node-ids` 参数

## 十一、已知限制

1. **不支持脚本节点**：后端不支持 ScriptNode/CodeNode 类型（`type: 'script'`）
2. **不支持更新数据节点**：后端不支持 DataUpdateNode 类型（`type: 'dataUpdate'`）
3. **不支持条件分支**：后端不支持 ConditionNode 类型（`type: 'condition'`）
4. **不支持循环节点**：后端不支持 LoopNode
5. **连接器预设有限**：仅内置钉钉待办预设，其他连接器需传入 `--connector-inputs`

> **注**：`--data-query-type multiple`（获取多条数据）已通过测试，通过 `quantity` 参数控制条数（默认100）。
> 代码中已为 `script`、`dataUpdate`、`condition` 等节点类型预留了实现，待后端支持后可直接使用 --script-code、--update-form-uuid、--branch-field 等参数。

## 检查清单

### 执行前确认
- [ ] 确认登录态有效（Cookie未过期）
- [ ] 确认应用ID和表单UUID从系统配置清单.md读取真实值，严禁占位符
- [ ] 确认已识别节点类型（当前仅支持6种：触发器/新增数据/获取数据/连接器/消息通知/结束）
- [ ] 确认修改模式下已展示当前配置供用户确认

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认不支持脚本节点/更新数据/条件分支（后端限制）
- [ ] 确认创建/修改后逻辑流已发布（非草稿状态）

---

## 十二、版本历史

### v1.0.2 (2026-05-24)
- 新增 `--data-query-type multiple` 支持「获取多条数据」节点（通过 quantity 控制条数）
- 扩展 process-builder / view-builder 增加 `GetMultipleDataNode` 组件
- 新增 `--update-form-uuid`/`--update-assignment`/`--script-code`/`--branch-field` 参数（预留，后端暂不支持）
- 新增 `buildDataUpdateAssignments`/`buildUpdateConditions`/`buildScriptNodeProps`/`buildConditionNodeProps` 工具函数
- 全功能实测确认：新增数据/获取单条数据/获取多条数据/消息通知/连接器节点均通过
- 实测确认限制：更新数据/脚本节点/条件分支 后端暂不支持

### v1.0.1 (2026-05-24)
- 修复 `integration-api.js` POST 请求双重 `querystring.stringify` bug（导致 POST body 为空）
- 为所有 POST 请求添加正确的 `Referer` 头（解决 CSRF 校验失败问题）
- 全功能测试通过：创建/修改/查询/启停/日志检查

### v1.0.0 (2026-05-24)
- 从宜搭AI编程工具集成自动化模块提炼
- 支持创建/修改集成自动化（草稿保存 + 发布）
- 支持查询逻辑流列表（关键字/表单/状态筛选）
- 支持启用/停用逻辑流
- 支持运行日志检查（异常排查 + Excel导出）
- 支持6种节点类型：触发器、新增数据、获取单条数据、连接器调用、消息通知、结束
- 内置钉钉待办2.0连接器预设
- 依赖 yida-api-client skill 提供登录态管理
