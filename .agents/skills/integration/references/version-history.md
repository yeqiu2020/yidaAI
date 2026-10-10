# integration 版本历史

> 本文件从 SKILL.md 拆分而来（渐进式披露）。按需加载：需要了解某个能力何时引入/修复了什么问题时查阅。

## v2.8.28 (2026-08-22)

**场景**：v2.8.27 后（`id` 已带 `${}` 包裹）用户测试 LPROC-KKC66 仍报"span 显示'获取单条数据.实例ID'是对的，但下拉（ul）里没选中该字段"。

**核因 / 教训**：把用户手配金标准（captured_save.json）与 CLI 生成流的条件规则**逐字符 diff**，发现 CLI 多写了两个键：`value: ""` 和 `ruleValue: ""`——金标准里这两个键**不存在**（ExistValue"有值"是无值比较操作符，设计器手配保存时不写值键）。设计器条件 setter 拿规则的 `value` 去匹配下拉选项 key，空字符串匹配不上 `${node}.pid` → span 靠 name 渲染显示正确，但选中态失败（不选中+标红）。与 v2.8.27 的 `${}` 丢失**同症状不同根因**：都是"显示对但下拉不选中"，v2.8.27 坏在 id 缺 `${}`，v2.8.28 坏在多了空 value 键。

**修复**：`integration-process-builder.js` 两处——① `buildConditionNodeProps`：无值操作符（ExistValue/NotExistValue）不写 `value`/`ruleValue` 键（条件展开 `...(ruleValue === undefined ? {} : { value: ruleValue })`）；② `buildExistenceBranchCondition`：去掉 `value: ''` 输入。新增单测断言：P0.13 规则无 value/ruleValue 键、P0.14 返回对象无 value 键。37 项回归全通过。

**教训**：金标准 diff 必须**键集合级别**对比（哪些键存在/缺失），不能只对比值——多一个空键同样致命。已固化到硬规则 18。

## v2.8.27 (2026-08-22)

**场景**：v2.8.26 后用户重建流（LPROC-KKC66）仍报"条件分支字段显示是对的（span 显示'获取单条数据.实例ID'），但下拉里没选中该字段、标红"。

**核因 / 教训**：`integration-create.js` 生成条件规则用的是**未转义模板字符串** `` `${dataNodeId}.pid` ``——JS 把 `${dataNodeId}` **插值成节点ID**，产出 `"node_xxx.pid"`，**字面量 `${}` 包裹被吃掉**。设计器变量树下拉按 `${node}.pid` 整串匹配选项键，缺 `${}` 就匹配不到 → 靠 name 渲染的 span 显示正确，但 select 值对不上（未选中+标红）；运行时引擎也无法按 `${node}` 变量表达式解析 → 恒判"无值" → 永远走默认分支重复插入。**连续三个版本（v2.8.23/24/26）的注释都写了"必须带 `${}` 包裹"，但代码全是插值写法，且"验证"环节只对比了字段名没逐字符对比 `${}`——教训：对比金标准必须逐字符 diff，不能只看字段名/后缀。**

**修复**：正确写法是转义模板 `` `\${${dataNodeId}}.pid` ``（同硬规则10 循环赋值 v2.8.0 已验证的写法）。抽成 `integration-process-builder.js` 导出函数 `buildExistenceBranchCondition(dataNodeId)`（可单测），create.js 调用之。

**验证**：新增 P0.14 单测断言 `fieldId === '${node_abc123}.pid'`；P0.13 断言 builder 不剥离 `${}`；37 项回归全通过。CLI 修改模式重建 LPROC-KKC66 并发布，回读 viewJson 条件1规则 `id="${node_95acd9e3dc2}.pid"`，与金标准（用户手配 `${node_8d3181987be}.pid`）逐字符一致；体检通过。

## v2.8.26 (2026-08-21)

**场景**：曾把条件分支引用「获取数据节点输出」的实例ID键从 `.pid` 错改成 `.proc_inst_id`，结果设计器条件 setter 标红、下拉不选中（用户实测踩坑）。

**核因 / 教训**：`.proc_inst_id` 是**数据节点自身的「表单筛选字段」**（见 dataNode/getConfig.json 字段表），而**条件分支引用节点输出**的实例ID键固定是 **`.pid`**——两者是不同上下文，不能拿表单筛选字段键去替换节点输出引用键。判断键是否正确必须对照「设计器变量树/用户手工配置金标准」（temp-file/csa66_golden.json 条件规则 id=`${node_8d3181987be}.pid`），**不要用 getConfig 的表单字段表去推断分支引用键**。

**定论（正确写法）**：条件1 规则 = `id:"${node}.pid"`、`op:"有值"`、`opCode:"ExistValue"`、`extValue:"value"`、`valueType:"literal"`、`name/__display:"获取单条数据.实例ID"`，与用户手配金标准逐字段一致。

**验证**：`integration-create.js` conditionalUpsert 分支字段改回 `${dataNodeId}.pid`；builder 单测断言 `id=${node}.pid`、`extValue=value`、`op=有值`、`opCode=ExistValue`、`valueType=literal` 全部通过。

## v2.8.24 (2026-08-21)

**场景**：`--conditional-upsert` 重建流后，条件分支"条件1" id 已正确指向 `${node}.pid`（name="获取单条数据.实例ID"），但用户在设计器中看**仍然未选中"获取单条数据"节点的实例ID**（连续多次踩坑）。

**核因**：仅 `id` 正确不够。生成的条件规则 `extValue` 被写成 `"literal"`（= `valueType`），用户手配金标准（temp-file/csa66_golden.json 条件规则）是 `extValue="value"`、`valueType="literal"`。设计器条件 setter 用 `extValue` 区分"固定字面量"与"节点变量/值引用"，`extValue="literal"` 时即便 id 是 `${node}.pid` 也当成固定字面量渲染，表现为未选中节点实例ID。

**修复**：`integration-process-builder.js` `buildConditionNodeProps` 中，凡条件字段 `fieldId` 是节点变量引用（含 `.`）则强制 `extValue='value'`（`valueType` 保持 `literal`）。普通表单字段条件不受影响。

**验证**：重建并发布流 LPROC-ZJH66X71CBJ8WK9UFJDVA96RYDK427G4CU2TM9，回读 viewJson 条件1规则 = `{id:"node_c85e1797779.pid", op:"有值", extValue:"value", valueType:"literal", name:"获取单条数据.实例ID", __display:"获取单条数据.实例ID", opCode:"ExistValue"}`，与金标准一致。builder 回归 36 项全通过；P0.13 测试追加 `extValue=value` 断言防回归。已同步硬规则第18条并分发。

## v2.8.23 (2026-08-21)

**场景**：`--conditional-upsert` 重建流时，用户发现条件分支"条件1"选择的是固定字段"实例ID"四字，而非真正的"获取单条数据"节点变量，运行时判断失效。

**核因**：`integration-create.js` conditionalUpsert 生成条件规则 `fieldId: ${dataNodeId}.processInstanceId`、`fieldName:'实例ID'`。`.processInstanceId` 不是设计器变量树里"获取单条数据.实例ID"的真实引用键；且 `__display='实例ID'` 让设计器面板只显示固定"实例ID"字样，无法绑定到节点变量 → 运行时取不到实例ID。

**修复**：条件规则改为 `fieldId: ${dataNodeId}.pid`、`fieldName:'获取单条数据.实例ID'`。`.pid` 是设计器变量树中"获取单条数据.实例ID"的 id 后缀（用户手工配置金标准 temp-file/csa66_golden.json 实证）。`name/__display` 用"获取单条数据.实例ID"让设计器正确显示为节点变量。

**验证**：重建流 LPROC-QEF660（未发布）回读 viewJson，条件1规则 = `{id:"node_xxx.pid", op:"有值", opCode:"ExistValue", name:"获取单条数据.实例ID", __display:"获取单条数据.实例ID"}`，正确引用获取节点实例ID。已同步硬规则第18条。

## v2.8.22 (2026-08-21)

**场景**：extracted branch-upsert flow `LPROC-O5C66LD1Y4H89RMWNJREEDNPLAI930JE8P2TM89`（主表操作主表2→upsert目标表单1）回读体检发现 `RETRIEVE_DANGLING` 警告：获取单条数据的输出没有被下游引用。但条件分支规则 `id: "node_xxx.processInstanceId"` 明明引用了该获取节点——误报。

**核因**：`integration-validate.js` 的 viewJson 降级路径（processJson.nodes 为空时）只用 `content.schema.children.map(...)` **只展平顶层节点**。条件分支容器 `ConditionContainer` 的 props 只有 `{name:'条件分支'}`，真正引用获取节点输出的条件规则嵌套在分支子节点 `ConditionNode` 的 conditions 里，不在顶层 props 中。`isNodeReferenced()` 遍历的 nodes 里看不到该引用 → 误报断链。

**修复**：把降级路径改为递归 `flattenComponents(content.schema.children)` 展平所有嵌套子节点（含 ConditionContainer 的 children），补充 typeMap（ConditionContainer/ParallelNode/CycleContainer→route、InitiateApprovalNode→initiateApproval），并对嵌套的 UpdateDataNode/AddDataNode/GetDataNode/DeleteDataNode/InitiateApprovalNode 做同样的 props 展平。这样分支内对获取节点输出的引用能被正确识别。

**验证**：`integration-validate.js` 线上回读 `LPROC-O5C66...` 由"1 个警告"变为"体检通过：8 个节点未发现问题"。builder 测试 36 项全过无回归。

## v2.8.21 (2026-08-21)

**场景**：`--conditional-upsert` 生成的条件分支「条件1」用**业务匹配字段**（如名称）做 ExistValue「有值」判断数据是否存在。业务字段可能为空但记录已存在，会把"已存在"误判为"不存在"导致重复插入。

**核因**：`integration-create.js` conditionalUpsert 自动生成分支条件时，用了 `--data-condition` 里的业务字段（`${dataNodeId}.字段`）。判断"数据是否存在"应使用**获取数据节点的实例ID**，而非业务字段。

**修复**：CLI 在 `conditionalUpsert` 模式且未显式传 `--branch-condition` 时，条件1 用 `${dataNodeId}.processInstanceId` + `ExistValue`（`name/__display=实例ID`）。conditionalUpsert 语义下"新建一律走发起审批"，目标必为流程表单；`processInstanceId` 为流程表单实例ID系统字段（getFormVariables 接口实测确认）。

