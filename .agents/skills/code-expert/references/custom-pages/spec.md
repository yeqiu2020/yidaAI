# 自定义页面规范

> 自定义页面代码的编写规范
> 版本: v1.0.0

---

## 一、代码结构

### 标准模板
```javascript
/**
 * [页面功能描述]
 * 版本号: v1.0.0
 * 代码类型: customPage
 */

// ===== 通用工具函数 =====
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true;
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;
  if (res && (res.success === true || res.success === 1)) return true;
  if (res && (res.data || (res.result && res.result.data))) return true;
  return false;
}

// ===== 配置参数 =====
var CONFIG = {
  APP_ID: 'APP_XXX',
  DATA_SOURCE: {
    QUERY: 'queryDataSource',
    ADD: 'addDataSource',
    EDIT: 'editDataSource',
    DELETE: 'deleteDataSource'
  },
  FORM_UUID: {
    MAIN: 'FORM-XXX'
  }
};

// ===== 页面状态 =====
var pageState = {
  currentPage: 1,
  totalCount: 0,
  selectedRow: null
};

/**
 * 页面加载完成时触发
 */
export function didMount() {
  console.log('页面已加载');
  this.loadTableData();
}

/**
 * 加载表格数据
 */
export function loadTableData() {
  var that = this;
  
  this.dataSourceMap[CONFIG.DATA_SOURCE.QUERY].load({
    page: pageState.currentPage
  }).then(function(res) {
    if (checkApiSuccess(res)) {
      var data = res.data || (res.result && res.result.data) || [];
      that.$('table_main').setValue(data);
    }
  });
}
```

---

## 二、必须遵守的规则

### 1. 使用 checkApiSuccess 判断结果
不同 API 返回格式不同，必须使用统一函数判断：
```javascript
function checkApiSuccess(res) {
  // 编辑/删除API成功时返回null
  if (res === null || res === undefined) return true;
  // 新增API成功时返回表单实例ID字符串
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;
  // 查询API标准成功格式
  if (res && (res.success === true || res.success === 1)) return true;
  return false;
}
```

### 2. 注意 API 参数名
- 新增：`formDataJson`
- 编辑：`updateFormDataJson`

```javascript
// 新增
this.dataSourceMap.add.load({
  formDataJson: JSON.stringify(formData)  // 新增用 formDataJson
});

// 编辑
this.dataSourceMap.edit.load({
  updateFormDataJson: JSON.stringify(formData)  // 编辑用 updateFormDataJson
});
```

### 3. 处理 UI 时序问题
弹窗显示后立即操作字段可能报错，需要延迟：
```javascript
// ❌ 错误
this.$('dialog').show();
this.$('field').setValue('xxx'); // 可能报错

// ✅ 正确
this.$('dialog').show();
var that = this;
setTimeout(function() {
  that.$('field').setValue('xxx');
}, 100);
```

### 4. 表格数据格式
表格数据必须是数组，每个元素是对象：
```javascript
var tableData = [
  { name: '张三', age: 25 },
  { name: '李四', age: 30 }
];
this.$('table').setValue(tableData);
```

---

## 三、常用场景

### 场景1：打开弹窗并填充数据
```javascript
export function openEditDialog(rowData, rowIndex) {
  pageState.selectedRow = rowData;
  this.$('dialog_edit').show();
  
  var that = this;
  setTimeout(function() {
    that.$('edit_name').setValue(rowData.name);
    that.$('edit_age').setValue(rowData.age);
  }, 100);
}
```

### 场景2：保存数据
```javascript
export function saveData() {
  var that = this;
  
  var formData = {
    name: this.$('form_name').getValue(),
    age: this.$('form_age').getValue()
  };
  
  this.dataSourceMap[CONFIG.DATA_SOURCE.ADD].load({
    appId: CONFIG.APP_ID,
    formUuid: CONFIG.FORM_UUID.MAIN,
    formDataJson: JSON.stringify(formData)
  }).then(function(res) {
    if (checkApiSuccess(res)) {
      that.utils.toast({ type: 'success', title: '保存成功' });
      that.$('dialog_add').hide();
      that.loadTableData();
    } else {
      that.utils.toast({ type: 'error', title: '保存失败' });
    }
  });
}
```

### 场景3：删除数据
```javascript
export function deleteData(rowData, rowIndex) {
  var that = this;
  
  this.utils.dialog({
    type: 'confirm',
    title: '确认删除',
    content: '删除后无法恢复，是否继续？',
    onOk: function() {
      that.dataSourceMap[CONFIG.DATA_SOURCE.DELETE].load({
        appId: CONFIG.APP_ID,
        formUuid: CONFIG.FORM_UUID.MAIN,
        formInstId: rowData.instanceId
      }).then(function(res) {
        if (checkApiSuccess(res)) {
          that.utils.toast({ type: 'success', title: '删除成功' });
          that.loadTableData();
        }
      });
    }
  });
}
```

---

## 四、常见坑点

### 坑点1：API 返回 null
编辑和删除 API 成功时返回 `null`，不是对象：
```javascript
// 正确判断
if (res === null) {
  console.log('操作成功');
}
```

### 坑点2：表格行数据获取
表格行点击事件参数：`function onRowClick(rowData, rowIndex)`

### 坑点3：数据源名称
代码中的数据源名称必须与宜搭后台配置的名称完全一致。

---

*文档版本: v1.0.0*
