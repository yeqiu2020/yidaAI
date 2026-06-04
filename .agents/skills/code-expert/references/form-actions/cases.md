# 表单动作代码 - 典型案例库

> 表单动作场景的常见业务案例，含完整可运行代码
> 版本: v1.0.0

---

## 一、字段联动场景

### 1.1 省市区三级联动

**场景**：选择省份后，动态更新城市下拉选项；选择城市后，动态更新区县选项。

```javascript
/**
 * 省市区三级联动
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  FIELD_IDS: {
    PROVINCE: 'selectField_xxx',   // 省份
    CITY: 'selectField_yyy',       // 城市
    DISTRICT: 'selectField_zzz'   // 区县
  }
};

// 城市数据映射
var CITY_DATA = {
  '北京市': ['朝阳区', '海淀区', '东城区', '西城区', '丰台区'],
  '上海市': ['浦东新区', '黄浦区', '静安区', '徐汇区', '长宁区'],
  '广东省': ['广州市', '深圳市', '珠海市', '佛山市', '东莞市'],
  '浙江省': ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市']
};

var DISTRICT_DATA = {
  '广州市': ['天河区', '越秀区', '荔湾区', '海珠区', '白云区'],
  '深圳市': ['南山区', '福田区', '罗湖区', '宝安区', '龙岗区']
};

export function didMount() {
  console.log('省市区联动已加载，版本号: v1.0.0');
}

/**
 * 省份变化处理
 * 绑定到：省份字段的 onChange 事件
 */
export function onProvinceChange(event) {
  var province = event.value;
  var cityField = this.$(CONFIG.FIELD_IDS.CITY);
  var districtField = this.$(CONFIG.FIELD_IDS.DISTRICT);

  // 清空下级字段
  cityField.setValue('');
  districtField.setValue('');
  cityField.set('dataSource', []);
  districtField.set('dataSource', []);

  if (!province) return;

  var cities = CITY_DATA[province] || [];
  var options = [];
  for (var i = 0; i < cities.length; i++) {
    options.push({ label: cities[i], value: cities[i] });
  }
  cityField.set('dataSource', options);
}

/**
 * 城市变化处理
 * 绑定到：城市字段的 onChange 事件
 */
export function onCityChange(event) {
  var city = event.value;
  var districtField = this.$(CONFIG.FIELD_IDS.DISTRICT);

  districtField.setValue('');
  districtField.set('dataSource', []);

  if (!city) return;

  var districts = DISTRICT_DATA[city] || [];
  var options = [];
  for (var i = 0; i < districts.length; i++) {
    options.push({ label: districts[i], value: districts[i] });
  }
  districtField.set('dataSource', options);
}
```

---

### 1.2 关联表单数据回填

**场景**：选择客户（关联表单字段）后，自动回填客户电话、地址等信息。

> ⚠️ 注意：关联表单字段返回的是对象数组，字段 ID 格式为 `associationFormField_xxx` 或 `associationFormField_xxx_id`

```javascript
/**
 * 关联表单数据回填
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  FIELD_IDS: {
    CUSTOMER: 'associationFormField_xxx',  // 客户关联字段
    PHONE: 'textField_yyy',               // 电话
    ADDRESS: 'textField_zzz',             // 地址
    LEVEL: 'selectField_aaa'              // 客户等级
  }
};

export function didMount() {
  console.log('数据回填功能已加载，版本号: v1.0.0');
}

/**
 * 客户选择变化处理
 * 绑定到：客户关联字段的 onChange 事件
 */
export function onCustomerChange(event) {
  var customer = event.value;

  // 清空回填字段
  this.$(CONFIG.FIELD_IDS.PHONE).setValue('');
  this.$(CONFIG.FIELD_IDS.ADDRESS).setValue('');
  this.$(CONFIG.FIELD_IDS.LEVEL).setValue('');

  if (!customer || customer.length === 0) return;

  // 关联表单返回对象数组，取第一个
  var customerData = customer[0];

  // 关联表单字段的 formData 层级说明：
  // customerData.formData.textField_phone  （如果是嵌套结构）
  // customerData.textField_phone           （如果是扁平结构）
  var formData = customerData.formData || customerData;

  this.$(CONFIG.FIELD_IDS.PHONE).setValue(formData['textField_phone'] || '');
  this.$(CONFIG.FIELD_IDS.ADDRESS).setValue(formData['textField_address'] || '');
  this.$(CONFIG.FIELD_IDS.LEVEL).setValue(formData['selectField_level'] || '');
}
```

---

### 1.3 金额字段格式化显示（onChange 实时计算）

**场景**：输入数量和单价，实时计算小计金额。

