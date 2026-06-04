# 宜搭 API 参考手册

> 宜搭平台常用 API 速查（完整版）
> 版本: v2.1.0

***

## 一、组件操作 API

### 1.1 获取组件实例

```javascript
this.$(componentId)
```

**参数：**

- `componentId` (String): 组件唯一标识，如 'textField\_xxx'

**示例：**

```javascript
var nameField = this.$('textField_mabwck5x');
var subTable = this.$('tableField_mabwck61');
```

### 1.2 获取组件值

```javascript
this.$(componentId).getValue()
```

**返回值类型：**

- 文本/数值：String/Number
- 成员组件：Array `[{name, emplId}]`
- 关联表单：Array `[{instanceId, title, ...}]`
- 子表单：Array `[Object]`

**示例：**

```javascript
var text = this.$('textField_xxx').getValue();
var members = this.$('employeeField_xxx').getValue();
var tableData = this.$('tableField_xxx').getValue();
```

### 1.3 设置组件值

```javascript
this.$(componentId).setValue(value, options)
```

**参数：**

- `value` (Any): 要设置的值
- `options` (Object): 配置选项
  - `triggerChange` (Boolean): 是否触发 change 事件，默认 true

**示例：**

```javascript
this.$('textField_xxx').setValue('新值');
this.$('tableField_xxx').setValue(newData, {triggerChange: false});
```

### 1.4 设置组件属性

```javascript
this.$(componentId).set(propName, propValue)
```

**常用属性：**

| 属性名      | 类型      | 说明       |
| -------- | ------- | -------- |
| visible  | Boolean | 是否可见     |
| readOnly | Boolean | 是否只读     |
| disabled | Boolean | 是否禁用     |
| required | Boolean | 是否必填     |
| loading  | Boolean | 加载状态（按鈕） |

**示例：**

```javascript
this.$('textField_xxx').set('visible', false);
this.$('textField_xxx').set('readOnly', true);
this.$('button_xxx').set('loading', true);
```

### 1.5 获取组件状态 (getBehavior)

```javascript
this.$(fieldId).getBehavior()
```

**返回值：**

| 状态值      | 说明         |
| -------- | ---------- |
| NORMAL   | 正常态，即输入态  |
| READONLY | 只读态        |
| DISABLED | 禁用态        |
| HIDDEN   | 隐藏态        |

**示例：**

```javascript
export function getBehavior() {
  // 获取输入框组件的状态，并将其打印出来
  const behavior = this.$('textField_xxx').getBehavior();
  console.log(`text behavior: ${behavior}`);
}
```

### 1.6 设置组件状态 (setBehavior)

```javascript
this.$(fieldId).setBehavior(behavior)
```

**参数：**

| 参数       | 类型     | 说明                                       |
| -------- | ------ | ---------------------------------------- |
| behavior | String | 'NORMAL' / 'READONLY' / 'DISABLED' / 'HIDDEN' |

**示例：**

```javascript
export function setBehavior() {
  // 将输入框组件的状态设置为禁用（DISABLED）状态
  this.$('textField_xxx').setBehavior('DISABLED');
  
  // 隐藏组件
  this.$('imageField_xxx').setBehavior('HIDDEN');
  
  // 显示组件
  this.$('imageField_xxx').setBehavior('NORMAL');
}
```

### 1.7 重置组件状态 (resetBehavior)

```javascript
this.$(fieldId).resetBehavior()
```

**示例：**

```javascript
export function resetBehavior() {
  // 重置输入框组件的状态
  this.$('textField_xxx').resetBehavior();
}
```

### 1.8 重置组件值 (reset)

```javascript
this.$(fieldId).reset(toDefault)
```

**参数：**

| 参数         | 类型      | 必填 | 默认值   | 说明              |
| ---------- | ------- | -- | ----- | --------------- |
| toDefault  | Boolean | 否  | true  | 是否重置为表单组件的默认值 |

**示例：**

```javascript
export function reset() {
  // 重置输入框组件的值
  this.$('textField_xxx').reset();
}
```

### 1.9 执行组件校验 (validate)

```javascript
this.$(fieldId).validate(callback)
```

**参数：**

| 参数       | 类型       | 必填 | 说明     |
| -------- | -------- | -- | ------ |
| callback | Function | 否  | 校验回调函数 |

**回调函数参数：**

