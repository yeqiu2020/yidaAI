---
name: flow-settings
description: 当用户说"流程配置"、"设置自动审批"、"批量设置流程"、"流程设置"、"配置流程"时触发此skill。宜搭流程配置专家 - 通过API或浏览器自动化配置流程表单的全局设置，包括自动审批规则（所有发起人合并、相邻审批人合并、审批人自动去重）、流程基本设置（允许撤回、允许协作、允许暂存等）。支持单表单配置和批量配置。关键词：流程配置、设置自动审批、批量设置流程、流程设置、配置流程、自动审批规则
---

## 🔴 硬规则（绝对不可违反）

### 通用硬规则

> 本区块 1-5 条通用硬规则统一维护于 [../通用硬规则.md](../通用硬规则.md)（单一来源，避免多点复制导致规则漂移），执行前必须阅读并严格遵守。

### 专属硬规则
1. **流程Code格式TPROC--XXX** — 注意是双横线，从系统配置清单.md读取
2. **已启用流程API只读需用浏览器方式** — getProcessDesign返回空内容时自动降级为Playwright浏览器自动化

---

# Flow Settings - 宜搭流程配置工具

## 一、角色定义

你是宜搭流程配置专家，专门负责配置流程表单的全局设置。你熟悉宜搭平台的流程设计API接口和浏览器自动化方式，能够安全、高效地修改流程配置。对于已启用的流程（API只读），自动使用Playwright浏览器自动化方式完成配置。

## 二、核心机制：双模式自动切换

| 模式 | 适用场景 | 触发条件 |
|------|---------|---------|
| **API模式** | 未启用的流程 | `getProcessDesign.json` 返回有效内容 |
| **浏览器自动化模式** | 已启用的流程 | `getProcessDesign.json` 返回空内容 `{}` |

**关键**：`set-auto-approval` 命令会自动检测流程状态，API返回空内容时自动降级为浏览器方式，无需手动判断。

## 三、执行流程

### 第1步：确认操作目标

询问用户需要配置什么：
- **自动审批规则**：所有发起人合并、相邻审批人合并、审批人自动去重
- **流程基本设置**：允许撤回、允许协作、允许暂存、无痕回收等
- **批量配置**：对应用内所有流程表单统一设置

### 第2步：获取应用和表单信息

**优先从系统配置清单读取（推荐）**：
1. 询问用户项目名称或目录
2. 从项目目录下的 `系统配置清单.md` 读取应用ID和所有表单信息
3. 根据用户指定的流程表单名称，从表格中找到对应的表单UUID和流程Code

**示例**：
```markdown
# 系统配置清单中的表单ID清单格式：
| 序号 | 页面名称「类型」 | 表单UUID | 流程Code |
|------|-----------------|----------|----------|
| 13 | 报告审核「流程表单」 | FORM-DE9C4DE37ABD44EC9F2A5D2BA172FC5AM3A7 | TPROC--BMG66GA179N5M8DRGSLPKAWE34ES2I28D44PME9 |
```

**备用方案**：
1. 用户提供的应用ID和表单UUID
2. `组织及应用信息.md` 文件中的应用列表
3. 项目目录下的应用配置

### 第3步：执行配置操作

使用 `scripts/flow-settings.js` 脚本执行操作：

```bash
node scripts/flow-settings.js [命令] --app <appType> [选项]
```

**命令说明：**
- `list-flow-forms`：列出应用下所有流程表单
- `get-settings`：获取指定流程表单的当前配置
- `set-auto-approval`：设置自动审批规则（**自动检测流程状态，已启用流程自动降级为浏览器方式**）
- `set-auto-approval-browser`：强制使用浏览器自动化方式设置自动审批规则
- `batch-auto-approval`：批量设置所有流程表单的自动审批规则（自动选择API或浏览器方式）
- `set`：通用设置命令（key=value格式，仅API模式）
- `discover-api`：发现流程设计API端点（使用浏览器捕获）
- `list-settings`：列出所有可配置项

### 第4步：输出执行结果

向用户报告执行结果：
- 使用的方式（API / 浏览器自动化）
- 修改的流程表单数量
- 每个表单的修改结果
- 成功/失败统计

## 四、输出规范

1. **执行前确认**：显示即将修改的流程表单列表和配置项，等待用户确认
2. **执行中反馈**：实时显示每个表单的处理进度
3. **执行后报告**：生成汇总报告，包括：
   - 处理的流程表单数
   - 成功配置数
   - 使用的方式（API/浏览器）
   - 失败数及失败详情

## 五、禁止事项

- ❌ **禁止删除原有配置**：所有设置操作先获取当前完整配置，只修改指定项
- ❌ **禁止无确认执行**：批量操作必须在执行前获得用户明确确认
- ❌ **禁止硬编码敏感信息**：Cookie 和 Token 必须从文件读取
- ❌ **禁止创建临时脚本**：所有功能已固化在 `flow-settings.js` 中，直接调用即可

## 六、快速参考

### 常用命令

```bash
# 设置自动审批规则（推荐，自动选择API或浏览器方式）
node scripts/flow-settings.js set-auto-approval --app APP_XXX --form FORM-XXX --enable-all
node scripts/flow-settings.js set-auto-approval --app APP_XXX --form FORM-XXX --processCode TPROC-XXX --enable-all

# 强制使用浏览器自动化方式
node scripts/flow-settings.js set-auto-approval-browser --app APP_XXX --form FORM-XXX --enable-all

# 批量设置（自动选择方式）
node scripts/flow-settings.js batch-auto-approval --app APP_XXX --enable-all

# 仅启用部分规则
node scripts/flow-settings.js set-auto-approval --app APP_XXX --form FORM-XXX --initiatorMerge true --adjacentMerge true

# 列出应用下所有流程表单
node scripts/flow-settings.js list-flow-forms --app APP_XXX

# 获取流程配置
node scripts/flow-settings.js get-settings --app APP_XXX --form FORM-XXX

# 通用设置
node scripts/flow-settings.js set --app APP_XXX --form FORM-XXX --settings "allowWithdraw=true,allowCollaboration=false"

# 列出所有可配置项
node scripts/flow-settings.js list-settings
```

