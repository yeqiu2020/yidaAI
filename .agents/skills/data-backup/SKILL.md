---
name: data-backup
description: 宜搭应用数据备份工具。备份指定应用中所有表单的实例数据，支持 JSON 和 Excel 两种输出格式。当用户说"备份数据"、"导出数据"、"数据备份"时触发。
---

# data-backup · 宜搭应用数据备份

## 功能

备份指定宜搭应用中所有表单的实例数据，支持 JSON 和 Excel 两种输出格式。

## 使用方式

```bash
node scripts/backup-app-data.js <应用ID> <应用名称> [format] [输出目录]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| 应用ID | 是 | 宜搭应用编码，如 `APP_XXXXXXXX` |
| 应用名称 | 是 | 应用名称（用于生成输出目录） |
| format | 否 | 输出格式：`json`（默认）或 `excel` |
| 输出目录 | 否 | 自定义输出目录路径 |

### 示例

```bash
# JSON 格式备份
node scripts/backup-app-data.js APP_XXXXXXXX "AI宜搭场景"

# Excel 格式备份
node scripts/backup-app-data.js APP_XXXXXXXX "AI宜搭场景" excel
```

## 依赖

- 需要项目根目录有有效的 `.cookies.json` 认证文件
- Excel 格式需要 `xlsx` 库（项目 `package.json` 已包含）

## 输出

- 默认输出到项目根目录下的 `应用名称-备份-时间戳/` 文件夹
- JSON 格式：每个表单一个 `.json` 文件
- Excel 格式：每个表单一个 `.xlsx` 文件，表头自动显示字段名称

## 版本

- v1.5.2（当前版本）
- Phase 0 安全修复：补齐 SKILL.md 入口文件