**验证**：重建 `LPROC-O5C66...` 回读 viewJson，条件1 规则 `id: "node_13ae7a5dbfb.processInstanceId"`、`opCode: ExistValue`、`__display: 实例ID`，与要求一致。

## v2.8.20 (2026-08-21)

**场景**：用 `--conditional-upsert` 创建"存在则更新/不存在则插入"的显式分支逻辑流后，用户打开设计器发现**分支里面没有节点，节点在分支外面**。回读 viewJson 实证：`ConditionContainer` 的 children 只有两个 ConditionNode（分支内为空），而 `UpdateDataNode`/`InitiateApprovalNode` 被平铺在 CanvasEngine children 顶层（与容器同级）。

**核因**：`integration-view-builder.js` 的 conditionalUpsert 模式（v2.8.13 引入）只做了两件事：①分支容器与动作节点的 nextId 接线（processJson 层，正确）；②v2.8.16 把 ConditionContainer 挪到「获取单条数据」之后。但**从未把 UpdateDataNode/InitiateApprovalNode 嵌套进 ConditionNode.children**。宜搭设计器渲染"分支内动作"依赖 viewJson 的**层级嵌套**（如同 CycleContainer 循环体节点放 children），仅靠 processJson nextId 接线不足以让画布把节点画进分支内。

**修复**：conditionalUpsert 后处理中，把平铺在 children 顶层的 UpdateDataNode 摘出嵌入「条件1」ConditionNode.children、InitiateApprovalNode 摘出嵌入「其他情况」ConditionNode.children（children[0]/children[1] 对应）。processJson 无需改动（接线本来正确）。

**验证**：
1. 重建逻辑流 `LPROC-N4G662A1F1J8NU8IN0OL58ATL15K29ZR6I2TMU`，CLI 回读树确认：触发→获取→条件分支[条件1→更新数据 / 其他情况→发起审批]→结束，动作节点在 ConditionNode.children 内。
2. Playwright 打开设计器 `window.logicSchema` 确认相同嵌套结构，用户确认画布渲染正确（"这次终于对了"）。

**固化位置（用户明确要求固化）**：
1. **硬规则 18**（`references/集成自动化硬规则.md`，已运行 `node scripts/sync-hard-rules.js` 同步到 .trae/rules、.cursor/rules、AGENTS.md、CLAUDE.md）：画布嵌套铁律 + 场景识别 + 标准 CLI 模板 + 验证闭环（回读确认嵌套→体检→打开设计器确认画布）。
2. **node-playbook.md 避坑清单第 25 条**：症状/根因/修复/正确 viewJson 形状/通用教训（容器类节点子节点一律层级嵌套）。
3. **canonical-node-shapes.md**：新增「分支内挂动作节点」金标准形状（含条件1 的 ExistValue 有值判断完整 conditions 结构）。
4. **cli-examples.md**：决策树新增显式分支分支说明 + 第 1 节新增完整 CLI 示例（含实测流 processCode 引用）。

**教训**：分支内动作节点必须作为 ConditionNode.children 嵌套，不能平铺（与 CycleContainer 循环体内节点同构）。conditionalUpsert 的"接线正确"不等于"画布正确"，两者都要验证；凡涉及容器类节点（条件分支/循环/并行）的逻辑流，创建后必须打开设计器亲眼确认画布渲染，不能只看回读 JSON。

## v2.8.19 (2026-08-21)

**场景**：承接 v2.8.18 的「卡片显示表单 UUID」缺陷，后续发现同一流的**发起审批节点发起人显示「未知」**（点进 setter 才解析出正确姓名）。核因：发起人 `select_user.value` 的 JSON 里 `label` 落成占位名「未知」，卡片直接读 `label` 导致显示未知；`id` 正确。根查结论——CLI 默认发起人 `integration-create.js` 取 `login_user.userName`(叶秋) 作 label，builder 还有 `label||id` 兜底，**CLI 产出永不等于"未知"**（"未知"来自旧版/设计器手工编辑占位），故仅需对线上流补丁 label 回写「叶秋」。

**根源加固**：给 `integration-validate.js` 增加**显示名体检门禁**，堵住"能跑但显示难看"的展示名问题（saveProcess 不校验展示名，手动/其他 AI 产的流可能带 UUID/占位 label 压进线上）：
1. `DISPLAY_FORM_NAME_AS_UUID`（error）：各节点 `node.description / props.description / node.name` 残留 `FORM-XXXX`，说明表单名回退成了 UUID。注意 initiateApproval 的 `node.description='请设置发起审批'` 会短路真实描述，故 display 文本必须**逐字段独立检测**，不能用 `||`。
2. `DISPLAY_INITIATOR_LABEL`（error）/ `DISPLAY_INITIATOR_LABEL_ID`（warning）：`select_user` 发起人 `value` JSON 里 label 为「未知」/空（error，卡片显示未知）、等于 id（warning，显示一长串数字）。
- 门禁随 create 保存前调用自动生效（integration-create L1133），audit 模式对任意已有流同样拦截。

**验证**：`node --check` 通过；单元用例「未知+UUID→2 error / 空label→error / label=id→warning / 正常→通过」全绿；对线上已修补流 LPROC-CSA66...TM74 端到端审计无新增 DISPLAY 错误（不多拦正确配置）。

**教训**：展示名（表单名、发起人姓名）属于"不校验也能保存"的字段，必须靠保存前门禁兜底，不能只依赖构建端填对一次。

## v2.8.18 (2026-08-21)

**场景**：`--conditional-upsert` 创建的流程 LPROC-CSA66...TM74，设计器卡片上显示的是**表单 UUID**（如 `FORM-9AE...`）而非表单名称，用户在网页上反馈"卡片显示的不是表单名而是表单ID，不知道什么原因"。

**根因**：`integration-create.js` 构建 `processJson`/`viewJson` 时，把各目标表单的展示名**硬编码为空字符串**——`initiateApprovalFormName: ''`、`updateFormName: ''`、`addDataFormName: ''`、`dataFormName: ''`。而 view/process builder 里取展示名都是 `xxxFormName || xxxFormUuid`，名称为空就回退成 UUID 撑进 `targetItem.label`/`description`（如 `在 [FORM-9AE...] 中发起一条审批`），于是画布卡片露出表单 ID。更新节点因 `updateFormName=''` 回退成写死的"目标表单"，也不是真实表单名。

**修复**（`integration-create.js`）：
1. 构建 JSON 前并行调用 `getFormName`（复用 `getFormInfo` 的 `title.zh_CN`）拉取发起审批/新增/更新/获取数据/循环更新/循环发起审批六类目标表单的真实名称，填充到对应变量。
2. 删除原先 `let dataFormName=''` 的重复声明，避免与解构 `const` 冲突。
3. 线上已生成流回读只返回 `schema`+`globalSetting`（逻辑流执行 `json` 由设计器从画布派生，无法经 `getProcess` 取回），因此用 Playwright 拦截设计器一次真实保存，复用它派生出的 `json`，仅把 `viewJson.schema` 的 `targetItem.label`/各节点 `description` 补丁为真实表单名，`sourceId`/`formUuid`/`value` 等执行键保持 UUID 不变，回写发布。回读校验确认服务器上已无 label/description 残留 FORM- UUID。

**验证**：`getFormName` 对目标表单返回"目标表单1"、触发表单返回"主表操作主表2"；`node --check` 通过；线上流草稿保存+发布均 success；回读服务器确认显示名全部替换为表单名且执行键不变。

**教训**：**能拿真实名的 UI 展示字段，绝不硬编码空串；builder 里 `|| formUuid`/`|| '目标表单'` 兜底只是最后防线**。建流前先 `getFormName` 填充展示名，避免把兜底当常态。逻辑流 `getProcess` 不返回独立 `json`，改现有流展示名时务必以设计器派生 payload 为权威，只改展示层字段。

## v2.8.17 (2026-08-20)

**场景**：创建"主表操作主表1-删除目标表单1"规则时（流程表单源 delete 事件 → 目标流程表单按名称+流程状态删除），`--data-condition "process_status:流程状态:已完成:SelectField:Contain::literal"`（双冒号 `::literal`）保存后回读发现"流程状态"条件的 valueType 被存成 `processVar`，值"已完成"被当成变量引用，运行期永不匹配。

**根因（源头不一致）**：`integration-create.js` 里条件解析存在**两套段位格式**：
- **data/sub/delete-condition**（获取/删除过滤）：6 段 `bFieldId:bFieldName:value:componentType:opCode:valueType`，valueType 读 `parts[5]`
- **update-condition**（更新条件）：7 段 `...:opCode:opValue:valueType`，valueType 读 `parts[6]`

用户/文档习惯用 update 风格的双冒号 `opCode::valueType` 写 data 系列，但 data 系列只读 `parts[5]`（双冒号时为空串）→ `|| 'processVar'` 回退成变量引用 → 字面量"已完成"被误当变量。**保存"成功"但条件永远不成立**，且 `integration-validate.js` 的说明性错误码（PLACEHOLDER_LITERAL 等）只查 literal 占位符、不查此反向类型标反，未被拦截。

**修复**（源头加固，两层防御）：
1. `integration-create.js`：新增 `pickValueType(parts)`，从 `parts[5]`/`parts[6]` 取首个非空段兼容单/双冒号；应用到 6 段式条件解析器 `--data-condition` / `--data-sub-condition` / `--delete-sub-condition` / `--trigger-condition` / `--branch-condition`。update-condition 系列为 7 段（含真正的 opValue），保持 `parts[6]` 不变。
2. `integration-validate.js`：新增 `detectVarLiteralMisuse` 兜底门禁——`valueType=processVar` 但值含中文业务字面量（如"已完成"）时，报 `LITERAL_AS_VAR` 错误码，保存前硬拦截"把字面量错标成变量引用"。

**验证**：36 项离线断言全绿；`integration-validate.js` 回归通过（rule3 LPROC-9UF66 体检通过）；7 项手工用例验证双/单冒号与门禁拦截/放行全部符合预期。规则3 已改回单冒号 `Contain:literal` 重新生成，回读 valueType=`literal`+extValue=`value` 正确。

**教训**：跨参数的条件 segment 布局不要随意适配"部分带 opValue、部分不带"；凡"值类型"可被省略回退成其他类型导致业务值被误读的场景，都应在解析层容错 + 体检层加反向门禁，双保险。规则：**单冒号是唯一正解 `Contain:literal`，双冒号 `Contain::literal` 已被 pickValueType 兼容（不再错）**。流程状态字段金标准见硬规则"缺口1已闭合"。

