/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 同时段历史子表数据重复性校验
 * 版本号: v1.0.0
 * 代码类型: formAction
 * 
 * 功能说明:
 * 预约座位场景，校验当前表单的开始日期、结束日期、子表座位信息
 * 与历史数据的时间范围是否存在交叉，且座位是否重叠。
 * 如果存在时间交叉且座位重叠的情况，则弹窗提示用户不能提交。
 * 当子表中的座位信息填写完成时自动触发校验。
 * 
 * 使用说明：请查看代码末尾的"宜搭内操作步骤"
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 当前表单字段ID
    START_DATE: 'dateField_mmojwr9f',           // 开始日期
    END_DATE: 'dateField_mmojwr9h',             // 结束日期
    TABLE_RESERVATION: 'tableField_mmojwr9j',   // 预约信息子表
    SEAT_SELECT: 'selectField_mmojwr9k'         // 座位信息（子表内下拉框）
  },
  // 跨应用查询配置（查询自己）
  CROSS_APP: {
    APP_TYPE: 'APP_RHXLY4GVACE875JP63WE',       // 应用ID
    FORM_UUID: 'FORM-F2828CADC047486491259974A70E978DYHWH'  // 预约申请表ID
  }
};

// 全局锁变量，防止重复触发
var isProcessing = false;
// 校验状态标记
var hasConflict = false;
// 冲突信息缓存
var conflictInfo = [];

/**
 * 页面加载完成时触发
 * 无论是否有需求代码都必须书写此方法，并放在最前面
 * 版本号: v1.0.0
 */
export function didMount() {
  console.log('同时段历史子表数据重复性校验代码已加载，版本号: v1.0.0');
}

/**
 * 解析日期字符串为时间戳
 * 支持多种日期格式
 * @param {string|number|Date} dateValue - 日期值
 * @returns {number} - 时间戳（毫秒）
 */
function parseDateToTimestamp(dateValue) {
  if (!dateValue) {
    return 0;
  }
  
  // 如果是数字（时间戳）
  if (typeof dateValue === 'number') {
    return dateValue;
  }
  
  // 如果是字符串
  if (typeof dateValue === 'string') {
    // 尝试直接解析
    var timestamp = new Date(dateValue).getTime();
    if (!isNaN(timestamp)) {
      return timestamp;
    }
    
    // 尝试替换格式（处理 yyyy-MM-dd HH:mm:ss 格式）
    var replaced = dateValue.replace(/-/g, '/');
    timestamp = new Date(replaced).getTime();
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }
  
  // 如果是Date对象
  if (dateValue instanceof Date) {
    return dateValue.getTime();
  }
  
  return 0;
}

/**
 * 格式化日期为字符串
 * @param {string|number|Date} dateValue - 日期值
 * @returns {string} - 格式化后的日期字符串
 */
function formatDate(dateValue) {
  var timestamp = parseDateToTimestamp(dateValue);
  if (timestamp === 0) {
    return '';
  }
  
  var date = new Date(timestamp);
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  var hour = String(date.getHours()).padStart(2, '0');
  var minute = String(date.getMinutes()).padStart(2, '0');
  
  return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
}

/**
 * 获取下拉框字段的值
 * 下拉框可能返回字符串或对象格式
 * @param {any} selectValue - 下拉框值
 * @returns {string} - 选项值
 */
function getSelectValue(selectValue) {
  if (!selectValue) {
    return '';
  }
  
  // 如果是字符串
  if (typeof selectValue === 'string') {
    return selectValue;
  }
  
  // 如果是对象，可能有value或key属性
  if (typeof selectValue === 'object') {
    if (selectValue.value !== undefined) {
      return String(selectValue.value);
    }
    if (selectValue.key !== undefined) {
      return String(selectValue.key);
    }
    if (selectValue.label !== undefined) {
      return String(selectValue.label);
    }
  }
  
  return String(selectValue);
}

