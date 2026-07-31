# integration 节点配置实战手册（根因复盘 · 避坑详解 · 黄金配方 · 设计器兜底）

> 本文件从 SKILL.md 拆分而来（渐进式披露）。按需加载：配置数据节点/脚本/分支/循环前、遇到"白屏/转换xml失败/表单不存在/无效表单"报错时、需要设计器 Playwright 兜底时必读。
> 完整原始佐证（各节点 viewJson 完整形状 + processJson 序列化规则）见 [canonical-node-shapes.md](canonical-node-shapes.md)。

---

## 0. 根因复盘：为什么"昨天"探索花了整天 + 上百块（务必先看，避免重蹈覆辙）

> 根本原因一句话：**把节点定义"靠记忆/靠猜 + 反复试错"，而不是一开始就去拿权威定义。** 而节点定义其实全部打包在公开 CDN bundle 里，一行就能拿到。

具体踩了4类坑，合起来就是"慢 + 贵"：
1. **错误假设 + 反复试错**：旧 builder 拿 `ScriptNode`/嵌套 props/`scriptRules` 这些错名字反复试，每错一次设计器就白屏崩溃（`eot: Cannot read properties of undefined (reading 'type')`），重启→重试→再崩。
2. **误导性的读回手段**：`exportSchema()` 返回空 props，让人误以为"没配对"，实际是读法不对（应用 `node.props.items[].getValue()`）。
3. **过时文档的错误断言**：误信"脚本/条件/循环不支持 API 直建"，花时间绕路而非直接拿定义。
4. **登录/通道限制**：csrf / httpOnly / CSP 反复阻断，把时间花在"怎么进去"而不是"拿什么"。

> **正解（已固化为本 skill 能力）**：不登录、不猜、不试错——直接跑 `node .agents/skills/integration/scripts/dump-node-catalog.js` 从公开 bundle 提取全 16 节点权威定义。任何 AI 先跑这一行，拿到 componentName / rulesKey / 默认 props 形状后再建节点，就能一次到位。

---

## 1. ⚠️ 决定性避坑清单（每条都曾导致崩溃/白屏/保存失败）

1. **脚本节点叫 `JavaScriptNode`（不是 `ScriptNode`）**，另有 `GroovyNode`；旧 builder 用 `ScriptNode` 直接不渲染。
2. **`UpdateDataNode` 的 props 是【扁平】的**：`{name, nodeName, description, updateDataRules}`。
   - ❌ 不是嵌套 `{UpdateDataNode:{updateDataRules}}`；❌ 更不是 `props.updateData`。
   - **createNode 时必须带全 `name/nodeName/description`**，缺任意一个 → 节点卡片渲染器读 `undefined.type` → 整个画布白屏崩溃（真实报错 `eot: Cannot read properties of undefined (reading 'type')`）。
3. **`AddDataNode` 同构**：`{name, nodeName, description, addDataRules:{}}`。
4. **`JavaScriptNode` 的 props 外层包一层 `JavaScript` 对象**：
   `{JavaScript:{inputs:[...], scriptType:"JavaScript", action:{code:"脚本正文", exceptionStrategy:""}, outputs:[...], testInputs:[]}}`
   - 脚本正文放 `action.code`，用 `outputs.add("描述","变量名",值)` 输出。
   - `outputs[].name` = `<节点id>_<变量名>`，`valueType:"processVar"`，`type` 为 `Array/Text` 等。
   - ❌ 旧 builder 的 `scriptRules:{content,language,timeout,libs}` 完全错误。
