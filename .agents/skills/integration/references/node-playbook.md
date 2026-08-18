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
   - ⚠️ **此条仅适用于 `AddDataNode` / `UpdateDataNode` / `DeleteDataNode`**，**不适用于 `InitiateApprovalNode`**（bundle 逆向确认：`InitiateApprovalSetter` 不读取 `inputs/rules`，它通过 API `getFormFieldsByFormUuid(formUuid, appType)` 异步加载字段，再调用 `transAssignmentsToActionRulesEditorRules(assignments)` 把扁平赋值转换为编辑器规则）。
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

17. **🔴 节点卡片/下拉框显示表单 UUID 而非表单名称 — viewJson 中表单名显示字段必须回填真实值**：
    - **背景**：`integration-create.js` 初始化 viewJson 时，所有表单名显示字段（`initiateApprovalFormName`、`addDataFormName`、`updateFormName`、`dataFormName`、`cycleUpdateFormName`）都被硬编码为 `''`（空字符串），且 `formTitle` 和 `targetItem.formItem.title` 等显示字段也留空。导致：
      - InitiateApprovalNode 卡片显示 UUID 而非表单名（`formTitle: ''`，description 回退到 `formUuid`）
      - UpdateDataNode 的"更新主表"下拉框显示 UUID 而非表单名（缺少 `targetItem` 字段）
      - GetSingleDataNode 的"从普通表单中获取"下拉框为空白（`targetItem.formItem.title: ''`）
      - **但功能不受影响**：processJson 中 `formUuid`/`sourceId` 有值，执行引擎正常工作。
    - **根因**：`create.js` 的 `buildViewJson`/`buildProcessJson` 调用中，`initiateApprovalFormName: ''`、`addDataFormName: ''`、`updateFormName: ''` 等全为硬编码空字符串——没有调用 `getFormName()` 获取真实表单名。
    - **修复方案（2026-08-05）**：
      1. `integration-api.js` 新增 `getFormInfo()` 和 `getFormName()` 函数（复用 `getFormAndAppInfo.json` 接口，取 `title.zh_CN`）
      2. `integration-create.js` 在获取各目标表单 Schema 后同步调用 `getFormName()` 获取真实表单名变量
      3. 将变量传递给 `buildViewJson`/`buildProcessJson`，替换硬编码空字符串
      4. `integration-view-builder.js` 回填 `GetSingleDataNode.targetItem.formItem.title`、`InitiateApprovalNode.initiateApprovalRules.formTitle`、`UpdateDataNode.updateDataRules.targetItem`（含 `formItem.title`）
      5. `integration-process-builder.js` 回填 `InitiateApprovalNode.formTitle`
    - **检查清单**（下次创建新节点时逐项确认）：
      - [ ] `initiateApprovalFormName` 是否从 `getFormName()` 获取并传递？
      - [ ] `addDataFormName` 是否从 `getFormName()` 获取并传递？
      - [ ] `updateFormName` 是否从 `getFormName()` 获取并传递？
      - [ ] `dataFormName` 是否从 `getFormName()` 获取并传递？
      - [ ] `cycleUpdateFormName` 是否从 `getFormName()` 获取并传递？
      - [ ] viewJson 中 `GetSingleDataNode.targetItem.formItem.title` 是否回填？
      - [ ] viewJson 中 `InitiateApprovalNode.initiateApprovalRules.formTitle` 是否回填？
      - [ ] viewJson 中 `UpdateDataNode.updateDataRules.targetItem` 是否包含 `formItem.title`？
      - [ ] processJson 中 `InitiateApprovalNode.formTitle` 是否回填？

