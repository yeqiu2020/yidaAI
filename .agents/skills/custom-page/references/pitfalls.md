# 宜搭自定义页面踩坑记录

> **本文件记录开发过程中遇到的所有坑点和解决方案，避免重复踩坑。**
> 每次排查问题后，必须将根因和修复方案追加到此处。
> AI 生成代码前必须检查本文件，确保不重犯已记录的错误。

## 严重程度分级

| 级别 | 含义 | 典型表现 |
|------|------|----------|
| 🔴 **致命** | 页面白屏/崩溃，功能完全不可用 | `export` 语法错误、`__initMethods__` 未注册 |
| 🟠 **严重** | 核心功能异常，但不一定白屏 | API 路径错误、Cookie 缺失 |
| 🟡 **中等** | 部分功能异常，页面可部分使用 | 字段映射错误、样式缺失 |
| 🟢 **轻微** | 体验问题，不影响功能 | 样式不美观、提示文案错误 |

---

## 🔴 P-01：Babel 编译必须使用 CommonJS 格式（`modules: 'commonjs'`）

**发现日期**：2026-05-28
**严重程度**：🔴 致命
**表现**：页面发布成功但白屏，控制台报 `SyntaxError: Unexpected token 'export'`，随后连锁报 `this.__initMethods__ is not a function`

**根因分析**：

宜搭运行时（`render-engine`）使用 `new Function()` 来评估 `actions.module.compiled` 中的代码。`export` 语法只能在 ES Module 环境中使用，在 `new Function()` 创建的函数体内是**无效语法**，直接导致 SyntaxError。

这个 SyntaxError 引发了连锁反应：
1. 模块加载失败 → `__initMethods__` 未被注册为方法
2. 构造函数调用 `this.__initMethods__()` → `TypeError: this.__initMethods__ is not a function`
3. 所有导出函数（`renderJsx`、`didMount` 等）都未绑定到 `this`
4. 页面完全无法渲染，白屏

**错误写法**：
```javascript
// ❌ Babel 编译时 modules: false，保留 ES Module export 语法
var compiledCode = babel.transform(sourceCode, {
  presets: [['env', { targets: { chrome: '49' }, modules: false }], 'react']
});
// 编译结果包含 "export { renderJsx, didMount }" → new Function() 中报 SyntaxError
```

**正确写法**：
```javascript
// ✅ Babel 编译时 modules: 'commonjs'，转换为 exports.xxx = xxx 格式
var compiledCode = babel.transform(sourceCode, {
  presets: [['env', { targets: { chrome: '49' }, modules: 'commonjs' }], 'react']
});
// 编译结果为 "exports.renderJsx = renderJsx; exports.didMount = didMount;" → new Function() 中正常执行
```

**自检规则**：
- `publish-page.js` 中所有 Babel 编译必须使用 `modules: 'commonjs'`
- 禁止使用 `modules: false` 或 `modules: 'amd'` 等非 CommonJS 格式
- 编译后代码中不得出现 `export ` 关键字

---

## 🔴 P-02：`__initMethods__` 必须包含实际编译代码，不能用占位符

**发现日期**：2026-05-28
**严重程度**：🔴 致命
**表现**：页面白屏，所有 `this.xxx()` 调用报 `is not a function`

**根因分析**：

宜搭自定义页面的方法绑定机制：
1. 构造函数 `constructor()` 创建 `module = { exports: {} }`
2. 调用 `this.__initMethods__(module.exports, module)` — 这会执行 `__initMethods__` 中定义的函数，将所有导出方法挂到 `module.exports` 上
3. 遍历 `module.exports` 的所有 key，如果是函数类型，就挂载到 `this`（Page 实例）上

如果 `__initMethods__` 的函数体是占位符 `function (exports, module) { /*set actions code here*/ }`，则 `module.exports` 始终为空对象 `{}`，所有导出函数都不会被绑定到 `this`。

