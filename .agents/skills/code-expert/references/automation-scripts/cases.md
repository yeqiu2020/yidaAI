# 自动化脚本 - 典型案例库

> 自动化脚本场景的常见业务案例，含完整可运行代码
> 版本: v1.0.0

---

> ⚠️ **自动化脚本强制规范**（违反则报错）：
> 1. 只能使用 `//` 单行注释，**严禁** `/** */` 多行注释
> 2. 只能使用 ES5 语法：**严禁** `let`/`const`/`=>`/模板字符串/解构赋值
> 3. 不能使用 `return`，用 `if-else` 控制流程
> 4. 不能使用 `console.log`
> 5. 不能使用 `this.$`，无 UI 上下文
> 6. 输出只能用 `outputs.add(描述, 变量名, 值)`

---

## 一、数据处理场景

### 1.1 数据过滤

// 场景：从上游节点获取数据列表，过滤出满足条件的记录

```javascript
// 数据过滤：过滤出金额大于10000的记录
// 版本号: v1.0.0
// 代码类型: automation

// 获取输入数据（不要重新声明 var inputData = inputData）
var data = inputData || [];

// 处理JSON字符串格式
if (typeof data === 'string') {
  try {
    data = JSON.parse(data);
  } catch (e) {
    outputs.add('过滤结果', 'result', []);
  }
}

// 数据验证
if (!data || !Array.isArray(data) || data.length === 0) {
  outputs.add('过滤结果', 'result', []);
} else {
  // 执行过滤
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    var amount = parseFloat(item.amount || item.numberField_amount || 0);
    if (amount > 10000) {
      result.push(item);
    }
  }
  outputs.add('过滤结果', 'result', result);
  outputs.add('过滤数量', 'count', result.length);
}

// 代码版本号: v1.0.0
```

---

### 1.2 数据转换格式

// 场景：将子表数据转换成酷卡片表格所需的格式

```javascript
// 子表数据转换成酷卡片表格格式
// 版本号: v1.0.0
// 代码类型: automation

// 输入变量说明:
// subTableData: 子表数据（JSON数组或字符串）

var data = subTableData || [];

if (typeof data === 'string') {
  try {
    data = JSON.parse(data);
  } catch (e) {
    data = [];
  }
}

if (!data || !Array.isArray(data) || data.length === 0) {
  var emptyResult = {
    data: [],
    meta: [
      { title: '产品名称', key: 'productName' },
      { title: '数量', key: 'quantity' },
      { title: '金额', key: 'amount' }
    ]
  };
  outputs.add('表格数据', 'tableData', emptyResult);
} else {
  // 转换每行数据
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    rows.push({
      productName: item.textField_productName || item.productName || '',
      quantity: item.numberField_quantity || item.quantity || 0,
      amount: item.numberField_amount || item.amount || 0
    });
  }

  // 酷卡片表格格式
  var tableResult = {
    data: rows,
    meta: [
      { title: '产品名称', key: 'productName' },
      { title: '数量', key: 'quantity' },
      { title: '金额（元）', key: 'amount' }
    ]
  };

  outputs.add('表格数据', 'tableData', tableResult);
  outputs.add('行数', 'rowCount', rows.length);
}

// 代码版本号: v1.0.0
```

---

### 1.3 数值汇总计算

// 场景：汇总子表各列数据，计算总计、平均值

```javascript
// 数据汇总计算
// 版本号: v1.0.0
// 代码类型: automation

var data = inputData || [];

if (typeof data === 'string') {
  try {
    data = JSON.parse(data);
  } catch (e) {
    data = [];
  }
}

if (!data || !Array.isArray(data) || data.length === 0) {
  outputs.add('汇总结果', 'summary', {
    totalAmount: 0,
    totalQty: 0,
    avgAmount: 0,
    count: 0
  });
} else {
  var totalAmount = 0;
  var totalQty = 0;

  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    totalAmount += parseFloat(item.amount || 0);
    totalQty += parseFloat(item.quantity || 0);
  }

  // 保留两位小数
  var avgAmount = data.length > 0 ? totalAmount / data.length : 0;

  outputs.add('汇总结果', 'summary', {
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalQty: totalQty,
    avgAmount: Math.round(avgAmount * 100) / 100,
    count: data.length
  });
}

// 代码版本号: v1.0.0
```

---

## 二、条件分支场景

### 2.1 根据金额设置审批级别

// 场景：根据申请金额自动确定审批流程的节点

