# 现有 tests 整合说明

> **说明：** 本文档说明现有 `tests/core/` 和 `tests/features/`（Jest 单元测试）如何与新框架（`tests/framework/`）整合使用。
> **配套文档：** [工具与能力映射.md](./工具与能力映射.md) · [03-质量治理机制.md](../03-质量治理机制.md)

---

## 一、整合架构

```
tests/
├── core/                          # 【现有】工具链核心模块单元测试（Jest）
│   ├── chalk.test.js              # 颜色输出模块
│   ├── error.test.js              # 错误处理模块
│   ├── http.test.js               # HTTP 请求模块
│   ├── http-request.test.js       # HTTP 请求扩展
│   ├── login-manager.test.js      # 登录管理模块
│   ├── login-manager-extra.test.js# 登录管理扩展
│   ├── spawn.test.js              # 子进程调用模块
│   ├── utils.test.js              # 通用工具模块
│   └── utils-extra.test.js        # 通用工具扩展
│
├── features/                      # 【现有】工具链特性功能单元测试（Jest）
│   ├── cookie-auth.test.js        # Cookie 认证
│   ├── dangerous-operation.test.js# 危险操作校验
│   ├── field-parsing.test.js      # 字段解析
│   ├── formula-marks.test.js      # 公式 marks 计算
│   ├── path-resolution.test.js    # 路径解析
│   └── schema-building.test.js    # Schema 构建
│
├── framework/                     # 【新增】测试与反馈迭代框架（宜搭版）
│   ├── 01-方法论核心.md
│   ├── 02-角色与工具协作.md
│   ├── 03-质量治理机制.md
│   ├── 04-测试场景设计原则.md
│   ├── 05-应用适配流程.md
│   ├── 06-分层修复原则.md
│   ├── 07-反模式与教训库.md
│   ├── 08-提示词模板/
│   ├── 09-文档模板/
│   ├── 10-工具链映射/
│   └── README.md
│
└── coverage/                      # Jest 覆盖率报告（自动生成）
```

---

## 二、整合定位

### 2.1 两类测试的定位

| 测试类型 | 目录 | 测试对象 | 执行方式 | 角色 |
|---------|------|---------|---------|------|
| **工具链单元测试** | `tests/core/`、`tests/features/` | AI 工具链本身（`lib/core/`、Skill 脚本） | `npm test`（Jest） | 工具链健康检查 |
| **应用层测试** | 通过 Skill 执行（data-tester 等） | 宜搭应用（表单、公式、规则、流程） | Skill 脚本 + 浏览器 | 应用功能验证 |

### 2.2 整合原则

1. **工具链测试是应用测试的前提**：应用测试前必须先确认工具链本身健康（`npm test` PASS）
2. **应用测试不替代工具链测试**：两者覆盖不同对象，不能互相替代
3. **统一在能力覆盖矩阵中管理**：工具链能力作为"工具链"能力域，与应用能力并列
4. **统一在 Smoke 门禁中检查**：Smoke 回归集必须包含 `npm test` 一项

---

## 三、现有 Jest 测试清单

### 3.1 tests/core/（核心模块测试）

| 测试文件 | 被测模块 | 覆盖内容 | 覆盖率要求 |
|---------|---------|---------|-----------|
| `chalk.test.js` | `lib/core/chalk.js` | 颜色输出、终端检测 | statements ≥ 80% |
| `error.test.js` | `lib/core/error.js` | ErrorCode 枚举、CliError 类、wrapError | statements ≥ 90% |
| `http.test.js` | `lib/core/http.js` | HTTP 请求、CSRF Token | statements ≥ 25% |
| `http-request.test.js` | `lib/core/http.js` | HTTP 请求扩展 | — |
| `login-manager.test.js` | `lib/core/login-manager.js` | 登录管理、Cookie 持久化 | statements ≥ 15% |
| `login-manager-extra.test.js` | `lib/core/login-manager.js` | 登录管理扩展场景 | — |
| `spawn.test.js` | `lib/core/spawn.js` | safeSpawn、子进程调用 | statements ≥ 80% |
| `utils.test.js` | `lib/core/utils.js` | 通用工具函数 | statements ≥ 55% |
| `utils-extra.test.js` | `lib/core/utils.js` | 通用工具扩展场景 | — |

### 3.2 tests/features/（特性功能测试）

| 测试文件 | 被测 Skill/模块 | 覆盖内容 |
|---------|----------------|---------|
| `cookie-auth.test.js` | Cookie 认证 | Cookie 有效性验证、脱敏处理 |
| `dangerous-operation.test.js` | `lib/core/spawn.js` + `lib/core/utils.js` | 危险操作校验、路径注入防护、Cookie 脱敏 |
| `field-parsing.test.js` | 字段解析 | 字段类型识别、字段 ID 提取 |
| `formula-marks.test.js` | `formula-generator/scripts/generate_formula.js` | marks 位置计算、零宽空格包裹、公式函数验证 |
| `path-resolution.test.js` | 路径解析 | 路径解析、项目根目录定位 |
| `schema-building.test.js` | Schema 构建 | 表单 Schema 解析、字段映射 |