5. **读回节点 props 不要用 `exportSchema()`（返回空 props）**；用 `node.props.items[].key` 拿键、`node.props.items[].getValue()` 拿值。
6. **`CycleContainer` 只能遍历「获取多条数据」(`GetBatchDataNode`) 的输出**（其 setter 明确要求前置 GetBatch），**不能遍历触发数据的子表行** → 子表累加**千万别用循环节点**，用 direct_form 子表更新即可自动逐行匹配（见下方黄金配方）。
7. **`updateDataRules` 只在 setter 面板点「保存」后才写入 node props**；UI 选完未 commit 前仍是 `{}`。
8. **【次级校验】新增/更新数据节点必须写入目标表单的完整字段谱 `inputs.childList` / `rules.childList` / `componentOptionMap`，否则设计器报「无效表单，请重新配置」**。
   - 根因：`getFormSchema` 抓字段时若靠 layoutTypes 白名单递归，遇到不在名单里的容器（流程表单 `FormContainer`/子表等）就停止递归 → 只拿到外层包裹（无 fieldId）→ childList 为空。✅ 已修复：`integration-api.js` 的 `collectFields` 改为"只要带 `props.fieldId` 就收集、只要有 `children` 就递归"（不再靠容器名单白名单）。
   - ✅ create 脚本已加硬拦截：`getFormSchema` 抓到 0 字段直接 `EMPTY_FORM_SCHEMA` 报错退出，绝不静默发布空节点。
9. **🔴【首要根因·必看】节点目标表单的「类型」必须匹配该节点 setter 的 `formTypes` 白名单，否则设计器报「表单不存在，唯一排查码 xxx / 无效表单，请重新配置」**。
   - **这是比第 8 条更靠前的一道门**：类型不对时，表单选择器根本查不到这张表 → 连字段谱那一步都进不去。第 8 条的 childList 只有在类型正确后才有意义。
   - 权威来源（公开 bundle 零猜测）——各节点 setter 的 `formReqParams.formTypes`：

     | 节点 | setter 查询的 formTypes | 目标表单类型要求 |
     |---|---|---|
     | 新增数据 `AddDataNode` | `receipt` | **只能普通表单** |
     | 发起审批 `InitiateApprovalNode` | `process` | **只能流程表单** |
     | 获取单条/多条 `GetSingleDataNode`/`GetBatchDataNode` | `receipt,virtualView` 或 `process`（按 originalType） | 普通/聚合/流程均可 |
     | 更新/删除 `UpdateDataNode`/`DeleteDataNode` | 无表单选择器（绑定前置 Get 节点的 sourceId，或 direct_form 直接选） | 不单独校验 |

   - **典型踩坑（进销存3 `LPROC-9TH66...`）**：把流程表单「采购入库」塞进「新增数据」节点 → 设计器报"表单不存在，唯一排查码 2132f5…"。因为 AddDataSetter 只用 `formTypes=receipt` 查表单，流程表单查不到。**流程表单要新增记录，必须用「发起审批」节点发起其流程，而不是「新增数据」。**
   - ✅ create 脚本已加硬拦截 `assertFormType`：创建前用 `getFormType()` 查目标表单真实类型，不匹配立即 `FORM_TYPE_MISMATCH` 报错退出并给出正确节点指引（新增数据→receipt、发起审批→process），绝不生成坏节点。
   - 🔧 **自查/复现命令**（任何 AI 遇到"表单不存在/无效表单"都可一键定位是不是类型不匹配）：
     ```
     GET /alibaba/web/{appType}/query/formdesign/getFormAndAppInfo.json
         ?formTypes=receipt&needAssocField=false&appType={appType}&formUuid={目标formUuid}
     ```
     用 `formTypes=receipt` 查若命中不到、换 `formTypes=process` 才命中 → 说明目标是流程表单，AddData 用不了。返回体 `content.formDatas.values[0].formType` 就是权威类型。