## v2.8.16 (2026-08-20)

**场景**：`--conditional-upsert`（条件分支 upsert：获取单条→有值则更新/没值则发起审批）创建后，用户在设计器画布反馈：两个分支空、条件没显示，怀疑规则未生效。API 回读 processBuilder 路由（触发→获取单条→route[条件1(有值)→更新数据, 其他情况→发起审批]→结束）确认**执行逻辑正确**，但画布上分支条件显示空白。

**根因**：条件分支的字段引用是**节点变量**格式 `${dataNodeId}.fieldId`（`node_xxx.textField_ltdu4ayu`），`buildConditionNodeProps` 只写了 `name`，**未写 `__display`**。BranchSetter 首次打开无法解析 `${node}.field` 引用（需 getFormVariables 加载 + `__display` 才能显示中文名），于是渲染成"请配置字段/变量"，看起来就是空分支/未设置。与硬规则10（循环内发起审批 assignments 缺 `__display` 显示空白，v2.8.0 根治）**同一类坑**，v2.8.13 写 conditionalUpsert 时遗漏。

**修复**（`integration-process-builder.js#buildConditionNodeProps`）：
- 生成条件规则时，若 `fieldId` 含 `.`（即节点变量引用 `${node}.field`），补 `{__display: fieldName||fieldId}`。普通表单字段（无 `.`）不写，避免多余字段。
- 两个 builder 共用该函数，view/process 同步生效。
- 用 argv `--process-code` 修改模式把已发布流 LPROC-CSA66 重存，`__display:"名称"` 已写入条件分支规则（回读确认）。

**教训**：跨节点字段引用（`${node}.field`，无论用在 assignments 还是条件规则）设计器都靠 `__display` 显示中文名，缺了就"空/未设置"。**凡用 `${node}.field` 引用，必须同步写 `__display`**，建议纳入 code-expert/硬规则通用检查项。

## v2.8.15 (2026-08-20)

**场景**：`--conditional-upsert` 保存报"保存流程图失败:入参不合法.Rule:buildValue:公式构造失败，未包含公式"。

**根因**：条件分支（route/BranchSetter）"有值"操作符必须用 `ExistValue`/`NotExistValue`（条件分支专用枚举）。此前误用触发条件枚举 `HasValue`/`NoValue`，后端 buildValue 无法构造公式。

**修复**：`integration-create.js` 自动生成条件分支条件时 opCode 用 `ExistValue`；`mapTriggerOperator` 已映射 `有值/没有值`。隔离测试 + bundle 枚举确认。

## v2.8.14 (2026-08-20)

**场景**：用户要求主表操作主表1（流程表单源）的三条同步目标表单1 的自动化按动作分情况触发——①新增→流程结束、②修改→编辑触发、③删除→删除触发。此前 `integration-create.js` 硬规则15会把流程表单源的 `update`/`delete` 显式触发事件也自动改写为 `processFinish+agree`，导致②③无法按"编辑/删除"触发。

**根因**：硬规则15过度泛化——把"流程表单源的 insert(新增/提交) 不单独触发"泛化为"update/delete 也不触发"。但黄金标准参考流「主表操作主表主表1-删除同步目标表单1」LPROC-76E66 明确：**流程表单源的删除触发 = `formEventType=["delete"]` + `examineApproveType="processFinish"`**，即 update/delete 在流程表单源上仍是独立数据操作事件（CLI 生成 `["delete"]`，view-builder 在非 processFinish/activityTask 时直接用 formEventTypes → `["update"]`/`["delete"]`，`startExamineApproveType` 默认 processFinish）。

**修复**（`integration-create.js` 触发事件自动检测逻辑重写，硬规则15 同步修正）：
- 未显式 `--events`（默认 insert）→ 自动 `processFinish+agree`（保持不变）
- 显式 `--events insert` → 映射为 `processFinish+agree`（流程表单 submit=流程完成）
- 显式 `--events update` → **保留**（编辑触发）
- 显式 `--events delete` → **保留**（删除触发，对齐金标准）

**验证**：流② `--events update` 回读 formEventTypes=`["update"]`，流③ `--events delete` 回读 formEventTypes=`["delete"]`，均发布成功、体检通过（3/4 节点）。删除整条主表记录 DeleteDataNode 为 `type="node"`+`appType`。

---

## v2.8.13 (2026-08-20)

**场景**：用户要求"主表2流程结束 → 目标流程表单 有数据则更新 / 无数据则发起审批"，此前创建了两条独立逻辑流（仅更新 + 仅发起审批）。用户反馈："你做到两条里面没做判断不是同时会执行吗，应该放到一条里面进行条件判断才对啊"——两条流都会触发，无判断逻辑，且触发数据不存在时更新流跳过、存在时审批流又重复发起。

**方案**：单条逻辑流内条件分支路由到不同动作节点（conditionalUpsert 模式）：
```
触发(processFinish+agree) → 获取单条数据(按名称匹配目标表单)
  → 条件分支
    ├─ 条件1(有值) → 更新数据(ignored) → 结束
    └─ 其他情况(没有值) → 发起审批 → 结束
```
⚠️ 更新数据节点 `noneOperation` 必须用 `ignored`（命中分支内目标记录已存在，add 语义无意义）；发起审批节点创建无流程实例记录的问题被"仅在无匹配时触发"规避。

**实现**：
- `integration-create.js`：新增 `--conditional-upsert` flag。校验：需要 `--data-form-uuid` + `--data-query-type single` + `--initiate-approval-form-uuid` + `--update-form-uuid` + ≥1 个 `--data-condition`。自动生成 HasValue 条件（字段引用 `${dataNodeId}.fieldId`，setter tree 格式，同硬规则10）检查获取节点输出字段是否有值，无需手动传 `--branch-*`。`finalHasConditionNode` 强制启用条件分支。
- `integration-process-builder.js`：
  - `nextAfter('dataRetrieve')` → 直接到 conditionNodeId（跳过 updateData/initiateApproval，它们移入分支内）
  - `nextAfter('initiateApproval')` → endNodeId；`nextAfter('updateData')` → endNodeId
  - 条件分支构建：命中分支 nextId → `[updateDataNodeId]`；默认分支 nextId → `[initiateApprovalNodeId]`（普通模式保持原路由）
- `integration-view-builder.js`：接收 conditionalUpsert 参数（viewJson 无显式连线，连接由 processJson nextId 驱动，仅需透传）。

**验证**：integration-builder.test.js 新增 P0.13 两个测试（conditionalUpsert 分支路由 + 普通模式不受影响），36 通过 0 失败。

**使用模板**：
```bash
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "名称匹配则更新否则发起审批" \
  --events processFinish --approval-actions agree \
  --data-form-uuid FORM-TARGET --data-query-type single \
  --data-condition "textField_target_name:名称:textField_trig_name:TextField:Equal::processVar" \
  --update-form-uuid FORM-TARGET \
  --update-condition "textField_target_name:名称:textField_trig_name:TextField:Equal::processVar" \
  --update-assignment "numberField_target_val:processVar:numberField_trig_val" \
  --update-none-operation ignored \
  --initiate-approval-form-uuid FORM-TARGET \
  --initiate-approval-assignment "textField_target_name:processVar:textField_trig_name" \
  --initiate-approval-assignment "numberField_target_val:processVar:numberField_trig_val" \
  --conditional-upsert --publish
```
发起人默认=当前登录用户（规则12），无需传 `--initiate-approval-initiator-user`。

## v2.8.12 (2026-08-20)

**场景**：用户反馈"目标表单为流程表单需要发起审批时，AI 每次都问我要用谁的 ID"。用户记得已默认为开发者 ID（Cookie 当前登录用户），但另一个 AI 仍在询问。

**排查过程**：
1. `integration-create.js` L332-335：硬性要求 `--initiate-approval-initiator-user`，缺失即 `process.exit(1)` → AI 跑 CLI 直接被拒，只能回头问用户。
2. 全项目 grep `findSubmitterFieldId`：**9 处引用全部是 .md 文档，无一个 .js 文件**——硬规则 12/SKILL.md/node-playbook/canonical-node-shapes 声称的"CLI 自动查找提交人 EmployeeField"是从未实现的文档幻觉。
3. SKILL.md「禁止事项」原文："禁止在发起审批时省略 --initiate-approval-initiator-user 参数"——**文档明确要求 AI 必须索要发起人**。
4. 用户记忆核实："默认开发者 ID"确实实现过，但在 `data-tester/batch-submitter.js` v3.7.2（提交测试数据时 EmployeeField 自动填当前登录用户）——是数据提交路径，不是 integration 发起审批路径。
5. `.cookies.json` 结构确认：含 `login_user.userId`（16位）+ `login_user.userName`，默认发起人能力具备。

**修复**：
- `integration-create.js`：①删除"缺失即报错"硬校验；②authRef 构建后新增默认发起人逻辑——`initiateApprovalFormUuid` 存在且未显式指定发起人时，自动 `buildSelectUserInitiator(login_user.userId:userName)`，输出 `ℹ️ 【默认发起人】未指定发起人，已默认使用当前登录用户「XXX」`；Cookie 无用户信息才报错。③帮助文案同步。
- 硬规则 12 重写：【默认约定·禁止询问】发起人默认=当前登录用户（开发者）；initiator 实际格式 `{type:'select_user', value:'{"id","label","type":"employee"}'}`（纠正旧文档的 form_field_list/form_field 格式描述）；findSubmitterFieldId 纠偏声明；v2.0.27 文档-代码脱节事故记录。
- 硬规则 13.1 矩阵、规则 14 模板注同步改为"发起人默认=当前登录用户，无需传参无需询问"。
- SKILL.md 5 处修正：参数表（必填→否）、第九节（必须提供→默认约定）、循环参数表（未实现声明）、已知限制 v2.8.0 段落加现状纠偏、**禁止事项反转**（原"禁止省略发起人参数"→"禁止为发起人询问用户"）。

**教训**：文档声称"CLI 已实现 X"而代码没有 X 时，AI 会被 CLI 的硬报错打回、再被文档的"必填"要求推向用户——两头夹击必然产生多余提问。**凡文档写"CLI 已自动 XX"的断言，必须抽查代码是否真的存在该函数**；本次同时发现 SKILL.md 禁止事项与期望行为直接冲突，说明"禁止清单"也需要随行为演进同步反转。

