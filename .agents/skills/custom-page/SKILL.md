---
name: custom-page
description: 宜搭自定义页面开发。使用 export function renderJsx() 模式编写完整的自定义页面代码，支持 JSX 渲染、状态管理、API 调用和复杂交互。当用户说'自定义页面'、'JSX页面'、'自定义组件'、'页面JS代码'、'自定义页面代码'、'页面交互'时触发。不适用于原生表单页面开发。
---

# 自定义页面开发

## 核心规则

### 致命规则（FATAL）

违反会导致页面崩溃或运行时报错：

1. **使用 `export function` 定义方法**：所有需要 `this` 的方法必须用 `export function` 定义，不得用箭头函数或函数表达式
2. **事件绑定箭头函数包裹**：`renderJsx` 顶部先写 `var self = this`，事件使用 `onClick={(e) => { self.handleClick(e) }}`，严禁 `onClick={this.handleClick}` 或 `.bind(this)`
3. **`.map()`/`.filter()` 回调用箭头函数**：`.map((item) => ...)`，禁止 `.map(function(item) {...})`，否则回调内 `this` 丢失
4. **输入框非受控模式**：`<input>` 用 `defaultValue` + `onChange` 写入 `_customState`，禁止 `value` 受控模式
5. **禁止 import/require**：第三方库通过 `this.utils.loadScript` 加载 CDN 脚本
6. **字段 ID 必须从系统配置清单获取**：读取项目中的 `系统配置清单.md` 和 `组件ID清单.md` 获取真实 fieldId，文件顶部定义 `FIELDS` 常量映射字段别名，禁止猜测或手写
7. **所有 API 调用必须 .catch()**：异常通过 `this.utils.toast({ title: message, type: 'error' })` 提示用户
8. **renderJsx 每个 return 分支必须渲染 timestamp**：`<div style={{ display: 'none' }}>{this.state && this.state.timestamp}</div>`
9. **禁止 ES6 计算属性名**：不要写 `{ [key]: value }`、`{ [FIELDS.xxx]: value }` 或 `setCustomState({ [key]: value })`；宜搭运行时可能静默白屏。改用 `var obj = {}; obj[key] = value;`
10. **Babel 编译必须使用 `modules: 'commonjs'`**：宜搭运行时用 `new Function()` 评估代码，`export` 语法在其中会报 `SyntaxError`，必须编译为 `exports.xxx = xxx` 格式（详见 [踩坑记录 P-01](references/pitfalls.md)）
11. **`__initMethods__` 必须包含实际编译代码**：不能用占位符 `/*set actions code here*/`，否则所有导出函数都不会绑定到 `this`（详见 [踩坑记录 P-02](references/pitfalls.md)）
12. **`actions.list` 必须包含所有导出函数名**：不能只列默认 6 个方法，必须自动提取所有 `export function` 名称（详见 [踩坑记录 P-03](references/pitfalls.md)）
13. **【强制】代码必须自动发布，禁止要求用户手动复制粘贴**：编写完页面代码后，必须立即调用 `publish-page.js` 脚本将代码自动写入宜搭平台，不得让用户自行打开设计器粘贴代码
14. **【强制】创建自定义页面必须使用 `formType: 'display'`**：宜搭平台创建自定义页面时，`saveFormSchemaInfo` API 的 `formType` 参数必须传 `'display'`，严禁使用 `'page'`。使用 `'page'` 会导致 `getSchemaWithAllNavs` API 返回 500，页面完全空白且无控制台错误（详见 [踩坑记录 P-13](references/pitfalls.md)）

### 重要规则（IMPORTANT）

影响代码质量和用户体验：

