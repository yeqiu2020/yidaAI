# 宜搭AI助手 (Yida AI Assistant)

> 基于AI的宜搭低代码平台开发助手，提供从需求分析到表单生成、公式代码、测试验证的完整解决方案。
>
> - **作者：叶秋**
> - 钉钉/微信：15270209736

## 🎯 项目简介

宜搭AI助手是一个专为阿里巴巴宜搭低代码平台设计的AI辅助开发工具集，运行于 Trae IDE 环境。通过 29 个 Skill 技能包，覆盖从需求分析到部署验证的全生命周期。

核心能力：

- 📊 **需求分析** — 流程图/思维导图/Excel 转标准字段清单
- 📝 **表单自动生成** — 字段清单一键生成宜搭表单并静默部署
- 📐 **公式生成** — 精确计算 marks 位置，区分表单公式与报表公式
- 💻 **代码生成** — 表单动作、字段校验、自动化脚本、自定义页面
- 🚀 **应用静默部署** — 自动创建宜搭应用并部署表单
- 🧪 **数据测试验证** — 自动化测试表单提交、公式计算、流程审批
- 📋 **配置同步管理** — 自动同步表单ID、组件ID、流程Code、业务规则
- 📊 **报表制作** — 16种图表组件，支持筛选器联动
- 🔄 **集成自动化** — 创建逻辑流，支持6种节点类型

## 🏗️ 项目结构

```
宜搭AI助手V1.6.8/
├── .agents/
│   ├── rules/                        # 全局规则（26条）
│   │   └── yida-yeqiu.md
│   └── skills/                       # 29个Skill技能库
│       ├── yida-architect/           # 需求架构师
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
│       ├── yida-config-sync/        # 配置同步
│       ├── yida-get-schema/         # Schema同步
│       ├── yida-rule-sync/          # 规则同步（只读）
│       ├── yida-project-sync/       # 项目一站式同步
│       ├── yida-system-map/         # 系统功能图谱
│       ├── yida-data-tester/        # 数据测试
│       ├── js-action-tester/        # JS动作测试
│       ├── yida-api-client/         # API客户端
│       ├── simulated-login/         # 模拟登录
│       ├── yida-server-manager/     # 服务管理
│       ├── data-clean/              # 数据清空
│       ├── system-troubleshooter/   # 问题诊断
│       ├── feedback-collector/      # 反馈收集
│       ├── skill-creator/           # Skill创建器
│       └── yida-report/             # 报表制作
├── AI宜搭场景/                        # 演示场景（7个表单）
├── ★宜搭场景案例库/                   # 公式/代码案例库
├── scripts/                          # 公共脚本
├── .gitignore
└── package.json
```

## 🚀 核心功能

### 需求分析层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| yida-architect | 业务需求→架构设计+字段定义 | 需求梳理、架构设计 |
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
| yida-config-sync | 同步应用ID/表单UUID/组件ID | "同步配置" |
| yida-get-schema | 同步表单Schema | 获取表单结构 |
| yida-rule-sync | 同步业务规则（只读） | "同步规则" |
| yida-project-sync | 一站式同步 | 一键同步已有项目 |
| yida-system-map | 生成系统功能图谱 | "生成系统图谱" |

### 测试层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| yida-data-tester | 测试数据提交/公式/流程 | "测试表单"、"模拟数据" |
| js-action-tester | 测试JS动作代码 | 测试宜搭JS代码 |

### 报表与自动化层

| Skill | 功能 | 触发词 |
|-------|------|--------|
| yida-report | 创建16种图表报表 | "创建报表"、"数据看板" |
| integration | 创建集成自动化逻辑流 | "集成自动化"、"逻辑流" |
| flow-settings | 配置流程自动审批 | "流程配置"、"设置自动审批" |

## 📦 快速开始

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
# 在 Trae IDE 中说："从宜搭初始化"
```

### 典型工作流

**新建应用**：
```
"创建一个进销存管理系统" → project-creator
"设计产品信息表单" → form_designer
"生成表单" → form_creator
"同步配置" → yida-config-sync
"写公式" → formula-generator
"测试表单" → yida-data-tester
```

**已有应用同步**：
```
"从宜搭初始化" → org-init
"一站式同步" → yida-project-sync
"生成系统图谱" → yida-system-map
```

## 🔒 安全原则

- **对已有应用**：只做"拉"（宜搭→本地读取），不做"推"（本地→宜搭写入）
- **公式和代码**：本地生成后由用户手动复制粘贴到宜搭平台
- **Cookie统一管理**：所有 Skill 共享根目录 `.cookies.json`

## 🛠️ 开发计划

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
- [ ] 集成自动化条件分支支持
- [ ] 错误恢复与断点续传

## 📞 联系方式

- GitHub: [@yeqiu2020](https://github.com/yeqiu2020)
- 项目地址: <https://github.com/yeqiu2020/yidaclaw>

***

> 📝 **注意**：本项目仅供学习和参考使用，使用宜搭平台请遵守阿里巴巴相关服务条款。
