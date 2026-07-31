---
name: auth-plus
description: 多策略登录认证工具，提供CDP浏览器登录、环境变量注入、终端二维码登录、Playwright降级等多种登录策略，支持Cookie环境隔离和组织切换。替代单一Playwright依赖，支持自动恢复和环境隔离。
---

# auth-plus — 多策略登录认证

> 候选轨 Skill | 风险等级：R1~R2 | 依赖：lib/core（http.js, utils.js, error.js）

---

## 功能概述

提供多种登录策略，替代单一 Playwright 依赖，支持自动恢复和环境隔离。

### 与 simulated-login / api-client 的选择关系

登录/认证意图默认使用本 Skill，三者分工如下（详见 `skill-config.json` 的「登录 / 认证」消歧组）：

| 意图 | 应使用 | 说明 |
|------|--------|------|
| 登录宜搭、获取/刷新登录态、Cookie失效重新认证 | **auth-plus（本Skill）** | 默认多策略入口，自动按 环境变量 > CDP > 二维码 > Playwright降级 选择 |
| 明确要求可视化浏览器登录流程（看到浏览器操作、点击"立即登录"、手动选择组织） | simulated-login | 浏览器自动化全程可见，适合演示或需人工介入的场景 |
| 仅程序化调用宜搭API（静默登录只是API调用的前置能力，不以登录为目的） | api-client | 以创建应用/表单等API操作为目的，登录仅是内置前置步骤 |

### 登录策略

| 策略 | 原理 | 依赖 | 适用场景 |
|------|------|------|---------|
| CDP浏览器登录 | Chrome DevTools Protocol，直接连接本地已开启调试端口的浏览器 | 无Playwright | 本地开发、有Chrome/Edge |
| 环境变量注入 | 从 `YIDA_COOKIE_B64` 环境变量读取Base64编码的Cookie | 无浏览器 | CI/CD、容器环境、无头服务 |
| 终端二维码登录 | 通过HTTP请求获取二维码，终端显示并轮询登录状态 | 无浏览器 | 服务器环境、SSH远程 |
| Playwright登录 | 传统浏览器自动化登录（降级方案） | Playwright | CDP不可用时降级 |

### 其他功能

- **Cookie环境隔离**：`.cache/cookies-{env}.json`，支持多环境切换
- **组织切换与管理**：列出组织、切换组织、保存组织配置
- **自动恢复**：与 `lib/core/http.js` 的 `requestWithAutoLogin` 配合，请求失败时自动重登录

---

## 使用方式

### 1. CDP浏览器登录

```bash
# 先以调试模式启动Chrome
chrome.exe --remote-debugging-port=9222

# 运行CDP登录
node .agents/candidates/auth-plus/scripts/cdp-login.js
```

### 2. 环境变量注入

```bash
# 设置环境变量
set YIDA_COOKIE_B64=base64编码的cookie_json
set YIDA_AUTH_ENABLED=1

# 验证注入
node .agents/candidates/auth-plus/scripts/env-inject-login.js
```

### 3. 终端二维码登录

```bash
node .agents/candidates/auth-plus/scripts/qr-login.js
```

### 4. 通用入口（自动选择策略）

```bash
node .agents/candidates/auth-plus/scripts/index.js
```

策略选择优先级：环境变量注入 > CDP浏览器 > 终端二维码 > Playwright降级

---

## 文件结构

```
auth-plus/
├── SKILL.md              # 本文件
├── scripts/
│   ├── index.js          # 通用入口，自动选择登录策略
│   ├── cdp-login.js      # CDP浏览器登录
│   ├── env-inject-login.js # 环境变量注入登录
│   ├── qr-login.js       # 终端二维码登录
│   ├── cookie-manager.js # Cookie环境隔离管理
│   └── org-switch.js     # 组织切换与管理
```

---

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `YIDA_COOKIE_B64` | Base64编码的Cookie JSON | - |
| `YIDA_AUTH_ENABLED` | 是否启用环境变量注入模式 | `0` |
| `YIDA_CDP_PORT` | CDP调试端口 | `9222` |
| `YIDA_ENV` | 环境名称（用于Cookie隔离） | `default` |
| `YIDA_LOGIN_STRATEGY` | 强制指定登录策略 | `auto` |

---

## 约束

- 认证文件统一存入 `.cookies.json`（业务唯一认证文件）
- 不创建或引用 `yida-auth.json`
- Playwright为可选依赖，CDP/环境变量/二维码策略不依赖Playwright
- 所有脚本通过 `lib/core/` 公共库复用代码