18. **🔴 更新数据节点赋值用 `processVar`（字段引用）而非 `column`（公式）做简单字段复制 — 区别决定公式编辑器是否报红**：
    - **背景**：`--update-assignment` 的 `valueType` 参数有 `processVar` 和 `column` 两种：
      - `processVar` = "引用触发表单某字段的值"（如单价→单价复制），执行引擎直接取该字段值注入
      - `column` = "公式表达式"（如 `#{fieldA}+#{fieldB}`），执行引擎走公式解析器
    - **事故**：第一次创建更新规则时，用了 `--update-assignment "numberField_me82yifi:column:numberField_lte16io5"`，`valueType=column` 表示这是公式，但 `numberField_lte16io5` 不是公式（缺少 `#{}` 包裹），公式编辑器把字段ID当字面量解析→显示红色不可识别。实际只需要简单复制，应使用 `processVar`。
    - **正确用法**：
      - 简单字段复制：`column:processVar:triggerFieldId`（如 `numberField_me82yifi:processVar:numberField_lte16io5`）
      - 公式累加/计算：`column:column:#{目标/fieldId}+#{触发/fieldId}`（如 `numberField_me82yifi:column:#{FORM-xxx/fieldId}+#{fieldId}`）
    - **判别规则**：需要计算（加减乘除）→ `column`（公式）；只是引用另一个字段的值 → `processVar`（字段引用）

19. **🔴 获取单条/更新数据节点 `targetItem.formItem.formType` 必须与目标表单实际类型一致，否则UI下拉框显示空白**：
    - **背景**：`GetSingleDataNode`、`UpdateDataNode`、`CycleContainer` 内 UpdateDataNode 的 `targetItem.formItem.formType` 原本硬编码为 `'receipt'`（普通表单）。当目标表单是**流程表单（process）**时，UI 下拉框按 `formType` 匹配不到表单，显示为空白。
    - **但功能不受影响**：`sourceId` 指向真实表单 UUID，执行引擎按 ID 工作，不依赖 `formType` 字段。
    - **根因**：view-builder 在构建 `targetItem` 时直接写死 `formType: 'receipt'`，没有从 API 获取真实表单类型。
    - **修复方案（2026-08-05）**：
      1. `integration-create.js` 用 `getFormInfo()` 获取 `dataFormUuid`、`updateFormUuid`、`cycleUpdateFormUuid` 的真实 `formType`
      2. 将 `dataFormType`、`updateFormType`、`cycleUpdateFormType` 传递给 view-builder
      3. view-builder 使用真实值替换硬编码 `'receipt'`，保留 `|| 'receipt'` 兜底
    - **检查清单**：
      - [ ] `dataFormType` 是否从 `getFormInfo()` 获取并传递？
      - [ ] `updateFormType` 是否从 `getFormInfo()` 获取并传递？
      - [ ] `cycleUpdateFormType` 是否从 `getFormInfo()` 获取并传递？
      - [ ] `GetSingleDataNode.targetItem.formItem.formType` 是否使用真实值？
      - [ ] `UpdateDataNode.updateDataRules.targetItem.formItem.formType` 是否使用真实值？
      - [ ] `CycleContainer` 内 UpdateDataNode 的 `targetItem.formItem.formType` 是否使用真实值？

20. **🔴 获取数据节点 `getData.originalType` 必须与目标表单实际类型一致，否则表单选择框为空**：
    - **背景**：`GetSingleDataNode`/`GetBatchDataNode` 的 `getData.originalType` 原本硬编码为 `'form'`（普通表单）。当目标表单是**流程表单（process）**时，UI 表单选择器按 `originalType` 过滤表单列表——`originalType="form"` 只加载普通表单，流程表单不在列表里，所以选择框为空白。
    - **但功能不受影响**：`sourceId` 有值，执行引擎按 UUID 工作，不依赖 `originalType`。
    - **根因**：view-builder 和 process-builder 中 `dataOriginalType` 的计算只区分 `sub_table` 和 `form`，没有考虑 `process`。
    - **修复方案（2026-08-05）**：
      1. view-builder.js：`const dataOriginalType = isSubformSource ? 'sub_table' : (dataFormType === 'process' ? 'process' : 'form');`
      2. process-builder.js：同上逻辑
      3. process-builder.js 解构中补充 `dataFormType` 参数
      4. create.js 的 `buildProcessJson` 调用中传递 `dataFormType`
    - **originalType 合法值**（bundle 验证）：`form`(普通表单)、`process`(流程表单)、`process_form`、`node`(前置节点)、`association`(关联表单)、`sub_table`(子表)、`data_service`(数据服务)
    - **v2.8.8 精确化（金标准验证）**：目标表单是流程表单时，`GetSingleDataNode` 用 `process_form`（单条），`GetBatchDataNode` 用 `process`（多条）。计算式：`sub_table | (dataFormType==='process' ? (multiple ? 'process' : 'process_form') : 'form')`。

