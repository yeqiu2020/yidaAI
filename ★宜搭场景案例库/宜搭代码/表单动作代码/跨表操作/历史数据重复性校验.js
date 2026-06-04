/**
 * 作者：叶秋
 * 联系方式：15270209736
 * 来源：www.yidatrain.com
 * 历史数据重复性校验
 * 版本号: v1.0.2
 * 代码类型: formAction
 * 
 * 功能说明:
 * 根据当前表单的【成员】和【选择计划】两个字段组合进行校验，
 * 查询历史是否存在相同的记录，如果存在则弹窗提示用户，否则允许提交。
 * 当选择计划字段填写完时自动触发校验。
 * 
 * 使用说明：请查看代码末尾的"宜搭内操作步骤"
 */

// ===== 配置参数 =====
var CONFIG = {
  FIELD_IDS: {
    // 当前表单字段ID
    EMPLOYEE: 'employeeField_mmae64u7',           // 成员字段
    PLAN: 'associationFormField_mmae64u9'         // 选择计划字段
  },
  // 跨应用查询配置（查询自己）
  CROSS_APP: {
    APP_TYPE: 'APP_R6HT23I1TTQF6HONFXUP',         // 应用ID
    FORM_UUID: 'FORM-3CBDFF7D8EF04C379FF9EBFC46B57DCB5PDA'  // 计划分配ID
  }
};

// 全局锁变量，防止重复触发
var isProcessing = false;
// 校验状态标记
var isDuplicate = false;

/**
 * 页面加载完成时触发
 * 版本号: v1.0.2
 */
export function didMount() {
  console.log('历史数据重复性校验代码已加载，版本号: v1.0.2');
}

/**
 * 格式化成员字段
 * 确保成员字段格式为 {emplId: "工号", name: "姓名"}
 * @param {any} employee - 原始成员数据
 * @returns {object} - 格式化后的成员对象
 */
function formatEmployeeField(employee) {
  if (!employee) {
    return { emplId: '', name: '' };
  }
  
  // 如果已经是正确格式
  if (typeof employee === 'object' && employee.emplId) {
    return employee;
  }
  
  // 如果是数组，取第一个
  if (Array.isArray(employee) && employee.length > 0) {
    var first = employee[0];
    if (typeof first === 'object' && first.emplId) {
      return first;
    }
    if (typeof first === 'object' && first.value) {
      return { emplId: first.value, name: first.label || first.value };
    }
    return { emplId: first, name: first };
  }
  
  // 如果是字符串
  if (typeof employee === 'string') {
    return { emplId: employee, name: employee };
  }
  
  // 如果有label和value属性（对象格式）
  if (typeof employee === 'object' && employee.value) {
    return { emplId: employee.value, name: employee.label || employee.value };
  }
  
  return { emplId: '', name: '' };
}

/**
 * 获取成员字段的emplId
 * @param {any} employee - 成员字段值
 * @returns {string} - 成员emplId
 */
function getEmployeeId(employee) {
  var formatted = formatEmployeeField(employee);
  return formatted.emplId || '';
}

/**
 * 获取关联表单字段的实例ID
 * 关联表单字段返回数组格式 [{instanceId: 'FINST-xxx', title: 'xxx', ...}]
 * @param {any} planValue - 关联表单字段值
 * @returns {string} - 关联表单实例ID
 */