**错误写法**：
```javascript
methods: {
  __initMethods__: {
    type: 'js',
    source: 'function (exports, module) { /*set actions code here*/ }',
    compiled: 'function (exports, module) { /*set actions code here*/ }',
  },
}
```

**正确写法**：
```javascript
// __initMethods__ 的函数体必须是 CommonJS 编译后的实际代码
var commonjsCode = babel.transform(sourceCode, { presets: [['env', { modules: 'commonjs' }], 'react'] });
var initMethodsFunc = 'function (exports, module) {\n' + commonjsCode + '\n}';

methods: {
  __initMethods__: {
    type: 'js',
    source: initMethodsFunc,
    compiled: initMethodsFunc,
  },
}
```

**自检规则**：
- `__initMethods__` 的 `source` 和 `compiled` 必须包含实际的 CommonJS 编译代码
- 禁止使用 `/*set actions code here*/` 等占位符
- `__initMethods__` 的代码内容必须与 `actions.module.compiled` 完全一致（都是 CommonJS 编译结果）

---

## 🔴 P-03：`actions.list` 必须包含所有导出函数名

**发现日期**：2026-05-28
**严重程度**：🔴 致命
**表现**：部分自定义方法无法通过 `this.xxx()` 调用

**根因分析**：

`actions.list` 是方法声明清单，宜搭运行时根据此清单注册方法。如果只列了默认的 6 个方法（`getCustomState`、`setCustomState`、`forceUpdate`、`didMount`、`didUnmount`、`renderJsx`），而源码中定义了 34 个导出函数，那么其余 28 个函数虽然在 `__initMethods__` 中被挂到 `module.exports`，但运行时可能不会正确识别。

**错误写法**：
```javascript
actions: {
  module: { compiled: compiledCode, source: sourceCode },
  type: 'FUNCTION',
  list: [
    { id: 'getCustomState', title: 'getCustomState' },
    { id: 'setCustomState', title: 'setCustomState' },
    { id: 'forceUpdate', title: 'forceUpdate' },
    { id: 'didMount', title: 'didMount' },
    { id: 'didUnmount', title: 'didUnmount' },
    { id: 'renderJsx', title: 'renderJsx' },
    // 缺少 loadAllData, openAddModal, submitAdd 等自定义方法
  ],
}
```

**正确写法**：
```javascript
// 自动从源码提取所有 export function 名称
function extractExportedFunctions(sourceCode) {
  var names = [];
  var regex = /export\s+function\s+(\w+)\s*\(/g;
  var match;
  while ((match = regex.exec(sourceCode)) !== null) {
    names.push(match[1]);
  }
  return names;
}

var actionList = extractExportedFunctions(sourceCode).map(function(name) {
  return { id: name, title: name };
});
```

**自检规则**：
- `actions.list` 必须包含源码中所有 `export function` 的函数名
- 禁止硬编码固定的方法列表
- 发布脚本必须自动提取导出函数名

---

## 🟠 P-04：`saveFormSchema` API 路径必须使用 `/alibaba/web/`

**发现日期**：2026-05-28
**严重程度**：🟠 严重
**表现**：API 返回"表单不存在"错误

**根因分析**：

宜搭平台有两套 API 路径：
- `/dingtalk/web/{appType}/_view/query/formdesign/saveFormSchema.json` — 钉钉集成路径
- `/alibaba/web/{appType}/_view/query/formdesign/saveFormSchema.json` — 阿里云路径

不同环境使用不同路径。当前环境（`qfhefh.aliwork.com`）必须使用 `/alibaba/web/` 路径。

**错误写法**：
```javascript
var savePath = '/dingtalk/web/' + appType + '/_view/query/formdesign/saveFormSchema.json';
```

**正确写法**：
```javascript
var savePath = '/alibaba/web/' + appType + '/_view/query/formdesign/saveFormSchema.json';
```

**自检规则**：
- API 路径前缀从 `.cookies.json` 中的 `base_url` 推导
- `aliwork.com` 域名对应 `/alibaba/web/` 路径
- 如果不确定，先尝试 `/alibaba/web/`，失败再尝试 `/dingtalk/web/`