## v2.8.11 (2026-08-20)

**场景**：用户要求按"4 大数据拓扑（主表操作主表/子表操作主表/主表操作子表/子表操作子表）× 3 操作（新增/修改/删除）× 2 目标表单类型（普通/流程）"共 24 种组合全量审查集成自动化规则的完善度，避免每次碰到问题都单独修复。

**审查方法**：24 格逐一对照硬规则 5/5.1/9/11/13/13.1/14/15/16 + cli-examples.md 约 20 个示例 + integration-process-builder.js 源码（noneOperation/subCondition/subSourceId 实现）。

**审查结论（24 格分布）**：
- **16 格 ✅ 有模板可照抄**：主表/子表→主表的更新与新增（普通+流程）、主表/子表→子表的新增与更新（普通+流程）、目标=普通表单的全部删除、目标=流程表单的发起审批类新增。
- **4 格 🟡 本次补齐**：
  - 子表→主表·删整条（普通表单）：补模板（获取条件 aFieldId 用触发子表字段，规则 17 缺口2）；
  - 主表→子表·新增（普通表单）：补两种语义判定（往已有记录子表插行=UD+add；新建记录含子表行=AD+sub_table）；
  - 子表→主表·新增（流程表单）：明确"逐行发起=循环+AF / 整单一条=主链 AF"的区分；
  - 主表/子表→子表·更新（流程表单）：补 noneOperation 分层语义判据。
- **4 格 ⚠️ 依赖缺口1**：目标=流程表单的删除（4 种拓扑均是）——需要"流程状态=已完成"过滤条件，但**该系统字段的真实 fieldId/componentType/literal 写法在全项目任何一条真实逻辑流中都没有落地过**（规则 9/16 一直写着"字段ID 视平台而定"）。这是当前唯一未闭环的能力缺口。

**修复**：
- `集成自动化硬规则.md` 新增**规则 17**：24 格总决策矩阵（每格标注方案+模板出处）+ 缺口1 金标准获取路径（设计器手工配 → integration-get --raw 导出 → 固化，禁止编造字段ID）+ 缺口2 模板 + noneOperation 分层语义表 + 审查记录。
- `SKILL.md` 决策树顶部加"第一入口=硬规则17矩阵"指引。
- 运行 `node scripts/sync-hard-rules.js` 分发到 `.trae/rules`、`.cursor/rules`、`AGENTS.md`、`CLAUDE.md`。

**noneOperation 分层语义（本次固化的关键判据）**：
- 主表记录未匹配：ignored=跳过；add=新增一条主表记录（规则5 upsert 实测；目标=流程表单时为脏数据，禁止）
- 主表匹配、子表行未匹配：ignored=跳过该行（规则14 事故②实测）；add=子表新增一行（规则14 两步方案实测）
- 选型口诀：流程表单目标且主表可能不匹配→只能 ignored；主表必匹配且需插子表行→add；普通表单 upsert→add。

**教训**：规则文档要求"必须加 XX 条件"却没有给出该条件的可照抄写法时，等于把缺口留给了执行时的 AI——要么编造字段ID（违反规则2/18），要么停下来问（被当成多余提问）。此类"要求与写法脱节"的断言是系统性审查的重点排查对象。

## v2.8.10 (2026-08-20) - 【触发表单类型自动检测】

**场景**：用户要求创建"主表修改后同步更新目标表"的集成自动化，AI 手动指定 `--events update` 触发流程表单，导致创建后设计器显示不正常，字段未设置，逻辑流无法正常工作。

**根因**：流程表单仅支持 `processFinish`/`activityTask` 事件，不支持 `insert`/`update`/`delete` 事件。但 `integration-create.js` 此前没有触发表单类型检测机制，AI 和用户可能手动指定错误的事件类型，保存成功后才发现设计器显示异常。

**修复**（代码 + 文档）：

1. **`integration-create.js` 新增触发表单类型自动检测逻辑**（约第720行）：
   - 在 `assertFormType` 调用之前，自动调用 `getFormType()` 检测触发表单类型
   - 当检测到触发表单是流程表单（`formType === 'process'`）时：
     - 若指定了 `insert`/`update`/`delete` 等无效事件 → 自动修正为 `processFinish + agree`，输出警告日志
     - 若未指定事件或事件为空 → 自动设置为 `processFinish + agree`，输出警告日志
   - 修正后继续正常创建流程，无需人工干预

2. **`集成自动化硬规则.md` 规则 15 更新**：
   - 将 `insert/delete` 扩展为 `insert/delete/update`（流程表单不支持 update 事件）
   - 新增「自动检测逻辑（已实现）」段落，记录 CLI 的自动修正行为
   - 新增历史事故记录

3. **运行 `node scripts/sync-hard-rules.js`** 同步到 `.trae/rules`、`.cursor/rules`、`AGENTS.md`、`CLAUDE.md`

**验证**：使用相同参数重新创建逻辑流，CLI 输出：
```
步骤 3/4: 检测触发表单类型
触发表单类型: process
⚠️  【自动修正】触发表单是「流程表单」，不支持 insert/update/delete 事件
⚠️  【自动修正】触发事件已自动调整为 processFinish + agree（流程结束且审批同意）
```
逻辑流创建成功，设计器显示正常，字段正确设置。

**修改文件**：
- `integration-create.js`：新增触发表单类型自动检测逻辑
- `集成自动化硬规则.md`：规则 15 更新
- `SKILL.md`：版本历史 v2.0.27
- `version-history.md`：本文件

**教训**：流程表单与普通表单的事件支持范围不同，CLI 应在创建前自动检测并修正，而不是等用户发现设计器异常后才修复。从根源上杜绝此类问题，而不是每次遇到都手动修复单个逻辑流。

## v2.8.10 (2026-08-20)

**场景**：用户让另一个 AI 创建"触发表单（流程表单）删除一条数据后，删除目标表单（流程表单）对应数据"的自动化。AI 正确判断出流程表单不支持 delete 事件、也给出了唯一正确的替代方案（processFinish + agree），却停下来向用户发"如果你确认使用这个方案，我将创建以下逻辑流"的确认题。

**根因**：AI 把"技术限制导致的强制修正"误当成"需要用户批准的方案变更"。项目默认约定（流程表单触发一律用「流程结束且审批同意」）此前只是隐含在硬规则 15 的技术描述里，没有被明确写成"无需确认的默认约定"，AI 出于谨慎把它当成方案变更来征求意见。

**修复**（纯文档，无脚本改动）：
- `集成自动化硬规则.md` 规则 15 新增两个子项：
  - **【默认约定·禁止确认】**：明确「流程结束且审批同意」是本项目所有流程表单触发的默认约定。用户描述的触发事件在流程表单上不可用时（delete/insert），直接自动改用 `processFinish + agree` 创建，禁止发确认题；只需在交付说明中注明"触发事件已自动调整为 流程结束且审批同意（流程表单不支持 XX 事件）"。
  - **判别标准（何时允许问 / 何时禁止问）**：技术限制或默认约定导致的修正，且修正后方案**唯一** → 直接执行，禁止确认式提问；只有存在**多个**可行方案且用户意图无法唯一确定时，才允许向用户询问。
  - 历史事故（v2.0.27）记录本案例。
- 运行 `node scripts/sync-hard-rules.js` 分发到 `.trae/rules`、`.cursor/rules`、`AGENTS.md`、`CLAUDE.md`

**与 v2.8.9 的区别**：v2.8.9 解决的是"误读规则后抛**多方案选择题**"（方案 A/B/C，其中还有不可行项）；v2.8.10 解决的是"方案**唯一且正确**却仍要用户确认"。两者共同构成"多余提问"的两类形态，判别标准已统一固化在规则 15。

## v2.8.9 (2026-08-20)

**场景**：用户让另一个 AI 创建"对流程表单目标执行插入+更新+删除"的集成自动化，AI 停下来向用户抛方案选择题（方案A 改普通表单 / 方案B 只做插入放弃更新删除 / 方案C 自定义），声称"更新/删除不能用数据节点（目标表单是流程表单）"。

**根因**：AI 把硬规则 13"目标表单是流程表单时，必须用发起审批节点**创建数据**，禁止用更新/新增数据节点"过度推广为"流程表单一律禁止更新/删除"。实际上：
- 硬规则 13 禁止的只是**用数据节点创建新记录**（新记录无流程实例 → 在宜搭中打不开）
- 硬规则 9 已明确删除流程表单数据可行（只需获取节点加 流程状态="已完成" 条件）
- 硬规则 14 两步方案中的 UpdateDataNode 已实测可更新流程表单**已有记录**（v2.8.3）
- 可行方案分散在规则 9/13/14/15/16 中，缺少按操作类型对号入座的总决策表 → AI 遇到组合需求判定"规则冲突"，按"不确定就问"原则停下来

**修复**（纯文档，无脚本改动）：
- `集成自动化硬规则.md`：新增规则 **13.1**「流程表单目标的插入/更新/删除完整决策表」——
  - 插入（仅主表）= 发起审批节点；插入（含子表）= 发起审批+更新数据两步方案（CLI 自动检测）
  - 更新已有数据 = 更新数据节点 direct_form，`--update-none-operation` 必须 `ignored`（禁止 add：匹配不到会插入无流程实例的脏数据），匹配条件用业务键定位
  - 删除已有数据 = 获取节点（条件含 流程状态="已完成"）+ 删除节点；只删子表行按规则 16 模式 A/B
  - 组合需求按表拆成独立逻辑流直接创建，**禁止抛方案选择题**、禁止主动建议用户改普通表单
- `SKILL.md`：「方案选择决策树」中原"向流程表单插入数据"分支扩展为"目标表单是流程表单（插入/更新/删除全部可实现）"四路分支
- 运行 `node scripts/sync-hard-rules.js` 分发到 `.trae/rules`、`.cursor/rules`、`AGENTS.md`、`CLAUDE.md`

**教训**：硬规则的负面禁令（"禁止 X"）必须写明**适用边界**，否则会被 AI 推广到未禁止的场景；对"同一目标对象的多种操作"，应提供一张总决策表而不是依赖多条分散规则的组合推理。

## v2.8.8 (2026-08-12)

**场景**：cascade（5 节点：触发 → 获取单条(主表) → 获取多条(子表) → 删除 → 结束）创建后，设计器里节点3「获取多条数据」显示「从数据节点中获取」而非「从子表中获取」。

