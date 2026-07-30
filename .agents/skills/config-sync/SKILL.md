---
name: config-sync
description: 宜搭应用配置同步工具，用于从宜搭平台获取应用ID、表单UUID、流程Code以及表单内组件ID，自动生成系统配置清单和组件ID清单。支持独立调用或被其他Skill调用，适用于应用创建后自动同步配置或后续维护更新场景。新增批量同步功能，支持从组织及应用信息.md读取应用列表，批量同步多个应用到本地。
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **完整生命周期管理删除/新增/更新** — 同步时处理表单的删除、新增和更新三种情况
2. **批量同步前展示影响范围** — 批量操作前必须向用户展示即将同步的应用和表单列表

---

# 宜搭配置同步 Skill

## 版本

**v3.19.0** (2026-07-15) — 历史版本更新详情见 [references/版本历史.md](references/版本历史.md)

## 📚 参考文件索引（按需加载）

| 参考文件 | 内容 | 何时加载 |
|---------|------|---------|
| [references/版本历史.md](references/版本历史.md) | v3.14.0~v3.19.0 各版本更新详情、根因修复记录 | 需要了解历史变更、排查目录结构/分组相关回归问题时 |
| [references/playwright与接口详解.md](references/playwright与接口详解.md) | Playwright方案背景/工作原理/输出示例/稳定性评估、核心API接口定义、编程调用示例、完整工作流程图 | 需要编程调用 syncConfig、被其他Skill集成、调试Playwright同步、查看输出样例时 |
| [references/输出与日志格式.md](references/输出与日志格式.md) | 系统配置清单/组件ID清单输出格式、同步结果展示完整示例、表单更新日志完整规范与示例 | 需要生成/更新系统配置清单、组件ID清单、表单更新日志.md时 |

## 功能概述

本Skill提供宜搭应用配置的自动同步能力，包括：

1. **应用信息同步**：获取应用名称、应用ID、访问地址
2. **表单列表同步**：获取所有表单的UUID、页面类型（表单/流程）、流程Code
3. **组件ID同步**：获取每个表单内所有组件的fieldId
4. **清单生成**：自动生成格式化的系统配置清单和组件ID清单
5. **本地文件夹同步**：自动删除本地多余表单、创建新增表单文件夹
6. **反向生成字段清单（v3.6.0新增）**：从宜搭平台已有应用反向生成 `字段清单.md` 和 `表单清单.md`

## 核心特点

- **自动同步**：从宜搭平台实时获取最新配置信息
- **AI智能分组**：根据表单名称自动分类到2-3个分组（02客户管理、03商机管理等）
- **智能目录管理**：没有分组/表单文件夹时自动创建，已有则不修改
- **完整生命周期管理**：支持删除、新增、更新操作，确保本地与平台一致
- **标准文件结构**：每个表单单独文件夹，包含 `表单名称「类型」.json`、`表单名称「类型」_schema.json`、`组件ID清单.md`、`表单结构变更.md`
- **双模式调用**：支持独立调用或被其他Skill集成调用
- **错误处理**：单个表单失败不影响整体同步

## ⚠️ 重要原则（严禁编造数据）

**绝对禁止编造任何ID信息！**

### 禁止行为
- ❌ 禁止编造/伪造 fieldId（组件ID）
- ❌ 禁止编造/伪造 formUuid（表单UUID）
- ❌ 禁止编造/伪造 processCode（流程Code）
- ❌ 禁止使用示例ID或占位符ID

### 正确做法
- ✅ 所有ID必须从宜搭平台**真实获取**
- ✅ 通过API调用获取表单Schema，提取真实的 fieldId
- ✅ 从宜搭后台「部署运维」页面复制真实的表单UUID
- ✅ 如果同步失败，**宁可不生成文件，也不编造数据**

### 获取真实ID的途径
1. **API同步**（推荐）：调用宜搭API获取表单Schema
2. **后台查看**：在宜搭表单设计器的「部署运维」页面查看
3. **JSON导出**：从宜搭平台导出表单JSON，解析其中的真实ID

### 后果说明
编造ID会导致：公式配置失败（引用不存在的字段）、联动规则失效、数据查询错误、后续开发工作全部返工。

## 目录结构规范

同步后的标准目录结构：
```
项目名称/
├── 01需求梳理/          # 需求文档（已有则不修改）
├── 02客户管理/          # AI智能分组（从02开始）
│   └── 客户信息「普通表单」/
│       ├── 客户信息「普通表单」.json
│       ├── 客户信息「普通表单」_schema.json
│       ├── 组件ID清单.md
│       └── 表单结构变更.md
├── 主项目信息「普通表单」/    # 无分组的表单直接在根目录下
│   ├── 主项目信息「普通表单」.json
│   ├── 组件ID清单.md
│   └── 表单结构变更.md
└── 系统配置清单.md
```