| 参数     | 类型                  | 说明   |
| ------ | ------------------- | ---- |
| errors | string[] \| null    | 错误信息 |
| values | object \| null      | 表单组件值 |

**示例：**

```javascript
export function validate() {
  // 执行输入框组件的校验，如果校验失败则在 console 中打印 errors 和 values
  this.$('textField_xxx').validate((errors, values) => {
    console.log(JSON.stringify({errors, values}, null, 2));
  });
}
```

### 1.10 关闭组件校验 (disableValid)

```javascript
this.$(fieldId).disableValid()
```

**示例：**

```javascript
export function disableValid() {
  this.$('textField_xxx').disableValid();
}
```

### 1.11 开启组件校验 (enableValid)

```javascript
this.$(fieldId).enableValid(doValidate)
```

**参数：**

| 参数          | 类型      | 必填 | 默认值   | 说明         |
| ----------- | ------- | -- | ----- | ---------- |
| doValidate  | Boolean | 否  | false | 是否马上执行校验 |

**示例：**

```javascript
export function enableValid() {
  // 开启输入组件的校验，并立即执行
  this.$('textField_xxx').enableValid(true);
}
```

### 1.12 设置组件校验规则 (setValidation)

```javascript
this.$(fieldId).setValidation(rules, doValidate)
```

**参数：**

| 参数          | 类型       | 必填 | 默认值   | 说明         |
| ----------- | -------- | -- | ----- | ---------- |
| rules       | IRule[]  | 是  | -     | 校验规则数组    |
| doValidate  | Boolean  | 否  | false | 是否马上执行校验 |

**IRule 结构：**

| 属性      | 类型     | 必填 | 说明     |
| ------- | ------ | -- | ------ |
| type    | string | 是  | 校验类型   |
| param   | any    | 否  | 校验参数   |
| message | string | 否  | 错误提示信息 |

**支持的校验类型：**

| 校验类型           | 参数示例                    | 说明     |
| -------------- | ----------------------- | ------ |
| required       | -                       | 必填     |
| minLength      | {"param": "23"}         | 最小长度   |
| maxLength      | {"param": "23"}         | 最大长度   |
| email          | -                       | 邮箱格式   |
| mobile         | -                       | 手机号格式  |
| url            | -                       | 网址格式   |
| minValue       | {"param": "3"}          | 最小值    |
| maxValue       | {"param": "3"}          | 最大值    |
| customValidate | {"param": (value, rule) => { return true; }} | 自定义函数 |

**示例：**

```javascript
export function setValidation() {
  // 设置输入组件的校验规则：必填、最大长度为 10
  this.$('textField_xxx').setValidation([
    { type: 'required' },
    { type: 'maxLength', param: '10' },
    {
      type: 'customValidate',
      param: (value, rule) => {
        if(/^\d*$/.test(value)) {
          return true;
        }
        return rule.message;
      },
      message: '只能输入数字'
    }
  ]);
}
```

### 1.13 重置组件校验规则 (resetValidation)

```javascript
this.$(fieldId).resetValidation(doValidate)
```

**参数：**

| 参数          | 类型      | 必填 | 默认值   | 说明         |
| ----------- | ------- | -- | ----- | ---------- |
| doValidate  | Boolean | 否  | false | 是否马上执行校验 |

**示例：**

```javascript
export function resetValidation() {
  // 重置输入框组件的校验规则，并立即校验
  this.$('textField_xxx').resetValidation(true);
}
```

***

## 二、数据源 API

### 2.1 加载数据源

```javascript
this.dataSourceMap.dataSourceName.load(params)
```

**⚠️ 重要：不同 API 返回格式不同！**

| API 类型 | 成功返回值                          | 说明         |
| ------ | ------------------------------ | ---------- |
| 查询 API | `{success: true, data: [...]}` | 返回数据列表     |
| 新增 API | `"FINST-xxx"` (字符串)            | 返回表单实例 ID  |
| 编辑 API | `null`                         | 成功时返回 null |
| 删除 API | `null`                         | 成功时返回 null |

**示例：**

```javascript
var that = this;
this.dataSourceMap.getDataList.load({
  page: 1,
  pageSize: 10
}).then(function(response) {
  if (response === null) {
    console.log('操作成功（返回null）');
    return;
  }
  console.log('数据:', response.data);
}).catch(function(error) {
  console.error('错误:', error);
});
```