**根因**：AI（包括本会话）错误地根据 viewJson 中 `sourceId=上游节点ID` 推断 `originalType` 应为 `"node"`。**真实情况**：手工配置金标准显示 cascade 节点3 的 `originalType` 应当是 `"sub_table"`——即便 `sourceId` 指向上游节点，只要 `subSourceId` 指定目标子表，`originalType` 就必须是 `"sub_table"` 才能让设计器显示「从子表中获取 + 数据节点=获取单条数据 + 子表=目标子表」三件套。

**修复**：
- `integration-view-builder.js` chain mode（原 487 行）：`originalType: 'node'` → `originalType: 'sub_table'`
- `integration-process-builder.js` chain mode（原 612 行）：`originalType: 'node'` → `originalType: 'sub_table'`
- 离线断言 34 用例全绿

**教训**：**不要从代码字段名（如 `sourceId=节点`）或 viewJson 字面值去推断 `originalType`**。`originalType` 是设计器区分"从子表中获取"vs"从数据节点中获取"UI 显示的根本字段，必须以**设计器手工配置的 viewJson 为金标准**——创建一条手工流程 → 导出 viewJson → 字段逐一对照才能确定正确组合。

**手工配置 viewJson 金标准**（截图验证）：
```json
{
  "componentName": "GetBatchDataNode",
  "props": {
    "name": "获取多条数据",
    "getData": {
      "originalType": "sub_table",
      "appType": "",
      "sourceId": "node_xxx(上游获取单条节点ID)",
      "targetItem": { "deep":0, "value":"node_xxx", "label":"获取单条数据" },
      "subSourceId": "tableField_xxx(目标子表字段ID)",
      "relativeItem": { "deep":0, "value":"tableField_xxx", "label":"目标子表名" },
      "filterType": "condition",
      "condition": { ... 仅含子表字段条件 ... }
    }
  }
}
```

**修改文件**：
- `integration-view-builder.js` / `integration-process-builder.js`：chain mode 节点3 `originalType` 修正
- `集成自动化硬规则.md`：硬规则 16 历史事故 v2.8.8 详细说明
- `node-playbook.md` 避坑清单 #24：重写三种 sub_table 路径对比
- `canonical-node-shapes.md`：GetBatchDataNode 模式 B 修正为 sub_table
- `SKILL.md`：版本历史 v2.8.8

## v2.8.8 补充：GetSingleDataNode originalType 与金标准（手工微调后全量对照）

**场景**：用户手工微调「主表操作子表提交后删除目标表单对应子表行」`LPROC-N7C66...` 后，要求全量获取对比 CLI 生成差异并固化为标准。

**全量对照发现的核心差异**（CLI 生成 vs 手工金标准 viewJson）：

| # | 位置 | CLI 生成（错/简） | 金标准（对） | 处理 |
|---|------|------------------|-------------|------|
| 1 | StartNode `formEventType` | `["processEvents"]` | `["delete"]` | 删除类流程表单触发手工标准；两者宜搭均接受 |
| 2 | GetSingleDataNode `originalType` | `"process"` | `"process_form"` | ✅ 已修正（流程表单单条目标） |
| 3 | GetSingleDataNode `targetItem` | 简化 `{deep,value,label}` | 完整 `{appType,appName,formItem}` | 文档记录，宜搭交互时补齐 |
| 4 | GetSingleDataNode 主表条件 `op` | `等于`(Equal) | `包含`(Contain) | 业务选择，用户用"包含" |
| 5 | GetBatchDataNode `name`/`title` | 字符串"获取多条数据" | i18n 对象"获取子表多条数据" | UI 命名习惯 |
| 6 | rulesFilter/outputs 完整度 | 简化 | 完整（含系统字段） | 宜搭保存/读取时动态补齐 |

**originalType 修正**：`dataOriginalType = sub_table | (dataFormType==='process' ? (dataQueryIsMultiple ? 'process' : 'process_form') : 'form')`
- GetSingleDataNode 流程表单 → `process_form`
- GetBatchDataNode 流程表单 → `process`
- 普通表单 → `form`
- view-builder 与 process-builder 同步改；create.js 补充传 `dataFormType` 给 `buildProcessJson`

**新增金标准文档**：`references/golden-standard-cascade-delete-subtable.md`——完整 viewJson + 差异清单，作为删除子表行场景唯一权威参考。

## v2.8.7 (2026-08-12)

**场景**：主表操作子表（流程表单）→ 目标表单3（流程表单）的子表行删除。

**遇到的问题及修复**：

1. **「获取多条数据」节点在设计器 UI 显示"从数据节点中获取"而非"从子表中获取"** — 用户反馈截图证实：上一版用 chain mode（cascade，5 节点）创建删除子表行流，节点3 `originalType="node"` + `sourceId=节点2`，设计器 UI 显示"从数据节点中获取"而非"从子表中获取"，用户难以从 UI 确认配置正确性。

2. **根因**：`--data-sub-source-id` 在 v2.8.5 被重定义为 chain mode（cascade）专用参数——只有同时传 `--data-sub-condition` 才会触发级联。单独传 `--data-sub-source-id`（无 `--data-sub-condition`）会落入普通 form 路径，获取节点 `originalType="process"` + `subSourceId=""`（错误）。而 v2.8.4 版本的语义「获取节点直接从目标表单子表获取（subSourceId=该值）」被 v2.8.5 的 chain 实现覆盖丢失。

3. **修复**：恢复「目标表单子表直接获取」模式（硬规则 16 模式 A 的正确实现）——新增内部标志 `isSubFormTarget`：
   - **触发条件**：`--data-sub-source-id` 存在且 **无** `--data-sub-condition`（与 chain mode 区分：chain 需两者都有）
   - **产物**：获取节点 `originalType="sub_table"` + `sourceId=#{目标表单}` + `subSourceId=目标子表字段ID` + `appType=""` + `targetItem={}` + `relativeItem={value:目标子表}`（viewJson/processJson 一致）
   - 设计器 UI 显示 **"从子表中获取"**
   - 注意：这与 `--data-source-type subform`（`sourceId=#{触发表单}`，从触发数据子表获取）不同——本模式 `sourceId` 指向**目标表单**。
   - **标准命令**（4 节点：触发 → 获取多条(从子表中获取) → 删除子表行 → 结束）：
   ```
   node integration-create.js APP_XXX FORM-TRIGGER "审批通过后删除关联子表行" \
     --events processFinish --approval-actions agree \
     --data-form-uuid FORM-TARGET \
     --data-query-type multiple \
     --data-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
     --data-sub-source-id tableField_target_sub \
     --delete-data \
     --delete-sub-source-id tableField_target_sub \
     --delete-sub-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
     --publish
   ```

4. **适用场景**：子表条件字段值在目标表单中全局唯一（每个主表记录对应的子表行可直接靠子表字段匹配），无需先定位主表记录。若子表条件字段跨主记录重复（需先按主表字段定位父记录），仍用 chain mode（硬规则 16 模式 B，5 节点 cascade）。

**修改文件**：
- `integration-create.js`：新增 `isSubFormTarget` 计算（`dataSubSourceId !== '' && dataSubConditions.length === 0`），传入两个 builder
- `integration-view-builder.js`：获取节点支持 `isSubFormTarget` → `originalType=sub_table` + `sourceId=#{目标表单}` + `subSourceId=目标子表`，rulesFilter 用目标子表内字段
- `integration-process-builder.js`：同上，`appType` 置空
- `集成自动化硬规则.md`：硬规则 16 模式 A 补充「`--data-sub-source-id` 单独使用（无 `--data-sub-condition`）即触发 sub_table 直接获取」的说明
- 离线断言 `integration-builder.test.js` 34 用例全绿

## v2.8.3 (2026-08-10)

**场景**：主表操作子表（流程表单）→ 目标表单3（流程表单）的子表插入数据。

**遇到的问题及修复**：

1. **目标表单是流程表单时用了更新数据节点** — 更新数据节点插入的数据没有流程实例，无法打开。修复：改用发起审批节点。（硬规则 13）

2. **发起审批节点不支持子表字段赋值** — assignments 中赋值子表字段后规则触发但子表数据为空。修复：采用「发起审批 + 更新数据」两步方案，发起审批只赋值主表字段，更新数据节点负责子表插入。（硬规则 14）

3. **两步方案中 noneOperation 用了 ignored** — 发起审批创建主表记录后，更新数据节点匹配到记录但子表为空，ignored 直接跳过不插入。修复：改为 `add`（upsert）。（硬规则 14）

4. **子表字段只在 sub-condition 中出现，未在 assignment 中出现** — 规格字段用于匹配但没赋值，导致目标子表规格为空。修复：子表字段必须同时出现在 `--update-sub-condition` 和 `--update-assignment` 中。（硬规则 14）

5. **流程表单触发表单用了 insert 事件** — 规则触发了但没生成数据。修复：流程表单默认使用 `processFinish + agree`，CLI 已实现自动检测。（硬规则 15）

6. **发起审批发起人问题** — `form_inst_creator` 在 processFinish 事件中不可用导致发起审批静默失败。修复：主链发起审批节点也用 `findSubmitterFieldId` 从触发表单 Schema 自动查找真实 EmployeeField（之前只有循环内发起审批节点做了这个处理）。

7. **另一个 AI 仍然只用了更新数据节点** — CLI 没有自动检测 `--update-form-uuid` 指向流程表单的情况。修复：CLI v2.8.3 新增自动检测 — 当 `--update-form-uuid` 指向流程表单且 `--update-none-operation add` 时，自动在更新数据节点前插入发起审批节点，AI 无需手动判断。

8. **自动添加发起审批节点时 assignments 为空** — CLI 自动检测代码中变量名拼写错误：用了 `updateConditionList` 但实际变量名是 `updateConditions`。`undefined.map()` 抛出异常被 catch 静默捕获，导致 `initiateApprovalAssignments` 保持为空数组，发起审批创建了流程实例但 `formDataJson` 为 `{}`（无字段赋值），更新数据节点按名称匹配不到记录。修复：`updateConditionList` → `updateConditions`。

**修改文件**：
- `integration-create.js`：①新增流程表单触发事件自动设置（processFinish + agree）②修复主链发起审批发起人自动查找 EmployeeField ③新增更新数据目标表单是流程表单时自动添加发起审批节点 ④修复变量名拼写错误 `updateConditionList` → `updateConditions`
- `integration-view-builder.js`：更新注释，移除 form_inst_creator 不影响功能的错误说明
- `集成自动化硬规则.md`：更新硬规则 12（主链也禁止 form_inst_creator），新增硬规则 13、14、15，硬规则 14 补充 CLI 自动检测说明
- `SKILL.md`：决策树新增"向流程表单插入数据"分支 + 版本历史 v2.8.3

