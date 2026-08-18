# integration CLI 完整示例集

> 本文件从 SKILL.md 拆分而来（渐进式披露）。按需加载：组装 `integration-create.js` 复杂参数、或使用 list/check/get/validate 的进阶选项时查阅。参数逐项说明见 SKILL.md「六、使用方式」参数表。

## 0. ★ 方案选择决策树（判别标准=动作类型，不是数据拓扑；选错方案=白建逻辑流，务必先看）

```
触发后需要对另一张表做什么？
├─ 数据同步/累加/upsert（更新或新增目标表数据）
│  ✅ 一律 direct_form 更新数据节点（3 节点：触发→更新→结束），
│     无论触发数据来自主表字段还是子表明细行！
│  ├─ 目标是主表字段（如：采购入库.入库明细/主表→库存信息主表，已实际验证）
│  │  --update-form-uuid + --update-condition + --update-assignment + --update-none-operation add
│  │  引擎自动对触发子表明细逐行迭代匹配，无需获取节点、无需循环
│  └─ 目标是子表行（如：采购入库.入库明细→采购订单.采购明细.已入库数量）
│     追加 --update-sub-source-id + --update-sub-condition
│  ⚠️ 任何数据同步场景禁止用循环容器！（同一根因已两次把"采购入库同步库存"误建成5节点循环流）
│
└─ 逐条执行非更新类动作（对获取多条的每条结果分别执行以下动作）
   ⚠️ 仅此类场景才用循环容器（--cycle，需前置获取多条节点）；它不是数据同步的备选方案。
   ├─ 发起审批（如：任务分派子表逐行→任务执行发起审批，必须用循环+InitiateApprovalNode）
   │  ⚠️ "发起审批" ≠ "新增数据"！发起审批是创建流程实例，不是更新/新增数据记录。
   │  assignment 格式：目标字段ID:processVar:源字段ID（两个冒号，一个冒号会静默丢失）
   ├─ 消息通知（对每条结果发消息）
   └─ 连接器调用（对每条结果调API）
```

> 已验证成功的库存同步完整配置见 `docs/采购入库同步库存-集成自动化配置指南.md`。

## 1. integration-create.js 创建示例