1. **代码生成前确认功能摘要**：详见 [编码指南 编注 0](references/coding-guide.md)
2. **pageSize ≤ 100**：分页接口 `searchFormDatas` 等的 `pageSize` 最大 100
3. **didUnmount 清理定时器**：在 `didUnmount` 中清理所有 `setInterval`/`setTimeout`，防止内存泄漏
4. **默认 Tailwind 风格层**：面向用户的自定义页面默认使用 Tailwind utility className 组织视觉层，并默认导入 Tailwind preflight 重置原生控件外观；运行时脚本只允许使用已验证的 `g.alicdn.com` 或企业自托管地址，未配置有效地址时走内联兜底样式
5. **DateField 时间戳格式**：日期字段值必须是时间戳（毫秒），不能是字符串
6. **forceUpdate 后延迟操作 DOM**：`forceUpdate()` 后 DOM 不会立即更新，需 `setTimeout` 延迟访问新 DOM 元素
7. **多端适配**：使用 `this.utils.isMobile()` 判断设备类型，适配 PC 和移动端
8. **输入法组合输入处理**：使用 `_isComposing` 标记配合 `compositionstart`/`compositionend` 事件，避免输入过程中触发提交
9. **iframe 嵌入表单 URL**：数据列表用 `workbench/{formUuid}?iframe=true`，禁止用 `formDetail`
10. **Tabs 显隐控制**：下拉值变更后自动回退到第一个可见 Tab，内容区用 `display: none` 保留 DOM
11. **加载态必须可恢复**：列表/看板页默认保留空态或演示数据；接口失败、超时或返回异常时必须把 `loading` 置回 `false`，不要只渲染"正在加载..."挡住整页
12. **禁止可见原生下拉**：筛选、预约、审批等用户可见下拉交互不要使用 `<select>`；使用 Tailwind className 组合 `button + menu + option` 的自定义下拉组件

> 每条规则的代码示例、反模式和常见错误见 [编码指南](references/coding-guide.md)（编写代码前强制必读）。
> 表单类 JSX 控件、筛选栏、表格、成员/附件等组件写法见 [组件指南](references/component-jsx-guide.md)；未验证的平台组件能力不得编造。

## 链路选择决策（Phase 3 新增）

> 自定义页面有两种编译链路，根据文件扩展名自动选择。

| 条件 | 链路 | 说明 |
|------|------|------|
| `.canvas.jsx` / `.canvas.tsx` | **Canvas 链路（实验性）** | React18 + hooks + antd，崩溃隔离，详见 [Canvas 开发指南](references/canvas-guide.md) |
| `.js` / `.oyd.jsx` / `.jsx`（非 canvas） | **Native 链路（稳定）** | React16 类组件 + `this.utils.yida`，原有流程不受影响 |

**Canvas 适用**：现代 React 交互、hooks 状态、可视化、需要崩溃隔离的页面
**Native 适用**：需要 `this.utils.yida.*` 数据桥、`this.$(fieldId)` 表单字段双向绑定、`dataSourceMap` 的页面

> Canvas 是实验性功能，如遇问题可降级为 Native 链路。

## 适用场景

**正向触发**：
- 开发自定义展示页面（"自定义页面"、"JSX 页面"、"自定义组件"）
- 需要调用 `this.utils.yida.*` 读写表单数据
- 复杂交互逻辑（状态管理、事件处理、动态渲染）
- 自定义页面代码编写、页面交互逻辑实现

**不适用（应使用其他技能）**：

| 场景 | 应使用技能 |
|------|-----------|
| 原生表单页面开发 | `form_creator` |
| 批量表格录入 | `form_creator` |

## 异常处理

