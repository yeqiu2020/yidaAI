# 宜搭AI助手 (Yida AI Assistant)

> 基于AI的宜搭低代码平台开发助手，提供从需求分析到表单生成、公式代码、测试验证的完整解决方案。
>
> - **版本：V2.0.2**
> - **作者：叶秋**
> - 钉钉/微信：15270909736

## 项目简介

宜搭AI助手是一个专为阿里巴巴宜搭低代码平台设计的AI辅助开发工具集，支持 Trae / Cursor / Claude Code / CodeBuddy 等多 IDE 环境。通过 42 个 Skill 目录（40 个有效 Skill），覆盖从需求分析到部署验证的全生命周期。

核心能力：

- 需求分析 — 流程图/思维导图/Excel 转标准字段清单
- 表单自动生成 — 字段清单一键生成宜搭表单并静默部署
- 公式生成 — 精确计算 marks 位置，区分表单公式与报表公式
- 代码生成 — 表单动作、字段校验、自动化脚本、自定义页面
- 应用静默部署 — 自动创建宜搭应用并部署表单
- 数据测试验证 — 自动化测试表单提交、公式计算、流程审批
- 配置同步管理 — 自动同步表单ID、组件ID、流程Code、业务规则
- 报表制作 — 16种图表组件，支持筛选器联动
- 集成自动化 — 创建逻辑流，支持6种节点类型

## 项目结构

```
宜搭AI助手V2.0.2/
├── .agents/
│   └── skills/                       # 42个Skill目录（40个有效）
│       ├── architect/           # 需求架构师
│       ├── flow-to-form/            # 流程图转表单
│       ├── excel-to-form/           # Excel转字段清单
│       ├── project-creator/         # 项目创建器
│       ├── form_designer/           # 表单设计器
│       ├── form_creator/            # 表单生成器
│       ├── form-settings/           # 表单设置
│       ├── form-to-prototype/       # 原型页面生成
│       ├── formula-generator/       # 公式生成器
│       ├── code-expert/             # 代码专家
│       ├── prompt-assistant/        # 提示词助手
│       ├── flow-settings/           # 流程配置
│       ├── integration/             # 集成自动化
│       ├── connector/               # HTTP连接器
│       ├── config-sync/        # 配置同步
│       ├── get-schema/         # Schema同步
│       ├── rule-sync/          # 规则同步（只读）
│       ├── project-sync/       # 项目一站式同步
│       ├── system-map/         # 系统功能图谱
│       ├── data-tester/        # 数据测试
│       ├── js-action-tester/        # JS动作测试
│       ├── api-client/         # API客户端
│       ├── auth-plus/               # 多策略登录认证
│       ├── simulated-login/         # 模拟登录
│       ├── server-manager/     # 服务管理
│       ├── server-security/    # 服务安全加固
│       ├── publish-guard/           # 发布守卫
│       ├── er-diagram/              # ER关系图
│       ├── data-clean/              # 数据清空
│       ├── data-backup/             # 数据备份
│       ├── data-prep/               # 数据准备
│       ├── dataset/                 # 数据集管理
│       ├── system-troubleshooter/   # 问题诊断
│       ├── feedback-collector/      # 反馈收集
│       ├── skill-creator/           # Skill创建器
│       ├── custom-page/             # 自定义页面开发
│       ├── report/                  # 报表制作
│       ├── playwright-cli/          # Playwright CLI工具
│       ├── org-init/                # 组织初始化
│       ├── hello-world-custom/      # 自定义示例（demo）
│       ├── skill-self-improve/      # Skill自我改进（占位）
│       └── knowledge-base/     # 知识库（占位）
├── lib/core/                        # 公共核心库（utils/error/http/spawn/chalk）
├── lib/sync-server/                 # 同步服务（http-server + config sync API）
├── tests/                           # 单元测试（core + features）
├── .gitignore
├── jest.config.js                   # Jest测试配置
└── package.json
```

## 核心功能

### 需求分析层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| architect | 业务需求→架构设计+字段定义 | 需求梳理、架构设计 |
| flow-to-form | 流程图/思维导图→字段清单 | 上传流程图截图 |
| excel-to-form | Excel→字段清单+规则清单 | "将Excel转字段清单" |

### 表单设计层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| form_designer | 设计表单字段结构 | "在xxx目录下设计一个表单" |
| form_creator | 生成表单JSON+静默部署 | "生成表单"、"创建应用" |
| form-settings | 配置表单设置/权限 | "设置数据标题"、"表单权限" |
| form-to-prototype | 生成HTML原型页面 | 验证字段设计 |