/**
 * 获取子表中的所有座位信息
 * @param {Array} tableData - 子表数据
 * @returns {Array} - 座位值数组
 */
function getSeatsFromTable(tableData) {
  if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
    return [];
  }
  
  var seats = [];
  for (var i = 0; i < tableData.length; i++) {
    var row = tableData[i];
    if (row && row[CONFIG.FIELD_IDS.SEAT_SELECT]) {
      var seatValue = getSelectValue(row[CONFIG.FIELD_IDS.SEAT_SELECT]);
      if (seatValue) {
        seats.push({
          index: i,
          value: seatValue,
          rowData: row
        });
      }
    }
  }
  
  return seats;
}

/**
 * 检查两个时间段是否有交叉
 * @param {number} start1 - 时间段1开始时间
 * @param {number} end1 - 时间段1结束时间
 * @param {number} start2 - 时间段2开始时间
 * @param {number} end2 - 时间段2结束时间
 * @returns {boolean} - 是否有交叉
 */
function isTimeOverlap(start1, end1, start2, end2) {
  // 时间段1在时间段2之前结束，无交叉
  if (end1 <= start2) {
    return false;
  }
  // 时间段1在时间段2之后开始，无交叉
  if (start1 >= end2) {
    return false;
  }
  // 其他情况都有交叉
  return true;
}

/**
 * 检查API调用是否成功
 * 统一处理所有API的返回格式差异
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

/**
 * 从历史数据中提取子表的座位信息
 * @param {Object} formData - 表单数据
 * @returns {Array} - 座位信息数组
 */
function extractSeatsFromHistory(formData) {
  if (!formData) {
    return [];
  }
  
  // 子表数据可能在formData.tableField_xxx或formData.tableField_xxx.tableData中
  var tableKey = CONFIG.FIELD_IDS.TABLE_RESERVATION;
  var tableData = null;
  
  if (formData[tableKey]) {
    if (Array.isArray(formData[tableKey])) {
      tableData = formData[tableKey];
    } else if (formData[tableKey].tableData && Array.isArray(formData[tableKey].tableData)) {
      tableData = formData[tableKey].tableData;
    }
  }
  
  if (!tableData) {
    return [];
  }
  
  var seats = [];
  for (var i = 0; i < tableData.length; i++) {
    var row = tableData[i];
    if (row) {
      var seatField = CONFIG.FIELD_IDS.SEAT_SELECT;
      var seatValue = row[seatField] || row[seatField + '_text'];
      if (seatValue) {
        seats.push(getSelectValue(seatValue));
      }
    }
  }
  
  return seats;
}

/**
 * 子表座位信息变更时触发校验
 * 绑定到子表内座位信息下拉框的onChange事件
 * @param {object} event - 事件对象
 * 版本号: v1.0.0
 */