10. **🔴 processJson 的 `dataUpdate` 节点 props 必须是【扁平】展开的 updateDataRules**（权威来源 bundle 转换器 `Jb`）：
    `{type, sourceId, subSourceId, condition, subCondition, assignments, noneOperation, rulesFilter, tableRulesFilter}`
    - ❌ 嵌套在 `props.updateDataRules` 下、或包 `appType` → 后端必报「保存流程图失败 数据持久化错误 转换xml失败」（2026-07-28 实测 4 个变体全部复现）。
    - ⚠️ 与 viewJson 相反：viewJson 的 `UpdateDataNode` 仍是 `props.updateDataRules` 嵌套（见第 2 条），两边形状不同步就会保存失败或回读丢失。
    - `rulesFilter`/`tableRulesFilter` 分别镜像 `condition.rules`/`subCondition.rules`，设计器回读 direct_form 时靠它们渲染条件行 UI（bundle UpdateDataSetter 保存函数确认）。
11. **🔴 多条获取的 viewJson 组件名是 `GetBatchDataNode`，不是 `GetMultipleDataNode`**（bundle 中后者 0 命中）。用错名字保存不报错，但设计器画布**静默不渲染该节点**（删除节点的前置获取节点直接消失，2026-07-28 实测）；且节点级/getData 的 `type` 必须是 `batch`（单条为 `single`），bundle `$b` 转换器直接取 props.type 写 processJson。
12. **`dataDelete` 的 processJson props 形状**（bundle `Xb`）：`{sourceId: 前置获取节点nodeId, type: 'node'}`，删子表行时才加 `subSourceId`；`dataCreate`（bundle `Zb`）也是扁平 `{formUuid, appType, subFormUuid, insertType, type, sourceId, assignments}`，`type=batch` 时 `sourceId` 必填（触发子表字段或前置获取多条节点）。
13. **🔴 `ConnectorNode.connectorRules.currentStep` 必须为 2（向导已完成态）**：view-builder 之前硬编码 `currentStep: 1`，导致设计器校验判定「请完善连接器节点配置」，保存被前端拦截（只弹 toast，不发 saveProcess POST）。修复：`currentStep: 2`（2026-07-28 组合场景D实测并修复）。
14. **🔴 连接器入参若为 `EmployeeField`/`DepartmentField`/`DepartmentSelectField` 类型，其 `literal` 值必须是 `[{id, name}]` 数组，不能是普通字符串**：设计器保存序列化器（bundle `qb`）对这三类组件的 `literal` 值直接调用 `value.map(e=>e.id)`，传字符串会抛 `t.map is not a function`，保存静默失败（无 toast、无 POST，2026-07-28 组合场景D实测）。修复：`connector-presets.js` 的 `buildConnectorRulesFromInputs` 在设置 value 时，对人员/部门字段的字符串值自动包装为 `[{id: val, name: val}]` 数组。
15. **🔴 连接器节点 6 项必填入参（以钉钉待办为例）**：`unionId`(任务所有者)、`subject`(标题)、`creatorId`(待办发布者)、`dueTime`(截止时间Unix毫秒)、`priority`(优先级)、`executorIds`(执行人)。只映射部分入参 → 设计器校验拦截保存。缺字段可通过 bundle `ConnectorDataSetter` 的 `validateRequiredInputs` 找到。
16. **🔴🔴 公式赋值三字段格式（viewJson `assignments[]`，`valueType=column` 时）— 6 个历史踩坑全部修复**：
    - **背景**：公式赋值在 viewJson 中需要同时写 `__display`、`__source`、`value` 三个字段。bundle 逆向确认：`__display` 给设置面板 `<Input>` 显示；`__source` 给公式编辑器弹窗 CodeMirror 重建状态；`value` 给执行引擎。
    - **正确格式**（照抄，不要自由发挥）：
      ```
      __display = "目标表字段.库存数量+入库明细.入库数量"   ← 纯文本字符串
      __source  = "#{FORM-xxx/fieldId}+#{fieldId}"        ← 与 CLI 传入公式完全相同
      value     = "#{FORM-xxx/fieldId}+#{fieldId}"        ← 与 __source 完全相同
      ```
    - **6 个踩坑（每个都实际发生过）**：
      1. `__display` 存成 JS 对象 → 设置面板显示 `[object Object]`
      2. `__display` 存成 `JSON.stringify({...})` 字符串 → 设置面板显示 JSON 原文
      3. `__source` 缺失 → 公式编辑器弹窗空白（无法重建编辑器状态）
      4. `__source` 触发表单字段加 `//` 后缀 → 弹窗标记 `invalid:true` 显示"无效字段"
      5. `__source` 跨表引用用 `//`（双斜杠）而非 `/`（单斜杠）→ 验证器报"二元表达式操作符+的左参数类型不合法"
      6. `value` 做点号转换（`#{FORM-xxx}.fieldId`）→ 多余且与 `__source` 不一致
    - **根因**：bundle `parseListFieldsToVars` 中 `formSuffix = "Object"===type ? "//" : "targetForm"===type ? "/" : ""`。direct_form 模式下目标表单是 `targetForm` 类型，formSuffix 是 `/`（单斜杠），不是 `//`。`handleDialogEnter` 的 value 转换只处理 `//`，不处理 `/`，所以单斜杠格式原样保留到 `value`。
    - ✅ 已修复：`buildFormulaFields()` 函数直接用原始公式作为 `__source` 和 `value`，只替换 `#{...}` 为字段名生成 `__display` 纯文本。