### 公式与代码层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| formula-generator | 生成公式（精确marks） | "生成公式"、"写公式" |
| code-expert | 生成表单动作/校验/自动化代码 | "写代码"、"表单动作代码" |
| prompt-assistant | 生成规范提示词文件 | "设计提示词"、"写提示词" |

### 配置同步层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| config-sync | 同步应用ID/表单UUID/组件ID | "同步配置" |
| get-schema | 同步表单Schema | 获取表单结构 |
| rule-sync | 同步业务规则（只读） | "同步规则" |
| project-sync | 一站式同步 | 一键同步已有项目 |
| system-map | 生成系统功能图谱 | "生成系统图谱" |

### 测试层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| data-tester | 测试数据提交/公式/流程 | "测试表单"、"模拟数据" |
| js-action-tester | 测试JS动作代码 | 测试宜搭JS代码 |

### 报表与自动化层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| report | 创建16种图表报表 | "创建报表"、"数据看板" |
| integration | 创建集成自动化逻辑流 | "集成自动化"、"逻辑流" |
| flow-settings | 配置流程自动审批 | "流程配置"、"设置自动审批" |
| connector | HTTP连接器创建与管理 | "创建连接器"、"接入接口" |

### 平台工具与数据层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| org-init | 组织信息初始化 | "从宜搭初始化" |
| auth-plus | 多策略登录认证 | 自动触发（登录场景） |
| simulated-login | 扫码模拟登录 | "登录"、"扫码" |
| custom-page | 自定义页面 JSX 开发 | "自定义页面"、"写页面代码" |
| playwright-cli | Playwright 浏览器自动化工具 | "浏览器操作"、"截图" |
| data-backup | 应用数据备份 | "备份数据" |
| data-prep | 数据准备配置 | "数据准备" |
| dataset | 数据集管理 | "数据集" |
| data-clean | 表单数据清空 | "清空数据" |
| api-client | 宜搭 API 客户端封装 | "调用API" |
| server-manager | 本地同步服务管理 | "启动服务"、"停止服务" |
| server-security | 本地服务安全加固 | 自动触发 |
| publish-guard | 自定义页面发布守卫 | "发布页面" |
| er-diagram | 表单ER关系图生成 | "生成ER图" |
| system-troubleshooter | 系统问题诊断 | "诊断问题"、"排查错误" |
| feedback-collector | 用户反馈收集 | "提交反馈" |
| skill-creator | Skill 创建工具 | "创建Skill" |

## 易混技能消歧表

> 部分 Skill 触发词相近，下表帮助判断该用哪个（`应触发` vs `避免误触发`）。本表由 `scripts/generate-skill-index.js --update` 自动维护，数据源为 `.agents/skills/skill-config.json` 的 `disambiguationGroups`。

<!-- DISAMBIGUATION_START -->

<!-- Auto-generated by scripts/generate-skill-index.js | 生成日期: 2026-07-31 -->

> 易混技能消歧表：触发词相近时按下表判断该用哪个（use=应触发，避免=易误触发但不该用）。

### 公式 / 代码 / 提示词 / 规则

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 写字段公式、报表公式、计算公式 | `formula-generator` | code-expert / prompt-assistant |
| 写 JS 动作、字段校验、自动化脚本、自定义页面代码 | `code-expert` | formula-generator / prompt-assistant |
| 只要生成规范提示词文件、不要直接出成品 | `prompt-assistant` | code-expert / formula-generator |
| 跨表增删改（INSERT/UPDATE/DELETE/UPSERT）、单据提交后改其他表 | `business-rule` | integration / formula-generator |
| 逻辑流、消息通知、定时触发、连接器调用等自动化 | `integration` | business-rule |

### 建项目 / 设计表单 / 生成表单

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 创建项目、新建 XX 系统（只建目录结构、不建表单） | `project-creator` | form_creator |
| 在某目录下设计表单字段（只改本地文档、不调用宜搭） | `form_designer` | form_creator |
| 生成表单、创建应用（真正生成宜搭表单并部署） | `form_creator` | form_designer / project-creator |