```javascript
// 根据金额设置审批级别
// 版本号: v1.0.0
// 代码类型: automation

// 输入变量: amount（申请金额），status（当前状态）
var applyAmount = parseFloat(amount || 0);
var currentStatus = status || '';

if (applyAmount > 100000) {
  outputs.add('审批级别', 'approvalLevel', 'high');
  outputs.add('是否需要总裁审批', 'needCEO', true);
  outputs.add('是否需要总监审批', 'needDirector', true);
  outputs.add('审批说明', 'remark', '金额超过10万，需总裁审批');
} else if (applyAmount > 10000) {
  outputs.add('审批级别', 'approvalLevel', 'medium');
  outputs.add('是否需要总裁审批', 'needCEO', false);
  outputs.add('是否需要总监审批', 'needDirector', true);
  outputs.add('审批说明', 'remark', '金额1万-10万，需总监审批');
} else if (applyAmount > 0) {
  outputs.add('审批级别', 'approvalLevel', 'low');
  outputs.add('是否需要总裁审批', 'needCEO', false);
  outputs.add('是否需要总监审批', 'needDirector', false);
  outputs.add('审批说明', 'remark', '金额1万以内，经理审批即可');
} else {
  outputs.add('审批级别', 'approvalLevel', 'invalid');
  outputs.add('是否需要总裁审批', 'needCEO', false);
  outputs.add('是否需要总监审批', 'needDirector', false);
  outputs.add('审批说明', 'remark', '金额无效');
}

// 代码版本号: v1.0.0
```

---

### 2.2 多字段条件判断

// 场景：组合多个字段进行复杂条件判断，输出处理结果

```javascript
// 多条件组合判断
// 版本号: v1.0.0
// 代码类型: automation

// 输入变量: userType, region, orderCount
var type = userType || 'normal';
var area = region || '';
var count = parseInt(orderCount || 0);

// 判断是否为重要客户
var isImportant = false;
var discountRate = 0;
var serviceLevel = 'standard';
var remark = '';

if (type === 'vip') {
  isImportant = true;
  if (count > 100) {
    discountRate = 15;
    serviceLevel = 'premium';
    remark = 'VIP客户且高频，享受15%折扣和高级服务';
  } else {
    discountRate = 10;
    serviceLevel = 'enhanced';
    remark = 'VIP客户，享受10%折扣和增强服务';
  }
} else if (count > 50) {
  isImportant = true;
  discountRate = 5;
  serviceLevel = 'enhanced';
  remark = '高频客户，享受5%折扣和增强服务';
} else {
  isImportant = false;
  discountRate = 0;
  serviceLevel = 'standard';
  remark = '普通客户，标准服务';
}

outputs.add('是否重要客户', 'isImportant', isImportant);
outputs.add('折扣率', 'discountRate', discountRate);
outputs.add('服务级别', 'serviceLevel', serviceLevel);
outputs.add('备注', 'remark', remark);

// 代码版本号: v1.0.0
```

---

## 三、字符串处理场景

### 3.1 文本格式化处理

// 场景：清洗和格式化文本数据，如去除空格、统一格式

```javascript
// 文本格式化处理
// 版本号: v1.0.0
// 代码类型: automation

// 输入变量: rawText（原始文本）
var text = rawText || '';

if (!text || text.length === 0) {
  outputs.add('处理结果', 'formattedText', '');
  outputs.add('处理状态', 'success', false);
} else {
  // 去除首尾空格
  var result = text.replace(/^\s+|\s+$/g, '');

  // 将多个连续空格替换为单个空格
  result = result.replace(/\s+/g, ' ');

  // 将中文逗号替换为英文逗号
  result = result.replace(/，/g, ',');

  // 将全角数字转半角（简化处理）
  result = result.replace(/[０-９]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });

  outputs.add('处理结果', 'formattedText', result);
  outputs.add('处理状态', 'success', true);
  outputs.add('字符数', 'charCount', result.length);
}

// 代码版本号: v1.0.0
```

---

### 3.2 身份证信息提取

// 场景：从身份证号码中提取出生日期、性别、年龄