export function onSeatChange(event) {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 获取表单字段值
    var startDateField = this.$(CONFIG.FIELD_IDS.START_DATE);
    var endDateField = this.$(CONFIG.FIELD_IDS.END_DATE);
    var tableField = this.$(CONFIG.FIELD_IDS.TABLE_RESERVATION);
    
    var startDateValue = startDateField.getValue();
    var endDateValue = endDateField.getValue();
    var tableData = tableField.getValue();
    
    console.log('字段变更 - 开始日期:', startDateValue, '结束日期:', endDateValue);
    console.log('子表数据:', tableData);
    
    // 解析日期为时间戳
    var currentStartTime = parseDateToTimestamp(startDateValue);
    var currentEndTime = parseDateToTimestamp(endDateValue);
    
    // 校验必填项
    if (currentStartTime === 0) {
      console.log('开始日期未填写，跳过校验');
      isProcessing = false;
      return;
    }
    
    if (currentEndTime === 0) {
      console.log('结束日期未填写，跳过校验');
      isProcessing = false;
      return;
    }
    
    // 校验日期逻辑
    if (currentStartTime >= currentEndTime) {
      that.utils.toast({
        type: 'warning',
        title: '日期错误',
        content: '结束日期必须晚于开始日期'
      });
      isProcessing = false;
      return;
    }
    
    // 获取当前子表中的座位信息
    var currentSeats = getSeatsFromTable(tableData);
    console.log('当前选中的座位:', currentSeats);
    
    if (currentSeats.length === 0) {
      console.log('未选择座位，跳过校验');
      isProcessing = false;
      return;
    }
    
    // 显示加载中提示
    that.utils.toast({
      type: 'loading',
      title: '正在校验座位冲突...'
    });
    
    // 构建查询条件 - 查询时间有交叉的历史记录
    // 条件：历史记录的开始日期 < 当前结束日期 且 历史记录的结束日期 > 当前开始日期
    var searchFieldJson = {};
    
    // 执行跨应用查询
    this.dataSourceMap.crossFormQuery.load({
      appType: CONFIG.CROSS_APP.APP_TYPE,
      formUuid: CONFIG.CROSS_APP.FORM_UUID,
      searchFieldJson: JSON.stringify(searchFieldJson),
      currentPage: 1,
      pageSize: 100
    }).then(function(res) {
      console.log('跨表查询结果:', res);
      
      // 使用工具函数检查是否成功
      if (!checkApiSuccess(res)) {
        var errorMsg = getApiErrorMessage(res, '查询失败');
        console.error('跨表查询失败:', errorMsg);
        that.utils.toast({
          type: 'error',
          title: '校验失败',
          content: errorMsg
        });
        hasConflict = false;
        conflictInfo = [];
        isProcessing = false;
        return;
      }
      
      // 兼容两种数据位置
      var result = res.result || res || {};
      var dataList = result.data || res.data || [];
      var totalCount = result.totalCount || res.totalCount || dataList.length;
      
      console.log('查询到历史数据条数:', totalCount);
      
      // 检查时间交叉和座位重叠
      var conflicts = [];
      
      for (var i = 0; i < dataList.length; i++) {
        var historyRecord = dataList[i];
        var historyFormData = historyRecord.formData || historyRecord;
        
        // 获取历史记录的时间范围
        var historyStartTime = parseDateToTimestamp(historyFormData[CONFIG.FIELD_IDS.START_DATE]);
        var historyEndTime = parseDateToTimestamp(historyFormData[CONFIG.FIELD_IDS.END_DATE]);
        
        // 跳过无效的历史记录
        if (historyStartTime === 0 || historyEndTime === 0) {
          continue;
        }
        
        // 检查时间是否有交叉
        var timeOverlap = isTimeOverlap(
          currentStartTime, 
          currentEndTime, 
          historyStartTime, 
          historyEndTime
        );
        
        if (timeOverlap) {
          // 获取历史记录中的座位信息
          var historySeats = extractSeatsFromHistory(historyFormData);
          console.log('历史记录时间交叉，座位信息:', historySeats);
          
          // 检查座位是否有重叠
          for (var j = 0; j < currentSeats.length; j++) {
            var currentSeat = currentSeats[j];
            for (var k = 0; k < historySeats.length; k++) {
              var historySeat = historySeats[k];
              
              if (currentSeat.value === historySeat) {
                // 发现冲突
                conflicts.push({
                  currentSeat: currentSeat.value,
                  historySeat: historySeat,
                  historyStart: formatDate(historyStartTime),
                  historyEnd: formatDate(historyEndTime),
                  currentStart: formatDate(currentStartTime),
                  currentEnd: formatDate(currentEndTime),
                  instanceId: historyRecord.formInstId || historyRecord.id || '未知'
                });
              }
            }
          }
        }
      }
      
      console.log('冲突检测结果:', conflicts);
      
      // 判断是否存在冲突
      if (conflicts.length > 0) {
        hasConflict = true;
        conflictInfo = conflicts;
        
        // 构建提示信息
        var conflictMsg = '检测到以下座位预约冲突：\n\n';
        for (var m = 0; m < conflicts.length; m++) {
          var c = conflicts[m];
          conflictMsg += '座位【' + c.currentSeat + '】\n';
          conflictMsg += '  当前预约：' + c.currentStart + ' 至 ' + c.currentEnd + '\n';
          conflictMsg += '  历史预约：' + c.historyStart + ' 至 ' + c.historyEnd + '\n\n';
        }
        conflictMsg += '请更换座位或调整预约时间。';
        
        console.log('发现冲突，提示用户');
        
        // 弹窗提示用户
        that.utils.dialog({
          type: 'alert',
          title: '座位预约冲突',
          content: conflictMsg,
          onOk: function() {
            console.log('用户确认冲突提示');
          }
        });
        
        that.utils.toast({
          type: 'error',
          title: '存在座位冲突',
          content: '该时间段内座位已被预约'
        });
      } else {
        hasConflict = false;
        conflictInfo = [];
        console.log('无冲突，校验通过');
        
        that.utils.toast({
          type: 'success',
          title: '校验通过',
          content: '所选座位可用'
        });
      }
      
      isProcessing = false;
      
    }).catch(function(err) {
      console.error('跨表查询异常:', err);
      that.utils.toast({
        type: 'error',
        title: '校验异常',
        content: err.message || '网络错误'
      });
      hasConflict = false;
      conflictInfo = [];
      isProcessing = false;
    });
    
  } catch (error) {
    console.error('座位变更处理错误:', error);
    that.utils.toast({
      type: 'error',
      title: '处理失败',
      content: error.message
    });
    hasConflict = false;
    conflictInfo = [];
    isProcessing = false;
  }
}