---

## 2. ★★★ 黄金配方：direct_form 直接更新（已上线验证，覆盖 90% 同步场景）

> **⚠️ 方案选择铁律**：数据同步场景默认用 direct_form（直接更新），3 节点搞定。
> 只有"触发表子表各行→各自对应的目标表主表记录"才需要循环容器（5 节点）。
> 详见 SKILL.md 方案选择决策树。**历史上曾有 AI 把"采购入库同步库存"误用循环容器，实际只需 direct_form 直接更新。**

### 2a. 主表直接更新（最常用，如：审批通过后同步更新目标表）

**业务场景**：A 表审批通过后，按主表字段匹配 B 表主表记录，累加更新数量，未匹配则新增（upsert）。

**最简架构（3 节点）**：
`StartNode(A表·processFinish审批通过)` → `UpdateDataNode(direct_form 直接更新主表)` → `EndNode`

**CLI 命令**：
```bash
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后同步更新" \
  --events processFinish --approval-actions agree \
  --update-form-uuid FORM-TARGET \
  --update-condition "textField_target_key1:目标匹配字段1:textField_trig_key1:TextField:Equal::processVar" \
  --update-condition "textField_target_key2:目标匹配字段2:textField_trig_key2:TextField:Equal::processVar" \
  --update-assignment "numberField_target_val:column:#{FORM-TARGET/numberField_target_val}+#{numberField_trig_val}" \
  --update-assignment "textField_target_key1:processVar:textField_trig_key1" \
  --update-assignment "textField_target_key2:processVar:textField_trig_key2" \
  --update-none-operation add
```

**关键点**：
- 不需要 `--update-sub-source-id`（主表更新没有子表）
- 不需要 `--update-sub-condition`（主表更新没有子条件）
- 不需要获取节点、不需要循环容器
- `--update-none-operation add` = 未匹配时新增（upsert）

### 2b. 子表逐行匹配更新（如：采购入库.入库明细→采购订单.采购明细.已入库数量）

**业务场景**：A 表提交完成后，把 A 子表各行的某数量，按行匹配累加到 B 表子表对应行的字段。B 是流程表单不能用业务规则，故用集成自动化。

**最简架构（3 节点，无需 GetSingle / JavaScript）**：
`StartNode(A表·processFinish提交完成)` → `UpdateDataNode(直接更新·子表)` → `EndNode`

**UpdateDataNode 两种更新模式**：
- `type:"node"` 按前置数据节点更新（依赖 GetSingle 的 outputs，字段列表要等前置节点输出，较繁琐）
- **`type:"direct_form"` 直接更新表单数据 ✅ 首选**：直接选目标表单 + 子表，字段列表立即加载，无依赖

