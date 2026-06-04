---
name: simulated-login
description: 宜搭模拟登录管理器，通过浏览器自动化完成宜搭平台的登录流程，自动处理"立即登录"按钮点击、组织选择等操作
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则
1. **禁止通过API修改已有应用的表单字段内容** — 公式、代码、字段增删改只能复制粘贴（规则25）
2. **应用ID和表单UUID必须填真实值** — 从系统配置清单.md读取，严禁占位符（规则24）
3. **写入文件前必须校验** — 运行 `node scripts/ai-validator.js check-before-write <文件路径>` 确认不覆盖已有文件
4. **写入文件后必须校验** — 运行 `node scripts/ai-validator.js check-after-write <文件路径>` 确认内容合规
5. **Cookie必须使用根目录** — 严禁 process.cwd()，必须用 PROJECT_ROOT（规则26）

### 专属硬规则
1. **与yida-api-client共用.cookies.json** — Cookie文件路径必须指向项目根目录
2. **ensureLogin/handleLoginFlow核心API** — 所有登录操作必须通过这两个函数

---

# 宜搭模拟登录管理器


## 功能概述

本 Skill 提供宜搭平台的**浏览器模拟登录**能力，与 API 方式的登录不同，它通过真实的浏览器自动化完成登录流程，可以处理复杂的登录场景。

## 核心特点

- **浏览器自动化**：使用 Playwright 模拟真实用户操作
- **智能流程处理**：自动识别并处理各种登录页面（立即登录、选择组织等）
- **Cookie 管理**：自动保存和复用登录态，避免重复登录
- **统一存储**：与其他 Skill 共用项目根目录的 `.cookies.json` 文件
- **组织配置管理**：支持「组织及应用信息.md」Markdown 配置文件
- **应用列表同步**：可自动从宜搭平台同步应用列表

## 适用场景

| 场景 | 说明 |
|------|------|
| JS 代码测试 | 需要登录到宜搭设计器进行测试 |
| 配置同步 | 需要可视化操作宜搭后台 |
| 表单操作 | 需要模拟真实用户操作表单 |
| 复杂登录流程 | 需要处理"立即登录"按钮、组织选择等 |

## 与 API 登录的区别

| 特性 | simulated-login (本 Skill) | yida-api-client (API 方式) |
|------|---------------------------|---------------------------|
| 实现方式 | 浏览器自动化 | HTTP API 调用 |
| 适用场景 | 需要前端交互的场景 | 纯后端操作 |
| 登录流程 | 可视化浏览器，自动点击按钮 | 无头验证，扫码登录 |
| 复杂度 | 处理复杂登录流程 | 简单直接 |
| 依赖 | Playwright | Node.js HTTP |

## 文件结构

```
simulated-login/
├── SKILL.md                    # 本文档
└── scripts/
    ├── login-manager.js        # 登录管理器核心
    └── sync-apps.js            # 应用列表同步工具
```

## 组织配置管理

### 配置文件

组织信息存储在项目根目录的「组织及应用信息.md」文件中：

```
项目根目录/
├── .cookies.json               # Cookie 存储（自动维护）
├── 组织及应用信息.md           # 组织配置（Markdown 表格格式）
└── ...
```

### 配置文件格式

「组织及应用信息.md」使用 Markdown 表格格式，包含以下内容：

1. **基本信息** - 配置文件版本、更新时间
2. **组织信息** - 组织名称、域名前缀、corpId 等
3. **用户信息** - 当前登录用户信息
4. **应用列表** - 管理的宜搭应用列表

### 应用列表同步

**手动同步应用列表：**

```bash
cd .agents/skills/simulated-login/scripts
node sync-apps.js
```

**同步流程：**
1. 读取「组织及应用信息.md」中的组织配置
2. 调用宜搭 API 获取应用列表
3. 更新 Markdown 文件中的应用列表表格

**手动添加应用：**

直接在「组织及应用信息.md」的应用列表表格中添加：

```markdown
| 序号 | 应用名称 | 应用ID (appId) | 应用类型 | 备注 |
|------|----------|----------------|----------|------|
| 1 | 进销存管理 | APP_XXX | 普通应用 | 主要业务应用 |
| 2 | 客户管理 | APP_YYY | 普通应用 | 客户信息管理 |
```

## 核心 API

### ensureLogin(options)

确保拥有有效的登录态。如果 Cookie 有效直接返回，否则触发浏览器登录流程。

**参数：**
- `options.headless` (boolean): 是否使用无头模式，默认 `false`
- `options.targetUrl` (string): 目标 URL，默认 `https://www.aliwork.com/workPlatform`

**返回：**
```javascript
{
  cookies: [...],           // Cookie 数组
  base_url: "https://...",  // 基础 URL
  csrf_token: "xxx",        // CSRF Token
  corp_id: "dingxxx",       // 企业 ID
  login_user: {             // 用户信息
    userName: "张三",
    userId: "...",
    ...
  }
}
```

**示例：**
```javascript
const loginManager = require('../simulated-login/scripts/login-manager');

// 确保登录（自动处理登录流程）
const loginState = await loginManager.ensureLogin();

console.log('登录成功:', loginState.login_user.userName);
console.log('Cookie 数量:', loginState.cookies.length);
```

### handleLoginFlow(page, config)

