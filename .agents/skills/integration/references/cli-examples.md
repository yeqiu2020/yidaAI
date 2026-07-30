# integration CLI 完整示例集

> 本文件从 SKILL.md 拆分而来（渐进式披露）。按需加载：组装 `integration-create.js` 复杂参数、或使用 list/check/get/validate 的进阶选项时查阅。参数逐项说明见 SKILL.md「六、使用方式」参数表。

## 1. integration-create.js 创建示例

```bash
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
  --initiate-approval-initiator-user "01376266634908:张三" \
  --initiate-approval-assignment "textField_b1:processVar:textField_a1" \
  --publish

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

# 创建带循环容器的自动化（循环体=消息节点，逐条发通知）
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-XXX "循环通知" \
  --data-form-uuid FORM-YYY --data-query-type multiple --cycle \
  --receivers "user001"

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