## v2.8.0 (2026-08-08)

- **【修复循环内发起审批节点字段设置右侧显示为空的问题】** 折腾多天的根因，三个问题叠加导致：
  1. **`assignments[].value` 格式错误（三轮试错）**：
     - ❌ v2.6.0：用裸 `cycleNodeId`（如 `node_bd984b2569e`）—— setter 全部显示"当前循环执行的数据"整体，不显示具体字段名
     - ❌ v2.7.0：用 `cycleNodeId//fieldId`（如 `node_xxx//textField_570rac0i`）—— setter 不识别此格式，保存后回退为空
     - ✅ v2.8.0：用 `${cycleNodeId}.fieldId`（如 `${node_xxx}.textField_570rac0i`）—— 设计器 setter tree 选择器中"当前循环执行的数据"展开后子选项的 value 就是此格式，Playwright 逆向确认
  2. **缺少 `__display` 字段**：setter 在未加载 `getFormVariables.json` API 时显示"请配置字段/变量"（空白）；v2.8.0 新增 `lookupFieldLabel(triggerFormSchema, fieldId)` 函数自动从触发表单 Schema 中查找源字段中文名作为 `__display`
  3. **面板保存 ≠ 服务器保存**：设计器面板内的"保存"按钮只应用到本地画布状态，必须点击页面顶部工具栏的 `simple-flow-canvas-save` 按钮才触发 `saveProcess` API 持久化到服务器。`integration-designer-fix.js --save` 会自动点击工具栏保存按钮
  4. **subform 模式下 `dataQueryType` 未强制为 `multiple`**：导致体检报 `RETRIEVE_EMPTY_CONDITION`；v2.8.0 在 `integration-create.js` 中增加 `dataSourceType === 'subform'` 时强制 `dataQueryType = 'multiple'`
- **修改文件**：
  - `integration-view-builder.js`：循环内发起审批 assignments value 改为 `${cycleNodeId}.fieldId` 格式 + 新增 `lookupFieldLabel()` 函数 + 添加 `__display` 字段
  - `integration-process-builder.js`：循环内发起审批 assignments value 同步改为 `${cycleNodeId}.fieldId` 格式
  - `integration-create.js`：subform 模式下强制 `dataQueryType='multiple'`
- **文档更新**：SKILL.md 已知限制 #5、cli-examples.md 循环发起审批示例、node-playbook.md 避坑清单 #21/#23、canonical-node-shapes.md InitiateApprovalNode 章节、集成自动化硬规则 #10、version-history.md
- **教训**：每次格式修改后都"保存成功"但设计器显示不正确，说明 **保存成功 ≠ 配置正确**（硬规则 4 的又一次验证）。最终通过 Playwright 逆向 setter tree 选择器行为才确认正确格式。

## v2.8.2 (2026-08-08)

- **【修复循环内发起审批"假保存"问题：发起人(initiator)为空导致设计器保存失败 + form_inst_creator 显示不友好】** 经历三个阶段修复：
  - **阶段1：发起人为空导致"假保存"**
    - 根因：CLI 的 `findSubmitterFieldId` 函数在触发表单没有含"提交"标签的 EmployeeField 时返回 null，`cycleInitiateApprovalInitiator` 保持空值占位 `{type:'form_field', value:''}`。设计器保存时检测到发起人为空，弹出错误弹窗拦截保存，但 `saveProcess` API 不会被调用，导致 AI 误以为"保存成功"。
    - 修复：添加 `--cycle-initiate-approval-initiator` CLI 参数 + 添加 fallback 到 `form_inst_creator` + 保存后检查弹窗
  - **阶段2：form_inst_creator 显示不友好**
    - 根因：`form_inst_creator` 是系统变量（表单提交人），但设计器无法解析它为友好名称，直接显示原始文本 `form_inst_creator`，用户体验差。
    - 用户反馈："选择发起人还是显示不正常，显示为 form_inst_creator，明明可以在里面选择"
  - **阶段3（最终修复）：使用真实 EmployeeField**
    - 修复 `findSubmitterFieldId` 函数：增加二级回退——①label 包含"提交"的 EmployeeField → ②主表第一个 EmployeeField（depth=1） → ③null（此时 CLI 回退到 `form_inst_creator`）
    - 修复 `integration-designer-fix.js`：保存流程改为通过 React `__reactEventHandlers$.onClick` 调用面板保存按钮和发布按钮（非 DOM click），且每次保存后检查错误弹窗
    - 硬规则 10 更新：补充正确保存流程（面板保存→检查弹窗→退出→发布→检查弹窗→等待API）
    - 新增硬规则 12：循环内发起审批节点发起人不得为空，且必须使用真实 EmployeeField 字段ID，禁止使用 `form_inst_creator`
  - **验证**：在课程录制应用上创建 LPROC-6Y866V81JU38PK5ONHZCH48YVA853HT2PHKSMQB，initiator=`employeeField_lus0jwc4`（项目经理），设计器正确显示"项目经理"而非 `form_inst_creator`，面板保存无弹窗，`saveProcess` API 返回 `success:true`。
  - **修改文件**：
    - `integration-create.js`：`findSubmitterFieldId` 三级回退逻辑 + `--cycle-initiate-approval-initiator` 参数 + fallback 到 `form_inst_creator`
    - `integration-designer-fix.js`：React onClick 保存流程 + 弹窗检查
  - **教训**：①`form_inst_creator` 虽然是有效的系统变量，但设计器无法将其解析为友好名称，必须使用真实字段ID；②`findSubmitterFieldId` 的回退策略应优先使用真实 EmployeeField 而非系统变量；③React 组件的事件处理需要通过 `__reactEventHandlers$` 调用，DOM `click()` 可能不触发 React 合成事件。

## v2.8.1 (2026-08-08)

- **【修复方案选择歧义：发起审批被误用 direct_form 更新数据节点】** 另一个 AI 基于 v2.8.0 的 skill 创建"任务分派子表→任务执行发起审批"自动化时，错误使用了 direct_form 更新数据节点而非循环容器+发起审批节点。
  - **根因**：硬规则 5.1 循环容器适用场景只提"消息通知、连接器调用等"，未明确列出"发起审批"。AI 把"发起审批"等同于"新增另一张表的数据"，套用了 direct_form 更新数据节点规则。
  - **修复**：
    1. 硬规则 5.1 明确列出"发起审批"为非更新类动作，并加粗标注 **"发起审批" ≠ "新增数据"**
    2. 新增硬规则 11：明确 `--cycle-initiate-approval-assignment` 参数格式为 `目标字段ID:processVar:源字段ID`（两个冒号），一个冒号会导致 parseAssignments 解析失败、赋值静默丢失
    3. SKILL.md 决策树补充"发起审批"分支，cli-examples.md 补充循环内发起审批完整 CLI 示例
  - **验证**：在课程录制应用（APP_HHYNCIQ5E4UZFSMY4W3F）上成功创建 LPROC-VXE662B1AV387Q72KCHRTCD1JTH82KW4J6KSMJ6，4 节点（触发→获取多条数据→循环[含发起审批]→结束），3 个字段赋值（执行人/任务名称/截至日期）全部正确显示 `${cycleNodeId}.fieldId` 格式 + `__display` 中文名，体检通过，设计器面板修复完成。

## v2.7.1 (2026-08-07)

- **【移除循环容器内发起审批节点的 CLI 硬拦截】** `--cycle` + `--cycle-initiate-approval-form-uuid` 组合恢复为标准支持功能。循环容器内发起审批（遍历子表行逐行发起审批）是宜搭标准用法，v2.5.8~v2.5.9 曾误判为"宜搭前端框架限制"并加硬拦截，v2.6.0 实测确认 viewJson 格式正确后面板可正常显示，v2.7.1 正式移除硬拦截。
  - `integration-create.js`：清理"硬拦截"/"已废弃"误导注释，`--cycle-initiate-approval-*` 参数恢复为正式支持
  - `SKILL.md`：已知限制 #5 改为标准功能说明；参数表补充 `--cycle-initiate-approval-form-uuid` / `--cycle-initiate-approval-assignment`；循环容器节点类型表补充发起审批
  - `node-playbook.md`：#21 改为标准支持功能说明；#23 去掉"硬拦截（保留）"语言
  - `canonical-node-shapes.md`："已知限制"章节改为"标准支持"说明
  - `yida-consultant FAQ`：更新为标准功能描述
  - 创建后仍需执行 `integration-designer-fix.js` 修复设计器面板首次渲染

## v2.7.0 (2026-08-07)

- **【新增 Playwright 设计器修复脚本】** `integration-designer-fix.js` — 通过 Playwright 打开集成自动化设计器，选中获取多条数据节点触发 `getFormVariables.json` API 调用，再选中发起审批节点触发设置面板重渲染，修复 CycleContainer 内 InitiateApprovalNode 设计器面板首次点击时字段赋值/发起人渲染空白的问题。支持 `--save` 通过设计器保存使格式成为权威版本，`--screenshot` 保存截图。
  - 用法：`node integration-designer-fix.js <appType> <processCode> [--save] [--screenshot]`
  - 原理：CycleContainer 内子节点首次点击时未调用 `getFormVariables.json` API，但点击前置 GetBatchDataNode 再点回即可触发重渲染（用户实测确认）
  - 创建循环内发起审批流后应执行此脚本修复设计器面板
- **【修复获取多条数据节点 filterType】** `integration-view-builder.js` 和 `integration-process-builder.js` 中 `filterType` 不再硬编码为 `'condition'`。无过滤条件时改为 `'all'`（设计器显示"全部数据"），有条件时仍为 `'condition'`。
- **【新增规则】** 用户未明确要求过滤时，禁止为获取多条数据节点添加 `--data-condition` 参数。已添加到 SKILL.md 禁止事项。

## v2.6.0 (2026-08-07)

