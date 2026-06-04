/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 自定义页面代码模板
 * 版本号: v2.1.0
 * 代码类型: customPage
 *
 * 使用说明:
 * 1. 复制本模板并重命名
 * 2. 修改CONFIG中的配置参数
 * 3. 实现具体的页面逻辑
 * 4. 在宜搭自定义页面的JS面板中粘贴本代码
 *
 * ⚠️ 重要提示:
 * - 所有 export function 必须用 function 关键字声明，禁止用箭头函数！
 *   箭头函数在宜搭运行时无法正确获取 this（组件上下文）
 * - Promise 回调内必须用 var that = this 保存 this 引用
 * - 弹窗 show() 后必须用 setTimeout(fn, 100) 延迟设置字段
 * - 新增用 formDataJson，编辑用 updateFormDataJson
 * 开发前必读：references/custom-pages/pitfalls.md
 */

// ===== 通用工具函数（必须保留）=====
/**
 * 检查宜搭API调用是否成功
 * 必须使用此函数判断，不同 API 返回格式完全不同！
 */
function checkApiSuccess(res) {
  if (res === null || res === undefined) return true;  // 编辑/删除成功
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) return true;  // 新增成功
  if (res && (res.success === true || res.success === 1)) return true;
  if (res && (res.data || (res.result && res.result.data))) return true;
  return false;
}

function getApiErrorMessage(res, defaultMsg) {
  if (res && res.errorMsg) return res.errorMsg;
  if (res && res.message) return res.message;
  return defaultMsg || '操作失败';
}

// ===== 配置参数 =====
var CONFIG = {
  APP_ID: 'APP_XXXXXXXXXXXXXXXXXXXX',  // 应用ID
  DATA_SOURCE: {
    QUERY: 'queryDataSource',    // 查询数据源
    ADD: 'addDataSource',        // 新增数据源
    EDIT: 'editDataSource',      // 编辑数据源
    DELETE: 'deleteDataSource'   // 删除数据源
  },
  FORM_UUID: {
    MAIN: 'FORM-XXXXXXXXXXXXXXXXXXXXXXXXXXXX'  // 表单UUID
  },
  FIELD_IDS: {
    TABLE_MAIN: 'table_main',      // 主表格 ID
    DIALOG_ADD: 'dialog_add',      // 新增弹窗 ID
    DIALOG_EDIT: 'dialog_edit',    // 编辑弹窗 ID
    // 新增弹窗字段
    ADD_NAME: 'textField_add_name',
    ADD_STATUS: 'radioField_add_status',
    // 编辑弹窗字段（必须与新增弹窗分开！）
    EDIT_NAME: 'textField_edit_name',
    EDIT_STATUS: 'radioField_edit_status'
  }
};

// ===== 页面状态 =====
var pageState = {
  currentPage: 1,
  pageSize: 10,
  totalCount: 0,
  selectedRow: null
};

/**
 * 页面加载完成时触发
 * 必须包含，用于初始化
 */
export function didMount() {
  console.log('自定义页面已加载，版本号: v2.1.0');
  this.loadTableData();
}

/**
 * 加载表格数据
 * 版本号: v2.1.0
 */
export function loadTableData() {
  var that = this;  // ← 必须：.then() 回调中用 that

  this.dataSourceMap[CONFIG.DATA_SOURCE.QUERY].load({
    formUuid: CONFIG.FORM_UUID.MAIN,
    currentPage: pageState.currentPage,
    pageSize: pageState.pageSize
  }).then(function(res) {
    if (checkApiSuccess(res)) {
      var result = res.result || res || {};
      var dataList = result.data || res.data || [];
      pageState.totalCount = result.totalCount || res.totalCount || 0;
      that.$(CONFIG.FIELD_IDS.TABLE_MAIN).setValue(dataList);
    } else {
      that.utils.toast({ type: 'error', title: '加载失败', content: getApiErrorMessage(res) });
    }
  }).catch(function(error) {
    console.error('加载数据错误:', error);
    that.utils.toast({ type: 'error', title: '加载异常' });
  });
}