/**
 * 日期变更时触发校验
 * 绑定到开始日期和结束日期字段的onChange事件
 * @param {object} event - 事件对象
 * 版本号: v1.0.0
 */
export function onDateChange(event) {
  var that = this;
  
  // 获取子表数据
  var tableField = this.$(CONFIG.FIELD_IDS.TABLE_RESERVATION);
  var tableData = tableField.getValue();
  
  // 如果子表中已有座位信息，触发校验
  var currentSeats = getSeatsFromTable(tableData);
  if (currentSeats.length > 0) {
    // 复用座位变更的校验逻辑
    onSeatChange.call(this, event);
  }
}

/**
 * 表单提交前校验
 * 绑定到提交按钮的onClick事件
 * @returns {boolean} - 是否允许提交
 * 版本号: v1.0.0
 */
export function beforeSubmit() {
  var that = this;
  
  try {
    // 获取表单字段值
    var startDateField = this.$(CONFIG.FIELD_IDS.START_DATE);
    var endDateField = this.$(CONFIG.FIELD_IDS.END_DATE);
    var tableField = this.$(CONFIG.FIELD_IDS.TABLE_RESERVATION);
    
    var startDateValue = startDateField.getValue();
    var endDateValue = endDateField.getValue();
    var tableData = tableField.getValue();
    
    // 校验必填项
    if (!startDateValue) {
      that.utils.toast({
        type: 'warning',
        title: '请填写开始日期'
      });
      return false;
    }
    
    if (!endDateValue) {
      that.utils.toast({
        type: 'warning',
        title: '请填写结束日期'
      });
      return false;
    }
    
    // 校验日期逻辑
    var currentStartTime = parseDateToTimestamp(startDateValue);
    var currentEndTime = parseDateToTimestamp(endDateValue);
    
    if (currentStartTime >= currentEndTime) {
      that.utils.toast({
        type: 'warning',
        title: '日期错误',
        content: '结束日期必须晚于开始日期'
      });
      return false;
    }
    
    // 校验子表
    var currentSeats = getSeatsFromTable(tableData);
    if (currentSeats.length === 0) {
      that.utils.toast({
        type: 'warning',
        title: '请添加预约座位'
      });
      return false;
    }
    
    // 如果存在冲突，阻止提交
    if (hasConflict && conflictInfo.length > 0) {
      // 构建提示信息
      var conflictMsg = '检测到以下座位预约冲突，无法提交：\n\n';
      for (var m = 0; m < conflictInfo.length; m++) {
        var c = conflictInfo[m];
        conflictMsg += '座位【' + c.currentSeat + '】\n';
        conflictMsg += '  当前预约：' + c.currentStart + ' 至 ' + c.currentEnd + '\n';
        conflictMsg += '  历史预约：' + c.historyStart + ' 至 ' + c.historyEnd + '\n\n';
      }
      conflictMsg += '请更换座位或调整预约时间后重试。';
      
      that.utils.dialog({
        type: 'alert',
        title: '座位预约冲突',
        content: conflictMsg
      });
      
      return false;
    }
    
    // 无冲突，允许提交
    return true;
    
  } catch (error) {
    console.error('提交前校验错误:', error);
    that.utils.toast({
      type: 'error',
      title: '校验失败',
      content: error.message
    });
    return false;
  }
}