**分组规则**：
- 从02开始编号（避免与01需求梳理重复）
- 根据表单名称关键词智能分类
- 有明确业务分组的表单放入对应分组目录
- 无明确分组的表单直接在项目根目录下创建
- **不再使用「未分组表单」目录**

## 使用场景（最短执行路径）

### 场景0：批量同步组织内多个应用（v3.8.0新增）
**适用情况**：组织初始化后，需要批量同步组织内的多个已有应用到本地管理。执行逻辑：读取 `组织及应用信息.md` 中的应用列表（指定应用名时支持模糊匹配），逐个同步到本地并生成批量同步汇总报告。

```powershell
# 方式A - 同步所有应用（触发语句："将组织内所有应用同步到本地"）
node .agents/skills/config-sync/scripts/sync_batch_apps.js

# 方式B - 同步指定应用（触发语句："将组织内应用【进销存管理, 客户管理】同步到本地"）
node .agents/skills/config-sync/scripts/sync_batch_apps.js "进销存管理,客户管理"
```

### 场景1：form_creator 创建应用后自动同步（推荐）
**适用情况**：刚用 form_creator 创建了新应用（已自动写入系统配置清单），需要同步组件ID。触发语句："同步【进销存管理】的配置信息。"
执行逻辑：从系统配置清单读取应用ID和表单UUID → 验证应用ID有效性 → 同步所有表单的组件ID和结构 → 生成各表单的组件ID清单.md。

```powershell
node .agents/skills/config-sync/scripts/sync_form_schemas.js "./进销存管理"
```

### 场景2：已有项目同步（手动填入应用ID）
**适用情况**：已有宜搭应用，但系统配置清单中没有应用ID。触发语句："同步【进销存管理】的配置信息。应用ID：APP_XXX"
执行逻辑：使用指定应用ID获取表单列表 → 更新系统配置清单.md → 同步所有表单的组件ID和结构。

```powershell
node .agents/skills/config-sync/scripts/sync_all_configs.js "./进销存管理" "APP_XXX"
```

### 场景3：同步表单列表（删除/新增/更新）
**适用情况**：在宜搭平台增删表单后，需要同步本地文件夹结构。触发语句："同步【进销存管理】的表单列表。"
执行逻辑：Playwright访问宜搭后台获取表单列表 → 对比本地与平台差异 → 自动删除本地多余表单文件夹 → 自动创建新增表单文件夹 → 更新系统配置清单.md。

```powershell
# 标准模式（后台运行）
node .agents/skills/config-sync/scripts/sync_form_list_playwright.js "./进销存管理"

# 可视化模式（显示浏览器）
node .agents/skills/config-sync/scripts/sync_form_list_playwright.js "./进销存管理" --visual

# 指定应用ID / 指定应用ID + 可视化
node .agents/skills/config-sync/scripts/sync_form_list_playwright.js "./进销存管理" "APP_XXX"
node .agents/skills/config-sync/scripts/sync_form_list_playwright.js "./进销存管理" "APP_XXX" --visual
```

### 场景4：后续维护更新
表单增删改、组件变更时运行同步。触发语句："更新【进销存管理】的配置信息。"执行逻辑同场景1（重新同步所有表单的组件ID和结构）。

### 场景5：反向生成字段清单（v3.6.0新增）
**适用情况**：已有宜搭应用但没有 `字段清单.md` 和 `表单清单.md`。触发语句："为【进销存管理】生成字段清单和表单清单。"
执行逻辑：从系统配置清单读取应用ID → 获取所有表单列表和Schema → 解析字段结构 → 生成标准格式的 `字段清单.md`（含主表和子表字段）和 `表单清单.md`。

```powershell
node .agents/skills/config-sync/scripts/generate_field_list.js "./进销存管理"
```

**字段类型映射**：TextField→单行文本、TextareaField→多行文本、NumberField→数值、DateField→日期/日期时间、RadioField→单选、MultiSelectField→复选/下拉复选、SelectField→下拉单选、AssociationFormField→关联表单、EmployeeField→成员、DepartmentSelectField→部门、AttachmentField→附件、ImageField→图片、SerialNumberField→流水号、TableField→子表

> 新建应用/已有应用/表单列表同步的完整工作流程图见 [references/playwright与接口详解.md](references/playwright与接口详解.md)。

## 文件结构

