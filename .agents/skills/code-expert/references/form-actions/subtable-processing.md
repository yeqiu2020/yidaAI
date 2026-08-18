# 子表数据处理专题

> 本文档专门说明子表数据处理时的特殊注意事项和防死循环机制
> 版本：v1.0.0

---

## 一、⚠️ 重要警告：子表死循环问题

### 问题描述
**在子表的 onChange 事件中调用 `setValue()` 方法会导致死循环，造成页面卡死、浏览器崩溃！**

### 死循环产生的原因
```
子表数据变化
    ↓
触发 onChange 事件
    ↓
执行校验/处理函数
    ↓
调用 subTable.setValue() 更新数据
    ↓
再次触发子表的 onChange 事件
    ↓
无限循环...
```

### 真实案例
```javascript
// ❌ 错误示例 - 会导致死循环
export function onSubTableChange(event) {
  var subTable = this.$('tableField_xxx');
  var data = subTable.getValue();
  
  // 处理数据...
  for (var i = 0; i < data.length; i++) {
    data[i].field_xxx = '新值';
  }
  
  // 这行代码会再次触发 onChange，导致死循环！
  subTable.setValue(data);
}
```

---

## 二、解决方案

### 方案 1：使用 triggerChange: false（推荐）

```javascript
// ✅ 正确示例 - 阻止触发 onChange
export function onSubTableChange(event) {
  var subTable = this.$('tableField_xxx');
  var data = subTable.getValue();
  
  // 处理数据...
  for (var i = 0; i < data.length; i++) {
    data[i].field_xxx = '新值';
  }
  
  // 使用 triggerChange: false 阻止再次触发 onChange
  subTable.setValue(data, { triggerChange: false });
}
```

**原理：** `triggerChange: false` 参数告诉宜搭框架不要触发 onChange 事件，从而打破死循环。

### 方案 2：使用标志位控制

```javascript
// ✅ 使用标志位避免重复触发
var isUpdating = false;

export function onSubTableChange(event) {
  if (isUpdating) return; // 如果是自己触发的更新，直接返回
  
  isUpdating = true;
  
  try {
    var subTable = this.$('tableField_xxx');
    var data = subTable.getValue();
    
    // 处理数据...
    for (var i = 0; i < data.length; i++) {
      data[i].field_xxx = '新值';
    }
    
    subTable.setValue(data);
  } finally {
    // 使用 setTimeout 确保 setValue 完成后再重置标志
    setTimeout(function() {
      isUpdating = false;
    }, 0);
  }
}
```

### 方案 3：在 setTimeout 中处理

```javascript
// ✅ 延迟处理，避免立即触发
export function onSubTableChange(event) {
  var that = this;
  var rowIndex = this.index;
  
  setTimeout(function() {
    var subTable = that.$('tableField_xxx');
    var data = subTable.getValue();
    
    // 处理数据...
    data[rowIndex].field_xxx = '新值';
    
    subTable.setValue(data, { triggerChange: false });
  }, 0);
}
```

---

## 三、子表操作最佳实践

### 1. 深拷贝数据

```javascript
// ✅ 始终对子表数据进行深拷贝
function deepClone(arr) {
  try {
    return JSON.parse(JSON.stringify(arr));
  } catch (e) {
    // 如果有循环引用，使用浅拷贝
    return arr.slice();
  }
}

export function onSubTableChange(event) {
  var subTable = this.$('tableField_xxx');
  var rawData = subTable.getValue();
  var data = deepClone(rawData);  // 深拷贝后再修改
  
  // 处理数据...
  subTable.setValue(data, { triggerChange: false });
}
```

### 2. 行索引的正确使用

```javascript
// ✅ 在 onChange 最外层保存行索引
export function onSubTableChange(event) {
  var rowIndex = this.index;  // 必须在最外层保存！
  var subTable = this.$('tableField_xxx');
  
  setTimeout(function() {
    var data = subTable.getValue();
    if (!data[rowIndex]) return;
    
    // 修改指定行的数据
    data[rowIndex].field_xxx = '新值';
    
    subTable.setValue(data, { triggerChange: false });
  }, 0);
}
```

