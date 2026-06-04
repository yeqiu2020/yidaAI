# 表单动作规范

> 表单动作代码的编写规范
> 版本: v2.0.0
> 新增: 子表防死循环、UI时序问题、错误处理规范

---

## 一、代码结构

### 标准模板
```javascript
/**
 * [功能描述]
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 字段ID映射
  },
  CONSTANTS: {
    // 常量定义
  }
};

// 全局状态变量
var isProcessing = false;

/**
 * 页面加载完成时触发
 * 必须包含，即使为空
 */
export function didMount() {
  console.log('功能已加载');
}

/**
 * 业务函数
 */
export function businessFunction(event) {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 业务逻辑
    
  } catch (error) {
    console.error('错误:', error);
    this.utils.toast({
      type: 'error',
      title: '处理失败',
      content: error.message
    });
  } finally {
    isProcessing = false;
  }
}
```

---

## 二、必须遵守的规则

### 1. 必须包含 didMount
无论是否有初始化逻辑，都必须包含 `didMount` 函数：
```javascript
export function didMount() {
  console.log('已加载');
}
```

### 2. 正确处理 this 指向
在嵌套函数中使用 `that` 保存 `this`：
```javascript
export function handleClick() {
  var that = this;
  this.dataSourceMap.xxx.load().then(function(res) {
    that.$('field').setValue(res.data);
  });
}
```

### 3. 防止循环触发
使用 `isProcessing` 锁防止死循环：
```javascript
var isProcessing = false;

export function onFieldChange() {
  if (isProcessing) return;
  
  try {
    isProcessing = true;
    // 业务逻辑
  } finally {
    isProcessing = false;
  }
}
```

### 4. 子表操作注意事项
设置子表值时，注意 `triggerChange` 参数：
```javascript
// 不触发 change 事件（防止死循环）
this.$('tableField_xxx').setValue(newData, {triggerChange: false});

// 触发 change 事件（需要联动其他字段时）
this.$('tableField_xxx').setValue(newData, {triggerChange: true});
```

---

## 三、常用场景

### 场景1：字段联动
```javascript
export function onSourceFieldChange(event) {
  var value = event.value;
  
  if (value === '选项A') {
    this.$('targetField').setValue('联动值A');
  } else if (value === '选项B') {
    this.$('targetField').setValue('联动值B');
  }
}
```

### 场景2：子表汇总到主表
```javascript
export function onSubTableChange() {
  var that = this;
  var tableData = this.$('tableField_xxx').getValue();
  
  var total = 0;
  for (var i = 0; i < tableData.length; i++) {
    total += parseFloat(tableData[i].amountField) || 0;
  }
  
  this.$('totalField').setValue(total);
}
```

### 场景4：提交前校验
```javascript
export function beforeSubmit() {
  var requiredField = this.$('requiredField').getValue();
  
  if (!requiredField || requiredField === '') {
    this.utils.toast({
      type: 'warning',
      title: '请填写必填项'
    });
    return false;
  }
  
  return true;
}
```

---

## 四、子表操作专题（必读！）

> ⚠️ **重要**: 子表处理有专门的详细文档，请务必阅读：
> **`subtable-processing.md`** - 子表数据处理专题（防死循环机制）

### 4.1 ☠️ 死循环问题

**在子表的 onChange 事件中调用 `setValue()` 会导致死循环！**

```
子表数据变化 → 触发 onChange → 执行函数 →
调用 subTable.setValue() → 再次触发 onChange → 无限循环…
```

### 4.2 正确解决方案（全局锁 + triggerChange: false）

```javascript
// 全局锁变量，防止子表 onChange 死循环（必须添加）
var isProcessing = false;

export function onSubTableChange(event) {
  var that = this;
  
  // 防止死循环：如果正在处理中，直接返回
  if (isProcessing) {
    console.log('正在处理中，跳过本次调用');
    return;
  }
  
  try {
    isProcessing = true; // 加锁
    
    var subTable = this.$(CONFIG.FIELD_IDS.SUB_TABLE);
    var data = subTable.getValue();
    
    var hasChanges = false;
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      // 处理每行数据...
      // if (row.fieldId !== newValue) { row.fieldId = newValue; hasChanges = true; }
    }
    
    // 只有数据有变化时才更新，并使用 triggerChange: false 防止再次触发
    if (hasChanges) {
      subTable.setValue(data, { triggerChange: false });
    }
    
  } catch (error) {
    console.error('处理错误:', error);
  } finally {
    isProcessing = false; // 释放锁（必须在 finally 中）
  }
}
```

### 4.3 子表操作检查清单

- [ ] 是否添加了 `isProcessing` 全局锁？
- [ ] `setValue()` 是否使用了 `{ triggerChange: false }`？
- [ ] 是否在 `finally` 中释放了锁？
- [ ] 是否有 `hasChanges` 判断避免无意义更新？

### 4.4 子表行数限制

```javascript
// 子表最多 500 行，填充前建议截断
 if (subTableData.length >= 500) {
  subTableData = subTableData.slice(0, 500);
  this.utils.toast({ type: 'warning', title: '数据量过大', content: '最多支持500行，已截断' });
}
```

---

## 五、UI 时序问题（必读！）

### 5.1 问题说明

**代码执行顺序 ≠ UI 渲染顺序**

```javascript
// ✔ 错误：弹窗显示后立即操作字段
// 报错: setValue is not a function
this.$('dialogId').show();
this.$('fieldId').setValue('値'); // 弹窗DOM还未渲染完成！
```

### 5.2 解决方案：setTimeout 延迟执行

```javascript
// 弹窗显示后延迟 100ms 操作字段
export function openEditDialog(event) {
  var rowData = event || {};
  var formData = rowData.formData || rowData;
  
  // 1. 保存编辑状态
  pageState.currentEditData = rowData;
  pageState.currentEditFormInstId = rowData.formInstId || '';
  
  // 2. 打开弹窗
  this.$('dialog_edit').show();
  
  // 3. 关键：延迟填充字段，确保弹窗已渲染
  var that = this;
  setTimeout(function() {
    that.$('textField_xxx').setValue(formData['textField_xxx'] || '');
    that.$('radioField_xxx').setValue(formData['radioField_xxx'] || '');
    that.$('dateField_xxx').setValue(formData['dateField_xxx'] || null);
  }, 100); // 100ms 通常足够
}
```

### 5.3 延迟时间参考

| 场景 | 推荐延迟 | 说明 |
|------|---------|------|
| 简单弹窗 | 50-100ms | 一般表单字段 |
| 复杂弹窗 | 100-200ms | 包含子表、关联表单等 |
| 表格数据 | 0ms (Promise.then) | 在数据加载回调中操作 |
| 页面初始化 | 0ms (didMount) | 在 didMount 中操作 |

---

## 六、错误处理规范

```javascript
export function safeFunction() {
  try {
    var result = this.$('fieldId').getValue();
    
    if (!result || result.length === 0) {
      console.warn('数据为空');
      return;
    }
    
    // 业务逻辑...
    
  } catch (error) {
    console.error('函数执行错误:', error);
    this.utils.toast({
      type: 'error',
      title: '执行失败',
      content: error.message || '请检查数据格式或联系管理员'
    });
  }
}
```

---

*文档版本: v2.0.0*