### 2.2 重新加载数据源

```javascript
this.reloadDataSource()
```

**示例：**

```javascript
var that = this;
this.reloadDataSource().then(function() {
  that.utils.toast({type: 'success', title: '刷新成功'});
});
```

***

## 三、工具类 API

### 3.1 Toast 提示

```javascript
this.utils.toast(config)
```

**参数：**

| 参数      | 类型     | 必填 | 说明                    |
| ------- | ------ | -- | --------------------- |
| type    | String | 否  | success/error/warning |
| title   | String | 是  | 标题                    |
| content | String | 否  | 详细内容                  |

**示例：**

```javascript
this.utils.toast({type: 'success', title: '操作成功'});
this.utils.toast({type: 'error', title: '操作失败', content: '请检查网络'});
```

### 3.2 对话框

```javascript
this.utils.dialog(config)
```

**参数：**

| 参数       | 类型       | 默认值     | 说明                 |
| -------- | -------- | ------- | ------------------ |
| type     | String   | 'alert' | alert/confirm/show |
| title    | String   | -       | 标题                 |
| content  | String   | -       | 内容                 |
| onOk     | Function | -       | 确认回调               |
| onCancel | Function | -       | 取消回调               |

**示例：**

```javascript
this.utils.dialog({
  type: 'confirm',
  title: '确认删除',
  content: '删除后无法恢复，是否继续？',
  onOk: function() { console.log('确认'); },
  onCancel: function() { console.log('取消'); }
});
```

### 3.3 格式化工具

```javascript
this.utils.formatter(type, value, format)
```

**类型：**

| 类型       | 说明      | 示例                  |
| -------- | ------- | ------------------- |
| date     | 日期格式化   | 2022-01-29          |
| money    | 金额格式化   | 10,000.99           |
| cnmobile | 手机号格式化  | +86 1565 2988 282   |
| card     | 银行卡号格式化 | 1565 2988 2821 2233 |

**示例：**

```javascript
var dateStr = this.utils.formatter('date', new Date(), 'YYYY-MM-DD');
var dateTimeStr = this.utils.formatter('date', new Date(), 'YYYY-MM-DD HH:mm:ss');
var moneyStr = this.utils.formatter('money', '10000.99', ',');
```

### 3.4 获取日期时间范围

```javascript
this.utils.getDateTimeRange(when, type)
```

**参数：**

| 参数   | 类型             | 默认值        | 说明                                           |
| ---- | -------------- | ---------- | -------------------------------------------- |
| when | Date/Timestamp | new Date() | 指定日期                                         |
| type | String         | 'day'      | 区间类型: year/month/week/day/hour/minute/second |

**返回值：** \[开始时间戳, 结束时间戳]

```javascript
// 获取当天开始结束时间
var range = this.utils.getDateTimeRange();
var dayStart = range[0];
var dayEnd = range[1];

// 获取当月开始结束时间
var monthRange = this.utils.getDateTimeRange(new Date(), 'month');
```

### 3.5 获取登录用户信息

```javascript
// 获取用户ID
var userId = this.utils.getLoginUserId();

// 获取用户名称
var userName = this.utils.getLoginUserName();

// 获取语言环境
var locale = this.utils.getLocale();

// 是否移动端
var isMobile = this.utils.isMobile();
```

### 3.6 判断页面类型

```javascript
// 判断当前页面是否是数据提交页面
var isSubmissionPage = this.utils.isSubmissionPage();

// 判断当前页面是否是数据查看页面
var isViewPage = this.utils.isViewPage();
```

**示例：**

```javascript
export function someFunctionName() {
  console.log('isSubmissionPage', this.utils.isSubmissionPage());
  console.log('isViewPage', this.utils.isViewPage());
}
```

### 3.7 动态加载远程脚本

```javascript
this.utils.loadScript(url)
```

**参数：**

| 参数    | 类型     | 必填 | 说明        |
| ----- | ------ | -- | --------- |
| url   | String | 是  | 脚本URL地址   |

**示例：**

```javascript
export function didMount() {
  this.utils.loadScript('https://g.alicdn.com/code/lib/qrcodejs/1.0.0/qrcode.min.js').then(() => {
    var qrcode = new QRCode(document.getElementById('qrcode'), {
      text: "http://jindo.dev.naver.com/collie",
      width: 128,
      height: 128,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
  });
}
```