```bash
# ★★★ 黄金配方：审批通过后同步更新目标表（direct_form 直接更新，最常用、最简方案）
# 通用模式：A表审批通过 → 按条件匹配B表记录 → 目标字段公式累加 → 未匹配则新增(upsert)
# 架构：3 节点（触发→更新→结束），不需要获取节点、不需要循环容器
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后同步更新" \
  --events processFinish --approval-actions agree \
  --update-form-uuid FORM-TARGET \
  --update-condition "textField_target_key1:目标匹配字段1:textField_trig_key1:TextField:Equal::processVar" \
  --update-condition "textField_target_key2:目标匹配字段2:textField_trig_key2:TextField:Equal::processVar" \
  --update-assignment "numberField_target_val:column:#{FORM-TARGET/numberField_target_val}+#{numberField_trig_val}" \
  --update-assignment "textField_target_key1:processVar:textField_trig_key1" \
  --update-assignment "textField_target_key2:processVar:textField_trig_key2" \
  --update-none-operation add \
  --publish

# 创建简单的消息通知自动化（数据创建时通知指定用户）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "新数据通知" \
  --events insert \
  --receivers "user001,user002" \
  --title "有新数据提交" \
  --content "请及时查看"

# 创建带获取自身节点的自动化（触发后重新读取当前记录）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "获取自身后通知" \
  --events insert,update \
  --get-self \
  --receivers "user001" \
  --publish

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

# 【删除】获取多条 + 删除数据（删整条主表记录；加 --delete-sub-source-id 则只删子表行）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "批量删除" \
  --events insert \
  --data-form-uuid FORM-ZZZ --data-query-type multiple \
  --data-condition "textField_bbb:客户名称:textField_aaa" \
  --delete-data

# 【删除子表行·模式A】目标表单子表直接获取（4节点，设计器显示"从子表中获取"）
# 场景：子表条件字段值在目标表单中全局唯一（如"名称"主表记录唯一），直接按子表字段匹配删除子表行
# 架构：触发 → 获取多条(从子表中获取, originalType=sub_table, sourceId=#{目标表单}) → 删除子表行 → 结束
# ⚠️ --data-sub-source-id 单独使用（无 --data-sub-condition）即触发 sub_table 直接获取；
#    若误加 --data-sub-condition 会变成 5 节点 cascade（显示"从数据节点中获取"）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后删除关联子表行" \
  --events processFinish --approval-actions agree \
  --data-form-uuid FORM-TARGET \
  --data-query-type multiple \
  --data-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
  --data-sub-source-id tableField_target_sub \
  --delete-data \
  --delete-sub-source-id tableField_target_sub \
  --delete-sub-condition "numberField_target_sub_val:规格:numberField_trigger_sub_val:NumberField:Equal::processVar" \
  --publish

# 【子表批量新增】把触发表子表行/获取多条结果 批量写入目标表的子表
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "子表批量新增" \
  --events insert \
  --add-data-form-uuid FORM-ZZZ \
  --add-data-insert-type sub_table --add-data-sub-form-uuid tableField_target \
  --add-data-type batch --add-data-source-id tableField_trigger \
  --add-data-assignment "textField_sub1:column:textField_src"
# 数据源也可用前置获取多条节点：--data-form-uuid FORM-SRC --data-query-type multiple --add-data-source-id get

# 【子表更新 + upsert】主条件定位主表记录，子条件逐行匹配子表，未命中则新增一条
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "子表upsert" \
  --events insert \
  --update-form-uuid FORM-ZZZ \
  --update-sub-source-id tableField_sub \
  --update-condition "textField_main:主表匹配字段:textField_trig" \
  --update-sub-condition "selectField_col:子表匹配列:textField_trig2" \
  --update-assignment "numberField_qty:column:#{FORM-ZZZ/numberField_qty}+#{numberField_src}" \
  --update-none-operation add

# 创建带发起审批节点的自动化（A审批完成后发起B流程）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-A-XXX "A审批完成后发起B流程" \
  --events processFinish \
  --approval-actions agree \
  --get-self \
  --initiate-approval-form-uuid FORM-PROCESS-B-XXX \
  --initiate-approval-initiator-user "00000000000008:张三" \
  --initiate-approval-assignment "textField_b1:processVar:textField_a1" \
  --publish

# ★ 循环内发起审批（子表逐行→目标流程表单发起审批，如：任务分派→任务执行）
# 场景：A表(流程表单)审批通过后，遍历A表子表行，逐行在B表(流程表单)发起审批
# 架构：4 节点（触发→获取多条数据→循环[含发起审批]→结束）
# ⚠️ 关键1：assignment格式必须用两个冒号 targetFieldId:processVar:sourceFieldId
#    只用一个冒号会导致 parseAssignments 解析失败，赋值静默丢失！
# ⚠️ 关键2：发起人默认自动查找主表 EmployeeField（设计器显示字段中文名如"项目经理"）
#    也可通过 --cycle-initiate-approval-initiator 手动指定 EmployeeField 字段ID
# ⚠️ 关键3：创建后必须执行 integration-designer-fix.js --save 修复设计器面板并持久化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "审批通过后循环发起审批" \
  --events processFinish --approval-actions agree \
  --data-source-type subform --data-sub-field-id tableField_xxx \
  --cycle \
  --cycle-initiate-approval-form-uuid FORM-TARGET \
  --cycle-initiate-approval-assignment "textField_target1:processVar:textField_source1" \
  --cycle-initiate-approval-assignment "employeeField_target2:processVar:employeeField_source2" \
  --cycle-initiate-approval-assignment "dateField_target3:processVar:dateField_source3" \
  --publish
# 创建后修复设计器面板：
# node .agents/skills/integration/scripts/integration-designer-fix.js APP_XXX <processCode> --save
#
# 手动指定发起人（可选，不传则自动查找主表 EmployeeField）：
# --cycle-initiate-approval-initiator employeeField_xxx

# 创建带连接器调用节点的自动化（钉钉待办）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "创建待办" \
  --events insert \
  --connector-id "G-CONN-1016B8AEBED50B01B8D00009" \
  --action-id "G-ACT-1016B8B1911A0B01B8D0000I" \
  --connector-name "创建待办任务" \
  --connector-assignment "subject:processVar:textField_xxx" \
  --connector-assignment "priority:literal:20"

# 创建带 HTTP 自定义连接器的自动化
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "调用HTTP连接器" \
  --events insert \
  --connector-id "Http_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --action-id "publish_month_qs" \
  --connection-id "28336" \
  --connector-display-name "BI 后端" \
  --connector-assignment "month:processVar:textField_month" \
  --publish

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

# 创建带脚本节点的自动化（输出变量供后续节点引用）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "脚本计算" \
  --script-code "var total=1+1; return {result:String(total)};" \
  --script-output "result:Text:计算结果" \
  --receivers "user001"

# 创建带条件分支的自动化（两分支：条件1 + 其他情况）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "分支通知" \
  --branch-field textField_xxx --branch-operator Equal --branch-value "张三" --branch-field-name "姓名" \
  --receivers "user001"

# ⚠️ 循环容器（仅限：对「获取多条数据」的每条结果逐条执行非更新类动作，如逐条发消息通知）
# ❗ 数据同步/累加/upsert（含子表明细→目标主表，如库存同步）一律用上面的 direct_form 黄金配方，禁止用循环容器！
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "逐条通知" \
  --events processFinish --approval-actions agree \
  --data-form-uuid FORM-YYY --data-query-type multiple \
  --cycle \
  --receivers "user001" --title "逐条提醒" --content "请处理"

# 循环容器内发起审批（遍历子表行逐行发起审批流程）
# 场景：提交一条带多条明细的单据，对每条明细各发起一条审批流程
# v2.8.0 金标准：assignments[].value 自动生成为 ${cycleNodeId}.fieldId 格式 + __display=源字段中文名
# v2.8.2 修复：发起人(initiator)使用真实 EmployeeField（自动查找主表第一个），设计器显示字段中文名
# ⚠️ 创建后必须执行设计器面板修复（触发 getFormVariables 加载 + 工具栏保存持久化）：
# node .agents/skills/integration/scripts/integration-designer-fix.js APP_XXX <生成的processCode> --save
#
# 也可以用 --data-source-type subform 从触发数据子表获取（自动设为 multiple）：
# node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "循环发起审批" \
#   --events processFinish --approval-actions agree \
#   --data-source-type subform --data-sub-field-id tableField_xxx \
#   --cycle \
#   --cycle-initiate-approval-form-uuid FORM-APPROVAL \
#   --cycle-initiate-approval-assignment "textField_target1:textField_source1" \
#   --cycle-initiate-approval-assignment "textField_target2:textField_source2" \
#   --publish
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "循环发起审批" \
  --events processFinish --approval-actions agree \
  --data-form-uuid FORM-YYY --data-query-type multiple \
  --cycle \
  --cycle-initiate-approval-form-uuid FORM-APPROVAL \
  --cycle-initiate-approval-assignment "textField_target1:textField_source1" \
  --cycle-initiate-approval-assignment "textField_target2:textField_source2" \
  --publish
# ⚠️ 创建后执行设计器面板修复（必须加 --save 触发工具栏保存）：
# node .agents/skills/integration/scripts/integration-designer-fix.js APP_XXX <生成的processCode> --save

# 创建并直接发布
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "发布流程" \
  --events insert \
  --receivers "user001" \
  --publish
```