---

## 🟠 P-05：`saveFormSchema` 必须传 `domainCode` 参数

**发现日期**：2026-05-28
**严重程度**：🟠 严重
**表现**：API 返回参数错误或保存失败

**根因分析**：

`saveFormSchema` 接口需要 `domainCode` 参数来标识应用域。当前环境的 `domainCode` 固定为 `'tEXDRG'`。

**正确写法**：
```javascript
var postData = querystring.stringify({
  _csrf_token: cookieData.csrf_token,
  prefix: '_view',
  content: schemaContent,
  formUuid: formUuid,
  schemaVersion: 'V5',
  domainCode: 'tEXDRG',
  importSchema: 'true',
});
```

**自检规则**：
- `saveFormSchema` 请求必须包含 `domainCode: 'tEXDRG'`
- 必须包含 `importSchema: 'true'`
- 必须包含 `schemaVersion: 'V5'`

---

## 🟠 P-06：Cookie 必须包含所有域名，不能只过滤 `aliwork.com`

**发现日期**：2026-05-28
**严重程度**：🟠 严重
**表现**：API 返回 302 或 LOGIN FAILED

**根因分析**：

宜搭平台的登录态涉及多个域名（`aliwork.com`、`dingtalk.com`、`taobao.com` 等），如果只传递 `aliwork.com` 域名的 Cookie，会缺少关键的认证信息（如 `login_csrf_token` 等），导致请求被重定向到登录页。

**错误写法**：
```javascript
var cookieStr = cookieData.cookies
  .filter(function(c) { return c.domain.indexOf('aliwork') >= 0; })
  .map(function(c) { return c.name + '=' + c.value; })
  .join('; ');
```

**正确写法**：
```javascript
var cookieStr = cookieData.cookies
  .map(function(c) { return c.name + '=' + c.value; })
  .join('; ');
```

**自检规则**：
- HTTP 请求的 Cookie 头必须包含所有域名的 Cookie
- 禁止按域名过滤 Cookie
- 如果出现 302 错误，首先检查 Cookie 是否完整

---

## 🟠 P-07：Schema 中 Jsx 组件的 `render` 必须使用 `type: 'js'` 格式

**发现日期**：2026-05-28
**严重程度**：🟠 严重
**表现**：页面空白，Jsx 组件不渲染

**根因分析**：

Jsx 组件的 `props.render` 有严格的格式要求：
- `type` 必须是 `'js'`（不是 `'JSExpression'`）
- `source` 必须是 `function render() { return this.renderJsx(); }`
- `compiled` 必须是 Babel 编译后的版本，且用 `__compiledFunc__.apply(this, arguments)` 包裹

**错误写法**：
```javascript
render: {
  type: 'JSExpression',
  compiled: 'this.renderJsx.bind(this)()',
  source: 'this.renderJsx()',
}
```

**正确写法**：
```javascript
render: {
  type: 'js',
  compiled: 'function main(){\n    \n    "use strict";\n\nvar __compiledFunc__ = function render() {\n  return this.renderJsx();\n};\n    return __compiledFunc__.apply(this, arguments);\n  }',
  source: 'function render() {\n  return this.renderJsx();\n}',
  error: {},
}
```

**自检规则**：
- Jsx render 的 `type` 必须为 `'js'`
- `source` 固定为 `function render() { return this.renderJsx(); }`
- `compiled` 必须用 `__compiledFunc__.apply(this, arguments)` 包裹
- 必须包含 `error: {}` 字段

---

## 🟠 P-08：`saveFormSchema` 必须传 `appType` 参数

**发现日期**：2026-05-28
**严重程度**：🟠 严重
**表现**：API 返回参数缺失错误

**根因分析**：

`saveFormSchema` 接口需要 `appType` 参数来标识应用类型。虽然 `appType` 已经在 URL 路径中，但请求体中也必须传递。

**自检规则**：
- `saveFormSchema` 请求体必须包含 `appType` 参数
- `appType` 值与 URL 路径中的 `appType` 一致