```javascript
// 身份证信息提取
// 版本号: v1.0.0
// 代码类型: automation

// 输入变量: idCardNumber（身份证号码）
var idCard = idCardNumber || '';
idCard = idCard.replace(/^\s+|\s+$/g, '');

// 验证身份证号格式
var idCardReg = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/;

if (!idCard || !idCardReg.test(idCard)) {
  outputs.add('是否有效', 'isValid', false);
  outputs.add('错误信息', 'error', '身份证号格式不正确');
} else {
  // 统一转为18位处理
  var id18 = idCard;
  if (idCard.length === 15) {
    // 15位转18位（简化）
    id18 = idCard.substring(0, 6) + '19' + idCard.substring(6);
  }

  // 提取出生日期
  var year = id18.substring(6, 10);
  var month = id18.substring(10, 12);
  var day = id18.substring(12, 14);
  var birthDate = year + '-' + month + '-' + day;

  // 提取性别（第17位奇数为男，偶数为女）
  var genderCode = parseInt(id18.charAt(16));
  var gender = (genderCode % 2 === 1) ? '男' : '女';

  // 计算年龄
  var today = new Date();
  var birth = new Date(year, parseInt(month) - 1, parseInt(day));
  var age = today.getFullYear() - birth.getFullYear();
  var monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  outputs.add('是否有效', 'isValid', true);
  outputs.add('出生日期', 'birthDate', birthDate);
  outputs.add('性别', 'gender', gender);
  outputs.add('年龄', 'age', age);
  outputs.add('出生年份', 'birthYear', parseInt(year));
}

// 代码版本号: v1.0.0
```

---

## 四、日期时间处理场景

### 4.1 日期计算

// 场景：计算两个日期之间的天数差、工作日天数

```javascript
// 日期差值计算
// 版本号: v1.0.0
// 代码类型: automation

// 输入变量: startDate, endDate（格式：YYYY-MM-DD 或时间戳）
var start = startDate || '';
var end = endDate || '';

if (!start || !end) {
  outputs.add('计算结果', 'result', null);
  outputs.add('错误信息', 'error', '开始日期或结束日期为空');
} else {
  var startTime = new Date(start).getTime();
  var endTime = new Date(end).getTime();

  if (isNaN(startTime) || isNaN(endTime)) {
    outputs.add('计算结果', 'result', null);
    outputs.add('错误信息', 'error', '日期格式不正确');
  } else {
    var diffMs = endTime - startTime;
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    var diffMinutes = Math.floor(diffMs / (1000 * 60));

    outputs.add('天数差', 'daysDiff', diffDays);
    outputs.add('小时差', 'hoursDiff', diffHours);
    outputs.add('分钟差', 'minutesDiff', diffMinutes);
    outputs.add('是否超期', 'isOverdue', diffDays < 0);
  }
}

// 代码版本号: v1.0.0
```

---

### 4.2 获取时间段标签

// 场景：根据当前时间或传入时间，判断所属时间段

```javascript
// 时间段判断
// 版本号: v1.0.0
// 代码类型: automation

// 输入变量: submitTime（提交时间，可选，默认当前时间）
var timeStr = submitTime || '';
var targetDate = timeStr ? new Date(timeStr) : new Date();

var hour = targetDate.getHours();
var month = targetDate.getMonth() + 1;
var day = targetDate.getDate();
var weekDay = targetDate.getDay(); // 0=周日, 1-6=周一到周六

// 判断时段
var timePeriod = '';
if (hour >= 0 && hour < 6) {
  timePeriod = '凌晨';
} else if (hour >= 6 && hour < 9) {
  timePeriod = '早晨';
} else if (hour >= 9 && hour < 12) {
  timePeriod = '上午';
} else if (hour >= 12 && hour < 14) {
  timePeriod = '中午';
} else if (hour >= 14 && hour < 18) {
  timePeriod = '下午';
} else if (hour >= 18 && hour < 21) {
  timePeriod = '傍晚';
} else {
  timePeriod = '晚上';
}

// 判断季度
var quarter = Math.ceil(month / 3);

// 判断是否周末
var isWeekend = (weekDay === 0 || weekDay === 6);

var weekDayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
var weekDayName = weekDayNames[weekDay];

outputs.add('时间段', 'timePeriod', timePeriod);
outputs.add('季度', 'quarter', 'Q' + quarter);
outputs.add('星期', 'weekDay', weekDayName);
outputs.add('是否周末', 'isWeekend', isWeekend);
outputs.add('小时', 'hour', hour);

// 代码版本号: v1.0.0
```

---

*文档版本: v1.0.0*
*场景覆盖：数据过滤 / 格式转换 / 数值汇总 / 条件分支 / 字符串处理 / 日期计算*
