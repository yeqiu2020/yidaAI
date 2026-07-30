# 逻辑流节点 canonical viewJson 形状（从真实设计器引擎抓取 · 权威）

> 本文件是 integration skill「三·五、节点权威对照表 + 一步到位配置手册」的原始佐证。
> 全部从真实设计器引擎 `window.canvasDocument` / `window.logicSchema` 抓取，配置时可直接照抄。
> 来源应用：进销存3（APP_R206CVSVPXZC6IU3E53Y），逻辑流 processCode: LPROC-6TG66M810QJ7L0BPPULTP4AFMBBN26WB0LRRMGD

## 关键结论（推翻旧 builder 假设）
- 脚本节点 componentName = **`JavaScriptNode`**（不是 `ScriptNode`），还有 `GroovyNode`
- 更新数据节点 componentName = **`UpdateDataNode`**（确认）
- 获取单条 = `GetSingleDataNode`，获取多条 = `GetBatchDataNode`
- 新增 = `AddDataNode`，删除 = `DeleteDataNode`，消息 = `SendMessageNode`
- 根节点 = `CanvasEngine`，起止 = `StartNode` / `EndNode`
- 节点 view 结构统一为 `{componentName, id, props, children}`

## ★ 全 16 面板节点权威目录（从公开 bundle v0.2.241 提取，零猜测）

> 复现命令（无需登录，任何 AI 可跑）：`node .agents/skills/integration/scripts/dump-node-catalog.js`
> 数据来源 = 公开 CDN `https://g.alicdn.com/yida-platform/yida-logic-flow/<version>/index.js` 里的运行时节点枚举(pb) + 面板材料(configure)。
> 运行时枚举(pb)实测含：CanvasEngine, StartNode, ApplyNode, EndNode, ApprovalNode, OperatorNode, CarbonNode, ConnectorNode, ConditionContainer, ConditionNode, ParallelNode, GroovyNode, JavaScriptNode, AddDataNode, GetSingleDataNode, GetBatchDataNode, UpdateDataNode, CardNode, CardUpdateNode, CycleContainer, AINode。

| # | 面板标签 | 分组 | componentName | props键(rulesKey) | setter | 建节点方式 |
|---|---|---|---|---|---|---|
| 1 | 新增数据 | 数据 | `AddDataNode` | `addDataRules` | AddDataSetter | createNode 扁平props |
| 2 | 更新数据 | 数据 | `UpdateDataNode` | `updateDataRules` | UpdateDataSetter | ✅已上线验证 |
| 3 | 获取单条数据 | 数据 | `GetSingleDataNode` | `getData`(+type:"single") | GetDataSetter | createNode |
| 4 | 获取多条数据 | 数据 | `GetBatchDataNode` | `getData`(+type:"batch") | GetDataSetter | createNode；循环容器的数据来源 |
| 5 | 删除数据 | 数据 | `DeleteDataNode` | `deleteData`(⚠️非Rules后缀) | DeleteDataSetter | createNode；默认仅 name/nodeName/description |
| 6 | 连接流 | 连接器 | `AINode` | `workFlowRules`(type:aiFlow) | iframe子编辑器 | 走 iframe(initWorkFlow/saveWorkFlow)，建议设计器 |
| 7 | 连接器 | 连接器 | `ConnectorNode` | `connectorRules` | ConnectorSetter | createNode；默认含 status:"edit",step:0 |
| 8 | 消息通知 | 消息 | `SendMessageNode` | `sendMessageRules` | SendMessageSetter | createNode |
| 9 | 发送邮件 | 消息 | `SendEmailNode` | `sendEmailRules` | SendEmailSetter | createNode |
| 10 | 发送卡片 | 卡片 | `CardNode` | cardRules(运行时确认) | CardSetter | createNode；默认含 paneClassName |
| 11 | 更新卡片 | 卡片 | `CardUpdateNode` | cardRules(运行时确认) | CardSetter | createNode |
| 12 | 条件分支 | 分支 | `ConditionContainer` +子`ConditionNode` | 容器props:{name}；子节点`conditions` | BranchSetter | 容器+children |
| 13 | 并行分支 | 分支 | `ConditionContainer`(加`type:"parallel"`) +子`ParallelNode` | 子节点`conditions` | BranchSetter(type=parallel) | 容器+children |
| 14 | 循环容器 | 分支 | `CycleContainer` | `cycleContainerRules` | 需前置GetBatchDataNode | 容器；只遍历获取多条输出 |
| 15 | 发起审批 | 人工 | `InitiateApprovalNode` | `initiateApprovalRules` | InitiateApprovalSetter | createNode |
| 16 | 脚本 | 开发者 | `GroovyNode`(Groovy) / `JavaScriptNode`(JS) | `groovy` / `JavaScript`(内含 action.code) | GroovySetter/JavaScriptSetter | createNode |
| — | 表单事件触发 | 触发 | `StartNode` | `start` | — | 引擎自带首节点 |
| — | 结束 | 结束 | `EndNode` | `name`(i18n) | — | 引擎自带尾节点 |