---

## 🟡 P-09：`modules` 参数的 JavaScript 逻辑陷阱

**发现日期**：2026-05-28
**严重程度**：🟡 中等
**表现**：Babel 编译结果不符合预期

**根因分析**：

当 `moduleType` 参数为 `false` 时，`moduleType || 'commonjs'` 会因为 `false` 是 falsy 值而返回 `'commonjs'`，而不是期望的 `false`。

**错误写法**：
```javascript
var modules = moduleType || 'commonjs';
// 当 moduleType = false 时，modules = 'commonjs'（错误！应该是 false）
```

**正确写法**：
```javascript
var modules = moduleType !== undefined ? moduleType : 'commonjs';
// 当 moduleType = false 时，modules = false（正确）
// 当 moduleType 未传时，modules = 'commonjs'（正确）
```

**自检规则**：
- 当参数可能是 `false`、`0`、`''` 等 falsy 值时，不能用 `||` 设置默认值
- 必须使用 `!== undefined` 或 `!= null` 来判断参数是否传入

---

## 🟡 P-10：自定义页面 formUuid 不存在时需要先创建

**发现日期**：2026-05-28
**严重程度**：🟡 中等
**表现**：保存 Schema 后页面内容为空对象

**根因分析**：

如果传入的 `formUuid` 在宜搭平台上不存在，`saveFormSchema` API 不会报错，但保存的内容无法关联到任何页面，导致页面空白。需要先通过 API 创建自定义页面，获取有效的 `formUuid`，然后再保存 Schema。

**解决方案**：

创建自定义页面使用 `saveFormSchemaInfo` API，`formType` 必须为 `'display'`（不是 `'page'`！）：

```javascript
var createPath = '/alibaba/web/' + appType + '/query/formdesign/saveFormSchemaInfo.json';
var postData = querystring.stringify({
  _csrf_token: csrfToken,
  formType: 'display',
  relateFormType: 'receipt',
  relateFormUuid: '',
  parentNavUuid: '',
  title: JSON.stringify({ zh_CN: pageName, en_US: pageName, type: 'i18n' }),
});
var result = await httpRequest('POST', baseUrl, createPath, postData, cookieStr);
// result.content.formUuid 即为新页面的 formUuid
```

**formType 对照表**：
| formType 值 | 创建类型 |
|-------------|---------|
| `'receipt'` | 普通表单 |
| `'process'` | 流程表单 |
| `'report'` | 报表 |
| `'display'` | 自定义页面（⚠️ 不是 `'page'`！） |

**自检规则**：
- `publish-page.js` 已内置自动创建逻辑，当 `formUuid` 未提供或页面不存在时自动创建
- 创建自定义页面必须使用 `formType: 'display'`，严禁使用 `formType: 'page'`
- 创建后获取新的 `formUuid`，更新本地配置文件

---

## 🟡 P-11：Schema 中 `actions` 字段被 API 丢弃的常见原因

**发现日期**：2026-05-28
**严重程度**：🟡 中等
**表现**：保存后读取 Schema，`actions` 字段不存在

**根因分析**：

当 Schema 结构不正确时，宜搭 API 会静默丢弃 `actions` 字段。常见原因：
1. 缺少 `constructor` 生命周期绑定模板
2. `actions.type` 不是 `'FUNCTION'`
3. `actions.module` 缺少 `compiled` 或 `source`
4. `__initMethods__` 格式不正确

**自检规则**：
- Schema 必须包含完整的 `lifeCycles.constructor`
- `actions.type` 必须为 `'FUNCTION'`
- `actions.module` 必须同时包含 `compiled` 和 `source`
- `__initMethods__` 必须是 `type: 'js'` 且包含实际代码

---

## 排查方法论

当自定义页面出现问题时，按以下顺序排查：

### 1. 检查控制台错误

使用 Playwright 自动化浏览器抓取控制台日志：
```javascript
page.on('console', function(msg) {
  logs.push({ type: msg.type(), text: msg.text() });
});
page.on('pageerror', function(err) {
  logs.push({ type: 'pageerror', text: err.message });
});
```