### 3. 子表数据汇总到主表

```javascript
// ✅ 子表数据变化时自动汇总到主表字段
export function onSubTableChange(event) {
  var subTable = this.$('tableField_xxx');
  var data = subTable.getValue();
  
  // 计算汇总金额
  var totalAmount = 0;
  for (var i = 0; i < data.length; i++) {
    var rowAmount = parseFloat(data[i].amount_xxx) || 0;
    totalAmount += rowAmount;
  }
  
  // 更新主表汇总字段
  this.$('totalAmount_xxx').setValue(totalAmount.toFixed(2));
}
```

### 4. 子表数据校验

```javascript
// ✅ 子表数据提交前校验
function validateSubTable(subTable) {
  var data = subTable.getValue();
  
  if (!data || data.length === 0) {
    this.utils.toast({
      type: 'error',
      title: '子表不能为空'
    });
    return false;
  }
  
  for (var i = 0; i < data.length; i++) {
    if (!data[i].requiredField_xxx) {
      this.utils.toast({
        type: 'error',
        title: '第' + (i + 1) + '行必填字段不能为空'
      });
      return false;
    }
  }
  
  return true;
}
```

---

## 四、常见子表操作场景

### 场景 1：自动填充默认值

```javascript
// ✅ 子表新增行时自动填充默认值
export function onSubTableAdd(event) {
  var subTable = this.$('tableField_xxx');
  var data = subTable.getValue();
  var newRow = data[data.length - 1];  // 最后一行是新增的
  
  // 填充默认值
  newRow.date_xxx = new Date().toISOString().split('T')[0];
  newRow.status_xxx = '待处理';
  
  subTable.setValue(data, { triggerChange: false });
}
```

### 场景 2：联动计算

```javascript
// ✅ 子表中单价和数量变化时自动计算金额
export function onSubTableChange(event) {
  var subTable = this.$('tableField_xxx');
  var data = subTable.getValue();
  var rowIndex = this.index;
  
  if (!data[rowIndex]) return;
  
  var price = parseFloat(data[rowIndex].price_xxx) || 0;
  var quantity = parseFloat(data[rowIndex].quantity_xxx) || 0;
  var amount = price * quantity;
  
  data[rowIndex].amount_xxx = amount.toFixed(2);
  
  subTable.setValue(data, { triggerChange: false });
}
```

### 场景 3：数据去重校验

```javascript
// ✅ 子表新增时校验数据不能重复
export function onSubTableChange(event) {
  var subTable = this.$('tableField_xxx');
  var data = subTable.getValue();
  var rowIndex = this.index;
  
  if (!data[rowIndex]) return;
  
  var currentValue = data[rowIndex].code_xxx;
  
  // 检查是否有重复
  for (var i = 0; i < data.length; i++) {
    if (i !== rowIndex && data[i].code_xxx === currentValue) {
      this.utils.toast({
        type: 'error',
        title: '编码不能重复'
      });
      
      // 清空重复的值
      data[rowIndex].code_xxx = '';
      subTable.setValue(data, { triggerChange: false });
      return;
    }
  }
}
```

---

## 五、性能优化建议

### 1. 避免频繁 setValue

```javascript
// ❌ 错误：循环中频繁调用 setValue
for (var i = 0; i < data.length; i++) {
  data[i].xxx = '值';
  subTable.setValue(data);  // 每次都触发渲染，性能极差！
}

// ✅ 正确：批量处理后一次性更新
for (var i = 0; i < data.length; i++) {
  data[i].xxx = '值';
}
subTable.setValue(data, { triggerChange: false });  // 只更新一次
```

### 2. 大数据量时的优化

```javascript
// ✅ 大数据量时使用防抖
var debounceTimer = null;

export function onSubTableChange(event) {
  var that = this;
  
  if (debounceTimer) clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(function() {
    var subTable = that.$('tableField_xxx');
    var data = subTable.getValue();
    
    // 处理大数据量...
    
    subTable.setValue(data, { triggerChange: false });
  }, 300);
}
```

