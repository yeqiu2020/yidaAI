# 连接器 API 参考

> 本文档记录宜搭平台连接器相关的 API 端点和数据结构。

## API 端点

所有连接器 API 都以 `/alibaba/web/{appType}/query/connector/` 为前缀。

### 连接器管理

| 操作 | 方法 | 路径 | 必填参数 |
|------|------|------|---------|
| 列表 | GET | `listConnector.json` | — |
| 创建 | POST | `saveConnector.json` | `name`, `host`, `authInfo` |
| 详情 | GET | `getConnectorDetail.json` | `connectorId` |
| 删除 | POST | `deleteConnector.json` | `connectorId` |

### 执行动作管理

| 操作 | 方法 | 路径 | 必填参数 |
|------|------|------|---------|
| 列表 | GET | `listActions.json` | `connectorId` |
| 添加 | POST | `saveAction.json` | `connectorId`, `operations` |
| 删除 | POST | `deleteAction.json` | `connectorId`, `actionId` |
| 测试 | POST | `testConnector.json` | `connectorId`, `action` |

### 连接账号管理

| 操作 | 方法 | 路径 | 必填参数 |
|------|------|------|---------|
| 列表 | GET | `listConnections.json` | `connectorId` |
| 创建 | POST | `saveConnection.json` | `connectorId`, `name`, `authInfo` |

## 鉴权方式

| 内部类型 | 适用场景 | 凭证字段 |
|---------|---------|---------|
| `NONE` | 公开 API | — |
| `BasicAuth` | 用户名密码 | `username`, `password` |
| `ApiKeyAuth` | Header/Query 传密钥 | `apiKey`, `in`, `headerName` |
| `DingAuth` | 钉钉 OpenAPI | `appKey`, `appSecret` |
| `AliyunApiGateway` | 阿里云网关 | `appKey`, `appSecret` |
| `DingTrustGW` | 零信任网关 | `appKey`, `appSecret` |

## 执行动作配置格式

详见 [连接器执行动作配置文件格式](connector-action-format.md)。

### 关键字段

| 字段 | 说明 |
|------|------|
| `operationId` | 动作唯一标识（英文，下划线分隔） |
| `summary` | 动作显示名称（中文） |
| `url` | 接口路径（不含域名，以 / 开头） |
| `method` | HTTP 方法（小写：get/post/put/delete） |
| `inputs` | 输入参数分组（Headers/Query/Path/Body） |
| `parameters` | 参数默认值 |
| `responses` | 响应 JSON Schema |
| `outputs` | 输出字段定义 |

### inputs 分组规则

| 分组 | 说明 | 包含内容 |
|------|------|---------|
| `Headers` | 请求头 | Content-Type 等 |
| `Query` | URL 查询参数 | GET 接口参数 |
| `Path` | 路径变量 | URL 中 `{variable}` 参数 |
| `Body` | 请求体 | POST/PUT JSON body |

> GET 接口没有 Body，所有业务参数放在 Query 分组中。

## 权限要求

- 连接器功能需要**企业版**及以上版本
- 需要**应用管理员**权限
- 无权限时 API 返回权限相关错误信息

## 缓存文件

连接器创建后，connector-id 会自动保存到 `.cache/connectors.json`：

```json
{
  "CN_XXX": {
    "name": "测试API",
    "host": "api.example.com",
    "connectorId": "CN_XXX",
    "createdAt": "2026-07-10T12:00:00.000Z"
  }
}
```