### 3.8 打开新页面

```javascript
this.utils.openPage(url)
```

**参数：**

| 参数    | 类型     | 必填 | 说明        |
| ----- | ------ | -- | --------- |
| url   | String | 是  | 页面URL地址   |

**说明：** 如果在钉钉环境下，会使用钉钉 API 打开新页面，体验会更友好一些。

**示例：**

```javascript
export function someFunctionName() {
  this.utils.openPage('/workbench');
}
```

### 3.9 图片预览

```javascript
this.utils.previewImage(config)
```

**参数：**

| 参数       | 类型     | 必填 | 说明        |
| -------- | ------ | -- | --------- |
| current  | String | 是  | 当前预览的图片URL |

**示例：**

```javascript
export function previewImg() {
  this.utils.previewImage({
    current: 'https://img.alicdn.com/tfs/TB1JUnZ2GL7gK0jSZFBXXXZZpXa-260-192.png_.webp'
  });
}
```

***

## 四、Dialog 组件 API

> 宜搭提供了一个对话框组件用于展示对话框形式的内容展示，同时提供了一些 API 来操作对话框的行为。

### 4.1 显示对话框 (show)

```javascript
this.$(fieldId).show(callback)
```

**参数：**

| 参数       | 类型       | 必填 | 说明           |
| -------- | -------- | -- | ------------ |
| callback | Function | 否  | 对话框展示后的回调函数 |

**示例：**

```javascript
export function openDialog() {
  this.$('dialog_xxx').show(() => {
    console.log('Dialog is open');
  });
}
```

### 4.2 关闭对话框 (hide)

```javascript
this.$(fieldId).hide()
```

**示例：**

```javascript
export function closeDialog() {
  this.$('dialog_xxx').hide();
}
```

***

## 五、函数调用 API

### 5.1 调用其他函数

```javascript
this.functionName(params)
```

**示例：**

```javascript
export function hello(name) {
  this.utils.toast({
    title: 'Hello ' + name,
    type: 'success'
  });
}

export function onClick() {
  var name = this.$('textField_xxx').getValue();
  this.hello(name);  // 调用hello函数
}
```

***

## 六、跨应用数据源 API

### 6.1 查询表单数据

```javascript
this.dataSourceMap.queryDataSource.load({
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify(searchConditions),
  pageSize: 100,
  currentPage: 1
})
```

### 6.2 查询条件操作符

| 操作符  | 说明   |
| ---- | ---- |
| eq   | 等于   |
| ne   | 不等于  |
| gt   | 大于   |
| gte  | 大于等于 |
| lt   | 小于   |
| lte  | 小于等于 |
| like | 包含   |
| in   | 在列表中 |

### 6.3 不同 API 返回格式（重要）

| API类型                    | 成功返回值                          | 说明        |
| ------------------------ | ------------------------------ | --------- |
| 查询API                    | `{success: true, data: [...]}` | 返回数据列表    |
| 新增API (`saveFormData`)   | `"FINST-xxx"` (字符串)            | 返回表单实例ID  |
| 编辑API (`updateFormData`) | `null`                         | 成功时返回null |
| 删除API (`deleteFormData`) | `null`                         | 成功时返回null |

> ⚠️ **必须使用** **`checkApiSuccess()`** **工具函数判断结果**，详见 `references/common-core/error-guide.md`

### 6.4 API参数名配对表（易错！）

| 参数名                  | 适用API    | 必填 | 说明          |
| -------------------- | -------- | -- | ----------- |
| `appId`              | 新增/编辑/删除 | 是  | 应用ID        |
| `formUuid`           | 新增/编辑/删除 | 是  | 表单UUID      |
| `formInstId`         | 编辑/删除    | 是  | 表单实例ID      |
| `formDataJson`       | **新增**   | 是  | 表单数据JSON字符串 |
| `updateFormDataJson` | **编辑**   | 是  | 更新数据JSON字符串 |

```javascript
// 新增 - 用 formDataJson
this.dataSourceMap.add.load({
  appId: CONFIG.APP_ID,
  formUuid: CONFIG.FORM_UUID,
  formDataJson: JSON.stringify(formData)  // 新增用 formDataJson
});

// 编辑 - 用 updateFormDataJson
this.dataSourceMap.edit.load({
  appId: CONFIG.APP_ID,
  formUuid: CONFIG.FORM_UUID,
  formInstId: formInstId,
  updateFormDataJson: JSON.stringify(formData)  // 编辑用 updateFormDataJson
});
```

