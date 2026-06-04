# 宜搭自定义页面编码指南

> **以下规范是编写宜搭自定义页面代码的核心约束，必须严格遵守。**

## 运行环境与约束

宜搭自定义页面的 JSX 组件本质上是 **React 类组件中的 render 方法**，而非独立的 React 组件。因此存在以下关键约束：

| 约束 | 说明 |
| --- | --- |
| **React 版本** | 宜搭运行时是 **React 16 类组件模型**。禁止使用 Hooks（useState/useEffect/useRef 等） |
| **单文件** | 所有代码写在一个文件中 |
| **三方包引入** | 禁止使用 `import/require` 语法，如需使用第三方库，必须通过 `this.utils.loadScript` 加载 CDN 脚本 |
| **内置 lodash** | 宜搭页面运行时已全局加载 **lodash 4.6.1**（`window._`），可直接使用 `_.get`、`_.groupBy`、`_.cloneDeep` 等，无需 `loadScript` |
| **函数导出格式** | 使用 `export function xxx() {}` 格式定义所有需要 `this` 的方法（源码层面）；**发布时 Babel 编译必须使用 `modules: 'commonjs'`**，因为宜搭运行时用 `new Function()` 评估代码，不支持 `export` 语法 |
| **样式** | 默认使用 Tailwind utility `className` 组织视觉层；关键尺寸、容器兜底和 Tailwind 加载失败兜底可继续使用 `style` 对象。禁止 `import` CSS |
| **`this` 上下文** | 所有导出函数中的 `this` 指向宜搭页面的 React 类实例 |
| **禁止使用 `this.setState` 管理业务状态** | `this.setState` 已被覆盖，仅用于 `forceUpdate`（通过更新 `timestamp`） |
| **JavaScript 版本** | 使用 ES2015 (ES6) 语法，不能高于 ES2015 版本。**注意**：即使是 ES6 语法，部分特性也会导致静默失败，详见下方「JS 引擎兼容性限制」 |
| **必须定义页面入口** | 必须定义 `renderJsx` |

---

## Tailwind 引入规范

自定义页面没有本地构建链路，不能像普通 React 项目一样 `import './tailwind.css'`。默认使用 Tailwind utility className 组织视觉层；运行时脚本只能来自已验证的 `g.alicdn.com` 或企业自托管地址。

### 推荐策略

| 方式 | 适用场景 | 约束 |
| --- | --- | --- |
| 页面内 `loadScript` 固定版本 | 默认生成、自定义页面快速交付 | 默认使用已验证的 `g.alicdn.com` 地址；加载失败必须有基础样式兜底 |

### 运行时代码模板

```javascript
var TAILWIND_CDN = 'https://g.alicdn.com/code/lib/tailwindcss-browser/0.0.0-insiders.fed6c6a/index.global.min.js';

export function ensureTailwind() {
  var self = this;

  if (window.__tailwindReady) {
    return Promise.resolve();
  }
  if (window.__tailwindLoading) {
    return window.__tailwindLoading;
  }

  if (!TAILWIND_CDN) {
    self.injectTailwindFallback();
    return Promise.resolve();
  }

  self.injectTailwindSource();

  window.__tailwindLoading = self.utils.loadScript(TAILWIND_CDN)
    .then(function() {
      window.__tailwindReady = true;
      self.forceUpdate();
    })
    .catch(function() {
      window.__tailwindFailed = true;
      self.injectTailwindFallback();
      self.forceUpdate();
    });

  return window.__tailwindLoading;
}

export function injectTailwindSource() {
  if (document.getElementById('tailwind-source')) {
    return;
  }

  var style = document.createElement('style');
  style.id = 'tailwind-source';
  style.type = 'text/tailwindcss';
  style.innerHTML = [
    '@import "tailwindcss/theme";',
    '@import "tailwindcss/preflight";',
    '@import "tailwindcss/utilities";',
    '@theme { --color-brand: #2F6FED; }',
  ].join('\n');
  document.head.appendChild(style);
}

export function injectTailwindFallback() {
  if (document.getElementById('tailwind-fallback')) {
    return;
  }

  var style = document.createElement('style');
  style.id = 'tailwind-fallback';
  style.innerHTML = [
    '.cp-btn,.cp-select-trigger,.cp-select-option{appearance:none;-webkit-appearance:none;font-family:inherit;}',
    '.cp-btn{height:36px;border-radius:6px;border:1px solid #D0D5DD;background:#fff;padding:0 12px;font-size:14px;cursor:pointer;}',
    '.cp-btn-primary{background:#2F6FED;border-color:#2F6FED;color:#fff;}',
    '.cp-select-trigger{height:38px;border-radius:6px;border:1px solid #D0D5DD;background:#fff;padding:0 12px;font-size:14px;text-align:left;box-shadow:0 6px 14px rgba(15,23,42,.06);}',
    '.cp-select-menu{position:absolute;z-index:30;margin-top:6px;width:100%;padding:6px;border:1px solid #E4E7EC;border-radius:10px;background:#fff;box-shadow:0 16px 32px rgba(16,24,40,.14);}',
    '.cp-select-option{width:100%;min-height:36px;border:0;border-radius:8px;background:#fff;padding:0 10px;text-align:left;font-size:14px;cursor:pointer;}',
    '.cp-select-option-active{background:#EFF6FF;color:#1D4ED8;font-weight:600;}',
  ].join('');
  document.head.appendChild(style);
}

export function didMount() {
  this.ensureTailwind();
  this.loadData();
}
```