### 测试 / 清空数据

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 测试表单、生成测试数据、批量插入数据、验证公式/校验规则 | `data-tester` | js-action-tester / data-clean |
| 测试表单内 JS 动作代码、字段联动代码 | `js-action-tester` | data-tester |
| 清空数据、删除数据、批量删除（保留表结构） | `data-clean` | data-tester |

### 同步类（拉取宜搭→本地）

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 同步配置：应用ID、表单UUID、组件ID | `config-sync` | rule-sync / get-schema |
| 同步表单 Schema 结构、导出表单 JSON | `get-schema` | config-sync |
| 同步业务规则（公式/联动/校验/动作代码，只读） | `rule-sync` | config-sync |
| 一站式/一键/完整同步整个项目 | `project-sync` | config-sync / rule-sync / get-schema |

### 报表 / 数据集 / 数据准备

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 创建报表、图表、数据看板（可视化展示） | `report` | dataset / data-prep |
| 创建视图表、多表联合查询、把多表合成一表 | `dataset` | data-prep / report |
| 可视化 ETL、数据加工/清洗/聚合、数据流 | `data-prep` | dataset |

### 原型 / 自定义页面

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 生成 HTML 原型、预览界面（不写真实页面代码） | `form-to-prototype` | custom-page |
| 写真实自定义页面 JSX 代码并发布到宜搭 | `custom-page` | form-to-prototype |

### 需求输入→字段清单

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 上传流程图/思维导图截图转字段清单 | `flow-to-form` | excel-to-form / architect |
| 把 Excel 表格转字段清单 + 规则清单 | `excel-to-form` | flow-to-form |
| 模糊业务需求要梳理成架构/字段/自动化规则 | `architect` | flow-to-form / excel-to-form |

### 登录 / 认证

| 用户意图 | 应触发 | 避免误触发 |
| -------- | ------ | ---------- |
| 登录宜搭、获取/刷新登录态、Cookie失效重新认证（默认多策略：CDP/环境变量/二维码/Playwright降级） | `auth-plus` | simulated-login / api-client |
| 明确要求可视化浏览器登录流程（看到浏览器操作、点击'立即登录'、手动选择组织） | `simulated-login` | auth-plus / api-client |
| 仅程序化调用宜搭API（静默登录仅作为API调用的前置能力，不以登录为目的） | `api-client` | auth-plus / simulated-login |

<!-- DISAMBIGUATION_END -->

## 快速开始

### 环境要求

- Node.js >= 16.0
- 宜搭平台账号

### 安装步骤

```bash
# 1. 安装依赖
npm install

# 2. 安装 Playwright 浏览器
npx playwright install chromium

# 3. 初始化组织信息
# 在 IDE 中说："从宜搭初始化"
```

### 典型工作流

**新建应用**：
```
"创建一个进销存管理系统" → project-creator
"设计产品信息表单" → form_designer
"生成表单" → form_creator
"同步配置" → config-sync
"写公式" → formula-generator
"测试表单" → data-tester
```

**已有应用同步**：
```
"从宜搭初始化" → org-init
"一站式同步" → project-sync
"生成系统图谱" → system-map
```

## 安全原则

- **对已有应用**：只做"拉"（宜搭→本地读取），不做"推"（本地→宜搭写入）
- **公式和代码**：本地生成后由用户手动复制粘贴到宜搭平台
- **Cookie统一管理**：所有 Skill 共享根目录 `.cookies.json`

## 开发计划

- [x] 流程图转表单
- [x] 表单自动生成
- [x] 应用静默部署
- [x] 数据测试验证
- [x] 配置同步管理
- [x] 公式自动生成
- [x] 代码自动生成
- [x] 业务规则同步（只读）
- [x] 报表自动生成
- [x] 集成自动化创建
- [x] 流程配置
- [x] 提示词自动生成
- [x] 原型页面生成
- [x] 系统功能图谱
- [x] 多策略登录认证（auth-plus）
- [x] HTTP连接器管理（connector）
- [x] ER关系图生成（er-diagram）
- [x] 自定义页面发布守卫（publish-guard）
- [x] 本地服务安全加固（server-security）
- [ ] 集成自动化条件分支支持
- [ ] 错误恢复与断点续传

## 联系方式

- GitHub: [@yeqiu2020](https://github.com/yeqiu2020)
- 项目地址: <https://github.com/yeqiu2020/yidaclaw>

---

> 注意：本项目仅供学习和参考使用，使用宜搭平台请遵守阿里巴巴相关服务条款。
>
> V2.0.2 | 2026-07-12
