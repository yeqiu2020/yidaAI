---
name: requirement-analysis
description: 需求梳理与表单清单生成（三合一：原 architect / flow-to-form / excel-to-form）。当用户说"梳理需求"、"设计系统架构"、"分析业务流程"、"做需求分析"、"规划系统功能"、"根据流程图/思维导图生成表单清单"、"Excel转字段清单"、"从Excel生成表单"、"Excel导入"时触发此skill。将业务需求、流程图截图或Excel表单基础信息转化为标准的业务逻辑图、字段清单.md、规则清单.md和表单清单.md条目，可直接导入宜搭或交给 form_creator 建表。禁止使用占位数据。关键词：需求梳理、架构设计、流程图、Excel转字段、字段清单、规则清单
---

# requirement-analysis —— 需求梳理与表单清单生成

> 2026-10-30 由 architect / flow-to-form / excel-to-form 三 skill 合并（《Skill体系优化方案_20261029.md》阶段四）。
> 本文件只承载路由与硬规则；三家完整方法论原样保留在 `references/`（内部链接未断）。

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源），执行前必须阅读并严格遵守。

### 专属硬规则（三家合并，按场景适用）

**通用（所有场景）：**
1. **禁止使用占位数据** — 所有输出基于用户真实输入；缺失信息通过访谈补齐，不编造。
2. **输出四件套对齐宜搭导入格式** — 业务逻辑图 / 关键功能清单 / 字段定义表（字段清单.md）/ 自动化逻辑规则（规则清单.md），格式模板见各 references。
3. **分阶段问答式访谈** — 逐步引导用户明确需求，不一次性输出全部（需求访谈场景）。

**流程图/思维导图 → 清单（flow-to-form 场景）：**
4. **严格按流程图内容生成，不能多也不能少** — 流程图有几个表单就生成几个，表单名称必须与图中完全一致，禁止按主题泛化补充或改名。
5. **基础档案 vs 业务数据严格区分** — 基础档案不包含库存/金额/余额等业务数据字段。
6. **🚨 蛇形/S 形排列识别** — 流程图通常蛇形排列（第一行从左到右、第二行从右到左），必须按视觉布局的蛇形路径读取，禁止简单"从左到右、从上到下"；无中文序号时按最粗主线（中心节点起顺时针/从左到右）定序。
7. **严格按流程图现成模块分组，禁止自定义分组** — 表单不得跨模块移动或重新归类。

**Excel → 清单（excel-to-form 场景）：**
8. **严禁修改源 Excel 文件** — 只能读取，绝不能写入。
9. **字段类型白名单机制** — 所有输出字段类型必须通过 VALID_FIELD_TYPES 校验；每个表单只能有一个流水号字段。
10. **关联填充的字段来源只能来自目标表单的主表字段**，严禁混入目标表单的子表字段（关联字段在当前表单主表上，关联的是目标表单整条记录）。
11. **批量修改 override 文件禁止逐个 SearchReplace** — 5 处以上修改必须：读完整 JSON → 内存中改完 → Write 一次性写回；SearchReplace 仅限 1-3 处精准修改。
12. **每次 Excel 流程必须生成原型页面**（含 manifest.html 清单页）——`excel_to_form.js` 已内置 `ensurePrototypePage` 自动补齐（自动调用 form-to-prototype 的 `prototype_generator.js`）；判断完成标准：`<输出目录>/原型页面/templates/manifest.html` 存在。

**不适用场景（禁止触发本 skill）：** 简单表单（无需复杂逻辑）、纯展示型页面。

## 三场景入口

| 场景 | 触发词示例 | 方法论与完整规则 | 脚本入口 |
|---|---|---|---|
| 需求访谈 / 系统架构 | 梳理需求、设计架构、分析业务流程 | [references/architect/SKILL.md](references/architect/SKILL.md)（四层输出模板见其 references） | `scripts/requirement_interview.js`、`scripts/generate_logic_diagram.js`、`scripts/generate_feature_list.js`、`scripts/generate_automation_rules.js`（公共工具 `scripts/utils.js`） |
| 流程图/思维导图 → 清单 | 根据流程图生成表单清单 | [references/flow-to-form/SKILL.md](references/flow-to-form/SKILL.md)（识别规则/模板/错误案例见其 references） | 无脚本（视觉识别 + 模板输出） |
| Excel → 清单 | Excel转字段清单、Excel导入 | [references/excel-to-form/SKILL.md](references/excel-to-form/SKILL.md)（格式规范/字段类型指南见其 references） | `node scripts/excel_to_form.js`（完成后自动补原型页面） |

生成完成后：建表单交给 **form_creator** skill；只改字段清单文档用 **form_designer** skill。

## 版本

v1.0.0（2026-10-30，三合一合并）。本 skill 无独有云端写操作，无台账要求。