***

## 七、流程相关 API（自动化脚本）

### 4.1 获取流程变量

```javascript
this.getProcessVariables()
```

### 4.2 设置流程变量

```javascript
this.setProcessVariable(key, value)
```

**示例：**

```javascript
var amount = this.$('numberField_xxx').getValue();
if (amount > 10000) {
  this.setProcessVariable('approvalLevel', 'high');
}
```

***

## 六、子表列显隐控制

> **实验性 API**，宜搭官方未公开文档，但实测可用。用于在运行时动态控制子表单中某一列的显示/隐藏。

### 6.1 API 格式

```javascript
this.$('tableField_xxx').setFieldProp(columnId, 'behavior', behavior);
```

| 参数         | 类型     | 说明                                                 |
| ---------- | ------ | -------------------------------------------------- |
| columnId   | String | 子表内列字段的组件 ID                                       |
| 'behavior' | String | 固定写法                                               |
| behavior   | String | `'HIDDEN'`（隐藏） / `'NORMAL'`（显示） / `'READONLY'`（只读） |

### 6.2 示例

```javascript
// 根据表单类型动态显示/隐藏子表列
export function handleTypeChange(value) {
  var table = this.$('tableField_xxx');
  if (value === 'typeA') {
    table.setFieldProp('numberField_price', 'behavior', 'HIDDEN');   // 隐藏价格列
    table.setFieldProp('textField_remark', 'behavior', 'NORMAL');    // 显示备注列
  } else {
    table.setFieldProp('numberField_price', 'behavior', 'NORMAL');   // 显示价格列
    table.setFieldProp('textField_remark', 'behavior', 'HIDDEN');    // 隐藏备注列
  }
}
```

> **注意**：`columnId` 是子表内部的字段 ID，不是子表本身的 ID。

***

## 七、路由跳转 API（utils.router）

### 跳转到指定页面

```javascript
// push：添加历史记录后跳转
utils.router.push({ path: '/path/to/page' });

// replace：替换当前历史记录后跳转（不可回退）
utils.router.replace({ path: '/path/to/page' });
```

### 携带参数跳转

```javascript
// 通过 URL query 参数跳转
utils.router.push({
  path: '/path/to/page',
  query: {
    instanceId: 'xxx',
    mode: 'edit'
  }
});
```

### 读取 URL 参数

```javascript
// 在目标页面读取传入的参数
export function didMount() {
  var params = utils.router.getQuery();
  var instanceId = params.instanceId;
  var mode = params.mode || 'view';
}
```

### 完整跳转示例

```javascript
// 从列表页跳转到详情页，传递实例 ID
export function handleViewDetail(rowData) {
  var instanceId = rowData.instanceId;
  utils.router.push({
    path: '/apps/YOUR_APP_ID/forms/YOUR_FORM_ID',
    query: { instanceId: instanceId, mode: 'view' }
  });
}

// 详情页 didMount 读取参数并加载数据
export function didMount() {
  var params = utils.router.getQuery();
  if (params.instanceId) {
    this.dataSourceMap.getDetail.load({ instanceId: params.instanceId });
  }
}
```

***

## 八、this 指向处理

### 8.1 问题：嵌套函数中 this 指向改变

```javascript
// ❌ 错误
export function wrongExample() {
  this.dataSourceMap.xxx.load(function(ret) {
    this.$('field').setValue(ret); // this 指向错误！
  });
}
```

### 8.2 解决方案

```javascript
// ✅ 正确
export function correctExample() {
  var that = this;  // 保存 this 引用
  this.dataSourceMap.xxx.load(function(ret) {
    that.$('field').setValue(ret);  // 使用 that
  });
}
```

***

*文档版本: v2.1.0*

### 版本更新记录

#### v2.1.0 (2026-03-21)
- **新增** 组件状态 API：getBehavior、setBehavior、resetBehavior
- **新增** 组件校验 API：validate、disableValid、enableValid、setValidation、resetValidation
- **新增** 工具类 API：isSubmissionPage、isViewPage、loadScript、openPage、previewImage
- **新增** Dialog 组件 API：show、hide
- **优化** 章节编号统一调整
- **参考** 宜搭开发API规范.md 完整同步