21. **🟢 CycleContainer 内 InitiateApprovalNode（v2.8.0 起为标准支持功能，格式已最终确认）**：
    - **用途**：遍历子表行逐行在目标流程表单发起审批（如：提交一条带多条明细的单据，对每条明细各发起一条审批流程）。
    - **CLI 参数**：`--cycle` + `--cycle-initiate-approval-form-uuid` + `--cycle-initiate-approval-assignment`（可多次）
    - **viewJson 格式**（v2.8.0 设计器 setter tree 选择器逆向确认金标准）：
      - `signAction='one_by_one'` 顶层字段（必须）
      - `assignments[].value` = **`${cycleNodeId}.fieldId`** 格式（如 `${node_xxx}.textField_570rac0i`）—— setter tree 选择器中"当前循环执行的数据"展开后子选项的 value 就是此格式
      - `assignments[].__display` = **源字段中文名**（如 `"任务名称"`）—— setter 在未加载 `getFormVariables.json` API 时用此字段显示，缺少则显示空白
      - `initiator.type='form_field'` + `initiator.value=<真实 EmployeeField 字段ID>`（如 `employeeField_lus0jwc4`）—— ❌ 空值会导致设计器保存弹窗拦截；❌ `form_inst_creator` 能保存但设计器显示原始文本；✅ 真实 EmployeeField 设计器显示字段中文名（如"项目经理"）
    - **❌ v2.6.0 格式错误**：`assignments[].value` = 裸 `cycleNodeId`（如 `node_bd984b2569e`）—— setter 全部显示"当前循环执行的数据"整体，不显示具体字段名
    - **❌ v2.7.0 格式错误**：`assignments[].value` = `cycleNodeId//fieldId`（如 `node_xxx//textField_570rac0i`）—— setter 不识别此格式，保存后回退为空
    - **✅ v2.8.0 正确格式**：`assignments[].value` = `${cycleNodeId}.fieldId`（如 `${node_xxx}.textField_570rac0i`）—— Playwright 逆向 setter tree 选择器确认
    - **设计器面板**：v2.7.0 新增 `integration-designer-fix.js` 脚本修复首次点击渲染空白问题。v2.8.0 确认必须加 `--save` 参数触发工具栏保存（面板内"保存"只应用到本地画布，不触发 `saveProcess` API）。创建后执行：`node .agents/skills/integration/scripts/integration-designer-fix.js <appType> <processCode> --save`
    - **历史**：v2.5.8~v2.5.9 曾误判为"宜搭前端框架限制"并加 CLI 硬拦截；v2.6.0 实测确认 viewJson 格式正确后面板可正常显示，v2.7.1 正式移除硬拦截恢复为标准功能；v2.8.0 最终确认 `assignments[].value` 的正确格式为 `${cycleNodeId}.fieldId`（经历了裸 cycleNodeId → cycleNodeId//fieldId → ${cycleNodeId}.fieldId 三轮试错），并发现缺少 `__display` 导致首次加载空白、面板保存不等于服务器保存三个问题叠加。