### 生成约束

1. Tailwind URL 必须写成常量，只能填写已验证的 `g.alicdn.com`、企业 OSS/CDN 或自托管地址
2. 禁止默认写海外 CDN；如果目标环境不能访问默认 `g.alicdn.com` 地址，替换为企业自托管地址，或保留空字符串并依赖 fallback 样式
3. 使用 `@tailwindcss/browser` 时，通过 `style[type="text/tailwindcss"]` 默认导入 `tailwindcss/theme`、`tailwindcss/preflight` 和 `tailwindcss/utilities`
4. `className` 使用完整静态类名字符串；不要拼 `bg-` + color 这类动态类名
5. Tailwind 加载失败时仍要能看到可用页面：关键容器保留 `style` 兜底，通用按钮/下拉增加 `cp-*` fallback class
6. 用户可见的下拉、菜单、分段控件默认用 Tailwind 自定义组件；不要用原生 `<select>`

---

## 内置 lodash 使用指引

宜搭页面运行时已全局加载 **lodash 4.6.1**（CDN: `https://g.alicdn.com/platform/c/lodash/4.6.1/lodash.min.js`），通过 `window._` 直接可用，**无需 `this.utils.loadScript` 加载**。

### 推荐使用场景

| 需求 | lodash 写法 | 替代的手写写法 |
| --- | --- | --- |
| 按字段分组 | `_.groupBy(list, 'type')` | 手写 `reduce` + 对象累加 |
| 去重 | `_.uniq(arr)` / `_.uniqBy(arr, 'id')` | 手写 `filter` + `indexOf` |
| 安全取值 | `_.get(obj, 'a.b.c', defaultVal)` | 多层 `&&` 判断 |
| 安全赋值 | `_.set(obj, 'a.b.c', val)` | 逐层判断并创建对象 |
| 深拷贝 | `_.cloneDeep(obj)` | `JSON.parse(JSON.stringify(obj))` |
| 排序 | `_.sortBy(list, 'date')` | 手写 `sort` 比较函数 |
| 扁平化 | `_.flatten(arr)` / `_.flattenDeep(arr)` | 手写递归 concat |
| 对象 pick/omit | `_.pick(obj, ['a','b'])` / `_.omit(obj, ['c'])` | 手写循环复制 |
| 防抖/节流 | `_.debounce(fn, 300)` / `_.throttle(fn, 300)` | 手写 `setTimeout` 管理 |
| 按键索引 | `_.keyBy(list, 'id')` | 手写 `reduce` 构建 map |

### 注意事项

1. **版本是 4.6.1**，不是最新版，但常用 API 均已支持
2. **直接用 `_` 即可**，不需要声明 `var _ = window._`（已是全局变量）
3. 不要把 lodash 和「计算属性名」禁令搞混——`_.groupBy` 返回的对象用方括号**读取**属性是安全的，禁止的是**字面量**中的 `{ [key]: value }` 写法

