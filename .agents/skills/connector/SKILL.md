---
name: connector
description: 宜搭 HTTP 连接器创建与管理。支持自然语言描述 API 创建连接器、cURL 智能解析、API 文档自动解析、连接器动作管理、连接账号管理和安全动作模板。当用户需要接入外部接口、配置鉴权、创建或管理连接器时触发。
---

# HTTP 连接器管理

> 候选轨 Skill（Phase 3 新增），命名无 `yida-` 前缀（见禁止事项#11）。
> 依赖：`lib/core/http.js`（Phase 1/2 公共库）、`.cookies.json`（登录态）

## 严格禁止 (NEVER DO)

- 不要在代码中硬编码 API Key、密码等凭证，通过连接器鉴权配置管理
- 不要编造 connector-id 或 action-id，必须从命令返回中提取
- 不要删除连接器前确认是否有表单/页面正在使用
- 不要用 shell heredoc 或重定向生成连接器 action/config JSON

## 严格要求 (MUST DO)

- 优先使用 `smart-create` 从 cURL 命令或接口文档智能创建
- 创建连接器后，将 connector-id 记录到 `.cache/connectors.json`
- action 配置文件必须先用结构化文件写入工具创建到 `.cache/connector/actions/` 目录
- 本技能不读写 memory，连接器配置通过 API 写入宜搭平台

## 适用场景

用户需要"接入外部接口"、"调用第三方 API"、"连接钉钉开放平台"、"HTTP 连接器"时使用。

## 触发条件

**正向触发**：
- "接入外部接口"、"调用第三方 API"
- "连接钉钉开放平台"、"HTTP 连接器"
- "打通自建系统"、"API 集成"
- "配置鉴权"、"创建连接器"
- "从 cURL 创建"、"解析 API 文档"

## 鉴权方式

| 界面显示 | 内部类型 | 适用场景 |
|---------|---------|----------|
| 无身份验证 | `NONE` | 公开 API |
| 基本身份验证 | `BasicAuth` | 用户名密码 |
| API 密钥 | `ApiKeyAuth` | Header/Query 传密钥 |
| 钉钉开放平台验证 | `DingAuth` | 钉钉 OpenAPI |
| 阿里云 API 网关 | `AliyunApiGateway` | 阿里云网关 |
| 钉钉零信任网关 | `DingTrustGW` | 零信任网关 |

## 命令

### 连接器管理

```bash
# 列出所有连接器
node .agents/candidates/connector/scripts/connector-manager.js list --appType <appType>

# 创建连接器
node .agents/candidates/connector/scripts/connector-manager.js create --appType <appType> --name "连接器名称" --host "api.example.com" [--auth "NONE|BasicAuth|ApiKeyAuth|DingAuth|AliyunApiGateway|DingTrustGW" --username <用户名> --password <密码> --api-key <密钥> --app-key <应用Key> --app-secret <应用Secret>]

# 获取详情
node .agents/candidates/connector/scripts/connector-manager.js detail --appType <appType> --connectorId <connector-id>

# 删除连接器
node .agents/candidates/connector/scripts/connector-manager.js delete --appType <appType> --connectorId <connector-id>
```

### 执行动作管理

```bash
# 列出执行动作
node .agents/candidates/connector/scripts/action-manager.js list-actions --appType <appType> --connectorId <connector-id>

# 添加执行动作
node .agents/candidates/connector/scripts/action-manager.js add-action --appType <appType> --connectorId <connector-id> --operations <action-file>

# 删除执行动作
node .agents/candidates/connector/scripts/action-manager.js delete-action --appType <appType> --connectorId <connector-id> --actionId <action-id>

# 测试连接器
node .agents/candidates/connector/scripts/action-manager.js test --appType <appType> --connectorId <connector-id> --action <action-file>
```

### 连接账号管理

```bash
# 列出连接账号
node .agents/candidates/connector/scripts/connection-manager.js list-connections --appType <appType> --connectorId <connector-id>

# 创建连接账号
node .agents/candidates/connector/scripts/connection-manager.js create-connection --appType <appType> --connectorId <connector-id> --name "账号名" [--username <用户名> --password <密码> --api-key <密钥>]
```

### 智能创建（推荐）

```bash
# 从 cURL 命令创建
node .agents/candidates/connector/scripts/smart-create.js --appType <appType> --curl "curl 'https://api.example.com/v1/data' -H 'Authorization: Bearer xxx'" --name "连接器名称"

# 解析 API 文档
node .agents/candidates/connector/scripts/smart-create.js --appType <appType> --doc <api-doc.md路径>

# 生成接口文档模板
node .agents/candidates/connector/scripts/smart-create.js gen-template
```

### 安全动作模板

```bash
# 生成安全动作模板
node .agents/candidates/connector/scripts/safe-action-templates.js generate --type <GET|POST|PUT|DELETE> --url <接口路径> --name <动作名称>

# 列出可用模板
node .agents/candidates/connector/scripts/safe-action-templates.js list
```

## 文件结构

```
.agents/candidates/connector/
├── SKILL.md                          ← 本文件
├── scripts/
│   ├── connector-manager.js          ← 连接器管理（list/create/detail/delete）
│   ├── action-manager.js             ← 执行动作管理（list/add/delete/test）
│   ├── connection-manager.js         ← 连接账号管理（list/create）
│   ├── smart-create.js               ← 智能创建（cURL/API文档解析）
│   └── safe-action-templates.js      ← 安全动作模板
└── references/
    └── connector-api-guide.md        ← 连接器 API 参考
```

## 异常处理

| 异常场景 | 处理方式 |
|---------|----------|
| 连接器不存在 | 重新执行 list 获取有效 ID，不得编造 |
| 鉴权失败（401/403） | 检查鉴权方式和凭证配置 |
| API 调用超时 | 检查目标域名是否可达 |
| action-id 不存在 | 执行 list-actions 重新获取 |
| 连接器被依赖无法删除 | 先解除依赖再删除 |
| 智能创建解析失败 | 降级为模板创建方式 |
| 企业版权限不足 | 探测版本权限，无权限提示升级 |

## 危险操作确认

删除连接器为不可逆操作，执行前必须确认无表单/页面依赖此连接器。

## 参考文档

- [连接器 API 参考](references/connector-api-guide.md)
- [执行动作配置格式](references/connector-action-format.md)
- [宜搭 HTTP 连接器官方文档](https://docs.aliwork.com/docs/yida_support/_10/zbq17y)