23. **🔴🔴 发起审批节点主链/循环内两套 setter 期望格式（v2.8.0 最终确认 + 修复）**：
    - **症状**：发起审批节点设计器面板字段设置右侧显示为空 / 选择发起人显示与预期不符。
    - **v2.8.0 最终确认**：发起审批节点**分主链和循环内两套 setter 期望格式**，循环内 `assignments[].value` 格式经历了三轮试错才最终确认：
      1. **主链发起审批 setter 期望格式**（金标准：手动配置的 LPROC-KX966O71UT383IQEK2A0QA0GA40335AB56HSM01）：
         - 无 `signAction` 顶层字段
         - `assignments[].value` = 裸字段 componentId
         - `initiator.type='form_field_list'` + `initiator.value='["form_inst_creator"]'`
         - setter UI "选择发起人"显示未选中是**宜搭正常 UI 行为**（不影响功能）
      2. **循环内发起审批 setter 期望格式**（v2.8.0 设计器 setter tree 选择器逆向确认金标准）：
         - `signAction='one_by_one'` 顶层字段（必须）
         - `assignments[].value` = **`${cycleNodeId}.fieldId`** 格式（如 `${node_xxx}.textField_570rac0i`）
           - ❌ v2.6.0 用裸 cycleNodeId → setter 全部显示"当前循环执行的数据"整体
           - ❌ v2.7.0 用 cycleNodeId//fieldId → setter 不识别，保存后回退为空
           - ✅ v2.8.0 用 ${cycleNodeId}.fieldId → setter 正确显示各字段名
         - `assignments[].__display` = **源字段中文名**（如 `"任务名称"`）——缺少则首次加载显示空白
         - `initiator.type='form_field'` + `initiator.value=<真实 EmployeeField 字段ID>`（如 `employeeField_lus0jwc4`）—— ❌ 空值会导致设计器保存弹窗拦截；❌ `form_inst_creator` 能保存但设计器显示原始文本；✅ 真实 EmployeeField 设计器显示字段中文名（如"项目经理"）
    - **v2.8.0 修复动作**：
      - `view-builder` 主链：**保留 v2.5.6 原始格式**（form_field_list+form_inst_creator，裸字段 ID，无 signAction）
      - `view-builder` 循环内：升级为 v2.8.0 金标准格式（assignments[].value=`${cycleNodeId}.fieldId` + `__display`=源字段中文名, initiator=form_field+真实EmployeeField, signAction=one_by_one）
      - `view-builder` 新增 `lookupFieldLabel(triggerFormSchema, fieldId)` 函数自动查找源字段中文名作为 `__display`
      - `process-builder` 循环内 assignments 同步使用 `${cycleNodeId}.fieldId` 格式
      - `create.js` subform 模式下强制 `dataQueryType='multiple'`（修复体检报 `RETRIEVE_EMPTY_CONDITION`）
      - `create.js` `findSubmitterFieldId` 三级回退（v2.8.2）：①label含"提交"的EmployeeField → ②主表第一个EmployeeField → ③`form_inst_creator`（最后手段）
      - `create.js` 新增 `--cycle-initiate-approval-initiator <fieldId>` CLI 参数支持手动指定发起人字段（v2.8.2）
      - `integration-designer-fix.js` 保存流程改为 React `__reactEventHandlers$.onClick` 调用 + 每次保存后检查错误弹窗（v2.8.2）
    - **⚠️ 面板保存 ≠ 服务器保存**：设计器面板内的"保存"按钮只应用到本地画布状态，必须点击页面顶部工具栏的 `simple-flow-canvas-save` 按钮才触发 `saveProcess` API 持久化到服务器。`integration-designer-fix.js --save` 会自动点击工具栏保存按钮。
    - **v2.7.1 移除 CLI 硬拦截**：`--cycle` + `--cycle-initiate-approval-form-uuid` 组合已恢复为标准支持功能。view-builder 自动生成循环内正确格式，无需外部手动覆盖。创建后执行 `integration-designer-fix.js --save` 修复设计器面板首次渲染并持久化。
