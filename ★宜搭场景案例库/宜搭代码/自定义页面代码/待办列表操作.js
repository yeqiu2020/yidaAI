/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 待办列表操作 - 自定义页面代码
 * 版本号: v1.6.0
 * 代码类型: customPage
 * 
 * 功能说明:
 * 1. 查询底表进行中的待办，显示到页面进行中待办列表中
 * 2. 查询底表已完成待办，显示到页面已完成待办列表中
 * 3. 点击新增待办，打开弹窗填写信息后保存到进行中待办底表
 * 4. 点击编辑按钮，打开编辑弹窗修改进行中待办
 * 5. 勾选待办事项，将状态从进行中改为已完成，同步修改两个底表
 * 6. 点击删除按钮，删除进行中或已完成的待办
 * 
 * 使用说明:
 * - 页面包含两个表格：进行中待办表格和已完成待办表格
 * - 每个表格有独立的查询、编辑、删除功能
 * - 新增待办默认保存到进行中待办底表
 * - 勾选行选择器可将待办标记为已完成
 */

// ===== 通用工具函数（必须保留）=====
/**
 * 检查宜搭API调用是否成功
 * 统一处理所有API的返回格式差异
 * 
 * 支持的API类型：
 * - 新增API (saveFormData): 成功返回字符串 "FINST-xxx"
 * - 编辑API (updateFormData): 成功返回 null
 * - 删除API (deleteFormData): 成功返回 null
 * - 查询API: 成功返回对象 {success: true, data: [...]}
 * 
 * @param {any} res - API返回结果
 * @returns {boolean} - 是否成功
 */
function checkApiSuccess(res) {
  // 编辑/删除API成功时返回null
  if (res === null || res === undefined) {
    return true;
  }
  // 新增API成功时返回表单实例ID字符串
  if (typeof res === 'string' && res.indexOf('FINST-') === 0) {
    return true;
  }
  // 查询API标准成功格式
  if (res && (res.success === true || res.success === 1)) {
    return true;
  }
  // 查询API直接返回数据
  if (res && (res.data || (res.result && res.result.data))) {
    return true;
  }
  return false;
}

/**
 * 获取API错误信息
 * @param {any} res - API返回结果
 * @param {string} defaultMsg - 默认错误信息
 * @returns {string} - 错误信息
 */
function getApiErrorMessage(res, defaultMsg) {
  if (res && res.errorMsg) return res.errorMsg;
  if (res && res.message) return res.message;
  return defaultMsg || '操作失败';
}

// ===== 配置参数 =====
var CONFIG = {
  // 应用ID
  APP_ID: 'APP_BQ7H8VV5V8BQBS8WP4QH',
  
  // 数据源配置
  DATA_SOURCE: {
    // 进行中待办查询数据源
    QUERY_PENDING: 'queryPendingDataSource',
    // 已完成待办查询数据源
    QUERY_COMPLETED: 'queryCompletedDataSource',
    // 新增数据源
    ADD: 'addDataSource',
    // 编辑数据源
    EDIT: 'editDataSource',
    // 删除数据源
    DELETE: 'deleteDataSource'
  },
  
  // 表单UUID配置
  FORM_UUID: {
    // 进行中待办列表
    PENDING: 'FORM-B61AF06C872D4504B8A6847B8984B32CO9DN',
    // 已完成待办列表
    COMPLETED: 'FORM-D3366D4DDCA84997AF4FE22157D05D13PZBV'
  },
  
  // 弹窗组件ID
  DIALOG: {
    ADD: 'dialog_mm1ctu0r',         // 新增待办弹窗
    EDIT: 'dialog_mm1ctu0t',        // 编辑待办弹窗
    DELETE: 'dialog_mm1ctu0v'       // 删除待办弹窗
  },
  
  // 新增弹窗字段ID
  ADD_FIELDS: {
    TODO_ITEM: 'textField_lnlkspl1',      // 待办事项
    CATEGORY: 'radioField_lojt4j84',      // 分类
    PRIORITY: 'rateField_lojt4j85',       // 重要度
    REMIND_DATE: 'dateField_lnlkspkx',    // 设置提醒日期
    DETAIL: 'textareaField_lojt4j87'      // 待办详情
  },
  
  // 编辑弹窗字段ID
  EDIT_FIELDS: {
    TODO_ITEM: 'textField_lp21pqzm',      // 待办事项
    CATEGORY: 'radioField_lp21pqzn',      // 分类
    PRIORITY: 'rateField_lp21pqzo',       // 重要度
    REMIND_DATE: 'dateField_lp21pqzq',    // 设置提醒日期
    DETAIL: 'textareaField_lp21pqzp'      // 待办详情
  },
  
  // 目标表单字段ID（进行中/已完成待办底表字段）
  TARGET_FIELDS: {
    TODO_ITEM: 'textField_lnlkspl1',      // 待办事项
    CATEGORY: 'radioField_lojt4j84',      // 分类
    PRIORITY: 'rateField_lojt4j85',       // 重要度
    REMIND_DATE: 'dateField_lnlkspkx',    // 设置提醒日期
    DETAIL: 'textareaField_lojt4j87'      // 待办详情
  }
};