---

## 四、整合使用流程

### 4.1 应用测试前的工具链健康检查

**每次启动应用测试前，必须先执行：**

```bash
npm test
```

**通过标准：**
- 所有测试 PASS
- 覆盖率达到 `jest.config.js` 中定义的阈值
- 无 SKIP 超过 20%

**失败处理：**
- 如果 `npm test` FAIL，必须先修复工具链问题（工具链层修复）
- 修复后重新执行 `npm test` 确认 PASS
- 然后才能开始应用层测试

### 4.2 工具链问题归类为 ISS

如果 `npm test` 发现工具链问题：
- 创建 ISS，修复层级 = "工具链层"
- 修复方式 = 直接编辑 Skill 脚本
- FW 编号 = 必须分配（如 FW-XX）
- 修复后必须新增回归用例到 `tests/core/` 或 `tests/features/`

### 4.3 应用测试中的工具链回归

如果应用测试中发现工具链 Skill 脚本缺陷（如 data-tester 的 submitter.js 漏洞）：
1. 创建 ISS，修复层级 = "工具链层"
2. 直接编辑 Skill 脚本修复
3. 在 `tests/core/` 或 `tests/features/` 新增回归测试用例
4. 执行 `npm test` 确认修复有效
5. 重新执行应用测试

### 4.4 归档门禁

归档前必须满足：
- 核心 Smoke 100% PASS（含应用层和工具链层）
- 负面 Smoke 100% PASS
- `npm test` PASS（工具链健康检查）
- SKIP 率 ≤ 20%
- 任何 FAIL 不得归档

---

## 五、新增 Jest 测试的规范

### 5.1 何时新增 Jest 测试

- 修复工具链层 ISS 后，必须新增回归测试
- 新增 Skill 功能时，必须新增单元测试
- 发现工具链边界场景时，建议新增扩展测试

### 5.2 文件命名规范

- 核心模块测试：`tests/core/{模块名}.test.js` 或 `tests/core/{模块名}-extra.test.js`
- 特性功能测试：`tests/features/{功能名}.test.js`

### 5.3 测试编写规范

```javascript
'use strict';

const { 被测函数 } = require('../../lib/core/模块名');

describe('模块名', () => {
  describe('函数名', () => {
    test('正常场景：{描述}', () => {
      const result = 被测函数(参数);
      expect(result).toBe(预期值);
    });

    test('边界场景：{描述}', () => {
      const result = 被测函数(边界参数);
      expect(result).toBe(预期值);
    });

    test('异常场景：{描述}', () => {
      expect(() => 被测函数(非法参数)).toThrow(预期错误);
    });
  });
});
```

### 5.4 覆盖率维护

- 新增代码必须同步新增测试
- 覆盖率不得下降（`jest.config.js` 中的阈值是下限）
- 鼓励提升覆盖率，但不强制超过阈值

---

## 六、整合后的完整测试体系

```
┌─────────────────────────────────────────────────────────┐
│                  测试与反馈迭代框架                       │
│                  （tests/framework/）                    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  方法论核心  │  │  角色协作    │  │  质量治理    │    │
│  │  (01-07)    │  │  (02)       │  │  (03)       │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  应用适配    │  │  分层修复    │  │  反模式库    │    │
│  │  (05)       │  │  (06)       │  │  (07)       │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  提示词模板  │  │  文档模板    │  │  工具链映射  │    │
│  │  (08)       │  │  (09)       │  │  (10)       │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
          │                              │
          ↓                              ↓
┌─────────────────────┐    ┌─────────────────────────┐
│  应用层测试          │    │  工具链单元测试           │
│  (通过 Skill 执行)   │    │  (tests/core/、features/) │
│                     │    │                         │
│  • data-tester      │    │  • Jest (npm test)       │
│  • js-action-tester │    │  • 覆盖率收集             │
│  • playwright-cli   │    │  • 回归测试               │
│  • app-tester       │    │                         │
└─────────────────────┘    └─────────────────────────┘
          │                              │
          ↓                              ↓
┌─────────────────────────────────────────────────────────┐
│                  Smoke 门禁                             │
│                                                         │
│  核心 Smoke 100% PASS + 负面 Smoke 100% PASS            │
│  + npm test PASS + SKIP ≤ 20% + 任何 FAIL 不得归档      │
└─────────────────────────────────────────────────────────┘
```

---

## 七、版本信息

- **框架版本**：v1.0.0
- **创建日期**：2026-07-16
- **维护方**：AI 主助手
- **依赖**：Jest 29.7.0+、Node.js 16+