/**
 * 打开新增弹窗
 * 绑定到：新增按钮 onClick
 */
export function openAddDialog() {
  var that = this;
  this.$(CONFIG.FIELD_IDS.DIALOG_ADD).show();
  // 弹窗 show() 后必须延迟 100ms 再操作字段！
  setTimeout(function() {
    that.$(CONFIG.FIELD_IDS.ADD_NAME).setValue('');
    that.$(CONFIG.FIELD_IDS.ADD_STATUS).setValue('');
  }, 100);
}

/**
 * 打开编辑弹窗
 * 绑定到：表格编辑按钮 handleRowAction({ action: 'edit' })
 * @param {object} rowData - 表格行数据（宜搭直接传输行数据对象）
 */
export function openEditDialog(rowData) {
  var that = this;
  pageState.selectedRow = rowData;
  this.$(CONFIG.FIELD_IDS.DIALOG_EDIT).show();
  setTimeout(function() {
    // 注意：编辑弹窗用 EDIT_ 开头的字段 ID，切勿和新增弹窗混用！
    that.$(CONFIG.FIELD_IDS.EDIT_NAME).setValue(rowData['textField_name'] || '');
    that.$(CONFIG.FIELD_IDS.EDIT_STATUS).setValue(rowData['radioField_status'] || '');
  }, 100);
}

/**
 * 确认新增
 * 绑定到：新增弹窗确认按钮 onClick
 */
export function confirmAdd() {
  var that = this;

  var formData = {};
  formData['textField_name'] = this.$(CONFIG.FIELD_IDS.ADD_NAME).getValue();
  formData['radioField_status'] = this.$(CONFIG.FIELD_IDS.ADD_STATUS).getValue();

  if (!formData['textField_name']) {
    this.utils.toast({ type: 'warning', title: '请填写名称' });
    return;
  }

  this.dataSourceMap[CONFIG.DATA_SOURCE.ADD].load({
    appId: CONFIG.APP_ID,
    formUuid: CONFIG.FORM_UUID.MAIN,
    formDataJson: JSON.stringify(formData)  // ⚠️ 新增用 formDataJson
  }).then(function(res) {
    if (checkApiSuccess(res)) {
      that.utils.toast({ type: 'success', title: '新增成功' });
      that.$(CONFIG.FIELD_IDS.DIALOG_ADD).hide();
      that.loadTableData();
    } else {
      that.utils.toast({ type: 'error', title: '新增失败', content: getApiErrorMessage(res) });
    }
  }).catch(function(error) {
    console.error('新增异常:', error);
    that.utils.toast({ type: 'error', title: '新增异常' });
  });
}

/**
 * 确认编辑
 * 绑定到：编辑弹窗确认按钮 onClick
 */
export function confirmEdit() {
  var that = this;

  var formData = {};
  formData['textField_name'] = this.$(CONFIG.FIELD_IDS.EDIT_NAME).getValue();
  formData['radioField_status'] = this.$(CONFIG.FIELD_IDS.EDIT_STATUS).getValue();

  if (!formData['textField_name']) {
    this.utils.toast({ type: 'warning', title: '请填写名称' });
    return;
  }

  this.dataSourceMap[CONFIG.DATA_SOURCE.EDIT].load({
    appId: CONFIG.APP_ID,
    formUuid: CONFIG.FORM_UUID.MAIN,
    formInstId: pageState.selectedRow && pageState.selectedRow.formInstId,
    updateFormDataJson: JSON.stringify(formData)  // ⚠️ 编辑用 updateFormDataJson
  }).then(function(res) {
    if (checkApiSuccess(res)) {
      that.utils.toast({ type: 'success', title: '编辑成功' });
      that.$(CONFIG.FIELD_IDS.DIALOG_EDIT).hide();
      that.loadTableData();
    } else {
      that.utils.toast({ type: 'error', title: '编辑失败', content: getApiErrorMessage(res) });
    }
  }).catch(function(error) {
    console.error('编辑异常:', error);
    that.utils.toast({ type: 'error', title: '编辑异常' });
  });
}