function getPlanInstanceId(planValue) {
  if (!planValue) {
    return '';
  }
  
  // 如果是数组，取第一个元素
  if (Array.isArray(planValue) && planValue.length > 0) {
    var first = planValue[0];
    if (typeof first === 'object') {
      // 关联表单组件使用 instanceId 字段
      if (first.instanceId) {
        return first.instanceId;
      }
      // 兼容其他可能的字段名
      if (first.value) {
        return first.value;
      }
      if (first.formInstId) {
        return first.formInstId;
      }
    }
    if (typeof first === 'string') {
      return first;
    }
    return '';
  }
  
  // 如果是字符串（直接是实例ID）
  if (typeof planValue === 'string') {
    return planValue;
  }
  
  // 如果是对象，可能有instanceId属性
  if (typeof planValue === 'object') {
    if (planValue.instanceId) {
      return planValue.instanceId;
    }
    if (planValue.value) {
      return planValue.value;
    }
    if (planValue.formInstId) {
      return planValue.formInstId;
    }
  }
  
  return '';
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
 * 选择计划字段变更时触发校验
 * 绑定到选择计划字段的onChange事件
 * @param {object} event - 事件对象
 * 版本号: v1.0.2
 */
export function onPlanChange(event) {
  var that = this;
  
  // 防止循环触发
  if (isProcessing) {
    return;
  }
  
  try {
    isProcessing = true;
    
    // 获取成员和选择计划的值
    var employeeField = this.$(CONFIG.FIELD_IDS.EMPLOYEE);
    var planField = this.$(CONFIG.FIELD_IDS.PLAN);
    
    var employeeValue = employeeField.getValue();
    var planValue = planField.getValue();
    
    console.log('字段变更 - 成员:', employeeValue, '选择计划:', planValue);
    
    // 详细打印选择计划字段的结构
    if (planValue) {
      console.log('选择计划类型:', typeof planValue);
      console.log('选择计划是否为数组:', Array.isArray(planValue));
      if (Array.isArray(planValue) && planValue.length > 0) {
        console.log('选择计划数组第一个元素:', planValue[0]);
        console.log('选择计划数组第一个元素类型:', typeof planValue[0]);
        if (typeof planValue[0] === 'object') {
          console.log('选择计划数组第一个元素keys:', Object.keys(planValue[0]));
        }
      }
    }
    
    // 获取成员ID和计划实例ID
    var employeeId = getEmployeeId(employeeValue);
    var planInstanceId = getPlanInstanceId(planValue);
    
    console.log('提取值 - 成员ID:', employeeId, '计划实例ID:', planInstanceId);
    
    // 如果任一字段为空，不执行校验
    if (!employeeId || !planInstanceId) {
      console.log('字段值不完整，跳过校验');
      isDuplicate = false;
      isProcessing = false;
      return;
    }
    
    // 构建查询条件
    var searchFieldJson = {};
    searchFieldJson[CONFIG.FIELD_IDS.EMPLOYEE] = employeeId;
    searchFieldJson[CONFIG.FIELD_IDS.PLAN] = planInstanceId;
    
    console.log('跨表查询条件:', JSON.stringify(searchFieldJson));
    
    // 显示加载中提示
    that.utils.toast({
      type: 'loading',
      title: '正在校验数据...'
    });
    
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
        isDuplicate = false;
        isProcessing = false;
        return;
      }
      
      // 兼容两种数据位置
      var result = res.result || res || {};
      var dataList = result.data || res.data || [];
      var totalCount = result.totalCount || res.totalCount || dataList.length;
      
      console.log('查询到数据条数:', totalCount);
      
      // 判断是否存在重复记录（totalCount > 0 表示存在历史记录）
      if (totalCount > 0) {
        isDuplicate = true;
        console.log('发现重复记录，提示用户');
        
        // 弹窗提示用户
        that.utils.dialog({
          type: 'alert',
          title: '重复记录提示',
          content: '该成员在此计划下已存在历史记录，请确认是否继续提交。',
          onOk: function() {
            console.log('用户确认继续');
          }
        });
        
        that.utils.toast({
          type: 'warning',
          title: '发现重复记录',
          content: '该成员在此计划下已存在历史记录'
        });
      } else {
        isDuplicate = false;
        console.log('无重复记录，校验通过');
        
        that.utils.toast({
          type: 'success',
          title: '校验通过',
          content: '未发现重复记录'
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
      isDuplicate = false;
      isProcessing = false;
    });
    
  } catch (error) {
    console.error('选择计划变更处理错误:', error);
    that.utils.toast({
      type: 'error',
      title: '处理失败',
      content: error.message
    });
    isDuplicate = false;
    isProcessing = false;
  }
}

/**
 * 表单提交前校验
 * 绑定到提交按钮的onClick事件
 * @returns {boolean} - 是否允许提交
 * 版本号: v1.0.2
 */
export function beforeSubmit() {
  var that = this;
  
  try {
    // 获取成员和选择计划的值
    var employeeField = this.$(CONFIG.FIELD_IDS.EMPLOYEE);
    var planField = this.$(CONFIG.FIELD_IDS.PLAN);
    
    var employeeValue = employeeField.getValue();
    var planValue = planField.getValue();
    
    // 获取成员ID和计划实例ID
    var employeeId = getEmployeeId(employeeValue);
    var planInstanceId = getPlanInstanceId(planValue);
    
    // 校验必填项
    if (!employeeId) {
      that.utils.toast({
        type: 'warning',
        title: '请填写成员'
      });
      return false;
    }
    
    if (!planInstanceId) {
      that.utils.toast({
        type: 'warning',
        title: '请选择计划'
      });
      return false;
    }
    
    // 如果存在重复记录，弹窗提示确认
    if (isDuplicate) {
      // 使用同步方式返回结果
      var confirmResult = false;
      
      that.utils.dialog({
        type: 'confirm',
        title: '重复记录确认',
        content: '该成员在此计划下已存在历史记录，是否确认提交？',
        onOk: function() {
          confirmResult = true;
          // 手动触发提交
          that.$('submitBtn').doAction({ action: 'submit' });
        },
        onCancel: function() {
          confirmResult = false;
        }
      });
      
      // 返回false阻止自动提交，由用户确认后手动提交
      return false;
    }
    
    // 无重复记录，允许提交
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
 *    - 请求地址：/dingtalk/web/APP_R6HT23I1TTQF6HONFXUP/v1/form/searchFormDatas.json
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
 * 1. 选中【选择计划】字段（associationFormField_mmae64u9）
 * 2. 在右侧【动作】面板中找到【onChange】事件
 * 3. 选择绑定函数：onPlanChange
 * 4. 点击【保存】
 * 
 * 【步骤4：配置提交按钮】
 * 1. 选中提交按钮（或创建一个提交按钮）
 * 2. 在右侧【动作】面板中找到【onClick】事件
 * 3. 选择绑定函数：beforeSubmit
 * 4. 点击【保存】
 * 
 * 【步骤5：测试验证】
 * 1. 预览或发布表单
 * 2. 填写【成员】字段
 * 3. 选择【选择计划】字段（填写完成后自动触发校验）
 * 4. 如果存在重复记录，会弹窗提示
 * 5. 点击提交按钮，再次确认是否提交
 * 
 * ===== 注意事项 =====
 * - 必须先配置远程数据源，否则代码无法调用跨应用查询
 * - 请求地址中的AppKey必须是当前应用的AppKey
 * - 成员和选择计划为必填项
 * - 校验会在选择计划字段填写完成后自动触发
 * - 如果发现重复记录，提交时会再次提示确认
 * 
 * 代码版本号: v1.0.2
 */