---

## 六、调试技巧

### 1. 打印子表数据结构

```javascript
export function onSubTableChange(event) {
  var subTable = this.$('tableField_xxx');
  var data = subTable.getValue();
  
  console.log('子表数据:', JSON.stringify(data, null, 2));
  console.log('行数:', data.length);
  if (data[0]) {
    console.log('第一行字段:', Object.keys(data[0]));
  }
}
```

### 2. 检测死循环

```javascript
var callCount = 0;

export function onSubTableChange(event) {
  callCount++;
  console.log('onChange 被调用次数:', callCount);
  
  if (callCount > 10) {
    console.error('检测到可能的死循环！');
    // 可以在此中断执行
  }
  
  // ...处理逻辑
}
```

---

## 七、子表动态校验与时序问题（实战经验）

### 7.1 事件绑定与参数问题

**问题描述：** 对 `onChange` 事件绑定位置（子表本身 vs 子表内组件）和回调参数含义存在混淆。

**解决方案：** 将 `onChange` 事件统一绑定到 **子表单本身** (`TableField`)，处理回调参数 `{ value, extra }`。

**注意事项：**
- `extra` 参数中的 `rowIndex` 在大多数情况下不可靠
- 建议采用**遍历所有行**的策略，确保逻辑覆盖完整

### 7.2 UI 状态更新滞后问题

**问题描述：** 修改子表内字段值后，依赖该值计算得出的另一字段状态没有立即更新，需要等待下一次事件触发才刷新。

**原因：** `onChange` 事件触发后，宜搭内部状态更新可能尚未完成。此时调用 `getValue()` 获取的是更新前的数据。

**解决方案：** 使用 `setTimeout` 延迟获取最新数据：

```javascript
export function onSubTableChange(event) {
  var that = this;
  var rowIndex = this.index;  // 必须在最外层保存！
  
  // 延迟执行，确保获取最新数据
  setTimeout(function() {
    var subTable = that.$('tableField_xxx');
    var data = subTable.getValue();  // 此时获取的是最新数据
    
    if (!data[rowIndex]) return;
    
    // 处理数据...
    data[rowIndex].field_xxx = '新值';
    
    subTable.setValue(data, { triggerChange: false });
  }, 100);  // 延迟 100ms
}
```

### 7.3 关联表单数据填充时序问题

**问题描述：** 子表中关联表单字段变化后，自动填充的数据（如物料标号）无法在 `onChange` 回调中立即获取。

**原因：** 宜搭的关联数据填充机制与 `onChange` 事件触发存在异步时序问题，JS 回调往往先于数据填充完成执行。

**解决方案：**

```javascript
export function handleMaterialChange(value, options) {
  var that = this;
  var rowIndex = this.index;  // 保存行索引
  var subTableComponent = this.$(SUB_TABLE_ID);
  
  // 延迟执行，等待关联数据填充完成
  setTimeout(function() {
    // 重新获取最新数据（关键！）
    var allLatestSubTableData = subTableComponent.getValue();
    if (!Array.isArray(allLatestSubTableData) || !allLatestSubTableData[rowIndex]) {
      return;
    }
    
    var latestCurrentRowData = allLatestSubTableData[rowIndex];
    
    // 从最新行数据中提取关联回填的值
    var originalMaterialCode = latestCurrentRowData[MATERIAL_CODE_ORIGINAL_ID];
    
    // 更新目标字段
    allLatestSubTableData[rowIndex][TARGET_FIELD_ID] = originalMaterialCode;
    
    subTableComponent.setValue(allLatestSubTableData, { triggerChange: false });
  }, 300);  // 延迟 300ms，根据实际情况调整
}
```

**关键要点：**
1. 在 `onChange` 回调顶层保存 `this.index`（行索引）
2. 使用 `setTimeout` 延迟执行核心逻辑
3. 在延迟回调中**重新调用 `getValue()`** 获取最新数据
4. 不要依赖事件触发时的 `this.item`（它是快照，不会自动更新）

