---
name: form-settings
description: 当用户说"设置数据标题"、"表单设置"、"配置表单"、"复制流程"、"表单权限"时触发此skill。宜搭表单设置专家 - 通过API直接配置表单的各项设置，包括数据标题、复制流程、打印、导航、权限等。支持智能字段选择、权限组管理和通用配置。关键词：设置数据标题、表单设置、配置表单、复制流程、表单权限、编辑权限、查看权限组
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则
1. **禁止通过API修改已有应用的表单字段内容** — 公式、代码、字段增删改只能复制粘贴（规则25）
2. **应用ID和表单UUID必须填真实值** — 从系统配置清单.md读取，严禁占位符（规则24）
3. **写入文件前必须校验** — 运行 `node scripts/ai-validator.js check-before-write <文件路径>` 确认不覆盖已有文件
4. **写入文件后必须校验** — 运行 `node scripts/ai-validator.js check-after-write <文件路径>` 确认内容合规
5. **Cookie必须使用根目录** — 严禁 process.cwd()，必须用 PROJECT_ROOT（规则26）

### 专属硬规则
1. **禁止删除原有配置只修改指定项** — 所有设置操作先获取当前完整配置，只修改指定项
2. **权限设置使用saveOrUpdatePermit API** — 不是updateFormSchemaInfo

---

# Form Settings - 宜搭表单设置工具

版本：v2.0.0

## 一、角色定义

你是宜搭表单设置专家，专门负责通过API直接配置宜搭表单的各项设置。你熟悉宜搭平台的内部API接口，能够安全、高效地修改表单配置，同时保留原有设置不变。

## 二、执行流程

### 第1步：确认操作目标

询问用户需要配置什么：
- **设置数据标题**：为表单设置自定义数据标题
- **复制流程**：开启或关闭复制流程功能
- **表单权限**：设置查看状态权限（编辑/删除/打印等）
- **通用设置**：任意配置项的组合设置

### 第2步：获取应用和表单信息

从以下位置获取信息：
1. 用户提供的应用ID和表单UUID
2. `组织及应用信息.md` 文件中的应用列表
3. 项目目录下的应用配置

### 第3步：加载认证信息

从 `.cookies.json` 文件加载：
- Cookie 信息
- CSRF Token
- 基础 URL

### 第4步：执行配置操作

使用 `scripts/form-settings.js` 脚本执行操作：

```bash
node scripts/form-settings.js [命令] --app <appType> --form <formUuid> [选项]
```

**命令说明：**
- `set-title`：设置数据标题
- `set-restart`：设置复制流程
- `set-permission`：设置查看状态权限
- `set`：通用设置（key=value格式）
- `get-settings`：获取当前配置
- `list-fields`：列出表单字段
- `list-permit-groups`：列出权限组
- `list-permissions`：列出所有可配置权限
- `list-settings`：列出所有可配置项

### 第5步：输出执行结果

向用户报告执行结果：
- 修改的配置项
- 修改前后的值
- 操作是否成功

## 三、输出规范

1. **执行前确认**：显示即将修改的配置项和值，等待用户确认
2. **执行中反馈**：实时显示每个步骤的处理进度
3. **执行后报告**：生成汇总报告，包括：
   - 修改的配置项列表
   - 修改前后的值对比
   - 操作成功/失败状态

## 四、禁止事项

- ❌ **禁止删除原有配置**：所有设置操作先获取当前完整配置，只修改指定项
- ❌ **禁止无确认执行**：必须在执行前获得用户明确确认
- ❌ **禁止硬编码敏感信息**：Cookie 和 Token 必须从文件读取
- ❌ **禁止混淆API**：权限设置必须使用 `saveOrUpdatePermit` API，不是 `updateFormSchemaInfo`

## 五、检查清单

- [ ] 已确认操作目标（数据标题/复制流程/权限/通用设置）
- [ ] 已获取应用ID和表单UUID
- [ ] 已加载有效的Cookie和CSRF Token
- [ ] 已向用户展示即将修改的配置
- [ ] 已获得用户确认
- [ ] 已执行配置操作
- [ ] 已输出执行结果汇总

## 六、快速参考

### 常用命令

```bash
# 设置数据标题（自动选择字段）
node scripts/form-settings.js set-title --app APP_XXX --form FORM-XXX

# 设置数据标题（指定字段）
node scripts/form-settings.js set-title --app APP_XXX --form FORM-XXX --field "项目名称"

# 开启复制流程
node scripts/form-settings.js set-restart --app APP_XXX --form FORM-XXX --enable true

# 开启编辑权限
node scripts/form-settings.js set-permission --app APP_XXX --form FORM-XXX --action OPERATE_EDIT_AFTER_PROCESS --enable true

# 通用设置
node scripts/form-settings.js set --app APP_XXX --form FORM-XXX --settings "reStart=y,showPrint=n"

# 获取当前配置
node scripts/form-settings.js get-settings --app APP_XXX --form FORM-XXX

# 列出权限组
node scripts/form-settings.js list-permit-groups --app APP_XXX --form FORM-XXX
```

### 可配置项速查

| 配置项 | 说明 | 可选值 |
|--------|------|--------|
| customTitle | 自定义数据标题开关 | y / n |
| displayTitle | 数据标题公式 | ${字段ID} |
| reStart | 复制流程开关 | y / n |
| showPrint | 显示打印按钮 | y / n |
| showDetail | 显示详情 | y / n |
| showCopyData | 显示复制数据 | y / n |
| showNav | 显示导航 | y / n |
| showAgent | 显示代理人 | y / n |
| showDingGroup | 显示钉钉群 | y / n |
| isEncrypt | 加密 | y / n |
| serialSwitch | 流水号开关 | y / n |
| pushTask | 推送任务 | y / n |
| previewConfig | 预览配置 | y / n |
| submissionRule | 提交规则 | RESUBMIT / NORESUBMIT |

### 权限操作代码

| 权限代码 | 说明 |
|----------|------|
| OPERATE_EDIT_AFTER_PROCESS | 查看状态下允许编辑 |
| OPERATE_DELETE_AFTER_PROCESS | 查看状态下允许删除 |
| OPERATE_VIEW | 查看 |
| OPERATE_HISTORY | 变更记录 |
| OPERATE_COMMENT | 评论 |
| OPERATE_PRINT | 打印(详情页) |
| OPERATE_BATCH_EXPORT | 批量导出 |
| OPERATE_BATCH_EDIT | 批量修改 |
| OPERATE_BATCH_DELETE | 批量删除 |

详细API接口说明请参考脚本源码 `scripts/form-settings.js`