## 2. 脚本语言 / 多条件分支 / 逻辑关系参数

```bash
# Groovy 脚本节点（默认 js，可切换为 groovy）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "Groovy处理" \
  --events insert \
  --script-code "return ['ok': true]" --script-lang groovy

# 多条件分支 + AND/OR 逻辑（--branch-condition 可重复，格式 fieldId:fieldName:opCode:value[:componentType[:valueType]]）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "多条件分支" \
  --events insert \
  --branch-condition "amount:金额:gt:1000" \
  --branch-condition "status:状态:eq:待处理" \
  --branch-logic and \
  --receivers user001 --title "命中" --content "满足全部条件"

# 触发条件多条件的逻辑关系
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "触发OR" \
  --events insert --trigger-logic or
```

## 3. 查询逻辑流列表（integration-list.js）

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

## 4. 启用/停用逻辑流

```bash
# 启用
node .agents/skills/integration/scripts/integration-list.js enable <appType> <formUuid> <processCode>

# 停用
node .agents/skills/integration/scripts/integration-list.js disable <appType> <formUuid> <processCode>
```

## 5. 检查运行日志（integration-check.js）

```bash
# 检查应用下异常日志
node .agents/skills/integration/scripts/integration-check.js APP_XXX

# 输出JSON格式
node .agents/skills/integration/scripts/integration-check.js APP_XXX --json

# 导出Excel报告（异常汇总 + 异常日志明细两个工作表）
node .agents/skills/integration/scripts/integration-check.js APP_XXX --output report.xlsx

# 检查成功日志
node .agents/skills/integration/scripts/integration-check.js APP_XXX --status success

# 多应用批量检查
node .agents/skills/integration/scripts/integration-check.js APP_AAA APP_BBB APP_CCC
```

日志状态筛选：`exception`（默认，执行异常）/ `success`（执行成功）/ `running`（执行中）。

## 6. 回读逻辑流配置（integration-get.js）

```bash
# 回读并以节点树形式展示逻辑流结构（修改前查看/排查）
node .agents/skills/integration/scripts/integration-get.js APP_XXX FLOW-XXXX

# 输出解析后的完整 JSON（含 processJson/viewJson）
node .agents/skills/integration/scripts/integration-get.js APP_XXX FLOW-XXXX --json

# 输出接口原始返回（不解析嵌套 json 字符串）
node .agents/skills/integration/scripts/integration-get.js APP_XXX FLOW-XXXX --raw
```

## 7. 体检逻辑流（integration-validate.js）

```bash
# 回读线上逻辑流并体检（有错误时退出码 1）
node .agents/skills/integration/scripts/integration-validate.js APP_XXX FLOW-XXXX

# 体检本地 processJson（兼容 processJson 本体 / {processJson} 包装 / getProcess 原始 content）
node .agents/skills/integration/scripts/integration-validate.js --file draft.json --json
```