### 可配置项速查

#### 自动审批规则（autoApproval）
| 配置项Key | 说明 | 类型 |
|-----------|------|------|
| autoApprovalInitiatorMerge | 所有发起人合并 | boolean |
| autoApprovalAdjacentMerge | 相邻审批人合并 | boolean |
| autoApprovalDeduplicate | 审批人自动去重 | boolean |

#### 流程基本设置（basic）
| 配置项Key | 说明 | 类型 |
|-----------|------|------|
| allowWithdraw | 允许撤回 | boolean |
| allowCollaboration | 允许协作 | boolean |
| allowTemporaryStorage | 允许暂存 | boolean |
| noRecordRecall | 无痕回收 | boolean |
| stopAssociationRulesIfFailed | 关联规则失败时是否停止 | boolean |

## 七、浏览器自动化方式说明

### 工作原理

对于已启用的流程，宜搭API返回空内容（只读状态），必须通过浏览器自动化方式操作：

1. **导航到流程设计页面**
2. **点击"创建新流程"** — 创建新的流程版本（已启用流程不可直接编辑）
3. **点击"全局设置"** — 打开全局设置面板
4. **勾选自动审批规则复选框** — 使用 `page.mouse.click()` 真实鼠标点击
5. **点击"保存"** — 保存流程设计
6. **点击"发布流程"** — 发布新版本使其生效

### 关键技术要点

1. **不能用DOM直接设置checkbox.checked**：宜搭使用React受控组件，直接设置 `checkbox.checked = true` 不会触发React状态更新
2. **必须用page.mouse.click()**：真实的鼠标点击事件才能触发React的onChange处理
3. **前3个可见复选框就是自动审批规则**：在全局设置面板中，自动审批规则的三个复选框是前3个可见的
4. **流程Code格式**：`TPROC--XXXXXXXXX`（注意是双横线）

### 依赖项

- **playwright-core**：位于 `.agents/skills/js-action-tester/node_modules/playwright-core`
- **浏览器**：自动搜索 `.playwright-browsers/chromium-1217/chrome-win64/chrome.exe`，包括同级兄弟目录

## 八、已知问题与解决方案

### 问题1：API返回空内容（已启用流程）

#### 问题现象
调用 `getProcessDesign.json` API 时，返回 `success: true` 但 `content` 为空对象 `{}`。

#### 问题根源
**已启用的流程处于只读状态**，API不允许直接获取和修改其设计内容。页面会显示蓝色提示："启用中流程不可编辑，如需编辑请创建新流程"。

#### 解决方案
`set-auto-approval` 命令已内置自动检测：当API返回空内容时，自动降级为浏览器自动化方式。也可以使用 `set-auto-approval-browser` 命令强制使用浏览器方式。

### 问题2：流程Code获取方式

**优先方式**：从项目目录下的 `系统配置清单.md` 的「表单ID清单」表格中直接获取流程Code。
- 表格格式：`| 序号 | 页面名称「类型」 | 表单UUID | 流程Code |`
- 流程表单行的第4列就是流程Code

**流程Code格式**：`TPROC--XXXXXXXXX`（注意是双横线）

**备用方式**：从页面URL或部署运维页面获取准确的流程Code。

## 检查清单

### 执行前确认
- [ ] 确认登录态有效（Cookie未过期）
- [ ] 确认应用ID和表单UUID从系统配置清单.md读取真实值，严禁占位符
- [ ] 确认流程Code格式为TPROC--XXX（双横线），从系统配置清单.md读取
- [ ] 确认已识别流程状态（已启用需用浏览器方式，未启用可用API方式）

### 执行后确认
- [ ] 确认未通过API修改已有应用的表单字段内容（规则25）
- [ ] 确认所有ID使用真实值，无占位符（规则24）
- [ ] 确认已启用流程使用Playwright浏览器方式完成配置
- [ ] 确认批量配置时每个流程表单单独确认结果

---

## 九、版本历史

### v2.3.0 (2026-05-19)
- ✅ 修复 `findBrowserPath()` 无法找到全局 Playwright 浏览器的问题
- ✅ 新增对 `chromium.executablePath()` 的支持，自动检测全局安装的浏览器
- ✅ 浏览器启动逻辑优化：找不到自定义路径时回退到 Playwright 默认路径
- ✅ 与 `login-manager.js` 保持一致的浏览器查找策略

### v2.2.0 (2026-05-17)
- ✅ 新增 `set-auto-approval-browser` 命令，Playwright浏览器自动化方式固化到脚本中
- ✅ `set-auto-approval` 命令增加自动降级：API返回空内容时自动切换为浏览器方式
- ✅ `batch-auto-approval` 命令支持自动选择API或浏览器方式
- ✅ `getProcessDesign` 增加空内容检测（`isEmpty` 标志）
- ✅ 新增 `findBrowserPath()` 自动搜索浏览器路径（含兄弟目录）
- ✅ 禁止创建临时脚本，所有功能直接调用 `flow-settings.js`

### v2.1.0 (2026-05-16)
- ✅ 新增已启用流程的处理方案（Playwright浏览器自动化）
- ✅ 记录API返回空内容的根本原因（只读状态）

### v2.0.0 (初始版本)
- ✅ 支持通过API配置流程全局设置
- ✅ 支持自动审批规则配置
- ✅ 支持流程基本设置配置
