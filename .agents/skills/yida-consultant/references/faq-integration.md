# 集成自动化类高频问题

> 来源：integration/references/集成自动化硬规则.md、node-playbook.md
> ⚠️ 所有集成自动化修复必须走 integration CLI，禁止手写 processJson/viewJson

---

## 循环容器内发起审批节点（v2.7.1 起标准支持）

### 用途

遍历子表行逐行在目标流程表单发起审批（如：提交一条带多条明细的单据，对每条明细各发起一条审批流程）。

### CLI 创建

```bash
node .agents/skills/integration/scripts/integration-create.js APP_XXX FORM-TRIGGER "循环发起审批" \
  --cycle --data-form-uuid FORM-TARGET --data-query-type multiple \
  --cycle-initiate-approval-form-uuid FORM-APPROVAL \
  --cycle-initiate-approval-assignment "targetField1:sourceField1" \
  --cycle-initiate-approval-assignment "targetField2:sourceField2" \
  --publish
```

### 创建后修复设计器面板

循环内发起审批节点首次点击时设计器面板可能空白，执行 Playwright 脚本修复：
```bash
node .agents/skills/integration/scripts/integration-designer-fix.js <appType> <processCode>
```

### viewJson 格式（v2.6.0 实测金标准）

1. **循环内**：`assignments[].value` = **循环容器节点 ID**（不是裸子表字段 ID）；`initiator.type='form_field'` + `initiator.value=<提交成员字段 componentId>`（不是 form_field_list+form_inst_creator）；`signAction='one_by_one'` 必须有
2. **主链**：保留原始格式（form_field_list+form_inst_creator，裸字段 ID，无 signAction），与手动配置的金标准流一致

### 历史

v2.5.8~v2.5.9 曾误判为"宜搭前端框架限制"并加 CLI 硬拦截；v2.6.0 实测确认 viewJson 格式正确后面板可正常显示；v2.7.1 正式移除硬拦截恢复为标准功能。

---

## 集成自动化保存成功但不执行

### 症状

集成自动化保存成功，但流程触发后不执行任何动作，或执行结果不符合预期。

### 根因

宜搭 saveProcess 接口不校验配置完整性，**保存成功 ≠ 配置正确**。常见根因：
1. 空壳获取节点（未配置获取条件）
2. processVar/literal/formula token 被当字面量存进匹配条件
3. 公式赋值为空
4. 数据流断链（节点间未正确串联）

### 修复方案

1. 先用 `integration-validate.js` 体检，查看 [ERROR] 项
2. 根据体检报告定位具体问题
3. 调 integration skill 重建逻辑流（不要手改 processJson）

### 验证方式

调 `integration-validate.js` 体检，必须输出"体检通过"。

### 参考来源

`.agents/skills/integration/references/集成自动化硬规则.md`（第1-4条）

---

## 数据同步场景误用循环容器

### 症状

逻辑流配置了循环容器来同步数据，但执行效率低或结果不正确。

### 根因

数据同步/累加/upsert 场景应使用 direct_form 更新数据节点（3节点），而非循环容器（5节点+获取多条+循环）。引擎在 direct_form 模式下自动对触发子表明细行逐行迭代匹配。

### 修复方案

使用 direct_form 直接更新模式（3节点：触发→更新→结束），不需要循环容器、获取多条数据节点。

标准 CLI 模板见 `.agents/skills/integration/references/集成自动化硬规则.md` 第5条。

### 验证方式

调 `integration-get.js` 回读节点树，确认只有3个节点（触发→更新→结束）。调 `integration-validate.js` 体检通过。

### 参考来源

`.agents/skills/integration/references/集成自动化硬规则.md`（第5条、5.1条）

---

## 公式赋值 viewJson 三字段格式错误

### 症状

集成自动化的更新节点中公式赋值后，设计器设置面板显示异常（如显示 `[object Object]`、JSON 原文、或空值），或验证器报"类型不合法"。

### 根因

公式赋值（valueType=column）的 viewJson 必须同时写入 `__display`、`__source`、`value` 三个字段，且格式有严格规定：
- `__display` = 纯文本字符串（不能是 JSON 对象或 JSON 字符串）
- `__source` = 与 CLI 传入公式完全相同（跨表引用用单斜杠 `/`，不是 `//`）
- `value` = 与 `__source` 完全相同，不做任何转换

### 修复方案

通过 integration CLI 重建逻辑流，CLI 会自动生成正确的三字段格式。不要手动修改 viewJson。

### 验证方式

调 `integration-validate.js` 体检，确认无"类型不合法"错误。调 `integration-get.js` 回读 viewJson，确认三字段格式正确。

### 参考来源

`.agents/skills/integration/references/集成自动化硬规则.md`（第8条）

---

## 删除流程表单数据未加流程状态判断

### 症状

删除自动化规则执行后，流程进行中的数据被误删除，造成业务流程异常。

### 根因

流程表单的数据在流程进行中时不允许直接删除，只有流程完成后（状态为"已完成"）才能删除。创建删除自动化规则时，未在获取数据节点中增加流程状态的条件判断。

### 修复方案

在获取数据节点的过滤条件中增加：流程状态 = "已完成"。

注意：仅流程表单（formType=process）需要此条件，普通表单（formType=receipt）无需此条件。

### 验证方式

调 `integration-get.js` 回读节点树，检查获取数据节点的过滤条件是否包含流程状态判断。调 `integration-validate.js` 体检通过。

### 参考来源

`.agents/skills/integration/references/集成自动化硬规则.md`（第9条）