### 2. 常见错误模式速查

| 错误信息 | 可能原因 | 对应条目 |
|----------|----------|----------|
| `SyntaxError: Unexpected token 'export'` | Babel 编译用了 `modules: false` | P-01 |
| `this.__initMethods__ is not a function` | `__initMethods__` 用了占位符 | P-02 |
| `this.xxx is not a function` | `actions.list` 缺少方法名 | P-03 |
| `表单不存在` | API 路径错误 | P-04 |
| `302 LOGIN FAILED` | Cookie 不完整 | P-06 |
| 页面空白但无报错 | Schema 结构错误 | P-11 |
| 页面空白且 `getSchemaWithAllNavs` 返回 500 | `formType` 用了 `'page'` 而非 `'display'` | P-13 |
| Jsx 组件不渲染 | render 格式错误 | P-07 |

### 3. 验证发布结果

发布后必须验证：
1. 用 Playwright 打开页面，等待 5 秒
2. 检查控制台是否有 ERROR 级别日志
3. 截图确认页面内容正常渲染

---

## 🔴 P-12：禁止要求用户手动复制粘贴代码，必须自动发布

**发现日期**：2026-05-28
**严重程度**：🔴 致命（流程性错误，非技术错误）
**表现**：AI 生成代码后让用户自行打开宜搭设计器粘贴代码，严重影响使用体验

**根因分析**：

本 Skill 自带 `publish-page.js` 发布脚本，可以自动完成 Babel 编译 → UglifyJS 压缩 → Schema 构建 → API 保存的完整流程。让用户手动复制粘贴不仅效率低下，还容易出错（粘贴位置不对、遗漏代码等）。

**错误做法**：
```
AI: "代码已生成，请打开宜搭设计器 → 页面设置 → 页面JS → 粘贴代码"
```

**正确做法**：
```
AI: 编写完代码后，立即执行：
node .agents/skills/custom-page/scripts/publish-page.js <代码文件路径> <appType> <formUuid>
发布成功后告知用户工作台 URL 即可预览
```

**自检规则**：
- 编写完页面代码后，必须立即调用 `publish-page.js` 发布
- 禁止出现"请复制以下代码"、"请粘贴到设计器"等提示
- 发布失败时先排查错误并修复，而不是退回到手动模式
- 只有在发布脚本本身不可用（如 Cookie 过期且无法重新登录）时，才可告知用户手动操作作为临时方案

---

## 🔴 P-13：创建自定义页面必须使用 `formType: 'display'`，严禁使用 `formType: 'page'`

**发现日期**：2026-06-02
**严重程度**：🔴 致命
**表现**：通过 API 创建的自定义页面在工作台/预览 URL 完全空白，`<div id="App"></div>` 为空，无控制台错误

**根因分析**：

宜搭平台创建自定义页面时，`saveFormSchemaInfo` API 的 `formType` 参数必须传 `'display'`，而不是直觉上的 `'page'`。

当使用 `formType: 'page'` 创建时：
1. `saveFormSchemaInfo` API 本身不会报错，会成功返回 `formUuid`
2. `saveFormSchema` API 也能正常保存 Schema 数据
3. `getFormSchema` API 能正常读取 Schema 数据
4. **但**运行时渲染引擎调用 `getSchemaWithAllNavs.json` API 时返回 **500 错误**
5. 页面完全空白，`<div id="App"></div>` 为空，无任何控制台错误

这是因为宜搭运行时渲染流程：`getSchemaWithAllNavs` → 渲染引擎渲染。当此 API 返回 500 时，渲染引擎拿不到 Schema，页面自然空白。

**证据**：
- 通过 Playwright 拦截宜搭 UI 创建自定义页面的网络请求，发现 UI 使用 `formType=display`
- UI 中"新建自定义页面"菜单项的 CSS 类名为 `J_SaaS_display`
- `getSchemaWithAllNavs` 对 `formType=display` 的页面返回成功 ✅
- `getSchemaWithAllNavs` 对 `formType=page` 的页面返回 500 ❌
- `getSchemaWithAllNavs` 对 `formType=receipt` 的普通表单返回成功 ✅

