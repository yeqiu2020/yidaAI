# 表单校验规范

> 字段校验代码的编写规范
> 版本: v1.0.0

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

*文档版本: v1.0.0*