- **v2.8.2 修复**：①initiator 为空→设计器弹窗拦截但 API 不报错→添加 fallback ②`form_inst_creator` 设计器显示原始文本→`findSubmitterFieldId` 增加二级回退（主表第一个 EmployeeField） ③保存流程改为 React onClick + 检查弹窗。详见硬规则 10/12。

22. **🟢 流程表单自动降级（v2.6.0+，不再需要手动切换节点类型或指定发起人）**：
    - **背景**：AddDataNode 只支持普通表单(receipt)，InitiateApprovalNode 只支持流程表单(process)。之前遇到类型不匹配时 `assertFormType` 直接 `process.exit(1)` 报错退出，需要用户手动改用正确的 CLI 参数并指定发起人 userId。
    - **自动降级逻辑**（2026-08-06 新增）：
      - `--add-data-form-uuid` 指向流程表单(process) → 自动切换为「发起审批」节点，`--add-data-assignment` 原样转为 `--initiate-approval-assignment`，发起人默认用**触发数据的提交人**（`form_inst_creator`，type=`form_field_list`，bundle 逆向确认）
      - `--initiate-approval-form-uuid` 指向普通表单(receipt) → 自动切换为「新增数据」节点，`--initiate-approval-assignment` 原样转为 `--add-data-assignment`
      - 降级时控制台输出 `⚠️ 自动降级:` 提示信息，包含目标表单名称和降级方向
      - 降级后节点 ID 自动重新生成，processJson/viewJson 按新节点类型构建
    - **发起人默认值**（bundle 逆向确认）：
      - 默认使用触发数据提交人：`{ type: 'form_field_list', value: '["form_inst_creator"]' }`
      - bundle 源码（InitiateApprovalSetter）Radio 选项：`select_user_list`=指定成员、`form_field_list`=表单成员字段
      - 序列化代码：`value: type==='select_user_list' ? JSON.stringify(userArray) : JSON.stringify(fieldIdArray)`
      - 执行引擎（processJson）：`"select_user"===type ? JSON.parse(value) : value`（非 select_user 类型直接用 value）
      - `--initiate-approval-initiator-user` 仍可手动指定固定用户（type=`select_user`），但默认不再需要
    - **验证器修复**（同期）：`integration-validate.js` 在 processJson 为空回退 viewJson 时，新增 `GetSingleDataNode/GetBatchDataNode`（`getData`）、`DeleteDataNode`（`deleteData`）、`InitiateApprovalNode`（`initiateApprovalRules`）的 props 展平逻辑，修复了 `RETRIEVE_EMPTY_SOURCE` 误报。

