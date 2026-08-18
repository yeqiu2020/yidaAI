# integration 版本历史

> 本文件从 SKILL.md 拆分而来（渐进式披露）。按需加载：需要了解某个能力何时引入/修复了什么问题时查阅。

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