```
config-sync/
├── SKILL.md                          # 本文档
├── references/                       # 按需加载的详细文档
├── scripts/
│   ├── sync_config.js                # 主同步脚本
│   ├── sync_form_list_playwright.js  # Playwright同步表单列表（v3.4.0支持删除/新增/更新）
│   ├── sync_form_schemas.js          # 同步表单结构
│   ├── generate_field_list.js        # 反向生成字段清单（v3.6.0新增）
│   ├── fetch_app_info.js             # 获取应用信息
│   ├── fetch_form_list.js            # 获取表单列表
│   ├── fetch_components.js           # 获取组件ID
│   └── generate_md.js                # 生成MD文件
└── evals/
    └── evals.json                    # 测试用例
```

## 应用ID验证逻辑（v1.0.2新增）

```
1. 从本地系统配置清单读取应用ID
2. 使用本地应用ID调用宜搭平台API获取表单列表
3. 如果平台返回空列表 → 报错终止（应用不存在或已被删除）
4. 如果平台返回表单列表 → 验证通过，继续同步
5. 获取每个表单的组件ID并更新到本地清单
```

| 场景 | 处理方式 |
|------|---------|
| 应用ID错误 | 报错：应用ID验证失败 |
| 应用已被删除 | 报错：应用可能不存在或已被删除 |
| 无访问权限 | 报错：无法获取表单列表 |
| 验证通过 | 继续同步表单UUID和组件ID |

## 命令行完整参数

### 同步系统配置清单（sync_config.js）
```powershell
# 模式1：从系统配置清单读取应用ID
node .agents/skills/config-sync/scripts/sync_config.js --output ./进销存管理

# 模式2：指定应用ID
node .agents/skills/config-sync/scripts/sync_config.js --appId APP_XXX --output ./进销存管理
```
其他参数：`--appName`（应用名称，v3.14.0新增）、`--smart-group`（强制AI智能分组）。

### 同步表单结构及组件ID（sync_form_schemas.js，v3.1.0新用法）
```powershell
# 同步所有表单（从系统配置清单读取应用ID和表单UUID）
node .agents/skills/config-sync/scripts/sync_form_schemas.js "./进销存管理"

# 指定应用ID（覆盖系统配置清单中的值）
node .agents/skills/config-sync/scripts/sync_form_schemas.js "./进销存管理" "APP_XXX"

# 只同步指定表单 / 多个表单（逗号分隔）/ 指定应用ID并同步指定表单
node .agents/skills/config-sync/scripts/sync_form_schemas.js "./进销存管理" --forms "产品信息"
node .agents/skills/config-sync/scripts/sync_form_schemas.js "./进销存管理" --forms "产品信息,仓库信息"
node .agents/skills/config-sync/scripts/sync_form_schemas.js "./进销存管理" "APP_XXX" --forms "产品信息,仓库信息"
```
说明：`--forms` 支持逗号分隔多个表单名，支持模糊匹配（输入"产品"可匹配"产品信息"）；指定表单不存在时会显示可用表单列表。

### 统一同步所有配置（sync_all_configs.js，v3.0.0新用法）
```powershell
# 同步系统配置清单 + 所有表单结构
node .agents/skills/config-sync/scripts/sync_all_configs.js "./进销存管理"

# 指定应用ID
node .agents/skills/config-sync/scripts/sync_all_configs.js "./进销存管理" "APP_XXX"
```

### 编程调用（速查）

```javascript
const { syncConfig } = require('./scripts/sync_config');
// 参数：appId(可选)、outputDir(可选，默认./)、formDirs(可选，表单目录映射)、smartGroup(可选)
const result = await syncConfig({ appId: 'APP_XXX', outputDir: './进销存管理' });
```

完整的编程调用方式（4种模式）、被其他Skill调用示例、核心API接口（syncConfig/fetchAppInfo/fetchFormList/fetchComponents）返回结构见 [references/playwright与接口详解.md](references/playwright与接口详解.md)。

## 同步行为规则

| 场景 | 行为 |
|------|------|
| 已有分组目录 | 使用现有结构，不创建新分组 |
| 没有分组目录 | AI智能分组，自动创建2-3个分组（从02开始） |
| 已有表单文件夹 | 更新文件内容，不修改文件夹 |
| 没有表单文件夹 | 自动创建表单文件夹和文件 |
| 平台删除表单 | 自动删除本地对应的表单文件夹 |
| 平台新增表单 | 自动创建对应的表单文件夹 |
| 使用 `--smart-group` | 强制使用AI智能分组，无视现有分组 |

## Playwright同步表单列表（推荐首选）

宜搭平台的 `getFormList.json` API 经常返回404，本方案用 Playwright 从宜搭后台「部署运维」页面提取表单列表（工作路径：宜搭工作台 → 我的应用 → 应用设置 → 部署运维），更稳定且包含流程Code。命令见上方场景3。

### 两种模式对比

