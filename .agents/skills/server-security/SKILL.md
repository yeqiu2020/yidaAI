---
name: server-security
version: 1.0.0
description: 宜搭本地服务安全加固补丁。以 Monkey-patch 方式接管 sync_server.js，不修改原文件任何代码：绑定 127.0.0.1、CORS 白名单、写接口 token 校验、清空数据二次确认。当用户说“安全加固”、“加固本地服务”、“服务安全补丁”、“启动加固服务”、“本地服务不安全”时触发此skill。适用于启动 sync_server.js 本地同步服务时防止外部访问、跨域滥用和误清空数据的场景。
risk_level: R2
phase: "0"
created: 2026-07-10
---

# server-security

宜搭本地服务安全加固补丁，以 Monkey-patch 方式加固 `sync_server.js`，不修改原文件任何代码。

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

# 关闭加固（直接运行原始服务）
SECURITY_PATCH_ENABLED=false node .agents/skills/form_creator/scripts/sync_server.js
```

## API 端点

| 端点 | 方法 | 说明 |
| ---- | ---- | ---- |
| `/get-session-token` | GET | 获取会话 token |
| `/request-clean-confirm` | POST | 获取 /clean-data 二次确认 nonce |
| `/health` | GET | 健康检查（附加安全状态信息） |

## 回退方式

设置环境变量 `SECURITY_PATCH_ENABLED=false` 后直接运行原始 `sync_server.js`。