| 异常场景 | 处理方式 |
|---------|----------|
| 在 renderJsx 页面里使用了 React Hooks | 改为类组件模式，使用 export function + _customState |
| 字段 ID 不确定 | 读取项目的 `系统配置清单.md` 和 `组件ID清单.md` 获取真实 fieldId |
| `forceUpdate is not a function` | 检查 `this` 绑定，确认方法用 `export function` 定义 |
| API 调用无响应 | 确认 `.catch()` 错误处理，检查登录态 |
| 页面空白 | 检查 `renderJsx` 是否正确导出，查看浏览器控制台；检查是否使用了计算属性名 |
| `.then()` 回调中代码不执行 | 检查是否使用了 `padStart()`/`padEnd()`，改用三元运算符替代 |
| `SyntaxError: Unexpected token 'export'` | Babel 编译必须用 `modules: 'commonjs'`，详见 [踩坑记录 P-01](references/pitfalls.md) |
| `this.__initMethods__ is not a function` | `__initMethods__` 必须包含实际编译代码，详见 [踩坑记录 P-02](references/pitfalls.md) |
| `this.xxx is not a function`（自定义方法） | `actions.list` 必须包含所有导出函数名，详见 [踩坑记录 P-03](references/pitfalls.md) |
| 302 LOGIN FAILED | Cookie 必须包含所有域名，详见 [踩坑记录 P-06](references/pitfalls.md) |
| 保存后 actions 字段丢失 | Schema 结构不完整，详见 [踩坑记录 P-11](references/pitfalls.md) |
| 页面空白且无控制台错误 | `formType` 用了 `'page'` 而非 `'display'`，详见 [踩坑记录 P-13](references/pitfalls.md) |

## 快速开始

以创建「员工信息查询页」为例，完整流程如下：

### Step 1：获取字段 ID

读取项目中的 `系统配置清单.md` 获取应用 ID 和表单 UUID，读取 `组件ID清单.md` 获取字段 ID。

也可以使用 `get-schema` 或 `config-sync` Skill 同步最新的字段信息。

### Step 2：创建页面代码文件

在项目目录下创建页面代码文件：`<应用名称>/05自定义页面/<页面名称>/page-code.js`

### Step 3：编写页面代码

按照 [编码指南](references/coding-guide.md) 编写完整的页面代码，核心结构：

```javascript
var FIELDS = {
  userName: 'textField_xxx',
  department: 'selectField_xxx',
};

var _customState = {
  loading: true,
  list: [],
};

export function getCustomState(key) { /* 传 key 返回单值，不传返回浅拷贝 */ }
export function setCustomState(newState) { /* 合并更新 + this.forceUpdate() */ }
export function forceUpdate() { this.setState({ timestamp: new Date().getTime() }); }

export function didMount() { this.loadData(); }
export function didUnmount() { /* 清理定时器 */ }

export function loadData() { /* this.utils.yida.searchFormDatas(...) */ }

export function renderJsx() {
  var self = this;
  var timestamp = this.state && this.state.timestamp;
  return (
    <div>
      <div style={{ display: 'none' }}>{timestamp}</div>
      {/* 页面内容 */}
    </div>
  );
}
```

### Step 4：自动发布代码到宜搭

> **【强制】代码必须通过 `publish-page.js` 脚本自动发布到宜搭平台，禁止要求用户手动复制粘贴！**
> 发布脚本是本 Skill 的核心能力之一，它会自动完成：页面不存在时自动创建 → Babel 编译 → UglifyJS 压缩 → Schema 构建 → API 保存。