```javascript
// ✅ 正确：lodash groupBy + 方括号读取
var grouped = _.groupBy(orders, 'status');
var pendingOrders = grouped['待审批'] || [];

// ✅ 正确：安全取值
var city = _.get(record, 'formData.addressField.city', '未知');

// ✅ 正确：深拷贝
var snapshot = _.cloneDeep(_customState);
```

---

## ⚠️ JS 引擎兼容性限制（静默失败，极难排查）

宜搭自定义页面的 JS 引擎存在以下已知兼容性问题，**所有问题均无控制台报错**，必须严格规避：

### 1. 禁止使用 ES6 计算属性名 `{ [key]: value }` — 阻塞

使用计算属性名会导致**整个模块加载失败**，`didMount` 不执行，页面空白，控制台无任何错误信息。

```javascript
// ❌ 严禁：计算属性名，导致模块加载失败
var obj = { [fieldId]: value };
searchFieldJson: JSON.stringify({ [FIELDS.department]: '研发部' });
this.setCustomState({ [key]: value });

// ✅ 正确：ES5 写法
var obj = {};
obj[fieldId] = value;

var searchCondition = {};
searchCondition[FIELDS.department] = '研发部';
searchCondition[FIELDS.status] = '待审批';
searchFieldJson: JSON.stringify(searchCondition);

var nextState = {};
nextState[key] = value;
this.setCustomState(nextState);
```

### 2. 禁止在 `.then()` 回调中使用 `String.padStart()` — 严重

在 `.then()` 回调中调用含 `padStart()` 的函数，回调会在该行**静默中断**，后续代码均不执行，控制台无报错。

```javascript
// ❌ 严禁：padStart 在 .then() 回调中静默中断
.then(function(res) {
  var month = String(date.getMonth() + 1).padStart(2, '0');  // 此行之后代码不执行
  self.processData(res);  // 永远不会执行
});

// ✅ 正确：用三元运算符替代 padStart
.then(function(res) {
  var month = date.getMonth() + 1;
  var monthStr = month < 10 ? '0' + month : '' + month;
  self.processData(res);
});
```

> **自检规则**：生成代码时，检查所有动态对象构造和 `.then(function(res) { ... })` 回调，确保：① 无计算属性名；② 无 `padStart`/`padEnd`。

### 3. 发布编译必须使用 CommonJS 格式 — 致命

宜搭运行时（`render-engine`）使用 `new Function()` 评估 `actions.module.compiled` 中的代码。`export` 语法只能在 ES Module 环境中使用，在 `new Function()` 创建的函数体内是**无效语法**，直接导致 `SyntaxError: Unexpected token 'export'`，页面白屏。

```javascript
// ❌ 严禁：Babel 编译时 modules: false，保留 export 语法
babel.transform(sourceCode, {
  presets: [['env', { targets: { chrome: '49' }, modules: false }], 'react']
});
// 编译结果包含 "export { renderJsx, didMount }" → new Function() 中报 SyntaxError

// ✅ 正确：Babel 编译时 modules: 'commonjs'
babel.transform(sourceCode, {
  presets: [['env', { targets: { chrome: '49' }, modules: 'commonjs' }], 'react']
});
// 编译结果为 "exports.renderJsx = renderJsx;" → new Function() 中正常执行
```

> **详细根因分析和连锁反应**见 [踩坑记录 P-01](pitfalls.md)。

---

## 文件结构

**一个完整的宜搭自定义页面源文件必须包含：**
- `_customState` 变量
- getCustomState 函数
- setCustomState 函数
- forceUpdate 函数
- didMount 函数
- didUnmount 函数
- renderJsx 函数