// 页面状态管理
var pageState = {
  loading: false,
  // 当前编辑的数据信息
  currentEditData: null,
  currentEditFormInstId: '',
  currentEditFormType: '', // 'pending' 或 'completed'
  // 当前删除的数据信息
  currentDeleteFormInstId: '',
  currentDeleteFormType: '', // 'pending' 或 'completed'
  // 当前勾选的进行中待办
  selectedPendingRows: []
};

/**
 * 页面加载完成时触发
 * 必须包含，作为页面初始化入口
 * 版本号: v1.6.0
 */
export function didMount() {
  console.log('待办列表页面已加载，版本号: v1.6.0');

  // 初始化加载两个表格的数据
  loadPendingData.call(this);
  loadCompletedData.call(this);
}

// ==================== 数据加载函数 ====================

/**
 * 加载进行中待办数据
 * 版本号: v1.3.0
 */
function loadPendingData() {
  var that = this;
  
  console.log('开始加载进行中待办数据...');
  
  var dataSourceName = CONFIG.DATA_SOURCE.QUERY_PENDING;
  
  if (this.dataSourceMap && this.dataSourceMap[dataSourceName]) {
    this.dataSourceMap[dataSourceName].load({
      formUuid: CONFIG.FORM_UUID.PENDING,
      pageSize: 100
    }).then(function(res) {
      console.log('进行中待办数据加载成功:', res);
      
      var isSuccess = checkApiSuccess(res);
      
      if (!isSuccess) {
        var errorMsg = getApiErrorMessage(res, '进行中待办数据加载失败');
        that.utils.toast({
          type: 'error',
          title: '加载失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('进行中待办数据加载异常:', err);
      that.utils.toast({
        type: 'error',
        title: '加载异常',
        content: err.message || '网络错误'
      });
    });
  } else {
    console.error('数据源未配置:', dataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + dataSourceName
    });
  }
}

/**
 * 加载已完成待办数据
 * 版本号: v1.2.0
 */
function loadCompletedData() {
  var that = this;
  
  console.log('开始加载已完成待办数据...');
  
  var dataSourceName = CONFIG.DATA_SOURCE.QUERY_COMPLETED;
  
  if (this.dataSourceMap && this.dataSourceMap[dataSourceName]) {
    this.dataSourceMap[dataSourceName].load({
      formUuid: CONFIG.FORM_UUID.COMPLETED,
      pageSize: 100
    }).then(function(res) {
      console.log('已完成待办数据加载成功:', res);
      
      var isSuccess = checkApiSuccess(res);
      
      if (!isSuccess) {
        var errorMsg = getApiErrorMessage(res, '已完成待办数据加载失败');
        that.utils.toast({
          type: 'error',
          title: '加载失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('已完成待办数据加载异常:', err);
      that.utils.toast({
        type: 'error',
        title: '加载异常',
        content: err.message || '网络错误'
      });
    });
  } else {
    console.error('数据源未配置:', dataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + dataSourceName
    });
  }
}

// ==================== 新增待办功能 ====================

/**
 * 打开新增待办弹窗
 * 绑定到【新增待办】按钮
 * 版本号: v1.2.0
 */
export function openAddDialog(event) {
  console.log('打开新增待办弹窗');
  
  var that = this;
  
  // 打开弹窗
  this.$(CONFIG.DIALOG.ADD).show();
  
  // 清空新增弹窗中的所有字段
  setTimeout(function() {
    that.$(CONFIG.ADD_FIELDS.TODO_ITEM).setValue('');
    that.$(CONFIG.ADD_FIELDS.CATEGORY).setValue('');
    that.$(CONFIG.ADD_FIELDS.PRIORITY).setValue(0);
    that.$(CONFIG.ADD_FIELDS.REMIND_DATE).setValue('');
    that.$(CONFIG.ADD_FIELDS.DETAIL).setValue('');
  }, 100);
}

/**
 * 新增待办确认按钮点击事件
 * 绑定到新增待办弹窗的确认按钮
 * 版本号: v1.2.0
 */
export function confirmAdd(event) {
  var that = this;
  
  console.log('确认新增待办');
  
  // 获取新增弹窗中的字段值
  var todoItem = this.$(CONFIG.ADD_FIELDS.TODO_ITEM).getValue();
  var category = this.$(CONFIG.ADD_FIELDS.CATEGORY).getValue();
  var priority = this.$(CONFIG.ADD_FIELDS.PRIORITY).getValue();
  var remindDate = this.$(CONFIG.ADD_FIELDS.REMIND_DATE).getValue();
  var detail = this.$(CONFIG.ADD_FIELDS.DETAIL).getValue();
  
  // 校验必填项
  if (!todoItem || todoItem === '') {
    this.utils.toast({
      type: 'error',
      title: '校验失败',
      content: '请填写待办事项'
    });
    return;
  }
  
  // 构建表单数据
  var formData = {};
  formData[CONFIG.TARGET_FIELDS.TODO_ITEM] = todoItem;
  formData[CONFIG.TARGET_FIELDS.CATEGORY] = category;
  formData[CONFIG.TARGET_FIELDS.PRIORITY] = priority;
  formData[CONFIG.TARGET_FIELDS.REMIND_DATE] = remindDate;
  formData[CONFIG.TARGET_FIELDS.DETAIL] = detail;
  
  console.log('新增待办数据:', formData);
  
  // 调用数据源保存数据到进行中待办底表
  var dataSourceName = CONFIG.DATA_SOURCE.ADD;
  
  if (this.dataSourceMap && this.dataSourceMap[dataSourceName]) {
    this.dataSourceMap[dataSourceName].load({
      appId: CONFIG.APP_ID,
      formUuid: CONFIG.FORM_UUID.PENDING,
      formDataJson: JSON.stringify(formData)
    }).then(function(res) {
      console.log('新增待办保存成功:', res);
      
      var isSuccess = checkApiSuccess(res);
      
      if (isSuccess) {
        that.utils.toast({
          type: 'success',
          title: '新增成功',
          content: '待办事项已添加'
        });
        
        // 关闭弹窗
        that.$(CONFIG.DIALOG.ADD).hide();
        
        // 刷新进行中待办列表
        loadPendingData.call(that);
      } else {
        var errorMsg = getApiErrorMessage(res, '新增失败');
        console.error('新增待办失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '新增失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('新增待办异常:', err);
      that.utils.toast({
        type: 'error',
        title: '新增异常',
        content: err.message || '网络错误'
      });
    });
  } else {
    console.error('数据源未配置:', dataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + dataSourceName
    });
  }
}

// ==================== 编辑待办功能 ====================

/**
 * 表格行操作按钮点击处理
 * 绑定到表格的操作列按钮
 * @param {object} event - 事件对象，包含当前行数据和操作类型
 * 版本号: v1.2.0
 */
export function handleRowAction(event) {
  var that = this;

  console.log('handleRowAction 完整事件对象:', event);

  // 获取当前行数据 - 兼容多种事件结构
  var rowData = {};
  if (event.rowData) {
    rowData = event.rowData;
  } else if (event.record) {
    rowData = event.record;
  } else if (event.data && event.data.rowData) {
    rowData = event.data.rowData;
  } else if (event.data) {
    rowData = event.data;
  } else if (event.formUuid) {
    // 宜搭表格直接传递行数据对象
    rowData = event;
  }

  var actionType = event.action || event.actionType || 'default';
  var formType = event.formType || 'pending';

  console.log('handleRowAction 解析结果:', {
    actionType: actionType,
    formType: formType,
    rowData: rowData
  });

  // 检查rowData是否为空
  if (!rowData || Object.keys(rowData).length === 0) {
    console.error('未获取到行数据，请检查表格按钮配置');
    this.utils.toast({
      type: 'error',
      title: '操作失败',
      content: '未获取到行数据'
    });
    return;
  }

  try {
    switch(actionType) {
      case 'edit':
        handleEditRow.call(this, rowData, formType);
        break;
      case 'delete':
        handleDeleteRow.call(this, rowData, formType);
        break;
      default:
        this.utils.toast({
          type: 'info',
          title: '操作提示',
          content: '未知的操作类型: ' + actionType
        });
    }
  } catch (error) {
    console.error('行操作处理错误:', error);
    this.utils.toast({
      type: 'error',
      title: '操作失败',
      content: error.message
    });
  }
}

/**
 * 打开编辑待办弹窗
 * 可绑定到编辑按钮直接调用
 * @param {object} event - 事件对象，包含rowData和formType
 * 版本号: v1.2.0
 */
export function openEditDialog(event) {
  console.log('openEditDialog 事件对象:', event);

  // 兼容多种事件结构
  var rowData = {};
  if (event.rowData) {
    rowData = event.rowData;
  } else if (event.record) {
    rowData = event.record;
  } else if (event.data && event.data.rowData) {
    rowData = event.data.rowData;
  } else if (event.data) {
    rowData = event.data;
  } else if (event.formUuid) {
    // 宜搭表格直接传递行数据对象
    rowData = event;
  }

  var formType = event.formType || 'pending';

  console.log('openEditDialog 解析结果:', { rowData: rowData, formType: formType });

  if (!rowData || Object.keys(rowData).length === 0) {
    console.error('openEditDialog: 未获取到行数据');
    this.utils.toast({
      type: 'error',
      title: '操作失败',
      content: '未获取到行数据，请检查按钮配置'
    });
    return;
  }

  handleEditRow.call(this, rowData, formType);
}

/**
 * 编辑行数据
 * @param {object} rowData - 行数据
 * @param {string} formType - 表单类型 'pending' 或 'completed'
 * 版本号: v1.2.0
 */
function handleEditRow(rowData, formType) {
  var that = this;

  console.log('编辑行原始数据:', rowData, '表单类型:', formType);

  // 保存当前编辑的数据信息
  pageState.currentEditData = rowData;
  pageState.currentEditFormInstId = rowData.formInstId || '';
  pageState.currentEditFormType = formType;

  // 获取formData数据 - 兼容多种数据结构
  var formData = {};
  if (rowData.formData) {
    // 标准结构：{formData: {...}, formInstId: '...'}
    formData = rowData.formData;
  } else if (rowData.data) {
    // 备选结构：{data: {...}}
    formData = rowData.data;
  } else {
    // 直接使用rowData
    formData = rowData;
  }

  console.log('解析后的formData:', formData);

  // 提取字段值 - 兼容formData.xxx和直接xxx两种格式
  var todoItem = formData[CONFIG.TARGET_FIELDS.TODO_ITEM] || formData['textField_lnlkspl1'] || '';
  var category = formData[CONFIG.TARGET_FIELDS.CATEGORY] || formData['radioField_lojt4j84'] || '';
  var priority = formData[CONFIG.TARGET_FIELDS.PRIORITY] || formData['rateField_lojt4j85'] || 0;
  var remindDate = formData[CONFIG.TARGET_FIELDS.REMIND_DATE] || formData['dateField_lnlkspkx'] || '';
  var detail = formData[CONFIG.TARGET_FIELDS.DETAIL] || formData['textareaField_lojt4j87'] || '';

  console.log('提取的字段值:', {
    todoItem: todoItem,
    category: category,
    priority: priority,
    remindDate: remindDate,
    detail: detail
  });

  // 打开编辑弹窗
  this.$(CONFIG.DIALOG.EDIT).show();

  // 填充编辑弹窗字段 - 使用setTimeout确保弹窗已渲染
  setTimeout(function() {
    console.log('开始回填字段值');
    that.$(CONFIG.EDIT_FIELDS.TODO_ITEM).setValue(todoItem);
    that.$(CONFIG.EDIT_FIELDS.CATEGORY).setValue(category);
    that.$(CONFIG.EDIT_FIELDS.PRIORITY).setValue(priority);
    that.$(CONFIG.EDIT_FIELDS.REMIND_DATE).setValue(remindDate);
    that.$(CONFIG.EDIT_FIELDS.DETAIL).setValue(detail);
    console.log('字段回填完成');
  }, 200);
}

/**
 * 编辑待办确认按钮点击事件
 * 绑定到编辑待办弹窗的确认按钮
 * 版本号: v1.2.0
 */
export function confirmEdit(event) {
  var that = this;
  
  console.log('确认编辑待办');
  
  if (!pageState.currentEditFormInstId) {
    this.utils.toast({
      type: 'error',
      title: '编辑失败',
      content: '未找到数据ID'
    });
    return;
  }
  
  // 获取编辑弹窗中的字段值
  var todoItem = this.$(CONFIG.EDIT_FIELDS.TODO_ITEM).getValue();
  var category = this.$(CONFIG.EDIT_FIELDS.CATEGORY).getValue();
  var priority = this.$(CONFIG.EDIT_FIELDS.PRIORITY).getValue();
  var remindDate = this.$(CONFIG.EDIT_FIELDS.REMIND_DATE).getValue();
  var detail = this.$(CONFIG.EDIT_FIELDS.DETAIL).getValue();
  
  // 校验必填项
  if (!todoItem || todoItem === '') {
    this.utils.toast({
      type: 'error',
      title: '校验失败',
      content: '请填写待办事项'
    });
    return;
  }
  
  // 构建表单数据
  var formData = {};
  formData[CONFIG.TARGET_FIELDS.TODO_ITEM] = todoItem;
  formData[CONFIG.TARGET_FIELDS.CATEGORY] = category;
  formData[CONFIG.TARGET_FIELDS.PRIORITY] = priority;
  formData[CONFIG.TARGET_FIELDS.REMIND_DATE] = remindDate;
  formData[CONFIG.TARGET_FIELDS.DETAIL] = detail;
  
  console.log('编辑待办数据:', formData, '表单实例ID:', pageState.currentEditFormInstId);
  
  // 根据表单类型确定要更新的底表
  var formUuid = pageState.currentEditFormType === 'completed' 
    ? CONFIG.FORM_UUID.COMPLETED 
    : CONFIG.FORM_UUID.PENDING;
  
  // 调用数据源更新数据
  var dataSourceName = CONFIG.DATA_SOURCE.EDIT;
  
  if (this.dataSourceMap && this.dataSourceMap[dataSourceName]) {
    this.dataSourceMap[dataSourceName].load({
      appId: CONFIG.APP_ID,
      formUuid: formUuid,
      formInstId: pageState.currentEditFormInstId,
      updateFormDataJson: JSON.stringify(formData)
    }).then(function(res) {
      console.log('编辑待办保存成功:', res);
      
      var isSuccess = checkApiSuccess(res);
      
      if (isSuccess) {
        that.utils.toast({
          type: 'success',
          title: '编辑成功',
          content: '待办事项已更新'
        });
        
        // 关闭弹窗
        that.$(CONFIG.DIALOG.EDIT).hide();
        
        // 清空当前编辑数据
        pageState.currentEditData = null;
        pageState.currentEditFormInstId = '';
        pageState.currentEditFormType = '';
        
        // 刷新对应列表
        if (formUuid === CONFIG.FORM_UUID.COMPLETED) {
          loadCompletedData.call(that);
        } else {
          loadPendingData.call(that);
        }
      } else {
        var errorMsg = getApiErrorMessage(res, '编辑失败');
        console.error('编辑待办失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '编辑失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('编辑待办异常:', err);
      that.utils.toast({
        type: 'error',
        title: '编辑异常',
        content: err.message || '网络错误'
      });
    });
  } else {
    console.error('数据源未配置:', dataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + dataSourceName
    });
  }
}

// ==================== 删除待办功能 ====================

/**
 * 打开删除待办弹窗
 * 可绑定到删除按钮直接调用
 * @param {object} event - 事件对象，包含rowData和formType
 * 版本号: v1.2.0
 */
export function openDeleteDialog(event) {
  console.log('openDeleteDialog 事件对象:', event);

  // 兼容多种事件结构
  var rowData = {};
  if (event.rowData) {
    rowData = event.rowData;
  } else if (event.record) {
    rowData = event.record;
  } else if (event.data && event.data.rowData) {
    rowData = event.data.rowData;
  } else if (event.data) {
    rowData = event.data;
  } else if (event.formUuid) {
    // 宜搭表格直接传递行数据对象
    rowData = event;
  }

  var formType = event.formType || 'pending';

  console.log('openDeleteDialog 解析结果:', { rowData: rowData, formType: formType });

  if (!rowData || Object.keys(rowData).length === 0) {
    console.error('openDeleteDialog: 未获取到行数据');
    this.utils.toast({
      type: 'error',
      title: '操作失败',
      content: '未获取到行数据，请检查按钮配置'
    });
    return;
  }

  handleDeleteRow.call(this, rowData, formType);
}

/**
 * 删除行数据
 * @param {object} rowData - 行数据
 * @param {string} formType - 表单类型 'pending' 或 'completed'
 * 版本号: v1.2.0
 */
function handleDeleteRow(rowData, formType) {
  var that = this;

  console.log('准备删除行:', rowData, '表单类型:', formType);

  // 保存当前删除的数据信息
  pageState.currentDeleteFormInstId = rowData.formInstId || '';
  pageState.currentDeleteFormType = formType;

  if (!pageState.currentDeleteFormInstId) {
    this.utils.toast({
      type: 'error',
      title: '删除失败',
      content: '未找到数据ID'
    });
    return;
  }

  // 打开删除确认弹窗
  this.$(CONFIG.DIALOG.DELETE).show();
}

/**
 * 删除待办确认按钮点击事件
 * 绑定到删除待办弹窗的确认按钮
 * 版本号: v1.2.0
 */
export function confirmDelete(event) {
  var that = this;
  
  console.log('确认删除待办');
  
  if (!pageState.currentDeleteFormInstId) {
    this.utils.toast({
      type: 'error',
      title: '删除失败',
      content: '未找到数据ID'
    });
    return;
  }
  
  // 根据表单类型确定要删除的底表
  var formUuid = pageState.currentDeleteFormType === 'completed' 
    ? CONFIG.FORM_UUID.COMPLETED 
    : CONFIG.FORM_UUID.PENDING;
  
  // 调用数据源删除数据
  var dataSourceName = CONFIG.DATA_SOURCE.DELETE;
  
  if (this.dataSourceMap && this.dataSourceMap[dataSourceName]) {
    this.dataSourceMap[dataSourceName].load({
      appId: CONFIG.APP_ID,
      formUuid: formUuid,
      formInstId: pageState.currentDeleteFormInstId
    }).then(function(res) {
      console.log('删除待办成功:', res);
      
      var isSuccess = checkApiSuccess(res);
      
      if (isSuccess) {
        that.utils.toast({
          type: 'success',
          title: '删除成功',
          content: '待办事项已删除'
        });
        
        // 关闭弹窗
        that.$(CONFIG.DIALOG.DELETE).hide();
        
        // 清空当前删除数据
        pageState.currentDeleteFormInstId = '';
        pageState.currentDeleteFormType = '';
        
        // 刷新对应列表
        if (formUuid === CONFIG.FORM_UUID.COMPLETED) {
          loadCompletedData.call(that);
        } else {
          loadPendingData.call(that);
        }
      } else {
        var errorMsg = getApiErrorMessage(res, '删除失败');
        console.error('删除待办失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '删除失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('删除待办异常:', err);
      that.utils.toast({
        type: 'error',
        title: '删除异常',
        content: err.message || '网络错误'
      });
    });
  } else {
    console.error('数据源未配置:', dataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + dataSourceName
    });
  }
}

// ==================== 完成待办功能（行选择器） ====================

/**
 * 进行中待办表格行选择器变化事件
 * 绑定到进行中待办表格的行选择器
 * 勾选后立即将待办标记为已完成
 * 宜搭标准回调函数签名: onSelect(selected, rowData, selectedRows)
 * @param {boolean} selected - 是否选中
 * @param {object} rowData - 当前操作行数据
 * @param {array} selectedRows - 所有选中的行数据
 * 版本号: v1.5.0
 */
export function onPendingRowSelect(selected, rowData, selectedRows) {
  console.log('行选择器回调:', {
    selected: selected,
    rowData: rowData,
    selectedRows: selectedRows
  });

  // 只有选中时才处理（取消勾选不处理）
  if (!selected) {
    console.log('取消勾选，不处理');
    return;
  }

  // 获取要处理的行数据（优先使用当前行）
  var targetRow = rowData;

  if (!targetRow || !targetRow.formInstId) {
    console.error('未获取到有效的行数据');
    return;
  }

  console.log('准备将待办标记为已完成:', targetRow);

  // 直接调用处理完成逻辑
  processCompleteTodo.call(this, targetRow);
}

/**
 * 处理单个待办完成逻辑
 * @param {object} rowData - 行数据
 * 版本号: v1.6.0
 */
function processCompleteTodo(rowData) {
  var that = this;

  console.log('processCompleteTodo 原始数据:', rowData);

  var formInstId = rowData.formInstId || '';

  if (!formInstId) {
    console.error('未找到formInstId');
    return;
  }

  // 获取formData数据 - 兼容多种数据结构
  var formData = {};
  if (rowData.formData) {
    formData = rowData.formData;
  } else {
    // 直接使用rowData（宜搭可能直接传递行数据）
    formData = rowData;
  }

  console.log('解析后的formData:', formData);

  // 构建要保存到已完成底表的数据
  var completedFormData = {};
  completedFormData[CONFIG.TARGET_FIELDS.TODO_ITEM] = formData[CONFIG.TARGET_FIELDS.TODO_ITEM] || formData['textField_lnlkspl1'] || '';
  completedFormData[CONFIG.TARGET_FIELDS.CATEGORY] = formData[CONFIG.TARGET_FIELDS.CATEGORY] || formData['radioField_lojt4j84'] || '';
  completedFormData[CONFIG.TARGET_FIELDS.PRIORITY] = formData[CONFIG.TARGET_FIELDS.PRIORITY] || formData['rateField_lojt4j85'] || 0;
  completedFormData[CONFIG.TARGET_FIELDS.REMIND_DATE] = formData[CONFIG.TARGET_FIELDS.REMIND_DATE] || formData['dateField_lnlkspkx'] || '';
  completedFormData[CONFIG.TARGET_FIELDS.DETAIL] = formData[CONFIG.TARGET_FIELDS.DETAIL] || formData['textareaField_lojt4j87'] || '';

  console.log('保存到已完成底表的数据:', completedFormData);

  // 第一步：新增到已完成底表
  var addDataSourceName = CONFIG.DATA_SOURCE.ADD;

  if (this.dataSourceMap && this.dataSourceMap[addDataSourceName]) {
    this.dataSourceMap[addDataSourceName].load({
      appId: CONFIG.APP_ID,
      formUuid: CONFIG.FORM_UUID.COMPLETED,
      formDataJson: JSON.stringify(completedFormData)
    }).then(function(res) {
      console.log('保存到已完成底表成功:', res);

      var isSuccess = checkApiSuccess(res);

      if (isSuccess) {
        // 第二步：从进行中底表删除
        deletePendingAfterComplete.call(that, formInstId);
      } else {
        var errorMsg = getApiErrorMessage(res, '保存到已完成列表失败');
        console.error('保存到已完成底表失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '操作失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('保存到已完成底表异常:', err);
      that.utils.toast({
        type: 'error',
        title: '操作异常',
        content: err.message || '网络错误'
      });
    });
  }
}

/**
 * 完成待办后从进行中底表删除
 * @param {string} formInstId - 表单实例ID
 * 版本号: v1.5.0
 */
function deletePendingAfterComplete(formInstId) {
  var that = this;

  console.log('从进行中底表删除:', formInstId);

  var deleteDataSourceName = CONFIG.DATA_SOURCE.DELETE;

  if (this.dataSourceMap && this.dataSourceMap[deleteDataSourceName]) {
    this.dataSourceMap[deleteDataSourceName].load({
      appId: CONFIG.APP_ID,
      formUuid: CONFIG.FORM_UUID.PENDING,
      formInstId: formInstId
    }).then(function(res) {
      console.log('从进行中底表删除成功:', res);

      var isSuccess = checkApiSuccess(res);

      if (isSuccess) {
        that.utils.toast({
          type: 'success',
          title: '操作成功',
          content: '待办事项已标记为已完成'
        });

        // 刷新两个列表
        loadPendingData.call(that);
        loadCompletedData.call(that);
      } else {
        var errorMsg = getApiErrorMessage(res, '从进行中列表删除失败');
        console.error('从进行中底表删除失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '操作失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('从进行中底表删除异常:', err);
      that.utils.toast({
        type: 'error',
        title: '操作异常',
        content: err.message || '网络错误'
      });
    });
  }
}

/**
 * 将选中的待办标记为已完成
 * 绑定到【标记完成】按钮
 * 版本号: v1.2.0
 */
export function markAsCompleted(event) {
  var that = this;
  
  console.log('标记为已完成，选中行:', pageState.selectedPendingRows);
  
  // 检查是否有选中的行
  if (!pageState.selectedPendingRows || pageState.selectedPendingRows.length === 0) {
    this.utils.toast({
      type: 'warning',
      title: '提示',
      content: '请先勾选要标记为已完成的待办事项'
    });
    return;
  }
  
  // 获取第一行数据进行处理（支持批量处理）
  var selectedRow = pageState.selectedPendingRows[0];
  var formInstId = selectedRow.formInstId || '';
  var formData = selectedRow.formData || selectedRow;
  
  if (!formInstId) {
    this.utils.toast({
      type: 'error',
      title: '操作失败',
      content: '未找到数据ID'
    });
    return;
  }
  
  // 构建要保存到已完成底表的数据
  var completedFormData = {};
  completedFormData[CONFIG.TARGET_FIELDS.TODO_ITEM] = formData[CONFIG.TARGET_FIELDS.TODO_ITEM] || '';
  completedFormData[CONFIG.TARGET_FIELDS.CATEGORY] = formData[CONFIG.TARGET_FIELDS.CATEGORY] || '';
  completedFormData[CONFIG.TARGET_FIELDS.PRIORITY] = formData[CONFIG.TARGET_FIELDS.PRIORITY] || 0;
  completedFormData[CONFIG.TARGET_FIELDS.REMIND_DATE] = formData[CONFIG.TARGET_FIELDS.REMIND_DATE] || '';
  completedFormData[CONFIG.TARGET_FIELDS.DETAIL] = formData[CONFIG.TARGET_FIELDS.DETAIL] || '';
  
  console.log('保存到已完成底表的数据:', completedFormData);
  
  // 第一步：新增到已完成底表
  var addDataSourceName = CONFIG.DATA_SOURCE.ADD;
  
  if (this.dataSourceMap && this.dataSourceMap[addDataSourceName]) {
    this.dataSourceMap[addDataSourceName].load({
      appId: CONFIG.APP_ID,
      formUuid: CONFIG.FORM_UUID.COMPLETED,
      formDataJson: JSON.stringify(completedFormData)
    }).then(function(res) {
      console.log('保存到已完成底表成功:', res);
      
      var isSuccess = checkApiSuccess(res);
      
      if (isSuccess) {
        // 第二步：从进行中底表删除
        deleteFromPending.call(that, formInstId);
      } else {
        var errorMsg = getApiErrorMessage(res, '保存到已完成列表失败');
        console.error('保存到已完成底表失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '操作失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('保存到已完成底表异常:', err);
      that.utils.toast({
        type: 'error',
        title: '操作异常',
        content: err.message || '网络错误'
      });
    });
  } else {
    console.error('数据源未配置:', addDataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + addDataSourceName
    });
  }
}

/**
 * 从进行中底表删除数据
 * @param {string} formInstId - 表单实例ID
 * 版本号: v1.2.0
 */
function deleteFromPending(formInstId) {
  var that = this;
  
  console.log('从进行中底表删除:', formInstId);
  
  var deleteDataSourceName = CONFIG.DATA_SOURCE.DELETE;
  
  if (this.dataSourceMap && this.dataSourceMap[deleteDataSourceName]) {
    this.dataSourceMap[deleteDataSourceName].load({
      appId: CONFIG.APP_ID,
      formUuid: CONFIG.FORM_UUID.PENDING,
      formInstId: formInstId
    }).then(function(res) {
      console.log('从进行中底表删除成功:', res);
      
      var isSuccess = checkApiSuccess(res);
      
      if (isSuccess) {
        that.utils.toast({
          type: 'success',
          title: '操作成功',
          content: '待办事项已标记为已完成'
        });
        
        // 清空选中行
        pageState.selectedPendingRows = [];
        
        // 刷新两个列表
        loadPendingData.call(that);
        loadCompletedData.call(that);
      } else {
        var errorMsg = getApiErrorMessage(res, '从进行中列表删除失败');
        console.error('从进行中底表删除失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '操作失败',
          content: errorMsg
        });
      }
    }).catch(function(err) {
      console.error('从进行中底表删除异常:', err);
      that.utils.toast({
        type: 'error',
        title: '操作异常',
        content: err.message || '网络错误'
      });
    });
  } else {
    console.error('数据源未配置:', deleteDataSourceName);
    that.utils.toast({
      type: 'error',
      title: '配置错误',
      content: '请配置数据源: ' + deleteDataSourceName
    });
  }
}

/**
 * ===== 宜搭内操作步骤 =====
 * 
 * 【第一步】配置数据源（在【数据源】面板）：
 * 
 * 1. 进行中待办查询数据源（queryPendingDataSource）：
 *    - 名称: queryPendingDataSource
 *    - 类型: 远程 API
 *    - 请求地址: /dingtalk/web/APP_BQ7H8VV5V8BQBS8WP4QH/v1/form/searchFormDatas.json
 *    - 请求方式: GET
 *    - 请求参数: formUuid=FORM-B61AF06C872D4504B8A6847B8984B32CO9DN, pageSize=100
 *    - 自动加载: 关闭
 * 
 * 2. 已完成待办查询数据源（queryCompletedDataSource）：
 *    - 名称: queryCompletedDataSource
 *    - 类型: 远程 API
 *    - 请求地址: /dingtalk/web/APP_BQ7H8VV5V8BQBS8WP4QH/v1/form/searchFormDatas.json
 *    - 请求方式: GET
 *    - 请求参数: formUuid=FORM-D3366D4DDCA84997AF4FE22157D05D13PZBV, pageSize=100
 *    - 自动加载: 关闭
 * 
 * 3. 新增数据源（addDataSource）：
 *    - 名称: addDataSource
 *    - 类型: 远程 API
 *    - 请求地址: /dingtalk/web/APP_BQ7H8VV5V8BQBS8WP4QH/v1/form/saveFormData.json
 *    - 请求方式: POST
 *    - 请求参数: appId, formUuid, formDataJson
 *    - 自动加载: 关闭
 * 
 * 4. 编辑数据源（editDataSource）：
 *    - 名称: editDataSource
 *    - 类型: 远程 API
 *    - 请求地址: /dingtalk/web/APP_BQ7H8VV5V8BQBS8WP4QH/v1/form/updateFormData.json
 *    - 请求方式: POST
 *    - 请求参数: appId, formUuid, formInstId, updateFormDataJson
 *    - 自动加载: 关闭
 * 
 * 5. 删除数据源（deleteDataSource）：
 *    - 名称: deleteDataSource
 *    - 类型: 远程 API
 *    - 请求地址: /dingtalk/web/APP_BQ7H8VV5V8BQBS8WP4QH/v1/form/deleteFormData.json
 *    - 请求方式: POST
 *    - 请求参数: appId, formUuid, formInstId
 *    - 自动加载: 关闭
 * 
 * 【第二步】配置进行中待办表格组件：
 * 
 * 1. 数据源: queryPendingDataSource
 * 2. 数据列字段映射（使用 formData.xxx 格式）:
 *    - 待办事项: formData.textField_lnlkspl1
 *    - 分类: formData.radioField_lojt4j84
 *    - 重要度: formData.rateField_lojt4j85
 *    - 提醒日期: formData.dateField_lnlkspkx
 *    - 详情: formData.textareaField_lojt4j87
 * 3. 启用行选择器: 开启
 * 4. 行选择器事件: onPendingRowSelect
 * 5. 操作列按钮配置：
 *    - 编辑按钮: 
 *      * 动作类型: 调用JS函数
 *      * 绑定函数: handleRowAction
 *      * 传入参数: {"action": "edit", "formType": "pending"}
 *    - 删除按钮:
 *      * 动作类型: 调用JS函数
 *      * 绑定函数: handleRowAction
 *      * 传入参数: {"action": "delete", "formType": "pending"}
 * 
 * 【第三步】配置已完成待办表格组件：
 * 
 * 1. 数据源: queryCompletedDataSource
 * 2. 数据列字段映射（使用 formData.xxx 格式）:
 *    - 待办事项: formData.textField_lnlkspl1
 *    - 分类: formData.radioField_lojt4j84
 *    - 重要度: formData.rateField_lojt4j85
 *    - 提醒日期: formData.dateField_lnlkspkx
 *    - 详情: formData.textareaField_lojt4j87
 * 3. 操作列按钮配置：
 *    - 编辑按钮: 
 *      * 动作类型: 调用JS函数
 *      * 绑定函数: handleRowAction
 *      * 传入参数: {"action": "edit", "formType": "completed"}
 *    - 删除按钮:
 *      * 动作类型: 调用JS函数
 *      * 绑定函数: handleRowAction
 *      * 传入参数: {"action": "delete", "formType": "completed"}
 * 
 * 【第四步】配置弹窗组件：
 * 
 * 1. 新增待办弹窗（dialog_mm1ctu0r）：
 *    - 弹窗内表单字段:
 *      * 待办事项: textField_lnlkspl1
 *      * 分类: radioField_lojt4j84
 *      * 重要度: rateField_lojt4j85
 *      * 设置提醒日期: dateField_lnlkspkx
 *      * 待办详情: textareaField_lojt4j87
 *    - 弹窗底部按钮:
 *      * 确认按钮:
 *        - 动作类型: 调用JS函数
 *        - 绑定函数: confirmAdd
 *      * 取消按钮: 关闭弹窗
 * 
 * 2. 编辑待办弹窗（dialog_mm1ctu0t）：
 *    - 弹窗内表单字段:
 *      * 待办事项: textField_lp21pqzm
 *      * 分类: radioField_lp21pqzn
 *      * 重要度: rateField_lp21pqzo
 *      * 设置提醒日期: dateField_lp21pqzq
 *      * 待办详情: textareaField_lp21pqzp
 *    - 弹窗底部按钮:
 *      * 确认按钮:
 *        - 动作类型: 调用JS函数
 *        - 绑定函数: confirmEdit
 *      * 取消按钮: 关闭弹窗
 * 
 * 3. 删除待办弹窗（dialog_mm1ctu0v）：
 *    - 弹窗底部按钮:
 *      * 确认按钮:
 *        - 动作类型: 调用JS函数
 *        - 绑定函数: confirmDelete
 *      * 取消按钮: 关闭弹窗
 * 
 * 【第五步】配置页面按钮：
 * 
 * 1. 新增待办按钮:
 *    - 按钮文本: 新增待办
 *    - 动作类型: 调用JS函数
 *    - 绑定函数: openAddDialog
 * 
 * 2. 标记完成按钮:
 *    - 按钮文本: 标记完成
 *    - 动作类型: 调用JS函数
 *    - 绑定函数: markAsCompleted
 * 
 * 【第六步】函数与事件绑定清单：
 * 
 * ┌─────────────────────────┬──────────────────────────┬─────────────────────────────────────────────┐
 * │ 功能                    │ 绑定位置                 │ 绑定函数                                    │
 * ├─────────────────────────┼──────────────────────────┼─────────────────────────────────────────────┤
 * │ 页面初始化              │ 页面JS面板 didMount      │ didMount（自动调用）                        │
 * │ 新增待办弹窗            │ 新增待办按钮             │ openAddDialog                               │
 * │ 新增确认                │ 新增弹窗确认按钮         │ confirmAdd                                  │
 * │ 进行中表格编辑          │ 进行中表格编辑按钮       │ handleRowAction(action: edit, formType: pending)    │
 * │ 进行中表格删除          │ 进行中表格删除按钮       │ handleRowAction(action: delete, formType: pending)  │
 * │ 已完成表格编辑          │ 已完成表格编辑按钮       │ handleRowAction(action: edit, formType: completed)  │
 * │ 已完成表格删除          │ 已完成表格删除按钮       │ handleRowAction(action: delete, formType: completed)│
 * │ 编辑确认                │ 编辑弹窗确认按钮         │ confirmEdit                                 │
 * │ 删除确认                │ 删除弹窗确认按钮         │ confirmDelete                               │
 * │ 行选择器变化            │ 进行中表格行选择器       │ onPendingRowSelect                          │
 * │ 标记完成                │ 标记完成按钮             │ markAsCompleted                             │
 * └─────────────────────────┴──────────────────────────┴─────────────────────────────────────────────┘
 * 
 * 代码版本号: v1.6.0
 */