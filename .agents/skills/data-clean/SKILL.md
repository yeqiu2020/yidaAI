---
name: data-clean
description: 当用户说"清空数据"、"删除数据"、"清空表单数据"、"批量删除数据"、"清理数据"时触发此skill。宜搭表单数据清空专家 - 用于批量清空宜搭应用中的表单数据，支持清空所有表单或指定表单的数据。保留表单结构，仅删除数据记录。支持普通表单和流程表单的数据删除。关键词：清空数据、删除数据、清理数据、批量删除、表单数据清空
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **执行前必须确认** — 清空数据前必须向用户确认
2. **清空前自动备份数据ID列表** — 备份到本地文件以防万一
3. **数据不可恢复** — 必须明确告知用户数据删除后不可恢复

---

# Data Clean - 宜搭表单数据清空工具

## 一、角色定义

你是宜搭表单数据清空专家，专门负责帮助用户清空宜搭应用中的表单数据。你熟悉宜搭平台的 API 接口，能够安全、高效地批量删除表单数据，同时保留表单结构。

## 二、执行流程

### 第1步：确认清空范围

询问用户需要清空哪些表单的数据：
- **清空所有表单**：删除应用内所有表单的数据
- **清空指定表单**：只删除用户指定的表单数据

### 第2步：获取应用信息

从以下位置获取应用信息：
1. 用户提供的应用 ID
2. `组织及应用信息.md` 文件中的应用列表
3. 项目目录下的应用配置

### 第3步：加载认证信息

从 `.cookies.json` 文件加载：
- Cookie 信息
- CSRF Token
- 基础 URL

### 第4步：执行数据清空（两步走：先预览，后确认）

使用 `scripts/clear-form-data.js` 脚本执行清空操作。**必须显式指定删除范围**，且删除前必须先预览、再确认：

```bash
# 第一步：--dry-run 预览将删除的表单与条数（不会删除任何数据）
node scripts/clear-form-data.js [应用ID] <--all|--form <uuid>|--forms <u1,u2>> --dry-run

# 第二步：确认无误后加 --confirm 执行删除
node scripts/clear-form-data.js [应用ID] <--all|--form <uuid>|--forms <u1,u2>> --confirm
```

**选项说明：**
- `--all`：清空所有表单数据
- `--form <formUuid>`：清空指定表单数据
- `--forms <formUuid1,formUuid2,...>`：清空多个指定表单数据
- `--appName <应用名称>`：指定应用名称，直接定位系统配置清单（推荐通过API调用时使用）
- `--dry-run`：预览模式，仅列出将删除的表单与条数，不执行任何删除
- `--confirm`：确认执行删除（不可逆）。缺省时脚本会要求交互输入 `DELETE` 确认，非交互环境下不加 `--confirm` 将直接取消

> ⚠️ 安全约束（v2.2.0）：
> - 未指定 `--all`/`--form`/`--forms` 时脚本直接拒绝执行，不会删除任何数据；
> - 未加 `--confirm` 且非交互输入 `DELETE` 时不会删除；
> - 删除前自动将每条记录的完整内容备份到 `temp-file/data-backup/`，若内容抓取不完整会在备份文件与终端明确提示“不可完整还原”。

### 第5步：输出执行结果

向用户报告执行结果：
- 处理的表单数量
- 成功删除的数据条数
- 删除失败的数据条数
- 失败的详细信息（如有）

## 三、输出规范

1. **执行前确认**：显示即将清空的表单列表和数据量，等待用户确认
2. **执行中反馈**：实时显示每个表单的处理进度
3. **执行后报告**：生成汇总报告，包括：
   - 处理表单数
   - 成功删除数
   - 失败数
   - 失败详情

## 四、禁止事项

- ❌ **禁止删除表单结构**：只删除数据，不删除表单本身
- ❌ **禁止无确认执行**：必须在执行前获得用户明确确认
- ❌ **禁止跳过备份提醒**：执行前应提醒用户数据不可恢复
- ❌ **禁止硬编码敏感信息**：Cookie 和 Token 必须从文件读取

## 五、检查清单

- [ ] 已确认清空范围（全部/指定表单）
- [ ] 已获取应用 ID 和表单 UUID
- [ ] 已加载有效的 Cookie 和 CSRF Token
- [ ] 已向用户展示即将清空的数据量
- [ ] 已获得用户确认
- [ ] 已执行清空操作
- [ ] 已输出执行结果汇总

## 六、快速参考

### 常用命令

```bash
# 第一步：预览（不删除）——清空所有表单数据
node scripts/clear-form-data.js APP_XXXXXXXX --all --dry-run

# 第二步：确认执行——清空所有表单数据（指定应用名称，推荐）
node scripts/clear-form-data.js APP_XXXXXXXX --all --confirm --appName AI宜搭场景

# 清空指定表单数据（先 --dry-run 预览，再 --confirm 执行）
node scripts/clear-form-data.js APP_XXXXXXXX --form FORM-XXXXXXXX --dry-run
node scripts/clear-form-data.js APP_XXXXXXXX --form FORM-XXXXXXXX --confirm

# 清空多个指定表单
node scripts/clear-form-data.js APP_XXXXXXXX --forms FORM-XXX,FORM-YYY --confirm
```

### API 接口说明

**查询普通表单数据：**
```
GET /dingtalk/web/{appId}/v1/form/searchFormDataIds.json?formUuid={formUuid}&pageSize=100&currentPage=1
```

**查询流程表单数据：**
```
GET /dingtalk/web/{appId}/v1/process/getInstanceIds.json?formUuid={formUuid}&pageSize=100&currentPage=1
```

**删除普通表单数据：**
```
POST /dingtalk/web/{appId}/v1/form/deleteFormData.json
参数：formInstId={formInstId}&_csrf_token={csrfToken}
```

**删除流程实例：**
```
POST /dingtalk/web/{appId}/v1/process/deleteInstance.json
参数：processInstanceId={processInstanceId}&_csrf_token={csrfToken}
```

## 七、版本历史

- v2.1.2 (2026-06-05): 根因修复—Markdown转义下划线导致appId包含反斜杠（APP\_XXX→APP_XXX），sync_server和clear-form-data均添加unescape处理
- v2.1.1 (2026-06-05): 修复getRequest未传csrfToken导致API调用失败；appName容错处理
