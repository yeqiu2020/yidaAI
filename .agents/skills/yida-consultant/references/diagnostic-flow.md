# 诊断决策树

> 本文件是 yida-consultant 的分类路由辅助参考。AI 应先运行 `scripts/diagnose.js` 获取建议分类，再结合用户上下文人工校正。

## 分类路由

```
问题输入
  │
  ├─ 含公式函数名（NOW/GT/IF/SUM/CONCATENATE/TIMESTAMP/DATE...）→ 公式问题
  │   ├─ 知识源：faq-formula.md + formula-generator/references/
  │   ├─ 验证：data-tester 提交测试数据
  │   └─ 修复：给出正确公式写法（用户复制粘贴）
  │
  ├─ 含 JS 关键词（function/this.$/this.props/exports/dataSourceMap...）→ 代码问题
  │   ├─ 知识源：faq-code.md + code-expert/references/
  │   ├─ 验证：js-action-tester 创建测试表单绑定代码
  │   └─ 修复：给出正确代码写法（用户复制粘贴）
  │
  ├─ 含"业务关联规则/INSERT/UPDATE/DELETE/UPSERT/跨表"→ 业务规则问题
  │   ├─ 知识源：faq-business-rule.md + business-rule/references/
  │   ├─ 验证：rule-sync 同步当前规则配置
  │   └─ 修复：调 business-rule skill 重新配置
  │
  ├─ 含"集成自动化/逻辑流/保存成功但不/触发器/节点"→ 集成自动化问题
  │   ├─ 知识源：faq-integration.md + integration/references/
  │   ├─ 验证：integration-validate.js 体检
  │   └─ 修复：调 integration skill 重建逻辑流（走 CLI）
  │
  ├─ 含"提交报错/数据格式/关联填充/字段格式"→ 数据问题
  │   ├─ 知识源：faq-data.md + data-tester/references/
  │   ├─ 验证：config-sync 同步配置检查字段格式
  │   └─ 修复：指导正确数据格式
  │
  ├─ 含"连接器/鉴权/API调用/动作配置"→ 连接器问题
  │   ├─ 知识源：faq-connector.md + connector/references/
  │   ├─ 验证：connector 动作测试
  │   └─ 修复：调 connector skill 重新配置
  │
  ├─ 含"登录/Cookie/权限/数据范围/看不到数据"→ 登录/权限问题
  │   ├─ 知识源：faq-permission.md + auth-plus / config-sync
  │   ├─ 验证：auth-plus 检查登录态、config-sync 检查权限配置
  │   └─ 修复：调 auth-plus 重新登录或调对应 Skill 调整权限
  │
  ├─ 含"表单字段/布局/UUID/组件ID/字段类型"→ 表单问题
  │   ├─ 知识源：faq-form.md + form_creator/references/
  │   ├─ 验证：get-schema 同步最新 Schema
  │   └─ 修复：指导正确配置或调 form_creator 重建
  │
  └─ 含"Node.js/npm/终端/乱码/编码/路径/命令找不到"→ 系统环境问题
      └─ 转交 system-troubleshooter
```

## 执行型 vs 诊断型快速判别

| 信号类型 | 关键词 | 判定 |
|----------|--------|------|
| 执行型 | 写、创建、生成、配置、同步、测试、清空 | 转交对应执行 Skill |
| 诊断型 | 为什么、报错、不生效、什么原因、哪里错、对不对、怎么解决 | yida-consultant 接管 |

## 与 system-troubleshooter 的边界

| 错误特征 | 归属 |
|----------|------|
| textField_、numberField_、employeeField_ 等组件 ID | yida-consultant |
| NOW()、GT()、TIMESTAMP()、IF() 等宜搭公式函数 | yida-consultant |
| /yida/、saveFormData、连接器动作、业务规则、逻辑流 | yida-consultant |
| Node.js、npm、PowerShell、乱码、路径、权限拒绝、命令找不到 | system-troubleshooter |
| 两者都有 | 先排除环境问题，再进入宜搭业务诊断 |
