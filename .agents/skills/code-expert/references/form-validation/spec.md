# 表单校验规范

> 字段校验代码的编写规范
> 版本: v1.1.0

---

## 一、代码结构

### 标准模板
```javascript
/**
 * [字段名称]校验规则
 * 版本号: v1.0.0
 * 代码类型: fieldValidation
 */

function validateRule(value) {
  // 所有校验代码必须放在此函数内部
  
  // 1. 空值校验
  if (!value || value === '') {
    return false;
  }
  
  // 2. 业务校验逻辑
  // ...
  
  return true;
}

/**
 * ===== 宜搭内使用方式 =====
 * 1. 在表单设计器中选中目标字段
 * 2. 打开【校验】面板
 * 3. 选择【自定义校验】选项
 * 4. 粘贴本代码到代码编辑区域
 * 5. 宜搭平台会自动调用 validateRule 函数
 *
 * 代码版本号: v1.0.0
 */
```

---

## 二、必须遵守的规则

### 1. 函数名固定
必须使用 `validateRule(value)` 作为函数名：
```javascript
// ✅ 正确
function validateRule(value) {
  return true;
}

// ❌ 错误
function checkValue(value) {
  return true;
}
```

### 2. 返回布尔值
必须返回 `true`（通过）或 `false`（不通过）：
```javascript
// ✅ 正确
function validateRule(value) {
  if (!value) return false;
  return /^\d{11}$/.test(value);
}

// ❌ 错误
function validateRule(value) {
  if (!value) return '不能为空'; // 返回字符串错误！
  return '通过'; // 返回字符串错误！
}
```

### 3. 所有代码在函数内部
所有代码必须放在 `validateRule` 函数内部：
```javascript
// ✅ 正确
function validateRule(value) {
  var regExp = /^\d{11}$/;
  return regExp.test(value);
}

// ❌ 错误
var regExp = /^\d{11}$/; // 函数外部代码不会执行！
function validateRule(value) {
  return regExp.test(value);
}
```

### 4. 不修改其他字段
校验代码中不应修改其他字段的值：
```javascript
// ❌ 错误
function validateRule(value) {
  this.$('otherField').setValue('xxx'); // 校验中不应修改其他字段！
  return true;
}
```

### 5. 跨字段校验（重要：validateRule 中可使用 this.$ 读取其他字段）

**字段校验函数 `validateRule(value)` 虽然入参只有当前字段值，但函数内部可以使用 `this.$('字段ID').getValue()` 获取表单中其他字段的值，实现跨字段比较校验。**

```javascript
// ✅ 正确：跨字段比较校验（如"出库数量不得大于库存数量"）
function validateRule(value) {
  if (!value || value === '') return true; // 空值跳过
  
  var numValue = parseFloat(value);
  if (isNaN(numValue)) return false;
  
  // 通过 this.$() 获取其他字段的值进行跨字段比较
  try {
    var stockComponent = this.$('numberField_stock'); // 库存数量字段ID
    if (stockComponent) {
      var stockValue = parseFloat(stockComponent.getValue());
      if (!isNaN(stockValue) && numValue > stockValue) {
        return false; // 出库数量大于库存数量，校验不通过
      }
    }
  } catch (e) {
    // 获取其他字段失败时不应阻断校验
    console.error('获取库存数量失败:', e);
  }
  
  return true;
}
```

**关键要点：**
1. **`this.$()` 在 validateRule 中可用** — 证据：错误案例 `Cannot read properties of null (reading 'getValue') at Proxy.validateRule` 证明 this.$ 可用，报错仅是字段ID错误导致组件返回 null
2. **使用 try-catch 包裹** — 防止其他字段组件未加载时阻断校验
3. **先检查组件是否存在**（`if (component)`）再调用 getValue()
4. **只能读取（getValue），不能写入（setValue）** — 校验中修改其他字段值属于违规

---

## 三、常用正则表达式

### 手机号
```javascript
var phoneReg = /^1[3-9]\d{9}$/;
return phoneReg.test(value);
```

### 身份证号
```javascript
var idCardReg = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/;
return idCardReg.test(value);
```

### 邮箱
```javascript
var emailReg = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
return emailReg.test(value);
```

### 数字
```javascript
var numberReg = /^\d+$/;
return numberReg.test(value);
```

### 金额
```javascript
var moneyReg = /^\d+(\.\d{1,2})?$/;
return moneyReg.test(value);
```

---

## 四、复杂校验示例

### 示例1：长度校验
```javascript
function validateRule(value) {
  if (!value) return false;
  
  // 长度必须在 6-20 之间
  var length = value.length;
  return length >= 6 && length <= 20;
}
```

### 示例2：范围校验
```javascript
function validateRule(value) {
  if (!value) return false;
  
  var num = parseFloat(value);
  if (isNaN(num)) return false;
  
  // 数值必须在 0-100 之间
  return num >= 0 && num <= 100;
}
```

### 示例3：日期校验（不能选择未来日期）
```javascript
function validateRule(value) {
  if (!value) return false;
  
  var selectedDate = new Date(value);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return selectedDate <= today;
}
```

---

*文档版本: v1.1.0*

### 版本更新记录

#### v1.1.0 (2026-08-20)
- **新增** 第五条规则「跨字段校验」：明确 `validateRule(value)` 函数内可使用 `this.$('字段ID').getValue()` 获取其他字段值，实现跨字段比较校验（证据来自 `error-guide.md` 案例17 的报错堆栈 `at Proxy.validateRule`）
- **背景**：销售出库"出库数量不得大于库存数量"校验曾因未使用 this.$ 获取库存数量而"校验不生效"（仅做了格式/正数校验）