```jsx
// ── 字段映射 ──────────────────────────────────────────
var FIELDS = {
  // 从系统配置清单.md / 组件ID清单.md 获取真实 fieldId
  userName: 'textField_xxx',
  department: 'selectField_xxx',
};

// ── 状态管理 ──────────────────────────────────────────
var _customState = {
  loading: true,
  list: [],
};

export function getCustomState(key) {
  if (key) {
    return _customState[key];
  }
  var copy = {};
  Object.keys(_customState).forEach(function(k) {
    copy[k] = _customState[k];
  });
  return copy;
}

export function setCustomState(newState) {
  Object.keys(newState).forEach(function(key) {
    _customState[key] = newState[key];
  });
  this.forceUpdate();
}

export function forceUpdate() {
  this.setState({ timestamp: new Date().getTime() });
}

// ── 生命周期 ──────────────────────────────────────────
export function didMount() {
  this.loadData();
}

export function didUnmount() {
  // 清理所有定时器
}

// ── 业务方法（必须用 export function）─────────────────
export function loadData() {
  var self = this;
  this.utils.yida.searchFormDatas({
    formUuid: 'FORM-XXX',
    pageSize: 20,
    currentPage: 1,
  }).then(function(res) {
    var list = (res.data || []).map(function(item) {
      return item;
    });
    self.setCustomState({ list: list, loading: false });
  }).catch(function(err) {
    self.utils.toast({ title: '加载失败: ' + (err.message || err), type: 'error' });
    self.setCustomState({ loading: false });
  });
}

// ── 渲染（页面入口）──────────────────────────────────
export function renderJsx() {
  var self = this;
  var state = this.getCustomState();
  var timestamp = this.state && this.state.timestamp;

  return (
    <div>
      <div style={{ display: 'none' }}>{timestamp}</div>
      {/* 页面内容 */}
    </div>
  );
}
```

---

## 状态管理使用方式

```javascript
// 获取全部状态（返回浅拷贝）
var state = this.getCustomState();

// 获取单个状态值
var count = this.getCustomState('count');

// 设置状态并自动触发重新渲染
this.setCustomState({ count: count + 1, loading: true });

// 仅触发重新渲染（不修改状态）
this.forceUpdate();
```

---

## 生命周期钩子

| 钩子函数 | 触发时机 | 典型用途 |
| --- | --- | --- |
| `didMount()` | 页面 DOM 加载渲染完毕 | 初始化数据加载、启动定时器、绑定事件、加载 Tailwind |
| `didUnmount()` | 页面节点从 DOM 移除 | 清理 `setInterval` / `setTimeout`、解绑事件 |

---

## 全局变量

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `window.g_config._csrf_token` | `String` | CSRF Token，调用需认证的接口时必须携带 |
| `window.loginUser.userId` | `String` | 当前登录用户的工号 |
| `window.loginUser.userName` | `String` | 当前登录用户的姓名 |
| `this.state.urlParams` | `Object` | 页面 URL 中的查询参数 |

---

## 编码注意事项

### 编注 0：代码生成前确认功能摘要

生成页面代码前，AI 必须先向用户展示以下内容并获得确认：

1. **功能摘要**：页面的核心功能列表（如"筛选 + 列表 + 详情跳转"）
2. **关键配置**：使用的 formUuid、FIELDS 映射、API 调用方式
3. **交互设计**：主要用户操作流程

确认后再开始编码，避免大量返工。

### 1. 自定义方法必须用 `export function` 定义

凡是需要在方法内部使用 `this`（包括 `this.utils.yida.*`、`this.setCustomState` 等）的自定义方法，**必须且只能**使用 `export function 方法名() {}` 的形式定义，调用时使用 `this.方法名()`。

### 2.【严格禁止】事件绑定必须使用箭头函数包裹

在 `renderJsx` 中绑定任何事件处理器时，推荐先在函数顶部定义 `var self = this`，再使用箭头函数 `(e) => { self.方法名(e) }`。

### 3. 输入法组合输入处理

使用 `_isComposing` 标记配合 `compositionstart` / `compositionend` 事件，正确处理中文输入法的组合输入状态。

### 4. 定时器清理

在 `didUnmount` 中必须清理所有通过 `setInterval` / `setTimeout` 创建的定时器，防止内存泄漏。

### 5. 错误处理

所有 API 调用（`this.utils.yida.*`、`fetch`）必须使用 `.catch()` 处理异常。列表、工作台、看板页面不要让首屏只依赖线上接口成功。默认状态应提供空态或演示数据。

### 6. 样式方式

默认使用 Tailwind utility className 组织视觉层；关键尺寸、容器兜底和 Tailwind 加载失败兜底可继续使用 `style` 对象。详细的设计系统和组件样式模板见 [设计规范](design-system.md)。

### 7. 异步操作

可以使用 `async/await` 语法，Babel 编译会自动转换为 ES5 兼容代码。

### 8. pageSize 上限

调用 `searchFormDatas`、`searchFormDataIds`、`getProcessInstances`、`getProcessInstanceIds` 等分页接口时，`pageSize` 最大值为 **100**。