| 特性 | 标准模式 | 可视化模式（--visual） |
|-----|---------|-----------|
| 浏览器显示 | ❌ 后台运行 | ✅ 前台显示 |
| 元素高亮 | ❌ 无 | ✅ 点击前高亮元素 |
| 操作延迟 | ❌ 无 | ✅ 500ms延迟 |
| 彩色输出 | ❌ 无 | ✅ 彩色步骤信息 |
| 自动更新配置 | ✅ 是 | ✅ 是 |
| 适用场景 | 日常同步、自动化 | 首次配置、调试、演示 |

> 背景原理、功能特性、终端输出示例、可视化模式输出示例、API方式与Playwright方式的稳定性评估详见 [references/playwright与接口详解.md](references/playwright与接口详解.md)。

### 安装依赖

```powershell
npm install -g playwright
npx playwright install chromium
```

## 依赖与登录态

- `api-client`: 宜搭API客户端，用于调用宜搭接口；本Skill依赖其登录态管理（自动读取 `.cookies.json`，登录态过期时自动触发重新登录，支持扫码登录获取新Token）
- `playwright`: 浏览器自动化工具（用于同步表单列表）
- Node.js >= 16

## 注意事项

1. **首次使用需要登录**：确保已运行过 api-client 的登录流程，或脚本会提示扫码登录
2. **网络连接**：需要能够访问宜搭平台；需要有对应应用的访问权限
3. **增量更新**：会保留系统配置清单中的其他信息（如创建失败记录、备注等）
4. **页面结构变更**：如果宜搭后台页面改版，可能需要更新选择器
5. **本地文件夹删除**：删除操作不可逆，请确保重要数据已备份

## 同步结果展示规范

每次同步完成后，必须在对话框中向用户展示完整的同步结果，包括：

1. **同步结果汇总标题** — 使用 ✅ 图标标识
2. **表单列表同步统计** — 线上表单总数、普通/流程表单数量、新增/删除/保持一致的表单数量
3. **表单结构及组件ID同步详情** — 成功同步的表单数量、每个表单的组件数量统计（表格展示）
4. **更新文件清单** — 列出所有被更新的文件
5. **相关文件链接** — 提供系统配置清单和各表单组件ID清单的文件链接

**重要提醒**：
- 严禁只展示脚本的原始输出结果
- 必须以结构化的方式汇总展示同步结果
- 必须提供更新后的文件链接，方便用户点击查看

完整展示格式示例见 [references/输出与日志格式.md](references/输出与日志格式.md)。

## 表单更新日志规范

每次执行同步操作后，必须自动生成或更新 **表单更新日志.md**（位于项目根目录，与系统配置清单.md并列），记录表单变更历史。文件必须包含：①更新概览（总更新次数/当前表单总数/累计增删改统计）②详细更新记录（倒序，含版本号、日期、同步类型、变更统计、详细清单）③表单变更趋势 ④相关文件链接。

### 状态类型说明

| 状态标识 | 含义 | 使用场景 |
|----------|------|----------|
| ➕ 新增 | 本次同步新增的表单 | 平台新增但本地没有的表单 |
| 🗑️ 删除 | 本次同步删除的表单 | 平台已删除但本地仍存在的表单 |
| 📝 更名 | 本次同步更名的表单 | 表单名称发生变更 |
| 🔄 已更新 | 本次同步更新的表单 | 表单结构或组件发生变更 |
| ➖ 无变化 | 本次同步无变化的表单 | 本地与平台保持一致的表单 |

**对话框展示要求**：同步完成后必须告知用户表单更新日志已生成/更新、展示本次变更摘要（新增/删除/更名数量）、提供表单更新日志文件链接。

完整的文件内容结构、示例格式见 [references/输出与日志格式.md](references/输出与日志格式.md)。

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 登录态失效 | 自动触发重新登录 |
| 单个表单获取失败 | 记录错误，继续处理其他表单 |
| 组件获取失败 | 跳过该表单，不影响其他表单 |
| 目录不存在 | 自动创建或提示用户 |
| 删除文件夹失败 | 记录错误，继续处理其他操作 |

## 角色定义

你是宜搭应用配置同步专家，专门负责从宜搭平台获取应用ID、表单UUID和组件ID等配置信息。你熟悉宜搭平台的API接口和Playwright浏览器自动化方式，能够安全高效地同步配置信息到本地，并自动生成系统配置清单和组件ID清单。

## 检查清单

### 执行前确认
- [ ] 确认登录态有效（Cookie未过期）
- [ ] 确认应用ID和表单UUID从系统配置清单.md读取真实值，严禁占位符
- [ ] 确认已明确同步范围（全量同步 vs 指定表单同步）

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认严禁编造ID，所有ID必须从宜搭平台真实获取
- [ ] 确认同步结果以结构化方式展示，非原始脚本输出
- [ ] 确认本地多余表单文件夹已自动清理