**direct_form 子表更新的 `updateDataRules` 完整形状（照抄，占位符替换即可）**：
```json
{
  "type": "direct_form",
  "sourceId": "<目标主表formUuid>",
  "subSourceId": "<目标子表fieldId>",
  "condition": {
    "condition": "AND", "conditionCode": "&&", "ruleId": "group-xxx",
    "rules": [{
      "id": "<主表匹配字段id>", "name": "采购订单号", "op": "等于", "opCode": "Equal",
      "componentType": "SerialNumberField",
      "value": "<触发表匹配字段id>", "ruleValue": "<触发表匹配字段id>",
      "valueType": "processVar", "extValue": "processVar",
      "ruleType": "rule_text", "ruleId": "item-xxx", "parentId": "group-xxx", "multiple": false
    }]
  },
  "subCondition": {
    "condition": "AND", "conditionCode": "&&", "ruleId": "group-yyy",
    "rules": [{
      "id": "<目标子表匹配列id>", "name": "产品名称", "op": "等于", "opCode": "Equal",
      "componentType": "TextField",
      "value": "<触发子表匹配列id>", "ruleValue": "<触发子表匹配列id>",
      "valueType": "processVar", "extValue": "processVar",
      "ruleType": "rule_text", "ruleId": "item-yyy", "parentId": "group-yyy", "multiple": false
    }]
  },
  "assignments": [{
    "column": "<目标子表被更新列id>",
    "valueType": "column",
    "value": "#{<目标formUuid>/<目标列id>}+#{<触发子表数量列id>}"
  }],
  "noneOperation": "ignored"
}
```
- `condition` = 主条件（定位主表记录）；`subCondition` = 子条件（引擎对触发子表数组**逐行迭代匹配**）；`assignments` = 更新赋值；`noneOperation` = 未匹配到时 `ignored`跳过 / `add`新增。

**公式编码规则（关键，写错就取不到值）**：
- 跨表引用目标表字段 = `#{<目标formUuid>/<fieldId>}`（**带 formUuid 前缀，单斜杠 `/`**）
- 引用触发数据字段 = `#{<fieldId>}`（当前触发表单，**无前缀**）
- `assignments[].valueType="column"` 表示该值是公式；累加即 `#{目标/已入库}+#{触发/入库数量}`
- ⚠️ **viewJson 三字段**：`__display`=`"目标表字段.字段名+触发字段名"`（纯文本）；`__source` 和 `value` 都 = 原始公式（与 CLI 传入完全相同，不做任何转换）。详见避坑清单第 16 条。

**设计器四步配置（Playwright/手动路径）**：
1. 选更新方式：◉ 直接更新表单数据；选「子表」→ 选目标表单 → 选子表（树形：采购订单→采购明细）
2. 主条件：采购订单号 等于 → 触发数据的采购订单号
3. 子条件：产品名称 等于 → 触发子表的产品名称（引擎对每行自动迭代匹配）
4. 更新规则：已入库数量 的值设为「公式」→ `#{目标/已入库}+#{触发/入库数量}`；未获取到数据时 ◉跳过

---

## 3. 设计器 / Playwright 兜底操作路径（API 不足时）

当某节点无法通过 `integration-create.js` API 直建（当前仅剩：并行分支、Groovy 脚本、多分支/嵌套容器等复杂拓扑；脚本/条件分支/循环/子表匹配均已支持直建）时，走浏览器设计器页 `newDesigner.html?processCode=...&isLogic=true`：

**引擎入口（window 顶层）**：
- `window.logicSchema` — 当前画布完整 viewJson
- `window.canvasDocument` — 文档：`rootNode / children / createNode / insert / export`
- `window.canvasEngineAPI` — `editor / designer / addNode / setNode / selectNode / save`
- `window.flowNodes` — 节点类注册表（含各 Setter）