### 9. 输入框使用非受控组件

```javascript
// ❌ 错误：受控组件
<input value={userAnswer} onChange={function(e) { this.setCustomState({ userAnswer: e.target.value }); }} />

// ✅ 正确：非受控组件
<input id="my-input" defaultValue="" onChange={function(e) { _customState.userAnswer = e.target.value; }} />

// 需要清空时通过 DOM 操作
var inputEl = document.getElementById("my-input");
if (inputEl) { inputEl.value = ""; }
```

### 10. DateField 时间戳格式

```javascript
// ❌ 错误：字符串格式
dateField_xxx: '2024-01-15'

// ✅ 正确：时间戳格式
dateField_xxx: new Date().getTime()
```

### 10.1 AttachmentField 上传不是直接写 File

详见：[AttachmentField 上传指南](./attachment-upload-guide.md)

### 11. 多端适配

```javascript
var isMobile = this.utils.isMobile();
var styles = {
  container: { padding: isMobile ? '12px' : '16px', minHeight: '100vh' },
  card: { padding: isMobile ? '12px' : '16px', marginBottom: isMobile ? '8px' : '12px' },
};
```

### 12. 清除默认样式

```javascript
var styles = {
  container: { padding: '0 16px', borderRadius: '0 !important', minHeight: '100vh' },
};
```

### 13. 性能优化

- 不要在每次 `onChange` 都调用 `setCustomState`，可直接写入 `_customState` 静默更新
- 只在需要触发重渲染时才调用 `forceUpdate`
- 在 `renderJsx` 顶部定义事件处理函数，避免每次渲染都创建新的内联函数

### 14. forceUpdate() 后的 DOM 渲染时序

```javascript
// ❌ 错误：forceUpdate 后立即操作新 DOM
_customState.loading = false;
self.forceUpdate();
var container = document.getElementById('my-chart');  // null！

// ✅ 正确：延迟一帧等待 React 完成 DOM 更新
_customState.loading = false;
self.forceUpdate();
setTimeout(function () {
  var container = document.getElementById('my-chart');
  if (container) { /* 初始化图表等操作 */ }
}, 100);
```

### 15. 调试技巧

```javascript
console.log('当前状态:', _customState);
this.utils.toast({ title: '调试信息', type: 'info' });
```

### 16. iframe 嵌入表单 URL 规范

| 场景 | URL 格式 |
|------|----------|
| 表单提交页 | `{base_url}/{appType}/submission/{formUuid}` |
| 数据管理页（列表） | `{base_url}/{appType}/workbench/{formUuid}?iframe=true` |
| 数据管理页（指定视图） | `{base_url}/{appType}/workbench/{formUuid}?viewUuid={viewUuid}&iframe=true` |

### 17. 下拉选项控制选项卡显隐

- 用 `_customState.selectedType` 记录下拉选中值
- 用 `_customState.activeTab` 记录当前激活的 Tab
- 下拉值变更后，若当前激活的 Tab 被隐藏，自动回退到第一个可见 Tab
- Tab 内容区使用 `display: none` 而非条件渲染，保留 DOM 避免 iframe 重复加载

### 18. 字段 ID 语义化别名约定

```javascript
// ✅ 推荐：在文件顶部统一定义字段别名
var FIELDS = {
  userName: 'textField_k8j2n3m4',
  department: 'selectField_a3b9c1d2',
  applyDate: 'dateField_x7y2z5w1',
  amount: 'numberField_p4q8r3s6',
  status: 'radioField_m1n5o9p3',
  remark: 'textareaField_v2w6x1y4',
};

// ✅ 使用别名引用字段，代码清晰易读
var searchCondition = {};
searchCondition[FIELDS.department] = '研发部';
searchCondition[FIELDS.status] = '待审批';
this.utils.yida.searchFormDatas({
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify(searchCondition),
  currentPage: 1,
  pageSize: 20,
});
```

**AI 生成代码时的规则**：
1. 获取表单 Schema 后，**必须先在文件顶部定义 `FIELDS` 常量**
2. 后续所有代码中**禁止直接写字段 ID 字符串**，统一通过 `FIELDS.xxx` 引用
3. `FIELDS` 的 key 使用 camelCase 命名，与字段的中文含义对应