**错误写法**：
```javascript
var postData = querystring.stringify({
  _csrf_token: csrfToken,
  formType: 'page',  // ❌ 错误！导致运行时 getSchemaWithAllNavs 返回 500
  title: JSON.stringify({ zh_CN: pageName, en_US: pageName }),
});
```

**正确写法**：
```javascript
var postData = querystring.stringify({
  _csrf_token: csrfToken,
  formType: 'display',  // ✅ 正确！宜搭自定义页面的真实 formType
  relateFormType: 'receipt',
  relateFormUuid: '',
  parentNavUuid: '',
  title: JSON.stringify({ zh_CN: pageName, en_US: pageName, type: 'i18n' }),
});
```

**自检规则**：
- 创建自定义页面时，`formType` 必须为 `'display'`，严禁使用 `'page'`
- `title` 必须包含 `type: 'i18n'` 字段
- 必须传递 `relateFormType: 'receipt'` 参数
- 发布后必须验证 `getSchemaWithAllNavs` API 返回成功
- 如果页面空白且无控制台错误，首先检查 `formType` 是否正确

---

## 🔴 P-14：searchFormDatas 响应数据结构不固定 — 致命

**发现日期**：2026-06-02
**严重程度**：🔴 致命
**表现**：API 调用成功但页面显示"暂无数据"，控制台无报错

**根因分析**：

宜搭 `searchFormDatas` API 的响应数据结构在不同环境/版本中可能不一致：
- 有的环境返回 `res.data`（直接数组）
- 有的环境返回 `res.data.data`（嵌套数组）
- 有的环境返回 `res.data.result` 或 `res.data.list`

如果代码只处理一种结构，在其他环境中就会解析不到数据。

**错误写法**：
```javascript
// ❌ 只处理 res.data.data 一种结构
var list = res.data.data.map(function(item) { ... });
// 当 res.data 直接是数组时，res.data.data 为 undefined，.map() 报错
```

**正确写法**：
```javascript
// ✅ 兼容多种数据结构
var rawList = [];
if (res && res.data) {
  if (Array.isArray(res.data)) {
    rawList = res.data;
  } else if (res.data.data && Array.isArray(res.data.data)) {
    rawList = res.data.data;
  } else if (res.data.result && Array.isArray(res.data.result)) {
    rawList = res.data.result;
  } else if (res.data.list && Array.isArray(res.data.list)) {
    rawList = res.data.list;
  }
}
```

**自检规则**：
- 解析 `searchFormDatas` 响应时必须兼容 `res.data`、`res.data.data`、`res.data.result`、`res.data.list` 四种结构
- 必须在 `.then()` 回调中添加 `console.log` 打印原始响应，便于调试
- 如果页面显示"暂无数据"但 API 无报错，首先怀疑数据结构不匹配

---

## 🟠 P-15：CATEGORY_CONFIG / 颜色映射字典必须包含所有可能的键值

**发现日期**：2026-06-02
**严重程度**：🟠 严重
**表现**：页面报错 `Cannot read properties of undefined (reading 'color')`

**根因分析**：

在渲染分类标签或筛选按钮时，遍历的数组中包含某个键值，但对应的配置字典中缺少该键，导致 `config` 为 `undefined`，后续访问 `config.color` 时报错。

**错误写法**：
```javascript
var CATEGORY_CONFIG = {
  '个人': { color: '#1677FF', ... },
  '工作': { color: '#FA8C16', ... },
};

// 遍历包含 '全部'，但字典中没有 '全部'
{['全部', '个人', '工作'].map(function(cat) {
  var config = CATEGORY_CONFIG[cat];  // '全部' → undefined
  return <span style={{ color: config.color }}>...</span>;  // ❌ 报错
})}
```

