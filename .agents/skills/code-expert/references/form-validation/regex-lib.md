# 常用正则表达式库

> 字段校验中常用的正则表达式
> 版本: v1.0.0

---

## 一、手机号

```javascript
// 中国大陆手机号（11位，1开头，第二位3-9）
var phoneReg = /^1[3-9]\d{9}$/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /^1[3-9]\d{9}$/.test(value);
}
```

---

## 二、身份证号

```javascript
// 15位或18位身份证号
var idCardReg = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(value);
}
```

---

## 三、邮箱

```javascript
// 标准邮箱格式
var emailReg = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
}
```

---

## 四、数字

```javascript
// 正整数
var positiveIntReg = /^\d+$/;

// 整数（包含负数）
var intReg = /^-?\d+$/;

// 小数（最多2位）
var decimalReg = /^\d+(\.\d{1,2})?$/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /^\d+(\.\d{1,2})?$/.test(value); // 最多2位小数
}
```

---

## 五、金额

```javascript
// 金额（最多2位小数，必须大于0）
var moneyReg = /^[1-9]\d*(\.\d{1,2})?$/;

// 金额（可以为0）
var moneyZeroReg = /^\d+(\.\d{1,2})?$/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /^[1-9]\d*(\.\d{1,2})?$/.test(value);
}
```

---

## 六、中文

```javascript
// 纯中文
var chineseReg = /^[\u4e00-\u9fa5]+$/;

// 中文和数字
var chineseNumReg = /^[\u4e00-\u9fa5\d]+$/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /^[\u4e00-\u9fa5]+$/.test(value);
}
```

---

## 七、英文

```javascript
// 纯英文
var englishReg = /^[a-zA-Z]+$/;

// 英文和数字
var englishNumReg = /^[a-zA-Z0-9]+$/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /^[a-zA-Z]+$/.test(value);
}
```

---

## 八、日期

```javascript
// 日期格式：YYYY-MM-DD
var dateReg = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// 日期时间格式：YYYY-MM-DD HH:mm:ss
var dateTimeReg = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

// 使用示例
function validateRule(value) {
  if (!value) return false;
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
}
```

---

## 九、特殊格式

### 邮政编码
```javascript
var zipCodeReg = /^\d{6}$/;
```

### 银行卡号
```javascript
var bankCardReg = /^\d{16,19}$/;
```

### URL
```javascript
var urlReg = /^https?:\/\/.+/;
```

### IP地址
```javascript
var ipReg = /^(\d{1,3}\.){3}\d{1,3}$/;
```

---

*文档版本: v1.0.0*