```javascript
/**
 * 价格实时计算
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  FIELD_IDS: {
    QUANTITY: 'numberField_qty',     // 数量
    UNIT_PRICE: 'numberField_price', // 单价
    SUBTOTAL: 'numberField_sub',     // 小计
    TAX_RATE: 'numberField_tax',     // 税率（%）
    TAX_AMOUNT: 'numberField_taxAmt', // 税额
    TOTAL: 'numberField_total'       // 含税总价
  }
};

export function didMount() {
  console.log('价格计算已加载，版本号: v1.0.0');
}

/**
 * 重新计算所有金额
 */
function recalculate(that) {
  var qty = parseFloat(that.$(CONFIG.FIELD_IDS.QUANTITY).getValue()) || 0;
  var price = parseFloat(that.$(CONFIG.FIELD_IDS.UNIT_PRICE).getValue()) || 0;
  var taxRate = parseFloat(that.$(CONFIG.FIELD_IDS.TAX_RATE).getValue()) || 0;

  var subtotal = qty * price;
  var taxAmount = subtotal * taxRate / 100;
  var total = subtotal + taxAmount;

  // 保留两位小数
  that.$(CONFIG.FIELD_IDS.SUBTOTAL).setValue(Math.round(subtotal * 100) / 100);
  that.$(CONFIG.FIELD_IDS.TAX_AMOUNT).setValue(Math.round(taxAmount * 100) / 100);
  that.$(CONFIG.FIELD_IDS.TOTAL).setValue(Math.round(total * 100) / 100);
}

/**
 * 数量变化处理
 * 绑定到：数量字段的 onChange 事件
 */
export function onQuantityChange(event) {
  recalculate(this);
}

/**
 * 单价变化处理
 * 绑定到：单价字段的 onChange 事件
 */
export function onUnitPriceChange(event) {
  recalculate(this);
}

/**
 * 税率变化处理
 * 绑定到：税率字段的 onChange 事件
 */
export function onTaxRateChange(event) {
  recalculate(this);
}
```

---

## 二、子表处理场景

### 2.1 子表金额汇总到主表

**场景**：子表中包含金额字段，变化时自动汇总到主表合计字段。

> ⚠️ 重要：子表 onChange 必须加全局锁，防止死循环！详见 `spec.md` 第四节。

```javascript
/**
 * 子表金额汇总
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  FIELD_IDS: {
    SUB_TABLE: 'tableField_xxx',        // 子表
    SUB_AMOUNT: 'numberField_amount',   // 子表金额字段
    SUB_QTY: 'numberField_qty',         // 子表数量字段
    TOTAL_AMOUNT: 'numberField_total',  // 主表金额合计
    TOTAL_QTY: 'numberField_totalQty'  // 主表数量合计
  }
};

// 全局锁，防止子表 setValue 触发 onChange 导致死循环
var isProcessing = false;

export function didMount() {
  console.log('子表汇总已加载，版本号: v1.0.0');
}

/**
 * 子表数据变化处理
 * 绑定到：子表字段的 onChange 事件
 */
export function onSubTableChange(event) {
  if (isProcessing) return;

  try {
    isProcessing = true;
    var value = event.value || [];

    var totalAmount = 0;
    var totalQty = 0;

    for (var i = 0; i < value.length; i++) {
      var row = value[i];
      totalAmount += parseFloat(row[CONFIG.FIELD_IDS.SUB_AMOUNT]) || 0;
      totalQty += parseFloat(row[CONFIG.FIELD_IDS.SUB_QTY]) || 0;
    }

    this.$(CONFIG.FIELD_IDS.TOTAL_AMOUNT).setValue(Math.round(totalAmount * 100) / 100);
    this.$(CONFIG.FIELD_IDS.TOTAL_QTY).setValue(totalQty);
  } catch (error) {
    console.error('子表汇总错误:', error);
  } finally {
    isProcessing = false;
  }
}
```

---

### 2.2 子表字段重复检查

**场景**：子表中某字段（如产品编码）不允许重复，重复时提示并撤销。