- **【发起审批节点 viewJson 区分主链/循环内两套格式（v2.6.0 实测修复）】** 用户质疑"你确定及肯定是宜搭的限制？"——经 Playwright 真实打开设计器、手动选择字段后保存、回读 viewJson，拿到 setter 自动写入的**金标准 viewJson**（不再是 v2.5.6 bundle 逆向的猜测）。v2.6.0 关键发现：**发起审批节点分两套 setter 期望格式**，v2.5.6 错把循环内格式套到所有节点（导致主链反而被破坏），v2.5.7/v2.5.8/v2.5.9 错误归因为"宜搭 setter 限制"。
  - **主链发起审批 setter 期望格式**（实测金标准：手动配置的兄弟流 LPROC-KX966O71UT383IQEK2A0QA0GA40335AB56HSM01）：
    - 无 `signAction` 顶层字段
    - `assignments[].value` = 裸字段 componentId
    - `initiator.type='form_field_list'` + `initiator.value='["form_inst_creator"]'`
    - setter UI "选择发起人"显示未选中是**宜搭正常 UI 行为**（form_inst_creator 是系统虚拟字段不在主表成员字段里），不影响功能
  - **循环内发起审批 setter 期望格式**（实测金标准：setter 自动保存后的 LPROC-KX966O71UT38HFWBO5J9A43058MR3MKAFFISM57）：
    - `signAction='one_by_one'` 顶层字段（必须）
    - `assignments[].value` = 循环容器节点 ID（**不是**裸子表字段 ID）
    - `initiator.type='form_field'` + `initiator.value=<提交成员字段 componentId>`（**不是** form_field_list+form_inst_creator）
  - **v2.6.0 修复动作**：
    1. `view-builder` 主链发起审批：**保留 v2.5.6 原始格式**（form_field_list+form_inst_creator，无 signAction）——与金标准流 LPROC-KX966O71UT383IQEK2A0QA0GA40335AB56HSM01 完全一致
    2. `view-builder` 循环内发起审批：升级为 setter 自动保存的金标准格式（assignments[].value=cycleNodeId, initiator=form_field+提交成员字段, signAction=one_by_one）
    3. `create.js` 新增 `findSubmitterFieldId(triggerFormSchema)` + `buildCycleInitiateApprovalInitiator`，自动从触发表单 schema 中找"提交成员"字段（EmployeeField 含"提交"），仅对循环内发起人占位升级
    4. `buildFormFieldInitiator` 保留旧签名（接收数组返回 form_field_list+JSON.stringify），不影响主链默认值
  - **实测验证**：用户原始流 LPROC-KX966O71UT38HFWBO5J9A43058MR3MKAFFISM57 通过浏览器手动 setter 操作后保存，viewJson 已重写为循环内金标准格式（5164→5194 字节），**实测面板 3 条字段赋值完整显示"当前循环执行的数据"+ 发起人完整显示"表单成员字段(提交成员)"**。修复成功。
  - **彻底纠正 v2.5.6/v2.5.7/v2.5.8/v2.5.9 的错误归因**：之前判断"v2.5.6 修复失败"是正确的，但根因分析（"子表字段引用无法显示"、"getFormVariables 匹配不到"、"CycleContainer 限制"等）**全部错误**——setter 完全支持，只是 v2.5.6 错把循环内格式套到主链。已通过 SKILL.md/node-playbook/canonical-node-shapes/yida-consultant FAQ 全面纠正。

## v2.5.9 (2026-08-07)

- **【v2.5.9 错误归因，v2.6.0 已纠正】** 本版本曾错误地归因为"子表字段引用 + 系统字段发起人 → setter 匹配不到"。v2.6.0 通过实测 setter 自动保存的金标准 viewJson，发现真正根因是 view-builder 输出的 viewJson 格式错误（`assignments[].value` 应是循环节点 ID 而不是裸字段 ID；`initiator` 应是 `form_field+提交成员字段ID` 而不是 `form_field_list+form_inst_creator`），与 setter 限制无关。**v2.5.9 的根因诊断已废弃**，详见 v2.6.0。

## v2.5.8 (2026-08-07)

- **【CycleContainer 内 InitiateApprovalNode 加 CLI 硬拦截】** v2.5.7 确认该组合是宜搭前端框架限制（设计器设置器无法渲染字段/发起人）后，本次在 `integration-create.js` 加了硬拦截：同时传 `--cycle` + `--cycle-initiate-approval-form-uuid` 时直接拒绝创建（exit 1，输出"创建被拒绝" + 根因 + 4 个替代方案），避免再造"可见但不可编辑"的半残流。
  - 触发场景：2026-08-07 实际案例「子表操作主表1-INSERT-提交插入目标表单2」LPROC-KX966O71UT38HFWBO5J9A43058MR3MKAFFISM57（4 节点：触发→获取多条→循环容器[发起审批]→结束），API 数据正确、引擎正常，但设计器面板"选择发起人/字段设置"显示空白。
  - 修复动作：重建为主链 3 节点「子表操作主表1-INSERT-发起审批目标表单2」LPROC-IJA667D1PT380P9ZH7D14CPUDD1F3BCPOMISMU8（触发→发起审批→结束），字段映射 `textField_5haf2uz6←textField_570rac0i`、`employeeField_5haf3ipm←employeeField_570rfpmr`、`numberField_5haf1qy6←numberField_570rb4mu` 原样保留，发起人 `form_inst_creator`；设计器面板可正常显示/编辑。旧流已停用（status=n）保留对照。
  - `--cycle-initiate-approval-form-uuid/--cycle-initiate-approval-assignment/--cycle-initiate-approval-initiator-user` 三个参数已废弃。
  - 更新 SKILL.md 已知限制 #5、node-playbook.md 避坑清单 #21、canonical-node-shapes.md 对应章节，新增 yida-consultant FAQ。

## v2.5.7 (2026-08-07)
- **【确认 CycleContainer 内 InitiateApprovalNode 设置器渲染异常为宜搭前端框架限制】** 经 bundle 逆向分析 + React fiber 树验证 + 浏览器实际测试，确认当 InitiateApprovalNode 嵌套在 CycleContainer 内部时，设计器右侧设置器无法正确渲染字段赋值（显示默认空字段，发起人未选中）。
  - 根因：CycleContainer 内的子节点的 settingEntry 机制缺失（需要 `this.settingEntry = this.document.designer.createSettingEntry([this])` 连接设置器），且点击时未调用 `getFormVariables.json` API 异步加载字段列表
  - **这是宜搭前端框架的限制，无法通过修改 Skill 代码直接修复**
  - 替代方案：API 创建后手动在设计器中配置 / 改用 SendMessageNode / 避免 CycleContainer 使用 direct_form 子表更新
  - 新增避坑清单第 21 条（CycleContainer 内 InitiateApprovalNode 限制）
  - 更新 canonical-node-shapes.md 新增「CycleContainer 内 InitiateApprovalNode 已知限制」章节

## v2.5.6 (2026-08-07)

- **【修复 InitiateApprovalNode 字段显示为空 + 发起人未选择】根因：view-builder 错误地给 `initiateApprovalRules` 添加了 `inputs.childList/componentOptionMap` 和 `rules.rules` 结构（参照 AddDataNode），但 bundle 逆向确认 `InitiateApprovalSetter` 不读取这些字段——它通过 API `getFormFieldsByFormUuid(formUuid, appType)` 异步加载字段，再调用 `transAssignmentsToActionRulesEditorRules(assignments)` 把扁平赋值转换为编辑器规则。冗余的 `inputs/rules` 不仅无效，还可能导致 setter 渲染异常。
  - 修复：移除 `inputs/rules`，改用扁平格式（`{type, initiator, assignments, formUuid, processCode, formTitle, appType}`），并补充 `signAction: "one_by_one"`（bundle 默认 props 必须字段）。
  - 发起人默认值确认：`{type: "form_field_list", value: '["form_inst_creator"]'}`（bundle 逆向确认，`form_field_list` 类型解析为字段 ID 数组）。
  - 同步清理：移除 `buildInitiateApprovalViewAssignments` 函数及相关 Schema 获取逻辑（不再需要）。

## v2.5.5 (2026-08-05)

- **【修复获取数据节点 `getData.originalType` 硬编码导致流程表单选择框为空】** 根因：view-builder 和 process-builder 中 `dataOriginalType` 只区分 `sub_table` 和 `form`，未考虑流程表单 `process`。UI 表单选择器按 `originalType` 过滤表单列表——`originalType="form"` 只加载普通表单，流程表单不在列表里，所以选择框为空白。修复：改为 `isSubformSource ? 'sub_table' : (dataFormType === 'process' ? 'process' : 'form')`。同时补充 process-builder 解构 `dataFormType` 参数、create.js 传递 `dataFormType` 给 `buildProcessJson`。
- 新增避坑清单第 20 条（`originalType` 必须匹配真实表单类型）

## v2.5.4 (2026-08-05)

- **【修复更新数据节点赋值错用 `column`(公式) 而非 `processVar`(字段引用)】** 导致公式编辑器显示红色不可识别。根因：简单字段复制（单价→单价）应选 `processVar`，但错选 `column` 导致字段ID被当作公式字面量解析。修复：CLI 参数改为 `--update-assignment "numberField_me82yifi:processVar:numberField_lte16io5"`。
- **【修复获取单条/更新数据节点 `targetItem.formItem.formType` 硬编码导致流程表单下拉框空白】** 根因：view-builder 中 `formType` 写死为 `'receipt'`（普通表单），当目标表单为流程表单（process）时，UI 下拉框按类型匹配不到。修复：`create.js` 用 `getFormInfo()` 获取真实 `formType`（dataFormType/updateFormType/cycleUpdateFormType），传递到 view-builder 替换硬编码值。
- 新增避坑清单第 18 条（`processVar` vs `column` 择值规则）和第 19 条（`formType` 必须匹配真实类型）

## v2.5.3 (2026-08-05)

- **【节点卡片/下拉框显示表单 UUID 而非名称】彻底修复 —— 新增 `getFormName()` 机制 + 回填所有 viewJson 显示字段**
- 根因：`integration-create.js` 中 `initiateApprovalFormName`、`addDataFormName`、`updateFormName`、`dataFormName`、`cycleUpdateFormName` 全部硬编码为空字符串，且 viewJson 中 `formTitle`、`targetItem.formItem.title` 等显示字段留空，但 processJson 中 `formUuid`/`sourceId` 有值所以功能不受影响
- 修复方案：
  1. `integration-api.js` 新增 `getFormInfo()` 和 `getFormName()` 函数（复用 `getFormAndAppInfo.json` 接口，取 `title.zh_CN`），并导出
  2. `integration-create.js` 在获取各目标表单 Schema 后同步调用 `getFormName()` 获取真实表单名，传递给 viewJson/processJson
  3. `integration-view-builder.js` 回填 `GetSingleDataNode.targetItem.formItem.title`、`InitiateApprovalNode.initiateApprovalRules.formTitle`、`UpdateDataNode.updateDataRules.targetItem`（含 `formItem.title`）、`CycleContainer` 内 UpdateDataNode 的 `targetItem`
  4. `integration-process-builder.js` 回填 `InitiateApprovalNode.formTitle`