**分支/容器结构（决定性，从材料 snippet 核实）：**
```js
// 条件分支：容器 + 两个 ConditionNode 子节点
{componentName:"ConditionContainer", props:{name:"条件分支"}, children:[
  {componentName:"ConditionNode", props:{name:"条件", description:""}},
  {componentName:"ConditionNode", props:{isDefault:true, name:"其他情况", description:"", buttons:[{name:"关闭",handler:null}]}}
]}
// 并行分支：同一个 ConditionContainer，加 type:"parallel"，子节点换成 ParallelNode
{componentName:"ConditionContainer", type:"parallel", props:{name:"并行分支"}, children:[
  {componentName:"ParallelNode", props:{name:"条件", description:""}},
  {componentName:"ParallelNode", props:{isDefault:true, name:"其他情况", description:""}}
]}
```
- 分支节点的条件由子节点(ConditionNode/ParallelNode)的 `conditions` 键承载，setter = `BranchSetter`（并行 type:"parallel"）。
- `CarbonNode/ApplyNode/ApprovalNode/OperatorNode` 是流程审批相关的**内部节点**，不在集成自动化 16 面板节点里。

## StartNode（表单事件触发 · 流程事件 · 审批通过）
```json
{"componentName":"StartNode","id":"node_x","props":{"nodeName":"StartNode","name":{"en_US":"Form event trigger","zh_CN":"表单事件触发","type":"i18n"},"nodeError":"","start":{"examineApproveType":"processFinish","formEventType":["processEvents"],"formEventField":"","dataFilterType":"all","fieldType":"all","conditions":{"condition":"AND","rules":[{"id":"","op":"等于","operators":[],"componentType":"TextField"}]},"formUuid":"FORM-B123AFB3751A4001B0C7FA5D8A252261IW6H","triggerType":"FormEvent","type":"form","triggerFormEventRecursively":false,"examineApproveNode":"","examineApproveActiveList":["agree"],"examineApproveActiveTask":[]}}}
```

## GetSingleDataNode（获取单条数据）—— 更新节点 updateData 的结构可参照此
```json
{"componentName":"GetSingleDataNode","id":"node_x","props":{"nodeName":"GetSingleDataNode","name":"获取单条数据","description":"请设置想要获取的数据","type":"single","getData":{"type":"single","originalType":"form","appType":"APP_R206CVSVPXZC6IU3E53Y","sourceId":"FORM-6FCCE628B69D489BB8678AB7D41ACE62J34X","targetItem":{"appType":"APP_R206CVSVPXZC6IU3E53Y","appName":"","formItem":{"formType":"receipt","advanceProc":"n","formUuid":"FORM-6FCCE628B69D489BB8678AB7D41ACE62J34X","title":"","fields":null,"hasTableField":null}},"subSourceId":"","relativeItem":{},"filterType":"condition","condition":{"condition":"AND","rules":[],"ruleId":"group-xxx","conditionCode":"&&"},"sort":{"type":"none","column":""},"rulesFilter":[],"outputs":[],"quantity":1,"dataRules":{"rules":[{"componentName":"","labe":"","name":"","required":false,"ruleId":"rule-xxx","value":"","valueType":"literal"}]},"assignments":[]},"title":"获取单条数据"}}
```

## JavaScriptNode（脚本）★ 已抓取真实结构 ★
props 外层包一个 `JavaScript` 对象：
```json
{"componentName":"JavaScriptNode","id":"node_x","props":{"JavaScript":{
  "inputs":[{"name":"","componentName":"","valueType":"literal","value":"","required":false,"ruleId":"rule-xxx"}],
  "scriptType":"JavaScript",
  "action":{"code":"outputs.add(\"新明细\",\"newDetails\",[]);","exceptionStrategy":""},
  "outputs":[{"componentName":"TextField","desc":"新明细","name":"node_x_newDetails","type":"Array","typeDesc":"数组","value":"[]","valueType":"processVar"}],
  "testInputs":[]
}}}
```
要点：
- `action.code` 存放脚本正文（用 outputs.add(描述,变量名,变量) 输出）
- `outputs[].name` = `<节点id>_<变量名>`；`valueType:"processVar"`；`type` 为 Array/Text 等；`typeDesc` 中文
- `inputs` 用于把前置节点输出/字面量绑定进脚本 input 对象
- 旧 builder 用的 `scriptRules:{content,language,timeout,libs}` 完全错误