处理宜搭登录授权流程。自动识别页面状态并执行相应操作。

**支持的登录场景：**
1. **立即登录页面** - 自动点击"立即登录"按钮
2. **二维码+头像授权** - 自动点击头像授权
3. **组织选择页面** - 自动选择第一个组织
4. **协议同意页面** - 自动点击"确定"

**参数：**
- `page` (Playwright Page): Playwright 页面对象
- `config.headless` (boolean): 是否无头模式

**返回：** `{ success, message }`

**示例：**
```javascript
const { chromium } = require('playwright');
const { handleLoginFlow } = require('../simulated-login/scripts/login-manager');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://www.aliwork.com/workPlatform');

const result = await handleLoginFlow(page);
if (result.success) {
  console.log('登录成功');
}
```

### Cookie 管理函数

```javascript
// 快速获取 Cookie（不验证，不触发登录）
const cookies = loginManager.getCookiesQuick();

// 获取完整登录态（不验证，不触发登录）
const state = loginManager.getLoginStateQuick();

// 加载 Cookie 数组
const cookies = loginManager.loadCookies();

// 加载完整登录态数据
const data = loginManager.loadCookieData();

// 保存登录态
loginManager.saveLoginState(loginState);
```

## 使用示例

### 示例 1：基础用法

```javascript
const loginManager = require('../simulated-login/scripts/login-manager');

async function main() {
  // 确保拥有有效登录态
  const loginState = await loginManager.ensureLogin();
  
  console.log('用户:', loginState.login_user.userName);
  console.log('corpId:', loginState.corp_id);
  console.log('baseUrl:', loginState.base_url);
}
```

### 示例 2：在 Playwright 中使用

```javascript
const { chromium } = require('playwright');
const loginManager = require('../simulated-login/scripts/login-manager');

async function run() {
  // 1. 获取登录态
  const loginState = await loginManager.ensureLogin();
  
  // 2. 启动浏览器并添加 Cookie
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await context.addCookies(loginState.cookies);
  
  // 3. 访问宜搭页面（已登录状态）
  const page = await context.newPage();
  await page.goto(`${loginState.base_url}/design/pageDesigner?formUuid=XXX`);
  
  // 4. 执行操作...
}
```

### 示例 3：仅获取 Cookie 不触发登录

```javascript
const loginManager = require('../simulated-login/scripts/login-manager');

// 快速获取 Cookie（不验证，不触发登录）
const cookies = loginManager.getCookiesQuick();

if (cookies) {
  console.log(`已有 ${cookies.length} 个 Cookie`);
  // 使用 Cookie 进行 API 调用或其他操作
} else {
  console.log('未找到登录态');
}
```

## Cookie 文件格式

登录态保存在项目根目录的 `.cookies.json` 文件中：

```json
{
  "cookies": [
    {
      "name": "sessionId",
      "value": "xxx",
      "domain": ".aliwork.com",
      "path": "/"
    }
  ],
  "base_url": "https://xxx.aliwork.com",
  "csrf_token": "xxx",
  "corp_id": "dingxxx",
  "login_user": {
    "userName": "张三",
    "userId": "..."
  },
  "updated_at": "2026-03-23T10:00:00.000Z"
}
```

## 注意事项

1. **Cookie 位置**：`.cookies.json` 位于项目根目录，与其他 Skill 共享
2. **有效期**：Cookie 通常有效期为几小时到几天
3. **并发安全**：避免多个进程同时写入 `.cookies.json`
4. **依赖**：需要安装 Playwright

## 依赖安装

```bash
npm install playwright
```

## 与其他 Skill 的关系

```
simulated-login (本 Skill)
    │
    ├── 被 js-action-tester 调用（浏览器自动化测试）
    ├── 被 yida-config-sync 调用（配置同步）
    └── 被其他需要浏览器登录的 Skill 调用
    │
    └── 共用 .cookies.json（与 yida-api-client 等 Skill 共享）


---

## 角色定义

你是宜搭模拟登录管理专家，专门负责通过浏览器自动化完成宜搭平台的登录流程。你熟悉Playwright浏览器操控和Cookie持久化机制，能够自动处理登录扫码和组织选择等操作，为其他Skill提供有效的登录态。

## 检查清单

### 执行前确认
- [ ] 确认.cookies.json文件路径指向项目根目录（规则26）
- [ ] 确认Playwright浏览器已安装
- [ ] 确认未被其他Skill占用浏览器实例

### 执行后确认
- [ ] 确认Cookie保存到项目根目录.cookies.json，非Skill子目录
- [ ] 确认登录后base_url非www.aliwork.com（已选择具体组织）
- [ ] 确认Cookie中包含有效的csrf_token
- [ ] 确认已过滤非标准cookie字段（partitionKey等）

---

## 版本

**v1.3.1** (2026-05-13)

### 更新内容
- 修复saveLoginState保存Playwright特有字段（partitionKey、_crHasCrossSiteAncestor）导致cookie文件被破坏的问题
- 新增cleanCookiesForStorage函数，保存时自动过滤非标准cookie字段

**v1.3.0** (2026-03-23)

### 更新内容
- 新增组织配置管理功能，支持 Markdown 格式的「组织及应用信息.md」文件
- 新增应用列表自动同步功能
- 新增 `accessWithLogin` 函数，支持"先尝试直接访问，失败后再登录"的智能模式