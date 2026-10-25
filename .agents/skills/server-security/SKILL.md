---
name: server-security
version: 1.1.0
description: 宜搭本地服务安全边界。默认静态与同步服务统一启用 127.0.0.1 绑定、精确 CORS、写请求会话 token、清空数据确认 nonce、凭证文件和跨项目路径隔离。当用户说“安全加固”、“加固本地服务”、“服务安全补丁”、“启动加固服务”、“本地服务不安全”时触发。兼容入口保留，不依赖 Monkey-patch，不提供静默关闭保护的默认路径。
risk_level: R2
phase: "0"
created: 2026-07-10
---

# server-security

宜搭本地服务安全加固补丁，默认安全边界已直接接入同步服务和静态服务。原脚本保留为兼容入口，不再依赖 Monkey-patch；默认启动即启用保护。

## 加固内容

1. **绑定 127.0.0.1**：服务仅监听回环地址，外部不可访问
2. **CORS 白名单**：替换原来的 `*`，仅允许本地 Origin
3. **写接口 token 校验**：所有写/删接口需携带会话 token
4. **/clean-data 二次确认**：需先获取 nonce 再执行清空操作

## 脚本

| 脚本 | 说明 |
| ---- | ---- |
| `scripts/server-security-patch.js` | 安全中间件补丁，替换 http.createServer 和 server.listen |

## 使用方式

```bash
# 启动加固服务
node .agents/skills/server-security/scripts/server-security-patch.js

# 默认启动（AI 会话唯一入口）
node .workbuddy-ai/run/ensure-service.js
```

## API 端点

| 端点 | 方法 | 说明 |
| ---- | ---- | ---- |
| `/get-session-token` | GET | 获取会话 token |
| `/request-clean-confirm` | POST | 获取 /clean-data 二次确认 nonce |
| `/health` | GET | 健康检查（附加安全状态信息） |

## 回退方式

安全边界不提供静默关闭开关。遇到兼容问题应修复请求客户端或回滚完整版本，禁止单独绕过安全检查。