## SendMessageNode（消息通知）
```json
{"componentName":"SendMessageNode","id":"node_x","props":{"nodeName":"SendMessageNode","name":"消息通知","description":"请设置消息通知","sendMessageRules":{"template":{"templateName":""},"messageType":"NORMAL","messageInfo":{"title":"入库累加","content":"已触发","buttons":[{"name":"查看详情","type":"commit","value":"//yidalogin.aliwork.com/APP.../formDetail/FORM...?formInstId=${formInstId}","buttonUuid":"button-xxx"}]},"appType":"APP_R206CVSVPXZC6IU3E53Y","toRoles":[],"toUsers":[],"userFields":["form_inst_creator"],"description":"发送工作通知"}},"title":"消息通知"}
```

## EndNode
```json
{"componentName":"EndNode","id":"node_x","props":{"name":{"en_US":"end","zh_CN":"结束","type":"i18n"}}}
```

## UpdateDataNode（更新数据）★ 决定性突破 ★

### 崩溃根因与稳定创建方式
- 合成 UpdateDataNode 之前会崩溃的真正原因 = props 缺少 `name/nodeName/description`（节点卡片渲染器读这些字段，undefined→崩，报错 `eot: Cannot read properties of undefined (reading 'type')`）
- 从 bundle 抓到调色板 material 完整 snippet（权威）：props 是【扁平】的，四个键都在 props 顶层，`updateDataRules` 不再嵌套 `UpdateDataNode`：
```js
{componentName:"UpdateDataNode", props:{
  name:"更新数据", nodeName:"UpdateDataNode",
  description:"请设置要更新的数据", updateDataRules:{}
}}
```
**正确稳定创建（已验证：5节点画布完美渲染，关闭/重渲染不崩）：**
```js
const nn=doc.createNode({componentName:'UpdateDataNode', props:{name:'更新数据', nodeName:'UpdateDataNode', description:'请设置要更新的数据', updateDataRules:{}}});
doc.rootNode.children.insert(nn, getSingleIndex+1);
```
- AddDataNode 同构：props={name,nodeName,description,addDataRules:{}}。
- 读回 props 用 `node.props.items[].key` + `node.props.items[].getValue()`（exportSchema 返回空）。

### UpdateDataSetter 两种更新模式
1. **按节点更新表单数据**（type=node）：更新前置数据节点（如获取单条）拉取的记录；字段选择器依赖前置节点 outputs
2. **直接更新表单数据**（type=direct_form）✅推荐：直接选表单+字段，字段列表立即加载，无依赖

### 【直接更新】子表更新完整模型（四步）
- 第1步 选择更新方式：◉ 直接更新表单数据；选子表时再选子表单（树形：采购订单→采购明细）
- 第2步 匹配规则：主条件（定位主表记录）+ 子条件（定位子表行，引擎对触发子表数组逐行匹配）
- 第3步 更新规则：目标字段 的值设为「公式」→ fx 公式编辑器；可「添加字段」
- 第4步 更多配置：未获取到数据时 ○跳过当前节点 / ○新增一条数据
- `updateDataRules` 仅在面板点“保存”时才写入 node props（UI 中选择未 commit 前仍为 {}）

### CycleContainer（循环容器）关键结论
- componentName='CycleContainer'，prop key='cycleContainerRules'
- 其 setter 明确提示：“在当前节点之前添加『获取多条数据』节点，获取用于循环处理的数据”
- → **只能遍历 GetBatchDataNode 的输出，不能遍历触发数据的子表行**
- → 子表累加【不用】循环容器；单个「直接更新表单数据·子表」节点即可，引擎对触发子表数组逐行迭代匹配累加（这就是“词表更新”）

### 最终 3 节点架构（已保存+发布+启用 status='y'）
1. StartNode：采购入库 FORM-B123AFB3751A4001B0C7FA5D8A252261IW6H · processFinish（提交完成）
2. UpdateDataNode（直接更新·子表 采购订单.采购明细）
3. EndNode