```javascript
/**
 * 子表重复检查
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  FIELD_IDS: {
    SUB_TABLE: 'tableField_xxx',
    CHECK_FIELD: 'textField_code'  // 需要检查重复的字段（如产品编码）
  }
};

var isProcessing = false;

export function didMount() {
  console.log('子表重复检查已加载，版本号: v1.0.0');
}

/**
 * 子表变化时检查重复
 * 绑定到：子表字段的 onChange 事件
 */
export function onSubTableChange(event) {
  if (isProcessing) return;

  var extra = event.extra;
  // 只在指定字段变化时检查
  if (!extra || extra.fieldId !== CONFIG.FIELD_IDS.CHECK_FIELD) return;

  var newValue = extra.changes && extra.changes.value;
  if (!newValue) return;

  var value = event.value || [];
  var duplicateCount = 0;

  for (var i = 0; i < value.length; i++) {
    if (value[i][CONFIG.FIELD_IDS.CHECK_FIELD] === newValue) {
      duplicateCount++;
    }
    if (duplicateCount >= 2) break;
  }

  if (duplicateCount >= 2) {
    this.utils.toast({
      type: 'warning',
      title: '产品编码"' + newValue + '"已存在，不允许重复！'
    });

    // 删除最后一行（刚添加的重复行）
    try {
      isProcessing = true;
      var newArr = [];
      for (var j = 0; j < value.length - 1; j++) {
        newArr.push(value[j]);
      }
      this.$(CONFIG.FIELD_IDS.SUB_TABLE).setValue(newArr, { triggerChange: false });
    } catch (error) {
      console.error('删除重复行失败:', error);
    } finally {
      isProcessing = false;
    }
  }
}
```

---

### 2.3 成员字段拆分到子表

**场景**：主表成员控件多选多个人员，点击按钮后拆分到子表，每行一个成员。

```javascript
/**
 * 成员拆分到子表
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  FIELD_IDS: {
    MEMBERS: 'employeeField_xxx',    // 主表成员控件（多选）
    SUB_TABLE: 'tableField_yyy',     // 子表
    SUB_MEMBER: 'employeeField_zzz', // 子表成员控件（单选）
    SUB_DEPT: 'textField_dept'       // 子表部门字段（可选）
  }
};

export function didMount() {
  console.log('成员拆分功能已加载，版本号: v1.0.0');
}

/**
 * 点击"拆分成员"按钮后执行
 * 绑定到：拆分按钮的 onClick 事件
 */
export function splitMembersToSubTable() {
  var members = this.$(CONFIG.FIELD_IDS.MEMBERS).getValue();

  if (!members || members.length === 0) {
    this.utils.toast({ type: 'warning', title: '请先选择人员' });
    return;
  }

  var newData = [];
  for (var i = 0; i < members.length; i++) {
    var row = {};
    // 子表成员字段接受数组格式
    row[CONFIG.FIELD_IDS.SUB_MEMBER] = [members[i]];
    newData.push(row);
  }

  this.$(CONFIG.FIELD_IDS.SUB_TABLE).setValue(newData);
  this.utils.toast({ type: 'success', title: '已拆分 ' + members.length + ' 名成员' });
}

/**
 * 成员变化时自动同步到子表
 * 绑定到：成员字段的 onChange 事件（如需实时同步）
 */
export function onMembersChange(event) {
  var members = event.value;
  var subTable = this.$(CONFIG.FIELD_IDS.SUB_TABLE);

  if (!members || members.length === 0) {
    subTable.setValue([]);
    return;
  }

  var newData = [];
  for (var i = 0; i < members.length; i++) {
    var row = {};
    row[CONFIG.FIELD_IDS.SUB_MEMBER] = [members[i]];
    newData.push(row);
  }

  subTable.setValue(newData);
}
```

---

## 三、表单提交场景

### 3.1 提交前数据校验与处理

**场景**：在表单提交前进行自定义校验，并对数据进行预处理。

```javascript
/**
 * 提交前校验与处理
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  FIELD_IDS: {
    START_DATE: 'dateField_start',
    END_DATE: 'dateField_end',
    AMOUNT: 'numberField_amount',
    REMARK: 'textField_remark',
    STATUS: 'selectField_status'
  }
};

export function didMount() {
  console.log('提交校验已加载，版本号: v1.0.0');
}

/**
 * 提交按钮点击前校验
 * 绑定到：提交按钮的 onClick 事件（在提交前执行）
 */
export function beforeSubmit() {
  var startDate = this.$(CONFIG.FIELD_IDS.START_DATE).getValue();
  var endDate = this.$(CONFIG.FIELD_IDS.END_DATE).getValue();
  var amount = parseFloat(this.$(CONFIG.FIELD_IDS.AMOUNT).getValue()) || 0;

  // 校验1：日期范围
  if (startDate && endDate && startDate > endDate) {
    this.utils.toast({ type: 'error', title: '开始日期不能大于结束日期' });
    return false;
  }

  // 校验2：金额范围
  if (amount <= 0) {
    this.utils.toast({ type: 'error', title: '金额必须大于0' });
    return false;
  }

  // 自动设置状态
  this.$(CONFIG.FIELD_IDS.STATUS).setValue('待审批');

  return true;
}

/**
 * 提交成功后处理
 * 绑定到：表单的 onSubmitSuccess 事件
 */
export function onSubmitSuccess() {
  this.utils.toast({ type: 'success', title: '提交成功，等待审批' });
}
```