**正确写法**：
```javascript
var CATEGORY_CONFIG = {
  '全部': { color: '#1D2129', bg: '#F2F3F5', border: '#E5E6EB', icon: '📋' },
  '个人': { color: '#1677FF', bg: '#E6F4FF', border: '#91CAFF', icon: '👤' },
  '工作': { color: '#FA8C16', bg: '#FFF7E6', border: '#FFD591', icon: '💼' },
};

// 使用默认值兜底
var config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['其他'];
```

**自检规则**：
- 配置字典必须包含遍历数组中的所有键值
- 访问字典时必须有默认值兜底（`|| fallback`）
- 新增选项时必须同步更新配置字典

---

## 🔴 P-16：JSX 源码中即使修复了计算属性名，Babel 编译后的代码仍可能包含

**发现日期**：2026-06-02
**严重程度**：🔴 致命
**表现**：页面空白，didMount 不执行，控制台无错误

**根因分析**：

Babel 编译 JSX 时，会将 JSX 表达式转换为 JavaScript 对象。如果在 JSX 中使用了动态属性名，Babel 可能在编译后的代码中生成 ES6 计算属性名 `{ [key]: value }`。

例如，JSX 中的 `style={{ [colorKey]: value }}` 会被 Babel 编译为包含计算属性名的对象字面量。

**错误写法**：
```jsx
// ❌ JSX 中使用了动态样式属性名
<div style={{ [dynamicKey]: '10px' }}>...</div>
```

**正确写法**：
```jsx
// ✅ 提前构造样式对象
var styleObj = {};
styleObj[dynamicKey] = '10px';
return <div style={styleObj}>...</div>;
```

**自检规则**：
- JSX 中 `style={}` 的值必须是预先构造好的对象，不能包含计算属性名
- 编译后代码中搜索 `\[` 确认没有计算属性名
- 发布后用 Playwright 验证 didMount 是否执行

---

## 🔴 P-17：`.then()` 回调中不得使用可能抛异常的调试代码，否则整个 Promise 链中断

**发现日期**：2026-06-02
**严重程度**：🔴 致命
**表现**：API 调用成功但后续代码不执行，页面无数据加载，控制台无错误

**根因分析**：

宜搭自定义页面的代码运行在 `new Function()` 环境中，错误处理机制与常规浏览器环境不同。当 `.then()` 回调中的某行代码抛出异常时：
1. 异常不会冒泡到浏览器控制台（被运行时捕获）
2. `.catch()` 如果没有覆盖该异常，整个 Promise 链中断
3. 后续代码（如状态更新、数据渲染）完全不执行

最常见的触发场景：在 `.then()` 中使用 `JSON.stringify(res)` 打印调试日志，当 `res` 包含循环引用或大数据量时，`JSON.stringify` 抛出异常。

**错误写法**：
```javascript
// ❌ JSON.stringify 可能抛异常，导致整个 then 回调中断
this.utils.yida.searchFormDatas(params)
  .then(function(res) {
    console.log(JSON.stringify(res));  // 抛异常 → 后续代码全部不执行
    var list = res.data.map(...);      // 这行永远不会执行
    self.setCustomState({ activeTodos: list });
  });
```

**正确写法**：
```javascript
// ✅ 使用简单值打印，或完全不在 then 中打印
this.utils.yida.searchFormDatas(params)
  .then(function(res) {
    var rawList = [];
    if (res && res.data) {
      if (Array.isArray(res.data)) rawList = res.data;
      else if (res.data.data && Array.isArray(res.data.data)) rawList = res.data.data;
    }
    // console.log 只打印安全值
    console.log('数据条数: ' + rawList.length);
    self.setCustomState({ activeTodos: list });
  });
```

**自检规则**：
- `.then()` 回调中严禁使用 `JSON.stringify` 打印完整响应对象
- 如需调试，只打印 `length`、`id` 等简单值
- 调试代码应放在 `.then()` 之外或确保不会抛异常
- 如果页面数据加载失败但 API 无报错，检查 `.then()` 中是否有异常代码