### 7.4 JSON.stringify 循环引用错误

**问题描述：** 对宜搭事件回调参数进行 `JSON.stringify` 时，频繁遇到 `TypeError: Converting circular structure to JSON` 错误。

**原因：** 宜搭传递的事件参数可能包含对组件实例、DOM 节点的引用，形成循环引用。

**解决方案：**
```javascript
// ❌ 避免：直接对事件参数使用 JSON.stringify
var copy = JSON.parse(JSON.stringify(event.value));  // 可能报错

// ✅ 正确：对 getValue() 返回的数据进行深拷贝
var subTable = this.$('tableField_xxx');
var data = subTable.getValue();
try {
  var copy = JSON.parse(JSON.stringify(data));
} catch (e) {
  // 如果有循环引用，使用浅拷贝
  var copy = data.slice();
}
```

---

## 八、子表数据限制

### 8.1 行数限制
- 子表数据最多 **500 行**
- 查询数据超过 500 行时无需继续查询

### 8.2 分页查询限制
- `currentPage`：当前页，必须大于 0，默认 1
- `pageSize`：每页记录数，必须大于 0，默认 10，**最大值 100**
- 超过 100 条数据需要分页查询

---

## 九、⚠️ 子表空行问题（minItems 默认空行）

> 实战坑点（2026-08-01「跟进人员拆分到子表」案例）：拆分后子表第一行出现空行

### 9.1 问题描述

**子表配置了 `minItems: 1`（最少行数=1）时，当子表无数据，`getValue()` 会返回一个空行对象**（如 `[{}]` 或仅含 `rowId` 的空对象行）。

在"清空旧数据后重建子表"的场景中，若仅过滤业务特征行，空行会因**不满足过滤特征**而被保留，导致重建后子表首行残留空行。

### 9.2 典型错误

```javascript
// ❌ 错误：只过滤"拆分行"，空行被保留
var keptRows = [];
for (var i = 0; i < tableData.length; i++) {
  if (!isSplitRow(tableData[i])) {  // 空行不满足特征 → 被保留
    keptRows.push(tableData[i]);
  }
}
subTable.setValue(keptRows, { triggerChange: false }); // 首行是空行
```

### 9.3 正确解决方案：只检查业务字段（不能遍历所有 key）

**⚠️ 关键教训（v1.0.1 → v1.0.2 二次修复）**：
空行对象里除了 `rowId` 还可能有 `$$__index: 0` 等**内部字段**。若用 `Object.keys` 遍历所有字段并判断"是否有值"，数字 `0` 会被 `hasValue` 误判为"有值"，导致空行被保留。因此**必须只检查已知业务字段**。

```javascript
// ✅ 正确：只检查业务字段，彻底忽略 rowId/$$__index 等内部字段
// 业务字段全空 = 需清除的行（含空行 和 仅跟进人有值的拆分行）
function isBlankRow(row) {
  if (!row) return true;
  var fields = CONFIG.BUSINESS_FIELDS;  // 子表所有业务字段ID数组
  for (var i = 0; i < fields.length; i++) {
    if (hasValue(row[fields[i]])) return false;
  }
  return true;
}

// ✅ 正确：过滤空行和拆分行，保留有业务数据的行
var keptRows = [];
for (var i = 0; i < tableData.length; i++) {
  if (!isBlankRow(tableData[i])) {
    keptRows.push(tableData[i]);
  }
}
```

### 9.4 检查清单

- [ ] 子表重建/覆盖场景是否过滤了空行（`minItems: 1` 时 `getValue()` 会返回空行对象）？
- [ ] 空行判断是否**只检查业务字段**（不能用 `Object.keys` 遍历，内部字段 `$$__index: 0` 会误判）？

---

*文档版本：v2.1.1*
*更新内容：修正子表空行判断方案 — 只检查业务字段，避免 $$__index 等内部字段误判*