**稳定创建节点（不崩溃）+ 打开设置面板**：
```js
const doc = window.canvasDocument;
const nn = doc.createNode({componentName:'UpdateDataNode', props:{
  name:'更新数据', nodeName:'UpdateDataNode', description:'请设置要更新的数据', updateDataRules:{}
}});
doc.rootNode.children.insert(nn, /* 插入位置索引，如 StartNode 之后 */ 1);
nn.select();
window.canvasEngineAPI.editor.emit('SIMPLE_FLOW_EDITOR_MATERIAL_SELECT', nn); // 打开右侧设置面板
```
**读回已配置的 props（校验用）**：`const m={}; node.props.items.forEach(it => m[it.key]=it.getValue());`

**保存 & 发布**：`POST /alibaba/web/{appType}/query/simpleProcess/saveProcess.json`（保存和发布是同一接口）。

**确认发布 + 启用状态**：`GET /alibaba/web/{appType}/query/appLogicflowBinding/listflow.json?_api=Connector.getListflow&type=1&appType=<appType>&pageIndex=1&pageSize=50`
→ 响应 `content.data[]` 按 formUuid 分组，每组 `flowList[]` 含 `{processCode, name, status, lastAction, runRecordCount}`；`status:"y"`=启用、`lastAction:"更新已发布"`=已发布。
> ⚠️ 该 GET 走 `/alibaba/web/` 无需 csrf；但 `/dingtalk/web/` 下的 POST（发起流程/审批）需 csrf，而浏览器内 `tianshu_csrf_token` 为 httpOnly 读不到 + CSP 封阻 → 这类操作必须走 **Node + 根目录 `.cookies.json`** 通道。

---

## 4. API 接口说明

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
    { "type": "trigger", "nodeId": "node_xxx", "nextId": ["node_yyy"], "props": { } },
    { "type": "dataRetrieve", "nodeId": "node_yyy", "nextId": ["node_zzz"], "props": { } },
    { "type": "dataCreate", "nodeId": "node_zzz", "nextId": ["node_end"], "props": { } },
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
      { "componentName": "StartNode", "id": "node_xxx", "props": { } },
      { "componentName": "GetSingleDataNode", "id": "node_yyy", "props": { } },
      { "componentName": "AddDataNode", "id": "node_zzz", "props": { } },
      { "componentName": "EndNode", "id": "node_end", "props": { } }
    ]
  },
  "globalSetting": {}
}
```

---

## 5. 连接器预设

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

---

## 6. 获取自身节点说明

### 标准用法

```bash
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "获取自身后通知" \
  --events insert,update \
  --get-self \
  --receivers "user001" \
  --publish
```

`--get-self` 会自动在触发节点和消息通知节点之间插入一个「获取单条数据」节点：
- 来源表单：当前触发表单（formUuid）
- 查询字段：`pid`（可通过 `--get-self-query-field` 覆盖）
- 触发字段：`__masterdata_form_inst_id`（可通过 `--get-self-field` 覆盖）
- 匹配方式：等于

### 使用场景

- **流水号为空**：新增/编辑触发时，触发 payload 中的流水号可能为空或不是最新值
- **定时自动化**：定时触发值可能是历史数据
- **需要最新值**：先获取自身，再引用获取节点里的字段值

---

## 7. 发起审批节点说明

### 用法

```bash
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-A-XXX "A审批完成后发起B流程" \
  --events processFinish \
  --approval-actions agree \
  --get-self \
  --initiate-approval-form-uuid FORM-PROCESS-B-XXX \
  --initiate-approval-initiator-user "01376266634908:张三" \
  --initiate-approval-assignment "textField_b1:processVar:textField_a1" \
  --publish
```

### 注意事项

- 目标表单必须是流程表单（formType=process），普通表单请使用 `--add-data-form-uuid`
- `--initiate-approval-initiator-user` 必须提供，格式为 `userId[:name]`
- 字段赋值格式与 `--add-data-assignment` 相同
