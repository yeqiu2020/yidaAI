---
name: yida-get-schema
description: 宜搭表单 Schema 获取与同步技能，从宜搭平台获取表单结构并同步到本地 JSON 文件，支持单表单和批量同步，自动记录结构变更历史。
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则
1. **禁止通过API修改已有应用的表单字段内容** — 公式、代码、字段增删改只能复制粘贴（规则25）
2. **应用ID和表单UUID必须填真实值** — 从系统配置清单.md读取，严禁占位符（规则24）
3. **写入文件前必须校验** — 运行 `node scripts/ai-validator.js check-before-write <文件路径>` 确认不覆盖已有文件
4. **写入文件后必须校验** — 运行 `node scripts/ai-validator.js check-after-write <文件路径>` 确认内容合规
5. **Cookie必须使用根目录** — 严禁 process.cwd()，必须用 PROJECT_ROOT（规则26）

### 专属硬规则
1. **只读操作不修改线上数据** — 本Skill只从宜搭平台拉取Schema，绝不修改线上数据
2. **自动记录变更历史** — 每次同步自动生成表单结构变更.md记录差异

---

# 宜搭表单 Schema 获取与同步 Skill

版本：v1.0.2

## 概述

本技能提供从宜搭平台获取表单 Schema 并同步到本地的完整能力，支持：
- **单表单同步**：获取指定表单并覆盖本地 JSON
- **批量同步**：通过配置文件批量同步多个表单
- **变更记录**：自动生成 `表单结构变更.md` 记录每次同步的差异
- **组件ID清单**：自动生成 `组件ID清单.md` 记录所有 fieldId

## 使用方式

### 单表单同步

```bash
node sync-schema.js <appType> <formUuid> <本地JSON路径>
```

**参数说明**：
| 参数 | 必填 | 说明 |
|------|------|------|
| `appType` | 是 | 应用 ID，如 `APP_E0MZ4VB75ZMB1BIGNVT4` |
| `formUuid` | 是 | 表单 UUID，如 `FORM-xxx` |
| `本地JSON路径` | 是 | 本地 JSON 文件路径，如 `进销存管理/04客户管理/客户跟进「流程表单」/客户跟进「流程表单」.json` |

**示例**：
```bash
node sync-schema.js APP_xxx FORM-yyy "进销存管理/04客户管理/客户跟进「流程表单」/客户跟进「流程表单」.json"
```

### 批量同步

```bash
node sync-schema.js --config <配置文件路径>
```

**配置文件格式**（JSON）：
```json
{
  "appType": "APP_E0MZ4VB75ZMB1BIGNVT4",
  "forms": [
    {
      "formUuid": "FORM-xxx",
      "localPath": "进销存管理/04客户管理/客户信息「普通表单」/客户信息「普通表单」.json"
    },
    {
      "formUuid": "FORM-yyy",
      "localPath": "进销存管理/04客户管理/客户跟进「流程表单」/客户跟进「流程表单」.json"
    }
  ]
}
```

**示例**：
```bash
node sync-schema.js --config "sync-config.json"
```

## 工作流程

### 单表单同步流程

```
用户提供 appType + formUuid + 本地JSON路径
    ↓
调用 get-schema.js 获取线上 Schema
    ↓
读取本地 JSON 文件（如果存在）
    ↓
对比字段差异
    ↓
覆盖本地 JSON 文件
    ↓
生成/更新 表单结构变更.md
    ↓
完成
```

### 批量同步流程

```
用户提供配置文件
    ↓
读取配置中的 appType 和表单列表
    ↓
遍历每个表单
    ↓
逐个执行单表单同步流程
    ↓
汇总生成批量同步报告
    ↓
完成
```

## 输出文件

### 1. 覆盖的 JSON 文件
直接覆盖指定的本地 JSON 文件，保持最新的线上结构。

### 2. 表单结构变更.md
在本地 JSON 文件所在目录生成，记录每次同步的变更：

```markdown
# 表单结构变更记录

## 2026-03-12 14:30:15
### 客户跟进「流程表单」
- **新增字段**：
  - 跟进方式（selectField_abc123）
  - 下次跟进日期（dateField_def456）
- **删除字段**：
  - 旧字段名（textField_ghi789）
- **修改字段**：
  - 客户名称：变更了校验规则（必填 → 非必填）
  - 跟进状态：选项值变更（["待跟进","已跟进"] → ["待跟进","跟进中","已完成"]）
```

## 变更检测规则

| 变更类型 | 检测方式 |
|---------|---------|
| 新增字段 | 线上存在，本地不存在 |
| 删除字段 | 本地存在，线上不存在 |
| 修改字段 | fieldId 相同，但属性不同（label、required、options 等） |

## 前置依赖

- Node.js 16+
- 项目根目录存在 `.cookies.json`（首次运行会自动触发扫码登录）
- `yida-api-client` skill（用于调用宜搭 API）

## 文件结构

```
yida-get-schema/
├── SKILL.md                    # 本文档
└── scripts/
    ├── get-schema.js           # 获取表单 Schema 核心脚本
    └── sync-schema.js          # 同步到本地脚本（支持单/批量）
```

## 与其他技能配合

1. **创建应用和表单** → 使用 `form_creator` skill
2. **同步配置信息** → 使用 `yida-config-sync` skill 获取表单列表
3. **获取最新 Schema** → 本 skill，同步到本地 JSON
4. **生成公式** → 使用 `formula-generator` skill

## 接口说明

### getFormSchema

- **地址**：`GET /alibaba/web/{appType}/_view/query/formdesign/getFormSchema.json`
- **参数**：
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | `formUuid` | String | 是 | 表单 UUID |
  | `schemaVersion` | String | 否 | Schema 版本，默认 `V5` |

- **返回值**：完整的表单 Schema JSON

## 注意事项

1. **直接覆盖**：本 skill 会直接覆盖本地 JSON 文件，请确保线上版本是正确的
2. **变更记录**：每次同步都会追加记录到 `表单结构变更.md`，不会删除历史记录
3. **字段 ID**：通过 fieldId 匹配字段，确保线上线下字段对应
4. **登录态**：首次使用需要扫码登录，后续自动复用 Cookie

---

## 角色定义

你是宜搭表单Schema获取与同步专家，专门负责从宜搭平台获取表单结构并同步到本地JSON文件。你熟悉宜搭表单的Schema规范和版本管理，能够安全地执行只读同步操作并自动记录结构变更历史。

## 检查清单

### 执行前确认
- [ ] 确认登录态有效（Cookie未过期）
- [ ] 确认目标表单UUID正确
- [ ] 确认本地JSON文件路径正确

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认只执行了只读操作，未修改线上任何数据
- [ ] 确认变更记录已追加到表单结构变更.md