### updateDataRules 真实完整形状（从上线节点 export 抓取，权威）
```json
{
  "type": "direct_form",
  "sourceId": "FORM-6FCCE628B69D489BB8678AB7D41ACE62J34X",
  "subSourceId": "tableField_183riwzy",
  "condition": {
    "condition": "AND", "conditionCode": "&&", "ruleId": "group-xxx",
    "rules": [{
      "id": "serialNumberField_183pusun", "name": "采购订单号",
      "op": "等于", "opCode": "Equal", "componentType": "SerialNumberField",
      "value": "textField_1bforgnc", "ruleValue": "textField_1bforgnc",
      "valueType": "processVar", "extValue": "processVar", "multiple": false,
      "ruleType": "rule_text", "ruleId": "item-xxx", "parentId": "group-xxx"
    }]
  },
  "subCondition": {
    "condition": "AND", "conditionCode": "&&", "ruleId": "group-yyy",
    "rules": [{
      "id": "textField_183rwpa5", "name": "产品名称",
      "op": "等于", "opCode": "Equal", "componentType": "TextField",
      "value": "textField_1bfprx6d", "ruleValue": "textField_1bfprx6d",
      "valueType": "processVar", "extValue": "processVar", "multiple": false,
      "ruleType": "rule_text", "ruleId": "item-yyy", "parentId": "group-yyy"
    }]
  },
  "assignments": [{
    "column": "numberField_mrrzxqmq",
    "valueType": "column",
    "value": "#{FORM-6FCCE628B69D489BB8678AB7D41ACE62J34X/numberField_mrrzxqmq}+#{numberField_1bfpehpk}",
    "__display": "目标表字段.采购明细.已入库数量+入库明细.入库数量"
  }],
  "noneOperation": "ignored",
  "rulesFilter": []
}
```
**公式编码规则（关键）：**
- 目标表字段引用 = `#{<目标formUuid>/<fieldId>}`（跨表引用带 formUuid 前缀）
- 触发数据字段引用 = `#{<fieldId>}`（当前触发表单，无前缀）
- UI 公式编辑器：左侧「目标表字段」组插入目标值，「当前表单提交后的数据」组插入触发值，中间输入 `+`
- assignments[].valueType='column' 表示公式；节点扁平 props：{name,nodeName,description,updateDataRules}

### ⚠️ viewJson vs processJson 结构差异（2026-07-30 事故教训）

| 字段 | viewJson (schema.children) | processJson (json.nodes) |
|------|---------------------------|-------------------------|
| 位置 | `componentName: 'UpdateDataNode'` | `type: 'dataUpdate'` |
| props 结构 | **嵌套**: `{name, nodeName, description, updateDataRules: {...}}` | **扁平**: `{type, sourceId, condition, assignments, noneOperation, ...}` |
| 设计器渲染 | 读 `props.updateDataRules.condition` | 不读 |
| 执行引擎 | 不读 | 读 `props.condition`/ `props.assignments` |

**关键规则**：
1. viewJson 的 UpdateDataNode **必须**用嵌套结构 `props.updateDataRules`，展开会导致设计器白屏
2. processJson 的 dataUpdate **必须**用扁平结构，嵌套会导致保存报"转换xml失败"
3. 两个 builder（view-builder / process-builder）必须同步引入 `buildUpdateConditions`/`buildDataUpdateAssignments`
4. `integration-get.js`/`integration-validate.js` 回读时需 viewJson fallback：`content.json` 为空时从 `content.schema.children` 解析

## API 直建 / 保存 / 启停端点
- 保存与发布端点：`POST /alibaba/web/{appType}/query/simpleProcess/saveProcess.json`（保存与发布都调它）
- 查询启停：`GET /alibaba/web/{appType}/query/appLogicflowBinding/listflow.json?_api=Connector.getListflow&type=1&appType={appType}&pageIndex=1&pageSize=50` → content.data[] 按 formUuid 分组，flowList[].status ('y'=启用/'n'=停用)、lastAction、runRecordCount
- 切换启停：`POST /alibaba/web/{appType}/query/formLogicflowBinding/switchflow.json?_api=Connector.switchFlow`
- ⚠️ `/dingtalk/web/` 下 POST（发起流程/审批 startInstance/executeTask）需 csrf，浏览器内 tianshu_csrf_token 为 httpOnly 读不到 + CSP 封阻 → 必须走 Node + 根目录 .cookies.json 通道

## 引擎操作入口（window 顶层）
- `window.logicSchema` = 当前画布完整 viewJson
- `window.canvasDocument` = 文档：rootNode/children/createNode/insert/export
- `window.canvasEngineAPI` = editor/designer/addNode/setNode/selectNode/removeNode/save
- `window.flowNodes` = 节点类注册表（含 UpdateDataSetter/GetDataSetter/GroovySetter 等 Setter）
- createNode: `doc.createNode({componentName:'JavaScriptNode', props:{...}})`
- 插入: `doc.rootNode.children.insert(node, index)`
- 打开设置面板: `window.canvasEngineAPI.editor.emit('SIMPLE_FLOW_EDITOR_MATERIAL_SELECT', node)`