/**
 * 表格操作按钮统一处理入口
 * 绑定到：表格操作列按钮 onClick
 * 配置传参：{ action: 'edit' } 或 { action: 'delete' }
 * @param {object} event - 包含行数据和 action 类型
 */
export function handleRowAction(event) {
  var action = event.action || 'default';
  var rowData = event;  // 宜搭表格操作按钮直接传入行数据

  if (action === 'edit') {
    this.openEditDialog(rowData);
  } else if (action === 'delete') {
    this.confirmDelete(rowData);
  }
}

/**
 * 删除确认
 * 由 handleRowAction 内部调用
 */
export function confirmDelete(rowData) {
  var that = this;

  this.utils.dialog({
    type: 'confirm',
    title: '确认删除',
    content: '删除后无法恢复，是否继续？',
    onOk: function() {
      that.dataSourceMap[CONFIG.DATA_SOURCE.DELETE].load({
        appId: CONFIG.APP_ID,
        formUuid: CONFIG.FORM_UUID.MAIN,
        formInstId: rowData.formInstId
      }).then(function(res) {
        if (checkApiSuccess(res)) {
          that.utils.toast({ type: 'success', title: '删除成功' });
          that.loadTableData();
        } else {
          that.utils.toast({ type: 'error', title: '删除失败', content: getApiErrorMessage(res) });
        }
      }).catch(function(error) {
        console.error('删除异常:', error);
        that.utils.toast({ type: 'error', title: '删除异常' });
      });
    }
  });
}

/**
 * 行选择器回调
 * 绑定到：表格行选择器 onSelect 事件（注意不是 onChange）
 * @param {boolean} selected - 是否选中
 * @param {object} rowData - 当前操作行
 * @param {Array} selectedRows - 所有选中的行
 */
export function onSelect(selected, rowData, selectedRows) {
  console.log('选中行:', rowData);
  console.log('所有选中:', selectedRows);
  pageState.selectedRow = selectedRows && selectedRows.length > 0 ? selectedRows[selectedRows.length - 1] : null;
}

/**
 * 搜索按钮点击
 * 绑定到：搜索按钮 onClick
 */
export function onSearch() {
  pageState.currentPage = 1;
  this.loadTableData();
}

/**
 * 分页变更
 * 绑定到：分页组件 onChange
 * @param {number} page - 页码
 */
export function onPageChange(page) {
  pageState.currentPage = page;
  this.loadTableData();
}

/**
 * ===== 宜搭内配置步骤 =====
 *
 * 【步骤一】配置4个数据源（在宜搭应用后台 → 数据源】
 * | 名称 | API地址 | 请求方式 |
 * |------|---------|--------|
 * | queryDataSource | /dingtalk/web/{APP_ID}/v1/form/searchFormDatas.json | GET |
 * | addDataSource | /dingtalk/web/{APP_ID}/v1/form/saveFormData.json | POST |
 * | editDataSource | /dingtalk/web/{APP_ID}/v1/form/updateFormData.json | POST |
 * | deleteDataSource | /dingtalk/web/{APP_ID}/v1/form/deleteFormData.json | POST |
 *
 * 【步骤二】修改 CONFIG 中的 APP_ID、FORM_UUID、FIELD_IDS
 *
 * 【步骤三】将代码粘贴到自定义页面的 JS 面板
 *
 * 【步骤四】绑定表格操作列按钮
 * - 动作类型：调用JS函数
 * - 绑定函数：handleRowAction
 * - 传入参数：{"action": "edit"} 或 {"action": "delete"}
 *
 * 【步骤五】绑定行选择器到 onSelect 事件（注意不是 onChange）
 *
 * 代码版本号: v2.1.0
 */
