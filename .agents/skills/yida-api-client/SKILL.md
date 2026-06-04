---
name: yida-api-client
description: 宜搭API客户端，提供静默式登录、创建应用、创建表单的能力，支持Cookie持久化和CSRF Token自动管理
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则
1. **禁止通过API修改已有应用的表单字段内容** — 公式、代码、字段增删改只能复制粘贴（规则25）
2. **应用ID和表单UUID必须填真实值** — 从系统配置清单.md读取，严禁占位符（规则24）
3. **写入文件前必须校验** — 运行 `node scripts/ai-validator.js check-before-write <文件路径>` 确认不覆盖已有文件
4. **写入文件后必须校验** — 运行 `node scripts/ai-validator.js check-after-write <文件路径>` 确认内容合规
5. **Cookie必须使用根目录** — 严禁 process.cwd()，必须用 PROJECT_ROOT（规则26）

### 专属硬规则
1. **saveFormSchema仅允许对新建表单调用** — 严禁对已有表单调用
2. **deleteForm仅允许在创建失败回滚时调用** — 禁止删除业务表单
3. **Cookie持久化与simulated-login共用** — 统一使用根目录.cookies.json

---

# 宜搭API客户端 Skill

## 版本

**v1.1.0** (2026-05-13)

- 修复setCustomTitle函数API路径缺少_api和_mock参数导致参数校验失败的问题
- 添加_locale_time_zone_offset参数，参数顺序与宜搭实际请求一致

**v1.0.0** (2026-03-11)

## 功能概述

本Skill提供宜搭平台的程序化API访问能力，包括：

1. **登录态管理**：Cookie持久化、CSRF Token自动获取、登录态自动刷新
2. **应用管理**：创建宜搭应用
3. **表单管理**：创建宜搭表单页面

## 核心特点

- **静默式操作**：首次扫码登录后，后续自动复用Cookie
- **自动重试**：登录态过期时自动重新登录并重试请求
- **无浏览器依赖**：API调用使用原生HTTP，无需浏览器
- **与现有工作流集成**：与form_creator skill配合，实现从字段定义到表单创建的完整流程

## 文件结构

```
yida-api-client/
├── SKILL.md                          # 本文档
├── scripts/
│   ├── login_manager.py              # Python登录态管理（Playwright）
│   ├── api_client.js                 # API客户端核心
│   ├── app_manager.js                # 应用管理
│   ├── form_manager.js               # 表单管理
│   └── schema_builder.js             # Schema构建器
└── config/
    └── default.json                  # 默认配置
```

## 登录方式说明

本 Skill 提供 **API 方式**的登录管理（`login_manager.py`），适用于纯后端 API 调用场景。

如果需要 **浏览器模拟登录**（处理"立即登录"按钮、组织选择等），请使用 `simulated-login` Skill。

## 核心API接口

### 1. 登录态管理

#### Python 版本 (login_manager.py)

```python
# login_manager.py
ensure_login() -> {
  "csrf_token": "xxx",
  "corp_id": "dingxxx",
  "base_url": "https://xxx.aliwork.com",
  "cookies": [...]
}
```

### 2. 创建应用

```javascript
// app_manager.js
POST /query/app/registerApp.json
参数: {
  _csrf_token: "xxx",
  appName: JSON.stringify({ zh_CN: "名称", en_US: "名称", type: "i18n" }),
  description: JSON.stringify({ zh_CN: "描述", en_US: "描述", type: "i18n" }),
  icon: "xian-yingyong%%#0089FF",
  colour: "blue",
  // ... 其他固定参数
}
返回: { "content": "APP_XXX", "success": true }
```

### 3. 创建表单

```javascript
// form_manager.js
// 步骤1: 创建空白表单
POST /dingtalk/web/{appType}/query/formdesign/saveFormSchemaInfo.json
参数: { formType: "receipt", title: JSON.stringify({ zh_CN: "表单名", type: "i18n" }) }
返回: { "content": { "formUuid": "FORM-XXX" }, "success": true }

// 步骤2: 保存表单Schema
POST /dingtalk/web/{appType}/_view/query/formdesign/saveFormSchema.json
参数: { appType, formUuid, content: JSON.stringify(schema), schemaVersion: "V5", prefix: "_view" }

// 步骤3: 更新表单配置
POST /dingtalk/web/{appType}/query/formdesign/updateFormConfig.json
参数: { formUuid, version: 1, configType: "MINI_RESOURCE", value: 0 }
```

## 使用方式

### 命令行调用

```bash
# 登录（首次需要扫码）
python3 .agents/skills/yida-api-client/scripts/login_manager.py

# 创建应用
node .agents/skills/yida-api-client/scripts/app_manager.js create "应用名称" "应用描述"

# 创建表单
node .agents/skills/yida-api-client/scripts/form_manager.js create "APP_XXX" "表单名称" fields.json
```

### 编程调用

```javascript
const { YidaApiClient } = require('./api_client');

const client = new YidaApiClient();

// 创建应用
const app = await client.createApp({
  name: "考勤管理",
  description: "员工考勤打卡系统"
});

// 创建表单
const form = await client.createForm({
  appType: app.appType,
  title: "打卡记录",
  fields: [...]  // 字段定义数组
});
```

## 与form_creator集成

form_creator生成表单JSON后，可直接调用本skill创建到宜搭平台：

```javascript
// 在form_generator_v2.js中使用
const { FormManager } = require('../yida-api-client/scripts/form_manager');

// 生成表单JSON后，自动创建到宜搭
const formManager = new FormManager();
const result = await formManager.createForm(appType, formTitle, fields);
```

## 配置说明

配置文件位置：`.agents/skills/yida-api-client/config/default.json`

```json
{
  "loginUrl": "https://www.aliwork.com/workPlatform",
  "defaultBaseUrl": "https://www.aliwork.com",
  "cookieFile": ".cookies.json"
}
```

## 登录态缓存

登录成功后，Cookie和登录信息会保存到项目根目录的 `.cookies.json`：

```json
{
  "cookies": [...],
  "base_url": "https://xxx.aliwork.com",
  "csrf_token": "xxx",
  "corp_id": "dingxxx",
  "login_user": { "userName": "张三", "userId": "xxx" }
}
```

## 注意事项

1. **首次登录需要扫码**：Cookie过期或不存在时，会打开浏览器让用户扫码
2. **base_url可能变化**：登录后可能跳转到组织对应的域名（如 `abcd.aliwork.com`）
3. **corpId获取**：从Cookie或页面window对象中提取，用于SerialNumberField等字段

---

## 角色定义

你是宜搭API客户端专家，专门负责提供静默式登录、创建应用和创建表单的API调用能力。你熟悉宜搭平台的认证机制和API接口，能够安全高效地管理Cookie持久化和CSRF Token，为其他Skill提供可靠的API调用基础。

## 检查清单

### 执行前确认
- [ ] 确认Cookie文件路径指向项目根目录.cookies.json（规则26）
- [ ] 确认首次登录时已打开浏览器供用户扫码
- [ ] 确认已获取有效的csrf_token

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认saveFormSchema仅对新建表单调用，严禁对已有表单调用
- [ ] 确认Cookie保存到项目根目录，非Skill子目录