---

# ★ 脚本 / 条件分支 / 循环容器 processJson 权威序列化规则（bundle v0.2.241 · 2026-07-28 API 直建已回归）

> 来源 = bundle 内 viewJson→processJson 转换器原文（Jct 类型映射 + Gb/jb/Ub/ny 转换器 + nut/Yct/Fb 链接规则）。
> 已全部实现进 `integration-process-builder.js` / `integration-view-builder.js`，3 条真实回归流保存成功 + 设计器画布/面板回读通过：
> - 回归E-脚本节点 `LPROC-N7C66G916UT7WMLTMENKE9CYSI3Y2X68BF5SMP5`
> - 回归F-条件分支 `LPROC-9K9661716TT7NF36OOF0X8OLCS2N2FNJBF5SM24`
> - 回归G-循环容器 `LPROC-3Y866P61YST7P44NJSH1GAIDITZX3HBUBF5SME4`

## Jct 类型映射（componentName → processJson type）
| viewJson componentName | processJson type |
|---|---|
| `ConditionContainer` | `route` |
| `ConditionNode` / `ParallelNode` | `condition` |
| `GroovyNode` / `JavaScriptNode` | `CodeExecutor` |
| `CycleContainer` | `foreach` |

## 脚本节点（CodeExecutor · 转换器 Gb 原文）
```js
Gb=function(e){var t=e.groovy,n=e.JavaScript,r=t||n,
  o=r.outputs&&r.outputs.map(function(e){return{description:e.desc,name:e.name,type:e.type,valueType:e.valueType}});
  return{inputs:r.inputs,action:r.action,scriptType:r.scriptType,outputsSchema:o}}
```
即 processJson props = `{inputs, action:{code,exceptionStrategy:""}, scriptType:"JavaScript", outputsSchema:[{description,name,type,valueType}]}`；
viewJson props.JavaScript = setter saveValue 形状 `{inputs, scriptType, action:{code,exceptionStrategy:""}, outputs, testInputs}`；
`outputs[].name` 必须 = `<节点id>_<变量名>`。

## 条件分支（route 容器 + condition 子节点）
- 容器：`{type:"route", nextId:[分支1id,分支2id,...], props:{outgoingType:"priority"}, childNodes:[...]}`（Ub 转换器）
- 子分支（jb 转换器）：`{type:"condition", nodeId, prevId:<容器id>, nextId:[容器后继id], props:{priority, isDefault, conditions:<规则树>, calculate:"condition", expression:""}}`
  - 默认分支 `priority=2147483647, isDefault:true`（无 conditions）；普通分支 priority=1 起
  - **只有 condition 子节点有 prevId（=父容器 id）**，其他节点没有 prevId（nut 规则）
- viewJson：`ConditionContainer` children = 两个 `ConditionNode`；普通分支 props.conditions={calculate,expression,conditions:<规则树>,isDefault:false,priority:1,description}；默认分支 props={isDefault:true,name:'其他情况',buttons:[{name:'关闭',handler:null}]}
- ⚠️ 分支子节点 ID 必须 processJson/viewJson 一致 → create.js 统一生成 `conditionBranchIds` 后传给两个 builder

## 循环容器（foreach）
- `{type:"foreach", nextId:[<第一个循环体子节点id>, <下一兄弟id>], jumpId:<下一兄弟id>, props:{sourceId:<GetBatch节点id>, blockType:"continue", outputs:[]}, childNodes:[...循环体...]}`（ny=props 直接透传 cycleContainerRules；Yct=nextId/jumpId 规则）
- **循环体末节点 nextId 回指容器自身**（Fb 回环规则）；循环体节点进 childNodes，不在顶层 nodes
- viewJson：`CycleContainer` props.cycleContainerRules={sourceId,blockType:'continue',outputs:[]}，children=[循环体节点]
- 约束：sourceId 只能指向「获取多条数据」(GetBatchDataNode) 节点；循环体不能为空（EMPTY_CycleContainer）

## CLI 直建（integration-create.js）
```bash
# 脚本节点
--script-code "var total=1+1; return {result:String(total)};" --script-output "result:Text:计算结果"
# 条件分支（两分支：条件1 + 其他情况）
--branch-field textField_xxx --branch-operator Equal --branch-value "张三" --branch-field-name "姓名"
# 循环容器（循环体=消息节点，必须先有获取多条）
--data-form-uuid FORM-XXX --data-query-type multiple --cycle --receivers user001
```