---

### 3.2 新增/编辑另一张表单数据

**场景**：在当前表单中，通过 API 向另一张表单写入数据。

> 注意：跨表查询详情请参考 `cross-form-query.md`

```javascript
/**
 * 跨表新增数据
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  DATA_SOURCE: {
    ADD_ORDER: 'addOrderDS'  // 新增订单的数据源名称
  },
  FIELD_IDS: {
    PRODUCT: 'textField_product',
    QTY: 'numberField_qty',
    PRICE: 'numberField_price'
  }
};

export function didMount() {
  console.log('跨表写入已加载，版本号: v1.0.0');
}

/**
 * 检查API调用结果（通用工具函数）
 */
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true;
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;
  if (res && (res.success === true || res.success === 1)) return true;
  if (res && (res.data || (res.result && res.result.data))) return true;
  return false;
}

/**
 * 同步数据到订单表
 * 绑定到：同步按钮的 onClick 事件
 */
export function syncToOrderForm() {
  var that = this;

  var product = this.$(CONFIG.FIELD_IDS.PRODUCT).getValue();
  var qty = this.$(CONFIG.FIELD_IDS.QTY).getValue();
  var price = this.$(CONFIG.FIELD_IDS.PRICE).getValue();

  if (!product) {
    this.utils.toast({ type: 'warning', title: '请先填写产品名称' });
    return;
  }

  // 构建表单数据
  var formData = {
    textField_productName: product,
    numberField_quantity: qty,
    numberField_unitPrice: price
  };

  this.dataSourceMap[CONFIG.DATA_SOURCE.ADD_ORDER].load({
    formDataJson: JSON.stringify(formData)  // ⚠️ 新增用 formDataJson
  }).then(function(res) {
    if (checkApiSuccess(res)) {
      that.utils.toast({ type: 'success', title: '同步成功' });
    } else {
      that.utils.toast({ type: 'error', title: '同步失败，请重试' });
    }
  }).catch(function(error) {
    console.error('同步失败:', error);
    that.utils.toast({ type: 'error', title: '同步异常' });
  });
}
```

---

## 四、页面初始化场景

### 4.1 页面加载时自动查询并填充

**场景**：页面打开时，自动查询当前用户的相关数据并初始化字段。

```javascript
/**
 * 页面初始化加载数据
 * 版本号: v1.0.0
 * 代码类型: formAction
 */

var CONFIG = {
  DATA_SOURCE: {
    QUERY_USER_INFO: 'queryUserInfoDS'  // 查询用户信息的数据源
  },
  FIELD_IDS: {
    DEPT: 'textField_dept',
    POSITION: 'textField_position',
    MANAGER: 'employeeField_manager'
  }
};

export function didMount() {
  console.log('页面初始化已加载，版本号: v1.0.0');
  this.loadUserInfo();
}

/**
 * 加载当前用户信息并填充
 */
export function loadUserInfo() {
  var that = this;

  // 获取当前登录用户信息
  var currentUser = this.utils.getLoginUserId ? this.utils.getLoginUserId() : '';

  if (!currentUser || !this.dataSourceMap[CONFIG.DATA_SOURCE.QUERY_USER_INFO]) {
    return;
  }

  this.dataSourceMap[CONFIG.DATA_SOURCE.QUERY_USER_INFO].load({
    searchFieldJson: JSON.stringify([{
      fieldId: 'employeeField_userid',
      operator: 'like',
      fieldValue: currentUser
    }]),
    currentPage: 1,
    pageSize: 1
  }).then(function(res) {
    var result = res.result || res || {};
    var dataList = result.data || res.data || [];

    if (dataList.length === 0) return;

    var userInfo = dataList[0].formData || dataList[0];

    // 自动填充用户信息
    that.$(CONFIG.FIELD_IDS.DEPT).setValue(userInfo['textField_dept'] || '');
    that.$(CONFIG.FIELD_IDS.POSITION).setValue(userInfo['textField_position'] || '');

    if (userInfo['employeeField_manager']) {
      that.$(CONFIG.FIELD_IDS.MANAGER).setValue(userInfo['employeeField_manager']);
    }
  }).catch(function(error) {
    console.error('加载用户信息失败:', error);
  });
}
```

---

*文档版本: v1.0.0*
*场景覆盖：字段联动 / 子表处理 / 提交校验 / 跨表写入 / 页面初始化*