24. **🔴🔴 删除目标表单子表行的两种获取模式（v2.8.8 最终确认，以设计器手工配置 viewJson 为金标准）**：
    - **症状**：创建"删除目标表单子表行"逻辑流后，设计器里「获取多条数据」节点显示「从数据节点中获取」而非期望的「从子表中获取」。
    - **根因（v2.8.8 真实根因，已修复）**：cascade（5 节点）模式下节点3（GetBatchDataNode）的 `originalType` 错误地写成 `"node"`（因 sourceId 指向上游节点）。**事实**：手工配置金标准显示节点3 的 `originalType` 应当是 **`"sub_table"`**——即便 `sourceId` 指向上游节点，只要 `subSourceId` 指定目标子表且需要从该节点的子表取行，`originalType` 就必须是 `"sub_table"`。`originalType` 是设计器区分"从子表中获取"vs"从数据节点中获取"UI 的**根本字段**。
    - **手工配置 viewJson 金标准**（截图确认，三件套）：
      ```
      originalType="sub_table"
      sourceId=上游节点ID（如 "node_xxx"）  // 数据节点=获取单条数据
      subSourceId=目标子表字段ID             // 子表=产品规格
      filterType="condition"
      condition={仅子表字段条件（如规格=触发.规格），不需主表名称条件}
      ```
    - **v2.8.8 修复**：`integration-view-builder.js` chain mode 第 487 行 + `integration-process-builder.js` 第 612 行：`originalType: 'node'` → `originalType: 'sub_table'`。
    - **错误推断教训**：不要从代码字段名（如 `sourceId=节点`）或 viewJson 字面值（如 `subSourceId=子表`）去**推断** `originalType`。**必须以设计器手工配置的 viewJson 为金标准**——创建一条手工流程 → 导出 viewJson → 字段逐一对照，才能确定正确组合。
    - **三种"子表"路径的完整区分**：
      - **模式 A：sub_table 直接获取（4 节点）**：`originalType="sub_table"` + `sourceId=#{目标表单}` + `subSourceId=目标子表`（无前置获取单条节点），用于"子表条件字段值全局唯一"场景
      - **模式 B：cascade 从上游节点取子表（5 节点，v2.8.8 修正）**：`originalType="sub_table"` + `sourceId=上游节点ID` + `subSourceId=目标子表` + 前置"获取单条(主表按主字段定位)"节点
      - **`subform` 触发数据子表**：`originalType="sub_table"` + `sourceId=#{触发表单}` + `subSourceId=触发子表`（通过 `--data-source-type subform --data-sub-field-id`）
    - **v2.8.7 修复保留**：模式 A（`--data-sub-source-id` 单独使用）原 cando 未在 view-builder 应用，已 v2.8.7 + v2.8.8 双层修复

---

## 2. ★★★ 黄金配方：direct_form 直接更新（已上线验证，覆盖 90% 同步场景）

> **⚠️ 方案选择铁律（判别标准=动作类型，不是数据拓扑）**：
> 数据同步/累加/upsert（更新或新增另一张表的数据）**一律 direct_form（直接更新），3 节点搞定**——
> 无论触发数据来自主表字段还是子表明细行（含"子表明细→目标主表记录"，如采购入库.入库明细→库存信息主表，引擎自动逐行迭代匹配，已实际验证）。
> 循环容器（--cycle）**仅用于对「获取多条数据」的每条结果逐条执行非更新类动作**（**消息通知/连接器调用/发起审批**等），它不是数据同步的备选方案。
> **"发起审批" ≠ "新增数据"**：发起审批是创建流程实例（审批流程），不是更新/新增数据记录，必须用循环容器+发起审批节点（InitiateApprovalNode）。
> 详见 SKILL.md 方案选择决策树。**历史上同一根因两次把"采购入库同步库存"误建成 5 节点循环流，实际只需 direct_form 直接更新；已验证成功配置见 `docs/采购入库同步库存-集成自动化配置指南.md`。**
> **第三次事故（v2.8.1修复）**：另一个 AI 把"任务分派子表→任务执行发起审批"误用 direct_form 更新数据节点，根因是 5.1 只提"消息通知、连接器调用"未明确提"发起审批"。

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
  --initiate-approval-assignment "textField_b1:processVar:textField_a1" \
  --publish
```

### 注意事项

- 目标表单必须是流程表单（formType=process），普通表单请使用 `--add-data-form-uuid`
- 发起人默认使用触发数据提交人 `form_inst_creator`（bundle 逆向确认，无需手动指定）
- 字段赋值格式与 `--add-data-assignment` 相同
- **viewJson 结构**：详见 [canonical-node-shapes.md](canonical-node-shapes.md) 的 InitiateApprovalNode 章节
- **⚠️ 重要**：`initiateApprovalRules` **不需要** `inputs.childList` 和 `rules.rules`（bundle 确认 `InitiateApprovalSetter` 不读取这些字段，它通过 API 异步加载字段）
- 如需手动指定发起人用户，使用 `--initiate-approval-initiator-user "userId:name"`（type=`select_user_list`）
