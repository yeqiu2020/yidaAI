---
name: er-diagram
description: 宜搭应用表单实体关系图（ER 图）生成器。从表单 Schema 中提取表单实体及其关联关系（子表/关联表单/数据联动），生成 mermaid 关系图和 JSON 结构化数据。当用户需要可视化表单间关系、梳理数据架构、发现孤立表单或循环依赖时触发。
---

# 宜搭表单实体关系图生成器（ER Diagram）

> 候选轨 Skill（Phase 5-0 新增），命名无 `yida-` 前缀（见禁止事项#11）。
> 风险等级：R1（只读，仅读取 Schema 生成图，不写应用）
> 依赖：`lib/core/http.js`（公共库，用于在线获取 Schema）

## 严格禁止 (NEVER DO)

- 不要通过 API 修改任何表单的 Schema 或字段配置
- 不要编造表单间关系——所有关系必须从 Schema 字段配置中提取
- 不要删除或覆盖已有的 ER 图输出文件（除非用户明确要求）

## 严格要求 (MUST DO)

- 所有关系方向必须正确：子表 = 父表 1:N 子表；关联表单 = 当前表 N:1 被关联表
- 输出同时包含 mermaid 格式（可粘进 markdown 渲染）和 JSON 格式（可二次处理）
- 离线模式下必须能从本地 Schema JSON 文件生成 ER 图

## 适用场景

- 接手客户老应用，表单众多互相勾连，需要一张图看清全貌
- 数据架构梳理 / 系统体检报告
- 发现孤立表单（没被任何表单引用，可能是废表）
- 发现循环依赖（A→B→A，建模隐患）

## 触发条件

**正向触发**：
- "ER 图"、"实体关系图"、"表单关系图"
- "数据架构图"、"表单依赖图"
- "孤立表单检测"、"循环依赖检测"
- "梳理表单关系"

## 与 system-map 的区别

- `system-map` = AI 助手**项目内部**有哪些 skill / 模块的架构图
- `er-diagram` = **客户宜搭应用内部**有哪些表单、怎么互相关联的**业务数据图**
- 两者完全不同，不重叠

## 命令

### 从本地 Schema 文件生成

```bash
# 单个 Schema 文件
node .agents/candidates/er-diagram/scripts/generate-er.js --file <schema.json>

# 多个 Schema 文件（逗号分隔）
node .agents/candidates/er-diagram/scripts/generate-er.js --files <a.json>,<b.json>,<c.json>

# 目录下所有 Schema JSON 文件
node .agents/candidates/er-diagram/scripts/generate-er.js --dir <schema-dir>

# 指定输出目录（默认 .cache/er-diagram/）
node .agents/candidates/er-diagram/scripts/generate-er.js --dir <schema-dir> --output <output-dir>
```

### 从线上应用获取 Schema 并生成

```bash
# 需要登录态（.cookies.json）
node .agents/candidates/er-diagram/scripts/generate-er.js --appType <appType> --forms <formUuid1>,<formUuid2>,...
```

### 输出说明

| 输出文件 | 格式 | 用途 |
|---------|------|------|
| `er-diagram.mmd` | Mermaid | 可粘进 markdown/README 直接渲染 |
| `er-diagram.json` | JSON | 结构化数据，可二次处理 |
| `er-report.md` | Markdown | 分析报告（含孤立表单、循环依赖检测） |

## 关系类型

| 关系类型 | Schema 字段类型 | ER 方向 | 说明 |
|---------|----------------|---------|------|
| 子表（明细） | `tableField` | 父表 1:N 子表 | 子表挂载在父表下，是父表的明细行 |
| 关联表单 | `associationFormField` | 当前表 N:1 被关联表 | 当前表单通过关联字段引用另一个表单 |

## 文件结构

```
.agents/candidates/er-diagram/
├── SKILL.md                          ← 本文件
├── scripts/
│   └── generate-er.js                ← ER 图生成核心脚本
└── references/
    └── er-format-guide.md            ← ER 图格式与字段类型参考
```

## 异常处理

| 异常场景 | 处理方式 |
|---------|----------|
| Schema 文件不存在 | 报错退出，提示正确路径 |
| Schema 格式无效 | 跳过该文件，在报告中标注 |
| 在线获取 Schema 失败 | 提示检查登录态或网络 |
| 循环依赖检测到 | 在报告中警告，不阻断生成 |
| 孤立表单检测到 | 在报告中列出，供人工确认 |

## 参考文档

- [ER 图格式与字段类型参考](references/er-format-guide.md)