```bash
yida-helper run custom-page/scripts/publish-page.js <代码文件路径> <appType> [formUuid] [页面名称]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| 代码文件路径 | ✅ | JSX 源码文件路径（如 `待办事项管理/05自定义页面/Todolist待办事项/page-code.js`） |
| appType | ✅ | 应用ID（如 `APP_C8U5IYBXYRHUWY0H3GJ8`） |
| formUuid | ❌ | 自定义页面ID（如 `FORM-XXX`），若不提供或页面不存在，脚本会自动创建新页面 |
| 页面名称 | ❌ | 自定义页面名称（默认"自定义页面"） |

**自动创建页面**：当 `formUuid` 未提供或页面不存在时，脚本会调用 `saveFormSchemaInfo` API（`formType: 'display'`）自动创建自定义页面，获取新的 `formUuid` 后继续发布流程。**⚠️ 注意：自定义页面的 formType 必须是 `'display'`，不是 `'page'`！使用 `'page'` 会导致运行时 `getSchemaWithAllNavs` API 返回 500，页面完全空白。**

**前提条件**：
- 项目根目录下存在 `.cookies.json`（有效的宜搭登录态）
- 如果登录态过期（302 错误），需先运行 `yida-helper run api-client/scripts/login_manager.js` 重新登录

**发布成功后**：
- 脚本会输出设计器 URL 和工作台 URL
- 直接访问工作台 URL 即可预览页面效果

## 开发规范

> 编写页面代码前**必须完整阅读** [编码指南](references/coding-guide.md)，包含文件结构模板、状态管理模式、生命周期钩子、全局变量及全部编码注意事项。
> 涉及输入控件、日期、选择、成员/部门、附件、表格或筛选栏时，同时阅读 [组件指南](references/component-jsx-guide.md)。
> 实现 UI 样式时阅读 [设计规范](references/design-system.md)。

## 官方示例模板

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `window.g_config._csrf_token` | `String` | CSRF Token，调用需认证的接口时必须携带 |
| `window.loginUser.userId` | `String` | 当前登录用户的工号 |
| `window.loginUser.userName` | `String` | 当前登录用户的姓名 |
| `this.state.urlParams` | `Object` | 页面 URL 中的查询参数 |

### 编码注意事项

1. **自定义方法必须用 `export function` 定义**：凡是需要在方法内部使用 `this`（包括 `this.utils.yida.*`、`this.setCustomState` 等）的自定义方法，**必须且只能**使用 `export function 方法名() {}` 的形式定义，调用时使用 `this.方法名()`。**禁止**使用 `const fn = () => {}`、`const fn = function() {}` 等形式定义需要访问 `this` 的方法，这些形式无法被宜搭运行时正确绑定 `this`：
   ```javascript
   // ✅ 正确：export function + this.方法名() 调用
   export function didMount() {
     this.loadStatistics();
   }
   export function loadStatistics() {
     this.utils.yida.searchFormDatas({ formUuid: 'FORM-XXX', pageSize: 10 });
   }

   // ❌ 错误①：缺少 export，无法被宜搭运行时识别，this 丢失
   export function didMount() {
     loadStatistics();
   }
   function loadStatistics() {
     this.utils.yida.searchFormDatas(...);  // 报错：this is undefined
   }

   // ❌ 错误②：箭头函数/函数表达式形式，缺少 export，无法被宜搭运行时绑定 this
   const loadStatistics = () => {
     this.utils.yida.searchFormDatas(...);  // 报错：this is undefined
   };
   ```

2. **【严格禁止】事件绑定必须使用箭头函数包裹**：在 `renderJsx` 中绑定任何事件处理器时，先在函数顶部定义 `var self = this`，再使用箭头函数 `(e) => { self.方法名(e) }`。**严禁**直接写 `this.方法名` 或 `.bind(this)` 作为事件处理器：

   ```javascript
   // ✅ 正确：renderJsx 顶部固定 self，箭头函数包裹
   export function renderJsx() {
     var self = this;
     return <button onClick={(e) => { self.handleSubmit(e); }}>提交</button>;
   }

   // ❌ 错误①：直接传方法引用，this 丢失
   export function renderJsx() {
     return <button onClick={this.handleSubmit}>提交</button>;
   }

   // ❌ 错误②：使用 .bind(this) 绑定，不符合规范
   export function renderJsx() {
     return <button onClick={function() { this.handleSubmit(); }.bind(this)}>提交</button>;
   }
   ```

   > **生成代码时的自检清单**：检查 `renderJsx` 中所有 `onClick`、`onChange`、`onSubmit` 等事件属性，确保每一个都是 `(e) => { self.xxx(e) }` 形式，不存在任何 `onClick={this.xxx}` 或 `.bind(this)` 的写法。

   ```javascript
   // ❌ 错误③：在 .map(function(){}) 普通函数回调中使用箭头函数事件处理器，this 已丢失
   export function renderJsx() {
     return (
       <div>
         {quickBtns.map(function(btn, idx) {
           return (
             <button key={idx} onClick={(e) => { this.goToForm(btn.form); }}>
               {btn.label}
             </button>
           );
         })}
       </div>
     );
   }

   // ✅ 正确：.map() 回调必须使用箭头函数，确保 this 正确捕获
   export function renderJsx() {
     var self = this;
     return (
       <div>
         {quickBtns.map((btn, idx) => (
           <button key={idx} onClick={(e) => { self.goToForm(btn.form); }}>
             {btn.label}
           </button>
         ))}
       </div>
     );
   }
   ```

3. **输入法组合输入处理**：使用 `_isComposing` 标记配合 `compositionstart` / `compositionend` 事件
4. **定时器清理**：在 `didUnmount` 中必须清理所有定时器
5. **错误处理**：所有 API 调用必须使用 `.catch()` 处理异常
6. **样式方式**：默认使用 Tailwind utility className 组织视觉层；关键尺寸、容器兜底和 Tailwind 加载失败兜底可继续使用 `style` 对象。CSS 渐变必须使用 `background` 属性，不能使用 `backgroundColor`
7. **异步操作**：可以使用 `async/await` 语法
8. **pageSize 上限**：最大值为 **100**
9. **输入框使用非受控组件**：使用 `defaultValue`，在 `onChange` 中更新 `_customState`
10. **DateField 时间戳格式**：值必须是时间戳（毫秒），不能是字符串
11. **多端适配**：使用 `this.utils.isMobile()` 判断设备类型
12. **清除默认样式**：宜搭自定义页面容器有默认 padding 和圆角，需要强制覆盖
13. **性能优化**：不要在每次 `onChange` 都调用 `setCustomState`，可直接写入 `_customState` 静默更新
14. **forceUpdate() 后的 DOM 渲染时序**：`forceUpdate()` 后同步代码中无法立即访问新渲染的 DOM 元素，需 `setTimeout` 延迟
15. **调试技巧**：`console.log('当前状态:', _customState)` 或 `this.utils.toast({ title: '调试信息', type: 'info' })`
16. **iframe 嵌入表单 URL 规范**：数据管理页用 `workbench/{formUuid}?iframe=true`
17. **下拉选项控制选项卡显隐**：下拉值变更后自动回退到第一个可见 Tab
18. **字段 ID 语义化别名约定**：在文件顶部统一定义 `FIELDS` 常量映射字段别名

## 常见场景示例

- 自定义页面附件上传：见 [AttachmentField 上传指南](references/attachment-upload-guide.md)
- 对应最小代码示例：见 [attachment-upload.js](examples/attachment-upload.js)

## API 速查

### 表单数据（`this.utils.yida.<方法>(params)`）

| 方法 | 说明 | 必填参数 |
|------|------|----------|
| `saveFormData` | 新建实例 | `formUuid`, `appType`, `formDataJson` |
| `updateFormData` | 更新实例 | `formInstId`, `updateFormDataJson` |
| `deleteFormData` | 删除实例 | `formUuid` |
| `getFormDataById` | 查询详情 | `formInstId` |
| `searchFormDatas` | 搜索列表 | `formUuid` |
| `searchFormDataIds` | 搜索 ID 列表 | `formUuid` |

### 流程操作（`this.utils.yida.<方法>(params)`）

| 方法 | 说明 | 必填参数 |
|------|------|----------|
| `startProcessInstance` | 发起流程 | `formUuid`, `processCode`, `formDataJson` |
| `getProcessInstanceById` | 查询流程详情 | `processInstanceId` |
| `getProcessInstances` | 搜索流程列表 | — |

### 工具函数（`this.utils.<方法>()`）

| 方法 | 用途 |
|------|------|
| `toast` | 轻提示 |
| `dialog` | 对话框 |
| `formatter` | 日期/金额格式化 |
| `getLoginUserId` / `getLoginUserName` | 获取当前用户 |
| `isMobile` | 判断移动端 |
| `openPage` | 打开新页面 |
| `router.push` | 路由跳转 |
| `loadScript` | 动态加载脚本 |

### 大模型 AI 接口

| 方法 | 说明 | 调用方式 |
| --- | --- | --- |
| `txtFromAI` | AI 文本生成 | `POST /query/intelligent/txtFromAI.json` |

**主要参数**：`_csrf_token`（CSRF 令牌）、`prompt`（提示词）、`skill`（技能类型，如 `ToText`）、`maxTokens`（最大返回 token 数）

## 参考文档

| 文档 | 覆盖范围 | 何时阅读 |
|------|---------|---------|
| [编码指南](references/coding-guide.md) | 文件结构模板、状态管理、生命周期、编码规范 | 编写任何页面代码前必读 |
| [视觉决策指南](references/visual-decision-guide.md) | 6 步视觉决策法、5 套方向模板、密度配置、导航壳选择、场景级反 AI 味红线 | 编写任何页面代码前必读（编码指南前置步骤） |
| [踩坑记录](references/pitfalls.md) | 所有已知坑点、根因分析、修复方案、排查方法论 | 编写代码前必读 + 每次排查问题后更新 |
| [设计规范](references/design-system.md) | 色彩/圆角/字体/间距系统、组件样式模板、反模式 | 实现 UI 样式时必读 |
| [组件指南](references/component-jsx-guide.md) | JSX 控件写法、筛选栏、表格、成员/附件 | 涉及表单控件时必读 |
| [素材资源](references/assets-guide.md) | 图片/音乐/Icon 素材库、CDN 安全规范 | 需要引入图片、图标、音效时阅读 |
| [附件上传](references/attachment-upload-guide.md) | AttachmentField 上传完整链路 | 需要上传附件时阅读 |
| [Canvas 开发指南](references/canvas-guide.md) | Canvas 编译链路、React18 + hooks、依赖白名单、崩溃隔离 | 开发 .canvas.jsx/.canvas.tsx 页面时阅读 |

### 发布前 Lint 检查（Phase 3 新增）

发布流程会自动执行 lint 检查（lint → 编译 → 压缩 → 发布），检查项从致命规则自动提取：

- **致命错误（FATAL）**：阻断发布，必须修复
- **警告（WARN）**：不阻断，建议修复
- **`--no-lint` 开关**：可完全跳过 lint 检查（不推荐）

单独运行 lint：
```bash
yida-helper run custom-page/scripts/lint-page.js <代码文件路径>
```

## 注意事项

- 本技能不读写 memory，所有页面状态（`_customState`）仅在当前页面会话内有效，刷新页面后重置，不跨会话持久化
- 代码通过 `publish-page.js` 脚本直接发布到宜搭平台，无需手动复制粘贴
- 应用ID和表单UUID必须从 `系统配置清单.md` 读取真实值并直接填入，严禁留占位符
- **发布编译必须使用 CommonJS 格式**：宜搭运行时用 `new Function()` 评估 `actions.module.compiled`，不支持 `export` 语法，因此 Babel 编译必须设置 `modules: 'commonjs'`

---

*v1.3.4 (2026-07-24) — lint-page.js 新增 W07 规则（检测 UI 文案/标题/按钮中的装饰性 emoji，跳过纯注释行，WARN 级不阻断发布）；coding-guide.md 自检清单 E 段补充 emoji 红线*

*v1.3.3 (2026-07-24) — visual-decision-guide.md 新增「场景级反 AI 味红线」一节（工作台/看板/列表/详情/落地页/批量录入 6 类场景的禁止默认脸清单，纯增量，不改动原 6 步法）*

*v1.3.2 (2026-07-24) — coding-guide.md 顶部新增「生成代码前自检清单」（聚合已有硬规则，无新增知识）；design-system.md 新增「原生控件 focus 边框重置」一节*

*v1.3.1 (2026-07-11) — 修复 publish-page.js 无 main 守卫导致 require 时触发 process.exit 的问题，新增 module.exports 导出*

*v1.3.0 (2026-06-02) — 修复 formType 致命错误：自定义页面必须使用 formType:'display'，新增踩坑记录 P-13*
