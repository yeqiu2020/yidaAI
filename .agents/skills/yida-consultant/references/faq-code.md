# JS 代码类高频问题

> 来源：code-expert/references/common-core/error-guide.md、★宜搭开发参考文档/表单JS代码/

---

## ES6+ 语法不兼容

### 症状

代码在本地能运行，但在宜搭里报语法错误。

### 根因

宜搭表单 JS 运行环境不完全支持 ES6+ 语法。`let`、`const`、箭头函数、模板字符串、解构赋值、`async/await`、可选链 `?.` 等可能不被支持。

### 修复方案

使用 ES5 语法：
- `let`/`const` → `var`
- 箭头函数 `=>` → `function()`
- 模板字符串 `` ` `` → 字符串拼接 `+`
- `async/await` → `Promise.then()`
- 可选链 `?.` → `&&` 短路运算

### 验证方式

调 js-action-tester 创建测试表单，绑定修正后的代码运行验证。

### 参考来源

`.agents/skills/code-expert/references/common-core/syntax-guide.md`

---

## 编辑 API 参数名错误

### 症状

报错："参数校验失败 updateFormDataJson"

### 根因

编辑接口使用了新增的参数名 `formDataJson`，应使用 `updateFormDataJson`。

### 修复方案

```javascript
// 新增 - 用 formDataJson
this.dataSourceMap.add.load({
  formDataJson: JSON.stringify(formData)
});

// 编辑 - 用 updateFormDataJson
this.dataSourceMap.edit.load({
  formInstId: formInstId,
  updateFormDataJson: JSON.stringify(formData)
});
```

### 验证方式

调 js-action-tester 测试编辑功能。

### 参考来源

`.agents/skills/code-expert/references/common-core/error-guide.md`（案例1）

---

## this 指向丢失

### 症状

嵌套函数中 `this.utils` 或 `this.$()` 报错。

### 根因

Promise 回调或 setTimeout 中 `this` 不再指向宜搭组件实例。

### 修复方案

```javascript
export function handleAction(event) {
  var that = this; // 先保存 this 引用
  this.dataSourceMap.query.load({}).then(function(res) {
    that.utils.toast({ type: 'success', title: '成功' });
  });
}
```

### 验证方式

调 js-action-tester 测试含异步操作的代码。

### 参考来源

`.agents/skills/code-expert/references/common-core/error-guide.md`（案例6）

---

## 自动化脚本使用多行注释导致语法错误

### 症状

自动化脚本执行失败，语法错误。

### 根因

宜搭自动化脚本只支持 `//` 单行注释，不支持 `/* */` 多行注释。

### 修复方案

```javascript
// 自动化脚本
// 版本号：v1.0.0
// 注意：只能使用 // 单行注释
```

### 验证方式

修正后重新运行自动化脚本。

### 参考来源

`.agents/skills/code-expert/references/common-core/error-guide.md`（案例5）

---

## 组件存在性检查缺失

### 症状

报错：`Cannot read properties of null (reading 'getValue')` 或 `Cannot read properties of null (reading 'set')`

### 根因

`this.$()` 可能返回 null（字段 ID 错误或组件未加载），未检查就调用方法。

### 修复方案

```javascript
var component = this.$('fieldId');
if (!component) {
  console.error('组件不存在，ID:', 'fieldId');
  return;
}
var value = component.getValue();
```

### 验证方式

调 js-action-tester 测试代码，确认组件 ID 正确。

### 参考来源

`.agents/skills/code-expert/references/common-core/error-guide.md`（案例18）