- 新增避坑清单第 17 条：节点卡片/下拉框显示表单 UUID 而非表单名称，含检查清单

## v2.5.3 (2026-07-31)
- **【事故复盘：方案选择决策树根因纠错，判别标准从「数据拓扑」改为「动作类型」】** 同一根因第二次把"采购入库同步库存"（入库明细子表→库存信息主表）误建成 5 节点循环容器流：旧版硬规则 5.1/决策树按"数据拓扑"分类，其中"子表行→主表记录仅此场景用循环容器"分支本身就是错的（direct_form 引擎自动对触发子表明细逐行迭代匹配，已实际验证），且与同文档第 5 条自相矛盾
- 新判别标准：数据同步/累加/upsert 一律 direct_form（3 节点），无论触发数据来自主表还是子表明细；循环容器（--cycle）仅限对「获取多条」结果逐条执行非更新类动作（消息通知/连接器），不是数据同步备选方案
- 同步修正 5 处文档：`集成自动化硬规则.md` 5.1（权威源，已 sync-hard-rules.js 分发 AGENTS/CLAUDE/.trae/.cursor）、SKILL.md 决策树+循环容器示例+参数表警告、cli-examples.md、node-playbook.md 黄金配方铁律、`docs/采购入库同步库存-集成自动化配置指南.md` 第八节（另修复指南 3.1 字段ID笔误：numberField_tbxz98t0j→numberField_tbxz9t0j、textField_tbxyfnrg+rg→textField_tbxyfnrg、numberField_u184dobj→numberField_u18hdobj）
- 实际验证：进销存4「采购入库同步库存」已由 5 节点循环流重建为 3 节点 direct_form 并发布，回读+体检 0 ERROR/0 WARN

## v2.5.0 (2026-07-29)
- **【从根源杜绝废流：保存前体检门禁 + 已有流审计 + 跨 AI 硬规则】** 新增 `integration-validate.js`：13 类检查（空壳获取节点/占位符字面量如 `processVar`/空公式/数据流断链/编造字段等）
- `integration-create.js` 保存前自动体检（含 Schema 字段存在性校验），有 [ERROR] 拒绝保存（`--force-save` 逃生口仅限用户批准）；审计 CLI 可回读体检任意已有逻辑流（含其他 AI/设计器创建的）
- 跨 AI 可移植硬规则：权威源 `references/集成自动化硬规则.md` + `scripts/sync-hard-rules.js` 一键分发 Trae/Cursor/AGENTS.md/CLAUDE.md；离线断言扩充至 28 用例全绿（含截图 4 硬伤反例）

## v2.4.0 (2026-07-29)
- **【体检问题全修复 + 离线断言全绿】** 一次性修复评估中识别的 P0/P1/P2/P3 级问题，`integration-builder.test.js` 16 用例全通过，6 个脚本 `node --check` 语法全通过
- 🔴 P0.1 修复 `integration-check.js` 的 `--output` Excel 导出未实现：新增 `exportToExcel`，生成「异常汇总」+「异常日志」两工作表；`require.main === module` 守卫使其可离线测试
- 🔴 P0.2 修复条件分支实际不分支：processJson 默认分支 `nextId` 改为直达结束节点、命中分支指向尾节点，形成真分流（原两分支均指向同一 conditionNextId，条件形同虚设）
- P1 补充 Groovy 脚本节点（`--script-lang groovy` → viewJson `GroovyNode`/props.groovy，processJson `CodeExecutor`/scriptType=Groovy，镜像已验证的 JavaScript 兄弟节点结构）
- P2.8 新增 `integration-get.js` + `integration-api.js` 的 `getProcess`（GET，isLogic=true）回读逻辑流节点结构，供修改前查看/排查
- P2.11 将触发/条件的 AND/OR 逻辑暴露到 CLI：新增 `--trigger-logic` / `--branch-logic`，支持重复 `--branch-condition` 组合多条件
- P3.12 统一两个 builder 的 `userFields` 默认值为 `form_inst_creator`（原 process/view 不一致）

## v2.3.0 (2026-07-28)
- **【剩余 3 类节点全回归】脚本/条件分支/循环容器 API 直建打通**：3 条真实回归流保存成功 + 设计器画布/面板回读验证通过（回归E 脚本代码与输出变量回显、回归F 面板回显「姓名 等于 张三」、回归G 面板回显数据源+continue 阻断模式）
- 🔴 核心修复：旧 builder 三类节点实现完全错误 — 脚本节点错用 `ScriptNode`+`scriptRules`（正确：`JavaScriptNode` + props.JavaScript 包装，processJson type=`CodeExecutor` Gb 形状）；条件分支平铺非容器（正确：`route` 容器 + condition 子节点，子节点才有 prevId）；循环容器完全缺失（正确：`foreach` + 循环体末节点回指容器 + jumpId）
- bundle 权威序列化规则（Jct 类型映射 / Gb / jb / Ub / ny / Yct / Fb）固化到 `references/canonical-node-shapes.md`
- 新增 CLI 参数：`--script-output var:type[:desc]`（可多次）/`--cycle`；`--script-code`/`--branch-*` 去除「后端暂不支持」标注
- 关键一致性约束：分支/循环节点 ID 由 create.js 统一生成后传入两个 builder；带 --cycle 时消息节点嵌入循环体（离线断言 51 项全通）

## v2.2.0 (2026-07-28)
- **【四大类场景全回归】数据节点 API 直建全面打通**：主表/子表 × insert/update/delete/upsert 共 7 条真实逻辑流保存成功 + 设计器回读验证通过
- 🔴 核心修复：processJson 的 `dataUpdate` 节点 props 改为【扁平】展开的 updateDataRules（bundle 转换器 `Jb` 权威形状），根治「转换xml失败」；viewJson 同步增加 subCondition/rulesFilter/tableRulesFilter
- 🔴 核心修复：多条获取的 viewJson 组件名 `GetMultipleDataNode`→`GetBatchDataNode`（错名保存不报错但画布静默不渲染），节点级/getData 的 type 改为 batch/single 随查询类型
- 新增 CLI 参数：`--update-type`/`--update-sub-source-id`/`--update-sub-condition`/`--update-none-operation`(upsert)/`--delete-data`/`--delete-sub-source-id`/`--add-data-insert-type`/`--add-data-sub-form-uuid`/`--add-data-type`/`--add-data-source-id`
- 删除节点（bundle `Xb`）/新增节点（bundle `Zb`）processJson 权威形状固化到避坑清单 10–12 条

## v2.1.0 (2026-07-19)
- **【真金白银经验固化】新增「节点权威对照表 + 一步到位配置手册」**：所有节点 componentName / props 顶层键从真实设计器引擎抓取核实，杜绝再凭空猜测
- 决定性避坑清单：脚本节点=`JavaScriptNode`(非ScriptNode)、`UpdateDataNode` 扁平 props(name/nodeName/description/updateDataRules，缺则白屏崩溃)、`AddDataNode` 同构、`JavaScriptNode` 的 props.JavaScript.action.code、读回用 `props.items[].getValue()`、`CycleContainer` 只遍历 GetBatch 不能遍历触发子表
- 黄金配方：direct_form 子表"逐行匹配更新"累加完整 `updateDataRules` 形状 + 公式编码规则（跨表 `#{formUuid/fieldId}`、触发 `#{fieldId}`）+ 设计器四步 + Playwright 兜底路径（引擎入口/稳定 createNode/读回/发布/启停确认）
- 已在进销存3「采购入库 → 采购订单.采购明细.已入库数量」子表累加流上线验证并启用（status=y）

## v2.0.0 (2026-07-14)
- 新增 `--get-self` / `--get-self-field` / `--get-self-query-field` 参数，支持自动插入获取自身节点
- 新增 `--initiate-approval-form-uuid` / `--initiate-approval-initiator-user` / `--initiate-approval-assignment` 参数，支持发起审批节点
- 新增 `--connector-mode` / `--connection-id` / `--connector-display-name` 参数，支持 HTTP 连接器模式自动推断
- 修复节点执行顺序：获取数据节点现在在新增数据节点之前执行（trigger -> dataRetrieve -> addData -> initiateApproval -> ...）
- 修复 `buildDataRetrieveCondition` 支持 opCode 和 valueType 参数
- 新增 `resolveConnectorMode` 函数，connectorId 以 Http_ 开头时自动按 mode=5 处理
- 新增 `buildInitiateApprovalAssignments` / `mapDataRetrieveOperator` 函数
- 连接器节点支持 `connectorMode` 和 `connectionId` 字段
- view-builder 新增 `InitiateApprovalNode` 组件支持

## v1.0.2 (2026-05-24)
- 新增 `--data-query-type multiple` 支持「获取多条数据」节点（通过 quantity 控制条数）
- 扩展 process-builder / view-builder 增加 `GetMultipleDataNode` 组件（⚠️ v2.2.0 已纠正为 `GetBatchDataNode`）
- 新增 `--update-form-uuid`/`--update-assignment`/`--script-code`/`--branch-field` 参数（预留，后端当时暂不支持）
- 全功能实测确认：新增数据/获取单条数据/获取多条数据/消息通知/连接器节点均通过

## v1.0.1 (2026-05-24)
- 修复 `integration-api.js` POST 请求双重 `querystring.stringify` bug（导致 POST body 为空）
- 为所有 POST 请求添加正确的 `Referer` 头（解决 CSRF 校验失败问题）
- 全功能测试通过：创建/修改/查询/启停/日志检查

## v1.0.0 (2026-05-24)
- 从宜搭AI编程工具集成自动化模块提炼
- 支持创建/修改集成自动化（草稿保存 + 发布）
- 支持查询逻辑流列表（关键字/表单/状态筛选）、启用/停用、运行日志检查（异常排查 + Excel导出）
- 支持6种节点类型：触发器、新增数据、获取单条数据、连接器调用、消息通知、结束
- 内置钉钉待办2.0连接器预设；依赖 api-client skill 提供登录态管理