/**
 * ===== 宜搭内操作步骤 =====
 * 
 * 【步骤1：配置远程数据源】（关键步骤，必须先完成）
 * 1. 进入宜搭应用后台，点击左侧菜单【数据源】
 * 2. 点击【添加】-->【新建远程API】，填写以下信息：
 *    - 名称：crossFormQuery（必须与代码中的名称一致）
 *    - 请求地址：/dingtalk/web/APP_RHXLY4GVACE875JP63WE/v1/form/searchFormDatas.json
 *      （已根据代码中的应用ID自动组装，直接复制使用）
 *    - 请求方式：GET
 *    - 参数配置：在UI界面不配置任何Query参数，所有参数由JS代码动态传入
 * 3. 点击【保存】完成数据源配置
 * 
 * 【步骤2：配置JS代码】
 * 1. 在宜搭表单设计器中，点击右上角【JS面板】
 * 2. 将本代码完整复制粘贴到JS编辑区域
 * 3. 点击【保存】
 * 
 * 【步骤3：配置字段事件】
 * 1. 选中【预约信息】子表中的【座位信息】下拉框字段（selectField_mmojwr9k）
 * 2. 在右侧【动作】面板中找到【onChange】事件
 * 3. 选择绑定函数：onSeatChange
 * 4. 点击【保存】
 * 
 * 【步骤4：配置日期字段事件（可选）】
 * 1. 选中【开始日期】字段（dateField_mmojwr9f）
 * 2. 在右侧【动作】面板中找到【onChange】事件
 * 3. 选择绑定函数：onDateChange
 * 4. 点击【保存】
 * 5. 对【结束日期】字段重复上述步骤
 * 
 * 【步骤5：配置提交按钮】
 * 1. 选中提交按钮（或创建一个提交按钮）
 * 2. 在右侧【动作】面板中找到【onClick】事件
 * 3. 选择绑定函数：beforeSubmit
 * 4. 点击【保存】
 * 
 * 【步骤6：测试验证】
 * 1. 预览或发布表单
 * 2. 填写【开始日期】和【结束日期】
 * 3. 在子表中添加【座位信息】（填写完成后自动触发校验）
 * 4. 如果存在时间交叉且座位重叠的情况，会弹窗提示
 * 5. 点击提交按钮，如果存在冲突会阻止提交
 * 
 * ===== 注意事项 =====
 * - 必须先配置远程数据源，否则代码无法调用跨应用查询
 * - 请求地址中的AppKey必须是当前应用的AppKey
 * - 开始日期、结束日期和座位信息为必填项
 * - 校验会在子表座位信息字段填写完成后自动触发
 * - 日期变更时如果子表已有座位信息也会触发校验
 * - 如果发现冲突，提交时会阻止提交并提示详细信息
 * 
 * 代码版本号: v1.0.0
 */
